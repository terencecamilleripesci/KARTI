/* ═══════════════════════════════════════════════════════════════════
   KARTI — klabb-sette.js
   SETTE E MEZZO — seven and a half.

   ── WHICH VARIANT, AND AN HONEST NOTE ─────────────────────────────
   These are the standard Italian rules (pagat, Wikipedia). We looked
   for a specifically Maltese version and there isn't one on record —
   the documented Maltese banking games are trentun, klaxxa and tliet
   karti. Sette e Mezzo is played here because Italy is forty minutes
   away and it is what comes out at Christmas, not because Malta gave
   it its own rules. So: Italian rules, Maltese table.

   ── THE GAME ──────────────────────────────────────────────────────
   Forty cards again — the pack with the 8s, 9s and 10s out.
     Ace 1 · 2 to 7 face value · Jack, Queen, King a HALF.
   Get as close to 7½ as you can without going over. Over is sballato,
   bust, and the stake is gone before you finish complaining.

   THE MATTA is the King of Diamonds. Its owner may count it as a half
   OR as any whole number from one to seven, whichever suits. We pick
   the best legal value for you automatically and say so on the card,
   because choosing it by hand is a menu in the middle of a card game
   and it can never help you to choose worse.

   THE BANK wins every tie. That, plus seeing everyone's face-up cards
   before deciding whether to draw, is the whole of the bank's edge —
   which is why the bank keeps moving.

   Special hands, all of which take the bank off whoever is holding it:
     · 7½ in exactly TWO cards (a seven and a picture, or the matta and
       a picture — the "royal") pays DOUBLE.
     · TWO SEVENS and nothing else — the triplé — pays TRIPLE and beats
       absolutely everything, bust arithmetic included.
     · plain 7½ in three or more cards pays even money, and if exactly
       one player has it, they take the bank.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const KB = window.KARTI_KLABB;
if (!KB) return;
const D = KB.deck;
const { suitOf, rankOf, mk, deck40, shuffle } = D;

const MATTA = mk(2, 13);          /* King of Diamonds — the Re di Denari */
const CHIPS0 = 20, BET_MIN = 1, BET_MAX = 5, ROUNDS = 8;

/* ═══════════════════════════════════════════════════════════════════
   COUNTING A HAND
   Returns the best total that is not bust, plus what the matta is
   being counted as, plus which special (if any) the hand is.
     cls 3 = triplé · 2 = 7½ in two cards · 1 = ordinary
   ═══════════════════════════════════════════════════════════════════ */
function baseVal(c){
  const r = rankOf(c);
  return r >= 11 ? 0.5 : r;       /* J Q K = a half; A = 1; 2..7 face */
}
function score(cards){
  const has = cards.indexOf(MATTA) >= 0;
  let base = 0;
  for (const c of cards) if (c !== MATTA) base += baseVal(c);
  let total, matta = 0;
  if (has){
    /* the matta may be a half or any whole one to seven — take the
       largest that does not bust, and if they all bust, the smallest */
    const opts = [7, 6, 5, 4, 3, 2, 1, 0.5];
    matta = 0.5;
    for (const o of opts) if (base + o <= 7.5){ matta = o; break; }
    total = base + matta;
  } else total = base;

  /* two sevens beats everything, including the arithmetic */
  const triple = cards.length === 2 && rankOf(cards[0]) === 7 && rankOf(cards[1]) === 7;
  const bust = !triple && total > 7.5;
  const two  = !triple && cards.length === 2 && total === 7.5;
  return {
    total, matta, bust,
    cls: triple ? 3 : two ? 2 : 1,
    triple, seven: total === 7.5 && !triple,
    mult: triple ? 3 : two ? 2 : 1
  };
}
/* pretty: 5.5 reads as 5½, because it is a card game not a spreadsheet */
function pv(n){
  const w = Math.floor(n);
  const h = (n - w) >= 0.5;
  if (!w && h) return '½';
  return w + (h ? '½' : '');
}

