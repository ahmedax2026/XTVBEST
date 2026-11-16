import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod/v4';
import { ChannelArchiveStatusSchema } from '@tunarr/types';
import dayjs from 'dayjs';
import type { StreamDetails } from '../../stream/types.ts';

const execFileAsync = promisify(execFile);
export const ArchiveProbeSchema = z.object({
  format: z.object({ duration: z.coerce.number().positive() }),
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      index: z.number(),
      width: z.number().optional(),
      height: z.number().optional(),
      channels: z.number().optional(),
      pix_fmt: z.string().optional(),
      avg_frame_rate: z.string().optional(),
    }),
  ),
});
export type ArchiveProbe = z.infer<typeof ArchiveProbeSchema>;
const EntrySchema = z.object({
  programId: z.uuid(),
  key: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePath: z.string(),
  sourceStamp: z.string(),
  bytes: z.number().positive(),
  probe: ArchiveProbeSchema,
});
export type ArchiveEntry = z.infer<typeof EntrySchema>;
export const ArchiveManifestSchema = z.object({
  version: z.literal(1),
  generation: z.uuid(),
  channelKey: z.string(),
  status: ChannelArchiveStatusSchema,
  entries: z.array(EntrySchema),
  activeFrom: z.number().optional(),
  liveFrom: z.number().optional(),
});
export type ArchiveManifest = z.infer<typeof ArchiveManifestSchema>;

// Canonical object order keeps the identity independent of DB/JSON key order.
export function archiveKey(value: unknown): string {
  return createHash('sha256')
    .update(
      JSON.stringify(value, (_key, item: unknown) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
          );
        }
        return item;
      }),
    )
    .digest('hex');
}
export async function sourceStamp(sourcePath: string) {
  const info = await fs.stat(sourcePath);
  if (!info.isFile() || info.size === 0)
    throw new Error('Source is not a readable media file');
  return archiveKey([await fs.realpath(sourcePath), info.size, info.mtimeMs]);
}
export function archiveApplies(
  manifest: ArchiveManifest,
  programBeginMs: number,
) {
  return (
    manifest.activeFrom !== undefined &&
    programBeginMs >= manifest.activeFrom &&
    (manifest.liveFrom === undefined || programBeginMs < manifest.liveFrom)
  );
}
export function validateArchiveProbe(
  probe: ArchiveProbe,
  expected: {
    durationMs: number;
    width: number;
    height: number;
    codec: string;
  },
) {
  const video = probe.streams.find((s) => s.codec_type === 'video');
  const audio = probe.streams.find((s) => s.codec_type === 'audio');
  if (
    !video ||
    !audio ||
    video.width !== expected.width ||
    video.height !== expected.height ||
    video.codec_name !== expected.codec ||
    Math.abs(probe.format.duration * 1000 - expected.durationMs) >
      Math.max(1500, expected.durationMs * 0.01)
  ) {
    throw new Error(
      'Prepared media failed video, audio, resolution or duration validation',
    );
  }
}
export async function probeArchive(ffprobe: string, file: string) {
  const result = await execFileAsync(
    ffprobe,
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file],
    {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  return ArchiveProbeSchema.parse(JSON.parse(result.stdout));
}
export function archiveStreamDetails(probe: ArchiveProbe): StreamDetails {
  const video = probe.streams.find((s) => s.codec_type === 'video');
  const audio = probe.streams.find((s) => s.codec_type === 'audio');
  if (!video?.width || !video.height || !audio)
    throw new Error('Incomplete archive streams');
  return {
    duration: dayjs.duration(probe.format.duration, 'seconds'),
    videoDetails: [
      {
        codec: video.codec_name,
        width: video.width,
        height: video.height,
        streamIndex: video.index,
        pixelFormat: video.pix_fmt,
        framerate: video.avg_frame_rate,
        profile: undefined,
        bitDepth: 8,
        anamorphic: false,
        displayAspectRatio: `${video.width}:${video.height}`,
        bitrate: undefined,
        isAttachedPic: false,
        colorRange: undefined,
        colorSpace: undefined,
        colorTransfer: undefined,
        colorPrimaries: undefined,
      },
    ],
    audioDetails: [
      { index: audio.index, codec: audio.codec_name, channels: audio.channels },
    ],
  };
}

export class ArchiveStore {
  constructor(readonly root: string) {}
  directory(channelId: string, generation?: string) {
    z.uuid().parse(channelId);
    if (generation) z.uuid().parse(generation);
    return path.join(this.root, channelId, ...(generation ? [generation] : []));
  }
  file(channelId: string, manifest: ArchiveManifest, entry: ArchiveEntry) {
    EntrySchema.parse(entry);
    return path.join(
      this.directory(channelId, manifest.generation),
      `${entry.key}.ts`,
    );
  }
  async read(channelId: string): Promise<ArchiveManifest | undefined> {
    try {
      return ArchiveManifestSchema.parse(
        JSON.parse(
          await fs.readFile(
            path.join(this.directory(channelId), 'manifest.json'),
            'utf8',
          ),
        ),
      );
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return;
      throw error;
    }
  }
  async write(channelId: string, manifest: ArchiveManifest) {
    const directory = this.directory(channelId);
    await fs.mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `manifest-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(
        temporary,
        JSON.stringify(ArchiveManifestSchema.parse(manifest)),
      );
      await fs.rename(temporary, path.join(directory, 'manifest.json'));
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  async bytesUsed(directory = this.root): Promise<number> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return 0;
      throw error;
    }
    let bytes = 0;
    for (const entry of entries) {
      const location = path.join(directory, entry.name);
      if (entry.isDirectory()) bytes += await this.bytesUsed(location);
      else if (entry.isFile()) bytes += (await fs.stat(location)).size;
    }
    return bytes;
  }
}
