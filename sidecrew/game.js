// sidecrew v4：橫切面聚落，三層（樓上臥室／地面廚房與院子／地下儲藏窖）。
// 製作人判 v3「畫面太小、只有一層」＋「掛機可以慢，但畫面要有東西可以看」。
// 所以：鏡頭拉近（小人至少佔畫面高 1/8），可上下左右拖曳換層；
// 柴和糧食都收在地窖，床在二樓，小人真的要走樓梯／爬梯子上下搬東西。
'use strict';
const cv = document.getElementById('c'), g = cv.getContext('2d');
const T = 8;          // 一格寬（邏輯像素）
const WW = 38;        // 世界寬（格）
const FH = 44;        // 一層樓高（邏輯像素）
const VH = 14;        // 小人身高（邏輯像素）
let W = 300, H = 180, S = 2;
function resize() {
  // 橫式：畫面高約 104 邏輯像素（小人 14 → 約 1/7.4）；直式：畫面寬約 56 邏輯像素（小人 ≥ 1/8 畫面高）
  const portrait = innerHeight > innerWidth;
  S = portrait ? Math.max(innerWidth / 96, innerHeight / (VH * 12)) : innerHeight / 104;
  S = Math.max(2, S);
  W = Math.ceil(innerWidth / S); H = Math.ceil(innerHeight / S);
  cv.width = W; cv.height = H;
  cv.style.width = W * S + 'px'; cv.style.height = H * S + 'px';
  cv.style.left = '0px'; cv.style.top = '0px';
  g.imageSmoothingEnabled = false;
  if (typeof resizeUI === 'function') resizeUI();
}

// ---- Sweetie16 調色盤 ----
const PAL = { black: '#1a1c2c', plum: '#5d275d', red: '#b13e53', orange: '#ef7d57', gold: '#ffcd75',
  lgreen: '#a7f070', green: '#38b764', teal: '#257179', navy: '#29366f', blue: '#3b5dc9',
  sky: '#41a6f6', cyan: '#73eff7', white: '#f4f4f4', lgray: '#94b0c2', gray: '#566c86', dgray: '#333c57' };

// ---- 亂數（固定種子，方便前後對照）----
let seed = 12345;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function rrange(a, b) { return a + rnd() * (b - a); }
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ---- 世界佈局：層 1＝二樓臥室，0＝地面（屋內廚房＋戶外），-1＝地窖 ----
const HOUSE = { x0: 6, x1: 21 };          // 主屋左右牆（格）
const LINKS = [{ x: 8, a: -1, b: 0, kind: 'ladder' }, { x: 19, a: 0, b: 1, kind: 'stairs' }];
const SPOT = {
  tree: [1, 3],
  woodPile: 11, foodPile: 16,             // 地窖
  stove: 13,                              // 地面廚房
  beds: [10, 13.5, 17], roofSpot: 13.5,   // 二樓
  bench: 24, field: 27, plots: [31, 35],  // 戶外
  edge: WW - 1, settle: 13,
};
const FLOOR_OF = { woodPile: -1, foodPile: -1, stove: 0, beds: 1, roof: 1, bench: 0, field: 0, plots: 0, tree: 0 };
function floorRange(f) { return f === 0 ? [0.8, WW - 1.2] : [HOUSE.x0 + 1, HOUSE.x1 - 1]; }
function clampX(f, x) { const [a, b] = floorRange(f); return Math.max(a, Math.min(b, x)); }
const HARVEST_YIELD = 3, FOOD_MAX = 12; // v4.1：一塊田收一次抱回 3 份（原 1 份），糧堆上限 12（原 8）
const BUILD_COST = 4, REPAIR_COST = 1, TOGETHER_DUR = 4.5, MAX_AFFINITY = 100, HEARTBREAK_DUR = 35;

// ---- 個性（8 個候補人選，開局先出 4 個，蓋房子才會多人）----
const PERSON = [
  { name: '阿明', tag: 'A', col: PAL.orange, chop: 1.7, harvest: 0.6, duty: 1.0, social: 0.5, lazy: 0.4, speed: 1.0 },
  { name: '小美', tag: 'B', col: PAL.red, chop: 0.5, harvest: 1.5, duty: 1.3, social: 0.8, lazy: 0.3, speed: 1.1 },
  { name: '老王', tag: 'C', col: PAL.gray, chop: 0.6, harvest: 0.5, duty: 0.4, social: 0.7, lazy: 2.2, speed: 0.75 },
  { name: '小樹', tag: 'D', col: PAL.green, chop: 1.8, harvest: 0.5, duty: 0.7, social: 0.5, lazy: 0.5, speed: 1.05 },
  { name: '阿夜', tag: 'E', col: PAL.blue, chop: 0.6, harvest: 0.8, duty: 2.0, social: 0.4, lazy: 0.3, speed: 1.15 },
  { name: '阿福', tag: 'F', col: PAL.plum, chop: 0.6, harvest: 0.6, duty: 0.8, social: 1.8, lazy: 0.6, speed: 0.95 },
  { name: '小雨', tag: 'G', col: PAL.cyan, chop: 0.7, harvest: 1.2, duty: 1.1, social: 0.6, lazy: 0.5, speed: 1.0 },
  { name: '阿土', tag: 'H', col: PAL.gold, chop: 1.2, harvest: 0.8, duty: 0.9, social: 0.5, lazy: 0.7, speed: 0.9 },
];

// ---- 世界狀態 ----
let trees, woodPile, foodPile, field, roofLeak, rain, plots, villagers, nextPersonIdx, t = 0, muted = true;
let affinity = new Map();

function newVillager(i, p, x, f, extra) {
  return Object.assign({
    i, p, x, fx: x, floor: f, fl: f, face: 1, walkT: 0,
    hunger: rrange(10, 30), energy: rrange(70, 95), task: null, forced: null, unhappyT: 0,
    pausedTask: null, decideAt: rrange(0.5, 2), arriving: false,
    crush: null, spouse: null, child: false, homePlot: null, growAt: 0,
    heartbrokenT: 0, crushBubbleT: 0, crushCd: rrange(4, 10),
  }, extra || {});
}
function reset(seedIn) {
  seed = seedIn || 12345;
  trees = SPOT.tree.map((x, i) => ({ id: 'tree' + i, x, wood: 3, regenAt: -1 }));
  woodPile = { x: SPOT.woodPile, f: -1, count: 3, max: 8 };
  foodPile = { x: SPOT.foodPile, f: -1, count: 6, max: FOOD_MAX };
  field = { x: SPOT.field, stage: 3, t: 0 };
  roofLeak = false;
  rain = { active: false, nextAt: rrange(16, 28), t: 0, dur: 0 };
  plots = SPOT.plots.map((x, i) => ({ id: 'plot' + i, x, built: false, home: null, childAt: null, childSpawned: false }));
  nextPersonIdx = 4;
  affinity = new Map();
  locks = new Map();
  villagers = PERSON.slice(0, 4).map((p, i) => newVillager(i, p, [10, 14, 12, 16][i], [0, 0, 1, -1][i]));
  for (const u of villagers) assignCrush(u);
  t = 0;
}
let locks = new Map();
function pairKey(i, j) { return Math.min(i, j) + '_' + Math.max(i, j); }
function getAffinity(i, j) { return affinity.get(pairKey(i, j)) || 0; }
function addAffinity(i, j, amt) {
  const k = pairKey(i, j); const v = Math.max(0, Math.min(MAX_AFFINITY, (affinity.get(k) || 0) + amt));
  affinity.set(k, v);
  if (v >= MAX_AFFINITY) tryMarry(i, j);
}
function assignCrush(u) {
  const others = villagers.filter(v => v !== u && !v.child);
  u.crush = others.length ? others[(rnd() * others.length) | 0].i : null;
}
function tryMarry(i, j) {
  const a = villagers.find(v => v.i === i), b = villagers.find(v => v.i === j);
  if (!a || !b || a.spouse != null || b.spouse != null || a.child || b.child) return;
  const home = plots.find(p => p.built && p.home == null);
  if (!home) return;
  home.home = [a.i, b.i]; home.childAt = t + rrange(16, 26); home.childSpawned = false;
  a.spouse = b.i; b.spouse = a.i;
  sfx.up(); flash = 0.4; burst(home.x, -FH + 6, PAL.red); burst(home.x, -FH + 6, PAL.gold);
}
function checkPendingMarriages() {
  for (const [k, v] of affinity) { if (v >= MAX_AFFINITY) { const [i, j] = k.split('_').map(Number); tryMarry(i, j); } }
}
function spawnChild(pl) {
  const u = newVillager(villagers.length, { name: '小娃', tag: '?', col: PAL.gold, chop: 1, harvest: 1, duty: 1, social: 1, lazy: 1, speed: 1.3 },
    pl.x, 0, { child: true, homePlot: pl.id, growAt: t + rrange(18, 28), hunger: 0, energy: 100, crushCd: 99, decideAt: 0 });
  villagers.push(u); sfx.newf();
}
function growUp(u) {
  const p = PERSON[nextPersonIdx % PERSON.length]; nextPersonIdx++;
  u.p = p; u.child = false; u.hunger = rrange(10, 30); u.energy = rrange(70, 95); u.decideAt = rrange(0.5, 2); u.crushCd = rrange(4, 10);
  assignCrush(u); sfx.up(); flash = 0.2;
}
function lockKey(kind, objId, x) { return objId ? kind + ':' + objId : kind + ':' + x; }
function tryLock(key, u) { const cur = locks.get(key); if (cur && cur !== u) return false; locks.set(key, u); return true; }
function unlock(key, u) { if (locks.get(key) === u) locks.delete(key); }
function stealLock(key, forU) {
  const cur = locks.get(key);
  if (cur && cur !== forU && cur.task && cur.task.lockKey === key) { cur.task = null; unlock(key, cur); }
  locks.set(key, forU);
}
function pickBed(u) {
  const dry = SPOT.beds.filter(b => !(roofLeak && b === SPOT.roofSpot));
  const free = dry.filter(b => !locks.has('sleep:' + b));
  if (free.length) return free.reduce((a, b) => Math.abs(a - u.x) < Math.abs(b - u.x) ? a : b);
  return dry[u.i % dry.length];
}

let joining = [];
function spawnVillager() {
  const p = PERSON[nextPersonIdx % PERSON.length]; nextPersonIdx++;
  const u = newVillager(villagers.length, p, SPOT.edge, 0, { face: -1, hunger: 20, energy: 90, decideAt: rrange(0.5, 1.5), arriving: true });
  villagers.push(u);
  assignCrush(u);
  sfx.newf();
  checkPendingMarriages();
}

// ---- 走路：不同層要先走到樓梯／梯子，再爬上爬下 ----
function linkFor(a, b) { return LINKS.find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a)); }
function walkTo(u, tx, tf, dt, spdMul) {
  const spd = 3.4 * u.p.speed * (spdMul || 1) * dt;
  if (u.floor !== tf || u.fl !== u.floor) {
    const next = u.fl !== u.floor ? u.floor + Math.sign(u.fl - u.floor || (tf - u.floor)) : u.floor + Math.sign(tf - u.floor);
    const ln = linkFor(u.floor, next);
    if (u.fl === u.floor && Math.abs(ln.x - u.x) > 0.001) {
      const dx = ln.x - u.x;
      if (Math.abs(dx) <= spd) u.x = ln.x; else { u.x += Math.sign(dx) * spd; u.face = Math.sign(dx); }
      u.walkT += dt; u.fx = u.x; return false;
    }
    // 爬：一層樓約 1.1 秒
    const cs = dt * 0.9 * u.p.speed * (spdMul || 1);
    const dir = Math.sign(next - u.floor);
    u.fl += dir * cs; u.walkT += dt;
    if ((dir > 0 && u.fl >= next) || (dir < 0 && u.fl <= next)) { u.fl = next; u.floor = next; }
    u.fx = u.x; return false;
  }
  const dx = tx - u.x;
  if (Math.abs(dx) <= spd) { u.x = tx; u.fx = u.x; return true; }
  u.x += Math.sign(dx) * spd; u.face = Math.sign(dx); u.walkT += dt; u.fx = u.x; return false;
}

