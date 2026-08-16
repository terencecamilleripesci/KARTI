/* ═══════════════════════════════════════════════════════════════════
   SUSPETT — the village game.  js/suspett.js is the ENGINE ONLY.

   A social-deduction game in the Mafia genre (Dmitry Davidoff, 1986 —
   public-domain mechanics; this is NOT a copy of any commercial title,
   and no commercial roster, text or art appears here). The village is
   a Maltese one: a klikka from the rival każin is quietly getting rid
   of people by night, and by day the whole pjazza argues about who it
   was and votes somebody out.

   THIS FILE IS DETERMINISTIC AND HEADLESS. No DOM, no timers, no
   Date.now(), no Math.random(). Every phone in an online room runs
   this same engine over the same seed and the same ordered move log,
   the way every KARTI relay game does. Anything that must differ per
   viewer (what YOU may know) goes through view(), never into state.
   Chat is NOT game state and never passes through here — but the RULE
   about who may read a chat channel is a rule of the game, so it
   lives here too: see channels() near the bottom.

   ── NIGHT RESOLUTION ORDER — THE SINGLE AUTHORITY ──────────────────
   When the night closes, actions resolve in exactly this order. If
   any question about an interaction comes up, THIS list answers it,
   not the UI and not a comment elsewhere. Every role in ROLES either
   appears in this list or provably does nothing at night.

     1. BLOCK    Tal-Bar gets one player blind drunk. Every later
                 action by a blocked player is cancelled outright:
                 a blocked Tabib protects nobody, a blocked Nanna
                 learns nothing, a blocked klikka member's kill pick
                 is not counted, a blocked Biċċier kills nobody, a
                 blocked Pittur paints nothing, a blocked Għassies
                 sees nothing, a blocked Kappillan hears nothing, a
                 blocked Kuntrabandist fails to hide. Tal-Bar acts
                 first and therefore can never be blocked himself.
     2. HIDE     Il-Kuntrabandist hides (self-protection, limited
                 uses). Spent only if it actually happens (unblocked).
     3. PROTECT  It-Tabib's protection lands on his target.
     4. FRAME    Il-Pittur paints his target: for TONIGHT's checks
                 (steps 6a/6b) that player reads as klikka-side.
     5. KILLS    Both kills are COMPUTED first, then APPLIED
                 simultaneously:
                   - the klikka kill is the plurality of the picks of
                     UNBLOCKED living klikka KILLERS (Il-Kap and
                     Tal-Klikka; Il-Pittur paints, he does not kill).
                     Ties break by the seeded RNG; no unblocked picks,
                     no kill;
                   - Il-Biċċier's kill is his own pick.
                 A target under PROTECT or HIDE survives (the log says
                 somebody was attacked and saved, naming nobody). Two
                 kills on one unprotected target are one death, and
                 because application is simultaneous the kills can
                 cross: the klikka can kill Il-Biċċier the same night
                 he kills one of them, and both die.
     6. LOOK     All information is gathered now, from the night as it
                 truly happened — death does not launder anyone, and a
                 result only reaches a looker who is alive at dawn and
                 was not blocked:
                 6a. In-Nanna learns her target's alignment. Il-Kap
                     reads NADIF to her (that is his whole job); a
                     painted player reads SUSPETTUŻ.
                 6b. Il-Kappillan learns whether his two chosen
                     people are on the same side. Il-Kap counts as
                     village to him too — the cover is absolute — and
                     a painted player counts as klikka.
                 6c. L-Għassies learns WHO VISITED the player he was
                     watching. A visit is an action performed ON a
                     target: the barman, the tabib, the nanna, the
                     pittur, the biċċier, the kappillan (his first
                     pick only — the second he watches from the
                     sagristija) and every unblocked klikka killer
                     whose pick became the kill all visit their
                     targets. A blocked player visits nobody. The
                     kuntrabandist hides at home. Watching is not a
                     visit.
     6d. THE SÉANCE is NOT in this list on purpose. Tal-Karti's line
                 to the dead is a CHAT CHANNEL, not a night action: it
                 opens whenever she is alive and it is night, and it
                 cannot be blocked, because chat lives outside the
                 deterministic move path and a block resolved at dawn
                 cannot unsay words typed at midnight. See channels().
     7. THE SHOT If Il-Kaċċatur died tonight (by any kill), dawn stops
                 while he fires once, taking one living player with
                 him. Protection has gone home by dawn: the shot
                 always kills. If it kills the other Kaċċatur, that
                 one fires too (the queue drains in order).
     8. GRUDGE   If Tal-Vendetta's mira died tonight (not by vote),
                 the grudge is void and he BECOMES Il-Miġnun — the
                 only revenge left is to make fools of the lot of
                 them.
     9. WINS     Win conditions are evaluated once every death above
                 is final. Precedence when a night empties the board:
                 everyone dead is a draw; else village, then klikka,
                 then biċċier.

   DAY: accusations are weighted votes (a revealed Sindku counts
   double). A sole plurality of at least two votes AND at least a
   quarter of the living puts somebody on the planka; defence; then
   the verdict, ħati by weighted majority.

   ── DEATH AND REVEAL ───────────────────────────────────────────────
   Host setting `revealRoles`, DEFAULT ON: the pjazza learns the role
   of every corpse. Chosen deliberately: this is a loud party game
   played with drinks, and a graveyard of anonymous corpses makes the
   game unreadable for casual players; the reveal is also where the
   comedy lands. Hosts who want the murkier game switch it off and
   corpses stay anonymous.

   ── WIN CONDITIONS (checked after every resolution) ────────────────
     RAĦAL    no klikka-side player and no Biċċier left alive.
     KLIKKA   living klikka-side >= all other living, and Il-Biċċier
              dead — nothing can stop the vote or outkill them.
     BIĊĊIER  alive, all klikka dead, at most one other left.
     MIĠNUN   voted out at the pjazza: that IS his win, announced on
              the spot and joined to the winners at the end — but the
              game carries on (ending it there let the fool decide
              20-40% of evenings in simulation), and the night after
              the lynch nobody dies: the village is too stunned.
     KUNTRABANDIST co-wins whichever ending happens, if alive.
     VENDETTA co-wins at the end if the pjazza ever voted his mira
              out (he may be dead himself; spite outlives him).
     DRAW     everybody dead ("ir-raħal battal").
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const GLOB = (typeof window !== 'undefined') ? window : globalThis;

/* ── seeded RNG — same generator the rest of the app uses ─────────── */
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ═══════════════════════════════════════════════════════════════════
   THE ROLES — a Maltese village, our own roster.
     side   'rahal' (uninformed majority) | 'klikka' (informed
            minority) | 'newtral' (wins on its own terms)
     night  submits a night action
     two    the night action takes two targets
     kills  contributes a pick to the klikka kill
     seance opens the line to the dead (a chat grant, not an action)
     unique at most one per game (everything but rahli and klikka)
   ═══════════════════════════════════════════════════════════════════ */
