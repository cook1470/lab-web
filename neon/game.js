/* neon — 賽博龐克夜街．義體近戰橫向動作原型
 * 規格：~/agents/forge/design/ART_PIPELINE.md　判準：./CRITERIA.md
 * 設計基準 1920x1080，角色站立高 180。全部程式畫，無外部資源。
 *
 * 三條硬規矩（ART_PIPELINE 末段）在這裡怎麼被執行：
 *  1. 招牌／窗／管線一律 ctx.clip() 進所屬建築輪廓 —— 見 drawBuilding()
 *  2. 地面基準線以下一路填到畫面底 —— 見 drawStreet() 的 fillRect(..., 4000)
 *  3. 關卡是一張手寫事件表（LEVEL），地形是有限的一串方塊（SOLIDS），不是產生器
 * 光一律是畫進去的固定色階：整份程式沒有任何「依相機或光源方位算出來的明暗」。
 */
'use strict';

// ================================================================ 常數
var DESIGN_H = 1080;
var CHAR_H   = 180;
var GROUND_Y = 880;          // 街面基準線
var CAM_BASE_Y = GROUND_Y;
var GRAV  = 2600;
var JUMP_V = 900;            // 跳躍高度 ≈ 155
var RUN_V = 420;

// ---- 打擊回饋設計值（判準②，改這裡就等於改設計值）----
var FEEL = {
  hitStopLight: 3,           // 輕擊命中停頓（幀）
  hitStopHeavy: 5,           // 連擊第三下／撞招牌
  hitStopBlock: 2,           // 被格擋
  shakeLight: 9,             // 命中微震振幅（世界單位）
  shakeHeavy: 16,
  shakeDecay: 0.60,          // 每幀衰減（9*0.6^6 = 0.42 < 1，6 幀內收乾淨）
  knockV: 1200,              // 擊退初速（30 幀位移約 141）
  knockFric: 0.86,
  comboFreq: [520, 620, 740], // 連擊節奏音（嚴格遞增）
  // v2：選對有回報
  parryWindow: 0.32,         // 招架的有效幀（按下去之後這麼久內被打到＝成功）
  parryStop:   9,            // 招架成功停頓（全場最久）
  parrySlow:   0.35,         // 招架成功後時間放慢到 0.35 倍
  parrySlowT:  0.50,         // 放慢持續
  parrySparks: 30,
  parryKnockMul: 3.6,        // 彈飛倍率（足以把人彈到招牌上 → 砸招牌變成可以瞄的）
  parryCd:     0.30,         // 招架冷卻（不能一直按著）
  whiffRecover: 0.32,        // 揮空後搖（命中沒有）
  teleTime:    0.45,         // 敵人出手前的預告長度（看得見的一拍）

  // v5：三種攻擊。操作不加按鈕——點擊＝快斬、往前滑／移動中攻擊＝突進斬、連擊第三下＝重擊。
  moves: {
    quick: { windup:2/60, dur:0.20, reach: 92, dmg: 9,  knock:0.55, recover:0.30,
             interrupt:false, breakGuard:false, lunge:0,   name:'快斬' },
    dash:  { windup:5/60, dur:0.30, reach:124, dmg:14, knock:1.00, recover:0.34,
             interrupt:true,  breakGuard:true,  lunge:170, name:'突進斬' },
    heavy: { windup:11/60, dur:0.44, reach:140, dmg:20, knock:2.20, recover:0.44,
             interrupt:false, breakGuard:false, lunge:0,   name:'重擊' }
  }
};

// 四層視差（第 3 層＝玩家所在層，必須 1.00）
var PARALLAX   = [0.10, 0.34, 1.00, 1.45];
var PARALLAX_Y = [0.02, 0.10, 1.00, 1.12];

// 暗色為預設。光是固定色階，沒有任何即時光照。
var COL = {
  skyTop:'#05060f', skyMid:'#0b1024', skyLow:'#181a38', skyHorz:'#2a1f42',
  glowA:'rgba(120,40,140,0.30)', glowB:'rgba(40,60,140,0.16)', glowC:'rgba(20,20,60,0)',
  far:'#151a30', farTop:'#1d2440',     // 越遠越淺（相對於中景）
  mid:'#0d1122', midTop:'#141a2e', midEdge:'#26304e',
  haze:'90,130,200',
  street:'#080a12', streetTop:'#11141f', curb:'#1b2030', wet:'rgba(90,200,230,0.10)',
  prop:'#0a0d16', propEdge:'#1e2740',
  hero:'#e6f5ff', heroInk:'#0a1620', heroRim:'#5ff0ff',
  foeA:'#2a1020', foeRim:'#ff4f8b',     // 直衝
  foeB:'#101f2a', foeRim2:'#69ffd0',    // 格擋
  foeC:'#231a0d', foeRim3:'#ffc24a',    // 投擲
  boss:'#2b0d2b', bossRim:'#c76bff',
  neonA:'#ff3d7f', neonB:'#3df0ff', neonC:'#ffd23d', neonD:'#7a5bff',
  white:'#ffffff', spark:'#fff2b0'
};

// ================================================================ 關卡：手排的一段事件表
// 這是整關的唯一真相。順序固定，不是程序生成。
var LEVEL = [
  { id:'start',   kind:'空街',   x:   0, note:'起步：沒有敵人，讓玩家先按兩下' },
  { id:'pit',     kind:'坑',     x: 980, note:'第一個要跳過的坑（寬 260）' },
  { id:'wave1',   kind:'敵人',   x:1420, gate:2140, note:'第一波：兩個直衝的', spawn:[
      {t:'rush', x:1900}, {t:'rush', x:2060} ] },
  { id:'wall',    kind:'高牆',   x:2000, note:'高牆：踩招牌平台一段，再跳上高架街（兩段跳）' },
  { id:'breaker', kind:'機關',   x:3320, note:'電閘：打它會讓右邊巨幅招牌掉下來砸人' },
  { id:'wave2',   kind:'敵人',   x:3380, gate:4210, note:'第二波：直衝＋格擋＋投擲各一', spawn:[
      {t:'rush', x:3620}, {t:'guard', x:3800}, {t:'throw', x:4050} ] },
  { id:'boss',    kind:'小頭目', x:4250, gate:4830, note:'小頭目：會衝、會格擋、會叫東西砸你', spawn:[
      {t:'boss', x:4700} ] },
  { id:'goal',    kind:'終點',   x:4880, note:'走到這裡就結束' }
];

// 地形：有限的一串方塊（top 是踩的那條線）。看的與踩的同一份資料。
var SOLIDS = [
  { x:-400, y:GROUND_Y, w:1380, h:900, k:'street' },   // 起步空街（坑左緣 980）
  { x: 1240, y:GROUND_Y, w: 960, h:900, k:'street' },  // 坑右緣 1240 → 高牆腳 2200
  { x: 2060, y: 762, w: 120, h: 26, k:'sign' },        // 招牌平台（第一段跳）
  { x: 2200, y: 640, w: 800, h:900, k:'deck' },        // 高架街（第二段跳）2200~3000
  { x: 3000, y:GROUND_Y, w:1980, h:900, k:'street' },  // 落回街面 3000~4980
  { x: 4980, y: 300, w: 120, h:900, k:'wall' }         // 關卡右端牆：走不出去
];
var LEVEL_END = 4980;

// 可撞的招牌／看板（敵人被擊退撞上去會噴火花）
var PROPS = [
  { id:'s1', x: 1330, y: 640, w: 30, h: 190, kind:'pole',  col:COL.neonA, txt:'刃' },
  { id:'s2', x: 1760, y: 690, w: 26, h: 190, kind:'pole',  col:COL.neonB, txt:'麵' },
  { id:'s3', x: 2560, y: 430, w: 28, h: 200, kind:'pole',  col:COL.neonC, txt:'電' },
  { id:'s4', x: 3180, y: 660, w: 26, h: 210, kind:'pole',  col:COL.neonD, txt:'夜' },
  { id:'s5', x: 4350, y: 650, w: 30, h: 220, kind:'pole',  col:COL.neonA, txt:'拳' },
  { id:'s6', x: 4620, y: 640, w: 26, h: 230, kind:'pole',  col:COL.neonB, txt:'雨' }
];
// 電閘 + 會掉下來的巨幅招牌
var breaker = { x:3320, y:790, w:56, h:86, hp:1, broken:false };
var bigSign = { x:3560, y:470, w:300, h:120, falling:false, fell:false, vy:0, t:0, delay:0 };

// ================================================================ 狀態
var canvas = document.getElementById('c');
var ctx = canvas.getContext('2d', { alpha:false });
var viewW = 1920, viewH = 1080, scale = 1;

var player = null, enemies = [], shots = [], parts = [], floaters = [];
var camX = 0, camY = CAM_BASE_Y;
var shake = 0, shakeSign = 1, shakeX = 0, shakeY = 0;
var hitStop = 0;
var slowT = 0;               // 招架成功後的子彈時間
var rngSeed = 1;
function srnd(){ rngSeed = (rngSeed*1664525 + 1013904223) % 4294967296; return rngSeed/4294967296; }
var started = false, paused = false, gameT = 0, finished = false, finishT = 0, maxProgress = 0;
var activeGate = null;       // {x, waveId}
var fired = {};              // 已觸發的事件
var input = { left:false, right:false, jump:false, attack:false, parry:false, attackDash:false };
var lastAudio = { freqs: [] };
var probeLog = { hits: [] };
var _frozenNow = null;
function perfNow(){ return _frozenNow != null ? _frozenNow : (performance.now()); }

function resetGame(seed){
  rngSeed = seed || 1;
  player = { x:120, y:GROUND_Y, vx:0, vy:0, face:1, onGround:true, hp:100,
             state:'idle', animT:0, walkPhase:0, atkT:-1, atkIdx:0, comboT:0,
             hurtT:0, landT:0, jumps:0, swung:false,
             parryT:0, parryCd:0, parryFlash:0, recoverT:0, dead:false,
             move:'quick', dashT:0 };
  enemies = []; shots = []; parts = []; floaters = [];
  camX = 0; camY = CAM_BASE_Y; shake = 0; hitStop = 0; slowT = 0; gameT = 0;
  finished = false; finishT = 0; activeGate = null; fired = {}; maxProgress = 0;
  breaker.broken = false;
  bigSign.falling = false; bigSign.fell = false; bigSign.vy = 0; bigSign.y = 470; bigSign.t = 0; bigSign.delay = 0;
  probeLog = { hits: [], parries:0, whiffs:0, hurt:0, whiffCtx: [], moves:{}, cuts:0, breaks:0 };
}

// ================================================================ 工具
function lerp(a,b,t){ return a+(b-a)*t; }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function rnd(s){ var t = Math.sin(s*127.1+311.7)*43758.5453; return t-Math.floor(t); }

// 站得上去的最高一塊（用來做碰撞與機器人的地形查詢）
function groundTopAt(x, fromY){
  var best = Infinity;
  for(var i=0;i<SOLIDS.length;i++){
    var s = SOLIDS[i];
    if(x < s.x || x > s.x + s.w) continue;
    if(s.y >= fromY - 12 && s.y < best) best = s.y;
  }
  return best;
}

// ================================================================ 尺寸
// 手機才壓到 1280；桌機沒有填充率問題，壓了只會糊（截圖上看得出來）
var IS_TOUCH = (typeof window !== 'undefined') &&
               (('ontouchstart' in window) || (navigator.maxTouchPoints|0) > 0);
var QUALITY = [ {edge: IS_TOUCH ? 1280 : 1920, rain:130, steam:14},
                {edge: IS_TOUCH ? 1040 : 1440, rain: 90, steam:10},
                {edge: IS_TOUCH ?  860 : 1200, rain: 60, steam: 7} ];
var qLevel = 0;
var RAIN_N = QUALITY[0].rain, STEAM_N = QUALITY[0].steam;
var MAX_EDGE = QUALITY[0].edge;        // 內部解析度上限（最長邊）。手機 DPR2~3 時畫布像素量是桌機的好幾倍，
                            // 而卡的是「畫多少像素」，不是「下多少指令」。超過就縮，再由 CSS 放大。
function resize(){
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  var pw = w*dpr, ph = h*dpr;
  var cap = Math.min(1, MAX_EDGE / Math.max(pw, ph));
  canvas.width  = Math.round(pw*cap);
  canvas.height = Math.round(ph*cap);
  canvas.style.width = w+'px'; canvas.style.height = h+'px';
  scale = canvas.height / DESIGN_H;
  viewH = DESIGN_H; viewW = canvas.width / scale;
  _skyCv = null; _gcache = {}; _bake = {};
}
window.addEventListener('resize', resize);

// 幀間隔的滑動平均：連續慢就降一檔、長時間順就升一檔（有遲滯，不會來回跳）
var _qAcc = 0, _qN = 0, _qHold = 0;
function qualityWatch(dtMs){
  _qAcc += dtMs; _qN++;
  if(_qHold > 0){ _qHold--; }
  if(_qN < 60) return;
  var avg = _qAcc/_qN; _qAcc = 0; _qN = 0;
  if(_qHold > 0) return;
  if(avg > 21 && qLevel < QUALITY.length-1){ setQuality(qLevel+1); _qHold = 180; }
  else if(avg < 13.5 && qLevel > 0){ setQuality(qLevel-1); _qHold = 600; }
}
function setQuality(l){
  qLevel = clamp(l, 0, QUALITY.length-1);
  MAX_EDGE = QUALITY[qLevel].edge;
  RAIN_N   = QUALITY[qLevel].rain;
  STEAM_N  = QUALITY[qLevel].steam;
  resize();
}

// ================================================================ 輸入
window.addEventListener('keydown', function(e){
  var k = e.key.toLowerCase();
  uiIdle = 0;
  if(k==='a'||k==='arrowleft'){ input.left = true; uiPress.left = 0.14; }
  if(k==='d'||k==='arrowright'){ input.right = true; uiPress.right = 0.14; }
  if(k===' '||k==='w'||k==='arrowup'){ input.jump = true; uiPress.jump = 0.14; e.preventDefault(); }
  if(k==='j'){ input.attack = true; uiPress.attack = 0.14; }
  if(k==='l'){ input.attackDash = true; input.attack = true; }   // 鍵盤上的突進斬捷徑（觸控是往前滑）
  if(k==='k'||k==='s'||k==='arrowdown'){ input.parry = true; uiPress.parry = 0.14; }
  if(k==='r') resetGame();
});
window.addEventListener('keyup', function(e){
  var k = e.key.toLowerCase();
  if(k==='a'||k==='arrowleft')  input.left = false;
  if(k==='d'||k==='arrowright') input.right = false;
  if(k===' '||k==='w'||k==='arrowup') input.jump = false;
  if(k==='j') input.attack = false;
  if(k==='l') input.attack = false;
  if(k==='k'||k==='s'||k==='arrowdown') input.parry = false;
});

// 觸控：左半＝移動（按住哪邊就往哪邊），右半＝攻擊，任一指上滑＝跳
var touches = {};
function refreshMove(){
  input.left = false; input.right = false;
  for(var k in touches){ var t = touches[k];
    if(t.move){ if(t.dir < 0) input.left = true; else input.right = true; } }
}
function tStart(e){
  uiIdle = 0; hintT = Math.min(hintT, 3);
  for(var i=0;i<e.changedTouches.length;i++){
    var t = e.changedTouches[i], half = window.innerWidth/2;
    var btn = hitButton(t.clientX, t.clientY);
    var rec = { x0:t.clientX, y0:t.clientY, btn: btn ? btn.key : null,
                move: btn ? (btn.key==='left'||btn.key==='right') : (t.clientX < half),
                dir: btn ? (btn.key==='left' ? -1 : 1) : (t.clientX < half*0.5 ? -1 : 1),
                jumped:false };
    touches[t.identifier] = rec;
    if(btn){
      uiPress[btn.key] = 0.14;
      if(btn.key === 'attack'){ rec.holding = true; input.attack = true; }
      else if(btn.key === 'parry'){ input.parry = true; setTimeout(function(){ input.parry = false; }, 90); }
      else if(btn.key === 'jump'){ input.jump = true; setTimeout(function(){ input.jump = false; }, 90); }
    } else if(!rec.move){ rec.holding = true; input.attack = true; }
  }
  refreshMove(); e.preventDefault();
}
function tMove(e){
  uiIdle = 0;
  for(var i=0;i<e.changedTouches.length;i++){
    var t = e.changedTouches[i], r = touches[t.identifier];
    if(!r) continue;
    if(r.move && !r.btn) r.dir = (t.clientX < window.innerWidth*0.25) ? -1 : 1;
    if(r.y0 - t.clientY > 40 && !r.jumped){
      r.jumped = true; input.jump = true;
      setTimeout(function(){ input.jump = false; }, 90);
    }
    // 右半邊下滑＝招架（v2）。下滑比第二顆按鈕好：拇指已經在那裡，不用看畫面找鈕。
    if((!r.move || r.btn === 'attack') && t.clientY - r.y0 > 36 && !r.parried){
      r.parried = true; input.parry = true;
      setTimeout(function(){ input.parry = false; }, 90);
    }
    // 右半邊往前滑＝突進斬（v5）。沒有新按鈕，只是同一根拇指往前推。
    if((!r.move || r.btn === 'attack') && !r.dashed && Math.abs(t.clientX - r.x0) > 44 &&
       Math.abs(t.clientX - r.x0) > Math.abs(t.clientY - r.y0)){
      r.dashed = true;
      input.attackDash = true; input.attack = true;
      setTimeout(function(){ input.attack = false; }, 60);
    }
  }
  refreshMove(); e.preventDefault();
}
function tEnd(e){
  for(var i=0;i<e.changedTouches.length;i++) delete touches[e.changedTouches[i].identifier];
  var anyHold = false;
  for(var k in touches) if(touches[k].holding) anyHold = true;
  if(!anyHold) input.attack = false;      // 右半的手指放開才算放開（長按＝重擊）
  refreshMove(); e.preventDefault();
}
canvas.addEventListener('touchstart', tStart, {passive:false});
canvas.addEventListener('touchmove',  tMove,  {passive:false});
canvas.addEventListener('touchend',   tEnd,   {passive:false});
canvas.addEventListener('touchcancel',tEnd,   {passive:false});
canvas.addEventListener('mousedown', function(e){
  if(e.clientX > window.innerWidth/2){ input.attack = true; }
  else input.right = true;
});
window.addEventListener('mouseup', function(){ input.attack = false; input.right = false; });


