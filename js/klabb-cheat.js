/* ═══════════════════════════════════════════════════════════════════
   KARTI — klabb-cheat.js
   IL-GIDBA — Cheat, played straight.

   ── WHICH VARIANT ─────────────────────────────────────────────────
   The FIXED ASCENDING version, which is the one pagat gives as the
   main rule and the only one with no ambiguity in it: the ranks go
   round the table in order regardless of what anybody actually holds.
   First play is Aces, then Twos, then Threes, all the way to Kings,
   then round to Aces again. You must play one to four cards face down
   and announce the rank the sequence is on. What you actually put down
   is entirely your own business.

   Four is the cap because there are only four of each rank in the
   pack, so a claim of five is a confession.

   ── THE BIT THE PUBLISHED RULES LEAVE OPEN ────────────────────────
   Nobody writes down who plays next after a challenge, or at what
   rank. We picked, and we stuck to it:

     THE PLAYER WHO PICKS UP THE PILE PLAYS NEXT, AND THE RANK CARRIES
     ON UP THE SEQUENCE FROM THE ONE THAT WAS JUST CLAIMED.

   It is the version that keeps the sequence honest and stops the same
   two ranks going round forever, and it is stated on the rules card so
   nobody at the table can claim they were robbed.

   ── WINNING ───────────────────────────────────────────────────────
   Put down your last cards and survive the challenge window and you
   are out and you have won. Get caught on your final play and you pick
   the pile up and you are very much back in, which is the funniest
   thing that happens in this game and the reason everybody watches the
   last play like a hawk.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const KB = window.KARTI_KLABB;
if (!KB) return;
const D = KB.deck;
const { rankOf, deck52, shuffle, RANK_LONG } = D;

const MAX_PLAY = 4;
const NAMES = ['You', 'Ċetta', 'Nannu', 'Ġużè'];
const HUMAN = ['You', 'Player 2', 'Player 3', 'Player 4'];
const rankName = r => RANK_LONG[r] + (r === 6 ? 'es' : 's');

function deal(opts, seed){
  const n = Math.max(3, Math.min(4, (opts && opts.seats) || 4));
  const humans = Math.min((opts && opts.humans) || 1, n);
  const st = {
    rs: seed >>> 0, n,
    seats: Array.from({ length:n }, (_, i) => ({
      name: i < humans ? HUMAN[i] : NAMES[i],
      own:  i < humans ? (i === 0 ? 'me' : 'hot') : 'ai',
      lvl:  (opts && opts.lvl) || 2,
      team: i, hand: []
    })),
    pile: [],            /* the face-down heap, oldest first */
    rank: 1,             /* the rank that MUST be claimed next */
    turn: 0,
    phase: 'play',
    callAt: -1,          /* whose turn it is to call, during a challenge */
    lastPlay: null,      /* {seat, rank, cards:[...]} */
    reveal: null,        /* {cards, honest, loser, caller, took} */
    winner: -1,
    outcome: null,
    picks: 0             /* how many times the pile has changed hands */
  };
  const pack = shuffle(st, deck52());
  /* dealt out as evenly as the pack allows; with three players
     somebody gets the eighteenth card and nobody minds */
  for (let i = 0; i < pack.length; i++) st.seats[i % n].hand.push(pack[i]);
  st.seats.forEach(s => s.hand.sort((a, b) => rankOf(a) - rankOf(b) || a - b));
  return st;
}

const nextSeat = (st, i) => (i + 1) % st.n;
const nextRank = r => (r % 13) + 1;

/* ═══════════════════════════════════════════════════════════════════
   THE RULES
   ═══════════════════════════════════════════════════════════════════ */
function turn(st){
  if (st.phase === 'done')   return -2;
  if (st.phase === 'reveal') return -1;
  if (st.phase === 'call')   return st.callAt;
  return st.turn;
}

/* ── the authority ──
   A play is legal if it is one to four DISTINCT cards, all of which are
   in that seat's hand. There is no rule at all about what they are —
   that is the game — and there is no passing: if it is your turn you
   put something down. */
