// 掛機礦坑 v3：直接以 dig（挖）的引擎為底重做（複製過來改，不是重寫畫面）
// 沿用 dig 的：地圖/地層/礦石/挖掘物理/粒子/音效/貼圖快取/HUD 圖示風格/商店小屋/鏡頭。
// 掛機化的地方：單一玩家角色 -> 多個 AI 礦工（沿用 dig 的 digOrMove/breakTile 邏輯自己跑）；
// 經濟（金幣/深度）由「成本追著收入率」公式驅動（v2 已驗證過的設計，原封不動保留，
// 只把 liftLv 改名成 tankLv 對齊「鑽頭/油箱/背包」三個 dig 概念）；
// 離線：用公式推進 state.depth（讓地圖立刻看得出被挖開一大片），金幣則存進待收下的小卡片。
// 決定「挖哪一區/多深」：雇礦工＝開新的坑道區、升鑽頭＝挖更快更深，兩個既有動作已經回答這件事，
// 沒有另外做一個選區 UI（避免過度設計）。
'use strict';
const cv = document.getElementById('c'), g = cv.getContext('2d');
const T = 10, WW = 28, SKY = 8;
let W = 280, H = 130, S = 3;
function resize() {
  // 跟 dig 完全一樣的縮放（S 只看畫面高度）——格子大小要跟 dig 一樣大，不是為了塞下全景而縮小。
  // 代價是同時看不到全部 4 組礦工，用鏡頭跟拍其中一組來解決（見 render() 的跟拍邏輯），不是靠縮圖。
  S = Math.max(1, Math.floor(Math.min(innerHeight / 130, innerWidth / 190)));
  W = Math.floor(innerWidth / S); H = Math.floor(innerHeight / S);
  cv.width = W; cv.height = H;
  cv.style.width = W * S + 'px'; cv.style.height = H * S + 'px';
  cv.style.left = ((innerWidth - W * S) / 2 | 0) + 'px'; cv.style.top = ((innerHeight - H * S) / 2 | 0) + 'px';
  dark.width = W; dark.height = H; g.imageSmoothingEnabled = false;
}
const dark = document.createElement('canvas'), dg = dark.getContext('2d');

// ---- 亂數（純函式版，chunk 生成不依賴生成順序）----
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0; // >>>0 修正符號，否則「機率 5%」實際會變成 55%（v2 的 idle-dig 踩過、dig 本體因為只拿來挑貼圖變體所以沒發現）
  return h / 4294967296;
}

// ---- 地層表（挖多深換什麼代，val 給經濟公式用，hard 給挖掘手感用）----
const LAYERS = [
  { min: 0, name: '表土', dark: '#5b4029', light: '#7a5a3a', deco: '#caa46a', val: 4, hard: 1 },
  { min: 20, name: '黏土', dark: '#6b3a2c', light: '#8a5240', deco: '#d98a5a', val: 7, hard: 2 },
  { min: 70, name: '岩層', dark: '#4a4a55', light: '#65656f', deco: '#c9c9d8', val: 12, hard: 4 },
  { min: 180, name: '深岩', dark: '#233150', light: '#34466e', deco: '#6ea8ff', val: 20, hard: 8 },
  { min: 350, name: '水晶洞', dark: '#3a1f4a', light: '#55306b', deco: '#c77dff', val: 34, hard: 14 },
  { min: 700, name: '深淵', dark: '#160a1c', light: '#26122e', deco: '#38e0ff', val: 56, hard: 22 },
  { min: 1400, name: '遠古遺跡', dark: '#241a08', light: '#3a2c10', deco: '#ffd76a', val: 90, hard: 34 },
];
function layerOf(y) { let l = LAYERS[0]; for (const L of LAYERS) if (y >= L.min) l = L; return l; }
function tierIndexOf(y) { let idx = 0; for (let i = 0; i < LAYERS.length; i++) if (y >= LAYERS[i].min) idx = i; return idx; }

// ---- 格子種類（跟 dig 完全一樣）0空 1土 2硬岩 3不可破 10銅 11鐵 12銀 13金 14紅寶 15鑽 20化石 21發光晶 22遺物 23遠古核心 ----
const VAL = { 10: 5, 11: 12, 12: 30, 13: 70, 14: 150, 15: 400, 20: 250, 21: 120, 22: 600, 23: 1500 };
const ORECOL = { 10: ['#d9803a', '#f4b067'], 11: ['#a9a9b8', '#e4e4ee'], 12: ['#c6d8e8', '#ffffff'], 13: ['#f2c230', '#fff29a'],
  14: ['#e2344f', '#ff9aa8'], 15: ['#6cf2ff', '#e8ffff'], 20: ['#e8dcc0', '#fff8e4'], 21: ['#7dff9c', '#e6ffe8'], 22: ['#c77dff', '#f4ddff'], 23: ['#ffffff', '#ffe27a'] };
// 每個地層代出什麼礦（越深越稀有，跟 dig 同一套審美延伸成無限深度）
const TIER_ORE = [
  [10, 10, 10, 11],
  [10, 11, 11, 12],
  [11, 12, 12, 13],
  [12, 13, 13, 14, 21],
  [13, 14, 14, 15, 21, 21],
  [14, 15, 15, 21, 22],
  [15, 21, 22, 22, 23],
];

// ---- 地圖：lazy chunk 生成（每格是 seed+座標的純函式，不需要照順序生成，挖過的格子留在 map 陣列裡永久生效）----
let map = [], seedSalt = 1;
function genRow(y) {
  const row = new Uint8Array(WW);
  const oreList = TIER_ORE[tierIndexOf(y)];
  for (let x = 0; x < WW; x++) {
    if (x === 0 || x === WW - 1) { row[x] = 3; continue; }
    const hCave = hash(x * 5 + seedSalt * 3, y * 23 + 7);
    if (hCave < 0.012 && y > 6) { row[x] = 0; continue; }
    const hOre = hash(x * 7 + 13, y * 31 + seedSalt);
    if (hOre < 0.05) { row[x] = oreList[Math.floor(hash(x * 3 + seedSalt, y * 3 + 1) * oreList.length)]; continue; }
    const hRock = hash(x * 17 + seedSalt, y * 11 + 91);
    row[x] = hRock < 0.06 ? 2 : 1;
  }
  return row;
}
function ensureGenerated(maxRow) { while (map.length <= maxRow) map.push(genRow(map.length)); }
function tile(x, y) { if (x < 0 || x >= WW) return 3; if (y < 0) return 0; ensureGenerated(y); return map[y][x]; }
function hardOf(id, y) {
  if (id === 3) return 999; if (id === 23) return layerOf(y).hard * 3;
  let h = layerOf(y).hard * (id === 2 ? 1.8 : 1); if (id >= 10) h *= 1.2; return h;
}

