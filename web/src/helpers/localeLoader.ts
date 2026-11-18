/** Only the two UI languages are loaded; English is built into dayjs. */
export function getLinguiToDayjsLocale(locale: string): 'ar' | 'en' {
  return locale === 'ar' ? 'ar' : 'en';
}

export async function loadDayjsLocale(locale: string): Promise<void> {
  if (locale === 'ar') await import('dayjs/locale/ar.js');
}
