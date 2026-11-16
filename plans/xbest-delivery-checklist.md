# XBEST delivery checkpoint — 2026-11-17

User authorizes continued implementation on feature/xbest-studio, including scheduled follow-up while their laptop is closed. Do not merge main or publish a production release without separate direction.

## Required scope

- Fully Arabic interface/help/errors, retaining English option. At least 342 catalog entries were translated during this session; roughly 844 equal-to-English entries remain, including technical labels and obsolete-neutral placeholders. Audit active entries rather than claiming complete coverage.
- Product name XBEST throughout customer-facing surfaces, XBEST.exe, branded release folders and archives. Retain third-party copyright/license notices.
- The actual server logo is the red/white X IPTV image, NOT the simple letter X. A matching original was found in ahmedax2026/XIPTV/logo.png, Git blob 3a777892bd3bfccd7b1d5f2c1ed979766dfd50ea. Original 16/32/180px website icons were also copied. Commit afe57e5 installs these in the shell, welcome, login, SVG favicons and Windows ICO generator.
- Configurable current-title text, nine positions, margins, font family, size, color, opacity, bold and outline; resolution-aware preview and actual ASS rendering. Custom text is channel-wide, with explicit helper text; blank uses each program title. Changing burned graphics invalidates saved renditions. Existing title appearance remains if no title options were saved.
- Packaged Windows startup: reuse valid configured tools / executable siblings / PATH before downloading. Only missing/incompatible FFmpeg tools are downloaded, verified against GitHub asset SHA-256 and tested before publication. Permission errors do not trigger blind reinstall. Save discovered paths. Auto-select and remember a free port; open correct URL; named pipe reopens an existing instance before DB initialization. Honor explicit --port/env. XBEST_AUTOSTART=0 disables desktop automation; XBEST_NO_BROWSER=1 suppresses browser. Other OS/service startup is manual.
- A separate OWNER Windows archive for accounts (email can be username) and issuing online/offline licenses. Issuer keys generated at runtime ONLY in owner's private data folder; never put private keys, passwords or issuer state into repository/customer archives. Account/issuer UI already exists; create the owner launcher and validate it. Offline codes cannot be remotely revoked; online mode needs a reachable HTTPS issuer. No email delivery was requested.
- Include Arabic usage instructions.

## Evidence and current work

- Source commits: f36cf87 (108 welcome/common translations and archive naming); 2b46517 (title controls); faa232d / 954e6a3 (desktop startup and compiler fixes); aac6ad4 (234 more Arabic entries, EXE metadata and native acceptance); afe57e5 (actual original logo).
- Workflow 43979384585: Windows and Linux verification SUCCESS; both native package jobs SUCCESS; packaged Windows acceptance FAILED because XBEST.exe exited with code 1. The failing run did not print redirected startup logs. Do not deliver it as ready.
- Commit afe57e5 makes acceptance print stdout/stderr in finally. Run 43980522771 confirms a native bindings getFileName TypeError in minified SQLite binding inference. An explicit nativeBinding path based on pkg.entrypoint is being added in nativeSqliteOptions.ts and DBAccess. Re-test the native executable; do not claim the fix succeeds yet. Do not assume successful packaging means a working executable.
- Tests observed on Linux: 195 server/packaging/startup tests passed (9 skipped); 33 real-FFmpeg acceptance tests passed; 85 frontend tests passed. Windows verification also passed. This is not actual GPU-device verification.
- A temporary workflow step formats changed source in the CI workspace and prints XBEST_FORMATTED JSON records. Retrieve those into committed files, then remove the formatting/recording steps and re-verify the exact committed source. API generation also prints XBEST_GENERATED JSON records; regenerated docs and web types were already committed in aac6ad4.
- Remaining general Build/commitlint failures include older history/full-suite issues; inspect rather than disabling checks or rewriting user's history.
- Local exec/view_image environment returned No usable execution environment. GitHub tools and CI remain available.
- Owner packaging and launch script are in progress. Separate APPDATA/XBEST-OWNER data, DPAPI encrypted current-Windows-user credentials, issuer environment flag, admin-only startup (skip unneeded FFmpeg), owner panel landing URL. Do not claim this is a distinct tamper-proof proprietary media engine.

## Outstanding acceptance

1. Fix actual packaged Windows startup exit and validate free-port fallback, second launch, HTTP API and served xbest-workspace bundle.
2. Build/test OWNER archive and verify no owner launcher/secrets in customer archive; owner can log in, create email-named account and issue a signed offline token.
3. Complete remaining Arabic help and error coverage; check RTL layout and title editor fields.
4. Replace simple X mark still embedded in default status artwork generator; use actual original logo there as well.
5. Remove temporary CI source snapshot formatting steps after committing formatted files; keep useful verification.
6. Only provide new download links after relevant checks and actual native acceptance pass. State precise remaining limitations and Cairo build time.