// ---- 任務鏈 ----
const CHAIN = {
  chop: ['goto1', 'work1', 'goto2', 'work2'],
  harvest: ['goto1', 'work1', 'goto2', 'work2'],
  repair: ['goto1', 'work1', 'goto2', 'work2'],
  build: ['goto1', 'work1', 'goto2', 'work2'],
  eat: ['goto1', 'work1', 'goto2', 'work2'],   // 地窖拿糧 → 上樓到灶邊吃
  sleep: ['goto1', 'work1'],
  chat: ['goto1', 'work1'],
  wander: ['goto1', 'work1'],
  together: ['goto1', 'work1'],
};
function workDuration(kind, stage) {
  if (kind === 'chop') return stage === 1 ? 1.0 : 0.4;
  if (kind === 'harvest') return stage === 1 ? 1.2 : 0.4;
  if (kind === 'repair') return stage === 1 ? 0.5 : 2.2;
  if (kind === 'build') return stage === 1 ? 0.6 : 4.0;
  if (kind === 'eat') return stage === 1 ? 0.5 : 2.0;
  if (kind === 'sleep') return 16;
  if (kind === 'chat') return 3 + rnd() * 1.5;
  if (kind === 'wander') return 1.2 + rnd() * 1.5;
  if (kind === 'together') return TOGETHER_DUR;
  return 1;
}
function eatOpts(u) { return { p1x: foodPile.x, p1f: -1, p2x: SPOT.stove, p2f: 0, objId: 'u' + u.i }; }
function sleepOpts(u) { return { p1x: pickBed(u), p1f: 1 }; }

function startTask(u, kind, opts) {
  opts = opts || {};
  const assigned = !!opts.assigned;
  const key = opts.lockKey || lockKey(kind, opts.objId, opts.p1x);
  if (assigned) stealLock(key, u); else if (!tryLock(key, u)) return false;
  const hesitateDur = assigned ? 0 : rrange(0.6, 1.6);
  u.task = {
    kind, obj: opts.obj, p1x: opts.p1x, p1f: opts.p1f || 0, p2x: opts.p2x, p2f: opts.p2f || 0, objId: opts.objId,
    assigned, lockKey: key, phase: assigned ? 'goto1' : 'hesitate', t: 0, carry: null, hesitateDur,
  };
  return true;
}

// ---- 需求 ----
const HUNGER_AUTO = 55, HUNGER_CRIT = 95, ENERGY_AUTO = 25, ENERGY_CRIT = 5;
function needsFSM(u, dt) {
  u.hunger = Math.min(100, u.hunger + dt * 1.05);
  const working = u.task && (u.task.phase === 'work1' || u.task.phase === 'work2');
  u.energy = Math.max(0, u.energy - dt * (working ? 0.85 : 0.5));
}

function pickIdle(u) {
  const list = [];
  const near = (x, f) => 1 / (1 + (Math.abs(u.x - x) + Math.abs(u.floor - f) * 6) * 0.06);
  for (const tr of trees) if (tr.wood > 0) list.push({ kind: 'chop', obj: tr, p1x: tr.x, p1f: 0, p2x: woodPile.x, p2f: -1, objId: tr.id, w: 3 * u.p.chop * near(tr.x, 0) });
  if (field.stage === 3) list.push({ kind: 'harvest', obj: field, p1x: field.x, p1f: 0, p2x: foodPile.x, p2f: -1, objId: 'field', w: 3.4 * u.p.harvest * near(field.x, 0) });
  if (roofLeak) list.push({ kind: 'repair', obj: null, p1x: woodPile.x, p1f: -1, p2x: SPOT.roofSpot, p2f: 1, objId: 'roof', w: 1.1 * u.p.duty * near(SPOT.roofSpot, 1) });
  for (const pl of plots) if (!pl.built && woodPile.count >= BUILD_COST) list.push({ kind: 'build', obj: pl, p1x: woodPile.x, p1f: -1, p2x: pl.x, p2f: 0, objId: pl.id, w: 0.9 * u.p.duty * near(pl.x, 0) });
  const partner = villagers.find(o => o !== u && !o.task && !o.arriving && !o.child && o.floor === u.floor && o.fl === o.floor && Math.abs(o.x - u.x) < 14);
  if (partner) list.push({ kind: 'chat', obj: null, p1x: clampX(partner.floor, partner.x + (partner.x > u.x ? -0.9 : 0.9)), p1f: partner.floor, w: 2 * u.p.social });
  if (!u.heartbrokenT) {
    for (const o of villagers) {
      if (o === u || o.child || o.arriving) continue;
      if (o.spouse != null && o.spouse !== u.i) continue;
      const aff = getAffinity(u.i, o.i);
      const interest = (u.crush === o.i ? 2.4 : 0) + aff / 40;
      if (interest > 0.1) list.push({ kind: 'together', obj: o, p1x: SPOT.bench, p1f: 0, objId: 'target:' + o.i, w: 4.5 * (0.6 + u.p.social) * interest });
    }
  }
  // 閒晃：多半在同一層，偶爾換一層（畫面上的人會自己上下樓，不會三層只有一層有人）
  let wf = u.floor; if (rnd() < 0.3) wf = [-1, 0, 1][(rnd() * 3) | 0];
  list.push({ kind: 'wander', obj: null, p1x: clampX(wf, (wf === u.floor ? u.x : 13.5) + (rnd() * 10 - 5)), p1f: wf, w: 3 * u.p.lazy });
  let sum = 0; for (const c of list) sum += Math.max(0.001, c.w);
  let r = rnd() * sum;
  for (const c of list) { r -= Math.max(0.001, c.w); if (r <= 0) return c; }
  return list[list.length - 1];
}

function dailyFSM(u, dt) {
  if (u.task || u.forced || u.arriving) return;
  if (u.hunger >= HUNGER_AUTO && foodPile.count > 0) { if (startTask(u, 'eat', eatOpts(u))) return; }
  if (u.energy <= ENERGY_AUTO) { if (startTask(u, 'sleep', sleepOpts(u))) return; }
  u.decideAt -= dt;
  if (u.decideAt <= 0) {
    u.decideAt = rrange(1.3, 2.4) / u.p.speed;
    const c = pickIdle(u);
    // 搶不到（別人鎖住同一棵樹／同一個人）就很快再挑一次，不要乾站 2 秒以上
    if (!startTask(u, c.kind, c)) u.decideAt = rrange(0.15, 0.35);
  }
}

function forcedFSM(u, dt) {
  if (!u.forced && u.hunger >= HUNGER_CRIT && foodPile.count > 0) {
    u.forced = 'hunger'; u.pausedTask = u.task; u.task = null;
    if (u.pausedTask) unlock(u.pausedTask.lockKey, u);
    startTask(u, 'eat', eatOpts(u));
  } else if (!u.forced && u.energy <= ENERGY_CRIT) {
    u.forced = 'energy'; u.pausedTask = u.task; u.task = null;
    if (u.pausedTask) unlock(u.pausedTask.lockKey, u);
    if (!startTask(u, 'sleep', sleepOpts(u))) startTask(u, 'sleep', Object.assign(sleepOpts(u), { lockKey: 'floorsleep:' + u.i }));
  }
}
function resumePaused(u) {
  if (!u.pausedTask) { u.forced = null; return; }
  const pt = u.pausedTask; u.pausedTask = null; u.forced = null;
  const ok = startTask(u, pt.kind, { assigned: pt.assigned, obj: pt.obj, objId: pt.objId, p1x: pt.p1x, p1f: pt.p1f, p2x: pt.p2x, p2f: pt.p2f });
  if (ok && u.task) { u.task.carry = pt.carry; if (pt.phase === 'goto2' || pt.phase === 'work2') u.task.phase = 'goto2'; }
}

// ---- 任務推進 ----
function tickTask(u, dt) {
  const task = u.task; if (!task) return;
  if (task.phase === 'hesitate') { task.t += dt; if (task.t >= task.hesitateDur) { task.phase = 'goto1'; task.t = 0; } return; }
  if (task.phase === 'goto1' || task.phase === 'goto2') {
    const g1 = task.phase === 'goto1';
    const arrived = walkTo(u, g1 ? task.p1x : task.p2x, g1 ? task.p1f : task.p2f, dt, u.heartbrokenT > 0 ? 0.55 : 1);
    if (arrived) { task.phase = g1 ? 'work1' : 'work2'; task.t = 0; }
    return;
  }
  if (task.phase === 'work1' || task.phase === 'work2') {
    task.t += dt;
    if (task.kind === 'eat' && task.phase === 'work2') { u.hunger = Math.max(0, u.hunger - dt * 30); if (u.hunger <= 2 || task.t >= workDuration('eat', 2)) { task.carry = null; endTask(u); } return; }
    if (task.kind === 'sleep') { u.energy = Math.min(100, u.energy + dt * 7.5); if (u.energy >= 98 || task.t >= workDuration('sleep')) endTask(u); return; }
    if (task.kind === 'together') {
      const partner = task.obj;
      const there = partner && !partner.child && partner.floor === 0 && Math.abs(partner.x - SPOT.bench) < 2.5;
      if (there && rnd() < dt * 2.2) { addAffinity(u.i, partner.i, 5); burst(SPOT.bench, -12, PAL.red); sfx.coin(); }
      if (task.t >= workDuration('together')) endTask(u);
      return;
    }
    const need = workDuration(task.kind, task.phase === 'work1' ? 1 : 2) * (u.heartbrokenT > 0 ? 1.4 : 1);
    if (task.t < need) return;
    stageComplete(u, task);
  }
}
function stageComplete(u, task) {
  const stage = task.phase === 'work1' ? 1 : 2;
  const toGoto2 = () => { task.phase = 'goto2'; task.t = 0; };
  if (task.kind === 'eat') {
    if (foodPile.count > 0) { foodPile.count--; task.carry = 'food'; sfx.chip(); toGoto2(); } else endTask(u);
    return;
  }
  if (task.kind === 'chop') {
    if (stage === 1) { const tr = task.obj; if (tr.wood > 0) { tr.wood--; sfx.chip(); if (tr.wood <= 0) tr.regenAt = t + 12; task.carry = 'wood'; toGoto2(); } else endTask(u); }
    else { woodPile.count = Math.min(woodPile.max, woodPile.count + 1); task.carry = null; sfx.coin(); pop(woodPile.x, FH - 26, '+1', PAL.orange); endTask(u); }
    return;
  }
  if (task.kind === 'harvest') {
    if (stage === 1) { if (field.stage === 3) { field.stage = 0; field.t = 0; sfx.chip(); task.carry = 'food'; toGoto2(); } else endTask(u); }
    else { foodPile.count = Math.min(foodPile.max, foodPile.count + HARVEST_YIELD); task.carry = null; sfx.coin(); pop(foodPile.x, FH - 26, '+' + HARVEST_YIELD, PAL.lgreen); endTask(u); }
    return;
  }
  if (task.kind === 'repair') {
    if (stage === 1) { if (woodPile.count >= REPAIR_COST) { woodPile.count -= REPAIR_COST; task.carry = 'wood'; toGoto2(); } else endTask(u); }
    else { roofLeak = false; task.carry = null; sfx.clank(); burst(SPOT.roofSpot, -2 * FH + 2, PAL.gold); endTask(u); }
    return;
  }
  if (task.kind === 'build') {
    if (stage === 1) { if (woodPile.count >= BUILD_COST && !task.obj.built) { woodPile.count -= BUILD_COST; task.carry = 'wood'; toGoto2(); } else endTask(u); }
    else { if (!task.obj.built) { task.obj.built = true; sfx.up(); flash = 0.3; spawnVillager(); } task.carry = null; endTask(u); }
    return;
  }
  endTask(u);
}
function endTask(u) { if (u.task) unlock(u.task.lockKey, u); u.task = null; u.decideAt = Math.min(u.decideAt, rrange(0.2, 0.6)); }

