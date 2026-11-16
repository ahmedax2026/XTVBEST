import type { ChannelOverlay } from '@tunarr/types';
import { DefaultChannelOverlay } from '@tunarr/types';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { MpegTsOutputFormat } from '../../ffmpeg/builder/constants.ts';
import { FfmpegStreamFactory } from '../../ffmpeg/FfmpegStreamFactory.ts';
import { FfmpegInfo } from '../../ffmpeg/ffmpegInfo.ts';
import { SoftwarePipelineBuilder } from '../../ffmpeg/builder/pipeline/software/SoftwarePipelineBuilder.ts';
import { defaultTranscodeConfig } from '../../db/schema/TranscodeConfig.ts';
import type { PipelineBuilderFactory } from '../../ffmpeg/builder/pipeline/PipelineBuilderFactory.ts';
import type { VideoInputSource } from '../../ffmpeg/builder/input/VideoInputSource.ts';
import type { AudioInputSource } from '../../ffmpeg/builder/input/AudioInputSource.ts';
import type { WatermarkInputSource } from '../../ffmpeg/builder/input/WatermarkInputSource.ts';
import type { SubtitlesInputSource } from '../../ffmpeg/builder/input/SubtitlesInputSource.ts';
import type { FeatureFlagService } from '../FeatureFlagService.ts';
import type { StreamSelector } from '../../ffmpeg/StreamSelector.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  ChannelArchiveService,
  archiveChannelKey,
  nextArchiveBoundary,
} from './ChannelArchiveService.ts';
import {
  ArchiveStore,
  archiveStreamDetails,
  probeArchive,
} from './ArchiveStore.ts';
import { setGlobalOptionsUnchecked } from '../../globals.ts';
import { FileStreamSource } from '../../stream/types.ts';
import { Result } from '../../types/result.ts';
import { FfmpegProcess } from '../../ffmpeg/FfmpegProcess.ts';
import { FfmpegTranscodeSession } from '../../ffmpeg/FfmpegTrancodeSession.ts';
import type { ChannelOrm } from '../../db/schema/Channel.ts';
import type { TranscodeConfigOrm } from '../../db/schema/TranscodeConfig.ts';
import type { ContentBackedStreamLineupItem } from '../../db/derived_types/StreamLineup.ts';
import type { ReadableFfmpegSettings } from '../../db/interfaces/ISettingsDB.ts';

