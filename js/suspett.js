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

     1. BLOCK    Tal-Bar gets one player blind drunk. He acts first
                 and can never be blocked himself. THEN Is-Surġent
                 locks one player in the għassa cell — unless the
                 Surġent is the drunk one, in which case he locks
                 nobody. Every later action by a BLOCKED player
                 (drunk or jailed) is cancelled outright: a blocked
                 Tabib protects nobody, a blocked Nanna learns
                 nothing, a blocked klikka member's kill pick is not
                 counted, a blocked Biċċier kills nobody, a blocked
                 Pittur paints nothing, a blocked Velenu poisons
                 nobody, a blocked Sarima gags nobody, a blocked
                 Tal-Bieb guards nobody, a blocked Tar-Ronda fires
                 nothing (and spends nothing), a blocked Għassies /
                 Xummiemu / Ħaffier sees nothing, a blocked Kappillan
                 hears nothing, a blocked Kuntrabandist fails to hide.
     2. HIDE     Il-Kuntrabandist hides (self-protection, limited
                 uses). Spent only if it actually happens (unblocked).
     3. PROTECT  It-Tabib's protection lands on his target; the
                 Surġent's cell counts as protection on the jailed
                 man; Tal-Bieb takes up his post at his target's door
                 (the redirect itself happens at step 5).
     4. FRAME    Il-Pittur paints his target: for TONIGHT's checks
                 (steps 6a/6b) that player reads as klikka-side.
     4b. GAG     Is-Sarima ties the muzzle: her target spends
                 TOMORROW's day voting only — no speaking out loud,
                 no writing in the pjazza. Announced at dawn. The
                 planka unties it: an accused man always defends
                 himself.
     5. KILLS    Every kill is COMPUTED first, then all deaths are
                 APPLIED simultaneously. The kill sources, in the
                 order they are computed:
                 a) the GUILT: a Tar-Ronda whose shot put a rahal-side
                    body on the ground the previous night dies now.
                    Internal — no protection, no cell, no doorman,
                    nothing stops it, and he cannot act tonight.
                 b) the POISON RIPENS: whoever Tal-Velenu poisoned the
                    previous night dies now unless PROTECTED tonight
                    (Tabib or cell) — that protection CURES him. HIDE
                    and Tal-Bieb do not help: it is already inside.
                 c) the klikka kill: the plurality of the picks of
                    UNBLOCKED living klikka KILLERS (Il-Kap and
                    Tal-Klikka; Pittur, Velenu and Sarima hold klikka
                    seats but do not join the group kill). Ties break
                    by the seeded RNG; no unblocked picks, no kill.
                 d) Il-Biċċier's kill: his own pick.
                 e) TAR-RONDA's kill: his own pick. He carries TWO
                    cartridges for the whole game; one is spent the
                    moment his kill is computed (unblocked, non-grace
                    night) even if the target is then saved. If his
                    shot lands a rahal-side body — including a doorman
                    who stepped into it — the guilt kills him per (a)
                    on the next non-grace night.
                 f) the VIAL: Tal-Velenu poisons tonight's target —
                    not a death tonight; the mark ripens per (b).
                    PROTECT and HIDE stop the poisoning. Only one vial
                    works at a time: while a mark is pending he cannot
                    pour another.
                 For (c)(d)(e)(f): a target under PROTECT or HIDE
                 survives (the log says somebody was attacked and
                 saved, naming nobody). A target guarded by TAL-BIEB
                 is hit THROUGH the doorman: Tal-Bieb takes the kill
                 (or the vial) himself, unless he too is protected.
                 IX-XEWKA pricks back: if any of (c)(d)(e)(f)
                 TARGETED her and FOUND her (she was not hidden;
                 a doorman in front of her does not matter — they
                 reached her house), ONE of the attackers, chosen by
                 the seeded RNG, dies of the thorn — unless that
                 attacker is himself protected. Any number of kills
                 on one unprotected target are one death, and because
                 application is simultaneous the kills can cross: the
                 klikka can kill Il-Biċċier or Tar-Ronda the same
                 night he kills one of them, and both die. Each
                 corpse remembers its WEAPON (see 6e).
                 GRACE NIGHTS (night 1, and the stunned night after a
                 lynched Miġnun): NOTHING in step 5 happens — no kill,
                 no guilt, no ripening, no poisoning, no prick, no
                 cartridge spent. The frame and the gag still happen.
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
                     living target: the barman, the surġent, the
                     tabib, tal-bieb, the nanna, the pittur, the
                     sarima, tal-velenu, the biċċier, tar-ronda, the
                     kappillan (his first pick only — the second he
                     watches from the sagristija) and every unblocked
                     klikka killer whose pick became the kill all
                     visit their targets. A blocked player visits
                     nobody. The kuntrabandist hides at home.
                     Watching (Għassies, Xummiemu) is not a visit,
                     and Il-Ħaffier digs among the dead, not the
                     living.
                 6d. IX-XUMMIEMU learns WHERE HIS TARGET WENT: the
                     visit (if any) his target performed tonight, by
                     the same definition of a visit as 6c.
                 6e. IL-ĦAFFIER examines one CORPSE — any corpse, any
                     age — and learns the WEAPON that made it: the
                     klikka's blow, the Biċċier's knife, Tar-Ronda's
                     shotgun, the poison, the thorn, a Kaċċatur's
                     last shot, the guilt, or the planka.
     6f. THE SÉANCE is NOT in this list on purpose. Tal-Karti's line
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
  tarronda: {
    name:'Tar-Ronda', side:'rahal', night:true, unique:true,
    what:'Il-pulizija ’l bogħod u int xbajt tistenna. Bil-lejl toħroġ ' +
         'iddur it-toroq bis-senter taħt il-kappott: għandek ŻEWĠ tiri ' +
         'għal-logħba kollha. Attent fuq min tisparahom — jekk toqtol ' +
         'wieħed tar-raħal, il-kuxjenza tikolk u tmut il-lejl ta’ wara.'
  },
  talbieb: {
    name:'Tal-Bieb', side:'rahal', night:true, unique:true,
    what:'Kull lejl tagħżel persuna u toqgħod għassa mal-bieb tagħha. ' +
         'Jekk xi ħadd jiġi joqtolha — jew javvelenaha — id-daqqa ' +
         'tieħuha INT minflokha. Xogħol ta’ unur, u ta’ demm.'
  },
  surgent: {
    name:'Is-Surġent', side:'rahal', night:true, unique:true,
    what:'Kull lejl taqfel persuna waħda fiċ-ċella tal-għassa: dik ' +
         'il-persuna MA TAGĦMEL XEJN dak il-lejl, imma lanqas jista’ ' +
         'għaliha ħadd — fiċ-ċella qiegħda fis-sod. Mhux l-istess ' +
         'persuna żewġt iljieli wara xulxin.'
  },
  xummiemu: {
    name:'Ix-Xummiemu', side:'rahal', night:true, unique:true,
    what:'Imnieħrek twil u saqajk ħfief. Kull lejl timxi wara persuna ' +
         'u sa filgħodu tkun taf GĦAND MIN marret dak il-lejl. Fejn ' +
         'tmur in-nies bil-lejl jgħid ħafna fuqhom.'
  },
  haffier: {
    name:'Il-Ħaffier', side:'rahal', night:true, unique:true,
    what:'Int tħaffer l-oqbra, u l-katavri jkellmuk. Kull lejl ' +
         'teżamina mejjet wieħed u sa filgħodu tkun taf B’LIEMA ARMA ' +
         'nqatel — daqqa tal-klikka, sikkina, senter, velenu… Il-mod ' +
         'kif imutu n-nies jikxef lil min qatilhom.'
  },
  xewka: {
    name:'Ix-Xewka', side:'rahal', night:false, unique:true,
    what:'Bil-lejl ma tagħmel xejn — imma min imidd idu fuqek jindem. ' +
         'Jekk xi ħadd jiġi għalik bil-lejl, wieħed minnhom jitniggeż ' +
         'bix-xewka u jmut hu wkoll. Int xorta tista’ tmut — imma ' +
         'qatt waħdek.'
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
  velenu: {
    name:'Tal-Velenu', side:'klikka', night:true, unique:true,
    what:'Mal-klikka, imma s-sengħa tiegħek bil-mod taħdem: kull lejl ' +
         'tqattar il-velenu f’tazza ta’ xi ħadd. Ma jmutx dak il-ħin — ' +
         'imut il-lejl TA’ WARA, sakemm it-Tabib ma jsibux fil-ħin. ' +
         'Il-vittma tinduna… u tibda titkarrab quddiem kulħadd.'
  },
  sarima: {
    name:'Is-Sarima', side:'klikka', night:true, unique:true,
    what:'Mal-klikka. Kull lejl tagħżel persuna u torbotilha s-sarima ' +
         'ma’ ħalqha: l-għada fil-pjazza dik il-persuna MA TITKELLIMX ' +
         'u ma tiktibx — tivvota biss. Sikket lil min jaf wisq.'
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
   sixteen brought every preset inside 30-60% for the village.
   EVERY klikka-side role folds INTO this count (a Velenu or a Sarima
   takes a killer seat, it does not add one), and the village-side
   guns (Tar-Ronda, Ix-Xewka) are village chairs: a threat to the
   klikka is not a killer in this arithmetic. */
function killerCount(n){ return n >= 15 ? 3 : n >= 9 ? 2 : 1; }

/* roles that only earn a chair at a certain size even when enabled —
   below it they warp the game (a lone unfindable Kap broke 5-8 player
   villages at 1-12% wins in simulation; a Biċċier needs a crowd) */
const MIN_TABLE = { kap:10, pittur:12, biccier:13, vendetta:9, talkarti:8,
                    kappillan:9, ghassies:9, sindku:10, kuntrabandist:10,
                    /* at five chairs a mislynch on the fool ends the whole
                       evening in one vote — he waits for a sixth */
                    mignun:6,
                    /* the new blood — floors measured in the same sim:
                       a village gun below nine chairs crushes the lone
                       klikkun; the jail and the thorn are late luxuries;
                       the poison and the gag need a klikka big enough
                       to spare a killer seat */
                    tarronda:9, talbieb:8, haffier:9, xummiemu:10,
                    xewka:10, surgent:12, velenu:11, sarima:11 };

/* every role a host may put in the pot */
const POOL_ALL = Object.keys(ROLES).filter(r => r !== 'rahli' && r !== 'klikka');
/* THE TWO MODES — both are STARTING POINTS: the host may edit either
   pool afterwards, and the same builder defends whatever comes out.
     bilanc  the measured, tested pot — tap a size and play.
     borma   Il-Borma l-Kbira: the whole catalogue, chaos on purpose.
   The balanced pot is POOL_ALL minus the wildest tools (jail,
   poison, gag, tracker) — those live in the big pot, measured too.
   Ix-Xewka stays in the balanced pot on purpose: she plays herself
   (no decisions), and the 9-12 band needed her weight — see the
   simulation table in the report. */
const POOL_DEFAULT = POOL_ALL.filter(id =>
  ['surgent', 'velenu', 'sarima', 'xummiemu'].indexOf(id) < 0);
const MODES = [
  { id:'bilanc', name:'Bilanċjata',
    note:'Il-borma ppruvata bis-simulazzjoni — agħfas u ilagħbu.',
    pool: POOL_DEFAULT },
  { id:'borma', name:'Il-Borma l-Kbira',
    note:'Il-katalgu kollu fil-borma: velenu, sarima, xewka, ċella… ' +
         'Kollox jista’ jinzerta. Lejla differenti.',
    pool: POOL_ALL }
];

/* THE AUTO-BALANCER. One builder for every path (presets, the setup
   sheet, both modes, online): given the size and whatever pool the
   host left enabled, it deals a table that plays:
     - the klikka block never exceeds killerCount(n) and always holds
       at least ONE true group killer; Pittur/Velenu/Sarima only take
       the surplus killer seats;
     - the village gets its SHAPE before its luxuries: one looker and
       one protector are seated first (a village of nine Raħli and a
       joke loses regardless of the killer count), then the fool,
       then the village gun, then a seeded shuffle of the rest — so a
       big pool gives a DIFFERENT village every deal, not the same
       sixteen forever;
     - size floors (MIN_TABLE) always hold.
   The seed makes it deterministic per game: every phone in a room
   deals the identical roster; without a seed (previews) it is fixed. */
function rosterFromPool(n, pool, seed){
  pool = (Array.isArray(pool) && pool.length ? pool : POOL_DEFAULT)
    .filter(r => ROLES[r] && r !== 'rahli' && r !== 'klikka');
  const rnd = mulberry32((((seed >>> 0) || 0x51CA) ^ Math.imul(n, 0x9E3779B9)) >>> 0);
  const has = id => pool.indexOf(id) >= 0 && n >= (MIN_TABLE[id] || 0);
  const shuf = a => {
    for (let i = a.length - 1; i > 0; i--){
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  const out = [];
  /* the klikka block */
  let k = killerCount(n);
  if (has('kap')){ out.push('kap'); k--; }
  const utils = shuf(['pittur', 'velenu', 'sarima'].filter(has));
  while (k > 1 && utils.length){ out.push(utils.shift()); k--; }
  while (k-- > 0) out.push('klikka');
  if (has('biccier')) out.push('biccier');
  /* village SHAPE first: a looker, a protector, the joke, the gun */
  const used = {};
  for (const r of out) used[r] = 1;
  const take = id => { out.push(id); used[id] = 1; };
  const looks = ['nanna', 'kappillan', 'ghassies', 'xummiemu', 'haffier'].filter(has);
  const prots = ['tabib', 'talbieb', 'surgent'].filter(has);
  if (out.length < n && looks.length) take(looks[0]);
  if (out.length < n && prots.length) take(prots[0]);
  if (out.length < n && has('mignun')) take('mignun');
  if (out.length < n && has('tarronda')) take('tarronda');
  /* the rest of the enabled catalogue, seeded-shuffled for variety */
  const rest = shuf(pool.filter(id => has(id) && !used[id] &&
    ROLES[id].side !== 'klikka' && id !== 'biccier'));
  while (out.length < n && rest.length) out.push(rest.shift());
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
  const kills = list.filter(r => ROLES[r].kills || r === 'biccier' || r === 'velenu').length;
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
  const seed = (o.seed >>> 0) || 1;
  const roster = (o.roster && o.roster.slice()) || rosterFromPool(n, o.pool || null, seed);
  const v = validateRoster(roster, n);
  if (!v.ok) throw new Error('SUSPETT: ' + v.why);
  const rnd = mulberry32(seed);
  /* seeded shuffle — every phone deals the same hand from the seed */
  const deal = roster.slice();
  for (let i = deal.length - 1; i > 0; i--){
    const j = Math.floor(rnd() * (i + 1));
    const t = deal[i]; deal[i] = deal[j]; deal[j] = t;
  }
  /* A MACHINE CHAIR CANNOT LIE, so it must never hold a role that has
     to — and above all it must never hold a KILL, because a machine
     that never picks a victim can leave a table nobody can end. If
     the room seated bots, swap their roles toward human chairs
     deterministically, KILLERS FIRST: a bot holding a kill-capable
     seat (klikka-side or Biċċier) trades with a human Raħli if one
     exists, else with the lowest human rahal-side chair; only then
     do the remaining named bot roles trade toward plain Raħli.
     Every phone gets the same bot list from the room, so every phone
     performs identical swaps. */
  const bots = Array.isArray(o.bots) ? o.bots.slice().sort((a, b) => a - b) : [];
  const isBotSeat = i => bots.indexOf(i) >= 0;
  const lethal = r => ROLES[r].side === 'klikka' || r === 'biccier';
  for (const b of bots){
    if (b < 0 || b >= n || !lethal(deal[b])) continue;
    let to = -1;
    for (let i = 0; i < n && to < 0; i++)
      if (deal[i] === 'rahli' && !isBotSeat(i)) to = i;
    for (let i = 0; i < n && to < 0; i++)
      if (!isBotSeat(i) && !lethal(deal[i]) && ROLES[deal[i]].side === 'rahal') to = i;
    if (to >= 0){ const t = deal[to]; deal[to] = deal[b]; deal[b] = t; }
  }
  for (const b of bots){
    if (b < 0 || b >= n || deal[b] === 'rahli') continue;
    for (let i = 0; i < n; i++){
      if (deal[i] === 'rahli' && !isBotSeat(i)){
        deal[i] = deal[b]; deal[b] = 'rahli'; break;
      }
    }
  }
  const G = {
    v: 1, seed: seed, rndN: 0, bots: bots,
    opt: {
      revealRoles: o.revealRoles !== false,      /* default ON — see header */
      /* dayChat ON (default): the pjazza argues in the in-app chat (remote play).
         OFF: the day is spoken OUT LOUD in the room — the pjazza text chat is
         closed. This NEVER touches the secret klikka night chat or the dead
         chat, which stay in-app so nobody has to break the room's silence. */
      dayChat: o.dayChat !== false,
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
    lastJail: -1,        /* surġent may not repeat a cell guest */
    rondaShots: 2,       /* tar-ronda cartridges */
    rondaGuilt: false,   /* he shot an innocent; dies next non-grace night */
    poison: null,        /* {seat, night} — tal-velenu's pending mark */
    muted: -1,           /* seat gagged by is-sarima for the current day */
    mayor: -1,           /* seat of a REVEALED sindku, else -1 */
    mira: -1,            /* tal-vendetta's grudge target */
    miraDone: false,     /* the pjazza voted the mira out */
    votes: {},           /* day: seat -> nominee (-1 abstain) */
    accused: -1,
    verdict: {},         /* seat -> true(hati)/false */
    shotQueue: [],       /* dead kaċċaturi still owed their shot */
    shotBack: '',        /* where dawn resumes once the queue drains: 'day' (night deaths) or 'night' (a daytime lynch) */
    news: {},            /* seat -> ARRAY of last night's private results, view() only */
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
    /* an empty gun, or the guilt night, keeps Tar-Ronda in bed */
    if (p.role === 'tarronda' && ((G.rondaShots | 0) <= 0 || G.rondaGuilt)) return false;
    /* the gravedigger needs a grave */
    if (p.role === 'haffier' && !G.P.some(q => !q.alive)) return false;
    /* one vial at a time: a pending mark keeps Tal-Velenu home */
    if (p.role === 'velenu' && G.poison) return false;
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
      if (p.role === 'tarronda'){
        if (G.rondaGuilt) return no('Il-kuxjenza ma tħallikx toħroġ illejla.');
        if ((G.rondaShots | 0) <= 0) return no('M’għandekx aktar tiri.');
      }
      const tgt = int(mv.target);
      const tgt2 = int(mv.target2);
      if (tgt !== -1){
        const q = G.P[tgt];
        if (!q) return no('Dik il-persuna mhix fil-logħba.');
        if (p.role === 'haffier'){
          if (q.alive) return no('Il-Ħaffier jeżamina l-MEJTIN biss.');
        } else if (!q.alive) return no('Dik il-persuna mhix fil-logħba.');
        if (p.role === 'tabib' && tgt === G.lastProtect) return no('Mhux l-istess persuna żewġt iljieli.');
        if (p.role === 'surgent' && tgt === G.lastJail) return no('Mhux l-istess ċella żewġt iljieli.');
        if (p.role === 'kuntrabandist' && tgt !== p.seat) return no('Il-Kuntrabandist jistaħba hu biss.');
        if (p.role === 'velenu' && G.poison) return no('Il-velenu l-ieħor għadu jaħdem — stenna.');
        if (ROLES[p.role].side === 'klikka' && ROLES[q.role].side === 'klikka')
          return no('Mhux lil sħabek stess.');
        if ((p.role === 'biccier' || p.role === 'barman' || p.role === 'ghassies' ||
             p.role === 'pittur' || p.role === 'nanna' || p.role === 'surgent' ||
             p.role === 'talbieb' || p.role === 'xummiemu' || p.role === 'velenu' ||
             p.role === 'sarima' || p.role === 'tarronda') && tgt === p.seat)
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

  /* 1. BLOCK — Tal-Bar first (never blockable), then Is-Surġent */
  const drunk = pick('barman');
  const sgSeat = seatOf(G, 'surgent');
  let jailed = -1;
  if (sgSeat >= 0 && G.P[sgSeat].alive && sgSeat !== drunk){
    const t = (A[sgSeat] !== undefined) ? A[sgSeat] : -1;
    if (t >= 0){ jailed = t; G.lastJail = t; }
    else G.lastJail = -1;
  } else if (sgSeat >= 0){
    G.lastJail = -1;
  }
  const blocked = s => s === drunk || s === jailed;

  /* 2. HIDE */
  let hidden = -1;
  const kSeat = seatOf(G, 'kuntrabandist');
  if (kSeat >= 0 && G.P[kSeat].alive && A[kSeat] === kSeat && !blocked(kSeat) && G.hideLeft > 0){
    hidden = kSeat; G.hideLeft--;
  }

  /* 3. PROTECT — the tabib, the cell; Tal-Bieb takes up his post */
  const savedL = [];
  if (jailed >= 0) savedL.push(jailed);
  const dSeat = seatOf(G, 'tabib');
  if (dSeat >= 0 && G.P[dSeat].alive && !blocked(dSeat)){
    const t = (A[dSeat] !== undefined) ? A[dSeat] : -1;
    if (t >= 0){ savedL.push(t); G.lastProtect = t; }
    else G.lastProtect = -1;
  } else if (dSeat >= 0){
    G.lastProtect = -1;
  }
  const isSaved = s => savedL.indexOf(s) >= 0;
  const gSeat = seatOf(G, 'talbieb');
  let guardT = -1;
  if (gSeat >= 0 && G.P[gSeat].alive && !blocked(gSeat) &&
      A[gSeat] !== undefined && A[gSeat] >= 0) guardT = A[gSeat];

  /* 4. FRAME */
  let painted = -1;
  const fSeat = seatOf(G, 'pittur');
  if (fSeat >= 0 && G.P[fSeat].alive && !blocked(fSeat) &&
      A[fSeat] !== undefined && A[fSeat] >= 0) painted = A[fSeat];

  /* 4b. GAG — noted now, tied to the state after the deaths land */
  let muteT = -1;
  const smSeat = seatOf(G, 'sarima');
  if (smSeat >= 0 && G.P[smSeat].alive && !blocked(smSeat) &&
      A[smSeat] !== undefined && A[smSeat] >= 0) muteT = A[smSeat];

  /* how a seat READS to tonight's checks (6a/6b) */
  const readsKlikka = s => {
    if (s === painted) return true;
    const r = G.P[s].role;
    return ROLES[r].side === 'klikka' && r !== 'kap';
  };

  /* 5. KILLS — computed per the header, applied simultaneously.
     NIGHT 1 IS A GRACE NIGHT (and so is the stunned night): nothing
     in step 5 happens. Without it the sim had the klikka at 70-86%
     from eight chairs up. */
  const grace = G.night === 1 || G.stunned;
  G.stunned = false;

  /* (c) the klikka group kill */
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

  /* (d) Il-Biċċier */
  let bkill = -1;
  const bSeat = seatOf(G, 'biccier');
  if (bSeat >= 0 && G.P[bSeat].alive && !blocked(bSeat) && A[bSeat] !== undefined && A[bSeat] >= 0)
    bkill = A[bSeat];

  /* (e) Tar-Ronda */
  let rkill = -1;
  const rSeat = seatOf(G, 'tarronda');
  if (rSeat >= 0 && G.P[rSeat].alive && !G.rondaGuilt && (G.rondaShots | 0) > 0 &&
      !blocked(rSeat) && A[rSeat] !== undefined && A[rSeat] >= 0)
    rkill = A[rSeat];

  /* (f) the vial */
  let vTgt = -1;
  const vSeat = seatOf(G, 'velenu');
  if (vSeat >= 0 && G.P[vSeat].alive && !blocked(vSeat) && !G.poison &&
      A[vSeat] !== undefined && A[vSeat] >= 0) vTgt = A[vSeat];

  if (grace){ kkill = -1; bkill = -1; rkill = -1; vTgt = -1; }
  if (rkill >= 0) G.rondaShots--;   /* spent the moment it is computed */

  const deaths = [];                /* [{s, w}] — seat and weapon */
  let savedSomeone = false;
  const dHas = s => deaths.some(d => d.s === s);
  const pushD = (s, w) => { if (!dHas(s)) deaths.push({ s: s, w: w }); };
  const xSeat = seatOf(G, 'xewka');
  const pricks = [];                /* hands that touched the thorn */
  /* one kill, through every defence in header order; returns the seat
     that actually died, or -1 */
  const applyKill = (tgt, w, from) => {
    if (tgt < 0 || !G.P[tgt].alive) return -1;
    if (tgt === xSeat && tgt !== hidden) for (const f of from) if (f >= 0) pricks.push(f);
    if (tgt === hidden || isSaved(tgt)){ savedSomeone = true; return -1; }
    if (guardT === tgt && gSeat !== tgt && G.P[gSeat].alive){
      if (isSaved(gSeat)){ savedSomeone = true; return -1; }
      pushD(gSeat, w); return gSeat;
    }
    pushD(tgt, w); return tgt;
  };

  /* (a) the guilt — internal, nothing stops it */
  if (!grace && G.rondaGuilt){
    if (rSeat >= 0 && G.P[rSeat].alive) pushD(rSeat, 'kuxjenza');
    G.rondaGuilt = false;
  }
  /* (b) the poison ripens — only PROTECT (tabib or cell) cures */
  let cured = -1;
  if (!grace && G.poison && G.poison.night < G.night){
    const ps = G.poison.seat;
    if (G.P[ps] && G.P[ps].alive){
      if (isSaved(ps)){ cured = ps; savedSomeone = true; }
      else pushD(ps, 'velenu');
    }
    G.poison = null;
  }
  /* (c)(d)(e) blades and bullets */
  const kFrom = [];
  if (kkill >= 0)
    for (const m of alive(G))
      if (ROLES[m.role].kills && !blocked(m.seat) && A[m.seat] === kkill) kFrom.push(m.seat);
  applyKill(kkill, 'klikka', kFrom);
  applyKill(bkill, 'biccier', bSeat >= 0 ? [bSeat] : []);
  const rVictim = applyKill(rkill, 'ronda', rSeat >= 0 ? [rSeat] : []);
  /* (f) the vial finds a throat — the doorman drinks it if he is there */
  let poisonedNow = -1;
  if (vTgt >= 0 && G.P[vTgt].alive){
    if (vTgt === xSeat && vTgt !== hidden) pricks.push(vSeat);
    if (vTgt === hidden || isSaved(vTgt)) savedSomeone = true;
    else if (guardT === vTgt && gSeat !== vTgt && G.P[gSeat].alive){
      if (isSaved(gSeat)) savedSomeone = true;
      else { G.poison = { seat: gSeat, night: G.night }; poisonedNow = gSeat; }
    } else {
      G.poison = { seat: vTgt, night: G.night }; poisonedNow = vTgt;
    }
  }
  /* the thorn pricks ONE hand, seeded */
  if (pricks.length && xSeat >= 0){
    const u = pricks.filter((v, i) => pricks.indexOf(v) === i)
                    .filter(s => G.P[s].alive).sort((a, b) => a - b);
    if (u.length){
      const pk = u[Math.floor(drawRnd(G) * u.length)];
      if (pk === hidden || isSaved(pk)) savedSomeone = true;
      else pushD(pk, 'xewka');
    }
  }
  /* tonight's shot landed an innocent? the guilt is set for NEXT night */
  if (rVictim >= 0 && ROLES[G.P[rVictim].role].side === 'rahal') G.rondaGuilt = true;

  const diedTonight = s => dHas(s);

  /* 6. LOOK — every result from the night as it truly happened */
  G.news = {};
  const addNews = (s, o) => { (G.news[s] || (G.news[s] = [])).push(o); };
  /* THE VISITS — one list, the 6c definition, used by 6c and 6d */
  const V = [];
  const vis = (f, t) => { if (f >= 0 && t >= 0) V.push({ f: f, t: t }); };
  if (drunk >= 0){ const b2 = seatOf(G, 'barman'); if (b2 >= 0 && G.P[b2].alive) vis(b2, drunk); }
  if (jailed >= 0) vis(sgSeat, jailed);
  for (const rl of ['tabib', 'nanna', 'pittur', 'sarima', 'talbieb', 'kappillan']){
    const s2 = seatOf(G, rl);
    if (s2 >= 0 && G.P[s2].alive && !blocked(s2) && A[s2] !== undefined && A[s2] >= 0)
      vis(s2, A[s2]);
  }
  if (bkill >= 0) vis(bSeat, bkill);
  if (rkill >= 0) vis(rSeat, rkill);
  if (vTgt >= 0) vis(vSeat, vTgt);
  for (const f of kFrom) vis(f, kkill);

  /* 6a. In-Nanna */
  const nSeat = seatOf(G, 'nanna');
  if (nSeat >= 0 && G.P[nSeat].alive && !blocked(nSeat) && !diedTonight(nSeat) &&
      A[nSeat] !== undefined && A[nSeat] >= 0){
    const t = G.P[A[nSeat]];
    addNews(nSeat, { kind:'nanna', night:G.night, seat:t.seat, name:t.name,
                     clean: !readsKlikka(t.seat) });
  }
  /* 6b. Il-Kappillan */
  const cSeat = seatOf(G, 'kappillan');
  if (cSeat >= 0 && G.P[cSeat].alive && !blocked(cSeat) && !diedTonight(cSeat) &&
      A[cSeat] !== undefined && A[cSeat] >= 0 && G.acts2[cSeat] >= 0){
    const a = G.P[A[cSeat]], b = G.P[G.acts2[cSeat]];
    addNews(cSeat, { kind:'kappillan', night:G.night,
                     seat:a.seat, name:a.name, seat2:b.seat, name2:b.name,
                     same: readsKlikka(a.seat) === readsKlikka(b.seat) });
  }
  /* 6c. L-Għassies — who visited his watch target */
  const wSeat = seatOf(G, 'ghassies');
  if (wSeat >= 0 && G.P[wSeat].alive && !blocked(wSeat) && !diedTonight(wSeat) &&
      A[wSeat] !== undefined && A[wSeat] >= 0){
    const watch = A[wSeat];
    const seen = V.filter(v2 => v2.t === watch && v2.f !== wSeat).map(v2 => v2.f)
                  .filter((v2, i, a2) => a2.indexOf(v2) === i).sort((a2, b2) => a2 - b2);
    addNews(wSeat, { kind:'ghassies', night:G.night, seat:watch, name:G.P[watch].name,
                     who: seen.map(s2 => ({ seat:s2, name:G.P[s2].name })) });
  }
  /* 6d. Ix-Xummiemu — where his target went */
  const xmSeat = seatOf(G, 'xummiemu');
  if (xmSeat >= 0 && G.P[xmSeat].alive && !blocked(xmSeat) && !diedTonight(xmSeat) &&
      A[xmSeat] !== undefined && A[xmSeat] >= 0){
    const trail = A[xmSeat];
    const went = V.filter(v2 => v2.f === trail).map(v2 => v2.t)
                  .filter((v2, i, a2) => a2.indexOf(v2) === i).sort((a2, b2) => a2 - b2);
    addNews(xmSeat, { kind:'xummiemu', night:G.night, seat:trail, name:G.P[trail].name,
                      who: went.map(s2 => ({ seat:s2, name:G.P[s2].name })) });
  }
  /* 6e. Il-Ħaffier — the corpse names its weapon */
  const hfSeat = seatOf(G, 'haffier');
  if (hfSeat >= 0 && G.P[hfSeat].alive && !blocked(hfSeat) && !diedTonight(hfSeat) &&
      A[hfSeat] !== undefined && A[hfSeat] >= 0){
    const c = G.P[A[hfSeat]];
    if (c && !c.alive)
      addNews(hfSeat, { kind:'haffier', night:G.night, seat:c.seat, name:c.name,
                        weapon: String(c.diedOn || '').split(' ')[0] });
  }
  /* the victim knows: the poison, the cure, the guilt */
  if (poisonedNow >= 0 && !diedTonight(poisonedNow))
    addNews(poisonedNow, { kind:'velenat', night:G.night });
  if (cured >= 0 && !diedTonight(cured))
    addNews(cured, { kind:'kurat', night:G.night });
  if (G.rondaGuilt && rSeat >= 0 && !diedTonight(rSeat))
    addNews(rSeat, { kind:'ronda', night:G.night });

  /* apply the deaths */
  deaths.sort((a, b) => a.s - b.s);
  for (const d of deaths) kill(G, d.s, d.w);
  if (!deaths.length){
    logAdd(G, savedSomeone
      ? 'Sebaħ. Xi ħadd kien attakkat il-lejla — u xi ħadd salvah. Ħadd ma miet.'
      : 'Sebaħ, u ħadd ma miet. Lejl kwiet.');
  } else {
    for (const d of deaths)
      logAdd(G, 'Sebaħ, u sabu lil ' + G.P[d.s].name + ' mejjet.' + reveal(G, d.s));
  }
  /* 4b lands: the gag survives the night only on a living mouth */
  G.muted = -1;
  if (muteT >= 0 && G.P[muteT].alive){
    G.muted = muteT;
    logAdd(G, G.P[muteT].name + ' qam bis-sarima marbuta ma’ ħalqu — illum ' +
              'jivvota BISS: la kliem u lanqas kitba fil-pjazza.');
  }

  /* 7. THE SHOT (a machine chair never fires — it could not choose) */
  for (const d of deaths)
    if (G.P[d.s].role === 'kaccatur' && !isBot(G, d.s)) G.shotQueue.push(d.s);

  /* 8. GRUDGE */
  for (const d of deaths) grudgeCheck(G, d.s, false);

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
  /* the quarter is counted over chairs that CAN vote: machine chairs
     never do, and a quorum that counts them is unreachable by
     construction in a bot-heavy room — the one way a table could
     genuinely never end */
  const canVote = liv.filter(a => !isBot(G, a.seat)).length;
  const need = Math.max(2, Math.ceil(canVote / 4));
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
  G.muted = -1;                       /* the gag lasts one day, no more */
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
  /* a table that can no longer end, ends itself: with fewer than two
     living HUMAN chairs no verdict quorum is ever reachable, and if
     no living human holds a kill, no night will ever close a life
     either (machine chairs never act). Only bot-heavy rooms can get
     here; the survivors' side takes it. Measured in the fuzz — the
     live build could spin such a room forever. */
  if (!win){
    const humans = liv.filter(p => !isBot(G, p.seat));
    const humanLethal = humans.some(p => ROLES[p.role].kills || p.role === 'biccier' ||
      p.role === 'velenu' || (p.role === 'tarronda' && (G.rondaShots | 0) > 0));
    if (humans.length < 2 && !humanLethal)
      win = kl ? 'klikka' : bi ? 'biccier' : 'rahal';
  }
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
    rondaShots: me.role === 'tarronda' ? (G.rondaShots | 0) : 0,
    rondaGuilt: me.role === 'tarronda' ? !!G.rondaGuilt : false,
    poisoned: !!(G.poison && G.poison.seat === seat && me.alive),
    muted: G.muted === seat,
    news: (me.alive && G.news[seat] && G.news[seat].length) ? G.news[seat] : null,
    /* the referee: may this human open their mouth in the room?
       The gagged man may not — except on the planka: an accused man
       always defends himself. */
    speak: me.alive && !G.over && (
      (G.phase === 'defence' && seat === G.accused) ||
      ((G.phase === 'day' || G.phase === 'verdict') && G.muted !== seat))
  };
  if (me.alive && G.phase === 'night' && R.night &&
      !(me.role === 'kuntrabandist' && G.hideLeft <= 0) &&
      !(me.role === 'tarronda' && ((G.rondaShots | 0) <= 0 || G.rondaGuilt)) &&
      !(me.role === 'haffier' && !G.P.some(q => !q.alive)) &&
      !(me.role === 'velenu' && G.poison)) o.canAct = true;
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
  const dayChatOn = G.opt ? G.opt.dayChat !== false : true;   /* host rule: day argued in-app vs out loud */
  out.push({
    id:'pjazza', name:'Il-Pjazza', cls:'day',
    read: true,
    /* the same rule as view().speak: the gagged write nothing by day, but the
       planka unties the sarima. When dayChat is OFF the whole day is spoken out
       loud, so the pjazza text chat is closed (read-only) for everyone. */
    write: dayChatOn && p.alive && !G.over &&
           ((G.phase === 'defence' && seat === G.accused) ||
            ((G.phase === 'day' || G.phase === 'verdict') && G.muted !== seat)),
    note: !dayChatOn
      ? 'Il-pjazza titkellem bil-fomm — bla chat.'
      : (G.phase === 'defence'
        ? (seat === G.accused ? 'Iddefendi ruħek.' : 'Il-planka għand l-akkużat.')
        : (G.muted === seat && !night ? 'Is-sarima f’ħalqek — illum tivvota biss.'
           : (night ? 'Bil-lejl il-pjazza magħluqa.' : '')))
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
  /* saves from before the new blood get the new fields' defaults */
  if (typeof G.lastJail !== 'number') G.lastJail = -1;
  if (typeof G.rondaShots !== 'number') G.rondaShots = 2;
  if (typeof G.rondaGuilt !== 'boolean') G.rondaGuilt = false;
  if (G.poison === undefined) G.poison = null;
  if (typeof G.muted !== 'number') G.muted = -1;
  if (!G.news || typeof G.news !== 'object') G.news = {};
  for (const k in G.news) if (!Array.isArray(G.news[k])) G.news[k] = [G.news[k]];
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

/* ═══════════════════════════════════════════════════════════════════
   HOW — the teaching text, in plain words, living HERE beside the
   rules it describes so the lobby's "what does what" panel can never
   drift from what the engine actually does. The role list itself is
   generated from ROLES; this is only the shape of an evening.
   ═══════════════════════════════════════════════════════════════════ */
const HOW = {
  basics: [
    'Bil-LEJL ħadd ma jitkellem b’leħnu — kollox bil-kitba, bil-moħbi. ' +
      'Binhar il-pjazza tiftaħ u kulħadd jargumenta.',
    'Il-MEJTIN ma jitkellmux qatt aktar — la b’leħinhom u lanqas ' +
      'fil-pjazza. Jiktbu biss lill-mejtin l-oħra.',
    'L-EWWEL LEJL ħadd ma jmut: araw, isimgħu, ibdew obsru.',
    'Ir-raħal jirbaħ meta l-qattiela jispiċċaw; il-klikka meta jibqgħu ' +
      'huma jgħoddu. Xi wħud jilagħbu għal rashom biss.'
  ],
  night: [
    { n:'Ix-xorb u ċ-ċella', t:'Tal-Bar isakkar lil xi ħadd bix-xorb u ' +
        's-Surġent jaqfel lil ieħor fl-għassa: it-tnejn ma jagħmlu XEJN ' +
        'dak il-lejl — imma min hu fiċ-ċella għall-inqas rieqed fis-sod.' },
    { n:'Il-moħbi u l-ħarsien', t:'Il-Kuntrabandist jistaħba, it-Tabib ' +
        'jagħżel lil min iħares, u Tal-Bieb joqgħod għassa ma’ bieb ' +
        'ħaddieħor — id-daqqa jeħodha hu.' },
    { n:'Il-pinzell u s-sarima', t:'Il-Pittur ipinġi lil xi ħadd ħati ' +
        'għal-lejla, u s-Sarima torbot ħalq għall-għada.' },
    { n:'Id-demm', t:'Il-qattiela kollha jaqtgħu FL-ISTESS ĦIN: il-klikka ' +
        'vittma waħda, il-Biċċier tiegħu, Tar-Ronda t-tir tiegħu, ' +
        'Tal-Velenu jqattar (il-vittma tmut il-lejl ta’ wara jekk it-Tabib ' +
        'ma jsibhiex). Min hu mħares jew moħbi jsalva — għalhekk it-Tabib ' +
        'kultant "isalva lil ħadd": salva bil-moħbi.' },
    { n:'L-għajnejn', t:'In-Nanna, il-Kappillan, l-Għassies, ix-Xummiemu ' +
        'u l-Ħaffier jaraw il-lejl KIF ĠARA tassew — imma biss jekk baqgħu ' +
        'ħajjin sa filgħodu u ħadd ma sakkarhom.' },
    { n:'Is-senter tal-mejjet', t:'Kaċċatur li jmut jispara l-aħħar tir ' +
        'tiegħu qabel titla’ x-xemx. Minn dak it-tir ħadd ma jsalva.' }
  ],
  day: [
    'Kulħadd jivvota AKKUŻA (tista’ tibdilha sakemm jagħlaq il-jum).',
    'L-aktar wieħed akkużat — jekk l-akkużi bis-serjetà — jitla’ fuq ' +
      'il-planka u jiddefendi ruħu. Anki bis-sarima: fuq il-planka ' +
      'titkellem dejjem.',
    'Imbagħad il-VERDETT: ħati jew le. Ħati bil-maġġoranza u l-persuna ' +
      'barra — u r-rwol tagħha jinkixef, jekk din ir-regola mixgħula.',
    'Sindku mikxuf jgħodd doppju. Min qam bis-sarima, illum jivvota biss.'
  ]
};

GLOB.SUSPETT = {
  ROLES, SETUPS, POOL_DEFAULT, POOL_ALL, MODES, MIN_TABLE, HOW, killerCount,
  rosterFromPool, validateRoster, rosterBalance,
  create, act, view, publicSeat,
  channels, chanReaders, chanWrite, snapshot, load,
  alive, actorsTonight, winCheck, mulberry32
};
})();
