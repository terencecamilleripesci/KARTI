'use strict';
/* quest.js — window.QUEST
   The tutorial quest + dialogue overlay for the explore layer (see WORLD_SPEC §7).

   The fiction: the player is SUMMONED into the ruin on a glowing engraving.
   The Caretaker (their summoner) explains, then a TRAINING DUMMY fight —
   straw and sackcloth, hits back for exactly 1 — teaches the combat basics
   BY DOING (move / AP vs MP / cast / end turn — each lesson ticks only when
   the player actually performs the action, watched live through the combat
   iframe), gear + XP reward, then leave EAST into the open world.

   Steps (id / goal / completed by / reward):
     0 wake   Speak with the Caretaker   glue: onNpc elder  -> advance(1)  3x Potion
     1 bones  Beat the training dummy    glue: combat won   -> advance(2)  25 XP + beginner gear
              (id stays 'bones' — world.html's win glue keys off it)
     2 leave  Leave the ruin (east)      glue: onExit ruin  -> advance(3)  50 xp
   done at step 3.

   Persistence: quest progress (step, intro-seen, granted rewards, combat
   lessons) survives reload via localStorage. QUEST.reset() wipes it for tests.
   window.PLAYER itself is NOT persisted (spec decision) — steps never re-grant.

   Owns only: #dlg, #qhud, #qtoast and their CSS. Reads window.PLAYER,
   gives items through window.PANELS.give when present. */