/* ═══════════════════════════════════════════════════════════════════
   SEATS
   ═══════════════════════════════════════════════════════════════════ */
const NAMES = ['You', 'Ċetta', 'Nannu', 'Ġużè'];
const HUMAN = ['You', 'Player 2', 'Player 3', 'Player 4'];

function deal(opts, seed){
  const n = Math.max(2, Math.min(4, (opts && opts.seats) || 3));
  const humans = Math.min((opts && opts.humans) || 1, n);
  const st = {
    rs: seed >>> 0, n,
    seats: Array.from({ length:n }, (_, i) => ({
      name: i < humans ? HUMAN[i] : NAMES[i],
      own:  i < humans ? (i === 0 ? 'me' : 'hot') : 'ai',
      lvl:  (opts && opts.lvl) || 2,
      team: i,
      chips: CHIPS0,
      hand: [], bet:0, stood:false, done:false, out:false, res:null
    })),
    banker: n - 1,
    round: 1, rounds: ROUNDS,
    deck: [], phase:'bet', turn:0, msg:'', last:null,
    book: []
  };
  openRound(st);
  return st;
}

const nextSeat = (st, i) => (i + 1) % st.n;
/* counter-clockwise from the banker's right */
function firstBetter(st){
  let at = nextSeat(st, st.banker);
  for (let k = 0; k < st.n; k++){
    if (at !== st.banker && !st.seats[at].out) return at;
    at = nextSeat(st, at);
  }
  return -1;
}
function nextBetter(st, from){
  let at = nextSeat(st, from);
  for (let k = 0; k < st.n; k++){
    if (at !== st.banker && !st.seats[at].out && !st.seats[at].bet) return at;
    at = nextSeat(st, at);
  }
  return -1;
}
function nextPlayer(st, from){
  let at = nextSeat(st, from);
  for (let k = 0; k < st.n; k++){
    const s = st.seats[at];
    if (at !== st.banker && !s.out && !s.done) return at;
    at = nextSeat(st, at);
  }
  return -1;
}

