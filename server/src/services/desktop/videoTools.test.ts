import { describe, expect, test, vi } from 'vitest';
import { ensureVideoTools, supportedVideoVersion } from './videoTools.ts';

describe('XBEST video tool discovery', () => {
  test('accepts supported releases and rejects old or unrecognizable output', () => {
    expect(supportedVideoVersion('ffmpeg version 6.1.2')).toBe(true);
    expect(supportedVideoVersion('ffprobe version n8.1-123')).toBe(true);
    expect(supportedVideoVersion('ffmpeg version 6.0')).toBe(false);
    expect(supportedVideoVersion('not ffmpeg')).toBe(false);
  });
  test('uses healthy configured tools without downloading or replacing them', async () => {
    const existing = { ffmpegExecutablePath: 'existing-ffmpeg', ffprobeExecutablePath: 'existing-ffprobe' };
    const probe = vi.fn(async () => true);
    const install = vi.fn();
    expect(await ensureVideoTools(existing, '/unused', { probe, install })).toEqual(existing);
    expect(install).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledTimes(2);
  });
  test('keeps a healthy tool and only changes the missing tool path', async () => {
    const installed = { ffmpegExecutablePath: 'new-ffmpeg', ffprobeExecutablePath: 'new-ffprobe' };
    const probe = vi.fn(async (p: string) => p === 'existing-ffmpeg');
    const install = vi.fn(async () => installed);
    const result = await ensureVideoTools({
      ffmpegExecutablePath: 'existing-ffmpeg', ffprobeExecutablePath: 'missing-ffprobe',
    }, '/unused', { probe, install });
    expect(result).toEqual({ ffmpegExecutablePath: 'existing-ffmpeg', ffprobeExecutablePath: 'new-ffprobe' });
    expect(install).toHaveBeenCalledTimes(1);
  });
  test('does not download over a permission problem', async () => {
    const probe = vi.fn(async () => { throw new Error('permission denied'); });
    const install = vi.fn();
    await expect(ensureVideoTools({
      ffmpegExecutablePath: 'blocked', ffprobeExecutablePath: 'other',
    }, '/unused', { probe, install })).rejects.toThrow('permission denied');
    expect(install).not.toHaveBeenCalled();
  });
  test('reports a failed install without returning unverified paths', async () => {
    const probe = vi.fn(async () => false);
    const install = vi.fn(async () => { throw new Error('offline'); });
    await expect(ensureVideoTools({
      ffmpegExecutablePath: 'missing', ffprobeExecutablePath: 'missing',
    }, '/unused', { probe, install })).rejects.toThrow('offline');
  });
});
