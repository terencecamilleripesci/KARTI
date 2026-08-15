/* ═══════════════════════════════════════════════════════════════════
   KARTI — mp.js   ·   two humans, one game

   1) PASS AND PLAY (offline, always works)
      Two players share one phone. Between turns a curtain drops so the
      next player never sees the previous player's hand. Both seats pick
      a deck. The engine is untouched: at the hand-over we simply swap
      the two seats round so the person holding the phone is always
      player 0 — the duel UI then works exactly as it always has.

   2) ONLINE — real internet play, different houses
      The page is served from GitHub Pages over https. It opens a wss://
      socket to a small relay (server/karti_server.py) that runs on the
      Pi and is published to the internet by Tailscale Funnel. The relay
      pairs two players by a 5-character room code and passes moves
      between them. It is a relay, NOT a referee.

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

/* who's-online panel on the home screen */
const PRESENCE_EVERY   = 12000;  /* ms between polls while Home is up and visible */
const PRESENCE_MIN_GAP = 4000;   /* never poll faster than this, whatever asks */
const PRESENCE_PING    = 45000;  /* keep the beacon socket alive (server cuts at 120s) */
const PRESENCE_HIDE_GRACE = 60000; /* hidden this long -> hand the socket back */
const PRESENCE_HTTP_TO = 8000;   /* give up on one poll after this */
const PRESENCE_ROWS    = 24;     /* names we will render, whatever the relay sends */
const NAME_MAX         = 16;     /* must match L.NAME_LEN on the relay */

const K = window.KARTI;
if (!K) return;
const $ = K.$, $$ = K.$$, esc = K.esc;
const ico = n => (window.ICO ? window.ICO(n) : '');

/* ───────────────────────── deck choices ─────────────────────────
   Pass-and-play is a party mode: both seats may use any starter deck
   whether or not this profile owns the cards. Your own saved decks show
   up too, as long as they are legal. */
