# ⚡ VoltPrecon — Universal EV Truth Engine

**One URL. Pick any EV, get the truth.** Real range (not lab) + true 5-yr cost
vs petrol + resale — for **920 2W/3W/4W models (78 lab-verified + 842
estimates) across 25 tariff geos**. No login. No API key. Offline PWA that
works on a $120 Android on 3G (first load < 350 KB).

> SEMrush + CarFax + Calculator had a baby — and it wasn't lying for affiliate commission.

## The 3-page tool

| Page | What lives there | Gate |
|---|---|---|
| **1 · Inputs** | Pick your EV (brand → verified-model dropdowns + full-index search) + where/how you ride (tariff, city, temp, load, speed, charging mix). `ANALYZE MY EV →` runs the analysis | — |
| **2 · Core analysis** | A. Physics-Based Real Range Engine · B. True TCO Assassin · C. Battery Passport Lite — every sub-model computed live for your pick. `SEE MY OUTPUTS →` sits below the full analysis | Needs a picked vehicle |
| **3 · Outputs** | YOUR range hero, 5-yr savings, breakeven month, cost/km, yr-3 resale, breakeven chart + data table, ranked top-3 rivals, battery passport, owner-verified range, 1-page loan PDF | Needs a completed analysis |

The stepper (1 Inputs · 2 Analysis · 3 Outputs) is clickable with the same
guards — no empty-results page is reachable.

### A · Physics-Based Real Range Engine (offline, 5 sub-models)

- **A1 Spec normalizer** — ARAI / WLTP / EPA / CLTC / IDC → one honest Wh/km baseline, plus a same-pack-under-every-cycle inflation table.
- **A2 Load model** — lab mass vs your mass, plus a live sensitivity table (65 kg vs 85 kg rider, +60 kg pillion, +30 kg delivery cargo).
- **A3 Climate derate** — Arrhenius resistance + heater/AC curves on 2026 cell data (−7 °C Michigan ≈ −32 %, 42 °C Delhi ≈ −18 %), plus a −7 → 42 °C sweep.
- **A4 Speed curve** — your cruise vs the lab anchor (CdA + rolling per body type), plus a 40 → 120 kph sweep.
- **A5 Degradation** — LFP (CATL ~40 % share) vs NMC vs sodium-ion (Naxtra-class) vs LMFP, year 0/1/3/5/8, plus a 6-chemistry SoH matrix.

### B · True TCO Assassin (4 sub-models)

- **B1 Energy cost** — Apr-2026 fuel + home/fast tariffs pre-loaded (MH slab ~₹9.5 vs Texas $0.13 vs Germany ~$0.41 vs Vietnam EVN), plus your-100-km around the world.
- **B2 Subsidy autopilot** — PM E-DRIVE (till 31 Jul 2026), GST 5 %, US IRA logic, FR/DE/ID schemes. Auto-applied, auto-expired, never silent.
- **B3 Opex** — maintenance (2W ₹0.30/km EV vs ₹1.20 ICE) + insurance + tyres + WoodMac 2026 pack prices (LFP ~$85/kWh).
- **B4 Breakeven trajectory** — month 0 → horizon with *"You break even at month N. Not vibes. Math."*

### C · Battery Passport Lite (3 sub-models)

- **C1 Chemistry explainer** + a verdict for *your* inputs (heat, fast-charge habit, duty).
- **C2 SoH trajectory** at your fast-charge share (photos/cycles estimator on page 3).
- **C3 Competitor matrix** — ABRP (4W-only + paywall) vs OEM calculators (biased) vs WoodMac/EV-Volumes (~$25k static PDF) vs this page.

## Verification ladder (not a "100% verified" slogan)

No serious buyer believes "100% verified real-time". They believe ladders with
evidence — ours is published in `docs/VERIFICATION.md` and enforced in CI:

