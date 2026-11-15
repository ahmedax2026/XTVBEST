import tmp from 'tmp-promise';
import { expect, test } from 'vitest';
import { bootstrapTunarr } from '../bootstrap.ts';
import { setGlobalOptions } from '../globals.ts';
import { copyPreMigratedDb } from '../testing/testDbFactory.ts';
import { transcodeConfigOrmToDto } from './converters/transcodeConfigConverters.ts';
import { DBAccess } from './DBAccess.ts';
import { TranscodeConfigDB } from './TranscodeConfigDB.ts';

test('saves Auto per profile, round-trips the API flag, and can switch back to manual CPU', async () => {
  const dir = await tmp.dir({ unsafeCleanup: true });
  try {
    await copyPreMigratedDb(dir.path);
    setGlobalOptions({ database: dir.path, log_level: 'error', verbose: 0 });
    await bootstrapTunarr();
    const db = new TranscodeConfigDB(DBAccess.instance.drizzle);
    const original = await db.getDefaultConfig();
    if (!original) throw new Error('Missing migrated default profile');
    expect(original.autoHardwareAcceleration).toBe(false);
    const created = await db.insertConfig({
      ...transcodeConfigOrmToDto(original),
      name: 'Auto test',
      isDefault: false,
      autoHardwareAcceleration: true,
    });
    const saved = await db.getById(created.uuid);
    if (!saved) throw new Error('Saved profile missing');
    expect(transcodeConfigOrmToDto(saved).autoHardwareAcceleration).toBe(true);
    expect((await db.getById(original.uuid))?.autoHardwareAcceleration).toBe(
      false,
    );
    await db.updateConfig(saved.uuid, {
      ...transcodeConfigOrmToDto(saved),
      autoHardwareAcceleration: false,
      hardwareAccelerationMode: 'none',
    });
    await DBAccess.instance.closeConnection(`${dir.path}/db.db`);
    // Reopen the persisted database, as happens on application restart.
    await bootstrapTunarr();
    const reloaded = await new TranscodeConfigDB(
      DBAccess.instance.drizzle,
    ).getById(saved.uuid);
    expect(reloaded).toMatchObject({
      autoHardwareAcceleration: false,
      hardwareAccelerationMode: 'none',
    });
  } finally {
    await DBAccess.instance.closeConnection(`${dir.path}/db.db`);
    await dir.cleanup();
  }
});
