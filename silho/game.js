/* silho — 剪影廢墟城市．會動的一張畫面
 * 規格見 ~/agents/forge/design/ART_PIPELINE.md
 * 設計基準 1920x1080，角色站立高 180（畫面高 1/6），全部用程式畫。
 */
'use strict';

// ---------------------------------------------------------------- 常數
var DESIGN_H = 1080;
var CHAR_H   = 180;           // 角色站立高 = 畫面高 1/6
var HORIZON  = 800;           // 地平線（世界 y）
var GROUND_Y = 880;           // 地面基準線（角色腳底）
var FPS_ANIM = 12;            // 動作幀率（規格：基準 12fps）

// 四層視差係數（判準①：遞增，層間至少差 0.10，第 3 層必須 = 1.00）
var PARALLAX = [0.12, 0.38, 1.00, 1.55];
// 垂直視差係數是**另外一組**。用同一組的話，跳個兩下大樓就在腳下了——
// 遠處的東西在垂直方向本來就幾乎不該動（判準①-c）。
var PARALLAX_Y = [0.02, 0.10, 1.00, 1.15];

var SUN = { fx: 0.62, y: HORIZON - 250, r: 52 };   // 太陽在天空上的固定一點（不再拿它算任何物件的明暗）

// 兩套配色，共用同一份幾何。預設暗版（製作人比較喜歡的那版），亮版是傍晚。
// 深度只靠「各層固定的明度差」，沒有任何會隨相機或太陽方位變化的明暗。
var PALETTES = {
  dark: {
    name: '暗版',
    skyTop:'#0d0616', skyMid1:'#2e0f26', skyMid2:'#7a2a24', skyLow:'#b3562d', skyHorz:'#d68a48',
    sun:'#f3cf94', haloA:'rgba(243,207,148,0.55)', haloB:'rgba(232,150,82,0.30)',
    haloC:'rgba(190,80,50,0.16)', haloD:'rgba(150,54,44,0)',
    cloud:'#5c2a3c',
    far:'#b58a75', farTop:'#cba894',            // 層1：最淺、最偏天空色
    haze:'216,158,104',
    mid:'#71506a', midTop:'#8a6681', midHole:'#4a3246', midSee:'#9a7263',            // 層2：中灰紫。暗版是把天空與地面壓暗，
                                                //      中景不能跟著壓——一壓就吃掉黑剪影（判準②）
    ground:'#1b1019', topFace:'#2e1d28', rim:'#7d4d31',
    crack:'#140d14', fore:'#1a1119',
    black:'#000000', white:'#fff6e2'
  },
  dusk: {
    name: '亮版',
    skyTop:'#241031', skyMid1:'#6d2440', skyMid2:'#b8432c', skyLow:'#e07434', skyHorz:'#f6b45c',
    sun:'#ffe6ad', haloA:'rgba(255,236,176,0.95)', haloB:'rgba(255,205,120,0.72)',
    haloC:'rgba(255,160,80,0.42)', haloD:'rgba(216,92,54,0)',
    cloud:'#7b3a4a',
    far:'#efbb92', farTop:'#fadcbb',
    haze:'252,200,130',
    mid:'#7a5a70', midTop:'#93708a', midHole:'#53374e', midSee:'#b08670',
    ground:'#2a1a26', topFace:'#3d2530', rim:'#c07a45',
    crack:'#170e16', fore:'#140c14',
    black:'#000000', white:'#fff6e2'
  }
};
var palKey = 'dark';
var COL = PALETTES[palKey];
function setPalette(k){
  if(!PALETTES[k]) return;
  palKey = k; COL = PALETTES[k];
  _gcache = {}; _skyCv = null;               // 配色換了，快取的漸層與天空都要重生
}
function togglePalette(){ setPalette(palKey === 'dark' ? 'dusk' : 'dark'); }

// ---------------------------------------------------------------- 工具
function rnd(seed){ // 確定性亂數（同一個 x 永遠長同一棟樓）
  var t = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return t - Math.floor(t);
}
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }

// 地面本身的高低：台地、走得上去的坡、塌陷下去的坑。
// 看的與踩的用同一條函式（ART_PIPELINE：不照圖描邊）。
// [模組內的 x, 高度]，中間線性內插。
var TERRAIN = [
  [   0, 880], [ 300, 880],
  [ 470, 770], [ 900, 770],   // 坡道走上去的台地
  [1050, 880],
  [1250, 990], [1450, 880],   // 塌陷下去的坑
  [2400, 880]
];
function terrainY(rel){
  for(var i=1;i<TERRAIN.length;i++){
    if(rel <= TERRAIN[i][0]){
      var a = TERRAIN[i-1], b = TERRAIN[i];
      return lerp(a[1], b[1], (rel - a[0]) / (b[0] - a[0]));
    }
  }
  return TERRAIN[TERRAIN.length-1][1];
}
function groundTop(x){
  var rel = x - Math.floor(x / MODULE_W) * MODULE_W;
  return terrainY(rel) - 7*Math.sin(x*0.0041) - 5*Math.sin(x*0.0113 + 1.3);
}

// ---------------------------------------------------------------- 狀態
var canvas = document.getElementById('c');
var ctx = canvas.getContext('2d', { alpha: false });
var viewW = 1920, viewH = 1080, scale = 1;   // viewW/H 為世界單位的可視範圍

var player = {
  x: 0, y: GROUND_Y, vx: 0, vy: 0,
  face: 1, onGround: true, state: 'idle',
  animT: 0, walkPhase: 0, landT: 0
};
var camX = 0;
var input = { left:false, right:false, jump:false };

// ---------------------------------------------------------------- 尺寸
function resize(){
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  scale = canvas.height / DESIGN_H;
  viewH = DESIGN_H;
  viewW = canvas.width / scale;
}
window.addEventListener('resize', function(){ resize(); _gcache = {}; _skyCv = null; });

// ---------------------------------------------------------------- 輸入
window.addEventListener('keydown', function(e){
  var k = e.key.toLowerCase();
  if(k==='a'||k==='arrowleft')  input.left = true;
  if(k==='d'||k==='arrowright') input.right = true;
  if(k===' '||k==='w'||k==='arrowup'){ input.jump = true; e.preventDefault(); }
  if(k==='p') togglePalette();
});
window.addEventListener('keyup', function(e){
  var k = e.key.toLowerCase();
  if(k==='a'||k==='arrowleft')  input.left = false;
  if(k==='d'||k==='arrowright') input.right = false;
  if(k===' '||k==='w'||k==='arrowup') input.jump = false;
});

// 手機：左右半邊走，上滑跳
var touches = {};
function tStart(e){
  for(var i=0;i<e.changedTouches.length;i++){
    var t = e.changedTouches[i];
    touches[t.identifier] = { x0:t.clientX, y0:t.clientY, side: t.clientX < window.innerWidth/2 ? -1 : 1 };
    if(touches[t.identifier].side < 0) input.left = true; else input.right = true;
  }
  e.preventDefault();
}
function tMove(e){
  for(var i=0;i<e.changedTouches.length;i++){
    var t = e.changedTouches[i], r = touches[t.identifier];
    if(!r) continue;
    if(r.y0 - t.clientY > 40 && !r.jumped){ r.jumped = true; input.jump = true;
      setTimeout(function(){ input.jump = false; }, 80); }
  }
  e.preventDefault();
}
function tEnd(e){
  for(var i=0;i<e.changedTouches.length;i++){
    var t = e.changedTouches[i], r = touches[t.identifier];
    if(!r) continue;
    delete touches[t.identifier];
  }
  input.left = false; input.right = false;
  for(var k in touches){ if(touches[k].side<0) input.left = true; else input.right = true; }
  e.preventDefault();
}
canvas.addEventListener('touchstart', tStart, {passive:false});
canvas.addEventListener('touchmove',  tMove,  {passive:false});
canvas.addEventListener('touchend',   tEnd,   {passive:false});
canvas.addEventListener('touchcancel',tEnd,   {passive:false});

