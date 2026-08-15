/* ═══════════════════════════════════════════════════════════════════
   KARTI — skarta.js
   SKARTA — the Maltese shedding game.  THE RULES ENGINE.  No DOM.

   "Skarta" is what you do to a card you do not want: you discard it.
   Get rid of your hand before the rest of the table gets rid of theirs.

   ┌──────────────────────────────────────────────────────────────┐
   │  THIS IS NOT UNO AND MUST NEVER BE CALLED UNO.               │
   │  Shedding mechanics are not anybody's property; the NAME,    │
   │  the colour words, the card artwork and the shouted call     │
   │  are. So every one of those is ours: Maltese suits, Maltese  │
   │  card names, and the call is "LAST ONE".  Do not rename      │
   │  anything in here to match another game, however tempting.   │
   └──────────────────────────────────────────────────────────────┘

   ═══════════════════════════════════════════════════════════════════
   A MATCH IS FOUR THINGS: (gid, opts, seed, moves)
   ═══════════════════════════════════════════════════════════════════
   Everything else — the deck, the hands, the pile, whose go it is — is a
   pure function of those four. That is not tidiness, it is the entire
   requirement for playing this over a relay:

     · THE RNG'S POSITION LIVES IN THE STATE (S.rng, an integer), not in
       a closure. An engine whose randomness hides in a closure cannot be
       snapshotted, so a reconnecting phone can never be put back at the
       table it left. This is the thing that has to be right first.
     · NOTHING IN HERE CALLS Math.random — except once, to pick a seed for
       a brand new local match, and that seed is then recorded.
     · THE AI HAS ITS OWN RNG STREAM (aiRnd), derived from the seed and
       the move number and never touching S.rng. If the machine's coin
       flips came out of the shared stream, replaying a move log would
       leave the deck in a different order on every phone, because a
       replay applies the logged move instead of re-asking the AI.
     · MOVES NAME CARDS BY uid, NEVER BY HAND POSITION. A player can drag
       their hand into any order they like — that order is local decoration
       and is deliberately NOT replicated — so "play card 3" means
       different things on two phones. "Play card c47" does not.

   Transport (rooms, seats, sockets) is somebody else's file. This one
   exposes snapshot/load/apply/view/rollbackTo/setOwner and knows nothing
   about how a move arrived.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function (root) {

/* ═══════════════════════════════════════════════════════════════════
   1. THE DECK
   ═══════════════════════════════════════════════════════════════════ */

/* The four suits. Maltese things, not colour words — "red/green/blue/
   yellow" is the other game's vocabulary and we do not borrow it. Each
   still carries a hue because a shedding game is unplayable if you
   cannot tell two suits apart at a glance on a phone. */
const SUITS = [
  { k:'festa',   n:'FESTA',   mt:'Il-Festa',    c:'#E8452C', c2:'#8E1B0E', ink:'#FFF1EC',
    tag:'Fireworks, brass and a village that has not slept since Wednesday.' },
  { k:'bahar',   n:'BAĦAR',   mt:'Il-Baħar',    c:'#2E9BE8', c2:'#0E4A7A', ink:'#EDF7FF',
    tag:'Blue, warm, and full of people who cannot swim.' },
  { k:'razzett', n:'RAŻŻETT', mt:'Ir-Rażżett',  c:'#49B44C', c2:'#1C5E20', ink:'#F0FFF0',
    tag:'Rubble walls, one furious dog, and lunch that was alive on Friday.' },
  { k:'bajtra',  n:'BAJTRA',  mt:'Il-Bajtra',   c:'#F5A81C', c2:'#8A5300', ink:'#FFF8EA',
    tag:'Prickly pear. Delicious, and you will be picking spines out for a week.' },
];
const SUIT_KEYS = SUITS.map(s => s.k);
const suitOf = k => SUITS.find(s => s.k === k) || null;

/* The five things a card can BE. `kind` is the rules identity; the name
   and the joke are flavour and can be rewritten without touching a rule.
   `eff` is what the card DOES and is what the player is shown mid-turn;
   `mt` and `txt` are the joke and live in the rules sheet. */
const KINDS = {
  number: { n:'', mt:'', pts:c => c.num },
  skip:   { n:'Come Back Tomorrow', mt:'Erġa\' Ejja Għada', pts:() => 20,
            txt:'The clerk looked at your form, sighed, and shut the window.',
            eff:'The next player loses their turn.' },
  reverse:{ n:'The Marsa U-Turn',   mt:'Dawra ta\' Marsa',  pts:() => 20,
            txt:'Three lanes, no signs, and everybody suddenly going the other way.',
            eff:'Play turns around. With two players it just skips them.' },
  draw2:  { n:'The Mother-In-Law',  mt:'Il-Kunjata',        pts:() => 20,
            txt:'She came for coffee and brought two bags of things you did not ask for.',
            eff:'Next player takes 2 — or stacks another draw card on top.' },
  wild:   { n:'The Band Club',      mt:'Il-Każin',          pts:() => 50,
            txt:'Everyone ends up here, whichever side of the square they were born on.',
            eff:'Play it on anything. You name the suit.' },
  kaxxa:  { n:'The Infernal Machine', mt:'Il-Kaxxa Infernali', pts:() => 50,
            txt:'The festa finale. The whole street feels it, including your own windows.',
            eff:'Name the suit, then choose the charge: FOUR, or the whole box — SEVEN.' },
};

/* 108 cards, the shape a shedding deck has had since long before anybody
   trademarked one: 0 once, 1-9 twice, three actions twice, per suit, plus
   eight suitless cards.

   The uid is positional and therefore identical on every phone that builds
   the deck — which is exactly why a move can name a card by uid and mean
   the same card everywhere. Do not make these random. */
