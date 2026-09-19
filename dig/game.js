// 挖：側視剖面挖礦原型
'use strict';
const cv = document.getElementById('c'), g = cv.getContext('2d');
const uc = document.getElementById('ui'), ug = uc.getContext('2d');
const T = 10, WW = 28, DEPTH = 460, SKY = 8, EX = 10; // EX = 電梯井所在的直行
let W = 280, H = 130, S = 3;
function resize() {
  S = Math.max(1, Math.floor(innerHeight / 130));
  W = Math.floor(innerWidth / S); H = Math.floor(innerHeight / S);
  cv.width = W; cv.height = H;
  cv.style.width = W * S + 'px'; cv.style.height = H * S + 'px';
  const lx = ((innerWidth - W * S) / 2 | 0) + 'px', ty = ((innerHeight - H * S) / 2 | 0) + 'px';
  cv.style.left = lx; cv.style.top = ty;
  uc.width = W * S; uc.height = H * S; uc.style.width = W * S + 'px'; uc.style.height = H * S + 'px';
  uc.style.left = lx; uc.style.top = ty;
  dark.width = W; dark.height = H; g.imageSmoothingEnabled = false;
}
const dark = document.createElement('canvas'), dg = dark.getContext('2d');

// ---- 中文字（畫在上層的高解析畫布，不做成圖示密碼）----
const FF = '"PingFang TC","Heiti TC","Microsoft JhengHei",sans-serif';
function L(s, x, y, col, size, align) { // x,y 是邏輯座標；size 是實際像素
  ug.font = (size || Math.round(3.4 * S)) + 'px ' + FF;
  ug.textAlign = align || 'left'; ug.textBaseline = 'top';
  ug.lineWidth = Math.max(2, S * .8); ug.strokeStyle = 'rgba(0,0,0,.85)';
  ug.strokeText(s, x * S, y * S); ug.fillStyle = col; ug.fillText(s, x * S, y * S);
}

// ---- 亂數 ----
let seed = 12345;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function hash(x, y) { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h ^ (h >>> 16)) / 4294967296; }

// ---- 格子種類 ----
// 0空 1土 2硬岩 3不可破 4封岩 10銅 11鐵 12銀 13金 15星砂 20化石 21晶簇 22遺物 23地心
const VAL = { 10: 9, 11: 18, 12: 28, 13: 40, 15: 50, 20: 300, 21: 130, 22: 700 };
const ONAME = { 10: '銅', 11: '鐵', 12: '銀', 13: '金', 15: '星砂', 20: '化石', 21: '晶簇', 22: '遺物', 23: '地心' };
const ORECOL = { 10: ['#d9803a', '#f4b067'], 11: ['#a9a9b8', '#e4e4ee'], 12: ['#c6d8e8', '#ffffff'], 13: ['#f2c230', '#fff29a'],
  15: ['#6cf2ff', '#e8ffff'], 20: ['#e8dcc0', '#fff8e4'], 21: ['#7dff9c', '#e6ffe8'], 22: ['#c77dff', '#f4ddff'], 23: ['#ffffff', '#ffe27a'] };
const SMELT = 2.6; // 煉過之後的倍率

// 三個地層：[起始深度, 名稱, 暗色, 亮色]
const ZONES = [[0, '表土層', '#6b4226', '#8a5a34'], [150, '岩盤層', '#3f4750', '#5b6670'], [310, '深淵層', '#2d1b3f', '#452b5e']];
function zoneOf(y) { let z = ZONES[0]; for (const Z of ZONES) if (y >= Z[0]) z = Z; return z; }
// 硬度隨深度上升
const HBAND = [[40, 1], [90, 1.9], [150, 3.2], [200, 4.6], [260, 6.4], [310, 8.6], [370, 12], [420, 16], [460, 21]];
function hardAt(y) { for (const b of HBAND) if (y < b[0]) return b[1]; return 21; }
// 封岩：整層擋死，要對應階級的鎬才挖得動
const BARRIER = [[90, 1], [150, 2], [250, 3], [340, 4]];

let map, barrierLv;
function gen() {
  map = []; for (let y = 0; y < DEPTH; y++) { const r = new Uint8Array(WW); r.fill(1); map.push(r); }
  for (let y = 0; y < DEPTH; y++) { map[y][0] = 3; map[y][WW - 1] = 3; }
  for (let x = 0; x < WW; x++) map[DEPTH - 1][x] = 3;
  const put = (id, y0, y1, n) => { for (let i = 0; i < n; i++) { const y = y0 + (rnd() * (y1 - y0)) | 0, x = 1 + (rnd() * (WW - 2)) | 0; if (y > 1 && y < DEPTH - 8) map[y][x] = id; } };
  // 深層是「量多」不是只有單價高（design/DIG_COST_MODEL.md 第二輪 S3）
  put(10, 2, 150, 560); put(11, 60, 250, 560); put(12, 150, 340, 700); put(13, 250, 420, 860); put(15, 330, 452, 1150);
  put(22, 380, 450, 8);
  // 硬岩點綴
  for (let i = 0; i < 1100; i++) { const y = 3 + (rnd() * (DEPTH - 12)) | 0, x = 1 + (rnd() * (WW - 2)) | 0; if (map[y][x] === 1) map[y][x] = 2; }
  // 洞穴
  for (let c = 0; c < 62; c++) {
    let x = 3 + rnd() * (WW - 6), y = 12 + rnd() * (DEPTH - 30), len = 20 + rnd() * 50;
    for (let i = 0; i < len; i++) {
      x += rnd() * 2 - 1; y += rnd() * 1.4 - 0.7; const r = rnd() < 0.3 ? 2 : 1;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const yy = (y + dy) | 0, xx = (x + dx) | 0; if (yy > 6 && yy < DEPTH - 8 && xx > 0 && xx < WW - 1) map[yy][xx] = 0; }
    }
  }
  // 洞頂晶簇
  for (let y = 150; y < DEPTH - 8; y++) for (let x = 1; x < WW - 1; x++) if (map[y][x] === 0 && map[y - 1][x] > 0 && map[y - 1][x] < 3 && rnd() < 0.05) map[y - 1][x] = 21;
  // 化石骨架
  const skel = ['..XXX.X', 'XXXXXXX', '.X.X.X.'];
  for (const dy0 of [70, 190, 300, 400]) { const x0 = 3 + (rnd() * (WW - 11)) | 0; skel.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') map[dy0 + j][x0 + i] = 20; })); }
  // 封岩層（整行封死）
  barrierLv = {};
  for (const [by, lv] of BARRIER) { for (let x = 1; x < WW - 1; x++) map[by][x] = 4; barrierLv[by] = lv; }
  // 地心房
  for (let y = DEPTH - 7; y < DEPTH - 1; y++) for (let x = 1; x < WW - 1; x++) map[y][x] = (y === DEPTH - 7) ? 2 : 0;
  for (let x = 1; x < WW - 1; x++) map[DEPTH - 2][x] = 3;
  map[DEPTH - 3][WW >> 1] = 23;
  for (let x = 1; x < WW - 1; x++) if (map[0][x] > 9) map[0][x] = 1;
  for (let x = 2; x <= 8; x++) map[0][x] = 3; // 商店前水泥地
}
function tile(x, y) { if (x < 1 || x >= WW - 1 || y >= DEPTH) return 3; if (y < 0) return 0; return map[y][x]; }
function hardOf(id, y) {
  if (id === 3) return 999;
  if (id === 23) return 40;
  if (id === 4) return PICK[barrierLv[y] || 4] * 2.0;
  let h = hardAt(y) * (id === 2 ? 1.8 : 1);
  if (id >= 10) h *= 1.15; return h;
}
function canDig(id, y) { return id !== 3 && hardOf(id, y) <= effPick() * 2.2; }

// ---- 升級 ----
const PICK = [1.5, 3.2, 6.5, 13, 26];
const TANK = [45, 80, 130, 200, 300];
const BAG = [6, 10, 16, 24, 36];
const FURN = [[2, 1], [3, 1.35], [4, 1.8], [6, 2.4], [8, 3.2]]; // [同時煉幾顆, 速度]
const ELEV = [0, 110, 220, 340, 460];                            // 電梯服務深度上限（0 = 還沒蓋）
const SMELT_BASE = 13; // 一顆礦的基礎煉製秒數
// 每一階的價錢對著「那一段深度真的挖得出多少錢」定：
// 0–90 約 1.2 萬、90–150 約 1.4 萬、150–250 約 4 萬、250–340 約 7 萬、340–460 約 12 萬
const COST = {
  pick: [400, 2200, 8000, 20000],
  tank: [250, 1000, 3500, 11000],
  bag: [300, 1200, 4200, 13000],
  furnace: [200, 900, 3000, 9000],
  elev: [500, 2600, 9000, 26000],
};
const UPNAME = { pick: '鎬子', tank: '油箱', bag: '背包', furnace: '熔爐', elev: '電梯' };
const UPDESC = { pick: '挖得動更硬的岩', tank: '一趟待更久', bag: '一趟裝更多', furnace: '煉得更快更多', elev: '上得來的深度' };
const QCAP = 40; // 熔爐排隊上限
// 材料礦：不進熔爐，可以整批賣掉，也可以留著做東西
const MAT = { 15: 1, 20: 1, 21: 1, 22: 1 };
const MATSELL = 1.6; // 材料生賣的倍率（比煉過的礦差，所以留著做東西才划算）
const CRAFT = [
  { k: 'bit', name: '鑽頭強化片', desc: '挖速 +12%（跟鎬子搶錢）', max: 3, cost: 600, need: { 21: 3, 15: 8 } },
  { k: 'beam', name: '電梯延伸樑', desc: '電梯再深 80 公尺', max: 3, cost: 1500, need: { 20: 1, 15: 14 } },
  { k: 'sack', name: '擴充背袋', desc: '背包 +4 格', max: 3, cost: 900, need: { 21: 2, 15: 10 } },
];
// 預留給下一輪（今天不做）：探測器與埋藏寶藏
const CRAFT_SOON = [{ k: 'probe', name: '探測器', desc: '指出埋藏寶藏的方位（下一輪）', need: { 22: 1, 15: 20 } }];
const FINDS = { 20: '化石：古生物的骨架，做電梯樑用', 21: '晶簇：洞頂長出來的結晶', 22: '遺物：誰留在這麼深的地方的？',
  10: '銅：最淺的那一層到處都是', 11: '鐵：硬一點，也值錢一點', 12: '銀：岩盤層開始變多', 13: '金：深到看不見天的地方',
  15: '星砂：深淵層的主食，量多、做東西都靠它', 23: '地心：這座礦的底' };
