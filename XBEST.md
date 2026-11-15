# XBest Channels Studio

Modified distribution based on Tunarr. The original zlib license and copyright notice remain in LICENSE.

## Development status

Initial branding: red and black theme, dark default, studio wordmark.

## CPU/GPU and protected startup

CPU and manual GPU profiles use the existing FFmpeg pipeline. Auto now probes an actual encoder before each new session (cached for one minute), uses software decoding/filtering with GPU encoding, and falls back to CPU if every probe fails. Each channel chooses its transcode profile. Configuration changes apply to new playback sessions. See [setup and limitations](docs/xbest-cpu-gpu-login.md).

Protected startup scripts for Windows and Linux prompt for credentials; server-side Basic Auth protects the panel and administrative requests. Incomplete credentials stop startup. Streaming authorization remains separate. GPU playback on actual Windows/Linux hardware still requires device verification.

## Remaining acceptance criteria

- Arabic locale and RTL layout; preserve English fallback.
- Per-channel countdown based on scheduled program duration and playback offset, HH:MM:SS; circular, ring, square, pill, bar and digital styles; adjustable placement, margins, size, opacity and color; hide on fillers.
- Burn current and next titles into actual output, including Arabic shaping; next title on five-second bumper.
- Live, direct, hybrid, archived and standby modes; explicit preparation progress and limits on concurrent jobs, threads and storage.
- Archive preparation must never delete source media. Validate completed renditions and switch at a program boundary, retaining channel ID and output address. Invalidate prepared assets when overlay settings or source change. Never evict pinned archives automatically.
- Preserve schedule and permit switching back to live. Provide start, stop, skip, restart and scheduled content replacement.
- Per-channel quality profiles and optional adaptive HLS; verify actual output URLs with IPTV panel.
- Authentication, authorization and HTTPS deployment; no hardcoded credentials. Existing basic authentication is not a substitute for stream authorization.
- Windows and Linux build and playback verification before a release.
