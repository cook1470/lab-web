'use strict';
/* DIG 美術樣張 — 純 canvas，無外部資源
   規矩（design/ART_PIPELINE.md）：
   - 不是像素風：剪影／色塊／線條
   - 光是「畫進去」的固定色階，不隨相機重算
   - 純黑只給會動的／可互動的（礦機、電梯廂）
   - 純白只給提示（收藏亮起、按鈕提示點）
   - 遠景只到深灰、越遠越淺
   - UI 一律有中文字，顏色不是唯一線索（礦靠形狀分）
*/

const C = document.getElementById('c');
const X = C.getContext('2d');
const W = 1920, H = 1080, T = 64;
const SURF = 5 * T;            // 320 地表
const LY = [320, 576, 832, 1080]; // 三個地層的邊界

const FONT = '"PingFang TC","Heiti TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
const f = (s, w) => `${w || 600} ${s}px ${FONT}`;

/* ---------- 基本工具 ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function poly(pts, fill, stroke, lw) {
  X.beginPath(); pts.forEach((p, i) => i ? X.lineTo(p[0], p[1]) : X.moveTo(p[0], p[1])); X.closePath();
  if (fill) { X.fillStyle = fill; X.fill(); }
  if (stroke) { X.strokeStyle = stroke; X.lineWidth = lw || 2; X.stroke(); }
}
function rr(x, y, w, h, r, fill, stroke, lw) {
  X.beginPath(); X.moveTo(x + r, y);
  X.arcTo(x + w, y, x + w, y + h, r); X.arcTo(x + w, y + h, x, y + h, r);
  X.arcTo(x, y + h, x, y, r); X.arcTo(x, y, x + w, y, r); X.closePath();
  if (fill) { X.fillStyle = fill; X.fill(); }
  if (stroke) { X.strokeStyle = stroke; X.lineWidth = lw || 2; X.stroke(); }
}
function circ(x, y, r, fill, stroke, lw) {
  X.beginPath(); X.arc(x, y, r, 0, 7); if (fill) { X.fillStyle = fill; X.fill(); }
  if (stroke) { X.strokeStyle = stroke; X.lineWidth = lw || 2; X.stroke(); }
}
function txt(s, x, y, size, color, align, weight) {
  X.font = f(size, weight); X.fillStyle = color; X.textAlign = align || 'left';
  X.textBaseline = 'alphabetic'; X.fillText(s, x, y);
}

/* 場景註解標籤（樣張用）：小牌子＋引線 */
function tag(text, lx, ly, tx, ty) {
  X.save();
  X.font = f(24, 700);
  const w = X.measureText(text).width + 30, h = 42;
  const px = lx - w / 2, py = ly - h / 2;
  if (tx !== undefined) {
    X.strokeStyle = 'rgba(232,226,214,.45)'; X.lineWidth = 2;
    X.beginPath(); X.moveTo(lx, ly + (ty > ly ? h / 2 : -h / 2)); X.lineTo(tx, ty); X.stroke();
    circ(tx, ty, 5, 'rgba(232,226,214,.8)');
  }
  rr(px, py, w, h, 8, 'rgba(14,12,18,.82)', 'rgba(232,226,214,.35)', 2);
  txt(text, lx, ly + 9, 24, '#e8e2d6', 'center', 700);
  X.restore();
}

/* ---------- 天空與遠景 ---------- */
function sky() {
  const g = X.createLinearGradient(0, 0, 0, SURF);
  g.addColorStop(0, '#221b2c'); g.addColorStop(.45, '#3d2a38');
  g.addColorStop(.78, '#7a3f3c'); g.addColorStop(1, '#b8623a');
  X.fillStyle = g; X.fillRect(0, 0, W, SURF);

  // 太陽（畫死的光源，不影響任何物件的明暗）
  const s = X.createRadialGradient(1500, 268, 10, 1500, 268, 190);
  s.addColorStop(0, 'rgba(255,214,150,.95)'); s.addColorStop(.25, 'rgba(240,150,90,.5)');
  s.addColorStop(1, 'rgba(240,150,90,0)');
  X.fillStyle = s; X.fillRect(1280, 60, 460, 400);
  circ(1500, 268, 36, '#ffdca8');

  // 雲：橫向暗帶
  const r = rng(7);
  X.fillStyle = 'rgba(40,28,40,.35)';
  for (let i = 0; i < 9; i++) {
    const y = 40 + r() * 190, x = r() * W, w = 220 + r() * 420, h = 10 + r() * 18;
    X.beginPath(); X.ellipse(x, y, w / 2, h / 2, 0, 0, 7); X.fill();
  }

  ridge(3, SURF - 6, '#6d5560', 120, 0.9);   // 最遠＝最淺
  ridge(11, SURF - 4, '#4b3a4a', 100, 1.3);
  ridge(23, SURF - 2, '#332638', 78, 1.9);
}
function ridge(seed, base, color, amp, freq) {
  const r = rng(seed); const pts = [[0, base]];
  let y = base - amp * (0.4 + r() * 0.6);
  for (let x = 0; x <= W; x += 40) {
    y += (r() - 0.5) * amp * 0.34 * freq;
    y = Math.max(base - amp * 1.5, Math.min(base - 12, y));
    pts.push([x, y]);
  }
  pts.push([W, base]);
  poly(pts, color);
  // 遠處的礦業剪影：井架與煙囪
  X.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const x = 120 + r() * (W - 240), yb = base - amp * 0.35;
    if (seed === 11) {
      X.fillRect(x, yb - 70, 9, 70); X.fillRect(x + 44, yb - 52, 9, 52);
      poly([[x - 12, yb - 70], [x + 60, yb - 52], [x + 60, yb - 44], [x - 12, yb - 62]], color);
    } else if (seed === 23) {
      X.fillRect(x, yb - 90, 13, 90);
      poly([[x - 10, yb - 90], [x + 23, yb - 90], [x + 17, yb - 104], [x - 4, yb - 104]], color);
    }
  }
}

/* ---------- 地層 ---------- */
function strata() {
  // 底色
  const bands = [
    { y0: LY[0], y1: LY[1], base: '#4a3928', name: 'grain' },
    { y0: LY[1], y1: LY[2], base: '#3a2d2b', name: 'crack' },
    { y0: LY[2], y1: LY[3], base: '#2a2432', name: 'bed' },
  ];
  bands.forEach(b => { X.fillStyle = b.base; X.fillRect(0, b.y0, W, b.y1 - b.y0); });

  // 越深越暗（畫死的深度色階）
  const g = X.createLinearGradient(0, LY[0], 0, LY[3]);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.42)');
  X.fillStyle = g; X.fillRect(0, LY[0], W, LY[3] - LY[0]);

  texGrain(LY[0] + 8, LY[1]);
  texCrack(LY[1], LY[2]);
  texBed(LY[2], LY[3]);

  boundary(LY[1], '#6b503a', '#1d1517', 31);
  X.fillStyle = 'rgba(122,106,146,.10)'; X.fillRect(0, LY[2] - 26, W, 26);
  boundary(LY[2], '#8d7ba6', '#100c18', 53);
  boundary(LY[2] + 22, 'rgba(141,123,166,.35)', 'rgba(12,9,20,.6)', 71);
}
function texGrain(y0, y1) { // 顆粒
  const r = rng(101);
  for (let i = 0; i < 2600; i++) {
    const x = r() * W, y = y0 + r() * (y1 - y0), s = 1.5 + r() * 3.5;
    X.fillStyle = r() < .55 ? 'rgba(122,98,66,.42)' : 'rgba(26,18,12,.42)';
    X.beginPath(); X.ellipse(x, y, s, s * .78, r() * 3, 0, 7); X.fill();
  }
  for (let i = 0; i < 46; i++) { // 小石子
    const x = r() * W, y = y0 + r() * (y1 - y0), s = 7 + r() * 13;
    const p = []; for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283; const rad = s * (.7 + r() * .5); p.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad * .8]); }
    poly(p, 'rgba(34,24,16,.55)');
    poly(p.map(q => [q[0], q[1] - 3]), 'rgba(140,114,78,.16)');
  }
}
function texCrack(y0, y1) { // 裂紋
  const r = rng(202);
  X.lineCap = 'round';
  for (let i = 0; i < 64; i++) {
    let x = r() * W, y = y0 + r() * (y1 - y0);
    let a = (r() - .5) * 3;
    const len = 3 + Math.floor(r() * 6);
    X.beginPath(); X.moveTo(x, y);
    for (let k = 0; k < len; k++) { a += (r() - .5) * 1.5; const d = 16 + r() * 40; x += Math.cos(a) * d; y += Math.sin(a) * d; X.lineTo(x, y); }
    X.strokeStyle = 'rgba(16,11,12,.7)'; X.lineWidth = 1 + r() * 3.5; X.stroke();
    X.strokeStyle = 'rgba(148,120,104,.16)'; X.lineWidth = 1.2; X.stroke();
  }
  for (let i = 0; i < 900; i++) { const x = r() * W, y = y0 + r() * (y1 - y0); X.fillStyle = 'rgba(0,0,0,.2)'; X.fillRect(x, y, 2, 2); }
}
function texBed(y0, y1) { // 層理
  const r = rng(303);
  for (let y = y0 + 10; y < y1; y += 12 + r() * 13) {
    X.beginPath(); X.moveTo(0, y);
    let yy = y;
    for (let x = 0; x <= W; x += 60) { yy += (r() - .5) * 7; X.lineTo(x, yy); }
    X.strokeStyle = r() < .5 ? 'rgba(150,140,180,.34)' : 'rgba(6,4,10,.6)';
    X.lineWidth = 2 + r() * 7; X.stroke();
  }
  for (let i = 0; i < 26; i++) { // 斜向的錯動
    const x = r() * W, y = y0 + r() * (y1 - y0);
    X.beginPath(); X.moveTo(x, y); X.lineTo(x + 40 + r() * 90, y + 30 + r() * 70);
    X.strokeStyle = 'rgba(0,0,0,.4)'; X.lineWidth = 2; X.stroke();
  }
}
function boundary(y, light, dark, seed) {
  const r = rng(seed); const pts = []; let yy = y;
  for (let x = 0; x <= W; x += 30) { yy = y + (r() - .5) * 13; pts.push([x, yy]); }
  X.beginPath(); pts.forEach((p, i) => i ? X.lineTo(p[0], p[1]) : X.moveTo(p[0], p[1]));
  X.strokeStyle = light; X.lineWidth = 7; X.stroke();
  X.beginPath(); pts.forEach((p, i) => i ? X.lineTo(p[0], p[1] + 9) : X.moveTo(p[0], p[1] + 9));
  X.strokeStyle = dark; X.lineWidth = 9; X.stroke();
  for (let x = 0; x < W; x += 12 + r() * 26) { // 分界的碎屑
    const s = 3 + r() * 7; poly([[x, y + 14], [x + s, y + 14 - s * .8], [x + s * 2, y + 14]], 'rgba(0,0,0,.42)');
  }
}

