import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/utils';
import { beforeEach, expect, test, vi } from 'vitest';
import AccessSettingsPage from './AccessSettingsPage.tsx';

const api = vi.hoisted(() => ({ get: vi.fn(), request: vi.fn() }));
const settings = vi.hoisted(() => ({ ui: { i18n: { locale: 'en' } } }));
vi.mock('../../generated/client.gen.ts', () => ({ client: { instance: api } }));
vi.mock('../../store/settings/selectors.ts', () => ({
  useSettings: () => settings,
}));
let status = {
  configured: true,
  owner: true,
  issuer: false,
  required: true,
  valid: false,
  installation: 'a'.repeat(64),
};
beforeEach(() => {
  vi.clearAllMocks();
  settings.ui.i18n.locale = 'en';
  status = {
    configured: true,
    owner: true,
    issuer: false,
    required: true,
    valid: false,
    installation: 'a'.repeat(64),
  };
  api.get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url.endsWith('/status')
        ? status
        : url.endsWith('/public-key')
          ? { publicKey: 'public fixture' }
          : [],
    }),
  );
  api.request.mockResolvedValue({ data: { ok: true } });
});
test('ordinary users cannot see owner controls or load owner lists', async () => {
  status.owner = false;
  renderWithProviders(<AccessSettingsPage />);
  await screen.findByText(
    'This administration is available to the owner account only.',
  );
  expect(
    screen.queryByRole('button', { name: 'Add user' }),
  ).not.toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(1);
});
test('owner adds an account and password field is cleared after success', async () => {
  renderWithProviders(<AccessSettingsPage />);
  await screen.findByRole('button', { name: 'Add user' });
  fireEvent.change(screen.getByLabelText(/Username/), {
    target: { value: 'operator' },
  });
  fireEvent.change(screen.getByLabelText(/Password — at least 12 characters/), {
    target: { value: 'long-user-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      method: 'post',
      url: '/api/access/users',
      data: { username: 'operator', password: 'long-user-password' },
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByLabelText(/Password — at least 12 characters/),
    ).toHaveValue(''),
  );
});
test('unlicensed owner can activate and sees API errors', async () => {
  api.request.mockRejectedValue(new Error('Issuer offline'));
  renderWithProviders(<AccessSettingsPage />);
  await screen.findByLabelText('Activation code');
  fireEvent.change(screen.getByLabelText('Activation code'), {
    target: { value: 'signed-token' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Activate installation' }),
  );
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      method: 'post',
      url: '/api/access/activate',
      data: { token: 'signed-token' },
    }),
  );
  expect(await screen.findByText(/Operation failed/)).toBeInTheDocument();
});
test('issuer tools appear in Arabic only on the owner issuer installation', async () => {
  status.issuer = true;
  settings.ui.i18n.locale = 'ar';
  renderWithProviders(<AccessSettingsPage />);
  expect(
    await screen.findByRole('button', { name: 'إصدار ليسانس' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/معرّف سيرفر العميل/)).toBeInTheDocument();
});

test('issuer can bind a new user to a customer server from the panel', async () => {
  status.issuer = true;
  renderWithProviders(<AccessSettingsPage />);
  await screen.findByRole('button', { name: 'Add user' });
  fireEvent.change(screen.getByLabelText(/Username/), {
    target: { value: 'customer-user' },
  });
  fireEvent.change(screen.getByLabelText(/Password — at least 12 characters/), {
    target: { value: 'customer-long-password' },
  });
  fireEvent.change(
    screen.getByLabelText('User server ID — blank for this installation'),
    { target: { value: 'b'.repeat(64) } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      method: 'post',
      url: '/api/access/users',
      data: {
        username: 'customer-user',
        password: 'customer-long-password',
        installation: 'b'.repeat(64),
      },
    }),
  );
});

test('issuer submits a server-bound expiring license and displays the signed code', async () => {
  status.issuer = true;
  api.request.mockResolvedValue({ data: { token: 'signed-code-fixture' } });
  renderWithProviders(<AccessSettingsPage />);
  await screen.findByRole('button', { name: 'Issue license' });
  fireEvent.change(screen.getByLabelText(/Customer name/), {
    target: { value: 'Customer' },
  });
  fireEvent.change(screen.getByLabelText(/Customer installation ID/), {
    target: { value: 'b'.repeat(64) },
  });
  fireEvent.change(screen.getByLabelText(/License expiry/), {
    target: { value: '2030-12-01T10:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Issue license' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      method: 'post',
      url: '/api/access/licenses',
      data: {
        customer: 'Customer',
        installation: 'b'.repeat(64),
        expiresAt: new Date('2030-12-01T10:00').toISOString(),
      },
    }),
  );
  expect(
    await screen.findByLabelText('License code — copy for customer'),
  ).toHaveValue('signed-code-fixture');
});
