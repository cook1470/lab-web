// 各種手機比例 × 有無瀏海的控制項檢查 + 截圖
import { chromium, devices } from '/Users/cook/agents/forge/projects/fort/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path';
const DIR='/Users/cook/agents/forge/projects/proto/neon';
const sizes = [
  ['844x390',  844, 390],
  ['932x430',  932, 430],
  ['20_9',     1170, 540],   // 2340x1080 @DPR2
  ['21_9',     1200, 540],   // 2400x1080 @DPR2
];
const notches = [['plain',[0,0,0,0]], ['notch',[44,48,34,48]]];
const b = await chromium.launch();
const out = {};
for(const [nm,w,h] of sizes){
  for(const [nn, sa] of notches){
    const c = await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,hasTouch:true,isMobile:true,
      userAgent:devices['iPhone 13'].userAgent});
    const p = await c.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
    await p.goto('file://'+DIR+'/index.html');
    await p.waitForFunction(()=>!!window.__probe);
    await p.evaluate(([t,r,bo,l])=>window.__probe.setSafe(t,r,bo,l), sa);
    await p.evaluate(()=>window.__probe.begin());
    await p.evaluate(()=>{ window.__probe.goto(3390, 1.4); window.__probe.setHint(14); window.__probe.setIdle(0); });
    await p.waitForTimeout(250);
    const info = await p.evaluate(()=>window.__probe.ui());
    await p.screenshot({path: path.join(DIR,'shots',`v5_ui_${nm}_${nn}.png`)});
    // 閒置之後（淡化但不消失）
    await p.evaluate(()=>{ window.__probe.setIdle(9); window.__probe.setHint(0); });
    await p.waitForTimeout(150);
    const idle = await p.evaluate(()=>window.__probe.ui());
    if(nn==='notch') await p.screenshot({path: path.join(DIR,'shots',`v5_ui_${nm}_idle.png`)});
    out[`${nm}_${nn}`] = { info, idleAlpha: idle.idleAlpha, errs };
    console.log(nm, nn, 'safe',JSON.stringify(info.safe), 'overlaps',info.overlaps.length,
      'allInSafe', info.buttons.every(x=>x.insideSafe), 'minTap', Math.min(...info.buttons.map(x=>x.tapSize)),
      'hintPx', info.hintFontPx, 'idleAlpha', idle.idleAlpha, 'errs', errs.length);
    await c.close();
  }
}
await b.close();
fs.writeFileSync(DIR+'/ui-check.json', JSON.stringify(out,null,1));
