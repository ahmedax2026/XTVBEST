/** Recognize new and legacy internal clients so rebranding does not count
 * the server's own FFmpeg connections as external viewers. */
export function isInternalStudioUserAgent(userAgent?: string) {
  return (
    userAgent?.includes('XBEST') === true ||
    userAgent?.includes('Tunarr') === true
  );
}