// ---- 礦工群組排位（4 組 x 4 人，最多同時畫 16 個，多的算進總數但不佔位）----
const GROUPS = (() => { const r = []; let x = 3; for (let i = 0; i < 4; i++) { r.push([x, x + 3]); x += 6; } return r; })();
const DRAWN_CAP = 16;
function slotRange(i) { return GROUPS[Math.floor(i / 4)]; }

// ---- 挖掘前緣：bulk 快進 + 最前面一段留給真的 AI 去挖（看得到裂痕/粒子）----
const FRONTIER_BAND = 24;
let clearedRow = 0;
function bulkCatchUp() {
  const targetRow = Math.floor(state.depth);
  const bulkTarget = targetRow - FRONTIER_BAND;
  if (bulkTarget <= clearedRow) return;
  ensureGenerated(bulkTarget + FRONTIER_BAND + 30);
  for (let y = clearedRow; y < bulkTarget; y++) { const row = map[y]; for (const gr of GROUPS) for (let x = gr[0]; x <= gr[1]; x++) row[x] = 0; }
  clearedRow = bulkTarget;
}

// ---- 升級（沿用 dig 的鑽頭/油箱/背包概念）+ 雇礦工；經濟公式=v2 的「成本追著收入率」設計，原封不動 ----
const AWAY_THRESHOLD = 20;
const BASE_DEPTH = 0.05, CYCLE = 8, MINER_POW = 0.6;
const DM = 0.5, TM = 0.4, BM = 0.4;
const SEC_MINER = 60, SEC_UP = 80, R_LOCAL = 1.02, MIN_COST = 12, EG_FLOOR = 0.3;
const drillMult = lv => 1 + lv * DM;
const tankMult = lv => 1 + lv * TM;
const bagMult = lv => 1 + lv * BM;
function depthRate(drillLv) { return BASE_DEPTH * drillMult(drillLv); }
function goldRate(miners, tankLv, bagLv, depth) { return Math.pow(miners, MINER_POW) * (tankMult(tankLv) / CYCLE) * bagMult(bagLv) * layerOf(depth).val; }
function costOf(secTarget, lv, s) { const eg = Math.max(s.goldPS || 0, EG_FLOOR); return Math.max(MIN_COST, Math.floor(eg * secTarget * Math.pow(R_LOCAL, lv))); }
const minerCost = s => costOf(SEC_MINER, s.miners - 1, s);
const drillCost = s => costOf(SEC_UP, s.drillLv, s);
const tankCost = s => costOf(SEC_UP, s.tankLv, s);
const bagCost = s => costOf(SEC_UP, s.bagLv, s);
function bagCapOf(lv) { return 3 + Math.floor(lv * 1.2); }
const pwOf = drillLv => 1.4 * drillMult(drillLv);

function simulate(depth0, miners, drillLv, tankLv, bagLv, seconds) {
  // 離線：用在線時量到的真實速率外推（不再用跟畫面無關的公式）
  const sec = Math.max(0, seconds);
  const depth = depth0 + (state.depthPS || 0) * sec, gold = (state.goldPS || 0) * sec;
  return { depth, gold, depthGain: depth - depth0 };
}

// ---- 存讀檔（不存整張地圖：靠 seed 純函式重生 + 立刻 bulkCatchUp 追回經濟深度）----
const SKEY = 'idle-dig-v4';
function loadState() {
  let s = null;
  try { const raw = localStorage.getItem(SKEY); if (raw) s = JSON.parse(raw); } catch (e) {}
  if (!s) s = {};
  s.gold = s.gold || 0; s.miners = s.miners || 1;
  s.drillLv = s.drillLv || 0; s.tankLv = s.tankLv || 0; s.bagLv = s.bagLv || 0;
  s.depth = s.depth || 0; s.goldPS = s.goldPS || 0; s.depthPS = s.depthPS || 0;
  s.muted = (typeof s.muted === 'boolean') ? s.muted : true;
  s.lastTs = s.lastTs || Date.now();
  s.pendingGold = s.pendingGold || 0; s.pendingDepth = s.pendingDepth || 0; s.pendingRelic = s.pendingRelic || null;
  s.seed = s.seed || ((Math.random() * 1e9) | 0);
  s.seen = s.seen || {};
  return s;
}
function save() { state.lastTs = Date.now(); try { localStorage.setItem(SKEY, JSON.stringify(state)); } catch (e) {} }

let state = loadState();
// hash() 內部會把座標再乘一次大質數，seedSalt 太大會讓中間值超過安全整數範圍、
// 雜訊直接跑掉（早期版本量出來空格佔快一半，就是這個原因）——所以先縮小範圍再用。
seedSalt = state.seed % 9973;

function checkRelic(before, after) {
  if (state.pendingRelic) return;
  const spacing = 150;
  const prevTier = Math.floor(before / spacing), newTier = Math.floor(after / spacing);
  if (newTier > prevTier && after > 5) state.pendingRelic = { depth: after, value: Math.floor(20 + after * 0.6) };
}
function tickLive(seconds) {
  if (seconds <= 0) return;
  const before = state.depth;
  const r = simulate(state.depth, state.miners, state.drillLv, state.tankLv, state.bagLv, seconds);
  state.gold += r.gold; state.depth = r.depth; checkRelic(before, state.depth);
}
function tickAway(seconds) {
  if (seconds <= 0) return;
  const before = state.depth;
  const r = simulate(state.depth, state.miners, state.drillLv, state.tankLv, state.bagLv, seconds);
  state.pendingGold += r.gold; state.pendingDepth += r.depthGain; state.depth = r.depth;
  checkRelic(before, state.depth);
}

