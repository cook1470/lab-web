// route：迷你地鐵類最小版原型
// 邏輯座標固定 844×390，畫面等比縮放。模擬用固定步長，機器人可同步快跑。
'use strict';
(() => {
const W = 844, H = 390, DT = 1 / 30;
const Q = new URLSearchParams(location.search);
const FAST = Math.max(1, +Q.get('fast') || 1);
let SEED = +Q.get('seed') || ((Math.random() * 1e9) | 0);

// ---------- 參數 ----------
const CAP_STATION = 6;      // 站旁超過這個數就開始倒數
const LOSE_TIME = 30;       // 撐超過幾秒就輸
const TRAIN_CAP = 6;
const TRAIN_SPEED = 70;     // px/秒
const STOP_TIME = 0.5;
const MAX_LINES = 6;
const LINE_COLORS = ['#e8433a', '#2f6fd6', '#f2b124', '#2fa36b', '#8a4fc9', '#ef7d2d'];
const INK = '#2b2b2b';

// ---------- 亂數 ----------
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- 遊戲狀態 ----------
let G;
function newGame(seed) {
  const rnd = mulberry(seed);
  G = {
    rnd, t: 0, over: false, delivered: 0,
    stations: [], lines: [], trains: [],
    spareTrains: 1, lineSlots: 3,          // 開局：3 條線的額度、4 台車（3 條線各用一台＋1 台備用）
    nextStation: 14, nextGift: 45, giftIdx: 0, paxAcc: 0,
    dist: null, bot: null, botAcc: 0, flash: [], shakeT: 0,
  };
  G.spareTrains = 4;
  // 開局三站：圓、三角、方
  addStation(0); addStation(1); addStation(2);
}

function areaRadius() { return Math.min(1, 0.45 + G.t / 400); }

function addStation(shape) {
  const r = areaRadius();
  const cx = W / 2, cy = 165;
  let best = null;
  for (let k = 0; k < 60; k++) {
    const x = cx + (G.rnd() * 2 - 1) * (W / 2 - 40) * r;
    const y = cy + (G.rnd() * 2 - 1) * (145) * Math.min(1, r + 0.2);
    let md = 1e9;
    for (const s of G.stations) md = Math.min(md, Math.hypot(s.x - x, s.y - y));
    if (md > 70) { best = { x, y }; break; }
    if (!best || md > best.md) best = { x, y, md };
  }
  if (shape === undefined) {
    const u = G.rnd();
    shape = G.t > 120 && u < 0.08 ? 3 + ((G.rnd() * 2) | 0) : u < 0.5 ? 0 : u < 0.76 ? 1 : 2;
  }
  G.stations.push({ id: G.stations.length, x: best.x, y: best.y, shape, pax: [], crowd: 0, born: G.t });
  G.dist = null;
  sfx('station');
}

function shapesOnMap() { const s = new Set(G.stations.map(x => x.shape)); return [...s]; }

// ---------- 路網距離（每種形狀：從各站到最近該形狀站的轉乘跳數） ----------
function computeDist() {
  const n = G.stations.length, adj = Array.from({ length: n }, () => []);
  for (const L of G.lines) for (let i = 0; i + 1 < L.st.length; i++) { adj[L.st[i]].push(L.st[i + 1]); adj[L.st[i + 1]].push(L.st[i]); }
  const dist = [];
  for (let sh = 0; sh < 5; sh++) {
    const d = new Array(n).fill(Infinity), q = [];
    G.stations.forEach(s => { if (s.shape === sh) { d[s.id] = 0; q.push(s.id); } });
    for (let h = 0; h < q.length; h++) for (const v of adj[q[h]]) if (d[v] === Infinity) { d[v] = d[q[h]] + 1; q.push(v); }
    dist.push(d);
  }
  G.dist = dist;
}
function bestOnLine(L, sh, exceptIdx) {
  let b = Infinity;
  L.st.forEach((sid, i) => { if (i !== exceptIdx) b = Math.min(b, G.dist[sh][sid]); });
  return b;
}

// ---------- 路線操作 ----------
function newLine(a) {
  if (G.lines.length >= G.lineSlots || G.spareTrains <= 0) return null;
  const used = new Set(G.lines.map(l => l.color));
  const color = LINE_COLORS.find(c => !used.has(c));
  const L = { color, st: [a], trainsWanted: 0 };
  G.lines.push(L);
  return L;
}
function lineReady(L) { // 線從 1 站變 2 站時派第一台車
  if (L.st.length >= 2 && !G.trains.some(t => t.line === L) && G.spareTrains > 0) addTrain(L);
  G.dist = null;
}
function addTrain(L) {
  if (G.spareTrains <= 0 || L.st.length < 2) return false;
  G.spareTrains--;
  const i = (G.rnd() * L.st.length) | 0;
  G.trains.push({ line: L, at: i, to: i, dir: i === L.st.length - 1 ? -1 : 1, prog: 0, wait: STOP_TIME, pax: [] });
  sfx('gift');
  return true;
}
function extendLine(L, end, sid) {
  if (L.st.includes(sid)) return false;
  if (end === 'head') { L.st.unshift(sid); for (const t of G.trains) if (t.line === L) { t.at++; t.to++; } }
  else L.st.push(sid);
  lineReady(L);
  sfx('link');
  return true;
}
function retractLine(L, end) { // 拖回上一站：拆掉端點
  if (L.st.length <= 1) return;
  const idx = end === 'head' ? 0 : L.st.length - 1;
  const sid = L.st[idx];
  for (const t of G.trains) if (t.line === L && (t.at === idx || t.to === idx)) {
    // 車若正要去/停在被拆的站，把它放回鄰站並把乘客放回原站
    const nb = end === 'head' ? 1 : L.st.length - 2;
    for (const p of t.pax) G.stations[sid].pax.push(p);
    t.pax = []; t.at = t.to = nb; t.prog = 0; t.wait = STOP_TIME;
  }
  if (end === 'head') { L.st.shift(); for (const t of G.trains) if (t.line === L) { t.at--; t.to--; } }
  else L.st.pop();
  if (L.st.length < 2) removeTrainsOf(L);
  G.dist = null;
}
function removeTrainsOf(L) {
  for (const t of G.trains) if (t.line === L) { const sid = L.st[Math.min(t.at, L.st.length - 1)]; for (const p of t.pax) G.stations[sid].pax.push(p); G.spareTrains++; }
  G.trains = G.trains.filter(t => t.line !== L);
}
function deleteLine(L) {
  removeTrainsOf(L);
  G.lines = G.lines.filter(l => l !== L);
  G.dist = null;
  sfx('delete');
}
function endsAt(sid) { // 找以此站為端點的線
  for (const L of G.lines) {
    if (L.st[L.st.length - 1] === sid) return { L, end: 'tail' };
    if (L.st[0] === sid) return { L, end: 'head' };
  }
  return null;
}

// ---------- 模擬一步 ----------
function step() {
  if (G.over) return;
  G.t += DT;
  if (!G.dist) computeDist();

  // 冒新站：一開始 14 秒一站，越後面越快（最快 7 秒）
  if (G.t >= G.nextStation && G.stations.length < 40) { addStation(); G.nextStation = G.t + Math.max(7, 16 - G.t / 30); }
  // 資源補給：每 45 秒給一樣，輪流給車、線、車
  if (G.t >= G.nextGift) {
    const kind = ['train', 'line', 'train'][G.giftIdx++ % 3];
    if (kind === 'line' && G.lineSlots < MAX_LINES) G.lineSlots++; else G.spareTrains++;
    G.flash.push({ kind, t: 1.5 });
    G.nextGift += 45; sfx('gift');
  }
  // 乘客：速率隨時間與站數升高
  const rate = 0.35 + G.stations.length * 0.05 + G.t * 0.0012;
  G.paxAcc += rate * DT;
  const shapes = shapesOnMap();
  while (G.paxAcc >= 1) {
    G.paxAcc -= 1;
    const s = G.stations[(G.rnd() * G.stations.length) | 0];
    const opts = shapes.filter(x => x !== s.shape);
    if (opts.length) s.pax.push(opts[(G.rnd() * opts.length) | 0]);
  }

  // 列車
  for (const tr of G.trains) {
    const L = tr.line, n = L.st.length;
    if (tr.wait > 0) {
      tr.wait -= DT;
      if (tr.wait <= 0) {
        serveStop(tr);
        if (tr.at + tr.dir < 0 || tr.at + tr.dir >= n) tr.dir = -tr.dir;
        tr.to = Math.max(0, Math.min(n - 1, tr.at + tr.dir)); tr.prog = 0;
      }
      continue;
    }
    const a = G.stations[L.st[tr.at]], b = G.stations[L.st[tr.to]];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    tr.prog += TRAIN_SPEED * DT / len;
    if (tr.prog >= 1) { tr.at = tr.to; tr.prog = 0; tr.wait = STOP_TIME; }
  }

  // 擁擠計時
  for (const s of G.stations) {
    if (s.pax.length > CAP_STATION) s.crowd += DT; else s.crowd = Math.max(0, s.crowd - DT * 0.5);
    if (s.crowd >= LOSE_TIME) { G.over = true; G.lost = s; sfx('lose'); }
  }
  for (const f of G.flash) f.t -= DT;
  G.flash = G.flash.filter(f => f.t > 0);

  if (G.bot) { G.botAcc += DT; if (G.botAcc >= 1) { G.botAcc = 0; BOTS[G.bot](); } }
}

function serveStop(tr) {
  if (!G.dist) computeDist();
  const L = tr.line, i = tr.at, s = G.stations[L.st[i]];
  let got = 0;
  // 下車：到了，或這站比線上其他站都更接近目的地（轉乘）
  tr.pax = tr.pax.filter(p => {
    if (p === s.shape) { G.delivered++; got++; return false; }
    if (G.dist[p][s.id] < bestOnLine(L, p, i)) { s.pax.push(p); return false; }
    return true;
  });
  // 上車：線上其他站能更接近目的地才上
  s.pax = s.pax.filter(p => {
    if (tr.pax.length >= TRAIN_CAP) return true;
    if (bestOnLine(L, p, i) < G.dist[p][s.id]) { tr.pax.push(p); return false; }
    return true;
  });
  if (got) sfx('deliver');
}

// ---------- 自動玩家 ----------
function nearestStation(sid, pred) {
  const a = G.stations[sid]; let best = null, bd = 1e9;
  for (const s of G.stations) { if (s.id === sid || (pred && !pred(s))) continue; const d = Math.hypot(s.x - a.x, s.y - a.y); if (d < bd) { bd = d; best = s; } }
  return best;
}
function connected(sid) { return G.lines.some(L => L.st.length >= 2 && L.st.includes(sid)); }
// 把一個還沒接上的站連到離它最近的那一站
function connectNearest(sid) {
  const near = nearestStation(sid, s => s.id !== sid);
  if (!near) return;
  const e = endsAt(near.id);
  if (e) { extendLine(e.L, e.end, sid); return; }
  const L = newLine(near.id);
  if (L) { extendLine(L, 'tail', sid); return; }
  // 沒有空線：接到離它最近的某條線端點
  const end = nearestStation(sid, s => !!endsAt(s.id));
  if (end) { const e2 = endsAt(end.id); extendLine(e2.L, e2.end, sid); }
}
const BOTS = {
  naive() {
    // 開局三站：先把兩站接起來
    for (const s of G.stations) if (!connected(s.id)) { connectNearest(s.id); break; }
  },
  smart() {
    for (const s of G.stations) if (!connected(s.id)) { connectNearest(s.id); break; }
    // 最擠的站
    const hot = [...G.stations].sort((a, b) => (b.pax.length + b.crowd) - (a.pax.length + a.crowd))[0];
    if (!hot || hot.pax.length < 4) return;
    // 1) 有備用車：加到經過最擠站的線（車少的優先）
    const through = G.lines.filter(L => L.st.includes(hot.id) && L.st.length >= 2);
    if (G.spareTrains > 1 || (G.spareTrains > 0 && G.lines.length >= G.lineSlots)) {
      through.sort((a, b) => G.trains.filter(t => t.line === a).length / a.st.length - G.trains.filter(t => t.line === b).length / b.st.length);
      if (through[0] && addTrain(through[0])) return;
    }
    // 2) 有空線：從最擠站拉一條直線到它乘客最想去的形狀（最近那站）
    if (G.lines.length < G.lineSlots && G.spareTrains > 0) {
      const cnt = [0, 0, 0, 0, 0]; hot.pax.forEach(p => cnt[p]++);
      const want = cnt.indexOf(Math.max(...cnt));
      const tgt = nearestStation(hot.id, s => s.shape === want);
      if (tgt) { const L = newLine(hot.id); if (L) extendLine(L, 'tail', tgt.id); }
    }
  },
};
window.ROUTE_BOT = (kind, seed) => {
  newGame(seed !== undefined ? seed : SEED);
  G.bot = kind;
  const LIMIT = 45 * 60;
  while (!G.over && G.t < LIMIT) step();
  window.ROUTE_RESULT = { 存活秒數: Math.round(G.t), 載客數: G.delivered, survive: Math.round(G.t), delivered: G.delivered, seed: seed !== undefined ? seed : SEED, kind };
  return window.ROUTE_RESULT;
};

// ---------- 音效（WebAudio 合成） ----------
let AC = null, lastSfx = {};
function sfx(kind) {
  if (!AC || G.bot && !Q.get('bot')) return;
  const now = AC.currentTime;
  if (lastSfx[kind] && now - lastSfx[kind] < 0.12) return;
  lastSfx[kind] = now;
  const tone = (f, d, v, type = 'sine', at = 0) => {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, now + at); g.gain.linearRampToValueAtTime(v, now + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + at + d);
    o.connect(g).connect(AC.destination); o.start(now + at); o.stop(now + at + d + 0.05);
  };
  if (kind === 'deliver') tone(880 + Math.random() * 220, 0.12, 0.04);
  else if (kind === 'link') tone(520, 0.09, 0.06, 'triangle');
  else if (kind === 'station') { tone(392, 0.3, 0.05); tone(587, 0.35, 0.04, 'sine', 0.08); }
  else if (kind === 'gift') { tone(660, 0.2, 0.05, 'triangle'); tone(990, 0.3, 0.04, 'triangle', 0.1); }
  else if (kind === 'warn') tone(220, 0.25, 0.05, 'square');
  else if (kind === 'delete') tone(300, 0.15, 0.06, 'triangle');
  else if (kind === 'lose') { tone(330, 0.5, 0.07, 'sawtooth'); tone(247, 0.8, 0.07, 'sawtooth', 0.25); }
}
function unlockAudio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } else if (AC.state === 'suspended') AC.resume(); }

