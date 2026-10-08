/* VoltPrecon web app — offline-first. Engine + data loaded locally; zero trackers.
   Telemetry is privacy-friendly: anonymous counters only (no cookies, no PII, no VIN),
   queued in localStorage and beaconed best-effort to /api/v1/events when online. */
import { realRange } from '../../packages/engine/src/physics.js';
import { trueTco, MAINT_DEFAULTS } from '../../packages/engine/src/tco.js';
import { resaleForecast } from '../../packages/engine/src/resale_soh.js';
import { pmEdriveSubsidy } from '../../packages/engine/src/subsidy.js';
// NOTE: stage-2/3 deep renderers live in ./deep.js, loaded lazily on ANALYZE so the
// first-load shell stays under the 60KB budget (tools/perf/budget.js fails closed).

const $ = (id) => document.getElementById(id);
let DB = null, MODELS = [], CURATED = [], picked = null;
let UNITS = 'km';
try { UNITS = localStorage.getItem('vp-units') || 'km'; } catch {}

const CURSYM = { IN: '₹', US: '$', DE: '€', FR: '€', GB: '£', ID: 'Rp', VN: '₫', TH: '฿', BR: 'R$' };
const curSym = (code) => CURSYM[String(code).split('-')[0]] || '$';

const CITY_PRESETS = [
  ['Pune, IN', 32, 'IN-MH'], ['Delhi Summer, IN', 42, 'IN-DL'], ['Delhi Winter, IN', 12, 'IN-DL'],
  ['Nagpur, IN', 38, 'IN-MH'], ['Austin TX, US', 34, 'US-TX'], ['Detroit MI Winter, US', -7, 'US-MI'],
  ['Los Angeles, US', 24, 'US-CA'], ['Berlin, DE', 9, 'DE'], ['Paris, FR', 12, 'FR'],
  ['London, UK', 10, 'GB'], ['Shanghai, CN', 20, 'CN'], ['Jakarta, ID', 31, 'ID'],
  ['Hanoi, VN', 29, 'VN'], ['Bangkok, TH', 33, 'TH'], ['Oslo Winter, NO', -5, 'NO'],
  ['Dubai, AE', 40, 'AE'], ['São Paulo, BR', 23, 'BR'],
];


/* ---------- light / dark mode (persisted, OS-aware) ---------- */
function currentTheme() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
function paintThemeToggle() {
  const b = $('themeToggle'); if (!b || !b.setAttribute) return;
  const light = currentTheme() === 'light';
  const q = (s) => (typeof b.querySelector === 'function' ? b.querySelector(s) : null);
  const emoji = q('.theme-emoji'), label = q('.theme-label');
  if (emoji) emoji.textContent = light ? 'L' : 'D';
  else b.textContent = light ? 'L' : 'D';
  if (label) label.textContent = light ? 'Light' : 'Dark';
  b.setAttribute('aria-pressed', String(light));
  b.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
  b.setAttribute('title', light ? 'Light mode (switch to dark)' : 'Dark mode (switch to light)');
  const m = $('themeColor'); if (m) m.content = light ? '#f5f7f2' : '#0e120e';
}
function initTheme() {
  paintThemeToggle();
  const b = $('themeToggle'); if (!b) return;
  b.onclick = () => {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('vp-theme', next); } catch {}
    paintThemeToggle();
    TQ.track('theme_toggle', { theme: next });
  };
}

/* ---------- 3-page flow: page 1 inputs → page 2 analysis → page 3 outputs ----------
   Guards keep pages honest: page 2 needs a picked vehicle, page 3 needs a
   completed analysis (hasComputed). The stepper pills are clickable shortcuts
   with the same guards — no dead-end or empty-results page is reachable. */