// ---- 數字格式 ----
function fmt(n) { n = Math.floor(n); if (n < 1000) return '' + n; const u = ['k', 'm', 'b', 't']; let i = -1, v = n; while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; } return v.toFixed(1) + u[i]; }

// ---- 聲音（沿用 dig 的合成音效，統一在這裡擋靜音）----
let ac = null;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); }
let noiseBuf = null;
function noise(dur, freq, vol, q) {
  if (state.muted || !ac) return;
  if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
  const gn = ac.createGain(); const t = ac.currentTime; gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(gn); gn.connect(ac.destination); s.start(t); s.stop(t + dur);
}
function tone(freq, dur, vol, type, when, slide) {
  if (state.muted || !ac) return; const t = ac.currentTime + (when || 0); const o = ac.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  const gn = ac.createGain(); gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  chip: h => { noise(0.05, 900 - Math.min(h, 20) * 25 + Math.random() * 300, 0.14, 2); },
  brk: h => { noise(0.16, 300 + Math.random() * 200, 0.28, 0.7); tone(120 - Math.min(h, 15) * 4, 0.13, 0.12, 'triangle', 0, 40); },
  coin: i => tone(900 + (i % 8) * 70, 0.06, 0.05, 'square', (i % 8) * 0.045),
  up: () => [0, 4, 7, 12].forEach((n, i) => tone(440 * 2 ** (n / 12), 0.12, 0.07, 'square', i * 0.07)),
  newf: () => [0, 7, 12, 16, 19].forEach((n, i) => tone(330 * 2 ** (n / 12), 0.16, 0.06, 'triangle', i * 0.08)),
  land: () => noise(0.06, 200, 0.15, 0.8),
};

// ---- 特效（沿用 dig）----
let parts = [], pops = [], shake = 0, flash = 0, newIcon = null;
function burst(x, y, col, n, sp) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * sp, vy: -Math.random() * sp * 0.8, life: 0.4 + Math.random() * 0.5, col }); }
function pop(x, y, txtStr, col) { pops.push({ x, y, txt: txtStr, col, life: 1 }); }

// ---- 迷你像素字（沿用 dig）----
const FONT = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  '$': '011110010011110', '+': '000010111010000', '-': '000000111000000', 'm': '000000111111101', '/': '001001010100100', 'x': '000101010101000', ':': '000010000010000', '%': '101001010100101',
  '.': '000000000000010', 'k': '101101110101101', 'b': '110101110101110', 't': '111010010010010' };
function txt(s, x, y, col, sc) {
  sc = sc || 1; g.fillStyle = col; s = String(s);
  for (let i = 0; i < s.length; i++) { const f = FONT[s[i]]; if (f) for (let j = 0; j < 15; j++) if (f[j] === '1') g.fillRect(x + (j % 3) * sc, y + ((j / 3) | 0) * sc, sc, sc); x += 4 * sc; }
}
function txtW(s, sc) { return String(s).length * 4 * (sc || 1) - (sc || 1); }

// ---- 格子貼圖快取（沿用 dig，欄位改成物件式 L.dark/L.light）----
const texCache = {};
function tex(id, y, x) {
  const L = layerOf(y), v = (hash(x, y) * 4) | 0, key = id + L.light + v;
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = c.height = T; const q = c.getContext('2d');
  const base = id === 3 ? '#0e0a10' : id === 2 ? shade(L.dark, -18) : L.dark;
  q.fillStyle = base; q.fillRect(0, 0, T, T);
  let s = hash(v * 7 + id, L.hard * 13);
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  q.fillStyle = id === 2 ? shade(L.light, -10) : L.light; for (let i = 0; i < 7; i++) q.fillRect(r() * T | 0, r() * T | 0, 1 + (r() * 2 | 0), 1);
  q.fillStyle = shade(base, -25); for (let i = 0; i < 5; i++) q.fillRect(r() * T | 0, r() * T | 0, 1, 1);
  if (id === 2) { q.fillStyle = shade(L.light, 20); q.fillRect(2, 2, 5, 1); q.fillRect(1, 3, 1, 4); }
  if (ORECOL[id]) {
    const [a, b] = ORECOL[id];
    if (id === 20) { q.fillStyle = a; q.fillRect(1, 4, 8, 2); q.fillRect(1, 3, 2, 4); q.fillRect(7, 3, 2, 4); q.fillStyle = b; q.fillRect(3, 4, 4, 1); }
    else if (id === 22) { q.fillStyle = '#1a0a22'; q.fillRect(2, 2, 6, 6); q.fillStyle = a; q.fillRect(3, 3, 4, 4); q.fillStyle = b; q.fillRect(4, 4, 2, 2); }
    else if (id === 23) { q.fillStyle = '#000'; q.fillRect(0, 0, T, T); q.fillStyle = a; q.fillRect(1, 1, 8, 8); q.fillStyle = b; q.fillRect(3, 3, 4, 4); }
    else if (id === 21) { q.fillStyle = a; q.fillRect(4, 1, 2, 7); q.fillRect(2, 4, 2, 4); q.fillRect(6, 3, 2, 5); q.fillStyle = b; q.fillRect(4, 2, 1, 3); }
    else { const n = id >= 14 ? 3 : 4; for (let i = 0; i < n; i++) { const px = 1 + r() * 7 | 0, py = 1 + r() * 7 | 0; q.fillStyle = a; q.fillRect(px, py, 2, 2); q.fillStyle = b; q.fillRect(px, py, 1, 1); } }
  }
  return texCache[key] = c;
}
function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const f = k => Math.max(0, Math.min(255, ((n >> k) & 255) + d)); return '#' + ((1 << 24) + (f(16) << 16) + (f(8) << 8) + f(0)).toString(16).slice(1); }

