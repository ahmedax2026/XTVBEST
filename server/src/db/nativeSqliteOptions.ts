import path from 'node:path';
import { filename } from '../util/index.js';

function packagedEntrypoint() {
  if (
    'pkg' in process &&
    process.pkg &&
    typeof process.pkg === 'object' &&
    'entrypoint' in process.pkg &&
    typeof process.pkg.entrypoint === 'string'
  ) {
    return process.pkg.entrypoint;
  }
  return filename(import.meta.url);
}
/** Avoid bindings' call-stack filename inference in minified packaged binaries. */
export function nativeSqliteOptions(
  packaged = Object.hasOwn(process, 'pkg'),
  entrypoint = packagedEntrypoint(),
) {
  if (!packaged) return {};
  return {
    nativeBinding: path.join(
      path.dirname(entrypoint),
      'build',
      'better_sqlite3.node',
    ),
  };
}