function openRound(st){
  st.deck = shuffle(st, deck40());
  st.seats.forEach(s => {
    s.hand = []; s.bet = 0; s.stood = false; s.done = false; s.res = null;
    if (s.chips <= 0) s.out = true;
  });
  /* the bank cannot be held by somebody with nothing to pay with */
  if (st.seats[st.banker].out){
    let at = nextSeat(st, st.banker);
    for (let k = 0; k < st.n; k++){ if (!st.seats[at].out) break; at = nextSeat(st, at); }
    st.banker = at;
  }
  st.phase = 'bet';
  st.turn = firstBetter(st);
  st.msg = '';
  if (st.turn < 0) st.phase = 'done';
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES
   ═══════════════════════════════════════════════════════════════════ */
function turn(st){
  if (st.phase === 'done') return -2;
  if (st.phase === 'settle' || st.phase === 'handover') return -1;
  return st.turn;
}

function legal(st, seat){
  if (st.phase === 'settle')   return seat === -1 ? [{ t:'settle' }] : [];
  if (st.phase === 'handover') return seat === -1 ? [{ t:'next' }] : [];
  if (seat !== st.turn) return [];
  const s = st.seats[seat];
  if (st.phase === 'bet'){
    const max = Math.min(BET_MAX, s.chips);
    const out = [];
    for (let n = BET_MIN; n <= max; n++) out.push({ t:'bet', n, seat });
    return out;
  }
  if (st.phase === 'play' || st.phase === 'bank')
    return [{ t:'hit', seat }, { t:'stand', seat }];
  return [];
}

function apply(st, mv){
  const s = st.seats[mv.seat];

  if (mv.t === 'bet'){
    s.bet = mv.n;
    s.chips -= mv.n;
    const nx = nextBetter(st, mv.seat);
    if (nx >= 0){ st.turn = nx; return; }
    /* everybody has staked: one card face down each, banker last */
    let at = firstBetter(st);
    for (let k = 0; k < st.n; k++){
      const p = st.seats[at];
      if (!p.out && (at === st.banker || p.bet)) p.hand.push(st.deck.shift());
      at = nextSeat(st, at);
    }
    st.phase = 'play';
    st.turn = firstBetter(st);
    if (st.turn < 0){ st.phase = 'bank'; st.turn = st.banker; }
    return;
  }

  if (mv.t === 'hit'){
    s.hand.push(st.deck.shift());
    const v = score(s.hand);
    if (v.bust || v.cls >= 2 || v.total === 7.5){
      /* bust, or you have hit exactly seven and a half — either way the
         hand is shown and it is over for you */
      s.done = true; s.stood = !v.bust;
      if (mv.seat === st.banker){ st.phase = 'settle'; st.turn = -1; return; }
      const nx = nextPlayer(st, mv.seat);
      if (nx >= 0){ st.turn = nx; return; }
      st.phase = 'bank'; st.turn = st.banker;
      return;
    }
    return;                            /* still your turn */
  }

  if (mv.t === 'stand'){
    s.stood = true; s.done = true;
    if (mv.seat === st.banker){ st.phase = 'settle'; st.turn = -1; return; }
    const nx = nextPlayer(st, mv.seat);
    if (nx >= 0){ st.turn = nx; return; }
    st.phase = 'bank'; st.turn = st.banker;
    return;
  }

  if (mv.t === 'settle'){ settle(st); return; }

  if (mv.t === 'next'){
    st.round++;
    openRound(st);
    return;
  }
}

/* ── the showdown ─────────────────────────────────────────────────
   The bank wins every tie. Beat it and you are paid your stake, or
   double for a two-card 7½, or triple for the triplé. */
function settle(st){
  const bank = st.seats[st.banker];
  const bv = score(bank.hand);
  let takeBank = -1, sevens = [];
  const row = { n:st.round, banker:st.banker, bank:bv.bust ? 'bust' : pv(bv.total), rows:[] };

  st.seats.forEach((s, i) => {
    if (i === st.banker || s.out || !s.bet) return;
    const v = score(s.hand);
    let win = 0;
    if (v.bust) win = -1;
    else if (bv.bust) win = 1;
    else if (v.cls !== bv.cls) win = v.cls > bv.cls ? 1 : -1;
    else win = v.total > bv.total ? 1 : -1;     /* the bank takes ties */
    const gain = win > 0 ? s.bet * v.mult : 0;
    if (win > 0){ s.chips += s.bet + gain; bank.chips -= gain; }
    else bank.chips += s.bet;
    s.res = { win, gain, v };
    row.rows.push({ seat:i, r:v.bust ? 'bust' : pv(v.total), win, gain });
    /* who walks off with the bank */
    if (v.cls >= 2 && takeBank < 0) takeBank = i;
    else if (v.cls === 1 && v.total === 7.5) sevens.push(i);
  });

  if (takeBank < 0 && sevens.length === 1) takeBank = sevens[0];
  st.book.push(row);
  st.last = { banker:st.banker, bv, takeBank };
  if (takeBank >= 0 && !st.seats[takeBank].out) st.banker = takeBank;

  st.seats.forEach(s => { if (s.chips <= 0) s.out = true; });
  const alive = st.seats.filter(s => !s.out).length;
  st.phase = (st.round >= st.rounds || alive <= 1) ? 'done' : 'handover';
  st.turn = -1;
}

function over(st){
  if (st.phase !== 'done') return null;
  const me = st.seats.findIndex(s => s.own === 'me' || s.own === 'hot');
  const mine = me < 0 ? 0 : me;
  const best = Math.max(...st.seats.map(s => s.chips));
  const my = st.seats[mine].chips;
  const alone = st.seats.filter(s => s.chips === best).length === 1;
  const tone = (my === best && alone) ? 'win' : (my === best ? 'draw' : 'lose');
  return {
    tone,
    head: tone === 'win' ? 'You walked out with the lot' :
          tone === 'lose' ? 'The table has your money' : 'Dead even',
    why: st.seats.map(s => s.name + ' ' + s.chips).join(' · ') +
         '. Started on ' + CHIPS0 + ' each over ' + st.rounds + ' hands.',
    quip: tone === 'win'
      ? 'Now put it away before somebody suggests one more hand.'
      : tone === 'lose'
      ? 'Twenty counters, eight hands, and a lesson about drawing on six.'
      : 'Everybody breaks even. Nobody enjoyed that.'
  };
}

/* the winner screen's standings (klabb.js hands them to js/rebbieh.js):
   a banking game ranks by the one thing it was ever about, the counters
   left in front of each chair. `t` is klabb.js's bilingual helper. */
function standings(st, t){
  return st.seats.map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.chips - a.s.chips || a.i - b.i)
    .map(x => ({
      name: x.s.name,
      you: x.s.own === 'me',
      bot: x.s.own === 'ai',
      score: x.s.chips + ' ' + t(x.s.chips === 1 ? 'counter' : 'counters', 'ċipep')
    }));
}