function check(st, mv, seat){
  if (!mv) return false;
  if (st.phase === 'reveal') return seat === -1 && mv.t === 'after';
  if (st.phase === 'call')
    return seat === st.callAt && (mv.t === 'call' || mv.t === 'pass');
  if (st.phase !== 'play' || seat !== st.turn) return false;
  if (mv.t !== 'play' || !Array.isArray(mv.cards)) return false;
  const cards = mv.cards;
  if (!cards.length || cards.length > MAX_PLAY) return false;
  const hand = st.seats[seat].hand, seen = new Set();
  for (const c of cards){
    if (typeof c !== 'number' || seen.has(c) || hand.indexOf(c) < 0) return false;
    seen.add(c);
  }
  return true;
}

/* What the machine picks from, and what an inspector sees. A thousand
   subsets of a thirteen-card hand is not a useful list to hand anybody,
   so this is the sensible shortlist: every honest play, and the small
   bluffs. check() above is what actually decides legality. */
function legal(st, seat){
  if (st.phase === 'reveal') return seat === -1 ? [{ t:'after' }] : [];
  if (st.phase === 'call')
    return seat === st.callAt ? [{ t:'call', seat }, { t:'pass', seat }] : [];
  if (st.phase !== 'play' || seat !== st.turn) return [];
  const hand = st.seats[seat].hand;
  const good = hand.filter(c => rankOf(c) === st.rank);
  /* The junk, worst first — and "worst" is not simply the rank that is
     furthest away. The sequence climbs ONE rank per play and there are
     n players, so THIS seat only ever sees ranks rank+n, rank+2n,
     rank+3n… A card four steps away is in your hand again on your very
     next turn; a card one step away belongs to the player on your
     right and will not come back round to you for ages. So the sort is
     by how many of YOUR OWN turns away it is, and the cards you lie
     with are the ones you would be stuck holding anyway. */
  const wait = c => {
    const d = (rankOf(c) - st.rank + 13) % 13;
    for (let k = 1; k <= 13; k++) if ((k * st.n) % 13 === d) return k;
    return 13;
  };
  const junk = hand.filter(c => rankOf(c) !== st.rank)
                   .sort((a, b) => wait(b) - wait(a) || a - b);
  const out = [];
  for (let k = 1; k <= Math.min(good.length, MAX_PLAY); k++)
    out.push({ t:'play', cards:good.slice(0, k), seat, honest:true });
  for (let k = 1; k <= Math.min(junk.length, 3); k++)
    out.push({ t:'play', cards:junk.slice(0, k), seat, honest:false });
  /* a mixed play — every real one you have, plus one slipped underneath */
  if (good.length && junk.length){
    for (let k = 1; k <= Math.min(good.length, MAX_PLAY - 1); k++)
      out.push({ t:'play', cards:good.slice(0, k).concat(junk.slice(0, 1)), seat, honest:false });
    if (junk.length >= 2)
      out.push({ t:'play', cards:good.slice(0, Math.min(good.length, MAX_PLAY - 2))
                                 .concat(junk.slice(0, 2)), seat, honest:false });
  }
  if (!out.length && hand.length) out.push({ t:'play', cards:[hand[0]], seat, honest:false });
  return out;
}

function apply(st, mv){
  if (mv.t === 'play'){
    const s = st.seats[mv.seat];
    for (const c of mv.cards){
      const at = s.hand.indexOf(c);
      if (at >= 0) s.hand.splice(at, 1);
    }
    st.pile.push(...mv.cards);
    st.lastPlay = { seat:mv.seat, rank:st.rank, cards:mv.cards.slice() };
    st.reveal = null;
    /* the challenge window, offered round the table from the player's
       left — nearest in turn order gets first refusal, which is the
       usual ruling for two people shouting at once */
    st.phase = 'call';
    st.callAt = nextSeat(st, mv.seat);
    return;
  }

  if (mv.t === 'pass'){
    const nx = nextSeat(st, mv.seat);
    if (nx !== st.lastPlay.seat){ st.callAt = nx; return; }
    /* nobody called. If that was somebody's last card, they are out. */
    closeWindow(st, null);
    return;
  }

  if (mv.t === 'call'){
    const lp = st.lastPlay;
    const honest = lp.cards.every(c => rankOf(c) === lp.rank);
    const loser = honest ? mv.seat : lp.seat;
    st.reveal = { cards:lp.cards.slice(), honest, loser, caller:mv.seat,
                  took:st.pile.length, rank:lp.rank };
    st.phase = 'reveal';
    st.callAt = -1;
    return;
  }

  if (mv.t === 'after'){
    const r = st.reveal;
    const loser = st.seats[r.loser];
    loser.hand.push(...st.pile);
    loser.hand.sort((a, b) => rankOf(a) - rankOf(b) || a - b);
    st.pile = [];
    st.picks++;
    closeWindow(st, r);
    return;
  }
}

