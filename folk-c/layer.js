// folk-c 玩家層：救不救。你不能控制任何人；只有出事的那一刻（被樹壓住／生病／餓倒），
// 那個人頭上會出現一隻手，8 秒內點它就伸手救他。
// 代價一：每救一次要從倉庫拿走 2 份食物（不夠就讓田裡熟的作物枯掉補足）。
// 代價二（會落在特定某人身上）：同一個人被天上的手救過 2 次，他就認定「反正會有人救我」，
//   從此不工作、窩在營火邊（變成懶人），被別人看到吃倉庫就記恨、找他打架；原本的懶人也還在。
//   他頭上會一直頂著一個小小的金色光圈，看得出是被寵壞的那個。
// 不救的話，會由其他人去救（他們的感情因此變好），或他自己撐過去／受傷／餓死。
'use strict';
(function () {
  let A = null;
  const queue = [];
  let seq = 0;
  let policy = 'manual';
  const pending = [];   // {p, kind, t0}
  const effects = [];   // 伸手的畫面 {x, y, t0}
  const WINDOW = 8, COST = 2, SPOIL_AT = 2;
  const KIND = { pinned: '被樹壓住', sick: '生病', starving: '餓倒' };

  window.FOLK_ACT = function (...args) {
    if (args[0] === 'at') queue.push({ t: +args[1], args: args.slice(2), s: seq++ });
    else queue.push({ t: -1, args, s: seq++ });
    queue.sort((a, b) => a.t - b.t || a.s - b.s);
  };

  function stillInTrouble(e) {
    const p = e.p;
    if (p.dead) return false;
    if (e.kind === 'pinned') return p.state === 'pinned';
    if (e.kind === 'sick') return p.sick > 0;
    return p.state === 'starving';
  }

  function save(e) {
    const p = e.p;
    const i = pending.indexOf(e); if (i >= 0) pending.splice(i, 1);
    if (!stillInTrouble(e)) return;
    // 付代價
    let need = COST;
    const take = Math.min(A.food, need); A.food -= take; need -= take;
    let withered = 0;
    for (const c of A.crops) { if (need <= 0) break; if (c.g >= 1 && !c.claim) { c.g = 0; need--; withered++; } }
    A.log([p], '玩家：伸手救' + KIND[e.kind] + '的' + A.N(p) + '（倉庫少了 ' + take + ' 份' + (withered ? '，田裡枯了 ' + withered + ' 株' : '') + '）');
    effects.push({ x: p.x, y: p.y, t0: A.T });
    p.saved = (p.saved || 0) + 1;
    if (p.saved === SPOIL_AT && !p.lazy) {
      p.lazy = true; p.spoiled = true;
      A.log([p], A.N(p) + '被救了兩次，覺得反正會有人救，從此不工作');
      // 大家都看在眼裡：對他的好感一次掉一截（之後更容易被記恨、出事時也比較沒人願意幫）
      for (const o of A.folk) if (o !== p && !o.dead) { o.rel[p.id] -= 0.35; o.anger = Math.max(o.anger, 3); }
    }
    if (p.helper) { const h = p.helper; p.helper = null; if (h.target === p) h.target = null; }
    if (e.kind === 'pinned') { p.down = false; p.pinTree = null; A.decide(p); }
    else if (e.kind === 'sick') { p.sick = 0; p.fed = false; p.down = false; A.decide(p); }
    else { A.eat(p); p.down = false; A.decide(p); }
  }

  function apply(args) {
    const [cmd, v] = args;
    if (cmd === 'policy' && ['manual', 'always', 'never'].includes(v)) { policy = v; A.log([], '玩家：策略改成' + { manual: '手動', always: '每次都救', never: '都不救' }[v]); }
    if (cmd === 'save') {
      const e = v === undefined ? pending[0] : pending.find(x => x.p.id === v);
      if (e) save(e);
    }
  }

  window.FOLK_LAYER = {
    init(api) {
      A = api;
      api.cv.addEventListener('pointerdown', ev => {
        const r = api.cv.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width * api.W, y = (ev.clientY - r.top) / r.height * api.H;
        let best = null, bd = 14;
        for (const e of pending) { const [hx, hy] = handPos(e.p); const d = Math.hypot(hx + 4 - x, hy + 4 - y); if (d < bd) { bd = d; best = e; } }
        if (best) window.FOLK_ACT('save', best.p.id);
      });
    },
    accident(kind, p) {
      if (pending.some(e => e.p === p)) return;
      const e = { p, kind, t0: A.T };
      pending.push(e);
      if (policy === 'always') queue.unshift({ t: -1, args: ['save', p.id], s: seq++ });
    },
    step() {
      while (queue.length && queue[0].t <= A.T) apply(queue.shift().args);
      for (let i = pending.length - 1; i >= 0; i--) {
        const e = pending[i];
        if (A.T - e.t0 > WINDOW || !stillInTrouble(e)) pending.splice(i, 1);
      }
    },
    draw(g, R) {
      if (A.PLAIN) return;
      for (const p of A.folk) if (p.spoiled && !p.dead && !p.down) { // 被寵壞的人頭上的金色光圈
        const x = Math.round(p.x), y = Math.round(p.y) - p.look.h - 3;
        R(x - 3, y, 7, 1, '#ffcd75'); R(x - 4, y - 1, 1, 1, '#ffcd75'); R(x + 4, y - 1, 1, 1, '#ffcd75');
      }
      for (const e of pending) {
        const [x, y] = handPos(e.p);
        const left = 1 - (A.T - e.t0) / WINDOW;
        const pulse = Math.floor(A.T * 3) % 2;
        R(x - 2, y - 2, 13, 13, pulse ? '#ffcd75' : '#1a1c2c');
        R(x - 1, y - 1, 11, 11, '#1a1c2c');
        drawHand(R, x, y, '#f2c89a');
        R(x - 1, y + 10, Math.round(11 * left), 1, '#ffcd75'); // 剩餘時間
      }
      // 伸手：一隻大手從上面伸下來，停一秒半
      for (let i = effects.length - 1; i >= 0; i--) {
        const f = effects[i], age = A.T - f.t0;
        if (age > 1.5) { effects.splice(i, 1); continue; }
        const x = Math.round(f.x) - 4, y = Math.round(f.y) - 26 + Math.round(Math.min(1, age * 3) * 10);
        R(x + 2, 0, 5, Math.max(0, y), '#f2c89a');
        drawHand(R, x, y, '#f2c89a');
        g.fillStyle = 'rgba(255,205,117,' + (0.4 * (1 - age / 1.5)) + ')'; g.fillRect(f.x - 10, f.y - 16, 20, 20);
      }
    },
  };

  function handPos(p) { return [Math.round(p.x) - 4, Math.max(1, Math.round(p.y) - (p.down ? 20 : 26))]; }
  function drawHand(R, x, y, c) {
    // 張開的手掌（掌心朝下）：四指＋拇指
    R(x + 1, y + 4, 7, 5, c);
    R(x + 1, y, 1, 4, c); R(x + 3, y - 1, 1, 5, c); R(x + 5, y - 1, 1, 5, c); R(x + 7, y, 1, 4, c);
    R(x, y + 5, 1, 2, c);
  }
})();