/* ---------- 礦（形狀各不同，顏色只是冗餘訊號） ---------- */
function pocket(x, y, r) { // 讓礦看起來是長在土裡的
  const p = []; const rr2 = rng(Math.floor(x * 7 + y));
  for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283; const rad = r * (1.15 + rr2() * .45); p.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad * .85]); }
  poly(p, 'rgba(0,0,0,.34)');
  poly(p.map(q => [q[0], q[1] - 4]), 'rgba(255,230,190,.05)');
}
const ORE = {
  coal: { name: '煤', draw: (r) => { // 圓鈍團塊
    const q = rng(9); const n = 6;
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.283 + .3, d = r * (.1 + q() * .48), s = r * (.34 + q() * .2);
      const cx = Math.cos(a) * d, cy = Math.sin(a) * d * .85;
      circ(cx, cy, s, '#20232a', '#4d5460', Math.max(1.5, r * .06));
      X.beginPath(); X.arc(cx - s * .22, cy - s * .28, s * .5, 3.6, 5.6); X.strokeStyle = 'rgba(122,132,148,.55)'; X.lineWidth = Math.max(1.5, r * .07); X.stroke();
    }
  } },
  iron: { name: '鐵', draw: (r) => { // 立方塊：直角剪影、冷色、內有條紋
    const q = rng(4);
    const cube = (cx, cy, a, sz) => {
      const c = Math.cos(a), sn = Math.sin(a);
      const P = (ux, uy) => [cx + ux * c - uy * sn, cy + ux * sn + uy * c];
      const d = sz * .42;                       // 頂面的斜深
      const fr = [P(-sz, -sz + d), P(sz, -sz + d), P(sz, sz), P(-sz, sz)];   // 正面
      const tp = [P(-sz, -sz + d), P(-sz + d, -sz - d * .5), P(sz + d, -sz - d * .5), P(sz, -sz + d)]; // 頂面
      const rt = [P(sz, -sz + d), P(sz + d, -sz - d * .5), P(sz + d, sz - d * .5), P(sz, sz)];         // 側面
      poly(fr, '#6b7583', '#161a20', Math.max(2, r * .07));
      poly(tp, '#98a2ae', '#161a20', Math.max(2, r * .07));
      poly(rt, '#454e5a', '#161a20', Math.max(2, r * .07));
      X.save();
      X.beginPath(); fr.forEach((pt, i) => i ? X.lineTo(pt[0], pt[1]) : X.moveTo(pt[0], pt[1])); X.closePath(); X.clip();
      X.strokeStyle = 'rgba(20,24,30,.55)'; X.lineWidth = Math.max(1.5, r * .05);
      for (let k = -2; k <= 2; k++) { const A = P(-sz * 2, k * sz * .42), B = P(sz * 2, k * sz * .42); X.beginPath(); X.moveTo(A[0], A[1]); X.lineTo(B[0], B[1]); X.stroke(); }
      X.restore();
    };
    cube(-r * .3, r * .28, .1, r * .42);
    cube(r * .34, r * .34, -.12, r * .34);
    cube(r * .02, -r * .3, .06, r * .5);
  } },
  copper: { name: '銅', draw: (r) => { // 樹枝狀礦脈（短粗、帶結核）
    const q = rng(15);
    const branch = (x, y, a, len, w) => {
      if (len < r * .12) return;
      const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
      X.beginPath(); X.moveTo(x, y); X.lineTo(nx, ny);
      X.strokeStyle = '#c0703a'; X.lineWidth = w; X.lineCap = 'round'; X.stroke();
      X.beginPath(); X.moveTo(x, y); X.lineTo(nx, ny);
      X.strokeStyle = 'rgba(240,170,110,.55)'; X.lineWidth = w * .35; X.stroke();
      if (len < r * .2) circ(nx, ny, w * .85, '#e39a5e');
      branch(nx, ny, a - .7 - q() * .3, len * .56, w * .62);
      branch(nx, ny, a + .7 + q() * .3, len * .56, w * .62);
    };
    branch(-r * .8, r * .55, -.75, r * .62, Math.max(4.5, r * .24));
    branch(-r * .15, r * .05, -.3, r * .46, Math.max(3.5, r * .17));
    branch(-r * .35, r * .3, -1.95, r * .4, Math.max(3.5, r * .17));
  } },
  gold: { name: '金', draw: (r) => { // 圓滴：只有圓，沒有直角，排成一條斜帶
    const q = rng(21);
    const drops = [];
    for (let i = 0; i < 7; i++) {
      const t = i / 6 - .5;
      const cx = t * r * 1.5 + (q() - .5) * r * .18;
      const cy = -t * r * .62 + (q() - .5) * r * .24;
      drops.push([cx, cy, r * (.16 + q() * .16)]);
    }
    drops.forEach(d => circ(d[0], d[1], d[2] * 1.45, 'rgba(90,64,20,.5)'));  // 圍岩裡的暈
    drops.forEach(d => {
      circ(d[0], d[1], d[2], '#e2b23c', '#6b4a12', Math.max(1.5, r * .045));
      circ(d[0] - d[2] * .32, d[1] - d[2] * .34, d[2] * .42, '#f6e08a');
    });
  } },
  crystal: { name: '水晶', draw: (r) => { // 長柱狀晶簇
    const q = rng(33);
    const base = r * .55;
    for (let i = 0; i < 5; i++) {
      const a = -1.57 + (i - 2) * .42 + (q() - .5) * .18;
      const len = r * (.75 + q() * .5), w = r * (.15 + q() * .08);
      const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
      const bx = (i - 2) * base * .38, by = r * .45;
      const tipx = bx + ux * len, tipy = by + uy * len;
      poly([[bx - px * w, by - py * w], [bx + px * w, by + py * w],
      [tipx + px * w * .35, tipy + py * w * .35], [tipx, tipy - r * .1],
      [tipx - px * w * .35, tipy - py * w * .35]], '#5fb6b4', '#123033', Math.max(1.6, r * .05));
      poly([[bx - px * w, by - py * w], [bx, by], [tipx, tipy - r * .1], [tipx - px * w * .35, tipy - py * w * .35]], '#97e0da');
    }
  } },
};
function drawOre(kind, x, y, r) {
  pocket(x, y, r);
  X.save(); X.translate(x, y); ORE[kind].draw(r); X.restore();
}

