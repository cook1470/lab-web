'use strict';
// 拾點子 原型：撿到點子→演示小關→回主世界長出對應元素
const W = 422, H = 195;
const P = ['#1a1c2c','#5d275d','#b13e53','#ef7d57','#ffcd75','#a7f070','#38b764','#257179','#29366f','#3b5dc9','#41a6f6','#73eff7','#f4f4f4','#94b0c2','#566c86','#333c57'];

const scr = document.getElementById('c');
const sctx = scr.getContext('2d');
const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
const g = buf.getContext('2d');
let scale = 2, offX = 0, offY = 0;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = innerWidth, vh = innerHeight;
  scale = Math.max(1, Math.floor(Math.min(vw * dpr / W, vh * dpr / H)));
  const cw = W * scale, ch = H * scale;
  scr.width = cw; scr.height = ch;
  scr.style.width = cw / dpr + 'px'; scr.style.height = ch / dpr + 'px';
  offX = (vw - cw / dpr) / 2; offY = (vh - ch / dpr) / 2;
  scr.style.left = offX + 'px'; scr.style.top = offY + 'px';
  sctx.imageSmoothingEnabled = false;
}
addEventListener('resize', resize); resize();

// ---------- 音效（程式合成） ----------
let ac = null;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); }
let sndBudget = 0;
function tone(f, d, type = 'square', vol = 0.06, slide = 0) {
  if (!ac || sndBudget > 14) return; sndBudget++;
  const t = ac.currentTime, o = ac.createOscillator(), v = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
  v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(v); v.connect(ac.destination); o.start(t); o.stop(t + d);
}
function noise(d, vol = 0.08, hp = 400) {
  if (!ac || sndBudget > 14) return; sndBudget++;
  const n = ac.createBuffer(1, ac.sampleRate * d | 0, ac.sampleRate), a = n.getChannelData(0);
  for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / a.length);
  const s = ac.createBufferSource(), v = ac.createGain(), fl = ac.createBiquadFilter();
  fl.type = 'highpass'; fl.frequency.value = hp;
  s.buffer = n; v.gain.value = vol; s.connect(fl); fl.connect(v); v.connect(ac.destination); s.start();
}
const sfx = {
  step: () => tone(180 + Math.random() * 20, 0.02, 'square', 0.015),
  jump: () => tone(440, 0.08, 'square', 0.05, 1.6),
  land: () => tone(160, 0.05, 'triangle', 0.04),
  pick: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'square', 0.05), i * 60)); },
  hurt: () => { tone(160, 0.25, 'sawtooth', 0.09, 0.4); noise(0.15, 0.08, 200); },
  hit: () => { tone(220, 0.08, 'square', 0.06, 1.2); noise(0.04, 0.05, 800); },
  open: () => { tone(300, 0.06, 'square', 0.05, 1.4); tone(600, 0.1, 'triangle', 0.05, 1.2); },
  win: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.07), i * 80)); },
  gate: () => { noise(0.3, 0.1, 300); tone(90, 0.3, 'sawtooth', 0.07, 0.5); },
  flag: () => { tone(500, 0.08, 'square', 0.05, 1.3); tone(760, 0.1, 'triangle', 0.05, 1.2); },
};

// ---------- 世界常數 ----------
// 設計規則（2026-09-17 製作人回饋）：每個新點子要解決前一個點子製造出來的麻煩。
// 生命值學會之後、存檔點學會之前，有一段刻意設計的「痛段」（gauntlet）：
// 密集尖刺＋一個要跳的坑，血歸零會被送回這段的起點，重走一大段路。
// 存檔點學會之後，之前走過的路長出旗子，死掉改成從最近的旗子重生。
const groundY = 168;
const MOVE_SPEED = 90, JUMP_VEL = -190, GRAVITY = 560;
const ORB1_X = 190, PIT0 = 250, PIT1 = 292;
const ORB2_X = 380;
const GAUNTLET_START = 420;
const PIT2_0 = 700, PIT2_1 = 736;
const SPIKES = [460, 500, 540, 600, 640, 800, 840, 900, 940, 1000, 1040, 1100, 1140, 1300, 1340];
const ORB3_X = 1220;
const FLAG_X = 1420;
const WORLD_W = 1460;
const FLAG_POINTS = [110, 420, 700, 1220];
const IDEA_TITLE = { jump: '跳躍', health: '生命值', checkpoint: '存檔點' };

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function groundAt(x) {
  if (x > PIT0 && x < PIT1) return null;
  if (x > PIT2_0 && x < PIT2_1) return null;
  return groundY;
}

// ---------- 粒子 ----------
let parts = [];
function spawnParts(x, y, n, col, spread = 60, life = 0.5) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = spread * (0.4 + Math.random() * 0.6);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life, maxLife: life, col });
  }
}
function updateParts(dt) {
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
}
function drawParts() {
  for (const p of parts) { const a = Math.max(0, p.life / p.maxLife); g.globalAlpha = a; g.fillStyle = p.col; g.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2); }
  g.globalAlpha = 1;
}