// ---- AI 礦工單位（沿用 dig 的 move/dig 物理，改成自動決策而不是吃鍵盤）----
let units = [];
function syncUnits() {
  const cap = Math.min(state.miners, DRAWN_CAP);
  while (units.length < cap) {
    const i = units.length, gr = slotRange(i);
    units.push({ id: i, x: gr[0] + (i % 4), y: -1, fx: gr[0] + (i % 4), fy: -1, move: null, dig: null, mode: 'shop', shopT: 0.15 + Math.random() * 0.4, cargo: [], groupRange: gr });
  }
}
function unitStartMove(u, tx, ty, dur, fall) { u.move = { fx: u.x, fy: u.y, tx, ty, t: 0, dur, fall }; }
// 已經挖開的坑道＝升降梯：走過空格用飛快的速度（不是像挖新格那樣一格一格爬），
// 不然礦工深了之後光是走回商店就要花好幾分鐘，玩家永遠看不到他們在地面上。
function unitDigOrMove(u, dx, dy, dt) {
  const tx = u.x + dx, ty = u.y + dy;
  if (ty < -1) return;
  const id = tile(tx, ty);
  if (id === 0) { u.dig = null; unitStartMove(u, tx, ty, dx ? 0.05 : 0.035, dy > 0); return; }
  const h = hardOf(id, ty), pw = pwOf(state.drillLv);
  if (!u.dig || u.dig.tx !== tx || u.dig.ty !== ty) u.dig = { tx, ty, p: 0, tick: 0 };
  const need = 0.12 + h / pw * 0.22;
  u.dig.p += dt / need; u.dig.tick -= dt;
  if (u.dig.tick <= 0) { u.dig.tick = 0.07; sfx.chip(h); shake = Math.max(shake, 0.35); const L = layerOf(ty); burst(tx * T + 5 - dx * 4, ty * T + 5 - dy * 4, Math.random() < 0.5 ? L.light : L.dark, 2, 38); }
  if (u.dig.p >= 1) unitBreakTile(u, tx, ty, id);
}
function unitBreakTile(u, x, y, id) {
  map[y][x] = 0; u.dig = null;
  if (y + 1 > state.depth) state.depth = y + 1;
  u.dirt = (u.dirt || 0) + layerOf(y).val * 0.15;
  const h = hardOf(id, y); sfx.brk(h); shake = Math.max(shake, 0.8 + Math.min(h, 10) * 0.15);
  const L = layerOf(y); burst(x * T + 5, y * T + 5, L.light, 7, 55); burst(x * T + 5, y * T + 5, L.dark, 4, 38);
  if (VAL[id]) {
    burst(x * T + 5, y * T + 5, ORECOL[id][1], 10, 78);
    if (!state.seen[id]) { state.seen[id] = 1; newIcon = { id, life: 2.0 }; sfx.newf(); flash = Math.max(flash, 0.2); }
    const cap = bagCapOf(state.bagLv);
    if (u.cargo.length < cap) u.cargo.push(id);
  }
  unitStartMove(u, x, y, 0.1);
}
function enterShop(u) {
  u.mode = 'shop'; u.shopT = 0.5 + Math.random() * 0.4; u.trip = 0;
  let pay = (u.dirt || 0) * bagMult(state.bagLv); u.dirt = 0;
  for (const id of u.cargo) pay += (VAL[id] || 0) * bagMult(state.bagLv);
  pay = Math.floor(pay); if (pay > 0) { state.gold += pay; earned += pay; pop(u.x * T + 5, -T * 2, '+' + fmt(pay), '#ffd76a'); }
  if (u.cargo.length) { sfx.coin(u.id); burst(u.x * T + 5, -T, '#ffd76a', Math.min(12, 4 + u.cargo.length), 55); u.cargo.length = 0; }
}
function unitTick(u, dt) {
  // 跳時間（skip/離線）之後經濟深度一次跳很遠：搭電梯直接跳到目前前緣附近，
  // 不然礦工要花真實好幾分鐘從舊的位置走過來，畫面會跟目前深度對不上。
  if (!u.move && u.mode === 'dig' && u.y < clearedRow - FRONTIER_BAND) {
    u.x = Math.min(u.groupRange[1], Math.max(u.groupRange[0], u.x));
    u.y = clearedRow; u.fx = u.x; u.fy = u.y; u.dig = null;
    burst(u.x * T + 5, u.y * T + 5, '#9ee7ff', 6, 45);
  }
  if (u.move) {
    const m = u.move; m.t += dt / m.dur;
    if (m.t >= 1) { u.x = m.tx; u.y = m.ty; u.move = null; if (m.fall && tile(u.x, u.y + 1) !== 0) { sfx.land(); burst(u.x * T + 5, (u.y + 1) * T, '#aa8866', 3, 25); } }
    u.fx = m.fx + (m.tx - m.fx) * Math.min(1, m.t); u.fy = m.fy + (m.ty - m.fy) * Math.min(1, m.t);
    return;
  }
  u.fx = u.x; u.fy = u.y;
  if (u.mode === 'shop') { u.shopT -= dt; if (u.shopT <= 0) u.mode = 'dig'; return; }
  // 回程：沿著自己挖的坑爬升降繩，不重挖、不會掉回去
  if (u.mode === 'return') { if (u.y <= -1) { enterShop(u); return; } u.dig = null; if (u.y - 1 >= 0 && tile(u.x, u.y - 1) !== 0) map[u.y - 1][u.x] = 0; unitStartMove(u, u.x, u.y - 1, 0.03); return; }
  // mode === 'dig'
  const cap = bagCapOf(state.bagLv);
  if (u.cargo.length >= cap) { u.mode = 'return'; return; }
  u.trip = (u.trip || 0) + dt;
  if (u.trip > 25 * tankMult(state.tankLv)) { u.mode = 'return'; return; }
  // 找附近的礦：半徑 6 格內最近、沒有別的礦工在追的那顆，橫著挖過去；找不到才往下
  if (u.goal && (tile(u.goal.x, u.goal.y) === 0 || !VAL[tile(u.goal.x, u.goal.y)])) u.goal = null;
  if (!u.goal) {
    let best = null, bd = 1e9;
    for (let yy = Math.max(0, u.y - 3); yy <= u.y + 6; yy++) for (let xx = Math.max(0, u.x - 6); xx <= Math.min(WW - 1, u.x + 6); xx++) {
      const id = tile(xx, yy); if (!VAL[id]) continue;
      if (units.some(o => o !== u && o.goal && o.goal.x === xx && o.goal.y === yy)) continue;
      const d = Math.abs(xx - u.x) + Math.abs(yy - u.y) * 1.3 - VAL[id] * 0.01; if (d < bd) { bd = d; best = { x: xx, y: yy }; }
    }
    u.goal = best;
  }
  let dx = 0, dy = 1;
  if (u.goal) { if (u.goal.x !== u.x) { dx = Math.sign(u.goal.x - u.x); dy = 0; } else { dy = Math.sign(u.goal.y - u.y) || 1; } }
  unitDigOrMove(u, dx, dy, dt);
}