function effPick() { return PICK[st.lv.pick] * (1 + 0.12 * (st.craft.bit || 0)); }
function effBag() { return BAG[st.lv.bag] + 4 * (st.craft.sack || 0); }
function effElevCap() { return ELEV[st.lv.elev] > 0 ? ELEV[st.lv.elev] + 40 * (st.craft.beam || 0) : 0; }

let st;
function reset(keepSeed) {
  if (!keepSeed) seed = (Math.random() * 1e9) | 0;
  gen();
  st = { x: 5, y: -1, fx: 5, fy: -1, lv: { pick: 0, tank: 0, bag: 0, furnace: 0, elev: 0 },
    fuel: TANK[0], money: 0, cargo: [], q: [], dig: null, move: null, t: 0, maxDepth: 0, seen: {},
    won: false, wonT: 0, dead: 0, face: 1, runs: 0, ride: 0, rideT: 0, note: null, noteT: 0, buys: [], seed,
    mat: {}, craft: {}, matGot: 0, matSold: 0, matUsed: 0, treasure: [], found: {}, qsort: 0, liftMenu: null, rideTo: -1, panel: null };
  camY = -H * .6; sellT = 0;
}

// ---- 聲音 ----
let ac = null;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); }
let noiseBuf = null;
function noise(dur, freq, vol, q) {
  if (!ac) return; if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
  const gn = ac.createGain(); const t = ac.currentTime; gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(gn); gn.connect(ac.destination); s.start(t); s.stop(t + dur);
}
function tone(freq, dur, vol, type, when, slide) {
  if (!ac) return; const t = ac.currentTime + (when || 0); const o = ac.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  const gn = ac.createGain(); gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  chip: h => { noise(0.05, 900 - Math.min(h, 20) * 25 + Math.random() * 300, 0.18, 2); tone(90 + Math.random() * 30, 0.04, 0.05, 'square'); },
  brk: h => { noise(0.18, 300 + Math.random() * 200, 0.35, 0.7); tone(120 - Math.min(h, 15) * 4, 0.15, 0.15, 'triangle', 0, 40); },
  ore: v => { const b = 500 + Math.min(v, 600) * 1.2; tone(b, 0.12, 0.08, 'square'); tone(b * 1.5, 0.2, 0.07, 'square', 0.07); },
  clank: () => { tone(1400, 0.06, 0.08, 'square'); tone(1900, 0.1, 0.05, 'triangle', 0.02); },
  coin: i => tone(900 + i * 70, 0.06, 0.06, 'square', i * 0.045),
  up: () => [0, 4, 7, 12].forEach((n, i) => tone(440 * 2 ** (n / 12), 0.12, 0.08, 'square', i * 0.07)),
  newf: () => [0, 7, 12, 16, 19].forEach((n, i) => tone(330 * 2 ** (n / 12), 0.18, 0.07, 'triangle', i * 0.08)),
  full: () => tone(200, 0.2, 0.1, 'sawtooth', 0, 120),
  dead: () => tone(400, 0.8, 0.12, 'sawtooth', 0, 40),
  land: () => noise(0.08, 200, 0.2, 0.8),
  lift: () => { noise(0.5, 260, 0.12, 0.8); [0, 4, 7, 12, 16].forEach((n, i) => tone(220 * 2 ** (n / 12), 0.3, 0.07, 'sine', i * 0.08, 440 * 2 ** (n / 12))); },
  smelt: () => { tone(300, 0.25, 0.05, 'triangle', 0, 600); noise(0.2, 700, 0.05, 1); },
};

// ---- 特效 ----
let parts = [], pops = [], shake = 0, flash = 0, newIcon = null;
function burst(x, y, col, n, sp) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * sp, vy: -Math.random() * sp * 0.8, life: 0.4 + Math.random() * 0.5, col }); }
function pop(x, y, txt, col) { pops.push({ x, y, txt, col, life: 1 }); }
function note(s) { st.note = s; st.noteT = 2.2; }

// ---- 迷你像素字（數字）----
const FONT = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  '$': '011110010011110', '+': '000010111010000', '-': '000000111000000', 'm': '000000111111101', '/': '001001010100100', 'x': '000101010101000', ':': '000010000010000' };
function txt(s, x, y, col, sc) {
  sc = sc || 1; g.fillStyle = col; s = String(s);
  for (let i = 0; i < s.length; i++) { const f = FONT[s[i]]; if (f) for (let j = 0; j < 15; j++) if (f[j] === '1') g.fillRect(x + (j % 3) * sc, y + ((j / 3) | 0) * sc, sc, sc); x += 4 * sc; }
}
function txtW(s, sc) { return String(s).length * 4 * (sc || 1) - (sc || 1); }

// ---- 輸入 ----
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true; audio();
  if (e.code === 'Escape' || e.code === 'KeyQ') { closePanel(); return; }
  const k = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
  if (k >= 0) { if (onSurface() && st.panel !== 'shop') st.panel = 'shop'; buy(['pick', 'tank', 'bag', 'furnace', 'elev'][k]); }
  if (st.liftMenu) {
    const m = st.liftMenu;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') { m.sel = Math.max(0, m.sel - 1); sfx.clank(); e.preventDefault(); return; }
    if (e.code === 'KeyS' || e.code === 'ArrowDown') { m.sel = Math.min(m.stops.length - 1, m.sel + 1); sfx.clank(); e.preventDefault(); return; }
    if (e.code === 'Escape' || e.code === 'KeyQ') { st.liftMenu = null; return; }
  }
  if (e.code === 'KeyE') rideElevator();
  if (e.code === 'KeyF') { if (onSurface() && st.panel !== 'furnace') st.panel = 'furnace'; cycleQSort(); }
  const ck = ['KeyZ', 'KeyX', 'KeyC'].indexOf(e.code); if (ck >= 0) { if (onSurface() && st.panel !== 'craft') st.panel = 'craft'; craft(ck); }
  if (e.code === 'KeyV') { if (onSurface() && st.panel !== 'craft') st.panel = 'craft'; sellMats(); }
  if (e.code === 'KeyL' || e.code === 'Tab') { listOpen = !listOpen; e.preventDefault(); }
  if (st.won && e.code === 'Space') { wipe(); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
let stick = null;
function toLogic(cx, cy) { const r = cv.getBoundingClientRect(); return [(cx - r.left) / S, (cy - r.top) / S]; }
cv.addEventListener('pointerdown', e => {
  audio(); const [lx, ly] = toLogic(e.clientX, e.clientY);
  if (st.won) { if (st.wonT > 1.5) wipe(); return; }
  const fbb = facButton(); if (fbb && lx >= fbb.x && lx < fbb.x + fbb.w && ly >= fbb.y && ly < fbb.y + fbb.h) { openPanel(fbb.f.k); return; }
  if (st.liftMenu) {
    for (const r of liftMenuRows()) if (lx >= r.x && lx < r.x + r.w && ly >= r.y && ly < r.y + r.h) { liftGo(r.y0); return; }
    st.liftMenu = null; return;
  }
  if (st.panel) { // 面板開著：點到按鈕以外的地方就關掉
    const hit = [...buttons(), ...craftButtons(), qsortButton(), wipeButton()].filter(Boolean)
      .some(b => lx >= b.x && lx < b.x + b.w && ly >= b.y && ly < b.y + b.h);
    if (!hit) { closePanel(); return; }
  }
  const qb = qsortButton(); if (qb && lx >= qb.x && lx < qb.x + qb.w && ly >= qb.y && ly < qb.y + qb.h) { cycleQSort(); return; }
  const eb = liftButton(); if (eb && lx >= eb.x && lx < eb.x + eb.w && ly >= eb.y && ly < eb.y + eb.h) { rideElevator(); return; }
  const wb = wipeButton(); if (wb && lx >= wb.x && lx < wb.x + wb.w && ly >= wb.y && ly < wb.y + wb.h) { askWipe(); return; }
  const lb = listButton(); if (lb && lx >= lb.x && lx < lb.x + lb.w && ly >= lb.y && ly < lb.y + lb.h) { listOpen = !listOpen; return; }
  if (listOpen) { listOpen = false; return; }
  for (const b of buttons()) if (lx >= b.x && lx < b.x + b.w && ly >= b.y && ly < b.y + b.h) { buy(b.k); return; }
  for (const b of craftButtons()) if (lx >= b.x && lx < b.x + b.w && ly >= b.y && ly < b.y + b.h) { if (b.sell) sellMats(); else craft(b.c); return; }
  if (st.liftMenu || st.panel) return;
  if (e.pointerType !== 'mouse' || lx < W / 2) { stick = { id: e.pointerId, ox: lx, oy: ly, dx: 0, dy: 0 }; cv.setPointerCapture(e.pointerId); }
});
cv.addEventListener('pointermove', e => { if (stick && e.pointerId === stick.id) { const [lx, ly] = toLogic(e.clientX, e.clientY); stick.dx = lx - stick.ox; stick.dy = ly - stick.oy; } });
const endStick = e => { if (stick && e.pointerId === stick.id) stick = null; };
cv.addEventListener('pointerup', endStick); cv.addEventListener('pointercancel', endStick);
function inputDir() {
  if (st.ride > 0 || st.panel || st.liftMenu) return [0, 0];
  let dx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let dy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp || keys.Space ? 1 : 0);
  if (stick) { const m = Math.hypot(stick.dx, stick.dy); if (m > 6) { const ax = Math.abs(stick.dx), ay = Math.abs(stick.dy); dx = ax > ay * 0.5 ? Math.sign(stick.dx) : 0; dy = ay > ax * 0.5 ? Math.sign(stick.dy) : 0; } }
  return [dx, dy];
}