// ================================================================ 看得見的操作（v6）
// 製作人實機回報：手機上幾乎看不到操作的地方（原本左右半邊是隱形觸控區）。
// 控制項一律用「CSS 像素」排版（不是設計單位），並且全部塞進安全區之內。
var safeEl = null;
function safeInsets(){
  if(!safeEl) safeEl = document.getElementById('safe');
  if(!safeEl) return { t:0, r:0, b:0, l:0 };
  var cs = getComputedStyle(safeEl);
  return { t: parseFloat(cs.paddingTop)   || 0, r: parseFloat(cs.paddingRight)  || 0,
           b: parseFloat(cs.paddingBottom)|| 0, l: parseFloat(cs.paddingLeft)   || 0 };
}
var uiPress = {};            // 按下去亮一下
var uiIdle = 0;              // 幾秒沒碰
var HINT_T = 14;             // 進場說明顯示幾秒
var hintT = HINT_T;

// 依「可見區域」排版，不照固定比例：細長螢幕（20:9、21:9）只是左右變寬，鈕仍貼安全區角落
function uiLayout(){
  var W = window.innerWidth, H = window.innerHeight, sa = safeInsets();
  var L = sa.l + 14, R = W - sa.r - 14, B = H - sa.b - 14, T = sa.t + 10;
  var big = clamp(Math.min(H*0.30, 84), 56, 92);      // 攻擊鍵
  var mid = clamp(big*0.78, 48, 72);                  // 方向鍵
  var sml = clamp(big*0.66, 46, 62);                  // 招架／跳
  var gap = 12;
  var by = B - big/2;
  return {
    W:W, H:H, sa:sa, top:T,
    left:  { x: L + mid/2,             y: by, r: mid/2, label:'◀', sub:'移動', key:'left' },
    right: { x: L + mid*1.5 + gap,     y: by, r: mid/2, label:'▶', sub:'',     key:'right' },
    attack:{ x: R - big/2,             y: by, r: big/2, label:'攻擊', sub:'長按＝重擊', key:'attack' },
    parry: { x: R - big - gap - sml/2, y: by, r: sml/2, label:'招架', sub:'', key:'parry' },
    jump:  { x: R - big/2,             y: by - big/2 - gap - sml/2, r: sml/2, label:'跳', sub:'', key:'jump' }
  };
}
function uiButtons(){ var L = uiLayout(); return [L.left, L.right, L.attack, L.parry, L.jump]; }

function drawControls(g){
  if(!started) return;
  var L = uiLayout();
  var px = canvas.width / Math.max(1, window.innerWidth);   // CSS px → 畫布像素
  g.setTransform(px,0,0,px,0,0);
  var a = uiIdle > 6 ? 0.32 : 0.78;                          // 閒置淡化，但不消失（判準㉒）
  var btns = [L.left, L.right, L.attack, L.parry, L.jump];
  for(var i=0;i<btns.length;i++){
    var b = btns[i], lit = (uiPress[b.key] || 0) > 0;
    g.globalAlpha = a * (lit ? 1.25 : 1);
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI*2);
    g.fillStyle = lit ? 'rgba(95,240,255,0.30)' : 'rgba(10,20,32,0.42)';
    g.fill();
    g.lineWidth = lit ? 3.5 : 2;
    g.strokeStyle = lit ? '#bff6ff' : 'rgba(150,220,245,0.75)';
    g.stroke();
    g.fillStyle = lit ? '#ffffff' : '#cfeaf6';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    var fs = b.label.length > 1 ? Math.max(13, b.r*0.44) : Math.max(17, b.r*0.62);
    g.font = 'bold ' + fs.toFixed(0) + 'px -apple-system, "Noto Sans TC", sans-serif';
    g.fillText(b.label, b.x, b.y);
    if(b.sub){
      // 說明字畫在鈕的**上方**：畫在下方的話，在有圓角／底部手勢區的機器上會掉出安全區
      g.font = Math.max(11, b.r*0.28).toFixed(0) + 'px -apple-system, "Noto Sans TC", sans-serif';
      g.fillStyle = 'rgba(190,230,245,0.92)';
      g.fillText(b.sub, b.x, b.y - b.r - 10);
    }
  }
  // 進場說明：圖示旁一定要有中文字（他看不懂純圖示）
  if(hintT > 0){
    g.globalAlpha = clamp(hintT/2, 0, 1) * 0.95;
    var fs2 = Math.max(12, Math.min(16, L.W*0.019));
    var lines = ['左下移動　右下「攻擊」　長按攻擊＝重擊　往前滑＝突進斬',
                 '「招架」在他揮下來前按＝彈開他　「跳」跳過坑'];
    g.font = fs2.toFixed(0) + 'px -apple-system, "Noto Sans TC", sans-serif';
    var wMax = 0;
    for(var q=0;q<lines.length;q++) wMax = Math.max(wMax, g.measureText(lines[q]).width);
    var bw = wMax + 28, bh = fs2*2 + 26;
    var bx = (L.W - bw)/2, by2 = L.top;
    g.fillStyle = 'rgba(4,8,16,0.72)';
    g.fillRect(bx, by2, bw, bh);
    g.strokeStyle = 'rgba(95,240,255,0.5)'; g.lineWidth = 1.5;
    g.strokeRect(bx, by2, bw, bh);
    g.fillStyle = '#dff3ff'; g.textAlign = 'center'; g.textBaseline = 'top';
    for(var q2=0;q2<lines.length;q2++) g.fillText(lines[q2], L.W/2, by2 + 12 + q2*(fs2+4));
    g.globalAlpha = 1;
  }
  g.globalAlpha = 1; g.textBaseline = 'alphabetic';
  g.setTransform(1,0,0,1,0,0);
}

// 觸控：先看有沒有按到鈕；沒按到才回到「左半移動／右半攻擊」的舊行為（滑動手勢照舊）
function hitButton(cx, cy){
  var bs = uiButtons();
  for(var i=0;i<bs.length;i++){
    var b = bs[i], dx = cx-b.x, dy = cy-b.y;
    var rr = Math.max(b.r, 22);                 // 觸控目標至少 44px 等效（判準㉑）
    if(dx*dx + dy*dy <= rr*rr) return b;
  }
  return null;
}

// ================================================================ 音效（WebAudio 合成）
var actx = null;
function audioOn(){
  if(actx) return;
  try { actx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){ actx = null; }
}
function blip(freq, dur, type, gain){
  lastAudio.freqs.push(freq);
  if(!actx) return;
  try {
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type||'square'; o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(actx.destination);
    var t = actx.currentTime;
    g.gain.exponentialRampToValueAtTime(gain||0.16, t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t+(dur||0.12));
    o.start(t); o.stop(t+(dur||0.12)+0.02);
  } catch(e){}
}
function noise(dur, gain){
  if(!actx) return;
  try {
    var n = Math.floor(actx.sampleRate*(dur||0.08));
    var buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
    for(var i=0;i<n;i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/n, 2.2);
    var s = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter();
    f.type='bandpass'; f.frequency.value = 2200;
    s.buffer = buf; g.gain.value = gain||0.2;
    s.connect(f); f.connect(g); g.connect(actx.destination); s.start();
  } catch(e){}
}

// ================================================================ 效果
function addShake(mag){ if(mag > shake) shake = mag; }
function sparks(x, y, n, col, spread){
  for(var i=0;i<n;i++){
    var a = (rnd(gameT*97+i*13)*2-1) * (spread||1.4) - Math.PI*0.25;
    var sp = 260 + rnd(i*7.7+gameT*31)*520;
    parts.push({ x:x, y:y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 120,
                 life:0.30+rnd(i*3.3)*0.34, t:0, col:col||COL.spark, r:2+rnd(i*5.1)*2.4 });
  }
}
function floater(x, y, txt, col){ floaters.push({ x:x, y:y, txt:txt, col:col||COL.white, t:0 }); }

// ================================================================ 敵人
function spawnEnemy(t, x){
  var base = { x:x, y:groundTopAt(x, 0), vx:0, vy:0, face:-1, t:t, hp:40, maxHp:40,
               state:'walk', animT:0, atkT:-1, blockT:0, hurtT:0, kb:0, cd:0, dead:false, onGround:true,
               tele:0, teleKind:'', strikeT:0, swing:0, swingHit:false, post:0, stun:0, noBlockT:0, dmg:9, cdLen:1.4, reach:135 };
  if(t==='rush'){ base.hp = base.maxHp = 580; base.spd = 200; base.dmg = 8; base.cdLen = 1.7 + srnd()*0.6; }
  if(t==='guard'){ base.hp = base.maxHp = 880; base.spd = 140; base.dmg = 11; base.cdLen = 1.7 + srnd()*0.6; base.reach = 150; }
  if(t==='throw'){ base.hp = base.maxHp = 520; base.spd = 90; base.dmg = 7; base.cdLen = 2.0 + srnd()*0.6; }
  if(t==='boss'){ base.hp = base.maxHp = 620; base.spd = 200; base.dmg = 13; base.cdLen = 1.6; base.reach = 165; }
  enemies.push(base);
  return base;
}

function damageEnemy(e, dmg, dir, heavy, knockMul, cut){
  e.hp -= dmg;
  // 起手／出手中有霸體：普通一刀打不停他，也推不動他。
  // （沒有這條的話，最快的那一招可以把所有人永遠鎖在受擊硬直裡——
  //  無腦亂揮的機器人就是靠這個從 0% 變成 100% 通關的。）
  var armored = (e.tele > 0 || e.swing > 0) && !cut;
  e.hurtT = armored ? 0.05 : 0.22;
  e.vx = FEEL.knockV * dir * (e.t==='boss' ? 0.45 : 1) * (knockMul == null ? 1 : knockMul)
         * (armored ? 0.12 : 1);
  e.kb = armored ? 0 : 1;
  hitStop = Math.max(hitStop, heavy ? FEEL.hitStopHeavy : FEEL.hitStopLight);
  addShake(heavy ? FEEL.shakeHeavy : FEEL.shakeLight);
  sparks(e.x + dir*10, e.y - 100, heavy ? 16 : 9, COL.spark);
  probeLog.hits.push({ t:gameT, dmg:dmg, heavy:!!heavy });
  if(e.hp <= 0){
    e.dead = true;
    sparks(e.x, e.y - 90, 24, COL.neonA, 3.14);
    addShake(FEEL.shakeHeavy);
    hitStop = Math.max(hitStop, FEEL.hitStopHeavy);
    noise(0.22, 0.26); blip(150, 0.26, 'sawtooth', 0.14);
  }
}

// 被擊退的敵人撞上招牌／看板
function checkSlam(e){
  if(!e.kb) return;
  for(var i=0;i<PROPS.length;i++){
    var p = PROPS[i];
    if(Math.abs(e.x - (p.x + p.w/2)) < 26 + p.w/2 && e.y - 90 > p.y - 30){
      var dir = e.vx > 0 ? 1 : -1;
      e.vx = -e.vx * 0.35; e.kb = 0;
      e.hp -= 12;
      hitStop = Math.max(hitStop, FEEL.hitStopHeavy);
      addShake(FEEL.shakeHeavy);
      sparks(p.x + p.w/2 - dir*10, p.y + 40, 18, p.col, 2.2);
      sparks(p.x + p.w/2, p.y + 90, 14, COL.spark, 2.6);
      probeLog.slam = (probeLog.slam||0) + 1;
      probeLog.lastSlamParts = 32;
      noise(0.18, 0.3); blip(240, 0.14, 'square', 0.15);
      floater(p.x, p.y + 20, '砰', p.col);
      if(e.hp <= 0 && !e.dead){ e.dead = true; sparks(e.x, e.y-90, 20, p.col, 3.14); }
      return;
    }
  }
}

// ================================================================ 事件表推進
function updateEvents(){
  for(var i=0;i<LEVEL.length;i++){
    var ev = LEVEL[i];
    if(fired[ev.id]) continue;
    if(player.x < ev.x) continue;
    fired[ev.id] = true;
    if(ev.spawn){
      for(var j=0;j<ev.spawn.length;j++) spawnEnemy(ev.spawn[j].t, ev.spawn[j].x);
      if(ev.gate) activeGate = { x:ev.gate, id:ev.id };
      floater(player.x, player.y - 260, ev.id==='boss' ? '小頭目' : '敵襲', COL.neonA);
      blip(330, 0.18, 'sawtooth', 0.12);
    }
    if(ev.id === 'goal'){ finished = true; finishT = gameT; }
  }
  if(activeGate){
    var alive = 0;
    for(var k=0;k<enemies.length;k++) if(!enemies[k].dead) alive++;
    if(alive === 0) activeGate = null;
  }
}

