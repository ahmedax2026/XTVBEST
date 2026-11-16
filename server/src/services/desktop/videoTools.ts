import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod/v4';

const run = promisify(execFile);
export type VideoTools = {
  ffmpegExecutablePath: string;
  ffprobeExecutablePath: string;
};
export function supportedVideoVersion(output: string) {
  const version = /(?:ffmpeg|ffprobe) version n?(\d+)\.(\d+)/i.exec(output);
  if (!version) return false;
  const major = Number(version[1]);
  return major > 6 || (major === 6 && Number(version[2]) >= 1);
}
export async function probeVideoTool(executable: string) {
  try {
    const result = await run(executable, ['-version'], {
      timeout: 10000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return supportedVideoVersion(result.stdout);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'EACCES' || error.code === 'EPERM')
    ) {
      throw new Error('XBEST: تعذر تشغيل الأداة بسبب الصلاحيات: ' + executable);
    }
    return false;
  }
}
const Asset = z.object({
  name: z.string(),
  size: z
    .number()
    .int()
    .positive()
    .max(350 * 1024 * 1024),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  browser_download_url: z.string().url(),
});
async function installWindowsVideoTools(root: string): Promise<VideoTools> {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(
      'XBEST: التنزيل التلقائي لأدوات الفيديو متاح لويندوز x64 فقط.',
    );
  }
  console.log('XBEST: جارٍ تجهيز أدوات الفيديو الناقصة. يلزم اتصال بالإنترنت.');
  const repository =
    'https://api.github.com/repos/FFmpeg-Builds/FFmpeg-Builds/releases/latest';
  const metadata = await fetch(repository, {
    headers: { 'User-Agent': 'XBEST', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!metadata.ok) throw new Error('XBEST: تعذر الاتصال بمصدر أدوات الفيديو.');
  const release = z
    .object({ assets: z.array(z.unknown()) })
    .parse(await metadata.json());
  const selected = release.assets.find(
    (item) =>
      item &&
      typeof item === 'object' &&
      'name' in item &&
      item.name === 'ffmpeg-n8.1-latest-win64-gpl-8.1.zip',
  );
  const asset = Asset.parse(selected);
  const url = new URL(asset.browser_download_url);
  if (
    url.origin !== 'https://github.com' ||
    !url.pathname.startsWith('/FFmpeg-Builds/FFmpeg-Builds/releases/download/')
  ) {
    throw new Error('XBEST: عنوان تنزيل أدوات الفيديو غير صالح.');
  }
  await fs.mkdir(root, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(root, '.XBEST-video-'));
  const archive = path.join(temporary, 'video.zip');
  const extracted = path.join(temporary, 'files');
  const published = path.join(root, 'ffmpeg-' + randomUUID());
  let publishedSuccessfully = false;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body)
      throw new Error('XBEST: فشل تنزيل أدوات الفيديو.');
    const file = await fs.open(archive, 'wx');
    const reader = response.body.getReader();
    const hash = createHash('sha256');
    let bytes = 0,
      reported = -1;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > asset.size)
          throw new Error('XBEST: حجم التنزيل غير مطابق.');
        hash.update(chunk.value);
        await file.writeFile(chunk.value);
        const progress = Math.floor((bytes / asset.size) * 10) * 10;
        if (progress !== reported) {
          reported = progress;
          console.log('XBEST: تنزيل أدوات الفيديو ' + progress + '%');
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      await file.close();
    }
    if (
      bytes !== asset.size ||
      'sha256:' + hash.digest('hex') !== asset.digest
    ) {
      throw new Error('XBEST: فشل التحقق من سلامة التنزيل. أعد المحاولة.');
    }
    await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Expand-Archive -LiteralPath $env:XBEST_VIDEO_ARCHIVE -DestinationPath $env:XBEST_VIDEO_EXTRACT -Force',
      ],
      {
        windowsHide: true,
        timeout: 300000,
        env: {
          ...process.env,
          XBEST_VIDEO_ARCHIVE: archive,
          XBEST_VIDEO_EXTRACT: extracted,
        },
      },
    );
    const bin = path.join(extracted, asset.name.replace(/\.zip$/, ''), 'bin');
    const tools = {
      ffmpegExecutablePath: path.join(bin, 'ffmpeg.exe'),
      ffprobeExecutablePath: path.join(bin, 'ffprobe.exe'),
    };
    if (
      !(await probeVideoTool(tools.ffmpegExecutablePath)) ||
      !(await probeVideoTool(tools.ffprobeExecutablePath))
    ) {
      throw new Error('XBEST: الأدوات المنزلة لم تجتز اختبار التشغيل.');
    }
    await fs.rename(extracted, published);
    publishedSuccessfully = true;
    const finalBin = path.join(
      published,
      asset.name.replace(/\.zip$/, ''),
      'bin',
    );
    return {
      ffmpegExecutablePath: path.join(finalBin, 'ffmpeg.exe'),
      ffprobeExecutablePath: path.join(finalBin, 'ffprobe.exe'),
    };
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
    if (!publishedSuccessfully)
      await fs.rm(published, { recursive: true, force: true });
  }
}
export async function ensureVideoTools(
  configured: VideoTools,
  directory: string,
  dependencies = { probe: probeVideoTool, install: installWindowsVideoTools },
): Promise<VideoTools> {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const locate = async (name: 'ffmpeg' | 'ffprobe', configuredPath: string, sibling?: string) => {
    const candidates = [
      ...new Set(
        [
          configuredPath,
          sibling ? path.join(path.dirname(sibling), name + suffix) : '',
          path.join(path.dirname(process.execPath), name + suffix),
          name + suffix,
        ].filter(Boolean),
      ),
    ];
    for (const candidate of candidates) {
      if (await dependencies.probe(candidate)) return candidate;
    }
    return;
  };
  const ffmpeg = await locate('ffmpeg', configured.ffmpegExecutablePath);
  const ffprobe = await locate('ffprobe', configured.ffprobeExecutablePath, ffmpeg);
  if (ffmpeg && ffprobe) {
    console.log('XBEST: أدوات الفيديو الموجودة صالحة؛ لا حاجة إلى تنزيل.');
    return { ffmpegExecutablePath: ffmpeg, ffprobeExecutablePath: ffprobe };
  }
  const installed = await dependencies.install(path.join(directory, 'tools'));
  return {
    ffmpegExecutablePath: ffmpeg ?? installed.ffmpegExecutablePath,
    ffprobeExecutablePath: ffprobe ?? installed.ffprobeExecutablePath,
  };
}
