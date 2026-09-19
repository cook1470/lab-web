'use strict';
// 純邏輯房間生成＋物理＋兩隻機器人＋50 種子量測。無 DOM、無畫圖、node 直接跑。
// node sim.js

// ---------- 常數（照抄 game.js） ----------
const FX0 = 70, FX1 = 352, FY0 = 12, FY1 = 190;
const CW = 20, CH = 10;
const COLS = Math.floor((FX1 - FX0) / CW);
const LX = (FX0 + FX1) / 2, LY = 180;
const AIM_MIN = -Math.PI + 0.12, AIM_MAX = -0.12;
const SPEED = 190;

// 固定強化組（見 CRITERIA.md 補記：拿掉 boom/chain，避免繞過盾的方向判定）
const LV = { multi: 2, split: 1, pierce: 1, boom: 0, big: 1, magnet: 0, chain: 0 };
const ROOM_NUM = 4; // 用第 4 房的生成參數

// ---------- 種子 RNG（mulberry32） ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rnd(rng, a, b) { return a + rng() * (b - a); }
function ri(rng, a, b) { return Math.floor(rnd(rng, a, b + 1)); }

// ---------- 房間生成（照抄 game.js buildRoom，rng 換成種子版） ----------
function buildRoom(r, rng, experiment) {
  const rows = 3 + Math.min(4, Math.ceil(r / 2));
  const baseHp = 1 + Math.floor(r * 0.6);
  const occ = {};
  const ents = [];
  const nMon = 1 + Math.floor(r / 2);
  for (let i = 0; i < nMon; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const c = ri(rng, 0, COLS - 2), rw = ri(rng, 0, rows - 2);
      const k = [c + ',' + rw, (c + 1) + ',' + rw, c + ',' + (rw + 1), (c + 1) + ',' + (rw + 1)];
      if (k.some(q => occ[q])) continue;
      k.forEach(q => occ[q] = 1);
      const hp = baseHp * 4 + r * 2;
      ents.push({ x: FX0 + c * CW + 1, y: FY0 + 4 + rw * CH + 1, w: CW * 2 - 2, h: CH * 2 - 2, hp, max: hp, mon: true, kind: ri(rng, 0, 2) });
      break;
    }
  }
  const half = Math.ceil(COLS / 2);
  for (let rw = 0; rw < rows; rw++) for (let c = 0; c < half; c++) {
    if (rng() < 0.3) continue;
    const typ = rng() < 0.08 + r * 0.01 ? 'tnt' : (rng() < 0.12 ? 'gold' : 'brick');
    const hp = typ === 'gold' ? 1 : baseHp + ri(rng, 0, r);
    for (const cc of [c, COLS - 1 - c]) {
      if (occ[cc + ',' + rw]) continue; occ[cc + ',' + rw] = 1;
      ents.push({ x: FX0 + cc * CW + 1, y: FY0 + 4 + rw * CH + 1, w: CW - 2, h: CH - 2, hp, max: hp, typ });
    }
  }
  if (experiment) {
    // 背盾怪：完整掃過每個 2x2 位置找空位（優先最上兩排），保證每個種子都放得下——
    // 隨機試 40 次那版量過只有 13/50 種子放得進去，等於實驗組七成跟對照組是同一個房間，不能用。
    const candidates = [];
    for (let rw = 0; rw <= rows - 2; rw++) for (let c = 0; c <= COLS - 2; c++) {
      const k = [c + ',' + rw, (c + 1) + ',' + rw, c + ',' + (rw + 1), (c + 1) + ',' + (rw + 1)];
      if (!k.some(q => occ[q])) candidates.push({ c, rw });
    }
    let pool = candidates.filter(p => p.rw <= 1);
    if (!pool.length) pool = candidates;
    let choice;
    if (pool.length) {
      choice = pool[ri(rng, 0, pool.length - 1)];
    } else {
      // 極端情況：整個房間真的一格空的都沒有，強制清掉最上排一塊 2x2 讓位（保證放得下）
      choice = { c: 0, rw: 0 };
      const tx0 = FX0 + 0 * CW, tx1 = FX0 + 2 * CW, ty0 = FY0 + 4 + 0 * CH, ty1 = FY0 + 4 + 2 * CH;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        if (e.x < tx1 && e.x + e.w > tx0 && e.y < ty1 && e.y + e.h > ty0) ents.splice(i, 1);
      }
    }
    const hp = baseHp * 4 + r * 2;
    ents.push({ x: FX0 + choice.c * CW + 1, y: FY0 + 4 + choice.rw * CH + 1, w: CW * 2 - 2, h: CH * 2 - 2, hp, max: hp, mon: true, kind: 0, shield: true });
  }
  return ents;
}

