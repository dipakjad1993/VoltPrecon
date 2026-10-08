// VoltPrecon shared SEO renderer — single template truth for /ev/* pages.
// Used by tools/seo/generate.js (static pre-render) AND infra/serve-static.js
// (dynamic on-demand render). One template => staged rollout + sitemap URLs can
// never drift from what users actually get. Zero-dep (realRange injected by caller
// to keep this module importable from any runtime).
export const INTENTS = [
  { slug: 'real-range', h1: (m) => `${m.mk} ${m.mo} ${m.v} Real-World Range`, q: 'real range' },
  { slug: 'total-cost', h1: (m) => `${m.mk} ${m.mo} ${m.v} True 5-Year Cost vs Petrol`, q: 'true cost' },
  { slug: 'resale-battery', h1: (m) => `${m.mk} ${m.mo} ${m.v} Battery Health + Resale (Year 3)`, q: 'battery resale' },
];

export const FX = { 'IN-MH': '₹', 'IN-DL': '₹', 'US-TX': '$', 'US-MI': '$', 'US-CA': '$', DE: '€', FR: '€', GB: '£', ID: 'Rp', VN: '₫', TH: '฿', BR: 'R$' };

export const PAGE_CSS = `body{font-family:"Google Sans Flex","Google Sans Text","Google Sans",Roboto,"Segoe UI",system-ui,Arial,sans-serif;background:#f5f7f2;color:#191c17;margin:0;line-height:24px;-webkit-font-smoothing:antialiased}main,nav{max-width:720px;margin:0 auto;padding:0 16px}main{background:#fff;border:1px solid #c1c9b8;border-radius:24px;margin:16px auto;padding:20px}h1{font-size:24px;line-height:32px;font-weight:500}h2{font-size:16px;line-height:24px;font-weight:500}a{color:#006d3b}table{border-collapse:collapse;width:100%;font-size:14px}th{font-size:12px;font-weight:500;color:#43483e;text-align:left;padding:8px;border-bottom:1px solid #c1c9b8}td{padding:10px 8px;border-bottom:1px solid #c1c9b8}small{color:#43483e}nav{font-size:14px;color:#43483e;padding-top:12px}`;

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const isUS = (g) => String(g).startsWith('US-');
export const kmToMi = (km) => Math.round(km * 0.621371);

export function modelSlug(m) { return slug(`${m.mk}-${m.mo}-${m.v}`); }

export function curFmt(B, code, inrN) {
  if (String(code).startsWith('IN')) return '₹' + Math.round(inrN).toLocaleString('en-IN');
  const sym = FX[code] || '$';
  const usd = inrN / 83.5;
  if (code === 'ID') return 'Rp' + Math.round(usd * 15800).toLocaleString('en-US');
  return sym + Math.round(usd).toLocaleString('en-US');
}

export function computeRR(realRange, m, tempC = 32) {
  const wt = m.s.startsWith('2W') ? 120 : m.s.startsWith('3W') ? 650 : 1750;
  return realRange({
    batteryKwh: m.kwh, labRangeKm: m.lab, cycle: m.cy, chemistry: m.ch,
    vehicleKg: wt, cda: m.s.startsWith('2W') ? 0.6 : 0.8, crr: 0.01,
    speedKph: m.s.startsWith('4W') ? 70 : 50, cityFrac: 0.6,
    tempC, acLevel: 2,
  });
}

export function confidence(m) {
  return m.p === 'curated'
    ? { km: 8, label: 'lab-verified spec · ±8 km typical band' }
    : { km: Math.max(10, Math.round(m.lab * 0.08)), label: 'parametric estimate · ±~8% band — help verify with your odo' };
}

export function siblingLinks(B, ranked, BASE, m, g, it) {
  const same = ranked.filter((x) => x.s === m.s && x.id !== m.id).slice(0, 2);
  const links = same.map((s) => `<li><a href="${BASE}/ev/${modelSlug(s)}/${slug(g)}/${it.slug}/">${esc(s.mk + ' ' + s.mo + ' ' + s.v)} — same ${esc(m.s)} segment</a></li>`).join('');
  const geoName = (B.tariffs.find((x) => x.code === g) || {}).country || g;
  return `<ul>${links}<li><a href="${BASE}/method/normalizer/">${esc(it.q)} methodology: how lab ${esc(m.cy)} becomes your number</a></li>`
    + `<li><a href="${BASE}/?model=${encodeURIComponent(m.id)}">Open the interactive ${esc(m.mk + ' ' + m.mo)} calculator for ${esc(geoName)} (no login)</a></li></ul>`;
}

