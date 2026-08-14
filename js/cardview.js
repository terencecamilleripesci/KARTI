/* ═══════════════════════════════════════════════════════════════════
   KARTI — cardview.js
   Card detail BOTTOM SHEET.  Replaces the old centred #modal popup.

   Hooked from game.js:
     function cardViewModal(card){
       if (window.KARTI_CARDVIEW && KARTI_CARDVIEW.show) return KARTI_CARDVIEW.show(card);
       ...old modal...
     }

   Behaviour
     • shared-element (FLIP) flight: the tapped .card lifts + scales from
       exactly where it sat into the sheet's hero card
     • sheet slides up from the bottom, blurred + dimmed backdrop
     • dismiss: drag down past threshold, backdrop tap, Escape, close button
     • transform / opacity only — never width/height/top/left
     • honours prefers-reduced-motion and body.reduced

   Everything it needs comes off window.KARTI (CARDS/RARITY are module-level
   consts in game.js, so they are NOT globals — always go through KARTI).
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ───────── tuning ───────── */
var T_IN       = 320;    /* enter                                   */
var T_OUT      = 200;    /* exit — shorter than enter, feels snappy */
var T_SPRING   = 280;    /* drag released under threshold           */
var EASE_IN    = 'cubic-bezier(.22,.9,.28,1)';   /* ease-out (entering) */
var EASE_OUT   = 'cubic-bezier(.4,0,.72,1)';     /* ease-in  (leaving)  */
var DRAG_START = 6;      /* px before a drag is a drag              */
var SRC_TTL    = 2500;   /* ms a captured source rect stays fresh   */

/* ───────── state ───────── */
var root = null, backdrop = null, sheet = null, body = null, hero = null,
    titleEl = null, metaEl = null, jokeEl = null, effEl = null, ownEl = null,
    closeBtn = null, doneBtn = null;
var ghost = null;              /* the flying clone                  */
var open = false;
var busy = null;               /* 'in' | 'out' | null               */
var anims = [];                /* running WAAPI animations          */
var srcEl = null, srcRect = null, srcAt = 0;   /* captured tap      */
var flyEl = null;              /* source element hidden mid-flight  */
var lastFocus = null;
var curCard = null;

/* drag */
var dragId = null, dragY0 = 0, dragX0 = 0, dragDY = 0, dragging = false,
    dragArmed = false, dragT0 = 0, dragFromGrab = false;

