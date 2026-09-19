// folk：一小塊地上六個小人自己過日子。畫面上不放任何文字。
'use strict';
(function () {
  const Q = new URLSearchParams(location.search);
  const SEED = parseInt(Q.get('seed') || '1', 10) || 1;
  const PLAIN = Q.get('plain') === '1';
  const FAST = Math.max(0.1, parseFloat(Q.get('fast') || '1') || 1);

  // ---- 固定種子亂數（mulberry32）----
  let rs = SEED >>> 0;
  function rnd() {
    rs = (rs + 0x6D2B79F5) >>> 0;
    let t = rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr = (a, b) => a + rnd() * (b - a);

  // ---- 版面（邏輯像素）----
  const W = 210, H = 96;
  const cv = document.getElementById('c');
  const g = cv.getContext('2d');
  cv.width = W; cv.height = H;
  function fit() {
    const s = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
  }
  addEventListener('resize', fit); fit();

  const HOUSE = { x: 6, y: 8, w: 40, h: 30 };        // 房子（有床）
  const BEDS = [[11, 14], [19, 14], [27, 14], [35, 14], [11, 26], [19, 26]];
  const SHED = { x: 58, y: 10, w: 20, h: 14 };        // 倉庫
  const WELL = { x: 100, y: 44 };
  const FIRE = { x: 70, y: 66 };
  const FIELD = { x: 112, y: 58, cols: 8, rows: 3, cw: 10, ch: 10 };
  const TREES = [];
  for (let i = 0; i < 7; i++) TREES.push({ x: 150 + i * 8 + (i % 2) * 2, y: 10 + (i % 3) * 8, hp: 1, regrow: 0 });

  // ---- 世界狀態 ----
  let T = 0;
  let food = 3;          // 倉庫裡的食物
  let logs = 0;          // 木材堆
  let rain = 0;          // 剩餘下雨秒數
  let nextRain = rr(45, 80);
  const LOG = [];
  window.FOLK_LOG = LOG;
  function log(who, what) { LOG.push({ t: Math.round(T * 10) / 10, who: who.map(p => p.id), what }); }

  const crops = [];
  for (let r = 0; r < FIELD.rows; r++) for (let c = 0; c < FIELD.cols; c++)
    crops.push({ x: FIELD.x + c * FIELD.cw + 5, y: FIELD.y + r * FIELD.ch + 6, g: rr(0.1, 1.15), claim: null });

  // 每個小人外觀：衣服、頭髮、特徵
  const LOOKS = [
    { shirt: '#b13e53', hair: '#333c57', name: '紅衣', hat: null },
    { shirt: '#3b5dc9', hair: '#ef7d57', name: '藍衣', hat: null },
    { shirt: '#ffcd75', hair: '#1a1c2c', name: '黃衣', hat: '#a7f070' },
    { shirt: '#38b764', hair: '#f4f4f4', name: '綠衣白髮', hat: null },
    { shirt: '#8b3fa8', hair: '#ffcd75', name: '紫衣', hat: null },
    { shirt: '#f4f4f4', hair: '#5d275d', name: '白衣', hat: '#b13e53' },
  ];
  const folk = LOOKS.map((L, i) => ({
    id: i, look: L,
    x: rr(60, 140), y: rr(35, 55), tx: 0, ty: 0,
    hunger: rr(0.45, 1), energy: rr(0.55, 1),
    appetite: rr(0.022, 0.034), stamina: rr(0.008, 0.013),
    diligent: rnd() < 0.4,     // 勤勞的人下雨也不收工
    strength: rr(0.5, 1.5),
    speed: rr(11, 15),
    state: 'idle', timer: rr(0, 2), job: null,
    carry: null,               // 'food' | 'log'
    icon: null, iconT: 0,
    wet: 0, sick: 0, hurt: 0, starve: 0, dead: false,
    down: false,               // 躺著
    shake: 0, walkPh: 0, bed: BEDS[i], target: null,
    rel: [0, 0, 0, 0, 0, 0].map(() => rr(-0.2, 0.4)),
    cooldownTalk: rr(5, 15),
  }));
  folk.forEach(p => { p.tx = p.x; p.ty = p.y; });

  function show(p, icon, dur) { p.icon = icon; p.iconT = dur || 3; }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const inHouse = p => p.x > HOUSE.x && p.x < HOUSE.x + HOUSE.w && p.y > HOUSE.y && p.y < HOUSE.y + HOUSE.h;
  function goTo(p, x, y) { p.tx = x; p.ty = y; }
  function arrived(p) { return Math.hypot(p.tx - p.x, p.ty - p.y) < 1.2; }
  function bestFriend(p, filter) {
    let best = null, bv = -9;
    for (const o of folk) if (o !== p && !o.dead && (!filter || filter(o)) && p.rel[o.id] > bv) { bv = p.rel[o.id]; best = o; }
    return best;
  }
  function setState(p, s, t) { p.state = s; p.timer = t || 0; }

  // ---- 選擇下一件事 ----
  function decide(p) {
    p.target = null;
    if (p.sick > 0) { goTo(p, p.bed[0], p.bed[1]); return setState(p, 'toBedSick'); }
    if (p.hunger < 0.35) { goTo(p, SHED.x - 2 + p.id * 5, SHED.y + SHED.h + 3 + (p.id % 2) * 6); return setState(p, 'toEat'); }
    if (p.energy < 0.35) { goTo(p, p.bed[0], p.bed[1]); return setState(p, 'toSleep'); }
    if (rain > 0 && !p.diligent) { goTo(p, p.bed[0] + rr(-3, 3), p.bed[1] + 5); return setState(p, 'shelter', 4); }
    // 有病人沒人照顧 → 好朋友去送吃的
    for (const o of folk) {
      if (o !== p && !o.dead && (o.sick > 0 || o.state === 'hurtDown' || o.state === 'collapsed') && !o.helper && p.rel[o.id] > 0 && food > 0 && p.hurt <= 0) {
        o.helper = p; p.target = o;
        goTo(p, SHED.x - 2 + p.id * 5, SHED.y + SHED.h + 3 + (p.id % 2) * 6); return setState(p, 'fetchForFriend');
      }
    }
    if (p.hurt > 0) { goTo(p, FIRE.x + rr(-6, 6), FIRE.y + rr(-4, 4)); return setState(p, 'rest', rr(4, 7)); }
    const r = rnd();
    const ripe = crops.filter(c => c.g >= 1 && !c.claim);
    if (ripe.length && r < 0.6) {
      const c = ripe[Math.floor(rnd() * ripe.length)]; c.claim = p; p.job = c;
      goTo(p, c.x, c.y + 2); return setState(p, 'toCrop');
    }
    const trees = TREES.filter(t => t.hp > 0 && !t.claim);
    if (trees.length && r < 0.72) {
      const t = trees[Math.floor(rnd() * trees.length)]; t.claim = p; p.job = t;
      goTo(p, t.x - 4, t.y + 6); return setState(p, 'toTree');
    }
    if (r < 0.88) { goTo(p, WELL.x + rr(-8, 8), WELL.y + rr(4, 8)); return setState(p, 'loiter', rr(3, 6)); }
    goTo(p, FIRE.x + rr(-10, 10), FIRE.y + rr(-6, 6)); return setState(p, 'loiter', rr(3, 6));
  }

  function release(p) {
    if (p.job) { p.job.claim = null; p.job = null; }
  }

  function interruptToCollapse(p) {
    release(p);
    if (p.carry) { if (p.carry === 'food') dropFood(p); p.carry = null; }
    p.down = true; setState(p, 'collapsed', 0);
    show(p, 'dizzy', 99);
  }
  const drops = []; // 地上的食物
  function dropFood(p) { drops.push({ x: p.x + 3, y: p.y + 2 }); }

  // ---- 每一步 ----
  function step(dt) {
    T += dt;
    // 天氣
    if (rain > 0) { rain -= dt; if (rain <= 0) { log([], '雨停了'); nextRain = T + rr(50, 90); } }
    else if (T >= nextRain) { rain = rr(20, 30); log([], '開始下雨'); }
    // 作物生長（下雨長得快）
    for (const c of crops) if (c.g < 1) c.g = Math.min(1, c.g + dt * (rain > 0 ? 0.035 : 0.012));
    for (const t of TREES) if (t.hp <= 0) { t.regrow -= dt; if (t.regrow <= 0) t.hp = 1; }

    for (const p of folk) {
      if (p.dead) continue;
      p.iconT -= dt; if (p.iconT <= 0) p.icon = null;
      p.shake = Math.max(0, p.shake - dt);
      p.cooldownTalk -= dt;
      p.hunger = Math.max(0, p.hunger - p.appetite * dt * (p.state === 'chop' ? 1.6 : 1));
      const resting = p.state === 'sleep' || p.state === 'sickBed';
      p.energy = resting ? Math.min(1, p.energy + 0.08 * dt) : Math.max(0, p.energy - p.stamina * dt * (p.hurt > 0 ? 1.5 : 1));

      // 淋雨
      if (rain > 0 && !inHouse(p)) {
        p.wet += dt;
        if (p.wet > 10 && p.sick <= 0 && rnd() < 0.04 * dt) {
          p.sick = rr(25, 35); release(p); log([p], LOOKS[p.id].name + '淋雨太久生病了');
          show(p, 'sick', 99); if (p.state !== 'collapsed') decide(p);
        }
      } else p.wet = Math.max(0, p.wet - dt * 0.5);

      // 餓
      if (p.hunger <= 0) {
        p.starve += dt;
        if (p.starve > 25 && p.state !== 'collapsed') { log([p], LOOKS[p.id].name + '餓到昏倒在地上'); interruptToCollapse(p); }
        if (p.starve > 75) {
          p.dead = true; p.down = true; p.icon = null; release(p);
          if (p.helper) p.helper = null;
          log([p], LOOKS[p.id].name + '餓死了');
          const f = bestFriend(p); if (f && f.rel[p.id] > 0.1) { show(f, 'tear', 8); log([f, p], LOOKS[f.id].name + '為' + LOOKS[p.id].name + '難過'); }
          continue;
        }
      } else p.starve = 0;
      // 累倒
      if (p.energy <= 0 && p.state !== 'collapsed' && !resting) { log([p], LOOKS[p.id].name + '累到倒在半路'); interruptToCollapse(p); }

      tick(p, dt);

      // 移動
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      const moving = d > 0.6 && !p.down && p.shake <= 0;
      if (moving) {
        let sp = p.speed * (p.hurt > 0 ? 0.4 : 1) * (p.hunger <= 0 ? 0.6 : 1);
        const m = Math.min(d, sp * dt);
        p.x += dx / d * m; p.y += dy / d * m; p.walkPh += dt * 8;
      }
      p.moving = moving;
      if (p.hurt > 0) { p.hurt -= dt; if (p.hurt <= 0) { p.hurt = 0; log([p], LOOKS[p.id].name + '的傷好了'); } }
    }
    socialize(dt);
  }

  function tick(p, dt) {
    p.timer -= dt;
    switch (p.state) {
      case 'idle': if (p.timer <= 0) decide(p); break;
      case 'loiter': if (arrived(p) && p.timer <= 0) decide(p); break;
      case 'shelter': if (arrived(p) && (p.timer <= 0 && rain <= 0)) decide(p); break;
      case 'rest': if (arrived(p) && p.timer <= 0) decide(p); break;
      case 'toCrop':
        if (rain > 0 && !p.diligent && !p.eatOnField) { release(p); decide(p); break; }
        if (arrived(p)) setState(p, 'harvest', 2.5); break;
      case 'harvest':
        if (p.timer <= 0 && p.eatOnField) {
          p.job.g = 0; release(p); p.eatOnField = false; p.hunger = 1; p.starve = 0; p.sawEmpty = false;
          show(p, 'food', 2); log([p], LOOKS[p.id].name + '倉庫沒東西，直接到田裡摘來吃'); setState(p, 'eating', 2); break;
        }
        if (p.timer <= 0) { p.job.g = 0; release(p); p.carry = 'food'; goTo(p, SHED.x - 2 + p.id * 5, SHED.y + SHED.h + 3 + (p.id % 2) * 6); setState(p, 'deliver'); }
        break;
      case 'deliver':
        if (arrived(p)) {
          if (p.carry === 'food') food++;
          else if (p.carry === 'log') logs++;
          p.carry = null; decide(p);
        }
        break;
      case 'toTree':
        if (rain > 0 && !p.diligent) { release(p); decide(p); break; }
        if (arrived(p)) setState(p, 'chop', 4); break;
      case 'chop':
        if (p.timer <= 0) {
          const t = p.job; t.hp = 0; t.regrow = rr(60, 90); release(p);
          if (rnd() < 0.22) {
            p.hurt = rr(25, 35); p.down = true; setState(p, 'hurtDown', 5); show(p, 'hurt', 99);
            log([p], LOOKS[p.id].name + '砍樹時被倒下的樹壓傷');
          } else { p.carry = 'log'; goTo(p, SHED.x - 4, SHED.y + SHED.h + 2); setState(p, 'deliver'); }
        }
        break;
      case 'hurtDown':
        if (p.timer <= 0 && !p.helper) { p.down = false; show(p, 'hurt', 30); decide(p); }
        break;
      case 'toEat':
        if (arrived(p)) {
          if (food > 0) { food--; p.hunger = 1; p.starve = 0; show(p, 'food', 2); setState(p, 'eating', 2); }
          else {
            show(p, 'empty', 4);
            if (!p.sawEmpty) { log([p], LOOKS[p.id].name + '去倉庫拿吃的但倉庫是空的'); p.sawEmpty = true; }
            // 附近有人拿著食物 → 搶
            const holder = folk.find(o => o !== p && !o.dead && o.carry === 'food' && p.rel[o.id] < 0.3);
            const ground = drops[0];
            const ripe = crops.filter(c => c.g >= 1 && !c.claim);
            if (ground) { p.tx = ground.x; p.ty = ground.y; setState(p, 'toDrop'); }
            else if (ripe.length) {
              const c = ripe[Math.floor(rnd() * ripe.length)]; c.claim = p; p.job = c;
              goTo(p, c.x, c.y + 2); p.eatOnField = true; setState(p, 'toCrop');
            }
            else if (holder && p.energy > 0.1) { p.target = holder; setState(p, 'chase', 12); }
            else { goTo(p, FIELD.x + rr(0, 70), FIELD.y + rr(0, 25)); setState(p, 'search', rr(4, 7)); }
          }
        }
        break;
      case 'eating': if (p.timer <= 0) { p.sawEmpty = false; decide(p); } break;
      case 'toDrop':
        if (arrived(p)) {
          const i = drops.findIndex(d => Math.hypot(d.x - p.x, d.y - p.y) < 3);
          if (i >= 0) { drops.splice(i, 1); p.hunger = 1; p.starve = 0; show(p, 'food', 2); log([p], LOOKS[p.id].name + '撿起掉在地上的食物吃了'); }
          decide(p);
        }
        break;
      case 'search':
        if (arrived(p) && p.timer <= 0) { goTo(p, SHED.x - 2 + p.id * 5, SHED.y + SHED.h + 3 + (p.id % 2) * 6); setState(p, 'toEat'); }
        break;
      case 'chase': {
        const o = p.target;
        if (!o || o.dead || o.carry !== 'food' || p.timer <= 0) { decide(p); break; }
        goTo(p, o.x, o.y);
        if (dist(p, o) < 3) {
          // 打架
          p.shake = 2.5; o.shake = 2.5; o.tx = o.x; o.ty = o.y; p.tx = p.x; p.ty = p.y;
          show(p, 'angry', 5); show(o, 'angry', 5);
          p.rel[o.id] -= 0.6; o.rel[p.id] -= 0.6;
          const win = p.strength * rr(0.6, 1.4) > o.strength * rr(0.6, 1.4);
          if (win) {
            o.carry = null; p.hunger = 1; p.starve = 0;
            log([p, o], LOOKS[p.id].name + '餓壞了，搶走' + LOOKS[o.id].name + '手上的食物，兩人打了一架');
            o.state = 'deliver'; decide(o);
            o.shake = 2.5; o.tx = o.x; o.ty = o.y; show(o, 'angry', 5);
          } else {
            log([p, o], LOOKS[p.id].name + '想搶' + LOOKS[o.id].name + '的食物，打輸了');
            show(p, 'hurt', 6);
          }
          setState(p, 'idle', 3);
        }
        break;
      }
      case 'toSleep':
        if (arrived(p)) { p.down = true; setState(p, 'sleep'); show(p, 'sleep', 99); }
        break;
      case 'sleep':
        if (p.energy >= 1 || (p.hunger < 0.15)) { p.down = false; p.icon = null; decide(p); }
        break;
      case 'toBedSick':
        if (arrived(p)) { p.down = true; setState(p, 'sickBed'); }
        break;
      case 'sickBed':
        p.sick -= dt * (p.fed ? 2 : 1);
        if (p.sick <= 0) { p.sick = 0; p.fed = false; p.down = false; p.icon = null; p.helper = null; log([p], LOOKS[p.id].name + '病好了，起床'); decide(p); }
        break;
      case 'collapsed':
        p.energy = Math.min(1, p.energy + dt * 0.03); // 地上躺一下
        if (p.energy > 0.3 && p.starve < 25) { p.down = false; p.icon = null; p.helper = null; decide(p); }
        break;
      case 'fetchForFriend': {
        const o = p.target;
        const stillNeeds = o && !o.dead && (o.sick > 0 || o.state === 'hurtDown' || o.state === 'collapsed');
        if (!stillNeeds) { if (o && o.helper === p) o.helper = null; decide(p); break; }
        if (arrived(p)) {
          if (food > 0) { food--; p.carry = 'food'; goTo(p, o.x + 3, o.y); setState(p, 'bring'); }
          else { o.helper = null; show(p, 'empty', 3); decide(p); }
        }
        break;
      }
      case 'bring': {
        const o = p.target;
        if (!o || o.dead) { if (p.carry === 'food') { food++; p.carry = null; } decide(p); break; }
        goTo(p, o.x + 4, o.y);
        if (dist(p, o) < 5) {
          p.carry = null; o.hunger = 1; o.starve = 0; o.fed = true;
          if (o.state === 'hurtDown') o.timer = 0;
          if (o.state === 'collapsed') o.energy = Math.max(o.energy, 0.5);
          o.helper = null;
          show(p, 'heart', 4); show(o, 'heart', 4);
          p.rel[o.id] += 0.3; o.rel[p.id] += 0.5;
          const why = o.sick > 0 ? '生病' : o.state === 'hurtDown' ? '受傷' : '倒下';
          log([p, o], LOOKS[p.id].name + '拿食物去給' + why + '的' + LOOKS[o.id].name);
          setState(p, 'loiter', 3); p.tx = p.x; p.ty = p.y;
        }
        break;
      }
    }
  }

  // 閒著的兩人碰到會聊天：感情好 → 愛心；感情差 → 吵架
  function socialize() {
    for (let i = 0; i < folk.length; i++) for (let j = i + 1; j < folk.length; j++) {
      const a = folk[i], b = folk[j];
      if (a.dead || b.dead || a.down || b.down) continue;
      if (a.state !== 'loiter' || b.state !== 'loiter') continue;
      if (a.cooldownTalk > 0 || b.cooldownTalk > 0 || dist(a, b) > 10) continue;
      a.cooldownTalk = b.cooldownTalk = rr(15, 25);
      const r = (a.rel[b.id] + b.rel[a.id]) / 2;
      a.tx = a.x; a.ty = a.y; b.tx = b.x; b.ty = b.y;
      a.timer = b.timer = 3;
      if (r < -0.1) {
        show(a, 'angry', 3); show(b, 'angry', 3); a.shake = b.shake = 1.5;
        a.rel[b.id] -= 0.15; b.rel[a.id] -= 0.15;
        log([a, b], LOOKS[a.id].name + '和' + LOOKS[b.id].name + '碰面吵了起來');
      } else {
        const k = r > 0.3 ? 'heart' : 'note';
        show(a, k, 3); show(b, k, 3);
        a.rel[b.id] += 0.12; b.rel[a.id] += 0.12;
        log([a, b], LOOKS[a.id].name + '和' + LOOKS[b.id].name + (k === 'heart' ? '開心地聊天' : '閒聊'));
      }
    }
  }

  // ======== 畫圖 ========
  const C = { grass: '#38b764', grass2: '#257179', dirt: '#73463a', dirt2: '#5a3a2e', wall: '#566c86', floor: '#94b0c2',
    wood: '#8a5a3c', roof: '#333c57', water: '#41a6f6', skin: '#f2c89a', dark: '#1a1c2c', white: '#f4f4f4' };
  function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }

  // 草地雜點固定
  const tufts = []; { const s = rs; for (let i = 0; i < 140; i++) tufts.push([rr(0, W), rr(0, H)]); rs = s; }

  function drawWorld() {
    R(0, 0, W, H, C.grass);
    for (const [x, y] of tufts) R(x, y, 1, 1, '#2f9e57');
    // 房子
    R(HOUSE.x - 1, HOUSE.y - 1, HOUSE.w + 2, HOUSE.h + 2, C.dark);
    R(HOUSE.x, HOUSE.y, HOUSE.w, HOUSE.h, C.wall);
    R(HOUSE.x + 2, HOUSE.y + 2, HOUSE.w - 4, HOUSE.h - 4, C.floor);
    R(HOUSE.x + HOUSE.w - 2, HOUSE.y + 18, 2, 7, C.floor); // 門
    for (const [bx, by] of BEDS) { R(bx - 3, by - 3, 7, 9, C.wood); R(bx - 2, by - 2, 5, 3, C.white); R(bx - 2, by + 1, 5, 4, '#b13e53'); }
    // 倉庫：食物堆看得出多少
    R(SHED.x - 1, SHED.y - 1, SHED.w + 2, SHED.h + 2, C.dark);
    R(SHED.x, SHED.y, SHED.w, SHED.h, C.wood);
    R(SHED.x + 2, SHED.y + 2, SHED.w - 4, SHED.h - 4, '#5a3a2e');
    for (let i = 0; i < Math.min(food, 12); i++) R(SHED.x + 3 + (i % 6) * 2.5, SHED.y + 9 - Math.floor(i / 6) * 3, 2, 2, '#ef7d57');
    for (let i = 0; i < Math.min(logs, 8); i++) R(SHED.x - 7, SHED.y + 12 - i * 2, 5, 1, C.wood);
    // 井
    R(WELL.x - 4, WELL.y - 4, 9, 9, '#566c86'); R(WELL.x - 2, WELL.y - 2, 5, 5, C.water);
    // 營火
    R(FIRE.x - 3, FIRE.y + 1, 7, 2, C.wood);
    const fl = Math.floor(T * 6) % 2;
    if (rain <= 0) { R(FIRE.x - 1, FIRE.y - 2 + fl, 3, 3, '#ef7d57'); R(FIRE.x, FIRE.y - 3 + fl, 1, 2, '#ffcd75'); }
    else R(FIRE.x - 1, FIRE.y - 1, 3, 2, '#566c86');
    // 田
    R(FIELD.x - 1, FIELD.y - 1, FIELD.cols * FIELD.cw + 2, FIELD.rows * FIELD.ch + 2, C.dirt2);
    for (const c of crops) {
      R(c.x - 4, c.y - 4, 8, 8, C.dirt);
      if (c.g < 0.35) R(c.x, c.y, 1, 1, '#a7f070');
      else if (c.g < 1) { R(c.x - 1, c.y - 1, 3, 3, '#a7f070'); }
      else { R(c.x - 2, c.y - 2, 5, 4, '#38b764'); R(c.x - 1, c.y - 3, 3, 2, '#ef7d57'); }
    }
    // 樹
    for (const t of TREES) {
      if (t.hp > 0) { R(t.x - 1, t.y + 2, 3, 5, C.wood); R(t.x - 4, t.y - 5, 9, 8, '#257179'); R(t.x - 3, t.y - 4, 4, 3, '#38b764'); }
      else R(t.x - 2, t.y + 5, 5, 2, C.wood);
    }
    if (!PLAIN) for (const d of drops) R(d.x, d.y, 2, 2, '#ef7d57');
  }

  function drawPerson(p) {
    const L = p.look;
    const sx = p.shake > 0 && !PLAIN ? (Math.floor(T * 20) % 2 ? 1 : -1) : 0;
    const x = Math.round(p.x) + sx, y = Math.round(p.y);
    const down = p.down && !PLAIN;
    if (p.dead && !PLAIN) {
      // 墓碑
      R(x - 2, y - 6, 5, 7, '#94b0c2'); R(x - 1, y - 7, 3, 1, '#94b0c2'); R(x, y - 5, 1, 3, C.dark); R(x - 1, y - 4, 3, 1, C.dark);
      R(x - 3, y + 1, 7, 1, L.shirt);
      return;
    }
    if (down) {
      // 橫躺：頭在左
      R(x - 5, y - 2, 11, 5, C.dark);
      R(x - 4, y - 1, 3, 3, C.skin); R(x - 4, y - 1, 1, 3, L.hair);
      R(x - 1, y - 1, 4, 3, L.shirt); R(x + 3, y - 1, 2, 3, '#333c57');
      if (p.sick > 0) R(x - 3, y, 1, 1, '#a7f070');
      return;
    }
    const leg = p.moving ? (Math.floor(p.walkPh) % 2) : 0;
    R(x - 3, y - 9, 7, 10, C.dark);                  // 描邊
    R(x - 2, y - 8, 5, 2, L.hair);                   // 頭髮
    if (L.hat) { R(x - 3, y - 8, 7, 1, L.hat); R(x - 2, y - 9, 5, 1, L.hat); }
    let face = C.skin;
    if (!PLAIN && p.sick > 0) face = '#a7f070';
    R(x - 2, y - 6, 5, 2, face);
    R(x - 1, y - 5, 1, 1, C.dark); R(x + 1, y - 5, 1, 1, C.dark);
    R(x - 2, y - 4, 5, 3, L.shirt);
    R(x - 2, y - 1, 2, 2 - leg, '#333c57'); R(x + 1, y - 1, 2, 1 + leg, '#333c57');
    if (!PLAIN) {
      if (p.hurt > 0) R(x - 2, y - 7, 5, 1, C.white);  // 頭上繃帶
      if (p.carry === 'food') { R(x - 1, y - 12, 3, 3, '#ef7d57'); R(x, y - 13, 1, 1, '#38b764'); }
      if (p.carry === 'log') R(x - 4, y - 11, 9, 2, C.wood);
      if (p.state === 'chop' && Math.floor(T * 4) % 2) R(x + 3, y - 6, 2, 3, '#94b0c2');
      if (p.state === 'harvest' && Math.floor(T * 3) % 2) R(x - 2, y - 2, 5, 2, L.shirt);
      if (p.wet > 3 && rain > 0) R(x + 3, y - 8, 1, 2, C.water);
    }
  }

  // 頭上圖示（7x6）
  const ICONS = {
    heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    angry: ['X.X.X.X', '.X...X.', 'X.....X', '.X...X.', 'X.X.X.X', '.......'],
    empty: ['.......', 'X.....X', 'X.....X', '.XXXXX.', '.......', '.......'],
    sleep: ['..XX...', '.XX....', 'XX.....', 'XX.....', '.XX..X.', '..XXX..'],
    sick: ['...X...', '..XXX..', '.XXXXX.', '.XXXXX.', '..XXX..', '.......'],
    hurt: ['..XXX..', '..XXX..', 'XXXXXXX', 'XXXXXXX', '..XXX..', '..XXX..'],
    food: ['...X...', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '.......'],
    tear: ['...X...', '..XXX..', '.XXXXX.', '.XXXXX.', '..XXX..', '.......'],
    note: ['...XX..', '...X.X.', '...X...', '.XXX...', 'XXXX...', '.XX....'],
    dizzy: ['.XXXXX.', 'X.....X', 'X.XXX.X', 'X.X...X', 'X..XXX.', '.......'],
  };
  const ICOL = { heart: '#b13e53', angry: '#e43b44', empty: '#f4f4f4', sleep: '#ffcd75', sick: '#a7f070', hurt: '#e43b44', food: '#ef7d57', tear: '#41a6f6', note: '#f4f4f4', dizzy: '#ffcd75' };
  function drawIcon(p) {
    if (PLAIN || !p.icon || p.dead) return;
    const bm = ICONS[p.icon]; if (!bm) return;
    const bob = Math.floor(T * 3) % 2;
    const x = Math.round(p.x) - 4, y = Math.round(p.y) - (p.down ? 13 : 20) - bob - (p.carry ? 3 : 0);
    const yy = Math.max(1, y);
    R(x - 1, yy - 1, 9, 8, C.dark);
    g.fillStyle = ICOL[p.icon];
    bm.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') g.fillRect(x + i, yy + j, 1, 1); });
  }

  const rainDrops = []; { const s = rs; for (let i = 0; i < 60; i++) rainDrops.push([rr(0, W), rr(0, H), rr(0.8, 1.2)]); rs = s; }
  function drawRain() {
    if (rain <= 0) return;
    g.fillStyle = 'rgba(26,28,44,0.25)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#73eff7';
    for (const d of rainDrops) {
      const y = ((d[1] + performanceT() * 90 * d[2]) % (H + 4)) - 2;
      g.fillRect(Math.round(d[0] - y * 0.2 + W) % W, Math.round(y), 1, 2);
    }
  }
  const performanceT = () => T;

  function draw() {
    drawWorld();
    const order = folk.slice().sort((a, b) => a.y - b.y);
    order.filter(p => p.down || p.dead).forEach(drawPerson);
    order.filter(p => !(p.down || p.dead)).forEach(drawPerson);
    drawRain();
    order.forEach(drawIcon);
  }

  // ---- 主迴圈：固定步長，fast 只改每幀跑幾步 ----
  const DT = 1 / 30;
  let acc = 0, last = null;
  function frame(now) {
    if (last === null) last = now;
    acc += Math.min(0.25, (now - last) / 1000) * FAST;
    if (FAST > 1) acc = Math.min(acc, 60); // 快轉時避免卡頓累積失控
    last = now;
    while (acc >= DT) { step(DT); acc -= DT; }
    draw();
    requestAnimationFrame(frame);
  }
  window.FOLK_SIM = { step: () => step(DT), get t() { return T; } };
  requestAnimationFrame(frame);
})();
