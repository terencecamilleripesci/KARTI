/* ═══════════════════════════════════════════════════════════════════════════
   KARTI — IR-REBBIEĦ                                    window.KARTI_REBBIEH
   ───────────────────────────────────────────────────────────────────────────
   The one END-OF-GAME / WINNER screen. Every game in the box — the duel, the
   board games, the card games, poker, tombla — finishes into THIS, so a win
   feels the same weight of celebration wherever it happens and a lobby is one
   tap away instead of a rebuild.

   WHY ONE MODULE, DRIVEN BY DATA
   The screen reaches into nothing. It is handed everything it draws — the
   standings, the avatars, the borders, the XP figures, the callbacks — as
   plain values, so it has no dependency on any game's state, on the duel
   engine, on progress.js, or on the DOM any game owns. That is the whole point:
   nine other workstreams are live and this must be wireable into each of them
   serially without any of them having to be shaped a particular way. Hand it
   what the result already knows and it does the rest.

   THE AVATARS ARE THE HERO. The custom profile pictures are the emotional core
   of the screen — top three raised on a podium, the winner crowned under a slow
   sunburst, the rest ranked below. The chrome (the XP bar, the sunburst, the
   crown) is drawn in CSS/SVG. The ONE class of image this module loads itself
   is the painted currency piles (art/ui/cur-coin-N / cur-chip-N) for the
   reward block — the owner asked for "a bunch of coins for big wins, not one
   coin", and no CSS drawing competes with that art. Every such <img> removes
   itself onerror, so a missing file degrades to the number + label and a
   broken-image glyph can never appear. Avatars honour a `border` id by drawing
   a frame, falling back to an initials tile when an avatar is null.

   COMPOSITOR-ONLY. Every animation is transform/opacity — the sunburst is the
   daily-spin trick (a conic-gradient rasterised once, then rotated), the
   podium rises and the avatars pop with transforms, the XP bar fills with a
   transform on an inner fill. The only per-frame JS is the count-up timer for
   the gained-XP number, and it stops the instant the number lands.

   REDUCED MOTION. Honoured two ways — the `reduced` param AND a live
   prefers-reduced-motion check (either turns it off). With motion off nothing
   turns, nothing pops, nothing counts up: the final state is painted at once
   and it is still handsome, just still.

   OWNERSHIP: this file owns exactly one overlay element (#kr-root) and one
   <style> tag (#kr-style), both of which it creates and injects. It edits no
   DOM it did not create.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  if (global.KARTI_REBBIEH) return;

  var doc = global.document;

  /* ── the language idiom, self-contained ──────────────────────────────────
     The house pattern is  const T = (en, mt) => KARTI_LANG ? … : en.  We take
     a lang param too, so a caller can force a language regardless of the global
     preference (some games pass their own). Precedence: explicit lang param →
     KARTI_LANG → English. No hard dependency on lang.js. */
  function makeT(lang) {
    var pref = (lang === 'mt' || lang === 'en') ? lang
             : (global.KARTI_LANG ? global.KARTI_LANG.lang() : 'en');
    return function (en, mt) {
      if (pref === 'mt') return mt != null ? mt : en;
      return en != null ? en : mt;
    };
  }

  /* ── reduced motion: the param OR a live media query ──────────────────────
     Either one turns motion off. body.reduced is the app-wide class the rest
     of KARTI uses; we read it too so we agree with the chrome. */
  function motionOff(reducedParam) {
    if (reducedParam) return true;
    try {
      if (doc.body && doc.body.classList.contains('reduced')) return true;
      var mq = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq && mq.matches) return true;
    } catch (e) {}
    return false;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Initials for the fallback tile — first letters of up to two words. */
  function initials(name) {
    var s = String(name || '').trim();
    if (!s) return '?';
    var parts = s.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* A stable hue from a name, so the initials tile is coloured and consistent
     rather than one flat grey — the avatars are the hero, and even the fallback
     should look deliberate. */
  function hue(name) {
    var s = String(name || ''), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 360;
  }

  /* ═══════════════════════ CSS — injected once ═══════════════════════════
     Namespaced under #kr-root so it cannot touch any game's styling. Uses the
     app tokens (--gold, --bg, --panel…) with hard fallbacks so the module is
     still handsome if it is ever shown before index.html's :root is parsed
     (e.g. the isolated test harness). */
  var CSS_ID = 'kr-style';
  function injectCSS() {
    if (doc.getElementById(CSS_ID)) return;
    var st = doc.createElement('style');
    st.id = CSS_ID;
    st.textContent = [
      /* ── the overlay ── */
      '#kr-root{position:fixed;inset:0;z-index:12000;display:flex;flex-direction:column;',
      '  align-items:center;justify-content:center;font-family:var(--body,system-ui,sans-serif);color:var(--txt,#F4EFFF);',
      '  padding:calc(env(safe-area-inset-top,0px) + 10px) 14px calc(env(safe-area-inset-bottom,0px) + 12px);',
      '  background:radial-gradient(1100px 720px at 50% -10%, rgba(60,40,110,.55) 0%, transparent 60%),',
      '    rgba(8,5,15,.92);',
      '  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
      '  overflow:hidden;opacity:0;transition:opacity .22s var(--ease,cubic-bezier(.22,.9,.28,1)))}',
      '#kr-root.on{opacity:1}',
      '#kr-root *{box-sizing:border-box}',

      /* ── title ── */
      '#kr-root .kr-title{flex:0 0 auto;text-align:center;font-family:var(--disp,"Exo 2",sans-serif);',
      '  font-weight:900;font-size:clamp(20px,6.4vw,30px);letter-spacing:.06em;line-height:1;',
      '  margin:2px 0 2px;background:linear-gradient(180deg,#FFF3CF,var(--gold,#FFC542),#C77A00);',
      '  -webkit-background-clip:text;background-clip:text;color:transparent;',
      '  filter:drop-shadow(0 2px 10px rgba(255,197,66,.28))}',
      '#kr-root .kr-sub{flex:0 0 auto;text-align:center;font-family:var(--disp,"Exo 2",sans-serif);',
      '  font-weight:700;font-size:11px;letter-spacing:.2em;text-transform:uppercase;',
      '  color:var(--dim,#A093C4);margin-bottom:6px}',

      /* ── scroll body: podium + list, this is the part that scrolls ── */
      /* flex:0 1 — GROW was the bug. The body used to swell to every spare
         pixel, so a four-player table left a hand's width of nothing between
         the last name and the rewards while an eight-player one looked right.
         Shrink-only plus a centred root means the stack hugs its content and
         sits in the middle; min-height:0 is what actually lets a flex child
         shrink below its content and start scrolling on a long table. */
      '#kr-root .kr-body{flex:0 1 auto;min-height:0;width:100%;max-width:520px;',
      '  overflow-y:auto;overflow-x:hidden;',
      '  -webkit-overflow-scrolling:touch;display:flex;flex-direction:column;align-items:center;',
      '  scrollbar-width:none}',
      '#kr-root .kr-body::-webkit-scrollbar{display:none}',

      /* ── the podium ── */
      '#kr-root .kr-podium{position:relative;width:100%;display:flex;justify-content:center;',
      '  align-items:flex-end;gap:6px;padding:6px 4px 0}',
      '#kr-root .kr-col{position:relative;display:flex;flex-direction:column;align-items:center;',
      '  flex:0 1 auto;justify-content:flex-end}',
      '#kr-root .kr-col.p1{order:2;z-index:3}',
      '#kr-root .kr-col.p2{order:1;z-index:2}',
      '#kr-root .kr-col.p3{order:3;z-index:1}',
      /* name+score sit above the riser; the riser is bottom-anchored so the three
         risers form a real stepped podium (1st tallest, centre). */
      '#kr-root .kr-block{margin-top:6px;border-radius:10px 10px 0 0;',
      '  background:linear-gradient(180deg,var(--panel2,#241A3E),var(--panel,#1B1430));',
      '  border:1px solid var(--line,rgba(255,255,255,.10));border-bottom:0;',
      '  display:flex;align-items:flex-start;justify-content:center;padding-top:5px;',
      '  font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;color:var(--gold,#FFC542);',
      '  width:74px}',
      '#kr-root .kr-col.p1 .kr-block{height:52px;font-size:24px;',
      '  background:linear-gradient(180deg,rgba(255,197,66,.30),rgba(255,197,66,.05));',
      '  border-color:rgba(255,197,66,.4)}',
      '#kr-root .kr-col.p2 .kr-block{height:34px;font-size:18px;color:#D6D8E4}',
      '#kr-root .kr-col.p3 .kr-block{height:22px;font-size:16px;color:#D69A6E}',

      /* ── the sunburst behind the winner (daily-spin trick) ── */
      '#kr-root .kr-rays{position:absolute;left:50%;top:34px;width:230px;height:230px;',
      '  margin-left:-115px;pointer-events:none;z-index:0;opacity:0;',
      "  background:repeating-conic-gradient(from 0deg,rgba(255,210,74,.9) 0 3deg," +
      '    transparent 3deg 20deg);',
      '  -webkit-mask:radial-gradient(circle,#000 14%,transparent 54%);',
      '  mask:radial-gradient(circle,#000 14%,transparent 54%)}',

      /* ── avatars ── */
      '#kr-root .kr-av{position:relative;border-radius:16px;overflow:hidden;',
      '  background:var(--panel,#1B1430);display:grid;place-items:center;',
      '  font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;color:#fff;',
      '  box-shadow:0 6px 18px rgba(0,0,0,.5)}',
      '#kr-root .kr-av img{width:100%;height:100%;object-fit:cover;display:block}',
      '#kr-root .kr-av .kr-ini{font-size:.42em;letter-spacing:.02em}',
      '#kr-root .kr-col.p1 .kr-av{width:96px;height:96px;font-size:96px}',
      '#kr-root .kr-col.p2 .kr-av,#kr-root .kr-col.p3 .kr-av{width:70px;height:70px;font-size:70px}',
      /* cosmetic border frame — a ring drawn over the avatar, honouring `border` */
      '#kr-root .kr-av.kr-bordered{box-shadow:0 0 0 3px var(--kr-bc,var(--gold,#FFC542)),0 6px 18px rgba(0,0,0,.5)}',

      /* crown over the winner (drawn SVG, no image, no emoji) */
      '#kr-root .kr-crown{position:absolute;left:50%;top:-20px;width:52px;height:34px;',
      '  margin-left:-26px;z-index:4;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}',

      /* place badge on the podium avatar */
      '#kr-root .kr-place{position:absolute;right:-6px;bottom:-6px;width:26px;height:26px;',
      '  border-radius:50%;display:grid;place-items:center;font-family:var(--disp,"Exo 2",sans-serif);',
      '  font-weight:900;font-size:13px;color:#241800;z-index:5;',
      '  background:linear-gradient(180deg,#FFDE8B,var(--gold,#FFC542));',
      '  border:2px solid var(--bg,#0E0B14)}',
      '#kr-root .kr-col.p2 .kr-place{background:linear-gradient(180deg,#EFEFF6,#B9B9C8)}',
      '#kr-root .kr-col.p3 .kr-place{background:linear-gradient(180deg,#E7A87A,#B87333)}',

      /* names + scores under each podium avatar */
      '#kr-root .kr-name{margin-top:7px;font-family:var(--disp,"Exo 2",sans-serif);font-weight:700;',
      '  font-size:12.5px;max-width:88px;text-align:center;overflow:hidden;text-overflow:ellipsis;',
      '  white-space:nowrap;line-height:1.15}',
      '#kr-root .kr-col.p1 .kr-name{font-size:14px;color:var(--gold,#FFC542)}',
      '#kr-root .kr-score{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:11px;',
      '  color:var(--dim,#A093C4);font-variant-numeric:tabular-nums;line-height:1.2}',
      '#kr-root .kr-you{position:absolute;left:-4px;bottom:-6px;z-index:6;',
      '  font-family:var(--disp,"Exo 2",sans-serif);',
      '  font-weight:900;font-size:8.5px;letter-spacing:.12em;color:#241800;background:var(--gold,#FFC542);',
      '  border-radius:99px;padding:1px 6px;border:2px solid var(--bg,#0E0B14)}',

      /* ── the ranked list (places 4+) ── */
      '#kr-root .kr-list{width:100%;max-width:460px;margin:8px auto 4px;display:flex;',
      '  flex-direction:column;gap:6px;padding:0 2px}',
      '#kr-root .kr-row{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:12px;',
      '  background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.10))}',
      '#kr-root .kr-row.kr-me{border-color:var(--gold,#FFC542);',
      '  background:linear-gradient(90deg,rgba(255,197,66,.14),var(--panel,#1B1430))}',
      '#kr-root .kr-row .kr-rk{width:22px;text-align:center;font-family:var(--disp,"Exo 2",sans-serif);',
      '  font-weight:900;font-size:14px;color:var(--dim,#A093C4);font-variant-numeric:tabular-nums;flex:0 0 auto}',
      '#kr-root .kr-row .kr-av{width:36px;height:36px;font-size:36px;border-radius:10px;flex:0 0 auto;box-shadow:none}',
      '#kr-root .kr-row .kr-av.kr-bordered{box-shadow:0 0 0 2px var(--kr-bc,var(--gold,#FFC542))}',
      '#kr-root .kr-row .kr-rn{flex:1 1 auto;font-family:var(--disp,"Exo 2",sans-serif);font-weight:700;',
      '  font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#kr-root .kr-row .kr-rs{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:12px;',
      '  color:var(--gold,#FFC542);font-variant-numeric:tabular-nums;flex:0 0 auto}',
      '#kr-root .kr-tag{font-family:var(--disp,"Exo 2",sans-serif);font-weight:700;font-size:8px;',
      '  letter-spacing:.1em;color:var(--dim2,#7F73A0);border:1px solid var(--line,rgba(255,255,255,.10));',
      '  border-radius:99px;padding:1px 5px;flex:0 0 auto}',

      /* ── the XP block ── */
      '#kr-root .kr-xp{flex:0 0 auto;width:100%;max-width:460px;margin:6px auto 2px;padding:0 4px}',
      '#kr-root .kr-xp-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:5px}',
      '#kr-root .kr-xp-lv{display:flex;align-items:center;gap:7px;font-family:var(--disp,"Exo 2",sans-serif);',
      '  font-weight:900;font-size:13px;letter-spacing:.04em}',
      '#kr-root .kr-lvbadge{display:grid;place-items:center;min-width:26px;height:26px;padding:0 6px;',
      '  border-radius:8px;font-size:13px;color:#241800;',
      '  background:linear-gradient(180deg,#FFDE8B,var(--gold,#FFC542))}',
      '#kr-root .kr-xp-g{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:13px;',
      '  color:var(--ok,#3DDC84);font-variant-numeric:tabular-nums}',
      '#kr-root .kr-bar{position:relative;height:14px;border-radius:99px;overflow:hidden;',
      '  background:rgba(255,255,255,.08);border:1px solid var(--line,rgba(255,255,255,.10))}',
      '#kr-root .kr-fill{position:absolute;left:0;top:0;bottom:0;width:100%;border-radius:99px;',
      '  transform-origin:left center;transform:scaleX(0);',
      '  background:linear-gradient(90deg,var(--hot,#E8452C),var(--gold,#FFC542))}',
      '#kr-root .kr-lvup{margin-top:6px;text-align:center;font-family:var(--disp,"Exo 2",sans-serif);',
      '  font-weight:900;font-size:12px;letter-spacing:.14em;color:var(--gold,#FFC542);',
      '  text-transform:uppercase;opacity:0}',

      /* ── the reward block: what this game actually paid ──
         A row of small cards (XP / chips / coins / pot), each a painted pile
         with a count-up number under it, then the winner-bonus ribbon. Cards
         flex evenly so two cards or four both centre nicely at 360px. The
         numbers are real text nodes, never baked into the art, so a screen
         reader gets the figures even if every image fails. */
      '#kr-root .kr-rw{flex:0 0 auto;width:100%;max-width:460px;margin:6px auto 0;padding:0 4px}',
      '#kr-root .kr-rw-cards{display:flex;gap:8px;justify-content:center}',
      '#kr-root .kr-rc{flex:1 1 0;min-width:0;max-width:118px;display:flex;flex-direction:column;',
      '  align-items:center;padding:8px 4px 7px;border-radius:14px;',
      '  background:linear-gradient(180deg,rgba(255,197,66,.10),rgba(255,255,255,.03));',
      '  border:1px solid rgba(255,197,66,.22)}',
      '#kr-root .kr-rc-art{position:relative;width:56px;height:56px;margin-bottom:2px}',
      '#kr-root .kr-rc-art img,#kr-root .kr-rc-art svg{position:relative;width:100%;height:100%;',
      '  object-fit:contain;display:block;z-index:1;filter:drop-shadow(0 4px 8px rgba(0,0,0,.45))}',
      /* the landing flash: a warm glow that blooms behind the pile the moment
         it drops in. Base state is invisible, so with motion off it simply
         never exists visually. */
      '#kr-root .kr-rc-flash{position:absolute;inset:-8px;border-radius:50%;z-index:0;opacity:0;',
      '  transform:scale(.4);pointer-events:none;',
      '  background:radial-gradient(circle,rgba(255,220,120,.6) 0%,transparent 68%)}',
      /* the glint: a light strip swept across the pile by transform alone. The
         circular overflow window roughly matches the pile silhouette. */
      '#kr-root .kr-rc-shine{position:absolute;inset:2px;border-radius:50%;overflow:hidden;',
      '  z-index:2;pointer-events:none}',
      '#kr-root .kr-rc-shine i{position:absolute;top:-30%;bottom:-30%;left:0;width:34%;opacity:0;',
      '  transform:translateX(-180%) rotate(16deg);',
      '  background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent)}',
      '#kr-root .kr-rc-num{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:17px;',
      '  color:var(--gold,#FFC542);font-variant-numeric:tabular-nums;line-height:1.2}',
      '#kr-root .kr-rc-lab{font-family:var(--disp,"Exo 2",sans-serif);font-weight:700;font-size:8.5px;',
      '  letter-spacing:.14em;text-transform:uppercase;color:var(--dim,#A093C4);margin-top:1px;',
      '  max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

      /* the winner-bonus ribbon — deliberately the only solid-gold surface on
         the screen besides the primary button, so the extra reads as the prize
         it is, not as another list row. */
      '#kr-root .kr-rw-bonus{position:relative;overflow:hidden;margin:7px auto 0;width:max-content;',
      '  max-width:100%;display:flex;align-items:center;justify-content:center;gap:6px;',
      '  padding:6px 16px;border-radius:99px;font-family:var(--disp,"Exo 2",sans-serif);',
      '  font-weight:900;font-size:12.5px;letter-spacing:.04em;color:#241800;',
      '  background:linear-gradient(180deg,#FFE9A8,var(--gold,#FFC542) 55%,#E8A21C);',
      '  border:1px solid #FFF3CF;box-shadow:0 4px 14px rgba(255,197,66,.35)}',
      '#kr-root .kr-rw-bonus .kr-bstar{width:14px;height:14px;flex:0 0 auto}',
      '#kr-root .kr-rw-bonus b{font-variant-numeric:tabular-nums}',
      '#kr-root .kr-rw-bonus i{position:absolute;top:-30%;bottom:-30%;left:0;width:26%;opacity:0;',
      '  transform:translateX(-220%) rotate(16deg);pointer-events:none;',
      '  background:linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent)}',
      '#kr-root .kr-rw-cap{margin-top:5px;text-align:center;',
      '  font-family:var(--body,system-ui,sans-serif);font-weight:600;font-size:10.5px;',
      '  color:var(--dim,#A093C4)}',

      /* ── the buttons ── */
      '#kr-root .kr-acts{flex:0 0 auto;width:100%;max-width:460px;margin:8px auto 0;display:flex;',
      '  flex-direction:column;gap:8px}',
      '#kr-root .kr-btn{min-height:52px;border-radius:14px;font-family:var(--disp,"Exo 2",sans-serif);',
      '  font-weight:900;font-size:16px;letter-spacing:.04em;display:flex;align-items:center;',
      '  justify-content:center;gap:8px;border:1px solid transparent}',
      '#kr-root .kr-btn.kr-primary{background:linear-gradient(180deg,#FFD979,var(--gold,#FFC542));',
      '  color:#241800;border-color:#FFE9B0;box-shadow:0 6px 18px rgba(255,197,66,.28)}',
      '#kr-root .kr-btn.kr-ghost{background:transparent;color:var(--dim,#A093C4);',
      '  border-color:var(--line2,rgba(255,255,255,.18))}',
      '#kr-root .kr-btn:active{transform:translateY(1px)}',
      '#kr-root .kr-btn:focus-visible{outline:3px solid var(--gold,#FFC542);outline-offset:2px}',
      '#kr-root .kr-cap{text-align:center;font-family:var(--body,system-ui,sans-serif);font-weight:600;',
      '  font-size:11px;line-height:1.35;color:var(--dim,#A093C4);margin:-2px 2px 2px}',

      /* ═══════════ MOTION ═══════════
         Everything below is opt-IN: applied only on #kr-root.kr-anim, which is
         set only when motion is allowed. With motion off the class is absent
         and every element sits at its final state. */
      '#kr-root .kr-col{opacity:1;transform:none}',
      '#kr-root .kr-list,#kr-root .kr-xp,#kr-root .kr-rw,#kr-root .kr-acts{opacity:1}',

      '#kr-root.kr-anim .kr-col{opacity:0;transform:translateY(26px)}',
      '#kr-root.kr-anim .kr-av-pop{opacity:0;transform:scale(.4)}',
      '#kr-root.kr-anim .kr-list,#kr-root.kr-anim .kr-xp,#kr-root.kr-anim .kr-rw,',
      '#kr-root.kr-anim .kr-acts{opacity:0}',

      '#kr-root.kr-anim.kr-go .kr-col{opacity:1;transform:none;',
      '  transition:opacity .34s var(--ease,cubic-bezier(.22,.9,.28,1)),',
      '    transform .42s var(--ease,cubic-bezier(.22,.9,.28,1))}',
      '#kr-root.kr-anim.kr-go .kr-col.p1{transition-delay:.10s}',
      '#kr-root.kr-anim.kr-go .kr-col.p2{transition-delay:.02s}',
      '#kr-root.kr-anim.kr-go .kr-col.p3{transition-delay:.16s}',

      /* avatars pop with a slight overshoot after the column has risen */
      '#kr-root.kr-anim.kr-go .kr-av-pop{opacity:1;transform:none;',
      '  transition:opacity .26s ease,transform .4s var(--kr-overshoot,cubic-bezier(.34,1.56,.64,1))}',
      '#kr-root.kr-anim.kr-go .kr-col.p1 .kr-av-pop{transition-delay:.30s}',
      '#kr-root.kr-anim.kr-go .kr-col.p2 .kr-av-pop{transition-delay:.24s}',
      '#kr-root.kr-anim.kr-go .kr-col.p3 .kr-av-pop{transition-delay:.36s}',

      '#kr-root.kr-anim.kr-go .kr-list,#kr-root.kr-anim.kr-go .kr-xp,',
      '#kr-root.kr-anim.kr-go .kr-rw,#kr-root.kr-anim.kr-go .kr-acts{opacity:1;transition:opacity .3s ease}',
      '#kr-root.kr-anim.kr-go .kr-list{transition-delay:.42s}',
      '#kr-root.kr-anim.kr-go .kr-rw{transition-delay:.5s}',
      '#kr-root.kr-anim.kr-go .kr-xp{transition-delay:.56s}',
      '#kr-root.kr-anim.kr-go .kr-acts{transition-delay:.72s}',

      /* ═══ reward choreography — one continuous beat after the podium ═══
         The piles drop in left-to-right with an overshoot (that IS the
         "landed" feel), each followed a beat later by its glow flash and a
         glint sweep; the bonus ribbon arrives last, after every pile is down,
         so the winner's extra is the closing note rather than noise in the
         middle. All of it is transform/opacity; all delays live here in CSS so
         the sequence is one timeline, not scattered timers. */
      '#kr-root.kr-anim .kr-rc-art{opacity:0;transform:scale(.25) translateY(-14px)}',
      '#kr-root.kr-anim.kr-go .kr-rc-art{opacity:1;transform:none;',
      '  transition:opacity .22s ease,transform .5s var(--kr-overshoot,cubic-bezier(.34,1.56,.64,1))}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(1) .kr-rc-art{transition-delay:.62s}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(2) .kr-rc-art{transition-delay:.78s}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(3) .kr-rc-art{transition-delay:.94s}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(4) .kr-rc-art{transition-delay:1.08s}',
      '#kr-root.kr-anim.kr-go .kr-rc-flash{animation:kr-flash .55s ease forwards}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(1) .kr-rc-flash{animation-delay:.74s}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(2) .kr-rc-flash{animation-delay:.90s}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(3) .kr-rc-flash{animation-delay:1.06s}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(4) .kr-rc-flash{animation-delay:1.20s}',
      '@keyframes kr-flash{0%{opacity:0;transform:scale(.4)}35%{opacity:1;transform:scale(1.1)}',
      '  100%{opacity:0;transform:scale(1.35)}}',
      '#kr-root.kr-anim.kr-go .kr-rc-shine i{animation:kr-glint .7s ease forwards}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(1) .kr-rc-shine i{animation-delay:1.05s}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(2) .kr-rc-shine i{animation-delay:1.21s}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(3) .kr-rc-shine i{animation-delay:1.37s}',
      '#kr-root.kr-anim.kr-go .kr-rc:nth-child(4) .kr-rc-shine i{animation-delay:1.51s}',
      '@keyframes kr-glint{0%{opacity:0;transform:translateX(-180%) rotate(16deg)}',
      '  30%{opacity:1}100%{opacity:0;transform:translateX(420%) rotate(16deg)}}',

      '#kr-root.kr-anim .kr-rw-bonus{opacity:0;transform:translateY(10px) scale(.9)}',
      '#kr-root.kr-anim.kr-go .kr-rw-bonus{opacity:1;transform:none;transition:opacity .28s ease 1.25s,',
      '  transform .45s var(--kr-overshoot,cubic-bezier(.34,1.56,.64,1)) 1.25s}',
      '#kr-root.kr-anim.kr-go .kr-rw-bonus i{animation:kr-bshine 1.4s ease 1.6s 2}',
      '@keyframes kr-bshine{0%{opacity:0;transform:translateX(-220%) rotate(16deg)}',
      '  25%{opacity:1}55%,100%{opacity:0;transform:translateX(560%) rotate(16deg)}}',

      /* ═══ festa sparks + crown ring — the winner-only celebration ═══
         Spawned by JS (motion permitting) over the champion avatar: gold,
         pearl and crimson chips of light thrown outward, hanging at the top
         of the arc, then settling and dying — festa confetti, not rain. Each
         particle gets its own trajectory via custom properties so ONE
         keyframe animation serves every spark. */
      '#kr-root .kr-sparks{position:absolute;inset:0;pointer-events:none;z-index:60}',
      '#kr-root .kr-spark{position:absolute;width:7px;height:7px;border-radius:2px;opacity:0;',
      '  animation:kr-spark var(--kd,.95s) cubic-bezier(.16,.8,.32,1) var(--ks,0s) forwards}',
      '@keyframes kr-spark{',
      '  0%{transform:translate(-50%,-50%) scale(.3) rotate(0deg);opacity:0}',
      '  10%{opacity:1}',
      '  65%{transform:translate(calc(-50% + var(--kx)),calc(-50% + var(--ky))) scale(1) rotate(var(--kr));opacity:1}',
      '  100%{transform:translate(calc(-50% + var(--kx)),calc(-50% + var(--ky2))) scale(.15) rotate(var(--kr));opacity:0}}',
      '#kr-root .kr-ring{position:absolute;inset:-4px;border-radius:20px;pointer-events:none;z-index:6;',
      '  border:3px solid rgba(255,213,90,.9);opacity:0;',
      '  animation:kr-ringp .8s ease-out forwards}',
      '@keyframes kr-ringp{0%{opacity:.95;transform:scale(1)}100%{opacity:0;transform:scale(1.6)}}',

      /* the sunburst turns — transform + opacity only, rasterised once */
      '#kr-root.kr-anim .kr-rays{animation:kr-rays 9s linear infinite}',
      '@keyframes kr-rays{from{transform:rotate(0);opacity:.3}50%{opacity:.46}',
      '  to{transform:rotate(360deg);opacity:.3}}',

      /* the XP fill animates its scaleX (compositor only) via a transition set
         inline when it runs; keyframe here is only the level-up flourish */
      '#kr-root.kr-anim .kr-lvbadge.kr-pulse{animation:kr-pulse .6s var(--ease,ease) 1}',
      '@keyframes kr-pulse{0%{transform:scale(1)}40%{transform:scale(1.35)}to{transform:scale(1)}}',
      '#kr-root.kr-anim .kr-lvup.kr-show{animation:kr-lvup .5s ease forwards}',
      '@keyframes kr-lvup{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',

      /* honour the app-wide reduced class AND the media query as a hard stop */
      'body.reduced #kr-root .kr-rays{animation:none}',
      '@media (prefers-reduced-motion:reduce){#kr-root .kr-rays,#kr-root .kr-col,',
      '  #kr-root .kr-av-pop,#kr-root .kr-lvbadge,#kr-root .kr-lvup,#kr-root .kr-rc-art,',
      '  #kr-root .kr-rc-flash,#kr-root .kr-rc-shine i,#kr-root .kr-rw-bonus,',
      '  #kr-root .kr-rw-bonus i,#kr-root .kr-spark,#kr-root .kr-ring{animation:none!important;',
      '  transition:none!important}}',

      /* ── short portrait phones: shrink the piles before anything clips ── */
      '@media (max-height:740px){',
      '  #kr-root .kr-rc-art{width:46px;height:46px}',
      '  #kr-root .kr-rc{padding:6px 4px 6px}',
      '  #kr-root .kr-rc-num{font-size:15px}',
      '  #kr-root .kr-rw-bonus{margin-top:5px;font-size:11.5px;padding:5px 14px}',
      '}',

      /* ── landscape: podium shorter, list to the side of it via wrap ── */
      '@media (max-height:460px){',
      '  #kr-root{flex-direction:column}',
      '  #kr-root .kr-podium{min-height:120px}',
      '  #kr-root .kr-col.p1 .kr-av{width:74px;height:74px;font-size:74px}',
      '  #kr-root .kr-col.p2 .kr-av,#kr-root .kr-col.p3 .kr-av{width:56px;height:56px;font-size:56px}',
      '  #kr-root .kr-title{font-size:20px}',
      '  #kr-root .kr-btn{min-height:46px;font-size:14px}',
      '  #kr-root .kr-rc-art{width:32px;height:32px}',
      '  #kr-root .kr-rc{padding:4px 4px 5px}',
      '  #kr-root .kr-rc-num{font-size:13px}',
      '}'
    ].join('\n');
    doc.head.appendChild(st);
  }

  /* ═══════════════════════ SVG bits ══════════════════════════════════════ */
  function crownSVG() {
    /* a five-point crown with a gold gradient, drawn once. No emoji, no image. */
    return '<svg class="kr-crown" viewBox="0 0 52 34" aria-hidden="true">' +
      '<defs><linearGradient id="krCrownG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#FFF3CF"/><stop offset=".5" stop-color="#FFC542"/>' +
      '<stop offset="1" stop-color="#C77A00"/></linearGradient></defs>' +
      '<path d="M3 12 L13 20 L26 5 L39 20 L49 12 L45 31 L7 31 Z" ' +
      'fill="url(#krCrownG)" stroke="#7a4d00" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<circle cx="3" cy="12" r="3" fill="url(#krCrownG)"/>' +
      '<circle cx="49" cy="12" r="3" fill="url(#krCrownG)"/>' +
      '<circle cx="26" cy="5" r="3.2" fill="url(#krCrownG)"/>' +
      '<circle cx="18" cy="31" r="1.7" fill="#E8452C"/>' +
      '<circle cx="26" cy="31" r="1.7" fill="#8A5CFF"/>' +
      '<circle cx="34" cy="31" r="1.7" fill="#3DDC84"/></svg>';
  }

  /* The XP card has no painted pile (there is no cur-xp art, and none is
     needed — XP is not a currency), so it gets a drawn gold starburst
     medallion instead, in the same visual weight as the piles beside it. */
  function xpMedalSVG() {
    return '<svg viewBox="0 0 56 56" aria-hidden="true">' +
      '<defs><radialGradient id="krXpG" cx=".5" cy=".38" r=".7">' +
      '<stop offset="0" stop-color="#FFF3CF"/><stop offset=".55" stop-color="#FFC542"/>' +
      '<stop offset="1" stop-color="#C77A00"/></radialGradient></defs>' +
      '<path d="M28 2 L33 17 L48 12 L39 25 L54 28 L39 31 L48 44 L33 39 L28 54 ' +
      'L23 39 L8 44 L17 31 L2 28 L17 25 L8 12 L23 17 Z" fill="url(#krXpG)" ' +
      'stroke="#7a4d00" stroke-width="1" stroke-linejoin="round"/>' +
      '<circle cx="28" cy="28" r="9" fill="#FFF3CF" opacity=".9"/>' +
      '<circle cx="28" cy="28" r="5.5" fill="#C8102E"/></svg>';
  }

  /* Small four-point star inside the winner-bonus ribbon (dark on gold). */
  function bonusStarSVG() {
    return '<svg class="kr-bstar" viewBox="0 0 14 14" aria-hidden="true">' +
      '<path d="M7 0 L8.8 5.2 L14 7 L8.8 8.8 L7 14 L5.2 8.8 L0 7 L5.2 5.2 Z" fill="#241800"/></svg>';
  }

  /* ═══════════════════════ currency tiers ════════════════════════════════
     "A bunch of coins for big wins, not one coin" — the amount picks which of
     the four painted piles we show, from a single coin to the jackpot mound.
     The thresholds match the rest of the app (game.js CUR_TIERS) but are
     REDECLARED here on purpose: this module reaches into nothing, and a copy
     of four numbers is a far smaller cost than a dependency. */
  var CUR_TIERS = { coins: [0, 50, 200, 600], chips: [0, 40, 150, 400] };
  function curTier(kind, amount) {
    var t = CUR_TIERS[kind] || CUR_TIERS.chips;
    var k = 0;
    for (var i = 0; i < t.length; i++) if (amount >= t[i]) k = i;
    return Math.min(4, Math.max(1, k + 1));
  }

  /* ═══════════════════════ avatar markup ═════════════════════════════════
     avatar: a src (data-URL or path) or null. border: a cosmetic id → we draw a
     frame and colour it from a small palette keyed off the id (so any id gets a
     stable, tasteful colour without this module owning a border registry). */
  var BORDER_COLORS = {
    gold: '#FFC542', silver: '#C9CBD6', bronze: '#B87333', neon: '#8A5CFF',
    ruby: '#FF5468', jade: '#3DDC84', fire: '#E8452C', ice: '#7FD4FF'
  };
  function borderColor(id) {
    if (!id) return null;
    if (BORDER_COLORS[id]) return BORDER_COLORS[id];
    /* unknown id → stable hue so a border always shows something deliberate */
    return 'hsl(' + hue(id) + ' 70% 62%)';
  }

  function avatarHTML(row, popClass) {
    var bc = borderColor(row.border);
    var cls = 'kr-av' + (bc ? ' kr-bordered' : '') + (popClass ? ' ' + popClass : '');
    var style = bc ? ' style="--kr-bc:' + esc(bc) + '"' : '';
    var inner;
    if (row.avatar) {
      inner = '<img src="' + esc(row.avatar) + '" alt="" ' +
        'onerror="this.style.display=\'none\';this.parentNode.classList.add(\'kr-imgfail\')">';
    } else {
      inner = '<span class="kr-ini" style="background:linear-gradient(160deg,hsl(' +
        hue(row.name) + ' 55% 42%),hsl(' + ((hue(row.name) + 40) % 360) +
        ' 55% 30%));position:absolute;inset:0;display:grid;place-items:center">' +
        esc(initials(row.name)) + '</span>';
    }
    return '<div class="' + cls + '"' + style + '>' + inner + '</div>';
  }

  /* ═══════════════════════ state ═════════════════════════════════════════ */
  var root = null;
  var timers = [];
  var rafIds = [];
  var lastOpts = null;

  function clearTimers() {
    for (var i = 0; i < timers.length; i++) { try { clearTimeout(timers[i]); } catch (e) {} }
    timers.length = 0;
    for (var j = 0; j < rafIds.length; j++) { try { cancelAnimationFrame(rafIds[j]); } catch (e) {} }
    rafIds.length = 0;
  }
  function later(ms, fn) {
    var t = setTimeout(function () { try { fn(); } catch (e) {} }, ms);
    timers.push(t);
    return t;
  }
  /* EVERY animation frame this module ever asks for goes through here, so
     hide() can cancel all of them in one sweep — with several count-ups
     running at once, a single stored handle is no longer enough, and a frame
     that fires after teardown would be a bug. Fired frames deregister
     themselves so the list stays a handful of live handles, never a log. */
  function raf(fn) {
    var id = requestAnimationFrame(function (now) {
      var ix = rafIds.indexOf(id);
      if (ix > -1) rafIds.splice(ix, 1);
      try { fn(now); } catch (e) {}
    });
    rafIds.push(id);
    return id;
  }

  function sfx(opts, id) {
    if (opts && typeof opts.sound === 'function') { try { opts.sound(id); } catch (e) {} }
  }

  /* Maltese number–noun agreement is real: 2–10 take the plural, 1 and 11+
     the singular ("5 ċipep" but "50 ċipa"). Getting this wrong reads as
     machine translation to any Maltese speaker, so it gets its own helper. */
  function unitEN(n, sing, plur) { return n === 1 ? sing : plur; }
  function unitMT(n, sing, plur) { return (n >= 2 && n <= 10) ? plur : sing; }

  /* ═══════════════════════ the reward block ══════════════════════════════
     opts.reward = { xp, chips, coins, wonBonus, staked, pot } — everything
     optional, all plain numbers, handed to us by whoever called awardPlay.
     We draw a card per non-zero figure (XP / chips / coins / pot, in that
     order), each a painted pile picked by tier, then the winner-bonus ribbon.
     The bonus is deliberately NOT added into the XP card: the owner wants the
     winner's extra to read as its own prize, and folding it in would make it
     invisible. No reward object, or an all-zero one, draws nothing — old
     callers that only pass opts.xp are untouched. */
  function rewardHTML(opts, T) {
    var none = { html: '', hasXpCard: false, hasBonus: false };
    var r = opts.reward;
    if (!r || typeof r !== 'object') return none;
    function amt(v) { v = Math.round(num(v)); return v > 0 ? v : 0; }
    var xp = amt(r.xp), chips = amt(r.chips), coins = amt(r.coins),
        bonus = amt(r.wonBonus), staked = amt(r.staked), pot = amt(r.pot);
    if (!xp && !chips && !coins && !bonus && !pot && !staked) return none;
    /* artBase exists so a page served from a subpath (or a test harness) can
       point at the piles; the default matches how index.html is served. */
    var base = typeof r.artBase === 'string' ? r.artBase : 'art/ui/';

    /* The pile <img> is pure decoration over a real text figure, so it is
       hidden from AT, and onerror it removes itself entirely — a missing
       file must degrade to number + label, never to a broken-image glyph. */
    function pile(stem, tierKind, amount) {
      var src = base + 'cur-' + stem + '-' + curTier(tierKind, amount) + '.png';
      return '<img src="' + esc(src) + '" alt="" aria-hidden="true" ' +
        'onerror="this.parentNode&&this.parentNode.removeChild(this)">';
    }
    function card(artHTML, amount, label) {
      return '<div class="kr-rc">' +
        '<div class="kr-rc-art">' +
          '<div class="kr-rc-flash" aria-hidden="true"></div>' +
          artHTML +
          '<div class="kr-rc-shine" aria-hidden="true"><i></i></div>' +
        '</div>' +
        '<div class="kr-rc-num">+<span class="kr-rnum" data-target="' + amount + '">0</span></div>' +
        '<div class="kr-rc-lab">' + esc(label) + '</div>' +
      '</div>';
    }

    var cards = '';
    if (xp)    cards += card(xpMedalSVG(), xp, T('XP', 'XP'));
    if (chips) cards += card(pile('chip', 'chips', chips), chips, T('Chips', 'Ċipep'));
    if (coins) cards += card(pile('coin', 'coins', coins), coins, T('Coins', 'Muniti'));
    /* the pot is chips won off other players, so it wears the chip art —
       tiered by the pot itself, which is usually the biggest pile on screen */
    if (pot)   cards += card(pile('chip', 'chips', pot), pot, T('Pot', 'Pot'));

    var bonusHTML = '';
    if (bonus) {
      bonusHTML = '<div class="kr-rw-bonus">' + bonusStarSVG() +
        '<span>' + esc(T('Winner bonus', 'Bonus tar-rebbieħ')) + '</span>' +
        '<b>+<span class="kr-rnum kr-rnum-b" data-target="' + bonus + '">0</span>&nbsp;XP</b>' +
        '<i aria-hidden="true"></i></div>';
    }
    var capHTML = '';
    if (staked) {
      capHTML = '<div class="kr-rw-cap">' +
        esc(T('You staked ' + staked + ' ' + unitEN(staked, 'chip', 'chips') + ' in the pot',
              'Daħħalt ' + staked + ' ' + unitMT(staked, 'ċipa', 'ċipep') + ' fil-pot')) +
      '</div>';
    }

    return {
      html: '<div class="kr-rw" role="group" aria-label="' +
        esc(T('Your winnings', 'Ir-rebħ tiegħek')) + '">' +
        (cards ? '<div class="kr-rw-cards">' + cards + '</div>' : '') +
        bonusHTML + capHTML + '</div>',
      hasXpCard: !!xp,
      hasBonus: !!bonus
    };
  }

  /* ═══════════════════════ build ═════════════════════════════════════════ */
  function build(opts) {
    var T = makeT(opts.lang);
    var reduced = motionOff(opts.reduced);
    var rows = Array.isArray(opts.rows) ? opts.rows.slice() : [];

    /* rows already come in finish order, but sort defensively by place when it
       is given so a caller that passes them unordered still renders correctly. */
    rows.sort(function (a, b) {
      var pa = a.place == null ? 999 : a.place, pb = b.place == null ? 999 : b.place;
      return pa - pb;
    });

    var top = rows.slice(0, 3);
    var rest = rows.slice(3);

    /* map to podium column classes: 1st centre, 2nd left, 3rd right-lower.
       We render in DOM order p2,p1,p3 but CSS `order` places them; DOM order
       here is p1,p2,p3 and order:2/1/3 lays them out. */
    function podiumCol(row, idx) {
      var cls = 'p' + (idx + 1);
      var placeNum = row.place != null ? row.place : (idx + 1);
      return '<div class="kr-col ' + cls + '">' +
        (idx === 0 ? '<div class="kr-rays" aria-hidden="true"></div>' : '') +
        '<div class="kr-av-wrap" style="position:relative">' +
          (idx === 0 ? crownSVG() : '') +
          avatarHTML(row, 'kr-av-pop') +
          (row.you ? '<div class="kr-you">' + T('YOU', 'INT') + '</div>' : '') +
        '</div>' +
        '<div class="kr-name">' + esc(row.name || T('Player', 'Plejer')) + '</div>' +
        (row.score != null ? '<div class="kr-score">' + esc(row.score) + '</div>' : '') +
        '<div class="kr-block">' + esc(placeNum) + '</div>' +
      '</div>';
    }

    var podiumHTML = '<div class="kr-podium">' +
      top.map(podiumCol).join('') +
      '</div>';

    var listHTML = '';
    if (rest.length) {
      listHTML = '<div class="kr-list">' + rest.map(function (row, i) {
        var placeNum = row.place != null ? row.place : (i + 4);
        return '<div class="kr-row' + (row.you ? ' kr-me' : '') + '">' +
          '<div class="kr-rk">' + esc(placeNum) + '</div>' +
          avatarHTML(row, null) +
          '<div class="kr-rn">' + esc(row.name || T('Player', 'Plejer')) +
            (row.you ? ' <span class="kr-tag">' + T('YOU', 'INT') + '</span>' :
             (row.bot ? ' <span class="kr-tag">' + T('BOT', 'BOT') + '</span>' : '')) +
          '</div>' +
          (row.score != null ? '<div class="kr-rs">' + esc(row.score) + '</div>' : '') +
        '</div>';
      }).join('') + '</div>';
    }

    /* ── reward block (built first: the XP block below needs to know whether
       a reward XP card exists, so it can drop its own "+N XP" header rather
       than say the same number twice on one screen) ── */
    var rw = rewardHTML(opts, T);

    /* ── XP block ── */
    var xpHTML = '';
    var xp = opts.xp;
    if (xp && typeof xp === 'object') {
      var lvl = xp.level != null ? xp.level : '';
      var gained = xp.gained != null ? xp.gained : Math.max(0, (xp.after || 0) - (xp.before || 0));
      xpHTML =
        '<div class="kr-xp">' +
          '<div class="kr-xp-h">' +
            '<div class="kr-xp-lv">' +
              '<span class="kr-lvbadge">' + esc(lvl) + '</span>' +
              '<span>' + T('Level', 'Livell') + '</span>' +
            '</div>' +
            (rw.hasXpCard ? '' :
              '<div class="kr-xp-g">+' + '<span class="kr-gnum">0</span> ' + T('XP', 'XP') + '</div>') +
          '</div>' +
          '<div class="kr-bar"><div class="kr-fill"></div></div>' +
          (xp.leveledUp ? '<div class="kr-lvup">' +
            T('Level up!', 'Livell ġdid!') + '</div>' : '') +
        '</div>';
    }

    /* ── title + subtitle ── */
    var title = opts.title != null ? opts.title : T('Winner!', 'Rebbieħ!');
    var subtitle = opts.subtitle != null ? opts.subtitle : T('Final standings', 'Klassifika finali');

    /* ── buttons ── */
    var hasAgain = typeof opts.onPlayAgain === 'function';
    /* Play Again returns the group to the LOBBY (same players seated), not an
       instant rematch — from there the host can change the rules, swap the game
       or add bots. The label is caller-settable so the button stays honest about
       where it goes, and an optional caption can spell that out. */
    var againLabel = opts.playAgainLabel != null ? opts.playAgainLabel
      : T('Play again', 'Erġa\' lgħab');
    var againCap = opts.playAgainCaption != null ? opts.playAgainCaption : null;
    var actsHTML = '<div class="kr-acts">' +
      (hasAgain ? '<button class="kr-btn kr-primary" id="kr-again">' +
        esc(againLabel) + '</button>' +
        (againCap ? '<div class="kr-cap">' + esc(againCap) + '</div>' : '') : '') +
      '<button class="kr-btn kr-ghost" id="kr-leave">' +
        (hasAgain ? T('Leave', 'Oħroġ') : T('Done', 'Lest')) + '</button>' +
    '</div>';

    var html =
      '<div class="kr-title">' + esc(title) + '</div>' +
      '<div class="kr-sub">' + esc(subtitle) + '</div>' +
      '<div class="kr-body">' + podiumHTML + listHTML + '</div>' +
      rw.html + xpHTML + actsHTML;

    /* youWon gates the festa burst: only when the local player IS the
       champion — a 4th-place finisher watching someone else win gets the
       podium, not the fireworks. */
    var youWon = !!(rows.length && rows[0].you &&
      (rows[0].place == null || rows[0].place === 1));

    return { html: html, reduced: reduced, xp: xp,
             hasReward: !!rw.html, hasBonus: rw.hasBonus, youWon: youWon };
  }

  /* ═══════════════════════ show ══════════════════════════════════════════ */
  function show(opts) {
    opts = opts || {};
    lastOpts = opts;
    injectCSS();
    hide();  /* one at a time */

    var built = build(opts);
    root = doc.createElement('div');
    root.id = 'kr-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', String(opts.title || 'Game over'));
    root.innerHTML = built.html;
    doc.body.appendChild(root);

    /* wire the buttons — each fires its callback exactly once, then we tear
       down. The `fired` guard makes a double-tap harmless. */
    var again = root.querySelector('#kr-again');
    var leave = root.querySelector('#kr-leave');
    var fired = false;
    if (again) {
      again.addEventListener('click', function () {
        if (fired) return; fired = true;
        sfx(opts, 'ui.tap');
        var cb = opts.onPlayAgain;
        hide();
        if (typeof cb === 'function') { try { cb(); } catch (e) {} }
      });
    }
    if (leave) {
      leave.addEventListener('click', function () {
        if (fired) return; fired = true;
        sfx(opts, 'ui.back');
        var cb = opts.onLeave;
        hide();
        if (typeof cb === 'function') { try { cb(); } catch (e) {} }
      });
    }

    var fill = root.querySelector('.kr-fill');
    var xp = built.xp;

    if (built.reduced) {
      /* ── STILL: paint the final state at once ── */
      root.classList.add('on');
      if (xp) {
        var pct = xpPct(xp);
        if (fill) fill.style.transform = 'scaleX(' + pct + ')';
        var gnum = root.querySelector('.kr-gnum');
        if (gnum) gnum.textContent = String(xp.gained != null ? xp.gained
          : Math.max(0, (xp.after || 0) - (xp.before || 0)));
        var lvup = root.querySelector('.kr-lvup');
        if (lvup && xp.leveledUp) lvup.classList.add('kr-show');
      }
      /* reward figures land on their targets immediately — no count-up, no
         sparks, no glints; the piles and the ribbon are simply there */
      var spans = root.querySelectorAll('.kr-rnum');
      for (var i = 0; i < spans.length; i++) {
        spans[i].textContent = spans[i].getAttribute('data-target') || '0';
      }
      return api;
    }

    /* ── ANIMATED entrance ──
       One timeline: overlay fades (frame 1), podium rises and avatars pop
       (kr-go, CSS delays to ~.7s), the festa burst crowns the champion as the
       winner avatar settles (~.72s), the piles drop in left-to-right with the
       XP bar (~.62–1.1s) while their numbers count up in the same order, and
       the bonus ribbon closes the show (~1.25s) with a second, smaller burst.
       Every frame request goes through raf() and every delay through later(),
       so hide() at ANY point cancels the whole remainder cleanly. */
    root.classList.add('kr-anim');
    raf(function () {
      if (!root) return;
      root.classList.add('on');
      raf(function () {
        if (!root) return;
        root.classList.add('kr-go');   /* podium rises, avatars pop, list/rw/xp/acts fade */
        sfx(opts, 'game.win');

        /* XP fills after the list has settled (~520ms in), then count-up + level */
        later(560, function () { runXP(opts, xp, fill); });
        if (built.hasReward) later(680, function () { runReward(opts); });
        if (built.youWon) {
          later(720, function () { crownRing(); festaBurst(22, 120); });
          if (built.hasBonus) later(1560, function () { festaBurst(12, 80); });
        }
      });
    });
    return api;
  }

  /* fraction 0..1 the bar should end at. Uses before/after against the level's
     span when we can infer it; otherwise falls back to after alone treated as a
     fraction if it is already 0..1, else a full bar. Kept simple on purpose —
     the caller owns the maths, we own the picture. */
  function xpPct(xp) {
    if (!xp) return 0;
    if (typeof xp.pct === 'number') return clamp01(xp.pct);
    var before = num(xp.before), after = num(xp.after);
    var span = num(xp.span);
    if (span > 0) return clamp01(after / span);
    /* before/after already given as 0..1 fractions */
    if (after >= 0 && after <= 1 && before >= 0 && before <= 1) return clamp01(after);
    /* nothing usable — show a satisfying near-full bar rather than empty */
    return after > before ? 0.7 : 0.5;
  }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function runXP(opts, xp, fill) {
    if (!root || !xp) return;
    var startPct = xpPct({ pct: xp.pctBefore, before: xp.before, after: xp.before, span: xp.span });
    var endPct = xpPct(xp);
    sfx(opts, 'xp.fill');

    if (fill) {
      /* seed the start, then transition to the end — compositor scaleX */
      fill.style.transform = 'scaleX(' + startPct + ')';
      raf(function () {
        fill.style.transition = 'transform .9s var(--ease,cubic-bezier(.22,.9,.28,1))';
        fill.style.transform = 'scaleX(' + endPct + ')';
      });
    }

    /* count the gained number up over ~900ms */
    var gnum = root.querySelector('.kr-gnum');
    var target = xp.gained != null ? xp.gained : Math.max(0, num(xp.after) - num(xp.before));
    countUp(gnum, target, 900);

    /* if they levelled up, fire the flourish as the bar lands */
    if (xp.leveledUp) {
      later(900, function () {
        if (!root) return;
        sfx(opts, 'xp.level');
        var badge = root.querySelector('.kr-lvbadge');
        if (badge) badge.classList.add('kr-pulse');
        var lvup = root.querySelector('.kr-lvup');
        if (lvup) lvup.classList.add('kr-show');
      });
    }
  }

  /* The reward figures count up in the same order the piles land — XP, then
     chips, then coins/pot — and the winner bonus deliberately waits for its
     ribbon (~1.25s into the timeline) instead of joining the queue, so the
     extra arrives as its own beat at the end rather than as a fourth number
     racing three others. */
  function runReward(opts) {
    if (!root) return;
    var spans = root.querySelectorAll('.kr-rnum');
    if (!spans.length) return;
    sfx(opts, 'reward.drop');
    var k = 0;
    for (var i = 0; i < spans.length; i++) (function (el) {
      var isBonus = el.classList.contains('kr-rnum-b');
      var delay = isBonus ? 640 : (k++) * 160;
      later(delay, function () {
        if (isBonus) sfx(opts, 'reward.bonus');
        countUp(el, parseInt(el.getAttribute('data-target'), 10) || 0, 800);
      });
    })(spans[i]);
  }

  /* ── the festa burst — winner only ─────────────────────────────────────
     Gold, pearl and crimson flecks thrown outward from the champion avatar
     with a slight upward bias and a settle at the end of the arc: festa
     confetti over the church square, not screen-wide rain. Trajectories ride
     custom properties so one CSS keyframe animates every spark; the JS here
     only writes styles once, so the whole burst costs zero per-frame script.
     Counts are capped by the callers (22 + 12) — mid-range-phone territory. */
  function festaBurst(n, dist) {
    if (!root) return;
    var av = root.querySelector('.kr-col.p1 .kr-av');
    if (!av) return;
    var rc = av.getBoundingClientRect();
    var cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
    var wrap = doc.createElement('div');
    wrap.className = 'kr-sparks';
    wrap.setAttribute('aria-hidden', 'true');
    var cols = ['#FFC542', '#FFF3CF', '#C8102E', '#FFD979'];
    for (var i = 0; i < n; i++) {
      var p = doc.createElement('div');
      p.className = 'kr-spark';
      var a = (i / n) * 6.2832 + (Math.random() - .5) * .55;
      var d = dist * (.55 + Math.random() * .8);
      var tx = Math.cos(a) * d;
      var ty = Math.sin(a) * d * .85 - dist * .22;
      var sz = (5 + Math.random() * 4).toFixed(1);
      p.style.left = cx.toFixed(1) + 'px';
      p.style.top = cy.toFixed(1) + 'px';
      p.style.width = sz + 'px';
      p.style.height = sz + 'px';
      p.style.background = cols[i % cols.length];
      /* every third spark is a dot; the rest stay squares that tumble */
      if (i % 3 === 0) p.style.borderRadius = '50%';
      p.style.setProperty('--kx', tx.toFixed(1) + 'px');
      p.style.setProperty('--ky', ty.toFixed(1) + 'px');
      p.style.setProperty('--ky2', (ty + 26).toFixed(1) + 'px');
      p.style.setProperty('--kr', ((Math.random() * 240 - 120) | 0) + 'deg');
      p.style.setProperty('--kd', (0.85 + Math.random() * 0.35).toFixed(2) + 's');
      p.style.setProperty('--ks', (Math.random() * 0.12).toFixed(2) + 's');
      wrap.appendChild(p);
    }
    root.appendChild(wrap);
    /* the animation ends at opacity 0, but the nodes are still removed so a
       second burst never stacks DOM on top of a dead one */
    later(1700, function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    });
  }

  /* A single gold ring that expands off the champion avatar as the burst
     fires — the "impact" that makes the sparks read as thrown, not spawned.
     It lives in the avatar wrap (position:relative) so it stays centred on
     the avatar even if the layout reflows mid-sequence. */
  function crownRing() {
    if (!root) return;
    var av = root.querySelector('.kr-col.p1 .kr-av');
    if (!av || !av.parentNode) return;
    var ring = doc.createElement('div');
    ring.className = 'kr-ring';
    ring.setAttribute('aria-hidden', 'true');
    av.parentNode.appendChild(ring);
  }

  function countUp(el, target, ms) {
    if (!el) return;
    target = Math.round(target);
    if (target <= 0) { el.textContent = '0'; return; }
    var start = performance.now();
    function tick(now) {
      var t = Math.min(1, (now - start) / ms);
      /* ease-out so it decelerates onto the final number */
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(target * e));
      if (t < 1) { raf(tick); }
      else { el.textContent = String(target); }
    }
    raf(tick);
  }

  /* ═══════════════════════ hide ══════════════════════════════════════════ */
  function hide() {
    clearTimers();
    if (root && root.parentNode) {
      try { root.parentNode.removeChild(root); } catch (e) {}
    }
    root = null;
  }

  var api = { show: show, hide: hide };
  global.KARTI_REBBIEH = api;

})(typeof window !== 'undefined' ? window : this);