// ---- 電梯 ----
const LIFT_RANGE = 4; // 水平幾格以內可以搭
function servedDepth() { // 從地表往下、EX 這一行連續為空的最深一格，再跟等級上限取小
  const cap = effElevCap(); if (cap <= 0) return -1;
  let y = 0; while (y < DEPTH && y <= cap && map[y][EX] === 0) y++;
  return y - 1;
}
function liftState() {
  const lv = st.lv.elev, cap = effElevCap(), served = servedDepth();
  let reason = '';
  if (lv === 0) reason = '還沒蓋電梯';
  else if (st.y <= -1) reason = '你已經在地面';
  else if (Math.abs(st.x - EX) > LIFT_RANGE) reason = '離電梯井太遠（要在 4 格內）';
  else if (st.y > cap) reason = '超出電梯深度（去升級電梯）';
  else if (st.y > served) reason = '電梯井還沒挖通（回去把直井挖穿）';
  return { lv, maxDepth: cap, served, reason, ok: reason === '' };
}
// 電梯停靠站：地層交界、封岩層、最深已挖通處（只留服務範圍內的）
function liftStops() {
  const served = servedDepth(); if (served < 0) return [];
  const raw = [0];
  for (const Z of ZONES) raw.push(Z[0]);
  for (const [by] of BARRIER) raw.push(by + 1);
  raw.push(served);
  const out = [];
  for (const y of raw) if (y >= 0 && y <= served && map[y][EX] === 0 && !out.includes(y)) out.push(y);
  out.sort((a, b) => a - b);
  return out;
}
function openLift() {
  const stops = liftStops();
  if (st.lv.elev === 0) { sfx.clank(); note('還沒蓋電梯'); return; }
  if (!stops.length) { sfx.clank(); note('電梯井還沒挖通（回去把直井挖穿）'); return; }
  if (st.y > -1 && Math.abs(st.x - EX) > LIFT_RANGE) { sfx.clank(); note('離電梯井太遠（要在 4 格內）'); return; }
  let sel = stops.length - 1;
  for (let i = 0; i < stops.length; i++) if (stops[i] >= Math.max(0, st.y)) { sel = i; break; }
  st.liftMenu = { sel, stops };
  audio(); sfx.clank();
}
function liftGo(y) {
  st.liftMenu = null;
  if (st.won || st.dead > 0 || st.ride > 0) return;
  st.ride = 1; st.rideT = 0; st.rideTo = y; st.move = null; st.dig = null; audio(); sfx.lift(); save();
}
function rideElevator() { // E：地下且能搭 → 直接上地面；其餘情況開樓層選單（可上可下）
  if (st.won || st.dead > 0 || st.ride > 0) return;
  if (st.liftMenu) { liftGo(st.liftMenu.stops[st.liftMenu.sel]); return; }
  const s = liftState();
  if (s.ok) { st.ride = 1; st.rideT = 0; st.rideTo = -1; st.move = null; st.dig = null; audio(); sfx.lift(); save(); return; }
  if (st.y <= -1) { openLift(); return; }          // 在地面：選要下到哪一層
  if (st.lv.elev > 0 && liftStops().length) { openLift(); return; } // 在地下但超深/太遠：選單也給看
  sfx.clank(); note(s.reason);
}
function rideTick(dt) {
  st.rideT += dt;
  if (st.ride === 1 && st.rideT > 0.45) {
    st.ride = 2;
    const ty = (st.rideTo === undefined || st.rideTo === null) ? -1 : st.rideTo;
    if (ty <= -1) { st.x = 5; st.y = -1; } else { st.x = EX; st.y = ty; }
    st.fx = st.x; st.fy = st.y; camY = st.fy * T + 5 - H * .45;
    st.maxDepth = Math.max(st.maxDepth, st.y);
  }
  if (st.ride === 2 && st.rideT > 1.0) { st.ride = 0; st.rideT = 0; st.runs++; }
}

// ---- 地面設施：靠近哪一個就只提示哪一個，按下去才開那一面板 ----
const FAC = [
  { k: 'shop', x: 5, name: '商店', verb: '進商店買升級' },
  { k: 'furnace', x: 8, name: '熔爐', verb: '開熔爐' },
  { k: 'elev', x: 10, name: '電梯', verb: '搭電梯下去' },
  { k: 'craft', x: 13, name: '工作台', verb: '做東西・賣材料' },
];
function onSurface() { return st.y <= -1 && !st.move && st.ride === 0 && !st.won && st.dead <= 0; }
function atShop() { return onSurface(); } // 卸貨、加油、買賣都在地面做（不用走到某一格）
function nearFac() { // 最近的一個設施，超過 2.5 格就沒有
  if (!onSurface() || st.panel) return null;
  let best = null, bd = 2.6;
  for (const f of FAC) { const d = Math.abs(st.fx - f.x); if (d < bd) { bd = d; best = f; } }
  return best;
}
function facButton() { const f = nearFac(); return f ? { f, x: (W - 84) / 2 | 0, y: H - 26, w: 84, h: 14 } : null; }
function openPanel(k) {
  if (k === 'elev') { openLift(); return; }
  st.panel = k; st.liftMenu = null; listOpen = false; audio(); sfx.clank();
}
function closePanel() { st.panel = null; st.liftMenu = null; wipeArm = 0; }
const UPKEYS = ['pick', 'tank', 'bag', 'furnace', 'elev'];
function buttons() {
  if (st.panel !== 'shop' || !onSurface()) return [];
  const bw = Math.min(50, ((W - 14) / 5) | 0), gap = 3, x0 = (W - (bw * 5 + gap * 4)) / 2 | 0;
  return UPKEYS.map((k, i) => ({ k, x: x0 + i * (bw + gap), y: 50, w: bw, h: 30 }));
}
function wipeButton() { return st.panel === 'shop' ? { x: W - 60, y: H - 15, w: 54, h: 12 } : null; }
function craftButtons() {
  if (st.panel !== 'craft' || !onSurface()) return [];
  const bw = Math.min(62, ((W - 14) / 4) | 0), gap = 3, x0 = (W - (bw * 4 + gap * 3)) / 2 | 0;
  const a = CRAFT.map((r, i) => ({ c: i, r, x: x0 + i * (bw + gap), y: 82, w: bw, h: 26 }));
  a.push({ sell: 1, x: x0 + 3 * (bw + gap), y: 82, w: bw, h: 26 });
  return a;
}
function matTotal() { let n = 0; for (const k in st.mat) n += st.mat[k]; return n; }
function canCraft(r) {
  if ((st.craft[r.k] || 0) >= r.max) return '已經做滿 ' + r.max + ' 個';
  if (st.money < r.cost) return '錢不夠（要 ' + r.cost + '）';
  for (const id in r.need) if ((st.mat[id] || 0) < r.need[id]) return '缺 ' + ONAME[id] + ' ' + (r.need[id] - (st.mat[id] || 0)) + ' 顆';
  return '';
}
function craft(i) {
  if (st.panel !== 'craft' || !onSurface() || st.won) return; const r = CRAFT[i]; if (!r) return;
  const why = canCraft(r); if (why) { sfx.full(); shake = 3; note(r.name + '：' + why); return; }
  st.money -= r.cost;
  for (const id in r.need) { st.mat[id] -= r.need[id]; st.matUsed += r.need[id]; }
  st.craft[r.k] = (st.craft[r.k] || 0) + 1;
  st.buys.push({ k: 'craft:' + r.k, lv: st.craft[r.k], t: st.t });
  sfx.up(); flash = .3; note('做好了：' + r.name + '（' + r.desc + '）'); save();
}
function sellMats() {
  if (st.panel !== 'craft' || !onSurface() || st.won) return;
  const n = matTotal(); if (!n) { sfx.clank(); note('沒有材料可以賣'); return; }
  let v = 0; for (const id in st.mat) { v += Math.round(VAL[id] * MATSELL) * st.mat[id]; st.matSold += st.mat[id]; st.mat[id] = 0; }
  st.money += v; sfx.coin(1); sfx.up(); note('材料全賣了：+' + v + ' 元（做東西才用得到它們）'); save();
}
let listOpen = false;
let wipeArm = 0;
function askWipe() {
  if (st.panel !== 'shop') return;
  if (wipeArm > 0) { wipe(); return; }
  wipeArm = 2.5; note('再按一次「清除存檔」就會重來');
}
function buy(k) {
  if (st.panel !== 'shop' || !onSurface() || st.won) return;
  const l = st.lv[k]; if (l >= 4) { sfx.clank(); note(UPNAME[k] + '已經是最高級了'); return; }
  const c = COST[k][l]; if (st.money < c) { sfx.full(); shake = 3; note('錢不夠：' + UPNAME[k] + '要 ' + c); return; }
  st.money -= c; st.lv[k]++;
  if (k === 'tank') st.fuel = TANK[st.lv.tank];
  st.buys.push({ k, lv: st.lv[k], t: st.t });
  sfx.up(); flash = 0.3;
  note(UPNAME[k] + ' → ' + (st.lv[k] + 1) + ' 級' + (k === 'elev' ? '（可到 ' + effElevCap() * 2 + ' 公尺）' : ''));
  const b = buttons().find(b => b.k === k); if (b) { for (let i = 0; i < 20; i++) parts.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vx: (Math.random() - .5) * 80, vy: (Math.random() - .5) * 80, life: .6, col: '#fff29a', screen: true }); }
  save();
}
// 熔爐：礦丟進去要煉，煉的時候你可以下去挖
const QSORT = ['照挖到的順序', '先煉貴的', '先煉便宜的'];
function qsortButton() { return st.panel === 'furnace' ? { x: (W - 90) / 2 | 0, y: 70, w: 90, h: 14 } : null; }
function cycleQSort() {
  if (st.panel !== 'furnace') return;
  st.qsort = ((st.qsort || 0) + 1) % 3;
  applyQSort(); sfx.clank(); note('熔爐順序：' + QSORT[st.qsort]); save();
}
function applyQSort() { // 正在煉的那幾格不動，後面的重排
  const slots = FURN[st.lv.furnace][0], head = st.q.slice(0, slots), tail = st.q.slice(slots);
  if (st.qsort === 1) tail.sort((a, b) => VAL[b.id] - VAL[a.id]);
  else if (st.qsort === 2) tail.sort((a, b) => VAL[a.id] - VAL[b.id]);
  st.q = head.concat(tail);
}
// 出發前的安排：把還沒開始煉的照順序挑進爐口（已經在煉的不打斷）
function reorderIntake() {
  const slots = FURN[st.lv.furnace][0];
  const busy = st.q.filter(it => (it.p || 0) > 0);
  const rest = st.q.filter(it => !((it.p || 0) > 0));
  if (st.qsort === 1) rest.sort((a, b) => VAL[b.id] - VAL[a.id]);
  else if (st.qsort === 2) rest.sort((a, b) => VAL[a.id] - VAL[b.id]);
  st.q = busy.concat(rest);
  if (busy.length > slots) st.q = st.q; // 不可能，保險
}
let sellT = 0;
function furnaceTick(dt) {
  const [slots, spd] = FURN[st.lv.furnace], per = SMELT_BASE / spd;
  let n = 0;
  for (const it of st.q) {
    if (n >= slots) break; n++;
    it.p = (it.p || 0) + dt / per;
  }
  for (let i = st.q.length - 1; i >= 0; i--) {
    if ((st.q[i].p || 0) >= 1) {
      const id = st.q[i].id, v = Math.round(VAL[id] * SMELT);
      st.q.splice(i, 1); st.money += v;
      if (atShop()) { sfx.coin(i % 8); pop(st.x * T + 5, st.y * T - 6, '+' + v, '#ffd27a'); }
    }
  }
}
function shopTick(dt) {
  if (!atShop()) { sellT = 0; return; }
  if (st.fuel < TANK[st.lv.tank]) st.fuel = Math.min(TANK[st.lv.tank], st.fuel + dt * 60);
  sellT -= dt;
  if (st.cargo.length && sellT <= 0) {
    const id = st.cargo.shift(); sellT = 0.08;
    if (MAT[id]) { st.mat[id] = (st.mat[id] || 0) + 1; st.matGot++; sfx.coin(2); pop(st.x * T + 5, st.y * T - 4, '+' + 1, ORECOL[id][1]); return; }
    if (st.q.length < QCAP) { st.q.push({ id, p: 0 }); if (st.qsort) reorderIntake(); sfx.smelt(); pop(st.x * T + 5, st.y * T - 4, '+' + 1, '#9ee7ff'); }
    else { st.money += VAL[id]; sfx.coin(0); pop(st.x * T + 5, st.y * T - 4, '+' + VAL[id], '#888'); note('熔爐排滿了，' + ONAME[id] + '只好生賣'); }
  }
}

