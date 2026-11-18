import { act, renderWithProviders, screen, waitFor } from '@/test/utils';
import type { ChannelSession } from '@tunarr/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as Sdk from '../../generated/sdk.gen.ts';
import type * as Settings from '../../store/settings/selectors.ts';
import { ChannelSessionsDialog } from './ChannelSessionsDialog.tsx';
import { makeStoryChannel } from './channelStoryFixtures.ts';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  stop: vi.fn(),
  copy: vi.fn(),
}));
vi.mock('../../generated/sdk.gen.ts', async (original) => ({
  ...(await original<typeof Sdk>()),
  getApiSessions: mocks.get,
  deleteApiChannelsByIdSessions: mocks.stop,
}));
vi.mock('../../hooks/useCopyToClipboard.ts', () => ({
  useCopyToClipboard: () => mocks.copy,
}));
vi.mock('../../store/settings/selectors.ts', async (original) => ({
  ...(await original<typeof Settings>()),
  useSettings: () => ({ backendUri: 'https://backend.test/studio/' }),
}));
const channel = makeStoryChannel({
  id: 'channel-stable-id',
  number: 17,
  name: 'Movies',
});
const session: ChannelSession = {
  type: 'hls',
  state: 'started',
  numConnections: 2,
  connections: [
    {
      ip: '192.0.2.5',
      lastHeartbeat: 1_700_000_000_000,
      userAgent: 'Test Player',
    },
  ],
};
let current: Record<string, ChannelSession[]>;
const renderDialog = (open = true) =>
  renderWithProviders(
    <ChannelSessionsDialog open={open} channel={channel} onClose={() => {}} />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  current = {
    [channel.id]: [session],
    another: [{ ...session, numConnections: 99 }],
  };
  mocks.get.mockImplementation(async () => ({ data: current }));
  mocks.stop.mockImplementation(async () => {
    current = { ...current, [channel.id]: [] };
    return { data: undefined };
  });
  mocks.copy.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('channel live monitor', () => {
  test('reads current server data and separates channel sessions from other channels', async () => {
    renderDialog();
    expect(await screen.findByText('192.0.2.5')).toBeInTheDocument();
    expect(screen.getByText('1 sessions')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Test Player')).toBeInTheDocument();
    expect(screen.queryByText('99 stream connections')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Stable HLS URL')).toHaveValue(
      `https://backend.test/studio/stream/channels/${channel.id}.m3u8`,
    );
  });

  test('refreshes without keeping stale sessions after the server reports an empty list', async () => {
    const { user } = renderDialog();
    await screen.findByText('192.0.2.5');
    current = {};
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(
      await screen.findByText('No active sessions for this channel.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('192.0.2.5')).not.toBeInTheDocument();
  });

  test('stops the UUID-selected channel and refreshes only after confirmation from the server', async () => {
    const { user } = renderDialog();
    await screen.findByText('192.0.2.5');
    await user.click(screen.getByRole('button', { name: 'Stop sessions' }));
    expect(mocks.stop).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: channel.id } }),
    );
    expect(
      await screen.findByText('No active sessions for this channel.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Stop sessions' }),
    ).toBeDisabled();
  });

  test('keeps visible sessions and reports a failed stop', async () => {
    mocks.stop.mockRejectedValue({ response: { status: 500 } });
    const { user } = renderDialog();
    await screen.findByText('192.0.2.5');
    await user.click(screen.getByRole('button', { name: 'Stop sessions' }));
    expect(
      await screen.findByText('Unable to stop sessions. Try again.'),
    ).toBeInTheDocument();
    expect(screen.getByText('192.0.2.5')).toBeInTheDocument();
  });

  test('handles sessions already stopped by another client', async () => {
    mocks.stop.mockImplementation(async () => {
      current = {};
      throw { response: { status: 404 } };
    });
    const { user } = renderDialog();
    await screen.findByText('192.0.2.5');
    await user.click(screen.getByRole('button', { name: 'Stop sessions' }));
    expect(
      await screen.findByText('No active sessions for this channel.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Unable to stop sessions. Try again.'),
    ).not.toBeInTheDocument();
  });

  test('copies the stable stream link rather than a number-based link', async () => {
    const { user } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Copy stream URL' }));
    expect(mocks.copy).toHaveBeenCalledWith(
      `https://backend.test/studio/stream/channels/${channel.id}.m3u8`,
    );
  });

  test('reports a failed refresh without presenting an empty list as a confirmed offline state', async () => {
    mocks.get.mockRejectedValue(new Error('Network unavailable'));
    renderDialog();
    expect(
      await screen.findByText(
        'Unable to refresh sessions. Previously loaded values may be out of date.',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No active sessions for this channel.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Stop sessions' }),
    ).toBeDisabled();
  });

  test('keeps dialog actions from triggering the surrounding channel row', async () => {
    const navigate = vi.fn();
    const { user } = renderWithProviders(
      <div onClick={navigate}>
        <ChannelSessionsDialog open channel={channel} onClose={() => {}} />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Copy stream URL' }));
    expect(mocks.copy).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  test('does not fetch while closed', () => {
    renderDialog(false);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  test('polls while open and cleans up polling when closed', async () => {
    vi.useFakeTimers();
    const { unmount } = renderDialog();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  test('disables duplicate stop requests while the first request is pending', async () => {
    let finish: (() => void) | undefined;
    mocks.stop.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ data: undefined });
        }),
    );
    const { user } = renderDialog();
    await screen.findByText('192.0.2.5');
    await user.click(screen.getByRole('button', { name: 'Stop sessions' }));
    expect(
      screen.getByRole('button', { name: 'Stopping sessions…' }),
    ).toBeDisabled();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish?.();
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Stop sessions' }),
      ).toBeEnabled(),
    );
  });
});
