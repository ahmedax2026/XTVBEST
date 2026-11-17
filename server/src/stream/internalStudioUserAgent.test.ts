import { expect, test } from 'vitest';
import { isInternalStudioUserAgent } from './internalStudioUserAgent.ts';

test('recognizes rebranded and legacy internal stream connections', () => {
  expect(isInternalStudioUserAgent('Ffmpeg XBEST/2026.11.1')).toBe(true);
  expect(isInternalStudioUserAgent('Ffmpeg Tunarr/1.2.0')).toBe(true);
});

test('keeps external players and connections without an agent external', () => {
  expect(isInternalStudioUserAgent('VLC/3.0')).toBe(false);
  expect(isInternalStudioUserAgent('Mozilla/5.0')).toBe(false);
  expect(isInternalStudioUserAgent()).toBe(false);
});