// ---------- 繪圖 ----------
const cv = document.getElementById('c'), cx = cv.getContext('2d');
let scale = 1, offX = 0, offY = 0;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  scale = Math.min(innerWidth / W, innerHeight / H);
  offX = (innerWidth - W * scale) / 2; offY = (innerHeight - H * scale) / 2;
  cx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
}
addEventListener('resize', resize);

function shapePath(sh, x, y, r) {
  cx.beginPath();
  if (sh === 0) cx.arc(x, y, r, 0, Math.PI * 2);
  else if (sh === 1) { cx.moveTo(x, y - r * 1.15); cx.lineTo(x + r * 1.1, y + r * 0.8); cx.lineTo(x - r * 1.1, y + r * 0.8); cx.closePath(); }
  else if (sh === 2) cx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
  else if (sh === 3) { cx.moveTo(x, y - r * 1.2); cx.lineTo(x + r * 1.2, y); cx.lineTo(x, y + r * 1.2); cx.lineTo(x - r * 1.2, y); cx.closePath(); }
  else { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.55 : r * 1.25; cx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } cx.closePath(); }
}

// 底部路線色塊的位置
function chipRect(i) { return { x: 250 + i * 58, y: 350, w: 44, h: 30 }; }

function draw() {
  cx.fillStyle = '#f4f1ea'; cx.fillRect(-offX / scale, -offY / scale, innerWidth / scale, innerHeight / scale);
  // 路線
  cx.lineCap = 'round'; cx.lineJoin = 'round';
  G.lines.forEach((L, li) => {
    cx.strokeStyle = L.color; cx.lineWidth = 7;
    const off = (li - (G.lines.length - 1) / 2) * 0; // 同站多線暫不偏移
    cx.beginPath();
    L.st.forEach((sid, i) => { const s = G.stations[sid]; i ? cx.lineTo(s.x + off, s.y + off) : cx.moveTo(s.x + off, s.y + off); });
    if (drag && drag.L === L && drag.pt) {
      const endS = G.stations[drag.end === 'head' ? L.st[0] : L.st[L.st.length - 1]];
      cx.stroke(); cx.globalAlpha = 0.5; cx.beginPath(); cx.moveTo(endS.x, endS.y); cx.lineTo(drag.pt.x, drag.pt.y);
    }
    cx.stroke(); cx.globalAlpha = 1;
    // 端點小槓：提示可以從這裡繼續拉
    if (L.st.length >= 2) for (const [e, nb] of [[0, 1], [L.st.length - 1, L.st.length - 2]]) {
      const a = G.stations[L.st[e]], b = G.stations[L.st[nb]];
      const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(a.x + ux * 20, a.y + uy * 20); cx.stroke();
      cx.beginPath(); cx.moveTo(a.x + ux * 20 - uy * 8, a.y + uy * 20 + ux * 8); cx.lineTo(a.x + ux * 20 + uy * 8, a.y + uy * 20 - ux * 8); cx.stroke();
    }
  });
  // 列車
  for (const tr of G.trains) {
    const L = tr.line, a = G.stations[L.st[tr.at]], b = G.stations[L.st[tr.to]];
    const x = a.x + (b.x - a.x) * tr.prog, y = a.y + (b.y - a.y) * tr.prog;
    const ang = Math.atan2(b.y - a.y, b.x - a.x) || 0;
    cx.save(); cx.translate(x, y); cx.rotate(ang);
    cx.fillStyle = L.color; cx.fillRect(-15, -8, 30, 16);
    cx.fillStyle = '#fff';
    tr.pax.forEach((p, k) => { shapePath(p, -10 + (k % 3) * 10, -3.5 + ((k / 3) | 0) * 7, 2.6); cx.fill(); });
    cx.restore();
  }
  // 車站
  const tt = performance.now() / 1000;
  for (const s of G.stations) {
    const f = s.crowd / LOSE_TIME;
    const sh = f > 0.4 ? Math.sin(tt * 40) * (f - 0.4) * 5 : 0;
    const x = s.x + sh, y = s.y;
    // 擠的程度：站旁灰圈 → 計時紅圈
    if (s.crowd > 0) {
      cx.fillStyle = `rgba(232,67,58,${0.08 + f * 0.25})`;
      cx.beginPath(); cx.arc(x, y, 30 + f * 6, 0, Math.PI * 2); cx.fill();
      cx.strokeStyle = '#e8433a'; cx.lineWidth = 4;
      cx.beginPath(); cx.arc(x, y, 30 + f * 6, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); cx.stroke();
    }
    const fillC = s.pax.length > CAP_STATION ? '#ffd9d4' : s.pax.length >= CAP_STATION - 1 ? '#fff0d0' : '#fff';
    shapePath(s.shape, x, y, 12); cx.fillStyle = fillC; cx.fill();
    cx.lineWidth = 4; cx.strokeStyle = INK; cx.stroke();
    // 新站剛出現：擴散圈
    const age = G.t - s.born;
    if (age < 1.5 && s.born > 0) { cx.strokeStyle = `rgba(43,43,43,${1 - age / 1.5})`; cx.lineWidth = 2; cx.beginPath(); cx.arc(x, y, 14 + age * 30, 0, Math.PI * 2); cx.stroke(); }
    // 等車的乘客
    cx.fillStyle = INK;
    s.pax.slice(0, 18).forEach((p, k) => {
      const col = k % 6, row = (k / 6) | 0;
      shapePath(p, x + 20 + col * 9, y - 8 + row * 9, 3); cx.fillStyle = k >= CAP_STATION ? '#e8433a' : INK; cx.fill();
    });
  }
  // 底部：路線色塊（點＝加車、按住＝拆線）與資源
  for (let i = 0; i < MAX_LINES; i++) {
    const r = chipRect(i), L = G.lines[i];
    if (i >= G.lineSlots) continue;
    cx.fillStyle = L ? L.color : 'rgba(43,43,43,0.12)';
    cx.beginPath(); cx.roundRect(r.x, r.y, r.w, r.h, 15); cx.fill();
    if (L) {
      const n = G.trains.filter(t => t.line === L).length;
      cx.fillStyle = '#fff';
      for (let k = 0; k < n; k++) cx.fillRect(r.x + 8 + k * 8, r.y + 11, 5, 8);
      if (hold && hold.L === L) { cx.strokeStyle = INK; cx.lineWidth = 3; cx.beginPath(); cx.arc(r.x + r.w / 2, r.y + r.h / 2, 19, -Math.PI / 2, -Math.PI / 2 + Math.min(1, hold.t / 0.6) * Math.PI * 2); cx.stroke(); }
    }
  }
  // 備用列車
  const gf = G.flash.find(f => f.kind === 'train');
  for (let k = 0; k < G.spareTrains; k++) {
    cx.fillStyle = INK; cx.fillRect(40 + k * 26, 356 - (gf && k === G.spareTrains - 1 ? gf.t * 6 : 0), 20, 14);
  }
  // 分數
  cx.fillStyle = INK; cx.font = '600 22px system-ui,sans-serif'; cx.textAlign = 'right';
  cx.fillText(G.delivered, W - 24, 34);
  // 時間進度：右上一圈細環（每 45 秒一次補給）
  const gp = 1 - (G.nextGift - G.t) / 45;
  cx.strokeStyle = 'rgba(43,43,43,0.25)'; cx.lineWidth = 3;
  cx.beginPath(); cx.arc(W - 24 - 60, 27, 9, -Math.PI / 2, -Math.PI / 2 + gp * Math.PI * 2); cx.stroke();

  if (G.over) {
    cx.fillStyle = 'rgba(244,241,234,0.8)'; cx.fillRect(0, 0, W, H);
    const s = G.lost; shapePath(s.shape, s.x, s.y, 12); cx.strokeStyle = '#e8433a'; cx.lineWidth = 5; cx.stroke();
    cx.beginPath(); cx.arc(s.x, s.y, 40 + Math.sin(tt * 4) * 4, 0, Math.PI * 2); cx.stroke();
    cx.fillStyle = INK; cx.textAlign = 'center'; cx.font = '700 64px system-ui,sans-serif';
    cx.fillText(G.delivered, W / 2, H / 2 + 10);
    cx.font = '500 20px system-ui,sans-serif'; cx.fillText(Math.floor(G.t / 60) + ':' + String(Math.floor(G.t % 60)).padStart(2, '0'), W / 2, H / 2 + 44);
    // 重來圖示
    cx.strokeStyle = INK; cx.lineWidth = 4; cx.beginPath(); cx.arc(W / 2, H / 2 + 95, 16, 0.3, Math.PI * 1.8); cx.stroke();
    cx.beginPath(); cx.moveTo(W / 2 + 16, H / 2 + 80); cx.lineTo(W / 2 + 17, H / 2 + 93); cx.lineTo(W / 2 + 5, H / 2 + 90); cx.stroke();
  }
}

