import { describe, expect, test, vi } from 'vitest';
import {
  AutoHardwareAcceleration,
  hardwareProbeArgs,
} from './AutoHardwareAcceleration.ts';

const config = {
  autoHardwareAcceleration: true,
  hardwareAccelerationMode: 'none' as const,
  videoFormat: 'h264' as const,
  videoBitDepth: 8 as const,
  vaapiDevice: null,
  vaapiDriver: 'system' as const,
};

describe('automatic hardware selection', () => {
  test('leaves explicit CPU/GPU profiles untouched', async () => {
    const probe = vi.fn();
    const resolver = new AutoHardwareAcceleration(probe);
    const manual = { ...config, autoHardwareAcceleration: false };
    expect(await resolver.resolve(manual, '/ffmpeg')).toBe(manual);
    expect(probe).not.toHaveBeenCalled();
  });

  test('selects a working GPU without mutating the saved config', async () => {
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new Error('No NVIDIA GPU'))
      .mockResolvedValue(undefined);
    const resolver = new AutoHardwareAcceleration(probe, 'win32');
    const selected = await resolver.resolve(config, '/ffmpeg');
    expect(selected.hardwareAccelerationMode).toBe('qsv');
    expect(selected).toMatchObject({
      disableHardwareDecoder: true,
      disableHardwareFilters: true,
      disableHardwareEncoding: false,
    });
    expect(config.hardwareAccelerationMode).toBe('none');
    expect(probe).toHaveBeenCalledTimes(2);
  });

  test('falls back to CPU when all real encode probes fail', async () => {
    const probe = vi.fn().mockRejectedValue(new Error('No device'));
    const resolver = new AutoHardwareAcceleration(probe, 'linux');
    expect(
      (await resolver.resolve(config, '/ffmpeg')).hardwareAccelerationMode,
    ).toBe('none');
    expect(probe).toHaveBeenCalledTimes(3);
  });

  test('shares concurrent probes, expires the cache and separates codecs', async () => {
    let now = 0;
    const probe = vi.fn().mockResolvedValue(undefined);
    const resolver = new AutoHardwareAcceleration(probe, 'linux', () => now);
    await Promise.all([
      resolver.resolve(config, '/ffmpeg'),
      resolver.resolve(config, '/ffmpeg'),
    ]);
    expect(probe).toHaveBeenCalledTimes(1);
    await resolver.resolve({ ...config, videoFormat: 'hevc' }, '/ffmpeg');
    await resolver.resolve(config, '/other-ffmpeg');
    expect(probe).toHaveBeenCalledTimes(3);
    now = 60_001;
    await resolver.resolve(config, '/ffmpeg');
    expect(probe).toHaveBeenCalledTimes(4);
  });

  test('uses VAAPI upload, selected device, bit depth, and case-sensitive driver', async () => {
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new Error())
      .mockRejectedValueOnce(new Error())
      .mockResolvedValue(undefined);
    const resolver = new AutoHardwareAcceleration(probe, 'linux');
    const custom = {
      ...config,
      videoFormat: 'hevc' as const,
      videoBitDepth: 10 as const,
      vaapiDevice: '/dev/dri/renderD129',
      vaapiDriver: 'ihd' as const,
    };
    expect(
      (await resolver.resolve(custom, '/ffmpeg')).hardwareAccelerationMode,
    ).toBe('vaapi');
    expect(probe.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining([
        '-vaapi_device',
        '/dev/dri/renderD129',
        'format=p010le,hwupload',
        'hevc_vaapi',
      ]),
    );
    expect(probe.mock.calls[2]?.[2]).toMatchObject({
      LIBVA_DRIVER_NAME: 'iHD',
    });
  });

  test('requires hardware encoding on Apple rather than software emulation', () => {
    expect(hardwareProbeArgs(config, 'videotoolbox')).toEqual(
      expect.arrayContaining(['-allow_sw', '0']),
    );
  });
});
