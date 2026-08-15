/* KARTI service worker — NETWORK-FIRST, same-origin only.
   Deliberately narrow: it never touches cross-origin requests and never
   touches range requests, because a greedy SW broke a previous project.
   Bump CACHE on every deploy. */
const CACHE = 'karti-v18';
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
  './js/sync.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  /* The UI art the shell actually wears — home background, playmat, card back,
     zones, piles — plus art/petard.jpg, the sentinel detectArt() probes to
     decide whether the art pack exists at all. None of these were cached, and
     every cache bump wiped the runtime copies, so an installed app launched on
     a flaky connection came up with NO artwork: shell from the precache, art
     probes dead. ~1.2 MB total, precached once, and the install below carries
     the previous version's copies forward if the network drops mid-install. */
  './art/petard.jpg',
  './art/ui/home-bg.jpg',
  './art/ui/board.jpg',
  './art/ui/cardback.jpg',
  './art/ui/zone-monster.png',
  './art/ui/zone-spell.png',
  './art/ui/pile-deck.png',
  './art/ui/pile-grave.png',
  './art/ui/pile-banish.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* the old caches still exist here — activate has not pruned them yet */
    const oldKeys = (await caches.keys()).filter(k => k !== CACHE);
    await Promise.all(CORE.map(async url => {
      /* network first so a deploy really refreshes the file… */
      try { await cache.add(url); return; } catch (e) {}
      /* …but if the network fails mid-install, carry the previous version's
         copy forward rather than losing a file the device already had. That is
         what used to happen on every bump: activate deleted the old cache and
         anything that had not re-downloaded yet was simply gone. */
      for (const k of oldKeys){
        try {
          const hit = await (await caches.open(k)).match(url);
          if (hit){ await cache.put(url, hit); return; }
        } catch (e) {}
      }
    }));
  })());
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
     art with no network. Nothing card-sized is precached: 200 files is far too
     many for an install step. (art/ui/* does NOT match this pattern — the UI
     dressing is small, precached above, and must survive offline.) */
  const isFullArt = /\/art\/[^/]+\.(jpe?g|png|webp)$/i.test(url.pathname) &&
                    !/\/art\/thumb\//i.test(url.pathname);

  /* A failed fetch REJECTS, but a 500 or a captive-portal interstitial RESOLVES —
     so returning it straight through handed the player an error page while a
     perfectly good cached copy sat right there. Treat a non-OK response the same
     as no response at all, and only fall back to the network result if we have
     nothing cached. */
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.type === 'basic' && !isFullArt){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        if (res && !res.ok){
          return caches.match(req).then(hit => hit || res);
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
