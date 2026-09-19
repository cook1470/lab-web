// 船員原型：玩家只開船，船員自己撒網、收網、抓繩、補帆
'use strict';
const cv = document.getElementById('c'), g = cv.getContext('2d');
let VW = 422, VH = 195, S = 2;
function resize() {
  S = Math.max(1, Math.floor(Math.min(innerWidth / 380, innerHeight / 180)));
  VW = Math.floor(innerWidth / S); VH = Math.floor(innerHeight / S);
  cv.width = VW; cv.height = VH; cv.style.width = VW * S + 'px'; cv.style.height = VH * S + 'px';
}
addEventListener('resize', resize); resize();

// Sweetie 16 色盤
const P = ['#1a1c2c','#5d275d','#b13e53','#ef7d57','#ffcd75','#a7f070','#38b764','#257179','#29366f','#3b5dc9','#41a6f6','#73eff7','#f4f4f4','#94b0c2','#566c86','#333c57'];
const WW = 1400, WH = 900;               // 世界大小
const PORT = { x: 90, y: 450 };           // 港口
const TIERS = [                           // 船等級：容量、船員數、船長、升級價
  { cap: 12, crew: 3, len: 30, cost: 40, spd: 60 },
  { cap: 22, crew: 4, len: 38, cost: 110, spd: 68 },
  { cap: 36, crew: 5, len: 46, cost: 0, spd: 76 },
];
const ROUGH = [{ x: 900, y: 250, r: 170 }, { x: 1150, y: 700, r: 150 }, { x: 520, y: 780, r: 110 }];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

let st;
function newGame() {
  st = { t: 0, coins: 0, tier: 0, won: false, boat: { x: PORT.x + 50, y: PORT.y, vx: 0, vy: 0, face: 1, hold: [], torn: 0, lurch: 0 },
    crew: [], schools: [], parts: [], waveT: 3, pops: [] };
  setCrew();
  for (let i = 0; i < 9; i++) spawnSchool();
}
function setCrew() {
  const n = TIERS[st.tier].crew;
  const cols = [2, 9, 6, 3, 1];
  while (st.crew.length < n) st.crew.push({ x: 0, tx: 0, st: 'idle', t: rnd(0, 1), col: cols[st.crew.length], jump: 0, net: null, side: st.crew.length % 2 ? 1 : -1 });
}
function inRough(x, y) { return ROUGH.some(r => Math.hypot(x - r.x, y - r.y) < r.r); }
function spawnSchool() {
  let x, y;
  do { x = rnd(250, WW - 40); y = rnd(40, WH - 40); } while (Math.hypot(x - PORT.x, y - PORT.y) < 220);
  const rough = inRough(x, y), gold = Math.random() < (rough ? .2 : .05);
  st.schools.push({ x, y, vx: rnd(-8, 8), vy: rnd(-8, 8), n: Math.floor(rnd(8, 18) * (rough ? 1.4 : 1)),
    kind: gold ? 2 : rough ? 1 : 0, r: 0, ph: rnd(0, 6) });
}
const VAL = [1, 3, 8];

