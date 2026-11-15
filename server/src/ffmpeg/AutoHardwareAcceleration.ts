import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TranscodeConfigOrm } from '../db/schema/TranscodeConfig.ts';
import { libvaDriverName } from '../db/schema/TranscodeConfig.ts';

type GpuMode = 'cuda' | 'qsv' | 'vaapi' | 'videotoolbox';
type AutoConfig = Pick<
  TranscodeConfigOrm,
  | 'hardwareAccelerationMode'
  | 'autoHardwareAcceleration'
  | 'videoFormat'
  | 'videoBitDepth'
  | 'vaapiDevice'
  | 'vaapiDriver'
>;
type Probe = (
  path: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<void>;

const execFileAsync = promisify(execFile);
const probe: Probe = async (path, args, env) => {
  await execFileAsync(path, args, {
    timeout: 5000,
    windowsHide: true,
    maxBuffer: 64 * 1024,
    env,
  });
};

export function hardwareProbeArgs(config: AutoConfig, mode: GpuMode) {
  const format =
    config.videoFormat === 'mpeg2video' ? 'mpeg2' : config.videoFormat;
  const suffix = mode === 'cuda' ? 'nvenc' : mode;
  const pixelFormat = config.videoBitDepth === 10 ? 'p010le' : 'nv12';
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (mode === 'vaapi') {
    args.push('-vaapi_device', config.vaapiDevice || '/dev/dri/renderD128');
  } else if (mode === 'qsv' && config.vaapiDevice) {
    args.push('-qsv_device', config.vaapiDevice);
  }
  args.push(
    '-f',
    'lavfi',
    '-i',
    'color=size=128x128:rate=25',
    '-vf',
    `format=${pixelFormat}${mode === 'vaapi' ? ',hwupload' : ''}`,
    '-frames:v',
    '1',
    '-an',
    '-c:v',
    `${format}_${suffix}`,
  );
  if (mode === 'videotoolbox') {
    args.push('-allow_sw', '0');
  }
  args.push('-f', 'null', '-');
  return args;
}

/** Probe the actual encoder, rather than trusting FFmpeg's compiled-in list. */
export class AutoHardwareAcceleration {
  private cache = new Map<
    string,
    {
      expiresAt: number;
      result: Promise<GpuMode | 'none'>;
    }
  >();

  constructor(
    private runProbe: Probe = probe,
    private platform: NodeJS.Platform = process.platform,
    private now: () => number = Date.now,
  ) {}

  async resolve<T extends AutoConfig>(
    config: T,
    ffmpegPath: string,
  ): Promise<T> {
    if (!config.autoHardwareAcceleration) return config;

    const key = JSON.stringify([
      ffmpegPath,
      config.videoFormat,
      config.videoBitDepth,
      config.vaapiDevice,
      config.vaapiDriver,
    ]);
    let entry = this.cache.get(key);
    if (!entry || entry.expiresAt <= this.now()) {
      // Bound memory even when many distinct profiles are edited.
      if (this.cache.size >= 100) this.cache.clear();
      entry = {
        expiresAt: this.now() + 60_000,
        result: this.detect(config, ffmpegPath),
      };
      this.cache.set(key, entry);
    }
    const mode = await entry.result;
    return {
      ...config,
      hardwareAccelerationMode: mode,
      // A GPU encode probe does not guarantee hardware decoding/filter support
      // for an arbitrary source. Use software for those stages in Auto mode.
      disableHardwareDecoder: mode !== 'none',
      disableHardwareFilters: mode !== 'none',
      disableHardwareEncoding: false,
      videoPreset: null,
    };
  }

  private async detect(
    config: AutoConfig,
    ffmpegPath: string,
  ): Promise<GpuMode | 'none'> {
    const modes: GpuMode[] =
      this.platform === 'darwin'
        ? ['videotoolbox']
        : this.platform === 'win32'
          ? ['cuda', 'qsv']
          : ['cuda', 'qsv', 'vaapi'];
    for (const mode of modes) {
      const driver = libvaDriverName(config.vaapiDriver);
      const env = { ...process.env };
      if (mode === 'vaapi' && driver) env.LIBVA_DRIVER_NAME = driver;
      try {
        await this.runProbe(ffmpegPath, hardwareProbeArgs(config, mode), env);
        return mode;
      } catch {
        // Missing driver/device/encoder: try the next backend, then CPU.
      }
    }
    return 'none';
  }
}

export const autoHardwareAcceleration = new AutoHardwareAcceleration();