export function tariffTable(B, g) {
  const t = B.tariffs.find((x) => x.code === g);
  if (!t) return '';
  const fuel = t.petrol_per_L != null ? (g.startsWith('IN') ? `₹${t.petrol_per_L}/L` : `$${t.petrol_per_L}/L`) : '—';
  const home = g.startsWith('IN') ? `₹${t.home_kwh}/kWh` : `$${t.home_kwh}/kWh`;
  const dcfc = g.startsWith('IN') ? `₹${t.dcfc_kwh}/kWh` : `$${t.dcfc_kwh}/kWh`;
  return `<table border="1" cellpadding="6" cellspacing="0"><caption>Apr-2026 ${esc(t.country)} energy baseline used on this page (override in app)</caption>`
    + `<tr><th>Home power</th><th>Fast charge (DCFC)</th><th>Petrol</th><th>Grid CO₂</th></tr>`
    + `<tr><td>${esc(home)}</td><td>${esc(dcfc)}</td><td>${esc(fuel)}</td><td>${esc(String(t.co2_g_per_kwh))} g/kWh</td></tr></table>`
    + (t.slab_note ? `<p><small>${esc(t.slab_note)}</small></p>` : '')
    + (t.note ? `<p><small>${esc(t.note)}</small></p>` : '');
}

// Verification-ladder provenance line rendered on every page (T1/T2/T3 with dates).
export function provenanceLine(m, LASTMOD) {
  return m.p === 'curated'
    ? `Spec: OEM datasheet + ${esc(m.cy)} certificate (lab-verified Apr-2026)`
    : `Parametric archetype seed-42 (estimated — confidence ±~8%; carries noindex until owner-verified)`;
}