dayjs.extend(duration);
const execFileAsync = promisify(execFile);
const id = '11111111-1111-4111-8111-111111111111';
const programId = '22222222-2222-4222-8222-222222222222';
const channel = {
  uuid: id,
  startTime: 0,
  streamMode: 'hls',
  useEtvNext: false,
  fillerShows: [],
  watermark: null,
  icon: {},
  subtitlesEnabled: false,
  transcodeConfigId: 'profile',
} as unknown as ChannelOrm & { fillerShows: [] };
const config = {
  uuid: 'profile',
  threadCount: 0,
  videoFormat: 'h264',
  resolution: { widthPx: 320, heightPx: 180 },
} as TranscodeConfigOrm;
const options = { threads: 1, storageLimitGiB: 1 };
let root: string;
let service: ChannelArchiveService | undefined;
let source: string;
let slow = false;
let invalid = false;
type Deps = ConstructorParameters<typeof ChannelArchiveService>;
async function fixture(
  useProduction = false,
  overlay: ChannelOverlay = DefaultChannelOverlay,
) {
  source = path.join(root, 'source.mkv');
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
    'sine',
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
  const details = archiveStreamDetails(await probeArchive('ffprobe', source));
  const program = {
    uuid: programId,
    title: 'Test movie',
    duration: 4000,
    mediaSourceId: 'local',
  };
  const original = {
    streamSource: new FileStreamSource(source),
    streamDetails: details,
  };
  const channels = {
    getChannelOrm: vi.fn(async () => channel),
    loadLineup: vi.fn(async () => ({
      items: [{ type: 'content', id: programId, durationMs: 4000 }],
    })),
  };
  const factory = vi.fn(() => ({
    createStreamSession: vi.fn(async () => ({
      session: new FfmpegTranscodeSession(
        new FfmpegProcess(
          {
            ffmpegExecutablePath: 'ffmpeg',
            enableLogging: false,
            enableFileLogging: false,
          } as ReadableFfmpegSettings,
          'archive-test',
          invalid
            ? ['-invalid-option']
            : [
                '-v',
                'error',
                ...(slow ? ['-re'] : []),
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
                'pipe:1',
              ],
          root,
        ),
        dayjs.duration(4, 'seconds'),
        dayjs().add(4, 'seconds'),
      ),
      renditions: {},
    })),
  }));
  const flags = { get: () => false } as unknown as FeatureFlagService;
  const ffmpegSettings = {
    ffmpegExecutablePath: 'ffmpeg',
    ffprobeExecutablePath: 'ffprobe',
    enableLogging: false,
    enableFileLogging: false,
    scalingAlgorithm: 'bicubic',
    deinterlaceFilter: 'none',
    logLevel: 'error',
  } as ReadableFfmpegSettings;
  const productionSettings = {
    ffmpegSettings: () => ffmpegSettings,
    systemSettings: () => ({ logging: { logsDirectory: root } }),
  } as unknown as Deps[2];
  const pipelineFactory = (() => {
    let video: VideoInputSource | null = null;
    let audio: AudioInputSource | null = null;
    let watermark: WatermarkInputSource | null = null;
    let subtitle: SubtitlesInputSource | null = null;
    const builder = {
      setHardwareAccelerationMode: () => builder,
      setVideoInputSource: (value: VideoInputSource) => {
        video = value;
        return builder;
      },
      setAudioInputSource: (value: AudioInputSource | null) => {
        audio = value;
        return builder;
      },
      setWatermarkInputSource: (value: WatermarkInputSource | null) => {
        watermark = value;
        return builder;
      },
      setSubtitleInputSource: (value: SubtitlesInputSource | null) => {
        subtitle = value;
        return builder;
      },
      build: async () =>
        new SoftwarePipelineBuilder(
          video,
          audio,
          watermark,
          subtitle,
          null,
          await new FfmpegInfo('ffmpeg', 'ffprobe').getCapabilities(),
        ).setFeatureFlagService(flags),
    };
    return builder;
  }) as unknown as PipelineBuilderFactory;
  if (useProduction)
    Object.assign(config, defaultTranscodeConfig(), {
      uuid: 'profile',
      resolution: { widthPx: 320, heightPx: 180 },
      videoPreset: 'ultrafast',
      videoProfile: null,
      vaapiDriver: 'system',
      vaapiDevice: null,
      audioVolumePercent: 100,
      audioLoudnormConfig: null,
    });
  const productionFactory = (profile: TranscodeConfigOrm, owner: ChannelOrm) =>
    new FfmpegStreamFactory(
      new FfmpegInfo('ffmpeg', 'ffprobe'),
      productionSettings,
      pipelineFactory,
      flags,
      {
        selectAudioAndSubtitleStreams: async () => ({
          audioStream: details.audioDetails?.[0],
        }),
        selectSubtitleStream: async () => ({}),
      } as unknown as StreamSelector,
      profile,
      owner,
    );
  const instance = new ChannelArchiveService(
    channels as unknown as Deps[0],
    { getProgramById: vi.fn(async () => program) } as unknown as Deps[1],
    {
      ffmpegSettings: () => ({ ffprobeExecutablePath: 'ffprobe' }),
    } as unknown as Deps[2],
    { getById: vi.fn(async () => config) } as unknown as Deps[3],
    { getById: vi.fn(async () => ({})) } as unknown as Deps[4],
    {
      getStream: vi.fn(async () => Result.success(original)),
    } as unknown as Deps[5],
    { resolve: vi.fn(async () => undefined) } as unknown as Deps[6],
    (useProduction ? productionFactory : factory) as unknown as Deps[7],
    { get: async () => overlay } as unknown as Deps[8],
  );
  service = instance;
  const item = {
    type: 'program',
    program,
    duration: 4000,
    streamDuration: 4000,
    programBeginMs: 0,
    startOffset: 0,
    infiniteLoop: false,
  } as unknown as ContentBackedStreamLineupItem;
  return { instance, channels, item, original, productionFactory };
}

test('activation uses the next fixed-lineup boundary, including cycle wrap and a future start', () => {
  expect(nextArchiveBoundary(1000, [2000, 3000], 2000)).toBe(3000);
  expect(nextArchiveBoundary(1000, [2000, 3000], 3000)).toBe(6000);
  expect(nextArchiveBoundary(1000, [2000, 3000], 5999)).toBe(6000);
  expect(nextArchiveBoundary(1000, [2000, 3000], 6000)).toBe(8000);
  expect(nextArchiveBoundary(1000, [2000], 999)).toBe(1000);
  expect(() => nextArchiveBoundary(0, [], 0)).toThrow();
});

test('overlay changes invalidate saved renditions while disabled settings preserve existing archives', () => {
  expect(archiveChannelKey(channel, config, DefaultChannelOverlay)).toBe(
    archiveChannelKey(channel, config),
  );
  expect(
    archiveChannelKey(channel, config, {
      ...DefaultChannelOverlay,
      enabled: true,
    }),
  ).not.toBe(archiveChannelKey(channel, config));
});

