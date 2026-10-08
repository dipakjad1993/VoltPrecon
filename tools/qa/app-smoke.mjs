// VoltPrecon app smoke test — boots the REAL apps/web/app.js with stubbed browser
// globals and drives pick -> REVEAL end-to-end. Catches ReferenceErrors / wiring
// regressions that engine unit tests cannot see (e.g. the loanHTML `t` crash).
// Zero-dep. Run: node tools/qa/app-smoke.mjs (exit 1 on any failure; CI runs it)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __d = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__d, '../..');
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) fails.push(name); };

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.window = globalThis;
globalThis.location = { search: '', href: 'http://localhost/' };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.alert = () => {};

const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/web/data.bundle.json'), 'utf8'));
const firstId = bundle.models_index[0].id;
globalThis.fetch = async (url) => {
  if (String(url).includes('data.bundle.json')) return { ok: true, status: 200, json: async () => bundle };
  return { ok: true, status: 200, json: async () => ({}) };
};

const ctx2d = new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
function makeEl(id) {
  const el = {
    id, value: '', textContent: '', innerHTML: '', hidden: true,
    dataset: {}, style: {}, _attrs: {},
    setAttribute: (k, v) => { el._attrs[k] = String(v); },
    getAttribute: (k) => (k in el._attrs ? el._attrs[k] : null),
    removeAttribute: (k) => { delete el._attrs[k]; },
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    focus: () => {}, scrollIntoView: () => {}, click: () => {},
    getContext: () => ctx2d,
    querySelectorAll: (sel) => {
      if (id === 'hits' && sel === '.hit') {
        if (!el._fakeHit) { el._fakeHit = makeEl('fake-hit'); el._fakeHit.dataset.id = firstId; }
        return [el._fakeHit];
      }
      return [];
    },
  };
  return el;
}
function makeElWithKids(id) {
  const el = makeEl(id);
  el._kids = {};
  el.querySelector = (sel) => (el._kids[sel] || (el._kids[sel] = { textContent: '' }));
  return el;
}
const defaults = { temp: '32', kmpd: '40', cityFrac: '60', speed: '55', rider: '75', load: '0', ac: '2', home: '0.9', dcfc: '15', yrs: '5', odo: '', q: '', ccy: 'IN-MH', city: '0', pin: '', units: 'km', segFilter: '', ownRange: '', ownCond: 'mixed', lang: 'en' };
const els = {};
globalThis.document = {
  documentElement: { dataset: {}, lang: 'en' },
  getElementById: (id) => {
    if (!els[id]) {
      els[id] = (id === 'themeToggle' ? makeElWithKids(id) : makeEl(id));
      if (id in defaults && els[id].value === '') els[id].value = defaults[id];
    }
    return els[id];
  },
  querySelectorAll: () => [],
};
process.on('unhandledRejection', (e) => { console.error('FAIL  unhandled rejection: ' + (e && e.stack || e)); process.exit(1); });

await import(pathToFileURL(path.join(ROOT, 'apps/web/app.js')).href);
await new Promise((r) => setTimeout(r, 500));

ok((els.dbMeta && els.dbMeta.textContent || '').includes('920 models'), 'boot loads 920-model DB + provenance line');
ok((els.dbMeta.textContent || '').includes('reviewed'), 'dbMeta shows tariff review stamp (honest freshness)');
ok((els.makeFilter.innerHTML || '').includes('Tata') && (els.makeFilter.innerHTML || '').includes('All makes'), 'make filter lists every company in the index');
ok((els.hitCount.textContent || '').includes('920'), 'empty search browses the FULL 920-model index (not curated-only)');
ok(els.moreBtn.hidden === false && /remaining of 920/.test(els.moreBtn.textContent), 'show-more pagination for the full list (perf-safe on low-end phones)');
// brand -> model cascade: choosing Tata fills the model dropdown with Tata-only VERIFIED EVs.
// Non-vacuous: resolve every option VALUE back to the bundle and assert make + curated.
const byId = new Map(bundle.models_index.map((m) => [m.id, m]));
els.makeFilter.value = 'Tata'; els.makeFilter.onchange();
const optValsTata = [...(els.modelFilter.innerHTML || '').matchAll(/value="([^"]+)"/g)].map((x) => x[1]).filter(Boolean);
const tataReal = bundle.models_index.filter((m) => m.mk === 'Tata' && m.p === 'curated').map((m) => m.id);
ok(optValsTata.length === tataReal.length && optValsTata.length > 0 && optValsTata.every((id) => byId.get(id)?.mk === 'Tata' && byId.get(id)?.p === 'curated'), `model dropdown holds ONLY verified Tata EVs (${optValsTata.length}/${tataReal.length})`);
// Bajaj contract (the reported bug): Chetak + GoGo only — zero placeholders
els.makeFilter.value = 'Bajaj'; els.makeFilter.onchange();
const optValsBajaj = [...(els.modelFilter.innerHTML || '').matchAll(/value="([^"]+)"/g)].map((x) => x[1]).filter(Boolean);
const bajajNames = optValsBajaj.map((id) => byId.get(id)).map((m) => `${m.mo} ${m.v}`);
ok(optValsBajaj.length === 6 && optValsBajaj.every((id) => byId.get(id)?.p === 'curated') && /C2501/.test(bajajNames.join('|')) && /C3501/.test(bajajNames.join('|')) && /GoGo/.test(bajajNames.join('|')), `Bajaj list is exactly its real models: ${bajajNames.join(' ; ')}`);
els.makeFilter.value = 'Tata'; els.makeFilter.onchange();
// hits list under a brand filter must be verified-only and brand-pure too
const hitIds = [...(els.hits.innerHTML || '').matchAll(/data-id="([^"]+)"/g)].map((x) => x[1]);
ok(hitIds.length > 0 && hitIds.every((id) => byId.get(id)?.mk === 'Tata' && byId.get(id)?.p === 'curated'), `search hits verified-only under Tata filter (${hitIds.length} rows)`);
// estimated placeholder names must never borrow real OEM badges (the Bajaj Swift-E class)
const bad = bundle.models_index.filter((m) => m.p === 'estimated' && /city|swift|spark|bolt|volt|pulsar|activa|jupiter|chetak|nexon|creta|atto|seal|ioniq|model|s1\b|roadster|f77|rv400|mantis|nexus|indie|mache|taycan|seagull|xuv400|windsor|comet/i.test(`${m.mo} ${m.v}`));
ok(bad.length === 0, `no estimated row borrows a real OEM badge (${bad.length} offenders)`);
const tataId = tataReal[0];
els.modelFilter.value = tataId; els.modelFilter.onchange();
ok(/Tata/.test(els.picked.innerHTML), 'picking from the model dropdown loads the card');
ok(els.step1 && els.step1.hidden === false && els.out.hidden === true, 'stage 1 visible, stages 2/3 hidden on boot');
ok(typeof (els.go && els.go.onclick) === 'function', 'ANALYZE button wired');
ok(typeof (els.themeToggle && els.themeToggle.onclick) === 'function', 'theme toggle wired');