const ROLES = {
  rahli: {
    name:'Raħli', side:'rahal', night:false, unique:false,
    what:'Bniedem tal-affari tiegħu. L-unika arma tiegħek hi l-vot ' +
         'u l-paroli fil-pjazza. Oqgħod attent min temmen.'
  },
  nanna: {
    name:'In-Nanna', side:'rahal', night:true, unique:true,
    what:'Mill-gallarija tara KOLLOX. Kull lejl tagħżel persuna u sa ' +
         'filgħodu tkun taf jekk hijiex NADIFA jew SUSPETTUŻA. Attenta: ' +
         'il-Kap jidhrilek nadif, u l-Pittur jaf ipinġilek lil xi ħadd.'
  },
  tabib: {
    name:'It-Tabib', side:'rahal', night:true, unique:true,
    what:'Kull lejl tagħżel persuna u tħarisha mill-qtil ta’ dak il-lejl. ' +
         'Tista’ tħares lilek innifsek, imma qatt lill-istess persuna ' +
         'żewġt iljieli wara xulxin.'
  },
  barman: {
    name:'Tal-Bar', side:'rahal', night:true, unique:true,
    what:'Kull lejl tagħżel persuna u ttiha x-xorb b’xejn sa ma titfarrak. ' +
         'Dik il-persuna MA TAGĦMEL XEJN dak il-lejl — la toqtol, la ' +
         'tħares u lanqas tara.'
  },
  kaccatur: {
    name:'Il-Kaċċatur', side:'rahal', night:false, unique:true,
    what:'Bil-lejl torqod bis-senter taħt is-sodda. Jekk imutu — bil-lejl ' +
         'jew bil-vot — tispara tir wieħed u tieħu lil xi ħadd miegħek. ' +
         'Ħadd ma jsalva minn dik it-tir.'
  },
  talkarti: {
    name:'Tal-Karti', side:'rahal', night:false, unique:true, seance:true,
    what:'Kulħadd jidħaq bik, u kulħadd jiġi għandek bil-moħbi. Kull lejl ' +
         'tiftaħ il-karti u titkellem mal-mejtin bil-kitba — huma jafuk ' +
         'biss bħala "Tal-Karti", qatt b’ismek. Dak li jgħidulek jista’ ' +
         'jsalva r-raħal; jekk jindunaw min int, spiċċajt.'
  },
  ghassies: {
    name:'L-Għassies', side:'rahal', night:true, unique:true,
    what:'Ix-xogħol tiegħek hu li tħuf billejl. Tagħżel persuna u sa ' +
         'filgħodu tkun taf MIN MAR għandha dak il-lejl. Ma tafx għalfejn ' +
         'marru — imma min imur għand il-mejjet tal-lejla għandu ħafna ' +
         'x’jispjega.'
  },
  kappillan: {
    name:'Il-Kappillan', side:'rahal', night:true, two:true, unique:true,
    what:'Kulħadd iqerr għandek, u int tisma’ ħafna. Kull lejl tagħżel ' +
         'TNEJN, u sa filgħodu tkun taf humiex fuq l-istess naħa jew le. ' +
         'Ma tkunx taf liema naħa — imma tnejn li ma jaqblux huma ħjut ' +
         'li jinftħu.'
  },
  sindku: {
    name:'Is-Sindku', side:'rahal', night:false, unique:true,
    what:'Darba waħda fil-logħba, binhar, tista’ tikxef ruħek quddiem ' +
         'kulħadd: minn dakinhar ’il quddiem il-vot tiegħek jgħodd DOPPJU. ' +
         'Imma sindku mikxuf hu fil-mira ta’ kulħadd — agħżel il-mument.'
  },
  kap: {
    name:'Il-Kap', side:'klikka', night:true, kills:true, unique:true,
    what:'Il-moħħ tal-klikka tal-każin l-ieħor. Kull lejl il-klikka ' +
         'taqbel fuq vittma waħda. In-Nanna u l-Kappillan jarawk NADIF — ' +
         'wiċċek jibqa’ puljit sa l-aħħar.'
  },
  klikka: {
    name:'Tal-Klikka', side:'klikka', night:true, kills:true, unique:false,
    what:'Membru tal-klikka tal-każin l-ieħor. Taf min huma sħabek; kull ' +
         'lejl taqblu fuq vittma waħda fil-chat tal-klikka. Binhar agħmel ' +
         'ta’ bniedem sew — u ivvota kontra ħaddieħor.'
  },
  pittur: {
    name:'Il-Pittur', side:'klikka', night:true, unique:true,
    what:'Mal-klikka, imma s-sengħa tiegħek mhix id-demm: kull lejl ' +
         '"tpinġi" persuna, u dak il-lejl in-Nanna u l-Kappillan jarawha ' +
         'SUSPETTUŻA. Ħalli r-raħal jgħallaq lil min ma ħaqqux.'
  },
  mignun: {
    name:'Il-Miġnun', side:'newtral', night:false, unique:true,
    what:'Trid TKUN INT li jtellgħuk fuq il-planka. Jekk il-pjazza ' +
         'tivvutak ’il barra tirbaħ INT WAĦDEK u l-logħba tispiċċa hemm. ' +
         'Agħmel lilek innifsek suspettuż — imma mhux wisq.'
  },
  kuntrabandist: {
    name:'Il-Kuntrabandist', side:'newtral', night:true, unique:true,
    what:'Int m’inti ma’ ħadd — int mal-flus. Tirbaħ ma’ min jirbaħ, ' +
         'basta tkun għadek ħaj. Darbtejn f’logħba tista’ tistaħba ' +
         'l-lejl kollu u ħadd ma jista’ għalik.'
  },
  biccier: {
    name:'Il-Biċċier', side:'newtral', night:true, unique:true,
    what:'Għandek is-sikkina u għandek il-pjan: raħal vojt. Kull lejl ' +
         'toqtol int ukoll — waħdek, kontra kulħadd, sa ma ma jibqa’ ' +
         'ħadd jista’ jivvutak ’il barra.'
  },
  vendetta: {
    name:'Tal-Vendetta', side:'newtral', night:false, unique:true,
    what:'Persuna waħda f’dan ir-raħal għamlitlek dell twil — il-MIRA ' +
         'tiegħek, u taf min hi. Tirbaħ jekk il-pjazza tivvutaha ’l barra, ' +
         'ikun xi jkun it-tmiem. Jekk tmut bil-lejl qabel, tibqa’ b’xejn — ' +
         'u ssir il-Miġnun, għax ma jifdallek xejn ħlief iċ-ċajt.'
  }
};

