// 海灣原型：點空地蓋房子 → 有人搬進來過日子
(() => {
  'use strict';
  const W = 280, H = 130;
  const cv = document.getElementById('c'), g = cv.getContext('2d');
  cv.width = W; cv.height = H;
  let S = 3;
  function fit() {
    S = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    cv.style.width = W * S + 'px'; cv.style.height = H * S + 'px';
    cv.style.left = ((innerWidth - W * S) >> 1) + 'px'; cv.style.top = ((innerHeight - H * S) >> 1) + 'px';
  }
  addEventListener('resize', fit); fit();

  // 色盤（Sweetie 16）
  const C = { dark:'#1a1c2c', purple:'#5d275d', red:'#b13e53', orange:'#ef7d57', yellow:'#ffcd75', lgreen:'#a7f070',
    green:'#38b764', dgreen:'#257179', navy:'#29366f', blue:'#3b5dc9', lblue:'#41a6f6', cyan:'#73eff7',
    white:'#f4f4f4', lgray:'#94b0c2', gray:'#566c86', dgray:'#333c57', wood:'#8a5a3b', sand:'#e8d49a' };
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // 地形：海岸線（x 處的水面起點 y）
  const shoreY = x => 104 - Math.max(0, x - 196) * 0.95;
  const isWater = (x, y) => y > shoreY(x);
  const DOCK = { x: 150, y0: 100, y1: 122 };
  const PLAZA = { x: 132, y: 60 };
  const ROAD_Y = 60;
  const PLOTS = [[26,46],[58,40],[92,36],[168,36],[204,42],[236,52],[30,92],[64,88],[100,92],[184,84]]
    .map(([x, y], i) => ({ x, y, i, house: null }));
  // 菜園與樹（裝飾）
  const TREES = [[8,20],[40,14],[130,12],[150,18],[262,20],[250,10],[120,30],[228,14],[6,72]];

  let T = 0, houses = [], people = [], boats = [], fx = [], ended = 0, sel = -1, hint = 1, nextBoat = true;

  // ---- 放房子 ----
  const ROOFS = [C.red, C.blue, C.orange, C.dgreen, C.purple, C.navy];
  function build(plot) {
    if (plot.house || ended) return;
    hint = 0;
    const h = { x: plot.x, y: plot.y, t: 0, roof: ROOFS[houses.length % ROOFS.length], lit: 0, smoke: 0, n: 0, garden: Math.random() < .6 ? (plot.x < 140 ? -1 : 1) : 0 };
    plot.house = h; houses.push(h);
    for (let k = 0; k < 14; k++) fx.push({ x: h.x + rnd(-9, 9), y: h.y - rnd(0, 4), vx: rnd(-20, 20), vy: rnd(-30, -8), life: rnd(.4, .8), c: C.sand });
    // 搬家的人：一艘船或一條路，1～3 人
    const count = pick([1, 2, 2, 2, 3]);
    const byBoat = nextBoat; nextBoat = !nextBoat;
    const group = [];
    for (let k = 0; k < count; k++) group.push(makePerson(h, k === 2 ? 'child' : null));
    setTimeout(() => arrive(h, group, byBoat), 1100);
  }
  const KINDS = ['strawhat', 'spiky', 'longhair', 'headband', 'elder', 'bald'];
  const SHIRTS = [C.red, C.blue, C.green, C.orange, C.purple, C.lblue, C.yellow, C.gray];
  const SKINS = ['#f4c29a', '#d9a066', '#a0694a', '#ffd9b3'];
  const HAIRS = [C.dark, C.wood, C.yellow, C.lgray, C.red];
  function makePerson(home, kind) {
    const child = kind === 'child';
    return { home, x: 0, y: 0, tx: 0, ty: 0, face: 1, walk: 0, moving: false, hidden: true,
      look: { kind: kind || pick(KINDS), shirt: pick(SHIRTS), skin: pick(SKINS), hair: pick(HAIRS), h: child ? 8 : 11 },
      child, job: child ? 'play' : pick(['fish', 'farm', 'wood', 'fish', 'farm']),
      state: 'arrive', timer: 0, carry: null, bubble: null, bt: 0, partner: null, spd: child ? 22 : 16, friends: new Map() };
  }
  function arrive(h, group, byBoat) {
    if (byBoat) {
      const b = { x: W + 20, y: 116, tx: DOCK.x + 10, group, done: false };
      boats.push(b);
      group.forEach(p => { p.onBoat = b; });
    } else {
      group.forEach((p, k) => {
        people.push(p); p.hidden = false; p.x = -8 - k * 9; p.y = ROAD_Y + k; p.carry = k === 0 ? 'crate' : k === 1 ? 'bag' : null;
        goto(p, h.x + (k - 1) * 3, h.y + 2, 'movein');
      });
    }
  }
  function goto(p, x, y, state) { p.tx = x; p.ty = y; p.state = state; p.moving = true; }

  // ---- 小人的日子 ----
  function dayPhase() { return (T % 60) / 60; } // 0～1，0.75 之後是夜
  const isNight = () => ended ? true : dayPhase() > 0.78;

  function think(p) {
    const h = p.home;
    if (isNight() && !ended) { if (p.state !== 'home') goto(p, h.x, h.y + 2, 'gohome'); return; }
    if (ended) { const a = people.indexOf(p) / Math.max(1, people.length) * Math.PI * 2 + T * .05;
      goto(p, PLAZA.x + Math.cos(a) * (26 + (people.indexOf(p) % 2) * 8), PLAZA.y + 3 + Math.sin(a) * (11 + (people.indexOf(p) % 2) * 4), 'party'); return; }
    // 找附近閒著的人聊天
    if (Math.random() < .35) {
      const other = people.filter(o => o !== p && !o.hidden && !o.partner && o.state === 'idle' && dist(o, p) < 60)[0];
      if (other) { p.partner = other; other.partner = p; const mx = (p.x + other.x) / 2, my = (p.y + other.y) / 2;
        goto(p, mx - 5, my, 'meet'); goto(other, mx + 5, my, 'meet'); return; }
    }
    const r = Math.random();
    if (r < .45) {
      if (p.job === 'fish') goto(p, DOCK.x + rnd(-1, 1), DOCK.y1 - 2, 'fish');
      else if (p.job === 'farm' && h.garden) goto(p, h.x + h.garden * 16, h.y + 6, 'farm');
      else if (p.job === 'wood') { const t = pick(TREES); goto(p, t[0] + 5, t[1] + 8, 'chop'); }
      else { const o = pick(people.filter(o => o.child && o !== p)); if (o) goto(p, o.x + rnd(-8, 8), o.y + rnd(-4, 4), 'chase'); else goto(p, PLAZA.x + rnd(-15, 15), PLAZA.y + rnd(-4, 6), 'idle'); }
    } else if (r < .7) {
      const o = pick(houses); goto(p, o.x + rnd(-6, 6), o.y + 4, 'visit');
    } else goto(p, PLAZA.x + rnd(-20, 20), PLAZA.y + rnd(-6, 8), 'idle');
  }

  function arrived(p) {
    p.moving = false;
    switch (p.state) {
      case 'movein':
        p.carry = null; p.hidden = true; p.home.n++;
        if (!p.home.lit) { p.home.lit = 1; p.home.smoke = 1; bubble(p, 'heart'); for (let k = 0; k < 10; k++) fx.push({ x: p.home.x + rnd(-6, 6), y: p.home.y - 10, vx: rnd(-15, 15), vy: rnd(-25, -5), life: .9, c: pick([C.yellow, C.white, C.lgreen]) }); }
        setTimeout(() => { p.hidden = false; p.y += 3; p.state = 'wave'; p.timer = 1.6; bubble(p, 'note'); greetNeighbors(p); }, 900);
        break;
      case 'gohome': p.hidden = true; p.state = 'home'; break;
      case 'meet': {
        const o = p.partner; if (!o) { p.state = 'idle'; p.timer = 1; break; }
        p.face = o.x > p.x ? 1 : -1; p.state = 'talk'; p.timer = rnd(2.5, 4);
        const k = (p.friends.get(o) || 0) + 1; p.friends.set(o, k); o.friends.set(p, k);
        bubble(p, k >= 3 ? 'heart' : pick(['dots', 'note', 'fish', 'sun'])); break;
      }
      case 'fish': p.timer = rnd(5, 9); p.face = 1; break;
      case 'farm': p.timer = rnd(4, 7); break;
      case 'chop': p.timer = rnd(3, 5); p.face = -1; break;
      case 'party': p.timer = rnd(.5, 1.5); break;
      default: p.timer = rnd(1.5, 3.5);
    }
  }
  function greetNeighbors(p) {
    people.filter(o => o !== p && !o.hidden && o.state === 'idle' || o.state === 'visit').slice(0, 3).forEach(o => {
      if (o === p || o.hidden) return; goto(o, p.x + (o.x < p.x ? -8 : 8), p.y, 'welcome');
    });
  }
  function bubble(p, icon) { p.bubble = icon; p.bt = 2.2; }

  function update(dt) {
    T += dt;
    // 船
    for (const b of boats) {
      if (!b.done) {
        b.x += (b.tx - b.x) * Math.min(1, dt * .9) - 0;
        if (Math.abs(b.x - b.tx) < 1) { b.done = true; b.group.forEach((p, k) => { p.onBoat = null; p.hidden = false; p.x = DOCK.x + 1; p.y = DOCK.y1 - k * 4; p.carry = k === 0 ? 'crate' : k === 1 ? 'bag' : null; goto(p, p.home.x + (k - 1) * 3, p.home.y + 2, 'movein'); }); b.leave = 2; }
      } else if ((b.leave -= dt) < 0) b.x += dt * 30;
    }
    boats = boats.filter(b => b.x < W + 40);
    for (const p of people.concat(boats.flatMap(b => b.group).filter(p => !people.includes(p)))) if (!people.includes(p)) people.push(p);
    for (const p of people) {
      if (p.bt > 0) p.bt -= dt;
      if (p.onBoat) continue;
      if (p.state === 'home') { if (!isNight() || ended) { p.hidden = false; p.state = 'idle'; p.timer = rnd(0, 2); } continue; }
      if (p.moving) {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), s = p.spd * dt * (p.state === 'movein' ? .8 : 1);
        if (d <= s) { p.x = p.tx; p.y = p.ty; arrived(p); }
        else { p.x += dx / d * s; p.y += dy / d * s; p.face = dx >= 0 ? 1 : -1; p.walk += dt * 6; }
        continue;
      }
      if (p.hidden && p.state === 'movein') continue;
      p.timer -= dt;
      if (p.state === 'fish' && Math.random() < dt * .15) { p.carry = 'fish'; bubble(p, 'fish'); }
      if (p.timer <= 0) {
        if (p.state === 'talk' && p.partner) { const o = p.partner; p.partner = null; o.partner = null; o.state = 'idle'; o.timer = 0; }
        if (p.state === 'visit') { const h = houses.find(h => Math.abs(h.x - p.x) < 8 && Math.abs(h.y + 4 - p.y) < 3); if (h && h !== p.home) bubble(p, 'dots'); }
        if (p.carry === 'fish' && p.state !== 'fish') p.carry = null;
        think(p);
      }
    }
    fx.forEach(f => { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 40 * dt; f.life -= dt; });
    fx = fx.filter(f => f.life > 0);
    // 收尾：全部蓋滿且都搬進來
    if (!ended && houses.length === PLOTS.length && houses.every(h => h.n > 0) && people.every(p => !p.onBoat && p.state !== 'movein')) { ended = T; people.forEach(p => { p.timer = 0; p.moving = false; p.state = 'idle'; p.hidden = false; }); }
    if (ended && Math.random() < dt * 1.6) firework();
  }
  function firework() {
    const x = rnd(40, 240), y = rnd(8, 35), c = pick([C.yellow, C.red, C.cyan, C.lgreen, C.orange, C.white]);
    for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; fx.push({ x, y, vx: Math.cos(a) * 28, vy: Math.sin(a) * 28, life: 1.1, c, fw: 1 }); }
  }

  // ---- 繪圖 ----
  function drawGround() {
    R(0, 0, W, H, C.green);
    for (let i = 0; i < 90; i++) { const x = (i * 97) % W, y = (i * 53) % 100; R(x, y, 1, 2, C.lgreen); }
    // 路
    R(0, ROAD_Y - 2, PLAZA.x, 5, C.sand); R(0, ROAD_Y - 2, PLAZA.x, 1, '#c9b27a');
    // 廣場
    g.fillStyle = C.sand; g.beginPath(); g.ellipse(PLAZA.x, PLAZA.y + 2, 30, 13, 0, 0, 7); g.fill();
    // 通往碼頭的小徑
    for (let y = PLAZA.y + 10; y < DOCK.y0; y += 3) R(PLAZA.x + (y - PLAZA.y) * .45 - 1, y, 4, 2, C.sand);
    // 海
    for (let x = 0; x < W; x++) {
      const s = Math.round(shoreY(x));
      R(x, s - 5, 1, 5, C.sand);
      R(x, s, 1, H - s, C.blue);
      if (((x + (T * 6 | 0)) % 17) < 2) R(x, s + 1, 1, 1, C.cyan);
      if (((x * 7 + (T * 3 | 0)) % 41) === 0) R(x, s + 8 + (x % 11), 3, 1, C.lblue);
    }
    // 碼頭
    R(DOCK.x - 4, DOCK.y0 - 4, 9, DOCK.y1 - DOCK.y0 + 6, C.wood);
    for (let y = DOCK.y0 - 4; y < DOCK.y1 + 2; y += 3) R(DOCK.x - 4, y, 9, 1, '#6a4028');
    R(DOCK.x - 5, DOCK.y1 + 2, 2, 3, C.dark); R(DOCK.x + 4, DOCK.y1 + 2, 2, 3, C.dark);
    // 井
    R(PLAZA.x - 4, PLAZA.y - 4, 9, 6, C.dark); R(PLAZA.x - 3, PLAZA.y - 3, 7, 4, C.lgray); R(PLAZA.x - 2, PLAZA.y - 3, 5, 1, C.navy);
  }
  function drawTree(x, y) { R(x + 2, y + 4, 2, 5, C.wood); R(x - 1, y - 3, 8, 8, C.dark); R(x, y - 2, 6, 6, C.dgreen); R(x + 1, y - 2, 3, 2, C.green); }
  function drawPlot(pl, i) {
    const on = i === sel, blink = (T * 2 | 0) % 2;
    const c = on ? C.white : hint && blink ? C.yellow : C.lgreen;
    for (let k = -9; k <= 9; k += 3) { R(pl.x + k, pl.y - 14, 2, 1, c); R(pl.x + k, pl.y, 2, 1, c); }
    for (let k = -14; k <= 0; k += 3) { R(pl.x - 10, pl.y + k, 1, 2, c); R(pl.x + 10, pl.y + k, 1, 2, c); }
    if (on || hint) { R(pl.x - 1, pl.y - 11, 3, 7, c); R(pl.x - 4, pl.y - 8, 9, 1, c); R(pl.x - 4, pl.y - 8, 9, 1, c); R(pl.x - 1, pl.y - 11, 3, 7, c); R(pl.x - 4, pl.y - 8, 9, 3, c); R(pl.x-1,pl.y-11,3,9,c); }
  }
  function drawHouse(h) {
    const t = Math.min(1, h.t / .6), sq = t < 1 ? 1 + Math.sin(t * Math.PI) * .25 : 1;
    const hh = Math.round(10 * t * sq), x = h.x - 9, y = h.y;
    if (h.garden) { const gx = h.x + h.garden * 16 - 5; R(gx, y - 1, 11, 9, C.wood); for (let k = 0; k < 3; k++) R(gx + 1 + k * 4, y + 1, 1 + (h.n > 0 ? 1 : 0), 2 + (h.n > 0 ? 2 : 0), C.lgreen); }
    R(x - 1, y - hh - 1, 20, hh + 2, C.dark); R(x, y - hh, 18, hh, '#e8c9a0'); R(x, y - hh, 18, 1, C.white);
    if (t >= 1) {
      // 屋頂
      for (let k = 0; k < 7; k++) R(x - 2 + k, y - 11 - k, 22 - k * 2, 1, k === 0 ? C.dark : h.roof);
      R(x + 13, y - 18, 3, 5, C.dgray);
      // 門窗
      R(h.x - 2, y - 6, 4, 6, C.wood);
      const win = isNight() && h.lit ? C.yellow : h.lit ? C.lblue : C.dgray;
      R(x + 2, y - 8, 4, 3, win); R(x + 12, y - 8, 4, 3, win);
      if (h.smoke) for (let k = 0; k < 3; k++) { const ph = (T * .6 + k / 3) % 1; R(x + 14 + Math.sin(ph * 6) * 2, y - 20 - ph * 12, 2 + (ph > .5), 2, ph > .7 ? C.lgray : C.white); }
    }
  }
  function drawBoat(b) {
    const x = b.x, y = b.y + Math.sin(T * 3) * .7;
    b.group.forEach((p, k) => { if (p.onBoat) drawPerson(p, x - 6 + k * 5, y - 2); });
    R(x - 12, y - 2, 24, 5, C.dark); R(x - 11, y - 2, 22, 3, C.wood); R(x - 9, y + 1, 18, 1, C.dark);
    R(x + 5, y - 16, 1, 14, C.dark); R(x - 3, y - 15, 8, 9, C.white);
  }
  function drawPerson(p, px, py) {
    const x = Math.round(px ?? p.x), y = Math.round(py ?? p.y), L = p.look, h = L.h, top = y - h;
    const leg = p.moving ? (Math.floor(p.walk) % 2) : 0;
    const bob = (p.state === 'party' || p.state === 'wave') ? (Math.floor(T * 5) % 2) : 0;
    const t0 = top - bob, ex = p.face < 0 ? -1 : 0;
    R(x - 3, t0 - 1, 7, h + 1 + bob, C.dark);
    R(x - 2, t0 + 1, 5, 3, L.skin);
    R(x - 1 + ex, t0 + 2, 1, 1, C.dark); R(x + 1 + ex, t0 + 2, 1, 1, C.dark);
    switch (L.kind) {
      case 'strawhat': R(x - 4, t0, 9, 1, C.yellow); R(x - 2, t0 - 1, 5, 1, C.yellow); break;
      case 'spiky': R(x - 2, t0, 5, 1, L.hair); R(x, t0 - 2, 1, 2, L.hair); break;
      case 'child': R(x - 2, t0, 5, 1, L.hair); R(x - 3, t0 + 1, 1, 2, L.hair); R(x + 3, t0 + 1, 1, 2, L.hair); break;
      case 'elder': R(x - 2, t0 + 3, 5, 2, L.hair); break;
      case 'longhair': R(x - 2, t0, 5, 1, L.hair); R(x - 3, t0, 1, 5, L.hair); R(x + 3, t0, 1, 5, L.hair); break;
      case 'headband': R(x - 2, t0, 5, 1, L.hair); R(x - 2, t0 + 1, 5, 1, C.red); break;
    }
    const by = t0 + 4, bh = p.child ? 2 : 4;
    R(x - 2, by, 5, bh, L.shirt);
    const ly = by + bh, lh = y - ly;
    if (lh > 0) { R(x - 2, ly, 2, lh - leg, C.navy); R(x + 1, ly, 2, lh - (1 - leg), C.navy); }
    if (p.state === 'wave' || p.state === 'party') { const k = Math.floor(T * 5) % 2; R(x + 3, t0 + 1 + k * 2, 1, 3, L.skin); if (p.state === 'party') R(x - 3, t0 + 1 + (1 - k) * 2, 1, 3, L.skin); }
    if (p.carry === 'crate') { R(x - 4, t0 - 5, 9, 5, C.dark); R(x - 3, t0 - 4, 7, 3, C.wood); }
    if (p.carry === 'bag') { R(x + 2, by, 3, 4, C.red); }
    if (p.carry === 'fish') { R(x + 3, by + 1, 4, 2, C.lgray); R(x + 7, by, 1, 4, C.lgray); }
    if (p.state === 'fish' && !p.moving) { R(x + 3, t0 + 3, 1, 1, C.wood); R(x + 4, t0 + 1, 1, 2, C.wood); R(x + 5, t0 - 1, 6, 1, C.wood); R(x + 11, t0, 1, 10 + Math.floor(T * 2) % 2, C.white); }
    if (p.state === 'farm' && !p.moving) { const u = Math.floor(T * 3) % 2; R(x + 3, t0 + (u ? 1 : 4), 1, 6, C.wood); R(x + 3, t0 + (u ? 7 : 10), 3, 1, C.lgray); }
    if (p.state === 'chop' && !p.moving) { const u = Math.floor(T * 4) % 2; R(x - 4, t0 + (u ? 1 : 4), 1, 5, C.wood); R(x - 6, t0 + (u ? 0 : 7), 3, 2, C.lgray); }
    if (p.bt > 0 && !p.hidden) drawBubble(x, t0 - 3, p.bubble);
  }
  function drawBubble(x, y, icon) {
    const bx = x - 4, by = y - 9;
    R(bx - 1, by - 1, 11, 9, C.dark); R(bx, by, 9, 7, C.white); R(x - 1, by + 7, 2, 2, C.white); R(x - 1, by + 8, 2, 1, C.dark);
    const P = (dx, dy, c) => R(bx + dx, by + dy, 1, 1, c);
    if (icon === 'heart') { [[2,1],[3,1],[5,1],[6,1],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[2,3],[3,3],[4,3],[5,3],[6,3],[3,4],[4,4],[5,4],[4,5]].forEach(([a, b]) => P(a, b, C.red)); }
    else if (icon === 'note') { R(bx + 5, by + 1, 1, 4, C.dark); R(bx + 6, by + 1, 2, 1, C.dark); R(bx + 3, by + 4, 3, 2, C.dark); }
    else if (icon === 'dots') { const k = Math.floor(T * 3) % 3; for (let i = 0; i <= k; i++) R(bx + 2 + i * 2, by + 3, 1, 1, C.dark); }
    else if (icon === 'fish') { R(bx + 2, by + 2, 4, 3, C.lblue); R(bx + 6, by + 1, 1, 5, C.lblue); P(3, 3, C.dark); }
    else if (icon === 'sun') { R(bx + 3, by + 2, 3, 3, C.orange); P(4, 0, C.orange); P(4, 6, C.orange); P(1, 3, C.orange); P(7, 3, C.orange); }
  }
  function drawHud() {
    // 右上角：房子格數（圖示，不用字）
    for (let i = 0; i < PLOTS.length; i++) {
      const x = W - 6 - (PLOTS.length - 1 - i) * 6, y = 3, on = i < houses.length;
      R(x, y + 2, 5, 3, on ? C.white : C.dgray); R(x + 1, y + 1, 3, 1, on ? C.red : C.dgray); R(x + 2, y, 1, 1, on ? C.red : C.dgray);
    }
    // 人數：小人圖示＋點
    const n = people.length;
    for (let i = 0; i < n; i++) R(4 + (i % 30) * 3, 3 + ((i / 30) | 0) * 3, 2, 2, C.yellow);
  }
  function draw() {
    drawGround();
    const items = [];
    TREES.forEach(t => items.push({ y: t[1] + 8, d: () => drawTree(t[0], t[1]) }));
    PLOTS.forEach((pl, i) => { if (!pl.house) items.push({ y: -1e3, d: () => drawPlot(pl, i) }); });
    houses.forEach(h => items.push({ y: h.y, d: () => drawHouse(h) }));
    people.forEach(p => { if (!p.hidden && !p.onBoat) items.push({ y: p.y + .5, d: () => drawPerson(p) }); });
    if (ended) items.push({ y: PLAZA.y + 3, d: drawFire });
    items.sort((a, b) => a.y - b.y).forEach(i => i.d());
    boats.forEach(drawBoat);
    // 夜色
    const ph = dayPhase();
    let dark = ended ? .5 : ph > .78 ? Math.min(.5, (ph - .78) * 6) * (ph > .96 ? (1 - ph) / .04 : 1) : 0;
    if (dark > 0) {
      g.globalAlpha = dark; R(0, 0, W, H, C.navy); g.globalAlpha = 1;
      houses.forEach(h => { if (h.lit && h.t > .6) { g.globalAlpha = .5; R(h.x - 7, h.y - 8, 4, 3, C.yellow); R(h.x + 3, h.y - 8, 4, 3, C.yellow); g.globalAlpha = .18; R(h.x - 12, h.y - 4, 24, 10, C.yellow); g.globalAlpha = 1; } });
      if (ended) { g.globalAlpha = .25; g.fillStyle = C.orange; g.beginPath(); g.ellipse(PLAZA.x, PLAZA.y + 2, 34, 16, 0, 0, 7); g.fill(); g.globalAlpha = 1; drawFire();
        // 夜裡還是看得到大家
        people.forEach(p => { if (!p.hidden) { g.globalAlpha = .55; drawPerson(p); g.globalAlpha = 1; } }); }
    }
    fx.forEach(f => { g.globalAlpha = Math.min(1, f.life * 2); R(f.x, f.y, f.fw ? 1 : 2, f.fw ? 1 : 2, f.c); });
    g.globalAlpha = 1;
    drawHud();
    if (ended && T - ended > 4) { // 重來圖示
      const x = W / 2, y = 118, a = (T * 2) % 6.28;
      R(x - 8, y - 7, 16, 14, C.dark); R(x - 7, y - 6, 14, 12, C.white);
      for (let k = 0; k < 10; k++) { const t = a + k * .55; R(x + Math.cos(t) * 4 - .5, y + Math.sin(t) * 4 - .5, 1 + (k > 7), 1 + (k > 7), C.dark); }
    }
  }
  function drawFire() {
    const x = PLAZA.x, y = PLAZA.y + 3, k = Math.floor(T * 8) % 3;
    R(x - 4, y, 9, 2, C.wood); R(x - 3, y - 4 - k, 7, 4 + k, C.orange); R(x - 1, y - 6 - (k + 1) % 3, 3, 4, C.yellow);
  }

  // ---- 輸入 ----
  function plotAt(x, y) { let best = -1, bd = 16; PLOTS.forEach((pl, i) => { const d = Math.hypot(pl.x - x, pl.y - 7 - y); if (!pl.house && d < bd) { bd = d; best = i; } }); return best; }
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / S, y = (e.clientY - r.top) / S;
    if (ended && T - ended > 4) { if (y > 104 && Math.abs(x - W / 2) < 14) reset(); return; }
    const i = plotAt(x, y); if (i >= 0) build(PLOTS[i]);
  });
  cv.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const r = cv.getBoundingClientRect(); sel = plotAt((e.clientX - r.left) / S, (e.clientY - r.top) / S); });
  addEventListener('keydown', e => {
    if (ended && T - ended > 4 && (e.key === 'Enter' || e.key === ' ' || e.key === 'r')) { reset(); return; }
    const free = PLOTS.filter(p => !p.house).map(p => p.i); if (!free.length) return;
    if (['ArrowRight', 'ArrowDown', 'd', 's', 'Tab'].includes(e.key)) { e.preventDefault(); sel = free[(free.indexOf(sel) + 1) % free.length]; }
    if (['ArrowLeft', 'ArrowUp', 'a', 'w'].includes(e.key)) { e.preventDefault(); const j = free.indexOf(sel); sel = free[(j <= 0 ? free.length : j) - 1]; }
    if ((e.key === 'Enter' || e.key === ' ') ) { e.preventDefault(); if (!free.includes(sel)) sel = free[0]; else { build(PLOTS[sel]); sel = free.find(i => i !== sel) ?? -1; } }
  });
  function reset() { houses = []; people = []; boats = []; fx = []; ended = 0; hint = 1; T = 0; PLOTS.forEach(p => p.house = null); }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    houses.forEach(h => h.t += dt);
    update(dt); draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.__cove = { build: i => build(PLOTS[i]), get state() { return { houses: houses.length, people: people.length, ended }; } };
})();
