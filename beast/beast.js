// 怪獸飼養原型：自動戰鬥，打完從掉落食物選一樣餵牠
'use strict';
const W = 280, H = 130;
const cv = document.getElementById('c'), g = cv.getContext('2d');
// Sweetie 16 色盤
const P = ['#1a1c2c','#5d275d','#b13e53','#ef7d57','#ffcd75','#a7f070','#38b764','#257179','#29366f','#3b5dc9','#41a6f6','#73eff7','#f4f4f4','#94b0c2','#566c86','#333c57'];

function fit() {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
  cv.style.left = ((innerWidth - W * s) / 2 | 0) + 'px'; cv.style.top = ((innerHeight - H * s) / 2 | 0) + 'px';
  cv._s = s;
}
addEventListener('resize', fit); fit();

const R = n => Math.floor(Math.random() * n);
const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); };

// ---------- 食物 ----------
// 每樣食物：改外觀欄位＋改數值＋顏色傾向
const FOODS = {
  horn:  { col: 12, apply: b => { b.horns++; b.atk += 2; } },            // 骨頭：長角、開場衝撞
  fish:  { col: 10, apply: b => { b.tails++; b.cd = Math.max(18, b.cd - 7); } }, // 魚：多一條尾巴、打更快、甩尾追擊
  cake:  { col: 3,  apply: b => { b.fat++; b.maxhp += 14; } },            // 蛋糕：變胖、血厚
  cactus:{ col: 6,  apply: b => { b.spikes++; b.maxhp += 3; } },          // 仙人掌：背刺、反傷
  eye:   { col: 2,  apply: b => { b.eyes++; b.atk += 1; } },              // 眼球：多眼、爆擊
  shroom:{ col: 1,  apply: b => { b.poison++; } },                        // 毒菇：變紫、攻擊帶毒
};
const FOOD_KEYS = Object.keys(FOODS);

function newBeast(col) {
  return { maxhp: 34, hp: 34, atk: 4, cd: 52, horns: 0, tails: 0, fat: 0, spikes: 0, eyes: 0, poison: 0,
    tint: [col], eaten: [] };
}
function feed(b, k) {
  FOODS[k].apply(b); b.tint.push(FOODS[k].col); if (b.tint.length > 4) b.tint.shift(); b.eaten.push(k); b.hp = b.maxhp;
}
function clone(b) { return JSON.parse(JSON.stringify(b)); }
function hexRgb(h) { return [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)); }
function bodyCol(b, dark) {
  // 最近吃的顏色權重較高
  let s = [0, 0, 0], tw = 0;
  b.tint.forEach((c, i) => { const w = i + 1; const r = hexRgb(P[c]); s = s.map((v, j) => v + r[j] * w); tw += w; });
  const k = dark ? 0.55 : 1;
  return `rgb(${s.map(v => Math.round(v / tw * k)).join(',')})`;
}

