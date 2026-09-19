// 商隊原型：一小隊人往右走，玩家只決定岔路與紮營，事件由需求規則長出來
(() => {
  'use strict';
  const W = 240, H = 110, GROUND = 84;
  const cv = document.getElementById('c'), g = cv.getContext('2d');
  cv.width = W; cv.height = H;
  let S = 1;
  function fit() {
    S = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    cv.style.width = W * S + 'px'; cv.style.height = H * S + 'px';
    cv.style.left = ((innerWidth - W * S) >> 1) + 'px'; cv.style.top = ((innerHeight - H * S) >> 1) + 'px';
  }
  addEventListener('resize', fit); fit();

  // Sweetie 16 色盤
  const C = { dark: '#1a1c2c', purple: '#5d275d', red: '#b13e53', orange: '#ef7d57', yellow: '#ffcd75', lgreen: '#a7f070', green: '#38b764', dgreen: '#257179', navy: '#29366f', blue: '#3b5dc9', lblue: '#41a6f6', cyan: '#73eff7', white: '#f4f4f4', lgray: '#94b0c2', gray: '#566c86', dgray: '#333c57', wood: '#8b5a2b', skin: '#f2c49b', skin2: '#c68642', pants: '#333c57' };
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const rnd = Math.random, pick = a => a[(rnd() * a.length) | 0], clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // 地形：速度、疲勞倍率、生病機率、撿到東西機率
  const TERR = {
    grass:  { ground: C.green,  top: C.lgreen, spd: 1.0, fat: 1.0, sick: 0.2, find: 0.6, prop: 'bush' },
    forest: { ground: C.dgreen, top: C.green,  spd: 0.8, fat: 1.1, sick: 0.4, find: 1.6, prop: 'tree' },
    hills:  { ground: C.gray,   top: C.lgray,  spd: 0.7, fat: 1.9, sick: 0.2, find: 0.3, prop: 'rock' },
    swamp:  { ground: C.purple, top: C.dgreen, spd: 0.75, fat: 1.3, sick: 2.2, find: 1.0, prop: 'reed' },
    desert: { ground: C.orange, top: C.yellow, spd: 1.1, fat: 1.4, sick: 0.3, find: 0.1, prop: 'cactus', hunger: 1.8 },
  };
  const TKEYS = Object.keys(TERR);
  const SEG = 700, NSEG = 8, TOTAL = SEG * NSEG;   // 世界長度（像素）
  const DAY = 90;                                  // 一天幾秒（遊戲時間）
  const LOOKS = [
    { kind: 'strawhat', shirt: C.lblue, hair: C.wood, skin: C.skin },
    { kind: 'spiky', shirt: C.red, hair: C.dark, skin: C.skin2 },
    { kind: 'longhair', shirt: C.yellow, hair: C.orange, skin: C.skin },
    { kind: 'elder', shirt: C.gray, hair: C.white, skin: C.skin },
    { kind: 'headband', shirt: C.green, hair: C.dark, skin: C.skin2 },
    { kind: 'child', shirt: C.purple, hair: C.wood, skin: C.skin, child: true },
  ];

  let st;
  function newGame() {
    const segs = [{ t: 'grass' }];
    const party = LOOKS.map((L, i) => ({
      id: i, L, x: 60 - i * 12, hp: 100, fat: 10, hun: 10, mood: 70 + rnd() * 20,
      sick: false, state: 'walk', stT: 0, carriedBy: null, carrying: null, walkPh: rnd() * 2,
      rel: LOOKS.map(() => (rnd() * 0.8 - 0.3)), fightT: 0, heartT: 0, bangT: 0, gone: false, dead: false,
      tough: L.kind === 'elder' ? 0.7 : L.child ? 0.8 : 1 + rnd() * 0.2,
    }));
    st = { segs, party, time: DAY * 0.3, day: 1, food: 16, herb: 0, camp: false, campT: 0, fast: 1,
      items: [], graves: [], fx: [], cam: 0, over: null, overT: 0, stopT: 0, fire: 0 };
    makeFork(1);
  }
  // 在第 i 段的起點放岔路；兩個選項地形不同
  function makeFork(i) {
    if (i >= NSEG) return;
    let a = pick(TKEYS), b = pick(TKEYS); while (b === a) b = pick(TKEYS);
    st.fork = { i, x: i * SEG, a, b, chosen: null };
  }
  const segAt = x => st.segs[clamp(Math.floor(x / SEG), 0, st.segs.length - 1)];
  const terrAt = x => TERR[segAt(x).t];
  const alive = () => st.party.filter(p => !p.dead && !p.gone);
  const night = () => { const h = (st.time % DAY) / DAY; return h > 0.72 || h < 0.18; };
  const darkness = () => { const h = (st.time % DAY) / DAY; if (h > 0.8 || h < 0.12) return 1; if (h > 0.72) return (h - 0.72) / 0.08; if (h < 0.18) return 1 - (h - 0.12) / 0.06; return 0; };
  function pop(x, y, icon) { st.fx.push({ x, y, icon, t: 0 }); }

  // ── 規則 ─────────────────────────────────────────
  function step(dt) {
    if (st.over) { st.overT += dt; return; }
    st.time += dt * (st.camp ? 4 : 1);
    const was = st.day; st.day = 1 + Math.floor(st.time / DAY);
    const ppl = alive();
    if (!ppl.length) { st.over = 'dead'; return; }
    const lead = Math.max(...ppl.map(p => p.x));
    if (st.camp) { campStep(dt, ppl); if (st.day !== was && (st.time % DAY) / DAY > 0.2) {} return; }

    // 岔路：沒選就停在路牌前等
    const f = st.fork;
    let blocked = st.stopT > 0;
    st.stopT = Math.max(0, st.stopT - dt);
    if (f && !f.chosen && lead >= f.x - 14) blocked = true;
    if (f && f.chosen && lead >= f.x) { st.segs[f.i] = { t: f.chosen }; makeFork(f.i + 1); }
    // 有人倒下沒人背：全隊停
    const down = ppl.filter(p => p.state === 'down' && !p.carriedBy);
    if (down.length) blocked = true;

    const nt = night();
    for (const p of ppl) {
      const T = terrAt(p.x);
      const moving = !blocked && p.state === 'walk';
      // 需求
      p.hun += dt * 0.3 * (T.hunger || 1);
      if (moving) p.fat += dt * 0.55 * T.fat * (nt ? 1.8 : 1) * (p.carrying ? 2.2 : 1) / p.tough * (p.sick ? 1.5 : 1);
      else if (p.state !== 'carried') p.fat = Math.max(0, p.fat - dt * 0.6);
      if (p.hun > 100) { p.hp -= dt * 0.35; p.hun = 100; }
      if (p.sick) p.hp -= dt * (moving ? 0.3 : 0.12);
      if (p.fat > 95 && p.state === 'walk') collapse(p, ppl);
      if (p.state === 'down' && p.fat < 45 && !p.carriedBy) p.state = 'walk';
      // 生病：沼澤、夜路、累、餓會疊
      if (!p.sick && rnd() < dt * 0.002 * T.sick * (p.fat > 70 ? 2 : 1) * (p.hun > 70 ? 2 : 1) * (nt ? 1.6 : 1) / p.tough) {
        p.sick = true; pop(p.x, GROUND - 22, 'sick');
      }
      // 心情
      let dm = 0;
      if (p.fat > 70) dm -= 0.25; if (p.hun > 65) dm -= 0.3; if (p.sick) dm -= 0.2;
      if (p.fat < 40 && p.hun < 40) dm += 0.15;
      p.mood = clamp(p.mood + dm * dt, 0, 100);
      p.fightT = Math.max(0, p.fightT - dt); p.heartT = Math.max(0, p.heartT - dt); p.bangT = Math.max(0, p.bangT - dt);
      if (moving) { p.x += dt * 7 * T.spd * (p.fat > 75 ? 0.75 : 1); p.walkPh += dt * 5; }
      if (p.hp <= 0) die(p);
    }
    // 走路距離維持：後面的不要超過前面的
    const order = alive().filter(p => p.state === 'walk').sort((a, b) => b.x - a.x);
    for (let i = 1; i < order.length; i++) if (order[i].x > order[i - 1].x - 9) order[i].x = order[i - 1].x - 9;
    if (f && !f.chosen) for (const p of order) p.x = Math.min(p.x, f.x - 14);
    for (const p of alive()) {
      if (p.state === 'carried' && p.carriedBy) p.x = p.carriedBy.x;
      if (p.state === 'down' && !p.carriedBy) { /* 原地 */ }
    }
    // 吵架：心情差、關係差、走在隔壁
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i], b = order[i + 1];
      if (a.fightT || b.fightT) continue;
      const tension = (60 - a.mood) + (60 - b.mood) - (a.rel[b.id] + b.rel[a.id]) * 40;
      if (tension > 50 && rnd() < dt * 0.004 * tension / 50) {
        a.fightT = b.fightT = 3; st.stopT = Math.max(st.stopT, 2.5);
        a.rel[b.id] -= 0.3; b.rel[a.id] -= 0.3; a.mood -= 8; b.mood -= 8;
        for (const o of alive()) if (o !== a && o !== b) o.mood -= 3;
      }
    }
    // 撿東西
    if (!blocked && rnd() < dt * 0.035 * terrAt(lead).find) {
      st.items.push({ x: lead + 60 + rnd() * 40, kind: rnd() < 0.55 ? 'berry' : rnd() < 0.6 ? 'herb' : 'shiny' });
    }
    for (const it of st.items) {
      if (it.taken) continue;
      const p = alive().find(p => p.state === 'walk' && Math.abs(p.x - it.x) < 3);
      if (!p) continue;
      it.taken = true;
      if (it.kind === 'berry') {
        if (p.hun > 75) { // 餓的人自己偷吃，後面看到的人會記仇
          p.hun = 0; pop(p.x, GROUND - 22, 'munch');
          for (const o of alive()) if (o !== p && o.x < p.x && p.x - o.x < 30) { o.rel[p.id] -= 0.25; o.bangT = 2; }
        } else { st.food += 3; pop(p.x, GROUND - 22, 'berry'); p.mood += 4; }
      } else if (it.kind === 'herb') {
        const s = alive().filter(o => o.sick).sort((a, b) => a.hp - b.hp)[0];
        if (s && p.rel[s.id] > -0.2) { s.sick = false; s.rel[p.id] += 0.35; s.heartT = 3; pop(p.x, GROUND - 22, 'herb'); }
        else { st.herb++; pop(p.x, GROUND - 22, 'herb'); }
      } else { p.mood = clamp(p.mood + 20, 0, 100); pop(p.x, GROUND - 22, 'shiny'); }
    }
    st.items = st.items.filter(it => !it.taken && it.x > st.cam - 20);
    if (lead >= TOTAL) st.over = 'win';
  }
  function collapse(p, ppl) {
    p.state = 'down'; pop(p.x, GROUND - 16, 'drop');
    // 最親、還有力氣的人去背
    const c = ppl.filter(o => o !== p && o.state === 'walk' && !o.carrying && o.fat < 60 && o.rel[p.id] > 0.1)
      .sort((a, b) => b.rel[p.id] - a.rel[p.id])[0];
    if (c) { c.carrying = p; p.carriedBy = c; p.state = 'carried'; c.heartT = 3; p.rel[c.id] += 0.3; }
    else for (const o of ppl) if (o !== p) o.mood -= 4;
  }
  function drop(p) {
    if (p.carrying) { const q = p.carrying; q.carriedBy = null; q.state = 'down'; q.x = p.x - 4; p.carrying = null; }
  }
  function die(p) {
    drop(p); if (p.carriedBy) { p.carriedBy.carrying = null; p.carriedBy = null; }
    p.dead = true; st.graves.push({ x: p.x, L: p.L });
    st.stopT = 4;
    for (const o of alive()) o.mood -= 20 + Math.max(0, o.rel[p.id]) * 30;
  }

  // ── 紮營 ─────────────────────────────────────────
  function startCamp() {
    if (st.over || st.camp) return;
    const ppl = alive();
    st.camp = true; st.campT = 0; st.campX = Math.max(...ppl.map(p => p.x)) - 20;
    for (const p of ppl) { drop(p); if (p.state === 'carried') p.state = 'down'; p.carriedBy = null; }
    // 圍著火坐
    ppl.forEach((p, i) => { p.seat = st.campX + (i - (ppl.length - 1) / 2) * 11; p.state = 'sit'; });
    st.ate = false; st.nightDone = false;
  }
  function endCamp() {
    st.camp = false;
    const ppl = alive().sort((a, b) => a.seat - b.seat);
    ppl.forEach((p, i) => { p.x = st.campX + 20 - (ppl.length - 1 - i) * 0 - i * 0; p.state = p.fat > 90 ? 'down' : 'walk'; });
    ppl.sort((a, b) => b.mood - a.mood).forEach((p, i) => p.x = st.campX + 20 - i * 10);
  }
  function campStep(dt, ppl) {
    st.campT += dt; st.fire += dt;
    for (const p of ppl) {
      p.x += (p.seat - p.x) * Math.min(1, dt * 3);
      p.fat = Math.max(0, p.fat - dt * 4.5 * (st.campT > 2 ? 1 : 0));
      p.hun += dt * 0.3;
      if (p.sick) { p.hp -= dt * 0.08; if (rnd() < dt * 0.04) { p.sick = false; p.heartT = 2; } }
      else if (p.hp < 100) p.hp = Math.min(100, p.hp + dt * 0.4);
      p.fightT = Math.max(0, p.fightT - dt); p.heartT = Math.max(0, p.heartT - dt); p.bangT = Math.max(0, p.bangT - dt);
      if (p.hp <= 0) die(p);
    }
    // 開飯：依心情與關係分，餓的人先吃；不夠就有人沒得吃
    if (!st.ate && st.campT > 1.5) {
      st.ate = true;
      const order = ppl.slice().sort((a, b) => b.hun - a.hun);
      for (const p of order) {
        if (st.food > 0) { st.food--; p.hun = Math.max(0, p.hun - 70); p.mood += 10; pop(p.x, GROUND - 22, 'berry'); }
        else { p.mood -= 15; pop(p.x, GROUND - 22, 'empty'); for (const o of ppl) if (o !== p && o.hun < 30) p.rel[o.id] -= 0.2; }
      }
      if (st.herb) { const s = ppl.find(p => p.sick); if (s) { s.sick = false; st.herb--; s.heartT = 3; pop(s.x, GROUND - 22, 'herb'); } }
      // 生病會傳給旁邊的人
      for (const p of ppl) if (p.sick) for (const o of ppl) if (!o.sick && Math.abs(o.seat - p.seat) < 12 && rnd() < 0.25) { o.sick = true; pop(o.x, GROUND - 22, 'sick'); }
      // 火邊聊天：心情好的兩個人關係變好
      for (const a of ppl) for (const b of ppl) if (a.id < b.id && a.mood > 50 && b.mood > 50 && rnd() < 0.3) { a.rel[b.id] += 0.2; b.rel[a.id] += 0.2; a.heartT = b.heartT = 2; }
    }
    // 半夜：最討厭隊伍的人可能離隊
    if (!st.nightDone && st.campT > 4) {
      st.nightDone = true;
      for (const p of ppl) {
        const avg = ppl.reduce((s, o) => s + (o === p ? 0 : p.rel[o.id]), 0) / Math.max(1, ppl.length - 1);
        if (p.mood < 25 && avg < -0.2 && rnd() < 0.6) { p.gone = true; p.leaveX = p.x; st.leavers = st.leavers || []; st.leavers.push({ x: p.x, L: p.L, t: 0 }); for (const o of ppl) if (o !== p) o.mood -= 8; break; }
      }
      for (const p of ppl) if (!p.gone && p.fightT === 0) for (const o of ppl) if (o !== p && p.rel[o.id] < -0.5 && rnd() < 0.3) { p.fightT = o.fightT = 3; p.mood -= 5; o.mood -= 5; break; }
    }
    const h = (st.time % DAY) / DAY;
    if (st.campT > 6 && h > 0.22 && h < 0.3) endCamp(); // 天亮自動出發
  }

  // ── 輸入 ─────────────────────────────────────────
  const BTN_CAMP = { x: W - 22, y: H - 22, w: 18, h: 18 }, BTN_FAST = { x: 4, y: H - 22, w: 18, h: 18 };
  const inB = (b, x, y) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
  function choose(which) { const f = st.fork; if (f && !f.chosen && !st.over) f.chosen = which === 0 ? f.a : f.b; }
  function forkPanels() {
    const f = st.fork; if (!f || f.chosen) return null;
    const sx = f.x - st.cam; if (sx > W + 40) return null;
    return [{ x: W / 2 - 34, y: 24, w: 30, h: 22 }, { x: W / 2 + 4, y: 24, w: 30, h: 22 }];
  }
  function tap(x, y) {
    if (st.over) { if (st.overT > 1) newGame(); return; }
    if (inB(BTN_FAST, x, y)) { st.fast = st.fast === 1 ? 4 : 1; return; }
    if (inB(BTN_CAMP, x, y)) { st.camp ? endCamp() : startCamp(); return; }
    const fp = forkPanels();
    if (fp) { if (inB(fp[0], x, y)) return choose(0); if (inB(fp[1], x, y)) return choose(1); }
  }
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect();
    tap((e.clientX - r.left) / S, (e.clientY - r.top) / S); e.preventDefault();
  });
  addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'a' || e.key === 'w') choose(0);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'd' || e.key === 's') choose(1);
    else if (e.key === ' ' || e.key === 'c') { if (st.over) tap(0, 0); else st.camp ? endCamp() : startCamp(); }
    else if (e.key === 'f') st.fast = st.fast === 1 ? 4 : 1;
    e.preventDefault();
  });

  // ── 繪圖 ─────────────────────────────────────────
  let TT = 0;
  function drawPerson(p, x, y, pose) {
    const L = p.L, h = L.child ? 10 : 13, top = y - h;
    x = Math.round(x);
    if (pose === 'lying' || pose === 'grave') { // 躺著（頭在左）
      R(x - 7, y - 4, 14, 4, C.dark); R(x - 6, y - 3, 3, 3, pose === 'grave' ? C.lgray : L.skin); R(x - 3, y - 3, 8, 3, L.shirt); return;
    }
    const leg = pose === 'walk' ? (Math.floor(p.walkPh) % 2) : 0;
    const sit = pose === 'sit';
    const yy = sit ? y + 3 : y;
    R(x - 3, top - 1 + (sit ? 3 : 0), 7, h + 1 - (sit ? 3 : 0), C.dark);
    const hy = top + (sit ? 3 : 0);
    const skin = p.sick ? C.lgreen : p.fightT > 0 ? '#e43b44' : L.skin;
    R(x - 2, hy + 1, 5, 3, skin);
    R(x, hy + 2, 1, 1, C.dark); R(x + 2, hy + 2, 1, 1, C.dark);
    switch (L.kind) {
      case 'strawhat': R(x - 4, hy, 9, 1, C.yellow); R(x - 2, hy - 1, 5, 1, C.yellow); break;
      case 'spiky': R(x - 2, hy, 5, 1, L.hair); R(x, hy - 2, 1, 2, L.hair); R(x - 2, hy - 1, 1, 1, L.hair); R(x + 2, hy - 1, 1, 1, L.hair); break;
      case 'child': R(x - 2, hy, 5, 1, L.hair); R(x - 3, hy + 1, 1, 2, L.hair); R(x + 3, hy + 1, 1, 2, L.hair); break;
      case 'elder': R(x - 2, hy + 3, 5, 2, L.hair); R(x - 2, hy, 1, 2, L.hair); R(x + 2, hy, 1, 2, L.hair); break;
      case 'longhair': R(x - 2, hy, 5, 1, L.hair); R(x - 3, hy, 1, 5, L.hair); break;
      case 'headband': R(x - 2, hy, 5, 1, L.hair); R(x - 2, hy + 1, 5, 1, '#e43b44'); R(x - 3, hy + 1, 1, 2, '#e43b44'); break;
    }
    const by = hy + 4, bh = L.child ? 3 : 5;
    R(x - 2, by, 5, bh, L.shirt);
    const ly = by + bh, lh = yy - ly;
    if (lh > 0) { R(x - 2, ly, 2, lh - leg, C.pants); R(x + 1, ly, 2, lh - (1 - leg), C.pants); }
    if (p.fat > 75 && pose === 'walk') R(x - 1, hy + 3, 3, 1, C.dark); // 喘
    if (p.carrying) R(x - 3, by + 1, 7, 1, L.skin);
  }
  function icon(kind, x, y) {
    x = Math.round(x); y = Math.round(y);
    switch (kind) {
      case 'zzz': R(x, y, 3, 1, C.white); R(x + 1, y + 1, 1, 1, C.white); R(x, y + 2, 3, 1, C.white); break;
      case 'sweat': R(x + 1, y, 1, 1, C.lblue); R(x, y + 1, 3, 2, C.lblue); break;
      case 'sick': R(x, y, 5, 5, C.dark); R(x + 1, y + 1, 3, 3, C.lgreen); R(x + 1, y + 2, 1, 1, C.dark); R(x + 3, y + 2, 1, 1, C.dark); break;
      case 'hungry': R(x, y + 2, 5, 3, C.dark); R(x + 1, y + 2, 3, 2, C.lgray); break;
      case 'anger': R(x, y, 1, 2, C.white); R(x + 2, y, 1, 2, C.white); R(x, y + 3, 1, 1, C.white); R(x + 2, y + 3, 1, 1, C.white); R(x + 4, y + 1, 1, 3, '#e43b44'); break;
      case 'heart': R(x, y, 2, 2, '#e43b44'); R(x + 3, y, 2, 2, '#e43b44'); R(x, y + 1, 5, 2, '#e43b44'); R(x + 1, y + 3, 3, 1, '#e43b44'); R(x + 2, y + 4, 1, 1, '#e43b44'); break;
      case 'bang': R(x + 1, y, 2, 3, C.yellow); R(x + 1, y + 4, 2, 1, C.yellow); break;
      case 'berry': R(x, y + 1, 3, 3, '#e43b44'); R(x + 2, y + 2, 3, 3, C.red); R(x + 2, y, 1, 1, C.green); break;
      case 'herb': R(x + 2, y, 1, 5, C.green); R(x, y + 1, 2, 2, C.lgreen); R(x + 3, y + 2, 2, 2, C.lgreen); break;
      case 'shiny': R(x + 2, y, 1, 5, C.yellow); R(x, y + 2, 5, 1, C.yellow); R(x + 2, y + 2, 1, 1, C.white); break;
      case 'munch': icon('berry', x, y); R(x + 3, y, 2, 2, C.dark); break;
      case 'empty': R(x, y + 2, 5, 3, C.dark); R(x + 1, y + 2, 3, 2, C.lgray); R(x + 6, y, 1, 3, '#e43b44'); R(x + 6, y + 4, 1, 1, '#e43b44'); break;
      case 'drop': R(x, y, 5, 1, C.white); R(x + 2, y + 1, 1, 3, C.white); break;
    }
  }
  function drawTerrIcon(t, x, y) {
    const T = TERR[t];
    R(x, y + 9, 20, 5, T.ground); R(x, y + 9, 20, 1, T.top);
    propAt(T.prop, x + 10, y + 10, 1);
  }
  function propAt(kind, x, y, big) {
    switch (kind) {
      case 'tree': R(x - 1, y - 4, 2, 4, C.wood); R(x - 4, y - 11, 8, 7, C.dgreen); R(x - 3, y - 10, 6, 3, C.green); break;
      case 'bush': R(x - 3, y - 3, 6, 3, C.green); R(x - 2, y - 4, 3, 1, C.lgreen); break;
      case 'rock': R(x - 4, y - 5, 8, 5, C.dgray); R(x - 3, y - 5, 4, 2, C.gray); break;
      case 'reed': R(x - 2, y - 7, 1, 7, C.green); R(x, y - 9, 1, 9, C.dgreen); R(x + 2, y - 6, 1, 6, C.green); R(x, y - 10, 1, 2, C.wood); break;
      case 'cactus': R(x - 1, y - 9, 3, 9, C.green); R(x - 4, y - 6, 3, 1, C.green); R(x - 4, y - 8, 1, 3, C.green); R(x + 2, y - 5, 2, 1, C.green); R(x + 3, y - 7, 1, 3, C.green); break;
    }
  }
  const hash = n => { n = (n * 374761393) ^ (n >>> 13); n = Math.imul(n, 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

  function draw() {
    TT += 1 / 60;
    const ppl = alive();
    const lead = ppl.length ? Math.max(...ppl.map(p => p.x)) : st.cam + 140;
    const target = lead - 140;
    st.cam += (target - st.cam) * 0.08;
    const cam = Math.round(st.cam), dk = darkness();
    // 天空
    const skyTop = dk > 0.5 ? C.dark : C.lblue, skyBot = dk > 0.5 ? C.navy : C.cyan;
    R(0, 0, W, H, skyTop); R(0, 40, W, 30, skyBot);
    const h = (st.time % DAY) / DAY;
    const sunX = ((h * 2 + 0.2) % 1) * W; R(sunX, 10 + Math.abs(0.5 - ((h * 2 + 0.2) % 1)) * 30, 6, 6, dk > 0.5 ? C.white : C.yellow);
    // 遠山（視差）
    for (let i = -1; i < 12; i++) { const bx = i * 40 - ((cam * 0.3) % 40); const hh = 12 + hash(i + Math.floor(cam * 0.3 / 40)) * 18; R(bx, GROUND - hh - 4, 40, hh + 4, dk > 0.5 ? C.dgray : C.gray); }
    // 地面（依段）
    for (let sx = 0; sx < W; sx += 4) {
      const wx = sx + cam, T = terrAt(wx);
      R(sx, GROUND, 4, H - GROUND, T.ground); R(sx, GROUND, 4, 1, T.top);
    }
    // 道具
    for (let k = Math.floor(cam / 23) - 1; k < (cam + W) / 23 + 1; k++) {
      if (hash(k * 7 + 3) < 0.5) continue;
      const wx = k * 23 + hash(k) * 10;
      propAt(terrAt(wx).prop, wx - cam, GROUND - 1 - Math.floor(hash(k * 3) * 4), 1);
    }
    // 岔路牌
    const f = st.fork;
    if (f) { const sx = f.x - cam; R(sx, GROUND - 16, 2, 16, C.wood); R(sx - 6, GROUND - 16, 14, 4, C.wood); if (f.chosen) drawTerrIcon(f.chosen, sx - 9, GROUND - 36); }
    // 終點城鎮
    const tx = TOTAL - cam;
    if (tx < W + 60) { for (let i = 0; i < 4; i++) { R(tx + i * 14, GROUND - 18 - (i % 2) * 6, 12, 18 + (i % 2) * 6, C.lgray); R(tx + i * 14, GROUND - 22 - (i % 2) * 6, 12, 4, C.red); R(tx + i * 14 + 4, GROUND - 8, 4, 8, C.dark); } R(tx - 2, GROUND - 34, 1, 14, C.dark); R(tx - 1, GROUND - 34, 6, 4, C.yellow); }
    // 墳、東西
    for (const gr of st.graves) { const sx = gr.x - cam; R(sx - 3, GROUND - 3, 7, 3, C.wood); R(sx, GROUND - 12, 1, 9, C.lgray); R(sx - 2, GROUND - 10, 5, 1, C.lgray); }
    for (const it of st.items) if (!it.taken) icon(it.kind, it.x - cam - 2, GROUND - 6 + (Math.floor(TT * 3) % 2));
    // 營火
    if (st.camp) { const sx = st.campX - cam; R(sx - 12, GROUND - 14, 1, 14, C.wood); R(sx - 16, GROUND - 14, 9, 1, C.lgray); R(sx - 3, GROUND - 2, 7, 2, C.wood); const k = Math.floor(TT * 8) % 2; R(sx - 1, GROUND - 6 - k, 3, 4 + k, C.orange); R(sx, GROUND - 5, 1, 2, C.yellow); }
    // 離隊的人往回走
    for (const lv of (st.leavers || [])) { lv.t += 1 / 60; lv.x -= 0.25; drawPerson({ L: lv.L, walkPh: lv.t * 5, fat: 0 }, lv.x - cam, GROUND, 'walk'); }
    st.leavers = (st.leavers || []).filter(l => l.t < 12);
    // 小人
    for (const p of ppl.slice().sort((a, b) => (a.carrying ? 1 : 0) - (b.carrying ? 1 : 0))) {
      const sx = p.x - cam;
      if (p.state === 'carried') { R(sx - 5, GROUND - 16, 10, 4, C.dark); R(sx - 4, GROUND - 15, 3, 3, p.L.skin); R(sx - 1, GROUND - 15, 6, 2, p.L.shirt); continue; }
      const blocked = st.over || st.stopT > 0 || (f && !f.chosen && lead >= f.x - 14);
      const pose = p.state === 'down' ? 'lying' : p.state === 'sit' ? 'sit' : blocked ? 'stand' : 'walk';
      drawPerson(p, sx, GROUND, pose);
      // 頭上狀態圖示（最重要的一個）
      const iy = GROUND - (p.L.child ? 18 : 21) - (p.state === 'down' ? -10 : 0) + (pose === 'sit' ? 3 : 0);
      const ic = p.fightT > 0 ? 'anger' : p.heartT > 0 ? 'heart' : p.bangT > 0 ? 'bang' : p.sick ? 'sick' : p.state === 'down' || p.fat > 85 ? 'zzz' : p.hun > 75 ? 'hungry' : p.fat > 65 ? 'sweat' : null;
      if (ic) icon(ic, sx - 2, iy - (Math.floor(TT * 2) % 2));
    }
    // 吵架的灰塵
    for (const p of ppl) if (p.fightT > 0 && p.state !== 'sit') { const k = Math.floor(TT * 8) % 3; R(p.x - cam - 4 + k * 2, GROUND - 6 - k, 2, 2, C.white); }
    // 夜晚
    if (dk > 0) { g.globalAlpha = dk * 0.55; R(0, 0, W, H, C.dark); g.globalAlpha = 1; if (st.camp) { g.globalAlpha = 0.15 + 0.05 * (Math.floor(TT * 6) % 2); g.fillStyle = C.orange; g.beginPath(); g.arc(st.campX - cam, GROUND, 34, 0, 7); g.fill(); g.globalAlpha = 1; } }
    // 飄字圖示
    for (const e of st.fx) { e.t += 1 / 60; icon(e.icon, e.x - cam - 2, e.y - e.t * 6); }
    st.fx = st.fx.filter(e => e.t < 1.5);
    hud(lead);
  }
  function hud(lead) {
    // 進度線
    R(80, 4, W - 110, 1, C.white);
    for (let i = 1; i < NSEG; i++) R(80 + (W - 110) * i / NSEG, 3, 1, 3, C.lgray);
    R(W - 31, 1, 4, 3, C.yellow); R(W - 31, 1, 1, 6, C.dark);
    R(80 + (W - 110) * clamp(lead / TOTAL, 0, 1) - 1, 2, 3, 5, C.red);
    // 天數：月亮圖示×天
    for (let i = 0; i < st.day - 1 && i < 18; i++) R(4 + i * 4, 3, 2, 3, C.lgray);
    // 食物
    for (let i = 0; i < Math.min(st.food, 12); i++) icon('berry', 4 + i * 6, 10);
    if (st.food === 0) icon('empty', 4, 10);
    for (let i = 0; i < st.herb; i++) icon('herb', 4 + i * 6, 17);
    // 隊員頭像＋血量
    st.party.forEach((p, i) => {
      const x = W - 6 - (st.party.length - i) * 11, y = 10;
      R(x, y, 9, 9, C.dark);
      if (!p.dead && !p.gone) { R(x + 2, y + 3, 5, 4, p.sick ? C.lgreen : p.L.skin); R(x + 2, y + 2, 5, 1, p.L.hair === C.white ? C.white : p.L.kind === 'strawhat' ? C.yellow : p.L.hair); R(x + 3, y + 4, 1, 1, C.dark); R(x + 5, y + 4, 1, 1, C.dark); R(x + 1, y + 7, 7, 2, p.L.shirt);
        R(x, y + 10, 9, 2, C.dark); R(x, y + 10, Math.ceil(9 * clamp(p.hp, 0, 100) / 100), 2, p.hp > 40 ? C.lgreen : C.red); }
      else if (p.dead) { R(x + 4, y + 1, 1, 7, C.lgray); R(x + 2, y + 3, 5, 1, C.lgray); }
      else { R(x + 2, y + 4, 5, 1, C.gray); R(x + 2, y + 3, 1, 3, C.gray); } // 離隊：箭頭往左
    });
    // 岔路選擇面板
    const fp = forkPanels();
    if (fp) {
      const blink = Math.floor(TT * 3) % 2;
      [st.fork.a, st.fork.b].forEach((t, i) => {
        const b = fp[i]; R(b.x, b.y, b.w, b.h, C.dark); R(b.x + 1, b.y + 1, b.w - 2, b.h - 2, blink && lead >= st.fork.x - 16 ? C.gray : C.dgray);
        drawTerrIcon(t, b.x + 5, b.y + 3);
        // 箭頭方向
        if (i === 0) { R(b.x + 2, b.y + 3, 1, 3, C.white); R(b.x + 1, b.y + 4, 3, 1, C.white); } else { R(b.x + b.w - 3, b.y + 3, 1, 3, C.white); R(b.x + b.w - 4, b.y + 4, 3, 1, C.white); }
      });
    }
    // 按鈕：快轉、紮營
    let b = BTN_FAST; R(b.x, b.y, b.w, b.h, C.dark); R(b.x + 1, b.y + 1, b.w - 2, b.h - 2, st.fast > 1 ? C.orange : C.dgray);
    for (let k = 0; k < 2; k++) for (let j = 0; j < 4; j++) R(b.x + 4 + k * 5 + j, b.y + 5 + j, 1, 8 - j * 2, C.white);
    b = BTN_CAMP; R(b.x, b.y, b.w, b.h, C.dark); R(b.x + 1, b.y + 1, b.w - 2, b.h - 2, st.camp ? C.orange : C.dgray);
    if (st.camp) { for (let j = 0; j < 4; j++) R(b.x + 6 + j, b.y + 5 + j, 1, 8 - j * 2, C.white); }
    else for (let j = 0; j < 6; j++) R(b.x + 9 - j, b.y + 5 + j, 1 + j * 2, 1, C.yellow);
    // 結局
    if (st.over) {
      g.globalAlpha = 0.7; R(0, 0, W, H, C.dark); g.globalAlpha = 1;
      if (st.over === 'win') { R(W / 2 - 10, 26, 1, 16, C.white); R(W / 2 - 9, 26, 10, 6, C.yellow); }
      else { R(W / 2, 24, 1, 18, C.lgray); R(W / 2 - 4, 28, 9, 1, C.lgray); }
      st.party.forEach((p, i) => { const x = W / 2 - st.party.length * 9 + i * 18 + 9; drawPerson(p, x, 70, p.dead ? 'grave' : p.gone ? 'lying' : 'stand'); if (p.gone) icon('anger', x - 2, 58); if (p.dead) R(x - 1, 54, 1, 6, C.lgray); });
      R(W / 2 - 2, 84, 3, 5, C.white); for (let j = 0; j < 3; j++) R(W / 2 + 1 + j, 85 + j, 1, 5 - j * 2, C.white);
    }
    // 開場一行提示
    if (st.time < DAY * 0.3 + 6 && !st.over) { g.fillStyle = C.white; g.font = '8px sans-serif'; g.fillText('岔路點方向・⛺紮營', 64, 102); }
  }

  newGame();
  let last = performance.now();
  function loop(now) {
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    const n = st.fast;
    for (let i = 0; i < n; i++) step(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.__st = () => st; window.__camp = () => startCamp();
})();
