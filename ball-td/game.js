'use strict';
// 彈球塔防 原型：怪物沿路線走向基地，波與波之間擺塔（球的機關），戰鬥時瞄準射一串球
const W = 422, H = 195;                 // 邏輯解析度（844x390 的一半）
const FX0 = 70, FX1 = 352, FY0 = 12, FY1 = 190; // 場地邊界
const LX = (FX0 + FX1) / 2, LY = 180;   // 發射台
const ROOMS = 3, WAVES_PER_ROOM = 3, TOTAL_WAVES = ROOMS * WAVES_PER_ROOM;
const VOLLEY = 4;

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

// ---------- 塔（球的機關，本身不攻擊，撞到才觸發） ----------
const TYPES = ['accel', 'split', 'net'];
const TYPE_COL = { accel: 3, split: 6, net: 11 };

// ---------- 路線（從上方入口彎到下方基地＝發射台） ----------
const PATH = [
  { x: 320, y: FY0 },
  { x: 150, y: 55 },
  { x: 320, y: 100 },
  { x: 150, y: 145 },
  { x: LX, y: 178 },
];
const pathSegLen = [];
let pathTotalLen = 0;
for (let i = 0; i < PATH.length - 1; i++) {
  const dx = PATH[i + 1].x - PATH[i].x, dy = PATH[i + 1].y - PATH[i].y;
  const L = Math.hypot(dx, dy);
  pathSegLen.push(L); pathTotalLen += L;
}
function pathPos(t) {
  t = Math.max(0, Math.min(1, t));
  let d = t * pathTotalLen;
  for (let i = 0; i < pathSegLen.length; i++) {
    if (d <= pathSegLen[i] || i === pathSegLen.length - 1) {
      const f = pathSegLen[i] > 0 ? d / pathSegLen[i] : 0;
      const a = PATH[i], b = PATH[i + 1];
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    d -= pathSegLen[i];
  }
  return PATH[PATH.length - 1];
}

// ---------- 擺塔的空地（5 熱點靠近路線轉彎、4 冷點在牆邊遠離路線） ----------
const SLOTS = [
  { x: 150, y: 38, hot: true },
  { x: 300, y: 100, hot: true },
  { x: 150, y: 162, hot: true },
  { x: 235, y: 95, hot: true },
  { x: 211, y: 163, hot: true },
  { x: 85, y: 30, hot: false },
  { x: 85, y: 75, hot: false },
  { x: 85, y: 120, hot: false },
  { x: 85, y: 165, hot: false },
];

// ---------- 遊戲狀態 ----------
let phase, hearts, leaks, kills, bestCombo, runTime, win;
let towers, ents, balls, parts, pops, rings, bolts;
let waveIdx, spawnedCount, spawnTimer, waveMonCount, spawnGap;
let queue, queueT, aim, aiming, turn, combo, shake, flash, slowmo, state, turnTime, fast;
let currentType, towerChoices, hoverCard, dragging, dragPos;
let RAND = Math.random; // 遊戲性相關的隨機（怪物血量/出怪間隔）；可在 simulate() 換成種子版本

function rnd(a, b) { return a + Math.random() * (b - a); }
function ri(a, b) { return Math.floor(rnd(a, b + 1)); }

function newRun() {
  hearts = 3; leaks = 0; kills = 0; bestCombo = 0; runTime = 0; win = false;
  towers = []; SLOTS.forEach(s => s.used = false);
  ents = []; balls = []; parts = []; pops = []; rings = []; bolts = [];
  waveIdx = 1;
  startPickTower();
}
function computeWaveMonCount(w) { return 3 + Math.floor((w - 1) / 2); }
function computeMonHp(w) { const base = Math.round((window.__HPA ?? 2) + w * (window.__HPB ?? 1.2)); return Math.max(1, Math.round(base * (0.9 + RAND() * 0.2))); }
function computeSpawnGap(w) { const base = Math.max(0.5, 1.0 - w * 0.03); return base * (0.85 + RAND() * 0.3); }
function computeSpd(w) { return (26 + w * 1.6) * (window.__SPD ?? 0.68); }

function startPickTower() {
  phase = 'pickTower';
  towerChoices = pickChoiceSet();
  hoverCard = -1;
}
function pickChoiceSet() {
  const count = Math.random() < 0.5 ? 2 : 3;
  const pool = TYPES.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, count);
}
function chooseTowerType(type) {
  if (phase !== 'pickTower') return;
  currentType = type; sfx.pick(); startPlace();
}
function startPlace() {
  phase = 'place'; dragging = false; dragPos = { x: LX, y: 90 };
}
function placeTowerAt(slot, type) {
  slot.used = true;
  towers.push({ x: slot.x - 8, y: slot.y - 6, w: 16, h: 12, type, cool: 0 });
  sfx.pick();
  for (let i = 0; i < 10; i++) parts.push(part(slot.x, slot.y, P[TYPE_COL[type]], 70));
  shake = Math.max(shake, 2);
  resetForWave();
  phase = 'battle';
}
function resetForWave() {
  ents = []; balls = [];
  queue = 0; queueT = 0; aim = -Math.PI / 2; aiming = false; turn = 0; combo = 0; shake = 0; flash = 0; slowmo = 0;
  spawnedCount = 0; spawnTimer = 0.3;
  waveMonCount = computeWaveMonCount(waveIdx);
  spawnGap = computeSpawnGap(waveIdx);
  state = 'aim';
}
function nearestEmptySlot(p, radius) {
  let best = null, bd = radius * radius;
  for (const s of SLOTS) { if (s.used) continue; const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2; if (d < bd) { bd = d; best = s; } }
  return best;
}

