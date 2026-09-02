global.window = {};
require('/home/foxhound/webclients/tactics-testbed/gear.js');
const G = global.window.GEAR;
let fail = 0;
function ok(c, m){ if(!c){ console.log('FAIL: '+m); fail++; } }

// level requirements are stable and tiered
const a = G.byId('crypt-helm').level, b = G.levelFor('crypt-helm','crypt');
ok(a===b, 'level requirement not stable: '+a+' vs '+b);
ok(G.byId('novice-cap').level===1, 'novice gates nobody');
for (const it of G.ITEMS){
  const t = G.TIERS[it.tier];
  ok(it.level>=t.level && it.level<=t.level+3, it.id+' level '+it.level+' outside tier '+it.tier);
}
// varied, not all identical
const cl = G.ofTier('crypt').map(i=>i.level);
ok(new Set(cl).size>1, 'all crypt items share one level: '+cl.join(','));

// a boss always pays exactly one piece, of its own set
for (const id in G.BOSSES){
  const seen = new Set();
  for (let i=0;i<400;i++){ const d=G.bossDrop(id); ok(!!d,'boss paid nothing'); if(d){ seen.add(d.id); ok(d.tier===G.BOSSES[id].tier,'wrong tier'); } }
  ok(seen.size===4, id+' only ever drops '+seen.size+' of 4 pieces');
}
// mobs are rare, and a low-level mob cannot pay dungeon gear
let hits=0, high=0;
for (let i=0;i<20000;i++){ const d=G.mobDrop(3); if(d){ hits++; if(d.tier!=='wild') high++; } }
ok(hits>600 && hits<1400, 'mob drop rate off: '+(hits/200).toFixed(1)+'% expected ~5%');
ok(high===0, 'a level 3 mob paid dungeon gear '+high+' times');
let deep=0; for (let i=0;i<20000;i++){ const d=G.mobDrop(20); if(d && d.tier==='crypt') deep++; }
ok(deep>0, 'a level 20 mob never pays crypt gear');

// equipping obeys level
ok(G.canEquip('necro-crown', 1).ok===false, 'level 1 wore the endgame crown');
ok(/Requires level/.test(G.canEquip('necro-crown',1).why), 'no reason given');
ok(G.canEquip('novice-cap', 1).ok===true, 'level 1 cannot wear the starter cap');

// bonuses add up, and the set is four distinct slots
const set = G.set('novice');
ok(set.length===4, 'novice set has '+set.length+' pieces');
ok(new Set(set.map(i=>i.slot)).size===4, 'set slots collide');
const eq = {}; set.forEach(i=> eq[i.slot]={id:i.id});
const bon = G.bonus(eq);
ok(bon.vit===16, 'novice vit '+bon.vit+' expected 16');
// power climbs with tier
const vit = t => G.bonus(Object.fromEntries(G.set(t).map(i=>[i.slot,{id:i.id}]))).vit;
ok(vit('novice')<vit('wild') && vit('wild')<vit('crypt') && vit('crypt')<vit('necro'),
   'tiers do not climb: '+[vit('novice'),vit('wild'),vit('crypt'),vit('necro')].join('<'));

// art paths, draw order back-to-front
ok(G.sheet('novice-cap','m')==='art/gear/novice-m-cap.png', 'bad art path: '+G.sheet('novice-cap','m'));
ok(G.sheet('novice-cap','f','dir8')==='art/gear/novice-f-cap-dir8.png', 'bad dir8 path');
const sh = G.sheets(eq,'m');
ok(sh.length===4, 'sheets returned '+sh.length);
ok(sh[0].indexOf('cloak')>0 && sh[3].indexOf('cap')>0, 'draw order not back-to-front: '+sh.join(' '));

console.log(fail ? fail+' FAILURES' : 'ALLPASS — gear rules hold');