// 輸入
const keys = {}; let joy = null, mouse = null;
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = 1; if (e.key === ' ' || e.key === 'Enter') tapUpgrade(); if (st.won && e.key === 'r') newGame(); });
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = 0; });
function toV(e) { return { x: e.clientX / S - (innerWidth - VW * S) / 2 / S, y: e.clientY / S }; }
const upBtn = () => ({ x: VW - 50, y: VH - 44, w: 44, h: 38 });
function hitBtn(p) { const b = upBtn(); return nearPort() && st.tier < 2 && p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h; }
cv.addEventListener('pointerdown', e => {
  const p = toV(e);
  if (st.won) { newGame(); return; }
  if (hitBtn(p)) { tapUpgrade(); return; }
  if (e.pointerType === 'touch' && p.x < VW / 2) joy = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
  else mouse = { id: e.pointerId, ...p };
});
cv.addEventListener('pointermove', e => { const p = toV(e); if (joy && joy.id === e.pointerId) { joy.x = p.x; joy.y = p.y; } if (mouse && mouse.id === e.pointerId) Object.assign(mouse, p); });
const up = e => { if (joy && joy.id === e.pointerId) joy = null; if (mouse && mouse.id === e.pointerId) mouse = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

function nearPort() { return Math.hypot(st.boat.x - PORT.x, st.boat.y - PORT.y) < 60; }
function tapUpgrade() {
  const T = TIERS[st.tier];
  if (!nearPort() || st.tier >= 2 || st.coins < T.cost || st.boat.hold.length) return;
  st.coins -= T.cost; st.tier++; setCrew();
  for (let i = 0; i < 30; i++) st.parts.push({ x: st.boat.x, y: st.boat.y - 10, vx: rnd(-40, 40), vy: rnd(-70, -10), life: 1, c: rnd(0, 1) < .5 ? 4 : 11 });
  for (const c of st.crew) c.jump = 1;
  if (st.tier === 2) st.won = st.t;
}

// 更新
let cam = { x: 0, y: 0 };
function update(dt) {
  if (st.won) { st.parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt * .6; }); st.parts = st.parts.filter(p => p.life > 0); return; }
  st.t += dt;
  const b = st.boat, T = TIERS[st.tier];
  let ix = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  let iy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  if (joy) { const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy); if (d > 4) { ix = dx / Math.max(d, 22); iy = dy / Math.max(d, 22); } }
  if (mouse) { const dx = mouse.x + cam.x - b.x, dy = mouse.y + cam.y - b.y, d = Math.hypot(dx, dy); if (d > 8) { ix = dx / Math.max(d, 50); iy = dy / Math.max(d, 50); } }
  const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
  const rough = inRough(b.x, b.y);
  const spd = T.spd * (b.torn > 0 ? .5 : 1) * (rough ? .8 : 1);
  b.vx += (ix * spd - b.vx) * Math.min(1, dt * 2.2); b.vy += (iy * spd - b.vy) * Math.min(1, dt * 2.2);
  b.x = clamp(b.x + b.vx * dt, 20, WW - 20); b.y = clamp(b.y + b.vy * dt, 20, WH - 20);
  if (Math.abs(b.vx) > 5) b.face = Math.sign(b.vx);
  b.lurch = Math.max(0, b.lurch - dt * 2);
  const speed = Math.hypot(b.vx, b.vy);

  // 浪：在浪區每隔幾秒打一次
  st.waveT -= dt;
  if (st.waveT <= 0) {
    st.waveT = rough ? rnd(2.5, 4) : rnd(9, 15);
    if (rough || Math.random() < .3) {
      b.lurch = rough ? 1 : .5;
      for (const c of st.crew) if (c.st !== 'fix') { c.prev = c.st === 'rope' ? c.prev : c.st; c.st = 'rope'; c.t = rough ? 1.3 : .7; }
      if (rough && b.torn <= 0 && Math.random() < .3) b.torn = 1;
      for (let i = 0; i < 12; i++) st.parts.push({ x: b.x + rnd(-20, 20), y: b.y + 4, vx: rnd(-30, 30), vy: rnd(-50, -20), life: .6, c: 12 });
    }
  }
  // 帆破了：一個人去補（不用玩家操作）
  if (b.torn > 0 && !st.crew.some(c => c.st === 'fix')) {
    const c = st.crew.find(c => c.st === 'idle' || c.st === 'wait') || st.crew[0];
    if (c.net) { c.net = null; }
    c.st = 'fix'; c.t = 4; c.tx = 0;
  }

  // 魚群移動、被快速的船驚走
  let near = null;
  for (const s of st.schools) {
    s.ph += dt;
    const dx = s.x - b.x, dy = s.y - b.y, d = Math.hypot(dx, dy);
    if (d < 70 && speed > 35) { s.vx += dx / d * 60 * dt * (s.kind + 1); s.vy += dy / d * 60 * dt * (s.kind + 1); }
    s.vx = clamp(s.vx + rnd(-10, 10) * dt, -25, 25); s.vy = clamp(s.vy + rnd(-10, 10) * dt, -25, 25);
    s.vx *= 1 - dt * .3; s.vy *= 1 - dt * .3;
    s.x = clamp(s.x + s.vx * dt, 200, WW - 20); s.y = clamp(s.y + s.vy * dt, 20, WH - 20);
    s.r = 8 + Math.sqrt(s.n) * 3;
    if (d < s.r + 18 && (!near || d < near.d)) near = { s, d };
  }
  st.schools = st.schools.filter(s => s.n > 0);
  while (st.schools.length < 9) spawnSchool();

  // 船員
  const full = b.hold.length >= T.cap;
  const slots = st.crew.length;
  st.crew.forEach((c, i) => {
    c.jump = Math.max(0, c.jump - dt * 3);
    c.home = (i - (slots - 1) / 2) * (T.len / slots) * .9;
    c.t -= dt;
    const walk = tx => { const d = tx - c.x; c.x += clamp(d, -30 * dt, 30 * dt); return Math.abs(d) < 1; };
    switch (c.st) {
      case 'idle':
        walk(c.home);
        if (near && !full && speed < 45 && c.t < 0) { c.st = 'cast'; c.t = .6 + i * .15; if (near.s.n > 12 || near.s.kind) c.jump = 1; }
        else if (c.t < 0) c.t = rnd(.3, 1);
        break;
      case 'cast':
        walk(c.home);
        if (c.t < 0) { c.st = 'wait'; c.t = rnd(1.4, 2.2); c.net = { s: near ? near.s : null, got: [] }; }
        break;
      case 'wait': {
        const s = c.net.s;
        if (!s || Math.hypot(s.x - b.x, s.y - b.y) > s.r + 30 || speed > 55) { c.st = 'haul'; c.t = .5; break; } // 網拉斷前收回
        if (c.t < 0) { const k = Math.min(s.n, 1 + Math.floor(Math.random() * (s.kind === 2 ? 1 : 3))); for (let j = 0; j < k; j++) c.net.got.push(s.kind); s.n -= k; c.st = 'haul'; c.t = .8; }
        break; }
      case 'haul':
        if (c.t < 0) {
          const got = c.net ? c.net.got : [];
          for (const k of got) if (b.hold.length < T.cap) { b.hold.push(k); st.parts.push({ x: b.x + c.x * b.face, y: b.y - 8, vx: rnd(-20, 20), vy: -50, life: .7, c: k === 2 ? 4 : k ? 7 : 13, fish: 1 }); }
          if (got.length >= 3 || got.includes(2)) { c.jump = 1; st.crew.forEach(o => { if (o !== c && o.st === 'idle') o.jump = .7; }); }
          c.net = null; c.st = 'idle'; c.t = rnd(.2, .6);
        }
        break;
      case 'rope':
        walk(c.home);
        if (c.t < 0) { c.st = c.net ? 'wait' : 'idle'; c.t = c.net ? .5 : .3; }
        break;
      case 'fix':
        if (walk(0) && c.t < 0) { b.torn = 0; c.st = 'idle'; c.jump = 1; }
        if (Math.abs(c.x) > 1) c.t = Math.max(c.t, 4);
        break;
    }
  });

  // 回港卸貨
  if (nearPort() && b.hold.length) {
    st.sellT = (st.sellT || 0) - dt;
    if (st.sellT <= 0) { const k = b.hold.pop(); st.coins += VAL[k]; st.sellT = .08; st.pops.push({ x: PORT.x, y: PORT.y - 20, v: VAL[k], life: .8 }); }
  }
  st.parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.life -= dt; });
  st.parts = st.parts.filter(p => p.life > 0);
  st.pops.forEach(p => { p.y -= 20 * dt; p.life -= dt; }); st.pops = st.pops.filter(p => p.life > 0);
  cam.x = clamp(b.x - VW / 2, 0, WW - VW); cam.y = clamp(b.y - VH / 2, 0, WH - VH);
}

