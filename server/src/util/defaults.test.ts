import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { getDefaultDatabaseDirectory } from './defaults.ts';
import * as containerUtil from './containerUtil.ts';

vi.mock('./logging/LoggerFactory.ts', () => ({
  getEnvironmentLogLevel: () => undefined,
}));

let root: string | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

test('uses XBEST for new data while preserving existing data and explicit overrides', async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'xbest-data-path-'));
  vi.spyOn(containerUtil, 'isRunningInContainer').mockReturnValue(false);
  vi.stubEnv('APPDATA', root);
  vi.stubEnv('TUNARR_DATABASE_PATH', undefined);
  expect(getDefaultDatabaseDirectory()).toBe(path.join(root, 'XBEST'));
  await fs.mkdir(path.join(root, 'tunarr'));
  expect(getDefaultDatabaseDirectory()).toBe(path.join(root, 'tunarr'));
  await fs.mkdir(path.join(root, 'XBEST'));
  expect(getDefaultDatabaseDirectory()).toBe(path.join(root, 'XBEST'));
  vi.stubEnv('TUNARR_DATABASE_PATH', path.join(root, 'custom'));
  expect(getDefaultDatabaseDirectory()).toBe(path.join(root, 'custom'));
});
