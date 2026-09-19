import { chromium } from '/Users/cook/agents/forge/scripts/play/node_modules/playwright/index.mjs';
const dir = '/Users/cook/agents/forge/projects/proto/dig-art';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
const jobs = [
  ['?view=scene', 'sheet_scene'],
  ['?view=scene&collect=open', 'sheet_scene_collect_open'],
  ['?view=parts', 'sheet_parts'],
  ['?view=power', 'sheet_power'],
  ['?view=small', 'ore_small'],
];
for (const [q, name] of jobs) {
  await p.goto('file://' + dir + '/index.html' + q);
  await p.waitForFunction('window.__ready === true');
  await p.waitForTimeout(400);
  await p.screenshot({ path: dir + '/shots/' + name + '.png' });
  console.log('ok', name);
}
console.log(errs.length ? errs.join('\n') : 'ERRORS: 0');
await b.close();