// ---- 小屋（沿用 dig 的天空/商店小屋畫法）----
function drawSky(offX, sx, sy) {
  const grd = g.createLinearGradient(0, -SKY * T - 40, 0, 0); grd.addColorStop(0, '#3b6fb6'); grd.addColorStop(1, '#f2b880');
  g.fillStyle = grd; g.fillRect(-offX - 10, -SKY * T - 200, W + 20, SKY * T + 200);
  g.fillStyle = '#5a7fa8'; for (let i = 0; i < 8; i++) { const hx = i * 55 - 20; g.beginPath(); g.moveTo(hx, 0); g.lineTo(hx + 30, -22 - (i % 3) * 6); g.lineTo(hx + 60, 0); g.fill(); }
  const cx = WW * T / 2 - 29;
  g.fillStyle = '#3a2418'; g.fillRect(cx, -26, 58, 26); g.fillStyle = '#c0452f'; g.fillRect(cx - 4, -32, 66, 7);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4e2c0' : '#c0452f'; g.fillRect(cx + i * 8, -25, 8, 3); }
  g.fillStyle = '#f2c230'; g.fillRect(cx + 24, -18, 10, 10); g.fillStyle = '#3a2418'; g.fillRect(cx + 28, -16, 2, 6);
  g.fillStyle = '#4c9a3c'; g.fillRect(0, -2, WW * T, 3);
}

// ---- 礦工造型（沿用 dig 玩家的小鑽車畫法）----
function drawMinerSprite(u, now) {
  let by = u.fy;
  if (u.mode === 'dig' && !u.move && u.y >= Math.floor(state.depth)) by += Math.sin(now / 260 + u.id) * 0.06;
  // 同一組 4 個人常常挖到同一格（隨機抖動剛好撞在一起），完全重疊會看起來只有 1 個人——
  // 畫的時候用組內序號做一個小小的 2x2 錯位（不動真正的挖掘座標），讓一群人看起來真的是一群人。
  const slot = u.id % 4;
  const nudgeX = (slot % 2 === 0 ? -0.3 : 0.3), nudgeY = (slot < 2 ? -0.24 : 0.24);
  const bx2 = Math.round((u.fx + nudgeX) * T), by2 = Math.round((by + nudgeY) * T);
  g.fillStyle = '#ffcf3a'; g.fillRect(bx2 + 1, by2 + 3, 8, 5);
  g.fillStyle = '#e08a1e'; g.fillRect(bx2 + 1, by2 + 7, 8, 1);
  g.fillStyle = '#9ee7ff'; g.fillRect(bx2 + 5, by2 + 4, 3, 2);
  g.fillStyle = '#333'; g.fillRect(bx2 + 1, by2 + 8, 3, 2); g.fillRect(bx2 + 6, by2 + 8, 3, 2);
  const spin = (Math.floor(now / 33)) % 2;
  if (u.mode === 'return') { g.fillStyle = spin ? '#ff8a3a' : '#bbb'; g.fillRect(bx2 + 3, by2 + 1, 4, 2); }
  else { g.fillStyle = spin && u.dig ? '#fff' : '#bbb'; g.fillRect(bx2 + 3, by2 + 10, 4, 1); g.fillRect(bx2 + 4, by2 + 11, 2, 1); }
}

// ---- 圖示（沿用 dig 的 icon()，加一個 miner）----
function icon(kind, x, y) {
  if (kind === 'coin') { g.fillStyle = '#f2c230'; g.fillRect(x + 1, y, 4, 6); g.fillRect(x, y + 1, 6, 4); g.fillStyle = '#fff29a'; g.fillRect(x + 2, y + 1, 1, 3); }
  if (kind === 'drill') { g.fillStyle = '#bbb'; g.fillRect(x, y + 1, 5, 4); g.fillRect(x + 5, y + 2, 2, 2); g.fillRect(x + 7, y + 3, 1, 1); g.fillStyle = '#ffcf3a'; g.fillRect(x, y + 1, 2, 4); }
  if (kind === 'tank') { g.fillStyle = '#ff8a3a'; g.fillRect(x + 1, y, 5, 7); g.fillStyle = '#7a3a10'; g.fillRect(x + 2, y + 1, 3, 1); g.fillRect(x + 2, y + 3, 3, 1); }
  if (kind === 'bag') { g.fillStyle = '#c8a070'; g.fillRect(x + 2, y, 2, 1); g.fillRect(x, y + 1, 6, 5); g.fillStyle = '#8a6040'; g.fillRect(x + 1, y + 2, 4, 1); }
  if (kind === 'down') { g.fillStyle = '#9ee7ff'; g.fillRect(x + 2, y, 2, 4); g.fillRect(x, y + 3, 6, 1); g.fillRect(x + 1, y + 4, 4, 1); g.fillRect(x + 2, y + 5, 2, 1); }
  if (kind === 'miner') { g.fillStyle = '#ffcf3a'; g.fillRect(x + 2, y, 3, 2); g.fillStyle = '#f4e9d8'; g.fillRect(x + 1, y + 2, 5, 3); g.fillStyle = '#2a2230'; g.fillRect(x + 1, y + 5, 2, 3); g.fillRect(x + 4, y + 5, 2, 3); }
  if (kind === 'mute') { g.fillStyle = '#e8e0d4'; g.fillRect(x, y + 2, 2, 3); g.fillRect(x + 2, y + 1, 2, 5); g.fillRect(x + 4, y - 1, 1, 9); if (state.muted) { g.fillStyle = '#ff5050'; g.fillRect(x + 5, y - 1, 1, 9); } }
}