/* ---------- 洞：已挖通的空間 ---------- */
const CAVE = '#15111a';
function cavity(x, y, w, h, seed) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i <= w; i += 26) pts.push([x + i, y + (r() - .5) * 22]);
  for (let i = 0; i <= h; i += 26) pts.push([x + w + (r() - .5) * 18, y + i]);
  for (let i = w; i >= 0; i -= 26) pts.push([x + i, y + h + (r() - .5) * 22]);
  for (let i = h; i >= 0; i -= 26) pts.push([x + (r() - .5) * 18, y + i]);
  poly(pts, CAVE);
  X.save(); X.beginPath(); pts.forEach((p, i) => i ? X.lineTo(p[0], p[1]) : X.moveTo(p[0], p[1])); X.closePath(); X.clip();
  // 洞頂的暗、洞底的積屑（畫死的光）
  const g = X.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(.55, 'rgba(0,0,0,0)');
  X.fillStyle = g; X.fillRect(x - 20, y - 20, w + 40, h + 40);
  X.fillStyle = 'rgba(70,56,44,.5)'; X.fillRect(x - 20, y + h - 12, w + 40, 20);
  X.restore();
  X.strokeStyle = 'rgba(0,0,0,.5)'; X.lineWidth = 3;
  X.beginPath(); pts.forEach((p, i) => i ? X.lineTo(p[0], p[1]) : X.moveTo(p[0], p[1])); X.closePath(); X.stroke();
  return pts;
}
let TUNPTS = null;

/* ---------- 地面設施 ---------- */
function headframe(x, yb) { // 電梯井口（井架）
  const D = '#241d26', M = '#3a2f3c', L = '#544459';
  // 支腳
  poly([[x - 78, yb], [x - 58, yb], [x - 12, yb - 176], [x - 26, yb - 176]], M);
  poly([[x + 78, yb], [x + 58, yb], [x + 12, yb - 176], [x + 26, yb - 176]], M);
  // 斜撐
  X.strokeStyle = D; X.lineWidth = 6;
  for (let i = 0; i < 4; i++) {
    const y0 = yb - 20 - i * 40, y1 = y0 - 40;
    const f0 = (yb - y0) / 176, f1 = (yb - y1) / 176;
    const a = 68 - 44 * f0, b = 68 - 44 * f1;
    X.beginPath(); X.moveTo(x - a, y0); X.lineTo(x + b, y1); X.stroke();
    X.beginPath(); X.moveTo(x + a, y0); X.lineTo(x - b, y1); X.stroke();
  }
  // 頂部橫樑與滑輪
  rr(x - 34, yb - 196, 68, 22, 4, M, D, 3);
  circ(x, yb - 214, 26, L, D, 5); circ(x, yb - 214, 9, D);
  // 井口開孔
  rr(x - 40, yb - 12, 80, 20, 3, '#120f16');
  poly([[x - 52, yb], [x + 52, yb], [x + 40, yb - 12], [x - 40, yb - 12]], '#2c242e');
  // 受光邊（畫死在素材上：光從右上）
  poly([[x + 58, yb], [x + 66, yb], [x + 20, yb - 176], [x + 15, yb - 176]], 'rgba(214,150,110,.28)');
}
function furnace(x, yb) { // 熔爐
  const S = '#413440', S2 = '#57465a', D = '#201a25';
  rr(x - 92, yb - 150, 184, 150, 8, S, D, 4);
  rr(x - 78, yb - 176, 156, 30, 6, S2, D, 4);
  // 煙囪
  rr(x + 34, yb - 268, 42, 96, 5, S, D, 4);
  rr(x + 26, yb - 284, 58, 20, 4, S2, D, 4);
  // 爐口與火（火光是畫進去的，不隨相機變）
  X.save();
  X.beginPath(); X.moveTo(x - 46, yb - 6); X.lineTo(x - 46, yb - 76); X.arc(x, yb - 76, 46, 3.14, 0); X.lineTo(x + 46, yb - 6); X.closePath();
  X.fillStyle = '#100b10'; X.fill(); X.clip();
  const g = X.createRadialGradient(x, yb - 24, 6, x, yb - 24, 78);
  g.addColorStop(0, '#ffe9a8'); g.addColorStop(.35, '#ff9d3a'); g.addColorStop(.75, '#c3401c'); g.addColorStop(1, 'rgba(120,30,16,0)');
  X.fillStyle = g; X.fillRect(x - 60, yb - 100, 120, 100);
  const q = rng(88);
  for (let i = 0; i < 7; i++) { // 火舌
    const bx = x - 34 + i * 11, h = 26 + q() * 52;
    poly([[bx - 7, yb - 6], [bx + 7, yb - 6], [bx + 2, yb - 6 - h]], i % 2 ? '#ffd27a' : '#ffa94d');
  }
  X.restore();
  X.strokeStyle = D; X.lineWidth = 5;
  X.beginPath(); X.moveTo(x - 46, yb - 6); X.lineTo(x - 46, yb - 76); X.arc(x, yb - 76, 46, 3.14, 0); X.lineTo(x + 46, yb - 6); X.stroke();
  // 爐前的地面光暈（畫死）
  const gg = X.createRadialGradient(x, yb, 10, x, yb, 180);
  gg.addColorStop(0, 'rgba(255,150,70,.30)'); gg.addColorStop(1, 'rgba(255,150,70,0)');
  X.fillStyle = gg; X.beginPath(); X.ellipse(x, yb + 6, 180, 30, 0, 0, 7); X.fill();
  // 爐體受光邊
  X.fillStyle = 'rgba(255,170,110,.16)'; X.fillRect(x + 78, yb - 150, 14, 150);
  // 煉好的礦錠堆
  for (let i = 0; i < 3; i++) rr(x - 150 + i * 18, yb - 14 - (i === 1 ? 12 : 0), 34, 14, 3, '#9a8a72', '#241d18', 2);
}
function generator(x, yb) { // 發電機（冒煙）
  const B = '#33323c', B2 = '#474653', D = '#1b1a22';
  rr(x - 104, yb - 116, 208, 116, 6, B, D, 4);
  rr(x - 104, yb - 136, 208, 24, 5, B2, D, 4);
  // 飛輪
  circ(x - 52, yb - 58, 40, B2, D, 5); circ(x - 52, yb - 58, 11, D);
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; X.beginPath(); X.moveTo(x - 52, yb - 58); X.lineTo(x - 52 + Math.cos(a) * 36, yb - 58 + Math.sin(a) * 36); X.strokeStyle = D; X.lineWidth = 5; X.stroke(); }
  // 煤斗與煤
  poly([[x + 20, yb - 136], [x + 96, yb - 136], [x + 84, yb - 186], [x + 32, yb - 186]], B2, D, 4);
  X.save(); X.beginPath(); X.moveTo(x + 26, yb - 182); X.lineTo(x + 90, yb - 182); X.lineTo(x + 86, yb - 166); X.lineTo(x + 30, yb - 166); X.closePath(); X.clip();
  for (let i = 0; i < 9; i++) circ(x + 30 + i * 7, yb - 172 + (i % 3) * 3, 7, '#20232a'); X.restore();
  // 煙囪
  rr(x - 92, yb - 208, 34, 76, 4, B, D, 4);
  // 煙（往右上飄、顏色固定）
  const q = rng(55);
  for (let i = 0; i < 9; i++) {
    const t = i / 8, cx = x - 75 + t * 130 + q() * 14, cy = yb - 220 - t * 150 - q() * 14;
    const s = 16 + t * 42;
    X.beginPath(); X.ellipse(cx, cy, s, s * .78, 0, 0, 7);
    X.fillStyle = `rgba(122,114,128,${(.42 - t * .33).toFixed(3)})`; X.fill();
  }
  // 電力指示（三顆燈，白＝提示）
  for (let i = 0; i < 3; i++) circ(x + 30 + i * 22, yb - 104, 7, i < 2 ? '#ffffff' : 'rgba(255,255,255,.22)');
  X.fillStyle = 'rgba(255,170,110,.14)'; X.fillRect(x + 90, yb - 116, 14, 116);
}
function shop(x, yb) { // 商店招牌
  const P = '#30283a', D = '#1b1522';
  rr(x - 8, yb - 264, 16, 264, 3, P, D, 3);
  rr(x - 150, yb - 286, 300, 22, 4, P, D, 3);
  // 吊桿與招牌
  X.strokeStyle = D; X.lineWidth = 4;
  X.beginPath(); X.moveTo(x - 118, yb - 264); X.lineTo(x - 118, yb - 250); X.moveTo(x + 118, yb - 264); X.lineTo(x + 118, yb - 250); X.stroke();
  rr(x - 136, yb - 250, 272, 84, 8, '#3d2c2c', '#e0a35a', 4);
  txt('商　店', x, yb - 194, 46, '#f0c27a', 'center', 800);
  // 小屋
  rr(x - 118, yb - 108, 236, 108, 6, '#2a2430', D, 4);
  poly([[x - 134, yb - 108], [x + 134, yb - 108], [x + 108, yb - 150], [x - 108, yb - 150]], '#3a3044', D, 4);
  rr(x - 88, yb - 86, 66, 52, 4, '#f0c27a'); // 窗（畫死的暖光）
  X.strokeStyle = D; X.lineWidth = 4; X.beginPath(); X.moveTo(x - 55, yb - 86); X.lineTo(x - 55, yb - 34); X.stroke();
  rr(x + 22, yb - 92, 54, 92, 3, '#171320'); // 門
  X.fillStyle = 'rgba(255,190,130,.13)'; X.fillRect(x + 104, yb - 108, 14, 108);
}
function groundStrip() {
  // 地表泥土帶
  X.fillStyle = '#453425'; X.fillRect(0, SURF - 4, W, 26);
  const r = rng(12);
  X.fillStyle = '#5d4830';
  X.beginPath(); X.moveTo(0, SURF);
  for (let x = 0; x <= W; x += 22) X.lineTo(x, SURF - 4 + (r() - .5) * 7);
  X.lineTo(W, SURF + 14); X.lineTo(0, SURF + 14); X.fill();
  // 枯枝與草叢剪影
  for (let i = 0; i < 26; i++) {
    const x = r() * W, h = 10 + r() * 20;
    X.strokeStyle = '#241b18'; X.lineWidth = 3; X.lineCap = 'round';
    X.beginPath(); X.moveTo(x, SURF); X.lineTo(x + (r() - .5) * 10, SURF - h); X.stroke();
  }
  for (let i = 0; i < 3; i++) { // 枯樹
    const x = [180, 1250, 1790][i], hh = 120 + i * 18;
    X.strokeStyle = '#211a1e'; X.lineWidth = 9; X.lineCap = 'round';
    X.beginPath(); X.moveTo(x, SURF); X.lineTo(x + 6, SURF - hh); X.stroke();
    X.lineWidth = 5;
    [[-40, .55], [34, .7], [-26, .85]].forEach(([dx, t]) => {
      X.beginPath(); X.moveTo(x + 4, SURF - hh * t); X.lineTo(x + dx, SURF - hh * t - 34); X.stroke();
    });
  }
}

