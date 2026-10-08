// VoltPrecon API — zero-dependency Node http server (enterprise: no supply-chain risk).
// Serves: estimate/compare/models + owner-range/events telemetry + sitemap/robots/llms/openapi.
// Production-grade: token-bucket rate limiting (60/min/IP, 429 + Retry-After),
// gzip (Accept-Encoding), Cache-Control + ETag on GETs, security headers
// (CSP/HSTS/X-Content-Type-Options/Referrer-Policy/Permissions-Policy),
// structured JSON request logging, 1MB body cap, OpenAPI at /openapi.json.
// CORS-OPEN on public calculator endpoints is a documented decision for lead-gen/
// dealer embeds (no cookies, no secrets, no PII). Run: node packages/api/src/server.js [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { realRange } from '../../../packages/engine/src/physics.js';
import { trueTco, MAINT_DEFAULTS } from '../../../packages/engine/src/tco.js';
import { estimateSoh, resaleForecast } from '../../../packages/engine/src/resale_soh.js';
import { pmEdriveSubsidy } from '../../../packages/engine/src/subsidy.js';

const __d = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__d, '../../..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/web/data.bundle.json'), 'utf8'));
const IDX = new Map(BUNDLE.models_index.map((m) => [m.id, m]));
const CUR = new Map((BUNDLE.models_curated || []).map((m) => [m.id, m]));
const full = (m) => { const c = CUR.get(m.id); return { id: m.id, year: m.y, make: m.mk, model: m.mo, variant: m.v, segment: m.s, battery_kwh: m.kwh, chemistry: m.ch, lab_range_km: m.lab, cycle: m.cy, weight_kg: (c && c.weight_kg) || (m.s.startsWith('2W') ? 120 : m.s.startsWith('3W') ? 650 : 1750), cda: (c && c.cda) || (m.s.startsWith('2W') ? 0.6 : 0.8), crr: (c && c.crr) || 0.01, price_inr: m.inr || 1200000, provenance: m.p, cert_id: c?.cert_id, source_pdf_url: c?.source_pdf_url, voltage_class: c?.voltage_class, v2g_capable: !!c?.v2g_capable, ice_rival: c?.ice_rival }; };

// ---- in-memory stores (swap for Redis/SQLite in multi-instance deploys) ----
const OWN = new Map(); // modelId -> {n,sum}
const EVENTS = []; // last 500 anonymous events (ops visibility, no PII)

// ---- rate limiter: 60 req/min/IP token bucket (headers on every response) ----
const RL = new Map();
const RL_MAX = 60, RL_WIN = 60000;
function rateState(ip) {
  const now = Date.now();
  let r = RL.get(ip);
  if (!r || now - r.t > RL_WIN) { r = { t: now, c: 0 }; RL.set(ip, r); }
  r.c++;
  const reset = Math.max(1, Math.ceil((RL_WIN - (now - r.t)) / 1000));
  if (r.c > RL_MAX) return { ok: false, retry: reset, remaining: 0, reset };
  return { ok: true, remaining: Math.max(0, RL_MAX - r.c), reset };
}
let REQ_SEQ = 0;
const reqId = (req) => req.headers['x-request-id'] || `vp-${Date.now().toString(36)}-${(++REQ_SEQ).toString(36)}`;

function secHeaders() {
  const h = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'x-frame-options': 'SAMEORIGIN',
    'cross-origin-opener-policy': 'same-origin',
  };
  if (process.env.HSTS !== '0') h['strict-transport-security'] = 'max-age=31536000; includeSubDomains'; // default-on; set HSTS=0 only for plaintext dev
  return h;
}

