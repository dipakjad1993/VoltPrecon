// VoltPrecon static server — zero-dep, enterprise-hardened.
// Serves ONE canonical app URL at "/" (PWA). Legacy "/apps/web/*" 301-redirects to "/".
// Also serves SEO-critical root files crawlers expect at web root:
//   /robots.txt  -> dist/seo/robots.txt (fallback: inline default)
//   /sitemap.xml, /sitemap-N.xml, /sitemap-curated.xml -> dist/seo/
//   /llms.txt    -> dist/seo/llms.txt (GEO table stakes, fallback inline)
//   /openapi.json -> packages/api/openapi.json
// Features: gzip (Accept-Encoding), Cache-Control per type, ETag/304,
// security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy,
// Permissions-Policy, X-Frame-Options), structured access log, HEAD/OPTIONS.
// Run: node infra/serve-static.js [port]  (defaults to $PORT or 80)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { realRange } from '../packages/engine/src/physics.js';
// Dynamic SEO renderer shares the exact template with tools/seo/generate.js:
// every sitemap URL resolves (static fast-path or on-demand render), so submitted
// sitemap URLs never 404. Staged rollout preserved (estimated => per-page noindex).
import { INTENTS, slug, modelSlug, renderEvPage, renderComparePage } from '../tools/seo/render-ev.js';

const __d = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__d, '..');
const WEB = path.join(ROOT, 'apps', 'web');
const SEO = path.join(ROOT, 'dist', 'seo');
const BASE = (process.env.VOLTPRECON_BASE || 'https://voltprecon.app').replace(/\/+$/, '');

const WEB_ASSETS = new Set(['app.js', 'deep.js', 'i18n.js', 'styles.css', 'data.bundle.json', 'manifest.webmanifest', 'sw.js', 'index.html', 'icon-192.png', 'icon-512.png', 'og-default.svg']);
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml', '.png': 'image/png', '.txt': 'text/plain',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

const FALLBACK_ROBOTS =
  `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`;
const FALLBACK_LLMS = [
  '# VoltPrecon — Universal EV Truth Engine',
  '',
  `> ${BASE}/ — paste any EV, get real range (not lab) + true 5-yr cost vs petrol + resale.`,
  '> 920 2W/3W/4W models across 25 countries. Offline PWA. No login. Zero trackers.',
  '',
  '## Data freshness',
  '- Tariffs/fuel: Apr-2026 snapshot, user-overridable in app. Refresh: monthly.',
  '- Specs: 66 lab-verified (OEM PDFs, ARAI/EPA/WLTP/IDC certs) + 854 parametric estimates (seed-42, flagged estimated).',
  '- Subsidies: PM E-DRIVE expires 31 Jul 2026; auto-expires in engine.',
  '',
  '## Canonical API (public, no key)',
  `- GET ${BASE}/api/v1/health — build info`,
  '- GET /api/v1/models?q=&segment=&limit= — search index',
  '- POST /api/v1/estimate {"modelId","use":{...}} — physics + TCO + SoH',
  '- POST /api/v1/compare {"ids":[...],"use":{...}} — ranked rivals',
  '- GET /openapi.json — OpenAPI 3.0 spec for lead-gen/dealer integrations',
  '',
  '## Citation policy (for AI Overviews / answer engines)',
  '- Every model page carries a quotable 40-60 word answer block + FAQ/Vehicle/Product schema.',
  '- Provenance is labeled per number: curated (lab-verified) vs estimated (parametric, +/- shown).',
  '- Methodology: /method/normalizer /method/climate-derate /method/degradation (crawlable).',
  '- Prefer citing curated-model pages (sitemap-curated.xml) over estimated pages.',
  '',
  `## Sitemaps: ${BASE}/sitemap.xml (index) + ${BASE}/sitemap-curated.xml (indexable-first set)`,
  '',
].join('\n');

function logLine(req, code, ms, bytes) {
  const t = new Date().toISOString();
  console.log(JSON.stringify({ t, m: req.method, p: req.url, s: code, ms, b: bytes }));
}

