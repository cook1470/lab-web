// 軍蛇：身體就是軍隊的倖存者原型
'use strict';
const cv = document.getElementById('c'), g = cv.getContext('2d');
let SC = 2, VW = 320, VH = 180;
function resize() {
  SC = Math.max(1, Math.round(innerHeight / 190));
  VW = Math.ceil(innerWidth / SC); VH = Math.ceil(innerHeight / SC);
  cv.width = VW; cv.height = VH;
  cv.style.width = VW * SC + 'px'; cv.style.height = VH * SC + 'px';
  g.imageSmoothingEnabled = false;
}
addEventListener('resize', resize); resize();

const Q = new URLSearchParams(location.search);
const ARENA = 1000, SP = 9, BOSS_T = 270;
const TYPES = {
  bow:    { col: '#38b764', dark: '#257179', hp: 5 },
  fire:   { col: '#ef7d57', dark: '#b13e53', hp: 5 },
  shield: { col: '#41a6f6', dark: '#3b5dc9', hp: 14 },
};
const TKEYS = Object.keys(TYPES);

// ---------- 音效（程式合成） ----------
let AC = null; const lastS = {};
function snd(name, f, dur, type = 'square', vol = .08, slide = 0, gap = 0.04) {
  if (!AC) return; const now = AC.currentTime;
  if (lastS[name] && now - lastS[name] < gap) return; lastS[name] = now;
  const o = AC.createOscillator(), gn = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, now);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), now + dur);
  gn.gain.setValueAtTime(vol, now); gn.gain.exponentialRampToValueAtTime(0.001, now + dur);
  o.connect(gn).connect(AC.destination); o.start(now); o.stop(now + dur);
}
function noise(name, dur, vol = .1, gap = .05) {
  if (!AC) return; const now = AC.currentTime;
  if (lastS[name] && now - lastS[name] < gap) return; lastS[name] = now;
  const b = AC.createBuffer(1, AC.sampleRate * dur, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = AC.createBufferSource(), gn = AC.createGain(); s.buffer = b; gn.gain.value = vol;
  s.connect(gn).connect(AC.destination); s.start(now);
}
function unlock() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } else if (AC.state === 'suspended') AC.resume(); }

// ---------- 輸入 ----------
const keys = {}; let stick = null; // {id,ox,oy,x,y}
addEventListener('keydown', e => { keys[e.code] = true; unlock(); });
addEventListener('keyup', e => { keys[e.code] = false; });
function toV(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / SC, (e.clientY - r.top) / SC]; }
cv.addEventListener('pointerdown', e => {
  unlock(); const [x, y] = toV(e);
  if (state !== 'play') { tapUI(x, y); return; }
  if (!stick && x < VW / 2) { stick = { id: e.pointerId, ox: x, oy: y, x, y }; }
  else tapUI(x, y);
});
cv.addEventListener('pointermove', e => { if (stick && e.pointerId === stick.id) { [stick.x, stick.y] = toV(e); } });
const endP = e => { if (stick && e.pointerId === stick.id) stick = null; };
cv.addEventListener('pointerup', endP); cv.addEventListener('pointercancel', endP);

// ---------- 狀態 ----------
let state, T, head, trail, segs, loose, foes, shots, eshots, bombs, gems, parts, nums, shake, xp, growN, spawnAcc, boss, pickOpts, overT, kills, lvl, hitStop;
function reset() {
  state = 'play'; T = +(Q.get('t') || 0); kills = 0;
  head = { x: ARENA / 2, y: ARENA / 2, a: 0, hp: 5, inv: 0 };
  trail = []; for (let i = 0; i < 400; i++) trail.push({ x: head.x - i, y: head.y });
  segs = ['bow', 'shield', 'bow'].map(mk);
  loose = []; foes = []; shots = []; eshots = []; bombs = []; gems = []; parts = []; nums = [];
  shake = 0; xp = 0; growN = 0; spawnAcc = 0; boss = null; overT = 0; hitStop = 0;
  lvl = { bow: 1, fire: 1, shield: 1 };
  const n = +(Q.get('len') || 0); for (let i = 0; i < n; i++) segs.push(mk(TKEYS[i % 3]));
}
function mk(type) { return { type, hp: TYPES[type].hp, cd: Math.random(), fl: 0, x: 0, y: 0 }; }

// 沿著軌跡取第 d 像素的位置
function along(d) { const i = Math.min(trail.length - 1, Math.floor(d)); return trail[i]; }

function num(x, y, v, c = '#fff') { nums.push({ x, y, v, c, t: 0 }); }
function burst(x, y, c, n = 6, sp = 40) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = Math.random() * sp; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: .3 + Math.random() * .3, c }); } }

function nearestFoe(x, y, r) { let b = null, bd = r * r; for (const f of foes) { const d = (f.x - x) ** 2 + (f.y - y) ** 2; if (d < bd) { bd = d; b = f; } } return b; }