/* ---------- 礦機（純黑剪影＝會動的東西） ---------- */
const MB = '#07070a';                 // 車體（純黑保留給會動的）
const MPANEL = '#20242c', MRIM = '#3a4250', MMETAL = '#b7b0a4', MGLASS = '#f2c878';
function partTrack(s) {   // 履帶：原點在底部中心
  X.save(); X.scale(s, s);
  rr(-100, -46, 200, 46, 22, MB);
  rr(-96, -42, 192, 38, 18, '#12141a');
  circ(-62, -23, 19, MPANEL, MRIM, 3); circ(62, -23, 19, MPANEL, MRIM, 3);
  circ(0, -23, 13, MPANEL, MRIM, 3); circ(-24, -23, 9, MPANEL); circ(26, -23, 9, MPANEL);
  for (let i = -5; i <= 5; i++) { // 履帶齒
    X.strokeStyle = MRIM; X.lineWidth = 4;
    X.beginPath(); X.moveTo(i * 18, -46); X.lineTo(i * 18, -39); X.stroke();
    X.beginPath(); X.moveTo(i * 18 + 8, -7); X.lineTo(i * 18 + 8, 0); X.stroke();
  }
  X.fillStyle = 'rgba(255,190,130,.10)'; X.fillRect(-92, -46, 184, 5); // 受光頂邊
  X.restore();
}
function partBody(s) {
  X.save(); X.scale(s, s);
  poly([[-96, 0], [78, 0], [92, -30], [86, -62], [-88, -68], [-100, -34]], MB);
  rr(-72, -56, 64, 34, 5, MPANEL, MRIM, 3);      // 側板
  for (let i = 0; i < 3; i++) { X.strokeStyle = MRIM; X.lineWidth = 3; X.beginPath(); X.moveTo(-64, -48 + i * 10); X.lineTo(-18, -48 + i * 10); X.stroke(); }
  rr(10, -58, 52, 26, 4, MPANEL, MRIM, 3);        // 礦艙格
  for (let i = 0; i < 3; i++) rr(15 + i * 16, -54, 12, 18, 2, i < 2 ? '#c88d3e' : '#1a1c22');
  X.fillStyle = 'rgba(255,190,130,.16)';
  poly([[-88, -68], [86, -62], [86, -55], [-88, -61]], 'rgba(255,190,130,.16)');
  X.restore();
}
function partCab(s) {
  X.save(); X.scale(s, s);
  poly([[-34, 0], [34, 0], [30, -40], [-6, -52], [-30, -44]], MB);
  poly([[-20, -8], [24, -8], [21, -34], [-6, -42], [-18, -36]], MGLASS);
  poly([[-20, -8], [-6, -42], [-1, -41], [-13, -8]], 'rgba(255,255,255,.35)'); // 玻璃反光（畫死）
  X.strokeStyle = MRIM; X.lineWidth = 3;
  X.beginPath(); X.moveTo(-34, 0); X.lineTo(-30, -44); X.lineTo(-6, -52); X.lineTo(30, -40); X.lineTo(34, 0); X.stroke();
  X.beginPath(); X.moveTo(-8, -8); X.lineTo(-8, -44); X.strokeStyle = 'rgba(58,66,80,.9)'; X.lineWidth = 2; X.stroke(); // 門縫
  rr(24, -48, 16, 12, 3, MPANEL, MRIM, 2);        // 車頭燈座
  circ(32, -42, 5, '#ffffff');                     // 燈（白＝提示）
  rr(-30, -6, 60, 6, 2, MPANEL);
  X.restore();
}
function partDrill(s) { // 鑽頭，朝 +x
  X.save(); X.scale(s, s);
  rr(-16, -15, 26, 30, 5, MPANEL, MRIM, 3);
  poly([[6, -22], [92, -3], [92, 3], [6, 22]], MMETAL, '#3a352c', 3);
  X.save(); X.beginPath(); X.moveTo(6, -22); X.lineTo(92, -3); X.lineTo(92, 3); X.lineTo(6, 22); X.closePath(); X.clip();
  for (let i = 0; i < 7; i++) { // 螺旋刃
    X.strokeStyle = 'rgba(40,36,30,.85)'; X.lineWidth = 5;
    X.beginPath(); X.moveTo(6 + i * 13, -24); X.lineTo(6 + i * 13 + 16, 24); X.stroke();
    X.strokeStyle = 'rgba(255,245,225,.30)'; X.lineWidth = 2;
    X.beginPath(); X.moveTo(6 + i * 13 + 4, -24); X.lineTo(6 + i * 13 + 20, 24); X.stroke();
  }
  X.restore();
  circ(98, 0, 5, MMETAL);
  X.restore();
}
function partCableSocket(s) {
  X.save(); X.scale(s, s);
  rr(-16, -14, 32, 28, 5, MPANEL, MRIM, 3);
  circ(0, 0, 8, '#d9873f', '#2a1a0e', 3);
  circ(0, 0, 3, '#f5c07a');
  X.restore();
}
function partChimney(s) {
  X.save(); X.scale(s, s);
  rr(-10, -44, 20, 44, 3, MB); rr(-15, -52, 30, 12, 3, MPANEL, MRIM, 3);
  for (let i = 0; i < 4; i++) { const t = i / 3; X.beginPath(); X.ellipse(2 + t * 22, -62 - t * 34, 7 + t * 12, (7 + t * 12) * .78, 0, 0, 7); X.fillStyle = `rgba(122,114,128,${(.4 - t * .3).toFixed(2)})`; X.fill(); }
  X.restore();
}
function drawMachine(cx, baseY, s, withGlow) {
  if (withGlow) { // 車燈打在前方坑道的光（畫死在素材上，不隨相機算）
    X.save();
    X.beginPath();
    if (TUNPTS) { TUNPTS.forEach((q, i) => i ? X.lineTo(q[0], q[1]) : X.moveTo(q[0], q[1])); X.closePath(); }
    else X.rect(TUN_X1, TUN_Y, TUN_X2 - TUN_X1, TUN_H);
    X.clip();
    const gx0 = cx + 168 * s, gy0 = baseY - 60 * s, gr = 190 * s;
    const g = X.createRadialGradient(gx0, gy0, 4, gx0, gy0, gr);
    g.addColorStop(0, 'rgba(255,200,130,.30)'); g.addColorStop(.45, 'rgba(255,190,120,.09)');
    g.addColorStop(1, 'rgba(255,200,130,0)');
    X.fillStyle = g; X.fillRect(gx0 - gr, gy0 - gr, gr * 2, gr * 2);
    X.restore();
  }
  X.save(); X.translate(cx, baseY);
  X.save(); X.translate(-104 * s, -58 * s); partCableSocket(s); X.restore();
  X.save(); X.translate(0, -46 * s); partBody(s); X.restore();
  X.save(); X.translate(-34 * s, -108 * s); partChimney(s); X.restore();
  X.save(); X.translate(14 * s, -108 * s); partCab(s); X.restore();
  partTrack(s);
  X.save(); X.translate(88 * s, -60 * s); partDrill(s); X.restore();
  X.restore();
  // 鑽頭前的碎屑
  const q = rng(77);
  for (let i = 0; i < 16; i++) {
    const x = cx + (190 + q() * 60) * s, y = baseY - (30 + q() * 90) * s;
    poly([[x, y], [x + 7, y - 5], [x + 11, y + 4]], 'rgba(150,120,86,.75)');
  }
}