// ---- 商店按鈕（隨時可買，不需要人在門口；跟 dig 一樣的面板風格 + 買得起會脈動）----
// 鏡頭縮放改回跟 dig 一樣之後，直放手機的邏輯寬度會變得很窄（跟 dig 本體一樣窄）——
// 一排 4 顆放不下會被擠到畫面外面點不到，所以窄螢幕自動摺成 2x2，寬螢幕才排一整排。
function buttons() {
  const keys = ['miner', 'drill', 'tank', 'bag'];
  const bw = 38, bh = 26, gap = 3;
  const rowW = bw * 4 + gap * 3;
  if (W >= rowW + 6) {
    const x0 = (W - rowW) / 2 | 0, y = H - bh - 4;
    return keys.map((k, i) => ({ k, x: x0 + i * (bw + gap), y, w: bw, h: bh }));
  }
  const gridW = bw * 2 + gap, x0 = (W - gridW) / 2 | 0, y0 = H - bh * 2 - gap - 4;
  return keys.map((k, i) => ({ k, x: x0 + (i % 2) * (bw + gap), y: y0 + Math.floor(i / 2) * (bh + gap), w: bw, h: bh }));
}
function muteRect() { return { x: Math.max(2, W - 26), y: 4, w: 20, h: 20 }; }
function offlineRect() { if (!(state.pendingGold > 1 || state.pendingDepth > 0.1)) return null; return { x: 2, y: 54, w: Math.min(118, W - 4), h: 40 }; }
function buy(k) {
  const cost = { miner: minerCost, drill: drillCost, tank: tankCost, bag: bagCost }[k](state);
  if (state.gold < cost) { shake = Math.max(shake, 2); return; }
  state.gold -= cost;
  if (k === 'miner') { state.miners++; syncUnits(); } else if (k === 'drill') state.drillLv++; else if (k === 'tank') state.tankLv++; else state.bagLv++;
  sfx.up(); flash = Math.max(flash, 0.22);
  const b = buttons().find(b => b.k === k); if (b) for (let i = 0; i < 16; i++) parts.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vx: (Math.random() - .5) * 70, vy: (Math.random() - .5) * 70, life: .55, col: '#fff29a', screen: true });
  save();
}

