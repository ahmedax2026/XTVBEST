import type { ContentBackedStreamLineupItem } from '../../db/derived_types/StreamLineup.ts';
import type { ChannelOverlay } from '@tunarr/types';
import { ChannelTitleSchema } from '@tunarr/types';

export type ProgramOverlay = {
  config: ChannelOverlay;
  elapsedMs: number;
  durationMs: number;
  title: string;
  nextTitle?: string;
};
export function programOverlayForItem(
  config: ChannelOverlay,
  item: ContentBackedStreamLineupItem,
): ProgramOverlay | undefined {
  if (!config.enabled || (config.hideOnFillers && item.type !== 'program'))
    return;
  return {
    config,
    durationMs: item.duration,
    elapsedMs: Math.max(0, item.scheduleElapsedMs ?? item.startOffset ?? 0),
    title: item.program.title,
  };
}

const point = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
const alpha = (opacity: number) =>
  Math.round(255 * (1 - opacity))
    .toString(16)
    .padStart(2, '0');
const color = (hex: string) =>
  `&H${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}&`;
export function countdownText(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}
// Titles cannot inject ASS tags, drawings, line breaks or formatting commands.
export function plainAssText(title: string) {
  return title
    .replace(/[{}\\\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
function time(seconds: number) {
  const cs = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
function rectangle(w: number, h: number) {
  return `m 0 0 l ${point(w, 0)} ${point(w, h)} ${point(0, h)}`;
}
function roundedRectangle(w: number, h: number) {
  const r = h / 2,
    k = r * 0.552285;
  return `m ${point(r, 0)} l ${point(w - r, 0)} b ${point(w - r + k, 0)} ${point(w, r - k)} ${point(w, r)} b ${point(w, r + k)} ${point(w - r + k, h)} ${point(w - r, h)} l ${point(r, h)} b ${point(r - k, h)} ${point(0, r + k)} ${point(0, r)} b ${point(0, r - k)} ${point(r - k, 0)} ${point(r, 0)}`;
}
function arc(radius: number, fraction: number, thickness: number) {
  if (fraction <= 0) return '';
  const count = Math.max(2, Math.ceil(80 * fraction));
  const outer: string[] = [],
    inner: string[] = [];
  for (let i = 0; i <= count; i++) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * fraction * i) / count;
    outer.push(
      point(
        radius + radius * Math.cos(angle),
        radius + radius * Math.sin(angle),
      ),
    );
    const inside = Math.max(0, radius - thickness);
    inner.unshift(
      point(
        radius + inside * Math.cos(angle),
        radius + inside * Math.sin(angle),
      ),
    );
  }
  return `m ${outer[0]} l ${outer.slice(1).join(' ')} ${inner.join(' ')}`;
}
export function overlayGeometry(
  config: ChannelOverlay,
  width: number,
  height: number,
) {
  const w = Math.min(config.size, width, height);
  const round = config.style === 'circle' || config.style === 'ring';
  const h = round || config.style === 'square' ? w : Math.round(w / 3);
  const marginX = Math.min(config.horizontalMargin, Math.max(0, width - w));
  const marginY = Math.min(config.verticalMargin, Math.max(0, height - h));
  return {
    x: config.position.endsWith('right') ? width - w - marginX : marginX,
    y: config.position.startsWith('bottom') ? height - h - marginY : marginY,
    w,
    h,
  };
}
export function overlayTitleGeometry(
  config: ChannelOverlay,
  width: number,
  height: number,
) {
  const style = ChannelTitleSchema.parse(
    config.title ?? {
      fontSize: Math.min(200, Math.max(12, Math.round(height / 30))),
      opacity: config.opacity,
      horizontalMargin: Math.min(500, Math.round(width * 0.08)),
      verticalMargin: Math.min(500, Math.round(height * 0.03)),
    },
  );
  const [row, column] = style.position.split('-');
  const marginX = Math.min(style.horizontalMargin, Math.max(0, width / 2));
  const marginY = Math.min(style.verticalMargin, Math.max(0, height / 2));
  const alignment =
    (row === 'top' ? 7 : row === 'middle' ? 4 : 1) +
    (column === 'right' ? 2 : column === 'center' ? 1 : 0);
  return {
    ...style,
    alignment,
    marginX,
    marginY,
    x:
      column === 'left'
        ? marginX
        : column === 'right'
          ? width - marginX
          : width / 2,
    y:
      row === 'top'
        ? marginY
        : row === 'middle'
          ? height / 2
          : height - marginY,
  };
}
export function buildCountdownAss(
  overlay: ProgramOverlay,
  width: number,
  height: number,
  streamDurationMs: number,
) {
  if (
    ![
      width,
      height,
      streamDurationMs,
      overlay.durationMs,
      overlay.elapsedMs,
    ].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    streamDurationMs <= 0 ||
    streamDurationMs > 86400000 ||
    overlay.durationMs <= 0
  ) {
    throw new Error('Invalid program overlay timeline or dimensions');
  }
  const c = overlay.config;
  const { x, y, w, h } = overlayGeometry(c, width, height);
  const fontSize = Math.max(8, Math.floor(w / 8));
  const duration = streamDurationMs / 1000;
  const title = overlayTitleGeometry(c, width, height);
  const nextFontSize = Math.max(18, Math.round(height / 24));
  const nextMargin = Math.min(
    Math.round(width * 0.35),
    Math.round(w + c.horizontalMargin + width * 0.02),
  );
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Counter,Consolas,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1',
    `Style: Title,${title.fontFamily},${title.fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,${title.bold ? -1 : 0},0,0,0,100,100,0,0,1,${title.outline},0,${title.alignment},${title.marginX},${title.marginX},${title.marginY},1`,
    `Style: Next,${title.fontFamily},${nextFontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,${nextMargin},${nextMargin},0,1`,
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const event = (
    layer: number,
    start: number,
    end: number,
    style: string,
    text: string,
  ) =>
    lines.push(
      `Dialogue: ${layer},${time(start)},${time(end)},${style},,0,0,0,,${text}`,
    );
  const drawing = (
    start: number,
    end: number,
    shape: string,
    paint: string,
    opacity: number,
  ) => {
    if (shape)
      event(
        0,
        start,
        end,
        'Counter',
        `{\\an7\\pos(${x},${y})\\p1\\bord0\\shad0\\1c${paint}\\alpha&H${alpha(opacity)}&}${shape}{\\p0}`,
      );
  };
  const radius = w / 2;
  switch (c.style) {
    case 'digital':
      break;
    case 'pill':
      drawing(
        0,
        duration,
        roundedRectangle(w, h),
        '&H000000&',
        c.opacity * 0.65,
      );
      break;
    case 'square':
    case 'bar':
      drawing(0, duration, rectangle(w, h), '&H000000&', c.opacity * 0.65);
      break;
    case 'circle':
      drawing(
        0,
        duration,
        arc(radius, 1, radius),
        '&H000000&',
        c.opacity * 0.65,
      );
      break;
    case 'ring':
      drawing(
        0,
        duration,
        arc(radius, 1, Math.max(3, w / 25)),
        '&H333333&',
        c.opacity * 0.65,
      );
      break;
  }
  const caption = plainAssText(title.text || overlay.title);
  const nextCaption = plainAssText(overlay.nextTitle ?? '');
  if (c.showNextTitle && nextCaption) {
    const start = Math.max(
      0,
      (overlay.durationMs - overlay.elapsedMs) / 1000 - c.nextTitleSeconds,
    );
    const end = Math.min(
      duration,
      (overlay.durationMs - overlay.elapsedMs) / 1000,
    );
    if (end > start) {
      event(
        3,
        start,
        end,
        'Next',
        `{\\an8\\pos(${width / 2},${Math.round(height * 0.08)})\\fs${Math.max(12, Math.round(nextFontSize * 0.65))}\\1c${color(c.color)}\\bord2\\fad(300,300)}التالي | UP NEXT\\N{\\fs${nextFontSize}}${nextCaption}`,
      );
    }
  }
  if (c.showTitle && caption)
    event(
      2,
      0,
      duration,
      'Title',
      `{\\an${title.alignment}\\pos(${title.x},${title.y})\\1c${color(title.color)}\\alpha&H${alpha(title.opacity)}&}${caption}`,
    );
  let at = 0;
  while (at < duration) {
    const remaining = Math.max(
      0,
      (overlay.durationMs - overlay.elapsedMs) / 1000 - at,
    );
    const fractional = remaining - Math.floor(remaining);
    const end = Math.min(duration, at + (fractional > 0.005 ? fractional : 1));
    const fraction = Math.min(
      1,
      Math.max(0, (remaining * 1000) / overlay.durationMs),
    );
    if (c.style === 'circle' || c.style === 'ring')
      drawing(
        at,
        end,
        arc(radius, fraction, Math.max(3, w / 25)),
        color(c.color),
        c.opacity,
      );
    if (c.style === 'bar') {
      const thickness = Math.max(3, h / 10);
      const shape = `m 0 ${h - thickness} l ${point(w * fraction, h - thickness)} ${point(w * fraction, h)} ${point(0, h)}`;
      drawing(at, end, shape, color(c.color), c.opacity);
    }
    event(
      1,
      at,
      end,
      'Counter',
      `{\\an5\\pos(${x + w / 2},${y + h / 2})\\fs${fontSize}\\1c${color(c.color)}\\alpha&H${alpha(c.opacity)}&}${countdownText(remaining * 1000)}`,
    );
    at = end;
  }
  return lines.join('\n') + '\n';
}
