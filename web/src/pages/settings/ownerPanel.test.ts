import { expect, test } from 'vitest';
import {
  extendExpiry,
  licensesCsv,
  licenseState,
  type Issued,
} from './ownerPanel.ts';
const now = Date.parse('2030-01-01T00:00:00Z');
const entry = (days: number, enabled = true): Issued => ({
  enabled,
  payload: {
    id: 'fixture',
    customer: '=HYPERLINK("bad")',
    installation: 'a'.repeat(64),
    expiresAt: new Date(now + days * 86400000).toISOString(),
  },
});
test('license states prioritize disabled and distinguish expiry and renewal window', () => {
  expect(licenseState(entry(8), now)).toBe('active');
  expect(licenseState(entry(7), now)).toBe('expiring');
  expect(licenseState(entry(0), now)).toBe('expired');
  expect(licenseState(entry(-1, false), now)).toBe('disabled');
});
test('renewal extends active expiry and starts expired subscriptions from today', () => {
  expect(
    new Date(extendExpiry(entry(8).payload.expiresAt, 30, now)).getTime(),
  ).toBe(now + 38 * 86400000);
  expect(
    new Date(extendExpiry(entry(-1).payload.expiresAt, 30, now)).getTime(),
  ).toBe(now + 30 * 86400000);
});
test('CSV preserves quoted data, prevents formula injection and contains no credentials or token', () => {
  const csv = licensesCsv([entry(8)], now);
  expect(csv).toContain(`"'=HYPERLINK(""bad"")"`);
  expect(csv).toContain('active');
  expect(csv).not.toMatch(/password|private|token|hash|salt/i);
});
