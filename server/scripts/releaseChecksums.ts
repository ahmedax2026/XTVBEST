import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';

/** Publish alongside the archive so customers can compare trusted release hashes.
 * This detects changed downloads, not a hostile administrator patching a process.
 */
export async function releaseChecksums(
  entries: { source: string; name: string }[],
) {
  const lines: string[] = [];
  for (const { source, name } of entries) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of createReadStream(source)) hash.update(chunk);
    lines.push(`${hash.digest('hex')}  ${name}`);
  }
  return `${lines.join('\n')}\n`;
}
