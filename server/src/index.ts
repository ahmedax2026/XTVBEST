// Must stay first. Zod only compiles schemas constructed after this loads.
import 'zod/compile';

import dotenv from '@dotenvx/dotenvx';
dotenv.config({ debug: false, quiet: true, ignore: ['MISSING_ENV_FILE'] });

import { bootstrapTunarr } from '@/bootstrap.js';
import { setGlobalOptions } from '@/globals.js';
import { getDefaultDatabaseDirectory } from '@/util/defaults.js';
import type { LogLevels } from '@/util/logging/LoggerFactory.js';
import { ValidLogLevels } from '@/util/logging/LoggerFactory.js';
import { getTunarrVersion } from '@/util/version.js';
import { dayjsMod } from '@tunarr/shared/util';
import chalk from 'chalk';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import { fileURLToPath } from 'node:url';
import 'reflect-metadata';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { commands } from './cli/commands.ts';
import {
  desktopStartupEnabled,
  initializeDesktopInstance,
} from './services/desktop/DesktopStartup.ts';
import { globalOptions } from './globals.ts';

// Extend this here once so we don't have to worry about
// it elsewhere in the app.
dayjs.extend(duration);
dayjs.extend(dayjsMod);

function printBanner() {
  console.log(chalk.red(`XBEST Channels Studio ${getTunarrVersion()}`));
}

yargs(hideBin(process.argv))
  .scriptName('XBEST')
  .option('log_level', {
    type: 'string',
    choices: ValidLogLevels,
    default: undefined,
    coerce(arg) {
      return arg as LogLevels;
    },
  })
  .option('verbose', {
    alias: 'v',
    count: true,
  })
  .option('database', {
    alias: 'd',
    type: 'string',
    desc: 'Path to the database directory',
    default: getDefaultDatabaseDirectory(),
    normalize: true,
    coerce: (db: string) => fileURLToPath(new URL(`file://${db}`)),
  })
  .option('hide_banner', {
    type: 'boolean',
    default: false,
  })
  .middleware([
    ({ hide_banner }) => (hide_banner ? void 0 : printBanner()),
    (opts) => setGlobalOptions(opts),
    async (opts) => {
      if (
        desktopStartupEnabled() &&
        (opts._.length === 0 || opts._[0] === 'server')
      ) {
        if (
          !(await initializeDesktopInstance(globalOptions().databaseDirectory))
        ) {
          process.exit(0);
        }
      }
    },
    (opts) => {
      if ((opts._ as string[])[0] !== 'generate-openapi') {
        return bootstrapTunarr();
      }
      return Promise.resolve();
    },
  ])
  .version(getTunarrVersion())
  // @ts-expect-error yarg types are wrong.
  .command(commands)
  .help()
  .parseAsync()
  .catch(console.error);