| Tier | State |
|---|---|
| T0 test-locked | **14 engine tests + 2,000-case fuzz**: Ather 195→95–125, Model Y 531→348, Nexon no-breakeven, Ola month-19, subsidy expiry |
| T1 lab-verified | **78 curated specs** (OEM sources + ARAI/EPA/WLTP certs), per-row `source_url` + `cert_id` + `verified_on` |
| T2 snapshot | **Tariffs + fuel, stamped Apr-2026, affirmed 2026-10-08, next due 2026-11-22**, 45-day freshness SLA + `tariffs_history` |
| T3 parametric | **842 estimated models, seed-42**, flagged + confidence-banded + per-page `noindex` |
| T4 owner aggregates | `/api/v1/owner-range` → nightly rollup → pages (pipeline live, aggregates accrue) |
| T5 real-time | **Not claimed.** Snapshots with SLAs, not websockets |

Enterprise sentence: *"78 lab-verified specs with OEM source receipts, 14
test-locked physics invariants, snapshot tariffs with published
as-of/affirmed_on/next_due dates and a 45-day freshness SLA, estimates flagged
with confidence bands + noindex, and owner-verified aggregates feeding back
into pages."*

## Run it (60 seconds)

```powershell
node infra/serve-static.js 9401        # open http://localhost:9401/  (any port works)
node --test packages/engine/tests/     # 14 truth tests + fuzz/property suite
node tools/qa/app-smoke.mjs            # 33-check 3-page click-through (stages, rivals, subsidies)
node tools/perf/budget.js              # 3G budgets: shell 60 KB, deep.js 25 KB, first load 350 KB
node packages/api/src/server.js 3001   # REST API (request IDs, rate-limit headers, error envelopes)
python packages/data/src/generator.py  # rebuild 920-model SQLite + web bundle
```

Staging preview: `docker compose --profile staging up` (app :8081, api :3002).

## Monorepo

| Path | What |
|---|---|
| `apps/web/` | Offline PWA — 3-page tool (vanilla JS, zero framework; `deep.js` lazy analysis module, Tesseract.js OCR lazy) |
| `packages/engine/src/` | Physics v2 + normalizer + TCO + SoH/resale + subsidy expiry (`.js` runtime, `.ts` typed reference) |
| `packages/data/src/` | 78 lab-verified models + parametric expansion to 920, 25 tariffs + history, subsidies + gazette watch, 6 chemistries |
| `packages/data/db/voltprecon.sqlite` | Built artifact: schema_version + models (+sources) + tariffs + tariffs_history + owner_aggregates + FTS5 |
| `packages/api/src/server.js` | Zero-dep REST: health/models/estimate/compare + owner-range/events + sitemap (see `docs/API.md` for SLA + version policy) |
| `tools/seo/` | 540 pre-rendered pages + **dynamic /ev/* + /compare/* renderer** (all 69,000 sitemap URLs resolve) + 5 method pages + llms.txt dossier |
| `tools/data/` | `refresh-tariffs.py` importer, `subsidy-watch.py` gazette cron, `rollup-owners.py` nightly aggregates, `check.py` governance gate |
| `tools/ops/` | `log-rollup.py` weekly analytics (replaces an analytics vendor, keeps privacy) |
| `tools/qa/` | `app-smoke.mjs` (3-stage click-through), `security-headers.mjs` (CSP/HSTS contract) |
| `docs/` | METHOD, VERIFICATION, API/SLA, COMPETITIVE, ARCHITECTURE, RETENTION, WCAG |
| `infra/` | Dockerfile (digest cadence), compose (+staging), hardened static server |

## Truth guarantees

- Every model shows **provenance**: ✅ lab-verified vs ⚠ parametric estimate. Estimates never masquerade.
- Engine says **no breakeven** when math says so (Nexon @40 km/d → beyond 5y; Ola S1X → month ~19).
- Subsidies **auto-expire by date, tested** (PM E-DRIVE ended 31 Jul 2026 → ₹0 post-subsidy TCO, never a negative countdown).
- Tariffs stamped + affirmed with a 45-day review SLA; user-overridable in-app.
- Spec links resolve to **verified OEM sources** (never synthetic deep-PDF guesses that 404).
- The word **"real-time" appears nowhere** in product, pages, or API until a feed with an SLA backs it.

## Monetization (no user fees)

Lender/insurance lead APIs (`/api/v1/estimate` embed), dealer SaaS (11-min close), fleet analytics. Users never pay.
