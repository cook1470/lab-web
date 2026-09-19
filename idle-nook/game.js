// 小窩（idle-nook）：剖面小公寓大樓，掛機自己熱鬧
'use strict';
const cv = document.getElementById('c'), g = cv.getContext('2d');
let W = 280, H = 130, S = 3;
function resize() {
  S = Math.max(1, Math.floor(innerHeight / 160));
  W = Math.floor(innerWidth / S); H = Math.floor(innerHeight / S);
  cv.width = W; cv.height = H;
  cv.style.width = W * S + 'px'; cv.style.height = H * S + 'px';
  cv.style.left = ((innerWidth - W * S) / 2 | 0) + 'px'; cv.style.top = ((innerHeight - H * S) / 2 | 0) + 'px';
  g.imageSmoothingEnabled = false;
}
addEventListener('resize', resize); resize();

// ---- 調色盤（Sweetie 16）----
const PAL = { dk: '#1a1c2c', purple: '#5d275d', red: '#b13e53', orange: '#ef7d57', yellow: '#ffcd75',
  lgreen: '#a7f070', green: '#38b764', teal: '#257179', dblue: '#29366f', blue: '#3b5dc9',
  lblue: '#41a6f6', cyan: '#73eff7', white: '#f4f4f4', lgray: '#94b0c2', gray: '#566c86', dgray: '#333c57' };

// ---- 小工具 ----
function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const f = k => Math.max(0, Math.min(255, ((n >> k) & 255) + d)); return '#' + ((1 << 24) + (f(16) << 16) + (f(8) << 8) + f(0)).toString(16).slice(1); }
function lerpHex(a, b, t) { const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16); const f = k => { const va = (na >> k) & 255, vb = (nb >> k) & 255; return Math.max(0, Math.min(255, Math.round(va + (vb - va) * t))); }; return '#' + ((1 << 24) + (f(16) << 16) + (f(8) << 8) + f(0)).toString(16).slice(1); }
function hash1(n) { n = n >>> 0; let h = (n * 2654435761) >>> 0; h = ((h ^ (h >>> 13)) * 2246822519) >>> 0; h = (h ^ (h >>> 16)) >>> 0; return h / 4294967296; }
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return hash1(h); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function px(x, y, w, h, c) { g.fillStyle = c; const rx = Math.round(x), ry = Math.round(y); const rw = Math.max(1, Math.round(x + w) - rx), rh = Math.max(1, Math.round(y + h) - ry); g.fillRect(rx, ry, rw, rh); }

// ---- 迷你像素數字（只用來標價，不做文字教學）----
const FONT = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111', '+': '000010111010000' };
function txt(s, x, y, col, sc) { sc = sc || 1; g.fillStyle = col; s = String(s); x = Math.round(x); y = Math.round(y); for (let i = 0; i < s.length; i++) { const f = FONT[s[i]]; if (f) for (let j = 0; j < 15; j++) if (f[j] === '1') g.fillRect(x + (j % 3) * sc, y + ((j / 3) | 0) * sc, sc, sc); x += 4 * sc; } }
function txtW(s, sc) { return String(s).length * 4 * (sc || 1) - (sc || 1); }

// ---- 存檔 ----
const SAVE_KEY = 'idle-nook-v1';
function loadRaw() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function saveRaw() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ T: ST.T, bankBase: ST.bankBase, bankBaseT: ST.bankBaseT, unlocked: ST.unlocked, unlockedAt: ST.unlockedAt, quiet: ST.quiet, lastSeenAt: Date.now() })); } catch (e) {} }

// ---- 擴建定義 ----
const UNLOCKS = [ { id: 'f2r', cost: 30 }, { id: 'gext', cost: 150 }, { id: 'f1r', cost: 600 }, { id: 'attic', cost: 2200 } ];
const COST = {}; UNLOCKS.forEach(u => COST[u.id] = u.cost);

let ST = { T: 150, bankBase: 0, bankBaseT: 150, unlocked: { f2r: false, gext: false, f1r: false, attic: false }, unlockedAt: { f2r: 0, gext: 0, f1r: 0, attic: 0 }, quiet: false };
function unlockedCount() { let n = 0; for (const k in ST.unlocked) if (ST.unlocked[k]) n++; return n; }
function rate() { return 0.05 + 0.02 * unlockedCount(); }
function bank() { return Math.max(0, ST.bankBase + rate() * (ST.T - ST.bankBaseT)); }
function checkpoint() { const b = bank(); ST.bankBase = b; ST.bankBaseT = ST.T; }
var attemptUnlock = function (id) {
  if (ST.unlocked[id]) return false;
  if (bank() >= COST[id]) { checkpoint(); ST.bankBase -= COST[id]; ST.unlocked[id] = true; ST.unlockedAt[id] = ST.T; fxUnlock = 1; fxUnlockRoom = id; return true; }
  fxDeny = 0.4; fxDenyRoom = id; return false;
}
function buyCheapest() { for (const u of UNLOCKS) if (!ST.unlocked[u.id]) return attemptUnlock(u.id) ? u.id : null; return null; }

function plantStage(t, seed) { const off = seed ? hashStr(seed) * 1800 : 0; return Math.min(3, Math.floor((t + off) / 3600)); }

// ---- 時間 / 天氣（全部是 T 的純函式，skip 不需逐格模擬）----
const DAYLEN = 300; // 一天 5 分鐘
function dayPhase(t) { return (t % DAYLEN + DAYLEN) % DAYLEN / DAYLEN; }
function lightLevel(t) { return (1 - Math.cos(2 * Math.PI * dayPhase(t))) / 2; } // 0 半夜 1 正午
const SKYSTOPS = [ { p: 0, top: '#1a1c2c', bot: '#29366f' }, { p: 0.20, top: '#5d275d', bot: '#ef7d57' }, { p: 0.5, top: '#41a6f6', bot: '#73eff7' }, { p: 0.80, top: '#5d275d', bot: '#b13e53' }, { p: 1, top: '#1a1c2c', bot: '#29366f' } ];
function skyColors(t) { const p = dayPhase(t); let a = SKYSTOPS[0], b = SKYSTOPS[SKYSTOPS.length - 1]; for (let i = 0; i < SKYSTOPS.length - 1; i++) if (p >= SKYSTOPS[i].p && p <= SKYSTOPS[i + 1].p) { a = SKYSTOPS[i]; b = SKYSTOPS[i + 1]; break; } const span = (b.p - a.p) || 1, lt = clamp((p - a.p) / span, 0, 1); return { top: lerpHex(a.top, b.top, lt), bot: lerpHex(a.bot, b.bot, lt) }; }
const WCYCLE = 480;
function weather(t) { const idx = Math.floor(t / WCYCLE); if (hash1(idx * 7 + 11) >= 0.32) return 0; const lt = (t % WCYCLE) / WCYCLE; if (lt < 0.30 || lt > 0.85) return 0; return Math.min(clamp((lt - 0.30) / 0.08, 0, 1), clamp((0.85 - lt) / 0.08, 0, 1)); }

// ---- 版面（世界座標；鏡頭只看約兩層，慢慢上下移動）----
let L = null, camY = 0;
function computeLayout() {
  const narrow = W < 150;
  const k = 2;                       // 人物放大倍率（小人至少佔畫面高 1/8）
  const FH = narrow ? Math.max(Math.round(H * 0.36), 16 * k + 12) : Math.max(Math.round(H * 0.46), 16 * k + 12); // 一層樓高
  const WALL = narrow ? 3 : 5;                      // 外牆（磚）厚度
  const mgF = narrow ? 0.03 : 0.12;
  const bx0 = Math.round(W * mgF), bx1 = Math.round(W * (1 - mgF)), bw = bx1 - bx0;
  const ix0 = bx0 + WALL, iw = bw - WALL * 2, half = Math.floor(iw / 2);
  const SLAB = 4;
  const skyH = Math.round(FH * 1.25);
  const roofY = skyH, roofH = Math.round(FH * 0.85);
  const f2Y = roofY + roofH + SLAB, f1Y = f2Y + FH + SLAB, gY = f1Y + FH + SLAB;
  const groundY = gY + FH;
  const streetH = Math.max(18, Math.round(FH * 0.4));
  const worldH = groundY + streetH;
  const atticH = ST.unlocked.attic ? Math.round(FH * 0.85) : Math.round(FH * 0.36);
  const atticW = ST.unlocked.attic ? Math.round(bw * 0.52) : Math.max(28, Math.round(bw * 0.24));
  const extAvail = Math.max(0, W * 0.99 - bx1);
  const extW = ST.unlocked.gext ? Math.min(extAvail, bw * 0.46) : Math.min(extAvail, Math.max(7, bw * 0.14));
  return {
    k, FH, WALL, SLAB, bx0, bx1, bw, ix0, iw, groundY, skyBottom: roofY, worldH,
    roof: { x: bx0, y: roofY, w: bw, h: roofH },
    attic: { x: Math.round(bx0 + (bw - atticW) / 2), y: ST.unlocked.attic ? roofY - atticH : roofY + roofH - atticH, w: atticW, h: atticH },
    f2: { left: { x: ix0, y: f2Y, w: half - 2, h: FH }, right: { x: ix0 + half + 2, y: f2Y, w: iw - half - 2, h: FH } },
    f1: { left: { x: ix0, y: f1Y, w: half - 2, h: FH }, right: { x: ix0 + half + 2, y: f1Y, w: iw - half - 2, h: FH } },
    g: { x: ix0, y: gY, w: iw, h: FH },
    ext: { x: bx1, y: gY, w: extW, h: FH },
    street: { x: 0, y: groundY, w: W, h: streetH },
  };
}
function updateCamera() {
  const top = Math.max(0, L.attic.y - L.FH * 0.35); // 最高只看到屋頂＋溫室，不要一大片空天
  const range = Math.max(0, L.worldH - H - top);
  const tt = performance.now() / 1000;
  let f = 0.5 - 0.5 * Math.cos(tt * 2 * Math.PI / 80); // 80 秒一趟
  if (window.__camOverride != null) f = clamp(window.__camOverride, 0, 1);
  camY = Math.round(top + f * range);
}


