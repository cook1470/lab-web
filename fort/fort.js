// 會走的堡壘：左邊開車撿東西，右邊看堡壘剖面裡的小人自己過日子
(() => {
  'use strict';
  const cv = document.getElementById('c'), g = cv.getContext('2d');
  // Sweetie 16 色盤
  const C = { dark: '#1a1c2c', plum: '#5d275d', red: '#b13e53', orange: '#ef7d57', yellow: '#ffcd75', lime: '#a7f070', green: '#38b764', teal: '#257179', navy: '#29366f', blue: '#3b5dc9', sky: '#41a6f6', cyan: '#73eff7', white: '#f4f4f4', lgray: '#94b0c2', gray: '#566c86', dgray: '#333c57', wood: '#8a5a3c', dwood: '#5c3a28' };
  let S = 2, LW = 422, LH = 195, PW = 150, MW = 272;
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

  function resize() {
    S = Math.max(1, Math.floor(Math.min(innerWidth / 420, innerHeight / 195)));
    LW = Math.ceil(innerWidth / S); LH = Math.ceil(innerHeight / S);
    cv.width = LW; cv.height = LH; cv.style.width = LW * S + 'px'; cv.style.height = LH * S + 'px';
    PW = 150; MW = LW - PW;
  }
  addEventListener('resize', resize); resize();

  // 3x5 數字字型
  const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
  function num(n, x, y, c) {
    const s = String(n);
    for (let i = 0; i < s.length; i++) { const d = DIG[+s[i]]; if (!d) continue; for (let k = 0; k < 15; k++) if (d[k] === '1') R(x + i * 4 + k % 3, y + ((k / 3) | 0), 1, 1, c); }
    return x + s.length * 4;
  }

  // ---------- 房間種類 ----------
  const TYPES = {
    eng: { cost: { w: 3, s: 0 }, slots: 1, col: C.red },     // 引擎：跑更快
    arm: { cost: { w: 2, s: 1 }, slots: 1, col: C.orange },  // 吊臂：撿更遠
    eye: { cost: { w: 0, s: 2 }, slots: 1, col: C.sky },     // 瞭望：看更遠
    bed: { cost: { w: 2, s: 0 }, slots: 2, col: C.blue },    // 臥室：睡得好
  };
  const ORDER = ['eng', 'arm', 'eye', 'bed'];
  const RW = 36, RH = 20, SHAFT = 8, COLS = 3, MAXROOM = 18;

  // ---------- 狀態 ----------
  const WW = 4200, WH = 520, GOAL = 4020, NEED_FL = 3; // 山壁要三層樓高才爬得上去
  const builtFloors = () => Math.ceil(st.rooms.filter(r => r.built >= 1).length / COLS);
  let st;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const LOOKS = [
    { skin: '#ffcd75', hair: C.dwood, shirt: C.green }, { skin: '#ef7d57', hair: C.dark, shirt: C.blue },
    { skin: '#ffcd75', hair: C.yellow, shirt: C.red }, { skin: '#c28569', hair: C.dark, shirt: C.orange },
    { skin: '#ffcd75', hair: C.lgray, shirt: C.teal }, { skin: '#ef7d57', hair: C.red, shirt: C.plum },
  ];

  function newPerson() {
    return { x: 4, fl: 0, path: [], state: 'idle', room: -1, energy: rnd(60, 100), look: LOOKS[(Math.random() * LOOKS.length) | 0], face: 1, ph: 0, wait: 0, hair: Math.random() < 0.5 };
  }

  function reset() {
    st = {
      t: 0, fx: 60, fy: WH / 2, vx: 0, vy: 0, wood: 0, stone: 0, over: false, overT: 0, face: 1, step: 0,
      rooms: [{ type: 'eng', built: 1 }, { type: 'bed', built: 1 }], people: [], items: [], lakes: [], swamps: [], wand: [], fx_: [], moved: 0,
    };
    for (let i = 0; i < 2; i++) st.people.push(newPerson());
    // 地圖生成
    for (let i = 0; i < 26; i++) st.lakes.push({ x: rnd(250, 3900), y: rnd(20, WH - 20), r: rnd(20, 55) });
    for (let i = 0; i < 18; i++) st.swamps.push({ x: rnd(300, 3900), y: rnd(20, WH - 20), r: rnd(25, 60) });
    const free = (x, y) => !st.lakes.some(l => Math.hypot(l.x - x, l.y - y) < l.r + 6);
    for (let i = 0; i < 40; i++) { // 森林
      const cx = rnd(80, 3950), cy = rnd(15, WH - 15), n = 3 + (Math.random() * 6 | 0);
      for (let k = 0; k < n; k++) { const x = cx + rnd(-22, 22), y = cy + rnd(-18, 18); if (free(x, y) && y > 5 && y < WH - 5) st.items.push({ k: 'w', x, y }); }
    }
    for (let i = 0; i < 70; i++) { // 石堆
      const cx = rnd(150, 3950), cy = rnd(15, WH - 15), n = 2 + (Math.random() * 3 | 0);
      for (let k = 0; k < n; k++) { const x = cx + rnd(-10, 10), y = cy + rnd(-8, 8); if (free(x, y)) st.items.push({ k: 's', x, y }); }
    }
    for (let i = 0; i < 34; i++) { const x = rnd(200, 3900), y = rnd(20, WH - 20); if (free(x, y)) st.wand.push({ x, y, tx: x, ty: y, look: LOOKS[(Math.random() * 6) | 0], ph: 0, join: 0 }); }
  }
  reset();

  // ---------- 堡壘幾何（相對於堡壘原點）----------
  const roomRow = i => (i / COLS) | 0, roomCol = i => i % COLS;
  const roomX = i => SHAFT + roomCol(i) * RW;
  const floorY = r => -r * RH; // 樓板相對 y（原點＝最底層地板）
  function staffed(type) {
    let n = 0;
    st.rooms.forEach((rm, i) => { if (rm.type === type && rm.built >= 1 && st.people.some(p => p.room === i && p.state === 'work' && !p.path.length)) n++; });
    return n;
  }
  const speed = () => 16 + 10 * staffed('eng');
  const reach = () => 10 + 9 * staffed('arm');
  const vision = () => 70 + 40 * staffed('eye');

  function goTo(p, room, lx) {
    const row = room < 0 ? 0 : roomRow(room);
    const tx = room < 0 ? lx : roomX(room) + lx;
    p.path = [];
    if (p.fl !== row) { p.path.push({ x: 3, fl: p.fl }); p.path.push({ x: 3, fl: row, climb: 1 }); }
    p.path.push({ x: tx, fl: row });
  }
  function occupants(i) { return st.people.filter(p => p.room === i).length; }

  // 小人大腦：累了去睡，有工地先蓋，有空房去顧，不然就晃
  function think(p) {
    if (p.energy < 25) {
      let bi = st.rooms.findIndex((rm, i) => rm.type === 'bed' && rm.built >= 1 && occupants(i) < 2);
      p.state = 'sleep';
      if (bi >= 0) { p.room = bi; goTo(p, bi, 8 + occupants(bi) * 12); p.bed = 1; }
      else { p.room = -1; goTo(p, -1, 4 + Math.random() * 3); p.bed = 0; }
      return;
    }
    const opts = [];
    st.rooms.forEach((rm, i) => {
      if (occupants(i) > 0) return;
      if (rm.built < 1) opts.push([i, 0]);
      else if (rm.type !== 'bed') opts.push([i, 1]);
    });
    if (opts.length) {
      opts.sort((a, b) => a[1] - b[1] || Math.abs(roomRow(a[0]) - p.fl) - Math.abs(roomRow(b[0]) - p.fl));
      const i = opts[0][0]; p.room = i; p.state = 'work'; goTo(p, i, 18); return;
    }
    // 沒事做：隨便找間房晃晃、坐著
    const i = (Math.random() * st.rooms.length) | 0;
    p.room = -2; p.state = 'idle'; p.wait = rnd(2, 5); goTo(p, i, rnd(6, 30)); p.idleRoom = i;
  }

  function updatePeople(dt) {
    const moving = st.moved > 0.1;
    for (const p of st.people) {
      p.ph += dt;
      if (p.path.length) {
        const w = p.path[0];
        const wy = w.fl, sp = 22;
        if (p.fl !== wy) { const d = Math.sign(wy - p.fl); p.fl += d * dt * 1.2; if ((d > 0 && p.fl >= wy) || (d < 0 && p.fl <= wy)) p.fl = wy; p.climbing = 1; }
        else {
          p.climbing = 0;
          const dx = w.x - p.x; if (Math.abs(dx) < 1) { p.x = w.x; p.path.shift(); } else { p.face = Math.sign(dx); p.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt); }
        }
        continue;
      }
      p.climbing = 0;
      if (p.state === 'sleep') {
        p.energy += (p.bed ? 12 : 4) * dt;
        if (p.energy >= 100) { p.energy = 100; think(p); }
      } else if (p.state === 'work') {
        const rm = st.rooms[p.room];
        if (!rm) { think(p); continue; }
        p.energy -= (rm.type === 'eng' && moving ? 4 : 2.5) * dt;
        if (rm.built < 1) { rm.built += dt / 5; if (rm.built >= 1) { rm.built = 1; puff(p); } }
        if (p.energy < 25) think(p);
        else if (rm.built >= 1 && rm.type !== 'bed' && Math.random() < dt * 0.02) think(p); // 偶爾換手
        // 有空工地就去蓋
        else if (rm.built >= 1 && st.rooms.some((r2, i) => r2.built < 1 && occupants(i) === 0) && Math.random() < dt * 0.5) think(p);
      } else {
        p.energy -= 0.8 * dt; p.wait -= dt;
        if (p.wait <= 0) think(p);
      }
    }
  }
  function puff() { st.fx_.push({ kind: 'built', t: 0 }); }

  // ---------- 輸入 ----------
  const keys = {};
  addEventListener('keydown', e => {
    keys[e.code] = 1;
    const k = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (k >= 0) build(ORDER[k]);
    if (st.over && (e.code === 'Space' || e.code === 'Enter')) reset();
  });
  addEventListener('keyup', e => { keys[e.code] = 0; });
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const lpos = e => [e.clientX / S, e.clientY / S];
  cv.addEventListener('pointerdown', e => {
    const [x, y] = lpos(e);
    if (st.over) { if (st.overT > 1) reset(); return; }
    if (x >= MW) { panelTap(x, y); return; }
    if (stick.id === null) { stick.id = e.pointerId; stick.ox = x; stick.oy = y; stick.x = x; stick.y = y; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener('pointermove', e => { if (e.pointerId === stick.id) { [stick.x, stick.y] = lpos(e); } });
  const up = e => { if (e.pointerId === stick.id) stick.id = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  // 面板按鈕位置
  const btnRect = i => ({ x: MW + 4 + i * 36, y: 14, w: 33, h: 20 });
  function panelTap(x, y) {
    for (let i = 0; i < 4; i++) { const b = btnRect(i); if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) build(ORDER[i]); }
  }
  function canBuild(t) { const c = TYPES[t].cost; return st.wood >= c.w && st.stone >= c.s && st.rooms.length < MAXROOM; }
  function build(t) {
    if (st.over || !canBuild(t)) { st.fx_.push({ kind: 'no', b: ORDER.indexOf(t), t: 0 }); return; }
    const c = TYPES[t].cost; st.wood -= c.w; st.stone -= c.s;
    st.rooms.push({ type: t, built: 0 });
    st.fx_.push({ kind: 'yes', b: ORDER.indexOf(t), t: 0 });
  }

  // ---------- 更新 ----------
  function inLake(x, y, pad) { return st.lakes.some(l => Math.hypot(l.x - x, l.y - y) < l.r + pad); }
  function update(dt) {
    st.t += dt;
    st.fx_.forEach(f => f.t += dt); st.fx_ = st.fx_.filter(f => f.t < 1.2);
    if (st.over) { st.overT += dt; updatePeople(dt); return; }
    let ix = 0, iy = 0;
    if (keys.KeyA || keys.ArrowLeft) ix--; if (keys.KeyD || keys.ArrowRight) ix++;
    if (keys.KeyW || keys.ArrowUp) iy--; if (keys.KeyS || keys.ArrowDown) iy++;
    if (stick.id !== null) { const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy); if (d > 3) { ix = dx / Math.max(d, 20); iy = dy / Math.max(d, 20); } }
    const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
    const size = fortMapSize();
    let sp = speed(); if (st.swamps.some(s => Math.hypot(s.x - st.fx, s.y - st.fy) < s.r)) sp *= 0.5;
    const nx = st.fx + ix * sp * dt, ny = st.fy + iy * sp * dt;
    const ox = st.fx, oy = st.fy;
    if (!inLake(nx, st.fy, size / 2)) st.fx = Math.max(10, Math.min(WW - 10, nx));
    if (!inLake(st.fx, ny, size / 2)) st.fy = Math.max(10, Math.min(WH - 10, ny));
    st.moved = Math.hypot(st.fx - ox, st.fy - oy) / Math.max(dt, 1e-3);
    if (Math.abs(ix) > 0.1) st.face = Math.sign(ix);
    st.step += st.moved * dt * 0.25;
    // 撿東西
    const rr = reach() + size / 2;
    for (const it of st.items) {
      if (it.fly !== undefined) { it.fly += dt * 3; continue; }
      if (Math.hypot(it.x - st.fx, it.y - st.fy) < rr) it.fly = 0;
    }
    st.items = st.items.filter(it => {
      if (it.fly !== undefined && it.fly >= 1) { if (it.k === 'w') st.wood++; else st.stone++; st.fx_.push({ kind: 'got', k: it.k, t: 0 }); return false; }
      return true;
    });
    // 流浪的人
    for (const w of st.wand) {
      w.ph += dt;
      const d = Math.hypot(w.x - st.fx, w.y - st.fy);
      if (d < rr + 14) { w.join = 1; }
      if (w.join) { const k = Math.min(1, dt * 3); w.x += (st.fx - w.x) * k; w.y += (st.fy - w.y) * k; if (d < 4) w.done = 1; }
      else {
        if (Math.hypot(w.tx - w.x, w.ty - w.y) < 2) { w.tx = w.x + rnd(-30, 30); w.ty = Math.max(10, Math.min(WH - 10, w.y + rnd(-30, 30))); }
        const a = Math.atan2(w.ty - w.y, w.tx - w.x), nx2 = w.x + Math.cos(a) * 6 * dt, ny2 = w.y + Math.sin(a) * 6 * dt;
        if (inLake(nx2, ny2, 3)) { w.tx = w.x; w.ty = w.y; } else { w.x = nx2; w.y = ny2; }
      }
    }
    st.wand = st.wand.filter(w => { if (w.done) { const p = newPerson(); p.look = w.look; p.x = RW * 1.5; st.people.push(p); st.fx_.push({ kind: 'join', t: 0 }); return false; } return true; });
    updatePeople(dt);
    // 山壁：堡壘不夠高就被擋住
    if (builtFloors() < NEED_FL && st.fx > GOAL - 20) { st.fx = GOAL - 20; st.bump = (st.bump || 0) + dt; } else st.bump = 0;
    if (st.fx >= GOAL) { st.over = true; st.overT = 0; }
  }
  const fortMapSize = () => 8 + Math.min(st.rooms.length, MAXROOM);

  // ---------- 繪圖：地圖 ----------
  function drawMap() {
    const vis = vision();
    const cx = Math.round(Math.max(MW / 2, Math.min(WW - MW / 2, st.fx)) - MW / 2);
    const cy = Math.round(Math.max(LH / 2, Math.min(WH - LH / 2, st.fy)) - LH / 2);
    g.save(); g.beginPath(); g.rect(0, 0, MW, LH); g.clip();
    R(0, 0, MW, LH, '#2f7a4a');
    // 草地斑點
    for (let gx = Math.floor(cx / 16) * 16; gx < cx + MW; gx += 16) for (let gy = Math.floor(cy / 16) * 16; gy < cy + LH; gy += 16) {
      const h = (gx * 73856093 ^ gy * 19349663) >>> 0;
      if (h % 5 === 0) R(gx - cx + h % 13, gy - cy + (h >> 4) % 13, 2, 1, C.green);
      if (h % 11 === 0) R(gx - cx + (h >> 3) % 13, gy - cy + (h >> 6) % 13, 1, 1, C.lime);
    }
    // 邊界外
    if (cy < 0) R(0, 0, MW, -cy, C.dgray); if (cy + LH > WH) R(0, WH - cy, MW, LH, C.dgray);
    for (const s of st.swamps) blob(s.x - cx, s.y - cy, s.r, '#4a5a2a', '#5d6b30');
    for (const l of st.lakes) blob(l.x - cx, l.y - cy, l.r, C.navy, C.blue);
    // 終點的山
    const mx = GOAL - cx;
    if (mx < MW + 60) {
      R(mx, 0, WW, LH, '#6b5a4a');
      for (let y = -((cy % 40) + 40); y < LH + 40; y += 40) { tri(mx + 10, y + 36, 30, C.gray); tri(mx + 34, y + 20, 22, C.lgray); R(mx + 30, y + 2, 8, 3, C.white); }
      for (let k = 0; k < NEED_FL; k++) { const ok = k < builtFloors(); R(mx - 12, st.fy - cy - 8 - k * 7, 8, 5, C.dark); R(mx - 11, st.fy - cy - 7 - k * 7, 6, 3, ok ? C.lime : (st.bump && Math.floor(st.t * 6) % 2 ? C.red : C.gray)); }
      R(mx + 4, st.fy - cy - 14, 1, 14, C.dark); R(mx + 5, st.fy - cy - 14, 6, 4, C.red);
    }
    // 物件
    const sorted = [...st.items].sort((a, b) => a.y - b.y);
    for (const it of sorted) {
      let x = it.x - cx, y = it.y - cy;
      if (it.fly !== undefined) { const k = it.fly; x = x + (st.fx - it.x) * k; y = y + (st.fy - it.y) * k - Math.sin(k * Math.PI) * 10; }
      if (x < -10 || x > MW + 10 || y < -10 || y > LH + 10) continue;
      if (it.k === 'w') { R(x - 1, y - 1, 3, 3, C.dwood); R(x - 4, y - 9, 9, 8, C.dark); R(x - 3, y - 8, 7, 6, C.green); R(x - 2, y - 7, 3, 2, C.lime); }
      else { R(x - 4, y - 4, 8, 5, C.dark); R(x - 3, y - 3, 6, 3, C.lgray); R(x - 2, y - 3, 2, 1, C.white); }
    }
    for (const w of st.wand) { const x = w.x - cx, y = w.y - cy; if (x > -10 && x < MW + 10) tinyPerson(x, y, w.look, w.join ? 1 : Math.floor(w.ph * 3) % 2, w.join); }
    // 堡壘（俯視）
    const fx = st.fx - cx, fy = st.fy - cy, sz = fortMapSize(), hs = sz / 2;
    const rr = reach() + hs;
    g.strokeStyle = 'rgba(255,205,117,.35)'; g.beginPath(); g.arc(Math.round(fx) + .5, Math.round(fy) + .5, rr, 0, 7); g.stroke();
    R(fx - hs + 1, fy + hs - 1, sz, 3, 'rgba(0,0,0,.35)');
    const legs = Math.floor(st.step) % 2;
    for (let k = 0; k < 3; k++) { const lx = fx - hs + 1 + k * (sz - 3) / 2; R(lx, fy + hs - 2 + ((k + legs) % 2 ? -2 : 0), 2, 4, C.dark); }
    const bob = st.moved > 1 ? legs : 0;
    R(fx - hs - 1, fy - hs - 1 - bob, sz + 2, sz + 2, C.dark);
    R(fx - hs, fy - hs - bob, sz, sz, C.wood);
    R(fx - hs, fy - hs - bob, sz, 2, C.orange);
    for (let i = 0; i < Math.min(st.rooms.length, 9); i++) R(fx - hs + 2 + (i % 3) * 3, fy - hs + 3 + ((i / 3) | 0) * 3 - bob, 2, 2, TYPES[st.rooms[i].type].col);
    // 視野霧
    fog(fx, fy, vis);
    // 進度條
    R(4, 4, MW - 8, 3, C.dark); R(5, 5, (MW - 10) * Math.min(1, st.fx / GOAL), 1, C.yellow);
    tri(MW - 6, 9, 5, C.lgray); R(4 + (MW - 10) * Math.min(1, st.fx / GOAL), 3, 3, 5, C.white);
    // 搖桿
    if (stick.id !== null) {
      g.strokeStyle = 'rgba(244,244,244,.5)'; g.beginPath(); g.arc(stick.ox, stick.oy, 20, 0, 7); g.stroke();
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy), k = d > 20 ? 20 / d : 1;
      R(stick.ox + dx * k - 4, stick.oy + dy * k - 4, 8, 8, 'rgba(244,244,244,.6)');
    }
    g.restore();
  }
  function blob(x, y, r, c1, c2) {
    if (x < -r || x > MW + r) return;
    g.fillStyle = c1; g.beginPath(); for (let a = 0; a < 6.28; a += 0.5) { const rr = r * (0.85 + 0.15 * Math.sin(a * 3 + r)); g.lineTo(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.8)); } g.fill();
    R(x - r * 0.4, y - r * 0.3, r * 0.3 | 0, 1, c2); R(x + r * 0.1, y + r * 0.2, r * 0.25 | 0, 1, c2);
  }
  function tri(x, y, h, c) { for (let i = 0; i < h; i++) R(x - i, y - h + i, i * 2 + 1, 1, c); }
  function fog(fx, fy, vis) {
    // 以 6px 格子壓暗視野外
    for (let x = 0; x < MW; x += 6) for (let y = 0; y < LH; y += 6) {
      const d = Math.hypot(x + 3 - fx, (y + 3 - fy) * 1.2);
      if (d > vis) R(x, y, 6, 6, d > vis + 24 ? 'rgba(26,28,44,.82)' : 'rgba(26,28,44,.45)');
    }
  }
  function tinyPerson(x, y, L, leg, happy) {
    R(x - 2, y - 8, 5, 9, C.dark); R(x - 1, y - 7, 3, 2, L.skin); R(x - 1, y - 5, 3, 3, L.shirt);
    R(x - 1, y - 2, 1, 2 - leg, C.navy); R(x + 1, y - 2, 1, 1 + leg, C.navy);
    if (happy) R(x, y - 12, 1, 2, C.yellow); else if (Math.floor(st.t * 1.5) % 4 === 0) R(x - 1, y - 12, 3, 2, C.white);
  }

  // ---------- 繪圖：剖面 ----------
  function drawPanel() {
    g.save(); g.beginPath(); g.rect(MW, 0, PW, LH); g.clip();
    R(MW, 0, PW, LH, '#8fc8e8');
    // 天空漸層與遠山（跟著移動捲動）
    R(MW, 0, PW, 12, '#73b8e0');
    const par = (st.fx * 0.3) % 60;
    for (let i = -1; i < 4; i++) tri(MW + i * 60 - par + 30, LH - 10, 26, '#6aa0b8');
    R(MW, LH - 12, PW, 12, C.green); R(MW, LH - 12, PW, 1, C.lime);
    for (let i = 0; i < 8; i++) { const gx = MW + ((i * 23 - st.fx * 1.2) % PW + PW) % PW; R(gx, LH - 9 + (i % 3) * 3, 3, 1, '#2f7a4a'); }
    // 資源
    R(MW, 0, PW, 12, 'rgba(26,28,44,.55)');
    R(MW + 4, 3, 7, 3, C.wood); R(MW + 4, 6, 7, 3, C.dwood); num(st.wood, MW + 14, 3, C.white);
    R(MW + 34, 3, 7, 6, C.lgray); R(MW + 35, 3, 3, 2, C.white); num(st.stone, MW + 44, 3, C.white);
    tinyPerson(MW + 70, 10, LOOKS[0], 0, 0); num(st.people.length, MW + 75, 3, C.white);
    // 時間
    const tt = Math.floor(st.t); num(Math.floor(tt / 60), MW + 110, 3, C.yellow); R(MW + 115, 4, 1, 1, C.yellow); R(MW + 115, 6, 1, 1, C.yellow); num(String(tt % 60).padStart(2, '0'), MW + 117, 3, C.yellow);
    // 建造按鈕
    for (let i = 0; i < 4; i++) {
      const b = btnRect(i), t = ORDER[i], ok = canBuild(t);
      let sh = 0; const f = st.fx_.find(e => (e.kind === 'no' || e.kind === 'yes') && e.b === i);
      if (f && f.kind === 'no') sh = Math.round(Math.sin(f.t * 40) * 2 * (1 - f.t));
      R(b.x + sh, b.y, b.w, b.h, C.dark);
      R(b.x + 1 + sh, b.y + 1, b.w - 2, b.h - 2, ok ? (f && f.kind === 'yes' ? C.yellow : C.dgray) : '#252838');
      g.globalAlpha = ok ? 1 : 0.4;
      roomIcon(t, b.x + 3 + sh, b.y + 3);
      const c = TYPES[t].cost; let dx = b.x + 18 + sh;
      for (let k = 0; k < c.w; k++) R(dx, b.y + 3 + k * 4, 5, 3, C.wood);
      for (let k = 0; k < c.s; k++) R(dx + 7, b.y + 3 + k * 4, 5, 3, C.lgray);
      g.globalAlpha = 1;
      if (ok && Math.floor(st.t * 2) % 2) R(b.x + 1 + sh, b.y + b.h - 2, b.w - 2, 1, C.yellow);
    }
    // 堡壘
    const n = Math.min(st.rooms.length, MAXROOM), rows = Math.ceil(n / COLS);
    const fw = SHAFT + COLS * RW, ox = MW + ((PW - fw) / 2 | 0), legs = Math.floor(st.step) % 2;
    const bob = st.moved > 1 ? legs : 0;
    const oy = LH - 16 - bob; // 底層地板
    // 腳
    for (let k = 0; k < 4; k++) {
      const lx = ox + 6 + k * (fw - 16) / 3, lift = st.moved > 1 && (k + legs) % 2 ? 2 : 0;
      R(lx, oy, 5, LH - 12 - oy - lift + bob, C.dark); R(lx + 1, oy, 3, LH - 13 - oy - lift + bob, C.gray);
      R(lx - 2, LH - 14 - lift + bob, 9, 3, C.dark);
    }
    // 外殼
    const top = oy + floorY(rows) - 2;
    R(ox - 3, top - 6, fw + 6, oy - top + 10, C.dark);
    // 屋頂
    for (let i = 0; i < 6; i++) R(ox - 3 + i, top - 6 - i, fw + 6 - i * 2, 1, i % 2 ? C.red : '#8f2d42');
    // 煙囪（引擎有人顧時冒煙）
    const e = staffed('eng');
    R(ox + fw - 16, top - 16, 6, 10, C.dark); R(ox + fw - 15, top - 15, 4, 9, C.gray);
    if (e) for (let k = 0; k < 3; k++) { const ph = (st.t * (0.6 + st.moved / 40) + k / 3) % 1; R(ox + fw - 15 + Math.sin(ph * 6) * 2 - ph * 10 * st.face, top - 18 - ph * 20, 3 + ph * 3 | 0, 3 + ph * 3 | 0, `rgba(244,244,244,${0.7 - ph * 0.6})`); }
    // 梯井
    R(ox, top, SHAFT, oy - top, C.dwood);
    for (let y = oy - 2; y > top; y -= 4) R(ox + 1, y, 6, 1, C.wood);
    R(ox + 1, top, 1, oy - top, C.wood); R(ox + 6, top, 1, oy - top, C.wood);
    // 房間
    for (let i = 0; i < n; i++) drawRoom(i, ox + roomX(i), oy + floorY(roomRow(i)));
    // 吊臂伸出去
    const a = staffed('arm');
    if (a) { const ax = ox + fw + 2, ay = top + 4, L = 6 + a * 5, sw = Math.sin(st.t * 2) * 3; R(ax, ay, L, 2, C.orange); R(ax + L - 1, ay, 1, 8 + sw, C.dark); R(ax + L - 3, ay + 8 + sw, 5, 2, C.lgray); }
    // 瞭望旗
    const v = staffed('eye');
    if (v) { R(ox + 10, top - 20, 1, 14, C.dark); const w = Math.floor(st.t * 4) % 2; R(ox + 11, top - 20, 6 + w, 4, C.sky); }
    // 山的高度線：蓋到這裡才爬得上山
    { const ly = oy + floorY(NEED_FL) - 1, ok = builtFloors() >= NEED_FL; for (let x = MW + 2; x < MW + PW - 2; x += 6) R(x, ly, 3, 1, ok ? C.lime : C.yellow); tri(MW + PW - 6, ly + 1, 5, ok ? C.lime : C.gray); }
    // 小人
    for (const p of st.people) drawPerson(p, ox, oy);
    // 事件特效
    for (const f of st.fx_) {
      if (f.kind === 'join') { R(ox + 20, oy - 14 - f.t * 12, 3, 3, C.yellow); R(ox + 24, oy - 18 - f.t * 12, 2, 2, C.yellow); }
      if (f.kind === 'got') { const c = f.k === 'w' ? C.wood : C.lgray; R(ox + fw / 2 + (f.t * 30 % 10), top - 4 - f.t * 14, 3, 3, c); }
      if (f.kind === 'built') for (let k = 0; k < 6; k++) R(ox + fw / 2 + Math.cos(k) * f.t * 30, oy - 40 + Math.sin(k) * f.t * 20, 2, 2, C.white);
    }
    R(MW, 0, 1, LH, C.dark);
    g.restore();
  }

  function roomIcon(t, x, y) {
    if (t === 'eng') { R(x + 2, y, 8, 12, C.dark); R(x, y + 2, 12, 8, C.dark); R(x + 3, y + 3, 6, 6, C.red); R(x + 5, y + 5, 2, 2, C.dark); }
    if (t === 'arm') { R(x, y + 1, 12, 2, C.orange); R(x + 10, y + 3, 1, 5, C.dark); R(x + 8, y + 8, 5, 3, C.lgray); R(x, y + 1, 2, 11, C.dwood); }
    if (t === 'eye') { R(x, y + 3, 12, 6, C.white); R(x + 4, y + 3, 5, 6, C.sky); R(x + 5, y + 5, 3, 2, C.dark); }
    if (t === 'bed') { R(x, y + 6, 12, 4, C.blue); R(x, y + 4, 4, 3, C.white); R(x, y + 2, 1, 9, C.dwood); R(x + 11, y + 5, 1, 6, C.dwood); }
  }

  function drawRoom(i, x, fy) {
    const rm = st.rooms[i], y = fy - RH;
    R(x, y, RW, RH, rm.built < 1 ? '#3b3f52' : '#6e4a36');
    R(x, y, RW, 1, C.dark); R(x + RW - 1, y, 1, RH, C.dark);
    R(x, fy - 2, RW, 2, C.dwood);
    if (rm.built < 1) {
      // 工地：鷹架＋進度
      R(x + 4, y + 4, 1, RH - 6, C.wood); R(x + RW - 6, y + 4, 1, RH - 6, C.wood);
      for (let k = 0; k < 3; k++) R(x + 4, y + 6 + k * 6, RW - 9, 1, C.wood);
      R(x + 3, y + 2, RW - 6, 2, C.dark); R(x + 3, y + 2, (RW - 6) * rm.built, 2, C.yellow);
      return;
    }
    // 牆壁木紋
    R(x + 2, y + 8, RW - 4, 1, C.wood); R(x + 2, y + 15, RW - 4, 1, C.wood);
    const on = st.people.some(p => p.room === i && p.state === 'work' && !p.path.length);
    if (rm.type === 'eng') {
      const sp = on ? (1 + st.moved / 8) : 0, a = st.t * sp * 3;
      const cx = x + 10, cy = fy - 10;
      R(cx - 6, cy - 6, 13, 13, C.dark); R(cx - 5, cy - 5, 11, 11, on ? C.red : '#6b2a3a');
      for (let k = 0; k < 4; k++) { const aa = a + k * Math.PI / 2; R(cx + Math.cos(aa) * 4 - 1, cy + Math.sin(aa) * 4 - 1, 3, 3, C.dark); }
      R(cx - 1, cy - 1, 3, 3, C.yellow);
      if (on) R(x + RW - 6, y + 3, 3, 3, Math.floor(st.t * 4) % 2 ? C.orange : C.yellow);
    } else if (rm.type === 'arm') {
      const a = on ? st.t * 3 : 0;
      R(x + 8, fy - 12, 3, 10, C.dwood); R(x + 5, fy - 14, 9, 4, C.dark);
      R(x + 9 + Math.cos(a) * 4, fy - 12 + Math.sin(a) * 2, 2, 2, C.orange);
      R(x + RW - 3, y + 4, 3, 3, C.orange); // 伸出牆的滑輪
    } else if (rm.type === 'eye') {
      R(x + 20, y + 3, 12, 9, C.dark); R(x + 21, y + 4, 10, 7, C.sky); R(x + 21, y + 8, 10, 3, C.green);
      if (on) R(x + 24, y + 6, 6, 2, C.lgray);
    } else if (rm.type === 'bed') {
      for (let k = 0; k < 2; k++) { const bx = x + 3 + k * 16; R(bx, fy - 7, 14, 5, C.dark); R(bx + 1, fy - 6, 12, 3, C.blue); R(bx + 1, fy - 7, 4, 2, C.white); }
    }
  }

  function drawPerson(p, ox, oy) {
    const L = p.look;
    const x = Math.round(ox + p.x), y = Math.round(oy + floorY(p.fl) - 2);
    if (p.state === 'sleep' && !p.path.length) {
      // 躺著
      const ly = p.bed ? y - 5 : y;
      R(x - 1, ly - 4, 10, 4, C.dark); R(x, ly - 3, 3, 2, L.skin); R(x + 3, ly - 3, 5, 2, p.bed ? C.lgray : L.shirt);
      const k = (st.t * 0.8 + p.x) % 2;
      if (k < 1.2) R(x + 1 + k * 3, ly - 8 - k * 4, 2, 2, C.white);
      return;
    }
    const walking = p.path.length && !p.climbing;
    const leg = walking ? Math.floor(p.ph * 8) % 2 : 0;
    const top = y - 9;
    R(x - 3, top - 1, 7, 10, C.dark);
    R(x - 2, top, 5, 3, L.skin);
    R(x - 2, top - 1, 5, 1, L.hair);
    const ex = p.face < 0 ? -1 : 0;
    R(x - 1 + ex, top + 1, 1, 1, C.dark); R(x + 1 + ex, top + 1, 1, 1, C.dark);
    R(x - 2, top + 3, 5, 4, L.shirt);
    R(x - 2, top + 7, 2, 2 - leg, C.navy); R(x + 1, top + 7, 2, 1 + leg, C.navy);
    if (p.climbing) { const k = Math.floor(p.ph * 6) % 2; R(x - 3, top + 1 + k, 1, 3, L.skin); R(x + 3, top + 2 - k, 1, 3, L.skin); }
    if (!p.path.length && p.state === 'work') {
      const rm = st.rooms[p.room]; if (!rm) return;
      const k = Math.floor(p.ph * (rm.type === 'eng' ? 4 + st.moved / 4 : 3)) % 2;
      if (rm.built < 1) { R(x + 3, top + (k ? 1 : 4), 1, 4, C.wood); R(x + 3, top + (k ? 0 : 7), 3, 2, C.lgray); }
      else if (rm.type === 'eng') { R(x - 4, top + 3 + k, 2, 2, L.skin); R(x - 2, top + 7, 2, 2 - k, C.navy); }
      else if (rm.type === 'arm') R(x - 4, top + 3 + k * 2, 2, 1, L.skin);
      else if (rm.type === 'eye') R(x + 3, top + 1, 4, 2, C.lgray);
    }
    if (p.state === 'idle' && !p.path.length && Math.floor((st.t + p.x) * 0.5) % 5 === 0) R(x - 1, top - 5, 3, 3, C.white);
  }

  function drawOver() {
    const k = Math.min(1, st.overT * 2);
    R(0, 0, LW, LH, `rgba(26,28,44,${0.7 * k})`);
    if (k < 1) return;
    const cx = LW / 2 | 0, cy = LH / 2 | 0;
    tri(cx, cy - 20, 22, C.gray); R(cx - 4, cy - 42, 1, 14, C.white); R(cx - 3, cy - 42, 8, 5, C.red);
    const tt = Math.floor(st.t);
    let x = cx - 60;
    R(x, cy - 4, 7, 7, C.yellow); R(x + 3, cy - 3, 1, 3, C.dark); R(x + 3, cy, 2, 1, C.dark);
    x = num(Math.floor(tt / 60), x + 10, cy - 2, C.white); R(x, cy - 1, 1, 1, C.white); R(x, cy + 1, 1, 1, C.white); num(String(tt % 60).padStart(2, '0'), x + 2, cy - 2, C.white);
    tinyPerson(cx + 4, cy + 4, LOOKS[0], 0, 1); num(st.people.length, cx + 10, cy - 2, C.white);
    let rx = cx - 60; const cnt = {}; st.rooms.forEach(r => cnt[r.type] = (cnt[r.type] || 0) + 1);
    ORDER.forEach(t => { roomIcon(t, rx, cy + 12); num(cnt[t] || 0, rx + 15, cy + 16, C.white); rx += 30; });
    if (st.overT > 1) { const bx = cx - 8, by = cy + 34; R(bx, by, 16, 16, C.dark); R(bx + 1, by + 1, 14, 14, C.green); g.strokeStyle = C.white; g.beginPath(); g.arc(bx + 8, by + 8, 4, 0.6, 5.8); g.stroke(); R(bx + 10, by + 3, 3, 3, C.white); }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const steps = window.__fast || 1;
    for (let i = 0; i < steps; i++) update(dt);
    g.imageSmoothingEnabled = false;
    drawMap(); drawPanel(); if (st.over) drawOver();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__st = () => st; window.__build = build; window.__reset = reset;
})();
