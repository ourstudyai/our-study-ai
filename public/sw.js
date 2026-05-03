
// Share Target handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST') return;
  if (!url.searchParams.get('shared')) return;

  event.respondWith((async () => {
    try {
      const fd = await event.request.formData();
      const files = fd.getAll('files').filter(f => f instanceof File);
      if (files.length) {
        const cache = await caches.open('share-target-v1');
        await cache.put('/_share_files_meta', new Response(JSON.stringify({
          names: files.map(f => f.name),
          types: files.map(f => f.type),
          timestamp: Date.now(),
        })));
        for (let i = 0; i < files.length; i++) {
          const buf = await files[i].arrayBuffer();
          await cache.put(`/_share_file_${i}`, new Response(buf, {
            headers: { 'Content-Type': files[i].type }
          }));
        }
      }
    } catch(e) { console.error('[SW] share error', e); }
    return Response.redirect('/contribute?shared=1', 303);
  })());
});


const CACHE_NAME = 'ourstudyai-v3';

const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // Never cache — always go to network
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('groq')
  ) {
    return;
  }

  // Network first for everything else
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/dashboard');
          }
        });
      })
  );
});
