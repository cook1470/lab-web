'use strict';
// 彈球清房間 原型：拖曳瞄準、放開發射，球自己亂彈把房間炸光
const W = 422, H = 195;                 // 邏輯解析度（844x390 的一半）
const FX0 = 70, FX1 = 352, FY0 = 12, FY1 = 190; // 場地邊界
const CW = 20, CH = 10;                 // 格子大小
const COLS = Math.floor((FX1 - FX0) / CW);
const LX = (FX0 + FX1) / 2, LY = 180;   // 發射台
const DEAD = 166;                       // 東西掉到這條線就扣心
const ROOMS = 8;

// 色盤（Sweetie 16）
const P = ['#1a1c2c','#5d275d','#b13e53','#ef7d57','#ffcd75','#a7f070','#38b764','#257179','#29366f','#3b5dc9','#41a6f6','#73eff7','#f4f4f4','#94b0c2','#566c86','#333c57'];

const scr = document.getElementById('c');
const sctx = scr.getContext('2d');
const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
const g = buf.getContext('2d');
let scale = 2, offX = 0, offY = 0;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = innerWidth, vh = innerHeight;
  scale = Math.max(1, Math.floor(Math.min(vw * dpr / W, vh * dpr / H)));
  const cw = W * scale, ch = H * scale;
  scr.width = cw; scr.height = ch;
  scr.style.width = cw / dpr + 'px'; scr.style.height = ch / dpr + 'px';
  offX = (vw - cw / dpr) / 2; offY = (vh - ch / dpr) / 2;
  scr.style.left = offX + 'px'; scr.style.top = offY + 'px';
  sctx.imageSmoothingEnabled = false;
}
addEventListener('resize', resize); resize();

// ---------- 音效（WebAudio 程式合成） ----------
let ac = null;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); }
let sndBudget = 0;
function tone(f, d, type = 'square', vol = 0.06, slide = 0) {
  if (!ac || sndBudget > 14) return; sndBudget++;
  const t = ac.currentTime, o = ac.createOscillator(), v = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
  v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(v); v.connect(ac.destination); o.start(t); o.stop(t + d);
}
function noise(d, vol = 0.08, hp = 400) {
  if (!ac || sndBudget > 14) return; sndBudget++;
  const n = ac.createBuffer(1, ac.sampleRate * d | 0, ac.sampleRate), a = n.getChannelData(0);
  for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / a.length);
  const s = ac.createBufferSource(), v = ac.createGain(), fl = ac.createBiquadFilter();
  fl.type = 'highpass'; fl.frequency.value = hp;
  s.buffer = n; v.gain.value = vol; s.connect(fl); fl.connect(v); v.connect(ac.destination); s.start();
}
const sfx = {
  bounce: () => tone(220 + Math.random() * 40, 0.03, 'square', 0.02),
  hit: c => tone(330 * Math.pow(1.06, Math.min(c, 30)), 0.05, 'square', 0.04),
  brk: c => { tone(520 * Math.pow(1.06, Math.min(c, 30)), 0.08, 'triangle', 0.07, 0.5); noise(0.06, 0.05, 1500); },
  boom: () => { noise(0.25, 0.14, 120); tone(110, 0.25, 'sawtooth', 0.06, 0.3); },
  coin: () => tone(1320 + Math.random() * 200, 0.05, 'square', 0.025, 1.5),
  shoot: () => tone(600, 0.06, 'square', 0.04, 1.8),
  hurt: () => { tone(160, 0.3, 'sawtooth', 0.1, 0.4); noise(0.2, 0.1, 200); },
  pick: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'square', 0.05), i * 60)); },
  clear: () => { [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.08), i * 70)); },
};

// ---------- 像素數字字型 3x5 ----------
const FONT = {
  '0':'111101101101111','1':'010110010010111','2':'111001111100111','3':'111001111001111','4':'101101111001001',
  '5':'111100111001111','6':'111100111101111','7':'111001001001001','8':'111101111101111','9':'111101111001111',
  '+':'000010111010000','x':'000101010101000','/':'001001010100100'
};
function num(str, x, y, col, sz = 1, center = true) {
  str = String(str);
  const w = str.length * 4 * sz - sz;
  let cx = center ? Math.round(x - w / 2) : x;
  for (const ch of str) {
    const f = FONT[ch];
    if (f) for (let i = 0; i < 15; i++) if (f[i] === '1') {
      g.fillStyle = P[0]; g.fillRect(cx + (i % 3) * sz + sz, y + ((i / 3) | 0) * sz + sz, sz, sz);
    }
    if (f) for (let i = 0; i < 15; i++) if (f[i] === '1') {
      g.fillStyle = col; g.fillRect(cx + (i % 3) * sz, y + ((i / 3) | 0) * sz, sz, sz);
    }
    cx += 4 * sz;
  }
}

// ---------- 強化 ----------
// 每個強化：圖示畫法＋等級上限
const UPG = {
  multi:  { max: 6, col: 11 },  // 多發：每次多射一顆
  split:  { max: 5, col: 10 },  // 分裂：打碎東西時分出新球
  pierce: { max: 5, col: 4 },   // 穿透：打碎後直接穿過去
  boom:   { max: 5, col: 3 },   // 爆炸：命中時小範圍爆炸
  big:    { max: 4, col: 5 },   // 變大：球變大、傷害增加
  magnet: { max: 3, col: 9 },   // 磁吸：球會往怪偏、錢會飛過來
  chain:  { max: 4, col: 12 },  // 閃電：打碎時電到附近的東西
};
let lv;

