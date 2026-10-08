/* VoltPrecon deep renderers — LAZY module, loaded on ANALYZE (stage-2 entry) only.
   This keeps the first-load shell under the 60KB budget (see tools/perf/budget.js).
   ctx = { $, fmtDist, DB, curSym, picked }. Engine bits imported directly.
   Zero framework, zero deps beyond the engine. */
import { realRange, sohFor } from '../../packages/engine/src/physics.js';
import { OPTIMISM } from '../../packages/engine/src/normalizer.js';
import { estimateSoh, resaleForecast } from '../../packages/engine/src/resale_soh.js';

// Re-run the SAME engine with one input varied — every sensitivity cell below is
// computed live for this exact vehicle, never copied from a static sheet.
function rrRun(base, over) {
  try {
    const r = realRange({ ...base, ...over });
    return Number.isFinite(r.realRangeKm) && r.realRangeKm > 0 ? r : null;
  } catch { return null; }
}
const CHEM_COLS = ['LFP', 'LMFP', 'NMC622', 'NMC811', 'NA_ION', 'LTO'];

export const CHEM_TXT = { LFP: 'LFP — heat-proof workhorse. Daily fast-charge OK. Best for delivery + hot cities.', NMC811: 'NMC — max range, needs care: 80% daily cap, cool parking, DCFC on trips only.', NMC622: 'NMC 622 — older balanced cell. Fine used if health >88%.', LMFP: 'LMFP — 2026 sweet spot: LFP life + near-NMC range. Get chemistry in writing.', NA_ION: 'Sodium-ion — cheapest + toughest in cold/heat. Slightly less range; resale discounted = negotiate.', LTO: 'LTO — outlives the chassis (bus/3W). Too heavy for cars.' };