// ---------- 輸入 ----------
function toLogic(e) { return { x: (e.clientX - offX) * (W / parseFloat(scr.style.width)), y: (e.clientY - offY) * (H / parseFloat(scr.style.height)) }; }
function setAim(p) {
  let a = Math.atan2(p.y - LY, p.x - LX);
  if (a > 0) a = p.x < LX ? -Math.PI + 0.12 : -0.12;
  aim = Math.max(-Math.PI + 0.12, Math.min(-0.12, a));
}
let fastBtn = { x: 372, y: 150, w: 40, h: 36 };
function towerCardRect(i, total) { const w = 70, gap = 16, tot = total * w + (total - 1) * gap; return { x: (W - tot) / 2 + i * (w + gap), y: 60, w, h: 80 }; }
function towerCardAt(p) { for (let i = 0; i < towerChoices.length; i++) if (inBox(p, towerCardRect(i, towerChoices.length))) return i; return -1; }
let ptrDown = false;
scr.addEventListener('pointerdown', e => {
  audio(); const p = toLogic(e); ptrDown = true;
  if (phase === 'over') { newRun(); return; }
  if (phase === 'pickTower') { const i = towerCardAt(p); if (i >= 0) { hoverCard = i; chooseTowerType(towerChoices[i]); } return; }
  if (phase === 'place') { dragging = true; dragPos = p; return; }
  if (phase === 'battle') {
    if (inBox(p, fastBtn)) { fast = true; return; }
    if (state === 'aim') { aiming = true; setAim(p); }
  }
});
scr.addEventListener('pointermove', e => {
  const p = toLogic(e);
  if (phase === 'pickTower') { hoverCard = towerCardAt(p); return; }
  if (phase === 'place' && dragging) dragPos = p;
  if (phase === 'battle' && state === 'aim' && (aiming || e.pointerType === 'mouse')) setAim(p);
});
function release(e) {
  ptrDown = false; fast = false;
  const p = toLogic(e);
  if (phase === 'place' && dragging) {
    dragging = false;
    const slot = nearestEmptySlot(p, 30);
    if (slot) placeTowerAt(slot, currentType);
    return;
  }
  if (phase === 'battle' && aiming) { aiming = false; fire(); }
}
scr.addEventListener('pointerup', release);
scr.addEventListener('pointercancel', () => { aiming = false; fast = false; dragging = false; });
const keys = {};
addEventListener('keydown', e => {
  audio(); keys[e.key] = true;
  if (phase === 'pickTower') { if (e.key >= '1' && e.key <= '3') { const i = +e.key - 1; if (towerChoices[i]) chooseTowerType(towerChoices[i]); } e.preventDefault(); return; }
  if (phase === 'over' && (e.key === ' ' || e.key === 'Enter')) { newRun(); return; }
  if (phase === 'battle' && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp')) fire();
  if (e.key === 'f' || e.key === 'Shift') fast = true;
  e.preventDefault();
});
addEventListener('keyup', e => { keys[e.key] = false; if (e.key === 'f' || e.key === 'Shift') fast = false; });
function inBox(p, b) { return p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h; }

// ---------- 發射 ----------
function ballR() { return 3; }
let reloadT = 0; let RELOAD = 0.8;
function fire() { if (state !== 'aim') return; reloadT = RELOAD; state = 'run'; turn++; queue = VOLLEY; queueT = 0; turnTime = 0; combo = 0; }
function spawnBall(x, y, a, child) {
  if (balls.length > 60) return;
  const sp = 190;
  balls.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: ballR(), child, trail: [], hitCd: new Map(), life: 0, boostT: 0 });
}