// ---------- 遊戲狀態 ----------
let state, room, hearts, coins, shownCoins, ents, balls, parts, pops, coinsF, queue, queueT, aim, aiming, turn, combo, shake, flash, choices, hover, turnTime, fast, slowmo, bestCombo, runTime;
function newRun() {
  lv = {}; for (const k in UPG) lv[k] = 0;
  room = 0; hearts = 3; coins = 0; shownCoins = 0; bestCombo = 0; runTime = 0;
  nextRoom();
}
function nextRoom() {
  room++;
  ents = []; balls = []; parts = []; pops = []; coinsF = []; queue = 0;
  aim = -Math.PI / 2; aiming = false; turn = 0; combo = 0; shake = 0; flash = 0; slowmo = 0;
  buildRoom(room);
  state = 'aim';
}
function rnd(a, b) { return a + Math.random() * (b - a); }
function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
function buildRoom(r) {
  const rows = 3 + Math.min(4, Math.ceil(r / 2));
  const baseHp = 1 + Math.floor(r * 0.6);
  const occ = {};
  // 怪（2x2 格）
  const nMon = 1 + Math.floor(r / 2);
  for (let i = 0; i < nMon; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const c = ri(0, COLS - 2), rw = ri(0, rows - 2);
      const k = [c + ',' + rw, c + 1 + ',' + rw, c + ',' + (rw + 1), c + 1 + ',' + (rw + 1)];
      if (k.some(q => occ[q])) continue;
      k.forEach(q => occ[q] = 1);
      const hp = baseHp * 4 + r * 2;
      ents.push({ x: FX0 + c * CW + 1, y: FY0 + 4 + rw * CH + 1, w: CW * 2 - 2, h: CH * 2 - 2, hp, max: hp, mon: true, kind: ri(0, 2), t: Math.random() * 9, fl: 0 });
      break;
    }
  }
  // 磚塊（對稱排列比較像房間）
  const half = Math.ceil(COLS / 2);
  for (let rw = 0; rw < rows; rw++) for (let c = 0; c < half; c++) {
    if (Math.random() < 0.3) continue;
    const typ = Math.random() < 0.08 + r * 0.01 ? 'tnt' : (Math.random() < 0.12 ? 'gold' : 'brick');
    const hp = typ === 'gold' ? 1 : baseHp + ri(0, r);
    for (const cc of [c, COLS - 1 - c]) {
      if (occ[cc + ',' + rw]) continue; occ[cc + ',' + rw] = 1;
      ents.push({ x: FX0 + cc * CW + 1, y: FY0 + 4 + rw * CH + 1, w: CW - 2, h: CH - 2, hp, max: hp, typ, fl: 0 });
    }
  }
  // 背盾怪：驗「瞄準角度值不值錢」的實驗機關，每個房間都放一隻。
  // 前面＋兩側有盾、正面打一律 0 傷害只彈開，要繞去撞頂牆再從正上方打背面才會扣血。
  // 完整掃 2x2 空位、保證放得下（不能靠隨機試幾次，試不到就等於沒放）。
  {
    const candidates = [];
    for (let rw = 0; rw <= rows - 2; rw++) for (let c = 0; c <= COLS - 2; c++) {
      const k = [c + ',' + rw, (c + 1) + ',' + rw, c + ',' + (rw + 1), (c + 1) + ',' + (rw + 1)];
      if (!k.some(q => occ[q])) candidates.push({ c, rw });
    }
    let pool = candidates.filter(p => p.rw <= 1);
    if (!pool.length) pool = candidates;
    let choice;
    if (pool.length) {
      choice = pool[ri(0, pool.length - 1)];
    } else {
      choice = { c: 0, rw: 0 };
      const tx0 = FX0, tx1 = FX0 + 2 * CW, ty0 = FY0 + 4, ty1 = FY0 + 4 + 2 * CH;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        if (e.x < tx1 && e.x + e.w > tx0 && e.y < ty1 && e.y + e.h > ty0) ents.splice(i, 1);
      }
    }
    const hp = baseHp * 4 + r * 2;
    ents.push({ x: FX0 + choice.c * CW + 1, y: FY0 + 4 + choice.rw * CH + 1, w: CW * 2 - 2, h: CH * 2 - 2, hp, max: hp, mon: true, kind: 3, shield: true, t: Math.random() * 9, fl: 0 });
  }
}