/* the one place the hand can end, whichever way the window closed */
function closeWindow(st, rev){
  const lp = st.lastPlay;
  /* played your last cards and survived: you are out, and out is won */
  if (!st.seats[lp.seat].hand.length && (!rev || rev.honest)){
    st.winner = lp.seat;
    st.phase = 'done';
    st.outcome = rev
      ? { how:'called', by:rev.caller }
      : { how:'quiet' };
    return;
  }
  st.rank = nextRank(lp.rank);
  /* our ruling: whoever picked the pile up leads the new one, and the
     sequence carries on. With no challenge, play simply passes on. */
  st.turn = rev ? rev.loser : nextSeat(st, lp.seat);
  st.phase = 'play';
  st.callAt = -1;
}

function over(st){
  if (st.phase !== 'done') return null;
  const w = st.winner;
  const s = st.seats[w];
  const mine = s.own === 'me' || s.own === 'hot';
  const rest = st.seats
    .map((p, i) => ({ p, i }))
    .filter(x => x.i !== w)
    .sort((a, b) => a.p.hand.length - b.p.hand.length);
  return {
    tone: mine ? 'win' : 'lose',
    head: mine ? s.name + ' got out clean' : s.name + ' got out first',
    why: 'Left holding: ' + rest.map(x => x.p.name + ' ' + x.p.hand.length).join(' · ') +
         '. The pile changed hands ' + st.picks + ' time' + (st.picks === 1 ? '' : 's') + '.' +
         (st.outcome && st.outcome.how === 'called'
           ? ' ' + st.seats[st.outcome.by].name + ' called it on the last play and was wrong.'
           : ' Nobody called the last play.'),
    quip: mine
      ? 'Lied to their faces for twenty minutes and got away with it. Well done.'
      : 'You had one job: call the last one. You let it go.'
  };
}

/* the winner screen's standings (klabb.js hands them to js/rebbieh.js):
   the one who got out clean first, then everybody else by how much they
   were left holding — the same order the verdict card always read out.
   `t` is klabb.js's bilingual helper. */
function standings(st, t){
  if (st.winner < 0) return null;
  const row = x => ({
    name: x.s.name,
    you: x.s.own === 'me',
    bot: x.s.own === 'ai',
    score: x.i === st.winner
      ? t('out', 'barra')
      : x.s.hand.length + ' ' + t(x.s.hand.length === 1 ? 'card' : 'cards', 'karti')
  });
  const rest = st.seats.map((s, i) => ({ s, i }))
    .filter(x => x.i !== st.winner)
    .sort((a, b) => a.s.hand.length - b.s.hand.length || a.i - b.i);
  return [row({ s: st.seats[st.winner], i: st.winner })].concat(rest.map(row));
}

function note(st){
  if (st.phase === 'done') return '';
  return 'Pile ' + st.pile.length;
}
function pace(){ return 1500; }

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE
   IT DOES NOT LOOK AT YOUR HAND. It is handed the whole state because
   every engine here is, but the only things read below are its own
   cards, the size of the pile, the rank on the table and HOW MANY
   cards were just claimed — never which ones. That restraint is the
   difference between a bluffing game and a magic trick, so it is
   spelled out here and asserted in the tests.
     1 — calls about one time in twelve and plays the first thing.
     2 — plays honestly when it can, calls a claim it can prove is a
         lie, and watches for somebody going out.
     3 — the same, plus it weighs the size of the pile before it risks
         picking the thing up, and it will bluff two cards when its
         hand is heavy.
   ═══════════════════════════════════════════════════════════════════ */
function myCount(st, seat, rank){
  return st.seats[seat].hand.filter(c => rankOf(c) === rank).length;
}

/* ── how likely is that claim to be true? ─────────────────────────
   Four of every rank exist. I am holding `held` of them, so `4-held`
   are somewhere in the other 51-ish cards I cannot see, and the player
   who just claimed `claimed` of them was holding `m` cards. The chance
   that many of them landed in that particular hand is a straight
   hypergeometric draw, and one minus it is the chance I have just been
   lied to.

   This is the honest version of a gut feeling, and it produces the
   behaviour a real table produces: a single card claimed is nearly
   always plausible and nobody bothers, three or four claimed is
   usually rubbish and somebody says so. Getting this right is what
   lets the pile GROW — and a pile that grows is what makes calling
   expensive, which is the pressure that ends the game. */
