// YabbAI Service Worker — minimal offline shell + asset cache
const CACHE = 'yabbai-shell-v2';
const ASSETS = ['/', '/index.html', '/manifest.json', '/miner-worker.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // NEVER intercept API calls — they may be long-running (LLM streams), have
  // streaming responses, or POST bodies. Let the browser handle them natively.
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  // Only intercept same-origin GETs for static shell
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('/')))
  );
});