/* ═══════════════════════════════════════════════════════════════════
   THE POOL — the host curates which roles are even in the game, and
   the engine builds and DEFENDS the deal. rosterFromPool() is the one
   builder: presets, the setup sheet and the tests all go through it.
   ═══════════════════════════════════════════════════════════════════ */
/* how many klikka-side seats a table carries — MEASURED, not guessed:
   at two killers from seven chairs the sim gave the klikka 75% of
   games; one to seven, two to twelve, three to fifteen and four at
   sixteen brought every preset inside 30-60% for the village */
function killerCount(n){ return n >= 15 ? 3 : n >= 9 ? 2 : 1; }

/* the order optional village/neutral roles enter as the table grows.
   Information first, then the joke, then utility, then the rest. */
const FILL_ORDER = ['nanna', 'tabib', 'mignun', 'barman', 'kaccatur',
                    'talkarti', 'kappillan', 'ghassies', 'kuntrabandist',
                    'sindku', 'vendetta'];
/* roles that only earn a chair at a certain size even when enabled —
   below it they warp the game (a lone unfindable Kap broke 5-8 player
   villages at 1-12% wins in simulation; a Biċċier needs a crowd) */
const MIN_TABLE = { kap:10, pittur:12, biccier:13, vendetta:9, talkarti:8,
                    kappillan:9, ghassies:9, sindku:10, kuntrabandist:10,
                    /* at five chairs a mislynch on the fool ends the whole
                       evening in one vote — he waits for a sixth */
                    mignun:6 };

const POOL_DEFAULT = Object.keys(ROLES).filter(r => r !== 'rahli' && r !== 'klikka');

function rosterFromPool(n, pool){
  pool = (Array.isArray(pool) && pool.length ? pool : POOL_DEFAULT)
    .filter(r => ROLES[r] && r !== 'rahli' && r !== 'klikka');
  const has = id => pool.indexOf(id) >= 0 && n >= (MIN_TABLE[id] || 0);
  const out = [];
  /* the killing side, kap and pittur folding INTO its count */
  let k = killerCount(n);
  if (has('kap')){ out.push('kap'); k--; }
  if (k > 1 && has('pittur')){ out.push('pittur'); k--; }
  while (k-- > 0) out.push('klikka');
  if (has('biccier')) out.push('biccier');
  for (const id of FILL_ORDER){
    if (out.length >= n) break;
    if (id === 'biccier') continue;
    if (has(id)) out.push(id);
  }
  while (out.length < n) out.push('rahli');   /* plain villagers fill */
  return out.slice(0, n);
}

/* Custom rosters are ENFORCED HERE, not in the UI: the engine refuses
   to deal a table that cannot produce a game, in plain words. */
function validateRoster(list, n){
  if (!Array.isArray(list) || list.length !== n)
    return { ok:false, why:'Ir-roster irid ikun eżatt daqs il-plejers (' + n + ').' };
  const c = {};
  for (const r of list){
    if (!ROLES[r]) return { ok:false, why:'Rwol mhux magħruf: ' + r };
    c[r] = (c[r] || 0) + 1;
  }
  const killers = list.filter(r => ROLES[r].side === 'klikka').length;
  const kills = list.filter(r => ROLES[r].kills).length;
  if (!kills) return { ok:false, why:'M’hemm ħadd li joqtol — logħba bla lejl mhix logħba.' };
  if (killers + (c.biccier || 0) >= Math.ceil(n / 2))
    return { ok:false, why:'Wisq qattiela: iridu jkunu inqas minn nofs ir-raħal.' };
  for (const id in c)
    if (ROLES[id].unique && c[id] > 1)
      return { ok:false, why:'Wieħed biss jista’ jkun ' + ROLES[id].name + '.' };
  return { ok:true, why:'' };
}

/* what a roster means for the evening, for the host's live balance
   line: who kills, who defends, who plays alone */
function rosterBalance(list){
  const b = { killers:0, village:0, neutral:0 };
  for (const r of list){
    if (!ROLES[r]) continue;
    if (ROLES[r].side === 'klikka') b.killers++;
    else if (ROLES[r].side === 'newtral') b.neutral++;
    else b.village++;
  }
  return b;
}

/* the recommended presets are just the default pool through the one
   builder, so the preset and the custom path can never disagree */
const SETUPS = {};
for (let i = 5; i <= 16; i++) SETUPS[i] = rosterFromPool(i, null);

/* ═══════════════════════════════════════════════════════════════════
   GAME STATE
   ═══════════════════════════════════════════════════════════════════ */
