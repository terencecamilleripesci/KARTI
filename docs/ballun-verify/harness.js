/* Determinism + lockstep harness for ballun.js */
/*loaded*/
const E = require('./load.js');

const D = 2;

function runMatch(seed, script){
  const st = E.start({ seed, players:4, mode:'lives', bots:[0,1,1,1], aiLvl:[2,2,2,2], me:0, sealEmpty:false });
  const TICKS = 900, K = 50;
  const hashes = [];
  const laneLo = st.pads[0].lo + st.pads[0].hw, laneHi = st.pads[0].hi - st.pads[0].hw;
  const parked = st.pads[0].pos;
  for (let t = 0; t <= D + 1; t++) E.commit(st, 0, t, parked);
  let checkFails = 0;
  for (let N = 0; N < TICKS; N++){
    const forTick = N + D;
    const tgt = Math.round(laneLo + (laneHi - laneLo) * script.tgt(N));
    E.commit(st, 0, forTick, tgt);
    if (script.bash(N)) E.commitBash(st, 0, forTick);
    E.step(st);
    const errs = E.check(st);
    if (errs.length){ checkFails++; if (checkFails<=3) console.log('  CHECK FAIL @tick', st.tick, errs); }
    if (N % K === 0) hashes.push(E.snapshot(st));
  }
  hashes.push(E.snapshot(st));
  return { hashes, goalsSeen: st.pads.reduce((s,p)=>s+p.goals,0), balls: st.balls.length, checkFails };
}

const script = { tgt: N => (Math.sin(N * 0.11) * 0.5 + 0.5), bash: N => (N % 37 === 5) };

console.log('=== TEST 2: DETERMINISM ===');
const a = runMatch(12345, script);
const b = runMatch(12345, script);
const c = runMatch(99999, script);
const eq=(x,y)=>x.length===y.length&&x.every((v,i)=>v===y[i]);
console.log('run A final hash:', a.hashes[a.hashes.length-1]);
console.log('run B final hash:', b.hashes[b.hashes.length-1]);
console.log('run C final hash:', c.hashes[c.hashes.length-1], '(diff seed)');
console.log('running hashes A:', a.hashes.join(','));
console.log('A===B bit-identical:', eq(a.hashes,b.hashes)?'PASS':'FAIL');
console.log('A!==C (seed drives sim):', !eq(a.hashes,c.hashes)?'PASS':'FAIL');
console.log('check() failures in A:', a.checkFails, ' goals:', a.goalsSeen, ' balls:', a.balls);

console.log('\n=== TEST 3: TWO-CLIENT LOCKSTEP ===');
function newClient(seed){
  const st = E.start({ seed, players:4, mode:'lives', bots:[0,1,1,1], aiLvl:[2,2,2,2], me:0, sealEmpty:false });
  const parked = st.pads[0].pos;
  for (let t = 0; t <= D + 1; t++) E.commit(st, 0, t, parked);
  return st;
}
const seed=4242, c1=newClient(seed), c2=newClient(seed);
const laneLo=c1.pads[0].lo+c1.pads[0].hw, laneHi=c1.pads[0].hi-c1.pads[0].hw;
let lockstepOK=true, firstFail=-1;
for (let N=0;N<900;N++){
  const forTick=N+D;
  const tgt=Math.round(laneLo+(laneHi-laneLo)*(Math.sin(N*0.11)*0.5+0.5));
  const bash=(N%37===5);
  E.commit(c1,0,forTick,tgt); E.commit(c2,0,forTick,tgt);
  if(bash){ E.commitBash(c1,0,forTick); E.commitBash(c2,0,forTick); }
  E.step(c1); E.step(c2);
  if(E.snapshot(c1)!==E.snapshot(c2)){ lockstepOK=false; if(firstFail<0) firstFail=N; }
}
console.log('lockstep identical every tick:', lockstepOK?'PASS':('FAIL @tick '+firstFail));

console.log('\n=== TEST 4: new state in snapshot ===');
const st=E.start({ seed:7, players:4, mode:'lives', bots:[0,1,1,1], aiLvl:[2,2,2,2], me:0, sealEmpty:false });
console.log('pad0 has bashCd,lungeT:', ['bashCd','lungeT'].every(k=>k in st.pads[0])?'YES':'NO');
console.log('st.serves is array:', Array.isArray(st.serves));

console.log('\n=== TEST 5: goal -> pendingServe telegraph + smooth entry ===');
const st2=E.start({ seed:3, players:2, mode:'lives', bots:[0,0], aiLvl:[2,2,2,2], me:0, sealEmpty:true });
let sawServe=false, sawEase=false, maxServeTicks=0;
for (let N=0;N<1500;N++){
  for (const p of st2.pads){ if (E.alive(p)&&!p.bot){ E.commit(st2,p.pid,N+D,p.pos); } }
  E.step(st2);
  if (st2.serves.length){ sawServe=true; maxServeTicks=Math.max(maxServeTicks, st2.serves[0].ticksLeft); }
  if (st2.balls.some(b=>b.ease>0)) sawEase=true;
}
console.log('saw pending serve (telegraph):', sawServe?'YES':'NO', ' max ticksLeft:', maxServeTicks);
console.log('saw entering ball ease>0 (smooth entry):', sawEase?'YES':'NO');
console.log('goals in no-defense 2p run:', st2.pads.reduce((s,p)=>s+p.goals,0));

console.log('\n=== TEST 6: bash actually speeds a ball up (mechanic works) ===');
const st3=E.start({ seed:11, players:2, mode:'lives', bots:[0,0], aiLvl:[2,2,2,2], me:0, sealEmpty:true });
for (const p of st3.pads){ if (E.alive(p)&&!p.bot){ for(let t=0;t<=D+1;t++) E.commit(st3,p.pid,t,p.pos); } }
// run until a ball is near the bottom paddle, then bash and measure speed change
let boosted=false, lunged=false;
for (let N=0;N<1500;N++){
  const forTick=N+D;
  for (const p of st3.pads){ if (E.alive(p)&&!p.bot){ E.commit(st3,p.pid,forTick,p.pos); } }
  // bash every tick the bottom seat is off cooldown and a ball is close in front
  const p0=st3.pads[0];
  if (p0.bashCd===0){
    const near = st3.balls.some(b=> Math.abs(b.x-p0.pos)<E.consts.BASH_HALF+p0.hw && (E.consts.PAD_COORD[0]-b.y)>=0 && (E.consts.PAD_COORD[0]-b.y)<E.consts.BASH_RANGE);
    if (near){ E.commitBash(st3,0,forTick); }
  }
  const before = st3.balls.map(b=>({id:b.id,sp:b.sp}));
  E.step(st3);
  for (const b of st3.balls){ const pv=before.find(x=>x.id===b.id); if (pv && b.sp>pv.sp+5) boosted=true; }
  if (st3.pads[0].lungeT>0) lunged=true;
}
console.log('a bash boosted a ball speed:', boosted?'YES':'NO');
console.log('a bash lunged the paddle (lungeT>0 observed):', lunged?'YES':'NO');

console.log('\nALL DONE');
