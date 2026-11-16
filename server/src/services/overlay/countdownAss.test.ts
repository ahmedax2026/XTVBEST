import type { ContentBackedStreamLineupItem } from '../../db/derived_types/StreamLineup.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ChannelOverlaySchema,
  ChannelOverlayStyles,
  DefaultChannelOverlay,
} from '@tunarr/types';
import {
  buildCountdownAss,
  countdownText,
  overlayGeometry,
  plainAssText,
  programOverlayForItem,
} from './countdownAss.ts';

const execFileAsync = promisify(execFile);
let dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.map((dir) =>
      fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }),
    ),
  );
  dirs = [];
});
const presentation = {
  config: {
    ...DefaultChannelOverlay,
    enabled: true,
    size: 160,
    horizontalMargin: 15,
    verticalMargin: 15,
  },
  durationMs: 10000,
  elapsedMs: 2000,
  title: 'فيلم الاختبار العربي',
};
describe('video countdown', () => {
  test('uses the scheduled remaining time, clamps the end and carries hours', () => {
    expect(countdownText(3661000)).toBe('01:01:01');
    expect(countdownText(1)).toBe('00:00:01');
    expect(countdownText(-1000)).toBe('00:00:00');
    const ass = buildCountdownAss(presentation, 640, 360, 3000);
    expect(ass).toContain('00:00:08');
    expect(ass).toContain('00:00:07');
    expect(ass).toContain('00:00:06');
    expect(ass).not.toContain('00:00:10');
  });
  test('hides fillers and counts scheduled elapsed time independently of source seek offsets', () => {
    const item = {
      type: 'program',
      duration: 6000,
      scheduleElapsedMs: 1000,
      startOffset: 10000,
      program: { title: 'Movie' },
    } as ContentBackedStreamLineupItem;
    expect(programOverlayForItem(presentation.config, item)?.elapsedMs).toBe(
      1000,
    );
    const filler = { ...item, type: 'fallback' as const };
    expect(programOverlayForItem(presentation.config, filler)).toBeUndefined();
    expect(
      programOverlayForItem(
        { ...presentation.config, hideOnFillers: false },
        filler,
      ),
    ).toBeDefined();
    expect(
      programOverlayForItem({ ...presentation.config, enabled: false }, item),
    ).toBeUndefined();
  });
  test('aligns fractional seeks to the next displayed second', () => {
    const ass = buildCountdownAss(
      { ...presentation, elapsedMs: 2600 },
      640,
      360,
      1500,
    );
    expect(ass).toContain('0:00:00.00,0:00:00.40');
    expect(ass).toContain('0:00:00.40,0:00:01.40');
  });
  test('escapes titles without permitting ASS tag injection and preserves Arabic', () => {
    const clean = plainAssText('اسم الفيلم {\\p1}\\N\nمرحبا');
    expect(clean).toContain('اسم الفيلم');
    expect(clean).not.toMatch(/[{}\\\n]/);
    const ass = buildCountdownAss(
      { ...presentation, config: { ...presentation.config, showTitle: true } },
      640,
      360,
      1000,
    );
    expect(ass).toContain('فيلم الاختبار العربي');
  });
  test.each(ChannelOverlayStyles)(
    'creates bounded timed events for %s',
    (style) => {
      const ass = buildCountdownAss(
        { ...presentation, config: { ...presentation.config, style } },
        640,
        360,
        2000,
      );
      expect(ass).toContain('PlayResX: 640');
      expect(ass).toContain('0:00:02.00');
      expect(ass).not.toContain('NaN');
      expect(ass).not.toContain('Infinity');
    },
  );
  test('clamps placement even on small output frames', () => {
    expect(
      overlayGeometry(
        {
          ...presentation.config,
          size: 480,
          horizontalMargin: 500,
          verticalMargin: 500,
        },
        320,
        180,
      ),
    ).toEqual({ x: 0, y: 0, w: 180, h: 180 });
    expect(
      overlayGeometry(
        { ...presentation.config, position: 'bottom-left' },
        640,
        360,
      ),
    ).toEqual({ x: 15, y: 185, w: 160, h: 160 });
  });
  test('rejects unbounded timelines and malformed color/size settings', () => {
    expect(() => buildCountdownAss(presentation, 640, 360, Infinity)).toThrow();
    expect(() => buildCountdownAss(presentation, 640, 360, 86400001)).toThrow();
    expect(ChannelOverlaySchema.safeParse({ color: '#fff;bad' }).success).toBe(
      false,
    );
    expect(ChannelOverlaySchema.safeParse({ size: 0 }).success).toBe(false);
  });
});

test.skipIf(process.env.XBEST_FFMPEG_TEST !== '1')(
  'burns all six styles and Arabic titles into real video frames',
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xbest-overlay-'));
    dirs.push(dir);
    const sums: number[] = [];
    for (const style of ChannelOverlayStyles) {
      const script = path.join(dir, `${style}.ass`),
        frame = path.join(dir, `${style}.rgb`);
      await fs.writeFile(
        script,
        buildCountdownAss(
          {
            ...presentation,
            config: { ...presentation.config, style, showTitle: true },
          },
          640,
          360,
          3000,
        ),
      );
      await execFileAsync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=c=0x151515:s=640x360:r=25',
          '-vf',
          `subtitles=${script}`,
          '-ss',
          '1',
          '-frames:v',
          '1',
          '-threads',
          '1',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgb24',
          frame,
        ],
        { timeout: 15000 },
      );
      const pixels = await fs.readFile(frame);
      let bright = 0,
        top = 0;
      for (let y = 0; y < 360; y++)
        for (let x = 0; x < 640; x++) {
          const offset = (y * 640 + x) * 3;
          if ((pixels[offset] ?? 0) > 100) {
            bright++;
            if (y < 180 && x > 400) top++;
          }
        }
      expect(bright - top).toBeGreaterThan(50);
      expect(top).toBeGreaterThan(50);
      sums.push(pixels.reduce((sum, value) => sum + value, 0));
    }
    expect(new Set(sums).size).toBe(6);
  },
  60000,
);
