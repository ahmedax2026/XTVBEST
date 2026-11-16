# XBest owner panel and customer installations

This implements the user's authorized custom-fork requirements, not an upstream
Tunarr contribution. The user explicitly chose to keep this repository public
for now and move it private later.

The owner uses Settings > Users and licenses in the running application. The issuer panel can bind operator accounts to a customer installation; customer
copies validate them online, with at most a 30-second successful-login cache.
Unbound accounts belong to the current installation. A separately configured owner
installation issues customer licenses. Only the existing bootstrap owner can
manage accounts and activation. Operator accounts control application operations;
they are trusted administrators of that installation, not a filesystem sandbox.

Ed25519 signing keys are generated at runtime exclusively on the issuer. Customer
copies receive the public key and HTTPS issuer address. Signed tokens bind a
customer, installation fingerprint and expiry. Issuer-side disable/renew changes
are checked on new protected requests with a maximum 60-second success cache.
Failures after that cache fail closed; no media is deleted. Already-open continuous
streams are not forcibly disconnected. Renewal requires installing the new code.
No claim of secure hardware binding is made: the fingerprint uses a persisted
installation UUID and host identity. Root can copy IDs or patch local enforcement.

Account hashes and issuer state use a serialized, atomic JSON sidecar, avoiding
changes to the upstream SQLite schema and new runtime dependencies. Passwords use
salted scrypt. Credential verification has bounded concurrency and a short success
cache invalidated on persistence. Login failures are rate limited by client IP.
Only the owner endpoints return account and license records. Cross-origin writes
are denied. Public verification exposes only a boolean for a supplied signed token.

Deployment needs a reachable HTTPS issuer. No central service is deployed by this
change. Existing installations retain their current unlicensed behavior until
explicitly configured. This is backward compatibility, not tamper resistance.
A customer server administrator can alter flags, extract packaged JavaScript,
patch checks or replace public keys. A public repository exposes source regardless
of packaging. Removing source maps and publishing independent checksums reduces
accidental disclosure and detects changed downloads; neither prevents reverse
engineering. Code-signing certificates, native obfuscation and hosted proprietary
processing are not implemented by this phase.
