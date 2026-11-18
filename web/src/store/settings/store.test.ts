import { describe, expect, test } from 'vitest';
import { SettingsStateInternalSchema, SupportedLocales } from './store.ts';

const saved = (locale: string) => ({
  version: 1,
  backendUri: 'https://my-server.test/studio',
  ui: {
    channelTablePagination: { pageIndex: 2, pageSize: 25 },
    channelTableColumnModel: { onDemand: true },
    i18n: { locale, timeFormat: '24h' },
    tableSettings: {},
    showAdvancedSettings: true,
  },
});
describe('Arabic and English settings', () => {
  test('offers exactly Arabic and English', () => {
    expect([...SupportedLocales].sort()).toEqual(['ar', 'en']);
  });
  test.each(['ar', 'en'])('preserves supported locale %s', (locale) => {
    expect(
      SettingsStateInternalSchema.parse(saved(locale)).ui.i18n.locale,
    ).toBe(locale);
  });
  test.each(['es', 'zh-CN', 'pseudo-LOCALE', 'unknown'])(
    'migrates removed locale %s without losing server or display settings',
    (locale) => {
      const state = SettingsStateInternalSchema.parse(saved(locale));
      expect(state.ui.i18n.locale).toBe('ar');
      expect(state.backendUri).toBe('https://my-server.test/studio');
      expect(state.ui.i18n.timeFormat).toBe('24h');
      expect(state.ui.channelTablePagination).toEqual({
        pageIndex: 2,
        pageSize: 25,
      });
      expect(state.ui.showAdvancedSettings).toBe(true);
    },
  );
});