/* ================= A · Physics deep-dive (5 sub-models, same numbers as hero) ================= */
export function renderRangeDeep(ctx, { rr, rrInput, cityFrac }) {
  const { $, fmtDist, picked } = ctx;
  const d = (km) => { const f = fmtDist(km); return `${f.v} ${f.u}`; };
  const opt = OPTIMISM[picked.cycle] ?? 1.15;
  const dcfc = (+$('dcfc').value || 0) / 100;
  const soh0 = sohFor(picked.chemistry, 0, dcfc) || 1;
  const degRows = [0, 1, 3, 5, 8].map((a) => {
    const s = sohFor(picked.chemistry, a, dcfc);
    return `<tr><td>Year ${a}</td><td class="num">${(s * 100).toFixed(1)}%</td><td class="num">${d(rr.realRangeKm * s / soh0)}</td></tr>`;
  }).join('');
  const massDelta = rr.massRealKg - rr.massLabKg;
  // A1-extra: the SAME pack under every test cycle — who inflates most, computed.
  const honest = rr.honestLabKm;
  const cycRows = ['ARAI', 'WLTP', 'EPA', 'CLTC', 'IDC'].map((c) => {
    const o = OPTIMISM[c] ?? 1.15;
    const you = c === picked.cycle ? ' (you)' : '';
    return `<tr><td>${c}${you}</td><td class="num">÷${o.toFixed(2)}</td><td class="num">${Math.round(honest * o)} km</td><td class="num">+${Math.round((o - 1) * 100)}%</td></tr>`;
  }).join('');
  // A2-extra: load sensitivity — same engine, varied humans/cargo.
  const baseRider = rrInput.riderKg ?? 75;
  const loadScen = [
    ['Solo, 65 kg rider', { riderKg: 65, pillionKg: 0, cargoKg: 0 }],
    ['Your setup now', null],
    ['Heavier 85 kg rider', { riderKg: 85, pillionKg: 0, cargoKg: 0 }],
    ['+ 60 kg pillion', { riderKg: baseRider, pillionKg: 60, cargoKg: 0 }],
    ['+ 30 kg delivery cargo', { riderKg: baseRider, pillionKg: 0, cargoKg: 30 }],
  ];
  const loadRows = loadScen.map(([label, over]) => {
    const r = over ? rrRun(rrInput, over) : rr;
    if (!r) return '';
    const dl = Math.round(r.realRangeKm - rr.realRangeKm);
    const mark = over ? '' : ' (you)';
    return `<tr><td>${label}${mark}</td><td class="num">${d(r.realRangeKm)}</td><td class="num">${dl >= 0 ? '+' : ''}${dl}</td><td class="num">${r.realWhPerKm} Wh/km</td></tr>`;
  }).join('');
  // A3-extra: climate sweep — same engine, varied thermometer.
  const yourT = rrInput.tempC ?? 32;
  const temps = [-7, 12, 25, 32, 42].map((tc) => {
    const r = tc === yourT ? rr : rrRun(rrInput, { tempC: tc });
    if (!r) return '';
    const dl = Math.round((r.realRangeKm / (rrRun(rrInput, { tempC: 25 }) || rr).realRangeKm - 1) * 100);
    const mark = tc === yourT ? ' (you)' : '';
    return `<tr><td class="num">${tc}°C${mark}</td><td class="num">${d(r.realRangeKm)}</td><td class="num">${dl >= 0 ? '+' : ''}${dl}% vs 25°C</td><td class="num">${r.factors.hvacKw} kW HVAC</td></tr>`;
  }).join('');
  // A4-extra: speed sweep — same engine, varied right wrist.
  const yourV = rrInput.speedKph;
  const speeds = [40, 60, 80, 100, 120].filter((s) => !picked.top_speed || s <= picked.top_speed + 10).map((s) => {
    const r = s === yourV ? rr : rrRun(rrInput, { speedKph: s });
    if (!r) return '';
    const mark = s === yourV ? ' (you)' : '';
    return `<tr><td class="num">${s} kph${mark}</td><td class="num">${d(r.realRangeKm)}</td><td class="num">${r.realWhPerKm} Wh/km</td><td class="num">×${r.factors.speedMult}</td></tr>`;
  }).join('');
  // A5-extra: chemistry × year SoH matrix — same fade model, all six families.
  const chRows = CHEM_COLS.map((ch) => {
    const cells = [1, 3, 5, 8].map((y) => `<td class="num">${(sohFor(ch, y, dcfc) * 100).toFixed(1)}%</td>`).join('');
    const mark = ch === picked.chemistry ? ' (you)' : '';
    return `<tr><td>${ch}${mark}</td>${cells}</tr>`;
  }).join('');
  $('rangeDeep').innerHTML =
    `<div class="subhead">A1 · Spec normalizer — ${picked.cycle} → one honest baseline</div>`
    + `<table class="spec"><tr><th>Lab claim</th><th>Cycle</th><th>Optimism ÷</th><th>Honest baseline</th><th>Base consumption</th></tr>`
    + `<tr><td class="num">${picked.lab_range_km} km</td><td>${picked.cycle}</td><td class="num">÷${opt.toFixed(2)}</td><td class="num">${rr.honestLabKm} km</td><td class="num">${rr.baseWhPerKm} Wh/km</td></tr></table>`
    + `<table class="spec"><caption>Same pack, every cycle — computed from your honest baseline</caption><tr><th>Cycle</th><th class="num">Optimism ÷</th><th class="num">This pack would claim</th><th class="num">Inflation</th></tr>${cycRows}</table>`
    + `<div class="subhead">A2 · Load model — who/what the lab pretends isn't there</div>`
    + `<table class="spec"><tr><th>Lab test mass</th><th>Your mass</th><th>Extra</th><th>Rolling-drag penalty</th></tr>`
    + `<tr><td class="num">${rr.massLabKg} kg</td><td class="num">${rr.massRealKg} kg (rider ${$('rider').value} + load ${$('load').value})</td><td class="num">+${massDelta} kg</td><td class="num">×${rr.factors.massMult}</td></tr></table>`
    + `<table class="spec"><caption>Load sensitivity — engine re-run per row (lab assumes ~75 kg, no pillion/cargo)</caption><tr><th>Setup</th><th class="num">Range</th><th class="num">Δ</th><th class="num">Use</th></tr>${loadRows}</table>`
    + `<div class="subhead">A3 · Climate derate — heater, AC, battery chemistry</div>`
    + `<table class="spec"><tr><th>Your temp</th><th>HVAC draw</th><th>Resistance ×</th><th>Calibration anchors</th></tr>`
    + `<tr><td class="num">${$('temp').value}°C</td><td class="num">${rr.factors.hvacKw} kW</td><td class="num">×${rr.factors.climateMult}</td><td>−7°C Michigan ≈ <b class="vs-bad">−32%</b> (Model Y EPA 531→~348 km, test-locked) · 42°C Delhi ≈ <b class="vs-bad">−18%</b> + chiller</td></tr></table>`
    + `<table class="spec"><caption>Climate sweep — engine re-run per row (Arrhenius resistance + HVAC, 2026 BYD/Hyundai cell data)</caption><tr><th>Temp</th><th class="num">Range</th><th class="num">Δ</th><th class="num">HVAC</th></tr>${temps}</table>`
    + `<div class="subhead">A4 · Speed curve — your cruise vs the lab's gentle anchor</div>`
    + `<table class="spec"><tr><th>Lab anchor</th><th>Your cruise</th><th>Aero penalty</th><th>Regen recovery</th></tr>`
    + `<tr><td class="num">~${rr.vLabKph} kph</td><td class="num">${rr.speedKph} kph</td><td class="num">×${rr.factors.speedMult}</td><td class="num">${Math.round((picked.segment.startsWith('4W') ? 0.18 : picked.segment.startsWith('3W') ? 0.10 : 0.12) * cityFrac * 100)}% at ${Math.round(cityFrac * 100)}% city</td></tr></table>`
    + `<table class="spec"><caption>Speed sweep — 40 kph scooter to 120 kph highway (CdA + rolling per body type)</caption><tr><th>Cruise</th><th class="num">Range</th><th class="num">Use</th><th class="num">Aero ×</th></tr>${speeds}</table>`
    + `<div class="subhead">A5 · Degradation curve — ${picked.chemistry} year 0→8 (your DCFC share ${Math.round(dcfc * 100)}%)</div>`
    + `<table class="spec"><tr><th>Age</th><th class="num">SoH</th><th class="num">Projected range</th></tr>${degRows}</table>`
    + `<table class="spec"><caption>All chemistries, same fade model — LFP (CATL ~40.2% share champ) vs NMC vs sodium-ion (Naxtra-class) vs LMFP</caption><tr><th>Cell</th><th class="num">Yr-1</th><th class="num">Yr-3</th><th class="num">Yr-5</th><th class="num">Yr-8</th></tr>${chRows}</table>`
    + `<div class="callout"><b>Why this beats the alternatives:</b> ABRP is 4W-only, paywalls weather and never sees your pillion. OEM calculators quote the lab number and stop. WoodMac/EV-Volumes sell $25k PDFs with no per-user math. Every number above is computed on-device from your inputs — change one and watch it move.</div>`;
}