// ---------- 怪物：血量、擊殺、漏過 ----------
function spawnMonster() {
  const hp = computeMonHp(waveIdx);
  const pos = pathPos(0);
  const unlocked = ['grunt', 'dash', 'shield', 'splitter', 'eater', 'stomper'].slice(0, Math.min(6, waveIdx));
  // 新解鎖的那種這一波出一半以上，讓玩家看清楚它在幹嘛
  const newest = unlocked[unlocked.length - 1];
  const type = (spawnedCount % 2 === 0 || unlocked.length === 1) ? newest : unlocked[Math.floor(RAND() * unlocked.length)];
  addMon(type, hp, 0);
}
function addMon(type, hp, prog, small) {
  const pos = pathPos(prog), sz = small ? 8 : type === 'eater' ? 14 : 12;
  if (type === 'shield') hp = Math.ceil(hp * 0.8);
  if (type === 'eater') hp = Math.ceil(hp * 1.3);
  ents.push({ mon: true, type, kind: 0, hp, max: hp, prog, spd: computeSpd(waveIdx) * (type === 'stomper' ? 0.8 : 1), w: sz, h: sz, x: pos.x - sz / 2, y: pos.y - sz / 2, fl: 0, t: Math.random() * 9, dead: false, small: !!small, dashT: RAND() * 1.5 });
}
function damage(e, dmg, bx, by) {
  if (e.dead) return false;
  e.hp -= dmg; e.fl = 0.12; combo++; bestCombo = Math.max(bestCombo, combo);
  pops.push({ x: e.x + e.w / 2 + rnd(-3, 3), y: e.y, t: 0.5, s: String(dmg), c: P[12] });
  shake = Math.max(shake, 1.5);
  if (e.hp <= 0) { kill(e); return true; }
  sfx.hit(combo);
  for (let i = 0; i < 3; i++) parts.push(part(bx, by, P[12], 40));
  return false;
}
function kill(e) {
  e.dead = true; kills++;
  if (e.type === 'splitter' && !e.small) { const h = Math.max(1, Math.ceil(e.max / 3)); addMon('splitter', h, Math.max(0, e.prog - 0.012), true); addMon('splitter', h, Math.min(0.99, e.prog + 0.012), true); ents[ents.length - 1].small = ents[ents.length - 2].small = true; }
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  const col = monCol(e);
  for (let i = 0; i < 30; i++) parts.push(part(cx + rnd(-e.w / 2, e.w / 2), cy + rnd(-e.h / 2, e.h / 2), i % 3 ? col : P[0], 110));
  sfx.brk(combo); shake = Math.max(shake, 5); flash = 0.08; slowmo = 0.1;
}
function leakMonster(e) {
  if (e.dead) return;
  e.dead = true; leaks++; hearts--;
  sfx.hurt(); shake = Math.max(shake, 7); flash = 0.15;
  for (let i = 0; i < 16; i++) parts.push(part(e.x + e.w / 2, e.y + e.h / 2, P[2], 80));
  if (hearts <= 0) { phase = 'over'; win = false; }
}
function explode(x, y, rad, dmg) {
  sfx.boom(); shake = Math.max(shake, 3 + rad / 12);
  rings.push({ x, y, r: 2, max: rad, t: 0 });
  for (let i = 0; i < 18; i++) parts.push(part(x, y, [P[11], P[9], P[7], P[12]][i % 4], 30 + rad * 4));
  for (const e of ents) {
    if (e.dead) continue;
    const nx = Math.max(e.x, Math.min(x, e.x + e.w)), ny = Math.max(e.y, Math.min(y, e.y + e.h));
    if ((nx - x) ** 2 + (ny - y) ** 2 < rad * rad) damage(e, dmg, nx, ny);
  }
}
function part(x, y, c, sp) { const a = rnd(0, 6.28), s = rnd(0.2, 1) * sp; return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, c, t: rnd(0.3, 0.7), sz: Math.random() < 0.3 ? 2 : 1 }; }
function wallSpark(b) { for (let i = 0; i < 2; i++) parts.push(part(b.x, b.y, P[13], 30)); }

// ---------- 塔的效果（撞到才觸發） ----------
function hitTower(b, tw, nx, ny) {
  if (tw.stun > 0) { sfx.bounce(); return true; }
  if (tw.type === 'accel') {
    const sp = Math.hypot(b.vx, b.vy) || 1, boostSp = Math.min(420, sp * 1.6);
    b.vx = b.vx / sp * boostSp; b.vy = b.vy / sp * boostSp;
    b.boostT = 1.0;
    tone(500, 0.05, 'square', 0.03, 2);
    for (let i = 0; i < 6; i++) parts.push(part(nx, ny, P[3], 90));
    shake = Math.max(shake, 2);
    return false; // 加速板：直接穿過，不反彈
  }
  if (tw.type === 'split') {
    if (b.child || tw.cool > 0) { sfx.bounce(); return true; }
    tw.cool = 0.15;
    const ang = Math.atan2(b.vy, b.vx);
    spawnBall(b.x, b.y, ang + 0.5, true);
    spawnBall(b.x, b.y, ang - 0.5, true);
    sfx.pick();
    for (let i = 0; i < 8; i++) parts.push(part(nx, ny, P[6], 90));
    shake = Math.max(shake, 2.5);
    return true;
  }
  if (tw.type === 'net') {
    if (tw.cool <= 0) { explode(tw.x + tw.w / 2, tw.y + tw.h / 2, 34, 2); tw.cool = 0.4; }
    else sfx.bounce();
    return true;
  }
  return true;
}

