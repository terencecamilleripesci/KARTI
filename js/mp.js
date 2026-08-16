/* ═══════════════════════════════════════════════════════════════════
   KARTI — mp.js   ·   two humans, one game

   1) PASS AND PLAY (offline, always works)
      Two players share one phone. Between turns a curtain drops so the
      next player never sees the previous player's hand. Both seats pick
      a deck. The engine is untouched: at the hand-over we simply swap
      the two seats round so the person holding the phone is always
      player 0 — the duel UI then works exactly as it always has.

   2) ONLINE — real internet play, different houses, THREE GAMES
      A room is a room OF something: the card duel, chess, or dama. You
      pick which before you open it, everybody's room list says what
      each one is, and the relay refuses a move for a game the room is
      not playing. A room with no game on it at all is a card duel —
      that is what every room was before this existed, so an older
      client keeps working in both directions.

      Chess and dama ride the same rails as the duel: both engines are
      deterministic and strictly turn-based, so only the MOVE crosses
      the wire and each phone plays it on its own board. Who is White
      is drawn from a seed that is the XOR of a number from EACH phone,
      sent before either has seen the other's — the host does not hand
      itself the first move. Every incoming move is looked up in our
      OWN legal-move list before it is applied, and a move that is not
      in it stops the game instead of being played. There is no undo
      online, on purpose: see js/chess.js.
      The page is served from GitHub Pages over https. It opens a wss://
      socket to a small relay (server/karti_server.py) that runs on the
      Pi and is published to the internet by Tailscale Funnel. It is a
      relay, NOT a referee.

      NOBODY READS A CODE OUT. Opening Online shows the ROOM LIST: every
      room currently waiting for an opponent, who opened it and how long
      they have been sat there. Tap one and you are in. Opening a room of
      your own is one tap and puts you in everybody else's list at once.
      A room code still exists and still works — it is the only way to
      reach one *particular* person when several rooms are open — but it
      lives behind "Other ways in", along with "open a private room",
      which keeps a room out of the list entirely.

      Both devices run the same deterministic engine from the same seed
      and the same pre-dealt decks, and every move is mirrored. Two
      safety nets ride along:
        · a checksum with every move — if the two boards ever disagree
          we stop the duel instead of lying about the result;
        · every incoming move is re-checked against the rules before it
          is applied, so a peer with devtools open cannot make our copy
          of the engine do something illegal.
      Neither of those makes online play cheat-PROOF (see docs/ONLINE.md,
      "What a cheating player can still do"). Play it with friends.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

/* ═══════════════════════════════════════════════════════════════════
   THE ONE THING YOU CHANGE IF THE SERVER MOVES
   ───────────────────────────────────────────────────────────────────
   Production endpoint: the relay on the Pi, published by Tailscale
   Funnel on port 8443 under the /karti path. Must be wss:// because
   GitHub Pages is https:// and a secure page may not open a plain
   socket.
   ═══════════════════════════════════════════════════════════════════ */
const RELAY_URL    = 'wss://raspberrypi.silverside-tench.ts.net:8443/karti/ws';
const RELAY_HEALTH = 'https://raspberrypi.silverside-tench.ts.net:8443/karti/health';
const RELAY_PRESENCE = 'https://raspberrypi.silverside-tench.ts.net:8443/karti/presence';
/* When the page itself is opened over plain http (i.e. you are testing on
   the Pi or on a laptop) we assume the relay is on the same machine: */
const DEV_RELAY_PORT = 8101;
const DEV_RELAY_PATH = '/karti/ws';
/* ═══════════════════════════════════════════════════════════════════ */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* no O 0 I 1 */
const CODE_LEN      = 5;
const PING_EVERY    = 20000;    /* keep-alive, ms */
const PONG_DEADLINE = 55000;    /* no pong for this long -> assume dead */
const OPEN_TIMEOUT  = 9000;     /* socket must open within this, ms */
const RETRY_WAITS   = [400, 900, 1800, 3500, 6000, 8000, 8000, 8000];  /* ~37s */

/* who's-online panel on the home screen, AND the room list on the Online screen —
   ONE poller feeds both. There is deliberately no second timer anywhere. */
const PRESENCE_EVERY   = 12000;  /* ms between polls while Home is up and visible */
const PRESENCE_LOBBY   = 5000;   /* while the Online screen is up: livelier, but
                                    still comfortably above the hard floor below */
const PRESENCE_MIN_GAP = 4000;   /* never poll faster than this, whatever asks */
const PRESENCE_PING    = 45000;  /* keep the beacon socket alive (server cuts at 120s) */
const PRESENCE_HIDE_GRACE = 60000; /* hidden this long -> hand the socket back */
const PRESENCE_HTTP_TO = 8000;   /* give up on one poll after this */
const PRESENCE_ROWS    = 24;     /* names we will render, whatever the relay sends */
const ROOM_ROWS        = 12;     /* rooms we will render, whatever the relay sends */
const NAME_MAX         = 16;     /* must match L.NAME_LEN on the relay */

const K = window.KARTI;
if (!K) return;
const $ = K.$, $$ = K.$$, esc = K.esc;
const ico = n => (window.ICO ? window.ICO(n) : '');
/* The sound kit is somebody else's file and may not be on the phone at all.
   Never a hard dependency, never a thrown error, never an audio file added
   from here — js/sfx.js owns audio/ and this only ever asks it to play. */
function sfx(id){
  try { if (window.KARTI_SFX && KARTI_SFX.play) KARTI_SFX.play(id); } catch (e){}
}

/* ═══════════════════════════════════════════════════════════════════
   WHAT A ROOM CAN BE A ROOM OF
   ───────────────────────────────────────────────────────────────────
   'cards' is first and is the fallback everywhere, because a room with
   no game on it — from an older client, or from an older relay that
   cannot label one — is a card duel and always was.

   chess and dama live in js/party.js + js/chess.js + js/dama.js and
   are driven through KARTI_PARTY.online[game]. If those files are not
   on the phone, the two tiles simply are not offered.
   ═══════════════════════════════════════════════════════════════════ */
const GAMES = [
  { k:'cards', name:'Card duel', short:'CARDS', icon:'cards',
    blurb:'Your deck against theirs.' },
  { k:'chess', name:'Chess',     short:'CHESS', sym:'pt-p-k',
    blurb:'Sixteen each, one king.' },
  { k:'dama',  name:'Dama',      short:'DAMA',  sym:'pt-crown',
    blurb:'Twelve stones. Takes are compulsory.' },
  /* Tombla is the reason the relay learned to seat sixteen: nobody waits for
     a turn, so a big table costs nothing but makes the game better. */
  { k:'tombla', name:'Tombla',   short:'TOMBLA', sym:'tb-mark',
    blurb:'Ninety numbers. Everybody at once.' },
  /* THE TABLE GAMES.
     They are in this list even while their own file has not published an
     online half yet, and that is deliberate: the relay can already LABEL a
     room `skarta`, and a client whose GAMES array has never heard of skarta
     runs that label through cleanGame(), turns it into 'cards', and shows
     somebody a card duel that is not there. A game we know the name of but
     cannot play is drawn honestly (see gamePlayable and lobbyReport); a game
     we have never heard of is drawn wrongly. */
  { k:'skarta', name:'Skarta',   short:'SKARTA', icon:'discard',
    blurb:'Empty your hand first. Ten can play.' },
  /* sea battle, table of 2–6. Engine js/battleship.js, screen
     js/battleship-ui.js, contract on window.KARTI_GHARRAQ.lobby. */
  { k:'gharraq', name:'Għarraqhom', short:'BAĦAR', sym:'bs-boat',
    blurb:'Five boats each. Sink the neighbours.' },
  { k:'kiri',   name:'Il-Kiri',  short:'KIRI',   icon:'coin',
    blurb:'Rent, deeds, and a ruined friendship.' },
  { k:'klabb',  name:'Card club', short:'KLABB', icon:'cards',
    blurb:'Bixkla, Briscola, Sette, Il-Gidba.' }
];
const GAME_KEYS = GAMES.map(g => g.k);
const gameMeta  = k => GAMES.find(g => g.k === k) || GAMES[0];
const cleanGame = k => (typeof k === 'string' && GAME_KEYS.indexOf(k) >= 0) ? k : 'cards';
/* is this game actually installed on this phone, with a way to send a move? */
function gamePlayable(k){
  if (k === 'cards') return true;
  const P = window.KARTI_PARTY;
  return !!(P && P.online && P.online[k] && P.online[k].start && P.online[k].remote);
}

/* ═══════════════════════════════════════════════════════════════════
   THE ONE SHARED LOBBY, AND WHERE IT READS A GAME FROM
   ───────────────────────────────────────────────────────────────────
   Every party game feeds ONE lobby. This file must therefore be able
   to answer four questions about a game it has never heard of:

       how many chairs · how hard can the machine be ·
       what are the rules · how do I start it

   IL-KIRI shipped the reference answer as window.KARTI_KIRI.lobby and
   hung the same fields on its hub tile. That is the contract, and it
   is read here — not guessed at:

       id · name · minSeats · maxSeats · defaultLevel
       levels    [{level, name, blurb}]
       isReady(seat)      cpu -> true always; human -> seat.ready
       autoReady(seat)    marks a machine ready, leaves people alone
       canStart(seats)    -> {ok, why}   `why` is display-ready TEXT
       rulesHTML()        the short panel
       blurb, myName()
       start(seats, opts) seats:[{name,kind,level,link}]
                          opts:{roundLimit,clock,seed}

   NOT every game has published it yet. So this resolves a contract in
   four steps, keeps a note of every field it had to fill in itself,
   and NEVER throws: a game that published nothing at all still gets a
   working lobby with honest words in it, and lobbyReport() says
   exactly what each game still owes. Degrading is the behaviour; the
   report is how it gets fixed.
   ═══════════════════════════════════════════════════════════════════ */

/* where a game hangs its contract, if it has one */
const LOBBY_GLOBAL = {
  kiri:'KARTI_KIRI', skarta:'KARTI_SKARTA', tombla:'KARTI_TOMBLA', klabb:'KARTI_KLABB',
  gharraq:'KARTI_GHARRAQ', rummy:'KARTI_RUMMY'
};

/* LAST-RESORT SEAT RANGES — [min, max, sensible default].
   These MIRROR GAME_SEATS in server/karti_server.py and exist only for a game
   that has not published minSeats/maxSeats itself. They are not the authority:
   the relay refuses a size outside its own range, so a wrong number here fails
   loudly at create time rather than seating people who cannot play. */
const SEATS_FALLBACK = {
  cards:[2, 2, 2], chess:[2, 2, 2], dama:[2, 2, 2],
  skarta:[2, 10, 6], klabb:[2, 4, 4], kiri:[2, 8, 4], tombla:[2, 16, 8],
  gharraq:[2, 6, 4], rummy:[2, 12, 4], gin:[2, 2, 2]
};

/* A machine has to be called something before it can sit down. Only used when
   the game published no level names of its own — we do not invent Maltese for
   somebody else's game. */
const LEVELS_FALLBACK = [
  { level:1, name:'Gentle',  note:'Will miss things.' },
  { level:2, name:'Normal',  note:'Plays properly.' },
  { level:3, name:'Ruthless', note:'Plays to win.' }
];

/* the tile a game put on the party shelf, if js/party.js is on this phone */
function shelfTile(k){
  try {
    const P = window.KARTI_PARTY;
    if (!P || !P.games) return null;
    return P.games().find(g => g && g.id === k) || null;
  } catch (e){ return null; }
}

/* the game's own global, if it has one */
function gameGlobal(k){
  const name = LOBBY_GLOBAL[k];
  try { return name ? (window[name] || null) : null; } catch (e){ return null; }
}

const LOBBY_CACHE = {};

/* one normalised contract for `k`, built from whatever that game published.
   Cached, because it is read on every repaint of the roster. */
function gameLobby(k){
  k = cleanGame(k);
  /* The cache is a repaint optimisation, not a snapshot of the world. This
     file loads BEFORE the game files, so a lobby read during boot saw no
     transport and pinned online:false — and the game then said "Not on this
     phone" for the whole session however long you waited. Cache the shape,
     which cannot change; re-read the liveness, which can. */
  if (LOBBY_CACHE[k]){
    const c = LOBBY_CACHE[k];
    c.online = !!(window.KARTI_PARTY && window.KARTI_PARTY.online &&
                  window.KARTI_PARTY.online[k]);
    return c;
  }

  const meta  = gameMeta(k);
  const G     = gameGlobal(k);
  const pub   = (G && G.lobby && typeof G.lobby === 'object') ? G.lobby : null;
  const tile  = shelfTile(k);
  const gaps  = [];
  const fb    = SEATS_FALLBACK[k] || [2, 2, 2];

  /* ── seats ── */
  let min = num(pub && pub.minSeats);
  let max = num(pub && pub.maxSeats);
  if (min == null && tile && tile.seats) min = num(tile.seats.min);
  if (max == null && tile && tile.seats) max = num(tile.seats.max);
  if (min == null || max == null){ gaps.push('minSeats/maxSeats'); }
  min = Math.max(2, min == null ? fb[0] : min);
  max = Math.max(min, Math.min(16, max == null ? fb[1] : max));
  const def = Math.max(min, Math.min(max, fb[2]));

  /* ── the machine, by name ── */
  let levels = list(pub && pub.levels) || list(tile && tile.levels);
  if (!levels){ gaps.push('levels'); levels = LEVELS_FALLBACK; }
  levels = levels.slice(0, 5).map((L, i) => ({
    level: num(L && (L.level != null ? L.level : L.k)) || (i + 1),
    name:  String((L && (L.name || L.n)) || ('Level ' + (i + 1))).slice(0, 22),
    note:  String((L && (L.note || L.blurb || L.t)) || '').slice(0, 80)
  }));
  let defLevel = num(pub && pub.defaultLevel);
  if (defLevel == null) defLevel = levels.length > 1 ? levels[1].level : levels[0].level;

  /* ── the rules, folded open in place ── */
  let rulesHTML = fn(pub && pub.rulesHTML) || fn(tile && tile.rulesHTML);
  const blurb = String((pub && pub.blurb) || (tile && tile.tag) || meta.blurb || '');
  if (!rulesHTML){
    gaps.push('rulesHTML');
    /* An honest panel beats an empty one and beats a crash. Whatever the game
       DID say about itself, said properly, plus the one thing the lobby always
       knows: how many chairs there are. */
    rulesHTML = () =>
      '<p>' + esc(blurb || 'This one has not written its short rules for the lobby yet.') + '</p>' +
      '<p><b>' + esc(meta.name) + '</b> seats ' + min + ' to ' + max + '. ' +
      'The full rules are in the game itself, off the party shelf.</p>';
  }

  /* ── how it is started ── */
  const startFn = fn(pub && pub.start) || fn(tile && tile.start);
  if (!startFn) gaps.push('start');

  /* ── the transport: the half that actually carries a move ── */
  const P = window.KARTI_PARTY;
  const net = (P && P.online && P.online[k]) || null;
  if (!net || !net.remote) gaps.push('online.' + k + ' {start,remote,note,stop,live}');

  /* ── ready, and who is allowed to hold a table up ── */
  const isReady = fn(pub && pub.isReady) ||
    (s => !!(s && (s.kind === 'cpu' || s.ready)));
  const autoReady = fn(pub && pub.autoReady) ||
    (s => (s && s.kind === 'cpu') ? Object.assign({}, s, { ready:true }) : s);

  /* canStart says WHY in words, never a code. A game that published its own
     wording wins; ours is the fallback and is written to read the same way. */
  const canStart = fn(pub && pub.canStart) || (seats => {
    const n = (seats || []).length;
    if (n < min) return { ok:false, why:'It takes ' + min + ' to play ' + meta.name + '.' };
    if (n > max) return { ok:false, why:max + ' is as many as this table seats.' };
    const not = (seats || []).filter(s => s && !isReady(s)).length;
    if (not) return { ok:false,
      why:not + (not > 1 ? ' people are' : ' person is') + ' not ready yet.' };
    return { ok:true, why:'' };
  });

  const L = {
    id:k, name:meta.name, short:meta.short, mt:(pub && pub.mt) || '',
    minSeats:min, maxSeats:max, defaultSeats:def,
    levels, defaultLevel:defLevel,
    isReady, autoReady, canStart, rulesHTML, blurb,
    myName: fn(pub && pub.myName) || (() => myPresenceName()),
    start:startFn, net,
    /* how this game's own move object folds onto the relay's five bounded
       fields. See toWire/fromWire — a game that publishes one wins. */
    wire: (pub && pub.wire) || null,
    /* Can a room of this be OPENED at all? A lobby with no way to send a move
       is a room nobody can play in, so it is not offered — but it is named. */
    online: !!(net && net.start && net.remote),
    gaps,
    /* published nothing we could not have guessed */
    bare: !pub
  };
  LOBBY_CACHE[k] = L;
  return L;
}

function num(v){ return (typeof v === 'number' && isFinite(v)) ? Math.floor(v) : null; }
function list(v){ return (Array.isArray(v) && v.length) ? v : null; }
function fn(v){ return (typeof v === 'function') ? v : null; }

/* WHAT EACH GAME STILL OWES THE LOBBY.
   Not decoration: this is the list to hand to whoever owns that game's file.
   KARTI_MP.lobbyReport() in the console, and docs/ONLINE.md carries a copy. */
function lobbyReport(){
  return GAME_KEYS.map(k => {
    const L = gameLobby(k);
    return { game:k, name:L.name, seats:[L.minSeats, L.maxSeats],
             online:L.online, publishedContract:!L.bare, needs:L.gaps.slice() };
  });
}
/* the mark for a game. chess and dama borrow the piece sprite party.js
   injects; if party.js is not loaded yet we fall back to a plain icon
   rather than draw a hole. */
function gameIcon(k){
  const g = gameMeta(k);
  const P = window.KARTI_PARTY;
  if (g.sym && P && P.ui && P.ui.sprite){
    try { P.ui.sprite(); } catch (e){}
    return '<svg class="mp-gsym" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
           '<use href="#' + g.sym + '"></use></svg>';
  }
  return ico(g.icon || 'deck');
}
function rand32(){
  try {
    const a = new Uint32Array(1);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return a[0] >>> 0;
  } catch (e){
    return (Math.floor(Math.random() * 0x100000000)) >>> 0;
  }
}

/* ───────────────────────── deck choices ─────────────────────────
   Pass-and-play is a party mode: both seats may use any starter deck
   whether or not this profile owns the cards. Your own saved decks show
   up too, as long as they are legal. */
function deckOptions(){
  const out = [];
  Object.keys(K.STARTER_DECKS).forEach(k => {
    const sd = K.STARTER_DECKS[k];
    /* the deck's own `e` is still an emoji in the card data — draw the faction
       icon instead so the seat picker matches the rest of the UI */
    out.push({ key:k, id:'starter:' + k, name:sd.name,
               e:(K.ATTR_ICON ? ico(K.ATTR_ICON[sd.f || k] || 'deck') : ico('deck')),
               c:sd.c, kind:'starter', list:sd.list, attr: sd.f || k });
  });
  (K.S.decks || []).forEach(d => {
    if (!K.deckIsLegal(d.list)) return;
    const sd = d.starter && K.STARTER_DECKS[d.starter];
    out.push({ key:d.starter || null, id:'mine:' + d.id, name:d.name, e:'' + ico('deck') + '',
               c: sd ? sd.c : '#8A5CFF', kind:'yours', list:d.list,
               attr: sd ? (sd.f || d.starter) : null });
  });
  return out;
}
function deckPicker(host, chosenId, onPick){
  const opts = deckOptions();
  host.innerHTML = '';
  opts.forEach(o => {
    const b = document.createElement('button');
    b.className = 'deckopt' + (o.id === chosenId ? ' on' : '');
    b.style.setProperty('--dc', o.c);
    b.setAttribute('aria-pressed', String(o.id === chosenId));
    b.innerHTML = '<div class="e">' + o.e + '</div><div class="n">' + esc(o.name) + '</div>' +
                  '<div class="k">' + (o.kind === 'starter' ? 'starter' : 'your deck') + '</div>';
    b.onclick = () => onPick(o);
    host.appendChild(b);
  });
  return opts;
}
const findDeck = id => deckOptions().find(o => o.id === id) || deckOptions()[0];

/* ═══════════════════════════════════════════════════════════════════
   1 · PASS AND PLAY
   ═══════════════════════════════════════════════════════════════════ */
const PNP = { seats:[null, null], flipped:false, live:false };

function pnpScreen(){
  const opts = deckOptions();
  const a = PNP.seats[0] || { name:'PLAYER 1', deckId: opts[0].id };
  const b = PNP.seats[1] || { name:'PLAYER 2', deckId: (opts[1] || opts[0]).id };
  PNP.seats = [a, b];

  $('#scr-pnp').innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="pp-back" aria-label="Back to home">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Pass &amp; Play</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<p class="blurb">Two players, one phone. Between every turn the screen covers itself so ' +
      'the next one cannot see your hand. <b>No internet, no server, nothing to set up.</b> ' +
      'Nothing here is added to your collection — this is a friendly.</p>' +
      '<div class="seatgrid">' +
        seatCard(0, a) + seatCard(1, b) +
      '</div>' +
      '<div style="display:grid;gap:9px;padding-bottom:24px">' +
        '<button class="btn hot" id="pp-go">' + ico('type-monster') + ' Start the duel</button>' +
        '<button class="btn ghost" id="pp-swap">' + ico('refresh') + ' Swap who goes first</button>' +
      '</div>' +
    '</div>';

  $('#pp-back').onclick = () => K.go('home');
  $('#pp-go').onclick = pnpStart;
  $('#pp-swap').onclick = () => { PNP.seats.reverse(); pnpScreen(); K.toast(PNP.seats[0].name + ' goes first.'); };

  [0, 1].forEach(i => {
    const nm = $('#pp-name-' + i);
    nm.oninput = () => { PNP.seats[i].name = nm.value.toUpperCase().slice(0, 14) || ('PLAYER ' + (i + 1)); };
    deckPicker($('#pp-deck-' + i), PNP.seats[i].deckId, o => {
      PNP.seats[i].deckId = o.id; pnpScreen();
    });
  });
}
function seatCard(i, s){
  return '<div class="seatcard ' + (i ? 'b' : 'a') + '">' +
    '<h3><span class="dot"></span>SEAT ' + (i + 1) + (i ? '' : ' · goes first') + '</h3>' +
    '<input class="field seatname" id="pp-name-' + i + '" maxlength="14" value="' + esc(s.name) +
      '" aria-label="Seat ' + (i + 1) + ' name">' +
    '<div class="tiny">Deck</div><div class="deckpick" id="pp-deck-' + i + '"></div></div>';
}

function pnpStart(){
  const A = PNP.seats[0], B = PNP.seats[1];
  const da = findDeck(A.deckId), db = findDeck(B.deckId);
  A.deck = da; B.deck = db;
  PNP.flipped = false; PNP.live = true;
  window.KHOOK = { afterEndTurn: pnpHandover, result: pnpResult };

  K.startCustomDuel({
    myList: da.list, myName: A.name, myKey: da.attr, mode:'pnp', diff:'regular',
    foe: { name:B.name, list:db.list, deckKey:db.attr, isAI:false },
    first: A.name + ' goes first.'
  });
  K.toast(A.name + ' goes first. ' + B.name + ', look away.');
}

/* the seat currently sitting in engine slot 0 */
const seatAt = slot => PNP.seats[PNP.flipped ? 1 - slot : slot];

/* Called by game.js the moment a turn ends. Drop the curtain and stop the
   normal "now the AI moves" path. */
function pnpHandover(){
  if (!PNP.live || !K.D || K.D.over) return false;
  const next = seatAt(1);                       /* whose turn it now is */
  const me   = seatAt(0);
  const hand = $('#me-hand');
  if (hand) hand.innerHTML = '';                /* belt and braces: nothing left on screen */
  const el = $('#handover');
  el.setAttribute('aria-hidden', 'false');
  el.innerHTML =
    '<div class="eyes">' + ico('lock') + '</div>' +
    '<h2>PASS THE PHONE</h2>' +
    '<div class="to">' + esc(next.name) + '</div>' +
    '<p>' + esc(me.name) + ' is done. Do not look at the screen until it is your turn — ' +
    'and no peeking at the log either, ħi.</p>' +
    '<div class="lpline">' +
      '<span class="pill">' + esc(next.name) + ' <span class="mono">' + K.D.p[1].lp + '</span></span>' +
      '<span class="pill">' + esc(me.name) + ' <span class="mono">' + K.D.p[0].lp + '</span></span>' +
      '<span class="pill">Turn <span class="mono">' + K.D.turnCount + '</span></span>' +
    '</div>' +
    '<button class="btn primary" id="ho-go">' + ico('play') + ' I am ' + esc(next.name) + ' — my turn</button>' +
    '<button class="btn ghost" id="ho-quit" style="max-width:340px">Give up and go home</button>';
  el.classList.add('on');
  $('#ho-go').onclick = pnpResume;
  $('#ho-quit').onclick = () => { hideCurtain(); pnpEnd(); K.D = null; K.go('home'); };
  return true;
}
function hideCurtain(){
  const el = $('#handover');
  if (!el) return;
  el.classList.remove('on');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '';
}
/* Swap the two seats over so the player holding the phone is always slot 0.
   Safe here and only here: endTurn() has already returned stolen monsters and
   cleared this-turn buffs, so nothing in the engine holds a stale side index. */
