import { betterHumanize } from '@/helpers/dayjs.ts';
import { useThemeTokens } from '@/hooks/useTunarrTheme.ts';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { PlayArrow, Tune, LiveTv } from '@mui/icons-material';
import {
  Box,
  Chip,
  LinearProgress,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import type { Channel } from '@tunarr/types';
import dayjs from 'dayjs';
import { type ReactNode, useState } from 'react';
import { isNonEmptyString } from '../../helpers/util.ts';
import { RouterButtonLink } from '../base/RouterButtonLink.tsx';
import { RouterLink } from '../base/RouterLink.tsx';
import { MonoText } from '../ui/MonoText.tsx';
import { ChannelIconDisplay } from './ChannelIconDisplay.tsx';
import { ChannelStatusPill } from './ChannelStatusPill.tsx';
import {
  type ChannelStatus,
  type NowPlayingSummary,
  streamModeLabel,
} from './channelSummary.ts';

export type ChannelCardChannel = Pick<
  Channel,
  | 'id'
  | 'number'
  | 'name'
  | 'icon'
  | 'programCount'
  | 'duration'
  | 'stealth'
  | 'onDemand'
  | 'streamMode'
>;
export type ChannelCardProps = {
  channel: ChannelCardChannel;
  status: ChannelStatus;
  nowPlaying?: NowPlayingSummary;
  transcodeName?: string;
  onOpenSessions?: () => void;
  menu?: ReactNode;
};

export const ChannelCard = ({
  channel,
  status,
  nowPlaying,
  transcodeName,
  onOpenSessions,
  menu,
}: ChannelCardProps) => {
  const { t } = useLingui();
  const { tokens } = useThemeTokens();
  const [failedArtUrl, setFailedArtUrl] = useState<string>();
  const artwork =
    nowPlaying?.artworkUrl === failedArtUrl
      ? undefined
      : nowPlaying?.artworkUrl;
  const title =
    nowPlaying?.kind === 'redirect'
      ? t`Redirect to channel ${nowPlaying.redirectChannel}`
      : nowPlaying?.title;
  return (
    <Box
      component="article"
      aria-label={channel.name}
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '14px',
        bgcolor: 'background.paper',
        overflow: 'hidden',
        transition: 'border-color .2s',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ px: 2, py: 1.5, gap: 1 }}
      >
        <Stack direction="row" gap={1} alignItems="center">
          <Box
            sx={{
              bgcolor: 'action.hover',
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              borderRadius: '8px',
            }}
          >
            <ChannelIconDisplay
              icon={channel.icon}
              style={{ width: 28, height: 28 }}
              imgStyle={{ maxWidth: 28, maxHeight: 28 }}
            />
          </Box>
          <Typography
            variant="mono"
            sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 700 }}
          >
            CH {String(channel.number).padStart(2, '0')}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <ChannelStatusPill status={status} onOpenSessions={onOpenSessions} />
          {menu}
        </Stack>
      </Stack>
      <Box
        sx={{
          position: 'relative',
          minHeight: 170,
          bgcolor: tokens.surfaceRaised,
          display: 'flex',
          alignItems: 'flex-end',
          p: 2.5,
          color: '#fff',
        }}
      >
        {artwork ? (
          <Box
            component="img"
            alt=""
            src={artwork}
            loading="lazy"
            onError={() => setFailedArtUrl(artwork)}
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: `linear-gradient(130deg, ${tokens.surfaceRaised}, ${alpha(tokens.accent, 0.18)})`,
              backgroundSize: 'cover',
            }}
          >
            <LiveTv sx={{ fontSize: 80, opacity: 0.14 }} />
          </Box>
        )}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(0deg, #08090fef, #08090f15)',
          }}
        />
        <Box
          sx={{
            position: 'relative',
            minWidth: 0,
            width: '100%',
            borderInlineStart: '3px solid',
            borderColor: 'primary.main',
            paddingInlineStart: 1.5,
          }}
        >
          <Typography
            sx={{
              fontSize: 9,
              letterSpacing: 1.2,
              fontWeight: 700,
              opacity: 0.7,
            }}
          >
            <Trans>Now playing</Trans>
          </Typography>
          <Typography noWrap sx={{ fontSize: 16, fontWeight: 800, mt: 0.5 }}>
            {isNonEmptyString(title) ? title : '—'}
          </Typography>
          <Typography noWrap sx={{ fontSize: 11, opacity: 0.7, minHeight: 17 }}>
            {nowPlaying?.detail ?? ' '}
          </Typography>
        </Box>
      </Box>
      <LinearProgress
        variant="determinate"
        value={(nowPlaying?.progress ?? 0) * 100}
        aria-label={t`Program progress`}
        sx={{ height: 3, borderRadius: 0, bgcolor: 'divider' }}
      />
      <Stack gap={1.5} sx={{ p: 2.5, flex: 1 }}>
        <Typography component="h2" sx={{ fontSize: 18, fontWeight: 800 }}>
          <RouterLink
            to="/channels/$channelId"
            params={{ channelId: channel.id }}
            color="inherit"
            underline="hover"
          >
            {channel.name}
          </RouterLink>
        </Typography>
        <Stack
          direction="row"
          justifyContent="space-between"
          gap={1}
          sx={{ color: 'text.secondary', fontSize: 11 }}
        >
          <span>
            <MonoText>{channel.programCount}</MonoText>{' '}
            <Plural
              value={channel.programCount}
              one="program"
              other="programs"
            />
          </span>
          <MonoText>
            {betterHumanize(dayjs.duration(channel.duration), {
              style: 'short',
            })}
          </MonoText>
        </Stack>
        <Stack direction="row" gap={0.75} flexWrap="wrap">
          <Chip
            size="small"
            variant="outlined"
            label={streamModeLabel(channel.streamMode)}
          />
          {transcodeName && (
            <Chip size="small" variant="outlined" label={transcodeName} />
          )}
          {channel.stealth && (
            <Chip size="small" color="warning" label={t`Stealth`} />
          )}
          {channel.onDemand.enabled && (
            <Chip size="small" color="info" label={t`On-Demand`} />
          )}
        </Stack>
        <Stack direction="row" gap={1} sx={{ mt: 'auto', pt: 1 }}>
          <RouterButtonLink
            to="/channels/$channelId/watch"
            params={{ channelId: channel.id }}
            variant="contained"
            startIcon={<PlayArrow />}
            size="small"
            sx={{ flex: 1 }}
          >
            <Trans>Watch</Trans>
          </RouterButtonLink>
          <RouterButtonLink
            to="/channels/$channelId/programming"
            params={{ channelId: channel.id }}
            variant="outlined"
            startIcon={<Tune />}
            size="small"
            sx={{ flex: 1, color: 'text.primary', borderColor: 'divider' }}
          >
            <Trans>Programming</Trans>
          </RouterButtonLink>
        </Stack>
      </Stack>
    </Box>
  );
};