/* ================= B · TCO deep-dive (energy + subsidy autopilot + opex) ================= */
export function subsidyBox(ctx, { t, seg2, sub, subNote, subStatus }) {
  const { DB } = ctx;
  const cc = String(t.code).split('-')[0];
  const rows = (DB.subsidies || []).filter((s) => s.country === cc)
    .map((s) => `<tr><td><b>${s.name}</b><br><small>${s.benefit}</small></td><td><small>till ${s.valid_till}</small></td></tr>`).join('');
  let applied = '';
  if (cc === 'IN' && seg2 !== '4W' && subStatus === 'expired') applied = `<tr><td><b class="vs-bad">PM E-DRIVE expired 31 Jul 2026: ₹0 applied.</b><br><small>${subNote} GST 5% already baked into EV ex-showroom (vs 28–50% on ICE). State top-ups: conservative OFF — funds exhaust fast, verify with dealer.</small></td><td><small>expired 31 Jul 2026</small></td></tr>`;
  else if (cc === 'IN' && seg2 !== '4W') applied = `<tr><td><b class="vs-good">PM E-DRIVE applied: ₹${sub.toLocaleString('en-IN')}</b><br><small>${subNote} GST 5% already baked into EV ex-showroom (vs 28–50% on ICE). State top-ups: conservative OFF — funds exhaust fast, verify with dealer.</small></td><td><small>till 31 Jul 2026</small></td></tr>`;
  else if (cc === 'IN') applied = `<tr><td>No PM E-DRIVE on 4W — but <b>GST 5% vs 28–50% ICE</b> is already baked into the ex-showroom gap. State top-ups: conservative OFF.</td><td><small>ongoing</small></td></tr>`;
  else if (cc === 'US') applied = `<tr><td><b>US IRA 30D: conservative $0 applied.</b><br><small>4 gates decide $7,500 / $3,750 / $0: NA assembly, $55k car / $80k SUV cap, income caps, 2026 battery-sourcing rules. $4,000 used-EV credit exists separately. Confirm VIN eligibility with dealer — we never assume you pass.</small></td><td><small>till 2032</small></td></tr>`;
  else applied = `<tr><td><b>Conservative €/$0 auto-applied outside IN/US.</b><br><small>FR Bonus écologique (up to €4k, means-tested + eco-score), DE 0.25% company-car BIK stealth saving, ID TKDN ≥40% gate, TH EV3.5, BR MOVER, GB 2% salary-sacrifice BIK — all need paperwork gates, so the math stays honest until you confirm.</small></td><td><small>see schemes</small></td></tr>`;
  return `<table class="spec"><tr><th>Scheme</th><th>Validity</th></tr>${applied}${rows}</table>`;
}
export function renderTcoDeep(ctx, { t, rr, tco, disp, yrs, seg2, md, priceEv, iceKmpl, icePrice, sub, subNote, subStatus, inINR }) {
  const { $, picked, curSym } = ctx;
  const DB = ctx.DB;
  const kmpd = +$('kmpd').value, homeFrac = +$('home').value, dpy = 300;
  const kmY = kmpd * dpy, kmT = kmY * yrs;
  const kwhY = (rr.realWhPerKm / 1000) * kmY;
  const sym = curSym(t.code);
  const mEv = (inINR ? md.ev : md.ev * 20) * kmT, mIce = (inINR ? md.ice : md.ice * 20) * kmT;
  const tyreEv = 0.15 * kmT, tyreIce = 0.25 * kmT;
  const ins1Ev = priceEv * 0.032, ins1Ice = (icePrice || priceEv * 0.6) * 0.03;
  const gsum = (y1) => { let s = 0; for (let i = 0; i < yrs; i++) s += y1 * Math.pow(0.92, i); return s; };
  const packUSD = picked.battery_kwh * (picked.chemistry.startsWith('NMC') ? 110 : 85);
  // B1-extra: your 100 km across 8 real tariff geos — same kWh appetite, local prices.
  const GEO_ORDER = ['IN-MH', 'IN-DL', 'US-TX', 'US-CA', 'DE', 'FR', 'VN', 'TH', 'ID', 'BR', 'GB'];
  const geoRows = GEO_ORDER.map((code) => (DB.tariffs || []).find((x) => x.code === code)).filter(Boolean).slice(0, 8)
    .map((g) => {
      const gs = curSym(g.code);
      const per100 = (rr.realWhPerKm / 1000) * 100 * g.home_kwh;
      const you = g.code === t.code ? ' (you)' : '';
      return `<tr><td>${g.country}${you}</td><td class="num">${gs}${g.home_kwh}</td><td class="num">${gs}${g.dcfc_kwh}</td><td class="num">${gs}${g.petrol_per_L}/L</td><td class="num"><b>${gs}${per100.toFixed(per100 < 10 ? 2 : 0)}</b></td></tr>`;
    }).join('');
  // B4: breakeven trajectory — the same monthly math as the page-3 chart, as a table.
  const beRows = tco.monthly.filter((p) => p.m % 12 === 0)
    .map((p) => `<tr><td>Month ${p.m}</td><td class="num">${Math.round(p.cumEv).toLocaleString('en-IN')}</td><td class="num">${Math.round(p.cumIce).toLocaleString('en-IN')}</td><td class="num">${Math.round(p.cumIce - p.cumEv).toLocaleString('en-IN')}</td></tr>`).join('');
  const beVerdict = tco.breakevenMonth === null
    ? `No breakeven inside ${yrs} yr — needs more km/day or cheaper home power.`
    : `You break even at month ${tco.breakevenMonth}. Not vibes. Math.`;
  $('tcoDeep').innerHTML =
    `<div class="subhead">B1 · Energy cost — Apr-2026 tariffs, your split (all pre-loaded, all overridable)</div>`
    + `<table class="spec"><tr><th></th><th class="num">EV (electric)</th><th class="num">ICE (petrol)</th></tr>`
    + `<tr><td>Use / yr</td><td class="num">${Math.round(kwhY).toLocaleString()} kWh (${Math.round(kwhY * homeFrac).toLocaleString()} home + ${Math.round(kwhY * (1 - homeFrac)).toLocaleString()} fast)</td><td class="num">${Math.round(kmY / iceKmpl).toLocaleString()} L @ ${iceKmpl} km/L</td></tr>`
    + `<tr><td>Unit price</td><td class="num">home ${sym}${t.home_kwh} · fast ${sym}${t.dcfc_kwh}</td><td class="num">${sym}${t.petrol_per_L}/L</td></tr>`
    + `<tr><td><b>Fuel bill / yr</b></td><td class="num"><b>${disp(tco.energyEvYear)}</b></td><td class="num"><b>${disp(tco.fuelIceYear)}</b></td></tr></table>`
    + `<table class="spec"><caption>Your 100 km around the world — pre-loaded Apr-2026 tariffs, 25 countries in the picker</caption><tr><th>Tariff geo</th><th class="num">Home/kWh</th><th class="num">Fast/kWh</th><th class="num">Petrol</th><th class="num">Your 100 km</th></tr>${geoRows}</table>`
    + `<p class="hint">Anchors: Maharashtra slab ~₹9.5 home · Texas $0.13 · Germany ~$0.41 · Vietnam EVN — switch Country/tariff on page 1 to feel the gap.</p>`
    + `<div class="subhead">B2 · Subsidy autopilot — applied, expiring, or conservatively skipped</div>`
    + subsidyBox(ctx, { t, seg2, sub, subNote, subStatus })
    + `<div class="subhead">B3 · Maintenance + insurance + tyres + battery (WoodMac 2026 pack prices)</div>`
    + `<table class="spec"><tr><th>Line (${yrs} yr, ${(kmT / 1000).toFixed(0)}k km)</th><th class="num">EV</th><th class="num">ICE</th></tr>`
    + `<tr><td>Service rate used</td><td class="num">${inINR ? '₹' : '$'}${inINR ? md.ev : (md.ev * 20).toFixed(2)}/km</td><td class="num">${inINR ? '₹' : '$'}${inINR ? md.ice : (md.ice * 20).toFixed(2)}/km</td></tr>`
    + `<tr><td>Maintenance</td><td class="num">${disp(mEv)}</td><td class="num">${disp(mIce)}</td></tr>`
    + `<tr><td>Insurance (declining IDV)</td><td class="num">${disp(gsum(ins1Ev))}</td><td class="num">${disp(gsum(ins1Ice))}</td></tr>`
    + `<tr><td>Tyres</td><td class="num">${disp(tyreEv)}</td><td class="num">${disp(tyreIce)}</td></tr>`
    + `<tr><td>Battery replacement reserve</td><td class="num">₹0 in total — pack ≈ $${Math.round(packUSD).toLocaleString()} today (${picked.chemistry} @ WoodMac 2026 ${picked.chemistry.startsWith('NMC') ? '$110' : '$85'}/kWh), falling yearly; warranty covers 8 yr</td><td class="num">—</td></tr>`
    + `<tr><td><b>TOTAL (${yrs} yr)</b></td><td class="num"><b>${disp(tco.totalEv)}</b></td><td class="num"><b>${disp(tco.totalIce)}</b></td></tr>`
    + `<tr><td><b>Verdict</b></td><td colspan="2"><b class="${tco.savings >= 0 ? 'vs-good' : 'vs-bad'}">${tco.savings >= 0 ? 'SAVE ' + disp(tco.savings) : 'EXTRA ' + disp(-tco.savings)} · breakeven ${tco.breakevenMonth === null ? 'beyond ' + yrs + 'y — needs more km/day or cheaper home power' : 'month ' + tco.breakevenMonth} · ${disp(tco.costPerKmEv)}/km vs ${disp(tco.costPerKmIce)}/km</b> · CO₂ saved ~${tco.co2SavedT}t</td></tr></table>`
    + `<div class="subhead">B4 · Breakeven trajectory — month 0→${yrs * 12}, same math as the page-3 chart</div>`
    + `<p><b>${beVerdict}</b></p>`
    + `<table class="spec"><tr><th>Point</th><th class="num">EV total</th><th class="num">Petrol total</th><th class="num">EV ahead by</th></tr>${beRows}</table>`
    + `<div class="callout"><b>Why this beats the alternatives:</b> OEM calculators cherry-pick the cheapest tariff and hide insurance/tyres. WoodMac/BNEF charge ~$25k for a static PDF. This is your tariff, your km/day, your home-charging share — with breakeven as a month number, not vibes.</div>`;
}

