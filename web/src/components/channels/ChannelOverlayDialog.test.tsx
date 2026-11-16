import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/utils';
import { beforeEach, expect, test, vi } from 'vitest';
import { DefaultChannelOverlay } from '@tunarr/types';
import type { Channel } from '@tunarr/types';
import { ChannelOverlayDialog } from './ChannelOverlayDialog.tsx';
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('../../generated/client.gen.ts', () => ({ client: { instance: api } }));
const channel = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Cinema',
} as Channel;
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async (url: string) => ({
    data: url.endsWith('/transcode_config')
      ? { resolution: { widthPx: 1280, heightPx: 720 } }
      : DefaultChannelOverlay,
  }));
  api.put.mockImplementation(async (_url: string, body: object) => ({
    data: body,
  }));
});
test('does not fetch settings or a preview while closed', () => {
  renderWithProviders(
    <ChannelOverlayDialog channel={channel} open={false} onClose={() => {}} />,
  );
  expect(api.get).not.toHaveBeenCalled();
});
test('previews the channel resolution and saves edited countdown settings', async () => {
  renderWithProviders(
    <ChannelOverlayDialog channel={channel} open onClose={() => {}} />,
  );
  const save = await screen.findByRole('button', {
    name: 'Save countdown settings',
  });
  await waitFor(() => expect(save).toBeEnabled());
  expect(
    screen.getByRole('img', { name: 'Countdown preview' }),
  ).toHaveAttribute('viewBox', '0 0 1280 720');
  fireEvent.click(screen.getByLabelText('Show countdown in video'));
  fireEvent.change(screen.getByLabelText('Countdown size (pixels)'), {
    target: { value: '240' },
  });
  fireEvent.click(save);
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith(
      `/api/channels/${channel.id}/overlay`,
      expect.objectContaining({ enabled: true, size: 240, style: 'ring' }),
    ),
  );
  expect(
    await screen.findByText('Countdown settings saved.'),
  ).toBeInTheDocument();
});
test('rejects invalid dimensions and reports failed saves without a success message', async () => {
  api.put.mockRejectedValue(new Error('Unsupported encoder'));
  renderWithProviders(
    <ChannelOverlayDialog channel={channel} open onClose={() => {}} />,
  );
  const save = await screen.findByRole('button', {
    name: 'Save countdown settings',
  });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Countdown size (pixels)'), {
    target: { value: '-1' },
  });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Countdown size (pixels)'), {
    target: { value: '160' },
  });
  fireEvent.click(save);
  expect(
    await screen.findByText(/Unable to save. Check the playback engine/),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('Countdown settings saved.'),
  ).not.toBeInTheDocument();
});
test('keeps saving disabled when settings could not be loaded', async () => {
  api.get.mockRejectedValue(new Error('Offline'));
  renderWithProviders(
    <ChannelOverlayDialog channel={channel} open onClose={() => {}} />,
  );
  await screen.findByText(
    'Unable to load countdown settings.',
    {},
    { timeout: 5000 },
  );
  expect(
    screen.getByRole('button', { name: 'Save countdown settings' }),
  ).toBeDisabled();
});

test('previews and saves custom title text and rejects invalid title sizes', async () => {
  renderWithProviders(
    <ChannelOverlayDialog channel={channel} open onClose={() => {}} />,
  );
  const save = await screen.findByRole('button', {
    name: 'Save countdown settings',
  });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(screen.getByLabelText('Show countdown in video'));
  fireEvent.click(screen.getByLabelText('Show current title in video'));
  fireEvent.change(screen.getByLabelText('Custom title text'), {
    target: { value: 'عنوان الاختبار' },
  });
  fireEvent.change(screen.getByLabelText('Title font size'), {
    target: { value: '-1' },
  });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Title font size'), {
    target: { value: '48' },
  });
  expect(screen.getByText('عنوان الاختبار')).toHaveAttribute('font-size', '48');
  fireEvent.click(save);
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith(
      '/api/channels/' + channel.id + '/overlay',
      expect.objectContaining({
        title: expect.objectContaining({
          text: 'عنوان الاختبار',
          fontSize: 48,
        }),
      }),
    ),
  );
});
