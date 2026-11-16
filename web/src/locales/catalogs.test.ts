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
  const blocks = (arabic ?? '').replaceAll('\r\n', '\n').split('\n\n').filter(
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
