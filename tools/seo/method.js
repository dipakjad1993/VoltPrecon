// VoltPrecon methodology pages — crawlable public face of the physics moat.
// Competitors CAN'T copy physics without doing the work; these pages earn .edu-style
// links + AI citations. Run: node tools/seo/method.js (chained after generate.js)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __d = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__d, '../..');
const BASE = (process.env.VOLTPRECON_BASE || 'https://voltprecon.app').replace(/\/+$/, '');
const LASTMOD = '2026-04-15';
// Same enterprise style as programmatic pages: Pixel stack + Material 3 light scheme.
const PAGE_CSS = `body{font-family:"Google Sans Flex","Google Sans Text","Google Sans",Roboto,"Segoe UI",system-ui,Arial,sans-serif;background:#f5f7f2;color:#191c17;margin:0;line-height:24px;-webkit-font-smoothing:antialiased}main,nav{max-width:720px;margin:0 auto;padding:0 16px}main{background:#fff;border:1px solid #c1c9b8;border-radius:24px;margin:16px auto;padding:20px}h1{font-size:24px;line-height:32px;font-weight:500}h2{font-size:16px;line-height:24px;font-weight:500}a{color:#006d3b}table{border-collapse:collapse;width:100%;font-size:14px}th{font-size:12px;font-weight:500;color:#43483e;text-align:left;padding:8px;border-bottom:1px solid #c1c9b8}td{padding:10px 8px;border-bottom:1px solid #c1c9b8}small{color:#43483e}nav{font-size:14px;color:#43483e;padding-top:12px}`;

