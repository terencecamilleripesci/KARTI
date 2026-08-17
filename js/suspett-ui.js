/* ═══════════════════════════════════════════════════════════════════
   SUSPETT — the screen.  js/suspett.js is the engine; this file is
   everything a finger touches: the setup sheet with the host's role
   pool, the pass-the-phone curtain, the online table, the chat, the
   hidden role card, and the referee.

   ── WHAT IS SECRET FROM WHOM — the honest version ──────────────────
   IN THE ROOM (both modes): a role, and a night target, exist in the
   DOM only while their sheet is deliberately open. Closing the sheet
   WIPES the nodes — the text is not hidden with CSS, it is not in the
   document. The sheet also wipes itself when the app loses focus or
   is backgrounded, so a grabbed phone or a repaint shows nothing.

   ON THE WIRE (online): game MOVES ride the relay's normal broadcast
   — every phone receives every move and rebuilds the same state from
   the shared seed. That means role secrecy online is CLIENT-SIDE: a
   player who opens the developer console can read the whole village.
   Among friends at one table that is the accepted trade (it is the
   architecture every KARTI table game runs on), and nothing in this
   file claims otherwise. CHAT is different: it goes over a dedicated
   {t:'chat'} message that the relay forwards ONLY to the seats named
   in `to` — that list is built from the engine's chanReaders() and
   the filtering happens ON THE SERVER, so the klikka's night talk
   and the dead's room never reach the wrong phone at all. On a relay
   that has not learned {t:'chat'} yet (health JSON without chat:1),
   chat is switched off and the screen says so out loud rather than
   pretending.

   ── THE REFEREE ────────────────────────────────────────────────────
   The game is played in one physical room with the phones as the
   private channel, so the app cannot enforce silence — it can only
   make the rule impossible to miss. Hence the permanent SPEAK/SILENT
   bar: gold rounded pill + speech glyph + "TISTA' TITKELLEM" when
   you may talk out loud; dark hatched square + crossed glyph +
   "SKIET - IKTEB BISS" when you may not. Colour AND shape AND words,
   never colour alone, visible with the keyboard up. Dead players'
   bars never return to SPEAK, and death itself interrupts with a
   full-screen notice that must be acknowledged.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const K = window.KARTI || {};
const P = window.KARTI_PARTY;
const S = window.SUSPETT;
if (!P || !P.register || !S) return;

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
function sfx(id){ try { if (window.KARTI_SFX && KARTI_SFX.play) KARTI_SFX.play(id); } catch (e){} }
function toast(m){ try { if (K.toast) K.toast(m); } catch (e){} }

/* ═══════════════════════════════════════════════════════════════════
   ENGLISH — via js/lang.js (KARTI_LANG). Two rules hold everywhere:

   1. UI-authored text is written as a PAIR at its call site:
      T('English line', 'Il-linja bil-Malti'). The Maltese is the
      game's voice, not a translation of the English — both are
      originals. ROLE NAMES ARE NAMES (In-Nanna, Tar-Ronda, il-pjazza,
      il-planka): they stay Maltese in both languages, the way SKARTA
      and IL-KIRI keep theirs. We translate what a role DOES, never
      what it is called.

   2. ENGINE-authored text (js/suspett.js writes its log lines and
      refusals into game state at move time, and state is shared and
      audited — it cannot be language-switched at the source) is
      translated at DISPLAY time by gameText(): an exact-match /
      anchored-pattern table over the engine's finite set of
      templates. A line that matches nothing is shown as the engine
      wrote it — Maltese — which is an honest fallback, never a key.
   ═══════════════════════════════════════════════════════════════════ */
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
const isMT = () => !!(window.KARTI_LANG && KARTI_LANG.mt());

/* what each role DOES, in English — the names stay theirs.
   Keyed by role id; a role missing here shows its Maltese. */
const WHAT_EN = {
  rahli: 'Minds his own business. Your only weapon is your vote and your ' +
    'talk in the pjazza. Be careful who you believe.',
  nanna: 'From the gallarija she sees EVERYTHING. Each night pick a person ' +
    'and by morning you will know whether they are CLEAN or SUSPECT. ' +
    'Careful: Il-Kap reads clean to you, and Il-Pittur can paint somebody.',
  tabib: 'Each night pick a person and shield them from that night’s ' +
    'killing. You may protect yourself, but never the same person two ' +
    'nights running.',
  barman: 'Each night pick a person and pour them free drink until they ' +
    'fall over. That person does NOTHING that night — no killing, no ' +
    'protecting, no watching.',
  kaccatur: 'You sleep with the shotgun under the bed. If they get you — ' +
    'by night or by vote — you fire one last shot and take somebody with ' +
    'you. Nobody survives that shot.',
  talkarti: 'Everybody laughs at you, and everybody comes to you in ' +
    'secret. Each night you open the cards and talk to the dead in ' +
    'writing — they know you only as "Tal-Karti", never by name. What ' +
    'they tell you could save the village; if they work out who you are, ' +
    'you are finished.',
  ghassies: 'Your job is to prowl at night. Pick a person and by morning ' +
    'you will know WHO WENT to their house that night. Not why they ' +
    'went — but whoever visited tonight’s corpse has a lot to explain.',
  kappillan: 'Everybody confesses to you, and you hear plenty. Each night ' +
    'pick TWO, and by morning you will know whether they are on the same ' +
    'side or not. Not which side — but two who do not match are threads ' +
    'worth pulling.',
  sindku: 'Once per game, by day, you may reveal yourself in front of ' +
    'everyone: from then on your vote counts DOUBLE. But a revealed ' +
    'mayor is everybody’s target — pick your moment.',
  tarronda: 'The police are far away and you are done waiting. At night ' +
    'you walk the streets with a shotgun under your coat: TWO shots for ' +
    'the whole game. Mind who you spend them on — kill a villager and ' +
    'the guilt eats you, and you die the following night.',
  talbieb: 'Each night pick a person and stand guard at their door. If ' +
    'somebody comes to kill them — or poison them — the blow lands on ' +
    'YOU instead. Work of honour, and of blood.',
  surgent: 'Each night lock one person in the għassa cell: that person ' +
    'does NOTHING that night, but nobody can touch them either — in the ' +
    'cell they sleep safe. Not the same person two nights running.',
  xummiemu: 'Long nose, light feet. Each night follow a person and by ' +
    'morning you will know WHOSE HOUSE they went to that night. Where ' +
    'people go at night says a lot about them.',
  haffier: 'You dig the graves, and the corpses talk to you. Each night ' +
    'examine one dead body and by morning you will know WHAT WEAPON made ' +
    'it — a klikka blow, a knife, a shotgun, poison… How people die ' +
    'tells you who killed them.',
  xewka: 'You do nothing at night — but whoever lays a hand on you ' +
    'regrets it. If somebody comes for you in the night, one of them is ' +
    'pricked by the thorn and dies too. You can still die — just never ' +
    'alone.',
  kap: 'The brains of the other każin’s klikka. Each night the klikka ' +
    'agrees on one victim. In-Nanna and Il-Kappillan read you as CLEAN — ' +
    'your face stays respectable to the end.',
  klikka: 'A member of the other każin’s klikka. You know who your ' +
    'people are; each night you agree on one victim in the klikka chat. ' +
    'By day act like a decent man — and vote against somebody else.',
  pittur: 'With the klikka, but your craft is not blood: each night you ' +
    '"paint" a person, and that night In-Nanna and Il-Kappillan read ' +
    'them as SUSPECT. Let the village hang somebody who did not deserve it.',
  velenu: 'With the klikka, but your craft works slowly: each night you ' +
    'drip the poison into somebody’s glass. They do not die there and ' +
    'then — they die the FOLLOWING night, unless It-Tabib finds them in ' +
    'time. The victim knows… and starts begging in front of everyone.',
  sarima: 'With the klikka. Each night pick a person and tie the gag ' +
    'over their mouth: tomorrow in the pjazza that person does NOT speak ' +
    'and does not write — votes only. Silence whoever knows too much.',
  mignun: 'You WANT them to put you on the planka. If the pjazza votes ' +
    'you out, YOU ALONE win, right there. Make yourself suspicious — ' +
    'but not too suspicious.',
  kuntrabandist: 'You are with nobody — you are with the money. You win ' +
    'with whoever wins, as long as you are still breathing. Twice a game ' +
    'you can hide all night where nobody can touch you.',
  biccier: 'You have the knife and you have the plan: an empty village. ' +
    'Each night you kill too — alone, against everyone, until nobody is ' +
    'left to vote you out.',
  vendetta: 'One person in this village cast you a long shadow — your ' +
    'MIRA, and you know who. You win if the pjazza votes them out, ' +
    'whatever the ending. If they die in the night first, you are left ' +
    'with nothing — and you become Il-Miġnun, because all you have left ' +
    'is the joke.'
};
function roleWhat(id, mtWhat){
  return (!isMT() && WHAT_EN[id]) ? WHAT_EN[id] : mtWhat;
}

/* the two host modes — names are descriptions here, so they translate */
const MODE_EN = {
  bilanc: { name: 'Balanced',
    note: 'The pot proved by simulation — tap it and play.' },
  borma: { name: 'The Big Pot',
    note: 'The whole catalogue in the pot: poison, gag, thorn, jail ' +
      'cell… Anything can turn up. A different kind of evening.' }
};
const modeName = m => (!isMT() && MODE_EN[m.id]) ? MODE_EN[m.id].name : m.name;
const modeNote = m => (!isMT() && MODE_EN[m.id]) ? MODE_EN[m.id].note : m.note;

/* the engine's HOW panel, matched entry for entry (index-keyed; an
   engine entry with no English shows its Maltese) */
const HOW_EN = {
  basics: [
    'At NIGHT nobody speaks out loud — everything in writing, in ' +
      'secret. By day the pjazza opens and everybody argues.',
    'The DEAD never speak again — not out loud and not in the pjazza. ' +
      'They write only to the other dead.',
    'On the FIRST NIGHT nobody dies: watch, listen, start guessing.',
    'The village wins when the killers are gone; the klikka wins when ' +
      'they are the majority. Some play for nobody but themselves.'
  ],
  night: [
    { n: 'The drink and the cell', t: 'Tal-Bar gets somebody blind drunk ' +
      'and Is-Surġent locks another in the għassa: neither does ANYTHING ' +
      'that night — though the one in the cell at least sleeps safe.' },
    { n: 'Hiding and guarding', t: 'Il-Kuntrabandist hides, It-Tabib ' +
      'picks somebody to protect, and Tal-Bieb stands guard at another ' +
      'man’s door — and takes the blow himself.' },
    { n: 'The brush and the gag', t: 'Il-Pittur paints somebody guilty ' +
      'for the night, and Is-Sarima ties a mouth shut for tomorrow.' },
    { n: 'The blood', t: 'All the killers strike AT THE SAME TIME: the ' +
      'klikka one victim, Il-Biċċier his own, Tar-Ronda his shot, ' +
      'Tal-Velenu pours (the victim dies the following night unless ' +
      'It-Tabib finds them). Whoever is protected or hidden survives — ' +
      'which is why It-Tabib sometimes "saves nobody": he saved them ' +
      'in secret.' },
    { n: 'The eyes', t: 'In-Nanna, il-Kappillan, l-Għassies, ' +
      'ix-Xummiemu and il-Ħaffier see the night AS IT TRULY HAPPENED — ' +
      'but only if they lived to the morning and nobody locked them up.' },
    { n: 'The dead man’s shotgun', t: 'A Kaċċatur who dies fires his ' +
      'last shot before the sun comes up. Nobody survives that shot.' }
  ],
  day: [
    'Everybody votes an ACCUSATION (changeable until the day closes).',
    'The most accused — if the accusations carry real weight — climbs ' +
      'the planka and defends himself. Even gagged: on the planka you ' +
      'always speak.',
    'Then the VERDICT: guilty or not. Guilty by majority and the person ' +
      'is out — and their role is revealed, if that rule is on.',
    'A revealed Sindku counts double. Whoever woke up gagged votes ' +
      'only, today.'
  ]
};

/* ── gameText(): engine-authored Maltese, translated at DISPLAY time.
   Exact strings first, then anchored patterns; recursion handles the
   " Kien X." reveal suffix. NEVER fed back into the engine. ── */