function create(o){
  const names = o.players || [];
  const n = names.length;
  const roster = (o.roster && o.roster.slice()) || rosterFromPool(n, o.pool || null);
  const v = validateRoster(roster, n);
  if (!v.ok) throw new Error('SUSPETT: ' + v.why);
  const seed = (o.seed >>> 0) || 1;
  const rnd = mulberry32(seed);
  /* seeded shuffle — every phone deals the same hand from the seed */
  const deal = roster.slice();
  for (let i = deal.length - 1; i > 0; i--){
    const j = Math.floor(rnd() * (i + 1));
    const t = deal[i]; deal[i] = deal[j]; deal[j] = t;
  }
  /* A MACHINE CHAIR CANNOT LIE, so it must never hold a role that has
     to. If the room seated bots, swap their roles toward plain Raħli
     deterministically (lowest seat first). Every phone gets the same
     bot list from the room, so every phone performs identical swaps. */
  const bots = Array.isArray(o.bots) ? o.bots.slice().sort((a, b) => a - b) : [];
  for (const b of bots){
    if (b < 0 || b >= n || deal[b] === 'rahli') continue;
    for (let i = 0; i < n; i++){
      if (deal[i] === 'rahli' && bots.indexOf(i) < 0){
        deal[i] = deal[b]; deal[b] = 'rahli'; break;
      }
    }
  }
  const G = {
    v: 1, seed: seed, rndN: 0, bots: bots,
    opt: {
      revealRoles: o.revealRoles !== false,      /* default ON — see header */
      dayTimer:  clampInt(o.dayTimer, 60, 900, 240),
      nightTimer: clampInt(o.nightTimer, 30, 300, 90)
    },
    phase: 'night', night: 1,
    P: names.map((nm, i) => ({
      seat: i, name: String(nm || ('Plejer ' + (i + 1))).slice(0, 24),
      role: deal[i], alive: true, diedOn: '', revealed: false, converted: false
    })),
    acts: {},            /* seat -> primary target this night (-1 = skip) */
    acts2: {},           /* seat -> second target (kappillan)             */
    hideLeft: 2,         /* kuntrabandist charges */
    lastProtect: -1,     /* tabib may not repeat a target */
    mayor: -1,           /* seat of a REVEALED sindku, else -1 */
    mira: -1,            /* tal-vendetta's grudge target */
    miraDone: false,     /* the pjazza voted the mira out */
    votes: {},           /* day: seat -> nominee (-1 abstain) */
    accused: -1,
    verdict: {},         /* seat -> true(hati)/false */
    shotQueue: [],       /* dead kaċċaturi still owed their shot */
    shotBack: '',        /* where dawn resumes once the queue drains: 'day' (night deaths) or 'night' (a daytime lynch) */
    news: {},            /* seat -> last night's private result, view() only */
    log: [],             /* public events, what the pjazza knows */
    winner: null, winners: [], over: false
  };
  /* the grudge: a seeded pick among the village-side seats, never the
     vendetta himself, so every phone agrees who the mira is */
  const vSeat = deal.indexOf('vendetta');
  if (vSeat >= 0){
    const marks = G.P.filter(p => ROLES[p.role].side === 'rahal').map(p => p.seat);
    if (marks.length) G.mira = marks[Math.floor(rnd() * marks.length)];
    else G.P[vSeat].role = 'rahli';        /* a grudge with nobody to hold it against */
  }
  G.rndN = 64;   /* marker past the shuffle draws; see drawRnd */
  logAdd(G, 'Lejl 1. Ir-raħal jorqod' + String.fromCharCode(8230));
  return G;
}
function clampInt(v, lo, hi, d){
  v = (typeof v === 'number' && isFinite(v)) ? Math.round(v) : d;
  return Math.max(lo, Math.min(hi, v));
}
/* Deterministic tie-breaks: a fresh generator from (seed ^ counter) so
   resolution never depends on how many draws the shuffle used. */
function drawRnd(G){
  G.rndN = (G.rndN + 1) | 0;
  return mulberry32((G.seed ^ (G.rndN * 0x9E3779B9)) >>> 0)();
}
function logAdd(G, txt){ G.log.push({ n: G.night, ph: G.phase, txt: txt }); }

/* ── helpers ── */
function alive(G){ return G.P.filter(p => p.alive); }
function seatOf(G, role){ const p = G.P.find(q => q.role === role); return p ? p.seat : -1; }
function isBot(G, s){ return (G.bots || []).indexOf(s) >= 0; }
function voteWeight(G, s){ return s === G.mayor ? 2 : 1; }
/* Machine chairs are dead weight here on purpose — a machine cannot
   lie or type. They are dealt Raħli where possible (see create), and
   they are never WAITED FOR: nights, votes and verdicts close without
   them. */
function actorsTonight(G){
  return alive(G).filter(p => {
    if (isBot(G, p.seat)) return false;
    if (!ROLES[p.role].night) return false;
    if (p.role === 'kuntrabandist' && G.hideLeft <= 0) return false;
    return true;
  }).map(p => p.seat);
}

/* ═══════════════════════════════════════════════════════════════════
   MOVES.  act(G, mv) mutates G and returns {ok, why}.  Every client
   applies the identical ordered move log; nothing here may consult
   anything outside G and mv.
   Moves:
     {t:'night',  seat, target, target2?}  targets, or -1 to skip
     {t:'nightEnd'}               host clock closes the night
     {t:'shot',   seat, target}   dead kaċċatur fires
     {t:'shotEnd'}                host clock: the shot goes in the air
     {t:'reveal', seat}           is-Sindku shows his face (day only)
     {t:'vote',   seat, target}   day accusation, changeable, -1 abstain
     {t:'dayEnd'}                 host clock closes accusations
     {t:'defEnd'}                 defence over -> verdict
     {t:'verdict',seat, guilty}   final vote on the accused
     {t:'verdictEnd'}             host clock closes the verdict
   ═══════════════════════════════════════════════════════════════════ */