function buildDeck() {
  const d = [];
  let n = 0;
  const push = (suit, kind, num) => d.push({
    uid: 'c' + (n++), suit: suit || null, kind, num: (num === undefined ? null : num),
  });
  for (const s of SUIT_KEYS) {
    push(s, 'number', 0);
    for (let v = 1; v <= 9; v++) { push(s, 'number', v); push(s, 'number', v); }
    for (const k of ['skip', 'reverse', 'draw2']) { push(s, k); push(s, k); }
  }
  for (let i = 0; i < 4; i++) push(null, 'wild');
  for (let i = 0; i < 4; i++) push(null, 'kaxxa');
  return d;                                   /* 4*(1+18+6) + 8 = 108 */
}

const isDraw = c => c.kind === 'draw2' || c.kind === 'kaxxa';
const isWild = c => c.kind === 'wild' || c.kind === 'kaxxa';
function cardPoints(c) { return KINDS[c.kind].pts(c); }

/* A short label for logs, tests and screen readers. Never "Red 5". */
function cardLabel(c) {
  if (!c) return '';
  if (c.kind === 'number') return suitOf(c.suit).n + ' ' + c.num;
  const k = KINDS[c.kind];
  return c.suit ? suitOf(c.suit).n + ' — ' + k.mt : k.mt;
}

/* ═══════════════════════════════════════════════════════════════════
   2. THE HOUSE RULES, IN ONE PLACE
   Every number a player could argue about is here, named, so the rules
   sheet in the UI and the engine can never disagree with each other.
   ═══════════════════════════════════════════════════════════════════ */
const RULES = {
  HAND: 7,              /* dealt to each player */
  CHAIN_CAP: 12,        /* THE CAP — see §5. This is what stops stacking */
  PENALTY: 2,           /* cards for forgetting to call it */
  KAXXA_SMALL: 4,       /* the safe charge */
  KAXXA_BIG: 7,         /* the whole box — and it singes you too */
  /* WHAT YOU SHOUT ON ONE CARD.
     It was 'AĦĦAR WAĦDA!' and that was wrong: a shout you make under time
     pressure has to be short and instantly readable, not a foreign phrase
     you have to parse. It is NOT, and will never be, the three-letter word
     the other game uses — that is a live Mattel trademark, this game is
     unmistakably an Uno-like, and the two together is the exact combination
     that draws a takedown. A DMCA here removes the whole KARTI repository,
     not just this screen. 'LAST ONE' is the owner's own wording and it is
     the right one: it says exactly what it means, in plain English, with no
     trademark anywhere near it. The GAME is still SKARTA. */
  CALL: 'LAST ONE',     /* what you shout on one card */
  CATCH: 'CAUGHT!',     /* what you shout at somebody who forgot */
};

/* who is sitting in a chair. THE SAME MECHANISM serves the local AI
   toggle and the host's "fill the empty chairs with bots", which is why
   there is one word for it rather than a boolean and a flag.
     me  — a human on this device, the one whose hand is face up
     hot — a human on this device taking a turn (pass-the-phone)
     ai  — the machine
     net — a human on somebody else's device                            */
const OWNERS = ['me', 'hot', 'ai', 'net'];
const isAI = p => p.owner === 'ai';
const isLocal = p => p.owner === 'me' || p.owner === 'hot';

/* ═══════════════════════════════════════════════════════════════════
   3. RANDOMNESS — ALL OF IT, AND WHERE IT LIVES
   ═══════════════════════════════════════════════════════════════════ */

/* one step of mulberry32 over a plain integer. No closure: the caller
   owns the position, so the position can be snapshotted and shipped. */
