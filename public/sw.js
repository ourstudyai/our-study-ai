// ── Lux Studiorum Service Worker ─────────────────────────────────────────────
// Strategy overview:
//   STATIC assets (_next/static, icons, fonts) → Cache first, update in background
//   App pages (navigate requests)              → Stale-while-revalidate
//   Material text (/api/material-body)         → Cache first, network fallback
//   Material files (R2 CDN)                    → Cache first, 50MB LRU cap
//   All other API routes                       → Network only (no cache)
//   Firebase/Firestore/Groq                    → Network only (SDK handles own persistence)

const APP_SHELL_CACHE   = 'lux-shell-v1';
const PAGES_CACHE       = 'lux-pages-v1';
const MATERIAL_CACHE    = 'lux-material-v1';
const FILE_CACHE        = 'lux-files-v1';
const ALL_CACHES        = [APP_SHELL_CACHE, PAGES_CACHE, MATERIAL_CACHE, FILE_CACHE];

// R2 public URL prefix — files from this origin go into FILE_CACHE
const R2_ORIGINS = ['r2.cloudflarestorage.com', 'pub-', '.r2.dev'];

// Pages to precache on install
const PRECACHE_PAGES = [
  '/',
  '/dashboard',
  '/library',
  '/contribute',
  '/login',
  '/offline',
];

// Static assets precached on install
const PRECACHE_STATIC = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json',
];

// Max total bytes in FILE_CACHE before LRU eviction (~50MB)
const FILE_CACHE_MAX_BYTES = 50 * 1024 * 1024;

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(APP_SHELL_CACHE);
      // Precache static assets — ignore individual failures
      await Promise.allSettled([
        ...PRECACHE_STATIC.map(url => shellCache.add(url)),
      ]);
      // Precache pages — ignore failures (page may require auth, that's fine)
      const pagesCache = await caches.open(PAGES_CACHE);
      await Promise.allSettled(
        PRECACHE_PAGES.map(url => pagesCache.add(url))
      );
      await self.skipWaiting();
    })()
  );
});

// ── Activate — clean old caches, claim clients ────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => !ALL_CACHES.includes(key) && key !== 'share-target-v1')
          .map(key => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function isR2File(url) {
  return R2_ORIGINS.some(o => url.hostname.includes(o)) ||
    (url.pathname.match(/\.(pdf|doc|docx|ppt|pptx|png|jpg|jpeg|webp|gif)$/i) &&
      !url.hostname.includes('localhost') &&
      !url.hostname.includes('vercel.app') === false &&
      url.hostname.includes('vercel.app') === false &&
      url.hostname !== location.hostname);
}

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.match(/\.(woff2?|ttf|otf|eot)$/i);
}

function isApiRoute(url) {
  return url.pathname.startsWith('/api/');
}

function isMaterialBody(url) {
  return url.pathname === '/api/material-body';
}

function isFirebaseOrExternal(url) {
  return url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('qdrant') ||
    url.hostname.includes('mistral') ||
    url.hostname.includes('tavily');
}

// Enforce FILE_CACHE size limit — evict oldest entries over the cap
async function enforceCacheLimit() {
  try {
    const cache = await caches.open(FILE_CACHE);
    const keys = await cache.keys();
    let totalSize = 0;
    const entries = [];
    for (const req of keys) {
      const res = await cache.match(req);
      if (!res) continue;
      const buf = await res.clone().arrayBuffer();
      const size = buf.byteLength;
      totalSize += size;
      // Store date from response header or now
      const date = res.headers.get('date')
        ? new Date(res.headers.get('date')).getTime()
        : Date.now();
      entries.push({ req, size, date });
    }
    if (totalSize <= FILE_CACHE_MAX_BYTES) return;
    // Sort oldest first, delete until under limit
    entries.sort((a, b) => a.date - b.date);
    for (const entry of entries) {
      await cache.delete(entry.req);
      totalSize -= entry.size;
      if (totalSize <= FILE_CACHE_MAX_BYTES * 0.85) break; // evict to 85% to avoid thrashing
    }
  } catch (e) {
    console.warn('[SW] cache eviction error', e);
  }
}

// ── Fetch handler ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET (POST share-handler is gone — OS posts go straight to route)
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;

  const url = new URL(req.url);

  // ── Never intercept Firebase/external AI services ──
  if (isFirebaseOrExternal(url)) return;

  // ── Static assets: cache first, update in background ──
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(APP_SHELL_CACHE).then(async cache => {
        const cached = await cache.match(req);
        const networkFetch = fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        return cached || await networkFetch;
      })
    );
    return;
  }

  // ── Material text body: cache first, network fallback ──
  // These are auth-gated API responses — cache by full URL including query params
  if (isMaterialBody(url)) {
    event.respondWith(
      caches.open(MATERIAL_CACHE).then(async cache => {
        const cached = await cache.match(req);
        if (cached) {
          // Refresh in background
          fetch(req).then(res => {
            if (res.ok) cache.put(req, res.clone());
          }).catch(() => {});
          return cached;
        }
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return new Response(JSON.stringify({ error: 'Offline — content not cached yet' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      })
    );
    return;
  }

  // ── R2 file assets (PDFs, images): cache first, 50MB LRU cap ──
  if (isR2File(url)) {
    event.respondWith(
      caches.open(FILE_CACHE).then(async cache => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) {
            cache.put(req, res.clone());
            // Enforce size limit async — don't block the response
            enforceCacheLimit();
          }
          return res;
        } catch {
          return new Response('File not available offline', { status: 503 });
        }
      })
    );
    return;
  }

  // ── Other API routes: network only ──
  if (isApiRoute(url)) return;

  // ── App pages (navigate + same-origin): stale-while-revalidate ──
  if (url.hostname === location.hostname) {
    event.respondWith(
      caches.open(PAGES_CACHE).then(async cache => {
        const cached = await cache.match(req);
        const networkFetch = fetch(req)
          .then(res => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);

        if (cached) {
          // Serve cached immediately, update in background
          networkFetch.catch(() => {});
          return cached;
        }

        // No cache — wait for network
        const res = await networkFetch;
        if (res) return res;

        // Offline and not cached — serve offline page for navigation
        if (req.mode === 'navigate') {
          const offline = await caches.match('/offline');
          return offline || new Response('<h1>You are offline</h1>', {
            headers: { 'Content-Type': 'text/html' },
          });
        }
      })
    );
    return;
  }
});

// ── Message from client: SKIP_WAITING (used by update banner) ────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