// 小字型（3x5 數字）
const DIG = ['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
function num(n, x, y, c) {
  const s = String(n); g.fillStyle = P[c];
  for (let i = 0; i < s.length; i++) { const d = DIG[+s[i]]; if (!d) continue; for (let j = 0; j < 15; j++) if (d[j] === '1') g.fillRect(x + i * 4 + j % 3, y + Math.floor(j / 3), 1, 1); }
  return s.length * 4;
}
const R = (x, y, w, h, c) => { g.fillStyle = P[c]; g.fillRect(Math.round(x), Math.round(y), w, h); };

function drawFishIcon(x, y, c) { R(x, y + 1, 4, 3, c); R(x + 4, y + 2, 1, 1, c); R(x - 2, y, 2, 1, c); R(x - 2, y + 4, 2, 1, c); R(x - 1, y + 1, 1, 3, c); R(x + 3, y + 1, 1, 1, 0); }
function drawCoin(x, y) { R(x + 1, y, 4, 6, 4); R(x, y + 1, 6, 4, 4); R(x + 2, y + 1, 2, 4, 3); }
function drawShip(x, y, tier, c) { const L = 8 + tier * 3; R(x, y + 6, L, 3, c); R(x + 1, y + 9, L - 2, 1, c); R(x + L / 2, y, 1, 6, c); R(x + L / 2 - 3, y + 1, 3, 4, 12); if (tier > 1) R(x + L / 2 + 3, y + 1, 1, 5, c); }

function draw() {
  const t = performance.now() / 1000, b = st.boat, T = TIERS[st.tier];
  R(0, 0, VW, VH, 9);
  // 海浪紋
  for (let y = -((cam.y) % 12); y < VH; y += 12) for (let x = -((cam.x) % 24); x < VW; x += 24) {
    const wx = x + cam.x, wy = y + cam.y, o = Math.floor((wx * 7 + wy * 13) % 11);
    if (Math.sin(t * 1.5 + wx * .05 + wy * .03) > .6) R(x + o, y + o % 5, 4, 1, 10);
  }
  // 浪區
  for (const r of ROUGH) {
    const cx = r.x - cam.x, cy = r.y - cam.y;
    if (cx < -r.r || cx > VW + r.r || cy < -r.r || cy > VH + r.r) continue;
    for (let a = 0; a < 60; a++) {
      const ang = a * 2.39, rr = r.r * Math.sqrt((a * 0.618) % 1);
      const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr * .8;
      const k = Math.sin(t * 3 + a) ;
      R(px, py + k * 2, 7, 2, 8); if (k > 0) R(px + 1, py + k * 2 - 1, 4, 1, 12);
    }
  }
  // 港口與陸地
  const px = PORT.x - cam.x, py = PORT.y - cam.y;
  R(-cam.x - 10, 0 - cam.y, 60, WH, 6); R(-cam.x + 50, -cam.y, 4, WH, 4);
  R(px - 40, py - 3, 40, 6, 3); R(px - 40, py + 3, 40, 1, 1);
  for (let i = 0; i < 3; i++) R(px - 36 + i * 12, py + 3, 2, 5, 1);
  R(px - 60, py - 26, 20, 14, 2); R(px - 62, py - 30, 24, 5, 1); R(px - 53, py - 18, 5, 6, 0);
  const pulse = b.hold.length >= T.cap && Math.floor(t * 3) % 2;
  if (pulse || nearPort()) { g.strokeStyle = P[4]; g.strokeRect(Math.round(px - 55) + .5, Math.round(py - 55) + .5, 110, 110); }

  // 魚影
  for (const s of st.schools) {
    const sx = s.x - cam.x, sy = s.y - cam.y;
    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    const cnt = Math.min(s.n, 24);
    for (let i = 0; i < cnt; i++) {
      const a = i * 2.39 + s.ph * (.6 + s.kind * .3), rr = s.r * Math.sqrt((i + .5) / cnt);
      const fx = sx + Math.cos(a) * rr, fy = sy + Math.sin(a) * rr * .6;
      const c = s.kind === 2 ? (Math.sin(t * 8 + i) > .3 ? 4 : 3) : s.kind ? 0 : 8;
      R(fx, fy, s.kind ? 5 : 4, s.kind ? 3 : 2, c); R(fx - 2, fy + (Math.sin(t * 6 + i) > 0 ? 0 : 1), 2, 1, c);
      if (Math.sin(t * 2 + i * 3) > .95) R(fx, fy - 2, 1, 1, 11);
    }
  }

  // 其他方向指引：艙滿時指向港口
  if (b.hold.length >= T.cap && !nearPort()) {
    const dx = PORT.x - b.x, dy = PORT.y - b.y, d = Math.hypot(dx, dy);
    const ax = VW / 2 + dx / d * 40 + (b.x - cam.x - VW / 2), ay = VH / 2 + dy / d * 30 + (b.y - cam.y - VH / 2);
    if (Math.floor(t * 4) % 2) { R(ax - 2, ay - 2, 5, 5, 4); R(ax - 1, ay - 1, 3, 3, 3); }
  }

  // 船
  const bx = Math.round(b.x - cam.x), bob = Math.round(Math.sin(t * 3) * 1 + (b.lurch ? Math.sin(t * 20) * 2 * b.lurch : 0));
  const by = Math.round(b.y - cam.y) + bob, L = T.len, f = b.face;
  // 尾跡
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 10) for (let i = 1; i < 5; i++) R(bx - f * (L / 2 + i * 5), by + 4 + (i % 2), 3, 1, 11);
  // 網
  for (const c of st.crew) if (c.net && (c.st === 'wait' || c.st === 'rope')) {
    const cx = bx + c.x * f, side = c.side;
    const nx = cx + side * 3, ny = by + (side > 0 ? 12 : -10);
    g.strokeStyle = P[13]; g.beginPath(); g.moveTo(cx + .5, by - 6.5); g.lineTo(nx + .5, ny + .5); g.stroke();
    for (let k = 0; k < 3; k++) R(nx - 4 + k * 3, ny - 1 + (k % 2), 2, 2, 13);
    if (Math.sin(t * 10 + c.x) > .7) R(nx - 3, ny - 2, 1, 1, 12);
  }
  // 船身
  R(bx - L / 2, by - 2, L, 5, 1); R(bx - L / 2 + 2, by + 3, L - 4, 2, 1);
  R(bx + f * (L / 2), by - 3, 2 * f, 3, 1);
  R(bx - L / 2, by - 3, L, 1, 3);
  // 魚艙刻度
  const fillW = Math.round((L - 6) * b.hold.length / T.cap);
  R(bx - L / 2 + 3, by, L - 6, 1, 0); R(bx - L / 2 + 3, by, fillW, 1, b.hold.length >= T.cap ? 5 : 13);
  // 桅杆與帆
  const mx = bx - f * 2;
  R(mx, by - 24, 1, 21, 0);
  const sw = 8 + st.tier * 2, sx0 = f > 0 ? mx + 1 : mx - sw;
  R(sx0, by - 22, sw, 14, 12); R(sx0, by - 8, sw, 1, 13);
  if (b.torn > 0) { R(sx0 + 2, by - 18, 3, 5, 8); R(sx0 + 4, by - 14, 2, 3, 8); }
  if (st.tier === 2) { R(mx + f * 12, by - 18, 1, 15, 0); R(f > 0 ? mx + 13 : mx - 18, by - 16, 6, 9, 12); }
  // 船員
  for (const c of st.crew) {
    const cx = bx + Math.round(c.x) * f, j = Math.round(c.jump * Math.abs(Math.sin(t * 12)) * 3);
    let cy = by - 3 - j;
    let armUp = false, lean = 0;
    if (c.st === 'cast') { armUp = true; lean = c.side; }
    if (c.st === 'haul') { lean = -c.side; cy += Math.round(Math.sin(t * 20)); }
    if (c.st === 'rope') { lean = 0; }
    if (c.st === 'fix') cy = by - 16;
    // 腳
    R(cx - 1, cy - 1, 1, 1, 0); R(cx + 1, cy - 1, 1, 1, 0);
    // 身體
    R(cx - 1, cy - 4, 3, 3, c.col);
    // 頭
    R(cx - 1 + (lean > 0 ? 1 : 0), cy - 7, 3, 3, 3); R(cx - 1 + (lean > 0 ? 1 : 0), cy - 7, 3, 1, 0);
    // 手
    if (armUp || c.jump > .3) { R(cx - 2, cy - 7, 1, 2, 3); R(cx + 2, cy - 7, 1, 2, 3); }
    else if (c.st === 'rope') { R(mx - cx > 0 ? cx + 2 : cx - 2, cy - 4, 1, 1, 3); g.strokeStyle = P[4]; g.beginPath(); g.moveTo(cx + .5, cy - 3.5); g.lineTo(mx + .5, by - 22.5); g.stroke(); }
    else if (c.st === 'fix') { R(cx + 2, cy - 6, 1, 1, 3); if (Math.floor(t * 8) % 2) R(cx + 3, cy - 7, 1, 1, 12); }
    else { R(cx - 2, cy - 3, 1, 2, 3); R(cx + 2, cy - 3, 1, 2, 3); }
    if (c.jump > .5) { R(cx, cy - 12, 1, 3, 4); R(cx, cy - 8 - 0, 1, 0, 4); R(cx, cy - 8, 1, 1, 4); }
  }
  // 粒子
  for (const p of st.parts) { if (p.fish) drawFishIcon(p.x - cam.x, p.y - cam.y, p.c); else R(p.x - cam.x, p.y - cam.y, 1, 1, p.c); }
  for (const p of st.pops) { const x = p.x - cam.x, y = p.y - cam.y; drawCoin(x - 8, y); num(p.v, x, y + 1, 4); }

  // HUD：魚艙
  R(4, 4, 58, 11, 0); drawFishIcon(8, 7, 13);
  R(15, 8, 44, 4, 15); R(15, 8, Math.round(44 * b.hold.length / T.cap), 4, b.hold.length >= T.cap ? 5 : 11);
  // 金幣與下一艘船
  R(66, 4, 32, 11, 0); drawCoin(69, 6); num(st.coins, 77, 7, 4);
  if (st.tier < 2) {
    R(102, 4, 70, 11, 0); drawShip(105, 4, st.tier + 1, 13);
    R(126, 8, 42, 4, 15); R(126, 8, Math.round(42 * Math.min(1, st.coins / T.cost)), 4, st.coins >= T.cost ? 5 : 4);
  }
  // 時間（分:秒）
  const m = Math.floor(st.t / 60), s2 = Math.floor(st.t % 60);
  R(VW - 26, 4, 22, 11, 0); num(m, VW - 23, 7, 13); R(VW - 18, 8, 1, 1, 13); R(VW - 18, 10, 1, 1, 13); num(String(s2).padStart(2, '0'), VW - 16, 7, 13);
  // 小地圖
  const mw = 42, mh = 27, mx0 = VW - mw - 4, my0 = 18;
  R(mx0 - 1, my0 - 1, mw + 2, mh + 2, 0); R(mx0, my0, mw, mh, 8);
  for (const r of ROUGH) R(mx0 + r.x / WW * mw - 3, my0 + r.y / WH * mh - 2, 6, 4, 15);
  for (const s of st.schools) R(mx0 + s.x / WW * mw, my0 + s.y / WH * mh, 1, 1, s.kind === 2 ? 4 : s.kind ? 13 : 7);
  R(mx0, my0 + PORT.y / WH * mh - 1, 2, 3, 3);
  if (Math.floor(t * 4) % 2) R(mx0 + b.x / WW * mw - 1, my0 + b.y / WH * mh - 1, 2, 2, 12);
  // 升級按鈕
  if (nearPort() && st.tier < 2) {
    const u = upBtn(), ok = st.coins >= T.cost && !b.hold.length;
    R(u.x, u.y, u.w, u.h, ok ? 6 : 15); R(u.x + 1, u.y + 1, u.w - 2, u.h - 2, ok ? 5 : 14);
    drawShip(u.x + 10, u.y + 5, st.tier + 1, 0);
    drawCoin(u.x + 6, u.y + 26); num(T.cost, u.x + 14, u.y + 27, ok ? 0 : 15);
    if (ok && Math.floor(t * 3) % 2) { R(u.x + u.w - 7, u.y + 3, 2, 5, 12); R(u.x + u.w - 7, u.y + 10, 2, 2, 12); }
  }
  // 搖桿
  if (joy) { g.globalAlpha = .4; R(joy.ox - 10, joy.oy - 10, 20, 20, 12); R(joy.x - 4, joy.y - 4, 8, 8, 12); g.globalAlpha = 1; }
  // 勝利
  if (st.won) {
    g.globalAlpha = .6; R(0, 0, VW, VH, 0); g.globalAlpha = 1;
    drawShip(VW / 2 - 12, VH / 2 - 26, 2, 4);
    const w = 4 * 5; num(Math.floor(st.won / 60), VW / 2 - 10, VH / 2, 12); R(VW / 2 - 5, VH / 2 + 1, 1, 1, 12); R(VW / 2 - 5, VH / 2 + 3, 1, 1, 12);
    num(String(Math.floor(st.won % 60)).padStart(2, '0'), VW / 2 - 3, VH / 2, 12);
    for (const p of st.parts) R(p.x - cam.x, p.y - cam.y, 2, 2, p.c);
  }
}

newGame();
let last = performance.now();
function loop(now) { const dt = Math.min(.05, (now - last) / 1000); last = now; update(dt); draw(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
window.__st = () => st;
