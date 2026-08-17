/* ═══════════════════════════════════════════════════════════════════
   KARTI_LANG — the one language switch. English or Malti, chosen once
   in Settings, honoured everywhere that has adopted it.

   ── HOW A GAME ADOPTS THIS (budget: about an hour) ─────────────────
   1. At the top of your module:
        const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;
   2. Wrap every player-visible string AT ITS CALL SITE:
        T('Deal the roles', 'Qassam ir-rwoli')
      There is NO key registry on purpose: the two languages live side
      by side where they are used, so a missing translation is just a
      missing argument and t() hands the reader the other language —
      never a bare key like `menu.blurb`.
   3. NAMES ARE NOT LABELS. Role names (In-Nanna, Il-Kaċċatur), game
      names (SKARTA, IL-KIRI) and places (il-pjazza) are the
      characters' names in BOTH languages. Translate what a thing
      does, never what it is called.
   4. Repaint on change, no reload:
        KARTI_LANG.onChange(() => { if (myScreenIsUp) redrawIt(); });
      Redraw only what you own and only if it is actually on screen.
   5. Engine-authored text (strings a pure engine writes into game
      state, e.g. SUSPETT's log) must NOT be translated at the source —
      state is shared and audited. Translate it at DISPLAY time with an
      exact-match table in the UI file; an unmatched line falls back to
      the original. See gameText() in js/suspett-ui.js for the pattern.

   The preference lives in `karti_prefs` (game.js's device prefs)
   under `lang` — a fact about the phone, like reduced motion, so it
   never travels to the cloud and a wiped save keeps it. Default is
   ENGLISH: the app's chrome is English today, so English is the
   least surprising first meeting for a new player.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const KEY = 'karti_prefs';
function read(){
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || '{}');
    return (j && j.lang === 'mt') ? 'mt' : 'en';
  } catch (e){ return 'en'; }
}
let LANG = read();
const subs = [];
function fire(){ for (const f of subs.slice()){ try { f(LANG); } catch (e){} } }

window.KARTI_LANG = {
  /* 'en' | 'mt' — the current choice */
  lang: () => LANG,
  mt: () => LANG === 'mt',
  /* t(en, mt): the line in the current language. Whichever side is
     missing falls back to the other — a screen of English is bad, a
     screen of dotted keys is worse. */
  t: (en, mt) => LANG === 'mt' ? (mt != null ? mt : en) : (en != null ? en : mt),
  /* set + persist + repaint. Persists through game.js's setPref when
     it exists (so its in-memory PREFS copy stays true and a later
     motion toggle cannot clobber the language); direct read-modify-
     write of karti_prefs only when game.js is not up yet. */
  set(v){
    v = v === 'mt' ? 'mt' : 'en';
    if (v === LANG) return;
    LANG = v;
    try {
      if (window.KARTI && KARTI.setPref) KARTI.setPref('lang', v);
      else {
        const j = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
        j.lang = v;
        localStorage.setItem(KEY, JSON.stringify(j));
      }
    } catch (e){}
    fire();
  },
  /* somebody else wrote karti_prefs.lang (another tab, a restore):
     re-read and repaint if it really changed */
  refresh(){ const v = read(); if (v !== LANG){ LANG = v; fire(); } },
  /* subscribe to changes; returns the unsubscribe */
  onChange(fn){
    subs.push(fn);
    return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
  }
};
})();
