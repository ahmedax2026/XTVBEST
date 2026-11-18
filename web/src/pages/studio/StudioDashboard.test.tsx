import { fireEvent, renderWithProviders, screen, within } from '@/test/utils';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { expect, test, vi } from 'vitest';
import { makeStoryChannel } from '../../components/channels/channelStoryFixtures.ts';
import { StudioDashboardView } from './StudioDashboard.tsx';
import type { StudioDashboardProps } from './StudioDashboard.tsx';
import useStore from '../../store/index.ts';

const renderStudio = async (props: Partial<StudioDashboardProps> = {}) => {
  useStore.setState((s) => {
    s.settings.ui.i18n.locale = 'en';
  });
  const defaults: StudioDashboardProps = {
    channels: [
      makeStoryChannel({ name: 'Cinema', sessions: [], programCount: 7 }),
      makeStoryChannel({
        id: 'two',
        number: 2,
        name: 'Drama',
        sessions: [],
        programCount: 3,
      }),
    ],
    nowPlaying: new Map(),
    loading: false,
    error: false,
    refreshing: false,
    onRefresh: vi.fn(),
  };
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <StudioDashboardView {...defaults} {...props} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  renderWithProviders(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'Your channels. Your control.' });
};
test('studio metrics use channel data and search filters real channel cards', async () => {
  await renderStudio();
  expect(
    within(screen.getByRole('region', { name: 'Total channels' })).getByText(
      '2',
    ),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole('region', { name: 'Scheduled items' })).getByText(
      '10',
    ),
  ).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(2);
  fireEvent.change(screen.getByRole('textbox', { name: 'Search channels' }), {
    target: { value: 'cinema' },
  });
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByRole('article', { name: 'Cinema' })).toBeInTheDocument();
});
test('unavailable metrics do not masquerade as live zeroes and retry calls the server action', async () => {
  const onRefresh = vi.fn();
  await renderStudio({ error: true, onRefresh });
  expect(
    within(screen.getByRole('region', { name: 'Total channels' })).getByText(
      '—',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRefresh).toHaveBeenCalledOnce();
});
test('empty studios lead to channel creation and preserve guide and license links', async () => {
  await renderStudio({ channels: [] });
  expect(
    screen.getByText('Your studio is ready for its first channel'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Create your first channel' }),
  ).toHaveAttribute('href', '/channels/new');
  expect(
    screen.getByRole('link', { name: /Users and licenses/ }),
  ).toHaveAttribute('href', '/settings/access');
  expect(screen.getByRole('link', { name: 'Program guide' })).toHaveAttribute(
    'href',
    '/guide',
  );
});