function cloneEnts(ents) { return ents.map(e => ({ ...e })); }

// ---------- 傷害／擊殺（照抄 damage/kill 的核心規則，去掉視覺/音效/掉錢） ----------
function damage(e, dmg) {
  if (e.dead) return false;
  e.hp -= dmg;
  if (e.hp <= 0) { e.dead = true; return true; }
  return false;
}
function killEffects(bx, by, srcBall, rng, balls) {
  // 分裂：在擊殺點生一顆新球，方向隨機偏原球方向
  if (LV.split && srcBall && rng() < 0.25 + LV.split * 0.15) {
    const base = Math.atan2(srcBall.vy, srcBall.vx);
    const n = LV.split >= 4 ? 2 : 1;
    for (let i = 0; i < n; i++) spawnBallRaw(balls, bx, by, base + rnd(rng, -1.2, 1.2), true);
  }
}

// ---------- 球 ----------
function ballR() { return 2 + LV.big; }
function spawnBallRaw(balls, x, y, a, child) {
  if (balls.length > 90) return;
  balls.push({ x, y, vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED, r: ballR(), pierce: LV.pierce, child, hitCd: new Map(), life: 0, gone: false });
}

// 單球一步位移＋碰撞（照抄 moveBall，去掉音效/粒子；多回傳一個 shieldBlocked 計數方便除錯）
function moveBall(b, dt, ents, balls, rng, stat) {
  b.x += b.vx * dt; b.y += b.vy * dt;
  const r = b.r;
  if (b.x < FX0 + r) { b.x = FX0 + r; b.vx = Math.abs(b.vx); }
  if (b.x > FX1 - r) { b.x = FX1 - r; b.vx = -Math.abs(b.vx); }
  if (b.y < FY0 + r) { b.y = FY0 + r; b.vy = Math.abs(b.vy); }
  if (b.y > FY1 + r) { b.gone = true; return; }
  for (const e of ents) {
    if (e.dead || b.hitCd.has(e)) continue;
    const nx = Math.max(e.x, Math.min(b.x, e.x + e.w)), ny = Math.max(e.y, Math.min(b.y, e.y + e.h));
    const dx = b.x - nx, dy = b.y - ny, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    const d = Math.sqrt(d2);
    let nX, nY;
    if (d > 0.001) { nX = dx / d; nY = dy / d; }
    else { const cx = e.x + e.w / 2, cy = e.y + e.h / 2; if (Math.abs(b.x - cx) / e.w > Math.abs(b.y - cy) / e.h) { nX = Math.sign(b.x - cx) || 1; nY = 0; } else { nX = 0; nY = Math.sign(b.y - cy) || 1; } }
    const blocked = e.shield && nY > -0.5; // 盾怪：盾包住前面＋兩側，只有從正上方（背面）打中才算數
    const dmg = blocked ? 0 : 1 + LV.big;
    let killed = false;
    if (dmg > 0) killed = damage(e, dmg);
    if (stat) { if (blocked) stat.blockedHits++; else stat.directHits++; }
    b.hitCd.set(e, 0.05);
    if (killed) killEffects(nx, ny, b, rng, balls);
    if (killed && b.pierce > 0) { b.pierce--; continue; }
    const dot = b.vx * nX + b.vy * nY;
    if (dot < 0) { b.vx -= 2 * dot * nX; b.vy -= 2 * dot * nY; }
    b.x = nx + nX * (r + 0.1); b.y = ny + nY * (r + 0.1);
    if (!killed) b.pierce = LV.pierce;
    break;
  }
}