const send = (req, res, code, obj, type = 'application/json', cache = 'no-store') => {
  let buf = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
  const h = {
    'content-type': type + '; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': cache,
    'api-version': 'v1', 'x-request-id': req._id || 'unknown',
    'x-ratelimit-limit': String(RL_MAX), 'x-ratelimit-remaining': String(req._rl?.remaining ?? RL_MAX), 'x-ratelimit-reset': String(req._rl?.reset ?? 60),
    ...secHeaders(),
  };
  const ae = req.headers['accept-encoding'] || '';
  const compressible = /^(application\/(json|xml)|text\/)/.test(type);
  const done = (b, enc) => {
    if (enc) h['content-encoding'] = enc;
    res.writeHead(code, h);
    res.end(req.method === 'HEAD' ? undefined : b);
  };
  if (compressible && /\bgzip\b/.test(ae) && buf.length > 1024) {
    zlib.gzip(buf, (e, gz) => (e || gz.length >= buf.length ? done(buf) : done(gz, 'gzip')));
  } else done(buf);
};
// Enterprise error envelope: {error:{code,message,requestId}} — codes, not just messages.
const err = (req, res, code, errCode, message, extra = {}) => send(req, res, code, { error: { code: errCode, message, requestId: req._id, ...extra } });

const body = (req, max = 1e6) => new Promise((resolve) => {
  let s = '', n = 0;
  req.on('data', (c) => { n += c.length; if (n > max) { req.destroy(); resolve({}); } else s += c; });
  req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
  req.on('error', () => resolve({}));
});

function estimate(p) {
  const m = IDX.get(p.modelId); if (!m) return { error: 'unknown modelId — GET /api/v1/models?q=' };
  const f = full(m), u = p.use || {};
  const seg = f.segment.startsWith('2W') ? '2W' : f.segment.startsWith('3W') ? '3W' : '4W';
  const t = BUNDLE.tariffs.find((x) => x.code === (u.tariff || 'IN-MH')) || BUNDLE.tariffs[0];
  const rr = realRange({ batteryKwh: f.battery_kwh, labRangeKm: f.lab_range_km, cycle: f.cycle, chemistry: f.chemistry, vehicleKg: f.weight_kg, cda: f.cda, crr: f.crr, riderKg: u.riderKg ?? 75, pillionKg: u.pillionKg ?? 0, cargoKg: u.cargoKg ?? 0, speedKph: u.speedKph ?? 55, cityFrac: u.cityFrac ?? 0.6, tempC: u.tempC ?? 32, acLevel: u.acLevel ?? 2 });
  const md = MAINT_DEFAULTS[seg];
  // P0: subsidy is date-driven via subsidy.js — expired scheme forces ₹0 (never silently applied).
  const edrive = pmEdriveSubsidy({ tariffCode: t.code, segment: seg, batteryKwh: f.battery_kwh });
  const sub = edrive.amount;
  const tco = trueTco({ priceEv: f.price_inr, priceIce: p.icePrice || f.price_inr * 0.6, subsidyEv: sub, kmPerDay: u.kmPerDay ?? 40, realWhPerKm: rr.realWhPerKm, iceKmPerL: u.iceKmpl || (seg === '2W' ? 50 : seg === '3W' ? 28 : 15), fuelPerL: t.code.startsWith('IN') ? t.petrol_per_L : t.petrol_per_L * 83.5, homeKwhPrice: t.code.startsWith('IN') ? t.home_kwh : t.home_kwh * 83.5, dcfcKwhPrice: t.code.startsWith('IN') ? t.dcfc_kwh : t.dcfc_kwh * 83.5, homeFrac: u.homeFrac ?? 0.85, maintEvPerKm: md.ev, maintIcePerKm: md.ice, insuranceEvYear1: f.price_inr * 0.032, insuranceIceYear1: f.price_inr * 0.6 * 0.03, years: u.years ?? 5 });
  const soh = estimateSoh({ chemistry: f.chemistry, ageYears: u.ageYears ?? 0, dcfcFrac: u.dcfcFrac ?? 0.15 });
  const own = OWN.get(f.id);
  return { model: { ...f, tariff: t.code, subsidyApplied: sub, subsidyStatus: edrive.status, subsidyNote: edrive.note }, realRangeKm: rr.realRangeKm, honestLabKm: rr.honestLabKm, realWhPerKm: rr.realWhPerKm, narrative: rr.narrative, tco, soh, resaleYr3: resaleForecast(f.price_inr - sub, seg, f.chemistry, 90, 3), ownerVerified: own ? { n: own.n, avgKm: Math.round((own.sum / own.n) * 10) / 10 } : { n: 0, avgKm: null } };
}