function pnpResume(){
  const D = K.D;
  if (!D){ hideCurtain(); return; }
  const t = D.p[0]; D.p[0] = D.p[1]; D.p[1] = t;
  D.turn = 1 - D.turn;
  PNP.flipped = !PNP.flipped;
  hideCurtain();
  K.resetUI();
  K.renderDuel();
  K.toast(seatAt(0).name + ' — you are up.');
}
function pnpResult(winner, why){
  if (!PNP.live) return false;
  const wSeat = seatAt(winner);
  const lSeat = seatAt(1 - winner);
  hideCurtain();
  K.openModal(
    '<div class="result">' +
      '<div class="big win">' + esc(wSeat.name) + '</div>' +
      '<p class="tiny">wins it</p>' +
      '<p class="muted">' + esc(why) + '</p>' +
      '<p class="muted" style="font-style:italic">' + esc(K.pickOne([
        lSeat.name + ' would like everyone to know the shuffle was suspicious.',
        lSeat.name + ' is already explaining what went wrong.',
        'Best of three? ' + lSeat.name + ' says best of three.'])) + '</p>' +
      '<p class="tiny" style="line-height:1.6">Friendly game — no coins, no packs, ' +
        'nothing touched in ' + esc(K.displayName()) + '\'s collection.</p>' +
      '<div style="display:grid;gap:9px;width:100%;margin-top:4px">' +
        '<button class="btn hot" id="pr-again">↻ Run it back</button>' +
        '<button class="btn ghost" id="pr-set">' + ico('users') + ' Change seats or decks</button>' +
        '<button class="btn ghost" id="pr-home">Back to menu</button>' +
      '</div>' +
    '</div>');
  $('#pr-again').onclick = () => { K.closeModal(); pnpStart(); };
  $('#pr-set').onclick = () => { K.closeModal(); pnpEnd(); K.D = null; pnpScreen(); K.go('pnp'); };
  $('#pr-home').onclick = () => { K.closeModal(); pnpEnd(); K.D = null; K.go('home'); };
  return true;
}
function pnpEnd(){ PNP.live = false; PNP.flipped = false; window.KHOOK = null; }

/* ═══════════════════════════════════════════════════════════════════
   2 · ONLINE
   ═══════════════════════════════════════════════════════════════════ */
const MP = {
  ws:null, url:'', intent:null, joinId:null,
  code:null, token:null, host:false, lastSeq:0,
  live:false, joined:false, peerHere:false,
  myDeckId:null, myName:'', peerName:'', peerList:null, peerKey:null,
  state:'idle', note:'', tries:0,
  retryTimer:null, openTimer:null, pingTimer:null, lastPong:0,
  transport:null, seed:0,
  /* room-list era: did we ask for a private room, did we actually GET one, when
     did it open (for the "waiting 34s" line), and the 1s clock that paints it */
  wantPrivate:false, private:false, openedAt:0, waitTimer:null, autoNote:false,
  /* which game. `game` is what the ROOM says it is (the relay tells us, so we
     never have to take the other player's word for it); wantGame is what we
     asked for when opening; joinHint is what the room list said when we tapped
     it, and is only ever used against a relay too old to answer. */
  game:'cards', wantGame:'cards', joinHint:null, filter:'all',
  /* the two halves of the colour draw, and whether a board is on screen */
  myNonce:null, peerNonce:null, boardLive:false,
  /* the invitation we are taking up, and whether the relay took our session */
  inviteId:null, authProbe:false,
  /* set when we arrived with the game already decided and went straight for a
     seat: if that seat has gone, open a room of the same game rather than
     showing a menu the player has already answered */
  autoOpen:null,

  /* ── THE TABLE ────────────────────────────────────────────────────
     Everything below is only ever set for a room with more than two
     chairs in it. A duel never touches any of it and the relay never
     sends any of it to one, so the two-player path is byte for byte
     what it always was. */
  size:2,               /* chairs the ROOM has, straight from the relay   */
  mySeat:0,             /* which one is mine, straight from the relay     */
  roster:null,          /* the last {t:'table'} — the whole truth on who  */
  iAmReady:false,       /* my own bit, echoed back by the roster          */
  wantSeats:0,          /* chairs we asked for when we opened it          */
  variant:null,         /* which flavour, where a game has flavours       */
  showRules:false,      /* the rules panel, folded open IN PLACE          */
  panel:null,           /* which inline drawer is open: 'ai' | 'ask' | null */
  aiSeat:-1,            /* the empty chair the machine picker is aimed at */
  began:null,           /* the relay's {t:'began'} — seed, bots, levels    */
  askBack:null,         /* somebody to invite the moment we have a room     */
  unMove:null           /* unsubscribe from the game's own move feed        */
};

/* ═══════════════════════════════════════════════════════════════════
   WHO IS AROUND — the social half
   ───────────────────────────────────────────────────────────────────
   The room list answers "what is open". This answers "who would say
   yes". Both come off the same relay; only this one needs an account,
   because only signed-in players are ever named in it (see
   docs/ONLINE.md, "What presence says and what it refuses to say").

   It rides the presence BEACON socket, not an HTTP route, for one
   reason that matters more than tidiness: a socket dies the instant
   the app is closed, so somebody who has gone stops being invitable
   at once instead of lingering in a poll for twelve seconds. An idle
   player who is not actually there is worse than no list at all.
   ═══════════════════════════════════════════════════════════════════ */
const WHO = {
  people:[],       /* [{n,s,g,c,m,id}] — waiting first, then idle, then playing */
  recent:[],       /* [{n,s,g,games,ago,id}] — recently played with            */
  here:0, sockets:0,
  me:null,         /* {n,s,vis}                                                */
  asked:0,         /* when we last asked, ms                                   */
  got:false,       /* have we ever had an answer                               */
  off:false,       /* the relay said "sign in first" — no account, no list     */
  knocks:[]        /* [{id,from,game,ago}] — invites left while we were away    */
};
const WHO_MIN_GAP = 3500;   /* never ask faster than this, whatever nudges us */
const KNOCK_MAX   = 6;

/* ═══════════════════════════════════════════════════════════════════
   INVITES — "come and play chess", left for a NAMED player
   ───────────────────────────────────────────────────────────────────
   The room list is for whoever turns up. This is for asking one
   particular person, by their account name, and having it waiting for
   them when they open the app.

   It needs an account on BOTH sides: you have to be signed in to send
   one (an anonymous socket may not spray invites at named players),
   and it is addressed to an account rather than to a socket so it
   survives them being offline. Everything else — the room code, who
   is where — stays exactly as private as it was.

   IN-APP ONLY, and said plainly in the UI: this reaches you when the
   app is open, not on a locked phone. Real lock-screen notifications
   need Web Push, VAPID keys and an installed PWA; see docs/ONLINE.md.
   ═══════════════════════════════════════════════════════════════════ */
const INBOX = { list:[], name:'', authed:false };
const INBOX_MAX = 8;

/* The session token belongs to js/sync.js, which is not ours to edit. Ask it
   nicely first, and fall back to the localStorage key it writes. If neither
   works we simply do not offer invites — never a broken button. */
function sessionToken(){
  try {
    const S = window.KARTI_SYNC;
    if (S && typeof S.token === 'function'){
      const t = S.token();
      if (typeof t === 'string' && t.length >= 16) return t;
    }
  } catch (e){}
  try {
    const active = JSON.parse(localStorage.getItem('karti_active') || 'null');
    if (!active) return '';
    const s = JSON.parse(localStorage.getItem('karti_sync_' + active) || 'null');
    return (s && typeof s.tok === 'string' && s.tok.length >= 16) ? s.tok : '';
  } catch (e){ return ''; }
}
const canInvite = () => !!sessionToken();

/* one invite, normalised. It arrives over the public internet like everything
   else, so nothing in it is drawn without being bounded first. */
function inboxAdd(m){
  if (!m || typeof m.id !== 'string' || !m.id) return;
  const left = (typeof m.left === 'number' && isFinite(m.left) && m.left > 0)
    ? Math.min(3600, Math.floor(m.left)) : 0;
  if (!left) return;
  const row = {
    id: m.id.slice(0, 64),
    from: ((typeof m.from === 'string' && m.from) ? m.from : 'SOMEBODY').slice(0, NAME_MAX),
    game: cleanGame(m.game),
    until: Date.now() + left * 1000
  };
  INBOX.list = INBOX.list.filter(x => x.id !== row.id);
  INBOX.list.unshift(row);
  INBOX.list = INBOX.list.slice(0, INBOX_MAX);
  inboxPaint();
}
function inboxDrop(id){
  INBOX.list = INBOX.list.filter(x => x.id !== id);
  inboxPaint();
}
/* an invite that has run out of time is not an invite */
function inboxLive(){
  const now = Date.now();
  const before = INBOX.list.length;
  INBOX.list = INBOX.list.filter(x => x.until > now);
  if (INBOX.list.length !== before) inboxPaint();
  return INBOX.list;
}
function inboxPaint(){ paintHomePanel(); paintInvites(); }

/* the game picker remembers itself, so somebody who only ever plays chess
   opens Online and finds chess already chosen */
function storedGame(){
  try { return cleanGame(localStorage.getItem('karti.mp.game') || 'cards'); }
  catch (e){ return 'cards'; }
}
function rememberGame(k){
  try { localStorage.setItem('karti.mp.game', cleanGame(k)); } catch (e){}
}

/* "34s" / "6m" / "2h" — used both for how long a room has waited and for how
   long you have been sitting in your own. */
function ago(sec){
  let s = Math.max(0, Math.floor(sec || 0));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h';
}

/* deterministic RNG — both devices must roll the same numbers in the same
   order or the two boards drift apart */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ── where is the relay? ──────────────────────────────────────────────
   1. ?relay=wss://…  (also remembered, so a tester can pin it once)
   2. whatever was remembered in localStorage
   3. this page is plain http  ->  the relay is probably on this machine
   4. otherwise the production funnel URL above                          */
