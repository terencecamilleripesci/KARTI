/* ═══════════════════════════════════════════════════════════════════
   KARTI — pinga.js
   THE PEN. A drawing surface and a word bank, shared by the two games
   that need one: TPINĠIJA (draw it, they guess it) and L-ARTIST FALZ
   (everyone draws one stroke; one of them was never told the word).

   BUILT ONCE, ON PURPOSE. Two games that each roll their own canvas
   are two undo stacks, two stroke formats and two sets of pointer
   bugs, and they drift the moment one of them is touched.

   STROKES ARE DATA, NOT PIXELS. A stroke is {c, w, p:[x,y,x,y…]} with
   coordinates in 0..1 rather than pixels, so the same drawing replays
   at any size, survives a rotation, and could go over a wire later
   without changing anything here. Undo is popping an array.

   THE POINTER RULES ARE THE FIDDLY PART and they are all here so
   neither game has to get them right twice: capture the pointer so a
   finger sliding off the canvas keeps drawing, ignore multi-touch
   after the first finger, and never let a stroke start on a moving
   scroll.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
(function(){

const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

/* ── the word bank ─────────────────────────────────────────────────
   Drawable things only. That sounds obvious and it is the entire
   difficulty: "freedom" is a terrible charades word and a worse
   drawing one. Everything here is a noun you could point at, and the
   Maltese ones are things a Maltese person can draw and a Maltese
   table will recognise — which is not the same list as the English. */
const WORDS = [
  /* easy — a child could draw it */
  ['Sun','Xemx',1], ['House','Dar',1], ['Fish','Ħuta',1], ['Cat','Qattus',1],
  ['Boat','Dgħajsa',1], ['Tree','Siġra',1], ['Star','Stilla',1], ['Key','Ċavetta',1],
  ['Door','Bieb',1], ['Clock','Arloġġ',1], ['Cup','Tazza',1], ['Book','Ktieb',1],
  ['Bell','Qanpiena',1], ['Bread','Ħobż',1], ['Egg','Bajda',1], ['Shoe','Żarbun',1],
  /* middling — needs a choice about how to draw it */
  ['Church','Knisja',2], ['Balcony','Gallarija',2], ['Ladder','Sellum',2],
  ['Umbrella','Umbrella',2], ['Bicycle','Rota',2], ['Guitar','Kitarra',2],
  ['Windmill','Mitħna',2], ['Lighthouse','Fanal',2], ['Bus','Xarabank',2],
  ['Ghost','Fantażma',2], ['Crown','Kuruna',2], ['Anchor','Ankra',2],
  ['Cactus','Bajtar tax-xewk',2], ['Pastizz','Pastizz',2], ['Goat','Mogħża',2],
  ['Fireworks','Nar tal-Festa',2], ['Balcony door','Bieb tal-gallarija',2],
  /* hard — abstract enough to be funny when it goes wrong */
  ['Sleeping','Rieqed',3], ['Swimming','Jgħum',3], ['Arguing','Jitlewwem',3],
  ['Queue','Kju',3], ['Traffic','Traffiku',3], ['Wedding','Tieġ',3],
  ['Storm','Maltempata',3], ['Secret','Sigriet',3], ['Winning','Jirbaħ',3],
  ['Hunger','Ġuħ',3], ['Village feast','Festa',3], ['Neighbour','Ġar',3]
];

const INKS = ['#EDEAF6', '#FFC542', '#4FB6FF', '#3DDC84', '#FF5468', '#C08BFF'];
const NIBS = [3, 7, 14];

function words(level, n, rnd){
  const r = rnd || Math.random;
  let pool = WORDS.filter(w => !level || w[2] === level);
  if (pool.length < n) pool = WORDS.slice();
  pool = pool.slice();
  for (let i = pool.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  return pool.slice(0, n).map(w => ({ en:w[0], mt:w[1], hard:w[2] }));
}

/* ── the surface ───────────────────────────────────────────────────
   make(canvas) hands back a small object the games drive. It owns
   the strokes and nothing else owns them. */
function make(cv, opts){
  const o = opts || {};
  const ctx = cv.getContext('2d');
  let strokes = [], cur = null, ink = INKS[0], nib = NIBS[1], on = true, dirty = null;
  let pointer = null;                       /* the ONE finger we follow */

  function size(){
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width  = Math.max(1, Math.round(r.width  * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint();
  }
  function xy(e){
    const r = cv.getBoundingClientRect();
    return [ (e.clientX - r.left) / Math.max(1, r.width),
             (e.clientY - r.top)  / Math.max(1, r.height) ];
  }
  function paint(){
    const r = cv.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const all = cur ? strokes.concat([cur]) : strokes;
    for (const s of all){
      if (s.p.length < 4){                 /* a dot, not a line */
        ctx.beginPath();
        ctx.fillStyle = s.c;
        ctx.arc(s.p[0] * r.width, s.p[1] * r.height, s.w / 2, 0, 6.283);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.strokeStyle = s.c; ctx.lineWidth = s.w;
      ctx.moveTo(s.p[0] * r.width, s.p[1] * r.height);
      for (let i = 2; i < s.p.length; i += 2)
        ctx.lineTo(s.p[i] * r.width, s.p[i+1] * r.height);
      ctx.stroke();
    }
  }
  function down(e){
    if (!on || pointer !== null) return;   /* first finger only */
    pointer = e.pointerId;
    try { cv.setPointerCapture(e.pointerId); } catch(err){}
    const [x, y] = xy(e);
    cur = { c:ink, w:nib, p:[x, y] };
    paint(); e.preventDefault();
  }
  function move(e){
    if (!on || cur === null || e.pointerId !== pointer) return;
    const [x, y] = xy(e);
    const n = cur.p.length;
    /* drop points closer than a pixel-ish: a 200-point stroke and a
       2000-point stroke look identical and one of them is a wire cost */
    if (n >= 2){
      const dx = x - cur.p[n-2], dy = y - cur.p[n-1];
      if (dx*dx + dy*dy < 0.00002) return;
    }
    cur.p.push(x, y);
    paint(); e.preventDefault();
  }
  function up(e){
    if (cur === null || (e && e.pointerId !== pointer)) return;
    strokes.push(cur); cur = null; pointer = null;
    paint();
    if (o.onStroke) try { o.onStroke(strokes.length); } catch(err){}
  }

  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.style.touchAction = 'none';
  dirty = new ResizeObserver(size);
  try { dirty.observe(cv); } catch(err){}
  size();

  return {
    get strokes(){ return strokes; },
    set strokes(v){ strokes = v || []; paint(); },
    ink: v => { if (v) ink = v; return ink; },
    nib: v => { if (v) nib = v; return nib; },
    enable: v => { on = !!v; },
    undo(){ strokes.pop(); paint(); return strokes.length; },
    clear(){ strokes = []; cur = null; paint(); },
    count(){ return strokes.length; },
    repaint: paint,
    stop(){
      try { dirty.disconnect(); } catch(err){}
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
    }
  };
}

window.KARTI_PINGA = { WORDS, INKS, NIBS, words, make };

})();