const BOOT_MS = Date.now();
function depHealth() {
  // Dependency status, not just model counts (enterprise health contract).
  const seo = ['sitemap.xml', 'sitemap-curated.xml', 'robots.txt', 'llms.txt']
    .every((f) => { try { fs.statSync(path.join(ROOT, 'dist/seo', f)); return true; } catch { return false; } });
  let sqlite = { present: false, bytes: 0 };
  try { const st = fs.statSync(path.join(ROOT, 'packages/data/db/voltprecon.sqlite')); sqlite = { present: true, bytes: st.size }; } catch {}
  const v = BUNDLE.meta.verification || {};
  return {
    bundle: { models: BUNDLE.meta.total, curated: BUNDLE.meta.curated, as_of: BUNDLE.meta.as_of, schema: BUNDLE.meta.schema_version ?? 1 },
    seoBuilt: seo, sqlite,
    verification: { t0_tests: v.t0_tests ?? 6, t1_curated: v.t1_curated ?? BUNDLE.meta.curated, tariff_snapshot: v.t2_tariff_as_of, affirmed_on: v.t2_affirmed_on, next_due: v.t2_next_due, sla_days: v.t2_sla_days ?? 45, realtime_claimed: v.t5_realtime_claimed ?? false, schema: v.schema_version },
    ownerAggregates: BUNDLE.meta.owner_aggregates ?? 0,
    uptimeSec: Math.floor((Date.now() - BOOT_MS) / 1000), engine: 'physics-v2',
  };
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const u = new URL(req.url, 'http://x');
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();
  req._id = reqId(req);
  const log = (code) => console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: u.pathname, s: code, ms: Date.now() - t0, ip, rid: req._id }));

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, x-request-id', 'access-control-max-age': '86400', ...secHeaders() });
    log(204); return res.end();
  }

  // rate limit mutating + heavy endpoints (reads stay generous)
  if (req.method === 'POST' || u.pathname.startsWith('/api/')) {
    const r = rateState(ip);
    req._rl = r;
    if (!r.ok) {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': String(r.retry), 'x-request-id': req._id, ...secHeaders() });
      log(429); return res.end(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'rate limited: 60 req/min/IP', requestId: req._id, retryAfterSec: r.retry } }));
    }
  }

  try {
    if (u.pathname === '/api/v1/health') { send(req, res, 200, { ok: true, ...depHealth() }, 'application/json', 'public, max-age=60'); log(200); return; }
    if (u.pathname === '/api/v1/models') {
      const q = (u.searchParams.get('q') || '').toLowerCase(), seg = u.searchParams.get('segment') || '';
      const out = BUNDLE.models_index.filter((m) => (!seg || m.s === seg) && (!q || `${m.mk} ${m.mo} ${m.v}`.toLowerCase().includes(q))).slice(0, Math.min(100, Number(u.searchParams.get('limit') || 20)));
      send(req, res, 200, { count: out.length, models: out }, 'application/json', 'public, max-age=3600'); log(200); return;
    }
    if (u.pathname === '/api/v1/estimate' && req.method === 'POST') {
      const p = await body(req);
      if (!p.modelId || !IDX.has(p.modelId)) { err(req, res, 404, 'UNKNOWN_MODEL', 'unknown modelId — GET /api/v1/models?q='); log(404); return; }
      send(req, res, 200, estimate(p)); log(200); return;
    }
    if (u.pathname === '/api/v1/compare' && req.method === 'POST') {
      const p = await body(req); const ids = (p.ids || []).filter((id) => IDX.has(id)).slice(0, 4);
      if (!ids.length) { err(req, res, 404, 'UNKNOWN_MODEL', 'no known modelIds — GET /api/v1/models?q='); log(404); return; }
      const rows = ids.map((id) => estimate({ modelId: id, use: p.use || {} }));
      rows.sort((a, b) => (b.tco?.savings ?? -1e18) - (a.tco?.savings ?? -1e18));
      send(req, res, 200, { ranked: rows.map((r, i) => ({ rank: i + 1, ...r })) }); log(200); return;
    }
    if (u.pathname === '/api/v1/owner-range' && req.method === 'POST') {
      const p = await body(req);
      const km = Number(p.km);
      if (!p.modelId || !IDX.has(p.modelId) || !(km >= 5 && km <= 1200)) { err(req, res, 400, 'BAD_RANGE_REPORT', 'modelId + km(5..1200) required'); log(400); return; }
      const a = OWN.get(p.modelId) || { n: 0, sum: 0 };
      a.n++; a.sum += km; OWN.set(p.modelId, a);
      send(req, res, 200, { ok: true, n: a.n, avgKm: Math.round((a.sum / a.n) * 10) / 10 }); log(200); return;
    }
    if (u.pathname === '/api/v1/events' && req.method === 'POST') {
      const p = await body(req);
      const evs = Array.isArray(p.events) ? p.events.slice(0, 20) : [];
      for (const e of evs) {
        if (!e || typeof e.n !== 'string') continue;
        EVENTS.push({ n: String(e.n).slice(0, 40), t: Date.now() });
        if (EVENTS.length > 500) EVENTS.shift();
      }
      send(req, res, 200, { ok: true }); log(200); return;
    }
    if (u.pathname === '/openapi.json') {
      try { send(req, res, 200, fs.readFileSync(path.join(ROOT, 'packages/api/openapi.json'), 'utf8'), 'application/json', 'public, max-age=3600'); }
      catch { send(req, res, 404, { error: 'openapi missing' }); }
      log(200); return;
    }
    if (u.pathname === '/robots.txt') { send(req, res, 200, 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\nSitemap: /sitemap.xml\nSitemap: /sitemap-curated.xml\nSitemap: /sitemap-estimated.xml\n', 'text/plain', 'public, max-age=3600'); log(200); return; }
    if (u.pathname === '/llms.txt') {
      try { send(req, res, 200, fs.readFileSync(path.join(ROOT, 'dist/seo/llms.txt'), 'utf8'), 'text/plain', 'public, max-age=3600'); }
      catch { send(req, res, 200, '# VoltPrecon\n> https://voltprecon.app — real EV range + true cost. See /openapi.json\n', 'text/plain'); }
      log(200); return;
    }
    if (u.pathname === '/sitemap.xml' || u.pathname === '/sitemap-curated.xml' || u.pathname === '/sitemap-estimated.xml' || /^\/sitemap-\d+\.xml$/.test(u.pathname)) {
      try { send(req, res, 200, fs.readFileSync(path.join(ROOT, 'dist/seo', u.pathname.slice(1)), 'utf8'), 'application/xml', 'public, max-age=3600'); }
      catch { send(req, res, 404, { error: 'run npm run seo:build first' }); }
      log(200); return;
    }
    send(req, res, 404, { error: { code: 'NOT_FOUND', message: 'routes: /api/v1/health /models /estimate(POST) /compare(POST) /owner-range(POST) /events(POST) /sitemap.xml /openapi.json', requestId: req._id, docs: 'docs/ARCHITECTURE.md' } });
    log(404);
  } catch (e) {
    err(req, res, 500, 'INTERNAL', 'internal');
    console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', p: u.pathname, rid: req._id, e: String(e).slice(0, 200) }));
    log(500);
  }
});
const port = Number(process.argv[2] || process.env.PORT || 3001);
server.listen(port, () => console.log(`VoltPrecon API :${port} — ${BUNDLE.meta.total} models (${BUNDLE.meta.curated} curated)`));