let hasComputed = false;
const needPick = () => {
  if (picked) return true;
  showStage(1);
  try { $('q').focus(); } catch {}
  alert('Pick a vehicle first — type in the search box on page 1.');
  return false;
};
const needComputed = () => {
  if (picked && hasComputed) return true;
  if (!picked) return needPick();
  showStage(2);
  alert('Run ANALYZE on page 1 first — page 3 outputs need a completed analysis.');
  return false;
};
const STAGE_SECTIONS = { 1: ['step1', 'step1b'], 2: ['stage2sec'], 3: ['out'] };
function showStage(n) {
  for (const k of Object.keys(STAGE_SECTIONS))
    STAGE_SECTIONS[k].forEach((id) => { const e = $(id); if (e) e.hidden = Number(k) !== n; });
  for (let i = 1; i <= 3; i++) {
    const li = $('st' + i); if (!li || !li.classList) continue;
    li.classList.toggle('done', i < n);
    if (i === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  }
  TQ.track('stage_view', { stage: n });
  if (typeof window.scrollTo === 'function') { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {} }
}

/* ---------- privacy-friendly field web-vitals (RUM, no vendor, no PII) ----------
   LCP/INP/CLS via PerformanceObserver, beaconed once per estimate as
   rum_webvitals {lcpMs,inpMs,cls}. No URL, no IP, no cookie. Surfaced in
   /api/v1/health rum + weekly log rollup. Lab budgets stay in CI; field wins deals. */
function beaconRUM() {
  try {
    if (!('PerformanceObserver' in window)) return;
    const vals = {};
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.entryType === 'largest-contentful-paint' && e.startTime) vals.lcpMs = Math.round(e.startTime);
        if (e.entryType === 'layout-shift' && !e.hadRecentInput) vals.cls = Math.round(((vals.cls || 0) + e.value) * 1000) / 1000;
      }
    });
    try { po.observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
    try { po.observe({ type: 'layout-shift', buffered: true }); } catch {}
    const send = () => {
      try {
        let inp = null;
        const es = (performance.getEntriesByType && performance.getEntriesByType('event')) || [];
        for (const e of es) { if (e.duration && (e.name === 'click' || e.name === 'keydown')) inp = inp == null ? e.duration : Math.max(inp, e.duration); }
        if (vals.lcpMs != null || inp != null || vals.cls != null) TQ.track('rum_webvitals', { lcpMs: vals.lcpMs ?? null, inpMs: inp != null ? Math.round(inp) : null, cls: vals.cls ?? null });
      } catch {}
    };
    setTimeout(send, 8000);
  } catch {}
}
/* ---------- privacy-friendly telemetry (anonymous, batched, no PII) ---------- */
const TQ = {
  load() { try { return JSON.parse(localStorage.getItem('vp-events') || '[]'); } catch { return []; } },
  save(q) { try { localStorage.setItem('vp-events', JSON.stringify(q.slice(-200))); } catch {} },
  track(name, props = {}) {
    const q = TQ.load();
    q.push({ n: name, p: props, t: Date.now() });
    TQ.save(q);
    window.__vpEvents = q;
    // best-effort beacon; never blocks UI, never sends PII
    try {
      const body = JSON.stringify({ events: [{ n: name, p: props }] });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/v1/events', body);
      else fetch('/api/v1/events', { method: 'POST', body, keepalive: true }).catch(() => {});
    } catch {}
  },
};

function fmtDist(km) {
  if (UNITS === 'mi') return { v: Math.round(km * 0.621371), u: 'mi' };
  return { v: Math.round(km), u: 'km' };
}
function confBand(m) {
  return m.provenance === 'curated' || m.p === 'curated'
    ? { km: 8, txt: 'lab-verified spec · typical band ±8 km' }
    : { km: Math.max(10, Math.round((m.lab_range_km || m.lab || 150) * 0.08)), txt: 'parametric estimate · band ±~8% — your odo reading tightens it' };
}

/* ---------- owner-verified aggregates (local-first, server best-effort) ---------- */
function ownAgg(id) {
  try { return JSON.parse(localStorage.getItem('vp-own-' + id) || '{"n":0,"sum":0}'); }
  catch { return { n: 0, sum: 0 }; }
}
function renderOwnAgg(modelId, physicsKm) {
  const a = ownAgg(modelId);
  const el = $('ownAgg');
  if (!a.n) { el.textContent = `No owner reports yet for this model — physics says ~${fmtDist(physicsKm).v} ${fmtDist(physicsKm).u}. Be the first to verify.`; return; }
  const avg = a.sum / a.n;
  el.innerHTML = `<b>${a.n} owner${a.n > 1 ? 's' : ''} average ${fmtDist(avg).v} ${fmtDist(avg).u}</b> vs our physics ${fmtDist(physicsKm).v} ${fmtDist(physicsKm).u} (Δ ${Math.round(avg - physicsKm)} km). Aggregated anonymously on-device${a.synced ? ' + server' : ''}.`;
}
function submitOwn() {
  if (!picked) return;
  const v = Number($('ownRange').value);
  if (!v || v < 5 || v > 1200) { alert('Enter your real range in km (5–1200).'); return; }
  const k = 'vp-own-' + picked.id;
  const a = ownAgg(picked.id);
  a.n++; a.sum += v;
  try { localStorage.setItem(k, JSON.stringify(a)); } catch {}
  TQ.track('owner_submit', { model: picked.id.slice(0, 24), cond: $('ownCond').value });
  try { fetch('/api/v1/owner-range', { method: 'POST', body: JSON.stringify({ modelId: picked.id, km: v, cond: $('ownCond').value }), keepalive: true }).catch(() => {}); } catch {}
  renderOwnAgg(picked.id, Number(picked._lastRR || v));
  $('ownRange').value = '';
  alert('Thanks — your anonymous report tightens this model for everyone.');
}

