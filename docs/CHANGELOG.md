# VoltPrecon Changelog — public freshness log (2026 ranking input: dates users + Google see)

## 2026-10-08 — Enterprise readiness release (v1.1.0)
- **Bajaj Chetak 2026 lineup (verified):** one stale "3201" row replaced with the real five — C2501 (2.5 kWh, 113 km IDC, ₹99,802), C3001 (3.0 kWh, 127 km, ₹1,14,270), C3503 (3.5 kWh, 151 km, ₹1,24,157), C3502 (3.5 kWh, 153 km, ₹1,36,939), C3501 (3.5 kWh, 153 km, ₹1,52,140) — specs ex chetak.com brochure Apr-2026 + Bajaj Apr-29-2026 press release (top speeds, chargers), Bengaluru ex-showroom. Curated 62 → 66.
- **Cascading picker:** brand dropdown → model dropdown (brand-only models, curated first) + full 920-model browsable search with make filter, show-more pagination, and tariff review stamp.
- **Lazy split:** stage-2/3 deep renderers moved to `apps/web/deep.js` (dynamic import on ANALYZE, SW pre-cached) — shell back to ~47KB of the 60KB budget with headroom.
- **Brand-purity fix:** estimated placeholders used to borrow real OEM badges ("Bajaj Swift-E") — generator now uses segment-descriptive names ("Scooter E-4"), `check.py` asserts a 90-badge collision list, and smoke resolves every dropdown value back to the bundle to prove brand-purity.
- **Verified-only brand lists:** brand → model dropdowns and brand-filtered search now show lab-verified EVs exclusively (Bajaj = Chetak + GoGo, nothing else); estimates stay discoverable via unfiltered text search with ⚠ flags. SW shell bumped to v3 so clients receive the new picker.
- **P0 fixed:** silent-expired-subsidy path removed — PM E-DRIVE is date-driven via `packages/engine/src/subsidy.js` (app + API), expiry test-locked, post-subsidy TCO shown, negative countdowns impossible.
- **Verification ladder published:** `docs/VERIFICATION.md` (T0–T5 with receipts); per-row `source_url` + `verified_on` on all 62 curated rows; "real-time" appears nowhere until a feed with an SLA backs it.
- **Dynamic SEO renderer:** every one of the 69,000 sitemap URLs now resolves (static fast-path + on-demand render from one shared template) + A-vs-B `/compare/*` pages + expanded `llms.txt` dossier with worked anchors.
- **Data governance:** SQLite `schema_version` (v3) + append-only `tariffs_history` + `owner_aggregates` (preserved across rebuilds); `refresh-tariffs.py` importer, `subsidy-watch.py` gazette cron, `rollup-owners.py` nightly; 45-day freshness CI gate.
- **API maturity:** request IDs echoed, `X-RateLimit-*` on every response, JSON error envelopes with codes (`UNKNOWN_MODEL`, `RATE_LIMITED`, …), dependency-aware `/health`, version/deprecation policy + SLA in `docs/API.md`.
- **Security:** HSTS default-on (prod), CSP asserted in CI (`security-headers.mjs`), digest-resolve cadence (`infra/DIGESTS.md`), `SECURITY.md` with disclosure contact, `docs/RETENTION.md` (90-day raw cap).
- **Deploy:** staging compose profile, staging SEO-diff gate in CI, post-deploy `ping.js`, public `/status.json`.
- **Observability:** `tools/ops/log-rollup.py` weekly rollup (zero-result → backlog, completions, 4xx/5xx, p95) — no analytics vendor, privacy intact.
- **A11y:** canvas chart data-table fallback, theme-toggle text label, `?lang=` canonical decision, `docs/WCAG.md` pass note.
- **Legal:** jurisdiction-aware loan disclaimer (IN/US/DE-FR wordings), retention statement, API SLA page.
- **QA:** smoke extended (subsidy-expiry, fallback table, disclaimer assertions), 2,500-case fuzz/property suite, perf budget guard unchanged (350KB).

