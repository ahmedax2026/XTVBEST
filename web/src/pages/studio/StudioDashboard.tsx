import {
  Add,
  ArrowOutward,
  LiveTv,
  PeopleOutline,
  PlaylistPlay,
  SettingsInputAntenna,
  Search,
  Refresh,
  VideoLibraryOutlined,
  KeyOutlined,
  TuneOutlined,
  PlayArrow,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  LinearProgress,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { Channel } from '@tunarr/types';
import { useState } from 'react';
import type { ShellPath } from '../../components/ui/patterns/AppShell/navModel.ts';
import { getChannelsOptions } from '../../generated/@tanstack/react-query.gen.ts';
import { useSettings } from '../../store/settings/selectors.ts';
import { RouterButtonLink } from '../../components/base/RouterButtonLink.tsx';
import { channelStatus } from '../../components/channels/channelSummary.ts';
import type { NowPlayingSummary } from '../../components/channels/channelSummary.ts';
import { useChannelsNowPlaying } from '../../components/channels/useChannelsNowPlaying.ts';
import { ChannelIconDisplay } from '../../components/channels/ChannelIconDisplay.tsx';

export type StudioDashboardProps = {
  channels: readonly Channel[];
  nowPlaying: ReadonlyMap<string, NowPlayingSummary>;
  loading: boolean;
  error: boolean;
  refreshing: boolean;
  onRefresh: () => void;
};

export function StudioDashboardView({
  channels,
  nowPlaying,
  loading,
  error,
  refreshing,
  onRefresh,
}: StudioDashboardProps) {
  const ar = useSettings().ui.i18n.locale === 'ar';
  const text = (arabic: string, english: string) => (ar ? arabic : english);
  const [search, setSearch] = useState('');
  const live = channels.filter(
    (c) => channelStatus(c.sessions).status === 'live',
  );
  const connections = channels.reduce(
    (n, c) => n + channelStatus(c.sessions).connections,
    0,
  );
  const programs = channels.reduce((n, c) => n + c.programCount, 0);
  const shown = [...channels]
    .sort(
      (a, b) =>
        Number(channelStatus(b.sessions).status === 'live') -
          Number(channelStatus(a.sessions).status === 'live') ||
        a.number - b.number,
    )
    .filter((c) =>
      `${c.name} ${c.number}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    )
    .slice(0, 8);
  const stats = [
    {
      label: text('إجمالي القنوات', 'Total channels'),
      value: channels.length,
      icon: <LiveTv />,
      note: text('قنوات داخل الاستوديو', 'Channels in your workspace'),
    },
    {
      label: text('قنوات تبث الآن', 'Streaming channels'),
      value: live.length,
      icon: <SettingsInputAntenna />,
      note: text('حسب جلسات البث الحالية', 'From current streaming sessions'),
    },
    {
      label: text('اتصالات المشغلات', 'Player connections'),
      value: connections,
      icon: <PeopleOutline />,
      note: text(
        'اتصالات، وليست أشخاصًا فريدين',
        'Connections, not unique viewers',
      ),
    },
    {
      label: text('عناصر جدول البرامج', 'Scheduled items'),
      value: programs,
      icon: <PlaylistPlay />,
      note: text('إجمالي عناصر القنوات', 'Total items across channel lineups'),
    },
  ];
  return (
    <Stack spacing={3.5}>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '18px',
          border: '1px solid',
          borderColor: 'divider',
          p: { xs: 3, md: 4.5 },
          background: (t) =>
            `linear-gradient(115deg, ${t.palette.background.paper} 45%, ${alpha(t.palette.primary.main, 0.13)})`,
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            insetInlineEnd: -40,
            top: -70,
            width: 280,
            height: 280,
            borderRadius: '50%',
            border: '1px solid',
            borderColor: (t) => alpha(t.palette.primary.main, 0.25),
            boxShadow: '0 0 0 35px #f02c4508, 0 0 0 70px #f02c4505',
            pointerEvents: 'none',
          }}
        />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <Box sx={{ width: 20, height: 2, bgcolor: 'primary.main' }} />
          <Typography
            sx={{
              color: 'primary.main',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '2px',
            }}
          >
            XBEST CONTROL ROOM
          </Typography>
        </Stack>
        <Typography
          component="h1"
          sx={{
            fontSize: { xs: 27, md: 38 },
            fontWeight: 900,
            letterSpacing: ar ? 0 : '-1.2px',
            position: 'relative',
          }}
        >
          {text('قنواتك. بثّك. تحكّمك.', 'Your channels. Your control.')}
        </Typography>
        <Typography
          sx={{
            mt: 1,
            color: 'text.secondary',
            maxWidth: 580,
            fontSize: 14,
            lineHeight: 1.9,
            position: 'relative',
          }}
        >
          {text(
            'من أول جدول البرامج لآخر ثانية في البث، كل أدوات الاستوديو في مساحة واحدة.',
            'From your first scheduled program to the final second on air, bring every channel into one workspace.',
          )}
        </Typography>
        <Stack
          direction="row"
          flexWrap="wrap"
          gap={1.25}
          sx={{ mt: 3, position: 'relative' }}
        >
          <RouterButtonLink
            to="/channels/new"
            variant="contained"
            startIcon={<Add />}
          >
            {text('إنشاء قناة', 'Create channel')}
          </RouterButtonLink>
          <RouterButtonLink
            to="/guide"
            variant="outlined"
            sx={{ color: 'text.primary', borderColor: 'divider' }}
            endIcon={<ArrowOutward />}
          >
            {text('دليل البث', 'Program guide')}
          </RouterButtonLink>
        </Stack>
      </Box>
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" disabled={refreshing} onClick={onRefresh}>
              {text('إعادة المحاولة', 'Retry')}
            </Button>
          }
        >
          {text(
            'تعذر تحميل بيانات القنوات. الأرقام المعروضة غير متاحة حتى عودة الاتصال.',
            'Unable to load channel data. Metrics are unavailable until the connection recovers.',
          )}
        </Alert>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0,1fr))',
            md: 'repeat(4,minmax(0,1fr))',
          },
          gap: { xs: 1.5, md: 2 },
        }}
      >
        {stats.map((stat) => (
          <Box
            component="section"
            key={stat.label}
            aria-label={stat.label}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '14px',
              bgcolor: 'background.paper',
              p: { xs: 2, md: 2.5 },
            }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                {stat.label}
              </Typography>
              <Box
                sx={{
                  color: 'primary.main',
                  display: 'flex',
                  '& svg': { fontSize: 20 },
                }}
              >
                {stat.icon}
              </Box>
            </Stack>
            <Typography
              sx={{
                fontSize: 34,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                my: 0.75,
              }}
            >
              {error
                ? '—'
                : loading
                  ? '…'
                  : stat.value.toLocaleString(ar ? 'ar-EG' : 'en-US')}
            </Typography>
            <Typography
              sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.6 }}
            >
              {stat.note}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(0,1fr) 270px' },
          gap: 3,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            gap={2}
            sx={{ mb: 2 }}
          >
            <Box>
              <Typography component="h2" sx={{ fontSize: 20, fontWeight: 800 }}>
                {text('من قلب الاستوديو', 'Inside the studio')}
              </Typography>
              <Typography
                sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}
              >
                {text(
                  'حالة القنوات والبرامج الحالية',
                  'Channels and currently scheduled programs',
                )}
              </Typography>
            </Box>
            <Stack direction="row" gap={1} alignItems="center">
              <Button
                disabled={refreshing}
                onClick={onRefresh}
                startIcon={<Refresh />}
                size="small"
              >
                {text('تحديث', 'Refresh')}
              </Button>
              <RouterButtonLink
                to="/channels"
                endIcon={<ArrowOutward />}
                size="small"
              >
                {text('كل القنوات', 'All channels')}
              </RouterButtonLink>
            </Stack>
          </Stack>
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={text(
              'ابحث باسم القناة أو رقمها…',
              'Find a channel by name or number…',
            )}
            fullWidth
            size="small"
            inputProps={{
              'aria-label': text('البحث في القنوات', 'Search channels'),
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 2 }}
          />
          {loading && (
            <LinearProgress
              aria-label={text('تحميل القنوات', 'Loading channels')}
            />
          )}
          {!loading && !error && shown.length === 0 && (
            <Box
              sx={{
                p: 5,
                textAlign: 'center',
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: '14px',
              }}
            >
              <LiveTv sx={{ fontSize: 36, color: 'text.secondary', mb: 1.5 }} />
              <Typography>
                {channels.length
                  ? text(
                      'لا توجد قنوات تطابق البحث',
                      'No channels match your search',
                    )
                  : text(
                      'الاستوديو جاهز لأول قناة',
                      'Your studio is ready for its first channel',
                    )}
              </Typography>
              {!channels.length && (
                <RouterButtonLink to="/channels/new" sx={{ mt: 2 }}>
                  {text('ابدأ بإنشاء قناة', 'Create your first channel')}
                </RouterButtonLink>
              )}
            </Box>
          )}
          {!error && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  md: 'repeat(2,minmax(0,1fr))',
                },
                gap: 2,
              }}
            >
              {shown.map((channel) => {
                const status = channelStatus(channel.sessions);
                const now = nowPlaying.get(channel.id);
                return (
                  <Box
                    component="article"
                    aria-label={channel.name}
                    key={channel.id}
                    sx={{
                      p: 2.5,
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: '14px',
                      position: 'relative',
                      overflow: 'hidden',
                      '&:hover': { borderColor: 'primary.main' },
                      transition: 'border-color .2s',
                    }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      gap={1}
                    >
                      <Stack
                        direction="row"
                        gap={1.5}
                        alignItems="center"
                        sx={{ minWidth: 0 }}
                      >
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            display: 'grid',
                            placeItems: 'center',
                            bgcolor: 'action.hover',
                            borderRadius: '10px',
                            flexShrink: 0,
                          }}
                        >
                          <ChannelIconDisplay
                            icon={channel.icon}
                            style={{ width: 32, height: 32 }}
                            imgStyle={{ maxWidth: 32, maxHeight: 32 }}
                          />
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            noWrap
                            sx={{ fontSize: 14, fontWeight: 800 }}
                          >
                            {channel.name}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: 10,
                              color: 'text.secondary',
                              mt: 0.5,
                            }}
                          >
                            CH {String(channel.number).padStart(2, '0')}
                          </Typography>
                        </Box>
                      </Stack>
                      <Chip
                        size="small"
                        color={
                          status.status === 'live'
                            ? 'success'
                            : status.status === 'warning'
                              ? 'warning'
                              : 'default'
                        }
                        variant="outlined"
                        label={
                          status.status === 'live'
                            ? text('يبث الآن', 'Streaming')
                            : status.status === 'warning'
                              ? text(
                                  'جلسة بدون اتصالات',
                                  'Session without clients',
                                )
                              : text('بدون جلسة', 'Idle')
                        }
                      />
                    </Stack>
                    <Typography
                      sx={{
                        color: 'text.secondary',
                        fontSize: 10,
                        mt: 3,
                        mb: 0.5,
                      }}
                    >
                      {text('في الجدول الآن', 'SCHEDULED NOW')}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: 13, minHeight: 22 }}>
                      {now?.title ??
                        (now?.kind === 'redirect'
                          ? text(
                              `تحويل إلى قناة ${now.redirectChannel}`,
                              `Redirect to channel ${now.redirectChannel}`,
                            )
                          : text(
                              'لا توجد بيانات برنامج حالي',
                              'No current program data',
                            ))}
                    </Typography>
                    {now && (
                      <LinearProgress
                        aria-label={text('تقدم البرنامج', 'Program progress')}
                        variant="determinate"
                        value={now.progress * 100}
                        sx={{ mt: 1.5, height: 3, borderRadius: 1 }}
                      />
                    )}
                    <Stack direction="row" gap={1} sx={{ mt: 2.5 }}>
                      <RouterButtonLink
                        to="/channels/$channelId"
                        params={{ channelId: channel.id }}
                        variant="outlined"
                        size="small"
                        sx={{
                          flex: 1,
                          borderColor: 'divider',
                          color: 'text.primary',
                        }}
                      >
                        {text('إدارة القناة', 'Manage channel')}
                      </RouterButtonLink>
                      <RouterButtonLink
                        to="/channels/$channelId/watch"
                        params={{ channelId: channel.id }}
                        aria-label={text(
                          `مشاهدة ${channel.name}`,
                          `Watch ${channel.name}`,
                        )}
                        variant="contained"
                        size="small"
                        sx={{ minWidth: 40, px: 1 }}
                      >
                        <PlayArrow fontSize="small" />
                      </RouterButtonLink>
                    </Stack>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
        <Stack spacing={2}>
          <Box
            sx={{
              p: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '14px',
              bgcolor: 'background.paper',
            }}
          >
            <Typography
              component="h2"
              sx={{ fontSize: 14, fontWeight: 800, mb: 2 }}
            >
              {text('أدوات الاستوديو', 'Studio tools')}
            </Typography>
            {[
              {
                to: '/settings/sources',
                icon: <VideoLibraryOutlined />,
                title: text('مصادر المحتوى', 'Media sources'),
                detail: text(
                  'ملفاتك ومكتبات الميديا',
                  'Files and media libraries',
                ),
              },
              {
                to: '/profiles/transcode',
                icon: <TuneOutlined />,
                title: text('بروفايلات التحويل', 'Transcode profiles'),
                detail: text('المعالج وكارت الشاشة', 'CPU and GPU processing'),
              },
              {
                to: '/settings/access',
                icon: <KeyOutlined />,
                title: text('اليوزرات والليسانسات', 'Users and licenses'),
                detail: text(
                  'الحسابات وتفعيل النسخ',
                  'Accounts and activation',
                ),
              },
            ].map((tool) => (
              <RouterButtonLink
                to={tool.to as ShellPath}
                key={tool.to}
                sx={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  gap: 1.5,
                  mb: 1,
                  p: 1,
                  color: 'text.primary',
                  textAlign: 'start',
                }}
              >
                <Box sx={{ display: 'flex', color: 'primary.main' }}>
                  {tool.icon}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                    {tool.title}
                  </Typography>
                  <Typography
                    sx={{ fontSize: 10, mt: 0.5, color: 'text.secondary' }}
                  >
                    {tool.detail}
                  </Typography>
                </Box>
              </RouterButtonLink>
            ))}
          </Box>
          <Box
            sx={{
              p: 2.5,
              borderRadius: '14px',
              border: '1px solid',
              borderColor: (t) => alpha(t.palette.primary.main, 0.3),
              bgcolor: (t) => alpha(t.palette.primary.main, 0.05),
            }}
          >
            <Typography
              sx={{
                color: 'primary.main',
                fontSize: 10,
                letterSpacing: '1px',
                fontWeight: 800,
              }}
            >
              YOUR BROADCAST, YOUR WAY
            </Typography>
            <Typography sx={{ fontWeight: 800, fontSize: 16, mt: 1.5 }}>
              {text('من اللايف للقناة المحفوظة', 'From live to saved playback')}
            </Typography>
            <Typography
              sx={{
                fontSize: 12,
                color: 'text.secondary',
                lineHeight: 1.9,
                mt: 1,
              }}
            >
              {text(
                'افتح قائمة القناة لتجهيز المحتوى المحفوظ أو ضبط العداد داخل الفيديو.',
                'Open a channel menu to prepare saved content or configure its in-video countdown.',
              )}
            </Typography>
            <RouterButtonLink to="/channels" sx={{ px: 0, mt: 1 }}>
              {text('إدارة القنوات', 'Manage channels')}{' '}
              <ArrowOutward sx={{ fontSize: 15, ms: 0.5 }} />
            </RouterButtonLink>
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}

export default function StudioDashboard() {
  const query = useQuery({ ...getChannelsOptions(), refetchInterval: 10_000 });
  const nowPlaying = useChannelsNowPlaying();
  return (
    <StudioDashboardView
      channels={query.data ?? []}
      nowPlaying={nowPlaying}
      loading={query.isLoading}
      error={query.isError}
      refreshing={query.isFetching}
      onRefresh={() => {
        void query.refetch();
      }}
    />
  );
}