// ---------- 新敵人：不吃「原地轉圈縮成一團」那套 ----------
function segCentroid() {
  if (!segs.length) return { x: head.x, y: head.y };
  let sx = 0, sy = 0; for (const s of segs) { sx += s.x; sy += s.y; }
  return { x: sx / segs.length, y: sy / segs.length };
}
function nearestTargetPos(f) {
  let tx = head.x, ty = head.y, best = (f.x - tx) ** 2 + (f.y - ty) ** 2;
  for (let i = 0; i < segs.length; i += 2) { const s = segs[i], d = (f.x - s.x) ** 2 + (f.y - s.y) ** 2; if (d < best) { best = d; tx = s.x; ty = s.y; } }
  return { x: tx, y: ty, d: Math.sqrt(best) };
}
// 投手：保持距離、定時對「蛇頭當前位置」丟一顆有預警的炸彈——轉圈時頭幾乎不動，躲不掉；走位時頭跑得遠，躲得掉
function updateLobber(f, dt) {
  const t = nearestTargetPos(f), pref = 100, d = t.d || 1;
  if (t.d < pref - 14) { f.x -= (t.x - f.x) / d * f.spd * dt; f.y -= (t.y - f.y) / d * f.spd * dt; }
  else if (t.d > pref + 14) { f.x += (t.x - f.x) / d * f.spd * dt; f.y += (t.y - f.y) / d * f.spd * dt; }
  f.atkCd -= dt;
  if (f.atkCd <= 0 && t.d < 260) {
    f.atkCd = 2.2 + Math.random() * .6; f.fl = .15;
    bombs.push({ x: head.x, y: head.y, t: 0, warn: .8, r: 16, dmg: 2, boomed: false });
    snd('lob', 240, .1, 'sawtooth', .05, .6, .05);
  }
}
// 地雷蟲：往身體重心（轉圈時＝圓心，密度最高）鑽，鑽到定點後預警、爆炸，範圍內全打
function updateBurrower(f, dt) {
  if (f.st === 'warn') {
    f.warnT -= dt;
    if (f.warnT <= 0) {
      f.st = 'erupt'; f.erT = .28;
      burst(f.x, f.y, '#ef7d57', 20, 90); burst(f.x, f.y, '#ffcd75', 10, 70);
      shake = Math.max(shake, 6); snd('burrow2', 80, .3, 'sawtooth', .12, .4, 0);
      if (Math.hypot(head.x - f.x, head.y - f.y) < 34) hurtHead(2);
      for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (Math.hypot(s.x - f.x, s.y - f.y) < 34) hurtSeg(i, 3); }
    }
    return;
  }
  if (f.st === 'erupt') { f.erT -= dt; if (f.erT <= 0) f.dead = true; return; }
  const c = segCentroid(), d = Math.hypot(c.x - f.x, c.y - f.y) || 1;
  f.x += (c.x - f.x) / d * f.spd * dt; f.y += (c.y - f.y) / d * f.spd * dt;
  if (d < 16) { f.st = 'warn'; f.warnT = .9; snd('burrow', 60, .4, 'sawtooth', .1, .4, 0); }
}
// 尾獵者：不管誰最近，直衝隊伍最後一節，咬到就重傷——散開走位時尾巴不好追，縮成一團時尾巴就在圓心旁邊
function updateTailhunter(f, dt) {
  const tgt = segs.length ? segs[segs.length - 1] : head;
  const d = Math.hypot(tgt.x - f.x, tgt.y - f.y) || 1;
  f.x += (tgt.x - f.x) / d * f.spd * dt; f.y += (tgt.y - f.y) / d * f.spd * dt;
  if (f.hc <= 0 && d < f.r + 5) { f.hc = .7; if (segs.length) hurtSeg(segs.length - 1, f.dmg); else hurtHead(1); snd('bite', 150, .1, 'square', .08, .3, .05); }
}

function hurtFoe(f, dmg, kx = 0, ky = 0) {
  f.hp -= dmg; f.fl = .08; f.x += kx; f.y += ky;
  num(f.x + (Math.random() * 6 - 3), f.y - f.r, dmg, dmg >= 5 ? '#ffcd75' : '#f4f4f4');
  snd('hit', 200 + Math.random() * 80, .05, 'square', .03, .5, .03);
  if (f.hp <= 0 && !f.dead) {
    f.dead = true; kills++;
    burst(f.x, f.y, f.col, f.boss ? 60 : 8, f.boss ? 120 : 50);
    const n = f.boss ? 0 : f.xp; for (let i = 0; i < n; i++) gems.push({ x: f.x + Math.random() * 8 - 4, y: f.y + Math.random() * 8 - 4, heart: false });
    if (Math.random() < .01) gems.push({ x: f.x, y: f.y, heart: true });
    snd('die', 120, .12, 'sawtooth', .05, .4, .03); shake = Math.max(shake, f.boss ? 12 : 1.5);
    if (f.boss) { state = 'win'; overT = 0; hitStop = .5; snd('win', 440, .8, 'square', .1, 2, 0); }
  }
}

function breakSeg(i) {
  const s = segs[i];
  burst(s.x, s.y, TYPES[s.type].col, 14, 70); burst(s.x, s.y, '#f4f4f4', 6, 40);
  shake = Math.max(shake, 5); hitStop = .06;
  noise('brk', .25, .18, .02); snd('brk2', 90, .3, 'sawtooth', .1, .3, .02);
  const tail = segs.splice(i);
  tail.shift();
  for (const t of tail) { loose.push({ ...t, t: 0 }); }
  num(s.x, s.y - 8, '✂', '#b13e53');
}