function act(G, mv){
  if (!G || G.over) return { ok:false, why:'Il-logħba spiċċat.' };
  const t = mv && mv.t;
  const p = G.P[mv && mv.seat];
  switch (t){
    case 'night': {
      if (G.phase !== 'night') return no('Mhux il-lejl.');
      if (!p || !p.alive) return no('Il-mejtin ma jagħmlu xejn.');
      if (!ROLES[p.role].night) return no('Dan ir-rwol jorqod bil-lejl.');
      if (p.role === 'kuntrabandist' && G.hideLeft <= 0) return no('M’għandekx aktar moħbi.');
      const tgt = int(mv.target);
      const tgt2 = int(mv.target2);
      if (tgt !== -1){
        const q = G.P[tgt];
        if (!q || !q.alive) return no('Dik il-persuna mhix fil-logħba.');
        if (p.role === 'tabib' && tgt === G.lastProtect) return no('Mhux l-istess persuna żewġt iljieli.');
        if (p.role === 'kuntrabandist' && tgt !== p.seat) return no('Il-Kuntrabandist jistaħba hu biss.');
        if (ROLES[p.role].kills && ROLES[q.role].side === 'klikka') return no('Mhux lil sħabek stess.');
        if ((p.role === 'biccier' || p.role === 'barman' || p.role === 'ghassies' ||
             p.role === 'pittur' || p.role === 'nanna') && tgt === p.seat)
          return no('Le, mhux lilek innifsek.');
        if (p.role === 'kappillan'){
          if (tgt2 === -1) return no('Il-Kappillan iqabbel TNEJN.');
          const q2 = G.P[tgt2];
          if (!q2 || !q2.alive) return no('It-tieni persuna mhix fil-logħba.');
          if (tgt2 === tgt) return no('Tnejn differenti.');
          if (tgt === p.seat || tgt2 === p.seat) return no('Int taf min int.');
        }
      }
      G.acts[p.seat] = tgt;
      if (p.role === 'kappillan') G.acts2[p.seat] = tgt2;
      /* the night closes ITSELF when every actor has spoken */
      if (actorsTonight(G).every(s => G.acts[s] !== undefined)) resolveNight(G);
      return { ok:true };
    }
    case 'nightEnd': {
      if (G.phase !== 'night') return no('Mhux il-lejl.');
      resolveNight(G);                       /* absentees simply skip */
      return { ok:true };
    }
    case 'shot': {
      if (G.phase !== 'shot') return no('Ħadd ma jispara issa.');
      if (!G.shotQueue.length || G.shotQueue[0] !== mv.seat) return no('Mhux is-senter tiegħek.');
      const tgt = int(mv.target);
      const q = G.P[tgt];
      G.shotQueue.shift();
      if (q && q.alive && tgt !== mv.seat){
        kill(G, tgt, 'shot');
        logAdd(G, G.P[mv.seat].name + ' spara l-aħħar tir tiegħu u ħa lil ' + q.name +
                  ' miegħu.' + reveal(G, tgt));
        if (q.role === 'kaccatur' && !isBot(G, tgt))
          G.shotQueue.push(tgt);             /* the chain, in queue order */
        grudgeCheck(G, tgt, false);
      } else {
        logAdd(G, G.P[mv.seat].name + ' spara fl-ajru.');
      }
      if (winCheck(G)) return { ok:true };
      if (!G.shotQueue.length) resolveAfterShot(G);
      return { ok:true };
    }
    case 'shotEnd': {
      /* the host clock will not wait forever for a shooter who has
         locked their phone: the shot goes into the air */
      if (G.phase !== 'shot') return no('Ħadd ma jispara issa.');
      const who = G.shotQueue.shift();
      if (who !== undefined) logAdd(G, G.P[who].name + ' dam wisq — it-tir mar fl-ajru.');
      if (!G.shotQueue.length && !G.over) resolveAfterShot(G);
      return { ok:true };
    }
    case 'reveal': {
      if (G.phase !== 'day' && G.phase !== 'verdict' && G.phase !== 'defence')
        return no('Is-Sindku jikxef ruħu binhar biss.');
      if (!p || !p.alive) return no('Il-mejtin ma jixxejrux.');
      if (p.role !== 'sindku') return no('Int m’intix is-Sindku.');
      if (G.mayor === p.seat) return no('Diġà kxift ruħek.');
      G.mayor = p.seat;
      p.revealed = true;
      logAdd(G, p.name + ' kixef ruħu: HUWA S-SINDKU. Il-vot tiegħu jgħodd doppju minn issa.');
      return { ok:true };
    }
    case 'vote': {
      if (G.phase !== 'day') return no('Mhux ħin il-vot.');
      if (!p || !p.alive) return no('Il-mejtin ma jivvutawx.');
      const tgt = int(mv.target);
      if (tgt !== -1 && (!G.P[tgt] || !G.P[tgt].alive)) return no('Dik il-persuna mhix hemm.');
      if (tgt === p.seat) return no('Kontra tiegħek innifsek le.');
      G.votes[p.seat] = tgt;
      if (alive(G).every(a => isBot(G, a.seat) || G.votes[a.seat] !== undefined)) closeDay(G);
      return { ok:true };
    }
    case 'dayEnd': {
      if (G.phase !== 'day') return no('Mhux binhar.');
      closeDay(G);
      return { ok:true };
    }
    case 'defEnd': {
      if (G.phase !== 'defence') return no('Ħadd mhu jiddefendi ruħu.');
      G.phase = 'verdict'; G.verdict = {};
      logAdd(G, 'Il-pjazza tiddeċiedi: ħati jew le?');
      return { ok:true };
    }
    case 'verdict': {
      if (G.phase !== 'verdict') return no('Mhux ħin il-verdett.');
      if (!p || !p.alive) return no('Il-mejtin ma jivvutawx.');
      if (p.seat === G.accused) return no('L-akkużat ma jivvutax fuqu nnifsu.');
      G.verdict[p.seat] = !!mv.guilty;
      const voters = alive(G).filter(a => a.seat !== G.accused);
      if (voters.every(a => isBot(G, a.seat) || G.verdict[a.seat] !== undefined)) closeVerdict(G);
      return { ok:true };
    }
    case 'verdictEnd': {
      if (G.phase !== 'verdict') return no('Mhux ħin il-verdett.');
      closeVerdict(G);
      return { ok:true };
    }
    default: return no('Mossa mhux magħrufa.');
  }
  function no(why){ return { ok:false, why:why }; }
  function int(v){ return (typeof v === 'number' && isFinite(v)) ? Math.floor(v) : -1; }
}

/* ═══════════════════════════════════════════════════════════════════
   NIGHT RESOLUTION — implements the header order EXACTLY.
   ═══════════════════════════════════════════════════════════════════ */
