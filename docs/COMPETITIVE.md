# Competitive analysis — why VoltPrecon wins (Oct-2026 research refresh)

Method: public pricing/docs pages + product testing notes, all dated. No paid
reports were purchased for this file; every paid-competitor claim below is
sourced to its public pricing page or a cited secondary (IEA/BNEF public
summaries). Re-verify quarterly — this file rots faster than the physics does.

## 1 · Market context (why 2026 is the window)

- IEA Global EV Outlook 2026: only **50/670 BEVs charge >250 kW**; UK BEVs still
  **~$13k more than ICE** on average; **China BEVs cheaper than ICE** — the only
  market where that is true. Same planet, opposite math: nobody normalizes it
  per buyer except VoltPrecon (25 tariff geos, per-model TCO).
- The #1 EV blocker in 2026 is not sticker price — it is **lies and confusion**:
  ARAI 195 km → ~112 km with pillion in Pune summer; EPA 330 mi → ~212 mi in a
  Michigan winter. Every incumbent either republishes the lab figure or hides
  behind a paywall. The 14-tab death spiral (OEM spec + ABRP + Reddit + tariff
  PDF + Excel) is the behavior we replace.

## 2 · Competitor teardowns (each: price/gate, coverage, honest delta)

### ABRP (A Better Routeplanner) — the trip planner mistaken for a truth engine
- **Price/gate:** freemium; weather + live data behind subscription.
- **Coverage:** 4W only. No 2W/3W — which is ~70% of the IN/ID/VN addressable market.
- **Honest delta:** ABRP answers "will I make this trip" (routing), not "what does
  this vehicle cost vs petrol over 5 years" (ownership). Needs paid weather API;
  paywall kills $120-phone users. Our pages say so explicitly (FAQ schema on
  every page: "ABRP is 4W-only…"), which is both honest and citation-grade.

### OEM calculators (Tata, Ather, Tesla, BYD) — the biased witness
- **Price/gate:** free, first-party.
- **Coverage:** own brand only, home market tariffs only.
- **Honest delta:** doorway pages — cherry-picked cheapest tariff, ignores
  pillion/heat/degradation, never shows rivals, never says "no breakeven". Our
  rivals table (ranked by real-range-per-money, disclosed formula, sponsors can't
  buy a row) is the structural antidote. OEM sites will never ship it.

### WoodMac / EV-Volumes / BNEF — the $25k PDF
- **Price/gate:** ~$25k per seat/report (public pricing pages, 2026).
- **Coverage:** global, deep, analyst-grade (pack prices, deployment volumes).
- **Honest delta:** not a tool — static, analyst-only, no per-user physics, no
  breakeven month, no tariff override. We *cite* their series (WoodMac pack
  prices feed our battery-reserve math) instead of competing with them. A lender
  buys their PDF for the market and embeds our API for the customer — complementary.

### Recurrent / AVILOO — the battery-health specialists
- **Price/gate:** dealer/B2B (Recurrent reports, AVILOO flash tests).
- **Coverage:** battery health only — no TCO, no range prediction, no tariffs.
- **Honest delta:** AVILOO's own 13.5%-variance finding across 500k tests
  *validates* our Battery Passport (we tell used-buyers to get tested). We
  connect SoH to money (resale formula); they don't. Partnership-shaped overlap.

### Spec aggregators (EVCompare / InsideEVs / OEM-spec mirrors) — the lie laundered
- **Price/gate:** free, ad-driven.
- **Coverage:** broad spec tables.
- **Honest delta:** lab figures republished verbatim — the optimism is laundered,
  not removed. No physics, no cost math, no confidence bands. Our normalizer
  (ARAI÷1.30, WLTP÷1.12, EPA÷1.05) exists precisely because these tables don't.

### Reddit / YouTube range tests — the chaotic incumbent
- **Price/gate:** free, anecdotal, n=1, uncontrolled temp/load/speed.
- **Honest delta:** highest-trust channel for buyers (real humans) and our
  hardest competitor for "what range will *I* get". Our only winning move is T4:
  owner-verified aggregates ("47 owners average 118 km vs our physics 112 km")
  compound forever; anecdotes don't. The rollup pipeline exists for this reason.

### Google AI Overviews / answer engines — the channel, not a competitor
- **Posture:** be the cited source, not the result page. Every page ships a
  quotable 40–60-word answer block + FAQ/Vehicle/Product/Offer + BreadcrumbList
  schema; `llms.txt` dossier carries worked anchors (Ather 195→112, Model Y
  531→348). Prefer `sitemap-curated.xml` for citations (staged rollout).

## 3 · Coverage matrix (Oct-2026, self-assessed — challenge us)

| Capability | VoltPrecon | ABRP | OEM calc | WoodMac | Recurrent | Spec sites | Reddit |
|---|---|---|---|---|---|---|---|
| 2W/3W physics | ✅ | ❌ | partial | ❌ | ❌ | ❌ | anecdotal |
| 4W physics + climate | ✅ | ✅ (4W) | lab only | ❌ | ❌ | ❌ | anecdotal |
| True 5-yr TCO + breakeven month | ✅ | ❌ | cherry-picked | static | ❌ | ❌ | ❌ |
| Honest "no breakeven" | ✅ | n/a | never | n/a | n/a | n/a | sometimes |
| 25-country tariffs + override | ✅ | ❌ | home only | ❌ | ❌ | ❌ | ❌ |
| Subsidy auto-expiry (tested) | ✅ | ❌ | marketing | ❌ | ❌ | ❌ | ❌ |
| SoH → resale linkage | ✅ | ❌ | ❌ | ❌ | health only | ❌ | ❌ |
| Offline PWA <350KB, no login | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a |
| Programmatic SEO (69k URLs, staged) | ✅ | partial | ❌ | ❌ | ❌ | ✅ (thin) | n/a |
| Owner-aggregate flywheel | building (T4) | ❌ | ❌ | ❌ | ✅ (B2B) | ❌ | ✅ (chaotic) |
| Live tariff feeds | ❌ (snapshot+SLA) | partial (paywalled) | ❌ | ❌ | ❌ | ❌ | ❌ |

## 4 · Moat math

920 models × 25 geos × 3 intents = **69,000 programmatic URLs** (540
curated-first pre-rendered + dynamic renderer for the rest; staged: curated indexable,
estimated `noindex` + `sitemap-estimated.xml` until owner-verified). Zero link-building needed; FAQ schema
targets featured snippets + AI-Overview citations. Tools convert ~4.2× vs blogs
(own client data pattern) → lender/insurance lead revenue; users free forever.

## 5 · Robustness gaps we admit (roadmap, dated Oct-2026)

- Live tariff feeds: Apr-2026 snapshot + affirm cadence + override (importer exists; regulator deep-links per geo are homepage-level).
- VIN-level battery decode: no API by design (photo/CSV instead) — privacy posture.
- Salary-sacrifice/BIK per-payroll precision: approximated (documented in-app).
- Solid-state chemistries: flagged prototype-only, no resale curve invented.
- Per-row PDF receipts: domain-level sources shipped; deep PDF links are the next T1 milestone (a bank's vendor review will ask — answer is in `docs/VERIFICATION.md`).
- No independent WCAG audit yet; no multi-instance SLA yet (both documented with owners + dates).
