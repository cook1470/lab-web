// slope：一個按鍵的無盡下坡
'use strict';
const W = 240, H = 110;                      // 低解析度畫布
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
const g = buf.getContext('2d');
let scale = 1;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = innerWidth, vh = innerHeight;
  scale = Math.max(1, Math.floor(Math.min(vw / W, vh / H)));
  cv.width = W * scale * dpr; cv.height = H * scale * dpr;
  cv.style.width = W * scale + 'px'; cv.style.height = H * scale + 'px';
  cv.style.left = ((vw - W * scale) / 2 | 0) + 'px'; cv.style.top = ((vh - H * scale) / 2 | 0) + 'px';
}
addEventListener('resize', resize); resize();

// ---------- 調色盤（Sweetie 16） ----------
const P = { ink:'#1a1c2c', pur:'#5d275d', red:'#b13e53', org:'#ef7d57', yel:'#ffcd75', lgr:'#a7f070',
  grn:'#38b764', dgr:'#257179', dbl:'#29366f', blu:'#3b5dc9', lbl:'#41a6f6', cyn:'#73eff7',
  wht:'#f4f4f4', lgy:'#94b0c2', gry:'#566c86', dgy:'#333c57' };

// ---------- 音效（WebAudio 合成） ----------
let ac = null, windGain, windFilt, hissGain, hissFilt;
function audioInit() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  const len = ac.sampleRate * 2, nb = ac.createBuffer(1, len, ac.sampleRate), d = nb.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const mk = (type) => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; const gn = ac.createGain(); gn.gain.value = 0;
    s.connect(f); f.connect(gn); gn.connect(ac.destination); s.start(); return [f, gn]; };
  [windFilt, windGain] = mk('bandpass'); windFilt.Q.value = 1.2;
  [hissFilt, hissGain] = mk('highpass');
}
function beep(f0, f1, dur, type = 'square', vol = 0.12) {
  if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), gn = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function thump(vol = 0.3, dur = 0.25) {
  if (!ac) return; const t = ac.currentTime, len = ac.sampleRate * dur | 0, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const gn = ac.createGain(); gn.gain.value = vol; s.connect(f); f.connect(gn); gn.connect(ac.destination); s.start(t);
}

// ---------- 地形 ----------
const SEG = 6;             // 每段寬（像素）
let pts, obs, genX, genY, genSlope, nextCliff;
function rnd(a, b) { return a + Math.random() * (b - a); }
function genTo(x) {
  while (genX < x) {
    genX += SEG;
    if (genX > nextCliff) {                 // 斷崖：地面突然往下掉
      genY += rnd(30, 60); nextCliff = genX + rnd(500, 1100);
      pts.push({ x: genX, y: genY, cliff: true }); continue;
    }
    genSlope += rnd(-0.06, 0.06); genSlope = genSlope * 0.97 + 0.42 * 0.03;
    genSlope = Math.max(-0.15, Math.min(0.9, genSlope));
    genY += genSlope * SEG;
    pts.push({ x: genX, y: genY });
    const prev = obs.length ? obs[obs.length - 1].x : 0;
    if (genX > 600 && genX - prev > rnd(90, 200) && genX < nextCliff - 60 && Math.random() < 0.08)
      obs.push({ x: genX, kind: Math.random() < 0.55 ? 'rock' : 'snow', hit: false });
  }
}
function groundY(x) {
  const i = Math.floor((x - pts[0].x) / SEG);
  const a = pts[Math.max(0, i)], b = pts[Math.min(pts.length - 1, i + 1)];
  if (!a || !b) return 0;
  if (b.cliff) return a.y;                  // 斷崖邊緣前保持水平直落
  return a.y + (b.y - a.y) * ((x - a.x) / SEG);
}
function slopeAng(x) { return Math.atan2(groundY(x + 3) - groundY(x - 3), 6); }