function spawnFoe() {
  const a = Math.random() * 6.28, R = Math.max(VW, VH) * .6 + 20;
  const x = Math.min(ARENA, Math.max(0, head.x + Math.cos(a) * R)), y = Math.min(ARENA, Math.max(0, head.y + Math.sin(a) * R));
  const rr = Math.random(); let f;
  // 逐波：12-48s 投手佔多數、60-95s 地雷蟲佔多數、110-145s 尾獵者佔多數；之後三種都會低頻繼續出現
  if (T > 110 && T < 145 && rr < .6) f = { kind: 'tailhunter', hp: 6 + T / 40, r: 4, spd: 62, dmg: 4, xp: 2, col: '#a7f070', hc: 0 };
  else if (T > 60 && T < 95 && rr < .55) f = { kind: 'burrower', hp: 12 + T / 25, r: 6, spd: 15, dmg: 0, xp: 4, col: '#566c86', st: 'walk' };
  else if (T > 12 && T < 48 && rr < .6) f = { kind: 'lobber', hp: 6 + T / 40, r: 4, spd: 24, dmg: 1, xp: 3, col: '#257179', atkCd: .8 + Math.random() * .6 };
  else if (T > 145 && rr < .18) f = { kind: 'tailhunter', hp: 6 + T / 40, r: 4, spd: 62, dmg: 4, xp: 2, col: '#a7f070', hc: 0 };
  else if (T > 95 && rr < .16) f = { kind: 'burrower', hp: 12 + T / 25, r: 6, spd: 15, dmg: 0, xp: 4, col: '#566c86', st: 'walk' };
  else if (T > 48 && rr < .18) f = { kind: 'lobber', hp: 6 + T / 40, r: 4, spd: 24, dmg: 1, xp: 3, col: '#257179', atkCd: 1 + Math.random() };
  else if (T > 150 && rr < .3) f = { kind: 'brute', hp: 26 + T / 10, r: 7, spd: 20, dmg: 3, xp: 5, col: '#5d275d' };
  else if (T > 50 && rr < .6) f = { kind: 'bat', hp: 2 + T / 60, r: 3, spd: 52, dmg: 1, xp: 1, col: '#73eff7' };
  else f = { kind: 'slime', hp: 4 + T / 25, r: 4, spd: 26 + T / 30, dmg: 1, xp: 1, col: '#b13e53' };
  Object.assign(f, { x, y, max: f.hp, fl: 0, hc: f.hc || 0, ph: Math.random() * 6 });
  foes.push(f);
}

function grow() {
  growN++;
  if (growN % 4 === 0) {
    state = 'pick'; pickOpts = TKEYS.slice(); snd('lv', 523, .15, 'square', .08, 1.5, 0);
    return;
  }
  // 平常長出：複製隊伍中最多的兵種以外隨機一種
  const t = segs.length ? segs[Math.floor(Math.random() * segs.length)].type : 'bow';
  addTail(t);
}
function addTail(t) {
  const s = mk(t); const p = along((segs.length + 1) * SP); s.x = p.x; s.y = p.y; segs.push(s);
  burst(s.x, s.y, '#ffcd75', 8, 30); snd('grow', 660, .08, 'square', .06, 1.4, .02);
  num(s.x, s.y - 8, '+1', '#a7f070');
}

function tapUI(x, y) {
  if (state === 'pick') {
    const bw = 64, gap = 12, sx = VW / 2 - (bw * 3 + gap * 2) / 2, by = VH / 2 - bw / 2;
    for (let i = 0; i < 3; i++) {
      const bx = sx + i * (bw + gap);
      if (x > bx && x < bx + bw && y > by && y < by + bw) {
        const t = pickOpts[i]; lvl[t]++; addTail(t); addTail(t); state = 'play';
        snd('pk', 784, .2, 'square', .08, 1.5, 0); shake = 3;
      }
    }
  } else if ((state === 'over' || state === 'win') && overT > 1) reset();
}

