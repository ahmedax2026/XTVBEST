import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import net from 'node:net';
import type { Server, Socket } from 'node:net';
import path from 'node:path';

export function desktopStartupEnabled() {
  return (
    process.platform === 'win32' &&
    Object.hasOwn(process, 'pkg') &&
    process.env.XBEST_AUTOSTART !== '0'
  );
}
export function openDesktopBrowser(url: string) {
  if (process.env.XBEST_NO_BROWSER === '1') return;
  execFile(
    'rundll32.exe',
    ['url.dll,FileProtocolHandler', url],
    {
      windowsHide: true,
    },
    (error) => {
      if (error) console.warn('XBEST: افتح هذا العنوان في المتصفح: ' + url);
    },
  );
}
export function validDesktopUrl(value: string) {
  const match = /^http:\/\/localhost:(\d+)\/web\/$/.exec(value);
  return !!match && Number(match[1]) > 0 && Number(match[1]) <= 65535;
}
export type DesktopOwner = {
  owner: true;
  publish: (url: string) => void;
  close: () => Promise<void>;
};
type DesktopClient = { owner: false; url: string };
export async function acquireDesktopPipe(
  endpoint: string,
): Promise<DesktopOwner | DesktopClient> {
  const pending = new Set<Socket>();
  let readyUrl: string | undefined;
  const server = net.createServer((socket) => {
    socket.unref();
    socket.setTimeout(600000, () => socket.destroy());
    socket.on('error', () => socket.destroy());
    if (readyUrl) socket.end(readyUrl + '\n');
    else {
      pending.add(socket);
      socket.once('close', () => pending.delete(socket));
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => reject(error);
      server.once('error', failed);
      server.listen(endpoint, () => {
        server.removeListener('error', failed);
        resolve();
      });
    });
  } catch (error) {
    if (
      !error ||
      typeof error !== 'object' ||
      !('code' in error) ||
      error.code !== 'EADDRINUSE'
    )
      throw error;
    const url = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(endpoint);
      let buffer = '';
      socket.setTimeout(600000, () => {
        socket.destroy(new Error('XBEST: لم يكتمل تجهيز النسخة المشغلة.'));
      });
      socket.once('error', reject);
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        if (buffer.length > 200)
          socket.destroy(new Error('Invalid XBEST instance response'));
        if (buffer.includes('\n')) {
          const candidate = buffer.split('\n')[0] ?? '';
          socket.end();
          if (validDesktopUrl(candidate)) resolve(candidate);
          else reject(new Error('Invalid XBEST instance URL'));
        }
      });
      socket.once('close', () =>
        reject(new Error('XBEST instance closed before becoming ready')),
      );
    });
    return { owner: false, url };
  }
  server.unref();
  return {
    owner: true,
    publish(url) {
      if (!validDesktopUrl(url)) throw new Error('Invalid XBEST instance URL');
      readyUrl = url;
      for (const socket of pending) socket.end(url + '\n');
      pending.clear();
    },
    close: () => closePipe(server, pending),
  };
}
async function closePipe(server: Server, pending: Set<Socket>) {
  for (const socket of pending) socket.destroy();
  pending.clear();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
let desktopOwner: DesktopOwner | undefined;
export async function initializeDesktopInstance(directory: string) {
  const key = createHash('sha256')
    .update(path.resolve(directory).toLowerCase())
    .digest('hex')
    .slice(0, 24);
  const instance = await acquireDesktopPipe('\\\\.\\pipe\\XBEST-' + key);
  if (!instance.owner) {
    openDesktopBrowser(instance.url);
    return false;
  }
  desktopOwner = instance;
  return true;
}
export function desktopReady(port: number) {
  const url = 'http://localhost:' + port + '/web/';
  desktopOwner?.publish(url);
  openDesktopBrowser(url);
}
export async function chooseDesktopPort(preferred: number, host = '0.0.0.0') {
  const probe = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen({ port, host, exclusive: true }, () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close(() => reject(new Error('Invalid XBEST port')));
          return;
        }
        const chosen = address.port;
        server.close((error) => (error ? reject(error) : resolve(chosen)));
      });
    });
  try {
    return await probe(preferred);
  } catch (error) {
    if (
      !error ||
      typeof error !== 'object' ||
      !('code' in error) ||
      error.code !== 'EADDRINUSE'
    )
      throw error;
    return probe(0);
  }
}