// ---- 天氣：下雨→二樓屋頂漏水→床上的人被吵醒 ----
function updateWeather(dt) {
  if (!rain.active) {
    if (t >= rain.nextAt) { rain.active = true; rain.t = 0; rain.dur = rrange(9, 14); roofLeak = true; sfx.woosh(); }
  } else {
    rain.t += dt;
    if (rain.t >= rain.dur) { rain.active = false; rain.nextAt = t + rrange(28, 45); }
  }
  if (roofLeak) {
    for (const u of villagers) {
      // 只有漏水正下方那張床的人會被滴醒（v3 是三張床全醒 → 漏水沒人修時，全員躺下就醒、精力永遠 0）
      if (u.task && u.task.kind === 'sleep' && u.task.phase === 'work1' && u.task.p1x === SPOT.roofSpot) {
        endTask(u); u.unhappyT = 4.5; sfx.clank();
        u.x = clampX(1, u.x + (rnd() < 0.5 ? -1.6 : 1.6)); u.fx = u.x;
      }
    }
  }
  for (const u of villagers) if (u.unhappyT > 0) u.unhappyT -= dt;
}

// ---- 感情 ----
function onBench(v) { return !v.child && !v.arriving && v.floor === 0 && v.fl === 0 && Math.abs(v.x - SPOT.bench) < 2.5; }
function updateRomance(dt) {
  for (const u of villagers) {
    if (u.child || u.arriving || u.crush == null) continue;
    if (u.crushBubbleT > 0) { u.crushBubbleT -= dt; continue; }
    u.crushCd -= dt;
    if (u.crushCd <= 0) { u.crushBubbleT = 1.6; u.crushCd = rrange(9, 16); }
  }
  const atBench = villagers.filter(onBench);
  if (atBench.length >= 2) {
    for (const u of villagers) {
      if (u.child || u.arriving || u.heartbrokenT > 0 || u.crush == null) continue;
      const crushV = villagers.find(v => v.i === u.crush);
      if (!crushV || !atBench.includes(crushV)) continue;
      if (!atBench.some(v => v !== crushV && v !== u)) continue;
      if (u.floor !== 0 || Math.abs(u.x - SPOT.bench) > 7) continue;
      if (rnd() < dt * 0.35) {
        u.heartbrokenT = HEARTBREAK_DUR;
        if (u.task) { unlock(u.task.lockKey, u); u.task = null; }
        u.x = clampX(0, u.x + (u.x < SPOT.bench ? -2.2 : 2.2)); u.fx = u.x;
        sfx.clank();
      }
    }
  }
  for (const u of villagers) if (u.heartbrokenT > 0) u.heartbrokenT -= dt;
}

// ---- 主更新 ----
function update(dt) {
  t += dt;
  updateWeather(dt);
  field.t += dt;
  if (field.stage === 0 && field.t >= 3) { field.stage = 1; field.t = 0; }
  else if (field.stage === 1 && field.t >= 4) { field.stage = 2; field.t = 0; }
  else if (field.stage === 2 && field.t >= 4) { field.stage = 3; field.t = 0; }
  for (const tr of trees) if (tr.wood <= 0 && tr.regenAt > 0 && t >= tr.regenAt) { tr.wood = 3; tr.regenAt = -1; }
  for (const pl of plots) if (pl.home && !pl.childSpawned && pl.childAt != null && t >= pl.childAt) { pl.childSpawned = true; spawnChild(pl); }

  for (const u of villagers) {
    if (u.child) {
      if (t >= u.growAt) growUp(u);
      else {
        const pl = plots.find(p => p.id === u.homePlot);
        const parents = pl && pl.home ? pl.home.map(idx => villagers.find(v => v.i === idx)).filter(Boolean) : [];
        const target = parents.length === 2 ? (Math.abs(parents[0].x - u.x) + Math.abs(parents[0].floor - u.floor) * 6 < Math.abs(parents[1].x - u.x) + Math.abs(parents[1].floor - u.floor) * 6 ? parents[0] : parents[1]) : parents[0];
        if (target && (target.floor !== u.floor || Math.abs(target.x - u.x) > 2.2)) walkTo(u, target.x + (target.x > u.x ? -1.5 : 1.5), target.floor, dt, 0.6);
        continue;
      }
    }
    if (u.arriving) { if (walkTo(u, SPOT.settle, 0, dt, 0.9)) u.arriving = false; continue; }
    needsFSM(u, dt);
    forcedFSM(u, dt);
    if (u.forced) { tickTask(u, dt); if (!u.task) resumePaused(u); continue; }
    if (!u.task && u.pausedTask) resumePaused(u);
    dailyFSM(u, dt);
    tickTask(u, dt);
  }
  updateRomance(dt);
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
  for (const p of pops) { p.y -= dt * 6; p.life -= dt * 1.1; }
  pops = pops.filter(p => p.life > 0);
  flash = Math.max(0, flash - dt * 2);
  if (rain.active && rnd() < dt * 90) parts.push({ x: rnd(), y: 0, vx: 0, vy: 1, life: 1.2, col: PAL.cyan, rain: true });
}

// ---- 玩家操作：選人 → 點目標 ----
let selected = null, inspected = null, hintStage = 0, targetLabels = [];
function villagerAt(wx, wf) {
  let best = null, bd = 1.6;
  for (const u of villagers) { if (u.arriving || u.floor !== wf) continue; const d = Math.abs(u.fx - wx); if (d < bd) { bd = d; best = u; } }
  return best;
}
function actionAt(wx, wf) {
  const hit = (x) => Math.abs(wx - x) < 1.6;
  if (wf >= 0) for (const tr of trees) if (tr.wood > 0 && hit(tr.x)) return { kind: 'chop', obj: tr, p1x: tr.x, p1f: 0, p2x: woodPile.x, p2f: -1, objId: tr.id };
  if (wf === 0 && field.stage === 3 && hit(field.x)) return { kind: 'harvest', obj: field, p1x: field.x, p1f: 0, p2x: foodPile.x, p2f: -1, objId: 'field' };
  if (wf === 1 && roofLeak && hit(SPOT.roofSpot)) return { kind: 'repair', obj: null, p1x: woodPile.x, p1f: -1, p2x: SPOT.roofSpot, p2f: 1, objId: 'roof' };
  if (wf >= 0) for (const pl of plots) if (!pl.built && woodPile.count >= BUILD_COST && hit(pl.x)) return { kind: 'build', obj: pl, p1x: woodPile.x, p1f: -1, p2x: pl.x, p2f: 0, objId: pl.id };
  return null;
}
function assign(u, act) {
  if (u.task) { unlock(u.task.lockKey, u); u.task = null; }
  u.pausedTask = null; u.forced = null;
  startTask(u, act.kind, Object.assign({}, act, { assigned: true }));
}
function assignTogether(u, target) {
  if (u.task) { unlock(u.task.lockKey, u); u.task = null; }
  u.pausedTask = null; u.forced = null; u.heartbrokenT = 0;
  startTask(u, 'together', { assigned: true, obj: target, objId: 'target:' + target.i, p1x: SPOT.bench, p1f: 0 });
}

// ---- 音效（WebAudio 合成，預設靜音）----
let ac = null;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); }
function tone(freq, dur, vol, type, when, slide) {
  if (muted || !ac) return; const tt = ac.currentTime + (when || 0); const o = ac.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(freq, tt);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, tt + dur);
  const gn = ac.createGain(); gn.gain.setValueAtTime(vol, tt); gn.gain.exponentialRampToValueAtTime(0.001, tt + dur); o.connect(gn); gn.connect(ac.destination); o.start(tt); o.stop(tt + dur + 0.02);
}
let noiseBuf = null;
function noise(dur, freq, vol, q) {
  if (muted || !ac) return; if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
  const gn = ac.createGain(); const tt = ac.currentTime; gn.gain.setValueAtTime(vol, tt); gn.gain.exponentialRampToValueAtTime(0.001, tt + dur);
  s.connect(f); f.connect(gn); gn.connect(ac.destination); s.start(tt); s.stop(tt + dur);
}
const sfx = {
  select: () => tone(700, 0.05, 0.05, 'square'),
  assign: () => { tone(500, 0.06, 0.07, 'square'); tone(760, 0.08, 0.05, 'square', 0.05); },
  chip: () => noise(0.05, 800, 0.15, 2),
  coin: () => tone(880, 0.08, 0.06, 'square'),
  clank: () => { tone(1200, 0.06, 0.08, 'square'); tone(1700, 0.09, 0.05, 'triangle', 0.02); },
  woosh: () => { noise(0.18, 900, 0.12, 1.4); tone(300, 0.15, 0.06, 'sine', 0, 700); },
  up: () => [0, 4, 7, 12].forEach((n, i) => tone(440 * 2 ** (n / 12), 0.1, 0.07, 'square', i * 0.06)),
  newf: () => [0, 7, 12].forEach((n, i) => tone(500 * 2 ** (n / 12), 0.15, 0.06, 'triangle', i * 0.07)),
};

// ---- 特效 ----
let parts = [], pops = [], flash = 0;
function burst(x, y, col) { for (let i = 0; i < 8; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, life: 0.4 + Math.random() * 0.3, col }); }
function pop(x, y, txtStr, col) { pops.push({ x, y, txt: txtStr, col, life: 1 }); }

// ---- 迷你像素字 ----
const FONT = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  '+': '000010111010000', '-': '000000111000000', ':': '000010000010000', '%': '101001010100101',
  'A': '010101111101101', 'B': '110101110101110', 'C': '011100100100011', 'D': '110101101101110', 'E': '111100111100111', 'F': '111100111100100',
  'G': '111100101101111', 'H': '101101111101101' };
function txt(s, x, y, col, sc) {
  sc = sc || 1; g.fillStyle = col; s = String(s);
  for (let i = 0; i < s.length; i++) { const f = FONT[s[i]]; if (f) for (let j = 0; j < 15; j++) if (f[j] === '1') g.fillRect(x + (j % 3) * sc, y + ((j / 3) | 0) * sc, sc, sc); x += 4 * sc; }
}
function txtW(s, sc) { return String(s).length * 4 * (sc || 1) - (sc || 1); }

