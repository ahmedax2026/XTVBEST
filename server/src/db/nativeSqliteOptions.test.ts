import path from 'node:path';
import { expect, test } from 'vitest';
import { nativeSqliteOptions } from './nativeSqliteOptions.ts';

test('uses the staged binding next to the packaged entrypoint without stack inspection', () => {
  const entrypoint = path.join(path.sep, 'snapshot', 'dist', 'bundle.cjs');
  expect(nativeSqliteOptions(true, entrypoint)).toEqual({
    nativeBinding: path.join(
      path.dirname(entrypoint),
      'build',
      'better_sqlite3.node',
    ),
  });
});
test('leaves development and normal Node installations on their existing binding resolution', () => {
  expect(nativeSqliteOptions(false, '/unused/source.ts')).toEqual({});
});
