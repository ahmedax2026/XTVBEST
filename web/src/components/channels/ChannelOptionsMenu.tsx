import { ChannelOverlayDialog } from './ChannelOverlayDialog.tsx';
import { ChannelArchiveDialog } from './ChannelArchiveDialog.tsx';
import type { channelListOptions } from '@/types/index.ts';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  Timer,
  Archive,
  ContentCopy,
  CopyAll,
  Delete,
  Edit,
  MonitorHeart,
  Tv,
} from '@mui/icons-material';
import { ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { Link } from '@tanstack/react-router';
import type { Channel } from '@tunarr/types';
import type { SyntheticEvent } from 'react';
import { useCallback, useState } from 'react';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard.ts';
import { useCreateChannel } from '../../hooks/useCreateChannel.ts';
import { useSettings } from '../../store/settings/selectors.ts';
import type { PopoverAnchorEl } from '../../types/dom.ts';
import { ChannelDeleteDialog } from './ChannelDeleteDialog.tsx';
import { channelStreamUrl } from './channelSummary.ts';
import { ChannelSessionsDialog } from './ChannelSessionsDialog.tsx';

type Props = {
  row: Channel;
  anchorEl: PopoverAnchorEl;
  open: boolean;
  onClose: (e?: SyntheticEvent) => void;
  hideItems?: channelListOptions[];

  // ID of the button that opens the menu, which names it for screen readers.
  labelledBy?: string;
};

export const ChannelOptionsMenu = ({
  row,
  anchorEl,
  open,
  onClose,
  hideItems,
  labelledBy,
}: Props) => {
  const { backendUri } = useSettings();
  const copyToClipboard = useCopyToClipboard();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { t } = useLingui();
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);

  const duplicateChannelMutation = useCreateChannel();

  const handleClose = useCallback(
    (e: SyntheticEvent) => {
      e.stopPropagation();
      onClose(e);
    },
    [onClose],
  );

  const { id: channelId, name: channelName } = row;

  return (
    <>
      <Menu
        id="channel-options-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        slotProps={{
          list: {
            'aria-labelledby': labelledBy,
          },
        }}
      >
        {!hideItems?.includes('edit') ? (
          <MenuItem
            to={`/channels/${channelId}/edit`}
            component={Link}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <ListItemIcon>
              <Edit />
            </ListItemIcon>
            <ListItemText>
              <Trans>Edit Channel</Trans>
            </ListItemText>
          </MenuItem>
        ) : null}

        {!hideItems?.includes('programming') ? (
          <MenuItem
            to={`/channels/${channelId}/programming`}
            component={Link}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <ListItemIcon>
              <Edit />
            </ListItemIcon>
            <ListItemText>
              <Trans>Modify Programming</Trans>
            </ListItemText>
          </MenuItem>
        ) : null}

        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            const url = channelStreamUrl(backendUri, channelId);
            copyToClipboard(
              url,
              t`Copied channel "${channelName}" m3u link to clipboard`,
              t`Error copying channel m3u link to clipboard`,
            )
              .catch(console.error)
              .finally(() => {
                onClose();
              });
          }}
        >
          <ListItemIcon>
            <ContentCopy />
          </ListItemIcon>
          <ListItemText>
            <Trans>Copy M3U URL</Trans>
          </ListItemText>
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(channelId, t`Copied Channel ID!`)
              .catch(console.error)
              .finally(() => {
                onClose(e);
              });
          }}
        >
          <ListItemIcon>
            <ContentCopy />
          </ListItemIcon>
          <ListItemText>
            <Trans>Copy Channel ID</Trans>
          </ListItemText>
        </MenuItem>

        {!hideItems?.includes('watch') ? (
          <MenuItem
            component={Link}
            to={`/channels/${channelId}/watch`}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <ListItemIcon>
              <Tv />
            </ListItemIcon>
            <ListItemText>
              <Trans>Watch Channel</Trans>
            </ListItemText>
          </MenuItem>
        ) : null}
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            setMonitorOpen(true);
            onClose(e);
          }}
        >
          <ListItemIcon>
            <MonitorHeart />
          </ListItemIcon>
          <ListItemText primary={t`Live monitor`} />
        </MenuItem>
        {!hideItems?.includes('duplicate') && (
          <MenuItem
            onClick={(e) => {
              e.stopPropagation();
              duplicateChannelMutation.mutate({
                body: {
                  type: 'copy',
                  channelId,
                },
              });
              handleClose(e);
            }}
          >
            <ListItemIcon>
              <CopyAll />{' '}
            </ListItemIcon>
            <ListItemText>
              <Trans>Duplicate Channel</Trans>
            </ListItemText>
          </MenuItem>
        )}
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            setArchiveOpen(true);
            onClose();
          }}
        >
          <ListItemIcon>
            <Archive />
          </ListItemIcon>
          <ListItemText>
            <Trans>Saved channel</Trans>
          </ListItemText>
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            setOverlayOpen(true);
            onClose();
          }}
        >
          <ListItemIcon>
            <Timer />
          </ListItemIcon>
          <ListItemText>
            <Trans>Video countdown</Trans>
          </ListItemText>
        </MenuItem>
        {!hideItems?.includes('delete') && (
          <MenuItem
            onClick={(e) => {
              e.stopPropagation();
              setDeleteConfirmOpen(true);
            }}
          >
            <ListItemIcon>
              <Delete />
            </ListItemIcon>
            <ListItemText>
              <Trans>Delete Channel</Trans>
            </ListItemText>
          </MenuItem>
        )}
      </Menu>
      <ChannelOverlayDialog
        channel={row}
        open={overlayOpen}
        onClose={() => setOverlayOpen(false)}
      />
      <ChannelArchiveDialog
        channel={row}
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
      />
      <ChannelSessionsDialog
        open={monitorOpen}
        channel={row}
        onClose={() => setMonitorOpen(false)}
      />
      <ChannelDeleteDialog
        open={deleteConfirmOpen}
        onClose={(e) => {
          setDeleteConfirmOpen(false);
          handleClose(e);
        }}
        channel={row}
      />
    </>
  );
};