const GT_EXACT = {
  /* dawns and days */
  'Sebaħ. Xi ħadd kien attakkat il-lejla — u xi ħadd salvah. Ħadd ma miet.':
    'Dawn came. Somebody was attacked in the night — and somebody saved them. Nobody died.',
  'Sebaħ, u ħadd ma miet. Lejl kwiet.': 'Dawn came, and nobody died. A quiet night.',
  'Il-pjazza miftuħa. Min hu s-suspettuż?': 'The pjazza is open. Who looks guilty?',
  'Ħadd ma ġie akkużat bis-serjetà. Ir-raħal jorqod.':
    'Nobody was seriously accused. The village goes to sleep.',
  'Il-pjazza ma qablitx — ħadd fuq il-planka. Ir-raħal jorqod.':
    'The pjazza could not agree — nobody on the planka. The village goes to sleep.',
  'Il-pjazza tiddeċiedi: ħati jew le?': 'The pjazza decides: guilty or not?',
  'Il-Miġnun DAK LI RIED — dik ir-rebħa tiegħu, u intom ilkoll għamiltuha bl-idejn. Il-lejla ħadd mhu se joqtol — ir-raħal baqa’ skantat. Il-logħba tkompli mingħajru.':
    'Il-Miġnun got EXACTLY what he wanted — that is his win, and you all handed it to him. Nobody will kill tonight — the village is too stunned. The game goes on without him.',
  /* endings */
  'Ir-raħal meħlus. Il-klikka spiċċat, u l-festa ssir xorta.':
    'The village is free. The klikka is finished, and the festa happens anyway.',
  'Il-klikka ħadet ir-raħal f’idejha. Il-każin l-ieħor rebaħ kollox.':
    'The klikka took the village. The other każin won the lot.',
  'Baqa’ biss il-Biċċier u s-skiet. Rebaħ hu.':
    'Only Il-Biċċier and the silence are left. He won.',
  'Ir-raħal battal. Ħadd ma rebaħ xejn.': 'The village is empty. Nobody won anything.',
  /* the engine's refusals (act) */
  'Il-logħba spiċċat.': 'The game is over.',
  'Mhux il-lejl.': 'It is not night.',
  'Il-mejtin ma jagħmlu xejn.': 'The dead do nothing.',
  'Dan ir-rwol jorqod bil-lejl.': 'This role sleeps at night.',
  'M’għandekx aktar moħbi.': 'You have no hides left.',
  'Il-kuxjenza ma tħallikx toħroġ illejla.': 'The guilt will not let you out tonight.',
  'M’għandekx aktar tiri.': 'You have no cartridges left.',
  'Dik il-persuna mhix fil-logħba.': 'That person is not in the game.',
  'Il-Ħaffier jeżamina l-MEJTIN biss.': 'Il-Ħaffier examines the DEAD only.',
  'Mhux l-istess persuna żewġt iljieli.': 'Not the same person two nights running.',
  'Mhux l-istess ċella żewġt iljieli.': 'Not the same cell guest two nights running.',
  'Il-Kuntrabandist jistaħba hu biss.': 'Il-Kuntrabandist hides only himself.',
  'Il-velenu l-ieħor għadu jaħdem — stenna.': 'The last vial is still working — wait.',
  'Mhux lil sħabek stess.': 'Not your own people.',
  'Le, mhux lilek innifsek.': 'No — not yourself.',
  'Il-Kappillan iqabbel TNEJN.': 'Il-Kappillan compares TWO.',
  'It-tieni persuna mhix fil-logħba.': 'The second person is not in the game.',
  'Tnejn differenti.': 'Two different people.',
  'Int taf min int.': 'You already know who you are.',
  'Ħadd ma jispara issa.': 'Nobody fires now.',
  'Mhux is-senter tiegħek.': 'Not your shotgun.',
  'Is-Sindku jikxef ruħu binhar biss.': 'Is-Sindku reveals himself by day only.',
  'Il-mejtin ma jixxejrux.': 'The dead do not wave.',
  'Int m’intix is-Sindku.': 'You are not Is-Sindku.',
  'Diġà kxift ruħek.': 'You already revealed yourself.',
  'Mhux ħin il-vot.': 'It is not voting time.',
  'Il-mejtin ma jivvutawx.': 'The dead do not vote.',
  'Dik il-persuna mhix hemm.': 'That person is not there.',
  'Kontra tiegħek innifsek le.': 'Not against yourself.',
  'Mhux binhar.': 'It is not daytime.',
  'Ħadd mhu jiddefendi ruħu.': 'Nobody is defending themselves.',
  'Mhux ħin il-verdett.': 'It is not verdict time.',
  'L-akkużat ma jivvutax fuqu nnifsu.': 'The accused does not vote on himself.',
  'Mossa mhux magħrufa.': 'Unknown move.',
  /* validateRoster, the fixed ones */
  'M’hemm ħadd li joqtol — logħba bla lejl mhix logħba.':
    'Nobody in this pot kills — a game with no night is no game.',
  'Wisq qattiela: iridu jkunu inqas minn nofs ir-raħal.':
    'Too many killers: they must be fewer than half the village.',
  /* channel notes (engine channels()) */
  'Iddefendi ruħek.': 'Defend yourself.',
  'Il-planka għand l-akkużat.': 'The planka belongs to the accused.',
  'Is-sarima f’ħalqek — illum tivvota biss.': 'The gag is on you — today you vote only.',
  'Bil-lejl il-pjazza magħluqa.': 'The pjazza is closed at night.',
  'Sħabek biss jaqraw dan.': 'Only your people read this.',
  'Il-klikka titkellem bil-lejl.': 'The klikka talks at night.',
  'Il-ħajjin ma jaraw XEJN minn hawn.': 'The living see NOTHING from here.'
};
const GT_RX = [
  [/^Lejl (\d+)\. Ir-raħal jorqod…$/, m => 'Night ' + m[1] + '. The village sleeps…'],
  [/^(.+\.) Kien (.+)\.$/, (m, g) => { const b = g(m[1]); return b === m[1] ? null : b + ' They were ' + m[2] + '.'; }],
  [/^(.+) spara l-aħħar tir tiegħu u ħa lil (.+) miegħu\.$/,
    m => m[1] + ' fired his last shot and took ' + m[2] + ' with him.'],
  [/^(.+) spara fl-ajru\.$/, m => m[1] + ' fired into the air.'],
  [/^(.+) dam wisq — it-tir mar fl-ajru\.$/, m => m[1] + ' took too long — the shot went into the air.'],
  [/^(.+) kixef ruħu: HUWA S-SINDKU\. Il-vot tiegħu jgħodd doppju minn issa\.$/,
    m => m[1] + ' revealed himself: HE IS IS-SINDKU. His vote counts double from now on.'],
  [/^Sebaħ, u sabu lil (.+) mejjet\.$/, m => 'Dawn came, and they found ' + m[1] + ' dead.'],
  [/^(.+) qam bis-sarima marbuta ma’ ħalqu — illum jivvota BISS: la kliem u lanqas kitba fil-pjazza\.$/,
    m => m[1] + ' woke with the gag tied over his mouth — today he votes ONLY: no talking and no writing in the pjazza.'],
  [/^(.+) fuq il-planka\. Ħa jiddefendi ruħu\.$/, m => m[1] + ' is on the planka. Let him defend himself.'],
  [/^Ħati \((\d+)-(\d+)\)\. (.+) barra mir-raħal\.$/,
    m => 'Guilty (' + m[1] + '-' + m[2] + '). ' + m[3] + ' is out of the village.'],
  [/^Mhux ħati \((\d+)-(\d+)\)\. (.+) jinżel mill-planka\.$/,
    m => 'Not guilty (' + m[1] + '-' + m[2] + '). ' + m[3] + ' steps down from the planka.'],
  [/^Il-mejtin jarawk bħala "(.+)", qatt b’ismek\.$/,
    m => 'The dead see you as "' + m[1] + '", never by name.'],
  [/^Ir-roster irid ikun eżatt daqs il-plejers \((\d+)\)\.$/,
    m => 'The roster must be exactly the size of the table (' + m[1] + ').'],
  [/^Rwol mhux magħruf: (.+)$/, m => 'Unknown role: ' + m[1]],
  [/^Wieħed biss jista’ jkun (.+)\.$/, m => 'Only one can be ' + m[1] + '.']
];
function gameText(txt){
  if (isMT() || txt == null) return txt;
  const s = String(txt);
  if (GT_EXACT[s]) return GT_EXACT[s];
  for (const [rx, fn] of GT_RX){
    const m = s.match(rx);
    if (m){ const r = fn(m, gameText); if (r != null) return r; }
  }
  return s;   /* unknown line: the engine's Maltese, honestly */
}
/* chat tab names come off the engine by id — a place is still a place,
   but "the dead" must be readable */
const CHAN_EN = { 'Il-Pjazza': 'The Pjazza', 'Il-Klikka': 'The Klikka',
                  'Il-Mejtin': 'The Dead', 'Is-Seduta': 'The Séance' };
const chanName = c => (!isMT() && CHAN_EN[c.name]) ? CHAN_EN[c.name] : c.name;

/* language flipped: repaint whatever of ours is up — the menu redraws
   whole, a live table re-renders. Concealed sheets and the curtain are
   left alone (they are transient and wipe themselves anyway). */
if (window.KARTI_LANG && KARTI_LANG.onChange){
  KARTI_LANG.onChange(() => {
    try {
      if (U && U.ctx){
        if (!secretOpen && !U.ctx.rootEl.querySelector('.su-curtain')) render();
      } else {
        const el = screenRoot();
        if (el && el.querySelector('.su-menu')) menu();
      }
    } catch (e){}
  });
}

/* ── the tile's mark: an eye over a card, ours ────────────────────── */
function injectSprite(){
  if (document.getElementById('su-sprite')) return;
  const d = document.createElement('div');
  d.id = 'su-sprite';
  d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  d.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<symbol id="su-mark" viewBox="0 0 24 24">' +
    '<path fill="currentColor" d="M12 5C7 5 3.2 8.1 1.5 12 3.2 15.9 7 19 12 19s8.8-3.1 ' +
    '10.5-7C20.8 8.1 17 5 12 5zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9z"/>' +
    '<circle fill="currentColor" cx="12" cy="12" r="2.2"/>' +
    '</symbol>' +
    /* ── THE IDENTITY PIECE ──────────────────────────────────────────
       Il-każin at night. Shuttered windows dark, festa lights off-duty
       along the parapet, and ONE window lit — the closed timber
       gallarija, oxblood red like every village has — with somebody
       standing in the light. Below in the street, somebody else is
       watching them. Filled silhouettes, warm ink outline
       (paint-order via .su-heroart), two shadow tones. */
    '<symbol id="su-hero" viewBox="0 0 240 110">' +
      /* sky: moon and a few stars over the pjazza */
      '<path d="M212 8a14.5 14.5 0 1 0 9.5 25.5A11.6 11.6 0 0 1 212 8z" ' +
        'fill="#E7DCBA" opacity=".95"/>' +
      '<circle cx="30" cy="14" r="1.3" fill="#CBBFA0" opacity=".8"/>' +
      '<circle cx="58" cy="24" r="1.1" fill="#CBBFA0" opacity=".65"/>' +
      '<circle cx="184" cy="12" r="1.2" fill="#CBBFA0" opacity=".75"/>' +
      '<path d="M96 10l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" ' +
        'fill="#CBBFA0" opacity=".7"/>' +
      /* the street shadows: the building throws the soft one, the door
         and the watcher stand in the deep one */
      '<rect x="20" y="96" width="140" height="4.5" fill="#0A0714" opacity=".3"/>' +
      '<ellipse cx="49" cy="97.5" rx="18" ry="3.2" fill="#0A0714" opacity=".48"/>' +
      '<ellipse cx="196" cy="97.5" rx="14.5" ry="3.2" fill="#0A0714" opacity=".48"/>' +
      /* il-każin */
      '<g stroke="#120C1E" stroke-width="2.4">' +
        '<rect x="20" y="30" width="140" height="66" fill="#2A2142"/>' +
        '<rect x="15" y="24" width="150" height="8" rx="2" fill="#362B55"/>' +
      '</g>' +
      /* festa lights along the parapet, unlit but for two */
      '<circle cx="40" cy="36.5" r="1.6" fill="#4A3C6E"/>' +
      '<circle cx="60" cy="38" r="1.6" fill="#FFB05C" opacity=".9"/>' +
      '<circle cx="80" cy="36.5" r="1.6" fill="#4A3C6E"/>' +
      '<circle cx="100" cy="38" r="1.6" fill="#4A3C6E"/>' +
      '<circle cx="120" cy="36.5" r="1.6" fill="#FFB05C" opacity=".55"/>' +
      /* two shuttered windows, dark, slats drawn shut */
      '<g stroke="#0D0918" stroke-width="1.6">' +
        '<rect x="32" y="44" width="20" height="24" fill="#171128"/>' +
        '<path d="M33 50h18M33 56h18M33 62h18"/>' +
        '<rect x="64" y="44" width="20" height="24" fill="#171128"/>' +
        '<path d="M65 50h18M65 56h18M65 62h18"/>' +
      '</g>' +
      /* the door, shut, and the nameless sign over it */
      '<rect x="34" y="72" width="30" height="7" rx="1.5" fill="#3A2E5C" ' +
        'stroke="#120C1E" stroke-width="1.6"/>' +
      '<path d="M38 96v-9a11 11 0 0 1 22 0v9z" fill="#171128" ' +
        'stroke="#0D0918" stroke-width="2"/>' +
      /* the lit gallarija: glow first, then the timber box */
      '<circle cx="128" cy="58" r="27" fill="#FFB05C" opacity=".13"/>' +
      '<g stroke="#120C1E" stroke-width="2.4">' +
        '<rect x="106" y="44" width="48" height="34" rx="3" fill="#8E3B2E"/>' +
        '<rect x="102" y="39" width="56" height="7" rx="2" fill="#5E241C"/>' +
      '</g>' +
      '<rect x="113" y="82" width="6" height="6" fill="#5E241C"/>' +
      '<rect x="141" y="82" width="6" height="6" fill="#5E241C"/>' +
      '<rect x="112" y="50" width="22" height="24" rx="2" fill="#FFB05C"/>' +
      '<path d="M141 50v24M146 50v24" stroke="#5E241C" stroke-width="1.8"/>' +
      /* in the window: somebody who thinks nobody is looking */
      '<circle cx="123" cy="59" r="4.6" fill="#2A1220"/>' +
      '<path d="M116 74v-5q0-5.5 7-5.5q7 0 7 5.5v5z" fill="#2A1220"/>' +
      /* in the street: somebody looking */
      '<circle cx="196" cy="73" r="7" fill="#120C1E" ' +
        'stroke="rgba(231,220,186,.3)" stroke-width="1.6"/>' +
      '<path d="M187 96v-11q0-8.5 9-8.5q9 0 9 8.5v11z" fill="#120C1E" ' +
        'stroke="rgba(231,220,186,.3)" stroke-width="1.6"/>' +
      /* the street itself */
      '<path d="M8 96.5h224" stroke="#0D0918" stroke-width="2.4"/>' +
    '</symbol></svg>';
  document.body.appendChild(d);
}

/* ═══════════════ persistence ═══════════════ */
const STORE = 'karti_suspett_v1';
let ST = { rec:{ w:0, l:0 }, pref:{}, save:null };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    if (j.rec && typeof j.rec === 'object') ST.rec = j.rec;
    if (j.pref && typeof j.pref === 'object') ST.pref = j.pref;
    if (j.save && typeof j.save === 'object') ST.save = j.save;
  }
} catch (e){}
function persist(){ try { localStorage.setItem(STORE, JSON.stringify(ST)); return true; } catch (e){ return false; } }

/* UI-only state (never game state): is the rules fold open on the menu */
const UI_KEY = 'karti_suspett_ui_v1';
function uiPref(){
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch (e){ return {}; }
}
function uiSet(k, v){
  try { const j = uiPref(); j[k] = v; localStorage.setItem(UI_KEY, JSON.stringify(j)); } catch (e){}
}
/* the same two reduced-motion doors cardview.js honours */
function reducedMo(){
  try {
    if (document.body && document.body.classList.contains('reduced')) return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e){ return false; }
}

/* ═══════════════ runtime ═══════════════ */
let U = null;      /* the open game: see openPNP / onlineStart */
let secretOpen = null;   /* the one concealment overlay, if open */

function stash(){
  if (!U || U.mode !== 'pnp' || !U.G || U.G.over){ if (U && U.G && U.G.over) clearSlot(); return; }
  ST.save = { v:1, at: Date.now(), snap: S.snapshot(U.G), names: U.names };
  persist();
}
function clearSlot(){ if (ST.save){ ST.save = null; persist(); } }
document.addEventListener('visibilitychange', () => { if (document.hidden){ stash(); hideSecret(); } });
window.addEventListener('pagehide', () => stash());
window.addEventListener('blur', () => hideSecret());