// ================================================================ 更新
function stepPlayer(dt){
  var p = player;
  if(p.parryT > 0) p.parryT -= dt;
  if(p.parryCd > 0) p.parryCd -= dt;
  if(p.parryFlash > 0) p.parryFlash -= dt;
  if(p.recoverT > 0) p.recoverT -= dt;
  // 招架（右半下滑／K）：短短一瞬間，成功了才有回報，按爽的沒有用
  if(input.parry && p.parryCd <= 0 && p.hurtT <= 0 && p.atkT < 0){
    p.parryT = FEEL.parryWindow; p.parryCd = FEEL.parryCd + FEEL.parryWindow;
    blip(980, 0.05, 'triangle', 0.06);
  }
  // 攻擊（揮空後搖期間不能出手）。出哪一招由「當下的輸入」決定，不加按鈕：
  //   往前滑／正在往前跑時攻擊 → 突進斬；連擊第三下 → 重擊；其餘 → 快斬
  // 長按右半＝重擊（同一顆鈕、不是新按鈕）。連打的人拿不到重擊——
  // 重擊的大擊退曾經讓「亂揮」變成最強的防守（無腦機器人通關率 0% → 100%）。
  if(input.attack) p.holdT = (p.holdT || 0) + dt;
  else { p.holdT = 0; p.heavyFired = false; }
  var wantHeavy = (p.holdT >= 0.28 && !p.heavyFired);
  var pressEdge = (input.attack && !p.attackWasDown);
  p.attackWasDown = input.attack;

  if((pressEdge || wantHeavy) && p.atkT < 0 && p.hurtT <= 0 && p.recoverT <= 0 && p.parryT <= 0){
    p.atkIdx = (p.comboT > 0) ? (p.atkIdx % 3) + 1 : 1;
    // 「等著出手」才打得出打斷：距離上一刀結束至少 0.25 秒。
    // 不這樣的話連打的人會靠亂揮撞出打斷——無腦機器人的通關率從 0% 跳到 100% 就是這樣來的。
    p.readyGap = (p.sinceAtk == null) ? 1 : p.sinceAtk;
    p.sinceAtk = 0;
    // 突進斬只認「往前滑／L 鍵」這個明確的輸入。
    // 曾經也讓「一邊往前跑一邊攻擊」算突進斬——結果是一直往右跑的無腦機器人
    // 每局白拿 4 次打斷、2 次破盾，通關率從 0% 跳回 38%。
    var kind = 'quick';
    if(wantHeavy){ kind = 'heavy'; p.heavyFired = true; }
    else if(input.attackDash) kind = 'dash';
    p.move = kind;
    probeLog.moves[kind] = (probeLog.moves[kind]||0) + 1;
    var mv0 = FEEL.moves[kind];
    p.comboT = 0.62; p.atkT = 0; p.swung = false;
    if(kind === 'dash'){ p.vx = p.face * mv0.lunge * 4.2; p.dashT = 0.16; }
    blip(kind==='heavy' ? 420 : (kind==='dash' ? 660 : FEEL.comboFreq[Math.min(p.atkIdx,3)-1]),
         0.07, kind==='dash' ? 'sawtooth' : 'square', 0.10);
    audioOn();
    input.attackDash = false;
  }
  if(p.comboT > 0) p.comboT -= dt; else p.atkIdx = 0;
  if(p.atkT < 0) p.sinceAtk = (p.sinceAtk == null ? 1 : p.sinceAtk) + dt;

  var attacking = p.atkT >= 0;
  if(attacking){
    p.atkT += dt;
    var MV = FEEL.moves[p.move || 'quick'];
    if(p.dashT > 0){ p.dashT -= dt; if(p.dashT <= 0) p.vx *= 0.25; }
    if(!p.swung && p.atkT >= MV.windup){
      p.swung = true;
      var heavy = (p.move === 'heavy');
      var reach = MV.reach;
      var hx = p.x + p.face*(28 + reach/2);
      var hit = false;
      for(var i=0;i<enemies.length;i++){
        var e = enemies[i];
        if(e.dead) continue;
        var rel = (e.x - p.x) * p.face;      // 前方為正
        if(rel < -34 || rel > 34 + reach) continue;   // 貼在身上也要打得到（v3 的無限揮空迴圈就在這）
        if(Math.abs((e.y-90) - (p.y-95)) > 110) continue;
        // 格擋型：從正面打會被擋下來
        // 「繞後」＝玩家站在敵人背對的那一側。格擋中的敵人**不會轉身**，
        // 所以跳過去就打得到背後——這是格擋型唯一的解法。
        var fromBehind = (e.face === 1 && p.x < e.x) || (e.face === -1 && p.x > e.x);
        // 突進斬破盾（這是持盾敵人的正解之一，另一個是繞後）
        if(MV.breakGuard) probeLog.dbgDashHit = (probeLog.dbgDashHit||0)+1;
        if((e.t==='guard' || e.t==='boss') && e.blockT > 0 && !fromBehind && !MV.breakGuard){
          hitStop = Math.max(hitStop, FEEL.hitStopBlock);
          addShake(4);
          sparks(hx, p.y-110, 8, COL.foeRim2, 1.0);
          p.vx = -p.face * 260;
          noise(0.06, 0.16); blip(880, 0.05, 'triangle', 0.08);
          floater(e.x, e.y-190, '擋', COL.foeRim2);
          hit = true; continue;
        }
        var openUp = e.stun > 0;                 // 剛被招架彈開＝破綻，這一下加倍
        // 快斬打中「正在預告」的敵人＝打斷（直衝型的正解）
        // 打斷是**突進斬**的性質，不是「打得夠快」的獎勵。
        // 兩條被否決的寫法：①「上一刀之後要停 0.25 秒」——擋得住亂揮，但它懲罰的是「一直在打」，
        // 連會選招的人也不敢出手；②「預告的前 45% 內打到就算」——亂揮的人一樣撞得到（實測他拿 92 次打斷）。
        // 綁在招式上才乾淨：亂點只會出快斬，出不了突進斬。
        // 對衝也算：他已經衝出來了，你用突進斬迎上去一樣把他撞停。
        // （只有預告那一段算的話，窗太窄——機器人 114 次突進只成功 12 次。）
        var cut = MV.interrupt && (e.tele > 0 || e.strikeT > 0);
        if(cut){
          e.tele = 0; e.swing = 0; e.stun = 2.0; e.vx = p.face*300;
          floater(e.x, e.y-210, '打斷', COL.white); probeLog.cuts++;
          sparks(e.x, e.y-120, 14, COL.white, 2.4);
          blip(1500, 0.08, 'square', 0.12);
        }
        if(MV.breakGuard && e.blockT > 0){
          // 破盾之後要是「開著的」，不能馬上又舉起來——
          // cyc 歸零等於破完盾他立刻重新舉盾，機器人就會卡在無限破盾迴圈裡（實測 285 次突進斬）
          // 破盾＝這場架的開關：盾被打掉之後 3 秒都舉不起來（不然破完他馬上又舉，
          // 玩家會卡在無限破盾迴圈，時間反而比不破盾還久）
          e.blockT = 0; e.cyc = 1.75; e.noBlockT = 3.0; e.stun = Math.max(e.stun, 1.6);
          floater(e.x, e.y-210, '破盾', COL.neonC); probeLog.breaks++;
          sparks(e.x, e.y-120, 14, COL.neonC, 2.4);
        }
        damageEnemy(e, MV.dmg * (openUp ? 2 : 1) * (cut ? 2.0 : 1), p.face,
                    heavy || openUp || cut, MV.knock, cut || (MV.breakGuard && e.blockT > 0));
        if(openUp) floater(e.x, e.y-200, '破綻', COL.white);
        noise(0.09, 0.22);
        blip(FEEL.comboFreq[Math.min(p.atkIdx,3)-1] * 1.5, 0.09, 'square', 0.13);
        hit = true;
      }
      // 打電閘
      if(!breaker.broken && Math.abs(breaker.x + breaker.w/2 - hx) < reach/2 + 30
         && Math.abs(p.y - GROUND_Y) < 140){
        breaker.broken = true; bigSign.delay = 0.85;   // 斷電到招牌真的掉下來有 0.85 秒：
                                                       // 打電閘的「時機」決定砸中誰（判準：可以瞄）
        hitStop = Math.max(hitStop, FEEL.hitStopHeavy);
        addShake(FEEL.shakeHeavy);
        sparks(breaker.x+28, breaker.y+20, 22, COL.neonC, 3.14);
        floater(breaker.x, breaker.y - 60, '電閘斷開', COL.neonC);
        noise(0.3, 0.3); blip(90, 0.4, 'sawtooth', 0.16);
        hit = true;
      }
      // 打飛來的東西
      for(var s=shots.length-1;s>=0;s--){
        if(Math.abs(shots[s].x - hx) < reach/2 + 24 && Math.abs(shots[s].y - (p.y-100)) < 90){
          var ow = shots[s].owner;
          sparks(shots[s].x, shots[s].y, 12, COL.foeRim3); shots.splice(s,1);
          hitStop = Math.max(hitStop, FEEL.hitStopLight); addShake(5); hit = true;
          // 把他丟過來的東西打掉＝他自己僵在那裡（投擲型的剋制法）
          if(ow && !ow.dead){
            ow.stun = Math.max(ow.stun, 1.2); ow.tele = 0; ow.swing = 0;
            floater(ow.x, ow.y-210, '反擊', COL.foeRim3);
            probeLog.deflects = (probeLog.deflects||0) + 1;
            blip(1300, 0.08, 'square', 0.1);
          }
        }
      }
      if(!hit){                       // 判準⑨：揮空要有代價（每一招的後搖不一樣）
        blip(300, 0.05, 'triangle', 0.05);
        p.recoverT = MV.recover;
        probeLog.whiffs++;
        if(probeLog.whiffCtx && probeLog.whiffCtx.length < 6 && enemies.length){
          var e0 = enemies[0];
          probeLog.whiffCtx.push({ rel: Math.round((e0.x-p.x)*p.face), face:p.face,
            ey: Math.round(e0.y), py: Math.round(p.y), kb: e0.kb?1:0, dead: e0.dead?1:0 });
        }
      }
    }
    if(p.atkT > MV.dur){ p.atkT = -1; p.swung = false; }
  }

  // 移動（攻擊中減速，這是「站定打」的重量感）
  var mv = (input.right?1:0) - (input.left?1:0);
  var spd = attacking ? RUN_V*0.22 : RUN_V;
  if(p.hurtT > 0 || p.recoverT > 0 || p.parryT > 0) spd = 0;
  if(mv !== 0){ p.vx = lerp(p.vx, mv*spd, 0.35); if(!attacking) p.face = mv; }
  else p.vx = lerp(p.vx, 0, p.onGround ? 0.30 : 0.10);

  // 跳（兩段）
  if(input.jump && p.jumps < 2 && !p._jumpHeld){
    p.vy = -JUMP_V; p.onGround = false; p.jumps++; p._jumpHeld = true;
    blip(520 + p.jumps*130, 0.07, 'triangle', 0.07);
  }
  if(!input.jump) p._jumpHeld = false;

  p.vy += GRAV*dt;
  p.x += p.vx*dt; p.y += p.vy*dt;

  // 關卡左右界＋戰鬥時的門
  var rightLimit = activeGate ? activeGate.x : LEVEL_END - 40;
  if(p.x > rightLimit){ p.x = rightLimit; p.vx = 0; }
  if(p.x < 40) p.x = 40;

  // 地形：踩得到的最高一塊
  var wasAir = !p.onGround;
  p.onGround = false;
  for(var g=0;g<SOLIDS.length;g++){
    var sd = SOLIDS[g];
    if(p.x < sd.x - 16 || p.x > sd.x + sd.w + 16) continue;
    if(p.vy >= 0 && p.y >= sd.y - 2 && p.y <= sd.y + 40 + p.vy*dt){
      p.y = sd.y; p.vy = 0; p.onGround = true; p.jumps = 0;
      if(wasAir){ p.landT = 0.12; noise(0.05, 0.08); }
    }
  }
  // 撞到量體側面（高牆、關卡右端）
  for(var g2=0;g2<SOLIDS.length;g2++){
    var s2 = SOLIDS[g2];
    if(s2.k === 'sign') continue;
    if(p.y - 6 > s2.y && p.y < s2.y + s2.h && p.x > s2.x - 18 && p.x < s2.x + s2.w + 18){
      if(p.x < s2.x + s2.w/2){ p.x = s2.x - 18; } else { p.x = s2.x + s2.w + 18; }
      p.vx = 0;
    }
  }
  if(p.y > GROUND_Y + 520){                   // 玩家掉進坑：扣血、拉回坑的左緣
    var back = p.x;
    for(var bx2 = Math.round(p.x); bx2 > 40; bx2 -= 10){
      if(isFinite(groundTopAt(bx2, 0)) && groundTopAt(bx2, 0) <= GROUND_Y + 10){ back = bx2 - 60; break; }
    }
    p.x = Math.max(60, back); p.y = groundTopAt(p.x, 0); p.vy = 0; p.vx = 0; p.jumps = 0;
    hurtPlayer(12, 1);
    floater(p.x, p.y-260, '摔下去', COL.neonA);
  }
  if(p.landT > 0) p.landT -= dt;
  if(p.hurtT > 0) p.hurtT -= dt;

  // 狀態
  if(attacking) p.state = 'atk';
  else if(p.parryT > 0 || p.parryFlash > 0.30) p.state = 'parry';
  else if(p.hurtT > 0) p.state = 'hurt';
  else if(p.recoverT > 0) p.state = 'recover';
  else if(!p.onGround) p.state = 'air';
  else if(p.landT > 0) p.state = 'land';
  else if(Math.abs(p.vx) > 40) p.state = 'walk';
  else p.state = 'idle';
  p.animT += dt;
  if(p.state === 'walk'){ p.walkPhase = (p.walkPhase + Math.abs(p.vx)*dt/48) % 8; }
}

// 敵人的每一次傷害都走這裡：先問玩家有沒有在招架。
function enemyStrike(e, dmg, dir){
  if(player.parryT > 0){ parrySuccess(e, dir); return true; }
  hurtPlayer(dmg, dir);
  return false;
}

// 招架成功＝全場最強的回饋（判準⑧）
function parrySuccess(e, dir){
  player.parryT = 0; player.parryFlash = 0.45;
  hitStop = Math.max(hitStop, FEEL.parryStop);
  slowT = FEEL.parrySlowT;
  addShake(FEEL.shakeHeavy);
  var px = player.x + (dir? -dir*40 : 40);
  sparks(px, player.y-110, FEEL.parrySparks, COL.white, 3.14);
  sparks(px, player.y-110, 10, COL.heroRim, 2.0);
  floater(player.x, player.y-250, '招架', COL.heroRim);
  probeLog.parries++;
  // 招架成功回一點血（義體回充）。這是「選對」唯一會給的續航，
  // 亂打的人拿不到——兩隻機器人的差距主要長在這裡。
  if(player.hp < 100){ player.hp = Math.min(100, player.hp + 5); floater(player.x, player.y-290, '+5', COL.heroRim); }
  noise(0.22, 0.32); blip(1200, 0.10, 'square', 0.14); blip(1800, 0.16, 'triangle', 0.10);
  if(e && !e.dead){
    var away = (e.x > player.x) ? 1 : -1;
    e.vx = FEEL.knockV * FEEL.parryKnockMul * away;   // 彈飛得夠遠，撞得到招牌
    // 招架給的破綻比「用對招」短很多：招架＝安全但慢（0.45 秒），
    // 打斷 2.0 秒、破盾 1.6 秒。這是「選對招」唯一真正的報酬來源。
    e.kb = 1; e.stun = 0.45; e.tele = 0; e.strikeT = 0; e.swing = 0; e.post = 0; e.blockT = 0;
    e.hp -= 8;
  }
}

function hurtPlayer(dmg, dir){
  if(player.hurtT > 0) return;
  player.hp -= dmg; player.hurtT = 0.4;
  player.vx = dir*420; player.vy = -280;
  addShake(11); hitStop = Math.max(hitStop, FEEL.hitStopLight);
  sparks(player.x, player.y-110, 10, COL.neonA, 2.4);
  noise(0.15, 0.24); blip(180, 0.16, 'sawtooth', 0.12);
  probeLog.hurt++;
  if(player.hp <= 0){        // v2：死了就是死了，這一局結束（不然「打贏」沒有意義）
    player.hp = 0; player.dead = true;
    addShake(FEEL.shakeHeavy); hitStop = Math.max(hitStop, 8);
    sparks(player.x, player.y-100, 30, COL.heroRim, 3.14);
  }
}

function stepEnemy(e, dt){
  if(e.dead) return;
  e.animT += dt;
  if(e.hurtT > 0) e.hurtT -= dt;
  var dx = player.x - e.x, ad = Math.abs(dx);
  // 格擋中不轉身（背後就是它的破綻）。但離太遠就重新面向玩家，
  // 否則架式一直開著的頭目會朝固定方向一路走出關卡（第一次跑機器人抓到的）。
  if((!(e.blockT > 0) && !(e.tele > 0) && !(e.strikeT > 0) && !(e.swing > 0) && !(e.post > 0)) || ad > 220) e.face = dx > 0 ? 1 : -1;

  // 架式每幀更新（放在動作鏈裡的話，只要一直打他，他的盾就永遠停在被打的那一瞬間——
  // 實測「持盾型」在玩家開打之後根本不會舉盾，破盾這條路等於不存在）
  if(!e.dead && !(e.stun > 0) && !e.kb && e.tele <= 0 && e.swing <= 0 && e.strikeT <= 0){
    if(e.noBlockT > 0) e.noBlockT -= dt;
    if(e.t === 'guard'){
      e.cyc = (e.cyc || 0) + dt; if(e.cyc > 2.3) e.cyc = 0;
      e.blockT = (ad < 320 && e.cyc < 1.7 && !(e.noBlockT > 0)) ? 0.3 : 0;
    } else if(e.t === 'boss'){
      e.cyc = (e.cyc || 0) + dt; if(e.cyc > 2.6) e.cyc = 0;
      e.blockT = (ad < 340 && e.cyc < 1.4 && !(e.noBlockT > 0)) ? 0.3 : 0;
    }
  }

  if(e.kb){                       // 被擊退中：只跑物理
    e.vx *= Math.pow(FEEL.knockFric, dt*60);
    if(Math.abs(e.vx) < 40){ e.vx = 0; e.kb = 0; }
  } else if((e.hurtT <= 0 || e.tele > 0 || e.swing > 0) && !(e.stun > 0)){
    // v2：每一次出手都先有一拍看得見的預告（tele），預告結束才判定傷害。
    // 玩家在預告那一拍按招架 → 成功；亂按招架 → 冷卻中挨打。
    if(e.tele > 0){
      // 第一段：預告（武器舉過頭、重心下沉、上身前傾——不位移）
      e.tele -= dt;
      e.vx = 0;
      if(e.tele <= 0){ e.tele = 0; e.swing = (e.teleKind === 'dash') ? 0.12 : 0.18; e.swingHit = false; }
    } else if(e.swing > 0){
      // 第二段：出手。傷害落在**刀真的掃到身前的那一幀**（出手動作的中段），
      // 不是出手的第一幀——第一幀刀還舉在頭上，那時候扣血看起來像無中生有。
      e.swing -= dt;
      if(!e.swingHit && e.swing <= 0.10){
        e.swingHit = true;
        var adNow = Math.abs(player.x - e.x);
        if(e.teleKind === 'throw'){
          shots.push({ x:e.x + e.face*40, y:e.y-150, vx:e.face*(380 + adNow*0.2), vy:-380, t:0, owner:e });
          blip(420, 0.1, 'triangle', 0.08);
        } else if(e.teleKind === 'dash'){
          e.vx = e.face * 980; e.strikeT = 0.28; e.strikeDmg = e.dmg;
        } else {
          if(adNow < (e.reach||135)) enemyStrike(e, e.dmg, e.face);
          sparks(e.x + e.face*80, e.y-110, 6, '#ffffff', 1.2);
          noise(0.06, 0.12);
        }
      }
      // 被招架的那一幀 parrySuccess 已經把 vx 設成彈飛速度，這裡不能再蓋回去
      // （量出來擊飛距離剩 2，判準⑧當場掉下來）
      if(e.teleKind !== 'dash' && !e.kb) e.vx = e.face*60;
      if(e.swing <= 0){ e.swing = 0; e.post = 0.26; if(!e.kb) e.vx = -e.face*150; }   // 打完往後撤半步：
      // 不撤的話它會一直往前擠，玩家被推著走，兩個人一路漂到場地外（招架彈飛量到 75 就是這樣來的）
    } else if(e.strikeT > 0){                             // 衝刺：撞到就打
      e.strikeT -= dt;
      if(Math.abs(player.x - e.x) < 70){
        enemyStrike(e, e.strikeDmg || e.dmg, e.face);
        e.strikeT = 0; e.vx = -e.face*320; e.cd = e.cdLen; e.post = 0.26;
      }
      if(e.strikeT <= 0){ e.cd = e.cdLen; e.post = 0.26; }
    } else if(e.post > 0){
      // 第三段：收招（打完拉不回來的那一拍，也是玩家的反擊窗）
      e.post -= dt; e.vx *= 0.82;
    } else if(e.t === 'rush'){
      e.vx = e.face * e.spd;
      if(Math.abs(player.x - e.x) < 230 && e.cd <= 0){
        e.tele = FEEL.teleTime; e.teleKind = 'dash'; e.cd = e.cdLen;
        blip(620, 0.08, 'sawtooth', 0.06);
      }
    } else if(e.t === 'guard'){
      // 架式的節奏在上面每幀更新（舉盾 1.7 秒、露空門 0.6 秒）
      e.vx = (ad > 90 && e.blockT <= 0) ? e.face * e.spd : 0;
      if(ad < 150 && e.cd <= 0 && e.blockT <= 0){
        e.tele = FEEL.teleTime + 0.05; e.teleKind = 'swing'; e.cd = e.cdLen;
        blip(520, 0.08, 'sawtooth', 0.06);
      }
    } else if(e.t === 'throw'){
      e.vx = (ad < 380) ? -e.face*e.spd : (ad > 620 ? e.face*e.spd : 0);
      if(e.cd <= 0 && ad < 900){
        e.tele = FEEL.teleTime + 0.10; e.teleKind = 'throw'; e.cd = e.cdLen;
      }
    } else if(e.t === 'boss'){
      // 三招，各自有預告：衝刺／橫掃／擲物。順序帶一點亂數，不是固定循環。
      e.vx = (ad > 260) ? e.face*e.spd*0.7 : (ad < 120 ? -e.face*e.spd*0.35 : 0);
      if(e.cd <= 0 && e.blockT <= 0){
        var r = srnd();
        if(ad > 300)            { e.teleKind = 'throw'; }
        else if(r < 0.5)        { e.teleKind = 'dash'; }
        else                    { e.teleKind = 'swing'; }
        e.tele = FEEL.teleTime + (e.teleKind==='swing' ? 0.10 : 0.05);
        e.cd = e.cdLen;
        floater(e.x, e.y-250, e.teleKind==='dash'?'衝':(e.teleKind==='swing'?'掃':'擲'), COL.bossRim);
        blip(300, 0.12, 'sawtooth', 0.09);
      }
    }
  }
  if(e.cd > 0) e.cd -= dt;
  if(e.stun > 0){ e.stun -= dt; e.tele = 0; e.strikeT = 0; e.swing = 0; e.post = 0; e.blockT = 0; }

  e.vy += GRAV*dt;
  e.x += e.vx*dt; e.y += e.vy*dt;
  var top = groundTopAt(e.x, e.y - 40);
  if(e.y >= top){ e.y = top; e.vy = 0; e.onGround = true; }
  // 敵人不能待在戰鬥門的外面——玩家被門擋著、它又不進來，就會永遠耗在那裡
  // （兩隻機器人都卡在這上面：頭目被打飛到門外、投擲兵自己退到門外）
  e.x = clamp(e.x, 60, (activeGate ? activeGate.x - 25 : LEVEL_END - 30));
  // 敵人不站進玩家身體裡（衝刺會直接穿過去停在玩家身上，那時雙方都打不到對方）
  if(!e.kb && !e.dead && e.strikeT <= 0){
    var sep = e.x - player.x, absSep = Math.abs(sep);
    if(absSep < 54){
      var push = (54 - absSep) * (sep >= 0 ? 1 : -1);
      e.x += push * 0.6;
      player.x -= push * 0.4;
    }
  }
  checkSlam(e);
  if(e.y > GROUND_Y + 420 && !e.dead){        // 掉進坑＝死。
    // （不處理的話它會永遠往下掉、還活著，把戰鬥門鎖死——機器人卡住 190 秒就是這個）
    e.dead = true; e.hp = 0;
    blip(120, 0.3, 'sawtooth', 0.10);
  }
  if(e.hp <= 0) e.dead = true;

  // 被掉下來的招牌砸到
  if(bigSign.falling && !bigSign.fell){
    if(e.x > bigSign.x - 20 && e.x < bigSign.x + bigSign.w + 20
       && e.y - 40 > bigSign.y && e.y - 180 < bigSign.y + bigSign.h){
      e.hp -= 200; e.dead = true;
      sparks(e.x, e.y-90, 26, COL.neonC, 3.14);
      addShake(FEEL.shakeHeavy); hitStop = Math.max(hitStop, FEEL.hitStopHeavy);
      probeLog.crushed = (probeLog.crushed||0)+1;
    }
  }
}