// ---------- 飛行圖示（點子飛進 UI） ----------
let flyIcons = [];
function spawnFly(kind, sx, sy, tx, ty) { flyIcons.push({ kind, x: sx, y: sy, sx, sy, tx, ty, t: 0, dur: 0.55 }); }
function updateFly(dt) {
  for (const f of flyIcons) {
    f.t += dt; const p = Math.min(1, f.t / f.dur), e = 1 - (1 - p) * (1 - p);
    f.x = f.sx + (f.tx - f.sx) * e; f.y = f.sy + (f.ty - f.sy) * e - Math.sin(p * Math.PI) * 18;
  }
  const arrived = flyIcons.filter(f => f.t >= f.dur);
  flyIcons = flyIcons.filter(f => f.t < f.dur);
  for (const f of arrived) onFlyArrive(f.kind);
}
function drawFlyIcons() { for (const f of flyIcons) drawIdeaIcon(f.kind, f.x, f.y, 1); }
function onFlyArrive(kind) {
  sfx.hit();
  if (kind === 'jump') { jumpBtnT = 0; spawnParts(jumpBtnCenter().x, jumpBtnCenter().y, 12, P[4]); }
  else if (kind === 'health') { heartsT = 0; spawnParts(12, 12, 12, P[2]); }
  else if (kind === 'checkpoint') { trayFill[2] = true; trayPop[2] = 0; const t = trayRect(2); spawnParts(t.x + t.w / 2, t.y + t.h / 2, 12, P[11]); }
}
function growIn(t, dur = 0.3) { if (t < 0) return { a: 0, s: 0.4 }; const k = Math.min(1, t / dur); return { a: k, s: 0.4 + 0.6 * k }; }

// ---------- 圖示 ----------
function drawIdeaIcon(kind, cx, cy, s = 1) {
  if (kind === 'jump') {
    g.fillStyle = P[4];
    g.fillRect(cx - 4 * s, cy - 1 * s, 8 * s, 3 * s);
    g.fillRect(cx - 4 * s, cy - 4 * s, 3 * s, 4 * s);
    g.fillStyle = P[12]; g.fillRect(cx - 1 * s, cy - 3 * s, 2 * s, 1 * s);
  } else if (kind === 'health') {
    g.fillStyle = P[2];
    g.fillRect(cx - 4 * s, cy - 2 * s, 3 * s, 3 * s); g.fillRect(cx + 1 * s, cy - 2 * s, 3 * s, 3 * s);
    g.fillRect(cx - 3 * s, cy, 6 * s, 3 * s); g.fillRect(cx - 1 * s, cy + 2 * s, 2 * s, 2 * s);
    g.fillStyle = P[4]; g.fillRect(cx - 4 * s, cy - 3 * s, 3 * s, 1 * s); g.fillRect(cx + 1 * s, cy - 3 * s, 3 * s, 1 * s);
  } else if (kind === 'checkpoint') {
    g.fillStyle = P[13]; g.fillRect(cx - 3 * s, cy - 4 * s, 1 * s, 8 * s);
    g.fillStyle = P[11]; g.fillRect(cx - 2 * s, cy - 4 * s, 6 * s, 4 * s);
  }
}

// ---------- 角色 ----------
function drawPlayer(sx, sy, facing, phase, hurtFlash) {
  const bob = Math.sin(phase) * 1;
  const bodyCol = hurtFlash ? P[12] : P[11];
  const top = sy - 12 - bob;
  g.fillStyle = bodyCol;
  g.fillRect(Math.round(sx - 4), Math.round(top + 2), 8, 8);
  g.fillRect(Math.round(sx - 3), Math.round(top), 6, 3);
  g.fillStyle = P[4];
  g.fillRect(Math.round(sx - 1), Math.round(top - 3), 2, 3);
  g.fillStyle = P[0];
  const ex = facing > 0 ? 1 : -3;
  g.fillRect(Math.round(sx + ex), Math.round(top + 4), 2, 2);
  g.fillStyle = P[15];
  g.fillRect(Math.round(sx - 4), Math.round(sy - 2 - bob), 3, 2);
  g.fillRect(Math.round(sx + 1), Math.round(sy - 2 - bob), 3, 2);
}

// ---------- UI 矩形 ----------
const leftBtn = { x: 6, y: 146, w: 38, h: 42 };
const rightBtn = { x: 48, y: 146, w: 38, h: 42 };
const jumpBtn = { x: 376, y: 132, w: 42, h: 48 };
const jumpBtnDemo = { x: 372, y: 60, w: 44, h: 44 };
function jumpBtnCenter() { return { x: jumpBtn.x + jumpBtn.w / 2, y: jumpBtn.y + jumpBtn.h / 2 }; }
function trayRect(i) { const s = 14, gap = 3, x0 = W - (s * 3 + gap * 2) - 6; return { x: x0 + i * (s + gap), y: 6, w: s, h: s }; }
function restartBtnRect() { return { x: W / 2 - 32, y: 150, w: 64, h: 26 }; }
function drawBtn(r, label) {
  g.fillStyle = 'rgba(20,20,30,0.45)'; g.fillRect(r.x, r.y, r.w, r.h);
  g.strokeStyle = P[12]; g.lineWidth = 1; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  g.fillStyle = P[12]; g.font = '16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
}

// ---------- 狀態 ----------
let mode = 'main', trans = null;
let pl, ideas, pickedOrb, camX = 0;
let trayFill, trayPop, jumpBtnT = -1, heartsT = -1, titleText = '', titleT = 0;
let walkPhase = 0, shake = 0, demoShake = 0, timeT = 0;
let lastOrbScreenPos = { x: 0, y: 0 };
let dp = null, demoT = 0;
let dHearts = 3, dDead = false, dDeadT = 0, dInvuln = 0;
let flags = [], flagPopT = [], lastRespawnX = null;
let dFlagOn = false, dCpDead = false, dCpDeadT = 0, dHazardDone = false, dCpFinishT = -1;
const keyState = { left: false, right: false, jump: false, jumpEdge: false };