function note(st){
  if (st.phase === 'done') return '';
  return 'Hand ' + st.round + '/' + st.rounds + ' · bank: ' + st.seats[st.banker].name;
}
function pace(st){ return st.phase === 'settle' ? 900 : 1600; }

/* ═══════════════════════════════════════════════════════════════════
   THE MACHINE
   Nothing clever is available in a banking game — the whole thing is
   knowing when to stop. What the levels change is how well it knows.
     1 — stops at four and hopes.
     2 — stops at five and a half, which is roughly the honest answer.
     3 — counts what it can see, works out the chance the next card
         kills it, and remembers that the BANK WINS TIES, so as a
         player it pushes on a total that only draws.
   ═══════════════════════════════════════════════════════════════════ */
function visible(st, seat){
  /* every card this seat can legitimately see: its own hand, and
     everybody else's cards except their face-down first one */
  const seen = [];
  st.seats.forEach((s, i) => {
    if (i === seat) seen.push(...s.hand);
    else seen.push(...s.hand.slice(1));
  });
  return seen;
}
/* the share of the cards it cannot see that would not bust it */
function safeShare(st, seat, need){
  const seen = new Set(visible(st, seat));
  const pool = deck40().filter(c => !seen.has(c));
  if (!pool.length) return 0;
  let ok = 0;
  for (const c of pool){
    /* the matta can always be a half, so it never busts anybody */
    if (c === MATTA || baseVal(c) <= need + 1e-9) ok++;
  }
  return ok / pool.length;
}
/* the best total anybody who has stood is showing, bank's own hand aside */
function bestStanding(st){
  let best = 0;
  st.seats.forEach((s, i) => {
    if (i === st.banker || s.out || !s.bet || !s.stood) return;
    const v = score(s.hand);
    if (!v.bust && v.total > best) best = v.total;
  });
  return best;
}