// ---- 人物：通用小畫法 ----
function person(x, y, o) {
  // o: {skin,hair,shirt,pants,dir,bob,armA,armB,headTilt,crouch} — y 是腳底基準線，全身高約 11px
  const by = y + (o.bob || 0);
  const c = o.crouch || 0;
  px(x - 2, by - 2 - c, 2, 2 + c, o.pants); px(x, by - 2 - c, 2, 2 + c, o.pants);
  px(x - 2, by - 6 - c, 4, 4, o.shirt);
  const aA = o.armA || 0, aB = o.armB || 0;
  px(x - 4, by - 6 - c + aA, 2, 3, o.skin);
  px(x + 2, by - 6 - c + aB, 2, 3, o.skin);
  const ht = o.headTilt || 0;
  px(x - 2 + ht, by - 10 - c, 4, 4, o.skin);
  px(x - 2 + ht, by - 11 - c, 4, 2, o.hair);
  if (o.hairBack) px(x - 3 + ht, by - 10 - c, 1, 4, o.hair);
}
function cyclePose(t, speed, phase, durs) {
  const total = durs.reduce((a, b) => a + b, 0);
  let lt = ((t * speed + phase) % total + total) % total;
  for (let i = 0; i < durs.length; i++) { if (lt < durs[i]) return { idx: i, f: lt / durs[i] }; lt -= durs[i]; }
  return { idx: 0, f: 0 };
}

// ---- 貓 / 兔 / 鳥 / 蝴蝶 / 螢火蟲 / 雲 ----
function drawCat(x, y, dir, sit) {
  const bob = sit ? Math.sin(GT * 1.5) * 0.4 : 0;
  px(x - 3 * dir, y - 2, 6, 3, PAL.dgray);
  px(x - 3 * dir, y - 4, 3, 2, PAL.dgray);
  px(x + (dir > 0 ? 2 : -3), y - 5, 2, 2, PAL.dgray);
  px(x - 3 * dir + (dir > 0 ? -2 : 5), y - 3 + Math.sin(GT * 3) * 1, 2, 1, PAL.dgray);
  px(x - 2 * dir, y + 1 + bob, 4, 1, PAL.dgray);
  px(x - 1, y - 3, 2, 1, PAL.lgray);
}
function drawRabbit(x, y, hop) {
  const b = Math.max(0, Math.sin(hop) * 3);
  px(x - 2, y - 3 - b, 4, 3, PAL.white);
  px(x - 1, y - 6 - b, 1, 3, PAL.white); px(x + 1, y - 6 - b, 1, 3, PAL.white);
  px(x - 1, y - 5 - b, 1, 1, PAL.lgray); px(x + 1, y - 5 - b, 1, 1, PAL.lgray);
  px(x - 2, y - b, 4, 1, PAL.lgray);
}
function drawBird(x, y, flap) {
  const w = Math.sin(flap) * 2;
  px(x - 3, y - w, 3, 1, PAL.dgray); px(x + 1, y - w, 3, 1, PAL.dgray); px(x - 1, y, 2, 1, PAL.gray);
}
function drawButterfly(x, y, t) {
  const w = Math.sin(t * 10) * 1.5;
  g.fillStyle = PAL.yellow; g.fillRect(Math.round(x - 2 - w), Math.round(y - 1), 2, 2); g.fillRect(Math.round(x + w), Math.round(y - 1), 2, 2);
  px(x, y - 1, 1, 2, PAL.dgray);
}
function drawFirefly(x, y, t) { const a = 0.4 + 0.6 * Math.max(0, Math.sin(t * 3)); g.globalAlpha = a; px(x, y, 1, 1, PAL.lgreen); g.globalAlpha = 1; }
function drawCloud(x, y, w, col) { px(x, y, w, 3, col); px(x + w * 0.2, y - 2, w * 0.6, 3, col); px(x + w * 0.55, y - 1, w * 0.35, 2, col); }

function drawPot(x, y, stage, flowerCol) {
  px(x - 3, y, 6, 4, PAL.orange); px(x - 3, y, 6, 1, PAL.red);
  if (stage >= 0) px(x - 1, y - 2 - stage, 2, 3 + stage, PAL.green);
  if (stage >= 1) { px(x - 3, y - 3 - stage, 3, 2, PAL.green); px(x + 1, y - 4 - stage, 3, 2, PAL.lgreen); }
  if (stage >= 2) { px(x - 4, y - 5 - stage, 3, 2, PAL.lgreen); px(x + 2, y - 3 - stage, 3, 2, PAL.green); }
  if (stage >= 3) { px(x - 1, y - 6 - stage, 3, 3, flowerCol); px(x - 4, y - 4, 2, 2, flowerCol); }
}

// ---- 全域即時時間（動畫相位用；GT 只在畫面存在時前進，跟 ST.T 同步推進）----
let GT = 0;

function drawGardener(x, y, t) {
  const p = cyclePose(t, 1, 0, [2.4, 1.4, 1.8]);
  const bob = Math.sin(t * 2) * 0.6;
  let armA = 0, armB = 0, crouch = 0;
  if (p.idx === 0) { armB = -2 - Math.sin(p.f * Math.PI) * 1.5; } // 澆水
  else if (p.idx === 1) { crouch = 1; armA = 1; } // 蹲看
  else { armA = -1 - Math.sin(p.f * Math.PI) * 2; } // 伸懶腰
  person(x, y, { skin: PAL.orange, hair: PAL.white, shirt: PAL.teal, pants: PAL.dgray, bob, armA, armB, crouch });
  if (p.idx === 0) { px(x + 4, y - 4 + armB, 3, 2, PAL.gray); if ((t * 6 | 0) % 2 === 0) px(x + 6, y - 2 + armB, 1, 2, PAL.cyan); }
}
function drawReader(x, y, t) {
  const p = cyclePose(t, 0.9, 2, [3, 1, 1.6]);
  let armA = -3, armB = -3, headTilt = 0;
  if (p.idx === 1) { armA = -1; armB = -1; headTilt = Math.sin(p.f * Math.PI) > 0.5 ? 1 : 0; }
  person(x, y, { skin: PAL.yellow, hair: PAL.red, shirt: PAL.blue, pants: PAL.dgray, armA, armB, headTilt, bob: Math.sin(t * 1.4) * 0.4 });
  px(x - 1, y - 7, 5, 3, PAL.white);
}
function drawCook(x, y, t) {
  const p = cyclePose(t, 1.1, 1, [2, 1.2, 1.6]);
  let armA = -2, armB = -2;
  if (p.idx === 0) armA = -3 + Math.sin(p.f * Math.PI * 2) * 2;
  else if (p.idx === 1) armB = -5;
  else armA = -3, armB = -4 + Math.sin(p.f * Math.PI) * 1;
  person(x, y, { skin: PAL.orange, hair: PAL.dgray, shirt: PAL.white, pants: PAL.gray, armA, armB, bob: Math.sin(t * 2.2) * 0.5 });
  px(x - 2, y - 12, 4, 2, PAL.white);
}
function drawShopkeeper(x, y, t) {
  const p = cyclePose(t, 1, 3, [2.2, 1.4, 2]);
  let armA = -2, armB = -2;
  if (p.idx === 0) armB = -3 + Math.sin(p.f * Math.PI * 3) * 2;
  else if (p.idx === 2) armA = -4;
  person(x, y, { skin: PAL.yellow, hair: PAL.purple, shirt: PAL.green, pants: PAL.dgray, armA, armB, bob: Math.sin(t * 1.8) * 0.4 });
}
function drawCustomer(x, y, t) {
  const p = cyclePose(t, 0.7, 5, [3.5, 1.2]);
  let headTilt = p.idx === 1 ? (Math.sin(p.f * Math.PI * 2) > 0 ? 1 : -1) : 0;
  person(x, y, { skin: PAL.orange, hair: PAL.gray, shirt: PAL.blue, pants: PAL.dgray, headTilt, bob: Math.sin(t * 1.2) * 0.3, armA: -3, armB: -3 });
}
function drawUkulele(x, y, t) {
  const p = cyclePose(t, 1.6, 4, [1.4, 1.4, 1]);
  let armB = -3 + Math.sin(t * 8) * 1.5, headTilt = Math.sin(t * 4) > 0 ? 1 : 0;
  person(x, y, { skin: PAL.yellow, hair: PAL.blue, shirt: PAL.lgreen, pants: PAL.teal, armA: -3, armB, headTilt, bob: Math.abs(Math.sin(t * 3)) * 1.2 });
  px(x + 2, y - 5, 3, 4, PAL.orange); px(x + 3, y - 4, 1, 2, PAL.dgray);
}
function drawCrafter(x, y, t) {
  const p = cyclePose(t, 1.3, 6, [1.2, 1.2, 1.6]);
  let armA = -2, armB = -2 - Math.abs(Math.sin(t * 6)) * 3;
  if (p.idx === 2) { armA = -5; armB = -5; }
  person(x, y, { skin: PAL.orange, hair: PAL.dk === PAL.dk ? PAL.dgray : PAL.dgray, shirt: PAL.orange, pants: PAL.gray, armA, armB, bob: Math.sin(t * 2) * 0.4 });
}
function drawBotanist(x, y, t, night) {
  const p = cyclePose(t, 0.8, 7, [2, 2, 1.5]);
  let armA = -2, armB = -2, headTilt = 0;
  if (night) { headTilt = Math.sin(t * 1.5) * 0 + 0; armB = -6; }
  else if (p.idx === 0) armB = -4 + Math.sin(p.f * Math.PI) * 1;
  person(x, y, { skin: PAL.yellow, hair: PAL.purple, shirt: PAL.dblue, pants: PAL.dgray, armA, armB, headTilt, bob: Math.sin(t * 1.6) * 0.4 });
  if (night) { px(x + 3, y - 6, 2, 5, PAL.gray); px(x + 2, y - 7, 3, 2, PAL.dgray); }
}

