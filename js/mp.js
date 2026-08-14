/* ═══════════════════════════════════════════════════════════════════
   KARTI — mp.js   ·   two humans, one game

   1) PASS AND PLAY (offline, always works)
      Two players share one phone. Between turns a curtain drops so the
      next player never sees the previous player's hand. Both seats pick
      a deck. The engine is untouched: at the hand-over we simply swap
      the two seats round so the person holding the phone is always
      player 0 — the duel UI then works exactly as it always has.

   2) ONLINE (same wi-fi, honest about it)
      Lockstep relay through server/karti_server.py. Both devices run the
      same engine with the same seeded RNG and the same pre-dealt decks,
      and every move is mirrored. A checksum rides along with each move;
      if the two boards ever disagree we stop rather than lie.

      READ THIS BEFORE FILING A BUG: a page served over https:// (i.e.
      GitHub Pages) CANNOT open a ws:// socket to a Pi on your LAN. The
      browser blocks it — mixed content, and Private Network Access on
      top of that. Online play therefore only works when BOTH players
      load the game over http:// from the machine running the server.
      Pass-and-play is the fallback that always works.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
if (!K) return;
const $ = K.$, esc = K.esc;

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
   2 · ONLINE  (lockstep over the room server)
   ═══════════════════════════════════════════════════════════════════ */
const MP = {
  ws:null, code:null, host:false, live:false, ready:false,
  myDeckId:null, myName:'', peerName:'', peerList:null, status:'', url:''
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
const httpsPage = () => location.protocol === 'https:';
function defaultURL(){
  if (location.protocol === 'http:' && location.host) return 'ws://' + location.host + '/ws';
  return '';
}

function mpScreen(){
  const blocked = httpsPage();
  const url = MP.url || defaultURL();
  $('#scr-mp').innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="mp-back" aria-label="Back to home">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Online</h2>' +
    '</div>' +
    '<div class="scroll" id="mp-body">' +
      (blocked
        ? '<div class="badbox"><b>Online will not work on this page.</b><br>' +
          'You opened KARTI over <b>https://</b> (GitHub Pages). A secure page is not allowed to ' +
          'open a plain connection to a machine on your home network — the browser blocks it, ' +
          'and there is no way around it from here.<br><br>' +
          '<b>What does work:</b> run <code>server/karti_server.py</code> on the Pi, then both ' +
          'players open the game from <b>http://&lt;pi-address&gt;:8788/</b> on the same wi-fi.<br><br>' +
          'Or just use <b>Pass &amp; Play</b> — one phone, two people, no server at all.</div>'
        : '<div class="warnbox"><b>Same wi-fi only.</b> Both phones must be on the same network as ' +
          'the machine running <code>server/karti_server.py</code>, and both must have opened the ' +
          'game from that machine over http://. This is not internet play.</div>') +
      '<p class="netstat" id="mp-stat"><span class="netdot" id="mp-dot"></span>' +
        esc(MP.status || 'Not connected') + '</p>' +
      '<div class="tiny">Server address</div>' +
      '<input class="field" id="mp-url" value="' + esc(url) + '" ' +
        'placeholder="ws://192.168.1.50:8788/ws" aria-label="Server address" style="margin-bottom:10px">' +
      '<div class="tiny">Your deck</div>' +
      '<div class="deckpick" id="mp-deck"></div>' +
      '<div style="display:grid;gap:9px;margin-top:12px;padding-bottom:24px">' +
        '<button class="btn primary" id="mp-create">➕ Create a room</button>' +
        '<div class="tiny" style="text-align:center;margin-top:4px">or join one</div>' +
        '<input class="field codein" id="mp-code" maxlength="4" placeholder="CODE" aria-label="Room code">' +
        '<button class="btn" id="mp-join">↪ Join room</button>' +
        '<button class="btn ghost" id="mp-pnp">🤝 Use Pass &amp; Play instead</button>' +
      '</div>' +
    '</div>';

  $('#mp-back').onclick = () => { mpLeave(); K.go('home'); };
  $('#mp-pnp').onclick = () => { mpLeave(); pnpScreen(); K.go('pnp'); };
  const opts = deckPicker($('#mp-deck'), MP.myDeckId || deckOptions()[0].id, o => {
    MP.myDeckId = o.id; mpScreen();
  });
  if (!MP.myDeckId) MP.myDeckId = opts[0].id;
  $('#mp-create').onclick = () => mpConnect('create');
  $('#mp-join').onclick = () => {
    const c = ($('#mp-code').value || '').trim().toUpperCase();
    if (c.length !== 4){ K.toast('A room code is four letters.'); return; }
    mpConnect('join', c);
  };
  const codeIn = $('#mp-code');
  if (codeIn) codeIn.oninput = () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z]/g, ''); };
  paintDot();
}
function setStatus(txt, cls){
  MP.status = txt;
  const s = $('#mp-stat');
  if (s) s.innerHTML = '<span class="netdot ' + (cls || '') + '" id="mp-dot"></span>' + esc(txt);
}
function paintDot(){
  const d = $('#mp-dot');
  if (d) d.className = 'netdot' + (MP.ws && MP.ws.readyState === 1 ? ' on' : '');
}