// ---- 圖示 ----
function icon(kind, x, y) {
  g.fillStyle = PAL.white;
  if (kind === 'bang') { g.fillStyle = PAL.gold; g.fillRect(x + 2, y, 2, 4); g.fillRect(x + 2, y + 5, 2, 2); g.fillStyle = PAL.dgray; g.fillRect(x + 2, y + 1, 2, 3); g.fillRect(x + 2, y + 6, 2, 1); }
  else if (kind === 'sleep') { g.fillStyle = PAL.cyan; g.fillRect(x, y, 5, 1); g.fillRect(x + 3, y + 1, 2, 1); g.fillRect(x + 2, y + 2, 2, 1); g.fillRect(x + 1, y + 3, 2, 1); g.fillRect(x, y + 4, 5, 1); }
  else if (kind === 'eat') { g.fillStyle = PAL.orange; g.fillRect(x + 1, y + 1, 4, 4); g.fillStyle = PAL.gold; g.fillRect(x + 2, y + 2, 2, 2); }
  else if (kind === 'hungry') { g.fillStyle = PAL.gold; g.fillRect(x, y + 1, 6, 4); g.fillStyle = PAL.dgray; g.fillRect(x + 1, y + 2, 1, 1); g.fillRect(x + 4, y + 2, 1, 1); }
  else if (kind === 'tired') { g.fillStyle = PAL.lgray; g.fillRect(x, y + 2, 6, 2); }
  else if (kind === 'unhappy') { g.fillStyle = PAL.cyan; g.fillRect(x + 2, y - 1, 3, 5); g.fillRect(x + 1, y + 4, 5, 3); g.fillStyle = PAL.dgray; g.fillRect(x + 2, y + 5, 1, 1); g.fillRect(x + 5, y + 5, 1, 1); g.fillRect(x + 2, y + 7, 4, 1); }
  else if (kind === 'chat') { g.fillStyle = PAL.white; g.fillRect(x, y, 6, 4); g.fillRect(x + 1, y + 4, 2, 1); g.fillStyle = PAL.dgray; g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + 3, y + 1, 1, 1); }
  else if (kind === 'chop') { g.fillStyle = PAL.lgray; g.fillRect(x + 1, y, 4, 2); g.fillStyle = PAL.dgray; g.fillRect(x + 2, y + 2, 1, 4); }
  else if (kind === 'harvest') { g.fillStyle = PAL.lgreen; g.fillRect(x + 2, y, 2, 2); g.fillRect(x + 1, y + 2, 4, 2); g.fillStyle = PAL.dgray; g.fillRect(x + 2, y + 4, 1, 3); }
  else if (kind === 'repair') { g.fillStyle = PAL.lgray; g.fillRect(x, y + 2, 6, 2); g.fillStyle = PAL.dgray; g.fillRect(x + 2, y, 2, 6); }
  else if (kind === 'build') { g.fillStyle = PAL.dgray; g.fillRect(x + 2, y, 1, 5); g.fillStyle = PAL.lgray; g.fillRect(x, y, 4, 2); }
  else if (kind === 'wander') { g.fillStyle = PAL.lgray; g.fillRect(x + 1, y + 2, 1, 1); g.fillRect(x + 3, y + 2, 1, 1); g.fillRect(x + 5, y + 2, 1, 1); }
  else if (kind === 'carrywood') { g.fillStyle = PAL.dgray; g.fillRect(x, y + 1, 5, 2); g.fillStyle = PAL.orange; g.fillRect(x, y, 5, 1); }
  else if (kind === 'carryfood') { g.fillStyle = PAL.green; g.fillRect(x, y, 4, 3); g.fillStyle = PAL.lgreen; g.fillRect(x + 1, y, 2, 1); }
  else if (kind === 'mute') { g.fillStyle = PAL.white; g.fillRect(x, y + 3, 2, 3); g.fillRect(x + 2, y + 2, 1, 5); g.fillRect(x + 3, y + 1, 1, 7); g.fillRect(x + 4, y, 1, 9); if (muted) { g.fillStyle = PAL.red; for (let i = 0; i < 6; i++) g.fillRect(x + 6 + i, y + 1 + i, 1, 1); for (let i = 0; i < 6; i++) g.fillRect(x + 11 - i, y + 1 + i, 1, 1); } else { g.fillRect(x + 6, y + 3, 1, 3); g.fillRect(x + 8, y + 1, 1, 7); } }
  else if (kind === 'rain') { g.fillStyle = PAL.lgray; g.fillRect(x, y, 8, 4); g.fillRect(x - 1, y + 1, 10, 2); g.fillStyle = PAL.cyan; g.fillRect(x + 1, y + 5, 1, 3); g.fillRect(x + 4, y + 5, 1, 3); g.fillRect(x + 7, y + 5, 1, 3); }
  else if (kind === 'heart') { g.fillStyle = PAL.red; g.fillRect(x, y, 2, 2); g.fillRect(x + 3, y, 2, 2); g.fillRect(x - 1, y + 1, 7, 2); g.fillRect(x, y + 3, 5, 1); g.fillRect(x + 1, y + 4, 3, 1); g.fillRect(x + 2, y + 5, 1, 1); }
  else if (kind === 'brokenheart') { g.fillStyle = PAL.red; g.fillRect(x - 1, y, 3, 2); g.fillRect(x + 4, y, 3, 2); g.fillRect(x - 1, y + 1, 3, 3); g.fillRect(x + 4, y + 1, 3, 3); g.fillRect(x, y + 4, 2, 1); g.fillRect(x + 4, y + 4, 2, 1); g.fillRect(x + 1, y + 5, 1, 1); g.fillRect(x + 4, y + 5, 1, 1); g.fillStyle = PAL.black; g.fillRect(x + 2, y, 1, 2); g.fillRect(x + 3, y + 2, 1, 2); g.fillRect(x + 2, y + 4, 1, 2); }
  else if (kind === 'together') { g.fillStyle = PAL.red; for (const [ox, oy] of [[0, 0], [4, 3]]) { g.fillRect(x + ox, y + oy, 1, 1); g.fillRect(x + ox + 2, y + oy, 1, 1); g.fillRect(x + ox, y + oy + 1, 3, 1); g.fillRect(x + ox + 1, y + oy + 2, 1, 1); } }
}

// ---- 鏡頭與輸入：世界座標 y＝0 是地面，往下是正；第 f 層地板在 y = -f*FH ----
const WORLD_TOP = -2 * FH - 40, WORLD_BOT = FH + 14;
let camX = 13.5 * T, camY = -8, offX = 0, offY = 0, drag = null, camFollow = true;
function sx(wx) { return offX + wx * T; }
function sy(wy) { return offY + wy; }
function floorY(f) { return -f * FH; }
function muteRect() { return { x: W - 18, y: 3, w: 15, h: 13 }; }
function toLogic(cx, cy) { const r = cv.getBoundingClientRect(); return [(cx - r.left) / S, (cy - r.top) / S]; }
cv.addEventListener('pointerdown', e => { audio(); drag = { x0: e.clientX, y0: e.clientY, cx: camX, cy: camY, moved: false }; });
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (Math.abs(dx) + Math.abs(dy) > 8) drag.moved = true;
  if (drag.moved) { camX = drag.cx - dx / S; camY = drag.cy - dy / S; camFollow = false; }
});
cv.addEventListener('pointerup', e => { const d = drag; drag = null; if (d && !d.moved) onTap(e); });
cv.addEventListener('pointercancel', () => { drag = null; });
addEventListener('wheel', e => { camY += e.deltaY / S * 0.5; camX += e.deltaX / S * 0.5; camFollow = false; }, { passive: true });
function onTap(e) {
  const [lx, ly] = toLogic(e.clientX, e.clientY);
  const mb = muteRect(); if (lx >= mb.x && lx < mb.x + mb.w && ly >= mb.y && ly < mb.y + mb.h) { muted = !muted; return; }
  const wx = (lx - offX) / T, wy = ly - offY;
  const wf = Math.max(-1, Math.min(1, Math.floor(-wy / FH)));
  if (selected) {
    const act = actionAt(wx, wf);
    if (act) { assign(selected, act); sfx.assign(); selected = null; hintStage = 2; return; }
    const other = villagerAt(wx, wf);
    if (other) {
      if (other === selected || other.child) { selected = null; return; }
      assignTogether(selected, other); sfx.assign(); selected = null; hintStage = 2; return;
    }
    selected = null; inspected = null; return;
  }
  const u = villagerAt(wx, wf);
  if (u && !u.child) { selected = u; inspected = u; camFollow = true; sfx.select(); if (!hintStage) hintStage = 1; }
  else inspected = u || null;
}

