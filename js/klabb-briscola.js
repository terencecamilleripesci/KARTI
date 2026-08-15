/* ═══════════════════════════════════════════════════════════════════
   KARTI — klabb-briscola.js
   BIXKLA and BRISCOLA — the two trick games, one engine.

   ── WHICH VARIANT WE PLAY, AND WHY ─────────────────────────────────
   Bixkla (also brixkla) is not a cousin of Briscola. It IS Briscola,
   as Malta plays it, and it is the one game in this whole section that
   genuinely belongs to the islands. Two things make it Maltese:

   1. THE DECK. Malta uses the ordinary international 52-card pack and
      throws out the eights, nines and tens. Forty cards, French suits.
      No Latin-suited pack, no cups and batons.

   2. THE JACK OUTRANKS THE QUEEN. When the Italian game arrived, the
      Latin deck's Cavallo — the knight — had no seat in an English
      pack, so the Jack took it and the Queen dropped into the Fante's
      chair below him. So in Bixkla the order is

         A · 3 · K · J · Q · 7 · 6 · 5 · 4 · 2

      and the points go with the chair, not the picture:
      Ace 11, Three 10, King 4, JACK 3, QUEEN 2. Total 120.

      Play the same forty cards as an Italian and you get the other
      order — A 3 K Q J — with Queen 3 and Jack 2, because there the
      Queen is standing in for the horse. That is the whole difference
      between the two games in this file, and it is a real one: it
      changes which card you hold back on the last trick.

   Sources cross-checked: pagat.com's Malta page and Briscola page,
   gambiter, and a Maltese blog whose own addendum corrected its first
   account. Where they disagreed (one informant had the 4/5/6 removed
   instead of 8/9/10, another had every court worth ten) we went with
   the two that agree with each other and with the rest of the family.

   ── THE RULE PEOPLE GET WRONG ─────────────────────────────────────
   THERE IS NO OBLIGATION TO FOLLOW SUIT. None. You may play any card
   in your hand at any time, and you never have to trump or overtrump.
   That is not a simplification, it is the game — Briscola without it
   is a different, much duller thing. legal() therefore returns the
   whole hand, and the tests assert that it does.

   Following suit only decides who WINS: highest trump takes it, and if
   nobody trumped, the highest card of the suit that was led. A card of
   some third suit cannot win, however big it is.

   ── SEATING ───────────────────────────────────────────────────────
   Play runs COUNTER-CLOCKWISE, which on this screen means the seat to
   your right goes next. Four-handed is fixed partnerships across the
   table, which is how it is played at the kazin. We do not offer the
   three-handed game: it needs a card removed from the pack and the
   sources do not agree on which, so rather than invent one we left it
   out.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const KB = window.KARTI_KLABB;
if (!KB) return;
const D = KB.deck;
const { suitOf, rankOf, mk, nameOf, deck40, shuffle, clone } = D;

/* ═══════════════════════════════════════════════════════════════════
   THE TWO RANK TABLES
   ═══════════════════════════════════════════════════════════════════ */
const VAR = {
  bixkla: {
    order: [1, 3, 13, 11, 12, 7, 6, 5, 4, 2],          /* A 3 K J Q 7 6 5 4 2 */
    pts:   { 1:11, 3:10, 13:4, 11:3, 12:2 },
    say:   'the Jack sits in the horse’s chair, so he beats the Queen'
  },
  briscola: {
    order: [1, 3, 13, 12, 11, 7, 6, 5, 4, 2],          /* A 3 K Q J 7 6 5 4 2 */
    pts:   { 1:11, 3:10, 13:4, 12:3, 11:2 },
    say:   'the Queen stands in for the knight, so she beats the Jack'
  }
};
/* higher number = better card. Ranks outside the forty score -1 so a
   stray eight from a 52-card deck could never quietly win a trick. */
function strength(v, c){
  const i = VAR[v].order.indexOf(rankOf(c));
  return i < 0 ? -1 : (VAR[v].order.length - i);
}
function points(v, c){ return VAR[v].pts[rankOf(c)] || 0; }
function handPts(v, cards){ let t = 0; for (const c of cards) t += points(v, c); return t; }

