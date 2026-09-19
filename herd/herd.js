// herd：帶著一串小人走。停在資源旁邊＝他們去幹活，走開＝跟上，經過營地＝卸貨。
(() => {
  'use strict';
  let VW = 420, VH = 190;              // 邏輯解析度（依螢幕算，整數倍放大）
  const WW = 900, WH = 520;            // 世界大小
  const TIME = 150;                    // 一局秒數
  const GOAL = { wood: 30, stone: 20, food: 20 };
  const C = { dark: '#1a1c2c', grass: '#38b764', grass2: '#257179', wood: '#8b5a2b', leaf: '#257179', leaf2: '#38b764',
    stone: '#94b0c2', stone2: '#566c86', food: '#ffcd75', soil: '#5d275d', white: '#f4f4f4', red: '#e43b44', pants: '#333c57', sand: '#ef7d57' };
  const cv = document.getElementById('c'), g = cv.getContext('2d');
  let S = 3;
  function resize() {
    S = Math.max(2, Math.floor(innerHeight / 180)); VH = Math.min(260, Math.floor(innerHeight / S)); VW = Math.min(WW, Math.floor(innerWidth / S));
    cv.width = VW; cv.height = VH;
    cv.style.width = VW * S + 'px'; cv.style.height = VH * S + 'px';
    cv.style.left = ((innerWidth - VW * S) >> 1) + 'px'; cv.style.top = ((innerHeight - VH * S) >> 1) + 'px';
  }
  addEventListener('resize', resize); resize();
  let camX = 0, camY = 0;
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x - camX), Math.round(y - camY), w, h); };
  const RS = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); }; // 螢幕座標

  // 3x5 數字字型
  const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
  function num(n, x, y, c) { const s = String(n); for (let i = 0; i < s.length; i++) { const d = s[i] === '/' ? null : DIG[+s[i]]; if (!d) { RS(x + i * 4 + 1, y + 1, 1, 3, c); continue; } for (let k = 0; k < 15; k++) if (d[k] === '1') RS(x + i * 4 + (k % 3), y + ((k / 3) | 0), 1, 1, c); } return s.length * 4; }
  function icon(kind, x, y) {
    if (kind === 'wood') { RS(x, y + 1, 5, 3, C.dark); RS(x + 1, y + 2, 3, 1, C.wood); }
    if (kind === 'stone') { RS(x, y + 1, 5, 4, C.dark); RS(x + 1, y + 2, 3, 2, C.stone); }
    if (kind === 'food') { RS(x + 1, y + 1, 3, 4, C.dark); RS(x + 2, y + 2, 1, 2, C.food); RS(x + 2, y, 1, 1, C.leaf2); }
  }

  // ---- 世界 ----
  let rng = 1;
  const rand = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
  const camp = { x: 450, y: 260 };
  let nodes, folk, wild, player, got, T, over, parts;
  const LOOKS = [['#f4f4f4', '#b13e53'], ['#ffcd75', '#3b5dc9'], ['#a7f070', '#ef7d57'], ['#73eff7', '#5d275d'], ['#ef7d57', '#41a6f6']];
  function newFolk(x, y) { const L = LOOKS[(rand() * LOOKS.length) | 0]; return { x, y, hair: L[0], shirt: L[1], skin: rand() < .5 ? '#ffcd75' : '#ef7d57', job: null, carry: 0, kind: null, work: 0, ph: rand() * 6, face: 1, moving: false }; }
  function reset() {
    rng = (Date.now() % 100000) + 7;
    nodes = []; parts = [];
    const place = (kind, n, amt) => { for (let i = 0; i < n; i++) { let x, y; do { x = 40 + rand() * (WW - 80); y = 40 + rand() * (WH - 80); } while (Math.hypot(x - camp.x, y - camp.y) < 90 || nodes.some(o => Math.hypot(o.x - x, o.y - y) < 60)); nodes.push({ kind, x, y, left: amt, max: amt }); } };
    place('wood', 7, 14); place('stone', 4, 12); place('food', 5, 10);
    player = { x: camp.x, y: camp.y + 16, face: 1, moving: false, ph: 0, trail: [] };
    folk = [newFolk(camp.x - 8, camp.y + 20), newFolk(camp.x + 8, camp.y + 20), newFolk(camp.x, camp.y + 26)];
    wild = []; for (let i = 0; i < 7; i++) { let x, y; do { x = 30 + rand() * (WW - 60); y = 30 + rand() * (WH - 60); } while (Math.hypot(x - camp.x, y - camp.y) < 120); wild.push(newFolk(x, y)); }
    got = { wood: 0, stone: 0, food: 0 }; T = 0; over = null;
  }
  reset();

  // ---- 輸入 ----
  const keys = {};
  addEventListener('keydown', e => { keys[e.key.toLowerCase()] = 1; if (over && T - over.t > 1) reset(); });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = 0; });
  const stick = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
  let mouse = null; // 電腦：按住滑鼠往游標方向走
  const toLogic = (cx, cy) => [(cx - parseFloat(cv.style.left)) / S, (cy - parseFloat(cv.style.top)) / S];
  addEventListener('touchstart', e => { e.preventDefault(); if (over && T - over.t > 1) { reset(); return; } for (const t of e.changedTouches) if (stick.id === null && t.clientX < innerWidth / 2) { stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; stick.dx = stick.dy = 0; } }, { passive: false });
  addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === stick.id) { stick.dx = t.clientX - stick.ox; stick.dy = t.clientY - stick.oy; } }, { passive: false });
  const tend = e => { for (const t of e.changedTouches) if (t.identifier === stick.id) { stick.id = null; stick.dx = stick.dy = 0; } };
  addEventListener('touchend', tend); addEventListener('touchcancel', tend);
  addEventListener('mousedown', e => { if (over && T - over.t > 1) { reset(); return; } mouse = toLogic(e.clientX, e.clientY); });
  addEventListener('mousemove', e => { if (mouse) mouse = toLogic(e.clientX, e.clientY); });
  addEventListener('mouseup', () => { mouse = null; });

  // ---- 更新 ----
  const WORK_R = 34, SPEED = 55;
  function update(dt) {
    T += dt;
    if (over) return;
    let mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    let my = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    if (stick.id !== null) { const l = Math.hypot(stick.dx, stick.dy); if (l > 8) { mx = stick.dx / l; my = stick.dy / l; } }
    if (mouse) { const dx = mouse[0] + camX - player.x, dy = mouse[1] + camY - player.y, l = Math.hypot(dx, dy); if (l > 4) { mx = dx / l; my = dy / l; } }
    const l = Math.hypot(mx, my);
    player.moving = l > 0;
    if (l) { mx /= l; my /= l; player.x = Math.max(8, Math.min(WW - 8, player.x + mx * SPEED * dt)); player.y = Math.max(12, Math.min(WH - 4, player.y + my * SPEED * dt)); if (mx) player.face = Math.sign(mx); player.ph += dt * 8; }
    const tr = player.trail, last = tr[0];
    if (!last || Math.hypot(last.x - player.x, last.y - player.y) > 2) { tr.unshift({ x: player.x, y: player.y }); if (tr.length > 400) tr.pop(); }

    // 沿途撿到落單的人
    for (let i = wild.length - 1; i >= 0; i--) { const w = wild[i]; if (Math.hypot(w.x - player.x, w.y - player.y) < 14) { folk.push(w); wild.splice(i, 1); burst(w.x, w.y - 10, C.white, 6); } }

    // 附近的資源（停下來才開工）
    const near = player.moving ? null : nodes.filter(n => n.left > 0 && Math.hypot(n.x - player.x, n.y - player.y) < WORK_R).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
    let slot = 0;
    folk.forEach((f, i) => {
      // 揹滿（3）就不再工作，跟著走
      if (near && near.length && f.carry < 3) {
        const n = near[slot % near.length]; slot++;
        if (f.kind && f.kind !== n.kind && f.carry > 0) { f.job = null; } else f.job = n;
      } else f.job = null;
      let tx, ty;
      if (f.job) { const a = i * 2.4; tx = f.job.x + Math.cos(a) * 10; ty = f.job.y + 6 + Math.sin(a) * 5; }
      else if (f.carry && Math.hypot(player.x - camp.x, player.y - camp.y) < 50) { tx = camp.x; ty = camp.y + 4; } // 帶到營地附近：揹貨的人自己進去卸
      else { const p = tr[Math.min(tr.length - 1, 5 + i * 5)] || player; tx = p.x + ((i % 2) ? 3 : -3); ty = p.y; }
      const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
      const sp = SPEED * (d > 30 ? 1.3 : 1);
      f.moving = d > 2;
      if (f.moving) { const s = Math.min(d, sp * dt); f.x += dx / d * s; f.y += dy / d * s; if (Math.abs(dx) > .5) f.face = Math.sign(dx); f.ph += dt * 8; }
      if (f.job && d < 4) {
        f.work += dt;
        if (f.work > 1.1 && f.job.left > 0) { f.work = 0; f.job.left--; f.carry++; f.kind = f.job.kind; burst(f.job.x, f.job.y - 8, f.job.kind === 'wood' ? C.wood : f.job.kind === 'stone' ? C.stone : C.food, 3); }
      } else f.work = 0;
      // 經過營地卸貨
      if (f.carry && Math.hypot(f.x - camp.x, f.y - camp.y) < 26) { got[f.kind] += f.carry; burst(camp.x, camp.y - 14, C.food, f.carry * 2); f.carry = 0; f.kind = null; }
    });
    // 資源慢慢長回來
    nodes.forEach(n => { if (n.left < n.max) { n.regen = (n.regen || 0) + dt; if (n.regen > 9) { n.regen = 0; n.left++; } } });
    parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.t -= dt; }); parts = parts.filter(p => p.t > 0);
    if (got.wood >= GOAL.wood && got.stone >= GOAL.stone && got.food >= GOAL.food) over = { win: true, t: T };
    else if (T >= TIME) over = { win: false, t: T };
  }
  function burst(x, y, c, n) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (rand() - .5) * 40, vy: -20 - rand() * 30, t: .6, c }); }

  // ---- 繪圖 ----
  function drawNode(n) {
    const x = n.x, y = n.y, k = n.left / n.max;
    if (n.kind === 'wood') {
      const cnt = Math.ceil(k * 4);
      const off = [[-8, 0], [7, -2], [0, -6], [-2, 5]];
      for (let i = 0; i < 4; i++) { const [ox, oy] = off[i], tx = x + ox, ty = y + oy;
        if (i < cnt) { R(tx - 1, ty - 4, 3, 5, C.dark); R(tx, ty - 3, 1, 4, C.wood); R(tx - 5, ty - 15, 11, 12, C.dark); R(tx - 4, ty - 14, 9, 10, C.leaf); R(tx - 3, ty - 14, 5, 5, C.leaf2); }
        else { R(tx - 2, ty - 1, 5, 2, C.dark); R(tx - 1, ty - 1, 3, 1, C.wood); } }
    } else if (n.kind === 'stone') {
      const h = 2 + Math.ceil(k * 8);
      R(x - 10, y - h, 20, h + 1, C.dark); R(x - 9, y - h + 1, 18, h - 1, C.stone2); R(x - 7, y - h + 1, 8, Math.max(1, h - 4), C.stone);
    } else {
      R(x - 14, y - 7, 28, 14, C.soil);
      const cnt = Math.ceil(k * 12);
      for (let i = 0; i < 12; i++) { const px = x - 11 + (i % 4) * 7, py = y - 5 + ((i / 4) | 0) * 4; if (i < cnt) { R(px, py - 2, 1, 3, C.leaf2); R(px + 1, py - 3, 2, 2, C.food); } else R(px, py, 2, 1, C.grass2); }
    }
  }
  function drawGuy(p, isLeader) {
    const x = Math.round(p.x), y = Math.round(p.y), top = y - 12;
    const leg = p.moving ? (Math.floor(p.ph) % 2) : 0;
    R(x - 3, y, 7, 1, 'rgba(26,28,44,.35)');
    R(x - 3, top - 1, 7, 13, C.dark);
    R(x - 2, top + 1, 5, 3, p.skin || '#ffcd75');
    const ex = p.face < 0 ? -1 : 0;
    R(x - 1 + ex, top + 2, 1, 1, C.dark); R(x + 1 + ex, top + 2, 1, 1, C.dark);
    R(x - 2, top, 5, 1, p.hair || C.red);
    R(x - 2, top + 4, 5, 5, p.shirt || C.red);
    R(x - 2, top + 9, 2, 3 - leg, C.pants); R(x + 1, top + 9, 2, 3 - (1 - leg), C.pants);
    if (isLeader) { R(x - 4, top - 1, 9, 1, C.food); R(x - 2, top - 3, 5, 2, C.food); R(x - 2, top - 1, 5, 1, C.red); }
    if (p.job && p.work > 0) { const up = Math.floor(T * 5) % 2; R(x + 3, top + (up ? 2 : 5), 1, 4, C.wood); R(x + 3, top + (up ? 1 : 8), 3, 2, C.stone); }
    if (p.carry) { // 背上的貨：一包，旁邊點數表示幾份
      const col = p.kind === 'wood' ? C.wood : p.kind === 'stone' ? C.stone : C.food, bx = x - p.face * 4 - 2;
      R(bx - 1, top + 3, 6, 6, C.dark); R(bx, top + 4, 4, 4, col);
      for (let i = 0; i < p.carry; i++) R(bx + 1, top - 3 - i * 2, 2, 1, col);
    }
  }
  function drawCamp() {
    const x = camp.x, y = camp.y;
    for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; R(x + Math.cos(t) * 26, y + Math.sin(t) * 14, 2, 1, C.sand); }
    // 營地會隨著蒐集進度蓋起來
    const pw = Math.min(1, got.wood / GOAL.wood), ps = Math.min(1, got.stone / GOAL.stone), pf = Math.min(1, got.food / GOAL.food);
    const bh = Math.round(4 + ps * 8);
    R(x - 13, y - bh, 26, bh + 1, C.dark); R(x - 12, y - bh + 1, 24, bh - 1, C.stone2);
    const rh = Math.round(pw * 10);
    if (rh) { for (let i = 0; i < rh; i++) R(x - 14 + i, y - bh - i, 28 - i * 2, 1, i % 2 ? C.wood : '#5d3a1a'); }
    R(x - 2, y - 6, 5, 7, C.dark);
    const fn = Math.round(pf * 4); for (let i = 0; i < fn; i++) R(x + 15, y - 2 - i * 3, 4, 2, C.food);
    R(x - 18, y - 22, 1, 22, C.dark); R(x - 17, y - 22, 6, 4, C.red);
  }
  function draw() {
    camX = Math.round(Math.max(0, Math.min(WW - VW, player.x - VW / 2)));
    camY = Math.round(Math.max(0, Math.min(WH - VH, player.y - VH / 2 - 6)));
    RS(0, 0, VW, VH, C.grass);
    for (let i = 0; i < 160; i++) { const gx = (i * 97) % WW, gy = (i * 53 + (i % 7) * 31) % WH; R(gx, gy, 1, 2, C.grass2); }
    // 工作範圍（停下時亮起）
    if (!player.moving) nodes.forEach(n => { if (n.left > 0 && Math.hypot(n.x - player.x, n.y - player.y) < WORK_R) for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2 + T; R(n.x + Math.cos(t) * 16, n.y + 2 + Math.sin(t) * 8, 1, 1, C.white); } });
    const list = [...nodes.map(n => ({ y: n.y, d: () => drawNode(n) })), { y: camp.y, d: drawCamp },
      ...folk.map(f => ({ y: f.y, d: () => drawGuy(f) })), ...wild.map(w => ({ y: w.y, d: () => { drawGuy(w); if (Math.floor(T * 2) % 2) { R(w.x - 1, w.y - 20, 3, 1, C.white); R(w.x, w.y - 22, 1, 4, C.white); } } })),
      { y: player.y, d: () => drawGuy(player, true) }];
    list.sort((a, b) => a.y - b.y).forEach(o => o.d());
    parts.forEach(p => R(p.x, p.y, 1, 1, p.c));
    // 營地方向箭頭（有人揹東西且營地在畫面外）
    if (folk.some(f => f.carry) ) { const sx = camp.x - camX, sy = camp.y - camY; if (sx < 0 || sx > VW || sy < 0 || sy > VH) { const ax = Math.max(4, Math.min(VW - 6, sx)), ay = Math.max(14, Math.min(VH - 6, sy)); if (Math.floor(T * 3) % 2) { RS(ax - 1, ay - 1, 4, 4, C.dark); RS(ax, ay, 2, 2, C.red); } } }
    // HUD：三種資源＋人數＋時間條
    RS(0, 0, VW, 9, 'rgba(26,28,44,.8)');
    let x = 3;
    for (const k of ['wood', 'stone', 'food']) { icon(k, x, 2); x += 7; const done = got[k] >= GOAL[k]; x += num(got[k], x, 2, done ? C.leaf2 : C.white); RS(x, 4, 1, 1, C.stone2); x += 2; x += num(GOAL[k], x, 2, C.stone2) + 6; }
    // 人數
    RS(x + 1, 2, 3, 2, C.food); RS(x, 4, 5, 3, C.red); x += 7; x += num(folk.length, x, 2, C.white) + 6;
    const tw = VW - x - 4, left = Math.max(0, 1 - T / TIME);
    RS(x, 3, tw, 3, C.stone2); RS(x, 3, Math.round(tw * left), 3, left < .2 ? C.red : C.food);
    // 虛擬搖桿
    if (stick.id !== null) { const [ox, oy] = toLogic(stick.ox, stick.oy); g.globalAlpha = .4; RS(ox - 10, oy - 10, 20, 20, C.white); const l = Math.min(1, Math.hypot(stick.dx, stick.dy) / 40); const a = Math.atan2(stick.dy, stick.dx); RS(ox + Math.cos(a) * l * 10 - 3, oy + Math.sin(a) * l * 10 - 3, 6, 6, C.dark); g.globalAlpha = 1; }
    // 開局提示：只用圖示（WASD 鍵帽）
    if (T < 4 && !over) { const bx = VW / 2 - 17; g.globalAlpha = Math.min(1, 4 - T); [[12, 0, 0], [0, 12, 1], [12, 12, 2], [24, 12, 3]].forEach(([ox, oy, i]) => { RS(bx + ox, VH - 30 + oy, 10, 10, C.dark); RS(bx + ox + 1, VH - 29 + oy, 8, 8, C.white); RS(bx + ox + 4, VH - 26 + oy, 2, 2, C.dark); }); g.globalAlpha = 1; }
    if (over) {
      RS(0, 0, VW, VH, 'rgba(26,28,44,.6)');
      if (over.win) { // 旗子＋用了幾秒
        RS(VW / 2 - 10, 34, 1, 24, C.white); RS(VW / 2 - 9, 34, 14, 8, C.leaf2);
        const w = num(Math.ceil(over.t), 0, -99, C.white); num(Math.ceil(over.t), VW / 2 - w / 2, 64, C.food);
      } else { RS(VW / 2 - 8, 40, 16, 16, C.red); RS(VW / 2 - 6, 46, 12, 4, C.dark); }
    }
  }
  let prev = performance.now();
  function frame(now) { const dt = Math.min(.05, (now - prev) / 1000); prev = now; update(dt); draw(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  window.__herd = { get state() { return { T, got, folk: folk.length, over, player, nodes, camp }; }, keys };
})();
