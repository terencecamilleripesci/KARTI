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
/* The relay holds a dropped chair for ~60 s (its reconnect GRACE) before the
   sweeper frees it. Inside this window a fresh tap on the SAME room goes back
   in through 'rejoin' with the held seat's token — reclaiming our own chair —
   instead of joining as a new player next to our own ghost. Slightly past the
   relay's 60 s on purpose: a reclaim the relay refuses falls straight back to
   an ordinary join (see onServerError), so guessing long costs nothing. */
const SEAT_RECLAIM_MS = 70000;

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
/* ── keep the lobby where the finger left it ────────────────────────
   Every interaction in the lobby (pick a game, toggle ready, change a
   seat, open a drawer) repaints by replacing innerHTML — of #mp-body,
   or of #scr-mp which contains it. Replacing the scroller's content
   resets its scrollTop to 0, so the list snapped back to the top on
   every tap. keepScroll() reads #mp-body's scrollTop before a repaint
   and puts it back after, so the view stays where the user was. It
   is deliberately null-safe on both sides: no #mp-body (a different
   screen), no restore; and it never scrolls PAST the new content. */
function keepScroll(paint){
  const before = $('#mp-body');
  const y = before ? before.scrollTop : 0;
  paint();
  if (!y) return;
  const after = $('#mp-body');
  if (after) after.scrollTop = Math.min(y, after.scrollHeight - after.clientHeight);
}
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
  { k:'spy', name:'L-Ispjun', short:'SPJUN', sym:'sp-spy',
    blurb:'One word, one liar. Sixteen can play.' },
  { k:'kiri',   name:'Il-Kiri',  short:'KIRI',   icon:'coin',
    blurb:'Rent, deeds, and a ruined friendship.' },
  { k:'klabb',  name:'Card club', short:'KLABB', icon:'cards',
    blurb:'Bixkla, Briscola, Sette, Il-Gidba.' },
  /* the new games the relay now seats. No hidden information, so online off
     the shared seed is honest. Their own files publish the lobby contract. */
  { k:'kanun', name:'Il-Kanun',  short:'KANUN', icon:'play',
    blurb:'Two castles, one slingshot.' },
  { k:'bomba', name:'Il-Bomba',  short:'BOMBA', icon:'play',
    blurb:'Drop bombs. Last one standing.' },
  { k:'briks', name:'Il-Ħajt',   short:'ĦAJT',  icon:'play',
    blurb:'Break their wall before they break yours.' },
  /* THE HIDDEN-HAND CARD GAMES. Online now that the relay deals each seat
     its own cards privately (see the private per-seat deal above): no phone
     ever receives another seat's hole cards. Free chips / lives only — coins
     stay behind COINS_MODE_READY in their own files. */
  { k:'poker', name:'Il-Poker',  short:'POKER', icon:'cards',
    blurb:'Two cards each, five in the middle, four rounds of bluffing.' },
  { k:'cards2131', name:'21 u 31', short:'21·31', icon:'cards',
    blurb:'Blackjack against the dealer, or Scat for your lives.' },
  { k:'ludu',  name:'Ludu',      short:'LUDU',  icon:'play',
    blurb:'Four tokens, one lap, no mercy.' },
  { k:'serp',  name:'Is-Serp',    short:'SERP',  icon:'play',
    blurb:'Grow, don\'t crash, eat the rest.' },
  { k:'erbgha', name:'Erbgħa',    short:'ERBGĦA', icon:'play',
    blurb:'Drop discs, line up four.' },
  { k:'minhu',  name:'Min Hu?',    short:'MIN HU', icon:'play',
    blurb:'Ask, eliminate, guess their face.' },
  { k:'kodici', name:'Il-Kodiċi',  short:'KODIĊI', icon:'play',
    blurb:'Two secret codes. Crack theirs first.' },
  /* the arena games (real-time, no hidden info) and Reversi (perfect info).
     Online is honest off the shared seed / lockstep. */
  { k:'tankijiet', name:'It-Tankijiet', short:'TANKS', icon:'flag',
    blurb:'Drive, aim, fire. Four to eight tanks, last one rolls.' },
  { k:'ballun', name:'Il-Ballun',  short:'BALLUN', icon:'play',
    blurb:'Guard your goal. Bounce the ball into theirs.' },
  { k:'aqleb', name:'Aqleb',       short:'AQLEB', icon:'drop',
    blurb:'Trap a line, flip it. Two to four players.' },
  { k:'kaxxi', name:'Puntini u Kaxxi', short:'KAXXI', icon:'map',
    blurb:'Draw lines, close boxes. Two to four players.' },
  /* the two flagship turn-based games — conquest and deduction, 2–6 seats */
  { k:'konkwista', name:'Konkwista', short:'KONKWISTA', icon:'map',
    blurb:'Claim islands, roll the dice, take the whole sea.' },
  { k:'misteru', name:'Il-Misteru', short:'MISTERU', icon:'search',
    blurb:'Suggest, deduce, name the killer. Fifty cases.' }
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
/* DELIBERATELY GATED — playable transport, but the game's OWN contract refuses
   to start online even for a full table of ready people (today: poker and the
   21·31 tile, until the relay deals a fresh private hand PER ROUND rather than
   once at start). A room of such a game is a table whose Start button can never
   light — a dead room — so the picker must say the game's own reason instead of
   opening one. Probed live off the published canStart, never a hardcoded list:
   the moment a game's file lifts its gate, every door here follows by itself.
   Returns the game's display-ready reason TEXT, or null when it can start. */
function gameGated(k){
  k = cleanGame(k);
  /* the instant duels predate the ready lobby and have no canStart to probe */
  if (k === 'cards' || k === 'chess' || k === 'dama') return null;
  if (!gamePlayable(k)) return null;      /* absent is a different, older message */
  let LB;
  try { LB = gameLobby(k); } catch (e){ return null; }
  if (!LB || LB.bare) return null;        /* no contract published -> nothing to probe */
  try {
    const seats = [];
    for (let i = 0; i < LB.defaultSeats; i++)
      seats.push({ seat:i, name:'P' + (i + 1), kind:'human', ready:true, level:0 });
    const v = LB.canStart(seats);
    if (v && v.ok === false)
      return String(v.why || T('Not open online yet.', 'Għadha mhux onlajn.'));
  } catch (e){ /* a throwing probe never blocks a game — the lobby's own
                  tableCanStart says the truth once a room exists */ }
  return null;
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
  gharraq:'KARTI_GHARRAQ', rummy:'KARTI_RUMMY', gin:'KARTI_GIN', spy:'KARTI_SPY',
  /* L-ISPETT publishes a full window.KARTI_SUSPETT.lobby (real canStart/start),
     but was missing here, so gameGlobal('suspett') returned null and the shared
     lobby ran it on SEATS_FALLBACK instead of its own contract. */
  suspett:'KARTI_SUSPETT',
  /* the new games with no hidden information — online off the shared seed is
     honest for these (nothing to read out of the deal). The hidden-hand card
     games are deliberately absent until the private per-seat deal is wired. */
  kanun:'KARTI_KANUN', bomba:'KARTI_BOMBA', briks:'KARTI_BRIKS',
  /* the hidden-hand card games. Their contracts are published on
     KARTI_POKER.lobby and KARTI_BLACKJACK.lobby (the 21/31 tile), and the
     private per-seat deal keeps every hole card off the shared wire. */
  poker:'KARTI_POKER', cards2131:'KARTI_BLACKJACK',
  /* Ludo — no hidden hands; online is honest off the shared seed (only the
     dice are seeded, which the game documents). */
  ludu:'KARTI_LUDU',
  /* Snake — real-time, no hidden info; online is honest. */
  serp:'KARTI_SERP',
  /* Connect 4 (no hidden state) + the two secret-code/character duels
     (secret delivered by the private per-seat deal). */
  erbgha:'KARTI_ERBGHA', minhu:'KARTI_MINHU', kodici:'KARTI_KODICI',
  /* the arena games + Reversi — real-time lockstep / perfect-info, honest online */
  tankijiet:'KARTI_TANKIJIET', ballun:'KARTI_BALLUN', aqleb:'KARTI_AQLEB',
  kaxxi:'KARTI_KAXXI',
  /* conquest (perfect info, seeded dice) + deduction (online gated until the
     private per-seat solution/hand deal is wired; offline plays now) */
  konkwista:'KARTI_KONKWISTA', misteru:'KARTI_MISTERU'
};

/* LAST-RESORT SEAT RANGES — [min, max, sensible default].
   These MIRROR GAME_SEATS in server/karti_server.py and exist only for a game
   that has not published minSeats/maxSeats itself. They are not the authority:
   the relay refuses a size outside its own range, so a wrong number here fails
   loudly at create time rather than seating people who cannot play. */