/* ───────── helpers ───────── */
function K(){ return window.KARTI || null; }
function esc(s){
  var k = K();
  if (k && k.esc) return k.esc(s);
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function reduced(){
  if (document.body && document.body.classList.contains('reduced')) return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch(e){ return false; }
}
function canAnimate(el){ return !!(el && el.animate) && !reduced(); }
function killAnims(){
  for (var i = 0; i < anims.length; i++){ try { anims[i].cancel(); } catch(e){} }
  anims = [];
}
function run(el, frames, ms, ease){
  if (!canAnimate(el)) return null;
  var a = el.animate(frames, { duration: ms, easing: ease, fill: 'both' });
  anims.push(a);
  return a;
}
/* typeName lives inside game.js's module scope — mirror it here */
function typeName(c){
  var k = K(), A = (k && k.ATTR) ? k.ATTR : {};
  if (c.t === 'monster') return (c.f && A[c.f]) ? A[c.f].n : 'MONSTER';
  return String(c.t || '').toUpperCase();
}

/* ───────── build the DOM once ───────── */
function build(){
  if (root) return;
  root = document.createElement('div');
  root.className = 'kcv-root';
  root.hidden = true;
  root.innerHTML =
    '<div class="kcv-backdrop" aria-hidden="true"></div>' +
    '<section class="kcv-sheet" role="dialog" aria-modal="true" aria-labelledby="kcv-title" tabindex="-1">' +
      '<div class="kcv-grab" aria-hidden="true"><span></span></div>' +
      '<button type="button" class="kcv-close" aria-label="Close card details">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<div class="kcv-body">' +
        '<div class="kcv-hero"></div>' +
        '<h2 class="kcv-name" id="kcv-title"></h2>' +
        '<p class="kcv-meta"></p>' +
        '<p class="kcv-joke"></p>' +
        '<p class="kcv-eff"></p>' +
        '<p class="kcv-own"></p>' +
        '<button type="button" class="kcv-done">Close</button>' +
      '</div>' +
    '</section>';
  document.body.appendChild(root);

  backdrop = root.querySelector('.kcv-backdrop');
  sheet    = root.querySelector('.kcv-sheet');
  body     = root.querySelector('.kcv-body');
  hero     = root.querySelector('.kcv-hero');
  titleEl  = root.querySelector('.kcv-name');
  metaEl   = root.querySelector('.kcv-meta');
  jokeEl   = root.querySelector('.kcv-joke');
  effEl    = root.querySelector('.kcv-eff');
  ownEl    = root.querySelector('.kcv-own');
  closeBtn = root.querySelector('.kcv-close');
  doneBtn  = root.querySelector('.kcv-done');

  backdrop.addEventListener('click', function(){ hide(); });
  closeBtn.addEventListener('click', function(){ hide(); });
  doneBtn.addEventListener('click', function(){ hide(); });

  sheet.addEventListener('pointerdown', onDown);
  sheet.addEventListener('pointermove', onMove);
  sheet.addEventListener('pointerup', onUp);
  sheet.addEventListener('pointercancel', onUp);
}

/* ───────── capture the tapped card (capture phase, before game.js) ───────── */
document.addEventListener('click', function(e){
  var t = e.target;
  if (!t || !t.closest) return;
  var el = t.closest('.card');
  if (!el || el.closest('.kcv-root')) return;      /* ignore our own hero */
  var r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  srcEl = el; srcRect = r; srcAt = Date.now();
}, true);

function freshSrc(){
  if (!srcRect || !srcEl) return null;
  if (Date.now() - srcAt > SRC_TTL) return null;
  if (!document.body.contains(srcEl)) return null;
  var r = srcEl.getBoundingClientRect();          /* re-measure — may have scrolled */
  if (!r.width || !r.height) return null;
  if (r.bottom < 0 || r.top > window.innerHeight) return null;
  return r;
}

/* ───────── content ───────── */
function fill(card){
  var k = K();
  if (!k) return;
  var R = k.RARITY || {}, rar = R[card.r] || null;
  var owned = (k.S && k.S.owned && k.S.owned[card.id]) || 0;
  var maxc  = k.MAX_COPIES || 3;
  var trib  = (card.t === 'monster' && k.tributesFor) ? k.tributesFor(card.lvl) : 0;
  var eff   = k.effText ? (k.effText(card) || '') : '';

  hero.innerHTML = '';
  if (k.cardEl) hero.appendChild(k.cardEl(card, { size:'lg' }));

  titleEl.textContent = card.n;

  var icon = window.ICO || function(){ return ''; };
  var bits = '<span class="kcv-rar" style="--rc:' + (rar ? rar.c : '#888') + '">' +
               icon((k.RARITY_ICON && k.RARITY_ICON[card.r]) || 'rar-komuni') +
               esc(rar ? rar.n : '?') + '</span>' +
             '<span class="kcv-sep">·</span><span class="kcv-attr">' +
               icon(k.markIcon ? k.markIcon(card) : 'type-monster') +
               esc(typeName(card)) + '</span>';
  if (card.t === 'monster'){
    bits += '<span class="kcv-sep">·</span><span>Level ' + card.lvl + '</span>' +
            '<span class="kcv-sep">·</span><span>' +
            (trib ? trib + ' tribute' + (trib > 1 ? 's' : '') : 'No tribute') + '</span>';
  }
  metaEl.innerHTML = bits;

  jokeEl.textContent = '“' + card.txt + '”';

  if (eff){
    effEl.hidden = false;
    effEl.innerHTML = (window.ICO ? window.ICO('bolt') : '') + ' ' + esc(eff);
  } else {
    effEl.hidden = true;
    effEl.textContent = '';
  }

  ownEl.className = 'kcv-own' + (owned ? ' has' : '');
  ownEl.textContent = owned
    ? 'You own ' + owned + ' / ' + maxc
    : 'Not in your collection · dust value ' + (rar ? rar.dust : 0);
}

/* ───────── the flying clone (FLIP) ───────── */
function makeGhost(from, to){
  var card = hero.firstElementChild;
  if (!card) return null;
  var g = card.cloneNode(true);
  g.className = card.className + ' kcv-ghost';
  g.style.setProperty('--cw', to.width + 'px');
  g.style.left  = to.left + 'px';
  g.style.top   = to.top + 'px';
  g.style.width = to.width + 'px';
  g.setAttribute('aria-hidden', 'true');
  root.appendChild(g);
  return g;
}
function flip(from, to){
  return 'translate3d(' + (from.left - to.left) + 'px,' + (from.top - to.top) + 'px,0) scale(' +
         (from.width / to.width) + ')';
}
function dropGhost(){
  if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
  ghost = null;
}
function showSrc(){
  if (flyEl){ flyEl.style.visibility = ''; flyEl = null; }
}
function hideSrc(){
  if (srcEl && document.body.contains(srcEl)){ flyEl = srcEl; flyEl.style.visibility = 'hidden'; }
}

/* ───────── show ───────── */
function show(card){
  var k = K();
  if (!k || !card) return;
  build();
  if (open && curCard && curCard.id === card.id) return;

  killAnims();
  dropGhost();
  showSrc();
  curCard = card;
  lastFocus = (document.activeElement && document.activeElement !== document.body)
    ? document.activeElement : srcEl;

  fill(card);

  /* lay it out (nothing is painted yet this tick) so the hero can be measured */
  root.hidden = false;
  root.classList.add('kcv-on');
  sheet.style.transform = '';
  document.addEventListener('keydown', onKey, true);
  open = true;
  busy = 'in';

  var from = freshSrc();
  var heroCard = hero.firstElementChild;
  var to = heroCard ? heroCard.getBoundingClientRect() : null;
  var sh = sheet.getBoundingClientRect().height || window.innerHeight * 0.6;

  if (reduced()){
    if (heroCard) heroCard.style.opacity = '';
    finishIn();
    focusIn();
    return;
  }

  sheet.style.willChange = 'transform';
  run(backdrop, [{ opacity:0 }, { opacity:1 }], Math.round(T_IN * 0.8), EASE_IN);
  var a = run(sheet, [{ transform:'translate3d(0,' + sh + 'px,0)' }, { transform:'none' }], T_IN, EASE_IN);

  if (from && to && to.width){
    ghost = makeGhost(from, to);
    if (ghost){
      if (heroCard) heroCard.style.opacity = '0';
      hideSrc();
      run(ghost, [{ transform: flip(from, to) }, { transform:'none' }], T_IN, EASE_IN);
    }
  } else if (heroCard){
    /* nothing was tapped → plain scale-from-centre */
    run(heroCard, [{ transform:'scale(.82)', opacity:0 }, { transform:'none', opacity:1 }], T_IN, EASE_IN);
  }

  if (a) a.onfinish = finishIn; else finishIn();
  /* safety net — never leave the sheet stranded mid-flight */
  setTimeout(function(){ if (busy === 'in') finishIn(); }, T_IN + 90);
  focusIn();
}

function finishIn(){
  if (!open || busy !== 'in') return;
  busy = null;
  killAnims();
  sheet.style.willChange = '';
  sheet.style.transform = '';
  backdrop.style.opacity = '';
  var heroCard = hero.firstElementChild;
  if (heroCard){ heroCard.style.opacity = ''; heroCard.style.transform = ''; }
  dropGhost();
  showSrc();
}

function focusIn(){
  try { sheet.focus({ preventScroll:true }); } catch(e){ try { sheet.focus(); } catch(e2){} }
}

/* ───────── hide ───────── */
function hide(){
  if (!root || !open) return;
  open = false;
  busy = 'out';
  killAnims();
  document.removeEventListener('keydown', onKey, true);
  endDrag();

  var heroCard = hero.firstElementChild;

  if (reduced()){ finishOut(); return; }

  var startY = dragDY || 0;
  var sh = sheet.getBoundingClientRect().height || window.innerHeight * 0.6;
  sheet.style.willChange = 'transform';

  run(backdrop, [{ opacity: Number(backdrop.style.opacity || 1) }, { opacity:0 }], T_OUT, EASE_OUT);
  var a = run(sheet,
    [{ transform:'translate3d(0,' + startY + 'px,0)' },
     { transform:'translate3d(0,' + (sh + 24) + 'px,0)' }],
    T_OUT, EASE_OUT);

  /* fly the card back home */
  var back = freshSrc();
  if (back && heroCard){
    var to = heroCard.getBoundingClientRect();
    if (to.width){
      dropGhost();
      ghost = makeGhost(back, to);
      if (ghost){
        heroCard.style.opacity = '0';
        hideSrc();
        run(ghost, [{ transform:'none' }, { transform: flip(back, to) }], T_OUT, EASE_OUT);
      }
    }
  }

  if (a) a.onfinish = finishOut; else finishOut();
  setTimeout(function(){ if (busy === 'out') finishOut(); }, T_OUT + 260);
}

function finishOut(){
  if (open || busy !== 'out') return;
  busy = null;
  killAnims();
  dropGhost();
  showSrc();
  root.classList.remove('kcv-on');
  root.hidden = true;
  sheet.style.transform = '';
  sheet.style.willChange = '';
  backdrop.style.opacity = '';
  var heroCard = hero.firstElementChild;
  if (heroCard) heroCard.style.opacity = '';
  dragDY = 0;
  curCard = null;
  refocus(lastFocus);
  lastFocus = null;
}

/* send focus back to the tapped card — cards are divs, so lend them a
   temporary tabindex and take it away again once they lose focus  */
function refocus(f){
  if (!f || !document.body.contains(f)) return;
  var lent = false;
  if (!f.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(f.tagName)){
    f.setAttribute('tabindex', '-1');
    lent = true;
  }
  try { f.focus({ preventScroll:true }); } catch(e){ try { f.focus(); } catch(e2){} }
  if (lent){
    f.addEventListener('blur', function drop(){
      f.removeEventListener('blur', drop);
      f.removeAttribute('tabindex');
    });
  }
}

/* ───────── keyboard ───────── */
function onKey(e){
  if (!open) return;
  if (e.key === 'Escape' || e.key === 'Esc'){
    e.preventDefault(); e.stopPropagation();
    hide();
    return;
  }
  if (e.key === 'Tab'){
    var f = sheet.querySelectorAll('button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (!f.length){ e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)){
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last){
      e.preventDefault(); first.focus();
    }
  }
}

/* ───────── drag to dismiss ───────── */
function onDown(e){
  if (!open || busy) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest && e.target.closest('.kcv-close,.kcv-done')) return;
  dragId = e.pointerId;
  dragY0 = e.clientY; dragX0 = e.clientX;
  dragDY = 0; dragging = false; dragArmed = true; dragT0 = Date.now();
  dragFromGrab = !!(e.target.closest && e.target.closest('.kcv-grab'));
}
function onMove(e){
  if (!dragArmed || e.pointerId !== dragId) return;
  var dy = e.clientY - dragY0, dx = e.clientX - dragX0;
  if (!dragging){
    if (Math.abs(dy) < DRAG_START && Math.abs(dx) < DRAG_START) return;
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy)){ dragArmed = false; return; }
    if (!dragFromGrab && body.scrollTop > 0){ dragArmed = false; return; }
    dragging = true;
    dragT0 = Date.now();
    killAnims();
    sheet.style.willChange = 'transform';
    try { sheet.setPointerCapture(dragId); } catch(err){}
  }
  if (e.cancelable) e.preventDefault();
  dragDY = Math.max(0, dy);
  var h = sheet.offsetHeight || 400;
  sheet.style.transform = 'translate3d(0,' + dragDY + 'px,0)';
  backdrop.style.opacity = String(Math.max(0, 1 - (dragDY / (h * 1.5))));
}
function onUp(e){
  if (e.pointerId !== dragId) return;
  if (!dragging){ endDrag(); return; }
  var h = sheet.offsetHeight || 400;
  var far  = dragDY > Math.max(88, h * 0.26);
  var fast = (dragDY / Math.max(1, Date.now() - dragT0)) > 0.55 && dragDY > 34;
  endDrag();
  if (far || fast){ hide(); return; }
  /* released short → spring back */
  var from = dragDY;
  dragDY = 0;
  if (canAnimate(sheet)){
    run(sheet, [{ transform:'translate3d(0,' + from + 'px,0)' }, { transform:'none' }], T_SPRING, EASE_IN);
    run(backdrop, [{ opacity: Number(backdrop.style.opacity || 1) }, { opacity:1 }], T_SPRING, EASE_IN);
    setTimeout(function(){
      if (open && !busy && !dragging){
        killAnims();
        sheet.style.transform = ''; sheet.style.willChange = ''; backdrop.style.opacity = '';
      }
    }, T_SPRING + 20);
  } else {
    sheet.style.transform = ''; sheet.style.willChange = ''; backdrop.style.opacity = '';
  }
}
function endDrag(){
  if (dragId != null && sheet){ try { sheet.releasePointerCapture(dragId); } catch(e){} }
  dragging = false; dragArmed = false; dragId = null;
}

/* keep the sheet honest if the viewport changes while it is open */
window.addEventListener('resize', function(){
  if (open && !busy && !dragging && sheet) sheet.style.transform = '';
});

/* ───────── public API ───────── */
window.KARTI_CARDVIEW = {
  show: show,
  hide: hide,
  get isOpen(){ return open; },
  get el(){ return root; }
};

})();