## 2026-10-08 — Material 3 Expressive + Pixel typography (v1.5.0)
- **Typography:** Pixel system stack everywhere (Google Sans on-device + Roboto, M3's own default typeface) — app, SEO pages, methodology pages. Zero webfont downloads; offline + budgets intact.
- **Material 3 Expressive:** M3 tonal color schemes (light + dark, green seed), M3 type scale, 24px expressive cards, pill buttons/stepper, extended-FAB CTA, sticky top app bar, divider-style data tables, state-layer hovers, reduced-motion support. Hand-rolled tokens (full MUI library would break offline/zero-dep).
- **Navigation:** sticky app bar + 3-stage stepper + back/next on every stage; print stays 1-page clean.

## 2026-10-08 — 3-stage tool: inputs → analysis → outputs (v1.4.0)
- **Stage 1 (inputs only):** picker + segment filter, location + tariff + pincode slab, use-case, power-user. Stepper shows 1/2/3; ANALYZE validates a pick first.
- **Stage 2 (analysis & research):** all sub-model deep-dives (A1–A5, B1–B3, C1–C2) with live numbers + sources + competitor callouts. Back-to-inputs + SEE MY OUTPUTS navigation.
- **Stage 3 (outputs only):** hero range, verdict card, breakeven chart, rivals table, battery passport + Y1/Y3/Y5 resale, owner-verified, loan PDF, copy summary. Print CSS hides stages 1–2 so the loan page stays 1-page clean.
- Smoke test extended to full 3-stage click-through (17 assertions, all passing).

## 2026-10-08 — Output-crash fix + UI regression test (v1.3.1)
- **Fixed:** `loanHTML` referenced undefined `t` (params name it `tco`) — every REVEAL click threw `ReferenceError`, killing the loan sheet, owner aggregates, A/B/C deep-dives, telemetry and scroll. Outputs now render end-to-end.
- **Regression guard:** new `tools/qa/app-smoke.mjs` boots the real `app.js` and drives pick → REVEAL with 12 assertions (wired in CI). Engine unit tests can't catch UI-path crashes — this does.

## 2026-10-08 — Deep-dive outputs A/B/C + simpler inputs (v1.3.0)
- **Inputs (still 4, still simple):** picker + new segment filter (2W/3W/4W), location + tariff + optional pincode slab check (slab note rendered, no geocode), use-case sliders, power-user photo/CSV. No VIN, no email wall.
- **Output A:** range deep-dive — normalizer table (÷optimism), load masses, climate (HVAC kW + Michigan −32% / Delhi −18% anchors), speed vs lab anchor, degradation table Y0–Y8 from engine audit fields (additive, tests still 6/6).
- **Output B:** TCO line-by-line — energy split (home/fast kWh + petrol L/yr), subsidy autopilot box per region (PM E-DRIVE countdown, GST 5%, IRA 4-gate $0-conservative, FR/DE/ID/TH/BR/GB explainers from subsidies.json), opex lines, WoodMac 2026 pack-price battery note, verdict row.
- **Output C:** battery passport — SoH trajectory + resale table Y1/Y3/Y5 + chemistry explainer; rivals now a ranked table (real range, price, cost/real-km, why-wins, provenance) with disclosed formula.
- Honesty: tariffs Apr-2026 snapshot + parametric estimates flagged; nothing claimed real-time that isn't.

## 2026-10-08 — Apple design system + themes (v1.2.0)

- **Typography:** SF Pro system stack everywhere (2026 iPhone font) — app, SEO pages, methodology pages, mono blocks use SF Mono stack. Zero webfont downloads (offline + 350KB budget intact).
- **Light/dark toggle:** 🌙/☀️ button top-right, persisted, OS-aware default, no-flash pre-paint, `color-scheme` + dynamic `theme-color`.
- **Color scheme:** Apple-gray light theme (#F5F5F7 / #1D1D1F / #06763D) + refined dark brand theme; tabular numerals, focus rings, reduced-motion support.

## 2026-04-15 — Enterprise SEO + trust release (v1.1.0)
- **Staged rollout enforced:** 62 curated models × 25 geos × 3 intents = 4,650 indexable pages (`sitemap-curated.xml`); 858 estimated-model pages carry per-page `noindex` until owner-verified data enriches them.
- **Rich pages:** every pre-rendered page now ships quotable answer block, rendered tariff/fuel table, interactive-estimate module, BreadcrumbList + FAQ + Vehicle + Product/Offer schema, visible sources + last-reviewed date, 3+ internal links, confidence band, mph for US geos.
- **Sitemaps:** `<lastmod>2026-04-15</lastmod>` on every URL; index + curated index; `robots.txt` + `llms.txt` emitted and served at web root (previously 404 on static server).
- **Canonical:** single app URL `/` — legacy `/apps/web/*` 301-redirects; `<link rel=canonical>` on app + all SEO pages; SEO deep links now `/?model=<id>` (was `/apps/web/#id`).
- **API:** rate limiting (60/min/IP), gzip, Cache-Control + security headers, structured logs, `/openapi.json`, `/api/v1/owner-range` + `/api/v1/events` (anonymous telemetry).
- **PWA:** SW data-cache versioning (stale tariffs auto-purged), honest OCR microcopy, `og-default.svg`, focus states, `file://` error state.
- **i18n scaffolding:** UI chrome in en/hi/id/vi/pt/de + km/mi toggle; `hreflang` + `x-default` on app.
- **Methodology moat:** crawlable `/method/normalizer`, `/method/climate-derate`, `/method/degradation`.
- **CI:** perf budgets (engine ≤25KB, shell ≤60KB, bundle ≤260KB, first load ≤350KB), curated-count assertion (62), sitemap + canonical + no-hardcode checks.

## 2026-04-15 — Data snapshot (generator seed-42)
- Curated: 62 lab-verified rows (OEM PDFs + ARAI/EPA/WLTP certs). Estimated: 858 parametric. Tariffs/fuel: Apr-2026 (25 geos). Subsidies: PM E-DRIVE till 31 Jul 2026.
- Per-model stamp: curated pages show "spec verified Apr-2026"; estimated rows render "±~8% band".

## 2026-10-08 — Enterprise readiness refresh (curated 66 → 78, schema v4)
- Fixed: ` Ampere-nexus` leading-space ID; BMW CE 04 8.9/8.5 usable split; Lucid Air Pure 88 rename; demoted TVS XL concept + Emflux discontinued to estimated-noindex.
- Added curated: Harrier EV 65/75, e Vitara 61, Creta 42, Activa e:, e-Access, Oben Rorr EZ, Matter Aera, Euler HiLoad, Altigreen neEV, Dolphin, Enyaq 77, bZ4X 71.4, EV9 99.8 (PDF + cert_id + price_geo/type per row).
- Tariffs `_meta.affirmed_by/next_due/sla_days` + US-CA TOU + IN-MH slab table; subsidies unified PM E-DRIVE till 2026-07-31 23:59 IST, Rs 0 from 2026-08-01; SSB_PROTO prototype-only with resale=null.
- SEO: fan-out H2s, hreflang set, author/org entity, sitemap-estimated.xml split, AI-crawler whitelist, curated-first 450 static pages.
- App/API: FX from bundle, curated ice_rival/heat-pump/V2G/PDF surfacing, health next_due, robots whitelist.
- Governance: check.py EXPECTED_CURATED=78, schema v4, ID/PDF/cert gates, banned-claim grep, CI estimated-sitemap gate.