/* ═══════════════ css ═══════════════ */
function injectCSS(){
  try { P.ui.css(); } catch (e){}
  if (document.getElementById('su-css')) return;
  const st = document.createElement('style');
  st.id = 'su-css';
  st.textContent =
  '#scr-party .su-wrap{display:flex;flex-direction:column;height:100%;min-height:0;gap:8px;' +
    'font-family:var(--disp,system-ui);}' +
  /* ── the referee: SPEAK / SILENT. Colour AND shape AND words. ── */
  '#scr-party .su-ref{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:9px 13px;' +
    'font-weight:900;font-size:14px;letter-spacing:.4px;user-select:none}' +
  '#scr-party .su-ref .g{width:20px;height:20px;flex:0 0 auto}' +
  '#scr-party .su-ref.speak{background:rgba(255,197,66,.16);border:2px solid var(--gold,#FFC542);' +
    'border-radius:999px;color:var(--gold,#FFC542)}' +
  '#scr-party .su-ref.silent{background:rgba(232,69,44,.14);border:2px dashed #FF7A6B;' +
    'border-radius:4px;color:#FF9C90}' +
  '#scr-party .su-ref i{font-style:normal;font-weight:600;font-size:11px;opacity:.85;margin-left:auto;text-align:right}' +
  /* phase bar */
  '#scr-party .su-phase{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 12px;' +
    'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;' +
    'font-size:13px;font-weight:800}' +
  '#scr-party .su-phase .clk{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:900;' +
    'color:var(--gold,#FFC542)}' +
  '#scr-party .su-phase.night{background:rgba(138,92,255,.14)}' +
  /* roster */
  '#scr-party .su-seats{flex:0 0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:5px}' +
  '#scr-party .su-seat{padding:6px 8px;border-radius:10px;background:rgba(255,255,255,.05);' +
    'border:1px solid rgba(255,255,255,.1);font-size:11.5px;font-weight:700;display:flex;gap:6px;' +
    'align-items:center;min-width:0}' +
  '#scr-party .su-seat b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}' +
  '#scr-party .su-seat.dead{opacity:.45;text-decoration:line-through}' +
  '#scr-party .su-seat.me{border-color:var(--gold,#FFC542)}' +
  '#scr-party .su-seat.acc{border-color:#FF5468;background:rgba(255,84,104,.14)}' +
  '#scr-party .su-seat i{font-style:normal;font-size:9.5px;opacity:.8;margin-left:auto;flex:0 0 auto}' +
  '#scr-party .su-seat .vt{background:rgba(255,197,66,.25);border-radius:8px;padding:0 5px;' +
    'font-size:10px;font-weight:900;flex:0 0 auto}' +
  /* log + chat column */
  '#scr-party .su-mid{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:6px}' +
  '#scr-party .su-log{flex:0 0 auto;max-height:22%;overflow-y:auto;padding:7px 10px;' +
    'background:rgba(0,0,0,.25);border-radius:10px;font-size:12px;line-height:1.45}' +
  '#scr-party .su-log p{margin:2px 0;color:var(--dim,#A093C4)}' +
  '#scr-party .su-log p.hot{color:#FF9C90;font-weight:700}' +
  '#scr-party .su-log p:last-child{color:var(--txt,#F4EFFF)}' +
  /* chat */
  '#scr-party .su-tabs{flex:0 0 auto;display:flex;gap:6px}' +
  '#scr-party .su-tab{flex:1;padding:7px 4px;border-radius:10px 10px 0 0;border:1px solid rgba(255,255,255,.14);' +
    'border-bottom:none;background:rgba(255,255,255,.04);color:var(--dim,#A093C4);font-weight:800;' +
    'font-size:12px;text-align:center}' +
  '#scr-party .su-tab.on.day{background:rgba(255,197,66,.2);color:var(--gold,#FFC542);border-color:var(--gold,#FFC542)}' +
  '#scr-party .su-tab.on.kill{background:rgba(232,69,44,.22);color:#FF9C90;border-color:#FF7A6B}' +
  '#scr-party .su-tab.on.dead{background:rgba(138,92,255,.22);color:#C9B4FF;border-color:#8A5CFF}' +
  '#scr-party .su-tab .n{display:inline-block;min-width:15px;background:#FF5468;color:#fff;' +
    'border-radius:8px;font-size:9px;padding:0 3px;margin-left:4px}' +
  '#scr-party .su-chat{flex:1 1 auto;min-height:60px;overflow-y:auto;padding:8px 10px;border-radius:0 0 10px 10px;' +
    'border:1px solid rgba(255,255,255,.14);border-top:none;background:rgba(0,0,0,.3);' +
    'font-size:13px;line-height:1.4;overflow-wrap:anywhere;word-break:break-word}' +
  '#scr-party .su-chat.day{border-color:var(--gold,#FFC542)}' +
  '#scr-party .su-chat.kill{border-color:#FF7A6B;background:rgba(40,8,8,.5)}' +
  '#scr-party .su-chat.dead{border-color:#8A5CFF;background:rgba(20,10,45,.55)}' +
  '#scr-party .su-msg{margin:3px 0}' +
  '#scr-party .su-msg b{color:var(--gold,#FFC542);font-size:11.5px}' +
  '#scr-party .su-msg.kill b{color:#FF9C90}' +
  '#scr-party .su-msg.dead b{color:#C9B4FF}' +
  '#scr-party .su-msg.sys{color:var(--dim,#A093C4);font-style:italic;font-size:11.5px}' +
  /* the input row says WHERE the words go */
  '#scr-party .su-inrow{flex:0 0 auto;display:flex;gap:6px;align-items:stretch}' +
  '#scr-party .su-in{flex:1;min-width:0;padding:10px 12px;border-radius:12px;font-size:16px;' +
    'border:2px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:var(--txt,#F4EFFF)}' +
  '#scr-party .su-in.day{border-color:var(--gold,#FFC542)}' +
  '#scr-party .su-in.kill{border-color:#FF7A6B}' +
  '#scr-party .su-in.dead{border-color:#8A5CFF}' +
  '#scr-party .su-send{flex:0 0 auto;padding:0 16px;border-radius:12px;border:none;font-weight:900;' +
    'background:var(--gold,#FFC542);color:#221;font-size:13px}' +
  '#scr-party .su-send:disabled{opacity:.35}' +
  '#scr-party .su-canned{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}' +
  '#scr-party .su-can{flex:0 0 auto;padding:6px 10px;border-radius:999px;font-size:11.5px;font-weight:700;' +
    'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:var(--txt,#F4EFFF)}' +
  /* action bar */
  '#scr-party .su-bar{flex:0 0 auto;display:flex;gap:8px}' +
  '#scr-party .su-btn{flex:1;padding:12px 8px;border-radius:12px;border:none;font-weight:900;font-size:13.5px;' +
    'background:rgba(255,255,255,.1);color:var(--txt,#F4EFFF)}' +
  '#scr-party .su-btn.gold{background:var(--gold,#FFC542);color:#221}' +
  '#scr-party .su-btn.red{background:#B3362B;color:#fff}' +
  '#scr-party .su-btn:disabled{opacity:.4}' +
  /* ── concealment: the secret sheet ── */
  '#scr-party .su-veil{position:absolute;inset:0;z-index:60;background:rgba(10,7,18,.97);display:flex;' +
    'flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:22px;text-align:center}' +
  '#scr-party .su-card{width:min(330px,88%);border-radius:16px;padding:18px 16px;' +
    'background:linear-gradient(160deg,#241A3E,#141020);border:2px solid var(--gold,#FFC542)}' +
  '#scr-party .su-card h3{margin:0 0 4px;font-size:22px;color:var(--gold,#FFC542)}' +
  '#scr-party .su-card .side{font-size:11px;font-weight:900;letter-spacing:1px;margin-bottom:8px}' +
  '#scr-party .su-card .side.rahal{color:#3DDC84}' +
  '#scr-party .su-card .side.klikka{color:#FF7A6B}' +
  '#scr-party .su-card .side.newtral{color:#C9B4FF}' +
  '#scr-party .su-card p{margin:0;font-size:13px;line-height:1.5;text-align:left}' +
  '#scr-party .su-card .mate{margin-top:8px;font-size:12px;color:#FF9C90;text-align:left}' +
  '#scr-party .su-card .news{margin-top:8px;font-size:12.5px;color:var(--gold,#FFC542);text-align:left;font-weight:700}' +
  '#scr-party .su-tgts{width:min(360px,94%);display:grid;grid-template-columns:repeat(2,1fr);gap:7px;' +
    'max-height:44vh;overflow-y:auto}' +
  '#scr-party .su-tgt{padding:11px 8px;border-radius:11px;border:1px solid rgba(255,255,255,.2);' +
    'background:rgba(255,255,255,.07);color:var(--txt,#F4EFFF);font-weight:800;font-size:13px}' +
  '#scr-party .su-tgt.on{background:rgba(255,197,66,.25);border-color:var(--gold,#FFC542)}' +
  '#scr-party .su-veil .hint{font-size:11px;color:var(--dim,#A093C4);max-width:300px}' +
  /* the curtain (pass-the-phone) */
  '#scr-party .su-curtain{position:absolute;inset:0;z-index:70;background:#0C0913;display:flex;' +
    'flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:26px;text-align:center}' +
  '#scr-party .su-curtain h2{margin:0;font-size:16px;letter-spacing:2px;color:var(--dim,#A093C4)}' +
  '#scr-party .su-curtain .who{font-size:30px;font-weight:900;color:var(--gold,#FFC542)}' +
  /* death notice */
  '#scr-party .su-death{position:absolute;inset:0;z-index:80;background:rgba(12,6,10,.985);display:flex;' +
    'flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:26px;text-align:center}' +
  /* buttons grow to fill a row (.su-bar) but must NOT grow inside the
     column-flex overlays — without this the FHIMT button eats the screen */
  '#scr-party .su-death .su-btn,#scr-party .su-veil .su-btn,#scr-party .su-curtain .su-btn{flex:0 0 auto}' +
  '#scr-party .su-death h2{margin:0;font-size:30px;color:#FF5468;letter-spacing:2px}' +
  '#scr-party .su-death p{margin:0;font-size:14.5px;line-height:1.6;max-width:330px}' +
  '#scr-party .su-death .may{color:#C9B4FF;font-size:13px}' +
  /* setup sheet */
  '#scr-party .su-set{display:flex;flex-direction:column;gap:12px;padding:4px 2px 20px;overflow-y:auto}' +
  '#scr-party .su-set h4{margin:8px 0 0;font-size:13px;letter-spacing:1px;color:var(--dim,#A093C4)}' +
  '#scr-party .su-opts{display:flex;flex-direction:column;gap:8px}' +
  '#scr-party .su-opt{display:flex;gap:10px;align-items:center;text-align:left;padding:11px 12px;' +
    'border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);' +
    'color:var(--txt,#F4EFFF)}' +
  '#scr-party .su-opt.on{border-color:var(--gold,#FFC542);background:rgba(255,197,66,.12)}' +
  '#scr-party .su-opt b{font-size:14px}#scr-party .su-opt i{display:block;font-style:normal;' +
    'font-size:11px;color:var(--dim,#A093C4);margin-top:2px}' +
  '#scr-party .su-step{display:flex;align-items:center;gap:14px;justify-content:center}' +
  '#scr-party .su-stepb{width:46px;height:46px;border-radius:50%;border:none;font-size:22px;font-weight:900;' +
    'background:rgba(255,255,255,.1);color:var(--txt,#F4EFFF)}' +
  '#scr-party .su-stepn{font-size:26px;font-weight:900;min-width:56px;text-align:center;color:var(--gold,#FFC542)}' +
  '#scr-party .su-names{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}' +
  '#scr-party .su-name{padding:9px 10px;border-radius:10px;font-size:14px;border:1px solid rgba(255,255,255,.18);' +
    'background:rgba(0,0,0,.3);color:var(--txt,#F4EFFF);min-width:0}' +
  '#scr-party .su-pool{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}' +
  '#scr-party .su-role{display:flex;gap:8px;align-items:center;text-align:left;padding:8px 9px;border-radius:10px;' +
    'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:var(--txt,#F4EFFF)}' +
  '#scr-party .su-role.off{opacity:.4}' +
  '#scr-party .su-role.far{border-style:dashed}' +
  '#scr-party .su-role b{font-size:12.5px}' +
  '#scr-party .su-role i{display:block;font-style:normal;font-size:9.5px;color:var(--dim,#A093C4)}' +
  '#scr-party .su-role .dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}' +
  '#scr-party .su-role .dot.rahal{background:#3DDC84}' +
  '#scr-party .su-role .dot.klikka{background:#FF5468}' +
  '#scr-party .su-role .dot.newtral{background:#8A5CFF}' +
  '#scr-party .su-bal{padding:9px 12px;border-radius:10px;background:rgba(0,0,0,.3);font-size:12.5px;' +
    'font-weight:700;line-height:1.5}' +
  '#scr-party .su-bal .k{color:#FF9C90}#scr-party .su-bal .v{color:#3DDC84}#scr-party .su-bal .n{color:#C9B4FF}' +
  '#scr-party .su-net-banner{flex:0 0 auto;padding:7px 11px;border-radius:10px;background:rgba(232,69,44,.15);' +
    'border:1px solid #B3362B;font-size:11.5px;line-height:1.4}' +
  '#scr-party .su-net-banner{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;' +
    'overflow:hidden}' +
  '#scr-party .su-net-banner.full{display:block;-webkit-line-clamp:unset}' +
  /* ── the setup sheet in SUSPETT's own coat: a village at night.
     Violet dark, lantern amber where something is lit. Scoped to
     .su-menu so none of it reaches the game screen or anybody
     else's menu. ── */
  '#scr-party .su-menu{font-family:var(--disp,system-ui)}' +
  '#scr-party .su-menu .su-set{flex:1 1 auto;min-height:0}' +
  '#scr-party .su-menu .su-hero{display:block;flex:0 0 auto;margin:2px 0 0;' +
    'border-radius:16px;border:1px solid rgba(169,139,255,.28);overflow:hidden;' +
    'background:linear-gradient(180deg,#251C45 0%,#191231 62%,#120C22 100%)}' +
  '#scr-party .su-menu .su-heroart{width:min(340px,96%);height:auto;aspect-ratio:240/110;' +
    'display:block;margin:0 auto;paint-order:stroke fill}' +
  '#scr-party .su-menu .blurb{margin:0}' +
  '#scr-party .su-menu .su-set h4{color:#A98BFF}' +
  '#scr-party .su-menu .su-opt.on{border-color:#A98BFF;background:rgba(138,92,255,.15)}' +
  '#scr-party .su-menu .su-stepn{color:#C9B4FF}' +
  '#scr-party .su-menu .su-tgt.on{background:rgba(138,92,255,.22);border-color:#A98BFF}' +
  /* ── the rules fold at the bottom: a real button, sliding open ── */
  '#scr-party .su-fold{flex:0 0 auto;margin:2px 0 14px;border:1px solid rgba(169,139,255,.3);' +
    'border-radius:14px;background:rgba(138,92,255,.06);overflow:hidden}' +
  '#scr-party .su-foldtg{display:flex;align-items:center;gap:9px;width:100%;min-height:48px;' +
    'padding:6px 13px;border:0;background:none;cursor:pointer;color:#C9B4FF;' +
    'font-family:inherit;font-weight:900;font-size:12px;letter-spacing:1px;' +
    'text-transform:uppercase;text-align:left}' +
  '#scr-party .su-foldtg span{flex:1 1 auto}' +
  '#scr-party .su-foldbook{width:17px;height:17px;flex:0 0 auto}' +
  '#scr-party .su-foldcv{width:16px;height:16px;flex:0 0 auto;fill:none;stroke:currentColor;' +
    'stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;' +
    'transition:transform .2s var(--ease,ease)}' +
  '#scr-party .su-foldtg.open .su-foldcv{transform:rotate(180deg)}' +
  '#scr-party .su-foldbody{padding:0 13px 12px;font-size:12.5px;line-height:1.6;' +
    'color:var(--dim,#A093C4)}' +
  '#scr-party .su-foldbody p{margin:6px 0 0}' +
  '#scr-party .su-foldbody b{color:var(--txt,#F4EFFF)}' +
  '#scr-party .su-foldbody.anim{animation:suFoldIn .26s var(--ease,ease) both}' +
  '@keyframes suFoldIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
  '@media (prefers-reduced-motion:reduce){#scr-party .su-foldbody.anim{animation:none}' +
    '#scr-party .su-foldcv{transition:none}}' +
  'body.reduced #scr-party .su-foldbody.anim{animation:none}' +
  'body.reduced #scr-party .su-foldcv{transition:none}' +
  /* short screens: the roster and log give way, the chat keeps its room */
  '@media (max-height:700px){' +
    '#scr-party .su-seats{max-height:74px;overflow-y:auto}' +
    '#scr-party .su-log{max-height:56px}' +
    '#scr-party .su-canned{display:none}}' +
  /* landscape: chat beside roster */
  '@media (orientation:landscape) and (max-height:520px){' +
    '#scr-party .su-seats{grid-template-columns:repeat(auto-fill,minmax(84px,1fr));max-height:70px;overflow-y:auto}' +
    '#scr-party .su-log{max-height:16%}}';
  document.head.appendChild(st);
}