/* does `a` beat `b`, given the suit led and the trump suit? */
function beats(v, a, b, led, tsuit){
  const as = suitOf(a), bs = suitOf(b);
  if (as === tsuit || bs === tsuit){         /* trumps settle it between them */
    if (as !== tsuit) return false;
    if (bs !== tsuit) return true;
    return strength(v, a) > strength(v, b);
  }
  if (as !== bs) return as === led;          /* only the led suit can win */
  /* two cards of the same suit, and it is neither trumps nor the suit
     that was led: neither of them can take the trick, so neither of
     them beats the other. Cannot happen inside a real trick, because
     the first card IS the led suit — but a rule that is only true by
     luck of the caller is not a rule. */
  if (as !== led) return false;
  return strength(v, a) > strength(v, b);
}
/* index into trick[] of the card currently winning */
function leaderOf(v, trick, tsuit){
  if (!trick.length) return -1;
  const led = suitOf(trick[0].c);
  let best = 0;
  for (let i = 1; i < trick.length; i++)
    if (beats(v, trick[i].c, trick[best].c, led, tsuit)) best = i;
  return best;
}

/* ═══════════════════════════════════════════════════════════════════
   SEATS
   Counter-clockwise, and on this screen that is: you at the bottom,
   then right, then across, then left.
   ═══════════════════════════════════════════════════════════════════ */
const NAMES4 = ['You', 'Ċetta', 'Nannu', 'Ġużè'];
const NAMES2 = ['You', 'Ċetta'];
const HUMAN  = ['You', 'Player 2', 'Player 3', 'Player 4'];

function makeSeats(o){
  const n = o.seats, humans = Math.min(o.humans || 1, n);
  const nm = n === 4 ? NAMES4 : NAMES2;
  const seats = [];
  for (let i = 0; i < n; i++){
    const human = i < humans;
    seats.push({
      name: human ? HUMAN[i] : nm[i],
      own:  human ? (i === 0 ? 'me' : 'hot') : 'ai',
      lvl:  o.lvl || 2,
      team: n === 4 ? (i % 2) : i,
      hand: [], won: []
    });
  }
  return seats;
}
const nextSeat = (st, i) => (i + 1) % st.n;

/* ═══════════════════════════════════════════════════════════════════
   DEALING
   Three each, counter-clockwise from the dealer's right, then the next
   card off the pack is turned face up and becomes the trump. It goes
   half under the stock and it is the LAST card anybody draws.
   ═══════════════════════════════════════════════════════════════════ */
function dealHand(st){
  const pack = shuffle(st, deck40());
  st.seats.forEach(s => { s.hand = []; });
  st.stock = pack;
  let at = nextSeat(st, st.dealer);
  for (let round = 0; round < 3; round++){
    for (let k = 0; k < st.n; k++){
      st.seats[at].hand.push(st.stock.shift());
      at = nextSeat(st, at);
    }
  }
  /* the turn-up. It stays in the stock as its last card so the draw
     order needs no special case; tsuit is what everyone plays to. */
  st.trump  = st.stock[st.stock.length - 1];
  st.tsuit  = suitOf(st.trump);
  st.turnUp = true;
  st.lead   = nextSeat(st, st.dealer);
  st.turn   = st.lead;
  st.trick  = [];
  st.played = [];
  st.pot    = [0, 0];
  st.tricksWon = [0, 0];
  st.last   = null;
  st.phase  = 'play';
  st.seats.forEach(s => { s.hand.sort((a, b) => a - b); });
}