function resetGame() {
  pl = { x: 110, y: groundY - 14, w: 10, h: 14, vx: 0, vy: 0, onGround: true, facing: 1, jumpUnlocked: false, speed: MOVE_SPEED, jumpVel: JUMP_VEL, maxHearts: 0, hearts: 0, invuln: 0 };
  ideas = { jump: false, health: false, checkpoint: false };
  pickedOrb = { jump: false, health: false, checkpoint: false };
  camX = 0;
  parts = []; flyIcons = [];
  trayFill = [false, false, false]; trayPop = [-1, -1, -1];
  jumpBtnT = -1; heartsT = -1; titleText = ''; titleT = 0;
  walkPhase = 0; shake = 0; demoShake = 0;
  flags = []; flagPopT = []; lastRespawnX = null;
  mode = 'main'; trans = null; dp = null;
}
function restartGame() { resetGame(); }

function absorbIdea(kind) {
  ideas[kind] = true;
  titleText = IDEA_TITLE[kind]; titleT = 1.6;
  if (kind === 'jump') {
    pl.jumpUnlocked = true;
    trayFill[0] = true; trayPop[0] = 0;
    const t = jumpBtnCenter();
    spawnFly('jump', lastOrbScreenPos.x, lastOrbScreenPos.y, t.x, t.y);
  } else if (kind === 'health') {
    pl.maxHearts = 3; pl.hearts = 3;
    trayFill[1] = true; trayPop[1] = 0;
    spawnFly('health', lastOrbScreenPos.x, lastOrbScreenPos.y, 12, 12);
  } else if (kind === 'checkpoint') {
    // 之前走過的路長出旗子；玩家看得到的那一支（在撿到的位置）用飛入＋長高演出，
    // 更早、已經離開螢幕的那些直接算「已經立好」（玩家如果走回去會看到它已經在那）。
    flags = FLAG_POINTS.slice();
    flagPopT = flags.map(() => 999);
    flagPopT[flags.length - 1] = 0;
    spawnParts(lastOrbScreenPos.x, lastOrbScreenPos.y, 14, P[11], 70, 0.7);
    const t = trayRect(2);
    spawnFly('checkpoint', lastOrbScreenPos.x, lastOrbScreenPos.y, t.x + t.w / 2, t.y + t.h / 2);
  }
}
function respawnAfterDeath() {
  pl.hearts = pl.maxHearts;
  let target = GAUNTLET_START;
  if (ideas.checkpoint && flags.length) {
    target = flags[0];
    for (const f of flags) if (f <= pl.x) target = f;
  }
  pl.x = target + 6;
  pl.y = groundY - pl.h; pl.vy = 0; pl.onGround = true;
  lastRespawnX = pl.x;
  shake = 6; sfx.hurt();
}

// ---------- 轉場 ----------
function goTo(newMode, initFn, flashCol) {
  trans = { t: 0, outDur: 0.22, inDur: 0.28, phase: 'out', next: newMode, initFn, flash: flashCol || P[12] };
}
function updateTrans(dt) {
  trans.t += dt;
  if (trans.phase === 'out') {
    if (trans.t >= trans.outDur) { mode = trans.next; if (trans.initFn) trans.initFn(); trans.phase = 'in'; trans.t = 0; }
  } else {
    if (trans.t >= trans.inDur) trans = null;
  }
}
function drawTrans() {
  let a; if (trans.phase === 'out') a = Math.min(1, trans.t / trans.outDur); else a = 1 - Math.min(1, trans.t / trans.inDur);
  g.globalAlpha = a; g.fillStyle = trans.flash; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
}

