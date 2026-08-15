/* KARTI service worker — NETWORK-FIRST, same-origin only.
   Deliberately narrow: it never touches cross-origin requests and never
   touches range requests, because a greedy SW broke a previous project.
   Bump CACHE on every deploy. */
const CACHE = 'karti-v6';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './css/extra.css',
  './css/cardview.css',
  './js/cards.js',
  './js/set2.js',
  './js/set3.js',
  './js/game.js',
  './js/ai.js',
  './js/gacha.js',
  './js/story.js',
  './js/mp.js',
  './js/cardview.js',
  './js/tutor.js',
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

  /* The 200 full-size card pictures are ~27 MB and are only ever seen one at a
     time in the inspector or a pack reveal. Caching them meant a browse through
     the Collection quietly wrote tens of megabytes to disk, with no eviction.
     The 256px thumbnails (~3.8 MB for the whole set, and only the ones actually
     looked at) ARE cached, so the grid, the rails and the board still have real
     art with no network. Nothing here is precached: 200 files is far too many
     for an install step. */
  const isFullArt = /\/art\/[^/]+\.(jpe?g|png|webp)$/i.test(url.pathname) &&
                    !/\/art\/thumb\//i.test(url.pathname);

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.type === 'basic' && !isFullArt){
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