function stepWorld(dt){
  gameT += dt;
  stepPlayer(dt);
  for(var i=0;i<enemies.length;i++) stepEnemy(enemies[i], dt);
  for(var i2=enemies.length-1;i2>=0;i2--) if(enemies[i2].dead && enemies[i2].hurtT < -0.6) enemies.splice(i2,1);
  for(var d=0;d<enemies.length;d++) if(enemies[d].dead) enemies[d].hurtT -= dt;

  // 飛來的東西
  for(var s=shots.length-1;s>=0;s--){
    var sh = shots[s]; sh.t += dt; sh.vy += GRAV*0.55*dt;
    sh.x += sh.vx*dt; sh.y += sh.vy*dt;
    if(Math.abs(sh.x - player.x) < 40 && Math.abs(sh.y - (player.y-100)) < 105){
      if(player.parryT > 0){ parrySuccess(null, sh.vx>0?1:-1); }
      else hurtPlayer(8, sh.vx>0?1:-1);
      shots.splice(s,1); continue;
    }
    if(sh.y > groundTopAt(sh.x, sh.y) || sh.t > 4){
      sparks(sh.x, sh.y, 6, COL.foeRim3); shots.splice(s,1);
    }
  }

  // 掉下來的巨幅招牌
  if(bigSign.delay > 0){
    bigSign.delay -= dt;
    if(bigSign.delay <= 0){ bigSign.falling = true; bigSign.delay = 0; }
  }
  if(bigSign.falling && !bigSign.fell){
    bigSign.vy += GRAV*0.8*dt; bigSign.y += bigSign.vy*dt;
    if(bigSign.y + bigSign.h >= GROUND_Y){
      bigSign.y = GROUND_Y - bigSign.h; bigSign.fell = true; bigSign.falling = false;
      addShake(FEEL.shakeHeavy); hitStop = Math.max(hitStop, FEEL.hitStopHeavy);
      sparks(bigSign.x + bigSign.w/2, GROUND_Y - 10, 30, COL.neonC, 3.14);
      noise(0.4, 0.34); blip(70, 0.5, 'sawtooth', 0.18);
    }
  }

  updateEvents();
}

function stepFx(dt){
  uiIdle += dt;
  if(hintT > 0) hintT -= dt;
  for(var uk in uiPress){ if(uiPress[uk] > 0) uiPress[uk] -= dt; }
  for(var i=parts.length-1;i>=0;i--){
    var p = parts[i]; p.t += dt;
    if(p.t > p.life){ parts.splice(i,1); continue; }
    p.vy += 1800*dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vx *= 0.94;
  }
  for(var f=floaters.length-1;f>=0;f--){
    floaters[f].t += dt; floaters[f].y -= 50*dt;
    if(floaters[f].t > 1.0) floaters.splice(f,1);
  }
  // 震動：每幀衰減、左右交替（振幅可量）
  if(shake > 0.05){
    shakeSign = -shakeSign;
    shakeX = shake*shakeSign; shakeY = shake*0.45*shakeSign;
    shake *= FEEL.shakeDecay;
  } else { shake = 0; shakeX = 0; shakeY = 0; }
}

// 一個完整邏輯幀（命中停頓＝整個世界凍結，特效與震動照跑）
function step(dt){
  if(hitStop > 0){ hitStop--; stepFx(dt); return; }
  if(slowT > 0){ slowT -= dt; dt *= FEEL.parrySlow; }   // 招架成功後的子彈時間
  if(player.dead){ stepFx(dt); return; }
  stepWorld(dt);
  stepFx(dt);
  // 相機
  var tx = clamp(player.x - viewW*0.38, -300, LEVEL_END - viewW + 200);
  camX = lerp(camX, tx, 0.14);
  camY = lerp(camY, player.y, 0.08);
}

// ================================================================ 畫面
var _gcache = {}, _skyCv = null, _skyKey = '';
function cachedGrad(key, make){
  var ck = key+'|'+Math.round(viewW);
  if(!_gcache[ck]) _gcache[ck] = make();
  return _gcache[ck];
}
function staticSky(){
  var key = canvas.width+'x'+canvas.height;
  if(_skyCv && _skyKey === key) return _skyCv;
  var cv = document.createElement('canvas');
  cv.width = canvas.width; cv.height = canvas.height;
  var g = cv.getContext('2d');
  g.setTransform(scale,0,0,scale,0,0);
  var q = g.createLinearGradient(0,0,0,viewH);
  q.addColorStop(0, COL.skyTop); q.addColorStop(0.42, COL.skyMid);
  q.addColorStop(0.72, COL.skyLow); q.addColorStop(1, COL.skyHorz);
  g.fillStyle = q; g.fillRect(0,0,viewW,viewH);
  // 城市打上來的光害：固定在畫面下緣的一團，不隨相機動（＝畫進去的光）
  var h = g.createRadialGradient(viewW*0.5, viewH*0.86, 0, viewW*0.5, viewH*0.86, viewH*0.95);
  h.addColorStop(0, COL.glowA); h.addColorStop(0.35, COL.glowB); h.addColorStop(1, COL.glowC);
  g.fillStyle = h; g.fillRect(0,0,viewW,viewH);
  _skyCv = cv; _skyKey = key;
  return cv;
}

function layerSet(g, i){
  g.setTransform(scale,0,0,scale,0,0);
  g.translate(-camX*PARALLAX[i] + shakeX*(i===2?1:0.4),
              -(camY-CAM_BASE_Y)*PARALLAX_Y[i] + shakeY*(i===2?1:0.4));
}

// 一棟樓：先做出不規則輪廓，clip 進去之後才畫窗、樓板、招牌。
// （ART_PIPELINE：裝飾必須被輪廓夾住，不能浮空。）
function drawBuilding(g, x, w, top, base, s, fill, deco){
  g.save();
  g.beginPath();
  var notch = rnd(s*3.1);
  g.moveTo(x, base);
  g.lineTo(x, top + 24*rnd(s*1.7));
  if(notch < 0.34){                   // 階梯狀頂
    g.lineTo(x + w*0.42, top + 20);
    g.lineTo(x + w*0.42, top - 34);
    g.lineTo(x + w*0.78, top - 34);
    g.lineTo(x + w*0.78, top + 10);
    g.lineTo(x + w, top + 16);
  } else if(notch < 0.68){            // 斜削頂
    g.lineTo(x + w*0.55, top - 26*rnd(s*5.3));
    g.lineTo(x + w, top + 34*rnd(s*2.9));
  } else {                            // 平頂＋天線基座
    g.lineTo(x + w*0.30, top);
    g.lineTo(x + w*0.34, top - 40);
    g.lineTo(x + w*0.42, top - 40);
    g.lineTo(x + w*0.46, top);
    g.lineTo(x + w, top + 8);
  }
  g.lineTo(x + w, base);
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.clip();                            // ← 以下所有裝飾都被這棟的輪廓夾住

  if(deco){
    // 窗：不整齊，成串亮／成串暗
    var cols = Math.max(2, Math.floor(w/26));
    var rows = Math.max(3, Math.floor((base-top)/34));
    for(var r=0;r<rows;r++){
      var rowLit = rnd(s*7.3 + r*2.1);
      for(var c=0;c<cols;c++){
        var q2 = rnd(s*11.7 + r*31.3 + c*5.9);
        if(q2 > 0.52 + rowLit*0.3) continue;
        var wx = x + 8 + c*(w-14)/cols, wy = top + 26 + r*32;
        var lit = q2 < 0.16;
        g.fillStyle = lit ? (q2 < 0.06 ? 'rgba(95,240,255,0.30)' : 'rgba(255,200,120,0.20)')
                          : 'rgba(10,14,26,0.85)';
        g.fillRect(wx, wy, (w-14)/cols*0.55, 16);
      }
    }
    // 直排霓虹招牌（貼在樓面上，被輪廓夾住）
    if(rnd(s*17.1) < 0.5){
      var nc = [COL.neonA, COL.neonB, COL.neonC, COL.neonD][Math.floor(rnd(s*23.3)*4)];
      var nx = x + w*(0.12 + rnd(s*13.7)*0.6), ny = top + 40 + rnd(s*9.1)*120;
      var nh = 90 + rnd(s*4.4)*150;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(nx-2, ny-2, 22, nh+4);
      g.fillStyle = nc; g.globalAlpha = 0.85;
      g.fillRect(nx, ny, 18, nh);
      g.globalAlpha = 0.20; g.fillRect(nx-9, ny-9, 36, nh+18);   // 畫進去的光暈，不隨相機變
      g.globalAlpha = 1;
    }
    // 外掛管線／逃生梯
    if(rnd(s*29.9) < 0.45){
      g.strokeStyle = COL.midEdge; g.lineWidth = 5;
      var px = x + w*(0.2 + rnd(s*7.1)*0.6);
      g.beginPath(); g.moveTo(px, top); g.lineTo(px, base); g.stroke();
      for(var v=top+30; v<base; v+=46){
        g.beginPath(); g.moveTo(px-16, v); g.lineTo(px+16, v); g.stroke();
      }
    }
  }
  g.restore();
}

// 層 1：遠景天際線 + 一面巨幅廣告
// v4：整層烤成一張離屏圖，每幀只貼一次。視差 0.10 表示整關只需要約 3000 世界單位寬。
function farBody(g, x0, x1){
  var TILE = 520, base = GROUND_Y + 60;
  var i0 = Math.floor(x0/TILE) - 1, i1 = Math.ceil(x1/TILE) + 1;
  var grd = g.createLinearGradient(0, 120, 0, base);
  grd.addColorStop(0, COL.farTop); grd.addColorStop(1, COL.far);
  g.fillStyle = COL.far; g.fillRect(x0-400, base-2, (x1-x0)+900, 1600);
  for(var i=i0;i<i1;i++){
    for(var k=0;k<3;k++){
      var s2 = i*3+k+0.5;
      var bw = 120 + rnd(s2*2.2)*130;
      var bx = i*TILE + k*TILE/3 + rnd(s2*4.9)*30;
      var bh = 260 + rnd(s2*6.6)*520;
      drawBuilding(g, bx, bw, base-bh, base, s2, grd, true);
    }
    if(rnd(i*41.3) < 0.34){
      var ax = i*TILE + 120, ay = base - 620 - rnd(i*8.8)*160;
      var aw = 230, ah = 330;
      g.fillStyle = 'rgba(8,10,20,0.95)'; g.fillRect(ax-8, ay-8, aw+16, ah+16);
      var ag = g.createLinearGradient(ax, ay, ax, ay+ah);
      ag.addColorStop(0, 'rgba(255,61,127,0.50)');
      ag.addColorStop(0.55, 'rgba(122,91,255,0.38)');
      ag.addColorStop(1, 'rgba(61,240,255,0.30)');
      g.fillStyle = ag; g.fillRect(ax, ay, aw, ah);
      g.save(); g.beginPath(); g.rect(ax, ay, aw, ah); g.clip();
      g.fillStyle = 'rgba(0,0,0,0.42)';
      for(var b=0;b<6;b++) g.fillRect(ax+20, ay+40+b*52, aw-40*rnd(i+b), 22);
      g.fillStyle = 'rgba(255,255,255,0.20)';
      g.beginPath(); g.arc(ax+aw*0.5, ay+ah*0.34, 66, 0, Math.PI*2); g.fill();
      g.restore();
      g.globalAlpha = 0.12; g.fillStyle = COL.neonD;
      g.fillRect(ax-40, ay-40, aw+80, ah+80); g.globalAlpha = 1;
    }
  }
}

var _bake = {}, BAKE_MS = {};
// 把一整層烤進離屏畫布。世界 y 範圍固定 [Y0, Y1]，x 範圍由視差算出來。
var BAKE_Y0 = 80, BAKE_Y1 = 1400;   // 再往下都被地面層蓋住，烤下去只是白佔記憶體
function bakedLayer(key, i, body){
  var b = _bake[key];
  if(b && b.scale === scale) return b;
  var x0 = -700;
  var x1 = LEVEL_END * PARALLAX[i] + 2100 + 700;
  var cv = document.createElement('canvas');
  cv.width  = Math.ceil((x1 - x0) * scale);
  cv.height = Math.ceil((BAKE_Y1 - BAKE_Y0) * scale);
  var g2 = cv.getContext('2d');
  g2.setTransform(scale, 0, 0, scale, -x0*scale, -BAKE_Y0*scale);
  var tb = performance.now();
  body(g2, x0, x1);
  BAKE_MS[key] = +(performance.now() - tb).toFixed(1);
  b = { cv: cv, x0: x0, scale: scale, w: cv.width, h: cv.height };
  _bake[key] = b;
  return b;
}
function blitLayer(g, b, i){
  g.setTransform(1,0,0,1,0,0);
  var dx = (b.x0 - camX*PARALLAX[i]) * scale + shakeX*(i===2?1:0.4)*scale;
  var dy = (BAKE_Y0 - (camY-CAM_BASE_Y)*PARALLAX_Y[i]) * scale + shakeY*0.4*scale;
  g.drawImage(b.cv, Math.round(dx), Math.round(dy));
}
function farBodyWithHaze(g, x0, x1){
  farBody(g, x0, x1);
  // 霧是水平均勻的一條漸層 → 烤進遠景這張圖裡，每幀就少一次全螢幕半透明填色。
  var H = 520, base = GROUND_Y + 20;
  var q = g.createLinearGradient(0, base-H, 0, base+40);
  q.addColorStop(0.00, 'rgba('+COL.haze+',0)');
  q.addColorStop(0.50, 'rgba('+COL.haze+',0.10)');
  q.addColorStop(1.00, 'rgba('+COL.haze+',0.26)');
  g.fillStyle = q;
  g.fillRect(x0-400, base-H, (x1-x0)+900, H+80);
}
var USE_BAKE = true;   // 關掉＝改前的畫法（每幀重畫整層），只給效能對照用
function drawFar(g){
  if(USE_BAKE){ blitLayer(g, bakedLayer('far', 0, farBodyWithHaze), 0); return; }
  layerSet(g, 0);
  farBodyWithHaze(g, camX*PARALLAX[0] - 400, camX*PARALLAX[0] + viewW + 400);
}

// 大氣薄霧（分層感，不是天際線的一部分）
// （drawHaze 已移除：霧改成烤進遠景那張圖裡，見 farBodyWithHaze）

// 層 2：中景街屋（比較深，好讓亮色的角色跳出來）。同樣整層烤好。
function midBody(g, x0, x1){
  var TILE = 400, base = GROUND_Y + 110;
  var i0 = Math.floor(x0/TILE)-1, i1 = Math.ceil(x1/TILE)+1;
  var grd = g.createLinearGradient(0, 180, 0, base);
  grd.addColorStop(0, COL.midTop); grd.addColorStop(1, COL.mid);
  g.fillStyle = COL.mid; g.fillRect(x0-400, base-2, (x1-x0)+900, 1600);
  for(var i=i0;i<i1;i++){
    for(var k=0;k<2;k++){
      var s2 = i*2+k+7.5;
      var bw = 170 + rnd(s2*2.7)*150;
      var bx = i*TILE + k*TILE/2 + rnd(s2*3.3)*24;
      var bh = 360 + rnd(s2*5.5)*430;
      drawBuilding(g, bx, bw, base-bh, base, s2, grd, true);
    }
  }
}
function drawMid(g){
  if(USE_BAKE){ blitLayer(g, bakedLayer('mid', 1, midBody), 1); return; }
  layerSet(g, 1);
  midBody(g, camX*PARALLAX[1] - 400, camX*PARALLAX[1] + viewW + 400);
}

// 蒸氣（中景與遊戲層之間）：固定顏色的柔團，只是往上飄
function drawSteam(g){
  layerSet(g, 2);
  var t = perfNow()*0.001;
  for(var i=0;i<STEAM_N;i++){
    var sx = i*430 + rnd(i*3.7)*300;
    if(sx < camX-300 || sx > camX+viewW+300) continue;
    var ph = (t*0.20 + rnd(i*9.1)) % 1;
    var sy = groundTopAt(sx, 0);
    if(!isFinite(sy)) sy = GROUND_Y;
    var r = 30 + ph*150;
    g.globalAlpha = 0.16*(1-ph);
    g.fillStyle = '#8fb6d8';
    g.beginPath(); g.arc(sx, sy - 40 - ph*320, r, 0, Math.PI*2); g.fill();
  }
  g.globalAlpha = 1;
}