// ---------- 畫怪 ----------
// x,y = 腳底中心；f = 面向(1右 -1左)；sc = 整體倍率(王 2)
function drawBeast(b, x, y, f, sc = 1, t = 0, flash = 0) {
  const bw = (9 + b.fat * 2.2) * sc, bh = (6 + b.fat * 1.4) * sc;
  const cx = x, cy = y - 3 * sc - bh;
  const main = flash ? '#f4f4f4' : bodyCol(b), dk = flash ? '#f4f4f4' : bodyCol(b, true);
  const out = '#1a1c2c';
  const bob = Math.round(Math.sin(t / 6) * 0.6 * sc);
  // 尾巴（身體後方，每條不同角度、會擺）
  for (let i = 0; i < b.tails; i++) {
    const ang = -0.4 - i * 0.45 + Math.sin(t / 8 + i) * 0.15;
    for (let s = 0; s < 10 + b.tails; s++) {
      const tx = cx - f * (bw - 1 + Math.cos(ang) * s * sc), ty = cy + bob + Math.sin(ang) * s * sc - Math.sin(s / 3 + t / 7) * sc;
      px(tx - sc, ty - sc, 2 * sc + 1, 2 * sc + 1, out);
    }
    for (let s = 0; s < 10 + b.tails; s++) {
      const tx = cx - f * (bw - 1 + Math.cos(ang) * s * sc), ty = cy + bob + Math.sin(ang) * s * sc - Math.sin(s / 3 + t / 7) * sc;
      px(tx - sc / 2, ty - sc / 2, sc + (s < 3 ? 1 : 0), sc, s > 8 + b.tails ? P[FOODS.fish.col] : dk);
    }
  }
  // 腳
  const legs = 2 + Math.min(2, b.fat);
  for (let i = 0; i < legs; i++) {
    const lx = cx - bw * 0.6 + (bw * 1.2) * i / (legs - 1);
    const step = Math.round(Math.sin(t / 4 + i * 2) * sc);
    px(lx - sc - 1, cy + bh - 2 + step, 2 * sc + 2, 5 * sc + 1, out);
    px(lx - sc, cy + bh - 2 + step, 2 * sc, 5 * sc, dk);
  }
  // 背刺
  for (let i = 0; i < b.spikes * 2; i++) {
    const a = Math.PI + 0.35 + (Math.PI - 0.7) * (i + 0.5) / (b.spikes * 2);
    const sx = cx + Math.cos(a) * bw * f * -1, sy = cy + bob + Math.sin(a) * bh;
    const len = (3 + b.spikes * 0.5) * sc;
    for (let s = 0; s < len; s++) { const w = Math.max(1, (len - s) / 2); px(sx - w / 2 + Math.cos(a) * s * -f * 0.3, sy - s, w, 1, s === 0 ? out : P[6]); }
  }
  // 身體（橢圓，外框）
  for (let yy = -bh - 1; yy <= bh + 1; yy++) {
    const w = Math.sqrt(Math.max(0, 1 - (yy / (bh + 1)) ** 2)) * (bw + 1);
    px(cx - w, cy + yy + bob, w * 2, 1, out);
  }
  for (let yy = -bh; yy <= bh; yy++) {
    const w = Math.sqrt(Math.max(0, 1 - (yy / bh) ** 2)) * bw;
    px(cx - w, cy + yy + bob, w * 2, 1, yy > bh * 0.35 ? dk : main);
  }
  // 毒斑
  for (let i = 0; i < b.poison * 2; i++) {
    const a = i * 2.4, r = 0.55;
    px(cx + Math.cos(a) * bw * r, cy + bob + Math.sin(a) * bh * r * 0.8, sc + 1, sc + 1, flash ? '#f4f4f4' : P[5]);
  }
  // 頭（身體前端）
  const hr = (4 + b.fat * 0.6) * sc, hx = cx + f * (bw - 1), hy = cy - bh * 0.3 + bob;
  for (let yy = -hr - 1; yy <= hr + 1; yy++) { const w = Math.sqrt(Math.max(0, 1 - (yy / (hr + 1)) ** 2)) * (hr + 1); px(hx - w, hy + yy, w * 2, 1, out); }
  for (let yy = -hr; yy <= hr; yy++) { const w = Math.sqrt(Math.max(0, 1 - (yy / hr) ** 2)) * hr; px(hx - w, hy + yy, w * 2, 1, main); }
  // 角（頭上，一根一根往後排、越後越長）
  for (let i = 0; i < b.horns; i++) {
    const bx = hx + f * (hr * 0.4 - i * 2.5 * sc), by = hy - hr + 1;
    const len = (5 + i * 2) * sc;
    for (let s = 0; s < len; s++) {
      const w = Math.max(1, Math.round((len - s) / len * 2.5 * sc));
      const ox = f * (s * 0.35 - (s * s) / (len * 3)) * -1;
      px(bx + ox - w / 2 - 1, by - s, w + 2, 1, out);
    }
    for (let s = 0; s < len - 1; s++) {
      const w = Math.max(1, Math.round((len - s) / len * 2.5 * sc));
      const ox = f * (s * 0.35 - (s * s) / (len * 3)) * -1;
      px(bx + ox - w / 2, by - s, w, 1, s > len * 0.6 ? P[4] : P[12]);
    }
  }
  // 眼睛：基本一顆＋吃眼球長出來的（頭上和身上）
  const eyes = [[hx + f * hr * 0.35, hy - hr * 0.2]];
  for (let i = 0; i < b.eyes; i++) {
    const a = i * 1.9 + 0.6;
    eyes.push(i % 2 === 0 ? [hx + f * (Math.cos(a) * hr * 0.5 - 1), hy + Math.sin(a) * hr * 0.45]
                          : [cx + Math.cos(a) * bw * 0.5, cy + bob - bh * 0.3 + Math.sin(a) * bh * 0.3]);
  }
  const blink = (t % 150) < 5;
  eyes.forEach(([ex, ey], i) => {
    const s = i === 0 ? 1 : 0;
    px(ex - 1 - s, ey - 1 - s, 3 + s * 2, blink ? 1 : 3 + s, '#f4f4f4');
    if (!blink) px(ex + f * (s ? 1 : 0) - (s ? 0 : 0), ey - s + 1, 1 + s, 1 + s, out);
  });
}

