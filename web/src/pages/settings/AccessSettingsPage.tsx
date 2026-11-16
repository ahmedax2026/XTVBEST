import {
  Alert,
  Button,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { client } from '../../generated/client.gen.ts';
import { useSettings } from '../../store/settings/selectors.ts';

type License = {
  id: string;
  customer: string;
  installation: string;
  expiresAt: string;
};
type Status = {
  owner: boolean;
  issuer: boolean;
  configured: boolean;
  required: boolean;
  valid: boolean;
  installation: string;
  license?: License;
};
type Account = { username: string; enabled: boolean; installation?: string };
type Issued = { payload: License; enabled: boolean };

export default function AccessSettingsPage() {
  const ar = useSettings().ui.i18n.locale === 'ar';
  const label = (arabic: string, english: string) => (ar ? arabic : english);
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userInstallation, setUserInstallation] = useState('');
  const [customer, setCustomer] = useState('');
  const [installation, setInstallation] = useState('');
  const [expires, setExpires] = useState('');
  const [token, setToken] = useState('');
  const [output, setOutput] = useState('');
  const [renewals, setRenewals] = useState<Record<string, string>>({});
  const status = useQuery({
    queryKey: ['access-status'],
    queryFn: async () =>
      (await client.instance.get<Status>('/api/access/status')).data,
    retry: false,
  });
  const users = useQuery({
    queryKey: ['access-users'],
    enabled: status.data?.owner === true,
    queryFn: async () =>
      (await client.instance.get<Account[]>('/api/access/users')).data,
  });
  const licenses = useQuery({
    queryKey: ['access-licenses'],
    enabled: status.data?.owner === true && status.data.issuer,
    queryFn: async () =>
      (await client.instance.get<Issued[]>('/api/access/licenses')).data,
  });
  const publicKey = useQuery({
    queryKey: ['access-public-key'],
    enabled: status.data?.owner === true && status.data.issuer,
    queryFn: async () =>
      (
        await client.instance.get<{ publicKey: string }>(
          '/api/access/public-key',
        )
      ).data.publicKey,
  });
  const action = useMutation({
    mutationFn: async ({
      method,
      url,
      body,
    }: {
      method: 'post' | 'patch' | 'delete';
      url: string;
      body?: object;
    }) => {
      const result = await client.instance.request<{ token?: string }>({
        method,
        url: `/api/access${url}`,
        data: body,
      });
      return result.data;
    },
    onSuccess: async (result) => {
      setPassword('');
      if (result.token) setOutput(result.token);
      await queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith('access-'),
      });
    },
  });
  const run = (
    method: 'post' | 'patch' | 'delete',
    url: string,
    body?: object,
  ) => action.mutate({ method, url, body });
  const busy = action.isPending;
  const data = status.data;
  if (!data)
    return (
      <Alert severity={status.isError ? 'error' : 'info'}>
        {label(
          'جاري تحميل إعدادات الحسابات والتفعيل…',
          'Loading accounts and activation…',
        )}
      </Alert>
    );
  return (
    <Stack spacing={3}>
      <Typography variant="h5">
        {label('اليوزرات والليسانسات', 'Users and licenses')}
      </Typography>
      {action.isError && (
        <Alert severity="error">
          {label(
            'تعذر تنفيذ العملية. راجع البيانات واتصال سيرفر التفعيل وصلاحية حساب المالك.',
            'Operation failed. Check the input, issuer connection and owner credentials.',
          )}
        </Alert>
      )}
      {action.isSuccess && (
        <Alert severity="success">
          {label('تم حفظ التغيير.', 'Change saved.')}
        </Alert>
      )}
      {!data.configured && (
        <Alert severity="warning">
          {label(
            'فعّل حساب المالك أولًا باستخدام إعدادات دخول السيرفر TUNARR_BASIC_AUTH_USER وTUNARR_BASIC_AUTH_PASSWORD ثم أعد التشغيل.',
            'Set TUNARR_BASIC_AUTH_USER and TUNARR_BASIC_AUTH_PASSWORD on the server and restart to enable the owner account.',
          )}
        </Alert>
      )}
      {data.configured && !data.owner && (
        <Alert severity="info">
          {label(
            'هذه الإدارة متاحة لحساب المالك فقط.',
            'This administration is available to the owner account only.',
          )}
        </Alert>
      )}
      {data.owner && (
        <>
          <Typography variant="h6">
            {label('إدارة اليوزرات', 'Manage users')}
          </Typography>
          <Stack
            component="form"
            spacing={2}
            onSubmit={(e) => {
              e.preventDefault();
              run('post', '/users', {
                username,
                password,
                ...(data.issuer && userInstallation
                  ? { installation: userInstallation }
                  : {}),
              });
            }}
          >
            <TextField
              required
              label={label('اسم المستخدم', 'Username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              inputProps={{ maxLength: 80 }}
              autoComplete="off"
            />
            <TextField
              required
              type="password"
              label={label(
                'كلمة السر — ١٢ حرفًا على الأقل',
                'Password — at least 12 characters',
              )}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              inputProps={{ minLength: 12, maxLength: 256 }}
              autoComplete="new-password"
            />
            {data.issuer && (
              <TextField
                label={label(
                  'معرّف سيرفر اليوزر — فارغ لنسختك الحالية',
                  'User server ID — blank for this installation',
                )}
                value={userInstallation}
                onChange={(e) => setUserInstallation(e.target.value.trim())}
                inputProps={{ pattern: '[a-f0-9]{64}' }}
              />
            )}
            <Button type="submit" variant="contained" disabled={busy}>
              {label('إضافة يوزر', 'Add user')}
            </Button>
          </Stack>
          {users.isError && (
            <Alert severity="error">
              {label('تعذر تحميل اليوزرات.', 'Unable to load users.')}
            </Alert>
          )}
          {users.data?.map((user) => (
            <Stack
              key={user.username}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems="center"
            >
              <Typography sx={{ flex: 1 }}>
                {user.username}{' '}
                {user.installation
                  ? `(${user.installation.slice(0, 12)}…)`
                  : ''}{' '}
                ·{' '}
                {user.enabled
                  ? label('نشط', 'Enabled')
                  : label('معطّل', 'Disabled')}
              </Typography>
              <Button
                disabled={busy}
                onClick={() =>
                  run('patch', `/users/${encodeURIComponent(user.username)}`, {
                    enabled: !user.enabled,
                  })
                }
              >
                {user.enabled
                  ? label('تعطيل', 'Disable')
                  : label('تفعيل', 'Enable')}
              </Button>
              <Button
                color="error"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      label(
                        `حذف اليوزر ${user.username}؟`,
                        `Delete user ${user.username}?`,
                      ),
                    )
                  )
                    run(
                      'delete',
                      `/users/${encodeURIComponent(user.username)}`,
                    );
                }}
              >
                {label('حذف', 'Delete')}
              </Button>
            </Stack>
          ))}
          <Divider />
          <Typography variant="h6">
            {label('تفعيل هذه النسخة', 'Activate this installation')}
          </Typography>
          <TextField
            label={label(
              'معرّف السيرفر — أرسله للمالك',
              'Server installation ID — send to the owner',
            )}
            value={data.installation}
            slotProps={{ input: { readOnly: true } }}
          />
          <Alert severity={data.valid ? 'success' : 'warning'}>
            {data.required
              ? data.valid
                ? label('الليسانس نشط', 'License active')
                : label(
                    'الليسانس غير نشط أو منتهي أو سيرفر التفعيل غير متاح',
                    'License inactive, expired or issuer unavailable',
                  )
              : label(
                  'هذه النسخة غير مضبوطة لطلب ليسانس.',
                  'License enforcement is not configured on this installation.',
                )}
          </Alert>
          {data.license && (
            <Typography>
              {data.license.customer} ·{' '}
              {new Date(data.license.expiresAt).toLocaleString()}
            </Typography>
          )}
          {data.required && (
            <>
              <TextField
                multiline
                label={label('كود التفعيل', 'Activation code')}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <Button
                variant="contained"
                disabled={busy || !token.trim()}
                onClick={() =>
                  run('post', '/activate', { token: token.trim() })
                }
              >
                {label('تفعيل النسخة', 'Activate installation')}
              </Button>
            </>
          )}
          {data.issuer && (
            <>
              <Divider />
              <Typography variant="h6">
                {label(
                  'إصدار الليسانسات — نسخة المالك',
                  'License issuer — owner installation',
                )}
              </Typography>
              <Alert severity="info">
                {label(
                  'الإيقاف يصل خلال دقيقة أثناء عمل سيرفر التفعيل. التجديد يصدر كودًا جديدًا يجب إدخاله عند العميل.',
                  'Revocation takes up to one minute while the issuer is reachable. Renewal issues a new code that the customer must activate.',
                )}
              </Alert>
              <TextField
                multiline
                label={label(
                  'المفتاح العام لنسخ العملاء',
                  'Public key for customer installations',
                )}
                value={publicKey.data ?? ''}
                slotProps={{ input: { readOnly: true } }}
              />
              <Stack
                component="form"
                spacing={2}
                onSubmit={(e) => {
                  e.preventDefault();
                  run('post', '/licenses', {
                    customer,
                    installation,
                    expiresAt: new Date(expires).toISOString(),
                  });
                }}
              >
                <TextField
                  required
                  label={label('اسم العميل', 'Customer name')}
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                />
                <TextField
                  required
                  label={label(
                    'معرّف سيرفر العميل',
                    'Customer installation ID',
                  )}
                  value={installation}
                  onChange={(e) => setInstallation(e.target.value.trim())}
                  inputProps={{ pattern: '[a-f0-9]{64}' }}
                />
                <TextField
                  required
                  type="datetime-local"
                  label={label('تاريخ انتهاء الليسانس', 'License expiry')}
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Button type="submit" variant="contained" disabled={busy}>
                  {label('إصدار ليسانس', 'Issue license')}
                </Button>
              </Stack>
              {output && (
                <TextField
                  multiline
                  label={label(
                    'كود الليسانس — انسخه للعميل',
                    'License code — copy for customer',
                  )}
                  value={output}
                  slotProps={{ input: { readOnly: true } }}
                />
              )}
              {licenses.isError && (
                <Alert severity="error">
                  {label('تعذر تحميل الليسانسات.', 'Unable to load licenses.')}
                </Alert>
              )}
              {licenses.data?.map((entry) => (
                <Stack
                  spacing={1}
                  key={entry.payload.id}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    p: 2,
                    borderRadius: 2,
                  }}
                >
                  <Typography>
                    {entry.payload.customer} ·{' '}
                    {entry.enabled
                      ? label('نشط', 'Enabled')
                      : label('موقوف', 'Disabled')}{' '}
                    · {new Date(entry.payload.expiresAt).toLocaleString()}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    {entry.payload.installation}
                  </Typography>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run('patch', `/licenses/${entry.payload.id}`, {
                        enabled: !entry.enabled,
                      })
                    }
                  >
                    {entry.enabled
                      ? label('إيقاف الليسانس', 'Disable license')
                      : label('إعادة التفعيل', 'Enable license')}
                  </Button>
                  <TextField
                    type="datetime-local"
                    label={label('تاريخ التجديد', 'Renewal expiry')}
                    value={renewals[entry.payload.id] ?? ''}
                    onChange={(e) =>
                      setRenewals({
                        ...renewals,
                        [entry.payload.id]: e.target.value,
                      })
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <Button
                    disabled={busy || !renewals[entry.payload.id]}
                    onClick={() =>
                      run('patch', `/licenses/${entry.payload.id}`, {
                        enabled: true,
                        expiresAt: new Date(
                          renewals[entry.payload.id],
                        ).toISOString(),
                      })
                    }
                  >
                    {label(
                      'تجديد وإصدار كود جديد',
                      'Renew and issue a new code',
                    )}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run('patch', `/licenses/${entry.payload.id}`, {
                        enabled: entry.enabled,
                      })
                    }
                  >
                    {label('إظهار كود الليسانس', 'Show license code')}
                  </Button>
                </Stack>
              ))}
            </>
          )}
        </>
      )}
    </Stack>
  );
}
