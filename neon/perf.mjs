// 效能量測：CPU 節流下的分項計時 + 幀間隔。用法 node perf.mjs [tag]
import { chromium, devices } from '/Users/cook/agents/forge/projects/fort/node_modules/playwright/index.mjs';
import fs from 'fs';
const DIR='/Users/cook/agents/forge/projects/proto/neon';
const TAG=process.argv[2]||'before';
const out={};
const b = await chromium.launch();

for(const rate of [1,4,6]){
  const c = await b.newContext({viewport:{width:844,height:390},deviceScaleFactor:2,hasTouch:true,isMobile:true,
    userAgent:devices['iPhone 13'].userAgent});
  const p = await c.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(String(e.message)));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  const cdp = await c.newCDPSession(p);
  await p.goto('file://'+DIR+'/index.html');
  await p.waitForFunction(()=>!!window.__probe);
  await p.evaluate(()=>window.__probe.begin());
  // 最激烈的一幕：第二波三個敵人 + 雨 + 招牌落下
  await p.evaluate(()=>{
    window.__probe.reset(); window.__probe.begin();
    window.__probe.goto(3390, 1.2);
    window.__probe.simulate(0.4, {attack:true});
  });
  await p.evaluate(()=>window.__probe.quality(0));   // 鎖最高畫質：不准靠自動降檔過關
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await p.waitForTimeout(300);
  // 粒子不灌就量不到（前一次量到 __parts:0，等於沒測到火花的成本）
  const burst = await p.evaluate(()=>{
    window.__burst = setInterval(()=>window.__probe.burst(140), 160);
    return true;
  });
  const prof = await p.evaluate(()=>window.__probe.profile(90));
  await p.evaluate(()=>clearInterval(window.__burst));
  const perf = await p.evaluate(()=>window.__probe.perf(180));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const q = await p.evaluate(()=>window.__probe.quality());
  const bake = await p.evaluate(()=>window.__probe.bakeInfo());
  out['x'+rate] = { prof, perf, errs, q, bake };
  await c.close();
  console.log('x'+rate, 'p95', perf.p95, 'p99', perf.p99, 'total', prof.__total, JSON.stringify(prof));
}
await b.close();
fs.writeFileSync(`${DIR}/perf-${TAG}.json`, JSON.stringify(out,null,1));