async function boot() {
  initTheme();
  beaconRUM();
  if (window.VP_I18N) VP_I18N.apply(VP_I18N.lang());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const units = $('units'); if (units) { units.value = UNITS; units.onchange = () => { UNITS = units.value; try { localStorage.setItem('vp-units', UNITS); } catch {} }; }
  const langSel = $('lang'); if (langSel && window.VP_I18N) langSel.onchange = () => VP_I18N.apply(langSel.value);
  let r;
  try {
    r = await fetch('data.bundle.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
  } catch (e) {
    const el = $('loadErr');
    el.hidden = false;
    el.innerHTML = `<strong>Could not load offline database (data.bundle.json).</strong> `
      + `If you opened this via <code>file://</code>, browsers block <code>fetch()</code> — serve over HTTP: <code>node infra/serve-static.js 8080</code> then open <code>http://localhost:8080/</code>. `
      + `On network failure: check connection and reload (PWA caches after first load). <small>${String(e).slice(0, 120)}</small>`;
    $('dbMeta').textContent = 'offline DB unavailable';
    TQ.track('load_error', {});
    return;
  }
  try { DB = await r.json(); }
  catch {
    $('loadErr').hidden = false;
    $('loadErr').textContent = 'Offline database is corrupt — re-run: python packages/data/src/generator.py';
    return;
  }
  MODELS = DB.models_index; CURATED = DB.models_curated;
  const aff = (DB.meta.verification && DB.meta.verification.t2_affirmed_on) || DB.meta.as_of;
  $('dbMeta').textContent = `${DB.meta.total} models (${DB.meta.curated} lab-verified) · tariffs ${DB.meta.as_of} snapshot, reviewed ${aff}`;
  $('ccy').innerHTML = DB.tariffs.map((t) => `<option value="${t.code}">${t.country} — power ${t.home_kwh_USD}/kWh · petrol $${t.petrol_per_L}/L</option>`).join('');
  $('ccy').value = 'IN-MH';
  $('city').innerHTML = CITY_PRESETS.map((c, i) => `<option value="${i}">${c[0]}</option>`).join('');
  $('city').onchange = () => { onCityChange('city'); };
  $('cityFrac').oninput = () => { $('cityFracV').textContent = $('cityFrac').value + '%'; autoSpeed(); };
  // Company-wise browsing: make filter covers every make in the 920-model index.
  const makes = [...new Set(MODELS.map((m) => m.mk))].sort((a, b) => a.localeCompare(b));
  $('makeFilter').innerHTML = `<option value="">All makes (${makes.length})</option>` + makes.map((k) => `<option value="${k}">${k}</option>`).join('');
  $('makeFilter').onchange = () => { searchLimit = 100; fillModels($('makeFilter').value); search(); };
  $('modelFilter').onchange = () => { const id = $('modelFilter').value; if (id) pick(id); };
  $('q').oninput = () => { searchLimit = 100; search(); };
  $('segFilter').onchange = () => { searchLimit = 100; search(); };
  $('moreBtn').onclick = () => { searchLimit += 200; search(true); };
  $('go').onclick = async () => {
    if (!picked) { showStage(1); $('q').focus(); alert('Pick a vehicle first — type in the search box.'); return; }
    // Enter stage 2 FIRST so the analysis + SEE-MY-OUTPUTS buttons are visible even
    // if the math below throws (previously showStage(2) ran after compute, so any
    // error left the user stuck on stage 1 with no way forward).
    showStage(2);
    try {
      await compute();
    } catch (e) {
      const el = $('rangeDeep');
      if (el) el.innerHTML = `<div class="callout"><b>Analysis hit a snag (${String(e && e.message || e).slice(0, 120)}).</b> Your pick is kept — tweak an input and press ANALYZE again, or jump to outputs.</div>`;
      try { TQ.track('compute_error', { msg: String(e && e.message || e).slice(0, 80) }); } catch {}
    }
  };
  const t3 = $('toStage3'); if (t3) t3.onclick = () => { if (needComputed()) showStage(3); };
  const t3t = $('toStage3Top'); if (t3t) t3t.onclick = () => { if (needComputed()) showStage(3); };
  $('backTo1').onclick = () => showStage(1);
  $('backTo2').onclick = () => { if (needPick()) showStage(2); };
  // Clickable stepper: page 1 always, page 2 needs a pick, page 3 needs analysis.
  [['st1', 1], ['st2', 2], ['st3', 3]].forEach(([id, n]) => {
    const li = $(id); if (!li) return;
    li.title = n === 1 ? 'Go to page 1 · Inputs' : n === 2 ? 'Go to page 2 · Analysis' : 'Go to page 3 · Outputs';
    const hop = () => {
      if (n === 1) showStage(1);
      else if (n === 2) { if (needPick()) showStage(2); }
      else if (needComputed()) showStage(3);
    };
    li.onclick = hop;
    li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hop(); } };
  });
  $('ccy').onchange = () => { onTariffChange(); };
  $('pin').oninput = updateSlab;
  $('pdfBtn').onclick = () => { TQ.track('pdf_print', { model: picked ? picked.id.slice(0, 24) : '' }); window.print(); };
  $('waBtn').onclick = copySummary;
  $('ownSubmit').onclick = submitOwn;
  $('photo').onchange = doOCR; $('csv').onchange = doCSV;
  // Deep link from SEO pages / embeds: /?model=<id>
  const deep = new URLSearchParams(location.search).get('model');
  if (deep) { try { pick(deep); } catch {} }
  updateSlab();
  showStage(1);
  search();
}
function setAutoNote(msg) { try { const el = $('autoNote'); if (el) el.textContent = msg || ''; } catch {} }
/* ---------- auto-select: ride fields follow model / city / tariff ---------- */
const RIDE_PRESETS = {
  '2W': { kmpd: 30, cityFrac: 70, speed: 45, home: '0.9', dcfc: 10, label: '2-wheeler (city commute)' },
  '3W': { kmpd: 80, cityFrac: 85, speed: 40, home: '0.9', dcfc: 10, label: '3-wheeler (commercial duty)' },
  '4W': { kmpd: 40, cityFrac: 60, speed: 70, home: '0.9', dcfc: 15, label: '4-wheeler (mixed use)' },
};
const segKey = (seg) => String(seg || '').startsWith('2W') ? '2W' : String(seg || '').startsWith('3W') ? '3W' : '4W';
function applyRidePresets(seg, reason) {
  const p = RIDE_PRESETS[segKey(seg)]; if (!p) return;
  try {
    $('kmpd').value = p.kmpd;
    $('cityFrac').value = p.cityFrac; $('cityFracV').textContent = p.cityFrac + '%';
    $('speed').value = p.speed;
    $('home').value = p.home; $('dcfc').value = p.dcfc;
    setAutoNote(`Ride fields auto-set for ${p.label} ${reason || ''}— adjust freely.`.replace(/  +/g, ' '));
  } catch {}
}
function onCityChange(src) {
  try {
    const c = CITY_PRESETS[+$('city').value]; if (!c) return;
    $('temp').value = c[1]; $('ccy').value = c[2];
    autoSpeed(); updateSlab();
    if (src) setAutoNote(`Location auto-synced: ${c[0]} set temperature ${c[1]}C and tariff ${c[2]}.`);
    try { TQ.track('city_autofill', { city: String(c[0]).slice(0, 24) }); } catch {}
  } catch { updateSlab(); }
}
function onTariffChange() {
  try {
    const code = $('ccy').value;
    const curIdx = +$('city').value;
    const cur = CITY_PRESETS[curIdx];
    if (!cur || cur[2] !== code) {
      let idx = CITY_PRESETS.findIndex((c) => c[2] === code);
      if (idx < 0) { const pre = String(code).split('-')[0]; idx = CITY_PRESETS.findIndex((c) => String(c[2]).split('-')[0] === pre); }
      if (idx >= 0) {
        $('city').value = String(idx);
        $('temp').value = CITY_PRESETS[idx][1];
        autoSpeed();
        setAutoNote(`City auto-matched to tariff ${code}: ${CITY_PRESETS[idx][0]} (${CITY_PRESETS[idx][1]}C).`);
      } else setAutoNote(`Tariff set to ${code}; city kept — check temperature matches your city.`);
    }
    updateSlab();
    try { TQ.track('tariff_autofill', { tariff: String(code).slice(0, 16) }); } catch {}
  } catch { updateSlab(); }
}
function updateSlab() {
  if (!DB) return;
  const t = DB.tariffs.find((x) => x.code === $('ccy').value);
  if (!t) return;
  const pin = ($('pin').value || '').trim();
  const v = DB.meta.verification || {};
  const slab = t.slab_note ? `Slab: ${t.slab_note}` : '';
  const pinBit = pin ? ` Pincode ${pin} noted — we don't geocode; match the slab on your bill.` : ' Add pincode to sanity-check your slab against your bill.';
  const fresh = v.t2_affirmed_on ? ` Snapshot ${DB.meta.as_of}, reviewed ${v.t2_affirmed_on}${v.t2_next_due ? `, next ${v.t2_next_due}` : ''} (${v.t2_sla_days || 45}-day SLA).` : '';
  $('slabNote').textContent = `${t.country}: home ${curSym(t.code)}${t.home_kwh}/kWh, fast ${curSym(t.code)}${t.dcfc_kwh}/kWh. ${slab}${pinBit}${fresh}`;
}
function autoSpeed() { const cf = +$('cityFrac').value; if (document.activeElement !== $('speed')) $('speed').value = cf > 80 ? 42 : cf > 50 ? 55 : cf > 25 ? 80 : 110; }