// ---------- 狀態 ----------
let pl, cam, parts, pops, shake, state, dist, best = 0, hold = false, crashT = 0, flash = 0, combo;
try { best = +localStorage.getItem('slope_best') || 0; } catch (e) {}
function reset() {
  pts = [{ x: -60, y: 0 }]; obs = []; genX = -60; genY = 0; genSlope = 0.35; nextCliff = 700;
  genTo(600);
  pl = { x: 0, y: groundY(0), vx: 70, vy: 0, a: 0, va: 0, gnd: true, spin: 0, air: 0 };
  cam = { x: 0, y: 0 }; parts = []; pops = []; shake = 0; state = 'play'; dist = 0; combo = 1;
}
reset();

// ---------- 輸入 ----------
function press() {
  audioInit();
  if (state === 'dead') { if (crashT > 0.45) { reset(); beep(300, 900, 0.12, 'triangle', 0.1); } return; }
  hold = true;
}
function release() {
  if (!hold) return; hold = false;
  if (state === 'play' && pl.gnd) {        // 放開＝跳起
    const s = slopeAng(pl.x), sp = Math.hypot(pl.vx, pl.vy);
    pl.vy = Math.sin(s) * sp - 95 - sp * 0.12; pl.vx = Math.cos(s) * sp;
    pl.gnd = false; pl.spin = 0; pl.air = 0;
    beep(220, 520, 0.12, 'square', 0.08); burst(pl.x, pl.y, 8, P.wht, 40);
  }
}
addEventListener('keydown', e => { if (e.repeat) return; if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyZ' || e.code === 'Enter') { e.preventDefault(); press(); } });
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyZ' || e.code === 'Enter') release(); });
addEventListener('pointerdown', e => { e.preventDefault(); press(); });
addEventListener('pointerup', release); addEventListener('pointercancel', release);
addEventListener('contextmenu', e => e.preventDefault());

// ---------- 效果 ----------
function burst(x, y, n, col, sp, up = 1) {
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-sp, sp) - pl.vx * 0.3, vy: rnd(-sp * up, sp * 0.3), life: rnd(0.3, 0.8), col });
}
function pop(txt, col) { pops.push({ x: pl.x, y: pl.y - 14, txt, col, t: 0 }); }
function crash(why) {
  if (state !== 'play') return;
  state = 'dead'; crashT = 0; shake = 8; flash = 0.15; hold = false;
  thump(0.5, 0.4); beep(400, 60, 0.4, 'sawtooth', 0.1);
  burst(pl.x, pl.y - 3, 30, P.wht, 90); burst(pl.x, pl.y - 3, 10, P.red, 60);
  pl.dead = { vx: pl.vx * 0.5, vy: -80, va: 14 };
  if (dist > best) { best = dist; try { localStorage.setItem('slope_best', best | 0); } catch (e) {} pl.newBest = true; }
}