// ---------- 輸入 ----------
let drag = null, hold = null;
function toWorld(e) { return { x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale }; }
function stationAt(p, r = 26) {
  let best = null, bd = r;
  for (const s of G.stations) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; best = s; } }
  return best;
}
cv.addEventListener('pointerdown', e => {
  unlockAudio();
  cv.setPointerCapture(e.pointerId);
  const p = toWorld(e);
  if (G.over) { newGame((Math.random() * 1e9) | 0); return; }
  for (let i = 0; i < G.lines.length; i++) {
    const r = chipRect(i);
    if (p.x >= r.x - 6 && p.x <= r.x + r.w + 6 && p.y >= r.y - 8 && p.y <= r.y + r.h + 8) { hold = { L: G.lines[i], t: 0, start: performance.now() }; return; }
  }
  const s = stationAt(p);
  if (!s) return;
  const e1 = endsAt(s.id);
  if (e1) drag = { L: e1.L, end: e1.end, pt: p };
  else { const L = newLine(s.id); if (L) drag = { L, end: 'tail', pt: p, fresh: true }; else sfx('warn'); }
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = toWorld(e); drag.pt = p;
  const L = drag.L, s = stationAt(p, 20);
  if (!s) return;
  const endId = drag.end === 'head' ? L.st[0] : L.st[L.st.length - 1];
  const prevId = L.st.length >= 2 ? (drag.end === 'head' ? L.st[1] : L.st[L.st.length - 2]) : null;
  if (s.id === endId) return;
  if (s.id === prevId) retractLine(L, drag.end);
  else if (!L.st.includes(s.id)) {
    if (L.st.length === 1 && G.spareTrains <= 0 && !G.trains.some(t => t.line === L)) { sfx('warn'); return; }
    extendLine(L, drag.end, s.id);
  }
});
function endDrag() {
  if (drag && drag.L.st.length < 2) { deleteLine(drag.L); }
  drag = null;
  if (hold) { if (hold.t < 0.6) { if (!addTrain(hold.L)) sfx('warn'); } hold = null; }
}
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', () => { drag = null; hold = null; });

// ---------- 主迴圈 ----------
let last = performance.now(), acc = 0, warned = new Set();
function frame(now) {
  const el = Math.min(0.1, (now - last) / 1000); last = now;
  if (hold) { hold.t = (now - hold.start) / 1000; if (hold.t >= 0.6) { deleteLine(hold.L); hold = null; } }
  acc += el * FAST;
  let n = 0;
  while (acc >= DT && n < 600) { step(); acc -= DT; n++; }
  // 剛開始爆站時響一聲警告
  for (const s of G.stations) { if (s.crowd > 0 && !warned.has(s)) { warned.add(s); sfx('warn'); } if (s.crowd === 0) warned.delete(s); }
  draw();
  requestAnimationFrame(frame);
}
newGame(SEED);
if (Q.get('bot')) G.bot = Q.get('bot');
resize();
requestAnimationFrame(frame);
window.__route = () => G;
})();