/* ---------- 電梯井與電纜 ---------- */
const SHAFT_X = 508, SHAFT_W = 84, SHAFT_BOT = 900;
const TUN_Y = 640, TUN_H = 128, TUN_X1 = SHAFT_X + SHAFT_W, TUN_X2 = 1380;
function shaft() {
  cavity(SHAFT_X, SURF, SHAFT_W, SHAFT_BOT - SURF, 5);
  // 兩側導軌與橫樑
  for (let y = SURF + 30; y < SHAFT_BOT - 20; y += 64) {
    rr(SHAFT_X - 6, y, SHAFT_W + 12, 10, 3, '#3b3040', '#17121c', 2);
  }
  X.fillStyle = '#4a3e50';
  X.fillRect(SHAFT_X + 6, SURF, 7, SHAFT_BOT - SURF);
  X.fillRect(SHAFT_X + SHAFT_W - 13, SURF, 7, SHAFT_BOT - SURF);
  // 吊纜
  X.strokeStyle = '#8d8494'; X.lineWidth = 3;
  X.beginPath(); X.moveTo(SHAFT_X + 42, SURF - 214); X.lineTo(SHAFT_X + 42, 596); X.stroke();
}
function elevatorCar(cx, cy) { // 純黑＝會動的
  rr(cx - 36, cy, 72, 86, 4, MB);
  rr(cx - 30, cy + 8, 60, 58, 3, '#1c1d24', MRIM, 3);
  rr(cx - 24, cy + 14, 48, 44, 2, MGLASS);
  poly([[cx - 24, cy + 58], [cx - 12, cy + 14], [cx - 6, cy + 14], [cx - 18, cy + 58]], 'rgba(255,255,255,.3)');
  rr(cx - 40, cy - 10, 80, 12, 3, MPANEL, MRIM, 3);
  X.strokeStyle = MRIM; X.lineWidth = 3;
  X.beginPath(); X.moveTo(cx - 26, cy - 10); X.lineTo(cx - 6, cy - 30); X.lineTo(cx + 6, cy - 30); X.lineTo(cx + 26, cy - 10); X.stroke();
  // 車底的光（畫死）
  const g = X.createRadialGradient(cx, cy + 92, 3, cx, cy + 92, 90);
  g.addColorStop(0, 'rgba(255,200,130,.22)'); g.addColorStop(1, 'rgba(255,200,130,0)');
  X.fillStyle = g; X.fillRect(cx - 90, cy + 40, 180, 110);
}
function cable(pts) {
  X.lineCap = 'round'; X.lineJoin = 'round';
  X.beginPath(); pts.forEach((p, i) => i ? X.lineTo(p[0], p[1]) : X.moveTo(p[0], p[1]));
  X.strokeStyle = '#2a170d'; X.lineWidth = 9; X.stroke();
  X.beginPath(); pts.forEach((p, i) => i ? X.lineTo(p[0], p[1]) : X.moveTo(p[0], p[1]));
  X.strokeStyle = '#d9873f'; X.lineWidth = 5; X.stroke();
  X.beginPath(); pts.forEach((p, i) => i ? X.lineTo(p[0], p[1]) : X.moveTo(p[0], p[1]));
  X.strokeStyle = 'rgba(255,214,160,.5)'; X.lineWidth = 1.6; X.stroke();
  // 固定夾
  for (let i = 1; i < pts.length - 1; i += 1) circ(pts[i][0], pts[i][1], 6, '#3a2a1c', '#d9873f', 2);
}

/* ---------- 前景遮擋物 ---------- */
function foreground() {
  const FG = '#0e0c13', FGR = '#1d1a26';
  // 左下大岩
  let p = [[-40, 1080], [-40, 820], [70, 742], [190, 768], [252, 850], [300, 980], [286, 1080]];
  poly(p, FG); poly(p.map(q => [q[0] + 6, q[1] + 7]), 'rgba(0,0,0,0)');
  X.strokeStyle = FGR; X.lineWidth = 5;
  X.beginPath(); X.moveTo(-40, 822); X.lineTo(70, 744); X.lineTo(190, 770); X.lineTo(252, 852); X.stroke();
  // 右下岩＋碎石
  p = [[1960, 1080], [1960, 890], [1844, 852], [1706, 890], [1642, 962], [1652, 1080]];
  poly(p, FG);
  X.beginPath(); X.moveTo(1960, 892); X.lineTo(1844, 854); X.lineTo(1706, 892); X.lineTo(1642, 964); X.stroke();
  const r = rng(66);
  for (let i = 0; i < 7; i++) {
    const x = 1560 + r() * 120, y = 980 + r() * 90, s = 20 + r() * 34;
    poly([[x, y], [x + s, y - s * .7], [x + s * 1.9, y + s * .2], [x + s * 1.3, y + s * .9]], FG);
  }
}

/* ---------- UI ---------- */
const UITXT = '#ece6da', UIDIM = 'rgba(236,230,218,.45)';
function panel(x, y, w, h, r) { rr(x, y, w, h, r || 12, 'rgba(12,10,16,.78)', 'rgba(236,230,218,.22)', 2); }

function oreIcon(kind, x, y, r) { X.save(); X.translate(x, y); ORE[kind].draw(r); X.restore(); }

function uiResources() {
  const items = [['coal', '煤', 12], ['iron', '鐵', 3], ['copper', '銅', 5], ['gold', '金', 1]];
  const x = 44, y = 36, w = 560, h = 108;
  panel(x, y, w, h);
  items.forEach((it, i) => {
    const cx = x + 82 + i * 132, cy = y + 52;
    circ(cx, cy, 34, 'rgba(255,255,255,.10)');
    oreIcon(it[0], cx, cy, 25);
    txt(it[1], cx + 42, cy - 4, 26, UITXT, 'left', 700);
    txt(String(it[2]), cx + 42, cy + 28, 30, '#f0d9a8', 'left', 800);
  });
}
function uiButtons() {
  const btns = [['挖　掘', 'drill'], ['搭電梯', 'lift'], ['製　作', 'craft']];
  btns.forEach((b, i) => {
    const cx = 1500 + i * 176, cy = 790, R = 68;
    circ(cx, cy + 4, R, 'rgba(0,0,0,.45)');
    circ(cx, cy, R, 'rgba(22,18,28,.88)', 'rgba(236,230,218,.4)', 3);
    X.save(); X.translate(cx, cy - 12);
    if (b[1] === 'drill') { X.save(); X.rotate(.6); X.translate(-14, 0); partDrill(.34); X.restore(); }
    if (b[1] === 'lift') {
      rr(-22, -22, 44, 40, 4, MPANEL, MRIM, 3);
      X.strokeStyle = UITXT; X.lineWidth = 3; X.beginPath(); X.moveTo(0, -22); X.lineTo(0, -34); X.stroke();
      poly([[0, -44], [9, -30], [-9, -30]], '#ffffff');
    }
    if (b[1] === 'craft') {
      X.strokeStyle = MMETAL; X.lineWidth = 6; X.lineCap = 'round';
      X.beginPath(); X.moveTo(-18, 16); X.lineTo(10, -14); X.stroke();
      poly([[6, -20], [22, -26], [26, -12], [12, -6]], MMETAL, '#3a352c', 3);
      circ(-20, 18, 7, MPANEL, MRIM, 3);
    }
    X.restore();
    txt(b[0], cx, cy + 42, 26, UITXT, 'center', 800);
  });
}
const COLLECT = [
  ['煤', 'coal'], ['鐵', 'iron'], ['銅', 'copper'], ['金', 'gold'], ['水晶', 'crystal'],
  ['紫晶', 0], ['黑曜石', 0], ['琥珀', 0], ['白銀', 0], ['螢石', 0],
  ['隕鐵', 0], ['化石', 0], ['鹽晶', 0], ['瀝青', 0], ['原油', 0], ['鑽石', 0],
];
function uiCollection(open) {
  const got = 5;
  if (!open) {                       // 預設收成一條細把手，地層才看得完
    const w = 360, h = 52, x = (W - w) / 2, y = H - h - 14;
    panel(x, y, w, h, 14);
    txt('收藏', x + 24, y + 36, 26, UITXT, 'left', 800);
    txt(`${got} / ${COLLECT.length}`, x + 96, y + 36, 26, '#f0d9a8', 'left', 700);
    // 已得到的縮圖（提示這裡有東西可以點開）
    for (let i = 0; i < got; i++) oreIcon(COLLECT[i][1], x + 186 + i * 30, y + h / 2, 11);
    poly([[x + w - 34, y + 32], [x + w - 20, y + 32], [x + w - 27, y + 20]], '#ffffff');
    return;
  }
  const x = 44, y = 940, w = 1832, h = 112;
  panel(x, y, w, h);
  txt('收藏', x + 26, y + 46, 28, UITXT, 'left', 800);
  txt(`${got} / ${COLLECT.length}`, x + 26, y + 84, 26, '#f0d9a8', 'left', 700);
  poly([[x + w - 44, y + 26], [x + w - 22, y + 26], [x + w - 33, y + 42]], '#ffffff');
  const sx = x + 128, sw = 100, gap = 6;
  COLLECT.forEach((c, i) => {
    const cx = sx + i * (sw + gap), cy = y + 14, hh = 84;
    const lit = i < got;
    rr(cx, cy, sw, hh, 8, lit ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.03)',
      lit ? 'rgba(255,255,255,.75)' : 'rgba(236,230,218,.18)', lit ? 3 : 2);
    if (lit) {
      oreIcon(c[1], cx + sw / 2, cy + 32, 21);
      txt(c[0], cx + sw / 2, cy + 74, 24, UITXT, 'center', 700);
    } else {
      X.setLineDash([5, 6]);
      rr(cx + 22, cy + 16, 56, 34, 6, null, 'rgba(236,230,218,.22)', 2);
      X.setLineDash([]);
      txt('？', cx + sw / 2, cy + 74, 24, 'rgba(236,230,218,.3)', 'center', 700);
    }
  });
}

