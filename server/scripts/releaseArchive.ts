import path from 'node:path';

export type ReleaseArchiveEntry = {
  source: string;
  name: string;
};

export type ReleaseArchiveFiles = {
  tunarr: string;
  meilisearch: string;
  etvNext: string;
  etvNextCompanions: string[];
};

/**
 * Places every file in one top-level folder named for the release. The folder
 * carries the version and the binaries inside do not, so a user's shortcut or
 * service path to `XBEST.exe` survives an upgrade.
 */
export function releaseArchiveEntries(
  folderName: string,
  isWindows: boolean,
  files: ReleaseArchiveFiles,
  owner = false,
): ReleaseArchiveEntry[] {
  if (owner && !isWindows)
    throw new Error('XBEST owner launcher requires Windows');
  const exe = isWindows ? '.exe' : '';
  const inFolder = (name: string) => path.posix.join(folderName, name);

  return [
    { source: files.tunarr, name: inFolder(`XBEST${exe}`) },
    { source: files.meilisearch, name: inFolder(`meilisearch${exe}`) },
    { source: files.etvNext, name: inFolder(`ersatztv-channel${exe}`) },
    ...(owner
      ? [
          {
            source: '../scripts/XBEST-OWNER.cmd',
            name: inFolder('XBEST-OWNER.cmd'),
          },
          {
            source: '../scripts/XBEST-OWNER.ps1',
            name: inFolder('XBEST-OWNER.ps1'),
          },
          {
            source: '../docs/XBEST-OWNER-AR.md',
            name: inFolder('XBEST-OWNER-AR.md'),
          },
        ]
      : [
          ...(isWindows
            ? [
                { source: '../scripts/XBEST.cmd', name: inFolder('XBEST.cmd') },
                {
                  source: '../scripts/start-xbest.ps1',
                  name: inFolder('start-xbest.ps1'),
                },
              ]
            : [
                {
                  source: '../scripts/start-xbest.sh',
                  name: inFolder('start-xbest.sh'),
                },
              ]),
          {
            source: '../docs/XBEST-CUSTOMER-AR.md',
            name: inFolder('XBEST-CUSTOMER-AR.md'),
          },
        ]),
    ...files.etvNextCompanions.map((source) => ({
      source,
      name: inFolder(path.basename(source)),
    })),
  ];
}
