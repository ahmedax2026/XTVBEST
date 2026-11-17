export type License = {
  id: string;
  customer: string;
  installation: string;
  expiresAt: string;
  issuedAt?: string;
  validation?: 'online' | 'offline';
};
export type Account = {
  username: string;
  enabled: boolean;
  installation?: string;
};
export type Issued = { payload: License; enabled: boolean };
export type LicenseState = 'active' | 'expiring' | 'expired' | 'disabled';
export type Audit = { id: string; at: string; action: string; target: string };
export function licenseState(entry: Issued, now = Date.now()): LicenseState {
  if (!entry.enabled) return 'disabled';
  const remaining = Date.parse(entry.payload.expiresAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return 'expired';
  return remaining <= 7 * 86400000 ? 'expiring' : 'active';
}
export function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function extendExpiry(current: string, days: number, now = Date.now()) {
  return localDateTime(
    new Date(Math.max(Date.parse(current) || 0, now) + days * 86400000),
  );
}
export function licensesCsv(entries: Issued[], now = Date.now()) {
  const cell = (value: string) => {
    const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      ['Customer', 'Installation', 'Mode', 'Status', 'Expires', 'License ID'],
      ...entries.map((entry) => [
        entry.payload.customer,
        entry.payload.installation,
        entry.payload.validation ?? 'online',
        licenseState(entry, now),
        entry.payload.expiresAt,
        entry.payload.id,
      ]),
    ]
      .map((row) => row.map(cell).join(','))
      .join('\r\n')
  );
}
export function downloadOwnerFile(
  name: string,
  content: string,
  type = 'text/plain;charset=utf-8',
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
