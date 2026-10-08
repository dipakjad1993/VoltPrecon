/* VoltPrecon SW — app-shell cache-first + versioned data cache (stale tariffs = wrong money math = trust death).
   CORE shell is immutable-versioned; data.bundle.json lives in its own DATA cache keyed by
   meta.as_of + db_bytes (read from the bundle itself). Update flow:
   - install: cache shell; skipWaiting. - activate: purge old vp-* caches.
   - fetch data.bundle.json: stale-while-revalidate — serve cache instantly, revalidate in
     background when online, swap only if meta.db_bytes/as_of changed. */
const SHELL = 'vp-shell-v4'; // bump on every app.js/deep.js/index.html change or users keep the old picker
const DATA_PFX = 'vp-data-';
const CORE = ['./', './index.html', './styles.css', './app.js', './deep.js', './i18n.js', './manifest.webmanifest',
  '/packages/engine/src/normalizer.js', '/packages/engine/src/physics.js',
  '/packages/engine/src/tco.js', '/packages/engine/src/resale_soh.js'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== SHELL && !k.startsWith(DATA_PFX)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  // Versioned data path: never serve silently-stale tariffs.
  if (u.pathname.endsWith('data.bundle.json')) {
    e.respondWith((async () => {
      const cache = await caches.open(DATA_PFX + 'live');
      const hit = await cache.match(e.request);
      const revalidate = fetch(e.request).then(async (r) => {
        if (r.ok) {
          try {
            const j = await r.clone().json();
            const key = `${j.meta.as_of}-${j.meta.db_bytes}`;
            const old = (hit && (await hit.clone().json().catch(() => null))) || null;
            const oldKey = old ? `${old.meta.as_of}-${old.meta.db_bytes}` : null;
            if (key !== oldKey) {
              await cache.put(e.request, r.clone());
              const clients = await self.clients.matchAll();
              clients.forEach((c) => c.postMessage({ type: 'vp-data-updated', as_of: j.meta.as_of }));
            } else if (!hit) { await cache.put(e.request, r.clone()); }
          } catch { if (!hit) await cache.put(e.request, r.clone()); }
          return r;
        }
        return hit || r;
      }).catch(() => hit);
      return hit || revalidate;
    })());
    return;
  }
  e.respondWith(caches.match(e.request).then((h) => h || fetch(e.request).then((r) => {
    const cp = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, cp)); return r;
  }).catch(() => caches.match('./index.html'))));
});
