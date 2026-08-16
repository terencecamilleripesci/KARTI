/* KARTI service worker — NETWORK-FIRST, same-origin only.
   Deliberately narrow: it never touches cross-origin requests and never
   touches range requests, because a greedy SW broke a previous project.
   Bump CACHE on every deploy. */
const CACHE = 'karti-v59';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './css/extra.css',
  './css/cardview.css',
  './fonts/exo2-700-latin.woff2',
  './fonts/exo2-700-latin-ext.woff2',
  './js/artkit.js',
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
  './js/party.js',
  './js/chess.js',
  './js/dama.js',
  './js/skarta.js',
  './js/skarta-ui.js',
  './js/klabb.js',
  './js/klabb-briscola.js',
  './js/klabb-sette.js',
  './js/klabb-cheat.js',
  './js/tombla.js',
  './js/tombla-ui.js',
  './js/kiri.js',
  './js/kiri-ai.js',
  './js/kiri-ui.js',
  './js/stats.js',
  './js/sfx.js',
  /* The 38 mp3s under ./audio/ are deliberately NOT precached. They are 416 KB,
     the game is designed to be perfect without a single one of them, and a
     precache list that 404s fails the whole install — which is how a cache bump
     once wiped the artwork off the phone. They are fetched on first play and
     kept by the runtime cache from then on. */
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

/* fetch that bypasses HTTP-cache freshness (revalidates with the server) and
   treats a non-2xx as a failure, so error pages never get cached. */
async function freshOK(url){
  /* guarded: if this WebKit predates the cache option, fall back to a plain
     fetch rather than throwing — a throw here would silently hand the install
     over to the carry-the-old-cache-forward path, i.e. guaranteed staleness */
  let req;
  try { req = new Request(url, { cache: 'no-cache' }); } catch (e) { req = url; }
  const res = await fetch(req);
  if (!res || !res.ok) throw new Error('bad response for ' + url);
  return res;
}

/* The page can ask the RUNNING worker which build it is. This is the one answer
   that cannot lie about staleness: it comes from the script iOS actually
   activated, not from the server and not from a constant baked into the page. */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'VERSION'){
    const reply = { type: 'VERSION', cache: CACHE };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  }
});

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* the old caches still exist here — activate has not pruned them yet */
    const oldKeys = (await caches.keys()).filter(k => k !== CACHE);
    await Promise.all(CORE.map(async url => {
      /* network first so a deploy really refreshes the file…
         cache:'no-cache' is NOT optional. GitHub Pages serves everything with
         max-age=600, and a plain cache.add() honours the HTTP cache — so a
         version bump installed within ten minutes of the deploy would copy the
         PREVIOUS build's index.html out of the HTTP disk cache and seal it into
         the NEW cache bucket. That is precisely what happened across nineteen
         same-day deploys: every "fix" the owner tested was a stale shell wearing
         a fresh version number. no-cache forces an ETag revalidation (a 304 when
         nothing changed), so the precache can never be older than the server. */
      try { await cache.put(url, await freshOK(url)); return; } catch (e) {}
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
  /* Navigations carry the whole shell — the layout CSS is INLINE in index.html,
     so a stale index.html means a stale app no matter how new everything else
     is. Pages serves it with max-age=600; the default cache mode happily returns
     that ≤10-minute-old copy without asking the server, which is how the
     installed app kept rendering an old shell minutes after every deploy.
     no-cache = always revalidate: one conditional request, a 304 when nothing
     changed, and the phone can never render an index.html older than the
     server's. Offline behaviour is unchanged — a dead network still rejects and
     falls through to the cache below. */
  let netReq = req;
  if (req.mode === 'navigate'){
    try { netReq = new Request(req.url, { cache: 'no-cache' }); } catch (e) {}
  }

  event.respondWith(
    fetch(netReq)
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