// ---------- 主世界：更新 ----------
function tryPickupOrbs() {
  if (!pickedOrb.jump && Math.abs(pl.x - ORB1_X) < 14) {
    pickedOrb.jump = true; lastOrbScreenPos = { x: ORB1_X - camX, y: groundY - 24 };
    sfx.pick(); goTo('demoJump', initDemoJump, P[4]);
  } else if (!pickedOrb.health && ideas.jump && Math.abs(pl.x - ORB2_X) < 14) {
    pickedOrb.health = true; lastOrbScreenPos = { x: ORB2_X - camX, y: groundY - 24 };
    sfx.pick(); goTo('demoHealth', initDemoHealth, P[2]);
  } else if (!pickedOrb.checkpoint && ideas.health && Math.abs(pl.x - ORB3_X) < 14) {
    pickedOrb.checkpoint = true; lastOrbScreenPos = { x: ORB3_X - camX, y: groundY - 24 };
    sfx.pick(); goTo('demoCheckpoint', initDemoCheckpoint, P[11]);
  }
}
function flashHeartLoss() { heartsT = Math.min(heartsT, 0); if (heartsT < 0) heartsT = 0; }
function pitRespawnX(x) {
  return (x > PIT0 - 60 && x < PIT1 + 60) ? PIT0 - 24 : PIT2_0 - 24;
}
function updateMain(dt) {
  let mv = 0; if (keyState.right) mv += 1; if (keyState.left) mv -= 1;
  pl.vx = mv * pl.speed;
  if (mv > 0) pl.facing = 1; else if (mv < 0) pl.facing = -1;
  if (keyState.jumpEdge && pl.onGround && pl.jumpUnlocked) {
    pl.vy = pl.jumpVel; pl.onGround = false; sfx.jump(); spawnParts(pl.x - camX, groundY, 6, P[13]);
  }
  pl.vy += GRAVITY * dt;
  pl.x += pl.vx * dt; pl.x = clamp(pl.x, 10, WORLD_W - 10);
  const wasOnGround = pl.onGround;
  const gy = groundAt(pl.x + pl.w / 2);
  let newY = pl.y + pl.vy * dt;
  if (gy !== null && pl.vy >= 0 && newY + pl.h >= gy) {
    newY = gy - pl.h; pl.vy = 0;
    if (!wasOnGround) { sfx.land(); spawnParts(pl.x - camX, groundY, 4, P[13]); }
    pl.onGround = true;
  } else pl.onGround = false;
  pl.y = newY;
  if (pl.y > H + 40) {
    const back = pitRespawnX(pl.x);
    if (pl.maxHearts > 0) {
      pl.hearts = Math.max(0, pl.hearts - 1); flashHeartLoss();
      if (pl.hearts <= 0) { respawnAfterDeath(); } else { pl.x = back; pl.y = groundY - pl.h; pl.vy = 0; pl.onGround = true; shake = 4; sfx.hurt(); }
    } else {
      pl.x = back; pl.y = groundY - pl.h; pl.vy = 0; pl.onGround = true; shake = 3; sfx.hurt();
    }
  }
  camX = clamp(pl.x - W / 2, 0, WORLD_W - W);
  if (pl.invuln > 0) pl.invuln -= dt;
  if (pl.maxHearts > 0 && pl.invuln <= 0) {
    for (const sxp of SPIKES) {
      if (Math.abs((pl.x + pl.w / 2) - sxp) < 7 && pl.y + pl.h > groundY - 6) {
        pl.hearts = Math.max(0, pl.hearts - 1); pl.invuln = 1.0; shake = 5; sfx.hurt();
        spawnParts(sxp - camX, groundY - 8, 8, P[2]);
        pl.vx = pl.facing > 0 ? -40 : 40;
        flashHeartLoss();
        if (pl.hearts <= 0) respawnAfterDeath();
        break;
      }
    }
  }
  tryPickupOrbs();
  if (pl.x >= FLAG_X) { goTo('end', initEnd, P[11]); }
  walkPhase += (pl.onGround && pl.vx !== 0 ? dt * 8 : 0);
  if (pl.onGround && pl.vx !== 0 && Math.random() < 0.15) spawnParts(pl.x - camX, groundY - 1, 1, P[14]);
  if (jumpBtnT >= 0 && jumpBtnT < 1) jumpBtnT += dt;
  if (heartsT >= 0 && heartsT < 1) heartsT += dt;
  for (let i = 0; i < 3; i++) if (trayPop[i] >= 0 && trayPop[i] < 1) trayPop[i] += dt;
  for (let i = 0; i < flagPopT.length; i++) if (flagPopT[i] >= 0 && flagPopT[i] < 1) flagPopT[i] += dt;
  if (titleT > 0) titleT -= dt;
  shake = Math.max(0, shake - dt * 10);
}

