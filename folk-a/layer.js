// folk-a 玩家層：分工。點一個小人（選取），再點地方：樹林＝砍樹、田＝種田、營火＝顧火、房子＝休息。
// 再點一次同一個小人＝取消指派（回到自己決定）。
'use strict';
(function () {
  let A = null;
  const queue = [];     // {t, args}
  let seq = 0;
  let selected = null;
  const JOBS = ['chop', 'farm', 'fire', 'rest', 'free'];
  const JOB_NAME = { chop: '砍樹', farm: '種田', fire: '顧火', rest: '休息', free: '自由' };

  window.FOLK_ACT = function (...args) {
    if (args[0] === 'at') queue.push({ t: +args[1], args: args.slice(2), s: seq++ });
    else queue.push({ t: -1, args, s: seq++ });
    queue.sort((a, b) => a.t - b.t || a.s - b.s);
  };

  function apply(args) {
    const [cmd, id, job] = args;
    if (cmd !== 'assign') return;
    const p = A.folk[id];
    if (!p || p.dead || !JOBS.includes(job)) return;
    if (p.lazy0 === undefined) p.lazy0 = p.lazy;
    p.assign = job === 'free' ? null : job;
    // 被叫去休息的人，在別人眼裡就是不工作的人；被派工的懶人就不算懶
    p.lazy = job === 'rest' ? true : job === 'free' ? p.lazy0 : false;
    A.log([p], '玩家：叫' + A.N(p) + '去' + JOB_NAME[job]);
    const busy = ['pinned', 'sickBed', 'starving', 'sleep', 'toSickBed', 'fight', 'lift', 'toLift', 'fetchFood', 'bringFood', 'sitWith', 'mourn', 'toGrave', 'harvest', 'chop', 'deliver', 'eatHere', 'toEat'];
    if (!busy.includes(p.state)) { A.release(p); A.decide(p); }
  }

  const tending = () => A.folk.some(p => !p.dead && p.assign === 'fire' && p.state === 'loiter' && A.dist(p, A.FIRE) < 14);

  window.FOLK_LAYER = {
    init(api) {
      A = api;
      api.cv.addEventListener('pointerdown', e => {
        const r = api.cv.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * api.W, y = (e.clientY - r.top) / r.height * api.H;
        onTap(x, y);
      });
    },
    step() {
      while (queue.length && queue[0].t <= A.T) apply(queue.shift().args);
    },
    decide(p) {
      const job = p.assign;
      if (!job) return false;
      if (job === 'chop') {
        const trees = A.TREES.filter(t => t.alive && !t.claim);
        if (trees.length) {
          trees.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
          const t = trees[0]; t.claim = p; p.job = t; A.goTo(p, t.x, t.y + 14); A.setState(p, 'toTree'); return true;
        }
        A.goTo(p, 150 + A.rr(0, 50), 45 + A.rr(0, 6)); A.setState(p, 'loiter', A.rr(3, 5)); return true;
      }
      if (job === 'farm') {
        const ripe = A.crops.filter(c => c.g >= 1 && !c.claim);
        if (ripe.length) { const c = A.pick(ripe); c.claim = p; p.job = c; A.goTo(p, c.x, c.y + 2); A.setState(p, 'toCrop'); return true; }
        A.goTo(p, A.FIELD.x + A.rr(0, 75), A.FIELD.y + A.rr(0, 25)); A.setState(p, 'loiter', A.rr(3, 5)); return true;
      }
      if (job === 'fire') { A.goTo(p, A.FIRE.x + A.rr(-6, 6), A.FIRE.y + A.rr(3, 6)); A.setState(p, 'loiter', A.rr(5, 8)); return true; }
      if (job === 'rest') { A.goTo(p, p.bed[0] + A.rr(-3, 3), p.bed[1] + 6); A.setState(p, 'loiter', A.rr(6, 9)); return true; }
      return false;
    },
    // 有人顧火：雨中營火不熄，在火邊的人不會淋濕
    fireLit: () => tending(),
    sheltered: p => tending() && A.dist(p, A.FIRE) < 16,
    draw(g, R) {
      if (A.PLAIN) return;
      for (const p of A.folk) {
        if (p.dead || !p.assign) continue;
        const x = Math.round(p.x), y = Math.round(p.y) + (p.down ? 3 : 1);
        drawJobMark(R, p.assign, x + 4, y);
      }
      if (selected && !selected.dead) {
        const x = Math.round(selected.x), y = Math.round(selected.y);
        const k = Math.floor(A.T * 4) % 2;
        R(x - 6, y + 1, 13, 1, k ? '#ffcd75' : '#f4f4f4'); R(x - 6, y - 14, 1, 15, k ? '#ffcd75' : '#f4f4f4'); R(x + 6, y - 14, 1, 15, k ? '#ffcd75' : '#f4f4f4');
        // 選取中：四個地方閃提示框
        const hint = k ? '#ffcd75' : '#ef7d57';
        frame(R, 146, 2, 62, 40, hint); frame(R, A.FIELD.x - 3, A.FIELD.y - 3, 86, 36, hint);
        frame(R, A.FIRE.x - 10, A.FIRE.y - 8, 20, 16, hint); frame(R, A.HOUSE.x - 3, A.HOUSE.y - 3, A.HOUSE.w + 6, A.HOUSE.h + 6, hint);
      }
    },
  };

  function frame(R, x, y, w, h, c) { R(x, y, w, 1, c); R(x, y + h - 1, w, 1, c); R(x, y, 1, h, c); R(x + w - 1, y, 1, h, c); }

  // 腳邊的小工具圖示：斧頭／芽／火／枕頭
  function drawJobMark(R, job, x, y) {
    R(x - 1, y - 1, 6, 6, '#1a1c2c');
    if (job === 'chop') { R(x + 2, y, 1, 4, '#8a5a3c'); R(x, y, 3, 2, '#c2c3c7'); }
    if (job === 'farm') { R(x + 2, y + 1, 1, 3, '#38b764'); R(x, y, 2, 2, '#a7f070'); R(x + 3, y, 2, 2, '#a7f070'); }
    if (job === 'fire') { R(x + 1, y + 1, 3, 3, '#ef7d57'); R(x + 2, y, 1, 2, '#ffcd75'); }
    if (job === 'rest') { R(x, y + 1, 5, 3, '#f4f4f4'); R(x, y + 3, 5, 1, '#94b0c2'); }
  }

  function onTap(x, y) {
    // 點到小人
    let hit = null, bd = 9;
    for (const p of A.folk) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - x, (p.y - 5) - y);
      if (d < bd) { bd = d; hit = p; }
    }
    if (hit) {
      if (selected === hit) { if (hit.assign) window.FOLK_ACT('assign', hit.id, 'free'); selected = null; }
      else selected = hit;
      return;
    }
    if (!selected) return;
    let job = null;
    if (x > 144 && y < 44) job = 'chop';
    else if (x > A.FIELD.x - 4 && y > A.FIELD.y - 4) job = 'farm';
    else if (Math.hypot(x - A.FIRE.x, y - A.FIRE.y) < 14) job = 'fire';
    else if (x < A.HOUSE.x + A.HOUSE.w + 3 && y < A.HOUSE.y + A.HOUSE.h + 3) job = 'rest';
    if (job) window.FOLK_ACT('assign', selected.id, job);
    selected = null;
  }
})();