function think(st, seat, lvl){
  const s = st.seats[seat];
  lvl = lvl || 2;

  if (st.phase === 'bet'){
    const max = Math.min(BET_MAX, s.chips);
    let n = lvl <= 1 ? 2 : (lvl === 2 ? 3 : (s.chips > CHIPS0 ? 4 : 2));
    n = Math.max(BET_MIN, Math.min(max, n));
    return { t:'bet', n, seat };
  }

  const v = score(s.hand);
  if (v.bust || v.total === 7.5) return { t:'stand', seat };
  const need = 7.5 - v.total;

  if (seat === st.banker){
    /* the bank only has to match, not beat: ties are the bank's */
    const target = bestStanding(st);
    if (lvl >= 3){
      if (v.total >= target && target > 0) return { t:'stand', seat };
      if (v.total >= 6) return { t:'stand', seat };
      return safeShare(st, seat, need) >= 0.42 ? { t:'hit', seat } : { t:'stand', seat };
    }
    const floor = lvl <= 1 ? 4.5 : 5;
    return v.total >= floor ? { t:'stand', seat } : { t:'hit', seat };
  }

  if (lvl >= 3){
    /* the bank wins ties, so a total that merely equals what the bank
       is likely to hold is a losing total — push a little */
    if (v.total >= 6.5) return { t:'stand', seat };
    const share = safeShare(st, seat, need);
    if (v.total < 5) return { t:'hit', seat };
    return share >= 0.46 ? { t:'hit', seat } : { t:'stand', seat };
  }
  const floor = lvl <= 1 ? 4 : 5.5;
  return v.total >= floor ? { t:'stand', seat } : { t:'hit', seat };
}

/* ═══════════════════════════════════════════════════════════════════
   THE FELT
   ═══════════════════════════════════════════════════════════════════ */
function paint(ui, st, info){
  const me = info.view;
  const show = st.phase === 'settle' || st.phase === 'handover' || st.phase === 'done';

  /* ── everybody else ── */
  const others = [];
  for (let k = 1; k < st.n; k++) others.push((me + k) % st.n);
  ui.top.innerHTML = '<div class="kb-seats">' + others.map(i => {
    const s = st.seats[i];
    const v = score(s.hand);
    const reveal = show || i === st.banker && (st.phase === 'bank' || show);
    let cards = '';
    if (s.hand.length){
      cards = '<span class="kb-mini">' + s.hand.map((c, k) =>
        ui.card(c, { w:24, cls:'tiny', face: reveal || k > 0 })).join('') + '</span>';
    }
    const sub = s.out ? 'out'
      : (reveal && s.hand.length ? (v.bust ? 'BUST' : pv(v.total)) + ' · ' + s.chips
                                 : (s.bet ? 'bet ' + s.bet + ' · ' + s.chips : s.chips + ' left'));
    return '<div class="kb-seat' + (i === info.turn ? ' turn' : '') +
      (i === st.banker ? ' mate' : '') + '">' +
      '<span class="kb-nm">' + ui.esc(s.name) + (i === st.banker ? ' · BANK' : '') + '</span>' +
      cards + '<span class="kb-sub">' + ui.esc(sub) + '</span></div>';
  }).join('') + '</div>' +
  '<div class="kb-chips">' + ui.chip('deck <b>' + st.deck.length + '</b>') + '</div>';

  /* ── the middle ── */
  const bank = st.seats[st.banker];
  let mid = '';

  if (show && st.last){
    const bv = st.last.bv;
    mid += ui.say('The bank shows <b>' + (bv.bust ? 'BUST' : pv(bv.total)) + '</b>. ' +
      (st.last.takeBank >= 0
        ? ui.esc(st.seats[st.last.takeBank].name) + ' takes the bank.'
        : 'The bank stays put.'));
    const rows = (st.book[st.book.length - 1] || { rows:[] }).rows;
    mid += '<div class="kb-chips">' + rows.map(r =>
      ui.chip(ui.esc(st.seats[r.seat].name) + ' ' + r.r + ' ' +
        (r.win > 0 ? '<b>+' + r.gain + '</b>' : '<b>−' + st.seats[r.seat].bet + '</b>'))).join('') + '</div>';
  } else if (st.phase === 'bet'){
    mid += ui.say('Stakes down. Minimum ' + BET_MIN + ', maximum ' + BET_MAX + '.');
  } else if (st.phase === 'bank'){
    mid += ui.say('<b>' + ui.esc(bank.name) + '</b> turns the hole card over.');
  } else {
    mid += ui.say('Closest to <b>7½</b> without going over. The bank wins ties.');
  }
  ui.mid.innerHTML = mid;

  /* ── you ── */
  const s = st.seats[me];
  const v = score(s.hand);
  const mine = info.turn === me;
  let bot = '<div class="kb-chips">' +
    ui.chip(ui.esc(s.name) + ' <b>' + s.chips + '</b>') +
    (s.bet ? ui.chip('stake <b>' + s.bet + '</b>') : '') +
    (s.hand.length ? ui.chip((v.bust ? 'BUST on <b>' : 'you have <b>') + pv(v.total) + '</b>' +
      (v.matta ? ' · matta as ' + pv(v.matta) : '')) : '') +
    (me === st.banker ? ui.chip('<b>you hold the bank</b>') : '') +
    '</div>';

  if (s.hand.length){
    const plan = ui.plan(s.hand.length, ui.wide(), 130);
    /* your own hole card is yours to see — it is only hidden from the
       others, and on one phone that is what the veil is for */
    bot += ui.fan(s.hand, plan, {});
  }

  if (mine && st.phase === 'bet'){
    const max = Math.min(BET_MAX, s.chips);
    let acts = '';
    for (let n = BET_MIN; n <= max; n++)
      acts += ui.act('Stake ' + n, { t:'bet', n, seat:me }, { cls: n === 2 ? '' : 'ghost' });
    bot += '<div class="kb-acts">' + acts + '</div>';
  } else if (mine && (st.phase === 'play' || st.phase === 'bank')){
    bot += '<div class="kb-acts">' +
      ui.act('Another one', { t:'hit', seat:me }) +
      ui.act('I stand', { t:'stand', seat:me }, { cls:'ghost' }) +
      '</div>';
  } else if (s.out){
    bot += ui.say('You are out of counters. Watch the others lose theirs.');
  }
  ui.bot.innerHTML = bot;
}