function resolveNight(G){
  const A = G.acts;
  const pick = role => {
    const s = seatOf(G, role);
    return (s >= 0 && G.P[s].alive && A[s] !== undefined) ? A[s] : -1;
  };

  /* 1. BLOCK */
  const drunk = pick('barman');
  const blocked = s => s === drunk;

  /* 2. HIDE */
  let hidden = -1;
  const kSeat = seatOf(G, 'kuntrabandist');
  if (kSeat >= 0 && G.P[kSeat].alive && A[kSeat] === kSeat && !blocked(kSeat) && G.hideLeft > 0){
    hidden = kSeat; G.hideLeft--;
  }

  /* 3. PROTECT */
  let saved = -1;
  const dSeat = seatOf(G, 'tabib');
  if (dSeat >= 0 && G.P[dSeat].alive && !blocked(dSeat)){
    const t = (A[dSeat] !== undefined) ? A[dSeat] : -1;
    if (t >= 0){ saved = t; G.lastProtect = t; }
    else G.lastProtect = -1;
  } else if (dSeat >= 0){
    G.lastProtect = -1;
  }

  /* 4. FRAME */
  let painted = -1;
  const fSeat = seatOf(G, 'pittur');
  if (fSeat >= 0 && G.P[fSeat].alive && !blocked(fSeat) &&
      A[fSeat] !== undefined && A[fSeat] >= 0) painted = A[fSeat];

  /* how a seat READS to tonight's checks (6a/6b) */
  const readsKlikka = s => {
    if (s === painted) return true;
    const r = G.P[s].role;
    return ROLES[r].side === 'klikka' && r !== 'kap';
  };

  /* 5. KILLS — compute both, then apply simultaneously.
     NIGHT 1 IS A GRACE NIGHT: nobody dies. The klikka meets, the
     lookers look, and the village gets one day of information before
     the bodies start — without it the sim had the klikka at 70-86%
     from eight chairs up. The kills below are simply not computed. */
  const grace = G.night === 1 || G.stunned;
  G.stunned = false;
  const picks = {};
  for (const m of alive(G)){
    if (!ROLES[m.role].kills) continue;
    const t = A[m.seat];
    if (t === undefined || t < 0 || blocked(m.seat)) continue;
    picks[t] = (picks[t] || 0) + 1;
  }
  let kkill = -1, top = 0;
  const tied = [];
  for (const k in picks){
    if (picks[k] > top){ top = picks[k]; tied.length = 0; tied.push(+k); }
    else if (picks[k] === top) tied.push(+k);
  }
  if (tied.length === 1) kkill = tied[0];
  else if (tied.length > 1) kkill = tied.sort((a, b) => a - b)[Math.floor(drawRnd(G) * tied.length)];

  let bkill = -1;
  const bSeat = seatOf(G, 'biccier');
  if (bSeat >= 0 && G.P[bSeat].alive && !blocked(bSeat) && A[bSeat] !== undefined && A[bSeat] >= 0)
    bkill = A[bSeat];
  if (grace){ kkill = -1; bkill = -1; }

  const deaths = [];
  let savedSomeone = false;
  for (const tgt of [kkill, bkill]){
    if (tgt < 0 || !G.P[tgt].alive) continue;
    if (tgt === saved || tgt === hidden){ savedSomeone = true; continue; }
    if (deaths.indexOf(tgt) < 0) deaths.push(tgt);
  }
  const diedTonight = s => deaths.indexOf(s) >= 0;

  /* 6. LOOK — every result from the night as it truly happened */
  G.news = {};
  /* 6a. In-Nanna */
  const nSeat = seatOf(G, 'nanna');
  if (nSeat >= 0 && G.P[nSeat].alive && !blocked(nSeat) && !diedTonight(nSeat) &&
      A[nSeat] !== undefined && A[nSeat] >= 0){
    const t = G.P[A[nSeat]];
    G.news[nSeat] = { kind:'nanna', night:G.night, seat:t.seat, name:t.name,
                      clean: !readsKlikka(t.seat) };
  }
  /* 6b. Il-Kappillan */
  const cSeat = seatOf(G, 'kappillan');
  if (cSeat >= 0 && G.P[cSeat].alive && !blocked(cSeat) && !diedTonight(cSeat) &&
      A[cSeat] !== undefined && A[cSeat] >= 0 && G.acts2[cSeat] >= 0){
    const a = G.P[A[cSeat]], b = G.P[G.acts2[cSeat]];
    G.news[cSeat] = { kind:'kappillan', night:G.night,
                      seat:a.seat, name:a.name, seat2:b.seat, name2:b.name,
                      same: readsKlikka(a.seat) === readsKlikka(b.seat) };
  }
  /* 6c. L-Għassies — who visited his watch target */
  const wSeat = seatOf(G, 'ghassies');
  if (wSeat >= 0 && G.P[wSeat].alive && !blocked(wSeat) && !diedTonight(wSeat) &&
      A[wSeat] !== undefined && A[wSeat] >= 0){
    const watch = A[wSeat];
    const visitors = [];
    const visits = (s, t) => { if (t === watch && s !== wSeat) visitors.push(s); };
    if (drunk >= 0){ const b2 = seatOf(G, 'barman'); if (b2 >= 0 && G.P[b2].alive) visits(b2, drunk); }
    if (dSeat >= 0 && G.P[dSeat].alive && !blocked(dSeat) && A[dSeat] >= 0) visits(dSeat, A[dSeat]);
    if (nSeat >= 0 && G.P[nSeat].alive && !blocked(nSeat) && A[nSeat] >= 0) visits(nSeat, A[nSeat]);
    if (fSeat >= 0 && G.P[fSeat].alive && !blocked(fSeat) && A[fSeat] >= 0) visits(fSeat, A[fSeat]);
    if (cSeat >= 0 && G.P[cSeat].alive && !blocked(cSeat) && A[cSeat] >= 0) visits(cSeat, A[cSeat]);
    if (bSeat >= 0 && bkill >= 0) visits(bSeat, bkill);
    if (kkill >= 0)
      for (const m of alive(G))
        if (ROLES[m.role].kills && !blocked(m.seat) && A[m.seat] === kkill) visits(m.seat, kkill);
    const seen = visitors.filter((v, i) => visitors.indexOf(v) === i).sort((a, b) => a - b);
    G.news[wSeat] = { kind:'ghassies', night:G.night, seat:watch, name:G.P[watch].name,
                      who: seen.map(s => ({ seat:s, name:G.P[s].name })) };
  }

  /* apply the deaths */
  deaths.sort((a, b) => a - b);
  for (const s of deaths) kill(G, s, 'night');
  if (!deaths.length){
    logAdd(G, savedSomeone
      ? 'Sebaħ. Xi ħadd kien attakkat il-lejla — u xi ħadd salvah. Ħadd ma miet.'
      : 'Sebaħ, u ħadd ma miet. Lejl kwiet.');
  } else {
    for (const s of deaths)
      logAdd(G, 'Sebaħ, u sabu lil ' + G.P[s].name + ' mejjet.' + reveal(G, s));
  }

  /* 7. THE SHOT (a machine chair never fires — it could not choose) */
  for (const s of deaths)
    if (G.P[s].role === 'kaccatur' && !isBot(G, s)) G.shotQueue.push(s);

  /* 8. GRUDGE */
  for (const s of deaths) grudgeCheck(G, s, false);

  G.acts = {}; G.acts2 = {};
  /* THE SHOT COMES BEFORE THE WIN (header order 7 before 9): a Kaċċatur who
     died tonight always fires, even if his own death would otherwise end the
     game this instant — his tir can change who wins. */
  if (G.shotQueue.length){ G.shotBack = 'day'; G.phase = 'shot'; return; }
  if (winCheck(G)) return;
  afterDeaths(G);
}

/* dawn resumes once the shot queue has drained: re-check the win with the
   shot's death final, then go where the night (or the lynch) was headed. */
function resolveAfterShot(G){
  if (winCheck(G)) return;
  if (G.shotBack === 'night') toNight(G);
  else afterDeaths(G);
}

/* the mira died — by vote it feeds the grudge, any other way it voids
   it and Tal-Vendetta becomes Il-Miġnun (see header, step 8) */
function grudgeCheck(G, deadSeat, byVote){
  if (G.mira !== deadSeat) return;
  if (byVote){ G.miraDone = true; return; }
  const v = G.P.find(p => p.role === 'vendetta');
  if (v && v.alive && !G.miraDone){
    v.role = 'mignun'; v.converted = true;
  }
  G.mira = -1;
}

/* dawn housekeeping once every corpse (incl. shots) is settled */
function afterDeaths(G){
  G.phase = 'day'; G.votes = {}; G.accused = -1;
  logAdd(G, 'Il-pjazza miftuħa. Min hu s-suspettuż?');
}

function reveal(G, s){
  const p = G.P[s];
  if (!G.opt.revealRoles) return '';
  p.revealed = true;
  return ' Kien ' + ROLES[p.role].name + '.';
}

