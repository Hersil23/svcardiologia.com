/**
 * SVC App - Service Worker
 * Cache-first for assets, network-first for API, offline fallback
 */

const CACHE_NAME = 'svc-app-v3';
const API_CACHE = 'svc-api-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/main.css',
  '/assets/css/auth.css',
  '/assets/css/members.css',
  '/assets/css/payments.css',
  '/assets/css/events.css',
  '/assets/css/tickets.css',
  '/assets/css/scanner.css',
  '/assets/css/admin.css',
  '/assets/js/utils.js',
  '/assets/js/auth.js',
  '/assets/js/members.js',
  '/assets/js/payments.js',
  '/assets/js/events.js',
  '/assets/js/tickets.js',
  '/assets/js/scanner.js',
  '/assets/js/admin.js',
  '/assets/img/logo.svg'
];

const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap'
];

// ── Install ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Individual failures shouldn't block install
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url => cache.add(url).catch(() => {}))
        );
      });
    })
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== API_CACHE)
          .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ── Fetch Strategy ───────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http
  if (!url.protocol.startsWith('http')) return;

  // API calls → Network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // CDN resources (fonts, GSAP) → Cache first
  if (url.origin !== location.origin) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // Local assets → Cache first
  if (isAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // Navigation → Network first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, CACHE_NAME).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Default → Network first
  event.respondWith(networkFirst(request, CACHE_NAME));
});

// ── Strategies ───────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ success: false, message: 'Sin conexion' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Helpers ──────────────────────────────────

function isAsset(pathname) {
  return /\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|eot|json)$/i.test(pathname);
}