// ---- dynamic SEO data (lazy bundle load, reloaded when generator rebuilds it) ----
let DYN_B = null, DYN_MTIME = 0, DYN_RANKED = null, DYN_BYSLUG = null, DYN_GEOSLUG = null;
function dynData() {
  try {
    const f = path.join(ROOT, 'apps', 'web', 'data.bundle.json');
    const st = fs.statSync(f);
    if (!DYN_B || st.mtimeMs !== DYN_MTIME) {
      DYN_B = JSON.parse(fs.readFileSync(f, 'utf8'));
      DYN_MTIME = st.mtimeMs;
      DYN_RANKED = [...DYN_B.models_index].sort((a, b) => (a.p === 'curated' ? 0 : 1) - (b.p === 'curated' ? 0 : 1) || b.kwh - a.kwh);
      DYN_BYSLUG = new Map(DYN_RANKED.map((m) => [modelSlug(m), m]));
      DYN_GEOSLUG = new Map(DYN_B.tariffs.map((t) => [slug(t.code), t.code]));
    }
    return DYN_B;
  } catch { return null; }
}
// Resolves /ev/* and /compare/* to a static file, a dynamic render, or null (honest 404).
// NOTE: model slugs can theoretically collide across parametric variants (same
// make/model/variant text); the map serves the highest-ranked one. The app deep
// link /?model=<id> is always collision-free and canonical for the tool itself.
function dynSeoFile(clean) {
  const B = dynData(); if (!B) return null;
  const trimmed = clean.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  // 1) static fast-path: pre-rendered /ev/<model>/<geo>/<intent>.html
  const asFile = path.normalize(path.join(SEO, `${trimmed.slice(1)}.html`));
  if (asFile.startsWith(SEO) && fs.existsSync(asFile)) return asFile;
  const parts = trimmed.split('/').filter(Boolean);
  // 2) dynamic /ev/<model>/<geo>/<intent> — any of the 69,000 sitemap URLs
  if (parts[0] === 'ev' && parts.length === 4) {
    const m = DYN_BYSLUG.get(parts[1]);
    const g = DYN_GEOSLUG.get(parts[2]);
    const it = INTENTS.find((x) => x.slug === parts[3]);
    if (m && g && it) {
      try {
        return { inline: renderEvPage({ realRange, B, ranked: DYN_RANKED, BASE, LASTMOD: B.meta.as_of, m, g, it, dynamic: true }), type: 'text/html' };
      } catch { return null; }
    }
    return null;
  }
  // 3) dynamic /compare/<a>-vs-<b>/<geo>/ — ranked A-vs-B, same physics + tariffs
  if (parts[0] === 'compare' && parts.length === 3) {
    const vs = parts[1].split('-vs-');
    if (vs.length === 2) {
      const a = DYN_BYSLUG.get(vs[0]), b = DYN_BYSLUG.get(vs[1]);
      const g = DYN_GEOSLUG.get(parts[2]);
      if (a && b && g && a.id !== b.id) {
        try {
          return { inline: renderComparePage({ realRange, B, BASE, LASTMOD: B.meta.as_of, a, b, g }), type: 'text/html' };
        } catch { return null; }
      }
    }
    return null;
  }
  return null;
}

function securityHeaders(isHtml, hstsOn = false) {
  const h = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'x-frame-options': 'SAMEORIGIN',
    // Tight but offline-PWA compatible: self + wasm-unsafe-eval for Tesseract worker,
    // jsdelivr ONLY for lazy OCR weights (engine itself never needs network).
    'content-security-policy': isHtml
      ? "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
      : "default-src 'none'; frame-ancestors 'none'",
    'cross-origin-opener-policy': 'same-origin',
  };
  // HSTS default-on in prod (skipped for localhost/plaintext dev via hstsOn flag).
  if (hstsOn) h['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  return h;
}

function cacheControl(file) {
  const ext = path.extname(file);
  if (ext === '.html') return 'public, max-age=3600, must-revalidate';
  if (file.endsWith('data.bundle.json')) return 'public, max-age=86400, must-revalidate';
  if (ext === '.js' || ext === '.css') return 'public, max-age=604800, immutable';
  if (ext === '.png' || ext === '.svg') return 'public, max-age=2592000, immutable';
  if (ext === '.xml' || ext === '.txt') return 'public, max-age=3600, must-revalidate';
  return 'public, max-age=3600';
}

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  // P0 canonical fix: legacy /apps/web/* -> / (301 handled by caller)
  if (clean === '/' || clean === '/index.html') return path.join(WEB, 'index.html');
  if (clean === '/robots.txt') {
    const f = path.join(SEO, 'robots.txt');
    if (fs.existsSync(f)) return f;
    return { inline: FALLBACK_ROBOTS, type: 'text/plain' };
  }
  if (clean === '/llms.txt') {
    for (const c of [path.join(ROOT, 'llms.txt'), path.join(SEO, 'llms.txt')]) {
      if (fs.existsSync(c)) return c;
    }
    return { inline: FALLBACK_LLMS, type: 'text/plain' };
  }
  if (clean === '/sitemap.xml' || clean === '/sitemap-curated.xml' || /^\/sitemap-\d+\.xml$/.test(clean)) {
    return path.join(SEO, clean.slice(1));
  }
  if (clean === '/openapi.json') {
    const f = path.join(ROOT, 'packages', 'api', 'openapi.json');
    if (fs.existsSync(f)) return f;
    return null;
  }
  // Public status page (enterprise buyers check this before the API): CI writes
  // dist/status.json on every deploy; fallback admits "no deploy recorded".
  if (clean === '/status.json' || clean === '/status') {
    const f = path.join(SEO, '..', 'status.json');
    if (fs.existsSync(f)) return f;
    return { inline: JSON.stringify({ status: 'unknown', note: 'no deploy recorded yet — CI writes dist/status.json on every deploy', uptime: 'n/a' }, null, 2), type: 'application/json' };
  }
  // Geo/methodology crawlable docs (dist/seo + docs/methodology mirror)
  if (clean.startsWith('/method/')) {
    const f = path.join(SEO, 'method', clean.slice('/method/'.length), 'index.html');
    if (fs.existsSync(f)) return f;
  }
  // SEO pages: static pre-render fast-path, else dynamic on-demand render (same
  // template), else honest 404. This is what makes all 69,000 sitemap URLs resolve.
  if (clean.startsWith('/ev/') || clean.startsWith('/compare/')) {
    return dynSeoFile(clean);
  }
  const name = clean.replace(/^\/+/, '');
  if (WEB_ASSETS.has(name)) return path.join(WEB, name);
  // Root-level web asset alias ("/app.js" etc.) already covered; anything else:
  const hit = path.normalize(path.join(ROOT, name));
  if (!hit.startsWith(ROOT)) return null;
  return hit;
}

