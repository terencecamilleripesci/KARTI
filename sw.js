/* KARTI service worker — NETWORK-FIRST, same-origin only.
   Deliberately narrow: it never touches cross-origin requests and never
   touches range requests, because a greedy SW broke a previous project.
   Bump CACHE on every deploy. */
const CACHE = 'karti-v1';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './js/cards.js',
  './js/set2.js',
  './js/set3.js',
  './js/game.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      /* addAll fails the whole install if one file 404s — add individually */
      Promise.all(CORE.map(url => cache.add(url).catch(() => null)))
    )
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
  const req = event.request;

  /* only ever handle plain same-origin GETs */
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* never intercept range requests (media seeking) */
  if (req.headers.has('range')) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.type === 'basic'){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit =>
          hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)
        )
      )
  );
});
