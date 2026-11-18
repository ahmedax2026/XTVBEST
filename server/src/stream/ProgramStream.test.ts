import { describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import { DefaultChannelOverlay } from '@tunarr/types';
import type { ChannelArchiveService } from '../services/archive/ChannelArchiveService.ts';
import type { ChannelOverlayService } from '../services/overlay/ChannelOverlayService.ts';
import type { WatermarkResolver } from './WatermarkResolver.ts';
import type { FfmpegTranscodeSession } from '../ffmpeg/FfmpegTrancodeSession.ts';
import type { ISettingsDB } from '../db/interfaces/ISettingsDB.ts';
import type { MediaSourceDB } from '../db/mediaSourceDB.ts';
import {
  HlsOutputFormat,
  defaultHlsOptions,
} from '../ffmpeg/builder/constants.ts';
import type { FFmpegAssistedFactory } from '../ffmpeg/FFmpegModule.ts';
import type { TranscodeSessionResult } from '../ffmpeg/types.ts';
import type { Result } from '../types/result.ts';
import type { PlayerContext } from './PlayerStreamContext.ts';
import { ProgramStream } from './ProgramStream.ts';
import type { ProgramStreamDetailsFetcher } from './ProgramStreamDetailsFetcher.ts';
dayjs.extend(duration);

class ThrowingProgramStream extends ProgramStream {
  protected override setupInternal(): Promise<Result<TranscodeSessionResult>> {
    return Promise.reject(
      new Error('Streams with no video are not currently supported.'),
    );
  }
}

describe('ProgramStream', () => {
  it('turns a setup throw into a failed result', async () => {
    const stream = new ThrowingProgramStream(
      {} as ISettingsDB,
      {} as WatermarkResolver,
      {} as FFmpegAssistedFactory,
      {} as MediaSourceDB,
      {} as ProgramStreamDetailsFetcher,
      [],
      {} as ChannelArchiveService,
      {} as ChannelOverlayService,
      {} as PlayerContext,
      HlsOutputFormat(defaultHlsOptions),
    );

    const result = await stream.setup();

    expect(result.isFailure()).toBe(true);
    expect(stream.isInitialized()).toBe(false);
  });
  it('resumes a five-second bumper without subtracting the elapsed offset a second time', async () => {
    const session = { on: vi.fn() } as unknown as FfmpegTranscodeSession;
    const createPlaceholderSession = vi.fn(async () => ({
      session,
      renditions: { audio: [] },
    }));
    const factory = (() => ({
      createPlaceholderSession,
    })) as unknown as FFmpegAssistedFactory;
    const context = {
      lineupItem: {
        type: 'offline',
        studioBumper: true,
        duration: 2200,
        streamDuration: 2200,
        startOffset: 2800,
        programBeginMs: 1000,
      },
      transcodeConfig: {},
      targetChannel: { uuid: 'channel' },
    } as unknown as PlayerContext;
    const overlays = {
      get: async () => ({
        ...DefaultChannelOverlay,
        enabled: true,
        studioBumper: true,
      }),
    } as unknown as ChannelOverlayService;
    const stream = new ProgramStream(
      {} as ISettingsDB,
      {} as WatermarkResolver,
      factory,
      {} as MediaSourceDB,
      {} as ProgramStreamDetailsFetcher,
      [],
      {} as ChannelArchiveService,
      overlays,
      context,
      HlsOutputFormat(defaultHlsOptions),
    );
    expect((await stream.setup()).isSuccess()).toBe(true);
    expect(createPlaceholderSession).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'bumper',
        duration: dayjs.duration(2200),
      }),
    );
  });
});
