# XBest Channels Studio

Modified distribution based on Tunarr. The original zlib license and copyright notice remain in LICENSE.

## Development status

Initial branding: red and black theme, dark default, studio wordmark. The interface supports Arabic and English only; Arabic is the default and uses RTL. Removed saved locale choices fall back to Arabic without resetting the server URL or other settings.

## Custom studio interface

The application now mounts XBest's own desktop sidebar/mobile drawer, studio
header, home dashboard and channel-card presentation. The previous top navigation
and phone bottom bar are not mounted. Dashboard metrics come from channel/session
responses and distinguish API failure from genuine zero counts. Search, channel
creation, watch/manage links, card/table mode, the guide and command palette remain
functional. Settings panels, shared page headers, welcome and error states share
the new identity; existing media/scheduling logic is retained.

Browser sign-in now has XBest's Arabic/English screen, not a native Basic Auth
prompt for HTML navigation. Sessions use opaque HttpOnly/SameSite=Strict cookies,
expire after 8 hours and are cleared on process restart or sign-out. Accounts
are revalidated on protected requests. HTTPS sessions use Secure cookies when
HTTPS is correctly detected; configure trusted proxy/Host forwarding when using
TLS termination. Cookie access is same-origin; external tools can keep using
HTTP Basic. For older browser-cached Basic credentials, clear the browser's
HTTP-auth cache to test a complete logout.

Visible product text, marks, favicons, stream placeholder artwork, friendly names
and metadata use XBest. Stable wire keys, storage identifiers and mandatory
copyright/license notices remain compatible. Old default-artwork URLs serve the
new graphics. The new UI is a custom frontend on the existing modified media
engine; detailed editor logic is reused. See [interface scope](plans/xbest-studio-interface.md).

## CPU/GPU and protected startup

CPU and manual GPU profiles use the existing FFmpeg pipeline. Auto now probes an actual encoder before each new session (cached for one minute), uses software decoding/filtering with GPU encoding, and falls back to CPU if every probe fails. Each channel chooses its transcode profile. Configuration changes apply to new playback sessions. See [setup and limitations](docs/xbest-cpu-gpu-login.md).

Protected startup scripts for Windows and Linux prompt for credentials; server-side Basic Auth protects the panel and administrative requests. Incomplete credentials stop startup. Streaming authorization remains separate. GPU playback on actual Windows/Linux hardware still requires device verification.

## Live session monitor

The session window polls the existing server API every five seconds while open, shows session state, connection counts and client activity, and stops sessions with server confirmation and error feedback. It is available from every channel menu, including idle channels. Counts represent connections, not unique viewers. Reconnecting players may restart a stopped session; persistent offline/standby remains pending.

Copied HLS links now use channel UUIDs and survive renaming/renumbering. The summary card counts down in HH:MM:SS every second and refreshes after a program ends. Failed end-of-program refreshes retry every minute and resume normal updates after recovery. The now-playing labels and detail controls are translated into Arabic. The panel countdown is separate from the configurable video countdown below.

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

## Countdown inside the video

The channel menu now has **Video countdown / عداد داخل البث**. It is disabled by
default. Enable it to burn a scheduled HH:MM:SS countdown into transcoded output;
choose digital, pill, square, progress bar, circle or ring. Configure corner,
size and margins in output pixels, color and opacity. The preview uses the
channel profile's resolution. The optional current title supports Arabic through
FFmpeg/libass shaping. Fillers are hidden by default.

Time comes from the scheduled program's duration and elapsed position, including
seeking and HLS process restarts. Source clip offsets are distinct from scheduled
elapsed time. Graphics are added after scale/pad, subtitles and the logo, before
final encoder pixel-format conversion. Hardware frames are downloaded when
necessary for text rendering; the selected encoder is retained. This still uses
CPU for graphics even with GPU encoding. Actual GPU-device verification remains
required. Direct-copy and ErsatzTV output are not supported; enabling settings is
rejected for incompatible channel engines or missing subtitle-filter support.

Saved channels bake the graphic once and reuse it without re-encoding. Changing
an enabled overlay or a burned title invalidates that prepared output and falls
back to live. Saved countdowns currently require full-length standard programs,
without source clip offsets or tagged filler entries. Unmodified older archives
keep their identity while the new graphic is disabled. Temporary ASS scripts are
removed after encoder exit or cancellation, including cancellation before start.

## Remaining acceptance criteria

- Arabic locale and RTL layout; preserve English fallback.
- Verify video countdown playback on actual GPU hardware and an external IPTV panel; extend saved countdowns to edited excerpts and filler variants.
- Add the next-title graphic and a real five-second inter-program bumper; the optional current-title graphic is implemented.
- Live, direct, hybrid, archived and standby modes; explicit preparation progress and limits on concurrent jobs, threads and storage.
- Extend the local saved-channel implementation to remote sources, random fillers and additional playback engines; verify complete HLS playback on Windows and actual GPU hardware.
- Preserve schedule and permit switching back to live. Provide start, stop, skip, restart and scheduled content replacement.
- Per-channel quality profiles and optional adaptive HLS; verify actual output URLs with IPTV panel.
- Verify the new owner/operator controls and central license issuer on real customer installations; provision HTTPS. Basic authentication is not a substitute for stream authorization.
- Windows and Linux build and playback verification before a release.