// ---------- 更新 ----------
function update(dt) {
  sndBudget = 0;
  if (slowmo > 0) { slowmo -= dt; dt *= 0.3; }
  runTime += dt;
  shake = Math.max(0, shake - dt * 18); flash = Math.max(0, flash - dt);
  for (const tw of towers) { if (tw.cool > 0) tw.cool = Math.max(0, tw.cool - dt); if (tw.stun > 0) tw.stun = Math.max(0, tw.stun - dt); }
  for (const e of ents) { e.fl = Math.max(0, e.fl - dt); e.t += dt; if (e.chomp > 0) e.chomp -= dt; }

  const bSteps = phase === 'battle' && fast ? 3 : 1;
  for (let bs = 0; bs < bSteps; bs++) if (phase === 'battle') {
    reloadT = Math.max(0, reloadT - dt);
    spawnTimer -= dt;
    if (spawnedCount < waveMonCount && spawnTimer <= 0) { spawnMonster(); spawnedCount++; spawnTimer = spawnGap; }
    for (const e of ents) {
      if (e.dead) continue;
      let mul = 1;
      if (e.type === 'dash') { e.dashT = (e.dashT + dt) % 2.0; mul = e.dashT < 1.4 ? 0.35 : 4.2; }
      if (e.type === 'eater') mul = 0.9;
      e.prog += (e.spd * mul * dt) / pathTotalLen;
      // 踩塔怪：走過旁邊的塔會被踩壞 3 秒
      if (e.type === 'stomper') for (const tw of towers) { const dx = tw.x + tw.w / 2 - (e.x + e.w / 2), dy = tw.y + tw.h / 2 - (e.y + e.h / 2); if (dx * dx + dy * dy < 24 * 24 && !(tw.stun > 0)) { tw.stun = 3; shake = Math.max(shake, 3); sfx.hurt(); for (let i = 0; i < 10; i++) parts.push(part(tw.x + 8, tw.y + 6, P[13], 60)); } }
      if (e.prog >= 1) { leakMonster(e); }
      else { const pos = pathPos(e.prog); e.x = pos.x - e.w / 2; e.y = pos.y - e.h / 2; }
    }
    ents = ents.filter(e => !e.dead);

    if (phase === 'battle') {
      if (state === 'aim' && !aiming) {
        if (keys.ArrowLeft) aim = Math.max(-Math.PI + 0.12, aim - dt * 1.6);
        if (keys.ArrowRight) aim = Math.min(-0.12, aim + dt * 1.6);
      }
      runStep(dt);
      checkWaveClear();
    }
  }

  for (const p of parts) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.97; }
  parts = parts.filter(p => p.t > 0); if (parts.length > 700) parts.splice(0, parts.length - 700);
  for (const p of pops) { p.t -= dt; p.y -= 22 * dt; } pops = pops.filter(p => p.t > 0);
  for (const r of rings) { r.t += dt; r.r = r.max * Math.min(1, r.t / 0.12); } rings = rings.filter(r => r.t < 0.25);
  for (const b of bolts) b.t -= dt; bolts = bolts.filter(b => b.t > 0);
}
function runStep(dt) {
  turnTime += dt; queueT -= dt;
  if (queue > 0 && queueT <= 0) { spawnBall(LX, LY - 3, aim + rnd(-0.02, 0.02), false); sfx.shoot(); queue--; queueT = 0.06; }
  if (ents.length === 0 && turnTime < 10) turnTime = 10;
  const grav = turnTime > 10 ? (turnTime - 10) * 60 : 0;
  for (const b of balls) {
    b.life += dt;
    if (b.boostT > 0) b.boostT = Math.max(0, b.boostT - dt);
    b.vy += grav * dt;
    const sp = Math.hypot(b.vx, b.vy), want = 190 + (grav ? grav : 0);
    b.vx *= want / sp; b.vy *= want / sp;
    if (Math.abs(b.vy) < 25) b.vy = (b.vy < 0 ? -25 : 25);
    const sub = Math.ceil(sp * dt / 2);
    for (let i = 0; i < sub; i++) moveBall(b, dt / sub);
    b.trail.push(b.x, b.y); if (b.trail.length > 12) b.trail.splice(0, 2);
    for (const [k, v] of b.hitCd) { if (v - dt <= 0) b.hitCd.delete(k); else b.hitCd.set(k, v - dt); }
  }
  balls = balls.filter(b => !b.gone);
  ents = ents.filter(e => !e.dead);
  if (queue === 0 && reloadT <= 0) state = 'aim';
}
function moveBall(b, dt) {
  b.x += b.vx * dt; b.y += b.vy * dt;
  const r = b.r;
  if (b.x < FX0 + r || b.x > FX1 - r || b.y < FY0 + r) { b.wb = (b.wb || 0) + 1; if (b.wb >= 5) { b.gone = true; for (let i = 0; i < 8; i++) parts.push(part(b.x, b.y, P[13], 50)); sfx.bounce(); return; } }
  if (b.x < FX0 + r) { b.x = FX0 + r; b.vx = Math.abs(b.vx); sfx.bounce(); wallSpark(b); }
  if (b.x > FX1 - r) { b.x = FX1 - r; b.vx = -Math.abs(b.vx); sfx.bounce(); wallSpark(b); }
  if (b.y < FY0 + r) { b.y = FY0 + r; b.vy = Math.abs(b.vy); sfx.bounce(); wallSpark(b); }
  if (b.y > FY1 + r) { b.gone = true; for (let i = 0; i < 5; i++) parts.push(part(b.x, FY1, P[13], 40)); return; }

  for (const tw of towers) {
    if (b.hitCd.has(tw)) continue;
    const nx = Math.max(tw.x, Math.min(b.x, tw.x + tw.w)), ny = Math.max(tw.y, Math.min(b.y, tw.y + tw.h));
    const dx = b.x - nx, dy = b.y - ny, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    const reflect = hitTower(b, tw, nx, ny);
    b.hitCd.set(tw, 0.12);
    if (reflect) {
      const d = Math.sqrt(d2) || 0.001, nX = dx / d, nY = dy / d;
      const dot = b.vx * nX + b.vy * nY;
      if (dot < 0) { b.vx -= 2 * dot * nX; b.vy -= 2 * dot * nY; }
      b.x = nx + nX * (r + 0.1); b.y = ny + nY * (r + 0.1);
    }
    return;
  }
  for (const e of ents) {
    if (e.dead || b.hitCd.has(e)) continue;
    const nx = Math.max(e.x, Math.min(b.x, e.x + e.w)), ny = Math.max(e.y, Math.min(b.y, e.y + e.h));
    const dx = b.x - nx, dy = b.y - ny, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    const dmg = b.boostT > 0 ? 2 : 1;
    const cx0 = e.x + e.w / 2, cy0 = e.y + e.h / 2;
    let blocked = false;
    if (e.type === 'shield') {
      // 盾永遠朝著發射台：從發射台那一側打過去會被彈開，要繞到背面
      const fx = LX - cx0, fy = LY - cy0, fl = Math.hypot(fx, fy) || 1, hx = b.x - cx0, hy = b.y - cy0, hl = Math.hypot(hx, hy) || 1;
      if ((fx * hx + fy * hy) / (fl * hl) > 0.2) blocked = true;
    }
    if (e.type === 'eater' && !(b.boostT > 0) && !b.gone) {
      b.gone = true; e.hp = Math.min(e.hp + 1, e.max + 6); e.max = Math.max(e.max, e.hp); e.fl = 0.1; e.chomp = 0.25;
      tone(160, 0.08, 'square', 0.05, -1); for (let i = 0; i < 6; i++) parts.push(part(b.x, b.y, P[5], 30));
      return;
    }
    if (blocked) { tone(1400, 0.03, 'square', 0.03); for (let i = 0; i < 4; i++) parts.push(part(nx, ny, P[12], 60)); }
    else damage(e, dmg, nx, ny);
    b.wb = 0;
    b.hitCd.set(e, 0.05);
    b.boostT = 0;
    const d = Math.sqrt(d2) || 0.001, nX = dx / d, nY = dy / d;
    const dot = b.vx * nX + b.vy * nY;
    if (dot < 0) { b.vx -= 2 * dot * nX; b.vy -= 2 * dot * nY; }
    b.x = nx + nX * (r + 0.1); b.y = ny + nY * (r + 0.1);
    return;
  }
}
function checkWaveClear() {
  if (spawnedCount >= waveMonCount && ents.length === 0) {
    for (const b of balls) for (let i = 0; i < 6; i++) parts.push(part(b.x, b.y, P[11], 70));
    balls = []; queue = 0; reloadT = 0; state = 'aim';
    sfx.clear(); shake = Math.max(shake, 3);
    waveIdx++;
    if (waveIdx > TOTAL_WAVES) { phase = 'over'; win = true; return; }
    startPickTower();
  }
}

