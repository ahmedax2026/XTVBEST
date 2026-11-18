# XBest live-to-archive channel conversion

Status: initial local-playlist implementation in progress, following the user’s
request to continue the custom distribution. Full acceptance of every design
item below is still pending. See XBEST.md for the implemented scope.

## Problem

A channel owner wants to stop repeatedly transcoding an established channel while
retaining its channel UUID, schedule, stream URL and original media. Preparation
must coexist with live playback and permit a return to live mode.

## Approach

Prepare reusable renditions per program and quality profile in a separate managed
archive directory. Keep the existing channel identifier and public stream route.
Once every required rendition passes validation, switch the playback source at the
next program boundary. Until then, continue the existing live pipeline.

An archive still consumes resources to serve files, manage sessions and maintain
playlists. It removes repeated video encoding for prepared, unchanged assets; it
does not promise zero CPU usage.

### Preparation and integrity

- Build a manifest from an immutable snapshot of the source identity, source size
  and modification time, transcode profile, output quality and overlay settings.
- Write jobs to a temporary, job-specific directory. Limit active jobs, FFmpeg
  threads and storage consumption. Probe actual GPU support using the existing
  Auto behavior; allow per-channel CPU, GPU or Auto selection.
- Validate every rendition with ffprobe, including duration tolerance, streams and
  expected dimensions. Reject missing, truncated or incompatible output.
- Publish validated manifests atomically. Never modify, move or delete source files.
- Recheck the manifest identity before activation. A source or overlay change makes
  that preparation stale; the channel continues live until replacement assets are
  ready. Pinned archives are excluded from automatic cleanup.

### Activation and playback

- Use states: live, preparing, ready, archived, failed and returning-to-live.
- Persist desired mode separately from actual playback state. A cancelled or failed
  job must leave the live channel and its schedule intact.
- Switch future playback at a program boundary. Existing sessions must have an
  explicit drain/restart policy, with playlist continuity checked before launch.
- Resolve archived programs using scheduled playback offsets. Reuse the existing
  stream URL; never use the mutable channel number as archive identity.
- Switching back to live retains both schedule and prepared assets. Deleting an
  archive is a separate, explicit operation confined to its managed directory.

## Alternatives

- Recording the live output saves only content that has already aired and may
  require real-time waiting; it is not equivalent to preparing a full schedule.
- Replacing original media risks data loss and prevents a clean return to live.
- Giving the archived version a new channel or URL breaks existing player links.
- Switching before validation risks interrupting a working live channel.

## Codebase changes

- `server`: preparation jobs, manifest validation, resource limits and an archived
  playback adapter integrated with session lifecycle and program boundaries.
- Persistence: versioned, atomically replaced per-channel JSON manifests in the
  configured data directory, including recovery of interrupted preparation. The
  initial implementation needs no SQLite migration.
- `types`: validated request/response shapes for prepare, progress, cancel,
  activate-at-boundary, return-to-live and explicit archive deletion.
- `web`: channel controls and localized Arabic/English progress, failure and mode
  indicators. Regenerate the API client after approving the API shapes.
- No new runtime dependency is proposed; use the existing FFmpeg/ffprobe tooling.

## PR plan

1. Approve the schema, state transitions and API contract; add persistent job
   recovery and manifest validation tests.
2. Add bounded preparation workers and CPU/GPU integration; verify source files
   remain unchanged on success, cancellation, disk-full and encoder failure.
3. Integrate archive playback and boundary activation; test unchanged UUID URLs,
   schedule offsets, multi-client sessions and return to live.
4. Add Arabic/English controls and Windows/Linux acceptance checks. Publish a
   preview only after real FFmpeg output passes playback verification.

## Acceptance evidence

Use short generated clips to verify preparation, rendition validity and program
transitions. Test interruption/restart, source/overlay changes, cancelled jobs,
storage limits and pinned retention. Compare source hashes before and after all
operations. Check the original HLS URL in an actual player on Windows and Linux.
GPU acceptance requires a machine with the selected hardware.

## AI use

Codex inspected the existing XBest branch and wrote this proposal. Archive
conversion is not implemented or tested by this document.