// ---------- 主世界：繪製 ----------
function drawGroundSeg(x0, x1, camX0) {
  const sx0 = Math.max(0, x0 - camX0), sx1 = Math.min(W, x1 - camX0);
  if (sx1 <= sx0) return;
  g.fillStyle = P[15]; g.fillRect(sx0, groundY, sx1 - sx0, H - groundY);
  g.fillStyle = P[6]; g.fillRect(sx0, groundY, sx1 - sx0, 3);
}
function drawSpike(sxp, camX0) {
  const sx = sxp - camX0; if (sx < -10 || sx > W + 10) return;
  g.fillStyle = P[2];
  for (let i = 0; i < 3; i++) {
    const bx = sx - 6 + i * 4;
    g.fillRect(bx, groundY - 2, 4, 2);
    g.fillRect(bx + 1, groundY - 5, 2, 3);
    g.fillRect(bx + 1, groundY - 7, 1, 2);
  }
}
function drawFlagPole(sx, camX0, col, grow) {
  const x = sx - camX0; if (x < -20 || x > W + 20) return;
  const gi = grow === undefined ? { a: 1, s: 1 } : growIn(grow, 0.5);
  if (gi.a <= 0) return;
  g.globalAlpha = gi.a;
  g.fillStyle = P[13]; g.fillRect(x, groundY - 40 * gi.s, 2, 40 * gi.s);
  g.fillStyle = col;
  const wave = Math.sin(timeT * 5) * 2;
  g.fillRect(x + 2, groundY - 38 * gi.s + wave * 0.2, 14, 8);
  g.globalAlpha = 1;
}
function drawFlags(camX0) {
  for (let i = 0; i < flags.length; i++) drawFlagPole(flags[i], camX0, P[11], flagPopT[i]);
}
function drawOrb(wx, camX0, colIdx, t) {
  const sx = wx - camX0, sy = groundY - 24 + Math.sin(t * 3) * 3;
  if (sx < -20 || sx > W + 20) return;
  g.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6);
  g.fillStyle = P[colIdx]; g.fillRect(sx - 6, sy - 6, 12, 12);
  g.globalAlpha = 1;
  g.fillStyle = P[colIdx]; g.fillRect(sx - 3, sy - 3, 6, 6);
  g.fillStyle = P[12]; g.fillRect(sx - 1, sy - 1, 2, 2);
  if (Math.random() < 0.3) spawnParts(sx, sy, 1, P[colIdx], 20, 0.4);
}
function drawTitleLabel() {
  if (titleT <= 0) return;
  const a = Math.max(0, Math.min(1, Math.min(titleT / 0.3, (1.6 - titleT) / 0.3)));
  g.globalAlpha = a;
  g.fillStyle = P[12]; g.font = '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(titleText, W / 2, 30);
  g.globalAlpha = 1;
}
function drawUIChrome() {
  for (let i = 0; i < 3; i++) {
    const r = trayRect(i);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    if (trayFill[i]) {
      const gi = growIn(trayPop[i]);
      g.globalAlpha = gi.a;
      g.save(); g.translate(r.x + r.w / 2, r.y + r.h / 2); g.scale(gi.s, gi.s);
      drawIdeaIcon(['jump', 'health', 'checkpoint'][i], 0, 0, 0.8);
      g.restore(); g.globalAlpha = 1;
    }
  }
  if (pl.maxHearts > 0) {
    const gi = growIn(heartsT);
    g.globalAlpha = gi.a;
    for (let i = 0; i < pl.maxHearts; i++) {
      const cx = 10 + i * 13, cy = 12;
      if (i >= pl.hearts) g.globalAlpha = gi.a * 0.3;
      g.save(); g.translate(cx, cy); g.scale(gi.s, gi.s);
      drawIdeaIcon('health', 0, 0, 1);
      g.restore();
      g.globalAlpha = gi.a;
    }
    g.globalAlpha = 1;
  }
  drawBtn(leftBtn, '◀'); drawBtn(rightBtn, '▶');
  if (pl.jumpUnlocked) {
    const gi = growIn(jumpBtnT);
    if (gi.a > 0) {
      g.globalAlpha = gi.a;
      const cx = jumpBtn.x + jumpBtn.w / 2, cy = jumpBtn.y + jumpBtn.h / 2;
      g.save(); g.translate(cx, cy); g.scale(gi.s, gi.s); g.translate(-cx, -cy);
      drawBtn(jumpBtn, '⤴');
      g.restore(); g.globalAlpha = 1;
    }
  }
}
function drawMain() {
  const camX0 = camX;
  g.fillStyle = P[8]; g.fillRect(0, 0, W, H);
  if (ideas.jump) {
    g.fillStyle = P[7];
    const par = camX0 * 0.3;
    for (let i = -1; i < 8; i++) {
      const bx = i * 90 - (par % 90);
      const bh = 20 + 10 * Math.sin(i * 1.7);
      g.fillRect(bx, groundY - 30 - bh, 70, bh + 30);
    }
  }
  if (ideas.health) {
    g.fillStyle = P[13];
    const par = camX0 * 0.15;
    for (let i = -1; i < 8; i++) {
      const bx = i * 110 - (par % 110);
      g.fillRect(bx + 10, 20 + 8 * Math.sin(i * 2.3), 26, 6);
      g.fillRect(bx, 26 + 8 * Math.sin(i * 2.3), 40, 5);
    }
  }
  if (ideas.checkpoint) {
    g.fillStyle = P[1];
    const par = camX0 * 0.5;
    for (let i = -1; i < 10; i++) {
      const bx = i * 60 - (par % 60);
      const hh = 14 + 6 * Math.sin(i * 3.1);
      g.fillRect(bx, groundY - hh, 50, hh);
    }
    g.fillStyle = P[12];
    for (let i = 0; i < 10; i++) {
      const sxp = (((i * 97 + 30 - camX0 * 0.5) % W) + W) % W;
      g.fillRect(sxp, 5 + (i * 13) % 40, 1, 1);
    }
  }
  drawGroundSeg(0, PIT0, camX0);
  drawGroundSeg(PIT1, PIT2_0, camX0);
  drawGroundSeg(PIT2_1, WORLD_W, camX0);
  for (const sxp of SPIKES) drawSpike(sxp, camX0);
  drawFlags(camX0);
  drawFlagPole(FLAG_X, camX0, P[4]);
  if (!pickedOrb.jump) drawOrb(ORB1_X, camX0, 4, timeT);
  if (!pickedOrb.health && ideas.jump) drawOrb(ORB2_X, camX0, 2, timeT);
  if (!pickedOrb.checkpoint && ideas.health) drawOrb(ORB3_X, camX0, 11, timeT);
  drawPlayer(pl.x - camX0, pl.y + pl.h, pl.facing, walkPhase, pl.invuln > 0 && Math.floor(timeT * 12) % 2 === 0);
  drawParts();
  drawFlyIcons();
  drawTitleLabel();
  drawUIChrome();
}

// ---------- 演示小關：跳躍 ----------
const demoSegs = [[0, 80], [100, 170], [190, 255], [275, 335], [355, 422]];
function initDemoJump() { dp = { x: 14, y: groundY - 14, w: 10, h: 14, vx: 0, vy: 0, onGround: true, facing: 1 }; walkPhase = 0; }
function updateDemoJump(dt) {
  let mv = 0; if (keyState.right) mv += 1; if (keyState.left) mv -= 1;
  dp.vx = mv * MOVE_SPEED; if (mv > 0) dp.facing = 1; else if (mv < 0) dp.facing = -1;
  if (keyState.jumpEdge && dp.onGround) { dp.vy = JUMP_VEL; dp.onGround = false; sfx.jump(); spawnParts(dp.x, dp.y + dp.h, 6, P[13]); }
  dp.vy += GRAVITY * dt;
  dp.x += dp.vx * dt; dp.x = clamp(dp.x, 6, 416);
  const seg = demoSegs.find(s => dp.x >= s[0] && dp.x <= s[1]);
  const gy = seg ? groundY : null;
  let newY = dp.y + dp.vy * dt;
  if (gy !== null && dp.vy >= 0 && newY + dp.h >= gy) { newY = gy - dp.h; dp.vy = 0; if (!dp.onGround) sfx.land(); dp.onGround = true; }
  else dp.onGround = false;
  dp.y = newY;
  if (dp.y > H + 20) { dp.x = 14; dp.y = groundY - dp.h; dp.vy = 0; dp.onGround = true; sfx.hurt(); shake = 3; }
  walkPhase += (dp.onGround && dp.vx !== 0 ? dt * 8 : 0);
  if (dp.x >= 395 && dp.onGround) {
    sfx.win(); spawnParts(dp.x, dp.y, 16, P[4], 80, 0.7);
    goTo('main', () => absorbIdea('jump'), P[4]);
  }
}
function drawDemoJump() {
  g.fillStyle = P[3]; g.fillRect(0, 0, W, H);
  g.fillStyle = P[4]; g.fillRect(0, H - 40, W, 4);
  for (const [x0, x1] of demoSegs) { g.fillStyle = P[15]; g.fillRect(x0, groundY, x1 - x0, H - groundY); g.fillStyle = P[6]; g.fillRect(x0, groundY, x1 - x0, 3); }
  g.fillStyle = P[13]; g.fillRect(400, groundY - 30, 2, 30);
  g.fillStyle = P[12]; g.fillRect(402, groundY - 30, 10, 8);
  drawPlayer(dp.x, dp.y + dp.h, dp.facing, walkPhase, false);
  drawParts();
  drawBtn(leftBtn, '◀'); drawBtn(rightBtn, '▶'); drawBtn(jumpBtnDemo, '⤴');
  g.fillStyle = P[0]; g.font = '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('跳躍', W / 2, 16);
}