test('archive identity follows output settings but ignores worker counts', () => {
  expect(archiveChannelKey(channel, config)).toBe(
    archiveChannelKey(channel, { ...config, threadCount: 8 }),
  );
  expect(archiveChannelKey(channel, config)).not.toBe(
    archiveChannelKey(channel, { ...config, videoFormat: 'hevc' }),
  );
});

describe.skipIf(process.env.XBEST_FFMPEG_TEST !== '1')(
  'archive service with real FFmpeg',
  () => {
    beforeEach(async () => {
      root = await fs.mkdtemp(path.join(os.tmpdir(), 'xbest-service-'));
      setGlobalOptionsUnchecked({
        database: root,
        log_level: 'error',
        verbose: 0,
      });
      slow = false;
      invalid = false;
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await service?.cancel(id);
      service = undefined;
      await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
    });
    test('prepares, survives restart, activates at a boundary and returns to live with the same channel', async () => {
      const { instance, item, original } = await fixture();
      const sourceBefore = await fs.readFile(source);
      await instance.prepare(id, options);
      await vi.waitFor(
        async () => expect((await instance.status(id)).state).toBe('ready'),
        { timeout: 15000 },
      );
      const store = new ArchiveStore(path.join(root, 'channel-archives'));
      const saved = await store.read(id);
      expect(saved?.entries).toHaveLength(1);
      expect(saved?.status.bytes).toBeGreaterThan(0);
      await instance.setMode(id, 'archive');
      const active = await store.read(id);
      if (active?.activeFrom === undefined)
        throw new Error('No activation time');
      expect(
        await instance.playback(
          channel,
          config,
          { ...item, programBeginMs: active.activeFrom - 1 },
          original,
        ),
      ).toBeUndefined();
      const played = await instance.playback(
        channel,
        config,
        { ...item, programBeginMs: active.activeFrom },
        original,
      );
      expect(played?.streamSource.path).toMatch(/\.ts$/);
      expect((await instance.status(id)).state).toBe('pending');
      vi.spyOn(Date, 'now').mockReturnValue(active.activeFrom);
      expect((await instance.status(id)).state).toBe('archived');
      // The manifest is persisted, not just an in-memory mode flag.
      expect((await new ArchiveStore(store.root).read(id))?.activeFrom).toBe(
        active.activeFrom,
      );
      await instance.setMode(id, 'live');
      const returning = await store.read(id);
      if (returning?.liveFrom === undefined) throw new Error('No return time');
      expect(
        await instance.playback(
          channel,
          config,
          { ...item, programBeginMs: returning.liveFrom },
          original,
        ),
      ).toBeUndefined();
      expect((await instance.status(id)).state).toBe('returning');
      expect(await fs.readFile(source)).toEqual(sourceBefore);
      expect(channel.uuid).toBe(id);
    }, 20000);
    test('prepares through the production FFmpeg stream factory and software pipeline', async () => {
      const processStart = vi.spyOn(FfmpegProcess.prototype, 'start');
      const { instance, item, original, productionFactory } = await fixture(
        true,
        {
          ...DefaultChannelOverlay,
          enabled: true,
          size: 96,
          horizontalMargin: 8,
          verticalMargin: 8,
          showTitle: true,
        },
      );
      await instance.prepare(id, options);
      await vi.waitFor(
        async () => expect((await instance.status(id)).state).toBe('ready'),
        { timeout: 15000 },
      );
      const preparationProcess = processStart.mock.contexts.find(
        (context): context is FfmpegProcess => context instanceof FfmpegProcess,
      );
      if (!preparationProcess)
        throw new Error('Preparation process was not started');
      expect(preparationProcess.args).not.toContain('-readrate');
      const saved = await new ArchiveStore(
        path.join(root, 'channel-archives'),
      ).read(id);
      expect(
        saved?.entries[0]?.probe.streams.some((s) => s.codec_name === 'h264'),
      ).toBe(true);
      await instance.setMode(id, 'archive');
      const activated = await new ArchiveStore(
        path.join(root, 'channel-archives'),
      ).read(id);
      if (activated?.activeFrom === undefined)
        throw new Error('Archive was not activated');
      const archived = await instance.playback(
        channel,
        config,
        { ...item, programBeginMs: activated.activeFrom },
        original,
      );
      if (!archived) throw new Error('Prepared source was not selected');
      const remux = await productionFactory(
        config,
        channel,
      ).createStreamSession({
        stream: {
          source: archived.streamSource,
          details: archived.streamDetails,
        },
        lineupItem: item,
        options: {
          encoding: { mode: 'remux' },
          offlinePreparation: true,
          outputFormat: MpegTsOutputFormat,
          startTime: dayjs.duration(1, 'seconds'),
          duration: dayjs.duration(2, 'seconds'),
          streamMode: 'hls',
        },
      });
      if (!remux) throw new Error('No remux session');
      expect(remux.session.process.args).toContain('copy');
      const playbackFile = path.join(root, 'verified-playback.ts');
      const output = createWriteStream(playbackFile);
      remux.session.on('error', () =>
        output.destroy(new Error('Remux failed')),
      );
      const stream = remux.session.process.start();
      if (!stream) throw new Error('No playback stream');
      await pipeline(stream, output);
      await remux.session.exited;
      const playback = await probeArchive('ffprobe', playbackFile);
      expect(playback.format.duration).toBeGreaterThan(1);
      expect(playback.format.duration).toBeLessThan(3.6);
    }, 20000);

    test('refuses clipped saved countdowns and invalidates an archive after overlay edits', async () => {
      const overlay = { ...DefaultChannelOverlay, enabled: true };
      const { instance, channels, item, original } = await fixture(
        false,
        overlay,
      );
      channels.loadLineup.mockResolvedValueOnce({
        items: [{ type: 'content', id: programId, durationMs: 2000 }],
      });
      await expect(instance.prepare(id, options)).rejects.toThrow(
        'full-length',
      );
      await instance.prepare(id, options);
      await vi.waitFor(
        async () => expect((await instance.status(id)).state).toBe('ready'),
        { timeout: 15000 },
      );
      await instance.setMode(id, 'archive');
      const manifest = await new ArchiveStore(
        path.join(root, 'channel-archives'),
      ).read(id);
      if (manifest?.activeFrom === undefined)
        throw new Error('No activation time');
      overlay.style = 'pill';
      expect((await instance.status(id)).state).toBe('failed');
      expect(
        await instance.playback(
          channel,
          config,
          { ...item, programBeginMs: manifest.activeFrom },
          original,
        ),
      ).toBeUndefined();
    }, 20000);

    test('cancels preparation, rejects concurrent work and preserves original media', async () => {
      slow = true;
      const { instance } = await fixture();
      const before = await fs.readFile(source);
      await instance.prepare(id, options);
      await expect(instance.prepare(id, options)).rejects.toThrow(
        'Another archive operation',
      );
      await instance.cancel(id);
      expect((await instance.status(id)).state).toBe('failed');
      expect(await fs.readFile(source)).toEqual(before);
      const saved = await new ArchiveStore(
        path.join(root, 'channel-archives'),
      ).read(id);
      expect(saved?.entries).toEqual([]);
    });
    test('refuses activation if source files or channel settings changed', async () => {
      const { instance, channels } = await fixture();
      await instance.prepare(id, options);
      await vi.waitFor(
        async () => expect((await instance.status(id)).state).toBe('ready'),
        { timeout: 15000 },
      );
      channels.getChannelOrm.mockResolvedValueOnce({
        ...channel,
        streamMode: 'mpegts',
      });
      await expect(instance.setMode(id, 'archive')).rejects.toThrow();
      await fs.appendFile(source, 'changed');
      await expect(instance.setMode(id, 'archive')).rejects.toThrow();
    }, 20000);
    test('enforces the total retained-storage budget before publishing output', async () => {
      const { instance } = await fixture();
      const archiveRoot = path.join(root, 'channel-archives');
      await fs.mkdir(archiveRoot, { recursive: true });
      const pinned = path.join(archiveRoot, 'pinned.ts');
      await fs.writeFile(pinned, '');
      await fs.truncate(pinned, 1024 ** 3);
      await instance.prepare(id, options);
      await vi.waitFor(
        async () => expect((await instance.status(id)).state).toBe('failed'),
        { timeout: 15000 },
      );
      expect((await fs.stat(pinned)).size).toBe(1024 ** 3);
      const manifest = await new ArchiveStore(archiveRoot).read(id);
      expect(manifest?.entries).toEqual([]);
    }, 20000);

    test('encoder failure leaves live playback available and never activates partial output', async () => {
      invalid = true;
      const { instance, item, original } = await fixture();
      await instance.prepare(id, options);
      await vi.waitFor(
        async () => expect((await instance.status(id)).state).toBe('failed'),
        { timeout: 15000 },
      );
      expect(
        await instance.playback(channel, config, item, original),
      ).toBeUndefined();
      await expect(instance.setMode(id, 'archive')).rejects.toThrow(
        'Archive is not ready',
      );
    }, 20000);
  },
);