// ---- 繪圖 ----
function lerpCol(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
function drawSky() {
  const top = 0, gy = sy(0);
  const grd = g.createLinearGradient(0, sy(WORLD_TOP), 0, gy);
  if (rain.active) { grd.addColorStop(0, PAL.dgray); grd.addColorStop(1, PAL.teal); }
  else { grd.addColorStop(0, PAL.blue); grd.addColorStop(0.6, PAL.sky); grd.addColorStop(1, PAL.gold); }
  g.fillStyle = grd; g.fillRect(0, top, W, Math.max(0, gy - top));
  // 遠山（視差 0.3，暗、偏藍，跟前景分開）
  const par = offX * 0.3;
  g.fillStyle = rain.active ? PAL.gray : PAL.navy; g.globalAlpha = 0.55;
  for (let x = -40; x < W + 40; x++) {
    const wx = x - par;
    const h = 22 + Math.abs(((wx % 96) + 96) % 96 - 48) * 0.55;
    g.fillRect(x, gy - h + 18, 1, h - 18);
  }
  g.globalAlpha = 1;
  // 近丘（視差 0.6，綠）
  const par2 = offX * 0.6;
  g.fillStyle = rain.active ? PAL.dgray : PAL.teal;
  for (let x = 0; x < W; x++) { const wx = x - par2; const h = 10 + Math.sin(wx / 23) * 5 + Math.sin(wx / 9) * 2; g.fillRect(x, gy - h, 1, h); }
  // 雲
  g.fillStyle = rain.active ? PAL.gray : PAL.white; g.globalAlpha = rain.active ? 0.9 : 0.7;
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 97 + t * (rain.active ? 9 : 3)) % (WW * T + 80)) - 40 + offX * 0.2, cy = sy(WORLD_TOP + 14 + (i * 23) % 40);
    g.fillRect(cx, cy, 26, 5); g.fillRect(cx + 5, cy - 3, 14, 3);
  }
  g.globalAlpha = 1;
}
function drawEarth() {
  // 地表以下的剖面：土的漸層＋小石頭顆粒（固定雜訊，捲動不會閃）
  const gy = sy(0);
  if (gy >= H) return;
  const grd = g.createLinearGradient(0, gy, 0, sy(WORLD_BOT + 20));
  grd.addColorStop(0, '#6b4a33'); grd.addColorStop(1, '#2a1d17');
  g.fillStyle = grd; g.fillRect(0, gy, W, H - gy);
  const x0 = Math.floor(-offX), y0 = Math.max(0, Math.floor(-gy));
  for (let py = y0; py < H - gy; py += 3) for (let px = x0 - (x0 % 3) - 3; px < x0 + W; px += 3) {
    const h = hash(px, py);
    if (h < 0.1) { g.fillStyle = h < 0.03 ? '#a07a52' : '#3d2a1f'; g.fillRect(offX + px, gy + py, h < 0.05 ? 2 : 1, 1); }
  }
  // 草皮
  g.fillStyle = PAL.green; g.fillRect(0, gy - 1, W, 3);
  g.fillStyle = PAL.lgreen; for (let px = -((offX % 4 + 4) % 4); px < W; px += 4) if (hash(px - offX | 0, 7) < 0.6) g.fillRect(px, gy - 2, 1, 2);
}
function woodWall(x0, x1, yTop, yBot, base, dark) {
  g.fillStyle = base; g.fillRect(x0, yTop, x1 - x0, yBot - yTop);
  g.fillStyle = dark;
  for (let x = x0; x < x1; x += 6) g.fillRect(x, yTop, 1, yBot - yTop);                      // 木板縫
  for (let x = x0; x < x1; x += 6) for (let y = yTop + 3; y < yBot; y += 9) if (hash(x - offX | 0, y - offY | 0) < 0.35) g.fillRect(x + 2, y, 2, 1); // 木紋節
  const sh = g.createLinearGradient(0, yTop, 0, yBot); sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(0.3, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.15)');
  g.fillStyle = sh; g.fillRect(x0, yTop, x1 - x0, yBot - yTop);
}
function stoneWall(x0, x1, yTop, yBot) {
  g.fillStyle = '#3a3a4a'; g.fillRect(x0, yTop, x1 - x0, yBot - yTop);
  let row = 0;
  for (let y = yTop; y < yBot; y += 6, row++) {
    for (let x = x0 - (row % 2) * 5; x < x1; x += 10) {
      const h = hash(x - offX | 0, y - offY | 0);
      g.fillStyle = h < 0.33 ? '#4a4a5c' : h < 0.66 ? '#454556' : '#50505f';
      const xa = Math.max(x0, x + 1), xb = Math.min(x1, x + 9); if (xb > xa) g.fillRect(xa, y + 1, xb - xa, 4);
    }
  }
}
function drawHouse() {
  const x0 = sx(HOUSE.x0), x1 = sx(HOUSE.x1);
  const g0 = sy(0), g1 = sy(-FH), top = sy(-2 * FH), cel = sy(FH);
  // 地窖：石牆＋燈籠暖光
  stoneWall(x0, x1, g0, cel);
  const lan = sx(13.5);
  const rg = g.createRadialGradient(lan, g0 + 12, 2, lan, g0 + 12, 70); rg.addColorStop(0, 'rgba(255,205,117,0.35)'); rg.addColorStop(1, 'rgba(255,205,117,0)');
  g.fillStyle = rg; g.fillRect(x0, g0, x1 - x0, FH);
  g.fillStyle = PAL.dgray; g.fillRect(lan, g0 + 2, 1, 6); g.fillStyle = (t * 3 | 0) % 7 ? PAL.gold : PAL.orange; g.fillRect(lan - 1, g0 + 8, 3, 4);
  // 酒桶（背景道具）
  for (const bx of [18.8, 7.4]) { const x = sx(bx); g.fillStyle = '#5b3a29'; g.fillRect(x - 5, cel - 12, 10, 12); g.fillStyle = PAL.dgray; g.fillRect(x - 5, cel - 9, 10, 1); g.fillRect(x - 5, cel - 4, 10, 1); g.fillStyle = '#7a5238'; g.fillRect(x - 3, cel - 12, 2, 12); }
  // 一樓：廚房木牆（暖）
  woodWall(x0, x1, g1, g0, '#8a5a3b', '#6b442c');
  // 窗（戶外光）
  for (const wx of [9.5, 16.5]) { const x = sx(wx); g.fillStyle = PAL.dgray; g.fillRect(x - 6, g1 + 10, 12, 12); g.fillStyle = rain.active ? PAL.gray : PAL.sky; g.fillRect(x - 5, g1 + 11, 10, 10); g.fillStyle = PAL.dgray; g.fillRect(x, g1 + 11, 1, 10); g.fillStyle = PAL.white; g.globalAlpha = 0.35; g.fillRect(x - 4, g1 + 12, 3, 3); g.globalAlpha = 1; }
  // 二樓：臥室（冷色木牆，跟一樓分開）
  woodWall(x0, x1, top, g1, '#6d5a78', '#56465f');
  const x = sx(13.5); g.fillStyle = PAL.dgray; g.fillRect(x - 5, top + 8, 10, 8); g.fillStyle = rain.active ? PAL.gray : PAL.gold; g.fillRect(x - 4, top + 9, 8, 6);
  // 樓板（地板梁，亮一點＝前景結構）
  for (const y of [g1, g0, cel]) { g.fillStyle = '#c28b5b'; g.fillRect(x0 - 2, y, x1 - x0 + 4, 3); g.fillStyle = '#5b3a29'; g.fillRect(x0 - 2, y + 3, x1 - x0 + 4, 1); }
  // 樓梯與梯子的洞口（樓板開口）
  for (const ln of LINKS) { const lx = sx(ln.x); const yy = sy(floorY(ln.b)); g.fillStyle = ln.a === -1 ? '#2a2a36' : '#4a3a52'; g.fillRect(lx - 5, yy, 10, 4); }
  // 外牆
  g.fillStyle = '#4a2f22'; g.fillRect(x0 - 3, top, 3, cel - top + 3); g.fillRect(x1, top, 3, cel - top + 3);
  // 門
  g.fillStyle = '#4a2f22'; g.fillRect(x1 - 1, g0 - 18, 4, 18); g.fillStyle = PAL.gold; g.fillRect(x1 + 1, g0 - 9, 1, 2);
  // 屋頂：三角＋瓦片紋
  const rh = 22, rx0 = x0 - 8, rx1 = x1 + 8, mid = (rx0 + rx1) / 2;
  for (let yy = 0; yy < rh; yy++) {
    const half = (rx1 - rx0) / 2 * (yy + 1) / rh;
    g.fillStyle = yy % 4 === 3 ? '#7a2e3c' : (yy % 8 < 4 ? PAL.red : '#c24a5e');
    g.fillRect(Math.round(mid - half), top - rh + yy, Math.round(half * 2), 1);
  }
  const leakX = sx(SPOT.roofSpot);
  if (roofLeak) {
    g.fillStyle = (t * 4 | 0) % 2 ? PAL.black : PAL.orange; g.fillRect(leakX - 3, top - 4, 6, 4);
    const dy = (t * 50) % (FH - 6);
    g.fillStyle = PAL.cyan; g.fillRect(leakX - 1, top + dy, 2, 5);
    g.fillStyle = PAL.blue; g.globalAlpha = 0.7; g.fillRect(leakX - 5, g1 - 2, 10, 2); g.globalAlpha = 1;
  }
  // 煙囪
  g.fillStyle = '#4a4a5c'; g.fillRect(sx(17.5), top - 20, 6, 14);
  if (!rain.active) { g.fillStyle = PAL.lgray; g.globalAlpha = 0.5; for (let i = 0; i < 4; i++) { const k = (t * 0.6 + i / 4) % 1; g.fillRect(sx(17.5) + 2 + Math.sin(k * 6 + i) * 3, top - 22 - k * 24, 3, 3); } g.globalAlpha = 1; }
}
function drawLinks() {
  for (const ln of LINKS) {
    const lx = sx(ln.x), yb = sy(floorY(ln.a)), yt = sy(floorY(ln.b));
    if (ln.kind === 'ladder') {
      g.fillStyle = '#c28b5b'; g.fillRect(lx - 4, yt, 2, yb - yt); g.fillRect(lx + 2, yt, 2, yb - yt);
      g.fillStyle = '#e0ad7a'; for (let y = yt + 3; y < yb; y += 5) g.fillRect(lx - 3, y, 6, 1);
    } else {
      // 樓梯：斜的踏階（畫在牆前，人爬的時候看得到在樓梯上）
      const n = 9;
      for (let i = 0; i < n; i++) { const yy = yb - (i + 1) * (yb - yt) / n; const xx = lx + 8 - i * 1.8; g.fillStyle = '#c28b5b'; g.fillRect(xx - 3, yy, 7, 2); g.fillStyle = '#5b3a29'; g.fillRect(xx - 3, yy + 2, 7, 1); }
      g.fillStyle = '#5b3a29'; g.fillRect(lx + 12, yt, 1, yb - yt);
    }
  }
}
function drawBench() {
  const x = sx(SPOT.bench), y = sy(0);
  g.fillStyle = '#8a5a3b'; g.fillRect(x - 8, y - 6, 16, 2); g.fillRect(x - 8, y - 11, 16, 2);
  g.fillStyle = '#4a2f22'; g.fillRect(x - 7, y - 4, 2, 4); g.fillRect(x + 5, y - 4, 2, 4); g.fillRect(x - 7, y - 11, 1, 5); g.fillRect(x + 6, y - 11, 1, 5);
}
function drawPile(pile, kind) {
  const x = sx(pile.x), y = sy(floorY(pile.f));
  g.fillStyle = '#4a2f22'; g.fillRect(x - 9, y - 30, 2, 30); g.fillRect(x + 7, y - 30, 2, 30); g.fillRect(x - 9, y - 1, 18, 1);
  for (let i = 0; i < pile.count; i++) {
    const yy = y - 4 - i * 3.4 | 0;
    if (kind === 'wood') { for (let k = 0; k < 3; k++) { g.fillStyle = '#9c6b43'; g.fillRect(x - 6 + k * 4, yy, 4, 3); g.fillStyle = PAL.gold; g.fillRect(x - 5 + k * 4, yy + 1, 2, 1); } }
    else { g.fillStyle = i % 2 ? '#b89060' : '#d2aa70'; g.fillRect(x - 6, yy, 12, 3); g.fillStyle = PAL.green; g.fillRect(x - 4 + (i % 3) * 3, yy - 1, 2, 1); }
  }
  if (pile.count === 0) { g.fillStyle = PAL.red; g.globalAlpha = 0.5 + Math.sin(t * 5) * 0.3; g.fillRect(x - 5, y - 3, 10, 2); g.globalAlpha = 1; }
}
function drawTree(tr) {
  const x = sx(tr.x), y = sy(0);
  g.fillStyle = '#5b3a29'; g.fillRect(x - 2, y - 16, 4, 16); g.fillStyle = '#7a5238'; g.fillRect(x - 1, y - 16, 1, 16);
  if (tr.wood > 0) {
    const s = 0.6 + tr.wood * 0.14;
    const blob = (cx, cy, r, c) => { g.fillStyle = c; g.fillRect(x + cx - r, y + cy - r * 0.8, r * 2, r * 1.6); };
    blob(0, -26 * s - 6, 11 * s, '#1f6b4f'); blob(-4, -30 * s - 6, 7 * s, PAL.green); blob(3, -22 * s - 6, 6 * s, PAL.green); blob(-2, -32 * s - 6, 3 * s, PAL.lgreen);
  } else { g.fillStyle = '#7a5238'; g.fillRect(x - 3, y - 17, 6, 2); }
}
function drawField() {
  const x = sx(field.x), y = sy(0);
  g.fillStyle = '#4a3326'; g.fillRect(x - 12, y - 2, 24, 3);
  for (let i = -10; i <= 10; i += 5) {
    if (field.stage === 1) { g.fillStyle = PAL.lgreen; g.fillRect(x + i, y - 4, 1, 2); }
    else if (field.stage === 2) { g.fillStyle = PAL.green; g.fillRect(x + i, y - 9, 2, 7); g.fillRect(x + i - 1, y - 7, 1, 2); }
    else if (field.stage === 3) { g.fillStyle = PAL.green; g.fillRect(x + i, y - 10, 1, 8); g.fillStyle = PAL.gold; g.fillRect(x + i - 1, y - 14, 3, 5); }
  }
  if (field.stage === 3) { g.fillStyle = (t * 3 | 0) % 2 ? PAL.white : PAL.gold; g.fillRect(x - 1, y - 20, 3, 3); }
}
function drawKitchen() {
  const x = sx(SPOT.stove), y = sy(0);
  g.fillStyle = '#4a4a5c'; g.fillRect(x - 7, y - 12, 14, 12); g.fillStyle = '#2a2a36'; g.fillRect(x - 4, y - 8, 8, 6);
  const fl = (t * 8 | 0) % 2; g.fillStyle = PAL.orange; g.fillRect(x - 3, y - 6 - fl, 6, 3 + fl); g.fillStyle = PAL.gold; g.fillRect(x - 1, y - 5, 2, 2);
  const rg = g.createRadialGradient(x, y - 5, 1, x, y - 5, 22); rg.addColorStop(0, 'rgba(239,125,87,0.35)'); rg.addColorStop(1, 'rgba(239,125,87,0)'); g.fillStyle = rg; g.fillRect(x - 22, y - 27, 44, 27);
  g.fillStyle = PAL.dgray; g.fillRect(x - 5, y - 15, 10, 3); // 鍋
  // 餐桌
  const tx = sx(10.5); g.fillStyle = '#9c6b43'; g.fillRect(tx - 7, y - 8, 14, 2); g.fillStyle = '#5b3a29'; g.fillRect(tx - 6, y - 6, 1, 6); g.fillRect(tx + 5, y - 6, 1, 6);
}
function drawBeds() {
  for (const bx of SPOT.beds) {
    const x = sx(bx), y = sy(floorY(1));
    g.fillStyle = '#5b3a29'; g.fillRect(x - 9, y - 9, 2, 9); g.fillRect(x + 7, y - 5, 2, 5);
    g.fillStyle = PAL.blue; g.fillRect(x - 7, y - 6, 14, 4); g.fillStyle = PAL.navy; g.fillRect(x - 7, y - 3, 14, 1);
    g.fillStyle = PAL.white; g.fillRect(x - 7, y - 8, 4, 2);
  }
}
function drawPlots() {
  for (const pl of plots) {
    const x = sx(pl.x), y = sy(0);
    if (pl.built) {
      woodWall(x - 11, x + 11, y - 22, y, '#9c6b43', '#7a5238');
      for (let yy = 0; yy < 10; yy++) { const half = 14 * (yy + 1) / 10; g.fillStyle = yy % 3 === 2 ? '#1f5a6a' : PAL.teal; g.fillRect(Math.round(x - half), y - 32 + yy, Math.round(half * 2), 1); }
      g.fillStyle = '#4a2f22'; g.fillRect(x - 3, y - 11, 6, 11); g.fillStyle = PAL.gold; g.fillRect(x + 5, y - 17, 4, 4);
      if (pl.home) icon('heart', x - 2, y - 40);
    } else if (woodPile.count >= BUILD_COST) {
      g.strokeStyle = PAL.white; g.globalAlpha = 0.5 + Math.sin(t * 3) * 0.35; g.setLineDash([2, 2]);
      g.strokeRect(x - 10.5, y - 22.5, 21, 22); g.setLineDash([]); g.globalAlpha = 1;
    } else {
      g.fillStyle = '#9c6b43'; g.fillRect(x - 11, y - 5, 1, 5); g.fillRect(x + 10, y - 5, 1, 5); g.fillStyle = PAL.white; g.fillRect(x - 11, y - 5, 22, 1);
    }
  }
}
function headIcon(u) {
  if (u.heartbrokenT > 0) return 'brokenheart';
  if (u.unhappyT > 0) return 'unhappy';
  if (u.forced === 'hunger') return 'hungry';
  if (u.forced === 'energy') return 'tired';
  if (u.crushBubbleT > 0) return 'heart';
  if (u.task) return u.task.kind;
  if (!u.arriving && u.hunger >= HUNGER_AUTO) return 'hungry';
  return null;
}
function villagerScreenPos(u) {
  // 爬樓梯時 x 沿著斜梯移動，y 在兩層之間
  let x = u.fx + (u.spread || 0), y = -u.fl * FH;
  if (u.fl !== u.floor) {
    const a = Math.min(u.floor, Math.sign(u.fl - u.floor) + u.floor), ln = linkFor(u.floor, u.floor + Math.sign(u.fl - u.floor));
    const k = u.fl - a; // 0..1 由下往上
    if (ln.kind === 'stairs') x = ln.x + (8 - k * 16) / T;
  } else if (u.task && u.task.kind === 'sleep' && u.task.phase === 'work1') return { x: sx(x), y: sy(y) - 6, lying: true };
  return { x: sx(x), y: sy(y) };
}
function spreadVillagers() {
  // 站在同一點的人左右排開，不疊成一個
  const grp = villagers.filter(u => u.fl === u.floor).sort((a, b) => a.fx - b.fx || a.i - b.i);
  for (const u of villagers) u.spread = 0;
  for (let i = 0; i < grp.length; i++) {
    const cl = [grp[i]];
    while (i + 1 < grp.length && grp[i + 1].floor === grp[i].floor && grp[i + 1].fx - cl[0].fx < 1.2) cl.push(grp[++i]);
    if (cl.length > 1) cl.forEach((u, k) => { u.spread = (k - (cl.length - 1) / 2) * 1.3; });
  }
}
function drawVillager(u) {
  const pos = villagerScreenPos(u);
  const px = Math.round(pos.x), py = Math.round(pos.y);
  const climbing = u.fl !== u.floor;
  const walking = !!(u.task && (u.task.phase === 'goto1' || u.task.phase === 'goto2')) || climbing || u.arriving;
  const step = walking ? ((u.walkT * 8 | 0) % 2) : 0;
  if (u.child) {
    const bx = px - 3, by = py - 9;
    g.fillStyle = PAL.black; g.fillRect(bx - 1, by - 1, 8, 11);
    g.fillStyle = PAL.gold; g.fillRect(bx + 1, by, 4, 4); g.fillStyle = u.p.col; g.fillRect(bx, by + 4, 6, 3); g.fillStyle = PAL.dgray; g.fillRect(bx + 1 + step, by + 7, 1, 2); g.fillRect(bx + 4 - step, by + 7, 1, 2);
    return;
  }
  if (pos.lying) {
    g.fillStyle = PAL.gold; g.fillRect(px - 7, py - 1, 4, 4); g.fillStyle = u.p.col; g.globalAlpha = 0.8; g.fillRect(px - 3, py, 9, 3); g.globalAlpha = 1;
    icon('sleep', px - 2, py - 10 - ((t * 2 | 0) % 2)); return;
  }
  const bx = px - 4, by = py - VH;
  if (climbing && linkFor(u.floor, u.floor + Math.sign(u.fl - u.floor)).kind === 'ladder') {
    // 爬梯子：背對畫面、手腳交替，畫在梯子前面
    const a = (u.walkT * 6 | 0) % 2;
    g.fillStyle = PAL.black; g.fillRect(bx - 2, by - 3, 12, VH + 3);
    g.fillStyle = '#f2c79a'; g.fillRect(bx - 1, by - 2 + a * 2, 2, 3); g.fillRect(bx + 7, by - 2 + (1 - a) * 2, 2, 3); // 兩手抓橫桿
    g.fillStyle = u.p.col; g.fillRect(bx, by + 5, 8, 6); g.fillRect(bx - 1, by + 1 + a * 2, 2, 4); g.fillRect(bx + 7, by + 1 + (1 - a) * 2, 2, 4);
    g.fillStyle = '#4a2f22'; g.fillRect(bx + 1, by, 6, 5);                     // 後腦勺全是頭髮
    g.fillStyle = PAL.dgray; g.fillRect(bx + 1, by + 11 + a, 2, 3 - a); g.fillRect(bx + 5, by + 11 + (1 - a), 2, 3 - (1 - a));
    return;
  }
  // 深色描邊：前景人物跟背景牆分得開
  g.fillStyle = PAL.black; g.fillRect(bx - 1, by - 1, 10, VH + 1);
  g.fillStyle = PAL.dgray; g.fillRect(bx + 1 + step, by + 11, 2, 3); g.fillRect(bx + 5 - step, by + 11, 2, 3);  // 腳
  g.fillStyle = u.p.col; g.fillRect(bx, by + 5, 8, 6);                                              // 衣服
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bx, by + 9, 8, 2);
  g.fillStyle = '#f2c79a'; g.fillRect(bx + 1, by, 6, 5);                                            // 頭
  g.fillStyle = '#4a2f22'; g.fillRect(bx + 1, by, 6, 1);                                            // 頭髮
  g.fillStyle = PAL.black; g.fillRect(u.face > 0 ? bx + 5 : bx + 2, by + 2, 1, 1);                   // 眼
  if (u.spouse != null) { g.fillStyle = PAL.red; g.fillRect(bx + 3, by - 3, 2, 2); }
  if (u.task && u.task.carry) icon(u.task.carry === 'wood' ? 'carrywood' : 'carryfood', u.face > 0 ? bx + 7 : bx - 4, by + 5);
  // 名牌
  const hi = headIcon(u);
  if (u.heartbrokenT > 0) icon('brokenheart', bx + 9, by - 6);
  else if (u.task && u.task.assigned) {
    icon('bang', bx + 7, by - 12);
    const ph = u.task.phase, two = ph === 'goto2' || ph === 'work2';
    const tx = sx(two ? u.task.p2x : u.task.p1x), ty = sy(floorY(two ? u.task.p2f : u.task.p1f)) - 5;
    g.strokeStyle = PAL.gold; g.globalAlpha = 0.75; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(px, py - 5); g.lineTo(tx, ty); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    g.fillStyle = PAL.gold; g.fillRect(tx - 1, ty - 1, 3, 3);
  } else if (hi) { g.fillStyle = 'rgba(244,244,244,0.85)'; g.fillRect(bx + 8, by - 11, 9, 9); icon(hi, bx + 9, by - 9); }
}
function drawRain() {
  if (!rain.active) return;
  const houseL = sx(HOUSE.x0) - 10, houseR = sx(HOUSE.x1) + 10, roofTop = sy(-2 * FH - 22), gy = sy(0);
  g.fillStyle = PAL.cyan; g.globalAlpha = 0.7;
  for (const p of parts) if (p.rain) {
    const x = (p.x * (W + 40) - 20 - (1.2 - p.life) * 12) | 0, y = ((1.2 - p.life) / 1.2 * (gy + 10)) | 0;
    if (y > gy) continue; if (x > houseL && x < houseR && y > roofTop) continue;
    g.fillRect(x, y, 1, 4);
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(26,28,44,0.18)'; g.fillRect(0, 0, W, H);
}
function drawHud() {
  for (const p of pops) { g.globalAlpha = Math.max(0, p.life); txt(p.txt, sx(p.x) - txtW(p.txt) / 2, sy(p.y) | 0, p.col); g.globalAlpha = 1; }
  for (const pt of parts) if (!pt.rain) { g.fillStyle = pt.col; g.fillRect(sx(pt.x) | 0, sy(pt.y) | 0, 1, 1); }
  const mb = muteRect(); g.fillStyle = 'rgba(26,28,44,0.7)'; g.fillRect(mb.x, mb.y, mb.w, mb.h); icon('mute', mb.x + 3, mb.y + 3);
}
function drawSelectHighlight() {
  if (!selected) return;
  const pos = villagerScreenPos(selected);
  g.strokeStyle = PAL.white; g.globalAlpha = 0.6 + Math.sin(t * 8) * 0.3; g.beginPath(); g.arc(pos.x, pos.y - 7, 10, 0, 7); g.stroke(); g.globalAlpha = 1;
  const blink = (wx, f, w, h) => { const x = sx(wx), y = sy(floorY(f)); g.strokeStyle = PAL.cyan; g.globalAlpha = 0.45 + Math.sin(t * 6) * 0.3; g.strokeRect(x - w / 2 - 0.5, y - h - 0.5, w, h); g.globalAlpha = 1; };
  for (const tr of trees) if (tr.wood > 0) blink(tr.x, 0, 22, 44);
  if (field.stage === 3) blink(field.x, 0, 26, 22);
  if (roofLeak) blink(SPOT.roofSpot, 1, 14, FH - 2);
  targetLabels = [];
  { const tr = trees.find(q => q.wood > 0); if (tr) targetLabels.push([tr.x + 1, 0, 46, '點樹：砍柴']); }
  if (field.stage === 3) targetLabels.push([field.x, 0, 24, '點這裡：收成']);
  if (roofLeak) targetLabels.push([SPOT.roofSpot, 1, FH, '點這裡：修屋頂']);
  for (const pl of plots) if (!pl.built && woodPile.count >= BUILD_COST) targetLabels.push([pl.x, 0, 28, '點這裡：蓋房子']);
  for (const pl of plots) if (!pl.built && woodPile.count >= BUILD_COST) blink(pl.x, 0, 24, 26);
}

function draw() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  const worldW = WW * T;
  if (!selected && camFollow && !drag && H > W) {
    // 直式：沒選人時鏡頭慢慢移到大家的中心，一次看得到最多人
    const vs = villagers.filter(u => !u.arriving); if (vs.length) {
      // 找「框進最多人」的水平位置（每 2 秒重選一次，避免晃）
      if (!draw.pick || t - draw.pickT > 2 || t < draw.pickT) {
        let best = null, bn = -1;
        for (const c of vs) { const n = vs.filter(u => Math.abs(u.fx - c.fx) * T < W / 2 - 10).length; if (n > bn) { bn = n; best = c; } }
        const inWin = vs.filter(u => Math.abs(u.fx - best.fx) * T < W / 2 - 10);
        draw.pick = { x: inWin.reduce((q, u) => q + u.fx, 0) / inWin.length, y: inWin.reduce((q, u) => q + u.fl, 0) / inWin.length }; draw.pickT = t;
      }
      const mx = draw.pick.x, my = draw.pick.y;
      camX += (mx * T - camX) * 0.03; camY += ((-my * FH - FH * 0.3) - camY) * 0.03; }
  }
  if (selected && camFollow && !drag) { const p = selected; camX += (p.fx * T - camX) * 0.05; camY += ((-p.fl * FH - FH * 0.4) - camY) * 0.05; }
  camX = worldW <= W ? worldW / 2 : Math.max(W / 2, Math.min(worldW - W / 2, camX));
  const wh = WORLD_BOT - WORLD_TOP;
  camY = wh <= H ? (WORLD_TOP + WORLD_BOT) / 2 : Math.max(WORLD_TOP + H / 2, Math.min(WORLD_BOT - H / 2, camY));
  offX = Math.round(W / 2 - camX); offY = Math.round(H / 2 - camY);
  g.fillStyle = PAL.black; g.fillRect(0, 0, W, H);
  drawSky();
  drawEarth();
  for (const tr of trees) drawTree(tr);
  drawHouse();
  drawField();
  drawPlots();
  drawBench();
  drawKitchen();
  drawBeds();
  drawPile(woodPile, 'wood');
  drawPile(foodPile, 'food');
  drawLinks();
  drawSelectHighlight();
  spreadVillagers();
  const order = villagers.slice().sort((a, b) => a.fx - b.fx);
  for (const u of order) drawVillager(u);
  drawRain();
  drawHud();
  if (flash > 0) { g.globalAlpha = flash; g.fillStyle = PAL.white; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  drawUI();
}

// ---- 主迴圈 ----
let last = performance.now();
let testPaused = false;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!testPaused) update(dt);
  draw();
  requestAnimationFrame(frame);
}
// ---- v4.2 文字介面層：高解析度 canvas 疊在像素畫面上（中文字不能用像素字型畫）----
const uiCv = document.getElementById('ui'), ug = uiCv.getContext('2d');
let UW = 0, UH = 0, DPR = 1;
function resizeUI() {
  DPR = window.devicePixelRatio || 1; UW = innerWidth; UH = innerHeight;
  uiCv.width = UW * DPR; uiCv.height = UH * DPR; uiCv.style.width = UW + 'px'; uiCv.style.height = UH + 'px';
  uiCv.style.left = '0px'; uiCv.style.top = '0px';
}
const FONT_UI = '"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
const CAPTION = {
  hungry: '肚子餓', tired: '累壞了', eat: '去吃飯', sleep: '去睡覺', chat: '在聊天', wander: '閒晃',
  heart: '想起偷偷喜歡的人', brokenheart: '撞見了，心碎', unhappy: '被漏水滴醒，不開心',
  chop: '去砍柴', harvest: '去收成', repair: '拿木頭修屋頂', build: '蓋房子', together: '去長椅找人',
  bang: '驚嘆號＝你指派的工作', leak: '屋頂漏水了',
};
const seenCaption = new Set();
let captions = [];
function nameOf(i) { const v = villagers.find(x => x.i === i); return v ? v.p.name : '?'; }
function describe(u) {
  if (u.child) return '還是小孩，跟著爸媽';
  if (u.arriving) return '剛搬來，正走進村子';
  const k = u.task;
  if (!k) return u.heartbrokenT > 0 ? '難過地站著' : '發呆一下，想下一件事';
  const ph = k.phase, first = ph === 'goto1' || ph === 'hesitate', w1 = ph === 'work1', g2 = ph === 'goto2';
  let s;
  switch (k.kind) {
    case 'chop': s = first ? '去院子砍樹' : w1 ? '砍樹中' : g2 ? '扛柴去地窖' : '把柴放進地窖'; break;
    case 'harvest': s = first ? '去田裡收成' : w1 ? '收割中' : g2 ? '抱糧食去地窖' : '把糧食放進地窖'; break;
    case 'repair': s = first ? '下地窖拿木頭（要修屋頂）' : w1 ? '拿木頭' : g2 ? '扛木頭上二樓修屋頂' : '修屋頂中'; break;
    case 'build': s = first ? '下地窖拿木頭（要蓋房子）' : w1 ? '拿木頭' : g2 ? '扛木頭去空地' : '蓋房子中'; break;
    case 'eat': s = first ? '下地窖拿吃的' : w1 ? '拿吃的' : g2 ? '端著吃的去灶邊' : '在灶邊吃飯'; break;
    case 'sleep': s = first ? '上二樓睡覺' : '睡覺中'; break;
    case 'chat': s = first ? '走去找人聊天' : '聊天中'; break;
    case 'wander': s = first ? '隨便走走' : '休息一下'; break;
    case 'together': s = first ? '去長椅找 ' + (k.obj ? k.obj.p.name : '') : '在長椅陪 ' + (k.obj ? k.obj.p.name : ''); break;
    default: s = k.kind;
  }
  if (ph === 'hesitate') s = '想了一下，準備' + s;
  if (u.forced === 'hunger') s = '餓壞了，先' + s;
  if (u.forced === 'energy') s = '累壞了，先' + s;
  if (k.assigned) s = '（你指派）' + s;
  return s;
}
function moodOf(u) {
  if (u.heartbrokenT > 0) return ['心碎', '撞見喜歡的人跟別人在一起'];
  if (u.unhappyT > 0) return ['不開心', '睡覺被漏水滴醒'];
  if (u.hunger >= 90) return ['煩躁', '太餓了'];
  if (u.energy <= 15) return ['疲倦', '想睡覺'];
  if (u.spouse != null) return ['幸福', '結婚了'];
  if (u.crushBubbleT > 0) return ['害羞', '正在想喜歡的人'];
  return ['普通', ''];
}
function uText(str, x, y, size, col, align, bold) {
  ug.font = (bold ? '600 ' : '') + size + 'px ' + FONT_UI; ug.textAlign = align || 'left'; ug.textBaseline = 'middle';
  ug.lineWidth = Math.max(2, size / 5); ug.strokeStyle = 'rgba(10,10,20,0.9)'; ug.strokeText(str, x, y);
  ug.fillStyle = col || '#fff'; ug.fillText(str, x, y);
  return ug.measureText(str).width;
}
function uBox(x, y, w, h, a) { ug.fillStyle = `rgba(20,22,36,${a == null ? 0.78 : a})`; ug.beginPath(); ug.roundRect ? ug.roundRect(x, y, w, h, 6) : ug.rect(x, y, w, h); ug.fill(); }
function chip(x, y, label, value, col) {
  ug.font = '14px ' + FONT_UI; const w = ug.measureText(label + ' ' + value).width + 26;
  uBox(x, y, w, 24); ug.fillStyle = col; ug.fillRect(x + 7, y + 8, 8, 8);
  uText(label + ' ' + value, x + 19, y + 12.5, 14, '#fff');
  return w;
}
function captionText(c) {
  const u = c.u;
  if (!u) return '屋頂漏水了（點選人後點這裡修）';
  if (!villagers.includes(u)) return '';
  if (c.key === 'heart') return '♥ 偷偷喜歡 ' + nameOf(u.crush);
  if (c.key === 'together') return u.task && u.task.kind === 'together' && u.task.obj && u.task.obj.p ? (u.task.phase === 'work1' ? '♥ 在長椅陪 ' : '♥ 去長椅找 ') + u.task.obj.p.name : '約會';
  if (c.key === 'brokenheart') return '看到 ' + nameOf(u.crush) + ' 跟別人在一起，心碎';
  if (c.key === 'unhappy') return '被漏水滴醒，不開心';
  if (c.key === 'hungry') return '肚子餓';
  if (c.key === 'tired') return '累壞了';
  return describe(u); // 工作類：跟小卡同一個來源
}
function captionAlive(c) {
  if (!c.u) return roofLeak;
  if (!villagers.includes(c.u)) return false;
  if (c.key === 'bang') return !!(c.u.task && c.u.task.assigned);
  return headIcon(c.u) === c.key;
}
function updateCaptions() {
  captions = captions.filter(c => t - c.t0 < 4.5 && captionAlive(c));
  const tryAdd = (key, u) => {
    const always = key === 'heart' || key === 'brokenheart' || key === 'together';
    if ((!always && seenCaption.has(key)) || captions.length >= 2 || captions.some(c => c.u === u && u)) return;
    seenCaption.add(key); captions.push({ key, u, t0: t });
  };
  if (roofLeak) tryAdd('leak', null);
  for (const u of villagers) {
    if (u.child || u.arriving) continue;
    const hi = headIcon(u);
    if (u.task && u.task.assigned) tryAdd('bang', u);
    else if (hi && CAPTION[hi]) tryAdd(hi, u);
    if (hi === 'heart' || hi === 'brokenheart' || hi === 'together') { if (captions.length >= 2) { const i = captions.findIndex(c => c.u && c.key !== 'heart' && c.key !== 'brokenheart' && c.key !== 'together'); if (i >= 0) captions.splice(i, 1); } tryAdd(hi, u); }
  }
}
function cardRect(portrait) {
  if (!(inspected && villagers.includes(inspected))) return null;
  const cw = portrait ? UW - 16 : 230, cardH = portrait ? 150 : 0, ch = portrait ? cardH - 8 : 176;
  const right = !portrait && cardOnRight();
  return { x: right ? UW - cw - 8 : 8, y: portrait ? UH - cardH : (right ? (muteRect().y + muteRect().h) * S + 6 : 44), w: cw, h: ch };
}
function cardOnRight() { return inspected && villagerScreenPos(inspected).x * S < UW / 2; }
function drawUI() {
  ug.setTransform(DPR, 0, 0, DPR, 0, 0); ug.clearRect(0, 0, UW, UH);
  const portrait = UH > UW;
  const toCss = (lx, ly) => [lx * S, ly * S];
  // 名字（常駐小字）：靠近時上下錯開
  const tags = [];
  for (const u of villagers) {
    const pos = villagerScreenPos(u);
    const [cx, cy] = toCss(pos.x, pos.y - (pos.lying ? 8 : VH + 3));
    if (cx < -30 || cx > UW + 30 || cy < -10 || cy > UH + 10) continue;
    tags.push({ u, cx, cy, hx: cx, hy: cy });
  }
  tags.sort((p, q) => p.cx - q.cx);
  for (let i = 0; i < tags.length; i++) {
    for (let j = 0; j < i; j++) {
      const p = tags[j], q = tags[i];
      if (Math.abs(p.cx - q.cx) < 34 && Math.abs(p.cy - q.cy) < 15) q.cy = p.cy - 16;
    }
  }
  for (const tg of tags) {
    if (tg.cy !== tg.hy) { ug.strokeStyle = 'rgba(255,255,255,0.6)'; ug.lineWidth = 1; ug.beginPath(); ug.moveTo(tg.cx, tg.cy + 7); ug.lineTo(tg.hx, tg.hy + 6); ug.stroke(); }
    uText(tg.u.p.name, tg.cx, tg.cy, 13, tg.u === inspected ? '#ffcd75' : '#fff', 'center', true);
  }
  // 圖示第一次出現：說明字跟著人頭走，用短線連到頭；狀態結束就消失
  updateCaptions();
  const placed = [];
  const cardR = cardRect(portrait);
  if (cardR) placed.push(cardR);
  for (const c of captions) {
    let hx, hy;
    if (c.u) { const pos = villagerScreenPos(c.u); [hx, hy] = toCss(pos.x, pos.y - VH - 8); if (hx < 0 || hx > UW || hy < 0 || hy > UH) continue; }
    else { [hx, hy] = toCss(sx(SPOT.roofSpot), sy(floorY(1)) - FH + 4); }
    const text = (c.u ? c.u.p.name + '：' : '') + captionText(c);
    ug.font = '600 14px ' + FONT_UI; const w = ug.measureText(text).width + 14;
    let bx = hx + 22, by = hy - 30;
    if (bx + w > UW - 4) bx = hx - 22 - w;
    bx = Math.max(4, bx); by = Math.max(40, Math.min(UH - 30, by));
    for (let tries = 0; tries < 6; tries++) { const hit = placed.find(r => bx < r.x + r.w && bx + w > r.x && by - 12 < r.y + r.h && by + 12 > r.y); if (!hit) break; by = hit.y - 16 < 40 ? hit.y + hit.h + 16 : hit.y - 16; }
    if (placed.some(r => bx < r.x + r.w && bx + w > r.x && by - 12 < r.y + r.h && by + 12 > r.y)) continue;
    placed.push({ x: bx, y: by - 12, w, h: 24 });
    const a = Math.min(1, (4.5 - (t - c.t0)) * 2);
    ug.globalAlpha = a;
    ug.strokeStyle = 'rgba(255,245,210,0.95)'; ug.lineWidth = 2; ug.beginPath(); ug.moveTo(hx, hy); ug.lineTo(bx < hx ? bx + w : bx, by); ug.stroke();
    ug.fillStyle = 'rgba(255,245,210,0.95)'; ug.beginPath(); ug.roundRect ? ug.roundRect(bx, by - 12, w, 24, 6) : ug.rect(bx, by - 12, w, 24); ug.fill();
    ug.fillStyle = '#1a1c2c'; ug.textAlign = 'left'; ug.textBaseline = 'middle'; ug.fillText(text, bx + 7, by + 0.5);
    ug.globalAlpha = 1;
  }
  if (selected) for (const [wx, f, h, tx] of targetLabels) { const [cx, cy] = toCss(sx(wx), sy(floorY(f)) - h - 3); uText(tx, cx, cy, 13, '#73eff7', 'center', true); }
  // 左上資源
  let x = 8; const y = 8;
  x += chip(x, y, '人口', villagers.length, '#ffcd75') + 6;
  x += chip(x, y, '糧食', foodPile.count + '/' + foodPile.max, '#a7f070') + 6;
  x += chip(x, y, '柴', woodPile.count + '/' + woodPile.max, '#ef7d57') + 6;
  if (rain.active) { if (portrait) chip(8, 38, '天氣', '下雨中', '#73eff7'); else chip(x, y, '天氣', '下雨中', '#73eff7'); }
  // 樓層小地圖（標層名）
  const floors = [[1, '二樓'], [0, '地面'], [-1, '地窖']];
  const inView = (f) => { const top = sy(floorY(f) - FH), bot = sy(floorY(f)); return bot > 0 && top < H; };
  if (portrait) {
    let fx = 8; const fy = rain.active ? 68 : 38;
    for (const [f, nm] of floors) {
      const n = villagers.filter(u => u.floor === f).length;
      ug.font = '13px ' + FONT_UI; const w = ug.measureText(nm + ' ' + n + '人').width + 12;
      uBox(fx, fy, w, 22, inView(f) ? 0.85 : 0.45); uText(nm + ' ' + n + '人', fx + 6, fy + 11.5, 13, inView(f) ? '#ffcd75' : '#b0b8c8');
      fx += w + 4;
    }
  } else if (!(inspected && villagers.includes(inspected) && cardOnRight())) {
    const fx = UW - 92; let fy = (muteRect().y + muteRect().h) * S + 8;
    for (const [f, nm] of floors) {
      const n = villagers.filter(u => u.floor === f).length;
      uBox(fx, fy, 84, 24, inView(f) ? 0.85 : 0.45);
      uText(nm + ' ' + n + '人', fx + 8, fy + 12.5, 14, inView(f) ? '#ffcd75' : '#b0b8c8');
      fy += 28;
    }
  }
  // 提示
  let hint = null;
  if (selected) hint = '選了' + selected.p.name + '：再點一件事（樹、成熟的田、漏水處、空地）或另一個人';
  else if (!hintStage) hint = '點一個人，再點一件事，叫他去做';
  const cardH = portrait ? 150 : 0;
  if (hint) {
    ug.font = '600 15px ' + FONT_UI; const w = Math.min(UW - 16, ug.measureText(hint).width + 24);
    const hy = portrait && inspected ? UH - cardH - 44 : UH - 40;
    uBox((UW - w) / 2, hy, w, 30, 0.85); uText(hint, UW / 2, hy + 15.5, portrait && w >= UW - 16 ? 13 : 15, '#ffcd75', 'center', true);
  }
  // 人物小卡
  if (inspected && villagers.includes(inspected)) {
    const u = inspected;
    const cw = portrait ? UW - 16 : 230, ch = portrait ? cardH - 8 : 176;
    const right = !portrait && cardOnRight();
    const cx = right ? UW - cw - 8 : 8, cy = portrait ? UH - cardH : (right ? (muteRect().y + muteRect().h) * S + 6 : 44);
    uBox(cx, cy, cw, ch, 0.9);
    uText(u.p.name, cx + 12, cy + 18, 17, '#fff', 'left', true);
    const [mood, why] = moodOf(u);
    uText('心情：' + mood + (why ? '（' + why + '）' : ''), cx + 12 + 46, cy + 18, 13, '#cfd6e0');
    uText('正在：' + describe(u), cx + 10, cy + 44, 14, '#ffcd75');
    const bar = (label, v, by) => { const col = v > 60 ? '#38b764' : v > 30 ? '#ffcd75' : '#b13e53';
      uText(label, cx + 10, by, 13, '#fff');
      const bx = cx + 48, bw = cw - 100;
      ug.fillStyle = '#333c57'; ug.fillRect(bx, by - 5, bw, 10); ug.fillStyle = col; ug.fillRect(bx, by - 5, bw * Math.max(0, Math.min(1, v / 100)), 10);
      uText(Math.round(v) + '', cx + cw - 12, by, 13, '#fff', 'right');
    };
    if (portrait) {
      bar('飽足', 100 - u.hunger, cy + 68); bar('精力', u.energy, cy + 90);
    } else {
      bar('飽足', 100 - u.hunger, cy + 72); bar('精力', u.energy, cy + 96);
    }
    let love = '沒有特別喜歡的人';
    if (u.child) love = '還小，不懂感情';
    else if (u.spouse != null) love = '和 ' + nameOf(u.spouse) + ' 結婚了';
    else if (u.crush != null) love = '偷偷喜歡 ' + nameOf(u.crush);
    uText('感情：' + love, cx + 10, cy + (portrait ? 114 : 122), 14, '#f4a6b8');
    uText('（點空白處關閉）', cx + 10, cy + (portrait ? 134 : 150), 12, '#8a93a6');
  }
}

