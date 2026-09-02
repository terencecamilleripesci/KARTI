/* ═══════════════════════════════════════════════════════════════════
   LANDSCAPE — the game only runs sideways.

   WHY IT IS A HARD REQUIREMENT AND NOT A PREFERENCE. This is a Dofus-model
   game: every map is one screen, framed WHOLE, never scrolled. That promise
   is what makes a map readable at a glance and what every seam, camera and
   world-map check in the project is built on.

   The geometry decides it. In this projection a map's bounding box is

       width  = (C + R - 2) * TW/2        TW = 62
       height = (C + R - 2) * TH/2        TH = 46

   so the ratio is ALWAYS 62:46 — about 1.35:1 — whatever the grid is. A
   10x10 map is 558x414. On a phone held upright (390x844) the binding
   dimension is width, and the map has to shrink to 0.70 to fit; held
   sideways (844x390) it is height, and the map fits at 0.94 — near
   one-to-one, which is the difference between a legible character and a
   smudge.

   So portrait does not get a worse version of the game. It gets a card
   asking for the phone to be turned, because the alternative is either a
   map too small to read or a scrolling camera, and scrolling is the one
   thing this design does not do.

   Nothing here touches KARTI's own screens: the RPG runs in its own iframe
   and KARTI's manifest is orientation:"any", so its party games are
   unaffected by any of this.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

window.LANDSCAPE = (function () {

  /* THE TEST IS ORIENTATION, NOT ABSOLUTE HEIGHT — and the first version got
     that wrong. It demanded 380px of viewport height, which is MORE THAN A
     LANDSCAPE PHONE HAS: an 844x390 device reports roughly 300-390 of usable
     height once the browser's own chrome is taken out, so the gate fired on
     exactly the orientation it exists to encourage. Measured in headless
     Chromium at 844x390: innerHeight came back 303.

     So: block a device that is TALLER THAN IT IS WIDE and small enough to be
     a phone. A tablet or a desktop window held upright is still wide enough
     to frame a whole map and is left alone — demanding rotation from
     something that does not need it is obnoxious. */
  const WIDE_ENOUGH = 700;    /* px of width above which upright is fine */

  let card = null, on = false, cb = null;

  function tooSmall() {
    const w = window.innerWidth, h = window.innerHeight;
    return h > w && w < WIDE_ENOUGH;
  }

  function build() {
    if (card) return card;
    card = document.createElement('div');
    card.id = 'rotate-gate';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-label', 'Turn your phone sideways to play');
    card.innerHTML =
      '<div class="rg-in">' +
      /* the phone, drawn rotating — motion says "turn me" faster than words,
         and it is the one thing on this card that survives not reading */
      '<svg class="rg-ph" viewBox="0 0 64 64" aria-hidden="true">' +
      '<rect x="21" y="6" width="22" height="52" rx="4" fill="none" ' +
      'stroke="currentColor" stroke-width="3"/>' +
      '<line x1="28" y1="12" x2="36" y2="12" stroke="currentColor" ' +
      'stroke-width="3" stroke-linecap="round"/>' +
      '</svg>' +
      '<div class="rg-t">Turn your phone</div>' +
      '<div class="rg-s">Il-Qawmien is played sideways, so every map fits ' +
      'the screen whole.</div>' +
      '</div>';
    const st = document.createElement('style');
    st.textContent =
      '#rotate-gate{position:fixed;inset:0;z-index:9999;display:none;' +
      'align-items:center;justify-content:center;background:#0E0B1A;' +
      'color:#EDEAF6;font:500 16px/1.5 system-ui,-apple-system,sans-serif;' +
      'text-align:center;padding:24px}' +
      '#rotate-gate.on{display:flex}' +
      '.rg-in{max-width:19em}' +
      '.rg-ph{width:76px;height:76px;color:#FFC542;' +
      'animation:rg-turn 2.4s ease-in-out infinite}' +
      '.rg-t{font-size:1.35em;font-weight:700;margin:.9em 0 .35em}' +
      '.rg-s{color:#9C97B8;font-size:.95em}' +
      /* the whole point of the card is the motion, so it is the one thing
         that must still be understandable without it */
      '@keyframes rg-turn{0%,15%{transform:rotate(0)}' +
      '55%,100%{transform:rotate(-90deg)}}' +
      '@media (prefers-reduced-motion:reduce){' +
      '.rg-ph{animation:none;transform:rotate(-90deg)}}';
    document.head.appendChild(st);
    document.body.appendChild(card);
    return card;
  }

  function apply() {
    const want = tooSmall();
    if (want === on) return;
    on = want;
    build().classList.toggle('on', on);
    /* TELL THE GAME, do not just cover it. A running game under the card is
       still animating, still stepping timers and still burning battery, and
       when the phone comes back it must re-measure rather than resume with a
       camera sized for the old viewport. */
    if (cb) { try { cb(on); } catch (e) {} }
  }

  function start(onChange) {
    cb = onChange || null;
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    else apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    /* iOS fires resize before the new size is readable; a second look one
       frame later is the difference between gating correctly and gating on
       the size the phone had a moment ago */
    window.addEventListener('orientationchange',
      () => setTimeout(apply, 250));
  }

  return { start, blocked: () => on, WIDE_ENOUGH };
})();