/* ---------- 場景一 ---------- */
function scene() {
  sky();
  strata();

  // 礦：長在土裡（各層各自的礦種偏好）
  const spots = [
    // 第一層：煤與鐵
    ['coal', 180, 400, 40], ['coal', 900, 470, 34], ['iron', 1180, 400, 36],
    ['coal', 1640, 380, 42], ['iron', 330, 520, 30], ['coal', 1420, 520, 30],
    ['iron', 760, 392, 28], ['coal', 1870, 486, 32],
    // 第二層：鐵與銅
    ['iron', 210, 690, 44], ['copper', 420, 840, 40], ['copper', 1520, 660, 46],
    ['iron', 1700, 800, 38], ['copper', 960, 826, 34], ['iron', 1140, 590, 26],
    ['copper', 100, 610, 34], ['iron', 1830, 660, 30],
    // 第三層：金與水晶
    ['gold', 330, 900, 38], ['crystal', 700, 890, 44], ['gold', 1120, 905, 34],
    ['crystal', 1450, 880, 40], ['gold', 1720, 892, 36], ['crystal', 150, 872, 34],
    ['gold', 950, 862, 26], ['crystal', 1250, 912, 30],
    ['crystal', 560, 1006, 40], ['gold', 1590, 996, 36], ['crystal', 1196, 1004, 34],
    ['gold', 210, 1000, 30],
  ];
  spots.forEach(s => drawOre(s[0], s[1], s[2], s[3]));

  // 已挖通：主井、支線、一條廢棄的淺支線
  cavity(200, 420, 260, 74, 91);        // 廢棄淺支線
  shaft();
  TUNPTS = cavity(TUN_X1, TUN_Y, TUN_X2 - TUN_X1, TUN_H, 17);

  // 電纜：發電機 → 地表 → 井 → 支線 → 礦機背後
  cable([[1128, 300], [1000, 316], [800, 322], [640, 320], [560, 322],
  [SHAFT_X + 20, 360], [SHAFT_X + 18, 520], [SHAFT_X + 22, 700], [SHAFT_X + 40, 758],
  [700, 762], [900, 764], [1060, 760], [1146, 726]]);

  elevatorCar(SHAFT_X + 42, 596);
  drawMachine(1160, TUN_Y + TUN_H, 1.0, true);

  // 地表設施
  groundStrip();
  headframe(SHAFT_X + 42, SURF);
  furnace(880, SURF);
  generator(1180, SURF);
  shop(1580, SURF);

  foreground();

  // 場景標籤
  tag('電梯井口', 706, 150, 578, 126);
  tag('熔　爐', 880, 42, 880, SURF - 280);
  tag('發電機', 1300, 58, 1236, SURF - 214);
  tag('商店招牌', 1828, 44, 1746, 62);
  tag('表土層', 1834, 372, 1762, 412);
  tag('裂紋層', 146, 606, 78, 652);
  tag('層理層', 186, 876, 288, 900);
  tag('電梯廂', 306, 596, SHAFT_X + 4, 620);
  tag('礦機（挖掘中）', 1310, 548, 1232, 628);
  tag('電纜：從發電機拉到礦機', 828, 700, 880, 762);
  tag('主井（已挖通）', 764, 420, SHAFT_X + 70, 432);

  uiResources();
  uiButtons();
  uiCollection(COLLECT_OPEN);

  // 標題
  txt('DIG　美術樣張 — 場景', 44, 184, 30, 'rgba(236,230,218,.55)', 'left', 700);
  txt('全部由程式繪製・1920×1080・一格 64', 44, 220, 24, 'rgba(236,230,218,.35)', 'left', 600);
}

