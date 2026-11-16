import { EventEmitter } from 'node:events';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import { expect, test, vi } from 'vitest';
import type { FfmpegProcess } from './FfmpegProcess.ts';
import { FfmpegTranscodeSession } from './FfmpegTrancodeSession.ts';
dayjs.extend(duration);
function fixture() {
  const process = Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    exited: Promise.resolve(),
  });
  const session = new FfmpegTranscodeSession(
    process as unknown as FfmpegProcess,
    dayjs.duration(1, 'seconds'),
    dayjs(),
  );
  return { process, session };
}
test('cleans up unused generated assets even if a session is cancelled before starting', async () => {
  const { session } = fixture();
  const cleanup = vi.fn(async () => {});
  session.registerCleanup(cleanup);
  session.kill();
  await session.exited;
  expect(cleanup).toHaveBeenCalledTimes(1);
});
test('runs cleanup once when exit and kill happen together', async () => {
  const { session, process } = fixture();
  const cleanup = vi.fn(async () => {});
  session.registerCleanup(cleanup);
  process.emit('exit', 0, null, true);
  session.kill();
  await session.exited;
  expect(cleanup).toHaveBeenCalledTimes(1);
});
