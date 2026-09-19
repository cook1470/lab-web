// folk v2：一小塊地上六個小人自己過日子。畫面上不放任何文字。
// v2 重點：每種「出事」有自己專屬、會持續一段時間的畫面（不靠抽象圖示），
// 每個小人靠輪廓（帽子／髮型／身高／鬍子）認得出來，食物經濟不再整段缺糧。
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
  const pick = a => a[Math.floor(rnd() * a.length)];
  // 畫面用的亂數另外一條，不影響模擬
  let vs = 99;
  const vr = () => { vs = (vs * 16807) % 2147483647; return vs / 2147483647; };

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

  const HOUSE = { x: 4, y: 6, w: 46, h: 34 };
  const BEDS = [[11, 16], [22, 16], [33, 16], [44, 16], [11, 32], [22, 32]];
  const SHED = { x: 60, y: 8, w: 22, h: 15 };
  const WELL = { x: 104, y: 42 };
  const FIRE = { x: 66, y: 70 };
  const FIELD = { x: 112, y: 58, cols: 8, rows: 3, cw: 10, ch: 10 };
  const TREES = [];
  for (let i = 0; i < 6; i++) TREES.push({ x: 150 + i * 9 + (i % 2) * 2, y: 12 + (i % 3) * 9, alive: true, regrow: 0, claim: null });

  // ---- 世界狀態 ----
  let T = 0;
  let food = 8;
  let logs = 0;
  let rain = 0;
  let nextRain = rr(40, 70);
  let shedEmptyLogged = false;
  const LOG = [];
  window.FOLK_LOG = LOG;
  const graves = [];

  const crops = [];
  for (let r = 0; r < FIELD.rows; r++) for (let c = 0; c < FIELD.cols; c++)
    crops.push({ x: FIELD.x + c * FIELD.cw + 5, y: FIELD.y + r * FIELD.ch + 6, g: rr(0, 1.2), claim: null });

  // 外觀：衣服之外，每人一個輪廓特徵
  const LOOKS = [
    { name: '草帽紅衣', shirt: '#b13e53', hair: '#73463a', skin: '#f2c89a', kind: 'strawhat', h: 12 },
    { name: '橘刺髮藍衣', shirt: '#3b5dc9', hair: '#ef7d57', skin: '#f2c89a', kind: 'spiky', h: 12 },
    { name: '青衣小孩', shirt: '#73eff7', hair: '#73463a', skin: '#f2c89a', kind: 'child', h: 9 },
    { name: '白鬍子綠衣老人', shirt: '#38b764', hair: '#f4f4f4', skin: '#e0b088', kind: 'elder', h: 12 },
    { name: '金長髮紫裙', shirt: '#8b3fa8', hair: '#ffcd75', skin: '#f2c89a', kind: 'longhair', h: 12 },
    { name: '紅頭巾白衣', shirt: '#f4f4f4', hair: '#1a1c2c', skin: '#a0663e', kind: 'headband', h: 12 },
  ];
  const N = (p) => LOOKS[p.id].name;
  function log(who, what) { LOG.push({ t: Math.round(T * 10) / 10, who: who.map(p => p.id), what }); }

  const lazyId = Math.floor(rnd() * 6);
  const folk = LOOKS.map((L, i) => ({
    id: i, look: L,
    x: rr(70, 140), y: rr(34, 54), tx: 0, ty: 0,
    hunger: rr(0.5, 1), energy: rr(0.6, 1),
    appetite: rr(0.014, 0.02) * (i === lazyId ? 1.3 : 1), stamina: rr(0.007, 0.011),
    lazy: i === lazyId,
    diligent: rnd() < 0.5,
    strength: rr(0.5, 1.5) * (i === 2 ? 0.5 : 1) * (i === 3 ? 0.7 : 1),
    speed: rr(11, 14) * (i === 3 ? 0.8 : 1),
    state: 'idle', timer: rr(0, 2), job: null, carry: null,
    heart: 0, anger: 0, tear: 0,
    wet: 0, sick: 0, hurt: 0, bruise: 0, starve: 0, dead: false, down: false,
    shake: 0, walkPh: 0, bed: BEDS[i], target: null, helper: null, face: 0,
    rel: [0, 0, 0, 0, 0, 0].map(() => rr(-0.1, 0.4)),
    talkCd: rr(5, 15),
  }));
  folk.forEach(p => { p.tx = p.x; p.ty = p.y; p.rel[p.id] = 0; });
  log([folk[lazyId]], N(folk[lazyId]) + '是懶人，不去工作');

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const inHouse = p => p.x > HOUSE.x && p.x < HOUSE.x + HOUSE.w && p.y > HOUSE.y && p.y < HOUSE.y + HOUSE.h;
  const goTo = (p, x, y) => { p.tx = x; p.ty = y; };
  const arrived = p => Math.hypot(p.tx - p.x, p.ty - p.y) < 1.2;
  const setState = (p, s, t) => { p.state = s; p.timer = t || 0; };
  const shedSpot = p => [SHED.x + 1 + p.id * 4, SHED.y + SHED.h + 5 + (p.id % 2) * 5];
  const needsHelp = o => !o.dead && !o.helper && !(o.state === 'sickBed' && o.fed) && (o.state === 'pinned' || o.state === 'sickBed' || o.state === 'starving');
  const busyCare = p => ['falling', 'gawk', 'pinned', 'sickBed', 'starving', 'lift', 'toLift', 'fetchFood', 'bringFood', 'sitWith', 'fight', 'confront', 'mourn', 'toGrave'].includes(p.state);
  function release(p) { if (p.job) { p.job.claim = null; p.job = null; } }

  // ---- 決定下一件事 ----
  function decide(p) {
    p.target = null;
    if (p.sick > 0) { goTo(p, p.bed[0], p.bed[1]); return setState(p, 'toSickBed'); }
    if (p.hunger < 0.3) { const s = shedSpot(p); goTo(p, s[0], s[1]); return setState(p, 'toEat'); }
    if (p.energy < 0.3) { goTo(p, p.bed[0], p.bed[1]); return setState(p, 'toSleep'); }
    // 有人出事 → 關係不差的人去幫
    if (p.hurt <= 0) {
      let best = null, bd = 1e9;
      for (const o of folk) if (o !== p && needsHelp(o) && p.rel[o.id] > -0.15) { const d = dist(p, o) - p.rel[o.id] * 60; if (d < bd) { bd = d; best = o; } }
      if (best) {
        best.helper = p; p.target = best;
        if (best.state === 'pinned') { goTo(p, best.x + 9, best.y); return setState(p, 'toLift'); }
        const s = shedSpot(p); goTo(p, s[0], s[1]); return setState(p, 'fetchFood');
      }
    }
    // 記恨到一定程度 → 去找對方算帳
    if (p.hurt <= 0 && p.bruise <= 0) {
      for (const o of folk) if (o !== p && !o.dead && !o.down && p.rel[o.id] < -0.55 && !busyCare(o)) {
        p.target = o; return setState(p, 'confront', 15);
      }
    }
    if (rain > 0 && !p.diligent) { goTo(p, p.bed[0] + rr(-3, 3), p.bed[1] + 6); return setState(p, 'shelter', 4); }
    if (p.hurt > 0 || p.lazy) { goTo(p, FIRE.x + rr(-9, 9), FIRE.y + rr(-5, 5)); return setState(p, 'loiter', rr(5, 9)); }
    const r = rnd();
    const ripe = crops.filter(c => c.g >= 1 && !c.claim);
    if (ripe.length && r < (ripe.length > 8 ? 0.75 : 0.5)) {
      const c = pick(ripe); c.claim = p; p.job = c; goTo(p, c.x, c.y + 2); return setState(p, 'toCrop');
    }
    const trees = TREES.filter(t => t.alive && !t.claim);
    if (trees.length && r < 0.78) {
      const t = pick(trees); t.claim = p; p.job = t; goTo(p, t.x, t.y + 14); return setState(p, 'toTree');
    }
    if (r < 0.9) { goTo(p, WELL.x + rr(-9, 9), WELL.y + rr(5, 9)); return setState(p, 'loiter', rr(3, 6)); }
    goTo(p, FIRE.x + rr(-10, 10), FIRE.y + rr(-6, 6)); return setState(p, 'loiter', rr(3, 6));
  }

  // ---- 每一步 ----
  function step(dt) {
    T += dt;
    if (rain > 0) { rain -= dt; if (rain <= 0) { log([], '雨停了'); nextRain = T + rr(60, 100); } }
    else if (T >= nextRain) { rain = rr(20, 28); log([], '開始下雨'); }
    for (const c of crops) if (c.g < 1) c.g = Math.min(1, c.g + dt * (rain > 0 ? 0.03 : 0.011));
    for (const t of TREES) if (!t.alive) { t.regrow -= dt; if (t.regrow <= 0) t.alive = true; }
    if (food > 0) shedEmptyLogged = false;

    for (const p of folk) {
      if (p.dead) continue;
      p.heart = Math.max(0, p.heart - dt); p.anger = Math.max(0, p.anger - dt); p.tear = Math.max(0, p.tear - dt);
      p.shake = Math.max(0, p.shake - dt); p.talkCd -= dt;
      p.bruise = Math.max(0, p.bruise - dt);
      const lying = p.state === 'sleep' || p.state === 'sickBed';
      if (p.state !== 'starving') p.hunger = Math.max(0, p.hunger - p.appetite * dt * (p.state === 'chop' ? 1.5 : 1));
      p.energy = lying ? Math.min(1, p.energy + 0.09 * dt) : Math.max(0.05, p.energy - p.stamina * dt);

      // 淋雨生病
      if (rain > 0 && !inHouse(p) && !p.down) {
        p.wet += dt;
        if (p.wet > 9 && p.sick <= 0 && rnd() < 0.05 * dt) {
          p.sick = rr(35, 45); release(p); dropCarry(p);
          log([p], N(p) + '淋雨太久，生病了，回床上躺');
          if (!busyCare(p)) decide(p);
        }
      } else p.wet = Math.max(0, p.wet - dt);

      // 挨餓：餓太久就倒在外面，再久會死
      if (p.hunger <= 0 && p.state !== 'sickBed' && p.state !== 'pinned') {
        p.starve += dt;
        if (p.starve > 25 && p.state !== 'starving') {
          release(p); dropCarry(p); p.down = true; setState(p, 'starving');
          log([p], N(p) + '餓到倒在地上起不來');
        }
      }
      if (p.state === 'starving') {
        p.starve += dt * 0; p.timer += dt;
        if (p.timer > 55) { die(p); continue; }
      }

      tick(p, dt);

      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      const moving = d > 0.6 && !p.down && p.shake <= 0;
      if (moving) {
        const sp = p.speed * (p.hurt > 0 ? 0.45 : 1);
        const m = Math.min(d, sp * dt);
        p.x += dx / d * m; p.y += dy / d * m; p.walkPh += dt * 7;
        if (Math.abs(dx) > 0.3) p.face = dx < 0 ? -1 : 1;
      }
      p.moving = moving;
      if (p.hurt > 0) { p.hurt -= dt; if (p.hurt <= 0) { p.hurt = 0; log([p], N(p) + '的傷好了，丟掉拐杖'); } }
    }
    socialize();
  }

  function dropCarry(p) { if (p.carry === 'food') food++; p.carry = null; }

  function die(p) {
    p.dead = true; p.down = true; release(p);
    const gr = { x: Math.round(p.x), y: Math.round(p.y), who: p };
    graves.push(gr); p.tx = p.x; p.ty = p.y;
    if (p.helper) { p.helper.target = null; p.helper = null; }
    log([p], N(p) + '餓死了，變成墳墓');
    let f = null, bv = 0.05;
    for (const o of folk) if (o !== p && !o.dead && o.rel[p.id] > bv) { bv = o.rel[p.id]; f = o; }
    if (f && !['pinned', 'sickBed', 'starving'].includes(f.state)) {
      release(f); dropCarry(f); f.target = gr; goTo(f, gr.x + 5, gr.y + 3); setState(f, 'toGrave');
      log([f, p], N(f) + '去' + N(p) + '的墳前哭');
    }
  }

  function eat(p) { p.hunger = 1; p.starve = 0; }

  function tick(p, dt) {
    p.timer -= dt;
    switch (p.state) {
      case 'idle': if (p.timer <= 0) decide(p); break;
      case 'loiter': case 'shelter':
        if (arrived(p) && p.timer <= 0) decide(p); break;
      case 'toCrop':
        if (rain > 0 && !p.diligent && !p.eatOnField) { release(p); decide(p); break; }
        if (arrived(p)) setState(p, 'harvest', 2.5); break;
      case 'harvest':
        if (p.timer <= 0) {
          p.job.g = 0; release(p);
          if (p.eatOnField) { p.eatOnField = false; eat(p); decide(p); break; }
          p.carry = 'food'; const s = shedSpot(p); goTo(p, s[0], s[1]); setState(p, 'deliver');
        }
        break;
      case 'deliver':
        if (arrived(p)) { if (p.carry === 'food') food++; else if (p.carry === 'log') logs++; p.carry = null; decide(p); }
        break;
      case 'toTree':
        if (rain > 0 && !p.diligent) { release(p); decide(p); break; }
        if (arrived(p)) setState(p, 'chop', 4); break;
      case 'chop':
        if (p.timer <= 0) {
          const t = p.job; t.alive = false; t.regrow = rr(60, 90); release(p);
          if (rnd() < 0.25 && !folk.some(o => o.state === 'pinned' || o.state === 'falling')) {
            // 先是樹搖晃、慢慢傾斜，再整棵朝他倒下（幾秒內都看得到）
            setState(p, 'falling', 4); p.pinTree = t; t.falling = p;
            goTo(p, Math.max(8, t.x - 8), t.y + 11); // 發現樹要倒，往旁邊逃，但來不及
            log([p], N(p) + '砍的樹開始朝自己倒下來');
          } else { p.carry = 'log'; goTo(p, SHED.x - 5, SHED.y + SHED.h + 2); setState(p, 'deliver'); }
        }
        break;
      case 'falling':
        if (p.timer <= 0) {
          p.down = true; setState(p, 'pinned', 0); p.pinT = 0; p.pinTree.falling = null;
          log([p], N(p) + '砍倒的樹壓在自己身上，動不了');
          // 附近的人嚇到，跑過來圍著看
          for (const o of folk) {
            if (o === p || o.dead || o.down || busyCare(o) || o.sick > 0 || dist(o, p) > 90) continue;
            release(o); dropCarry(o);
            const a = -Math.PI / 2 + (o.id / 5 - 0.5) * Math.PI * 1.1; // 站在樹冠的另一側（右半圈）
            o.target = p; goTo(o, p.x + 16 + (o.id % 3) * 7, p.y - 6 + (o.id % 2) * 12 + (o.id % 3)); setState(o, 'gawk', rr(6, 10));
          }
        }
        break;
      case 'gawk': {
        const o = p.target;
        if (o) p.face = o.x < p.x ? -1 : 1;
        if (!o || o.state !== 'pinned' || p.timer <= 0) decide(p);
        break;
      }
      case 'pinned':
        p.pinT += dt;
        if (p.pinT > 30) { // 沒人來，自己爬出來
          p.down = false; p.hurt = rr(40, 50); p.helper = null;
          log([p], N(p) + '沒人來救，自己從樹下爬出來，受傷拄拐杖');
          decide(p);
        }
        break;
      case 'toLift': {
        const o = p.target;
        if (!o || o.state !== 'pinned') { decide(p); break; }
        if (arrived(p)) setState(p, 'lift', 3);
        break;
      }
      case 'lift': {
        const o = p.target;
        if (!o || o.state !== 'pinned') { decide(p); break; }
        if (p.timer <= 0) {
          o.down = false; o.hurt = rr(40, 50); o.helper = null;
          p.heart = 6; o.heart = 6; p.rel[o.id] += 0.3; o.rel[p.id] += 0.5;
          log([p, o], N(p) + '把壓在' + N(o) + '身上的樹抬開，救了他');
          decide(o); setState(p, 'loiter', 2); p.tx = p.x; p.ty = p.y;
        }
        break;
      }
      case 'toEat':
        if (arrived(p)) {
          if (food > 0) { food--; eat(p); setState(p, 'eatHere', 2); lazyWatch(p); break; }
          if (!shedEmptyLogged) { shedEmptyLogged = true; log([p], '倉庫空了（' + N(p) + '發現的）'); }
          const ripe = crops.filter(c => c.g >= 1 && !c.claim);
          if (ripe.length) { const c = pick(ripe); c.claim = p; p.job = c; p.eatOnField = true; goTo(p, c.x, c.y + 2); setState(p, 'toCrop'); }
          else { goTo(p, FIELD.x + rr(0, 75), FIELD.y + rr(0, 25)); setState(p, 'loiter', rr(4, 7)); }
        }
        break;
      case 'eatHere': if (p.timer <= 0) decide(p); break;
      case 'toSleep': if (arrived(p)) { p.down = true; setState(p, 'sleep'); } break;
      case 'sleep': if (p.energy >= 1 || p.hunger < 0.12) { p.down = false; decide(p); } break;
      case 'toSickBed': if (arrived(p)) { p.down = true; setState(p, 'sickBed'); } break;
      case 'sickBed':
        p.sick -= dt * (p.fed ? 2 : 1); p.hunger = Math.max(p.hunger, 0.3);
        if (p.sick <= 0) { p.sick = 0; p.fed = false; p.down = false; p.helper = null; log([p], N(p) + '病好了，起床'); decide(p); }
        break;
      case 'starving': break;
      case 'fetchFood': {
        const o = p.target;
        if (!o || o.dead || !(o.state === 'sickBed' || o.state === 'starving')) { if (o && o.helper === p) o.helper = null; decide(p); break; }
        if (arrived(p)) {
          if (p.fieldFetch) { p.fieldFetch.g = 0; p.fieldFetch.claim = null; p.fieldFetch = null; p.carry = 'food'; setState(p, 'bringFood'); break; }
          if (food > 0) { food--; p.carry = 'food'; setState(p, 'bringFood'); break; }
          const ripe = crops.filter(c => c.g >= 1 && !c.claim);
          if (ripe.length) { const c = pick(ripe); c.claim = p; p.fieldFetch = c; goTo(p, c.x, c.y + 2); }
          else { o.helper = null; decide(p); }
        }
        break;
      }
      case 'bringFood': {
        const o = p.target;
        if (!o || o.dead) { dropCarry(p); decide(p); break; }
        goTo(p, o.x + 7, o.y + 1);
        if (dist(p, o) < 8) {
          p.carry = null; eat(o); o.fed = true;
          if (o.state === 'starving') { o.down = false; o.hunger = 1; o.starve = 0; setState(o, 'sitWith', 7); o.target = p; }
          const why = o.sick > 0 ? '生病躺床' : '餓倒';
          log([p, o], N(p) + '拿食物給' + why + '的' + N(o) + '，陪在旁邊');
          p.rel[o.id] += 0.3; o.rel[p.id] += 0.5;
          p.target = o; setState(p, 'sitWith', 7); p.tx = p.x; p.ty = p.y;
        }
        break;
      }
      case 'sitWith': {
        p.heart = 0.5;
        const o = p.target; if (o && o.state === 'sickBed') o.heart = 0.5;
        if (p.timer <= 0) { if (o) o.helper = null; decide(p); }
        break;
      }
      case 'confront': {
        const o = p.target;
        if (!o || o.dead || o.down || p.timer <= 0) { decide(p); break; }
        goTo(p, o.x + (p.x < o.x ? -8 : 8), o.y); p.anger = 1;
        if (dist(p, o) < 9) {
          release(o); dropCarry(o);
          setState(p, 'fight', 4); setState(o, 'fight', 4); o.target = p;
          p.shake = o.shake = 4; o.tx = o.x; o.ty = o.y; p.tx = p.x; p.ty = p.y;
          p.anger = o.anger = 6;
          const win = p.strength * rr(0.6, 1.4) > o.strength * rr(0.6, 1.4);
          const loser = win ? o : p, winner = win ? p : o;
          loser.bruise = 45; loser.rel[winner.id] -= 0.2; p.rel[o.id] = -0.2; o.rel[p.id] = Math.min(o.rel[p.id], -0.3);
          log([p, o], N(p) + '氣沖沖去找' + N(o) + '打架，' + N(loser) + '被打出黑眼圈');
        }
        break;
      }
      case 'fight': if (p.timer <= 0) { p.target = null; decide(p); } break;
      case 'toGrave': if (arrived(p)) setState(p, 'mourn', 12); break;
      case 'mourn': p.tear = 1; if (p.timer <= 0) decide(p); break;
    }
  }

  // 懶人從倉庫拿東西吃，旁邊有在工作的人看到會記恨
  function lazyWatch(p) {
    if (!p.lazy) return;
    for (const o of folk) if (o !== p && !o.dead && !o.lazy && !o.down && dist(o, p) < 30) {
      o.rel[p.id] -= 0.3; o.anger = 3;
      log([o, p], N(o) + '看到' + N(p) + '不工作卻吃倉庫的食物，很不爽');
    }
  }

  // 閒晃中碰面：感情好就一起開心聊天（持續幾秒愛心）
  function socialize() {
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
      const a = folk[i], b = folk[j];
      if (a.dead || b.dead || a.state !== 'loiter' || b.state !== 'loiter') continue;
      if (a.talkCd > 0 || b.talkCd > 0 || dist(a, b) > 12) continue;
      a.talkCd = b.talkCd = rr(20, 30);
      const r = (a.rel[b.id] + b.rel[a.id]) / 2;
      a.tx = a.x; a.ty = a.y; b.tx = b.x; b.ty = b.y; a.timer = b.timer = 5;
      a.face = a.x < b.x ? 1 : -1; b.face = -a.face;
      if (r > 0.25) { a.heart = b.heart = 5; a.rel[b.id] += 0.1; b.rel[a.id] += 0.1; log([a, b], N(a) + '和' + N(b) + '碰面開心聊天'); }
      else if (r < -0.15) { a.anger = b.anger = 4; a.rel[b.id] -= 0.15; b.rel[a.id] -= 0.15; log([a, b], N(a) + '和' + N(b) + '碰面互瞪'); }
    }
  }

  // ======== 畫圖 ========
  const C = { grass: '#38b764', wall: '#566c86', floor: '#94b0c2', wood: '#8a5a3c', dark: '#1a1c2c', white: '#f4f4f4', pants: '#333c57', water: '#41a6f6' };
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const tufts = []; for (let i = 0; i < 140; i++) tufts.push([vr() * W, vr() * H]);
  const rainDrops = []; for (let i = 0; i < 60; i++) rainDrops.push([vr() * W, vr() * H, 0.8 + vr() * 0.4]);

  function drawWorld() {
    R(0, 0, W, H, C.grass);
    for (const [x, y] of tufts) R(x, y, 1, 1, '#2f9e57');
    // 房子
    R(HOUSE.x - 1, HOUSE.y - 1, HOUSE.w + 2, HOUSE.h + 2, C.dark);
    R(HOUSE.x, HOUSE.y, HOUSE.w, HOUSE.h, C.wall);
    R(HOUSE.x + 2, HOUSE.y + 2, HOUSE.w - 4, HOUSE.h - 4, C.floor);
    R(HOUSE.x + HOUSE.w - 2, HOUSE.y + 22, 2, 8, C.floor);
    for (const [bx, by] of BEDS) { R(bx - 4, by - 8, 9, 11, C.wood); R(bx - 3, by - 7, 7, 3, C.white); }
    // 倉庫：看得出食物多少
    R(SHED.x - 1, SHED.y - 1, SHED.w + 2, SHED.h + 2, C.dark);
    R(SHED.x, SHED.y, SHED.w, SHED.h, C.wood);
    R(SHED.x + 2, SHED.y + 2, SHED.w - 4, SHED.h - 4, '#3b2a24');
    for (let i = 0; i < Math.min(food, 16); i++) R(SHED.x + 3 + (i % 8) * 2, SHED.y + 10 - Math.floor(i / 8) * 4, 2, 3, '#ef7d57');
    for (let i = 0; i < Math.min(logs, 6); i++) R(SHED.x - 8, SHED.y + 13 - i * 2, 6, 1, C.wood);
    // 井、營火
    R(WELL.x - 4, WELL.y - 4, 9, 9, C.wall); R(WELL.x - 2, WELL.y - 2, 5, 5, C.water);
    R(FIRE.x - 3, FIRE.y + 1, 7, 2, C.wood);
    if (rain <= 0) { const fl = Math.floor(T * 6) % 2; R(FIRE.x - 1, FIRE.y - 2 + fl, 3, 3, '#ef7d57'); R(FIRE.x, FIRE.y - 3 + fl, 1, 2, '#ffcd75'); }
    // 田
    R(FIELD.x - 1, FIELD.y - 1, FIELD.cols * FIELD.cw + 2, FIELD.rows * FIELD.ch + 2, '#5a3a2e');
    for (const c of crops) {
      R(c.x - 4, c.y - 4, 8, 8, '#73463a');
      if (c.g < 0.4) R(c.x, c.y, 1, 1, '#a7f070');
      else if (c.g < 1) R(c.x - 1, c.y - 1, 3, 3, '#a7f070');
      else { R(c.x - 2, c.y - 1, 5, 3, '#38b764'); R(c.x - 1, c.y - 3, 3, 2, '#ef7d57'); }
    }
    // 樹：活的畫整棵，砍掉的剩樹樁
    for (const t of TREES) {
      if (t.alive) drawTreeUp(t.x, t.y);
      else if (!PLAIN && (t.falling || folk.some(o => o.state === 'pinned' && o.pinTree === t))) drawStump(t, true);
      else { R(t.x - 2, t.y + 3, 5, 4, C.dark); R(t.x - 1, t.y + 3, 3, 3, C.wood); R(t.x - 1, t.y + 3, 3, 1, '#ffcd75'); }
    }
    // 墳墓
    for (const gr of (PLAIN ? [] : graves)) {
      const x = gr.x, y = gr.y;
      R(x - 3, y - 8, 7, 9, C.dark); R(x - 2, y - 7, 5, 8, '#94b0c2'); R(x, y - 6, 1, 4, C.dark); R(x - 1, y - 5, 3, 1, C.dark);
      if (!PLAIN) { R(x - 4, y + 1, 9, 2, '#5a3a2e'); R(x + 3, y - 1, 2, 2, gr.who.look.shirt); } // 墳前放著他衣服顏色的布
    }
  }

  // 樹的小圖（和站著的樹同一張），畫成可旋轉的圖片：樹根在 (6, 18)
  const TREE_IMG = document.createElement('canvas');
  TREE_IMG.width = 13; TREE_IMG.height = 19;
  {
    const tg = TREE_IMG.getContext('2d');
    const r = (x, y, w, h, c) => { tg.fillStyle = c; tg.fillRect(x, y, w, h); };
    const x = 6, y = 10;
    r(x - 2, y + 1, 5, 8, '#1a1c2c'); r(x - 1, y + 1, 3, 8, '#8a5a3c');
    r(x - 5, y - 9, 11, 11, '#1a1c2c'); r(x - 4, y - 8, 9, 9, '#257179');
    r(x - 3, y - 7, 4, 3, '#38b764'); r(x + 1, y - 3, 2, 2, '#38b764');
    r(x - 6, y - 5, 1, 3, '#1a1c2c'); r(x + 6, y - 6, 1, 3, '#1a1c2c'); // 枝葉的邊
  }
  // ang：0＝直立，正值往右倒
  function drawTreeAt(rx, ry, ang) {
    g.save(); g.imageSmoothingEnabled = false;
    g.translate(Math.round(rx) + 0.5, Math.round(ry));
    g.rotate(ang);
    g.drawImage(TREE_IMG, -6.5, -18);
    g.restore();
  }
  // 樹樁；broken＝剛斷，頂上是白色斷面和木屑
  function drawStump(t, broken) {
    R(t.x - 2, t.y + 3, 5, 5, C.dark); R(t.x - 1, t.y + 3, 3, 4, C.wood);
    R(t.x - 1, t.y + 3, 3, 1, broken ? C.white : '#ffcd75');
    if (broken) { R(t.x - 1, t.y + 2, 1, 1, C.white); R(t.x + 1, t.y + 1, 1, 2, C.white); R(t.x - 4, t.y + 8, 1, 1, '#ffcd75'); R(t.x + 3, t.y + 7, 1, 1, '#ffcd75'); }
  }
  // 從樹根指向那個人的倒下角度
  function fallAngle(t, p) { return Math.atan2(p.x - t.x, -(p.y - 4 - (t.y + 7))); }

  // 一棵站著的樹：樹幹＋圓樹冠（x,y 是樹冠中心附近，樹根在 y+7）
  function drawTreeUp(x, y) {
    R(x - 2, y + 1, 5, 7, C.dark); R(x - 1, y + 1, 3, 6, C.wood);
    R(x - 5, y - 9, 11, 11, C.dark);
    R(x - 4, y - 8, 9, 9, '#257179');
    R(x - 3, y - 7, 4, 3, '#38b764'); R(x + 1, y - 3, 2, 2, '#38b764');
  }
  // 站立的小人（中心 x，腳底 y）
  function drawStand(p, x, y) {
    const L = p.look, h = L.h, top = y - h;
    const leg = p.moving ? (Math.floor(p.walkPh) % 2) : 0;
    const child = L.kind === 'child';
    // 描邊
    R(x - 3, top - 1, 7, h + 1, C.dark);
    // 頭
    const headY = top;
    const skin = (!PLAIN && p.state === 'starving') ? '#94b0c2' : (!PLAIN && p.anger > 0) ? '#e43b44' : L.skin;
    R(x - 2, headY + 1, 5, 3, skin);
    // 眼睛（朝向）
    const ex = p.face < 0 ? -1 : 0;
    R(x - 1 + ex, headY + 2, 1, 1, C.dark); R(x + 1 + ex, headY + 2, 1, 1, C.dark);
    if (!PLAIN && p.bruise > 0) R(x - 1 + ex, headY + 2, 1, 2, '#5d275d');
    if (!PLAIN && p.anger > 0) {
      // 倒八字眉、嘴角往下
      R(x - 2 + ex, headY + 1, 1, 1, C.dark); R(x + 2 + ex, headY + 1, 1, 1, C.dark);
      R(x - 1 + ex, headY + 2, 1, 1, C.dark); R(x + 1 + ex, headY + 2, 1, 1, C.dark);
      // 頭頂兩側冒出一團一團往上飄的蒸氣
      const k = Math.floor(T * 4) % 3;
      R(x - 5, top - 2 - k * 2, 2 + (k === 0 ? 1 : 0), 2, C.white);
      R(x + 4, top - 2 - ((k + 1) % 3) * 2, 2 + (k === 2 ? 1 : 0), 2, C.white);
      R(x - 4, top - 7 + k, 1, 1, '#c2c3c7'); R(x + 5, top - 6 + k, 1, 1, '#c2c3c7');
    }
    // 髮型／特徵
    switch (L.kind) {
      case 'strawhat': R(x - 4, headY, 9, 1, '#ffcd75'); R(x - 2, headY - 1, 5, 1, '#ffcd75'); R(x - 2, headY, 5, 1, '#b13e53'); break;
      case 'spiky': R(x - 2, headY, 5, 1, L.hair); R(x - 2, headY - 1, 1, 1, L.hair); R(x, headY - 2, 1, 2, L.hair); R(x + 2, headY - 1, 1, 1, L.hair); break;
      case 'child': R(x - 2, headY, 5, 1, L.hair); R(x - 3, headY + 1, 1, 2, L.hair); R(x + 3, headY + 1, 1, 2, L.hair); break;
      case 'elder': R(x - 2, headY + 3, 5, 3, L.hair); R(x - 2, headY, 1, 2, L.hair); R(x + 2, headY, 1, 2, L.hair); break;
      case 'longhair': R(x - 2, headY, 5, 1, L.hair); R(x - 3, headY, 1, 6, L.hair); R(x + 3, headY, 1, 6, L.hair); break;
      case 'headband': R(x - 2, headY, 5, 1, L.hair); R(x - 2, headY + 1, 5, 1, '#e43b44'); R(x + 3, headY + 1, 1, 2, '#e43b44'); break;
    }
    if (!PLAIN && p.hurt > 0) R(x - 2, headY, 5, 1, C.white); // 頭上繃帶
    // 身體
    const bodyY = headY + 4, bodyH = child ? 3 : 5;
    if (L.kind === 'longhair') { R(x - 2, bodyY, 5, bodyH - 1, L.shirt); R(x - 3, bodyY + bodyH - 1, 7, 2, L.shirt); }
    else R(x - 2, bodyY, 5, bodyH, L.shirt);
    if (L.kind === 'elder') R(x - 1, bodyY, 3, 2, L.hair);
    const legY = bodyY + bodyH;
    const legH = y - legY;
    if (legH > 0) { R(x - 2, legY, 2, legH - leg, C.pants); R(x + 1, legY, 2, legH - (1 - leg), C.pants); }
    if (PLAIN) return;
    if (p.state === 'falling') { const k = Math.floor(T * 6) % 2; R(x - 4, top - 2 + k, 1, 5, L.skin); R(x + 4, top - 2 + (1 - k), 1, 5, L.skin); R(x - 1 + ex, headY + 3, 3, 1, C.dark); }
    if (p.state === 'gawk' && p.target && p.target.state === 'pinned') { R(x - 2, headY + 3, 5, 1, L.skin); R(x - 3, headY + 4, 1, 3, L.skin); R(x + 3, headY + 4, 1, 3, L.skin); }
    // 拐杖
    if (p.hurt > 0) R(x + 4, top + 5, 1, h - 4, C.wood);
    // 手上的東西
    if (p.carry === 'food') { R(x - 1, top - 4, 3, 3, '#ef7d57'); R(x, top - 5, 1, 1, '#38b764'); }
    if (p.carry === 'log') { R(x - 6, top + 6, 13, 3, C.dark); R(x - 5, top + 7, 11, 1, C.wood); }
    if (p.state === 'chop') { const up = Math.floor(T * 4) % 2; R(x + 3, top + (up ? 2 : 5), 1, 4, C.wood); R(x + 3, top + (up ? 1 : 8), 3, 2, '#94b0c2'); }
    if (p.state === 'harvest' && Math.floor(T * 3) % 2) R(x - 2, bodyY + 1, 5, 2, L.shirt);
    if (p.state === 'lift') R(x - 3, top + 4, 7, 1, L.skin);
    if (p.tear > 0) { const k = Math.floor(T * 4) % 3; R(x - 2 + ex, headY + 3 + k, 1, 1, C.water); R(x + 2 + ex, headY + 4 + (k + 1) % 3, 1, 1, C.water); }
    if (p.wet > 3 && rain > 0 && !inHouse(p)) { R(x - 3, top - 1, 7, 1, '#73eff7'); }
  }

  // 躺著的小人（頭在左）
  function drawLying(p, x, y) {
    const L = p.look;
    const len = L.kind === 'child' ? 9 : 12;
    const x0 = x - Math.floor(len / 2);
    R(x0 - 1, y - 4, len + 2, 6, C.dark);
    let skin = L.skin;
    if (!PLAIN && p.state === 'sickBed') skin = '#a7f070';
    if (!PLAIN && p.state === 'starving') skin = '#94b0c2';
    R(x0, y - 3, 3, 4, skin);
    R(x0, y - 3, 1, 4, L.kind === 'strawhat' ? '#ffcd75' : L.hair);
    if (L.kind === 'elder') R(x0 + 3, y - 3, 2, 4, L.hair);
    R(x0 + 3 + (L.kind === 'elder' ? 2 : 0), y - 3, len - 7 - (L.kind === 'elder' ? 2 : 0), 4, L.shirt);
    R(x0 + len - 4, y - 3, 4, 4, C.pants);
    // 閉眼
    R(x0 + 1, y - 2, 1, 1, C.dark);
    if (PLAIN) return;
    if (p.state === 'sleep' || p.state === 'sickBed') R(x0 + 3, y - 3, len - 3, 4, '#b13e53'); // 蓋被子
    if (p.state === 'sickBed') { R(x0 - 1, y - 5, 4, 2, C.white); } // 額頭上的濕毛巾
    if (p.state === 'starving') {
      R(x0 - 5, y - 1, 4, 2, '#566c86'); R(x0 - 4, y - 1, 2, 1, '#333c57'); // 空碗
    }
  }

  // 躺在自己床上（直的，頭在上、被子蓋著）
  function drawInBed(p) {
    const L = p.look, bx = p.bed[0], by = p.bed[1];
    const sick = p.state === 'sickBed';
    R(bx - 3, by - 7, 7, 4, sick ? '#a7f070' : L.skin);          // 臉（生病是綠的）
    R(bx - 3, by - 8, 7, 1, L.kind === 'strawhat' ? '#ffcd75' : L.hair);
    if (L.kind === 'longhair') { R(bx - 4, by - 8, 1, 5, L.hair); R(bx + 4, by - 8, 1, 5, L.hair); }
    if (L.kind === 'elder') R(bx - 2, by - 4, 5, 2, L.hair);
    if (L.kind === 'headband') R(bx - 3, by - 7, 7, 1, '#e43b44');
    R(bx - 2, by - 5, 1, 1, C.dark); R(bx + 2, by - 5, 1, 1, C.dark); // 閉眼
    R(bx - 4, by - 3, 9, 7, L.shirt);                              // 被子是他衣服的顏色
    R(bx - 4, by - 3, 9, 1, C.white);
    if (sick) {
      R(bx - 3, by - 9, 7, 2, C.white);                            // 額頭濕毛巾
      const k = Math.floor(T * 3) % 2;                             // 發抖
      R(bx - 5 + k, by, 1, 2, '#1a1c2c'); R(bx + 5 - k, by, 1, 2, '#1a1c2c');
    }
  }

  // 樹倒下的過程：前 1.5 秒原地搖晃，之後越倒越快；畫在人上面
  function drawFalling(p) {
    const t = p.pinTree, el = 4 - p.timer;
    let k = 0;
    if (el < 1.5) k = Math.sin(el * 30) * 0.06 + el * 0.05;
    else k = 0.08 + Math.pow((el - 1.5) / 2.5, 2) * 0.92;
    drawTreeAt(t.x, t.y + 7, fallAngle(t, p) * k);
  }
  // 被壓住：人躺著（和樹幹垂直，頭腳露出來），整棵樹橫倒在他身上
  function drawPinned(p, x, y) {
    const t = p.pinTree, L = p.look;
    const ang = fallAngle(t, p);
    const wig = p.helper && p.helper.state === 'lift' ? (Math.floor(T * 8) % 2) : 0;
    const across = Math.abs(Math.sin(ang)) > 0.7; // 樹橫著倒 → 人畫成直的
    const k = Math.floor(T * 3) % 2;
    if (across) {
      // 直躺：頭在上、腳在下，雙手往兩側張開揮動
      R(x - 3, y - 13, 7, 15, C.dark);
      R(x - 2, y - 12, 5, 1, L.kind === 'strawhat' ? '#ffcd75' : L.hair);
      R(x - 2, y - 11, 5, 3, L.skin); R(x - 1, y - 10, 1, 1, C.dark); R(x + 1, y - 10, 1, 1, C.dark);
      R(x - 1, y - 8, 3, 1, C.dark); // 張嘴喊
      R(x - 2, y - 7, 5, 5, L.shirt); R(x - 2, y - 2, 2, 3, C.pants); R(x + 1, y - 2, 2, 3, C.pants);
      R(x - 6, y - 7 - k, 4, 1, L.skin); R(x + 3, y - 7 - (1 - k), 4, 1, L.skin);
    } else drawLying(p, x, y);
    drawTreeAt(t.x, t.y + 7 - wig, ang);
    if (across) { // 頭和揮動的手畫在樹上面，一定看得到
      R(x - 3, y - 13, 7, 6, C.dark);
      R(x - 2, y - 12, 5, 1, L.kind === 'strawhat' ? '#ffcd75' : L.hair);
      R(x - 2, y - 11, 5, 3, L.skin); R(x - 1, y - 10, 1, 1, C.dark); R(x + 1, y - 10, 1, 1, C.dark);
      R(x - 1, y - 8, 3, 1, C.dark);
      R(x - 6, y - 12 - k, 1, 4, L.skin); R(x + 6, y - 12 - (1 - k), 1, 4, L.skin);
      R(x - 1, y + 1, 1, 2, C.pants); R(x + 1, y + 1, 1, 2 - k, C.pants);
    }
    // 倒下後前 3 秒揚起塵土，散落的葉子一直留著
    if (p.pinT < 3) {
      const r = 6 + p.pinT * 5;
      for (let i = 0; i < 8; i++) { const a = i * 0.785 + p.pinT; R(x + Math.cos(a) * r, y - 4 + Math.sin(a) * r * 0.5, 2, 2, '#c2c3c7'); }
    }
    const lx = x + Math.sin(ang) * 14, ly = y - 4 - Math.cos(ang) * 14;
    R(lx - 8, ly + 3, 1, 1, '#38b764'); R(lx + 7, ly - 2, 1, 1, '#a7f070'); R(lx - 3, ly + 8, 1, 1, '#38b764'); R(lx + 4, ly + 6, 1, 1, '#38b764');
  }

  function drawPerson(p) {
    let x = Math.round(p.x), y = Math.round(p.y);
    if (PLAIN) return drawStand(p, x, y);
    if (p.dead) return;
    if (false) return drawStand(p, x, y);
    if (p.shake > 0) x += (Math.floor(T * 16) % 2) ? 1 : -1;
    if (p.state === 'sleep' || p.state === 'sickBed') return drawInBed(p);
    if (p.state === 'pinned' && p.pinTree) return drawPinned(p, x, y);
    if (p.down) drawLying(p, x, y); else drawStand(p, x, y);
    if (p.state === 'falling' && p.pinTree) drawFalling(p);
  }

  // 頭上只留愛心；生氣改成畫在臉上（紅臉、眉毛、冒蒸氣）
  const ICONS = {
    heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  };
  function drawIcons(p) {
    if (PLAIN || p.dead) return;
    const k = p.anger > 0 ? null : p.heart > 0 ? 'heart' : null;
    if (!k) return;
    const bob = Math.floor(T * 3) % 2;
    const x = Math.round(p.x) - 3, y = Math.max(1, Math.round(p.y) - (p.down ? 13 : p.look.h + 9) - bob - (p.carry ? 4 : 0));
    R(x - 1, y - 1, 9, 8, C.dark);
    g.fillStyle = k === 'heart' ? '#e43b44' : '#ff5a3a';
    ICONS[k].forEach((row, j) => { for (let i = 0; i < 7; i++) if (row[i] === 'X') g.fillRect(x + i, y + j, 1, 1); });
  }

  function drawFightDust() {
    if (PLAIN) return;
    const done = new Set();
    for (const p of folk) if (p.state === 'fight' && p.target && !done.has(p.target)) {
      done.add(p);
      const cx = (p.x + p.target.x) / 2, cy = (p.y + p.target.y) / 2 - 5;
      for (let i = 0; i < 6; i++) {
        const a = T * 5 + i * 1.05;
        R(cx + Math.cos(a) * 8, cy + Math.sin(a) * 4, 3, 2, '#c2c3c7');
      }
    }
  }

  function drawRain() {
    if (rain <= 0) return;
    g.fillStyle = 'rgba(26,28,44,0.22)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#73eff7';
    for (const d of rainDrops) {
      const y = ((d[1] + T * 90 * d[2]) % (H + 4)) - 2;
      g.fillRect(Math.round(d[0] - y * 0.2 + W) % W, Math.round(y), 1, 2);
    }
  }

  function draw() {
    drawWorld();
    const order = folk.slice().sort((a, b) => a.y - b.y);
    order.filter(p => p.down && !PLAIN).forEach(drawPerson);
    order.filter(p => !(p.down && !PLAIN)).forEach(drawPerson);
    drawFightDust();
    drawRain();
    order.forEach(drawIcons);
  }

  // ---- 主迴圈：固定步長，fast 只改每幀跑幾步 ----
  const DT = 1 / 30;
  let acc = 0, last = null;
  function frame(now) {
    if (last === null) last = now;
    acc += Math.min(0.25, (now - last) / 1000) * FAST;
    last = now;
    while (acc >= DT) { step(DT); acc -= DT; }
    draw();
    requestAnimationFrame(frame);
  }
  window.FOLK_SIM = { get t() { return T; } };
  requestAnimationFrame(frame);
})();
