import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Tabs,
  Button,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  downloadOwnerFile,
  extendExpiry,
  licensesCsv,
  licenseState,
  type Account,
  type Audit,
  type Issued,
  type License,
  type LicenseState,
} from './ownerPanel.ts';
import { client } from '../../generated/client.gen.ts';
import { useSettings } from '../../store/settings/selectors.ts';

type Status = {
  owner: boolean;
  issuer: boolean;
  configured: boolean;
  required: boolean;
  valid: boolean;
  installation: string;
  license?: License;
};

export default function AccessSettingsPage() {
  const ar = useSettings().ui.i18n.locale === 'ar';
  const label = (arabic: string, english: string) => (ar ? arabic : english);
  const queryClient = useQueryClient();
  const [auditLimit, setAuditLimit] = useState(100);
  const [section, setSection] = useState('all');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [editing, setEditing] = useState<Account>();
  const [editPassword, setEditPassword] = useState('');
  const [editInstallation, setEditInstallation] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedLicense, setSelectedLicense] = useState<License>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userInstallation, setUserInstallation] = useState('');
  const [customer, setCustomer] = useState('');
  const [installation, setInstallation] = useState('');
  const [expires, setExpires] = useState('');
  const [validation, setValidation] = useState<'online' | 'offline'>('online');
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
  const audit = useQuery({
    queryKey: ['access-audit'],
    enabled: status.data?.owner === true,
    queryFn: async () =>
      (await client.instance.get<Audit[]>('/api/access/audit')).data,
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
      method: 'get' | 'post' | 'patch' | 'delete';
      url: string;
      body?: object;
    }) => {
      const result = await client.instance.request<{
        token?: string;
        payload?: License;
      }>({
        method,
        url: `/api/access${url}`,
        data: body,
      });
      return result.data;
    },
    onSuccess: async (result) => {
      setPassword('');
      setEditing(undefined);
      setEditPassword('');
      if (result.token) {
        setOutput(result.token);
        setSelectedLicense(result.payload);
      }
      await queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith('access-'),
      });
    },
  });
  const run = (
    method: 'get' | 'post' | 'patch' | 'delete',
    url: string,
    body?: object,
  ) => action.mutate({ method, url, body });
  const busy = action.isPending;
  const data = status.data;
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const allLicenses = licenses.data ?? [];
  const stateLabel = (state: LicenseState) =>
    ({
      active: label('نشط', 'Active'),
      expiring: label('ينتهي خلال ٧ أيام', 'Expires within 7 days'),
      expired: label('منتهي', 'Expired'),
      disabled: label('موقوف', 'Disabled'),
    })[state];
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(label('تم النسخ.', 'Copied.'));
    } catch {
      setNotice(
        label(
          'تعذر النسخ التلقائي؛ حدد النص وانسخه أو نزّل الملف.',
          'Copy unavailable; select the text or download the file.',
        ),
      );
    }
  };
  const visible = (name: string) => section === 'all' || section === name;
  const shownLicenses = allLicenses.filter(
    (entry) =>
      matches(
        `${entry.payload.customer} ${entry.payload.installation} ${entry.payload.id}`,
      ) &&
      (filter === 'all' || licenseState(entry) === filter),
  );
  const shownUsers = (users.data ?? []).filter(
    (user) =>
      matches(`${user.username} ${user.installation ?? ''}`) &&
      (accountFilter === 'all' ||
        user.enabled === (accountFilter === 'enabled')),
  );

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
    <Stack spacing={3} dir={ar ? 'rtl' : 'ltr'} data-testid="owner-panel">
      <Box
        sx={{
          p: 3,
          borderRadius: 3,
          background: 'linear-gradient(120deg, #241821, #141c2b)',
          color: '#fff',
          border: '1px solid #9c773b',
        }}
      >
        <Typography variant="overline" sx={{ color: '#ebc46e' }}>
          XBEST OWNER
        </Typography>
        <Typography variant="h4" fontWeight={800}>
          {label('لوحة الأونر', 'Owner control panel')}
        </Typography>
        <Typography sx={{ mt: 1, opacity: 0.8 }}>
          {label(
            'الحسابات والعملاء والتجديدات والتفعيل في مكان واحد.',
            'Accounts, customers, renewals and activation in one place.',
          )}
        </Typography>
      </Box>

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
            'شغّل نسخة المالك باستخدام ملف التشغيل المحمي وحدد اسم المستخدم وكلمة السر، ثم أعد فتح هذه الصفحة.',
            'Start the owner installation with the protected launcher, set its username and password, then reopen this page.',
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
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, 1fr)',
                md: 'repeat(4, 1fr)',
              },
              gap: 2,
            }}
          >
            {[
              [label('الحسابات', 'Accounts'), users.data?.length ?? 0],
              [
                label('الليسانسات النشطة', 'Active licenses'),
                allLicenses.filter((entry) =>
                  ['active', 'expiring'].includes(licenseState(entry)),
                ).length,
              ],
              [
                label('تحتاج تجديدًا خلال ٧ أيام', 'Renew within 7 days'),
                allLicenses.filter(
                  (entry) => licenseState(entry) === 'expiring',
                ).length,
              ],
              [
                label('منتهية أو موقوفة', 'Expired or disabled'),
                allLicenses.filter((entry) =>
                  ['expired', 'disabled'].includes(licenseState(entry)),
                ).length,
              ],
            ].map(([title, count]) => (
              <Box
                key={title}
                sx={{
                  p: 2,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                }}
              >
                <Typography color="text.secondary" variant="body2">
                  {title}
                </Typography>
                <Typography variant="h4" fontWeight={800}>
                  {count}
                </Typography>
              </Box>
            ))}
          </Box>
          {notice && <Alert onClose={() => setNotice('')}>{notice}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              size="small"
              fullWidth
              label={label(
                'بحث باسم العميل أو الحساب أو بصمة السيرفر',
                'Search customer, account or server ID',
              )}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button
              disabled={busy}
              onClick={() =>
                void queryClient.invalidateQueries({
                  predicate: (q) => String(q.queryKey[0]).startsWith('access-'),
                })
              }
            >
              {label('تحديث', 'Refresh')}
            </Button>
          </Stack>
          <Tabs
            value={section}
            onChange={(_, value: string) => setSection(value)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label={label('أقسام الأونر', 'Owner sections')}
          >
            <Tab value="all" label={label('نظرة عامة', 'Overview')} />
            <Tab value="users" label={label('الحسابات', 'Accounts')} />
            {data.issuer && (
              <Tab
                value="licenses"
                label={label('العملاء والليسانسات', 'Customers and licenses')}
              />
            )}
            <Tab
              value="setup"
              label={label('التجهيز والتفعيل', 'Setup and activation')}
            />
            <Tab value="audit" label={label('سجل العمليات', 'Activity log')} />
          </Tabs>
          <Box hidden={!visible('users')}>
            <Stack spacing={2}>
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
                  label={label('الإيميل أو اسم المستخدم', 'Username')}
                  helperText={label(
                    'يمكن استخدام الإيميل كاسم حساب؛ لا يتم إرسال رسائل بريد.',
                    'An email address can be used as the username; this does not send email.',
                  )}
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
              <TextField
                select
                label={label('حالة الحساب', 'Account status')}
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
              >
                <MenuItem value="all">
                  {label('كل الحسابات', 'All accounts')}
                </MenuItem>
                <MenuItem value="enabled">{label('نشطة', 'Enabled')}</MenuItem>
                <MenuItem value="disabled">
                  {label('معطّلة', 'Disabled')}
                </MenuItem>
              </TextField>
              {users.isSuccess && shownUsers.length === 0 && (
                <Alert severity="info">
                  {label('لا توجد حسابات مطابقة.', 'No matching accounts.')}
                </Alert>
              )}
              {shownUsers.map((user) => (
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
                    onClick={() => {
                      setEditing(user);
                      setEditPassword('');
                      setEditInstallation(user.installation ?? '');
                    }}
                  >
                    {label('تعديل الحساب', 'Edit account')}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(
                        'patch',
                        `/users/${encodeURIComponent(user.username)}`,
                        {
                          enabled: !user.enabled,
                        },
                      )
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
            </Stack>
          </Box>
          <Divider />
          <Box hidden={!visible('setup')}>
            <Stack spacing={2}>
              {data.issuer && (
                <Alert severity="info">
                  {label(
                    'تجهيز العميل: ١) أرسل له حزمة العميل والمفتاح العام فقط. ٢) اضبط المفتاح العام على نسخته ثم خذ بصمة السيرفر. ٣) أضف حسابه وأصدر كودًا للبصمة. ٤) للتجديد أرسل الكود الجديد. الأونلاين والحسابات المركزية يحتاجان عنوان HTTPS متاحًا؛ الأوفلاين يستخدم حسابًا محليًا.',
                    'Customer setup: send the customer archive and public key only; configure that key on their installation and obtain its server ID; create their account and issue a bound code. Send a new code after renewal. Online activation and central accounts need a reachable HTTPS issuer; offline uses a local account.',
                  )}
                </Alert>
              )}
              {data.issuer && (
                <Alert severity="warning">
                  {label(
                    'النسخ الاحتياطي للأونر: أغلق البرنامج وانسخ مجلد XBEST-OWNER كاملًا من بيانات تطبيقات ويندوز إلى مكان خاص وآمن. لا ترسل مجلد access أو المفتاح الخاص لأي عميل. الاستعادة تكون والبرنامج مغلق وعلى حساب ويندوز الأصلي لبيانات الدخول المشفرة.',
                    'Owner backup: stop the application and privately copy the complete XBEST-OWNER folder from Windows application data. Never send access data or private signing keys to customers. Restore with the application stopped; encrypted credentials require the original Windows account.',
                  )}
                </Alert>
              )}
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
                  {data.license.validation === 'offline'
                    ? label('أوفلاين', 'Offline')
                    : label('أونلاين', 'Online')}{' '}
                  · {new Date(data.license.expiresAt).toLocaleString()}
                </Typography>
              )}
              {data.license?.validation === 'offline' && (
                <Alert severity="info">
                  {label(
                    'تفعيل أوفلاين: لا يلزم اتصال بالمالك. الدخول بدون إنترنت يحتاج حسابًا محليًا؛ الحساب المركزي يظل محتاجًا اتصالًا.',
                    'Offline activation: no issuer connection required. Offline sign-in needs a local account; central accounts still require a connection.',
                  )}
                </Alert>
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
            </Stack>
          </Box>
          {data.issuer && (
            <Box hidden={!visible('licenses')}>
              <Stack spacing={2}>
                <Divider />
                <Typography variant="h6">
                  {label(
                    'إصدار الليسانسات — نسخة المالك',
                    'License issuer — owner installation',
                  )}
                </Typography>
                <Alert severity="info">
                  {label(
                    'الأونلاين يدعم الإيقاف عن بُعد. الأوفلاين يعمل حتى تاريخ الانتهاء دون اتصال بالمالك، ولا يمكن إيقاف أكواده السابقة عن بُعد.',
                    'Online supports remote revocation. Offline runs until expiry without the issuer and previously issued codes cannot be revoked remotely.',
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
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <Button
                    disabled={!publicKey.data}
                    onClick={() => void copy(publicKey.data ?? '')}
                  >
                    {label('نسخ المفتاح العام', 'Copy public key')}
                  </Button>
                  <Button
                    disabled={!publicKey.data}
                    onClick={() =>
                      downloadOwnerFile(
                        'XBEST-public.pem',
                        publicKey.data ?? '',
                      )
                    }
                  >
                    {label('تنزيل المفتاح العام', 'Download public key')}
                  </Button>
                </Stack>
                {publicKey.isError && (
                  <Alert severity="error">
                    {label(
                      'تعذر تحميل المفتاح العام.',
                      'Unable to load public key.',
                    )}
                  </Alert>
                )}
                <Stack
                  component="form"
                  spacing={2}
                  onSubmit={(e) => {
                    e.preventDefault();
                    run('post', '/licenses', {
                      customer,
                      installation,
                      expiresAt: new Date(expires).toISOString(),
                      validation,
                    });
                  }}
                >
                  <TextField
                    select
                    label={label('طريقة التحقق', 'Validation mode')}
                    value={validation}
                    onChange={(e) =>
                      setValidation(
                        e.target.value === 'offline' ? 'offline' : 'online',
                      )
                    }
                  >
                    <MenuItem value="online">
                      {label(
                        'أونلاين — تحكم وإيقاف عن بُعد',
                        'Online — remote control and revocation',
                      )}
                    </MenuItem>
                    <MenuItem value="offline">
                      {label(
                        'أوفلاين — حتى تاريخ الانتهاء',
                        'Offline — valid until expiry',
                      )}
                    </MenuItem>
                  </TextField>
                  {validation === 'offline' && (
                    <Alert severity="warning">
                      {label(
                        'استخدم حسابًا محليًا على نسخة العميل للدخول دون إنترنت. اليوزرات المركزية تحتاج اتصالًا بنسخة المالك. التجديد لا يلغي الكود الأوفلاين القديم قبل انتهائه.',
                        'Use a local account on the customer installation to sign in offline. Central users require the issuer connection. Renewal does not invalidate an older offline code before its expiry.',
                      )}
                    </Alert>
                  )}
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
                  <Stack direction="row" gap={1} flexWrap="wrap">
                    {[7, 30, 90, 365].map((days) => (
                      <Button
                        key={days}
                        onClick={() => setExpires(extendExpiry('', days))}
                      >
                        {days} {label('يوم', 'days')}
                      </Button>
                    ))}
                  </Stack>
                  <Button type="submit" variant="contained" disabled={busy}>
                    {label('إصدار ليسانس', 'Issue license')}
                  </Button>
                </Stack>
                {output && (
                  <Stack spacing={1}>
                    <TextField
                      multiline
                      label={label(
                        'كود الليسانس — انسخه للعميل',
                        'License code — copy for customer',
                      )}
                      value={output}
                      slotProps={{ input: { readOnly: true } }}
                    />
                    {selectedLicense && (
                      <Typography>
                        {selectedLicense.customer} ·{' '}
                        {new Date(selectedLicense.expiresAt).toLocaleString(
                          ar ? 'ar-EG' : 'en-US',
                        )}
                      </Typography>
                    )}
                    <Stack direction="row" gap={1}>
                      <Button onClick={() => void copy(output)}>
                        {label('نسخ كود التفعيل', 'Copy activation code')}
                      </Button>
                      <Button
                        onClick={() =>
                          downloadOwnerFile(
                            `XBEST-license-${selectedLicense?.id ?? 'code'}.txt`,
                            output,
                          )
                        }
                      >
                        {label('تنزيل كود التفعيل', 'Download activation code')}
                      </Button>
                    </Stack>
                  </Stack>
                )}
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                  <TextField
                    select
                    fullWidth
                    label={label('حالة الليسانس', 'License status')}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <MenuItem value="all">
                      {label('كل الليسانسات', 'All licenses')}
                    </MenuItem>
                    {(
                      ['active', 'expiring', 'expired', 'disabled'] as const
                    ).map((value) => (
                      <MenuItem key={value} value={value}>
                        {stateLabel(value)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button
                    disabled={shownLicenses.length === 0}
                    onClick={() =>
                      downloadOwnerFile(
                        'XBEST-customers.csv',
                        licensesCsv(shownLicenses),
                        'text/csv;charset=utf-8',
                      )
                    }
                  >
                    {label('تصدير القائمة CSV', 'Export list CSV')}
                  </Button>
                </Stack>
                {licenses.isSuccess && shownLicenses.length === 0 && (
                  <Alert severity="info">
                    {label('لا توجد ليسانسات مطابقة.', 'No matching licenses.')}
                  </Alert>
                )}
                {licenses.isError && (
                  <Alert severity="error">
                    {label(
                      'تعذر تحميل الليسانسات.',
                      'Unable to load licenses.',
                    )}
                  </Alert>
                )}
                {shownLicenses.map((entry) => (
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
                    <Chip
                      size="small"
                      sx={{ alignSelf: 'flex-start' }}
                      label={stateLabel(licenseState(entry))}
                      color={
                        licenseState(entry) === 'active'
                          ? 'success'
                          : licenseState(entry) === 'expiring'
                            ? 'warning'
                            : 'default'
                      }
                    />
                    <Typography>
                      {entry.payload.customer} ·{' '}
                      {entry.payload.validation === 'offline'
                        ? label('أوفلاين', 'Offline')
                        : label('أونلاين', 'Online')}{' '}
                      ·{' '}
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
                    {entry.payload.validation === 'offline' && (
                      <Alert severity="warning">
                        {label(
                          'هذا الليسانس لا يدعم الإيقاف عن بُعد؛ الكود القديم يظل صالحًا حتى انتهائه.',
                          'This license cannot be revoked remotely; the old code remains valid until expiry.',
                        )}
                      </Alert>
                    )}
                    <Stack direction="row" gap={1} flexWrap="wrap">
                      <Button
                        onClick={() => void copy(entry.payload.installation)}
                      >
                        {label('نسخ بصمة السيرفر', 'Copy server ID')}
                      </Button>
                      <Button
                        onClick={() => {
                          setUserInstallation(entry.payload.installation);
                          setUsername(
                            entry.payload.customer.includes('@') &&
                              !/\s/.test(entry.payload.customer)
                              ? entry.payload.customer
                              : '',
                          );
                          setSection('users');
                        }}
                      >
                        {label(
                          'إضافة حساب لهذا العميل',
                          'Add account for customer',
                        )}
                      </Button>
                    </Stack>
                    <Button
                      disabled={busy || entry.payload.validation === 'offline'}
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
                    <Stack direction="row" gap={1}>
                      {[30, 90, 365].map((days) => (
                        <Button
                          key={days}
                          onClick={() =>
                            setRenewals({
                              ...renewals,
                              [entry.payload.id]: extendExpiry(
                                entry.payload.expiresAt,
                                days,
                              ),
                            })
                          }
                        >
                          +{days} {label('يوم', 'days')}
                        </Button>
                      ))}
                    </Stack>
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
                        run('get', `/licenses/${entry.payload.id}/code`)
                      }
                    >
                      {label('إظهار كود الليسانس', 'Show license code')}
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
          <Box hidden={!visible('audit')}>
            <Stack spacing={2}>
              <Typography variant="h6">
                {label('سجل العمليات', 'Activity log')}
              </Typography>
              <Typography color="text.secondary">
                {label(
                  'آخر ١٠٠٠ عملية محفوظة؛ السجل لا يحتوي على كلمات سر أو مفاتيح أو أكواد تفعيل.',
                  'The latest 1000 changes are retained; passwords, keys and activation codes are excluded.',
                )}
              </Typography>
              {audit.isError && (
                <Alert severity="error">
                  {label('تعذر تحميل السجل.', 'Unable to load activity log.')}
                </Alert>
              )}
              {audit.isSuccess && audit.data.length === 0 && (
                <Alert severity="info">
                  {label(
                    'لا توجد عمليات مسجلة بعد.',
                    'No recorded changes yet.',
                  )}
                </Alert>
              )}
              {audit.data
                ?.filter((entry) => matches(entry.target))
                .slice(0, auditLimit)
                .map((entry) => (
                  <Box
                    key={entry.id}
                    sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}
                  >
                    <Typography>
                      {(
                        {
                          'user-created': label(
                            'إضافة حساب',
                            'Account created',
                          ),
                          'user-updated': label(
                            'تعديل حساب',
                            'Account updated',
                          ),
                          'user-deleted': label('حذف حساب', 'Account deleted'),
                          'license-issued': label(
                            'إصدار ليسانس',
                            'License issued',
                          ),
                          'license-renewed': label(
                            'تجديد ليسانس',
                            'License renewed',
                          ),
                          'license-enabled': label(
                            'تفعيل ليسانس',
                            'License enabled',
                          ),
                          'license-disabled': label(
                            'إيقاف ليسانس',
                            'License disabled',
                          ),
                        } as Record<string, string>
                      )[entry.action] ?? entry.action}{' '}
                      · {entry.target}
                    </Typography>
                    <Typography variant="caption">
                      {new Date(entry.at).toLocaleString(
                        ar ? 'ar-EG' : 'en-US',
                      )}
                    </Typography>
                  </Box>
                ))}
            </Stack>
          </Box>
          {visible('audit') &&
            (audit.data?.filter((entry) => matches(entry.target)).length ?? 0) >
              auditLimit && (
              <Button onClick={() => setAuditLimit(auditLimit + 100)}>
                {label('عرض عمليات أقدم', 'Show older activity')}
              </Button>
            )}
          <Dialog
            open={!!editing}
            onClose={() => {
              if (!busy) {
                setEditing(undefined);
                setEditPassword('');
              }
            }}
            fullWidth
            maxWidth="sm"
          >
            <DialogTitle>
              {label('تعديل الحساب', 'Edit account')} · {editing?.username}
            </DialogTitle>
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                if (editing)
                  run(
                    'patch',
                    `/users/${encodeURIComponent(editing.username)}`,
                    {
                      enabled: editing.enabled,
                      ...(editPassword ? { password: editPassword } : {}),
                      ...(data.issuer
                        ? { installation: editInstallation || null }
                        : {}),
                    },
                  );
              }}
            >
              <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                  <TextField
                    type="password"
                    label={label('كلمة السر الجديدة', 'New password')}
                    helperText={label(
                      'اتركها فارغة للاحتفاظ بكلمة السر الحالية.',
                      'Leave blank to keep the current password.',
                    )}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    inputProps={{ minLength: 12, maxLength: 256 }}
                    autoComplete="new-password"
                  />
                  {data.issuer && (
                    <TextField
                      label={label('بصمة السيرفر المرتبط', 'Linked server ID')}
                      value={editInstallation}
                      onChange={(e) =>
                        setEditInstallation(e.target.value.trim())
                      }
                      helperText={label(
                        'فارغ لحساب محلي على نسخة الأونر.',
                        'Blank for a local account on this owner installation.',
                      )}
                      inputProps={{ pattern: '[a-f0-9]{64}' }}
                    />
                  )}
                  {action.isError && (
                    <Alert severity="error">
                      {label(
                        'تعذر حفظ الحساب. راجع البيانات وحاول مجددًا.',
                        'Unable to save account. Check the input and retry.',
                      )}
                    </Alert>
                  )}
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setEditing(undefined);
                    setEditPassword('');
                  }}
                >
                  {label('إلغاء', 'Cancel')}
                </Button>
                <Button disabled={busy} type="submit" variant="contained">
                  {label('حفظ الحساب', 'Save account')}
                </Button>
              </DialogActions>
            </Box>
          </Dialog>
        </>
      )}
    </Stack>
  );
}