// ---------- 繪圖 ----------
function drawTowerIcon(k, cx, cy, s) {
  const R = (x, y, w, h, c) => { g.fillStyle = P[c]; g.fillRect(cx + x * s, cy + y * s, w * s, h * s); };
  switch (k) {
    case 'accel': R(-1, -7, 2, 4, 12); R(-1, -1, 2, 4, 12); R(-4, -8, 8, 1, 3); R(-4, -2, 8, 1, 3); R(-1, 4, 2, 3, 3); break;
    case 'split': R(-1, -6, 2, 5, 12); R(-6, -1, 4, 2, 6); R(3, -1, 4, 2, 6); R(-7, 1, 3, 5, 6); R(4, 1, 3, 5, 6); break;
    case 'net': R(-6, -6, 3, 2, 11); R(-1, -6, 3, 2, 11); R(4, -6, 3, 2, 11); R(-6, -1, 3, 2, 11); R(-1, -1, 3, 2, 11); R(4, -1, 3, 2, 11); R(-6, 4, 3, 2, 11); R(-1, 4, 3, 2, 11); R(4, 4, 3, 2, 11); break;
  }
}
function drawMon(e) {
  const bob = Math.round(Math.sin(e.t * 4) * 1);
  const x = Math.round(e.x), y = Math.round(e.y) + bob, w = e.w, h = e.h;
  const body = e.fl > 0 ? P[12] : monCol(e);
  const dark = P[0];
  g.fillStyle = dark; g.fillRect(x - 1, y, w + 2, h); g.fillRect(x, y - 1, w, h + 2);
  g.fillStyle = body; g.fillRect(x, y, w, h);
  let tx = LX, ty = LY; if (balls[0]) { tx = balls[0].x; ty = balls[0].y; }
  const ex = Math.sign(tx - (x + w / 2)), ey = Math.sign(ty - (y + h / 2));
  g.fillStyle = P[12]; g.fillRect(x + 2, y + 2, 3, 3); g.fillRect(x + w - 5, y + 2, 3, 3);
  g.fillStyle = dark; g.fillRect(x + 3 + ex, y + 3 + ey, 1, 1); g.fillRect(x + w - 4 + ex, y + 3 + ey, 1, 1);
  if (e.type === 'dash') { // 蓄力時抖、衝刺時拖影
    if (e.dashT < 1.4 && e.dashT > 1.0) { g.fillStyle = P[4]; g.fillRect(x - 2 + (Math.floor(e.t * 30) % 2), y - 3, w + 4, 1); }
    if (e.dashT >= 1.4) { g.fillStyle = 'rgba(255,205,117,0.4)'; g.fillRect(x - 6, y + 2, 5, h - 4); }
  }
  if (e.type === 'shield') { // 盾：朝發射台那一面畫一片厚板
    const cx = x + w / 2, cy = y + h / 2, a = Math.atan2(LY - cy, LX - cx);
    g.fillStyle = P[12];
    for (let k = -6; k <= 6; k += 2) { const px = cx + Math.cos(a) * 9 - Math.sin(a) * k, py = cy + Math.sin(a) * 9 + Math.cos(a) * k; g.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3); }
  }
  if (e.type === 'eater') { // 大嘴
    const open = e.chomp > 0 ? 1 : 3 + Math.round(Math.sin(e.t * 6));
    g.fillStyle = P[0]; g.fillRect(x + 2, y + h - 6, w - 4, open);
    g.fillStyle = P[12]; g.fillRect(x + 3, y + h - 6, 1, 1); g.fillRect(x + w - 4, y + h - 6, 1, 1);
  }
  if (e.type === 'stomper') { g.fillStyle = P[0]; g.fillRect(x - 1, y + h, 4, 2); g.fillRect(x + w - 3, y + h, 4, 2); }
  if (e.type === 'splitter' && !e.small) { g.fillStyle = P[0]; g.fillRect(x + w / 2, y, 1, h); }
  g.fillStyle = P[0]; g.fillRect(x, y + h + 2, w, 3);
  g.fillStyle = P[5]; g.fillRect(x, y + h + 2, Math.ceil(w * Math.min(1, e.hp / e.max)), 3);
}
function monCol(e) { return P[{ grunt: 2, dash: 3, shield: 14, splitter: 6, eater: 1, stomper: 7 }[e.type] ?? 2]; }
function drawPath() {
  g.fillStyle = P[8];
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(len / 4);
    for (let j = 0; j <= n; j++) { const t = j / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6); }
  }
  g.fillStyle = P[14];
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(len / 4);
    for (let j = 0; j <= n; j++) { const t = j / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4); }
  }
  g.fillStyle = P[2]; g.fillRect(PATH[0].x - 4, PATH[0].y - 6, 8, 6);
  const base = PATH[PATH.length - 1];
  g.fillStyle = P[14]; g.fillRect(base.x - 1, base.y - 10, 2, 10);
  g.fillStyle = P[11]; g.fillRect(base.x + 1, base.y - 10, 7, 5);
}
function drawSlots() {
  for (const s of SLOTS) {
    if (s.used) continue;
    g.strokeStyle = (phase === 'place') ? (Math.sin(runTime * 5) > 0 ? P[12] : P[13]) : P[15];
    g.lineWidth = 1;
    g.strokeRect(s.x - 8, s.y - 6, 16, 12);
  }
}
function drawTower(tw) {
  const x = Math.round(tw.x), y = Math.round(tw.y);
  g.fillStyle = P[0]; g.fillRect(x - 1, y - 1, tw.w + 2, tw.h + 2);
  g.fillStyle = P[15]; g.fillRect(x, y, tw.w, tw.h);
  g.fillStyle = P[TYPE_COL[tw.type]]; g.fillRect(x, y, tw.w, 2);
  drawTowerIcon(tw.type, x + tw.w / 2, y + tw.h / 2 + 1, 1);
  if (tw.stun > 0) { g.fillStyle = 'rgba(26,28,44,0.7)'; g.fillRect(x, y, tw.w, tw.h); g.fillStyle = P[13]; g.fillRect(x + 3, y + 5, tw.w - 6, 1); g.fillRect(x + tw.w / 2, y + 2, 1, tw.h - 4); }
  if (tw.type === 'net' && tw.cool > 0) { g.fillStyle = 'rgba(115,239,247,0.15)'; g.fillRect(x - 6, y - 6, tw.w + 12, tw.h + 12); }
}
function drawPlaceHints() {
  const near = dragPos ? nearestEmptySlot(dragPos, 30) : null;
  const pulse = (Math.sin(runTime * 6) + 1) / 2;
  for (const s of SLOTS) {
    if (s.used) continue;
    const grow = s === near ? 4 : Math.round(pulse * 2);
    g.fillStyle = s === near ? P[TYPE_COL[currentType]] : 'rgba(244,244,244,0.12)';
    g.fillRect(s.x - 10 - grow, s.y - 8 - grow, 20 + grow * 2, 16 + grow * 2);
    g.strokeStyle = s === near ? P[12] : (pulse > 0.5 ? P[12] : P[4]);
    g.lineWidth = 1; g.strokeRect(s.x - 10 - grow + 0.5, s.y - 8 - grow + 0.5, 19 + grow * 2, 15 + grow * 2);
    g.globalAlpha = s === near ? 1 : 0.45; drawTowerIcon(currentType, s.x, s.y, 1); g.globalAlpha = 1;
    // 向下的小箭頭
    if (s !== near) { const ay = s.y - 16 - Math.round(pulse * 3); g.fillStyle = P[4]; g.fillRect(s.x - 2, ay, 5, 1); g.fillRect(s.x - 1, ay + 1, 3, 1); g.fillRect(s.x, ay + 2, 1, 1); }
  }
  drawDragChip();
}
function drawDragChip() {
  if (phase !== 'place' || !dragPos) return;
  const x = Math.round(dragPos.x), y = Math.round(dragPos.y);
  g.fillStyle = P[0]; g.fillRect(x - 9, y - 7, 18, 14);
  g.fillStyle = P[TYPE_COL[currentType]]; g.fillRect(x - 8, y - 6, 16, 12);
  drawTowerIcon(currentType, x, y, 1);
}
function draw() {
  g.save();
  const sx = shake ? Math.round(rnd(-shake, shake)) : 0, sy = shake ? Math.round(rnd(-shake, shake)) : 0;
  g.fillStyle = P[0]; g.fillRect(0, 0, W, H);
  g.translate(sx, sy);
  g.fillStyle = P[15]; g.fillRect(FX0, FY0, FX1 - FX0, FY1 - FY0);
  g.fillStyle = '#2b3350';
  for (let yy = FY0; yy < FY1; yy += 12) for (let xx = FX0 + ((yy / 12) % 2) * 6; xx < FX1; xx += 12) g.fillRect(xx, yy, 1, 1);
  g.fillStyle = P[14]; g.fillRect(FX0 - 4, FY0 - 4, 4, FY1 - FY0 + 8); g.fillRect(FX1, FY0 - 4, 4, FY1 - FY0 + 8); g.fillRect(FX0 - 4, FY0 - 4, FX1 - FX0 + 8, 4);
  g.fillStyle = P[13]; g.fillRect(FX0 - 4, FY0 - 4, FX1 - FX0 + 8, 1);

  drawPath();
  drawSlots();
  for (const tw of towers) drawTower(tw);
  for (const e of ents) drawMon(e);

  if (phase === 'battle' && state === 'aim') {
    let x = LX, y = LY - 3, vx = Math.cos(aim), vy = Math.sin(aim), bounces = 0;
    g.fillStyle = P[12];
    for (let i = 0; i < 220 && bounces < 2; i++) {
      x += vx * 1.5; y += vy * 1.5;
      if (x < FX0 || x > FX1) { vx = -vx; bounces++; }
      if (y < FY0) { vy = -vy; bounces++; }
      let hit = false;
      for (const e of ents) if (x > e.x && x < e.x + e.w && y > e.y && y < e.y + e.h) hit = true;
      for (const tw of towers) if (x > tw.x && x < tw.x + tw.w && y > tw.y && y < tw.y + tw.h) hit = true;
      if (hit) { g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); break; }
      if (i % 4 === 0 && ((i / 4 + (performance.now() / 60 | 0)) % 3)) g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  const lx = LX, ly = LY;
  g.fillStyle = P[14]; g.fillRect(lx - 10, ly + 2, 20, 6);
  g.fillStyle = P[13]; g.fillRect(lx - 8, ly, 16, 3);
  const ax = Math.cos(aim), ay = Math.sin(aim);
  g.fillStyle = P[12]; for (let i = 0; i < 8; i++) g.fillRect(Math.round(lx + ax * i) - 1, Math.round(ly + ay * i) - 1, 3, 3);
  if (phase === 'battle' && state === 'aim') { g.fillStyle = P[11]; g.fillRect(lx - ballR(), ly - 3 - ballR(), ballR() * 2, ballR() * 2); num('x' + VOLLEY, lx + 20, ly + 1, P[11]); }
  if (phase === 'battle' && reloadT > 0) { g.fillStyle = P[0]; g.fillRect(LX - 11, LY + 9, 22, 3); g.fillStyle = P[11]; g.fillRect(LX - 10, LY + 10, Math.round(20 * (1 - reloadT / RELOAD)), 1); }
  if (phase === 'battle' && state === 'run' && queue > 0) num('x' + queue, lx + 20, ly + 1, P[11]);

  for (const b of balls) {
    g.fillStyle = b.child ? 'rgba(65,166,246,0.35)' : 'rgba(115,239,247,0.35)';
    for (let i = 0; i < b.trail.length; i += 2) g.fillRect(Math.round(b.trail[i]) - 1, Math.round(b.trail[i + 1]) - 1, 2, 2);
    g.fillStyle = P[0]; g.fillRect(Math.round(b.x - b.r) - 1, Math.round(b.y - b.r), b.r * 2 + 2, b.r * 2);
    g.fillStyle = b.boostT > 0 ? P[3] : (b.child ? P[10] : P[11]);
    g.fillRect(Math.round(b.x - b.r), Math.round(b.y - b.r), b.r * 2, b.r * 2);
    g.fillStyle = P[12]; g.fillRect(Math.round(b.x - b.r), Math.round(b.y - b.r), 1, 1);
  }
  for (const r of rings) { g.strokeStyle = r.t < 0.08 ? P[12] : P[11]; g.lineWidth = 2; g.beginPath(); g.arc(Math.round(r.x), Math.round(r.y), r.r, 0, 6.29); g.stroke(); }
  for (const b of bolts) { g.strokeStyle = P[11]; g.lineWidth = 1; g.beginPath(); g.moveTo(b.a.x, b.a.y); const mx = (b.a.x + b.b.x) / 2 + rnd(-5, 5), my = (b.a.y + b.b.y) / 2 + rnd(-5, 5); g.lineTo(mx, my); g.lineTo(b.b.x, b.b.y); g.stroke(); }
  for (const p of parts) { g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.sz); }
  for (const p of pops) num(p.s, p.x, Math.round(p.y) - 6, p.t > 0.35 ? P[12] : P[4]);
  if (phase === 'battle' && combo >= 5) { const sz = combo >= 40 ? 3 : combo >= 15 ? 2 : 1; num(combo + 'x', LX, 172 - sz * 6, combo >= 40 ? P[2] : combo >= 15 ? P[3] : P[4], sz); }

  drawDragChip();
  g.restore();

  // ---- 側邊 HUD（圖示） ----
  for (let i = 0; i < 3; i++) { const c = i < hearts ? 2 : 15; const x = 8 + i * 10, y = 9; g.fillStyle = P[c]; g.fillRect(x, y + 1, 7, 3); g.fillRect(x + 1, y, 2, 1); g.fillRect(x + 4, y, 2, 1); g.fillRect(x + 1, y + 4, 5, 1); g.fillRect(x + 2, y + 5, 3, 1); g.fillRect(x + 3, y + 6, 1, 1); }
  for (let i = 0; i < TOTAL_WAVES; i++) { g.fillStyle = i < waveIdx - 1 ? P[5] : i === waveIdx - 1 ? P[4] : P[15]; g.fillRect(8 + i * 7, 22, 5, 5); }
  g.fillStyle = P[2]; g.fillRect(8, 34, 6, 6); num(leaks, 20, 34, P[2], 1, false);
  g.fillStyle = P[5]; g.fillRect(8, 46, 6, 6); num(kills, 20, 46, P[5], 1, false);

  const fb = fastBtn;
  g.fillStyle = fast ? P[4] : P[15]; g.fillRect(fb.x, fb.y, fb.w, fb.h);
  g.fillStyle = fast ? P[0] : P[13];
  for (let k = 0; k < 2; k++) for (let i = 0; i < 7; i++) g.fillRect(fb.x + 10 + k * 10 + i, fb.y + 11 + i, 1, 14 - i * 2);

  if (flash > 0) { g.fillStyle = 'rgba(244,244,244,' + Math.min(0.5, flash * 4) + ')'; g.fillRect(0, 0, W, H); }

  if (phase === 'pickTower') {
    g.fillStyle = 'rgba(26,28,44,0.82)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) { g.fillStyle = P[4]; g.fillRect(W / 2 - 16 + i * 12, 34 + (i === 1 ? -3 : 0), 6, 6); }
    towerChoices.forEach((k, i) => {
      const r = towerCardRect(i, towerChoices.length), hov = hoverCard === i, bob = hov ? -3 : Math.round(Math.sin(runTime * 3 + i) * 1);
      g.fillStyle = P[0]; g.fillRect(r.x + 2, r.y + 4, r.w, r.h);
      g.fillStyle = hov ? P[14] : P[15]; g.fillRect(r.x, r.y + bob, r.w, r.h);
      g.fillStyle = P[TYPE_COL[k]]; g.fillRect(r.x, r.y + bob, r.w, 3);
      drawTowerIcon(k, r.x + r.w / 2, r.y + 34 + bob, 2);
      num(i + 1, r.x + 6, r.y + 6 + bob, P[14]);
    });
  }
  if (phase === 'place') { g.fillStyle = 'rgba(26,28,44,0.55)'; g.fillRect(0, 0, W, H); drawPlaceHints(); }
  if (phase === 'over') {
    g.fillStyle = 'rgba(26,28,44,0.85)'; g.fillRect(0, 0, W, H);
    if (win) { g.fillStyle = P[4]; g.fillRect(W / 2 - 20, 50, 40, 16); g.fillRect(W / 2 - 20, 40, 6, 10); g.fillRect(W / 2 - 3, 36, 6, 14); g.fillRect(W / 2 + 14, 40, 6, 10); g.fillStyle = P[2]; g.fillRect(W / 2 - 2, 54, 4, 4); }
    else { g.fillStyle = P[2]; g.fillRect(W / 2 - 18, 40, 14, 14); g.fillRect(W / 2 + 4, 44, 14, 14); g.fillRect(W / 2 - 10, 54, 8, 8); }
    for (let i = 0; i < TOTAL_WAVES; i++) { g.fillStyle = i < waveIdx - 1 ? P[5] : P[15]; g.fillRect(W / 2 - TOTAL_WAVES * 5 + i * 10, 78, 7, 7); }
    g.fillStyle = P[2]; g.fillRect(W / 2 - 40, 98, 6, 6); num(leaks, W / 2 - 28, 98, P[2], 2, false);
    g.fillStyle = P[5]; g.fillRect(W / 2 + 18, 98, 6, 6); num(kills, W / 2 + 30, 98, P[5], 2, false);
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

// ---------- 測試用：機器人批次模擬（不畫面、不等輸入） ----------
function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function simulate(seed, mode) {
  RAND = seededRng(seed);
  const placeRng = seededRng(seed * 99991 + 7);
  newRun(); hearts = 999999; // 測試用無限血，讓 9 波都跑完
  const aimSeq = [-1.2, -1.9, -0.9, -2.2, -1.57, -0.7, -2.4, -1.6, -2.7];
  let ai = 0, volleyTimer = 0;
  const dt = 1 / 60; let ticks = 0; const maxTicks = 60 * 60 * 8; // 安全上限 8 分鐘模擬秒
  while (phase !== 'over' && ticks < maxTicks) {
    let guard = 0;
    while ((phase === 'pickTower' || phase === 'place') && guard++ < 20) {
      if (phase === 'pickTower') { chooseTowerType(TYPES[(waveIdx - 1) % 3]); }
      else if (phase === 'place') {
        const empty = SLOTS.filter(s => !s.used);
        if (empty.length === 0) { resetForWave(); phase = 'battle'; break; }
        let slot;
        if (mode === 'hot') slot = empty.find(s => s.hot) || empty[0];
        else slot = empty[Math.floor(placeRng() * empty.length)];
        placeTowerAt(slot, currentType);
      }
    }
    if (phase === 'battle') {
      volleyTimer -= dt;
      if (state === 'aim' && volleyTimer <= 0) { aim = aimSeq[ai % aimSeq.length]; ai++; if (window.__SPAM) aim = -Math.PI / 2; else if (mode === 'aimbot' || window.__AIMBOT) { const t = ents.slice().sort((x, y) => y.prog - x.prog)[0]; if (t) aim = Math.max(-Math.PI + 0.12, Math.min(-0.12, Math.atan2(t.y + t.h / 2 - LY, t.x + t.w / 2 - LX))); } fire(); volleyTimer = 0; }
    }
    update(dt);
    ticks++;
  }
  const result = { leaks, kills, wavesCleared: Math.min(waveIdx - 1, TOTAL_WAVES), time: +(ticks * dt).toFixed(2), win, timedOut: ticks >= maxTicks };
  RAND = Math.random;
  return result;
}
window.__td = {
  simulate,
  get phase() { return phase; }, get waveIdx() { return waveIdx; }, get leaks() { return leaks; },
  get ents() { return ents.length; }, get balls() { return balls.length; }, get towers() { return towers.slice(); },
  get slots() { return SLOTS; }, get types() { return TYPES.slice(); },
};