function deal(opts, seed){
  const n = (opts && opts.seats) === 4 ? 4 : 2;
  const v = (opts && opts.v) === 'briscola' ? 'briscola' : 'bixkla';
  const st = {
    rs: seed >>> 0, v, n,
    seats: makeSeats({ seats:n, humans:(opts && opts.humans) || 1, lvl:(opts && opts.lvl) || 2 }),
    dealer: n - 1,                    /* so seat 0 leads the first trick */
    hands: 1, best: 3,                /* best of three hands */
    score: [0, 0],                    /* hands won by each side */
    book: [],                         /* the scorebook, one row per hand */
    phase: 'play'
  };
  dealHand(st);
  return st;
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES
   ═══════════════════════════════════════════════════════════════════ */
function turn(st){
  if (st.phase === 'done') return -2;
  if (st.phase === 'gather' || st.phase === 'handover') return -1;
  return st.turn;
}

function legal(st, seat){
  if (st.phase === 'gather')   return seat === -1 ? [{ t:'gather' }] : [];
  if (st.phase === 'handover') return seat === -1 ? [{ t:'next' }] : [];
  if (st.phase !== 'play' || seat !== st.turn) return [];
  /* THE WHOLE HAND. No follow-suit, no forced trump — see the header. */
  return st.seats[seat].hand.map(c => ({ t:'play', c, seat }));
}

function apply(st, mv){
  if (mv.t === 'play'){
    const s = st.seats[mv.seat];
    const at = s.hand.indexOf(mv.c);
    if (at < 0) return;
    s.hand.splice(at, 1);
    st.trick.push({ seat:mv.seat, c:mv.c });
    st.played.push(mv.c);
    if (st.trick.length === st.n) st.phase = 'gather';
    else st.turn = nextSeat(st, mv.seat);
    return;
  }

  if (mv.t === 'gather'){
    const w = leaderOf(st.v, st.trick, st.tsuit);
    const winner = st.trick[w].seat;
    const team = st.seats[winner].team;
    const got = st.trick.map(p => p.c);
    st.pot[team] += handPts(st.v, got);
    st.tricksWon[team]++;
    st.seats[winner].won.push(...got);
    st.last = { winner, cards:got, pts:handPts(st.v, got) };
    st.trick = [];
    /* the draw: the winner first, then counter-clockwise. The turn-up
       is the last card in the stock, so it falls to whoever draws last
       in the final round without any special handling. */
    if (st.stock.length){
      let at = winner;
      for (let k = 0; k < st.n; k++){
        if (!st.stock.length) break;
        st.seats[at].hand.push(st.stock.shift());
        st.seats[at].hand.sort((a, b) => a - b);
        at = nextSeat(st, at);
      }
      if (!st.stock.length) st.turnUp = false;
    }
    if (st.seats.every(s => !s.hand.length)){
      /* the hand is over: 61 takes it, 60-60 is a draw (pareggio) */
      const row = { n:st.hands, pot:st.pot.slice(), tricks:st.tricksWon.slice(), win:-1 };
      if (st.pot[0] > 60){ row.win = 0; st.score[0]++; }
      else if (st.pot[1] > 60){ row.win = 1; st.score[1]++; }
      st.book.push(row);
      st.phase = (st.score[0] >= 2 || st.score[1] >= 2 || st.hands >= st.best)
        ? 'over' : 'handover';
      if (st.phase === 'over') st.phase = 'done';
      st.turn = -1;
      return;
    }
    st.lead = winner; st.turn = winner; st.phase = 'play';
    return;
  }

  if (mv.t === 'next'){
    st.hands++;
    st.dealer = nextSeat(st, st.dealer);
    dealHand(st);
    return;
  }
}

function over(st){
  if (st.phase !== 'done') return null;
  const meTeam = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  const mine = meTeam < 0 ? 0 : st.seats[meTeam].team;
  const them = 1 - mine;
  const a = st.score[mine], b = st.score[them];
  const tone = a > b ? 'win' : a < b ? 'lose' : 'draw';
  const label = st.n === 4 ? (tone === 'win' ? 'Your side' : 'The other side') : '';
  return {
    tone,
    head: tone === 'win' ? 'You took the match' :
          tone === 'lose' ? 'They took the match' : 'Nobody took it',
    why: 'Hands: ' + a + ' to ' + b + '. ' +
         st.book.map(r => 'Hand ' + r.n + ' — ' + r.pot[mine] + ':' + r.pot[them]).join(' · '),
    quip: tone === 'win'
      ? (label ? label + ' will not shut up about this for a week.'
               : 'Say nothing. Just collect the cards and look modest.')
      : tone === 'lose'
      ? 'He counted the trumps. You counted on luck. One of those works.'
      : 'Sixty all. The only honest result nobody is ever happy with.'
  };
}

function note(st){
  if (st.phase === 'done') return '';
  return 'Hand ' + st.hands + ' of ' + st.best;
}
function pace(st){ return st.phase === 'handover' ? 1400 : (st.n === 4 ? 1100 : 950); }

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE
   A trick game is only worth playing if the other side plays properly,
   so this is not a card picker. Three levels:

     1 Iz-ziju   — throws whatever. He is here to lose and he knows it.
     2 Tal-kazin — plays the trick: takes the cheapest winner when the
                   pot is worth it, loads points onto his partner's
                   trick, throws his rubbish away when it is lost, and
                   does not waste trumps on nothing.
     3 In-nannu  — all of that, plus he counts. He knows every card that
                   has fallen, works out what can still beat him, and
                   once the stock is empty he stops guessing entirely:
                   in the two-handed game the unseen cards ARE your hand,
                   so the last three tricks are solved exactly.
   ═══════════════════════════════════════════════════════════════════ */

/* every card that could still be in somebody else's hand or the stock */
function unseen(st, seat){
  const gone = new Set(st.played);
  for (const c of st.seats[seat].hand) gone.add(c);
  if (st.turnUp) gone.add(st.trump);       /* face up, nobody is holding it */
  return deck40().filter(c => !gone.has(c));
}

/* how much I want to keep this card for later */
function futureValue(st, c){
  const v = st.v, ts = st.tsuit;
  const s = strength(v, c);
  return suitOf(c) === ts ? (5 + s * 0.9 + points(v, c) * 0.35)
                          : (s * 0.22 + points(v, c) * 0.5);
}

/* how many opponents are still to play after me in this trick */
function oppsAfter(st, seat){
  let n = 0, at = nextSeat(st, seat);
  for (let k = st.trick.length + 1; k < st.n; k++){
    if (st.seats[at].team !== st.seats[seat].team) n++;
    at = nextSeat(st, at);
  }
  return n;
}

/* the chance somebody still to come beats the card I am about to win with */
function overtakeChance(st, seat, c, led, lvl){
  const nOpp = oppsAfter(st, seat);
  if (nOpp <= 0) return 0;
  let p;
  if (lvl >= 3){
    const pool = unseen(st, seat);
    if (!pool.length) return 0;
    const better = pool.filter(x => beats(st.v, x, c, led, st.tsuit)).length;
    /* a rough but honest read: each opponent holds three of the pool */
    const per = Math.min(1, (better / pool.length) * 3);
    p = 1 - Math.pow(1 - per, nOpp);
  } else {
    const base = suitOf(c) === st.tsuit ? (strength(st.v, c) >= 8 ? 0.06 : 0.3) : 0.45;
    p = 1 - Math.pow(1 - base, nOpp);
  }
  return Math.max(0, Math.min(0.95, p));
}

/* nothing unseen can beat this card if I lead it */
function safeLead(st, seat, c){
  const pool = unseen(st, seat);
  const led = suitOf(c);
  return !pool.some(x => beats(st.v, x, c, led, st.tsuit));
}

function evalPlay(st, seat, c, lvl){
  const v = st.v, ts = st.tsuit, me = st.seats[seat];
  const trick = st.trick;
  const keep = futureValue(st, c);

  if (!trick.length){
    /* LEADING. The default is a liscio — throw away something worth
       nothing and make them spend a trump on it. */
    let s = -points(v, c) * 1.7 - keep * 0.75;
    if (lvl >= 3 && safeLead(st, seat, c)) s += 15 + points(v, c) * 1.6;
    /* late on, dragging the last trumps out is worth doing */
    if (lvl >= 3 && suitOf(c) === ts && !st.stock.length && strength(v, c) >= 9) s += 6;
    return s;
  }

  const led = suitOf(trick[0].c);
  const li  = leaderOf(v, trick, ts);
  const winSeat = trick[li].seat;
  const pot = handPts(v, trick.map(p => p.c));
  const partnerWins = st.n === 4 && st.seats[winSeat].team === me.team && winSeat !== seat;
  const mine = beats(v, c, trick[li].c, led, ts);

  if (mine){
    const p = overtakeChance(st, seat, c, led, lvl);
    const pot2 = pot + points(v, c);
    /* if I am overtaken the whole pile, my card included, goes to them */
    return (1 - 2 * p) * pot2 - keep * 0.6 + 1.5;
  }
  if (partnerWins){
    /* the carico: put your points on your partner's trick */
    const p = oppsAfter(st, seat) ? (lvl >= 3 ? overtakeChance(st, seat, trick[li].c, led, lvl) : 0.35) : 0;
    return (1 - 2 * p) * points(v, c) * 1.15 + pot * 0.12 - keep * 0.5;
  }
  /* it is lost — get rid of the cheapest thing I own */
  return -points(v, c) * 1.25 - keep * 0.35;
}

/* ── the exact endgame, two-handed ────────────────────────────────
   Stock empty, three cards each, and the unseen cards are by
   definition the other hand. Thirty-six leaves; solve it properly
   rather than guess, because this is where the hand is decided. */
function solve2(st, seat, myHand, oppHand){
  const v = st.v, ts = st.tsuit;
  let bestCard = null;
  function rec(mh, oh, mover, table, top){
    if (!mh.length && !oh.length) return 0;
    const isMe = mover === 'm';
    const cards = isMe ? mh : oh;
    if (!cards.length) return 0;
    let best = isMe ? -Infinity : Infinity;
    for (const c of cards){
      const rest = cards.filter(x => x !== c);
      let val;
      if (!table){
        val = rec(isMe ? rest : mh, isMe ? oh : rest, isMe ? 'o' : 'm', { who:mover, c }, false);
      } else {
        const led = suitOf(table.c);
        const win = beats(v, c, table.c, led, ts) ? mover : table.who;
        const got = points(v, c) + points(v, table.c);
        val = (win === 'm' ? got : -got) +
              rec(isMe ? rest : mh, isMe ? oh : rest, win, null, false);
      }
      if (isMe){ if (val > best){ best = val; if (top) bestCard = c; } }
      else if (val < best) best = val;
    }
    return best;
  }
  const table = st.trick.length ? { who:'o', c:st.trick[0].c } : null;
  rec(myHand.slice(), oppHand.slice(), 'm', table, true);
  return bestCard;
}

function think(st, seat, lvl){
  const hand = st.seats[seat].hand;
  if (!hand.length) return null;
  lvl = lvl || 2;

  if (lvl <= 1)
    return { t:'play', c: hand[Math.floor(Math.random() * hand.length)], seat };

  if (lvl >= 3 && st.n === 2 && !st.stock.length && hand.length <= 3){
    const opp = unseen(st, seat);
    if (opp.length === hand.length - (st.trick.length ? 1 : 0) || opp.length === hand.length){
      const c = solve2(st, seat, hand, opp);
      if (c != null && hand.indexOf(c) >= 0) return { t:'play', c, seat };
    }
  }

  let best = hand[0], bs = -Infinity;
  for (const c of hand){
    const s = evalPlay(st, seat, c, lvl);
    if (s > bs || (s === bs && strength(st.v, c) < strength(st.v, best))){ bs = s; best = c; }
  }
  return { t:'play', c:best, seat };
}

/* ═══════════════════════════════════════════════════════════════════
   THE FELT
   ═══════════════════════════════════════════════════════════════════ */
function paint(ui, st, info){
  const me = info.view;
  const myTeam = st.seats[me] ? st.seats[me].team : 0;
  const turnSeat = info.turn;

  /* ── the other seats, laid out the way they sit ──
     Counter-clockwise from you: right, across, left. */
  const others = [];
  for (let k = 1; k < st.n; k++) others.push((me + k) % st.n);
  const order = st.n === 4 ? [others[2], others[1], others[0]] : others;   /* left, across, right */
  const seatsHTML = order.map(i => ui.seat(i, {
    backs: st.seats[i].hand.length,
    turn:  i === turnSeat,
    mate:  st.n === 4 && st.seats[i].team === myTeam,
    mw:    st.n === 4 ? 22 : 26,
    sub:   st.n === 4 && st.seats[i].team === myTeam ? 'partner' : ''
  })).join('');

  /* ── the middle: the pot, the trump, the stock, then the trick ── */
  const li = st.trick.length ? leaderOf(st.v, st.trick, st.tsuit) : -1;
  const winSeat = li >= 0 ? st.trick[li].seat : -1;
  const showWin = st.phase === 'gather';

  /* the scoreline lives up with the other seats, so the middle of the
     felt is only ever the cards on the table */
  ui.top.innerHTML =
    '<div class="kb-seats">' + seatsHTML + '</div>' +
    '<div class="kb-chips">' +
      ui.chip('us <b>' + st.pot[myTeam] + '</b>') +
      ui.chip('them <b>' + st.pot[1 - myTeam] + '</b>') +
      ui.chip('trumps ' + ui.pip(st.tsuit) + ' <b>' + D.suitWord(st.tsuit) + '</b>') +
      ui.chip('stock <b>' + st.stock.length + '</b>') +
    '</div>';

  let mid = '';
  /* the stock, with the trump card sticking out from under it — the one
     card everybody at the table keeps glancing back at, so it is drawn
     properly rather than reduced to a word */
  if (st.turnUp || st.stock.length)
    mid += '<div class="kb-stack">' +
      (st.stock.length > 1 ? ui.card(-1, { face:false, w:46, cls:'tiny' }) : '') +
      (st.turnUp ? '<span class="kb-trump">' + ui.card(st.trump, { w:46 }) + '</span>' : '') +
      '</div>';

  if (st.trick.length){
    mid += '<div class="kb-pool">' + st.trick.map((p, i) =>
      '<div class="kb-play' + (showWin && i === li ? ' win' : '') + '">' +
        ui.card(p.c, { w:60 }) +
        '<span class="kb-who">' + ui.esc(st.seats[p.seat].name) + '</span>' +
      '</div>').join('') + '</div>';
  } else if (st.last){
    mid += '<div class="kb-empty">' + ui.esc(st.seats[st.last.winner].name) +
      ' took that one' + (st.last.pts ? ' — ' + st.last.pts + ' points' : ' — nothing in it') +
      '</div>';
  } else {
    mid += '<div class="kb-empty">' +
      (st.lead === me ? 'Your lead' : ui.esc(st.seats[st.lead].name) + ' leads') + '</div>';
  }
  if (showWin && winSeat >= 0)
    mid += ui.say('<b>' + (winSeat === me ? 'You' : ui.esc(st.seats[winSeat].name)) + '</b> take' +
      (winSeat === me ? '' : 's') + ' it.');
  ui.mid.innerHTML = mid;

  /* ── your hand ── */
  const hand = st.seats[me].hand;
  const mine = turnSeat === me && st.phase === 'play';
  const plan = ui.plan(hand.length, ui.wide(), 150);
  ui.bot.innerHTML =
    '<div class="kb-chips">' +
      ui.chip(ui.esc(st.seats[me].name)) +
      ui.chip('tricks <b>' + st.tricksWon[myTeam] + '</b>') +
    '</div>' +
    ui.fan(hand, plan, {
      tap: mine,
      note: c => points(st.v, c) + (points(st.v, c) === 1 ? ' point' : ' points'),
      cls:  c => (mine ? 'ok' : '')
    });
  /* every card is legal — that IS the rule here — so each one carries
     its own move and the delegated handler in klabb.js does the rest */
  if (mine) ui.bot.querySelectorAll('.kb-card').forEach((el, i) => {
    el.setAttribute('data-mv', JSON.stringify({ t:'play', c:hand[i], seat:me }));
  });
}

/* ═══════════════════════════════════════════════════════════════════
   REGISTRATION
   ═══════════════════════════════════════════════════════════════════ */
const RULES_COMMON = [
  'Forty cards — the ordinary pack with the <b>8s, 9s and 10s taken out</b>.',
  '<b>You never have to follow suit.</b> Play any card you like, any time. ' +
    'This is the rule everybody gets wrong and it is the whole game.',
  'Highest trump takes the trick. No trump played? Highest card of the ' +
    '<b>suit that was led</b>. A card of any other suit cannot win, however big.',
  'Winner of the trick draws first, then round to the right. The face-up ' +
    'trump is the <b>last card off the stock</b>.',
  '<b>61 points takes the hand.</b> 120 in the pack, so 60–60 is a draw. ' +
    'Best of three hands takes the match.'
];

function mkGame(id, v, o){
  KB.define({
    id, order:o.order, name:o.name, mt:o.mt, tag:o.tag, blurb:o.blurb, shelfId:o.shelfId,
    cardCount: 40, seats:o.seats, seatNote:o.seatNote, mark:o.mark,
    thinkMs: 600,
    rules: o.rules,
    deal: (opts, seed) => deal(Object.assign({ v }, opts), seed),
    legal, apply, turn, over, note, pace, think, paint,
    /* handed out for tests and for anything that wants to score a hand
       without running one */
    _v: v, _pts: c => points(v, c), _str: c => strength(v, c),
    _beats: (a, b, led, ts) => beats(v, a, b, led, ts)
  });
}

mkGame('bixkla', 'bixkla', {
  order: 10,
  /* see shelve() in js/klabb.js: this game stands in the placeholder
     slot js/party.js reserved for this file. Delete that placeholder and
     this line goes with it. */
  shelfId: 'klabb',
  name: 'BIXKLA',
  mt: 'Il-briscola tagħna',
  seats: [4, 2],
  seatNote: { 4:'Partners across the table. The proper way.', 2:'Head to head, twenty tricks.' },
  mark: [D.mk(0, 1), D.mk(1, 11), D.mk(3, 3)],
  tag: 'The Maltese one. Forty cards, a trump suit, and a Jack who outranks the Queen ' +
       'because he stole the horse’s chair.',
  blurb: 'Four of you, partners across the table, and one suit that beats everything. ' +
         'You are not allowed to follow suit and you are not allowed to explain that to ' +
         'anybody who has just lost an Ace to a two of trumps.',
  rules: [
    '<b>Ranking: A · 3 · K · J · Q · 7 · 6 · 5 · 4 · 2.</b> Yes, the Jack beats ' +
      'the Queen — he is sitting in the knight’s chair from the Italian pack.',
    '<b>Points:</b> Ace 11 · Three 10 · King 4 · <b>Jack 3</b> · <b>Queen 2</b>. ' +
      'Everything else is worth nothing at all.'
  ].concat(RULES_COMMON)
});

mkGame('briscola', 'briscola', {
  order: 20,
  name: 'BRISCOLA',
  mt: 'Kif jilagħbuha t-Taljani',
  seats: [2, 4],
  seatNote: { 2:'Head to head. Twenty tricks, no excuses.', 4:'Partners across the table.' },
  mark: [D.mk(2, 1), D.mk(0, 12), D.mk(1, 3)],
  tag: 'The same forty cards played the Italian way — here the Queen has the horse, ' +
       'so she beats the Jack. Two players, twenty tricks.',
  blurb: 'The parent of Bixkla, straight off the boat. Everything is the same except ' +
         'who is sitting on the horse: in Italy that is the Queen, so she outranks the ' +
         'Jack and takes his three points with her.',
  rules: [
    '<b>Ranking: A · 3 · K · Q · J · 7 · 6 · 5 · 4 · 2.</b> The Queen is standing ' +
      'in for the Cavallo, so she beats the Jack — the exact opposite of Bixkla.',
    '<b>Points:</b> Ace 11 · Three 10 · King 4 · <b>Queen 3</b> · <b>Jack 2</b>.'
  ].concat(RULES_COMMON)
});

/* the pure bits, for the test harness and for anything that wants to
   reason about a hand without owning one */
KB.briscola = { VAR, strength, points, handPts, beats, leaderOf, unseen, solve2, deal };

})();
