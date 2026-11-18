import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ContentCopy, Refresh, Stop } from '@mui/icons-material';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Channel } from '@tunarr/types';
import {
  deleteApiChannelsByIdSessionsMutation,
  getApiSessionsOptions,
  getApiSessionsQueryKey,
} from '../../generated/@tanstack/react-query.gen.ts';
import type { GetApiSessionsResponse } from '../../generated/types.gen.ts';
import { invalidateTaggedQueries } from '../../helpers/queryUtil.ts';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard.ts';
import { useSettings } from '../../store/settings/selectors.ts';
import type { Nullable } from '../../types/util.ts';
import { channelStreamUrl } from './channelSummary.ts';

type Props = {
  open: boolean;
  onClose: () => void;
  channel: Nullable<Channel>;
};

const LiveSessions = ({
  channel,
  onClose,
}: {
  channel: Channel;
  onClose: () => void;
}) => {
  const { t } = useLingui();
  const { backendUri } = useSettings();
  const queryClient = useQueryClient();
  const copy = useCopyToClipboard();
  const query = useQuery({
    ...getApiSessionsOptions(),
    select: (data) => data[channel.id] ?? [],
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: 1,
  });
  const sessions = query.data ?? [];
  const streamUrl = channelStreamUrl(backendUri, channel.id);
  const connections = sessions.reduce(
    (total, session) => total + session.numConnections,
    0,
  );
  const sessionStates: Record<string, string> = {
    init: t`Initializing`,
    starting: t`Starting`,
    started: t`Running`,
    stopping: t`Stopping`,
    stopped: t`Stopped`,
    error: t`Error`,
  };

  const afterStop = async () => {
    // Cancel an older poll before clearing the confirmed stopped sessions.
    await queryClient.cancelQueries({ queryKey: getApiSessionsQueryKey() });
    queryClient.setQueryData<GetApiSessionsResponse>(
      getApiSessionsQueryKey(),
      (old) => {
        if (!old) return old;
        return { ...old, [channel.id]: [] };
      },
    );
    await queryClient.invalidateQueries({
      predicate: invalidateTaggedQueries(['Channels', 'Sessions']),
    });
  };
  const stop = useMutation({
    ...deleteApiChannelsByIdSessionsMutation(),
    onSuccess: afterStop,
    // Another viewer or administrator may already have ended the sessions.
    onError: async (error) => {
      if (error.response?.status === 404) await afterStop();
    },
  });

  return (
    <>
      <DialogTitle id="channel-sessions-title">
        <Trans>Live monitor: {channel.name}</Trans>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            <Trans>Updates every five seconds while this window is open.</Trans>
          </Typography>
          {query.isFetching && (
            <LinearProgress aria-label={t`Refreshing sessions`} />
          )}
          {query.isError && (
            <Alert severity="error">
              <Trans>
                Unable to refresh sessions. Previously loaded values may be out
                of date.
              </Trans>
            </Alert>
          )}
          {stop.isError && stop.error.response?.status !== 404 && (
            <Alert severity="error">
              <Trans>Unable to stop sessions. Try again.</Trans>
            </Alert>
          )}
          {query.data && (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip label={t`${sessions.length} sessions`} />
              <Chip label={t`${connections} stream connections`} />
            </Stack>
          )}
          <Typography variant="caption" color="text.secondary">
            <Trans>
              A player can open more than one connection. This is not a count of
              unique viewers.
            </Trans>
          </Typography>
          {!query.isPending && !query.isError && sessions.length === 0 && (
            <Alert severity="info">
              <Trans>No active sessions for this channel.</Trans>
            </Alert>
          )}
          {sessions.map((session, index) => (
            <Paper
              key={`${session.type}-${index}`}
              variant="outlined"
              sx={{ p: 2 }}
            >
              <Stack spacing={1}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  gap={1}
                  flexWrap="wrap"
                >
                  <Typography fontWeight={600}>
                    {session.type.replaceAll('_', ' ').toUpperCase()}
                  </Typography>
                  <Chip
                    size="small"
                    label={sessionStates[session.state] ?? session.state}
                    color={
                      session.state === 'error'
                        ? 'error'
                        : session.state === 'started'
                          ? 'success'
                          : 'default'
                    }
                  />
                </Stack>
                <Typography variant="body2">
                  <Trans>{session.numConnections} stream connections</Trans>
                </Typography>
                {session.connections.map((connection, i) => (
                  <Box
                    key={`${connection.ip}-${i}`}
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    <Typography component="span" variant="body2" dir="ltr">
                      {connection.ip}
                    </Typography>
                    <Typography
                      variant="caption"
                      display="block"
                      color="text.secondary"
                    >
                      <Trans>Last activity:</Trans>{' '}
                      {connection.lastHeartbeat === undefined
                        ? t`Unknown`
                        : new Date(
                            connection.lastHeartbeat,
                          ).toLocaleTimeString()}
                    </Typography>
                    {connection.userAgent && (
                      <Typography variant="caption" color="text.secondary">
                        {connection.userAgent}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            </Paper>
          ))}
          <TextField
            fullWidth
            label={t`Stable HLS URL`}
            value={streamUrl}
            slotProps={{ input: { readOnly: true }, htmlInput: { dir: 'ltr' } }}
            helperText={t`This address stays the same when you rename or renumber the channel.`}
          />
          <Button
            startIcon={<ContentCopy />}
            sx={{ gap: 1, '& .MuiButton-startIcon': { m: 0 } }}
            onClick={() => {
              copy(streamUrl).catch(console.error);
            }}
          >
            <Trans>Copy stream URL</Trans>
          </Button>
          <Alert severity="warning">
            <Trans>
              Stopping sessions disconnects current players. A player that
              reconnects can start a new session; this does not take the channel
              permanently offline.
            </Trans>
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions
        sx={{
          flexWrap: 'wrap',
          gap: 1,
          '& .MuiButton-root': { gap: 1 },
          '& .MuiButton-startIcon': { m: 0 },
        }}
      >
        <Button
          startIcon={<Refresh />}
          disabled={query.isFetching}
          onClick={() => {
            query.refetch().catch(console.error);
          }}
        >
          <Trans>Refresh</Trans>
        </Button>
        <Button
          color="error"
          variant="contained"
          startIcon={<Stop />}
          disabled={
            query.isPending ||
            query.isError ||
            sessions.length === 0 ||
            stop.isPending
          }
          onClick={() => stop.mutate({ path: { id: channel.id } })}
        >
          {stop.isPending ? (
            <Trans>Stopping sessions…</Trans>
          ) : (
            <Trans>Stop sessions</Trans>
          )}
        </Button>
        <Button onClick={onClose}>
          <Trans>Close</Trans>
        </Button>
      </DialogActions>
    </>
  );
};

export const ChannelSessionsDialog = ({ open, onClose, channel }: Props) => (
  <Dialog
    open={open && !!channel}
    onClose={onClose}
    fullWidth
    maxWidth="sm"
    onClick={(event) => event.stopPropagation()}
    aria-labelledby="channel-sessions-title"
  >
    {open && channel && (
      <LiveSessions key={channel.id} channel={channel} onClose={onClose} />
    )}
  </Dialog>
);
