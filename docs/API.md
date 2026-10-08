# VoltPrecon API — integration guide, SLA, and version policy (v1)

Public, no key. CORS-open on calculator endpoints is a documented decision for
lender/insurance/dealer embeds (no cookies, no secrets, no PII). Full machine
spec: `/openapi.json`. Verification posture: `docs/VERIFICATION.md`.

## Endpoints

| Method + path | What | Cache | Rate limit |
|---|---|---|---|
| `GET /api/v1/health` | Build provenance + dependency status + freshness | 60s | counted |
| `GET /api/v1/models?q=&segment=&limit=` | Model index (max 100; `p` = curated/estimated) | 1h | counted |
| `POST /api/v1/estimate {"modelId","use":{...}}` | Physics + TCO + SoH + resaleYr3 | none | counted |
| `POST /api/v1/compare {"ids":[],"use":{}}` | Ranked rivals (max 4, unknown ids dropped) | none | counted |
| `POST /api/v1/owner-range {"modelId","km","cond"}` | Anonymous aggregate (km 5–1200) | none | counted |
| `POST /api/v1/events {"events":[...]}` | Anonymous telemetry (max 20, name ≤40ch) | none | counted |

Every response carries `x-request-id` (echoed if you send one), `api-version: v1`,
and `X-RateLimit-Limit/Remaining/Reset`. Send `x-request-id` on every call —
incident correlation without it is guesswork. Errors are envelopes, never bare
strings: `{"error":{"code":"UNKNOWN_MODEL","message":"...","requestId":"..."}}`.
Codes: `RATE_LIMITED` (429 + `Retry-After`), `BAD_RANGE_REPORT` (400),
`UNKNOWN_MODEL` (404), `NOT_FOUND` (404), `INTERNAL` (500).

## Rate limits

60 req/min/IP (token bucket, single-instance in-memory; Redis-backed limits are
the documented pre-SLA upgrade — see Reliability below). Reads and writes share
the bucket. `429` always includes `Retry-After` seconds.

## SLA (from our own access logs, single-instance baseline)

| Signal | Target | Notes |
|---|---|---|
| `GET /health`, `/models` p99 | < 50 ms | in-memory bundle, gzip >1KB |
| `POST /estimate`, `/compare` p99 | < 150 ms | physics <5 ms; JSON + gzip dominate |
| Availability (single instance) | 99.5% monthly | excludes deploys; status page counts it |
| Tariff-data freshness | snapshot ≤ 45 days since review | `/health` reports `affirmed_on`; CI gates it |

Before any lender/dealer SLA signature: Redis-backed limits + aggregates,
SQLite WAL + nightly dumps to object storage, read-replica posture, and the
`/health` dependency block (already shipped) wired to alerting. Today's posture
is documented as single-instance — correct for now, in writing, no surprises.

## Version / deprecation policy (in writing, as procurement requires)

- Current: **v1** under `/api/v1/*`. A future **v2** ships under `/api/v2/*`
  alongside v1 — never as a flag-day rename.
- v1 deprecation, when announced: 6-month notice on the status page + CHANGELOG,
  `Deprecation: true` + `Sunset: <date>` headers on v1 responses during the window,
  then v1 returns `410 {"error":{"code":"GONE",...}}` with a v2 pointer for 3 months.
- Breaking changes (field renames, unit changes, subsidy-logic changes) always
  mean a new version, never a silent v1 edit. Additive fields need no version bump.
- `GET /openapi.json` is versioned with the API (`info.version` tracks it).

## Worked example

```bash
curl -s -H 'x-request-id: demo-1' 'https://voltprecon.app/api/v1/models?q=nexon&limit=2'
curl -s -H 'x-request-id: demo-2' -X POST https://voltprecon.app/api/v1/estimate \
  -d '{"modelId":"tata-nexon-ev-45-2025","use":{"tariff":"IN-MH","kmPerDay":40,"years":5}}'
```
