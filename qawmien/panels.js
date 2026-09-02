'use strict';
/* panels.js — window.PANELS: inventory + character sheet overlays (WORLD_SPEC §7,
   HUD_SPEC §6). Contract: openInventory / openStats / openSpells / close /
   toggle(which) / give(item).
   DOM: appends <div id="panels"> (z-index 40) containing
   <section class="panel" id="panel-inventory"> and <section class="panel" id="panel-stats">;
   the hero panel carries a Character | Spells sub-tab strip (HUD_SPEC §6) whose
   spell glyphs come from HUDT.SPELL_GLYPHS — the same icons the combat bar shows.
   close buttons carry class .panel-x. Re-reads window.PLAYER on every open/give.
   Item shape is the spec's: { id, name, qty, note? } — merged by id, qty adds.
   Rarity / icon / equip-slot come from an internal catalog keyed by item id
   (optional item.rarity / item.slot / item.icon override it; never required). */
window.PANELS = (function () {

  /* ------------------------------------------------ icons (inline SVG, no emoji) */
  function svg(inner, size) {
    return '<svg width="' + (size || 24) + '" height="' + (size || 24) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  var IC = {
    bag:    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    user:   '<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/>',
    x:      '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    coin:   '<circle cx="12" cy="12" r="8"/><path d="M12 8.5v7"/><path d="M9.5 10.5c0-1 1-1.7 2.5-1.7s2.5.7 2.5 1.7-1 1.4-2.5 1.7-2.5.7-2.5 1.7 1 1.7 2.5 1.7 2.5-.7 2.5-1.7"/>',
    potion: '<path d="M10 2v6l-5.3 9.6A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 1.8-2.9L14 8V2"/><path d="M8.5 2h7"/><path d="M7.3 14h9.4"/>',
    sword:  '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/>',
    head:   '<path d="M12 4a7 7 0 0 0-7 7v4h14v-4a7 7 0 0 0-7-7z"/><path d="M3 18h18"/>',
    cape:   '<path d="M12 3c-4 2-6 5-6 9v9l6-3 6 3v-9c0-4-2-7-6-9z"/>',
    amulet: '<path d="m7 3 5 7 5-7"/><circle cx="12" cy="14" r="4"/>',
    ring:   '<path d="m12 2 3 3-3 3-3-3z"/><circle cx="12" cy="15" r="6"/>',
    belt:   '<rect x="3" y="10" width="18" height="5" rx="1.5"/><rect x="9" y="8" width="6" height="9" rx="1.5"/>',
    boots:  '<path d="M8 3h5v9l5.5 3.7a2 2 0 0 1-1.1 3.6H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M13 12H8"/>',
    pouch:  '<path d="M9 6V5a3 3 0 0 1 6 0v1"/><path d="M5 6h14l-1.5 13a2 2 0 0 1-2 1.8h-7A2 2 0 0 1 6.5 19z"/>',
    spark:  '<path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
    heart:  '<path d="M12 20.5C7.5 16.5 3.5 13.2 3.5 9.1 3.5 6.4 5.5 4.5 8 4.5c1.6 0 3 .8 4 2.2 1-1.4 2.4-2.2 4-2.2 2.5 0 4.5 1.9 4.5 4.6 0 4.1-4 7.4-8.5 11.4z"/>',
    bolt:   '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
    steps:  '<path d="m6 4 6 8-6 8"/><path d="m14 4 6 8-6 8"/>',
    fire:   '<path d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-2 .9-3.7 2-5 .2 1.8 1 2.8 2 3-.6-2-.2-4.8 1-7z"/>',
    water:  '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    earth:  '<path d="m8 4 4 8 3.5-4.5L21 19H3z"/>',
    air:    '<path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>'
  };

  /* --------------------------------------------- item catalog (visuals only) */
  var META = {
    potion: { icon: 'potion', rarity: 'uncommon', use: { heal: 30 } },
    sword:  { icon: 'sword',  rarity: 'rare',      slot: 'weapon' },
    hat:    { icon: 'head',   rarity: 'common',    slot: 'head' },
    cape:   { icon: 'cape',   rarity: 'common',    slot: 'cape' },
    amulet: { icon: 'amulet', rarity: 'epic',      slot: 'amulet' },
    ring:   { icon: 'ring',   rarity: 'rare',      slot: 'ring' },
    belt:   { icon: 'belt',   rarity: 'common',    slot: 'belt' },
    boots:  { icon: 'boots',  rarity: 'uncommon',  slot: 'boots' }
  };
  var SLOTS = ['head', 'cape', 'amulet', 'weapon', 'ring', 'belt', 'boots'];
  var SLOT_IC = { head: 'head', cape: 'cape', amulet: 'amulet', weapon: 'sword',
                  ring: 'ring', belt: 'belt', boots: 'boots' };
  var RAR_NAME = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare',
                   epic: 'Epic', legendary: 'Legendary' };

  function metaOf(item) {
    var m = META[item.id] || {};
    return {
      icon:   item.icon   || m.icon || 'pouch',
      rarity: item.rarity || m.rarity || 'common',
      slot:   item.slot   || m.slot || null,
      use:    m.use || null
    };
  }
  function player() {
    if (!window.PLAYER) window.PLAYER = { name: 'Hero', level: 1, xp: 0,
      hp: 100, hpMax: 100, ap: 6, mp: 3, items: [] };
    if (!window.PLAYER.items) window.PLAYER.items = [];
    return window.PLAYER;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ------------------------------------------------------------------ state */
  var built = false, root = null, openPanel = null, sheetId = null,
      dropArmed = false, toastT = 0, lastFocus = null, closeT = 0,
      inerted = [], heroTab = 'character';   /* 'character' | 'spells' */

  /* Modal containment (aria-modal contract): while a panel is open the rest of
     the document must be out of the focus + accessibility order. `inert` on
     every body-level sibling of #panels does that (blocks Tab, .focus() and AT);
     the Tab handler below wraps focus inside the sheet as a deterministic
     fallback for engines without inert. */
  function setBgInert(on) {
    var i;
    if (on) {
      var kids = document.body.children;
      for (i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el === root || el.hasAttribute('inert')) continue;
        el.setAttribute('inert', '');
        inerted.push(el);
      }
    } else {
      for (i = 0; i < inerted.length; i++) inerted[i].removeAttribute('inert');
      inerted.length = 0;
    }
  }
  function focusables() {
    /* focusable elements inside the open sheet, in DOM order, skipping the
       hidden tabpanel / hidden item-sheet */
    var scope = q('.pn-sheet');
    var all = scope.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.disabled || el.closest('[hidden]')) continue;
      out.push(el);
    }
    return out;
  }
  function tabKey(e) {
    /* ARIA tabs keyboard pattern (the role=tablist/role=tab markup promises it):
       Left/Right move + select the adjacent tab (wrapping), Home/End jump to the
       first/last tab. Activation follows focus (automatic activation) via the
       same show()/setHeroTab() paths the click handler uses. Works for BOTH
       tablists: the bottom panel tabs and the hero Character|Spells sub-tabs. */
    var tab = e.target && e.target.closest ? e.target.closest('[role="tablist"] [role="tab"]') : null;
    if (!tab || !root.contains(tab)) return;
    var tabs = tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]');
    var i = Array.prototype.indexOf.call(tabs, tab), n = tabs.length;
    if (i < 0 || !n) return;
    var j = e.key === 'Home' ? 0 :
            e.key === 'End' ? n - 1 :
            e.key === 'ArrowRight' ? (i + 1) % n : (i - 1 + n) % n;
    e.preventDefault();
    var next = tabs[j];
    if (next.getAttribute('data-act') === 'subtab') setHeroTab(next.getAttribute('data-t'));
    else show(next.getAttribute('data-t'));
    next.focus({ preventScroll: true });
  }
  function trapTab(e) {
    var f = focusables();
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1], ae = document.activeElement;
    if (!q('.pn-sheet').contains(ae)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && ae === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && ae === last) { e.preventDefault(); first.focus(); }
  }

  function ensure() {
    if (built || !document.body) return built;
    built = true;
    if (!document.querySelector('link[href$="panels.css"]')) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = 'panels.css';
      document.head.appendChild(l);
    }
    root = document.createElement('div');
    root.id = 'panels';
    root.innerHTML =
      '<div class="pn-scrim" data-act="close"></div>' +
      '<div class="pn-sheet" role="dialog" aria-modal="true" aria-label="Game menu">' +
        '<div class="pn-grip" aria-hidden="true"></div>' +
        '<div class="pn-body">' +
          '<section class="panel" id="panel-inventory" role="tabpanel" aria-label="Inventory" tabindex="-1" hidden></section>' +
          '<section class="panel" id="panel-stats" role="tabpanel" aria-label="Character" tabindex="-1" hidden></section>' +
        '</div>' +
        '<div class="item-sheet" hidden>' +
          '<div class="is-scrim" data-act="sheet-close"></div>' +
          '<div class="is-card" role="dialog" aria-modal="true" aria-label="Item details"></div>' +
        '</div>' +
        '<nav class="pn-tabs" role="tablist" aria-label="Menu tabs">' +
          '<button class="pn-tab" id="pn-tab-inv" role="tab" aria-selected="false" ' +
            'aria-controls="panel-inventory" data-act="tab" data-t="inventory">' +
            svg(IC.bag, 20) + '<span>Inventory</span></button>' +
          '<button class="pn-tab" id="pn-tab-sta" role="tab" aria-selected="false" ' +
            'aria-controls="panel-stats" data-act="tab" data-t="stats">' +
            svg(IC.user, 20) + '<span>Character</span></button>' +
          '<span class="pn-ind" aria-hidden="true"></span>' +
        '</nav>' +
      '</div>' +
      '<div class="pn-toast" role="status" aria-live="polite"></div>';
    document.body.appendChild(root);

    root.addEventListener('click', onClick);
    document.addEventListener('keydown', function (e) {
      if (!openPanel) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (sheetId !== null) closeSheet(); else api.close();
      } else if (e.key === 'Tab') {
        trapTab(e);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' ||
                 e.key === 'Home' || e.key === 'End') {
        tabKey(e);
      }
    });
    return true;
  }

  function q(sel) { return root.querySelector(sel); }

  /* ------------------------------------------------------------- rendering */
  /* No wallet in this header. KARTI owns the coin balance and shows it in
     its own chrome; a second coin readout here would be a number the player
     cannot spend and cannot trust. Level is what this screen is about. */
  function headHtml(title, lvl) {
    return '<header class="pn-head"><h2>' + title + '</h2>' +
      '<span class="pn-chip" aria-label="Level ' + lvl + '">' +
      '<span>LVL ' + lvl + '</span></span>' +
      '<button class="panel-x" data-act="close" aria-label="Close menu">' +
      svg(IC.x, 22) + '</button></header>';
  }

  function renderInventory() {
    var P = player(), eq = P.equip || {};
    var h = headHtml('Inventory', P.level) + '<div class="pn-scroll">';

    h += '<div class="pn-sub">Equipment</div><div class="eq-doll">';
    h += '<div class="eq-fig" aria-hidden="true">' + svg(IC.user, 64) + '</div>';
    for (var i = 0; i < SLOTS.length; i++) {
      var sl = SLOTS[i], w = eq[sl];
      h += '<button class="eq-slot eq-' + sl + (w ? ' filled' : '') +
        '" data-act="uneq" data-slot="' + sl + '" aria-label="' + sl +
        (w ? ': ' + esc(w.name) + ', tap to unequip' : ' slot, empty') + '"' +
        (w ? '' : ' disabled') + '>' +
        svg(IC[w ? metaOf(w).icon : SLOT_IC[sl]], 20) +
        '<small>' + (w ? esc(w.name) : sl) + '</small></button>';
    }
    h += '</div>';

    h += '<div class="pn-sub">Bag</div>';
    if (!P.items.length) {
      h += '<div class="inv-empty">' + svg(IC.pouch, 34) +
        '<b>Your bag is empty</b><span>Loot from fights and quest rewards lands here.<br>' +
        'Talk to the Caretaker to get started.</span></div>';
    } else {
      h += '<div class="inv-grid" role="list">';
      for (var j = 0; j < P.items.length; j++) {
        var it = P.items[j], m = metaOf(it);
        h += '<button class="slot" role="listitem" data-act="item" data-id="' + esc(it.id) +
          '" data-rar="' + m.rarity + '" aria-label="' + esc(it.name) + ', quantity ' +
          it.qty + ', ' + RAR_NAME[m.rarity] + '">' + svg(IC[m.icon] || IC.pouch, 26) +
          (it.qty > 1 ? '<b class="qty" aria-hidden="true">' + it.qty + '</b>' : '') +
          '</button>';
      }
      h += '</div>';
    }
    h += '</div>';
    q('#panel-inventory').innerHTML = h;
  }

  function bar(cls, num, den) {
    var pct = den > 0 ? Math.max(0, Math.min(1, num / den)) : 0;
    return '<div class="bar ' + cls + '"><i style="transform:scaleX(' + pct.toFixed(3) + ')"></i></div>';
  }
  function pips(n, max) {
    var h = '<div class="pips" aria-hidden="true">';
    for (var i = 0; i < max; i++) h += '<i class="' + (i < n ? 'on' : '') + '"></i>';
    return h + '</div>';
  }

  /* ---- hero panel: Character | Spells sub-tabs (HUD_SPEC §6) ---- */
  function characterHtml(P) {
    /* the REAL curve, not the level*100 placeholder that sat here while
       nothing levelled anyone up. HERO.xpBar() reports progress within the
       current level, which is what a bar should show — total lifetime XP
       against a total is meaningless once the curve steepens. */
    var bar0 = (window.HERO && HERO.xpBar) ? HERO.xpBar() : null;
    var xpInto = bar0 ? bar0.into : P.xp;
    var xpNext = bar0 ? (bar0.max ? xpInto : bar0.need) : P.level * 100;
    var st = P.stats || {};
    var els = [
      ['earth', 'Strength',     'Earth', st.earth],
      ['fire',  'Intelligence', 'Fire',  st.fire],
      ['water', 'Chance',       'Water', st.water],
      ['air',   'Agility',      'Air',   st.air]
    ];
    var h =
      '<div class="ch-id"><div class="ch-lvl"><b>' + P.level + '</b><small>LVL</small></div>' +
      '<div class="ch-name"><b>' + esc(P.name) + '</b><span>Adventurer of the Ruin</span></div></div>' +
      '<div class="xp-row"><div class="xp-lbls"><span>Experience</span><span>' +
      (bar0 && bar0.max ? 'MAX' : xpInto + ' / ' + xpNext) + '</span></div>' + bar('xp', xpInto, xpNext) + '</div>' +
      '<div class="pn-sub">Vitals</div><div class="vit">' +
      '<div class="vcard vhp"><div class="vt">' + svg(IC.heart, 15) + 'HEALTH</div>' +
      '<div class="vn">' + P.hp + ' <small>/ ' + P.hpMax + '</small></div>' +
      bar('hp', P.hp, P.hpMax) + '</div>' +
      '<div class="vcard vap"><div class="vt">' + svg(IC.bolt, 15) + 'ACTION</div>' +
      '<div class="vn">' + P.ap + ' <small>AP</small></div>' + pips(P.ap, Math.max(P.ap, 8)) + '</div>' +
      '<div class="vcard vmp"><div class="vt">' + svg(IC.steps, 15) + 'MOVEMENT</div>' +
      '<div class="vn">' + P.mp + ' <small>MP</small></div>' + pips(P.mp, Math.max(P.mp, 6)) + '</div>' +
      '</div><div class="pn-sub">Elements</div><div class="el-grid">';
    for (var i = 0; i < els.length; i++) {
      h += '<div class="el el-' + els[i][0] + '">' + svg(IC[els[i][0]], 22) +
        '<div class="en"><b>' + els[i][1] + '</b><small>' + els[i][2] + '</small></div>' +
        '<span class="ev">' + (els[i][3] || 0) + '</span></div>';
    }
    h += '</div>';
    return h;
  }

  var ELEM_NAME = { earth: 'Earth', fire: 'Fire', water: 'Water', air: 'Air' };

  function elemKeyOf(sp) {
    if (window.HUDT && window.HUDT.elemOf) return window.HUDT.elemOf(sp);
    return (sp && sp.elem && ELEM_NAME[sp.elem]) ? sp.elem : 'none';
  }
  /* The SAME glyph the combat skill bar shows — HUDT.SPELL_GLYPHS is the one
     source for every spell icon (HUD_SPEC §9), so this tab is where players
     learn them. If hud-types.js is not loaded (lab pages), fall back to the
     readable spark glyph — never a broken image. */
  function spellIconHtml(sp) {
    if (window.HUDT && window.HUDT.spellIcon) {
      return window.HUDT.spellIcon(sp.id, 28, window.HUDT.ELEM[window.HUDT.elemOf(sp)]);
    }
    return svg(IC.spark, 28);
  }
  function rangeText(sp) {
    if (!sp.max) return 'Self';                      /* min 0, max 0 */
    if (!sp.min) return 'Self–' + sp.max;            /* castable on yourself */
    return 'Range ' + (sp.min === sp.max ? sp.min : sp.min + '–' + sp.max);
  }
  /* fact row per HUD_SPEC §6: cost · range · sight · cooldown · one word
     per extension effect. Tabular, 12px, --dim. */
  function factsText(sp) {
    var f = [sp.ap + ' AP', rangeText(sp), sp.los ? 'needs sight' : 'ignores walls'];
    if (sp.cd) f.push('Cooldown ' + sp.cd);
    if (sp.aoe) f.push('area');
    if (sp.push) f.push('pushes ' + sp.push);
    if (sp.pull) f.push('pulls ' + sp.pull);
    if (sp.heal) f.push('heals');
    if (sp.tp) f.push('teleport');
    if (sp.trap) f.push('trap');
    if (sp.summon) f.push('summons');
    if (sp.swap) f.push('swaps');
    if (sp.shield) f.push('shields');
    return f.join(' · ');
  }
  function spellsHtml(P) {
    var chosen = !!(window.HERO && window.HERO.chosen && window.HERO.chosen());
    var spells = chosen && window.HERO.spells ? window.HERO.spells() : [];
    if (!chosen || !spells.length) {
      /* pre-choice: the real in-fiction state, not a stub (HUD_SPEC §6) */
      return '<div class="inv-empty sp-awaken"><span class="sp-seal" aria-hidden="true"></span>' +
        '<b>Not yet awakened</b><span>Reach the Elder in the ruin —<br>' +
        'your class chooses your spells.</span></div>';
    }
    var h = '<div class="pn-sub">Spellbook</div><div class="sp-list" role="list">';
    for (var i = 0; i < spells.length; i++) {
      var sp = spells[i], ek = elemKeyOf(sp);
      /* usable right now vs not: out of combat the only honest lock is the AP
         pool (cooldowns exist only inside a fight; the combat tooltip owns
         "Ready in N"). Full-bright card = castable on your turn. */
      var off = sp.ap > (P.ap | 0);
      h += '<article class="sp-card' + (off ? ' off' : '') + '" role="listitem">' +
        '<div class="sp-ic" data-elem="' + ek + '" aria-hidden="true">' + spellIconHtml(sp) + '</div>' +
        '<div class="sp-head"><b class="sp-name">' + esc(sp.name) + '</b>' +
        (ELEM_NAME[sp.elem] ? '<span class="sp-elem" data-elem="' + ek + '">' +
          ELEM_NAME[sp.elem] + '</span>' : '') + '</div>' +
        '<p class="sp-hint">' + esc(sp.hint || '') + '</p>' +
        '<div class="sp-facts">' + esc(factsText(sp)) + '</div>' +
        (off ? '<div class="sp-lock">Not enough AP — costs ' + sp.ap +
          ', you have ' + (P.ap | 0) + '</div>' : '') +
        '</article>';
    }
    h += '</div><p class="sp-note">In battle: tap a spell’s icon to ready it, hold it to read it.</p>';
    return h;
  }
  function subTabsHtml() {
    var s = heroTab === 'spells';
    return '<div class="sp-tabs" role="tablist" aria-label="Hero sheet sections">' +
      '<button class="sp-tab" id="pn-st-cha" role="tab" aria-selected="' + !s +
      '" aria-controls="pn-hero-pane" data-act="subtab" data-t="character">Character</button>' +
      '<button class="sp-tab" id="pn-st-spl" role="tab" aria-selected="' + s +
      '" aria-controls="pn-hero-pane" data-act="subtab" data-t="spells">Spells</button></div>';
  }
  function renderStats() {
    var P = player();
    var s = heroTab === 'spells';
    q('#panel-stats').innerHTML =
      headHtml(s ? 'Spells' : 'Character', P.level) +
      subTabsHtml() +
      '<div class="pn-scroll" id="pn-hero-pane" role="tabpanel" tabindex="-1" ' +
      'aria-labelledby="' + (s ? 'pn-st-spl' : 'pn-st-cha') + '">' +
      (s ? spellsHtml(P) : characterHtml(P)) + '</div>';
  }
  /* switch sub-tab in place: the strip's nodes survive (focus + the underline
     transition stay intact); only the pane content re-renders */
  function setHeroTab(t) {
    t = t === 'spells' ? 'spells' : 'character';
    if (heroTab === t) return;
    heroTab = t;
    if (!built || openPanel !== 'stats') return;
    var P = player(), s = t === 'spells';
    q('#panel-stats .pn-head h2').textContent = s ? 'Spells' : 'Character';
    q('#pn-st-cha').setAttribute('aria-selected', String(!s));
    q('#pn-st-spl').setAttribute('aria-selected', String(s));
    var pane = q('#pn-hero-pane');
    pane.setAttribute('aria-labelledby', s ? 'pn-st-spl' : 'pn-st-cha');
    pane.innerHTML = s ? spellsHtml(P) : characterHtml(P);
    pane.scrollTop = 0;
  }

  function renderSheet() {
    var wrap = q('.item-sheet'), card = q('.is-card');
    var P = player(), it = null;
    for (var i = 0; i < P.items.length; i++) if (P.items[i].id === sheetId) it = P.items[i];
    if (!it) { closeSheet(); return; }
    var m = metaOf(it);
    card.innerHTML =
      '<div class="is-top"><div class="is-icon" data-rar="' + m.rarity + '">' +
      svg(IC[m.icon] || IC.pouch, 30) + '</div><div class="is-name"><b>' + esc(it.name) +
      '</b><span class="is-rar" data-rar="' + m.rarity + '">' + RAR_NAME[m.rarity] +
      '</span> <span class="is-qty">x ' + it.qty + '</span></div>' +
      '<button class="panel-x" data-act="sheet-close" aria-label="Close item details">' +
      svg(IC.x, 22) + '</button></div>' +
      '<p class="is-note">' + esc(it.note || 'A curious find. Nobody remembers what it does.') + '</p>' +
      '<div class="is-acts">' +
      (m.use ? '<button class="is-btn pri" data-act="use">Use</button>' : '') +
      (m.slot ? '<button class="is-btn pri" data-act="equip">Equip</button>' : '') +
      '<button class="is-btn danger' + (dropArmed ? ' arm' : '') + '" data-act="drop">' +
      (dropArmed ? 'Confirm drop' : 'Drop') + '</button></div>';
    if (wrap.hidden) {
      wrap.hidden = false;
      requestAnimationFrame(function () { wrap.classList.add('on'); });
    }
  }
  function closeSheet() {
    var wrap = q('.item-sheet');
    if (!wrap || wrap.hidden) return;
    sheetId = null; dropArmed = false;
    wrap.classList.remove('on');
    setTimeout(function () { if (sheetId === null) wrap.hidden = true; }, 180);
  }

  function toast(msg) {
    if (!built) return;
    var t = q('.pn-toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, 2400);
  }

  /* --------------------------------------------------------------- actions */
  function itemOf(id) {
    var P = player();
    for (var i = 0; i < P.items.length; i++) if (P.items[i].id === id) return P.items[i];
    return null;
  }
  function takeOne(it) {
    var P = player();
    it.qty -= 1;
    if (it.qty <= 0) P.items.splice(P.items.indexOf(it), 1);
  }
  function useItem() {
    var it = itemOf(sheetId); if (!it) return;
    var m = metaOf(it), P = player();
    if (m.use && m.use.heal) {
      if (P.hp >= P.hpMax) { toast('HP is already full.'); return; }
      P.hp = Math.min(P.hpMax, P.hp + m.use.heal);
      takeOne(it);
      toast(it.name + ' restored ' + m.use.heal + ' HP.');
    }
    dropArmed = false;
    if (!itemOf(sheetId)) closeSheet(); else renderSheet();
    renderInventory();
  }
  function equipItem() {
    var it = itemOf(sheetId); if (!it) return;
    var m = metaOf(it); if (!m.slot) return;
    var P = player();
    /* THE LEVEL GATE. GEAR.canEquip is the only authority on this: a second
       opinion here would be a second place to get it wrong, and they would
       drift. It returns a REASON rather than a bare refusal, because a button
       that does nothing and explains nothing is indistinguishable from a bug. */
    if (window.GEAR && GEAR.canEquip) {
      var v = GEAR.canEquip(it.id, P.level | 0);
      if (!v.ok && v.need) {
        toast(it.name + ' needs level ' + v.need + ' — you are ' + (P.level | 0) + '.');
        return;
      }
    }
    if (!P.equip) P.equip = {};
    var prev = P.equip[m.slot];
    P.equip[m.slot] = { id: it.id, name: it.name, note: it.note };
    takeOne(it);
    if (prev) mergeItem({ id: prev.id, name: prev.name, qty: 1, note: prev.note });
    toast('Equipped ' + P.equip[m.slot].name + '.');
    dropArmed = false;
    closeSheet();
    renderInventory();
  }
  function unequip(slot) {
    var P = player();
    var w = P.equip && P.equip[slot];
    if (!w) return;
    P.equip[slot] = null;
    mergeItem({ id: w.id, name: w.name, qty: 1, note: w.note });
    toast('Unequipped ' + w.name + '.');
    renderInventory();
  }
  function dropItem() {
    var it = itemOf(sheetId); if (!it) return;
    if (!dropArmed) { dropArmed = true; renderSheet(); return; }
    var P = player();
    P.items.splice(P.items.indexOf(it), 1);
    toast('Dropped ' + it.name + '.');
    closeSheet();
    renderInventory();
  }

  function mergeItem(item) {
    var P = player();
    var it = itemOf(item.id);
    if (it) {
      it.qty += (item.qty || 1);
      if (!it.name && item.name) it.name = item.name;
      if (!it.note && item.note) it.note = item.note;
    } else {
      it = { id: item.id, name: item.name || item.id, qty: item.qty || 1 };
      if (item.note) it.note = item.note;
      P.items.push(it);
    }
    return it;
  }

  /* ---------------------------------------------------------------- events */
  function onClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    var act = b.getAttribute('data-act');
    if (act === 'close') api.close();
    else if (act === 'tab') show(b.getAttribute('data-t'));
    else if (act === 'subtab') setHeroTab(b.getAttribute('data-t'));
    else if (act === 'item') { sheetId = b.getAttribute('data-id'); dropArmed = false; renderSheet(); }
    else if (act === 'sheet-close') closeSheet();
    else if (act === 'use') useItem();
    else if (act === 'equip') equipItem();
    else if (act === 'drop') dropItem();
    else if (act === 'uneq') unequip(b.getAttribute('data-slot'));
  }

  /* ------------------------------------------------------------ open/close */
  function show(which) {
    if (!ensure()) return;
    clearTimeout(closeT);
    root.classList.remove('closing');
    var wasOpen = !!openPanel;
    if (openPanel && openPanel !== which) closeSheet();
    openPanel = which;
    root.dataset.tab = which;
    if (which === 'inventory') renderInventory(); else renderStats();
    q('#panel-inventory').hidden = which !== 'inventory';
    q('#panel-stats').hidden = which !== 'stats';
    q('#pn-tab-inv').setAttribute('aria-selected', String(which === 'inventory'));
    q('#pn-tab-sta').setAttribute('aria-selected', String(which === 'stats'));
    if (!wasOpen) {
      lastFocus = document.activeElement;
      setBgInert(true);
      root.classList.add('open');
      var tab = q(which === 'inventory' ? '#pn-tab-inv' : '#pn-tab-sta');
      requestAnimationFrame(function () { tab.focus({ preventScroll: true }); });
    }
  }

  var api = {
    openInventory: function () { show('inventory'); },
    /* always the Character tab, never last-used (HUD_SPEC §6) */
    openStats: function () { heroTab = 'character'; show('stats'); },
    openSpells: function () { heroTab = 'spells'; show('stats'); },
    close: function () {
      if (!built || !openPanel) return;
      openPanel = null;
      closeSheet();
      root.classList.add('closing');
      root.classList.remove('open');
      closeT = setTimeout(function () { root.classList.remove('closing'); }, 200);
      setBgInert(false); /* before focus restore — lastFocus may be un-inerted */
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) {
        lastFocus.focus({ preventScroll: true });
      }
      lastFocus = null;
    },
    toggle: function (which) {
      if (which === 'spells') {           /* same semantics as the others */
        if (openPanel === 'stats' && heroTab === 'spells') api.close();
        else api.openSpells();
        return;
      }
      if (which !== 'inventory' && which !== 'stats') return;
      if (openPanel === which) api.close(); else show(which);
    },
    give: function (item) {
      if (!item || !item.id) return null;
      ensure();
      var it = mergeItem(item);
      if (built && openPanel === 'inventory') {
        renderInventory();
        if (sheetId === it.id) renderSheet();
      }
      toast('+' + (item.qty || 1) + ' ' + it.name);
      return it;
    },
    /* THE TAVERN STOCK. Built from SHOP.list() rather than a second list
       here, so a price is changed in one place. Refusals show the reason the
       shop gives — "that costs 120, you have 40" — because a row that just
       does nothing when tapped is indistinguishable from a broken one. */
    openShop: function (who) {
      if (!window.SHOP || !window.PURSE) { toast('The shop is shut.'); return; }
      ensure();
      var P = player(), lvl = P.level | 0;
      var host = document.getElementById('panels');
      var old = document.getElementById('shop'); if (old) old.remove();
      var el = document.createElement('div');
      el.id = 'shop';
      el.className = 'panel on';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Shop');
      function paint() {
        var bal = PURSE.balance();
        var h = '<header><b>' + esc(who || 'Shop') + '</b>' +
                '<span class="sh-bal">' + bal + ' coins</span>' +
                '<button class="panel-x" data-act="shut" aria-label="Close">' +
                svg(IC.x || '', 18) + '</button></header><div class="sh-list">';
        SHOP.list().forEach(function (it) {
          var v = SHOP.canBuy(it.id, lvl, bal);
          h += '<button class="sh-row' + (v.ok ? '' : ' off') +
               '" data-buy="' + esc(it.id) + '"' + (v.ok ? '' : ' disabled') + '>' +
               '<span class="sh-n">' + esc(it.name) + '</span>' +
               '<span class="sh-p">' + it.price + '</span>' +
               '<span class="sh-d">' + esc(it.note) + '</span></button>';
        });
        el.innerHTML = h + '</div>';
      }
      paint();
      el.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-buy],[data-act]');
        if (!b) return;
        if (b.dataset.act === 'shut') { el.remove(); return; }
        var r = SHOP.buy(b.dataset.buy, player().level | 0);
        toast(r.ok ? ('Bought ' + r.item.name + '.') : r.why);
        paint();
        if (openPanel === 'inventory') renderInventory();
      });
      host.appendChild(el);
    },

    /* A NOTICE, for anything outside this file that has to tell the player
       why something did not happen. The world's dungeon gates use it: being
       turned away from a glowing portal with no message is indistinguishable
       from a broken exit.
       ensure() first — toast() is a no-op until the panels exist, so a
       message sent before the player has ever opened their bag would vanish,
       which is exactly when a new player most needs telling. */
    toast: function (msg) {
      if (!msg) return;
      ensure();
      toast(String(msg));
    },
    get open() { return openPanel; }
  };
  return api;
})();