// ---------- 食物圖示 ----------
function drawFood(k, x, y, s = 2) {
  const q = (a, b, w, h, c) => px(x + a * s, y + b * s, w * s, h * s, c);
  if (k === 'horn') { q(1, 3, 6, 2, P[12]); q(0, 2, 2, 2, P[12]); q(0, 4, 2, 2, P[12]); q(6, 2, 2, 2, P[12]); q(6, 4, 2, 2, P[12]); q(2, 4, 4, 1, P[13]); }
  if (k === 'fish') { q(1, 2, 5, 4, P[10]); q(0, 3, 1, 2, P[10]); q(6, 1, 2, 2, P[9]); q(6, 5, 2, 2, P[9]); q(2, 3, 1, 1, P[0]); q(2, 5, 3, 1, P[9]); }
  if (k === 'cake') { q(1, 3, 6, 4, P[3]); q(1, 3, 6, 1, P[12]); q(1, 5, 6, 1, P[4]); q(3, 1, 2, 2, P[2]); }
  if (k === 'cactus') { q(3, 0, 2, 8, P[6]); q(0, 2, 2, 3, P[6]); q(1, 4, 2, 1, P[6]); q(6, 1, 2, 3, P[6]); q(5, 3, 1, 1, P[6]); q(2, 7, 4, 1, P[3]); q(3, 2, 1, 1, P[5]); }
  if (k === 'eye') { q(1, 1, 6, 6, P[12]); q(0, 2, 8, 4, P[12]); q(2, 2, 4, 4, P[2]); q(3, 3, 2, 2, P[0]); q(6, 6, 2, 2, P[2]); }
  if (k === 'shroom') { q(0, 1, 8, 3, P[1]); q(1, 0, 6, 1, P[1]); q(2, 1, 1, 1, P[5]); q(5, 2, 1, 1, P[5]); q(3, 4, 2, 4, P[12]); }
}
// 小圖示：愛心、劍、閃電、盾刺、目標、毒滴
function icon(name, x, y, c) {
  const m = {
    hp: ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..'],
    atk: ['....x', '...x.', 'x.x..', '.x...', 'x.x..'],
    spd: ['..xx.', '.xx..', 'xxxx.', '..xx.', '.xx..'],
    thorn: ['x...x', '.x.x.', '..x..', '.x.x.', 'x...x'],
    crit: ['..x..', '.xxx.', 'xx.xx', '.xxx.', '..x..'],
    psn: ['..x..', '.xxx.', 'xxxxx', 'xxxxx', '.xxx.'],
    charge: ['x....', 'xx...', 'xxx..', 'xx...', 'x....'],
  }[name];
  m.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === 'x') px(x + i, y + j, 1, 1, c); }));
}
const FOOD_ICONS = { horn: [['charge', P[12]], ['atk', P[3]]], fish: [['spd', P[11]], ['atk', P[10]]], cake: [['hp', P[2]], ['hp', P[2]]], cactus: [['thorn', P[5]]], eye: [['crit', P[4]]], shroom: [['psn', P[5]]] };

// ---------- 遊戲狀態 ----------
let me, round, mode, fx = [], nums = [], t = 0, choices = [], battle = null, fast = false, pick = -1, pickT = 0;
const ROUNDS = 10;

