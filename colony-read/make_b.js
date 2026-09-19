// B 段：同一局，只把每人每晚的閒暇去處換成均勻隨機（種子固定 777）；閒暇路徑以同速度重走，睡覺時段從新位置走回家。
const fs=require('fs');const T=JSON.parse(fs.readFileSync('../colony-sim/traces/eff_s2_30m.json'));
let s=777;const R=()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296};
const spotX={},firstDay={};
for(const f of T.frames)for(const p of f.people)if(p.spot&&f.phase==='leisure'){spotX[p.spot]=p.x===undefined?0:spotX[p.spot];}
Object.assign(spotX,{roof:5,creek:44,creekEnd:68,doorA:10,doorB:26});
for(const f of T.frames)for(const p of f.people)if(p.spot&&p.spot.startsWith('bench')&&firstDay[p.spot]===undefined)firstDay[p.spot]=f.day;
spotX.bench0=14; // 由 A 軌跡量得
for(const k of Object.keys(spotX))if(k.startsWith('bench')&&firstDay[k]===undefined)delete spotX[k];
const SPEED=3,H=[10,26];const cur={};const tgt={};
for(const f of T.frames){const ph=f.t%60;
 for(const p of f.people){ if(!p.here)continue;
  if(ph<34){cur[p.id]=p.x;continue;}
  if(ph===34){const ks=Object.keys(spotX).filter(k=>!k.startsWith('bench')||firstDay[k]<=f.day);const k=ks[Math.floor(R()*ks.length)];tgt[p.id]=[k,spotX[k]];}
  const tx=ph<54?tgt[p.id][1]:H[p.house];const d=tx-cur[p.id];cur[p.id]+=Math.sign(d)*Math.min(Math.abs(d),SPEED);
  p.x=cur[p.id];p.spot=ph<54?tgt[p.id][0]:null;}}
T.meta.variant='B: 閒暇去處均勻隨機';T.events=[];
fs.writeFileSync('trace_B.json',JSON.stringify(T));console.log('ok',Object.keys(spotX));
