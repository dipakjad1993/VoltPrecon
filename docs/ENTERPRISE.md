# VoltPrecon Enterprise Readiness — trust pack (Oct-2026)

For procurement, lender, insurer, dealer, and fleet reviewers. Everything here is
verifiable in this repo + the live `/api/v1/health`, `/status.json`, and CI logs.

## 1. What we guarantee (and what we deliberately do NOT claim)

- **Snapshots with SLAs, not tick feeds.** Tariffs/fuel are an Apr-2026 snapshot
  (`packages/data/src/tariffs.json` `_meta.as_of`), affirmed 2026-10-08, next due
  2026-11-22, 45-day freshness SLA enforced in CI (`tools/data/check.py`).
  Subsidy gazettes arrive by notice (monthly `tools/data/subsidy-watch.py`); the
  engine auto-expires them by date and is test-locked. No `real-time` claim
  exists in product, pages, or API — CI greps for it and fails closed.
- **Verification ladder T0–T5** (`docs/VERIFICATION.md`): 14 test-locked physics
  invariants + fuzz, 78 lab-verified specs with per-row PDF receipts + cert IDs,
  snapshot tariffs with as-of/affirmed/next-due, 842 flagged estimates (seed-42,
  ±~8% bands, per-page `noindex`), nightly owner-aggregate rollups.
- **Enterprise sentence:** *"78 lab-verified specs with OEM source receipts, 14
  test-locked physics invariants, snapshot tariffs with published
  as-of/affirmed_on/next_due dates and a 45-day freshness SLA, estimates flagged
  with confidence bands + noindex, and owner-verified aggregates feeding back
  into pages."*

## 2. Data freshness + provenance (receipts)

| Asset | Stamp | Receipt |
|---|---|---|
| Tariffs + fuel (25 geos) | `as_of 2026-04-15`, affirmed 2026-10-08, next due 2026-11-22 | `tariffs.json _meta` + SQLite `tariffs_history` append-only + per-page table with regulator link |
| Subsidies (10 schemes) | PM E-DRIVE till 2026-07-31 23:59 IST, ₹0 from 2026-08-01 | `subsidies.json` + `packages/engine/src/subsidy.js` + expiry unit test |
| Specs (78 curated) | per-row `verified_on` + `source_pdf_url` + `cert_id` | `models.curated.json` + SQLite `models` columns + `check.py` gate |
| Pack prices | WoodMac 2026 series (yearly) | `docs/METHOD.md` stamp |
| FX | 83.5 INR/USD as of 2026-04-15 (`tariffs.json _meta.fx_2026_04`) | rides every `/estimate` response as `currency.fxInrPerUsd + fxAsOf` — never silent |
| Owner aggregates | nightly `rollup-owners.py` → `owner_aggregates` + `updated_on` | `/api/v1/owner-range` + pages render "N owners average X km" |

## 3. API SLA + version policy (see `docs/API.md`)

- Rate limits 60 req/min/IP (token bucket, `429 + Retry-After + X-RateLimit-*` on
  every response), 1MB body cap, request IDs echoed (`x-request-id`), JSON error
  envelopes (`UNKNOWN_MODEL`, `RATE_LIMITED`, `BAD_RANGE_REPORT`, `NOT_FOUND`, `INTERNAL`).
- Targets (single-instance baseline, from access logs): `GET /health,/models` p99
  <50ms; `POST /estimate,/compare` p99 <150ms; 99.5% monthly excl. deploys.
- **Before any signed SLA:** Redis-backed limits + aggregates, SQLite WAL +
  nightly dumps to object storage (`tools/ops/sqlite-dump.py`), read-replica
  posture, `/health` dependency block wired to alerting. Today's posture is
  documented as single-instance — correct for now, in writing, no surprises.
- Versioning: v1 at `/api/v1/*`; v2 ships alongside (never flag-day). 6-month
  Sunset + `Deprecation/Sunset` headers, then 410 GONE with v2 pointer for 3 months.

## 4. Performance (field data, not just lab)

- Budgets enforced in CI (`tools/perf/budget.js`): shell ≤60KB, bundle ≤260KB,
  engine ≤25KB, first load <350KB; `deep.js` lazy on ANALYZE; no framework, no
  analytics vendor payloads (grep-gated).
- **Field RUM:** PWA beacons privacy-friendly `rum_webvitals {lcpMs,inpMs,cls}`
  (PerformanceObserver, no URL/IP/cookie) to `POST /api/v1/events`; surfaced in
  `GET /api/v1/health rum` (p75 vs targets LCP 2500ms / INP 200ms / CLS 0.1).
  Lab Lighthouse stays in CI; field numbers close deals.

## 5. SEO / GEO posture (2026)

- Staged rollout: 78 curated × 25 geos × 3 intents indexable
  (`sitemap-curated.xml` primary); 842 estimated × 25 × 3 staged `noindex`
  (`sitemap-estimated.xml`) until owner-verified enrichment. Dynamic
  `/ev/* + /compare/*` renderer shares one template with the static pre-render —
  all 69,000 sitemap URLs resolve, never 404, never drift.
- Scaled-content defense: `tools/seo/scaled-audit.py` per-template
  fix/thin/retire + `dist/seo/triage-410.txt` (410 Gone for zero-value tail, not
  noindex — noindex still costs crawl budget). CI asserts curated/estimated split.
- Citability: quotable 40–60-word answer blocks, FAQ/Vehicle/Product/Offer +
  BreadcrumbList, Organization `knowsAbout` + named data-steward authors,
  `/method/*` hub (normalizer, climate-derate, degradation, winter-range,
  subsidy-expiry) for fan-out coverage, `llms.txt` dossier + `openapi.json`.
- Measurement: `tools/seo/share-of-model.py` (20 prompts × 4 types × 6 engines
  weekly) + branded-search lift in GSC. Bing Webmaster gets `sitemap-curated.xml`
  first (`tools/seo/bing-submit.py`) — Copilot draws from Bing.

## 6. Security / privacy / retention

- Zero production npm deps (API + engine + static); container pinned by digest
  (`infra/DIGESTS.md`, monthly cadence). CSP/HSTS/nosniff/Referrer/Permissions
  asserted in CI (`tools/qa/security-headers.mjs`).
- No cookies, no analytics suites, no VIN/PII. Photos/CSV parsed on-device;
  pincodes used once for slab hint. Raw logs + events ≤90 days; weekly rollup
  keeps counts only (`tools/ops/log-rollup.py`). See `SECURITY.md` +
  `docs/RETENTION.md`. Contact: security@voltprecon.app / privacy@voltprecon.app.

## 7. Accessibility

- WCAG 2.2 AA target, formal pass 2026-10-08 (`docs/WCAG.md`), re-run on every
  stage-2/3 UI change. Independent audit + VPAT before first public-sector bid
  (contact: accessibility@voltprecon.app).

## 8. Pre-SLA upgrade checklist (for the SOW)

- [ ] Redis-backed rate limits + owner aggregates (multi-instance)
- [ ] SQLite WAL + nightly dumps to object storage (script shipped; wire cron → bucket)
- [ ] Read-replica posture + `/health` → alerting + status-page history
- [ ] Independent WCAG audit → VPAT
- [ ] DPA + SOC2 evidence pack (90-day retention + anonymous-only design is the core control)