reset(); addEventListener('resize', resize); resize();

// ---- 測試用介面（狀態唯讀；lookAt 只移動鏡頭，等同玩家拖曳）----
window.__side = {
  state: () => ({ t, woodPile: { ...woodPile }, foodPile: { ...foodPile }, field: { ...field }, roofLeak, rain: { ...rain },
    plots: plots.map(p => ({ ...p })), trees: trees.map(tr => ({ ...tr })), selected: selected ? selected.i : null,
    affinity: Array.from(affinity.entries()), S, W, H, inspected: inspected ? inspected.i : null, captions: captions.map(c => captionText(c)), hintStage,
    villagers: villagers.map(u => ({ i: u.i, name: u.p.name, tag: u.p.tag, x: u.x, floor: u.floor, fl: u.fl, arriving: u.arriving, unhappyT: u.unhappyT,
      child: u.child, spouse: u.spouse, crush: u.crush, heartbrokenT: u.heartbrokenT, crushBubbleT: u.crushBubbleT,
      task: u.task && { kind: u.task.kind, phase: u.task.phase, assigned: u.task.assigned, carry: u.task.carry, p1x: u.task.p1x, p1f: u.task.p1f, p2x: u.task.p2x, p2f: u.task.p2f, partnerI: u.task.obj && u.task.obj.i },
      forced: u.forced, hunger: u.hunger, energy: u.energy })) }),
  screenOf: (wx, f, dy) => { draw(); const r = cv.getBoundingClientRect(); return [sx(wx) * S + r.left, (sy(floorY(f || 0)) - (dy == null ? 6 : dy)) * S + r.top]; },
  villagerScreen: (i) => { draw(); const u = villagers.find(v => v.i === i); const p = villagerScreenPos(u); const r = cv.getBoundingClientRect(); return [p.x * S + r.left, (p.y - 6) * S + r.top]; },
  lookAt: (wx, f) => { camX = wx * T; camY = -(f || 0) * FH - FH * 0.4; camFollow = false; draw(); },
  pause: () => { testPaused = true; },
  resume: () => { testPaused = false; },
  step: (dt2) => update(dt2),
  reset,
};
requestAnimationFrame(frame);
