# XBest custom studio interface

The user requires a recognizable, independently designed XBest interface, including
layout, navigation, channel presentation and sign-in, with no upstream product
branding in customer-facing chrome. This is an authorized custom distribution;
no upstream design approval or original authorship of the underlying engine is
claimed. LICENSE and third-party notices remain intact. Public protocol fields,
existing installation identifiers and persisted storage keys remain compatible.

The default application now uses XBestShell: a fixed desktop sidebar, contextual
sub-navigation, compact command header, mobile drawer, language/color controls,
keyboard command palette and logout. The former desktop top navigation and phone
bottom bar are not mounted. The home route is a studio dashboard backed by actual
channel/session/guide data; it distinguishes unavailable metrics from zero, labels
connections separately from viewers, and supports search and operational links.
Channel cards, card/table switching and shared page headers are redesigned. The
settings workspace, welcome panels and error state receive the same identity.
Detailed scheduling, library and configuration widgets reuse their existing
functional logic; this is not a rewrite of the media engine or every editor.

The browser login is XBest HTML/CSS in Arabic/English, served without a Basic Auth
challenge for HTML navigation. Opaque process-local cookies are HttpOnly and
SameSite=Strict, Secure when HTTPS is correctly detected, with an 8-hour absolute
lifetime. Sessions do not survive a server restart; credentials are not written
to disk. Current account validation still runs on each request, preserving local
and online-account disable behavior. Cookie restoration rejects cross-origin
browser requests, and login/logout also check origin and rate-limit failures.
The login document uses a per-response CSP nonce and does not interpolate user
input. Explicit HTTP Basic clients remain supported. Browser-cookie access is
intended for same-origin deployments. Existing browser-native Basic credentials
may remain cached by a browser until its authentication cache is cleared.

Customer-facing copy and active Arabic/English catalogs use XBest. Fresh app
marks, favicon and generated broadcast status artwork replace upstream visuals;
old artwork URLs serve the new images for compatibility. Stream metadata, default
profile names, discovery friendly name and health-check prose use XBest without
changing stable API keys or tuner IDs. The development-only Pillow generator
creates new code-native artwork; it is not a runtime dependency.

Verification includes real-data dashboard metrics/search/error and empty states,
Arabic mobile navigation/command invocation, channel controls, branding catalogs,
account/license regressions and cookie login/logout, disabled-account and owner
permission checks. CI captures Arabic/English dashboard, drawer and login views
at desktop/mobile sizes and checks horizontal overflow. Local Chromium cannot
start because the environment forbids its singleton Unix socket; local browser
review must not be claimed. Native Windows/Linux packaging and CI browser images
remain acceptance checks for the new interface.
