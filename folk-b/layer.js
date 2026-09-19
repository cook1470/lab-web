// folk-b 玩家層：天氣。左下角三個圖示按鈕：雲＝下雨、太陽＝放晴、麥穗＝豐收。
// 代價：
//   下雨：作物長得快，但在外面的人會淋濕生病、營火熄滅。冷卻 25 秒。
//   放晴：雨立刻停，但接下來 40 秒乾旱（作物幾乎不長、也不會自然下雨）。冷卻 20 秒。
//   豐收：整片田立刻成熟，但之後 70 秒田地休耕完全不長。冷卻 70 秒。
'use strict';
(function () {
  let A = null;
  const queue = [];
  let seq = 0;
  let drought = 0, fallow = 0;
  const cd = { rain: 0, sun: 0, bless: 0 };
  const CD = { rain: 25, sun: 20, bless: 70 };
  const BTN = { rain: [4, 80], sun: [20, 80], bless: [36, 80] }; // 邏輯像素，14×14

  window.FOLK_ACT = function (...args) {
    if (args[0] === 'at') queue.push({ t: +args[1], args: args.slice(2), s: seq++ });
    else queue.push({ t: -1, args, s: seq++ });
    queue.sort((a, b) => a.t - b.t || a.s - b.s);
  };

  function apply(args) {
    const cmd = args[0];
    if (!(cmd in cd) || cd[cmd] > 0) return;
    cd[cmd] = CD[cmd];
    if (cmd === 'rain') {
      A.rain = Math.max(A.rain, 22); drought = 0;
      A.log([], '玩家：下雨');
    } else if (cmd === 'sun') {
      A.rain = 0; drought = 40; A.nextRain = A.T + 70;
      A.log([], '玩家：放晴（接下來乾旱）');
    } else if (cmd === 'bless') {
      for (const c of A.crops) c.g = 1;
      fallow = 70;
      A.log([], '玩家：豐收（之後田地休耕）');
    }
  }

  window.FOLK_LAYER = {
    init(api) {
      A = api;
      api.cv.addEventListener('pointerdown', e => {
        const r = api.cv.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * api.W, y = (e.clientY - r.top) / r.height * api.H;
        for (const k in BTN) {
          const [bx, by] = BTN[k];
          if (x >= bx - 1 && x <= bx + 15 && y >= by - 1 && y <= by + 15) window.FOLK_ACT(k);
        }
      });
    },
    step(dt) {
      while (queue.length && queue[0].t <= A.T) apply(queue.shift().args);
      for (const k in cd) cd[k] = Math.max(0, cd[k] - dt);
      if (drought > 0) { drought -= dt; if (drought <= 0) A.log([], '乾旱結束'); }
      if (fallow > 0) { fallow -= dt; if (fallow <= 0) A.log([], '田地休耕結束'); }
    },
    blockRain: () => drought > 0,
    growMul: () => (fallow > 0 ? 0 : drought > 0 ? 0.15 : 1),
    draw(g, R) {
      // 乾旱：田地出現裂痕、畫面偏黃；休耕：田上一層灰
      if (!A.PLAIN) {
        if (drought > 0) {
          g.fillStyle = 'rgba(255,205,117,0.16)'; g.fillRect(0, 0, A.W, A.H);
          for (const c of A.crops) { R(c.x - 3, c.y + 2, 3, 1, '#3b2a24'); R(c.x, c.y + 1, 1, 1, '#3b2a24'); R(c.x + 1, c.y - 2, 2, 1, '#3b2a24'); }
        }
        if (fallow > 0) { g.fillStyle = 'rgba(148,176,194,0.35)'; g.fillRect(A.FIELD.x - 1, A.FIELD.y - 1, A.FIELD.cols * A.FIELD.cw + 2, A.FIELD.rows * A.FIELD.ch + 2); }
      }
      // 按鈕（對照組也要看得到，不然沒辦法操作）
      for (const k in BTN) {
        const [x, y] = BTN[k];
        R(x - 1, y - 1, 16, 16, '#1a1c2c'); R(x, y, 14, 14, '#333c57');
        icon(R, k, x, y);
        if (cd[k] > 0) { // 冷卻：由上往下蓋一層暗色
          const h = Math.ceil(14 * cd[k] / CD[k]);
          g.fillStyle = 'rgba(26,28,44,0.7)'; g.fillRect(x, y, 14, h);
        }
      }
    },
  };

  function icon(R, k, x, y) {
    if (k === 'rain') {
      R(x + 3, y + 3, 8, 3, '#c2c3c7'); R(x + 2, y + 5, 10, 3, '#c2c3c7'); R(x + 5, y + 2, 4, 2, '#c2c3c7');
      R(x + 3, y + 10, 1, 2, '#41a6f6'); R(x + 7, y + 9, 1, 2, '#41a6f6'); R(x + 10, y + 10, 1, 2, '#41a6f6');
    } else if (k === 'sun') {
      R(x + 5, y + 5, 4, 4, '#ffcd75'); R(x + 6, y + 2, 2, 2, '#ffcd75'); R(x + 6, y + 10, 2, 2, '#ffcd75');
      R(x + 2, y + 6, 2, 2, '#ffcd75'); R(x + 10, y + 6, 2, 2, '#ffcd75');
      R(x + 3, y + 3, 1, 1, '#ffcd75'); R(x + 10, y + 3, 1, 1, '#ffcd75'); R(x + 3, y + 10, 1, 1, '#ffcd75'); R(x + 10, y + 10, 1, 1, '#ffcd75');
    } else {
      R(x + 6, y + 5, 2, 8, '#a7f070');
      R(x + 5, y + 2, 4, 3, '#ffcd75'); R(x + 3, y + 5, 3, 2, '#ffcd75'); R(x + 8, y + 5, 3, 2, '#ffcd75'); R(x + 4, y + 8, 2, 2, '#ffcd75'); R(x + 8, y + 8, 2, 2, '#ffcd75');
    }
  }
})();