// ---------- 輸入 ----------
function toLogic(e) { return { x: (e.clientX - offX) * (W / parseFloat(scr.style.width)), y: (e.clientY - offY) * (H / parseFloat(scr.style.height)) }; }
function setAim(p) {
  let a = Math.atan2(p.y - LY, p.x - LX);
  if (a > 0) a = p.x < LX ? -Math.PI + 0.12 : -0.12;
  aim = Math.max(-Math.PI + 0.12, Math.min(-0.12, a));
}
let fastBtn = { x: 372, y: 150, w: 40, h: 36 };
let ptrDown = false;
scr.addEventListener('pointerdown', e => {
  audio(); const p = toLogic(e); ptrDown = true;
  if (state === 'pick') { hover = pickAt(p); return; }
  if (state === 'over') { newRun(); return; }
  if (inBox(p, fastBtn)) { fast = true; return; }
  if (state === 'aim') { aiming = true; setAim(p); }
});
scr.addEventListener('pointermove', e => {
  const p = toLogic(e);
  if (state === 'pick') { hover = pickAt(p); return; }
  if (state === 'aim' && (aiming || e.pointerType === 'mouse')) setAim(p);
});
function release(e) {
  ptrDown = false; fast = false;
  const p = toLogic(e);
  if (state === 'pick') { const i = pickAt(p); if (i >= 0) choose(i); return; }
  if (state === 'aim' && aiming) { aiming = false; fire(); }
}
scr.addEventListener('pointerup', release);
scr.addEventListener('pointercancel', () => { aiming = false; fast = false; });
const keys = {};
addEventListener('keydown', e => {
  audio(); keys[e.key] = true;
  if (state === 'pick') { if (e.key >= '1' && e.key <= '3') choose(+e.key - 1); if (e.key === 'ArrowLeft') hover = Math.max(0, (hover | 0) - 1); if (e.key === 'ArrowRight') hover = Math.min(2, (hover < 0 ? 0 : hover) + 1); if (e.key === ' ' || e.key === 'Enter') choose(Math.max(0, hover)); e.preventDefault(); return; }
  if (state === 'over' && (e.key === ' ' || e.key === 'Enter')) { newRun(); return; }
  if (state === 'aim' && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp')) fire();
  if (e.key === 'f' || e.key === 'Shift') fast = true;
  e.preventDefault();
});
addEventListener('keyup', e => { keys[e.key] = false; if (e.key === 'f' || e.key === 'Shift') fast = false; });
function inBox(p, b) { return p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h; }

// ---------- 發射 ----------
function ballR() { return 2 + lv.big; }
function fire() {
  state = 'run'; turn++; queue = 3 + lv.multi * 2; queueT = 0; turnTime = 0; combo = 0;
}
function spawnBall(x, y, a, child) {
  if (balls.length > 90) return;
  const sp = 190;
  balls.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: ballR(), pierce: lv.pierce, child, trail: [], hitCd: new Map(), life: 0 });
}

// ---------- 傷害 ----------
function damage(e, dmg, bx, by, srcBall) {
  if (e.dead) return false;
  e.hp -= dmg; e.fl = 0.12; combo++;
  bestCombo = Math.max(bestCombo, combo);
  pops.push({ x: e.x + e.w / 2 + rnd(-3, 3), y: e.y, t: 0.5, s: String(dmg), c: P[12] });
  shake = Math.max(shake, e.mon ? 1.5 : 0.8);
  if (e.hp <= 0) { kill(e, bx, by, srcBall); return true; }
  sfx.hit(combo);
  for (let i = 0; i < 3; i++) parts.push(part(bx, by, P[12], 40));
  return false;
}
function kill(e, bx, by, srcBall) {
  e.dead = true;
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  const col = e.mon ? P[[2, 1, 7, 14][e.kind]] : e.typ === 'gold' ? P[4] : e.typ === 'tnt' ? P[2] : brickCol(e.max);
  const n = e.mon ? 40 : 14;
  for (let i = 0; i < n; i++) parts.push(part(cx + rnd(-e.w / 2, e.w / 2), cy + rnd(-e.h / 2, e.h / 2), i % 3 ? col : P[0], e.mon ? 120 : 80));
  sfx.brk(combo);
  shake = Math.max(shake, e.mon ? 5 : 2.2);
  if (e.mon) { flash = 0.08; slowmo = 0.12; }
  // 掉錢
  const nc = e.mon ? 8 + room : e.typ === 'gold' ? 6 : 1 + (Math.random() < 0.4 ? 1 : 0);
  for (let i = 0; i < nc; i++) coinsF.push({ x: cx, y: cy, vx: rnd(-60, 60), vy: rnd(-90, -20), t: 0 });
  // TNT
  if (e.typ === 'tnt') explode(cx, cy, 26, 2 + room, null);
  // 分裂
  if (lv.split && srcBall && Math.random() < 0.25 + lv.split * 0.15) {
    for (let i = 0; i < (lv.split >= 4 ? 2 : 1); i++) spawnBall(bx, by, Math.atan2(srcBall.vy, srcBall.vx) + rnd(-1.2, 1.2), true);
  }
  // 閃電
  if (lv.chain) {
    let from = { x: cx, y: cy };
    const hitSet = new Set([e]);
    for (let j = 0; j < lv.chain + 1; j++) {
      let best = null, bd = 60 * 60;
      for (const o of ents) { if (o.dead || hitSet.has(o)) continue; const d = (o.x + o.w / 2 - from.x) ** 2 + (o.y + o.h / 2 - from.y) ** 2; if (d < bd) { bd = d; best = o; } }
      if (!best) break;
      hitSet.add(best);
      const to = { x: best.x + best.w / 2, y: best.y + best.h / 2 };
      bolts.push({ a: from, b: to, t: 0.15 });
      tone(900 + j * 150, 0.04, 'sawtooth', 0.02);
      damage(best, lv.chain, to.x, to.y, null);
      from = to;
    }
  }
}
let bolts = [];
function explode(x, y, rad, dmg, srcBall) {
  sfx.boom(); shake = Math.max(shake, 3 + rad / 12);
  rings.push({ x, y, r: 2, max: rad, t: 0 });
  for (let i = 0; i < 18; i++) parts.push(part(x, y, [P[4], P[3], P[2], P[12]][i % 4], 30 + rad * 4));
  for (const e of ents) {
    if (e.dead) continue;
    const nx = Math.max(e.x, Math.min(x, e.x + e.w)), ny = Math.max(e.y, Math.min(y, e.y + e.h));
    if ((nx - x) ** 2 + (ny - y) ** 2 < rad * rad) damage(e, dmg, nx, ny, srcBall);
  }
}
let rings = [];
function part(x, y, c, sp) { const a = rnd(0, 6.28), s = rnd(0.2, 1) * sp; return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, c, t: rnd(0.3, 0.7), sz: Math.random() < 0.3 ? 2 : 1 }; }
function brickCol(hp) { return P[[9, 10, 11, 5, 6, 7, 1, 15][Math.min(7, Math.floor((hp - 1) / 2))]]; }

