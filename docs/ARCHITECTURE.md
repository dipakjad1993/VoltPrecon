# Architecture (enterprise)

```
browser (PWA, offline) ── fetch data.bundle.json (~202 KB, SW-cached, versioned by as_of+db_bytes)
   │  imports engine .js (normalizer/physics/tco/resale_soh/subsidy, ~18 KB total, zero-dep)
   │  OCR: Tesseract.js ESM CDN, lazy only on photo attach; CSV parsed locally
   └── all compute on-device — no backend required for core loop

node API (zero-dep http) ── reads same bundle ── /health /models /estimate /compare
   │  request IDs (echo), X-RateLimit-*, JSON error envelopes, dep-aware health
   └── serves sitemap index (dist/seo) + openapi + llms for crawlers/integrators

static server (zero-dep http) ── canonical / app, 301 legacy /apps/web/* -> /
   └── static pre-render fast-path + DYNAMIC /ev/* + /compare/* renderer
       (shared template tools/seo/render-ev.js — all 69,000 sitemap URLs resolve)

data pipeline: curated JSON (per-row source_url/verified_on) + tariffs + subsidies + chemistries
   ├── generator.py (seed 42, schema_version=3) → voltprecon.sqlite
   │     (models + tariffs + tariffs_history append-only + owner_aggregates preserved + FTS5)
   ├── refresh-tariffs.py (monthly importer → tariffs_history)
   ├── subsidy-watch.py (monthly gazette cron; engine auto-expires, tested)
   └── rollup-owners.py (nightly owner aggregates → bundle + pages)

seo: generate.js (300 static) + method.js (3 crawlable) + llms.txt dossier + ping.js post-deploy
```

**Decisions:** vanilla JS (no framework) for 3G + 10-yr maintainability; TS files are typed references, `.js` is runtime truth (both tested + 2,500-case fuzz); Python parity engine for analysts; SQLite for analysts/fleet ETL (WAL mode; nightly dumps to object storage before any SLA), JSON bundle for the client; zero production npm deps (API + engine + static) = minimal CVE surface; Docker pins node:20-slim + digest-resolve cadence in CI.

**Perf budgets:** first load <350 KB (shell ≤60 KB + bundle ≤260 KB + engine ≤25 KB); search <50 ms (in-memory index); estimate <5 ms (no allocs hot path); Lighthouse target ≥95 on Moto G4/3G. Stage-2/3 deep renderers live in `apps/web/deep.js`, lazy-imported on ANALYZE and pre-cached by the SW (own 25KB budget, excluded from first-load).

**Security/privacy:** no cookies, no analytics suites, no VIN/PII collection; photo/CSV never leaves device (OCR worker local; CDN weights only); HSTS default-on (prod), CSP asserted in CI; API stateless, CORS-open read endpoints, no secrets. See SECURITY.md + docs/RETENTION.md.

**Freshness:** tariffs/fuel monthly importer + 45-day CI gate; subsidies gazette watch; specs on launch (count assertion); pack prices yearly. See docs/VERIFICATION.md.

**CI:** generator → check (counts + governance + freshness) → gazette watch → python parity → node tests (unit + fuzz) → app smoke → sec-headers → seo build → integrity + staging diff → perf budget → docker build + digest record → status.json. See `.github/workflows/ci.yml`.