window.QUEST = (function () {

  const LSK = 'tactics.quest.tutorial.v1';

  /* ── the quest table (exported for the HUD) ───────────────────── */
  /* Step 1 is the owner's design verbatim: the FIRST fight is a straw
     TRAINING DUMMY the Caretaker stands up mid-room — it swings back for
     exactly 1 damage, so the fight can teach move / AP vs MP / cast /
     end-turn with no real chance of dying. Rewards stay XP + items ONLY. */
  const STEPS = [
    { id: 'wake',  goal: 'Speak with the Caretaker',
      reward: { items: [ { id: 'potion', name: 'Potion', qty: 3,
                           note: 'Restores 30 HP.' } ] } },
    { id: 'bones', goal: 'Knock the stuffing out of the training dummy',
      reward: { xp: 25, items: [
        { id: 'worn-blade',   name: 'Worn Blade',   qty: 1,
          note: 'Beginner gear. It has seen better centuries.' },
        { id: 'padded-tunic', name: 'Padded Tunic', qty: 1,
          note: 'Beginner gear. Still leaking practice straw.' } ] } },
    { id: 'leave', goal: 'Leave the ruin — head east',
      reward: { xp: 50 } }
  ];

  /* ── the training dummy dresses the map's practice fight ─────────
     maps/ruin-02.js (owned by the maps workflow) declares the fight
     marker; QUEST owns what the FIRST fight IS, so it re-dresses that
     marker in memory before WORLD loads it: same id ('bones' — the
     world.html glue keys off it), but the thing standing in the lesson
     room is a straw practice dummy that fights back for exactly 1. */
  function dressDummy() {
    try {
      const M = window.MAPS && window.MAPS['ruin-02'];
      const mk = M && (M.markers || []).find(m => m.id === 'bones');
      if (mk) {
        mk.name = 'Training Dummy';
        mk.sprite = 'dummy';               /* art/dummy-dir8.png */
        mk.foes = ['dummy'];               /* what the combat iframe spawns */
      }
    } catch (e) {}
  }

  /* the marker whose fight is being (or about to be) fought — the combat
     iframe reads this through parent.QUEST.currentFight() to know what to
     spawn. Set whenever a fight marker tap is allowed to proceed. */
  let fightMk = null;
  function currentFight() { return fightMk; }

  /* ── state (persisted) ────────────────────────────────────────── */
  let S = fresh();
  function fresh() {
    return { step: 0, intro: false,
             granted: [false, false, false],
             lessons: { move: false, cast: false, turn: false } };
  }
  function save() {
    try { localStorage.setItem(LSK, JSON.stringify(S)); } catch (e) {}
  }
  function loadSaved() {
    try {
      const d = JSON.parse(localStorage.getItem(LSK));
      if (!d || typeof d.step !== 'number') return;
      const f = fresh();
      S = {
        step: Math.max(0, Math.min(STEPS.length, d.step | 0)),
        intro: !!d.intro,
        granted: f.granted.map((_, i) => !!(d.granted && d.granted[i])),
        lessons: { move: !!(d.lessons && d.lessons.move),
                   cast: !!(d.lessons && d.lessons.cast),
                   turn: !!(d.lessons && d.lessons.turn) }
      };
    } catch (e) {}
  }

  function state() {
    return { id: 'tutorial', step: S.step, done: S.step >= STEPS.length,
             lessons: { move: S.lessons.move, cast: S.lessons.cast,
                        turn: S.lessons.turn } };
  }

  let changeCb = null;                       /* single callback, last wins */
  function onChange(cb) { changeCb = cb; }
  function fireChange() { if (changeCb) changeCb(state()); }

  /* ── rewards ──────────────────────────────────────────────────── */
  function giveItem(it) {
    const item = { id: it.id, name: it.name, qty: it.qty, note: it.note };
    if (window.PANELS && window.PANELS.give) return window.PANELS.give(item);
    /* defensive fallback: same merge-by-id rule as PANELS */
    const P = window.PLAYER; if (!P) return null;
    const have = P.items.find(x => x.id === item.id);
    if (have) { have.qty += item.qty; return have; }
    P.items.push(item); return item;
  }
  function grant(i) {                        /* grant step i's reward once */
    if (i < 0 || i >= STEPS.length || S.granted[i]) return;
    S.granted[i] = true;
    const rw = STEPS[i].reward, P = window.PLAYER, got = [];
    /* rewards are XP and ITEMS only — never currency. See world-types.js:
       the wallet belongs to KARTI, and a reward that mints a second one
       would have to be unpicked when this ships. */
    if (rw.xp && P)   { P.xp += rw.xp;     got.push(rw.xp + ' XP'); }
    if (rw.items) for (const it of rw.items) {
      giveItem(it); got.push(it.qty > 1 ? it.qty + 'x ' + it.name : it.name);
    }
    if (got.length) {
      toast('Received: ' + got.join(', '), 3500);
      if (window.HUD) window.HUD.sfx('reward');   /* soft chime, once */
    }
    save();
  }
  function reward() { grant(S.step - 1); }   /* spec: just-completed step */

  /* ── the state machine ────────────────────────────────────────── */
  function start() {
    dressDummy();                          /* before WORLD.load reads MAPS */
    loadSaved();
    ready(() => {
      hud();
      if (!S.intro && S.step === 0) {
        S.intro = true; save();
        setTimeout(() => { if (S.step === 0 && !D) say('', LINES.intro); }, 500);
      }
    });
  }
  function advance(n) {
    if (n !== S.step + 1 || S.step >= STEPS.length) return false;
    S.step = n;
    reward();                                /* exactly once — granted[] gates it */
    save(); hud(); fireChange();
    if (S.step >= STEPS.length)
      setTimeout(() => say('', LINES.outro), 300);
    return true;
  }
  function reset() {
    try { localStorage.removeItem(LSK); } catch (e) {}
    detachCombat();
    S = fresh();
    if (D) closeDlg(false);
    hud(); fireChange();
  }

  /* ── dialogue content ─────────────────────────────────────────── */
  const LINES = {
    intro: [
      'The engraving beneath your feet flares white-hot…',
      '…and the world rushes in. Cold stone. Guttering braziers. Air in lungs that were not yours a moment ago.',
      'You have been REINCARNATED. Across the ruin, a robed figure lowers its hands and beckons.'
    ],
    /* step 0, choice not yet made: the reincarnation moment. After
       elder0a the summoning circle opens (SELECTUI overlay); elder0b
       plays once the shape is chosen, then advance(1) hands over the
       potions. */
    elder0a: [
      'So the circle still burns. Welcome back to the living, summonling — I am the Caretaker, and mine was the voice that called you out of death.',
      'The engraving beneath your feet is a summoning circle, and it is not finished with you. It has given you breath — but no shape.',
      'Step into the light, then, and choose: what did you come back as?'
    ],
    elder0b: [
      'So THAT is you now. Look at yourself — the circle burned an age of oil to shape that body. Wear it well.',
      'Take these three potions. The first thing a new body learns is how much everything hurts.',
      'In the next room I have stood up a training dummy — straw, sackcloth, and just enough spite to swing back. It cannot truly hurt you. Go knock the stuffing out of it.',
      'Move, strike, and mind your two pools — I will talk you through it. Then head EAST, out through the arch.'
    ],
    circleWaits: [
      'The circle has waited an age for you, summonling. It can wait a breath more — speak to me when you are ready to choose.'
    ],
    /* step 0 but the shape is already chosen (an earlier session, or
       select.html): no picker, straight to business */
    elder0: [
      'So the circle still burns — and it remembers you, summonling. I am the Caretaker; mine was the voice that called you back.',
      'Take these three potions. This ruin is the last quiet corner of a very loud world, and beyond the eastern arch lies all of it.',
      'In the next room stands my training dummy — straw, sackcloth, and just enough spite to swing back. It cannot truly hurt you. Go knock the stuffing out of it.',
      'Move, strike, and mind your two pools — I will talk you through it. Then head EAST, out through the arch.'
    ],
    elder1: [
      'The dummy is still standing — straw does not fall on its own. Tap it when you are ready; I will coach you as you fight.'
    ],
    elder2: [
      'Well struck — straw everywhere. There is nothing left for you here: take the eastern arch, and do not look back.'
    ],
    elder3: [
      'The world lies east of here, summonling. Go and meet it.'
    ],
    holdFight: [
      'Hold, summonling! Speak with me before you square up to anything — even the straw.'
    ],
    lost: 'Beaten… catch your breath and try the dummy again.',
    outro: [
      'Sunlight. Wind. An open sky that goes on forever.',
      'The ruin — and the tutorial — are behind you. The world is yours: head east.'
    ]
  };
  const FACES = {                            /* name -> [sheet, cols, rows] */
    'The Caretaker': ['art/skelmage-dir8.png', 6, 4],
    'Training Dummy': ['art/dummy-dir8.png', 6, 4]
  };

  /* onNpc routing. Returns true if QUEST handled the tap (dialogue shown /
     blocked); false means the glue should proceed (start the fight). */
  function npc(m) {
    if (!m) return false;
    if (m.type === 'npc' && m.id === 'elder') {
      if (S.step === 0) {
        if (needsChoice()) say(m.name, LINES.elder0a, () => openCircle(m));
        else               say(m.name, LINES.elder0, () => advance(1));
      }
      else if (S.step === 1) say(m.name, LINES.elder1);
      else if (S.step === 2) say(m.name, LINES.elder2);
      else                   say(m.name, LINES.elder3);
      return true;
    }
    if (m.type === 'fight') {
      if (S.step === 0) {
        say('The Caretaker', LINES.holdFight);
        return true;                         /* talk first — no combat yet */
      }
      fightMk = m;                           /* the combat iframe will ask */
      return false;                          /* let the glue start the fight */
    }
    return false;
  }

  /* ── the reincarnation moment (design: class choice lives IN the
     story, at the potions handshake — never a separate page) ─────── */
  function needsChoice() {
    return !!(window.HERO && window.SELECTUI && !window.HERO.chosen());
  }
  function openCircle(m) {
    window.SELECTUI.openOverlay({
      label: 'The summoning circle — choose what you came back as',
      title: 'The circle asks',
      subtitle: 'What did you come back as? Tap a shape — watch it move.',
      verb: 'Awaken as',
      onConfirm: p => {
        /* HERO owns the identity; choosing swaps the walking sprite
           immediately (WORLD.refreshHeroSprites inside choose) */
        if (window.HERO) window.HERO.choose(p.classId, p.gender, p.look);
        say(m.name, LINES.elder0b, () => advance(1));
      },
      onCancel: () => say(m.name, LINES.circleWaits)
    });
  }

  /* ── teach-by-doing: watch the combat iframe ──────────────────── */
  /* attachCombat(win) — win = the combat iframe's contentWindow. Polls T.G
     and ticks each lesson only when the player actually DOES the thing:
     move = MP spent, cast = AP spent, turn = their turn ended after having
     had one. Lessons persist, so a reload mid-fight keeps earned ticks. */
  let CW = null, CT = null, sawTurn = false, coached = '';
  function attachCombat(win) {
    detachCombat();
    CW = win; sawTurn = false;
    CT = setInterval(pollCombat, 300);
    coach();
  }
  function detachCombat() {
    if (CT) clearInterval(CT);
    CT = null; CW = null; coached = '';
    toastHide();
    placeToast();                            /* back to the default slot */
  }
  function pollCombat() {
    let T = null;
    try { T = CW && CW.T; } catch (e) { return detachCombat(); }
    if (!T || !T.G || !T.G.units) return;    /* iframe still booting */
    const G = T.G, hero = G.units.find(u => u.side === 0 && !u.auto);
    if (!hero) return;
    const idx = G.units.indexOf(hero), L = S.lessons;
    if (G.over === 0 && G.turn === idx) sawTurn = true;
    let changed = false;
    if (!L.move && hero.mp < hero.mpMax) { L.move = true; changed = true; }
    if (!L.cast && hero.ap < hero.apMax) { L.cast = true; changed = true; }
    if (!L.turn && sawTurn && G.turn !== idx) { L.turn = true; changed = true; }
    if (changed) save();
    if (G.over !== 0) {                      /* the glue handles the outcome */
      if (G.over === -1) toast(LINES.lost, 4000);
      return detachCombat();
    }
    placeToast();                            /* track resize / hint toasts */
    coach();
  }
  function coach() {
    const L = S.lessons; let msg;
    if (!L.move)
      msg = 'LESSON — MOVE: tap a highlighted tile to walk. Moving spends MP.';
    else if (!L.cast)
      msg = 'LESSON — CAST: pick a spell, tap a red tile. Spells spend AP. MP moves, AP casts — two separate pools.';
    else if (!L.turn)
      msg = 'LESSON — TURNS: done for now? End your turn. AP and MP refill when it comes back around.';
    else
      msg = 'You know the basics. Knock the dummy down!';
    if (msg !== coached) { coached = msg; toast(msg, 0); }
  }

  /* ── DOM: css, dialogue (#dlg), HUD (#qhud), toast (#qtoast) ──── */
  function ready(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  const CSS = [
    '#dlg{position:fixed;left:0;right:0;bottom:0;z-index:50;display:none;',
    ' padding:10px 10px calc(10px + env(safe-area-inset-bottom,0px));',
    ' font-family:system-ui,sans-serif;-webkit-user-select:none;user-select:none}',
    '#dlg.on{display:block}',
    '#dlg .dlg-box{position:relative;max-width:640px;margin:0 auto;min-height:88px;',
    ' display:flex;gap:12px;align-items:flex-start;padding:14px 52px 14px 14px;',
    ' background:rgba(20,16,28,.94);border:1px solid #6b5a8c;border-radius:14px;',
    ' box-shadow:0 8px 30px rgba(0,0,0,.5);cursor:pointer}',
    '#dlg .dlg-face{flex:0 0 56px;width:56px;height:56px;border-radius:10px;',
    ' border:1px solid #6b5a8c;background:#241d33 no-repeat;background-size:600% 400%;',
    ' background-position:0 0;image-rendering:pixelated}',
    '#dlg .dlg-name{color:#e8c66a;font-weight:700;font-size:14px;letter-spacing:.4px;',
    ' margin-bottom:4px;min-height:1em}',
    '#dlg .dlg-text{color:#efe9dc;font-size:16px;line-height:1.45;min-height:2.9em}',
    '#dlg .dlg-more{position:absolute;right:16px;bottom:8px;color:#a08cc8;',
    ' font-size:13px;opacity:0;transition:opacity .2s}',
    '#dlg .dlg-more.on{opacity:1;animation:dlgbob 1s infinite}',
    '@keyframes dlgbob{50%{transform:translateY(3px)}}',
    '#dlg .dlg-x{position:absolute;top:0;right:0;width:44px;height:44px;border:0;',
    ' background:none;color:#a08cc8;font-size:18px;line-height:44px;cursor:pointer}',
    '#qhud{position:fixed;top:calc(env(safe-area-inset-top,0px) + 80px);left:8px;z-index:30;pointer-events:none;display:none;',
    ' font-family:system-ui,sans-serif;font-size:13px;color:#efe9dc;',
    ' background:rgba(20,16,28,.85);border:1px solid #6b5a8c;border-radius:10px;',
    /* sits 8px under the minimap (top 8 + 64 panel + 8 gap = 80). The
       width cap keeps it clear of anything on the right on narrow phones */
    ' padding:7px 12px;max-width:min(70vw,calc(100vw - 166px))}',
    '#qhud.on{display:block}',
    '#qhud .q-dot{color:#e8c66a;margin-right:6px}',
    '#qtoast{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;',
    ' pointer-events:none;display:none;font-family:system-ui,sans-serif;font-size:14px;',
    ' line-height:1.4;color:#1c1626;background:rgba(232,198,106,.96);',
    ' border-radius:10px;padding:9px 14px;max-width:min(560px,88vw);',
    ' box-shadow:0 4px 18px rgba(0,0,0,.45);text-align:center}',
    '#qtoast.on{display:block}'
  ].join('');
  let dlgEl = null, hudEl = null, toastEl = null;
  function ensureDom() {
    if (dlgEl || !document.body) return;
    const st = document.createElement('style');
    st.id = 'quest-css'; st.textContent = CSS;
    document.head.appendChild(st);
    dlgEl = document.createElement('div');
    dlgEl.id = 'dlg';
    dlgEl.innerHTML =
      '<div class="dlg-box"><div class="dlg-face"></div>' +
      '<div class="dlg-body"><div class="dlg-name"></div>' +
      '<div class="dlg-text"></div></div>' +
      '<button class="dlg-x" aria-label="Close">✕</button>' +
      '<div class="dlg-more">▾ tap</div></div>';
    document.body.appendChild(dlgEl);
    hudEl = document.createElement('div');
    hudEl.id = 'qhud';
    document.body.appendChild(hudEl);
    toastEl = document.createElement('div');
    toastEl.id = 'qtoast';
    document.body.appendChild(toastEl);
    window.addEventListener('resize', placeToast);  /* pill rewraps on
                                          narrow phones; keep toast below */
    dlgEl.addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
    dlgEl.querySelector('.dlg-x').addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      closeDlg(true);                        /* dismiss = skip all; cb still
                                                fires so nothing soft-locks */
    });
  }

  /* ── dialogue: typewriter, tap advances, tap again skips reveal ─ */
  let D = null, typeTimer = null;
  function say(name, lines, cb, face) {
    ensureDom();
    if (!dlgEl || !lines || !lines.length) { if (cb) cb(); return; }
    stopType();
    D = { lines: lines.slice(), i: 0, cb: cb || null };
    dlgEl.querySelector('.dlg-name').textContent = name || '';
    const f = face || FACES[name] || null,
          fe = dlgEl.querySelector('.dlg-face');
    if (f) {
      fe.style.display = '';
      fe.style.backgroundImage = 'url(' + f[0] + ')';
      fe.style.backgroundSize = (f[1] * 100) + '% ' + (f[2] * 100) + '%';
    } else fe.style.display = 'none';
    dlgEl.classList.add('on');
    typeLine();
  }
  function typeLine() {
    const tx = dlgEl.querySelector('.dlg-text'),
          more = dlgEl.querySelector('.dlg-more'),
          full = D.lines[D.i];
    more.classList.remove('on');
    let shown = 0;
    tx.textContent = '';
    D.typing = true;
    typeTimer = setInterval(() => {
      shown += 1;
      tx.textContent = full.slice(0, shown);
      if (shown >= full.length) { stopType(); more.classList.add('on'); }
    }, 16);
  }
  function stopType() {
    if (typeTimer) clearInterval(typeTimer);
    typeTimer = null;
    if (D) D.typing = false;
  }
  function tap() {
    if (!D) return;
    if (D.typing) {                          /* skip the reveal */
      stopType();
      dlgEl.querySelector('.dlg-text').textContent = D.lines[D.i];
      dlgEl.querySelector('.dlg-more').classList.add('on');
      return;
    }
    D.i += 1;
    if (D.i >= D.lines.length) closeDlg(true);
    else typeLine();
  }
  function closeDlg(fireCb) {
    stopType();
    const cb = D && D.cb;
    D = null;
    if (dlgEl) dlgEl.classList.remove('on');
    if (fireCb && cb) cb();
  }

  /* ── objective tracker ────────────────────────────────────────── */
  let hudHideT = null;
  function hud() {
    ensureDom();
    if (!hudEl) return;
    if (hudHideT) { clearTimeout(hudHideT); hudHideT = null; }
    if (S.step >= STEPS.length) {
      hudEl.innerHTML = '<span class="q-dot">✦</span>Tutorial complete';
      hudEl.classList.add('on');
      hudHideT = setTimeout(() => hudEl.classList.remove('on'), 5000);
    } else {
      hudEl.innerHTML = '<span class="q-dot">◆</span>';
      hudEl.appendChild(document.createTextNode(STEPS[S.step].goal));
      hudEl.classList.add('on');
    }
    placeToast();  /* the pill's height just changed — advance() places the
                      reward toast BEFORE re-rendering it, so an on-screen
                      toast must be re-anchored or it overlaps the new text */
  }

  /* ── toast (coach line / reward line) ─────────────────────────── */
  /* The top row belongs to persistent chrome, so the toast drops BELOW
     whatever occupies it — a centered toast in the row itself collides
     on narrow phones (at 360px the 166px "Received: 3x Potion" toast
     buried world.html's Bag button and the quest pill).
     - Combat attached: below the fight's HUD turn strip (#hud-turn,
       top-left) and its transient hint toast (#cbf is fixed inset:0, so
       iframe coords ARE page coords) — the lessons are ABOUT the fight,
       they must stay readable. Measured live (pollCombat re-calls this)
       so it tracks resize.
     - World view: below the minimap (#mmap, top-left), the settings
       gear (#hud-gear, top-right) and the #qhud quest pill.
     CSS top:8px remains only as the nothing-to-dodge fallback. */
  function placeToast() {
    if (!toastEl) return;
    let y = 0;
    if (CW) {
      try {
        const d = CW.document,
              bar = d.getElementById('hud-turn'), /* HUD turn strip     */
              hint = d.getElementById('toast');   /* fight's own hints  */
        if (bar)  y = bar.getBoundingClientRect().bottom;
        if (hint) y = Math.max(y, hint.getBoundingClientRect().bottom);
      } catch (e) {}
    } else {
      const mm = document.getElementById('mmap'),     /* minimap        */
            gear = document.getElementById('hud-gear');/* settings      */
      if (mm)   y = mm.getBoundingClientRect().bottom;
      if (gear) y = Math.max(y, gear.getBoundingClientRect().bottom);
      if (hudEl && hudEl.classList.contains('on'))
        y = Math.max(y, hudEl.getBoundingClientRect().bottom);
    }
    toastEl.style.top = y ? Math.round(y + 6) + 'px' : '';
  }
  let toastT = null;
  function toast(msg, ms) {
    ensureDom();
    if (!toastEl) return;
    placeToast();
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    if (toastT) { clearTimeout(toastT); toastT = null; }
    if (ms) toastT = setTimeout(toastHide, ms);
  }
  function toastHide() {
    if (toastT) { clearTimeout(toastT); toastT = null; }
    if (toastEl) toastEl.classList.remove('on');
  }

  return { STEPS, start, state, advance, reward, say, onChange,
           npc, currentFight, attachCombat, detachCombat, reset };
})();