// ---------------------------------------------------------------- 骨架動畫
// 角度：0 = 朝正下方，正值 = 往角色面向的前方擺。
// walk 8 個關鍵姿勢（規格：走路循環 8 張就夠），12fps 按幀跳，不做幀間插值——
// 那個「跳」正是 12fps 的手感。
var WALK = {
  thighF: [ 26,  14,  -4, -18, -26, -14,   4,  18],
  bendF:  [  3,  18,  34,  16,   6,  32,  56,  24],
  bob:    [  0,   4,   1,  -4,   0,   4,   1,  -4],
  lean:   [  7,   8,   7,   6,   7,   8,   7,   6]
};
function walkPose(f){
  var f2 = (f + 4) % 8;
  return {
    thighA: WALK.thighF[f],  bendA: WALK.bendF[f],
    thighB: WALK.thighF[f2], bendB: WALK.bendF[f2],
    armA:  -WALK.thighF[f]  * 1.15, armBendA: 34,
    armB:  -WALK.thighF[f2] * 1.15, armBendB: 34,
    bob: WALK.bob[f], lean: WALK.lean[f], headTilt: 2
  };
}
function idlePose(f){           // 微呼吸：胸口起伏 + 手臂極小幅
  var b = Math.sin(f / 12 * Math.PI * 2);
  return {
    thighA: 8, bendA: 5, thighB: -9, bendB: 9,
    armA: 8 + b*2, armBendA: 16 + b*3,
    armB: -9 - b*2, armBendB: 18 - b*3,
    bob: b * 1.6, lean: 2 + b*0.8, headTilt: b*1.2
  };
}
function airPose(vy){
  var up = vy < 0;
  return up
    ? { thighA: 34, bendA: 62, thighB: -14, bendB: 28, armA: -58, armBendA: 30, armB: -34, armBendB: 34, bob: -2, lean: 10, headTilt: 3 }
    : { thighA: 20, bendA: 14, thighB: -24, bendB: 34, armA: -70, armBendA: 14, armB: -46, armBendB: 20, bob: 1, lean: 4, headTilt: -2 };
}
function landPose(t){           // 落地蹲 3 幀（回饋來自停頓）
  var k = 1 - t;
  return { thighA: 22*k+4, bendA: 58*k+6, thighB: -18*k-3, bendB: 52*k+6,
           armA: -30*k, armBendA: 20, armB: -22*k, armBendB: 22,
           bob: 16*k, lean: 12*k+2, headTilt: 4*k };
}

// 依 CHAR_H=180 的比例（腳底為原點，往上為負）
var P = {
  footY:   0,
  hipY:   -88,
  chestY: -142,
  neckY:  -150,
  headR:   17,
  headY:  -163,
  thigh:   46,
  shin:    44,
  upper:   33,
  fore:    31,
  wTorso:  12, wThigh: 10, wShin: 7.5, wUpper: 7.5, wFore: 6, wNeck: 7
};

function limb(g, x, y, angDeg, len, w){
  var a = (angDeg) * Math.PI/180;
  var nx = x + Math.sin(a)*len, ny = y + Math.cos(a)*len;
  g.lineWidth = w;
  g.beginPath(); g.moveTo(x,y); g.lineTo(nx,ny); g.stroke();
  return [nx, ny];
}

function drawPlayer(g){
  var pose;
  if(player.state === 'walk')      pose = walkPose(player.walkPhase);
  else if(player.state === 'air')  pose = airPose(player.vy);
  else if(player.state === 'land') pose = landPose(clamp(player.landT/(3/FPS_ANIM),0,1));
  else                             pose = idlePose(Math.floor(player.animT*FPS_ANIM));

  g.save();
  g.translate(player.x, player.y);
  g.scale(player.face, 1);
  g.translate(0, pose.bob);

  g.strokeStyle = COL.black; g.fillStyle = COL.black;
  g.lineCap = 'round'; g.lineJoin = 'round';

  var lean = pose.lean * Math.PI/180;
  var hipX = 0, hipY = P.hipY;
  // 軀幹（依 lean 傾斜）
  var tl = P.hipY - P.neckY;
  var neckX = hipX + Math.sin(lean)*tl, neckY = hipY - Math.cos(lean)*tl;
  var chestT = (P.hipY - P.chestY)/tl;
  var chestX = lerp(hipX, neckX, chestT), chestY2 = lerp(hipY, neckY, chestT);

  // 後腿（先畫，稍細一點做出前後）
  g.lineWidth = P.wThigh;
  var kB = limb(g, hipX, hipY, pose.thighB, P.thigh, P.wThigh);
  limb(g, kB[0], kB[1], pose.thighB - pose.bendB, P.shin, P.wShin);
  // 後手臂
  var eB = limb(g, chestX - 5, chestY2, pose.armB, P.upper, P.wUpper);
  limb(g, eB[0], eB[1], pose.armB + pose.armBendB, P.fore, P.wFore);

  // 軀幹本體
  g.lineWidth = P.wTorso;
  g.beginPath(); g.moveTo(hipX, hipY); g.lineTo(neckX, neckY); g.stroke();
  // 骨盆與肩膀一點厚度
  g.lineWidth = P.wThigh + 2;
  g.beginPath(); g.moveTo(hipX-4, hipY); g.lineTo(hipX+4, hipY); g.stroke();
  g.lineWidth = P.wUpper + 3;
  g.beginPath(); g.moveTo(chestX-6, chestY2); g.lineTo(chestX+6, chestY2); g.stroke();

  // 前腿
  var kA = limb(g, hipX, hipY, pose.thighA, P.thigh, P.wThigh);
  limb(g, kA[0], kA[1], pose.thighA - pose.bendA, P.shin, P.wShin);
  // 前手臂
  var eA = limb(g, chestX + 5, chestY2, pose.armA, P.upper, P.wUpper);
  limb(g, eA[0], eA[1], pose.armA + pose.armBendA, P.fore, P.wFore);

  // 頭（連著脖子一起轉一點）
  var hl = (P.neckY - P.headY);
  var ha = lean + pose.headTilt*Math.PI/180;
  var headX = neckX + Math.sin(ha)*hl, headY = neckY - Math.cos(ha)*hl;
  g.lineWidth = P.wNeck;
  g.beginPath(); g.moveTo(neckX, neckY); g.lineTo(headX, headY); g.stroke();
  g.beginPath(); g.arc(headX, headY, P.headR, 0, Math.PI*2); g.fill();

  // 一顆白眼睛（純白只給強調點）
  g.fillStyle = COL.white;
  g.beginPath(); g.arc(headX + P.headR*0.42, headY - P.headR*0.12, P.headR*0.26, 0, Math.PI*2); g.fill();

  g.restore();
}

// ---------------------------------------------------------------- 背景各層
function layerX(i, cam){ return -cam * PARALLAX[i]; }

// 太陽在無限遠：畫面上固定一點（相機移動它不動），所有受光方向由它決定
function sunPos(){ return { x: viewW * SUN.fx, y: SUN.y }; }

var _gcache = {};                        // 漸層很貴，而且只跟畫面寬度有關，不必每幀重建
function cachedGrad(key, make){
  var ck = key + '|' + Math.round(viewW);
  if(!_gcache[ck]) _gcache[ck] = make();
  return _gcache[ck];
}

var _skyCv = null, _skyKey = '';
function staticSky(){
  var key = canvas.width + 'x' + canvas.height;
  if(_skyCv && _skyKey === key) return _skyCv;
  var cv = document.createElement('canvas');
  cv.width = canvas.width; cv.height = canvas.height;
  var g = cv.getContext('2d');
  g.setTransform(scale,0,0,scale,0,0);
  var sun = sunPos();
  var q = g.createLinearGradient(0, 0, 0, HORIZON + 70);
  q.addColorStop(0.00, COL.skyTop); q.addColorStop(0.32, COL.skyMid1);
  q.addColorStop(0.60, COL.skyMid2); q.addColorStop(0.84, COL.skyLow);
  q.addColorStop(1.00, COL.skyHorz);
  g.fillStyle = q; g.fillRect(0, 0, viewW, HORIZON + 70);
  g.fillStyle = COL.skyHorz; g.fillRect(0, HORIZON + 68, viewW, viewH - HORIZON);
  var R = viewH * 1.15;
  var h = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, R);
  h.addColorStop(0.00, COL.haloA);
  h.addColorStop(0.10, COL.haloB);
  h.addColorStop(0.24, COL.haloC);
  h.addColorStop(1.00, COL.haloD);
  g.fillStyle = h; g.fillRect(0, 0, viewW, HORIZON + 70);
  var disc = g.createRadialGradient(sun.x, sun.y, SUN.r*0.5, sun.x, sun.y, SUN.r*1.5);
  disc.addColorStop(0.00, COL.sun);
  disc.addColorStop(0.42, COL.haloB);       // 中間不要有一階跳，不然日盤外圍會出現一圈硬環
  disc.addColorStop(1.00, COL.haloD);
  g.fillStyle = disc;
  g.beginPath(); g.arc(sun.x, sun.y, SUN.r*1.5, 0, Math.PI*2); g.fill();
  _skyCv = cv; _skyKey = key;
  return cv;
}