// ---- 放大畫（人、動物、盆栽用整數倍率畫，保持像素感）----
function big(x, y, fn, s) { s = s || L.k; g.save(); g.translate(Math.round(x), Math.round(y)); g.scale(s, s); fn(); g.restore(); }
function nightDim(t) { return clamp(1 - lightLevel(t) * 1.4, 0, 1); }

// ---- 紋理 ----
function speckle(x, y, w, h, col, density, seed) {
  g.fillStyle = col; const n = Math.round(w * h * density);
  for (let i = 0; i < n; i++) { const hx = hash1(seed * 131 + i * 7), hy = hash1(seed * 57 + i * 13); g.fillRect(Math.round(x + hx * (w - 1)), Math.round(y + hy * (h - 1)), 1, 1); }
}
function brick(x, y, w, h, seed) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  px(x, y, w, h, '#7a3b3f');
  for (let row = 0; row * 3 < h; row++) {
    const yy = y + row * 3; px(x, yy, w, 1, '#5a2a33');
    const off = row % 2 ? 3 : 0;
    for (let bx = x - off; bx < x + w; bx += 6) { if (bx >= x) px(bx, yy + 1, 1, Math.min(2, y + h - yy - 1), '#5a2a33'); }
  }
  speckle(x, y, w, h, '#9a4d4d', 0.05, seed);
}
function planks(x, y, w, h, base, seed) {
  px(x, y, w, h, base); px(x, y, w, 1, shade(base, 30));
  for (let i = 0; i < w; i += 9) px(x + i + (hash1(seed + i) * 4 | 0), y + 1, 1, h - 1, shade(base, -28));
  speckle(x, y + 1, w, h - 1, shade(base, -16), 0.08, seed + 3);
}
// 房間內牆：壁紙＋腰板＋踢腳板＋木地板＋天花板陰影
function roomInterior(r, paper, stripe, wains, floorCol, seed, pattern) {
  const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
  px(x, y, w, h, paper);
  if (pattern === 'tile') { for (let yy = y; yy < y + h * 0.7; yy += 5) px(x, yy, w, 1, stripe); for (let xx = x; xx < x + w; xx += 5) px(xx, y, 1, h * 0.7, stripe); }
  else if (pattern === 'dots') { for (let yy = y + 3; yy < y + h * 0.66; yy += 6) for (let xx = x + ((yy / 6 | 0) % 2 ? 3 : 0); xx < x + w; xx += 6) px(xx, yy, 1, 1, stripe); }
  else if (pattern === 'board') { for (let xx = x; xx < x + w; xx += 7) px(xx, y, 1, h, stripe); }
  else { for (let xx = x; xx < x + w; xx += 6) px(xx, y, 2, h * 0.66, stripe); }
  speckle(x, y, w, h * 0.66, shade(paper, -10), 0.03, seed);
  const wy = Math.round(y + h * 0.66);
  px(x, wy, w, h - wy + y, wains); px(x, wy, w, 1, shade(wains, 30));
  for (let xx = x + 4; xx < x + w; xx += 8) px(xx, wy + 2, 1, h - (wy - y) - 6, shade(wains, -18));
  planks(x, y + h - 4, w, 4, floorCol, seed + 9);
  g.globalAlpha = 0.25; px(x, y, w, 3, PAL.dk); g.globalAlpha = 0.12; px(x, y + 3, w, 3, PAL.dk); g.globalAlpha = 1;
}
function windowView(x, y, w, h, t, seed) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const sc = skyColors(t);
  px(x - 1, y - 1, w + 2, h + 2, PAL.dk);
  const grd = g.createLinearGradient(0, y, 0, y + h); grd.addColorStop(0, sc.top); grd.addColorStop(1, sc.bot);
  g.fillStyle = grd; g.fillRect(x, y, w, h);
  if (lightLevel(t) > 0.3) { const cx = x + ((t * 3 + seed * 40) % (w + 10)) - 5; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); px(cx, y + h * 0.3, 6, 2, PAL.white); g.restore(); }
  px(x + w / 2, y, 1, h, PAL.white); px(x, y + h / 2, w, 1, PAL.white);
  px(x - 2, y + h, w + 4, 2, PAL.white);
  px(x - 2, y - 2, 3, h + 2, PAL.red); px(x + w - 1, y - 2, 3, h + 2, PAL.red); // 窗簾
}
function picture(x, y, w, h, col) { px(x - 1, y - 1, w + 2, h + 2, '#6b4a2b'); px(x, y, w, h, PAL.lblue); px(x, y + h * 0.55, w, h * 0.45, col); px(x + w * 0.6, y + 1, 2, 2, PAL.yellow); }
function rug(cx, fy, w, col) { px(cx - w / 2, fy - 1, w, 2, col); for (let i = 0; i < w; i += 3) px(cx - w / 2 + i, fy - 1, 1, 1, PAL.yellow); }
function floorLamp(x, fy, h, on) { px(x, fy - h, 1, h, PAL.dgray); px(x - 3, fy - h - 3, 7, 4, PAL.yellow); if (on) lampGlow(x, fy - h, true); }
function ceilLamp(x, y, on) { px(x, y, 1, 4, PAL.dgray); px(x - 3, y + 4, 7, 2, PAL.dgray); if (on) lampGlow(x, y + 7, true); }
function roomDark(r, t) { const d = nightDim(t); if (d <= 0) return; g.globalAlpha = d * 0.28; px(r.x, r.y, r.w, r.h, PAL.dk); g.globalAlpha = 1; }

function lampGlow(x, y, on) { if (on) { const gr = g.createRadialGradient(x, y, 0, x, y, 16); gr.addColorStop(0, 'rgba(255,205,117,0.6)'); gr.addColorStop(1, 'rgba(255,205,117,0)'); g.fillStyle = gr; g.fillRect(x - 16, y - 16, 32, 32); px(x - 1, y - 1, 2, 2, PAL.yellow); } else { px(x - 1, y - 1, 2, 2, PAL.gray); } }
function windowLit(t, seed) { const th = 0.28 + hashStr(seed) * 0.24; return lightLevel(t) < th; }

function lockBadge(cx, cy, cost, denyShake) {
  cx = Math.round(cx); cy = Math.round(cy);
  const sx = denyShake ? Math.round(Math.sin(GT * 60) * 1.5) : 0;
  big(cx + sx, cy, () => {
    const pulse = Math.round(2.6 + Math.sin(GT * 3) * 0.8);
    px(-5, -5, 10, 10, PAL.dgray);
    px(-pulse, -1, pulse * 2, 2, PAL.yellow); px(-1, -pulse, 2, pulse * 2, PAL.yellow);
  }, 2);
}
function drawLockedRoom(r, cost, denyShake) {
  const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
  px(x, y, w, h, '#2b2433');
  for (let i = 0; i < h; i += 7) planks(x, y + i, w, 6, '#8a5a3b', i + 5); // 封起來的木板
  const n = Math.max(6, w / 5 | 0);
  for (let i = 0; i <= n; i++) { const tt = i / n; px(x + 2 + (w - 6) * tt, y + 2 + (h - 6) * tt, 3, 3, '#5a3a24'); px(x + 2 + (w - 6) * tt, y + h - 5 - (h - 6) * tt, 3, 3, '#5a3a24'); }
  lockBadge(x + w / 2, y + h / 2 - 6, cost, denyShake); regIcon('lock', x + w / 2, y + h / 2 - 6);
}