/* ═══════════════ the concealment overlay ═══════════════
   render(host) fills it; hideSecret() WIPES it. Nothing the sheet
   showed survives in the DOM after it closes. */
function showSecret(render, opts){
  hideSecret();
  const root = U && U.ctx ? U.ctx.rootEl : screenRoot();
  if (!root) return;
  const v = document.createElement('div');
  v.className = 'su-veil';
  v.id = 'su-veil';
  render(v);
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;width:min(330px,88%)';
  const closeB = document.createElement('button');
  closeB.className = 'su-btn gold';
  closeB.textContent = (opts && opts.closeLabel) || T('Hide and close', 'Aħbi u agħlaq');
  closeB.onclick = () => { hideSecret(); if (opts && opts.onClose) opts.onClose(); };
  row.appendChild(closeB);
  v.appendChild(row);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = T(
    'This card hides itself if you leave the app. Nothing of it stays on the screen.',
    'Din il-karta tinħeba waħedha jekk titlaq mill-app. Xejn minnha ma jibqa’ fuq l-iskrin.');
  v.appendChild(hint);
  root.appendChild(v);
  secretOpen = v;
  sfx('ui.sheet');
}
function hideSecret(){
  if (!secretOpen) return;
  try { secretOpen.innerHTML = ''; secretOpen.remove(); } catch (e){}
  secretOpen = null;
}
function screenRoot(){ try { return P.ui.screenEl(); } catch (e){ return null; } }

/* the private role card, rendered ONLY inside a secret sheet */
function roleCardInto(host, G, seat){
  const v = S.view(G, seat);
  if (!v) return;
  const card = document.createElement('div');
  card.className = 'su-card';
  const sideWord = v.role.side === 'rahal' ? T('WITH THE VILLAGE', 'MAR-RAĦAL') :
                   v.role.side === 'klikka' ? T('WITH THE KLIKKA', 'MAL-KLIKKA') :
                   T('FOR YOURSELF ALONE', 'GĦALIK WAĦDEK');
  let inner =
    '<div class="side ' + v.role.side + '">' + sideWord + '</div>' +
    '<h3>' + esc(v.role.name) + '</h3>' +
    '<p>' + esc(roleWhat(v.role.id, v.role.what)) + '</p>';
  if (v.converted)
    inner += '<div class="news">' + T('Your mira died in the night — you are il-Miġnun now.',
      'Il-mira tiegħek mietet bil-lejl — issa int il-Miġnun.') + '</div>';
  if (v.mates.length)
    inner += '<div class="mate">' + T('Your people: ', 'Sħabek: ') +
      v.mates.map(m => esc(m.name) + ' (' + esc(m.role) + ')').join(', ') + '</div>';
  if (v.mira)
    inner += '<div class="news">' + T('Your MIRA: ', 'Il-MIRA tiegħek: ') + esc(v.mira.name) +
      T('. Get them onto the planka.', '. Ġibha fuq il-planka.') + '</div>';
  if (v.role.id === 'kuntrabandist')
    inner += '<div class="news">' + T('Hides left: ', 'Moħbi li fadal: ') + v.hideLeft + '</div>';
  if (v.role.id === 'tarronda'){
    inner += '<div class="news">' + T('Cartridges left: ', 'Tiri li fadal: ') + v.rondaShots + '</div>';
    if (v.rondaGuilt)
      inner += '<div class="news">' + T('You shot a villager. The guilt is eating you ' +
        'alive — this is your last day.',
        'Qtilt wieħed tar-raħal. Il-kuxjenza qed tikolk — dan hu l-aħħar jum tiegħek.') + '</div>';
  }
  if (v.poisoned)
    inner += '<div class="news">' + T('YOU ARE POISONED! If it-Tabib does not find you ' +
      'tonight, you die at dawn. Shout for him.',
      'INT AVVELENAT! Jekk it-Tabib ma jsibekx il-lejla d-dieħla, tmut ma’ sbiħ il-jum. ' +
      'Għajjat għalih.') + '</div>';
  if (v.muted)
    inner += '<div class="news">' + T('The gag is over your mouth: today you vote only — ' +
      'no speaking and no writing in the pjazza.',
      'Is-sarima f’ħalqek: illum tivvota biss — la titkellem u lanqas tikteb fil-pjazza.') + '</div>';
  if (v.news)
    for (const nw of v.news) inner += '<div class="news">' + esc(newsLine(nw)) + '</div>';
  card.innerHTML = inner;
  host.appendChild(card);
}
/* the weapons, as il-Ħaffier names them — both tongues */
const WEAPON_MT = {
  klikka:   'daqqa tal-klikka',
  biccier:  'is-sikkina tal-Biċċier',
  ronda:    'tir ta’ senter fil-lejl',
  shot:     'l-aħħar tir ta’ Kaċċatur',
  velenu:   'il-velenu',
  xewka:    'ix-xewka',
  kuxjenza: 'il-kuxjenza — mewt minn ġewwa',
  vote:     'il-planka tal-pjazza',
  night:    'daqqa fil-lejl (qabel żmienek)'
};
const WEAPON_EN = {
  klikka:   'a klikka blow',
  biccier:  'the Biċċier’s knife',
  ronda:    'a shotgun blast in the night',
  shot:     'a Kaċċatur’s last shot',
  velenu:   'the poison',
  xewka:    'the thorn',
  kuxjenza: 'the guilt — death from within',
  vote:     'the pjazza’s planka',
  night:    'a blow in the night (before your time)'
};
function newsLine(nw){
  const N = T('Night ', 'Lejl ') + nw.night + ': ';
  if (nw.kind === 'nanna')
    return N + nw.name + ' ' + (nw.clean ? T('is CLEAN.', 'NADIF/A.') : T('is SUSPECT.', 'SUSPETTUŻ/A.'));
  if (nw.kind === 'kappillan')
    return N + nw.name + T(' and ', ' u ') + nw.name2 + ' ' +
           (nw.same ? T('are on the SAME side.', 'fuq L-ISTESS naħa.')
                    : T('are on DIFFERENT sides.', 'fuq naħat DIFFERENTI.'));
  if (nw.kind === 'ghassies')
    return isMT()
      ? N + 'għand ' + nw.name + ' ' +
        (nw.who.length ? 'mar: ' + nw.who.map(w => w.name).join(', ') + '.' : 'ma mar ĦADD.')
      : N + (nw.who.length
          ? 'to ' + nw.name + '’s house went: ' + nw.who.map(w => w.name).join(', ') + '.'
          : 'NOBODY went to ' + nw.name + '’s house.');
  if (nw.kind === 'xummiemu')
    return N + nw.name + ' ' +
           (nw.who.length ? T('went to: ', 'mar għand: ') + nw.who.map(w => w.name).join(', ') + '.'
                          : T('stayed home all night.', 'baqa’ d-dar il-lejl kollu.'));
  if (nw.kind === 'haffier')
    return N + nw.name + T(' was killed by: ', ' inqatel bi: ') +
           (isMT() ? (WEAPON_MT[nw.weapon] || 'arma li ma tagħrafhiex')
                   : (WEAPON_EN[nw.weapon] || 'a weapon you do not recognise')) + '.';
  if (nw.kind === 'velenat')
    return N + T('you feel WRONG — somebody poisoned you. Only it-Tabib can save you.',
                 'tħossok ĦAŻIN — xi ħadd avvelenak. It-Tabib biss isalvak.');
  if (nw.kind === 'kurat')
    return N + T('it-Tabib found you in time. The poison is out.',
                 'it-Tabib sabek fil-ħin. Il-velenu ħareġ.');
  if (nw.kind === 'ronda')
    return N + T('your shot hit a villager. Tomorrow night the guilt collects you.',
                 'it-tir tiegħek laqat wieħed tar-raħal. Il-lejl li ġej il-kuxjenza tiġbrok.');
  return '';
}

/* ═══════════════ the referee bar ═══════════════ */
function refBar(speak, why){
  const glyphSpeak = '<svg class="g" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" ' +
    'd="M4 4h16v12H8l-4 4V4z"/></svg>';
  const glyphSil = '<svg class="g" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" ' +
    'd="M4 4h16v12H8l-4 4V4zm2.3 2.3l11.4 7.4-1.1 1.7L5.2 8l1.1-1.7z"/></svg>';
  return '<div class="su-ref ' + (speak ? 'speak' : 'silent') + '" id="su-ref" role="status">' +
    (speak ? glyphSpeak : glyphSil) +
    '<span>' + (speak ? T('YOU MAY SPEAK', 'TISTA’ TITKELLEM')
                      : T('SILENCE — TYPE ONLY', 'SKIET — IKTEB BISS')) + '</span>' +
    '<i>' + esc(why || '') + '</i></div>';
}
function refWhy(v){
  if (!v.alive) return T('You are dead. Silence to the end.', 'Int mejjet. Skiet sal-aħħar.');
  if (v.phase === 'night' || v.phase === 'shot')
    return T('At night nobody speaks.', 'Bil-lejl ħadd ma jitkellem.');
  if (v.phase === 'defence')
    return v.seat === v.accused ? T('The planka is yours.', 'Il-planka tiegħek.')
                                : T('Let the accused speak.', 'Ħalli lill-akkużat jitkellem.');
  if (v.muted) return T('The gag is on you — today you vote only.',
                        'Is-sarima f’ħalqek — illum tivvota biss.');
  return T('The pjazza is open.', 'Il-pjazza miftuħa.');
}

