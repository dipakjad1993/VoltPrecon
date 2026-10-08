# VoltPrecon Method — how every number is computed (auditable)

## 1. Spec normalizer: lab → honest baseline
`honestRange = labRange / optimism[cycle]`, `baseWhPerKm = kWh·1000 / honestRange`.
Optimism (from ~1,900 paired lab-vs-telematics points: AVILOO 500k tests, Geotab, Ather/Tata telemetry, EPA docs): **ARAI/IDC 1.30, CLTC 1.25, WLTP 1.12, EPA 1.05**.

## 2. Physics v2 (lab-anchored — see parity fix log)
- `eLab = physics(vLab[cycle], mLab, auxLab) × (1+overhead[cycle])` — vLab: ARAI-2W 32 / 4W 45; WLTP 55; EPA-4W 85; CLTC 48 kph. Overhead ARAI .32 / EPA .34 / WLTP .15 / CLTC .28 (+.08 2W).
- `eReal = physics(v, mReal, HVAC+elec) × (1 − regen·cityFrac)` — regen 2W .12 / 3W .10 / 4W .18; aero calibrated ×0.8 (2W, tucked rider) / ×0.9 (3W).
- `resistance(T,chem)`: cold 1+(10−T)·k (LFP .012 … Na-ion .004); heat 1+(T−33)·.008. HVAC kW modeled separately (PTC 3.2 vs heat-pump 1.1; scooter 0.25–0.3; +0.5 battery chiller >38 °C cars).
- `SoH(t)`: piecewise y1/y3/y5/y8 per chemistry + DCFC penalty (NMC 0.6 %/10pp/yr-ish, LFP 0.15 %).
- Canonical checks: **Pune Ather 195 ARAI → ~97 mixed (pillion, 55 kph, 38 °C)**; **Model Y EPA 531 → ~348 km (216 mi) Michigan −7 °C @120 kph heater** (anecdote 212 mi, confirmed); Delhi Nexon 45 → ~290 km @42 °C.

## 3. True TCO (month 0–84, stable breakeven)
Capex − subsidy + Σ(energy @blended home/DCFC + maint + declining-IDV insurance + tyres + battery reserve + loan interest) vs ICE (fuel + higher maint). Monthly schedule uses the **same yearly components as the totals** (declining insurance included), so monthly and horizon can never disagree. **Breakeven = first month cumulative EV ≤ ICE AND horizon favors EV** — a first-crossing that later reverses (cheap to buy, expensive to run) reports `null`, not a trophy month. Defaults: 2W EV ₹0.30/km vs ICE ₹1.20/km; 4W EV ₹0.90 vs ₹4.20. CO₂: fuel 2.31 kg/L vs grid g/kWh per country.

## 4. Subsidies (auto-expire)
PM E-DRIVE min(₹5k×kWh, cap) for 2W/3W only, valid till 2026-07-31 23:59 IST, Rs 0 from 2026-08-01 with day-countdown. IRA 30D questionnaire (4 gates → $7,500/3,750/0) is API-side; UI shows conservative default. EU/ID/TH applied by localisation flag, default OFF with explainer.

## 5. Battery Passport Lite + resale
SoH = min(calendar-cycle curve, cycle-count curve) − always-full − hot-NMC penalties → band + remaining fast-charges. Resale = segment depreciation (4W y3 58 %, 2W 52 %) × chemistry modifier (LFP 1.06, Na-ion 0.94) × SoH band multiplier.

## 6. Data provenance & refresh
78 curated rows (OEM PDFs + ARAI/EPA/WLTP/IDC certs incl. Oct-2026 Chetak + Harrier/e Vitara/Activa-e refresh, per-row `source_url` + `source_pdf_url` + `cert_id` + `verified_on`) + 842 parametric (seed-42, flagged `estimated`). Refresh cadence: tariffs/fuel monthly importer + 45-day CI freshness gate (`affirmed_on`), subsidies on gazette (engine auto-expires, test-locked), specs on model launch, WoodMac pack prices yearly. Full ladder: `docs/VERIFICATION.md`. Physics locked by 7 unit tests + 2,500-case fuzz/property suite (`packages/engine/tests/`).
