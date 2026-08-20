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
  /* ── the clean entry: three big mode buttons, primary lit ── */
  '#scr-party .su-menu .su-mode{position:relative;padding-right:38px}' +
  '#scr-party .su-menu .su-mode .su-chev{position:absolute;right:12px;top:50%;' +
    'transform:translateY(-50%);width:18px;height:18px;fill:none;stroke:currentColor;' +
    'stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;opacity:.6}' +
  '#scr-party .su-menu .su-mode.primary{border-color:#A98BFF;' +
    'background:linear-gradient(180deg,rgba(138,92,255,.24),rgba(138,92,255,.12))}' +
  '#scr-party .su-menu .su-mode .su-mi{flex:0 0 auto;width:26px;height:26px;fill:none;' +
    'stroke:#C9B4FF;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
  '#scr-party .su-menu .su-mode.primary .su-mi{stroke:#E4D7FF}' +
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
  /* ═══════════════════════════════════════════════════════════════
     THE TOWN — a row of villagers with FACES.
     Each seat is a little character: the player's own avatar (the
     app's data-kx-av span, so it is their real profile picture /
     equipped face) sitting on a body, standing in the pjazza. Alive
     characters are lit; the dead stay in the row, greyed, with a
     headstone and a ghost. The gallows drops out of the sky over the
     lynched one. Everything below is scoped to #scr-party so it can
     never reach another game's screen.
     ═══════════════════════════════════════════════════════════════ */
  '#scr-party .su-town{flex:0 0 auto;position:relative;display:grid;gap:4px 2px;' +
    'grid-template-columns:repeat(auto-fill,minmax(60px,1fr));padding:6px 2px 4px;' +
    'border-radius:14px;background:linear-gradient(180deg,rgba(255,197,66,.07),rgba(0,0,0,.22));' +
    'border:1px solid rgba(255,255,255,.09);overflow:hidden}' +
  '#scr-party .su-town.night{background:linear-gradient(180deg,rgba(78,52,160,.26),rgba(6,4,16,.45))}' +
  '#scr-party .su-town::after{content:"";position:absolute;left:0;right:0;bottom:0;height:9px;' +
    'background:rgba(0,0,0,.28);pointer-events:none}' +
  '#scr-party .su-vil{position:relative;display:flex;flex-direction:column;align-items:center;' +
    'gap:1px;padding:2px 1px 5px;min-width:0;background:none;border:0;color:inherit;' +
    'font-family:inherit;cursor:pointer}' +
  '#scr-party .su-vil .fig{position:relative;width:46px;height:52px;display:flex;' +
    'flex-direction:column;align-items:center;justify-content:flex-end}' +
  '#scr-party .su-vil .head{position:relative;z-index:2;line-height:0}' +
  '#scr-party .su-vil .head [data-kx-av]{display:block}' +
  /* the body: a simple cloaked villager under the head */
  '#scr-party .su-vil .body{position:absolute;bottom:2px;width:30px;height:20px;z-index:1;' +
    'border-radius:14px 14px 5px 5px;background:linear-gradient(180deg,#4B3B78,#2A2142);' +
    'border:1px solid rgba(0,0,0,.45)}' +
  '#scr-party .su-vil.klk .body{background:linear-gradient(180deg,#7A2C2C,#3A1414)}' +
  '#scr-party .su-vil.me .body{background:linear-gradient(180deg,#8A6A22,#4A3510)}' +
  '#scr-party .su-vil .nm{max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
    'font-size:10px;font-weight:800;letter-spacing:.2px}' +
  '#scr-party .su-vil .rl{font-size:8.5px;font-weight:800;letter-spacing:.3px;opacity:.85;' +
    'max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '#scr-party .su-vil.me .nm{color:var(--gold,#FFC542)}' +
  '#scr-party .su-vil.acc{background:rgba(255,84,104,.16);border-radius:10px;' +
    'box-shadow:inset 0 0 0 1px #FF5468}' +
  '#scr-party .su-vil.picked{background:rgba(255,197,66,.18);border-radius:10px;' +
    'box-shadow:inset 0 0 0 2px var(--gold,#FFC542)}' +
  /* the tally pip over a head */
  '#scr-party .su-vil .vt{position:absolute;top:-1px;right:2px;z-index:4;min-width:15px;height:15px;' +
    'border-radius:8px;background:var(--gold,#FFC542);color:#241A00;font-size:9.5px;font-weight:900;' +
    'display:flex;align-items:center;justify-content:center;padding:0 3px}' +
  /* the little markers under a head: who may speak, who is gagged, the mayor */
  '#scr-party .su-vil .mk{position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);z-index:4;' +
    'display:flex;gap:2px}' +
  '#scr-party .su-vil .mk span{width:13px;height:13px;border-radius:50%;display:flex;' +
    'align-items:center;justify-content:center;font-size:8px;font-weight:900;line-height:1;' +
    'border:1px solid rgba(0,0,0,.5)}' +
  '#scr-party .su-vil .mk .talk{background:#3DDC84;color:#062C17}' +
  '#scr-party .su-vil .mk .mute{background:#2A2142;color:#FF9C90}' +
  '#scr-party .su-vil .mk .gag{background:#B3362B;color:#fff}' +
  '#scr-party .su-vil .mk .may{background:var(--gold,#FFC542);color:#241A00}' +
  '#scr-party .su-vil .mk .med{background:#8A5CFF;color:#fff}' +
  /* the dead: greyed, a headstone behind, a ghost drifting */
  '#scr-party .su-vil.dead .head,#scr-party .su-vil.dead .body{filter:grayscale(1) brightness(.5)}' +
  '#scr-party .su-vil.dead .nm{opacity:.5;text-decoration:line-through}' +
  '#scr-party .su-vil .tomb{position:absolute;bottom:0;z-index:0;width:26px;height:30px;' +
    'border-radius:13px 13px 2px 2px;background:#5A5566;border:1px solid #2A2530}' +
  '#scr-party .su-vil .tomb b{position:absolute;left:50%;top:6px;transform:translateX(-50%);' +
    'width:3px;height:13px;background:#37323f;box-shadow:-5px 4px 0 0 #37323f,5px 4px 0 0 #37323f}' +
  '#scr-party .su-vil .ghost{position:absolute;top:-4px;z-index:3;font-size:13px;opacity:.5;' +
    'animation:suGhost 3.2s ease-in-out infinite}' +
  '@keyframes suGhost{0%,100%{transform:translateY(0);opacity:.32}50%{transform:translateY(-5px);opacity:.6}}' +
  /* ── THE HANGING. A beam swings in, the rope drops, the villager
     falls through and swings. Pure transform/opacity so it is cheap,
     and every bit of it is skipped under reduced motion. ── */
  '#scr-party .su-vil .gallows{position:absolute;left:50%;top:-30px;z-index:5;' +
    'transform:translateX(-50%);width:40px;height:46px;pointer-events:none}' +
  '#scr-party .su-vil .gallows i{position:absolute;background:#6B4A2A;border-radius:1px;display:block}' +
  '#scr-party .su-vil .gallows .beam{left:4px;top:0;width:32px;height:4px}' +
  '#scr-party .su-vil .gallows .post{left:4px;top:0;width:4px;height:30px}' +
  '#scr-party .su-vil .gallows .rope{left:24px;top:3px;width:2px;height:0;background:#D8C9A0;' +
    'animation:suRope .45s .25s ease-out forwards}' +
  '#scr-party .su-vil .gallows .noose{left:20px;top:3px;width:10px;height:10px;background:none;' +
    'border:2px solid #D8C9A0;border-radius:50%;opacity:0;animation:suNoose .3s .6s ease-out forwards}' +
  '@keyframes suRope{to{height:19px}}' +
  '@keyframes suNoose{to{opacity:1;transform:translateY(17px)}}' +
  '#scr-party .su-vil.hanging .gallows{animation:suDrop .35s ease-out both}' +
  '@keyframes suDrop{from{transform:translateX(-50%) translateY(-34px)}to{transform:translateX(-50%) translateY(0)}}' +
  '#scr-party .su-vil.hanging .fig{animation:suHang 2.1s ease-in-out both;transform-origin:50% -14px}' +
  '@keyframes suHang{0%,42%{transform:translateY(0) rotate(0)}' +
    '52%{transform:translateY(9px) rotate(0)}' +
    '62%{transform:translateY(9px) rotate(11deg)}74%{transform:translateY(9px) rotate(-9deg)}' +
    '86%{transform:translateY(9px) rotate(5deg)}100%{transform:translateY(9px) rotate(0);opacity:.55}}' +
  /* the night kill: a red slash and a slump */
  '#scr-party .su-vil.slain .fig{animation:suSlain 1.5s ease-in both}' +
  '@keyframes suSlain{0%{transform:none}18%{transform:translateX(-3px) rotate(-6deg)}' +
    '32%{transform:translateX(3px) rotate(6deg)}100%{transform:translateY(10px) rotate(74deg);opacity:.55}}' +
  '#scr-party .su-vil .slash{position:absolute;inset:-4px;z-index:6;pointer-events:none;' +
    'background:linear-gradient(115deg,transparent 44%,#FF3B3B 47%,#FFD2D2 50%,#FF3B3B 53%,transparent 56%);' +
    'opacity:0;animation:suSlash .6s ease-out forwards}' +
  '@keyframes suSlash{0%{opacity:0;transform:scale(.4) rotate(-18deg)}' +
    '35%{opacity:1}100%{opacity:0;transform:scale(1.5) rotate(6deg)}}' +
  /* ── THE PHASE CURTAIN: night falls / day breaks across the table ── */
  '#scr-party .su-fall{position:absolute;inset:0;z-index:55;pointer-events:none;display:flex;' +
    'align-items:center;justify-content:center;flex-direction:column;gap:6px;' +
    'font-weight:900;letter-spacing:3px;font-size:19px;text-align:center;' +
    'animation:suFall 1.5s ease-in-out both}' +
  '#scr-party .su-fall.night{background:radial-gradient(circle at 50% 30%,rgba(88,58,180,.92),rgba(4,3,12,.97));color:#C9B4FF}' +
  '#scr-party .su-fall.day{background:radial-gradient(circle at 50% 30%,rgba(255,197,66,.9),rgba(60,32,8,.95));color:#2A1B00}' +
  '#scr-party .su-fall small{display:block;font-size:11px;letter-spacing:1px;opacity:.85;font-weight:700}' +
  '@keyframes suFall{0%{opacity:0}18%{opacity:1}72%{opacity:1}100%{opacity:0}}' +
  /* ── THE BIG CLOCK. The day has to feel like it is running out. ── */
  '#scr-party .su-clockbar{flex:0 0 auto;display:flex;align-items:center;gap:9px;padding:7px 11px;' +
    'border-radius:13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)}' +
  '#scr-party .su-clockbar.night{background:rgba(138,92,255,.15);border-color:rgba(169,139,255,.4)}' +
  '#scr-party .su-clockbar .ph{font-size:12.5px;font-weight:900;letter-spacing:.6px;min-width:0;' +
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '#scr-party .su-clockbar .big{margin-left:auto;font-size:22px;font-weight:900;' +
    'font-variant-numeric:tabular-nums;color:var(--gold,#FFC542);line-height:1}' +
  '#scr-party .su-clockbar .big.low{color:#FF5468;animation:suPulse 1s steps(2) infinite}' +
  '@keyframes suPulse{50%{opacity:.35}}' +
  '#scr-party .su-clockwrap{flex:0 0 auto;height:4px;border-radius:3px;background:rgba(0,0,0,.4);overflow:hidden}' +
  '#scr-party .su-clockwrap i{display:block;height:100%;background:var(--gold,#FFC542);' +
    'transition:width .9s linear}' +
  '#scr-party .su-clockwrap i.low{background:#FF5468}' +
  /* ── SPEAK MARKERS: who may open their mouth, and to whom ── */
  '#scr-party .su-speak{flex:0 0 auto;display:flex;gap:5px;flex-wrap:wrap;font-size:10.5px;font-weight:800}' +
  '#scr-party .su-speak b{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;' +
    'border:1px solid;line-height:1.35}' +
  '#scr-party .su-speak b.on{color:#3DDC84;border-color:#3DDC84;background:rgba(61,220,132,.12)}' +
  '#scr-party .su-speak b.off{color:#FF9C90;border-color:#FF7A6B;background:rgba(232,69,44,.12);' +
    'border-style:dashed}' +
  '#scr-party .su-speak b.gh{color:#C9B4FF;border-color:#8A5CFF;background:rgba(138,92,255,.14)}' +
  /* the dead-chat banner over the input */
  '#scr-party .su-deadnote{flex:0 0 auto;padding:6px 10px;border-radius:10px;font-size:11px;' +
    'font-weight:800;line-height:1.4;background:rgba(138,92,255,.16);border:1px dashed #8A5CFF;color:#C9B4FF}' +
  '#scr-party .su-msg.mine b{color:#3DDC84}' +
  /* the vote tally strip */
  '#scr-party .su-tally{flex:0 0 auto;display:flex;gap:4px;overflow-x:auto;padding-bottom:2px}' +
  '#scr-party .su-tally span{flex:0 0 auto;padding:3px 8px;border-radius:999px;font-size:10.5px;' +
    'font-weight:800;background:rgba(255,197,66,.16);border:1px solid rgba(255,197,66,.4);' +
    'color:var(--gold,#FFC542)}' +
  '@media (prefers-reduced-motion:reduce){' +
    '#scr-party .su-fall,#scr-party .su-vil .ghost,#scr-party .su-vil.hanging .fig,' +
    '#scr-party .su-vil.hanging .gallows,#scr-party .su-vil.slain .fig,' +
    '#scr-party .su-vil .slash,#scr-party .su-vil .gallows .rope,' +
    '#scr-party .su-vil .gallows .noose,#scr-party .su-clockbar .big.low{animation-duration:.01s}}' +
  'body.reduced #scr-party .su-fall,body.reduced #scr-party .su-vil .ghost,' +
    'body.reduced #scr-party .su-vil.hanging .fig,body.reduced #scr-party .su-vil.slain .fig,' +
    'body.reduced #scr-party .su-vil .slash{animation-duration:.01s}' +
  /* short screens: the roster and log give way, the chat keeps its room */
  '@media (max-height:700px){' +
    '#scr-party .su-seats{max-height:74px;overflow-y:auto}' +
    '#scr-party .su-town{max-height:132px;overflow-y:auto}' +
    '#scr-party .su-log{max-height:56px}' +
    '#scr-party .su-canned{display:none}}' +
  /* narrow phones: four villagers to a row, never a horizontal scrollbar */
  '@media (max-width:400px){' +
    '#scr-party .su-town{grid-template-columns:repeat(auto-fill,minmax(56px,1fr))}' +
    '#scr-party .su-vil .fig{width:42px}}' +
  /* landscape: chat beside roster */
  '@media (orientation:landscape) and (max-height:520px){' +
    '#scr-party .su-seats{grid-template-columns:repeat(auto-fill,minmax(84px,1fr));max-height:70px;overflow-y:auto}' +
    '#scr-party .su-town{max-height:96px;overflow-y:auto}' +
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