function comb(n, k){
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return r;
}
function chanceOfLie(st, seat, rank, claimed, holderHand){
  const held = myCount(st, seat, rank);
  const K = 4 - held;                       /* of the rank, out there somewhere */
  if (claimed > K) return 1;                /* arithmetic: it cannot be true */
  const N = 52 - st.seats[seat].hand.length;
  const m = Math.min(holderHand + claimed, N);
  if (N <= 0 || m <= 0) return 0;
  /* P(that hand held at least `claimed` of the K) */
  let p = 0;
  for (let i = claimed; i <= Math.min(K, m); i++)
    p += comb(K, i) * comb(N - K, m - i) / comb(N, m);
  const raw = Math.max(0, Math.min(1, 1 - p));
  /* …and now the bit that separates a card counter from a card player.
     The claim was not dealt, it was CHOSEN. Somebody holding three
     Kings will always claim three Kings; somebody holding none only
     claims them when they have nothing better, which is perhaps half
     the time. So the raw draw odds are evidence, not a verdict, and
     Bayes puts them back in proportion:

        P(lie | they said it) = q·b / ( q·b + (1-q) )

     with b the rate at which people bluff at all. An impossible claim
     still comes out at a flat 1 — nothing rescues arithmetic. */
  const b = 0.5;
  return (raw * b) / (raw * b + (1 - raw) || 1e-9);
}

function think(st, seat, lvl){
  lvl = lvl || 2;
  const s = st.seats[seat];

  /* ── to call or not to call ── */
  if (st.phase === 'call'){
    const lp = st.lastPlay;
    const claimed = lp.cards.length;              /* the COUNT only */
    const held = myCount(st, seat, lp.rank);
    const goingOut = st.seats[lp.seat].hand.length === 0;
    if (lvl <= 1) return Math.random() < 0.08 ? { t:'call', seat } : { t:'pass', seat };

    const q = chanceOfLie(st, seat, lp.rank, claimed, st.seats[lp.seat].hand.length);
    /* Somebody is about to go out. If nobody calls, they have won —
       so the bar drops right down and you take the gamble. */
    if (goingOut)
      return (q > 0.12 || Math.random() < 0.7) ? { t:'call', seat } : { t:'pass', seat };
    /* Otherwise it is a straight bet: being wrong costs you every card
       on the table. In-nannu will act on a suspicion; tal-kazin waits
       until he is fairly sure, and he does not notice everything. */
    /* Where to put the bar is not a matter of taste. Catching a liar
       hands the pile to ONE opponent, which helps me by roughly a
       share of it; being wrong hands the pile to ME, all of it. With
       n at the table the break-even is around (n-1)/n, so three
       quarters sure is the point at which speaking up pays. Anything
       lower and four machines call everything, the pile never grows,
       and a game of Cheat becomes a game of catch. */
    const bar = 0.9;
    if (q < bar) return { t:'pass', seat };
    const notice = lvl >= 3 ? 0.55 : 0.32;     /* nobody speaks up every time */
    return Math.random() < notice ? { t:'call', seat } : { t:'pass', seat };
  }

  /* ── what to put down ── */
  const opts = legal(st, seat);
  if (!opts.length) return null;
  if (lvl <= 1) return opts[Math.floor(Math.random() * opts.length)];

  const honest = opts.filter(o => o.honest);
  /* going out beats everything: an honest play that empties the hand */
  for (const o of honest)
    if (o.cards.length === s.hand.length) return o;

  if (honest.length){
    const real = honest[honest.length - 1];             /* every card I really have */
    /* THE GOOD LIE: your real ones with one extra slipped in underneath.
       Only somebody holding every single remaining card of the rank can
       prove that, which is a one-in-ten shot, and it sheds two cards a
       turn instead of one. Near the end you stop doing it — the last
       cards in your hand are your way out and you do not spend them. */
    /* …but ONLY as a claim of two. Claiming three or four of a rank you
       do not have three or four of is arithmetic anybody at the table
       can do, and it gets called every single time. A claim of one or
       two is the size of lie that survives. */
    if (lvl >= 2 && s.hand.length > 4 && real.cards.length === 1){
      const mixed = opts.filter(o => !o.honest && o.cards.length === 2 &&
                                     o.cards.some(c => rankOf(c) === st.rank));
      if (mixed.length && st.pile.length <= 16) return mixed[0];
    }
    return real;
  }
  const bluffs = opts.filter(o => !o.honest);
  if (!bluffs.length) return opts[0];
  /* HOW BIG A LIE. A small pile is cheap to be caught with, so that is
     when you unload three at once; once the pile is heavy you go back
     to slipping one card in at a time and looking innocent. */
  let size = 1;
  if (lvl >= 2 && st.pile.length <= 6 && s.hand.length > 8) size = 2;
  /* never three. Claiming three of a rank you do not hold is caught by
     anybody sitting on two of them, which at four-handed is most of
     the table — a big lie is not a bold lie, it is just a bad one. */
  size = Math.min(size, s.hand.length);
  let best = null;
  for (const o of bluffs) if (o.cards.length <= size && (!best || o.cards.length > best.cards.length)) best = o;
  return best || bluffs[0];
}

