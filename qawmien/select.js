/* ═══════════════════════════════════════════════════════════════════
   SELECT — class selection, refactored into ONE reusable renderer.

   window.SELECTUI:
     SELECTUI.bind(scope, opts)   wire the picker UI inside `scope`
                                  (an element/document that already
                                  contains the select markup ids)
     SELECTUI.openOverlay(opts)   build the same UI as an in-world
                                  modal (the reincarnation moment on
                                  world.html) — generates the markup,
                                  traps focus, Esc/✕ cancels
   select.html keeps working unchanged: this file detects its static
   markup and binds it with default behaviour (save + toast).

   ── THE localStorage CONTRACT ─────────────────────────────────────
   Key:   'tactics.hero.v1'
   Value: JSON string:
     {
       v: 1,                       // contract version
       classId: 'warden',          // one of CLASSES.LIST[].id
       gender:  'm' | 'f',
       sheet:   'warden-m',        // CLASSES.byId(classId).look[gender].sheet
                                   // → art/<sheet>-sheet.png / -dir8.png
       name:    'Warden',          // display convenience only
       savedAt: '2026-08-31T12:00:00.000Z'
     }
   player.js (window.HERO) EXTENDS this payload with optional fields
   (level, xp, hp, items, equip) — see the header of player.js. This
   file's standalone save MERGES over any existing payload so those
   fields survive re-picking a class on select.html. Readers still
   treat classId+gender as truth and re-derive everything else from
   window.CLASSES. Absent or unparsable key = no choice made yet.

   ── ART FALLBACK ──────────────────────────────────────────────────
   All ten sheets exist; this path is defensive. If a sheet 404s, the
   other gender's sheet for the SAME class is drawn as a dark
   silhouette with an honest caption — the choice still saves, the
   screen never shows a broken image.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

window.SELECTUI = (function () {

  const KEY = 'tactics.hero.v1';

  /* ── element identity: colour + a consistent stroke icon set ──── */
  const ICON = {
    earth: '<path d="M3 19 9.5 8l3.1 5 2.6-3.6L21 19H3z"/>',
    fire : '<path d="M12 3c.6 3.8-3.8 5.4-3.8 9.3a3.8 3.8 0 0 0 7.6 0c0-1.4-.7-2.5-.7-2.5 1.7.8 2.9 2.4 2.9 4.3A6 6 0 0 1 6 14.2C6 8.9 11 7.6 12 3z"/>',
    water: '<path d="M12 3s6 6.7 6 10.6a6 6 0 0 1-12 0C6 9.7 12 3 12 3z"/>',
    air  : '<path d="M3 8h10.5a2.4 2.4 0 1 0-2.4-2.4M3 12h14.5a2.8 2.8 0 1 1-2.8 2.8M3 16h7.5"/>'
  };
  const ELEM = {
    earth: { label: 'Earth', color: '#C9995C' },
    fire : { label: 'Fire',  color: '#FF7A45' },
    water: { label: 'Water', color: '#4FA9E8' },
    air  : { label: 'Air',   color: '#57D9A3' }
  };
  function icon(elem, size) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
      '" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICON[elem] + '</svg>';
  }
  const STAT_LABEL = { vit: 'Vitality', wis: 'Wisdom', str: 'Strength',
                       int: 'Intellect', cha: 'Charm', agi: 'Agility' };
  const STAT_MAX = 24;   /* the largest spread value any class starts with */

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                            .replace(/"/g, '&quot;');

  function rangeText(sp) {
    if (sp.max === 0) return 'self';
    if (sp.min === sp.max) return 'range ' + sp.min;
    return 'range ' + sp.min + '–' + sp.max;
  }
  function fxTags(sp) {
    const t = [];
    if (sp.dmg)    t.push(sp.dmg[0] + '–' + sp.dmg[1] + ' dmg');
    if (sp.heal)   t.push('heals ' + sp.heal[0] + '–' + sp.heal[1]);
    if (sp.shield) t.push('shield');
    if (sp.aoe)    t.push('area');
    if (sp.pull)   t.push('drags ' + sp.pull);
    if (sp.push)   t.push('knocks ' + sp.push);
    if (sp.tp)     t.push('teleport');
    if (sp.trap)   t.push('trap');
    if (sp.summon) t.push('summons');
    if (sp.swap)   t.push('swap places');
    if (sp.los === false && sp.max > 0) t.push('no line of sight');
    return t;
  }

  /* ── the select markup, generated once for surfaces that lack it
     (select.html ships the same structure statically) ────────────── */
  function appMarkup(o) {
    return (
      '<header id="hd"><h1>' + esc(o.title) + '</h1>' +
        '<p>' + esc(o.subtitle) + '</p></header>' +
      '<section id="stageWrap">' +
        '<div id="glow" aria-hidden="true"></div>' +
        '<button id="stage" type="button" aria-label="Play this champion’s attack animation">' +
          '<canvas id="cv" aria-hidden="true"></canvas></button>' +
        '<p id="stageNote" hidden></p>' +
        '<div id="genderRow" role="group" aria-label="Choose your champion’s gender">' +
          '<button class="gbtn" type="button" data-g="m" aria-pressed="true">Male</button>' +
          '<button class="gbtn" type="button" data-g="f" aria-pressed="false">Female</button>' +
        '</div></section>' +
      '<section id="meta"><div id="nameRow"><h2 id="clsName"></h2>' +
        '<span id="elemBadge"></span><span id="roleBadge"></span></div>' +
        '<p id="tagline"></p></section>' +
      '<section id="info"><p id="feel"></p>' +
        '<div id="pools" aria-label="Starting resources"></div>' +
        '<div id="bars" aria-label="Stat spread"></div>' +
        '<h3 class="secHd">Spells</h3><ul id="spells"></ul>' +
        '<div id="infoFade" aria-hidden="true"></div></section>' +
      '<nav id="dock"><div id="rail" role="group" aria-label="Choose a class"></div>' +
        '<button id="confirm" type="button">Begin</button></nav>' +
      '<div id="toast" role="status" aria-live="polite"></div>');
  }

  /* ════════════════════════════════════════════════════════════════
     bind(scope, opts) — all picker behaviour, scoped.
       opts.initial   {classId, gender} starting selection (else the
                      saved choice, else warden/m)
       opts.verb      confirm button verb ('Begin as' | 'Awaken as')
       opts.onConfirm (payload) => {}  replaces the default save
     returns { destroy(), get selection() }
     ════════════════════════════════════════════════════════════════ */
  function bind(scope, opts) {
    opts = opts || {};
    const C = window.CLASSES, SP = window.SPRITE;
    const $ = id => scope.querySelector('#' + id);
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const VERB = opts.verb || 'Begin as';
    let alive = true;

    /* ── state ──────────────────────────────────────────────────── */
    let sel = { classId: C.LIST[0].id, gender: 'm' };
    if (opts.initial && C.byId(opts.initial.classId)) {
      sel = { classId: opts.initial.classId,
              gender: opts.initial.gender === 'f' ? 'f' : 'm' };
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && C.byId(saved.classId))
          sel = { classId: saved.classId, gender: saved.gender === 'f' ? 'f' : 'm' };
      } catch (e) { /* no saved choice — defaults stand */ }
    }

    /* ── sheet cache: one SPRITE.make per file, spawn per use ───── */
    const SHEETS = {};                        /* key → {status, base} */
    function loadSheet(key, cb) {
      let rec = SHEETS[key];
      if (rec) {
        if (rec.status === 'loading') rec.waiters.push(cb); else cb(rec);
        return;
      }
      rec = SHEETS[key] = { status: 'loading', base: null, waiters: [cb] };
      const done = st => { rec.status = st;
        rec.waiters.splice(0).forEach(f => f(rec)); };
      rec.base = SP.make('art/' + key + '-sheet.png', {
        cols: 6, rows: 4,
        onready: () => done('ok'),
        onerror: () => done('missing')
      });
    }

    /* ── the stage actor ────────────────────────────────────────── */
    const cv = $('cv'), ctx = cv.getContext('2d');
    const off = document.createElement('canvas');   /* silhouette pass */
    let actor = null, silhouette = false, seq = 0, booted = false;

    function setActor(cls, gender, playIntro) {
      const want = cls.look[gender].sheet;
      const my = ++seq;
      actor = null; silhouette = false;
      $('stageNote').hidden = true;
      loadSheet(want, rec => {
        if (my !== seq || !alive) return;           /* user moved on */
        if (rec.status === 'ok') {
          mount(rec.base, false, playIntro);
        } else {
          /* honest fallback: the twin's sheet as a silhouette */
          const alt = cls.look[gender === 'm' ? 'f' : 'm'].sheet;
          loadSheet(alt, rec2 => {
            if (my !== seq || !alive) return;
            if (rec2.status === 'ok') {
              mount(rec2.base, true, false);
              const note = $('stageNote');
              note.textContent = (gender === 'f' ? 'Her' : 'His') +
                ' art is still being painted — here’s the silhouette. ' +
                'Your choice still counts.';
              note.hidden = false;
            }
          });
        }
      });
    }
    function mount(base, sil, playIntro) {
      actor = SP.spawn(base);
      silhouette = sil;
      SP.play(actor, 'idle', true);
      if (REDUCED) actor.frame = (actor.stand && actor.stand[0]) || 0;
      else if (playIntro) SP.play(actor, 'attack', true);
    }

    /* ── canvas: DPR-aware sizing, feet-on-baseline draw ────────── */
    let dpr = 1, cw = 0, ch = 0;
    function fit() {
      const r = $('stage').getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      cw = Math.round(r.width); ch = Math.round(r.height);
      cv.width = cw * dpr; cv.height = ch * dpr;
      off.width = cv.width; off.height = cv.height;
    }
    addEventListener('resize', fit);

    function drawFrame() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      if (!actor || !actor.ready) return;
      const k = (ch * 0.94) / actor.ch;             /* fill the stage */
      const x = cw / 2, y = ch - 4;
      let ok;
      if (silhouette) {
        const g = off.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, cw, ch);
        ok = SP.draw(g, actor, x, y, k, false);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = '#241f3d';
        g.fillRect(0, 0, cw, ch);
        g.globalCompositeOperation = 'source-over';
        ctx.drawImage(off, 0, 0, cv.width, cv.height, 0, 0, cw, ch);
      } else {
        ok = SP.draw(ctx, actor, x, y, k, false);
      }
      if (ok && !booted) {                          /* headless boot probe */
        booted = true;
        document.documentElement.setAttribute('data-boot', 'sprites-drawing');
      }
    }

    let last = performance.now();
    function tick(t) {
      if (!alive) return;
      const dt = Math.min(100, t - last); last = t;
      if (actor) {
        const idling = actor.clip === 'idle';
        if (!(REDUCED && idling)) SP.step(actor, dt);
        if (actor.done && !idling) {
          SP.play(actor, 'idle', true);
          if (REDUCED) actor.frame = (actor.stand && actor.stand[0]) || 0;
        }
      }
      drawFrame();
      requestAnimationFrame(tick);
    }

    /* ── render: identity, feel, numbers, spells ────────────────── */
    function renderClass() {
      const cls = C.byId(sel.classId);
      const el = ELEM[cls.element];

      /* element colour drives glow, badge, key stat */
      const root = document.documentElement.style;
      root.setProperty('--elc', el.color);
      const r = parseInt(el.color.slice(1, 3), 16),
            g = parseInt(el.color.slice(3, 5), 16),
            b = parseInt(el.color.slice(5, 7), 16);
      root.setProperty('--elc-soft', 'rgba(' + r + ',' + g + ',' + b + ',.26)');
      root.setProperty('--elc-line', 'rgba(' + r + ',' + g + ',' + b + ',.55)');

      $('clsName').textContent = cls.name;
      $('elemBadge').className = 'badge';
      $('elemBadge').innerHTML = icon(cls.element, 14) + '<i>' + el.label +
        (cls.secondary ? ' / ' + ELEM[cls.secondary].label : '') + '</i>';
      $('roleBadge').className = 'badge';
      $('roleBadge').textContent = cls.role;
      $('tagline').textContent = '“' + cls.tagline + '”';
      $('feel').textContent = cls.desc;

      $('pools').innerHTML =
        '<span class="pool hp"><b>' + C.maxHp(cls, cls.stats, 1) +
          '</b><i>HEALTH</i></span>' +
        '<span class="pool ap"><b>' + cls.base.ap +
          '</b><i>ACTION</i></span>' +
        '<span class="pool mp"><b>' + cls.base.mp +
          '</b><i>MOVEMENT</i></span>';

      const keyStat = C.STAT_OF_ELEM[cls.element];
      $('bars').innerHTML = Object.keys(STAT_LABEL).map(k =>
        '<span class="stat' + (k === keyStat ? ' key' : '') + '"><i>' +
        STAT_LABEL[k] + '</i><span class="track"><span class="fill" data-w="' +
        Math.round(100 * (cls.stats[k] || 0) / STAT_MAX) +
        '"></span></span></span>').join('');
      /* let the bars grow in (transition from width:0) */
      requestAnimationFrame(() =>
        scope.querySelectorAll('#bars .fill').forEach(f =>
          f.style.width = f.dataset.w + '%'));

      $('spells').innerHTML = cls.spells.map(sp =>
        '<li class="spell"><div class="sphead"><b>' + esc(sp.name) +
        '</b><span class="tags"><i class="tag ap">' + sp.ap +
        ' AP</i><i class="tag">' + rangeText(sp) + '</i>' +
        fxTags(sp).map(t => '<i class="tag fx">' + t + '</i>').join('') +
        '</span></div><p>' + esc(sp.hint) + '</p></li>').join('');

      $('confirm').textContent = VERB + ' the ' + cls.name;
      $('info').scrollTop = 0;

      /* rail + gender pressed states */
      scope.querySelectorAll('.cbtn').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.id === sel.classId)));
      scope.querySelectorAll('.gbtn').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.g === sel.gender)));
    }

    /* ── build the class rail ───────────────────────────────────── */
    $('rail').innerHTML = C.LIST.map(cls =>
      '<button class="cbtn" type="button" data-id="' + cls.id +
      '" aria-pressed="false" aria-label="' + esc(cls.name) + ', ' +
      ELEM[cls.element].label + ' ' + esc(cls.role) + '">' +
      icon(cls.element, 20) + '<i>' + esc(cls.name) + '</i></button>').join('');

    /* ── wiring ─────────────────────────────────────────────────── */
    scope.querySelectorAll('.cbtn').forEach(b => b.addEventListener('click', () => {
      if (sel.classId === b.dataset.id) {
        /* tapping the selected class again = show me the attack */
        if (actor) SP.play(actor, 'attack', true);
        return;
      }
      sel.classId = b.dataset.id;
      renderClass();
      setActor(C.byId(sel.classId), sel.gender, true);
    }));

    scope.querySelectorAll('.gbtn').forEach(b => b.addEventListener('click', () => {
      if (sel.gender === b.dataset.g) return;
      sel.gender = b.dataset.g;
      renderClass();
      setActor(C.byId(sel.classId), sel.gender, true);
    }));

    $('stage').addEventListener('click', () => {
      if (actor) SP.play(actor, 'attack', true);
    });

    let toastT = 0;
    function toast(msg) {
      const el = $('toast');
      el.textContent = msg; el.classList.add('on');
      clearTimeout(toastT);
      toastT = setTimeout(() => el.classList.remove('on'), 2600);
    }

    /* default confirm: MERGE over any existing payload so HERO's
       extended fields (level/xp/items/equip) survive a re-pick. A
       class change drops the stored hp — the new body re-derives it. */
    function defaultSave(payload) {
      try {
        let prev = null;
        try { prev = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
        const out = Object.assign(
          {}, (prev && typeof prev === 'object') ? prev : {}, payload);
        if (prev && prev.classId !== payload.classId) delete out.hp;
        localStorage.setItem(KEY, JSON.stringify(out));
        toast('Saved. The world will greet a ' +
          (payload.gender === 'f' ? 'female' : 'male') + ' ' + payload.name + '.');
      } catch (e) {
        toast('Could not save your choice — storage is blocked.');
      }
      if (actor) SP.play(actor, 'attack', true);
    }

    $('confirm').addEventListener('click', () => {
      const cls = C.byId(sel.classId);
      const payload = {
        v: 1, classId: cls.id, gender: sel.gender,
        sheet: cls.look[sel.gender].sheet, name: cls.name,
        savedAt: new Date().toISOString()
      };
      if (opts.onConfirm) opts.onConfirm(payload);
      else defaultSave(payload);
    });

    /* ── boot ───────────────────────────────────────────────────── */
    fit();
    renderClass();
    setActor(C.byId(sel.classId), sel.gender, false);
    requestAnimationFrame(t => { last = t; requestAnimationFrame(tick); });

    return {
      destroy() { alive = false; removeEventListener('resize', fit); },
      get selection() { return { classId: sel.classId, gender: sel.gender }; }
    };
  }

  /* ════════════════════════════════════════════════════════════════
     openOverlay(opts) — the in-world reincarnation modal.
       opts.title / opts.subtitle / opts.label  copy
       opts.verb        confirm verb (default 'Awaken as')
       opts.onConfirm   (payload) => {}   fired AFTER the overlay closes
       opts.onCancel    () => {}          Esc / ✕ (choice not made)
     One at a time. Focus is trapped; Esc cancels; the trigger's focus
     is restored on close. Confirm plays a brief gold flash (skipped
     under prefers-reduced-motion).
     ════════════════════════════════════════════════════════════════ */
  let overlayOpen = false;
  function openOverlay(opts) {
    if (overlayOpen) return null;
    opts = opts || {};
    ensureCss();
    overlayOpen = true;
    const prevFocus = document.activeElement;

    const ov = document.createElement('div');
    ov.id = 'reinc';
    ov.innerHTML =
      '<div class="ri-veil" aria-hidden="true"></div>' +
      '<div id="app" class="ri-col" role="dialog" aria-modal="true" tabindex="-1"' +
      ' aria-label="' + esc(opts.label || 'Choose what you came back as') + '">' +
      appMarkup({
        title: opts.title || 'What did you come back as?',
        subtitle: opts.subtitle || 'Five shapes wait in the circle. Tap one — watch it move.'
      }) +
      '<button class="ri-x" type="button" aria-label="Decide later">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M18 6 6 18M6 6l12 12"/></svg></button></div>';
    document.body.appendChild(ov);

    /* modal containment: the rest of the document leaves the focus +
       accessibility order while the circle is open (same pattern as
       panels.js) */
    const inerted = [];
    for (const el of Array.prototype.slice.call(document.body.children)) {
      if (el === ov || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      inerted.push(el);
    }

    const dlg = ov.querySelector('[role="dialog"]');
    const ui = bind(ov, {
      initial: opts.initial,
      verb: opts.verb || 'Awaken as',
      onConfirm(payload) { close(true, payload); }
    });

    let closed = false;
    function close(confirmed, payload) {
      if (closed) return;
      closed = true; overlayOpen = false;
      document.removeEventListener('keydown', onKey, true);
      for (const el of inerted) el.removeAttribute('inert');
      ui.destroy();
      ov.remove();
      if (confirmed && !matchMedia('(prefers-reduced-motion: reduce)').matches)
        flash();
      if (prevFocus && prevFocus.focus && document.contains(prevFocus))
        prevFocus.focus({ preventScroll: true });
      if (confirmed) { if (opts.onConfirm) opts.onConfirm(payload); }
      else if (opts.onCancel) opts.onCancel();
    }

    function focusList() {
      const all = ov.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const out = [];
      for (const el of all)
        if (!el.disabled && !el.closest('[hidden]')) out.push(el);
      return out;
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Tab') {
        const f = focusList();
        if (!f.length) { e.preventDefault(); return; }
        const first = f[0], last = f[f.length - 1], ae = document.activeElement;
        if (!ov.contains(ae)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && (ae === first || ae === dlg)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && ae === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    ov.querySelector('.ri-x').addEventListener('click', () => close(false));
    requestAnimationFrame(() => dlg.focus({ preventScroll: true }));

    return { close: () => close(false) };
  }

  /* the gold flash of the circle sealing the choice */
  function flash() {
    const f = document.createElement('div');
    f.id = 'ri-flash';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 650);
  }

  /* select.css (shared look) + the overlay's own few rules */
  function ensureCss() {
    if (!document.querySelector('link[href$="select.css"]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = 'select.css';
      document.head.appendChild(l);
    }
    if (document.getElementById('reinc-css')) return;
    const st = document.createElement('style');
    st.id = 'reinc-css';
    st.textContent = [
      /* above #dlg(50), below the quest coach toast(9999) */
      '#reinc{position:fixed;inset:0;z-index:60}',
      '#reinc .ri-veil{position:absolute;inset:0;',
      ' background:radial-gradient(120% 85% at 50% 80%,rgba(255,197,66,.13),transparent 48%),',
      ' rgba(7,5,14,.84);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);',
      ' animation:riVeil .3s ease-out both}',
      '#reinc .ri-col{position:relative;height:100%;',
      ' animation:riIn .4s cubic-bezier(.16,1,.3,1) both}',
      '#reinc .ri-col:focus{outline:none}',
      '@keyframes riIn{from{opacity:0;transform:translateY(16px)}}',
      '@keyframes riVeil{from{opacity:0}}',
      '#reinc .ri-x{position:absolute;z-index:2;',
      ' top:calc(6px + env(safe-area-inset-top,0px));',
      ' right:calc(2px + env(safe-area-inset-right,0px));',
      ' width:44px;height:44px;display:flex;align-items:center;justify-content:center;',
      ' border-radius:12px;border:1px solid var(--line);',
      ' background:rgba(255,255,255,.05);color:var(--dim);cursor:pointer}',
      '#ri-flash{position:fixed;inset:0;z-index:70;pointer-events:none;',
      ' background:radial-gradient(circle at 50% 62%,rgba(255,235,180,.95),',
      ' rgba(255,197,66,.45) 38%,rgba(255,197,66,0) 72%);',
      ' animation:riFlash .55s ease-out forwards}',
      '@keyframes riFlash{from{opacity:1}to{opacity:0}}',
      '@media (prefers-reduced-motion:reduce){',
      ' #reinc .ri-veil,#reinc .ri-col{animation:none}}'
    ].join('');
    document.head.appendChild(st);
  }

  /* ── standalone page boot: select.html ships the static markup ── */
  if (document.getElementById('rail') && document.getElementById('confirm'))
    bind(document, {});

  return { bind, openOverlay };
})();
