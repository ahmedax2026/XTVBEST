import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  acquireDesktopPipe,
  chooseDesktopPort,
  validDesktopUrl,
} from './DesktopStartup.ts';

test('reuses the same ready desktop instance instead of starting another server', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'XBEST-ipc-'));
  const endpoint =
    process.platform === 'win32'
      ? '\\\\.\\pipe\\XBEST-test-' + randomUUID()
      : path.join(directory, 'desktop.sock');
  const first = await acquireDesktopPipe(endpoint);
  if (!first.owner) throw new Error('Expected first owner');
  try {
    first.publish('http://localhost:8017/web/');
    const second = await acquireDesktopPipe(endpoint);
    expect(second).toEqual({ owner: false, url: 'http://localhost:8017/web/' });
  } finally {
    await first.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test('chooses another free port without stopping the application occupying the preferred port', async () => {
  const busy = net.createServer();
  await new Promise<void>((resolve) => busy.listen(0, '127.0.0.1', resolve));
  try {
    const address = busy.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP address');
    const chosen = await chooseDesktopPort(address.port, '127.0.0.1');
    expect(chosen).not.toBe(address.port);
    expect(chosen).toBeGreaterThan(0);
    expect(busy.listening).toBe(true);
  } finally {
    await new Promise<void>((resolve) => busy.close(() => resolve()));
  }
});
test('only accepts local browser URLs and valid ports from the desktop pipe', () => {
  expect(validDesktopUrl('http://localhost:8017/web/')).toBe(true);
  expect(validDesktopUrl('http://localhost:8017/web/settings/access')).toBe(true);
  expect(validDesktopUrl('http://localhost:0/web/')).toBe(false);
  expect(validDesktopUrl('http://localhost:65536/web/')).toBe(false);
  expect(validDesktopUrl('https://evil.example/web/')).toBe(false);
  expect(validDesktopUrl('http://localhost:8017/web/;start evil')).toBe(false);
});