function drawSky(t) {
  const sc = skyColors(t);
  const grd = g.createLinearGradient(0, 0, 0, L.groundY);
  grd.addColorStop(0, sc.top); grd.addColorStop(1, sc.bot);
  g.fillStyle = grd; g.fillRect(0, 0, W, L.groundY);
  const light = lightLevel(t);
  const p = dayPhase(t); const arc = Math.sin(p * Math.PI);
  if (arc > 0.02) { const sx = p * W; const sy = L.skyBottom * (1 - arc) * 0.8 + 8; const isDay = p > 0.15 && p < 0.85; big(sx, sy, () => { px(-4, -4, 8, 8, isDay ? PAL.yellow : PAL.white); px(-2, -2, 4, 4, isDay ? PAL.orange : PAL.lgray); }, 2); }
  if (light < 0.4) { for (let i = 0; i < 40; i++) { const sx = hash1(i * 13 + 7) * W, sy = hash1(i * 29 + 3) * L.worldH * 0.8; const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + hash1(i) * 2) + i); g.globalAlpha = clamp((0.4 - light) / 0.4, 0, 1) * tw; px(sx, sy, 1, 1, PAL.white); } g.globalAlpha = 1; }
  // 遠方城市剪影（分兩層，天空不再是一片平塗）
  const farCol = lerpHex('#29366f', '#94b0c2', light * 0.7), nearCol = lerpHex('#1a1c2c', '#566c86', light * 0.7);
  for (let i = 0; i < W; i += 7) { const hh = 20 + hash1(i * 3 + 1) * L.FH * 1.6; px(i, L.groundY - hh, 7, hh, farCol); if (light < 0.35 && hash1(i) > 0.5) px(i + 2, L.groundY - hh + 4, 1, 1, PAL.yellow); }
  for (let i = 0; i < W; i += 11) { const hh = 12 + hash1(i * 5 + 9) * L.FH * 0.9; px(i, L.groundY - hh, 10, hh, nearCol); for (let wy = L.groundY - hh + 3; wy < L.groundY - 3; wy += 5) if (hash1(i * 7 + wy) > (light < 0.35 ? 0.4 : 0.8)) px(i + 3, wy, 2, 2, light < 0.35 ? PAL.yellow : shade(nearCol, 25)); }
  if (light > 0.12) { g.globalAlpha = clamp(light, 0.25, 1); for (let i = 0; i < 4; i++) { const cw = W * 0.22; const cx = ((t * (4 + i * 2) + i * 300) % (W + cw * 2)) - cw; big(cx, L.skyBottom * (0.2 + i * 0.22) + i * L.FH * 0.6, () => drawCloud(0, 0, cw / 2, PAL.white), 2); } g.globalAlpha = 1; }
  if (light > 0.3) for (let i = 0; i < 3; i++) { const bx = ((t * (18 + i * 6) + i * 300) % (W + 40)) - 20; const by = L.skyBottom * (0.3 + i * 0.25) + Math.sin(t * 2 + i) * 3; big(bx, by, () => drawBird(0, 0, t * 8 + i * 2), 2); }
}

