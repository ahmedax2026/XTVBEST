import { FfmpegSettingsSchema } from '@tunarr/types/schemas';
import { container } from '@/container.js';
import assert from 'node:assert';
import { type MarkOptional } from 'ts-essentials';
import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import z from 'zod';
import { App } from '../App.ts';
import { DBAccess } from '../db/DBAccess.ts';
import { type ISettingsDB } from '../db/interfaces/ISettingsDB.ts';
import { globalOptions, setServerOptions } from '../globals.ts';
import { ensureVideoTools } from '../services/desktop/videoTools.ts';
import {
  chooseDesktopPort,
  desktopReady,
  desktopStartupEnabled,
} from '../services/desktop/DesktopStartup.ts';
import { KEYS } from '../types/inject.ts';
import {
  getBooleanEnvVar,
  getEnvVar,
  getNumericEnvVar,
  TUNARR_ENV_VARS,
} from '../util/env.ts';
import { LoggerFactory } from '../util/logging/LoggerFactory.ts';
import type { GlobalArgsType } from './types.ts';

const trustProxySchema = z.stringbool().or(z.coerce.number()).or(z.string());

export type ServerArgsType = GlobalArgsType & {
  port: number;
  printRoutes: boolean;
  trustProxy?: string | string[] | number | boolean;
  searchPort?: number;
};

export const RunServerCommand: CommandModule<GlobalArgsType, ServerArgsType> = {
  command: ['server', '$0'],
  describe: 'تشغيل خادم XBEST',
  builder: {
    port: {
      alias: 'p',
      type: 'number',
      desc: 'تحديد بورت خادم XBEST',
    },
    printRoutes: {
      type: 'boolean',
      description: 'Whether to print all available routes at startup.',
      default: () =>
        getBooleanEnvVar(TUNARR_ENV_VARS.PRINT_ROUTES_ENV_VAR, false),
    },
    trustProxy: {
      type: 'string',
      description:
        'Trust proxy passed directly to Fastify. See valid options here: https://fastify.dev/docs/latest/Reference/Server/#trustproxy',
      default: () => getEnvVar(TUNARR_ENV_VARS.TRUST_PROXY_ENV_VAR),
      coerce: (arg) => {
        return trustProxySchema.parse(arg);
      },
    },
    searchPort: {
      type: 'number',
      description: 'Statically define the port to start the search server on.',
    },
  },
  handler: async (
    opts: ArgumentsCamelCase<MarkOptional<ServerArgsType, 'port'>>,
  ) => {
    const settings = container.get<ISettingsDB>(KEYS.SettingsDB);
    const desktop = desktopStartupEnabled();
    const portSetting = settings.systemSettings().server.port;
    if (desktop) {
      const oldTools = settings.ffmpegSettings();
      const tools = await ensureVideoTools(
        oldTools,
        globalOptions().databaseDirectory,
      );
      if (
        tools.ffmpegExecutablePath !== oldTools.ffmpegExecutablePath ||
        tools.ffprobeExecutablePath !== oldTools.ffprobeExecutablePath
      ) {
        await settings.updateFfmpegSettings(
          FfmpegSettingsSchema.parse({ ...oldTools, ...tools }),
        );
      }
    }
    let portToUse =
      getNumericEnvVar(TUNARR_ENV_VARS.SERVER_PORT_ENV_VAR) ??
      opts.port ??
      portSetting;
    if (
      desktop &&
      opts.port === undefined &&
      getNumericEnvVar(TUNARR_ENV_VARS.SERVER_PORT_ENV_VAR) === null
    ) {
      portToUse = await chooseDesktopPort(
        portToUse,
        getEnvVar(TUNARR_ENV_VARS.BIND_ADDR_ENV_VAR) ?? '0.0.0.0',
      );
    }
    // Explicit CLI/environment ports are respected; automatic startup can choose a free port.
    setServerOptions({ ...opts, port: portToUse });

    process.on('uncaughtException', (err) => {
      console.error(err, 'Uncaught exception');
      LoggerFactory.root.flush();
    });

    process.on('unhandledRejection', (err) => {
      console.error(err, 'Uncaught exception');
      LoggerFactory.root.flush();
    });

    // Hard fail without database connection.
    assert(!!container.get<DBAccess>(DBAccess).db);
    await container.get(App).start();
    if (desktop) {
      await settings.updateBaseSettings('system', {
        server: { ...settings.systemSettings().server, port: portToUse },
      });
      desktopReady(portToUse);
    }
  },
};
