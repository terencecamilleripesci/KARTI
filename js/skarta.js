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
   │  card names, and the call is "AĦĦAR WAĦDA!".  Do not rename  │
   │  anything in here to match another game, however tempting.   │
   └──────────────────────────────────────────────────────────────┘

   WHY THIS FILE HAS NO DOM IN IT
     Every rule below is asserted in a headless node run before the UI is
     ever opened. A rules bug that only reproduces after four taps on a
     phone costs an hour; the same bug in a pure function costs a minute.
     js/skarta-ui.js draws the table and calls in here for every decision.

   HOUSE RULES THIS FILE OBEYS
     · it owns no stylesheet, no markup and no localStorage key of the
       card game's. Its own key is karti_skarta_v1 and it lives in the UI.
     · it loads in a browser (window.KARTI_SKARTA_ENGINE) and in node
       (module.exports), because the tests run it in node directly.
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
   and the joke are flavour and can be rewritten without touching a rule. */
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
   eight suitless cards. */
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
  CHAIN_CAP: 12,        /* IL-LIMITU — see §5. This is what stops stacking */
  PENALTY: 2,           /* cards for forgetting to call AĦĦAR WAĦDA */
  KAXXA_SMALL: 4,       /* the safe charge */
  KAXXA_BIG: 7,         /* the whole box — and it singes you too */
  CALL: 'AĦĦAR WAĦDA!', /* what you shout on one card */
  CATCH: 'QABADTEK!',   /* what you shout at somebody who forgot */
};

/* ═══════════════════════════════════════════════════════════════════
   3. RANDOMNESS
   Seeded, always. A bug you cannot replay is a bug you cannot fix, and
   every one of the engine tests replays an exact game.
   ═══════════════════════════════════════════════════════════════════ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* ═══════════════════════════════════════════════════════════════════
   4. A GAME
   ═══════════════════════════════════════════════════════════════════ */