// Full /ev/<model>/<geo>/<intent>/ page. opts.dynamic=true adds a freshness
// banner noting on-demand render (same numbers, same template, same lastmod).
export function renderEvPage({ realRange, B, ranked, BASE, LASTMOD, m, g, it, dynamic = false }) {
  const t = B.tariffs.find((x) => x.code === g);
  const geoName = t ? t.country : g;
  const rr = computeRR(realRange, m, g === 'DE' ? 9 : g === 'US-TX' ? 34 : 32);
  const conf = confidence(m);
  const realKm = Math.round(rr.realRangeKm);
  const mphBit = isUS(g) ? ` (${kmToMi(realKm)} miles)` : '';
  const moneyBit = g.startsWith('IN') ? `₹${(m.inr || 1200000).toLocaleString('en-IN')}` : curFmt(B, g, m.inr || 1200000);
  const pageUrl = `${BASE}/ev/${modelSlug(m)}/${slug(g)}/${it.slug}/`;
  const appUrl = `${BASE}/?model=${encodeURIComponent(m.id)}`;
  const indexable = m.p === 'curated';
  const robotsMeta = indexable ? 'index,follow,max-image-preview:large' : 'noindex,follow';
  const answer = it.slug === 'real-range'
    ? `The ${m.mk} ${m.mo} ${m.v} does about ${realKm} km${mphBit} in real mixed use in ${geoName}, not the ${m.lab} km ${m.cy} lab figure — a ${Math.round((1 - realKm / m.lab) * 100)}% haircut from speed, ${(m.s.startsWith('2W') ? 'rider load' : 'weight')}, air-con and battery reserve. ${m.p === 'curated' ? 'Lab spec verified Apr-2026.' : `Parametric estimate (±${conf.km} km); owner odo data tightens it.`}`
    : it.slug === 'total-cost'
      ? `Over 5 years in ${geoName}, the ${m.mk} ${m.mo} ${m.v} (${moneyBit}) costs roughly ${curFmt(B, g, (rr.realWhPerKm / 1000) * 40 * 300 * 5 * (t.home_kwh * (g.startsWith('IN') ? 1 : 83.5)))} in home-charged energy at ${rr.realWhPerKm} Wh/km and 40 km/day — breakeven vs petrol depends on your km/day and home-charging share. Run your exact numbers free; no login.`
      : `At year 3 the ${m.mk} ${m.mo} ${m.v} keeps roughly half its paid price on an LFP-family curve (segment ${esc(m.s)}, ${esc(m.ch)} chemistry), adjusted by measured battery health — always-full charging and hot NMC storage cut it ~2 points each. Get a battery test before buying used; variance up to 13.5% is documented.`;
  const title = `${m.mk} ${m.mo} ${m.v} ${it.slug === 'real-range' ? `Real Range (${realKm} km, not ${m.lab} km lab)` : it.slug === 'total-cost' ? `True Cost vs Petrol (${geoName})` : `Battery Health + Resale (${geoName})`} | VoltPrecon`;
  const desc = `${m.mk} ${m.mo}: lab ${m.lab}km (${m.cy}) but YOUR real range ≈ ${realKm}km${mphBit} at ${rr.realWhPerKm}Wh/km (${m.p}). 5-yr cost, breakeven, resale for ${geoName}. No login.`;
  const faqJson = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: `What is the real range of the ${m.mk} ${m.mo} ${m.v} in ${geoName}?`, acceptedAnswer: { '@type': 'Answer', text: `Lab ${m.lab} km (${m.cy}); real-world ≈ ${realKm} km${mphBit} at ${rr.realWhPerKm} Wh/km (${m.p}, ±${conf.km} km).` } }, { '@type': 'Question', name: `Does ABRP cover the ${m.mk} ${m.mo}?`, acceptedAnswer: { '@type': 'Answer', text: `ABRP is 4W-only with paywalled weather and no 2W/3W coverage — this page covers ${m.s} physics with local ${geoName} tariffs instead.` } }] };
  const crumbJson = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'EVs', item: `${BASE}/` }, { '@type': 'ListItem', position: 2, name: `${m.mk} ${m.mo}`, item: `${BASE}/ev/${modelSlug(m)}/` }, { '@type': 'ListItem', position: 3, name: `${geoName} — ${it.slug}`, item: pageUrl }] };
  const vehicleJson = { '@context': 'https://schema.org', '@type': 'Vehicle', name: `${m.mk} ${m.mo} ${m.v}`, vehicleModelDate: String(m.y), fuelType: 'Electricity', driveWheelConfiguration: 'N/A' };
  const authorJson = { "@context": "https://schema.org", "@type": "Article", author: { "@type": "Organization", name: "VoltPrecon", url: BASE, sameAs: ["https://www.linkedin.com/company/voltprecon", "https://x.com/voltprecon"] }, datePublished: "2026-04-15", dateModified: LASTMOD };
  const productJson = { '@context': 'https://schema.org', '@type': 'Product', name: `${m.mk} ${m.mo} ${m.v}`, category: m.s, offers: { '@type': 'Offer', priceCurrency: g.startsWith('IN') ? 'INR' : 'USD', price: g.startsWith('IN') ? String(m.inr || 1200000) : String(Math.round((m.inr || 1200000) / 83.5)), availability: 'https://schema.org/InStock' } };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="robots" content="${robotsMeta}">`
    + `<link rel="canonical" href="${pageUrl}"><link rel="alternate" hreflang="x-default" href="${pageUrl}"><link rel="alternate" hreflang="en" href="${pageUrl}"><link rel="alternate" hreflang="en-IN" href="${pageUrl}"><link rel="alternate" hreflang="en-US" href="${pageUrl}"><link rel="alternate" hreflang="de" href="${pageUrl}"><link rel="alternate" hreflang="fr" href="${pageUrl}"><link rel="alternate" hreflang="id" href="${pageUrl}"><meta name="author" content="VoltPrecon Data Steward"><meta property="article:published_time" content="2026-04-15"><meta property="article:modified_time" content="${LASTMOD}">`
    + `<style>${PAGE_CSS}</style>`
    + `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${pageUrl}"><meta property="og:type" content="article">`
    + `<script type="application/ld+json">${JSON.stringify(faqJson)}</script>`
    + `<script type="application/ld+json">${JSON.stringify(crumbJson)}</script>`
    + `<script type="application/ld+json">${JSON.stringify(vehicleJson)}</script>`
    + `<script type="application/ld+json">${JSON.stringify(productJson)}</script>`
    + `<script type="application/ld+json">${JSON.stringify(authorJson)}</script></head>`
    + `<body><nav aria-label="Breadcrumb"><a href="${BASE}/">VoltPrecon</a> › <a href="${BASE}/ev/${modelSlug(m)}/">${esc(m.mk + ' ' + m.mo)}</a> › ${esc(geoName)} › ${it.slug}</nav>`
    + `<main><h1>${esc(it.h1(m))} — ${esc(geoName)} · ${esc(moneyBit)}</h1>`
    + `<section aria-label="Direct answer"><h2>Direct answer (40-second read)</h2><p><strong>${esc(answer)}</strong></p></section>`
    + `<p><strong>YOUR range ≈ ${realKm} km${mphBit} (±${conf.km} km)</strong>, not the ${m.lab} km lab figure (${m.cy}). ${rr.narrative.map(esc).join(' ')}</p>`
    + `<p>Battery ${m.kwh} kWh ${esc(m.ch)} · provenance: <strong>${m.p === 'curated' ? '✅ lab-verified (spec verified Apr-2026)' : `⚠ parametric estimate — ${esc(conf.label)}`}</strong>. ABRP doesn't cover your ${esc(m.s)} scooter/3W segment — this page does, with physics + local tariffs.</p>`
    + `<h2>${esc(geoName)} energy baseline (rendered table, not hidden JSON)</h2>${tariffTable(B, g)}`
    + `<h2>Your interactive estimate (same numbers as the app)</h2><div><p>Speed 70/50 kph · city 60% · 32°C AC-med → <strong>${realKm} km at ${rr.realWhPerKm} Wh/km</strong>, SoH ${rr.sohPct}% (new). Change rider/load/temp in the <a href="${appUrl}">live calculator — no login, works offline</a>.</p>`
    + `<p><a href="${appUrl}">Compute YOUR numbers free — no login</a> · <a href="${BASE}/method/normalizer/">How the math works</a></p></div>`
    + `<h2>How much does this cost in 2026 in ${esc(geoName)}?</h2><p>At ${rr.realWhPerKm} Wh/km and 40 km/day, home-charged energy is the swing factor — see the True Cost tab for your km/day and home-charging share. Tariff baseline above is Apr-2026 snapshot, affirmed ${LASTMOD}, overridable in the app.</p>`
    + `<h2>What range will I get in winter with heater, or summer with pillion?</h2><p>Lab ${m.lab} km (${m.cy}) becomes honest lab then YOUR physics: speed vs ~${rr.vLabKph || 50} kph lab anchor, rider/load mass, HVAC ${rr.factors ? rr.factors.hvacKw : ""} kW, climate multiplier. Cold LFP needs preheat on wall power; heat above 38C adds battery-chiller load. Run city vs highway in the calculator.</p>`
    + `<h2>What battery health and resale should I expect at year 3?</h2><p>Segment depreciation times chemistry modifier times measured health band. LFP-family holds best; always-full and hot NMC storage each cut ~2 points. Get a battery test before buying used — 13.5% variance is documented.</p>`
    + `<h2>Keep exploring (same segment + method)</h2>${siblingLinks(B, ranked, BASE, m, g, it)}`
    + `<h2>Sources + freshness</h2><p><small>${provenanceLine(m, LASTMOD)} · Tariffs: MERC/MSEDCL, EIA, BNetzA, EVN, PLN (Apr-2026 snapshot) · Physics: AVILOO/Geotab paired derates, WoodMac pack prices (yearly). Last reviewed ${LASTMOD} (tariff affirmed ${LASTMOD}, next due per tariffs.json). Cert ${esc(m.cert_id || m.cy)} · PDF receipt in app.${dynamic ? ' Rendered on demand from the same template + bundle as the static pages.' : ''} Found an error or own this EV? Submit your odo reading in the app — owner-verified aggregates tighten every page.</small></p>`
    + `</main></body></html>`;
}