function kill(G, s, how){
  const p = G.P[s];
  if (!p || !p.alive) return;
  p.alive = false;
  p.diedOn = how + ' ' + G.night;
}

/* ── the day closes: count weighted accusations ────────────────────
   Sole plurality with real backing puts somebody on the planka: at
   least two vote-weight AND at least a quarter of the living, so two
   loud people at a sixteen-chair table cannot put a trial on alone.
   They get their defence, then the verdict. No nominee = quiet day. */
function closeDay(G){
  const liv = alive(G);
  const need = Math.max(2, Math.ceil(liv.length / 4));
  const c = {};
  for (const a of liv){
    const t = G.votes[a.seat];
    if (t !== undefined && t >= 0 && G.P[t] && G.P[t].alive)
      c[t] = (c[t] || 0) + voteWeight(G, a.seat);
  }
  let top = 0; const tied = [];
  for (const k in c){
    if (c[k] > top){ top = c[k]; tied.length = 0; tied.push(+k); }
    else if (c[k] === top) tied.push(+k);
  }
  if (top < need || tied.length !== 1){
    logAdd(G, top < need ? 'Ħadd ma ġie akkużat bis-serjetà. Ir-raħal jorqod.'
                         : 'Il-pjazza ma qablitx — ħadd fuq il-planka. Ir-raħal jorqod.');
    toNight(G);
    return;
  }
  G.accused = tied[0];
  G.phase = 'defence';
  logAdd(G, G.P[G.accused].name + ' fuq il-planka. Ħa jiddefendi ruħu.');
}

function closeVerdict(G){
  let hati = 0, le = 0;
  const voters = alive(G).filter(a => a.seat !== G.accused);
  for (const a of voters){
    const v = G.verdict[a.seat];
    if (v === true) hati += voteWeight(G, a.seat);
    else if (v === false) le += voteWeight(G, a.seat);
  }
  const s = G.accused;
  G.accused = -1;
  if (hati > le){
    const p = G.P[s];
    logAdd(G, 'Ħati (' + hati + '-' + le + '). ' + p.name + ' barra mir-raħal.' + reveal(G, s));
    kill(G, s, 'vote');
    grudgeCheck(G, s, true);
    /* MIĠNUN — his whole win. It is announced ON THE SPOT and the
       pjazza has to live with what it did, but the game carries on to
       a real ending: an earlier build ended the game here, and the
       simulation showed the fool then DECIDED 20-40% of evenings —
       the main event became the joke instead of the klikka. He is
       added to the winners at the end instead. */
    if (p.role === 'mignun'){
      p.revealed = true;
      G.mignunWon = s;
      /* ...and the night after, NOBODY dies: the village is too stunned
         and even the klikka stays home laughing. Compensates the pjazza
         for the wasted day (measured — without it every fool-lynch was
         a straight gift to the klikka) and it is funnier. */
      G.stunned = true;
      logAdd(G, 'Il-Miġnun DAK LI RIED — dik ir-rebħa tiegħu, u intom ilkoll ' +
                'għamiltuha bl-idejn. Il-lejla ħadd mhu se joqtol — ir-raħal ' +
                'baqa’ skantat. Il-logħba tkompli mingħajru.');
    }
    /* the lynched Kaċċatur fires BEFORE the win is called, and dawn after his
       shot leads into the NIGHT (a lynch closes the day) — not back to day */
    if (p.role === 'kaccatur' && !isBot(G, s)){
      G.shotQueue.push(s); G.shotBack = 'night'; G.phase = 'shot';
      return;
    }
    if (winCheck(G)) return;
  } else {
    logAdd(G, 'Mhux ħati (' + hati + '-' + le + '). ' + G.P[s].name + ' jinżel mill-planka.');
  }
  toNight(G);
}

function toNight(G){
  G.night++; G.phase = 'night'; G.acts = {}; G.acts2 = {}; G.votes = {}; G.verdict = {};
  logAdd(G, 'Lejl ' + G.night + '. Ir-raħal jorqod' + String.fromCharCode(8230));
  /* a night with nobody to act in it resolves itself instantly */
  if (!actorsTonight(G).length) resolveNight(G);
}

/* ═══════════════════════════════════════════════════════════════════
   WIN CHECK — precedence per the header. Returns true if game over.
   ═══════════════════════════════════════════════════════════════════ */