// ---------- 演示小關：生命值 ----------
// 生命值演示：不用操作就看得懂。頭上三顆心 → 滾石撞一下、心從頭上掉一顆 → 三顆掉光就倒下
// → 滿血復活、石頭不再來 → 走到旗子。
let rocks = [], rockN = 0, rockT = 0, lostHearts = [], revived = false;
function initDemoHealth() {
  dp = { x: 150, y: groundY - 14, w: 10, h: 14, vx: 0, vy: 0, onGround: true, facing: 1 };
  dHearts = 3; dDead = false; dDeadT = 0; dInvuln = 0; demoT = 0; walkPhase = 0;
  rocks = []; rockN = 0; rockT = 0.6; lostHearts = []; revived = false;
}
function updateDemoHealth(dt) {
  demoT += dt;
  for (const h of lostHearts) { h.t += dt; h.y -= 30 * dt; h.x += h.vx * dt; }
  lostHearts = lostHearts.filter(h => h.t < 0.9);
  if (dDead) {
    dDeadT -= dt;
    if (dDeadT <= 0) { dDead = false; dHearts = 3; revived = true; dInvuln = 0.6; sfx.win(); spawnParts(dp.x, dp.y, 14, P[2], 70, 0.6); }
    return;
  }
  let mv = 0; if (keyState.right) mv += 1; if (keyState.left) mv -= 1;
  dp.vx = mv * MOVE_SPEED * (revived ? 1 : 0.5); if (mv !== 0) dp.facing = mv > 0 ? 1 : -1;
  dp.x += dp.vx * dt; dp.x = clamp(dp.x, 130, 416);
  dp.y = groundY - dp.h; dp.onGround = true;
  walkPhase += (dp.vx !== 0 ? dt * 8 : 0);
  if (dInvuln > 0) dInvuln -= dt;
  // 石頭：還沒倒下之前，一顆接一顆從右邊滾過來，一定撞得到
  if (!revived) {
    rockT -= dt;
    if (rockT <= 0 && rockN < 3 && rocks.length === 0) { rocks.push({ x: Math.min(W + 10, dp.x + 150), rot: 0 }); rockN++; rockT = 0.35; }
  }
  for (const r of rocks) {
    if (r.bounce) { r.x += 120 * dt; r.y = (r.y || 0) - 90 * dt + (r.bt = (r.bt || 0) + dt) * 300 * dt; } else r.x -= 150 * dt; r.rot += dt * 8;
    if (!r.hit && Math.abs(r.x - (dp.x + dp.w / 2)) < 9) {
      r.hit = true; dHearts--; dInvuln = 0.5; demoShake = 3; sfx.hurt();
      lostHearts.push({ x: dp.x + dp.w / 2 + (dHearts - 1) * 9, y: dp.y - 12, vx: 20, t: 0 });
      spawnParts(dp.x + dp.w / 2, dp.y, 10, P[2], 60, 0.5);
      r.bounce = 1;
      if (dHearts <= 0) { dDead = true; dDeadT = 1.3; }
    }
  }
  rocks = rocks.filter(r => r.x > -20 && (r.bt || 0) < 0.7);
  demoShake = Math.max(0, demoShake - dt * 10);
  if (revived && dp.x >= 395) {
    sfx.win(); spawnParts(dp.x, dp.y, 16, P[2], 80, 0.7);
    goTo('main', () => absorbIdea('health'), P[2]);
  }
}
function drawDemoHealth() {
  g.fillStyle = P[8]; g.fillRect(0, 0, W, H);
  g.fillStyle = P[15]; g.fillRect(0, groundY, W, H - groundY);
  g.fillStyle = P[5]; g.fillRect(0, groundY, W, 3);
  // 旗子只在復活後出現：先學會「會倒下」，才看到出口
  if (revived) { g.fillStyle = P[13]; g.fillRect(400, groundY - 30, 2, 30); g.fillStyle = P[12]; g.fillRect(402, groundY - 30, 10, 8); }
  for (const r of rocks) {
    const x = Math.round(r.x), y = groundY - 8 + Math.round(r.y || 0);
    g.fillStyle = P[0]; g.fillRect(x - 8, y - 7, 16, 15);
    g.fillStyle = P[14]; g.fillRect(x - 7, y - 6, 14, 13);
    g.fillStyle = P[13]; const k = Math.floor(r.rot) % 4; g.fillRect(x - 4 + (k % 2) * 4, y - 3 + ((k >> 1) % 2) * 4, 3, 3);
  }
  // 心浮在頭上（大），不在角落
  const cx = dp.x + dp.w / 2, hy = dp.y - 12 + Math.round(Math.sin(timeT * 4));
  for (let i = 0; i < 3; i++) {
    const hx = cx + (i - 1) * 9;
    if (i < dHearts) { const blink = dHearts === 1 && Math.floor(timeT * 6) % 2 === 0; if (!blink) drawIdeaIcon('health', hx, hy, 1); }
  }
  for (const h of lostHearts) { g.globalAlpha = Math.max(0, 1 - h.t / 0.9); drawIdeaIcon('health', h.x, h.y, 1); g.globalAlpha = 1; }
  if (!dDead) drawPlayer(dp.x, dp.y + dp.h, dp.facing, walkPhase, dInvuln > 0 && Math.floor(timeT * 12) % 2 === 0);
  else { g.save(); g.translate(dp.x, dp.y + dp.h); g.rotate(Math.PI / 2); drawPlayer(0, 0, dp.facing, 0, true); g.restore(); }
  drawParts();
  drawBtn(leftBtn, '◀'); drawBtn(rightBtn, '▶');
  g.fillStyle = P[12]; g.font = '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('生命值', W / 2, 16);
}

