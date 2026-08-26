const E = require('./load.js');
const D=2;
function client(seed){ const st=E.start({seed,players:4,mode:'lives',bots:[0,1,1,1],aiLvl:[2,2,2,2],me:0,sealEmpty:false}); for(let t=0;t<=D+1;t++)E.commit(st,0,t,st.pads[0].pos); return st; }
const a=client(555), b=client(555);
let divergedAt=-1;
for (let N=0;N<80;N++){
  const ft=N+D;
  E.commit(a,0,ft,a.pads[0].pos); E.commit(b,0,ft,b.pads[0].pos);
  if (N===40){ E.commitBash(a,0,ft); }
  E.step(a); E.step(b);
  if (N>=41 && divergedAt<0 && E.snapshot(a)!==E.snapshot(b)) divergedAt=N;
}
console.log('A bashCd after (should be >0 near bash tick):', a.pads[0].bashCd, ' B bashCd:', b.pads[0].bashCd);
console.log('bash affects hashed state (diverged shortly after bash tick):', divergedAt>=0?('PASS @tick '+divergedAt):'FAIL');
// And confirm they RECONVERGE once cooldown expires (whiff leaves no permanent trace) — expected & fine
let reconverged=false;
for (let N=80;N<200;N++){ const ft=N+D; E.commit(a,0,ft,a.pads[0].pos); E.commit(b,0,ft,b.pads[0].pos); E.step(a); E.step(b); if (E.snapshot(a)===E.snapshot(b)) reconverged=true; }
console.log('reconverges after cooldown (whiff is traceless long-term):', reconverged?'yes (as designed)':'no');
