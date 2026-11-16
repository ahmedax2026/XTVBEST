import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DefaultChannelOverlay } from '@tunarr/types';
import { setGlobalOptionsUnchecked } from '../../globals.ts';
import { FfmpegInfo } from '../../ffmpeg/ffmpegInfo.ts';
import { FfmpegCapabilities } from '../../ffmpeg/builder/capabilities/FfmpegCapabilities.ts';
import { ChannelOverlayService } from './ChannelOverlayService.ts';

const id = '11111111-1111-4111-8111-111111111111';
type Deps = ConstructorParameters<typeof ChannelOverlayService>;
let root: string;
const channel = { uuid: id, streamMode: 'hls', useEtvNext: false };
function fixture() {
  const channels = { getChannelOrm: vi.fn(async () => channel) };
  const settings = {
    ffmpegSettings: () => ({
      ffmpegExecutablePath: 'ffmpeg',
      ffprobeExecutablePath: 'ffprobe',
    }),
  };
  return {
    channels,
    service: new ChannelOverlayService(
      channels as unknown as Deps[0],
      settings as unknown as Deps[1],
    ),
  };
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'xbest-overlay-config-'));
  setGlobalOptionsUnchecked({ database: root, log_level: 'error', verbose: 0 });
  vi.spyOn(FfmpegInfo.prototype, 'getCapabilities').mockResolvedValue(
    new FfmpegCapabilities(
      new Set(),
      new Map(),
      new Set(['subtitles']),
      new Set(),
    ),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
});
test('starts disabled, saves per channel and restores settings on restart', async () => {
  const { service } = fixture();
  expect(await service.get(id)).toEqual(DefaultChannelOverlay);
  const config = {
    ...DefaultChannelOverlay,
    enabled: true,
    style: 'bar' as const,
    opacity: 0.5,
  };
  await service.save(id, config);
  expect(await fixture().service.get(id)).toEqual(config);
  expect(await fs.readdir(path.join(root, 'channel-overlays'))).toEqual([
    `${id}.json`,
  ]);
});
test('rejects incompatible engines and leaves existing settings intact', async () => {
  const { channels, service } = fixture();
  await service.save(id, DefaultChannelOverlay);
  channels.getChannelOrm.mockResolvedValue({
    ...channel,
    streamMode: 'hls_direct',
  });
  await expect(
    service.save(id, { ...DefaultChannelOverlay, enabled: true }),
  ).rejects.toThrow();
  expect((await service.get(id)).enabled).toBe(false);
});
test('checks actual FFmpeg capabilities before enabling', async () => {
  vi.mocked(FfmpegInfo.prototype.getCapabilities).mockResolvedValueOnce(
    new FfmpegCapabilities(new Set(), new Map(), new Set(), new Set()),
  );
  await expect(
    fixture().service.save(id, { ...DefaultChannelOverlay, enabled: true }),
  ).rejects.toThrow('subtitle-filter');
});
test('rejects unsafe file identifiers and malformed settings', async () => {
  const { service } = fixture();
  await expect(service.get('../outside')).rejects.toThrow();
  await expect(
    service.save(id, { ...DefaultChannelOverlay, size: -1 }),
  ).rejects.toThrow();
});