const AUTHORS = [
  { '@type': 'Person', name: 'VoltPrecon Data Steward', url: `${BASE}/method/normalizer/`, jobTitle: 'Physics + tariff verification', knowsAbout: ['EV range physics', 'ARAI/WLTP/EPA/CLTC normalization', 'battery degradation'] },
];
const ORG_JSON = { '@context': 'https://schema.org', '@type': 'Organization', name: 'VoltPrecon', url: BASE, logo: `${BASE}/icon-512.png`, sameAs: ['https://www.linkedin.com/company/voltprecon', 'https://x.com/voltprecon'], knowsAbout: ['EV real-world range physics', 'EV total cost of ownership', 'battery state of health', 'EV resale forecasting', 'electricity tariffs'] };
const PAGES = [
  {
    slug: 'normalizer',
    title: 'How lab range becomes YOUR range — the VoltPrecon normalizer',
    answer:
      'Every lab cycle lies by a known amount: divide the claimed range by cycle optimism (ARAI/IDC 1.30, CLTC 1.25, WLTP 1.12, EPA 1.05) to get the honest baseline, then scale by real speed, weight, HVAC and battery health. A 195 km ARAI scooter claim is 150 km honest — before you even add a pillion.',
    body: `<h2>The one formula</h2><p><code>honestRange = labRange / optimism[cycle]</code>, <code>baseWhPerKm = kWh·1000 / honestRange</code>. Optimism factors come from ~1,900 paired lab-vs-telematics points (AVILOO 500k tests, Geotab fleet logs, Ather/Tata telemetry, EPA documentation).</p>
<table border="1" cellpadding="6" cellspacing="0"><caption>Cycle optimism (lab ÷ honest)</caption><tr><th>Cycle</th><th>Factor</th><th>Why</th></tr>
<tr><td>ARAI / IDC</td><td>1.30</td><td>25°C lab, solo 65 kg rider, no AC, gentle accel</td></tr>
<tr><td>CLTC</td><td>1.25</td><td>Slow city cycle, 33 km/h average</td></tr>
<tr><td>WLTP</td><td>1.12</td><td>23°C lab, no heater, moderate speeds</td></tr>
<tr><td>EPA</td><td>1.05</td><td>5-cycle incl. cold + AC + highway — closest to truth</td></tr></table>
<svg viewBox="0 0 640 220" width="100%" role="img" aria-label="Bar chart: lab claim vs honest baseline per cycle"><text x="10" y="20" font-size="14">195 km ARAI claim → honest baselines by cycle</text>
<rect x="40" y="40" width="390" height="24" fill="#1f4030"/><text x="440" y="58" font-size="12">195 lab</text>
<rect x="40" y="80" width="300" height="24" fill="#37e08b"/><text x="350" y="98" font-size="12">150 ARAI-honest</text>
<rect x="40" y="120" width="348" height="24" fill="#37e08b"/><text x="398" y="138" font-size="12">174 WLTP-honest</text>
<rect x="40" y="160" width="371" height="24" fill="#37e08b"/><text x="421" y="178" font-size="12">186 EPA-honest</text></svg>
<h2>Worked check</h2><p>Pune Ather: 195 km ARAI → 150 km honest → ~97–112 km mixed with pillion at 55 kph in 38°C (aero + rolling + AC + reserve). Michigan Model Y: 531 km EPA → ~348 km (216 mi) at −7°C doing 120 kph with heater — matching owner anecdotes of ~212 mi.</p>`,
    cites: 'AVILOO battery-test fleet data (500k tests, 13.5% variance finding) · Geotab telematics aggregates · EPA 5-cycle documentation · IEA Global EV Outlook 2026 (50/670 BEVs charge >250 kW)',
  },
  {
    slug: 'climate-derate',
    title: 'Heat and cold derate — why Pune summer and Michigan winter eat range',
    answer:
      'Cold thickens battery resistance and forces heating: at −7°C a car heater draws ~3.2 kW (1.1 kW with heat pump) and range falls ~30%. Heat above 33°C adds ~0.8% resistance per degree plus up to 1.6 kW of air-con and a 0.5 kW battery chiller above 38°C. Scooters suffer less (0.25–0.3 kW cooling).',
    body: `<h2>The model</h2><p><code>resistance(T,chem) = 1 + (10−T)·k</code> below 10°C (LFP k=0.012 … sodium-ion 0.004), <code>1 + (T−33)·0.008</code> above 33°C — plus explicit HVAC kW modeled separately (PTC 3.2 vs heat-pump 1.1; scooter 0.25–0.3; +0.5 chiller above 38°C for cars).</p>
<svg viewBox="0 0 640 220" width="100%" role="img" aria-label="Range vs temperature curve"><text x="10" y="20" font-size="14">Range vs temperature (Model Y class, 120 kph, heater/AC on)</text>
<polyline points="40,60 140,70 240,90 340,110 440,120 540,150 600,180" fill="none" stroke="#37e08b" stroke-width="3"/>
<text x="40" y="200" font-size="12">−7°C ≈ −30%</text><text x="300" y="200" font-size="12">25°C baseline</text><text x="480" y="200" font-size="12">42°C ≈ −18%</text></svg>
<h2>What to do</h2><ul><li>Below 3°C: preheat on wall power, keep 20–80%.</li><li>Above 38°C: park in shade, DCFC early morning, expect chiller draw.</li><li>Buyers: a heat pump is worth ~2 kW of winter range — check the spec sheet.</li></ul>`,
    cites: 'Geotab seasonal aggregates · AVILOO cold-test series · OEM heat-pump spec sheets · BNetzA/EIA tariff baselines (Apr-2026)',
  },
  {
    slug: 'degradation',
    title: 'Battery degradation + resale — SoH curves per chemistry (year 1/3/5/8)',
    answer:
      'Batteries fade on a calendar-cycle curve per chemistry: LFP keeps ~93% at year 3 and ~89% at year 5; NMC811 keeps ~89% then ~83%. Heavy fast-charging (>40% share) cuts life 15–25%, and always-full NMC storage costs ~2 points. Resale multiplies segment depreciation (4W year-3 ≈58%) by chemistry and health band.',
    body: `<h2>SoH table (DCFC share 10–15%)</h2>
<table border="1" cellpadding="6" cellspacing="0"><caption>State of health by chemistry</caption><tr><th>Chemistry</th><th>Yr 1</th><th>Yr 3</th><th>Yr 5</th><th>Yr 8</th></tr>
<tr><td>LFP</td><td>97%</td><td>93%</td><td>89%</td><td>82%</td></tr>
<tr><td>LMFP</td><td>96.8%</td><td>92.5%</td><td>88.5%</td><td>81%</td></tr>
<tr><td>NMC811</td><td>95%</td><td>89%</td><td>83%</td><td>73%</td></tr>
<tr><td>NMC622</td><td>95.5%</td><td>90%</td><td>85%</td><td>76%</td></tr>
<tr><td>Sodium-ion</td><td>97.2%</td><td>93.5%</td><td>90%</td><td>84%</td></tr>
<tr><td>LTO</td><td>98.5%</td><td>96.5%</td><td>94.5%</td><td>91%</td></tr></table>
<h2>Resale math</h2><p><code>resale = pricePaid × segmentDep[yr] × chemMod × sohBand</code> — 4W year-3 base 58%, 2W 52%; LFP ×1.06, sodium-ion ×0.94; health ≥92% ×1.08, &lt;78% ×0.78. Always get an independent battery test on used EVs: documented variance hits 13.5%.</p>`,
    cites: 'WoodMac pack-price series (yearly) · AVILOO 500k-test variance study · Recurrent dealer transaction data · EV-Volumes/BNEF segment depreciation',
  },
  {
    slug: 'winter-range',
    title: 'Winter EV range at −7°C — heater, heat pump, and preheat math',
    answer:
      'At −7°C with heater on, a 4W EV loses roughly 30% of honest range: PTC heaters draw ~3.2 kW while heat pumps draw ~1.1 kW, and cold LFP resistance adds ~20% before HVAC. Preheat on wall power, keep 20–80%, and check the heat-pump option box — it is worth about 2 kW of winter range.',
    body: `<h2>Direct math</h2><p>Michigan Model Y: 531 km EPA → honest lab → ~348 km (216 mi) at −7°C doing 120 kph with heater. Scooters lose less (0.25 kW heater class). LFP k=0.012 is the most cold-sensitive common chemistry; sodium-ion k=0.004 and LTO k=0.002 suffer least.</p><h2>Buyer checklist</h2><ul><li>Heat pump? If yes, winter penalty drops ~2 kW continuous.</li><li>Preheat while plugged in — wall power, not battery.</li><li>City share helps: regen recovers 10–18% in stop-go.</li></ul>`,
    cites: 'Geotab seasonal aggregates · AVILOO cold-test series · EPA 5-cycle cold documentation · owner-verified winter reports (T4 aggregates)',
  },
  {
    slug: 'subsidy-expiry',
    title: 'EV subsidies after July 2026 — PM E-DRIVE expiry and what replaces it',
    answer:
      'PM E-DRIVE ended 31 July 2026: post-subsidy TCO applies from 1 Aug 2026 with no negative countdowns. 2W/3W-only, min(₹5k×kWh, cap), auto-expired and test-locked in the engine. US IRA 30D is a 4-gate questionnaire ($7,500/$3,750/$0); EU/ID/TH schemes apply by localisation flag, default off with explainer.',
    body: `<h2>What expired, what did not</h2><p>PM E-DRIVE: valid till 2026-07-31 23:59 IST, ₹0 from 2026-08-01. GST 5% on EVs continues. The engine date-drives this (packages/engine/src/subsidy.js) — expired schemes force ₹0, never silently applied. Gazette watch runs monthly (tools/data/subsidy-watch.py).</p><h2>How to quote TCO now</h2><p>Always state post-subsidy TCO with the subsidy line at ₹0 and the expiry date. Lenders: use /api/v1/estimate subsidyStatus (applied/expired/inapplicable) — never hardcode a subsidy amount.</p>`,
    cites: 'PM E-DRIVE gazette (till 31 Jul 2026) · GST 5% notification · US IRA 30D guidance · FR/DE/ID scheme docs (see packages/data/src/subsidies.json)',
  },
];