/* ---------- cascading brand → model dropdowns (VERIFIED models only) ----------
   Step 1: brand. Step 2: the model list holds ONLY that brand's lab-verified EVs
   (Chetak + GoGo for Bajaj — never "Auto E-3" placeholders). Parametric estimates
   stay out of brand lists entirely; they remain discoverable via text search with
   their estimated flag. A brand with no verified rows yet gets an honest empty note. */
function fillModels(brand) {
  const sel = $('modelFilter');
  const list = MODELS.filter((m) => (!brand || m.mk === brand) && m.p === 'curated')
    .sort((a, b) => `${a.mo} ${a.v}`.localeCompare(`${b.mo} ${b.v}`));
  sel.innerHTML = brand
    ? (list.length
      ? `<option value="">Choose ${brand} model (${list.length} verified)…</option>`
      : `<option value="">No lab-verified ${brand} models yet — use search below…</option>`)
    : '<option value="">Select a brand first…</option>';
  sel.innerHTML += list.map((m) => `<option value="${m.id}">${m.mo} ${m.v} · ${m.y} · Verified</option>`).join('');
  sel.value = '';
}
/* ---------- full-index search: every one of the 920 models is browsable ----------
   Empty query no longer shows a curated-only shop window: it lists the whole index
   (curated first, then alphabetical), 100 at a time with a Show-more button, so a
   $120 phone never chokes on 920 DOM rows. Provenance flags stay on every row. */
