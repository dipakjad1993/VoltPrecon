# Security policy

## Report a vulnerability

Email **security@voltprecon.app** (PGP on request). We acknowledge within
2 business days and ship or mitigate critical issues within 14 days. Do not
open public issues for unpatched vulnerabilities. Safe-harbor: good-faith
research against staging (`staging.voltprecon.app`) is welcome; do not touch
production data, do not exfiltrate, do not degrade service.

## Posture (auditable, not aspirational)

- **Zero production npm dependencies** for API + engine + static server. The only
  supply chain is the container base image — pinned by digest in
  `infra/Dockerfile`, rebuilt on a monthly cadence (see compose `web`/`api`).
- **Headers on every response:** CSP (tight, offline-PWA compatible; jsdelivr
  allow-listed only for lazy OCR weights), HSTS default-on in prod
  (`max-age=31536000; includeSubDomains`; `HSTS=0` only for plaintext dev),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Permissions-Policy` (camera/mic/geolocation off), `X-Frame-Options:
  SAMEORIGIN`, `Cross-Origin-Opener-Policy: same-origin`. CI asserts CSP on `/`
  (`tools/qa/security-headers.mjs`).
- **No PII by design:** no cookies, no analytics suites, no VIN collection.
  Telemetry is anonymous counters (`/api/v1/events`, names ≤40ch, 500-ring
  buffer) + owner km reports (5–1200 range-checked). See `docs/RETENTION.md`.
- **Input discipline:** 1MB body cap, unknown modelIds rejected with `404
  UNKNOWN_MODEL` (never computed), rate limits 60/min/IP with `Retry-After` +
  `X-RateLimit-*`, request IDs echoed for incident correlation.
- **SEO dynamic renderer** (`/ev/*`, `/compare/*`) resolves slugs server-side
  from the checked-in bundle only — path traversal neutralized by
  `path.normalize` + prefix check; unknown slugs 404 honestly.

## Disclosure history

| Date | Item | Status |
|---|---|---|
| 2026-10-08 | P0 silent-expired-subsidy path removed (subsidy now date-driven, tested) | fixed, test-locked |
| 2026-10-08 | HSTS default-on; CSP asserted in CI; digests pinned | shipped |

Absence of this file used to be a red flag in every enterprise checklist. It isn't absent anymore.
