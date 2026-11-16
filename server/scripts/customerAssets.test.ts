import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { copyCustomerAssets, customerAssetAllowed } from './customerAssets.ts';

describe('customer executable assets', () => {
  test.each([
    'web/assets/app.js.map',
    'web/source.tsx',
    'source.mts',
    'meta.json',
    '.env',
    '.env.production',
    'keys/issuer-private.pem',
    'keys/license.private.key',
    'keys/private-key.json',
    'web\\assets\\app.js.map',
  ])('omits %s', (file) => expect(customerAssetAllowed(file)).toBe(false));
  test.each([
    'bundle.cjs',
    'web/assets/app.js',
    'web/index.html',
    'resources/images/logo.png',
    'build/better_sqlite3.node',
    'sql/0056_xbest_auto_hardware.sql',
    'sql/meta/journal.json',
    'keys/issuer-public.pem',
    'LICENSE',
  ])('preserves required runtime/public files: %s', (file) =>
    expect(customerAssetAllowed(file)).toBe(true),
  );
  test('filters stale debug output during staging while preserving executable inputs and notices', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xbest-customer-'));
    try {
      const source = path.join(root, 'source'),
        output = path.join(root, 'output');
      await fs.mkdir(path.join(source, 'web'), { recursive: true });
      for (const [name, content] of Object.entries({
        'bundle.cjs': 'runtime',
        'meta.json': 'debug paths',
        'web/app.js': 'public browser runtime',
        'web/app.js.map': 'original source',
        'issuer-private.pem': 'test fixture only',
        LICENSE: 'copyright notice',
      })) {
        await fs.writeFile(path.join(source, name), content);
      }
      await copyCustomerAssets(source, output);
      expect((await fs.readdir(output)).sort()).toEqual([
        'LICENSE',
        'bundle.cjs',
        'web',
      ]);
      expect(await fs.readdir(path.join(output, 'web'))).toEqual(['app.js']);
      expect(
        await fs.readFile(path.join(source, 'web/app.js.map'), 'utf8'),
      ).toBe('original source');
    } finally {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  });
});
