/**
 * Service Worker — Trabajo de Campo PRM
 *
 * Strategy:
 *   - Navigation (HTML): network-first, cache fallback → SPA offline shell
 *   - Static assets (_expo/*, assets/*, *.js, *.css, images): cache-first
 *   - Cross-origin (Supabase API): pass-through, not cached
 *
 * Data caching and mutation queuing are handled at app layer via IndexedDB
 * (lib/offline-cache.web.ts + lib/sync-queue.web.ts) to keep auth context.
 */

const CACHE = 'prm-v1';

const STATIC_EXTS = ['.js', '.css', '.png', '.jpg', '.svg', '.ico', '.woff', '.woff2'];
const STATIC_PATHS = ['/_expo/', '/assets/'];

function isStaticAsset(url) {
  return STATIC_PATHS.some(p => url.pathname.startsWith(p)) ||
    STATIC_EXTS.some(e => url.pathname.endsWith(e));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(['/', '/index.html']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET; skip cross-origin (Supabase, CDN, etc.)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network-first for navigation — keeps HTML fresh, falls back to shell offline
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match('/index.html') || caches.match('/'))
        )
    );
    return;
  }

  if (isStaticAsset(url)) {
    // Cache-first for static assets — JS bundles are content-hashed, safe to cache long-term
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return res;
        });
      })
    );
  }
});