function mpConnect(action, code){
  const url = ($('#mp-url').value || '').trim();
  if (!url){ K.toast('Enter the server address first.'); return; }
  if (httpsPage() && url.indexOf('wss://') !== 0){
    K.toast('This https page cannot open a ws:// connection. Read the red box.');
    return;
  }
  MP.url = url;
  mpLeave();
  setStatus('Connecting…');
  let ws;
  try { ws = new WebSocket(url); }
  catch (e){ setStatus('That address is not a valid WebSocket URL.', 'bad'); return; }
  MP.ws = ws;

  const failTimer = setTimeout(() => {
    if (ws.readyState !== 1){ try { ws.close(); } catch (e){} }
  }, 8000);

  ws.onopen = () => {
    clearTimeout(failTimer);
    paintDot();
    setStatus('Connected. ' + (action === 'create' ? 'Making a room…' : 'Joining ' + code + '…'));
    send(action === 'create' ? { t:'create' } : { t:'join', code });
  };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (err){ return; }
    onServer(m);
  };
  ws.onerror = () => {
    setStatus('Could not reach that server. Same wi-fi? Right address? Is it running?', 'bad');
    paintDot();
  };
  ws.onclose = () => {
    clearTimeout(failTimer);
    paintDot();
    if (MP.live){ dropOut('The connection dropped.'); }
    else if (MP.status.indexOf('Could not reach') < 0) setStatus('Disconnected.', 'bad');
  };
}
function send(o){ if (MP.ws && MP.ws.readyState === 1) MP.ws.send(JSON.stringify(o)); }
/* Pluggable transport. Normally the room server socket; the harness swaps in a
   direct loopback so the lockstep mirroring can be tested without a server. */
function relay(d){ if (MP.transport) MP.transport(d); else send({ t:'relay', d }); }
function mpLeave(){
  if (MP.ws){
    try { send({ t:'leave' }); MP.ws.onclose = null; MP.ws.close(); } catch (e){}
  }
  MP.ws = null; MP.code = null; MP.live = false; MP.ready = false; MP.peerList = null;
}

/* ── lobby ── */
function onServer(m){
  if (m.t === 'error'){ setStatus(m.why || 'Server said no.', 'bad'); K.toast(m.why || 'Error'); return; }
  if (m.t === 'created'){ MP.host = true; MP.code = m.code; lobby('Waiting for someone to join…'); return; }
  if (m.t === 'joined'){ MP.host = false; MP.code = m.code; lobby('Joined. Swapping decks…'); sendHello(); return; }
  if (m.t === 'peer'){
    if (m.state === 'joined'){ setStatus('They are in. Swapping decks…'); sendHello(); }
    else {
      MP.peerList = null; MP.ready = false;
      if (MP.live) dropOut('The other player left.');
      else lobby('They left. Still waiting…');
    }
    return;
  }
  if (m.t === 'relay') onPeer(m.d);
}
function lobby(msg){
  setStatus(msg, '');
  const body = $('#mp-body');
  if (!body || !MP.code) return;
  body.innerHTML =
    '<p class="netstat"><span class="netdot on"></span>' + esc(msg) + '</p>' +
    '<div class="okbox">Give this code to the other player. They tap <b>Join room</b> and type it in.</div>' +
    '<div class="roomcode">' + esc(MP.code) + '</div>' +
    '<p class="blurb" style="text-align:center">Room ' + esc(MP.code) + ' · you are the ' +
      (MP.host ? 'host (you go first)' : 'guest (you go second)') + '</p>' +
    '<div style="display:grid;gap:9px;margin-top:14px">' +
      '<button class="btn ghost" id="mp-cancel">Leave the room</button></div>';
  $('#mp-cancel').onclick = () => { mpLeave(); mpScreen(); };
}
function sendHello(){
  const d = findDeck(MP.myDeckId);
  MP.myName = K.displayName().toUpperCase();
  relay({ k:'hello', name:MP.myName, list:d.list, deckKey:d.attr, deckName:d.name });
}

