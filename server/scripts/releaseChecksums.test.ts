import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { releaseChecksums } from './releaseChecksums.ts';

test('release manifest hashes exact shipped bytes and changes when an executable is modified', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xbest-checksums-'));
  try {
    const source = path.join(dir, 'binary');
    const entries = [{ source, name: 'XBest/tunarr.exe' }];
    await fs.writeFile(source, 'original');
    const original = await releaseChecksums(entries);
    expect(original).toBe(
      `${crypto.createHash('sha256').update('original').digest('hex')}  XBest/tunarr.exe\n`,
    );
    await fs.writeFile(source, 'modified');
    expect(await releaseChecksums(entries)).not.toBe(original);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