// 層 3：遊戲層（街面、招牌、電閘、角色、敵人、特效）
function drawStreet(g){
  layerSet(g, 2);
  for(var i=0;i<SOLIDS.length;i++){
    var s = SOLIDS[i];
    if(s.k === 'sign'){
      g.fillStyle = COL.propEdge; g.fillRect(s.x, s.y, s.w, s.h);
      g.fillStyle = COL.neonB; g.globalAlpha = 0.55;
      g.fillRect(s.x+4, s.y+4, s.w-8, s.h-8); g.globalAlpha = 1;
      continue;
    }
    // 地面之下一路填滿到畫面底（ART_PIPELINE 第 2 條）
    g.fillStyle = COL.street;
    g.fillRect(s.x, s.y, s.w, 4000);
    var tg = cachedGrad('stop'+i, function(){
      var q = ctx.createLinearGradient(0, s.y, 0, s.y+70);
      q.addColorStop(0, COL.streetTop); q.addColorStop(1, COL.street); return q;
    });
    g.fillStyle = tg; g.fillRect(s.x, s.y, s.w, 70);
    g.fillStyle = COL.curb; g.fillRect(s.x, s.y, s.w, 7);
    // 路面積水的反光（固定色塊，不隨相機或光源變）
    g.fillStyle = COL.wet;
    for(var q2=0;q2<Math.floor(s.w/160);q2++){
      var wx = s.x + 40 + q2*160 + rnd(i*7+q2)*60;
      g.fillRect(wx, s.y+16, 60 + rnd(q2*3.1)*70, 5);
    }
    // 街面邊緣的斷面（坑的兩側看得出厚度）
    g.fillStyle = COL.propEdge;
    g.fillRect(s.x, s.y, 6, 260); g.fillRect(s.x+s.w-6, s.y, 6, 260);
  }

  // 招牌柱
  for(var p=0;p<PROPS.length;p++){
    var pr = PROPS[p];
    if(pr.x < camX-400 || pr.x > camX+viewW+400) continue;
    g.fillStyle = COL.prop; g.fillRect(pr.x-6, pr.y-8, pr.w+12, pr.h+8);
    g.fillStyle = pr.col; g.globalAlpha = 0.9;
    g.fillRect(pr.x, pr.y, pr.w, pr.h);
    g.globalAlpha = 0.14; g.fillRect(pr.x-16, pr.y-16, pr.w+32, pr.h+32);
    g.globalAlpha = 1;
    g.fillStyle = '#04060c';
    g.font = 'bold 20px sans-serif'; g.textAlign = 'center';
    g.fillText(pr.txt, pr.x + pr.w/2, pr.y + 34);
    g.fillStyle = COL.prop; g.fillRect(pr.x+pr.w/2-4, pr.y+pr.h, 8, GROUND_Y-(pr.y+pr.h));
  }

  // 電閘
  if(breaker.x > camX-500 && breaker.x < camX+viewW+400){
    g.fillStyle = COL.prop; g.fillRect(breaker.x-6, breaker.y-6, breaker.w+12, breaker.h+12);
    g.fillStyle = breaker.broken ? '#2a2a2a' : COL.neonC;
    g.globalAlpha = breaker.broken ? 1 : 0.92;
    g.fillRect(breaker.x, breaker.y, breaker.w, breaker.h);
    if(!breaker.broken){
      g.globalAlpha = 0.18 + 0.10*Math.sin(perfNow()*0.006);
      g.fillRect(breaker.x-18, breaker.y-18, breaker.w+36, breaker.h+36);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#04060c'; g.font = 'bold 22px sans-serif'; g.textAlign='center';
    g.fillText('⚡', breaker.x+breaker.w/2, breaker.y+52);
    // 到招牌的吊索
    g.strokeStyle = COL.propEdge; g.lineWidth = 3;
    g.beginPath(); g.moveTo(breaker.x+breaker.w/2, breaker.y);
    g.lineTo(bigSign.x + 40, breaker.broken ? 470 : bigSign.y); g.stroke();
  }

  // 會掉下來的巨幅招牌
  if(bigSign.x > camX-600 && bigSign.x < camX+viewW+500){
    var bs = bigSign;
    g.save();
    if(!bs.fell){        // 兩條吊索：招牌不能看起來浮在空中（ART_PIPELINE 第 1 條的同一個病）
      g.strokeStyle = COL.propEdge; g.lineWidth = 5;
      g.beginPath();
      g.moveTo(bs.x+20, bs.y); g.lineTo(bs.x-40, bs.y-320);
      g.moveTo(bs.x+bs.w-20, bs.y); g.lineTo(bs.x+bs.w+40, bs.y-320);
      g.stroke();
      g.fillStyle = COL.prop; g.fillRect(bs.x-70, bs.y-360, 60, 40);
      g.fillRect(bs.x+bs.w+10, bs.y-360, 60, 40);
    }
    g.fillStyle = '#05070e'; g.fillRect(bs.x-8, bs.y-8, bs.w+16, bs.h+16);
    var bg2 = g.createLinearGradient(bs.x, bs.y, bs.x, bs.y+bs.h);
    bg2.addColorStop(0, bs.fell ? 'rgba(80,80,90,0.7)' : 'rgba(255,61,127,0.85)');
    bg2.addColorStop(1, bs.fell ? 'rgba(40,40,50,0.7)' : 'rgba(122,91,255,0.75)');
    g.fillStyle = bg2; g.fillRect(bs.x, bs.y, bs.w, bs.h);
    g.beginPath(); g.rect(bs.x, bs.y, bs.w, bs.h); g.clip();
    g.fillStyle = 'rgba(4,6,12,0.75)'; g.font='bold 74px sans-serif'; g.textAlign='center';
    g.fillText('夜 市', bs.x+bs.w/2, bs.y+86);
    g.restore();
    if(!bs.fell){ g.globalAlpha = 0.12; g.fillStyle = COL.neonA;
      g.fillRect(bs.x-30, bs.y-30, bs.w+60, bs.h+60); g.globalAlpha = 1; }
  }

  // 招牌斷電之後、掉下來之前：地面標出會被砸到的那一格
  if(bigSign.delay > 0){
    g.globalAlpha = 0.25 + 0.35*Math.abs(Math.sin(bigSign.delay*18));
    g.fillStyle = COL.neonC;
    g.fillRect(bigSign.x - 20, GROUND_Y - 10, bigSign.w + 40, 10);
    g.globalAlpha = 1;
  }
  // 終點標線
  g.fillStyle = COL.neonB; g.globalAlpha = 0.5;
  g.fillRect(4880, GROUND_Y-320, 8, 320); g.globalAlpha = 1;

  var _tA = PROF.on ? performance.now() : 0;
  for(var e=0;e<enemies.length;e++) drawEnemy(g, enemies[e]);
  for(var s3=0;s3<shots.length;s3++){
    var sh = shots[s3];
    g.fillStyle = COL.foeRim3;
    g.beginPath(); g.arc(sh.x, sh.y, 11, 0, Math.PI*2); g.fill();
    g.globalAlpha = 0.25; g.beginPath(); g.arc(sh.x, sh.y, 22, 0, Math.PI*2); g.fill();
    g.globalAlpha = 1;
  }
  drawPlayer(g);
  if(PROF.on){ PROF.acc['  └人物'] = (PROF.acc['  └人物']||0) + (performance.now()-_tA); _tA = performance.now(); }
  // 粒子
  for(var pa=0;pa<parts.length;pa++){
    var pt = parts[pa];
    g.globalAlpha = clamp(1 - pt.t/pt.life, 0, 1);
    g.fillStyle = pt.col;
    g.fillRect(pt.x, pt.y, pt.r, pt.r);
  }
  g.globalAlpha = 1;
  if(PROF.on){ PROF.acc['  └粒子'] = (PROF.acc['  └粒子']||0) + (performance.now()-_tA); }
  g.textAlign = 'center';
  for(var fl=0;fl<floaters.length;fl++){
    var f = floaters[fl];
    g.globalAlpha = clamp(1 - f.t, 0, 1);
    g.fillStyle = f.col; g.font = 'bold 34px sans-serif';
    g.fillText(f.txt, f.x, f.y);
  }
  g.globalAlpha = 1;
}

// 層 4：前景（雨、近處管線）。雨只是位移，不改任何東西的明暗。
function drawFore(g){
  layerSet(g, 3);
  var x0 = camX*PARALLAX[3];
  // 前景不放整根落地的柱子——那會把角色整個吃掉（判準④第一次量出 76% 遮蔽）。
  // 也不放矩形量體——那會被讀成「角色站在上面的平台」（桌機截圖上看到的）。
  // 改成看得出是街邊護欄／雜物的形狀：橫桿＋立柱，擋得到腿、擋不到頭，也不像地板。
  g.fillStyle = COL.prop;
  for(var i=0;i<26;i++){
    var px = i*620 + rnd(i*5.5)*260;
    if(px < x0-400 || px > x0+viewW+300) continue;
    var bw = 150 + rnd(i*2.7)*150;
    var top = GROUND_Y - 84;
    g.fillRect(px, top, bw, 16);                     // 上橫桿
    g.fillRect(px, top + 42, bw, 12);                // 下橫桿
    for(var c=0;c<=3;c++) g.fillRect(px + c*bw/3 - 5, top, 11, 130);   // 立柱
    if(rnd(i*11.3) < 0.45){                          // 一只垃圾桶／貨箱壓在欄前
      var cw = 56 + rnd(i*3.3)*40;
      g.fillRect(px + bw*0.25, GROUND_Y - 62, cw, 120);
    }
    g.fillRect(px - 20, GROUND_Y + 26, bw + 40, 500); // 路緣之下填滿，不露出街面
  }
  // 頭頂纜線（在角色頭上方，不進剪影範圍）
  g.strokeStyle = COL.prop; g.lineWidth = 9;
  for(var c2=0;c2<10;c2++){
    var cx0 = c2*1400 + rnd(c2*3.9)*500;
    if(cx0 < x0-1400 || cx0 > x0+viewW+300) continue;
    g.beginPath();
    g.moveTo(cx0, GROUND_Y - 640);
    g.quadraticCurveTo(cx0+600, GROUND_Y - 470, cx0+1200, GROUND_Y - 660);
    g.stroke();
  }
  // 雨
  var t = perfNow()*0.001;
  g.strokeStyle = 'rgba(150,200,240,0.28)'; g.lineWidth = 2;
  g.beginPath();
  for(var r=0;r<RAIN_N;r++){
    var rx = (rnd(r*1.7)*2600 + t*620) % 2600 + x0 - 300;
    var ry = (rnd(r*3.3)*1400 + t*1900) % 1400 - 200 + (camY-CAM_BASE_Y);
    g.moveTo(rx, ry); g.lineTo(rx-9, ry+42);
  }
  g.stroke();
}

// ---------------------------------------------------------------- 人物
var WALK = {
  thighF: [ 26, 14, -4, -18, -26, -14, 4, 18],
  bendF:  [  3, 18, 34,  16,   6,  32, 56, 24],
  bob:    [  0,  4,  1,  -4,   0,   4,  1, -4],
  lean:   [  7,  8,  7,   6,   7,   8,  7,  6]
};
function poseOf(a){
  var st = a.state;
  if(st === 'walk'){
    var f = Math.floor(a.walkPhase)%8, f2 = (f+4)%8;
    return { thighA:WALK.thighF[f], bendA:WALK.bendF[f], thighB:WALK.thighF[f2], bendB:WALK.bendF[f2],
             armA:-WALK.thighF[f]*1.1, armBendA:34, armB:-WALK.thighF[f2]*1.1, armBendB:34,
             bob:WALK.bob[f], lean:WALK.lean[f], headTilt:2 };
  }
  if(st === 'air'){
    return a.vy < 0
      ? { thighA:34,bendA:62,thighB:-14,bendB:28,armA:-58,armBendA:30,armB:-34,armBendB:34,bob:-2,lean:10,headTilt:3 }
      : { thighA:20,bendA:14,thighB:-24,bendB:34,armA:-70,armBendA:14,armB:-46,armBendB:20,bob:1,lean:4,headTilt:-2 };
  }
  if(st === 'land'){
    var k = clamp(a.landT/0.12, 0, 1);
    return { thighA:22*k+4,bendA:58*k+6,thighB:-18*k-3,bendB:52*k+6,armA:-30*k,armBendA:20,
             armB:-22*k,armBendB:22,bob:16*k,lean:12*k+2,headTilt:4*k };
  }
  if(st === 'atk'){
    // 揮出去 2~3 幀（前擺 → 打出去），打中那一幀靠 hitStop 停住
    var ph = clamp(a.atkT/0.28, 0, 1);
    var sw = ph < 0.22 ? -1 + ph/0.22 : (ph < 0.55 ? 1 : 1 - (ph-0.55)/0.45);
    return { thighA:16,bendA:20,thighB:-20,bendB:30,
             armA:-30 - sw*70, armBendA:20 + sw*30, armB:26, armBendB:40,
             bob:-2 - sw*3, lean:6 + sw*10, headTilt:2, swing:sw };
  }
  if(st === 'tele'){
    // 預告＝「我要砍下來了」：武器舉過頭頂（成為剪影最高點）、重心下沉、上身前傾、
    // 收後腿、空手收在胸前。**整個人不往後移**（v2 是靠位移賺重疊率分數，冷讀者說那看起來像撲跳）。
    var w = clamp(a.teleP || 0, 0, 1);
    return { thighA: 10 + 30*w, bendA: 24 + 44*w, thighB: -14 - 26*w, bendB: 30 + 46*w,
             armA: 120 + 54*w, armBendA: -6*w, armB: 24 + 14*w, armBendB: 60 + 26*w,
             bob: 4 + 28*w, lean: 3 + 28*w, headTilt: 2 + 12*w,
             swing: -0.42, bladeRot: -18 - 10*w, dx: 0 };
  }
  if(st === 'swing'){
    // 出手：武器從頭頂劈到身前，前腳跨出去，上身壓下來
    var v = clamp(a.swingP || 0, 0, 1);
    return { thighA: 30 + 26*v, bendA: 20 - 12*v, thighB: -22 - 10*v, bendB: 26 - 8*v,
             armA: 70 - 24*v, armBendA: 18 + 10*v, armB: -30, armBendB: 30,
             bob: 4 - 2*v, lean: 16 + 10*v, headTilt: 6 + 4*v,
             swing: 0.55 + 0.45*v, bladeRot: -10 + 130*v, dx: 4*v };
  }
  if(st === 'post'){
    // 收招：武器落在身前低處，人前傾拉不回來（玩家的反擊窗）
    return { thighA: 34, bendA: 22, thighB: -22, bendB: 30,
             armA: 56, armBendA: 44, armB: -18, armBendB: 26,
             bob: 8, lean: 18, headTilt: 10, swing: 1.05, bladeRot: 132, dx: 2 };
  }
  if(st === 'parry'){
    // 招架：低身、刀橫在身前
    return { thighA: 26, bendA: 44, thighB: -24, bendB: 40,
             armA: -84, armBendA: 76, armB: -46, armBendB: 50,
             bob: 8, lean: 14, headTilt: 6, swing: -0.2 };
  }
  if(st === 'recover'){
    // 揮空後搖：刀還在外面、人拉不回來
    return { thighA: 14, bendA: 22, thighB: -22, bendB: 30,
             armA: -96, armBendA: 8, armB: 30, armBendB: 36,
             bob: 2, lean: 16, headTilt: 6, swing: 1 };
  }
  if(st === 'hurt'){
    return { thighA:10,bendA:26,thighB:-18,bendB:20,armA:44,armBendA:24,armB:56,armBendB:20,
             bob:4,lean:-14,headTilt:-8 };
  }
  var b = Math.sin(a.animT*5);
  return { thighA:8,bendA:5,thighB:-9,bendB:9,armA:8+b*2,armBendA:16+b*3,
           armB:-9-b*2,armBendB:18-b*3,bob:b*1.6,lean:2+b*0.8,headTilt:b*1.2 };
}

var P = { hipY:-88, chestY:-142, neckY:-150, headR:17, headY:-163,
          thigh:46, shin:44, upper:33, fore:31,
          wTorso:13, wThigh:11, wShin:8, wUpper:8, wFore:6.5, wNeck:7 };

function limb(g,x,y,ang,len,w){
  var a = ang*Math.PI/180;
  var nx = x+Math.sin(a)*len, ny = y+Math.cos(a)*len;
  g.lineWidth = w; g.beginPath(); g.moveTo(x,y); g.lineTo(nx,ny); g.stroke();
  return [nx,ny];
}

// 一具人形。body = 主色（會動的東西是亮的），rim = 描邊色（固定畫進去的光）
function drawFigure(g, a, body, rim, scaleK){
  var pose = poseOf(a);
  g.save();
  g.translate(a.x, a.y);
  g.scale(a.face*(scaleK||1), (scaleK||1));
  g.translate(pose.dx || 0, pose.bob);
  g.lineCap = 'round'; g.lineJoin = 'round';

  var lean = pose.lean*Math.PI/180;
  var tl = P.hipY - P.neckY;
  var neckX = Math.sin(lean)*tl, neckY = P.hipY - Math.cos(lean)*tl;
  var chestT = (P.hipY-P.chestY)/tl;
  var chestX = lerp(0,neckX,chestT), chestY = lerp(P.hipY,neckY,chestT);

  // 先畫一圈描邊（固定色階的邊光，不隨相機變）
  for(var pass=0; pass<2; pass++){
    g.strokeStyle = pass===0 ? rim : body;
    g.fillStyle   = pass===0 ? rim : body;
    var k = pass===0 ? 5 : 0;
    var kB = limb(g,0,P.hipY,pose.thighB,P.thigh,P.wThigh+k);
    limb(g,kB[0],kB[1],pose.thighB-pose.bendB,P.shin,P.wShin+k);
    var eB = limb(g,chestX-5,chestY,pose.armB,P.upper,P.wUpper+k);
    limb(g,eB[0],eB[1],pose.armB+pose.armBendB,P.fore,P.wFore+k);
    g.lineWidth = P.wTorso+k;
    g.beginPath(); g.moveTo(0,P.hipY); g.lineTo(neckX,neckY); g.stroke();
    g.lineWidth = P.wUpper+3+k;
    g.beginPath(); g.moveTo(chestX-7,chestY); g.lineTo(chestX+7,chestY); g.stroke();
    var kA = limb(g,0,P.hipY,pose.thighA,P.thigh,P.wThigh+k);
    limb(g,kA[0],kA[1],pose.thighA-pose.bendA,P.shin,P.wShin+k);
    var eA = limb(g,chestX+5,chestY,pose.armA,P.upper,P.wUpper+k);
    var hand = limb(g,eA[0],eA[1],pose.armA+pose.armBendA,P.fore,P.wFore+k);
    var hl = P.neckY-P.headY, ha = lean + pose.headTilt*Math.PI/180;
    var headX = neckX+Math.sin(ha)*hl, headY = neckY-Math.cos(ha)*hl;
    g.lineWidth = P.wNeck+k;
    g.beginPath(); g.moveTo(neckX,neckY); g.lineTo(headX,headY); g.stroke();
    g.beginPath(); g.arc(headX,headY,P.headR+k*0.5,0,Math.PI*2); g.fill();
    if(pass===1){
      a._hand = hand; a._head = [headX, headY];
      var mh = g.getTransform();
      a._headTopPx = { x: mh.a*headX + mh.c*(headY-P.headR) + mh.e,
                       y: mh.b*headX + mh.d*(headY-P.headR) + mh.f };
    }
  }
  // 義體的刀（單獨一件，程式轉角度）。顏色跟著這個人，不是所有人都拿青色的刀。
  if(a._hand && a.blade !== false){
    var sw = pose.swing || 0;
    var bl = a.blade || COL.heroRim, blLen = a.bladeLen || 86;
    // 冷讀第一輪抓到的：出手幀的刀是往「後下」掃的（-40-sw*95 在 sw=1 時 = -135°），
    // 所以三個人都被讀成「手往後甩、準備起跑」。刀的角度改成明寫。
    var rot = (pose.bladeRot !== undefined) ? pose.bladeRot
            : ((pose.swing === undefined && a.bladeRestRot != null) ? a.bladeRestRot : (-40 - sw*95));
    g.strokeStyle = bl; g.lineWidth = 7;
    g.save(); g.translate(a._hand[0], a._hand[1]);
    g.rotate(rot * Math.PI/180);
    g.beginPath(); g.moveTo(0,0); g.lineTo(0, -blLen); g.stroke();
    var mt = g.getTransform();
    a._tipPx = { x: mt.c*(-blLen) + mt.e, y: mt.d*(-blLen) + mt.f };
    g.strokeStyle = a.blade ? bl : '#ffffff'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0,-8); g.lineTo(0,-blLen*0.93); g.stroke();
    g.restore();
  }
  // 一顆發光的義眼
  if(a._head){
    g.fillStyle = a.eye || COL.heroRim;
    g.beginPath(); g.arc(a._head[0]+P.headR*0.45, a._head[1]-P.headR*0.1, P.headR*0.28, 0, Math.PI*2); g.fill();
  }
  g.restore();
}