// ---- 更新 ----
let camY = -60;
function update(dt) {
  st.t += dt;
  if (wipeArm > 0) wipeArm = Math.max(0, wipeArm - dt);
  if (st.noteT > 0) { st.noteT -= dt; if (st.noteT <= 0) st.note = null; }
  furnaceTick(dt);
  if (st.won) { st.wonT += dt; return; }
  if (st.ride > 0) { rideTick(dt); return; }
  if (st.dead > 0) { st.dead -= dt; if (st.dead <= 0) { st.x = 5; st.y = -1; st.fx = 5; st.fy = -1; st.fuel = TANK[st.lv.tank]; st.move = null; st.dig = null; camY = -H * .6; } return; }
  const [dx, dy] = inputDir(); if (dx) st.face = dx;
  shopTick(dt);
  if (st.move) {
    const m = st.move; m.t += dt / m.dur; if (m.t >= 1) { st.x = m.tx; st.y = m.ty; st.move = null; if (m.fall && tile(st.x, st.y + 1) !== 0) { sfx.land(); shake = 1.2; burst(st.x * T + 5, (st.y + 1) * T, '#aa8866', 4, 30); } }
    st.fx = m.fx + (m.tx - m.fx) * Math.min(1, m.t); st.fy = m.fy + (m.ty - m.fy) * Math.min(1, m.t);
  }
  if (!st.move) {
    st.fx = st.x; st.fy = st.y;
    const below = tile(st.x, st.y + 1);
    const flying = dy < 0;
    if (dx && dy < 0 && tile(st.x + dx, st.y) === 0) { st.dig = null; startMove(st.x + dx, st.y, 0.12); useFuel(0.3); }
    else if (dx && dy) { if (dy > 0) digOrMove(0, 1, dt); else digOrMove(dx, 0, dt); }
    else if (below === 0 && !flying && !(dy > 0) && st.y >= 0) { startMove(st.x, st.y + 1, 0.035, true); st.dig = null; } // 自由落下要夠快，深井的來回才不會變成整局最長的一段；地面那一排不會自己掉進井裡，要自己按往下
    else if (dx || dy) digOrMove(dx, dy, dt);
    else st.dig = null;
  }
  fuelCheck();
}
function digOrMove(dx, dy, dt) {
  const tx = st.x + dx, ty = st.y + dy, id = tile(tx, ty);
  if (ty < -1 || (dy < 0 && st.y <= -1)) return;
  if (id === 0) { st.dig = null; startMove(tx, ty, dy < 0 ? 0.16 : 0.11); useFuel(dy < 0 ? 0.35 : 0.06); return; }
  const h = hardOf(id, ty), pw = effPick();
  if (!canDig(id, ty)) {
    if (!st.dig || st.dig.tx !== tx || st.dig.ty !== ty) {
      sfx.clank(); shake = 1.5; burst(tx * T + 5 - dx * 5, ty * T + 5 - dy * 5, '#ffffff', 5, 50);
      st.dig = { tx, ty, p: 0, blocked: 1 };
      if (id === 4) note('封岩：要 ' + (barrierLv[ty] + 1) + ' 級鎬子才挖得動');
      else if (id === 3) note('這裡挖不穿');
      else if (id === 23) note('地心：要最高級的鎬子');
      else note('太硬了，鎬子還不夠力');
    }
    return;
  }
  if (!st.dig || st.dig.tx !== tx || st.dig.ty !== ty) st.dig = { tx, ty, p: 0, tick: 0 };
  const need = 0.12 + h / pw * 0.22; st.dig.p += dt / need; st.dig.tick -= dt;
  useFuel(dt * 0.9);
  if (st.dig.tick <= 0) { st.dig.tick = 0.07; sfx.chip(h); shake = Math.max(shake, 0.8); const Z = zoneOf(ty); burst(tx * T + 5 - dx * 4, ty * T + 5 - dy * 4, Math.random() < .5 ? Z[3] : Z[2], 2, 40); }
  if (st.dig.p >= 1) breakTile(tx, ty, id);
}
function fuelCheck() {
  if (st.fuel <= 0 && !st.won) {
    st.fuel = 0; st.dead = 1.4; st.cargo = []; sfx.dead(); shake = 5; note('燃料用完了，這一趟的礦全掉了');
    burst(st.fx * T + 5, st.fy * T + 5, '#ff6040', 30, 90); save();
  }
  st.maxDepth = Math.max(st.maxDepth, st.y);
}
function useFuel(a) { st.fuel -= a * (st.y < 0 ? 0 : 1); }
function startMove(tx, ty, dur, fall) { st.move = { fx: st.x, fy: st.y, tx, ty, t: 0, dur, fall }; }
function breakTile(x, y, id) {
  map[y][x] = 0; st.dig = null;
  const h = hardOf(id, y); sfx.brk(h); shake = Math.max(shake, 2 + Math.min(h, 10) * 0.2);
  const Z = zoneOf(y); burst(x * T + 5, y * T + 5, Z[3], 10, 70); burst(x * T + 5, y * T + 5, Z[2], 6, 50);
  if (id === 23) { st.won = true; st.wonT = 0; flash = 1.5; shake = 10; sfx.newf(); sfx.up(); burst(x * T + 5, y * T + 5, '#ffffff', 80, 200); save(); return; }
  if (id === 4) note('封岩打穿了');
  if (VAL[id]) {
    burst(x * T + 5, y * T + 5, ORECOL[id][1], 12, 90);
    if (!st.seen[id]) { st.seen[id] = 1; newIcon = { id, life: 2.2 }; sfx.newf(); flash = 0.25; note('第一次挖到：' + ONAME[id]); }
    if (st.cargo.length >= effBag()) { sfx.full(); pop(x * T + 5, y * T, 'x', '#ff5050'); if (!st.fullNoted || st.t - st.fullNoted > 6) { st.fullNoted = st.t; note('背包滿了，回去卸貨'); } }
    else { st.cargo.push(id); sfx.ore(VAL[id]); pop(x * T + 5, y * T, '+' + VAL[id], ORECOL[id][1]); }
  }
  startMove(x, y, 0.1);
}

// ---- 存檔 ----
const SAVEKEY = 'dig_save_v3';
function b64(arr) { let s = ''; for (let i = 0; i < arr.length; i += 4096) s += String.fromCharCode.apply(null, arr.subarray(i, i + 4096)); return btoa(s); }
function unb64(s) { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
function save() {
  try {
    const flat = new Uint8Array(DEPTH * WW);
    for (let y = 0; y < DEPTH; y++) flat.set(map[y], y * WW);
    localStorage.setItem(SAVEKEY, JSON.stringify({ v: 3, st, map: b64(flat) }));
  } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(SAVEKEY); if (!raw) return false;
    const d = JSON.parse(raw); if (d.v !== 3) return false;
    const flat = unb64(d.map); map = [];
    for (let y = 0; y < DEPTH; y++) map.push(flat.slice(y * WW, y * WW + WW));
    barrierLv = {}; for (const [by, lv] of BARRIER) barrierLv[by] = lv;
    st = d.st; seed = st.seed || 1; st.move = null; st.dig = null; st.ride = 0; st.rideT = 0;
    st.q = st.q || []; st.buys = st.buys || []; st.note = null; st.noteT = 0;
    st.qsort = st.qsort || 0; st.liftMenu = null; st.rideTo = -1; st.panel = null;
    st.mat = st.mat || {}; st.craft = st.craft || {}; st.treasure = st.treasure || []; st.found = st.found || {};
    camY = -H * .6;
    return true;
  } catch (e) { return false; }
}
function wipe() { try { localStorage.removeItem(SAVEKEY); } catch (e) {} reset(); note('存檔清掉了，這是一張新地圖'); }
let autosaveT = 0;

