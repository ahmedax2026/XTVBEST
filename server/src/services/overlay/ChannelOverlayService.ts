import type { ISettingsDB } from '../../db/interfaces/ISettingsDB.ts';
import { FfmpegInfo } from '../../ffmpeg/ffmpegInfo.ts';
import { inject, injectable } from 'inversify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ChannelOverlaySchema, DefaultChannelOverlay } from '@tunarr/types';
import type { ChannelOverlay } from '@tunarr/types';
import type { IChannelDB } from '../../db/interfaces/IChannelDB.ts';
import type { IProgramDB } from '../../db/interfaces/IProgramDB.ts';
import { globalOptions } from '../../globals.ts';
import { KEYS } from '../../types/inject.ts';
import { writeFileAtomic } from '../../util/fsUtil.ts';
import { z } from 'zod/v4';

@injectable()
export class ChannelOverlayService {
  constructor(
    @inject(KEYS.ChannelDB) private channels: IChannelDB,
    @inject(KEYS.SettingsDB) private settings: ISettingsDB,
    @inject(KEYS.ProgramDB) private programs: IProgramDB,
  ) {}
  async upcomingTitle(
    channelId: string,
    nextAt: number,
  ): Promise<string | undefined> {
    const channel = await this.channels.getChannelOrm(channelId);
    const lineup = await this.channels.loadLineup(channelId);
    if (!channel || lineup.onDemandConfig || !lineup.items.length) return;
    const total = lineup.items.reduce((sum, item) => sum + item.durationMs, 0);
    if (!Number.isFinite(total) || total <= 0) return;
    const elapsed = (((nextAt - channel.startTime) % total) + total) % total;
    let offset = 0;
    let index = lineup.items.findIndex((item) => {
      offset += item.durationMs;
      return elapsed < offset;
    });
    if (index < 0) return;
    for (let count = 0; count < lineup.items.length; count++) {
      const item = lineup.items[index];
      if (!item) return;
      if (item.type === 'content')
        return (await this.programs.getProgramById(item.id))?.title;
      if (item.type !== 'offline') return;
      index = (index + 1) % lineup.items.length;
    }
    return;
  }
  private file(channelId: string) {
    z.uuid().parse(channelId);
    return path.join(
      globalOptions().databaseDirectory,
      'channel-overlays',
      `${channelId}.json`,
    );
  }
  async get(channelId: string): Promise<ChannelOverlay> {
    try {
      return ChannelOverlaySchema.parse(
        JSON.parse(await fs.readFile(this.file(channelId), 'utf8')),
      );
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return { ...DefaultChannelOverlay };
      throw error;
    }
  }
  async save(channelId: string, input: ChannelOverlay) {
    const config = ChannelOverlaySchema.parse(input);
    const channel = await this.channels.getChannelOrm(channelId);
    if (!channel) throw new Error('Channel not found');
    if (
      config.studioBumper &&
      (channel.fillerShows.length || channel.offline?.mode === 'clip')
    ) {
      throw new Error(
        'Studio bumpers require picture-mode offline playback and no random filler lists',
      );
    }
    if (
      config.enabled &&
      (channel.useEtvNext || !['hls', 'mpegts'].includes(channel.streamMode))
    ) {
      throw new Error(
        'Program overlays require the built-in transcoded HLS or MPEG-TS engine',
      );
    }
    if (config.enabled) {
      const options = this.settings.ffmpegSettings();
      if (
        !(
          await new FfmpegInfo(
            options.ffmpegExecutablePath,
            options.ffprobeExecutablePath,
          ).getCapabilities()
        ).hasFilter('subtitles')
      ) {
        throw new Error('FFmpeg was built without subtitle-filter support');
      }
    }
    const file = this.file(channelId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, JSON.stringify(config));
    return config;
  }
}