function step(a) {
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/* THE deck stream. Consumed by the deal and by a reshuffle, and by
   nothing else in this file. Everything it decides is replayable from
   (seed, moves) alone, which is what makes rollbackTo() exact. */
function rnd(S) { const r = step(S.rng | 0); S.rng = r.a; return r.v; }

/* The machine's stream, deliberately SEPARATE. It is derived fresh from
   (seed, moveNo, seat, salt) every time, so it is reproducible for tests
   but never advances S.rng — because a replay applies the move the AI
   made rather than asking it again, and a shared stream would therefore
   leave the deck in a different order on a replaying phone. */
function aiRnd(S, pid, salt) {
  let a = (S.seed ^ Math.imul(S.moveNo + 1, 0x9E3779B1) ^ Math.imul(pid + 1, 0x85EBCA77)
           ^ Math.imul((salt || 0) + 1, 0xC2B2AE3D)) | 0;
  return step(a).v;
}

/* Fisher-Yates off the deck stream. */
function shuffle(S, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(S) * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* kept exported because the UI and the tests both want a throwaway stream */
function mulberry32(a) { return function () { const r = step(a); a = r.a; return r.v; }; }

/* ═══════════════════════════════════════════════════════════════════
   4. A MATCH
   ═══════════════════════════════════════════════════════════════════ */

/* opts: { seats:[{name, owner:'me'|'hot'|'ai'|'net', level}] }
   Anything not given is defaulted here and then written back into
   S.opts, so S.opts is always the COMPLETE recipe — a peer given
   (gid, opts, seed, moves) can rebuild this table exactly. */
function newGame(o) {
  o = o || {};
  const seatsIn = (o.seats || []).slice(0, 4);
  if (seatsIn.length < 2) throw new Error('SKARTA needs at least two seats');

  const seats = seatsIn.map((s, i) => {
    /* `ai:true` is still accepted so older callers keep working */
    let owner = s.owner;
    if (!owner) owner = s.ai ? 'ai' : (i === 0 ? 'me' : 'hot');
    if (OWNERS.indexOf(owner) < 0) owner = 'hot';
    return { name: s.name || ('Player ' + (i + 1)), owner,
             level: owner === 'ai' ? (s.level || 3) : 0 };
  });

  const seed = (o.seed === undefined || o.seed === null)
    ? (Math.random() * 0xFFFFFFFF) >>> 0 : (o.seed >>> 0);
  const gid = o.gid || ('sk' + seed.toString(36));

  const S = {
    v: 2,                 /* snapshot format */
    gid, seed,
    rng: seed | 0,        /* THE POSITION, in the state, snapshotable */
    opts: { seats },
    moves: [],            /* the log. (gid, opts, seed, moves) is the match */
    players: seats.map((s, i) => ({
      id: i, name: s.name, owner: s.owner, level: s.level, hand: [], said: false,
    })),
    deck: [], discard: [],
    suit: null,           /* the suit IN FORCE — a wild changes it */
    turn: 0,
    dir: 1,               /* +1 clockwise, -1 after a Marsa U-Turn */
    chain: { n: 0, kind: null, closed: false },  /* the growing draw pile */
    singed: {},           /* pid -> true : owes one skipped turn (see §5) */
    dodge: {},            /* pid -> {suit: count}  — the AI's memory */
    pending: null,        /* {type:'drawn', pid, uid} awaiting play-or-keep */
    call: null,           /* {pid, until} — somebody is on one card and quiet */
    moveNo: 0,
    log: [],              /* human-readable commentary. NOT the move log. */
    over: null,           /* {winner, scores:[…]} */
  };
  for (const p of S.players) S.dodge[p.id] = { festa:0, bahar:0, razzett:0, bajtra:0 };

  S.deck = shuffle(S, buildDeck());
  for (let i = 0; i < RULES.HAND; i++)
    for (const p of S.players) p.hand.push(S.deck.pop());

  /* The starter must be a plain number. An action card on the flip means
     arguing about who it hits before anybody has played, and a wild means
     asking a player to name a suit before they have seen a card. Anything
     else goes to the bottom of the deck and we flip again. */
  let guard = 0;
  while (guard++ < 200) {
    const c = S.deck.pop();
    if (!c) break;
    if (c.kind === 'number') { S.discard.push(c); S.suit = c.suit; break; }
    S.deck.unshift(c);
  }
  say(S, cardLabel(top(S)) + ' on the table. Seven each.');
  return S;
}

const top = S => S.discard[S.discard.length - 1] || null;
const player = (S, id) => S.players[id];
function say(S, text) { S.log.push({ n: S.moveNo, text }); if (S.log.length > 120) S.log.shift(); }

/* find a card in a hand by uid — the only way a move is allowed to name one */
function handIndex(S, pid, uid) {
  const h = player(S, pid).hand;
  for (let i = 0; i < h.length; i++) if (h[i].uid === uid) return i;
  return -1;
}

/* ═══════════════════════════════════════════════════════════════════
   5. LEGALITY — the whole of "what can I put down"
   ═══════════════════════════════════════════════════════════════════
   Plain turn: match the SUIT in force, or the NUMBER, or the ACTION
   (a Marsa U-Turn goes on any Marsa U-Turn), or play a suitless card.

   Chain turn (somebody has pointed a draw card at you): you may only
   answer with another draw card, and only these answers count —
     · IL-KUNJATA (+2)  answers a Kunjata chain
     · IL-KAXXA         answers anything
     · a Kunjata may NOT be dropped on a Kaxxa chain
   …and once the pile reaches THE CAP (12) the chain is CLOSED: no
   answer is legal and the pile is eaten. That cap is what makes the
   stacking rule terminate — every answer adds at least 2, so a chain
   can be answered at most six times and then it is over.               */

function chainLive(S) { return S.chain.n > 0; }

function canPlay(S, c) {
  if (S.over || !c) return false;
  const t = top(S);
  if (chainLive(S)) {
    if (S.chain.closed) return false;
    if (c.kind === 'kaxxa') return true;
    if (c.kind === 'draw2') return S.chain.kind === 'draw2';
    return false;
  }
  if (isWild(c)) return true;
  if (c.suit === S.suit) return true;
  if (c.kind === 'number') return t && t.kind === 'number' && t.num === c.num;
  return t && t.kind === c.kind;      /* skip on skip, u-turn on u-turn, kunjata on kunjata */
}

/* indices into that player's hand, in that player's own current order */
function legalMoves(S, pid) {
  const p = player(S, pid);
  const out = [];
  for (let i = 0; i < p.hand.length; i++) if (canPlay(S, p.hand[i])) out.push(i);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   6. TURN ORDER
   nextSeat() is the ONLY place the singed skip is honoured, so a player
   who lit the whole box cannot dodge the consequence through any route.
   ═══════════════════════════════════════════════════════════════════ */
function wrap(S, i) { const n = S.players.length; return ((i % n) + n) % n; }

function advance(S, steps) {
  let t = S.turn;
  for (let i = 0; i < (steps || 1); i++) t = wrap(S, t + S.dir);
  /* IL-KAXXA burnt this one too — the turn arrives and walks straight past */
  let guard = 0;
  while (S.singed[t] && guard++ <= S.players.length) {
    delete S.singed[t];
    say(S, player(S, t).name + ' — still picking Kaxxa out of the roof. Turn lost.');
    t = wrap(S, t + S.dir);
  }
  S.turn = t;
}

/* ═══════════════════════════════════════════════════════════════════
   7. PLAYING A CARD
   play() is atomic: if the card needs an answer the caller has not
   given, NOTHING is mutated and it reports what it needs. That is what
   lets the UI ask the question after the tap, and lets a test drive the
   same card with the answer supplied up front.
   ═══════════════════════════════════════════════════════════════════ */

/* the index-taking form the local UI uses. It resolves to a uid and goes
   through exactly the same door as a move off the wire. */
function play(S, pid, idx, opts) {
  const c = player(S, pid).hand[idx];
  if (!c) return { ok: false, err: 'no-card' };
  return playUid(S, pid, c.uid, opts);
}

function playUid(S, pid, uid, opts) {
  opts = opts || {};
  if (S.over) return { ok: false, err: 'over' };
  if (S.turn !== pid) return { ok: false, err: 'not-your-turn' };
  if (S.pending && S.pending.type !== 'drawn') return { ok: false, err: 'answer-first' };
  const p = player(S, pid);
  const idx = handIndex(S, pid, uid);
  if (idx < 0) return { ok: false, err: 'no-card' };
  const c = p.hand[idx];
  if (!canPlay(S, c)) return { ok: false, err: 'illegal' };

  if (isWild(c) && !suitOf(opts.suit)) return { ok: false, need: 'suit', card: c };
  if (c.kind === 'kaxxa' && opts.charge !== RULES.KAXXA_SMALL && opts.charge !== RULES.KAXXA_BIG)
    return { ok: false, need: 'charge', card: c };

  p.hand.splice(idx, 1);
  S.discard.push(c);
  S.pending = null;
  S.suit = c.suit || opts.suit;
  S.moveNo++;
  say(S, p.name + ' — ' + cardLabel(c) + (isWild(c) ? ' → ' + suitOf(S.suit).n : ''));

  /* Somebody just went out. Nothing else on the card matters. */
  if (!p.hand.length) { finish(S, pid); return { ok: true, won: true }; }

  /* One card left and they have not opened their mouth yet: the window
     is open on them until the next player has had their go. */
  if (p.hand.length === 1) {
    p.said = false;
    S.call = { pid, until: S.moveNo + 1 };
  } else if (S.call && S.call.pid === pid) S.call = null;

  applyEffect(S, p, c, opts);
  expireCall(S);
  return { ok: true };
}

function applyEffect(S, p, c, opts) {
  switch (c.kind) {
    case 'number':
      advance(S, 1); break;

    case 'skip':
      advance(S, 1);
      say(S, player(S, S.turn).name + ': come back tomorrow.');
      advance(S, 1);
      break;

    case 'reverse':
      /* Two at the table means "turn around" is the same seat again, which
         is a card that does nothing — so heads-up it is a skip instead. */
      if (S.players.length === 2) { advance(S, 2); }
      else { S.dir *= -1; say(S, 'Play turns around.'); advance(S, 1); }
      break;

    case 'draw2':
      S.chain.n += 2; S.chain.kind = 'draw2';
      advance(S, 1);
      break;

    case 'wild':
      advance(S, 1); break;

    case 'kaxxa': {
      const big = opts.charge === RULES.KAXXA_BIG;
      S.chain.n += big ? RULES.KAXXA_BIG : RULES.KAXXA_SMALL;
      S.chain.kind = 'kaxxa';
      if (big) {
        /* THE TRADE-OFF. Seven cards instead of four, and the blast takes
           the person who lit it: you miss your own next turn. It applies
           the moment you light it — stacking it away does not save you. */
        S.singed[p.id] = true;
        say(S, p.name + ' — THE WHOLE BOX. Seven, and a turn of their own for it.');
      } else {
        say(S, p.name + ' — half a box. Four.');
      }
      advance(S, 1);
      break;
    }
  }
  if (S.chain.n >= RULES.CHAIN_CAP) {
    S.chain.closed = true;
    say(S, 'THE CAP — ' + S.chain.n + ' on the pile. Nobody may pass it on again.');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   8. DRAWING
   ═══════════════════════════════════════════════════════════════════ */

/* The deck runs out around move sixty in a four-hander. Everything but
   the visible top card is shuffled and becomes the deck again — off the
   deck stream, so a replaying phone reshuffles identically. */
function refill(S) {
  if (S.deck.length) return true;
  if (S.discard.length <= 1) return false;
  const t = S.discard.pop();
  S.deck = shuffle(S, S.discard.splice(0, S.discard.length));
  S.discard = [t];
  say(S, 'Deck finished — the pile is shuffled back in.');
  return S.deck.length > 0;
}

function take(S, pid, n) {
  const p = player(S, pid);
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (!S.deck.length && !refill(S)) break;   /* nothing left anywhere: draw nothing */
    p.hand.push(S.deck.pop());
    got++;
  }
  if (p.hand.length > 1 && S.call && S.call.pid === pid) S.call = null;
  return got;
}

/* Eat the chain that is pointed at you. Drawing it ends your turn — that
   is true of a Kunjata and of a Kaxxa alike, which is why the only thing
   separating +4 from +7 is the singe on the person who lit it. */
function takeChain(S, pid) {
  if (S.over) return { ok: false, err: 'over' };
  if (S.turn !== pid) return { ok: false, err: 'not-your-turn' };
  if (!chainLive(S)) return { ok: false, err: 'no-chain' };
  const n = S.chain.n;
  take(S, pid, n);
  noteDodge(S, pid);
  S.chain = { n: 0, kind: null, closed: false };
  S.moveNo++;
  say(S, player(S, pid).name + ' — eats all ' + n + '.');
  advance(S, 1);
  expireCall(S);
  return { ok: true, drew: n };
}

/* Can't (or won't) play: take one. If it happens to go, you may put it
   straight down — pending holds its uid until you say. */
function drawOne(S, pid) {
  if (S.over) return { ok: false, err: 'over' };
  if (S.turn !== pid) return { ok: false, err: 'not-your-turn' };
  if (chainLive(S)) return { ok: false, err: 'chain-first' };
  if (S.pending) return { ok: false, err: 'answer-first' };
  const p = player(S, pid);
  const got = take(S, pid, 1);
  noteDodge(S, pid);
  if (!got) {                        /* table is bone dry — the turn just passes */
    S.moveNo++; say(S, p.name + ' — nothing left to draw from.');
    advance(S, 1); expireCall(S);
    return { ok: true, drew: 0, playable: false };
  }
  const c = p.hand[p.hand.length - 1];
  say(S, p.name + ' — draws.');
  if (canPlay(S, c)) {
    /* by uid, not by index: the player may drag their hand around while
       this is in the air and the pending card must survive it */
    S.pending = { type: 'drawn', pid, uid: c.uid };
    return { ok: true, drew: 1, playable: true, card: c };
  }
  S.moveNo++;
  advance(S, 1); expireCall(S);
  return { ok: true, drew: 1, playable: false, card: c };
}

/* keep the drawn card and end the turn */
function pass(S, pid) {
  if (!S.pending || S.pending.type !== 'drawn' || S.pending.pid !== pid)
    return { ok: false, err: 'nothing-to-pass' };
  S.pending = null;
  S.moveNo++;
  say(S, player(S, pid).name + ' — keeps it, says nothing.');
  advance(S, 1);
  expireCall(S);
  return { ok: true };
}

/* ═══════════════════════════════════════════════════════════════════
   9. "LAST ONE" — the call, and the cost of forgetting it
   ═══════════════════════════════════════════════════════════════════
   Down to one card you shout LAST ONE. You have until the next player
   has finished their go. Stay quiet that long and anybody at the table
   may shout CAUGHT — and you take two.                                 */
function sayAhhar(S, pid) {
  const p = player(S, pid);
  if (p.hand.length !== 1) return { ok: false, err: 'not-on-one' };
  p.said = true;
  if (S.call && S.call.pid === pid) S.call = null;
  say(S, p.name + ': "' + RULES.CALL + '"');
  return { ok: true };
}

function canCatch(S, targetPid) {
  const t = S.players[targetPid];
  return !!(S.call && S.call.pid === targetPid && t && !t.said &&
            t.hand.length === 1 && S.moveNo <= S.call.until && !S.over);
}

function catchOut(S, byPid, targetPid) {
  if (byPid === targetPid) return { ok: false, err: 'catch-yourself' };
  if (!canCatch(S, targetPid)) return { ok: false, err: 'nothing-to-catch' };
  take(S, targetPid, RULES.PENALTY);
  S.call = null;
  say(S, player(S, byPid).name + ': "' + RULES.CATCH + '" — ' + player(S, targetPid).name +
         ' forgot to call — ' + RULES.PENALTY + ' cards.');
  return { ok: true, drew: RULES.PENALTY };
}

/* the window has passed with nobody noticing: they got away with it */
function expireCall(S) {
  if (S.call && S.moveNo > S.call.until) {
    say(S, player(S, S.call.pid).name + ' got away with it — nobody was paying attention.');
    S.call = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   9b. THE ORDER OF YOUR OWN HAND — LOCAL, AND DELIBERATELY NOT SHARED
   ═══════════════════════════════════════════════════════════════════
   Whose business it is: yours. The engine never sorts a hand behind your
   back — only when asked, because a hand that rearranges itself while you
   are reaching for a card is worse than a messy one.

   Neither of these is a MOVE. They are not logged, they do not advance
   the clock, and they are not replicated: how you like your cards
   arranged is not the other players' business and shipping it would be a
   packet per fidget. That is safe precisely because every real move names
   its card by uid, so two phones holding the same hand in different
   orders still agree completely about the game.
   ═══════════════════════════════════════════════════════════════════ */
const SUIT_AT = {}; SUIT_KEYS.forEach((k, i) => { SUIT_AT[k] = i; });
const KIND_AT = { number: 0, skip: 1, reverse: 2, draw2: 3, wild: 0, kaxxa: 1 };
function sortKey(c) {
  return [ c.suit ? SUIT_AT[c.suit] : 9, KIND_AT[c.kind], c.kind === 'number' ? c.num : 0 ];
}

function sortHand(S, pid) {
  player(S, pid).hand.sort((a, b) => {
    const x = sortKey(a), y = sortKey(b);
    return (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);
  });
  return { ok: true };
}

/* drag-and-drop: move the card at `from` so it sits at `to` */
function moveCard(S, pid, from, to) {
  const p = player(S, pid);
  if (from === to) return { ok: true };
  if (from < 0 || from >= p.hand.length) return { ok: false, err: 'no-card' };
  const at = Math.max(0, Math.min(p.hand.length - 1, to));
  p.hand.splice(at, 0, p.hand.splice(from, 1)[0]);
  return { ok: true, to: at };
}

/* ═══════════════════════════════════════════════════════════════════
   10. THE END
   ═══════════════════════════════════════════════════════════════════ */
function finish(S, winner) {
  const scores = S.players.map(p => ({
    id: p.id, name: p.name, cards: p.hand.length,
    points: p.hand.reduce((n, c) => n + cardPoints(c), 0),
  }));
  S.over = { winner, scores };
  S.call = null; S.pending = null;
  say(S, player(S, winner).name + ' — out. Skarta kollox.');
}

/* ═══════════════════════════════════════════════════════════════════
   11. THE MACHINE
   ═══════════════════════════════════════════════════════════════════
   Three levels, one brain, more of it switched on as you go up.
     1 · EASY  — legal moves, taken more or less at random.
     2 · FAIR  — sheds the expensive cards, keeps its wilds back.
     3 · NASTY — all of the above, plus it WATCHES YOU: every time you
         draw instead of playing it notes which suit was up, and it comes
         back to that suit for the rest of the game.

   Every coin flip in here comes off aiRnd, never off S.rng. See §3.
   ═══════════════════════════════════════════════════════════════════ */

/* the memory. Called every time somebody declines to play on a suit. */
function noteDodge(S, pid) {
  if (S.suit && S.dodge[pid]) S.dodge[pid][S.suit] = (S.dodge[pid][S.suit] || 0) + 1;
}

function nextSeat(S, from) {
  /* who actually gets the turn after `from`, singes and all — the AI
     needs this to know whether a stacked chain bounces back to itself */
  let t = wrap(S, from + S.dir), guard = 0;
  const singed = Object.assign({}, S.singed);
  while (singed[t] && guard++ <= S.players.length) { delete singed[t]; t = wrap(S, t + S.dir); }
  return t;
}

function handSuits(hand) {
  const m = { festa:0, bahar:0, razzett:0, bajtra:0 };
  for (const c of hand) if (c.suit) m[c.suit]++;
  return m;
}

/* which suit to name on a wild: the one you are holding most of, and on
   a tie the one the next player has been running away from */
function pickSuit(S, pid, victim) {
  const p = player(S, pid);
  const mine = handSuits(p.hand);
  const dodged = (S.dodge[victim] || {});
  let best = SUIT_KEYS[0], bestScore = -1;
  for (const k of SUIT_KEYS) {
    const score = mine[k] * 10 + (p.level >= 3 ? Math.min(dodged[k] || 0, 3) * 3 : 0)
                  + (k === S.suit ? 0.5 : 0);
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return best;
}

/* FOUR, or the whole box. See §7 for the trade-off itself. */
function pickCharge(S, pid) {
  const p = player(S, pid);
  const v = nextSeat(S, pid);
  const victim = player(S, v);
  if (p.level < 2) return RULES.KAXXA_SMALL;
  /* Seven buries somebody who is about to go out, and that is worth a
     turn. It is also worth it when you were never going out this lap
     anyway. Any other time the tempo is the better half of the card. */
  if (victim.hand.length <= 2) return RULES.KAXXA_BIG;
  if (p.hand.length >= 8 && victim.hand.length <= 4) return RULES.KAXXA_BIG;
  return RULES.KAXXA_SMALL;
}

/* what the AI would do, as a MOVE (uid-named, ready for apply()) */
function aiChoose(S, pid) {
  const p = player(S, pid);
  const moves = legalMoves(S, pid);
  const asMove = (idx, o) => Object.assign({ t: 'play', uid: p.hand[idx].uid, idx }, o || {});

  if (chainLive(S)) {
    if (!moves.length) return { t: 'take', act: 'chain' };
    /* Do not pass the parcel if the parcel comes straight back: in a
       two-hander over a Kaxxa the singed seat is skipped and the pile
       lands on you again, bigger. */
    if (p.level >= 2 && nextSeat(S, pid) === pid) return { t: 'take', act: 'chain' };
    /* smallest answer that keeps the chain moving, Kunjata before Kaxxa */
    const sorted = moves.slice().sort((a, b) =>
      (p.hand[a].kind === 'kaxxa' ? 1 : 0) - (p.hand[b].kind === 'kaxxa' ? 1 : 0));
    const idx = p.level < 2 ? moves[0] : sorted[0];
    const c = p.hand[idx];
    const o = { act: 'play' };
    if (isWild(c)) o.suit = pickSuit(S, pid, nextSeat(S, pid));
    if (c.kind === 'kaxxa') o.charge = pickCharge(S, pid);
    return asMove(idx, o);
  }

  if (!moves.length) return { t: 'draw', act: 'draw' };

  if (p.level < 2) {                       /* EASY: anything legal */
    const idx = moves[Math.floor(aiRnd(S, pid, 1) * moves.length)];
    const c = p.hand[idx];
    const o = { act: 'play' };
    if (isWild(c)) o.suit = pickSuit(S, pid, nextSeat(S, pid));
    if (c.kind === 'kaxxa') o.charge = RULES.KAXXA_SMALL;
    return asMove(idx, o);
  }

  const v = nextSeat(S, pid);
  const victim = player(S, v);
  const mine = handSuits(p.hand);
  const dodged = S.dodge[v] || {};

  let best = null;
  for (const idx of moves) {
    const c = p.hand[idx];
    let sc = 0;

    /* A wild is the card that gets you out of a suit you cannot follow.
       Spend it now and you are stuck later — so it is worth a lot LESS
       than its face value while a plain card will do. */
    if (c.kind === 'wild')  sc -= 34;
    if (c.kind === 'kaxxa') sc -= 26;
    else if (c.kind === 'number') sc += c.num * 1.6;      /* dump the big ones */
    if (c.kind === 'draw2' || c.kind === 'skip') sc += 12;
    if (c.kind === 'reverse') sc += 8;

    /* somebody is one card away from taking the whole thing: hit them */
    if (victim.hand.length <= 2) {
      if (c.kind === 'draw2') sc += 40;
      if (c.kind === 'skip') sc += 34;
      if (c.kind === 'kaxxa') sc += 48;
      if (c.kind === 'reverse' && S.players.length > 2) sc += 18;
    }
    /* keep the suit you actually hold — burning your last BAĦAR to play a
       number strands the four you were going to follow it with */
    if (c.suit) sc += Math.min(mine[c.suit], 4) * 2.5;
    /* §11: the suit they keep running away from */
    if (p.level >= 3 && c.suit) sc += Math.min(dodged[c.suit] || 0, 4) * 5;
    /* two cards left: take whatever gets you to one */
    if (p.hand.length <= 2 && !isWild(c)) sc += 20;

    if (!best || sc > best.sc) best = { idx, sc, c };
  }

  const o = { act: 'play' };
  if (isWild(best.c)) o.suit = pickSuit(S, pid, v);
  if (best.c.kind === 'kaxxa') o.charge = pickCharge(S, pid);
  return asMove(best.idx, o);
}

/* Take one whole AI turn, THROUGH apply() — so the machine is held to
   exactly the same legality check as a tap or a packet off the wire. */
function aiTurn(S) {
  const pid = S.turn;
  const p = player(S, pid);
  if (S.over || !isAI(p)) return { ok: false };

  /* the drawn card is still in the air from the last call */
  if (S.pending && S.pending.type === 'drawn' && S.pending.pid === pid) {
    const idx = handIndex(S, pid, S.pending.uid);
    const c = p.hand[idx];
    /* level 1 always slaps it down; the others keep a wild back */
    const keep = !c || (p.level >= 2 && isWild(c) && p.hand.length > 2);
    if (keep) return Object.assign({ act: 'pass' }, apply(S, pid, { t: 'pass' }));
    const m = { t: 'play', uid: c.uid };
    if (isWild(c)) m.suit = pickSuit(S, pid, nextSeat(S, pid));
    if (c.kind === 'kaxxa') m.charge = pickCharge(S, pid);
    const r = apply(S, pid, m);
    if (r.ok) { maybeCall(S, pid); return Object.assign({ act: 'play' }, r); }
    return Object.assign({ act: 'pass' }, apply(S, pid, { t: 'pass' }));
  }

  const d = aiChoose(S, pid);
  if (d.t === 'take') return Object.assign({ act: 'chain' }, apply(S, pid, { t: 'take' }));
  if (d.t === 'draw') {
    const r = apply(S, pid, { t: 'draw' });
    /* it drew something it can use — decide right now rather than leaving
       the table waiting on a machine to make its mind up */
    if (r.playable) {
      const idx = handIndex(S, pid, S.pending.uid);
      const c = p.hand[idx];
      const keep = p.level >= 2 && isWild(c) && p.hand.length > 2;
      if (keep) return Object.assign({ act: 'pass' }, apply(S, pid, { t: 'pass' }));
      const m = { t: 'play', uid: c.uid };
      if (isWild(c)) m.suit = pickSuit(S, pid, nextSeat(S, pid));
      if (c.kind === 'kaxxa') m.charge = pickCharge(S, pid);
      const r2 = apply(S, pid, m);
      if (r2.ok) { maybeCall(S, pid); return Object.assign({ act: 'play' }, r2); }
      return Object.assign({ act: 'pass' }, apply(S, pid, { t: 'pass' }));
    }
    return Object.assign({ act: 'draw' }, r);
  }
  const r = apply(S, pid, d);
  if (r.ok) maybeCall(S, pid);
  return Object.assign({ act: 'play' }, r);
}

/* the machine remembers to shout — mostly. An EASY opponent forgets four
   times out of ten, which is the only way a human ever gets to shout
   CAUGHT at it, and shouting it is half the fun of the rule. */
function maybeCall(S, pid) {
  const p = player(S, pid);
  if (p.hand.length !== 1 || p.said) return;
  const remembers = p.level >= 2 ? true : aiRnd(S, pid, 2) > 0.4;
  if (remembers) apply(S, pid, { t: 'call' });
}

/* Any AI at the table that spots a quiet player. Called by the UI a beat
   after a turn ends, so there is time to shout first. */
function aiCatch(S) {
  if (!S.call) return null;
  const target = S.call.pid;
  for (const p of S.players) {
    if (!isAI(p) || p.id === target || p.level < 2) continue;
    if (canCatch(S, target)) {
      const r = apply(S, p.id, { t: 'catch', target });
      if (r.ok) return { by: p.id, target };
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   12. THE ONE DOOR — apply(seat, move)
   ═══════════════════════════════════════════════════════════════════
   Every state change goes through here: a tap, the machine, and a packet
   off the relay. There is deliberately no second path, because a second
   path is where a remote client gets to do something a local one cannot.

   A move that is refused is REFUSED, not absorbed: nothing is mutated,
   nothing is logged, and the caller is told why. A relay handing us a
   hostile or simply stale move must leave the table exactly as it was.
   ═══════════════════════════════════════════════════════════════════ */
function apply(S, seat, move) {
  if (!move || typeof move !== 'object') return { ok: false, err: 'no-move' };
  if (!S.players[seat]) return { ok: false, err: 'no-seat' };
  const before = S.moveNo;
  let r;
  switch (move.t) {
    case 'play':  r = playUid(S, seat, move.uid, move); break;
    case 'draw':  r = drawOne(S, seat); break;
    case 'take':  r = takeChain(S, seat); break;
    case 'pass':  r = pass(S, seat); break;
    case 'call':  r = sayAhhar(S, seat); break;
    case 'catch': r = catchOut(S, seat, move.target); break;
    default:      return { ok: false, err: 'unknown-move' };
  }
  if (!r.ok) return r;
  /* log the CANONICAL form — never the caller's object, which may carry a
     hand index or anything else local */
  const rec = { t: move.t, s: seat };
  if (move.t === 'play') { rec.uid = move.uid;
    if (move.suit) rec.suit = move.suit;
    if (move.charge) rec.charge = move.charge; }
  if (move.t === 'catch') rec.target = move.target;
  S.moves.push(rec);
  r.moved = S.moveNo !== before;
  return r;
}

/* ═══════════════════════════════════════════════════════════════════
   13. SNAPSHOT / LOAD / REPLAY / ROLLBACK
   ═══════════════════════════════════════════════════════════════════ */

/* the whole table, JSON-safe. There is no hidden state anywhere else —
   that is the property the rest of this section depends on. */
function snapshot(S) {
  return JSON.parse(JSON.stringify({
    v: S.v, gid: S.gid, seed: S.seed, rng: S.rng, opts: S.opts, moves: S.moves,
    players: S.players, deck: S.deck, discard: S.discard, suit: S.suit,
    turn: S.turn, dir: S.dir, chain: S.chain, singed: S.singed, dodge: S.dodge,
    pending: S.pending, call: S.call, moveNo: S.moveNo, log: S.log, over: S.over,
  }));
}

function load(snap) {
  const S = JSON.parse(JSON.stringify(snap));
  if (!S.players || !S.players.length) throw new Error('SKARTA: not a snapshot');
  S.v = 2;
  S.moves = S.moves || [];
  S.log = S.log || [];
  return S;
}

/* rebuild a match from its four parts. This is the definition of the game
   being deterministic, and it is asserted in the tests: replay of a
   finished match must equal the match. */
function replay(gid, opts, seed, moves) {
  const S = newGame({ gid, seed, seats: opts.seats });
  for (const m of (moves || [])) {
    const r = apply(S, m.s, m);
    if (!r.ok) return { S, at: S.moves.length, err: r.err };   /* desync: say where */
  }
  return { S, at: S.moves.length, err: null };
}

/* Re-deal from the seed and replay n moves. ONE implementation, used for
   local undo and for an agreed takeback alike, so the two can never
   drift into disagreeing about what "back one" means. */
function rollbackTo(S, n) {
  const keep = S.moves.slice(0, Math.max(0, Math.min(n, S.moves.length)));
  const out = replay(S.gid, S.opts, S.seed, keep);
  return out.err ? null : out.S;
}

function undo(S, steps) { return rollbackTo(S, S.moves.length - (steps || 1)); }

/* a cheap agreement check for the relay: same number, same table */
function checksum(S) {
  const s = [S.gid, S.seed, S.rng, S.moveNo, S.turn, S.dir, S.suit,
             S.chain.n, S.chain.closed ? 1 : 0, S.deck.length,
             S.players.map(p => p.hand.length).join('.'),
             (top(S) || {}).uid || '-'].join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/* ═══════════════════════════════════════════════════════════════════
   14. WHO IS IN A CHAIR
   The same switch serves the local AI toggle and the host filling empty
   seats with machines. Changing an owner never touches the cards.
   ═══════════════════════════════════════════════════════════════════ */
function setOwner(S, seat, owner, level) {
  const p = S.players[seat];
  if (!p) return { ok: false, err: 'no-seat' };
  if (OWNERS.indexOf(owner) < 0) return { ok: false, err: 'bad-owner' };
  p.owner = owner;
  p.level = owner === 'ai' ? (level || p.level || 3) : 0;
  S.opts.seats[seat].owner = owner;
  S.opts.seats[seat].level = p.level;
  return { ok: true };
}
function setName(S, seat, name) {
  const p = S.players[seat];
  if (!p) return { ok: false, err: 'no-seat' };
  p.name = String(name || p.name).slice(0, 18);
  S.opts.seats[seat].name = p.name;
  return { ok: true };
}

/* ═══════════════════════════════════════════════════════════════════
   15. WHAT THE TABLE LOOKS LIKE FROM ONE SEAT
   ═══════════════════════════════════════════════════════════════════
   THE REDACTION MATTERS MORE HERE THAN IN A BOARD GAME. Chess has no
   hidden information; SKARTA is nothing but hidden information. A client
   handed the full state can read every hand and the whole deck order, so
   a relayed match must ship THIS and never a snapshot.
   ═══════════════════════════════════════════════════════════════════ */
function view(S, seat) {
  const me = player(S, seat);
  return {
    gid: S.gid, moveNo: S.moveNo, you: seat,
    hand: me.hand.slice(),
    legal: legalMoves(S, seat),
    turn: S.turn, dir: S.dir, suit: S.suit, top: top(S),
    chain: Object.assign({}, S.chain),
    deckLeft: S.deck.length, pileLeft: S.discard.length,
    pending: S.pending && S.pending.pid === seat
      ? { type: S.pending.type, idx: handIndex(S, seat, S.pending.uid), uid: S.pending.uid }
      : (S.pending ? { type: S.pending.type, pid: S.pending.pid } : null),
    over: S.over,
    canCatch: S.players.filter(p => p.id !== seat && canCatch(S, p.id)).map(p => p.id),
    opponents: S.players.filter(p => p.id !== seat).map(p => ({
      id: p.id, name: p.name, owner: p.owner, ai: isAI(p), level: p.level,
      cards: p.hand.length, said: p.said, singed: !!S.singed[p.id],
    })),
    me: { singed: !!S.singed[seat], said: me.said, owner: me.owner,
          mustCall: !!(S.call && S.call.pid === seat) },
  };
}

/* ═══════════════════════════════════════════════════════════════════ */
const API = {
  SUITS, SUIT_KEYS, KINDS, RULES, OWNERS, suitOf, buildDeck, cardLabel, cardPoints,
  isWild, isDraw, isAI, isLocal, mulberry32,
  newGame, top, player, canPlay, legalMoves, chainLive, handIndex,
  play, playUid, drawOne, takeChain, pass, sayAhhar, canCatch, catchOut,
  sortHand, moveCard,
  /* the relay's door */
  apply, snapshot, load, replay, rollbackTo, undo, checksum, setOwner, setName, view,
  /* the machine */
  aiChoose, aiTurn, aiCatch, nextSeat, pickSuit, pickCharge,
  VERSION: 2,
};

root.KARTI_SKARTA_ENGINE = API;
if (typeof module === 'object' && module.exports) module.exports = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