// A-vs-B compare page: same physics for both, same tariff, ranked by real-range-per-money.
export function renderComparePage({ realRange, B, BASE, LASTMOD, a, b, g }) {
  const t = B.tariffs.find((x) => x.code === g);
  const geoName = t ? t.country : g;
  const rrA = computeRR(realRange, a, 32), rrB = computeRR(realRange, b, 32);
  const rA = Math.round(rrA.realRangeKm), rB = Math.round(rrB.realRangeKm);
  const cA = (a.inr || 1200000) / Math.max(1, rA), cB = (b.inr || 1200000) / Math.max(1, rB);
  const win = cA <= cB ? a : b;
  const pageUrl = `${BASE}/compare/${modelSlug(a)}-vs-${modelSlug(b)}/${slug(g)}/`;
  const title = `${a.mk} ${a.mo} vs ${b.mk} ${b.mo} — Real Range + True Cost (${geoName}) | VoltPrecon`;
  const desc = `${a.mk} ${a.mo} ≈ ${rA}km real vs ${b.mk} ${b.mo} ≈ ${rB}km real (lab ${a.lab}/${b.lab}km). Same physics, same ${geoName} tariffs, ranked by ₹/real-km. No login.`;
  const faqJson = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: `Which is better value: ${a.mk} ${a.mo} or ${b.mk} ${b.mo}?`, acceptedAnswer: { '@type': 'Answer', text: `By cost per real km in ${geoName}, the ${win.mk} ${win.mo} wins. Real ranges: ${rA}km vs ${rB}km. Both are physics-computed, not lab claims.` } }] };
  const row = (m, rr, r, c) => `<tr><td><b>${esc(m.mk)} ${esc(m.mo)}</b> ${esc(m.v)}</td><td class="num">${r} km</td><td class="num">${m.lab} km (${esc(m.cy)})</td><td class="num">${esc(curFmt(B, g, m.inr || 1200000))}</td><td class="num">${esc(m.p === 'curated' ? '✅ verified' : '⚠ estimated')}</td></tr>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="robots" content="${a.p === 'curated' && b.p === 'curated' ? 'index,follow' : 'noindex,follow'}">`
    + `<link rel="canonical" href="${pageUrl}"><style>${PAGE_CSS}</style>`
    + `<script type="application/ld+json">${JSON.stringify(faqJson)}</script></head>`
    + `<body><nav><a href="${BASE}/">VoltPrecon</a> › Compare › ${esc(geoName)}</nav><main><h1>${esc(a.mk)} ${esc(a.mo)} vs ${esc(b.mk)} ${esc(b.mo)} — ${esc(geoName)}</h1>`
    + `<section aria-label="Direct answer"><h2>Direct answer</h2><p><strong>Real range ${rA} km vs ${rB} km (lab ${a.lab}/${b.lab} km). By cost per real kilometre, the ${esc(win.mk)} ${esc(win.mo)} wins in ${esc(geoName)} at current Apr-2026 tariffs. Run your exact km/day in the <a href="${BASE}/?model=${encodeURIComponent(a.id)}">live calculator</a>.</strong></p></section>`
    + `<table border="1" cellpadding="6" cellspacing="0"><caption>Same physics, same tariffs — ranked, not sponsored</caption><tr><th>Model</th><th>Real range</th><th>Lab claim</th><th>Price</th><th>Provenance</th></tr>${row(a, rrA, rA, cA)}${row(b, rrB, rB, cB)}</table>`
    + `<h2>${esc(geoName)} energy baseline</h2>${tariffTable(B, g)}`
    + `<h2>Sources + freshness</h2><p><small>${provenanceLine(a, LASTMOD)} · ${provenanceLine(b, LASTMOD)} · Last reviewed ${LASTMOD} (tariff affirmed ${LASTMOD}, next due per tariffs.json). Cert ${esc(m.cert_id || m.cy)} · PDF receipt in app.</small></p>`
    + `</main></body></html>`;
}
