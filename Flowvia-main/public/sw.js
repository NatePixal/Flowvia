/* Simple offline shell for FlowVia (not a full offline POS) */
const CACHE = 'flowvia-shell-v1';
const SHELL = ['/offline.html', '/site.webmanifest', '/logo.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Network-first for API/auth/firebase
  if (url.pathname.startsWith('/__/') || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache a copy of same-origin navigations and static assets
        if (url.origin === location.origin && (req.destination === 'document' || req.destination === 'script' || req.destination === 'style')) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.destination === 'document') {
          return caches.match('/offline.html');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      })
  );
});