function storedRelay(){
  try { return localStorage.getItem('karti.relay') || ''; } catch (e){ return ''; }
}
function rememberRelay(u){
  try { u ? localStorage.setItem('karti.relay', u) : localStorage.removeItem('karti.relay'); }
  catch (e){}
}
function defaultURL(){
  let q = '';
  try { q = new URLSearchParams(location.search).get('relay') || ''; } catch (e){}
  if (q && /^wss?:\/\//i.test(q)){ rememberRelay(q); return q; }
  const kept = storedRelay();
  if (kept && /^wss?:\/\//i.test(kept)) return kept;
  if (location.protocol === 'http:' && location.hostname)
    return 'ws://' + location.hostname + ':' + DEV_RELAY_PORT + DEV_RELAY_PATH;
  return RELAY_URL;
}
const isSecurePage = () => location.protocol === 'https:';
const cleanCode = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
                        .split('').filter(c => CODE_ALPHABET.indexOf(c) >= 0)
                        .join('').slice(0, CODE_LEN);

/* ── connection state, said out loud ───────────────────────────────── */
const STATES = {
  idle:        { dot:'off',  text:'Not in a room yet' },
  ok:          { dot:'on',   text:'Server is up.' },
  connecting:  { dot:'wait', text:'Connecting to the server…' },
  waiting:     { dot:'wait', text:'Waiting for your opponent to join…' },
  ready:       { dot:'on',   text:'Connected — dealing the cards…' },
  live:        { dot:'on',   text:'Connected. Duel in progress.' },
  reconnecting:{ dot:'wait', text:'Connection lost — trying to get back in…' },
  gone:        { dot:'bad',  text:'Your opponent left.' },
  unreachable: { dot:'bad',  text:'Cannot reach the server.' },
  stopped:     { dot:'bad',  text:'The duel was stopped.' }
};
function setState(key, note){
  MP.state = key;
  MP.note = note || '';
  MP.autoNote = false;
  paintState();
}
/* The status line must never contradict the list underneath it — "Not connected"
   above eight joinable rooms is nonsense, and so is a cheerful line above a red
   "cannot reach the server" box. So the shared presence poll keeps it honest,
   but ONLY while we are between rooms: the moment a real connection state has
   something to say (connecting, waiting, live, stopped…) it owns the line and
   this stays out of the way. */
function presenceNote(open, by){
  if (!(MP.state === 'idle' || MP.state === 'ok' || MP.autoNote)) return;
  let key, note;
  if (PR.err){
    key = 'unreachable';
    note = 'Cannot reach the server — the list below is not an answer.';
  } else if (!PR.tried || !PR.data){
    return;
  } else if (open > 0){
    key = 'ok';
    /* say what KIND of rooms, not just how many — that is the whole point */
    const parts = by ? GAME_KEYS.filter(k => by[k] > 0)
                                .map(k => by[k] + ' ' + gameMeta(k).short.toLowerCase())
                     : [];
    note = open + (open === 1 ? ' room is' : ' rooms are') + ' open' +
           (parts.length > 1 ? ' (' + parts.join(', ') + ')' : '') + '. Tap one to join.';
  } else {
    key = 'ok';
    note = 'Server is up. Nobody is waiting — open a room and they will see it.';
  }
  setState(key, note);
  MP.autoNote = true;
}
function paintState(){
  /* While a board game is up the lobby is not on screen, so the connection
     has one place to speak: the thin line above the board. Nothing at all is
     said while everything is fine. */
  if (MP.boardLive){
    const api = partyAPI();
    if (api && api.note){
      const s = STATES[MP.state] || STATES.idle;
      const tone = s.dot === 'bad' ? 'bad' : s.dot === 'wait' ? 'warn' : '';
      api.note(MP.state === 'live' ? '' : (MP.note || s.text), tone);
    }
  }
  const host = $('#mp-stat');
  if (!host) return;
  const s = STATES[MP.state] || STATES.idle;
  host.className = 'mp-state mp-' + s.dot;
  host.innerHTML = '<span class="mp-dot"></span><span class="mp-txt">' +
                   esc(MP.note || s.text) + '</span>';
}

/* mp.js owns no stylesheet (css/ belongs to another part of the build), so the
   handful of classes the lobby needs are injected once, at runtime. */
function injectCSS(){
  if (document.getElementById('mp-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'mp-runtime-css';
  st.textContent =
    '#scr-mp .mp-state{display:flex;align-items:center;gap:9px;margin:10px 0 14px;' +
      'padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.4;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10)}' +
    '#scr-mp .mp-dot{flex:0 0 auto;width:10px;height:10px;border-radius:50%;' +
      'background:#7A8194;box-shadow:0 0 0 3px rgba(122,129,148,.18)}' +
    '#scr-mp .mp-on .mp-dot{background:#3DDC84;box-shadow:0 0 0 3px rgba(61,220,132,.20)}' +
    '#scr-mp .mp-bad .mp-dot{background:#FF5468;box-shadow:0 0 0 3px rgba(255,84,104,.20)}' +
    '#scr-mp .mp-wait .mp-dot{background:#FFC542;box-shadow:0 0 0 3px rgba(255,197,66,.20);' +
      'animation:mpPulse 1.1s ease-in-out infinite}' +
    '@keyframes mpPulse{0%,100%{opacity:1}50%{opacity:.35}}' +
    '#scr-mp .mp-code{font:700 34px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'letter-spacing:.16em;text-align:center;padding:16px 10px;margin:12px 0;' +
      'border-radius:14px;background:rgba(255,255,255,.06);' +
      'border:1px dashed rgba(255,255,255,.22)}' +
    '#scr-mp .mp-box{padding:11px 13px;border-radius:12px;font-size:13px;line-height:1.55;' +
      'margin:10px 0;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10)}' +
    '#scr-mp .mp-box.warn{background:rgba(255,197,66,.10);border-color:rgba(255,197,66,.35)}' +
    '#scr-mp .mp-box.bad{background:rgba(255,84,104,.10);border-color:rgba(255,84,104,.35)}' +
    '#scr-mp .mp-codein{text-align:center;letter-spacing:.28em;text-transform:uppercase;' +
      'font:700 22px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}' +
    '#scr-mp .mp-url{font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}' +

    /* ── which game (one tap, before you open a room) ── */
    '#scr-mp .mp-pick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;' +
      'margin:2px 0 4px}' +
    '#scr-mp .mp-g{display:flex;flex-direction:column;align-items:center;gap:5px;' +
      'min-height:92px;padding:11px 6px 9px;border-radius:15px;color:#F4EFFF;cursor:pointer;' +
      'text-align:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);' +
      'transition:background .14s,border-color .14s}' +
    '#scr-mp .mp-g[aria-pressed="true"]{background:rgba(255,197,66,.14);' +
      'border-color:rgba(255,197,66,.55)}' +
    '#scr-mp .mp-g:active{background:rgba(255,255,255,.09)}' +
    '#scr-mp .mp-g b{font:900 11px/1.15 var(--disp);' +
      'letter-spacing:.05em;text-transform:uppercase}' +
    '#scr-mp .mp-g i{font-style:normal;font-size:9.5px;line-height:1.35;color:#A093C4}' +
    '#scr-mp .mp-gi{height:26px;font-size:22px;line-height:1;color:#A093C4;display:block}' +
    '#scr-mp .mp-g[aria-pressed="true"] .mp-gi{color:#FFC542}' +
    '#scr-mp .mp-gi .ico{width:24px;height:24px}' +
    '#scr-mp .mp-gsym{width:24px;height:24px;display:block;fill:currentColor;stroke:none}' +
    '#scr-mp .mp-g[disabled]{opacity:.45}' +

    /* ── filter chips over the list ── */
    '#scr-mp .mp-filt{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 9px}' +
    '#scr-mp .mp-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;' +
      'border-radius:999px;font:700 10.5px/1 var(--disp);' +
      'letter-spacing:.08em;text-transform:uppercase;color:#A093C4;cursor:pointer;' +
      'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12)}' +
    '#scr-mp .mp-chip[aria-pressed="true"]{color:#241800;background:#FFC542;' +
      'border-color:#FFC542}' +
    '#scr-mp .mp-chip .n{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.85}' +

    /* ── what kind of room this row is ── */
    '#scr-mp .mp-rtag{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;' +
      'margin-right:6px;border-radius:999px;font:900 9px/1.35 var(--disp)' +
      'system-ui,sans-serif;letter-spacing:.1em;vertical-align:1px}' +
    '#scr-mp .mp-rtag .mp-gsym,#scr-mp .mp-rtag .ico{width:11px;height:11px}' +
    '#scr-mp .g-cards{color:#FFC542;background:rgba(255,197,66,.16);' +
      'border:1px solid rgba(255,197,66,.4)}' +
    '#scr-mp .g-chess{color:#8FD8FF;background:rgba(94,190,255,.16);' +
      'border:1px solid rgba(94,190,255,.42)}' +
    '#scr-mp .g-dama{color:#FF9F86;background:rgba(255,120,90,.16);' +
      'border:1px solid rgba(255,120,90,.42)}' +

    /* ── invitations ──
       NOT scoped to #scr-mp: the same card is drawn on the home screen, in
       the who's-online panel, which is not inside our screen. Every selector
       here starts with .mp-, so it can still only reach what we drew. */
    '.mp-inbox{display:flex;flex-direction:column;gap:8px;margin:10px 0 14px}' +
    '.mp-invite{display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:15px;' +
      'background:linear-gradient(180deg,rgba(61,220,132,.16),rgba(61,220,132,.05));' +
      'border:1px solid rgba(61,220,132,.45);color:#F4EFFF}' +
    '.mp-ivi{flex:0 0 auto;width:34px;height:34px;border-radius:11px;display:grid;' +
      'place-items:center;color:#3DDC84;background:rgba(61,220,132,.16);' +
      'border:1px solid rgba(61,220,132,.34)}' +
    '.mp-ivi .ico,.mp-ivi .mp-gsym{width:19px;height:19px}' +
    '.mp-ivw{flex:1;min-width:0;font-size:12.5px;line-height:1.45}' +
    '.mp-ivw b{font-family:var(--disp);font-size:12px;' +
      'letter-spacing:.04em}' +
    '.mp-ivw i{display:block;font-style:normal;margin-top:2px;font-size:10px;' +
      'letter-spacing:.09em;text-transform:uppercase;font-weight:700;color:#8FE7B6}' +
    '.mp-ivb{flex:0 0 auto;display:flex;align-items:center;gap:6px}' +
    '.mp-ivgo{padding:9px 13px;border-radius:11px;background:#3DDC84;color:#062C17;' +
      'font:900 12px/1 var(--disp);letter-spacing:.09em;' +
      'cursor:pointer;border:0}' +
    '.mp-ivno{width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,.06);' +
      'border:1px solid rgba(255,255,255,.14);color:#A093C4;font-size:14px;cursor:pointer}' +
    '.mp-ivgo:active,.mp-ivno:active{transform:scale(.94)}' +
    '#scr-mp .mp-who{display:flex;flex-wrap:wrap;gap:6px}' +
    '#scr-mp .mp-ask{margin:14px 0 12px}' +
    '#scr-mp .mp-quiet{display:block;margin-top:5px;color:#7F73A0;font-size:11.5px}' +

    /* ── the room list: the primary way in ── */
    '#scr-mp .mp-rhead{display:flex;align-items:center;gap:8px;margin:2px 0 9px}' +
    '#scr-mp .mp-rhead h3{flex:1;font-size:12px;letter-spacing:.15em;text-transform:uppercase;' +
      'color:#EFE7FF}' +
    '#scr-mp .mp-rcount{flex:0 0 auto;padding:4px 9px;border-radius:999px;font:700 11px/1.4 ' +
      'ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;' +
      'background:rgba(255,197,66,.14);color:#FFC542;border:1px solid rgba(255,197,66,.32)}' +
    '#scr-mp .mp-ref{flex:0 0 auto;width:34px;height:34px;border-radius:11px;display:grid;' +
      'place-items:center;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);' +
      'color:#A093C4;cursor:pointer}' +
    '#scr-mp .mp-ref:active{transform:scale(.92)}' +
    '#scr-mp .mp-rlist{display:flex;flex-direction:column;gap:8px}' +
    '#scr-mp .mp-room{display:flex;align-items:center;gap:11px;width:100%;text-align:left;' +
      'min-height:64px;padding:10px 12px;border-radius:15px;color:#F4EFFF;cursor:pointer;' +
      'border:1px solid rgba(255,197,66,.45);' +
      'background:linear-gradient(180deg,rgba(255,197,66,.14),rgba(255,197,66,.05));' +
      'transition:transform .13s ease,background .13s}' +
    '#scr-mp .mp-room:active{transform:scale(.985);background:rgba(255,197,66,.20)}' +
    '#scr-mp .mp-rav{flex:0 0 auto;width:40px;height:40px;border-radius:13px;display:grid;' +
      'place-items:center;font:900 14px/1 var(--disp);' +
      'letter-spacing:.02em;color:#FFDE93;background:rgba(255,197,66,.20);' +
      'border:1px solid rgba(255,197,66,.36)}' +
    '#scr-mp .mp-rwho{flex:1;min-width:0}' +
    '#scr-mp .mp-rname{display:block;font:900 14px/1.25 var(--disp);' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-mp .mp-rage{display:block;margin-top:3px;font-size:10px;letter-spacing:.09em;' +
      'text-transform:uppercase;font-weight:700;color:#A093C4}' +
    '#scr-mp .mp-rme{color:#7F73A0}' +
    '#scr-mp .mp-rgo{flex:0 0 auto;padding:9px 12px;border-radius:11px;background:#FFC542;' +
      'color:#241800;font:900 12px/1 var(--disp);' +
      'letter-spacing:.10em}' +
    '#scr-mp .mp-more{text-align:center;font-size:11px;color:#7F73A0;margin:9px 0 0}' +
    '#scr-mp .mp-empty{padding:20px 16px;border-radius:15px;text-align:center;' +
      'border:1px dashed rgba(255,255,255,.20);background:rgba(255,255,255,.03)}' +
    '#scr-mp .mp-empty .e{font-size:26px;opacity:.55;line-height:1;margin-bottom:8px}' +
    '#scr-mp .mp-empty b{display:block;font-family:var(--disp);' +
      'font-size:13px;letter-spacing:.06em;margin-bottom:6px}' +
    '#scr-mp .mp-empty p{font-size:12.5px;line-height:1.6;color:#A093C4;margin:0}' +

    /* ── you have opened a room and are sitting there ── */
    '#scr-mp .mp-hold{padding:22px 16px 18px;border-radius:16px;text-align:center;margin:12px 0;' +
      'border:1px solid rgba(255,197,66,.30);' +
      'background:linear-gradient(180deg,rgba(255,197,66,.10),rgba(255,255,255,.03))}' +
    '#scr-mp .mp-ring{width:58px;height:58px;margin:0 auto 14px;border-radius:50%;' +
      'border:3px solid rgba(255,197,66,.22);border-top-color:#FFC542;' +
      'animation:mpSpin 1.1s linear infinite}' +
    '#scr-mp .mp-ring.on{border-color:rgba(61,220,132,.30);border-top-color:#3DDC84;' +
      'animation-duration:.7s}' +
    '@keyframes mpSpin{to{transform:rotate(360deg)}}' +
    '#scr-mp .mp-hold h3{font-size:15px;letter-spacing:.05em}' +
    '#scr-mp .mp-holdp{font-size:12.5px;line-height:1.65;color:#A093C4;margin:9px 4px 0}' +
    '#scr-mp .mp-holdage{margin:12px 0 0;font-size:10.5px;letter-spacing:.12em;font-weight:700;' +
      'text-transform:uppercase;color:#7F73A0}' +
    /* ═══ THE SHARED LOBBY ═══════════════════════════════════════════
       Phone first, 440x894. Nothing in here has a fixed height and
       nothing in here scrolls: the page shell is height:100dvh with
       overflow:hidden and the ONE scroller is .scroll around it. Every
       tap target is at least 44px tall. */
    '#scr-mp .mp-thead{display:flex;align-items:center;gap:9px;margin:2px 0 6px}' +
    '#scr-mp .mp-thead .mp-rtag{margin:0}' +
    '#scr-mp .mp-tcount{margin-left:auto;padding:5px 12px;border-radius:999px;' +
      'font:700 12px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;' +
      'color:#FFDE93;background:rgba(255,197,66,.14);border:1px solid rgba(255,197,66,.34)}' +
    '#scr-mp .mp-tcount b{font-size:15px;color:#FFC542}' +
    '#scr-mp .mp-tsub{margin:0 2px 12px;font-size:12.5px;line-height:1.6;color:#A093C4}' +

    /* the rules, folded open IN PLACE */
    '#scr-mp .mp-fold{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'min-height:52px;padding:9px 12px;border-radius:14px;color:#F4EFFF;cursor:pointer;' +
      'background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.11)}' +
    '#scr-mp .mp-fold:active{background:rgba(255,255,255,.09)}' +
    '#scr-mp .mp-fold .ico{width:19px;height:19px;flex:0 0 auto;color:#A98BFF}' +
    '#scr-mp .mp-fold span{flex:1;min-width:0;font-size:13px;font-weight:800;line-height:1.3}' +
    '#scr-mp .mp-fold i{display:block;font-style:normal;margin-top:2px;font-size:10px;' +
      'font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8478A8}' +
    '#scr-mp .mp-fold em{flex:0 0 auto;width:22px;height:22px;display:grid;' +
      'place-items:center;color:#A093C4;transition:transform .16s var(--ease,ease)}' +
    '#scr-mp .mp-fold em .ico{width:17px;height:17px;transform:rotate(90deg)}' +
    '#scr-mp .mp-fold em.up .ico{transform:rotate(-90deg)}' +
    '#scr-mp .mp-rules{margin:8px 0 4px;padding:12px 14px;border-radius:14px;' +
      'background:rgba(138,92,255,.12);border:1px solid rgba(138,92,255,.32)}' +
    '#scr-mp .mp-rules p{margin:0 0 8px;font-size:12.5px;line-height:1.6;color:#D9CFF2}' +
    '#scr-mp .mp-rules p:last-child{margin-bottom:0}' +
    '#scr-mp .mp-rules b{color:#F4EFFF}' +

    '#scr-mp .mp-thd{margin:16px 2px 8px;font:700 10px/1 var(--disp);letter-spacing:.16em;' +
      'text-transform:uppercase;color:#8478A8}' +

    /* the chairs */
    '#scr-mp .mp-chairs{display:flex;flex-direction:column;gap:7px}' +
    '#scr-mp .mp-chair{display:flex;align-items:center;gap:10px;min-height:56px;' +
      'padding:8px 11px;border-radius:14px;' +
      'background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.10)}' +
    '#scr-mp .mp-chair.empty{background:rgba(255,255,255,.02);' +
      'border:1px dashed rgba(255,255,255,.16)}' +
    '#scr-mp .mp-chair.ready{background:linear-gradient(180deg,rgba(61,220,132,.13),' +
      'rgba(61,220,132,.04));border-color:rgba(61,220,132,.38)}' +
    '#scr-mp .mp-chair.bot{background:linear-gradient(180deg,rgba(138,92,255,.14),' +
      'rgba(138,92,255,.04));border-color:rgba(138,92,255,.36)}' +
    '#scr-mp .mp-chair.me{box-shadow:inset 3px 0 0 #FFC542}' +
    '#scr-mp .mp-chair.away{opacity:.6}' +
    '#scr-mp .mp-cn{flex:0 0 auto;width:28px;height:28px;border-radius:9px;display:grid;' +
      'place-items:center;font:700 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'color:#A093C4;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.10)}' +
    '#scr-mp .mp-chair.ready .mp-cn{color:#8FE7B6;border-color:rgba(61,220,132,.34)}' +
    '#scr-mp .mp-chair.bot .mp-cn{color:#C6AEFF;border-color:rgba(138,92,255,.38)}' +
    '#scr-mp .mp-cw{flex:1;min-width:0}' +
    '#scr-mp .mp-cw b{display:block;font-size:13.5px;font-weight:800;line-height:1.25;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-mp .mp-cw em{font-style:normal;font-size:9px;font-weight:800;letter-spacing:.1em;' +
      'text-transform:uppercase;color:#FFC542;padding:1px 5px;border-radius:5px;' +
      'background:rgba(255,197,66,.16);vertical-align:2px}' +
    '#scr-mp .mp-cw i{display:block;font-style:normal;margin-top:2px;font-size:10px;' +
      'font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#8478A8}' +
    '#scr-mp .mp-chair.ready .mp-cw i{color:#6FD3A2}' +
    '#scr-mp .mp-chair.bot .mp-cw i{color:#A98BFF}' +
    '#scr-mp .mp-ctick{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:grid;' +
      'place-items:center;color:#3DDC84;background:rgba(61,220,132,.18);' +
      'border:1px solid rgba(61,220,132,.42)}' +
    '#scr-mp .mp-ctick .ico{width:16px;height:16px}' +
    '#scr-mp .mp-ctick.off{background:transparent;border:1px dashed rgba(255,255,255,.20)}' +
    '#scr-mp .mp-cbtn{flex:0 0 auto;min-height:44px;padding:0 12px;border-radius:11px;' +
      'display:inline-flex;align-items:center;gap:5px;cursor:pointer;' +
      'font:900 11px/1 var(--disp);letter-spacing:.08em;' +
      'color:#241800;background:#FFC542;border:0}' +
    '#scr-mp .mp-cbtn .ico{width:14px;height:14px}' +
    '#scr-mp .mp-cbtn.ghost{width:44px;padding:0;justify-content:center;color:#C6AEFF;' +
      'background:rgba(138,92,255,.16);border:1px solid rgba(138,92,255,.36)}' +
    '#scr-mp .mp-cbtn:active{transform:scale(.94)}' +
    '#scr-mp .mp-free{display:flex;align-items:center;gap:10px;min-height:52px;' +
      'padding:7px 11px;border-radius:14px;background:rgba(255,255,255,.022);' +
      'border:1px dashed rgba(255,255,255,.16)}' +
    '#scr-mp .mp-freen{flex:0 0 auto;width:28px;height:28px;border-radius:9px;display:grid;' +
      'place-items:center;font:700 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'color:#7F73A0;background:rgba(0,0,0,.24);border:1px dashed rgba(255,255,255,.18)}' +
    '#scr-mp .mp-free .mp-cw b{color:#B9AEDA;font-weight:700}' +
    '#scr-mp .mp-free .mp-cbtn{background:rgba(138,92,255,.20);color:#C6AEFF;' +
      'border:1px solid rgba(138,92,255,.40)}' +

    /* the two drawers — they open IN PLACE, never on their own screen */
    '#scr-mp .mp-drawer{margin:9px 0 4px;padding:12px;border-radius:16px;' +
      'background:rgba(10,6,20,.55);border:1px solid rgba(255,255,255,.14);' +
      'animation:mpDrop .16s ease both}' +
    '@keyframes mpDrop{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}' +
    '#scr-mp .mp-dhd{display:flex;align-items:center;gap:8px;margin-bottom:7px}' +
    '#scr-mp .mp-dhd b{flex:1;font:900 12.5px/1.2 var(--disp);letter-spacing:.05em}' +
    '#scr-mp .mp-dx{flex:0 0 auto;width:34px;height:34px;border-radius:10px;display:grid;' +
      'place-items:center;color:#A093C4;background:rgba(255,255,255,.06);' +
      'border:1px solid rgba(255,255,255,.14);cursor:pointer}' +
    '#scr-mp .mp-dx .ico{width:15px;height:15px}' +
    '#scr-mp .mp-dp{margin:0 0 9px;font-size:12px;line-height:1.6;color:#A093C4}' +
    '#scr-mp .mp-dsub{margin:11px 0 6px;font:700 9.5px/1 var(--disp);letter-spacing:.14em;' +
      'text-transform:uppercase;color:#7F73A0}' +
    '#scr-mp .mp-lv{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'min-height:54px;padding:8px 11px;margin-bottom:6px;border-radius:13px;color:#F4EFFF;' +
      'cursor:pointer;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)}' +
    '#scr-mp .mp-lv:active{background:rgba(138,92,255,.22);border-color:#A98BFF}' +
    '#scr-mp .mp-lv .ico{width:22px;height:22px;flex:0 0 auto;color:#A98BFF}' +
    '#scr-mp .mp-lv span{flex:1;min-width:0}' +
    '#scr-mp .mp-lv b{display:block;font-size:13px;font-weight:800}' +
    '#scr-mp .mp-lv i{display:block;font-style:normal;margin-top:2px;font-size:11px;' +
      'line-height:1.45;color:#A093C4}' +

    /* ready + start */
    '#scr-mp .mp-acts{display:grid;gap:9px;margin:16px 0 4px}' +
    '#scr-mp .mp-ready{min-height:56px;border-radius:15px;padding:8px 14px;cursor:pointer;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;' +
      'font:900 13px/1.2 var(--disp);letter-spacing:.06em;color:#F4EFFF;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16)}' +
    '#scr-mp .mp-ready .ico{width:16px;height:16px;vertical-align:-2px}' +
    '#scr-mp .mp-ready i{font-style:normal;font-size:9.5px;font-weight:700;letter-spacing:.09em;' +
      'text-transform:uppercase;color:#8478A8}' +
    '#scr-mp .mp-ready.on{color:#062C17;background:#3DDC84;border-color:#3DDC84}' +
    '#scr-mp .mp-ready.on i{color:rgba(6,44,23,.62)}' +
    '#scr-mp .mp-ready:active{transform:scale(.985)}' +
    '#scr-mp .mp-why{margin:0 2px;text-align:center;font-size:11.5px;line-height:1.55;' +
      'color:#A093C4}' +
    /* A start button that cannot be pressed must not look like one that can.
       The shared .btn.primary is gold whatever its disabled state, and a gold
       button under the words "Not yet" is a button people tap twice and then
       distrust. */
    '#scr-mp .mp-acts .btn.primary[disabled]{background:rgba(255,255,255,.05);' +
      'color:#7F73A0;border:1px solid rgba(255,255,255,.12);box-shadow:none;' +
      'filter:none;opacity:1;cursor:default}' +
    '#scr-mp .mp-acts .btn.primary[disabled] .ico{color:#7F73A0;opacity:.7}' +
    '#scr-mp .mp-why.ok{color:#6FD3A2}' +

    /* who is around */
    '#scr-mp .mp-person{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'min-height:56px;padding:8px 11px;margin-bottom:7px;border-radius:14px;color:#F4EFFF;' +
      'cursor:pointer;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.10)}' +
    '#scr-mp .mp-person.s-waiting{background:linear-gradient(180deg,rgba(255,197,66,.14),' +
      'rgba(255,197,66,.04));border-color:rgba(255,197,66,.42)}' +
    '#scr-mp .mp-person.s-playing{opacity:.62;cursor:default}' +
    '#scr-mp .mp-person:active{transform:scale(.985)}' +
    '#scr-mp .mp-pav{flex:0 0 auto;width:36px;height:36px;border-radius:12px;display:grid;' +
      'place-items:center;font:900 12px/1 var(--disp);letter-spacing:.02em;color:#C6AEFF;' +
      'background:rgba(138,92,255,.18);border:1px solid rgba(138,92,255,.34)}' +
    '#scr-mp .mp-person.s-waiting .mp-pav{color:#FFDE93;background:rgba(255,197,66,.20);' +
      'border-color:rgba(255,197,66,.38)}' +
    '#scr-mp .mp-pw{flex:1;min-width:0}' +
    '#scr-mp .mp-pw b{display:block;font-size:13.5px;font-weight:800;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis}' +
    '#scr-mp .mp-pw i{display:block;font-style:normal;margin-top:2px;font-size:10px;' +
      'font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#8478A8}' +
    '#scr-mp .mp-pgo{flex:0 0 auto;padding:8px 11px;border-radius:10px;' +
      'font:900 10.5px/1 var(--disp);letter-spacing:.1em;color:#241800;background:#FFC542}' +
    '#scr-mp .mp-person.s-idle .mp-pgo{color:#C6AEFF;background:rgba(138,92,255,.20);' +
      'border:1px solid rgba(138,92,255,.36)}' +
    '#scr-mp .mp-person.s-playing .mp-pgo{display:none}' +

    /* recently played with — NOT scoped to #scr-mp: it is drawn on Home too */
    '.mp-recent{margin:10px 0 2px}' +
    '.mp-rectitle{display:flex;align-items:center;gap:6px;margin-bottom:7px;' +
      'font:700 9.5px/1 var(--disp);letter-spacing:.14em;text-transform:uppercase;color:#7F73A0}' +
    '.mp-rectitle .ico{width:13px;height:13px}' +
    '.mp-pills{display:flex;flex-wrap:wrap;gap:6px}' +
    '.mp-pill{min-height:44px;padding:6px 11px;border-radius:12px;text-align:left;' +
      'cursor:pointer;color:#F4EFFF;font-size:12.5px;font-weight:800;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14)}' +
    '.mp-pill i{display:block;font-style:normal;margin-top:1px;font-size:9.5px;' +
      'font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#8478A8}' +
    '.mp-pill.go{color:#241800;background:#FFC542;border-color:#FFC542}' +
    '.mp-pill.go i{color:rgba(36,24,0,.62)}' +
    '.mp-pill.off{opacity:.66}' +
    '.mp-pill:active{transform:scale(.95)}' +
    '#scr-mp .mp-askrow{display:flex;gap:7px}' +
    '#scr-mp .mp-askrow .field{flex:1;min-width:0}' +
    '#scr-mp .mp-askrow .btn{flex:0 0 auto;min-width:74px}' +

    /* a knock reads like an invite but is honestly a different thing */
    '.mp-knock{background:linear-gradient(180deg,rgba(138,92,255,.18),rgba(138,92,255,.05));' +
      'border-color:rgba(169,139,255,.5)}' +
    '.mp-knock .mp-ivi{color:#C6AEFF;background:rgba(138,92,255,.18);' +
      'border-color:rgba(138,92,255,.38)}' +
    '.mp-knock .mp-ivw i{color:#A98BFF}' +
    '.mp-knock .mp-ivgo{background:#A98BFF;color:#160C2A}' +

    /* short phones: the chairs are the screen, so they lose the least */
    '@media (max-height:740px){' +
      '#scr-mp .mp-chair{min-height:50px;padding:6px 10px}' +
      '#scr-mp .mp-ready{min-height:50px}' +
      '#scr-mp .mp-tsub{margin-bottom:9px}}';

  document.head.appendChild(st);
}

/* ── the lobby screen ──────────────────────────────────────────────── */
function mpScreen(){
  injectCSS();
  MP.url = MP.url || defaultURL();
  const insecure = isSecurePage() && MP.url.slice(0, 6).toLowerCase() !== 'wss://';
  /* the picked game has to survive js/party.js not being on the phone */
  if (!gamePlayable(MP.wantGame)) MP.wantGame = 'cards';
  const want = MP.wantGame;

  $('#scr-mp').innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="mp-back" aria-label="Back to home">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Online</h2>' +
    '</div>' +
    '<div class="scroll" id="mp-body">' +
      '<p class="blurb">Every room waiting for a player is listed below, and each one ' +
      'says what it is. <b>Tap one to join</b> — nothing to type, no code to read out. ' +
      'Nobody about? Pick a game, open a room, and the next person online sees it.</p>' +
      '<p class="mp-state" id="mp-stat"><span class="mp-dot"></span><span class="mp-txt"></span></p>' +
      (insecure
        ? '<div class="mp-box bad"><b>That server address will not work from this page.</b><br>' +
          'KARTI is loaded over https, so it can only open a <code>wss://</code> connection. ' +
          'Fix the address below or leave it on the default.</div>'
        : '') +
      '<div id="mp-inbox"></div>' +
      '<div id="mp-social"></div>' +
      '<div id="mp-rooms"></div>' +
      '<div class="tiny" style="margin:18px 0 8px">Open a room of your own</div>' +
      '<div class="mp-pick" id="mp-pick">' +
        GAMES.map(g => {
          const off = !gamePlayable(g.k);
          return '<button class="mp-g" data-g="' + esc(g.k) + '" ' +
            'aria-pressed="' + (g.k === want ? 'true' : 'false') + '"' +
            (off ? ' disabled aria-disabled="true"' : '') + '>' +
            '<span class="mp-gi">' + gameIcon(g.k) + '</span>' +
            '<b>' + esc(g.name) + '</b><i>' + esc(off ? 'Not on this phone' : g.blurb) + '</i>' +
            '</button>';
        }).join('') +
      '</div>' +
      '<button class="btn primary" id="mp-open" style="margin-top:10px">' + ico('plus') +
        ' Open a ' + esc(gameMeta(want).name.toLowerCase()) + ' room</button>' +
      '<p class="mp-more">One tap. Everyone online sees it straight away, labelled ' +
        esc(gameMeta(want).short) + '.</p>' +
      (want === 'cards'
        ? '<div class="tiny" style="margin:18px 0 7px">Your deck</div>' +
          '<div class="deckpick" id="mp-deck"></div>'
        : '<div class="mp-box">' + gameIcon(want) + ' <b>' + esc(gameMeta(want).name) +
          '</b> needs no deck and touches nothing in your collection. Colours are drawn ' +
          'from a number each phone throws in, so neither of you can hand yourself the ' +
          'first move.</div>') +
      '<details style="margin:18px 0 8px"><summary class="tiny">Other ways in</summary>' +
        '<div class="mp-box">Only needed to reach <b>one particular person</b> while several ' +
        'rooms are open. Otherwise just use the list.</div>' +
        '<div class="tiny">Join by code</div>' +
        '<div style="display:grid;gap:9px;margin-top:7px">' +
          '<input class="field mp-codein" id="mp-code" maxlength="' + CODE_LEN + '" ' +
            'placeholder="CODE" autocomplete="off" autocapitalize="characters" ' +
            'spellcheck="false" aria-label="Room code">' +
          '<button class="btn" id="mp-join">↪ Join by code</button>' +
        '</div>' +
        '<div class="tiny" style="margin:18px 0 7px">Keep a room to yourself</div>' +
        '<button class="btn ghost" id="mp-openpriv">' + ico('lock') +
          ' Open a private room</button>' +
        '<p class="tiny" style="line-height:1.7;margin-top:7px;text-transform:none;' +
          'letter-spacing:0">A private room is <b>not</b> in anybody\'s list. Only the person ' +
          'you hand the code to can get in.</p>' +
      '</details>' +
      '<details style="margin:8px 0 26px"><summary class="tiny">Server settings</summary>' +
        '<div class="tiny" style="margin-top:8px">Relay address</div>' +
        '<input class="field mp-url" id="mp-url" value="' + esc(MP.url) + '" ' +
          'aria-label="Relay server address" spellcheck="false">' +
        '<div style="display:grid;gap:8px;margin-top:8px">' +
          '<button class="btn ghost" id="mp-test">' + ico('bolt') + ' Test the connection</button>' +
          '<button class="btn ghost" id="mp-reset">↺ Back to the default address</button>' +
        '</div>' +
        '<p class="tiny" style="line-height:1.6;margin-top:8px">Default is the Pi relay. ' +
        'You only need to touch this if the server has moved.</p>' +
      '</details>' +
    '</div>';

  $('#mp-back').onclick = () => { mpLeave(); K.go('home'); };

  /* Picking a game also points the list at it — somebody who came here for
     chess should not have to filter by hand as well. "All" is one tap away. */
  $$('#mp-pick .mp-g').forEach(b => {
    b.onclick = () => {
      const g = cleanGame(b.dataset.g);
      if (!gamePlayable(g)) return;
      MP.wantGame = g;
      MP.filter = g;
      rememberGame(g);
      mpScreen();
    };
  });

  if ($('#mp-deck')){
    const opts = deckPicker($('#mp-deck'), MP.myDeckId || deckOptions()[0].id, o => {
      MP.myDeckId = o.id; mpScreen();
    });
    if (!MP.myDeckId) MP.myDeckId = opts[0].id;
  } else if (!MP.myDeckId){
    MP.myDeckId = deckOptions()[0].id;
  }

  const urlIn = $('#mp-url');
  urlIn.onchange = () => {
    const v = (urlIn.value || '').trim();
    MP.url = v || defaultURL();
    rememberRelay(v && v !== RELAY_URL ? v : '');
    mpScreen();
  };
  $('#mp-reset').onclick = () => { rememberRelay(''); MP.url = RELAY_URL; mpScreen(); };
  $('#mp-test').onclick = testServer;

  $('#mp-open').onclick     = () => start('create', null, null, false, MP.wantGame);
  $('#mp-openpriv').onclick = () => start('create', null, null, true,  MP.wantGame);
  $('#mp-join').onclick = () => {
    const c = cleanCode($('#mp-code').value);
    if (c.length !== CODE_LEN){ K.toast('A room code is ' + CODE_LEN + ' characters.'); return; }
    start('join', c);
  };
  const codeIn = $('#mp-code');
  codeIn.oninput = () => { codeIn.value = cleanCode(codeIn.value); };

  setState(MP.state === 'idle' ? 'idle' : MP.state, MP.note);
  paintRooms();                 /* whatever the shared poller already knows */
  paintInvites();
  paintOnlineSocial();
  whoAsk(true);                 /* and ask who is about, once */
}

function testServer(){
  setState('connecting', 'Checking the server…');
  let url = RELAY_HEALTH;
  if (MP.url && MP.url !== RELAY_URL)
    url = MP.url.replace(/^ws/i, 'http').replace(/\/ws$/, '/health');
  const bail = setTimeout(() => setState('unreachable',
    'No answer from the server. Is it running, and are you online?'), 8000);
  fetch(url, { cache:'no-store' })
    .then(r => r.json())
    .then(j => {
      clearTimeout(bail);
      if (j && j.ok) setState('idle', 'Server is up — ' + j.rooms + ' room' +
        (j.rooms === 1 ? '' : 's') + ' in use. Make or join a room.');
      else setState('unreachable', 'That address answered, but it is not the KARTI relay.');
    })
    .catch(() => { clearTimeout(bail);
      setState('unreachable', 'Cannot reach the server. Is it running, and are you online?'); });
}

/* ── socket lifecycle ─────────────────────────────────────────────── */
/* intent: 'create' (priv=true keeps the room out of the public list) |
   'join' (needs a room code) | 'joinid' (needs the public handle of a room from
   the room list — you never see, type or learn its room code) | 'rejoin' */
function start(intent, code, id, priv, game){
  MP.url = ((($('#mp-url') || {}).value) || MP.url || defaultURL()).trim();
  if (!/^wss?:\/\//i.test(MP.url)){
    setState('unreachable', 'That is not a valid server address.');
    return;
  }
  if (isSecurePage() && MP.url.slice(0, 6).toLowerCase() !== 'wss://'){
    setState('unreachable', 'A https page cannot open a plain ws:// connection. Use wss://.');
    return;
  }
  hardClose();
  presenceBeaconClose();          /* one socket per device, never two */
  MP.code = intent === 'join' ? code : null;
  MP.joinId = intent === 'joinid' ? (id || null) : null;
  if (intent !== 'invite') MP.inviteId = null;
  if (intent !== 'joinid') MP.autoOpen = null;
  MP.wantPrivate = intent === 'create' ? !!priv : false;
  MP.private = MP.wantPrivate;
  MP.openedAt = 0;
  MP.token = null; MP.lastSeq = 0; MP.tries = 0;
  MP.joined = false; MP.peerHere = false; MP.peerList = null;
  /* what we are asking for (create) vs what the list said (joinid). The room
     itself is the authority either way: the relay tells us in `created` and
     `joined`, so neither the list nor the other player is ever trusted for it. */
  MP.wantGame = intent === 'create' ? cleanGame(game) : MP.wantGame;
  MP.joinHint = intent === 'joinid' ? (game ? cleanGame(game) : null) : null;
  MP.game = intent === 'create' ? MP.wantGame : (MP.joinHint || 'cards');
  MP.myNonce = null; MP.peerNonce = null;
  openSocket(intent);
}

function openSocket(intent){
  MP.intent = intent;
  setState(intent === 'rejoin' ? 'reconnecting' : 'connecting',
           intent === 'rejoin' ? 'Connection lost — trying to get back in…' : null);
  let ws;
  try { ws = new WebSocket(MP.url); }
  catch (e){ setState('unreachable', 'That server address is not usable.'); return; }
  MP.ws = ws;

  clearTimeout(MP.openTimer);
  MP.openTimer = setTimeout(() => {
    if (ws.readyState !== 1){ try { ws.close(); } catch (e){} }
  }, OPEN_TIMEOUT);

  ws.onopen = () => {
    clearTimeout(MP.openTimer);
    MP.lastPong = Date.now();
    startPing();
    /* Tell the relay what to call us in the who's-online list. An OLDER relay
       does not know this message and answers "Bad message."; MP.nameProbe makes
       onServerError swallow exactly that one reply so nothing looks broken. */
    MP.nameProbe = true;
    send({ t:'name', n: myPresenceName() });
    /* Prove who we are, if this profile has a cloud account. It is what lets
       us send an invite to a named player and collect the ones left for us.
       An older relay does not know the message and says so; onServerError
       swallows exactly that reply, and invites simply are not offered. */
    authProbe();
    /* An older relay does not know "private" and simply ignores it — it also has
       no room list to hide from, and `created` will come back without the flag,
       which is how we spot it and say so out loud. */
    /* `game` on both of these is new. An older relay does not know the field
       and ignores it, which is exactly right for a card duel and is caught
       out loud in `created` for anything else. */
    if (intent === 'create'){
      /* HOW MANY CHAIRS. The seat count is the primary piece of room data, not
         an afterthought: "This is a oarty not duo". We ask for the game's own
         maximum so the room reads as a table filling up — "1 of 8" — rather
         than a duel that somebody might sit out. Nobody is ever obliged to
         fill it; the host starts the moment there are enough.
         An older relay ignores `seats` and answers without it, which is how
         `created` spots one and says so. */
      const LB = gameLobby(MP.wantGame || 'cards');
      MP.wantSeats = LB.maxSeats;
      MP.variant = MP.variant || null;
      const msg = { t:'create', private: !!MP.wantPrivate,
                    game: MP.wantGame || 'cards' };
      if (LB.maxSeats > 2) msg.seats = LB.maxSeats;
      if (MP.variant) msg.variant = MP.variant;
      send(msg);
    }
    else if (intent === 'join') send({ t:'join', code: MP.code });
    else if (intent === 'joinid')
      send(MP.joinHint ? { t:'joinid', id: MP.joinId, game: MP.joinHint }
                       : { t:'joinid', id: MP.joinId });
    /* Taking up an invitation. The room code is never in our hands: the relay
       resolves it from the note it sent us, and only for the account it was
       addressed to. */
    else if (intent === 'invite') send({ t:'acceptinvite', id: MP.inviteId });
    else send({ t:'rejoin', code: MP.code, token: MP.token, since: MP.lastSeq });
  };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (err){ return; }
    if (m && typeof m === 'object') onServer(m);
  };
  ws.onerror = () => { /* onclose always follows; report there */ };
  ws.onclose = () => {
    clearTimeout(MP.openTimer);
    stopPing();
    if (MP.ws === ws) MP.ws = null;
    onSocketClosed();
  };
}

function onSocketClosed(){
  if (MP.stopping) return;
  /* Mid-duel (or mid-lobby with a seat we can claim) we try to get back in. */
  if (MP.token && MP.code && (MP.live || MP.joined)){
    if (MP.tries < RETRY_WAITS.length){
      const wait = RETRY_WAITS[MP.tries++];
      setState('reconnecting',
        'Connection lost — trying to get back in (' + MP.tries + '/' + RETRY_WAITS.length + ')…');
      clearTimeout(MP.retryTimer);
      MP.retryTimer = setTimeout(() => openSocket('rejoin'), wait);
      return;
    }
    endMatch('The connection to the server did not come back.');
    return;
  }
  if (MP.state === 'connecting')
    setState('unreachable', 'Cannot reach the server. Is it running, and are you online?');
  else if (MP.state !== 'unreachable' && MP.state !== 'stopped') setState('idle');
}

function startPing(){
  stopPing();
  MP.pingTimer = setInterval(() => {
    if (!MP.ws || MP.ws.readyState !== 1) return;
    if (Date.now() - MP.lastPong > PONG_DEADLINE){
      try { MP.ws.close(); } catch (e){}     /* triggers the reconnect path */
      return;
    }
    send({ t:'ping' });
  }, PING_EVERY);
}
function stopPing(){ if (MP.pingTimer){ clearInterval(MP.pingTimer); MP.pingTimer = null; } }

function send(o){
  const ws = MP.ws;
  if (ws && ws.readyState === 1){ try { ws.send(JSON.stringify(o)); } catch (e){} }
}
/* Pluggable transport. Normally the room server socket; the harness swaps in a
   direct loopback so the lockstep mirroring can be tested without a server. */
function relay(d){ if (MP.transport) MP.transport(d); else send({ t:'relay', d }); }
/* the same, ON BEHALF OF a chair the relay gave us at start. The stamp is the
   relay's to apply; all we do is ask, and it refuses for any chair that is not
   one of ours. */
function sendFor(seat, d){
  if (MP.transport) return MP.transport(d);
  send({ t:'relay', d, for: seat });
}

/* Whichever socket this device has open — the room one if we are in a room,
   otherwise the who's-online beacon. Invites are answered over either. */
function sendAny(o){
  const ws = (MP.ws && MP.ws.readyState === 1) ? MP.ws
           : (PR.ws && PR.ws.readyState === 1) ? PR.ws : null;
  if (!ws) return false;
  try { ws.send(JSON.stringify(o)); return true; } catch (e){ return false; }
}
/* say who we are on whichever socket has just opened */
function authProbe(ws){
  /* A NEW SOCKET IS A STRANGER UNTIL IT SAYS OTHERWISE. `authed` is a property
     of the connection, not of the phone: carrying it across a reconnect is how
     "who is around" ended up asking on a socket that had not proved anything
     yet and switching itself off over the refusal. */
  INBOX.authed = false;
  WHO.off = false;
  const tok = sessionToken();
  if (!tok) return;
  MP.authProbe = true;
  const msg = JSON.stringify({ t:'auth', session: tok });
  if (ws){ try { ws.send(msg); } catch (e){} }
  else send({ t:'auth', session: tok });
}

function hardClose(){
  MP.stopping = true;
  clearTimeout(MP.retryTimer); clearTimeout(MP.openTimer); stopPing();
  if (MP.ws){
    try { MP.ws.onclose = null; MP.ws.onmessage = null; MP.ws.close(); } catch (e){}
  }
  MP.ws = null;
  MP.stopping = false;
}
function mpLeave(){
  if (MP.ws && MP.ws.readyState === 1){ try { MP.ws.send(JSON.stringify({ t:'leave' })); } catch (e){} }
  hardClose();
  stopWaitClock();
  MP.code = null; MP.token = null; MP.live = false; MP.joined = false;
  MP.joinId = null; MP.nameProbe = false; MP.autoOpen = null;
  MP.wantPrivate = false; MP.private = false; MP.openedAt = 0;
  MP.peerHere = false; MP.peerList = null; MP.lastSeq = 0; MP.tries = 0;
  /* the table, put away with the room it belonged to */
  MP.size = 2; MP.mySeat = 0; MP.roster = null; MP.iAmReady = false;
  MP.began = null; MP.panel = null; MP.aiSeat = -1; MP.showRules = false;
  MP.wantSeats = 0; MP.variant = null; MP.askBack = null;
  if (MP.unMove){ try { MP.unMove(); } catch (e){} MP.unMove = null; }
  if (MP.state !== 'unreachable') setState('idle');
}

/* ── what the server says ─────────────────────────────────────────── */
function onServer(m){
  switch (m.t){
    case 'pong':
      MP.lastPong = Date.now();
      return;

    case 'named':                      /* the relay took our display name */
      MP.nameProbe = false;
      return;

    /* ── invitations ── */
    case 'authed':
      MP.authProbe = false;
      INBOX.authed = true;
      INBOX.name = (typeof m.name === 'string' ? m.name : '').slice(0, NAME_MAX);
      WHO.off = false;
      WHO.asked = 0;
      WHO.me = { n: INBOX.name, s:'idle', vis: m.vis !== false };
      /* the moment we are somebody, ask who else is */
      whoAsk(true);
      return;

    case 'invite':
      inboxAdd(m);
      if (document.querySelector('#scr-home.on') || document.querySelector('#scr-mp.on'))
        K.toast((m && m.from ? m.from : 'Somebody') + ' wants a game of ' +
                gameMeta(cleanGame(m && m.game)).name.toLowerCase() + '.');
      return;

    case 'invited':                    /* our own invite went out */
      K.toast('If ' + ((m && m.to) || 'they') +
              ' has a KARTI account, it is waiting for them.');
      paintInvites();
      return;

    case 'invitegone':                 /* withdrawn: the room filled or closed */
      inboxDrop(m && m.id);
      return;

    case 'created':
      MP.host = true; MP.code = m.code; MP.token = m.token || null;
      MP.joined = true; MP.lastSeq = m.seq || 0; MP.tries = 0;
      MP.private = m.private === true;      /* what we actually got, not what we asked */
      MP.openedAt = Date.now();
      /* A relay that understands games echoes one. One that does not cannot
         LABEL the room either — so whoever tapped it would arrive expecting a
         card duel. Rather than seat two people at different games we close the
         room and say why. */
      if (typeof m.game !== 'string'){
        if (MP.wantGame !== 'cards'){
          mpLeave();
          setState('unreachable', 'This relay is an older build: it can only open card ' +
            'rooms, and cannot tell anybody a room is ' + gameMeta(MP.wantGame).name +
            '. The room was closed rather than seat somebody at the wrong game.');
          mpScreen();
          K.toast('That server cannot host ' + gameMeta(MP.wantGame).name + ' yet.');
          return;
        }
        MP.game = 'cards';
      } else MP.game = cleanGame(m.game);
      /* HOW MANY CHAIRS WE ACTUALLY GOT. A relay too old to seat a table
         answers with no `seats` at all, and a table of one is not a table —
         say so rather than sit somebody in a room three friends can never
         reach. */
      MP.size = (typeof m.seats === 'number' && m.seats >= 2) ? (m.seats | 0) : 2;
      MP.mySeat = (typeof m.seat === 'number') ? (m.seat | 0) : 0;
      MP.variant = (typeof m.variant === 'string') ? m.variant : null;
      MP.roster = null; MP.iAmReady = false; MP.began = null;
      MP.panel = null; MP.aiSeat = -1;
      if (MP.wantSeats > 2 && MP.size < MP.wantSeats && typeof m.seats !== 'number'){
        mpLeave();
        setState('unreachable', 'This relay is an older build: it can only seat two, so a ' +
          gameMeta(MP.wantGame).name + ' table cannot be opened on it. The room was closed ' +
          'rather than leave you waiting for people who could never get in.');
        mpScreen();
        return;
      }
      MP.autoOpen = null;
      /* ASK THEM BACK. Tapping a friend on the who's-around strip opened this
         room; the invitation could not go out until there was a room to point
         at, and now there is. One tap did both — that is the extra screen he
         complained about, removed. */
      if (MP.askBack){ sendInvite(MP.askBack); MP.askBack = null; }
      lobby();
      if (MP.size > 2) return;      /* the table paints its own status line */
      setState('waiting', MP.private
        ? 'Private ' + gameMeta(MP.game).name.toLowerCase() +
          ' room open — nobody can see it but you.'
        : 'Your ' + gameMeta(MP.game).name.toLowerCase() +
          ' room is in the list. Waiting for someone to join…');
      return;

    case 'joined':
      MP.host = false; MP.code = m.code; MP.token = m.token || null;
      MP.joined = true; MP.lastSeq = m.seq || 0; MP.tries = 0;
      MP.peerHere = true;
      /* the room says what it is; the list we tapped is only a fallback for a
         relay too old to answer */
      MP.game = (typeof m.game === 'string') ? cleanGame(m.game) : (MP.joinHint || 'cards');
      MP.size = (typeof m.seats === 'number' && m.seats >= 2) ? (m.seats | 0) : 2;
      MP.mySeat = (typeof m.seat === 'number') ? (m.seat | 0) : 1;
      MP.variant = (typeof m.variant === 'string') ? m.variant : null;
      MP.roster = null; MP.iAmReady = false; MP.began = null;
      MP.panel = null; MP.aiSeat = -1;
      if (MP.inviteId){ inboxDrop(MP.inviteId); MP.inviteId = null; }
      MP.autoOpen = null;                  /* we got the seat; no fallback needed */
      /* A TABLE DOES NOT DEAL THE MOMENT YOU SIT DOWN. You are in the room,
         you can see who else is, and the host starts it when everybody is
         ready. Only a duel still goes straight into the hello. */
      if (MP.size > 2){
        MP.peerHere = false;
        lobby();
        return;
      }
      lobby();
      setState('ready', MP.game === 'cards'
        ? 'Connected. Swapping decks…' : 'Connected. Drawing for colours…');
      sendHello();
      return;

    case 'rejoined':
      MP.host = !!m.host; MP.tries = 0; MP.joined = true;
      MP.peerHere = !!m.peer;
      if (typeof m.game === 'string') MP.game = cleanGame(m.game);
      /* the missed relays arrive immediately after this message */
      setState(MP.live ? 'live' : (m.peer ? 'ready' : 'waiting'),
               MP.live ? 'Back in. Carrying on where you left off.' : null);
      K.toast('Back online.');
      return;

    case 'peer':
      /* AT A TABLE this message is news, not a starting gun: the roster that
         follows it is what the lobby actually draws from, and the host is the
         only thing that starts a game. A DUEL is untouched — same two lines it
         has always run. */
      if (MP.size > 2){
        if (m.state === 'joined' || m.state === 'rejoined') K.toast('Somebody sat down.');
        else if (m.state === 'left' && MP.live) tableSeatGone(m.seat, 'left');
        else if (m.state === 'dropped' && MP.live) tableSeatGone(m.seat, 'dropped');
        return;
      }
      if (m.state === 'joined'){
        MP.peerHere = true;
        setState('ready', 'They are in. Swapping decks…');
        sendHello();
      } else if (m.state === 'rejoined'){
        MP.peerHere = true;
        setState(MP.live ? 'live' : 'ready', 'Your opponent is back.');
        K.toast('They are back.');
      } else if (m.state === 'dropped'){
        MP.peerHere = false;
        setState('reconnecting', 'Your opponent dropped out — waiting for them to come back…');
      } else {                                   /* left */
        MP.peerHere = false; MP.peerList = null;
        if (MP.live) endMatch(MP.game === 'cards'
          ? 'Your opponent left the duel.' : 'Your opponent left the game.');
        else if (MP.boardLive) setState('gone', 'They have gone.');
        else { setState('gone', 'They left. Still waiting for someone to join…'); lobby(); }
      }
      return;

    /* ── the table ── */
    case 'table':
      onRoster(m);
      return;

    case 'began':
      onBegan(m);
      return;

    /* ── who is around ── */
    case 'stir':
      /* NINE BYTES. "The answer moved." We ask again, no faster than our own
         floor allows, and nothing at all is pushed at us. */
      whoAsk();
      return;

    case 'who':
      onWho(m);
      return;

    case 'visible':
      if (WHO.me) WHO.me.vis = m.on !== false;
      K.toast(m.on === false ? 'You are invisible to other players now.'
                             : 'Other players can see you again.');
      paintSocial();
      return;

    case 'knock':
      knockAdd(m);
      return;

    case 'knockgone':
      WHO.knocks = WHO.knocks.filter(x => x.id !== (m && m.id));
      paintSocial();
      return;

    case 'relay':
      if (typeof m.n === 'number' && m.n > MP.lastSeq) MP.lastSeq = m.n;
      onPeer(m.d, m.s);
      return;

    case 'closed':
      MP.token = null;
      if (MP.live) endMatch(m.why || 'The server closed the room.');
      else setState('stopped', m.why || 'The server closed the room.');
      return;

    case 'error':
      onServerError(m.why || '');
      return;
  }
}
function onServerError(why){
  /* The relay only ever sends fixed strings, so they are safe to show. */
  if (MP.nameProbe){
    MP.nameProbe = false;
    if (/^Bad message/i.test(why)) return;       /* older relay, no name support */
  }
  /* An older relay does not know "auth"; a newer one says "Sign in first" when
     the token has expired. Neither is anything the player did, and neither
     stops a single thing working — it only means no invites. */
  if (MP.authProbe && (/^Bad message/i.test(why) || /^Sign in first/i.test(why))){
    MP.authProbe = false;
    INBOX.authed = false;
    return;
  }
  if (/^That invitation has gone/i.test(why)){
    if (MP.inviteId) inboxDrop(MP.inviteId);
    MP.inviteId = null; MP.token = null; MP.code = null; MP.joined = false;
    setState('unreachable', 'That invitation has gone — they filled the room or closed ' +
             'it. Nothing you did; open a room of your own, or tap one from the list.');
    K.toast('That invitation has gone.');
    return;
  }
  if (/^Open a room before/i.test(why) || /^Sign in first/i.test(why)){
    K.toast(why);
    return;
  }
  if (/not waiting/i.test(why)){
    /* Arrived from inside a game with the game already decided: do not put a
       menu in front of them, just open the room we were going to open. */
    if (autoOpenFallback()) return;
    MP.token = null; MP.code = null; MP.joinId = null; MP.joined = false;
    setState('unreachable', 'That room has gone — somebody else got there first, or they ' +
             'closed it. The list below refreshes on its own; or open a room of your own.');
    K.toast('That room has gone.');
    return;
  }
  if (/not the game this room/i.test(why)){
    /* the list was a second or two out of date and the room turned out to be
       something else. Not an error the player did anything to cause. */
    if (autoOpenFallback()) return;
    MP.token = null; MP.code = null; MP.joinId = null; MP.joined = false;
    setState('unreachable', 'That room turned out to be a different game — the list had ' +
             'moved on. It refreshes on its own; tap another one.');
    K.toast('That room is a different game.');
    return;
  }
  if (/No room with that code/i.test(why)){
    MP.token = null; MP.code = null; MP.joined = false;
    setState('unreachable', 'No room with that code. Check it and try again.');
  } else if (/two players/i.test(why)){
    MP.token = null; MP.joined = false;
    setState('unreachable', 'That room already has two players in it.');
  } else if (/busy/i.test(why)){
    setState('unreachable', 'The server is busy right now. Try again in a minute.');
  } else if (/not yours/i.test(why)){
    MP.token = null;
    if (MP.live) endMatch('The server would not give your seat back.');
    else setState('unreachable', 'That room seat is no longer yours.');
  } else {
    setState('unreachable', why || 'The server refused that.');
  }
  K.toast(why || 'Server error');
}

/* ── you are sitting in a room ──────────────────────────────────────────────
   Two shapes. WAITING: a big honest "nobody yet", who can see you, how long you
   have been there, and one obvious way out. PAIRED: they turned up, hold on.
   The room code is still here — it is the one thing that reaches a particular
   person — but for a public room it is folded away, because reading a code out
   is exactly what the room list exists to abolish. */
function lobby(){
  const body = $('#mp-body');
  if (!body || !MP.code) return;
  stopWaitClock();

  /* MORE THAN TWO CHAIRS IS A DIFFERENT ROOM, not a bigger one. Everything
     below this line is the duel's waiting screen and is untouched by any of
     it — a two-seat room draws exactly what it always drew. */
  if (MP.size > 2){ tableLobby(); return; }

  if (MP.peerHere){
    body.innerHTML =
      '<p class="mp-state" id="mp-stat"><span class="mp-dot"></span><span class="mp-txt"></span></p>' +
      '<div class="mp-hold"><div class="mp-ring on"></div>' +
        '<h3>Somebody joined</h3>' +
        '<p class="mp-holdp">Swapping decks and dealing. This takes a second.</p></div>' +
      '<button class="btn ghost" id="mp-cancel">Leave the room</button>';
  } else {
    const me = esc(myPresenceName());
    const gm = gameMeta(MP.game);
    const codeBlock =
      '<div class="mp-code" id="mp-showcode">' + esc(MP.code) + '</div>' +
      '<button class="btn ghost" id="mp-copy">' + ico('cards') + ' Copy the code</button>';
    body.innerHTML =
      '<p class="mp-state" id="mp-stat"><span class="mp-dot"></span><span class="mp-txt"></span></p>' +
      (MP.wantPrivate && !MP.private
        ? '<div class="mp-box warn"><b>This relay is an older build.</b> It cannot hide a ' +
          'room, so this one may still show up as waiting. Nothing is broken — but if you ' +
          'wanted it private, take the code to your friend quickly.</div>'
        : '') +
      '<div class="mp-hold">' +
        '<div class="mp-ring"></div>' +
        '<h3>Waiting for someone</h3>' +
        '<p class="mp-holdp"><span class="mp-rtag g-' + esc(MP.game) + '">' +
          gameIcon(MP.game) + esc(gm.short) + '</span>' + (MP.private
          ? 'This room is <b>private</b> — it is in nobody\'s list. Give the code below to ' +
            'the one person you want to play, and only they can get in.'
          : 'Your room is in the list right now as <b>' + me + '</b>, labelled <b>' +
            esc(gm.short) + '</b>. Anyone who opens Online sees what it is and can tap ' +
            'straight in — they do not need a code.') + '</p>' +
        '<p class="mp-holdage" id="mp-age">open for 0s</p>' +
      '</div>' +
      (MP.private
        ? '<div style="display:grid;gap:9px">' + codeBlock + '</div>'
        : '<details style="margin:4px 0 14px"><summary class="tiny">Waiting for one ' +
          'particular person?</summary><p class="tiny" style="line-height:1.7;margin:8px 0 0;' +
          'text-transform:none;letter-spacing:0">Give them this code and they can come ' +
          'straight to you with <b>Other ways in › Join by code</b>.</p>' +
          '<div style="display:grid;gap:9px;margin-top:9px">' + codeBlock + '</div></details>') +
      /* asking one particular person, by name */
      (canInvite()
        ? '<details class="mp-ask" open><summary class="tiny">' +
          'Invite somebody to this room</summary><div id="mp-askbox"></div></details>'
        : '<div class="mp-box"><b>Want to ask one particular person?</b> Sign in to your ' +
          'KARTI account and you can invite them by name — it turns up on their home ' +
          'screen. Without an account, the room list is the way in.</div>') +
      '<button class="btn ghost" id="mp-cancel">✕ Cancel and go back</button>';
    startWaitClock();
    invitePanel();
  }

  const cp = $('#mp-copy');
  if (cp) cp.onclick = () => {
    try { navigator.clipboard.writeText(MP.code); K.toast('Code copied.'); }
    catch (e){ K.toast('Code: ' + MP.code); }
  };
  const cx = $('#mp-cancel');
  if (cx) cx.onclick = () => { mpLeave(); mpScreen(); };
  paintState();
}

/* ═══════════════════════════════════════════════════════════════════
   THE SHARED LOBBY
   ───────────────────────────────────────────────────────────────────
   One screen. Every party game feeds it, and it knows the rules of
   none of them — it reads a contract (see gameLobby above) and draws
   whatever came back.

   WHAT THE OWNER ASKED FOR, IN HIS ORDER:
     "Kiri auro use orofike name"            — the profile name is used
        automatically. There is no name field anywhere in this flow,
        and there is no place one could be added: the relay is told
        who we are when the socket opens, before this screen exists.
     "if clicked inline it will join in game" — tapping the online
        option opens the room and puts you in it. One tap. There is no
        menu, no confirm, no "choose your seat". He has said "to much
        reesting" twice; this is the answer to it.
     "u will see other players for invite"  — the roster IS the screen,
        and asking somebody happens inside the room, in a drawer, so
        nobody has to leave and lose their chair.
     "there need to be 2 players and in thst state can add ai"
                                            — below the game's own
        minimum the start button says WHY in words. Machines are added
        from here, with a difficulty, one tap each.
     "no jeed make and rules becefore u hit start" — the rules fold
        open IN PLACE, above the chairs. Nobody navigates away.
     "everyone resdy ai will auto ready appoun soawn"
                                            — everybody readies and
        the host starts; a machine is ready the instant it is put out
        and cannot hold the table up. That is enforced on the relay
        too, where a machine is not a seat at all.

   AND THE FRAMING: "This is a oarty not duo stop maint it for small
   group pie will allways stay on". So the header is an occupancy —
   "4 of 10" — and the empty chairs are drawn as chairs. There is no
   screen anywhere in here that says "waiting for your opponent".
   ═══════════════════════════════════════════════════════════════════ */

/* the roster, straight off the relay. It is the only thing this screen
   believes about who is in the room. */
function onRoster(m){
  if (!m || !Array.isArray(m.who)) return;
  MP.roster = m;
  if (typeof m.seats === 'number' && m.seats >= 2) MP.size = m.seats | 0;
  const mine = m.who[MP.mySeat];
  MP.iAmReady = !!(mine && mine.ready);
  if (MP.live || MP.boardLive) return;    /* the board is up; nothing to repaint */
  tableLobby();
}

/* THE ROSTER BEFORE THERE IS A ROSTER.
   The relay sends {t:'table'} whenever the table CHANGES, which means the host
   who has just opened one has not been sent anything yet. Rather than draw a
   table on which even his own chair is empty — the exact opposite of "a room
   filling up" — the one chair we already know about is derived from what the
   relay said in `created`: our seat number, our name, and the fact that we are
   plainly here. Nothing is invented; it is replaced by the real roster the
   instant anybody else touches the room. */
function ownRoster(){
  const who = [];
  for (let i = 0; i < MP.size; i++) who.push(null);
  who[MP.mySeat] = { i:MP.mySeat, n:myPresenceName(), here:true, bot:false,
                     ready:MP.iAmReady, lv:0 };
  return { t:'table', code:MP.code, game:MP.game, seats:MP.size, started:false,
           variant:MP.variant, taken:1, min:gameLobby(MP.game).minSeats,
           waiting:MP.iAmReady ? 0 : 1, who };
}

/* seats as the LOBBY CONTRACT wants them: {name, kind, level, ready, link} */
function rosterSeats(){
  const r = MP.roster;
  if (!r) return [];
  return r.who.filter(Boolean).map(w => ({
    seat: w.i,
    name: w.n || 'PLAYER',
    kind: w.bot ? 'cpu' : 'human',
    level: w.lv || 0,
    ready: w.bot ? true : !!w.ready,
    here: w.here !== false,
    link: w.bot ? 'cpu' : 'net'
  }));
}

/* Can this table go, and if not, in WORDS.
   The game's own canStart() answers first — it knows things the lobby does
   not, like whether a partnership game needs an even number. Ours is only the
   floor underneath it. */
function tableCanStart(){
  const LB = gameLobby(MP.game);
  const seats = rosterSeats();
  if (seats.length < 2)
    return { ok:false, why:'A game needs somebody to play it with. Ask a friend, or ' +
                           'put a machine in a chair.' };
  let verdict;
  try { verdict = LB.canStart(seats); }
  catch (e){ verdict = null; }
  if (!verdict || typeof verdict.ok !== 'boolean'){
    const short = seats.length < LB.minSeats;
    const not = seats.filter(s => !s.ready).length;
    verdict = short ? { ok:false, why:'It takes ' + LB.minSeats + ' to play ' + LB.name + '.' }
            : not   ? { ok:false, why:not + (not > 1 ? ' people are' : ' person is') +
                                       ' not ready yet.' }
                    : { ok:true, why:'' };
  }
  return verdict;
}

/* ── the screen ─────────────────────────────────────────────────── */
function tableLobby(){
  const body = $('#mp-body');
  if (!body) return;
  const LB = gameLobby(MP.game);
  if (!MP.roster) MP.roster = ownRoster();
  const seats = rosterSeats();
  const taken = seats.length;
  const iAmHost = MP.mySeat === 0;
  const verdict = tableCanStart();
  const free = [];
  for (let i = 0; i < MP.size; i++)
    if (!seats.some(s => s.seat === i)) free.push(i);

  body.innerHTML =
    '<p class="mp-state" id="mp-stat"><span class="mp-dot"></span><span class="mp-txt"></span></p>' +

    /* ── the table, said once, at the top ── */
    '<div class="mp-thead">' +
      '<span class="mp-rtag g-' + esc(MP.game) + '">' + gameIcon(MP.game) +
        esc(LB.short || LB.name) + '</span>' +
      '<span class="mp-tcount"><b>' + taken + '</b> of ' + MP.size + '</span>' +
    '</div>' +
    '<p class="mp-tsub" id="mp-tsub">' + esc(tableLine(taken, free.length, iAmHost)) + '</p>' +

    /* ── the thirty seconds that lets a stranger sit down ── */
    '<button class="mp-fold" id="mp-rulesbtn" aria-expanded="' + (MP.showRules ? 'true' : 'false') + '">' +
      ico('book') + '<span>What is ' + esc(LB.name) + '?' +
      '<i>' + (MP.showRules ? 'tap to fold it away' : 'thirty seconds, without leaving your chair') +
      /* the sprite, not a glyph. A unicode chevron or a minus sign renders as an
         emoji or as tofu on some phones and it has bitten this project twice. */
      '</i></span><em class="' + (MP.showRules ? 'up' : '') + '">' + ico('arrow-right') +
      '</em></button>' +
    (MP.showRules ? '<div class="mp-rules">' + safeRules(LB) + '</div>' : '') +

    /* ── the chairs ── */
    '<div class="mp-thd">THE TABLE</div>' +
    '<div class="mp-chairs" id="mp-chairs">' +
      chairRows(seats, free, iAmHost, LB) +
    '</div>' +

    /* ── the two drawers, both of which open IN PLACE ── */
    (MP.panel === 'ai'  ? aiDrawer(LB) : '') +
    (MP.panel === 'ask' ? askDrawer() : '') +

    /* ── ready, and start ── */
    '<div class="mp-acts">' +
      '<button class="mp-ready' + (MP.iAmReady ? ' on' : '') + '" id="mp-ready">' +
        (MP.iAmReady ? ico('check') + ' You are ready' : 'I am ready') +
        '<i>' + (MP.iAmReady ? 'tap to say you are not' : 'everybody readies, then the host starts') +
        '</i></button>' +
      (iAmHost
        ? '<button class="btn primary" id="mp-start"' + (verdict.ok ? '' : ' disabled') + '>' +
            (verdict.ok ? ico('play') + ' Start the game' : 'Not yet') + '</button>' +
          (verdict.ok
            ? '<p class="mp-why ok">Everybody is ready. ' + taken + ' playing.</p>'
            : '<p class="mp-why">' + esc(verdict.why) + '</p>')
        : '<p class="mp-why">' + (verdict.ok
            ? esc((seats[0] ? seats[0].name : 'The host') + ' can start whenever they like.')
            : esc(verdict.why)) + '</p>') +
    '</div>' +

    /* ── ask somebody, without leaving the room ── */
    '<button class="btn ghost" id="mp-askbtn" style="margin-top:4px">' + ico('users') +
      ' Ask somebody to join</button>' +

    /* ── the code, folded away: the list is the way in ── */
    '<details style="margin:14px 0 10px"><summary class="tiny">' +
      (MP.private ? 'The code for this room' : 'Waiting for one particular person?') +
      '</summary>' +
      '<p class="tiny" style="line-height:1.7;margin:8px 0 0;text-transform:none;letter-spacing:0">' +
      (MP.private
        ? 'This table is <b>private</b> — it is in nobody’s list. Only somebody you hand ' +
          'this code to can get in.'
        : 'Your table is in everybody’s list right now, labelled <b>' + esc(LB.short || LB.name) +
          '</b> with ' + taken + ' of ' + MP.size + ' chairs taken. If you want one ' +
          'particular person, give them this code.') + '</p>' +
      '<div class="mp-code" id="mp-showcode">' + esc(MP.code) + '</div>' +
      '<button class="btn ghost" id="mp-copy">' + ico('cards') + ' Copy the code</button>' +
    '</details>' +

    '<button class="btn ghost" id="mp-cancel">Leave the table</button>';

  /* ── wiring ── */
  $('#mp-rulesbtn').onclick = () => {
    MP.showRules = !MP.showRules;
    sfx(MP.showRules ? 'ui.sheet' : 'ui.back');
    tableLobby();
  };
  const rd = $('#mp-ready');
  if (rd) rd.onclick = () => {
    /* optimistic only in SOUND. The bit itself is the relay's answer: the
       roster that comes back is what redraws this button, so two phones can
       never disagree about who is ready. */
    sfx(MP.iAmReady ? 'ui.untoggle' : 'ui.toggle');
    send({ t:'ready', on: !MP.iAmReady });
  };
  const st = $('#mp-start');
  if (st) st.onclick = () => { sfx('game.start'); send({ t:'start' }); };
  $('#mp-askbtn').onclick = () => {
    MP.panel = MP.panel === 'ask' ? null : 'ask';
    if (MP.panel === 'ask') whoAsk(true);
    sfx('ui.sheet');
    tableLobby();
  };
  $$('#mp-chairs [data-addai]').forEach(b => b.onclick = () => {
    MP.aiSeat = Number(b.dataset.addai);
    MP.panel = 'ai';
    sfx('ui.sheet');
    tableLobby();
  });
  $$('#mp-chairs [data-dropai]').forEach(b => b.onclick = () => {
    sfx('ui.untoggle');
    send({ t:'bot', seat: Number(b.dataset.dropai), on:false });
  });
  $$('[data-ailv]').forEach(b => b.onclick = () => {
    const lv = Number(b.dataset.ailv);
    sfx('ui.toggle');
    send({ t:'bot', seat: MP.aiSeat, level: lv, name: botName(MP.game, lv), on:true });
    MP.panel = null; MP.aiSeat = -1;
    tableLobby();
  });
  const ax = $('#mp-aix');
  if (ax) ax.onclick = () => { MP.panel = null; MP.aiSeat = -1; sfx('ui.back'); tableLobby(); };
  wireAskDrawer();

  const cp = $('#mp-copy');
  if (cp) cp.onclick = () => {
    try { navigator.clipboard.writeText(MP.code); K.toast('Code copied.'); }
    catch (e){ K.toast('Code: ' + MP.code); }
  };
  $('#mp-cancel').onclick = () => { mpLeave(); mpScreen(); };

  /* the status line is the room's own, and never contradicts the chairs */
  /* The status line is about the ROOM. The line under the start button is about
     the START. They used to both say "1 person is not ready yet", which read
     like the screen was nagging. */
  setState(verdict.ok ? 'ready' : 'waiting',
           MP.private ? 'Private table — only somebody with the code can get in.'
         : taken < 2 ? 'Your table is in the list. Nobody else yet — it only takes one.'
         : verdict.ok ? 'Everybody is ready. ' + taken + ' at the table.'
         : taken + ' at the table, ' + free.length +
           (free.length === 1 ? ' chair free.' : ' chairs free.'));
  paintState();
}

/* the one line under the header. It is the difference between a room that is
   filling up and a room that is empty, so it never says "waiting". */
function tableLine(taken, free, iAmHost){
  /* The count is already on the badge and in the status line. This says what
     to DO about it, which is the one thing neither of those can. */
  if (taken < 2)
    return 'Anyone who opens Online sees your table and can tap straight in — or put a ' +
           'machine in a chair and start right now.';
  if (free > 0)
    return iAmHost ? 'You do not have to fill it. Start whenever everybody is ready.'
                   : 'There is still room for anybody else you want to ask.';
  return 'Every chair is taken.';
}

/* a game's rules panel is HTML the GAME wrote, dropped into ours. It is the
   only third-party HTML this file inserts, and it is the game's own file on
   the same origin — the same trust as calling its start(). A game that throws
   gets its blurb instead of taking the lobby down with it. */
function safeRules(LB){
  try {
    const h = LB.rulesHTML();
    if (typeof h === 'string' && h.trim()) return h;
  } catch (e){}
  return '<p>' + esc(LB.blurb || 'No rules panel from this one yet.') + '</p>';
}

/* ── the chairs ─────────────────────────────────────────────────── */
function chairRows(seats, free, iAmHost, LB){
  /* PEOPLE FIRST, FURNITURE AFTER.
     Drawing every empty chair as its own row was the first thing that went
     wrong on a real phone: an eight-seat tombla table with three friends at it
     became five identical grey rows, and the ready button — the only thing
     anybody came here to press — went below the fold. At sixteen chairs it is
     worse. So the TAKEN chairs are the list, and the free ones are ONE line
     that says how many. The host does not care which chair a machine sits in;
     it takes the next free one. */
  let h = '';
  for (let i = 0; i < MP.size; i++){
    const s = seats.find(x => x.seat === i);
    if (!s) continue;
    const me = s.seat === MP.mySeat;
    const lvl = s.kind === 'cpu'
      ? (LB.levels.find(x => x.level === s.level) || { name:'Machine' }).name : '';
    h += '<div class="mp-chair' + (s.ready ? ' ready' : '') + (me ? ' me' : '') +
          (s.kind === 'cpu' ? ' bot' : '') + (s.here ? '' : ' away') + '">' +
      '<span class="mp-cn">' + (i + 1) + '</span>' +
      '<span class="mp-cw"><b>' + esc(s.name) + (me ? ' <em>you</em>' : '') +
        (i === 0 ? ' <em>host</em>' : '') + '</b>' +
      '<i>' + (s.kind === 'cpu'
                 ? esc(lvl) + ' · ready'
                 : !s.here ? 'lost signal — the chair is held'
                 : s.ready ? 'ready' : 'not ready yet') + '</i></span>' +
      (s.kind === 'cpu'
        ? (iAmHost ? '<button class="mp-cbtn ghost" data-dropai="' + i + '" ' +
                     'aria-label="Take the machine out of chair ' + (i + 1) + '">' +
                     ico('close') + '</button>' : '<span class="mp-ctick">' + ico('check') + '</span>')
        : '<span class="mp-ctick' + (s.ready ? '' : ' off') + '">' +
          (s.ready ? ico('check') : '') + '</span>') +
      '</div>';
  }
  if (free.length){
    h += '<div class="mp-free">' +
      '<span class="mp-freen">' + free.length + '</span>' +
      '<span class="mp-cw"><b>' + free.length +
        (free.length > 1 ? ' chairs still free' : ' chair still free') + '</b>' +
      '<i>' + (MP.private ? 'only with the code' : 'anybody can tap in') + '</i></span>' +
      (iAmHost && LB.levels.length
        ? '<button class="mp-cbtn" data-addai="' + free[0] + '">' + ico('plus') +
          ' Machine</button>'
        : '') +
      '</div>';
  }
  return h;
}

/* ── the machine drawer ─────────────────────────────────────────── */
function aiDrawer(LB){
  return '<div class="mp-drawer" id="mp-ai">' +
    '<div class="mp-dhd"><b>A machine in chair ' + (MP.aiSeat + 1) + '</b>' +
      '<button class="mp-dx" id="mp-aix" aria-label="Close">' + ico('close') + '</button></div>' +
    '<p class="mp-dp">It sits down ready. It will never be the reason the table is ' +
      'waiting for somebody.</p>' +
    LB.levels.map(L =>
      '<button class="mp-lv" data-ailv="' + L.level + '">' +
        ico('diff-' + Math.max(1, Math.min(3, L.level))) +
        '<span><b>' + esc(L.name) + '</b>' +
        (L.note ? '<i>' + esc(L.note) + '</i>' : '') + '</span></button>').join('') +
    '</div>';
}

/* ── asking somebody, from inside the room ──────────────────────── */
function askDrawer(){
  const rec = WHO.recent.slice(0, 8);
  const around = WHO.people.filter(p => p.s === 'idle').slice(0, 8);
  let h = '<div class="mp-drawer" id="mp-ask">' +
    '<div class="mp-dhd"><b>Ask somebody</b>' +
      '<button class="mp-dx" id="mp-askx" aria-label="Close">' + ico('close') + '</button></div>';

  if (!canInvite()){
    h += '<p class="mp-dp">Asking one particular person needs a KARTI account on your side — ' +
         'it is what the invitation is addressed to. Without one, your table is still in ' +
         'everybody’s list and anyone can tap it.</p></div>';
    return h;
  }
  if (WHO.off){
    h += '<p class="mp-dp">This relay is an older build and cannot say who is around. ' +
         'You can still invite by name.</p>';
  }
  if (rec.length){
    h += '<div class="mp-dsub">WHO YOU USUALLY PLAY WITH</div><div class="mp-pills">' +
      rec.map(p => '<button class="mp-pill' + (p.s === 'off' ? ' off' : '') +
        '" data-ask="' + esc(p.n) + '">' + esc(p.n) +
        '<i>' + esc(p.s === 'off' ? 'offline · they will get it later' : whoWord(p)) +
        '</i></button>').join('') + '</div>';
  }
  if (around.length){
    h += '<div class="mp-dsub">AROUND RIGHT NOW, NOT PLAYING</div><div class="mp-pills">' +
      around.map(p => '<button class="mp-pill" data-ask="' + esc(p.n) + '">' + esc(p.n) +
        '<i>open, nothing on</i></button>').join('') + '</div>';
  }
  if (!rec.length && !around.length && !WHO.off){
    h += '<p class="mp-dp">Nobody you have played with is around yet. Ask by name and it ' +
         'will be waiting for them the moment they open KARTI.</p>';
  }
  h += '<div class="mp-dsub">BY NAME</div>' +
    '<div class="mp-askrow"><input class="field" id="mp-invname" maxlength="' + NAME_MAX + '" ' +
      'placeholder="Their KARTI name" autocomplete="off" spellcheck="false" ' +
      'aria-label="Who to invite">' +
    '<button class="btn" id="mp-invgo">Ask</button></div>' +
    '<p class="mp-dp">Nothing is ever said about whether that name has an account — the ' +
      'answer is the same either way. If they do, it is waiting for them.</p>' +
    '</div>';
  return h;
}

function wireAskDrawer(){
  const x = $('#mp-askx');
  if (x) x.onclick = () => { MP.panel = null; sfx('ui.back'); tableLobby(); };
  $$('[data-ask]').forEach(b => b.onclick = () => { sendInvite(b.dataset.ask); });
  const go = $('#mp-invgo');
  if (go) go.onclick = () => sendInvite(($('#mp-invname') || {}).value || '');
}

/* ── somebody left mid-game ─────────────────────────────────────── */
function tableSeatGone(seat, how){
  const LB = gameLobby(MP.game);
  const net = LB.net;
  const name = (MP.roster && MP.roster.who[seat] && MP.roster.who[seat].n) || 'Somebody';
  if (net && net.note)
    net.note(name + (how === 'dropped' ? ' lost signal — holding their chair.'
                                       : ' left the table.'),
             how === 'dropped' ? 'warn' : '');
  K.toast(name + (how === 'dropped' ? ' dropped out.' : ' left.'));
}

/* ── the relay says go ──────────────────────────────────────────── */
function onBegan(m){
  if (MP.live || MP.boardLive) return;
  MP.began = m;
  MP.seed = (typeof m.seed === 'number') ? (m.seed >>> 0) : 0;
  const LB = gameLobby(MP.game);
  if (!LB.online){
    /* The lobby did its job and the game cannot take the ball. Say which half
       is missing rather than showing a blank board. */
    setState('unreachable', LB.name + ' has a lobby but no online half on this phone yet ' +
      '(it needs KARTI_PARTY.online.' + MP.game + '). Nothing was lost — the table is ' +
      'still here.');
    K.toast(LB.name + ' cannot be played online from this build yet.');
    return;
  }
  const bots  = Array.isArray(m.bots) ? m.bots : [];
  const names = (m.names && typeof m.names === 'object') ? m.names : {};
  const lvls  = (m.levels && typeof m.levels === 'object') ? m.levels : {};
  const seats = [];
  for (let i = 0; i < MP.size; i++){
    const w = MP.roster && MP.roster.who ? MP.roster.who[i] : null;
    if (bots.indexOf(i) >= 0){
      seats.push({ seat:i, name: names[String(i)] || 'MACHINE', kind:'cpu',
                   level: Number(lvls[String(i)]) || LB.defaultLevel, own:'ai', link:'cpu' });
    } else if (w){
      seats.push({ seat:i, name: w.n || 'PLAYER', kind:'human',
                   level: LB.defaultLevel,
                   own: i === MP.mySeat ? 'me' : 'net',
                   link: i === MP.mySeat ? 'local' : 'net' });
    } else {
      seats.push(null);
    }
  }
  const live = seats.filter(Boolean);

  /* THE MACHINE IS READY BEFORE ANYBODY LOOKS AT IT. autoReady() is the game's
     own, and is called for every seat rather than only the ones we think are
     machines — that is what the contract is for. */
  const readied = live.map(s => { try { return LB.autoReady(s) || s; } catch (e){ return s; } });

  MP.live = true;
  MP.boardLive = true;
  window.KHOOK = null;
  const net = {
    /* one move out, stamped by the relay on the way in */
    send: d => relay(Object.assign({ k:'bact', game:MP.game }, d || {})),
    move: (kind, a) => relay({ k:'bact', game:MP.game, kind: kind || 'move', m: a || {} }),
    bail: why => { relay({ k:'bail', why: String(why || 'stopped') }); tableStop(why); },
    onLeave: backToRooms,
    seat: MP.mySeat,
    seats: MP.size,
    host: 0
  };
  /* EVERY LOCAL MOVE GOES OUT, AND ONLY LOCAL ONES.
     A table game announces each move it applies through hooks.onMove with the
     source it came from, exactly so a transport can forward the ones a person
     here made and ignore the ones it delivered itself a moment ago. That is
     the whole of the outbound path — there is no second place in this file
     that sends a move, so there is no second place that can send one twice. */
  const hooks = LB.net.hooks || (LB.net.hooks = null);
  if (hooks && typeof hooks.onMove === 'function'){
    if (MP.unMove){ try { MP.unMove(); } catch (e){} }
    MP.unMove = hooks.onMove((mv, info) => {
      if (!MP.live) return;
      if (info && info.src === 'net') return;          /* it came from the wire */
      if (info && typeof info.seat === 'number' && info.seat !== MP.mySeat){
        /* a machine chair the host is playing for. The relay stamps it as that
           chair only if the host was actually given it at start. */
        if (!MP.began || (MP.began.bots || []).indexOf(info.seat) < 0) return;
        const w = toWire(MP.game, mv);
        if (w) sendFor(info.seat, { k:'bact', game:MP.game, kind:'move', m:w });
        return;
      }
      const w = toWire(MP.game, mv);
      if (!w){
        /* rather than send half a move, stop. A move the codec cannot carry is
           a bug in WIRE_FIELDS, and a table quietly drifting apart is worse
           than a table that says so. */
        relay({ k:'bail', why:'A move would not fit on the wire.' });
        tableStop('A ' + LB.name + ' move could not be sent: this build does not know how ' +
                  'to put "' + String(mv && (mv.t || mv.a)) + '" on the wire. Stopped rather ' +
                  'than let the tables drift apart.', 'cheat');
        return;
      }
      relay({ k:'bact', game:MP.game, kind:'move', m:w });
    });
  }
  try {
    LB.net.start({
      /* HOW MANY ARE ACTUALLY PLAYING. Without it a game deals its own default
         table — tombla deals four whatever arrived — and three people sit down
         to find a fourth hand nobody is holding. `seats` is the one opt every
         one of these games understands, because it is the one thing the lobby
         is authoritative about. */
      opts: Object.assign({ seats: live.length }, m.variant ? { mode:m.variant } : {}),
      seed: MP.seed, seats: readied, you: MP.mySeat, host: 0, net,
      /* the same three names the offline setup uses, so a game that reads
         either shape gets what it expects */
      roundLimit: 30, clock: 90
    });
    /* THE GAME'S OWN LOBBY, ANSWERED FROM OURS.
       Two of these games keep an internal lobby phase — tombla will not let a
       number out of the bag until every seat has said ready and the host has
       said start. Our lobby has just asked exactly those questions, of exactly
       those people, and got exactly those answers, and asking again inside the
       game would be the second screen he keeps complaining about.

       So the answers are replayed straight into the engine, LOCALLY, on every
       phone. They are the same moves in the same order from the same seed on
       all of them, so the tables cannot drift; nothing crosses the wire; and a
       game with no lobby phase never notices this code exists. */
    if (hooks && typeof hooks.phase === 'function' && typeof hooks.apply === 'function'){
      try {
        if (hooks.phase() === 'lobby'){
          for (let i = 0; i < live.length; i++) hooks.apply(i, { t:'ready', s:i, v:true });
          hooks.apply(0, { t:'start' });
          /* ...and hand the transport over AGAIN. A game that starts its own
             clock does it when the net is attached, and the net was attached a
             moment ago when this table was still in its lobby phase — so
             without this the numbers never come out of the bag. Re-attaching
             is the game's own idempotent "we are playing now". */
          if (typeof hooks.attachNet === 'function') hooks.attachNet(net);
        }
      } catch (e){}
    }
    sfx('game.start');
    setState('live', null);
  } catch (e){
    MP.live = false; MP.boardLive = false;
    setState('unreachable', 'That game would not start from the lobby. Nothing was lost.');
  }
}

/* a move from another chair. The engine is the referee, not the relay — the
   same rule the duel has always run under, applied per seat. */
function tableRemote(seat, d){
  const LB = gameLobby(MP.game);
  if (!MP.live || !LB.net || !LB.net.remote) return;
  if (seat === MP.mySeat) return;             /* our own move, echoed: ignore */
  let bad = null;
  try {
    /* two shapes are in the wild and both are the game's own choice:
       remote(seat, move) — tombla, skarta, klabb;  remote(d) — chess, dama. */
    if (LB.net.remote.length >= 2){
      const mv = fromWire(MP.game, d.m || d);
      if (!mv) return;                    /* not a shape this game makes */
      bad = LB.net.remote(seat, mv);
    } else {
      bad = LB.net.remote(d);
    }
  } catch (e){ bad = { ok:false, why:'That move could not be applied.' }; }
  if (bad && bad.ok === false && bad.why){
    relay({ k:'bail', why:'A move did not fit the rules here.' });
    tableStop('A move from ' + rosterName(seat) + ' did not fit the rules on this phone: ' +
              bad.why + ' The game was stopped rather than carry on out of step.', 'cheat');
    return;
  }
  if (bad && bad.why && bad.desync){
    relay({ k:'bail', why:'The two tables stopped matching.' });
    tableStop('The tables stopped matching. Stopped rather than lie about the result.', 'cheat');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ONE MOVE, ON THE WIRE
   ───────────────────────────────────────────────────────────────────
   The relay's table payload is deliberately narrow and it is not a
   passthrough: `{a, i, j, s, n, k[]}`, every field bounded, the object
   the other phones receive built field by field on the Pi. A game's own
   move object is not that shape — tombla's is {t,s,c,i}, {t,k,n},
   {t,s,c,p} — so something has to translate, and the relay must not,
   because the relay knowing what "claim" means is the one thing this
   whole design is built to avoid.

   So: ONE generic codec, driven by a declared FIELD ORDER per game.

       a  the action name          (the move's `t`, or `a`)
       n  a bitmask of which of the declared fields are present
       k  their values, in that order, one byte each

   It is lossless for any move that is a name plus a handful of small
   numbers and booleans, which is every move all four table games
   make. A field that is missing is missing, not zero — that is what
   the bitmask is for, and it is why {t:'ready',v:false} survives the
   trip as false rather than arriving as "absent".

   THIS BELONGS IN THE GAME, NOT HERE. The right home for it is
   `wire:{fields:[...]}` (or a toWire/fromWire pair) on the game's own
   lobby contract, next to rulesHTML and canStart — the field list is
   the game's business and it will drift the first time somebody adds a
   move. It is here, in one table, with the game's name on each line,
   so it is obvious what to delete. gameLobby() already prefers a
   published `wire` if it finds one. See docs/ONLINE.md.
   ═══════════════════════════════════════════════════════════════════ */
const WIRE_FIELDS = {
  /* js/tombla.js "THE MOVES": ready{s,v} start{} call{k,n} mark{s,c,i}
     unmark{s,c,i} claim{s,c,p} quit{s} caller{s,to} pause{s,v} */
  tombla: ['s', 'v', 'k', 'n', 'c', 'i', 'p', 'to'],
  /* room to grow: these three have not published a move shape to the lobby
     yet, so the codec carries the fields they are most likely to use and
     lobbyReport() names them. A move with a field that is not in this list
     is refused HERE, loudly, rather than silently arriving incomplete. */
  skarta: ['s', 'v', 'i', 'j', 'c', 'n', 'p'],
  klabb:  ['s', 'v', 'i', 'j', 'c', 'n', 'p'],
  kiri:   ['s', 'v', 'i', 'j', 'c', 'n', 'p'],
  /* js/battleship.js "THE WIRE SHAPE": mode{o} place{p0..p9}
     fire{g,c,o,w,x,u,z} auto{g,u,z} quit{}. The published contract on
     KARTI_GHARRAQ.lobby.wire is preferred; this line is its mirror. */
  gharraq: ['g', 'c', 'o', 'w', 'x', 'u', 'z',
            'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']
};
const WIRE_SKIP = { t:1, a:1 };          /* the action name, carried in `a` */

function wireFields(game){
  const LB = gameLobby(game);
  const pub = LB && LB.wire && Array.isArray(LB.wire.fields) ? LB.wire.fields : null;
  return pub || WIRE_FIELDS[game] || WIRE_FIELDS.tombla;
}

/* the game's move -> the relay's five fields, or null if it will not fit */
function toWire(game, mv){
  if (!mv || typeof mv !== 'object') return null;
  const act = String(mv.t || mv.a || '').toLowerCase();
  if (!/^[a-z0-9_-]{1,16}$/.test(act)) return null;
  const fields = wireFields(game);
  let mask = 0;
  const vals = [];
  for (let f = 0; f < fields.length; f++){
    const v = mv[fields[f]];
    if (v === undefined || v === null) continue;
    const n = (v === true) ? 1 : (v === false) ? 0 : Math.floor(Number(v));
    if (!isFinite(n) || n < 0 || n > 255) return null;
    mask |= (1 << f);
    vals.push(n);
  }
  /* anything the field list does not cover would arrive silently truncated,
     which is worse than not arriving. Refuse it here, where it is visible. */
  for (const key in mv)
    if (!WIRE_SKIP[key] && fields.indexOf(key) < 0 && mv[key] !== undefined) return null;
  const out = { a:act, n:mask };
  if (vals.length) out.k = vals;
  return out;
}

/* ...and back. `d` has already been rebuilt field by field on the relay, so
   everything in here is a bounded integer before it is looked at. */
function fromWire(game, d){
  if (!d || typeof d !== 'object' || typeof d.a !== 'string') return null;
  const fields = wireFields(game);
  const mask = d.n | 0;
  const vals = Array.isArray(d.k) ? d.k : [];
  const mv = { t:d.a };
  let at = 0;
  for (let f = 0; f < fields.length; f++){
    if (!(mask & (1 << f))) continue;
    if (at >= vals.length) return null;
    mv[fields[f]] = vals[at++];
  }
  /* the two fields every one of these games treats as a flag rather than a
     number, restored as flags so a strict engine sees what it wrote */
  if (mv.v !== undefined) mv.v = !!mv.v;
  return mv;
}

/* WHAT TO CALL A MACHINE.
   A game that named its own difficulties named its machine at the same time —
   IL-KIRI's "Iż-Żijja" is a person at the table, not a slider position — so
   those words are used. A game that published nothing gets "MACHINE", because
   the generic level names in LEVELS_FALLBACK are OURS and inventing a player
   called "Ruthless" out of a fallback would be the lobby making something up.
   Either way the difficulty is on the line underneath, every time. */
function botName(game, level){
  const LB = gameLobby(game);
  if (LB.bare) return 'MACHINE';
  const L = LB.levels.find(x => x.level === level);
  return (L && L.name) || 'MACHINE';
}

function rosterName(i){
  const w = MP.roster && MP.roster.who ? MP.roster.who[i] : null;
  return (w && w.n) || ('Chair ' + (i + 1));
}

function tableStop(why, tone){
  const LB = gameLobby(MP.game);
  MP.live = false;
  if (LB.net && LB.net.stop){
    try { LB.net.stop(why || 'The game stopped.', tone || ''); return; } catch (e){}
  }
  MP.boardLive = false;
  setState('stopped', why || 'The game stopped.');
  mpScreen();
}

/* ═══════════════════════════════════════════════════════════════════
   WHO IS AROUND
   ───────────────────────────────────────────────────────────────────
   One ask, one answer, over whichever socket this device already has
   open. Never polled on a timer of its own: it is asked when a screen
   that shows it comes up, and re-asked when the relay NUDGES us —
   which it does at most once every few seconds however much has
   changed. See docs/ONLINE.md, "What presence costs".
   ═══════════════════════════════════════════════════════════════════ */
function whoAsk(force){
  if (WHO.off) return;
  if (!canInvite()) return;             /* no account, no list — by design */
  /* ...and not before THIS socket has proved it. Asking a second too early
     earns a "Sign in first", which used to switch the whole panel off for the
     rest of the session over nothing but a race with the handshake. */
  if (!INBOX.authed) return;
  const now = Date.now();
  if (!force && (now - WHO.asked) < WHO_MIN_GAP) return;
  if (force && (now - WHO.asked) < 900) return;   /* a floor even for a tap */
  WHO.asked = now;
  sendAny({ t:'who' });
}

function onWho(m){
  WHO.people  = Array.isArray(m.people) ? m.people.slice(0, PRESENCE_ROWS) : [];
  WHO.recent  = Array.isArray(m.recent) ? m.recent.slice(0, 12) : [];
  WHO.here    = m.here | 0;
  WHO.sockets = m.sockets | 0;
  if (m.you && typeof m.you === 'object') WHO.me = m.you;
  WHO.got = true;
  paintSocial();
  if (MP.panel === 'ask' && MP.size > 2) tableLobby();
}

/* an invitation that was left while the app was shut. It is not a room — the
   room is long gone — so it is never drawn as one. */
function knockAdd(m){
  if (!m || typeof m.id !== 'string') return;
  WHO.knocks = WHO.knocks.filter(x => x.id !== m.id);
  WHO.knocks.unshift({ id:m.id, from:String(m.from || 'Somebody').slice(0, NAME_MAX),
                       game:cleanGame(m.game), ago:m.ago | 0 });
  WHO.knocks = WHO.knocks.slice(0, KNOCK_MAX);
  paintSocial();
  if (document.querySelector('#scr-home.on') || document.querySelector('#scr-mp.on'))
    K.toast((m.from || 'Somebody') + ' asked you for a game while you were away.');
}

/* "asking them back" is the whole answer to a knock: their room is gone, so we
   open one of the same game and leave the invitation with them. */
function knockAnswer(id){
  const k = WHO.knocks.find(x => x.id === id);
  if (!k) return;
  WHO.knocks = WHO.knocks.filter(x => x.id !== id);
  sendAny({ t:'dropknock', id });
  MP.askBack = k.from;
  openFor(k.game);
}

const whoWord = p =>
  p.s === 'waiting' ? ('a ' + gameMeta(p.g).name.toLowerCase() + ' table, ' +
                       (p.c || 1) + ' of ' + (p.m || 2))
  : p.s === 'playing' ? ('playing ' + gameMeta(p.g).name.toLowerCase())
  : p.s === 'off' ? 'offline'
  : 'open, nothing on';

/* A 1s text clock, and nothing else — it touches one text node, never the
   network. It is stopped the moment the element goes, the tab is hidden, or the
   room is left, so a forgotten lobby costs nothing. */
function startWaitClock(){
  stopWaitClock();
  if (!MP.openedAt) MP.openedAt = Date.now();
  paintWaitAge();
  MP.waitTimer = setInterval(paintWaitAge, 1000);
}
function stopWaitClock(){
  if (MP.waitTimer){ clearInterval(MP.waitTimer); MP.waitTimer = null; }
}
function paintWaitAge(){
  const el = $('#mp-age');
  if (!el){ stopWaitClock(); return; }
  el.textContent = 'open for ' + ago((Date.now() - MP.openedAt) / 1000);
}

function sendHello(){
  MP.myName = K.displayName().toUpperCase();
  if (MP.game !== 'cards'){
    /* our half of the colour draw, thrown before we have seen theirs */
    MP.myNonce = rand32();
    relay({ k:'bhello', game:MP.game, name:MP.myName, nonce:MP.myNonce });
    return;
  }
  const d = findDeck(MP.myDeckId);
  relay({ k:'hello', name:MP.myName, list:d.list, deckKey:d.attr, deckName:d.name });
}

/* The two of us think we are playing different things. That can only happen
   against an older build, so say so once and stop — never guess. */
function gameMismatch(){
  relay({ k:'bail', why:'We are not playing the same game.' });
  endMatch('You and your opponent are not on the same game — one of you is running an ' +
           'older version of KARTI. Reload the page on both phones and try again.');
}

function onPeer(d, from){
  if (!d || typeof d !== 'object' || !d.k) return;

  /* ── the table ──
     `from` is the RELAY's stamp: which chair actually sent this. It is never
     taken from inside the payload, because a client that can label itself can
     label itself as somebody else. At a table it is the only thing that says
     whose move this is, so a payload that arrives without one is dropped
     rather than guessed at. */
  if (MP.size > 2){
    if (d.k === 'bail'){ tableStop(d.why || 'Somebody stopped the game.'); return; }
    if (typeof from !== 'number'){ return; }
    tableRemote(from, d);
    return;
  }

  /* ── the card duel ── */
  if (d.k === 'hello'){
    if (MP.game !== 'cards'){ gameMismatch(); return; }
    MP.peerName = d.name || 'THEM';
    MP.peerList = d.list; MP.peerKey = d.deckKey || null;
    if (MP.host) hostStart();
    else setState('ready', 'Ready. Waiting for the host to deal…');
    return;
  }
  if (d.k === 'start'){
    if (MP.game !== 'cards'){ gameMismatch(); return; }
    if (!MP.live) beginOnline(d);
    return;
  }
  if (d.k === 'act'){ applyRemote(d); return; }

  /* ── chess and dama ── */
  if (d.k === 'bhello'){
    const g = cleanGame(d.game);
    /* Against a relay too old to label a room, the HOST's own hello is the
       only thing that says what this is. The guest takes it and says hello
       again properly; the host never takes the guest's word for its own room. */
    if (!MP.live && !MP.host && MP.game !== g && (g === 'chess' || g === 'dama')){
      MP.game = g;
      sendHello();
    }
    if (MP.game !== g){ gameMismatch(); return; }
    if (!gamePlayable(g)){
      relay({ k:'bail', why:'That game is not on this phone.' });
      endMatch('This copy of KARTI does not have ' + gameMeta(g).name + ' in it yet.');
      return;
    }
    MP.peerName = d.name || 'THEM';
    MP.peerNonce = (typeof d.nonce === 'number') ? (d.nonce >>> 0) : null;
    if (MP.host) hostStartBoard();
    else setState('ready', 'Ready. Drawing for colours…');
    return;
  }
  if (d.k === 'bstart'){
    if (MP.live) return;
    if (MP.game !== cleanGame(d.game)){ gameMismatch(); return; }
    /* VERIFY THE DRAW. The seed must be the XOR of the two halves, and we hold
       both, so a host that quietly picked a seed to hand itself White is caught
       here rather than trusted. */
    if (!MP.host && typeof MP.peerNonce === 'number' && typeof MP.myNonce === 'number'){
      if ((d.seed >>> 0) !== ((MP.peerNonce ^ MP.myNonce) >>> 0)){
        relay({ k:'bail', why:'The colour draw did not add up.' });
        endMatch('The colour draw did not add up — the other phone did not use both ' +
                 'halves of it. Stopped rather than play a rigged game.', 'cheat');
        return;
      }
    }
    beginBoard(d);
    return;
  }
  if (d.k === 'bact'){ boardRemote(d); return; }
  if (d.k === 'btake'){
    const api = partyAPI();
    if (!api || !MP.boardLive || !api.take) return;
    if (MP.game !== cleanGame(d.game)){ gameMismatch(); return; }
    api.take(d);
    return;
  }

  if (d.k === 'bail'){ endMatch(d.why || 'They stopped the game.'); return; }
}

/* the host deals: one seed, both decks pre-shuffled, sent to the guest so
   the two engines start from a byte-identical position */
function hostStart(){
  const mineD = findDeck(MP.myDeckId);
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
  const rng = mulberry32(seed);
  const sh = arr => { for (let i = arr.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
  const payload = {
    /* Drawn from the shared seed rather than picked by the host, so the host
       cannot choose to go first and both devices compute the same answer. */
    k:'start', seed, hostFirst: (seed & 1) === 0,
    hostName: MP.myName || K.displayName().toUpperCase(), guestName: MP.peerName,
    hostList: mineD.list, guestList: MP.peerList,
    hostKey: mineD.attr, guestKey: MP.peerKey || null,
    hostDeck: sh(K.deckToCards(mineD.list)), guestDeck: sh(K.deckToCards(MP.peerList))
  };
  relay(payload);
  beginOnline(payload);
}
function beginOnline(p){
  const iAmHost = MP.host;
  MP.live = true; MP.seed = p.seed;
  K.setRNG(mulberry32(p.seed));
  window.KHOOK = { afterEndTurn: () => true, result: mpResult };
  K.NET.send = (kind, a) => {
    relay({ k:'act', kind, a, ck: checksum() });     /* checksum is PRE-move state */
  };

  const meList  = iAmHost ? p.hostList : p.guestList;
  const foeList = iAmHost ? p.guestList : p.hostList;
  K.startCustomDuel({
    myList: meList, myName: iAmHost ? p.hostName : p.guestName,
    myKey: iAmHost ? p.hostKey : p.guestKey, mode:'online', diff:'regular',
    decks: [ iAmHost ? p.hostDeck : p.guestDeck, iAmHost ? p.guestDeck : p.hostDeck ],
    foe: { name: iAmHost ? p.guestName : p.hostName, list: foeList,
           deckKey: iAmHost ? p.guestKey : p.hostKey, isAI:false },
    first: (iAmHost ? p.hostName : p.guestName) + ' vs ' + (iAmHost ? p.guestName : p.hostName)
  });
  /* Who goes first is a coin toss, not a reward for tapping "open a room".
     Going first is worth about 2.6 points, and the host used to take it every
     single game. Both devices derive the same answer from the shared seed, so
     no extra message is needed and the two engines cannot disagree. Old clients
     (which always seated the host first) keep working: `hostFirst` is absent
     there, and the fallback reproduces exactly the old behaviour. */
  const hostFirst = (typeof p.hostFirst === 'boolean') ? p.hostFirst : true;
  const iGoFirst  = iAmHost ? hostFirst : !hostFirst;
  if (!iGoFirst) K.D.turn = 1;
  K.renderDuel();
  setState('live');
  K.toast('Room ' + MP.code + (iGoFirst ? ' — you go first.' : ' — they go first.'));
}

/* ═══════════════════════════════════════════════════════════════════
   CHESS AND DAMA OVER THE SAME WIRE
   ───────────────────────────────────────────────────────────────────
   Both engines are deterministic and strictly turn-based, so there is
   nothing to deal and nothing to seed: only the MOVE crosses, and each
   phone plays it on its own board.

   WHO IS WHITE is the one thing that has to be agreed, and it is NOT
   the host's to give. Each phone throws a 32-bit number into its
   hello, before it has seen the other's; the seed is the XOR of the
   two; White is the low bit. The guest can check that arithmetic — it
   holds both halves — and stops the game if it does not come out.

   Every move that arrives is handed to the game's own engine, which
   looks it up in the legal-move list it generated from OUR board. A
   move that is not in that list is refused BY NAME and the game ends,
   exactly as illegalRemote() does for the card duel.
   ═══════════════════════════════════════════════════════════════════ */
function partyAPI(){
  const P = window.KARTI_PARTY;
  return (P && P.online && P.online[MP.game]) || null;
}

function hostStartBoard(){
  const seed = (typeof MP.myNonce === 'number' && typeof MP.peerNonce === 'number')
    ? ((MP.myNonce ^ MP.peerNonce) >>> 0)
    : rand32();
  const p = { k:'bstart', game:MP.game, seed };
  relay(p);
  beginBoard(p);
}

/* the same sum on both phones, from the same number */
function myColour(seed){
  const hostWhite = ((seed >>> 0) & 1) === 0;
  return (MP.host ? hostWhite : !hostWhite) ? 'w' : 'b';
}

function beginBoard(p){
  const P = window.KARTI_PARTY;
  const api = partyAPI();
  if (!P || !api){
    relay({ k:'bail', why:'That game is not on this phone.' });
    endMatch('This copy of KARTI does not have ' + gameMeta(MP.game).name + ' in it yet.');
    return;
  }
  MP.live = true; MP.boardLive = true; MP.seed = p.seed >>> 0;
  window.KHOOK = null;
  K.NET.send = null;
  presenceUnmount();            /* nothing polls while a board is up */
  stopWaitClock();
  P.show();                     /* the party screen takes over from the lobby */
  const mine = myColour(MP.seed);
  api.start({
    colour: mine,
    me: MP.myName || myPresenceName(),
    foe: MP.peerName || 'THEM',
    /* a move, or a resignation, on its way out */
    send: (kind, m, ck) => relay({ k:'bact', game:MP.game, kind,
                                   m: m || null, ck: ck || null }),
    /* a takeback ask / yes / no. Everything about WHEN one is allowed lives in
       the game; all this does is put it on the wire. */
    take: (kind, o) => relay({ k:'btake', game:MP.game, kind,
                               n: (o && o.n) || 0, id: (o && o.id) || 0,
                               ck: (o && o.ck) || null }),
    /* the game reached a real result: the room is done, but nobody was cut off */
    onEnd: () => { MP.live = false; },
    /* "back to the rooms" */
    onLeave: backToRooms,
    /* the board went away without us: the app navigated somewhere else */
    onGone: boardGone
  });
  setState('live', '');
  K.toast(gameMeta(MP.game).name + ' — you are ' +
          (mine === 'w' ? (MP.game === 'dama' ? 'the ġbejniet, and you start.'
                                              : 'White, and you start.')
                        : (MP.game === 'dama' ? 'the bajtar. They start.'
                                              : 'Black. They start.')));
}

/* a move from the other phone. The engine is the referee, not the relay. */
function boardRemote(d){
  const api = partyAPI();
  if (!api || !MP.boardLive) return;
  if (MP.game !== cleanGame(d.game)){ gameMismatch(); return; }
  const bad = api.remote(d);
  if (!bad) return;
  if (bad.desync){
    relay({ k:'bail', why:'The two boards went out of step.' });
    endMatch('The two devices went out of step, so the game was stopped rather than ' +
             'fake it.');
    return;
  }
  relay({ k:'bail', why:'Illegal move refused.' });
  endMatch('Your opponent sent ' + bad.why + ', which the rules do not allow. The game ' +
           'was stopped — nothing was awarded.', 'cheat');
}

/* the only way back to the lobby from a board */
function backToRooms(){
  MP.boardLive = false;
  mpLeave();
  mpScreen();
  K.go('mp');                   /* turns #scr-mp on, which stands the board down */
}

/* the board was torn down by something other than us — a nav tap, a restored
   session, anything that switches screens. Leaving the screen leaves the room. */
function boardGone(){
  if (!MP.boardLive) return;
  MP.boardLive = false;
  if (MP.live){ relay({ k:'bail', why:'They left the game.' }); MP.live = false; }
  mpLeave();
}

/* Canonical board fingerprint. Built host-seat-first so both devices, which
   hold the two players in opposite slots, produce the same string. */
function checksum(){
  const D = K.D;
  if (!D) return '';
  const order = MP.host ? [0, 1] : [1, 0];
  const part = pi => {
    const P = D.p[pi];
    const z = a => a.map(m => m ? (m.cid + (m.fd ? 'f' : 'u') + (m.pos || '') + (m.mod || 0)) : '-').join(',');
    return P.lp + '|' + P.hand.length + '|' + P.deck.length + '|' + P.grave.length +
           '|' + z(P.mz) + '|' + z(P.sz);
  };
  const turnCanon = MP.host ? D.turn : 1 - D.turn;
  return D.turnCount + '/' + D.phase + '/' + turnCanon + '/' + part(order[0]) + '//' + part(order[1]);
}

/* ── is that move even legal? ────────────────────────────────────────
   The relay is a dumb pipe and the engine trusts whoever calls it, so the
   ONLY thing standing between us and a peer with devtools open is this
   function. It re-runs the same legality checks the engine's own UI runs,
   from OUR copy of the board, before the move is applied. Anything that
   does not pass ends the duel — we do not quietly play on.

   It is not a cheat-proof design and is not sold as one: see
   docs/ONLINE.md, "What a cheating player can still do".              */
const isInt = n => typeof n === 'number' && isFinite(n) && Math.floor(n) === n;

function illegalRemote(kind, a){
  const D = K.D;
  if (!D) return 'there is no duel running';
  if (D.over) return 'the duel is already finished';
  if (kind === 'forfeit') return null;                 /* anyone may quit */
  if (D.turn !== 1) return 'a move out of turn';
  const P = D.p[1];                                    /* they are always slot 1 here */
  const Z = K.ZONES;
  a = a || {};

  const zoneOK = z => isInt(z) && z >= 0 && z < Z;
  const handOK = h => isInt(h) && h >= 0 && h < P.hand.length;

  if (kind === 'summon'){
    if (D.phase !== 'main') return 'a summon outside the main phase';
    if (!handOK(a.hi)) return 'a card that is not in their hand';
    if (!zoneOK(a.zi)) return 'a monster zone that does not exist';
    if (a.pos !== 'atk' && a.pos !== 'def') return 'an impossible battle position';
    const info = K.summonInfo(1, a.hi);
    if (!info || !info.ok) return (info && info.why) || 'an illegal summon';
    const tr = a.tributes || [];
    if (!Array.isArray(tr) || tr.length !== info.need) return 'the wrong number of tributes';
    const seen = {};
    for (let i = 0; i < tr.length; i++){
      const t = tr[i];
      if (!zoneOK(t)) return 'a tribute from a zone that does not exist';
      if (seen[t]) return 'the same monster tributed twice';
      seen[t] = 1;
      if (!P.mz[t]) return 'a tribute from an EMPTY zone';   /* the classic cheat */
    }
    return null;
  }

  if (kind === 'set'){
    if (D.phase !== 'main') return 'a set outside the main phase';
    if (!handOK(a.hi)) return 'a card that is not in their hand';
    if (!zoneOK(a.zi)) return 'a spell zone that does not exist';
    const card = K.cardById(P.hand[a.hi]);
    if (!card || card.t === 'monster') return 'setting something that is not a spell or trap';
    if (K.freeZone(1, 's') < 0 && !!P.sz[a.zi]) return 'a set with no free zone';
    return null;
  }

  if (kind === 'spell'){
    if (D.phase !== 'main') return 'a spell outside the main phase';
    if (!handOK(a.hi)) return 'a card that is not in their hand';
    const card = K.cardById(P.hand[a.hi]);
    if (!card || card.t !== 'spell') return 'playing something that is not a spell';
    if (!K.canActivateSpell(1, card)) return 'a spell that cannot be activated right now';
    if (K.spellNeedsTarget(card)){
      const t = a.target;
      if (!t || !isInt(t.i) || (t.side !== 0 && t.side !== 1)) return 'a spell with no legal target';
      /* the wire target is in THEIR seat frame; flip it into ours */
      const mine = { side: 1 - t.side, i: t.i };
      const legal = K.spellTargets(1, card) || [];
      if (!legal.some(x => x.side === mine.side && x.i === mine.i))
        return 'a spell aimed at something it cannot touch';
    }
    return null;
  }

  if (kind === 'attack'){
    if (D.phase !== 'battle') return 'an attack outside the battle phase';
    if (!zoneOK(a.zi)) return 'an attack from a zone that does not exist';
    if (!K.canAttack(1, a.zi)) return 'an attack that monster is not allowed to make';
    const legal = K.legalAttackTargets(1, a.zi) || [];
    if (legal.indexOf(a.t) < 0) return 'an attack on a target the rules do not allow';
    return null;
  }

  if (kind === 'pos'){
    if (D.phase !== 'main') return 'a position change outside the main phase';
    if (!zoneOK(a.zi)) return 'a position change in a zone that does not exist';
    const m = P.mz[a.zi];
    if (!m) return 'a position change on an empty zone';
    if (m.sumTurn === D.turnCount) return 'a position change on a monster summoned this turn';
    if (m.atkCount > 0) return 'a position change after attacking';
    return null;
  }

  if (kind === 'battle'){
    if (D.phase !== 'main') return 'a battle phase from the wrong phase';
    if (K.noBattleYet()) return 'a battle phase on the opening turn';
    return null;
  }

  if (kind === 'end') return null;

  return 'a move KARTI does not have';
}

function applyRemote(d){
  if (!MP.live || !K.D || K.D.over) return;

  /* 1 — are the two boards still the same board? */
  if (d.ck && d.ck !== checksum()){
    relay({ k:'bail', why:'The two boards went out of step.' });
    endMatch('The two devices went out of step, so the duel was stopped rather than fake it.');
    return;
  }

  /* 2 — is the move legal at all? */
  const a = d.a || {};
  const bad = illegalRemote(d.kind, a);
  if (bad){
    relay({ k:'bail', why:'Illegal move refused.' });
    endMatch('Your opponent sent ' + bad + ', which the rules do not allow. ' +
             'The duel was stopped — nothing was awarded.', 'cheat');
    return;
  }

  K.NET.applying = true;
  try {
    switch (d.kind){
      case 'summon': K.summon(1, a.hi, a.zi, a.pos, a.fd, a.tributes); break;
      case 'set':    K.setST(1, a.hi, a.zi); break;
      case 'spell':  K.activateSpell(1, a.hi, a.target ? { side: 1 - a.target.side, i:a.target.i } : undefined); break;
      case 'attack': K.doAttack(1, a.zi, a.t); break;
      case 'pos':    K.changePosition(1, a.zi); break;
      case 'battle': K.toBattle(); break;
      case 'end':    K.endTurn(); break;
      case 'forfeit': K.endDuel(0, K.D.p[1].name + ' walks away from the table.'); break;
    }
  } catch (e){
    K.NET.applying = false;
    endMatch('Something went wrong applying their move, so the duel was stopped.');
    return;
  } finally {
    K.NET.applying = false;
  }
  K.renderDuel();
}

/* ── the duel is over, and not because somebody won ────────────────── */
function endMatch(why, flavour){
  const wasLive = MP.live;
  MP.live = false;
  K.NET.send = null; K.NET.applying = false;
  K.setRNG(null);
  window.KHOOK = null;
  hardClose();
  MP.token = null; MP.joined = false;
  setState('stopped', why);
  /* A board game says this on its own screen, not in the card game's modal —
     the player is looking at #scr-party, and boardLive stays true so the
     "back to the rooms" button on that card still works. */
  if (MP.boardLive){
    const api = partyAPI();
    if (api) api.stop(why, flavour);
    return;
  }
  if (!wasLive) return;
  const title = flavour === 'cheat' ? 'NO DEAL' : 'CUT OFF';
  K.openModal(
    '<div class="result"><div class="big lose">' + title + '</div>' +
    '<p class="muted">' + esc(why) + '</p>' +
    '<p class="tiny" style="line-height:1.6">Nothing was awarded — neither of you ' +
    'lost anything for a connection problem.</p>' +
    '<div style="display:grid;gap:9px;width:100%;margin-top:6px">' +
      '<button class="btn hot" id="do-retry">' + ico('refresh') + ' Try another room</button>' +
      '<button class="btn ghost" id="do-home">Back to menu</button></div></div>');
  const p = $('#do-retry'), h = $('#do-home');
  if (p) p.onclick = () => { K.closeModal(); K.D = null; mpLeave(); mpScreen(); K.go('mp'); };
  if (h) h.onclick = () => { K.closeModal(); K.D = null; mpLeave(); K.go('home'); };
}
/* kept under the old name: other code (and the harness) calls dropOut() */
const dropOut = endMatch;

function mpResult(winner, why){
  if (!MP.live) return false;
  const won = winner === 0;
  MP.live = false;
  K.NET.send = null;
  K.setRNG(null);
  setState('idle', 'Duel finished.');
  const S = K.S;
  const coins = won ? 80 : 20;
  S.coins += coins;
  if (won) S.rec.w++; else S.rec.l++;
  K.save();
  K.openModal(
    '<div class="result">' +
      '<div class="big ' + (won ? 'win' : 'lose') + '">' + (won ? 'REBAH!' : 'TELFA') + '</div>' +
      '<p class="tiny">' + (won ? 'You beat ' : 'Beaten by ') + esc(K.D ? K.D.p[1].name : 'them') + '</p>' +
      '<p class="muted">' + esc(why) + '</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
        '<span class="pill">' + ico('coin') + ' +' + coins + '</span>' +
        '<span class="pill">' + ico('trophy') + ' ' + S.rec.w + '–' + S.rec.l + '</span></div>' +
      '<p class="tiny" style="line-height:1.6">Online duels pay coins only — no packs.</p>' +
      '<div style="display:grid;gap:9px;width:100%;margin-top:4px">' +
        '<button class="btn ghost" id="mr-home">Back to menu</button></div>' +
    '</div>');
  const h = $('#mr-home');
  if (h) h.onclick = () => { K.closeModal(); K.D = null; mpLeave(); window.KHOOK = null; K.go('home'); };
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   3 · WHO IS ONLINE  —  the home-screen panel
   ───────────────────────────────────────────────────────────────────
   Two halves, both deliberately small:

     the BEACON   one WebSocket, opened only while the Home screen is
                  actually on screen and the tab is actually visible. All
                  it ever sends is a display name and a keep-alive. It is
                  what puts YOU in everyone else's list.
     the POLL     a plain GET of /presence every 12s, same rule: only
                  while Home is visible. Backing off on `visibilitychange`
                  and stopping dead on screen change is the whole point —
                  a menu left open in a background tab must cost nothing.

   The relay answers with names, states and counts. It does not answer
   with room codes, tokens or addresses, so there is nothing here that a
   stranger could use to get into somebody else's duel. The one thing you
   CAN act on is a player who is waiting: they are advertising an empty
   seat, and their handle is good for exactly that one thing.

   Failure is a first-class state. The owner's own devices cannot reach
   the relay at all while Tailscale is on (a public https page is not
   allowed to open a connection to a private address), so "cannot reach
   the server" is going to be seen regularly and must never be dressed up
   as "nobody is online".
   ═══════════════════════════════════════════════════════════════════ */
const PR = {
  mounted:false, fast:false, ws:null, pingTimer:null, timer:null, hideTimer:null,
  last:0, busy:false, data:null, err:null, tried:false
};

function myPresenceName(){
  let n = '';
  try { n = (K.displayName() || '').toString(); } catch (e){}
  /* the same scrub the relay applies, done on this side too so what shows in
     the list is exactly what we sent. Written without \x escapes on purpose. */
  n = n.toUpperCase().split('').filter(c =>
        c >= ' ' && c !== '\u007f' && '<>&"\'\\`'.indexOf(c) < 0).join('')
        .trim().slice(0, NAME_MAX);
  return n || 'PLAYER';
}

/* the /presence twin of whatever relay address is in force */
function presenceURL(){
  const u = (MP.url || defaultURL()).trim();
  if (!u || u === RELAY_URL) return RELAY_PRESENCE;
  return u.replace(/^ws/i, 'http').replace(/\/ws(\/)?$/i, '/presence');
}

/* ── the beacon ─────────────────────────────────────────────────── */
function presenceBeaconOpen(){
  if (PR.ws || MP.ws) return;                     /* never two sockets at once */
  if (!PR.mounted || document.hidden) return;
  const url = (MP.url || defaultURL()).trim();
  if (!/^wss?:\/\//i.test(url)) return;
  if (isSecurePage() && url.slice(0, 6).toLowerCase() !== 'wss://') return;
  let ws;
  try { ws = new WebSocket(url); } catch (e){ return; }
  PR.ws = ws;
  ws.onopen = () => {
    try { ws.send(JSON.stringify({ t:'name', n: myPresenceName() })); } catch (e){}
    /* and, if this profile has an account, collect anything left for us while
       we were away — this is the socket that is open while you are sat on the
       home screen doing nothing */
    authProbe(ws);
  };
  /* The beacon listens for the relay confirming our display name — until that
     lands, /presence would list us as an anonymous PLAYER, so the first poll
     is held back — and for invitations addressed to this account. */
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (err){ return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'named'){ presenceTick(); return; }
    if (m.t === 'authed'){
      MP.authProbe = false;
      INBOX.authed = true;
      INBOX.name = (typeof m.name === 'string' ? m.name : '').slice(0, NAME_MAX);
      WHO.off = false;
      WHO.asked = 0;
      WHO.me = { n: INBOX.name, s:'idle', vis: m.vis !== false };
      whoAsk(true);
      return;
    }
    if (m.t === 'invite'){
      inboxAdd(m);
      K.toast((m.from || 'Somebody') + ' wants a game of ' +
              gameMeta(cleanGame(m.game)).name.toLowerCase() + '.');
      return;
    }
    if (m.t === 'invitegone'){ inboxDrop(m.id); return; }
    /* ── the social half, on the socket that is already open ── */
    if (m.t === 'stir'){ whoAsk(); return; }
    if (m.t === 'who'){ onWho(m); return; }
    if (m.t === 'knock'){ knockAdd(m); return; }
    if (m.t === 'knockgone'){
      WHO.knocks = WHO.knocks.filter(x => x.id !== m.id); paintSocial(); return;
    }
    if (m.t === 'visible'){
      if (WHO.me) WHO.me.vis = m.on !== false;
      K.toast(m.on === false ? 'You are invisible to other players now.'
                             : 'Other players can see you again.');
      paintSocial();
      return;
    }
    if (m.t === 'error'){
      /* An older relay does not know "who" and says "Bad message."; a newer one
         says "Sign in first" when there is no account. Either way the list is
         simply not offered, and nothing else on the screen is affected. */
      if (/^Bad message/i.test(m.why || '') || /^Sign in first/i.test(m.why || '')){
        WHO.off = true;
        paintSocial();
      }
      if (MP.authProbe){ MP.authProbe = false; INBOX.authed = false; }
    }
  };
  ws.onerror = () => {};
  ws.onclose = () => { if (PR.ws === ws) PR.ws = null; };
  clearInterval(PR.pingTimer);
  PR.pingTimer = setInterval(() => {
    if (PR.ws && PR.ws.readyState === 1){ try { PR.ws.send('{"t":"ping"}'); } catch (e){} }
  }, PRESENCE_PING);
}
function presenceBeaconClose(){
  clearInterval(PR.pingTimer); PR.pingTimer = null;
  const ws = PR.ws;
  PR.ws = null;
  if (!ws) return;
  try { ws.onclose = null; ws.onmessage = null; ws.onerror = null; ws.close(); } catch (e){}
}

/* ── the poll ───────────────────────────────────────────────────── */
function presencePoll(){
  if (!PR.mounted || document.hidden || PR.busy) return;
  /* PRESENCE_MIN_GAP is a hard floor, not a default. Nothing — not the refresh
     button, not coming back to Home, not a tab waking up — gets under it. */
  if (Date.now() - PR.last < PRESENCE_MIN_GAP) return;
  PR.busy = true;
  PR.last = Date.now();
  presenceBeaconOpen();

  let ctl = null, sig;
  try { ctl = new AbortController(); sig = ctl.signal; } catch (e){}
  const bail = setTimeout(() => { try { if (ctl) ctl.abort(); } catch (e){} }, PRESENCE_HTTP_TO);
  const done = () => { clearTimeout(bail); PR.busy = false; PR.tried = true; presencePaint(); };

  fetch(presenceURL(), { cache:'no-store', signal: sig })
    .then(r => {
      if (r.status === 404) throw { kind:'old' };
      if (r.status === 429) throw { kind:'busy' };
      if (!r.ok) throw { kind:'down' };
      return r.json();
    })
    .then(j => {
      if (!j || j.ok !== true || !Array.isArray(j.players)) throw { kind:'notrelay' };
      PR.data = j; PR.err = null;
    })
    .catch(e => { PR.data = null; PR.err = (e && e.kind) || 'down'; })
    .then(done, done);
}

/* One timer, re-armed each time. If a tick lands inside the floor it does not
   poll — it just comes back when the floor lifts. */
function presenceTick(){
  clearTimeout(PR.timer);
  const since = Date.now() - PR.last;
  let wait = PR.fast ? PRESENCE_LOBBY : PRESENCE_EVERY;
  if (since >= PRESENCE_MIN_GAP) presencePoll();
  else wait = PRESENCE_MIN_GAP - since + 120;
  PR.timer = setTimeout(presenceTick, wait);
}

/* ── the panel ──────────────────────────────────────────────────── */
const STATE_WORD = {
  idle:    { word:'in the lobby', icon:'users' },
  waiting: { word:'waiting for a duel', icon:'flag' },
  playing: { word:'in a duel', icon:'type-monster' }
};

/* One poll, two things drawn from it: the home-screen panel and the Online
   screen's room list. Each is a no-op when its element is not on the page. */
function presencePaint(){ inboxLive(); paintHomePanel(); paintRooms(); paintInvites(); }

function paintHomePanel(){
  const host = $('#home-online');
  if (!host) return;
  injectCSS();
  if (!PR.mounted){ host.className = 'onlinebox'; host.innerHTML = ''; return; }

  const me = myPresenceName();
  const d = PR.data;
  let tone = '', count = '', body = '';
  /* An invitation goes at the TOP, before anything else on this panel. Being
     asked for a game by name is the most interesting thing that can be on
     this screen, and having to hunt for it would defeat the point. */
  const invites = inviteCards('home');

  if (PR.err){
    tone = ' on-bad';
    count = 'offline';
    body =
      '<p class="on-note"><b>Cannot reach the KARTI server.</b> This is not a crash and ' +
      'nobody has vanished — the list simply could not be fetched, so it is not being shown.</p>' +
      (PR.err === 'old'
        ? '<p class="on-note">That relay is an older build that does not keep an online list yet.</p>'
        : PR.err === 'busy'
        ? '<p class="on-note">The server asked us to slow down. It will try again shortly.</p>'
        : PR.err === 'notrelay'
        ? '<p class="on-note">Something answered, but it was not the KARTI relay.</p>'
        : '<p class="on-note"><b>If Tailscale is on, turn it off.</b> A public web page is not ' +
          'allowed to talk to a private network address, so the relay looks unreachable ' +
          'until you do. Otherwise: check you are online, or the server may be down.</p>') +
      '<p class="on-note">Everything else in KARTI works with no internet at all.</p>';
  } else if (!PR.tried || !d){
    count = '…';
    body = '<p class="on-note">Checking who is about…</p>';
  } else if (!d.count){
    count = '0';
    body = '<p class="on-note">Nobody is on right now. Open <b>Multiplayer › Online</b> and ' +
           'make a room — whoever turns up next will see you waiting here.</p>';
  } else {
    tone = ' on-live';
    count = d.count + ' on';
    const rows = d.players.slice(0, (d.max || PRESENCE_ROWS)).map(p => {
      const st = STATE_WORD[p.s] ? p.s : 'idle';
      const info = STATE_WORD[st];
      const mine = (p.n || '') === me;
      const inner =
        '<span class="onmark">' + ico(info.icon) + '</span>' +
        '<span class="onwho"><span class="onname">' + esc(p.n || 'PLAYER') +
          (mine ? ' <span class="onme">(you)</span>' : '') + '</span>' +
          '<span class="onstate">' + info.word + '</span></span>';
      if (st === 'waiting' && p.id && !mine)
        return '<button class="onrow join s-waiting" data-join="' + esc(p.id) + '" ' +
               'data-who="' + esc(p.n || 'PLAYER') + '">' + inner +
               '<span class="ongo">' + ico('arrow-right') + 'Join</span></button>';
      return '<div class="onrow s-' + st + '">' + inner + '</div>';
    }).join('');
    const hidden = d.count - (d.shown || d.players.length);
    body = '<div class="on-list">' + rows + '</div>' +
      (hidden > 0 ? '<p class="on-more">and ' + hidden + ' more</p>' : '') +
      (d.waiting ? '' : '<p class="on-note">Nobody has a room open. Tap <b>Multiplayer</b> ' +
                        'to start one.</p>');
  }

  const knocks = knockCards();
  host.className = 'onlinebox' + (invites || knocks ? ' on-invited' : '') + tone;
  host.innerHTML =
    '<div class="on-head"><span class="on-dot"></span><h2>Who&rsquo;s online</h2>' +
      '<span class="on-count">' + esc(count) + '</span>' +
      '<button class="on-ref" id="on-refresh" aria-label="Check again">' + ico('refresh') +
      '</button></div>' +
    invites + knocks +
    '<div class="on-body" role="status" aria-live="polite">' + body + '</div>' +
    recentStrip();
  wireInvites(host);
  wireKnocks(host);
  wireRecent(host);

  const ref = $('#on-refresh');
  if (ref) ref.onclick = () => {
    if (Date.now() - PR.last < PRESENCE_MIN_GAP){ K.toast('Just a moment\u2026'); return; }
    presencePoll();
  };
  K.$$('[data-join]', host).forEach(el => {
    el.onclick = () => joinRoom(el.getAttribute('data-join'), el.getAttribute('data-who'));
  });
}

/* ═══════════════════════════════════════════════════════════════════
   THE SOCIAL PANEL
   ───────────────────────────────────────────────────────────────────
   Two things, and they answer two different questions.

   A KNOCK is somebody who wanted a game while the app was shut. It is
   drawn at the very top because it is the most interesting thing that
   can be on this screen — and it is drawn as "ask them back", never
   as a room, because the room it came from is long gone. Tapping it
   opens a table of the same game and leaves the invitation with them.

   RECENTLY PLAYED WITH is the short list that makes inviting the same
   four friends one tap and no typing: "so easy to i vite or recently
   played so iff offline jnvite him". An offline friend is still on it,
   because inviting them is exactly what you want to do — the note
   waits for them.
   ═══════════════════════════════════════════════════════════════════ */

function paintSocial(){ paintHomePanel(); paintOnlineSocial(); }

function knockCards(){
  if (!WHO.knocks.length) return '';
  return '<div class="mp-inbox">' + WHO.knocks.map(k => {
    const gm = gameMeta(k.game);
    return '<div class="mp-invite mp-knock" data-knock="' + esc(k.id) + '">' +
      '<span class="mp-ivi">' + gameIcon(k.game) + '</span>' +
      '<span class="mp-ivw"><b>' + esc(k.from) + '</b> wanted a game of ' +
        esc(gm.name.toLowerCase()) + '<i>' + esc(ago(k.ago)) + ' ago · they are not in that ' +
        'room any more</i></span>' +
      '<span class="mp-ivb">' +
        '<button class="mp-ivgo" data-knockgo="' + esc(k.id) + '">Ask back</button>' +
        '<button class="mp-ivno" data-knockno="' + esc(k.id) + '" ' +
          'aria-label="Put it down">' + ico('close') + '</button>' +
      '</span></div>';
  }).join('') + '</div>';
}

function wireKnocks(host){
  K.$$('[data-knockgo]', host).forEach(b => b.onclick = () => knockAnswer(b.dataset.knockgo));
  K.$$('[data-knockno]', host).forEach(b => b.onclick = () => {
    const id = b.dataset.knockno;
    WHO.knocks = WHO.knocks.filter(x => x.id !== id);
    sendAny({ t:'dropknock', id });
    sfx('ui.back');
    paintSocial();
  });
}

/* the strip of people you actually play with. Nothing at all when it is
   empty — an empty shortcut is worse than no shortcut. */
function recentStrip(){
  if (!canInvite() || !WHO.recent.length) return '';
  const rows = WHO.recent.slice(0, 8);
  return '<div class="mp-recent"><div class="mp-rectitle">' + ico('users') +
    ' You usually play with</div><div class="mp-pills">' +
    rows.map(p => '<button class="mp-pill' + (p.s === 'off' ? ' off' : '') +
      (p.s === 'waiting' && p.id ? ' go' : '') + '"' +
      (p.s === 'waiting' && p.id ? ' data-recjoin="' + esc(p.id) + '"' +
                                   ' data-recg="' + esc(p.g || '') + '"'
                                 : ' data-recask="' + esc(p.n) + '"') +
      ' data-who="' + esc(p.n) + '">' + esc(p.n) +
      '<i>' + esc(p.s === 'waiting' ? 'tap to join them' : whoWord(p)) + '</i></button>').join('') +
    '</div></div>';
}

function wireRecent(host){
  K.$$('[data-recjoin]', host).forEach(b => b.onclick = () =>
    joinRoom(b.dataset.recjoin, b.dataset.who, b.dataset.recg || null));
  K.$$('[data-recask]', host).forEach(b => b.onclick = () => {
    /* You cannot invite anybody without a room open, and making somebody open
       one first is exactly the extra screen he complained about. So: open a
       table of whatever they last played with you, and the invitation goes out
       the moment we are sitting in it. */
    MP.askBack = b.dataset.recask;
    const p = WHO.recent.find(x => x.n === b.dataset.recask);
    openFor((p && p.g) || MP.wantGame || storedGame());
  });
}

/* ── the same two lists, on the Online screen, above the rooms ──── */
function paintOnlineSocial(){
  const host = $('#mp-social');
  if (!host) return;
  /* THE RELAY IS NOT THERE. Which, from the owner's own phone, is the normal
     case — a public https page may not talk to a private address. The room
     list underneath already says so at length; a second panel offering to
     show him who is around would be this screen lying about what it can do. */
  if (PR.err){ host.innerHTML = ''; return; }
  if (!canInvite()){
    host.innerHTML =
      '<div class="mp-box"><b>Sign in and you can see who is about.</b> Only signed-in ' +
      'players are ever named here — a guest is counted and never listed, which is why ' +
      'you have to be one to read it. The room list below needs no account at all.</div>';
    return;
  }
  if (WHO.off){ host.innerHTML = ''; return; }
  const idle    = WHO.people.filter(p => p.s === 'idle');
  const waiting = WHO.people.filter(p => p.s === 'waiting');
  const playing = WHO.people.filter(p => p.s === 'playing');
  const vis = !WHO.me || WHO.me.vis !== false;

  let body = '';
  if (!WHO.got){
    body = '<p class="on-note">Looking for people…</p>';
  } else if (!WHO.people.length){
    body = '<p class="on-note">Nobody signed in is around right now. Open a table anyway — ' +
           'it goes in everybody’s list, and anyone you ask will get the invitation ' +
           'whenever they next open KARTI.</p>';
  } else {
    const row = p =>
      '<button class="mp-person s-' + esc(p.s) + '"' +
        (p.s === 'waiting' && p.id ? ' data-pjoin="' + esc(p.id) + '" data-pg="' +
          esc(p.g || '') + '"' : ' data-pask="' + esc(p.n) + '" data-pg="' +
          esc(p.g || '') + '"') +
        ' data-who="' + esc(p.n) + '">' +
        '<span class="mp-pav">' + esc((p.n || '?').slice(0, 2).toUpperCase()) + '</span>' +
        '<span class="mp-pw"><b>' + esc(p.n) + '</b><i>' + esc(whoWord(p)) + '</i></span>' +
        '<span class="mp-pgo">' + (p.s === 'waiting' ? 'Join' : p.s === 'idle' ? 'Ask' : '') +
        '</span></button>';
    body =
      (waiting.length ? '<div class="mp-dsub">A CHAIR YOU CAN TAKE NOW</div>' +
        waiting.map(row).join('') : '') +
      (idle.length ? '<div class="mp-dsub">OPEN AND NOT PLAYING</div>' +
        idle.map(row).join('') : '') +
      (playing.length ? '<div class="mp-dsub">MID-GAME</div>' +
        playing.map(row).join('') : '');
  }

  host.innerHTML =
    '<div class="mp-rhead"><h3>Who is around</h3>' +
      '<span class="mp-rcount">' + (WHO.got ? WHO.here : '…') + '</span>' +
      '<button class="mp-ref" id="mp-vis" aria-label="' +
        (vis ? 'Go invisible' : 'Be visible again') + '" title="' +
        (vis ? 'Go invisible' : 'Be visible again') + '">' +
        ico(vis ? 'star' : 'lock') + '</button></div>' +
    (vis ? '' : '<div class="mp-box warn">You are <b>invisible</b>. Nobody sees you in ' +
                'their list and nobody can tap you. You can still see them, and you can ' +
                'still open a table.</div>') +
    body + recentStrip();

  const v = $('#mp-vis');
  if (v) v.onclick = () => { sfx('ui.toggle'); sendAny({ t:'visible', on: !vis }); };
  K.$$('[data-pjoin]', host).forEach(b => b.onclick = () =>
    joinRoom(b.dataset.pjoin, b.dataset.who, b.dataset.pg || null));
  K.$$('[data-pask]', host).forEach(b => b.onclick = () => {
    MP.askBack = b.dataset.pask;
    openFor(b.dataset.pg || MP.wantGame || storedGame());
  });
  wireRecent(host);
}

/* ── the room list ───────────────────────────────────────────────────────────
   Fed by the same /presence answer as the home panel. The relay gives us
   `rooms`: [{id, n, w}] — an opaque per-socket handle, the opener's scrubbed
   display name, and how many seconds it has waited. NO room code is in there,
   for our own room or anyone else's, and the handle only exists while that
   seat is genuinely free and public. An older relay sends no `rooms` at all, so
   we fall back to the waiting players it does list. */
function roomsFrom(d){
  if (!d) return null;
  let raw = null;
  if (Array.isArray(d.rooms)) raw = d.rooms;
  else if (Array.isArray(d.players))
    raw = d.players.filter(p => p && p.s === 'waiting' && p.id);
  if (!raw) return null;
  /* The relay is ours, but the answer arrives over the public internet, so every
     row is normalised before it is drawn: a handle must be a string, a name is
     capped at the same length the relay caps it, a wait time must be a real
     non-negative number, and the list itself is capped whatever we are sent. */
  return raw.filter(r => r && typeof r === 'object' && typeof r.id === 'string' && r.id)
            .slice(0, PRESENCE_ROWS)
            .map(r => ({
              id: r.id.slice(0, 64),
              n: ((typeof r.n === 'string' && r.n) ? r.n : 'PLAYER').slice(0, NAME_MAX),
              w: (typeof r.w === 'number' && isFinite(r.w) && r.w >= 0) ? Math.floor(r.w) : null,
              /* a relay too old to label a room sends no `g` at all, and every
                 room on one of those IS a card duel. `known` remembers which of
                 the two it was, so we only send the game back on a join when we
                 were actually told it. */
              g: cleanGame(r.g),
              known: (typeof r.g === 'string' && GAME_KEYS.indexOf(r.g) >= 0)
            }));
}

/* How many rooms of each kind are open — the relay counts them BEFORE it caps
   the list, so these stay honest even when the list is a sample. An older relay
   sends no count, and everything it has is a card duel. */
function openByGame(d, rooms){
  const out = { cards:0, chess:0, dama:0 };
  if (d && d.openBy && typeof d.openBy === 'object'){
    GAME_KEYS.forEach(k => {
      const n = d.openBy[k];
      out[k] = (typeof n === 'number' && isFinite(n) && n >= 0) ? Math.floor(n) : 0;
    });
    return out;
  }
  (rooms || []).forEach(r => { out[r.g] = (out[r.g] || 0) + 1; });
  return out;
}

function paintRooms(){
  const host = $('#mp-rooms');
  if (!host || !PR.mounted) return;

  const me = myPresenceName();
  const all = roomsFrom(PR.data);
  /* how many are REALLY open, which can be more than the relay chose to name */
  const open = !all ? 0
    : (PR.data && typeof PR.data.open === 'number' ? PR.data.open : all.length);
  const by = openByGame(PR.data, all);
  if (GAME_KEYS.indexOf(MP.filter) < 0) MP.filter = 'all';
  /* A filter with nothing behind it is worse than no filter: it says "no chess
     rooms" over a list that has three cards rooms in it, and the chip row that
     would let you undo it is not even drawn. So it lets go of itself. */
  if (MP.filter !== 'all' && !by[MP.filter]) MP.filter = 'all';
  const rooms = !all ? all
    : (MP.filter === 'all' ? all : all.filter(r => r.g === MP.filter));
  const shownOpen = MP.filter === 'all' ? open : (by[MP.filter] || 0);
  let count = '', body = '';
  presenceNote(open, by);

  if (PR.err){
    count = 'offline';
    body =
      '<div class="mp-box bad"><b>Cannot reach the KARTI server.</b> Nothing has crashed and ' +
      'nobody has vanished — the list simply could not be fetched, so it is not being shown. ' +
      'This is <b>not</b> an empty list.' +
      (PR.err === 'old'
        ? '<br><br>That relay is an older build with no room list on it.'
        : PR.err === 'busy'
        ? '<br><br>The server asked us to slow down. It will try again shortly.'
        : PR.err === 'notrelay'
        ? '<br><br>Something answered, but it was not the KARTI relay.'
        : '<br><br><b>If Tailscale is on, turn it off.</b> A public web page is not allowed ' +
          'to talk to a private network address, so the relay looks unreachable until you ' +
          'do. Otherwise: check you are online, or the server may be down.') +
      '</div>';
  } else if (!PR.tried || !rooms){
    count = '…';
    body = '<div class="mp-empty"><div class="e">' + ico('refresh') + '</div>' +
           '<b>Looking for rooms</b><p>One moment.</p></div>';
  } else if (!rooms.length){
    count = '0';
    body = '<div class="mp-empty"><div class="e">' + ico('users') + '</div>' +
           (MP.filter === 'all'
             ? '<b>No rooms open</b><p>Pick a game below and open one — it lands on ' +
               'everybody else’s screen the moment you do, and they can tap straight in.</p>'
             : '<b>No ' + esc(gameMeta(MP.filter).name.toLowerCase()) + ' rooms</b>' +
               '<p>Nobody is waiting for a game of ' +
               esc(gameMeta(MP.filter).name.toLowerCase()) + ' right now. Tap <b>All</b> ' +
               'above to see what else is on, or open one of your own below.</p>') +
           '</div>';
  } else {
    const shown = rooms.slice(0, ROOM_ROWS);
    count = String(shownOpen);
    body = '<div class="mp-rlist">' + shown.map(r => {
      const name = (r && r.n) || 'PLAYER';
      const mine = name === me;
      const gm = gameMeta(r.g);
      const wait = (r.w === null || r.w === undefined)
        ? 'waiting for a player'
        : (r.w < 8 ? 'just opened' : 'waiting ' + ago(r.w));
      return '<button class="mp-room" data-room="' + esc(r.id) + '" data-who="' + esc(name) +
        '" data-game="' + esc(r.known ? r.g : '') + '" ' +
        'aria-label="Join ' + esc(name) + ', ' + esc(gm.name) + ', ' + esc(wait) + '">' +
        '<span class="mp-rav">' + esc(name.slice(0, 2)) + '</span>' +
        '<span class="mp-rwho"><span class="mp-rname">' + esc(name) +
          (mine ? ' <span class="mp-rme">(you)</span>' : '') + '</span>' +
          '<span class="mp-rage"><span class="mp-rtag g-' + esc(r.g) + '">' +
            gameIcon(r.g) + esc(gm.short) + '</span>' + wait + '</span></span>' +
        '<span class="mp-rgo">Join</span></button>';
    }).join('') + '</div>';
    const more = shownOpen - shown.length;
    if (more > 0) body += '<p class="mp-more">and ' + more + ' more open right now</p>';
  }

  /* The chips are only worth the room they take up once there is a list worth
     sifting. One room, or one kind of room, and they stay out of the way. */
  const kinds = GAME_KEYS.filter(k => by[k] > 0).length;
  const chips = (!PR.err && rooms && open > 1 && kinds > 1)
    ? '<div class="mp-filt" id="mp-filt">' +
        '<button class="mp-chip" data-f="all" aria-pressed="' +
          (MP.filter === 'all') + '">All <span class="n">' + open + '</span></button>' +
        GAME_KEYS.filter(k => by[k] > 0).map(k =>
          '<button class="mp-chip" data-f="' + esc(k) + '" aria-pressed="' +
          (MP.filter === k) + '">' + esc(gameMeta(k).short) +
          ' <span class="n">' + by[k] + '</span></button>').join('') +
      '</div>'
    : '';

  host.innerHTML =
    '<div class="mp-rhead"><h3>' +
      (MP.filter === 'all' ? 'Rooms open now'
                           : esc(gameMeta(MP.filter).name) + ' rooms') + '</h3>' +
      '<span class="mp-rcount">' + esc(count) + '</span>' +
      '<button class="mp-ref" id="mp-refresh" aria-label="Check for rooms again">' +
        ico('refresh') + '</button></div>' +
    chips +
    '<div role="status" aria-live="polite">' + body + '</div>';

  K.$$('[data-f]', host).forEach(el => {
    el.onclick = () => { MP.filter = el.getAttribute('data-f') || 'all'; paintRooms(); };
  });

  const ref = $('#mp-refresh');
  if (ref) ref.onclick = () => {
    if (Date.now() - PR.last < PRESENCE_MIN_GAP){ K.toast('Just a moment…'); return; }
    presencePoll();
  };
  K.$$('[data-room]', host).forEach(el => {
    el.onclick = () => joinRoom(el.getAttribute('data-room'), el.getAttribute('data-who'),
                                el.getAttribute('data-game'));
  });
}

/* ═══════════════════════════════════════════════════════════════════
   INVITES ON SCREEN
   Two places, deliberately: the HOME screen, because an invitation you
   have to go hunting for is not an invitation, and the Online screen,
   because that is where you were heading anyway.
   ═══════════════════════════════════════════════════════════════════ */
function inviteCards(where){
  const list = inboxLive();
  if (!list.length) return '';
  return '<div class="mp-inbox">' + list.map(r => {
    const gm = gameMeta(r.game);
    const left = Math.max(0, Math.round((r.until - Date.now()) / 1000));
    return '<div class="mp-invite">' +
      '<span class="mp-ivi">' + gameIcon(r.game) + '</span>' +
      '<span class="mp-ivw"><b>' + esc(r.from) + '</b> wants a game of <b>' +
        esc(gm.name.toLowerCase()) + '</b>' +
        '<i>' + (left > 60 ? Math.ceil(left / 60) + ' min left' : left + 's left') + '</i></span>' +
      '<span class="mp-ivb">' +
        '<button class="mp-ivgo" data-acc="' + esc(r.id) + '" data-where="' + esc(where) +
          '">Join</button>' +
        '<button class="mp-ivno" data-dec="' + esc(r.id) + '" aria-label="No thanks">' +
          '✕</button>' +
      '</span></div>';
  }).join('') + '</div>';
}
function wireInvites(host){
  if (!host) return;
  K.$$('[data-acc]', host).forEach(el => {
    el.onclick = () => acceptInvite(el.getAttribute('data-acc'));
  });
  K.$$('[data-dec]', host).forEach(el => {
    el.onclick = () => declineInvite(el.getAttribute('data-dec'));
  });
}
/* One tap: a new socket, our session, and the id. We never learn the code. */
function acceptInvite(id){
  if (!id) return;
  window.KHOOK = null;
  MP.inviteId = id;
  if (!document.querySelector('#scr-mp.on')){ mpScreen(); K.go('mp'); }
  start('invite', null, null, false, null);
  setState('connecting', 'Taking up that invitation…');
}
/* Declining is quiet. Nothing at all is sent to whoever asked. */
function declineInvite(id){
  if (!id) return;
  sendAny({ t:'declineinvite', id });
  inboxDrop(id);
}

/* the panel on the Online screen, above the room list */
function paintInvites(){
  const host = $('#mp-inbox');
  if (!host) return;
  const body = inviteCards('mp');
  host.innerHTML = body;
  wireInvites(host);
}

/* ── asking one particular person ──────────────────────────────────
   Only offered while you are SITTING in a room you opened: an invite
   is an invite to somewhere, and the relay refuses one that is not. */
function invitePanel(){
  const host = $('#mp-askbox');
  if (!host) return;
  const players = ((PR.data && PR.data.players) || [])
    .filter(p => p && typeof p.n === 'string' && p.n !== myPresenceName() &&
                 p.n !== INBOX.name)
    .slice(0, 8);
  host.innerHTML =
    '<div class="mp-box"><b>Ask somebody by name.</b> They get it the moment they open ' +
    'KARTI — and it is still waiting for them if they are not on right now. ' +
    '<span class="mp-quiet">In-app only: it will not light up a locked phone.</span></div>' +
    (players.length
      ? '<div class="tiny" style="margin:12px 0 7px">On right now</div>' +
        '<div class="mp-who">' + players.map(p =>
          '<button class="mp-chip" data-inv="' + esc(p.n) + '">' + esc(p.n) + '</button>'
        ).join('') + '</div>'
      : '') +
    '<div class="tiny" style="margin:14px 0 7px">Or type their KARTI name</div>' +
    '<div style="display:grid;gap:8px">' +
      '<input class="field" id="mp-invname" maxlength="' + NAME_MAX + '" ' +
        'placeholder="THEIR NAME" autocomplete="off" spellcheck="false" ' +
        'aria-label="Who to invite">' +
      '<button class="btn" id="mp-invgo">' + ico('users') + ' Send the invitation</button>' +
    '</div>';
  K.$$('[data-inv]', host).forEach(el => {
    el.onclick = () => sendInvite(el.getAttribute('data-inv'));
  });
  const go = $('#mp-invgo');
  if (go) go.onclick = () => sendInvite(($('#mp-invname') || {}).value || '');
}
function sendInvite(name){
  const to = String(name || '').trim().slice(0, NAME_MAX);
  if (!to){ K.toast('Type the name they signed up with.'); return; }
  if (!canInvite()){ K.toast('Sign in to your KARTI account first.'); return; }
  send({ t:'invite', to });
  const box = $('#mp-invname');
  if (box) box.value = '';
}

/* Take the empty seat a room is advertising. No room code is ever typed, read
   out, or even shown to us: we hand back the opaque handle and the relay
   re-resolves it itself, refusing it unless that room really is open, public
   and still short of a player. Works from the home panel (rebuild the Online
   screen on the way) and from the room list itself (already there). */
function joinRoom(id, who, game){
  if (!id) return;
  const g = (typeof game === 'string' && GAME_KEYS.indexOf(game) >= 0) ? game : null;
  if (g && !gamePlayable(g)){
    K.toast('This copy of KARTI does not have ' + gameMeta(g).name + ' in it yet.');
    return;
  }
  window.KHOOK = null;
  if (!document.querySelector('#scr-mp.on')){
    mpScreen();
    K.go('mp');                                 /* re-points the poller on the way */
  }
  start('joinid', null, id, false, g);
  setState('connecting', 'Joining ' + (who || 'them') +
           (g ? ' for ' + gameMeta(g).name.toLowerCase() : '') + '…');
}
const joinWaiting = joinRoom;                   /* the name the old panel used */

/* ═══════════════════════════════════════════════════════════════════
   ARRIVING WITH THE GAME ALREADY DECIDED
   ───────────────────────────────────────────────────────────────────
   js/chess.js and js/dama.js land here from their own setup sheet's
   "somebody online". The player has just told us, twice, that they
   want chess — the room-type picker at that point is a question whose
   answer we already have, and one more screen between wanting to play
   and playing.

   So we do not ask. We take a chess room that is already waiting if
   there is one (straight onto the board), and open one if there is
   not. Either way the next thing on screen is a ROOM, never a menu.

   The picker still exists, and is still the right thing, for the one
   case it was built for: Multiplayer from the home screen, where the
   player has arrived with no game in mind.
   ═══════════════════════════════════════════════════════════════════ */
function openFor(game){
  const g = cleanGame(game);
  if (g !== 'cards' && !gamePlayable(g)){
    /* THE HONEST DEGRADE. The lobby is ready for this game; the game has not
       shipped the half that carries a move. Say which, and do not open a room
       nobody could play in. */
    const LB = gameLobby(g);
    K.go('mp');
    mpScreen();
    setState('unreachable', LB.name + ' cannot be played online from this build yet — it ' +
      'still needs ' + (LB.gaps[LB.gaps.length - 1] || 'its online half') + '. Everything ' +
      'else here works.');
    return;
  }
  MP.wantGame = gamePlayable(g) ? g : 'cards';
  MP.filter = MP.wantGame;
  rememberGame(MP.wantGame);
  window.KHOOK = null;
  const P = window.KARTI_PARTY;
  if (P && P.standDown) P.standDown();
  mpScreen();
  K.go('mp');

  /* Somebody already sat there waiting for this exact game? Take their
     seat. It is one fewer person waiting and one fewer screen. */
  const waiting = pickWaiting(MP.wantGame);
  if (waiting){
    /* the list is a second or two old, so if that seat has gone by the time
       we get there we open our own instead of dumping them back on a menu */
    MP.autoOpen = MP.wantGame;
    joinRoom(waiting.id, waiting.n, waiting.g);
    return;
  }
  start('create', null, null, false, MP.wantGame);
  setState('connecting',
           'Opening a ' + gameMeta(MP.wantGame).name.toLowerCase() + ' room…');
}

/* The room of this game that has waited longest, and is not our own. Longest
   first on purpose: whoever has been sitting there gets the game. */
function pickWaiting(game){
  const me = myPresenceName();
  const rows = roomsFrom(PR.data) || [];
  const open = rows.filter(r => r.known && r.g === game && r.n !== me);
  open.sort((a, b) => (b.w || 0) - (a.w || 0));
  return open[0] || null;
}

/* the auto-join above missed its seat: open a room of the same game instead */
function autoOpenFallback(){
  if (!MP.autoOpen) return false;
  const g = MP.autoOpen;
  MP.autoOpen = null;
  MP.token = null; MP.code = null; MP.joinId = null; MP.joined = false;
  start('create', null, null, false, g);
  setState('connecting', 'They were taken — opening a ' +
           gameMeta(g).name.toLowerCase() + ' room of your own…');
  return true;
}

/* ── mount / unmount ──────────────────────────────────────────────
   Two screens want this data now, so the mount carries which one: Online gets a
   livelier cadence than Home, because a room list that is 12 s stale feels dead.
   It is still ONE timer and one socket, and PRESENCE_MIN_GAP is still the floor
   underneath both. */
function presenceMount(which){
  const fast = which === 'mp';
  if (PR.mounted){
    if (PR.fast !== fast){ PR.fast = fast; presenceTick(); }
    presencePaint();
    return;
  }
  PR.mounted = true;
  PR.fast = fast;
  /* deliberately NOT clearing PR.data: coming straight back should show the list
     we already had, then refresh it, rather than blink to "checking". */
  presencePaint();
  presenceBeaconOpen();
  WHO.asked = 0;                 /* a fresh screen may ask straight away */
  /* Give the beacon a moment to register our name before the first poll; if it
     never connects this fires anyway, so a dead relay still reports itself. */
  clearTimeout(PR.timer);
  PR.timer = setTimeout(presenceTick, 900);
}
function presenceUnmount(){
  stopWaitClock();
  if (!PR.mounted) return;
  PR.mounted = false;
  PR.fast = false;
  clearTimeout(PR.timer); PR.timer = null;
  clearTimeout(PR.hideTimer); PR.hideTimer = null;
  presenceBeaconClose();
  presencePaint();                              /* empties the panel */
}
/* game.js calls this from go(). Home wants the who's-online panel; Online wants
   the room list. Nothing else on the phone polls at all. */
function onScreen(name){
  if (name === 'home' || name === 'mp') presenceMount(name);
  else presenceUnmount();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden){
    /* Backgrounded. Polling stops DEAD — a menu left open in a background tab
       must not sit there fetching forever. The beacon socket is kept for a
       short grace period so that flicking to another app for a moment does not
       make you blink out of everybody else's list; past that it is handed back,
       because an idle socket still costs the Pi a thread. */
    clearTimeout(PR.timer); PR.timer = null;
    clearTimeout(PR.hideTimer);
    PR.hideTimer = setTimeout(presenceBeaconClose, PRESENCE_HIDE_GRACE);
    stopWaitClock();
  } else if (PR.mounted){
    clearTimeout(PR.hideTimer); PR.hideTimer = null;
    presenceBeaconOpen();
    presenceTick();
    if (MP.joined && !MP.peerHere && MP.openedAt && $('#mp-age')) startWaitClock();
  }
});
/* a phone that goes to sleep gets frozen, not hidden — let go of the socket */
window.addEventListener('pagehide', presenceBeaconClose);

/* ───────────────────────── entry ───────────────────────── */
/* The home screen offers one MULTIPLAYER button; the choice of how lives here. */
/* Pass-and-play was removed at the owner's request — online multiplayer covers
   it. Multiplayer therefore goes straight to the room list instead of asking
   which kind first. chooser() is kept as a thin alias so anything still
   calling it (including an older cached build) lands somewhere sensible
   rather than throwing. The PNP code below is now unreachable from the UI. */
function chooser(){ window.KHOOK = null; mpScreen(); K.go('mp'); }
function wire(){
  /* whatever you opened last time is already picked. The LIST always starts on
     "all" though — a filter you did not ask for, hiding rooms that are really
     there, is exactly the thing this screen exists to abolish. */
  MP.wantGame = storedGame();
  MP.filter = 'all';
  const p = $('#btn-pnp'), o = $('#btn-online'), m = $('#btn-mp');
  if (p) p.onclick = () => { window.KHOOK = null; mpScreen(); K.go('mp'); };
  if (o) o.onclick = () => { window.KHOOK = null; mpScreen(); K.go('mp'); };
  if (m) m.onclick = chooser;
  /* game.js runs boot() — and therefore go('home') — before this file has even
     been fetched, so the first mount has to happen here. */
  if (document.querySelector('#scr-home.on')) presenceMount('home');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();

window.KARTI_MP = {
  PNP, MP, pnpScreen, pnpStart, pnpHandover, pnpResume, pnpResult, pnpEnd, seatAt,
  mpScreen, mpLeave, checksum, applyRemote, beginOnline, onPeer, onServer, chooser,
  deckOptions, findDeck, mulberry32, illegalRemote, endMatch, dropOut,
  start, relay, defaultURL, cleanCode, setState,
  /* the three-games era */
  GAMES, GAME_KEYS, gameMeta, cleanGame, gamePlayable, openFor, pickWaiting,
  beginBoard, boardRemote, hostStartBoard, myColour, backToRooms, openByGame,
  /* who's-online panel + the room list (one poller, two paints) */
  PR, onScreen, presenceMount, presenceUnmount, presencePoll, presencePaint,
  paintHomePanel, paintRooms, roomsFrom, ago,
  presenceURL, presenceBeaconOpen, presenceBeaconClose, myPresenceName,
  joinRoom, joinWaiting, lobby,
  /* invitations */
  INBOX, inboxAdd, inboxDrop, inboxLive, sessionToken, canInvite,
  sendInvite, acceptInvite, declineInvite, paintInvites, invitePanel, inviteCards,
  /* ── the shared lobby: one screen, every party game feeds it ── */
  gameLobby, lobbyReport, tableLobby, rosterSeats, tableCanStart, onRoster, onBegan,
  tableRemote, tableStop, SEATS_FALLBACK,
  /* ── who is around ── */
  WHO, whoAsk, onWho, paintSocial, paintOnlineSocial, knockAdd, knockAnswer,
  recentStrip, knockCards,
  RELAY_URL, RELAY_HEALTH, RELAY_PRESENCE, CODE_LEN, CODE_ALPHABET,
  ROOM_ROWS, PRESENCE_LOBBY, PRESENCE_MIN_GAP,
  /* older name kept so nothing that reached for it breaks */
  mpConnect: (action, code) => start(action, code)
};

})();