// ---------- 演示小關：存檔點 ----------
// 走過一支旗子（亮起）→ 再往前撞上尖刺死一次 → 從旗子重生（不是從頭）。
const DCP_FLAG_X = 180, DCP_HAZARD_X = 280;
function initDemoCheckpoint() {
  dp = { x: 14, y: groundY - 14, w: 10, h: 14, vx: 0, vy: 0, onGround: true, facing: 1 };
  dFlagOn = false; dCpDead = false; dCpDeadT = 0; dHazardDone = false; dCpFinishT = -1;
  walkPhase = 0;
}
function updateDemoCheckpoint(dt) {
  if (dCpDead) {
    dCpDeadT -= dt;
    if (dCpDeadT <= 0) { dCpDead = false; dp.x = DCP_FLAG_X; dp.y = groundY - dp.h; dp.vy = 0; dp.onGround = true; dCpFinishT = 1.0; }
    return;
  }
  let mv = 0; if (keyState.right) mv += 1; if (keyState.left) mv -= 1;
  dp.vx = mv * MOVE_SPEED; if (mv !== 0) dp.facing = mv > 0 ? 1 : -1;
  dp.vy += GRAVITY * dt;
  dp.x += dp.vx * dt; dp.x = clamp(dp.x, 6, 416);
  let newY = dp.y + dp.vy * dt;
  if (dp.vy >= 0 && newY + dp.h >= groundY) { newY = groundY - dp.h; dp.vy = 0; dp.onGround = true; } else dp.onGround = false;
  dp.y = newY;
  walkPhase += (dp.onGround && dp.vx !== 0 ? dt * 8 : 0);
  if (!dFlagOn && Math.abs(dp.x - DCP_FLAG_X) < 10) {
    dFlagOn = true; sfx.flag(); spawnParts(DCP_FLAG_X, groundY - 30, 14, P[11], 70, 0.6);
  }
  if (dFlagOn && !dHazardDone && Math.abs(dp.x - DCP_HAZARD_X) < 8 && dp.onGround) {
    dHazardDone = true; dCpDead = true; dCpDeadT = 0.9;
    sfx.hurt(); shake = 5; spawnParts(dp.x, dp.y + dp.h, 10, P[2]);
  }
  if (dCpFinishT >= 0) {
    dCpFinishT -= dt;
    if (dCpFinishT <= 0) { goTo('main', () => absorbIdea('checkpoint'), P[11]); }
  }
}
function drawDemoCheckpoint() {
  g.fillStyle = P[1]; g.fillRect(0, 0, W, H);
  g.fillStyle = P[15]; g.fillRect(0, groundY, W, H - groundY);
  g.fillStyle = P[6]; g.fillRect(0, groundY, W, 3);
  drawFlagPole(DCP_FLAG_X, 0, dFlagOn ? P[11] : P[13]);
  drawSpike(DCP_HAZARD_X, 0);
  if (!dCpDead) drawPlayer(dp.x, dp.y + dp.h, dp.facing, walkPhase, false);
  else { g.save(); g.translate(dp.x, dp.y + dp.h); g.rotate(Math.PI / 2); drawPlayer(0, 0, dp.facing, 0, true); g.restore(); }
  drawParts();
  drawBtn(leftBtn, '◀'); drawBtn(rightBtn, '▶');
  g.fillStyle = P[12]; g.font = '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('存檔點', W / 2, 16);
}

// ---------- 結尾 ----------
function initEnd() { walkPhase = 0; }
function updateEnd(dt) { walkPhase += dt * 3; }
function drawEnd() {
  g.fillStyle = P[0]; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 20; i++) { g.fillStyle = P[12]; g.globalAlpha = 0.4 + 0.3 * Math.sin(timeT * 2 + i); g.fillRect((i * 53 + 17) % W, (i * 29 + 7) % 100, 1, 1); }
  g.globalAlpha = 1;
  drawPlayer(W / 2, 118, 1, walkPhase, false);
  drawIdeaIcon('jump', W / 2 - 14, 60, 1.2);
  drawIdeaIcon('health', W / 2, 60, 1.2);
  drawIdeaIcon('checkpoint', W / 2 + 14, 60, 1.2);
  g.fillStyle = P[12]; g.font = '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('拼好了', W / 2, 40);
  const r = restartBtnRect();
  g.fillStyle = P[9]; g.fillRect(r.x, r.y, r.w, r.h);
  g.strokeStyle = P[12]; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  g.fillStyle = P[12]; g.font = '12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('重來', r.x + r.w / 2, r.y + r.h / 2);
  drawParts();
}