// ---------- 更新 ----------
function update(dt) {
  if (state === 'over' || state === 'win') { overT += dt; }
  if (state === 'pick') {
    if (keys.Digit1 || keys.Digit2 || keys.Digit3) { const i = keys.Digit1 ? 0 : keys.Digit2 ? 1 : 2; keys.Digit1 = keys.Digit2 = keys.Digit3 = false; const bw = 64, gap = 12, sx = VW / 2 - (bw * 3 + gap * 2) / 2; tapUI(sx + i * (bw + gap) + 5, VH / 2); }
    return;
  }
  if (hitStop > 0) { hitStop -= dt; return; }
  if (state !== 'play') { stepFx(dt); return; }
  T += dt;

  // 方向
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let iy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (stick) { const dx = stick.x - stick.ox, dy = stick.y - stick.oy; if (Math.hypot(dx, dy) > 4) { ix = dx; iy = dy; } }
  if (Q.get('auto')) { ix = Math.cos(T * .7); iy = Math.sin(T * .9); }
  if (ix || iy) {
    const ta = Math.atan2(iy, ix); let da = ta - head.a;
    while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
    const turn = 7 * dt; head.a += Math.max(-turn, Math.min(turn, da));
  }
  const spd = 72;
  let nx = head.x + Math.cos(head.a) * spd * dt, ny = head.y + Math.sin(head.a) * spd * dt;
  if (nx < 4 || nx > ARENA - 4) { head.a = Math.PI - head.a; nx = Math.max(4, Math.min(ARENA - 4, nx)); }
  if (ny < 4 || ny > ARENA - 4) { head.a = -head.a; ny = Math.max(4, Math.min(ARENA - 4, ny)); }
  // 軌跡：每 1 像素記一點
  let lx = trail[0].x, ly = trail[0].y, dist = Math.hypot(nx - lx, ny - ly);
  const steps = Math.floor(dist);
  for (let i = 1; i <= steps; i++) trail.unshift({ x: lx + (nx - lx) * i / dist, y: ly + (ny - ly) * i / dist });
  head.x = nx; head.y = ny;
  const need = (segs.length + 3) * SP + 10; if (trail.length > need) trail.length = need;
  while (trail.length < need) trail.push(trail[trail.length - 1]);
  head.inv -= dt;

  // 各節武器
  segs.forEach((s, i) => {
    const p = along((i + 1) * SP); s.x = p.x; s.y = p.y; s.fl -= dt; s.cd -= dt;
    const L = lvl[s.type];
    if (s.type === 'bow' && s.cd <= 0) {
      const f = nearestFoe(s.x, s.y, 110); if (f) {
        const a = Math.atan2(f.y - s.y, f.x - s.x);
        shots.push({ x: s.x, y: s.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, dmg: 2 + L, life: .7, kind: 'arrow', pierce: Math.floor(L / 3) });
        s.cd = Math.max(.35, .9 - L * .06); snd('bow', 900, .04, 'triangle', .03, .6, .05);
      }
    }
    if (s.type === 'fire' && s.cd <= 0) {
      const f = nearestFoe(s.x, s.y, 48); if (f) {
        const a = Math.atan2(f.y - s.y, f.x - s.x) + (Math.random() - .5) * .5, v = 110;
        shots.push({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: 1 + Math.floor(L / 2), life: .38, kind: 'fire', pierce: 99, hitset: new Set() });
        s.cd = .12; if (Math.random() < .3) noise('fire', .08, .03, .08);
      }
    }
    if (s.type === 'shield' && s.cd <= 0) {
      const R = 20 + L * 2; let hit = false;
      for (const f of foes) { const d = Math.hypot(f.x - s.x, f.y - s.y); if (d < R + f.r && !f.dead) { hit = true; hurtFoe(f, 1 + L, (f.x - s.x) / d * (f.boss ? 1 : 14), (f.y - s.y) / d * (f.boss ? 1 : 14)); } }
      if (hit) { parts.push({ ring: R, x: s.x, y: s.y, t: 0, life: .25, c: '#41a6f6' }); snd('bash', 150, .1, 'square', .06, .5, .1); s.cd = Math.max(.6, 1.3 - L * .08); }
    }
  });

  // 散落的兵：頭碰到就接回尾巴；太久沒撿就消失
  for (const l of loose) {
    l.t += dt;
    if (Math.hypot(l.x - head.x, l.y - head.y) < 10) { l.got = true; const t = mk(l.type); t.hp = Math.max(2, l.hp); addTail(t.type); snd('regain', 880, .12, 'square', .08, 1.3, .02); }
    else if (l.t > 7) { l.got = true; burst(l.x, l.y, '#333c57', 5, 20); }
  }
  loose = loose.filter(l => !l.got);

  // 生怪
  if (T < BOSS_T) {
    spawnAcc += dt * (1.2 + T / 22);
    while (spawnAcc > 1 && foes.length < 260) { spawnAcc--; spawnFoe(); }
  } else if (!boss) {
    boss = { kind: 'boss', boss: true, hp: 900, max: 900, r: 14, spd: 20, dmg: 3, xp: 0, col: '#b13e53', x: head.x + 150, y: head.y, fl: 0, hc: 0, ph: 0, sh: 2 };
    foes.push(boss); shake = 10; snd('boss', 60, 1.2, 'sawtooth', .15, .5, 0);
  }
  if (boss && !boss.dead) {
    boss.sh -= dt; spawnAcc += dt * 3; while (spawnAcc > 1) { spawnAcc--; spawnFoe(); }
    if (boss.sh <= 0) { boss.sh = 2.4; const off = Math.random(); for (let i = 0; i < 16; i++) { const a = (i + off) / 16 * 6.283; eshots.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * 55, vy: Math.sin(a) * 55, life: 4 }); } snd('bshot', 220, .3, 'sawtooth', .08, .3, 0); }
  }

  // 敵人：追最近的一節
  for (const f of foes) {
    f.fl -= dt; f.hc -= dt; f.ph += dt * 8;
    if (f.kind === 'lobber') { updateLobber(f, dt); continue; }
    if (f.kind === 'burrower') { updateBurrower(f, dt); continue; }
    if (f.kind === 'tailhunter') { updateTailhunter(f, dt); continue; }
    let tx = head.x, ty = head.y, best = (f.x - tx) ** 2 + (f.y - ty) ** 2, tgt = -1;
    for (let i = 0; i < segs.length; i += 2) { const s = segs[i], d = (f.x - s.x) ** 2 + (f.y - s.y) ** 2; if (d < best) { best = d; tx = s.x; ty = s.y; tgt = i; } }
    const d = Math.sqrt(best) || 1;
    f.x += (tx - f.x) / d * f.spd * dt; f.y += (ty - f.y) / d * f.spd * dt;
    // 接觸傷害
    if (f.hc <= 0) {
      if (Math.hypot(f.x - head.x, f.y - head.y) < f.r + 4) { f.hc = .8; hurtHead(f.dmg); }
      else for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (Math.hypot(f.x - s.x, f.y - s.y) < f.r + 4) { f.hc = .8; hurtSeg(i, f.dmg); break; } }
    }
  }
  // 敵人彼此推開（簡易）
  for (let i = 0; i < foes.length; i++) { const a = foes[i]; for (let j = i + 1; j < Math.min(foes.length, i + 12); j++) { const b = foes[j], dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy), m = a.r + b.r; if (dd < m && dd > 0) { const p = (m - dd) / 2 / dd; if (!a.boss) { a.x -= dx * p; a.y -= dy * p; } if (!b.boss) { b.x += dx * p; b.y += dy * p; } } } }

  // 投手的炸彈：預警完就在原地爆，範圍內全打（頭跑得遠躲得掉，轉圈躲不掉）
  for (const b of bombs) {
    b.t += dt;
    if (b.t >= b.warn && !b.boomed) {
      b.boomed = true;
      burst(b.x, b.y, '#ef7d57', 14, 70);
      shake = Math.max(shake, 4); snd('boom', 100, .2, 'sawtooth', .08, .4, 0);
      if (Math.hypot(head.x - b.x, head.y - b.y) < b.r + 4) hurtHead(1);
      for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (Math.hypot(s.x - b.x, s.y - b.y) < b.r + 4) hurtSeg(i, b.dmg); }
    }
  }
  bombs = bombs.filter(b => b.t < b.warn + .3);

  // 子彈
  for (const b of shots) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    for (const f of foes) {
      if (f.dead || b.life <= 0) continue;
      if (Math.abs(f.x - b.x) < f.r + 2 && Math.abs(f.y - b.y) < f.r + 2) {
        if (b.hitset) { if (b.hitset.has(f)) continue; b.hitset.add(f); }
        hurtFoe(f, b.dmg, b.vx * .01, b.vy * .01);
        if (b.kind === 'arrow') { burst(b.x, b.y, '#f4f4f4', 2, 30); if (b.pierce-- <= 0) b.life = 0; }
        else if (Math.random() < .5) burst(b.x, b.y, '#ffcd75', 2, 20);
      }
    }
  }
  shots = shots.filter(b => b.life > 0);
  for (const b of eshots) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (Math.hypot(b.x - head.x, b.y - head.y) < 5) { b.life = 0; hurtHead(1); continue; }
    for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (Math.hypot(b.x - s.x, b.y - s.y) < 5) { b.life = 0; if (s.type === 'shield') { burst(b.x, b.y, '#41a6f6', 4, 30); snd('blk', 1200, .05, 'square', .04, .5, .05); } else hurtSeg(i, 2); break; } }
  }
  eshots = eshots.filter(b => b.life > 0);
  foes = foes.filter(f => !f.dead);

  // 掉落物
  for (const gm of gems) {
    const d = Math.hypot(gm.x - head.x, gm.y - head.y);
    if (d < 34) { gm.x += (head.x - gm.x) / d * 150 * dt; gm.y += (head.y - gm.y) / d * 150 * dt; }
    if (d < 6) {
      gm.got = true;
      if (gm.heart) { head.hp = Math.min(5, head.hp + 1); snd('hrt', 660, .2, 'triangle', .1, 2, 0); num(head.x, head.y - 10, '♥', '#b13e53'); }
      else { xp++; snd('gem', 1200 + Math.min(xp, 20) * 30, .04, 'sine', .04, 1.2, .025); if (xp >= 4 + segs.length) { xp = 0; grow(); } }
    }
  }
  gems = gems.filter(gm => !gm.got);
  stepFx(dt);
}
function stepFx(dt) {
  for (const p of parts) { p.t += dt; if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .9; p.vy *= .9; } }
  parts = parts.filter(p => p.t < p.life);
  for (const n of nums) n.t += dt; nums = nums.filter(n => n.t < .6);
  shake *= Math.pow(.02, dt);
}
function hurtHead(d) {
  if (head.inv > 0) return;
  head.hp -= 1; head.inv = 1; shake = 8; hitStop = .08;
  burst(head.x, head.y, '#ffcd75', 12, 60); snd('hh', 110, .3, 'square', .12, .4, 0);
  if (head.hp <= 0) { state = 'over'; overT = 0; burst(head.x, head.y, '#b13e53', 40, 100); noise('dead', .6, .2, 0); }
}
function hurtSeg(i, d) {
  const s = segs[i]; s.hp -= d; s.fl = .12; num(s.x, s.y - 6, '-' + d, '#ef7d57'); shake = Math.max(shake, 2);
  snd('sh', 300, .08, 'square', .06, .4, .05);
  if (s.hp <= 0) breakSeg(i);
}

