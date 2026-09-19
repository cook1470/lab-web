// 驗收：playwright 跑判準 + 截圖。用法：node test.mjs [tag]
import { chromium, devices } from '/Users/cook/agents/forge/projects/fort/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const DIR = '/Users/cook/agents/forge/projects/proto/neon';
const TAG = process.argv[2] || 'v1';
const url = 'file://' + DIR + '/index.html';
const errs = [];

function hook(page, label){
  page.on('pageerror', e => errs.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', m => { if(m.type()==='error') errs.push(`[${label}] console.error: ${m.text()}`); });
}

const browser = await chromium.launch();

// ---------- 手機橫式 844x390 DPR2 ----------
const ctxM = await browser.newContext({ viewport:{width:844,height:390}, deviceScaleFactor:2,
  hasTouch:true, isMobile:true, userAgent: devices['iPhone 13'].userAgent });
const m = await ctxM.newPage();
hook(m, 'phone');
await m.goto(url);
await m.waitForFunction(() => !!window.__probe);
await m.evaluate(() => window.__probe.begin());
await m.waitForTimeout(400);

const out = {};
out.level = await m.evaluate(() => window.__probe.level());
out.feel  = await m.evaluate(() => window.__probe.feel());
out.bot   = await m.evaluate(() => window.__probe.bot(200));
out.contrast = await m.evaluate(() => window.__probe.contrast(20));
out.phases = await m.evaluate(() => window.__probe.phases());
out.bots = await m.evaluate(() => window.__probe.bots(10));
out.ui = await m.evaluate(() => window.__probe.ui());
out.staticLight = await m.evaluate(() => window.__probe.staticLight());

// perf：讓機器人跑著同時量幀
await m.evaluate(() => { window.__probe.reset(); window.__probe.begin(); });
await m.evaluate(() => { window.__botDrive = setInterval(()=>{}, 1000); });
await m.evaluate(() => { window.__probe.goto(3300, 0); });
await m.evaluate(() => { window.input && 0; });
out.perf = await m.evaluate(() => window.__probe.perf(200));

// ---------- 手機截圖（各事件） ----------
const shots = [
  ['phone-01-start',   200,  0],
  ['phone-02-pit',     900,  0.6],
  ['phone-03-wave1',  1500,  2.2],
  ['phone-04-wall',   2020,  1.0],
  ['phone-05-deck',   2500,  0.6],
  ['phone-06-breaker',3260,  1.2],
  ['phone-07-wave2',  3420,  2.4],
  ['phone-08-boss',   4300,  2.6],
  ['phone-10-telegraph', 3420, 3.1],
  ['phone-11-parry',  4300,  0]
];
await m.evaluate(() => window.__probe.reset());
await m.evaluate(() => window.__probe.begin());
for(const [name, x, sec] of shots){
  await m.evaluate(([x,sec]) => window.__probe.goto(x, sec), [x, sec]);
  await m.waitForTimeout(140);
  await m.screenshot({ path: path.join(DIR,'shots',`${TAG}_${name}.png`) });
}
// 招架那一刻（自己餵一次預告再按招架）
await m.evaluate(() => window.__probe.parryShot());
await m.waitForTimeout(80);
await m.screenshot({ path: path.join(DIR,'shots',`${TAG}_phone-11-parry.png`) });

// 真觸控：左半按住走、右半點擊攻擊
await m.evaluate(() => { window.__probe.reset(); window.__probe.begin(); });
await m.touchscreen.tap(700, 200);
await m.waitForTimeout(120);
await m.touchscreen.tap(700, 200);
await m.waitForTimeout(400);
await m.screenshot({ path: path.join(DIR,'shots',`${TAG}_phone-09-touch-attack.png`) });

// ---------- 桌機一張 ----------
const ctxD = await browser.newContext({ viewport:{width:1600,height:900}, deviceScaleFactor:1 });
const d = await ctxD.newPage();
hook(d, 'desktop');
await d.goto(url);
await d.waitForFunction(() => !!window.__probe);
await d.evaluate(() => window.__probe.begin());
await d.evaluate(() => window.__probe.goto(3380, 2.6));
await d.waitForTimeout(200);
await d.screenshot({ path: path.join(DIR,'shots',`${TAG}_desktop.png`) });

await browser.close();
out.errors = errs;
fs.writeFileSync(path.join(DIR, `probe-${TAG}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({
  errors: errs,
  perf: out.perf,
  feel: out.feel,
  bot: { finished: out.bot.finished, seconds: out.bot.seconds, reachedX: out.bot.reachedX,
         hits: out.bot.hits, slams: out.bot.slams, crushed: out.bot.crushedBySign,
         events: out.bot.events },
  phases: out.phases,
  bots: { dumb: out.bots.dumb, smart: out.bots.smart, gap: out.bots.gap },
  contrast: { worstMedian: out.contrast.worstMedian, medianOfMedians: out.contrast.medianOfMedians,
              maxOcclusion: out.contrast.maxOcclusion, maxHeadOcclusion: out.contrast.maxHeadOcclusion,
              heavyShare: out.contrast.heavyOcclusionShare },
  staticLight: out.staticLight
}, null, 1));
