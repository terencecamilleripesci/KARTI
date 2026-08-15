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
    blurb:'Ninety numbers. Everybody at once.' }
];
const GAME_KEYS = GAMES.map(g => g.k);
const gameMeta  = k => GAMES.find(g => g.k === k) || GAMES[0];
const cleanGame = k => (typeof k === 'string' && GAME_KEYS.indexOf(k) >= 0) ? k : 'cards';
/* is this game actually installed on this phone? */
function gamePlayable(k){
  if (k === 'cards') return true;
  const P = window.KARTI_PARTY;
  return !!(P && P.online && P.online[k]);
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
  autoOpen:null
};

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
    '#scr-mp .mp-g b{font:900 11px/1.15 Orbitron,"Arial Black",system-ui,sans-serif;' +
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
      'border-radius:999px;font:700 10.5px/1 Orbitron,"Arial Black",system-ui,sans-serif;' +
      'letter-spacing:.08em;text-transform:uppercase;color:#A093C4;cursor:pointer;' +
      'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12)}' +
    '#scr-mp .mp-chip[aria-pressed="true"]{color:#241800;background:#FFC542;' +
      'border-color:#FFC542}' +
    '#scr-mp .mp-chip .n{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.85}' +

    /* ── what kind of room this row is ── */
    '#scr-mp .mp-rtag{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;' +
      'margin-right:6px;border-radius:999px;font:900 9px/1.35 Orbitron,"Arial Black",' +
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
    '.mp-ivw b{font-family:Orbitron,"Arial Black",system-ui,sans-serif;font-size:12px;' +
      'letter-spacing:.04em}' +
    '.mp-ivw i{display:block;font-style:normal;margin-top:2px;font-size:10px;' +
      'letter-spacing:.09em;text-transform:uppercase;font-weight:700;color:#8FE7B6}' +
    '.mp-ivb{flex:0 0 auto;display:flex;align-items:center;gap:6px}' +
    '.mp-ivgo{padding:9px 13px;border-radius:11px;background:#3DDC84;color:#062C17;' +
      'font:900 12px/1 Orbitron,"Arial Black",system-ui,sans-serif;letter-spacing:.09em;' +
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
      'place-items:center;font:900 14px/1 Orbitron,"Arial Black",system-ui,sans-serif;' +
      'letter-spacing:.02em;color:#FFDE93;background:rgba(255,197,66,.20);' +
      'border:1px solid rgba(255,197,66,.36)}' +
    '#scr-mp .mp-rwho{flex:1;min-width:0}' +
    '#scr-mp .mp-rname{display:block;font:900 14px/1.25 Orbitron,"Arial Black",system-ui,' +
      'sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#scr-mp .mp-rage{display:block;margin-top:3px;font-size:10px;letter-spacing:.09em;' +
      'text-transform:uppercase;font-weight:700;color:#A093C4}' +
    '#scr-mp .mp-rme{color:#7F73A0}' +
    '#scr-mp .mp-rgo{flex:0 0 auto;padding:9px 12px;border-radius:11px;background:#FFC542;' +
      'color:#241800;font:900 12px/1 Orbitron,"Arial Black",system-ui,sans-serif;' +
      'letter-spacing:.10em}' +
    '#scr-mp .mp-more{text-align:center;font-size:11px;color:#7F73A0;margin:9px 0 0}' +
    '#scr-mp .mp-empty{padding:20px 16px;border-radius:15px;text-align:center;' +
      'border:1px dashed rgba(255,255,255,.20);background:rgba(255,255,255,.03)}' +
    '#scr-mp .mp-empty .e{font-size:26px;opacity:.55;line-height:1;margin-bottom:8px}' +
    '#scr-mp .mp-empty b{display:block;font-family:Orbitron,"Arial Black",system-ui,sans-serif;' +
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
      'text-transform:uppercase;color:#7F73A0}';
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
    if (intent === 'create')
      send({ t:'create', private: !!MP.wantPrivate, game: MP.wantGame || 'cards' });
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
      MP.autoOpen = null;
      lobby();
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
      if (MP.inviteId){ inboxDrop(MP.inviteId); MP.inviteId = null; }
      MP.autoOpen = null;                  /* we got the seat; no fallback needed */
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

    case 'relay':
      if (typeof m.n === 'number' && m.n > MP.lastSeq) MP.lastSeq = m.n;
      onPeer(m.d);
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

function onPeer(d){
  if (!d || typeof d !== 'object' || !d.k) return;

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
      return;
    }
    if (m.t === 'invite'){
      inboxAdd(m);
      K.toast((m.from || 'Somebody') + ' wants a game of ' +
              gameMeta(cleanGame(m.game)).name.toLowerCase() + '.');
      return;
    }
    if (m.t === 'invitegone'){ inboxDrop(m.id); return; }
    if (m.t === 'error' && MP.authProbe){ MP.authProbe = false; INBOX.authed = false; }
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

  host.className = 'onlinebox' + (invites ? ' on-invited' : '') + tone;
  host.innerHTML =
    '<div class="on-head"><span class="on-dot"></span><h2>Who&rsquo;s online</h2>' +
      '<span class="on-count">' + esc(count) + '</span>' +
      '<button class="on-ref" id="on-refresh" aria-label="Check again">' + ico('refresh') +
      '</button></div>' +
    invites +
    '<div class="on-body" role="status" aria-live="polite">' + body + '</div>';
  wireInvites(host);

  const ref = $('#on-refresh');
  if (ref) ref.onclick = () => {
    if (Date.now() - PR.last < PRESENCE_MIN_GAP){ K.toast('Just a moment\u2026'); return; }
    presencePoll();
  };
  K.$$('[data-join]', host).forEach(el => {
    el.onclick = () => joinRoom(el.getAttribute('data-join'), el.getAttribute('data-who'));
  });
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
  RELAY_URL, RELAY_HEALTH, RELAY_PRESENCE, CODE_LEN, CODE_ALPHABET,
  ROOM_ROWS, PRESENCE_LOBBY, PRESENCE_MIN_GAP,
  /* older name kept so nothing that reached for it breaks */
  mpConnect: (action, code) => start(action, code)
};

})();