// ---- 貼圖 ----
const texCache = {};
function tex(id, y, x) {
  const Z = zoneOf(y), v = (hash(x, y) * 4) | 0, key = id + Z[2] + v + (id === 4 ? (barrierLv[y] || 0) : '');
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = c.height = T; const q = c.getContext('2d');
  const base = id === 3 ? '#0e0a10' : id === 4 ? '#2b2b33' : id === 2 ? shade(Z[2], -18) : Z[2];
  q.fillStyle = base; q.fillRect(0, 0, T, T);
  let s = hash(v * 7 + id, Z[0] * 13 + 3);
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  if (id === 4) {
    q.fillStyle = '#4a4a58'; for (let i = 0; i < 4; i++) q.fillRect(r() * T | 0, r() * T | 0, 3, 1);
    q.fillStyle = '#6f6f82'; q.fillRect(0, 0, T, 1); q.fillRect(0, T - 1, T, 1);
    q.fillStyle = ['#8fd4ff', '#8fff9c', '#ffd98f', '#ff9fce'][(barrierLv[y] || 1) - 1] || '#fff';
    q.fillRect(2, 4, 2, 2); q.fillRect(6, 4, 2, 2);
    return texCache[key] = c;
  }
  q.fillStyle = id === 2 ? shade(Z[3], -10) : Z[3]; for (let i = 0; i < 7; i++) q.fillRect(r() * T | 0, r() * T | 0, 1 + (r() * 2 | 0), 1);
  q.fillStyle = shade(base, -25); for (let i = 0; i < 5; i++) q.fillRect(r() * T | 0, r() * T | 0, 1, 1);
  if (id === 2) { q.fillStyle = shade(Z[3], 20); q.fillRect(2, 2, 5, 1); q.fillRect(1, 3, 1, 4); }
  if (ORECOL[id]) {
    const [a, b] = ORECOL[id];
    if (id === 20) { q.fillStyle = a; q.fillRect(1, 4, 8, 2); q.fillRect(1, 3, 2, 4); q.fillRect(7, 3, 2, 4); q.fillStyle = b; q.fillRect(3, 4, 4, 1); }
    else if (id === 22) { q.fillStyle = '#1a0a22'; q.fillRect(2, 2, 6, 6); q.fillStyle = a; q.fillRect(3, 3, 4, 4); q.fillStyle = b; q.fillRect(4, 4, 2, 2); }
    else if (id === 23) { q.fillStyle = '#000'; q.fillRect(0, 0, T, T); q.fillStyle = a; q.fillRect(1, 1, 8, 8); q.fillStyle = b; q.fillRect(3, 3, 4, 4); }
    else if (id === 21) { q.fillStyle = a; q.fillRect(4, 1, 2, 7); q.fillRect(2, 4, 2, 4); q.fillRect(6, 3, 2, 5); q.fillStyle = b; q.fillRect(4, 2, 1, 3); }
    else { const n = id >= 13 ? 3 : 4; for (let i = 0; i < n; i++) { const px = 1 + r() * 7 | 0, py = 1 + r() * 7 | 0; q.fillStyle = a; q.fillRect(px, py, 2, 2); q.fillStyle = b; q.fillRect(px, py, 1, 1); } }
  }
  return texCache[key] = c;
}
function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const f = k => Math.max(0, Math.min(255, ((n >> k) & 255) + d)); return '#' + ((1 << 24) + (f(16) << 16) + (f(8) << 8) + f(0)).toString(16).slice(1); }

