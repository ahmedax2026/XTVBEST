import { describe, expect, test } from 'vitest';
import { FileStreamSource } from '../../../stream/types.ts';
import { EmptyFfmpegCapabilities } from '../capabilities/FfmpegCapabilities.ts';
import { VideoStream } from '../MediaStream.ts';
import { VideoInputSource } from '../input/VideoInputSource.ts';
import { FrameDataLocation, FrameSize } from '../types.ts';
import { PixelFormatCuda, PixelFormatYuv420P } from '../format/PixelFormat.ts';
import { FrameState } from '../state/FrameState.ts';
import { FfmpegState, DefaultPipelineOptions } from '../state/FfmpegState.ts';
import { BasePipelineBuilder } from './BasePipelineBuilder.ts';

class OverlayPipeline extends BasePipelineBuilder {
  protected setupVideoFilters() {
    this.setProgramOverlay(this.desiredState);
  }
}
describe('program overlay frame transfers', () => {
  test.each([FrameDataLocation.Software, FrameDataLocation.Hardware])(
    'renders after existing video filters from %s frames',
    (location) => {
      const video = VideoInputSource.withStream(
        new FileStreamSource('/media/video.ts'),
        VideoStream.create({
          codec: 'h264',
          colorFormat: null,
          displayAspectRatio: '16:9',
          frameSize: FrameSize.FHD,
          index: 0,
          pixelFormat: new PixelFormatYuv420P(),
          providedSampleAspectRatio: '1:1',
        }),
      );
      const builder = new OverlayPipeline(
        video,
        null,
        null,
        null,
        null,
        EmptyFfmpegCapabilities,
      );
      const pipeline = builder.build(
        FfmpegState.create({
          version: {
            versionString: '7.0',
            majorVersion: 7,
            minorVersion: 0,
            patchVersion: 0,
            isUnknown: false,
          },
        }),
        new FrameState({
          scaledSize: FrameSize.FHD,
          paddedSize: FrameSize.FHD,
          isAnamorphic: false,
          frameDataLocation: location,
          programOverlayFile: '/media/countdown.ass',
          pixelFormat:
            location === FrameDataLocation.Hardware
              ? new PixelFormatCuda(new PixelFormatYuv420P())
              : new PixelFormatYuv420P(),
        }),
        DefaultPipelineOptions,
      );
      const args = pipeline.getCommandArgs();
      const filter = args[args.indexOf('-filter_complex') + 1];
      if (!filter) throw new Error('Missing filter graph');
      expect(filter).toContain('subtitles=/media/countdown.ass');
      if (location === FrameDataLocation.Hardware) {
        expect(filter.indexOf('hwdownload')).toBeLessThan(
          filter.indexOf('subtitles='),
        );
      } else expect(filter).not.toContain('hwdownload');
      expect(args).toContain('[vpresentation]');
    },
  );
});
