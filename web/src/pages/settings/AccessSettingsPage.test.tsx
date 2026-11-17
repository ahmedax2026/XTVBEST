import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  seededQueryClient,
} from '@/test/utils';
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
        validation: 'online',
      },
    }),
  );
  expect(
    await screen.findByLabelText('License code — copy for customer'),
  ).toHaveValue('signed-code-fixture');
});

test('owner selects offline issuance and sees local-login and revocation limitations', async () => {
  status.issuer = true;
  renderWithProviders(<AccessSettingsPage />);
  await screen.findByRole('button', { name: 'Issue license' });
  fireEvent.mouseDown(
    screen.getByRole('combobox', { name: 'Validation mode' }),
  );
  fireEvent.click(
    await screen.findByRole('option', { name: 'Offline — valid until expiry' }),
  );
  expect(screen.getByText(/Use a local account/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Customer name/), {
    target: { value: 'Offline customer' },
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
        customer: 'Offline customer',
        installation: 'b'.repeat(64),
        expiresAt: new Date('2030-12-01T10:00').toISOString(),
        validation: 'offline',
      },
    }),
  );
});

test('offline license card prevents presenting remote revocation as effective', async () => {
  status.issuer = true;
  api.get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url.endsWith('/status')
        ? status
        : url.endsWith('/licenses')
          ? [
              {
                enabled: true,
                payload: {
                  id: 'license-id',
                  customer: 'Offline customer',
                  installation: 'b'.repeat(64),
                  expiresAt: '2030-12-01T10:00:00Z',
                  validation: 'offline',
                },
              },
            ]
          : url.endsWith('/public-key')
            ? { publicKey: 'public fixture' }
            : [],
    }),
  );
  renderWithProviders(<AccessSettingsPage />);
  expect(
    await screen.findByText(
      /This license cannot be revoked remotely/,
      {},
      { timeout: 5000 },
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Disable license' }),
  ).toBeDisabled();
});

function ownerFixture() {
  status.issuer = true;
  const response = (url: string) => ({
    data: url.endsWith('/status')
      ? status
      : url.endsWith('/users')
        ? [
            {
              username: 'client@example.com',
              enabled: true,
              installation: 'b'.repeat(64),
            },
          ]
        : url.endsWith('/licenses')
          ? [
              {
                enabled: true,
                payload: {
                  id: 'issued-id',
                  customer: 'Client',
                  installation: 'b'.repeat(64),
                  expiresAt: '2035-01-01T00:00:00Z',
                },
              },
            ]
          : url.endsWith('/public-key')
            ? { publicKey: 'public fixture' }
            : [],
  });
  api.get.mockImplementation((url: string) => Promise.resolve(response(url)));
  return seededQueryClient(
    ['status', 'users', 'licenses', 'public-key', 'audit'].map((name) => [
      [`access-${name}`],
      name === 'public-key'
        ? 'public fixture'
        : response(`/api/access/${name}`).data,
    ]),
  );
}

test('owner resets a password and server binding through the account dialog', async () => {
  const queryClient = ownerFixture();
  renderWithProviders(<AccessSettingsPage />, { queryClient });
  fireEvent.click(await screen.findByRole('button', { name: 'Edit account' }));
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'new-customer-password' },
  });
  fireEvent.change(screen.getByLabelText('Linked server ID'), {
    target: { value: 'c'.repeat(64) },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save account' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      method: 'patch',
      url: '/api/access/users/client%40example.com',
      data: {
        enabled: true,
        password: 'new-customer-password',
        installation: 'c'.repeat(64),
      },
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
});
test('viewing an issued code uses a read request and never enables or renews the license', async () => {
  const queryClient = ownerFixture();
  api.request.mockResolvedValue({ data: { token: 'existing-code' } });
  renderWithProviders(<AccessSettingsPage />, { queryClient });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Show license code' }),
  );
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      method: 'get',
      url: '/api/access/licenses/issued-id/code',
      data: undefined,
    }),
  );
  expect(
    await screen.findByLabelText('License code — copy for customer'),
  ).toHaveValue('existing-code');
});
test('search filters account and customer records without losing the loaded totals', async () => {
  const queryClient = ownerFixture();
  renderWithProviders(<AccessSettingsPage />, { queryClient });
  await screen.findByRole('button', { name: 'Edit account' });
  fireEvent.change(
    screen.getByLabelText('Search customer, account or server ID'),
    { target: { value: 'no match' } },
  );
  expect(await screen.findByText('No matching accounts.')).toBeInTheDocument();
  expect(screen.getByText('No matching licenses.')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Edit account' }),
  ).not.toBeInTheDocument();
  fireEvent.change(
    screen.getByLabelText('Search customer, account or server ID'),
    { target: { value: 'client' } },
  );
  expect(
    await screen.findByRole('button', { name: 'Edit account' }),
  ).toBeInTheDocument();
});