function drawBuilding(t) {
  const k = L.k, rf = L.roof;
  // 外牆磚框（整棟）
  brick(L.bx0, rf.y + rf.h, L.bw, L.groundY - rf.y - rf.h, 1);
  // ---- 屋頂露台（戶外）----
  planks(rf.x - 2, rf.y + rf.h - 5, rf.w + 4, 5, '#8a5a3b', 77);
  px(rf.x - 3, rf.y + rf.h, rf.w + 6, 3, '#5d275d');
  const railY = rf.y + rf.h - 5 - 3 * k;
  px(rf.x, railY, rf.w, 1, PAL.white); for (let i = 0; i < rf.w; i += 5) px(rf.x + i, railY, 1, 3 * k, PAL.lgray);
  const chX = rf.x + rf.w * 0.08, chY = rf.y + rf.h * 0.05;
  brick(chX, chY, 9, rf.h - 5 - rf.h * 0.05, 9); px(chX - 1, chY - 2, 11, 3, PAL.dgray);
  for (let i = 0; i < 5; i++) { const age = ((t * 6 + i * 6) % 24); const sy = chY - 2 - age * 2.4; const sx = chX + 4 + Math.sin((t + i) * 1.3) * (2 + age * 0.3); g.globalAlpha = clamp(1 - age / 24, 0, 1) * 0.5; { const r = Math.round(2 + age * 0.15), ox = Math.round(sx - r), oy = Math.round(sy); px(ox + 1, oy, r * 2 - 2, r * 2, PAL.white); px(ox, oy + 1, r * 2, r * 2 - 2, PAL.white); } g.globalAlpha = 1; }
  const fy = rf.y + rf.h - 5;
  // 曬衣繩
  const lx0 = rf.x + rf.w * 0.58, lx1 = rf.x + rf.w * 0.96, ly = rf.y + rf.h * 0.25;
  px(lx0, ly, 1, fy - ly, PAL.dgray); px(lx1, ly, 1, fy - ly, PAL.dgray); px(lx0, ly, lx1 - lx0, 1, PAL.dgray);
  const clothCols = [PAL.red, PAL.blue, PAL.yellow, PAL.white];
  for (let i = 0; i < 4; i++) { const cx = lx0 + (lx1 - lx0) * (0.12 + i * 0.22); const sway = Math.sin(t * 1.6 + i) * 1.4; px(cx - 3 + sway, ly + 1, 6, 8 + (i % 2) * 3, clothCols[i]); px(cx - 3 + sway, ly + 1, 6, 1, shade(clothCols[i], -30)); }
  // 陽傘＋長椅＋花盆
  const ux = rf.x + rf.w * 0.24;
  px(ux, fy - rf.h * 0.55, 1, rf.h * 0.55, PAL.dgray); px(ux - 12, fy - rf.h * 0.6, 25, 4, PAL.red); for (let i = -12; i < 13; i += 6) px(ux + i, fy - rf.h * 0.6, 3, 4, PAL.white);
  px(ux + 3, fy - 6, 14, 2, '#6b4a2b'); px(ux + 4, fy - 4, 1, 4, '#6b4a2b'); px(ux + 15, fy - 4, 1, 4, '#6b4a2b');
  big(rf.x + rf.w * 0.47, fy - 4 * k, () => drawPot(0, 0, plantStage(t, 'potRoof1'), PAL.red), 1.5);
  big(rf.x + rf.w * 0.52, fy - 4 * k, () => drawPot(0, 0, plantStage(t, 'potRoof2'), PAL.yellow), 1.5);
  big(rf.x + rf.w * 0.37, fy, () => drawGardener(0, 0, t)); regP('roof', rf.x + rf.w * 0.37, fy);
  // 屋頂溫室
  const at = L.attic;
  if (ST.unlocked.attic) {
    px(at.x - 2, at.y - 3, at.w + 4, 3, PAL.teal);
    // 溫室架在露台上方，補四根柱子落到地板，不要懸空
    for (const fx of [0.02, 0.34, 0.64, 0.96]) px(Math.round(at.x + at.w * fx), at.y + at.h, 2, L.roof.h, PAL.teal);
    g.globalAlpha = 0.55; px(at.x, at.y, at.w, at.h, PAL.cyan); g.globalAlpha = 1;
    for (let i = 0; i < at.w; i += 8) px(at.x + i, at.y, 1, at.h, PAL.teal);
    planks(at.x, at.y + at.h - 4, at.w, 4, '#8a5a3b', 31);
    for (let i = 0; i < 4; i++) big(at.x + at.w * (0.12 + i * 0.12), at.y + at.h - 4 - 4 * k, () => drawPot(0, 0, plantStage(t, 'potAttic' + i), [PAL.lgreen, PAL.red, PAL.yellow, PAL.purple][i]), 1.5);
    big(at.x + at.w * 0.75, at.y + at.h - 4, () => drawBotanist(0, 0, t, lightLevel(t) < 0.3)); regP('attic', at.x + at.w * 0.75, at.y + at.h - 4);
    ceilLamp(at.x + at.w * 0.6, at.y, windowLit(t, 'attic'));
  } else drawLockedRoom(at, COST.attic, fxDenyRoom === 'attic' && fxDeny > 0);

  // ---- 二樓左：讀書房 ----
  const f2l = L.f2.left, f2r = L.f2.right;
  { const r = f2l, fy = r.y + r.h - 4;
    roomInterior(r, '#e8c9a0', '#dcb68a', '#8a5a3b', '#b86f50', 11, 'stripe');
    windowView(r.x + r.w * 0.62, r.y + r.h * 0.16, r.w * 0.22, r.h * 0.34, t, 1);
    const shX = r.x + 3, shW = r.w * 0.2, shH = r.h * 0.72; px(shX, fy - shH, shW, shH, '#6b4a2b');
    for (let s = 0; s < 4; s++) { const sy = fy - shH + 2 + s * shH / 4; px(shX + 1, sy + shH / 4 - 3, shW - 2, 1, '#4a321e'); for (let b = 0; b < shW - 3; b += 2) px(shX + 1 + b, sy + 2 + (hash1(s * 9 + b) * 2 | 0), 2, shH / 4 - 5, [PAL.red, PAL.blue, PAL.green, PAL.yellow, PAL.purple][(s + b) % 5]); }
    picture(r.x + r.w * 0.32, r.y + r.h * 0.2, 10, 8, PAL.green);
    rug(r.x + r.w * 0.5, fy, r.w * 0.4, PAL.purple);
    px(r.x + r.w * 0.36, fy - 12, 18, 9, PAL.orange); px(r.x + r.w * 0.36, fy - 17, 4, 14, shade(PAL.orange, -30)); px(r.x + r.w * 0.36 + 16, fy - 13, 3, 10, shade(PAL.orange, -30));
    floorLamp(r.x + r.w * 0.3, fy, r.h * 0.5, windowLit(t, 'f2l'));
    big(r.x + r.w * 0.9, fy - 4 * k, () => drawPot(0, 0, plantStage(t, 'potF2l'), PAL.blue), 1.5);
    big(r.x + r.w * 0.46, fy, () => drawReader(0, 0, t)); regP('f2l', r.x + r.w * 0.46, fy);
    big(r.x + r.w * 0.72, fy - 1, () => drawCat(0, 0, 1, true));
    roomDark(r, t);
  }
  // ---- 二樓右：音樂角 ----
  if (ST.unlocked.f2r) { const r = f2r, fy = r.y + r.h - 4;
    roomInterior(r, '#a7c4e0', '#94b0c2', '#3b5dc9', '#8a5a3b', 21, 'dots');
    windowView(r.x + r.w * 0.12, r.y + r.h * 0.16, r.w * 0.22, r.h * 0.34, t, 2);
    px(r.x + r.w * 0.45, r.y + r.h * 0.15, 12, 16, PAL.yellow); px(r.x + r.w * 0.45 + 2, r.y + r.h * 0.15 + 3, 8, 6, PAL.red); // 海報
    px(r.x + r.w * 0.66, fy - 16, 12, 12, PAL.lblue); px(r.x + r.w * 0.66, fy - 8, 12, 4, PAL.white); // 床
    px(r.x + r.w * 0.88, fy - 14, 7, 14, PAL.dgray); px(r.x + r.w * 0.88 + 2, fy - 11, 3, 3, PAL.gray); px(r.x + r.w * 0.88 + 2, fy - 6, 3, 3, PAL.gray); // 喇叭
    rug(r.x + r.w * 0.4, fy, r.w * 0.36, PAL.red);
    ceilLamp(r.x + r.w * 0.55, r.y, windowLit(t, 'f2r'));
    big(r.x + r.w * 0.06, fy - 4 * k, () => drawPot(0, 0, plantStage(t, 'potF2r'), PAL.purple), 1.5);
    big(r.x + r.w * 0.36, fy, () => drawUkulele(0, 0, t)); regP('f2r', r.x + r.w * 0.36, fy); regIcon('notes', r.x + r.w * 0.36 + 14, r.y + r.h * 0.4);
    for (let i = 0; i < 2; i++) { const a = (t * 0.6 + i * 0.5) % 1; g.globalAlpha = 1 - a; big(r.x + r.w * 0.36 + 8 + a * 12, r.y + r.h * 0.5 - a * r.h * 0.3, () => { px(0, 0, 2, 2, PAL.dgray); px(1, -4, 1, 4, PAL.dgray); }, 2); g.globalAlpha = 1; }
    roomDark(r, t);
  } else drawLockedRoom(f2r, COST.f2r, fxDenyRoom === 'f2r' && fxDeny > 0);

  // ---- 一樓左：廚房 ----
  const f1l = L.f1.left, f1r = L.f1.right;
  { const r = f1l, fy = r.y + r.h - 4;
    roomInterior(r, '#f4f4f4', '#cfdbe3', '#257179', '#94b0c2', 31, 'tile');
    px(r.x + 3, r.y + r.h * 0.12, r.w * 0.45, r.h * 0.18, '#b86f50'); px(r.x + 3, r.y + r.h * 0.3, r.w * 0.45, 1, '#6b4a2b'); for (let i = 1; i < 3; i++) px(r.x + 3 + i * r.w * 0.15, r.y + r.h * 0.12, 1, r.h * 0.18, '#6b4a2b'); // 吊櫃
    px(r.x + r.w * 0.84, fy - r.h * 0.62, r.w * 0.13, r.h * 0.62, PAL.white); px(r.x + r.w * 0.84, fy - r.h * 0.4, r.w * 0.13, 1, PAL.lgray); px(r.x + r.w * 0.86, fy - r.h * 0.55, 1, 5, PAL.gray); // 冰箱
    const stX = r.x + r.w * 0.5, stW = r.w * 0.3; px(stX, fy - r.h * 0.34, stW, r.h * 0.34, PAL.gray); px(stX, fy - r.h * 0.34, stW, 2, PAL.dgray); px(stX + 3, fy - r.h * 0.2, stW - 6, r.h * 0.12, PAL.dgray);
    px(stX + stW * 0.3, fy - r.h * 0.34 - 6, stW * 0.4, 6, PAL.dgray);
    for (let i = 0; i < 4; i++) { const age = ((t * 2.4 + i * 5) % 18); g.globalAlpha = clamp(1 - age / 18, 0, 1) * 0.6; px(stX + stW * 0.5 + Math.sin((t + i) * 2) * 2, fy - r.h * 0.34 - 8 - age * 1.6, 3, 3, PAL.white); g.globalAlpha = 1; }
    px(r.x + 4, fy - r.h * 0.34, r.w * 0.34, r.h * 0.34, '#b86f50'); px(r.x + 4, fy - r.h * 0.34, r.w * 0.34, 2, PAL.lgray); // 流理台
    for (let i = 0; i < 3; i++) px(r.x + 7 + i * 6, fy - r.h * 0.34 - 4, 4, 4, [PAL.red, PAL.yellow, PAL.lgreen][i]);
    for (let i = 0; i < 3; i++) px(r.x + r.w * 0.55 + i * 5, r.y + 3, 2, 6 + (i % 2) * 2, PAL.green); // 香草
    ceilLamp(r.x + r.w * 0.3, r.y, windowLit(t, 'f1l'));
    big(r.x + r.w * 0.45, fy, () => drawCook(0, 0, t)); regP('f1l', r.x + r.w * 0.45, fy); regIcon('steam', stX + stW * 0.5, fy - r.h * 0.34 - 14);
    roomDark(r, t);
  }
  // ---- 一樓右：工作坊 ----
  if (ST.unlocked.f1r) { const r = f1r, fy = r.y + r.h - 4;
    roomInterior(r, '#c9a77a', '#a7865e', '#566c86', '#6b4a2b', 41, 'board');
    px(r.x + r.w * 0.55, r.y + r.h * 0.12, r.w * 0.38, r.h * 0.3, '#8a6a44'); for (let yy = 2; yy < r.h * 0.3; yy += 4) for (let xx = 2; xx < r.w * 0.38; xx += 4) px(r.x + r.w * 0.55 + xx, r.y + r.h * 0.12 + yy, 1, 1, '#5a4430'); // 洞洞板
    px(r.x + r.w * 0.6, r.y + r.h * 0.16, 2, 8, PAL.gray); px(r.x + r.w * 0.7, r.y + r.h * 0.16, 6, 2, PAL.gray); px(r.x + r.w * 0.82, r.y + r.h * 0.16, 2, 9, PAL.red);
    px(r.x + r.w * 0.5, fy - 12, r.w * 0.45, 3, '#6b4a2b'); px(r.x + r.w * 0.52, fy - 9, 2, 9, '#4a321e'); px(r.x + r.w * 0.92, fy - 9, 2, 9, '#4a321e'); // 工作台
    for (let i = 0; i < 3; i++) px(r.x + 4 + i * 2, fy - 8 - i * 7, 12, 7, i % 2 ? '#b86f50' : '#8a5a3b'); // 木箱
    for (let i = 0; i < 6; i++) px(r.x + r.w * (0.4 + hash1(i) * 0.5), fy - 1, 1, 1, PAL.yellow); // 木屑
    ceilLamp(r.x + r.w * 0.7, r.y, windowLit(t, 'f1r'));
    big(r.x + r.w * 0.68, fy, () => drawCrafter(0, 0, t)); regP('f1r', r.x + r.w * 0.68, fy);
    roomDark(r, t);
  } else drawLockedRoom(f1r, COST.f1r, fxDenyRoom === 'f1r' && fxDeny > 0);

  // ---- 地面樓：小店 ----
  { const r = L.g, fy = r.y + r.h - 4;
    roomInterior(r, '#ffcd75', '#efb95f', '#b13e53', '#8a5a3b', 51, 'stripe');
    // 櫥窗
    windowView(r.x + r.w * 0.04, r.y + r.h * 0.14, r.w * 0.16, r.h * 0.36, t, 3);
    // 架子上的罐子
    for (let s = 0; s < 2; s++) { const sy = r.y + r.h * (0.22 + s * 0.18); px(r.x + r.w * 0.26, sy, r.w * 0.22, 2, '#6b4a2b'); for (let j = 0; j < 5; j++) px(r.x + r.w * 0.27 + j * r.w * 0.04, sy - 5, 3, 5, [PAL.cyan, PAL.lgreen, PAL.orange, PAL.purple, PAL.yellow][(j + s) % 5]); }
    px(r.x + r.w * 0.22, fy - r.h * 0.32, r.w * 0.3, r.h * 0.32, '#6b4a2b'); px(r.x + r.w * 0.22, fy - r.h * 0.32, r.w * 0.3, 2, '#b86f50'); // 櫃台
    px(r.x + r.w * 0.44, fy - r.h * 0.32 - 5, 6, 5, PAL.dgray); // 收銀機
    px(r.x + r.w * 0.56, fy - r.h * 0.62, r.w * 0.09, r.h * 0.62, '#4a321e'); px(r.x + r.w * 0.57, fy - r.h * 0.58, r.w * 0.07, r.h * 0.25, PAL.lblue); // 門
    px(r.x + r.w * 0.74, fy - 11, r.w * 0.16, 2, PAL.red); px(r.x + r.w * 0.75, fy - 9, 1, 9, '#4a321e'); px(r.x + r.w * 0.89, fy - 9, 1, 9, '#4a321e'); // 桌
    px(r.x + r.w * 0.8, fy - 15, 4, 4, PAL.white); // 杯
    for (let i = 0; i < 3; i++) px(r.x + r.w * 0.93, fy - 7 - i * 7, 8, 7, i % 2 ? '#b86f50' : '#8a5a3b');
    ceilLamp(r.x + r.w * 0.35, r.y, windowLit(t, 'g')); ceilLamp(r.x + r.w * 0.82, r.y, windowLit(t, 'g2'));
    big(r.x + r.w * 0.33, fy, () => drawShopkeeper(0, 0, t)); regP('g', r.x + r.w * 0.33, fy);
    big(r.x + r.w * 0.7, fy, () => drawCustomer(0, 0, t));
    roomDark(r, t);
    // 雨棚
    for (let i = 0; i < L.bw; i += 8) px(L.bx0 + i, r.y - L.SLAB, 8, L.SLAB, i % 16 ? PAL.white : PAL.red);
  }
  // 外牆夜晚變暗（室內保持亮，室內外分得開）
  const d = nightDim(t);
  if (d > 0) { g.globalAlpha = d * 0.45; g.fillStyle = PAL.dk;
    g.fillRect(L.bx0, L.roof.y + L.roof.h, L.WALL, L.groundY - L.roof.y - L.roof.h); g.fillRect(L.bx1 - L.WALL, L.roof.y + L.roof.h, L.WALL, L.groundY - L.roof.y - L.roof.h); g.globalAlpha = 1; }
}

