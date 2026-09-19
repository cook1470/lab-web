// 掛機港灣：放著不管，港灣自己從冷清變熱鬧。所有「熱鬧程度」都是 elapsed（世界經過的秒數）的
// 純函式——不用一格一格模擬時間，離線/skip 直接把 elapsed 往前跳，重新算一次就是正確答案。
(() => {
  'use strict';
  const W = 280, H = 130;
  const cv = document.getElementById('c'), g = cv.getContext('2d');
  cv.width = W; cv.height = H;
  let S = 2;
  function fit() {
    S = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    cv.style.width = W * S + 'px'; cv.style.height = H * S + 'px';
    cv.style.left = ((innerWidth - W * S) >> 1) + 'px'; cv.style.top = ((innerHeight - H * S) >> 1) + 'px';
  }
  addEventListener('resize', fit); fit();

  // ---- 色盤（Sweetie 16） ----
  const C = { dark:'#1a1c2c', purple:'#5d275d', red:'#b13e53', orange:'#ef7d57', yellow:'#ffcd75', lgreen:'#a7f070',
    green:'#38b764', dgreen:'#257179', navy:'#29366f', blue:'#3b5dc9', lblue:'#41a6f6', cyan:'#73eff7',
    white:'#f4f4f4', lgray:'#94b0c2', gray:'#566c86', dgray:'#333c57', wood:'#8a5a3b', sand:'#e8d49a' };
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

  // ---- 極小 3x5 像素字型（只用來印離線面板的數字） ----
  const DIGITS = {
    '0':['111','101','101','101','111'], '1':['010','110','010','010','111'],
    '2':['111','001','111','100','111'], '3':['111','001','111','001','111'],
    '4':['101','101','111','001','001'], '5':['111','100','111','001','111'],
    '6':['111','100','111','101','111'], '7':['111','001','010','010','010'],
    '8':['111','101','111','101','111'], '9':['111','101','111','001','111'],
    '+':['000','010','111','010','000'] };
  function drawDigit(x, y, ch, c) { const p = DIGITS[ch]; if (!p) return; for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (p[r][k] === '1') R(x + k, y + r, 1, 1, c); }
  function drawNumber(x, y, str, c) { let cx = x; for (const ch of String(str)) { drawDigit(cx, y, ch, c); cx += 4; } return cx; }

  // ---- 地形 ----
  const isWater = (x, y) => x > 175 + Math.sin(y * 0.08) * 5;
  const DOCK = { x: 178, y: 108 };
  const WELL = { x: 148, y: 58 };
  const TREES = [[8, 12], [150, 10], [10, 108], [4, 60], [158, 62], [150, 118]];
  const PLOTS = [
    { x: 22, y: 36 }, { x: 58, y: 32 }, { x: 94, y: 30 }, { x: 130, y: 32 },
    { x: 22, y: 82 }, { x: 58, y: 86 }, { x: 94, y: 88 }, { x: 130, y: 84 } ];
  const ROOFS = [C.red, C.blue, C.orange, C.dgreen, C.purple, C.navy, C.lblue, C.gray];

  // ---- 進度排程：全部是 elapsed 的函式，不需要逐格模擬 ----
  const HOUSE_DUE = [0, 0, 90, 240, 480, 900, 1500, 2400]; // 一開始就有 2 棟
  const UPG_START = 2400, UPG_END = 23400, N_UPG = 16;
  const UPG_DUE = Array.from({ length: N_UPG }, (_, k) => UPG_START + (k + 1) * (UPG_END - UPG_START) / N_UPG);
  const LEAD = 240; // 快到的前 240 秒開始閃、可以點下去提早完成

  function housesBuiltCount(t) { let n = 0; for (const d of HOUSE_DUE) if (t >= d) n++; return n; }
  function levelsAt(t) { const lv = [1, 1, 1, 1, 1, 1, 1, 1]; for (let k = 0; k < N_UPG; k++) if (t >= UPG_DUE[k]) lv[k % 8]++; return lv; }
  function upgradesDoneCount(t) { let n = 0; for (const d of UPG_DUE) if (t >= d) n++; return n; }
  function prosperity(t) { const hb = housesBuiltCount(t), ud = upgradesDoneCount(t); return clamp((hb - 2) / 6 * 0.4 + ud / N_UPG * 0.6, 0, 1); }
  function popAt(t) { const hb = housesBuiltCount(t), ud = upgradesDoneCount(t); return Math.min(30, 3 + hb * 2 + ud); }
  // 下一個「快到了、值得點」的建造／升級
  function pendingHouse(t, i) { const d = HOUSE_DUE[i]; return t < d && d - t <= LEAD ? d : null; }
  function pendingUpgradeFor(t, i, lv) { if (lv >= 3) return null; const k = lv === 1 ? i : 8 + i; const d = UPG_DUE[k]; return t < d && d - t <= LEAD ? d : null; }
  function nearestPending(t) {
    let best = null;
    for (let i = 0; i < 8; i++) { const d = HOUSE_DUE[i]; if (t < d && d - t <= LEAD && (!best || d < best)) best = d; }
    for (let k = 0; k < N_UPG; k++) { const d = UPG_DUE[k]; if (t < d && d - t <= LEAD && (!best || d < best)) best = d; }
    return best;
  }

  // ---- 存檔 ----
  const SAVE_KEY = 'idle_cove_v1';
  let elapsed = 0, muted = true;
  let offlineDelta = null; // {houses, pop, boats} 待收下的離線收益
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.muted === 'boolean') muted = s.muted;
      const before = typeof s.elapsed === 'number' ? s.elapsed : 0;
      const gapSec = typeof s.lastTs === 'number' ? Math.max(0, (Date.now() - s.lastTs) / 1000) : 0;
      elapsed = before + gapSec;
      if (gapSec >= 2) {
        const hb0 = housesBuiltCount(before), hb1 = housesBuiltCount(elapsed);
        const pop0 = popAt(before), pop1 = popAt(elapsed);
        const boats = Math.max(0, Math.floor(gapSec / lerp(180, 45, prosperity(before))));
        if (hb1 > hb0 || pop1 > pop0 || boats > 0) offlineDelta = { houses: hb1 - hb0, pop: Math.max(0, pop1 - pop0), boats: Math.min(99, boats) };
      }
    } catch (e) { /* localStorage 不可用就當新遊戲 */ }
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ elapsed, lastTs: Date.now(), muted })); } catch (e) {} }
  loadSave();

  // ---- 聲音（預設靜音，點喇叭才會有聲音，且要有使用者手勢才能建立 AudioContext） ----
  let actx = null;
  function chime(freq) {
    if (muted) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), gn = actx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      gn.gain.value = 0.0001;
      o.connect(gn); gn.connect(actx.destination);
      const t0 = actx.currentTime;
      gn.gain.exponentialRampToValueAtTime(0.05, t0 + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.start(t0); o.stop(t0 + 0.36);
    } catch (e) {}
  }

  // ---- 村民（純裝飾用的本地動畫狀態，跟 elapsed 的經濟計算分開） ----
  let villagers = [];
  const SKINS = ['#f4c29a', '#d9a066', '#a0694a', '#ffd9b3'];
  const SHIRTS = [C.red, C.blue, C.green, C.orange, C.purple, C.lblue, C.yellow, C.gray];
  function spawnVillager() {
    const x = rnd(16, 150), y = rnd(28, 112);
    villagers.push({ x, y, tx: x, ty: y, face: 1, walk: 0, wait: rnd(0, 2), skin: pick(SKINS), shirt: pick(SHIRTS) });
  }
  function syncVillagers(targetPop) {
    const shown = Math.min(12, targetPop);
    while (villagers.length < shown) spawnVillager();
  }

  // ---- fx（粒子，收下決定時的小小回饋，不做大爆炸） ----
  let fx = [];
  function sparkle(x, y, c) { for (let k = 0; k < 6; k++) fx.push({ x, y, vx: rnd(-10, 10), vy: rnd(-18, -4), life: rnd(.4, .7), c }); }

  // ---- 船：完全由 elapsed 算出目前狀態，不需要保存物件 ----
  const BOAT_TRAVEL = 8, BOAT_DOCK = 16;
  function boatState(t) {
    const interval = lerp(180, 45, prosperity(t));
    const cycle = t % interval;
    if (cycle < BOAT_TRAVEL) return { phase: 'in', frac: cycle / BOAT_TRAVEL };
    if (cycle < BOAT_TRAVEL + BOAT_DOCK) return { phase: 'dock', frac: (cycle - BOAT_TRAVEL) / BOAT_DOCK };
    if (cycle < BOAT_TRAVEL * 2 + BOAT_DOCK) return { phase: 'out', frac: (cycle - BOAT_TRAVEL - BOAT_DOCK) / BOAT_TRAVEL };
    return { phase: 'none', frac: 0 };
  }

  // ---- 收下決定：把 elapsed 直接推進到那個里程碑的時間點 ----
  function claim(due) { if (due == null || due <= elapsed) return false; elapsed = due; persist(); return true; }

  // ---- 輸入 ----
  let showOffline = offlineDelta != null;
  const speakerBox = { x: W - 14, y: 3, w: 10, h: 9 };
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / S, y = (e.clientY - r.top) / S;
    if (showOffline) { showOffline = false; offlineDelta = null; return; }
    if (x >= speakerBox.x - 2 && x <= speakerBox.x + speakerBox.w + 2 && y <= speakerBox.y + speakerBox.h + 2) {
      muted = !muted; persist();
      if (!muted) chime(660);
      return;
    }
    // 船：點到停靠中的船，收下目前最近的待辦
    const bs = boatState(elapsed);
    if (bs.phase === 'dock') {
      const bx = DOCK.x, by = DOCK.y - 4;
      if (Math.hypot(x - bx, y - by) < 16) {
        const due = nearestPending(elapsed);
        if (claim(due)) { sparkle(bx, by - 6, C.yellow); chime(520); }
        else { sparkle(bx, by - 6, C.cyan); }
        return;
      }
    }
    // 空地：快蓋好的可以點下去馬上蓋
    for (let i = 0; i < PLOTS.length; i++) {
      const pl = PLOTS[i], due = pendingHouse(elapsed, i);
      if (due != null && Math.hypot(x - pl.x, y - pl.y) < 14) {
        if (claim(due)) { sparkle(pl.x, pl.y - 8, C.lgreen); chime(440); syncVillagers(popAt(elapsed)); }
        return;
      }
    }
    // 房子：快升級的可以點下去馬上升級
    const lv = levelsAt(elapsed);
    for (let i = 0; i < PLOTS.length; i++) {
      if (elapsed < HOUSE_DUE[i]) continue;
      const pl = PLOTS[i], due = pendingUpgradeFor(elapsed, i, lv[i]);
      if (due != null && Math.hypot(x - pl.x, y - pl.y) < 14) {
        if (claim(due)) { sparkle(pl.x, pl.y - 12, C.orange); chime(560); }
        return;
      }
    }
  });

  // ---- 繪圖 ----
  function dayPhase(t) { return (t % 400) / 400; }
  function drawGround(t) {
    R(0, 0, W, H, C.green);
    for (let i = 0; i < 60; i++) { const x = (i * 97) % W, y = (i * 53) % H; if (!isWater(x, y)) R(x, y, 1, 2, C.lgreen); }
    for (let x = 0; x < W; x++) { for (let y = 0; y < H; y += 2) if (isWater(x, y)) { R(x, y, 1, 2, C.blue); if (((x + (t * 5 | 0)) % 19) < 2) R(x, y, 1, 1, C.cyan); } }
    // 岸邊沙灘
    for (let y = 0; y < H; y += 2) { const sx = 175 + Math.sin(y * 0.08) * 5; R(sx - 3, y, 3, 2, C.sand); }
    // 碼頭
    R(DOCK.x - 5, DOCK.y - 3, 26, 5, C.wood); R(DOCK.x - 5, DOCK.y - 3, 26, 1, '#6a4028');
    R(DOCK.x - 6, DOCK.y + 2, 2, 4, C.dark); R(DOCK.x + 19, DOCK.y + 2, 2, 4, C.dark);
    // 小水井
    R(WELL.x - 4, WELL.y - 4, 9, 6, C.dark); R(WELL.x - 3, WELL.y - 3, 7, 4, C.lgray); R(WELL.x - 2, WELL.y - 3, 5, 1, C.navy);
  }
  function drawTree(x, y) { R(x + 2, y + 4, 2, 5, C.wood); R(x - 1, y - 3, 8, 8, C.dark); R(x, y - 2, 6, 6, C.dgreen); R(x + 1, y - 2, 3, 2, C.green); }
  function drawEmptyPlot(t, i) {
    const pl = PLOTS[i], due = pendingHouse(t, i);
    const blink = (t * 3 | 0) % 2;
    const c = due != null && blink ? C.yellow : C.dgray;
    for (let k = -9; k <= 9; k += 3) { R(pl.x + k, pl.y - 10, 2, 1, c); R(pl.x + k, pl.y + 4, 2, 1, c); }
    for (let k = -10; k <= 4; k += 3) { R(pl.x - 10, pl.y + k, 1, 2, c); R(pl.x + 10, pl.y + k, 1, 2, c); }
    if (due != null) R(pl.x - 1, pl.y - 3, 3, 3, blink ? C.white : C.yellow);
  }
  function drawHouse(t, i, lv, night) {
    const pl = PLOTS[i], hh = lv === 1 ? 9 : lv === 2 ? 13 : 17, x = pl.x - 9, y = pl.y + 4;
    R(x - 1, y - hh - 1, 20, hh + 2, C.dark); R(x, y - hh, 18, hh, '#e8c9a0'); R(x, y - hh, 18, 1, C.white);
    for (let k = 0; k < 7; k++) R(x - 2 + k, y - hh - 6 - k, 22 - k * 2, 1, k === 0 ? C.dark : ROOFS[i]);
    R(pl.x - 2, y - 6, 4, 6, C.wood);
    const winLit = night;
    R(x + 2, y - hh + 3, 4, 3, winLit ? C.yellow : C.dgray);
    R(x + 12, y - hh + 3, 4, 3, winLit ? C.yellow : C.dgray);
    if (lv >= 2) { R(x + 2, y - hh + 8, 4, 3, winLit ? C.yellow : C.dgray); R(x + 12, y - hh + 8, 4, 3, winLit ? C.yellow : C.dgray); }
    if (lv >= 3) {
      R(pl.x - 1, y - hh - 12, 2, 5, C.dgray);
      const glow = 0.5 + Math.sin(t * 2 + i) * 0.3;
      g.globalAlpha = glow; R(pl.x - 2, y - hh - 14, 4, 3, C.yellow); g.globalAlpha = 1;
    }
    const due = pendingUpgradeFor(t, i, lv);
    if (due != null) { const blink = (t * 3 | 0) % 2; if (blink) { R(pl.x - 1, y - hh - 9, 2, 2, C.white); R(pl.x - 2, y - hh - 11, 4, 2, C.white); } }
  }
  function drawVillager(v) {
    const x = Math.round(v.x), y = Math.round(v.y), leg = Math.floor(v.walk) % 2;
    R(x - 2, y - 6, 5, 6, C.dark); R(x - 1, y - 6, 3, 2, v.skin);
    R(x - 1, y - 4, 3, 3, v.shirt);
    R(x - 1, y - 1, 1, 1 + leg, C.navy); R(x + 1, y - 1, 1, 2 - leg, C.navy);
  }
  function updateVillagers(dt) {
    for (const v of villagers) {
      v.wait -= dt;
      if (v.wait <= 0) {
        if (Math.hypot(v.tx - v.x, v.ty - v.y) < 1) { v.tx = rnd(16, 150); v.ty = rnd(28, 112); v.wait = rnd(1, 3); }
        else { const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy), s = 10 * dt; v.x += dx / d * s; v.y += dy / d * s; v.walk += dt * 5; v.face = dx >= 0 ? 1 : -1; }
      }
    }
  }
  function drawBoat(t) {
    const bs = boatState(t);
    if (bs.phase === 'none') return;
    let x;
    if (bs.phase === 'in') x = W + 14 - (W + 14 - (DOCK.x + 8)) * bs.frac;
    else if (bs.phase === 'dock') x = DOCK.x + 8 + Math.sin(t * 2) * 0.6;
    else x = (DOCK.x + 8) + (W + 20 - (DOCK.x + 8)) * bs.frac;
    const y = DOCK.y - 6 + Math.sin(t * 3) * 0.6;
    R(x - 12, y - 1, 24, 5, C.dark); R(x - 11, y - 1, 22, 3, C.wood);
    R(x + 5, y - 14, 1, 13, C.dark); R(x - 3, y - 13, 8, 8, C.white);
    if (bs.phase === 'dock') {
      const glowOn = nearestPending(t) != null;
      R(x - 4, y - 4, 6, 4, C.wood);
      if (glowOn) { const b = (t * 4 | 0) % 2; if (b) { R(x - 5, y - 8, 8, 3, C.yellow); } }
    }
  }
  function drawSpeaker() {
    const { x, y } = speakerBox;
    R(x, y, 4, 6, C.white); R(x - 2, y + 1, 2, 4, C.white);
    if (!muted) { R(x + 5, y + 1, 1, 1, C.white); R(x + 6, y + 2, 1, 3, C.white); R(x + 5, y + 5, 1, 1, C.white); }
    else { R(x + 4, y + 1, 1, 5, C.red); R(x + 5, y, 1, 1, C.red); R(x + 6, y - 1, 1, 1, C.red); R(x + 3, y + 5, 1, 1, C.red); }
  }
  function drawHud(t) {
    const hb = housesBuiltCount(t), pop = popAt(t);
    R(4, 3, 4, 4, C.white); R(3, 2, 6, 1, C.red);
    drawNumber(11, 3, hb, C.white);
    R(4, 12, 3, 5, C.yellow);
    drawNumber(11, 12, pop, C.yellow);
    // 頂端一條細細的繁榮進度條，不搶眼
    const p = prosperity(t);
    R(0, 0, W, 1, C.dgray); R(0, 0, Math.round(W * p), 1, C.yellow);
  }
  function drawOfflinePanel() {
    if (!offlineDelta) return;
    const pw = 130, ph = 56, px = (W - pw) / 2, py = (H - ph) / 2;
    R(px - 1, py - 1, pw + 2, ph + 2, C.dark);
    R(px, py, pw, ph, C.navy);
    // 太陽小圖示：歡迎回來
    R(px + pw / 2 - 4, py + 6, 8, 8, C.yellow);
    let cy = py + 20;
    R(px + 10, cy, 4, 4, C.white); drawNumber(px + 18, cy - 1, '+' + offlineDelta.houses, C.white);
    cy += 12;
    R(px + 10, cy, 3, 5, C.lgreen); drawNumber(px + 18, cy, '+' + offlineDelta.pop, C.lgreen);
    if (offlineDelta.boats > 0) { cy += 12; R(px + 9, cy + 1, 6, 3, C.sand); drawNumber(px + 18, cy, '+' + offlineDelta.boats, C.sand); }
    // 下方一個小勾勾提示點一下收下
    const b = (Date.now() / 400 | 0) % 2;
    if (b) { const cx = px + pw / 2, by2 = py + ph - 8; R(cx - 3, by2, 2, 2, C.lgreen); R(cx - 1, by2 + 2, 2, 2, C.lgreen); R(cx + 1, by2 - 2, 2, 4, C.lgreen); }
  }
  function draw(t) {
    drawGround(t);
    const items = [];
    TREES.forEach(([x, y]) => items.push({ y: y + 8, d: () => drawTree(x, y) }));
    const lv = levelsAt(t);
    for (let i = 0; i < PLOTS.length; i++) {
      if (t >= HOUSE_DUE[i]) items.push({ y: PLOTS[i].y, d: () => drawHouse(t, i, lv[i], night) }); else items.push({ y: -1e3, d: () => drawEmptyPlot(t, i) });
    }
    const night = dayPhase(t) > 0.78;
    villagers.forEach(v => items.push({ y: v.y, d: () => drawVillager(v) }));
    items.sort((a, b) => a.y - b.y).forEach(it => it.d());
    drawBoat(t);
    // 夜色覆蓋（淡淡的，不是全黑）
    const ph = dayPhase(t);
    let dark = ph > 0.78 ? Math.min(0.45, (ph - 0.78) * 4) : 0;
    if (dark > 0) { g.globalAlpha = dark; R(0, 0, W, H, C.navy); g.globalAlpha = 1; }
    // 滿載後偶爾天上一顆很小的星星，安靜、不是煙火
    if (prosperity(t) >= 0.98 && ((t * 10 | 0) % 150) < 2) { R(rnd(20, 260), rnd(6, 20), 1, 1, C.white); }
    fx.forEach(f => { g.globalAlpha = Math.min(1, f.life * 2); R(f.x, f.y, 1, 1, f.c); });
    g.globalAlpha = 1;
    drawHud(t);
    drawSpeaker();
    if (showOffline) drawOfflinePanel();
  }

  // ---- 主迴圈 ----
  let last = performance.now(), saveTimer = 0;
  syncVillagers(popAt(elapsed));
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!showOffline) elapsed += dt;
    updateVillagers(dt);
    syncVillagers(popAt(elapsed));
    fx.forEach(f => { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 30 * dt; f.life -= dt; });
    fx = fx.filter(f => f.life > 0);
    saveTimer += dt; if (saveTimer > 5) { saveTimer = 0; persist(); }
    draw(elapsed);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  addEventListener('pagehide', persist);
  addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

  // ---- 測試掛鉤 ----
  window.__idle = {
    skip(sec) { elapsed += Math.max(0, sec); syncVillagers(popAt(elapsed)); persist(); },
    get state() {
      const t = elapsed, lv = levelsAt(t);
      return { elapsed: t, housesBuilt: housesBuiltCount(t), levels: lv, population: popAt(t), prosperity: prosperity(t), muted, offlinePanel: showOffline };
    }
  };
})();