function reset() {
  me = newBeast(9); round = 1; mode = 'title'; battle = null;
}
function makeEnemy(r) {
  const e = newBeast([13, 7, 14, 8][R(4)]);
  const n = r === ROUNDS ? 9 : r - 1;
  for (let i = 0; i < n; i++) feed(e, FOOD_KEYS[R(FOOD_KEYS.length)]);
  if (r === ROUNDS) { e.maxhp = Math.round(e.maxhp * 1.25); e.hp = e.maxhp; }
  else { e.maxhp = Math.round(e.maxhp * (0.7 + r * 0.02)); e.hp = e.maxhp; }
  return e;
}
function startBattle() {
  me.hp = me.maxhp;
  const e = makeEnemy(round);
  const boss = round === ROUNDS;
  battle = {
    a: { b: me, x: -20, f: 1, cd: 30, lunge: 0, flash: 0, psn: 0, charged: false, sc: 2 },
    e: { b: e, x: W + 20 + (boss ? 20 : 0), f: -1, cd: 36, lunge: 0, flash: 0, psn: 0, charged: false, sc: boss ? 3 : 2 },
    phase: 'walk', end: 0,
  };
  mode = 'battle';
}
function hit(att, def, bonus = 0, kind = '') {
  const B = att.b;
  let dmg = B.atk + bonus;
  let crit = Math.random() < B.eyes * 0.14;
  if (crit) dmg *= 2;
  def.b.hp -= dmg; def.flash = 6;
  nums.push({ x: def.x, y: 70 - def.sc * 18, v: dmg, c: crit ? P[4] : kind === 'charge' ? P[12] : P[12], big: crit || kind === 'charge', t: 0 });
  for (let i = 0; i < 5 + (crit ? 6 : 0); i++) fx.push({ x: def.x, y: 90 - def.sc * 8, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2.5, c: crit ? P[4] : P[12], t: 20 });
  if (B.poison) def.psn += B.poison;
  // 反傷
  if (def.b.spikes && kind !== 'thorn') {
    const th = def.b.spikes * 2;
    att.b.hp -= th; att.flash = 4;
    nums.push({ x: att.x, y: 66 - att.sc * 18, v: th, c: P[5], t: 0 });
  }
  shake = crit || kind === 'charge' ? 4 : 2;
}
let shake = 0;
function stepBattle() {
  const bt = battle, A = bt.a, E = bt.e;
  const both = [[A, E], [E, A]];
  if (bt.phase === 'walk') {
    // 有角的衝得快，並在接觸時發動衝撞
    A.x += 1 + A.b.horns * 0.35; E.x -= 1 + E.b.horns * 0.35;
    const reach = (sd) => 14 + sd.b.fat * 2.5 * sd.sc + sd.sc * 6;
    if (E.x - A.x < reach(A) + reach(E) - 6) {
      bt.phase = 'fight';
      both.forEach(([s, o]) => { if (s.b.horns) { s.lunge = 10; hit(s, o, s.b.horns * 4, 'charge'); } });
    }
    return;
  }
  if (bt.phase === 'fight') {
    both.forEach(([s, o]) => {
      if (s.b.hp <= 0 || o.b.hp <= 0) return;
      if (--s.cd <= 0) {
        s.cd = s.b.cd; s.lunge = 8; hit(s, o);
        // 甩尾追擊
        if (s.b.tails && Math.random() < 0.2 * s.b.tails) s.tailHit = 9;
      }
      if (s.tailHit && --s.tailHit === 0 && o.b.hp > 0) { hit(s, o, -Math.floor(s.b.atk / 2)); }
    });
    if (t % 30 === 0) both.forEach(([s]) => { if (s.psn && s.b.hp > 0) { s.b.hp -= s.psn; nums.push({ x: s.x, y: 50, v: s.psn, c: P[5], t: 0 }); } });
    if (A.b.hp <= 0 || E.b.hp <= 0) { bt.phase = 'end'; bt.win = A.b.hp > 0; bt.end = 0; }
  }
  if (bt.phase === 'end') {
    const L = bt.win ? E : A;
    L.dead = (L.dead || 0) + 1;
    if (++bt.end > 60) {
      if (!bt.win) { mode = 'lose'; }
      else if (round === ROUNDS) { mode = 'won'; }
      else { round++; offerFood(); }
    }
  }
  [A, E].forEach(s => { if (s.lunge) s.lunge--; if (s.flash) s.flash--; });
}
function offerFood() {
  const ks = [...FOOD_KEYS].sort(() => Math.random() - 0.5).slice(0, round % 3 === 0 ? 2 : 3);
  choices = ks; mode = 'feed'; pick = -1; nums = []; fx = [];
}
function choose(i) {
  if (mode !== 'feed' || pick >= 0 || !choices[i]) return;
  pick = i; pickT = 0;
}