function drawExt(t) {
  const e = L.ext; if (e.w <= 1) return; const k = L.k;
  if (!ST.unlocked.gext) {
    px(e.x, e.y + e.h * 0.55, e.w, e.h * 0.45, PAL.gray);
    for (let i = 0; i < e.w; i += 6) px(e.x + i, e.y + e.h * 0.55, 2, e.h * 0.45, PAL.orange);
    if (e.w > 14) lockBadge(e.x + e.w / 2, e.y + e.h * 0.35, COST.gext, fxDenyRoom === 'gext' && fxDeny > 0);
    return;
  }
  px(e.x, e.y + e.h - 5, e.w, 5, PAL.green); speckle(e.x, e.y + e.h - 5, e.w, 5, PAL.lgreen, 0.2, 61);
  for (let i = 0; i < e.w; i += 5) px(e.x + i, e.y + e.h * 0.6, 1, e.h * 0.4, PAL.white);
  px(e.x, e.y + e.h * 0.66, e.w, 1, PAL.white);
  big(e.x + e.w * 0.25, e.y + e.h - 4 * k - 2, () => drawPot(0, 0, plantStage(t, 'potExt1'), PAL.red), 1.5);
  big(e.x + e.w * 0.75, e.y + e.h - 4 * k - 2, () => drawPot(0, 0, plantStage(t, 'potExt2'), PAL.orange), 1.5);
  { const rbx = e.x + e.w * 0.5 + Math.sin(t * 0.6) * e.w * 0.18; big(rbx, e.y + e.h - 3, () => drawRabbit(0, 0, (t * 2.3) % (Math.PI * 2))); regP('gext', rbx, e.y + e.h - 3); }
  if (lightLevel(t) < 0.35) for (let i = 0; i < 4; i++) drawFirefly(e.x + hash1(i * 91 + 3) * e.w, e.y + e.h * 0.4 + Math.sin(t * (1 + i * 0.3) + i) * e.h * 0.25, t + i * 3);
}

function drawTree(x, gy, t, h, w) {
  const sway = Math.sin(t * 0.8) * (w * 0.06);
  px(x - 1, gy - h * 0.42, 3, h * 0.42, '#6b4a2b');
  px(x - w / 2 + sway * 0.5, gy - h, w, h * 0.62, PAL.green);
  px(x - w * 0.3 + sway, gy - h * 1.12, w * 0.6, h * 0.4, PAL.lgreen);
  speckle(x - w / 2 + sway * 0.5, gy - h, w, h * 0.62, PAL.teal, 0.08, 71);
  if (lightLevel(t) < 0.3) drawFirefly(x + Math.sin(t * 1.3) * (w * 0.3), gy - h * 0.7 + Math.cos(t * 1.1) * 4, t);
}
function drawStreet(t) {
  const s = L.street, k = L.k;
  // 人行道磚
  const walkH = Math.round(s.h * 0.4);
  px(0, s.y, W, walkH, '#94b0c2'); for (let i = 0; i < W; i += 8) px(i, s.y, 1, walkH, '#566c86'); px(0, s.y + walkH - 1, W, 1, '#566c86');
  px(0, s.y + walkH, W, s.h - walkH, '#333c57'); speckle(0, s.y + walkH, W, s.h - walkH, '#414a66', 0.12, 81);
  for (let i = -1; i < W / 14 + 1; i++) px(i * 14 + 3, s.y + walkH + (s.h - walkH) / 2, 7, 1, PAL.yellow);
  if (L.bx0 > 16) drawTree(L.bx0 * 0.55, s.y, t, Math.max(26, L.FH * 0.9), Math.max(14, L.bx0 * 0.8));
  const lampX = Math.max(3, L.bx0 * 0.12);
  px(lampX, s.y - L.FH * 0.7, 2, L.FH * 0.7, PAL.dgray); lampGlow(lampX + 1, s.y - L.FH * 0.7, lightLevel(t) < 0.35);
  px(L.bx1 + Math.min(6, W * 0.02), s.y - 8, 5, 8, PAL.red);
  const catX = L.bx0 * 0.5 + Math.sin(t * 0.22) * (L.bx0 * 0.45 + 6);
  big(catX, s.y + walkH - 1, () => drawCat(0, 0, Math.cos(t * 0.22) >= 0 ? 1 : -1, false));
  big(L.bx0 + L.bw * 0.1, s.y + 1, () => drawBasket(0, 0, t), 2); regIcon('basket', L.bx0 + L.bw * 0.1, s.y - 2);
}
function drawRain(t) {
  const w = weather(t); if (w <= 0) return;
  g.globalAlpha = 0.6 * w; g.fillStyle = PAL.cyan;
  const n = Math.round(20 + w * (ST.quiet ? 16 : 40));
  for (let i = 0; i < n; i++) { const rx = hash1(i * 17 + 5) * W; const ry = camY + ((t * 240 + hash1(i * 31) * 900) % (H + 10)); g.fillRect(rx | 0, ry | 0, 1, 4); }
  g.globalAlpha = 1;
}
function drawBasket(x, y, t) {
  const b = bank();
  px(x - 5, y, 10, 5, PAL.orange); px(x - 5, y, 10, 1, PAL.red);
  const fillN = Math.min(8, Math.floor(clamp(b / 5, 0, 8)));
  const cols = [PAL.red, PAL.blue, PAL.lgreen, PAL.yellow];
  for (let i = 0; i < fillN; i++) { const bx = x - 4 + (i % 4) * 2.4; const by = y - 1 - Math.floor(i / 4) * 2; px(bx, by, 2, 2, cols[i % cols.length]); }
  const crates = Math.min(8, Math.floor(Math.max(0, b - 40) / 300));
  for (let i = 0; i < crates; i++) px(x + 8 + (i % 4) * 6, y - Math.floor(i / 4) * 5, 4, 4, PAL.gray);
}

