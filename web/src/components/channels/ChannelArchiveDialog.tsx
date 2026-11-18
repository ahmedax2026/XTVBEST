import { Trans, useLingui } from '@lingui/react/macro';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChannelArchiveStatusSchema } from '@tunarr/types';
import type { Channel, ChannelArchiveStatus } from '@tunarr/types';
import { useState } from 'react';
import { client } from '../../generated/client.gen.ts';

function ArchiveControls({ channel }: { channel: Channel }) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [threads, setThreads] = useState(2);
  const [storageLimitGiB, setStorage] = useState(100);
  const queryKey = ['channel-archive', channel.id];
  const endpoint = `/api/channels/${encodeURIComponent(channel.id)}/archive`;
  const status = useQuery({
    queryKey,
    refetchInterval: 3000,
    retry: 1,
    queryFn: async () =>
      ChannelArchiveStatusSchema.parse(
        (await client.instance.get(endpoint)).data,
      ),
  });
  const action = useMutation({
    mutationFn: async ({
      command,
      body,
    }: {
      command: 'prepare' | 'cancel' | 'mode';
      body?: object;
    }) =>
      ChannelArchiveStatusSchema.parse(
        (await client.instance.post(`${endpoint}/${command}`, body)).data,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });
  const labels: Record<ChannelArchiveStatus['state'], string> = {
    live: t`Live`,
    preparing: t`Preparing archive`,
    ready: t`Archive ready`,
    pending: t`Switching at the next program`,
    archived: t`Archived playback`,
    returning: t`Returning to live at the next program`,
    failed: t`Preparation needs attention`,
  };
  const state = status.data?.state;
  const busy =
    action.isPending ||
    state === 'preparing' ||
    state === 'pending' ||
    state === 'returning';
  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      <Alert severity="info">
        <Trans>
          Prepare local movies once, then play the saved output using the same
          channel link. Original files are preserved. Switching takes effect at
          the next program boundary.
        </Trans>
      </Alert>
      <Typography variant="body2">
        <Trans>
          This version supports fixed local playlists with the built-in HLS or
          MPEG-TS engine. Disable random fillers before preparing. Channel
          watermarks are preserved. The channel's CPU, GPU or Auto profile is
          used.
        </Trans>
      </Typography>
      {status.isPending && <LinearProgress />}
      {status.isError && (
        <Alert severity="error">
          <Trans>Unable to load archive status.</Trans>
        </Alert>
      )}
      {status.data && (
        <>
          <Chip label={labels[status.data.state]} />
          <Typography>
            <Trans>
              Prepared {status.data.completed} of {status.data.total} programs
            </Trans>
          </Typography>
          <Typography dir="ltr">
            {(status.data.bytes / 1024 ** 3).toFixed(2)} GiB
          </Typography>
          {status.data.currentTitle && (
            <Typography>{status.data.currentTitle}</Typography>
          )}
          {state === 'preparing' && (
            <LinearProgress
              variant="determinate"
              value={
                status.data.total
                  ? (status.data.completed / status.data.total) * 100
                  : 0
              }
            />
          )}
          {state === 'failed' && (
            <Alert severity="warning">
              <Trans>
                Preparation was cancelled, interrupted or failed validation.
                Live playback remains available. Check the files, profile and
                available storage, then prepare again.
              </Trans>
            </Alert>
          )}
        </>
      )}
      {action.isError && (
        <Alert severity="error">
          <Trans>
            The archive operation could not be completed. Check that the
            playlist uses supported local files and no other preparation is
            running.
          </Trans>
        </Alert>
      )}
      <TextField
        label={t`Preparation threads`}
        type="number"
        value={threads}
        disabled={busy}
        slotProps={{ htmlInput: { min: 1, max: 32 } }}
        onChange={(e) => setThreads(Number(e.target.value))}
      />
      <TextField
        label={t`Total archive storage limit (GiB)`}
        type="number"
        value={storageLimitGiB}
        disabled={busy}
        slotProps={{ htmlInput: { min: 1, max: 1024 } }}
        onChange={(e) => setStorage(Number(e.target.value))}
      />
      <Button
        variant="contained"
        disabled={
          busy ||
          state === 'archived' ||
          !Number.isInteger(threads) ||
          threads < 1 ||
          threads > 32 ||
          !Number.isFinite(storageLimitGiB) ||
          storageLimitGiB < 1 ||
          storageLimitGiB > 1024
        }
        onClick={() =>
          action.mutate({
            command: 'prepare',
            body: { threads, storageLimitGiB },
          })
        }
      >
        <Trans>Prepare saved channel</Trans>
      </Button>
      {state === 'preparing' && (
        <Button
          disabled={action.isPending}
          onClick={() => action.mutate({ command: 'cancel' })}
        >
          <Trans>Cancel preparation</Trans>
        </Button>
      )}
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button
          disabled={
            action.isPending ||
            (state !== 'ready' && state !== 'live') ||
            !status.data?.total
          }
          onClick={() =>
            action.mutate({ command: 'mode', body: { mode: 'archive' } })
          }
        >
          <Trans>Switch to saved channel</Trans>
        </Button>
        <Button
          disabled={
            action.isPending ||
            (state !== 'archived' && state !== 'pending' && state !== 'failed')
          }
          onClick={() =>
            action.mutate({ command: 'mode', body: { mode: 'live' } })
          }
        >
          <Trans>Return to live</Trans>
        </Button>
      </Stack>
      <Typography variant="caption">
        <Trans>
          One preparation runs at a time. The storage limit includes older saved
          files; archives are never deleted automatically.
        </Trans>
      </Typography>
    </Stack>
  );
}
export function ChannelArchiveDialog({
  channel,
  open,
  onClose,
}: {
  channel: Channel;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="channel-archive-title"
    >
      <DialogTitle id="channel-archive-title">
        <Trans>Saved channel: {channel.name}</Trans>
      </DialogTitle>
      <DialogContent>
        {open && <ArchiveControls key={channel.id} channel={channel} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          <Trans>Close</Trans>
        </Button>
      </DialogActions>
    </Dialog>
  );
}
