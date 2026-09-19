// 對手村：左邊是你的村，右邊是電腦的村。你只決定村子把力氣花在哪。
(() => {
  'use strict';
  const W = 280, H = 130;
  const cv = document.getElementById('c'), g = cv.getContext('2d');
  // Sweetie 16 色盤
  const C = { dark: '#1a1c2c', purple: '#5d275d', red: '#b13e53', orange: '#ef7d57', yellow: '#ffcd75',
    lgreen: '#a7f070', green: '#38b764', dgreen: '#257179', navy: '#29366f', blue: '#3b5dc9',
    lblue: '#41a6f6', cyan: '#73eff7', white: '#f4f4f4', lgray: '#94b0c2', gray: '#566c86', dgray: '#333c57',
    wood: '#8b5a2b', skin: '#f4c29a', pants: '#333c57' };
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // 版面縮放：整數倍
  function fit() {
    const s = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
    cv.style.left = Math.floor((innerWidth - W * s) / 2) + 'px';
    cv.style.top = Math.floor((innerHeight - H * s) / 2) + 'px';
  }
  addEventListener('resize', fit); fit();

  // 3x5 數字字型
  const FONT = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
    '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
  function num(n, x, y, c) {
    const s = String(Math.max(0, Math.floor(n)));
    for (let i = 0; i < s.length; i++) {
      const f = FONT[+s[i]];
      for (let k = 0; k < 15; k++) if (f[k] === '1') R(x + i * 4 + (k % 3), y + Math.floor(k / 3), 1, 1, c);
    }
  }

  const FOCUS = ['grow', 'build', 'train'];
  const TYPES = ['wrestle', 'tug', 'brawl']; // 摔角看最強一人、拔河看前五人、群架看全村
  const HAIR = ['#5d275d', '#1a1c2c', '#ef7d57', '#ffcd75', '#566c86'];
  const WIN_N = 4, INTERVAL = 40;

  // 左村座標；右村用鏡像
  const mx = (v, x) => v.side ? W - x : x;

  function makeVillage(side) {
    const v = { side, focus: 'grow', food: 6, wood: 4, houses: 2, wins: 0, people: [], shirt: side ? C.red : C.blue,
      babyT: 0, aiT: 0, flash: 0 };
    for (let i = 0; i < 4; i++) addPerson(v, rnd(30, 80), rnd(50, 90), 1 + Math.random() * 0.5);
    return v;
  }
  function addPerson(v, x, y, str) {
    const p = { v, x: mx(v, x), y, str, task: null, tx: 0, ty: 0, t: 0, carry: null, face: 1, ph: 0,
      hair: pick(HAIR), rep: false, down: false, pop: 0 };
    v.people.push(p); return p;
  }
  const cap = v => v.houses * 3;
  const houseSlot = (v, i) => ({ x: mx(v, 26 + (i % 4) * 16) - (v.side ? 12 : 0), y: 16 + Math.floor(i / 4) * 15 });
  const store = v => ({ x: mx(v, 92), y: 48 });
  const dummy = v => ({ x: mx(v, 70), y: 92 });
  const trees = v => [0, 1, 2, 3].map(i => ({ x: mx(v, 7 + (i % 2) * 7), y: 52 + i * 12 }));
  const field = v => ({ x: mx(v, 30), y: 86 });

  let overT = 0, L, Rv, phase, timer, fight, over, nextType, T = 0, floats = [];
  function reset() {
    L = makeVillage(0); Rv = makeVillage(1);
    phase = 'village'; timer = INTERVAL; fight = null; over = null; nextType = pick(TYPES); floats = [];
  }
  reset();

  // ---- 小人工作 ----
  function chooseTask(p) {
    const v = p.v, f = v.focus;
    const trainP = f === 'train' ? 0.6 : 0.12;
    if (Math.random() < trainP) { const d = dummy(v); return setTask(p, 'train', d.x + rnd(-8, 8), d.y + rnd(-2, 3)); }
    const woodP = f === 'build' ? 0.75 : f === 'grow' ? 0.45 : 0.5;
    if (Math.random() < woodP) { const t = pick(trees(v)); return setTask(p, 'chop', t.x + (v.side ? -4 : 4), t.y + 2); }
    const fl = field(v); return setTask(p, 'farm', fl.x + rnd(-10, 10), fl.y + rnd(-4, 4));
  }
  function setTask(p, task, tx, ty) { p.task = task; p.tx = tx; p.ty = ty; p.t = 0; p.arrived = false; }

  function walkTo(p, dt, sp = 16) {
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    if (d < 1) { p.x = p.tx; p.y = p.ty; return true; }
    const s = Math.min(d, sp * dt); p.x += dx / d * s; p.y += dy / d * s;
    if (Math.abs(dx) > 0.3) p.face = dx > 0 ? 1 : -1; p.ph += dt * 8; return false;
  }

  function updatePerson(p, dt) {
    if (p.pop > 0) p.pop -= dt;
    if (p.rep) return; // 比賽中由比賽控制
    if (!p.task) chooseTask(p);
    const v = p.v;
    if (p.task === 'deliver') {
      if (walkTo(p, dt)) {
        if (p.carry === 'wood') v.wood += 1; else v.food += 1;
        p.carry = null; p.task = null;
      }
      return;
    }
    if (p.task === 'join') { if (walkTo(p, dt, 22)) p.task = null; return; }
    if (!walkTo(p, dt)) return;
    p.t += dt;
    if (p.task === 'train') {
      if (p.t > 3) { p.str += (v.focus === 'train' ? 0.5 : 0.3) / p.str; p.pop = 0.8; p.task = null; } // 越練越難進步
    } else if (p.t > 2.2) {
      p.carry = p.task === 'chop' ? 'wood' : 'food';
      const s = store(v); setTask(p, 'deliver', s.x + rnd(-4, 4), s.y + rnd(2, 6));
    }
  }

  function updateVillage(v, dt) {
    if (v.flash > 0) v.flash -= dt;
    const home = v.people.filter(p => !p.rep);
    // 生人
    v.babyT -= dt;
    const babyCost = v.focus === 'grow' ? 4 : 7;
    if (v.babyT <= 0 && v.people.length < cap(v) && v.food >= babyCost) {
      v.food -= babyCost; v.babyT = v.focus === 'grow' ? 2 : 5;
      const h = houseSlot(v, Math.floor(Math.random() * v.houses));
      const p = addPerson(v, 0, h.y + 12, 1); p.x = h.x + 6; p.pop = 1.2;
      floats.push({ x: p.x, y: p.y - 12, t: 1, kind: 'heart' });
    }
    // 蓋房
    const houseCost = v.focus === 'build' ? 4 : 8;
    if (v.houses < 8 && v.wood >= houseCost) {
      v.wood -= houseCost; v.houses++;
      const h = houseSlot(v, v.houses - 1); floats.push({ x: h.x + 6, y: h.y, t: 1, kind: 'up' });
    }
    // 吃飯：人多會消耗
    v.eatT = (v.eatT || 0) + dt;
    if (v.eatT > 6) { v.eatT = 0; v.food = Math.max(0, v.food - Math.floor(home.length / 4)); }
    for (const p of v.people) updatePerson(p, dt);
  }

  // 電腦：看下一場是什麼，調整方向（帶點隨機）
  function aiThink(v, dt) {
    v.aiT -= dt; if (v.aiT > 0) return; v.aiT = rnd(8, 14);
    if (v.people.length >= cap(v) - 1 && Math.random() < 0.7) { v.focus = 'build'; return; }
    const want = { wrestle: 'train', tug: pick(['train', 'grow']), brawl: 'grow' }[nextType];
    v.focus = Math.random() < 0.6 ? want : pick(FOCUS);
  }

  // ---- 比賽 ----
  function reps(v, type) {
    const s = [...v.people].sort((a, b) => b.str - a.str);
    return type === 'wrestle' ? s.slice(0, 1) : type === 'tug' ? s.slice(0, 5) : s.slice(0, 15);
  }
  const power = (arr, type) => arr.reduce((a, p) => a + (type === 'brawl' ? Math.sqrt(p.str) : p.str), 0); // 群架人多就贏

  function startFight() {
    const type = nextType;
    const a = reps(L, type), b = reps(Rv, type);
    for (const [arr, dir] of [[a, -1], [b, 1]]) arr.forEach((p, i) => {
      p.rep = true; p.carry = null; p.task = null; p.down = false;
      p.slot = i; p.dir = dir;
    });
    fight = { type, a, b, bar: 0, t: 0, walk: 3, pa: power(a, type), pb: power(b, type), winner: 0 };
    phase = 'fight';
  }
  function repSpot(p, bar, type) {
    const cx = 140 + bar * 14;
    if (type === 'wrestle') return { x: cx + p.dir * 4, y: 64 };
    if (type === 'tug') return { x: cx + p.dir * (8 + p.slot * 6), y: 66 };
    const row = p.slot % 3, col = Math.floor(p.slot / 3);
    return { x: 140 + bar * 6 + p.dir * (6 + col * 6 + row * 2), y: 52 + row * 11 };
  }
  function updateFight(dt) {
    const f = fight;
    const all = f.a.concat(f.b);
    if (f.walk > 0) {
      f.walk -= dt;
      for (const p of all) { const s = repSpot(p, 0, f.type); p.tx = s.x; p.ty = s.y; walkTo(p, dt, 30); }
      return;
    }
    if (!f.winner) {
      f.t += dt;
      const diff = (f.pa - f.pb) / (f.pa + f.pb);
      f.bar -= diff * 0.9 * dt;                        // 強的一方把中線往對面推
      f.bar += (Math.random() - 0.5) * 3.2 * dt;       // 拉鋸
      if (Math.abs(f.bar) >= 1 || f.t > 9) f.winner = f.bar < 0 ? 1 : 2; // bar 往右＝左村贏
      if (f.bar === 0 && f.t > 9) f.winner = f.pa >= f.pb ? 1 : 2;
      for (const p of all) {
        const s = repSpot(p, f.bar, f.type); p.x += (s.x - p.x) * Math.min(1, dt * 8); p.y += (s.y - p.y) * Math.min(1, dt * 8);
        p.face = -p.dir; p.ph += dt * 10;
      }
      if (f.type === 'brawl') { // 輸的那邊一個個倒下
        const lose = f.bar < 0 ? f.b : f.a, keep = f.bar < 0 ? f.a : f.b;
        const k = Math.floor(Math.abs(f.bar) * lose.length);
        lose.forEach((p, i) => p.down = i < k); keep.forEach(p => p.down = false);
      }
      if (f.winner) resolve();
    } else {
      f.res -= dt;
      for (const p of (f.winner === 1 ? f.a : f.b)) p.ph += dt * 6;
      if (f.res <= 0) endFight();
    }
  }
  function resolve() {
    const f = fight, win = f.winner === 1 ? L : Rv, lose = f.winner === 1 ? Rv : L;
    f.res = 2.5; win.wins++; lose.flash = 2;
    if (f.type === 'brawl') (f.winner === 1 ? f.b : f.a).forEach(p => p.down = true);
    const food = Math.ceil(lose.food / 2), wood = Math.ceil(lose.wood / 2);
    lose.food -= food; lose.wood -= wood; win.food += food; win.wood += wood;
    // 搶走一個人（輸方最弱的那個代表）
    const loserReps = f.winner === 1 ? f.b : f.a;
    const victim = loserReps[loserReps.length - 1];
    f.victim = victim;
    floats.push({ x: 140, y: 40, t: 2, kind: 'steal' });
  }
  function endFight() {
    const f = fight, win = f.winner === 1 ? L : Rv, lose = f.winner === 1 ? Rv : L;
    for (const p of f.a.concat(f.b)) { p.rep = false; p.down = false; p.task = null; }
    const vic = f.victim;
    if (vic && lose.people.length > 0) {
      lose.people.splice(lose.people.indexOf(vic), 1);
      vic.v = win; win.people.push(vic);
      setTask(vic, 'join', mx(win, rnd(40, 80)), rnd(50, 80));
      if (win.houses * 3 < win.people.length) win.houses = Math.min(8, win.houses + 1);
    }
    fight = null; phase = 'village'; timer = INTERVAL;
    const prev = nextType; nextType = pick(TYPES.filter(t => t !== prev));
    if (L.wins >= WIN_N || Rv.people.length === 0) over = 'win';
    if (!over && (Rv.wins >= WIN_N || L.people.length === 0)) over = 'lose';
    if (over) overT = T;
  }

  // ---- 輸入 ----
  const BTN = FOCUS.map((f, i) => ({ f, x: 8 + i * 34, y: 104, w: 30, h: 24 }));
  function tap(px, py) {
    if (over) { if (T - overT > 1.5) reset(); return; }
    for (const b of BTN) if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) { L.focus = b.f; return; }
  }
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect();
    tap((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
    e.preventDefault();
  });
  addEventListener('keydown', e => {
    const i = '123'.indexOf(e.key); if (i >= 0) L.focus = FOCUS[i];
    if ((e.key === ' ' || e.key === 'Enter') && over && T - overT > 1.5) reset();
  });

  // ---- 繪圖 ----
  function drawPerson(p) {
    const x = Math.round(p.x), y = Math.round(p.y), shirt = p.v.shirt;
    if (p.down) { // 躺平
      R(x - 5, y - 4, 11, 5, C.dark); R(x - 4, y - 3, 3, 3, C.skin); R(x - 1, y - 3, 4, 3, shirt); R(x + 3, y - 3, 2, 3, C.pants);
      R(x - 4, y - 6, 1, 1, C.yellow); R(x - 2, y - 7, 1, 1, C.yellow); return;
    }
    const big = Math.min(3, Math.floor((p.str - 1) / 1.5)); // 越強越壯
    const bw = 5 + big, hx = Math.floor(bw / 2);
    const leg = (p.task && p.task !== 'train' && !p.arrived) || p.rep ? Math.floor(p.ph) % 2 : 0;
    const top = y - 10 - (p.pop > 0 ? Math.round(Math.sin(p.pop * 8)) : 0);
    R(x - hx - 1, top - 1, bw + 2, 11, C.dark);
    R(x - 2, top + 1, 5, 3, C.skin); R(x - 2, top, 5, 1, p.hair);
    const ex = p.face < 0 ? -1 : 0; R(x - 1 + ex, top + 2, 1, 1, C.dark); R(x + 1 + ex, top + 2, 1, 1, C.dark);
    R(x - hx, top + 4, bw, 4, shirt);
    if (big > 0) { R(x - hx - 1, top + 4, 1, 2, C.skin); R(x + bw - hx, top + 4, 1, 2, C.skin); }
    R(x - 2, top + 8, 2, 2 - leg, C.pants); R(x + 1, top + 8, 2, 1 + leg, C.pants);
    if (p.carry === 'wood') { R(x - 4, top - 3, 9, 3, C.dark); R(x - 3, top - 2, 7, 1, C.wood); }
    if (p.carry === 'food') { R(x - 1, top - 4, 3, 3, C.orange); R(x, top - 5, 1, 1, C.green); }
    if (!p.rep && p.task === 'train' && Math.abs(p.x - p.tx) < 1) { const k = Math.floor(T * 5) % 2; R(x + (p.v.side ? -5 : 3) - (k ? 1 : 0), top + 4, 3, 2, C.skin); }
    if (!p.rep && p.task === 'chop' && Math.abs(p.x - p.tx) < 1) { const k = Math.floor(T * 4) % 2; R(x + (p.v.side ? -5 : 4), top + (k ? 1 : 4), 2, 2, C.lgray); }
    if (p.rep && fight && fight.type === 'tug' && !fight.winner) R(x - p.dir * 3, top + 5, 2, 1, C.skin);
  }
  function drawHouse(x, y) {
    R(x - 1, y + 2, 14, 11, C.dark); R(x, y + 6, 12, 6, C.yellow); R(x + 5, y + 8, 3, 4, C.wood);
    R(x - 1, y + 5, 14, 2, C.red); R(x + 1, y + 3, 10, 2, C.red); R(x + 3, y + 1, 6, 2, C.red);
  }
  function drawVillage(v) {
    const x0 = v.side ? 170 : 0;
    R(x0, 12, 110, 90, v.flash > 0 && Math.floor(T * 8) % 2 ? '#6b3a3a' : '#3d7a3a');
    // 田
    const fl = field(v); R(fl.x - 13, fl.y - 6, 26, 12, '#6b4a2b');
    for (let i = 0; i < 4; i++) R(fl.x - 11 + i * 6, fl.y - 4 + (i % 2), 3, 3, C.lgreen);
    for (const t of trees(v)) { R(t.x - 3, t.y - 8, 7, 7, C.dgreen); R(t.x - 2, t.y - 7, 5, 4, C.green); R(t.x, t.y - 1, 1, 3, C.wood); }
    // 木人樁
    const d = dummy(v); R(d.x - 1, d.y - 11, 3, 11, C.wood); R(d.x - 4, d.y - 8, 9, 2, C.wood); R(d.x - 2, d.y - 14, 5, 4, C.yellow);
    // 倉庫：堆疊看得出存量
    const s = store(v); R(s.x - 7, s.y - 4, 15, 8, C.dgray);
    for (let i = 0; i < Math.min(10, v.wood); i++) R(s.x - 6 + (i % 5) * 3, s.y + 2 - Math.floor(i / 5) * 3, 2, 2, C.wood);
    for (let i = 0; i < Math.min(10, v.food); i++) R(s.x - 6 + (i % 5) * 3, s.y - 5 - Math.floor(i / 5) * 3, 2, 2, C.orange);
    for (let i = 0; i < v.houses; i++) { const h = houseSlot(v, i); drawHouse(h.x, h.y); }
  }
  function drawIcon(kind, x, y, c) { // 12x12 左上角
    if (kind === 'grow') { R(x + 2, y + 2, 3, 3, c); R(x + 7, y + 2, 3, 3, c); R(x + 1, y + 4, 10, 3, c); R(x + 3, y + 7, 6, 2, c); R(x + 5, y + 9, 2, 2, c); }
    if (kind === 'build') { R(x + 5, y, 2, 2, c); R(x + 3, y + 2, 6, 2, c); R(x + 1, y + 4, 10, 2, c); R(x + 2, y + 6, 8, 5, c); R(x + 5, y + 8, 2, 3, C.dark); }
    if (kind === 'train' || kind === 'wrestle') { R(x + 2, y + 2, 8, 6, c); R(x + 2, y + 1, 2, 1, c); R(x + 5, y + 1, 2, 1, c); R(x + 8, y + 1, 2, 1, c); R(x + 4, y + 8, 6, 3, c); R(x + 1, y + 4, 1, 3, c); }
    if (kind === 'tug') { R(x, y + 5, 12, 2, C.wood); R(x + 5, y + 3, 2, 6, C.red); R(x, y + 3, 2, 6, c); R(x + 10, y + 3, 2, 6, c); }
    if (kind === 'brawl') { for (let i = 0; i < 3; i++) { R(x + i * 4, y + 3, 3, 3, c); R(x + i * 4, y + 6, 3, 5, c); } }
  }
  function draw() {
    R(0, 0, W, H, C.dark);
    drawVillage(L); drawVillage(Rv);
    // 競技場
    R(110, 12, 60, 90, '#c2a36b'); R(114, 40, 52, 36, '#d8bf86');
    R(139, 42, 2, 32, C.white);
    // 頂部：勝場
    for (const v of [L, Rv]) for (let i = 0; i < WIN_N; i++) {
      const x = v.side ? W - 10 - i * 9 : 4 + i * 9;
      R(x, 2, 7, 7, C.dgray); if (i < v.wins) { R(x + 1, 3, 5, 3, C.yellow); R(x + 3, 6, 1, 2, C.yellow); }
    }
    // 人口／上限
    num(L.people.length, 44, 4, C.white); R(56, 8, 1, 1, C.lgray); R(57, 6, 1, 2, C.lgray); R(58, 4, 1, 2, C.lgray); num(cap(L), 60, 4, C.lgray);
    num(Rv.people.length, 206, 4, C.white); R(218, 8, 1, 1, C.lgray); R(219, 6, 1, 2, C.lgray); R(220, 4, 1, 2, C.lgray); num(cap(Rv), 222, 4, C.lgray);
    // 中間：下一場類型＋倒數
    const ft = fight ? fight.type : nextType;
    drawIcon(ft, 134, 16, phase === 'fight' ? C.yellow : C.white);
    if (phase === 'village') { const w = Math.round(48 * timer / INTERVAL); R(116, 31, 48, 3, C.dgray); R(116, 31, w, 3, timer < 5 && Math.floor(T * 6) % 2 ? C.red : C.yellow); }
    // 拔河的繩子
    if (fight && fight.type === 'tug' && fight.walk <= 0) { const cx = 140 + fight.bar * 14; R(cx - 40, 61, 80, 1, C.wood); R(cx, 58, 1, 6, C.red); }
    if (fight && fight.walk <= 0) { // 雙方力量條
      const tot = fight.pa + fight.pb, wa = Math.round(48 * fight.pa / tot);
      R(116, 88, 48, 4, C.red); R(116, 88, wa, 4, C.blue);
    }
    const all = [...L.people, ...Rv.people].sort((a, b) => a.y - b.y);
    for (const p of all) drawPerson(p);
    // 飄字
    for (const f of floats) {
      const y = Math.round(f.y - (1 - f.t) * 8);
      if (f.kind === 'heart') { R(f.x - 2, y, 2, 2, C.red); R(f.x + 1, y, 2, 2, C.red); R(f.x - 2, y + 1, 5, 2, C.red); R(f.x - 1, y + 3, 3, 1, C.red); }
      if (f.kind === 'up') { R(f.x, y, 1, 5, C.lgreen); R(f.x - 1, y + 1, 3, 1, C.lgreen); }
    }
    if (fight && fight.winner) { // 贏家頭上的皇冠、搶到的東西飛過去
      const k = 1 - fight.res / 2.5, tx = fight.winner === 1 ? 50 : 230, fx = fight.winner === 1 ? 230 : 50;
      const x = fx + (tx - fx) * Math.min(1, k * 1.5), y = 60 - Math.sin(Math.min(1, k * 1.5) * Math.PI) * 30;
      R(x - 3, y - 3, 3, 3, C.orange); R(x + 1, y - 2, 3, 3, C.wood);
      drawIcon('train', fight.winner === 1 ? 118 : 150, 44, fight.winner === 1 ? C.blue : C.red);
    }
    // 底部按鈕
    R(0, 102, W, 28, C.dgray);
    for (const b of BTN) {
      const on = L.focus === b.f;
      R(b.x, b.y, b.w, b.h, on ? C.yellow : C.gray); R(b.x + 1, b.y + 1, b.w - 2, b.h - 2, on ? C.orange : C.dark);
      drawIcon(b.f, b.x + 9, b.y + 6, on ? C.white : C.lgray);
    }
    // 電腦目前的方向（小圖示）
    R(250, 106, 22, 18, C.dark); drawIcon(Rv.focus, 255, 109, C.red);
    // 雙方存量
    R(118, 108, 3, 3, C.orange); num(L.food, 123, 107, C.white); R(118, 116, 3, 3, C.wood); num(L.wood, 123, 115, C.white);
    R(210, 108, 3, 3, C.orange); num(Rv.food, 215, 107, C.white); R(210, 116, 3, 3, C.wood); num(Rv.wood, 215, 115, C.white);
    if (over) {
      g.globalAlpha = 0.7; R(0, 0, W, H, C.dark); g.globalAlpha = 1;
      const win = over === 'win', c = win ? C.yellow : C.gray, fl = win ? C.blue : C.red;
      R(118, 34, 44, 44, C.dark); R(120, 36, 40, 40, fl);
      // 皇冠
      R(126, 52, 28, 14, c); R(126, 44, 4, 8, c); R(138, 42, 4, 10, c); R(150, 44, 4, 8, c);
      R(131, 57, 3, 3, win ? C.red : C.dgray); R(146, 57, 3, 3, win ? C.red : C.dgray);
      num(L.wins, 124, 84, C.blue); R(133, 86, 3, 1, C.white); num(Rv.wins, 140, 84, C.red);
      if (T - overT > 1.5 && Math.floor(T * 2) % 2) { R(137, 96, 2, 6, C.white); R(135, 98, 6, 2, C.white); }
    }
  }

  // ---- 主迴圈 ----
  let last = performance.now();
  function step(dt) {
    T += dt;
    if (over) { for (const f of floats) f.t -= dt; return; }
    for (const f of floats) f.t -= dt; floats = floats.filter(f => f.t > 0);
    aiThink(Rv, dt);
    updateVillage(L, dt); updateVillage(Rv, dt);
    if (phase === 'village') { timer -= dt; if (timer <= 0) startFight(); }
    else updateFight(dt);
  }
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    step(dt); draw(); requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // 測試用：快轉、模擬
  window.__rival = { step, get L() { return L; }, get Rv() { return Rv; }, get over() { return over; }, get next() { return nextType; }, get phase() { return phase; }, reset, draw };
})();