/* ═══════════════ THE SETUP SHEET ═══════════════ */
function menu(){
  injectCSS(); injectSprite();
  closeGame();
  const el = screenRoot();
  if (!el) return;
  P.show();                    /* the party screen, without the hub painting over us */
  const pf = ST.pref;
  let mode  = pf.mode === 'pnp' ? 'pnp' : 'net';
  let seats = Math.min(16, Math.max(5, pf.seats | 0 || 7));
  let pmode = pf.pmode === 'borma' ? 'borma' : 'bilanc';
  /* poolV 2 marks a pool saved AGAINST THE NEW CATALOGUE — an older
     saved pool predates the new roles and is reset to its mode */
  let pool  = (Array.isArray(pf.pool) && pf.poolV === 2)
    ? pf.pool.slice() : modePool(pmode);
  let names = Array.isArray(pf.names) ? pf.names.slice() : [];
  let reveal = pf.reveal !== false;
  let dayT  = [180, 240, 300, 420].indexOf(pf.dayT) >= 0 ? pf.dayT : 240;
  let showPool = false;
  let rulesOpen = !!uiPref().rules;
  function modePool(id){
    const m = S.MODES.find(x => x.id === id);
    return (m ? m.pool : S.POOL_DEFAULT).slice();
  }
  function samePool(a, b){
    if (a.length !== b.length) return false;
    const s2 = b.slice().sort();
    return a.slice().sort().every((x, i) => x === s2[i]);
  }

  function draw(){
    const saved = ST.save && ST.save.snap;
    const roster = S.rosterFromPool(seats, pool);
    const bal = S.rosterBalance(roster);
    const valid = S.validateRoster(roster, seats);
    /* a redraw must not throw the host back to the top of the sheet */
    const oldSet = el.querySelector('.su-set');
    const keepScroll = oldSet ? oldSet.scrollTop : 0;
    el.innerHTML =
      '<div class="pt-wrap su-menu">' +
      '<div class="tbar"><button class="iconbtn" id="su-back" aria-label="Back">' +
      '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M15 18l-6-6 6-6-1.4-1.4L6.2 12l7.4 7.4z"/></svg>' +
      '</button><h2>SUSPETT</h2></div>' +
      '<div class="su-set">' +
      /* the identity piece: one lit gallarija, one watcher in the street */
      '<div class="su-hero" aria-hidden="true">' +
        '<svg class="su-heroart" viewBox="0 0 240 110" width="240" height="110" focusable="false">' +
        '<use href="#su-hero"></use></svg></div>' +
      '<p class="blurb">' + T(
        'One village, a hidden klikka inside it. By night the klikka kills in ' +
        'secret; by day the pjazza argues, votes, and hangs somebody — ideally ' +
        'the guilty one.',
        'Raħal wieħed, klikka moħbija ġo fih. Bil-lejl il-klikka taqtel ' +
        'bil-moħbi; binhar il-pjazza tiddiskuti, tivvota, u tgħallaq lil xi ħadd — ' +
        'idealment lill-ħati.') + '</p>' +
      (saved ? '<button class="su-opt on" id="su-resume"><b>' +
               T('Continue the last game', 'Kompli l-logħba ta’ qabel') + '</b>' +
               '<i>' + T('There is a half-finished one on this phone.',
                         'Hemm waħda nofsha lesta fuq dan it-telefon.') + '</i></button>' : '') +
      '<h4>' + T('HOW YOU’LL PLAY', 'KIF SE TILAGĦBU') + '</h4><div class="su-opts">' +
      '<button class="su-opt' + (mode === 'net' ? ' on' : '') + '" data-m="net"><b>' +
      T('Everyone on their own phone', 'Kulħadd fuq il-mowbajl tiegħu') + '</b>' +
      '<i>' + T('Online through the relay — the chat is the game. The best way, up to sixteen.',
                'Online mir-relay — il-chat hu l-logħba. L-aqwa mod, sa sittax.') + '</i></button>' +
      '<button class="su-opt' + (mode === 'pnp' ? ' on' : '') + '" data-m="pnp"><b>' +
      T('One phone around the table', 'Telefon wieħed idur mal-mejda') + '</b>' +
      '<i>' + T('With the curtain between every turn. No chat — you do the talking.',
                'Bil-purtiera bejn kull tidwira. Bla chat — titkellmu intom.') + '</i></button></div>' +
      (mode === 'pnp' ?
        '<h4>' + T('HOW MANY OF YOU', 'KEMM INTOM') + '</h4><div class="su-step">' +
        '<button class="su-stepb" id="su-less">-</button><span class="su-stepn">' + seats + '</span>' +
        '<button class="su-stepb" id="su-more">+</button></div>' +
        '<h4>' + T('WHO YOU ARE', 'MIN INTOM') + '</h4><div class="su-names" id="su-names">' +
        Array.from({ length: seats }, (_, i) =>
          '<input class="su-name" maxlength="14" data-i="' + i + '" placeholder="' +
          T('Player ', 'Plejer ') + (i + 1) + '"' +
          ' value="' + esc(names[i] || '') + '">').join('') + '</div>'
        : '') +
      '<h4>' + T('THE ROLES IN THE POT', 'IR-RWOLI FIL-BORMA') + ' <span style="opacity:.6">(' +
        (mode === 'pnp' ? seats + T(' seats', ' siġġu')
                        : T('sized by the room', 'skont il-kamra')) + ')</span></h4>' +
      /* THE TWO MODES — starting points, both editable afterwards */
      '<div class="su-opts">' + S.MODES.map(m => {
        const on = samePool(pool, m.pool);
        return '<button class="su-opt' + (on ? ' on' : '') + '" data-pm="' + m.id + '">' +
          '<b>' + esc(modeName(m)) + '</b><i>' + esc(modeNote(m)) + '</i></button>';
      }).join('') +
      (S.MODES.some(m => samePool(pool, m.pool)) ? '' :
        '<div class="su-bal">' + T('Your own pot — you changed the roles by hand. ' +
        'Tap a mode to go back.',
        'Borma tiegħek — bdilt ir-rwoli b’idejk. Agħfas mod biex terġa’ lura.') + '</div>') + '</div>' +
      '<button class="su-opt" id="su-poolbtn"><b>' +
      (showPool ? T('Hide the list', 'Aħbi l-lista') : T('Change the roles', 'Biddel ir-rwoli')) + '</b>' +
      '<i>' + T('Remove and add roles on top of the mode you picked — the game is built from what you leave on.',
                'Neħħi u żid rwoli fuq il-mod li għażilt — il-logħba tinbena minn dak li tħalli.') + '</i></button>' +
      (showPool ? '<div class="su-pool" id="su-pool">' +
        S.POOL_ALL.map(id => {
          const R = S.ROLES[id];
          const inPool = pool.indexOf(id) >= 0;
          const min = S.MIN_TABLE[id] || 0;
          const far = mode === 'pnp' && min > seats;
          return '<button class="su-role' + (inPool ? '' : ' off') + (far ? ' far' : '') + '" data-r="' + id + '">' +
            '<span class="dot ' + R.side + '"></span><span style="min-width:0"><b>' + esc(R.name) + '</b>' +
            '<i>' + (inPool
              ? (far ? T('joins from ' + min + ' up', 'jidħol minn ' + min + ' ’il fuq')
                     : T('in the pot', 'fil-borma'))
              : T('OUT', 'BARRA')) + '</i></span></button>';
        }).join('') + '</div>' : '') +
      '<div class="su-bal">' + (mode === 'pnp'
        ? T('With these: ', 'B’dawn: ') + '<span class="k">' + bal.killers +
          T(' killers', ' qattiela') + '</span>' + T(' against ', ' kontra ') + '<span class="v">' +
          bal.village + T(' villagers', ' tar-raħal') + '</span>' + (bal.neutral ? T(' and ', ' u ') +
          '<span class="n">' + bal.neutral + T(' out for themselves', ' għal rashom') + '</span>' : '') + '.' +
          (valid.ok ? '' : ' <span class="k">' + esc(gameText(valid.why)) + '</span>')
        : T('The room works out the balance from how many join. With ten: say ',
            'Il-bilanċ jinħadem mill-kamra skont kemm tidħlu. Bl-għaxra: eżempju ') +
          '<span class="k">' + T('2 killers', '2 qattiela') + '</span>, ' +
          '<span class="v">' + T('7 villagers', '7 tar-raħal') + '</span>, ' +
          '<span class="n">' + T('1 out for himself', '1 għal rasu') + '</span>.') + '</div>' +
      '<h4>' + T('TONIGHT’S RULES', 'REGOLI TAL-LEJLA') + '</h4><div class="su-opts">' +
      '<button class="su-opt' + (reveal ? ' on' : '') + '" id="su-rev"><b>' +
      T('The dead reveal their role', 'Il-mejtin jikxfu r-rwol') + '</b>' +
      '<i>' + (reveal ? T('YES — every corpse says what it was. Easier, and funnier.',
                          'IVA — kull katavru jgħid x’kien. Eħfef u aktar daħq.')
                      : T('NO — the corpses stay a question. Much heavier.',
                          'LE — il-katavri jibqgħu mistoqsija. Itqal sew.')) + '</i></button>' +
      '<button class="su-opt" id="su-dayt"><b>' + T('Pjazza time: ', 'Ħin il-pjazza: ') +
      (dayT / 60) + ' min</b>' +
      '<i>' + T('How long the daytime argument runs before the vote.',
                'Kemm iddum id-diskussjoni ta’ binhar qabel il-vot.') + '</i></button></div>' +
      '<button class="su-btn gold" id="su-go" style="padding:14px">' +
      (mode === 'net' ? T('FIND A ROOM ONLINE', 'SIB KAMRA ONLINE')
                      : T('DEAL THE ROLES', 'QASSAM IR-RWOLI')) + '</button>' +
      /* THE RULES, AT THE BOTTOM, SLIDING — the engine's own teaching
         panel (buildTeachHTML, the same generator the lobby's rules
         door renders), regenerated with the pool the host just left
         on. Never a modal; closed by default; remembered. */
      '<section class="su-fold">' +
        '<button class="su-foldtg' + (rulesOpen ? ' open' : '') + '" id="su-foldtg" ' +
          'aria-expanded="' + (rulesOpen ? 'true' : 'false') + '" aria-controls="su-foldbody">' +
          '<svg class="su-foldbook" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path fill="currentColor" d="M4 3.5h7a2 2 0 0 1 1 .3 2 2 0 0 1 1-.3h7v15h-7' +
            'a1.4 1.4 0 0 0-1 .5 1.4 1.4 0 0 0-1-.5H4zm7.9 2.1a.6.6 0 0 0-.6-.5H5.6v11.8' +
            'h5.7a2.7 2.7 0 0 1 .6.1zm1.6 11.4a2.7 2.7 0 0 1 .6-.1h5.3V5.1h-5.3a.6.6 0 0 0' +
            '-.6.5z"/></svg>' +
          '<span>' + T('What does what? The rules and the roles',
                       'X’jagħmel xiex? Ir-regoli u r-rwoli') + '</span>' +
          '<svg class="su-foldcv" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="su-foldbody" id="su-foldbody"' + (rulesOpen ? '' : ' hidden') + '>' +
          buildTeachHTML(pool) + '</div>' +
      '</section>' +
      '</div></div>';

    const newSet = el.querySelector('.su-set');
    if (newSet && keepScroll) newSet.scrollTop = keepScroll;
    el.querySelector('#su-back').onclick = () => { savePrefs(); P.open(); };
    const rs = el.querySelector('#su-resume');
    if (rs) rs.onclick = resumeSaved;
    el.querySelectorAll('.su-opt[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
    el.querySelectorAll('.su-opt[data-pm]').forEach(b => b.onclick = () => {
      pmode = b.dataset.pm; pool = modePool(pmode); sfx('ui.toggle'); draw();
    });
    if (mode === 'pnp'){
      el.querySelector('#su-less').onclick = () => { if (seats > 5){ seats--; draw(); } };
      el.querySelector('#su-more').onclick = () => { if (seats < 16){ seats++; draw(); } };
      el.querySelectorAll('.su-name').forEach(inp =>
        inp.oninput = () => { names[+inp.dataset.i] = inp.value; });
    }
    el.querySelector('#su-poolbtn').onclick = () => { showPool = !showPool; draw(); };
    el.querySelectorAll('.su-role').forEach(b => b.onclick = () => {
      const id = b.dataset.r;
      const at = pool.indexOf(id);
      if (at >= 0) pool.splice(at, 1); else pool.push(id);
      sfx('ui.toggle'); draw();
    });
    el.querySelector('#su-rev').onclick = () => { reveal = !reveal; draw(); };
    el.querySelector('#su-dayt').onclick = () => {
      const steps = [180, 240, 300, 420];
      dayT = steps[(steps.indexOf(dayT) + 1) % steps.length]; draw();
    };
    /* the rules fold: toggled in place, no redraw, so the sheet's
       scroll position and the panel's slide both behave */
    { const tg = el.querySelector('#su-foldtg');
      const body = el.querySelector('#su-foldbody');
      tg.onclick = () => {
        rulesOpen = body.hidden;
        body.hidden = !rulesOpen;
        tg.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
        tg.classList.toggle('open', rulesOpen);
        uiSet('rules', rulesOpen ? 1 : 0);
        sfx(rulesOpen ? 'ui.sheet' : 'ui.back');
        if (rulesOpen){
          if (!reducedMo()){
            body.classList.add('anim');
            body.addEventListener('animationend', () => body.classList.remove('anim'), { once: true });
          }
          body.scrollIntoView({ block: 'nearest', behavior: reducedMo() ? 'auto' : 'smooth' });
        }
      };
    }
    el.querySelector('#su-go').onclick = () => {
      savePrefs();
      if (mode === 'net'){
        if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('suspett');
        else toast(T('Online is not on this build.', 'L-online mhux fuq dan il-build.'));
        return;
      }
      const list = Array.from({ length: seats }, (_, i) =>
        (names[i] || '').trim() || (T('Player ', 'Plejer ') + (i + 1)));
      const roster2 = S.rosterFromPool(seats, pool);
      const chk = S.validateRoster(roster2, seats);
      if (!chk.ok){ toast(gameText(chk.why)); return; }
      openPNP(list, roster2);
    };
  }
  function savePrefs(){
    ST.pref = Object.assign({}, ST.pref,
      { mode, seats, pmode, pool, poolV: 2, names, reveal, dayT });
    persist();
  }
  draw();
}

/* ═══════════════ "X’JAGĦMEL XIEX" — the teaching panel ═══════════════
   ONE generator, built from the ENGINE's ROLES and HOW so it can never
   drift from what the code does. It leads with TONIGHT'S pot (the pool
   the host actually left on), the full catalogue underneath. Used by
   the in-game rules sheet AND published to the shared lobby through
   LOBBY.rulesHTML() — the lobby's fold-open rules door renders it while
   the room fills, for every player, without touching their seat. */
function roleLineHTML(id){
  const R = S.ROLES[id];
  if (!R) return '';
  const col = R.side === 'rahal' ? '#3DDC84' : R.side === 'klikka' ? '#FF7A6B' : '#C9B4FF';
  const min = S.MIN_TABLE[id] || 0;
  return '<p style="margin:7px 0 0"><b style="color:' + col + '">' + esc(R.name) + '</b>' +
    (min > 5 ? ' <span style="opacity:.55;font-size:10px">' +
      T('(from ' + min + ' up)', '(minn ' + min + ' ’il fuq)') + '</span>' : '') +
    ' — ' + esc(roleWhat(id, R.what)) + '</p>';
}
function prefPool(){
  const pf = ST.pref;
  return (Array.isArray(pf.pool) && pf.poolV === 2) ? pf.pool.slice() : S.POOL_DEFAULT.slice();
}
function buildTeachHTML(pool){
  pool = (Array.isArray(pool) && pool.length ? pool : S.POOL_DEFAULT)
    .filter(id => S.ROLES[id]);
  const H = S.HOW;
  /* the engine's Maltese teaching text, matched entry for entry by
     HOW_EN — an entry the English table does not know shows Maltese */
  const en = !isMT();
  const basics = H.basics.map((b, i) => (en && HOW_EN.basics[i]) || b);
  const nightS = H.night.map((s, i) => (en && HOW_EN.night[i]) || s);
  const dayS   = H.day.map((d, i) => (en && HOW_EN.day[i]) || d);
  let h = '<p><b>SUSPETT</b>' + T(
    ' — one village, one hidden klikka inside it, and ' +
      Object.keys(S.ROLES).length + ' roles in the catalogue. Read here while ' +
      'the room fills — nobody loses their seat.',
    ' — raħal wieħed, klikka waħda moħbija ġo fih, u ' +
      Object.keys(S.ROLES).length + '-il rwol fil-katalgu. Aqra hawn sakemm ' +
      'timtela l-kamra — ħadd ma jitlef postu.') + '</p>';
  h += basics.map(b => '<p>• ' + esc(b) + '</p>').join('');
  h += '<p style="margin-top:10px"><b>' +
    T('WHAT HAPPENS AT NIGHT, IN ORDER:', 'X’JIĠRI BIL-LEJL, BL-ORDNI:') + '</b></p>' +
    nightS.map((s, i) => '<p>' + (i + 1) + '. <b>' + esc(s.n) + '</b> — ' + esc(s.t) + '</p>').join('');
  h += '<p style="margin-top:10px"><b>' + T('WHAT HAPPENS BY DAY:', 'X’JIĠRI BINHAR:') + '</b></p>' +
    dayS.map(d => '<p>• ' + esc(d) + '</p>').join('');
  h += '<p style="margin-top:12px"><b>' +
    T('THE ROLES IN TONIGHT’S POT:', 'IR-RWOLI FIL-BORMA TAL-LEJLA:') + '</b></p>' +
    ['klikka', 'rahli'].concat(pool).map(roleLineHTML).join('');
  const rest = S.POOL_ALL.filter(id => pool.indexOf(id) < 0);
  if (rest.length)
    h += '<p style="margin-top:12px"><b>' +
      T('THE REST OF THE CATALOGUE (not in tonight):', 'IL-BQIJA TAL-KATALGU (barra mil-lejla):') + '</b></p>' +
      rest.map(roleLineHTML).join('');
  return h;
}
/* (the old modal rulesSheet is gone: the menu's fold and the lobby's
   rules door both render buildTeachHTML directly, one generator) */

/* ═══════════════ SHARED GAME SCREEN ═══════════════ */
function board(){
  P.show();
  const el = screenRoot();
  el.innerHTML =
    '<div class="tbar"><button class="iconbtn" id="su-quit" aria-label="Leave">' +
    '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M15 18l-6-6 6-6-1.4-1.4L6.2 12l7.4 7.4z"/></svg>' +
    '</button><h2>SUSPETT</h2><span id="su-net" style="margin-left:auto;font-size:10.5px;color:var(--dim)"></span></div>' +
    '<div class="su-wrap" id="su-wrap"></div>';
  el.querySelector('#su-quit').onclick = confirmQuit;
  U.ctx = { rootEl: el, wrap: el.querySelector('#su-wrap'), netEl: el.querySelector('#su-net') };
}
function confirmQuit(){
  showSecret(host => {
    const d = document.createElement('div');
    d.className = 'su-card';
    d.innerHTML = '<h3>' + T('Leaving?', 'Titlaq?') + '</h3><p>' + (U && U.mode === 'pnp'
      ? T('The game stays put on this phone — carry on whenever you like.',
          'Il-logħba tibqa’ merfugħa fuq dan it-telefon — tkompluha meta tridu.')
      : T('If you leave the room, your seat stays empty until you come back.',
          'Jekk titlaq mill-kamra, is-siġġu tiegħek jibqa’ vojt sa ma tirritorna.')) + '</p>';
    host.appendChild(d);
    const b = document.createElement('button');
    b.className = 'su-btn red';
    b.style.width = 'min(330px,88%)';
    b.textContent = T('Yes, leave', 'Iva, itlaq');
    b.onclick = () => { hideSecret(); leaveGame(); };
    host.appendChild(b);
  }, { closeLabel: T('No, I’ll stay', 'Le, nibqa’') });
}
function leaveGame(){
  stash();
  const net = U && U.net;
  closeGame();
  if (net && net.onLeave) net.onLeave(); else menu();
}
function closeGame(){
  hideSecret();
  if (U){
    if (U.clock) clearInterval(U.clock);
    if (U.wsGuard) clearInterval(U.wsGuard);
    if (U.unwrap){ try { U.unwrap(); } catch (e){} }
  }
  U = null;
}

/* ═══════════════ RENDER ═══════════════ */
function phaseName(G){
  return G.phase === 'night' ? T('NIGHT ', 'LEJL ') + G.night :
         G.phase === 'shot' ? T('THE SHOTGUN', 'IS-SENTER') :
         G.phase === 'day' ? T('THE PJAZZA — DAY ', 'IL-PJAZZA — JUM ') + G.night :
         G.phase === 'defence' ? T('THE DEFENCE', 'ID-DIFIŻA') :
         G.phase === 'verdict' ? T('THE VERDICT', 'IL-VERDETT') : T('OVER', 'SPIĊĊAT');
}
function render(){
  if (!U || !U.ctx) return;
  const G = U.G;
  if (U.mode === 'net') renderNet();
  else renderPNPShared();
  if (G.over) showResult();
}

/* roster strip (public knowledge only) */
function seatsHTML(G, mySeat){
  const tally = {};
  if (G.phase === 'day')
    for (const k in G.votes){
      const t = G.votes[k];
      if (t >= 0) tally[t] = (tally[t] || 0) + (G.mayor === +k ? 2 : 1);
    }
  return '<div class="su-seats">' + G.P.map(p => {
    const pub = S.publicSeat(G, p.seat);
    return '<div class="su-seat' + (pub.alive ? '' : ' dead') +
      (p.seat === mySeat ? ' me' : '') + (G.accused === p.seat ? ' acc' : '') + '">' +
      '<b>' + esc(pub.name) + '</b>' +
      (tally[p.seat] ? '<span class="vt">' + tally[p.seat] + '</span>' : '') +
      '<i>' + (pub.alive
        ? (pub.mayor ? 'SINDKU' : (G.muted === p.seat ? T('GAGGED', 'SARIMA') : ''))
        : (pub.role ? esc(pub.role) : T('DEAD', 'MEJTA'))) + '</i>' +
      '</div>';
  }).join('') + '</div>';
}
function logHTML(G, n){
  const rows = G.log.slice(-(n || 6));
  return '<div class="su-log" id="su-log">' + rows.map(r =>
    '<p' + (/mejjet|barra mir|spara/i.test(r.txt) ? ' class="hot"' : '') + '>' +
    esc(gameText(r.txt)) + '</p>').join('') + '</div>';
}

/* ═══════════════════════════════════════════════════════════════════
   PASS-THE-PHONE
   One phone, sixteen suspects. Private things happen behind the
   CURTAIN: a full black screen naming who may pick the phone up;
   the private screen exists in the DOM only between "Jien X" and
   "Aħbi u agħlaq". The shared screen never contains a role.
   ═══════════════════════════════════════════════════════════════════ */
function openPNP(names, roster){
  closeGame();
  injectCSS();
  const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  const G = S.create({
    players: names, roster: roster, seed: seed,
    revealRoles: ST.pref.reveal !== false, dayTimer: ST.pref.dayT || 240
  });
  U = { mode:'pnp', G, names, ctx:null, dealt:[], voteTurn:null, verdictQ:[] };
  board();
  stash();
  pnpDeal(0);
}
function resumeSaved(){
  const sv = ST.save;
  if (!sv || !sv.snap) return;
  const G = S.load(sv.snap);
  if (!G || G.over){ clearSlot(); toast(T('That game had already finished.',
    'Dik il-logħba kienet spiċċat.')); return; }
  closeGame(); injectCSS();
  U = { mode:'pnp', G, names: sv.names || G.P.map(p => p.name), ctx:null,
        dealt: G.P.map(p => p.seat), voteTurn:null, verdictQ:[] };
  board();
  pnpFlow();
}

function curtain(name, note, go){
  const root = U.ctx.rootEl;
  const old = root.querySelector('.su-curtain');
  if (old) old.remove();
  U.ctx.wrap.innerHTML =
    refBar(false, T('The curtain — nobody says a word.', 'Il-purtiera — ħadd ma jgħid xejn.')) +
    '<div class="su-phase night"><span>' + esc(phaseName(U.G)) + '</span></div>';
  const c = document.createElement('div');
  c.className = 'su-curtain';
  c.innerHTML = '<h2>' + T('PASS THE PHONE TO', 'GĦADDI T-TELEFON LIL') + '</h2>' +
    '<div class="who">' + esc(name) + '</div>' +
    '<p style="color:var(--dim);font-size:12.5px;max-width:280px">' + esc(note || '') + '</p>';
  const b = document.createElement('button');
  b.className = 'su-btn gold';
  b.style.cssText = 'width:min(300px,80%);padding:15px';
  b.textContent = T('I AM ', 'JIEN ') + name.toUpperCase();
  b.onclick = () => { c.remove(); go(); };
  c.appendChild(b);
  U.ctx.rootEl.appendChild(c);
  sfx('ui.swipe');
}

/* the deal: everyone meets their role once, in seat order */
function pnpDeal(i){
  const G = U.G;
  if (i >= G.P.length){ stash(); pnpFlow(); return; }
  const p = G.P[i];
  curtain(p.name, T('You are about to see your role. Make sure nobody peeks.',
                    'Ħa tara r-rwol tiegħek. Ara li ħadd ma jittawwal.'), () => {
    showSecret(host => {
      roleCardInto(host, G, i);
    }, { closeLabel: T('Seen it — hide it', 'Rajtu — aħbih'), onClose: () => pnpDeal(i + 1) });
  });
}

/* the night, one actor at a time */
function pnpFlow(){
  const G = U.G;
  stash();
  if (G.over){ render(); return; }
  if (G.phase === 'night'){
    const pending = S.actorsTonight(G).filter(s => G.acts[s] === undefined);
    if (!pending.length){ S.act(G, { t:'nightEnd' }); pnpFlow(); return; }
    const s = pending[0];
    curtain(G.P[s].name, T('Your night action. All of it in secret.',
                           'Imissek taġixxi bil-lejl. Kollox bil-moħbi.'), () => pnpNight(s));
    return;
  }
  if (G.phase === 'shot'){
    const s = G.shotQueue[0];
    curtain(G.P[s].name, T('The shotgun is in your hands. One last shot.',
                           'Is-senter f’idejk. L-aħħar tir.'), () => pnpShot(s));
    return;
  }
  render();
}

/* who this role may point at tonight — ONE list for PnP and online */
function nightOpts(G, v, seat){
  if (v.role.id === 'haffier') return G.P.filter(p => !p.alive).map(p => p.seat);
  const noSelf = ['nanna', 'barman', 'ghassies', 'pittur', 'biccier', 'surgent',
                  'talbieb', 'xummiemu', 'velenu', 'sarima', 'tarronda', 'kappillan'];
  return S.alive(G).map(p => p.seat).filter(s => {
    if (v.role.id === 'kuntrabandist') return s === seat;
    if (v.role.id === 'tabib') return s !== G.lastProtect;
    if (v.role.id === 'surgent' && s === G.lastJail) return false;
    if (noSelf.indexOf(v.role.id) >= 0 && s === seat) return false;
    if (v.role.side === 'klikka' && S.ROLES[G.P[s].role].side === 'klikka') return false;
    return true;
  });
}
function targetGridInto(host, G, seats, onPick){
  const grid = document.createElement('div');
  grid.className = 'su-tgts';
  seats.forEach(s => {
    const b = document.createElement('button');
    b.className = 'su-tgt';
    b.textContent = G.P[s].name;
    b.onclick = () => onPick(s, b);
    grid.appendChild(b);
  });
  host.appendChild(grid);
  return grid;
}

function pnpNight(seat){
  const G = U.G;
  const v = S.view(G, seat);
  showSecret(host => {
    roleCardInto(host, G, seat);
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:900;font-size:13px;color:var(--dim)';
    title.textContent = v.role.two ? T('Pick TWO:', 'Agħżel TNEJN:') :
      v.role.id === 'haffier' ? T('Pick a corpse:', 'Agħżel katavru:') : T('Pick:', 'Agħżel:');
    host.appendChild(title);
    let first = -1;
    const opts = nightOpts(G, v, seat);
    targetGridInto(host, G, opts, (s, btn) => {
      if (v.role.two && first < 0){
        first = s; btn.classList.add('on'); return;
      }
      const mv = { t:'night', seat: seat, target: v.role.two ? first : s };
      if (v.role.two) mv.target2 = s;
      const r = S.act(G, mv);
      if (!r.ok){ toast(gameText(r.why)); return; }
      sfx('ui.tap'); hideSecret(); pnpFlow();
    });
  }, { closeLabel: T('Sleep (do nothing)', 'Orqod (tagħmel xejn)'), onClose: () => {
    if (G.acts[seat] === undefined && G.phase === 'night') S.act(G, { t:'night', seat: seat, target: -1, target2: -1 });
    pnpFlow();
  } });
}
function pnpShot(seat){
  const G = U.G;
  showSecret(host => {
    const d = document.createElement('div');
    d.className = 'su-card';
    d.innerHTML = '<h3>Il-Kaċċatur</h3><p>' + T(
      'They got you — but the shotgun is still loaded. Take somebody with you, or fire into the air.',
      'Qatluk — imma s-senter għadu mimli. Ħu lil xi ħadd miegħek, jew spara fl-ajru.') + '</p>';
    host.appendChild(d);
    targetGridInto(host, G, S.alive(G).map(p => p.seat), s => {
      S.act(G, { t:'shot', seat: seat, target: s });
      hideSecret(); pnpFlow();
    });
  }, { closeLabel: T('Fire into the air', 'Spara fl-ajru'), onClose: () => {
    if (G.phase === 'shot' && G.shotQueue[0] === seat) S.act(G, { t:'shot', seat: seat, target: -1 });
    pnpFlow();
  } });
}

/* the shared daytime screen: the phone lies on the table */
function renderPNPShared(){
  const G = U.G;
  const w = U.ctx.wrap;
  const silent = G.phase === 'night' || G.phase === 'shot';
  const deadNow = G.P.filter(p => !p.alive).map(p => p.name);
  let html =
    refBar(!silent && !G.over,
      silent ? T('At night nobody speaks.', 'Bil-lejl ħadd ma jitkellem.') :
      deadNow.length ? T('The dead (' + deadNow.join(', ') + ') do NOT speak.',
                         'Il-mejtin (' + deadNow.join(', ') + ') MA jitkellmux.')
                     : T('The pjazza is open.', 'Il-pjazza miftuħa.')) +
    '<div class="su-phase' + (silent ? ' night' : '') + '"><span>' + esc(phaseName(G)) + '</span>' +
    '<span class="clk" id="su-clk"></span></div>' +
    seatsHTML(G, -1) + '<div class="su-mid">' + logHTML(G, 8) + '</div>';

  if (G.phase === 'day'){
    html += '<div class="su-bar">' +
      '<button class="su-btn gold" id="su-votebtn">' + T('VOTE', 'IVVOTA') + '</button>' +
      '<button class="su-btn" id="su-endday">' + T('Close the day', 'Agħlaq il-jum') + '</button></div>';
  } else if (G.phase === 'defence'){
    html += '<div class="su-bar"><button class="su-btn gold" id="su-endef">' +
      T('Defence over', 'Spiċċat id-difiża') + '</button></div>';
  } else if (G.phase === 'verdict'){
    html += '<div class="su-bar"><button class="su-btn gold" id="su-verd">' +
      T('THE SECRET VOTE', 'IL-VOT SIGRIET') + '</button></div>';
  }
  w.innerHTML = html;
  const vb = w.querySelector('#su-votebtn');
  if (vb) vb.onclick = pnpVote;
  const ed = w.querySelector('#su-endday');
  if (ed) ed.onclick = () => { S.act(U.G, { t:'dayEnd' }); afterMove(); };
  const ef = w.querySelector('#su-endef');
  if (ef) ef.onclick = () => { S.act(U.G, { t:'defEnd' }); afterMove(); };
  const ve = w.querySelector('#su-verd');
  if (ve) ve.onclick = () => pnpVerdict();
}
/* open voting: voter taps their name, then a target — public, like
   pointing across the pjazza */
function pnpVote(){
  const G = U.G;
  showSecret(host => {
    const d = document.createElement('div');
    d.className = 'su-card';
    d.innerHTML = '<h3>' + T('Who is voting?', 'Min qed jivvota?') + '</h3><p>' +
      T('The pjazza vote is IN THE OPEN — like pointing a finger.',
        'Il-vot tal-pjazza hu FIL-BERAĦ — bħal ma tipponta b’sebgħek.') + '</p>';
    host.appendChild(d);
    targetGridInto(host, G, S.alive(G).map(p => p.seat), voter => {
      hideSecret();
      showSecret(h2 => {
        const dd = document.createElement('div');
        dd.className = 'su-card';
        dd.innerHTML = '<h3>' + esc(G.P[voter].name) + T(' accuses…', ' jakkuża lil…') + '</h3>';
        h2.appendChild(dd);
        const sindku = G.P[voter].role === 'sindku' && G.mayor !== voter;
        targetGridInto(h2, G, S.alive(G).map(p => p.seat).filter(s => s !== voter), t => {
          const r = S.act(G, { t:'vote', seat: voter, target: t });
          if (!r.ok){ toast(gameText(r.why)); return; }
          hideSecret(); afterMove();
        });
        if (sindku){
          const rb = document.createElement('button');
          rb.className = 'su-btn';
          rb.style.width = 'min(330px,88%)';
          rb.textContent = T('I AM IS-SINDKU (reveal yourself)', 'JIEN IS-SINDKU (ikxef ruħek)');
          rb.onclick = () => { S.act(G, { t:'reveal', seat: voter }); hideSecret(); afterMove(); };
          h2.appendChild(rb);
        }
      }, { closeLabel: T('Abstain', 'Astjeni'), onClose: () => {
        if (G.phase === 'day') S.act(G, { t:'vote', seat: voter, target: -1 });
        afterMove();
      } });
    });
  }, { closeLabel: T('Close', 'Agħlaq') });
}
/* the verdict is a SECRET ballot: each voter behind the curtain */
function pnpVerdict(){
  const G = U.G;
  const voters = S.alive(G).filter(a => a.seat !== G.accused && G.verdict[a.seat] === undefined)
                  .map(a => a.seat);
  if (!voters.length){ S.act(G, { t:'verdictEnd' }); afterMove(); return; }
  const s = voters[0];
  curtain(G.P[s].name, T('Secret vote on ' + G.P[G.accused].name + ': guilty or not?',
                         'Vot sigriet fuq ' + G.P[G.accused].name + ': ħati jew le?'), () => {
    showSecret(host => {
      const d = document.createElement('div');
      d.className = 'su-card';
      d.innerHTML = '<h3>' + esc(G.P[G.accused].name) + '</h3><p>' +
        T('Guilty… or not? Nobody sees what you chose.',
          'Ħati… jew le? Ħadd ma jara x’għażilt.') + '</p>';
      host.appendChild(d);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;width:min(330px,88%)';
      [[T('GUILTY', 'ĦATI'), true, 'red'],
       [T('NOT GUILTY', 'MHUX ĦATI'), false, 'gold']].forEach(([lbl, val, cls]) => {
        const b = document.createElement('button');
        b.className = 'su-btn ' + cls;
        b.textContent = lbl;
        b.onclick = () => {
          S.act(G, { t:'verdict', seat: s, guilty: val });
          hideSecret();
          if (G.phase === 'verdict') pnpVerdict(); else afterMove();
        };
        row.appendChild(b);
      });
      host.appendChild(row);
    }, { closeLabel: T('Abstain', 'Astjeni'), onClose: () => {
      if (G.phase === 'verdict' && G.verdict[s] === undefined){
        S.act(G, { t:'verdict', seat: s, guilty: false });
      }
      if (G.phase === 'verdict') pnpVerdict(); else afterMove();
    } });
  });
}
function afterMove(){
  stash();
  if (!U) return;
  if (U.mode === 'pnp'){
    if (U.G.phase === 'night' || U.G.phase === 'shot') pnpFlow();
    else render();
  } else render();
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — everyone on their own phone, the chat is the game.
   ═══════════════════════════════════════════════════════════════════ */
function subOnMove(cb){
  MOVE_SUBS.push(cb);
  return () => { const i = MOVE_SUBS.indexOf(cb); if (i >= 0) MOVE_SUBS.splice(i, 1); };
}
const MOVE_SUBS = [];
function announce(mv, info){
  for (const cb of MOVE_SUBS.slice()){ try { cb(mv, info); } catch (e){} }
}
/* our move object <-> the relay codec's field names.
   IMPORTANT: js/mp.js cannot read our published wire list (its
   LOBBY_GLOBAL table predates us), so it folds our moves onto the
   tombla fallback fields ['s','v','k','n','c','i','p','to']. Every
   key we use MUST come from that list or toWire() refuses the move
   and stops the table: target rides `i`, the second target rides `c`
   (NOT `j`), the verdict rides `v`. */
function toNet(mv){
  const w = { t: mv.t };
  if (typeof mv.target === 'number' && mv.target >= 0) w.i = mv.target;
  if (typeof mv.target2 === 'number' && mv.target2 >= 0) w.c = mv.target2;
  if (mv.guilty !== undefined) w.v = !!mv.guilty;
  return w;
}
function fromNet(seat, d){
  const mv = { t: d.t, seat: seat };
  mv.target = (typeof d.i === 'number') ? d.i : -1;
  mv.target2 = (typeof d.c === 'number') ? d.c : -1;
  if (d.v !== undefined) mv.guilty = !!d.v;
  return mv;
}
/* a local player action: apply, then put it on the wire */
function netAct(mv){
  const G = U.G;
  const wasAlive = myAlive();
  const r = S.act(G, mv);
  if (!r.ok){ toast(gameText(r.why)); return false; }
  announce(toNet(mv), { src:'local' });
  afterNetApply(wasAlive);
  return true;
}
function myAlive(){ return U && U.G.P[U.seat] ? U.G.P[U.seat].alive : true; }
function afterNetApply(wasAlive){
  if (!U) return;
  if (wasAlive && !myAlive()) deathNotice();
  syncPhaseClock();
  render();
}

function onlineStart(cfg){
  cfg = cfg || {};
  closeGame(); injectCSS();
  const seats = cfg.seats || [];
  const names = seats.map((s2, i) => (s2 && s2.name) || ('Siġġu ' + (i + 1)));
  const bots = [];
  seats.forEach((s2, i) => { if (s2 && (s2.own === 'cpu' || s2.kind === 'cpu')) bots.push(i); });
  /* room settings ride cfg.opts — the same object every phone receives
     from the lobby, so every phone deals the identical game. The shape
     matches LOBBY.settings below; a room that sends nothing gets the
     balanced defaults. */
  const op = cfg.opts || {};
  const md = S.MODES.find(m => m.id === op.mode);
  const G = S.create({
    players: names, seed: (cfg.seed >>> 0) || 1, bots: bots,
    pool: md ? md.pool : null,
    revealRoles: op.reveal !== false,
    dayTimer: [180, 240, 300, 420].indexOf(op.dayT) >= 0 ? op.dayT : 240
  });
  U = { mode:'net', G, names, seat: cfg.you | 0, host: (cfg.host | 0) === (cfg.you | 0) || cfg.you === 0,
        net: cfg.net || null, ctx:null,
        chat: { cap: null, active:'pjazza', chans:{}, unread:{} },
        deadline: 0, clock: 0, wsGuard: 0, unwrap: null, ackDead: false };
  board();
  chatProbe();
  wsWrap();
  U.wsGuard = setInterval(wsWrap, 2500);
  syncPhaseClock(true);
  U.clock = setInterval(tickClock, 1000);
  render();
  sfx('amb.kazin');
  return { ok: true };
}
function onlineRemote(seat, mv){
  if (!U || U.mode !== 'net') return { ok:false, why:'no suspett open' };
  const wasAlive = myAlive();
  const r = S.act(U.G, fromNet(seat, mv));
  /* phase-end moves race benignly: a vote landing after dayEnd is
     refused on every phone the same way; do not call that a desync */
  if (!r.ok && ['nightEnd','dayEnd','defEnd','verdictEnd','shotEnd'].indexOf(mv.t) < 0 &&
      /Mossa mhux/.test(r.why || '')) return r;
  afterNetApply(wasAlive);
  return { ok:true };
}
function onlineNote(text, tone){
  if (U && U.ctx && U.ctx.netEl){
    U.ctx.netEl.textContent = text || '';
    U.ctx.netEl.style.color = tone === 'bad' ? '#FF5468' : 'var(--dim)';
  }
}
function onlineStop(why){
  if (!U) return;
  const root = U.ctx && U.ctx.rootEl;
  closeGame();
  if (root){
    showResultRaw(root, 'draw', T('Stopped', 'Waqfet'),
      why || T('The room stopped.', 'Il-kamra waqfet.'), () => menu());
  }
}

/* ── the host's clock: phases end by MOVES so every phone agrees ── */
function phaseSeconds(G){
  return G.phase === 'night' ? G.opt.nightTimer :
         G.phase === 'day' ? G.opt.dayTimer :
         G.phase === 'defence' ? 45 :
         G.phase === 'verdict' ? 40 :
         G.phase === 'shot' ? 30 : 0;
}
function syncPhaseClock(first){
  if (!U || U.mode !== 'net') return;
  const key = U.G.phase + ':' + U.G.night + ':' + U.G.log.length;
  if (U.phaseKey === key && !first) return;
  U.phaseKey = key;
  U.deadline = Date.now() + phaseSeconds(U.G) * 1000;
}
function tickClock(){
  if (!U || U.mode !== 'net' || U.G.over) return;
  const left = Math.max(0, Math.round((U.deadline - Date.now()) / 1000));
  const clk = U.ctx.rootEl.querySelector('#su-clk');
  if (clk) clk.textContent = fmtClock(left);
  if (left <= 0 && U.host){
    const G = U.G;
    const end = G.phase === 'night' ? 'nightEnd' : G.phase === 'day' ? 'dayEnd' :
                G.phase === 'defence' ? 'defEnd' : G.phase === 'verdict' ? 'verdictEnd' :
                G.phase === 'shot' ? 'shotEnd' : null;
    if (end) netAct({ t: end, seat: U.seat });
  }
}
function fmtClock(s){ return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

/* ── death: the unmissable notice ── */
function deathNotice(){
  if (!U || !U.ctx) return;
  sfx('board.mate');
  const d = document.createElement('div');
  d.className = 'su-death';
  d.innerHTML = '<h2>' + T('YOU ARE DEAD', 'INT MEJJET') + '</h2>' +
    '<p>' + T('<b>You can no longer speak to the room.</b> Not with your voice, not ' +
    'mouthing the words, not even a sigh. Your vote is finished.',
    '<b>Ma tistax titkellem aktar mal-kamra.</b> La b’leħnek, la ċċaqlaq xufftejk, ' +
    'u lanqas tonfoħ. Il-vot tiegħek spiċċa.') + '</p>' +
    '<p class="may">' + T('What you HAVE left: you read everything, and you write to ' +
    'the other dead in the THE DEAD channel. The living see nothing of what you write.',
    'Li FADALLEK: taqra kollox, u tikteb lill-mejtin l-oħra fil-kanal ' +
    'IL-MEJTIN. Il-ħajjin ma jarawx dak li tikteb.') + '</p>';
  const b = document.createElement('button');
  b.className = 'su-btn red';
  b.style.cssText = 'width:min(300px,84%);padding:15px';
  b.textContent = T('UNDERSTOOD — SILENCE', 'FHIMT — SKIET');
  b.onclick = () => { d.remove(); render(); };
  d.appendChild(b);
  U.ctx.rootEl.appendChild(d);
}

/* ── chat: server-filtered private channels ─────────────────────────
   Capability first: GET the relay's /health and look for chat:1.
   Without it we say so and stay silent rather than leak. */
function chatProbe(){
  U.chat.cap = null;
  const url = (window.KARTI_MP && KARTI_MP.RELAY_HEALTH) || null;
  if (!url){ U.chat.cap = false; return; }
  fetch(url, { mode:'cors' }).then(r => r.json()).then(j => {
    if (U && U.chat) U.chat.cap = !!(j && j.chat);
    if (U) render();
  }).catch(() => { if (U && U.chat){ U.chat.cap = false; render(); } });
}
function wsWrap(){
  const MP = window.KARTI_MP && KARTI_MP.MP;
  if (!MP || !MP.ws || MP.ws.__suWrapped) return;
  const ws = MP.ws;
  const prev = ws.onmessage;
  ws.__suWrapped = true;
  ws.onmessage = e => {
    try {
      const m = JSON.parse(e.data);
      if (m && m.t === 'chat'){ chatIn(m); return; }
    } catch (err){}
    if (prev) prev(e);
  };
  if (U) U.unwrap = () => { try { ws.onmessage = prev; ws.__suWrapped = false; } catch (e){} };
}
function chatSend(text){
  if (!U || U.mode !== 'net') return;
  text = String(text || '').trim().slice(0, 240);
  if (!text) return;
  const ch = U.chat.active;
  if (!S.chanWrite(U.G, U.seat, ch)){
    toast(T('This channel is closed to you right now.', 'Dan il-kanal magħluq għalik bħalissa.')); return; }
  if (U.chat.cap === false){
    toast(T('The relay has no chat yet — see the notice.', 'Ir-relay għad m’għandux chat — ara l-avviż.')); return; }
  const to = S.chanReaders(U.G, ch).filter(s => s !== U.seat);
  const MP = window.KARTI_MP && KARTI_MP.MP;
  if (MP && MP.ws && MP.ws.readyState === 1){
    try { MP.ws.send(JSON.stringify({ t:'chat', ch: ch, x: text, to: to })); } catch (e){}
  }
  chatPush(ch, U.seat, text, true);
  render();
}
function chatIn(m){
  if (!U || U.mode !== 'net') return;
  const ch = typeof m.ch === 'string' ? m.ch.slice(0, 12) : 'pjazza';
  const s = m.s | 0;
  /* the engine is the authority on whether WE may read this channel;
     a frame that slips through for a channel we cannot read is dropped
     (belt to the server's braces) */
  if (!S.channels(U.G, U.seat).some(c => c.id === ch && c.read)) return;
  chatPush(ch, s, String(m.x || '').slice(0, 240), false);
  if (ch !== U.chat.active) U.chat.unread[ch] = (U.chat.unread[ch] || 0) + 1;
  sfx('ui.note');
  render();
}
function chatPush(ch, seat, text, me){
  const list = U.chat.chans[ch] || (U.chat.chans[ch] = []);
  list.push({ s: seat, x: text, me: !!me });
  if (list.length > 200) list.shift();
}
/* who a chat line is signed as — the seance writes as her ROLE */
function chatLabel(ch, seat){
  const p = U.G.P[seat];
  if (!p) return T('Seat ', 'Siġġu ') + (seat + 1);
  if (ch === 'mejtin' && p.alive) return 'Tal-Karti';
  return p.name;
}
/* the quick-tap lines: what actually gets SENT is the label on the
   button, so each phone speaks the sender's language — that is honest,
   it is a chat between humans */
function cannedFor(ch, phase){
  if (ch === 'klikka') return [
    T('Who, tonight?', 'Lil min illejla?'), T('Yes, agreed', 'Iva, naqbel'),
    T('No, not him', 'Le, mhux dak'), T('Watch out for me', 'Oqogħdu attenti għalija')];
  if (ch === 'mejtin') return [
    T('Who killed you?', 'Min qatilkom?'),
    T('What did you see before you died?', 'X’rajtu qabel mittu?'),
    T('Know anything about the klikka?', 'Tafu xi ħaġa fuq il-klikka?')];
  if (phase === 'verdict') return [
    T('GUILTY', 'ĦATI'), T('NOT GUILTY', 'MHUX ĦATI'), T('Not convinced', 'Mhux konvint')];
  return [T('I’m clean', 'Jien nadif'), T('Where were you last night?', 'Fejn kont ilbieraħ?'),
    T('He’s lying', 'Dan qed jigdeb'), T('I have proof — ask me', 'Għandi prova — staqsuni'),
    T('Vote with me', 'Ivvutaw miegħi')];
}

function renderNet(){
  const G = U.G;
  const w = U.ctx.wrap;
  const v = S.view(G, U.seat);
  const chans = S.channels(G, U.seat);
  if (!chans.some(c => c.id === U.chat.active)) U.chat.active = chans[0].id;
  const active = chans.find(c => c.id === U.chat.active);
  const msgs = U.chat.chans[active.id] || [];
  U.chat.unread[active.id] = 0;
  const silent = !v.speak;

  let html =
    refBar(v.speak, refWhy(v)) +
    '<div class="su-phase' + (v.phase === 'night' || v.phase === 'shot' ? ' night' : '') + '">' +
    '<span>' + esc(phaseName(G)) + '</span><span class="clk" id="su-clk"></span></div>';
  if (U.chat.cap === false)
    html += '<div class="su-net-banner">' + T(
      'This relay does not know private chat yet — the channels are off. The game still ' +
      'runs (actions go through), but update the server so the klikka and the dead have ' +
      'somewhere to write.',
      'Dan ir-relay għad ma jafx bil-chat privata — il-kanali ' +
      'mitfija. Il-logħba xorta timxi (l-azzjonijiet jgħaddu), imma aġġornaw is-server biex ' +
      'il-klikka u l-mejtin ikollhom fejn jiktbu.') + '</div>';
  html += seatsHTML(G, U.seat) +
    '<div class="su-mid">' + logHTML(G, 5) +
    '<div class="su-tabs">' + chans.map(c =>
      '<button class="su-tab ' + c.cls + (c.id === active.id ? ' on' : '') + '" data-ch="' + c.id + '">' +
      esc(chanName(c)) + (U.chat.unread[c.id] ? '<span class="n">' + U.chat.unread[c.id] + '</span>' : '') +
      '</button>').join('') + '</div>' +
    '<div class="su-chat ' + active.cls + '" id="su-chatbox">' +
    (msgs.length ? msgs.map(m2 =>
      '<div class="su-msg ' + active.cls + '"><b>' + esc(chatLabel(active.id, m2.s)) + ':</b> ' +
      esc(m2.x) + '</div>').join('')
      : '<div class="su-msg sys">' + esc(gameText(active.note) ||
          T('Nothing has been said here yet.', 'Xejn għadu ma ntqal hawn.')) + '</div>') +
    '</div>' +
    '<div class="su-canned">' + cannedFor(active.id, v.phase).map((c, i) =>
      '<button class="su-can" data-c="' + i + '">' + esc(c) + '</button>').join('') + '</div>' +
    '<div class="su-inrow">' +
    '<input class="su-in ' + active.cls + '" id="su-in" maxlength="240" autocomplete="off" ' +
      'placeholder="' + (active.write
        ? T('Write to ', 'Ikteb lil ') + esc(chanName(active)) + String.fromCharCode(8230)
        : T('Read-only for you right now', 'Taqra biss hawn bħalissa')) + '"' +
      (active.write && U.chat.cap !== false ? '' : ' disabled') + '>' +
    '<button class="su-send" id="su-send"' + (active.write && U.chat.cap !== false ? '' : ' disabled') + '>' +
    T('SEND', 'IBGĦAT') + '</button>' +
    '</div></div>';

  /* action bar per phase — the night action opens a CONCEALED sheet */
  if (!G.over){
    if (v.alive){
      if (v.phase === 'night' && v.canAct && !v.acted)
        html += '<div class="su-bar"><button class="su-btn gold" id="su-act">' +
                T('NIGHT ACTION (in secret)', 'AZZJONI TAL-LEJL (bil-moħbi)') + '</button>' +
                '<button class="su-btn" id="su-role">' + T('Your role', 'Ir-rwol') + '</button></div>';
      else if (v.phase === 'day')
        html += '<div class="su-bar"><button class="su-btn gold" id="su-vote">' + T('VOTE', 'IVVOTA') +
          (G.votes[U.seat] !== undefined && G.votes[U.seat] >= 0 ? ': ' + esc(G.P[G.votes[U.seat]].name) : '') +
          '</button><button class="su-btn" id="su-role">' + T('Your role', 'Ir-rwol') + '</button></div>';
      else if (v.phase === 'verdict' && U.seat !== v.accused && G.verdict[U.seat] === undefined)
        html += '<div class="su-bar"><button class="su-btn red" id="su-hati">' + T('GUILTY', 'ĦATI') + '</button>' +
                '<button class="su-btn gold" id="su-le">' + T('NOT GUILTY', 'MHUX ĦATI') + '</button></div>';
      else if (v.mustShoot)
        html += '<div class="su-bar"><button class="su-btn red" id="su-shoot">' +
                T('THE SHOTGUN', 'IS-SENTER') + '</button></div>';
      else
        html += '<div class="su-bar"><button class="su-btn" id="su-role">' +
                T('Your role (in secret)', 'Ir-rwol tiegħek (bil-moħbi)') + '</button></div>';
    } else {
      html += '<div class="su-bar"><button class="su-btn" id="su-role">' +
              T('What were you? (in secret)', 'X’kont? (bil-moħbi)') + '</button></div>';
    }
  }
  w.innerHTML = html;

  const box = w.querySelector('#su-chatbox');
  if (box) box.scrollTop = box.scrollHeight;
  const ban = w.querySelector('.su-net-banner');
  if (ban) ban.onclick = () => ban.classList.toggle('full');
  w.querySelectorAll('.su-tab').forEach(b => b.onclick = () => {
    U.chat.active = b.dataset.ch; sfx('ui.tap'); render();
  });
  const inp = w.querySelector('#su-in');
  const send = w.querySelector('#su-send');
  if (send) send.onclick = () => { chatSend(inp.value); inp.value = ''; };
  if (inp) inp.onkeydown = e => { if (e.key === 'Enter'){ chatSend(inp.value); inp.value = ''; } };
  w.querySelectorAll('.su-can').forEach(b => b.onclick = () => {
    chatSend(b.textContent);
  });
  const roleB = w.querySelector('#su-role');
  if (roleB) roleB.onclick = () => showSecret(h => roleCardInto(h, G, U.seat));
  const actB = w.querySelector('#su-act');
  if (actB) actB.onclick = () => netNightSheet(v);
  const voteB = w.querySelector('#su-vote');
  if (voteB) voteB.onclick = () => netVoteSheet(v);
  const hati = w.querySelector('#su-hati');
  if (hati) hati.onclick = () => netAct({ t:'verdict', seat: U.seat, guilty: true });
  const le = w.querySelector('#su-le');
  if (le) le.onclick = () => netAct({ t:'verdict', seat: U.seat, guilty: false });
  const sh = w.querySelector('#su-shoot');
  if (sh) sh.onclick = () => showSecret(h => {
    const d = document.createElement('div');
    d.className = 'su-card';
    d.innerHTML = '<h3>' + T('The last shot', 'L-aħħar tir') + '</h3><p>' +
      T('Take somebody with you, or fire into the air.',
        'Ħu lil xi ħadd miegħek, jew spara fl-ajru.') + '</p>';
    h.appendChild(d);
    targetGridInto(h, G, S.alive(G).map(p => p.seat), s => {
      hideSecret(); netAct({ t:'shot', seat: U.seat, target: s });
    });
  }, { closeLabel: T('Fire into the air', 'Spara fl-ajru'),
       onClose: () => netAct({ t:'shot', seat: U.seat, target: -1 }) });
  tickClock();
}
function netNightSheet(v){
  const G = U.G;
  showSecret(host => {
    roleCardInto(host, G, U.seat);
    let first = -1;
    const opts = nightOpts(G, v, U.seat);
    const t2 = document.createElement('div');
    t2.style.cssText = 'font-weight:900;font-size:13px;color:var(--dim)';
    t2.textContent = v.role.two ? T('Pick TWO:', 'Agħżel TNEJN:') :
      v.role.id === 'haffier' ? T('Pick a corpse:', 'Agħżel katavru:') : T('Pick:', 'Agħżel:');
    host.appendChild(t2);
    targetGridInto(host, G, opts, (s, btn) => {
      if (v.role.two && first < 0){ first = s; btn.classList.add('on'); return; }
      const mv = { t:'night', seat: U.seat, target: v.role.two ? first : s };
      if (v.role.two) mv.target2 = s;
      hideSecret();
      netAct(mv);
    });
  }, { closeLabel: T('Sleep (nothing tonight)', 'Orqod (xejn illejla)'), onClose: () => {
    if (U.G.acts[U.seat] === undefined && U.G.phase === 'night')
      netAct({ t:'night', seat: U.seat, target: -1, target2: -1 });
  } });
}
function netVoteSheet(v){
  const G = U.G;
  showSecret(host => {
    const d = document.createElement('div');
    d.className = 'su-card';
    d.innerHTML = '<h3>' + T('Accuse', 'Akkuża') + '</h3><p>' +
      T('The pjazza vote shows on every screen. You can change it until the day closes.',
        'Il-vot tal-pjazza jidher fuq l-iskrin ta’ kulħadd. Tista’ tibdlu sakemm jagħlaq il-jum.') + '</p>';
    host.appendChild(d);
    targetGridInto(host, G, S.alive(G).map(p => p.seat).filter(s => s !== U.seat), s => {
      hideSecret(); netAct({ t:'vote', seat: U.seat, target: s });
    });
    if (v.canReveal){
      const rb = document.createElement('button');
      rb.className = 'su-btn';
      rb.style.width = 'min(330px,88%)';
      rb.textContent = T('REVEAL YOURSELF AS SINDKU', 'IKXEF RUĦEK BĦALA SINDKU');
      rb.onclick = () => { hideSecret(); netAct({ t:'reveal', seat: U.seat }); };
      host.appendChild(rb);
    }
  }, { closeLabel: T('Abstain', 'Astjeni'), onClose: () => {
    if (U.G.phase === 'day') netAct({ t:'vote', seat: U.seat, target: -1 });
  } });
}

/* ═══════════════ THE END ═══════════════ */
function showResult(){
  const G = U.G;
  if (U.resultShown) return;
  U.resultShown = true;
  clearSlot();
  const winners = (G.winners || []).map(s => G.P[s].name).join(', ');
  const iWon = U.mode === 'net' && (G.winners || []).indexOf(U.seat) >= 0;
  if (U.mode === 'net'){
    ST.rec[iWon ? 'w' : 'l'] = (ST.rec[iWon ? 'w' : 'l'] || 0) + 1;
    persist();
    try { if (window.KARTI_STATS && KARTI_STATS.record) KARTI_STATS.record('suspett', { result: iWon ? 'w' : 'l' }); } catch (e){}
  }
  sfx(iWon ? 'trick.win' : 'call.bell');
  showResultRaw(U.ctx.rootEl, G.winner,
    G.winner === 'rahal' ? T('The village won', 'Rebaħ ir-raħal') :
    G.winner === 'klikka' ? T('The klikka won', 'Rebħet il-klikka') :
    G.winner === 'biccier' ? T('Il-Biċċier won', 'Rebaħ il-Biċċier') : T('Nobody won', 'Ħadd ma rebaħ'),
    gameText((G.log[G.log.length - 1] || {}).txt) +
      (winners ? T(' Winners: ', ' Rebbieħa: ') + winners + '.' : ''),
    () => { const net = U && U.net; closeGame(); if (net && net.onLeave) net.onLeave(); else menu(); },
    G);
}
function showResultRaw(root, tone, head, why, back, G){
  const d = document.createElement('div');
  d.className = 'su-death';
  d.style.background = 'rgba(10,8,18,.97)';
  let roles = '';
  if (G){
    roles = '<div style="max-height:34vh;overflow-y:auto;font-size:12.5px;line-height:1.7">' +
      G.P.map(p => '<div>' + esc(p.name) + ' — <b style="color:var(--gold)">' +
        esc(S.ROLES[p.role].name) + '</b>' + (p.alive ? '' : T(' (dead)', ' (mejjet)')) + '</div>').join('') + '</div>';
  }
  d.innerHTML = '<h2 style="color:' + (tone === 'rahal' ? '#3DDC84' : tone === 'klikka' ? '#FF7A6B' : '#C9B4FF') +
    '">' + esc(head) + '</h2><p>' + esc(why || '') + '</p>' + roles;
  const b = document.createElement('button');
  b.className = 'su-btn gold';
  b.style.cssText = 'width:min(300px,84%);padding:14px';
  b.textContent = T('Back', 'Lura');
  b.onclick = () => { d.remove(); back(); };
  d.appendChild(b);
  root.appendChild(d);
}

/* ═══════════════ REGISTRATION ═══════════════ */
const LOBBY = {
  id:'suspett', name:'SUSPETT', mt:'Is-Suspett',
  minSeats: 5, maxSeats: 16, defaultSeats: 9, defaultLevel: 1,
  levels: [{ level:1, name:'Siġġu vojt', note:'Il-magni ma jafux jigdbu — dan logħob tal-bnedmin. Siġġu magni jintasa bħala Raħli rieqed.' }],
  isReady: s => !!(s && (s.kind === 'cpu' || s.ready)),
  autoReady: s => (s && s.kind === 'cpu') ? Object.assign({}, s, { ready:true }) : s,
  canStart(list){
    const n = (list || []).length;
    if (n < 5) return { ok:false, why: T('Suspett needs at least five.', 'Suspett irid mill-inqas ħamsa.') };
    if (n > 16) return { ok:false, why: T('Sixteen is the pjazza’s limit.', 'Sittax hu l-limitu tal-pjazza.') };
    const humans = (list || []).filter(x => x && x.kind !== 'cpu').length;
    if (humans < 3) return { ok:false, why: T('At least three real humans — machines cannot lie.',
      'Tliet bnedmin veri mill-inqas — il-magni ma jigdbux.') };
    const not = (list || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (not) return { ok:false, why: not + (isMT() ? (not > 1 ? ' għadhom' : ' għadu') + ' mhux lest.'
                                                  : (not > 1 ? ' are not ready yet.' : ' is not ready yet.')) };
    return { ok:true, why:'' };
  },
  /* the lobby's fold-open rules door: the full teaching panel, tonight's
     pot first — this is the "what does what" reading for the wait */
  rulesHTML(){
    return buildTeachHTML(prefPool());
  },
  /* ── ROOM SETTINGS, DECLARATIVELY ────────────────────────────────
     Published for the shared lobby's settings mechanism (being built
     in js/mp.js): the host changes these IN THE LOBBY, everybody sees
     them change, nobody loses a chair. The chosen values arrive back
     as `opts` on start() and ride cfg.opts into onlineStart — which
     already consumes exactly these ids. Until the lobby mechanism
     lands, rooms simply start with the defaults. */
  settings: {
    v: 1,
    hostOnly: true,
    fields: [
      { id:'mode', type:'choice', label:'Il-borma tar-rwoli', def:'bilanc',
        options: S.MODES.map(m => ({ v: m.id, label: m.name, note: m.note })) },
      { id:'reveal', type:'bool', label:'Il-mejtin jikxfu r-rwol', def:true },
      { id:'dayT', type:'choice', label:'Ħin il-pjazza', def:240,
        options:[{ v:180, label:'3 min' }, { v:240, label:'4 min' },
                 { v:300, label:'5 min' }, { v:420, label:'7 min' }] }
    ]
  },
  get blurb(){ return T('Who is lying? One village, a hidden klikka, and the chat is the game.',
    'Min qed jigdeb? Raħal wieħed, klikka moħbija, u l-chat hu l-logħba.'); },
  myName(){
    try {
      const n = K && K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch (e){}
    return 'You';
  },
  start(seatList, opts){
    return onlineStart({ seats: seatList, seed: opts && opts.seed, you: 0, host: 0, net: null,
                         opts: opts || {} });
  },
  /* published for honesty, though mp.js reads its tombla fallback —
     these are a subset of it, so both agree byte for byte */
  wire: { fields: ['s', 'v', 'k', 'n', 'c', 'i', 'p', 'to'] },
  takeback: false
};

P.online = P.online || {};
P.online.suspett = {
  start: onlineStart,
  remote: onlineRemote,
  note: onlineNote,
  stop: onlineStop,
  live: () => !!(U && U.mode === 'net'),
  hooks: { onMove: subOnMove }
};

window.KARTI_SUSPETT = { open: menu, engine: S, lobby: LOBBY, ui: { menu, board } };

/* teach js/mp.js the id, the way gin and rummy do — without touching it */
(function teachLobby(){
  const MPX = window.KARTI_MP;
  if (!MPX || !Array.isArray(MPX.GAMES) || !Array.isArray(MPX.GAME_KEYS)) return;
  if (MPX.GAME_KEYS.indexOf('suspett') >= 0) return;
  MPX.GAMES.push({ k:'suspett', name:'Suspett', short:'SUSPETT', sym:'su-mark',
    blurb:'Raħal wieħed, klikka moħbija. Il-chat hu l-logħba.' });
  MPX.GAME_KEYS.push('suspett');
  if (MPX.SEATS_FALLBACK) MPX.SEATS_FALLBACK.suspett = [5, 16, 9];
})();

P.register({
  id:'suspett', order:65, kind:'other', name:'SUSPETT', mt:'Is-Suspett',
  sprite:'su-mark', status:'live',
  get tag(){
    return T(
      'One village, one hidden klikka, and everybody typing so the person beside you ' +
        'hears nothing. Five to sixteen. ' + Object.keys(S.ROLES).length + ' roles in the pot.' +
        (ST.save ? ' There is a village mid-argument on this phone.' : ''),
      'Raħal wieħed, klikka waħda moħbija, u kulħadd itektek biex min hu ħdejk ma ' +
        'jisma’ xejn. Minn ħamsa sa sittax. ' + Object.keys(S.ROLES).length + '-il rwol fil-borma.' +
        (ST.save ? ' Hemm raħal f’nofs argument fuq dan it-telefon.' : ''));
  },
  open: menu,
  seats: { min: 5, max: 16 },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (seatList, o) => LOBBY.start(seatList, o)
});

if (document.body) injectSprite();
else document.addEventListener('DOMContentLoaded', injectSprite);

/* ── test hooks — inert unless the page is opened with ?sutest ──── */
try {
  if (String(location.search).indexOf('sutest') >= 0){
    window.__SU = {
      U: () => U, ST: () => ST,
      menu, openPNP, onlineStart, onlineRemote, netAct, render,
      showSecret, hideSecret, secretOpen: () => secretOpen,
      chatIn, chatSend, deathNotice, curtainless: true
    };
  }
} catch (e){}
})();
