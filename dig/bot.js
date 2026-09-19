// 測試用機器人：只讀 __dig.st()/map()，只寫 keys（跟真人鍵盤同一個入口）與呼叫商店函式。
// 不在 index.html 載入，由測試腳本注入。
// 兩個引擎特性要照顧：
//  ① 移動中 st.x/st.y 還是舊值，而引擎在同一幀移動結束後會用還按著的鍵再走一格
//     → 一律用「這一步的目的地」當現在位置（px/py）。
//  ② 腳下是空的時候只按左右會自由落下 → 水平移動同時按上（hmove）。
//  所以機器人只往下挖、不往上挖礦；唯一的長距離上升是回家（多爬一格無所謂）。
(function () {
  const D = window.__dig, C = D.C, EX = C.EX, WW = C.WW, DEPTH = C.DEPTH, k = D.keys;
  const B = { state: 'shop', log: [], branches: [], curBranch: 0, lastLog: -999, stuck: 0,
    target: 0, aim: null, floor: null, bad: {}, miss: 0, deaths: 0, trips: 0 };
  window.__bot = B;
  const st = () => D.st(), map = () => D.map();
  const px = () => { const s = st(); return s.move ? s.move.tx : s.x; };
  const py = () => { const s = st(); return s.move ? s.move.ty : s.y; };
  function clr() { k.KeyW = k.KeyA = k.KeyS = k.KeyD = false; }
  function press(dx, dy) { clr(); if (dx > 0) k.KeyD = true; if (dx < 0) k.KeyA = true; if (dy > 0) k.KeyS = true; if (dy < 0) k.KeyW = true; }
  // 井已經挖開的時候，放手自由落下（0.07 秒/格、不耗油）比按著往下（0.11 秒/格、耗油）快
  function godown() { if (py() < 0) { press(0, 1); return; } const y = py() + 1; const below = (y >= 0 && y < DEPTH) ? map()[y][px()] : 3; if (below === 0) clr(); else press(0, 1); }
  function hmove(dx) { const y = py() + 1; const below = (y >= 0 && y < DEPTH) ? map()[y][px()] : 3; press(dx, below === 0 ? -1 : 0); }
  function eff() { return C.PICK[st().lv.pick] * (1 + 0.12 * (st().craft.bit || 0)); }
  function diggable(id, y) { return id !== 3 && id !== 0 && C.hardOf(id, y) <= eff() * 2.2; }
  function elevCap() { const s = st(); return C.ELEV[s.lv.elev] > 0 ? C.ELEV[s.lv.elev] + 40 * (s.craft.beam || 0) : 0; }
  function bagCap() { return C.BAG[st().lv.bag] + 4 * (st().craft.sack || 0); }
  function depthLimit() { // 這把鎬沿電梯井下得到哪
    for (let y = 1; y < DEPTH - 6; y++) { const id = map()[y][EX]; if (id !== 0 && !diggable(id, y)) return y - 1; }
    return DEPTH - 8;
  }
  // 可以比電梯再深一點（多出來的那段自己爬回電梯口），不然上面挖光了就沒事做
  function belowCap() { const s = st(); return Math.floor(C.TANK[s.lv.tank] * 0.45 / 0.5); }
  function diveStop() { const cap = elevCap(); const lim = st().lv.pick >= 4 ? DEPTH - 3 : DEPTH - 8;
    return Math.min(B.target, (cap > 0 ? cap + belowCap() : 24), lim); }
  function needReturn() {
    const s = st();
    if (s.cargo.length >= bagCap() && s.lv.pick < 4) return true;   // 要去挖地心時不為了卸貨回頭
    const cap = elevCap();
    if (cap >= py()) return s.fuel / C.TANK[s.lv.tank] < 0.16;          // 有電梯：回程不用油
    if (cap > 0) return s.fuel < (py() - cap) * 0.5 + Math.abs(px() - EX) * 0.5 + 6; // 在電梯下面：留爬回電梯口的油
    return s.fuel < py() * 0.45 + Math.abs(px() - EX) * 0.5 + 8;       // 沒電梯：留爬回去的油
  }

  // ---- 商店 ----
  const CR = [{ k: 'bit', cost: 600, need: { 21: 3, 15: 8 }, max: 3 },
              { k: 'beam', cost: 1500, need: { 20: 1, 15: 14 }, max: 3 },
              { k: 'sack', cost: 900, need: { 21: 2, 15: 10 }, max: 3 }];
  function craftable(i) {
    const s = st(), r = CR[i];
    if ((s.craft[r.k] || 0) >= r.max || s.money < r.cost) return false;
    for (const id in r.need) if ((s.mat[id] || 0) < r.need[id]) return false;
    return true;
  }
  // 跟真人按數字鍵一樣：會先開對應的面板再動作
  function inPanel(k, fn) { const s = st(); const old = s.panel; s.panel = k; const r = fn(); s.panel = old; return r; }
  function shopBrain() {
    const s = st(), cost = kk => (s.lv[kk] < 4 ? C.COST[kk][s.lv[kk]] : Infinity);
    const lim = depthLimit(), cap = elevCap();
    if (lim < DEPTH - 20 && s.money >= cost('pick')) return inPanel('shop', () => D.buy('pick'));          // 被封岩擋住 → 升鎬
    if (s.lv.elev === 0 && s.money >= cost('elev')) return inPanel('shop', () => D.buy('elev'));           // 先蓋電梯
    if (cap < Math.min(lim, s.maxDepth + 20) && s.money >= cost('elev')) return inPanel('shop', () => D.buy('elev'));
    for (let i = 0; i < 3; i++) if (craftable(i)) return inPanel('craft', () => D.craft(i));                // 製作跟升級搶同一筆錢
    if (s.q.length > C.FURN[s.lv.furnace][0] * 3 && s.money >= cost('furnace')) return inPanel('shop', () => D.buy('furnace'));
    if (s.money >= cost('bag') * 2) return inPanel('shop', () => D.buy('bag'));
    if (s.money >= cost('tank') * 3) return inPanel('shop', () => D.buy('tank'));
    if (D.matTotal() >= 25 && ![0, 1, 2].some(craftable)) return inPanel('craft', () => D.sellMats());      // 做不了東西就賣掉
  }

  // ---- 找礦：只找同層與下面的（往上爬很貴，而且會跟重力打架）----
  function findOre() {
    const m = map(), lo = 1, hi = Math.min(DEPTH - 7, diveStop()); // 不要瞄封岩另一邊（挖不動，白跑）
    let best = null;
    for (let y = lo; y <= hi; y++) {
      for (let x = 1; x < WW - 1; x++) {
        const id = m[y][x];
        if (!C.VAL[id] || !diggable(id, y) || B.bad[x + ',' + y]) continue;
        const dy = y - py();
        const d = Math.abs(x - px()) + (dy >= 0 ? dy * 1.2 : -dy * 2.2) + 1; // 往上比較貴
        const sc = C.VAL[id] / d;
        if (!best || sc > best.sc) best = { sc, x, y };
      }
    }
    return best;
  }

  B.findOre = findOre; B.diggable = diggable; B.eff = eff;
  let t = 0, actT = 0;
  window.__botTick = function (dt) {
    const s = st(); t += dt;
    if (s.won) { clr(); return; }
    if (s.ride > 0) { clr(); B.idle = (B.idle || 0) + dt; return; }
    if (s.dead > 0) { clr(); if (B.state !== 'dead') { B.deaths++; B.state = 'dead'; } return; }
    if (t - B.lastLog >= 10) {
      B.lastLog = t; const lk = D.locked();
      B.log.push({ t: +t.toFixed(1), y: s.y, money: s.money, locked: lk.n, slots: lk.slots,
        lv: Object.assign({}, s.lv), craft: Object.assign({}, s.craft),
        matSold: s.matSold, matUsed: s.matUsed, matGot: s.matGot, q: s.q.length, trips: B.trips });
    }
    B.stateT = B.stateT || {}; B.stateT[B.state] = (B.stateT[B.state] || 0) + dt;
    // 「沒有任何決定可做的時間」：搭電梯演出中／在主井裡純下降（沒有在挖）／在商店等加油
    B.idle = B.idle || 0; B.busy = B.busy || 0;
    const inShaftFall = (B.state === 'dive' && px() === EX && !st().dig && py() > 0);
    const shopWait = D.atShop() && !st().cargo.length && st().fuel < C.TANK[st().lv.tank] - 0.5;
    if (inShaftFall || shopWait) B.idle += dt; else B.busy += dt;
    B.posT = B.posT || {}; const kk = B.state + '@' + (Math.abs(px() - EX) <= 1 ? 'shaft' : 'branch'); B.posT[kk] = (B.posT[kk] || 0) + dt;
    actT += dt; if (actT < 0.035) return; actT = 0;

    if (D.atShop()) {
      if (s.cargo.length) { clr(); return; }                      // 等卸貨
      if (s.fuel < C.TANK[s.lv.tank] - 0.5) { clr(); return; }    // 等加滿油
      if (s.panel) s.panel = null;
      if (s.qsort !== 1) D.qsort(1);                 // 熔爐先煉貴的
      shopBrain();
      B.state = 'dive'; B.bad = {}; B.miss = 0; B.aim = null; B.floor = null;
      B.target = st().lv.pick >= 4 ? DEPTH - 3 : Math.min(depthLimit(), DEPTH - 8);
      // 電梯可上可下：直接搭到已挖通、又不超過這趟目標的最深停靠站
      const stops = D.liftStops(); let best = -1;
      for (const y of stops) if (y <= B.target && y > best) best = y;
      if (best >= 8) { D.rideTo(best); B.trips++; return; }
      press(1, 0); return;
    }
    if (py() <= -1 && B.state !== 'dive') {                        // 在地面但不在店裡
      if (px() >= 2 && px() <= 8) { clr(); return; }               // 放開按鍵讓它停下來（atShop 要求沒在移動）
      press(px() > 8 ? -1 : 1, 0); return;
    }
    const off = Math.abs(px() - EX);                               // 岔出距離
    if (off > B.curBranch) B.curBranch = off;
    if (off <= 1 && B.curBranch > 0) { B.branches.push(B.curBranch); B.curBranch = 0; }

    if (needReturn() && B.state !== 'home') { B.state = 'home'; B.aim = null; B.ret = (B.ret||0)+1; B.retWhy = (st().cargo.length >= bagCap()) ? 'bag' : 'fuel'; B['ret_'+B.retWhy]=(B['ret_'+B.retWhy]||0)+1; }

    switch (B.state) {
      case 'dive': {
        if (px() !== EX) { hmove(Math.sign(EX - px())); return; }
        if (py() >= diveStop()) { B.state = 'mine'; B.floor = py(); return; }
        godown();
        if (s.dig && s.dig.blocked) { B.target = py(); B.state = 'mine'; B.floor = py(); }
        return;
      }
      case 'mine': {
        if (B.floor == null || py() > B.floor) B.floor = py();
        if (st().lv.pick >= 4) { B.aim = { x: WW >> 1, y: DEPTH - 3, core: 1 }; } // 鎬子滿級就去挖地心
        if (B.miss > 6) { B.state = 'home'; B.miss = 0; return; }
        if (!B.aim) {
          const o = findOre(); if (o) B.aimed = (B.aimed||0)+1; else B.noOre = (B.noOre||0)+1;
          if (!o) { // 這一層挖完了：往下推一層，推不動就回家
            const stop = diveStop();
            if (B.floor < stop) { B.target = Math.min(stop, B.floor + 8); B.state = 'dive'; return; }
            B.state = 'home'; return;
          }
          B.aim = o; B.stuck = 0;
        }
        const a = B.aim;
        if (px() === a.x && py() === a.y) { B.aim = null; B.miss = 0; B.hit = (B.hit||0)+1; return; }
        if (py() !== a.y && (Math.abs(px() - a.x) <= 1 || px() === EX)) { if (a.y > py()) godown(); else press(0, -1); }
        else hmove(Math.sign(a.x - px()) || 1);
        if (s.dig && s.dig.blocked) { B.stuck++; if (B.stuck > 5) { B.bad[a.x + ',' + a.y] = 1; B.aim = null; B.miss++; } }
        return;
      }
      case 'home': {
        const e = D.elev();
        if (e.ok) { clr(); D.ride(); B.trips++; return; }
        if (px() !== EX) { hmove(Math.sign(EX - px())); if (s.dig && s.dig.blocked) press(0, -1); return; }
        if (py() > -1) { press(0, -1); return; }                       // 沿井爬回地面（多爬一格無所謂）
        B.trips++; clr(); return;
      }
    }
  };
})();