/* seats: [{name, ai:false} | {name, ai:true, level:1|2|3}]  — 2 to 4 of them */
function newGame(opts) {
  opts = opts || {};
  const seats = (opts.seats || []).slice(0, 4);
  if (seats.length < 2) throw new Error('SKARTA needs at least two seats');
  const seed = (opts.seed === undefined || opts.seed === null)
    ? (Math.random() * 0xFFFFFFFF) >>> 0 : (opts.seed >>> 0);
  const rnd = mulberry32(seed);

  const S = {
    seed, rnd,
    players: seats.map((s, i) => ({
      id: i, name: s.name || ('Player ' + (i + 1)),
      ai: !!s.ai, level: s.ai ? (s.level || 3) : 0,
      hand: [], said: false,
    })),
    deck: shuffle(buildDeck(), rnd),
    discard: [],
    suit: null,           /* the suit IN FORCE — a wild changes it */
    turn: 0,
    dir: 1,               /* +1 clockwise, -1 after a Marsa U-Turn */
    chain: { n: 0, kind: null, closed: false },  /* the growing draw pile */
    singed: {},           /* pid -> true : owes one skipped turn (see §5) */
    dodge: {},            /* pid -> {suit: count}  — the AI's memory */
    pending: null,        /* {type:'suit'|'charge'|'drawn', ...} awaiting an answer */
    call: null,           /* {pid, until} — somebody is on one card and quiet */
    moveNo: 0,
    log: [],
    over: null,           /* {winner, scores:[…]} */
  };
  for (const p of S.players) S.dodge[p.id] = { festa:0, bahar:0, razzett:0, bajtra:0 };

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
   …and once the pile reaches IL-LIMITU (12) the chain is CLOSED: no
   answer is legal and the pile is eaten. That cap is what makes the
   stacking rule terminate — every answer adds at least 2, so a chain
   can be answered at most six times and then it is over.               */

function chainLive(S) { return S.chain.n > 0; }

function canPlay(S, c) {
  if (S.over) return false;
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

/* indices into that player's hand */
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
function play(S, pid, idx, opts) {
  opts = opts || {};
  if (S.over) return { ok: false, err: 'over' };
  if (S.turn !== pid) return { ok: false, err: 'not-your-turn' };
  if (S.pending && S.pending.type !== 'drawn') return { ok: false, err: 'answer-first' };
  const p = player(S, pid);
  const c = p.hand[idx];
  if (!c) return { ok: false, err: 'no-card' };
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
    say(S, 'IL-LIMITU — ' + S.chain.n + ' on the pile. Nobody may pass it on again.');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   8. DRAWING
   ═══════════════════════════════════════════════════════════════════ */

/* The deck runs out around move sixty in a four-hander. Everything but
   the visible top card is shuffled and becomes the deck again. */
function refill(S) {
  if (S.deck.length) return true;
  if (S.discard.length <= 1) return false;
  const t = S.discard.pop();
  S.deck = shuffle(S.discard.splice(0, S.discard.length), S.rnd);
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
   straight down — pending.drawn holds it until you say. */
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
  if (canPlay(S, c)) { S.pending = { type: 'drawn', pid, idx: p.hand.length - 1 }; return { ok: true, drew: 1, playable: true, card: c }; }
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
   9. AĦĦAR WAĦDA — the call, and the cost of forgetting it
   ═══════════════════════════════════════════════════════════════════
   Down to one card you shout AĦĦAR WAĦDA. You have until the next
   player has finished their go. Stay quiet that long and anybody at the
   table may shout QABADTEK — and you take two.                         */
function sayAhhar(S, pid) {
  const p = player(S, pid);
  if (p.hand.length !== 1) return { ok: false, err: 'not-on-one' };
  p.said = true;
  if (S.call && S.call.pid === pid) S.call = null;
  say(S, p.name + ': "' + RULES.CALL + '"');
  return { ok: true };
}

function canCatch(S, targetPid) {
  return !!(S.call && S.call.pid === targetPid && !player(S, targetPid).said &&
            player(S, targetPid).hand.length === 1 && S.moveNo <= S.call.until && !S.over);
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
     1 · Ħanin (soft)   — legal moves, taken more or less at random.
     2 · Serju          — sheds the expensive cards, keeps its wilds back.
     3 · Kattiv (nasty) — all of the above, plus it WATCHES YOU: every
         time you draw instead of playing it notes which suit was up, and
         it comes back to that suit for the rest of the game.
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

/* what the AI would do, as a plain object — exposed so a test can check
   the decision without also having to apply it */
function aiChoose(S, pid) {
  const p = player(S, pid);
  const moves = legalMoves(S, pid);

  if (chainLive(S)) {
    if (!moves.length) return { act: 'chain' };
    /* Do not pass the parcel if the parcel comes straight back: in a
       two-hander over a Kaxxa the singed seat is skipped and the pile
       lands on you again, bigger. */
    if (p.level >= 2 && nextSeat(S, pid) === pid) return { act: 'chain' };
    /* smallest answer that keeps the chain moving, Kunjata before Kaxxa */
    const sorted = moves.slice().sort((a, b) =>
      (p.hand[a].kind === 'kaxxa' ? 1 : 0) - (p.hand[b].kind === 'kaxxa' ? 1 : 0));
    const idx = p.level < 2 ? moves[0] : sorted[0];
    const c = p.hand[idx];
    const o = {};
    if (isWild(c)) o.suit = pickSuit(S, pid, nextSeat(S, pid));
    if (c.kind === 'kaxxa') o.charge = pickCharge(S, pid);
    return { act: 'play', idx, opts: o };
  }

  if (!moves.length) return { act: 'draw' };

  if (p.level < 2) {                       /* Ħanin: anything legal */
    const idx = moves[Math.floor(S.rnd() * moves.length)];
    const c = p.hand[idx];
    const o = {};
    if (isWild(c)) o.suit = pickSuit(S, pid, nextSeat(S, pid));
    if (c.kind === 'kaxxa') o.charge = RULES.KAXXA_SMALL;
    return { act: 'play', idx, opts: o };
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

  const o = {};
  if (isWild(best.c)) o.suit = pickSuit(S, pid, v);
  if (best.c.kind === 'kaxxa') o.charge = pickCharge(S, pid);
  return { act: 'play', idx: best.idx, opts: o };
}

/* Take one whole AI turn. Returns what it did, so the UI can pace itself
   and a test can count the plies. */
function aiTurn(S) {
  const pid = S.turn;
  const p = player(S, pid);
  if (S.over || !p.ai) return { ok: false };

  /* the drawn card is still in the air from the last call */
  if (S.pending && S.pending.type === 'drawn' && S.pending.pid === pid) {
    const idx = S.pending.idx, c = p.hand[idx];
    /* level 1 always slaps it down; the others keep a wild back */
    const keep = p.level >= 2 && isWild(c) && p.hand.length > 2;
    if (keep) return Object.assign({ act: 'pass' }, pass(S, pid));
    const o = {};
    if (isWild(c)) o.suit = pickSuit(S, pid, nextSeat(S, pid));
    if (c.kind === 'kaxxa') o.charge = pickCharge(S, pid);
    const r = play(S, pid, idx, o);
    if (r.ok) { maybeCall(S, pid); return Object.assign({ act: 'play' }, r); }
    return Object.assign({ act: 'pass' }, pass(S, pid));
  }

  const d = aiChoose(S, pid);
  if (d.act === 'chain') return Object.assign({ act: 'chain' }, takeChain(S, pid));
  if (d.act === 'draw') {
    const r = drawOne(S, pid);
    /* it drew something it can use — decide right now rather than leaving
       the table waiting on a machine to make its mind up */
    if (r.playable) {
      const c = p.hand[S.pending.idx];
      const keep = p.level >= 2 && isWild(c) && p.hand.length > 2;
      if (keep) return Object.assign({ act: 'pass' }, pass(S, pid));
      const o = {};
      if (isWild(c)) o.suit = pickSuit(S, pid, nextSeat(S, pid));
      if (c.kind === 'kaxxa') o.charge = pickCharge(S, pid);
      const r2 = play(S, pid, S.pending.idx, o);
      if (r2.ok) { maybeCall(S, pid); return Object.assign({ act: 'play' }, r2); }
      return Object.assign({ act: 'pass' }, pass(S, pid));
    }
    return Object.assign({ act: 'draw' }, r);
  }
  const r = play(S, pid, d.idx, d.opts);
  if (r.ok) maybeCall(S, pid);
  return Object.assign({ act: 'play' }, r);
}

/* the machine remembers to shout — mostly. A Ħanin opponent forgets four
   times out of ten, which is the only way a human ever gets to shout
   QABADTEK at it, and shouting it is half the fun of the rule. */
function maybeCall(S, pid) {
  const p = player(S, pid);
  if (p.hand.length !== 1 || p.said) return;
  const remembers = p.level >= 2 ? true : S.rnd() > 0.4;
  if (remembers) sayAhhar(S, pid);
}

/* Any AI at the table that spots a quiet human. Called by the UI a beat
   after the human's turn ends, so there is time to shout first. */
function aiCatch(S) {
  if (!S.call) return null;
  const target = S.call.pid;
  for (const p of S.players) {
    if (!p.ai || p.id === target || p.level < 2) continue;
    if (canCatch(S, target)) {
      const r = catchOut(S, p.id, target);
      if (r.ok) return { by: p.id, target };
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   12. WHAT THE TABLE LOOKS LIKE FROM ONE SEAT
   The UI never reads S.deck or another player's hand. Keeping that
   discipline here is what would let an online SKARTA drop in later
   without rewriting the screen.
   ═══════════════════════════════════════════════════════════════════ */
function view(S, seat) {
  return {
    you: seat,
    hand: player(S, seat).hand.slice(),
    legal: legalMoves(S, seat),
    turn: S.turn, dir: S.dir, suit: S.suit, top: top(S),
    chain: Object.assign({}, S.chain),
    deckLeft: S.deck.length, pileLeft: S.discard.length,
    pending: S.pending ? Object.assign({}, S.pending) : null,
    over: S.over,
    canCatch: S.players.filter(p => p.id !== seat && canCatch(S, p.id)).map(p => p.id),
    opponents: S.players.filter(p => p.id !== seat).map(p => ({
      id: p.id, name: p.name, ai: p.ai, level: p.level,
      cards: p.hand.length, said: p.said, singed: !!S.singed[p.id],
    })),
    me: { singed: !!S.singed[seat], said: player(S, seat).said,
          mustCall: !!(S.call && S.call.pid === seat) },
  };
}

/* ═══════════════════════════════════════════════════════════════════ */
const API = {
  SUITS, SUIT_KEYS, KINDS, RULES, suitOf, buildDeck, cardLabel, cardPoints,
  isWild, isDraw, mulberry32, shuffle,
  newGame, top, player, canPlay, legalMoves, chainLive,
  play, drawOne, takeChain, pass, sayAhhar, canCatch, catchOut,
  aiChoose, aiTurn, aiCatch, nextSeat, pickSuit, pickCharge, view,
  VERSION: 1,
};

root.KARTI_SKARTA_ENGINE = API;
if (typeof module === 'object' && module.exports) module.exports = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
