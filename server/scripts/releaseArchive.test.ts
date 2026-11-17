import { describe, expect, test } from 'vitest';
import { releaseArchiveEntries } from './releaseArchive.ts';

describe('releaseArchiveEntries', () => {
  test('puts unversioned Windows binaries in a versioned folder', () => {
    const entries = releaseArchiveEntries('tunarr-v2026.11.1-win-x64', true, {
      tunarr: './bin/tunarr-v2026.11.1-win-x64.exe',
      meilisearch: './bin/meilisearch-win-x64',
      etvNext: '/tmp/etv/ersatztv-channel.exe',
      etvNextCompanions: ['/tmp/etv/libvpl.dll', '/tmp/etv/LICENSE-libvpl'],
    });

    expect(
      entries.filter(
        (entry) => !/XBEST\.cmd|start-xbest|CUSTOMER-AR/.test(entry.name),
      ),
    ).toEqual([
      {
        source: './bin/tunarr-v2026.11.1-win-x64.exe',
        name: 'tunarr-v2026.11.1-win-x64/XBEST.exe',
      },
      {
        source: './bin/meilisearch-win-x64',
        name: 'tunarr-v2026.11.1-win-x64/meilisearch.exe',
      },
      {
        source: '/tmp/etv/ersatztv-channel.exe',
        name: 'tunarr-v2026.11.1-win-x64/ersatztv-channel.exe',
      },
      {
        source: '/tmp/etv/libvpl.dll',
        name: 'tunarr-v2026.11.1-win-x64/libvpl.dll',
      },
      {
        source: '/tmp/etv/LICENSE-libvpl',
        name: 'tunarr-v2026.11.1-win-x64/LICENSE-libvpl',
      },
    ]);
  });

  test('omits the .exe suffix on Linux', () => {
    const entries = releaseArchiveEntries(
      'tunarr-v2026.11.1-linux-x64',
      false,
      {
        tunarr: './bin/tunarr-v2026.11.1-linux-x64',
        meilisearch: './bin/meilisearch-linux-x64',
        etvNext: '/tmp/etv/ersatztv-channel',
        etvNextCompanions: [],
      },
    );

    expect(entries.map((e) => e.name)).toEqual([
      'tunarr-v2026.11.1-linux-x64/XBEST',
      'tunarr-v2026.11.1-linux-x64/meilisearch',
      'tunarr-v2026.11.1-linux-x64/ersatztv-channel',
      'tunarr-v2026.11.1-linux-x64/start-xbest.sh',
      'tunarr-v2026.11.1-linux-x64/XBEST-CUSTOMER-AR.md',
    ]);
  });
});

test('owner archives contain launchers while customer archives do not', () => {
  const files = {
    tunarr: './XBEST.exe',
    meilisearch: './meilisearch.exe',
    etvNext: './ersatztv-channel.exe',
    etvNextCompanions: [],
  };
  const customer = releaseArchiveEntries('XBEST-customer', true, files);
  const owner = releaseArchiveEntries('XBEST-OWNER', true, files, true);
  expect(customer.map((file) => file.name)).toContain(
    'XBEST-customer/XBEST.cmd',
  );
  expect(customer.map((file) => file.name)).toContain(
    'XBEST-customer/start-xbest.ps1',
  );
  expect(customer.some((file) => file.name.includes('OWNER'))).toBe(false);
  expect(owner.map((file) => file.name)).toContain(
    'XBEST-OWNER/XBEST-OWNER.cmd',
  );
  expect(owner.map((file) => file.name)).toContain(
    'XBEST-OWNER/XBEST-OWNER.ps1',
  );
  expect(
    owner.some((file) => /private|credentials|state\.json/.test(file.name)),
  ).toBe(false);
});