function drawSky(g){
  var sun = sunPos();
  g.save(); g.setTransform(1,0,0,1,0,0);
  g.drawImage(staticSky(), 0, 0);
  g.restore();

  // 雲：拉長的橢圓柔光。受光側（朝太陽那一邊）比較亮、背光側偏紫。
  // 不用等寬的線——那看起來像日光燈管（第一版就是）。
  var cloudDark = cachedGrad('cloudD', function(){
    var q = ctx.createRadialGradient(0,0,0, 0,0,1);
    q.addColorStop(0, 'rgba(120,58,74,0.20)');
    q.addColorStop(0.55, 'rgba(120,58,74,0.09)');
    q.addColorStop(1, 'rgba(123,58,74,0)'); return q;
  });
  for(var i=0;i<7;i++){
    var y = HORIZON - 130 - i*76 - rnd(i*3.1)*44;
    var w = 340 + rnd(i*7.7)*760;
    var x = ((rnd(i*2.3)*2400 - camX*0.05) % (viewW + w*2)) - w;
    var th = 34 + rnd(i)*40;
    g.save();
    g.translate(x + w/2, y); g.scale(w/2, th/2);
    g.fillStyle = cloudDark;
    g.beginPath(); g.arc(0, 0, 1, 0, Math.PI*2); g.fill();
    g.restore();
  }
  g.restore();
  g.globalAlpha = 1;
}

// 建築受光：朝太陽的那一側邊緣一道亮邊，背光側壓深
// 層 1：遠景天際線（最淺、最偏天空色、最慢）
function drawFar(g, cam){
  var off = layerX(0, cam);
  var TILE = 400;
  var i0 = Math.floor((-off) / TILE) - 1;
  var i1 = i0 + Math.ceil(viewW / TILE) + 3;
  var base = HORIZON + 14;

  var grd = cachedGrad('farbody', function(){
    var q = ctx.createLinearGradient(0, base - 300, 0, base);
    q.addColorStop(0, COL.farTop); q.addColorStop(1, COL.far); return q;
  });
  g.fillStyle = grd;

  var boxes = [];
  g.beginPath();
  g.moveTo(i0*TILE + off, base);
  for(var i=i0;i<i1;i++){
    var x = i*TILE + off;
    for(var k=0;k<4;k++){
      var s = i*4 + k;
      var bw = 52 + rnd(s*1.7)*52;
      var bh = 70 + rnd(s*3.3)*180;
      var bx = x + k*TILE/4 + rnd(s*5.1)*22;
      var stepped = rnd(s*9.4) > 0.5;
      boxes.push([bx, bw, base - bh, stepped ? base - bh*0.46 : base - bh]);
      g.lineTo(bx, base);
      if(stepped){
        g.lineTo(bx, base - bh);
        g.lineTo(bx + bw*0.55, base - bh*0.94);
        g.lineTo(bx + bw*0.62, base - bh*0.52);
        g.lineTo(bx + bw, base - bh*0.46);
      } else {
        g.lineTo(bx, base - bh);
        g.lineTo(bx + bw, base - bh);
      }
      g.lineTo(bx + bw, base);
    }
  }
  g.lineTo(i1*TILE + off, base);
  g.closePath(); g.fill();

  // 受光邊（遠景的光很弱，只是一道細亮邊）
  // 遠處的燈（純白只給少量強調點）
  g.fillStyle = COL.white;
  for(var j=i0;j<i1;j++){
    if(rnd(j*13.7) > 0.45) continue;
    var lx = j*TILE + off + rnd(j*4.4)*TILE;
    var ly = base - 60 - rnd(j*8.8)*180;
    g.globalAlpha = 0.55 + 0.45*Math.sin(perfNow()*0.002 + j);
    g.fillRect(lx, ly, 3, 3);
  }
  g.globalAlpha = 1;


}

// 空氣感薄霧：這是大氣，不是天際線。獨立成一支，
// 因為判準①-b 量的是「關掉層1 會少掉哪些像素」——霧留在 drawFar 裡的話，
// 霧底下的天空會被算成層1，farPx 從 74 萬變成 114 萬，明度差被稀釋成 1.80。
function drawHaze(g){
  var base = HORIZON + 14, H = 420;
  g.fillStyle = cachedGrad('haze', function(){
    var q = ctx.createLinearGradient(0, base - H, 0, base + 10);
    q.addColorStop(0.00, 'rgba(' + COL.haze + ',0)');
    q.addColorStop(0.45, 'rgba(' + COL.haze + ',0.18)');
    q.addColorStop(1.00, 'rgba(' + COL.haze + ',0.56)');
    return q;
  });
  g.fillRect(0, base - H, viewW, H + 20);
}

// 層 2：中遠景廢墟建築群
// v4：不再是「切掉一角的方塊＋整齊排隊的方窗」。每一棟是一個塌掉的結構：
//   下半是還站著的量體，上半是斷掉的樓板層層錯開、板緣露出鋼筋、
//   有的整棟被斜斜削掉半邊、有的頂上橫著一根半倒的梁；
//   窗戶的排列會被破壞——整排消失、或連續破掉的窗併成一個不規則的洞。
// 明暗一律固定色（COL.mid / COL.midTop / COL.midHole），沒有任何隨相機或太陽變化的東西。
function drawMid(g, cam){
  var off = layerX(1, cam);
  var TILE = 460;
  var i0 = Math.floor((-off) / TILE) - 1;
  var i1 = i0 + Math.ceil(viewW / TILE) + 3;
  var base = HORIZON + 96;

  var body = cachedGrad('midbody', function(){
    var q = ctx.createLinearGradient(0, base - 420, 0, base);
    q.addColorStop(0, COL.midTop); q.addColorStop(1, COL.mid); return q;
  });

  // 地平線以下先鋪滿（相機升高時往下看到的是更多廢墟，不是天空底色）
  g.fillStyle = COL.mid;
  g.fillRect(0, base - 1, viewW, 1500);

  for(var i=i0;i<i1;i++){
    for(var k=0;k<3;k++){
      var s = i*3 + k + 0.5;
      var bw = 105 + rnd(s*2.2)*95;
      var bh = 120 + rnd(s*6.6)*300;
      var bx = i*TILE + off + k*TILE/3 + rnd(s*4.9)*18;
      drawRuin(g, bx, bw, base, bh, s, body);
    }
  }
}