/* ═══════════════════════════════════════════════════════════════════
   THE FELT
   ═══════════════════════════════════════════════════════════════════ */
function uiTap(ui, st, id, tmp){
  const me = st.turn;
  const hand = st.seats[me] ? st.seats[me].hand : [];
  tmp.sel = tmp.sel || [];
  if (id === 'clear'){ tmp.sel = []; return; }
  if (id === 'auto'){
    tmp.sel = hand.filter(c => rankOf(c) === st.rank).slice(0, MAX_PLAY);
    return;
  }
  if (id.charAt(0) === 'c'){
    const c = +id.slice(1);
    const at = tmp.sel.indexOf(c);
    if (at >= 0) tmp.sel.splice(at, 1);
    else if (tmp.sel.length < MAX_PLAY) tmp.sel.push(c);
  }
}

function paint(ui, st, info){
  const me = info.view;
  const tmp = info.tmp;
  tmp.sel = (tmp.sel || []).filter(c => st.seats[me] && st.seats[me].hand.indexOf(c) >= 0);

  /* ── the rest of the table ── */
  const others = [];
  for (let k = 1; k < st.n; k++) others.push((me + k) % st.n);
  ui.top.innerHTML = '<div class="kb-seats">' + others.map(i => ui.seat(i, {
    backs: Math.min(st.seats[i].hand.length, 5),
    turn:  i === info.turn,
    mw: 22,
    sub: st.seats[i].hand.length + ' card' + (st.seats[i].hand.length === 1 ? '' : 's')
  })).join('') + '</div>' +
  '<div class="kb-chips">' +
    ui.chip('pile <b>' + st.pile.length + '</b>') +
    ui.chip('on the table <b>' + ui.esc(rankName(st.rank)) + '</b>') +
  '</div>';

  /* ── the pile ── */
  let mid = '';

  if (st.reveal){
    const r = st.reveal;
    mid += '<div class="kb-pool">' + r.cards.map(c =>
      '<div class="kb-play' + (rankOf(c) === r.rank ? ' win' : '') + '">' +
        ui.card(c, { w:56 }) + '</div>').join('') + '</div>';
    mid += ui.say(
      '<b>' + ui.esc(st.seats[r.caller].name) + '</b> called it. ' +
      (r.honest ? 'They were <b>telling the truth</b>. ' : 'It was <b>a lie</b>. ') +
      ui.esc(st.seats[r.loser].name) + ' picks up ' + r.took + '.');
  } else if (st.phase === 'call'){
    const lp = st.lastPlay;
    mid += '<div class="kb-pool">' +
      lp.cards.map(() => '<div class="kb-play">' + ui.card(-1, { face:false, w:56 }) + '</div>').join('') +
      '</div>';
    mid += ui.say('<b>' + ui.esc(st.seats[lp.seat].name) + '</b> says that is ' +
      lp.cards.length + ' ' + ui.esc(rankName(lp.rank)) + '.' +
      (st.seats[lp.seat].hand.length === 0
        ? ' <b>And that was the last of them.</b>' : ''));
  } else if (st.pile.length){
    mid += '<div class="kb-stack">' + ui.card(-1, { face:false, w:52 }) + '</div>';
    mid += ui.say('Your turn. You must say <b>' + ui.esc(rankName(st.rank)) + '</b>. ' +
      'Whether that is true is between you and your conscience.');
  } else {
    mid += ui.say('Fresh pile. Start it off with <b>' + ui.esc(rankName(st.rank)) +
      '</b> — or something you would like everyone to believe are ' +
      ui.esc(rankName(st.rank)) + '.');
  }
  ui.mid.innerHTML = mid;

  /* ── your hand ── */
  const s = st.seats[me];
  const hand = s.hand;
  const myPlay  = info.turn === me && st.phase === 'play';
  const myCall  = info.turn === me && st.phase === 'call';
  const plan = ui.plan(hand.length, ui.wide(), 178);
  let bot = '<div class="kb-chips">' +
    ui.chip(ui.esc(s.name) + ' <b>' + hand.length + '</b> left') +
    (myPlay ? ui.chip('picked <b>' + tmp.sel.length + '</b>/' + MAX_PLAY) : '') +
    '</div>';
  bot += ui.fan(hand, plan, {
    cls: c => (tmp.sel.indexOf(c) >= 0 ? 'pick' : ''),
    tap: myPlay
  });

  if (myPlay){
    const have = hand.filter(c => rankOf(c) === st.rank).length;
    bot += '<div class="kb-acts">' +
      ui.act('Say ' + (tmp.sel.length || '…') + ' ' + rankName(st.rank),
        tmp.sel.length ? { t:'play', cards:tmp.sel.slice(), seat:me } : null,
        { dis: !tmp.sel.length }) +
      (have ? ui.pick('Grab my real ' + rankName(st.rank), 'auto', { cls:'ghost' }) : '') +
      (tmp.sel.length ? ui.pick('Put them back', 'clear', { cls:'ghost' }) : '') +
      '</div>';
  } else if (myCall){
    bot += '<div class="kb-acts">' +
      ui.act('CHEAT!', { t:'call', seat:me }, { cls:'hot' }) +
      ui.act('Let it go', { t:'pass', seat:me }, { cls:'ghost' }) +
      '</div>';
  }
  ui.bot.innerHTML = bot;

  if (myPlay) ui.bot.querySelectorAll('.kb-card').forEach((el, i) => {
    el.setAttribute('data-tap', 'c' + hand[i]);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   REGISTRATION
   ═══════════════════════════════════════════════════════════════════ */
KB.define({
  id:'cheat', order:40,
  name:'IL-GIDBA', mt:'Cheat',
  cardCount: 52, seats:[4, 3],
  seatNote: { 3:'Three. Thirteen cards each and nowhere to hide.',
              4:'Four. The proper number for this one.' },
  mark: [D.mk(3, 1), D.mk(0, 13), D.mk(2, 7)],
  thinkMs: 800,
  tag: 'The whole 52, dealt out, and you lie your way through it. Called correctly ' +
       'and you eat the pile; called wrongly and they do.',
  blurb: 'The one that ends friendships. Aces, then Twos, then Threes, round and round, ' +
         'and you must put something down whether you have it or not. Everybody can see ' +
         'your face. Nobody can see your cards.',
  rules: [
    'The whole 52, dealt out between you. First out wins.',
    'The ranks go round <b>in a fixed order</b> — Aces, Twos, Threes, up to Kings, ' +
      'then back to Aces. It does not matter what you are holding.',
    'On your turn put <b>one to four cards face down</b> and say the rank. ' +
      'You may not pass. What you actually put down is your own business.',
    'Anybody else may call <b>CHEAT</b>. The cards are turned over: ' +
      'if the claim was true the <b>caller</b> takes the pile, if it was a lie the ' +
      '<b>player</b> takes it.',
    '<b>Our ruling on the bit the rulebooks skip:</b> whoever picks the pile up plays ' +
      'next, and the rank carries on up the sequence.',
    'Put down your last cards and <b>survive the challenge</b> and you are out and you ' +
      'have won. Get caught on the last play and you pick up the lot.'
  ],
  deal, legal, check, apply, turn, over, note, pace, think, paint, uiTap, standings,
  _rankName: rankName, _MAX: MAX_PLAY
});

KB.cheat = { rankName, nextRank, MAX_PLAY };

})();