/* ═══════════════ THE ENTRY SCREEN ═══════════════
   Minimal, matching the clean new-game pattern the other games use:
   hero + blurb + two big mode buttons (PLAY ONLINE primary, PASS THE
   PHONE) + a "How to play" button that opens the existing sliding
   .su-fold rules. Nothing else on screen one. The pot / pool / reveal /
   day-timer settings are OFF this screen: online reads them from the
   host LOBBY.settings; pass-the-phone carries sensible defaults and gets
   its tiny seat picker on a SECOND step (setupPNP). */
function menu(){
  injectCSS(); injectSprite();
  closeGame();
  const el = screenRoot();
  if (!el) return;
  P.show();                    /* the party screen, without the hub painting over us */
  const saved = ST.save && ST.save.snap;
  let rulesOpen = !!uiPref().rules;

  const globe =
    '<svg class="su-mi" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>';
  const table =
    '<svg class="su-mi" viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="4" y="7" width="16" height="11" rx="2"/><path d="M8 7V5h8v2M9 18v2M15 18v2"/></svg>';
  const chev = '<svg class="su-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

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
    '<div class="su-opts" style="margin-top:2px">' +
    '<button class="su-opt su-mode primary" id="su-online">' + globe +
      '<span style="min-width:0"><b>' + T('Play online', 'Ilgħab onlajn') + '</b>' +
      '<i>' + T('Everyone on their own phone — the chat is the game. Up to sixteen.',
                'Kulħadd fuq il-mowbajl tiegħu — il-chat hu l-logħba. Sa sittax.') + '</i></span>' +
      chev + '</button>' +
    '<button class="su-opt su-mode" id="su-pnp">' + table +
      '<span style="min-width:0"><b>' + T('Pass the phone', 'Għaddi t-telefon') + '</b>' +
      '<i>' + T('One phone round the table, with the curtain between turns. Three or more.',
                'Telefon wieħed idur mal-mejda, bil-purtiera bejn id-dawriet. Tlieta jew aktar.') + '</i></span>' +
      chev + '</button>' +
    '<button class="su-opt su-mode" id="su-howto">' +
      '<svg class="su-mi" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M4 5h9a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4zM20 5h-9a3 3 0 0 0-3 3"/></svg>' +
      '<span style="min-width:0"><b>' + T('How to play', 'Kif tilgħab') + '</b>' +
      '<i>' + T('The rules and the roles, in a minute.', 'Ir-regoli u r-rwoli, f’minuta.') + '</i></span>' +
      chev + '</button></div>' +
    /* THE RULES, AT THE BOTTOM, SLIDING — the engine's own teaching
       panel (buildTeachHTML, the same generator the lobby's rules door
       renders). Never a modal; closed by default; remembered. */
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
        buildTeachHTML(prefPool()) + '</div>' +
    '</section>' +
    '</div></div>';

  el.querySelector('#su-back').onclick = () => { P.open(); };
  const rs = el.querySelector('#su-resume');
  if (rs) rs.onclick = resumeSaved;

  el.querySelector('#su-online').onclick = () => {
    sfx('ui.tap');
    /* online carries its settings in the host's LOBBY.settings, not this
       menu — don't disturb them; just open the room */
    if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('suspett');
    else toast(T('Online is not on this build.', 'L-online mhux fuq dan il-build.'));
  };
  el.querySelector('#su-pnp').onclick = () => { sfx('ui.tap'); setupPNP(); };

  /* the rules fold: toggled in place, no redraw */
  { const tg = el.querySelector('#su-foldtg');
    const body = el.querySelector('#su-foldbody');
    const toggle = () => {
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
    tg.onclick = toggle;
    /* "How to play" is a shortcut to the same fold: open it and slide it in */
    el.querySelector('#su-howto').onclick = () => { if (!rulesOpen) toggle(); else
      body.scrollIntoView({ block: 'nearest', behavior: reducedMo() ? 'auto' : 'smooth' }); };
  }
}

/* ═══════════════ PASS THE PHONE — the second step ═══════════════
   Reached only after the player chooses "Pass the phone". A tiny inline
   seat count and the names, with sensible defaults for everything the
   entry screen no longer shows (pot mode / pool / reveal / day-timer).
   Start is gated by validateRoster, exactly as before. */
function setupPNP(){
  injectCSS(); injectSprite();
  const el = screenRoot();
  if (!el) return;
  P.show();
  const pf = ST.pref;
  let seats = Math.min(16, Math.max(5, pf.seats | 0 || 7));
  const pmode = pf.pmode === 'borma' ? 'borma' : 'bilanc';
  /* the pot: the saved custom pool if it's against the current
     catalogue, otherwise the mode's default — a sensible default, never
     asked for on screen */
  function modePool(id){
    const m = S.MODES.find(x => x.id === id);
    return (m ? m.pool : S.POOL_DEFAULT).slice();
  }
  const pool = (Array.isArray(pf.pool) && pf.poolV === 2) ? pf.pool.slice() : modePool(pmode);
  const reveal = pf.reveal !== false;                                   /* default: dead reveal */
  const dayT = [180, 240, 300, 420].indexOf(pf.dayT) >= 0 ? pf.dayT : 240; /* default: 4 min */
  let names = Array.isArray(pf.names) ? pf.names.slice() : [];

  function savePrefs(){
    ST.pref = Object.assign({}, ST.pref,
      { mode:'pnp', seats, pmode, pool, poolV: 2, names, reveal, dayT });
    persist();
  }

  function draw(){
    const roster = S.rosterFromPool(seats, pool);
    const bal = S.rosterBalance(roster);
    const valid = S.validateRoster(roster, seats);
    const oldSet = el.querySelector('.su-set');
    const keepScroll = oldSet ? oldSet.scrollTop : 0;
    el.innerHTML =
      '<div class="pt-wrap su-menu">' +
      '<div class="tbar"><button class="iconbtn" id="su-back" aria-label="Back">' +
      '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M15 18l-6-6 6-6-1.4-1.4L6.2 12l7.4 7.4z"/></svg>' +
      '</button><h2>' + T('Pass the phone', 'Għaddi t-telefon') + '</h2></div>' +
      '<div class="su-set">' +
      '<button class="su-btn gold" id="su-go" style="padding:14px;margin:2px 0 4px">' +
      T('DEAL THE ROLES', 'QASSAM IR-RWOLI') + '</button>' +
      (valid.ok ? '' : '<div class="su-bal" style="margin-top:8px"><span class="k">' +
        esc(gameText(valid.why)) + '</span></div>') +
      '<h4>' + T('HOW MANY OF YOU', 'KEMM INTOM') + '</h4><div class="su-step">' +
      '<button class="su-stepb" id="su-less">-</button><span class="su-stepn">' + seats + '</span>' +
      '<button class="su-stepb" id="su-more">+</button></div>' +
      '<h4>' + T('WHO YOU ARE', 'MIN INTOM') + '</h4><div class="su-names" id="su-names">' +
      Array.from({ length: seats }, (_, i) =>
        '<input class="su-name" maxlength="14" data-i="' + i + '" placeholder="' +
        T('Player ', 'Plejer ') + (i + 1) + '"' +
        ' value="' + esc(names[i] || '') + '">').join('') + '</div>' +
      '<div class="su-bal" style="margin-top:10px">' + T('With these: ', 'B’dawn: ') +
        '<span class="k">' + bal.killers + T(' killers', ' qattiela') + '</span>' +
        T(' against ', ' kontra ') + '<span class="v">' + bal.village + T(' villagers', ' tar-raħal') +
        '</span>' + (bal.neutral ? T(' and ', ' u ') + '<span class="n">' + bal.neutral +
        T(' out for themselves', ' għal rashom') + '</span>' : '') + '.</div>' +
      '</div></div>';

    const newSet = el.querySelector('.su-set');
    if (newSet && keepScroll) newSet.scrollTop = keepScroll;
    el.querySelector('#su-back').onclick = () => { savePrefs(); menu(); };
    el.querySelector('#su-less').onclick = () => { if (seats > 5){ seats--; sfx('ui.toggle'); draw(); } };
    el.querySelector('#su-more').onclick = () => { if (seats < 16){ seats++; sfx('ui.toggle'); draw(); } };
    el.querySelectorAll('.su-name').forEach(inp =>
      inp.oninput = () => { names[+inp.dataset.i] = inp.value; });
    el.querySelector('#su-go').onclick = () => {
      savePrefs();
      const list = Array.from({ length: seats }, (_, i) =>
        (names[i] || '').trim() || (T('Player ', 'Plejer ') + (i + 1)));
      const roster2 = S.rosterFromPool(seats, pool);
      const chk = S.validateRoster(roster2, seats);
      if (!chk.ok){ toast(gameText(chk.why)); return; }
      openPNP(list, roster2);
    };
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
   THE TOWN — every seat a little character with the player's own face.
   The head is the app's avatar (KARTI_XP.avatarHTML, me:true for our
   own chair so it uses OUR real photo/face); everyone else rides the
   declarative span the avatar observer paints. On top of the head go
   the public marks the whole pjazza is allowed to see — the vote pip,
   the mayor's badge, the gag, the "may speak / cannot speak" dot — and
   NOTHING private: a hidden role is never drawn here, only a REVEALED
   corpse's role (publicSeat authority). The dead stay in the row,
   greyed, with a headstone and a drifting ghost.

   Death and lynch animations are triggered by DIFFING against the last
   paint (U.seen): a seat that was alive and is now dead gets `.hanging`
   if the pjazza voted it out (diedOn 'vote…') or `.slain` for a night
   kill. The class is applied to the fresh node for one render only, so
   the animation plays exactly once and then the seat settles into the
   plain dead look. Everything is skipped under reduced motion by CSS. */
function avatarInto(name, mine, size){
  try {
    if (window.KARTI_XP && KARTI_XP.avatarHTML)
      return KARTI_XP.avatarHTML(name, { size: size || 34, me: !!mine,
        who: mine ? undefined : 'seat', noPic: !mine });
  } catch (e){}
  /* no XP module (or offline): a plain initial disc, so the town still
     reads as faces */
  const ch = esc(String(name || '?').trim().charAt(0).toUpperCase() || '?');
  return '<span class="su-avfb" style="width:' + (size || 34) + 'px;height:' + (size || 34) +
    'px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
    'background:linear-gradient(160deg,#4B3B78,#2A2142);color:#F4EFFF;font-weight:900;' +
    'font-size:' + Math.round((size || 34) * 0.42) + 'px;border:1px solid rgba(0,0,0,.4)">' + ch + '</span>';
}
/* who died since the last paint, and how — returns a map seat->'hang'|'slain' */
function deathAnims(G){
  if (!U) return {};
  const prev = U.seen || {};
  const now = {};
  const anims = {};
  for (const p of G.P){
    now[p.seat] = p.alive ? 1 : 0;
    if (prev[p.seat] === 1 && !p.alive){
      anims[p.seat] = /^vote /.test(p.diedOn || '') ? 'hang' : 'slain';
    }
  }
  U.seen = now;
  return anims;
}
function townHTML(G, mySeat){
  const silent = G.phase === 'night' || G.phase === 'shot';
  const tally = {};
  if (G.phase === 'day')
    for (const k in G.votes){
      const t = G.votes[k];
      if (t >= 0) tally[t] = (tally[t] || 0) + (G.mayor === +k ? 2 : 1);
    }
  const anims = deathAnims(G);
  const medium = G.P.some(p => p.alive && S.ROLES[p.role].seance);   /* public: only that a séance exists */
  const cells = G.P.map(p => {
    const pub = S.publicSeat(G, p.seat);
    const mine = p.seat === mySeat;
    const klk = false;   /* side is SECRET — never leaked into the town class */
    const anim = anims[p.seat];
    let cls = 'su-vil' + (pub.alive ? '' : ' dead') + (mine ? ' me' : '') +
      (klk ? ' klk' : '') + (G.accused === p.seat ? ' acc' : '') +
      (anim === 'hang' ? ' hanging' : anim === 'slain' ? ' slain' : '');
    /* the marks the whole pjazza may see */
    const marks = [];
    if (pub.alive){
      if (G.muted === p.seat) marks.push('<span class="gag" title="Sarima">✕</span>');
      else if (!silent) marks.push('<span class="talk" title="Jista’ jitkellem">●</span>');
      if (pub.mayor) marks.push('<span class="may" title="Sindku">★</span>');
    } else {
      marks.push('<span class="mute" title="Ma jistax jitkellem">✕</span>');
    }
    const gallows = anim === 'hang'
      ? '<span class="gallows"><i class="beam"></i><i class="post"></i>' +
        '<i class="rope"></i><i class="noose"></i></span>' : '';
    const slash = anim === 'slain' ? '<span class="slash"></span>' : '';
    const roleWord = (!pub.alive && pub.role) ? '<span class="rl">' + esc(pub.role) + '</span>'
                   : (pub.alive && pub.mayor) ? '<span class="rl" style="color:var(--gold,#FFC542)">Is-Sindku</span>'
                   : '';
    return '<button class="' + cls + '" data-seat="' + p.seat + '" ' +
      (mine ? 'aria-current="true" ' : '') + 'aria-label="' + esc(pub.name) + '">' +
      '<span class="fig">' + gallows + slash +
        (pub.alive ? '' : '<span class="tomb"><b></b></span><span class="ghost">👻</span>') +
        '<span class="body"></span>' +
        '<span class="head">' + avatarInto(pub.name, mine, 34) + '</span>' +
        (tally[p.seat] ? '<span class="vt">' + tally[p.seat] + '</span>' : '') +
        (marks.length ? '<span class="mk">' + marks.join('') + '</span>' : '') +
      '</span>' +
      '<span class="nm">' + esc(pub.name) + '</span>' + roleWord +
      '</button>';
  }).join('');
  return '<div class="su-town' + (silent ? ' night' : '') + '" id="su-town">' + cells + '</div>';
}

/* the SPEAK MARKERS strip: who may open their mouth right now, said in
   words and shape and colour, from the engine's own speak/channel
   authority (never a guess). The living who may talk, the silenced
   (dead + gagged), and — when a séance is alive at night — the note
   that the dead have a voice tonight. */
function speakStripHTML(G, mySeat){
  const silent = G.phase === 'night' || G.phase === 'shot';
  const liv = G.P.filter(p => p.alive);
  const canTalk = silent ? [] : liv.filter(p => S.view(G, p.seat).speak);
  const gagged = silent ? [] : liv.filter(p => G.muted === p.seat);
  const dead = G.P.filter(p => !p.alive);
  const medium = liv.find(p => S.ROLES[p.role].seance);
  const nm = arr => arr.map(p => esc(p.name)).join(', ');
  const chips = [];
  if (silent){
    chips.push('<b class="off">' + T('Night — nobody speaks aloud', 'Lejl — ħadd ma jitkellem') + '</b>');
  } else {
    if (canTalk.length)
      chips.push('<b class="on">🗣 ' + T('Speaking: ', 'Jitkellmu: ') + nm(canTalk) + '</b>');
    if (gagged.length)
      chips.push('<b class="off">✕ ' + T('Gagged: ', 'Bis-sarima: ') + nm(gagged) + '</b>');
  }
  if (dead.length)
    chips.push('<b class="off">✕ ' + T('Dead (cannot speak): ', 'Mejtin (ma jitkellmux): ') + nm(dead) + '</b>');
  if (medium && (silent || dead.length))
    chips.push('<b class="gh">🔮 ' + T('Tal-Karti can speak to the dead',
      'Tal-Karti tista’ tkellem lill-mejtin') + '</b>');
  return chips.length ? '<div class="su-speak" id="su-speak">' + chips.join('') + '</div>' : '';
}

/* the big day/night countdown clock (online). The phase name, the
   mm:ss (turning red and pulsing under fifteen seconds), and a bar
   draining across the top. Reads the same U.deadline the tick honours. */
function clockBarHTML(G){
  const silent = G.phase === 'night' || G.phase === 'shot';
  return '<div class="su-clockbar' + (silent ? ' night' : '') + '" id="su-clockbar">' +
    '<span class="ph">' + esc(phaseName(G)) + '</span>' +
    '<span class="big" id="su-clkbig">--:--</span></div>' +
    '<div class="su-clockwrap"><i id="su-clkbar" style="width:100%"></i></div>';
}
/* fire the night-falls / day-breaks curtain once, when the phase turns */
function phaseCurtain(G){
  if (!U || !U.ctx) return;
  const kind = (G.phase === 'night') ? 'night' : (G.phase === 'day') ? 'day' : '';
  if (!kind) { U.lastCurtain = G.phase; return; }
  if (U.lastCurtain === G.phase) return;
  const firstEver = U.lastCurtain === undefined;
  U.lastCurtain = G.phase;
  if (firstEver && G.night <= 1 && G.phase === 'night') return;   /* no curtain on the opening night */
  if (reducedMo()) return;
  const f = document.createElement('div');
  f.className = 'su-fall ' + kind;
  f.innerHTML = '<div>' + (kind === 'night'
    ? T('NIGHT FALLS', 'JAQA’ L-LEJL') : T('DAY BREAKS', 'JISBAH')) + '</div>' +
    '<small>' + (kind === 'night'
      ? T('The klikka moves in the dark', 'Il-klikka tiċċaqlaq fid-dlam')
      : T('The pjazza opens', 'Il-pjazza tiftaħ')) + '</small>';
  U.ctx.rootEl.appendChild(f);
  setTimeout(() => { try { f.remove(); } catch (e){} }, 1600);
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
    townHTML(G, -1) + speakStripHTML(G, -1) +
    '<div class="su-mid">' + logHTML(G, 8) + '</div>';

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
  try { if (window.KARTI_XP && KARTI_XP.repaintAvatars) KARTI_XP.repaintAvatars(w); } catch (e){}
  phaseCurtain(G);
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
   (NOT `j`), the verdict rides `v`.

   AND THE ACTION NAME MUST BE ALL-LOWERCASE. The relay's toWire()
   lower-cases every `t` before it goes on the wire (String(t).
   toLowerCase()), so the engine's camelCase phase closers —
   nightEnd/dayEnd/defEnd/verdictEnd/shotEnd — arrive on the peer as
   "nightend"/"dayend"/… which act()'s switch does not know, and a
   rejected move stops the whole table as a suspected desync. So the
   wire carries a lower-case TOKEN and we translate it back to the
   engine's real move name on the way in. The engine keeps its
   camelCase names untouched (pass-the-phone still uses them). */
const NET_ACT_OUT = { nightEnd:'nend', dayEnd:'dend', defEnd:'fend',
                      verdictEnd:'vend', shotEnd:'sxend' };
const NET_ACT_IN  = { nend:'nightEnd', dend:'dayEnd', fend:'defEnd',
                      vend:'verdictEnd', sxend:'shotEnd' };
function toNet(mv){
  const w = { t: NET_ACT_OUT[mv.t] || mv.t };
  if (typeof mv.target === 'number' && mv.target >= 0) w.i = mv.target;
  if (typeof mv.target2 === 'number' && mv.target2 >= 0) w.c = mv.target2;
  if (mv.guilty !== undefined) w.v = !!mv.guilty;
  return w;
}
function fromNet(seat, d){
  const raw = String(d.t || '');
  const mv = { t: NET_ACT_IN[raw] || raw, seat: seat };
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
  const total = phaseSeconds(U.G) || 1;
  const left = Math.max(0, Math.round((U.deadline - Date.now()) / 1000));
  const low = left <= 15;
  const big = U.ctx.rootEl.querySelector('#su-clkbig');
  if (big){ big.textContent = fmtClock(left); big.classList.toggle('low', low); }
  const bar = U.ctx.rootEl.querySelector('#su-clkbar');
  if (bar){ bar.style.width = Math.max(0, Math.min(100, (left / total) * 100)) + '%';
            bar.classList.toggle('low', low); }
  const clk = U.ctx.rootEl.querySelector('#su-clk');   /* legacy plate, if present */
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
    clockBarHTML(G);
  if (U.chat.cap === false)
    html += '<div class="su-net-banner">' + T(
      'This relay does not know private chat yet — the channels are off. The game still ' +
      'runs (actions go through), but update the server so the klikka and the dead have ' +
      'somewhere to write.',
      'Dan ir-relay għad ma jafx bil-chat privata — il-kanali ' +
      'mitfija. Il-logħba xorta timxi (l-azzjonijiet jgħaddu), imma aġġornaw is-server biex ' +
      'il-klikka u l-mejtin ikollhom fejn jiktbu.') + '</div>';
  html += townHTML(G, U.seat) + speakStripHTML(G, U.seat) +
    '<div class="su-mid">' + logHTML(G, 4) +
    (active.id === 'mejtin'
      ? '<div class="su-deadnote">' + (v.alive
          ? T('THE SÉANCE — you write to the dead as “Tal-Karti”, never by name. The living see nothing of this.',
              'IS-SEDUTA — tikteb lill-mejtin bħala “Tal-Karti”, qatt b’ismek. Il-ħajjin ma jaraw xejn minn hawn.')
          : T('THE DEAD — hidden from the living. Only the dead (and a séance) read this.',
              'IL-MEJTIN — moħbi mill-ħajjin. Il-mejtin biss (u seduta) jaqraw dan.')) + '</div>'
      : '') +
    '<div class="su-tabs">' + chans.map(c =>
      '<button class="su-tab ' + c.cls + (c.id === active.id ? ' on' : '') + '" data-ch="' + c.id + '">' +
      esc(chanName(c)) + (U.chat.unread[c.id] ? '<span class="n">' + U.chat.unread[c.id] + '</span>' : '') +
      '</button>').join('') + '</div>' +
    '<div class="su-chat ' + active.cls + '" id="su-chatbox">' +
    (msgs.length ? msgs.map(m2 =>
      '<div class="su-msg ' + active.cls + (m2.me ? ' mine' : '') + '"><b>' +
      esc(chatLabel(active.id, m2.s)) + ':</b> ' + esc(m2.x) + '</div>').join('')
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
  try { if (window.KARTI_XP && KARTI_XP.repaintAvatars) KARTI_XP.repaintAvatars(w); } catch (e){}
  phaseCurtain(G);
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
  /* ── THE SHARED LOBBY'S RULES PICKER ──────────────────────────────
     KARTI's online lobby shows a host-only "Rules" button when a game
     publishes `variants`; mp.js reads them via lobbyVariants(k). We
     expose the host role-pool MODE (the same `mode` in settings above)
     as the variant enum, so the host can switch balanced ↔ big-pot
     from the lobby without leaving the chair.
       net    = the engine mode id (S.MODES), which is exactly what
                cfg.opts.mode carries into onlineStart.
       label  = bilingual; English from MODE_EN, Maltese the engine's.
     The room's other settings (reveal, day-timer, pool editor) do NOT
     fit a single enum, so they are NOT exposed here — they keep their
     defaults online, and can ride the opaque `rules` blob later. */
  variants: S.MODES.map(m => ({
    net: m.id,
    label: { en: (MODE_EN[m.id] && MODE_EN[m.id].name) || m.name, mt: m.name }
  })),
  currentVariant(){
    /* the current mode lives on the settings field's default — the same
       object the room broadcasts and onlineStart reads as cfg.opts.mode.
       Fall back to the persisted setup pref, then the balanced default. */
    let md = null;
    try {
      const f = LOBBY.settings.fields.find(x => x.id === 'mode');
      md = f && f.def;
    } catch(e){}
    if (md !== 'bilanc' && md !== 'borma') md = ST.pref && ST.pref.mode;
    return (md === 'borma') ? 'borma' : 'bilanc';
  },
  applyVariant(net){
    const variant = (net === 'borma') ? 'borma' : 'bilanc';
    /* set the mode IN LOBBY.settings, where the online start reads it from
       (cfg.opts.mode): update the field default so a room broadcasting its
       settings carries the new pot, and persist it in the karti_suspett_v1
       store (unchanged shape) so it survives a reload. Returning {variant}
       is what mp.js puts on the wire as the room's variant word, which
       becomes opts.mode on every phone's onlineStart. */
    try {
      const f = LOBBY.settings.fields.find(x => x.id === 'mode');
      if (f) f.def = variant;
    } catch(e){}
    try { ST.pref.mode = variant; persist(); } catch(e){}
    return { variant };
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

/* ═══════════════════════════════════════════════════════════════════
   SUSPETT — THE KIT SHELF (purely cosmetic, always)
   Role-card finishes and pass-the-phone curtains, declared through
   KARTI_XP.register() and applied as a handful of CSS rules under
   #app #scr-party — one specificity step above the game's own
   #scr-party sheet, so they win without touching a rule of play.
   Only backgrounds and border colours move: the team colour strips
   (.side.rahal / .klikka / .newtral) and the gold h3 are never
   restyled, and every curtain stays a solid hex with the veil at
   .97+ alpha, because those two exist to HIDE things — a theme that
   leaked a role would not be cosmetic. The style node is re-appended
   on every change so it always lands after the game's own sheet;
   unequip and everything falls back to stock.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var CARDS = {
  'suspett.card.lejl':  { a:'#2E2054', b:'#151028', bd:'#9A7BFF' },
  'suspett.card.inbid': { a:'#3A1420', b:'#160A10', bd:'#C87B4A' },
  'suspett.card.qiegh': { a:'#123236', b:'#08141A', bd:'#3DBCA8' },
  'suspett.card.fidda': { a:'#23242C', b:'#0B0B10', bd:'#C9CCD8' },
  /* MALTESE SUMMER. Festa crimson under a strung-bulb amber rim. The
     card carries light text, so the palest stop (#42162C) is held
     below #4a3a5a in luminance — .0191 against a .0522 cap — leaving
     the role name at 13.5:1 and the gold h3 untouched at 9.6:1. */
  'suspett.card.festa': { a:'#42162C', b:'#170811', bd:'#FF9E3D' }
};
/* c = curtain (MUST stay a solid hex — it hides who holds the phone)
   v = veil    (MUST stay >= .97 alpha — it hides the role beneath) */
var CURTAINS = {
  'suspett.curtain.dlam':     { c:'#050408', v:'rgba(4,3,7,.985)' },
  'suspett.curtain.brungiel': { c:'#150A18', v:'rgba(19,9,22,.975)' },
  'suspett.curtain.port':     { c:'#06121A', v:'rgba(5,15,21,.975)' }
};

function sheet(){
  var st = document.getElementById('sux-kit-css');
  if (!st){ st = document.createElement('style'); st.id = 'sux-kit-css'; }
  /* appendChild MOVES an existing node to the end, so this sheet is
     always later than the game's own and its rules win on order as
     well as on the extra #app of specificity. */
  document.head.appendChild(st);
  return st;
}

function apply(){
  var XP = window.KARTI_XP;
  if (!XP) return;
  var css = '', c = CARDS[XP.equipped('card', 'suspett') || ''];
  /* role cards live in the wrap AND inside the secret veil sheet —
     both hosts, or the most private card of all would stay stock */
  if (c) css += '#app #scr-party .su-wrap .su-card,#app #scr-party .su-veil .su-card{' +
                'background:linear-gradient(160deg,' + c.a + ',' + c.b + ');' +
                'border-color:' + c.bd + '}';
  var k = CURTAINS[XP.equipped('curtain', 'suspett') || ''];
  if (k) css += '#app #scr-party .su-curtain{background:' + k.c + '}' +
                '#app #scr-party .su-veil{background:' + k.v + '}';
  sheet().textContent = css;
}

/* previews: a little role card, and a curtain with a gold name-bar */
function cardPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style',
      'display:block;width:' + s + 'px;height:' + Math.floor(s * .72) + 'px;' +
      'margin:' + Math.floor(s * .14) + 'px auto;border-radius:8px;box-sizing:border-box;' +
      'border:2px solid ' + t.bd + ';' +
      'background:linear-gradient(160deg,' + t.a + ',' + t.b + ')');
    return el;
  };
}
function curtainPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style',
      'display:flex;align-items:center;justify-content:center;' +
      'width:' + s + 'px;height:' + s + 'px;border-radius:10px;box-sizing:border-box;' +
      'border:1px solid rgba(255,255,255,.12);background:' + t.c);
    var bar = document.createElement('span');
    bar.setAttribute('style',
      'display:block;width:' + Math.floor(s * .55) + 'px;height:4px;border-radius:2px;' +
      'background:#FFC542;opacity:.9');
    el.appendChild(bar);
    return el;
  };
}

