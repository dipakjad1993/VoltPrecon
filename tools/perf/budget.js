// VoltPrecon perf budgets — enforced in CI (protects the 3G/Nagpur advantage).
// Fail closed: any over-budget asset blocks the deploy. Zero-dep.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __d = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__d, '../..');
const kb = (p) => (fs.existsSync(p) ? fs.statSync(p).size / 1024 : 0);

const checks = [
  { name: 'engine runtime (physics+normalizer+tco+resale_soh+subsidy)', size: ['packages/engine/src/physics.js', 'packages/engine/src/normalizer.js', 'packages/engine/src/tco.js', 'packages/engine/src/resale_soh.js', 'packages/engine/src/subsidy.js'].reduce((a, f) => a + kb(path.join(ROOT, f)), 0), max: 25 },
  { name: 'app shell (app.js + i18n.js + styles.css + index.html)', size: ['apps/web/app.js', 'apps/web/i18n.js', 'apps/web/styles.css', 'apps/web/index.html'].reduce((a, f) => a + kb(path.join(ROOT, f)), 0), max: 60 },
  { name: 'data.bundle.json (client index)', size: kb(path.join(ROOT, 'apps/web/data.bundle.json')), max: 260 },
  { name: 'deep renderers lazy module (deep.js, NOT first-load)', size: kb(path.join(ROOT, 'apps/web/deep.js')), max: 25 },
  { name: 'first-load total (shell + bundle + engine)', size: ['apps/web/app.js', 'apps/web/i18n.js', 'apps/web/styles.css', 'apps/web/index.html', 'apps/web/data.bundle.json', 'packages/engine/src/physics.js', 'packages/engine/src/normalizer.js', 'packages/engine/src/tco.js', 'packages/engine/src/resale_soh.js', 'packages/engine/src/subsidy.js'].reduce((a, f) => a + kb(path.join(ROOT, f)), 0), max: 350 },
];

let fail = false;
for (const c of checks) {
  const ok = c.size <= c.max;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.size.toFixed(1)} KB (budget ${c.max} KB)`);
  if (!ok) fail = true;
}
// No Google tags / framework payloads allowed in the 350KB budget
const appJs = fs.readFileSync(path.join(ROOT, 'apps/web/app.js'), 'utf8');
const banned = ['googletagmanager', 'google-analytics', 'react', 'vue', 'angular'];
for (const b of banned) {
  if (appJs.toLowerCase().includes(b)) { console.log(`FAIL  banned payload in app.js: ${b}`); fail = true; }
}
if (fail) { console.error('PERF BUDGET EXCEEDED — refusing deploy'); process.exit(1); }
console.log('PERF OK — 3G budget protected');
