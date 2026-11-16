import { InjectLogger } from '../../util/inject.ts';
import type { Logger } from '../../util/logging/LoggerFactory.ts';
import { inject, injectable } from 'inversify';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import dayjs from 'dayjs';
import type {
  ChannelArchiveOptions,
  ChannelArchiveStatus,
} from '@tunarr/types';
import { ChannelArchiveOptionsSchema } from '@tunarr/types';
import type { IChannelDB } from '../../db/interfaces/IChannelDB.ts';
import type { IProgramDB } from '../../db/interfaces/IProgramDB.ts';
import type { ISettingsDB } from '../../db/interfaces/ISettingsDB.ts';
import type { ChannelOrm } from '../../db/schema/Channel.ts';
import type { TranscodeConfigOrm } from '../../db/schema/TranscodeConfig.ts';
import type { ContentBackedStreamLineupItem } from '../../db/derived_types/StreamLineup.ts';
import { MediaSourceDB } from '../../db/mediaSourceDB.ts';
import { TranscodeConfigDB } from '../../db/TranscodeConfigDB.ts';
import type { FFmpegAssistedFactory } from '../../ffmpeg/FFmpegModule.ts';
import type { FfmpegTranscodeSession } from '../../ffmpeg/FfmpegTrancodeSession.ts';
import { MpegTsOutputFormat } from '../../ffmpeg/builder/constants.ts';
import { globalOptions } from '../../globals.ts';
import { ProgramStreamDetailsFetcher } from '../../stream/ProgramStreamDetailsFetcher.ts';
import { WatermarkResolver } from '../../stream/WatermarkResolver.ts';
import type { ProgramStreamResult } from '../../stream/types.ts';
import { FileStreamSource } from '../../stream/types.ts';
import { KEYS } from '../../types/inject.ts';
import {
  ArchiveStore,
  archiveKey,
  archiveApplies,
  sourceStamp,
  probeArchive,
  archiveStreamDetails,
  validateArchiveProbe,
} from './ArchiveStore.ts';
import type { ArchiveManifest, ArchiveEntry } from './ArchiveStore.ts';

const liveStatus: ChannelArchiveStatus = {
  state: 'live',
  completed: 0,
  total: 0,
  bytes: 0,
};
// Changing worker counts does not change the rendition's identity.
export function archiveChannelKey(
  channel: ChannelOrm,
  config: TranscodeConfigOrm,
) {
  return archiveKey({
    channel: {
      watermark: channel.watermark,
      icon: channel.icon,
      subtitlesEnabled: channel.subtitlesEnabled,
      streamSelectionProfileId: channel.streamSelectionProfileId,
      transcodeConfigId: channel.transcodeConfigId,
      streamMode: channel.streamMode,
      useEtvNext: channel.useEtvNext,
    },
    config: { ...config, threadCount: 0 },
  });
}

// Resolve the next boundary from the fixed repeating lineup. No active FFmpeg
// process needs to be stopped or restarted to request a mode switch.
export function nextArchiveBoundary(
  start: number,
  durations: readonly number[],
  now: number,
) {
  const cycle = durations.reduce((sum, duration) => sum + duration, 0);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(cycle) ||
    cycle <= 0 ||
    durations.some((d) => d <= 0)
  ) {
    throw new Error('Invalid fixed channel schedule');
  }
  if (now < start) return start;
  const elapsed = (now - start) % cycle;
  let end = 0;
  for (const duration of durations) {
    end += duration;
    if (end > elapsed) return now + end - elapsed;
  }
  return now + cycle;
}

