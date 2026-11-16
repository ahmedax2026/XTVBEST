# XBest Channels Studio

Modified distribution based on Tunarr. The original zlib license and copyright notice remain in LICENSE.

## Development status

Initial branding: red and black theme, dark default, studio wordmark. The interface supports Arabic and English only; Arabic is the default and uses RTL. Removed saved locale choices fall back to Arabic without resetting the server URL or other settings.

## CPU/GPU and protected startup

CPU and manual GPU profiles use the existing FFmpeg pipeline. Auto now probes an actual encoder before each new session (cached for one minute), uses software decoding/filtering with GPU encoding, and falls back to CPU if every probe fails. Each channel chooses its transcode profile. Configuration changes apply to new playback sessions. See [setup and limitations](docs/xbest-cpu-gpu-login.md).

Protected startup scripts for Windows and Linux prompt for credentials; server-side Basic Auth protects the panel and administrative requests. Incomplete credentials stop startup. Streaming authorization remains separate. GPU playback on actual Windows/Linux hardware still requires device verification.

## Live session monitor

The session window polls the existing server API every five seconds while open, shows session state, connection counts and client activity, and stops sessions with server confirmation and error feedback. It is available from every channel menu, including idle channels. Counts represent connections, not unique viewers. Reconnecting players may restart a stopped session; persistent offline/standby remains pending.

Copied HLS links now use channel UUIDs and survive renaming/renumbering. The summary card counts down in HH:MM:SS every second and refreshes after a program ends. Failed end-of-program refreshes retry every minute and resume normal updates after recovery. The now-playing labels and detail controls are translated into Arabic. This countdown is in the administration panel; the burned-in countdown and its visual styles remain pending.

## Saved channels (local fixed playlists)

Each channel menu now includes **Saved channel / القناة المحفوظة**. Prepare the
channel's local programs with its CPU/GPU/Auto transcode profile, choose 1–32
preparation threads and a total retained-archive storage limit of 1–1024 GiB,
then request a switch at the next scheduled program boundary. The channel UUID,
HLS address, original source files and lineup are retained. Return to live uses
the same boundary rule. Preparation uses a separate unthrottled finite encoding
job instead of the live pipeline's read-rate limit.

One preparation job runs at a time. Progress reports completed programs and
stored bytes. Cancellation stops the encoder and removes only its partial output.
Validated completed assets, including earlier generations, are never evicted
automatically. Source/profile/overlay changes invalidate reuse and fall back to
live encoding. A failed preparation does not activate its partial output.

State and manifests are atomically persisted under `channel-archives` in the
configured data directory. A restart preserves mode-switch timestamps and ready
archives; an interrupted preparation is reported as failed and can be retried.
Playback reads manifests without writing them, so a worker cannot overwrite a
newer administrator request. The original media must remain accessible for
identity validation. Serving and remuxing saved output still use some CPU.

Scope: built-in HLS/MPEG-TS engine, fixed local content playlists, channel logo
through the existing watermark pipeline. Redirects, random fillers, on-demand
schedules, remote-only media and the experimental ErsatzTV engine are rejected.
One profile/rendition is prepared per channel; adaptive multi-quality archives,
configurable concurrent job counts and an archive cleanup UI remain pending.

## Remaining acceptance criteria

- Arabic locale and RTL layout; preserve English fallback.
- Per-channel countdown based on scheduled program duration and playback offset, HH:MM:SS; circular, ring, square, pill, bar and digital styles; adjustable placement, margins, size, opacity and color; hide on fillers.
- Burn current and next titles into actual output, including Arabic shaping; next title on five-second bumper.
- Live, direct, hybrid, archived and standby modes; explicit preparation progress and limits on concurrent jobs, threads and storage.
- Extend the local saved-channel implementation to remote sources, random fillers and additional playback engines; verify complete HLS playback on Windows and actual GPU hardware.
- Preserve schedule and permit switching back to live. Provide start, stop, skip, restart and scheduled content replacement.
- Per-channel quality profiles and optional adaptive HLS; verify actual output URLs with IPTV panel.
- Authentication, authorization and HTTPS deployment; no hardcoded credentials. Existing basic authentication is not a substitute for stream authorization.
- Windows and Linux build and playback verification before a release.
