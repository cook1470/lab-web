// 村裡的狗：只能跑去吠、把對的人引過去
(() => {
  'use strict';
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  const WW = 480, WH = 270;               // 世界大小（像素）
  const ROUND = 150;                      // 一局秒數
  const C = { dark: '#1a1c2c', grass: '#38b764', grass2: '#257179', path: '#c2a878', wood: '#8a5a3b', roof: '#b13e53', wall: '#f4f4f4',
    water: '#41a6f6', white: '#f4f4f4', pants: '#333c57', fire: '#ef7d57', fire2: '#ffcd75', gray: '#94b0c2', red: '#e43b44', sheep: '#f4f4f4' };

  // 低解析畫布，畫完再整數倍放大
  const low = document.createElement('canvas'), g = low.getContext('2d');
  let S = 2, VW = 320, VH = 160;
  function resize() {
    const w = innerWidth, h = innerHeight;
    S = Math.max(2, Math.floor(Math.min(w / 300, h / 150)));
    VW = Math.ceil(w / S); VH = Math.ceil(h / S);
    cv.width = w * devicePixelRatio; cv.height = h * devicePixelRatio;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    low.width = VW; low.height = VH;
  }
  addEventListener('resize', resize); resize();
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // ---- 地圖 ----
  const houses = [{ x: 70, y: 60 }, { x: 170, y: 45 }, { x: 290, y: 55 }, { x: 400, y: 70 }, { x: 110, y: 190 }, { x: 360, y: 200 }];
  const well = { x: 240, y: 140 }, field = { x: 70, y: 110, w: 70, h: 40 }, pen = { x: 380, y: 120, w: 60, h: 40 };
  const spots = [well, { x: 105, y: 130 }, { x: 410, y: 140 }, { x: 240, y: 200 }, ...houses.map(h => ({ x: h.x, y: h.y + 14 }))];

  // ---- 角色 ----
  // 能力：fire 救火、thief 抓賊、fall 扶人、sheep 趕羊
  const KINDS = {
    headband: { hair: '#5d275d', shirt: '#3b5dc9', can: ['fire', 'thief'], h: 15 },
    strawhat: { hair: '#8a5a3b', shirt: '#a7f070', can: ['fire', 'sheep'], h: 14 },
    longhair: { hair: '#29366f', shirt: '#f4f4f4', can: ['fall'], h: 14 },
    elder: { hair: '#c2c3c7', shirt: '#566c86', can: ['fall'], h: 13 },
    child: { hair: '#ffcd75', shirt: '#ef7d57', can: ['sheep'], h: 10 },
  };
  const SKINS = ['#f4c29a', '#d59c6f', '#ffe0c0'];
  let dog, folks, incidents, T, spawnT, saved, lost, state, fx, keys = {}, joy = null, barkT = 0, shake = 0;

  function reset() {
    dog = { x: 240, y: 160, face: 1, moving: false, ph: 0, alert: null, alertT: 0 };
    folks = ['headband', 'headband', 'strawhat', 'strawhat', 'longhair', 'elder', 'child'].map((k, i) => ({
      kind: k, ...KINDS[k], skin: pick(SKINS), home: houses[i % houses.length],
      x: rnd(40, 440), y: rnd(80, 230), tx: 0, ty: 0, wait: rnd(0, 3), face: 1, ph: 0, moving: false,
      mode: 'idle', job: null, lostT: 0, nope: 0, work: 0 }));
    incidents = []; T = 0; spawnT = 3; saved = 0; lost = 0; fx = []; state = 'play';
  }

  // ---- 事件 ----
  function spawnIncident() {
    const busyHouses = incidents.map(i => i.house);
    const types = ['fire', 'thief', 'fall', 'sheep'].filter(t => !incidents.some(i => i.type === t));
    if (!types.length) return;
    const type = pick(types);
    const inc = { type, t: 0, done: false, fixT: 0, seen: false };
    if (type === 'fire') {
      const h = pick(houses.filter(h => !busyHouses.includes(h))); inc.house = h; inc.x = h.x; inc.y = h.y + 8; inc.limit = 40;
    } else if (type === 'thief') {
      const h = pick(houses); inc.house = h; inc.x = h.x + 12; inc.y = h.y + 14; inc.limit = 999;
      inc.vx = inc.x < WW / 2 ? -1 : 1; inc.freeze = 0;
    } else if (type === 'fall') {
      inc.x = rnd(60, 420); inc.y = rnd(90, 240); inc.limit = 45; inc.skin = pick(SKINS);
    } else {
      inc.x = pen.x - 45; inc.y = pen.y + 30; inc.limit = 999; inc.dir = 2.5;
    }
    incidents.push(inc);
  }
  function fail(inc) { inc.done = true; lost++; shake = 0.3; fx.push({ x: inc.x, y: inc.y - 10, t: 0, good: false }); release(inc); }
  function win(inc) { inc.done = true; saved++; fx.push({ x: inc.x, y: inc.y - 10, t: 0, good: true }); release(inc); }
  function release(inc) { folks.forEach(f => { if (f.job === inc) { f.job = null; f.mode = 'idle'; f.wait = 1; } }); if (dog.alert === inc) dog.alert = null; }

  // ---- 吠 ----
  function bark() {
    if (state !== 'play') { if (state === 'end' && T > 1) reset(); else if (state === 'title') state = 'play'; return; }
    if (barkT > 0) return;
    barkT = 0.35;
    fx.push({ x: dog.x + dog.face * 6, y: dog.y - 8, t: 0, bark: true });
    // 對事件吠：記住這件事（狗頭上出現圖示）
    for (const inc of incidents) if (!inc.done && dist(dog, inc) < 34) {
      dog.alert = inc; inc.seen = true;
      if (inc.type === 'thief') inc.freeze = 1.6; // 吠會讓小偷愣住
      return;
    }
    // 對村民吠：帶著「這件事」才會跟
    let near = null, nd = 30;
    for (const f of folks) { const d = dist(dog, f); if (d < nd && f.mode !== 'fixing') { nd = d; near = f; } }
    if (!near) return;
    if (!dog.alert) { near.nope = 1; near.nopeIcon = null; return; }       // 沒事亂吠：他只看你一眼
    if (!near.can.includes(dog.alert.type)) { near.nope = 1.2; near.nopeIcon = dog.alert.type; return; } // 他幫不上
    near.mode = 'follow'; near.job = dog.alert; near.lostT = 0;
  }

  // ---- 輸入 ----
  addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'Enter') { e.preventDefault(); bark(); } });
  addEventListener('keyup', e => { keys[e.code] = false; });
  cv.addEventListener('mousedown', () => { if (state !== 'play') bark(); });
  const barkBtn = () => ({ x: innerWidth - 70, y: innerHeight - 70, r: 46 });
  function touch(e) {
    e.preventDefault();
    let j = null;
    for (const t of e.touches) {
      const b = barkBtn();
      if (t.clientX > innerWidth / 2) { if (e.type === 'touchstart' && [...e.changedTouches].includes(t)) bark(); }
      else {
        if (!joy || joy.id !== t.identifier) j = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        else j = { ...joy, x: t.clientX, y: t.clientY };
      }
    }
    if (e.type === 'touchstart' && state !== 'play' && e.changedTouches[0].clientX <= innerWidth / 2) bark();
    joy = j;
  }
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(n => cv.addEventListener(n, touch, { passive: false }));

  // ---- 更新 ----
  function moveTo(o, tx, ty, sp, dt) {
    const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
    o.moving = d > 1.5;
    if (!o.moving) return true;
    const s = Math.min(d, sp * dt); o.x += dx / d * s; o.y += dy / d * s;
    if (Math.abs(dx) > 0.5) o.face = dx > 0 ? 1 : -1; o.ph += dt * 8;
    return false;
  }
  function update(dt) {
    barkT = Math.max(0, barkT - dt); shake = Math.max(0, shake - dt);
    fx.forEach(f => f.t += dt); fx = fx.filter(f => f.t < (f.bark ? 0.4 : 1.2));
    if (state !== 'play') return;
    T += dt;
    // 狗
    let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    let my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (joy) { const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy); if (d > 8) { mx = dx / Math.max(d, 40); my = dy / Math.max(d, 40); } }
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    dog.moving = ml > 0.1;
    if (dog.moving) { dog.x += mx * 72 * dt; dog.y += my * 72 * dt; if (Math.abs(mx) > 0.1) dog.face = mx > 0 ? 1 : -1; dog.ph += dt * 12; }
    dog.x = Math.max(6, Math.min(WW - 6, dog.x)); dog.y = Math.max(20, Math.min(WH - 4, dog.y));

    // 事件
    spawnT -= dt;
    if (spawnT <= 0 && T < ROUND - 10) { if (incidents.filter(i => !i.done).length < 3) spawnIncident(); spawnT = rnd(9, 15) - Math.min(4, T / 40); }
    for (const inc of incidents) {
      if (inc.done) continue;
      inc.t += dt;
      const helpers = folks.filter(f => f.job === inc && f.mode === 'fixing');
      if (inc.type === 'thief') {
        inc.freeze -= dt;
        if (helpers.length) { win(inc); continue; }
        if (inc.freeze <= 0 && inc.t > 1.5) { inc.x += inc.vx * 11 * dt; inc.y += Math.sin(inc.t) * 4 * dt; }
        if (inc.x < -4 || inc.x > WW + 4) fail(inc);
      } else if (inc.type === 'sheep') {
        if (helpers.length) { win(inc); continue; }
        inc.dir += rnd(-1, 1) * dt; inc.x += Math.cos(inc.dir) * 10 * dt; inc.y += Math.sin(inc.dir) * 6 * dt;
        if (inc.y < 30 || inc.y > WH - 10) inc.dir = -inc.dir;
        if (inc.x < -4 || inc.x > WW + 4 || inc.t > 55) fail(inc);
      } else {
        if (helpers.length) { inc.fixT += dt * helpers.length; if (inc.fixT > (inc.type === 'fire' ? 3 : 1.5)) { win(inc); continue; } }
        else if (inc.t > inc.limit) fail(inc);
      }
    }
    incidents = incidents.filter(i => !i.done);

    // 村民
    for (const f of folks) {
      f.nope = Math.max(0, f.nope - dt);
      if (f.mode === 'follow') {
        const inc = f.job;
        if (!inc || inc.done) { f.mode = 'idle'; f.job = null; continue; }
        if (dist(f, inc) < 45) { f.mode = 'go'; continue; }                  // 看到了，自己衝過去
        const d = dist(f, dog);
        if (d > 16) moveTo(f, dog.x - dog.face * 10, dog.y, 50, dt); else f.moving = false;
        f.lostT = d > 80 ? f.lostT + dt : 0;
        if (f.lostT > 3) { f.mode = 'idle'; f.job = null; f.nope = 1; f.nopeIcon = null; }  // 跟丟就回去忙
      } else if (f.mode === 'go') {
        const inc = f.job;
        if (!inc || inc.done) { f.mode = 'idle'; f.job = null; continue; }
        if (moveTo(f, inc.x + (f.x < inc.x ? -8 : 8), inc.y + 2, 62, dt) || dist(f, inc) < 10) f.mode = 'fixing';
      } else if (f.mode === 'fixing') {
        f.moving = false; f.ph += dt * 6;
        if (!f.job || f.job.done) { f.mode = 'idle'; f.job = null; }
        else if (dist(f, f.job) > 12) f.mode = 'go';
      } else {
        if (f.nope > 0) { f.moving = false; continue; }
        if (f.wait > 0) { f.wait -= dt; f.moving = false; if (f.wait <= 0) { const s = pick(spots); f.tx = s.x + rnd(-15, 15); f.ty = s.y + rnd(-8, 8); } continue; }
        if (moveTo(f, f.tx, f.ty, 20, dt)) f.wait = rnd(2, 6);
      }
    }
    if (T >= ROUND) { state = 'end'; T = 0; }
  }

  // ---- 繪圖 ----
  function drawWorld() {
    R(0, 0, WW, WH, C.grass);
    for (let i = 0; i < 260; i++) { const x = (i * 97) % WW, y = (i * 53 + i * i) % WH; R(x, y, 1, 2, C.grass2); }
    R(0, 128, WW, 10, C.path); R(235, 0, 10, WH, C.path);
    // 田
    R(field.x - 35, field.y - 20, field.w, field.h, '#8a5a3b');
    for (let y = 0; y < field.h; y += 6) R(field.x - 35, field.y - 20 + y, field.w, 2, '#a7f070');
    // 羊圈
    R(pen.x - 30, pen.y - 20, pen.w, 1, C.wood); R(pen.x - 30, pen.y + 20, pen.w, 1, C.wood);
    R(pen.x - 30, pen.y - 20, 1, pen.h, C.wood); R(pen.x + 30, pen.y - 20, 1, pen.h, C.wood);
    for (let i = 0; i < 3; i++) drawSheep(pen.x - 18 + i * 14, pen.y - 4 + (i % 2) * 10, false);
    // 井
    R(well.x - 6, well.y - 6, 12, 9, C.dark); R(well.x - 5, well.y - 5, 10, 7, C.gray); R(well.x - 3, well.y - 4, 6, 3, C.water);
  }
  function drawHouse(h, burning, bt) {
    const x = h.x - 14, y = h.y - 10;
    R(x - 1, y + 6, 30, 17, C.dark); R(x, y + 7, 28, 15, burning ? '#5d275d' : '#d6b88a');
    R(x + 11, y + 13, 6, 9, C.wood);
    for (let i = 0; i < 9; i++) R(x - 2 + i, y + 6 - i, 32 - i * 2, 1, burning && bt > 20 ? '#333c57' : C.roof);
  }
  function drawFire(inc) {
    const k = Math.floor(T * 8), big = Math.min(3, 1 + Math.floor(inc.t / 13));
    for (let i = 0; i < 2 + big * 2; i++) {
      const fx_ = inc.x - 12 + ((i * 7) % 26), hh = 4 + big * 3 + ((k + i) % 3) * 2;
      R(fx_, inc.y - 14 - hh, 3, hh, C.fire); R(fx_ + 1, inc.y - 12 - hh / 2, 1, hh / 2, C.fire2);
    }
    if (inc.fixT > 0 && k % 2) R(inc.x - 6, inc.y - 26, 12, 2, C.water);
  }
  function drawPerson(f, x, y) {
    x = Math.round(x); y = Math.round(y);
    const top = y - f.h, leg = f.moving ? Math.floor(f.ph) % 2 : 0, ex = f.face < 0 ? -1 : 0;
    R(x - 3, top - 1, 7, f.h + 1, C.dark);
    R(x - 2, top + 1, 5, 3, f.skin);
    R(x - 1 + ex, top + 2, 1, 1, C.dark); R(x + 1 + ex, top + 2, 1, 1, C.dark);
    switch (f.kind) {
      case 'strawhat': R(x - 4, top, 9, 1, '#ffcd75'); R(x - 2, top - 1, 5, 1, '#ffcd75'); break;
      case 'child': R(x - 2, top, 5, 1, f.hair); R(x - 3, top + 1, 1, 2, f.hair); R(x + 3, top + 1, 1, 2, f.hair); break;
      case 'elder': R(x - 2, top + 3, 5, 3, f.hair); R(x - 2, top, 1, 2, f.hair); R(x + 2, top, 1, 2, f.hair); break;
      case 'longhair': R(x - 2, top, 5, 1, f.hair); R(x - 3, top, 1, 6, f.hair); R(x + 3, top, 1, 6, f.hair); break;
      case 'headband': R(x - 2, top, 5, 1, f.hair); R(x - 2, top + 1, 5, 1, C.red); R(x + 3, top + 1, 1, 2, C.red); break;
    }
    const bh = f.kind === 'child' ? 3 : 5;
    R(x - 2, top + 4, 5, bh, f.shirt);
    if (f.kind === 'longhair') R(x, top + 5, 1, 3, C.red), R(x - 1, top + 6, 3, 1, C.red); // 大夫的紅十字
    const ly = top + 4 + bh, lh = y - ly;
    if (lh > 0) { R(x - 2, ly, 2, lh - leg, C.pants); R(x + 1, ly, 2, lh - (1 - leg), C.pants); }
    if (f.mode === 'fixing') { const u = Math.floor(f.ph) % 2; R(x + 3, top + 3 + u * 2, 2, 2, f.skin); }
    if (f.nope > 0) { // 搖頭
      const sx = Math.floor(f.nope * 10) % 2 ? -1 : 1;
      R(x - 2 + sx, top + 1, 5, 3, f.skin);
      if (f.nopeIcon) { drawIcon(f.nopeIcon, x - 4, top - 12); R(x - 5, top - 7, 10, 1, C.red); R(x - 5, top - 6, 10, 1, C.red); }
    }
    if (f.mode === 'follow' || f.mode === 'go') { R(x, top - 5, 1, 3, C.fire2); R(x, top - 1, 1, 1, C.fire2); }
  }
  function drawDog(x, y) {
    x = Math.round(x); y = Math.round(y);
    const f = dog.face, leg = dog.moving ? Math.floor(dog.ph) % 2 : 0;
    const B = '#b86f50', D = '#733e39';
    R(x - 6, y - 8, 13, 6, C.dark);
    R(x - 5, y - 7, 11, 4, B);                        // 身體
    R(x + f * 5 - 2, y - 11, 5, 5, C.dark); R(x + f * 5 - 1, y - 10, 4, 4, B);  // 頭
    R(x + f * 5 + (f > 0 ? 2 : -1), y - 8, 1, 1, C.dark);                       // 鼻
    R(x + f * 5, y - 9, 1, 1, C.dark);                                           // 眼
    R(x + f * 5 - (f > 0 ? 1 : -2), y - 12, 2, 2, D);                            // 耳
    const tw = Math.floor(T * 10) % 2;
    R(x - f * 6 - (f > 0 ? 1 : 0), y - 10 + tw, 2, 3, D);                      // 尾巴
    R(x - 4, y - 3, 2, 3 - leg, D); R(x + 3, y - 3, 2, 3 - (1 - leg), D);
    if (barkT > 0) R(x + f * 5 + (f > 0 ? 1 : -2), y - 7, 2, 1, C.red);          // 張嘴
  }
  function drawSheep(x, y, run) {
    x = Math.round(x); y = Math.round(y);
    R(x - 5, y - 6, 10, 6, C.dark); R(x - 4, y - 5, 8, 4, C.sheep); R(x + 3, y - 6, 3, 3, C.dark);
    const l = run ? Math.floor(T * 8) % 2 : 0; R(x - 3, y - 1, 1, 2 - l, C.dark); R(x + 2, y - 1, 1, 1 + l, C.dark);
  }
  // 7×7 圖示
  const ICON = {
    fire: ['...X...', '..XX...', '..XXX..', '.XXOXX.', '.XOOOX.', 'XXOOOXX', '.XXXXX.'],
    thief: ['.XXXXX.', 'XXXXXXX', 'X.X.X.X', 'XXXXXXX', '..XXX..', '.XXXXX.', 'XXXXXXX'],
    fall: ['.......', '.......', 'XX.....', 'XXXXXXX', 'XX.XXXX', '.......', 'O.O.O.O'],
    sheep: ['.......', '.XXXX..', 'XXXXXXO', 'XXXXXXO', 'XXXXXX.', '.X..X..', '.X..X..'],
  };
  const ICOL = { fire: [C.fire, C.fire2], thief: ['#333c57', C.white], fall: [C.gray, C.red], sheep: [C.white, C.dark] };
  function drawIcon(type, x, y, bg = true) {
    x = Math.round(x); y = Math.round(y);
    if (bg) { R(x - 1, y - 1, 9, 9, C.dark); R(x, y, 7, 7, '#333c57'); }
    ICON[type].forEach((row, j) => { for (let i = 0; i < 7; i++) { const ch = row[i]; if (ch !== '.') R(x + i, y + j, 1, 1, ch === 'X' ? ICOL[type][0] : ICOL[type][1]); } });
  }
  function drawIncident(inc) {
    const k = Math.floor(T * 4) % 2;
    if (inc.type === 'thief') {
      const x = Math.round(inc.x), y = Math.round(inc.y), leg = inc.freeze > 0 ? 0 : Math.floor(inc.t * 8) % 2;
      R(x - 3, y - 15, 7, 15, C.dark); R(x - 2, y - 14, 5, 3, '#f4c29a'); R(x - 2, y - 13, 5, 1, C.dark);
      R(x - 2, y - 10, 5, 5, '#333c57'); R(x - 2, y - 5, 2, 5 - leg, C.dark); R(x + 1, y - 5, 2, 4 + leg, C.dark);
      R(x - inc.vx * 6 - 3, y - 12, 5, 6, '#c2a878');                          // 贓物袋
      if (inc.freeze > 0) { R(x, y - 20, 1, 3, C.white); R(x, y - 16, 1, 1, C.white); }
    } else if (inc.type === 'fall') {
      const x = Math.round(inc.x), y = Math.round(inc.y);
      R(x - 7, y - 5, 15, 6, C.dark); R(x - 6, y - 4, 4, 4, inc.skin); R(x - 2, y - 4, 6, 4, '#73eff7'); R(x + 4, y - 3, 4, 2, C.pants);
      if (k) { R(x - 6, y - 8, 1, 2, C.water); R(x + 7, y - 7, 1, 1, C.white); }
    } else if (inc.type === 'sheep') drawSheep(inc.x, inc.y, true);
    else drawFire(inc);
    // 頭上的急迫圖示（時限快到會閃）
    const urgent = inc.type === 'fire' || inc.type === 'fall' ? inc.t / inc.limit : inc.type === 'sheep' ? inc.t / 55 : 0.5;
    if (urgent < 0.75 || k) drawIcon(inc.type, inc.x - 3, inc.y - 36);
    if (inc.type === 'fire' || inc.type === 'fall' || inc.type === 'sheep') {
      const lim = inc.type === 'sheep' ? 55 : inc.limit, w = Math.max(0, Math.round(9 * (1 - inc.t / lim)));
      R(inc.x - 4, inc.y - 26, 9, 2, C.dark); R(inc.x - 4, inc.y - 26, w, 2, urgent > 0.7 ? C.red : C.fire2);
    }
  }
  function draw() {
    const cx = Math.round(Math.max(0, Math.min(WW - VW, dog.x - VW / 2))) + (shake > 0 ? Math.round(rnd(-1, 1)) : 0);
    const cy = Math.round(Math.max(0, Math.min(WH - VH, dog.y - VH / 2)));
    const ox = VW > WW ? Math.floor((VW - WW) / 2) : -cx, oy = VH > WH ? Math.floor((VH - WH) / 2) : -cy;
    R(0, 0, VW, VH, C.dark);
    g.save(); g.translate(ox, oy);
    drawWorld();
    // 依 y 排序畫
    const list = [];
    houses.forEach(h => list.push({ y: h.y + 12, d: () => { const f = incidents.find(i => i.type === 'fire' && i.house === h); drawHouse(h, !!f, f ? f.t : 0); } }));
    incidents.forEach(i => list.push({ y: i.y + (i.type === 'fire' ? 5 : 0), d: () => drawIncident(i) }));
    folks.forEach(f => list.push({ y: f.y, d: () => drawPerson(f, f.x, f.y) }));
    list.push({ y: dog.y, d: () => drawDog(dog.x, dog.y) });
    list.sort((a, b) => a.y - b.y).forEach(o => o.d());
    // 狗記得的事
    if (dog.alert && !dog.alert.done) drawIcon(dog.alert.type, dog.x - 3, dog.y - 24);
    // 特效
    for (const f of fx) {
      if (f.bark) { const r = 3 + f.t * 25; R(f.x + dog.face * r, f.y - r / 2, 1, r, C.white); R(f.x + dog.face * (r + 3), f.y - r / 3, 1, r * 0.7, C.white); }
      else { const y = f.y - f.t * 10; if (f.good) { R(f.x - 2, y, 2, 2, C.red); R(f.x + 1, y, 2, 2, C.red); R(f.x - 2, y + 2, 5, 1, C.red); R(f.x - 1, y + 3, 3, 1, C.red); R(f.x, y + 4, 1, 1, C.red); } else { for (let i = 0; i < 5; i++) { R(f.x - 2 + i, y + i, 1, 1, C.dark); R(f.x + 2 - i, y + i, 1, 1, C.dark); } } }
    }
    g.restore();
    // 畫面外事件：邊緣箭頭
    for (const inc of incidents) {
      const sx = inc.x + ox, sy = inc.y - 10 + oy;
      if (sx >= 0 && sx < VW && sy >= 0 && sy < VH) continue;
      const px = Math.max(6, Math.min(VW - 14, sx - 3)), py = Math.max(14, Math.min(VH - 14, sy - 3));
      if (Math.floor(T * 3) % 2 || !inc.seen) drawIcon(inc.type, px, py);
    }
    // 放大
    const m = S * devicePixelRatio;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(low, 0, 0, VW * m, VH * m);
    // HUD（原生解析度）
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const W = innerWidth, H = innerHeight;
    if (state === 'play') {
      ctx.fillStyle = 'rgba(26,28,44,.6)'; ctx.fillRect(W / 2 - 110, 8, 220, 10);
      ctx.fillStyle = '#ffcd75'; ctx.fillRect(W / 2 - 108, 10, 216 * (1 - T / ROUND), 6);
      ctx.font = 'bold 18px system-ui,sans-serif'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#f4f4f4'; ctx.textAlign = 'left'; ctx.fillText('♥ ' + saved, 14, 6);
      ctx.textAlign = 'right'; ctx.fillStyle = '#94b0c2'; ctx.fillText('✕ ' + lost, W - 14, 6);
    }
    if (joy) { ctx.strokeStyle = 'rgba(244,244,244,.4)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 40, 0, 7); ctx.stroke(); ctx.fillStyle = 'rgba(244,244,244,.4)'; ctx.beginPath(); ctx.arc(joy.x, joy.y, 16, 0, 7); ctx.fill(); }
    if ('ontouchstart' in window && state === 'play') { const b = barkBtn(); ctx.fillStyle = barkT > 0 ? 'rgba(228,59,68,.6)' : 'rgba(244,244,244,.22)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('汪', b.x, b.y); }
    if (state !== 'play') {
      ctx.fillStyle = 'rgba(26,28,44,.72)'; ctx.fillRect(0, H / 2 - 50, W, 100);
      ctx.fillStyle = '#f4f4f4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 26px system-ui,sans-serif';
      if (state === 'title') { ctx.fillText('🐕', W / 2, H / 2 - 18); ctx.font = '16px system-ui,sans-serif'; ctx.fillText(('ontouchstart' in window ? '左邊拖著跑・右邊點一下吠' : 'WASD 跑・空白鍵 吠') + '　（先對著出事的地方吠，再去吠人）', W / 2, H / 2 + 20); }
      else { ctx.fillText('♥ ' + saved + '　　✕ ' + lost, W / 2, H / 2 - 10); ctx.font = '15px system-ui'; ctx.fillText('再一局', W / 2, H / 2 + 26); }
    }
  }

  let last = performance.now();
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt); draw(); requestAnimationFrame(loop); }
  reset(); state = 'title';
  window.__dog = { get dog() { return dog; }, get folks() { return folks; }, get incidents() { return incidents; }, bark, start: () => { state = 'play'; } };
  requestAnimationFrame(loop);
})();
