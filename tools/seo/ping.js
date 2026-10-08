// VoltPrecon post-deploy sitemap ping — CI/deploy calls this AFTER publishing,
// never before (pinging URLs that 404 trains crawlers to distrust you).
// Reads dist/seo/ping-sitemaps.txt and GETs each line. Run: node tools/seo/ping.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lines = fs.readFileSync(path.join(ROOT, 'dist/seo/ping-sitemaps.txt'), 'utf8')
  .split('\n').map((l) => l.trim()).filter(Boolean);
let fail = 0;
for (const line of lines) {
  const url = line.replace(/^GET\s+/, '');
  try {
    const r = await fetch(url, { redirect: 'follow' });
    console.log(`${r.ok ? 'PINGED' : 'PING-FAIL'} ${r.status} ${url}`);
    if (!r.ok) fail++;
  } catch (e) {
    console.log(`PING-ERR ${url} :: ${String(e).slice(0, 100)}`);
    fail++;
  }
}
if (fail) { console.error(`PING: ${fail} failures — check deploy before re-pinging`); process.exit(1); }
console.log('PING OK — crawlers notified');