const hit = els.hits.querySelectorAll('.hit')[0];
let pickErr = null;
try { hit.onclick(); } catch (e) { pickErr = e; }
ok(!pickErr && /Ather|lab-verified|estimated/.test(els.picked.innerHTML), 'pick renders model card');

let computeErr = null;
try { await els.go.onclick(); } catch (e) { computeErr = e; }
ok(!computeErr, 'ANALYZE runs without crash: ' + (computeErr ? String(computeErr).slice(0, 120) : 'clean'));
ok(els.stage2sec && els.stage2sec.hidden === false && els.out.hidden === true, 'stage 2 (analysis) shown, stage 3 hidden');
ok((els.rangeDeep.innerHTML || '').length > 1500, `stage2 range deep-dive rendered (${(els.rangeDeep.innerHTML || '').length}B)`);
ok((els.tcoDeep.innerHTML || '').length > 1500, `stage2 tco deep-dive rendered (${(els.tcoDeep.innerHTML || '').length}B)`);
ok((els.battDeep.innerHTML || '').length > 500, `stage2 battery analysis rendered (${(els.battDeep.innerHTML || '').length}B)`);

let navErr = null;
try {
  els.backTo1.onclick();
  ok(els.step1.hidden === false && els.stage2sec.hidden === true, 'back-to-inputs works');
  await els.go.onclick();
  els.toStage3.onclick();
} catch (e) { navErr = e; }
ok(!navErr, 'stage navigation works: ' + (navErr ? String(navErr).slice(0, 120) : 'clean'));
ok(els.out && els.out.hidden === false && els.stage2sec.hidden === true, 'stage 3 (outputs) shown');
ok((els.resaleTbl.innerHTML || '').includes('Year 3'), 'stage3 resale table rendered');
ok((els.rivals.innerHTML || '').includes('<table'), 'rivals rendered as ranked table');
ok((els.loanSheet.innerHTML || '').includes('loan summary'), 'loan PDF sheet rendered (was ReferenceError crash)');
ok((els.loanSheet.innerHTML || '').includes('Illustrative estimate'), 'loan sheet carries jurisdiction-aware disclaimer');
ok((els.confBand.textContent || '').includes('Confidence'), 'confidence band rendered');
ok((els.chartFallback.innerHTML || '').includes('Breakeven'), 'canvas chart has data-table fallback (WCAG)');
ok((els.themeToggle._kids && /Light|Dark/.test(els.themeToggle._kids['.theme-label'].textContent)), 'theme toggle has text label (WCAG, not emoji-only)');
// P0 subsidy-expiry regression: post-expiry run must show expired ₹0, never negative countdowns
ok((els.tcoDeep.innerHTML || '').includes('PM E-DRIVE'), 'subsidy box rendered');
ok(!(els.tcoDeep.innerHTML || '').match(/-\d+ days/), 'no negative-day subsidy countdown (P0 expiry bug)');
ok((els.narr.innerHTML || '').includes('PM E-DRIVE'), 'narrative carries subsidy state (applied or expired)');

if (fails.length) { console.error(`SMOKE FAILED: ${fails.length} checks`); process.exit(1); }
console.log('SMOKE OK — pick -> REVEAL -> A/B/C outputs all render');
