import { i18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadCatalog } from '../i18n.ts';

describe('loadCatalog', () => {
  beforeEach(() => {
    // Reset to a known state before each test
    i18n.loadAndActivate({ locale: 'en', messages: {} });
  });

  it('activates the English locale', async () => {
    await loadCatalog('en');
    expect(i18n.locale).toBe('en');
  });

  it('is idempotent — loading the same locale twice does not error', async () => {
    await loadCatalog('en');
    await expect(loadCatalog('en')).resolves.toBeUndefined();
    expect(i18n.locale).toBe('en');
  });

  it('falls back to English when given a nonexistent locale', async () => {
    await loadCatalog('nonexistent-LOCALE');
    expect(i18n.locale).toBe('en');
  });

  it('activates Arabic locale and translates navigation', async () => {
    await loadCatalog('ar');
    expect(i18n.locale).toBe('ar');
    expect(i18n._(msg`Channels`)).toBe('القنوات');
    expect(i18n._(msg`Refresh`)).toBe('تحديث');
  });

  it('translates the now-playing card controls into Arabic', async () => {
    await loadCatalog('ar');
    expect(i18n._(msg`Now Playing:`)).toBe('يُعرض الآن:');
    expect(i18n._(msg`Now playing`)).toBe('يُعرض الآن');
    expect(i18n._(msg`Details`)).toBe('التفاصيل');
    expect(i18n._(msg`Flex`)).toBe('فاصل');
  });

  it.each(['es', 'zh-CN', 'pseudo-LOCALE'])(
    'uses English fallback for removed locale %s',
    async (locale) => {
      await loadCatalog(locale);
      expect(i18n.locale).toBe('en');
    },
  );
});
