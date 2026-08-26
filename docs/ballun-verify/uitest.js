/* Minimal DOM + canvas 2D stub to boot ballun-ui.js headless and exercise the
   new draw/UI paths (serve telegraph, goal arrows, bash button) without a real
   browser. We only need "does it run without throwing and touch the new code". */
const fs = require('fs');
const engineCode = fs.readFileSync('/home/foxhound/webclients/karti-malta/js/ballun.js','utf8');
const uiCode     = fs.readFileSync('/home/foxhound/webclients/karti-malta/js/ballun-ui.js','utf8');

function ctx2d(){
  const rec = { arcs:0, strokes:0, fills:0 };
  const noop = ()=>{};
  const grad = { addColorStop: noop };
  return new Proxy({
    save:noop, restore:noop, translate:noop, scale:noop, rotate:noop, clip:noop,
    beginPath:noop, closePath:noop, moveTo:noop, lineTo:noop,
    arc:()=>{rec.arcs++;}, arcTo:noop, rect:noop, fillRect:noop, strokeRect:noop,
    fill:()=>{rec.fills++;}, stroke:()=>{rec.strokes++;}, fillText:noop,
    createLinearGradient:()=>grad, createRadialGradient:()=>grad,
    setLineDash:noop, measureText:()=>({width:10}), _rec:rec
  }, { get(t,k){ return (k in t)?t[k]:0; }, set(){return true;} });
}
let ctxRec=null;
function el(tag){
  const node = {
    tagName:(tag||'div').toUpperCase(), style:{}, children:[], _cls:new Set(),
    className:'', id:'', innerHTML:'', textContent:'', width:0, height:0,
    attrs:{}, _listeners:{}, isConnected:true, clientWidth:390, clientHeight:390,
    setAttribute(k,v){this.attrs[k]=v;}, getAttribute(k){return this.attrs[k];},
    appendChild(c){this.children.push(c); return c;},
    insertBefore(c){this.children.unshift(c); return c;},
    removeChild(){}, remove(){},
    addEventListener(t,f){(this._listeners[t]=this._listeners[t]||[]).push(f);},
    removeEventListener(){}, setPointerCapture(){}, releasePointerCapture(){},
    getBoundingClientRect(){return {left:0,top:0,width:390,height:390};},
    getContext(){ ctxRec = ctxRec||ctx2d(); return ctxRec; },
    querySelector(sel){ return this._find(sel); },
    querySelectorAll(){ return []; },
    classList:{ add(){}, remove(){}, toggle(){}, contains(){return false;} },
    focus(){}, blur(){}, contains(){return false;}
  };
  node.classList.add = c=>node._cls.add(c);
  node.classList.toggle = (c,on)=>{ if(on)node._cls.add(c); else node._cls.delete(c); };
  node._find = sel => { // return a fresh canvas/element stub for any query
    const n = el(sel.replace(/[.#]/,'').includes('cv')||sel.includes('canvas')?'canvas':'div');
    return n;
  };
  return node;
}
const doc = {
  createElement: el,
  head: el('head'), body: el('body'),
  getElementById(){ return el('div'); },
  querySelector(){ return el('div'); },
  addEventListener(){}, removeEventListener(){}
};
doc.body.classList = { contains:()=>false, add(){}, remove(){}, toggle(){} };

global.window = global;
global.document = doc;
global.location = { search:'?pttest' };
global.performance = { now:()=>Date.now() };
global.requestAnimationFrame = ()=>1;
global.cancelAnimationFrame = ()=>{};
global.ResizeObserver = function(){ this.observe=()=>{}; this.disconnect=()=>{}; };
global.matchMedia = ()=>({matches:false});
global.setTimeout = (f)=>0; global.localStorage = { getItem:()=>null, setItem:()=>{} };
global.devicePixelRatio = 1;

// KARTI stubs
global.KARTI = { esc:s=>String(s==null?'':s), toast:()=>{}, go:()=>{}, REDUCED:false, displayName:()=>'Tester' };
global.KARTI_SFX = { play:()=>{}, note:()=>{} };
global.KARTI_LANG = { t:(en)=>en, lang:()=>'en' };
// a party shim exposing what beginMatch/openBoard need
const board = el('div');
global.KARTI_PARTY = {
  show:()=>{}, hub:()=>{}, register:()=>{}, online:{},
  ui: {
    screenEl:()=>el('div'),
    frame:(o)=>({ board, badge:el('span'), turn:el('div'),
                  btn:()=>el('button') }),
    setTurn:()=>{}, setNet:()=>{}, result:()=>{}
  }
};

// load engine, then UI
new Function('window', engineCode + '\nreturn window;')(global);
global.KARTI_BALLUN = global.KARTI_BALLUN; // engine attached it
new Function('window', uiCode + '\nreturn window;')(global);

const T = global.__BL_TEST;
if (!T){ console.log('FAIL: __BL_TEST not exposed'); process.exit(1); }
console.log('UI booted, test hooks present:', Object.keys(T).length, 'keys');

// boot a manual 2-player sealEmpty match so goals happen fast, drive ticks, draw
const m = T.manual({ players:2, mode:'lives', lvl:2 }, 3);
console.log('match started:', !!m, ' committed:', T.committed());
let drew=0, threw=null;
try {
  for (let i=0;i<600;i++){
    T.tickOnce();
    // hold paddle still (no defense) so balls score -> serve telegraph + goal arrows
    T.draw(0.5); drew++;
  }
} catch(e){ threw = e; }
const st = T.st();
console.log('ticks driven, draws:', drew, ' threw:', threw?threw.message:'none');
console.log('goals scored:', st?st.pads.reduce((s,p)=>s+p.goals,0):'-');
console.log('canvas draw calls (arcs/fills/strokes):', ctxRec?JSON.stringify(ctxRec._rec):'none');
console.log(threw?'UI SMOKE: FAIL':'UI SMOKE: PASS (no exceptions across 600 draws incl. serve/goal-arrow/bash-button paths)');

// --- exercise the BASH through the UI pipeline (M.bashPending -> advance commits bx) ---
const M = T.M();
let bashCommitted=false, threw2=null;
try {
  const st2 = T.st();
  for (let i=0;i<200;i++){
    if (st2.pads[0].bashCd===0){ M.bashPending = true; }  // request a bash whenever ready
    T.tickOnce();
    T.draw(0.3);
    if (st2.pads[0].bashCd>0) bashCommitted=true; // cooldown set => a bash was applied via lockstep
  }
} catch(e){ threw2=e; }
console.log('BASH via UI pipeline applied (cooldown observed):', bashCommitted?'PASS':'FAIL', ' threw:', threw2?threw2.message:'none');