/* ---------- 場景二：零件表 ---------- */
function swatch(kind, x, y, w, h) { // 地層貼塊樣本
  X.save();
  X.beginPath(); rr(x, y, w, h, 6); X.clip();
  if (kind === 'g') { X.fillStyle = '#4a3928'; X.fillRect(x, y, w, h); }
  if (kind === 'c') { X.fillStyle = '#332927'; X.fillRect(x, y, w, h); }
  if (kind === 'b') { X.fillStyle = '#231e2b'; X.fillRect(x, y, w, h); }
  X.save(); X.translate(x - 300, y - (kind === 'g' ? LY[0] : kind === 'c' ? LY[1] : LY[2]));
  if (kind === 'g') texGrain(LY[0], LY[1]);
  if (kind === 'c') texCrack(LY[1], LY[2]);
  if (kind === 'b') texBed(LY[2], LY[3]);
  X.restore();
  X.restore();
  rr(x, y, w, h, 6, null, 'rgba(236,230,218,.3)', 2);
}
const PARTS = [
  { n: '表土層', d: (x, y, w, h) => swatch('g', x, y, w, h) },
  { n: '裂紋層', d: (x, y, w, h) => swatch('c', x, y, w, h) },
  { n: '層理層', d: (x, y, w, h) => swatch('b', x, y, w, h) },
  { n: '空洞（已挖通）', d: (x, y, w, h) => { cavity(x, y, w, h, 44); } },
  { n: '地層分界', d: (x, y, w, h) => { swatch('g', x, y, w, h / 2); swatch('c', x, y + h / 2, w, h / 2); X.save(); X.translate(x - 600, y + h / 2 - LY[1]); boundary(LY[1], '#6b503a', '#1d1517', 31); X.restore(); } },

  { n: '煤', d: (x, y, w, h) => { drawOre('coal', x + w / 2, y + h / 2, 46); } },
  { n: '鐵', d: (x, y, w, h) => { drawOre('iron', x + w / 2, y + h / 2, 46); } },
  { n: '銅', d: (x, y, w, h) => { drawOre('copper', x + w / 2, y + h / 2, 46); } },
  { n: '金', d: (x, y, w, h) => { drawOre('gold', x + w / 2, y + h / 2, 46); } },
  { n: '水晶', d: (x, y, w, h) => { drawOre('crystal', x + w / 2, y + h / 2, 46); } },

  { n: '電梯井口', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2, y + h - 12); X.scale(.52, .52); headframe(0, 0); X.restore(); } },
  { n: '電梯廂', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2, y + 28); X.scale(.9, .9); elevatorCar(0, 0); X.restore(); } },
  { n: '熔爐', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2, y + h - 10); X.scale(.46, .46); furnace(0, 0); X.restore(); } },
  { n: '發電機', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2, y + h - 10); X.scale(.46, .46); generator(0, 0); X.restore(); } },
  { n: '商店招牌', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2, y + h - 10); X.scale(.42, .42); shop(0, 0); X.restore(); } },

  { n: '礦機（整台）', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2 - 14, y + h - 22); drawMachine(0, 0, .62, false); X.restore(); } },
  { n: '履帶', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2, y + h / 2 + 24); partTrack(.82); X.restore(); } },
  { n: '車體', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2, y + h / 2 + 34); partBody(.82); X.restore(); } },
  { n: '駕駛艙', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2, y + h / 2 + 32); partCab(1.15); X.restore(); } },
  { n: '鑽頭', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2 - 44, y + h / 2); partDrill(.86); X.restore(); } },
  { n: '煙囪', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2, y + h / 2 + 30); partChimney(1.2); X.restore(); } },
  { n: '電纜接頭', d: (x, y, w, h) => { X.save(); X.translate(x + w / 2, y + h / 2); partCableSocket(1.6); X.restore(); } },
  { n: '電纜', d: (x, y, w, h) => {
      const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([x + 14 + t * (w - 28), y + 24 + Math.sin(t * Math.PI) * (h - 60)]); }
      cable(pts);
    } },
  { n: '前景岩石', d: (x, y, w, h) => {
      const p = [[x + 8, y + h], [x + 14, y + h * .4], [x + w * .42, y + 14], [x + w * .8, y + h * .3], [x + w - 10, y + h]];
      poly(p, '#0e0c13'); X.strokeStyle = '#3a3654'; X.lineWidth = 5;
      X.beginPath(); X.moveTo(x + 14, y + h * .42); X.lineTo(x + w * .42, y + 16); X.lineTo(x + w * .8, y + h * .32); X.stroke();
      const q = [[x + w * .62, y + h], [x + w * .66, y + h * .62], [x + w * .84, y + h * .5], [x + w - 6, y + h * .72], [x + w - 4, y + h]];
      poly(q, '#141222'); X.strokeStyle = '#3a3654'; X.lineWidth = 4;
      X.beginPath(); X.moveTo(x + w * .66, y + h * .64); X.lineTo(x + w * .84, y + h * .52); X.lineTo(x + w - 6, y + h * .74); X.stroke();
    } },
  { n: '枯樹（地表）', d: (x, y, w, h) => {
      const cx = x + w / 2, by = y + h - 12;
      X.strokeStyle = '#211a1e'; X.lineWidth = 9; X.lineCap = 'round';
      X.beginPath(); X.moveTo(cx, by); X.lineTo(cx + 6, by - 120); X.stroke(); X.lineWidth = 5;
      [[-40, .55], [34, .7], [-26, .85]].forEach(([dx, t]) => { X.beginPath(); X.moveTo(cx + 4, by - 120 * t); X.lineTo(cx + dx, by - 120 * t - 34); X.stroke(); });
    } },
];
function parts() {
  // 背景
  const g = X.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a1622'); g.addColorStop(1, '#0d0b12');
  X.fillStyle = g; X.fillRect(0, 0, W, H);

  txt('DIG　美術樣張 — 零件表', 44, 62, 34, UITXT, 'left', 800);
  txt('同一套繪圖程式畫出來的所有零件。礦靠形狀分，不靠顏色。', 44, 100, 24, 'rgba(236,230,218,.5)', 'left', 600);
  txt('共 ' + PARTS.length + ' 件', W - 44, 62, 26, 'rgba(236,230,218,.5)', 'right', 700);

  const cols = 7, rows = 4, cw = 250, ch = 192, gx = 18, gy = 16;
  const x0 = (W - (cols * cw + (cols - 1) * gx)) / 2, y0 = 140;
  PARTS.forEach((p, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = x0 + c * (cw + gx), y = y0 + r * (ch + gy);
    rr(x, y, cw, ch, 10, 'rgba(255,255,255,.035)', 'rgba(236,230,218,.16)', 2);
    X.save();
    X.beginPath(); rr(x + 1, y + 1, cw - 2, ch - 46, 9); X.clip();
    p.d(x + 10, y + 10, cw - 20, ch - 66);
    X.restore();
    // 名稱列
    rr(x, y + ch - 44, cw, 44, 0, 'rgba(0,0,0,.35)');
    X.beginPath(); X.moveTo(x, y + ch - 44); X.lineTo(x + cw, y + ch - 44); X.strokeStyle = 'rgba(236,230,218,.16)'; X.lineWidth = 2; X.stroke();
    txt(p.n, x + cw / 2, y + ch - 14, 26, UITXT, 'center', 700);
  });

  // 色階說明（規矩本身也畫出來）
  const ly = y0 + rows * (ch + gy) + 18;
  const rules = [['純黑 #07070A', '#07070a', '只給會動的：礦機、電梯廂'],
  ['純白 #FFFFFF', '#ffffff', '只給提示：收藏亮起、按鈕指示'],
  ['遠景最淺 #6D5560', '#6d5560', '越遠越淺，遠景不用純黑']];
  rules.forEach((rl, i) => {
    const x = x0 + i * 620;
    rr(x, ly, 44, 44, 6, rl[1], 'rgba(236,230,218,.3)', 2);
    txt(rl[0], x + 58, ly + 20, 24, UITXT, 'left', 700);
    txt(rl[2], x + 58, ly + 44, 24, 'rgba(236,230,218,.5)', 'left', 600);
  });
}