function addHangersOn(G){
  /* the smuggler co-wins anything he survives; spite co-wins from
     beyond the grave if the mira ever swung */
  const ku = G.P.find(p => p.role === 'kuntrabandist');
  if (ku && ku.alive && G.winners.indexOf(ku.seat) < 0) G.winners.push(ku.seat);
  const vd = G.P.find(p => p.role === 'vendetta');
  if (vd && G.miraDone && G.winners.indexOf(vd.seat) < 0) G.winners.push(vd.seat);
  if (typeof G.mignunWon === 'number' && G.winners.indexOf(G.mignunWon) < 0)
    G.winners.push(G.mignunWon);
}
function winCheck(G){
  if (G.over) return true;
  const liv = alive(G);
  const kl = liv.filter(p => ROLES[p.role].side === 'klikka').length;
  const bi = liv.some(p => p.role === 'biccier');
  let win = null;
  if (!liv.length) win = 'draw';
  else if (!kl && !bi) win = 'rahal';
  else if (kl && !bi && kl >= liv.length - kl) win = 'klikka';
  else if (bi && !kl && liv.length <= 2) win = 'biccier';
  if (!win) return false;
  G.over = true; G.winner = win;
  G.winners = G.P.filter(p => {
    if (win === 'rahal') return ROLES[p.role].side === 'rahal';
    if (win === 'klikka') return ROLES[p.role].side === 'klikka';
    if (win === 'biccier') return p.role === 'biccier';
    return false;
  }).map(p => p.seat);
  if (win !== 'draw') addHangersOn(G);
  logAdd(G,
    win === 'rahal'   ? 'Ir-raħal meħlus. Il-klikka spiċċat, u l-festa ssir xorta.' :
    win === 'klikka'  ? 'Il-klikka ħadet ir-raħal f’idejha. Il-każin l-ieħor rebaħ kollox.' :
    win === 'biccier' ? 'Baqa’ biss il-Biċċier u s-skiet. Rebaħ hu.' :
                        'Ir-raħal battal. Ħadd ma rebaħ xejn.');
  return true;
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW — the only window a player's screen may look through. The UI
   must render FROM THIS, never from G.P[..].role of another seat.
   (Online, every phone still holds the whole state in memory — that
   is the architecture of the relay and it is client-side secrecy;
   view() is what keeps it out of the DOM.) The dead are NOT given
   the hidden roles: a dead player sees what the living see plus the
   dead channel, which is what keeps Tal-Karti's seance honest — the
   dead can only tell her what they actually experienced.
   ═══════════════════════════════════════════════════════════════════ */
function view(G, seat){
  const me = G.P[seat];
  if (!me) return null;
  const R = ROLES[me.role];
  const mates = (R.side === 'klikka')
    ? G.P.filter(p => ROLES[p.role].side === 'klikka' && p.seat !== seat)
         .map(p => ({ seat: p.seat, name: p.name, role: ROLES[p.role].name }))
    : [];
  const o = {
    seat: seat, name: me.name, alive: me.alive,
    role: { id: me.role, name: R.name, side: R.side, what: R.what,
            night: R.night, two: !!R.two },
    converted: !!me.converted,
    mates: mates,
    mira: (me.role === 'vendetta' && G.mira >= 0)
      ? { seat: G.mira, name: G.P[G.mira].name } : null,
    phase: G.phase, night: G.night, over: G.over,
    canAct: false, acted: G.acts[seat] !== undefined,
    mustShoot: G.phase === 'shot' && G.shotQueue[0] === seat,
    canReveal: me.role === 'sindku' && me.alive && G.mayor !== seat &&
               (G.phase === 'day' || G.phase === 'defence' || G.phase === 'verdict'),
    accused: G.accused,
    hideLeft: me.role === 'kuntrabandist' ? G.hideLeft : 0,
    news: (me.alive && G.news[seat]) ? G.news[seat] : null,
    /* the referee: may this human open their mouth in the room? */
    speak: me.alive && (G.phase === 'day' || G.phase === 'verdict' ||
                        (G.phase === 'defence' && seat === G.accused)) && !G.over
  };
  if (me.alive && G.phase === 'night' && R.night &&
      !(me.role === 'kuntrabandist' && G.hideLeft <= 0)) o.canAct = true;
  return o;
}

/* ═══════════════════════════════════════════════════════════════════
   CHANNELS — THE SINGLE AUTHORITY on who may read and who may write.
   ───────────────────────────────────────────────────────────────────
   Chat is presentation, never game state: nothing in here touches the
   seed, the move log or the phases. But the RULE about who a channel
   belongs to is a rule of the game, so it lives here in the engine —
   the UI's channel tabs, the input's label and the wire's recipient
   list are all read off these functions and nowhere else. A new role
   that opens a channel adds a flag on its ROLES entry and a case
   here; the chat plumbing never changes.

   The fixed channels are just the default cases of the same rule:
     pjazza   read: everyone. write: the living, by day (during the
              defence only the accused has the floor).
     klikka   read: living klikka-side, any time (their own record).
              write: living klikka-side, at night.
     mejtin   read: the dead, always — plus any living role with the
              `seance` flag (Tal-Karti), AT NIGHT ONLY: by day the
              karti are folded away, so she cannot watch the dead
              react to a live vote. write: the dead always; the
              seance-holder at night. Her lines reach the dead signed
              with her ROLE name, never her own — in one physical
              room a dead klikkun sits beside a living one, and a
              name typed to the dead is a name leaked.
   ═══════════════════════════════════════════════════════════════════ */
function channels(G, seat){
  const p = G.P[seat];
  if (!p) return [];
  const R = ROLES[p.role];
  const night = G.phase === 'night' || G.phase === 'shot';
  const out = [];
  out.push({
    id:'pjazza', name:'Il-Pjazza', cls:'day',
    read: true,
    write: p.alive && !G.over &&
           (G.phase === 'day' || G.phase === 'verdict' ||
            (G.phase === 'defence' && seat === G.accused)),
    note: G.phase === 'defence'
      ? (seat === G.accused ? 'Iddefendi ruħek.' : 'Il-planka għand l-akkużat.')
      : (night ? 'Bil-lejl il-pjazza magħluqa.' : '')
  });
  if (R.side === 'klikka' && p.alive){
    out.push({
      id:'klikka', name:'Il-Klikka', cls:'kill',
      read: true, write: night && !G.over,
      note: night ? 'Sħabek biss jaqraw dan.' : 'Il-klikka titkellem bil-lejl.'
    });
  }
  const isSeance = R.seance && p.alive;
  if (!p.alive || (isSeance && night)){
    out.push({
      id:'mejtin', name: p.alive ? 'Is-Seduta' : 'Il-Mejtin', cls:'dead',
      read: true, write: !G.over,
      note: p.alive ? 'Il-mejtin jarawk bħala "' + R.name + '", qatt b’ismek.'
                    : 'Il-ħajjin ma jaraw XEJN minn hawn.'
    });
  }
  return out;
}
/* the seats allowed to READ a channel right now — the wire's recipient
   list is built from this and from nothing else */
function chanReaders(G, ch){
  const night = G.phase === 'night' || G.phase === 'shot';
  const out = [];
  for (const p of G.P){
    if (ch === 'pjazza'){ out.push(p.seat); continue; }
    if (ch === 'klikka'){
      if (p.alive && ROLES[p.role].side === 'klikka') out.push(p.seat);
      continue;
    }
    if (ch === 'mejtin'){
      if (!p.alive) out.push(p.seat);
      else if (ROLES[p.role].seance && night) out.push(p.seat);
    }
  }
  return out;
}
/* may this seat WRITE to this channel right now? One answer, engine's. */
function chanWrite(G, seat, ch){
  return channels(G, seat).some(c => c.id === ch && c.write);
}

/* ── snapshots: a reload must give back the exact game ────────────── */
function snapshot(G){ return JSON.parse(JSON.stringify(G)); }
function load(snap){
  if (!snap || typeof snap !== 'object' || !Array.isArray(snap.P) || !snap.opt) return null;
  const G = JSON.parse(JSON.stringify(snap));
  for (const p of G.P) if (!ROLES[p.role]) return null;
  return G;
}

/* what the whole pjazza may see about a seat (for the roster strip) */
function publicSeat(G, s){
  const p = G.P[s];
  return {
    seat: s, name: p.name, alive: p.alive,
    mayor: G.mayor === s,
    role: (p.revealed && (!p.alive || G.mayor === s)) ? ROLES[p.role].name : null
  };
}

GLOB.SUSPETT = {
  ROLES, SETUPS, POOL_DEFAULT, MIN_TABLE, killerCount,
  rosterFromPool, validateRoster, rosterBalance,
  create, act, view, publicSeat,
  channels, chanReaders, chanWrite, snapshot, load,
  alive, actorsTonight, winCheck, mulberry32
};
})();
