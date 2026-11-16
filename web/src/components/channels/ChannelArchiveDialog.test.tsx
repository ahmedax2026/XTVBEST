import { renderWithProviders, screen, fireEvent, waitFor } from '@/test/utils';
import { beforeEach, expect, test, vi } from 'vitest';
import { ChannelArchiveDialog } from './ChannelArchiveDialog.tsx';
import type { Channel } from '@tunarr/types';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../generated/client.gen.ts', () => ({ client: { instance: api } }));
const channel = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Cinema',
} as Channel;
const ready = { state: 'ready', completed: 2, total: 2, bytes: 1024 };
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: ready });
  api.post.mockResolvedValue({ data: { ...ready, state: 'pending' } });
});
test('does not poll when closed', () => {
  renderWithProviders(
    <ChannelArchiveDialog channel={channel} open={false} onClose={() => {}} />,
  );
  expect(api.get).not.toHaveBeenCalled();
});
test('shows preparation progress and sends a boundary-switch request', async () => {
  renderWithProviders(
    <ChannelArchiveDialog channel={channel} open onClose={() => {}} />,
  );
  expect(await screen.findByText('Archive ready')).toBeInTheDocument();
  expect(screen.getByText('Prepared 2 of 2 programs')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Switch to saved channel' }),
  );
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      `/api/channels/${channel.id}/archive/mode`,
      { mode: 'archive' },
    ),
  );
  expect(
    await screen.findByText('Switching at the next program'),
  ).toBeInTheDocument();
});
test('shows failed requests and prevents preparation using invalid resource limits', async () => {
  api.post.mockRejectedValue(new Error('Offline'));
  renderWithProviders(
    <ChannelArchiveDialog channel={channel} open onClose={() => {}} />,
  );
  await screen.findByText('Archive ready');
  fireEvent.change(screen.getByLabelText('Preparation threads'), {
    target: { value: '0' },
  });
  expect(
    screen.getByRole('button', { name: 'Prepare saved channel' }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Switch to saved channel' }),
  );
  expect(
    await screen.findByText(/The archive operation could not be completed/),
  ).toBeInTheDocument();
});
test('allows cancellation while preparing and keeps mode switching disabled', async () => {
  api.get.mockResolvedValue({
    data: { ...ready, state: 'preparing', completed: 1 },
  });
  renderWithProviders(
    <ChannelArchiveDialog channel={channel} open onClose={() => {}} />,
  );
  await screen.findByText('Preparing archive');
  expect(
    screen.getByRole('button', { name: 'Switch to saved channel' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel preparation' }));
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      `/api/channels/${channel.id}/archive/cancel`,
      undefined,
    ),
  );
});