const SEATS_FALLBACK = {
  cards:[2, 2, 2], chess:[2, 2, 2], dama:[2, 2, 2],
  skarta:[2, 10, 6], klabb:[2, 4, 4], kiri:[2, 8, 4], tombla:[2, 16, 8],
  gharraq:[2, 6, 4], rummy:[2, 12, 4], gin:[2, 2, 2],
  /* L-ISPJUN wants a ROOM, not a duel — three is the fewest that can hide a
     liar, and sixteen is what the relay already seats for tombla. */
  spy:[3, 16, 6], suspett:[5, 16, 9],
  /* the hidden-hand card games. Poker seats 2..8; the 21/31 tile spans both
     modes (21 from 1, 31 from 3) up to 9. Their own lobby contracts are the
     authority — these mirror the relay so a wrong size fails loudly there. */
  poker:[2, 8, 4], cards2131:[1, 9, 4],
  /* the arena games + Reversi. tankijiet is a 4–8 brawl; ballun and aqleb seat 2–4. */
  tankijiet:[4, 8, 4], ballun:[2, 4, 4], aqleb:[2, 4, 2], kaxxi:[2, 4, 2],
  konkwista:[2, 6, 3], misteru:[2, 6, 3]
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
    const liveNet = window.KARTI_PARTY && window.KARTI_PARTY.online &&
                    window.KARTI_PARTY.online[k];
    c.net = liveNet || null;
    c.online = !!(liveNet && liveNet.start && liveNet.remote);
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
  /* `levels: []` is a STATEMENT, not an omission: a game that publishes an
     empty list is saying "no machines at this table" (L-ISPJUN — a machine
     cannot answer questions about a secret word). It must never be
     overwritten with the generic fallback, or the lobby offers a "+ Machine"
     button whose machine can never play. Only a game that published NOTHING
     gets the fallback. */
  const noMachines = !!(pub && Array.isArray(pub.levels) && !pub.levels.length);
  let levels = list(pub && pub.levels) || list(tile && tile.levels);
  if (!levels){
    if (noMachines) levels = [];
    else { gaps.push('levels'); levels = LEVELS_FALLBACK; }
  }
  levels = levels.slice(0, 5).map((L, i) => ({
    level: num(L && (L.level != null ? L.level : L.k)) || (i + 1),
    name:  String((L && (L.name || L.n)) || ('Level ' + (i + 1))).slice(0, 22),
    note:  String((L && (L.note || L.blurb || L.t)) || '').slice(0, 80)
  }));
  let defLevel = num(pub && pub.defaultLevel);
  if (defLevel == null)
    defLevel = !levels.length ? 1 : levels.length > 1 ? levels[1].level : levels[0].level;

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
     wording wins; ours is the fallback and is written to read the same way.
     The unready are named: "1 person is not ready" on a party lobby reads
     like the room is broken, when the truth is that ĠORĠ wandered off — and
     the empty chairs are said not to matter, because "5 of 8" next to a dead
     start button convinced the owner the BOOKED size was the blocker. It
     never is: a table starts from the game's minimum up. */
  const canStart = fn(pub && pub.canStart) || (seats => {
    const n = (seats || []).length;
    if (n < min) return { ok:false, why:'It takes ' + min + ' to play ' + meta.name + '.' };
    if (n > max) return { ok:false, why:max + ' is as many as this table seats.' };
    const not = (seats || []).filter(s => s && !isReady(s));
    if (not.length) return { ok:false,
      why:(not.length <= 2
            ? not.map(s => s.name || 'Somebody').join(' and ') + ' ' +
              (not.length > 1 ? 'have' : 'has')
            : not.length + ' people have') +
          ' not tapped ready yet. Empty chairs never hold a start up.' };
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
    /* THE MODE PICKER'S CONTRACT — the host-only Rules button in the lobby.
       A game may publish `variants` (a list, or a getter returning one, of
       {net,label:{en,mt}}), plus currentVariant() and applyVariant(net) →
       {variant,rules}. Read LIVE off the published object rather than frozen
       here, because klabb's list is a getter over engine files that register
       AFTER this contract is first built and cached. A game that published
       none of this shows no Rules button, which is correct — see lobbyVariants. */
    _pub: pub,
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

/* ── THE TABLE SIZE THE HOST PICKED ───────────────────────────────────
   How many chairs to put out when opening a room of `k`. The host may have
   set one on the setup screen (MP.wantCap); if not, the game's own sensible
   default is used. Either way it is CLAMPED into the game's real range so a
   stale pick from a bigger game can never open an out-of-range table — the
   relay clamps too, but clamping here keeps the number the host SEES honest.
   A two-seat game has no choice to make and always returns 2. */
function wantCapFor(k){
  const LB = gameLobby(k);
  const min = LB.minSeats, max = LB.maxSeats;
  if (max <= min) return min;
  const picked = num(MP.wantCap);
  const n = (picked && picked >= min) ? picked : LB.defaultSeats;
  return Math.max(min, Math.min(max, n));
}

/* ── THE MODE PICKER, SHARED ──────────────────────────────────────────
   The variant was bound write-once when the room was opened; the host had to
   leave and re-open to change one word, throwing everyone out. These three
   read a game's published presets so the lobby can offer a host-only Rules
   button that changes the mode IN PLACE. A game that published no variants
   returns an empty list and shows no button — that is correct, not a bug. */

/* [{net, label:{en,mt}}] for game k, read LIVE off its published contract
   (klabb's is a getter over engine files registered after boot). Never throws;
   a malformed entry is skipped rather than allowed to break the lobby. */
function lobbyVariants(k){
  const LB = gameLobby(k);
  const pub = LB && LB._pub;
  let raw = pub && pub.variants;
  try { if (typeof raw === 'function') raw = raw.call(pub); } catch(e){ raw = null; }
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const v of raw){
    if (!v) continue;
    const net = String(v.net || v.id || '').trim();
    if (!net) continue;
    const lab = v.label || {};
    const en = String(lab.en || v.name || net).slice(0, 40);
    const mt = String(lab.mt || v.mt || en).slice(0, 40);
    out.push({ net, label:{ en, mt } });
  }
  return out;
}

/* which variant this room is on, as the relay's word. The room is the
   authority: prefer MP.variant, fall back to the game's own currentVariant(). */
function lobbyCurrentVariant(k){
  if (MP.variant) return MP.variant;
  const pub = gameLobby(k)._pub;
  try {
    if (pub && typeof pub.currentVariant === 'function') return pub.currentVariant() || null;
  } catch(e){}
  return null;
}

/* a picked variant (relay word) → {variant, rules} to put on the wire. The
   game may fold richer presets onto `rules`; the default carries just the
   variant, which is all klabb and rummy need today. */
function lobbyApplyVariant(k, net){
  const pub = gameLobby(k)._pub;
  try {
    if (pub && typeof pub.applyVariant === 'function'){
      const r = pub.applyVariant(net);
      if (r && typeof r === 'object' && typeof r.variant === 'string')
        return { variant: r.variant, rules: (r.rules && typeof r.rules === 'object') ? r.rules : null };
    }
  } catch(e){}
  return { variant: String(net), rules: null };
}

/* ── THE GAME PICKER, SHARED (host only) ──────────────────────────────
   The bigger sibling of the mode picker above. The mode picker changes the
   FLAVOUR of one game in place; this changes WHICH GAME the whole table is
   playing, again without kicking anyone. It goes to the relay as a `setgame`
   message; the roster that comes back carries the new `game`, and onRoster()
   repaints every seated player into the new game's lobby.

   Which games to offer is READ FROM THE REGISTRY, not hardcoded: the online
   party games that publish a real lobby contract — that is, the keys of
   LOBBY_GLOBAL whose gameLobby() is not `bare` and can actually carry a move
   (online). Legacy instant-duel games (cards/chess/dama) are never offered:
   they do not use the ready lobby, so switching a table into one would leave
   everyone seated in a lobby the game does not use — the relay refuses it too. */

/* the games this table could switch to, each already told whether the CURRENT
   GROUP can seat it. `taken` is how many chairs are spoken for right now
   (people plus machines). A game whose maximum is below `taken` comes back
   `fits:false` with a short reason, so the picker can show it DISABLED rather
   than silently hide it. Never throws; a game that resolves to nothing is
   skipped. Sorted by minimum seats so the smaller tables read first. */
function lobbyGames(taken){
  const n = (typeof taken === 'number' && taken > 0) ? (taken | 0) : 1;
  const out = [];
  for (const k of Object.keys(LOBBY_GLOBAL)){
    /* never offer a legacy duel — it does not use this lobby at all */
    if (k === 'cards' || k === 'chess' || k === 'dama') continue;
    let LB;
    try { LB = gameLobby(k); } catch(e){ continue; }
    /* a game that published no real contract, or that cannot carry a move on
       this build, is not a game a table can switch INTO — skip it. The current
       game is always offered so the picker shows what is playing now. */
    if (k !== MP.game && (LB.bare || !LB.online)) continue;
    const max = LB.maxSeats, min = LB.minSeats;
    let fits = n <= max;
    /* the disabled reason, in the phone's language. Both bounds are named so a
       host who has too FEW for a game and one who has too MANY read the truth,
       not a bare "unavailable". */
    let reason = '';
    if (!fits){
      reason = (min === max)
        ? T('needs exactly ' + max + ' players', 'trid eżatt ' + max + ' plejers')
        : T('at most ' + max + ' players', 'l-aktar ' + max + ' plejers');
    }
    /* a game whose own contract still refuses to start online (gameGated —
       poker / 21·31 today) is drawn DISABLED with a short reason, never
       hidden: switching a live table into it would park everyone at a Start
       button that can never light. The current game stays offered as-is. */
    if (fits && k !== MP.game && gameGated(k)){
      fits = false;
      reason = T('not open online yet', 'mhux onlajn għalissa');
    }
    out.push({ id:k, name:LB.name, short:LB.short || LB.name,
               min, max, fits, reason, current:k === MP.game });
  }
  out.sort((a, b) => (a.min - b.min) || (a.max - b.max) ||
                     a.name.localeCompare(b.name));
  return out;
}

/* the one language switch, the shared way (see js/lang.js). Whichever side is
   missing falls back to the other, never a bare key. */
function T(en, mt){
  try { if (window.KARTI_LANG) return window.KARTI_LANG.t(en, mt); } catch(e){}
  return en;
}
function isMT(){
  try { return !!(window.KARTI_LANG && window.KARTI_LANG.mt()); } catch(e){ return false; }
}

/* the label to show for a variant, in the phone's language */
function variantLabel(v){
  if (!v || !v.label) return '';
  return (isMT() ? v.label.mt : v.label.en) || v.label.en || v.label.mt || v.net;
}

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
/* games that ship a real logo png (art/ui/logo-<k>.png) — the picker shows it
   over a valid glyph base, so a game is never a blank chip. */
/* which games have a painted icon in art/ui/logo-<k>.png. Every game in the
   picker now has one — the nine that were drawing a bare glyph (card duel,
   tombla, gharraq, spy, klabb, poker, aqleb, kaxxi, misteru) were commissioned
   in the same inked-cartoon house style as the rest. */
const LOGO_GAMES = ('chess dama kiri skarta erbgha ludu minhu kodici kanun bomba ' +
                    'briks cards2131 serp tankijiet konkwista ballun ' +
                    'cards tombla gharraq spy klabb poker aqleb kaxxi misteru').split(' ');
function gameIcon(k){
  const g = gameMeta(k);
  const P = window.KARTI_PARTY;
  let base;
  if (g.sym && P && P.ui && P.ui.sprite){
    try { P.ui.sprite(); } catch (e){}
    base = '<svg class="mp-gsym" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
           '<use href="#' + g.sym + '"></use></svg>';
  } else {
    base = ico(g.icon || 'deck');
  }
  /* overlay the game's real logo when it has one; the img covers the glyph on
     load and removes itself on a 404, so the glyph is always the safe fallback. */
  if (LOGO_GAMES.indexOf(k) >= 0){
    return '<span class="mp-glogo" style="position:relative;display:inline-flex;' +
           'align-items:center;justify-content:center">' + base +
           '<img src="./art/ui/logo-' + k + '.png" alt="" style="position:absolute;' +
           'inset:0;width:100%;height:100%;object-fit:contain" ' +
           'onerror="this.remove()"></span>';
  }
  return base;
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
  pingAt:0, rtts:[],
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
  /* THE CHAIR THE RELAY IS STILL HOLDING FOR US. Written whenever the relay
     seats us ({code, token, id, at}); `at` is refreshed when the socket dies,
     which is the moment the relay's reconnect grace starts. It outlives the
     socket ON PURPOSE: a player who was dropped and taps the same room again
     within the grace goes back into THIS chair (rejoin + token) instead of
     taking a second one next to their own ghost — or bouncing off "room full",
     off a chair that is actually theirs. Cleared the moment a 'leave' is
     actually SENT (a chair given up on purpose is not held) and when the
     relay says the seat is gone. */
  heldSeat:null,
  /* the join we will fall back to if a seat reclaim is refused: {intent, code,
     id, priv, game}. Consumed by onServerError; cleared on 'rejoined'. */
  reclaim:null,
  /* a join/joinid is in flight — the double-tap guard in start() holds the
     door only while this (or a real seat) is true */
  awaitJoin:false,
  /* when the keep-alive timer last actually ran — a gap of several beats means
     the phone was asleep/backgrounded, not that the network went quiet */
  lastTick:0,

  /* ── THE TABLE ────────────────────────────────────────────────────
     Every newer game uses this, including two-seat Gin. Only the original
     card duel, chess and dama keep the instant-pair path. */
  size:2,               /* chairs the ROOM has, straight from the relay   */
  mySeat:0,             /* which one is mine, straight from the relay     */
  roster:null,          /* the last {t:'table'} — the whole truth on who  */
  iAmReady:false,       /* my own bit, echoed back by the roster          */
  wantSeats:0,          /* chairs we asked for when we opened it          */
  /* THE TABLE SIZE THE HOST PICKED, before opening. 0 means "not chosen,
     use the game's own default". Clamped into [minSeats,maxSeats] the
     moment it is read (see wantCapFor). It is the seat count sent as
     `create.seats`, so the host owns the table size from the setup screen —
     the lobby, not the game, decides how many chairs go out. */
  wantCap:0,
  variant:null,         /* which flavour, where a game has flavours       */
  showRules:false,      /* the rules panel, folded open IN PLACE          */
  panel:null,           /* which inline drawer is open: 'ai' | 'ask' | null */
  lobbyY:0,             /* where the finger left the lobby list — see tableLobby */
  aiSeat:-1,            /* the empty chair the machine picker is aimed at */
  began:null,           /* the relay's {t:'began'} — seed, bots, levels    */
  stakeLive:null,       /* THE POT THIS MATCH IS PLAYING FOR, on this phone:
                           {ante,humans,pot,id,paid,settled}. Set the moment a
                           STAKED table begins (the ante goes out right there,
                           through KARTI_XP.stake with the match id, so a
                           replayed 'began' can never ante twice); null for a
                           friendly table, and null again the moment the room
                           is left. Wallet bookkeeping ONLY — nothing about it
                           touches the seed, the sim or the wire.             */
  askBack:null,         /* somebody to invite the moment we have a room     */
  unMove:null,          /* unsubscribe from the game's own move feed        */
  privateHook:null,     /* the running game's {t:'mine'} sink, if it has one */
  pendingMine:null,     /* a private hand that outran the start, buffered   */
  whisperHook:null,     /* the running game's private-word sink (chat), if any */
  friendHook:null       /* the FRIENDS module's sink for {t:'friend'} social msgs */
};

/* The original card duel, chess and dama still pair and begin immediately.
   Every newer game uses the shared ready lobby, even when its rules happen to
   allow exactly two seats (Gin). Seat count alone cannot tell those apart. */
function usesTableLobby(){
  return MP.size > 2 || (MP.game !== 'cards' && MP.game !== 'chess' && MP.game !== 'dama');
}

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
/* Is this a developer looking, or a player? The relay address box (and anything
   else that can break somebody's connection) is only drawn for the former.
   ?dev=1 turns it on and remembers it; ?dev=0 turns it off again. A relay that
   is already off the default also counts, so a stranded player can always reach
   the reset button. */
function devTools(){
  try {
    const q = (location.search || '') + (location.hash || '');
    if (/[?&#]dev=1\b/.test(q)){ localStorage.setItem('karti_dev', '1'); return true; }
    if (/[?&#]dev=0\b/.test(q)){ localStorage.removeItem('karti_dev'); return false; }
    if (localStorage.getItem('karti_dev') === '1') return true;
  } catch (e){}
  try { return !!(MP.url && MP.url !== RELAY_URL); } catch (e){ return false; }
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

    /* ── THE TOP ROW: two small boxes instead of two full-height sections ──
       Each carries its own state and opens only when tapped, so a quiet
       evening costs two tiles of height instead of most of the screen. */
    '#scr-mp .mp-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 2px}' +
    '#scr-mp .mp-tile{position:relative;display:flex;align-items:center;gap:8px;' +
      'min-height:48px;padding:10px 12px;border-radius:14px;cursor:pointer;text-align:left;' +
      'background:color-mix(in srgb,var(--kx-surface,#1b1526) 88%,transparent);' +
      'border:1px solid color-mix(in srgb,var(--kx-ink,#fff) 12%,transparent);' +
      'color:var(--kx-ink,#F4EFFF);transition:border-color .16s,background .16s,transform .12s}' +
    '#scr-mp .mp-tile:active{transform:translateY(1px)}' +
    '#scr-mp .mp-tile.on{border-color:var(--kx-accent,#FFC542);' +
      'background:color-mix(in srgb,var(--kx-accent,#FFC542) 14%,transparent)}' +
    '#scr-mp .mp-tile b{font-size:12.5px;font-weight:800;letter-spacing:.2px}' +
    '#scr-mp .mp-tile svg{width:17px;height:17px;flex:0 0 auto;opacity:.9}' +
    /* the unread-style badge: quiet at zero, lit the moment a room exists */
    '#scr-mp .mp-bub{margin-left:auto;min-width:22px;height:22px;padding:0 6px;border-radius:999px;' +
      'display:inline-flex;align-items:center;justify-content:center;font:900 11.5px/1 system-ui;' +
      'background:color-mix(in srgb,var(--kx-ink,#fff) 14%,transparent);color:var(--kx-dim,#A093C4)}' +
    '#scr-mp .mp-bub.hot{background:#E63950;color:#fff;' +
      'box-shadow:0 0 0 3px color-mix(in srgb,#E63950 28%,transparent);animation:mpBub 1.9s ease-in-out infinite}' +
    '@keyframes mpBub{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}' +
    '@media (prefers-reduced-motion:reduce){#scr-mp .mp-bub.hot{animation:none}}' +
    '.reduced #scr-mp .mp-bub.hot{animation:none}' +

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
    /* gated (here, but its own file says online is not open yet): tappable so
       the reason can be read, drawn quieter than a live game */
    '#scr-mp .mp-g.gated{opacity:.62}' +
    '#scr-mp .mp-g.gated i{color:#E8B84C}' +

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

    /* the seat stepper — setup screen and the host's lobby control */
    '#scr-mp .mp-setrow{display:flex;align-items:center;gap:12px;margin:14px 0 4px;' +
      'padding:11px 13px;border-radius:15px;background:rgba(255,255,255,.045);' +
      'border:1px solid rgba(255,255,255,.10)}' +
    '#scr-mp .mp-setlbl{flex:1;min-width:0}' +
    '#scr-mp .mp-setlbl b{display:flex;align-items:center;gap:7px;font:800 13px/1.1 var(--disp);' +
      'letter-spacing:.02em;color:#F2ECFF}' +
    '#scr-mp .mp-setlbl b .ico{width:16px;height:16px;color:#C6AEFF}' +
    '#scr-mp .mp-setlbl i{display:block;margin-top:5px;font-style:normal;font-size:11px;' +
      'line-height:1.45;color:#9C8FC0}' +
    '#scr-mp .mp-seats{flex:0 0 auto;display:flex;align-items:center;gap:8px}' +
    '#scr-mp .mp-seatb{flex:0 0 auto;width:40px;height:40px;border-radius:12px;cursor:pointer;' +
      'display:grid;place-items:center;border:1px solid rgba(138,92,255,.40);' +
      'background:rgba(138,92,255,.16);color:#D9C9FF;font:900 22px/1 var(--disp)}' +
    '#scr-mp .mp-seatb .ico{width:18px;height:18px}' +
    '#scr-mp .mp-seatsym{font:900 24px/1 var(--disp);margin-top:-2px}' +
    '#scr-mp .mp-seatb:active{transform:scale(.94)}' +
    '#scr-mp .mp-seatb[disabled]{opacity:.32;cursor:default}' +
    '#scr-mp .mp-seatn{flex:0 0 auto;min-width:52px;text-align:center;line-height:1}' +
    '#scr-mp .mp-seatn b{display:block;font:900 22px/1 var(--disp);color:#FFC542}' +
    '#scr-mp .mp-seatn i{display:block;margin-top:3px;font-style:normal;font-size:9px;' +
      'letter-spacing:.06em;color:#9C8FC0;white-space:nowrap}' +

    /* the customise affordance — host AND each player, while they wait */
    '#scr-mp .mp-cust{display:flex;align-items:center;gap:11px;width:100%;text-align:left;' +
      'min-height:54px;padding:9px 13px;margin:8px 0 2px;border-radius:15px;cursor:pointer;' +
      'background:linear-gradient(180deg,rgba(255,197,66,.12),rgba(255,197,66,.03));' +
      'border:1px solid rgba(255,197,66,.34);color:#F6EEDA}' +
    '#scr-mp .mp-cust:active{transform:scale(.99)}' +
    '#scr-mp .mp-cust .mp-custico{flex:0 0 auto;width:34px;height:34px;border-radius:11px;' +
      'display:grid;place-items:center;background:rgba(255,197,66,.20);color:#FFDE93}' +
    '#scr-mp .mp-cust .mp-custico .ico{width:19px;height:19px}' +
    '#scr-mp .mp-cust span{flex:1;min-width:0}' +
    '#scr-mp .mp-cust b{display:block;font:800 13.5px/1.15 var(--disp);letter-spacing:.02em}' +
    '#scr-mp .mp-cust i{display:block;margin-top:3px;font-style:normal;font-size:11px;' +
      'line-height:1.4;color:#C9B893}' +
    '#scr-mp .mp-cust em{flex:0 0 auto;color:#FFDE93}' +
    '#scr-mp .mp-cust em .ico{width:16px;height:16px}' +

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
    /* the seat plate — a real avatar with the chair number as a small badge */
    '#scr-mp .mp-cav{flex:0 0 auto;position:relative;width:38px;height:38px;line-height:0}' +
    '#scr-mp .mp-cav>[data-kx-av],#scr-mp .mp-cav .kx-av-fallback{display:block;border-radius:11px}' +
    '#scr-mp .mp-cbot{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;' +
      'background:rgba(138,92,255,.16);border:1px solid rgba(138,92,255,.34);color:#C6AEFF}' +
    '#scr-mp .mp-cbot .ico{width:20px;height:20px}' +
    '#scr-mp .mp-cn{position:absolute;right:-4px;bottom:-4px;min-width:16px;height:16px;' +
      'padding:0 3px;border-radius:8px;display:grid;place-items:center;' +
      'font:800 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#F2ECFF;' +
      'background:#2A1E48;border:1px solid rgba(255,255,255,.16);box-shadow:0 1px 3px rgba(0,0,0,.5)}' +
    '#scr-mp .mp-chair.ready .mp-cn{color:#8FE7B6;border-color:rgba(61,220,132,.40)}' +
    '#scr-mp .mp-chair.away .mp-cav{opacity:.55;filter:grayscale(.4)}' +
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

    /* ═══ THE STAKES — friendly or for chips ═══
       The host's control wears the lobby's own clothes (a fold button and
       a drawer); the non-host's is the same button LOCKED — read-only, not
       dimmed to illegibility, with a lock where the chevron would be. */
    '#scr-mp .mp-fold.ro{cursor:default;background:rgba(255,255,255,.028)}' +
    '#scr-mp .mp-fold.ro em{color:#7F73A0}' +
    '#scr-mp .mp-fold.ro em .ico{transform:none}' +
    /* the ante ladder — four chunky steps, one gold when chosen */
    '#scr-mp .mp-antes{display:flex;gap:8px;margin:2px 0 10px}' +
    '#scr-mp .mp-ante{flex:1;min-height:54px;border-radius:13px;cursor:pointer;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;' +
      'color:#F4EFFF;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14)}' +
    '#scr-mp .mp-ante b{font:900 17px/1 ui-monospace,SFMono-Regular,Menlo,monospace}' +
    '#scr-mp .mp-ante i{font-style:normal;font-size:8.5px;font-weight:800;letter-spacing:.1em;' +
      'text-transform:uppercase;color:#8478A8}' +
    '#scr-mp .mp-ante:active{transform:scale(.95)}' +
    '#scr-mp .mp-ante.on{color:#241800;background:#FFC542;border-color:#FFC542}' +
    '#scr-mp .mp-ante.on i{color:rgba(36,24,0,.6)}' +
    '#scr-mp .mp-ante[disabled]{opacity:.38;cursor:default}' +
    '#scr-mp .mp-stakebal{display:flex;align-items:center;gap:7px;margin-bottom:0}' +
    '#scr-mp .mp-stakebal .ico{width:15px;height:15px;flex:0 0 auto;color:#FFC542}' +
    /* the pot banner — gold, with the painted pile sized to the pot */
    '#scr-mp .mp-pot{display:flex;align-items:center;gap:12px;min-height:58px;' +
      'margin:14px 0 2px;padding:9px 14px;border-radius:15px;' +
      'background:linear-gradient(180deg,rgba(255,197,66,.16),rgba(255,197,66,.05));' +
      'border:1px solid rgba(255,197,66,.42)}' +
    '#scr-mp .mp-curart{flex:0 0 auto;width:46px;height:46px;object-fit:contain;' +
      'filter:drop-shadow(0 3px 5px rgba(0,0,0,.5))}' +
    '#scr-mp .mp-pot b{display:block;font:900 15px/1.15 var(--disp);letter-spacing:.05em;' +
      'color:#FFDE93}' +
    '#scr-mp .mp-pot i{display:block;margin-top:3px;font-style:normal;font-size:10px;' +
      'font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#C9B893}' +
    /* the refusal — the shortfall named, the free lane offered */
    '#scr-mp .mp-stakeshort{display:flex;align-items:flex-start;gap:10px;padding:11px 13px;' +
      'border-radius:14px;background:rgba(220,68,68,.12);border:1px solid rgba(220,68,68,.38)}' +
    '#scr-mp .mp-stakeshort .ico{flex:0 0 auto;width:18px;height:18px;color:#FF9A8A;margin-top:1px}' +
    '#scr-mp .mp-stakeshort b{display:block;font-size:12.5px;font-weight:800;line-height:1.4;' +
      'color:#FFC9BE}' +
    '#scr-mp .mp-stakeshort i{display:block;margin-top:3px;font-style:normal;font-size:11px;' +
      'line-height:1.5;color:#DCA9A0}' +
    '#scr-mp .mp-ready[disabled]{opacity:1;color:#9C8FC0;cursor:default;' +
      'background:rgba(255,255,255,.03);border-style:dashed}' +
    /* the pot LANDING on the game's own finish card (#scr-party) */
    '#scr-party .pt-pot{display:flex;align-items:center;justify-content:center;gap:12px;' +
      'margin:12px auto 14px;padding:10px 16px;max-width:250px;border-radius:15px;' +
      'background:linear-gradient(180deg,rgba(255,197,66,.18),rgba(255,197,66,.05));' +
      'border:1px solid rgba(255,197,66,.45)}' +
    '#scr-party .pt-pot.lose{background:rgba(0,0,0,.28);border-color:rgba(255,255,255,.16)}' +
    '#scr-party .pt-pot .mp-curart{flex:0 0 auto;width:52px;height:52px;object-fit:contain;' +
      'filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))}' +
    '#scr-party .pt-pot .mp-curart.dim{filter:grayscale(.75) brightness(.75)}' +
    '#scr-party .pt-pot span{text-align:left}' +
    '#scr-party .pt-pot b{display:block;font:900 24px/1 var(--disp);letter-spacing:.02em;' +
      'color:#FFDE93}' +
    '#scr-party .pt-pot.lose b{color:#C9BBB4;font-size:19px}' +
    '#scr-party .pt-pot i{display:block;margin-top:4px;font-style:normal;font-size:9px;' +
      'font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#C9B893}' +
    '#scr-party .pt-pot.lose i{color:#9A8F88}' +

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
    /* a pill that is only information (somebody mid-game) is a span, not a
       button — it needs the button's box drawn on but no press affordance */
    'span.mp-pill{display:inline-block;cursor:default}' +
    'span.mp-pill:active{transform:none}' +
    '.mp-arnote{margin:2px 0 0;font-size:11.5px;line-height:1.6;color:#A093C4}' +
    '.mp-rectitle .n{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'color:#A093C4}' +
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

/* ── THE SEAT STEPPER, SHARED ──────────────────────────────────────────
   One control, used in two places: the setup screen (host picks the size
   before opening) and — for the host — the waiting lobby. It reads the game's
   real [min,max] range and never lets the number out of it. `floor` is the
   lowest it may go RIGHT NOW: on setup that is the game's minimum; in a live
   lobby it is however many chairs are already spoken for, so the host can never
   shrink the table under the people already in it. */
function seatStepperHTML(k, cur, floor, o){
  o = o || {};
  const LB = gameLobby(k);
  const min = Math.max(LB.minSeats, floor || LB.minSeats);
  const max = LB.maxSeats;
  const n = Math.max(min, Math.min(max, cur));
  const decOff = n <= min, incOff = n >= max;
  return '<div class="mp-seats" role="group" aria-label="Table size">' +
    '<button class="mp-seatb" data-seatdelta="-1"' + (decOff ? ' disabled aria-disabled="true"' : '') +
      ' aria-label="Fewer chairs"><span class="mp-seatsym">&minus;</span></button>' +
    '<span class="mp-seatn"><b>' + n + '</b><i>' +
      (o.caption || ('seat' + (n === 1 ? '' : 's') + ' · up to ' + max)) + '</i></span>' +
    '<button class="mp-seatb" data-seatdelta="1"' + (incOff ? ' disabled aria-disabled="true"' : '') +
      ' aria-label="More chairs">' + ico('plus') + '</button>' +
  '</div>';
}

/* the setup-screen block: a labelled seat stepper, only where there is a
   genuine choice (a two-seat game shows nothing). */
function seatSetupHTML(k){
  if (!gamePlayable(k)) return '';
  const LB = gameLobby(k);
  if (LB.maxSeats <= LB.minSeats) return '';
  const cur = wantCapFor(k);
  return '<div class="mp-setrow">' +
    '<div class="mp-setlbl">' + ico('users') + ' <b>Table size</b>' +
      '<i>How many chairs go out. You can start the moment enough are ready — ' +
      'empty chairs never hold it up.</i></div>' +
    seatStepperHTML(k, cur, LB.minSeats,
      { caption:'chairs · ' + LB.minSeats + ' to ' + LB.maxSeats }) +
  '</div>';
}

/* wire the setup stepper: each tap adjusts MP.wantCap and repaints the setup
   screen so the number, the button label and the open button all follow. */
function wireSeatSetup(k){
  const LB = gameLobby(k);
  $$('#scr-mp .mp-setrow [data-seatdelta]').forEach(b => b.onclick = () => {
    const d = Number(b.dataset.seatdelta) || 0;
    const cur = wantCapFor(k);
    const next = Math.max(LB.minSeats, Math.min(LB.maxSeats, cur + d));
    if (next === cur) return;
    MP.wantCap = next;
    sfx(d > 0 ? 'ui.toggle' : 'ui.untoggle');
    mpScreen();
  });
}

/* ── the lobby screen ──────────────────────────────────────────────── */
function mpScreen(){
  injectCSS();
  MP.url = MP.url || defaultURL();
  const insecure = isSecurePage() && MP.url.slice(0, 6).toLowerCase() !== 'wss://';
  /* the picked game has to survive js/party.js not being on the phone */
  if (!gamePlayable(MP.wantGame)) MP.wantGame = 'cards';
  const want = MP.wantGame;
  /* a picked game whose own contract still refuses to start online (poker /
     21·31 — see gameGated). The tile stays tappable so the player can READ the
     game's own reason below, but the Open button is disabled: a room of it
     would be a table whose Start can never light. */
  const wantGate = want === 'cards' ? null : gameGated(want);

  $('#scr-mp').innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="mp-back" aria-label="Back to home">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>Online</h2>' +
    '</div>' +
    '<div class="scroll" id="mp-body">' +
      /* THE POINT OF THIS SCREEN IS TO GET INTO A GAME.
         It used to open with a paragraph, then WHO IS AROUND (a heading, a
         second paragraph and a row of faces), then ROOMS OPEN NOW — which on a
         quiet evening is a big empty panel explaining that it is empty. The six
         buttons everybody actually came for were below all of it, off-screen.
         Now: one line, then a ROW of two small boxes that carry their own count
         and open only when tapped, then the games. Who-is-around is gone from
         here entirely — people live in the Friends tab; this screen is for
         picking a game and going. */
      '<p class="blurb">Pick a game and open a room — whoever is online sees it straight away.</p>' +
      '<p class="mp-state" id="mp-stat"><span class="mp-dot"></span><span class="mp-txt"></span></p>' +
      (insecure
        ? '<div class="mp-box bad"><b>That server address will not work from this page.</b><br>' +
          'KARTI is loaded over https, so it can only open a <code>wss://</code> connection. ' +
          'Fix the address below or leave it on the default.</div>'
        : '') +
      '<div id="mp-inbox"></div>' +
      '<div class="mp-row2">' +
        '<button class="mp-tile" id="mp-roomstog" aria-expanded="false" ' +
          'aria-controls="mp-rooms">' + ico('users') +
          '<b>Rooms open</b><span class="mp-bub" id="mp-roomsbub">0</span></button>' +
        '<button class="mp-tile" id="mp-codetog" aria-expanded="false" ' +
          'aria-controls="mp-codepane">' + ico('lock') +
          '<b>Join by code</b></button>' +
      '</div>' +
      '<div id="mp-rooms" hidden></div>' +
      '<div id="mp-codepane" hidden>' +
        '<div style="display:grid;gap:9px;margin-top:9px">' +
          '<input class="field mp-codein" id="mp-code2" maxlength="' + CODE_LEN + '" ' +
            'placeholder="CODE" autocomplete="off" autocapitalize="characters" ' +
            'spellcheck="false" aria-label="Room code">' +
          '<button class="btn" id="mp-join2">↪ Join by code</button>' +
        '</div>' +
      '</div>' +
      '<div class="tiny" style="margin:14px 0 8px">Open a room of your own</div>' +
      '<div class="mp-pick" id="mp-pick">' +
        GAMES.map(g => {
          const off = !gamePlayable(g.k);
          /* gated ≠ absent: the game is on the phone and its file says, in its
             own words, why online is not open yet. The tile stays tappable so
             that reason can be read in full under the picker. */
          const gate = off ? null : gameGated(g.k);
          return '<button class="mp-g' + (gate ? ' gated' : '') + '" data-g="' + esc(g.k) + '" ' +
            'aria-pressed="' + (g.k === want ? 'true' : 'false') + '"' +
            (off ? ' disabled aria-disabled="true"' : '') + '>' +
            '<span class="mp-gi">' + gameIcon(g.k) + '</span>' +
            '<b>' + esc(g.name) + '</b><i>' +
            esc(off ? 'Not on this phone'
                    : gate ? T('Machine only for now — tap for why', 'Kontra l-magna għalissa')
                    : g.blurb) + '</i>' +
            '</button>';
        }).join('') +
      '</div>' +
      /* THE TABLE SIZE, PICKED BEFORE OPENING. A game that seats a real range
         gets a stepper here so the host chooses how big the table is — the
         lobby, not the game, owns the seat count. A two-seat game shows nothing,
         because there is no choice to make. */
      (wantGate ? '' : seatSetupHTML(want)) +
      /* a gated game says its own reason where the Open button would be — the
         words are the GAME's published canStart text, not ours */
      (wantGate
        ? '<div class="mp-box" style="margin-top:10px">' + gameIcon(want) + ' <b>' +
            esc(gameMeta(want).name) + '</b> — ' + esc(wantGate) + '</div>' +
          '<button class="btn primary" id="mp-open" disabled aria-disabled="true" ' +
            'style="margin-top:10px">' +
            esc(T('Not open online yet', 'Għadha mhux onlajn')) + '</button>'
        : '<button class="btn primary" id="mp-open" style="margin-top:10px">' + ico('plus') +
          ' Open a ' + esc(gameMeta(want).name.toLowerCase()) + ' room</button>' +
          '<p class="mp-more">One tap. Everyone online sees it straight away, labelled ' +
          esc(gameMeta(want).short) + '.</p>') +
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
      /* ── SERVER SETTINGS: NOT FOR PLAYERS ──────────────────────────────
         A free-text relay address on the player's own multiplayer screen is a
         production hazard: one stray tap and a player has pointed their app at
         an address that does not answer, with no idea why online stopped
         working. It is a developer tool, so it is only rendered for one:
           · with ?dev=1 (or the karti_dev flag it sets), or
           · when the address is ALREADY off the default — so somebody who has
             broken it, or who was moved deliberately, can always get back.
         Otherwise there is nothing on this screen to break. */
      (devTools()
        ? '<details style="margin:8px 0 26px"><summary class="tiny">Server settings</summary>' +
            '<div class="tiny" style="margin-top:8px">Relay address</div>' +
            '<input class="field mp-url" id="mp-url" value="' + esc(MP.url) + '" ' +
              'aria-label="Relay server address" spellcheck="false">' +
            '<div style="display:grid;gap:8px;margin-top:8px">' +
              '<button class="btn ghost" id="mp-test">' + ico('bolt') + ' Test the connection</button>' +
              '<button class="btn ghost" id="mp-reset">↺ Back to the default address</button>' +
            '</div>' +
            '<p class="tiny" style="line-height:1.6;margin-top:8px">Developer setting. ' +
            'The default is the KARTI server.</p>' +
          '</details>'
        : '<div style="height:18px"></div>') +
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
      /* a fresh game gets its own default table size — a stale pick from a
         bigger game must never carry across and open an odd-sized room */
      MP.wantCap = 0;
      rememberGame(g);
      keepScroll(mpScreen);
    };
  });

  /* the setup seat stepper (host picks the table size before opening) */
  wireSeatSetup(want);

  if ($('#mp-deck')){
    const opts = deckPicker($('#mp-deck'), MP.myDeckId || deckOptions()[0].id, o => {
      MP.myDeckId = o.id; keepScroll(mpScreen);
    });
    if (!MP.myDeckId) MP.myDeckId = opts[0].id;
  } else if (!MP.myDeckId){
    MP.myDeckId = deckOptions()[0].id;
  }

  /* ── the compact top row: two boxes that open only when tapped ── */
  const tog = (btnId, paneId) => {
    const btn = $('#' + btnId), pane = $('#' + paneId);
    if (!btn || !pane) return;
    btn.onclick = () => {
      const open = pane.hidden;
      pane.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('on', open);
      sfx(open ? 'ui.sheet' : 'ui.back', { gain:0.6 });
      if (open) paintRooms();          /* fill it the moment it is asked for */
    };
  };
  tog('mp-roomstog', 'mp-rooms');
  tog('mp-codetog', 'mp-codepane');
  const j2 = $('#mp-join2'), c2 = $('#mp-code2');
  if (j2 && c2){
    c2.oninput = () => { c2.value = cleanCode(c2.value); };
    j2.onclick = () => {
      const c = cleanCode(c2.value);
      if (c.length !== CODE_LEN){ K.toast('A room code is ' + CODE_LEN + ' characters.'); return; }
      start('join', c);
    };
  }
  roomsBubble();

  /* the relay box is developer-only now (see devTools()); everything below is
     guarded so a player's screen, which has none of it, cannot throw. */
  const urlIn = $('#mp-url');
  if (urlIn) urlIn.onchange = () => {
    const v = (urlIn.value || '').trim();
    MP.url = v || defaultURL();
    rememberRelay(v && v !== RELAY_URL ? v : '');
    keepScroll(mpScreen);
  };
  const rst = $('#mp-reset');
  if (rst) rst.onclick = () => { rememberRelay(''); MP.url = RELAY_URL; keepScroll(mpScreen); };
  const tst = $('#mp-test');
  if (tst) tst.onclick = testServer;

  $('#mp-open').onclick     = () => start('create', null, null, false, MP.wantGame);
  $('#mp-openpriv').onclick = () => start('create', null, null, true,  MP.wantGame);
  const joinBtn = $('#mp-join'), codeIn = $('#mp-code');
  if (joinBtn && codeIn){
    joinBtn.onclick = () => {
      const c = cleanCode(codeIn.value);
      if (c.length !== CODE_LEN){ K.toast('A room code is ' + CODE_LEN + ' characters.'); return; }
      start('join', c);
    };
    codeIn.oninput = () => { codeIn.value = cleanCode(codeIn.value); };
  }

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
  /* NEVER OPEN A DEAD ROOM. A gated game (see gameGated — its own contract
     refuses to start online) can be reached from more doors than the picker:
     a game file's own "play online" button, a stale stored pick, an old
     bookmark of state. Whatever the door, the answer is the same and it is
     the GAME's own words — a room of it would be a table whose Start button
     can never light. */
  if (intent === 'create'){
    const gGate = gameGated(cleanGame(game));
    if (gGate){
      setState('unreachable', gameMeta(cleanGame(game)).name + ' — ' + gGate);
      K.toast(gGate);
      return;
    }
  }
  /* ONE TAP, ONE CHAIR. The room rows repaint on every poll and nothing
     disables them, so a second tap on the same room used to open a SECOND
     socket to it: the relay saw the first die with no 'leave', held that
     chair for its reconnect grace, and the joiner came back in as a NEW
     player next to their own ghost — or bounced off "room full", off their
     own held chair. Same target, socket still connecting or already seated:
     there is nothing to do. */
  if (MP.ws && (MP.ws.readyState === 0 || MP.ws.readyState === 1) &&
      (MP.joined || MP.awaitJoin) &&
      ((intent === 'joinid' && id && MP.joinId === id) ||
       (intent === 'join' && code && MP.code === code)))
    return;
  /* WALKING OUT IS NOT DROPPING OUT. Every path that re-enters here while a
     seat is held — tapping another room, opening a room of your own, taking
     up an invitation — used to close the old socket cold. To the relay a cold
     close is a lost signal, so it HELD the old chair for a minute of
     reconnect grace: a ghost at that table, keeping its start hostage. Say
     'leave' on the way out and the chair is given up the moment we go. */
  if (MP.joined && MP.ws && MP.ws.readyState === 1){
    try { MP.ws.send(JSON.stringify({ t:'leave' })); } catch (e){}
    MP.heldSeat = null;            /* given up for good — nothing to reclaim */
  }
  /* RECLAIM YOUR OWN CHAIR, NEVER SIT NEXT TO YOUR OWN GHOST. If the room
     being joined is one we were just dropped from, go back in through
     'rejoin' with the held seat's own token: the relay puts us back in THAT
     chair (freeing the ghost) instead of seating us twice or refusing a
     "full" room. If the relay says no — chair swept, room gone — the
     onServerError fallback runs the ordinary join below instead. */
  const held = MP.heldSeat;
  if (held && held.token && held.code &&
      (Date.now() - held.at) < SEAT_RECLAIM_MS &&
      ((intent === 'joinid' && id && held.id === id) ||
       (intent === 'join' && code && held.code === code))){
    hardClose();
    presenceBeaconClose();
    MP.reclaim = { intent: intent, code: code, id: id, priv: !!priv,
                   game: game || null };
    MP.code = held.code; MP.token = held.token;
    MP.joinId = intent === 'joinid' ? (id || null) : null;
    MP.inviteId = null; MP.autoOpen = null;
    MP.wantPrivate = false; MP.private = false;
    MP.openedAt = 0; MP.tries = 0;
    MP.joined = true;              /* we hold a chair; the retry ladder applies */
    MP.joinHint = (intent === 'joinid' && game) ? cleanGame(game) : null;
    MP.myNonce = null; MP.peerNonce = null;
    openSocket('rejoin');
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
  /* a join is now IN FLIGHT for this target: the double-tap guard above holds
     the door only while this is true (or while we are genuinely seated), so a
     join the relay refused can always be retried by hand */
  MP.awaitJoin = intent === 'join' || intent === 'joinid';
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
    send({ t:'name', n: myPresenceName(), k: myLook() });
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
         an afterthought: "This is a oarty not duo". The HOST owns it — the
         setup screen's seat stepper writes MP.wantCap, and wantCapFor() clamps
         it into this game's real [min,max] range. With no pick it falls back to
         the game's own sensible default, so a fresh rummy room opens as "1 of 4"
         (growable to 12) rather than a wall of eleven empty chairs. The room is
         still a table filling up — "1 of N" — and nobody is ever obliged to
         fill it; the host starts the moment enough are ready.
         An older relay ignores `seats` and answers without it, which is how
         `created` spots one and says so; the relay clamps the number to the
         same range, so a value out of range fails loudly there, never silently. */
      const LB = gameLobby(MP.wantGame || 'cards');
      const want = wantCapFor(MP.wantGame || 'cards');
      MP.wantSeats = want;
      MP.variant = MP.variant || null;
      const msg = { t:'create', private: !!MP.wantPrivate,
                    game: MP.wantGame || 'cards' };
      if (want > 2) msg.seats = want;
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
  MP.awaitJoin = false;
  /* the relay's hold on our chair starts roughly now — restart the local
     clock the seat-reclaim window (see start()) is measured against */
  if (MP.heldSeat) MP.heldSeat.at = Date.now();
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

/* ── how far away is the server, really ──────────────────────────────
   The keep-alive already goes out and comes back; nothing was timing it.
   We stamp the moment we send and subtract on the pong, which measures
   the whole path a MOVE takes — phone, wifi or mobile, out through the
   funnel, the relay's own work, and back. That last part is under a
   millisecond, so what this really reads is the network, which is the
   only part we cannot fix from here. Kept as a small ring so one bad
   sample on a crowded wifi cannot masquerade as the truth: the median
   is the number worth believing, and n tells you how much to. */
const RTT_KEEP = 20;
function noteSent(){ MP.pingAt = (typeof performance !== 'undefined' && performance.now)
                                  ? performance.now() : Date.now(); }
function noteRtt(){
  if (!MP.pingAt) return;
  const now = (typeof performance !== 'undefined' && performance.now)
                ? performance.now() : Date.now();
  const ms = Math.round(now - MP.pingAt);
  MP.pingAt = 0;
  /* a sleeping phone resumes and reports a gap of minutes; that is the
     screen having been off, not the network, so it is not a sample */
  if (ms < 0 || ms > 10000) return;
  MP.rtts.push(ms);
  if (MP.rtts.length > RTT_KEEP) MP.rtts.shift();
}
function pingStats(){
  const a = MP.rtts.slice().sort((x, y) => x - y);
  if (!a.length) return { n:0, last:null, med:null, best:null, worst:null };
  return { n:a.length, last:MP.rtts[MP.rtts.length - 1],
           med:a[a.length >> 1], best:a[0], worst:a[a.length - 1] };
}
/* The same relay, over plain HTTP. The game socket only exists while you
   are actually playing online, so from a Settings screen there is usually
   nothing open to time — and "come back when you are in a game" is a
   useless answer to "how fast is my connection". This walks the identical
   network path (same host, same funnel, same phone radio) and reuses one
   kept-alive connection, so after the first request the handshake is paid
   and what is left is the round trip. The first request is thrown away
   for exactly that reason. */
function healthURL(){
  let u = defaultURL();
  u = u.replace(/^ws/i, 'http');                 /* ws->http, wss->https */
  return u.replace(/\/ws(\?.*)?$/i, '/health');
}
function measureHTTP(n, cb){
  const url = healthURL(), out = [];
  let i = 0;
  const one = () => {
    const t0 = (typeof performance !== 'undefined' && performance.now)
                 ? performance.now() : Date.now();
    fetch(url, { cache:'no-store', credentials:'omit' })
      .then(r => r.text())
      .then(() => {
        const t1 = (typeof performance !== 'undefined' && performance.now)
                     ? performance.now() : Date.now();
        /* i === 0 is the handshake, not the distance */
        if (i > 0) out.push(Math.round(t1 - t0));
        if (++i > n){ done(); return; }
        setTimeout(one, 120);
      })
      .catch(() => done());
  };
  const done = () => {
    if (!cb) return;
    const a = out.slice().sort((x, y) => x - y);
    cb(a.length ? { n:a.length, last:out[out.length - 1], med:a[a.length >> 1],
                    best:a[0], worst:a[a.length - 1], via:'http' }
                : { n:0, last:null, med:null, best:null, worst:null, via:'http' });
  };
  one();
}

/* A burst, for when somebody is actually looking at the number. The
   keep-alive is every 20s, which is right for a keep-alive and useless
   for a reading you want now. Falls through to HTTP when no game socket
   is open, which is the ordinary case from a menu. */
function measure(n, cb){
  n = Math.max(1, Math.min(12, n | 0 || 8));
  if (!MP.ws || MP.ws.readyState !== 1){ measureHTTP(n, cb); return; }
  let sent = 0;
  const t = setInterval(() => {
    if (!MP.ws || MP.ws.readyState !== 1 || sent >= n){
      clearInterval(t);
      if (sent >= n && cb) setTimeout(() => cb(
        Object.assign(pingStats(), { via:'ws' })), 400);
      else if (cb) cb(Object.assign(pingStats(), { via:'ws' }));
      return;
    }
    sent++; noteSent(); send({ t:'ping' });
  }, 250);
}

function startPing(){
  stopPing();
  MP.lastTick = Date.now();
  MP.pingTimer = setInterval(() => {
    const now = Date.now();
    const frozen = now - MP.lastTick > PING_EVERY * 2;
    MP.lastTick = now;
    if (!MP.ws || MP.ws.readyState !== 1) return;
    /* WAKING UP IS NOT TIMING OUT. On a backgrounded phone (iOS especially)
       these timers freeze; the first tick after the screen comes back used to
       see a lastPong minutes old and close a socket that was often perfectly
       alive — the client kicking ITSELF, and the relay then holding its chair
       as a ghost. A tick that arrives late by beats was a sleeping phone, not
       a silent server: reset the deadline clock and ASK (ping) instead of
       judging on silence we slept through. If the socket really is dead, the
       ping goes nowhere and the very next tick closes it — the reconnect
       ladder then reclaims the same seat by token, exactly as before. */
    if (frozen){
      MP.lastPong = now;
      noteSent();
      send({ t:'ping' });
      return;
    }
    if (now - MP.lastPong > PONG_DEADLINE){
      try { MP.ws.close(); } catch (e){}     /* triggers the reconnect path */
      return;
    }
    noteSent();
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

/* ═══════════════════════════════════════════════════════════════════
   STARTING A ROOM — AND THE PRIVATE PER-SEAT DEAL
   ───────────────────────────────────────────────────────────────────
   Every game the shared lobby can seat starts the same way: the host
   taps start and the relay begins the room off ONE broadcast seed. A
   secret derived from that seed is a secret only by politeness, which
   is fine for a shuffled stock nobody reads ahead (rummy, skarta) and
   FATAL for a hidden hand (poker's hole cards, 31's three).

   So a hidden-hand game publishes planDeal(opts) on its online contract.
   It returns { items, each } — a POOL of opaque values and how many go
   to each seat — and the relay shuffles that pool with its OWN entropy
   and pushes each seat, PRIVATELY, only the items that seat holds
   ({t:'mine'}). The relay never learns a hole card from a role; the
   client that receives {t:'mine'} treats `d` as its own hand and never
   puts it on the shared wire. A game with no planDeal sends no deal and
   the start is byte-identical to before (board games, skarta, rummy…).

   planDeal is opt-in and additive: an older relay that ignores `deal`,
   and a game that publishes none, both behave exactly as they did. */
function startDeal(){
  const api = partyAPI();
  if (!api || typeof api.planDeal !== 'function') return null;
  let d = null;
  try {
    d = api.planDeal({ seats: MP.size, variant: MP.variant, rules: MP.rules });
  } catch (e){ d = null; }
  if (!d) return null;
  /* AUTHORITATIVE, SEAT-ADDRESSED DEAL. A game whose seats get DIFFERENT
     payloads that only the host can pair — and where one seat (the judge)
     gets a secret nobody else may see (Il-Misteru's solution) — returns
     { mine:{ seat:payload } } instead of a pool. The relay does not shuffle
     it; it addresses each opaque blob to its seat's bit. Passed straight
     through: this file never reads a payload, exactly as with a pool item. */
  if (d.mine && typeof d.mine === 'object') return { mine: d.mine };
  /* THE POOL SHAPE. { items, each } — a pool the relay shuffles and slices. */
  if (!Array.isArray(d.items) || !d.items.length) return null;
  const each = Math.max(1, d.each | 0 || 1);
  return { items: d.items, each };
}
function sendStart(){
  const deal = startDeal();
  const msg = { t:'start' };
  if (deal) msg.deal = deal;             /* opt-in; omitted for board games */
  send(msg);
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
  if (MP.ws && MP.ws.readyState === 1){
    try { MP.ws.send(JSON.stringify({ t:'leave' })); } catch (e){}
    /* the 'leave' actually went out: the chair is given up, not held */
    MP.heldSeat = null;
  }
  /* No live socket to say 'leave' on? Then the relay never heard us go and is
     holding the chair for its reconnect grace. MP.heldSeat is deliberately
     KEPT: tapping the same room again inside that minute reclaims our own
     chair (see start()) instead of bouncing off "room full" — off a chair
     that is actually ours. */
  hardClose();
  stopWaitClock();
  MP.code = null; MP.token = null; MP.live = false; MP.joined = false;
  MP.joinId = null; MP.nameProbe = false; MP.autoOpen = null;
  MP.awaitJoin = false; MP.reclaim = null;
  MP.wantPrivate = false; MP.private = false; MP.openedAt = 0;
  MP.peerHere = false; MP.peerList = null; MP.lastSeq = 0; MP.tries = 0;
  /* the pot record and the play-money stack go with the room. A leave
     that arrives here with the game still LIVE is a voluntary walk-out
     (the game's own Leave button routes through backToRooms → here), so
     it forfeits out loud; every table-level death already refunded via
     stakeAbort() in tableStop/endMatch before reaching this line. */
  if (MP.live) stakeForfeit();
  stakeCleanup();
  /* the table, put away with the room it belonged to */
  MP.size = 2; MP.mySeat = 0; MP.roster = null; MP.iAmReady = false;
  MP.began = null; MP.panel = null; MP.aiSeat = -1; MP.showRules = false;
  MP.wantSeats = 0; MP.variant = null; MP.rules = null; MP.askBack = null;
  MP.privateHook = null; MP.pendingMine = null; MP.whisperHook = null;
  if (MP.unMove){ try { MP.unMove(); } catch (e){} MP.unMove = null; }
  if (MP.state !== 'unreachable') setState('idle');
}

/* ── what the server says ─────────────────────────────────────────── */
function onServer(m){
  switch (m.t){
    case 'pong':
      MP.lastPong = Date.now();
      noteRtt();
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
      MP.reclaim = null;
      MP.heldSeat = MP.token
        ? { code: MP.code, token: MP.token, id: null, at: Date.now() } : null;
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
      if (usesTableLobby()) return; /* the table paints its own status line */
      setState('waiting', MP.private
        ? 'Private ' + gameMeta(MP.game).name.toLowerCase() +
          ' room open — nobody can see it but you.'
        : 'Your ' + gameMeta(MP.game).name.toLowerCase() +
          ' room is in the list. Waiting for someone to join…');
      return;

    case 'joined':
      MP.host = false; MP.code = m.code; MP.token = m.token || null;
      MP.joined = true; MP.lastSeq = m.seq || 0; MP.tries = 0;
      MP.reclaim = null; MP.awaitJoin = false;
      /* remember the chair by BOTH handles a re-tap could arrive with: the
         room-list id we tapped (joinid) and the room code itself (join) */
      MP.heldSeat = MP.token
        ? { code: MP.code, token: MP.token, id: MP.joinId, at: Date.now() } : null;
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
      if (usesTableLobby()){
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
      /* THE RELAY SAYS WHICH CHAIR IS OURS AND HOW BIG THE TABLE IS. Adopt
         them: a seat RECLAIM (rejoining a room after a bounce, from a fresh
         tap on its row) arrives with this session's own idea of the table
         still at its defaults, and drawing chair 1 of 2 for seat 5 of 8 is
         how a reclaimed lobby lies. An older relay sends neither field and
         nothing changes. */
      if (typeof m.seats === 'number' && m.seats >= 2) MP.size = m.seats | 0;
      if (typeof m.seat === 'number') MP.mySeat = m.seat | 0;
      if (typeof m.variant === 'string') MP.variant = m.variant;
      MP.reclaim = null;                       /* the chair is ours again */
      if (MP.heldSeat) MP.heldSeat.at = Date.now();
      /* back at a TABLE that has not begun: repaint the lobby now; the roster
         the relay sends right behind this message repaints it again with the
         full truth. Mid-game and the duel path are exactly as they were. */
      if (!MP.live && !MP.boardLive && usesTableLobby()) lobby();
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
      if (usesTableLobby()){
        /* 'joined' is a NEW chair filling; 'rejoined' is a HELD chair coming
           back. The two must not share a line: a rejoin has to CLEAR the
           "lost signal — holding their chair" warning that tableSeatGone put
           up, or the note sits on everyone else's screen forever while the
           player is back and playing. That missing clear was the whole bug. */
        if (m.state === 'joined') K.toast('Somebody sat down.');
        else if (m.state === 'rejoined'){
          if (MP.live) tableSeatBack(m.seat);
          else K.toast('Somebody sat down.');
        }
        else if (m.state === 'left'){
          if (MP.live) tableSeatGone(m.seat, 'left');
          else tableChairFreed(m.seat);
        }
        /* 'dropped' needs nothing here in the lobby: the relay follows it with
           a fresh {t:'table'} that marks the chair held, and that roster is
           the thing this screen believes. Mid-game it is the game's business. */
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

    /* ── the private per-seat deal ──
       The relay pushed THIS seat, and only this seat, the items it holds.
       It is addressed to us by seat, delivered on our own replay bit, and
       must be treated as our own hand and NEVER re-broadcast. Route it to
       the running game's private hook so it can feed its engine's
       DEALERS.private. An older relay never sends this; a game that
       published no private hook simply drops it. */
    case 'mine':
      onMine(m);
      return;

    /* ── a private word addressed to this seat (relay's `chat` channel) ──
       Never buffered, never broadcast: the relay carried it to this seat and
       nobody else. Hand it to the running game's whisper hook (IL-MISTERU's
       refuter→suggester card reveal). Our own echo (m.s === our seat) is the
       delivery receipt — a game that does not want to hear itself can ignore
       it, but we still deliver it so the receipt is not silently swallowed. */
    case 'chat':
      if (MP.live && MP.whisperHook && typeof m.s === 'number'){
        MP.whisperHook(m.s, typeof m.x === 'string' ? m.x : '',
                       typeof m.ch === 'string' ? m.ch : '');
      }
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

    /* FRIENDS social message arriving on the ROOM socket (e.g. an activity
       change while you sit in a lobby). Same single hand-off as the beacon. */
    case 'friend':
      if (typeof MP.friendHook === 'function'){ try { MP.friendHook(m); } catch (e){} }
      return;

    case 'relay':
      if (typeof m.n === 'number' && m.n > MP.lastSeq) MP.lastSeq = m.n;
      onPeer(m.d, m.s);
      return;

    case 'closed':
      MP.token = null;
      MP.heldSeat = null; MP.reclaim = null;   /* that chair is gone for good */
      if (MP.live) endMatch(m.why || 'The server closed the room.');
      else setState('stopped', m.why || 'The server closed the room.');
      return;

    case 'error':
      onServerError(m.why || '');
      return;
  }
}
function onServerError(why){
  MP.awaitJoin = false;            /* whatever was in flight, this answered it */
  /* A REFUSED SEAT RECLAIM IS NOT AN ERROR THE PLAYER SEES. We tried to take
     back a chair we thought the relay was still holding ('rejoin' with the
     old seat token, see start()). The relay saying no — the chair was swept,
     the room is gone, the token is no longer ours — only means the ordinary
     way in is the right way now, so take it, silently. */
  if (MP.reclaim && (/not yours/i.test(why) || /No room with that code/i.test(why))){
    const r = MP.reclaim;
    MP.reclaim = null; MP.heldSeat = null;
    MP.token = null; MP.code = null; MP.joined = false; MP.tries = 0;
    start(r.intent, r.code, r.id, r.priv, r.game);
    return;
  }
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
    MP.token = null; MP.code = null; MP.joined = false; MP.heldSeat = null;
    setState('unreachable', 'No room with that code. Check it and try again.');
  } else if (/two players/i.test(why)){
    /* The relay says this for a full DUEL and for any room whose game has
       already started — including a table you left mid-hand. Said honestly:
       a chair is only ever held through a dropped signal; walking out gives
       it up, and a started table takes nobody new. */
    MP.token = null; MP.joined = false;
    setState('unreachable', 'That room is full, or its game has already started. A ' +
      'started table takes nobody new — a chair is only held through a lost signal, ' +
      'and a chair you leave on purpose is given up for good.');
  } else if (/busy/i.test(why)){
    setState('unreachable', 'The server is busy right now. Try again in a minute.');
  } else if (/not yours/i.test(why)){
    MP.token = null; MP.heldSeat = null;
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

  /* A ready-lobby game is a different room, not merely a bigger one. The
     original card duel, chess and dama keep their old paired waiting screen. */
  if (usesTableLobby()){ tableLobby(); return; }

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
      /* who is actually about, in the open — not behind a fold. Repainted in
         place whenever the relay says the answer moved. */
      '<div id="mp-around"></div>' +
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
    paintRoomAround();
    whoAsk();                    /* freshen the strip; floored, never a poll */
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
  /* THE ROSTER IS THE ROOM'S AUTHORITY ON WHICH GAME IT IS, TOO. The host can
     change the whole game from the lobby (setgame), and the relay re-broadcasts
     this same roster carrying the new `game`. Adopt it FIRST — before the seat
     count and variant below — so a single repaint transitions every seated
     player in place: their screen becomes the new game's lobby without leaving
     the room. tableLobby() re-resolves gameLobby(MP.game) on every paint, so
     the contract, the chairs, the rules panel and the mode picker all follow.
     A roster with no game field (an older relay) leaves ours untouched. */
  if (typeof m.game === 'string'){
    const g = cleanGame(m.game);
    if (g !== MP.game){
      MP.game = g;
      MP.filter = g;
      /* a fresh game gets its own mode; do not carry a stale one across the
         switch. The relay has already reset its side to the game's default. */
      MP.variant = null; MP.rules = null;
      MP.panel = null;                 /* close any open drawer from the old game */
    }
  }
  if (typeof m.seats === 'number' && m.seats >= 2) MP.size = m.seats | 0;
  /* THE ROSTER IS THE ROOM'S AUTHORITY ON ITS MODE TOO. The host can change
     the variant from the lobby (setvariant), and the relay re-broadcasts the
     same roster carrying the new `variant`/`rules`. Adopt them so every phone
     — host and not — follows the change: roomVariant() consumers read MP.variant
     live (see js/klabb.js), and the seat count above already came from the same
     message, so a mode that narrowed the table cannot leave MP.size stale. A
     roster with no variant field (an older relay) leaves ours untouched. */
  if (typeof m.variant === 'string') MP.variant = m.variant;
  else if (m.variant === null && 'variant' in m) MP.variant = null;
  if ('rules' in m) MP.rules = (m.rules && typeof m.rules === 'object') ? m.rules : null;
  const mine = m.who[MP.mySeat];
  MP.iAmReady = !!(mine && mine.ready);
  if (MP.live || MP.boardLive) return;    /* the board is up; nothing to repaint */
  /* THE TABLE TURNED STAKED UNDER MY READY BIT. A ready said to a friendly
     table is not consent to an ante this wallet cannot pay — take the bit
     back, out loud, before the host can start on it. The roster that
     answers repaints this same screen with the refusal and the shortfall. */
  const stg = stakeRoom();
  if (stg.staked && MP.iAmReady && stakeXP() && !KARTI_XP.canStake(stg.ante)){
    send({ t:'ready', on:false });
    K.toast(T('The table now plays for ' + stg.ante + ' chips and you are short — your ready was taken back.',
              'Il-mejda issa tilgħab għal ' + stg.ante + ' ċips u jonqsuk — ir-ready tiegħek tneħħa.'));
  }
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
           waiting:MP.iAmReady ? 0 : 1, who,
           /* THIS ROSTER IS A GUESS, AND THE SCREEN HAS TO SAY SO.
              It is what we draw before the relay has told us anything: one
              chair, ours, filled in from what we asked for. Left unmarked it
              is indistinguishable from a real answer, so the lobby happily
              said "your table is in the list" about a table the server had
              never heard of — and then a machine added to it went nowhere,
              because the message that adds one goes to the relay. A player
              seeing a confident empty room and an ignored machine has no way
              to know the connection is the problem. */
           local:true };
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
    link: w.bot ? 'cpu' : 'net',
    /* the relay now carries each seat's account photo: pv = photo version
       (0/absent = no photo), av = account key the photo URL is built from.
       This is what lets the lobby draw EVERYONE'S face, not just your own. */
    pv: w.pv || 0,
    av: w.av || '',
    /* the face/ring/badge THEY chose, straight from the relay. Absent for
       a phone on an older build, which simply falls back to the
       name-coloured default it always drew. */
    look: (w.k && typeof w.k === 'object') ? w.k : null
  }));
}

/* Can this table go, and if not, in WORDS.
   The game's own canStart() answers first — it knows things the lobby does
   not, like whether a partnership game needs an even number. Ours is only the
   floor underneath it. */
function tableCanStart(){
  const LB = gameLobby(MP.game);
  const all = rosterSeats();
  /* A GHOST CHAIR MUST NOT HOLD THE START. A seat whose person has lost
     signal ('here' false) is kept for them by the relay's reconnect grace —
     but a chair with no live socket in it cannot tap Ready, so counting it
     as "somebody who is not ready yet" waits on a thing that cannot happen,
     and the host's Start goes dead for the whole table. The relay's own
     start gate already skips exactly these seats (its unready() counts only
     live sockets), so the honest gate here is the PRESENT people: absent
     chairs are not ready AND not blocking. The relay frees a chair whose
     minute of grace runs out, and the roster it pushes repaints this. */
  const seats = all.filter(s => s.here);
  const away = all.length - seats.length;
  const awayNote = away
    ? ' (' + away + (away > 1 ? ' chairs are' : ' chair is') +
      ' held through a lost signal — they do not hold the start up, and a ' +
      'chair that stays silent frees itself in about a minute)'
    : '';
  if (seats.length < 2)
    return { ok:false, why:'A game needs somebody to play it with. Ask a friend' +
                           (LB.levels.length ? ', or put a machine in a chair.' : '.') +
                           awayNote };
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
  if (!verdict.ok && away)
    verdict = { ok:false, why: String(verdict.why || '') + awayNote };
  return verdict;
}

/* ═══════════════════════════════════════════════════════════════════
   THE STAKES — FRIENDLY OR FOR CHIPS, the host's call
   ───────────────────────────────────────────────────────────────────
   "Make the host make the game FRIENDLY or STAKE. All party games can
   bet to enter." The pick travels exactly the way the Rules pick does:
   inside the relay's OPAQUE `rules` blob, which the server stores and
   echoes in every roster without ever reading a field of it (its own
   docstring names "a stake" as the intended cargo). Every phone adopts
   the roster's rules in onRoster(), so every phone agrees — no new
   wire message, no game reads the key, nothing about play changes.

   THE MONEY only ever moves through js/progress.js's guarded doors:
     stake(ante,{id})    each HUMAN seat antes its own wallet when the
                         relay says 'began' — the id is code:seed, so a
                         replayed start can never ante twice
     payout(pot,{id})    the winner's phone pays itself the pot, once
     refundStake(...)    a draw, or a table that died before a result
   Machines never ante (they have no wallet) and can never collect:
   the pot is humans × ante, said out loud in the lobby before anyone
   readies up. A broke player is refused the READY button — with the
   shortfall named and the free lane offered — never locked out of the
   room. Friendly card tables (poker, 21·31) are handed the economy's
   PLAY-MONEY stack (openTableStack) for the sitting: betting is the
   game, the wallet is never on the table.
   ═══════════════════════════════════════════════════════════════════ */
/* the ante ladder. Small and fixed on purpose — free text is how a fat
   finger loses a week of chips. 25 ≈ one friendly win (the flutter),
   50 ≈ a solid win (the default), 100 ≈ an evening's earnings, 250 ≈
   the daily spin's jackpot — a genuinely dangerous table. All of them
   are rebuildable from the daily spin (avg ≈ 87/day) inside a day or
   three, so a lost pot stings without ever stranding anybody. */
const ANTE_STEPS = [25, 50, 100, 250];
const ANTE_DEFAULT = 50;
/* the card tables whose BETTING IS THE GAME — a friendly sitting at one
   of these opens the economy's play-money stack instead of the wallet */
const STAKE_CARD_TABLES = ['poker', 'cards2131'];

/* what this room is playing for, read LIVE off the roster's rules blob */
function stakeRoom(){
  const s = MP.rules && MP.rules.stake;
  if (!s || typeof s !== 'object') return { staked:false, ante:0 };
  const a = Math.floor(Number(s.ante));
  if (s.mode !== 'chips' || !isFinite(a) || a < 1 || a > 100000)
    return { staked:false, ante:0 };
  return { staked:true, ante:a };
}
function stakeXP(){ return (window.KARTI_XP && KARTI_XP.stake) ? KARTI_XP : null; }
function stakeBal(){
  const XP = stakeXP();
  try { return XP ? (XP.chips() | 0) : 0; } catch (e){ return 0; }
}
/* the human chairs — machines have no wallet, so they are not in the pot */
function stakeHumans(){
  return rosterSeats().filter(s => s.kind === 'human').length;
}
/* the HOST changes the room's stakes: merged into the same opaque rules
   blob the variant pick rides in, sent as the same `setvariant` message
   the Rules drawer already sends. The roster that comes back carries the
   merged blob and repaints every phone — nobody is kicked, and a game's
   own preset keys ride alongside untouched. */
function stakeSend(next){
  const rules = Object.assign({}, MP.rules || {});
  if (next && next.staked) rules.stake = { mode:'chips', ante: next.ante | 0 };
  else delete rules.stake;
  const msg = { t:'setvariant', variant: MP.variant || null };
  if (Object.keys(rules).length) msg.rules = rules;
  send(msg);
}
/* the same painted chip pile the reward screens use — art/ui/cur-chip-N,
   the tier picked by the amount (game.js curArt keeps the same table) */
function stakeChipArt(n, cls){
  const t = [0, 40, 150, 400];
  let i = 1;
  for (let k = 0; k < t.length; k++) if ((n | 0) >= t[k]) i = k + 1;
  return '<img class="mp-curart' + (cls ? ' ' + cls : '') + '" alt="" aria-hidden="true" ' +
    'src="art/ui/cur-chip-' + Math.min(4, Math.max(1, i)) + '.png" onerror="this.remove()">';
}
function stakeChipIco(cls){
  try { if (window.KARTI_XP && KARTI_XP.chipICO) return KARTI_XP.chipICO('', cls); } catch (e){}
  return ico('star');
}

/* ── the match itself ─────────────────────────────────────────────
   ARM at 'began': my own ante leaves my own wallet, under the match id
   (code:seed) so a buffered or replayed start antes exactly once. If the
   wallet came up short in the race between READY and START (a box bought
   in another tab), the seat still plays — marked unpaid, and a win pays
   the pot MINUS its own missing ante, so the books stay honest. */
function stakeArm(m){
  MP.stakeLive = null;
  const XP = stakeXP();
  if (!XP) return;
  const stk = stakeRoom();
  const id = String(MP.code || 'room') + ':' + ((m && m.seed) >>> 0);
  if (!stk.staked){
    /* FRIENDLY CARD TABLE → the play-money stack, never the wallet.
       Ephemeral, per-sitting, worthless — see progress.js §7c. */
    if (STAKE_CARD_TABLES.indexOf(MP.game) >= 0){
      try { XP.openTableStack(MP.game); } catch (e){}
    }
    return;
  }
  const humans = stakeHumans() || 1;
  let paid = false;
  try {
    const r = XP.stake(stk.ante, { id });
    /* 'already' = this exact match anted on a previous pass — still paid */
    paid = !!(r && (r.ok || r.why === 'already'));
  } catch (e){}
  MP.stakeLive = {
    ante: stk.ante, humans, pot: stk.ante * humans,
    id, paid, settled: false
  };
  if (!paid)
    K.toast(T('Your chips came up short — you play this one un-anted, and a win pays the pot less your share.',
              'Iċ-ċipep ma laħqux — tilgħab bla ante, u rebħa tħallas il-pot mingħajr sehmek.'));
}
/* SETTLE, once, from the result the game itself announced (the tone on
   its own finish card). Idempotent twice over: the local `settled` flag,
   and progress.js's id guard under it. Returns what happened so the
   result card can show the pot landing. */
function stakeSettle(tone){
  const L = MP.stakeLive;
  if (!L || L.settled) return null;
  L.settled = true;
  const XP = stakeXP();
  if (!XP) return null;
  try {
    if (tone === 'win'){
      /* winner takes the pot — less its own ante if that ante never
         actually left this wallet (the short-race seat above) */
      const pot = L.paid ? L.pot : Math.max(0, L.pot - L.ante);
      if (pot > 0) XP.payout(pot, { id: L.id });
      return { kind:'win', pot, ante:L.ante, humans:L.humans };
    }
    if (tone === 'draw'){
      if (L.paid) XP.refundStake(L.ante, { id: L.id });
      return { kind:'draw', pot:L.pot, ante:L.ante, humans:L.humans };
    }
    /* a loss costs exactly the ante, which already left at 'began' */
    return { kind:'lose', pot:L.pot, ante:L.ante, humans:L.humans };
  } catch (e){ return null; }
}
/* A TEAM POT — the same settle, divided.

   stakeSettle() pays the WHOLE pot to the phone that says it won, which is
   exactly right when there is one winner and catastrophic when there is a
   side. SUSPETT ends with the raħal or the klikka winning together, often
   six or more seats at once: every one of those phones calling stakeSettle
   would call payout(pot) for the full amount, and the room would walk away
   with six times the chips that were ever anted. Chips minted out of
   nothing, from a wallet nobody audits.

   So a team game names its winning SEATS and this pays only this phone's
   share. The split has to be identical on every phone without any of them
   talking to each other, so it is pure arithmetic on a list they all agree
   on: floor the even share, and hand the remainder — never more than
   seats-1 chips — to the LOWEST winning seat, so the shares add up to the
   pot exactly rather than quietly losing a chip to rounding on every game.

   A seat that is not in the winning list settles as a loss: its ante left
   at 'began' and stays gone, which is what losing a staked game means. */
function stakeSettleTeam(tone, winnerSeats, mySeat){
  const L = MP.stakeLive;
  if (!L || L.settled) return null;
  const seats = (Array.isArray(winnerSeats) ? winnerSeats : [])
    .map(n => n | 0).filter((n, i, a) => n >= 0 && a.indexOf(n) === i)
    .sort((a, b) => a - b);
  /* MP.seat does not exist — the field is mySeat, and reading the wrong one
     yielded undefined, which is in no winner list, so the winning phone
     settled itself as a LOSER and the pot stayed unpaid. Caught by the
     pre-party audit before suspett became its first caller. */
  const me = mySeat == null ? (MP.mySeat | 0) : (mySeat | 0);
  /* No winners named, or a shape we do not understand, is not something to
     guess at with real chips: fall back to the abort rule, where every ante
     simply comes home. Refusing to pay is recoverable; overpaying is not. */
  if (!seats.length){ stakeAbort(); return null; }
  const iWon = seats.indexOf(me) >= 0;
  if (tone === 'draw' || !iWon){
    /* the single-winner settle already says both of these correctly */
    return stakeSettle(iWon ? 'draw' : 'lose');
  }
  L.settled = true;
  const XP = stakeXP();
  if (!XP) return null;
  try {
    /* the same short-race correction stakeSettle makes: a seat whose ante
       never actually left this wallet must not be paid its own share of it */
    const pot = L.paid ? L.pot : Math.max(0, L.pot - L.ante);
    const base = Math.floor(pot / seats.length);
    const share = base + (me === seats[0] ? pot - base * seats.length : 0);
    if (share > 0) XP.payout(share, { id: L.id });
    return { kind:'win', pot:share, wholePot:pot, winners:seats.length,
             ante:L.ante, humans:L.humans, team:true };
  } catch (e){ return null; }
}
/* THE TABLE DIED BEFORE A RESULT — a bail, a desync, a dead connection.
   Nobody won, so nobody pays: the ante comes home. Idempotent through
   the same id guard, and a no-op for friendly tables and settled pots. */
function stakeAbort(){
  const L = MP.stakeLive;
  if (!L || L.settled) return;
  L.settled = true;
  const XP = stakeXP();
  if (XP && L.paid){
    try {
      XP.refundStake(L.ante, { id: L.id });
      K.toast(T('No result — your ' + L.ante + '-chip ante came back.',
                'L-ebda riżultat — l-ante ta’ ' + L.ante + ' ċips reġa’ lura.'));
    } catch (e){}
  }
}
/* WALKING OUT of a live staked game is a forfeit, not a refund — the
   ante stays in the pot the others are still playing for. Said out loud
   at the moment it happens, never discovered later. */
function stakeForfeit(){
  const L = MP.stakeLive;
  if (!L || L.settled) return;
  L.settled = true;
  K.toast(T('You left a staked game — your ' + L.ante + '-chip ante stays in the pot.',
            'Tlaqt minn logħba bl-imħatra — l-ante tiegħek jibqa’ fil-pot.'));
}
/* the room is behind us: drop the pot record and put the play-money
   stack away with it (a fresh sitting deals a fresh stack) */
function stakeCleanup(){
  MP.stakeLive = null;
  try {
    if (window.KARTI_XP && KARTI_XP.tableStack && KARTI_XP.tableStack(MP.game))
      KARTI_XP.closeTableStack(MP.game);
  } catch (e){}
}

/* ── the pot, landing on the game's own finish card ────────────────
   Every shared-lobby game already says how it ended through
   KARTI_PARTY.ui.result(ctx,{tone}) — the same door progress.js pays
   the play reward through. Wrapped ONCE, additively: the original runs
   first and draws its card, then the pot is settled off the tone and
   painted onto that same card. A friendly table, an offline game, a
   second fire — all no-ops (stakeLive is null or already settled). */
function stakeWireResult(tries){
  const P = window.KARTI_PARTY;
  if (!P || !P.ui || typeof P.ui.result !== 'function'){
    if ((tries | 0) < 40) setTimeout(() => stakeWireResult((tries | 0) + 1), 500);
    return;
  }
  if (P.ui.result.__kxStake) return;
  const orig = P.ui.result;
  const wrapped = function(ctx, o){
    const r = orig.apply(this, arguments);
    try { stakeCeremony(ctx, o && o.tone); } catch (e){}
    return r;
  };
  wrapped.__kxStake = 1;
  P.ui.result = wrapped;
}
function stakeCeremony(ctx, tone){
  if (!MP.stakeLive) return;
  const res = stakeSettle(tone === 'win' ? 'win' : tone === 'draw' ? 'draw' : 'lose');
  if (!res) return;
  const card = ctx && ctx.root && ctx.root.querySelector && ctx.root.querySelector('.pt-card');
  if (!card) return;
  const el = document.createElement('div');
  el.className = 'pt-pot ' + res.kind;
  el.innerHTML =
    res.kind === 'win'
      ? stakeChipArt(res.pot) +
        '<span><b>+' + res.pot + '</b>' +
        '<i>' + esc(T('THE POT — ' + res.humans + ' antes of ' + res.ante,
                      'IL-POT — ' + res.humans + ' anti ta’ ' + res.ante)) + '</i></span>'
    : res.kind === 'draw'
      ? stakeChipArt(res.ante) +
        '<span><b>+' + res.ante + '</b>' +
        '<i>' + esc(T('A DRAW — EVERY ANTE WENT BACK', 'DRAW — L-ANTI KOLLHA REĠGĦU LURA')) + '</i></span>'
      : stakeChipArt(res.ante, 'dim') +
        '<span><b>&minus;' + res.ante + '</b>' +
        '<i>' + esc(T('YOUR ANTE WENT TO THE WINNER', 'L-ANTE TIEGĦEK MAR GĦAND IR-REBBIEĦ')) + '</i></span>';
  const acts = card.querySelector('.pt-acts');
  if (acts) card.insertBefore(el, acts); else card.appendChild(el);
}
/* what the running game may read of the stakes — mode and pot, never a
   verb. A game file that wants to say "playing for a real pot" reads
   this; nothing here can move a chip. */
function stakeInfo(){
  const stk = stakeRoom();
  const L = MP.stakeLive;
  return {
    staked: stk.staked, ante: stk.ante,
    humans: L ? L.humans : stakeHumans(),
    pot: L ? L.pot : stk.ante * stakeHumans(),
    live: !!L, settled: !!(L && L.settled)
  };
}

/* ── the host's drawer ─────────────────────────────────────────────
   Two ways to play, one tap each, and the ante ladder under the second.
   A step the host's own wallet cannot cover is drawn disabled with the
   balance named — a host must never set a table they cannot sit at. */
function stakeDrawer(stk){
  const bal = stakeBal();
  const cur = stk.staked ? stk.ante : 0;
  return '<div class="mp-drawer" id="mp-stake">' +
    '<div class="mp-dhd"><b>' + esc(T('The stakes', 'L-imħatri')) + '</b>' +
      '<button class="mp-dx" id="mp-stakex" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
        ico('close') + '</button></div>' +
    '<p class="mp-dp">' + esc(T(
      'Friendly is free and still pays a little for playing. For chips, every player antes into a pot and the winner takes it all — machines never ante.',
      'Bi ħbiberija b’xejn u xorta tħallas ftit. Għaċ-ċips, kull plejer jitfa’ ante f’pot u ir-rebbieħ jieħu kollox — il-magni qatt ma jitfgħu.')) +
    '</p>' +
    '<button class="mp-lv' + (!stk.staked ? ' on' : '') + '" data-stakemode="free">' +
      ico('shield') +
      '<span><b>' + esc(T('Friendly', 'Bi ħbiberija')) + '</b>' +
      '<i>' + esc(!stk.staked ? T('playing now — free, nobody risks a chip', 'issa — b’xejn, ħadd ma jirriskja ċippa')
                              : T('free — nobody risks a chip', 'b’xejn — ħadd ma jirriskja ċippa')) +
      '</i></span></button>' +
    '<button class="mp-lv' + (stk.staked ? ' on' : '') + '" data-stakemode="chips">' +
      stakeChipIco() +
      '<span><b>' + esc(T('For chips', 'Għaċ-ċips')) + '</b>' +
      '<i>' + esc(stk.staked ? T('playing now — ' + stk.ante + ' chips a head, winner takes the pot',
                                 'issa — ' + stk.ante + ' ċips kull wieħed, ir-rebbieħ jieħu l-pot')
                             : T('everyone antes, the winner takes the pot',
                                 'kulħadd jitfa’, ir-rebbieħ jieħu l-pot')) +
      '</i></span></button>' +
    (stk.staked
      ? '<div class="mp-dsub">' + esc(T('THE ANTE — EACH PLAYER PUTS IN', 'L-ANTE — KULL PLEJER JITFA’')) + '</div>' +
        '<div class="mp-antes" role="group" aria-label="' + esc(T('Ante amount', 'Ammont tal-ante')) + '">' +
        ANTE_STEPS.map(n => {
          const can = n <= bal;
          return '<button class="mp-ante' + (n === cur ? ' on' : '') + '"' +
            (can ? ' data-ante="' + n + '"' : ' disabled aria-disabled="true"') + '>' +
            '<b>' + n + '</b><i>' + esc(can ? T('chips', 'ċips') : T('short', 'nieqes')) + '</i></button>';
        }).join('') +
        '</div>' +
        '<p class="mp-dp mp-stakebal">' + stakeChipIco('mp-balchip') + ' ' +
          esc(T('You have ' + bal + ' chips. The ante leaves every wallet when the game starts; no result, and it comes straight back.',
                'Għandek ' + bal + ' ċips. L-ante joħroġ meta tibda l-logħba; jekk ma jkunx hemm riżultat, jerġa’ lura mill-ewwel.')) +
        '</p>'
      : '') +
    '</div>';
}

/* ── the screen ─────────────────────────────────────────────────── */
function tableLobby(){
  const body = $('#mp-body');
  if (!body) return;
  /* Where the finger left the list, so a repaint — a ready toggle, a seat
     change, a drawer opening, or a roster the relay pushed — does not snap
     the view back to the top. Read before the innerHTML swap below wipes it;
     restored at the foot of this paint.
     READ FROM STATE, NOT JUST THE DOM. Reading only body.scrollTop was enough
     for an in-place repaint, but anything that LEAVES the screen and comes back
     (Customise is the loud one: it opens the wardrobe and returns) finds the
     scroller already reset, so keepY was 0 and the list snapped to the top.
     MP.lobbyY is kept up to date by the passive listener armed at the foot of
     this paint, so it survives the round trip. */
  const keepY = body.scrollTop || MP.lobbyY || 0;
  const LB = gameLobby(MP.game);
  if (!MP.roster) MP.roster = ownRoster();
  const seats = rosterSeats();
  const taken = seats.length;
  /* THE HOST IS THE LOWEST OCCUPIED CHAIR, not literally chair zero.

     Asking "am I seat 0" meant that when the host's phone died in the
     lobby — a real thing at a party — chair 0 emptied and the Start button
     went with it. Everybody else could ready up, tableCanStart() would
     happily say yes, and the room would sit there forever reading
     "Everybody is ready" with nothing on any screen that could start it.
     The only escape was abandoning the room and remaking it.

     Promotion needs no relay change and no coordination: every phone
     already holds the same roster, rosterSeats() hands it back in seat
     order, so "the first chair still occupied" is a value they all compute
     identically and agree on without a word between them. The waiting
     message underneath already names seats[0] as the one who can start, so
     it now tells the truth instead of naming a chair nobody is sitting in. */
  const iAmHost = MP.mySeat === (seats.length ? seats[0].seat : 0);
  const verdict = tableCanStart();
  /* the game's mode presets, if it has more than one. The Rules button is
     host-only and only shown when there is a genuine choice to make. */
  const variants = lobbyVariants(MP.game);
  const curVar = lobbyCurrentVariant(MP.game);
  const hasModes = variants.length > 1;
  const curLabel = (variants.find(v => v.net === curVar) || null);
  /* the games this table could switch to, host-only. More than one means there
     is a genuine choice; each entry already knows whether the current group
     can seat it. A duel room (cards/chess/dama) uses the legacy screen and
     never reaches here, so this is always a table with a real Game button. */
  const games = lobbyGames(taken);
  const hasGames = games.length > 1;
  const free = [];
  for (let i = 0; i < MP.size; i++)
    if (!seats.some(s => s.seat === i)) free.push(i);
  /* THE STAKES — what this table is playing for, and whether I can sit at
     it. All read live: the roster's rules blob is the authority, exactly
     as it is for the variant. The control needs the chips economy on the
     phone; a build without it simply keeps every table friendly. */
  const stk = stakeRoom();
  const stakeOn = !!stakeXP();
  const myChips = stakeOn ? stakeBal() : 0;
  const shortBy = (stakeOn && stk.staked) ? Math.max(0, stk.ante - myChips) : 0;
  const potHumans = seats.filter(s => s.kind === 'human').length;
  const potBots = taken - potHumans;

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

    /* ── THE MODE, if this game has more than one ──
       The host gets a Rules button that changes the room's mode in place —
       nobody is kicked, the roster just repaints for everyone. A non-host sees
       the current mode as read-only text. A game with one mode shows neither. */
    (hasModes
      ? (iAmHost
          ? '<button class="mp-fold" id="mp-modebtn" aria-expanded="' +
              (MP.panel === 'mode' ? 'true' : 'false') + '">' +
              ico('cards') + '<span>' + esc(T('Rules', 'Regoli')) +
              '<i>' + esc(curLabel
                    ? T('now: ', 'issa: ') + variantLabel(curLabel)
                    : T('choose the mode', 'agħżel il-mod')) +
              '</i></span><em class="' + (MP.panel === 'mode' ? 'up' : '') + '">' +
              ico('arrow-right') + '</em></button>' +
            (MP.panel === 'mode' ? modeDrawer(variants, curVar) : '')
          : '<p class="mp-tsub" id="mp-modero">' +
              esc(T('Mode', 'Mod')) + ': <b>' +
              esc(curLabel ? variantLabel(curLabel) :
                  T('the host chooses', 'jagħżel il-host')) + '</b>. ' +
              esc(T('Only the host can change it.', 'Il-host biss jista’ jibdlu.')) +
            '</p>')
      : '') +

    /* ── THE GAME, changed in place ──
       The host gets a Game button beside Rules that swaps WHICH GAME the table
       is playing — nobody is kicked, every phone repaints into the new game's
       lobby. A non-host sees the current game name as read-only text. */
    (hasGames
      ? (iAmHost
          ? '<button class="mp-fold" id="mp-gamebtn" aria-expanded="' +
              (MP.panel === 'game' ? 'true' : 'false') + '">' +
              gameIcon(MP.game) + '<span>' + esc(T('Game', 'Logħba')) +
              '<i>' + esc(T('now: ', 'issa: ') + LB.name) +
              '</i></span><em class="' + (MP.panel === 'game' ? 'up' : '') + '">' +
              ico('arrow-right') + '</em></button>' +
            (MP.panel === 'game' ? gameDrawer(games) : '')
          : '<p class="mp-tsub" id="mp-gamero">' +
              esc(T('Game', 'Logħba')) + ': <b>' + esc(LB.name) + '</b>. ' +
              esc(T('Only the host can change it.', 'Il-host biss jista’ jibdilha.')) +
            '</p>')
      : '') +

    /* ── THE STAKES — friendly or for chips, the host's call ──
       The host gets a Stakes button that flips the room between FRIENDLY
       (free) and FOR CHIPS (everyone antes, winner takes the pot) and picks
       the ante off a short ladder. A non-host sees the same control drawn
       LOCKED — disabled, never hidden — so the table's terms are readable
       from every chair. Rides the same rules blob the Rules pick rides. */
    (stakeOn
      ? (iAmHost
          ? '<button class="mp-fold" id="mp-stakebtn" aria-expanded="' +
              (MP.panel === 'stake' ? 'true' : 'false') + '">' +
              stakeChipIco() + '<span>' + esc(T('Stakes', 'Imħatri')) +
              '<i>' + esc(stk.staked
                    ? T('for chips: ' + stk.ante + ' a head — winner takes the pot',
                        'għaċ-ċips: ' + stk.ante + ' kull wieħed — ir-rebbieħ jieħu l-pot')
                    : T('friendly — free to play', 'bi ħbiberija — b’xejn')) +
              '</i></span><em class="' + (MP.panel === 'stake' ? 'up' : '') + '">' +
              ico('arrow-right') + '</em></button>' +
            (MP.panel === 'stake' ? stakeDrawer(stk) : '')
          : '<button class="mp-fold ro" id="mp-stakero" disabled aria-disabled="true">' +
              stakeChipIco() + '<span>' + esc(T('Stakes', 'Imħatri')) +
              '<i>' + esc(stk.staked
                    ? T('for chips: ' + stk.ante + ' a head — only the host can change it',
                        'għaċ-ċips: ' + stk.ante + ' kull wieħed — il-host biss jista’ jibdilhom')
                    : T('friendly — free · only the host can change it',
                        'bi ħbiberija — b’xejn · il-host biss jista’ jibdilhom')) +
              '</i></span><em>' + ico('lock') + '</em></button>')
      : '') +

    /* ── the chairs ── */
    '<div class="mp-thd">THE TABLE</div>' +
    '<div class="mp-chairs" id="mp-chairs">' +
      chairRows(seats, free, iAmHost, LB) +
    '</div>' +

    /* ── THE TABLE SIZE, the host's to change while waiting ──
       Only shown to the host, and only where the game seats a real range. The
       floor is however many chairs are already spoken for, so a host can never
       shrink the table under the people in it. On a relay that carries the
       `resize` message the change propagates to everyone; on an older one it is
       ignored and the roster simply keeps the size it had — no lie either way. */
    (iAmHost && !MP.roster.local && LB.maxSeats > LB.minSeats
      ? '<div class="mp-setrow" id="mp-seatrow">' +
          '<div class="mp-setlbl">' + ico('users') + ' <b>' +
            esc(T('Table size', 'Daqs tal-mejda')) + '</b>' +
            '<i>' + esc(T('Add or drop open chairs. Empty ones never hold the start up.',
                          'Żid jew naqqas siġġijiet. Dawk vojta qatt ma jżommu l-bidu.')) +
          '</i></div>' +
          seatStepperHTML(MP.game, MP.size, Math.max(LB.minSeats, taken),
            { caption:taken + ' seated · up to ' + LB.maxSeats }) +
        '</div>'
      : '') +

    /* ── the two drawers, both of which open IN PLACE ── */
    (MP.panel === 'ai'  ? aiDrawer(LB) : '') +
    (MP.panel === 'ask' ? askDrawer() : '') +

    /* ── THE POT, said before anyone readies up ──
       A staked table names its price out loud: the pot, the arithmetic it
       comes from, and — where a wallet is short — exactly how short. */
    (stakeOn && stk.staked
      ? '<div class="mp-pot">' + stakeChipArt(stk.ante * potHumans) +
          '<span><b>' + esc(T('POT: ' + (stk.ante * potHumans) + ' CHIPS',
                              'POT: ' + (stk.ante * potHumans) + ' ĊIPS')) + '</b>' +
          '<i>' + esc(potHumans + ' × ' + stk.ante +
                (potBots ? T(' · machines play free', ' · il-magni jilagħbu b’xejn') : '') +
                T(' · winner takes it all', ' · ir-rebbieħ jieħu kollox')) +
          '</i></span></div>'
      : '') +

    /* ── ready, and start ── */
    '<div class="mp-acts">' +
      /* CANNOT STAKE WHAT YOU CANNOT AFFORD. A wallet short of the ante is
         refused the READY button — with the shortfall named and the free
         lane pointed at — rather than discovering it when the antes go out.
         Nobody is ever locked out: friendly is always one host-tap away. */
      (shortBy > 0 && !MP.iAmReady
        ? '<div class="mp-stakeshort" role="status">' + ico('warn') +
            '<span><b>' + esc(T('You are ' + shortBy + ' chips short of the ' + stk.ante + '-chip ante.',
                                'Jonqsok ' + shortBy + ' ċips għall-ante ta’ ' + stk.ante + '.')) + '</b>' +
            '<i>' + esc(iAmHost
                  ? T('Drop the ante a step, or make the table friendly — friendly is always free.',
                      'Niżżel l-ante, jew agħmel il-mejda bi ħbiberija — bi ħbiberija dejjem b’xejn.')
                  : T('The daily spin tops you up, or ask the host for a friendly game — friendly is always free.',
                      'Ir-rota ta’ kuljum ittellagħek, jew staqsi lill-host għal logħba bi ħbiberija — dejjem b’xejn.')) +
            '</i></span></div>' +
          '<button class="mp-ready" id="mp-ready" disabled aria-disabled="true">' +
            esc(T('Cannot ante ' + stk.ante, 'Ma tistax titfa’ ' + stk.ante)) +
            '<i>' + esc(T('you have ' + myChips + ' chips', 'għandek ' + myChips + ' ċips')) + '</i></button>'
        : '<button class="mp-ready' + (MP.iAmReady ? ' on' : '') + '" id="mp-ready">' +
            (MP.iAmReady ? ico('check') + ' You are ready' : 'I am ready') +
            '<i>' + (MP.iAmReady
                  ? 'tap to say you are not'
                  : (stk.staked
                      ? esc(T('the ' + stk.ante + '-chip ante leaves when the game starts',
                              'l-ante ta’ ' + stk.ante + ' joħroġ meta tibda l-logħba'))
                      : 'everybody readies, then the host starts')) +
            '</i></button>') +
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

    /* ── CUSTOMISE, while you wait ──
       Host AND each player can open this game's cosmetics and change their own
       look without leaving the room. It is per-player and purely cosmetic — it
       touches nothing about the room, the seating or anybody's ready bit — so
       it is offered to everyone, not just the host. Shown only where a
       customisation surface exists on this phone (see lobbyCustomiseScope). */
    (customiseScope() !== null
      ? '<button class="mp-cust" id="mp-custbtn" data-custlobby="1">' +
          '<span class="mp-custico">' + ico('star') + '</span>' +
          '<span><b>' + esc(T('Customise your look', 'Ippersonalizza')) + '</b>' +
          '<i>' + esc(customiseScope() === 'you'
                ? T('Your face and frame — change it while you wait.',
                    'Wiċċek u l-kunturn — ibdilhom waqt li tistenna.')
                : T('This game’s felts, backs and trims — yours to pick, nobody is dropped.',
                    'Il-ħwejjeġ ta’ din il-logħba — agħżel, ħadd ma jitneħħa.')) +
          '</i></span>' +
          '<em>' + ico('arrow-right') + '</em>' +
        '</button>'
      : '') +

    /* ── who is actually about — in the open, above the drawer ── */
    '<div id="mp-around"></div>' +

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
  if (st) st.onclick = () => { sfx('game.start'); sendStart(); };
  const mb = $('#mp-modebtn');
  if (mb) mb.onclick = () => {
    MP.panel = MP.panel === 'mode' ? null : 'mode';
    sfx(MP.panel === 'mode' ? 'ui.sheet' : 'ui.back');
    tableLobby();
  };
  const mx = $('#mp-modex');
  if (mx) mx.onclick = () => { MP.panel = null; sfx('ui.back'); tableLobby(); };
  $$('#mp-mode [data-mode]').forEach(b => b.onclick = () => {
    const net = b.dataset.mode;
    /* optimistic only in SOUND. The relay's roster is the answer: it comes
       back carrying the new variant and repaints this lobby for everyone. */
    sfx('ui.toggle');
    const w = lobbyApplyVariant(MP.game, net);
    const msg = { t:'setvariant', variant: w.variant };
    /* the stakes ride the same blob: a mode change must not silently make
       a staked table friendly, so the stake key is carried across */
    const rules = Object.assign({}, w.rules || {});
    const stNow = stakeRoom();
    if (stNow.staked) rules.stake = { mode:'chips', ante: stNow.ante };
    if (Object.keys(rules).length) msg.rules = rules;
    send(msg);
    MP.panel = null;
    tableLobby();
  });
  /* THE STAKES — host only; the buttons exist only on the host's paint */
  const sb = $('#mp-stakebtn');
  if (sb) sb.onclick = () => {
    MP.panel = MP.panel === 'stake' ? null : 'stake';
    sfx(MP.panel === 'stake' ? 'ui.sheet' : 'ui.back');
    tableLobby();
  };
  const sx = $('#mp-stakex');
  if (sx) sx.onclick = () => { MP.panel = null; sfx('ui.back'); tableLobby(); };
  $$('#mp-stake [data-stakemode]').forEach(b => b.onclick = () => {
    const wantChips = b.dataset.stakemode === 'chips';
    const now = stakeRoom();
    if (wantChips === now.staked) return;          /* already this way */
    sfx('ui.toggle');
    if (!wantChips){ stakeSend({ staked:false }); tableLobby(); return; }
    /* going staked: open at the default ante, stepped DOWN to what the
       host's own wallet can cover — a host must be able to sit at the
       table they set. No affordable step at all refuses out loud. */
    const bal = stakeBal();
    let ante = 0;
    for (let i = ANTE_STEPS.length - 1; i >= 0; i--)
      if (ANTE_STEPS[i] <= Math.min(ANTE_DEFAULT, bal)) { ante = ANTE_STEPS[i]; break; }
    if (!ante){
      K.toast(T('You have ' + bal + ' chips — not enough for the smallest ante (' + ANTE_STEPS[0] +
                '). The daily spin tops you up; friendly is free.',
                'Għandek ' + bal + ' ċips — mhux biżżejjed għall-iżgħar ante (' + ANTE_STEPS[0] +
                '). Ir-rota ta’ kuljum ittellagħek; bi ħbiberija b’xejn.'));
      return;
    }
    stakeSend({ staked:true, ante });
    tableLobby();
  });
  $$('#mp-stake [data-ante]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.ante) | 0;
    if (!n || n === stakeRoom().ante) return;
    sfx('ui.toggle');
    stakeSend({ staked:true, ante:n });
    tableLobby();
  });
  const gb = $('#mp-gamebtn');
  if (gb) gb.onclick = () => {
    MP.panel = MP.panel === 'game' ? null : 'game';
    sfx(MP.panel === 'game' ? 'ui.sheet' : 'ui.back');
    tableLobby();
  };
  const gx = $('#mp-gamex');
  if (gx) gx.onclick = () => { MP.panel = null; sfx('ui.back'); tableLobby(); };
  $$('#mp-game [data-game]').forEach(b => b.onclick = () => {
    const g = b.dataset.game;
    /* a game the current group cannot seat is drawn disabled and carries no
       data-game; this only fires for a seatable one. The current game is a
       no-op the relay answers harmlessly. Optimistic only in SOUND: the relay's
       roster is the answer — it comes back carrying the new `game` and
       onRoster() repaints every phone into that game's lobby. */
    sfx('ui.toggle');
    send({ t:'setgame', game: g });
    MP.panel = null;
    tableLobby();
  });
  /* the host's seat stepper — grow or shrink the open table while waiting */
  $$('#mp-seatrow [data-seatdelta]').forEach(b => b.onclick = () => {
    const d = Number(b.dataset.seatdelta) || 0;
    const LBn = gameLobby(MP.game);
    const floor = Math.max(LBn.minSeats, rosterSeats().length);
    const next = Math.max(floor, Math.min(LBn.maxSeats, MP.size + d));
    if (next === MP.size) return;
    sfx(d > 0 ? 'ui.toggle' : 'ui.untoggle');
    resizeTable(next);
  });
  /* CUSTOMISE — open this game's cosmetics, come straight back to the lobby */
  const cb = $('#mp-custbtn');
  if (cb) cb.onclick = () => { sfx('ui.sheet'); openLobbyCustomise(); };
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
  paintRoomAround();
  whoAsk();                      /* freshen the strip; floored, never a poll */

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
  /* the honest case first: nothing below this line is true if the relay has
     not answered, so it is said before any of it */
  const unconfirmed = !!(MP.roster && MP.roster.local);
  setState(unconfirmed ? 'waiting' : verdict.ok ? 'ready' : 'waiting',
           unconfirmed ? 'Still reaching the server — this table is not open to '
                       + 'anybody yet, and a machine added now will not stick.'
         : MP.private ? 'Private table — only somebody with the code can get in.'
         : taken < 2 ? 'Your table is in the list. Nobody else yet — ' +
                       (LB.levels.length
                         ? 'put a machine in a chair and start, or wait for somebody.'
                         : 'wait for somebody to tap in.')
         : verdict.ok ? 'Everybody is ready. ' + taken + ' at the table.'
         : taken + ' at the table, ' + free.length +
           (free.length === 1 ? ' chair free.' : ' chairs free.'));
  paintState();

  /* put the view back where it was — clamped so a now-shorter list never
     leaves the scroller parked past its own end. */
  if (keepY) body.scrollTop = Math.min(keepY, Math.max(0, body.scrollHeight - body.clientHeight));
  MP.lobbyY = body.scrollTop;
  /* Remember every scroll from here on, so leaving the screen and coming back
     (Customise, the wardrobe, a profile) lands where the finger left it. Armed
     once per element: innerHTML above replaces the CHILDREN, not #mp-body, so
     the flag survives a repaint and we never stack listeners. */
  if (!body.__kxScroll){
    body.__kxScroll = 1;
    body.addEventListener('scroll', () => { MP.lobbyY = body.scrollTop; }, { passive:true });
    /* WHAT THE FINGER JUST TOUCHED. Restoring scrollTop alone is not enough:
       a drawer (Game, Rules, Machine) makes the list tall, you scroll down
       inside it, you tap — and the drawer folds away, so the list is suddenly
       short and the clamp above drags the view hundreds of pixels upward. That
       is the "it scrolls up" everybody feels. Remembering the control that was
       tapped lets the paint below bring it back under the thumb instead. */
    body.addEventListener('click', e => {
      const t = e.target && e.target.closest && e.target.closest('button');
      MP.focusId = (t && t.id) ? t.id : '';
      MP.focusAt = t ? Date.now() : 0;
    }, true);
  }
  /* ...and put it back under the thumb. Only right after a real tap (a roster
     the relay pushed must never yank the view), and only if it actually moved
     out of sight. 'nearest' keeps the motion to the minimum that works. */
  if (MP.focusId && Date.now() - (MP.focusAt || 0) < 900){
    const el = body.querySelector('#' + MP.focusId);
    if (el){
      const r = el.getBoundingClientRect(), br = body.getBoundingClientRect();
      if (r.top < br.top + 4 || r.bottom > br.bottom - 4){
        try { el.scrollIntoView({ block:'nearest', behavior:'smooth' }); }
        catch (e){ el.scrollIntoView(false); }
      }
    }
    MP.focusId = '';
  }
}

/* ── THE HOST GROWS OR SHRINKS THE OPEN TABLE ──────────────────────────
   The relay is the authority on the room's size, exactly as it is on the game
   and the mode: this sends a `resize` and waits for the roster to come back
   carrying the new count, so every phone follows the change in one repaint and
   two hosts can never disagree. A relay that does not know `resize` ignores it
   (the same way it ignores `private` on an older build), and the size simply
   stays as it was — nothing here lies about a change the server did not make.
   The optimistic local bump keeps the button responsive; the next roster is the
   answer, and onRoster()'s `m.seats` overwrites it whichever way the relay went.
   >>> RELAY: a `resize` handler is the one server change this needs. It mirrors
   set_game's resize block — clamp `n` into seat_range(game,variant), never below
   room.taken(), never past a bot seat, then re-broadcast room.roster(). Until it
   ships, the host picks the final size on the SETUP screen (create.seats), which
   the relay already honours; this control then only ever GROWS toward that max. */
function resizeTable(n){
  const LB = gameLobby(MP.game);
  const floor = Math.max(LB.minSeats, rosterSeats().length);
  n = Math.max(floor, Math.min(LB.maxSeats, n | 0));
  if (n === MP.size) return;
  send({ t:'resize', seats: n });
  /* optimistic, and only ever wider: growing shows the new empty chairs at once;
     a shrink waits for the relay so we never hide a chair somebody is sitting in
     on a relay that refused the change. */
  if (n > MP.size){ MP.size = n; tableLobby(); }
}

/* WHICH CUSTOMISATION SURFACE THIS LOBBY CAN OPEN, or null if none is on the
   phone. A game that registered its own cosmetics (felts, card backs, trims)
   opens scoped to itself; otherwise the general wardrobe — your face and frame,
   which every player always has — is offered instead. Never throws. */
function customiseScope(){
  try {
    const XP = window.KARTI_XP;
    if (!XP || typeof XP.open !== 'function') return null;
    if (typeof XP.games === 'function'){
      const gs = XP.games() || [];
      if (gs.indexOf(MP.game) >= 0) return MP.game;   /* this game's own kit */
    }
    /* the wardrobe (faces/borders) is always there for a signed-in profile */
    return 'you';
  } catch (e){ return null; }
}

/* OPEN THE COSMETICS SURFACE, AND COME BACK TO THE LOBBY.
   Per-player and purely cosmetic: it never leaves the room, never touches the
   ready bit, and returns to this exact lobby rather than home. The return is
   threaded through KARTI_XP.open's second argument (a small additive hook in
   js/progress-ui.js): {back:fn} makes its Back button and the Android hardware
   back run `fn` instead of going home. If the running build's progress-ui does
   not carry the hook, we fall back to re-opening the lobby ourselves the moment
   the customise screen closes — so it is back-safe on every build. */
function openLobbyCustomise(){
  const scope = customiseScope();
  if (scope === null) return;
  const backToLobby = () => {
    /* still in the room? repaint the lobby. If the room went away while we were
       out (rare), the online screen is the honest place to land. */
    if (MP.code && (MP.joined || MP.host)) mpBackToLobby();
    else mpScreen();
  };
  try {
    const XP = window.KARTI_XP;
    /* preferred path: the additive hook. Older progress-ui ignores the 2nd arg
       and its Back goes home — caught by the visibility fallback below. */
    XP.open(scope, { back: backToLobby, from:'mp' });
  } catch (e){ backToLobby(); return; }
  armCustomiseReturn(backToLobby);
}

/* Belt and braces for an older progress-ui whose Back button routes home: watch
   for the customise screen closing and, if we are not already back on the lobby,
   bring it back. One-shot; it disarms itself the instant it fires or the screen
   is gone. */
function armCustomiseReturn(backToLobby){
  let tries = 0;
  const tick = () => {
    tries++;
    const kx = document.getElementById('scr-kx');
    const kxOn = kx && kx.classList.contains('on');
    const mpOn = (() => { const s = $('#scr-mp'); return s && s.classList.contains('on'); })();
    if (kxOn){ if (tries < 600) setTimeout(tick, 120); return; }   /* still customising */
    /* customise closed. If the app did not land us back on the lobby, do it. */
    if (!mpOn) backToLobby();
  };
  setTimeout(tick, 250);
}

/* Re-enter the lobby for the room we are already in, without re-opening a
   socket. K.go('mp') makes the Online screen the visible one AND paints it
   (its mpScreen() call is idempotent); lobby() then paints the table we are
   seated at over the room list. If the app shell is missing K.go we still paint
   the screen directly so nothing is left blank. */
function mpBackToLobby(){
  try { if (window.KARTI && KARTI.go) KARTI.go('mp'); else mpScreen(); }
  catch (e){ mpScreen(); }
  lobby();
}

/* the one line under the header. It is the difference between a room that is
   filling up and a room that is empty, so it never says "waiting". */
function tableLine(taken, free, iAmHost){
  /* The count is already on the badge and in the status line. This says what
     to DO about it, which is the one thing neither of those can. The machine
     clause is only offered where the game actually seats machines. */
  const canBot = !!gameLobby(MP.game).levels.length;
  if (taken < 2)
    return 'Anyone who opens Online sees your table and can tap straight in' +
           (canBot ? ' — or put a machine in a chair and start right now.' : '.');
  if (free > 0)
    return iAmHost ? 'You do not have to fill it — the empty chairs never block a ' +
                     'start. Go whenever everybody here is ready.'
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
/* ONE PLAYER, DRAWN THE ONE WAY. The whole app draws a person through
   KARTI_XP.avatarHTML — the leaderboard, the profile sheet, the winner screen —
   so a seat plate uses the same call and cannot disagree with them. My own seat
   passes {me:true} so it wears my real face and frame; another seat is drawn
   from its name (the roster does not carry a stranger's avatar id), which is
   stable and coloured per-name. A machine seat gets a plain medallion. If the
   progress kit is not on this phone the call returns an initial medallion of its
   own, so this never has to check. */
function seatAvatar(s, me){
  try {
    const XP = window.KARTI_XP;
    if (XP && typeof XP.avatarHTML === 'function' && s.kind !== 'cpu'){
      const opts = { size:38, me:!!me, noBorder:false, label:(s.name || 'Player') };
      /* a REMOTE seat now carries the account key + photo version from the
         relay, so draw their REAL photograph (avatarHTML builds the URL from
         who+pv), not a name-coloured medallion. My own seat still uses {me}. */
      if (!me && s.av && s.pv){ opts.who = s.av; opts.pv = s.pv; }
      /* …and the look they picked, which is the ONLY thing most players
         have: describe() takes `hint` as the face and honours an explicit
         border and badge, so this is the same door the app already uses. */
      if (!me && s.look){
        if (s.look.f)  opts.hint   = s.look.f;
        if (s.look.b)  opts.border = s.look.b;
        if (s.look.lb) opts.lvb    = s.look.lb;
      }
      return XP.avatarHTML(s.name || 'Player', opts);
    }
  } catch (e){}
  /* machine (or no kit): a quiet medallion with the game's die/piece mark */
  return '<span class="mp-cbot" aria-hidden="true">' +
    (s.kind === 'cpu' ? ico('diff-' + Math.max(1, Math.min(3, s.level || 2))) : ico('users')) +
    '</span>';
}

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
      '<span class="mp-cav">' + seatAvatar(s, me) +
        '<span class="mp-cn">' + (i + 1) + '</span></span>' +
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

/* ── the mode picker drawer (host only) ─────────────────────────────
   One tap per mode. The pick goes to the relay as a `setvariant` message; the
   roster that comes back repaints the lobby for everyone, exactly like the
   ready and machine flows. Nobody is removed. */
function modeDrawer(variants, curVar){
  return '<div class="mp-drawer" id="mp-mode">' +
    '<div class="mp-dhd"><b>' + esc(T('The mode', 'Il-mod')) + '</b>' +
      '<button class="mp-dx" id="mp-modex" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
        ico('close') + '</button></div>' +
    '<p class="mp-dp">' + esc(T(
      'Everyone at the table plays the same mode. Change it and their lobby just repaints — nobody is dropped.',
      'Kulħadd fuq il-mejda jilgħab l-istess mod. Ibdlu u l-lobby tagħhom jerġa’ jinżebagħ — ħadd ma jitneħħa.')) +
    '</p>' +
    variants.map(v =>
      '<button class="mp-lv' + (v.net === curVar ? ' on' : '') +
        '" data-mode="' + esc(v.net) + '">' +
        ico('cards') +
        '<span><b>' + esc(variantLabel(v)) + '</b>' +
        (v.net === curVar ? '<i>' + esc(T('playing now', 'qed jintlagħab issa')) + '</i>' : '') +
        '</span></button>').join('') +
    '</div>';
}

/* ── the game picker drawer (host only) ─────────────────────────────
   The bigger sibling of modeDrawer: one tap per GAME. A game the current group
   cannot seat is drawn DISABLED with a short reason, never hidden, so the host
   can see why it is out. The pick goes to the relay as a `setgame` message; the
   roster that comes back carries the new game and onRoster() repaints every
   phone into it. Nobody is removed. */
function gameDrawer(games){
  return '<div class="mp-drawer" id="mp-game">' +
    '<div class="mp-dhd"><b>' + esc(T('The game', 'Il-logħba')) + '</b>' +
      '<button class="mp-dx" id="mp-gamex" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' +
        ico('close') + '</button></div>' +
    '<p class="mp-dp">' + esc(T(
      'Everyone at the table plays the same game. Change it and their lobby just repaints — nobody is dropped. A game too small for who is already seated is greyed out.',
      'Kulħadd fuq il-mejda jilgħab l-istess logħba. Ibdilha u l-lobby tagħhom jerġa’ jinżebagħ — ħadd ma jitneħħa. Logħba żgħira wisq għal min diġà bilqiegħda tibqa’ mitfija.')) +
    '</p>' +
    games.map(g => {
      const on = g.current ? ' on' : '';
      const dis = g.fits ? '' : ' disabled';
      const attr = (g.fits && !g.current) ? ' data-game="' + esc(g.id) + '"' : '';
      return '<button class="mp-lv' + on + dis + '"' + attr +
        (g.fits ? '' : ' disabled aria-disabled="true"') + '>' +
        gameIcon(g.id) +
        '<span><b>' + esc(g.name) + '</b>' +
        (g.current ? '<i>' + esc(T('playing now', 'qed tintlagħab issa')) + '</i>'
         : !g.fits ? '<i>' + esc(g.reason) + '</i>'
         : '<i>' + esc(g.min === g.max
                 ? T(g.max + ' players', g.max + ' plejers')
                 : T(g.min + '–' + g.max + ' players', g.min + '–' + g.max + ' plejers')) +
           '</i>') +
        '</span></button>';
    }).join('') +
    '</div>';
}

/* ── asking somebody, from inside the room ──────────────────────── */
/* the drawer's people lists, rebuilt whenever `who` answers */
/* your actual friends, straight off the Friends tab's own list. They are the
   people you most want in your room, so they go FIRST — above "usually play
   with" and above whoever happens to be idle. One tap invites them exactly
   like any other pill (data-ask -> sendInvite). */
function askFriendsHTML(){
  let list = [];
  try { list = (window.KARTI_FRIENDS && KARTI_FRIENDS._state && KARTI_FRIENDS._state.friends) || []; }
  catch (e){ list = []; }
  const seat = new Set(rosterSeats().map(s => String(s.name || '').toLowerCase()));
  /* somebody already sitting in this room is not somebody to invite to it */
  const pick = list.filter(f => f && f.n && !seat.has(String(f.n).toLowerCase())).slice(0, 8);
  let h = '<div class="mp-dsub">YOUR FRIENDS</div>';
  if (!pick.length){
    h += '<p class="mp-dp">No friends to ask yet — add one and they are always one tap ' +
         'from your table.</p>';
  } else {
    h += '<div class="mp-pills">' + pick.map(f => {
      const off = f.s === 'off' || f.s === 'offline';
      return '<button class="mp-pill' + (off ? ' off' : '') + '" data-ask="' + esc(f.n) + '">' +
        esc(f.n) + '<i>' + esc(off ? 'offline · they will get it later'
                                   : (f.g ? 'in a game' : 'online')) + '</i></button>';
    }).join('') + '</div>';
  }
  h += '<button class="btn ghost" id="mp-addfriend" style="margin-top:8px">' + ico('plus') +
       ' Add a friend</button>';
  return h;
}

function askPeopleHTML(){
  const rec = WHO.recent.slice(0, 8);
  const around = WHO.people.filter(p => p.s === 'idle').slice(0, 8);
  let h = askFriendsHTML();
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
  return h;
}
function paintAskPeople(){
  const host = $('#mp-askppl');
  if (!host) return;
  host.innerHTML = askPeopleHTML();
  K.$$('[data-ask]', host).forEach(b => b.onclick = () => sendInvite(b.dataset.ask));
  wireAddFriend(host);
}
/* "Add a friend" — hand straight over to the Friends tab, which owns adding
   (codes, requests, accepting). The room is not left behind: it is still open
   and still yours to come back to. */
function wireAddFriend(host){
  const b = (host || document).querySelector('#mp-addfriend');
  if (!b) return;
  b.onclick = () => {
    sfx('ui.tap', { gain:0.6 });
    try {
      if (window.KARTI_FRIENDS && KARTI_FRIENDS.open){ KARTI_FRIENDS.open(); return; }
    } catch (e){}
    const t = document.getElementById('btn-friends');
    if (t) t.click(); else K.toast('Friends is on the bottom bar.');
  };
}
function askDrawer(){
  let h = '<div class="mp-drawer" id="mp-ask">' +
    '<div class="mp-dhd"><b>Ask somebody</b>' +
      '<button class="mp-dx" id="mp-askx" aria-label="Close">' + ico('close') + '</button></div>';

  if (!canInvite()){
    h += '<p class="mp-dp">Asking one particular person needs a KARTI account on your side — ' +
         'it is what the invitation is addressed to. Without one, your table is still in ' +
         'everybody’s list and anyone can tap it.</p></div>';
    return h;
  }
  /* the people lists live in their own container so a fresh `who` answer can
     repaint THEM without redrawing the drawer — redrawing the drawer wipes
     whatever is half-typed in the name box below, and the relay nudges us
     every few seconds when the party is busy. */
  h += '<div id="mp-askppl">' + askPeopleHTML() + '</div>';
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
  wireAddFriend(document);
  const go = $('#mp-invgo');
  if (go) go.onclick = () => sendInvite(($('#mp-invname') || {}).value || '');
}

/* ═══════════════════════════════════════════════════════════════════
   WHO IS AROUND, IN THE ROOM ITSELF
   ───────────────────────────────────────────────────────────────────
   The one thing a person sitting in an empty room wants to know is
   whether anybody else EXISTS — and the answer was already on this
   phone, hidden behind a collapsed drawer. So it is drawn in the open,
   in every room's waiting screen, duel and table alike.

   What is shown is exactly the `who` answer and nothing else: named,
   signed-in, visible accounts, each with the state the relay already
   publishes (idle / at a table / mid-game). A guest is never named
   here — the relay refuses to name them, on purpose — so every name
   shown is a name an invitation can actually reach. Somebody mid-game
   gets no button, because an invite they cannot see is a button that
   lies. See docs/ONLINE.md, section 5c.
   ═══════════════════════════════════════════════════════════════════ */
function roomAroundHTML(){
  /* no account -> no list, by the relay's own rule. The sign-in nudge is
     already on the screen in both rooms, so nothing more is said here. */
  if (!canInvite() || WHO.off || !MP.code) return '';
  /* a full table can invite nobody — the relay refuses it — so the strip
     would be all buttons that fail. The chairs already say "every chair is
     taken"; stay out of the way. */
  const taken = MP.roster ? rosterSeats().length : (MP.peerHere ? 2 : 1);
  if (taken >= MP.size) return '';
  /* people already at THIS table are on the chairs above, not in this list */
  const seated = {};
  ((MP.roster && MP.roster.who) || []).forEach(w => {
    if (w && !w.bot && w.n) seated[String(w.n).toUpperCase()] = 1;
  });
  const ppl = WHO.people.filter(p => p && typeof p.n === 'string' && p.n &&
                                     !seated[p.n.toUpperCase()]);
  let inner;
  if (!WHO.got){
    inner = '<p class="mp-arnote">Checking who is about…</p>';
  } else if (!ppl.length){
    inner = '<p class="mp-arnote">Nobody signed in is around right now. ' +
      (MP.private
        ? 'This room is private, so only somebody you give the code to can find it.'
        : 'Your room is still in everybody’s list — the next person to open ' +
          'Online sees it straight away.') + '</p>';
  } else {
    const shown = ppl.slice(0, 8);
    inner = '<div class="mp-pills">' + shown.map(p => {
      if (p.s === 'playing')
        return '<span class="mp-pill off">' + esc(p.n) +
               '<i>' + esc(whoWord(p)) + '</i></span>';
      return '<button class="mp-pill" data-around="' + esc(p.n) + '" ' +
        'aria-label="Invite ' + esc(p.n) + '">' + esc(p.n) +
        '<i>' + esc(whoWord(p)) + ' · tap to ask</i></button>';
    }).join('') + '</div>' +
    (ppl.length > shown.length
      ? '<p class="mp-arnote">and ' + (ppl.length - shown.length) + ' more around.</p>'
      : '');
  }
  return '<div class="mp-recent"><div class="mp-rectitle">' + ico('users') +
    ' Who is around · <span class="n">' + (WHO.got ? WHO.here : '…') + '</span></div>' +
    inner + '</div>';
}
/* painted into #mp-around — its own container, so a `who` answer refreshes
   the strip without redrawing the room around it */
function paintRoomAround(){
  const host = $('#mp-around');
  if (!host) return;
  host.innerHTML = roomAroundHTML();
  K.$$('[data-around]', host).forEach(b => b.onclick = () => {
    sfx('ui.toggle');
    sendInvite(b.dataset.around);          /* 'invited' reply says it went */
  });
}

/* ── somebody left the LOBBY on purpose ─────────────────────────────
   The relay announces a clean exit — {t:'peer', state:'left', seat:N} —
   but sends no fresh {t:'table'} for it (a dropped signal gets one; a
   deliberate leave does not). Without this, the chair sat "taken" on
   every other phone until something else changed the table, which is a
   roster telling everybody somebody is here who is not. Nothing is
   invented: the one fact applied — that seat is now empty — is the
   relay's own word, and the next real roster simply overwrites it. */
function tableChairFreed(seat){
  const r = MP.roster;
  if (!r || !Array.isArray(r.who)) return;
  if (typeof seat !== 'number' || seat < 0 || seat >= r.who.length) return;
  const w = r.who[seat];
  if (!w || w.bot) return;                 /* a machine never 'leaves' */
  const name = w.n || 'Somebody';
  r.who[seat] = null;
  r.taken = r.who.filter(Boolean).length;
  r.waiting = r.who.filter(x => x && !x.bot && !x.ready).length;
  K.toast(name + ' left the table.');
  if (!MP.live && !MP.boardLive) tableLobby();
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
  /* A seat that is GONE FOR GOOD ('left' — a deliberate exit, or the relay
     freeing a dropped chair after its grace) is handed to the game, IF the
     game has said it knows what to do with one. hooks.seatGone is opt-in:
     a game that publishes it seats the ghost out and plays on (RUMMY does);
     a game that does not is exactly as it was — this call does not exist
     for it. 'dropped' is deliberately NOT passed: a held chair may come
     back, and folding somebody over a lift ride is not this file's call. */
  if (how !== 'dropped' && net && net.hooks && typeof net.hooks.seatGone === 'function'){
    try { net.hooks.seatGone(seat); } catch (e){}
  }
}

/* The inverse of a 'dropped' tableSeatGone: a held chair reconnected. Clears
   the "lost signal — holding their chair" warning the drop put up (net.note
   with no 'warn' level is the all-clear), says they are back, and gives the
   game an opt-in hook so a game that seated the ghost out can seat them back
   in. Without this, a rejoin left every OTHER phone stuck showing the player
   as still connecting even though they were back — a purely visual stall. */
function tableSeatBack(seat){
  const LB = gameLobby(MP.game);
  const net = LB.net;
  const name = (MP.roster && MP.roster.who[seat] && MP.roster.who[seat].n) || 'Somebody';
  if (net && net.note) net.note(name + ' is back.', '');
  K.toast(name + ' is back.');
  if (net && net.hooks && typeof net.hooks.seatBack === 'function'){
    try { net.hooks.seatBack(seat); } catch (e){}
  }
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

  /* THE ANTES GO OUT — wallet bookkeeping only, on this phone, for this
     seat, under the match id (code:seed) so a replayed 'began' antes once.
     A friendly card table is handed its play-money stack here instead.
     Nothing of this touches the seed, the deal or the wire. */
  stakeArm(m);

  MP.live = true;
  MP.boardLive = true;
  window.KHOOK = null;
  const net = {
    /* one move out, stamped by the relay on the way in */
    send: d => relay(Object.assign({ k:'bact', game:MP.game }, d || {})),
    move: (kind, a) => relay({ k:'bact', game:MP.game, kind: kind || 'move', m: a || {} }),
    bail: why => { relay({ k:'bail', why: String(why || 'stopped') }); tableStop(why); },
    /* A PRIVATE WORD TO ONE SEAT — carried by the relay's addressed `chat`
       channel, which fans out to ONLY the seat named and is never buffered or
       broadcast (the wire keeps the secret, exactly as the private deal does).
       IL-MISTERU uses this so a refuter can show its card to the SUGGESTER and
       nobody else: the rest of the table learns THAT a card was shown (over the
       public move), never WHICH. `to` is a room seat; `ch` is a short channel
       tag; `x` is a short string the game reads however it likes. */
    whisper: (to, x, ch) => send({ t:'chat', to:[to | 0],
                                   ch: String(ch || 'g').slice(0, 12),
                                   x: String(x == null ? '' : x).slice(0, 240) }),
    /* A FRESH PRIVATE DEAL MID-GAME — {t:'redeal'}, HOST ONLY, for the
       hidden-hand games that need new secrets every round (a poker hand, a
       blackjack round). Takes the same two shapes planDeal returns — a
       { items, each } pool the relay shuffles with its own entropy, or an
       authoritative { mine:{ seat:payload } } map — and each seat is pushed
       ONLY its own share as a fresh {t:'mine'} into hooks.private, exactly
       like the start deal. Nothing here reads a payload; the relay refuses
       a non-host, an unstarted room, and a spam of re-deals. */
    redeal: d => {
      if (MP.mySeat !== 0 || !d) return false;
      let deal = null;
      if (d.mine && typeof d.mine === 'object') deal = { mine: d.mine };
      else if (Array.isArray(d.items) && d.items.length)
        deal = { items: d.items, each: Math.max(1, d.each | 0 || 1) };
      if (!deal) return false;
      send({ t:'redeal', deal });
      return true;
    },
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
  /* the private-deal inbox for THIS running game. A hidden-hand game
     publishes hooks.private(d, mates); it is fed the seat's own cards the
     moment they arrive (or straight away, if the relay's {t:'mine'} beat
     this start into the queue). Games with no private deal leave it null
     and the {t:'mine'} handler is a harmless no-op. */
  MP.privateHook = (hooks && typeof hooks.private === 'function')
    ? (d, mates) => { try { hooks.private(d, mates); } catch (e){} }
    : null;
  /* the private-word inbox for THIS running game (relay's addressed `chat`).
     A game that publishes hooks.whisper(fromSeat, x, ch) is handed each private
     line addressed to this seat — IL-MISTERU's refuter→suggester card reveal.
     A game without one drops the line. Room seats throughout, like every hook. */
  MP.whisperHook = (hooks && typeof hooks.whisper === 'function')
    ? (from, x, ch) => { try { hooks.whisper(from, x, ch); } catch (e){} }
    : null;
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
    /* the game is live now: hand it any private deal the relay pushed
       ahead of this start (it should arrive after `began`, but a buffered
       one is fed the instant the table can take it). */
    if (MP.privateHook && MP.pendingMine){
      const q = MP.pendingMine; MP.pendingMine = null;
      MP.privateHook(q.d, q.mates);
    }
  } catch (e){
    MP.live = false; MP.boardLive = false;
    MP.privateHook = null; MP.pendingMine = null; MP.whisperHook = null;
    /* the table never actually stood — the ante it just took comes back */
    stakeAbort(); stakeCleanup();
    setState('unreachable', 'That game would not start from the lobby. Nothing was lost.');
  }
}

/* THE PRIVATE HAND ARRIVES. Addressed to this seat only by the relay, on
   this seat's own replay bit. Treat `d` as our own cards and NEVER put it
   on the shared wire — the game's private hook feeds it straight to its
   engine's DEALERS.private, where opponents' hands stay null. If the
   table is not live yet (this outran the start), buffer it; onBegan flushes
   it the moment the game can take it. */
function onMine(m){
  /* `d` is this seat's own private inbox. TWO shapes are in the wild and both
     are the game's own choice: a POOL hand — an array of opaque items (poker's
     hole cards, a role, a secret character) — or, for an AUTHORITATIVE addressed
     deal, an OBJECT the game reads however it likes (Il-Misteru's { hand, caseId,
     solution? }). Either way this file never looks inside it; it just hands it
     to the running game's private hook. A non-array, non-object `d` is refused. */
  if (!m || typeof m.seat !== 'number') return;
  const isObj = m.d && typeof m.d === 'object';
  if (!isObj) return;                         /* neither an array nor an object */
  const d = Array.isArray(m.d) ? m.d.slice() : m.d;
  const mates = Array.isArray(m.mates) ? m.mates.slice() : null;
  if (MP.live && MP.privateHook){ MP.privateHook(d, mates); return; }
  MP.pendingMine = { d, mates };
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
  /* the table died before a result: nobody won, so nobody pays — every
     un-settled ante on this phone comes home (idempotent, id-guarded) */
  stakeAbort();
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
  /* the in-room views repaint their own containers IN PLACE. Redrawing the
     whole lobby here is what used to wipe a half-typed name out of the ask
     drawer every time the relay nudged — the party being busy made the
     drawer unusable, which is exactly backwards. */
  paintRoomAround();
  if (MP.panel === 'ask' && usesTableLobby()) paintAskPeople();
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
  if (usesTableLobby()){
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
  if (MP.live){
    /* WALKING OUT of a live staked game forfeits the ante — the pot the
       others are still playing for keeps it. Said now, not found later. */
    stakeForfeit();
    relay({ k:'bail', why:'They left the game.' }); MP.live = false;
  }
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
  /* cut off before a result — same law as tableStop: the ante comes back */
  stakeAbort();
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
        '<span class="pill">' + coinIco() + ' +' + coins + '</span>' +
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
  last:0, busy:false, data:null, err:null, tried:false,
  /* ONE FAILED POLL IS NOT AN OUTAGE. Walking out of a room tears the socket
     down with a presence poll still in flight, so the abort lands in the
     catch and the rooms screen greets the player with a red "Cannot reach
     the server" a beat after they pressed Back — nothing is wrong, and the
     next poll fills the list in. Telling a room full of people the server is
     down when it is not is worse than telling them a second later.

     So a blip has to happen TWICE before it is called an outage — but only
     once we have ever had an answer. A relay that is genuinely down at boot
     has never answered, and that player should be told immediately rather
     than watch a hopeful blank screen. */
  fails:0, everOK:false
};
const PR_FAIL_TRIP = 2;

/* WHAT I LOOK LIKE, for other people's phones.

   A photograph needs an account and an upload, so for most players it does
   not exist — and the chair they sat in was drawn from a hash of their NAME,
   which is stable, pretty, and not what they picked. Customising your face
   and then being the only person who can see it makes the whole wardrobe
   pointless.

   Three short ids ride beside the name: the face, the ring, the level badge.
   The relay carries them without understanding them (so a new cosmetic never
   needs a server deploy) and every other phone feeds them straight into the
   same KARTI_XP.describe() the app already draws everyone with. */
function myLook(){
  var out = {};
  try {
    var XP = window.KARTI_XP;
    if (!XP) return out;
    if (XP.avatar) { var f = XP.avatar(); if (f) out.f = String(f); }
    if (XP.equipped){
      var b = XP.equipped('border', 'karti'); if (b) out.b = String(b);
      var lb = XP.equipped('badge', 'karti');  if (lb) out.lb = String(lb);
    }
  } catch (e){}
  return out;
}

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
    try { ws.send(JSON.stringify({ t:'name', n: myPresenceName(), k: myLook() })); } catch (e){}
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
    /* ── FRIENDS: every social message (requests, list, DM, activity, invite
       delivery) rides this one namespaced type, so it needs exactly one line
       here and one in onServer(). It is handed straight to the friends module
       and touches nothing else on this socket. ── */
    if (m.t === 'friend'){
      if (typeof MP.friendHook === 'function'){ try { MP.friendHook(m); } catch (e){} }
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
      PR.data = j; PR.err = null; PR.fails = 0; PR.everOK = true;
    })
    .catch(e => {
      PR.fails++;
      /* hold the last good list while a blip is still only a blip — a screen
         that keeps showing the rooms it knew about beats one that blanks */
      if (!PR.everOK || PR.fails >= PR_FAIL_TRIP){
        PR.data = null;
        PR.err = (e && e.kind) || 'down';
      }
    })
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
    /* Every row here is a NAMED ACCOUNT — that is the relay's rule, not ours
       (a guest is counted and never listed). What each one offers is only
       what is true: a waiting player with a join handle can be JOINED; an
       idle player (or one holding a private/full room) can be ASKED; and
       somebody MID-GAME can act on nothing right now, so their row is not a
       button at all — it is drawn compact so sixteen people playing tombla
       do not push the room list off the screen. */
    const row = p => {
      const act = (p.s === 'waiting' && p.id) ? 'join'
                : (p.s !== 'playing') ? 'ask' : null;
      const tag = act ? 'button' : 'div';
      return '<' + tag + ' class="mp-person s-' + esc(p.s) + '"' +
        (act === 'join' ? ' data-pjoin="' + esc(p.id) + '" data-pg="' + esc(p.g || '') + '"'
       : act === 'ask'  ? ' data-pask="' + esc(p.n) + '" data-pg="' + esc(p.g || '') + '"'
       : '') +
        ' data-who="' + esc(p.n) + '">' +
        '<span class="mp-pav">' + esc((p.n || '?').slice(0, 2).toUpperCase()) + '</span>' +
        '<span class="mp-pw"><b>' + esc(p.n) + '</b><i>' + esc(whoWord(p)) + '</i></span>' +
        '<span class="mp-pgo">' + (act === 'join' ? 'Join' : act === 'ask' ? 'Ask' : '') +
        '</span></' + tag + '>';
    };
    body =
      (waiting.length ? '<div class="mp-dsub">A CHAIR YOU CAN TAKE NOW</div>' +
        waiting.map(row).join('') : '') +
      (idle.length ? '<div class="mp-dsub">OPEN AND NOT PLAYING</div>' +
        idle.map(row).join('') : '') +
      (playing.length ? '<div class="mp-dsub">MID-GAME</div><div class="mp-pills">' +
        playing.map(p => '<span class="mp-pill off">' + esc(p.n) +
          '<i>' + esc(whoWord(p)) + '</i></span>').join('') + '</div>' : '');
  }
  /* the honest remainder. `sockets` counts every connection, `here` counts
     the named people above, and one of the difference is our own socket. The
     relay deliberately does not break the rest down (guests + the invisible),
     so neither do we — but "nobody is around" over three unnamed connections
     would be a lie in the other direction, so it is said in BOTH the full and
     the empty state. Nothing here is on the wire that was not already. */
  if (WHO.got){
    const gap = Math.max(0, WHO.sockets - WHO.here - 1);
    if (gap > 0)
      body += '<p class="mp-quiet">' + gap + ' more ' + (gap === 1 ? 'is' : 'are') +
        ' connected but not named — guests without an account, or players gone ' +
        'invisible. A guest cannot be invited by name, but they can still see ' +
        'and tap any room in the list.</p>';
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

/* THE COUNT ON THE BOX. The room list is folded away now, so the number of open
   rooms has to live where it can be seen without opening anything — a
   notification bubble on the tile, exactly like an unread badge. It is painted
   on every poll whether the list is open or shut, so a room appearing while the
   player is looking at the game grid still announces itself. */
function roomsBubble(){
  const bub = $('#mp-roomsbub');
  if (!bub) return;
  let n = 0;
  try {
    const all = roomsFrom(PR.data);
    n = !all ? 0
      : (PR.data && typeof PR.data.open === 'number' ? PR.data.open : all.length);
  } catch (e){ n = 0; }
  if (PR.err){ bub.textContent = '—'; bub.classList.remove('hot'); return; }
  bub.textContent = String(n);
  bub.classList.toggle('hot', n > 0);      /* lit only when there is something to join */
}

function paintRooms(){
  roomsBubble();
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
  /* The one-tap names live in the who-is-around strip above, which is built
     from the `who` answer — every name in it is a signed-in account, so every
     tap is an invitation that can actually arrive. The chips that used to sit
     here were built from the PUBLIC presence list instead, which names guests
     too — and a guest has no account for an invitation to reach, so some of
     those chips were buttons that could only ever fail silently. Gone. */
  host.innerHTML =
    '<div class="mp-box"><b>Ask somebody by name.</b> They get it the moment they open ' +
    'KARTI — and it is still waiting for them if they are not on right now. Only a ' +
    'name with a KARTI account can receive one; the list above shows who is on. ' +
    '<span class="mp-quiet">In-app only: it will not light up a locked phone.</span></div>' +
    '<div class="tiny" style="margin:14px 0 7px">Their KARTI name</div>' +
    '<div style="display:grid;gap:8px">' +
      '<input class="field" id="mp-invname" maxlength="' + NAME_MAX + '" ' +
        'placeholder="THEIR NAME" autocomplete="off" spellcheck="false" ' +
        'aria-label="Who to invite">' +
      '<button class="btn" id="mp-invgo">' + ico('users') + ' Send the invitation</button>' +
    '</div>';
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
  /* A GAME THAT IS HERE BUT GATED (gameGated — its own contract refuses to
     start online; poker / 21·31 today). Land on the Online screen with THAT
     game picked, so its own reason is on the screen where the Open button
     would be — and neither join nor open a room whose Start can never light. */
  const gGate = g === 'cards' ? null : gameGated(g);
  if (gGate){
    MP.wantGame = g;
    window.KHOOK = null;
    K.go('mp');
    mpScreen();
    setState('unreachable', gameMeta(g).name + ' — ' + gGate);
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

/* the pot's landing on the game's own finish card — wrapped once, the
   moment KARTI_PARTY is on the page (retries while modules load) */
stakeWireResult(0);

window.KARTI_MP = {
  PNP, MP, pnpScreen, pnpStart, pnpHandover, pnpResume, pnpResult, pnpEnd, seatAt,
  mpScreen, mpLeave, checksum, applyRemote, beginOnline, onPeer, onServer, chooser,
  deckOptions, findDeck, mulberry32, illegalRemote, endMatch, dropOut,
  start, relay, defaultURL, cleanCode, setState,
  /* THE STAKES — read-only for game UIs (mode/ante/pot), plus the lobby
     verbs for the harness. All wallet bookkeeping; none of it can touch
     a seed, a deal or the wire. */
  stakeInfo, stakeRoom, stakeSettle, stakeSettleTeam, stakeAbort, stakeArm,
  /* how far away the server is, measured rather than guessed */
  pingStats, measure, measureHTTP, healthURL,
  /* the three-games era */
  GAMES, GAME_KEYS, gameMeta, cleanGame, gamePlayable, gameGated, openFor, pickWaiting,
  beginBoard, boardRemote, hostStartBoard, myColour, backToRooms, openByGame,
  /* who's-online panel + the room list (one poller, two paints) */
  PR, onScreen, presenceMount, presenceUnmount, presencePoll, presencePaint,
  paintHomePanel, paintRooms, roomsFrom, ago,
  presenceURL, presenceBeaconOpen, presenceBeaconClose, myPresenceName,
  joinRoom, joinWaiting, lobby,
  /* invitations */
  INBOX, inboxAdd, inboxDrop, inboxLive, sessionToken, canInvite,
  /* FRIENDS: send a social message on whichever socket is live (room or the
     home-screen beacon), same as sendAny() uses internally. Additive export. */
  friendSend: (o) => sendAny(o),
  /* FRIENDS: a read-only copy of "recently played with" (display names only,
     never account keys — the relay never sends keys). Used for the one-tap
     "add a recent opponent" list. Additive export. */
  recent: () => Array.isArray(WHO.recent) ? WHO.recent.slice() : [],
  sendInvite, acceptInvite, declineInvite, paintInvites, invitePanel, inviteCards,
  /* ── the shared lobby: one screen, every party game feeds it ── */
  gameLobby, lobbyReport, tableLobby, rosterSeats, tableCanStart, onRoster, onBegan,
  tableRemote, tableStop, SEATS_FALLBACK,
  /* ── who is around ── */
  WHO, whoAsk, onWho, paintSocial, paintOnlineSocial, knockAdd, knockAnswer,
  recentStrip, knockCards, roomAroundHTML, paintRoomAround, askPeopleHTML,
  paintAskPeople,
  RELAY_URL, RELAY_HEALTH, RELAY_PRESENCE, CODE_LEN, CODE_ALPHABET,
  /* the presence poller's own state, exposed so a harness can prove the
     blip-vs-outage rule without having to take the relay down */
  _PR: PR, PR_FAIL_TRIP,
  ROOM_ROWS, PRESENCE_LOBBY, PRESENCE_MIN_GAP,
  /* older name kept so nothing that reached for it breaks */
  mpConnect: (action, code) => start(action, code)
};

})();
