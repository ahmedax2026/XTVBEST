import { describe, expect, test } from 'vitest';

// PR CI never compiles the catalogs, so a bad merge only fails the release bundle.

const catalogs = import.meta.glob<string>('./*/messages.po', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const conflictMarker = /<<<<<<<|=======|>>>>>>>/;

describe('lingui catalogs', () => {
  test('every locale has a catalog', () => {
    expect(Object.keys(catalogs).sort()).toEqual([
      './ar/messages.po',
      './en/messages.po',
    ]);
  });

  test.each(Object.entries(catalogs))(
    '%s has no merge conflict markers',
    (_path, contents) => {
      const marked = contents
        .split('\n')
        .filter((line) => conflictMarker.test(line));
      expect(marked).toEqual([]);
    },
  );
});

test('active product copy has no previous product branding in either language', () => {
  for (const contents of Object.values(catalogs)) {
    const active = contents
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join('\n');
    expect(active).not.toMatch(/\bTunarr\b|تونار/i);
  }
});

test('the Arabic welcome checklist has translated help and action text', () => {
  const arabic = catalogs['./ar/messages.po'];
  expect(arabic).toBeDefined();
  const blocks = (arabic ?? '')
    .replaceAll('\r\n', '\n')
    .split('\n\n')
    .filter(
      (block) =>
        block.includes('src/pages/welcome/WelcomePage.tsx') &&
        !block.includes('#~ msgid'),
    );
  expect(blocks.length).toBeGreaterThan(20);
  for (const block of blocks) {
    const translated = block.match(/^msgstr "(.*)"$/m)?.[1];
    expect(translated).toMatch(/[\u0600-\u06ff]/);
  }
});

test('active Arabic product copy is translated, preserving technical names and ICU-only templates', () => {
  const allowed = new Set([
    'CEL',
    'Emby',
    'FFmpeg',
    'FFmpeg {0}',
    'HDHR',
    'Jellyfin',
    'URL',
    'XMLTV',
    'XBest {0}',
    '{count} {programLabel}, {0}',
    '{count, plural, one {{0}} other {{1}}}',
  ]);
  const contents = catalogs['./ar/messages.po'] ?? '';
  const read = (block: string, field: string) => {
    const match = block.match(new RegExp(`^${field} (".*"(?:\\n".*")*)`, 'm'));
    return (
      match?.[1]
        ?.split('\n')
        .map((line) => JSON.parse(line) as string)
        .join('') ?? ''
    );
  };
  const untranslated = contents
    .split('\n\n')
    .filter((block) => {
      const source = read(block, 'msgid');
      const translation = read(block, 'msgstr');
      return (
        source &&
        /[a-zA-Z]{2}/.test(translation) &&
        !/[\u0600-\u06ff]/.test(translation) &&
        !allowed.has(source)
      );
    })
    .map((block) => read(block, 'msgid'));
  expect(untranslated).toEqual([]);
});

test('customer screens contain no links to the previous product', () => {
  const screens = import.meta.glob<string>(
    [
      '../components/**/*.tsx',
      '../pages/**/*.tsx',
      '!../**/*.test.tsx',
      '!../**/*.stories.tsx',
    ],
    { query: '?raw', import: 'default', eager: true },
  );
  for (const text of Object.values(screens))
    expect(text).not.toMatch(
      /https?:\/\/[^\s"']*(?:tunarr\.com|chrisbenincasa\/tunarr)/i,
    );
});
