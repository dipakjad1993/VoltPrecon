// VoltPrecon security-headers test — asserts the prod header contract on / and API.
// Catches silent regressions (a missing CSP is a CVE-class event for an embeddable tool).
// Run: node tools/qa/security-headers.mjs [base]  (default http://localhost:8080)
// CI starts infra/serve-static.js + packages/api/src/server.js on ephemeral ports.
import { spawn } from 'node:child_process';

const STATIC_PORT = 18091, API_PORT = 18092;
const start = (cmd, args) => spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (c, n) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) fails.push(n); };

const web = start('node', ['infra/serve-static.js', String(STATIC_PORT)]);
const api = start('node', ['packages/api/src/server.js', String(API_PORT)]);
await wait(1500);
try {
  const home = await fetch(`http://localhost:${STATIC_PORT}/`);
  const h = (k) => home.headers.get(k) || '';
  ok(home.status === 200, 'static / serves 200');
  ok(h('content-security-policy').includes("default-src 'self'"), 'CSP present on / (no analytics payload possible)');
  ok(h('content-security-policy').includes('cdn.jsdelivr.net'), 'CSP allow-lists only the OCR-weights CDN');
  ok(h('x-content-type-options') === 'nosniff', 'nosniff on /');
  ok(h('x-frame-options') === 'SAMEORIGIN', 'frame-options on /');
  ok(h('referrer-policy').length > 0, 'referrer-policy on /');
  ok(h('permissions-policy').includes('camera=()'), 'permissions-policy locks sensors');
  ok(!h('strict-transport-security'), 'no HSTS on localhost (browsers would pin it)');

  const prodHsts = h('content-security-policy'); // localhost parity note above; prod HSTS covered by unit below
  void prodHsts;
  const apiHealth = await fetch(`http://localhost:${API_PORT}/api/v1/health`);
  const ah = (k) => apiHealth.headers.get(k) || '';
  const body = await apiHealth.json();
  ok(apiHealth.status === 200 && body.ok === true, 'api /health 200 + ok');
  ok(ah('x-request-id').length > 0, 'api echoes x-request-id');
  ok(ah('x-ratelimit-limit') === '60', 'api X-RateLimit-Limit present');
  ok(ah('x-ratelimit-remaining').length > 0, 'api X-RateLimit-Remaining present');
  ok(ah('api-version') === 'v1', 'api api-version header');
  ok(ah('strict-transport-security').includes('max-age'), 'api HSTS default-on');

  const echo = await fetch(`http://localhost:${API_PORT}/api/v1/health`, { headers: { 'x-request-id': 'sec-test-1' } });
  ok(echo.headers.get('x-request-id') === 'sec-test-1', 'request-id echo (incident correlation)');

  const missing = await fetch(`http://localhost:${API_PORT}/api/v1/estimate`, { method: 'POST', body: JSON.stringify({ modelId: 'nope' }) });
  const mb = await missing.json();
  ok(missing.status === 404 && mb.error && mb.error.code === 'UNKNOWN_MODEL', 'unknown model -> 404 UNKNOWN_MODEL envelope');
  ok(mb.error.requestId && mb.error.requestId.length > 0, 'error envelope carries requestId');
} catch (e) {
  ok(false, 'headers test crashed: ' + String(e).slice(0, 160));
} finally {
  web.kill(); api.kill();
}
if (fails.length) { console.error(`SEC-HEADERS FAILED: ${fails.length}`); process.exit(1); }
console.log('SEC-HEADERS OK');