// ---------- 一發（一回合）完整前模到收尾 ----------
// aimAngle：本回合瞄準角度。jitter：多球散開用的抖動幅度（評估模式用 0，實際出手用 0.02）。
// 回傳 { entsAfter, stat }；不動原本傳進來的 ents，回傳的是新陣列（clone 過再打）。
function simulateTurn(entsIn, aimAngle, rng, jitter, maxTime) {
  const ents = cloneEnts(entsIn);
  const balls = [];
  const queueTotal = 3 + LV.multi * 2;
  for (let i = 0; i < queueTotal; i++) {
    spawnBallRaw(balls, LX, LY - 3, aimAngle + rnd(rng, -jitter, jitter), false);
  }
  const stat = { directHits: 0, blockedHits: 0 };
  const dt = 1 / 60;
  let t = 0;
  while (t < maxTime) {
    t += dt;
    const grav = t > 10 ? (t - 10) * 60 : 0;
    for (const b of balls) {
      if (b.gone) continue;
      b.life += dt;
      b.vy += grav * dt;
      const sp = Math.hypot(b.vx, b.vy), want = SPEED + (grav || 0);
      if (sp > 0) { b.vx *= want / sp; b.vy *= want / sp; }
      if (Math.abs(b.vy) < 25) b.vy = (b.vy < 0 ? -25 : 25);
      const sub = Math.max(1, Math.ceil(want * dt / 2));
      for (let s = 0; s < sub; s++) moveBall(b, dt / sub, ents, balls, rng, stat);
      for (const [k, v] of b.hitCd) { if (v - dt <= 0) b.hitCd.delete(k); else b.hitCd.set(k, v - dt); }
    }
    for (let i = balls.length - 1; i >= 0; i--) if (balls[i].gone) balls.splice(i, 1);
    for (let i = ents.length - 1; i >= 0; i--) if (ents[i].dead) ents.splice(i, 1);
    if (ents.length === 0) break;
    if (balls.length === 0) break; // 沒球了，這回合結束（不管清了沒有）
  }
  return { ents, stat };
}

function totalHp(ents) { return ents.reduce((s, e) => s + Math.max(0, e.hp), 0); }

// ---------- 機器人 ----------
function botA(ents, rng) {
  // 每回合隨機角度
  return rnd(rng, AIM_MIN, AIM_MAX);
}
function botB(ents, rngReal) {
  // 每回合掃 60 個角度，各自用「乾淨、不影響正式 rng」的評估 rng 前模，挑清最多血量的角度
  const N = 60;
  let bestA = AIM_MIN, bestScore = -1;
  const before = totalHp(ents);
  for (let i = 0; i < N; i++) {
    const a = AIM_MIN + (AIM_MAX - AIM_MIN) * (i / (N - 1));
    const evalRng = mulberry32(0xB0710000 ^ i); // 固定種子，純評估用，不消耗正式 rng
    const { ents: after } = simulateTurn(ents, a, evalRng, 0, 12); // 評估模式：jitter=0
    const score = before - totalHp(after);
    if (score > bestScore) { bestScore = score; bestA = a; }
  }
  return bestA;
}

// ---------- 跑一個 (種子, 房型, 機器人) 組合，回傳清房回合數 ----------
function runOne(seed, experiment, bot, maxTurns) {
  const rngRoom = mulberry32(seed * 1000 + (experiment ? 7 : 3));
  let ents = buildRoom(ROOM_NUM, rngRoom, experiment);
  const rngPlay = mulberry32(seed * 1000 + (experiment ? 7 : 3) + 500000); // 出手用的正式 rng，跟房間生成的 rng 分開，避免互相污染
  let turns = 0;
  for (; turns < maxTurns; turns++) {
    if (ents.length === 0) break;
    const angle = bot(ents, rngPlay);
    const { ents: after } = simulateTurn(ents, angle, rngPlay, 0.02, 20);
    ents = after;
  }
  return Math.min(turns, maxTurns);
}

// ---------- 主程式：50 種子 x 2 房型 x 2 機器人 ----------
function main() {
  const SEEDS = 50, MAX_TURNS = 200;
  const results = {}; // results[roomType][botName] = [turns...]
  for (const roomType of ['control', 'experiment']) {
    results[roomType] = { A: [], B: [] };
    for (let s = 1; s <= SEEDS; s++) {
      results[roomType].A.push(runOne(s, roomType === 'experiment', botA, MAX_TURNS));
      results[roomType].B.push(runOne(s, roomType === 'experiment', botB, MAX_TURNS));
    }
  }
  function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  const out = {};
  for (const roomType of ['control', 'experiment']) {
    const avgA = avg(results[roomType].A), avgB = avg(results[roomType].B);
    out[roomType] = { avgA, avgB, ratio: avgA / avgB, capHitA: results[roomType].A.filter(x => x >= MAX_TURNS).length, capHitB: results[roomType].B.filter(x => x >= MAX_TURNS).length };
  }
  console.log(JSON.stringify(out, null, 2));
}

if (require.main === module) main();
module.exports = { buildRoom, mulberry32, runOne, botA, botB, simulateTurn, LV, ROOM_NUM };