// ---- 歡迎回來卡片（DOM，避免像素字擠中文）----
const cardEl = document.getElementById('card');
let cardVisible = false;
function showWelcome(awaySec, gained, grew) {
  const h = Math.floor(awaySec / 3600), m = Math.floor((awaySec % 3600) / 60);
  const timeStr = h > 0 ? (h + ' 小時 ' + m + ' 分') : (Math.max(1, m) + ' 分鐘');
  let html = '歡迎回來！你離開了 <b>' + timeStr + '</b>。<br>這段時間住戶們照常做事，小店一直在賣手作，門口的籃子多了 <b>' + gained + '</b> 顆毛線球（這個遊戲的錢）。';
  if (grew) html += '<br>窗台上的植物也長大了一點。';
  html += '<br>現在一共有 <b>' + Math.floor(bank()) + '</b> 顆毛線球，存夠了就去點鎖住的房間把它打開。';
  html += '<span class="hint">點一下這張卡片關閉</span>';
  cardEl.innerHTML = html; cardEl.style.display = 'block'; cardVisible = true;
}
cardEl.addEventListener('pointerdown', e => { e.stopPropagation(); cardEl.style.display = 'none'; cardVisible = false; });

// ---- 安靜模式 ----
const quietBtn = document.getElementById('quietBtn');
function syncQuietBtn() { quietBtn.classList.toggle('on', ST.quiet); quietBtn.textContent = ST.quiet ? '● 安靜模式' : '○ 安靜模式'; }
quietBtn.addEventListener('click', () => { ST.quiet = !ST.quiet; syncQuietBtn(); saveRaw(); });

// ---- 點擊：解鎖 ----
let fxUnlock = 0, fxUnlockRoom = null, fxDeny = 0, fxDenyRoom = null;
function toLogic(cx, cy) { const r = cv.getBoundingClientRect(); return [(cx - r.left) / S, (cy - r.top) / S + camY]; }
cv.addEventListener('pointerdown', e => {
  if (cardVisible) { cardEl.style.display = 'none'; cardVisible = false; return; }
  if (!L) return;
  const [lx, ly] = toLogic(e.clientX, e.clientY);
  const hit = (r) => lx >= r.x && lx < r.x + r.w && ly >= r.y && ly < r.y + r.h;
  if (!ST.unlocked.f2r && hit(L.f2.right)) { attemptUnlock('f2r'); return; }
  if (!ST.unlocked.f1r && hit(L.f1.right)) { attemptUnlock('f1r'); return; }
  if (!ST.unlocked.gext && hit(L.ext)) { attemptUnlock('gext'); return; }
  if (!ST.unlocked.attic && hit(L.attic)) { attemptUnlock('attic'); return; }
  uiTap(lx, ly, hit);
});

// ---- 主渲染 ----
function draw() {
  L = computeLayout(); updateCamera(); PEOPLE = {}; ICONS = {};
  g.fillStyle = PAL.dk; g.fillRect(0, 0, W, H);
  g.save(); g.translate(0, -camY);
  drawSky(ST.T);
  drawStreet(ST.T);
  drawExt(ST.T);
  drawBuilding(ST.T);
  drawRain(ST.T);
  g.restore();
  try { updateUI(); } catch (e) { console.error(e); }
  if (fxUnlock > 0) { g.globalAlpha = fxUnlock * 0.5; g.fillStyle = PAL.white; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
}

// ---- 看得懂的 UI 層（DOM 疊在畫布上：房名、住戶小卡、首次說明）----
let PEOPLE = {}, ICONS = {};
function regP(room, x, y) { PEOPLE[room] = { x, y }; }
function regIcon(id, x, y) { (ICONS[id] = ICONS[id] || []).push({ x, y }); }
const RATE_TXT = v => (v * 60).toFixed(1).replace(/\.0$/, '');
// 每個房間：名字、住戶、正在做什麼、產出什麼
const ROOMS = {
  roof: { name: '屋頂露台', who: '阿嬤', role: '住頂樓的園丁', doing: '在幫盆栽澆水，偶爾伸個懶腰。', out: '不產毛線球，是大家曬衣服、休息的地方。' },
  f2l: { name: '讀書房', who: '小書', role: '愛看書的房客', doing: '窩在沙發上看書，貓在旁邊打盹。', out: '不產毛線球，是小書住的房間。' },
  g: { name: '手作小店', who: '美美', role: '小店老闆', doing: '在櫃台招呼客人、擦桌子。', out: '賣手作賺毛線球：每分鐘 +3。', base: true },
  f1l: { name: '廚房', who: '阿福', role: '大樓的廚師', doing: '在爐子前煮大家的晚餐。', out: '不產毛線球，負責讓大家吃飽。' },
  f2r: { name: '音樂角', who: '小安', role: '會彈烏克麗麗的小孩', doing: '在彈烏克麗麗，音符飄出來。', out: '表演吸引客人：每分鐘 +1.2 毛線球。', cost: 30, unlockTxt: '會多一間音樂角，小安會搬進來' },
  gext: { name: '前院花圃', who: '小白', role: '住在花圃的兔子', doing: '在花圃裡跳來跳去。', out: '種花拿去店裡賣：每分鐘 +1.2 毛線球。', cost: 150, unlockTxt: '會多一塊前院花圃，還有一隻兔子' },
  f1r: { name: '工作坊', who: '老鐵', role: '木工師傅', doing: '在工作台上敲敲打打做木箱。', out: '做木工擺店裡賣：每分鐘 +1.2 毛線球。', cost: 600, unlockTxt: '會多一間工作坊，老鐵會來上班' },
  attic: { name: '屋頂溫室', who: '小葉', role: '植物學家', doing: '在照顧溫室裡的花，晚上會拿燈巡一圈。', out: '稀有盆栽拿去賣：每分鐘 +1.2 毛線球。', cost: 2200, unlockTxt: '屋頂會長出一整間溫室，小葉會搬進來' },
};
function roomRect(id) { return id === 'roof' ? L.roof : id === 'attic' ? L.attic : id === 'g' ? L.g : id === 'gext' ? L.ext : id === 'f2l' ? L.f2.left : id === 'f2r' ? L.f2.right : id === 'f1l' ? L.f1.left : L.f1.right; }
function toScreen(x, y) { const r = cv.getBoundingClientRect(); return [r.left + x * S, r.top + (y - camY) * S]; }

const uiEl = document.getElementById('ui'), linesEl = document.getElementById('lines');
const hudEl = document.getElementById('hud'), hintEl = document.getElementById('hint'), infoEl = document.getElementById('info');
const chips = {};
function chip(id, cls) { if (!chips[id]) { const d = document.createElement('div'); d.className = 'chip ' + (cls || ''); uiEl.appendChild(d); chips[id] = d; } return chips[id]; }
function placeClamped(el, x, y) { const w = el.offsetWidth, h = el.offsetHeight; el.style.left = Math.round(clamp(x, 4, innerWidth - w - 4)) + 'px'; el.style.top = Math.round(clamp(y, 4, innerHeight - h - 4)) + 'px'; }

// 首次說明：一次只出一條，跟著目標走，看過就不再出
const SEEN_KEY = 'idle-nook-seen-v1';
let seen = {}; try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (e) {}
const CALLOUTS = [
  { id: 'basket', text: '門口的籃子：賺到的毛線球會堆在這裡' },
  { id: 'lock', text: '＋號＝還沒打開的房間，存夠毛線球點它' },
  { id: 'steam', text: '冒煙＝阿福正在煮飯' },
  { id: 'notes', text: '音符＝小安正在彈琴' },
];
let callout = null; // {id, el, until}
let tapped = false, sel = null, denyUntil = 0, denyRoom = null;
function updateCallout(now) {
  if (callout && now > callout.until) { callout.el.remove(); callout = null; linesEl.innerHTML = ''; }
  if (!callout && !sel) {
    const c = CALLOUTS.find(c => !seen[c.id] && visIcon(c.id));
    if (c) { seen[c.id] = 1; try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) {} const el = document.createElement('div'); el.className = 'callout'; el.textContent = c.text; uiEl.appendChild(el); callout = { id: c.id, el, until: now + 7000 }; }
  }
  if (!callout) return;
  const ic = visIcon(callout.id); if (!ic) { callout.el.style.display = 'none'; linesEl.innerHTML = ''; return; } callout.el.style.display = '';
  const [sx, sy] = toScreen(ic.x, ic.y);
  const el = callout.el, w = el.offsetWidth, h = el.offsetHeight;
  const tx = sx + (sx > innerWidth / 2 ? -w - 36 : 36), ty = sy - h - 34;
  placeClamped(el, tx, Math.max(ty, 52));
  const ex = parseFloat(el.style.left) + (sx > innerWidth / 2 ? w : 0), ey = parseFloat(el.style.top) + h;
  linesEl.innerHTML = '<line x1="' + sx + '" y1="' + sy + '" x2="' + ex + '" y2="' + ey + '" stroke="#f4f4f4" stroke-width="2"/><circle cx="' + sx + '" cy="' + sy + '" r="3" fill="#f4f4f4"/>';
}
function visIcon(id) { return (ICONS[id] || []).find(onScreen); }
function onScreen(p) { const [sx, sy] = toScreen(p.x, p.y); return sx > 10 && sx < innerWidth - 10 && sy > 40 && sy < innerHeight - 50; }

