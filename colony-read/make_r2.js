// 第 2 輪材料：以 sim2 軌跡（eff_s2_30m）的「誰喜歡誰、誰交往、每人原本想去哪」為輸入，在 trace 層重走閒暇：
//  ・同住調整：大山(3) 與阿桃(4) 互換房子 → 大山住 A、小樹住 B，兩人不同住（仍各 3 人）
//  ・A：有單相思對象（likes≥0 且非伴侶）者，當晚目標＝對方當晚的去處（對方原始選擇）；
//       到場時對方與「對方喜歡／交往的人」同在 → 撞見：折返去 屋頂邊/溪盡頭 中與對方不同處，之後 4 晚避開該處（改去偏僻處）
//  ・B：同樣的房子，每人每晚閒暇去處均勻隨機，無撞見
const fs=require('fs');const src=JSON.parse(fs.readFileSync('../colony-sim/traces/eff_s2_30m.json'));
const mode=process.argv[2];const T=JSON.parse(JSON.stringify(src));
const SP={roof:5,creek:44,creekEnd:68,doorA:10,doorB:26,bench0:14};const H=[10,26];const HOUSE={0:0,1:1,2:0,3:0,4:1,5:1};
let s=4242;const R=()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296};
const cur={},tgt={},avoid={},fled={},log=[];
for(const f of T.frames){const ph=f.t%60,d=f.day;
 const orig=src.frames[f.t].people;
 if(ph===34){const base={};for(const p of orig)if(p.here)base[p.id]=src.frames[f.t+1].people[p.id].spot||'doorA';
  const benchOk=k=>!k.startsWith('bench')||d>=4;
  for(const p of f.people){if(!p.here)continue;fled[p.id]=false;let k;
   if(mode==='B'){const ks=Object.keys(SP).filter(benchOk);k=ks[Math.floor(R()*ks.length)];}
   else{k=base[p.id];const c=orig[p.id].likes;
    if(c>=0&&orig[p.id].partner!==c){k=base[c];}
    if((avoid[p.id]&&avoid[p.id][k]>=d)){const cs=base[c]; k=['creekEnd','roof'].find(x=>x!==cs&&x!==k)||'creek';}}
   tgt[p.id]=k;}}
 for(const p of f.people){if(!p.here)continue;p.house=HOUSE[p.id];
  if(ph===0)cur[p.id]=H[p.house];
  let tx;if(ph<4||ph>=54)tx=H[p.house];else if(ph<34)tx=orig[p.id].x===H[orig[p.id].house]&&ph<8?null:null;
  if(ph>=4&&ph<34){const site=src.meta.sites[orig[p.id].site];tx=site;}
  if(ph>=34&&ph<54)tx=SP[tgt[p.id]];
  const dd=tx-cur[p.id];cur[p.id]+=Math.sign(dd)*Math.min(Math.abs(dd),3);p.x=cur[p.id];p.spot=ph>=34&&ph<54?tgt[p.id]:null;}
 if(mode==='A'&&ph>=34&&ph<54){for(const p of f.people){if(!p.here||fled[p.id])continue;const c=orig[p.id].likes;if(c<0||orig[p.id].partner===c)continue;
   const q=f.people[c],r=orig[c].partner>=0?orig[c].partner:orig[c].likes;if(r<0||r===p.id)continue;const rr=f.people[r];
   if(p.x===SP[tgt[p.id]]&&q.x===p.x&&rr.x===p.x){fled[p.id]=true;const spot=tgt[p.id];(avoid[p.id]=avoid[p.id]||{})[spot]=d+4;
    tgt[p.id]=['creekEnd','roof'].find(x=>SP[x]!==q.x&&x!==tgt[c]);log.push({night:d+1,t:f.t,who:p.id,saw:c,with:r,at:spot,fledTo:tgt[p.id]});}}}
}
T.events=log;T.meta.variant='round2 '+mode;T.meta.houses=H;
fs.writeFileSync(`trace_${mode}.json`,JSON.stringify(T));console.log(mode,JSON.stringify(log));
const N=['阿明','小樹','阿桃','大山','小雲','阿禾'];
if(mode==='A')for(let d=0;d<12;d++){const f=T.frames[d*60+50];console.log(d+1,f.people.map(p=>N[p.id]+':'+p.spot).join(' '));}