// ---------- 繪製 ----------
function drawArena() {
  px(0, 0, W, H, P[15]);
  // 看台
  for (let i = 0; i < 28; i++) { px(i * 10 + (i % 2) * 3, 8 + (i * 7) % 5, 6, 7, P[(i * 5) % 3 + 13]); px(i * 10 + 1 + (i % 2) * 3, 6 + (i * 7) % 5, 4, 3, P[i % 2 ? 3 : 4]); }
  px(0, 18, W, 3, P[1]);
  px(0, 21, W, 70, P[8]);
  px(0, 88, W, 42, '#6b5040'); px(0, 88, W, 2, '#8a6a52');
  for (let i = 0; i < 20; i++) px((i * 37) % W, 95 + (i * 13) % 30, 3, 1, '#5a4234');
}
function drawRoundDots() {
  for (let i = 1; i <= ROUNDS; i++) {
    const boss = i === ROUNDS, s = boss ? 6 : 4, x = W / 2 - ROUNDS * 4 + i * 8 - (boss ? 1 : 0), y = 2 - (boss ? 1 : 0);
    px(x, y, s, s, i < round ? P[5] : i === round ? P[4] : P[14]);
  }
}
function hpBar(x, y, w, b, c) {
  px(x - 1, y - 1, w + 2, 5, P[0]); px(x, y, w, 3, P[14]);
  px(x, y, Math.max(0, w * b.hp / b.maxhp), 3, c);
}
function statRow(b, x, y) {
  // 用圖示＋點數表示特質
  const items = [['charge', P[12], b.horns], ['spd', P[11], b.tails], ['hp', P[2], b.fat], ['thorn', P[5], b.spikes], ['crit', P[4], b.eyes], ['psn', P[5], b.poison]];
  let cx = x;
  items.forEach(([n, c, v]) => { if (!v) return; icon(n, cx, y, c); for (let i = 0; i < v; i++) px(cx + 7 + (i % 5) * 2, y + (i >= 5 ? 3 : 0) + 1, 1, 2, c); cx += 9 + Math.min(5, v) * 2; });
}

