import fs from 'node:fs/promises';
import path from 'node:path';

/** Reduce accidental source/debug/key disclosure in executable asset snapshots.
 * This is packaging hygiene, not an anti-reverse-engineering boundary.
 */
export function customerAssetAllowed(relativePath: string): boolean {
  const parts = relativePath.replaceAll('\\', '/').split('/');
  const name = (parts.at(-1) ?? '').toLowerCase();
  if (parts.some((part) => /^\.env(?:\.|$)/i.test(part))) return false;
  if (/\.(?:map|ts|tsx|mts|cts)$/.test(name)) return false;
  if (parts.length === 1 && name === 'meta.json') return false;
  if (
    /(?:^|[-_.])(?:private[-_.]?key|issuer[-_.]?private)(?:[-_.]|$)/.test(name)
  )
    return false;
  if (/\.private\.(?:pem|key|json)$/.test(name)) return false;
  return true;
}
export async function copyCustomerAssets(source: string, destination: string) {
  const root = path.resolve(source);
  await fs.cp(root, destination, {
    recursive: true,
    filter: (candidate) => customerAssetAllowed(path.relative(root, candidate)),
  });
}