function drawPlayer(g){
  var p = player;
  // 攻擊弧（打出去那兩幀的拖影）
  if(p.state==='atk'){
    var MVd = FEEL.moves[p.move || 'quick'];
    var ph = clamp(p.atkT/MVd.dur,0,1);
    if(ph > 0.10 && ph < 0.70){
      var fade = 0.6*(1-(ph-0.10)/0.60);
      g.save(); g.translate(p.x, p.y-105); g.scale(p.face,1);
      g.globalAlpha = fade;
      if(p.move === 'dash'){          // 突進斬：一道往前的長條拖影
        g.fillStyle = COL.neonC;
        g.fillRect(-40, -26, MVd.reach + 90, 16);
        g.fillRect(-40, 6, MVd.reach + 60, 9);
      } else if(p.move === 'heavy'){  // 重擊：又粗又大的弧
        g.strokeStyle = COL.neonA; g.lineWidth = 18;
        g.beginPath(); g.arc(26, 0, MVd.reach, -1.25, 0.95); g.stroke();
      } else {                        // 快斬：短而細的弧
        g.strokeStyle = COL.heroRim; g.lineWidth = 8;
        g.beginPath(); g.arc(26, 0, MVd.reach*0.92, -0.75, 0.45); g.stroke();
      }
      g.restore(); g.globalAlpha = 1;
    }
  }
  if(p.parryT > 0){                    // 招架的有效幀：身前一道白弧
    g.save(); g.translate(p.x, p.y-105); g.scale(p.face,1);
    g.globalAlpha = 0.85; g.strokeStyle = COL.white; g.lineWidth = 9;
    g.beginPath(); g.arc(20, 0, 76, -1.0, 1.0); g.stroke();
    g.restore(); g.globalAlpha = 1;
  }
  if(p.parryFlash > 0){                // 成功之後的爆閃
    g.save(); g.globalAlpha = clamp(p.parryFlash/0.45, 0, 1)*0.6;
    g.fillStyle = COL.white;
    g.beginPath(); g.arc(p.x, p.y-105, 150*(1.3-p.parryFlash), 0, Math.PI*2); g.fill();
    g.restore(); g.globalAlpha = 1;
  }
  drawFigure(g, p, p.hurtT>0 ? COL.neonA : COL.hero, COL.heroInk, 1);
}

function drawEnemy(g, e){
  if(e.dead && e.hurtT < -0.5) return;
  var body, rim, k = 1;
  if(e.t==='rush'){ body = COL.foeA; rim = COL.foeRim; }
  else if(e.t==='guard'){ body = COL.foeB; rim = COL.foeRim2; }
  else if(e.t==='throw'){ body = COL.foeC; rim = COL.foeRim3; }
  else { body = COL.boss; rim = COL.bossRim; k = 1.25; }
  if(e.hurtT > 0) body = '#ffffff';
  var st = e.dead ? 'hurt'
         : (e.tele > 0 ? 'tele'
         : ((e.swing > 0 || e.strikeT > 0) ? 'swing'
         : (e.post > 0 ? 'post'
         : (e.stun > 0 ? 'hurt'
         : (Math.abs(e.vx) > 30 ? 'walk' : 'idle')))));
  var teleP = e.tele > 0 ? clamp(1 - e.tele/(FEEL.teleTime+0.1), 0, 1) : 0;
  var swingP = e.swing > 0 ? clamp(1 - e.swing/0.18, 0, 1) : (e.strikeT > 0 ? 1 : 0);
  var proxy = { x:e.x, y:e.y, face:e.face, state:st, vy:e.vy, animT:e.animT,
                walkPhase:(e.animT*7)%8, landT:0, atkT:-1, atkIdx:0, teleP: teleP, swingP: swingP,
                blade: e.t==='throw' ? false : rim,
                bladeRestRot: 152,   // 沒在出手時武器朝下（冷讀：頭目待機被讀成「伸手去摸招牌」）
                bladeLen: e.t==='guard' ? 54 : (e.t==='boss' ? 108 : 70),
                eye: rim };
  g.save();
  if(e.dead){ g.globalAlpha = clamp(1+e.hurtT/0.6, 0, 1); }
  drawFigure(g, proxy, rim, body, k);
  e._tipPx = proxy._tipPx; e._headTopPx = proxy._headTopPx;
  g.restore();
  // 預告：腳邊一道白線標出這一招打得到哪裡（純白只給提示）
  if(e.tele > 0 && !e.dead){
    var rg = e.teleKind === 'dash' ? 300 : (e.teleKind === 'throw' ? 0 : (e.reach||135));
    if(rg > 0){
      g.globalAlpha = 0.35 + 0.35*(1 - e.tele/(FEEL.teleTime+0.1));
      g.fillStyle = COL.white;
      g.fillRect(e.x + (e.face>0?20:-20-rg), e.y - 6, rg, 5);
      g.globalAlpha = 1;
    }
  }
  // 格擋的架式
  if(e.blockT > 0 && !e.dead){
    g.strokeStyle = COL.foeRim2; g.lineWidth = 6; g.globalAlpha = 0.8;
    g.beginPath(); g.arc(e.x + e.face*36, e.y-100, 54, -1.2, 1.2); g.stroke();
    g.globalAlpha = 1;
  }
  // 血條
  if(!e.dead && e.hp < e.maxHp){
    var w = 70*k;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(e.x-w/2, e.y-210*k, w, 7);
    g.fillStyle = rim; g.fillRect(e.x-w/2, e.y-210*k, w*clamp(e.hp/e.maxHp,0,1), 7);
  }
}

// ---------------------------------------------------------------- UI
function drawUI(g){
  g.setTransform(scale,0,0,scale,0,0);
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(40, 40, 380, 26);
  g.fillStyle = COL.heroRim; g.fillRect(40, 40, 380*clamp(player.hp/100,0,1), 26);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.strokeRect(40,40,380,26);
  g.fillStyle = '#9fd8ee'; g.font = '24px sans-serif'; g.textAlign = 'left';
  // 進度只進不退：冷讀者看到 33→30→…，以為「被打會扣進度」——
  // 那只是被擊退往回走。進度條倒退本來就不該發生。
  maxProgress = Math.max(maxProgress, clamp(player.x/LEVEL_END, 0, 1));
  g.fillText('進度 ' + Math.round(maxProgress*100) + '%   ' + gameT.toFixed(1) + 's', 40, 100);
  if(activeGate){
    // 進場說明還在的時候往下讓位（不然兩段字疊在一起）
    g.fillStyle = COL.neonA; g.font = 'bold 26px sans-serif'; g.textAlign='center';
    g.fillText('清掉敵人才能前進', viewW/2, hintT > 0 ? 250 : 70);
  }
  if(player.dead){
    g.fillStyle = 'rgba(30,0,10,0.62)'; g.fillRect(0,0,viewW,viewH);
    g.fillStyle = COL.neonA; g.font = 'bold 76px sans-serif'; g.textAlign='center';
    g.fillText('下線', viewW/2, viewH/2 - 10);
    g.fillStyle = '#e7c9d4'; g.font = '30px sans-serif';
    g.fillText('點一下重來（鍵盤 R）', viewW/2, viewH/2 + 54);
  }
  if(finished){
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0,0,viewW,viewH);
    g.fillStyle = COL.heroRim; g.font = 'bold 76px sans-serif'; g.textAlign='center';
    g.fillText('通過', viewW/2, viewH/2 - 10);
    g.fillStyle = '#cfe9f5'; g.font = '32px sans-serif';
    g.fillText(finishT.toFixed(1) + ' 秒', viewW/2, viewH/2 + 54);
  }
}

// ---------------------------------------------------------------- render
var lastDrawMs = 0;
// 分項計時：先量再改（製作人回報手機卡，而我的 p95 是 headless 桌機量的）
var PROF = { on:false, acc:{}, n:0 };
function profSection(name, fn){
  if(!PROF.on){ fn(); return; }
  var t = performance.now();
  fn();
  PROF.acc[name] = (PROF.acc[name] || 0) + (performance.now() - t);
}
function render(opt){
  opt = opt || {};
  var t0 = performance.now();
  var g = ctx;
  g.setTransform(1,0,0,1,0,0);
  profSection('sky', function(){
    if(opt.sky !== false) g.drawImage(staticSky(), 0, 0);
    else { g.fillStyle = '#000'; g.fillRect(0,0,canvas.width,canvas.height); }
  });
  profSection('far',    function(){ g.save(); if(opt.far    !== false) drawFar(g);      g.restore(); });
  profSection('mid',    function(){ g.save(); if(opt.mid    !== false) drawMid(g);      g.restore(); });
  profSection('steam',  function(){ g.save(); if(opt.steam  !== false) drawSteam(g);    g.restore(); });
  profSection('street', function(){ g.save(); if(opt.street !== false) drawStreet(g, opt); g.restore(); });
  profSection('fore',   function(){ g.save(); if(opt.fore   !== false) drawFore(g);     g.restore(); });
  profSection('ui',     function(){ g.save(); if(opt.ui     !== false) drawUI(g);       g.restore(); });
  profSection('ctrl',   function(){ g.save(); if(opt.ui     !== false) drawControls(g);  g.restore(); });
  g.setTransform(1,0,0,1,0,0);
  if(PROF.on) PROF.n++;
  lastDrawMs = performance.now() - t0;
}
// drawStreet 需要能單獨關掉玩家（判準④）
var _drawStreetRaw = drawStreet;
drawStreet = function(g, opt){
  opt = opt || {};
  var pd = drawPlayer;
  if(opt.player === false) drawPlayer = function(){};
  _drawStreetRaw(g);
  drawPlayer = pd;
};

// ---------------------------------------------------------------- 主迴圈
var lastT = 0, frameLog = null;
function loop(ts){
  requestAnimationFrame(loop);
  if(lastT){
    var dt = Math.min((ts-lastT)/1000, 1/30);
    if(started && !paused && !finished) step(dt);
    else if(started && finished) stepFx(dt);
  }
  if(frameLog && lastT) frameLog.push({ dt: ts-lastT, draw: lastDrawMs });
  if(lastT && started) qualityWatch(ts-lastT);
  lastT = ts;
  render({});
}

resize();
resetGame();
render({});
requestAnimationFrame(loop);

// 開始：全螢幕 + 鎖橫向（失敗都不報錯）
var startEl = document.getElementById('start');
function beginGame(){
  if(started) return;
  started = true;
  startEl.className = 'gone';
  audioOn();
  try {
    var el = document.documentElement;
    var rf = el.requestFullscreen || el.webkitRequestFullscreen;
    if(rf){ var pr = rf.call(el); if(pr && pr.then) pr.then(function(){ lockLandscape(); }, function(){ lockLandscape(); }); else lockLandscape(); }
    else lockLandscape();
  } catch(e){ lockLandscape(); }
  setTimeout(resize, 120);
}
function lockLandscape(){
  try {
    if(screen.orientation && screen.orientation.lock){
      var p = screen.orientation.lock('landscape');
      if(p && p.catch) p.catch(function(){});
    }
  } catch(e){}
  setTimeout(resize, 120);
}
startEl.addEventListener('click', beginGame);
canvas.addEventListener('pointerdown', function(){ if(player && player.dead) resetGame(Math.floor(Math.random()*1e9)); });
startEl.addEventListener('touchstart', function(e){ e.preventDefault(); beginGame(); }, {passive:false});