function drawRuin(g, bx, bw, base, bh, s, body){
  var FLOOR = 46;                                   // 一層樓的高
  var collapse = 0.58 + rnd(s*3.7)*0.30;            // 這一棟從幾成高度開始塌
  var solidTop = base - bh*collapse;
  var shear = rnd(s*8.3);                           // 被削掉半邊的方向與程度
  var leftHigh = rnd(s*5.1) < 0.5;

  g.fillStyle = body;

  // ---- 還站著的量體：頂緣是一條斜的斷面（被削掉半邊）----
  var tL = solidTop, tR = solidTop;
  if(shear < 0.42){
    if(leftHigh) tR = solidTop + bh*0.18 + rnd(s*2.9)*bh*0.16;
    else         tL = solidTop + bh*0.18 + rnd(s*2.9)*bh*0.16;
  }
  g.beginPath();
  g.moveTo(bx, base); g.lineTo(bx, tL);
  // 斷面不是一條直線，中間崩掉一塊
  g.lineTo(bx + bw*0.34, lerp(tL, tR, 0.34) - 6);
  g.lineTo(bx + bw*0.47, lerp(tL, tR, 0.47) + 14);
  g.lineTo(bx + bw*0.63, lerp(tL, tR, 0.63) - 4);
  g.lineTo(bx + bw, tR);
  g.lineTo(bx + bw, base);
  g.closePath(); g.fill();

  // ---- 塌掉的上半：先留一道還站著的核心牆，斷樓板掛在它身上 ----
  // （第一版的板子是獨立飄在建築上方的，看起來像層架。真的廢墟是板子還連著一道沒倒的牆。）
  var slabs = 1 + Math.floor(rnd(s*6.1)*3);
  var coreW = bw * (0.16 + rnd(s*2.3)*0.16);
  var coreX = bx + (rnd(s*3.1) < 0.5 ? bw*0.06 : bw - coreW - bw*0.06);
  var coreTop = solidTop - FLOOR*slabs - 18 - rnd(s*4.7)*24;
  g.fillStyle = COL.mid;                          // 塌掉的部分用單一個固定色，才跟建築是同一個東西
  g.beginPath();
  g.moveTo(coreX, solidTop + 6);
  g.lineTo(coreX + coreW*0.15, coreTop + 10);
  g.lineTo(coreX + coreW*0.55, coreTop);
  g.lineTo(coreX + coreW, coreTop + 16);
  g.lineTo(coreX + coreW, solidTop + 6);
  g.closePath(); g.fill();

  var topSlabY = coreTop, topSlabX0 = coreX, topSlabX1 = coreX + coreW;
  for(var j=0;j<slabs;j++){
    var sy = solidTop - FLOOR*(j+1) - rnd(s*7 + j)*8;
    var frac = 0.74 - j*0.16 + rnd(s*9 + j)*0.20;
    frac = clamp(frac, 0.26, 0.92);
    var sw = bw * frac;
    // 一定有一端咬在核心牆上，另一端是斷口——板子不會憑空飄著
    var fromLeft = coreX < bx + bw*0.5;
    var sx = fromLeft ? coreX + coreW*0.3 : coreX + coreW*0.7 - sw;
    var th = 10 + rnd(s*13 + j)*4;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + sw, sy - (rnd(s*4+j)-0.5)*6);
    g.lineTo(sx + sw - 8, sy + th);
    g.lineTo(sx + 4, sy + th - 2);
    g.closePath(); g.fill();
    // 板下垂著的殘牆
    if(rnd(s*17 + j) < 0.5){
      var wx = sx + sw*(fromLeft ? 0.55 + rnd(s*19+j)*0.3 : 0.15 + rnd(s*19+j)*0.3);
      g.fillRect(wx, sy + th, 14 + rnd(s*23+j)*22, 12 + rnd(s*29+j)*22);
    }
    if(j === slabs-1){ topSlabY = sy; topSlabX0 = sx; topSlabX1 = sx + sw; }
  }

  // ---- 外露鋼筋：只長在板子的斷口那一端，短、少、細 ----
  g.strokeStyle = COL.midHole; g.lineCap = 'round'; g.lineWidth = 2;
  for(var r2=0;r2<3;r2++){
    var rx = topSlabX1 - 6 - r2*7;
    var rl = 9 + rnd(s*37 + r2)*11;
    g.beginPath(); g.moveTo(rx, topSlabY + 2);
    g.quadraticCurveTo(rx + (rnd(s*41+r2)-0.5)*6, topSlabY - rl*0.6, rx + (rnd(s*43+r2)-0.5)*10, topSlabY - rl);
    g.stroke();
  }

  // ---- 半倒的梁：一端架在核心牆上，斜斜插下來 ----
  if(rnd(s*47) < 0.45){
    var ang = 0.30 + rnd(s*53)*0.55;
    if(coreX > bx + bw*0.5) ang = -ang;
    var bl = 60 + rnd(s*59)*70;
    g.save();
    g.translate(coreX + coreW*0.5, coreTop + 14);
    g.rotate(ang);
    g.fillStyle = COL.mid;
    g.fillRect(0, -6, bl, 11);
    g.strokeStyle = COL.midHole; g.lineWidth = 2;
    g.beginPath(); g.moveTo(bl, -3); g.lineTo(bl + 9, -8);
    g.moveTo(bl, 3);  g.lineTo(bl + 10, 5);
    g.stroke();
    g.restore();
  }

  // ---- 掏空的層帶：洞跟結構對齊，不是照窗格長出來的 ----
  // 洞開在兩片樓板之間的層帶上、寬度吃整層或半層、邊緣沿著核心牆或建築斷面切。
  // 一棟最多 2 處；矮的（＝更遠的）樓不開洞——距離越遠細節越少。
  var solidH = base - solidTop;
  var rows = Math.floor(solidH / FLOOR);
  var holeRows = {};
  if(bh >= 210 && rows >= 4 && rnd(s*91) < 0.72){
    var nHoles = rnd(s*97) < 0.32 ? 2 : 1;
    var coreLeft = coreX < bx + bw*0.5;
    for(var hI=0; hI<nHoles; hI++){
      var hr = 1 + Math.floor(rnd(s*101 + hI*7) * (rows - 2));
      if(holeRows[hr] || holeRows[hr-1] || holeRows[hr+1]) continue;   // 兩個洞不相鄰
      holeRows[hr] = 1;
      var hy = solidTop + 8 + hr*FLOOR;
      var hh2 = FLOOR - 13;
      var wide = rnd(s*103 + hI) < 0.42;               // 吃整層 or 半層
      var x0, x1;
      if(wide){ x0 = bx + 3; x1 = bx + bw - 3; }
      else if(coreLeft){ x0 = coreX + coreW; x1 = bx + bw - 3; }
      else { x0 = bx + 3; x1 = coreX; }
      if(x1 - x0 < 26) continue;
      g.fillStyle = COL.midSee;                        // 掏空＝透光，從這裡看得到後面的天
      g.beginPath();
      g.moveTo(x0, hy + 3);
      g.lineTo(x0 + (x1-x0)*0.30, hy);                 // 上緣：樓板的下沿，只有一點崩
      g.lineTo(x0 + (x1-x0)*0.72, hy + 2);
      g.lineTo(x1, hy);
      g.lineTo(x1, hy + hh2 - 2);
      g.lineTo(x0 + (x1-x0)*0.62, hy + hh2);           // 下緣：踩碎的樓板
      g.lineTo(x0 + (x1-x0)*0.28, hy + hh2 - 4);
      g.lineTo(x0, hy + hh2 - 1);
      g.closePath(); g.fill();
      // 洞裡剩下的一根柱子
      if(!wide && rnd(s*107 + hI) < 0.5){
        g.fillStyle = COL.mid;
        var cpx = x0 + (x1-x0)*(0.35 + rnd(s*109+hI)*0.3);
        g.fillRect(cpx, hy, 9, hh2);
      }
    }
  }

  // ---- 窗：小的暗塊。整排會消失，但不再併成大洞（大洞由上面那段負責）----
  g.fillStyle = COL.midHole;
  var cols = Math.floor(bw / 42);
  for(var r=0;r<rows;r++){
    if(holeRows[r]) continue;                          // 這一層被掏空了，沒有窗
    if(rnd(s*67 + r*3.1) < 0.22) continue;             // 這一排整排沒了
    var y = solidTop + 16 + r*FLOOR;
    for(var c=0;c<cols;c++){
      if(rnd(s*89 + r*2.7 + c*4.3) < 0.40) continue;
      g.fillRect(bx + 13 + c*42, y, 18, 26);
    }
  }
}

// 層 3：角色踩的平台——明確的上表面（受光）＋厚度＋底下的岩體
function drawGround(g, cam){
  var off = layerX(2, cam);
  var x0 = -off - 40, x1 = -off + viewW + 40;
  var TOP_FACE = 22;                    // 上表面厚度（走得上去的那一層）

  // 岩體
  g.fillStyle = COL.ground;
  g.beginPath();
  g.moveTo(x0 + off, viewH);
  for(var x = x0; x <= x1; x += 16) g.lineTo(x + off, groundTop(x));
  g.lineTo(x1 + off, viewH);
  g.closePath(); g.fill();

  g.save();
  g.beginPath();
  g.moveTo(x0 + off, viewH);
  for(var xa = x0; xa <= x1; xa += 16) g.lineTo(xa + off, groundTop(xa));
  g.lineTo(x1 + off, viewH); g.closePath();
  g.clip();

  // 上表面：一條實體的亮帶，讓它看起來是「可以走的平台」不是「懸崖邊」
  g.fillStyle = COL.topFace;          // 固定色：平台的上表面
  g.beginPath();
  for(var xb = x0; xb <= x1; xb += 16){
    if(xb === x0) g.moveTo(xb + off, groundTop(xb));
    else g.lineTo(xb + off, groundTop(xb));
  }
  for(var xc = x1; xc >= x0; xc -= 16) g.lineTo(xc + off, groundTop(xc) + TOP_FACE);
  g.closePath(); g.fill();

  // 上表面底下的一條硬陰影＝厚度
  g.strokeStyle = COL.crack; g.lineWidth = 7;
  g.beginPath();
  for(var xe = x0; xe <= x1; xe += 16){
    if(xe === x0) g.moveTo(xe + off, groundTop(xe) + TOP_FACE + 3);
    else g.lineTo(xe + off, groundTop(xe) + TOP_FACE + 3);
  }
  g.stroke();

  // 底下的水平岩層
  g.strokeStyle = '#1e1220'; g.lineWidth = 2; g.globalAlpha = 0.8;
  for(var L=1; L<=4; L++){
    g.beginPath();
    for(var xd = x0; xd <= x1; xd += 20){
      var yy = groundTop(xd) + TOP_FACE + 44*L + 14*Math.sin(xd*0.0032 + L);
      if(xd === x0) g.moveTo(xd + off, yy); else g.lineTo(xd + off, yy);
    }
    g.stroke();
  }
  g.globalAlpha = 1;

  // 裂縫：只裂在上表面以下，而且窄——不讓它看起來像整塊斷掉
  var SEG = 640;
  var s0 = Math.floor(x0 / SEG), s1 = Math.ceil(x1 / SEG);
  g.fillStyle = COL.crack;
  for(var s = s0; s <= s1; s++){
    var sx = s * SEG;
    var cx = sx, cy = groundTop(sx) + TOP_FACE, w0 = 11;
    var pts = [[cx, cy]];
    for(var d=1; d<=5; d++){ cx += (rnd(s*3.7+d)-0.5)*26; cy += 36; pts.push([cx, cy]); }
    g.beginPath();
    g.moveTo(pts[0][0] + off - w0/2, pts[0][1]);
    for(var q=1;q<pts.length;q++) g.lineTo(pts[q][0] + off - w0/2*(1-q/pts.length), pts[q][1]);
    for(var q2=pts.length-1;q2>=0;q2--) g.lineTo(pts[q2][0] + off + w0/2*(1-q2/pts.length), pts[q2][1]);
    g.closePath(); g.fill();
  }
  g.restore();

  // 頂緣的受光線（靠近太陽最亮）
  g.strokeStyle = COL.rim;            // 固定色：上表面的邊，不隨太陽方位變 g.lineWidth = 4;
  g.beginPath();
  for(var x2 = x0; x2 <= x1; x2 += 16){
    if(x2 === x0) g.moveTo(x2 + off, groundTop(x2) - 1);
    else g.lineTo(x2 + off, groundTop(x2) - 1);
  }
  g.stroke();

  // 站在表面上的碎石（受光側有一點亮邊，才像立在平台上）
  var r0 = Math.floor(x0/220), r1 = Math.ceil(x1/220);
  for(var r=r0;r<=r1;r++){
    if(rnd(r*6.1) > 0.55) continue;
    var rx = r*220 + rnd(r*8.1)*140, ry = groundTop(rx);
    var rw = 22 + rnd(r*2.2)*40, rh = 12 + rnd(r*4.4)*22;
    g.fillStyle = COL.ground;
    g.beginPath();
    g.moveTo(rx + off - rw, ry + 2);
    g.lineTo(rx + off - rw*0.5, ry - rh);
    g.lineTo(rx + off + rw*0.1, ry - rh*0.55);
    g.lineTo(rx + off + rw*0.7, ry - rh*0.9);
    g.lineTo(rx + off + rw, ry + 2);
    g.closePath(); g.fill();
  }
}