// ---- 繪圖 ----
function draw(dt) {
  ug.setTransform(1, 0, 0, 1, 0, 0); ug.clearRect(0, 0, uc.width, uc.height);
  const px = st.fx * T + 5, py = st.fy * T + 5;
  const targetCam = py - H * 0.45; camY += (targetCam - camY) * Math.min(1, dt * 8);
  const offX = Math.round((W - WW * T) / 2);
  shake = Math.max(0, shake - dt * 14);
  const sx = Math.round((Math.random() - .5) * shake), sy = Math.round((Math.random() - .5) * shake);
  const cy = Math.round(camY);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const depthF = Math.max(0, Math.min(1, st.fy / DEPTH));
  g.fillStyle = '#0b0710'; g.fillRect(0, 0, W, H);
  g.save(); g.translate(offX + sx, -cy + sy);
  if (cy < 0) {
    const grd = g.createLinearGradient(0, -SKY * T - 40, 0, 0); grd.addColorStop(0, '#3b6fb6'); grd.addColorStop(1, '#f2b880');
    g.fillStyle = grd; g.fillRect(-offX - 10, -SKY * T - 200, W + 20, SKY * T + 200);
    g.fillStyle = '#5a7fa8'; for (let i = 0; i < 6; i++) { const hx = i * 55 - 20; g.beginPath(); g.moveTo(hx, 0); g.lineTo(hx + 30, -22 - (i % 3) * 6); g.lineTo(hx + 60, 0); g.fill(); }
    g.fillStyle = '#3a2418'; g.fillRect(22, -26, 50, 26); g.fillStyle = '#c0452f'; g.fillRect(18, -32, 58, 7);
    for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#f4e2c0' : '#c0452f'; g.fillRect(18 + i * 8, -25, 8, 3); }
    g.fillStyle = '#f2c230'; g.fillRect(42, -18, 10, 10); g.fillStyle = '#3a2418'; g.fillRect(46, -16, 2, 6);
    // 熔爐（商店旁的小煙囪）
    const fz = FURN[st.lv.furnace];
    g.fillStyle = '#4a3a3a'; g.fillRect(78, -20, 16, 20); g.fillStyle = '#2a1a1a'; g.fillRect(81, -14, 10, 10);
    const burn = st.q.length > 0;
    g.fillStyle = burn ? ((st.t * 6 | 0) % 2 ? '#ff8a3a' : '#ffd27a') : '#552'; g.fillRect(83, -11, 6, 6);
    g.fillStyle = '#6a5a5a'; g.fillRect(84, -26, 4, 6);
    if (burn) { g.fillStyle = 'rgba(200,200,210,.5)'; for (let i = 0; i < 3; i++) g.fillRect(84 + Math.sin(st.t * 2 + i) * 2, -30 - i * 5 - (st.t * 8 % 5), 3, 3); }
    // 電梯機房
    if (st.lv.elev > 0) { g.fillStyle = '#556'; g.fillRect(EX * T - 2, -16, T + 4, 16); g.fillStyle = '#889'; g.fillRect(EX * T - 4, -18, T + 8, 3); }
    g.fillStyle = '#4c9a3c'; g.fillRect(0, -2, WW * T, 3);
  }
  const y0 = Math.max(0, Math.floor(cy / T) - 1), y1 = Math.min(DEPTH - 1, Math.floor((cy + H) / T) + 1);
  for (let y = y0; y <= y1; y++) {
    const Z = zoneOf(y);
    for (let x = 0; x < WW; x++) {
      const id = map[y][x];
      if (id === 0) { g.fillStyle = shade(Z[2], -55); g.fillRect(x * T, y * T, T, T); }
      else g.drawImage(tex(id, y, x), x * T, y * T);
    }
  }
  // 電梯軌道（畫在已服務的那一段）
  const LS = liftState(), served = LS.served;
  if (st.lv.elev > 0 && served >= 0) {
    const a = Math.max(y0, 0), b = Math.min(y1, served);
    for (let y = a; y <= b; y++) {
      g.fillStyle = '#6a6a80'; g.fillRect(EX * T + 1, y * T, 1, T); g.fillRect(EX * T + 8, y * T, 1, T);
      if (y % 3 === 0) { g.fillStyle = '#8a8aa0'; g.fillRect(EX * T + 1, y * T + 1, 8, 1); }
    }
    if (served >= y0 - 2 && served <= y1 + 2) { g.fillStyle = '#c8c8dd'; g.fillRect(EX * T, served * T + 6, T, 4); }
  }
  if (st.dig && !st.dig.blocked) {
    const d = st.dig, n = Math.floor(d.p * 5); g.fillStyle = '#000';
    const cx = d.tx * T, cyy = d.ty * T;
    const cracks = [[4, 4], [5, 5], [3, 6], [6, 3], [2, 2], [7, 7], [5, 2], [2, 7], [8, 4], [1, 5]];
    for (let i = 0; i < n * 2; i++) g.fillRect(cx + cracks[i][0], cyy + cracks[i][1], 1, 1);
    const jig = (Math.random() - .5) * 1.5;
    g.globalAlpha = .25 * d.p; g.fillStyle = '#fff'; g.fillRect(cx + jig, cyy, T, T); g.globalAlpha = 1;
  }
  if ((st.dead <= 0 || (st.t * 20 | 0) % 2) && st.ride !== 2) {
    const bx = Math.round(st.fx * T), by = Math.round(st.fy * T), f = st.face;
    const [ddx, ddy] = inputDir();
    g.fillStyle = '#ffcf3a'; g.fillRect(bx + 1, by + 3, 8, 5);
    g.fillStyle = '#e08a1e'; g.fillRect(bx + 1, by + 7, 8, 1);
    g.fillStyle = '#9ee7ff'; g.fillRect(bx + (f > 0 ? 5 : 2), by + 4, 3, 2);
    g.fillStyle = '#333'; g.fillRect(bx + 1, by + 8, 3, 2); g.fillRect(bx + 6, by + 8, 3, 2);
    const spin = (st.t * 30 | 0) % 2;
    g.fillStyle = spin && st.dig ? '#fff' : '#bbb';
    if (ddy > 0) { g.fillRect(bx + 3, by + 10, 4, 1); g.fillRect(bx + 4, by + 11, 2, 1); }
    else if (ddy < 0) { g.fillStyle = '#ff8a3a'; if ((st.t * 20 | 0) % 2) g.fillRect(bx + 3, by + 10, 4, 2); g.fillStyle = '#bbb'; g.fillRect(bx + 3, by + 1, 4, 2); }
    else { const dxp = f > 0 ? bx + 9 : bx - 2; g.fillRect(dxp, by + 4, 3, 3); g.fillRect(f > 0 ? dxp + 3 : dxp - 1, by + 5, 1, 1); }
  }
  for (const p of parts) { if (p.screen) continue; g.fillStyle = p.col; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
  g.restore();

  if (cy + H > 0) {
    dg.globalCompositeOperation = 'source-over'; dg.clearRect(0, 0, W, H);
    const darkA = Math.min(0.97, 0.35 + depthF * 1.1);
    dg.fillStyle = `rgba(4,2,8,${darkA})`; dg.fillRect(0, Math.max(0, -cy), W, H);
    dg.globalCompositeOperation = 'destination-out';
    const light = (x, y, r, a) => { const gr = dg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); dg.fillStyle = gr; dg.fillRect(x - r, y - r, r * 2, r * 2); };
    const R = 70 - depthF * 28 + st.lv.pick * 4;
    light(px + offX + sx, py - cy + sy, R, 1);
    for (let y = y0; y <= y1; y++) for (let x = 0; x < WW; x++) { const id = map[y][x]; if (id === 21 || id === 22 || id === 23 || id === 15) light(x * T + 5 + offX, y * T + 5 - cy, id === 23 ? 60 : 20 + Math.sin(st.t * 3 + x + y) * 3, .8); }
    g.drawImage(dark, 0, 0);
    g.globalCompositeOperation = 'lighter';
    for (let y = y0; y <= y1; y++) for (let x = 0; x < WW; x++) { const id = map[y][x]; if (id === 21 || id === 22 || id === 23) { g.globalAlpha = .25 + Math.sin(st.t * 3 + x * 2 + y) * .1; g.fillStyle = ORECOL[id][0]; g.fillRect(x * T + offX - 2, y * T - cy - 2, T + 4, T + 4); } }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  for (const p of pops) { const w = txtW(p.txt); const x = Math.round(p.x + offX - w / 2), y = Math.round(p.y - cy - (1 - p.life) * 14); txt(p.txt, x + 1, y + 1, '#000'); txt(p.txt, x, y, p.col); }
  for (const p of parts) if (p.screen) { g.fillStyle = p.col; g.fillRect(p.x | 0, p.y | 0, 1, 1); }
  drawHud(LS);
  if (newIcon) {
    const a = Math.min(1, newIcon.life * 2), sc = 3 + (1 - Math.min(1, (2.2 - newIcon.life) * 4)) * 3;
    g.globalAlpha = a; const x = W / 2 - T * sc / 2, y = 52;
    g.fillStyle = '#000a'; g.fillRect(x - 6, y - 6, T * sc + 12, T * sc + 12);
    g.imageSmoothingEnabled = false; g.drawImage(tex(newIcon.id, 0, 0), x, y, T * sc, T * sc);
    g.globalAlpha = 1;
    L('新礦：' + ONAME[newIcon.id], W / 2, y + T * sc + 3, '#ffe27a', Math.round(4 * S), 'center');
  }
  if (flash > 0) { g.globalAlpha = Math.min(1, flash); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  if (st.dead > 0) { g.globalAlpha = Math.min(1, (1.4 - st.dead)); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  // 電梯演出：淡出 → 淡入
  if (st.ride > 0) {
    const a = st.ride === 1 ? Math.min(1, st.rideT / 0.45) : Math.max(0, 1 - (st.rideT - 0.45) / 0.55);
    g.globalAlpha = a; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    if (a > 0.5) L('電梯上升中…', W / 2, H / 2 - 6, '#dfe6ff', Math.round(5 * S), 'center');
  }
  if (st.won) drawEnd();
  if (stick) { g.globalAlpha = .35; g.fillStyle = '#fff'; g.beginPath(); g.arc(stick.ox, stick.oy, 16, 0, 7); g.fill(); g.globalAlpha = .7; const m = Math.min(16, Math.hypot(stick.dx, stick.dy)) / (Math.hypot(stick.dx, stick.dy) || 1); g.beginPath(); g.arc(stick.ox + stick.dx * m, stick.oy + stick.dy * m, 7, 0, 7); g.fill(); g.globalAlpha = 1; }
}
function icon(kind, x, y) {
  if (kind === 'fuel') { g.fillStyle = '#ff8a3a'; g.fillRect(x + 2, y, 2, 1); g.fillRect(x + 1, y + 1, 4, 1); g.fillRect(x, y + 2, 6, 4); g.fillStyle = '#ffd9a0'; g.fillRect(x + 1, y + 3, 1, 2); }
  if (kind === 'bag') { g.fillStyle = '#c8a070'; g.fillRect(x + 2, y, 2, 1); g.fillRect(x, y + 1, 6, 5); g.fillStyle = '#8a6040'; g.fillRect(x + 1, y + 2, 4, 1); }
  if (kind === 'coin') { g.fillStyle = '#f2c230'; g.fillRect(x + 1, y, 4, 6); g.fillRect(x, y + 1, 6, 4); g.fillStyle = '#fff29a'; g.fillRect(x + 2, y + 1, 1, 3); }
  if (kind === 'pick') { g.fillStyle = '#bbb'; g.fillRect(x, y + 1, 5, 4); g.fillRect(x + 5, y + 2, 2, 2); g.fillRect(x + 7, y + 3, 1, 1); g.fillStyle = '#ffcf3a'; g.fillRect(x, y + 1, 2, 4); }
  if (kind === 'tank') { g.fillStyle = '#ff8a3a'; g.fillRect(x + 1, y, 5, 7); g.fillStyle = '#7a3a10'; g.fillRect(x + 2, y + 1, 3, 1); g.fillRect(x + 2, y + 3, 3, 1); }
  if (kind === 'down') { g.fillStyle = '#9ee7ff'; g.fillRect(x + 2, y, 2, 4); g.fillRect(x, y + 3, 6, 1); g.fillRect(x + 1, y + 4, 4, 1); g.fillRect(x + 2, y + 5, 2, 1); }
  if (kind === 'furnace') { g.fillStyle = '#6a5a5a'; g.fillRect(x, y, 7, 7); g.fillStyle = '#ff8a3a'; g.fillRect(x + 2, y + 3, 3, 3); g.fillStyle = '#c9c9d5'; g.fillRect(x + 2, y - 2, 2, 2); }
  if (kind === 'elev') { g.fillStyle = '#8a8aa0'; g.fillRect(x, y, 1, 8); g.fillRect(x + 6, y, 1, 8); g.fillStyle = '#c8c8dd'; g.fillRect(x + 1, y + 2, 5, 4); }
}
function drawHud(LS) {
  const tank = TANK[st.lv.tank], fr = st.fuel / tank;
  g.fillStyle = '#000b'; g.fillRect(2, 2, 74, 44);
  icon('fuel', 5, 5); g.fillStyle = '#331'; g.fillRect(14, 6, 44, 4);
  g.fillStyle = fr < .25 ? ((st.t * 6 | 0) % 2 ? '#ff3030' : '#801010') : '#ff9a3a'; g.fillRect(14, 6, Math.round(44 * Math.max(0, fr)), 4);
  L('燃料', 60, 4.2, fr < .25 ? '#ff7070' : '#ffd0a0', Math.round(3.2 * S));
  icon('bag', 5, 13); const cap = effBag(), full = st.cargo.length >= cap;
  const sw = Math.max(1, Math.min(4, Math.floor(44 / cap) - 1)), gp = cap > 24 ? 0 : 1;
  for (let i = 0; i < cap; i++) { const id = st.cargo[i]; g.fillStyle = id ? ORECOL[id][0] : '#333'; g.fillRect(14 + i * (sw + gp), 14, sw, 4); }
  L('背包', 60, 12.2, full ? ((st.t * 4 | 0) % 2 ? '#ff6060' : '#fff') : '#e0c8a0', Math.round(3.2 * S));
  icon('coin', 5, 21); txt(st.money, 14, 22, '#fff29a');
  L('錢', 60, 20.2, '#fff29a', Math.round(3.2 * S));
  // 熔爐狀態
  const [slots, spd] = FURN[st.lv.furnace];
  g.fillStyle = '#ffffff10'; g.fillRect(4, 31, 70, 1);
  icon('furnace', 5, 36);
  for (let i = 0; i < slots; i++) { const it = st.q[i]; g.fillStyle = '#222'; g.fillRect(14 + i * 7, 37, 6, 6); if (it) { g.fillStyle = ORECOL[it.id][0]; g.fillRect(14 + i * 7, 37, 6, 6); g.fillStyle = '#ff8a3a'; g.fillRect(14 + i * 7, 43 - Math.round(6 * Math.min(1, it.p || 0)), 6, Math.round(6 * Math.min(1, it.p || 0))); } }
  L('熔爐 ' + st.q.length + (st.q.length ? ' 顆在煉' : ' 空著'), 14 + slots * 7 + 2, 35.5, '#ffb070', Math.round(3.2 * S));
  // 深度計
  const dxp = W - 12; g.fillStyle = '#000a'; g.fillRect(dxp - 2, 2, 12, H - 4);
  const barH = H - 22; g.fillStyle = '#222'; g.fillRect(dxp + 3, 16, 2, barH);
  ZONES.forEach(Z => { g.fillStyle = Z[3]; g.fillRect(dxp + 3, 16 + Z[0] / DEPTH * barH | 0, 2, 3); });
  BARRIER.forEach(([by]) => { g.fillStyle = map[by][EX] === 4 || map[by][1] === 4 ? '#ff6060' : '#4c9a3c'; g.fillRect(dxp + 1, 16 + by / DEPTH * barH | 0, 6, 1); });
  if (st.lv.elev > 0) { g.fillStyle = '#6a6a80'; g.fillRect(dxp + 6, 16, 1, Math.round(effElevCap() / DEPTH * barH)); }
  g.fillStyle = '#666'; g.fillRect(dxp + 1, 16 + st.maxDepth / DEPTH * barH | 0, 6, 1);
  g.fillStyle = '#ffcf3a'; g.fillRect(dxp + 1, 15 + Math.max(0, st.fy) / DEPTH * barH | 0, 6, 3);
  icon('down', dxp + 1, 4);
  L(Math.max(0, st.y) * 2 + ' 公尺', dxp - 3, 3.5, '#9ee7ff', Math.round(3.4 * S), 'right');
  L(zoneOf(Math.max(0, st.y))[1], dxp - 3, 9, '#c0a8d8', Math.round(3.2 * S), 'right');
  // 面板（開著的時候畫面上只有這一組東西）
  if (st.panel) {
    g.fillStyle = 'rgba(6,4,12,.94)'; g.fillRect(0, 0, W, H);
    const F = FAC.find(f => f.k === st.panel);
    L(F ? F.name : '', W / 2, 5, '#dfe6ff', Math.round(5 * S), 'center');
    L('Q 或點旁邊關閉', 4, H - 9, '#7a7490', Math.round(3 * S));
  }
  for (const b of buttons()) {
    const l = st.lv[b.k], max = l >= 4, c = max ? 0 : COST[b.k][l], ok = !max && st.money >= c;
    g.fillStyle = ok ? '#2e5a2a' : '#2a2030'; g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = ok ? ((st.t * 3 | 0) % 2 ? '#8fff7a' : '#4c9a3c') : '#554';
    g.fillRect(b.x, b.y, b.w, 1); g.fillRect(b.x, b.y + b.h - 1, b.w, 1); g.fillRect(b.x, b.y, 1, b.h); g.fillRect(b.x + b.w - 1, b.y, 1, b.h);
    icon(b.k, b.x + 3, b.y + 10);
    for (let i = 0; i < 5; i++) { g.fillStyle = i <= l ? '#ffcf3a' : '#444'; g.fillRect(b.x + 12 + i * 4, b.y + 11, 3, 3); }
    L(UPNAME[b.k], b.x + b.w / 2, b.y + 1.5, '#fff', Math.round(4 * S), 'center');
    L(max ? '已滿級' : c + ' 元', b.x + b.w / 2, b.y + 17, max ? '#8fff7a' : (ok ? '#fff29a' : '#998'), Math.round(3.4 * S), 'center');
    L(UPDESC[b.k], b.x + b.w / 2, b.y + 23, '#bbb', Math.round(2.9 * S), 'center');
  }
  if (st.panel === 'shop') {
    L('數字鍵 1-5 也可以買', W / 2, 40, '#9a92b0', Math.round(3.2 * S), 'center');
    const wb = wipeButton();
    g.fillStyle = wipeArm > 0 ? '#6a2030' : '#231a2a'; g.fillRect(wb.x, wb.y, wb.w, wb.h);
    L(wipeArm > 0 ? '確定清除？' : '清除存檔', wb.x + wb.w / 2, wb.y + 2.5, wipeArm > 0 ? '#ff9090' : '#998', Math.round(3.2 * S), 'center');
  }
  if (st.panel === 'furnace') {
    const [slots, spd] = FURN[st.lv.furnace];
    L('爐口 ' + slots + ' 格　一顆 ' + (SMELT_BASE / spd).toFixed(1) + ' 秒　煉過的礦值 ' + SMELT + ' 倍', W / 2, 22, '#c8b8a0', Math.round(3.2 * S), 'center');
    const bx0 = (W - Math.min(W - 20, st.q.length * 11 + 4)) / 2 | 0;
    for (let i = 0; i < Math.min(st.q.length, 24); i++) {
      const it = st.q[i], x = bx0 + i * 11, y = 34;
      g.fillStyle = i < slots ? '#3a2a1a' : '#1a1622'; g.fillRect(x, y, 10, 14);
      g.imageSmoothingEnabled = false; g.drawImage(tex(it.id, 200, 3), x + 1, y + 1, 8, 8);
      const pp = Math.min(1, it.p || 0); g.fillStyle = '#ff8a3a'; g.fillRect(x + 1, y + 12 - Math.round(2 * pp), 8, Math.max(1, Math.round(2 * pp)));
    }
    L(st.q.length ? '排隊中 ' + st.q.length + ' 顆（前 ' + slots + ' 顆正在燒）' : '爐子是空的，挖點礦回來', W / 2, 52, '#ffb070', Math.round(3.4 * S), 'center');
    L('先煉哪一批是你決定的：', W / 2, 62, '#9a92b0', Math.round(3.2 * S), 'center');
  }
  if (st.panel === 'craft') {
    // 材料庫
    let mx = 4; g.fillStyle = '#000b'; g.fillRect(2, 52, W - 4, 11);
    L('倉庫裡的材料', 4, 53.5, '#c0a8d8', Math.round(3.4 * S)); mx = 32;
    for (const id of [15, 21, 20, 22]) {
      const n = st.mat[id] || 0;
      g.imageSmoothingEnabled = false; g.globalAlpha = n ? 1 : .3; g.drawImage(tex(+id, 200, 3), mx, 52, 8, 8); g.globalAlpha = 1;
      L(ONAME[id] + ' ' + n, mx + 9, 53.5, n ? '#fff' : '#665', Math.round(3.2 * S));
      mx += 9 + (ONAME[id].length * 3.2 + 14);
    }
    if (mx < 40) L('（還沒挖到材料）', 40, 53.5, '#665', Math.round(3.2 * S));
    // 製作
    for (const b of craftButtons()) {
      if (b.sell) {
        const n = matTotal(), ok = n > 0;
        g.fillStyle = ok ? '#4a3a1a' : '#2a2030'; g.fillRect(b.x, b.y, b.w, b.h);
        g.fillStyle = ok ? '#ffcf3a' : '#554'; g.fillRect(b.x, b.y, b.w, 1); g.fillRect(b.x, b.y + b.h - 1, b.w, 1); g.fillRect(b.x, b.y, 1, b.h); g.fillRect(b.x + b.w - 1, b.y, 1, b.h);
        L('賣掉材料 (V)', b.x + b.w / 2, b.y + 2, '#fff29a', Math.round(3.4 * S), 'center');
        let v = 0; for (const id in st.mat) v += Math.round(VAL[id] * MATSELL) * st.mat[id];
        L(n ? n + ' 顆換 ' + v + ' 元' : '沒有材料', b.x + b.w / 2, b.y + 9, ok ? '#fff' : '#776', Math.round(3.2 * S), 'center');
        L('換了就做不了東西', b.x + b.w / 2, b.y + 17, '#998', Math.round(2.9 * S), 'center');
        continue;
      }
      const r = b.r, why = canCraft(r), ok = !why;
      g.fillStyle = ok ? '#2a3a5a' : '#2a2030'; g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle = ok ? ((st.t * 3 | 0) % 2 ? '#8fd4ff' : '#4c7a9a') : '#554';
      g.fillRect(b.x, b.y, b.w, 1); g.fillRect(b.x, b.y + b.h - 1, b.w, 1); g.fillRect(b.x, b.y, 1, b.h); g.fillRect(b.x + b.w - 1, b.y, 1, b.h);
      L(r.name + ' (' + 'ZXC'[b.c] + ')', b.x + b.w / 2, b.y + 2, ok ? '#fff' : '#aaa', Math.round(3.4 * S), 'center');
      let nd = r.cost + ' 元'; for (const id in r.need) nd += ' ' + ONAME[id] + r.need[id];
      L(nd, b.x + b.w / 2, b.y + 9, ok ? '#fff29a' : '#998', Math.round(3 * S), 'center');
      L(why || r.desc, b.x + b.w / 2, b.y + 15.5, why ? '#ff9090' : '#9fd8ff', Math.round(2.9 * S), 'center');
      L('已做 ' + (st.craft[r.k] || 0) + '/' + r.max, b.x + b.w / 2, b.y + 20, '#998', Math.round(2.9 * S), 'center');
    }
  }
  // 地面：同一時間只提示最近的那一個設施
  const fb = facButton();
  if (fb) {
    const puls = (st.t * 2.5 | 0) % 2;
    g.fillStyle = puls ? '#2a3550' : '#1b2233'; g.fillRect(fb.x, fb.y, fb.w, fb.h);
    g.fillStyle = puls ? '#9fd8ff' : '#5a7a9a';
    g.fillRect(fb.x, fb.y, fb.w, 1); g.fillRect(fb.x, fb.y + fb.h - 1, fb.w, 1); g.fillRect(fb.x, fb.y, 1, fb.h); g.fillRect(fb.x + fb.w - 1, fb.y, 1, fb.h);
    icon(fb.f.k === 'shop' ? 'coin' : fb.f.k === 'craft' ? 'bag' : fb.f.k, fb.x + 4, fb.y + 3);
    L(fb.f.verb + '　(E)', fb.x + 14, fb.y + 3, '#dfe6ff', Math.round(3.6 * S));
  }
  // 電梯按鈕（地底固定位置的操作鈕）
  const eb = liftButton();
  if (eb) {
    const ok = LS.ok, puls = (st.t * 3 | 0) % 2;
    g.fillStyle = ok ? (puls ? '#25506a' : '#163046') : '#2a2030'; g.fillRect(eb.x, eb.y, eb.w, eb.h);
    g.fillStyle = ok ? (puls ? '#9fd8ff' : '#6098c8') : '#554';
    g.fillRect(eb.x, eb.y, eb.w, 1); g.fillRect(eb.x, eb.y + eb.h - 1, eb.w, 1); g.fillRect(eb.x, eb.y, 1, eb.h); g.fillRect(eb.x + eb.w - 1, eb.y, 1, eb.h);
    icon('elev', eb.x + 3, eb.y + 3);
    L(ok ? '搭電梯上去 (E)' : '電梯 (E 看樓層)', eb.x + 12, eb.y + 2, ok ? '#cfe8ff' : '#998', Math.round(3.4 * S));
    if (!ok) L(LS.reason, eb.x + 12, eb.y + 8, '#ff9090', Math.round(2.9 * S));
    else L('已挖通到 ' + (LS.served * 2) + ' 公尺', eb.x + 12, eb.y + 8, '#8fbfe0', Math.round(2.9 * S));
  }
  const lb2 = listButton();
  if (lb2) {
    const lk2 = locked();
    g.fillStyle = '#1a1622'; g.fillRect(lb2.x, lb2.y, lb2.w, lb2.h);
    g.fillStyle = '#5a5070'; g.fillRect(lb2.x, lb2.y, lb2.w, 1); g.fillRect(lb2.x, lb2.y + lb2.h - 1, lb2.w, 1);
    L('收藏 ' + (collection().length - lk2.slots) + '/' + collection().length, lb2.x + lb2.w / 2, lb2.y + 2.5, '#c8b8e8', Math.round(3.2 * S), 'center');
  }
  const qb = qsortButton();
  if (qb) {
    g.fillStyle = '#231a12'; g.fillRect(qb.x, qb.y, qb.w, qb.h);
    g.fillStyle = '#7a5a2a'; g.fillRect(qb.x, qb.y, qb.w, 1); g.fillRect(qb.x, qb.y + qb.h - 1, qb.w, 1);
    L('順序：' + QSORT[st.qsort || 0] + '　(F 換)', qb.x + qb.w / 2, qb.y + 3, '#ffd27a', Math.round(3.4 * S), 'center');
  }
  if (listOpen) drawList();
  if (st.liftMenu) drawLiftMenu();
  if (st.note) { const a = Math.min(1, st.noteT * 2); ug.globalAlpha = a; L(st.note, W / 2, st.panel ? 13 : H - 20, '#ffe27a', Math.round(4 * S), 'center'); ug.globalAlpha = 1; }
}
function liftMenuRows() {
  if (!st.liftMenu) return [];
  const st0 = st.liftMenu.stops, w = 96, x = (W - w) / 2 | 0, y0 = 20;
  return st0.map((y, i) => ({ y0: y, i, x, y: y0 + i * 13, w, h: 12 }));
}
function drawLiftMenu() {
  const rows = liftMenuRows(); if (!rows.length) return;
  g.fillStyle = 'rgba(6,4,12,.88)'; g.fillRect(0, 0, W, H);
  L('電梯要去哪裡？（上下選，E 確定，Q 取消）', W / 2, 10, '#dfe6ff', Math.round(3.6 * S), 'center');
  const served = servedDepth();
  for (const r of rows) {
    const on = r.i === st.liftMenu.sel;
    g.fillStyle = on ? '#25506a' : '#161222'; g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = on ? '#9fd8ff' : '#4a4460';
    g.fillRect(r.x, r.y, r.w, 1); g.fillRect(r.x, r.y + r.h - 1, r.w, 1); g.fillRect(r.x, r.y, 1, r.h); g.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    icon('elev', r.x + 3, r.y + 2);
    const nm = r.y0 === served ? '最深處' : zoneOf(r.y0)[1];
    L((r.y0 <= 0 ? '地面' : r.y0 * 2 + ' 公尺') + '　' + nm, r.x + 13, r.y + 2, on ? '#fff' : '#9a92b0', Math.round(3.4 * S));
  }
  L('電梯只到你自己挖通的深度：' + (served * 2) + ' 公尺', W / 2, 20 + rows.length * 13 + 3, '#8fbfe0', Math.round(3 * S), 'center');
}
function listButton() { return (st.won || st.ride > 0 || st.liftMenu || st.panel) ? null : { x: 79, y: 34, w: 34, h: 12 }; }
function drawList() {
  ug.clearRect(0, 0, uc.width, uc.height);
  g.fillStyle = '#06040c'; g.fillRect(0, 0, W, H);
  L('收藏清單（點畫面或按 L 關閉）', W / 2, 3, '#dfe6ff', Math.round(4 * S), 'center');
  const rows = collection(), col = 2, per = Math.ceil(rows.length / col);
  rows.forEach((r, i) => {
    const c = (i / per) | 0, j = i % per;
    const x = 6 + c * (W / 2 - 4), y = 12 + j * 11;
    g.fillStyle = r.got ? '#1e2a1e' : '#1a1622'; g.fillRect(x, y, W / 2 - 10, 10);
    if (r.got && r.id) { g.imageSmoothingEnabled = false; g.drawImage(tex(r.id, r.id === 23 ? 0 : 200, 3), x + 1, y + 1, 8, 8); }
    else if (r.got) { g.fillStyle = '#8fff7a'; g.fillRect(x + 2, y + 4, 6, 3); g.fillRect(x + 4, y + 2, 2, 7); }
    else { g.fillStyle = '#332c3e'; g.fillRect(x + 1, y + 1, 8, 8); g.fillStyle = '#5a5070'; g.fillRect(x + 4, y + 3, 2, 4); g.fillRect(x + 4, y + 8, 2, 1); }
    L(r.got ? r.name : '？？？', x + 11, y + 0.5, r.got ? '#fff' : '#6b6480', Math.round(3.4 * S));
    L(r.got ? r.desc : (r.soon ? '（下一輪才會有）' : '還沒拿到'), x + 11, y + 5.5, r.got ? '#a8b0c8' : '#4e4860', Math.round(2.9 * S));
  });
  const lk = locked();
  L('清單還空著 ' + lk.slots + ' 格　整體還沒解開 ' + lk.n + ' 件', W / 2, H - 9, '#a8ffb0', Math.round(3.4 * S), 'center');
}
function liftButton() {
  if (st.won || st.dead > 0 || st.y <= -1 || st.ride > 0 || st.panel || st.liftMenu) return null;
  return { x: 3, y: H - 30, w: 78, h: 16 };
}
function collection() { // 收藏清單：[{key,name,desc,got}]
  const rows = [];
  for (const id of [10, 11, 12, 13, 15, 21, 20, 22]) rows.push({ key: 'ore' + id, name: ONAME[id], desc: FINDS[id], got: !!st.seen[id], id });
  for (const r of CRAFT) rows.push({ key: 'c' + r.k, name: r.name, desc: r.desc + '（做過 ' + (st.craft[r.k] || 0) + '/' + r.max + '）', got: (st.craft[r.k] || 0) > 0 });
  for (const r of CRAFT_SOON) rows.push({ key: 'c' + r.k, name: r.name, desc: r.desc, got: false, soon: 1 });
  rows.push({ key: 'core', name: '地心', desc: FINDS[23], got: !!st.won, id: 23 });
  return rows;
}
function locked() {
  const list = [];
  for (const r of collection()) if (!r.got) list.push('清單:' + r.name);
  for (const k of UPKEYS) for (let i = st.lv[k]; i < 4; i++) list.push(UPNAME[k] + (i + 2) + '級');
  for (const [by, lv] of BARRIER) { let open = false; for (let x = 1; x < WW - 1; x++) if (map[by][x] !== 4) { open = true; break; } if (!open) list.push('封岩' + (by * 2) + '公尺'); }
  return { n: list.length, list, slots: collection().filter(r => !r.got).length };
}
function drawEnd() {
  g.globalAlpha = Math.min(.85, st.wonT); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  const sc = 4, x = W / 2 - T * sc / 2, y = 16 + Math.sin(st.t * 2) * 3;
  g.globalCompositeOperation = 'lighter'; for (let r = 40; r > 0; r -= 8) { g.globalAlpha = .08; g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(W / 2, y + T * sc / 2, r + Math.sin(st.t * 4) * 3, 0, 7); g.fill(); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.drawImage(tex(23, 0, 0), x, y, T * sc, T * sc);
  const s = st.t | 0, tstr = (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0');
  L('挖到地心了', W / 2, y + T * sc + 4, '#fff', Math.round(6 * S), 'center');
  L('用了 ' + tstr + '　下潛 ' + st.runs + ' 趟', W / 2, y + T * sc + 14, '#ffe27a', Math.round(4 * S), 'center');
  const n = Object.keys(st.seen).length; let ix = W / 2 - n * 7;
  for (const id of Object.keys(st.seen)) { g.drawImage(tex(+id, 0, 0), ix, y + T * sc + 24); ix += 14; }
  L('按空白鍵重來一局', W / 2, H - 12, '#aaa', Math.round(3.4 * S), 'center');
}

// ---- 主迴圈 ----
let last = performance.now(), timeScale = 1;
function step(dt) {
  if (window.__botTick) window.__botTick(dt); // 測試鉤子：頁面內機器人（只寫 keys / 呼叫商店函式）
  update(dt);
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.screen ? 0 : 160) * dt; p.life -= dt; }
  parts = parts.filter(p => p.life > 0); if (parts.length > 600) parts.splice(0, parts.length - 600);
  for (const p of pops) p.life -= dt * 1.2; pops = pops.filter(p => p.life > 0);
  if (newIcon) { newIcon.life -= dt; if (newIcon.life <= 0) newIcon = null; }
  flash = Math.max(0, flash - dt * 2);
  autosaveT += dt; if (autosaveT > 10) { autosaveT = 0; save(); }
}
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  const total = real * timeScale, n = Math.max(1, Math.ceil(total / 0.05));
  for (let i = 0; i < n; i++) step(total / n);
  draw(real);
  requestAnimationFrame(frame);
}
reset(); if (!load()) save();
addEventListener('resize', resize); resize();
window.__dig = {
  st: () => st, map: () => map, keys, buy, reset, save, load, wipe,
  elev: () => liftState(), ride: rideElevator, locked, liftStops, rideTo: y => liftGo(y), qsort: n => { st.qsort = n; applyQSort(); }, collection, craft, sellMats, matTotal,
  toggleList: () => { listOpen = !listOpen; },
  speed: k => { timeScale = k; }, atShop,
  C: { T, WW, DEPTH, EX, PICK, TANK, BAG, FURN, ELEV, COST, VAL, SMELT, SMELT_BASE, ZONES, BARRIER, HBAND, LIFT_RANGE, hardOf, canDig, zoneOf },
  choiceGap,
};
// 測試用：回報「畫面上同時有幾組互動提示／其他按鈕」
window.__digUI = () => ({
  prompt: facButton() ? 1 : 0,
  other: buttons().length + craftButtons().length + (wipeButton() ? 1 : 0) + (qsortButton() ? 1 : 0) + (liftButton() ? 1 : 0) + (st.liftMenu ? 1 : 0),
  panel: st.panel, list: listOpen,
});
// 判準③：眼前可挖的礦裡，最優與次優的價值差
function digSec(id, y) { return 0.12 + hardOf(id, y) / effPick() * 0.22 + 0.1; }
function choiceGap(y0, picklv, samples) {
  const old = st.lv.pick; st.lv.pick = picklv;
  const gaps = []; samples = samples || 60;
  let s2 = 777;
  const r2 = () => (s2 = (s2 * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let n = 0; n < samples; n++) {
    const cx = 2 + (r2() * (WW - 4)) | 0, cy = Math.max(1, y0 + ((r2() * 20) | 0) - 10);
    const sc = [];
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = cx + dx, yy = cy + dy, id = tile(x, yy);
      if (!VAL[id] || !canDig(id, yy)) continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      let cost = digSec(id, yy); // 目標本身
      cost += dist * 0.55; // 繞路：平均每格挖／移動
      sc.push(VAL[id] * SMELT / cost);
    }
    sc.sort((a, b) => b - a);
    if (sc.length >= 2) gaps.push((sc[0] - sc[1]) / sc[0]);
  }
  st.lv.pick = old;
  gaps.sort((a, b) => a - b);
  return { n: gaps.length, median: gaps.length ? gaps[gaps.length >> 1] : null };
}
requestAnimationFrame(frame);