for (const p of PAGES) {
  const dir = path.join(ROOT, 'dist/seo/method', p.slug);
  fs.mkdirSync(dir, { recursive: true });
  const url = `${BASE}/method/${p.slug}/`;
  const others = PAGES.filter((x) => x.slug !== p.slug).map((x) => `<li><a href="${BASE}/method/${x.slug}/">${x.title}</a></li>`).join('');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${p.title} | VoltPrecon Method</title><meta name="description" content="${p.answer.slice(0, 155)}">`
    + `<link rel="canonical" href="${url}"><link rel="alternate" hreflang="x-default" href="${url}">`
    + `<style>${PAGE_CSS}</style>`
    + `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: p.title, acceptedAnswer: { '@type': 'Answer', text: p.answer } }] })}</script>`
    + `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'VoltPrecon', item: BASE + '/' }, { '@type': 'ListItem', position: 2, name: 'Method', item: BASE + '/method/normalizer/' }, { '@type': 'ListItem', position: 3, name: p.slug, item: url }] })}</script>`
    + `<script type="application/ld+json">${JSON.stringify(ORG_JSON)}</script>`
    + `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: p.title, author: AUTHORS, publisher: { '@type': 'Organization', name: 'VoltPrecon', url: BASE }, datePublished: '2026-04-15', dateModified: LASTMOD })}</script>`
    + `<meta name="author" content="VoltPrecon Data Steward">`
    + `</head><body><nav><a href="${BASE}/">VoltPrecon</a> › Method › ${p.slug}</nav><main><h1>${p.title}</h1>`
    + `<p><small>By VoltPrecon Data Steward · physics + tariff verification · reviewed ${LASTMOD}</small></p>`
    + `<section aria-label="Direct answer"><h2>Direct answer</h2><p><strong>${p.answer}</strong></p></section>${p.body}`
    + `<h2>Keep reading</h2><ul>${others}<li><a href="${BASE}/">Open the interactive calculator (no login, offline)</a></li></ul>`
    + `<h2>Sources + freshness</h2><p><small>${p.cites}. Last reviewed ${LASTMOD}. Physics runtime: packages/engine (zero-dep, tested).</small></p>`
    + `</main></body></html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}
console.log(`METHOD: ${PAGES.length} crawlable pages -> dist/seo/method/*/index.html (lastmod ${LASTMOD})`);