## Customer distribution and licensing status

Customer builds no longer generate browser source maps. Executable staging also
omits stale source maps, TypeScript files, root build metadata, environment files
and conventionally named private issuer keys. Runtime JavaScript, native modules,
SQL migrations, public verification keys and license notices are retained. This
reduces accidental disclosure; minification and executable packaging do not
prevent a server administrator from extracting or modifying local software.

The application now includes **Settings > Users and licenses** (Arabic/English):
owner-only user creation, disable/enable and deletion; signed license issuance,
expiry, server binding, renewal, disable/enable, and customer activation. On the issuer, fill the optional **User server ID** when adding an account to
bind it to that customer installation. Customer copies verify those credentials
online with the issuer; these accounts cannot log in to another customer's
installation or the issuer itself. Disable/delete from the issuer takes effect
after a maximum 30-second successful-login cache. Central account verification
requires an active **online** customer license. Offline installations use the
bootstrap owner or local operator accounts created on that installation. Leave the field empty for a local account;
local account disable/delete is checked on each new login request. Ordinary users cannot call owner
management endpoints. They otherwise retain access to application operations and
must be trusted with that installation. Owner credentials remain the existing
`TUNARR_BASIC_AUTH_USER` / `TUNARR_BASIC_AUTH_PASSWORD` bootstrap configuration;
they cannot be deleted through the operator list. Added passwords require at
least 12 characters and are stored using salted scrypt.

### Owner issuer installation

Start your own installation with both owner login variables and
`XBEST_LICENSE_ISSUER=1`. Open `/web/settings/access` and copy the **public key**
for customer deployment. The runtime-generated private key is stored under the
configured database directory at `access/issuer.private.pem`; keep it only on
your issuer, back it up privately, and restrict its filesystem permissions.
The public-key endpoint never exports the private key. Do not give customers a
copy of your issuer database directory. Windows deployments should restrict the
access directory to the service account using NTFS permissions.

### Customer installation

Configure its owner login and set:

- `XBEST_LICENSE_PUBLIC_KEY_FILE`: absolute path to a PEM file containing the
  issuer public key copied from your panel.
- `XBEST_LICENSE_SERVER_URL`: HTTPS address of your reachable issuer (for example
  `https://licenses.example.com`). Required for online activation and central
  accounts; omit it for an offline-only customer. Plain HTTP is accepted only
  for localhost tests.
- Leave `XBEST_LICENSE_ISSUER` unset. Never include an issuer private key.

Open `/web/settings/access`, copy the installation ID into your owner panel,
choose **Online** or **Offline** and issue a license, then paste the returned
activation code into the customer panel. The validation mode is signed into the
code and cannot be changed by editing its payload. Renewing an online license
generates a new activation code and invalidates the old one. Disabled online
licenses fail the next online check, with up to a 60-second success cache.
After the cache expires, an unreachable issuer also blocks new protected
requests. Expired/unactivated clients retain access to the activation page.
Already-open continuous streams are not forcibly terminated; no files are erased.
Use HTTPS for the entire application, including Basic Auth; the application does
not provision TLS certificates or deploy your issuer service automatically.

### Offline activation (no continuously reachable owner machine)

Run the owner issuer on your Windows machine, copy its public key to the Linux
customer installation, and leave `XBEST_LICENSE_SERVER_URL` unset there. In the
owner panel choose **Offline — valid until expiry**, enter the Linux installation
ID and expiry, then transfer the signed code manually into its activation page.
The Windows machine may be turned off afterward. Verification is local: signature,
installation identity and expiry are checked on activation and new protected
requests, including after restart. Login offline uses that installation's owner
or locally created accounts; central customer-bound users still need the online
mode and a reachable issuer.

**Offline codes cannot be revoked remotely.** Disabling the issuer record does
not stop a copy that already has an offline code. Renewing issues another code
but the older offline code remains valid until its original expiry. The panel
labels the mode, explains this limit and disables its remote-revocation button.
Existing codes without an explicit validation mode remain online, requiring a
reachable issuer. Offline mode does not create an outage fallback for online
licenses. Local-clock expiry cannot provide trusted time against a host
administrator who rolls back the clock or patches checks.

Unconfigured existing installations keep their previous behavior and do not
require a license. A server administrator can change flags or patch the binary:
these checks cannot guarantee anti-tamper protection on a customer-controlled
host. Host identity/installation UUID binding also cannot prevent an administrator
from cloning or spoofing a machine. Source in this public repository remains
visible. Future private code needs a private delivery path.

Release packaging now includes an external and in-archive SHA-256 manifest for
comparison with a trusted published release. It detects different downloaded
bytes; it is not an unpatchable runtime integrity check or a code-signing certificate.