function onPeer(d){
  if (!d || !d.k) return;
  if (d.k === 'hello'){
    MP.peerName = d.name || 'THEM';
    MP.peerList = d.list; MP.peerKey = d.deckKey || null;
    if (MP.host) hostStart();
    else setStatus('Ready. Waiting for the host to deal…');
    return;
  }
  if (d.k === 'start'){ beginOnline(d); return; }
  if (d.k === 'act'){ applyRemote(d); return; }
  if (d.k === 'bail'){ dropOut(d.why || 'They stopped the duel.'); return; }
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

function applyRemote(d){
  if (!MP.live || !K.D || K.D.over) return;
  if (d.ck && d.ck !== checksum()){
    relay({ k:'bail', why:'The two boards went out of step.' });
    dropOut('The two devices went out of step, so the duel was stopped rather than fake it.');
    return;
  }
  const a = d.a || {};
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
    dropOut('Something went wrong applying their move.');
  } finally {
    K.NET.applying = false;
  }
  K.renderDuel();
}

function dropOut(why){
  const wasLive = MP.live;
  MP.live = false;
  K.NET.send = null; K.NET.applying = false;
  K.setRNG(null);
  window.KHOOK = null;
  if (!wasLive) return;
  K.openModal(
    '<div class="result"><div class="big lose">CUT OFF</div>' +
    '<p class="muted">' + esc(why) + '</p>' +
    '<p class="tiny" style="line-height:1.6">Nothing was awarded. Pass &amp; Play never does this ' +
    'to you — it needs no network at all.</p>' +
    '<div style="display:grid;gap:9px;width:100%;margin-top:6px">' +
      '<button class="btn hot" id="do-pnp">🤝 Pass &amp; Play instead</button>' +
      '<button class="btn ghost" id="do-home">Back to menu</button></div></div>');
  $('#do-pnp').onclick = () => { K.closeModal(); K.D = null; mpLeave(); pnpScreen(); K.go('pnp'); };
  $('#do-home').onclick = () => { K.closeModal(); K.D = null; mpLeave(); K.go('home'); };
}

function mpResult(winner, why){
  if (!MP.live) return false;
  const won = winner === 0;
  MP.live = false;
  K.NET.send = null;
  K.setRNG(null);
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
  $('#mr-home').onclick = () => { K.closeModal(); K.D = null; mpLeave(); window.KHOOK = null; K.go('home'); };
  return true;
}

/* ───────────────────────── entry ───────────────────────── */
/* The home screen offers one MULTIPLAYER button; the choice of how lives here. */
function chooser(){
  K.openSheet(
    '<h3>Multiplayer</h3>' +
    '<p class="muted">Two humans. One of these always works with no network at all.</p>' +
    '<div class="opts">' +
      '<button class="btn primary" id="mc-pnp">🤝 Pass &amp; Play' +
        '<span class="sub">two players, one phone · always works</span></button>' +
      '<button class="btn" id="mc-net">📡 Online' +
        '<span class="sub">same wi-fi, needs the Pi server running</span></button>' +
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
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();

window.KARTI_MP = {
  PNP, MP, pnpScreen, pnpStart, pnpHandover, pnpResume, pnpResult, pnpEnd, seatAt,
  mpScreen, mpConnect, mpLeave, checksum, applyRemote, beginOnline, onPeer, onServer, chooser,
  deckOptions, findDeck, mulberry32, httpsPage
};

})();