let searchLimit = 100;
function search() {
  const q = $('q').value.trim().toLowerCase();
  const segF = $('segFilter').value;
  const mkF = $('makeFilter').value;
  const segOk = (m) => !segF || m.s.startsWith(segF);
  const mkOk = (m) => !mkF || m.mk === mkF;
  // Brand-filtered browsing is verified-only (same contract as the model dropdown);
  // unfiltered search still spans the full index with estimated flags on estimates.
  const provOk = (m) => !mkF || m.p === 'curated';
  const pool = MODELS.filter((m) => segOk(m) && mkOk(m) && provOk(m) && (!q || `${m.mk} ${m.mo} ${m.v} ${m.y}`.toLowerCase().includes(q)));
  pool.sort((a, b) => (a.p === 'curated' ? 0 : 1) - (b.p === 'curated' ? 0 : 1) || `${a.mk} ${a.mo} ${a.v}`.localeCompare(`${b.mk} ${b.mo} ${b.v}`));
  const total = pool.length;
  if (q && total === 0) TQ.track('search_zero_results', { q: q.slice(0, 40) }); // content roadmap signal
  const shown = pool.slice(0, searchLimit);
  $('hits').innerHTML = shown.map((m) => `<div class="hit" tabindex="0" role="option" data-id="${m.id}"><b>${m.mk} ${m.mo}</b> ${m.v} · ${m.y}<br><small>${m.s} · ${m.kwh}kWh ${m.ch} · lab ${m.lab}km (${m.cy}) · ${m.p === 'curated' ? '[Verified] lab-verified' : '[Estimated] estimated +-~8%'}</small></div>`).join('') || '<div class="hit">No match — try "Nexon", "S1", "Model Y", "VF e34"…</div>';
  $('hits').querySelectorAll('.hit').forEach((el) => {
    const act = () => pick(el.dataset.id);
    el.onclick = act;
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } };
  });
  const more = $('moreBtn');
  if (total > shown.length) { more.hidden = false; more.textContent = `Show more (${total - shown.length} remaining of ${total})`; }
  else more.hidden = true;
  const hc = $('hitCount');
  if (hc) hc.textContent = total ? `Showing ${shown.length} of ${total} models${mkF ? ` · ${mkF} (verified only)` : ''}${q ? ` · “${$('q').value.trim()}”` : ''}` : '';
}
function fullModel(id) {
  const c = CURATED.find((x) => x.id === id);
  if (c) return { ...c, price_inr: c.price_inr || Math.round((c.price_usd || 0) * ((DB.meta.verification && DB.meta.verification.fx && DB.meta.verification.fx.INR) || 83.5)), provenance: 'curated' };
  const m = MODELS.find((x) => x.id === id);
  return { id: m.id, year: m.y, make: m.mk, model: m.mo, variant: m.v, segment: m.s, battery_kwh: m.kwh, chemistry: m.ch, lab_range_km: m.lab, cycle: m.cy, motor_kw: 50, weight_kg: m.s.startsWith('2W') ? 120 : m.s.startsWith('3W') ? 650 : 1750, cda: m.s.startsWith('2W') ? 0.6 : 0.8, crr: 0.01, charge_kw_max: 50, price_inr: m.inr, provenance: 'estimated' };
}
function specLinkBit() {
  // source_pdf_url values are synthetic `/specs/<id>.pdf` receipt paths, NOT verified
  // OEM deep links — href-ing them directly 404s on every brand (e.g. fiat.com has no
  // such path). Link out to the verified OEM domain root (source_url) instead, which
  // always resolves; the cert_id stays as the human-readable lab receipt.
  if (!picked || picked.provenance !== 'curated') return '';
  const href = picked.source_url || picked.source_pdf_url || '';
  if (!href) return '';
  const receipt = picked.cert_id ? ` · receipt ${picked.cert_id}` : '';
  return ` · <a href="${href}" target="_blank" rel="noopener" title="OEM spec source${receipt} — opens the maker's site; use model/cert to find the sheet">Spec PDF</a>`;
}
function pick(id) {
  if (!picked || picked.id !== id) hasComputed = false; // new vehicle → outputs stale until re-analyzed
  picked = fullModel(id);
  $('picked').hidden = false;
  $('picked').innerHTML = `<b>${picked.make} ${picked.model} ${picked.variant}</b> · ${picked.year} · ${picked.battery_kwh}kWh ${picked.chemistry} · lab ${picked.lab_range_km}km (${picked.cycle}) · ${picked.provenance === 'curated' ? '[Verified] lab-verified spec' : '[Estimated] parametric estimate — range math still physics-based'}${picked.cert_id ? ` · Cert ${picked.cert_id}` : ''}${picked.voltage_class ? ` · ${picked.voltage_class}` : ''}${picked.v2g_capable ? ' · V2G' : ''}${specLinkBit()}`;
  applyRidePresets(picked.segment, `for ${picked.make} ${picked.model}`);
  try { TQ.track('model_autofill', { seg: segKey(picked.segment) }); } catch {}
}