// 層 4：前景（最深色、捲最快）——有實體的碎石堆、斷裂柱子、枯枝，會從角色前方掠過
function drawFore(g, cam){
  var off = layerX(3, cam);
  var TILE = 260;
  var i0 = Math.floor((-off) / TILE) - 1;
  var i1 = i0 + Math.ceil(viewW / TILE) + 3;
  var base = viewH + 14;

  g.lineCap = 'round'; g.lineJoin = 'round';

  for(var i=i0;i<i1;i++){
    var x = i*TILE + off, s = i + 0.3;
    var kind = rnd(s*21.1);
    g.fillStyle = COL.fore; g.strokeStyle = COL.fore;

    if(kind < 0.30){                 // 碎石堆（高，會蓋到腳與小腿）
      // 扁而寬、由小階堆起來——尖三角看起來是山，不是碎石
      var w = 340 + rnd(s*3.3)*320, h = 110 + rnd(s*7.1)*90;
      g.beginPath();
      g.moveTo(x - 60, base);
      g.lineTo(x + w*0.05, base - h*0.22);
      g.lineTo(x + w*0.16, base - h*0.30);
      g.lineTo(x + w*0.22, base - h*0.58);
      g.lineTo(x + w*0.34, base - h*0.64);
      g.lineTo(x + w*0.39, base - h*0.92);
      g.lineTo(x + w*0.52, base - h);
      g.lineTo(x + w*0.58, base - h*0.70);
      g.lineTo(x + w*0.71, base - h*0.76);
      g.lineTo(x + w*0.76, base - h*0.40);
      g.lineTo(x + w*0.90, base - h*0.34);
      g.lineTo(x + w, base - h*0.14);
      g.lineTo(x + w + 70, base);
      g.closePath(); g.fill();

    } else if(kind < 0.52){          // 斷裂的柱子：細、高，從角色前面直接掠過
      var px = x + 70, ph = 240 + rnd(s*12.9)*100, pw = 30 + rnd(s*4.1)*18;
      var tilt = (rnd(s*6.3)-0.5)*0.22;
      g.beginPath();
      g.moveTo(px - pw/2, base);
      g.lineTo(px - pw/2 + Math.sin(tilt)*ph, base - ph);
      g.lineTo(px - pw*0.1 + Math.sin(tilt)*ph, base - ph*0.93);   // 斷口是歪的
      g.lineTo(px + pw*0.2 + Math.sin(tilt)*ph, base - ph*1.02);
      g.lineTo(px + pw/2 + Math.sin(tilt)*ph, base - ph*0.88);
      g.lineTo(px + pw/2, base);
      g.closePath(); g.fill();
      // 露出來的鋼筋
      g.lineWidth = 4;
      for(var rb=0;rb<3;rb++){
        var rbx = px - pw*0.3 + rb*pw*0.3 + Math.sin(tilt)*ph;
        g.beginPath(); g.moveTo(rbx, base - ph*0.95);
        g.quadraticCurveTo(rbx + (rb-1)*10, base - ph*1.06, rbx + (rb-1)*26, base - ph*1.10);
        g.stroke();
      }

    } else if(kind < 0.72){          // 草叢／鋼筋
      for(var bI=0;bI<13;bI++){
        var bx = x + bI*13 + rnd(s*4+bI)*8;
        var bh = 110 + rnd(s*9+bI)*210;
        var sway = Math.sin(perfNow()*0.0012 + bI*0.7 + i)*7;
        g.beginPath();
        g.moveTo(bx - 4.5, base);
        g.quadraticCurveTo(bx + sway*0.5, base - bh*0.6, bx + sway, base - bh);
        g.quadraticCurveTo(bx + sway*0.5, base - bh*0.6, bx + 4.5, base);
        g.closePath(); g.fill();
      }

    } else if(kind < 0.88){          // 斷牆
      var ww = 150 + rnd(s*6.2)*140, wh = 180 + rnd(s*2.8)*120;
      g.beginPath();
      g.moveTo(x, base); g.lineTo(x, base - wh);
      g.lineTo(x + ww*0.30, base - wh*0.86);
      g.lineTo(x + ww*0.38, base - wh*0.52);
      g.lineTo(x + ww*0.62, base - wh*0.64);
      g.lineTo(x + ww*0.70, base - wh*0.30);
      g.lineTo(x + ww, base - wh*0.46);
      g.lineTo(x + ww, base);
      g.closePath(); g.fill();

    } else {                         // 枯枝
      var tx = x + 60, th = 420 + rnd(s*12.4)*180;   // 只有枯枝會過頭，所以它必須很細
      var lean2 = (rnd(s*3.9)-0.5)*0.34;
      g.lineWidth = 8;
      var topX = tx + Math.sin(lean2)*th, topY = base - th;
      g.beginPath(); g.moveTo(tx, base);
      g.quadraticCurveTo(tx + Math.sin(lean2)*th*0.4, base - th*0.55, topX, topY);
      g.stroke();
      for(var br=0;br<5;br++){
        var t = 0.42 + br*0.13;
        var bxx = tx + Math.sin(lean2)*th*t, byy = base - th*t;
        var dir = (br%2 ? 1 : -1) * (0.5 + rnd(s*7+br)*0.6);
        var bl = 60 + rnd(s*9+br)*80;
        g.lineWidth = 8 - br;
        g.beginPath(); g.moveTo(bxx, byy);
        g.quadraticCurveTo(bxx + dir*bl*0.6, byy - bl*0.3, bxx + dir*bl, byy - bl*0.75);
        g.stroke();
      }
    }
  }
  g.fillStyle = COL.fore;
  g.fillRect(0, viewH - 30, viewW, 34);
}


// ---------------------------------------------------------------- 關卡：看不見的方塊＋斜線
// 規格（ART_PIPELINE）：踩的是幾個看不見的方塊與斜線，絕不照圖描邊。
// 一個模組 2400 長，從地面一路爬到最高點再降回來，之後重複。
var MODULE_W = 2400;
// [相對 x, 寬, 左端高, 右端高]；高度是世界 y（愈小愈高）
// 浮空平台是輔助，擺在地形平坦的後半段（前半段是地形本身的坡與坑）
var MODULE = [
  [1520, 230, 760, 760],   // 從地面(880) 上來，抬升 120
  [1830, 210, 640, 640],   // 抬升 120、水平缺口 80
  [2080, 220, 640, 540],   // 斜坡平台
  [2360, 210, 450, 450]    // 最高處：抬升 90、缺口 60
];
var TOP_OF_MODULE = 450;

function platformsNear(x){
  var out = [], m0 = Math.floor((x - MODULE_W) / MODULE_W), m1 = m0 + 3;
  for(var m=m0;m<=m1;m++){
    var ox = m * MODULE_W;
    for(var i=0;i<MODULE.length;i++){
      var d = MODULE[i];
      out.push({ x: ox + d[0], w: d[1], y0: d[2], y1: d[3] });
    }
  }
  return out;
}
function topOf(p, x){ return lerp(p.y0, p.y1, clamp((x - p.x)/p.w, 0, 1)); }
function covers(p, x){ return x >= p.x && x <= p.x + p.w; }