// ---------- 更新 ----------
function update(dt) {
  sndBudget = 0;
  if (slowmo > 0) { slowmo -= dt; dt *= 0.3; }
  runTime += dt;
  shake = Math.max(0, shake - dt * 18); flash = Math.max(0, flash - dt);
  for (const e of ents) { e.fl = Math.max(0, e.fl - dt); if (e.mon) e.t += dt; }

  if (state === 'aim' && !aiming) {
    if (keys.ArrowLeft) aim = Math.max(-Math.PI + 0.12, aim - dt * 1.6);
    if (keys.ArrowRight) aim = Math.min(-0.12, aim + dt * 1.6);
  }

  if (state === 'run') {
    const steps = fast ? 3 : 1;
    for (let s = 0; s < steps; s++) runStep(dt);
  }

  // 粒子
  for (const p of parts) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.97; }
  parts = parts.filter(p => p.t > 0);
  if (parts.length > 700) parts.splice(0, parts.length - 700);
  for (const p of pops) { p.t -= dt; p.y -= 22 * dt; }
  pops = pops.filter(p => p.t > 0);
  for (const r of rings) { r.t += dt; r.r = r.max * Math.min(1, r.t / 0.12); }
  rings = rings.filter(r => r.t < 0.25);
  for (const b of bolts) b.t -= dt;
  bolts = bolts.filter(b => b.t > 0);
  // 錢：先噴出去，然後飛向左上角的錢包
  for (const c of coinsF) {
    c.t += dt;
    if (c.t < 0.35 - lv.magnet * 0.08) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 300 * dt; }
    else { const tx = 20, ty = 14, dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy); const sp = 260 + c.t * 400; c.x += dx / d * Math.min(d, sp * dt); c.y += dy / d * Math.min(d, sp * dt); if (d < 4) { c.done = true; coins++; sfx.coin(); } }
  }
  coinsF = coinsF.filter(c => !c.done);
  if (shownCoins < coins) shownCoins = Math.min(coins, shownCoins + Math.max(1, (coins - shownCoins) * 0.2));
}
function runStep(dt) {
  turnTime += dt;
  queueT -= dt;
  if (queue > 0 && queueT <= 0) { spawnBall(LX, LY - 3, aim + rnd(-0.02, 0.02), false); sfx.shoot(); queue--; queueT = 0.07; }
  // 太久沒結束：加重力把球拉下來
  if (ents.length === 0 && turnTime < 14) turnTime = 14; // 清空就收球
  const grav = turnTime > 10 ? (turnTime - 10) * 60 : 0;
  for (const b of balls) {
    b.life += dt;
    if (lv.magnet) {
      let best = null, bd = 1e9;
      for (const e of ents) { if (e.dead) continue; const d = (e.x + e.w / 2 - b.x) ** 2 + (e.y + e.h / 2 - b.y) ** 2; if (d < bd) { bd = d; best = e; } }
      if (best && bd < 70 * 70) { const dx = best.x + best.w / 2 - b.x, dy = best.y + best.h / 2 - b.y, d = Math.sqrt(bd) || 1; b.vx += dx / d * 140 * lv.magnet * dt; b.vy += dy / d * 140 * lv.magnet * dt; }
    }
    b.vy += grav * dt;
    // 維持速度
    const sp = Math.hypot(b.vx, b.vy), want = 190 + (grav ? grav : 0);
    b.vx *= want / sp; b.vy *= want / sp;
    // 避免水平卡住
    if (Math.abs(b.vy) < 25) b.vy = (b.vy < 0 ? -25 : 25);
    const sub = Math.ceil(sp * dt / 2);
    for (let i = 0; i < sub; i++) moveBall(b, dt / sub);
    b.trail.push(b.x, b.y); if (b.trail.length > 12) b.trail.splice(0, 2);
    for (const [k, v] of b.hitCd) { if (v - dt <= 0) b.hitCd.delete(k); else b.hitCd.set(k, v - dt); }
  }
  balls = balls.filter(b => !b.gone);
  ents = ents.filter(e => !e.dead);
  if (queue === 0 && balls.length === 0 && coinsF.length === 0) endTurn();
}
function moveBall(b, dt) {
  b.x += b.vx * dt; b.y += b.vy * dt;
  const r = b.r;
  if (b.x < FX0 + r) { b.x = FX0 + r; b.vx = Math.abs(b.vx); sfx.bounce(); wallSpark(b); }
  if (b.x > FX1 - r) { b.x = FX1 - r; b.vx = -Math.abs(b.vx); sfx.bounce(); wallSpark(b); }
  if (b.y < FY0 + r) { b.y = FY0 + r; b.vy = Math.abs(b.vy); sfx.bounce(); wallSpark(b); }
  if (b.y > FY1 + r) { b.gone = true; for (let i = 0; i < 5; i++) parts.push(part(b.x, FY1, P[13], 40)); return; }
  for (const e of ents) {
    if (e.dead || b.hitCd.has(e)) continue;
    const nx = Math.max(e.x, Math.min(b.x, e.x + e.w)), ny = Math.max(e.y, Math.min(b.y, e.y + e.h));
    const dx = b.x - nx, dy = b.y - ny, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    // 先算碰撞法線方向，盾怪要靠這個判斷是不是打在盾上
    const d = Math.sqrt(d2);
    let nX, nY;
    if (d > 0.001) { nX = dx / d; nY = dy / d; }
    else { const cx = e.x + e.w / 2, cy = e.y + e.h / 2; if (Math.abs(b.x - cx) / e.w > Math.abs(b.y - cy) / e.h) { nX = Math.sign(b.x - cx); nY = 0; } else { nX = 0; nY = Math.sign(b.y - cy); } }
    const blocked = e.shield && nY > -0.5; // 盾包住前面＋兩側，只有從正上方（背面）打中才算數
    let killed = false;
    if (blocked) { e.fl = 0.06; sfx.bounce(); for (let i = 0; i < 2; i++) parts.push(part(nx, ny, P[13], 30)); }
    else {
      const dmg = 1 + lv.big;
      killed = damage(e, dmg, nx, ny, b);
      if (lv.boom) explode(nx, ny, 10 + lv.boom * 5, lv.boom, null);
    }
    b.hitCd.set(e, 0.05);
    if (killed && b.pierce > 0) { b.pierce--; continue; } // 穿過去
    // 反彈
    const dot = b.vx * nX + b.vy * nY;
    if (dot < 0) { b.vx -= 2 * dot * nX; b.vy -= 2 * dot * nY; }
    b.x = nx + nX * (r + 0.1); b.y = ny + nY * (r + 0.1);
    if (!killed) b.pierce = lv.pierce;
    break;
  }
}
function wallSpark(b) { for (let i = 0; i < 2; i++) parts.push(part(b.x, b.y, P[13], 30)); }
function endTurn() {
  if (ents.length === 0) {
    sfx.clear(); shake = 3;
    if (room >= ROOMS) { state = 'over'; win = true; return; }
    makeChoices(); state = 'pick'; hover = -1; return;
  }
  // 全部往下一格；碰線扣心
  if (turn % 2 === 1) { state = 'aim'; return; } // 每兩回合才往下壓一格
  for (const e of ents) e.y += CH;
  let hurt = false;
  for (const e of ents) if (e.y + e.h > DEAD) { e.dead = true; hurt = true; for (let i = 0; i < 20; i++) parts.push(part(e.x + e.w / 2, e.y + e.h / 2, P[2], 90)); }
  ents = ents.filter(e => !e.dead);
  if (hurt) { hearts--; sfx.hurt(); shake = 7; flash = 0.15; }
  if (hearts <= 0) { state = 'over'; win = false; return; }
  if (ents.length === 0) { endTurn(); return; }
  state = 'aim';
}
let win = false;
function makeChoices() {
  const pool = Object.keys(UPG).filter(k => lv[k] < UPG[k].max);
  choices = [];
  while (choices.length < 3 && pool.length) choices.push(pool.splice(ri(0, pool.length - 1), 1)[0]);
}
function pickRect(i) { const w = 70, gap = 16, tot = 3 * w + 2 * gap; return { x: (W - tot) / 2 + i * (w + gap), y: 60, w, h: 80 }; }
function pickAt(p) { for (let i = 0; i < choices.length; i++) if (inBox(p, pickRect(i))) return i; return -1; }
function choose(i) { if (state !== "pick" || !choices[i]) return; lv[choices[i]]++; sfx.pick(); nextRoom(); }