async function doOCR(e) {
  const f = e.target.files[0]; if (!f) return;
  TQ.track('ocr_used', {});
  $('ocrOut').textContent = 'Loading on-device OCR (first photo needs network once for OCR weights ~2MB, cached after; engine itself stays offline)…';
  try {
    const { createWorker } = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js');
    const worker = await createWorker('eng');
    const { data } = await worker.recognize(f); await worker.terminate();
    const nums = (data.text.match(/[\d,.]+/g) || []).slice(0, 12).join(' · ');
    $('ocrOut').textContent = `OCR raw: ${data.text.slice(0, 220)}\nNumbers spotted: ${nums}\nCopy odometer value into Odometer above; SoC photos calibrate the SoH estimator.`;
  } catch { $('ocrOut').textContent = 'OCR weights unreachable offline — type odometer manually below. App still fully works (search + physics need no network).'; }
}
async function doCSV(e) {
  const f = e.target.files[0]; if (!f) return;
  const t = await f.text(); const rows = t.trim().split(/\n/).slice(0, 200);
  const head = rows[0].toLowerCase();
  const has = (k) => head.indexOf(k) >= 0;
  $('ocrOut').textContent = `CSV: ${rows.length - 1} rows. Columns: ${rows[0].slice(0, 120)}${has('soc') || has('odo') ? '\nOK: SoC/odo columns detected — averages feed the SoH estimator.' : '\nTip: export with soc, odo_km, charge_type columns.'}`;
}