// 某個 x 之上，所有可以站的面（含地面），由高到低
function surfacesAt(x){
  var list = [], ps = platformsNear(x);
  for(var i=0;i<ps.length;i++) if(covers(ps[i], x)) list.push({ p: ps[i], y: topOf(ps[i], x) });
  list.push({ p: null, y: groundTop(x) });
  list.sort(function(a,b){ return a.y - b.y; });
  return list;
}

// ---------------------------------------------------------------- 畫一幀
var _frozenNow = null;
function perfNow(){ return _frozenNow !== null ? _frozenNow : performance.now(); }

function layerYOff(i){ return (camY - CAM_BASE_Y) * PARALLAX_Y[i]; }

function drawPlatforms(g){
  // 崩落的樓板，不是長凳：兩端是斷口、下緣不平、底下垂著鋼筋。
  // 可見厚度刻意薄（30）——厚的話站在下面的角色上半身會壓在平台側面上，
  // 判準② 量到最差取樣點掉到 1.53。薄的只會蓋到一小段。
  var ps = platformsNear(camX), BODY = 30, TOPF = 13;
  for(var i=0;i<ps.length;i++){
    var p = ps[i], sd = p.x * 0.0013;
    var yL = p.y0, yR = p.y1;
    function ty(t){ return lerp(yL, yR, t); }

    g.fillStyle = COL.ground;
    g.beginPath();
    g.moveTo(p.x - 6, yL + 10);                       // 左邊的斷口
    g.lineTo(p.x + p.w*0.04, yL);
    g.lineTo(p.x + p.w*0.97, ty(0.97));
    g.lineTo(p.x + p.w + 8, yR + 8);                  // 右邊的斷口
    g.lineTo(p.x + p.w*0.88, ty(0.88) + BODY);        // 下緣不平
    g.lineTo(p.x + p.w*0.62, ty(0.62) + BODY - 7);
    g.lineTo(p.x + p.w*0.34, ty(0.34) + BODY + 5);
    g.lineTo(p.x + p.w*0.10, ty(0.10) + BODY - 4);
    g.closePath(); g.fill();

    g.fillStyle = COL.topFace;                        // 上表面：踩得到的那一面
    g.beginPath();
    g.moveTo(p.x + p.w*0.02, yL); g.lineTo(p.x + p.w*0.97, ty(0.97));
    g.lineTo(p.x + p.w*0.97, ty(0.97) + TOPF); g.lineTo(p.x + p.w*0.02, yL + TOPF);
    g.closePath(); g.fill();

    g.strokeStyle = COL.rim; g.lineWidth = 4; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(p.x + p.w*0.02, yL - 1); g.lineTo(p.x + p.w*0.97, ty(0.97) - 1); g.stroke();

    // 垂下來的鋼筋（細，不會吃掉角色）
    g.strokeStyle = COL.crack; g.lineCap = 'round';
    for(var r=0;r<4;r++){
      var t = 0.14 + r*0.23 + rnd(sd + r)*0.05;
      var bx = p.x + p.w*t, by = ty(t) + BODY - 4;
      var ln = 16 + rnd(sd*3 + r)*30;
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(bx, by);
      g.quadraticCurveTo(bx + (rnd(sd+r*2)-0.5)*14, by + ln*0.6, bx + (rnd(sd+r*3)-0.5)*22, by + ln);
      g.stroke();
    }
  }
}

function render(opts){
  opts = opts || {};
  var g = ctx;
  g.setTransform(1,0,0,1,0,0);
  g.fillStyle = COL.skyTop;
  g.fillRect(0,0,canvas.width,canvas.height);
  g.setTransform(scale,0,0,scale,0,0);

  // 相機：角色放在畫面偏左三分之一；垂直方向各層照自己的係數跟
  var cam = camX - viewW*0.38;

  drawSky(g);
  g.save(); g.translate(0, -layerYOff(0));
  if(opts.far !== false) drawFar(g, cam);
  drawHaze(g);
  g.restore();
  g.save(); g.translate(0, -layerYOff(1));
  if(opts.mid !== false) drawMid(g, cam);
  g.restore();

  g.save(); g.translate(0, -layerYOff(2));
  drawGround(g, cam);                       // drawGround 自己處理水平位移
  g.restore();
  g.save(); g.translate(layerX(2, cam), -layerYOff(2));
  drawPlatforms(g);
  if(opts.player !== false) drawPlayer(g);
  g.restore();

  g.save(); g.translate(0, -layerYOff(3));
  if(opts.fore !== false) drawFore(g, cam);
  g.restore();

  if(opts.ui !== false) drawPaletteButton(g);
}

// 右上角一個小方塊：點它或按 P 換配色
function paletteBtnRect(){ return { x: viewW - 96, y: 28, w: 68, h: 44 }; }
function drawPaletteButton(g){
  var r = paletteBtnRect();
  g.globalAlpha = 0.85;
  g.fillStyle = PALETTES.dark.skyMid2;  g.fillRect(r.x, r.y, r.w/2, r.h);
  g.fillStyle = PALETTES.dusk.skyLow;   g.fillRect(r.x + r.w/2, r.y, r.w/2, r.h);
  g.globalAlpha = 1;
  g.strokeStyle = COL.white; g.lineWidth = 3; g.globalAlpha = 0.9;
  g.strokeRect(r.x, r.y, r.w, r.h);
  // 現在是哪一版：底下一條短線
  g.beginPath();
  var cx = palKey === 'dark' ? r.x + r.w*0.25 : r.x + r.w*0.75;
  g.moveTo(cx - 12, r.y + r.h + 8); g.lineTo(cx + 12, r.y + r.h + 8); g.stroke();
  g.globalAlpha = 1;
}
function hitPaletteButton(cssX, cssY){
  var r = paletteBtnRect();
  var dpr = canvas.width / parseFloat(canvas.style.width || canvas.width);
  var wx = cssX * dpr / scale, wy = cssY * dpr / scale;
  return wx >= r.x - 20 && wx <= r.x + r.w + 20 && wy >= r.y - 20 && wy <= r.y + r.h + 20;
}
canvas.addEventListener('click', function(e){
  if(hitPaletteButton(e.clientX, e.clientY)) togglePalette();
});

// ---------------------------------------------------------------- 更新
// ==== 跳躍手感的設計值（判準③-c）====
var SPEED      = 330;    // 走路速度（世界單位／秒）
var GRAV       = 1900;   // 重力
var JUMP_V     = 820;    // 起跳速度 → 跳躍高度 820²/(2×1900) ≈ 177，略低於角色身高 180
var JUMP_CUT   = 300;    // 放開跳躍鍵時的最大上升速度（短按＝矮跳）
var COYOTE     = 0.12;   // 離地寬容：踏空之後還能跳的時間
var JUMP_BUF   = 0.12;   // 預輸入：落地前多久按跳都算數
var CAM_BASE_Y = GROUND_Y;
var CAM_LOOK   = 0.14;   // 下墜時鏡頭往下預看的係數
var CAM_LERP   = 7;      // 鏡頭跟隨速度
var camY = GROUND_Y;

function update(dt){
  var dir = (input.right?1:0) - (input.left?1:0);
  player.vx = dir * SPEED;
  if(dir !== 0) player.face = dir;
  player.x += player.vx * dt;

  // 離地寬容 & 預輸入
  player.coyote = player.onGround ? COYOTE : Math.max(0, (player.coyote||0) - dt);
  if(input.jump && !player.jumpHeld) player.buf = JUMP_BUF;
  else player.buf = Math.max(0, (player.buf||0) - dt);
  player.jumpHeld = input.jump;

  if(player.buf > 0 && player.coyote > 0){
    player.vy = -JUMP_V; player.onGround = false; player.stand = null;
    player.state = 'air'; player.buf = 0; player.coyote = 0;
  }
  // 放開跳躍鍵就截斷上升＝可變跳躍高度
  if(!input.jump && player.vy < -JUMP_CUT) player.vy = -JUMP_CUT;

  if(player.onGround){
    if(player.stand){
      if(covers(player.stand, player.x)) player.y = topOf(player.stand, player.x);
      else { player.onGround = false; player.stand = null; player.vy = 0; }
    } else {
      player.y = groundTop(player.x);
    }
  }
  if(!player.onGround){
    var prevY = player.y;
    player.vy += GRAV * dt;
    player.y += player.vy * dt;
    if(player.vy > 0){
      var best = null;
      var list = surfacesAt(player.x);
      for(var i=0;i<list.length;i++){
        var t = list[i].y;
        if(t >= prevY - 2 && t <= player.y){ best = list[i]; break; }   // 由高到低，第一個撞到的
      }
      if(best){
        player.y = best.y; player.vy = 0; player.onGround = true;
        player.stand = best.p; player.state = 'land'; player.landT = 0;
      }
    }
    if(player.state !== 'land') player.state = 'air';
  }

  player.animT += dt;
  if(player.state === 'land'){
    player.landT += dt;
    if(player.landT > 3/FPS_ANIM) player.state = dir ? 'walk' : 'idle';
  } else if(player.onGround){
    player.state = dir ? 'walk' : 'idle';
  }
  if(player.state === 'walk') player.walkPhase = (player.walkPhase + dt * FPS_ANIM) % 8;

  camX += (player.x - camX) * Math.min(1, dt*CAM_LERP);
  // 垂直：跟著角色，下墜時往下預看一點（看得到要落在哪）
  var tgt = player.y + (player.vy > 0 ? Math.min(player.vy * CAM_LOOK, 130) : 0);
  camY += (tgt - camY) * Math.min(1, dt*CAM_LERP);
  // 不越界：鏡頭跟角色的差不許超過 260
  camY = clamp(camY, player.y - 260, player.y + 260);
}