// ---------- 繪圖 ----------
function drawIcon(k, cx, cy, s) {
  const R = (x, y, w, h, c) => { g.fillStyle = P[c]; g.fillRect(cx + x * s, cy + y * s, w * s, h * s); };
  const dot = (x, y, c, r = 1) => R(x - r, y - r, r * 2, r * 2, c);
  switch (k) {
    case 'multi': dot(-5, 3, 11, 2); dot(0, 0, 11, 2); dot(5, -3, 11, 2); break;
    case 'split': dot(0, 4, 10, 2); R(-1, -1, 2, 3, 12); R(-4, -3, 2, 2, 12); R(2, -3, 2, 2, 12); dot(-5, -5, 10, 2); dot(5, -5, 10, 2); break;
    case 'pierce': R(-7, -4, 3, 8, 14); R(-2, -4, 3, 8, 14); R(3, -4, 3, 8, 14); R(-8, -1, 16, 2, 4); R(6, -3, 2, 6, 4); break;
    case 'boom': R(-2, -7, 4, 14, 3); R(-7, -2, 14, 4, 3); R(-5, -5, 10, 10, 3); R(-3, -3, 6, 6, 4); R(-1, -1, 2, 2, 12); break;
    case 'big': dot(-5, 3, 5, 1); dot(2, -1, 5, 5); R(1, -3, 2, 2, 12); break;
    case 'magnet': R(-6, -6, 3, 9, 9); R(3, -6, 3, 9, 9); R(-6, 3, 12, 3, 9); R(-6, -6, 3, 2, 12); R(3, -6, 3, 2, 12); break;
    case 'chain': R(0, -7, 3, 2, 12); R(-1, -5, 3, 2, 12); R(-2, -3, 6, 2, 12); R(0, -1, 3, 2, 12); R(-1, 1, 3, 2, 12); R(-2, 3, 3, 2, 12); R(-3, 5, 2, 2, 11); break;
  }
}
function drawShieldMon(e, x, y, w, h) {
  const dark = P[0];
  const plate = e.fl > 0 ? P[12] : P[14]; // 盾牌：鐵灰色，正面＋兩側整塊都是盾
  g.fillStyle = dark; g.fillRect(x - 1, y, w + 2, h); g.fillRect(x, y - 1, w, h + 2);
  g.fillStyle = plate; g.fillRect(x, y, w, h);
  g.fillStyle = P[13]; // 鉚釘，讀起來像裝甲
  g.fillRect(x + 2, y + 2, 2, 2); g.fillRect(x + w - 4, y + 2, 2, 2);
  g.fillRect(x + 2, y + h - 4, 2, 2); g.fillRect(x + w - 4, y + h - 4, 2, 2);
  // 背面弱點：頂邊一條會脈動的橘色縫，一眼看出「要打這裡」，不用文字
  const pulse = 0.5 + 0.5 * Math.sin(e.t * 6);
  g.fillStyle = P[3]; g.fillRect(x + 3, y - 2, w - 6, 3);
  g.fillStyle = pulse > 0.5 ? P[4] : P[3]; g.fillRect(x + 3, y - 2, w - 6, 1);
  g.fillStyle = P[0]; g.fillRect(x, y + h + 2, w, 3);
  g.fillStyle = P[5]; g.fillRect(x, y + h + 2, Math.ceil(w * e.hp / e.max), 3);
}
function drawMon(e) {
  const bob = Math.round(Math.sin(e.t * 4) * 1);
  const x = Math.round(e.x), y = Math.round(e.y) + bob, w = e.w, h = e.h;
  if (e.shield) { drawShieldMon(e, x, y, w, h); return; }
  const body = e.fl > 0 ? P[12] : P[[2, 1, 7][e.kind]];
  const dark = P[0];
  g.fillStyle = dark; g.fillRect(x - 1, y, w + 2, h); g.fillRect(x, y - 1, w, h + 2);
  g.fillStyle = body; g.fillRect(x, y, w, h);
  if (e.kind === 0) { g.fillStyle = P[3]; g.fillRect(x + 2, y - 3, 3, 3); g.fillRect(x + w - 5, y - 3, 3, 3); }
  if (e.kind === 2) { g.fillStyle = P[11]; g.fillRect(x + w / 2 - 1, y - 4, 2, 4); }
  // 眼睛看著最近的球或發射台
  let tx = LX, ty = LY; if (balls[0]) { tx = balls[0].x; ty = balls[0].y; }
  const ex = Math.sign(tx - (x + w / 2)), ey = Math.sign(ty - (y + h / 2));
  g.fillStyle = P[12]; g.fillRect(x + 6, y + 4, 6, 6); g.fillRect(x + w - 12, y + 4, 6, 6);
  g.fillStyle = dark; g.fillRect(x + 8 + ex, y + 6 + ey, 2, 2); g.fillRect(x + w - 10 + ex, y + 6 + ey, 2, 2);
  g.fillStyle = dark; g.fillRect(x + 10, y + 13, w - 20, 2);
  if (e.kind === 1) { g.fillStyle = P[12]; g.fillRect(x + 11, y + 15, 2, 2); g.fillRect(x + w - 13, y + 15, 2, 2); }
  // 血條
  g.fillStyle = P[0]; g.fillRect(x, y + h + 2, w, 3);
  g.fillStyle = P[5]; g.fillRect(x, y + h + 2, Math.ceil(w * e.hp / e.max), 3);
}
function drawBrick(e) {
  const x = Math.round(e.x), y = Math.round(e.y), w = e.w, h = e.h;
  let c = e.typ === 'gold' ? P[4] : e.typ === 'tnt' ? P[2] : brickCol(e.hp);
  if (e.fl > 0) c = P[12];
  g.fillStyle = P[0]; g.fillRect(x, y + 1, w, h);
  g.fillStyle = c; g.fillRect(x, y, w, h - 1);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, y, w, 1);
  if (e.typ === 'tnt') { g.fillStyle = P[4]; g.fillRect(x + w / 2 - 3, y + 2, 6, 1); g.fillRect(x + w / 2 - 1, y + 3, 2, 3); g.fillStyle = P[0]; g.fillRect(x + w / 2 - 1, y + 1, 2, 1); }
  else if (e.typ === 'gold') { g.fillStyle = P[12]; g.fillRect(x + 3, y + 2, 2, 2); g.fillStyle = P[3]; g.fillRect(x, y + h - 2, w, 1); }
  else if (e.hp > 1) num(e.hp, x + w / 2, y + 1, P[0]);
  // 裂痕
  if (e.hp < e.max && e.typ !== 'gold') { g.fillStyle = P[0]; g.fillRect(x + 4, y + 2, 1, 3); g.fillRect(x + 5, y + 4, 2, 1); }
}
function draw() {
  g.save();
  const sx = shake ? Math.round(rnd(-shake, shake)) : 0, sy = shake ? Math.round(rnd(-shake, shake)) : 0;
  g.fillStyle = P[0]; g.fillRect(0, 0, W, H);
  g.translate(sx, sy);
  // 房間地板
  g.fillStyle = P[15]; g.fillRect(FX0, FY0, FX1 - FX0, FY1 - FY0);
  g.fillStyle = '#2b3350';
  for (let yy = FY0; yy < FY1; yy += 12) for (let xx = FX0 + ((yy / 12) % 2) * 6; xx < FX1; xx += 12) g.fillRect(xx, yy, 1, 1);
  // 牆
  g.fillStyle = P[14]; g.fillRect(FX0 - 4, FY0 - 4, 4, FY1 - FY0 + 8); g.fillRect(FX1, FY0 - 4, 4, FY1 - FY0 + 8); g.fillRect(FX0 - 4, FY0 - 4, FX1 - FX0 + 8, 4);
  g.fillStyle = P[13]; g.fillRect(FX0 - 4, FY0 - 4, FX1 - FX0 + 8, 1);
  // 危險線
  g.fillStyle = P[2]; for (let xx = FX0; xx < FX1; xx += 6) g.fillRect(xx, DEAD, 3, 1);

  for (const e of ents) e.mon ? drawMon(e) : drawBrick(e);

  // 瞄準線（模擬第一次反彈）
  if (state === 'aim') {
    let x = LX, y = LY - 3, vx = Math.cos(aim), vy = Math.sin(aim), bounces = 0;
    g.fillStyle = P[12];
    for (let i = 0; i < 220 && bounces < 2; i++) {
      x += vx * 1.5; y += vy * 1.5;
      if (x < FX0 || x > FX1) { vx = -vx; bounces++; }
      if (y < FY0) { vy = -vy; bounces++; }
      let hit = false; for (const e of ents) if (x > e.x && x < e.x + e.w && y > e.y && y < e.y + e.h) hit = true;
      if (hit) { g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); break; }
      if (i % 4 === 0 && ((i / 4 + (performance.now() / 60 | 0)) % 3)) g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  // 發射台
  const lx = LX, ly = LY;
  g.fillStyle = P[14]; g.fillRect(lx - 10, ly + 2, 20, 6);
  g.fillStyle = P[13]; g.fillRect(lx - 8, ly, 16, 3);
  const ax = Math.cos(aim), ay = Math.sin(aim);
  g.fillStyle = P[12]; for (let i = 0; i < 8; i++) g.fillRect(Math.round(lx + ax * i) - 1, Math.round(ly + ay * i) - 1, 3, 3);
  if (state === 'aim') { g.fillStyle = P[11]; g.fillRect(lx - ballR(), ly - 3 - ballR(), ballR() * 2, ballR() * 2); num('x' + (3 + lv.multi * 2), lx + 20, ly + 1, P[11]); }
  if (state === 'run' && queue > 0) num('x' + queue, lx + 20, ly + 1, P[11]);

  // 球
  for (const b of balls) {
    g.fillStyle = b.child ? 'rgba(65,166,246,0.35)' : 'rgba(115,239,247,0.35)';
    for (let i = 0; i < b.trail.length; i += 2) g.fillRect(Math.round(b.trail[i]) - 1, Math.round(b.trail[i + 1]) - 1, 2, 2);
    g.fillStyle = P[0]; g.fillRect(Math.round(b.x - b.r) - 1, Math.round(b.y - b.r), b.r * 2 + 2, b.r * 2);
    g.fillStyle = b.child ? P[10] : P[11]; g.fillRect(Math.round(b.x - b.r), Math.round(b.y - b.r), b.r * 2, b.r * 2);
    g.fillStyle = P[12]; g.fillRect(Math.round(b.x - b.r), Math.round(b.y - b.r), 1, 1);
  }
  for (const r of rings) { g.strokeStyle = r.t < 0.08 ? P[12] : P[3]; g.lineWidth = 2; g.beginPath(); g.arc(Math.round(r.x), Math.round(r.y), r.r, 0, 6.29); g.stroke(); }
  for (const b of bolts) { g.strokeStyle = P[11]; g.lineWidth = 1; g.beginPath(); g.moveTo(b.a.x, b.a.y); const mx = (b.a.x + b.b.x) / 2 + rnd(-5, 5), my = (b.a.y + b.b.y) / 2 + rnd(-5, 5); g.lineTo(mx, my); g.lineTo(b.b.x, b.b.y); g.stroke(); }
  for (const p of parts) { g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.sz); }
  for (const c of coinsF) { g.fillStyle = P[0]; g.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 4, 4); g.fillStyle = (runTime * 10 | 0) % 2 ? P[4] : P[3]; g.fillRect(Math.round(c.x), Math.round(c.y) - 1, 2, 3); }
  for (const p of pops) num(p.s, p.x, Math.round(p.y) - 6, p.t > 0.35 ? P[12] : P[4]);
  // 連擊
  if (state === 'run' && combo >= 5) { const sz = combo >= 40 ? 3 : combo >= 15 ? 2 : 1; num(combo + 'x', LX, 172 - sz * 6, combo >= 40 ? P[2] : combo >= 15 ? P[3] : P[4], sz); }
  g.restore();

  // ---- 側邊 HUD（圖示） ----
  // 錢
  g.fillStyle = P[4]; g.fillRect(8, 9, 6, 8); g.fillStyle = P[3]; g.fillRect(12, 9, 2, 8); g.fillStyle = P[12]; g.fillRect(9, 10, 1, 2);
  num(Math.floor(shownCoins), 18, 11, P[4], 1, false);
  // 心
  for (let i = 0; i < 3; i++) { const c = i < hearts ? 2 : 15; const x = 8 + i * 10, y = 26; g.fillStyle = P[c]; g.fillRect(x, y + 1, 7, 3); g.fillRect(x + 1, y, 2, 1); g.fillRect(x + 4, y, 2, 1); g.fillRect(x + 1, y + 4, 5, 1); g.fillRect(x + 2, y + 5, 3, 1); g.fillRect(x + 3, y + 6, 1, 1); }
  // 房間進度
  for (let i = 0; i < ROOMS; i++) { g.fillStyle = i < room - 1 ? P[5] : i === room - 1 ? P[4] : P[15]; g.fillRect(8 + i * 7, 40, 5, 5); }
  // 已拿強化
  let yy = 56;
  for (const k in lv) if (lv[k]) { drawIcon(k, 16, yy + 7, 1); for (let i = 0; i < lv[k]; i++) { g.fillStyle = P[UPG[k].col]; g.fillRect(28 + i * 4, yy + 6, 3, 3); } yy += 18; }
  // 快轉鈕
  const fb = fastBtn;
  g.fillStyle = fast ? P[4] : P[15]; g.fillRect(fb.x, fb.y, fb.w, fb.h);
  g.fillStyle = fast ? P[0] : P[13];
  for (let k = 0; k < 2; k++) for (let i = 0; i < 7; i++) g.fillRect(fb.x + 10 + k * 10 + i, fb.y + 11 + i, 1, 14 - i * 2);
  // 回合數
  num(turn, 392, 20, P[13]);

  if (flash > 0) { g.fillStyle = 'rgba(244,244,244,' + Math.min(0.5, flash * 4) + ')'; g.fillRect(0, 0, W, H); }

  // ---- 選強化 ----
  if (state === 'pick') {
    g.fillStyle = 'rgba(26,28,44,0.82)'; g.fillRect(0, 0, W, H);
    // 標頭：三顆星
    for (let i = 0; i < 3; i++) { g.fillStyle = P[4]; g.fillRect(W / 2 - 16 + i * 12, 34 + (i === 1 ? -3 : 0), 6, 6); }
    choices.forEach((k, i) => {
      const r = pickRect(i), hov = hover === i, bob = hov ? -3 : Math.round(Math.sin(runTime * 3 + i) * 1);
      g.fillStyle = P[0]; g.fillRect(r.x + 2, r.y + 4, r.w, r.h);
      g.fillStyle = hov ? P[14] : P[15]; g.fillRect(r.x, r.y + bob, r.w, r.h);
      g.fillStyle = P[UPG[k].col]; g.fillRect(r.x, r.y + bob, r.w, 3);
      drawIcon(k, r.x + r.w / 2, r.y + 34 + bob, 2);
      for (let j = 0; j < UPG[k].max; j++) { g.fillStyle = j < lv[k] ? P[UPG[k].col] : j === lv[k] ? P[12] : P[0]; g.fillRect(r.x + r.w / 2 - UPG[k].max * 3 + j * 6 + 1, r.y + r.h - 12 + bob, 4, 4); }
      num(i + 1, r.x + 6, r.y + 6 + bob, P[14]);
    });
  }
  if (state === 'over') {
    g.fillStyle = 'rgba(26,28,44,0.85)'; g.fillRect(0, 0, W, H);
    // 勝：皇冠；敗：碎心
    if (win) { g.fillStyle = P[4]; g.fillRect(W / 2 - 20, 50, 40, 16); g.fillRect(W / 2 - 20, 40, 6, 10); g.fillRect(W / 2 - 3, 36, 6, 14); g.fillRect(W / 2 + 14, 40, 6, 10); g.fillStyle = P[2]; g.fillRect(W / 2 - 2, 54, 4, 4); }
    else { g.fillStyle = P[2]; g.fillRect(W / 2 - 18, 40, 14, 14); g.fillRect(W / 2 + 4, 44, 14, 14); g.fillRect(W / 2 - 10, 54, 8, 8); }
    for (let i = 0; i < ROOMS; i++) { g.fillStyle = i < room - (win ? 0 : 1) ? P[5] : P[15]; g.fillRect(W / 2 - ROOMS * 5 + i * 10, 78, 7, 7); }
    g.fillStyle = P[4]; g.fillRect(W / 2 - 40, 98, 6, 8); num(coins, W / 2 - 28, 99, P[4], 2, false);
    num(bestCombo + 'x', W / 2 + 34, 99, P[3], 2);
    // 重來圖示
    const cx = W / 2, cy = 140 + Math.round(Math.sin(runTime * 4));
    g.strokeStyle = P[12]; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 10, 0.6, 5.6); g.stroke();
    g.fillStyle = P[12]; g.fillRect(cx + 6, cy - 12, 7, 3); g.fillRect(cx + 10, cy - 12, 3, 7);
  }

  sctx.drawImage(buf, 0, 0, W * scale, H * scale);
}

// ---------- 主迴圈 ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  try { update(dt); draw(); } catch (err) { console.error(err); throw err; }
  requestAnimationFrame(frame);
}
newRun();
requestAnimationFrame(frame);
// 測試用掛鉤
window.__ball = { get state() { return state; }, get room() { return room; }, get ents() { return ents.length; }, get balls() { return balls.length; }, lv: () => lv, setLv: o => Object.assign(lv, o), fire: a => { aim = a; fire(); }, pick: i => choose(i), clear: () => { ents.forEach(e => e.dead = true); } };