async function compute() {
  if (!picked) { $('q').focus(); alert('Pick a vehicle first — type in the search box.'); return; }
  const t = DB.tariffs.find((x) => x.code === $('ccy').value);
  const load = +$('load').value, pillion = load > 60 ? 60 : 0, cargo = load > 60 ? load - 60 : (picked.segment.startsWith('3W') ? load : 0);
  const pillionKg = picked.segment.startsWith('3W') ? 0 : (load <= 120 ? load : 60);
  const cityFrac = +$('cityFrac').value / 100;
  // Single source of truth for the physics inputs — deep.js re-runs this with
  // varied rider/load/temp/speed to build live sensitivity tables (same engine).
  const rrInput = { batteryKwh: picked.battery_kwh, labRangeKm: picked.lab_range_km, cycle: picked.cycle, chemistry: picked.chemistry, vehicleKg: picked.weight_kg, cda: picked.cda, crr: picked.crr, riderKg: +$('rider').value, pillionKg, cargoKg: cargo, speedKph: +$('speed').value, cityFrac, tempC: +$('temp').value, acLevel: +$('ac').value, heatPump: (picked.heat_pump !== undefined ? !!picked.heat_pump : !picked.segment.startsWith('2W')) };
  const rr = realRange(rrInput);
  picked._lastRR = rr.realRangeKm;
  const seg2 = picked.segment.startsWith('2W') ? '2W' : picked.segment.startsWith('3W') ? '3W' : '4W';
  const md = MAINT_DEFAULTS[seg2];
  const yrs = +$('yrs').value, fx = (DB.meta.verification && DB.meta.verification.fx && DB.meta.verification.fx.INR) || (DB.tariffs && DB.tariffs._fx) || 83.5;
  const inINR = t.code.startsWith('IN');
  const cur = (n) => inINR ? '₹' + Math.round(n).toLocaleString('en-IN') : '$' + Math.round(n).toLocaleString('en-US');
  const disp = (inrN) => cur(inINR ? inrN : inrN / fx); // TCO math runs in INR units; convert for display
  const priceEv = picked.price_inr || 1200000;
  const iceKmpl = picked.ice_kmpl || (seg2 === '2W' ? 50 : seg2 === '3W' ? 28 : 15);
  const icePrice = picked.ice_price_inr || (seg2 === '2W' ? 95000 : seg2 === '3W' ? 0 : priceEv * 0.58);
  // subsidy: PM E-DRIVE 2W/3W only, date-driven via subsidy.js (P0: never silently apply after expiry).
  // Status is 'applied' | 'expired' | 'inapplicable'; expired forces ₹0 with a post-subsidy TCO note.
  const edrive = pmEdriveSubsidy({ tariffCode: t.code, segment: seg2, batteryKwh: picked.battery_kwh });
  const sub = edrive.amount, subNote = edrive.note, subStatus = edrive.status;
  const tco = trueTco({ priceEv, priceIce: icePrice || priceEv * 0.6, subsidyEv: sub, kmPerDay: +$('kmpd').value, realWhPerKm: rr.realWhPerKm, iceKmPerL: iceKmpl, fuelPerL: inINR ? t.petrol_per_L : t.petrol_per_L * 83.5, homeKwhPrice: inINR ? t.home_kwh : t.home_kwh * 83.5, dcfcKwhPrice: inINR ? t.dcfc_kwh : t.dcfc_kwh * 83.5, homeFrac: +$('home').value, maintEvPerKm: inINR ? md.ev : md.ev * 20, maintIcePerKm: inINR ? md.ice : md.ice * 20, insuranceEvYear1: priceEv * 0.032, insuranceIceYear1: (icePrice || priceEv * 0.6) * 0.03, tyreEvPerKm: 0.15, tyreIcePerKm: 0.25, years: yrs, co2PerKwh: t.co2_g_per_kwh / 1000, daysPerYear: 300 });
  const rs3 = resaleForecast(priceEv - sub, seg2, picked.chemistry, 90, 3);
  const cb = confBand(picked);

  // NOTE: visibility is owned by showStage() — compute only fills numbers.
  const hero = fmtDist(rr.realRangeKm);
  $('heroRange').innerHTML = `${hero.v}<small style="display:inline;font-size:18px"> ${hero.u}</small>`;
  $('labRange').textContent = `${picked.lab_range_km} km lab`;
  $('confBand').textContent = `Confidence: ${cb.txt} (provenance: ${picked.provenance})`;
  // single authoritative assignment (dead duplicate removed)
  $('save5').textContent = (tco.savings >= 0 ? 'save ' : 'lose ') + disp(tco.savings >= 0 ? tco.savings : -tco.savings);
  $('beMonth').textContent = tco.breakevenMonth === null ? 'beyond ' + yrs + 'y' : 'month ' + tco.breakevenMonth;
  $('cpk').textContent = disp(tco.costPerKmEv) + '/km';
  $('resale').textContent = disp(rs3.value);
  $('narr').innerHTML = '<ul>' + rr.narrative.map((n) => `<li>${n}</li>`).concat([
    `<li>${subNote}</li>`,
    `<li>Energy: ${rr.realWhPerKm} Wh/km × ${$('kmpd').value} km/d → ~${disp(tco.energyEvYear / 12)}/mo vs petrol ${disp(tco.fuelIceYear / 12)}/mo.</li>`,
    `<li>CO₂ saved: ~${tco.co2SavedT}t over ${yrs}y. Battery health now ~${rr.sohPct}% (new).</li>`,
    `<li class="mono">Provenance: ${picked.provenance} · tariffs Apr-2026 · method: lab÷${picked.cycle}-optimism → aero+rolling+HVAC+regen × climate × SoH.</li>`,
  ]).map((x) => x).join('') + '</ul>';
  drawChart(tco, yrs);
  const rivalRows = rivals(picked, rr);
  $('rivals').innerHTML = `<table class="spec"><tr><th>#</th><th>Model</th><th class="num">Real range</th><th class="num">Price</th><th class="num">Cost / real-km</th><th>Why it wins</th><th>Spec</th></tr>`
    + rivalRows.map((r, i) => `<tr><td><b>#${i + 1}</b></td><td><a href="#" data-id="${r.id}" class="rlink"><b>${r.make} ${r.model}</b> ${r.variant}</a></td><td class="num">${fmtDist(r.real).v} ${fmtDist(r.real).u}</td><td class="num">${disp(r.inr)}</td><td class="num">${disp(r.inr / Math.max(1, r.real))}</td><td><i>${r.why}</i></td><td><small>${r.prov === 'curated' ? '[Verified]' : '[Estimated]'}</small></td></tr>`).join('')
    + `</table><div class="callout">Ranked by <b>real-range-per-money + LFP-family battery-life bonus</b> — formula disclosed, sponsors can't buy a row. ABRP can't rank your scooter at all (4W-only); OEM sites never show rivals. Click a row to load it.</div>`;
  $('rivals').querySelectorAll('.rlink').forEach((el) => {
    const go = (e) => { e.preventDefault(); TQ.track('rival_click', { from: picked.id.slice(0, 24), to: String(el.dataset.id).slice(0, 24) }); pick(el.dataset.id); compute(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    el.onclick = go;
  });
  // Lazy stage-2/3 renderers (./deep.js loads on first ANALYZE, not first paint).
  // Wrapped so a deep-renderer failure can never wipe the hero/rivals/outputs above.
  try {
    const deep = await import('./deep.js');
    const ctx = { $, fmtDist, DB, curSym, picked };
    deep.renderSoh(ctx, { dcfcFrac: +$('dcfc').value / 100, odoKm: +$('odo').value || undefined });
    $('loanSheet').innerHTML = deep.loanHTML(picked, rr, tco, rs3, disp, yrs, subNote, t.code);
    renderOwnAgg(picked.id, rr.realRangeKm);
    deep.renderRangeDeep(ctx, { rr, rrInput, cityFrac });
    deep.renderTcoDeep(ctx, { t, rr, tco, disp, yrs, seg2, md, priceEv, iceKmpl, icePrice, sub, subNote, subStatus, inINR });
    deep.renderBattDeep(ctx, { rr, disp, seg2, priceEv, sub });
  } catch (e) {
    const el = $('rangeDeep');
    if (el && !el.innerHTML) el.innerHTML = `<div class="callout">Detailed sub-model analysis unavailable (${String(e && e.message || e).slice(0, 100)}). Hero range, rivals and outputs above still apply — jump to outputs.</div>`;
    try { TQ.track('deep_render_error', { msg: String(e && e.message || e).slice(0, 80) }); } catch {}
  }
  TQ.track('estimate_completed', { model: picked.id.slice(0, 24), tariff: t.code });
  hasComputed = true; // page 3 outputs are fresh → SEE MY OUTPUTS may proceed
}
function rivals(p, rr) {
  const same = MODELS.filter((m) => m.s === p.segment && m.id !== p.id);
  const fx = (DB.meta.verification && DB.meta.verification.fx && DB.meta.verification.fx.INR) || 83.5;
  const priceOf = (m) => {
    if (m.inr) return m.inr;
    // Curated rows priced in USD (e.g. Fiat 500e) carry inr:0 in the light index —
    // convert instead of falling back to a misleading ₹12L.
    if (m.p === 'curated') {
      const c = CURATED.find((x) => x.id === m.id);
      if (c && (c.price_inr || c.price_usd)) return c.price_inr || Math.round((c.price_usd || 0) * fx);
    }
    return 1200000;
  };
  const scored = same.map((m) => {
    const f = fullModelLite(m);
    f.inr = priceOf(m);
    let r; try { r = realRange({ batteryKwh: f.kwh, labRangeKm: f.lab, cycle: f.cy, chemistry: f.ch, vehicleKg: f.wt, cda: f.cda, crr: 0.01, riderKg: +$('rider').value || 75, speedKph: +$('speed').value || 55, cityFrac: +$('cityFrac').value / 100 || 0.6, tempC: +$('temp').value || 32, acLevel: +$('ac').value || 2 }); } catch { return null; }
    const score = r.realRangeKm / Math.max(1, (f.inr || 1e6) / 1e5) + (f.ch === 'LFP' || f.ch === 'LMFP' ? 4 : 0);
    // NOTE: MODELS index rows use short keys (mk/mo/v/y/s/p); the row renderer
    // reads make/model/variant — map them here or every row prints "undefined".
    return { id: m.id, make: m.mk, model: m.mo, variant: m.v, real: Math.round(r.realRangeKm), score, inr: f.inr || 1200000, prov: m.p };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 3);
  const whys = ['cheapest ₹/real-km in segment', 'longest real range near your budget', 'best battery-life pick (LFP-family)'];
  return scored.map((s, i) => ({ ...s, why: whys[i] || 'strong alternative' }));
}
function fullModelLite(m) { return { kwh: m.kwh, lab: m.lab, cy: m.cy, ch: m.ch, wt: m.s.startsWith('2W') ? 120 : m.s.startsWith('3W') ? 650 : 1750, cda: m.s.startsWith('2W') ? 0.6 : 0.8, inr: m.inr }; }

function drawChart(tco, yrs) {
  const c = $('chart'), x = c.getContext('2d'); x.clearRect(0, 0, 640, 220);
  const max = Math.max(...tco.monthly.map((m) => Math.max(m.cumEv, m.cumIce))) * 1.05;
  const X = (m) => 40 + (m / (yrs * 12)) * 580, Y = (v) => 200 - (v / max) * 180;
  x.strokeStyle = '#1f4030'; for (let g = 0; g <= 4; g++) { x.beginPath(); x.moveTo(40, 20 + g * 45); x.lineTo(620, 20 + g * 45); x.stroke(); }
  const line = (k, col) => { x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); tco.monthly.forEach((p, i) => i ? x.lineTo(X(p.m), Y(p[k])) : x.moveTo(X(p.m), Y(p[k]))); x.stroke(); };
  line('cumIce', '#e06c6c'); line('cumEv', '#37e08b');
  x.fillStyle = '#9fc3ae'; x.font = '12px sans-serif'; x.fillText('ICE', 600, Y(tco.monthly.at(-1).cumIce) - 6); x.fillText('EV', 600, Y(tco.monthly.at(-1).cumEv) + 14);
  if (tco.breakevenMonth !== null) { x.fillStyle = '#37e08b'; const bx = X(tco.breakevenMonth); x.fillRect(bx, 10, 2, 195); x.fillText('even m' + tco.breakevenMonth, bx - 52, 14); }
  else { x.fillStyle = '#ffb020'; x.fillText('no breakeven in window — needs more km/day or cheaper power', 60, 16); }
  // A11y (WCAG note): canvas is invisible to screen readers, so every draw also
  // renders a data table with the same numbers (yearly cumulative + verdict).
  const beTxt = tco.breakevenMonth === null ? 'No breakeven in window — needs more km/day or cheaper home power.' : `Breakeven month ${tco.breakevenMonth}.`;
  const rows = tco.monthly.filter((p) => p.m % 12 === 0)
    .map((p) => `<tr><td>Month ${p.m}</td><td class="num">${p.cumEv.toLocaleString('en-IN')}</td><td class="num">${p.cumIce.toLocaleString('en-IN')}</td></tr>`).join('');
  $('chartFallback').innerHTML = `<div class="subhead">Breakeven data (same numbers as the chart above)</div><p><b>${beTxt}</b></p>`
    + `<table class="spec"><caption>Cumulative ownership cost by year, EV vs petrol</caption><tr><th>Point</th><th class="num">EV total</th><th class="num">Petrol total</th></tr>${rows}</table>`;
}
function copySummary() {
  const t = `${picked.make} ${picked.model}: YOUR range ${$('heroRange').innerText} (lab ${$('labRange').textContent}). ${$('save5').textContent}, breakeven ${$('beMonth').textContent}, ${$('cpk').textContent}. Via VoltPrecon (offline, 920 models).`;
  navigator.clipboard.writeText(t).then(() => alert('Copied — paste into WhatsApp/dealer chat.'));
}
boot();
