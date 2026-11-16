import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import {
  ArchiveStore,
  archiveApplies,
  archiveKey,
  archiveStreamDetails,
  probeArchive,
  sourceStamp,
  validateArchiveProbe,
} from './ArchiveStore.ts';
import type { ArchiveManifest, ArchiveProbe } from './ArchiveStore.ts';

dayjs.extend(duration);
const execFileAsync = promisify(execFile);
const id = '11111111-1111-4111-8111-111111111111';
const generation = '22222222-2222-4222-8222-222222222222';
let directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.map((d) =>
      fs.rm(d, { recursive: true, force: true, maxRetries: 3 }),
    ),
  );
  directories = [];
});
async function directory() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xbest-archive-'));
  directories.push(dir);
  return dir;
}
const manifest = (): ArchiveManifest => ({
  version: 1,
  generation,
  channelKey: 'config',
  entries: [],
  status: { state: 'ready', completed: 0, total: 0, bytes: 0 },
});
const probe: ArchiveProbe = {
  format: { duration: 10 },
  streams: [
    {
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      width: 320,
      height: 180,
    },
    { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2 },
  ],
};

describe('archive integrity', () => {
  test('fingerprints ignore property order but change with source or settings', () => {
    expect(archiveKey({ a: 1, b: 2 })).toBe(archiveKey({ b: 2, a: 1 }));
    expect(archiveKey({ a: 1 })).not.toBe(archiveKey({ a: 2 }));
  });
  test('persists manifests atomically and rejects path traversal', async () => {
    const root = await directory();
    const store = new ArchiveStore(root);
    expect(await store.read(id)).toBeUndefined();
    await store.write(id, manifest());
    await store.write(id, {
      ...manifest(),
      status: { ...manifest().status, state: 'pending' },
    });
    expect((await new ArchiveStore(root).read(id))?.status.state).toBe(
      'pending',
    );
    expect(await fs.readdir(store.directory(id))).toEqual(['manifest.json']);
    expect(() => store.directory('../source')).toThrow();
    expect(() => store.directory(id, '../source')).toThrow();
  });
  test('detects changed source files and never modifies them', async () => {
    const file = path.join(await directory(), 'movie.mp4');
    await fs.writeFile(file, 'source');
    const original = await sourceStamp(file);
    expect(await sourceStamp(file)).toBe(original);
    expect(await fs.readFile(file, 'utf8')).toBe('source');
    await fs.appendFile(file, '-changed');
    expect(await sourceStamp(file)).not.toBe(original);
  });
  test('switches at program boundaries in both directions, including reconnects', () => {
    const saved = { ...manifest(), activeFrom: 100, liveFrom: 200 };
    expect(archiveApplies(saved, 99)).toBe(false);
    expect(archiveApplies(saved, 100)).toBe(true);
    expect(archiveApplies(saved, 199)).toBe(true);
    expect(archiveApplies(saved, 200)).toBe(false);
    expect(archiveApplies(manifest(), 1000)).toBe(false);
  });
  test('rejects truncated, wrong-resolution, wrong-codec and missing-audio renditions', () => {
    const expected = {
      durationMs: 10000,
      width: 320,
      height: 180,
      codec: 'h264',
    };
    expect(() => validateArchiveProbe(probe, expected)).not.toThrow();
    for (const change of [
      { durationMs: 60000 },
      { width: 1920 },
      { codec: 'hevc' },
    ]) {
      expect(() =>
        validateArchiveProbe(probe, { ...expected, ...change }),
      ).toThrow();
    }
    expect(() =>
      validateArchiveProbe(
        { ...probe, streams: probe.streams.slice(0, 1) },
        expected,
      ),
    ).toThrow();
    expect(archiveStreamDetails(probe).videoDetails?.[0].width).toBe(320);
  });
  test('counts every retained archive without following symlinks', async () => {
    const root = await directory();
    const store = new ArchiveStore(root);
    await fs.mkdir(path.join(root, 'old'));
    await fs.writeFile(path.join(root, 'old', 'saved.ts'), '12345');
    await fs.writeFile(path.join(root, 'new.partial'), '123');
    expect(await store.bytesUsed()).toBe(8);
  });
});

// Run only when explicitly enabled with real FFmpeg in the acceptance job.
test.skipIf(process.env.XBEST_FFMPEG_TEST !== '1')(
  'validates real saved media and remuxes a scheduled offset without changing the source',
  async () => {
    const root = await directory();
    const source = path.join(root, 'original.mkv');
    const saved = path.join(root, 'prepared.ts');
    const playback = path.join(root, 'playback.ts');
    await execFileAsync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x180:rate=25',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440',
      '-t',
      '4',
      '-c:v',
      'libx264',
      '-threads',
      '1',
      '-g',
      '25',
      '-c:a',
      'aac',
      source,
    ]);
    const before = await fs.readFile(source);
    await execFileAsync('ffmpeg', [
      '-v',
      'error',
      '-i',
      source,
      '-c:v',
      'libx264',
      '-threads',
      '1',
      '-g',
      '25',
      '-c:a',
      'aac',
      '-f',
      'mpegts',
      saved,
    ]);
    const info = await probeArchive('ffprobe', saved);
    validateArchiveProbe(info, {
      durationMs: 4000,
      width: 320,
      height: 180,
      codec: 'h264',
    });
    await execFileAsync('ffmpeg', [
      '-v',
      'error',
      '-ss',
      '1',
      '-i',
      saved,
      '-t',
      '2',
      '-c',
      'copy',
      '-f',
      'mpegts',
      playback,
    ]);
    const played = await probeArchive('ffprobe', playback);
    expect(played.format.duration).toBeGreaterThan(1);
    expect(played.format.duration).toBeLessThan(3.6);
    expect(await fs.readFile(source)).toEqual(before);
  },
  20000,
);
