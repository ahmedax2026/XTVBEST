import { act, renderWithProviders, screen } from '@/test/utils';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ChannelNowPlayingCard } from './ChannelNowPlayingCard.tsx';

const clock = vi.hoisted(() => ({ stop: 0, updated: 1 }));
vi.mock('../../hooks/useChannelLineup.ts', () => ({
  useChannelAndProgramming: () => ({ data: { lineup: { programs: {} } } }),
}));
vi.mock('../../hooks/useTvGuide.ts', () => ({
  useChannelNowPlaying: () => ({
    data: { type: 'flex', start: clock.stop - 60_000, stop: clock.stop },
    dataUpdatedAt: clock.updated,
  }),
}));
afterEach(() => vi.useRealTimers());

describe('now playing clock', () => {
  test('counts down every second and refreshes after the end, rather than using an epoch timestamp as a timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    clock.stop = Date.now() + 3_000;
    clock.updated = 1;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity } },
    });
    const refresh = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const { rerender, unmount } = renderWithProviders(
      <ChannelNowPlayingCard channelId="channel-a" />,
      { queryClient },
    );
    expect(screen.getByText('00:00:03')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByText('00:00:02')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByText('00:00:00')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
    // A successful response still describing the old program schedules a retry.
    clock.updated = 2;
    rerender(<ChannelNowPlayingCard channelId="channel-a" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    clock.stop = Date.now() + 61_000;
    clock.updated = 3;
    rerender(<ChannelNowPlayingCard channelId="channel-a" />);
    expect(screen.getByText('00:01:01')).toBeInTheDocument();
    unmount();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