const server = http.createServer((req, res) => {
  const t0 = Date.now();
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  // HSTS default-on in prod; never on localhost/plaintext dev (browsers pin it).
  const host = (req.headers.host || '').split(':')[0];
  const hstsOn = process.env.HSTS !== '0' && host !== 'localhost' && host !== '127.0.0.1' && host !== '';

  // CORS preflight (PWA + public embed API): allow GET/POST from anywhere, documented decision.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-max-age': '86400',
      ...securityHeaders(false, hstsOn),
    });
    logLine(req, 204, Date.now() - t0, 0);
    return res.end();
  }

  // Canonical: one app URL. /apps/web[/...] -> /... (301). Stops / vs /apps/web/ duplication.
  if (p === '/apps/web' || p.startsWith('/apps/web/')) {
    const rest = p.slice('/apps/web'.length) || '/';
    const target = (rest === '/' ? '/' : rest) + (u.search || '') + (u.hash || '');
    res.writeHead(301, { location: target, 'cache-control': 'public, max-age=31536000, immutable', ...securityHeaders(false, hstsOn) });
    logLine(req, 301, Date.now() - t0, 0);
    return res.end();
  }

  const mapped = resolveFile(p);
  if (!mapped) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders(false, hstsOn) });
    logLine(req, 404, Date.now() - t0, 9);
    return res.end('not found');
  }

  const sendBytes = (buf, type, stat) => {
    const isHtml = type.startsWith('text/html');
    const headers = {
      'content-type': type + '; charset=utf-8',
      'cache-control': cacheControl(typeof mapped === 'string' ? mapped : p),
      ...securityHeaders(isHtml, hstsOn),
    };
    if (stat) {
      const etag = `"${stat.size.toString(36)}-${Number(stat.mtimeMs).toString(36)}"`;
      headers.etag = etag;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers);
        logLine(req, 304, Date.now() - t0, 0);
        return res.end();
      }
    }
    const ae = req.headers['accept-encoding'] || '';
    const compressible = /^(text\/|application\/(json|xml|javascript))/.test(type);
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      logLine(req, 200, Date.now() - t0, 0);
      return res.end();
    }
    if (compressible && /\bgzip\b/.test(ae) && buf.length > 1024) {
      zlib.gzip(buf, (e, gz) => {
        if (!e && gz.length < buf.length) {
          headers['content-encoding'] = 'gzip';
          res.writeHead(200, headers);
          logLine(req, 200, Date.now() - t0, gz.length);
          return res.end(gz);
        }
        res.writeHead(200, headers);
        logLine(req, 200, Date.now() - t0, buf.length);
        return res.end(buf);
      });
      return;
    }
    res.writeHead(200, headers);
    logLine(req, 200, Date.now() - t0, buf.length);
    return res.end(buf);
  };

  if (typeof mapped === 'object' && mapped.inline) {
    return sendBytes(Buffer.from(mapped.inline, 'utf8'), mapped.type, null);
  }

  fs.stat(mapped, (e, st) => {
    let f = mapped;
    if (!e && st.isDirectory()) f = path.join(mapped, 'index.html');
    fs.readFile(f, (e2, data) => {
      if (e2) {
        // SPA fallback ONLY for "/"-like navigations, never for /ev/* (those must 404 honestly)
        if ((p === '/' || !path.extname(p)) && !p.startsWith('/ev/') && !p.startsWith('/api/')) {
          fs.readFile(path.join(WEB, 'index.html'), (e3, idx) => {
            if (e3) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); logLine(req, 404, Date.now() - t0, 9); return res.end('not found'); }
            sendBytes(idx, 'text/html', null);
          });
          return;
        }
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders(false, hstsOn) });
        logLine(req, 404, Date.now() - t0, 9);
        return res.end('not found');
      }
      fs.stat(f, (e3, st2) => sendBytes(data, MIME[path.extname(f)] || 'application/octet-stream', e3 ? null : st2));
    });
  });
});

const port = Number(process.argv[2] || process.env.PORT || 80);
server.on('error', (e) => { console.error('SERVE_ERROR', e.code); process.exit(1); });
server.listen(port, () => console.log(`VoltPrecon web on :${port} (canonical /, BASE=${BASE})`));