type Job = { controller: AbortController; done?: Promise<void> };
@injectable()
export class ChannelArchiveService {
  @InjectLogger() declare private readonly logger: Logger;
  private store?: ArchiveStore;
  private jobs = new Map<string, Job>();
  private mutations = new Set<string>();
  constructor(
    @inject(KEYS.ChannelDB) private channels: IChannelDB,
    @inject(KEYS.ProgramDB) private programs: IProgramDB,
    @inject(KEYS.SettingsDB) private settings: ISettingsDB,
    @inject(TranscodeConfigDB) private profiles: TranscodeConfigDB,
    @inject(MediaSourceDB) private mediaSources: MediaSourceDB,
    @inject(ProgramStreamDetailsFetcher)
    private details: ProgramStreamDetailsFetcher,
    @inject(WatermarkResolver) private watermarks: WatermarkResolver,
    @inject(KEYS.FFmpegFactory) private ffmpeg: FFmpegAssistedFactory,
  ) {}
  private get archiveStore() {
    return (this.store ??= new ArchiveStore(
      path.join(globalOptions().databaseDirectory, 'channel-archives'),
    ));
  }
  private async channelConfig(channelId: string) {
    const channel = await this.channels.getChannelOrm(channelId);
    if (!channel) throw new Error('Channel not found');
    const config = await this.profiles.getById(channel.transcodeConfigId);
    if (!config) throw new Error('Transcode profile not found');
    return { channel, config };
  }
  async status(channelId: string): Promise<ChannelArchiveStatus> {
    const manifest = await this.archiveStore.read(channelId);
    if (!manifest) return { ...liveStatus };
    if (manifest.status.state === 'preparing' && !this.jobs.has(channelId)) {
      manifest.status.state = 'failed';
      manifest.status.error =
        'Preparation was interrupted. Prepare again to retry.';
      await this.archiveStore.write(channelId, manifest);
    }
    const state =
      manifest.liveFrom !== undefined && Date.now() >= manifest.liveFrom
        ? 'live'
        : manifest.activeFrom !== undefined && Date.now() >= manifest.activeFrom
          ? manifest.liveFrom === undefined
            ? 'archived'
            : 'returning'
          : manifest.status.state;
    if (state === 'ready' || state === 'pending' || state === 'archived') {
      try {
        const { channel, config } = await this.channelConfig(channelId);
        if (archiveChannelKey(channel, config) !== manifest.channelKey)
          throw new Error('Settings changed');
        for (const entry of manifest.entries)
          await this.validateEntry(channelId, manifest, entry);
        const lineup = await this.channels.loadLineup(channelId);
        if (
          lineup.items.some(
            (item) =>
              item.type !== 'content' ||
              !manifest.entries.some((entry) => entry.programId === item.id),
          )
        ) {
          throw new Error('Lineup changed');
        }
      } catch {
        return {
          ...manifest.status,
          state: 'failed',
          error: 'Prepared assets are stale. Return to live and prepare again.',
        };
      }
    }
    return { ...manifest.status, state };
  }
  async prepare(channelId: string, input: ChannelArchiveOptions) {
    const options = ChannelArchiveOptionsSchema.parse(input);
    // One bounded preparation process per server; live channels remain available.
    if (this.jobs.size || this.mutations.size)
      throw new Error('Another archive operation is running');
    const job: Job = { controller: new AbortController() };
    this.jobs.set(channelId, job);
    try {
      const { channel, config } = await this.channelConfig(channelId);
      if (
        channel.useEtvNext ||
        !['hls', 'mpegts'].includes(channel.streamMode)
      ) {
        throw new Error(
          'Archive preparation requires the built-in HLS or MPEG-TS engine',
        );
      }
      const previous = await this.archiveStore.read(channelId);
      if (
        previous?.activeFrom !== undefined &&
        previous.liveFrom === undefined
      ) {
        throw new Error('Return to live before replacing an active archive');
      }
      const lineup = await this.channels.loadLineup(channelId);
      if (
        lineup.onDemandConfig ||
        !lineup.items.length ||
        lineup.items.some((item) => item.type !== 'content') ||
        channel.fillerShows.length
      ) {
        throw new Error(
          'Archive preparation requires a fixed content lineup without redirects or random fillers',
        );
      }
      const ids = [
        ...new Set(
          lineup.items
            .filter((item) => item.type === 'content')
            .map((item) => item.id),
        ),
      ];
      const manifest: ArchiveManifest = {
        version: 1,
        generation: randomUUID(),
        channelKey: archiveChannelKey(channel, config),
        entries: [],
        status: {
          state: 'preparing',
          completed: 0,
          total: ids.length,
          bytes: 0,
        },
      };
      await this.archiveStore.write(channelId, manifest);
      job.done = this.run(
        channelId,
        channel,
        config,
        ids,
        options,
        manifest,
        job.controller.signal,
      )
        .catch(async (error: unknown) => {
          if (!job.controller.signal.aborted)
            this.logger.error(
              error,
              'Archive preparation failed for channel %s',
              channelId,
            );
          manifest.status.state = 'failed';
          manifest.status.error = job.controller.signal.aborted
            ? 'Preparation cancelled. Live playback is unchanged.'
            : 'Preparation failed. Check source files, storage space, FFmpeg and the selected profile.';
          delete manifest.status.currentTitle;
          await this.archiveStore.write(channelId, manifest);
        })
        .finally(() => {
          this.jobs.delete(channelId);
        });
      // Observe persistence errors without creating an unhandled rejection.
      void job.done.catch(() => {});
      return manifest.status;
    } catch (error) {
      this.jobs.delete(channelId);
      throw error;
    }
  }
  private async run(
    channelId: string,
    channel: ChannelOrm,
    config: TranscodeConfigOrm,
    ids: string[],
    options: ChannelArchiveOptions,
    manifest: ArchiveManifest,
    signal: AbortSignal,
  ) {
    const directory = this.archiveStore.directory(
      channelId,
      manifest.generation,
    );
    await fs.mkdir(directory, { recursive: true });
    const limit = options.storageLimitGiB * 1024 ** 3;
    let used = await this.archiveStore.bytesUsed();
    for (const id of ids) {
      signal.throwIfAborted();
      const program = await this.programs.getProgramById(id);
      if (!program?.mediaSourceId) throw new Error('Missing program source');
      const server = await this.mediaSources.getById(program.mediaSourceId);
      if (!server) throw new Error('Missing media source');
      const resolved = (
        await this.details.getStream({
          server,
          lineupItem: { ...program, mediaSourceId: program.mediaSourceId },
        })
      ).get();
      if (resolved.streamSource.type !== 'file')
        throw new Error(
          'Archive preparation currently requires local media files',
        );
      const sourcePath = resolved.streamSource.path;
      const stamp = await sourceStamp(sourcePath);
      const item: ContentBackedStreamLineupItem = {
        type: 'program',
        program: { ...program, mediaSourceId: program.mediaSourceId },
        duration: program.duration,
        streamDuration: program.duration,
        programBeginMs: 0,
        startOffset: 0,
        infiniteLoop: false,
      };
      const watermark = await this.watermarks.resolve({
        channel,
        transcodeConfig: config,
        lineupItem: item,
      });
      const key = archiveKey([id, stamp, manifest.channelKey]);
      const temporary = path.join(directory, `${key}.partial`);
      const target = path.join(directory, `${key}.ts`);
      manifest.status.currentTitle = program.title;
      await this.archiveStore.write(channelId, manifest);
      let session: FfmpegTranscodeSession | undefined;
      try {
        const result = await this.ffmpeg(
          { ...config, threadCount: options.threads },
          channel,
        ).createStreamSession({
          stream: {
            source: resolved.streamSource,
            details: resolved.streamDetails,
          },
          lineupItem: item,
          options: {
            startTime: dayjs.duration(0),
            duration: dayjs.duration(program.duration),
            outputFormat: MpegTsOutputFormat,
            realtime: false,
            offlinePreparation: true,
            streamMode: channel.streamMode,
            watermark,
          },
        });
        if (!result) throw new Error('Could not create preparation process');
        session = result.session;
        const process = session.process;
        let bytes = 0;
        const budget = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            if (used + bytes > limit)
              callback(new Error('Archive storage limit reached'));
            else callback(null, chunk);
          },
        });
        const output = createWriteStream(temporary, { flags: 'wx' });
        const abort = () => {
          process.kill();
          output.destroy(new Error('Preparation cancelled'));
        };
        signal.addEventListener('abort', abort, { once: true });
        try {
          signal.throwIfAborted();
          let exitCode: number | null = null;
          process.on('exit', (code) => {
            exitCode = code;
          });
          session.on('error', () =>
            output.destroy(new Error('Preparation encoder failed')),
          );
          const raw = process.start();
          if (!raw) throw new Error('Encoder could not start');
          await pipeline(raw, budget, output, { signal });
          await process.exited;
          if (exitCode !== 0)
            throw new Error('Preparation encoder exited unsuccessfully');
          signal.throwIfAborted();
        } finally {
          signal.removeEventListener('abort', abort);
        }
        const probe = await probeArchive(
          this.settings.ffmpegSettings().ffprobeExecutablePath,
          temporary,
        );
        validateArchiveProbe(probe, {
          durationMs: program.duration,
          width: config.resolution.widthPx,
          height: config.resolution.heightPx,
          codec: config.videoFormat,
        });
        if ((await sourceStamp(sourcePath)) !== stamp)
          throw new Error('Source changed during preparation');
        await fs.rename(temporary, target);
        used += bytes;
        manifest.entries.push({
          programId: id,
          key,
          sourcePath,
          sourceStamp: stamp,
          bytes,
          probe,
        });
        manifest.status.completed += 1;
        manifest.status.bytes += bytes;
        await this.archiveStore.write(channelId, manifest);
      } finally {
        session?.kill();
        await session?.exited;
        await fs.rm(temporary, { force: true, maxRetries: 3 });
      }
    }
    signal.throwIfAborted();
    const current = await this.channelConfig(channelId);
    if (
      archiveChannelKey(current.channel, current.config) !== manifest.channelKey
    )
      throw new Error('Channel settings changed');
    manifest.status.state = 'ready';
    delete manifest.status.currentTitle;
    await this.archiveStore.write(channelId, manifest);
  }
  async shutdown() {
    for (const job of this.jobs.values()) job.controller.abort();
    await Promise.allSettled(
      [...this.jobs.values()].map((job) => job.done ?? Promise.resolve()),
    );
  }

  async cancel(channelId: string) {
    const job = this.jobs.get(channelId);
    job?.controller.abort();
    await job?.done;
    return this.status(channelId);
  }
  async setMode(channelId: string, mode: 'archive' | 'live') {
    if (this.jobs.has(channelId) || this.mutations.has(channelId))
      throw new Error('Archive operation is still running');
    this.mutations.add(channelId);
    try {
      const manifest = await this.archiveStore.read(channelId);
      if (!manifest) throw new Error('Prepare an archive first');
      if (mode === 'archive') {
        const currentStatus = await this.status(channelId);
        if (currentStatus.state !== 'ready' && currentStatus.state !== 'live')
          throw new Error('Archive is not ready');
        const { channel, config } = await this.channelConfig(channelId);
        if (archiveChannelKey(channel, config) !== manifest.channelKey)
          throw new Error('Settings changed. Prepare again.');
        const lineup = await this.channels.loadLineup(channelId);
        for (const item of lineup.items) {
          if (item.type !== 'content')
            throw new Error('The lineup changed. Prepare again.');
          const entry = manifest.entries.find((e) => e.programId === item.id);
          if (!entry) throw new Error('The lineup changed. Prepare again.');
          await this.validateEntry(channelId, manifest, entry);
        }
        manifest.activeFrom = nextArchiveBoundary(
          channel.startTime,
          lineup.items.map((item) => item.durationMs),
          Date.now(),
        );
        delete manifest.liveFrom;
        manifest.status.state = 'pending';
      } else {
        const { channel } = await this.channelConfig(channelId);
        const lineup = await this.channels.loadLineup(channelId);
        manifest.liveFrom = nextArchiveBoundary(
          channel.startTime,
          lineup.items.map((item) => item.durationMs),
          Date.now(),
        );
        manifest.status.state = 'returning';
      }
      await this.archiveStore.write(channelId, manifest);
      return manifest.status;
    } finally {
      this.mutations.delete(channelId);
    }
  }
  private async validateEntry(
    channelId: string,
    manifest: ArchiveManifest,
    entry: ArchiveEntry,
  ) {
    if ((await sourceStamp(entry.sourcePath)) !== entry.sourceStamp)
      throw new Error('Source changed. Prepare again.');
    const file = this.archiveStore.file(channelId, manifest, entry);
    if ((await fs.stat(file)).size !== entry.bytes)
      throw new Error('Prepared file is missing or changed');
    return file;
  }
  // Called for each program/chunk. Activation timestamps keep all sessions on
  // the old mode until that program ends, including late/reconnecting clients.
  async playback(
    channel: ChannelOrm,
    config: TranscodeConfigOrm,
    item: ContentBackedStreamLineupItem,
    original: ProgramStreamResult,
  ): Promise<ProgramStreamResult | undefined> {
    try {
      const manifest = await this.archiveStore.read(channel.uuid);
      if (!manifest) return;
      if (!archiveApplies(manifest, item.programBeginMs)) return;
      if (
        archiveChannelKey(channel, config) !== manifest.channelKey ||
        original.streamSource.type !== 'file'
      )
        return;
      const entry = manifest.entries.find(
        (e) =>
          e.programId === item.program.uuid &&
          e.sourcePath === original.streamSource.path,
      );
      if (!entry) return;
      const file = await this.validateEntry(channel.uuid, manifest, entry);
      return {
        streamSource: new FileStreamSource(file),
        streamDetails: archiveStreamDetails(entry.probe),
      };
    } catch {
      // A stale/missing asset must never take down a working live channel.
      return;
    }
  }
}