// ================================================================ 判準探針
function lumOf(r,g,b){
  function f(c){ c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
}
function ratio(a,b){ var hi=Math.max(a,b), lo=Math.min(a,b); return (hi+0.05)/(lo+0.05); }
function pct(arr, p){ var a = arr.slice().sort(function(x,y){return x-y;}); return a[Math.min(a.length-1, Math.floor(a.length*p))]; }

window.__probe = {
  begin: beginGame,
  reset: resetGame,
  state: function(){ return { x:player.x, hp:player.hp, t:gameT, finished:finished,
                              enemies:enemies.filter(function(e){return !e.dead;}).length,
                              gate: activeGate ? activeGate.x : null }; },

  // 判準③-b：事件表（順序固定、地形有限）
  level: function(){
    return { events: LEVEL.map(function(e){ return { id:e.id, kind:e.kind, x:e.x, note:e.note }; }),
             solids: SOLIDS.length, terrainFinite: true,
             levelEnd: LEVEL_END, rightWall: SOLIDS[SOLIDS.length-1].x };
  },

  // 壓力測試用：灌一批火花，讓分項計時量得到粒子的成本
  burst: function(n){ sparks(player.x, player.y-110, n||120, COL.spark, 3.14); return parts.length; },

  bakeInfo: function(){
    var o = { ms: BAKE_MS, canvases: {} };
    for(var k in _bake) o.canvases[k] = _bake[k].w + 'x' + _bake[k].h +
      ' (' + (_bake[k].w*_bake[k].h*4/1048576).toFixed(1) + ' MB)';
    return o;
  },
  setBake: function(v){ USE_BAKE = !!v; return USE_BAKE; },
  setEdge: function(px){ MAX_EDGE = px; resize(); return canvas.width+'x'+canvas.height; },
  ui: function(){
    var L = uiLayout(), bs = uiButtons(), out = [];
    for(var i=0;i<bs.length;i++){
      var b = bs[i];
      var topPad = b.sub ? 22 : 0;     // 鈕上方的說明字也要在安全區內
      out.push({ key:b.key, label:b.label, sub:b.sub||'', x:+b.x.toFixed(1), y:+b.y.toFixed(1), r:+b.r.toFixed(1),
                 tapSize: +(Math.max(b.r,22)*2).toFixed(1),
                 insideSafe: (b.x - b.r >= L.sa.l) && (b.x + b.r <= L.W - L.sa.r) &&
                             (b.y - b.r - topPad >= L.sa.t) && (b.y + b.r <= L.H - L.sa.b) });
    }
    var overlaps = [];
    for(var i2=0;i2<out.length;i2++) for(var j=i2+1;j<out.length;j++){
      var A = bs[i2], B2 = bs[j];
      var d = Math.hypot(A.x-B2.x, A.y-B2.y);
      if(d < A.r + B2.r - 1) overlaps.push(A.key + '×' + B2.key + ' (' + d.toFixed(0) + '<' + (A.r+B2.r).toFixed(0) + ')');
    }
    return { screen: L.W + 'x' + L.H, safe: L.sa, buttons: out, overlaps: overlaps,
             hintVisible: hintT > 0, hintFontPx: +Math.max(12, Math.min(16, L.W*0.019)).toFixed(1),
             idleAlpha: uiIdle > 6 ? 0.32 : 0.78 };
  },
  setSafe: function(t,r,b2,l){          // 模擬瀏海／圓角（playwright 沒辦法真的給 env()）
    var st = document.documentElement.style;
    st.setProperty('--sa-t', (t||0)+'px'); st.setProperty('--sa-r', (r||0)+'px');
    st.setProperty('--sa-b', (b2||0)+'px'); st.setProperty('--sa-l', (l||0)+'px');
    return safeInsets();
  },
  setHint: function(v){ hintT = v; return hintT; },
  setIdle: function(v){ uiIdle = v; return uiIdle; },

  quality: function(l){ if(l != null){ setQuality(l); _qHold = 1e9; } return { level: qLevel, edge: MAX_EDGE, rain: RAIN_N, canvas: canvas.width+'x'+canvas.height }; },

  // 分項計時：跑 N 幀，回報每一層平均每幀幾毫秒
  profile: function(frames){
    frames = frames || 120;
    return new Promise(function(res){
      PROF.on = true; PROF.acc = {}; PROF.n = 0;
      var iv = setInterval(function(){
        if(PROF.n >= frames){
          clearInterval(iv);
          var out = {}, total = 0;
          for(var k in PROF.acc){ out[k] = +(PROF.acc[k]/PROF.n).toFixed(2); total += PROF.acc[k]/PROF.n; }
          out.__total = +total.toFixed(2);
          out.__frames = PROF.n;
          out.__canvas = canvas.width + 'x' + canvas.height;
          out.__parts = parts.length;
          PROF.on = false;
          res(out);
        }
      }, 50);
    });
  },

  // 判準①
  perf: function(frames){
    frames = frames || 200;
    return new Promise(function(res){
      frameLog = [];
      var iv = setInterval(function(){
        if(frameLog.length >= frames){
          clearInterval(iv);
          var dts = frameLog.map(function(f){return f.dt;});
          var dws = frameLog.map(function(f){return f.draw;});
          frameLog = null;
          res({ n:dts.length,
                median:+pct(dts,0.5).toFixed(2), p95:+pct(dts,0.95).toFixed(2), p99:+pct(dts,0.99).toFixed(2),
                max:+Math.max.apply(null,dts).toFixed(2),
                drawMedian:+pct(dws,0.5).toFixed(2), drawP95:+pct(dws,0.95).toFixed(2) });
        }
      }, 60);
    });
  },

  // 判準②：打擊回饋。用固定步長真的打一下，量停頓幀、震幅序列、擊退距離。
  feel: function(){
    var dt = 1/60, out = {};
    // 打一下，回傳：命中前後每幀的 hitStop 與震幅、敵人被擊退的距離
    function oneHit(opt){
      opt = opt || {};
      resetGame(); started = true;
      player.x = 1500; player.y = groundTopAt(1500,0); player.face = 1;
      var e = spawnEnemy('rush', 1578); e.hp = e.maxHp = 5000; e.spd = 0;
      var combo = opt.combo || 1;
      var heavyHold = !!opt.heavy;
      var freqs = [];
      for(var c=1;c<=combo;c++){
        e.x = 1578; e.vx = 0; e.kb = 0;          // 每一下都把敵人放回定位
        lastAudio.freqs = [];
        // 等到可以出手
        for(var w=0; w<40 && (player.atkT >= 0 || player.recoverT > 0); w++) step(dt);
        if(heavyHold){                            // 重擊＝長按（v5 之後不是連擊第三下）
          for(var h=0; h<20; h++){ input.attack = true; step(dt); }
          input.attack = false;
        } else { input.attack = true; step(dt); input.attack = false; }
        freqs.push(lastAudio.freqs[0]);
        var hitsBefore = probeLog.hits.length;
        var stops = 0, shakes = [], x0 = null, landed = false;
        for(var i=0;i<40;i++){
          if(!landed && probeLog.hits.length > hitsBefore){
            landed = true; x0 = e.x;
            shakes.push(+Math.abs(shakeX).toFixed(2));
          }
          if(landed && hitStop > 0) stops++;
          step(dt);
          if(landed) shakes.push(+Math.abs(shakeX).toFixed(2));
          if(landed && hitStop === 0 && shakes.length > 9) break;
        }
        if(c === combo){
          var far = null;
          if(landed){ var xs = e.x; for(var k=0;k<30;k++) step(dt); far = Math.abs(e.x - x0); }
          out._last = { stops: stops, shakes: shakes, knock: far };
        }
        for(var g2=0;g2<8;g2++) step(dt);        // 留在連擊時間內
      }
      out._freqs = freqs;
      return out._last;
    }

    var light = oneHit({combo:1});
    out.hitStopLight = { design: FEEL.hitStopLight, measured: light.stops };
    out.shake = { design: FEEL.shakeLight, peak: Math.max.apply(null, light.shakes),
                  seq: light.shakes.slice(0,9),
                  framesToUnder1: light.shakes.findIndex(function(v){ return v < 1; }) };
    out.knockback = { design:'90~260', measured: +light.knock.toFixed(1) };

    var heavy = oneHit({combo:1, heavy:true});
    out.hitStopHeavy = { design: FEEL.hitStopHeavy, measured: heavy.stops };
    out.heavyMove = player.move;
    out.heavyShakePeak = Math.max.apply(null, heavy.shakes);
    // v5 之後沒有「連擊第三下」這回事，三招是三個獨立動作。
    // 所以這條從「連擊 1/2/3 音高遞增」改成「三招的出手音互不相同」——
    // 改的理由寫在 RESULT.md，不是偷偷換。
    var mf = {};
    ['quick','dash','heavy'].forEach(function(k){
      resetGame(); started = true;
      player.x = 1500; player.y = groundTopAt(1500,0); player.face = 1;
      lastAudio.freqs = [];
      if(k === 'heavy'){
        for(var h2=0;h2<24;h2++){
          input.attack = true;
          if(player.move !== 'heavy') lastAudio.freqs = [];   // 長按會先發出快斬的音，從重擊那一刻才開始收
          step(dt);
          if(player.move === 'heavy') break;
        }
        input.attack = false;
      } else {
        input.attackDash = (k === 'dash'); input.attack = true; step(dt);
        input.attack = false; input.attackDash = false;
      }
      mf[k] = lastAudio.freqs[0] || null;
    });
    out.moveAudio = { freqs: mf,
      distinct: (mf.quick !== mf.dash && mf.dash !== mf.heavy && mf.quick !== mf.heavy) };

    // 撞招牌
    resetGame(); started = true;
    var prop = PROPS[1];
    player.x = prop.x - 175; player.y = groundTopAt(player.x,0); player.face = 1;
    var e4 = spawnEnemy('rush', prop.x - 95); e4.hp = e4.maxHp = 5000; e4.spd = 0;
    e4.cd = 9999; e4.cdLen = 9999;   // 別讓他在量測中途自己衝出去——他會穿過玩家跑到另一邊，
                                     // 於是「往招牌方向打」變成往反方向打（量到 happened:false 的原因）
    for(var fz2=0;fz2<LEVEL.length;fz2++) fired[LEVEL[fz2].id] = true;   // 別讓事件在量測中途丟敵人進來
    activeGate = null;
    var before4 = parts.length, slamParts = 0, slamStop = 0;
    for(var hh=0; hh<20; hh++){ input.attack = true; step(dt); }   // 長按＝重擊（推得最遠的那一招）
    input.attack = false;
    for(var m=0;m<60;m++){
      step(dt);
      if(probeLog.slam){ slamParts = parts.length - before4; slamStop = hitStop + 1; break; }
    }
    out.slam = { happened: !!probeLog.slam, particles: slamParts, hitStop: slamStop,
                 design:'≥12 粒、停 5 幀',
                 dbg: { ex: Math.round(e4.x), ey: Math.round(e4.y), prop: prop.x, move: player.move,
                        px: Math.round(player.x), hits: probeLog.hits.length } };

    // 判準⑨：揮空後搖（命中沒有、揮空有）
    resetGame(); started = true;
    player.x = 1500; player.y = groundTopAt(1500,0); player.face = 1;   // 面前沒有東西
    input.attack = true; step(dt); input.attack = false;
    var f = 0;
    for(var r2=0;r2<80;r2++){ step(dt); f++;
      if(player.atkT < 0 && player.recoverT <= 0) break; }
    out.whiffRecover = { design: FEEL.whiffRecover, measuredSeconds: +(f/60).toFixed(2) };

    // 判準⑧：招架成功的回饋
    resetGame(); started = true;
    // 在一段乾淨的平地上量，而且先把所有關卡事件標成已發生（不然量到一半會有別的敵人跑進來，
    // 而且站在坑邊量的話被彈飛的人會掉進坑裡——量到的是「掉下去」不是「彈多遠」）。
    for(var fz=0;fz<LEVEL.length;fz++) fired[LEVEL[fz].id] = true;
    activeGate = null;
    player.x = 3800; player.y = groundTopAt(3800,0); player.face = 1;
    var e6 = spawnEnemy('guard', 3940); e6.hp = e6.maxHp = 5000;
    var pb = parts.length, ok6 = false, stops6 = 0, x6 = 0, knock6 = 0, slow6 = 0, sp6 = 0;
    for(var w6=0; w6<400; w6++){
      // 一看到預告就按招架（跟會讀的機器人同一條規則）
      input.parry = (e6.tele > 0 && e6.tele < 0.20);   // 跟會讀的機器人同一條規則：預告的最後一刻
      step(dt);
      if(probeLog.parries > 0){
        ok6 = true; sp6 = parts.length - pb; slow6 = +slowT.toFixed(2);
        stops6 = hitStop + 1; x6 = e6.x;
        // 招架成功會觸發 0.5 秒子彈時間，40 幀量不到全程位移（量到 192、判準⑧當場掉下來，
        // 而彈飛速度根本沒變）。量到停下來為止。
        // 量的是「被彈飛的最遠距離」，不是 N 幀之後的位置——
        // 那個人被彈開之後會自己走回來，量終點會把彈飛距離量成 75。
        for(var k6=0;k6<140;k6++){
          step(dt);
          knock6 = Math.max(knock6, Math.abs(e6.x - x6));
          if(k6>20 && !e6.kb) break;
        }
        break;
      }
    }
    input.parry = false;
    out.parry = { happened: ok6, hitStop: stops6, particles: sp6,
                  slowScale: FEEL.parrySlow, slowLeft: slow6,
                  knockback: +knock6.toFixed(1),
                  design: '停 9 幀、放慢 0.35×、≥28 粒、彈飛 ≥250' };
    delete out._last; delete out._freqs;
    resetGame();
    return out;
  },

  // 判準③：機器人跑完全關（固定步長，不靠畫面）
  // 判準③⑥⑦：機器人跑關。mode='dumb' 是 v1 那一隻（往右走／靠近就打），
  // mode='smart' 多三條規則：看到預告就招架、對方架式就等空門、自己揮空就退開。
  bot: function(maxSeconds, opt){
    opt = opt || {};
    var mode = opt.mode || 'dumb', keep = opt.keep, seed = opt.seed || 1;
    maxSeconds = maxSeconds || 180;
    resetGame(seed); started = true;
    var dt = 1/60, log = [], seen = {};
    var jumpCd = 0, atkCd = 0, parryCd = 0, holdFrames = 0;
    var n = Math.round(maxSeconds/dt);
    for(var i=0;i<n;i++){
      input.left = input.right = input.jump = input.attack = input.parry = false;
      input.attackDash = false;
      if(holdFrames > 0){ holdFrames--; input.attack = true; }
      var p = player;
      var tgt = null, best = 1e9;
      for(var j=0;j<enemies.length;j++){
        var e = enemies[j];
        if(e.dead) continue;
        var d = Math.abs(e.x - p.x);
        if(d < best){ best = d; tgt = e; }
      }
      var fighting = !!(activeGate && tgt);
      if(fighting){
        var dir = tgt.x > p.x ? 1 : -1;
        var guarding = (tgt.t==='guard' || tgt.t==='boss') && tgt.blockT > 0;
        var telegraphing = tgt.tele > 0 || tgt.strikeT > 0;
        var incoming = null;
        for(var s2=0;s2<shots.length;s2++){
          var sh = shots[s2];
          if(Math.abs(sh.x - p.x) < 220 && (sh.vx > 0) === (sh.x < p.x)) incoming = sh;
        }
        if(mode === 'tactical'){
          // 會選招的機器人。它跟「只會招架」那隻最大的差別不是招式多，
          // 是**它會為了下一招先不出手**（打斷要等著出手才打得出來）。
          var atkNow = function(kind){
            p.face = dir;
            if(kind === 'heavy'){ holdFrames = 22; }
            input.attack = true; input.attackDash = (kind === 'dash');
            atkCd = kind === 'quick' ? 0.26 : 0.40;
          };
          var approach = function(){ if(dir>0) input.right = true; else input.left = true; };
          var backOff  = function(){ if(dir>0) input.left = true; else input.right = true; };
          var hold = function(want){                    // 維持一個距離
            if(best > want + 25) approach(); else if(best < want - 25) backOff();
          };
          var ready = (p.sinceAtk == null || p.sinceAtk >= 0.26);
          var incoming2 = incoming && Math.abs(incoming.x - p.x) < 130;
          var imminent = (tgt.tele > 0 && tgt.tele < 0.18 && tgt.teleKind !== 'dash' && best < 340)
                      || ((tgt.strikeT > 0 || (tgt.swing > 0 && tgt.teleKind === 'dash')) && best < 210)
                      || incoming2;
          var nearProp = false;
          for(var pp=0; pp<PROPS.length; pp++){
            var d2 = (PROPS[pp].x + PROPS[pp].w/2) - tgt.x;
            if(Math.abs(d2) < 240 && (d2 > 0) === (dir > 0)) nearProp = true;
          }

          if(incoming2 && atkCd <= 0 && Math.abs(incoming.y - (p.y-100)) < 120){
            p.face = (incoming.x > p.x) ? 1 : -1;        // ⓪ 飛來的東西：打掉它，丟的人會僵住
            input.attack = true; atkCd = 0.26;
          }
          else if(tgt.stun > 0){                         // ① 他倒在那裡 → 全力輸出
            if(best > 100) approach(); else if(atkCd <= 0) atkNow('quick');
          }
          else if(tgt.t === 'rush'){
            // ② 直衝的：不要跟他對揮。站在他起手範圍邊上，等他抬手，上前打斷。
            var charging = (tgt.tele > 0 || tgt.strikeT > 0);
            // 突進斬有 5 幀起手＋一段位移：太早出會在他抬手之前就結束，
            // 所以等預告過了一半（tele < 0.30）再出手，讓刀剛好落在他衝出來的那一刻。
            if(charging && best <= 240 && !tgt.kb && atkCd <= 0 &&
               (tgt.strikeT > 0 || tgt.tele < 0.30)){
              atkNow('dash');                            // 他抬手／衝過來 → 突進斬迎上去
            } else if(charging && best > 240){
              approach();
            } else if((charging || imminent) && parryCd <= 0){
              input.parry = true; parryCd = 0.26; p.face = dir;   // 出不了招就招架（安全網）
            } else if(charging){ p.face = dir; }
            else if(best > 100 || tgt.kb) approach();     // 沒在起手就照常輸出
            else if(atkCd <= 0) atkNow('quick');
          }
          else if((tgt.t === 'guard' || tgt.t === 'boss') && tgt.blockT > 0){
            if(imminent && parryCd <= 0){ input.parry = true; parryCd = 0.26; p.face = dir; }
            else if(best > 185) approach();
            else if(atkCd <= 0) atkNow('dash');           // ③ 舉盾 → 突進斬破盾（貼著也能出）
            else p.face = dir;
          }
          // ④ 投擲的：量出來「突進追上去」比「走過去砍」還慢（第二波多花 25% 時間），
          // 所以這一種沒有專屬招式，就走預設：靠近、快斬，順手用重擊把他推去撞招牌。
          else if(imminent && parryCd <= 0){ input.parry = true; parryCd = 0.26; p.face = dir; }
          else if(p.recoverT > 0) backOff();
          else if(tgt.tele > 0 && best < 200) p.face = dir;
          else {
            if(best > 100 || tgt.kb) approach();
            else if(atkCd <= 0) atkNow(nearProp && ready ? 'heavy' : 'quick');
          }
        }
        else if(mode === 'smart'){
          // ① 看到預告（或飛來的東西）就招架
          // 讀的是「預告快打出來了」那一刻，不是「他開始預告了」——這就是要學的那件事
          // 三種招式的「該按的那一刻」不一樣：揮砍看預告尾、衝刺看它衝到面前、飛來物看距離
          var danger = (tgt.tele > 0 && tgt.tele < 0.20 && tgt.teleKind !== 'dash' && best < 340)
                    || ((tgt.strikeT > 0 || (tgt.swing > 0 && tgt.teleKind === 'dash')) && best < 210)
                    || (incoming && Math.abs(incoming.x - p.x) < 130);
          if(danger && parryCd <= 0){ input.parry = true; parryCd = 0.26; p.face = dir; }
          else if(tgt.stun > 0){                   // 招架成功之後是免費輸出時間
            if(best > 110){ if(dir>0) input.right = true; else input.left = true; }
            else if(atkCd <= 0){ p.face = dir; input.attack = true; input.attackDash = false; atkCd = 0.30; }
          }
          else if(tgt.tele > 0 && best < 200){     // 他在預告：不要換打，等招架
            p.face = dir;
          }
          else if(guarding){                       // ② 對方舉盾：跳過去打背後（它舉盾時不會轉身）
            var behind = (tgt.face === 1 && p.x < tgt.x) || (tgt.face === -1 && p.x > tgt.x);
            if(behind){
              if(best > 110){ if(dir>0) input.right = true; else input.left = true; }
              else if(atkCd <= 0){ p.face = dir; input.attack = true; atkCd = 0.30; }
            } else {
              if(best > 150){ if(dir>0) input.right = true; else input.left = true; }
              else if(jumpCd <= 0 && p.onGround){ input.jump = true; jumpCd = 0.30;
                if(dir>0) input.right = true; else input.left = true; }
              else { if(dir>0) input.right = true; else input.left = true; }
            }
          } else if(p.recoverT > 0){               // ③ 剛揮空：退開，不硬接
            if(dir > 0) input.left = true; else input.right = true;
          } else {
            // 被打飛中的人追上去打是揮空（v1 的 bot 一局揮空 38 次，全在這裡）
            if(best > 110 || tgt.kb){ if(dir>0) input.right = true; else input.left = true; }
            if(best <= 130 && !tgt.kb && atkCd <= 0){ p.face = dir; input.attack = true; atkCd = 0.30; }
          }
        } else {
          if(best > 96){ if(dir>0) input.right = true; else input.left = true; }
          else { p.face = dir; if(atkCd <= 0){ input.attack = true; atkCd = 0.30; } }
          if(best <= 140 && atkCd <= 0){ p.face = dir; input.attack = true; atkCd = 0.30; }
        }
        if(guarding && best < 230 && jumpCd <= 0 && p.onGround && mode !== 'smart'){
          input.jump = true; jumpCd = 0.30;
        }
      } else {
        input.right = true;
        if(!breaker.broken && Math.abs(p.x - breaker.x) < 110 && atkCd <= 0){
          p.face = 1; input.attack = true; atkCd = 0.30; input.right = false;
        }
        var ahead = groundTopAt(p.x + 70, p.y - 30);
        if(p.onGround && jumpCd <= 0){
          if(!isFinite(ahead) || ahead > p.y + 60 || ahead < p.y - 34){ input.jump = true; jumpCd = 0.26; }
        }
        if(!p.onGround && p.jumps === 1 && p.vy > 0 && jumpCd <= 0){
          var ah2 = groundTopAt(p.x + 60, p.y - 30);
          if(isFinite(ah2) && ah2 < p.y - 30){ input.jump = true; jumpCd = 0.2; }
        }
      }
      if(jumpCd > 0) jumpCd -= dt;
      if(atkCd > 0) atkCd -= dt;
      if(parryCd > 0) parryCd -= dt;
      if(!input.jump) player._jumpHeld = false;

      step(dt);
      for(var L=0;L<LEVEL.length;L++){
        if(fired[LEVEL[L].id] && !seen[LEVEL[L].id]){
          seen[LEVEL[L].id] = true;
          log.push({ id:LEVEL[L].id, t:+gameT.toFixed(1), x:Math.round(player.x) });
        }
      }
      if(finished || player.dead) break;
    }
    var bossAt = null;
    for(var q=0;q<log.length;q++) if(log[q].id === 'boss') bossAt = log[q].t;
    var res = { mode:mode, seed:seed, finished: finished, died: player.dead,
                seconds:+gameT.toFixed(1), reachedX: Math.round(player.x),
                hits: probeLog.hits.length, parries: probeLog.parries, whiffCtx: probeLog.whiffCtx,
                moves: probeLog.moves, cuts: probeLog.cuts, breaks: probeLog.breaks,
                deflects: probeLog.deflects||0,
                dbg: { gb: probeLog.dbgGuardBranch||0, dt: probeLog.dbgDashTry||0, dh: probeLog.dbgDashHit||0 },
                whiffs: probeLog.whiffs, gotHit: probeLog.hurt,
                slams: probeLog.slam||0, crushedBySign: probeLog.crushed||0,
                hp: Math.round(player.hp), events: log,
                bossShare: (bossAt && finished) ? +((gameT-bossAt)/gameT).toFixed(2) : null,
                alive: enemies.filter(function(e){return !e.dead;}).map(function(e){
                  return { t:e.t, x:Math.round(e.x), hp:Math.round(e.hp) }; }) };
    if(!keep) resetGame();
    return res;
  },

  // 判準⑥⑦：兩隻機器人各跑 n 局（每局不同種子）
  bots: function(n){
    n = n || 10;
    function runs(mode){
      var out = [];
      for(var i=0;i<n;i++) out.push(window.__probe.bot(200, { mode:mode, seed: 7919*(i+1) + 13 }));
      var fin = out.filter(function(r){ return r.finished; });
      function avg(f){ var a = out.map(f); return +(a.reduce(function(x,y){return x+y;},0)/a.length).toFixed(1); }
      return { mode:mode, n:n, clearRate: +(fin.length/n).toFixed(2),
               avgSeconds: avg(function(r){return r.seconds;}),
               avgGotHit:  avg(function(r){return r.gotHit;}),
               avgParries: avg(function(r){return r.parries;}),
               avgWhiffs:  avg(function(r){return r.whiffs;}),
               clearedSeconds: fin.map(function(r){return r.seconds;}),
               avgClearSeconds: fin.length ? +(fin.reduce(function(a,r){return a+r.seconds;},0)/fin.length).toFixed(1) : null,
               avgClearHits: fin.length ? +(fin.reduce(function(a,r){return a+r.gotHit;},0)/fin.length).toFixed(1) : null,
               moves: out.reduce(function(a,r){ for(var k in r.moves) a[k]=(a[k]||0)+r.moves[k]; return a; }, {}),
               cuts: out.reduce(function(a,r){ return a + r.cuts; }, 0),
               deflects: out.reduce(function(a,r){ return a + (r.deflects||0); }, 0),
               breaks: out.reduce(function(a,r){ return a + r.breaks; }, 0),
               bossShares: fin.map(function(r){return r.bossShare;}),
               deaths: out.filter(function(r){return r.died;}).length };
    }
    var dumb = runs('dumb'), smart = runs('smart'), tact = runs('tactical');
    return { dumb:dumb, smart:smart, tactical:tact,
             gap: +(smart.clearRate - dumb.clearRate).toFixed(2),
             timeRatio: +(tact.avgSeconds / smart.avgSeconds).toFixed(2),
             hitRatio:  +(tact.avgGotHit  / smart.avgGotHit ).toFixed(2) };
  },

  // 判準⑩/⑪：四個階段的剪影（待機／預告／出手／收招）互比，
  // 外加「武器尖端高於頭頂」與「質心水平位移」——後兩條是 v3 新增的，
  // 因為 v2 的重疊率分數有一半是靠整個人位移賺來的，形狀其實沒怎麼變。
  phases: function(){
    resetGame(); started = false;
    _frozenNow = 1000; shakeX = 0; shakeY = 0;
    var out = {};
    ['rush','guard','boss'].forEach(function(kind){
      enemies = [];
      var e = spawnEnemy(kind, 1400);
      player.x = -9999; camX = clamp(1400 - viewW*0.5, -300, LEVEL_END - viewW + 200); camY = CAM_BASE_Y;
      e.y = groundTopAt(1400, 0); e.vx = 0; e.face = 1;
      var bx = Math.round((1400 - camX - 170)*scale), by = Math.round((e.y - 330)*scale);
      var bw = Math.round(360*scale), bh = Math.round(345*scale);
      function shot(setup){
        e.tele = 0; e.swing = 0; e.post = 0; e.strikeT = 0; e.blockT = 0;
        setup();
        render({ sky:false, far:false, haze:false, mid:false, steam:false, fore:false, ui:false, player:false });
        var d = ctx.getImageData(bx, by, bw, bh).data;
        var lit = [], sx = 0, n = 0, top = 1e9;
        for(var i=0;i<d.length;i+=4){
          var on = d[i]+d[i+1]+d[i+2] > 40;
          lit.push(on);
          if(on){ var px = (i/4) % bw, py = Math.floor((i/4)/bw); sx += px; n++; if(py < top) top = py; }
        }
        return { lit:lit, cx: n ? sx/n : 0, n:n, top: top,
                 tip: e._tipPx ? {x:e._tipPx.x, y:e._tipPx.y} : null,
                 head: e._headTopPx ? {x:e._headTopPx.x, y:e._headTopPx.y} : null };
      }
      var idle = shot(function(){});
      var tele = shot(function(){ e.tele = 0.10; e.teleKind = 'swing'; });
      var sw   = shot(function(){ e.swing = 0.04; e.teleKind = 'swing'; });
      var post = shot(function(){ e.post = 0.13; });
      function diff(a2,b2){                 // 兩張剪影的像素差比例
        var d2 = 0, tot = a2.lit.length;
        for(var i=0;i<tot;i++) if(a2.lit[i] !== b2.lit[i]) d2++;
        return +(d2/tot).toFixed(4);
      }
      function overlap(a2,b2){              // 待機的剪影還剩多少被蓋住
        var both = 0, onlyA = 0;
        for(var i=0;i<a2.lit.length;i++){
          if(a2.lit[i] && b2.lit[i]) both++;
          else if(a2.lit[i]) onlyA++;
        }
        return +(both/Math.max(both+onlyA,1)).toFixed(3);
      }
      out[kind] = {
        overlapTele: overlap(idle, tele),
        tipAboveHeadPx: tele.tip && tele.head ? +(tele.head.y - tele.tip.y).toFixed(1) : null,
        // px 會跟著內部解析度變（限制解析度之後同一個姿勢的 px 數字會變小），
        // 所以同時回報跟解析度無關的設計單位。
        tipAboveHeadUnits: tele.tip && tele.head ? +((tele.head.y - tele.tip.y)/scale).toFixed(1) : null,
        centroidShiftPx: +Math.abs(tele.cx - idle.cx).toFixed(1),
        teleSeconds: +(FEEL.teleTime).toFixed(2),
        diffs: { idle_tele: diff(idle,tele), idle_swing: diff(idle,sw),
                 tele_swing: diff(tele,sw), swing_post: diff(sw,post),
                 idle_post: diff(idle,post) }
      };
    });
    _frozenNow = null; resetGame();
    return out;
  },

  // 截圖用：把一隻敵人擺在某個階段（給冷讀者看的圖）
  poseShot: function(kind, phase){
    resetGame(); started = false;
    _frozenNow = 1000; shakeX = 0; shakeY = 0;
    enemies = []; shots = [];
    var e = spawnEnemy(kind, 1400);
    player.x = -9999;
    camX = clamp(1400 - viewW*0.5, -300, LEVEL_END - viewW + 200); camY = CAM_BASE_Y;
    e.y = groundTopAt(1400, 0); e.vx = 0; e.face = 1;
    e.tele = 0; e.swing = 0; e.post = 0; e.strikeT = 0; e.blockT = 0;
    if(phase === 'tele'){ e.tele = 0.10; e.teleKind = 'swing'; }
    if(phase === 'swing'){ e.swing = 0.04; e.teleKind = 'swing'; }
    if(phase === 'post'){ e.post = 0.13; }
    render({ ui:false });
    var sx = (1400 - camX)*scale, sy = (e.y)*scale;
    return { cx: Math.round(sx), cy: Math.round(sy), scale: scale };
  },

  // 判準④：角色在各種背景前的對比與遮蔽（沿用 silho 的量法與門檻）
  contrast: function(samples){
    samples = samples || 20;
    resetGame(); started = false;
    var res = [];
    for(var s=0;s<samples;s++){
      var cx = 120 + s*(LEVEL_END-240)/(samples-1);
      var gy = groundTopAt(cx, 0);
      if(!isFinite(gy)) gy = GROUND_Y;
      player.x = cx; player.y = gy; player.state='idle'; player.animT = 0.4;
      camX = clamp(cx - viewW*0.38, -300, LEVEL_END - viewW + 200); camY = gy;
      shakeX = 0; shakeY = 0;
      _frozenNow = 1000;
      var sx = (player.x - camX)*scale;
      var sy = (player.y - (camY-CAM_BASE_Y))*scale;
      var bx = Math.max(0, Math.round(sx - 70*scale));
      var by = Math.max(0, Math.round(sy - 200*scale));
      var bw = Math.min(canvas.width-bx, Math.round(140*scale));
      var bh = Math.min(canvas.height-by, Math.round(215*scale));
      if(bw<=0||bh<=0) continue;
      render({player:false, fore:false, ui:false}); var bg  = ctx.getImageData(bx,by,bw,bh).data;
      render({player:true,  fore:false, ui:false}); var pf  = ctx.getImageData(bx,by,bw,bh).data;
      render({player:false, ui:false});             var bgF = ctx.getImageData(bx,by,bw,bh).data;
      render({player:true,  ui:false});             var pv  = ctx.getImageData(bx,by,bw,bh).data;
      var ratios = [], full=0, vis=0, hFull=0, hVis=0;
      var headTop = Math.round((200-186)*scale), headBot = Math.round((200-126)*scale);
      for(var p2=0;p2<bg.length;p2+=4){
        var row = Math.floor((p2/4)/bw);
        var dif = Math.abs(pf[p2]-bg[p2])+Math.abs(pf[p2+1]-bg[p2+1])+Math.abs(pf[p2+2]-bg[p2+2]);
        if(dif < 40) continue;
        full++;
        var isHead = (row>=headTop && row<=headBot);
        if(isHead) hFull++;
        var dv = Math.abs(pv[p2]-bgF[p2])+Math.abs(pv[p2+1]-bgF[p2+1])+Math.abs(pv[p2+2]-bgF[p2+2]);
        if(dv >= 30){ vis++; if(isHead) hVis++; }
        ratios.push(ratio(lumOf(pf[p2],pf[p2+1],pf[p2+2]), lumOf(bg[p2],bg[p2+1],bg[p2+2])));
      }
      if(!ratios.length) continue;
      ratios.sort(function(a,b){return a-b;});
      res.push({ x:Math.round(cx), px:full,
                 median:+ratios[Math.floor(ratios.length/2)].toFixed(2),
                 p10:+ratios[Math.floor(ratios.length*0.1)].toFixed(2),
                 occluded:+(1-vis/full).toFixed(3),
                 headOccluded:+(1-hVis/Math.max(hFull,1)).toFixed(3) });
    }
    _frozenNow = null;
    var meds = res.map(function(r){return r.median;});
    var occs = res.map(function(r){return r.occluded;});
    var heads = res.map(function(r){return r.headOccluded;});
    var heavy = occs.filter(function(v){return v>0.25;}).length;
    resetGame();
    return { samples:res, worstMedian:Math.min.apply(null,meds),
             medianOfMedians: meds.slice().sort(function(a,b){return a-b;})[Math.floor(meds.length/2)],
             maxOcclusion:Math.max.apply(null,occs),
             maxHeadOcclusion:Math.max.apply(null,heads),
             heavyOcclusionShare:+(heavy/res.length).toFixed(3) };
  },

  // 判準⑤：遊戲層在兩個不同相機位置畫同一塊世界座標，像素必須完全相同
  // （＝沒有任何隨相機變化的明暗。背景層因視差不同無法這樣比，見 RESULT.md 的說明。）
  staticLight: function(){
    resetGame(); started = false;
    _frozenNow = 1000; shakeX = 0; shakeY = 0;
    var worldX = 1700, worldW = 300;
    function grab(cam){
      camX = cam; camY = CAM_BASE_Y; player.x = -9999;
      render({ sky:false, far:false, haze:false, mid:false, steam:false, fore:false, ui:false, player:false });
      var px = Math.round((worldX - cam)*scale), py = Math.round((GROUND_Y-260)*scale);
      if(px < 0 || px + Math.round(worldW*scale) > canvas.width) px = 0;
      return ctx.getImageData(px, py, Math.round(worldW*scale), Math.round(300*scale)).data;
    }
    // 相機位移必須剛好是整數個螢幕像素，否則量到的是次像素抖動、不是光在變
    var delta = 200/scale;   // 剛好 200 個螢幕像素（camX 是浮點數，可以整除）
    var a = grab(1400), b = grab(1400 - delta);
    var diff = 0;
    for(var i=0;i<a.length;i++) if(a[i] !== b[i]) diff++;
    _frozenNow = null; resetGame();
    return { bytesCompared: a.length, bytesDiffer: diff, identical: diff === 0 };
  },

  // 截圖用：把玩家送到某個事件點，跑幾秒讓場面活起來
  goto: function(x, seconds){
    started = true;
    // 截圖是「把鏡頭搬過去」，不是玩到那裡：先把之前的事件標成已發生、解開戰鬥門，
    // 再把「此刻這一段」的敵人放上場。（第一次截圖時所有畫面都被前一道門夾在原地。）
    enemies = []; shots = []; activeGate = null;
    for(var i=0;i<LEVEL.length;i++){
      var ev = LEVEL[i];
      if(ev.x <= x + 40){
        fired[ev.id] = true;
        if(ev.spawn && ev.gate && ev.gate > x - 40){
          for(var j=0;j<ev.spawn.length;j++) spawnEnemy(ev.spawn[j].t, ev.spawn[j].x);
          activeGate = { x:ev.gate, id:ev.id };
        }
      }
    }
    player.x = x; player.y = groundTopAt(x,0) - 2; player.vy = 0;
    camX = clamp(x - viewW*0.38, -300, LEVEL_END - viewW + 200); camY = player.y;
    var n = Math.round((seconds||0)*60);
    for(var i=0;i<n;i++){ input.right = false; step(1/60); }
    render({});
    return { x:player.x, enemies:enemies.length };
  },
  // 除錯用：在指定距離上打一下，回報有沒有打中
  hitTest: function(dists){
    var out = {};
    (dists||[20,40,54,80,110,140,170]).forEach(function(d){
      resetGame(); started = true;
      player.x = 1500; player.y = groundTopAt(1500,0); player.face = 1;
      var e = spawnEnemy('rush', 1500 + d); e.hp = e.maxHp = 9000; e.spd = 0; e.cdLen = 99;
      var before = probeLog.hits.length;
      input.attack = true; step(1/60); input.attack = false;
      for(var i=0;i<12;i++) step(1/60);
      out[d] = { hit: probeLog.hits.length > before, gap: Math.round(e.x - player.x) };
    });
    resetGame();
    return out;
  },

  // 截圖用：讓機器人從頭玩到第 N 秒，然後把畫面凍在那一刻（同一個種子每次都一樣）
  snapshotAt: function(seconds, mode, seed){
    var r = window.__probe.bot(seconds, { mode: mode || 'tactical', seed: seed || 20260918, keep: true });
    input.left = input.right = input.attack = input.parry = input.jump = false;
    paused = true;
    render({});
    return { t: r.seconds, x: r.reachedX, move: player.move, hp: r.hp,
             enemies: r.alive.length, cuts: r.cuts, breaks: r.breaks, parries: r.parries };
  },

  // 截圖用：擺出「招架成功的那一瞬間」
  parryShot: function(){
    resetGame(); started = true;
    player.x = 4300; player.y = groundTopAt(4300,0); player.face = 1;
    var e = spawnEnemy('boss', 4430); e.hp = e.maxHp = 400;
    for(var i=0;i<600;i++){
      input.parry = (e.tele > 0 && e.tele < 0.20);
      step(1/60);
      if(probeLog.parries > 0){ for(var k=0;k<2;k++) step(1/60); break; }
    }
    input.parry = false;
    render({});
    return { parried: probeLog.parries };
  },

  simulate: function(seconds, ctrl){
    started = true;
    var n = Math.round(seconds*60);
    for(var i=0;i<n;i++){
      input.left = !!(ctrl&&ctrl.left); input.right = !!(ctrl&&ctrl.right);
      input.attack = !!(ctrl&&ctrl.attack); input.jump = !!(ctrl&&ctrl.jump);
      step(1/60);
    }
    input.left=input.right=input.attack=input.jump=false;
    render({});
    return { x:Math.round(player.x), t:+gameT.toFixed(1) };
  }
};