function boot(tries){
  var XP = window.KARTI_XP;
  if (!XP){ if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500); return; }
  var KIT = XP.forGame('suspett');
  KIT.register([
    { slot:'card', id:'suspett.card.lejl',  level:3,  name:'Vjola tal-Lejl',
      blurb:'Deep violet with a lilac edge. Innocent-looking, which proves nothing.', preview:cardPv(CARDS['suspett.card.lejl']) },
    { slot:'card', id:'suspett.card.inbid', level:10, name:'Inbid Qadim',
      blurb:'Wine dark with a brass rim. Somebody spilled and never confessed.', preview:cardPv(CARDS['suspett.card.inbid']) },
    { slot:'card', id:'suspett.card.festa', level:17, name:'Lejl tal-Festa', set:'summer',
      blurb:'The square on the last night. Sixteen suspects and a band loud enough to cover any of it.', preview:cardPv(CARDS['suspett.card.festa']) },
    { slot:'card', id:'suspett.card.qiegh', level:26, name:'Qiegħ il-Baħar',
      blurb:'Deep-sea teal. Where the village keeps the bodies of old arguments.', preview:cardPv(CARDS['suspett.card.qiegh']) },
    { slot:'card', id:'suspett.card.fidda', level:42, name:'Iswed u Fidda',
      blurb:'Black on silver, like a funeral invitation you are proud of.', preview:cardPv(CARDS['suspett.card.fidda']) },

    { slot:'curtain', id:'suspett.curtain.dlam',     level:6,  name:'Dlam Ċappa',
      blurb:'Blackout black. Even the lamppost is off tonight.', preview:curtainPv(CURTAINS['suspett.curtain.dlam']) },
    { slot:'curtain', id:'suspett.curtain.brungiel', level:19, name:'Brunġiel Fond',
      blurb:'Deep aubergine. Technically a vegetable, spiritually a mood.', preview:curtainPv(CURTAINS['suspett.curtain.brungiel']) },
    { slot:'curtain', id:'suspett.curtain.port',     level:36, name:'Port f’Nofsillejl',
      blurb:'Midnight harbour. The water knows who did it and charges nothing.', preview:curtainPv(CURTAINS['suspett.curtain.port']) }
  ]);
  KIT.onChange(apply);
  apply();
}
boot(0);

})();
