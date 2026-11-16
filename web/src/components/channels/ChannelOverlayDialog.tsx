import { Trans, useLingui } from '@lingui/react/macro';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChannelOverlaySchema, DefaultChannelOverlay } from '@tunarr/types';
import type { Channel, ChannelOverlay } from '@tunarr/types';
import { useEffect, useState } from 'react';
import { client } from '../../generated/client.gen.ts';

export function OverlayPreview({
  value,
  resolution = { widthPx: 1920, heightPx: 1080 },
}: {
  value: ChannelOverlay;
  resolution?: { widthPx: number; heightPx: number };
}) {
  const { t } = useLingui();
  const width = resolution.widthPx,
    height = resolution.heightPx;
  const w = Math.max(
    1,
    Math.min(Number.isFinite(value.size) ? value.size : 160, width, height),
  );
  const round = value.style === 'circle' || value.style === 'ring';
  const h = round || value.style === 'square' ? w : w / 3;
  const x = value.position.endsWith('right')
    ? width - w - Math.min(value.horizontalMargin, width - w)
    : Math.min(value.horizontalMargin, width - w);
  const y = value.position.startsWith('bottom')
    ? height - h - Math.min(value.verticalMargin, height - h)
    : Math.min(value.verticalMargin, height - h);
  return (
    <Box
      component="svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t`Countdown preview`}
      sx={{
        width: '100%',
        borderRadius: 2,
        background: 'linear-gradient(135deg,#251b22,#111318)',
      }}
    >
      <text
        x="960"
        y="520"
        textAnchor="middle"
        fill="#888"
        fontSize={height / 15}
      >
        <Trans>Channel preview</Trans>
      </text>
      {value.enabled && (
        <g transform={`translate(${x},${y})`} opacity={value.opacity}>
          {round ? (
            <>
              <circle
                cx={w / 2}
                cy={w / 2}
                r={w / 2 - 4}
                fill={value.style === 'circle' ? '#000a' : 'none'}
                stroke="#555"
                strokeWidth={w / 25}
              />
              <circle
                cx={w / 2}
                cy={w / 2}
                r={w / 2 - 4}
                fill="none"
                stroke={value.color}
                strokeWidth={w / 25}
                pathLength="100"
                strokeDasharray="65 35"
                transform={`rotate(-90 ${w / 2} ${w / 2})`}
              />
            </>
          ) : (
            value.style !== 'digital' && (
              <rect
                width={w}
                height={h}
                fill="#000a"
                rx={value.style === 'pill' ? h / 2 : 0}
              />
            )
          )}
          {value.style === 'bar' && (
            <rect y={h - 5} width={w * 0.65} height="5" fill={value.color} />
          )}
          <text
            x={w / 2}
            y={h / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill={value.color}
            fontFamily="monospace"
            fontSize={w / 8}
            direction="ltr"
          >
            00:12:34
          </text>
        </g>
      )}
      {value.enabled && value.showTitle && (
        <text
          x="960"
          y="1020"
          textAnchor="middle"
          fill="white"
          fontSize={height / 30}
        >
          <Trans>Current movie title</Trans>
        </text>
      )}
    </Box>
  );
}
function OverlayControls({ channel }: { channel: Channel }) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const queryKey = ['channel-overlay', channel.id];
  const endpoint = `/api/channels/${encodeURIComponent(channel.id)}/overlay`;
  const profile = useQuery({
    queryKey: ['channel-overlay-resolution', channel.id],
    retry: false,
    queryFn: async () => {
      const { data } = await client.instance.get<{
        resolution: { widthPx: number; heightPx: number };
      }>(`/api/channels/${encodeURIComponent(channel.id)}/transcode_config`);
      if (
        !data.resolution ||
        !Number.isFinite(data.resolution.widthPx) ||
        !Number.isFinite(data.resolution.heightPx) ||
        data.resolution.widthPx <= 0 ||
        data.resolution.heightPx <= 0
      )
        throw new Error('Invalid preview resolution');
      return data.resolution;
    },
  });
  const [value, setValue] = useState<ChannelOverlay>({
    ...DefaultChannelOverlay,
  });
  const query = useQuery({
    queryKey,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () =>
      ChannelOverlaySchema.parse((await client.instance.get(endpoint)).data),
  });
  useEffect(() => {
    if (query.data) setValue(query.data);
  }, [query.data]);
  const save = useMutation({
    mutationFn: async () =>
      ChannelOverlaySchema.parse(
        (await client.instance.put(endpoint, value)).data,
      ),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });
  const styles: Record<ChannelOverlay['style'], string> = {
    digital: t`Digital`,
    pill: t`Pill`,
    square: t`Square`,
    bar: t`Progress bar`,
    circle: t`Circle`,
    ring: t`Ring`,
  };
  const positions: Record<ChannelOverlay['position'], string> = {
    'top-left': t`Top left`,
    'top-right': t`Top right`,
    'bottom-left': t`Bottom left`,
    'bottom-right': t`Bottom right`,
  };
  const busy = query.isPending || save.isPending;
  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      <Alert severity="info">
        <Trans>
          The countdown appears inside the encoded video. Saved channels need
          preparation again after changing these settings. Only the built-in
          transcoded HLS and MPEG-TS engine is supported.
        </Trans>
      </Alert>
      {query.isError && (
        <Alert severity="error">
          <Trans>Unable to load countdown settings.</Trans>
        </Alert>
      )}
      {save.isError && (
        <Alert severity="error">
          <Trans>
            Unable to save. Check the playback engine and FFmpeg subtitle-filter
            support.
          </Trans>
        </Alert>
      )}
      {save.isSuccess && (
        <Alert severity="success">
          <Trans>Countdown settings saved.</Trans>
        </Alert>
      )}
      <OverlayPreview value={value} resolution={profile.data} />
      <FormControlLabel
        control={
          <Switch
            checked={value.enabled}
            disabled={busy}
            onChange={(_, enabled) => setValue({ ...value, enabled })}
          />
        }
        label={t`Show countdown in video`}
      />
      <TextField
        select
        label={t`Countdown style`}
        value={value.style}
        disabled={busy}
        onChange={(e) =>
          setValue({
            ...value,
            style: ChannelOverlaySchema.shape.style.parse(e.target.value),
          })
        }
      >
        {Object.entries(styles).map(([style, label]) => (
          <MenuItem key={style} value={style}>
            {label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label={t`Countdown position`}
        value={value.position}
        disabled={busy}
        onChange={(e) =>
          setValue({
            ...value,
            position: ChannelOverlaySchema.shape.position.parse(e.target.value),
          })
        }
      >
        {Object.entries(positions).map(([position, label]) => (
          <MenuItem key={position} value={position}>
            {label}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          type="number"
          label={t`Countdown size (pixels)`}
          value={value.size}
          disabled={busy}
          onChange={(e) => setValue({ ...value, size: Number(e.target.value) })}
          slotProps={{ htmlInput: { min: 60, max: 480 } }}
        />
        <TextField
          type="color"
          label={t`Countdown color`}
          value={value.color}
          disabled={busy}
          onChange={(e) => setValue({ ...value, color: e.target.value })}
        />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          type="number"
          label={t`Horizontal margin (pixels)`}
          value={value.horizontalMargin}
          disabled={busy}
          onChange={(e) =>
            setValue({ ...value, horizontalMargin: Number(e.target.value) })
          }
          slotProps={{ htmlInput: { min: 0, max: 500 } }}
        />
        <TextField
          type="number"
          label={t`Vertical margin (pixels)`}
          value={value.verticalMargin}
          disabled={busy}
          onChange={(e) =>
            setValue({ ...value, verticalMargin: Number(e.target.value) })
          }
          slotProps={{ htmlInput: { min: 0, max: 500 } }}
        />
      </Stack>
      <Box>
        <Typography id="overlay-opacity">
          <Trans>Countdown opacity</Trans>
        </Typography>
        <Slider
          aria-labelledby="overlay-opacity"
          value={Math.round(value.opacity * 100)}
          min={0}
          max={100}
          step={5}
          disabled={busy}
          valueLabelDisplay="auto"
          valueLabelFormat={(value) => `${value}%`}
          onChange={(_, opacity) => {
            if (typeof opacity === 'number')
              setValue({ ...value, opacity: opacity / 100 });
          }}
        />
      </Box>
      <FormControlLabel
        control={
          <Switch
            checked={value.hideOnFillers}
            disabled={busy}
            onChange={(_, hideOnFillers) =>
              setValue({ ...value, hideOnFillers })
            }
          />
        }
        label={t`Hide during fillers`}
      />
      <FormControlLabel
        control={
          <Switch
            checked={value.showTitle}
            disabled={busy}
            onChange={(_, showTitle) => setValue({ ...value, showTitle })}
          />
        }
        label={t`Show current title in video`}
      />
      <Button
        variant="contained"
        disabled={
          busy ||
          query.isError ||
          !ChannelOverlaySchema.safeParse(value).success
        }
        onClick={() => save.mutate()}
      >
        <Trans>Save countdown settings</Trans>
      </Button>
    </Stack>
  );
}
export function ChannelOverlayDialog({
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
      aria-labelledby="channel-overlay-title"
    >
      <DialogTitle id="channel-overlay-title">
        <Trans>Video countdown: {channel.name}</Trans>
      </DialogTitle>
      <DialogContent>
        {open && <OverlayControls key={channel.id} channel={channel} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          <Trans>Close</Trans>
        </Button>
      </DialogActions>
    </Dialog>
  );
}