// ---------- 更新 ----------
const GRAV = 260;
function update(dt) {
  if (state === 'dead') {
    crashT += dt; const d = pl.dead;
    d.vy += GRAV * dt; pl.x += d.vx * dt; pl.y += d.vy * dt; pl.a += d.va * dt; d.vx *= 0.98;
    const gy = groundY(pl.x); if (pl.y > gy) { pl.y = gy; d.vy *= -0.35; d.vx *= 0.7; d.va *= 0.6; }
  } else {
    genTo(pl.x + W * 2);
    const sp = Math.hypot(pl.vx, pl.vy);
    if (pl.gnd) {
      const s = slopeAng(pl.x);
      // 沿坡加速：重力分量；按住＝壓低、多加速、少摩擦
      let acc = GRAV * Math.sin(s) * 0.9 - (hold ? 0.002 : 0.006) * sp * sp * 0.1 - (hold ? 2 : 14);
      if (hold) acc += 38;
      let v = Math.max(25, sp + acc * dt);
      pl.vx = Math.cos(s) * v; pl.vy = Math.sin(s) * v;
      pl.x += pl.vx * dt; pl.y = groundY(pl.x);
      pl.a += (s - pl.a) * Math.min(1, dt * 20);
      const gy = groundY(pl.x + 2);
      if (gy - pl.y > 4) { pl.gnd = false; pl.spin = 0; pl.air = 0; }  // 衝出斷崖
      if (Math.random() < v / 150) parts.push({ x: pl.x - 4, y: pl.y, vx: -v * 0.3 + rnd(-10, 10), vy: rnd(-30, -5), life: rnd(0.2, 0.5), col: hold ? P.cyn : P.wht });
    } else {
      pl.air += dt;
      pl.vy += GRAV * dt; pl.x += pl.vx * dt; pl.y += pl.vy * dt;
      // 空中按住＝往後翻
      const target = hold ? -9 : 0;
      pl.va += (target - pl.va) * Math.min(1, dt * (hold ? 8 : 3));
      pl.a += pl.va * dt; pl.spin += pl.va * dt;
      const gy = groundY(pl.x);
      if (pl.y >= gy) land(gy);
    }
    // 障礙物
    for (const o of obs) {
      if (o.hit || Math.abs(o.x - pl.x) > 5) continue;
      const oy = groundY(o.x);
      if (o.kind === 'rock' && pl.y > oy - 7) { o.hit = true; crash('rock'); }
      if (o.kind === 'snow' && pl.y > oy - 6) {
        o.hit = true; const k = 0.72; pl.vx *= k; pl.vy *= k; shake = 3; thump(0.25, 0.2);
        burst(o.x, oy - 4, 22, P.wht, 70, 1.5); pop('-SPD', P.lbl);
      }
    }
    dist = Math.max(dist, pl.x / 8);
    if (pts.length > 400) { pts.splice(0, 100); }
    while (obs.length && obs[0].x < pl.x - W) obs.shift();
  }
  // 鏡頭：往前看，速度越快拉越前
  const sp = Math.hypot(pl.vx, pl.vy);
  const tx = pl.x - W * 0.3 + Math.min(40, sp * 0.12), ty = pl.y - H * 0.5;
  cam.x += (tx - cam.x) * Math.min(1, dt * 8); cam.y += (ty - cam.y) * Math.min(1, dt * 12);
  for (const p of parts) { p.vy += 120 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
  for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 0.9);
  shake = Math.max(0, shake - dt * 25); flash = Math.max(0, flash - dt);
  // 音效：速度越快越高越響
  if (ac) {
    const alive = state === 'play', t = ac.currentTime;
    windFilt.frequency.setTargetAtTime(200 + sp * 6, t, 0.05);
    windGain.gain.setTargetAtTime(alive ? Math.min(0.35, sp / 900) : 0, t, 0.08);
    hissFilt.frequency.setTargetAtTime(2000 + sp * 15, t, 0.05);
    hissGain.gain.setTargetAtTime(alive && pl.gnd ? (hold ? 0.09 : 0.04) * Math.min(1, sp / 150) : 0, t, 0.03);
  }
}
function land(gy) {
  const s = slopeAng(pl.x);
  let diff = ((pl.a - s) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  pl.y = gy; pl.va = 0;
  const flips = Math.floor(Math.abs(pl.spin) / (Math.PI * 2) + 0.25);
  if (Math.abs(diff) > 0.75) { crash('land'); return; }
  pl.gnd = true;
  const sp = Math.hypot(pl.vx, pl.vy);
  // 投影到坡面；角度越準保留越多
  let v = Math.max(30, pl.vx * Math.cos(s) + pl.vy * Math.sin(s));
  const clean = Math.abs(diff) < 0.25;
  if (clean) v += 25; else v *= 0.85;
  if (flips > 0) { v += 45 * flips; combo = Math.min(9, combo + flips);
    pop('FLIP x' + flips, P.yel); beep(600, 1500 + flips * 300, 0.25, 'square', 0.1); setTimeout(() => beep(900 + flips * 200, 2000, 0.15, 'triangle', 0.08), 90);
    shake = 4; burst(pl.x, pl.y, 20, P.yel, 70); flash = 0.06;
  } else if (clean) { pop('+', P.lgr); beep(500, 800, 0.08, 'triangle', 0.08); }
  else { pop('~', P.org); thump(0.2, 0.15); }
  pl.a = s; pl.vx = Math.cos(s) * v; pl.vy = Math.sin(s) * v;
  if (pl.air > 0.25 && !flips) shake = Math.max(shake, 2);
  burst(pl.x, pl.y, 12 + (sp / 20 | 0), P.wht, 50);
}

// ---------- 繪製 ----------
function draw() {
  const sp = Math.hypot(pl.vx, pl.vy), fast = Math.min(1, Math.max(0, (sp - 120) / 200));
  const sx = Math.round(rnd(-shake, shake)), sy = Math.round(rnd(-shake, shake));
  const cx = Math.round(cam.x) - sx, cy = Math.round(cam.y) - sy;
  // 天空
  g.fillStyle = fast > 0.6 ? P.dbl : P.blu; g.fillRect(0, 0, W, H);
  g.fillStyle = P.lbl; g.fillRect(0, 0, W, 20);
  // 遠山（視差）
  for (const [k, col, amp, base] of [[0.08, P.dbl, 22, 60], [0.2, P.dgy, 16, 78]]) {
    g.fillStyle = col;
    for (let x = 0; x < W; x += 2) {
      const wx = x + cam.x * k, h = base + Math.sin(wx / 31) * amp * 0.5 + Math.sin(wx / 13) * amp * 0.25 + ((wx / 7 | 0) % 3);
      g.fillRect(x, h | 0, 2, H);
    }
  }
  // 飄雪：速度越快拉成線
  g.fillStyle = P.wht;
  for (let i = 0; i < 40; i++) {
    const px = ((i * 97 - cam.x * (0.5 + (i % 3) * 0.3)) % W + W) % W, py = ((i * 53 + performance.now() * 0.01 * (1 + i % 2)) % H);
    g.fillRect(px | 0, py | 0, 1 + (fast * 14 * ((i % 3) + 1) / 3 | 0), 1);
  }
  // 速度線
  if (fast > 0) {
    g.fillStyle = P.cyn;
    for (let i = 0; i < fast * 12; i++) g.fillRect(rnd(0, W) | 0, rnd(0, H) | 0, rnd(10, 30) | 0, 1);
  }
  // 地面
  for (let x = 0; x < W; x++) {
    const wx = x + cx, gy = Math.round(groundY(wx)) - cy;
    g.fillStyle = P.wht; g.fillRect(x, gy, 1, H);
    g.fillStyle = P.lgy; g.fillRect(x, gy + 4 + ((wx / 5 | 0) % 2), 1, H);
    g.fillStyle = P.gry; g.fillRect(x, gy + 14 + ((wx / 9 | 0) % 3), 1, H);
  }
  // 斷崖崖壁
  for (const p of pts) if (p.cliff) { const x = p.x - SEG - cx; if (x > -4 && x < W) { g.fillStyle = P.dgy; g.fillRect(x, Math.round(pts[pts.indexOf(p) - 1].y) - cy + 2, 2, 80); } }
  // 障礙
  for (const o of obs) {
    const x = Math.round(o.x) - cx, y = Math.round(groundY(o.x)) - cy;
    if (x < -10 || x > W + 10) continue;
    if (o.kind === 'rock') { g.fillStyle = P.dgy; g.fillRect(x - 4, y - 6, 8, 7); g.fillRect(x - 3, y - 8, 5, 2);
      g.fillStyle = P.gry; g.fillRect(x - 3, y - 7, 3, 2); g.fillStyle = P.wht; g.fillRect(x - 2, y - 8, 3, 1); }
    else if (!o.hit) { g.fillStyle = P.wht; g.fillRect(x - 6, y - 4, 12, 5); g.fillRect(x - 4, y - 6, 8, 2);
      g.fillStyle = P.lgy; g.fillRect(x - 5, y - 1, 10, 1); }
  }
  // 粒子
  for (const p of parts) { g.fillStyle = p.col; g.fillRect(Math.round(p.x) - cx, Math.round(p.y) - cy, 1, 1); }
  // 玩家（旋轉的雪橇＋人）
  g.save(); g.translate(Math.round(pl.x) - cx, Math.round(pl.y) - cy); g.rotate(Math.round(pl.a / (Math.PI / 8)) * Math.PI / 8);
  const low = hold && pl.gnd && state === 'play';
  g.fillStyle = P.red; g.fillRect(-6, -2, 12, 2); g.fillRect(5, -3, 2, 1);           // 雪橇
  g.fillStyle = P.ink; g.fillRect(-5, 0, 1, 1); g.fillRect(3, 0, 1, 1);
  if (low) { g.fillStyle = P.org; g.fillRect(-4, -5, 7, 3); g.fillStyle = P.yel; g.fillRect(2, -7, 3, 3); g.fillStyle = P.ink; g.fillRect(4, -6, 1, 1); }
  else { g.fillStyle = P.org; g.fillRect(-3, -8, 4, 6); g.fillStyle = P.yel; g.fillRect(-3, -11, 4, 3); g.fillStyle = P.ink; g.fillRect(0, -10, 1, 1);
    g.fillStyle = P.dgr; g.fillRect(-5, -7, 2, 1); }
  g.restore();
  if (flash > 0) { g.fillStyle = 'rgba(244,244,244,' + Math.min(0.7, flash * 6) + ')'; g.fillRect(0, 0, W, H); }

  // 放大貼上
  const dpr = window.devicePixelRatio || 1, S = scale * dpr;
  ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, W * S, H * S);
  // HUD（全解析度）
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const font = (n) => `bold ${n * S}px ui-monospace,Menlo,monospace`;
  ctx.font = font(9); ctx.fillStyle = P.ink; ctx.fillText((dist | 0) + 'm', 5 * S, 4 * S); ctx.fillStyle = P.wht; ctx.fillText((dist | 0) + 'm', 4 * S, 3 * S);
  ctx.font = font(6); ctx.fillStyle = P.yel; ctx.fillText('★' + (best | 0), 4 * S, 13 * S);
  // 速度計
  ctx.fillStyle = P.ink; ctx.fillRect((W - 44) * S, 4 * S, 40 * S, 4 * S);
  ctx.fillStyle = fast > 0.6 ? P.red : fast > 0 ? P.org : P.lgr; ctx.fillRect((W - 43) * S, 5 * S, Math.min(38, sp / 8) * S, 2 * S);
  ctx.textAlign = 'center';
  for (const p of pops) { ctx.font = font(7); ctx.fillStyle = p.col; ctx.globalAlpha = 1 - p.t / 0.9;
    ctx.fillText(p.txt, (p.x - cx) * S, (p.y - cy - p.t * 20) * S); }
  ctx.globalAlpha = 1;
  if (state === 'dead' && crashT > 0.45) {           // 重來圖示
    const x = W / 2 * S, y = H / 2 * S, r = 12 * S, pul = 1 + Math.sin(crashT * 8) * 0.06;
    ctx.fillStyle = 'rgba(26,28,44,.6)'; ctx.beginPath(); ctx.arc(x, y, r * 1.6 * pul, 0, 7); ctx.fill();
    ctx.strokeStyle = P.wht; ctx.lineWidth = 3 * S; ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0.6, Math.PI * 1.9); ctx.stroke();
    ctx.fillStyle = P.wht; ctx.beginPath(); const ax = x + Math.cos(0.6) * r * 0.8, ay = y + Math.sin(0.6) * r * 0.8;
    ctx.moveTo(ax - 4 * S, ay - 1 * S); ctx.lineTo(ax + 5 * S, ay - 3 * S); ctx.lineTo(ax + 2 * S, ay + 6 * S); ctx.fill();
    ctx.font = font(9); ctx.fillStyle = pl.newBest ? P.yel : P.wht; ctx.fillText((dist | 0) + 'm' + (pl.newBest ? ' ★' : ''), x, y + r * 1.9);
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  update(dt); draw(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__slope = { get pl() { return pl; }, get state() { return state; }, press, release };