function deckOptions(){
  const out = [];
  Object.keys(K.STARTER_DECKS).forEach(k => {
    const sd = K.STARTER_DECKS[k];
    out.push({ key:k, id:'starter:' + k, name:sd.name, e:sd.e, c:sd.c,
               kind:'starter', list:sd.list, attr: sd.f || k });
  });
  (K.S.decks || []).forEach(d => {
    if (!K.deckIsLegal(d.list)) return;
    const sd = d.starter && K.STARTER_DECKS[d.starter];
    out.push({ key:d.starter || null, id:'mine:' + d.id, name:d.name, e:'🗂️',
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
        '<button class="btn hot" id="pp-go">⚔️ Start the duel</button>' +
        '<button class="btn ghost" id="pp-swap">🔁 Swap who goes first</button>' +
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
    '<div class="eyes">🙈</div>' +
    '<h2>PASS THE PHONE</h2>' +
    '<div class="to">' + esc(next.name) + '</div>' +
    '<p>' + esc(me.name) + ' is done. Do not look at the screen until it is your turn — ' +
    'and no peeking at the log either, ħi.</p>' +
    '<div class="lpline">' +
      '<span class="pill">' + esc(next.name) + ' <span class="mono">' + K.D.p[1].lp + '</span></span>' +
      '<span class="pill">' + esc(me.name) + ' <span class="mono">' + K.D.p[0].lp + '</span></span>' +
      '<span class="pill">Turn <span class="mono">' + K.D.turnCount + '</span></span>' +
    '</div>' +
    '<button class="btn primary" id="ho-go">👀 I am ' + esc(next.name) + ' — my turn</button>' +
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
        '<button class="btn ghost" id="pr-set">🤝 Change seats or decks</button>' +
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
  transport:null, seed:0
};

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
  idle:        { dot:'off',  text:'Not connected' },
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
  paintState();
}
function paintState(){
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
    '#scr-mp .mp-url{font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}';
  document.head.appendChild(st);
}

/* ── the lobby screen ──────────────────────────────────────────────── */
function mpScreen(){
  injectCSS();
  MP.url = MP.url || defaultURL();
  const insecure = isSecurePage() && MP.url.slice(0, 6).toLowerCase() !== 'wss://';

  $('#scr-mp').innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="mp-back" aria-label="Back to home">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Online</h2>' +
    '</div>' +
    '<div class="scroll" id="mp-body">' +
      '<p class="blurb">Play someone in another house. One of you makes a room and reads ' +
      'out the code; the other types it in. Both phones need the internet — nothing else.</p>' +
      '<p class="mp-state" id="mp-stat"><span class="mp-dot"></span><span class="mp-txt"></span></p>' +
      (insecure
        ? '<div class="mp-box bad"><b>That server address will not work from this page.</b><br>' +
          'KARTI is loaded over https, so it can only open a <code>wss://</code> connection. ' +
          'Fix the address below or leave it on the default.</div>'
        : '') +
      '<div class="tiny">Your deck</div>' +
      '<div class="deckpick" id="mp-deck"></div>' +
      '<div style="display:grid;gap:9px;margin-top:14px">' +
        '<button class="btn primary" id="mp-create">➕ Create a room</button>' +
        '<div class="tiny" style="text-align:center;margin-top:2px">or join one</div>' +
        '<input class="field mp-codein" id="mp-code" maxlength="' + CODE_LEN + '" ' +
          'placeholder="CODE" autocomplete="off" autocapitalize="characters" ' +
          'spellcheck="false" aria-label="Room code">' +
        '<button class="btn" id="mp-join">↪ Join room</button>' +
        '<button class="btn ghost" id="mp-pnp">🤝 Use Pass &amp; Play instead</button>' +
      '</div>' +
      '<details style="margin:16px 0 26px"><summary class="tiny">Server settings</summary>' +
        '<div class="tiny" style="margin-top:8px">Relay address</div>' +
        '<input class="field mp-url" id="mp-url" value="' + esc(MP.url) + '" ' +
          'aria-label="Relay server address" spellcheck="false">' +
        '<div style="display:grid;gap:8px;margin-top:8px">' +
          '<button class="btn ghost" id="mp-test">🔌 Test the connection</button>' +
          '<button class="btn ghost" id="mp-reset">↺ Back to the default address</button>' +
        '</div>' +
        '<p class="tiny" style="line-height:1.6;margin-top:8px">Default is the Pi relay. ' +
        'You only need to touch this if the server has moved.</p>' +
      '</details>' +
    '</div>';

  $('#mp-back').onclick = () => { mpLeave(); K.go('home'); };
  $('#mp-pnp').onclick = () => { mpLeave(); pnpScreen(); K.go('pnp'); };

  const opts = deckPicker($('#mp-deck'), MP.myDeckId || deckOptions()[0].id, o => {
    MP.myDeckId = o.id; mpScreen();
  });
  if (!MP.myDeckId) MP.myDeckId = opts[0].id;

  const urlIn = $('#mp-url');
  urlIn.onchange = () => {
    const v = (urlIn.value || '').trim();
    MP.url = v || defaultURL();
    rememberRelay(v && v !== RELAY_URL ? v : '');
    mpScreen();
  };
  $('#mp-reset').onclick = () => { rememberRelay(''); MP.url = RELAY_URL; mpScreen(); };
  $('#mp-test').onclick = testServer;

  $('#mp-create').onclick = () => start('create');
  $('#mp-join').onclick = () => {
    const c = cleanCode($('#mp-code').value);
    if (c.length !== CODE_LEN){ K.toast('A room code is ' + CODE_LEN + ' characters.'); return; }
    start('join', c);
  };
  const codeIn = $('#mp-code');
  codeIn.oninput = () => { codeIn.value = cleanCode(codeIn.value); };

  setState(MP.state === 'idle' ? 'idle' : MP.state, MP.note);
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
/* intent: 'create' | 'join' (needs a room code) | 'joinid' (needs the public
   handle of a waiting player, straight off the who's-online panel — you never
   see, type or learn their room code) | 'rejoin' */
function start(intent, code, id){
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
  MP.token = null; MP.lastSeq = 0; MP.tries = 0;
  MP.joined = false; MP.peerHere = false; MP.peerList = null;
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
    if (intent === 'create') send({ t:'create' });
    else if (intent === 'join') send({ t:'join', code: MP.code });
    else if (intent === 'joinid') send({ t:'joinid', id: MP.joinId });
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
  MP.code = null; MP.token = null; MP.live = false; MP.joined = false;
  MP.joinId = null; MP.nameProbe = false;
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

    case 'created':
      MP.host = true; MP.code = m.code; MP.token = m.token || null;
      MP.joined = true; MP.lastSeq = m.seq || 0; MP.tries = 0;
      lobby();
      setState('waiting');
      return;

    case 'joined':
      MP.host = false; MP.code = m.code; MP.token = m.token || null;
      MP.joined = true; MP.lastSeq = m.seq || 0; MP.tries = 0;
      MP.peerHere = true;
      lobby();
      setState('ready', 'Connected. Swapping decks…');
      sendHello();
      return;

    case 'rejoined':
      MP.host = !!m.host; MP.tries = 0; MP.joined = true;
      MP.peerHere = !!m.peer;
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
        if (MP.live) endMatch('Your opponent left the duel.');
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
  if (/not waiting/i.test(why)){
    MP.token = null; MP.code = null; MP.joinId = null; MP.joined = false;
    setState('unreachable', 'That player is not waiting any more — someone else got there ' +
             'first, or they closed the game. Make a room of your own instead.');
    K.toast('They are not waiting any more.');
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

function lobby(){
  const body = $('#mp-body');
  if (!body || !MP.code) return;
  body.innerHTML =
    '<p class="mp-state" id="mp-stat"><span class="mp-dot"></span><span class="mp-txt"></span></p>' +
    '<div class="mp-box">Read this code out to the other player. They tap <b>Join room</b> ' +
    'and type it in.</div>' +
    '<div class="mp-code" id="mp-showcode">' + esc(MP.code) + '</div>' +
    '<p class="tiny" style="text-align:center">Room ' + esc(MP.code) + ' · you are the ' +
      (MP.host ? 'host, so you go first' : 'guest, so they go first') + '</p>' +
    '<div style="display:grid;gap:9px;margin-top:16px">' +
      '<button class="btn ghost" id="mp-copy">📋 Copy the code</button>' +
      '<button class="btn ghost" id="mp-cancel">Leave the room</button></div>';
  const cp = $('#mp-copy');
  if (cp) cp.onclick = () => {
    try { navigator.clipboard.writeText(MP.code); K.toast('Code copied.'); }
    catch (e){ K.toast('Code: ' + MP.code); }
  };
  const cx = $('#mp-cancel');
  if (cx) cx.onclick = () => { mpLeave(); mpScreen(); };
  paintState();
}

function sendHello(){
  const d = findDeck(MP.myDeckId);
  MP.myName = K.displayName().toUpperCase();
  relay({ k:'hello', name:MP.myName, list:d.list, deckKey:d.attr, deckName:d.name });
}

function onPeer(d){
  if (!d || typeof d !== 'object' || !d.k) return;
  if (d.k === 'hello'){
    MP.peerName = d.name || 'THEM';
    MP.peerList = d.list; MP.peerKey = d.deckKey || null;
    if (MP.host) hostStart();
    else setState('ready', 'Ready. Waiting for the host to deal…');
    return;
  }
  if (d.k === 'start'){ if (!MP.live) beginOnline(d); return; }
  if (d.k === 'act'){ applyRemote(d); return; }
  if (d.k === 'bail'){ endMatch(d.why || 'They stopped the duel.'); return; }
}

/* the host deals: one seed, both decks pre-shuffled, sent to the guest so
   the two engines start from a byte-identical position */
function hostStart(){
  const mineD = findDeck(MP.myDeckId);
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
  const rng = mulberry32(seed);
  const sh = arr => { for (let i = arr.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
  const payload = {
    k:'start', seed,
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
  /* the host has the first turn: on the guest's device that is player 1 */
  if (!iAmHost) K.D.turn = 1;
  K.renderDuel();
  setState('live');
  K.toast(iAmHost ? 'Room ' + MP.code + ' — you go first.' : 'Room ' + MP.code + ' — they go first.');
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
  if (!wasLive) return;
  const title = flavour === 'cheat' ? 'NO DEAL' : 'CUT OFF';
  K.openModal(
    '<div class="result"><div class="big lose">' + title + '</div>' +
    '<p class="muted">' + esc(why) + '</p>' +
    '<p class="tiny" style="line-height:1.6">Nothing was awarded. Pass &amp; Play never does this ' +
    'to you — it needs no network at all.</p>' +
    '<div style="display:grid;gap:9px;width:100%;margin-top:6px">' +
      '<button class="btn hot" id="do-pnp">🤝 Pass &amp; Play instead</button>' +
      '<button class="btn ghost" id="do-home">Back to menu</button></div></div>');
  const p = $('#do-pnp'), h = $('#do-home');
  if (p) p.onclick = () => { K.closeModal(); K.D = null; mpLeave(); pnpScreen(); K.go('pnp'); };
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
        '<span class="pill">🪙 +' + coins + '</span>' +
        '<span class="pill">🏆 ' + S.rec.w + '–' + S.rec.l + '</span></div>' +
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
  mounted:false, ws:null, pingTimer:null, timer:null, hideTimer:null,
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
  };
  /* The beacon listens for exactly one thing: the relay confirming our display
     name. Until that lands, /presence would list us as an anonymous PLAYER —
     so we hold the first poll back until we know we are on the list properly. */
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (err){ return; }
    if (m && m.t === 'named') presenceTick();
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
  let wait = PRESENCE_EVERY;
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

function presencePaint(){
  const host = $('#home-online');
  if (!host) return;
  if (!PR.mounted){ host.className = 'onlinebox'; host.innerHTML = ''; return; }

  const me = myPresenceName();
  const d = PR.data;
  let tone = '', count = '', body = '';

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

  host.className = 'onlinebox' + tone;
  host.innerHTML =
    '<div class="on-head"><span class="on-dot"></span><h2>Who&rsquo;s online</h2>' +
      '<span class="on-count">' + esc(count) + '</span>' +
      '<button class="on-ref" id="on-refresh" aria-label="Check again">' + ico('refresh') +
      '</button></div>' +
    '<div class="on-body" role="status" aria-live="polite">' + body + '</div>';

  const ref = $('#on-refresh');
  if (ref) ref.onclick = () => {
    if (Date.now() - PR.last < PRESENCE_MIN_GAP){ K.toast('Just a moment\u2026'); return; }
    presencePoll();
  };
  K.$$('[data-join]', host).forEach(el => {
    el.onclick = () => joinWaiting(el.getAttribute('data-join'), el.getAttribute('data-who'));
  });
}

/* Take the empty seat somebody is advertising. No room code is ever typed,
   read out, or even shown to us — the relay resolves the handle itself. */
function joinWaiting(id, who){
  if (!id) return;
  window.KHOOK = null;
  mpScreen();
  K.go('mp');                                   /* unmounts the panel on the way */
  start('joinid', null, id);
  setState('connecting', 'Joining ' + (who || 'them') + '…');
}

/* ── mount / unmount ────────────────────────────────────────────── */
function presenceMount(){
  if (PR.mounted) return;
  PR.mounted = true;
  /* deliberately NOT clearing PR.data: coming straight back to Home should show
     the list we already had, then refresh it, rather than blink to "checking". */
  presencePaint();
  presenceBeaconOpen();
  /* Give the beacon a moment to register our name before the first poll; if it
     never connects this fires anyway, so a dead relay still reports itself. */
  clearTimeout(PR.timer);
  PR.timer = setTimeout(presenceTick, 900);
}
function presenceUnmount(){
  if (!PR.mounted) return;
  PR.mounted = false;
  clearTimeout(PR.timer); PR.timer = null;
  clearTimeout(PR.hideTimer); PR.hideTimer = null;
  presenceBeaconClose();
  presencePaint();                              /* empties the panel */
}
/* game.js calls this from go(). Home is the only screen that wants presence. */
function onScreen(name){
  if (name === 'home') presenceMount(); else presenceUnmount();
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
  } else if (PR.mounted){
    clearTimeout(PR.hideTimer); PR.hideTimer = null;
    presenceBeaconOpen();
    presenceTick();
  }
});
/* a phone that goes to sleep gets frozen, not hidden — let go of the socket */
window.addEventListener('pagehide', presenceBeaconClose);

/* ───────────────────────── entry ───────────────────────── */
/* The home screen offers one MULTIPLAYER button; the choice of how lives here. */
function chooser(){
  K.openSheet(
    '<h3>Multiplayer</h3>' +
    '<p class="muted">Two humans. One of these works with no network at all.</p>' +
    '<div class="opts">' +
      '<button class="btn primary" id="mc-pnp">🤝 Pass &amp; Play' +
        '<span class="sub">two players, one phone · always works</span></button>' +
      '<button class="btn" id="mc-net">📡 Online' +
        '<span class="sub">different houses · needs the internet</span></button>' +
      '<button class="btn ghost" id="mc-x">Close</button></div>');
  $('#mc-x').onclick = K.closeSheet;
  $('#mc-pnp').onclick = () => { K.closeSheet(); window.KHOOK = null; pnpScreen(); K.go('pnp'); };
  $('#mc-net').onclick = () => { K.closeSheet(); window.KHOOK = null; mpScreen(); K.go('mp'); };
}
function wire(){
  const p = $('#btn-pnp'), o = $('#btn-online'), m = $('#btn-mp');
  if (p) p.onclick = () => { window.KHOOK = null; pnpScreen(); K.go('pnp'); };
  if (o) o.onclick = () => { window.KHOOK = null; mpScreen(); K.go('mp'); };
  if (m) m.onclick = chooser;
  /* game.js runs boot() — and therefore go('home') — before this file has even
     been fetched, so the first mount has to happen here. */
  if (document.querySelector('#scr-home.on')) presenceMount();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();

window.KARTI_MP = {
  PNP, MP, pnpScreen, pnpStart, pnpHandover, pnpResume, pnpResult, pnpEnd, seatAt,
  mpScreen, mpLeave, checksum, applyRemote, beginOnline, onPeer, onServer, chooser,
  deckOptions, findDeck, mulberry32, illegalRemote, endMatch, dropOut,
  start, relay, defaultURL, cleanCode, setState,
  /* who's-online panel */
  PR, onScreen, presenceMount, presenceUnmount, presencePoll, presencePaint,
  presenceURL, presenceBeaconOpen, presenceBeaconClose, myPresenceName, joinWaiting,
  RELAY_URL, RELAY_HEALTH, RELAY_PRESENCE, CODE_LEN, CODE_ALPHABET,
  /* older name kept so nothing that reached for it breaks */
  mpConnect: (action, code) => start(action, code)
};

})();