var last = 0, drawMs = 0, paused = false;
function loop(t){
  if(paused){ requestAnimationFrame(loop); last = t; return; }
  if(!last) last = t;
  var dt = Math.min((t - last)/1000, 0.05); last = t;
  update(dt);
  var t0 = performance.now();
  var saved = player.walkPhase;
  player.walkPhase = Math.floor(saved);   // 取整＝12fps 的階梯感
  render({});
  player.walkPhase = saved;
  drawMs = performance.now() - t0;
  requestAnimationFrame(loop);
}

resize();
player.x = 0; player.y = groundTop(0); player.stand = null; camX = 0; camY = player.y;
requestAnimationFrame(loop);

// ---------------------------------------------------------------- 判準探針
function lumOf(r,g,b){
  function f(c){ c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
  return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
}
function ratio(a,b){ var hi=Math.max(a,b), lo=Math.min(a,b); return (hi+0.05)/(lo+0.05); }

window.__probe = {
  pause:  function(){ paused = true; },
  resume: function(){ paused = false; },
  setCam: function(x){ camX = x; player.x = x; player.y = groundTop(x); player.stand = null; camY = player.y; player.state='idle'; render({}); },
  setState: function(s){ player.state = s; },

  // 判準①
  parallax: function(){
    var d = 1000, out = [];
    for(var i=0;i<4;i++) out.push(Math.abs(layerX(i, d) - layerX(i, 0)) / d);
    return { factors: PARALLAX.slice(), perCamUnit: out };
  },

  // 判準①-b：層1 與層2 的明度差（遠景必須明顯比中景淡）
  layerLuma: function(){
    var old = camX, oldY = camY; camX = 3000; camY = CAM_BASE_Y; _frozenNow = 1000;
    var y0 = 0, hh = Math.round((HORIZON + 100) * scale);
    render({ui:false});          var full = ctx.getImageData(0,y0,canvas.width,hh).data;
    render({far:false, ui:false});var noFar= ctx.getImageData(0,y0,canvas.width,hh).data;
    render({mid:false, ui:false});var noMid= ctx.getImageData(0,y0,canvas.width,hh).data;
    var fs=0,fn=0,ms=0,mn=0;
    for(var i=0;i<full.length;i+=4){
      var df = Math.abs(full[i]-noFar[i])+Math.abs(full[i+1]-noFar[i+1])+Math.abs(full[i+2]-noFar[i+2]);
      var dm = Math.abs(full[i]-noMid[i])+Math.abs(full[i+1]-noMid[i+1])+Math.abs(full[i+2]-noMid[i+2]);
      var L  = lumOf(full[i],full[i+1],full[i+2]);
      if(dm > 30){ ms += L; mn++; }          // 這個像素是層2 的（層2 蓋在層1 上，先判）
      else if(df > 30){ fs += L; fn++; }     // 這個像素是層1 的
    }
    _frozenNow = null; camX = old; camY = oldY;
    var Lf = fs/Math.max(fn,1), Lm = ms/Math.max(mn,1);
    return { farLuma: +Lf.toFixed(4), midLuma: +Lm.toFixed(4),
             farPx: fn, midPx: mn, contrast: +ratio(Lf,Lm).toFixed(2) };
  },

  // 判準（v3）②-a 可通行路線 ＋ ②-b 相機跟 Y 的位移曲線
  // 不是目測：真的跑 update() 迴圈，用一隻只會「往右走、看到上得去的平台就跳」的機器人。
  traverse: function(seconds){
    seconds = seconds || 30;
    var dt = 1/60, n = Math.round(seconds/dt);
    var oldPaused = paused; paused = true;
    player.x = 40; player.stand = null; player.onGround = false;
    player.vy = 0; player.y = groundTop(40) - 5; camX = player.x; camY = player.y;
    input.left = false; input.right = true; input.jump = false;

    var minY = 1e9, maxX = 0, camTrace = [], landed = 0, prevOn = true, hold = 0;
    for(var i=0;i<n;i++){
      // 機器人：站著的時候，前方 220 內有比現在高 30 以上的平台左緣 → 跳
      if(hold > 0){ hold -= dt; input.jump = true; }
      else {
        input.jump = false;
        if(player.onGround){
          var ps = platformsNear(player.x);
          for(var k=0;k<ps.length;k++){
            var d = ps[k].x - player.x;
            if(d > 0 && d < 150 && Math.min(ps[k].y0, ps[k].y1) < player.y - 30){
              input.jump = true; hold = 0.30; break;     // 按住 0.3 秒＝滿跳
            }
          }
        }
      }
      update(dt);
      if(player.onGround && !prevOn) landed++;
      prevOn = player.onGround;
      minY = Math.min(minY, player.y); maxX = Math.max(maxX, player.x);
      camTrace.push(camY);
    }
    // 抖 = 相機垂直速度在連續幀之間反向（而且幅度不是捨入誤差）。
    // 原本用二階差分，量到的是跳起來時相機真的在加速——那不是抖。
    var flips = 0, vPrev = 0;
    for(var j=1;j<camTrace.length;j++){
      var v = camTrace[j] - camTrace[j-1];
      if(vPrev !== 0 && v * vPrev < 0 && Math.abs(v) > 1 && Math.abs(vPrev) > 1) flips++;
      vPrev = v;
    }
    input.right = false; input.jump = false;
    var res = {
      reachedTopY: +minY.toFixed(1),
      targetTopY: TOP_OF_MODULE,
      reachedTop: minY <= TOP_OF_MODULE + 6,
      landings: landed,
      travelled: Math.round(maxX),
      camFlips: flips,
      camFlipShare: +(flips/camTrace.length).toFixed(4),
      frames: camTrace.length
    };
    paused = oldPaused;
    player.x = 0; player.y = groundTop(0); player.stand = null; camX = 0; camY = player.y;
    return res;
  },

  // 相機跟角色的垂直距離（跑同一段路，量 |camY - player.y|）
  camFollow: function(seconds){
    seconds = seconds || 30;
    var dt = 1/60, n = Math.round(seconds/dt);
    var oldPaused = paused; paused = true;
    player.x = 40; player.stand = null; player.onGround = false;
    player.vy = 0; player.y = groundTop(40) - 5; camX = player.x; camY = player.y;
    input.left = false; input.right = true;
    var maxGap = 0, offscreen = 0, hold = 0;
    for(var i=0;i<n;i++){
      if(hold > 0){ hold -= dt; input.jump = true; }
      else {
        input.jump = false;
        if(player.onGround){
          var ps = platformsNear(player.x);
          for(var k=0;k<ps.length;k++){
            var d = ps[k].x - player.x;
            if(d > 0 && d < 150 && Math.min(ps[k].y0, ps[k].y1) < player.y - 30){
              input.jump = true; hold = 0.30; break;
            }
          }
        }
      }
      update(dt);
      maxGap = Math.max(maxGap, Math.abs(camY - player.y));
      // 角色在畫面上的 y（層3 係數 1.0）
      var sy = player.y - (camY - CAM_BASE_Y);
      if(sy - CHAR_H < 0 || sy > viewH) offscreen++;
    }
    input.right = false; input.jump = false;
    paused = oldPaused;
    player.x = 0; player.y = groundTop(0); player.stand = null; camX = 0; camY = player.y;
    return { maxGap: +maxGap.toFixed(1), framesOffscreen: offscreen, frames: n };
  },

  palette: function(k){ setPalette(k); render({}); return palKey; },
  designValues: function(){ return { SPEED:SPEED, GRAV:GRAV, JUMP_V:JUMP_V,
    jumpHeight:+(JUMP_V*JUMP_V/(2*GRAV)).toFixed(1), JUMP_CUT:JUMP_CUT,
    COYOTE:COYOTE, JUMP_BUF:JUMP_BUF, CAM_LERP:CAM_LERP, CAM_LOOK:CAM_LOOK }; },

  // 跳到某個平台上拍照
  poseAt: function(px, py, state){
    camX = px; player.x = px; player.y = py; player.stand = null;
    camY = py; player.state = state || 'air'; player.vy = state==='air' ? -200 : 0;
    player.animT = 0.5; player.walkPhase = 3; _frozenNow = 1200;
    render({}); _frozenNow = null;
    return { x: px, y: py };
  },

  // 判準①-c：垂直視差——角色從最低跳到最高時，遠景不該跟著跑
  vertParallax: function(dy){
    dy = dy || 530;
    var out = [];
    for(var i=0;i<4;i++){
      var px = PARALLAX_Y[i] * dy;
      out.push({ layer: i+1, factorY: PARALLAX_Y[i],
                 shiftWorld: +px.toFixed(1),
                 shiftPctOfScreen: +(px / viewH * 100).toFixed(2) });
    }
    return { dy: dy, layers: out };
  },

  // 直接把相機擺到某個位置（給截圖比對用，不動角色的邏輯）
  cam: function(cx, cy){
    camX = cx; player.x = cx; player.stand = null;
    camY = cy; player.y = cy; player.state = 'idle'; player.animT = 0.5;
    _frozenNow = 1200; render({ui:false}); _frozenNow = null;
    return { camX: camX, camY: camY };
  },

  // 判準②
  contrast: function(samples){
    samples = samples || 24;
    var res = [];
    var oldCam = camX, oldX = player.x;
    for(var s=0;s<samples;s++){
      var cx = s * 617;            // 橫跨 ~14800 世界單位，掃過各種背景
      camX = cx; player.x = cx; player.y = groundTop(cx); player.stand = null; camY = player.y;
      player.state = 'idle'; player.animT = 0.4;
      _frozenNow = 1000;

      // 角色在畫面上的位置
      var cam = camX - viewW*0.38;
      var sx = (player.x + layerX(2, cam)) * scale;
      var sy = (player.y - (camY - CAM_BASE_Y)) * scale;
      var bx = Math.max(0, Math.round(sx - 70*scale));
      var by = Math.max(0, Math.round(sy - 200*scale));
      var bw = Math.min(canvas.width - bx,  Math.round(140*scale));
      var bh = Math.min(canvas.height - by, Math.round(215*scale));
      if(bw<=0||bh<=0) continue;

      render({player:false, fore:false, ui:false}); var bg   = ctx.getImageData(bx,by,bw,bh).data;
      render({player:true,  fore:false, ui:false}); var pf   = ctx.getImageData(bx,by,bw,bh).data;
      render({player:false, ui:false});             var bgF  = ctx.getImageData(bx,by,bw,bh).data;
      render({player:true,  ui:false});             var pv   = ctx.getImageData(bx,by,bw,bh).data;

      var ratios = [], full = 0, vis = 0, hFull = 0, hVis = 0;
      var headTop = Math.round((200 - 186) * scale), headBot = Math.round((200 - 126) * scale);
      for(var p=0;p<bg.length;p+=4){
        var row = Math.floor((p/4) / bw);
        var dif = Math.abs(pf[p]-bg[p]) + Math.abs(pf[p+1]-bg[p+1]) + Math.abs(pf[p+2]-bg[p+2]);
        if(dif < 40) continue;                 // 不是角色的像素
        full++;
        var isHead = (row >= headTop && row <= headBot);
        if(isHead) hFull++;
        // 看得見 = 「有角色有前景」跟「沒角色有前景」在這個像素上不一樣。
        // 跟前景與角色各自是什麼顏色無關。
        var dv = Math.abs(pv[p]-bgF[p]) + Math.abs(pv[p+1]-bgF[p+1]) + Math.abs(pv[p+2]-bgF[p+2]);
        if(dv >= 30){ vis++; if(isHead) hVis++; }
        var lc = lumOf(pf[p],pf[p+1],pf[p+2]);
        var lb = lumOf(bg[p],bg[p+1],bg[p+2]);
        ratios.push(ratio(lc,lb));
      }
      if(!ratios.length) continue;
      ratios.sort(function(a,b){return a-b;});
      res.push({
        camX: cx,
        px: full,
        median: +ratios[Math.floor(ratios.length/2)].toFixed(2),
        p10:    +ratios[Math.floor(ratios.length*0.1)].toFixed(2),
        occluded: +(1 - vis/full).toFixed(3),
        headOccluded: +(1 - hVis/Math.max(hFull,1)).toFixed(3)
      });
    }
    _frozenNow = null;
    camX = oldCam; player.x = oldX; player.y = groundTop(oldX);
    var meds = res.map(function(r){return r.median;});
    var occs = res.map(function(r){return r.occluded;});
    var heads = res.map(function(r){return r.headOccluded;});
    var heavy = occs.filter(function(v){return v > 0.25;}).length;
    return {
      samples: res,
      worstMedian: Math.min.apply(null, meds),
      medianOfMedians: meds.sort(function(a,b){return a-b;})[Math.floor(meds.length/2)],
      maxOcclusion: Math.max.apply(null, occs),
      maxHeadOcclusion: Math.max.apply(null, heads),
      heavyOcclusionShare: +(heavy/res.length).toFixed(3)
    };
  },

  // 判準③（真的量 rAF 幀時間；render() 自己回得很快是因為 canvas 把工作延後了）
  perfLive: function(frames){
    frames = frames || 180;
    return new Promise(function(resolve){
      paused = true;
      var times = [], prev = 0, n = 0, cx = 0;
      function step(t){
        cx += 6; camX = cx; player.x = cx; player.y = groundTop(cx); camY = player.y; camY = player.y;
        player.state = 'walk'; player.walkPhase = n % 8;
        render({});
        ctx.getImageData(0,0,1,1);           // 強迫把繪製工作做完，不讓它被延後
        if(prev) times.push(t - prev);
        prev = t; n++;
        if(n < frames + 5) requestAnimationFrame(step);
        else {
          times.sort(function(a,b){return a-b;});
          paused = false;
          resolve({
            frames: times.length,
            frameMedian: +times[Math.floor(times.length/2)].toFixed(2),
            frameP95:    +times[Math.floor(times.length*0.95)].toFixed(2),
            frameMax:    +times[times.length-1].toFixed(2),
            over16_7:    times.filter(function(v){return v > 16.7;}).length,
            canvas: canvas.width + 'x' + canvas.height
          });
        }
      }
      requestAnimationFrame(step);
    });
  },

  costs: function(){
    var cam = camX - viewW*0.38, out = {}, N = 40;
    function t(name, fn){ var a=performance.now(); for(var i=0;i<N;i++) fn(); ctx.getImageData(0,0,1,1);
      out[name] = +((performance.now()-a)/N).toFixed(2); }
    ctx.setTransform(scale,0,0,scale,0,0);
    t('sky',    function(){ drawSky(ctx); });
    t('far',    function(){ drawFar(ctx, cam); });
    t('mid',    function(){ drawMid(ctx, cam); });
    t('ground', function(){ drawGround(ctx, cam); });
    t('fore',   function(){ drawFore(ctx, cam); });
    t('player', function(){ drawPlayer(ctx); });
    return out;
  },

  perf: function(frames){
    frames = frames || 180;
    var times = [], t0, t1;
    var cx = 0;
    for(var i=0;i<frames;i++){
      cx += 6; camX = cx; player.x = cx; player.y = groundTop(cx); camY = player.y;
      player.state = 'walk'; player.walkPhase = i % 8;
      t0 = performance.now();
      render({});
      ctx.getImageData(0,0,1,1);
      t1 = performance.now();
      times.push(t1 - t0);
    }
    times.sort(function(a,b){return a-b;});
    return {
      frames: frames,
      drawMedian: +times[Math.floor(frames/2)].toFixed(2),
      drawP95:    +times[Math.floor(frames*0.95)].toFixed(2),
      drawMax:    +times[frames-1].toFixed(2),
      canvas: canvas.width + 'x' + canvas.height
    };
  },

  // 給截圖用：把相機放到某處、擺某個姿勢、畫一幀
  pose: function(cx, state, phase){
    camX = cx; player.x = cx; player.y = groundTop(cx); player.stand = null; camY = player.y;
    player.state = state || 'idle'; player.walkPhase = phase || 0;
    if(state === 'air'){ player.vy = -300; player.y -= 165; }   // 真的離地，不然只是站著擺姿勢
    player.animT = 0.5;
    _frozenNow = 1200;
    render({});
    _frozenNow = null;
    return { camX: cx, state: player.state };
  }
};