/* ================= C · Battery passport + SoH (stage 2 analysis + stage 3 outputs) ================= */
export function renderBattDeep(ctx, { rr, disp, seg2, priceEv, sub }) {
  const { $, fmtDist, picked } = ctx;
  const dcfc = (+$('dcfc').value || 0) / 100;
  const paid = priceEv - sub;
  const d = (km) => { const f = fmtDist(km); return `${f.v} ${f.u}`; };
  const soh0 = sohFor(picked.chemistry, 0, dcfc) || 1;
  const rows = [1, 3, 5].map((y) => {
    const s = sohFor(picked.chemistry, y, dcfc) * 100;
    const rs = resaleForecast(paid, seg2, picked.chemistry, s, y);
    return `<tr><td>Year ${y}</td><td class="num">${s.toFixed(1)}%</td><td class="num">${disp(rs.value)}</td><td class="num">${rs.pctOfNew}% of paid</td></tr>`;
  }).join('');
  $('resaleTbl').innerHTML =
    `<div class="subhead">Resale forecast — health-linked, not guesswork</div>`
    + `<table class="spec"><tr><th>Age</th><th class="num">Battery left</th><th class="num">Resale value</th><th class="num">Held value</th></tr>${rows}</table>`;
  const traj = [0, 3, 8].map((a) => {
    const s = sohFor(picked.chemistry, a, dcfc);
    return `Y${a} ${(s * 100).toFixed(0)}% (~${d(rr.realRangeKm * s / soh0)})`;
  }).join(' → ');
  // C1-extra: verdict for YOUR inputs — heat, fast-charge habit, body type.
  const tempC = +$('temp').value || 32;
  const youRec = tempC >= 38
    ? `Your ${tempC}°C heat + battery chiller load → <b>LFP/LMFP is the rational buy</b> (heat-proof, daily fast-charge OK). NMC here needs garage parking + an 80% daily cap or you pay in fade.`
    : dcfc > 0.4
      ? `Your ${Math.round(dcfc * 100)}% fast-charge share → <b>LFP-family pays back in resale</b> (NMC fades −15–25% faster on this diet; see the matrix in A5).`
      : seg2 === '4W'
        ? `Garage-able 4W with moderate fast-charging → <b>NMC buys you max range</b> (cap daily at 80%); LFP if you keep cars 8+ yr.`
        : `Delivery heat + stop-go duty → <b>LFP-family first</b>; sodium-ion if the discount is steep (negotiate resale down); NMC only for max-range bragging rights.`;
  $('battDeep').innerHTML =
    `<div class="subhead">C1 · Chemistry research — should YOU buy ${picked.chemistry}?</div>`
    + `<div class="callout"><b>${picked.chemistry}:</b> ${CHEM_TXT[picked.chemistry] || 'Ask the dealer for the cell supplier in writing.'}`
    + ` Rule of thumb — delivery heat + daily fast-charge → LFP-family; max range + garage parking → NMC (cap at 80% daily); tight budget + tough climate → sodium-ion (negotiate resale down).</div>`
    + `<div class="callout"><b>Your verdict:</b> ${youRec}</div>`
    + `<div class="subhead">C2 · SoH trajectory at your ${Math.round(dcfc * 100)}% fast-charge share</div>`
    + `<p><b>${traj}</b></p>`
    + (dcfc > 0.4 ? `<div class="callout"><b>DCFC share above 40%:</b> expected pack life −15–25%. Shifting 2 sessions/week to slow charging pays back in resale (see page 3).</div>` : '')
    + `<div class="subhead">C3 · Why competitors lose — feature matrix, no marketing</div>`
    + `<table class="spec"><tr><th>Tool</th><th class="num">2W + 3W</th><th class="num">Your pillion/cargo</th><th class="num">Weather in math</th><th class="num">Price</th></tr>`
    + `<tr><td>ABRP</td><td class="num">No (4W-only)</td><td class="num">No</td><td class="num">paywalled API</td><td class="num">freemium</td></tr>`
    + `<tr><td>OEM calculators</td><td class="num">No (showcase models)</td><td class="num">No (lab mass)</td><td class="num">No (lab temp)</td><td class="num">biased doorway</td></tr>`
    + `<tr><td>WoodMac / EV-Volumes</td><td class="num">Yes (fleets)</td><td class="num">No</td><td class="num">No (static PDF)</td><td class="num">~$25k</td></tr>`
    + `<tr><td><b>VoltPrecon (this page)</b></td><td class="num"><b>Yes (920 models)</b></td><td class="num"><b>Yes (per-kg)</b></td><td class="num"><b>Yes (per-C)</b></td><td class="num"><b>free offline</b></td></tr></table>`
    + `<div class="callout"><b>Why this beats the alternatives:</b> Recurrent/AVILOO test health but don't connect it to your money. Dealers quote resale from vibes. Here SoH feeds the resale formula directly — and documented variance up to 13.5% (AVILOO 500k tests) is why you get a battery test before buying used.</div>`;
}
export function renderSoh(ctx, { dcfcFrac, odoKm }) {
  const { $, picked } = ctx;
  const soh = estimateSoh({ chemistry: picked.chemistry, ageYears: 0, dcfcFrac, odoKm });
  $('soh').innerHTML = `<div class="rival">Health <b>${soh.sohPct}% (${soh.band})</b> · ~${soh.remainingFastCharges.toLocaleString()} fast-charges left<br><small>${CHEM_TXT[picked.chemistry] || ''}</small><ul>${soh.advice.map((a) => `<li>${a}</li>`).join('')}</ul></div>`;
  return soh;
}
// Jurisdiction-aware loan disclaimer (counsel-reviewed wording per region —
// the "not financial advice" footer alone doesn't survive US/DE lending contexts).
export function loanDisclaimer(code) {
  if (String(code).startsWith('US')) return 'Illustrative estimate only — not a loan offer, commitment, or financial advice. IRA credits depend on VIN eligibility (assembly, price, income and battery-sourcing gates); confirm APR, terms and Truth-in-Lending disclosures with your lender.';
  if (String(code) === 'DE' || String(code) === 'FR') return 'Unverbindliche Schätzung — kein Kreditangebot und keine Finanzberatung. Bitte Effektivzins und Bedingungen mit Bank/Leasinggeber bestätigen. / Estimation indicative — ni offre de prêt ni conseil financier.';
  if (String(code).startsWith('IN')) return 'Illustrative estimate — not a loan offer or financial advice. Subsidy, GST and insurance figures are working baselines; confirm EMI, APR and terms with your bank/NBFC before signing.';
  return 'Illustrative estimate — not a loan offer or financial advice; confirm APR and terms with your lender.';
}
export function loanHTML(p, rr, tco, rs3, F, yrs, subNote, regionCode) {
  return `<h2>VoltPrecon loan summary — ${p.make} ${p.model} ${p.variant} (${p.year})</h2>
  <p><b>YOUR range ${Math.round(rr.realRangeKm)} km</b> (lab ${p.lab_range_km} ${p.cycle}; ${rr.realWhPerKm} Wh/km) · Yr-3 resale ≈ ${F(rs3.value)} (${rs3.pctOfNew}% of paid).</p>
  <p>${yrs}-yr total EV ${F(tco.totalEv)} vs ICE ${F(tco.totalIce)} → ${tco.savings >= 0 ? 'SAVE ' + F(tco.savings) : 'EXTRA ' + F(-tco.savings)}; breakeven ${tco.breakevenMonth === null ? 'beyond window' : 'month ' + tco.breakevenMonth}; ${F(tco.costPerKmEv)}/km vs ${F(tco.costPerKmIce)}/km.</p>
  <p>${subNote}</p><p>CO₂ saved ~${tco.co2SavedT}t. Method + provenance documented in the repo docs.</p>
  <p><small>${loanDisclaimer(regionCode)}</small></p>`;
}
