const CACHE_NAME = 'aristotle-pos-v112';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/style.css',
  './fonts/material-symbols-rounded-core.woff2',
  './fonts/material-symbols-rounded.woff2',
  './js/app.js',
  './js/config.js',
  './js/state.js',
  './js/utils.js',
  './js/qris.js',
  './js/firebase.js',
  './js/modules/license.js',
  './js/modules/pos.js',
  './js/modules/payment.js',
  './js/modules/admin.js',
  './js/modules/report.js',
  './js/modules/tour.js',
  './js/modules/superadmin.js',
  './js/modules/printer.js',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24..48,400..700,0..1,-50..200&display=block',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('SW Precache non-critical item failed:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Hanya proses request GET http/https (abaikan firestore & auth realtime API)
  if (
    event.request.method !== 'GET' ||
    !url.startsWith('http') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('firebaseinstallations.googleapis.com') ||
    url.includes('firebaseio.com')
  ) {
    return;
  }

  // Network-First with Safe Fallback: Selalu pastikan mengembalikan instance Response valid
  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
        }
        return networkResponse;
      } catch (fetchErr) {
        // Fallback 1: Coba match persis di cache
        let cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

        // Fallback 2: Coba match tanpa query string (?v=...)
        cachedResponse = await caches.match(event.request, { ignoreSearch: true });
        if (cachedResponse) return cachedResponse;

        // Fallback 3: Buka cache langsung dan cari path bersih
        try {
          const cache = await caches.open(CACHE_NAME);
          const cleanUrl = url.split('?')[0];
          const cleanMatch = (await cache.match(cleanUrl)) || (await cache.match(new Request(cleanUrl)));
          if (cleanMatch) return cleanMatch;
        } catch (_) {}

        // Fallback 4: Navigasi HTML fallback ke index.html
        if (
          event.request.mode === 'navigate' ||
          event.request.headers.get('accept')?.includes('text/html')
        ) {
          const indexFallback = (await caches.match('./index.html')) || (await caches.match('./'));
          if (indexFallback) return indexFallback;
        }

        // Fallback 5: Wajib kembalikan Response valid agar tidak crash
        return new Response('Offline: Konten tidak tersedia saat tanpa koneksi internet.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })()
  );
});
