import { i18n } from '@lingui/core';
import { messages as enMessages } from './locales/en/messages.po';

/**
 * Loads and activates a Lingui message catalog for the given locale.
 * Falls back to English if the catalog cannot be loaded.
 * Idempotent: skips loading if the locale is already active.
 */
export async function loadCatalog(locale: string) {
  const supportedLocale = locale === 'ar' ? 'ar' : 'en';
  if (i18n.locale === supportedLocale) return;
  try {
    const messages =
      supportedLocale === 'ar'
        ? (await import('./locales/ar/messages.po')).messages
        : enMessages;
    i18n.loadAndActivate({ locale: supportedLocale, messages });
  } catch (e) {
    console.warn(e);
    i18n.loadAndActivate({ locale: 'en', messages: enMessages });
  }
}