// ---- 輸入 ----
function toLogic(cx, cy) { const r = cv.getBoundingClientRect(); return [(cx - r.left) / S, (cy - r.top) / S]; }
// 拖曳看別的地方：按住滑動鏡頭跟著手指走，放開一陣子沒動又自動彈回去跟拍最忙的那組礦工
let dragX = 0, dragY = 0, dragActive = null, dragIdle = 0;
cv.addEventListener('pointerdown', e => {
  audio(); const [lx, ly] = toLogic(e.clientX, e.clientY);
  const mb = muteRect(); if (lx >= mb.x && lx < mb.x + mb.w && ly >= mb.y && ly < mb.y + mb.h) { state.muted = !state.muted; save(); return; }
  const oc = offlineRect(); if (oc && lx >= oc.x && lx < oc.x + oc.w && ly >= oc.y && ly < oc.y + oc.h) { state.gold += state.pendingGold; state.pendingGold = 0; state.pendingDepth = 0; sfx.coin(0); save(); return; }
  for (const b of buttons()) if (lx >= b.x && lx < b.x + b.w && ly >= b.y && ly < b.y + b.h) { buy(b.k); return; }
  dragActive = { id: e.pointerId, lx, ly }; dragIdle = 0; cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  if (!dragActive || e.pointerId !== dragActive.id) return;
  const [lx, ly] = toLogic(e.clientX, e.clientY);
  dragX += lx - dragActive.lx; dragY += ly - dragActive.ly;
  dragActive.lx = lx; dragActive.ly = ly; dragIdle = 0;
});
const endDrag = e => { if (dragActive && e.pointerId === dragActive.id) dragActive = null; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

// ---- HUD ----
function drawHud(now) {
  g.fillStyle = '#000a'; g.fillRect(2, 2, 96, 40);
  icon('coin', 6, 5); txt(fmt(state.gold), 16, 6, '#fff29a');
  icon('down', 6, 16); const dm = Math.floor(state.depth) + 'm'; txt(dm, 16, 17, '#9ee7ff');
  icon('miner', 6, 27); txt(Math.min(state.miners, 999), 16, 28, '#f4e9d8');
  const extra = state.miners - DRAWN_CAP; if (extra > 0) txt('+' + extra, 46, 28, '#8a8090');
  txt(layerOf(state.depth).name, 2, 44, '#c9c9d8');

  for (const b of buttons()) {
    const cost = { miner: minerCost, drill: drillCost, tank: tankCost, bag: bagCost }[b.k](state);
    const ok = state.gold >= cost;
    g.fillStyle = ok ? '#2e5a2a' : '#2a2030'; g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = ok ? ((now / 300 | 0) % 2 ? '#8fff7a' : '#4c9a3c') : '#554';
    g.fillRect(b.x, b.y, b.w, 1); g.fillRect(b.x, b.y + b.h - 1, b.w, 1); g.fillRect(b.x, b.y, 1, b.h); g.fillRect(b.x + b.w - 1, b.y, 1, b.h);
    icon(b.k, b.x + 4, b.y + 4);
    icon('coin', b.x + 4, b.y + 15); txt(fmt(cost), b.x + 12, b.y + 16, ok ? '#fff29a' : '#886');
    const lvTxt = b.k === 'miner' ? 'x' + state.miners : 'Lv' + ({ drill: state.drillLv, tank: state.tankLv, bag: state.bagLv }[b.k]);
    txt(lvTxt, b.x + 20, b.y + 4, '#e8e0d4');
  }
  icon('mute', muteRect().x + 3, muteRect().y + 5);

  const oc = offlineRect();
  if (oc) {
    g.fillStyle = 'rgba(20,15,10,.92)'; g.fillRect(oc.x, oc.y, oc.w, oc.h);
    g.fillStyle = (now / 260 | 0) % 2 ? '#ffd76a' : '#c9a24a'; g.fillRect(oc.x, oc.y, oc.w, 1); g.fillRect(oc.x, oc.y + oc.h - 1, oc.w, 1); g.fillRect(oc.x, oc.y, 1, oc.h); g.fillRect(oc.x + oc.w - 1, oc.y, 1, oc.h);
    txt('你不在時', oc.x + 6, oc.y + 3, '#f4e9d8');
    icon('coin', oc.x + 6, oc.y + 13); txt('+' + fmt(state.pendingGold), oc.x + 14, oc.y + 14, '#fff29a');
    icon('down', oc.x + 6, oc.y + 23); txt('+' + Math.floor(state.pendingDepth) + 'm', oc.x + 14, oc.y + 24, '#9ee7ff');
    txt('點收下', oc.x + 6, oc.y + 33, '#8fff7a');
  }
  if (newIcon) {
    const a = Math.min(1, newIcon.life * 2), sc = 3 + (1 - Math.min(1, (2.0 - newIcon.life) * 4)) * 3;
    g.globalAlpha = a; const x = W / 2 - T * sc / 2, y = 46;
    g.fillStyle = '#000a'; g.fillRect(x - 6, y - 6, T * sc + 12, T * sc + 12);
    g.drawImage(tex(newIcon.id, 0, 0), x, y, T * sc, T * sc);
    g.fillStyle = '#ffe27a'; g.fillRect(x + T * sc + 2, y - 4, 3, 8); g.fillRect(x + T * sc + 2, y + 6, 3, 3);
    g.globalAlpha = 1;
  }
  if (flash > 0) { g.globalAlpha = Math.min(1, flash); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
}

// ---- 主渲染 ----
let camX = WW * T / 2, camY = -H * .6, runTimeCam = 0;
let camGroupIdx = 0, camHoldT = 0;
// 跟拍鏡頭：不縮圖看全景（格子大小跟 dig 一樣），改成鏡頭跟著「目前最多人真的在敲」的那一組礦工，
// 那組沒人在敲就撐幾秒再輪下一組——一次只看一組（最多 4 個礦工），但那組全部同時在畫面裡。
function pickCamGroup(dt) {
  const ag = Math.max(1, Math.min(4, Math.ceil(Math.min(state.miners, 16) / 4)));
  const active = []; for (let i = 0; i < ag; i++) active.push(i);
  let bestI = -1, bestScore = -1;
  for (const i of active) { const score = units.filter(u => Math.floor(u.id / 4) === i && u.dig).length; if (score > bestScore) { bestScore = score; bestI = i; } }
  camHoldT -= dt;
  if (bestScore > 0 && bestI !== camGroupIdx) { camGroupIdx = bestI; camHoldT = 6; }
  else if (bestScore <= 0 && camHoldT <= 0) { const p = active.indexOf(camGroupIdx); camGroupIdx = active[(p + 1 >= 0 ? p + 1 : 0) % active.length]; camHoldT = 6; }
  if (!active.includes(camGroupIdx)) camGroupIdx = active[0];
  return camGroupIdx;
}
function render(now, dt) {
  dt = dt || 0.016;
  g.fillStyle = '#0a0710'; g.fillRect(0, 0, W, H);
  runTimeCam += dt;
  const gi = pickCamGroup(dt);
  const groupUnits = units.filter(u => Math.floor(u.id / 4) === gi);
  let sx0 = 0, sy0 = 0, cnt = 0;
  for (const u of groupUnits) if (u.mode !== 'shop') { sx0 += u.fx; sy0 += u.fy; cnt++; }
  if (cnt === 0) for (const u of groupUnits) { sx0 += u.fx; sy0 += u.fy; cnt++; }
  let focusX = cnt ? sx0 / cnt : (GROUPS[gi][0] + 1.5), focusY = cnt ? sy0 / cnt : -1;
  // 跟拍「正在挖」的那一個，不是整組平均（平均會落在回程的人和挖的人中間，兩個都拍不到）
  const diggers = units.filter(u => u.mode === 'dig').sort((a, b) => b.fy - a.fy);
  if (diggers.length) { const d = diggers[Math.floor(runTimeCam / 8) % diggers.length]; focusX = d.fx; focusY = d.fy; }

  // 跟拍的礦工放在畫面偏下方（不是正中央）——上面留的空間才不會被 HUD 面板蓋住正在挖的人
  const targetCamX = focusX * T + 5, targetCamY = focusY * T + 5 - H * 0.42;
  // 深度一次跳很遠（離開很久回來、或剛雇到新的一組）時直接瞬移過去，不要用慢慢滑的——
  // 不然玩家剛打開頁面那一刻，鏡頭還停在舊位置的空地，畫面是黑的、看起來像沒人在做事。
  if (Math.abs(targetCamY - camY) > H * 2.5 || Math.abs(targetCamX - camX) > W * 2.5) { camX = targetCamX; camY = targetCamY; }
  else { const lerp = Math.min(1, dt * 3); camX += (targetCamX - camX) * lerp; camY += (targetCamY - camY) * lerp; }

  // 拖曳自己看別的地方：一陣子沒動手就慢慢彈回跟拍
  dragIdle += dt;
  if (!dragActive && dragIdle > 2.2) { const f = Math.max(0, 1 - dt * 1.6); dragX *= f; dragY *= f; if (Math.abs(dragX) < 0.4) dragX = 0; if (Math.abs(dragY) < 0.4) dragY = 0; }

  const offX = Math.round(W / 2 - camX + dragX);
  shake = Math.max(0, shake - dt * 14);
  const sx = Math.round((Math.random() - .5) * shake), sy = Math.round((Math.random() - .5) * shake);
  const cy = Math.round(camY - dragY);
  ensureGenerated(Math.max(0, Math.floor((cy + H) / T)) + 4);

  g.save(); g.translate(offX + sx, -cy + sy);
  if (cy < 0) drawSky(offX, sx, sy);
  const y0 = Math.max(0, Math.floor(cy / T) - 1), y1 = Math.floor((cy + H) / T) + 1;
  for (let y = y0; y <= y1; y++) {
    ensureGenerated(y);
    const L = layerOf(y);
    for (let x = 0; x < WW; x++) {
      const id = map[y][x];
      if (id === 0) { g.fillStyle = shade(L.dark, -55); g.fillRect(x * T, y * T, T, T); }
      else g.drawImage(tex(id, y, x), x * T, y * T);
    }
  }
  // 每個礦工自己在挖的那格：裂痕
  for (const u of units) {
    if (!u.dig) continue;
    const d = u.dig, n = Math.floor(d.p * 5); g.fillStyle = '#000';
    const cx2 = d.tx * T, cyy = d.ty * T;
    const cracks = [[4, 4], [5, 5], [3, 6], [6, 3], [2, 2], [7, 7], [5, 2], [2, 7], [8, 4], [1, 5]];
    for (let i = 0; i < n * 2; i++) g.fillRect(cx2 + cracks[i][0], cyy + cracks[i][1], 1, 1);
  }
  for (const u of units) drawMinerSprite(u, now);
  for (const p of parts) if (!p.screen) { g.fillStyle = p.col; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
  g.restore();

  // 黑暗與每個礦工自己的頭燈
  if (cy + H > 0) {
    dg.globalCompositeOperation = 'source-over'; dg.clearRect(0, 0, W, H);
    // 跟 dig 完全一樣的黑暗公式（用鏡頭現在跟拍的深度算，不是額外自己壓暗）
    const depthF = Math.max(0, Math.min(1, focusY / 182));
    const darkA = Math.min(0.97, 0.35 + depthF * 1.2);
    dg.fillStyle = `rgba(4,2,8,${darkA})`; dg.fillRect(0, Math.max(0, -cy), W, H);
    dg.globalCompositeOperation = 'destination-out';
    const light = (x, y, r, a) => { const gr = dg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); dg.fillStyle = gr; dg.fillRect(x - r, y - r, r * 2, r * 2); };
    const R = 70 - depthF * 30 + Math.min(state.drillLv, 10) * 4;
    for (const u of units) { if (u.mode === 'shop') continue; light(u.fx * T + 5 + offX + sx, u.fy * T + 5 - cy + sy, R, 1); }
    for (let y = y0; y <= y1; y++) for (let x = 0; x < WW; x++) { const id = map[y][x]; if (id === 21 || id === 22 || id === 23 || id === 15) light(x * T + 5 + offX, y * T + 5 - cy, id === 23 ? 60 : 22 + Math.sin(now / 330 + x + y) * 3, .85); }
    g.drawImage(dark, 0, 0);
    g.globalCompositeOperation = 'lighter';
    for (let y = y0; y <= y1; y++) for (let x = 0; x < WW; x++) { const id = map[y][x]; if (id === 21 || id === 22 || id === 23) { g.globalAlpha = .25 + Math.sin(now / 330 + x * 2 + y) * .1; g.fillStyle = ORECOL[id][0]; g.fillRect(x * T + offX - 2, y * T - cy - 2, T + 4, T + 4); } }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  for (const p of pops) { const w = txtW(p.txt); const x = Math.round(p.x + offX - w / 2), y = Math.round(p.y - cy - (1 - p.life) * 14); txt(p.txt, x + 1, y + 1, '#000'); txt(p.txt, x, y, p.col); }
  for (const p of parts) if (p.screen) { g.fillStyle = p.col; g.fillRect(p.x | 0, p.y | 0, 1, 1); }
  drawHud(now);
}

// ---- 主迴圈 ----
let last = performance.now(), uiCounter = 0;
function frame(now) {
  const dtMs = Math.max(0, now - last); last = now; const dtS = dtMs / 1000;
  if (dtS > AWAY_THRESHOLD) { tickAway(dtS); bulkCatchUp(); }
  else if (dtS > 0) { for (const u of units) unitTick(u, dtS); bulkCatchUp(); measureRates(dtS); }
  for (const p of parts) { p.x += p.vx * dtS; p.y += p.vy * dtS; p.vy += (p.screen ? 0 : 150) * dtS; p.life -= dtS; }
  parts = parts.filter(p => p.life > 0); if (parts.length > 500) parts.splice(0, parts.length - 500);
  for (const p of pops) p.life -= dtS * 1.2; pops = pops.filter(p => p.life > 0);
  if (newIcon) { newIcon.life -= dtS; if (newIcon.life <= 0) newIcon = null; }
  flash = Math.max(0, flash - dtS * 2);
  render(now, dtS);
  uiCounter++; if (uiCounter % 30 === 0) save();
  requestAnimationFrame(frame);
}

// ---- 開頁補算離開這段時間（只補經濟，不逐格模擬移動）----
syncUnits();
(function initOffline() {
  const gap = (Date.now() - state.lastTs) / 1000;
  if (gap > AWAY_THRESHOLD) tickAway(gap);
  bulkCatchUp();
  save();
})();

let autosaveOn = true;
// 每 20 秒量一次真實的收入與下挖速度（平滑），給定價與離線用
let rateT = 0, rateGold0 = null, rateDepth0 = null, earned = 0;
function measureRates(dt) {
  rateT += dt; if (rateGold0 === null) { rateGold0 = earned; rateDepth0 = state.depth; }
  if (rateT >= 20) {
    const gps = (earned - rateGold0) / rateT, dps = (state.depth - rateDepth0) / rateT;
    state.goldPS = state.goldPS ? state.goldPS * 0.6 + gps * 0.4 : gps;
    state.depthPS = state.depthPS ? state.depthPS * 0.6 + dps * 0.4 : dps;
    rateT = 0; rateGold0 = earned; rateDepth0 = state.depth;
  }
}
setInterval(() => { if (autosaveOn) save(); }, 5000);
document.addEventListener('visibilitychange', () => { if (autosaveOn && document.hidden) save(); });
window.addEventListener('pagehide', () => { if (autosaveOn) save(); });

resize(); addEventListener('resize', resize);
requestAnimationFrame(frame);

// ---- 測試掛鉤 ----
window.__idle = {
  skip(seconds) { tickAway(seconds); state.gold += state.pendingGold; state.pendingGold = 0; state.pendingDepth = 0; bulkCatchUp(); save(); render(performance.now()); },
  rates() { return { goldPS: state.goldPS, depthPS: state.depthPS, depth: state.depth, gold: state.gold }; },
  rewindSave(seconds) {
    try { const raw = localStorage.getItem(SKEY); const s = raw ? JSON.parse(raw) : state; s.lastTs = Date.now() - seconds * 1000; localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {}
  },
  state() { return JSON.parse(JSON.stringify(state)); },
  costs() { return { miner: minerCost(state), drill: drillCost(state), tank: tankCost(state), bag: bagCost(state) }; },
  buyCheapest() {
    const c = this.costs();
    const opts = Object.entries(c).sort((a, b) => a[1] - b[1]);
    for (const [k, cost] of opts) if (state.gold >= cost) { buy(k); return { bought: k, cost }; }
    return null;
  },
  setAutosave(v) { autosaveOn = !!v; },
  clearedRow() { return clearedRow; },
  unitsInfo() { return units.map(u => ({ x: u.x, y: u.y, mode: u.mode, cargo: u.cargo.length })); },
};
