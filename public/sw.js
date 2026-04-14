const CACHE_NAME = 'ourstudyai-v1';

const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network first, fall back to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET and non-http(s) requests
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  // Skip API routes and Firebase — always network
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('groq')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for static assets
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Offline fallback for navigation
          if (event.request.mode === 'navigate') {
            return caches.match('/dashboard');
          }
        });
      })
  );
});
