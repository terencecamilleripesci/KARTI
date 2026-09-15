/* ═══════════════════════════════════════════════════════════════════
   GAME — the thin playable layer over battle.js.

   THIS FILE DECIDES NOTHING. Every rule lives in battle.js, which has no
   DOM and an injected rng so it can be gated headlessly; this renders
   what that returns and collects taps. The split is deliberate: the
   rules are the part that must be provably right, and 137 checks already
   hold them. If a number looks wrong on screen, it is wrong in
   battle.js, not here.

   WHAT PHASE 0 IS FOR. One question, and the screens exist only to ask
   it:

       Does catching a new creature make the player want to CHANGE THEIR
       TEAM and take another fight?

   So the flow is the shortest path to that question: pick a starter →
   meet wild creatures → catch one → face a trainer whose type BEATS the
   usual starter. The trainer is the instrument. If players go and catch
   something to answer him, the loop works. If they grind the starter
   through, it does not, and no amount of content would fix it.

   THE WORLD IS TILED JSON. maps/*.json are authored in Tiled
   (`apt install tiled`) and read by overworld.js; this file owns the
   only requestAnimationFrame in the project and tears it down before a
   battle, so the world never ticks underneath one. Encounters come from
   walking into tall grass, warps join the maps into one connected
   world, and a `heal` object patches the party up.

   THE SPRITE FALLBACK IS A FEATURE. A creature draws its PixelLab sprite
   if the file is there and a coloured shape from data.js if it is not,
   so the loop is playable and judgeable BEFORE any art is bought. That
   is how the tactical prototype in the paused project was validated —
   "is it fun with coloured shapes?" — and it is why art is never on the
   critical path to a design decision.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function () {

  const D = window.DATA, B = window.BATTLE, OW = window.OVERWORLD;
  const el = document.getElementById('screen');
  const askEl = document.getElementById('ask');

  const SAVE = 'monstercatch.phase0.v1';

  /* ── state ────────────────────────────────────────────────────────
     Kept flat and JSON-able so the save is the state and there is no
     second representation to drift. */
  let S = null;

  /* ── WHO YOU ARE, CHOSEN BEFORE ANYTHING ELSE ─────────────────────
     The owner's instruction: male and female, and first. So this screen
     runs ahead of the starter choice and ahead of the world — you decide
     who is walking before you decide what walks with you.

     ONE POSE PER GENDER, not a wardrobe. That is his own rule from the
     paused project, verbatim in intent: "all characters must have
     identical pose, just woman and man, easy like that." Two walking
     sheets cover every player, which is also what keeps the art budget
     honest — a wardrobe is a sheet per option, per direction, per frame.

     Asked ONCE and then never again. It is stored in the save, so a
     returning player goes straight back to the world; only a wipe asks
     again. A game that re-asks who you are on every launch reads as
     having forgotten you. */
  const GENDERS = [
    { id: 'f', name: 'Woman', hue: 330 },
    { id: 'm', name: 'Man',   hue: 205 }
  ];

  function whoScreen() {
    askEl.textContent = 'Who walks the island?';
    el.innerHTML =
      '<div class="card"><p class="note" style="margin-top:0">' +
      'This is only how you look. It changes nothing about the creatures ' +
      'you can catch or the moves they learn.</p></div>' +
      GENDERS.map(g =>
        '<button class="who-one" data-id="' + esc(g.id) + '">' +
          '<span class="side" style="gap:12px">' +
            '<span class="mon"><i class="blob block" style="display:block;' +
              'background:hsl(' + g.hue + ' 46% 56%)"></i></span>' +
            '<span class="meta"><span class="nm">' + esc(g.name) + '</span>' +
            '<small style="color:var(--dim)">one pose, chosen once</small>' +
            '</span></span></button>').join('');
    bind({ '.who-one': e => {
      const id = e.currentTarget.dataset.id;
      S = fresh();
      S.who = (id === 'f') ? 'f' : 'm';
      save();
      pick();
    } });
  }

  function fresh() {
    /* JOURNEY LEVEL, not per-creature levels. One number for the player;
       every creature they own sits at it (battle.js relevels on gain).
       `reserves` holds catches beyond the party of three. */
    return { who: 'f', party: [], reserves: [], journey: D.START_LEVEL,
             xp: 0, active: 0, balls: 8, beatKeeper: false,
             seen: {}, caught: {}, swapsMade: 0, threwAt: 0 };
  }

  /* SAVE AFTER EVERY COMMITTED CHANGE. A caught creature that vanishes on
     reload is the single most damaging bug this genre has, so the save
     happens at the moment of commit and never on a timer. */
  function save() {
    /* WHERE YOU ARE STANDING IS PART OF THE SAVE. Without it a reload
       drops you back at the town spawn, which reads as the game losing
       your progress even though the party survived. */
    try {
      if (S && OW.state.map) {
        S.where = { map: OW.state.map.id,
                    x: OW.state.hero.x, y: OW.state.hero.y };
      }
      localStorage.setItem(SAVE, JSON.stringify(S));
    } catch (e) {}
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE));
      if (!d || !Array.isArray(d.party)) return null;
      /* Re-derive nothing: a stored creature IS the creature. But clamp
         what came off the wire — this is localStorage and the player can
         edit it. */
      d.who = (d.who === 'm') ? 'm' : 'f';
      d.reserves = Array.isArray(d.reserves) ? d.reserves : [];
      d.journey = Math.max(1, Math.min(D.MAX_LEVEL, d.journey | 0 || D.START_LEVEL));
      d.xp = Math.max(0, d.xp | 0);
      for (const c of d.party.concat(d.reserves)) {
        if (!D.SPECIES[c.species]) return null;
        c.level = Math.max(1, Math.min(D.MAX_LEVEL, c.level | 0));
        c.hpMax = Math.max(1, c.hpMax | 0);
        c.hp = Math.max(0, Math.min(c.hpMax, c.hp | 0));
        c.mod = { atk: 0, spe: 0 };
        c.cond = { settled: 0, exposed: 0, guard: 0, relayShield: 0 };
        c.cd = {}; c.mendUsed = false;
        c.library = D.libraryFor(c.type || D.SPECIES[c.species].type, c.level);
        c.moves = (c.moves || []).filter(m => !!D.MOVES[m]).slice(0, 4);
        if (!c.moves.length) c.moves = B.equipDefault(c.library);
      }
      d.balls = Math.max(0, Math.min(99, d.balls | 0));
      return d;
    } catch (e) { return null; }
  }

  /* ── little helpers ───────────────────────────────────────────────*/
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* sprite if present, shape if not — see the header note.

     NO `onerror` ATTRIBUTE, and that is the fix for a real bug rather
     than a style preference. The first version built the fallback markup
     INTO an onerror handler, so the attribute value contained the
     fallback's own double quotes, closed itself early, and leaked `'">`
     into the visible text of every creature button. Escaping HTML for
     an attribute that contains HTML for a script that writes HTML is
     three levels of quoting and it was always going to break.

     Both live in the same grid cell and the SHAPE STARTS HIDDEN;
     paintMons() below reveals it only if the image fails. Stacking the
     shape behind a loaded sprite was the intermediate version and it was
     also wrong — sprites are mostly transparent, so the shape showed
     through. Exactly one of the two is ever visible. */
  /* WHICH SPRITES EXIST IS A LOOKUP, NOT A ROUND TRIP.
     This used to emit an <img> for every creature and let the 404 reveal
     that the art was not drawn yet. With a roster whose art does not
     exist that was ~25 failed requests per render — console noise, and
     real dropped requests on a phone. art/sprites.json is generated from
     the directory by tools/mkcreature.py, so it cannot drift from what
     is actually there. No manifest, or no entry: draw the shape and ask
     for nothing. */
  let sprites = {};

  function monHTML(c, which) {
    const sp = D.SPECIES[c.species];
    const art = D.ART[sp.type] || { shape: 'round', hue: 200 };
    const blob = '<i class="blob ' + esc(art.shape || 'round') +
      '" style="background:hsl(' + (art.hue | 0) + ' 62% 52%);display:block"></i>';
    const have = sprites[c.species];
    if (!have || have.indexOf(which) < 0)
      return '<div class="mon">' + blob + '</div>';
    return '<div class="mon">' +
      blob.replace(';display:block', '') +
      '<img src="art/' + esc(c.species) + '-' + esc(which) + '.png" alt="' +
        esc(sp.name) + '">' +
      '</div>';
  }

  /* THE SHAPE IS HIDDEN BY DEFAULT AND REVEALED ONLY ON FAILURE.
     Stacking it behind the sprite fixed the quoting bug but created a
     visible one: a sprite is mostly transparent, so the blob showed
     THROUGH it — an orange lozenge behind the fox in every party slot.
     Hiding the sprite and showing the shape on `error` is the only
     arrangement where exactly one of them is ever visible.

     Handlers are attached here rather than written as inline attributes
     because that is what caused the first bug. Called after every
     render; `complete` covers images the cache served before we got
     here, which is the usual case on the second screen. */
  function paintMons() {
    for (const img of el.querySelectorAll('.mon img')) {
      const blob = img.parentNode.querySelector('.blob');
      const fail = () => {
        img.style.display = 'none';
        if (blob) blob.style.display = 'block';
      };
      if (img.complete) { if (!img.naturalWidth) fail(); continue; }
      img.addEventListener('error', fail);
    }
  }

  function barClass(c) {
    const f = c.hp / c.hpMax;
    return f <= 0.2 ? 'bar crit' : (f <= 0.5 ? 'bar low' : 'bar');
  }

  function sideHTML(c, which, mine) {
    return '<div class="side ' + (mine ? 'me' : 'foe') + '">' +
      monHTML(c, which) +
      '<div class="meta"><div class="nm">' + esc(c.name) +
        '<span class="lv">Lv ' + c.level + '</span>' +
        '<span class="pill ' + esc(c.type) + '">' + esc(c.type) + '</span></div>' +
      '<div class="' + barClass(c) + '"><i style="width:' +
        Math.max(0, 100 * c.hp / c.hpMax) + '%"></i></div>' +
      '<div class="hpnum">' + c.hp + ' / ' + c.hpMax + '</div></div></div>';
  }

  function logHTML(lines) {
    return '<div id="log">' + lines.slice(-40).map(
      l => '<p' + (/Caught|evolved|fainted|level/.test(l) ? ' class="big"' : '') +
           '>' + esc(l) + '</p>').join('') + '</div>';
  }

  /* bind() is called at the end of every screen, so it is also the one
     place guaranteed to run after each render — paintMons rides along
     rather than being a line every screen has to remember. */
  function bind(map) {
    for (const sel in map) {
      const n = el.querySelectorAll(sel);
      for (const b of n) b.addEventListener('click', map[sel]);
    }
    paintMons();
  }

  const active = () => S.party[S.active] || S.party[0];
  const firstFit = () => S.party.findIndex(c => c.hp > 0);

  /* ── screen: pick a starter ───────────────────────────────────────*/
  function pick() {
    askEl.textContent = 'Pick one. The others can be caught later.';
    /* THE RING, GENERATED FROM THE DATA. This was hardcoded as
       "ember → bloom → tide → ember" and survived the redesign to six
       types — visible on screen, describing a chart the game no longer
       had. Copy that states a rule must be built from the rule. */
    const ring = (() => {
      const out = [D.TYPES[0]];
      for (let i = 0; i < D.TYPES.length; i++)
        out.push(D.BEATS[out[out.length - 1]]);
      return out.join(' → ');
    })();
    el.innerHTML = '<div class="card"><p class="note" style="margin-top:0">' +
      'Six materials, each strong against one and weak to one:<br>' +
      esc(ring) + '.</p></div>' +
      D.STARTERS.map(id => {
        const sp = D.SPECIES[id];
        return '<button class="pick-one" data-id="' + esc(id) + '">' +
          '<span class="side" style="gap:12px">' + monHTML({ species: id }, 'front') +
          '<span class="meta"><span class="nm">' + esc(sp.name) +
          ' <span class="pill ' + esc(sp.type) + '">' + esc(sp.type) + '</span></span>' +
          '<small style="color:var(--dim)">beats ' + esc(D.BEATS[sp.type]) +
          ', loses to ' + esc(Object.keys(D.BEATS).find(k => D.BEATS[k] === sp.type)) +
          '</small></span></span></button>';
      }).join('');
    bind({ '.pick-one': e => {
      const id = e.currentTarget.dataset.id;
      /* S already exists — whoScreen() made it. Creating it again here
         would throw the gender choice away one screen after it was
         made, which is the kind of bug nobody reports because it looks
         like the game simply ignored you. */
      if (!S) { S = fresh(); }
      S.party.push(B.make(id, D.START_LEVEL));
      S.caught[id] = 1; S.seen[id] = 1;
      save();
      if (OW.state.map) world('You chose ' + D.SPECIES[id].name + '. The steps lead north.');
      else hub('You chose ' + D.SPECIES[id].name + '.');
    } });
  }

  /* ── screen: THE WORLD ────────────────────────────────────────────
     Maps are Tiled JSON, loaded once at boot. This screen owns the only
     requestAnimationFrame in the project: overworld.js exposes tick(dt)
     and never schedules itself, so the same movement code that runs here
     is what tools/checkmap.js walks on a virtual clock.

     The loop is torn down whenever we leave — a battle must not have the
     world ticking underneath it, which is how a second encounter fires
     while you are already in one. */
  let raf = 0, lastT = 0, held = null, sheet = null;

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; held = null;
  }

  function world(msg) {
    stopLoop();
    if (S && OW.setWho) OW.setWho(S.who);
    askEl.textContent = msg || 'Walk into the tall grass.';
    const m = OW.state.map;
    el.innerHTML =
      '<div id="stage"><canvas id="cv"></canvas></div>' +
      '<div class="hudrow"><span class="where">' +
        esc(m ? m.id : '') + (m && m.zone ? ' · wild creatures here' : '') +
      '</span><button class="menu">☰ Menu</button></div>' +
      '<div class="dpad">' +
        '<button class="d-up" aria-label="up">▲</button>' +
        '<button class="d-left" aria-label="left">◀</button>' +
        '<button class="d-mid" disabled></button>' +
        '<button class="d-right" aria-label="right">▶</button>' +
        '<button class="d-down" aria-label="down">▼</button>' +
      '</div>';

    const cv = document.getElementById('cv');
    const stage = document.getElementById('stage');
    const g = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    /* 3:2 viewport — wide enough to read the road ahead, short enough to
       leave room for the pad on a 844px-tall phone */
    const cssW = stage.clientWidth || 360;
    const cssH = Math.round(cssW * 0.66);
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);

    /* PRESS-AND-HOLD WALKS. pointerdown/up rather than click, so holding
       a direction keeps moving — a tap-per-tile world feels broken. */
    const pressBind = (sel, dir) => {
      const b = el.querySelector(sel);
      const on = e => { e.preventDefault(); held = dir; OW.walk(dir); };
      const off = () => { if (held === dir) held = null; };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    };
    pressBind('.d-up', 'up'); pressBind('.d-down', 'down');
    pressBind('.d-left', 'left'); pressBind('.d-right', 'right');
    el.querySelector('.menu').addEventListener('click', () => { stopLoop(); hub(); });

    /* keyboard too, because testing on a desktop should not need a mouse */
    const KEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left',
                  ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    if (!world._keys) {
      world._keys = true;
      window.addEventListener('keydown', e => {
        const d = KEY[e.key]; if (d && raf) { held = d; OW.walk(d); }
      });
      window.addEventListener('keyup', e => {
        if (KEY[e.key] === held) held = null;
      });
    }

    lastT = 0;
    const frame = (t) => {
      if (!raf) return;
      const dt = lastT ? Math.min(50, t - lastT) : 16;
      lastT = t;
      if (held) OW.walk(held);
      const ev = OW.tick(dt);
      OW.draw(g, cssW, cssH, dpr, sheet);
      if (ev) {
        if (ev.kind === 'encounter') { stopLoop(); return wildFrom(ev.zone); }
        if (ev.kind === 'heal') {
          B.healAll(S); save();
          const w = el.querySelector('.where');
          if (w) w.textContent = 'Everyone is patched up.';
        }
        if (ev.kind === 'warp') {
          const w = el.querySelector('.where');
          const mm = OW.state.map;
          if (w) w.textContent = mm.id + (mm.zone ? ' · wild creatures here' : '');
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  function wildFrom(zone) {
    const i = firstFit();
    if (i < 0) { B.healAll(S); save();
      return world('Everyone had fainted — you woke up patched up.'); }
    S.active = i;
    const wild = B.rollEncounter(zone || 'a02', Math.random, S.journey);
    S.seen[wild.species] = 1;
    foeName = '';
    bt = B.startBattle(S.party, [wild],
      { wild: true, rand: Math.random, journey: S.journey });
    bt.log.push('A wild ' + wild.name + ' appeared!');
    battle();
  }

  /* ── screen: the hub ──────────────────────────────────────────────*/
  function hub(msg) {
    askEl.textContent = S.beatKeeper
      ? 'Keeper beaten. Did you swap to do it?'
      : 'Does catching something make you want to change your team?';
    const anyFit = firstFit() >= 0;
    el.innerHTML =
      '<div class="card">' + partyHTML() + '</div>' +
      '<div class="card">' +
        (msg ? '<p class="note" style="margin-top:0">' + esc(msg) + '</p>' : '') +
        '<button class="wide hot go-world"' + (anyFit ? '' : ' disabled') + '>' +
          'Back to the world</button>' +
        '<button class="wide go-keeper"' +
          (anyFit && !S.beatKeeper ? '' : ' disabled') + '>' +
          (S.beatKeeper ? 'Pan Keeper Sciberras — beaten' :
            'Challenge Pan Keeper Sciberras') + '</button>' +
        '<button class="wide go-heal">Rest (heal the party)</button>' +
      '</div>' +
      '<div class="card"><p class="note" style="margin-top:0">' +
        'Journey level <b>' + S.journey + '</b> · clasps <b>' + S.balls +
        '</b><br>caught ' + Object.keys(S.caught).length + ' of ' +
        Object.keys(D.SPECIES).filter(k => !D.SPECIES[k].fixture).length +
        ' · reserves ' + (S.reserves || []).length +
        ' · swaps made ' + S.swapsMade +
      '</p><button class="wide restart">Start over</button></div>';
    bind({
      '.go-world': () => world(),
      '.go-keeper': () => trainer('keeper'),
      '.go-heal': () => { B.healAll(S); save(); hub('Everyone is patched up.'); },
      '.restart': () => { if (confirm('Wipe this run and pick again?')) {
        try { localStorage.removeItem(SAVE); } catch (e) {}
        S = null; pick(); } }
    });
  }

  function partyHTML(onclickClass) {
    if (!S.party.length) return '<p class="note">No creatures.</p>';
    /* party only — reserves are listed separately, because a swap in
       battle can only reach the party of three (DESIGN.md §2: reserves
       outside the party cannot join an ongoing encounter) */
    return '<div class="party">' + S.party.map((c, i) => {
      const tag = onclickClass ? 'button' : 'div';
      const cls = 'slot' + (i === S.active ? ' out' : '') +
                  (c.hp <= 0 ? ' faint' : '');
      return '<' + tag + ' class="' + cls + (onclickClass ? ' ' + onclickClass : '') +
        '" data-i="' + i + '"' +
        (onclickClass && (c.hp <= 0 || i === S.active) ? ' disabled' : '') + '>' +
        monHTML(c, 'front') +
        '<div style="font-weight:600">' + esc(c.name) + '</div>' +
        '<div style="color:var(--dim)">Lv ' + c.level + ' · ' + c.hp + '/' + c.hpMax +
        '</div></' + tag + '>';
    }).join('') + '</div>';
  }

  /* ── battles ──────────────────────────────────────────────────────*/
  let bt = null, foeName = '';


  function trainer(id) {
    const t = D.TRAINERS[id];
    const i = firstFit();
    if (i < 0) return hub('Nobody can fight. Rest first.');
    S.active = i;
    foeName = t.name;
    /* the encounter owns the whole enemy roster — battle.js queues the
       replacements itself, so there is no second battle object per foe */
    bt = B.startBattle(S.party, t.team.map(m => B.make(m.species, m.level)),
      { wild: false, rand: Math.random, journey: S.journey });
    bt.log.push(t.name + ' steps up!');
    battle();
  }

  function battle() {
    const mine = bt.mine, foe = bt.foe;
    const chance = bt.wild ? B.catchChance(foe) : 0;
    const canThrow = bt.wild && S.balls > 0;
    const bench = S.party.filter(c => c.hp > 0 && c !== mine);

    el.innerHTML =
      '<div class="card fight">' +
        sideHTML(foe, 'front', false) +
        intentHTML() +
        sideHTML(mine, 'back', true) +
      '</div>' +
      logHTML(bt.log) +
      '<div class="card">' + movesHTML(mine, foe) +
        '<div class="row" style="margin-top:8px">' +
          '<button class="throw' + (chance >= 0.5 ? ' hot' : '') + '"' +
            (canThrow ? '' : ' disabled') + '>' +
            (bt.wild ? 'Catch · ' + Math.round(chance * 100) + '%' +
              (chance >= 0.5 ? '<br><small>Good chance</small>' : '') +
              '<br><small>' + S.balls + ' clasps</small>'
            : 'No catching') + '</button>' +
          '<button class="swap"' + (bench.length ? '' : ' disabled') + '>' +
            'Swap<br><small>costs the turn</small></button>' +
        '</div>' +
        '<button class="wide run" style="margin-top:8px">' +
          (bt.wild ? 'Slip away' : 'Step back') + '</button>' +
      '</div>';

    bind({
      '.mv-btn': e => turn({ kind: 'move', move: e.currentTarget.dataset.mv,
                             ally: pickAlly(e.currentTarget.dataset.mv) }),
      '.throw': () => { S.balls--; S.threwAt++; save();
                        turn({ kind: 'catch' }); },
      '.swap': () => swapScreen(),
      '.run': () => turn({ kind: 'run' })
    });
  }

  /* THE ENEMY'S INTENT, SHOWN BEFORE YOU CHOOSE, AND LOCKED.
     This is the design's main departure from the genre: you are told
     what is coming, including a heavy move's damage range, so guard,
     debuff and swap decisions are readable rather than a guessing
     game. battle.js picks it at the start of the exchange and refuses
     to change it once shown. */
  function intentHTML() {
    const it = bt.intent;
    if (!it) return '';
    const r = it.range;
    return '<p class="note" style="margin:2px">' +
      (foeName ? esc(foeName) + ' · ' : '') +
      '<b>' + esc(it.name) + '</b>' +
      (it.heavy ? ' <span class="eff dn">heavy</span>' : '') +
      (r ? ' — about ' + r.lo + '–' + r.hi + ' damage' +
           (r.lo >= bt.mine.hp ? ' <span class="eff dn">could finish you</span>' : '')
         : ' — no damage') +
      '</p>';
  }

  /* An ally-targeting move needs a target. With a party of three the
     sensible default is the most hurt living member, which is what a
     player means nine times out of ten; a chooser comes later. */
  function pickAlly(moveId) {
    const m = D.MOVES[moveId];
    if (!m) return null;
    if (m.target === 'reserve')
      return S.party.find(c => c.hp > 0 && c !== bt.mine) || null;
    if (m.target !== 'ally') return null;
    let worst = null;
    for (const c of S.party)
      if (c.hp > 0 && (!worst || c.hp / c.hpMax < worst.hp / worst.hpMax)) worst = c;
    return worst;
  }

  /* Move buttons carry the damage RANGE, not a power number: a range is
     what lets the player compare an option against the shown intent and
     the foe's remaining HP. Cooldowns grey out, and Basic never does. */
  function movesHTML(mine, foe) {
    const legal = B.legalMoves(mine);
    return '<div class="grid2">' + mine.moves.map(id => {
      const m = D.MOVES[id];
      if (!m) return '';
      const isLegal = legal.indexOf(id) >= 0;
      const cd = mine.cd[id] | 0;
      let hint = '', sub;
      if (m.power) {
        const r = B.damageRange(mine, foe, id);
        sub = r.lo + '–' + r.hi + ' dmg';
        if (r.mult > 1) hint = '<span class="eff up">strong</span>';
        else if (r.mult < 1) hint = '<span class="eff dn">resisted</span>';
        /* THE KNOCKOUT WARNING — DESIGN.md §6. Measured while playing:
           the naive line ("always use the safe move") cannot out-damage
           a bulky same-level foe and loses the race, while "hit hard,
           then go safe for the last hit" wins comfortably. That is a
           good decision to have in the game, but only if the player can
           SEE the moment it flips. On a wild target this warning is
           what marks that moment, so nobody learns it by losing a catch
           they had earned. */
        if (bt.wild && r.hi >= foe.hp && !m.nonlethal)
          hint = '<span class="eff dn">may KO</span>';
        if (m.nonlethal) hint = '<span class="eff up">safe</span>';
      } else {
        sub = D.EFFECTS[m.effect] || 'utility';
        hint = '<span class="eff">' + esc(m.slot) + '</span>';
      }
      return '<button class="mv-btn" data-mv="' + esc(id) + '"' +
        (isLegal ? '' : ' disabled') + '>' +
        '<span class="mv"><span>' + esc(m.name) +
        '<br><small>' + esc(sub) +
        (cd > 0 ? ' · ready in ' + cd : '') + '</small></span>' +
        hint + '</span></button>';
    }).join('') + '</div>';
  }

  function swapScreen() {
    el.innerHTML = '<div class="card"><p class="note" style="margin-top:0">' +
      'Send out which one? Swapping costs the turn, and ' +
      esc(bt.foe.name) + ' will hit whoever arrives.</p>' +
      partyHTML('swap-to') + '</div>' +
      '<button class="wide back">Back</button>';
    bind({
      '.swap-to': e => {
        const i = +e.currentTarget.dataset.i;
        S.active = i; S.swapsMade++; save();
        turn({ kind: 'swap', to: S.party[i] });
      },
      '.back': () => battle()
    });
  }

  function turn(action) {
    B.takeTurn(bt, action);
    /* battle.js owns forced replacements and the enemy roster queue, so
       there is nothing to re-drive here — only terminal results. */
    S.active = Math.max(0, S.party.indexOf(bt.mine));

    if (!bt.over) { save(); return battle(); }

    if (bt.over === 2) {
      /* CAUGHT. battle.js deliberately did not touch the party; commit
         once, reserve-first, then save immediately. A caught creature
         that vanishes on reload is the worst bug this genre has. */
      const got = B.commitCatch(S, bt.caught, S.journey);
      save();
      const where = S.party.indexOf(got) >= 0 ? 'joined your party'
                                              : 'went to your reserves';
      return after(got.name + ' ' + where + ' — level ' + got.level +
                   ', fully rested.');
    }
    if (bt.over === 3) { save(); return after('You slipped away.'); }

    if (bt.over === 1) {
      const gained = B.xpFromWin(bt.foe);
      const levels = B.gainXp(S, gained);
      if (levels) bt.log.push('The journey reached level ' + S.journey + '!');
      /* evolution is OFFERED at the threshold, never forced */
      for (const c of S.party.concat(S.reserves))
        if (B.canEvolve(c, S.journey)) {
          const was = c.name, now = B.evolve(c, S.journey);
          if (now) bt.log.push(was + ' became ' + now + '!');
        }
      if (foeName) S.beatKeeper = true;
      save();
      return after(foeName ? 'You beat ' + foeName + '!' : null);
    }

    save();
    return after('Everyone is spent. You walk back to the pans.');
  }

  function after(msg) {
    const lines = bt.log.slice();
    el.innerHTML = '<div class="card fight">' +
        sideHTML(bt.mine, 'back', true) + '</div>' +
      logHTML(lines) +
      '<button class="wide hot done" style="margin-top:10px">Continue</button>';
    bind({ '.done': () => { if (OW.state.map) world(msg); else hub(msg); } });
  }

  /* ── boot ─────────────────────────────────────────────────────────
     Maps and the tileset are fetched BEFORE the first screen, because a
     world that pops in after the player has already tapped something is
     worse than a moment of nothing. If they fail to load the game still
     runs — you just get the menu-only flow, which is exactly Phase 0
     and still answers the question. */
  function boot() {
    S = load();
    const start = () => {
      if (!S) return whoScreen();          /* who, before anything */
      if (!S.party.length) return pick();  /* chose who, not yet what */
      if (OW.state.map) return world('Welcome back.');
      hub('Welcome back.');
    };

    /* the sprite manifest first — it decides whether any <img> is even
       emitted, so it must land before the first render */
    fetch('art/sprites.json').then(r => r.json())
      .then(j => { sprites = j || {}; })
      .catch(() => { sprites = {}; });

    /* the atlas and ITS LAYOUT — the layout says where the autotile
       edge banks live, so the renderer reads it instead of guessing */
    sheet = { ready: false, img: new Image(), layout: null };
    fetch('art/tiles.json').then(r => r.json())
      .then(j => { sheet.layout = j; }).catch(() => {});
    sheet.img.onload = () => { sheet.ready = true; };
    sheet.img.src = 'art/tiles.png';

    const want = ['a01', 'a02', 'a03'];
    Promise.all(want.map(id =>
      fetch('maps/' + id + '.json').then(r => r.json())
        .then(j => { OW.put(id, j); return id; })
        .catch(e => { console.warn('map ' + id + ' failed:', e); return null; })
    )).then(got => {
      const live = got.filter(Boolean);
      if (live.length) {
        /* resume where they were standing, if it is still a real place */
        const whereMap = (S && S.where && OW.maps[S.where.map]) ? S.where.map : 'a01';
        const atXY = (S && S.where && S.where.map === whereMap)
          ? { x: S.where.x, y: S.where.y } : null;
        OW.enter(whereMap, atXY);
      }
      start();
    });
  }
  boot();

})();
