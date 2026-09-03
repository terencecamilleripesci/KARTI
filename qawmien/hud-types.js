/* ═══════════════════════════════════════════════════════════════════
   HUD-TYPES — window.HUDT, the shared vocabulary of the HUD layer.

   THIS FILE IS THE CONTRACT. It is owned by HUD_SPEC.md — no agent
   edits it without updating the spec. hud.js, minimap.js, panels.js
   and tactics.js all read these; never a local copy. Pure constants
   and pure functions only: no DOM at load time, no state.

   Loaded by BOTH documents (world.html and index.html), always BEFORE
   hud.js / minimap.js / tactics.js.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const HUDT = (() => {

  /* ── palette (single source; matches :root in both html files) ──── */
  const C = {
    bg: '#0E0B1A', panel: '#171331', ink: '#EDEAF6', dim: '#9C97B8',
    gold: '#FFC542', ap: '#8A5CFF', mp: '#3DDC84',
    you: '#4FA9E8', foe: '#E8455F',
    line: 'rgba(255,255,255,.10)',
    apText: '#C9B4FF',              /* AP numerals on dark (4.5:1+)      */
    mpText: '#8CF0BC'               /* MP numerals on dark (4.5:1+)      */
  };

  /* ── z-index layers (existing values are LAW; new ones slot in) ─── */
  const Z = {
    HUD: 30,        /* bottom bar, top bar, minimap, quest pill (#qhud) */
    TOOLTIP: 36,    /* long-press / focus spell tooltip                 */
    PANELS: 40,     /* panels.js overlays (existing)                    */
    MENU: 44,       /* settings dropdown + its backdrop                 */
    CBF: 45,        /* combat iframe (existing)                         */
    DLG: 50,        /* quest dialogue (existing)                        */
    REINC: 60,      /* reincarnation picker (existing)                  */
    LOADER: 100     /* summoning-circle loading screen (existing)       */
  };

  /* ── breakpoints ────────────────────────────────────────────────── */
  const BP = { SMALL: 359, WIDE: 600 };   /* <=SMALL shrink; >=WIDE cap */
  const MAXW = 560;                        /* bar content max width, px */

  /* ── bottom bar geometry (px, CSS space, EXCLUDING safe insets) ─── */
  const BAR = {
    H: 64,                 /* explore bar height                        */
    COMBAT_H: 134,         /* combat, upright: skills row 64 + 6 + 64   */
    /* SIDEWAYS THE BAR IS ONE ROW. 134 of a landscape phone's 390 is a
       third of the screen given to furniture, and the map is a rectangle
       now — every pixel the bar takes is ground the player cannot reach.
       hud.css lays the skills BESIDE the orbs at this height; the two
       numbers have to agree, so the CSS reads this one through the
       --hud-bar-h variable rather than repeating it. */
    COMBAT_H_LANDSCAPE: 66,
    PAD_X: 10,             /* side padding inside the bar               */
    PAD_BOTTOM_MIN: 10,    /* padding-bottom: max(this, safe-inset)     */
    BTN_H: 48,             /* Bag / Hero / Map / End turn height        */
    BTN_MIN_W: 64,
    MODE_MS: 220,          /* grow/shrink height transition             */
    EASE: 'cubic-bezier(.2,.8,.3,1)'
  };

  /* ── orbs ───────────────────────────────────────────────────────── */
  const ORB = {
    HP: 68, HP_SMALL: 60,        /* crystal ball diameter               */
    HP_OVERHANG: 22,             /* how far the ball rises above bar top*/
    SIDE: 44, SIDE_SMALL: 40,    /* AP / MP orb diameter                */
    WAVE_MS: 2400,               /* fluid idle wave loop                */
    FLUID_MS: 300,               /* level change ease                   */
    DMG_FLASH_MS: 120,           /* white flash on damage               */
    DMG_SHAKE_MS: 250,           /* ±3px shake on damage (motion-gated) */
    CRIT_PULSE_MS: 1200,         /* low-hp pulse loop (motion-gated)    */
    /* HP IS RED. It read as blue at full health, which every other game
       has trained players to read as mana — the one thing this orb is not.
       So the fluid is blood-red throughout and DARKENS as it drains: bright
       and alive when full, deep and dull when nearly gone.

       The fill LEVEL still carries the information on its own, so nothing
       here depends on telling two reds apart — the darkening is mood, not
       meaning, which keeps it readable for colour-blind players. */
    hpColor(frac) {
      if (frac > 0.6) return '#F0434F';  /* full — bright arterial red  */
      if (frac > 0.3) return '#C22A3C';  /* wounded — deeper, dulling   */
      return '#8E1B2A';                  /* critical — dark, almost out */
    }
  };

  /* ── combat skill buttons ───────────────────────────────────────── */
  const SKILL = {
    BTN: 56, BTN_SMALL: 48,      /* square icon button (>=44 target)    */
    GLYPH: 30,                   /* svg glyph size inside the button    */
    BADGE: 18,                   /* AP-cost badge diameter              */
    BADGE_OFF: -2,               /* badge offset from right/bottom edge */
    GAP: 8,
    LONGPRESS_MS: 350,           /* press-and-hold before tooltip       */
    LONGPRESS_SLOP: 10,          /* px of finger drift that cancels it  */
    HOVER_TIP_MS: 450,           /* pointer hover delay (desktop)       */
    STAGGER_MS: 20               /* per-icon entrance stagger           */
  };

  /* ── minimap ────────────────────────────────────────────────────── */
  const MMAP = {
    CELL: 16, GAP: 2,            /* field grid cells                    */
    RUIN_CELL: 12, RUIN_GAP: 6,  /* the two ruin rooms + connector      */
    PAD: 6,                      /* inner padding of the panel          */
    GRID_W: 5, GRID_H: 3,        /* the field grid                      */
    POLL_MS: 400,                /* WORLD._map.id watch interval        */
    /* panel content: [r1][2][r2][6][ 5x16 + 4x2 grid ] = 120 x 52      */
    W: 12 + 2 + 12 + 6 + (5 * 16 + 4 * 2),
    H: 5 * 0 + (3 * 16 + 2 * 2)
  };

  /* ── explore-mode state polling ─────────────────────────────────── */
  const POLL_MS = 300;           /* HUD watches PLAYER {hp,ap,mp,level} */

  /* ── storage keys ───────────────────────────────────────────────── */
  const KEYS = {
    SOUND: 'qawmien.sound.v1',   /* '0' = muted; absent/other = on      */
    VISITED: 'qawmien.mmap.v1'   /* JSON array of visited map ids       */
  };

  /* ── parent messaging (KARTI js/qawmien.js) ─────────────────────── */
  const MSG = {
    HELLO: 'qawmien:hello',      /* existing (net.js)                   */
    AUTH: 'qawmien:auth',        /* existing (net.js)                   */
    CLOSE: 'qawmien:close'       /* NEW — HUD asks the parent to close  */
  };

  /* ── CSS custom properties hud.js maintains on :root ────────────── */
  const CSSVARS = {
    BAR_H: '--hud-bar-h',        /* total bar height incl. safe inset   */
    TOP_H: '--hud-top-h'         /* top strip height incl. safe inset   */
  };

  /* ── element tints for spell icons ──────────────────────────────── */
  const ELEM = {
    earth: '#D0894F', fire: '#FF6B4A', water: '#4FA9E8', air: '#8FE3C0',
    none: C.gold                 /* heals / utility with no element     */
  };
  function elemOf(sp) {
    return (sp && sp.elem && ELEM[sp.elem]) ? sp.elem : 'none';
  }

  /* ── spell glyphs — THE one source for every spell icon ──────────
     24x24 viewBox, stroke-only (stroke-width 2, round caps/joins,
     fill none), same visual language as panels.js's icon set. Used by
     the combat skill bar AND the Hero panel's Spells tab. Rendered as
     inline SVG (zero downloads, crisp at any DPR, tintable). */
  const SPELL_GLYPHS = {
    /* stock testbed kit */
    strike:    '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/>',
    bolt:      '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
    blast:     '<circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.9 4.9 2.1 2.1"/><path d="m17 17 2.1 2.1"/><path d="m19.1 4.9-2.1 2.1"/><path d="m7 17-2.1 2.1"/>',
    shove:     '<path d="M4 12h10"/><path d="m10 6 6 6-6 6"/><path d="M20 5v14"/>',
    /* warden */
    maul:      '<path d="M10 4h10v7H10z"/><path d="M10 7.5H7"/><path d="M9.5 11 4 21"/>',
    rootgrasp: '<path d="M12 2v10"/><path d="m8 8 4 4 4-4"/><path d="M4 13v1.5c0 4 3.5 6.5 8 6.5s8-2.5 8-6.5V13"/>',
    quake:     '<path d="m3 16 5-5 3 3 4-6 6 8"/><path d="M3 21h18"/>',
    crush:     '<path d="m3 19 5-9 4 6 3-4 6 7z"/><path d="M12 3v4"/><path d="m9 5 3 2 3-2"/>',
    bulwark:   '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/>',
    /* stormfletch */
    dart:      '<path d="M21 3 8 16"/><path d="M14 3h7v7"/><path d="m5 13 6 6-3 2-5-5z"/>',
    pierce:    '<path d="M3 12h14"/><path d="m13 6 6 6-6 6"/><circle cx="5" cy="12" r="2"/>',
    gust:      '<path d="M3 8h9a3 3 0 1 0-3-3"/><path d="M3 14h13"/><path d="m12 10 4 4-4 4"/>',
    windstep:  '<path d="m5 5 7 7-7 7"/><path d="m13 5 7 7-7 7"/>',
    /* cindermancer */
    cinder:    '<path d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-2 .9-3.7 2-5 .2 1.8 1 2.8 2 3-.6-2-.2-4.8 1-7z"/>',
    pyre:      '<circle cx="12" cy="13" r="8"/><path d="M12 8s2.5 2.6 2.5 4.5a2.5 2.5 0 1 1-5 0C9.5 10.6 12 8 12 8z"/>',
    snare:     '<circle cx="12" cy="14" r="5"/><path d="M12 9V5"/><path d="m5 21 3-3"/><path d="m19 21-3-3"/>',
    flashburn: '<path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
    /* tidebinder */
    lash:      '<path d="M4 19c4 2 6-2 9-2s4 2 7 1"/><path d="M4 19C8 9 14 6 20 4"/>',
    mend:      '<path d="M9 3.5h6V9h5.5v6H15v5.5H9V15H3.5V9H9z"/>',
    wavebreak: '<path d="M3 15c2-4 4-6 6-6 3 0 3 4 6 4 2 0 3-1 6-4"/><path d="M3 20h18"/>',
    blessing:  '<path d="M12 3s3 3.5 3 6a3 3 0 1 1-6 0c0-2.5 3-6 3-6z"/><path d="M6 13s2 2.5 2 4a2 2 0 1 1-4 0c0-1.5 2-4 2-4z"/><path d="M18 13s2 2.5 2 4a2 2 0 1 1-4 0c0-1.5 2-4 2-4z"/>',
    /* shepherd */
    crook:     '<path d="M15 21V8a5 5 0 1 0-10 0"/>',
    callram:   '<path d="M12 9v12"/><path d="M12 9c0-4-3-5.5-5-4.5C4 6 5 10.5 8 10.5"/><path d="M12 9c0-4 3-5.5 5-4.5 3 1.5 2 6-1 6"/>',
    whistle:   '<path d="M4 10v4h4l5 5V5l-5 5z"/><path d="M17 9a4.5 4.5 0 0 1 0 6"/>',
    flockmate: '<path d="M4 8h13"/><path d="m14 4 4 4-4 4"/><path d="M20 16H7"/><path d="m10 12-4 4 4 4"/>',
    /* ai kits (Spells tab never shows these, tooltips may) */
    ramhorn:   '<circle cx="12" cy="13" r="5"/><path d="M8 9C6 5 9 3 11 4"/><path d="M16 9c2-4-1-6-3-5"/>',
    thwack:    '<circle cx="14" cy="10" r="5"/><path d="m10.5 13.5-7.5 7.5"/><path d="M14 1.5v2"/><path d="m18.6 5.4 1.6-1.6"/><path d="M20.5 10h2"/>'
  };
  const GLYPH_FALLBACK = SPELL_GLYPHS.flashburn;    /* the spark burst  */
  function spellGlyph(id) { return SPELL_GLYPHS[id] || GLYPH_FALLBACK; }

  /* one spell icon as an inline SVG string; `size` px, tint = css color */
  /* ── PAINTED SPELL ICONS, with the stroke glyphs as the fallback ──
     art/ui/spell-icons.png is one 512x256 sheet, 8x4 cells of 64px, so a
     skill button costs no request of its own and the whole set arrives as
     a single image. Addressed by CSS background-position rather than 22
     separate files.

     The stroke SVGs stay as the fallback, and that matters: this is drawn
     art, so a missing or half-loaded sheet would otherwise leave the combat
     bar as blank squares mid-fight. A generic glyph is a far better failure
     than no glyph. Any id not on the sheet falls through too, so adding a
     spell before its art exists degrades instead of breaking. */
  const ICON_SHEET = 'art/ui/spell-icons.png';
  const ICON_CELL = 64, ICON_COLS = 8;
  const ICON_AT = { maul:0, rootgrasp:1, quake:2, crush:3, bulwark:4,
    dart:5, pierce:6, gust:7, windstep:8, cinder:9, pyre:10, snare:11,
    flashburn:12, lash:13, mend:14, wavebreak:15, blessing:16, crook:17,
    callram:18, whistle:19, flockmate:20, ramhorn:21,
    /* The testbed's stock kit and the dummy's swat are not class spells, so
       they have no art of their own. Rather than leave the combat board
       showing generic strokes while the real game shows painted icons, they
       borrow the icon that means the same thing: a melee smash, a bolt, an
       area blast, a push. The board reads the same in both places. */
    strike: 0, bolt: 9, blast: 10, shove: 7, thwack: 0 };

  function spellIcon(id, size, tint) {
    const at = ICON_AT[id];
    if (at !== undefined) {
      const col = at % ICON_COLS, row = Math.floor(at / ICON_COLS);
      return '<span class="hud-spr" aria-hidden="true" style="' +
        'display:block;width:' + size + 'px;height:' + size + 'px;' +
        'background-image:url(' + ICON_SHEET + ');' +
        'background-size:' + (ICON_COLS * size) + 'px auto;' +
        'background-position:' + (-col * size) + 'px ' + (-row * size) + 'px;' +
        'background-repeat:no-repeat"></span>';
    }
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24"' +
      ' fill="none" stroke="' + (tint || C.ink) + '" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      spellGlyph(id) + '</svg>';
  }

  /* ── minimap display names (aria + any label use) ───────────────── */
  function mapLabel(id) {
    if (id === 'ruin-01') return 'Old Ruin, inner room';
    if (id === 'ruin-02') return 'Old Ruin, hall';
    const m = /^field-(\d+)-(\d+)$/.exec(id || '');
    if (m) return 'The Fields, ' + (+m[1] + 1) + ' across, ' + (+m[2] + 1) + ' down';
    return id || 'Unknown';
  }

  /* ── the combat snapshot shape (documentation + safe default) ────
     tactics.js paint() builds one of these and hands it to
     HUD.combatPaint(snap). See HUD_SPEC.md §7 for field semantics. */
  function emptySnap() {
    return {
      over: 0, round: 1, mine: false,
      hero: { hp: 0, hpMax: 1, ap: 0, apMax: 6, mp: 0, mpMax: 3 },
      turn: { name: '', hint: '' },
      sel: null, mapMode: true,
      spells: []                 /* {id,name,ap,min,max,los,cd,off,hint} */
    };
  }

  return { C, Z, BP, MAXW, BAR, ORB, SKILL, MMAP, POLL_MS, KEYS, MSG,
           CSSVARS, ELEM, elemOf, SPELL_GLYPHS, spellGlyph, spellIcon,
           mapLabel, emptySnap };
})();

if (typeof window !== 'undefined') window.HUDT = HUDT;