function updateUI() {
  const now = performance.now(), b = bank();
  hudEl.innerHTML = '🧶 毛線球 <b>' + Math.floor(b) + '</b> <span>每分鐘 +' + RATE_TXT(rate()) + '</span>';
  // 房名／解鎖標籤
  for (const id in ROOMS) {
    const R = ROOMS[id], r = roomRect(id);
    const locked = R.cost && !ST.unlocked[id];
    const el = chip(id, locked ? 'lock' : '');
    if (locked && id === 'gext' && r.w <= 14) { el.style.display = 'none'; continue; }
    el.style.display = '';
    if (locked) {
      el.className = 'chip lock' + (b >= R.cost ? ' can' : '') + (denyRoom === id && now < denyUntil ? ' deny' : '');
      const html = (denyRoom === id && now < denyUntil) ? '毛線球不夠，還差 ' + Math.ceil(R.cost - b) + ' 顆' : '解鎖：' + R.cost + ' 毛線球<br><small>' + R.unlockTxt + '</small>';
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      const [sx, sy0] = toScreen(r.x + r.w / 2, r.y + r.h / 2 + 6);
      const sy = id === 'attic' ? toScreen(0, r.y + r.h)[1] + 2 : sy0;
      el.style.maxWidth = Math.max(120, r.w * S - 6) + 'px';
      if (sy < 48 || sy > innerHeight - 40) { el.style.display = 'none'; continue; }
      placeClamped(el, sx - el.offsetWidth / 2, sy);
    } else {
      const html = R.name + '・' + R.who;
      if (el._h !== html) { el.innerHTML = html; el._h = html; el.className = 'chip'; }
      const [sx, sy] = toScreen(r.x, r.y), yb = toScreen(0, r.y + r.h)[1], y = Math.max(sy + 3, 48);
      if (yb < y + 40 || y > innerHeight - 40) { el.style.display = 'none'; continue; }
      placeClamped(el, sx + 3, y);
    }
  }
  // 首次提示
  const hint = !tapped ? '點任何房間或人，看他是誰、在做什麼。毛線球會自己慢慢賺，存夠了點鎖住的房間解鎖。' : '';
  if (hintEl._h !== hint) { hintEl.textContent = hint; hintEl._h = hint; hintEl.style.display = hint ? '' : 'none'; }
  updateCallout(now);
  updateInfo();
}

// 小卡：不准蓋住被點的人
function showInfo(id) {
  const R = ROOMS[id];
  infoEl.innerHTML = '<h3>' + R.who + '</h3><div class="role">' + R.role + '・住在' + R.name + '</div>' +
    '<div class="row"><span class="k">正在：</span>' + R.doing + '</div>' +
    '<div class="row"><span class="k">這房間產出：</span>' + R.out + '</div><div class="x">點別的地方關閉</div>';
  infoEl.style.display = 'block'; sel = id;
  if (callout) { callout.el.remove(); callout = null; linesEl.innerHTML = ''; }
}
function hideInfo() { infoEl.style.display = 'none'; sel = null; linesEl.innerHTML = ''; }
function updateInfo() {
  if (!sel) return;
  const p = PEOPLE[sel]; if (!p) return;
  const [sx, sy] = toScreen(p.x, p.y);
  const pr = { l: sx - 7 * S * L.k, r: sx + 7 * S * L.k, t: sy - 14 * S * L.k, b: sy + 2 };
  const w = infoEl.offsetWidth, h = infoEl.offsetHeight, m = 8;
  const cands = [[pr.r + 14, sy - h / 2], [pr.l - 14 - w, sy - h / 2], [sx - w / 2, pr.t - 14 - h], [sx - w / 2, pr.b + 14]];
  let best = null;
  for (const [x0, y0] of cands) {
    const x = clamp(x0, m, innerWidth - w - m), y = clamp(y0, 44, innerHeight - h - m);
    const hitP = !(x + w < pr.l || x > pr.r || y + h < pr.t || y > pr.b);
    if (!hitP) { best = [x, y]; break; }
  }
  if (!best) best = [clamp(cands[0][0], m, innerWidth - w - m), m];
  infoEl.style.left = Math.round(best[0]) + 'px'; infoEl.style.top = Math.round(best[1]) + 'px';
  linesEl.innerHTML = '<rect x="' + pr.l + '" y="' + pr.t + '" width="' + (pr.r - pr.l) + '" height="' + (pr.b - pr.t) + '" fill="none" stroke="#ffcd75" stroke-width="2" rx="4"/>';
}
function uiTap(lx, ly, hit) {
  tapped = true;
  // 先找人（放寬判定），再找房間
  let pick = null;
  for (const id in PEOPLE) { const p = PEOPLE[id]; if (Math.abs(lx - p.x) <= 7 * L.k && ly <= p.y + 2 && ly >= p.y - 14 * L.k) { pick = id; break; } }
  if (!pick) for (const id in ROOMS) { if ((!ROOMS[id].cost || ST.unlocked[id]) && hit(roomRect(id))) { pick = id; break; } }
  if (pick && pick !== sel) showInfo(pick); else hideInfo();
}
infoEl.addEventListener('pointerdown', e => { e.stopPropagation(); hideInfo(); });
const _attempt = attemptUnlock;
attemptUnlock = function (id) { tapped = true; hideInfo(); const ok = _attempt(id); if (!ok && !ST.unlocked[id]) { denyRoom = id; denyUntil = performance.now() + 1800; } return ok; };

// ---- 主迴圈 ----
let last = performance.now(), saveTimer = 3;
function frame(now) {
  const rawDt = (now - last) / 1000; last = now;
  GT += Math.min(Math.max(rawDt, 0), 0.05) * 20; // 給快速小動畫用的真時間相位（denyshake/pulse），不受 catch-up 影響
  if (rawDt > 2) {
    if (rawDt > 300) { const b0 = bank(), s0 = plantStage(ST.T); ST.T += rawDt; const b1 = bank(), s1 = plantStage(ST.T); showWelcome(rawDt, Math.max(0, Math.round(b1 - b0)), s1 > s0); }
    else ST.T += rawDt;
  } else ST.T += Math.max(0, rawDt);
  fxUnlock = Math.max(0, fxUnlock - rawDt * 1.5);
  fxDeny = Math.max(0, fxDeny - rawDt);
  try { draw(); } catch (e) { console.error(e); }
  saveTimer -= Math.min(Math.max(rawDt, 0), 1); if (saveTimer <= 0) { saveTimer = 3; saveRaw(); }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveRaw(); });
addEventListener('pagehide', saveRaw);

// ---- 初始化 / 讀檔（含離線追趕）----
function init() {
  const raw = loadRaw();
  if (raw) {
    ST.bankBase = raw.bankBase || 0; ST.bankBaseT = raw.bankBaseT || 0; ST.T = raw.T || 0;
    ST.unlocked = Object.assign({ f2r: false, gext: false, f1r: false, attic: false }, raw.unlocked || {});
    ST.unlockedAt = Object.assign({ f2r: 0, gext: 0, f1r: 0, attic: 0 }, raw.unlockedAt || {});
    ST.quiet = !!raw.quiet;
    const awaySec = raw.lastSeenAt ? Math.max(0, (Date.now() - raw.lastSeenAt) / 1000) : 0;
    if (awaySec > 300) { const b0 = bank(), s0 = plantStage(ST.T); ST.T += awaySec; const b1 = bank(), s1 = plantStage(ST.T); showWelcome(awaySec, Math.max(0, Math.round(b1 - b0)), s1 > s0); }
    else ST.T += awaySec;
  }
  syncQuietBtn();
  requestAnimationFrame(frame);
}
init();

// ---- 測試掛鉤 ----
window.__nook = {
  skip(seconds) { ST.T += Math.max(0, seconds); },
  buyCheapest() { return buyCheapest(); },
  unlock(id) { return attemptUnlock(id); },
  setQuiet(v) { ST.quiet = !!v; syncQuietBtn(); },
  state() { return { T: ST.T, bank: bank(), unlocked: Object.assign({}, ST.unlocked), rate: rate(), quiet: ST.quiet }; },
};