// ---------- 繪圖 ----------
function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
function drawUnit(x, y, type, a, fl, blink) {
  const t = TYPES[type]; x = Math.round(x); y = Math.round(y);
  if (blink && Math.floor(performance.now() / 100) % 2) return;
  R(x - 3, y + 3, 7, 2, 'rgba(0,0,0,.35)');
  R(x - 3, y - 3, 7, 6, fl > 0 ? '#fff' : t.col);
  R(x - 3, y - 4, 7, 2, fl > 0 ? '#fff' : t.dark);
  const ex = Math.round(Math.cos(a) * 2), ey = Math.round(Math.sin(a) * 1);
  R(x + ex - 1, y - 1 + ey, 1, 1, '#1a1c2c'); R(x + ex + 1, y - 1 + ey, 1, 1, '#1a1c2c');
  if (type === 'bow') { R(x + 4, y - 3, 1, 6, '#94b0c2'); R(x + 3, y - 4, 1, 1, '#94b0c2'); R(x + 3, y + 3, 1, 1, '#94b0c2'); }
  if (type === 'fire') { R(x + 4, y - 4, 2, 2, '#ffcd75'); R(x + 4, y - 2, 1, 3, '#566c86'); }
  if (type === 'shield') { R(x - 5, y - 3, 2, 6, '#f4f4f4'); R(x - 5, y - 1, 2, 2, '#ffcd75'); }
}
function drawIcon(x, y, type, s) { // 放大的兵種圖示（選擇畫面用）
  g.save(); g.translate(x, y); g.scale(s, s); drawUnit(0, 0, type, 0, 0); g.restore();
}
function render() {
  const cx = Math.round(head.x - VW / 2 + (Math.random() - .5) * shake), cy = Math.round(head.y - VH / 2 + (Math.random() - .5) * shake);
  R(0, 0, VW, VH, '#1a1c2c');
  g.save(); g.translate(-cx, -cy);
  // 地板格紋
  const gs = 32;
  for (let x = Math.floor(cx / gs) * gs; x < cx + VW; x += gs) for (let y = Math.floor(cy / gs) * gs; y < cy + VH; y += gs) {
    if (x < 0 || y < 0 || x >= ARENA || y >= ARENA) continue;
    R(x, y, gs, gs, ((x + y) / gs) % 2 ? '#29366f' : '#2c3a74');
    if ((x * 7 + y * 13) % 5 === 0) R(x + 9, y + 20, 2, 1, '#333c57');
  }
  R(-4, -4, ARENA + 8, 4, '#566c86'); R(-4, ARENA, ARENA + 8, 4, '#566c86'); R(-4, 0, 4, ARENA, '#566c86'); R(ARENA, 0, 4, ARENA, '#566c86');

  for (const gm of gems) { if (gm.heart) { R(gm.x - 2, gm.y - 2, 2, 2, '#b13e53'); R(gm.x, gm.y - 2, 2, 2, '#b13e53'); R(gm.x - 1, gm.y, 2, 2, '#b13e53'); } else { R(gm.x - 1, gm.y - 1, 3, 3, '#a7f070'); R(gm.x, gm.y - 1, 1, 1, '#f4f4f4'); } }
  for (const l of loose) drawUnit(l.x, l.y, l.type, 1.57, 0, l.t > 4);
  // 散落兵的呼喚圈
  for (const l of loose) { const r = 6 + (l.t * 10 % 4); g.strokeStyle = '#ffcd75'; g.globalAlpha = .5; g.strokeRect(Math.round(l.x - r), Math.round(l.y - r), r * 2, r * 2); g.globalAlpha = 1; }

  // 身體（從尾巴畫到頭）
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i], p2 = along((i + 1) * SP - 3), a = Math.atan2(p2.y - s.y, p2.x - s.x);
    drawUnit(s.x, s.y, s.type, a, s.fl);
    const mh = TYPES[s.type].hp; if (s.hp < mh) { R(s.x - 3, s.y + 5, 7, 1, '#333c57'); R(s.x - 3, s.y + 5, Math.ceil(7 * s.hp / mh), 1, '#a7f070'); }
  }
  // 頭
  if (state !== 'over') {
    const hx = Math.round(head.x), hy = Math.round(head.y);
    if (!(head.inv > 0 && Math.floor(T * 20) % 2)) {
      R(hx - 4, hy + 4, 9, 2, 'rgba(0,0,0,.35)');
      R(hx - 4, hy - 4, 9, 8, '#ffcd75'); R(hx - 4, hy - 6, 9, 2, '#f4f4f4');
      R(hx - 4, hy - 8, 1, 2, '#ffcd75'); R(hx, hy - 8, 1, 2, '#ffcd75'); R(hx + 4, hy - 8, 1, 2, '#ffcd75');
      const ex = Math.round(Math.cos(head.a) * 2), ey = Math.round(Math.sin(head.a) * 2);
      R(hx + ex - 2, hy + ey - 1, 1, 2, '#1a1c2c'); R(hx + ex + 1, hy + ey - 1, 1, 2, '#1a1c2c');
      R(hx + Math.round(Math.cos(head.a) * 7), hy + Math.round(Math.sin(head.a) * 7), 1, 1, '#f4f4f4');
    }
  }
  // 敵人
  for (const f of foes) {
    const x = Math.round(f.x), y = Math.round(f.y), c = f.fl > 0 ? '#fff' : f.col, r = f.r;
    R(x - r, y + r - 1, r * 2, 2, 'rgba(0,0,0,.35)');
    if (f.kind === 'bat') { const w = Math.sin(f.ph) > 0 ? -2 : 1; R(x - 2, y - 2, 4, 4, c); R(x - 5, y - 1 + w, 3, 2, c); R(x + 2, y - 1 + w, 3, 2, c); R(x - 1, y - 1, 1, 1, '#b13e53'); R(x + 1, y - 1, 1, 1, '#b13e53'); }
    else if (f.kind === 'lobber') {
      R(x - 3, y - 3, 6, 6, f.fl > 0 ? '#fff' : c); R(x - 3, y - 4, 6, 1, '#94b0c2');
      R(x - 1, y - 7, 2, 4, '#94b0c2'); R(x - 2, y - 8, 4, 2, '#ffcd75');
      if (f.hp < f.max) { R(x - r, y - r - 3, r * 2, 1, '#333c57'); R(x - r, y - r - 3, Math.ceil(r * 2 * f.hp / f.max), 1, '#a7f070'); }
    }
    else if (f.kind === 'burrower') {
      if (f.st === 'warn') {
        const k = 1 - f.warnT / .9; R(x - 5, y - 2, 10, 4, '#566c86'); R(x - 4, y - 3, 8, 1, '#333c57');
        g.strokeStyle = '#ef7d57'; g.globalAlpha = .4 + .4 * Math.sin(k * 30); g.beginPath(); g.arc(x, y, 4 + k * 26, 0, 6.3); g.stroke(); g.globalAlpha = 1;
      } else if (f.st === 'erupt') {
        g.strokeStyle = '#ffcd75'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, (1 - f.erT / .28) * 34, 0, 6.3); g.stroke(); g.lineWidth = 1;
      } else {
        R(x - 4, y - 2, 8, 5, c); R(x - 3, y - 3, 6, 2, '#333c57');
        if (f.hp < f.max) { R(x - r, y - r - 3, r * 2, 1, '#333c57'); R(x - r, y - r - 3, Math.ceil(r * 2 * f.hp / f.max), 1, '#a7f070'); }
      }
    }
    else if (f.kind === 'tailhunter') {
      const ea = Math.atan2((segs.length ? segs[segs.length - 1].y : head.y) - y, (segs.length ? segs[segs.length - 1].x : head.x) - x);
      R(x - 3, y - 2, 6, 4, c); R(Math.round(x + Math.cos(ea) * 3) - 1, Math.round(y + Math.sin(ea) * 3) - 1, 2, 2, '#1a1c2c');
      if (f.hp < f.max) { R(x - r, y - r - 3, r * 2, 1, '#333c57'); R(x - r, y - r - 3, Math.ceil(r * 2 * f.hp / f.max), 1, '#a7f070'); }
    }
    else if (f.boss) {
      const b = Math.round(Math.sin(f.ph * .5) * 2);
      R(x - r, y - r + b, r * 2, r * 2 - b, c); R(x - r + 2, y - r - 3 + b, 4, 4, '#5d275d'); R(x + r - 6, y - r - 3 + b, 4, 4, '#5d275d');
      R(x - 7, y - 4 + b, 4, 4, '#ffcd75'); R(x + 3, y - 4 + b, 4, 4, '#ffcd75'); R(x - 6, y + 4 + b, 12, 3, '#1a1c2c');
    } else {
      const b = Math.round(Math.abs(Math.sin(f.ph * .6)) * (f.kind === 'brute' ? 1 : 2));
      R(x - r, y - r + 1 + b, r * 2, r * 2 - 1 - b, c); R(x - r + 1, y - r + b, r * 2 - 2, 1, c);
      R(x - 2, y - 1 + b, 1, 1, '#f4f4f4'); R(x + 1, y - 1 + b, 1, 1, '#f4f4f4');
      if (f.kind === 'brute') { R(x - r - 1, y - r - 1 + b, 2, 3, '#94b0c2'); R(x + r - 1, y - r - 1 + b, 2, 3, '#94b0c2'); }
      if (f.hp < f.max) { R(x - r, y - r - 3, r * 2, 1, '#333c57'); R(x - r, y - r - 3, Math.ceil(r * 2 * f.hp / f.max), 1, '#b13e53'); }
    }
  }
  for (const b of bombs) {
    if (b.t < b.warn) {
      const k = b.t / b.warn; g.strokeStyle = '#ef7d57'; g.globalAlpha = .35 + .45 * Math.sin(k * 26);
      g.beginPath(); g.arc(Math.round(b.x), Math.round(b.y), b.r, 0, 6.3); g.stroke(); g.globalAlpha = 1;
      R(b.x - 1, b.y - 1, 3, 3, '#ef7d57');
    } else if (b.t < b.warn + .3) {
      g.strokeStyle = '#ffcd75'; g.lineWidth = 2; g.beginPath(); g.arc(Math.round(b.x), Math.round(b.y), b.r * (1 + (b.t - b.warn) * 3), 0, 6.3); g.stroke(); g.lineWidth = 1;
    }
  }
  for (const b of shots) {
    if (b.kind === 'arrow') { const a = Math.atan2(b.vy, b.vx); R(b.x, b.y, 1, 1, '#f4f4f4'); R(b.x - Math.cos(a) * 2, b.y - Math.sin(a) * 2, 1, 1, '#94b0c2'); R(b.x - Math.cos(a) * 4, b.y - Math.sin(a) * 4, 1, 1, '#94b0c2'); }
    else { const k = b.life / .38; R(b.x - 1, b.y - 1, 3, 3, k > .6 ? '#ffcd75' : k > .3 ? '#ef7d57' : '#b13e53'); }
  }
  for (const b of eshots) { R(b.x - 2, b.y - 2, 4, 4, '#5d275d'); R(b.x - 1, b.y - 1, 2, 2, '#ef7d57'); }
  for (const p of parts) {
    if (p.ring) { const r = Math.round(p.ring * (.5 + p.t / p.life * .5)); g.globalAlpha = 1 - p.t / p.life; g.strokeStyle = p.c; g.beginPath(); g.arc(Math.round(p.x), Math.round(p.y), r, 0, 6.3); g.stroke(); g.globalAlpha = 1; }
    else R(p.x, p.y, 1, 1, p.c);
  }
  g.font = '8px monospace'; g.textAlign = 'center';
  for (const n of nums) { const y = Math.round(n.y - n.t * 20); g.fillStyle = '#1a1c2c'; g.fillText(n.v, Math.round(n.x) + 1, y + 1); g.fillStyle = n.c; g.fillText(n.v, Math.round(n.x), y); }
  g.restore();

  // ---------- 介面 ----------
  for (let i = 0; i < 5; i++) { const x = 6 + i * 9, y = 6, c = i < head.hp ? '#b13e53' : '#333c57'; R(x, y, 3, 3, c); R(x + 4, y, 3, 3, c); R(x + 1, y + 3, 5, 2, c); R(x + 2, y + 5, 3, 1, c); }
  // 波次進度條＋頭目骷髏
  const bw = Math.min(160, VW - 120), bx = VW / 2 - bw / 2;
  R(bx, 7, bw, 4, '#333c57'); R(bx, 7, Math.min(bw, bw * T / BOSS_T), 4, T >= BOSS_T ? '#b13e53' : '#ffcd75');
  R(bx + bw + 3, 4, 8, 7, '#f4f4f4'); R(bx + bw + 4, 7, 2, 2, '#1a1c2c'); R(bx + bw + 8, 7, 2, 2, '#1a1c2c'); R(bx + bw + 5, 11, 1, 1, '#f4f4f4'); R(bx + bw + 7, 11, 1, 1, '#f4f4f4');
  if (boss && !boss.dead) { R(bx, 14, bw, 3, '#333c57'); R(bx, 14, bw * boss.hp / boss.max, 3, '#b13e53'); }
  // 經驗條（到下一節）
  R(0, VH - 3, VW, 3, '#333c57'); R(0, VH - 3, VW * xp / (4 + segs.length), 3, '#a7f070');
  // 隊伍長度
  const counts = { bow: 0, fire: 0, shield: 0 }; segs.forEach(s => counts[s.type]++);
  g.font = '8px monospace'; g.textAlign = 'left';
  TKEYS.forEach((t, i) => { const x = VW - 78 + i * 26; drawUnit(x, 10, t, 0, 0); g.fillStyle = '#f4f4f4'; g.fillText(counts[t], x + 7, 13); });
  // 搖桿
  if (stick) { g.strokeStyle = 'rgba(244,244,244,.4)'; g.beginPath(); g.arc(stick.ox, stick.oy, 18, 0, 6.3); g.stroke(); const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.min(18, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); R(stick.ox + Math.cos(a) * d - 4, stick.oy + Math.sin(a) * d - 4, 8, 8, 'rgba(244,244,244,.6)'); }

  if (state === 'pick') {
    R(0, 0, VW, VH, 'rgba(26,28,44,.75)');
    const w = 64, gap = 12, sx = VW / 2 - (w * 3 + gap * 2) / 2, by = VH / 2 - w / 2;
    pickOpts.forEach((t, i) => {
      const x = sx + i * (w + gap), pulse = Math.floor(performance.now() / 300) % 2;
      R(x - 1, by - 1, w + 2, w + 2, pulse ? '#ffcd75' : '#f4f4f4'); R(x, by, w, w, '#333c57');
      drawIcon(x + w / 2 - 8, by + w / 2, t, 4); drawIcon(x + w / 2 + 12, by + w / 2 + 6, t, 2);
      g.fillStyle = '#ffcd75'; g.textAlign = 'center'; g.fillText('Lv' + (lvl[t] + 1), x + w / 2, by + w - 4);
      g.fillStyle = '#a7f070'; g.textAlign = 'right'; g.fillText('+2', x + w - 3, by + 9);
    });
  }
  if (state === 'over' || state === 'win') {
    R(0, 0, VW, VH, state === 'win' ? 'rgba(56,183,100,.35)' : 'rgba(177,62,83,.35)');
    const x = VW / 2, y = VH / 2;
    if (state === 'win') { for (let i = 0; i < 3; i++) R(x - 16 + i * 12, y - 22 + (i === 1 ? -4 : 0), 8, 10, '#ffcd75'); R(x - 18, y - 12, 36, 8, '#ffcd75'); }
    else { R(x - 10, y - 26, 20, 16, '#f4f4f4'); R(x - 6, y - 21, 4, 4, '#1a1c2c'); R(x + 2, y - 21, 4, 4, '#1a1c2c'); }
    g.textAlign = 'center'; g.font = '8px monospace'; g.fillStyle = '#f4f4f4';
    const m = Math.floor(T / 60), s = ('0' + Math.floor(T % 60)).slice(-2);
    g.fillText(m + ':' + s + '   ☠' + kills + '   ▮' + segs.length, x, y + 6);
    if (overT > 1) { // 重來圖示
      g.strokeStyle = '#f4f4f4'; g.lineWidth = 2; g.beginPath(); g.arc(x, y + 26, 7, .6, 5.6); g.stroke(); g.lineWidth = 1;
      R(x + 5, y + 18, 4, 4, '#f4f4f4');
    }
  }
}

reset();
let last = performance.now();
const STEPS = Math.max(1, Math.min(20, +(Q.get('spd') || 1))); // 測試用時間倍速掛鉤：仍是同一套 update()，只是一個畫面跑好幾步
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  for (let i = 0; i < STEPS; i++) update(dt);
  render(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__g = () => ({ state, T, segs: segs.length, foes: foes.length, hp: head.hp, loose: loose.length, kills, kinds: Array.from(new Set(foes.map(f => f.kind))), hx: head.x, hy: head.y, foesXY: foes.map(f => ({ k: f.kind, x: f.x, y: f.y, st: f.st })) });