/* ═══════════════════════════════════════════════════════════════════
   REGISTRATION
   ═══════════════════════════════════════════════════════════════════ */
KB.define({
  id:'sette', order:30,
  name:'SETTE E MEZZO', mt:'Sebgħa u nofs',
  cardCount: 40, seats:[3, 2, 4],
  seatNote: { 2:'You and the machine, taking turns with the bank.',
              3:'Three round the table. The sweet spot.',
              4:'Four. Somebody is going home skint.' },
  mark: [D.mk(2, 13), D.mk(0, 7), D.mk(1, 12)],
  thinkMs: 750,
  tag: 'Get to seven and a half and stop. The King of Diamonds is whatever you ' +
       'need it to be, and the bank wins every tie, which is not a coincidence.',
  blurb: 'The Christmas one. Twenty counters each, eight hands, and one card — the ' +
         'King of Diamonds — that is worth whatever you want it to be. The bank wins ' +
         'ties, so the bank keeps moving, so eventually it is your turn to be smug.',
  rules: [
    'Forty cards. <b>Ace 1 · 2 to 7 face value · Jack, Queen and King a half.</b>',
    'Closest to <b>7½</b> without going over. Over is bust and the stake is gone.',
    'The <b>King of Diamonds is the matta</b> — count it as a half or as any whole ' +
      'number from one to seven. We take the best legal value for you.',
    '<b>The bank wins all ties.</b> That is the bank\'s entire edge, and it is a big one.',
    '<b>7½ in two cards pays double</b> and takes the bank. <b>Two sevens pays triple</b>, ' +
      'takes the bank, and beats everything on the table.',
    'Plain 7½ in three cards or more pays even money — and if only one player has it, ' +
      'they take the bank next hand.',
    'Twenty counters each, eight hands, most counters at the end wins.'
  ],
  deal, legal, apply, turn, over, note, pace, think, paint, standings,
  _score: score, _matta: MATTA
});

KB.sette = { score, baseVal, MATTA, pv };

})();