/* ---------- 場景三：礦機動力三型 ---------- */
function partTank(s) {            // 柴油機的油箱（橫躺的圓筒）
  X.save(); X.scale(s, s);
  rr(-44, -18, 88, 36, 18, MPANEL, MRIM, 3);
  X.strokeStyle = MRIM; X.lineWidth = 2;
  X.beginPath(); X.ellipse(-26, 0, 8, 17, 0, 0, 7); X.stroke();
  X.beginPath(); X.ellipse(26, 0, 8, 17, 0, 0, 7); X.stroke();
  rr(-8, -26, 16, 10, 3, MMETAL, '#2a2620', 2);   // 加油口
  X.restore();
}
function partExhaust(s) {         // 柴油機的排氣管
  X.save(); X.scale(s, s);
  X.lineCap = 'round';
  X.beginPath(); X.moveTo(0, 0); X.lineTo(0, -34); X.lineTo(-16, -52);
  X.strokeStyle = MB; X.lineWidth = 15; X.stroke();
  X.strokeStyle = MPANEL; X.lineWidth = 9; X.stroke();
  rr(-26, -60, 18, 12, 4, MPANEL, MRIM, 2);
  X.restore();
}
function partFins(s) {            // 電動機的散熱鰭片
  X.save(); X.scale(s, s);
  rr(-40, -16, 80, 22, 4, MPANEL, MRIM, 3);
  X.strokeStyle = MRIM; X.lineWidth = 3;
  for (let i = -4; i <= 4; i++) { X.beginPath(); X.moveTo(i * 8, -14); X.lineTo(i * 8, 4); X.stroke(); }
  X.restore();
}
function coalGlow(x, y, s) {      // 爐門的火（畫死的）
  const g = X.createRadialGradient(x, y, 2, x, y, 46 * s);
  g.addColorStop(0, 'rgba(255,200,120,.75)'); g.addColorStop(.4, 'rgba(255,140,60,.3)');
  g.addColorStop(1, 'rgba(255,140,60,0)');
  X.fillStyle = g; X.beginPath(); X.arc(x, y, 46 * s, 0, 7); X.fill();
}
function drawMachineKind(cx, baseY, s, kind) {
  X.save(); X.translate(cx, baseY);
  X.save(); X.translate(0, -46 * s); partBody(s); X.restore();
  if (kind === 'coal') {
    // 煤斗（載著自己要燒的煤）
    X.save(); X.translate(-46 * s, -108 * s); X.scale(s, s);
    poly([[-32, 0], [32, 0], [24, -34], [-24, -34]], MPANEL, MRIM, 3);
    X.save(); X.beginPath(); X.moveTo(-22, -30); X.lineTo(22, -30); X.lineTo(20, -14); X.lineTo(-20, -14); X.closePath(); X.clip();
    for (let i = 0; i < 8; i++) circ(-20 + i * 6, -22 + (i % 3) * 3, 6, '#20232a', '#4d5460', 1.5); X.restore();
    X.restore();
    // 高煙囪＋煙
    X.save(); X.translate(-86 * s, -108 * s); X.scale(s, s);
    rr(-11, -86, 22, 86, 3, MB); rr(-17, -96, 34, 14, 3, MPANEL, MRIM, 3);
    for (let i = 0; i < 6; i++) { const t = i / 5; X.beginPath(); X.ellipse(4 + t * 46, -108 - t * 72, 9 + t * 20, (9 + t * 20) * .78, 0, 0, 7); X.fillStyle = `rgba(122,114,128,${(.45 - t * .34).toFixed(2)})`; X.fill(); }
    X.restore();
    coalGlow(-66 * s, -62 * s, s);
    X.save(); X.translate(-66 * s, -62 * s); X.scale(s, s);
    circ(0, 0, 15, '#140f0e', MRIM, 3);
    circ(0, 0, 10, '#ff9d3a');
    X.restore();
  }
  if (kind === 'diesel') {
    X.save(); X.translate(-44 * s, -112 * s); partTank(s); X.restore();
    X.save(); X.translate(-92 * s, -104 * s); partExhaust(s); X.restore();
    // 排氣（一小口黑煙，比燃煤少很多）
    for (let i = 0; i < 3; i++) { const t = i / 2; X.beginPath(); X.ellipse(-(112 + t * 20) * s, -(172 + t * 24) * s, (8 + t * 7) * s, (8 + t * 7) * .78 * s, 0, 0, 7); X.fillStyle = `rgba(96,88,102,${(.5 - t * .34).toFixed(2)})`; X.fill(); }
    X.save(); X.translate(cx, baseY); X.scale(s, s);   // 後甲板上的備用油桶
    rr(22, -100, 30, 40, 4, MPANEL, MRIM, 3);
    X.strokeStyle = MRIM; X.lineWidth = 2;
    X.beginPath(); X.moveTo(22, -88); X.lineTo(52, -88); X.moveTo(22, -72); X.lineTo(52, -72); X.stroke();
    rr(32, -106, 10, 8, 2, MMETAL, '#2a2620', 2);
    X.restore();
  }
  if (kind === 'elec') {
    X.save(); X.translate(-42 * s, -112 * s); partFins(s); X.restore();
  }
  X.save(); X.translate(14 * s, -108 * s); partCab(s); X.restore();
  partTrack(s);
  X.save(); X.translate(88 * s, -60 * s); partDrill(s); X.restore();
  X.restore();
  if (kind === 'elec') {
    X.save(); X.translate(cx, baseY); X.save(); X.translate(-104 * s, -58 * s); partCableSocket(s); X.restore(); X.restore();
    const ex = cx - 250;
    cable([[cx - 104 * s, baseY - 58 * s], [cx - 132 * s, baseY - 34 * s], [ex + 54, baseY - 18], [ex + 18, baseY - 12]]);
    rr(ex - 16, baseY - 38, 34, 34, 6, MPANEL, MRIM, 3);
    circ(ex + 1, baseY - 21, 7, '#d9873f', '#2a1a0e', 2);
    txt('接到電梯井', ex + 1, baseY + 46, 24, 'rgba(236,230,218,.6)', 'center', 600);
  }
}
const POWER = [
  { k: 'coal', n: '燃煤', d: ['燒挖到的煤，不必回地面', '煙囪一直冒煙、煤一直吃背包'] },
  { k: 'diesel', n: '柴油', d: ['續航最長、硬岩最快', '燃料只能在地面買，佔格子'] },
  { k: 'elec', n: '電動', d: ['力量穩定、不佔背包、沒有廢氣', '只能走到電纜長度為止'] },
];
function power() {
  const g = X.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#221d2c'); g.addColorStop(.62, '#2e2429'); g.addColorStop(1, '#17121a');
  X.fillStyle = g; X.fillRect(0, 0, W, H);
  // 坑道底
  const floor = 742;
  X.fillStyle = '#241c1e'; X.fillRect(0, floor, W, H - floor);
  X.save(); X.translate(0, floor - LY[1]); X.beginPath(); X.rect(0, LY[1], W, 340); X.clip(); texCrack(LY[1], LY[1] + 340); X.restore();
  // 坑道頂（把上半的空白填掉，也說明這是在地下）
  const r2 = rng(9);
  const top = [[0, 0]]; let cy2 = 190, v2 = 0;
  for (let x = 0; x <= W; x += 24) {
    v2 = v2 * .72 + (r2() - .5) * 9;
    cy2 = Math.max(120, Math.min(250, cy2 + v2));
    top.push([x, cy2]);
  }
  top.push([W, 0]);
  poly(top, '#1e1719');
  X.save(); X.beginPath(); top.forEach((q, i) => i ? X.lineTo(q[0], q[1]) : X.moveTo(q[0], q[1])); X.closePath(); X.clip();
  X.translate(0, -LY[1]); texCrack(LY[1], LY[1] + 240); X.restore();
  X.strokeStyle = '#5a4a3c'; X.lineWidth = 5;
  X.beginPath(); top.slice(1, -1).forEach((q, i) => i ? X.lineTo(q[0], q[1]) : X.moveTo(q[0], q[1])); X.stroke();
  X.strokeStyle = '#5a4a3c'; X.lineWidth = 6; X.beginPath(); X.moveTo(0, floor); X.lineTo(W, floor); X.stroke();

  txt('DIG　美術樣張 — 礦機動力三型', 44, 62, 34, UITXT, 'left', 800);
  txt('同一台車、同一套繪圖程式；差別看得出來，不必讀數值。', 44, 100, 24, 'rgba(236,230,218,.5)', 'left', 600);

  POWER.forEach((pw, i) => {
    const cx = 380 + i * 580;
    if (i) { X.strokeStyle = 'rgba(236,230,218,.12)'; X.lineWidth = 2; X.beginPath(); X.moveTo(cx - 290, 250); X.lineTo(cx - 290, 960); X.stroke(); }
    drawMachineKind(cx, floor, 1.62, pw.k);
    txt(pw.n, cx, 856, 42, UITXT, 'center', 800);
    txt(pw.d[0], cx, 904, 27, 'rgba(236,230,218,.75)', 'center', 600);
    txt(pw.d[1], cx, 946, 27, 'rgba(236,230,218,.45)', 'center', 600);
  });
}

/* ---------- 場景四：礦的形狀在小尺寸還分不分得出來 ---------- */
function small() {
  const g = X.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a1622'); g.addColorStop(1, '#0d0b12');
  X.fillStyle = g; X.fillRect(0, 0, W, H);
  txt('DIG　美術樣張 — 縮到 40% 還分不分得出來', 44, 62, 34, UITXT, 'left', 800);
  txt('同一份繪圖程式、同一個順序。下面兩排是上面那排縮到 40% 與 25%（＝收藏格與 HUD 的實際大小）。', 44, 100, 24, 'rgba(236,230,218,.5)', 'left', 600);

  const kinds = ['coal', 'iron', 'copper', 'gold', 'crystal'];
  const rows = [['100%（原寸 r=56）', 56, 240], ['40%（r=22.4）', 22.4, 560], ['25%（r=14，收藏格／HUD）', 14, 860]];
  rows.forEach(([label, r, y]) => {
    txt(label, 44, y - 110, 28, '#f0d9a8', 'left', 700);
    kinds.forEach((k, i) => {
      const cx = 360 + i * 300;
      rr(cx - 130, y - 92, 260, 184, 10, 'rgba(255,255,255,.035)', 'rgba(236,230,218,.16)', 2);
      drawOre(k, cx, y, r);
      txt(ORE[k].name, cx, y + 128, 26, UITXT, 'center', 700);
    });
  });
  // 鐵 vs 金 的並排放大比對（最會混的那兩個）
  const by = 1052;
  txt('最會混的那兩個（40%）：鐵＝直角方塊、金＝只有圓', 44, by - 22, 26, 'rgba(236,230,218,.6)', 'left', 600);
  ['iron', 'gold', 'iron', 'gold', 'iron', 'gold'].forEach((k, i) => {
    drawOre(k, 1080 + i * 130, by - 34, 22.4);
  });
}

/* ---------- 切換 ---------- */
let view = (location.search.match(/view=(\w+)/) || [])[1] || 'scene';
let COLLECT_OPEN = /collect=open/.test(location.search);
function render() {
  X.setTransform(1, 0, 0, 1, 0, 0);
  X.clearRect(0, 0, W, H);
  if (view === 'parts') parts();
  else if (view === 'power') power();
  else if (view === 'small') small();
  else scene();
}
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  C.style.width = (W * s) + 'px'; C.style.height = (H * s) + 'px';
}
addEventListener('resize', fit);
addEventListener('keydown', e => {
  if (e.key === 'c' || e.key === 'C') { COLLECT_OPEN = !COLLECT_OPEN; render(); return; }
  if (e.key === ' ' || e.key === 'Tab' || ['1', '2', '3', '4'].includes(e.key)) {
    e.preventDefault();
    view = e.key === '1' ? 'scene' : e.key === '2' ? 'parts' : e.key === '3' ? 'power' : e.key === '4' ? 'small'
      : (view === 'scene' ? 'parts' : view === 'parts' ? 'power' : view === 'power' ? 'small' : 'scene');
    render();
  }
});
fit(); render();
window.__ready = true;
