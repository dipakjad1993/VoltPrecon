# VoltPrecon Verification Ladder — the honest truth about our data (Oct-2026)

No serious enterprise buyer believes "100% verified real-time" as a slogan. They
believe **verification ladders with evidence**. So here is ours, exactly as it stands.
We never claim a tier we cannot show receipts for.

## The ladder

| Tier | What it means | Current state (Oct-2026) | Receipt |
|---|---|---|---|
| **T0 — test-locked** | Physics invariants pinned by automated tests; any code change that breaks them fails CI | **14 tests: 7 unit** (Ather 195→95–125, Model Y 531→348, Nexon no-breakeven, Ola month-19, normalizer 195→150, SoH/resale, **subsidy expiry**) **+ 7 fuzz/property** (3,000 randomized cases: bounds, monotonicity, stable-breakeven, subsidy caps) | `packages/engine/tests/` (CI runs `node --test`) + Python parity `packages/engine/python/engine.py` |
| **T1 — lab-verified** | Hand-checked specs from OEM datasheets + ARAI/EPA/WLTP/CLTC certificates | **78 curated models (Oct-2026 refresh: +Harrier 65/75, e Vitara 61, Creta 42, Activa e:, e-Access, Oben, Matter, Euler, Altigreen, Dolphin, Enyaq, bZ4X, EV9; −TVS XL concept, −Emflux discontinued)**, `verified_on` + `source_pdf_url` + `cert_id` per row | `packages/data/src/models.curated.json` (`source_url`, `source_pdf_url`, `cert_id`, `verified_on`); SQLite `models.source_pdf_url`, `models.cert_id` (schema v4); `tools/data/check.py` asserts count = 78 |
| **T2 — snapshot** | Tariffs + fuel + subsidies stamped with an as-of date and a refresh SLA | **25 tariff geos + 10 subsidy schemes, stamped 2026-04-15**, 45-day freshness SLA | `packages/data/src/tariffs.json` + `subsidies.json` (`_meta.as_of`); SQLite `tariffs_history(code, as_of, source_url)`; `tools/data/refresh-tariffs.py`; CI freshness gate |
| **T3 — parametric** | Estimated models, deterministic seed, always flagged with confidence bands | **842 estimated models, seed-42**, `provenance=estimated`, ±~8% band in UI + pages + API | `packages/data/src/generator.py` (`ARCHETYPES`, `rng = Random(42)`); per-page `noindex` + `sitemap-estimated.xml` split; API `provenance` field |
| **T4 — live (owner-verified aggregates)** | Anonymous owner odo reports rolled up nightly into static pages | Pipeline built: `/api/v1/owner-range` + `/api/v1/events` → `owner_aggregates.json` → generator injects counts | `tools/data/rollup-owners.py`; SQLite `owner_aggregates`; pages render "N owners average X km" |
| **T5 — real-time** | Live tariffs, fuel prices, subsidy gazettes | **NOT CLAIMED.** Subsidy changes arrive by gazette (monthly watch, not websockets); tariff feeds are importer + history table, not tick data | `tools/data/subsidy-watch.py` (monthly cron); `tools/data/refresh-tariffs.py`; this row stays honest until a feed with an SLA backs it |

## The enterprise sentence (defensible in procurement)

> "78 lab-verified specs with per-model PDF receipts + cert IDs, 14 test-locked physics invariants, snapshot tariffs with
> published as-of/affirmed_on/next_due dates and a 45-day freshness SLA, estimates flagged with confidence
> bands + noindex, and owner-verified aggregates feeding back into pages. Snapshots with SLAs — no real-time tick claims."

## What we deliberately do NOT build

- **Live VIN decoding** — privacy liability + API costs; photo/CSV SoH instead (on-device).
- **Per-second price websockets** — nobody buys a vehicle on tick data; snapshots with SLAs.
- **Client-side analytics suites** — violates the privacy posture and the 350KB budget;
  anonymous counters + weekly server-side log rollup instead (`tools/ops/log-rollup.py`).

## Freshness SLA

| Asset | Refresh | Gate |
|---|---|---|
| Tariffs + fuel | Monthly importer, `tariffs_history` append-only | CI fails if `as_of` > 45 days old |
| Subsidies | Monthly gazette watch vs checked-in source list + expiry countdown | `subsidy-watch.py` diff; engine auto-expires (tested) |
| Specs | On model launch (curated PR bumps `EXPECTED_CURATED` + CHANGELOG) | `tools/data/check.py` count assertion |
| Pack prices (WoodMac) | Yearly | `docs/METHOD.md` stamp |
| Owner aggregates | Nightly rollup | `owner_aggregates.json` `updated_on` stamp |

Word discipline: the word **"real-time" appears nowhere in product, pages, or API**
until a feed with a written SLA backs it. Precision is the brand.