// ---------- 輸入 ----------
function toLogic(e) {
  const r = scr.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}
function hitBtn(p, b) { return p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h; }

addEventListener('keydown', e => {
  audio();
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keyState.left = true;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keyState.right = true;
  if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') { if (!keyState.jump) keyState.jumpEdge = true; keyState.jump = true; e.preventDefault(); }
});
addEventListener('keyup', e => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keyState.left = false;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keyState.right = false;
  if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') keyState.jump = false;
});

function pointerTag(p) {
  if (mode === 'end') { if (hitBtn(p, restartBtnRect())) return 'restart'; return null; }
  if (mode === 'main') {
    if (hitBtn(p, leftBtn)) return 'left';
    if (hitBtn(p, rightBtn)) return 'right';
    if (pl.jumpUnlocked && hitBtn(p, jumpBtn)) return 'jump';
    return null;
  }
  if (mode === 'demoJump' || mode === 'demoHealth' || mode === 'demoCheckpoint') {
    if (hitBtn(p, leftBtn)) return 'left';
    if (hitBtn(p, rightBtn)) return 'right';
    if (mode === 'demoJump' && hitBtn(p, jumpBtnDemo)) return 'jump';
    return null;
  }
  return null;
}
const pointers = new Map();
function applyTag(tag, down) {
  if (tag === 'left') keyState.left = down;
  if (tag === 'right') keyState.right = down;
  if (tag === 'jump') { if (down) { if (!keyState.jump) keyState.jumpEdge = true; keyState.jump = true; } else keyState.jump = false; }
  if (down && tag === 'restart') restartGame();
}
scr.addEventListener('pointerdown', e => {
  audio();
  const p = toLogic(e);
  const tag = pointerTag(p);
  pointers.set(e.pointerId, tag);
  applyTag(tag, true);
  e.preventDefault();
}, { passive: false });
function release(e) {
  const tag = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  applyTag(tag, false);
}
scr.addEventListener('pointerup', release);
scr.addEventListener('pointercancel', release);

// ---------- 主迴圈 ----------
function update(dt) {
  timeT += dt;
  updateFly(dt); updateParts(dt);
  if (trans) { updateTrans(dt); keyState.jumpEdge = false; return; }
  if (mode === 'main') updateMain(dt);
  else if (mode === 'demoJump') updateDemoJump(dt);
  else if (mode === 'demoHealth') updateDemoHealth(dt);
  else if (mode === 'demoCheckpoint') updateDemoCheckpoint(dt);
  else if (mode === 'end') updateEnd(dt);
  keyState.jumpEdge = false;
}
function draw() {
  g.clearRect(0, 0, W, H);
  if (mode === 'main') drawMain();
  else if (mode === 'demoJump') drawDemoJump();
  else if (mode === 'demoHealth') drawDemoHealth();
  else if (mode === 'demoCheckpoint') drawDemoCheckpoint();
  else if (mode === 'end') drawEnd();
  if (trans) drawTrans();
  sctx.clearRect(0, 0, scr.width, scr.height);
  const sh = mode === 'main' ? shake : (mode === 'demoHealth' ? demoShake : 0);
  const dx = (Math.random() * 2 - 1) * sh, dy = (Math.random() * 2 - 1) * sh;
  sctx.save();
  sctx.translate(dx * scale, dy * scale);
  sctx.drawImage(buf, 0, 0, W, H, 0, 0, scr.width, scr.height);
  sctx.restore();
}
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.05);
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
resetGame();
requestAnimationFrame(frame);

// ---------- 測試掛鉤 ----------
window.__idea = {
  state() {
    return {
      mode, plX: pl ? pl.x : null, hearts: pl ? pl.hearts : null, maxHearts: pl ? pl.maxHearts : null,
      speed: pl ? pl.speed : null, jumpVel: pl ? pl.jumpVel : null, jumpUnlocked: pl ? pl.jumpUnlocked : null,
      ideas: ideas ? { jump: ideas.jump, health: ideas.health, checkpoint: ideas.checkpoint } : null,
      flags: flags.slice(), lastRespawnX,
      dpX: dp ? dp.x : null, dHearts, dFlagOn, dCpDead, transActive: !!trans,
    };
  },
  setKeys(o) {
    if ('left' in o) keyState.left = !!o.left;
    if ('right' in o) keyState.right = !!o.right;
    if ('jump' in o) { if (o.jump && !keyState.jump) keyState.jumpEdge = true; keyState.jump = !!o.jump; }
  },
  skip() {
    if (mode === 'demoJump' && dp) { dp.x = 399; dp.y = groundY - dp.h; dp.onGround = true; }
    else if (mode === 'demoHealth' && dp) { dp.x = 399; dDead = false; dHearts = Math.max(1, dHearts); }
    else if (mode === 'demoCheckpoint' && dp) {
      if (!dFlagOn) dp.x = DCP_FLAG_X;
      else if (!dHazardDone) dp.x = DCP_HAZARD_X;
    }
  },
  teleport(x) { if (pl) pl.x = clamp(x, 10, WORLD_W - 10); },
  killPlayer() { if (pl && pl.maxHearts > 0) { pl.hearts = 0; respawnAfterDeath(); } },
  restart() { resetGame(); },
};