function render() {
  g.save();
  if (shake) { g.translate(R(3) - 1, R(3) - 1); shake--; }
  drawArena();
  if (mode === 'title') {
    drawBeast(me, W / 2, 96, 1, 2, t);
    playBtn(W / 2, 112);
  }
  if (mode === 'battle') {
    const bt = battle;
    [bt.e, bt.a].forEach(s => {
      if (s.dead > 40) return;
      const lx = s.lunge ? s.f * Math.sin(s.lunge / 8 * Math.PI) * 6 : 0;
      g.globalAlpha = s.dead ? 1 - s.dead / 40 : 1;
      px(s.x - 12 * s.sc, 97, 24 * s.sc, 2, 'rgba(0,0,0,.25)');
      drawBeast(s.b, Math.round(s.x + lx), 98, s.f, s.sc, t + (s === bt.e ? 50 : 0), s.flash > 3);
      g.globalAlpha = 1;
    });
    hpBar(8, 110, 90, bt.a.b, P[5]); hpBar(W - 98, 110, 90, bt.e.b, P[2]);
    statRow(bt.a.b, 8, 117); statRow(bt.e.b, W - 98, 117);
    if (bt.a.psn) icon('psn', 100, 109, P[5]);
    if (bt.e.psn) icon('psn', W - 105, 109, P[5]);
    drawRoundDots();
    if (fast) { icon('spd', W - 10, 2, P[4]); icon('spd', W - 14, 2, P[4]); }
  }
  if (mode === 'feed') drawFeed();
  if (mode === 'lose' || mode === 'won') {
    px(0, 0, W, H, 'rgba(26,28,44,.6)'); nums = []; fx = [];
    drawBeast(me, W / 2, 80, 1, 2, t, 0);
    if (mode === 'won') { const x = W / 2 + 14, y = 30; px(x - 6, y + 4, 13, 4, P[4]); for (let i = 0; i < 3; i++) px(x - 6 + i * 6, y, 1, 4, P[4]); }
    else { for (let i = 1; i <= ROUNDS; i++) px(W / 2 - 44 + i * 8, 90, 5, 5, i < round ? P[5] : i === round ? P[2] : P[14]); }
    restartBtn(W / 2, 110);
  }
  fx = fx.filter(p => (p.x += p.vx, p.y += p.vy, p.vy += 0.15, px(p.x, p.y, 2, 2, p.c), --p.t > 0));
  nums = nums.filter(n => { n.t++; drawNum(n.v, n.x, n.y - n.t * 0.5, n.c, n.big); return n.t < 40; });
  g.restore();
}
// 像素數字
const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function drawNum(v, x, y, c, big) {
  const s = String(Math.max(0, Math.round(v))), k = big ? 2 : 1, w = s.length * 4 * k;
  [...s].forEach((d, i) => [...DIG[+d]].forEach((b, j) => { if (b === '1') { px(x - w / 2 + i * 4 * k + (j % 3) * k - k, y + ((j / 3) | 0) * k - k, k + 2, k + 2, P[0]); } }));
  [...s].forEach((d, i) => [...DIG[+d]].forEach((b, j) => { if (b === '1') px(x - w / 2 + i * 4 * k + (j % 3) * k, y + ((j / 3) | 0) * k, k, k, c); }));
}
function playBtn(x, y) { px(x - 12, y - 8, 24, 16, P[6]); px(x - 12, y + 6, 24, 2, P[7]); for (let i = 0; i < 9; i++) px(x - 3, y - 4 + i / 2, i / 1.3 + 1, 9 - i, P[12]); }
function restartBtn(x, y) {
  px(x - 12, y - 8, 24, 16, P[9]); px(x - 12, y + 6, 24, 2, P[8]);
  for (let a = 0.6; a < 5.9; a += 0.25) px(x + Math.cos(a) * 4 - 1, y - 1 + Math.sin(a) * 4, 2, 2, P[12]);
  px(x + 3, y - 5, 3, 3, P[12]);
}
function cardRect(i) {
  const n = choices.length, cw = 78, gap = 8, x0 = W / 2 - (n * cw + (n - 1) * gap) / 2;
  return { x: x0 + i * (cw + gap), y: 22, w: cw, h: 102 };
}
function drawFeed() {
  px(0, 0, W, H, 'rgba(26,28,44,.72)');
  drawRoundDots();
  choices.forEach((k, i) => {
    const r = cardRect(i), sel = pick === i;
    const lift = sel ? -Math.min(6, pickT) : 0, dim = pick >= 0 && !sel;
    g.globalAlpha = dim ? 0.3 : 1;
    px(r.x, r.y + lift, r.w, r.h, P[0]); px(r.x + 1, r.y + 1 + lift, r.w - 2, r.h - 2, sel ? P[14] : P[15]);
    drawFood(k, r.x + r.w / 2 - 8, r.y + 5 + lift, 2);
    const ic = FOOD_ICONS[k]; ic.forEach(([n, c], j) => icon(n, r.x + r.w / 2 - ic.length * 4 + j * 8 + 1, r.y + 24 + lift, c));
    // 預覽：吃下去之後長什麼樣
    const pv = clone(me); feed(pv, k);
    drawBeast(pv, r.x + r.w / 2 - 2, r.y + r.h - 8 + lift, 1, 1.6, t + i * 20);
    px(r.x + 4, r.y + r.h - 7 + lift, 8, 5, P[0]); drawNum(i + 1, r.x + 8, r.y + r.h - 6 + lift, P[13]);
    g.globalAlpha = 1;
  });
}

// ---------- 迴圈 ----------
function update() {
  t++;
  if (mode === 'battle') { const n = fast ? 3 : 1; for (let i = 0; i < n && mode === 'battle'; i++) stepBattle(); }
  if (mode === 'feed' && pick >= 0 && ++pickT > 28) { feed(me, choices[pick]); startBattle(); }
}
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
  render(); requestAnimationFrame(frame);
}

// ---------- 輸入 ----------
function tap(x, y) {
  if (mode === 'title') { offerFood(); return; }
  if (mode === 'battle') { fast = !fast; return; }
  if (mode === 'lose' || mode === 'won') { reset(); offerFood(); return; }
  if (mode === 'feed') choices.forEach((k, i) => { const r = cardRect(i); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) choose(i); });
}
cv.addEventListener('pointerdown', e => {
  const rc = cv.getBoundingClientRect();
  tap((e.clientX - rc.left) / cv._s, (e.clientY - rc.top) / cv._s);
});
addEventListener('keydown', e => {
  if (mode === 'feed' && '123'.includes(e.key)) choose(+e.key - 1);
  else if (e.key === ' ' || e.key === 'Enter') tap(-1, -1);
});

reset();
window.__game = { get mode() { return mode; }, get round() { return round; }, choose, tap, get me() { return me; } };
requestAnimationFrame(frame);
