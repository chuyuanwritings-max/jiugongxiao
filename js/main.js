// 洛书九宫 原型 0.3：旅程地图 + 15 关（照 Woodoku 旅程）、经典 3 分钟拼画、拖块、特效、结算、画册。规则全在 core.js，关卡在 levels.js。
const P = require('./platform.js');
const C = require('./config.js');
const core = require('./core.js');
const art = require('./art.js');
const LV = require('./levels.js');
const SG = require('./siege.js');
const PG = require('./petgame.js');
const PLV = require('./petlevels.js');
const LY = require('./layout.js');
const VERSION = '0.9.8'; // 0.9.1 游戏修改器的布局表：能拖的元素在哪

const COL = C.color;
const KEY = 'luoshu_save_v1';
const ITEMS = [
  { id: 'sparrow', name: '铜雀', tip: '消掉正中间的大格 +5 秒' },
  { id: 'crossbow', name: '连弩车', tip: '连击 3 射穿一行' },
  { id: 'turtle', name: '蒸汽龟', tip: '堆死时送单格' },
];

function freshSave() {
  return {
    wins: 0, won: [false, false, false], litEver: [0, 1, 2].map(() => new Array(9).fill(false)),
    coins: 0, best: 0, bestEndless: 0, items: {}, tutorialDone: false, buySingle: false, plays: 0,
    stage: 0, introSeen: {}, // 旅程：已经过了几关、哪些说明卡看过
    siegeDone: false, siegeBest: 0, // 守城：第一局（教学）打过没有、最多守住几波
    daily: null, // 每日一城：{ date, tries, extra, best, bestHit }
    // 0.5 九宫消 + 宠物：宠物章节过到第几关、有哪些宠物（等级、经验）、出战顺序、葫芦里几只怪、几颗丹
    petStage: 0, pets: {}, petOrder: [], gourd: 0, dan: 0, petSeen: {}, petTutDone: false,
    cutSeen: {}, // 0.6.1 过场：哪些看过（看过的第二次起播短版；「重新开始」也不清）
    siegeRuns: 0, relicSeen: {}, relicGot: {}, // 守城玩过几局；哪些机关见过发动、拿到过（第一次发动打一句说明、卡上标「新」）
  };
}
let save = Object.assign(freshSave(), P.load(KEY) || {});
if (!save.introSeen) save.introSeen = {};
if (!save.relicSeen) save.relicSeen = {};
if (!save.relicGot) save.relicGot = {};
if (!save.pets) save.pets = {};
if (!save.petOrder) save.petOrder = [];
if (!save.petSeen) save.petSeen = {};
const persist = () => P.save(KEY, save);

// ---------- 画布和布局 ----------
const scr = P.setup(onTouch);
let ctx = scr.ctx; // let：过场要借现成的画法（petIcon、inkMonster）画到离屏画布上，见 withCtx
const { width: W, height: H, dpr } = scr;
function withCtx(c2, fn) { const keep = ctx; ctx = c2; try { fn(); } finally { ctx = keep; } }
const L = {};
// 守城要在棋盘上面留一大块「战场」（车从上往下压向城墙），所以棋盘小一点、往下挪
function setLayout(kind) {
  const siege = kind === 'siege';
  const petsL = kind === 'pets';
  L.kind = kind;
  L.top = H > 760 ? 34 : 14;
  const head = siege ? 240 : petsL ? 156 : 86; // 棋盘上面留多高（宠物栏要一行）
  let B = Math.min(W - 20, Math.floor(H * (siege ? 0.43 : petsL ? 0.45 : 0.48)), 432);
  // 守城：上面战场 + 棋盘 + 托盘（至少 110）+ 底下 70，装不下就把棋盘再缩
  if (siege || petsL) B = Math.min(B, H - L.top - head - 22 - 110 - 70);
  L.cell = Math.floor(B / 9);
  L.board = L.cell * 9;
  L.bx = Math.round((W - L.board) / 2);
  L.by = L.top + head;
  // 底下原来留 96 给墨非小人，现在只留 64（「换一组」按钮 + 手机底部横条）
  const FOOT = 64;
  L.trayH = Math.max(110, Math.min(L.cell * 4, H - (L.by + L.board + 22) - FOOT));
  // 屏幕高出来的部分：整体往下挪一点，手指够得着
  const slack = H - (L.by + L.board + 22 + L.trayH + FOOT);
  if (slack > 0) { const sh = Math.round(slack * (siege ? 0.3 : 0.45)); L.top += sh; L.by += sh; }
  L.trayY = L.by + L.board + 22;
  L.mini = Math.max(20, Math.round(L.cell * 0.82)); // 底下三块的格子大小
  L.lift = Math.round(L.cell * 2.1); // 拖起来浮在手指上方多高
  L.footY = L.trayY + L.trayH + 8;
}
setLayout('normal');

// 每张画一张小画布
const paintCanvas = [0, 1, 2].map((i) => art.render(i, P.makeCanvas(art.SIZE, art.SIZE)));
const paintSize = [0, 1, 2].map(() => art.SIZE); // 每张画的原图边长（代码画 72，正式插画是图片的宽）
const paintSmooth = [false, false, false]; // 代码画保留像素颗粒；正式插画要平滑缩放
(C.paintImages || []).forEach((name, i) => {
  if (!name || i > 2) return;
  P.loadImage('images/' + name, (img) => {
    paintCanvas[i] = img;
    paintSize[i] = img.width;
    paintSmooth[i] = true;
  });
});
// Midjourney 正式图：主菜单主视觉、宠物头像（读到了就用，读不到就用代码画的）
let homeArtImg = null, homeArtCache = null;
const petArtImg = {};
if (C.homeArt) P.loadImage('images/' + C.homeArt, (img) => { homeArtImg = img; });
Object.keys(C.petArt || {}).forEach((id) => { if (C.petArt[id]) P.loadImage('images/' + C.petArt[id], (img) => { petArtImg[id] = img; }); });
// 块的颜色：棋盘上每格记住放下时的颜色
const colorAt = new Array(81).fill(0);
function handColor(i) {
  if (g && g.pets) return g.handColor[i];
  const n = C.blockColors.length;
  return ((g.deals || 0) * 3 + i * 2 + (g.seedColor || 0)) % n;
}

// ---------- 状态 ----------
let g = null; // 这一局
let paintIdx = 0;
let mode = 'play'; // play / over / album / ad
let overAt = 0; // 结束的时刻（结算页晚一点出来）
// ---------- 过场（0.6.1，js/cuts.js）：每章开场 F 运镜大图、新宠物 B 登场、进化 / 过章 C 短版 ----------
let CUT = null, cutPrev = 'play';
let startCard = null; // 进关前的关卡卡片：{ t, i, forced, from, next }
function playCuts() {
  if (!CUT.pending || mode === 'cut') return;
  cutPrev = mode; mode = 'cut'; CUT.start();
}
function endCuts() { mode = cutPrev; if (mode === 'over') overAt = clock; } // 回到结算页：「过关！」和经验条从头演
let result = null; // 结算信息
let drag = null; // { slot, x, y, id }
let downBtn = null;
let buttons = [];
let t0 = P.now();
let last = t0;
let clock = 0; // 秒，画面用
let stopUntil = 0; // 顿帧
let shake = 0;
let fx = []; // 特效粒子
let texts = []; // 跳字
let clearing = []; // 正在碎掉的块 { k, t }
let popping = []; // 刚放下的块 { k, t }
let litAnim = []; // 城区点亮 { b, t }
let bolts = []; // 连弩 { row, t }
let rings = []; // 洛书光阵 { t, big }
let flash = 0;
let displayScore = 0;
let lastTick = -1;
let ad = null; // { until, done }
let tutorialT = 0;
let mofei = { jump: 0, say: '', sayT: 0 };
let coinsGot = 0;
let stageIdx = -1; // 旅程第几关（0 起）；-1 = 经典拼画
let flyers = []; // 收走的宝石 / 匣 / 泡泡飞向顶上的计数 { what, x, y, t }
let chipPos = {}; // 顶上每个计数的位置（每帧画的时候记下）
let chipPop = {}; // 计数收到东西时弹一下
let introKind = null; // 正在看的说明卡

function newGame(endless) {
  const single = !endless && save.buySingle && save.coins >= C.singleCost;
  if (single) { save.coins -= C.singleCost; save.buySingle = false; }
  paintIdx = save.wins % art.COUNT;
  g = core.createGame({
    level: endless ? 2 : Math.min(save.wins, 4), endless, seed: (P.now() ^ (save.plays * 2654435761)) >>> 0,
    items: save.items, single, tutorial: !save.tutorialDone,
  });
  stageIdx = -1;
  startCommon();
}
// 旅程第 i 关
function newStage(i) {
  stageIdx = Math.max(0, Math.min(LV.length - 1, i));
  const st = LV[stageIdx];
  g = core.createGame({
    stage: st, seed: (P.now() ^ (save.plays * 2654435761)) >>> 0,
    tutorial: stageIdx === 0 && !save.tutorialDone,
  });
  startCommon();
  // 预放的块是旧木色
  for (let k = 0; k < 81; k++) if (g.board[k] === 1) colorAt[k] = -1;
  if (st.intro && !save.introSeen[st.intro]) { introKind = st.intro; mode = 'intro'; }
}
function startCommon() {
  setLayout(g && g.siege ? 'siege' : g && g.pets && g.team.length ? 'pets' : 'normal'); // 没带宠物的关不留宠物栏
  g.seedColor = save.plays % 7;
  colorAt.fill(0);
  save.plays++;
  persist();
  mode = 'play';
  introKind = null; flyers = []; chipPop = {};
  result = null; drag = null; fx = []; texts = []; clearing = []; popping = []; litAnim = []; bolts = []; rings = [];
  displayScore = 0; flash = 0; lastTick = -1; tutorialT = 0; coinsGot = 0;
  mofei = { jump: 0, say: '', sayT: 0 };
  stats.starts.push(P.now());
}
const stats = { starts: [], overs: [] };

// ---------- 小工具 ----------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
// 字（0.8）：默认不描边、字号收到 5 档（Fable UI 对照第一处：「每个字都描黑边」是看着脏的头号原因）。
// 只有画在棋盘 / 图上面的字才描：stroke = true，或者 30 号以上的大字（「过关！」这类）
const TH = C.theme;
const snapSize = (n) => TH.sizes.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
function text(s, x, y, size, col, align, weight, stroke) {
  const big = size >= 30, edge = stroke === undefined ? big : stroke;
  const sz = edge || big ? size : snapSize(size);
  ctx.font = (weight || 'bold') + ' ' + sz + 'px "PingFang SC", "Hiragino Sans GB", sans-serif';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  if (edge) { ctx.lineWidth = Math.max(3, sz / 5); ctx.strokeStyle = COL.ink; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col;
  ctx.fillText(s, x, y);
}
// 面板（0.8）：一层卡片色 + 1 像素细线，圆角 20。去掉黑底影和里面那圈黄铜线（双层框是老页游的样子）
function panel(x, y, w, h, on) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(x, y + 3, w, h, TH.rCard); ctx.fill();
  ctx.fillStyle = on ? TH.cardOn : TH.card; rr(x, y, w, h, TH.rCard); ctx.fill();
  ctx.strokeStyle = on ? TH.jade : TH.line; ctx.lineWidth = on ? 2 : 1; rr(x + 0.5, y + 0.5, w - 1, h - 1, TH.rCard); ctx.stroke();
}
// 按钮（0.8）只有三种（Fable UI 对照第二处），每屏最多一个金色的：
//   main 主按钮：黄铜实心 + 底下 3 像素厚边，墨色字，不描边（没写 bg 的默认是它）；
//   sub 次按钮：卡片色 + 细线（写了 bg 的、或 kind:'sub'）；hot:true 时细线换黄铜（有事可做）；
//   link 字按钮：只有字和「‹ / ›」（返回类，标签以「‹」开头的自动是它）。
// 按下：整个缩到 97%，盖一层 8% 的黑
function button(id, x, y, w, h, label, opt) {
  const o = opt || {};
  const kind = o.kind || (String(label).startsWith('‹') ? 'link' : o.bg ? 'sub' : 'main');
  const pressed = downBtn === id;
  ctx.save();
  if (pressed) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.97, 0.97); ctx.translate(-x - w / 2, -y - h / 2); }
  const r = Math.min(TH.rBtn, h / 2);
  if (kind === 'main') {
    ctx.fillStyle = TH.brassEdge; rr(x, y + 3, w, h, r); ctx.fill();
    ctx.fillStyle = o.danger ? TH.red : TH.brass; rr(x, y, w, h, r); ctx.fill();
    text(label, x + w / 2, y + h / 2 + 1, o.size || 20, o.danger ? COL.text : TH.onBrass);
  } else if (kind === 'sub') {
    ctx.fillStyle = TH.card; rr(x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = o.hot ? TH.brass : o.danger ? TH.red : TH.line; ctx.lineWidth = o.hot || o.danger ? 2 : 1; rr(x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
    text(label, x + w / 2, y + h / 2 + 1, Math.min(o.size || 16, 20), o.danger ? '#f08a70' : o.fg || COL.text);
  } else {
    text(label, x + (String(label).startsWith('‹') ? 4 : w / 2), y + h / 2, 16, COL.dim, String(label).startsWith('‹') ? 'left' : 'center');
  }
  if (pressed) { ctx.fillStyle = 'rgba(0,0,0,0.08)'; rr(x, y, w, h, r); ctx.fill(); }
  if (o.dot) { ctx.fillStyle = TH.red; ctx.beginPath(); ctx.arc(x + w - 6, y + 6, 6, 0, Math.PI * 2); ctx.fill(); }
  if (o.ad) {
    // 小电视图标 = 广告
    const ix = x + w - 22, iy = y + 6;
    ctx.fillStyle = COL.red; rr(ix, iy, 16, 12, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(ix + 6, iy + 3); ctx.lineTo(ix + 12, iy + 6); ctx.lineTo(ix + 6, iy + 9); ctx.fill();
  }
  ctx.restore();
  buttons.push({ id, x, y, w, h, fn: o.fn, label: String(label) });
}
function gearIcon(x, y, r, a, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = col;
  for (let k = 0; k < 8; k++) {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-r * 0.22, -r * 1.25, r * 0.44, r * 0.5);
  }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COL.ink;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// 机关块：宝石色铜块。ci = 颜色序号；lit = 要被消掉时发亮
function block(x, y, s, alpha, ci, lit) {
  // 祝有好收获的黄铜画法：细深褐线 + 平涂 + 一块硬边阴影 + 一道白黄硬高光 + 两颗细线铆钉
  const k = ci === -2 ? ['#2a2236', '#4a3f5c', '#120e18'] : ci < 0 ? C.prefillColor : C.blockColors[ci || 0]; // -2 墨块（大墨怪吐的）
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  const rad = Math.max(2, s * 0.12);
  ctx.fillStyle = COL.ink;
  rr(x + 0.5, y + 0.5, s - 1, s - 1, rad);
  ctx.fill();
  const m = Math.max(1.5, s * 0.06); // 线宽
  ctx.fillStyle = lit ? k[1] : k[0];
  rr(x + m, y + m, s - m * 2, s - m * 2, rad * 0.8);
  ctx.fill();
  // 硬阴影：右下一块 L 形
  const e = s * 0.2;
  ctx.fillStyle = lit ? k[0] : k[2];
  ctx.beginPath();
  ctx.moveTo(x + s - m, y + m + rad * 0.6);
  ctx.lineTo(x + s - m, y + s - m - rad * 0.6);
  ctx.quadraticCurveTo(x + s - m, y + s - m, x + s - m - rad * 0.6, y + s - m);
  ctx.lineTo(x + m + rad * 0.6, y + s - m);
  ctx.lineTo(x + m + e * 0.6, y + s - m - e * 0.8);
  ctx.lineTo(x + s - m - e * 0.8, y + s - m - e * 0.8);
  ctx.lineTo(x + s - m - e * 0.8, y + m + e * 0.6);
  ctx.closePath();
  ctx.fill();
  // 一道白黄硬高光（左上斜一条）
  if (s > 12) {
    ctx.fillStyle = lit ? '#fffbe8' : 'rgba(255,246,214,0.85)';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.2, y + s * 0.18);
    ctx.lineTo(x + s * 0.62, y + s * 0.18);
    ctx.lineTo(x + s * 0.56, y + s * 0.27);
    ctx.lineTo(x + s * 0.2, y + s * 0.27);
    ctx.closePath();
    ctx.fill();
  }
  // 细线铆钉：右上、左下各一颗
  if (s > 18) {
    const rv = Math.max(1.2, s * 0.055);
    for (const [px, py] of [[0.76, 0.24], [0.24, 0.72]]) {
      ctx.fillStyle = k[2];
      ctx.beginPath(); ctx.arc(x + s * px, y + s * py, rv + 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = k[1];
      ctx.beginPath(); ctx.arc(x + s * px - rv * 0.3, y + s * py - rv * 0.3, rv * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
// 宝石：八角形切面，主色 + 亮面 + 一点白光
function gem(x, y, s, kind, alpha) {
  const col = C.gemColors[kind];
  if (!col) return;
  const cx = x + s / 2, cy = y + s / 2, r = s * 0.36;
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.fillStyle = COL.ink;
  ctx.beginPath();
  for (let n = 0; n < 8; n++) { const a = Math.PI / 8 + (n * Math.PI) / 4; ctx.lineTo(cx + Math.cos(a) * (r + 1.5), cy + Math.sin(a) * (r + 1.5)); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = col[0];
  ctx.beginPath();
  for (let n = 0; n < 8; n++) { const a = Math.PI / 8 + (n * Math.PI) / 4; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = col[1];
  ctx.beginPath(); ctx.moveTo(cx - r * 0.55, cy - r * 0.15); ctx.lineTo(cx, cy - r * 0.7); ctx.lineTo(cx + r * 0.55, cy - r * 0.15); ctx.lineTo(cx, cy + r * 0.1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(cx - r * 0.42, cy - r * 0.42, Math.max(2, r * 0.22), Math.max(2, r * 0.22));
  ctx.globalAlpha = 1;
}
// 机关匣：朱红铜箱，两道黄铜箍，中间锁眼（照 Woodoku 的信箱，换成我们的机关城）
function chest(x, y, s) {
  const m = s * 0.08;
  ctx.fillStyle = COL.ink; rr(x + m, y + m, s - m * 2, s - m * 2, s * 0.12); ctx.fill();
  ctx.fillStyle = '#b8322a'; rr(x + m + 1.5, y + m + 1.5, s - m * 2 - 3, s - m * 2 - 3, s * 0.1); ctx.fill();
  ctx.fillStyle = '#e2553b'; ctx.fillRect(x + m + 3, y + m + 3, s - m * 2 - 6, s * 0.18);
  ctx.fillStyle = COL.brass;
  ctx.fillRect(x + s * 0.28, y + m + 1.5, s * 0.1, s - m * 2 - 3);
  ctx.fillRect(x + s * 0.62, y + m + 1.5, s * 0.1, s - m * 2 - 3);
  ctx.fillStyle = COL.brassLight; ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.52, s * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COL.ink; ctx.fillRect(x + s / 2 - 1, y + s * 0.5, 2, s * 0.12);
}
// 泡泡：半透明的圆，压在格子上面
function bubbleAt(x, y, s, alpha) {
  const cx = x + s / 2, cy = y + s / 2, r = s * 0.4;
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.fillStyle = 'rgba(120,200,255,0.3)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(220,245,255,0.85)'; ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(cx - r * 0.38, cy - r * 0.38, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}
// 目标图标：宝石 / 匣 / 泡泡
function goalIcon(key, cx, cy, s) {
  const x = cx - s / 2, y = cy - s / 2;
  if (core.GEM_OF[key]) gem(x - s * 0.15, y - s * 0.15, s * 1.3, core.GEM_OF[key]);
  else if (key === 'box') chest(x, y, s);
  else if (key === 'bubble') bubbleAt(x - s * 0.1, y - s * 0.1, s * 1.2);
  else if (key === 'monster' || key === 'all') inkMonster(cx, cy, s * 0.55, false);
  else if (key === 'rock') ironRock(x, y, s);
  else if (key === 'acts') { const id = (g && g.team && g.team[0] && g.team[0].id) || save.activePet || 'tongque'; petIcon(id, cx, cy, s * 1.1, 0, 0); }
  else if (key === 'boss') inkMonster(cx, cy, s * 0.75, true);
  else if (key === 'evolve') {
    // 九格小方阵：亮了几格
    const q = s / 3.2;
    for (let n = 0; n < 9; n++) { ctx.fillStyle = g && g.evLit && n < g.evLit.size ? COL.brassLight : COL.woodLine; ctx.fillRect(x + (n % 3) * q * 1.08, y + Math.floor(n / 3) * q * 1.08, q * 0.9, q * 0.9); }
  }
}
// 小骷髅（超难关）
function skullIcon(x, y, r) {
  ctx.fillStyle = '#efe6d2'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - r * 0.55, y + r * 0.4, r * 1.1, r * 0.7);
  ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(x - r * 0.38, y, r * 0.28, 0, Math.PI * 2); ctx.arc(x + r * 0.38, y, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - 1, y + r * 0.7, 2, r * 0.4);
}
// ---------- 墨怪一家（0.7）：每种长得不一样，一眼看出它是谁、还剩几层甲、要干嘛 ----------
const STEEL = ['#c3c8d4', '#9aa0b0', '#6e7484'];
function blob(cx, cy, r, fill, shade, hi) {
  const wob = Math.sin(clock * 5 + cx) * r * 0.06;
  ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(cx, cy + wob, r * 1.05, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(cx, cy + wob, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(cx - r * 0.06, cy - r * 0.06 + wob, r * 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(cx - r * 0.32, cy - r * 0.38 + wob, r * 0.25, 0, Math.PI * 2); ctx.fill();
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + sx * r * 0.35, cy - r * 0.05 + wob, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(cx + sx * r * 0.35, cy + wob, r * 0.1, 0, Math.PI * 2); ctx.fill();
  }
}
// m：墨怪状态（没有就当小墨怪）；k：它在哪格（-1 = 说明卡上的示意）
// 墨怪外面再加两样（0.9.8 怪和宠物 PK）：瞪着宠物时头上冒紫闪电（下一手要喷墨偷能量）；被不克它的技能块打到，一圈灰光挡住、抖一下
function drawMon(m, k, cx, cy, r) {
  const missAge = k >= 0 && petFx.petMiss && petFx.petMiss[k] !== undefined ? clock - petFx.petMiss[k] : 9;
  const sh = missAge < 0.35 ? Math.sin(clock * 70) * 3 : 0;
  drawMonBody(m, k, cx + sh, cy, r);
  if (missAge < 0.5) { ctx.strokeStyle = 'rgba(190,195,210,' + (1 - missAge * 2) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r * (1.05 + missAge * 0.6), 0, Math.PI * 2); ctx.stroke(); }
  if (k >= 0 && m && m.tgt === -1 && PG.RULES.pester[m.t]) {
    const bx = cx + r * 0.55, by = cy - r * 1.05, s2 = r * (0.5 + Math.abs(Math.sin(clock * 9)) * 0.12);
    ctx.fillStyle = '#c58ae0'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx + s2 * 0.2, by - s2); ctx.lineTo(bx - s2 * 0.45, by + s2 * 0.1); ctx.lineTo(bx, by + s2 * 0.1); ctx.lineTo(bx - s2 * 0.2, by + s2); ctx.lineTo(bx + s2 * 0.45, by - s2 * 0.1); ctx.lineTo(bx, by - s2 * 0.1); ctx.closePath(); ctx.stroke(); ctx.fill();
  }
}
function drawMonBody(m, k, cx, cy, r) {
  const t = m ? m.t : 'ink';
  const since = (tab) => (petFx[tab] && petFx[tab][k] !== undefined ? clock - petFx[tab][k] : 9);
  if (t === 'shell') {
    // 甲壳怪：身上套几圈铁甲；刚掉一层时整只一抖
    const hitAge = since('shellHit'), sh = hitAge < 0.25 ? Math.sin(clock * 80) * 3 : 0;
    // 碎甲（Cc 11-25：「破甲没有碎甲的效果，我需要一个」）：被打中的 0.35 秒里，一圈白光炸开 + 几道裂纹
    if (hitAge < 0.35) {
      const a = hitAge / 0.35;
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - a) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r * (0.9 + a * 0.9), 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(232,236,244,' + (1 - a) + ')'; ctx.lineWidth = 2;
      for (let n = 0; n < 5; n++) { const ang = n * 1.26 + 0.3; ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r * 0.5, cy + Math.sin(ang) * r * 0.5); ctx.lineTo(cx + Math.cos(ang + 0.2) * r * (1.1 + a * 0.5), cy + Math.sin(ang + 0.2) * r * (1.1 + a * 0.5)); ctx.stroke(); }
    }
    // 甲越厚身子缩得越小；每层甲是一圈粗铁箍（黑边 + 钢色 + 铆钉），从外往里一层层掉
    const body = m.hp ? r * 0.66 : r, oy = cy + r * 0.06;
    inkMonster(cx + sh, oy, body, false);
    for (let i = 0; i < m.hp; i++) {
      const rr2 = r * (0.8 + i * 0.22), w = r * 0.2, a0 = Math.PI * 0.82, a1 = Math.PI * 2.18;
      ctx.lineCap = 'round';
      ctx.strokeStyle = COL.ink; ctx.lineWidth = w + 3; ctx.beginPath(); ctx.arc(cx + sh, oy, rr2, a0, a1); ctx.stroke();
      ctx.strokeStyle = STEEL[i % 3]; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx + sh, oy, rr2, a0, a1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = w * 0.25; ctx.beginPath(); ctx.arc(cx + sh, oy, rr2 + w * 0.2, Math.PI * 1.15, Math.PI * 1.6); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#3a3f4a';
      for (const ang of [Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75]) ctx.fillRect(cx + sh + Math.cos(ang) * rr2 - 1.5, oy + Math.sin(ang) * rr2 - 1.5, 3, 3); // 铆钉
    }
    return;
  }
  if (t === 'jump') return jumperMonster(cx, cy, r, g && g.jumpPlan && g.jumpPlan[k] !== undefined ? g.jumpPlan[k] : null, Math.max(0, k));
  if (t === 'color') {
    // 挑色怪：整只是那种颜色；颜色不对被打到时晃一下
    const col = C.blockColors[m.col], sh = since('colorMiss') < 0.35 ? Math.sin(clock * 60) * 4 : 0;
    blob(cx + sh, cy, r, col[0], col[2], col[1]);
    return;
  }
  if (t === 'bomb') {
    // 炸弹怪：圆炸弹身子、引信冒火星，肚子上写还剩几手；3 以下变红、跳
    const warn = m.cd <= 3, pulse = warn ? 1 + Math.abs(Math.sin(clock * 8)) * 0.08 : 1;
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(cx, cy + 2, r * 1.02 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2632'; ctx.beginPath(); ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a4458'; ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c9a050'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + r * 0.5, cy - r * 0.75); ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 1.2, cx + r * 0.7, cy - r * 1.35); ctx.stroke();
    if (Math.sin(clock * 20) > -0.3) { ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(cx + r * 0.7, cy - r * 1.35, r * 0.16, 0, Math.PI * 2); ctx.fill(); }
    text(String(m.cd), cx, cy + 2, Math.round(r * 1.15 * pulse), warn ? '#ff6a50' : COL.text);
    return;
  }
  inkMonster(cx, cy, r, false);
  if (t === 'eat') {
    // 馋嘴怪：一张带牙的大嘴；要啃的时候张大
    const open = m.tgt !== null && m.tgt !== undefined, mh = open ? r * (0.32 + Math.abs(Math.sin(clock * 9)) * 0.12) : r * 0.16;
    ctx.fillStyle = '#5a1f2a'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.42, r * 0.5, mh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let n = 0; n < 4; n++) { const tx = cx - r * 0.36 + n * r * 0.24; ctx.beginPath(); ctx.moveTo(tx - r * 0.09, cy + r * 0.42 - mh); ctx.lineTo(tx + r * 0.09, cy + r * 0.42 - mh); ctx.lineTo(tx, cy + r * 0.42 - mh + r * 0.16); ctx.fill(); }
  } else if (t === 'moss') {
    // 墨苔怪：头顶长着几簇墨绿的苔
    ctx.fillStyle = '#2f7a4c';
    for (const [dx, dy, rr2] of [[-0.45, -0.75, 0.22], [0, -0.92, 0.26], [0.45, -0.75, 0.22]]) { ctx.beginPath(); ctx.arc(cx + dx * r, cy + dy * r, rr2 * r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#5fb07a'; ctx.beginPath(); ctx.arc(cx - r * 0.05, cy - r * 0.98, r * 0.1, 0, Math.PI * 2); ctx.fill();
  } else if (t === 'split') {
    // 分身怪：身上一道歪歪扭扭的缝，像随时会裂成两半
    ctx.strokeStyle = '#8a7fa8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.95);
    for (let n = 1; n <= 5; n++) ctx.lineTo(cx + (n % 2 ? r * 0.12 : -r * 0.12), cy - r * 0.95 + n * r * 0.38);
    ctx.stroke();
  }
}
// 头目的打扮：大馋嘴一张大嘴、分身王一顶歪王冠
function bossDress(kind, cx, cy, r) {
  if (kind === 'eat') {
    const chew = g && g.boss && g.boss.stun, plan = g && g.boss && g.boss.eatPlan, mh = plan ? r * (0.3 + Math.abs(Math.sin(clock * 9)) * 0.1) : chew ? r * (0.08 + Math.abs(Math.sin(clock * 14)) * 0.1) : r * 0.14;
    ctx.fillStyle = '#5a1f2a'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.45, r * 0.55, mh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let n = 0; n < 5; n++) { const tx = cx - r * 0.4 + n * r * 0.2; ctx.beginPath(); ctx.moveTo(tx - r * 0.07, cy + r * 0.45 - mh); ctx.lineTo(tx + r * 0.07, cy + r * 0.45 - mh); ctx.lineTo(tx, cy + r * 0.45 - mh + r * 0.13); ctx.fill(); }
  } else if (kind === 'split') {
    ctx.fillStyle = COL.brassLight; ctx.beginPath(); const y0 = cy - r * 0.95;
    ctx.moveTo(cx - r * 0.4, y0); ctx.lineTo(cx - r * 0.45, y0 - r * 0.35); ctx.lineTo(cx - r * 0.2, y0 - r * 0.15); ctx.lineTo(cx, y0 - r * 0.42); ctx.lineTo(cx + r * 0.2, y0 - r * 0.15); ctx.lineTo(cx + r * 0.45, y0 - r * 0.35); ctx.lineTo(cx + r * 0.4, y0); ctx.fill();
    ctx.strokeStyle = '#8a7fa8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.6); ctx.lineTo(cx + r * 0.1, cy - r * 0.2); ctx.lineTo(cx - r * 0.08, cy + r * 0.2); ctx.lineTo(cx + r * 0.05, cy + r * 0.6); ctx.stroke();
  }
}
// 墨怪下一手要动手的地方：牙印（馋嘴要啃的块）、黑泡（墨苔要长墨的空格）、红圈（炸弹快爆了，会溅到哪）
function drawMonHints() {
  const bite = (k) => {
    const x = cellX(k % 9), y = cellY(Math.floor(k / 9)), s = L.cell, a = 0.55 + Math.sin(clock * 10) * 0.35;
    ctx.fillStyle = 'rgba(18,14,24,' + a + ')';
    for (let n = 0; n < 3; n++) { ctx.beginPath(); ctx.arc(x + s * (0.25 + n * 0.25), y + 2, s * 0.13, 0, Math.PI); ctx.fill(); }
    ctx.strokeStyle = 'rgba(226,85,59,' + a + ')'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
  };
  const bubbles = (k) => { const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2; for (let n = 0; n < 3; n++) { const a = (clock * 1.5 + n / 3) % 1; ctx.globalAlpha = 1 - a; ctx.fillStyle = '#2f5a3c'; ctx.beginPath(); ctx.arc(x + (n - 1) * 8, y + 8 - a * 18, 4 + a * 5, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; };
  g.mon.forEach((m, k) => {
    if (!m || g.board[k] !== 3) return;
    if (m.t === 'eat' && m.tgt !== null) bite(m.tgt);
    if (m.t === 'moss' && m.tgt !== null) bubbles(m.tgt);
    if (m.t === 'bomb' && m.cd <= 2) {
      ctx.strokeStyle = 'rgba(255,106,80,' + (0.4 + Math.sin(clock * 12) * 0.3) + ')'; ctx.lineWidth = 3;
      const r0 = Math.floor(k / 9), c0 = k % 9, x0 = cellX(Math.max(0, c0 - 1)), y0 = cellY(Math.max(0, r0 - 1));
      ctx.strokeRect(x0 + 2, y0 + 2, cellX(Math.min(8, c0 + 1)) + L.cell - x0 - 4, cellY(Math.min(8, r0 + 1)) + L.cell - y0 - 4);
    }
  });
  if (g.boss && g.boss.eatPlan) g.boss.eatPlan.forEach(bite);
}
// 铁甲怪：小墨怪扣着一口铁锅；锅被弹一下时往上跳
function armorMonster(cx, cy, r, bounce) {
  inkMonster(cx, cy + r * 0.15, r * 0.9, false);
  const by = cy - r * 0.35 - bounce * 40;
  ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.ellipse(cx, by, r * 1.05, r * 0.6, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#6a7080'; ctx.beginPath(); ctx.ellipse(cx, by, r * 0.95, r * 0.52, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#9aa0b0'; ctx.fillRect(cx - r * 0.5, by - r * 0.4, r * 0.3, r * 0.1);
  ctx.fillStyle = COL.ink; ctx.fillRect(cx - r * 1.1, by - 2, r * 2.2, 4);
}
// 跳跳怪：脚下一根弹簧；下一手要跳的话，朝那边探头（一根小箭头）
function jumperMonster(cx, cy, r, to, k) {
  const hop = Math.abs(Math.sin(clock * 6 + k)) * 4;
  ctx.strokeStyle = '#c9a050'; ctx.lineWidth = 2; ctx.beginPath();
  for (let n = 0; n <= 4; n++) ctx.lineTo(cx + (n % 2 ? 5 : -5), cy + r * 0.6 + n * 2.5);
  ctx.stroke();
  inkMonster(cx, cy - hop, r * 0.85, false);
  if (to !== null) {
    const tx = cellX(to % 9) + L.cell / 2, ty = cellY(Math.floor(to / 9)) + L.cell / 2;
    const a = Math.atan2(ty - cy, tx - cx);
    ctx.fillStyle = 'rgba(243,210,122,' + (0.6 + Math.sin(clock * 10) * 0.3) + ')';
    ctx.save(); ctx.translate(cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r * 1.4); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, -6); ctx.lineTo(-4, 6); ctx.fill(); ctx.restore();
  }
}
// 红心（大墨怪还要打几下）；碎了的画成灰的
function heart(x, y, r, full) {
  ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(x - r * 0.5, y, r * 0.62, 0, Math.PI * 2); ctx.arc(x + r * 0.5, y, r * 0.62, 0, Math.PI * 2); ctx.moveTo(x - r * 1.1, y + r * 0.1); ctx.lineTo(x, y + r * 1.25); ctx.lineTo(x + r * 1.1, y + r * 0.1); ctx.fill();
  ctx.fillStyle = full ? COL.red : COL.woodLine; ctx.beginPath(); ctx.arc(x - r * 0.5, y, r * 0.5, 0, Math.PI * 2); ctx.arc(x + r * 0.5, y, r * 0.5, 0, Math.PI * 2); ctx.moveTo(x - r * 0.98, y + r * 0.12); ctx.lineTo(x, y + r * 1.08); ctx.lineTo(x + r * 0.98, y + r * 0.12); ctx.fill();
}
// 铁石：黑铁色的方石，几道裂纹，铆钉；只有宠物打得碎
function ironRock(x, y, s) {
  ctx.fillStyle = COL.ink; rr(x + 1, y + 1, s - 2, s - 2, s * 0.12); ctx.fill();
  ctx.fillStyle = '#4a4f5c'; rr(x + s * 0.07, y + s * 0.07, s * 0.86, s * 0.86, s * 0.1); ctx.fill();
  ctx.fillStyle = '#373b46'; ctx.fillRect(x + s * 0.12, y + s * 0.62, s * 0.76, s * 0.24);
  ctx.strokeStyle = '#1f222a'; ctx.lineWidth = Math.max(1.5, s * 0.04);
  ctx.beginPath(); ctx.moveTo(x + s * 0.3, y + s * 0.15); ctx.lineTo(x + s * 0.42, y + s * 0.42); ctx.lineTo(x + s * 0.32, y + s * 0.6); ctx.moveTo(x + s * 0.42, y + s * 0.42); ctx.lineTo(x + s * 0.7, y + s * 0.5); ctx.stroke();
  ctx.fillStyle = '#8a90a0'; for (const [px, py] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) { ctx.beginPath(); ctx.arc(x + s * px, y + s * py, s * 0.05, 0, Math.PI * 2); ctx.fill(); }
}
// 小墨怪：一团墨，两只白眼睛（大墨怪多一对角）
function inkMonster(cx, cy, r, big) {
  const wob = Math.sin(clock * 5 + cx) * r * 0.06;
  ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(cx, cy + wob, r * 1.05, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2236'; ctx.beginPath(); ctx.arc(cx, cy + wob, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3b3150'; ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.35 + wob, r * 0.35, 0, Math.PI * 2); ctx.fill();
  if (big) { ctx.fillStyle = COL.red; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sx * r * 0.5, cy - r * 0.7); ctx.lineTo(cx + sx * r * 0.8, cy - r * 1.3); ctx.lineTo(cx + sx * r * 0.2, cy - r * 0.85); ctx.fill(); } }
  const blink = Math.sin(clock * 1.3 + cx * 0.1) > 0.97;
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse ? ctx.ellipse(cx + sx * r * 0.35, cy - r * 0.05 + wob, r * 0.2, blink ? r * 0.04 : r * 0.24, 0, 0, Math.PI * 2) : ctx.arc(cx + sx * r * 0.35, cy + wob, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.ink; if (!blink) { ctx.beginPath(); ctx.arc(cx + sx * r * 0.35, cy + wob, r * 0.1, 0, Math.PI * 2); ctx.fill(); }
  }
}
const cellX = (c) => L.bx + c * L.cell;
const cellY = (r) => L.by + r * L.cell;

// ---------- 拖块 ----------
// 0.9.8：有宠物的关，托盘右边多一格「宠物格」（技能块放这儿）；前三格挤一挤
const hasPetSlot = () => !!(g && g.pets && g.team && g.team.length);
const SLOT3W = () => (hasPetSlot() ? (W - 16) * 0.24 : 0); // 宠物格多宽
const slotW = () => (W - SLOT3W() - (hasPetSlot() ? 8 : 0)) / 3;
function slotCenter(i) {
  if (i === 3) return { x: W - 8 - SLOT3W() / 2, y: L.trayY + L.trayH / 2 };
  return { x: slotW() * (i + 0.5), y: L.trayY + L.trayH / 2 };
}
function slotAt(x) { if (hasPetSlot() && x > W - 8 - SLOT3W() - 4) return 3; return Math.max(0, Math.min(2, Math.floor(x / slotW()))); }
// 手指在 (x, y) 时，块落在哪一格（左上角）
function snap(p, x, y) {
  const left = x - (p.w * L.cell) / 2;
  const top = y - L.lift - (p.h * L.cell) / 2;
  return { r: Math.round((top - L.by) / L.cell), c: Math.round((left - L.bx) / L.cell) };
}
// 反过来：想放到 (r, c)，手指该在哪（测试和教学手势用）
function fingerFor(p, r, c) {
  return { x: L.bx + c * L.cell + (p.w * L.cell) / 2, y: L.by + r * L.cell + (p.h * L.cell) / 2 + L.lift };
}
// 如果放下去会消掉哪些格
function previewClear(p, r, c) {
  if (p.special === 'skill') return new Set(g.skillCells(p, r, c));
  const b = g.board.slice();
  for (const [dr, dc] of p.cells) b[(r + dr) * 9 + c + dc] = 1;
  const set = new Set();
  for (let u = 0; u < 27; u++) if (core.UNITS[u].every((k) => b[k])) core.UNITS[u].forEach((k) => set.add(k));
  return set;
}

// ---------- 输入 ----------
function hitButton(x, y) {
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y - 4 && y <= b.y + b.h + 6) return b;
  }
  return null;
}
function onTouch(type, id, x, y) {
  if (mode === 'cut') { if (type === 'down') { CUT.skip(); if (!CUT.playing) endCuts(); } return; }
  if (type === 'down') {
    if (drag) return; // 只认一根手指
    const b = hitButton(x, y);
    if (b) { downBtn = b.id; return; }
    if (mode === 'play' && !g.over && !(g.siege && (g.phase !== 'play' || siegeBusy())) && y > L.trayY - 20) {
      const i = slotAt(x);
      if (g.hand[i]) {
        drag = { slot: i, x, y, id };
        P.sound('pick', 0.5);
        P.vibrate(false);
      }
    }
  } else if (type === 'move') {
    if (drag && drag.id === id) { drag.x = x; drag.y = y; }
  } else if (type === 'up') {
    if (downBtn) {
      const b = hitButton(x, y);
      const was = downBtn;
      downBtn = null;
      if (b && b.id === was && b.fn) { P.sound('tap', 0.5); b.fn(); }
      return;
    }
    if (drag && drag.id === id) {
      drag.x = x; drag.y = y;
      drop();
    }
  }
}
function drop() {
  const i = drag.slot;
  const p = g.hand[i];
  const s = snap(p, drag.x, drag.y);
  drag = null;
  if (!p || !core.canPlace(g.board, p, s.r, s.c)) {
    P.sound('deny', 0.5);
    return;
  }
  const ci = handColor(i);
  if (g.pets) {
    const colorsBefore = colorAt.slice();
    const pev = g.place(i, s.r, s.c);
    if (!pev) return;
    for (let k = 0; k < 81; k++) if (g.board[k] === 1) colorAt[k] = g.color[k];
    if (!save.petTutDone) { save.petTutDone = true; save.tutorialDone = true; persist(); }
    if (pev.win && !g._settled) settlePet(); // 赢了马上记账，结算页等动画演完再出
    juicePets(pev, colorsBefore);
    return;
  }
  if (g.siege) {
    const colorsBefore = colorAt.slice();
    p.cells.forEach(([dr, dc]) => (colorsBefore[(s.r + dr) * 9 + s.c + dc] = ci));
    const sev = g.place(i, s.r, s.c);
    if (!sev) return;
    p.cells.forEach(([dr, dc]) => (colorAt[(s.r + dr) * 9 + s.c + dc] = ci));
    juiceSiege(sev, colorsBefore);
    return;
  }
  const ev = g.place(i, s.r, s.c);
  if (!ev) return;
  p.cells.forEach(([dr, dc]) => (colorAt[(s.r + dr) * 9 + s.c + dc] = ci));
  if (!save.tutorialDone) { save.tutorialDone = true; persist(); }
  juice(ev);
  if (g.over) endGame();
}

// ---------- 爽感：照点子卡的节拍表 ----------
const BEATS = {
  1: { stop: 0, shake: 0 },
  2: { stop: 30, shake: 0 },
  3: { stop: 60, shake: 3 },
  4: { stop: 90, shake: 6 },
  5: { stop: 120, shake: 11 },
  6: { stop: 200, shake: 14 },
};
function say(s) { mofei.say = s; mofei.sayT = clock; mofei.jump = clock; }
function juice(ev) {
  const beat = BEATS[ev.beat];
  const now = P.now();
  stopUntil = now + beat.stop;
  shake = Math.max(shake, beat.shake);
  const p = ev.piece;
  p.cells.forEach(([dr, dc]) => popping.push({ k: (ev.r + dr) * 9 + ev.c + dc, t: clock }));
  // 跳字：加了多少
  const cx = cellX(ev.c) + (p.w * L.cell) / 2;
  const cy = cellY(ev.r) + (p.h * L.cell) / 2;
  if (ev.beat === 1) {
    P.sound('place', 0.7);
    P.vibrate(false);
    texts.push({ s: '+' + ev.gained, x: cx, y: cy, t: clock, size: 16, col: COL.text });
    return;
  }
  // 消除
  const cleared = new Set(ev.cells);
  const monK = new Set((ev.collected || []).filter((c) => c.what === 'monster').map((c) => c.k)); // 抓到的墨怪碎成墨，不闪金块
  cleared.forEach((k) => {
    clearing.push({ k, t: clock, mon: monK.has(k) });
    const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2;
    for (let n = 0; n < (ev.beat >= 4 ? 4 : 3); n++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * (80 + ev.beat * 40);
      fx.push({ kind: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, t: clock, life: 0.5 + Math.random() * 0.3, s: 3 + Math.random() * 4 });
    }
    if (Math.random() < 0.5) fx.push({ kind: 'steam', x, y, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 40, t: clock, life: 0.7 + Math.random() * 0.4, s: L.cell * 0.4 });
  });
  if (ev.beat >= 4) {
    // 齿轮崩飞
    for (let n = 0; n < 4 + ev.combo * 2; n++) {
      const a = Math.random() * Math.PI * 2, sp = 150 + Math.random() * 200;
      fx.push({ kind: 'gear', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, t: clock, life: 0.9, s: 6 + Math.random() * 8, a: Math.random() * 6 });
    }
  }
  if (ev.beat >= 5) {
    // 连弩齐射：三道弩箭扫过棋盘
    for (let n = 0; n < 3; n++) bolts.push({ row: 1 + n * 3.5, t: clock + n * 0.06, dir: n % 2 ? -1 : 1 });
    rings.push({ t: clock, big: ev.center });
    flash = 0.35;
    P.vibrate(true);
  }
  if (ev.crossbow) bolts.push({ row: ev.crossbow.row + 0.5, t: clock, dir: 1 });
  ev.newlyLit.forEach((b) => litAnim.push({ b, t: clock }));
  // 旅程：收走的东西飞向顶上的计数
  (ev.collected || []).forEach((c, n) => {
    flyers.push({ what: c.what, x: cellX(c.k % 9) + L.cell / 2, y: cellY(Math.floor(c.k / 9)) + L.cell / 2, t: clock + n * 0.05 });
  });
  if (ev.collected && ev.collected.length) setTimeout(() => P.sound('coin', 0.5), 380);
  // 声音
  if (ev.beat === 2) P.sound('line', 0.7);
  if (ev.beat === 3) P.sound('box', 0.8);
  if (ev.beat === 4) P.sound(ev.combo >= 3 || ev.streak >= 5 ? 'combo4' : ev.combo >= 2 ? 'combo3' : 'combo2', 0.7), P.sound('line', 0.5);
  if (ev.beat === 5) P.sound('five', 0.9), P.sound('combo4', 0.4);
  if (ev.crossbow) P.sound('bolt', 0.6);
  if (ev.newlyLit.length) setTimeout(() => P.sound('lit', 0.6), 120);
  if (ev.beat >= 3) P.vibrate(ev.beat >= 4);
  // 跳字
  let label = '+' + ev.gained;
  texts.push({ s: label, x: cx, y: cy - 6, t: clock, size: 18 + ev.beat * 4, col: ev.beat >= 4 ? COL.brassLight : COL.text });
  if (ev.center) texts.push({ s: '×5', x: cellX(4) + L.cell / 2, y: cellY(4) + L.cell / 2, t: clock + 0.05, size: 64, col: COL.red, big: true });
  else if (ev.combo >= 2) texts.push({ s: '连击 ×' + ev.combo, x: W / 2, y: L.by + L.board * 0.32, t: clock, size: 30 + ev.combo * 4, col: COL.brassLight, big: true });
  else if (ev.streak >= 3) texts.push({ s: '连消 ' + ev.streak, x: W / 2, y: L.by + L.board * 0.32, t: clock, size: 30, col: COL.jade, big: true });
  if (ev.sparrow) texts.push({ s: '+5 秒', x: W / 2, y: L.top + 50, t: clock, size: 22, col: COL.jade });
  if (ev.turtle) texts.push({ s: '蒸汽龟！', x: W / 2, y: L.trayY - 8, t: clock, size: 22, col: COL.jade });
  if (ev.win && g.stage) { P.sound('win', 0.8); say('过关！'); flash = 0.4; }
  else if (ev.win) { P.sound('win', 0.8); say('成了！'); flash = 0.6; }
  else if (ev.center) say('正中间！');
  else if (ev.beat >= 4) say(ev.combo >= 2 ? '好！' : '连上了');
  else if (ev.newlyLit.length) say('亮了');
}

// ---------- 一局结束 ----------
function endGame() {
  // 一局只结算一次（宠物动画还在排队时这一关就赢了，排队里的「结算」会再叫一次）
  if (g._ended) return;
  g._ended = true;
  overAt = clock;
  stats.overs.push(P.now());
  drag = null;
  if (g.siege) return endSiege();
  if (g.pets) return endPet();
  if (g.stage) {
    // 旅程：过关 → 记进度、给金币；输 → 差一点就写还差几个
    if (g.won) save.stage = Math.max(save.stage, stageIdx + 1);
    coinsGot = Math.floor(g.score * C.coinPerScore) + (g.won ? C.coinStageWin : 0);
    save.coins += coinsGot;
    persist();
    result = { won: g.won, reason: g.reason, near: g.nearMiss(), left: g.goalLeft(), doubled: false };
    mode = 'over';
    if (!g.won) { P.sound('lose', 0.6); say('堵住了'); }
    return;
  }
  const lit = g.litCount();
  if (!g.endless) g.lit.forEach((v, b) => v && (save.litEver[paintIdx][b] = true));
  let unlocked = null;
  if (g.won) {
    save.won[paintIdx] = true;
    save.wins++;
    const it = ITEMS[save.wins - 1];
    if (it && !save.items[it.id]) { save.items[it.id] = true; unlocked = it; }
  }
  coinsGot = Math.floor(g.score * C.coinPerScore) + (g.endless ? 0 : lit * C.coinPerBox) + (g.won ? C.coinWin : 0);
  save.coins += coinsGot;
  if (g.endless) save.bestEndless = Math.max(save.bestEndless, g.score);
  else save.best = Math.max(save.best, g.score);
  persist();
  result = { won: g.won, reason: g.reason, lit, near: g.nearMiss(), unlocked, doubled: false };
  mode = 'over';
  if (!g.won) { P.sound('lose', 0.6); say(g.reason === 'time' ? '时辰到' : '堵住了'); }
}
function continueAfterAd(fn) {
  ad = { until: clock + C.adSec, done: fn };
  mode = 'ad';
}

// ---------- 更新 ----------
function update(dt) {
  clock += dt;
  runTimeline();
  if (mode === 'play' && g && !g.over && P.now() >= stopUntil) {
    if (g.tick(dt)) endGame();
    // 最后 10 秒：嘀
    if (!g.endless && g.timeLeft <= 10 && !g.over) {
      const s = Math.ceil(g.timeLeft);
      if (s !== lastTick) { lastTick = s; P.sound('tick', 0.5); if (s === 10) say('快！'); }
    }
  }
  if (mode === 'ad' && clock >= ad.until) { const f = ad.done; ad = null; f(); }
  if (P.now() < stopUntil) return; // 顿帧：特效也停一下
  const fdt = dt;
  fx.forEach((f) => { f.x += f.vx * fdt; f.y += f.vy * fdt; f.vy += (f.kind === 'steam' ? -10 : 600) * fdt; if (f.kind === 'gear') f.a += fdt * 8; });
  fx = fx.filter((f) => clock - f.t < f.life);
  texts = texts.filter((t) => clock - t.t < (t.big ? 1.1 : 0.8));
  clearing = clearing.filter((c) => clock - c.t < 0.3);
  popping = popping.filter((c) => clock - c.t < 0.15);
  litAnim = litAnim.filter((c) => clock - c.t < 1.2);
  bolts = bolts.filter((b) => clock - b.t < 0.5);
  rings = rings.filter((r) => clock - r.t < 0.9);
  flyers = flyers.filter((f) => {
    if (clock - f.t < 0.55) return true;
    if (f.what === 'spark') petFx.pop[f.pet] = clock; else chipPop[f.what] = clock;
    return false;
  });
  shake *= Math.pow(0.002, dt);
  if (shake < 0.3) shake = 0;
  flash = Math.max(0, flash - dt * 1.6);
  if (g) displayScore += (g.score - displayScore) * Math.min(1, dt * 10);
}

// ---------- 画 ----------
function drawBg() {
  // 靛蓝夜：上亮下暗
  const bgG = ctx.createLinearGradient(0, 0, 0, H);
  bgG.addColorStop(0, COL.bg); bgG.addColorStop(1, COL.bgLow);
  ctx.fillStyle = bgG;
  ctx.fillRect(0, 0, W, H);
  // 淡淡的齿轮背景
  ctx.globalAlpha = 0.05;
  gearIcon(W * 0.1, H * 0.92, 60, clock * 0.1, COL.brass);
  gearIcon(W * 0.95, H * 0.12, 46, -clock * 0.13, COL.brass);
  ctx.globalAlpha = 1;
}
// 旅程的顶栏：返回、第几关、目标计数（还差几个；够了打勾）
function drawStageHud() {
  const y = L.top;
  button('map', 10, y + 4, 62, 38, '‹ 地图', { size: 15, bg: COL.wood, fn: () => { if (g.over && !g._ended) endGame(); timeline = []; if (g.won && g.pets) { CUT.clear(); openCamp(); } else mode = 'map'; } }); // 赢的那一下马上点回去：先把这关记上账；过了关一律回营地
  text(g.pets ? petLevelName() : '第 ' + (stageIdx + 1) + ' 关', W / 2, y + 10, 15, COL.dim, 'center', 'normal');
  const left = g.goalLeft();
  const keys = Object.keys(g.stage.goal);
  chipPos = {};
  if (keys.length === 1 && keys[0] === 'score') {
    // 冲分：进度条 + 现在 / 目标
    const goal = g.stage.goal.score, bw = Math.min(220, W - 150), bx = (W - bw) / 2, by = y + 30;
    const frac = Math.min(1, displayScore / goal);
    ctx.fillStyle = COL.ink; rr(bx - 2, by - 2, bw + 4, 22, 11); ctx.fill();
    ctx.fillStyle = COL.woodDark; rr(bx, by, bw, 18, 9); ctx.fill();
    ctx.fillStyle = COL.jade; rr(bx, by, Math.max(18, bw * frac), 18, 9); ctx.fill();
    text(Math.min(goal, Math.round(displayScore)) + ' / ' + goal, W / 2, by + 9, 15, COL.text);
    return;
  }
  const cw = 70, x0 = W / 2 - (cw * keys.length) / 2;
  keys.forEach((key, n) => {
    const cx = x0 + cw * n + cw / 2, cy = y + 40;
    const pop = chipPop[key] ? Math.max(0, 0.25 - (clock - chipPop[key])) * 2 : 0;
    ctx.fillStyle = COL.ink; rr(cx - 32, cy - 19, 64, 38, 10); ctx.fill();
    ctx.fillStyle = COL.woodDark; rr(cx - 30, cy - 17, 60, 34, 9); ctx.fill();
    const sz = 22 * (1 + pop);
    goalIcon(key, cx - 13, cy, sz);
    chipPos[key] = { x: cx - 13, y: cy };
    if (left[key] === 0) text('✓', cx + 15, cy + 1, 22, COL.jade);
    else text(String(left[key]), cx + 15, cy + 1, 20, COL.text);
  });
}
function drawHud() {
  if (g.siege) return drawSiegeHud();
  if (g.pets) { drawStageHud(); return drawPetBar(); }
  if (g.stage) return drawStageHud();
  const y = L.top;
  button('map', 10, y + 4, 62, 38, '‹ 地图', { size: 15, bg: COL.wood, fn: () => { if (g.over && !g._ended) endGame(); timeline = []; if (g.won && g.pets) { CUT.clear(); openCamp(); } else mode = 'map'; } }); // 赢的那一下马上点回去：先把这关记上账；过了关一律回营地
  // 分数
  text(String(Math.round(displayScore)), 80, y + 18, 30, COL.text, 'left');
  text('最高 ' + (g.endless ? save.bestEndless : save.best), 80, y + 46, 13, COL.dim, 'left', 'normal');
  // 九宫小图：哪几宫亮了
  if (!g.endless) {
    const s = 12, mx = W / 2 - s * 1.5 - 2, my = y + 4;
    for (let b = 0; b < 9; b++) {
      const x = mx + (b % 3) * (s + 2), yy = my + Math.floor(b / 3) * (s + 2);
      const la = litAnim.find((a) => a.b === b);
      const pop = la ? 1 + Math.max(0, 0.6 - (clock - la.t)) : 1;
      ctx.fillStyle = COL.ink;
      ctx.fillRect(x - 1, yy - 1, s + 2, s + 2);
      ctx.fillStyle = g.lit[b] ? (b === 4 ? COL.red : COL.brassLight) : COL.woodDark;
      ctx.fillRect(x + (s - s * pop) / 2, yy + (s - s * pop) / 2, s * pop, s * pop);
    }
    text(art.PAINTINGS[paintIdx].name, W / 2, y + 54, 12, COL.dim, 'center', 'normal');
  } else {
    text('无尽', W / 2, y + 20, 18, COL.brassLight);
  }
  // 时间
  if (!g.endless) {
    const tl = Math.ceil(g.timeLeft);
    const urgent = g.timeLeft <= 10;
    const txt = Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0');
    const sz = urgent ? 30 + Math.sin(clock * 12) * 3 : 28;
    text(txt, W - 64, y + 20, sz, urgent ? COL.red : COL.text, 'right');
    // 时间条
    const bw = W - 36, frac = Math.min(1, g.timeLeft / g.timeLimit);
    ctx.fillStyle = COL.ink; rr(18, L.by - 24, bw, 7, 3); ctx.fill();
    ctx.fillStyle = urgent ? COL.red : COL.copper; rr(18, L.by - 24, Math.max(4, bw * frac), 7, 3); ctx.fill();
  }
  // 画册按钮
  button('album', W - 52, y + 2, 40, 36, '册', { size: 18, bg: COL.copper, fn: () => openAlbum() });
}
function drawBoard(showGhost) {
  const { bx, by, cell, board: B } = L;
  // 木框
  ctx.fillStyle = COL.ink; rr(bx - 9, by - 9 + 4, B + 18, B + 18, 10); ctx.fill();
  ctx.fillStyle = COL.copper; rr(bx - 9, by - 9, B + 18, B + 18, 10); ctx.fill();
  // 黄铜框：一道硬高光 + 四角铆钉
  ctx.fillStyle = COL.brassLight; ctx.fillRect(bx - 2, by - 7, B + 4, 2);
  ctx.fillStyle = COL.brassDark;
  for (const [cx, cy] of [[bx - 5, by - 5], [bx + B + 5, by - 5], [bx - 5, by + B + 5], [bx + B + 5, by + B + 5]]) { ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = COL.ink; ctx.fillRect(bx - 2, by - 2, B + 4, B + 4);
  // 连消中：棋盘边框烧起来，连得越久越亮、越跳
  if (g.streak >= 2) {
    const heat = Math.min(1, (g.streak - 1) / 5);
    for (let n = 0; n < 3; n++) {
      ctx.strokeStyle = n === 0 ? 'rgba(255,240,180,' + (0.5 + heat * 0.4) + ')' : n === 1 ? 'rgba(255,150,60,' + (0.35 + heat * 0.4) + ')' : 'rgba(226,85,59,' + (0.25 + heat * 0.3) + ')';
      ctx.lineWidth = 3 + n * 4 + Math.sin(clock * 14 + n) * (1 + heat * 2);
      rr(bx - 11 - n * 3, by - 11 - n * 3, B + 22 + n * 6, B + 22 + n * 6, 12);
      ctx.stroke();
    }
    // 边上往上飘的火星
    if (Math.random() < 0.3 + heat * 0.5) {
      const side = Math.random() * (B + 20);
      fx.push({ kind: 'shard', x: bx - 10 + side, y: by + B + 8, vx: (Math.random() - 0.5) * 40, vy: -120 - Math.random() * 120, t: clock, life: 0.6, s: 2 + Math.random() * 3 });
    }
  }
  const pc = paintCanvas[paintIdx];
  const PX = paintSize[paintIdx] / 9;
  ctx.imageSmoothingEnabled = paintSmooth[paintIdx];
  for (let k = 0; k < 81; k++) {
    const r = Math.floor(k / 9), c = k % 9, x = cellX(c), y = cellY(r);
    const box = core.boxOf(r, c);
    if (g.revealed[k]) {
      ctx.drawImage(pc, c * PX, r * PX, PX, PX, x, y, cell, cell);
      if (!g.lit[box]) { ctx.fillStyle = COL.shade + '0.45)'; ctx.fillRect(x, y, cell, cell); }
    } else if (g.stage) {
      // 旅程：照 Woodoku，九宫一深一浅隔开，一眼看出宫
      ctx.fillStyle = box % 2 ? (r + c) % 2 ? COL.cellC : COL.cellD : (r + c) % 2 ? COL.cellA : COL.cellB;
      ctx.fillRect(x, y, cell, cell);
    } else {
      ctx.fillStyle = (r + c) % 2 ? COL.cellB : COL.cellC;
      ctx.fillRect(x, y, cell, cell);
      // 底下的画隐约透出来一点（消掉才真亮）
      ctx.globalAlpha = 0.13;
      ctx.drawImage(pc, c * PX, r * PX, PX, PX, x, y, cell, cell);
      ctx.globalAlpha = 1;
      if (box === 4) drawLuoshu(r - 3, c - 3, x, y, cell);
    }
  }
  // 格线
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 9; i++) {
    if (i % 3 === 0) continue;
    ctx.moveTo(bx + i * cell + 0.5, by); ctx.lineTo(bx + i * cell + 0.5, by + B);
    ctx.moveTo(bx, by + i * cell + 0.5); ctx.lineTo(bx + B, by + i * cell + 0.5);
  }
  ctx.stroke();
  // 宫线（黄铜细线）
  ctx.strokeStyle = COL.copper; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(bx + i * 3 * cell, by); ctx.lineTo(bx + i * 3 * cell, by + B);
    ctx.moveTo(bx, by + i * 3 * cell); ctx.lineTo(bx + B, by + i * 3 * cell);
  }
  ctx.stroke();
  // 中宫的红框（城心）；旅程里没有
  if (!g.stage) {
    ctx.strokeStyle = 'rgba(226,85,59,0.55)'; ctx.lineWidth = 2;
    ctx.strokeRect(cellX(3) + 2, cellY(3) + 2, cell * 3 - 4, cell * 3 - 4);
  }

  // 拖的时候：落点和会消掉的格子
  let ghost = null, willClear = null;
  if (showGhost && drag && g.hand[drag.slot]) {
    const p = g.hand[drag.slot];
    const s = snap(p, drag.x, drag.y);
    if (core.canPlace(g.board, p, s.r, s.c)) {
      ghost = { p, s, ci: handColor(drag.slot), hg: g.handGem[drag.slot] };
      willClear = previewClear(p, s.r, s.c);
    }
  }
  if (willClear && willClear.size) {
    ctx.fillStyle = 'rgba(243,210,122,' + (0.22 + Math.sin(clock * 10) * 0.08) + ')';
    if (ghost && ghost.p.special === 'skill') { const sc = C.blockColors[PG.PETS[ghost.p.pet].color][1]; ctx.fillStyle = sc; ctx.globalAlpha = 0.4 + Math.sin(clock * 10) * 0.12; }
    willClear.forEach((k) => ctx.fillRect(cellX(k % 9), cellY(Math.floor(k / 9)), cell, cell));
    ctx.globalAlpha = 1;
  }
  // 块
  for (let k = 0; k < 81; k++) {
    if (!g.board[k]) continue;
    const pop = popping.find((p) => p.k === k);
    const sc = pop ? 1 + 0.18 * (1 - (clock - pop.t) / 0.15) : 1;
    const s = cell * sc, x = cellX(k % 9) + (cell - s) / 2, y = cellY(Math.floor(k / 9)) + (cell - s) / 2;
    if (g.board[k] === 3) { drawMon(g.mon && g.mon[k], k, x + s / 2, y + s / 2, s * 0.4); continue; }
    if (g.board[k] === 5) { ironRock(x, y, s); if (g.rockHp && g.rockHp[k] > 1) { ctx.strokeStyle = '#8a90a0'; ctx.lineWidth = 2; ctx.strokeRect(x + 4, y + 4, s - 8, s - 8); ctx.strokeRect(x + 8, y + 8, s - 16, s - 16); } continue; }
    if (g.board[k] === 4) {
      // 大墨怪：2×2 画成一只，只在左上那格画
      if (g.bigCells && g.bigCells[0] === k) {
        const hit = petFx.bossHit && clock - petFx.bossHit < 0.3 ? Math.sin(clock * 70) * 5 : 0;
        const scared = petFx.bossScared ? Math.sin(clock * 40) * 2 : 0;
        const shiver = g.boss && g.boss.kind === 'split' && g.boss.stun ? Math.sin(clock * 50) * 3 : 0; // 分身王：小墨怪抓光了，吓得发抖
        inkMonster(x + s + hit + scared + shiver, y + s, s * 0.85 * (petFx.bossScared ? 0.94 : 1), true);
        bossDress(g.boss && g.boss.kind, x + s + hit + scared + shiver, y + s, s * 0.85);
        // 头上几颗红心 = 还要打几下；打中一下碎一颗（宠物咬、或者它晕着时打中，碎两颗）
        // 心多（超过 8 颗）就排成两排；整排夹在棋盘里面，头目跳到盘边也不画出屏幕
        const tot = g.stage.bigHp || 3, hs = tot > 5 ? 7 : 10, gap = tot > 5 ? 17 : 26, rows = tot > 8 ? 2 : 1, per = Math.ceil(tot / rows);
        const half = ((per - 1) * gap) / 2 + hs, hcx = Math.max(L.bx + half, Math.min(L.bx + L.board - half, x + s));
        for (let n = 0; n < tot; n++) { const row = Math.floor(n / per), col = n % per, inRow = row === rows - 1 ? tot - per * (rows - 1) : per; heart(hcx - (inRow - 1) * gap / 2 + col * gap, y - 22 - (rows - 1 - row) * 16, hs, n < g.bigHp); }
        // 刚吐完墨：头上转星星（这时候打它掉 2 颗心）
        if (g.boss && g.boss.stun) for (let n = 0; n < 3; n++) { const a = clock * 4 + (n * Math.PI * 2) / 3; starShape(x + s + Math.cos(a) * s * 0.7, y + s * 0.25 + Math.sin(a) * 6, 6, COL.brassLight); }
      }
      continue;
    }
    if (g.board[k] === 2) {
      // 机关匣：要被消的那一下亮一圈
      chest(x, y, s);
      if (willClear && willClear.has(k)) { ctx.strokeStyle = COL.brassLight; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, s - 4, s - 4); }
      continue;
    }
    block(x, y, s, 1, colorAt[k], willClear && willClear.has(k));
    if (g.gem[k]) gem(x, y, s, g.gem[k]);
  }
  // 技能块：打得动的墨怪套一圈亮光，打不动的打个灰叉（不克它）
  if (ghost && ghost.p.special === 'skill' && willClear) {
    const pet = { act: PG.PETS[ghost.p.pet].kind, color: PG.PETS[ghost.p.pet].color };
    willClear.forEach((k) => {
      if (g.board[k] !== 3 || !g.mon[k]) return;
      const x = cellX(k % 9), y = cellY(Math.floor(k / 9));
      if (PG.isCounter(g.mon[k], pet)) { ctx.strokeStyle = COL.brassLight; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * 0.46, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.strokeStyle = 'rgba(200,205,215,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + cell * 0.2, y + cell * 0.2); ctx.lineTo(x + cell * 0.8, y + cell * 0.8); ctx.moveTo(x + cell * 0.8, y + cell * 0.2); ctx.lineTo(x + cell * 0.2, y + cell * 0.8); ctx.stroke(); }
    });
  }
  if (ghost) {
    ghost.p.cells.forEach(([dr, dc], n) => {
      block(cellX(ghost.s.c + dc), cellY(ghost.s.r + dr), cell, 0.4, ghost.ci);
      if (ghost.hg && ghost.hg.cell === n) gem(cellX(ghost.s.c + dc), cellY(ghost.s.r + dr), cell, ghost.hg.kind, 0.6);
    });
  }
  if (g.siege) drawSiegeBoard();
  if (g.pets) drawPetBoard();
  // 泡泡压在最上面（下面有块时也看得见）
  for (let k = 0; k < 81; k++) if (g.bubble[k]) bubbleAt(cellX(k % 9), cellY(Math.floor(k / 9)), cell, willClear && willClear.has(k) ? 0.5 + Math.sin(clock * 12) * 0.3 : 1);
  // 正在碎掉的块：变白、缩小
  clearing.forEach((cl) => {
    const a = (clock - cl.t) / 0.3;
    const s = cell * (1 - a * 0.8);
    const x = cellX(cl.k % 9) + (cell - s) / 2, y = cellY(Math.floor(cl.k / 9)) + (cell - s) / 2;
    ctx.globalAlpha = 1 - a;
    if (cl.mon) { ctx.fillStyle = '#2a2236'; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, (s / 2) * (1 + a * 0.6), 0, Math.PI * 2); ctx.fill(); } // 墨怪：一团墨散开
    else { ctx.fillStyle = a < 0.4 ? '#fff' : COL.brassLight; ctx.fillRect(x, y, s, s); }
    ctx.globalAlpha = 1;
  });
  // 城区点亮：白闪 + 齿轮转一圈
  litAnim.forEach((la) => {
    const a = (clock - la.t) / 1.2;
    const x = cellX((la.b % 3) * 3), y = cellY(Math.floor(la.b / 3) * 3), s = cell * 3;
    ctx.fillStyle = 'rgba(255,240,200,' + Math.max(0, 0.7 - a * 1.4) + ')';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(243,210,122,' + (1 - a) + ')';
    ctx.lineWidth = 4;
    ctx.strokeRect(x - a * 10, y - a * 10, s + a * 20, s + a * 20);
    ctx.globalAlpha = 1 - a;
    gearIcon(x + s / 2, y + s / 2, cell * 0.6 * (1 + a * 0.4), a * Math.PI * 2, COL.brassLight);
    ctx.globalAlpha = 1;
  });
  // 洛书光阵：从城心一圈圈亮开
  rings.forEach((rg) => {
    const a = (clock - rg.t) / 0.9;
    const cx = rg.at ? rg.at.x : cellX(4) + cell / 2, cy = rg.at ? rg.at.y : cellY(4) + cell / 2;
    for (let n = 0; n < 3; n++) {
      const rad = (a * 1.2 - n * 0.15) * B * (rg.at ? 0.45 : 0.8); // 火雷炸开的圈小一点
      if (rad <= 0) continue;
      ctx.strokeStyle = 'rgba(243,210,122,' + Math.max(0, 0.9 - a) + ')';
      ctx.lineWidth = 5 - n;
      ctx.strokeRect(cx - rad / 2, cy - rad / 2, rad, rad);
    }
  });
  // 连弩：一道亮线扫过
  bolts.forEach((b) => {
    const a = (clock - b.t) / 0.5;
    if (a < 0) return;
    const y = by + b.row * cell;
    const head = b.dir > 0 ? bx - 40 + a * (B + 80) : bx + B + 40 - a * (B + 80);
    ctx.fillStyle = 'rgba(255,240,200,' + (1 - a) + ')';
    ctx.fillRect(Math.min(head, head - b.dir * 70), y - 2, 70, 4);
    ctx.fillStyle = COL.brassLight;
    ctx.beginPath(); ctx.moveTo(head + b.dir * 12, y); ctx.lineTo(head, y - 6); ctx.lineTo(head, y + 6); ctx.fill();
  });
}
// 洛书：4 9 2 / 3 5 7 / 8 1 6，奇数白点、偶数黑点
const LUOSHU = [4, 9, 2, 3, 5, 7, 8, 1, 6];
function drawLuoshu(r, c, x, y, s) {
  const n = LUOSHU[r * 3 + c];
  // 洛书点：奇数白点淡淡发光、偶数深点
  ctx.fillStyle = n % 2 ? 'rgba(235,229,212,0.4)' : COL.shade + '0.6)';
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const d = s / (Math.max(cols, rows) + 1.2);
  for (let i = 0; i < n; i++) {
    const cx = x + s / 2 + ((i % cols) - (cols - 1) / 2) * d;
    const cy = y + s / 2 + (Math.floor(i / cols) - (rows - 1) / 2) * d;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, d * 0.28), 0, Math.PI * 2); ctx.fill();
  }
}
function drawPiece(p, cx, cy, s, alpha, ci, hg) {
  const x0 = cx - (p.w * s) / 2, y0 = cy - (p.h * s) / 2;
  if (p.special === 'skill') {
    // 技能块（0.9.8）：宠物颜色的发光块，上面画那只宠物；一眼和普通块分开
    const col = C.blockColors[PG.PETS[p.pet].color], glow = 0.5 + Math.sin(clock * 6) * 0.3;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = col[1]; ctx.globalAlpha = alpha * glow * 0.45; ctx.beginPath(); ctx.arc(cx, cy, s * 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha;
    block(x0, y0, s, alpha, PG.PETS[p.pet].color, true);
    petIcon(p.pet, cx, cy, s * 0.82, 0, 0);
    ctx.globalAlpha = 1;
    return;
  }
  if (p.special === 'fire') {
    // 火麒麟送的火块：发光的红块 + 一团火苗，一眼和普通块分开
    const glow = 0.5 + Math.sin(clock * 8) * 0.3;
    ctx.fillStyle = 'rgba(255,140,60,' + glow * 0.5 + ')'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.9, 0, Math.PI * 2); ctx.fill();
    block(x0, y0, s, alpha, 1, true);
    ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.38); ctx.quadraticCurveTo(cx + s * 0.3, cy, cx, cy + s * 0.3); ctx.quadraticCurveTo(cx - s * 0.3, cy, cx, cy - s * 0.38); ctx.fill();
    ctx.fillStyle = '#ff6a2a'; ctx.beginPath(); ctx.arc(cx, cy + s * 0.08, s * 0.12, 0, Math.PI * 2); ctx.fill();
    return;
  }
  p.cells.forEach(([r, c], n) => {
    block(x0 + c * s, y0 + r * s, s, alpha, ci);
    if (hg && hg.cell === n) gem(x0 + c * s, y0 + r * s, s, hg.kind, alpha);
  });
}
function drawTray() {
  // 托盘
  ctx.fillStyle = COL.bg2; rr(8, L.trayY - 6, W - 16, L.trayH + 6, 14); ctx.fill();
  if (hasPetSlot()) {
    // 宠物格：一个虚线框，空着时淡淡画出出战宠物的影子；有技能块时框亮起来
    const c3 = slotCenter(3), w3 = SLOT3W() - 8, h3 = L.trayH - 12, pt = g.team[0], col = C.blockColors[PG.PETS[pt.id].color];
    ctx.strokeStyle = g.hand[3] ? col[1] : COL.woodLine; ctx.lineWidth = g.hand[3] ? 3 : 2; if (!g.hand[3]) ctx.setLineDash([5, 5]);
    rr(c3.x - w3 / 2, c3.y - h3 / 2, w3, h3, 10); ctx.stroke(); ctx.setLineDash([]);
    if (!g.hand[3]) { ctx.globalAlpha = 0.22; petIcon(pt.id, c3.x, c3.y, Math.min(w3, h3) * 0.6, 0, 0); ctx.globalAlpha = 1; }
  }
  for (let i = 0; i < 4; i++) {
    const p = g.hand[i];
    if (!p || (drag && drag.slot === i)) continue;
    const c = slotCenter(i);
    const fits = core.anyPlacement(g.board, p);
    const s = i === 3 ? Math.min(L.mini * 1.5, SLOT3W() - 26, L.trayH - 26) : Math.min(L.mini, (slotW() - 20) / p.w, (L.trayH - 16) / p.h);
    drawPiece(p, c.x, c.y + Math.sin(clock * 3 + i) * 1.5, s, fits ? 1 : 0.28, handColor(i), g.handGem[i]);
  }
  if (drag && g.hand[drag.slot]) {
    const p = g.hand[drag.slot];
    drawPiece(p, drag.x, drag.y - L.lift, L.cell, 0.95, handColor(drag.slot), g.handGem[drag.slot]);
  }
}
function drawMofei() {
  // 左下角的墨非（8 比特小人），有事时跳一下、说一两个字
  const x = 34, base = Math.min(H - 14, L.footY + 70);
  const j = Math.max(0, 0.35 - (clock - mofei.jump)) * 40;
  const y = base - j;
  const u = 3;
  const P2 = (dx, dy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x + dx * u, y + dy * u, w * u, h * u); };
  P2(-4, -12, 8, 12, '#26303c'); // 袍
  P2(-4, -9, 8, 1, COL.brass);
  P2(-0.5, -12, 1, 12, COL.brass);
  P2(-3, -18, 6, 6, '#e9b88e'); // 脸
  P2(-3, -19, 6, 2, '#0e0a08');
  P2(-1, -21, 2, 2, '#0e0a08'); // 发髻
  P2(-2, -16, 1, 1, '#0e0a08'); P2(1, -16, 1, 1, '#0e0a08'); // 眼
  P2(5, -20, 1, 20, COL.brass); // 杖
  if (mofei.say && clock - mofei.sayT < 1.4) {
    const bw = 18 + mofei.say.length * 18;
    ctx.fillStyle = COL.steam; rr(x + 20, y - 78, bw, 30, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 24, y - 50); ctx.lineTo(x + 34, y - 50); ctx.lineTo(x + 16, y - 40); ctx.fill();
    ctx.font = 'bold 17px "PingFang SC", sans-serif'; ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(mofei.say, x + 20 + bw / 2, y - 63);
  }
}
function drawFoot() {
  // 0.9.2：左下角的墨非小人去掉了（Cc 11-24：「这小人是干嘛的？占这么大个地方，这么宝贝的地方给他占了」）。
  // 他冒的字（连上了 / 过关！/ 堵住了）和闪光、震屏、飘分重复，也不要了；以后主角汐娘出场再说

  // 假广告：手上有块放不下时，「换一组」
  if (mode === 'play' && !g.over && g.someBlocked() && g.adsUsed < C.adMax) {
    const w = 128, h = 46, x = W - w - 16, y = Math.min(H - h - 16, L.footY + 16);
    const wob = Math.sin(clock * 6) * 2;
    button('reroll', x, y + wob, w, h, '换一组', { size: 19, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { g.reroll(); mode = 'play'; P.sound('coin'); }) });
  }
}
function drawFx() {
  if (g && g.siege) drawMissiles();
  if (g && g.pets) drawPetRuns();
  flyers.forEach((f) => {
    const a = (clock - f.t) / 0.55;
    if (f.what === 'spark') {
      // 宠物：同色的方块化成光点飞到宠物身上
      if (a < 0) return;
      const e = a * a;
      const x = f.x + (f.to.x - f.x) * e, y = f.y + (f.to.y - f.y) * e - Math.sin(a * Math.PI) * 30;
      ctx.fillStyle = f.col; ctx.globalAlpha = 1 - a * 0.3;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    if (f.what === 'dmg') {
      // 守城：总伤害飞上去砸在车上
      if (a < 0) return;
      const e = 1 - (1 - a) * (1 - a);
      const x = f.x + (f.to.x - f.x) * e, y = f.y + (f.to.y - f.y) * e;
      text(f.s, x, y, Math.round(34 - a * 10), COL.red);
      return;
    }
    if (a < 0) { goalIcon(f.what, f.x, f.y, L.cell * 0.8); return; }
    const to = chipPos[f.what] || { x: W / 2, y: L.top + 40 };
    const e = 1 - (1 - a) * (1 - a);
    const x = f.x + (to.x - f.x) * e, y = f.y + (to.y - f.y) * e - Math.sin(a * Math.PI) * 60;
    goalIcon(f.what, x, y, L.cell * (0.8 + Math.sin(a * Math.PI) * 0.4));
  });
  fx.forEach((f) => {
    const a = 1 - (clock - f.t) / f.life;
    ctx.globalAlpha = Math.max(0, a);
    if (f.kind === 'shard') { ctx.fillStyle = f.col || (a > 0.6 ? COL.brassLight : COL.brass); ctx.fillRect(f.x, f.y, f.s, f.s); }
    else if (f.kind === 'steam') { ctx.fillStyle = COL.steam; ctx.beginPath(); ctx.arc(f.x, f.y, f.s * (1.6 - a), 0, Math.PI * 2); ctx.fill(); }
    else if (f.kind === 'gear') gearIcon(f.x, f.y, f.s, f.a, COL.copper);
    ctx.globalAlpha = 1;
  });
  texts.forEach((t) => {
    const age = clock - t.t;
    if (age < 0) return;
    const life = t.big ? 1.1 : 0.8;
    const pop = t.big ? (age < 0.12 ? 0.6 + age * 5 : 1.2 - Math.min(0.2, (age - 0.12))) : 1;
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - life * 0.6) / (life * 0.4));
    const sz = Math.round(t.size * pop);
    ctx.font = 'bold ' + sz + 'px sans-serif';
    const half = ctx.measureText(t.s).width / 2 + 6;
    text(t.s, Math.max(half, Math.min(W - half, t.x)), t.y - age * (t.big ? 20 : 50), sz, t.col, 'center', 'bold', true); // 飘在棋盘上：描边
    ctx.globalAlpha = 1;
  });
}
function drawTutorial() {
  const siegeTut = g && g.siege && g.firstRun && g.phase === 'play';
  const petTut = g && g.pets && petIdx === 0 && !save.petTutDone;
  if ((save.tutorialDone && !siegeTut && !petTut) || !g || g.moves > 0 || drag || !g.hand[0]) return;
  // 手指动画：把第一块（3×3）拖进中宫
  tutorialT += 1 / 60;
  const a = (tutorialT % 2.2) / 1.6;
  const from = slotCenter(0);
  const to = fingerFor(g.hand[0], 3, 3);
  const k = Math.min(1, Math.max(0, a));
  const e = k * k * (3 - 2 * k);
  const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e;
  if (a > 0 && a <= 1) drawPiece(g.hand[0], x, y - L.lift * e, L.mini + (L.cell - L.mini) * e, 0.45, handColor(0));
  // 手
  ctx.globalAlpha = a > 1.15 ? 0 : 0.9;
  ctx.fillStyle = COL.steam;
  ctx.beginPath(); ctx.arc(x + 10, y + 16, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x + 5, y - 6, 9, 20);
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + 10, y + 16, 13, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

// 结算页：把画亮出来，没亮的宫闪着
function drawPainting(idx, x, y, s, litArr, blink) {
  ctx.imageSmoothingEnabled = paintSmooth[idx];
  ctx.fillStyle = COL.ink; ctx.fillRect(x - 4, y - 4, s + 8, s + 8);
  ctx.drawImage(paintCanvas[idx], 0, 0, paintSize[idx], paintSize[idx], x, y, s, s);
  const q = s / 3;
  for (let b = 0; b < 9; b++) {
    if (litArr[b]) continue;
    const bx = x + (b % 3) * q, by = y + Math.floor(b / 3) * q;
    ctx.fillStyle = COL.shade + '0.86)'; ctx.fillRect(bx, by, q, q);
    if (blink) {
      ctx.strokeStyle = 'rgba(226,85,59,' + (0.5 + Math.sin(clock * 8) * 0.4) + ')';
      ctx.lineWidth = 3; ctx.strokeRect(bx + 3, by + 3, q - 6, q - 6);
    }
  }
  ctx.strokeStyle = COL.brass; ctx.lineWidth = 2;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(x + i * q, y); ctx.lineTo(x + i * q, y + s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + i * q); ctx.lineTo(x + s, y + i * q); ctx.stroke();
  }
}
// 旅程的结算：过关卡 / 差一点卡
function drawStageOver() {
  const age = clock - overAt;
  const r = result;
  // 过关：先让「过关！」和飞的宝石放完，再出卡（照 Woodoku：变暗 → WELL DONE → 第 N 关完成）
  const wait = r.won ? 1.1 : 0.35;
  ctx.fillStyle = COL.shade + Math.min(r.won ? 0.55 : 0.85, age * 2) + ')';
  ctx.fillRect(0, 0, W, H);
  if (r.won && age < wait) {
    // 「过关！」压在暗层上面，弹一下
    const k = Math.min(1, age / 0.15);
    const sz = Math.round(64 * (0.6 + k * 0.5 - Math.max(0, age - 0.15) * 0.1));
    ctx.globalAlpha = age > wait - 0.15 ? Math.max(0, (wait - age) / 0.15) : 1;
    text('过关！', W / 2, L.by + L.board * 0.45, sz, COL.brassLight);
    ctx.globalAlpha = 1;
  }
  if (age < wait) return;
  const pw = Math.min(W - 40, 340), ph = 330, px = (W - pw) / 2, py = Math.max(L.top + 40, (H - ph) / 2 - 40);
  const k = Math.min(1, (age - wait) / 0.18);
  ctx.save();
  ctx.translate(W / 2, py + ph / 2); ctx.scale(0.85 + k * 0.15, 0.85 + k * 0.15); ctx.translate(-W / 2, -(py + ph / 2));
  ctx.globalAlpha = k;
  panel(px, py, pw, ph);
  const keys = Object.keys(g.stage.goal);
  if (r.won) {
    text('第 ' + (stageIdx + 1) + ' 关完成！', W / 2, py + 44, 28, COL.brassLight);
    // 目标图标排一排，都打勾
    const cw = 64, x0 = W / 2 - (cw * keys.length) / 2;
    keys.forEach((key, n) => {
      const cx = x0 + cw * n + cw / 2, cy = py + 112;
      if (key === 'score') text(String(g.score), cx, cy, 34, COL.text);
      else { goalIcon(key, cx, cy - 4, 38 + Math.sin(clock * 4 + n) * 2); text('✓', cx + 20, cy + 18, 20, COL.jade); }
    });
  } else {
    text(r.near ? '差一点！' : '堵住了', W / 2, py + 44, 30, r.near ? COL.red : COL.text);
    // 还差几个
    const cw = 70, x0 = W / 2 - (cw * keys.length) / 2;
    text('还差', W / 2, py + 82, 15, COL.dim, 'center', 'normal');
    keys.forEach((key, n) => {
      const cx = x0 + cw * n + cw / 2, cy = py + 118;
      if (key === 'score') text(r.left.score + ' 分', cx, cy, 26, COL.red);
      else if (r.left[key] === 0) { goalIcon(key, cx - 12, cy, 26); text('✓', cx + 16, cy, 20, COL.jade); }
      else { goalIcon(key, cx - 12, cy, 26); text(String(r.left[key]), cx + 16, cy, 22, COL.red); }
    });
  }
  const cy = py + 168;
  if (coinsGot > 0) text('+' + coinsGot * (r.doubled ? 2 : 1) + ' 金', W / 2 - 40, cy, 20, COL.brassLight);
  if (coinsGot > 0 && !r.doubled && g.adsUsed < C.adMax) {
    button('double', W / 2 + 18, cy - 17, 88, 34, '翻倍', { size: 16, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { save.coins += coinsGot; persist(); r.doubled = true; g.adsUsed++; mode = 'over'; P.sound('coin'); }) });
  }
  const bw = pw - 48, bx = px + 24;
  if (r.won) {
    const last = stageIdx >= LV.length - 1;
    button('next', bx, py + 200, bw, 60, last ? '旅程走完了' : '下一关', { size: 26, fn: () => (last ? (mode = 'map') : newStage(stageIdx + 1)) });
    button('tomap', bx, py + 270, bw, 40, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
  } else {
    button('again', bx, py + 200, bw, 60, '再试一次', { size: 26, fn: () => newStage(stageIdx) });
    if (g.adsUsed < C.adMax) {
      button('revive', bx, py + 270, bw * 0.6 - 6, 44, '清空正中间', { size: 17, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { g.revive(); g._ended = false; mode = 'play'; result = null; stats.starts.push(P.now()); }) });
      button('tomap', bx + bw * 0.6 + 6, py + 270, bw * 0.4 - 6, 44, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
    } else button('tomap', bx, py + 270, bw, 44, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
function drawOver() {
  if (g.siege) return drawSiegeOver();
  if (g.pets) return drawPetOver();
  if (g.stage) return drawStageOver();
  const age = clock - overAt;
  ctx.fillStyle = COL.shade + Math.min(0.92, age * 3) + ')';
  ctx.fillRect(0, 0, W, H);
  if (age < 0.25) return; // 让碎块飞一下再出结算
  const r = result;
  const s = Math.min(W - 80, 260);
  const px0 = (W - s) / 2, py0 = L.top + 70;
  let title;
  if (g.endless) title = g.score + ' 分';
  else if (r.won) title = '拼成了！';
  else if (9 - r.lit <= 2) title = '只差 ' + (9 - r.lit) + ' 块画！';
  else title = '亮了 ' + r.lit + ' / 9 块画';
  text(title, W / 2, L.top + 30, 34, r.won ? COL.brassLight : r.near ? COL.red : COL.text);
  drawPainting(paintIdx, px0, py0, s, r.won ? new Array(9).fill(true) : g.lit, !r.won && !g.endless);
  let y = py0 + s + 30;
  text((g.endless ? '' : g.score + ' 分  ·  ') + '最高 ' + (g.endless ? save.bestEndless : save.best), W / 2, y, 18, COL.text, 'center', 'normal');
  y += 30;
  text('+' + coinsGot * (r.doubled ? 2 : 1) + ' 金', W / 2 - 40, y, 20, COL.brassLight);
  if (!r.doubled && g.adsUsed < C.adMax) {
    button('double', W / 2 + 20, y - 17, 92, 34, '翻倍', { size: 16, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { save.coins += coinsGot; persist(); r.doubled = true; g.adsUsed++; mode = 'over'; P.sound('coin'); }) });
  }
  y += 34;
  if (r.unlocked) {
    gearIcon(W / 2 - 80, y, 10, clock * 2, COL.jade);
    text('得到 ' + r.unlocked.name + '：' + r.unlocked.tip, W / 2 + 8, y, 16, COL.jade);
    y += 30;
  }
  // 按钮：再来最大
  const bw = Math.min(W - 60, 300);
  const by = Math.max(y + 8, H - 210);
  button('again', (W - bw) / 2, by, bw, 64, r.won ? '下一张' : '再来', { size: 28, fn: () => newGame(g.endless) });
  if (!r.won && g.adsUsed < C.adMax) {
    const lbl = g.reason === 'time' ? '+20 秒' : '清空正中间';
    button('revive', (W - bw) / 2, by + 76, bw * 0.62 - 6, 50, lbl, { size: 19, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { g.revive(); g._ended = false; mode = 'play'; result = null; stats.starts.push(P.now()); }) });
    button('album2', (W - bw) / 2 + bw * 0.62 + 6, by + 76, bw * 0.38 - 6, 50, '画册', { size: 19, bg: COL.wood, fn: () => openAlbum() });
  } else {
    button('album2', (W - bw) / 2, by + 76, bw, 50, '画册', { size: 19, bg: COL.wood, fn: () => openAlbum() });
  }
}
function drawAd() {
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(0, 0, W, H);
  const left = Math.max(0, Math.ceil(ad.until - clock));
  text('广告占位', W / 2, H / 2 - 40, 22, COL.dim, 'center', 'normal');
  text(String(left), W / 2, H / 2 + 10, 56, COL.text);
}

// ---------- 旅程地图（照 Woodoku：一条弯路，关卡是圆圈，两关之间夹一张小图） ----------
const MAP_SHOW = 5; // 一屏看几关
function mapNodePos(i, lo) {
  const top = L.top + 150, bottom = H - 250;
  const step = (bottom - top) / (MAP_SHOW - 1);
  return { x: W / 2 + (i % 2 ? 1 : -1) * Math.min(62, W * 0.16), y: bottom - (i - lo) * step, step };
}
// 两关之间的小图：第 i 关过了才亮。每 5 关一张画，5 张小图 = 那张画的 5 宫
function mapPicture(i, x, y, s) {
  const ch = Math.floor(i / 5) % art.COUNT, b = (i % 5) * 2;
  const S = paintSize[ch], q = S / 3;
  const open = i < save.petStage;
  ctx.fillStyle = COL.ink; rr(x - s / 2 - 5, y - s / 2 - 3, s + 10, s + 10, 10); ctx.fill();
  ctx.fillStyle = COL.steam; rr(x - s / 2 - 5, y - s / 2 - 5, s + 10, s + 10, 10); ctx.fill();
  ctx.imageSmoothingEnabled = paintSmooth[ch];
  ctx.drawImage(paintCanvas[ch], (b % 3) * q, Math.floor(b / 3) * q, q, q, x - s / 2, y - s / 2, s, s);
  if (!open) {
    ctx.fillStyle = COL.shade + '0.82)'; ctx.fillRect(x - s / 2, y - s / 2, s, s);
    text('?', x, y, s * 0.4, COL.dim);
  }
}
function drawMap() {
  drawBg();
  const cur = Math.min(save.petStage, PLV.length - 1);
  const done = save.petStage >= PLV.length;
  const lo = Math.max(0, Math.min(cur - 1, PLV.length - MAP_SHOW));
  const hi = lo + MAP_SHOW - 1;
  // 路：先画整条（往两头多画一节，像能接着走），过了的那段是黄铜色
  for (let i = lo - 1; i <= hi; i++) {
    if (i < 0 || i + 1 >= PLV.length) continue;
    const a = mapNodePos(i, lo), b = mapNodePos(i + 1, lo);
    const passed = i + 1 <= save.petStage;
    for (const [w, col] of [[22, COL.ink], [16, passed ? COL.brass : COL.woodDark]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(a.x, (a.y + b.y) / 2, b.x, (a.y + b.y) / 2, b.x, b.y);
      ctx.stroke();
    }
    // 两关中间的小图，放在路的外侧
    const pic = Math.min(84, a.step * 0.6, W / 2 - 110);
    const side = i % 2 ? -1 : 1;
    if (i >= lo && i < hi) mapPicture(i, W / 2 + side * (W / 2 - pic / 2 - 22), (a.y + b.y) / 2, pic);
  }
  // 关卡圆圈
  for (let i = lo; i <= hi; i++) {
    const { x, y } = mapNodePos(i, lo);
    const passed = i < save.petStage, isCur = i === cur && !done;
    const rad = isCur ? 30 + Math.sin(clock * 4) * 2 : 26;
    if (isCur) {
      ctx.strokeStyle = 'rgba(111,208,168,' + (0.5 + Math.sin(clock * 4) * 0.3) + ')'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y, rad + 8, 0, Math.PI * 2); ctx.stroke();
    }
    const hd = PLV[i].hard || 0;
    if (hd) {
      // 难关（学 Royal Match）：头上两只红角；超难再多一圈紫、顶上一个小骷髅
      ctx.fillStyle = hd > 1 ? '#7a3fa0' : COL.red;
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sx * rad * 0.35, y - rad * 0.8); ctx.lineTo(x + sx * rad * 0.95, y - rad * 1.45); ctx.lineTo(x + sx * rad * 0.8, y - rad * 0.5); ctx.fill(); }
      ctx.strokeStyle = hd > 1 ? '#7a3fa0' : COL.red; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, rad + 6, 0, Math.PI * 2); ctx.stroke();
      if (hd > 1 && i % 5 !== 4) skullIcon(x, y - rad - 16, 9);
    }
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(x, y + 3, rad + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = passed ? COL.brass : isCur ? COL.red : COL.woodDark; // 当前关用朱砂：全屏唯一一点高饱和
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    text(petNodeLabel(i), x, y + 1, isCur ? 22 : 18, passed ? COL.ink : isCur ? COL.text : COL.dim);
    if (passed) text('✓', x + 20, y - 20, 16, COL.jade);
    // 每 5 关一个齿轮奖章（拼成一张画）
    if (i % 5 === 4) gearIcon(x, y - rad - 16, 11, passed ? clock : 0, passed ? COL.brassLight : COL.woodLine);
    // 过了的关和当前关能点
    if (i <= cur) buttons.push({ id: 'node' + i, x: x - rad, y: y - rad, w: rad * 2, h: rad * 2, fn: () => newPetLevel(i) });
  }
  // 顶栏压在路上面：标题、进度、金币
  const hg = ctx.createLinearGradient(0, 0, 0, L.top + 110);
  hg.addColorStop(0, COL.bg); hg.addColorStop(0.75, COL.bg); hg.addColorStop(1, 'rgba(14,19,48,0)');
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W, L.top + 110);
  // 第一行：左「‹ 主菜单」、右齿轮（设置）；第二行：章节名；第三行：进度和金币（Cc 11-24：「这个页面里应该也能返回主菜单」）
  button('home', 10, L.top + 2, 92, 38, '‹ 主菜单', { size: 15, bg: COL.wood, fn: () => { mode = 'home'; } });
  button('settings', W - 56, L.top + 2, 44, 38, '', { bg: COL.wood, fn: () => { settingsAsk = 0; settingsFrom = 'map'; mode = 'settings'; } });
  gearIcon(W - 34, L.top + 21, 9, clock * 0.5, COL.brassLight);
  text(chapterName(Math.min(save.petStage, PLV.length - 1)), W / 2, L.top + 62, 22, COL.brassLight);
  text('已过 ' + Math.min(save.petStage, PLV.length) + ' / ' + PLV.length + ' 关　·　' + save.coins + ' 金', W / 2, L.top + 90, 13, COL.dim, 'center', 'normal');
  // 底栏同样压住路
  const fg = ctx.createLinearGradient(0, H - 215, 0, H);
  fg.addColorStop(0, 'rgba(9,12,32,0)'); fg.addColorStop(0.2, COL.bgLow); fg.addColorStop(1, COL.bgLow);
  ctx.fillStyle = fg; ctx.fillRect(0, H - 215, W, 215);
  // 下一关要干什么：目标图标
  const st = PLV[cur].evolveLevel ? PLV.evolveStage(PLV[cur].evolveLevel, 0) : PLV[cur];
  const keys = Object.keys(st.goal);
  const gy = H - 186;
  const cw = 58, x0 = W / 2 - (cw * keys.length) / 2;
  keys.forEach((key, n) => {
    const cx = x0 + cw * n + cw / 2;
    if (key === 'score') text(st.goal.score + ' 分', cx, gy, 18, COL.text);
    else { goalIcon(key, cx - 12, gy, 20); text(key === 'all' ? '抓光' : '×' + st.goal[key], cx + (key === 'all' ? 20 : 14), gy, key === 'all' ? 14 : 16, COL.text); }
  });
  const bestId = !st.team && st.best ? (save.pets[st.best] ? st.best : save.pets[PG.PETS[st.best].evo] ? PG.PETS[st.best].evo : null) : null;
  if (bestId) {
    // 头像 + 右边一行小字，同一行，不压下面的大按钮
    const bx = Math.min(W - 70, x0 + cw * keys.length + 30), on = save.activePet === bestId;
    petIcon(bestId, bx, gy, 28, 0, 0);
    text(on ? '✓ 带着它' : '带它最顺', bx + 19, gy, 12, on ? COL.jade : COL.brassLight, 'left', 'normal');
    buttons.push({ id: 'bestPet', x: bx - 18, y: gy - 18, w: 86, h: 36, fn: () => openCamp() });
  }
  if (st.hard) text(st.hard > 1 ? '超难关' : '难关', W / 2, H - 168, 12, st.hard > 1 ? '#c58ae0' : '#f08a70');
  const bw = Math.min(W - 60, 300);
  button('play', (W - bw) / 2, H - 160, bw, 64, done ? '再玩' + petNodeLabel(PLV.length - 1) : petLevelName(cur), { size: 28, fn: () => newPetLevel(cur) });
  // 底下三个：营地（葫芦、喂宠物）、经典拼画、画册。守城收起来了（Cc 11-24：「这个没意思，就不要加塔防了」）
  const b3w = Math.min(W - 24, 360), b3 = (b3w - 12) / 3, bx3 = (W - b3w) / 2;
  const campNew = canLevelAny();
  button('camp', bx3, H - 82, b3, 46, '营地', { size: 18, bg: '#3f9a7c', fn: () => openCamp() });
  if (campNew) { ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(bx3 + b3 - 6, H - 82, 8, 0, Math.PI * 2); ctx.fill(); }
  button('classic', bx3 + b3 + 6, H - 82, b3, 46, '经典拼画', { size: 15, bg: COL.copper, fn: () => newGame(false) });
  button('album3', bx3 + (b3 + 6) * 2, H - 82, b3, 46, '画册', { size: 17, bg: COL.wood, fn: () => openAlbum() });
  text('葫芦里 ' + save.gourd + ' 只怪 · ' + save.dan + ' 颗丹', W / 2, H - 22, 12, COL.dim, 'center', 'normal');
}

// ---------- 章页（0.8，照 ../九宫消_关卡页专属关与UI对照_20261124.md 第二节；学《小丑牌》「全部亮出来、只有当前那个能点」） ----------
// 一章一页：9 个普通关摆成 3×3（左到右、上到下），下面一张头目大卡，再下面「先练谁」和「开打」。
// Cc 11-24：「一次显示几关……提前看到这一页里一共有几关、最后一关的 Boss 是什么、有什么技能，以及需要哪个宠物特殊出战」
const BOSS_CARD = {
  spit: { name: '大墨怪', does: '每 4 手吐一团墨', fear: '吐完晕了，快打' },
  eat: { name: '大馋嘴', does: '每 3 手啃你两块', fear: '它在嚼的时候，快打' },
  split: { name: '分身王', does: '挨一下蹦一只小怪', fear: '小怪抓光，它就抖' },
};
const MON_KEY = { m: 'ink', A: 'shell', B: 'shell', C: 'shell', J: 'jump', E: 'eat', G: 'moss', T: 'bomb', S: 'split' };
const MON_INTRO = { ink: 'monster', shell: 'shell', jump: 'jumper', eat: 'eat', color: 'color', moss: 'moss', bomb: 'bomb', split: 'split' };
// 这一关出场的墨怪（每种一个，给关卡格画小脸）
function levelMons(st) {
  const out = [], seen = new Set();
  st.board.join('').split('').forEach((ch) => {
    let m = null;
    if (MON_KEY[ch]) m = { t: MON_KEY[ch], hp: ch === 'A' ? 1 : ch === 'B' ? 2 : ch === 'C' ? 3 : 0, cd: 9, tgt: null, col: -1 };
    else if (ch >= '0' && ch <= '6') m = { t: 'color', col: +ch, hp: 0, cd: 0, tgt: null };
    if (!m || seen.has(m.t)) return;
    seen.add(m.t); out.push(m);
  });
  return out;
}
const lvWant = (i) => (i < 4 ? 1 : i < 8 ? 2 : i < 12 ? 3 : i < 16 ? 4 : i < 22 ? 5 : i < 26 ? 6 : 7); // 打到第 i 关，宠物几级最顺（和测量脚本一个估法）
// 「先练谁」：一次只提一只。① 前面最近的专属关点名的那只、等级还不够；② 否则这一章剩下的关里「带它顺」最多、你又没在带的那只
function petToTrain(ch, cur) {
  const lo = ch * 10, hi = Math.min(PLV.length, lo + 10);
  for (let i = Math.max(lo, cur); i < hi; i++) {
    const st = PLV[i];
    if (!st.only) continue;
    const own = ownedOf(st.only);
    if (own && save.pets[own].lv < lvWant(i)) return { id: own, want: lvWant(i), i };
    break;
  }
  const cnt = {};
  for (let i = Math.max(lo, cur); i < hi; i++) { const own = ownedOf(PLV[i].best || PLV[i].only); if (own) cnt[own] = (cnt[own] || 0) + 1; }
  const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  if (top && top !== save.activePet && cnt[top] >= 2) return { id: top, n: cnt[top] };
  return null;
}
// 底栏：一排图标 + 小字（学经典数独首页那一排），代替并排的彩色大按钮
function iconBar(items, y, r) { // r：布局表里的框（游戏修改器拖过就跟着走）
  const x0 = r ? r.x : 16, w = (r ? r.w : W - 32) / items.length;
  items.forEach((it, n) => {
    const cx = x0 + w * n + w / 2, pressed = downBtn === it.id;
    ctx.save(); if (pressed) { ctx.globalAlpha = 0.6; }
    it.icon(cx, y + 18);
    text(it.label, cx, y + 44, 11, COL.dim, 'center', 'normal');
    ctx.restore();
    if (it.dot) { ctx.fillStyle = TH.red; ctx.beginPath(); ctx.arc(cx + 16, y + 6, 5, 0, Math.PI * 2); ctx.fill(); }
    buttons.push({ id: it.id, x: cx - w / 2, y, w, h: 56, fn: it.fn });
  });
}
const ICON = {
  camp: (cx, cy) => gourdIcon(cx, cy, 24),
  album: (cx, cy) => { ctx.strokeStyle = COL.dim; ctx.lineWidth = 2; rr(cx - 12, cy - 10, 24, 20, 4); ctx.stroke(); ctx.fillStyle = COL.dim; ctx.beginPath(); ctx.moveTo(cx - 8, cy + 6); ctx.lineTo(cx - 2, cy - 2); ctx.lineTo(cx + 3, cy + 3); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx + 9, cy + 6); ctx.fill(); },
  classic: (cx, cy) => { for (let n = 0; n < 9; n++) { ctx.fillStyle = n === 4 ? TH.brass : COL.dim; ctx.fillRect(cx - 11 + (n % 3) * 8, cy - 11 + Math.floor(n / 3) * 8, 6, 6); } },
  settings: (cx, cy) => gearIcon(cx, cy, 9, clock * 0.4, COL.dim),
};
let chapView = null, chapSel = null; // 正在看哪一章、选中了哪一关（离开章页就清掉）
function chapterCell(i, x, y, w, h, ctxInfo) {
  const st = PLV[i], { cur, done, locked, ch } = ctxInfo;
  const passed = i < save.petStage, isCur = i === cur && !done, isSel = i === chapSel;
  if (isCur) y -= 4; // 当前这关抬高一截
  if (locked) {
    ctx.fillStyle = TH.card; rr(x, y, w, h, TH.rCell); ctx.fill();
    text('?', x + w / 2, y + h / 2, 20, TH.faint);
  } else if (passed) {
    // 过了的格子换成这一章那张画的一块（9 格拼一整张），只留关号和 ✓
    ctx.save(); rr(x, y, w, h, TH.rCell); ctx.clip();
    const pc = ch % paintCanvas.length, q = art.SIZE / 3, n = i % 10, sh = Math.min(q, (q * h) / w);
    ctx.imageSmoothingEnabled = paintSmooth[pc];
    ctx.drawImage(paintCanvas[pc], (n % 3) * q, Math.floor(n / 3) * q + (q - sh) / 2, q, sh, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = 'rgba(9,12,32,0.35)'; ctx.fillRect(x, y, w, h);
    ctx.restore();
    text(String(i + 1), x + 10, y + 14, 16, COL.text, 'left');
    text('✓', x + w - 14, y + 14, 16, TH.jade);
  } else {
    const future = i > cur;
    ctx.save(); if (future) ctx.globalAlpha = 0.7;
    ctx.fillStyle = isCur ? TH.cardOn : TH.card; rr(x, y, w, h, TH.rCell); ctx.fill();
    const onlyId = st.only ? ownedOf(st.only) || st.only : null;
    if (onlyId) { ctx.strokeStyle = C.blockColors[PG.PETS[onlyId].color][0]; ctx.lineWidth = 2; rr(x + 1, y + 1, w - 2, h - 2, TH.rCell); ctx.stroke(); }
    if (isCur) { ctx.strokeStyle = 'rgba(209,166,80,' + (0.6 + Math.sin(clock * 4) * 0.35) + ')'; ctx.lineWidth = 2; rr(x + 1, y + 1, w - 2, h - 2, TH.rCell); ctx.stroke(); }
    text(String(i + 1), x + 10, y + 14, 16, COL.text, 'left');
    // 难关：两只角；超难：紫角 + 小骷髅
    if (st.hard) {
      ctx.fillStyle = st.hard > 1 ? TH.violet : TH.red;
      for (const sx of [-1, 1]) { const hx = x + w - 18 + sx * 6; ctx.beginPath(); ctx.moveTo(hx - 3, y + 16); ctx.lineTo(hx + sx * 4, y + 5); ctx.lineTo(hx + 3, y + 16); ctx.fill(); }
      if (st.hard > 1) { // 超难：一道紫色小闪电（0.9.4 检验报告 C12：骷髅碰审核红线的边，换掉）
        const bx = x + w - 18, by = y + 14; ctx.fillStyle = '#c58ae0';
        ctx.beginPath(); ctx.moveTo(bx + 2, by - 7); ctx.lineTo(bx - 4, by + 1); ctx.lineTo(bx, by + 1); ctx.lineTo(bx - 2, by + 8); ctx.lineTo(bx + 5, by - 1); ctx.lineTo(bx + 1, by - 1); ctx.closePath(); ctx.fill();
      }
    }
    // 目标：最多两种
    const keys = Object.keys(st.goal).slice(0, 2), gw = w / keys.length;
    keys.forEach((key, k) => {
      const cx = x + gw * k + gw / 2, cy = y + h * 0.48;
      if (key === 'score') { text(st.goal.score + ' 分', cx, cy, 13, COL.text); return; }
      goalIcon(key, cx - 9, cy, 16);
      text(key === 'all' ? '光' : '×' + st.goal[key], cx + 9, cy, 13, COL.text, 'left');
    });
    // 出场墨怪的小脸（没见过的画剪影）
    const mons = levelMons(st);
    mons.slice(0, 3).forEach((m, k) => {
      const mx = x + 14 + k * 18, my = y + h - 14;
      if (!save.introSeen[MON_INTRO[m.t]] && m.t !== 'ink') { ctx.fillStyle = '#05060f'; ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.fill(); text('?', mx, my, 11, TH.faint); }
      else drawMon(m, -1, mx, my, 7);
    });
    if (mons.length > 3) text('+' + (mons.length - 3), x + 14 + 3 * 18, y + h - 14, 11, COL.dim);
    // 宠物：专属关大头像 + 它颜色的框；建议的小头像
    if (onlyId) petIcon(onlyId, x + w - 18, y + h - 18, 26, 0, 0);
    else if (st.best && ownedOf(st.best)) petIcon(ownedOf(st.best), x + w - 14, y + h - 14, 18, 0, 0);
    ctx.restore();
  }
  if (isSel && !isCur) { ctx.strokeStyle = TH.jade; ctx.lineWidth = 2; rr(x - 2, y - 2, w + 4, h + 4, TH.rCell + 2); ctx.stroke(); }
  // 点一下看这关的预览（下面的头目卡换成这关的卡）；再点一下收起
  if (!locked) buttons.push({ id: 'cell' + i, x, y, w, h, fn: () => { chapSel = chapSel === i ? (i === cur ? cur : Math.floor(i / 10) * 10 + 9) : i; P.sound('tap', 0.4); } });
}
// 关卡预览卡（点了上面某一格时，顶替头目卡的位置）：这关要干什么、有什么墨怪、带谁、打没打过。只看，不能从这里开打
function drawLevelPreview(i, x, y, w, h) {
  const st = PLV[i], passed = i < save.petStage, isCur = i === Math.min(save.petStage, PLV.length - 1) && save.petStage < PLV.length;
  panel(x, y, w, h, true);
  text('第 ' + (i + 1) + ' 关', x + 16, y + 22, 20, COL.text, 'left');
  const tag = passed ? '✓ 打过了' : isCur ? '下一关' : '还没到';
  text(tag, x + 16, y + 46, 13, passed ? TH.jade : isCur ? TH.brass : TH.faint, 'left');
  if (st.hard) text(st.hard > 1 ? '超难' : '难关', x + 16, y + 66, 13, st.hard > 1 ? '#c58ae0' : '#f08a70', 'left');
  // 目标
  let gx = x + 108;
  Object.keys(st.goal).forEach((key) => {
    if (key === 'score') { text(st.goal.score + ' 分', gx + 20, y + 24, 16, COL.text); gx += 64; return; }
    goalIcon(key, gx + 10, y + 24, 20); text(key === 'all' ? '抓光' : '×' + st.goal[key], gx + 24, y + 24, 16, COL.text, 'left'); gx += 72;
  });
  // 墨怪：见过的写名字，没见过的画剪影
  const mons = levelMons(st);
  mons.slice(0, 3).forEach((m, k) => {
    const mx = x + 118 + k * 64, my = y + h - 26, seen = save.introSeen[MON_INTRO[m.t]] || m.t === 'ink';
    if (seen) drawMon(m, -1, mx, my, 11); else { ctx.fillStyle = '#05060f'; ctx.beginPath(); ctx.arc(mx, my, 11, 0, Math.PI * 2); ctx.fill(); text('?', mx, my, 13, TH.faint); }
    text(seen ? PG.MON[m.t].name : '？', mx + 16, my, 11, COL.dim, 'left', 'normal');
  });
  // 带谁
  const pid = ownedOf(st.only || st.best);
  if (pid) { petIcon(pid, x + w - 34, y + h / 2 - 8, st.only ? 40 : 32, 0, 0); text(st.only ? '点名' : '最顺', x + w - 34, y + h / 2 + 24, 11, st.only ? C.blockColors[PG.PETS[pid].color][1] : COL.dim, 'center', 'normal'); }
  buttons.push({ id: 'preview', x, y, w, h, fn: () => { chapSel = Math.floor(i / 10) * 10 + 9; } });
}
function drawChapter() {
  drawBg();
  const cur = Math.min(save.petStage, PLV.length - 1), done = save.petStage >= PLV.length;
  const lastCh = Math.floor((PLV.length - 1) / 10), curCh = done ? lastCh : Math.floor(cur / 10);
  if (chapView === null) chapView = curCh;
  const ch = chapView, lo = ch * 10, locked = ch > curCh;
  // 默认选中：本章是当前关；别的章选头目（下面显示头目卡）；锁住的章不选
  if (chapSel === null || (Math.floor(chapSel / 10) !== ch && chapSel >= 0)) chapSel = locked ? -1 : ch === curCh && !done ? cur : lo + 9;
  const top = L.top, info = { cur, done, locked, ch };
  // 顶栏：返回主菜单、章名（两边翻章）、设置
  button('home', 8, top, 92, 44, '‹ 主菜单', { fn: () => { mode = 'home'; } });
  button('settings', W - 56, top, 44, 44, '', { bg: COL.wood, fn: () => { settingsAsk = 0; settingsFrom = 'map'; mode = 'settings'; } });
  gearIcon(W - 34, top + 22, 9, clock * 0.4, COL.dim);
  text(CHAPTER_NAMES[ch] || '第 ' + (ch + 1) + ' 章', W / 2, top + 22, 20, COL.brassLight);
  if (ch > 0) button('chPrev', W / 2 - 134, top + 4, 30, 36, '‹', { fn: () => { chapView = ch - 1; chapSel = null; } });
  if (ch < Math.min(lastCh, curCh + 1)) button('chNext', W / 2 + 104, top + 4, 30, 36, '›', { kind: 'link', fn: () => { chapView = ch + 1; chapSel = null; } });
  // 进度点：9 小 1 大
  for (let n = 0; n < 10; n++) {
    const i = lo + n, x = W / 2 - 66 + n * 13 + (n === 9 ? 3 : 0), r = n === 9 ? 5 : 3;
    ctx.fillStyle = i < save.petStage ? TH.brass : i === cur && !done ? TH.jade : TH.line;
    ctx.beginPath(); ctx.arc(x, top + 52, r, 0, Math.PI * 2); ctx.fill();
  }
  // 下半屏（拇指区）从下往上排：底栏、开打、先练谁、头目卡
  const rG = LY.rect('map.grid'), rB = LY.rect('map.boss'), rT = LY.rect('map.train'), rP = LY.rect('map.play'), rBar = LY.rect('map.bar');
  const barY = rBar.y, btnY = rP.y;
  const train = locked ? null : petToTrain(ch, cur);
  const bossH = rB.h, trainY = rT.y, bossY = rB.y;
  const gy0 = rG.y, gap = 8, cw = (rG.w - gap * 2) / 3;
  const chh = Math.max(40, (rG.h - gap * 2) / 3);
  for (let n = 0; n < 9; n++) { const i = lo + n; if (i < PLV.length) chapterCell(i, rG.x + (n % 3) * (cw + gap), gy0 + Math.floor(n / 3) * (chh + gap), cw, chh, info); }
  // 头目卡：名字 + 心、它会（红爪）、怕（转着的星，和关里它晕的时候头上那颗一样）
  const bi = lo + 9, bst = PLV[bi];
  const previewing = !locked && chapSel >= lo && chapSel < bi && chapSel !== cur;
  if (previewing) drawLevelPreview(chapSel, rB.x, bossY, rB.w, bossH);
  else if (bst) {
    const bk = BOSS_CARD[bst.bossKind || 'spit'], bx = rB.x, bw = rB.w, sel = chapSel === bi;
    panel(bx, bossY, bw, bossH, sel);
    const fx = bx + 52, fy = bossY + bossH / 2 + 4;
    if (locked) { ctx.fillStyle = '#05060f'; ctx.beginPath(); ctx.arc(fx, fy, 30, 0, Math.PI * 2); ctx.fill(); text('？？？', bx + 108, bossY + bossH / 2, 20, TH.faint, 'left'); }
    else {
      inkMonster(fx, fy, 30, true); bossDress(bst.bossKind || 'spit', fx, fy, 30);
      const tx = bx + 100, l1 = bossY + bossH * 0.26, l2 = bossY + bossH * 0.54, l3 = bossY + bossH * 0.78;
      text(bk.name, tx, l1, 20, COL.text, 'left');
      ctx.font = 'bold 20px "PingFang SC", sans-serif';
      heart(tx + ctx.measureText(bk.name).width + 18, l1, 7, true); text('×' + (bst.bigHp || 3), tx + ctx.measureText(bk.name).width + 30, l1, 16, COL.text, 'left');
      ctx.fillStyle = TH.red; ctx.beginPath(); ctx.moveTo(tx, l2 + 6); ctx.lineTo(tx + 4, l2 - 6); ctx.lineTo(tx + 6, l2 + 2); ctx.lineTo(tx + 9, l2 - 6); ctx.lineTo(tx + 12, l2 + 6); ctx.fill();
      text(bk.does, tx + 18, l2, 16, COL.text, 'left', 'normal');
      starShape(tx + 6, l3, 6, TH.jade);
      text(bk.fear, tx + 18, l3, 16, TH.jade, 'left', 'normal');
      const bp = ownedOf(bst.only || bst.best);
      if (bp) { petIcon(bp, bx + bw - 30, bossY + bossH / 2 - 6, 30, 0, 0); text('最顺', bx + bw - 30, bossY + bossH / 2 + 20, 11, COL.dim, 'center', 'normal'); }
      if (bi < save.petStage) { ctx.save(); ctx.translate(fx, fy); ctx.rotate(-0.25); ctx.strokeStyle = TH.red; ctx.lineWidth = 3; rr(-34, -14, 68, 28, 6); ctx.stroke(); text('打倒了', 0, 0, 16, TH.red); ctx.restore(); }
    }
    if (!locked) buttons.push({ id: 'cell' + bi, x: bx, y: bossY, w: bw, h: bossH, fn: () => { chapSel = bi; P.sound('tap', 0.4); } });
  }
  // 先练谁（没话说就不出现）：点它去营地
  if (train) {
    const tw = rT.w, th = rT.h, tx0 = rT.x, mid = trainY + th / 2, rec = save.pets[train.id], need = EXP_NEED[rec.lv] || 999;
    ctx.fillStyle = TH.card; rr(tx0, trainY, tw, th, th / 2); ctx.fill();
    ctx.strokeStyle = TH.line; ctx.lineWidth = 1; rr(tx0 + 0.5, trainY + 0.5, tw - 1, th - 1, th / 2); ctx.stroke();
    petIcon(train.id, tx0 + 22, mid, 24, 0, 0);
    text('先练' + PG.PETS[train.id].name, tx0 + 40, mid, 16, COL.text, 'left');
    const sx = tx0 + 132;
    if (train.want) {
      text(rec.lv + ' 级', sx, mid, 13, COL.dim, 'left', 'normal');
      ctx.fillStyle = TH.line; rr(sx + 30, mid - 3, 52, 6, 3); ctx.fill();
      ctx.fillStyle = TH.jade; rr(sx + 30, mid - 3, Math.max(4, 52 * Math.min(1, rec.exp / need)), 6, 3); ctx.fill();
      text(train.want + ' 级', sx + 88, mid, 13, COL.dim, 'left', 'normal');
    } else text('后面 ' + train.n + ' 关带它顺', sx, mid, 13, COL.dim, 'left', 'normal');
    text('去喂 ›', tx0 + tw - 14, mid, 13, COL.dim, 'right', 'normal');
    buttons.push({ id: 'train', x: tx0, y: trainY, w: tw, h: th, fn: () => openCamp() });
  }
  // 底部大按钮永远是「继续 · 第 N 关」（Cc 11-24：「底下的这个选项不应该变……我没法跳关，我当然是打第 14 关了」）。
  // 不管上面选中哪一格、翻到哪一章，点了都开打当前关；点上面的格子只是看预览。打过的关不从这里重打（学 Royal Match）
  if (done) button('play', rP.x, btnY, rP.w, rP.h, '全部过关 · 新关卡在做', { kind: 'sub', size: 16, fn: () => {} });
  else {
    const cst = PLV[cur], who = cst.only ? ' · ' + PG.PETS[ownedOf(cst.only) || cst.only].name + '上场' : '';
    button('play', rP.x, btnY, rP.w, rP.h, '继续 · 第 ' + (cur + 1) + ' 关' + who, { size: 20, fn: () => newPetLevel(cur) });
  }
  // 底栏去掉了（0.9.7，Cc 11-25：「经典拼画有啥用啊？……画册有啥用啊？……营地有啥用啊？……这都删了吧」）。过关后照旧回营地那一页；给宠物升级还能从上面「先练谁」进
}

// ---------- 新东西的说明卡（一张小动画 + 一两行字 +「继续」） ----------
const INTRO = {
  gem: { title: '收集宝石', lines: ['宝石所在的那一排或那个大格', '一消掉，就收走它'], row: ['b', 'g', 'b', '.', 'b'], key: 'b' },
  box: { title: '机关匣', lines: ['它自己消不掉。它在的那一排', '或大格每消掉一次，收一个'], row: ['b', 'M', 'b', '.', 'b'], key: 'box' },
  bubble: { title: '泡泡', lines: ['先把块放到泡泡上，', '再消掉那一格，泡泡就破'], row: ['b', 'b', '*', 'b', 'b'], key: 'bubble' },
  // 0.5 宠物线
  monster: { title: '小墨怪', lines: ['它蹲在哪一排，', '把那一排消掉，就抓到它'], row: ['b', 'm', 'b', '.', 'b'], key: 'monster' },
  pet: { title: '铜雀攒能量', lines: ['你每消掉一排，它攒一格；攒满了，', '它吐一块技能块到右下角，拖到墨怪旁边'], pet: 'tongque' },
  gold: { title: '金色能让它攒得更快', lines: ['消掉金色的方块，金光飞到铜雀身上，', '每 3 块多攒一格能量'], pet: 'tongque', glow: true },
  rock: { title: '铁石', lines: ['你消不掉它：', '宠物的技能块才打得碎'], rockPic: true },
  boss: { title: '大墨怪', lines: ['它占四格，消不掉；', '它在的那一排每消一次，打它一下'], pet: null, bossPic: true },
  baozhu: { title: '爆竹鼠出战', lines: ['它的技能块炸一圈；', '跳跳怪、分身怪、铁石怕它'], pet: 'baozhu' },
  modou: { title: '墨斗蚕出战', lines: ['它的技能块斜着打一个叉；', '馋嘴怪、墨苔怪怕它'], pet: 'modou' },
  gempiece: { title: '块上的宝石', lines: ['发下来的块上也有宝石：', '放下去，再把那一排消掉'], row: ['b', 'b', 'b', '.', 'b'], key: 'b' },
  shell: { title: '甲壳怪', lines: ['每消一次掉一层甲，甲掉光再消就抓到；', '铜雀的技能块一下连甲抓走'], monPic: { t: 'shell', hp: 2 } },
  eat: { title: '馋嘴怪', lines: ['每隔几手啃掉身边一块（先亮牙印）；', '墨斗蚕的技能块一下抓走它'], monPic: { t: 'eat', tgt: 1 } },
  color: { title: '挑色怪', lines: ['那一排里要有它身上的颜色才打得到；', '同色的宠物一下抓走它'], monPic: { t: 'color', col: 1 } },
  moss: { title: '墨苔怪', lines: ['每隔几手往身边长一块墨（先冒黑泡）；', '墨斗蚕的技能块一下抓走它'], monPic: { t: 'moss' } },
  bomb: { title: '炸弹怪', lines: ['数字每放一块少 1，到 0 溅一圈墨；', '火麒麟的技能块一下拆掉它'], monPic: { t: 'bomb', cd: 3 } },
  split: { title: '分身怪', lines: ['打它一下，它裂成两只小墨怪；', '爆竹鼠的技能块抓它，不会裂'], monPic: { t: 'split' } },
  boss2: { title: '大馋嘴', lines: ['每隔几手啃掉身边两块（先亮牙印）；', '墨斗蚕的技能块打它，一下掉 3 颗心'], bossPic: 'eat' },
  boss3: { title: '分身王', lines: ['每挨一下，身边蹦出一只小墨怪；', '爆竹鼠的技能块打它，一下掉 3 颗心'], bossPic: 'split' },
  jumper: { title: '跳跳怪', lines: ['每放 3 块它跳一格；', '爆竹鼠炸一圈，它跳不掉'], jumperPic: true },
  wave: { title: '墨怪一波一波来', lines: ['这一波抓光了，下一波从墨里冒出来；', '你放的块都还在'], row: ['b', 'm', 'b', '.', 'b'], key: 'monster' },
  qilin: { title: '火麒麟出战', lines: ['它的技能块竖着烧一条；', '炸弹怪怕它'], pet: 'qilin' },
  steal: { title: '墨怪会偷能量', lines: ['冒紫闪电的墨怪，下一手偷宠物能量；', '克它的宠物不怕偷'], monPic: { t: 'shell', hp: 1 } },
  acts: { title: '让宠物多出手', lines: ['顶上画着几个宠物头像，', '它出手几次才算过关'], pet: null, actsPic: true },
};
// 关卡卡片：第几关、难不难、目标、谁出战（被点名换人时演一下换人），点「开打」进关
function drawStartCard() {
  const c = startCard, st = PLV[c.i], age = clock - c.t, ease = Math.min(1, age * 4);
  ctx.fillStyle = COL.shade + (0.78 * ease) + ')'; ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - 40, 330), ph = 340, px = (W - pw) / 2, py = (H - ph) / 2 - 20 + (1 - ease) * 30;
  ctx.save(); ctx.globalAlpha = ease;
  panel(px, py, pw, ph);
  text('第 ' + (c.i + 1) + ' 关', W / 2, py + 40, 28, COL.brassLight);
  if (st.hard) text(st.hard > 1 ? '超难关' : '难关', W / 2, py + 70, 13, st.hard > 1 ? '#c58ae0' : '#f08a70');
  else if (st.goal.boss) text(BOSS_CARD[st.bossKind || 'spit'].name, W / 2, py + 70, 13, '#f08a70');
  // 目标
  const keys = Object.keys(st.goal), cw = 76, gx0 = W / 2 - (cw * keys.length) / 2;
  keys.forEach((key, n) => {
    const cx = gx0 + cw * n + cw / 2, cy = py + 110;
    if (key === 'score') { text(st.goal.score + ' 分', cx, cy, 20, COL.text); return; }
    goalIcon(key, cx - 14, cy, 26); text(key === 'all' ? '抓光' : key === 'boss' ? '×' + (st.bigHp || 3) + '♥' : '×' + st.goal[key], cx + 6, cy, 16, COL.text, 'left');
  });
  // 谁出战
  const pid = g.team[0] && g.team[0].id;
  if (pid) {
    const pyy = py + 178;
    if (c.forced && c.from && save.pets[c.from]) {
      // 换人：原来那只往左退、变灰；点名的那只从右边跳进来
      const t = Math.min(1, Math.max(0, (age - 0.25) * 2.5));
      ctx.globalAlpha = ease * (1 - t * 0.6); petIcon(c.from, W / 2 - 50 - t * 20, pyy, 40, 0, 0); ctx.globalAlpha = ease;
      text('→', W / 2, pyy, 20, COL.dim);
      petIcon(pid, W / 2 + 50 + (1 - t) * 40, pyy - Math.sin(t * Math.PI) * 14, 52, 0, t >= 1 ? 0 : 0.2);
      text('这关点名 ' + PG.PETS[pid].name + ' 出战', W / 2, pyy + 46, 16, C.blockColors[PG.PETS[pid].color][1]);
    } else {
      petIcon(pid, W / 2, pyy, 56, g.team[0].lv, 0);
      text(PG.PETS[pid].name + ' 出战', W / 2, pyy + 46, 16, COL.text);
    }
  }
  ctx.restore();
  button('startGo', px + 24, py + ph - 70, pw - 48, 52, '开打', { size: 20, fn: () => { mode = c.next || 'play'; startCard = null; g.startMs = P.now(); P.sound('select', 0.6); } });
}
function drawIntro() {
  const it = INTRO[introKind];
  ctx.fillStyle = COL.shade + '0.8)'; ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - 40, 340), ph = 330, px = (W - pw) / 2, py = (H - ph) / 2 - 30;
  panel(px, py, pw, ph);
  text(it.title, W / 2, py + 40, 28, COL.brassLight);
  if (!it.row) {
    // 宠物 / 头目：画一个大图，下面两行字
    const cy = py + 118;
    if (it.bossPic) { inkMonster(W / 2, cy, 42, true); bossDress(it.bossPic, W / 2, cy, 42); }
    else if (it.monPic) drawMon(it.monPic, -1, W / 2, cy, 40);
    else if (it.actsPic) petIcon((g && g.team && g.team[0] && g.team[0].id) || save.activePet || 'tongque', W / 2, cy, 84, 0, Math.sin(clock * 3) * 0.1); // 画正带着的那只
    else if (it.armorPic) armorMonster(W / 2, cy, 40, Math.max(0, Math.sin(clock * 3)) * 0.3);
    else if (it.jumperPic) jumperMonster(W / 2, cy, 40, null, 0);
    else if (it.rockPic) ironRock(W / 2 - 40, cy - 40, 80);
    else if (it.pet) {
      petIcon(it.pet, W / 2, cy, 84, 1, Math.sin(clock * 3) * 0.1);
      if (it.glow) for (let n = 0; n < 5; n++) { const a2 = (clock * 1.2 + n / 5) % 1; ctx.globalAlpha = 1 - a2; ctx.fillStyle = C.blockColors[0][1]; ctx.beginPath(); ctx.arc(W / 2 - 90 + a2 * 70, cy + 40 - a2 * 40, 5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    }
    it.lines.forEach((ln, n) => text(ln, W / 2, py + 196 + n * 28, 17, COL.text, 'center', 'normal'));
    button('introOk', px + 30, py + ph - 76, pw - 60, 54, '继续', { size: 24, fn: () => { save.introSeen[introKind] = true; persist(); introKind = null; mode = 'play'; } });
    return;
  }
  // 小动画：一行 5 格，一块落进空格 → 这行消掉 → 东西飞走（2.2 秒一轮）
  const cs = Math.min(46, (pw - 60) / 5), x0 = W / 2 - cs * 2.5, y0 = py + 80;
  const a = (clock % 2.2) / 2.2;
  const hole = it.row.indexOf('.') >= 0 ? it.row.indexOf('.') : it.row.indexOf('*');
  const cleared = a > 0.45 && a < 0.92;
  const gemCell = it.row.indexOf('g');
  for (let n = 0; n < 5; n++) {
    const x = x0 + n * cs;
    ctx.fillStyle = n % 2 ? COL.cellC : COL.cellD; ctx.fillRect(x, y0, cs, cs);
    const ch = it.row[n];
    if (ch === 'M') { chest(x, y0, cs); continue; }
    if (cleared) continue;
    if (ch === 'm') { inkMonster(x + cs / 2, y0 + cs / 2, cs * 0.4, false); continue; }
    if (ch === 'b' || ch === 'g') { block(x, y0, cs, 1, -1); if (ch === 'g') gem(x, y0, cs, 1); }
  }
  // 落下来的那块
  if (a < 0.45) {
    const k = Math.min(1, a / 0.3);
    const yy = y0 - cs * 1.6 * (1 - k * k);
    block(x0 + hole * cs, yy, cs, 1, 3);
  }
  if (it.row[hole] === '*' && !cleared) bubbleAt(x0 + hole * cs, y0, cs);
  if (a > 0.45 && a < 0.55) { ctx.fillStyle = 'rgba(255,240,200,0.7)'; ctx.fillRect(x0, y0, cs * 5, cs); }
  // 收走的东西往上飞
  if (cleared) {
    const k = (a - 0.45) / 0.47;
    const from = it.key === 'box' ? it.row.indexOf('M') : it.key === 'bubble' ? hole : it.key === 'monster' ? it.row.indexOf('m') : gemCell;
    ctx.globalAlpha = 1 - k;
    goalIcon(it.key, x0 + from * cs + cs / 2, y0 + cs / 2 - k * 30, cs * 0.8);
    text('+1', x0 + from * cs + cs / 2 + cs * 0.6, y0 - k * 30, 18, COL.jade);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = COL.brass; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, cs * 5, cs);
  it.lines.forEach((ln, n) => text(ln, W / 2, y0 + cs + 40 + n * 28, 18, COL.text, 'center', 'normal'));
  const bw = pw - 60;
  button('introOk', px + 30, py + ph - 84, bw, 58, '继续', { size: 24, fn: () => { save.introSeen[introKind] = true; persist(); introKind = null; mode = 'play'; } });
}

// ---------- 画册 ----------
let albumFrom = 'play';
function openAlbum() {
  albumFrom = mode === 'over' ? 'over' : mode === 'map' ? 'map' : mode === 'home' ? 'home' : 'play';
  if (albumFrom === 'play' && g && !g.over) { /* 画册打开时时间也走：原型里先这样，开局前看 */ }
  mode = 'album';
}
function drawAlbum() {
  drawBg();
  text('画册', W / 2, L.top + 22, 28, COL.brassLight);
  text(save.coins + ' 金', W - 20, L.top + 22, 18, COL.brassLight, 'right');
  const s = Math.min((W - 60) / 3, 120);
  const gap = (W - s * 3) / 4;
  for (let i = 0; i < 3; i++) {
    const x = gap + i * (s + gap), y = L.top + 64;
    drawPainting(i, x, y, s, save.won[i] ? new Array(9).fill(true) : save.litEver[i], false);
    const n = save.litEver[i].filter(Boolean).length;
    text(art.PAINTINGS[i].name, x + s / 2, y + s + 18, 14, COL.text, 'center', 'normal');
    text(save.won[i] ? '✓ 拼成' : n + ' / 9', x + s / 2, y + s + 38, 13, save.won[i] ? COL.jade : COL.dim, 'center', 'normal');
  }
  // 三件收藏
  let y = L.top + 64 + s + 80;
  text('机关收藏', W / 2, y, 18, COL.brassLight);
  y += 30;
  ITEMS.forEach((it, i) => {
    const have = !!save.items[it.id];
    const yy = y + i * 44;
    gearIcon(44, yy, 12, have ? clock : 0, have ? COL.brass : COL.woodLine);
    text(have ? it.name : '？？？', 68, yy, 17, have ? COL.text : COL.dim, 'left');
    text(have ? it.tip : '拼成第 ' + (i + 1) + ' 张画', W - 24, yy, 14, have ? COL.jade : COL.dim, 'right', 'normal');
  });
  y += 3 * 44 + 16;
  // 当局小道具
  const on = save.buySingle;
  button('single', 24, y, W - 48, 46, (on ? '✓ ' : '') + '下局带一个单格块 · ' + C.singleCost + ' 金', {
    size: 16, bg: on ? COL.jade : COL.wood, fg: on ? COL.ink : COL.text,
    fn: () => { if (on || save.coins >= C.singleCost) { save.buySingle = !on; persist(); } },
  });
  y += 60;
  const endlessOpen = save.wins >= 2;
  button('endless', 24, y, W - 48, 46, endlessOpen ? '无尽模式 · 最高 ' + save.bestEndless : '无尽模式（拼成 2 张画开放）', {
    size: 16, bg: endlessOpen ? COL.copper : COL.woodDark, fg: endlessOpen ? COL.text : COL.dim,
    fn: () => endlessOpen && newGame(true),
  });
  const bw = Math.min(W - 60, 300);
  button('back', (W - bw) / 2, H - 96, bw, 60, albumFrom === 'over' && !g.stage ? '再来' : '回去', {
    size: 24, fn: () => (albumFrom === 'home' ? (mode = 'home') : albumFrom === 'map' ? (mode = 'map') : albumFrom === 'over' ? (g.stage ? (mode = 'over') : newGame(g.endless && save.wins >= 2)) : (mode = 'play')),
  });
}

// ---------- 主菜单：标题 + 继续 + 设置 ----------
// （正式的标题背景图等 Midjourney 主页图到了再换；现在是代码画的九宫格 + 宠物）
function drawHome() {
  drawBg();
  const cy = L.top + 150;
  if (homeArtImg) {
    // 主视觉铺满整屏（上三成留给标题），上下各压一层渐暗，字和按钮看得清
    // 图整体往下挪一截（图里机关雀飞在上面，标题不压在它身上），顶上空出来的一条用夜空色接上、渐变盖住接缝
    // 0.8.4：整张底图（缩放 + 顶上夜空 + 上下渐暗）只画一次，存进离屏画布，以后每帧原样贴上（每帧缩放一张 1080×1920 的大图会卡）
    if (!homeArtCache) {
      homeArtCache = P.makeCanvas(Math.round(W * dpr), Math.round(H * dpr));
      withCtx(homeArtCache.getContext('2d'), () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const sc = Math.max(W / homeArtImg.width, H / homeArtImg.height), dw = homeArtImg.width * sc, dh = homeArtImg.height * sc;
        const off = Math.round(H * 0.09) + L.top;
        ctx.fillStyle = '#0d1430'; ctx.fillRect(0, 0, W, off + 2);
        ctx.drawImage(homeArtImg, (W - dw) / 2, (H - dh) / 2 + off, dw, dh);
        const gt = ctx.createLinearGradient(0, off - 4, 0, off + H * 0.16); gt.addColorStop(0, 'rgba(13,20,48,1)'); gt.addColorStop(0.35, 'rgba(13,20,48,0.75)'); gt.addColorStop(1, 'rgba(13,20,48,0)');
        ctx.fillStyle = gt; ctx.fillRect(0, off - 4, W, H * 0.16 + 4);
        const gb = ctx.createLinearGradient(0, H * 0.7, 0, H); gb.addColorStop(0, 'rgba(9,12,32,0)'); gb.addColorStop(1, 'rgba(9,12,32,0.85)');
        ctx.fillStyle = gb; ctx.fillRect(0, H * 0.7, W, H * 0.3);
      });
    }
    ctx.drawImage(homeArtCache, 0, 0, W, H);
    const rTi = LY.rect('home.title'), kt = LY.k('home.title', rTi);
    text('九宫消', rTi.x + rTi.w / 2, rTi.y + rTi.h * 0.35, Math.round(44 * kt), COL.brassLight);
    text('汐娘的机关工坊', rTi.x + rTi.w / 2, rTi.y + rTi.h * 0.82, Math.round(13 * kt), COL.dim, 'center', 'normal');
    drawHomeButtons(cy);
    return;
  }
  // 九宫格徽记：黄铜框，正中间一格亮着
  const s = 34, x0 = W / 2 - s * 1.5 - 4, y0 = cy - s * 1.5 - 4;
  ctx.fillStyle = COL.ink; rr(x0 - 10, y0 - 8, s * 3 + 28, s * 3 + 28, 14); ctx.fill();
  ctx.fillStyle = COL.copper; rr(x0 - 10, y0 - 10, s * 3 + 28, s * 3 + 28, 14); ctx.fill();
  for (let n = 0; n < 9; n++) {
    const x = x0 + (n % 3) * (s + 4), y = y0 + Math.floor(n / 3) * (s + 4);
    if (n === 4) block(x, y, s, 1, 0, Math.sin(clock * 3) > 0);
    else { ctx.fillStyle = n % 2 ? COL.cellC : COL.cellA; ctx.fillRect(x, y, s, s); }
  }
  // 宠物绕着转
  save.petOrder.slice(0, 4).forEach((id, n, arr) => {
    const a = clock * 0.6 + (n / arr.length) * Math.PI * 2;
    petIcon(id, W / 2 + Math.cos(a) * 110, cy + Math.sin(a) * 70, 40, 0, 0);
  });
  text('九宫消', W / 2, cy + 116, 44, COL.brassLight);
  text('汐娘的机关工坊', W / 2, cy + 156, 16, COL.dim, 'center', 'normal');
  drawHomeButtons(cy);
}
function drawHomeButtons(cy) {
  const rM = LY.rect('home.main'), rBr = LY.rect('home.bar'); // 主按钮贴着底栏上面，在拇指区（游戏修改器里能拖）
  const cur = Math.min(save.petStage, PLV.length - 1);
  button('homePlay', rM.x, rM.y, rM.w, rM.h, save.petStage ? '继续 · ' + petLevelName(cur) : '开始', { size: 20, fn: () => { chapView = null; chapSel = null; mode = 'map'; } });
  // 0.8：只留一个金色大按钮，其余收成底栏图标（学经典数独首页）
  iconBar([
    // 营地、画册、经典拼画三个入口去掉了（0.9.7，Cc 11-25：「像是自己给自己搞复杂的乱七八糟的东西」）
    { id: 'homeSettings', label: '设置', icon: ICON.settings, fn: () => { settingsAsk = 0; settingsFrom = 'home'; mode = 'settings'; } },
  ], rBr.y, rBr);
  text('试玩版 ' + VERSION, W / 2, H - 18, 11, TH.faint, 'center', 'normal');
}

// ---------- 设置：声音、振动、重新开始（Cc 11-24：「没有设置页，没法让我重新开始……退不回主菜单」） ----------
let settingsFrom = 'home';
let copyMsg = null; // 「复制试玩记录」之后的一句提示
let settingsAsk = 0; // 「重新开始」要点两下：第一下变成「真的清空？」，3 秒内再点才清
P.setMuted(!!save.muted);
const _vibrate = P.vibrate;
P.vibrate = (strong) => { if (!save.noVibrate) _vibrate(strong); };
function drawSettings() {
  drawBg();
  text('设置', W / 2, L.top + 30, 28, COL.brassLight);
  const bw = Math.min(W - 60, 320), bx = (W - bw) / 2;
  let y = L.top + 90;
  button('setSound', bx, y, bw, 58, '声音：' + (save.muted ? '关' : '开'), { size: 22, bg: save.muted ? COL.woodDark : COL.copper, fn: () => { save.muted = !save.muted; P.setMuted(save.muted); persist(); } });
  y += 76;
  button('setVibe', bx, y, bw, 58, '振动：' + (save.noVibrate ? '关' : '开'), { size: 22, bg: save.noVibrate ? COL.woodDark : COL.copper, fn: () => { save.noVibrate = !save.noVibrate; persist(); if (!save.noVibrate) _vibrate(false); } });
  y += 96;
  const asking = settingsAsk && clock - settingsAsk < 3;
  button('setReset', bx, y, bw, 58, asking ? '真的清空？再点一次' : '重新开始', { size: 22, bg: COL.red, danger: true, fn: () => {
    if (!asking) { settingsAsk = clock; return; }
    // 清空所有进度（宠物、关卡、葫芦、金币、画册……），从第 1 关重新来
    const keepCuts = save.cutSeen, keepLog = save.playLog; save = freshSave(); save.cutSeen = keepCuts || {}; save.playLog = keepLog || []; persist(); // 试玩记录也留着
    P.setMuted(false);
    settingsAsk = 0;
    newPetLevel(0);
  } });
  text(asking ? '宠物、关卡、葫芦、金币全部清空，回到第 1 关' : '清空所有进度，从第 1 关重新玩', W / 2, y + 80, 14, asking ? COL.red : COL.dim, 'center', 'normal');
  // 试玩记录：复制出来贴给 Kira（难度表的「真人」那一列）
  const nLog = (save.playLog || []).length;
  button('setCopyLog', bx, H - 168, bw, 44, copyMsg && clock - copyMsg.t < 2.5 ? copyMsg.text : '复制试玩记录（' + nLog + ' 局）', { kind: 'sub', size: 13, fn: () => {
    P.copyText(JSON.stringify({ game: '九宫消', ver: VERSION, log: save.playLog || [] }), (ok) => { copyMsg = { text: ok ? '已复制，粘贴给 Kira 就行' : '复制不了：截个图给 Kira', t: clock }; });
  } });
  button('setBack', bx, H - 100, bw, 60, settingsFrom === 'map' ? '回地图' : '回主菜单', { size: 24, fn: () => { mode = settingsFrom; } });
}

// ---------- 九宫消 + 宠物（0.5）：画面和局外 ----------
// 规则在 petgame.js，关卡在 petlevels.js，设计见 ../九宫消加宠物_设计与调研_20261124.md
let petIdx = 0; // 宠物章节第几关（0 起）
let petFx = { pop: {}, caption: null, banner: null, bossHit: -9, evolveFlash: -9 };
let petMsg = null; // 地图 / 营地上的一句提示 { text, t }
const PET_GLYPH = { tongque: '雀', jinchique: '翅', baozhu: '鼠', modou: '蚕', qilin: '麟' };
// 第 n 级升到 n+1 级要多少经验。经验从哪来：出战打一关（宠物每出手一次 +1，过关再 +3，没过 +1）、喂一颗丹 +2
// Cc 11-24：「刚拿到宠物直接就升到 5 级……游戏时长会变得太短」→ 门槛提高，铜雀大约要打十几关才够进化
// 0.9.8（Fable 宠物重做第五节）：只有丹能升级，出战不涨经验。升一级要几颗丹：到 5 级共 14 颗，到 10 级再 50 颗，到 15 级再 100 颗。rec.exp = 这一级已经喂了几颗
const EXP_NEED = [0, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 999];
const DAN_EXP = 1;
const LV_CAP = 15;
function petNodeLabel(i) { return String(i + 1); }
const CHAPTER_NAMES = ['第一章 · 工坊后院', '第二章 · 水车坊', '第三章 · 染坊'];
const chapterName = (i) => CHAPTER_NAMES[Math.min(CHAPTER_NAMES.length - 1, Math.floor(i / 10))];
function petLevelName(i) {
  if (i === undefined) i = petIdx;
  const st = PLV[i];
  if (g && g.stage && g.stage.evolve && i === petIdx) return '进化关 · ' + PG.PETS[g.stage.evolve.pet].name;
  return '第 ' + (i + 1) + ' 关';
}
// 只带一只出战（Cc 11-24：「宠物应该只能带一个才对……在营地里选好了之后就不变了」）
function ownedTeam() {
  if (!save.activePet || !save.pets[save.activePet]) save.activePet = save.petOrder[0] || null;
  return save.activePet ? [{ id: save.activePet, lv: save.pets[save.activePet].lv }] : [];
}
// 宠物头像：彩色圆章 + 一个字；进化后的多一圈金翅
function petIcon(id, x, y, s, lv, pop) {
  const d = PG.PETS[id];
  const k = 1 + (pop || 0) * 0.3, r = (s / 2) * k;
  if (petArtImg[id]) {
    // 正式头像：抠好底的图直接画，不加圈（Cc 11-25：「宠物旁边不用放一个金圈啊，金圈压住了宠物，很丑」）
    ctx.drawImage(petArtImg[id], x - r * 1.15, y - r * 1.2, r * 2.3, r * 2.3);
    if (lv) text('Lv' + lv, x + r * 0.9, y + r * 0.85, Math.max(11, Math.round(s * 0.2)), COL.brassLight);
    return;
  }
  const col = C.blockColors[d.color];
  if (id === 'jinchique') {
    ctx.fillStyle = COL.brassLight;
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sx * r * 0.6, y - r * 0.2); ctx.lineTo(x + sx * r * 1.55, y - r * 0.9); ctx.lineTo(x + sx * r * 1.3, y + r * 0.1); ctx.lineTo(x + sx * r * 1.5, y + r * 0.3); ctx.lineTo(x + sx * r * 0.7, y + r * 0.4); ctx.fill(); }
  }
  ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(x, y + 2, r + 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col[0]; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col[2]; ctx.beginPath(); ctx.arc(x + r * 0.15, y + r * 0.15, r * 0.82, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col[0]; ctx.beginPath(); ctx.arc(x - r * 0.05, y - r * 0.05, r * 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,246,214,0.75)'; ctx.fillRect(x - r * 0.5, y - r * 0.62, r * 0.55, Math.max(2, r * 0.1));
  text(PET_GLYPH[id] || '?', x, y + 1, Math.round(s * 0.46 * k), COL.text);
  if (lv) text('Lv' + lv, x + r * 0.9, y + r * 0.85, Math.max(11, Math.round(s * 0.2)), COL.brassLight);
}
// 专属关（0.8）：点名的宠物有没有（进化后的也算）；这一关实际带谁、几级
function ownedOf(id) { if (!id) return null; if (save.pets[id]) return id; const e = PG.PETS[id] && PG.PETS[id].evo; return e && save.pets[e] ? e : null; }
function levelTeam(st, i, lendLv) {
  if (!st.only) return ownedTeam();
  const own = ownedOf(st.only);
  let lv = own ? save.pets[own].lv : 0;
  if (st.lend && save.petStage <= i) lv = Math.max(lv, st.lend); // 第一次打：借的和自己的取高的
  if (lendLv) lv = Math.max(lv, lendLv); // 连输两次后「借一只」
  return [{ id: own || st.only, lv: Math.max(1, lv) }];
}
function newPetLevel(i, quiet, lendLv) { // quiet：只把盘面摆好、不放过场（开机时给老玩家垫底用）；lendLv：借一只几级的
  const st0 = PLV[i];
  if (!st0) return;
  if (st0.evolveLevel) {
    // 进化关：要那只宠物够等级
    const id = st0.evolveLevel, rec = save.pets[id];
    if (!rec || rec.lv < PG.PETS[id].evoLv) {
      // 已经进化过了：这一关算过，直接去下一关
      if (save.pets[PG.PETS[id].evo]) { save.petStage = Math.max(save.petStage, i + 1); persist(); return newPetLevel(i + 1); }
      petMsg = { text: PG.PETS[id].name + ' 要 ' + PG.PETS[id].evoLv + ' 级才能进化：去营地喂丹', t: clock };
      return openCamp();
    }
    return newEvolution(id, i);
  }
  petIdx = i; stageIdx = -1;
  // 专属关：点名的那只自动换上，只管这一关（营地里选的出战宠物不改）；第 4 关的「充得特别快」只有第一次
  const team = levelTeam(st0, i, lendLv);
  const st1 = Object.assign({}, st0, { fastCharge: !!st0.fastCharge && save.petStage <= i });
  // 保底（0.9，学 Candy Crush 的悄悄降难度）：同一关连输 3 次，下一局发的三块一定都放得下、大块少一点；屏幕上什么都不显示
  if (save.loss && save.loss[i] >= 3) { st1.luck = 1; st1.d = Math.max(0, (st0.d || 0) - 0.15); }
  g = PG.createPetGame({ stage: st1, team, seed: (P.now() ^ (save.plays * 2654435761)) >>> 0, tutorial: i === 0 && !save.petTutDone });
  g.onlyPet = st0.only ? team[0].id : null;
  chapView = null; chapSel = null;
  startPet(st1);
  // 进关前一张关卡卡片（0.9.5，Cc 11-25：「进入游戏关卡的时候进太快了，没有这个仪式感」「我刚刚没派蚕出战，他怎么就出来了？……你得告诉我啊」）
  g.startMs = P.now();
  if (!quiet && save.petTutDone) { startCard = { t: clock, i, forced: !!(g.onlyPet && save.activePet && save.activePet !== g.onlyPet), from: save.activePet, next: mode }; mode = 'start'; }
  if (g.onlyPet && save.activePet !== g.onlyPet) { petFx.pop[g.onlyPet] = clock + 0.15; P.sound('select', 0.5); } // 被点名的那只跳进来
  // 这一章第一次开打：先放这章的开场（镜头摇过全景，硬切推到大墨怪）
  if (!quiet && i % 10 === 0 && !save.cutSeen['chapter' + i / 10]) { CUT.chapter(i / 10); playCuts(); }
}
function newEvolution(id, levelIdx) {
  petIdx = levelIdx === undefined ? PLV.findIndex((x) => x.evolveLevel === id) : levelIdx;
  stageIdx = -1;
  const st = PLV.evolveStage(id, PG.PETS[id].color);
  g = PG.createPetGame({ stage: st, team: [{ id, lv: save.pets[id].lv }], seed: (P.now() ^ (save.plays * 2654435761)) >>> 0 });
  startPet(st);
  petFx.banner = { text: '用' + PG.COLOR_NAME[PG.PETS[id].color] + '方块，把正中间的大格一格格点亮', t: clock };
}
function startPet(st) {
  startCommon();
  timeline = []; ghosts = []; petRuns = []; beams = []; colBolts = []; petInk = []; drainInk = []; // 上一关没演完的动画清掉，免得新盘面上闪一下
  for (let k = 0; k < 81; k++) if (g.board[k] === 1) colorAt[k] = g.color[k];
  petFx = { pop: {}, caption: null, banner: st.line ? { text: st.line, t: clock + 0.3 } : null, bossHit: -9, evolveFlash: -9 };
  if (st.intro && !save.introSeen[st.intro]) { introKind = st.intro; mode = 'intro'; }
}
function petPos(n) {
  const cnt = Math.max(1, g.team.length), gap = Math.min(116, (W - 40) / cnt);
  return { x: W / 2 + (n - (cnt - 1) / 2) * gap, y: L.top + 96 };
}
// 宠物栏：头像 + 脚下一条分格能量条
function drawPetBar() {
  if (!g.team.length) return;
  g.team.forEach((pt, n) => {
    const p = petPos(n), d = PG.PETS[pt.id];
    const pop = petFx.pop[pt.id] ? Math.max(0, 0.3 - (clock - petFx.pop[pt.id])) / 0.3 : 0;
    const max = PG.energyMax(g, pt);
    const full = !g.hand[3] && pt.energy >= max - 1 && pt.energy > 0;
    const dAge = petFx.drained && petFx.drained[pt.id] !== undefined ? clock - petFx.drained[pt.id] : 9; // 刚被偷了能量：头像抖、能量条闪红
    if (dAge < 0.5) { p.x += Math.sin(clock * 60) * 4 * (1 - dAge * 2); ctx.fillStyle = 'rgba(226,85,59,' + (0.5 - dAge) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, Math.PI * 2); ctx.fill(); }
    if (full) { ctx.strokeStyle = 'rgba(243,210,122,' + (0.4 + Math.sin(clock * 8) * 0.3) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, Math.PI * 2); ctx.stroke(); }
    if (petOut(pt.id)) { ctx.strokeStyle = COL.woodLine; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    else petIcon(pt.id, p.x, p.y, 46, pt.lv, pop);
    // 能量条
    const bw = 64, seg = (bw - (max - 1) * 3) / max, by = p.y + 29;
    for (let k = 0; k < max; k++) {
      ctx.fillStyle = COL.ink; rr(p.x - bw / 2 + k * (seg + 3) - 1, by - 1, seg + 2, 9, 3); ctx.fill();
      ctx.fillStyle = k < Math.min(max, pt.energy) ? C.blockColors[d.color][1] : COL.woodDark; rr(p.x - bw / 2 + k * (seg + 3), by, seg, 7, 3); ctx.fill();
    }
    buttons.push({ id: 'pet' + n, x: p.x - 28, y: p.y - 28, w: 56, h: 56, fn: () => { petFx.caption = { text: d.name + ' ' + pt.lv + ' 级：' + PG.petDesc(pt.id, pt.lv), t: clock }; } });
  });
}
// 进化关：正中间铺一层宠物颜色、一亮一暗；亮了的格子金边
function drawPetBoard() {
  if (g.bigHp > 0) drawBossHints();
  if (g.mon) drawMonHints();
  // 能量只差 1 格时，它下一次要下手的地方淡淡亮起它的颜色：可以顺着它来，也可以不管
  g.team.forEach((pt) => {
    if (pt.energy !== PG.energyMax(g, pt) - 1 || !g.petTarget) return;
    const t = g.petTarget(pt);
    if (!t) return;
    const cells = core.UNITS[t.axis === 'row' ? t.i : t.axis === 'col' ? 9 + t.i : 18 + t.i];
    ctx.fillStyle = C.blockColors[PG.PETS[pt.id].color][1]; ctx.globalAlpha = 0.18 + Math.sin(clock * 5) * 0.08;
    cells.forEach((k) => ctx.fillRect(cellX(k % 9) + 1, cellY(Math.floor(k / 9)) + 1, L.cell - 2, L.cell - 2));
    ctx.globalAlpha = 1;
  });
  if (!g.stage.evolve) return;
  const col = C.blockColors[g.evColor];
  for (const k of core.UNITS[22]) {
    const x = cellX(k % 9), y = cellY(Math.floor(k / 9));
    if (g.evLit.has(k)) {
      ctx.strokeStyle = COL.brassLight; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, L.cell - 4, L.cell - 4);
    } else if (!g.board[k]) {
      ctx.globalAlpha = 0.42 + Math.sin(clock * 3) * 0.15;
      ctx.fillStyle = col[1]; ctx.fillRect(x + 3, y + 3, L.cell - 6, L.cell - 6);
      ctx.globalAlpha = 1;
    }
  }
}
// 大墨怪：不靠字教打法（Cc 11-24：「这一关的 boss 是要干嘛呀？看不明白」）
// ① 穿过它的那几排一直淡淡发红：往这里凑；② 拖块时这一下能打到它，它吓得发抖；③ 开局自己演一遍：一排填满、亮一下、打中它
function bossLines() {
  const rows = new Set(g.bigCells.map((k) => Math.floor(k / 9))), cols = new Set(g.bigCells.map((k) => k % 9));
  return { rows: [...rows], cols: [...cols] };
}
function drawBossHints() {
  const { rows, cols } = bossLines();
  const pulse = 0.2 + Math.sin(clock * 3) * 0.08;
  ctx.fillStyle = 'rgba(226,85,59,' + pulse + ')';
  rows.forEach((r) => { for (let c = 0; c < 9; c++) if (!g.board[r * 9 + c]) ctx.fillRect(cellX(c) + 2, cellY(r) + 2, L.cell - 4, L.cell - 4); });
  cols.forEach((c) => { for (let r = 0; r < 9; r++) if (!g.board[r * 9 + c] && !rows.includes(r)) ctx.fillRect(cellX(c) + 2, cellY(r) + 2, L.cell - 4, L.cell - 4); });
  // 它所在的大格也发红（凑满那个大格也打得到它）
  const bx0 = core.boxOf(Math.floor(g.bigCells[0] / 9), g.bigCells[0] % 9);
  core.UNITS[18 + bx0].forEach((k) => { if (!g.board[k] && !rows.includes(Math.floor(k / 9)) && !cols.includes(k % 9)) ctx.fillRect(cellX(k % 9) + 2, cellY(Math.floor(k / 9)) + 2, L.cell - 4, L.cell - 4); });
  // 下一手要吐墨的格子：冒黑泡；要跳过去的地方：闪红
  const bs = g.boss;
  if (bs && bs.nextSpit !== null) { const k = bs.nextSpit, x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2; for (let n = 0; n < 3; n++) { const a = (clock * 1.5 + n / 3) % 1; ctx.globalAlpha = 1 - a; ctx.fillStyle = '#2a2236'; ctx.beginPath(); ctx.arc(x + (n - 1) * 8, y + 8 - a * 18, 4 + a * 5, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
  if (bs && bs.jumpTo !== null) { const tl = bs.jumpTo; ctx.strokeStyle = 'rgba(226,85,59,' + (0.5 + Math.sin(clock * 12) * 0.4) + ')'; ctx.lineWidth = 4; ctx.strokeRect(cellX(tl % 9) + 2, cellY(Math.floor(tl / 9)) + 2, L.cell * 2 - 4, L.cell * 2 - 4); }
  // 拖块时：这一下能打到它吗
  petFx.bossScared = false;
  if (drag && g.hand[drag.slot]) {
    const p = g.hand[drag.slot], sn = snap(p, drag.x, drag.y);
    if (core.canPlace(g.board, p, sn.r, sn.c)) {
      // 这一下凑满的那一排 / 那个大格，本身含不含大墨怪的格子（原来按「格子落在它那几排上」算，会误报）
      const b2 = g.board.slice();
      for (const [dr, dc] of p.cells) b2[(sn.r + dr) * 9 + sn.c + dc] = 1;
      petFx.bossScared = core.UNITS.some((u) => u.every((k) => b2[k]) && u.some((k) => g.bigCells.includes(k)));
    }
  }
  // 开局演示（前 4 秒，还没放块时）：第一排红光从左到右扫过去，扫到它，它一抖
  if (g.moves === 0 && clock - (petFx.bossDemo || 0) < 4) {
    if (!petFx.bossDemo) petFx.bossDemo = clock;
    const a = ((clock - petFx.bossDemo) % 2) / 2, r = rows[0];
    for (let c = 0; c < 9; c++) {
      if (c / 9 > a) break;
      if (g.board[r * 9 + c]) continue; // 大墨怪和已有的块上不画，免得挡住它
      ctx.globalAlpha = 0.5; block(cellX(c), cellY(r), L.cell, 1, 0); ctx.globalAlpha = 1;
    }
    if (a > 0.9) { petFx.bossHit = clock; }
  }
}
// 点宠物头像 / 进化关开局那一句：棋盘下沿一条字（救场、第一次出手都不打字）
function drawPetCaption() {
  for (const cp of [petFx.banner, petFx.caption]) {
    if (!cp || clock < cp.t || clock - cp.t > 2.8) continue;
    const a = Math.min(1, (clock - cp.t) * 5) * Math.min(1, (2.8 - (clock - cp.t)) * 3);
    ctx.globalAlpha = a;
    ctx.font = 'bold 15px "PingFang SC", sans-serif';
    const tw = Math.min(W - 16, ctx.measureText(cp.text).width + 28);
    const y = cp === petFx.banner ? L.by + 10 : L.by + L.board - 52;
    ctx.fillStyle = COL.steam; rr((W - tw) / 2, y, tw, 40, 10); ctx.fill();
    ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(cp.text, W / 2, y + 21, W - 36);
    ctx.globalAlpha = 1;
  }
}
function juicePets(ev, colorsBefore) {
  // 先照原来的一套：放下弹一下、消掉的碎掉、收到的东西飞向顶上
  juice({ piece: ev.piece, r: ev.r, c: ev.c, units: ev.units, cells: ev.cells, gained: ev.gained, newlyLit: [], revealed: [], center: false, crossbow: null, win: false, combo: ev.combo || 0, streak: ev.streak || 0, beat: ev.beat || (ev.skill ? 4 : 1), collected: ev.collected });
  if (ev.fire) { const c = boxCenter(ev.fire.box); rings.push({ t: clock, big: false, at: c }); flash = 0.25; P.sound('combo3', 0.7); shake = Math.max(shake, 8); }
  juicePK(ev);
  // 同色的块化成光点飞到宠物身上
  ev.sparks.forEach((sp) => {
    const n = g.team.findIndex((p) => p.id === sp.id), to = petPos(n);
    sp.cells.slice(0, 9).forEach((k, j) => flyers.push({ what: 'spark', pet: sp.id, col: C.blockColors[PG.PETS[sp.id].color][1], x: cellX(k % 9) + L.cell / 2, y: cellY(Math.floor(k / 9)) + L.cell / 2, t: clock + 0.05 + j * 0.03, to }));
  });
  if (ev.lit) { ev.lit.forEach((k, j) => setTimeout(() => P.sound('chain' + Math.min(12, g.evLit.size - ev.lit.length + j + 1), 0.6), j * 80)); }
  const burst = (k, col, n, sp) => { const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2; for (let i = 0; i < n; i++) { const a2 = Math.random() * Math.PI * 2, v = (sp || 100) * (0.6 + Math.random() * 0.8); fx.push({ kind: 'shard', x, y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 90, t: clock, life: 0.55, s: 3 + Math.random() * 4, col }); } };
  const mark = (tab, k) => { petFx[tab] = petFx[tab] || {}; petFx[tab][k] = clock; };
  (ev.shellCrack || []).forEach((h) => { mark('shellHit', h.k); burst(h.k, STEEL[h.left % 3], 10 * h.n + (h.left === 0 ? 12 : 0), h.left === 0 ? 220 : 160); burst(h.k, '#ffffff', 4, 120); P.sound(h.left === 0 ? 'combo2' : 'tap', 0.9); shake = Math.max(shake, h.left === 0 ? 6 : 4); P.vibrate(h.left === 0); }); // 甲掉一层：铁片飞出去；最后一层碎掉更响更大
  (ev.colorMiss || []).forEach((k) => { mark('colorMiss', k); P.sound('tap', 0.4); });
  (ev.eats || []).concat((ev.bossEats || []).map((k) => ({ k }))).forEach((e) => { burst(e.k, (C.blockColors[colorsBefore[e.k]] || C.prefillColor)[0], 9, 90); P.sound('pick', 0.7); }); // 被啃掉的块碎成渣
  (ev.moss || []).forEach((e) => burst(e.k, '#2f5a3c', 6, 60));
  (ev.bombs || []).forEach((e) => { burst(e.k, '#ffb070', 16, 200); e.cells.forEach((k) => burst(k, '#2a2236', 4, 60)); flash = Math.max(flash, 0.25); shake = Math.max(shake, 8); P.sound('combo4', 0.7); });
  (ev.spawns || []).forEach((e) => { burst(e.to, '#3b3150', 6, 80); P.sound('select', 0.4); });
  (ev.armorBounce || []).forEach((k) => { petFx.armorBounce = petFx.armorBounce || {}; petFx.armorBounce[k] = clock; P.sound('tap', 0.7); });
  (ev.armorBreak || []).forEach((k) => { const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2; for (let n = 0; n < 8; n++) { const a2 = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 120; fx.push({ kind: 'shard', x, y, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp - 100, t: clock + 0.4, life: 0.6, s: 4 + Math.random() * 4 }); } });
  if (ev.bossSpit !== undefined) {
    // 大墨怪往那一格吐一团墨（墨团划弧线飞过去）
    const from = { x: cellX(g.bigCells[0] % 9) + L.cell, y: cellY(Math.floor(g.bigCells[0] / 9)) + L.cell };
    petInk.push({ from, k: ev.bossSpit, t: clock + 0.1 });
    timeline.push({ t: clock + 0.1, fn: () => P.sound('combo2', 0.5) });
  }
  if (ev.bossJump) { flash = 0.2; shake = Math.max(shake, 9); P.sound('combo4', 0.6); }
  if (ev.bigHits.length) {
    petFx.bossHit = clock; shake = Math.max(shake, 6); P.sound('combo2', 0.7);
    // 碎掉的那颗红心飞出去
    const k0 = g.bigCells[0], x = cellX(k0 % 9) + L.cell, y = cellY(Math.floor(k0 / 9)) - 4;
    for (let n = 0; n < 8; n++) { const a2 = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 120; fx.push({ kind: 'shard', x, y, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp - 120, t: clock, life: 0.6, s: 4 + Math.random() * 3 }); }
  }
  // 宠物一只只出手：头像跳一下 → 一道光连到棋盘 → 效果
  let t = clock + 0.3;
  // 宠物出手不打字（Cc 11-24：「直接让那只宠物从所在的位置跳出来，啃掉一些格子。这就是最直观的，不需要看字」）：
  // 宠物从头像的位置跳到棋盘上，一格一格把方块啃掉，啃完跳回去。几只宠物一只接一只上
  ev.petActs.forEach((act) => {
    const n = g.team.findIndex((p) => p.id === act.id);
    const from = petPos(n);
    const inkCells = new Set((act.lines || []).flatMap((l) => l.filled || []));
    const monAt = {}; (ev.collected || []).forEach((c) => { if (c.what === 'monster') monAt[c.k] = { t: c.t, col: c.col, hp: 0, cd: 0, tgt: null }; });
    // 啃的顺序：一排就从头到尾，一个大格就蛇形走
    let cells = act.cells.slice();
    if (act.kind === 'box') cells.sort((x, y) => { const rx = Math.floor(x / 9), ry = Math.floor(y / 9); return rx !== ry ? rx - ry : (rx % 2 ? (y % 9) - (x % 9) : (x % 9) - (y % 9)); });
    else cells.sort((x, y) => x - y);
    (ev.rocks || []).forEach((k) => { if (!cells.includes(k)) cells.push(k); });
    let pts = cells.map((k) => ({ x: cellX(k % 9) + L.cell / 2, y: cellY(Math.floor(k / 9)) + L.cell / 2 }));
    if (act.kind === 'gift') {
      pts = [slotCenter(3)];
    }
    if (!pts.length) pts = [{ x: L.bx + L.board / 2, y: L.by + L.board / 2 }];
    // 动作照它是什么东西：鸟飞过去一路啄（fly）、鼠跑过去一路啃（gnaw）、蚕爬过去一路吐丝补满再一起消（spin）、麒麟原地吐一颗火球进托盘（spit）
    const style = act.kind === 'row' ? 'fly' : act.kind === 'fill' ? 'spin' : act.kind === 'gift' ? 'spit' : 'gnaw';
    if (style === 'spin') { cells = act.cells.slice().sort((x, y) => x - y); pts = cells.map((k) => ({ x: cellX(k % 9) + L.cell / 2, y: cellY(Math.floor(k / 9)) + L.cell / 2 })); }
    if (!pts.length) pts = [{ x: L.bx + L.board / 2, y: L.by + L.board / 2 }]; // 没找到能下手的地方：跳到棋盘中间转一圈就回来
    const jump = style === 'spit' ? 0 : 0.3, per = cells.length ? Math.min(style === 'spin' ? 0.08 : 0.07, 0.65 / cells.length) : 0.45, ret = style === 'spit' ? 0 : 0.28;
    const run = { id: act.id, from, pts, t0: t, jump, per, ret, style, end: t + jump + Math.max(1, pts.length) * per + ret + (style === 'spin' ? 0.2 : 0), gift: act.kind === 'gift' };
    petRuns.push(run);
    const spinEnd = t + jump + cells.length * per + 0.15;
    cells.forEach((k, j) => {
      const reach = t + jump + j * per;
      const bite = style === 'spin' ? spinEnd : reach; // 蚕：一路补满，补完整排一起消
      ghosts.push({ k, t: bite, appear: inkCells.has(k) ? reach : 0, ci: colorsBefore[k] === undefined ? 0 : colorsBefore[k], ink: inkCells.has(k), rock: g.board[k] === 0 && (ev.rocks || []).includes(k), mon: monAt[k] || null });
      if (j % 2 === 0 && style !== 'spin') timeline.push({ t: bite, fn: () => { P.sound(style === 'fly' ? 'tap' : 'pick', 0.5); const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2; for (let c2 = 0; c2 < 4; c2++) { const a2 = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 90; fx.push({ kind: 'shard', x, y, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp - 60, t: clock, life: 0.45, s: 3 + Math.random() * 3 }); } } });
    });
    timeline.push({ t, fn: () => { P.sound(style === 'spit' ? 'combo2' : 'select', 0.6); if (act.rescue) flash = 0.3; } });
    if (style === 'spin') timeline.push({ t: spinEnd, fn: () => { P.sound('line', 0.7); flash = 0.12; } });
    timeline.push({ t: t + jump + cells.length * per, fn: () => { P.vibrate(true); if (act.kind === 'box') { shake = Math.max(shake, 6); P.sound('combo3', 0.6); } } });
    t = run.end - 0.1;
  });
  timeline.push({ t, fn: () => { if (g.over && mode === 'play') endGame(); } });
}
// 宠物跳出来啃格子：起跳（抛物线）→ 沿着要啃的格子一格格走、嘴一张一合 → 跳回头像的位置
let petRuns = [];
let petInk = []; // 大墨怪吐的墨团（飞行中）
let drainInk = []; // 墨怪冲宠物喷的墨团（0.9.8）
// 怪和宠物 PK 的画面（0.9.8，照 ../九宫消_宠物系统重做_20261125.md 第十三节）：技能块炸开、克住了、打不动、偷能量、下一波
function juicePK(ev) {
  const at = (k) => ({ x: cellX(k % 9) + L.cell / 2, y: cellY(Math.floor(k / 9)) + L.cell / 2 });
  const burst = (k, col, n, sp, delay) => { const c = at(k); for (let i = 0; i < n; i++) { const a2 = Math.random() * Math.PI * 2, v = (sp || 100) * (0.6 + Math.random() * 0.8); fx.push({ kind: 'shard', x: c.x, y: c.y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 90, t: clock + (delay || 0), life: 0.55, s: 3 + Math.random() * 4, col }); } };
  if (ev.skill) {
    const col = C.blockColors[PG.PETS[ev.skill.pet].color][1];
    ev.skill.cells.forEach((k, j) => burst(k, col, 3, 110, j * 0.015));
    rings.push({ t: clock, big: false, at: at(ev.r * 9 + ev.c) });
    flash = Math.max(flash, 0.15); shake = Math.max(shake, 6); P.sound('combo3', 0.7); P.vibrate(true);
  }
  (ev.counter || []).forEach((c) => { burst(c.k, COL.brassLight, 18, 220); burst(c.k, '#ffffff', 6, 140); flash = Math.max(flash, 0.3); P.sound('combo4', 0.8); }); // 克住了：金光炸开
  (ev.petMiss || []).forEach((m) => { petFx.petMiss = petFx.petMiss || {}; petFx.petMiss[m.k] = clock; burst(m.k, '#9aa0b0', 5, 70); P.sound('deny', 0.5); }); // 打不动：灰光挡住
  (ev.drain || []).forEach((d, j) => {
    const n = Math.max(0, g.team.findIndex((p) => p.id === d.id));
    const from = g.board[d.from] === 4 ? { x: cellX(d.from % 9) + L.cell, y: cellY(Math.floor(d.from / 9)) + L.cell } : at(d.from);
    drainInk.push({ from, to: petPos(n), t: clock + 0.15 + j * 0.12, id: d.id, bomb: d.kind === 'bomb' });
  });
  // 第一次被偷能量：演完喷墨，出一张说明卡（只出一次）
  if (ev.drain && ev.drain.length && !save.introSeen.steal) timeline.push({ t: clock + 1.2, fn: () => { if (mode === 'play' && !g.over && !save.introSeen.steal) { introKind = 'steal'; mode = 'intro'; } } });
  if (ev.wave) { ev.wave.cells.forEach((k, j) => burst(k, '#3b3150', 10, 120, 0.1 + j * 0.04)); flash = Math.max(flash, 0.2); shake = Math.max(shake, 5); timeline.push({ t: clock + 0.1, fn: () => P.sound('combo2', 0.6) }); }
}
function petRunPos(run) {
  const tt = clock - run.t0;
  const arc = (a, b, k, h) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * h });
  if (tt < run.jump) return { ...arc(run.from, run.pts[0], tt / run.jump, 70), chomp: 0 };
  const eat = tt - run.jump, n = run.pts.length, eatDur = Math.max(1, n) * run.per;
  if (eat < eatDur) {
    const f = eat / run.per, i = Math.min(n - 1, Math.floor(f)), k = f - i;
    const a = run.pts[i], b = run.pts[Math.min(n - 1, i + 1)];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - Math.abs(Math.sin(f * Math.PI)) * 8, chomp: Math.abs(Math.sin(f * Math.PI)) };
  }
  const k = Math.min(1, (eat - eatDur) / run.ret);
  return { ...arc(run.pts[n - 1], run.from, k, 50), chomp: 0 };
}
function drawPetRuns() {
  petRuns = petRuns.filter((r) => clock < r.end + 0.05);
  petRuns.forEach((r) => {
    if (clock < r.t0) return;
    if (r.style === 'spit') {
      // 麒麟原地张嘴，一颗火球划个弧线落进托盘
      const a = Math.min(1, (clock - r.t0) / Math.max(0.3, r.end - r.t0)), to = r.pts[0];
      const x = r.from.x + (to.x - r.from.x) * a, y = r.from.y + (to.y - r.from.y) * a - Math.sin(a * Math.PI) * 120;
      for (let n = 0; n < 5; n++) { ctx.globalAlpha = 0.5 - n * 0.09; ctx.fillStyle = '#ff8a3a'; ctx.beginPath(); ctx.arc(x - (to.x - r.from.x) * 0.03 * n, y + 8 * n, 12 - n * 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const p = petRunPos(r);
    if (r.style === 'fly') {
      // 鸟：飞在格子上方，一下一下往下啄，翅膀扇
      const dip = p.chomp * 14, y = p.y - 20 + dip, flap = Math.sin(clock * 30) * 10;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 20, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = r.id === 'jinchique' ? COL.brassLight : C.blockColors[0][1];
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(p.x + sx * 14, y); ctx.lineTo(p.x + sx * 40, y - 12 - flap); ctx.lineTo(p.x + sx * 30, y + 8); ctx.fill(); }
      petIcon(r.id, p.x, y, 44, 0, 0);
      // 尖嘴往下
      ctx.fillStyle = COL.brassDark; ctx.beginPath(); ctx.moveTo(p.x - 6, y + 18); ctx.lineTo(p.x + 6, y + 18); ctx.lineTo(p.x, y + 28 + dip * 0.4); ctx.fill();
      return;
    }
    if (r.style === 'spin') {
      // 蚕：贴着格子爬，身后拖一根白丝
      const start = r.pts[0];
      ctx.strokeStyle = 'rgba(239,232,216,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 20, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
      petIcon(r.id, p.x, p.y + Math.sin(clock * 20) * 2, 44, 0, 0);
      return;
    }
    // 鼠：落地跑，嘴一张一合地啃
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 24, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
    petIcon(r.id, p.x, p.y, 50, 0, p.chomp * 0.25);
    if (p.chomp > 0.2) {
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.ellipse(p.x, p.y + 14, 10, 3 + p.chomp * 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 6, p.y + 9, 4, 4); ctx.fillRect(p.x + 2, p.y + 9, 4, 4);
    }
  });
}
const petOut = (id) => petRuns.some((r) => r.id === id && r.style !== 'spit' && clock >= r.t0 && clock < r.end);

// 局里画面：被宠物打掉、还没轮到它碎的格子先照原样画着；竖射的箭；宠物连到棋盘的光（借用守城的那一套）
const _drawPetBoard = drawPetBoard;
drawPetBoard = function () {
  _drawPetBoard();
  ghosts = ghosts.filter((gh) => {
    if (clock >= gh.t) { clearing.push({ k: gh.k, t: clock, mon: !!gh.mon }); return false; }
    const x = cellX(gh.k % 9), y = cellY(Math.floor(gh.k / 9));
    if (gh.appear && clock < gh.appear) return true; // 蚕还没爬到：这格还空着
    if (gh.mon) drawMon(gh.mon, -1, x + L.cell / 2, y + L.cell / 2, L.cell * 0.4); // 被宠物咬之前，墨怪还是墨怪（原来画成它那格的旧颜色：金块）
    else if (gh.rock) ironRock(x, y, L.cell);
    else if (gh.ink) { ctx.fillStyle = '#efe8d8'; ctx.fillRect(x + 4, y + 4, L.cell - 8, L.cell - 8); ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; for (let q = 1; q < 4; q++) { ctx.beginPath(); ctx.moveTo(x + 4, y + 4 + q * (L.cell - 8) / 4); ctx.lineTo(x + L.cell - 4, y + 4 + q * (L.cell - 8) / 4); ctx.stroke(); } }
    else block(x, y, L.cell, 1, gh.ci);
    return true;
  });
  // 墨怪冲宠物喷的墨团（0.9.8）：从墨怪飞到宠物头像，落到就抖一下、能量条闪红
  drainInk = drainInk.filter((m) => { if (clock - m.t >= 0.5) { petFx.drained = petFx.drained || {}; petFx.drained[m.id] = clock; P.sound('pick', 0.6); P.vibrate(false); return false; } return true; });
  drainInk.forEach((m) => {
    if (clock < m.t) return;
    const a = (clock - m.t) / 0.5, x = m.from.x + (m.to.x - m.from.x) * a, y = m.from.y + (m.to.y - m.from.y) * a - Math.sin(a * Math.PI) * 60;
    const r0 = m.bomb ? 12 : 8;
    ctx.fillStyle = '#2a2236'; ctx.beginPath(); ctx.arc(x, y, r0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c58ae0'; ctx.beginPath(); ctx.arc(x - 2, y - 2, r0 * 0.35, 0, Math.PI * 2); ctx.fill();
  });
  // 墨团飞过去
  petInk = petInk.filter((m) => clock - m.t < 0.45);
  petInk.forEach((m) => {
    const a = Math.max(0, (clock - m.t) / 0.45), tx = cellX(m.k % 9) + L.cell / 2, ty = cellY(Math.floor(m.k / 9)) + L.cell / 2;
    const x = m.from.x + (tx - m.from.x) * a, y = m.from.y + (ty - m.from.y) * a - Math.sin(a * Math.PI) * 50;
    ctx.fillStyle = '#2a2236'; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3f5c'; ctx.beginPath(); ctx.arc(x - 3, y - 3, 3, 0, Math.PI * 2); ctx.fill();
  });
  colBolts = colBolts.filter((b) => clock - b.t < 0.5);
  colBolts.forEach((b) => {
    const a = (clock - b.t) / 0.5, x = L.bx + b.col * L.cell;
    const head = L.by + L.board + 40 - a * (L.board + 80);
    ctx.fillStyle = 'rgba(255,240,200,' + (1 - a) + ')'; ctx.fillRect(x - 2, head, 4, 70);
    ctx.fillStyle = COL.brassLight; ctx.beginPath(); ctx.moveTo(x, head - 12); ctx.lineTo(x - 6, head); ctx.lineTo(x + 6, head); ctx.fill();
  });
  beams = beams.filter((b) => clock - b.t < 0.35);
  beams.forEach((b) => {
    const a = (clock - b.t) / 0.35;
    ctx.strokeStyle = b.col; ctx.globalAlpha = 1 - a; ctx.lineWidth = 6 * (1 - a) + 1;
    ctx.beginPath(); ctx.moveTo(b.from.x, b.from.y); ctx.lineTo(b.to.x, b.to.y); ctx.stroke();
    ctx.globalAlpha = 1;
  });
};
// 宠物关结算分两半（0.9.4，检验报告 A10：赢的那一下刷新页面，这关白打了）：
//   settlePet = 记账（经验、丹、进度、送宠物、存档），赢的那一手马上做；showPet = 换结算页、音效、过场，等宠物动画演完再做
function endPet() {
  if (!g._settled) settlePet();
  showPet();
}
function settlePet() {
  g._settled = true;
  const st = g.stage;
  const r = { won: g.won, reason: g.reason, near: g.nearMiss(), caught: g.caught, gift: null, evolved: null, dan: 0, danAuto: 0, exp: [] };
  const petReplay = !st.evolve && petIdx < save.petStage; // 这关以前过过
  // 0.9.8：出战不涨经验，只有丹能升级（Fable 宠物重做第五节：「我派的是老鼠，却是铜雀进化了」这种事不再有）。抓到的墨怪只记个数
  save.gourd += g.caught;
  if (g.won) {
    if (st.evolve) {
      // 进化：换成新宠物，等级和经验带过去
      const from = st.evolve.pet, to = PG.PETS[from].evo;
      save.pets[to] = { lv: save.pets[from].lv, exp: save.pets[from].exp };
      delete save.pets[from];
      save.petOrder = save.petOrder.map((x) => (x === from ? to : x));
      if (save.activePet === from) save.activePet = to;
      r.evolved = { from, to };
      petFx.evolveFlash = clock;
      save.petStage = Math.max(save.petStage, petIdx + 1);
    } else {
      save.petStage = Math.max(save.petStage, petIdx + 1);
      if (st.gift && !save.pets[st.gift]) { save.pets[st.gift] = { lv: 1, exp: 0 }; save.petOrder.push(st.gift); r.gift = st.gift; if (!save.activePet) save.activePet = st.gift; }
    }
    // 掉丹（0.9.8，第一次过这关才掉）：头目关 3 颗、难关 2 颗；普通关六成会掉 1 颗，连着两关没掉、第三关一定掉
    if (save.petOrder.length && !petReplay && !st.evolve) {
      let n = st.goal.boss ? 3 : st.hard ? 2 : 0;
      if (!n) { save.danDry = save.danDry || 0; if (save.danDry >= 2 || Math.random() < 0.6) { n = 1; save.danDry = 0; } else save.danDry++; }
      save.dan += n; r.dan = n;
    }
  }
  // 同一关连输几次（专属关连输两次，结算页给「借一只再来」）
  if (!st.evolve) { save.loss = save.loss || {}; if (g.won) delete save.loss[petIdx]; else save.loss[petIdx] = (save.loss[petIdx] || 0) + 1; }
  coinsGot = Math.floor(g.score * C.coinPerScore) + (g.won ? C.coinStageWin : 0);
  save.coins += coinsGot;
  persist();
  result = r;
  g._settleInfo = { petReplay };
  // 试玩记录器（0.9.6，打磨流程第 0 步）：每打完一局记一行，给难度表的「真人」那一列用。设置里「复制试玩记录」拿走
  if (!st.evolve) {
    const ps = g.playStats, pt = g.team[0];
    save.playLog = save.playLog || [];
    save.playLog.push({
      lv: petIdx + 1, won: g.won ? 1 : 0, moves: g.moves, sec: Math.round((P.now() - (g.startMs || P.now())) / 1000),
      firstClear: ps.firstClear, firstGoal: ps.firstGoal, maxDry: ps.maxDry, prog: Math.round(g.progressFrac() * 100),
      petActs: Object.values(g.petActsTotal).reduce((a, b) => a + b, 0), petGoals: ps.goalsByPet, myGoals: ps.goalsByPlayer,
      pet: pt ? pt.id : '', petLv: pt ? pt.lv : 0, ver: VERSION, t: new Date().toISOString().slice(0, 16),
    });
    if (save.playLog.length > 400) save.playLog.splice(0, save.playLog.length - 400);
    persist();
  }
}
function showPet() {
  const st = g.stage, r = result, petReplay = g._settleInfo ? g._settleInfo.petReplay : false;
  mode = 'over';
  if (r.evolved) { P.sound('win', 0.9); flash = 0.7; } else if (!g.won) { P.sound('lose', 0.6); say('堵住了'); }
  // 过场（东西上面已经入账了，跳过也不丢）：打倒这章的大墨怪 → 过章；进化；新宠物到手
  if (g.won && st.goal.boss && petIdx % 10 === 9 && !petReplay) CUT.chapterClear(Math.floor(petIdx / 10));
  if (r.evolved) CUT.evolve(r.evolved.from, r.evolved.to);
  if (r.gift) CUT.petIntro(r.gift);
  playCuts();
}
function drawPetOver() {
  const age = clock - overAt;
  const r = result;
  const wait = r.won ? 1.0 : 0.35;
  ctx.fillStyle = COL.shade + Math.min(r.won ? 0.6 : 0.85, age * 2) + ')'; ctx.fillRect(0, 0, W, H);
  if (r.won && age < wait) { text(r.evolved ? '进化！' : '过关！', W / 2, L.by + L.board * 0.45, Math.round(64 * Math.min(1, 0.6 + age * 3)), COL.brassLight); return; }
  if (age < wait) return;
  const pw = Math.min(W - 40, 340), ph = 380 + r.exp.length * 42, px = (W - pw) / 2, py = Math.max(L.top + 10, (H - ph) / 2 - 30);
  panel(px, py, pw, ph);
  let y = py + 40;
  if (r.evolved) {
    text(PG.PETS[r.evolved.from].name + ' 进化了！', W / 2, y, 26, COL.brassLight);
    petIcon(r.evolved.to, W / 2, y + 74, 80, save.pets[r.evolved.to].lv, Math.sin(clock * 3) * 0.08);
    text(PG.PETS[r.evolved.to].name + '：' + PG.petDesc(r.evolved.to, save.pets[r.evolved.to].lv), W / 2, y + 140, 16, COL.text, 'center', 'normal');
    y += 160;
  } else if (r.won) {
    text(petLevelName() + ' 完成！', W / 2, y, 26, COL.brassLight);
    y += 44;
    if (r.gift) {
      petIcon(r.gift, W / 2, y + 30, 64, 1, Math.sin(clock * 3) * 0.08);
      text('新宠物：' + PG.PETS[r.gift].name, W / 2, y + 80, 18, COL.jade);
      text(PG.petDesc(r.gift, 1), W / 2, y + 104, 15, COL.text, 'center', 'normal');
      y += 122;
    }
  } else {
    text(r.near ? '差一点！' : '堵住了', W / 2, y, 30, r.near ? COL.red : COL.text);
    y += 40;
    const left = g.goalLeft(), keys = Object.keys(g.stage.goal), cw = 70, x0 = W / 2 - (cw * keys.length) / 2;
    text('还差', W / 2, y, 15, COL.dim, 'center', 'normal');
    keys.forEach((key, n) => {
      const cx = x0 + cw * n + cw / 2;
      if (key === 'score') text(left.score + ' 分', cx, y + 34, 22, COL.red);
      else { goalIcon(key, cx - 12, y + 34, 26); text(left[key] ? String(left[key]) : '✓', cx + 16, y + 34, 22, left[key] ? COL.red : COL.jade); }
    });
    y += 70;
  }
  // 出战宠物涨了多少经验：进度条从原来的位置涨上去（Cc：「进度条必须得看得到，我们才会想要不停地练它」）
  r.exp.forEach((e) => {
    const k = Math.min(1, Math.max(0, (age - wait - 0.2) / 0.8));
    const lvNow = k < 1 ? e.before.lv : e.after.lv;
    const fracA = e.before.exp / EXP_NEED[e.before.lv], fracB = e.after.lv > e.before.lv ? 1 : e.after.exp / EXP_NEED[e.after.lv];
    const frac = k < 1 ? fracA + (fracB - fracA) * k : e.after.exp / EXP_NEED[e.after.lv];
    petIcon(e.id, px + 44, y + 16, 34, 0, 0);
    text(PG.PETS[e.id].name + ' ' + lvNow + ' 级', px + 70, y + 6, 15, COL.text, 'left');
    text('+' + e.gain + ' 经验' + (e.x2 ? ' ×2' : ''), px + pw - 24, y + 6, 14, COL.jade, 'right');
    const bw = pw - 110;
    ctx.fillStyle = COL.ink; rr(px + 70, y + 20, bw, 10, 5); ctx.fill();
    ctx.fillStyle = COL.jade; rr(px + 70, y + 20, Math.max(6, bw * frac), 10, 5); ctx.fill();
    if (k >= 1 && e.after.lv > e.before.lv) text('升到 ' + e.after.lv + ' 级！', px + 70 + bw / 2, y + 25, 12, COL.brassLight);
    else text((k < 1 ? e.before.exp : e.after.exp) + ' / ' + EXP_NEED[lvNow], px + 70 + bw / 2, y + 25, 10, COL.text);
    y += 42;
  });
  // 抓到的怪收进葫芦
  if (r.caught) {
    const msg = '抓到 ' + r.caught + ' 只墨怪' + (r.dan ? ' · 掉了 ' + r.dan + ' 颗丹' : r.won && save.petOrder.length && !(g._settleInfo && g._settleInfo.petReplay) ? ' · 这关没掉丹' : '');
    ctx.font = 'normal 15px "PingFang SC", sans-serif';
    const tw = ctx.measureText(msg).width;
    gourdIcon(W / 2 - tw / 2 - 4, y + 12, 18);
    text(msg, W / 2 + 12, y + 12, 15, COL.text, 'center', 'normal'); y += 34;
  }
  else if (r.dan || r.danAuto) { text('得 ' + (r.danAuto + r.dan) + ' 颗丹', W / 2, y + 12, 15, COL.text, 'center', 'normal'); y += 34; }
  const bw = pw - 48, bx = px + 24, by = py + ph - 128;
  const canFeed = save.petOrder.length && (save.gourd > 0 || save.dan > 0);
  if (r.won) {
    // 过关一律回营地（Cc 11-24：「别给我直接进入下一关的选项，每一关过完了之后必定回营地」）：炼丹、喂宠物、换出战，再从营地去闯下一关
    button('tocamp', bx, by + 20, bw, 64, '回营地', { size: 28, fn: () => openCamp() });
  } else {
    button('again', bx, by, bw, 58, '再试一次', { size: 24, fn: () => (g.stage.evolve ? newEvolution(g.stage.evolve.pet, petIdx) : newPetLevel(petIdx)) });
    const lendLv = g.onlyPet && save.loss && save.loss[petIdx] >= 2 ? Math.max(3, (g.team[0] ? g.team[0].lv : 1) + 2) : 0;
    if (lendLv) { // 专属关连输两次：递个梯子
      button('lend', bx, by + 70, bw * 0.6 - 6, 44, '借一只 ' + lendLv + ' 级的再来', { size: 15, bg: COL.wood, hot: true, fn: () => newPetLevel(petIdx, false, lendLv) });
      button('tomap', bx + bw * 0.6 + 6, by + 70, bw * 0.4 - 6, 44, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
    } else if (g.adsUsed < C.adMax) {
      button('revive', bx, by + 70, bw * 0.6 - 6, 44, '清空正中间', { size: 16, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { g.revive(); g._ended = false; mode = 'play'; result = null; stats.starts.push(P.now()); }) });
      button('tomap', bx + bw * 0.6 + 6, by + 70, bw * 0.4 - 6, 44, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
    } else button('tomap', bx, by + 70, bw, 44, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
  }
}
// 葫芦：两个圆叠起来，腰上一根红绳
function gourdIcon(x, y, s) {
  ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(x, y + s * 0.35, s * 0.62, 0, Math.PI * 2); ctx.arc(x, y - s * 0.4, s * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c99a4a'; ctx.beginPath(); ctx.arc(x, y + s * 0.35, s * 0.55, 0, Math.PI * 2); ctx.arc(x, y - s * 0.4, s * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COL.red; ctx.fillRect(x - s * 0.3, y - s * 0.08, s * 0.6, s * 0.12);
  ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - s * 0.08, y - s * 0.95, s * 0.16, s * 0.2);
}
// ---------- 营地：葫芦炼丹、喂宠物、进化 ----------
let brewing = null; // { until, n }
let campFrom = 'map';
function openCamp() { campFrom = mode === 'home' ? 'home' : 'map'; mode = 'camp'; }
// 营地（0.8 重排成三张卡，照 Fable UI 对照第三处）：葫芦卡（丹数收进来）→ 宠物卡（出战的翠边）→ 下一关卡；最下面「出发」去章页
function drawCamp() {
  drawBg();
  const top = L.top;
  button('campBack', 8, top, 100, 44, campFrom === 'home' ? '‹ 主菜单' : '‹ 地图', { fn: () => { mode = campFrom; } });
  text('营地', W / 2, top + 22, 20, COL.brassLight);
  // 1 葫芦卡
  const rGd = LY.rect('camp.gourd'), rPt = LY.rect('camp.pets'), rNx = LY.rect('camp.next'), rGo = LY.rect('camp.go');
  let y = rGd.y;
  const gx0 = rGd.x, gw = rGd.w, gh = rGd.h;
  panel(gx0, y, gw, gh);
  // 丹：打关自动炼好（两只墨怪一颗），这里只看有多少、喂给谁
  gourdIcon(gx0 + 38, y + gh / 2 + 2, 38);
  text(save.dan + ' 颗丹', gx0 + 76, y + gh * 0.38, 20, COL.brassLight, 'left');
  text('过关有机会掉丹：头目关 3 颗、难关 2 颗', gx0 + 76, y + gh * 0.7, 11, COL.dim, 'left', 'normal');
  y = rPt.y;
  // 底下：出发按钮、下一关卡
  const btnY = rGo.y, nextY = rNx.y;
  // 2 宠物卡（只数越多卡越矮）
  const n = save.petOrder.length, area = rPt.h;
  const cardH = n ? Math.max(64, Math.min(88, (area - (n - 1) * 8) / n)) : 0, f = cardH / 88;
  // 还没有宠物：什么都不写（Cc 11-25：「前 3 关不用告诉我过了 3 关就有宠物……过了 3 关突然出现宠物」）
  save.petOrder.forEach((id, k) => {
    const rec = save.pets[id], d = PG.PETS[id];
    const cy = y + k * (cardH + 8), cx = rPt.x, cw = rPt.w;
    const active = save.activePet === id || (!save.activePet && k === 0);
    panel(cx, cy, cw, cardH, active);
    const isz = Math.min(46, cardH - 30);
    petIcon(id, cx + 38, cy + cardH / 2 - 7, isz, 0, petFx.pop[id] ? Math.max(0, 0.3 - (clock - petFx.pop[id])) / 0.3 : 0);
    text('⚡' + PG.CHARGE_TAG[d.charge], cx + 38, cy + cardH - 11, 11, COL.dim, 'center', 'normal'); // 攒法：头像底下一个小标签
    const tx = cx + 76, rw = cw - 76 - 100;
    text(d.name + '  ' + rec.lv + ' 级', tx, cy + 18 * f, 16, COL.text, 'left');
    const line2 = PG.petDesc(id, rec.lv);
    let fs = 13; ctx.font = 'bold ' + fs + 'px "PingFang SC", sans-serif';
    while (fs > 11 && ctx.measureText(line2).width > rw + 90) { fs--; ctx.font = 'bold ' + fs + 'px "PingFang SC", sans-serif'; }
    text(line2, tx, cy + 39 * f, fs, COL.brassLight, 'left', 'normal');
    // 经验：数字写在条的上面，不再塞进条里
    const need = EXP_NEED[rec.lv] || 999, canEvolve = d.evo && rec.lv >= d.evoLv;
    text(canEvolve ? '可以进化了！' : '丹 ' + rec.exp + ' / ' + need + (d.evo ? ' · ' + d.evoLv + ' 级进化' : ''), tx, cy + 58 * f, 11, canEvolve ? TH.jade : COL.dim, 'left', 'normal');
    ctx.fillStyle = TH.line; rr(tx, cy + 70 * f, rw, 8, 4); ctx.fill();
    ctx.fillStyle = TH.jade; rr(tx, cy + 70 * f, Math.max(6, rw * Math.min(1, rec.exp / need)), 8, 4); ctx.fill();
    const bx2 = cx + cw - 12 - 84;
    if (canEvolve) {
      ctx.strokeStyle = 'rgba(243,210,122,' + (0.5 + Math.sin(clock * 6) * 0.4) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx + 38, cy + cardH / 2 - 7, isz / 2 + 6, 0, Math.PI * 2); ctx.stroke();
      button('evolve' + k, bx2, cy + 8, 84, 36, '进化', { kind: 'sub', hot: true, dot: true, fn: () => newEvolution(id) });
    } else { const cost = danToLevel(id), ok = save.dan >= cost; button('feed' + k, bx2 - 12, cy + 8, 96, 36, '升级 · ' + cost + ' 颗', { kind: 'sub', size: 13, hot: ok, fg: ok ? COL.text : COL.dim, fn: () => levelUpPet(id) }); }
    // 出战：只能带一只，选好了就一直带它
    if (active) text('出战中', bx2 + 42, cy + cardH - 18, 13, TH.jade);
    else button('pick' + k, bx2, cy + cardH - 34, 84, 28, '让它出战', { kind: 'sub', size: 13, fn: () => { save.activePet = id; persist(); petFx.pop[id] = clock; P.sound('select', 0.6); petMsg = { text: PG.PETS[id].name + ' 出战！下一关就带它', t: clock }; } });
  });
  // 3 下一关卡：喂丹、换宠物的时候就看得到要对付什么
  const cur = Math.min(save.petStage, PLV.length - 1), nst = PLV[cur];
  const nx0 = rNx.x, nw = rNx.w, nmid = nextY + rNx.h / 2;
  panel(nx0, nextY, nw, rNx.h);
  text('第 ' + (cur + 1) + ' 关', nx0 + 16, nmid, 13, COL.dim, 'left', 'normal');
  Object.keys(nst.goal).slice(0, 2).forEach((key, k) => {
    const gx = nx0 + 88 + k * 64, gy = nmid;
    if (key === 'score') text(nst.goal.score + ' 分', gx + 10, gy, 13, COL.text);
    else { goalIcon(key, gx, gy, 18); text(key === 'all' ? '抓光' : '×' + nst.goal[key], gx + 12, gy, 13, COL.text, 'left'); }
  });
  const np = ownedOf(nst.only || nst.best);
  if (np) { petIcon(np, nx0 + nw - 104, nmid, nst.only ? 26 : 20, 0, 0); if (nst.only) text('点名', nx0 + nw - 104, nmid + 20, 11, C.blockColors[PG.PETS[np].color][1], 'center', 'normal'); }
  text('这一章 ›', nx0 + nw - 14, nmid, 13, COL.dim, 'right', 'normal');
  buttons.push({ id: 'campChapter', x: nx0 + nw - 84, y: nextY, w: 84, h: rNx.h, fn: () => { chapView = null; chapSel = null; mode = 'map'; } });
  if (petMsg && clock - petMsg.t < 2.6) {
    ctx.font = 'bold 15px "PingFang SC", sans-serif';
    const tw = Math.min(W - 16, ctx.measureText(petMsg.text).width + 28);
    ctx.fillStyle = COL.steam; rr((W - tw) / 2, nextY - 50, tw, 40, 10); ctx.fill();
    ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(petMsg.text, W / 2, nextY - 29, W - 36);
  }
  // 出发 → 章页（「开打」在同一个位置，拇指不用挪）
  button('campPlay', rGo.x, btnY, rGo.w, rGo.h, '出发', { size: 20, fn: () => { chapView = null; chapSel = null; mode = 'map'; } });
}
function addExp(rec, n) {
  rec.exp += n;
  let up = 0;
  while (rec.lv < LV_CAP && rec.exp >= EXP_NEED[rec.lv]) { rec.exp -= EXP_NEED[rec.lv]; rec.lv++; up++; }
  return up;
}
// 升一级要几颗丹（0.9.3：一下升一级，学 AFK Arena 的「升级」按钮；不再一颗一颗喂）
const danToLevel = (id) => { const rec = save.pets[id]; return rec && rec.lv < LV_CAP ? Math.ceil((EXP_NEED[rec.lv] - rec.exp) / DAN_EXP) : Infinity; };
const canLevelAny = () => save.petOrder.some((id) => { const d = PG.PETS[id], rec = save.pets[id]; return (d.evo && rec.lv >= d.evoLv) || (!(d.evo && rec.lv >= d.evoLv) && save.dan >= danToLevel(id)); });
function levelUpPet(id) {
  const rec = save.pets[id], cost = danToLevel(id);
  if (save.dan < cost) { petMsg = { text: '还差 ' + (cost - save.dan) + ' 颗丹：去打关，过关有机会掉丹', t: clock }; return; }
  save.dan -= cost;
  addExp(rec, cost * DAN_EXP);
  petFx.pop[id] = clock;
  const d = PG.PETS[id];
  petMsg = { text: d.name + ' 升到 ' + rec.lv + ' 级！' + (d.evo && rec.lv >= d.evoLv ? '可以进化了！' : '现在能' + PG.petDesc(id, rec.lv)), t: clock };
  P.sound('lit', 0.7);
  persist();
}
function feedPet(id) {
  const rec = save.pets[id];
  if (save.dan <= 0) { petMsg = { text: '没有丹了：打关抓墨怪，回来炼丹', t: clock }; return; }
  save.dan--;
  petFx.pop[id] = clock;
  P.sound('coin', 0.6);
  const up = addExp(rec, DAN_EXP);
  if (!up) petMsg = { text: PG.PETS[id].name + ' 经验 +' + DAN_EXP + '（' + rec.exp + ' / ' + EXP_NEED[rec.lv] + '）', t: clock };
  if (up) {
    const d = PG.PETS[id];
    petMsg = { text: d.name + ' 升到 ' + rec.lv + ' 级！' + (d.evo && rec.lv >= d.evoLv ? '可以进化了！' : '现在能' + PG.petDesc(id, rec.lv)), t: clock };
    P.sound('lit', 0.7);
  }
  persist();
}

// ---------- 守城（肉鸽试玩版）：画面 ----------
// 规则在 siege.js。这里管：车道和攻城车、机关栏、机关一件件发动的动画、三选一卡、结算。
const SCHOOL_COL = { bow: '#4470c0', fire: COL.red, luoshu: COL.brass, star: '#8a62bf', ink: '#3f9a7c' };
let timeline = []; // 排好时间的小事件 { t, fn }
let ghosts = []; // 被机关打掉、还没轮到它碎的格子 { k, t, ci }
let relicPop = {}; // 机关栏图标跳一下 { id: 时刻 }
let beams = []; // 机关栏连到棋盘的一道光 { from, to, t, col }
let colBolts = []; // 竖着射的连弩 { col, t }
let siegeFx = { cartStep: 0, cartHit: -9, cartDead: -9, banner: null, chooseAt: 0, tip: null, lastWave: -1 };
function runTimeline() {
  if (!timeline.length) return;
  const due = timeline.filter((e) => clock >= e.t);
  timeline = timeline.filter((e) => clock < e.t);
  due.forEach((e) => e.fn());
}
const siegeBusy = () => timeline.length > 0;
// 每日一城：北京时间的日期。每天 3 次，看广告多 1 次，记当天最好的波数
const DAILY_TRIES = 3;
function todayKey() { return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); }
function dailyRec() {
  const key = todayKey();
  if (!save.daily || save.daily.date !== key) save.daily = { date: key, tries: 0, extra: 0, best: 0, bestHit: 0 };
  return save.daily;
}
const dailyLeft = () => { const d = dailyRec(); return DAILY_TRIES + d.extra - d.tries; };
function newDaily() {
  const d = dailyRec();
  if (dailyLeft() <= 0) return;
  d.tries++;
  newSiege(+d.date.replace(/-/g, ''));
}
function newSiege(daily) {
  stageIdx = -1;
  g = daily ? SG.createSiege({ daily }) : SG.createSiege({ seed: (P.now() ^ (save.plays * 2654435761)) >>> 0, tutorial: !save.siegeDone, runNo: save.siegeRuns || 0 });
  startCommon();
  for (const k of g.prefilled) colorAt[k] = -1;
  timeline = []; ghosts = []; relicPop = {}; beams = []; colBolts = [];
  siegeFx = { cartStep: 0, hpShow: undefined, cartHit: -9, cartDead: -9, banner: null, chooseAt: clock + (g.phase === 'choose' ? 0.2 : 0), tip: null, lastWave: -1 }; missiles = [];
  waveBanner();
}
function waveBanner() {
  const w = g.waveDef;
  const sub = w.bossLine || (g.firstRun && g.wave === 0 ? '把方块消掉，就是在打攻城车' : '');
  siegeFx.banner = { text: '第 ' + (g.wave + 1) + ' 波 · ' + w.name, sub, t: clock, boss: !!w.bossLine };
}
// 机关第一次发动：屏幕中间打一句大白话，告诉你刚才发生了什么
function firstTimeCaption(id) {
  if (save.relicSeen[id] || !SG.RELICS[id]) return;
  save.relicSeen[id] = true; persist();
  siegeFx.caption = { text: SG.RELICS[id].first, t: clock };
}
// 战场：上面一条路，攻城车从上往下压；下面是城墙，机关装在城墙上，城墙下面就是棋盘（城里）
function siegeGeo() {
  const wallY = L.by - 46; // 城墙上沿
  const roadTop = L.top + 92, roadBot = wallY - 42; // 车能走的范围（4 步）
  return { wallY, roadTop, roadBot };
}
function cartPos() {
  const G2 = siegeGeo();
  return { x: W / 2, y: G2.roadTop + siegeFx.cartStep * (G2.roadBot - G2.roadTop) / (SG.ROUNDS - 1) };
}
// 机关栏里第 n 格的中心：嵌在城墙上，中间留给城门
function relicSlotPos(n) {
  const s = 36, G2 = siegeGeo();
  const xs = [W / 2 - 150, W / 2 - 98, W / 2 + 98, W / 2 + 150, W / 2 - 46].map((x) => Math.max(s / 2 + 4, Math.min(W - s / 2 - 4, x)));
  return { x: xs[n], y: G2.wallY + 18, s };
}
function boxCenter(b) { return { x: cellX((b % 3) * 3) + L.cell * 1.5, y: cellY(Math.floor(b / 3) * 3) + L.cell * 1.5 }; }
function lineCenter(l) { return l.axis === 'row' ? { x: L.bx + L.board / 2, y: cellY(l.idx) + L.cell / 2 } : { x: cellX(l.idx) + L.cell / 2, y: L.by + L.board / 2 }; }
let missiles = []; // 消除打出去的弩箭：从棋盘飞到车上 { x0, y0, t, dmg, hp }
function juiceSiege(sev, colorsBefore) {
  const res = sev.res;
  const nRelic = res.steps.filter((x) => x.kind === 'relic').length + (res.mults || []).length;
  const clearStep = res.steps.find((x) => x.kind === 'clear');
  // 先照原来的一套放：放下弹一下、消掉的碎掉、声音（借用 juice）
  const center = (res.mults || []).some((m) => m.id === 'center5');
  const units = clearStep ? clearStep.units : [];
  const beat = !units.length ? 1 : nRelic >= 3 || center ? 5 : nRelic >= 1 || units.length >= 2 ? 4 : units.some((u) => u >= 18) ? 3 : 2;
  juice({ piece: sev.piece, r: sev.r, c: sev.c, units, cells: clearStep ? clearStep.cells : [], gained: clearStep ? clearStep.dmg : res.base,
    newlyLit: [], revealed: [], center: false, crossbow: null, win: false, combo: units.length, streak: g.streak, beat }); // ×5 由下面的倍率徽章来放
  // 机关一件件发动：每件隔 0.22 秒
  let t = clock + 0.18;
  res.steps.filter((x) => x.kind === 'relic').forEach((st) => {
    const slot = g.relics.findIndex((r) => r.id === st.id);
    const from = relicSlotPos(Math.max(0, slot));
    (st.cells || []).forEach((k) => ghosts.push({ k, t, ci: colorsBefore[k] === undefined ? 0 : colorsBefore[k], ink: st.id === 'inkline' && !(colorsBefore[k] !== undefined && g.board[k]) }));
    const at = t;
    timeline.push({ t: at, fn: () => {
      relicPop[st.id] = clock;
      firstTimeCaption(st.id);
      const col = SCHOOL_COL[SG.RELICS[st.id].school];
      if (st.id === 'crossbow') {
        st.lines.forEach((l) => { if (l.axis === 'row') bolts.push({ row: l.idx + 0.5, t: clock, dir: 1 }); else colBolts.push({ col: l.idx + 0.5, t: clock }); beams.push({ from, to: lineCenter(l), t: clock, col }); });
        P.sound('bolt', 0.6);
      } else if (st.id === 'inkline') {
        st.lines.forEach((l) => beams.push({ from, to: lineCenter(l), t: clock, col }));
        P.sound('line', 0.6);
      } else if (st.id === 'thunder' || st.id === 'chain') {
        (st.boxes || []).forEach((b) => { const c = boxCenter(b); beams.push({ from, to: c, t: clock, col }); rings.push({ t: clock, big: false, at: c }); });
        P.sound('combo3', 0.6); shake = Math.max(shake, 7); P.vibrate(true);
      } else if (st.id === 'loader') {
        texts.push({ s: '上弦！', x: from.x, y: from.y + 34, t: clock, size: 18, col: COL.brassLight });
        P.sound('select', 0.5);
      }
      if (st.dmg) texts.push({ s: '+' + st.dmg, x: (st.lines && st.lines[0] ? lineCenter(st.lines[0]) : st.boxes ? boxCenter(st.boxes[0]) : from).x, y: (st.lines && st.lines[0] ? lineCenter(st.lines[0]) : st.boxes ? boxCenter(st.boxes[0]) : from).y, t: clock, size: 22, col });
    } });
    t += 0.22;
  });
  // 倍率徽章：×5、×3、上弦 ×2
  (res.mults || []).forEach((m) => {
    const at = t;
    timeline.push({ t: at, fn: () => {
      relicPop[m.id] = clock;
      firstTimeCaption(m.id);
      const lbl = '×' + (Math.round(m.m * 100) / 100);
      texts.push({ s: lbl, x: W / 2, y: L.by + L.board * 0.38, t: clock, size: 52, col: m.id === 'star' ? '#d3bdf0' : COL.brassLight, big: true });
      P.sound('five', 0.5);
    } });
    t += 0.2;
  });
  // 最后：从棋盘射出一支大弩箭，飞上去扎在车上；血条这时才掉
  const hpAfter = g.hp;
  timeline.push({ t, fn: () => {
    if (res.dmg > 0) {
      const from = clearStep ? lineCenter(clearStep.units[0] < 9 ? { axis: 'row', idx: clearStep.units[0] } : clearStep.units[0] < 18 ? { axis: 'col', idx: clearStep.units[0] - 9 } : { axis: 'row', idx: Math.floor((clearStep.units[0] - 18) / 3) * 3 + 1 }) : { x: W / 2, y: L.by + L.board / 2 };
      missiles.push({ x0: from.x, y0: from.y, t: clock, dmg: res.dmg });
      P.sound('bolt', 0.5);
      if (nRelic >= 2) say(nRelic >= 4 ? '好一串！' : '连上了');
    }
  } });
  timeline.push({ t: t + 0.4, fn: () => {
    if (res.dmg > 0) {
      siegeFx.cartHit = clock; siegeFx.hpShow = hpAfter;
      const cp = cartPos();
      texts.push({ s: '-' + res.dmg, x: cp.x + 70, y: cp.y - 4, t: clock, size: 26 + Math.min(20, res.dmg / 10), col: COL.red, big: res.dmg >= 60 });
      P.sound(res.dmg >= 60 ? 'combo4' : 'place', 0.6);
      shake = Math.max(shake, res.dmg >= 60 ? 6 : 2);
    }
    if (sev.killed) {
      siegeFx.cartDead = clock;
      const cp = cartPos();
      for (let n = 0; n < 16; n++) { const a = Math.random() * Math.PI * 2, sp = 100 + Math.random() * 180; fx.push({ kind: 'gear', x: cp.x, y: cp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, t: clock, life: 0.9, s: 5 + Math.random() * 7, a: 0 }); }
      texts.push({ s: '打掉了！', x: W / 2, y: cp.y + 30, t: clock + 0.05, size: 30, col: COL.brassLight, big: true });
      P.sound('win', 0.6); flash = 0.3;
      say('打掉了！');
      siegeFx.chooseAt = clock + 0.6;
    }
    if (g.over) endGame();
  } });
}
// 星：发光的星 + 一道虚线指向下一站
function drawSiegeBoard() {
  // 被机关打掉、还没轮到它碎的格子先照原样画着
  ghosts = ghosts.filter((gh) => {
    if (clock >= gh.t) { clearing.push({ k: gh.k, t: clock }); return false; }
    const x = cellX(gh.k % 9), y = cellY(Math.floor(gh.k / 9));
    if (gh.ink) { ctx.fillStyle = COL.ink; ctx.fillRect(x + 3, y + 3, L.cell - 6, L.cell - 6); }
    else block(x, y, L.cell, 1, gh.ci);
    return true;
  });
  if (g.lvOf('star')) {
    const c = boxCenter(g.starBox);
    const next = boxCenter(SG.STAR_PATH[(g.starStep + 1) % 9]);
    ctx.save();
    ctx.strokeStyle = 'rgba(211,189,240,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(next.x, next.y); ctx.stroke();
    ctx.setLineDash([]);
    const bx = cellX((g.starBox % 3) * 3), by = cellY(Math.floor(g.starBox / 3) * 3);
    ctx.strokeStyle = 'rgba(211,189,240,' + (0.55 + Math.sin(clock * 5) * 0.3) + ')'; ctx.lineWidth = 3;
    ctx.strokeRect(bx + 2, by + 2, L.cell * 3 - 4, L.cell * 3 - 4);
    starShape(c.x, c.y, L.cell * 0.55 + Math.sin(clock * 4) * 2, '#efe2ff');
    ctx.restore();
  }
  // 竖着射的连弩
  colBolts = colBolts.filter((b) => clock - b.t < 0.5);
  colBolts.forEach((b) => {
    const a = (clock - b.t) / 0.5, x = L.bx + b.col * L.cell;
    const head = L.by + L.board + 40 - a * (L.board + 80);
    ctx.fillStyle = 'rgba(255,240,200,' + (1 - a) + ')'; ctx.fillRect(x - 2, head, 4, 70);
    ctx.fillStyle = COL.brassLight; ctx.beginPath(); ctx.moveTo(x, head - 12); ctx.lineTo(x - 6, head); ctx.lineTo(x + 6, head); ctx.fill();
  });
  // 机关栏连到棋盘的光
  beams = beams.filter((b) => clock - b.t < 0.35);
  beams.forEach((b) => {
    const a = (clock - b.t) / 0.35;
    ctx.strokeStyle = b.col; ctx.globalAlpha = 1 - a; ctx.lineWidth = 6 * (1 - a) + 1;
    ctx.beginPath(); ctx.moveTo(b.from.x, b.from.y); ctx.lineTo(b.to.x, b.to.y); ctx.stroke();
    ctx.globalAlpha = 1;
  });
}
function starShape(x, y, r, col) {
  ctx.fillStyle = COL.ink; ctx.beginPath();
  for (let n = 0; n < 10; n++) { const a = -Math.PI / 2 + (n * Math.PI) / 5, rr2 = (n % 2 ? 0.45 : 1) * (r + 2); ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath();
  for (let n = 0; n < 10; n++) { const a = -Math.PI / 2 + (n * Math.PI) / 5, rr2 = (n % 2 ? 0.45 : 1) * r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fill();
}
// 机关图标：黄铜圆章 + 一个字 + 等级小点
function relicIcon(id, x, y, s, lvl, pop) {
  const R = SG.RELICS[id];
  const k = 1 + (pop || 0) * 0.35;
  const r = (s / 2) * k;
  ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(x, y + 2, r + 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SCHOOL_COL[R.school]; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COL.copper; ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,246,214,0.8)'; ctx.fillRect(x - r * 0.45, y - r * 0.62, r * 0.5, Math.max(2, r * 0.1));
  text(R.glyph, x, y + 1, Math.round(s * 0.5 * k), COL.text);
  for (let n = 0; n < (lvl || 0); n++) {
    ctx.fillStyle = COL.brassLight; ctx.beginPath(); ctx.arc(x - (lvl - 1) * 4 + n * 8, y + r + 4, 2.6, 0, Math.PI * 2); ctx.fill();
  }
}
function drawSiegeHud() {
  const G2 = siegeGeo();
  const top = L.top;
  // 战场底色：远山剪影
  ctx.fillStyle = 'rgba(42,55,104,0.55)';
  ctx.beginPath(); ctx.moveTo(0, G2.wallY); ctx.lineTo(0, top + 60); ctx.lineTo(W * 0.18, top + 26); ctx.lineTo(W * 0.32, top + 70); ctx.lineTo(W * 0.5, top + 8); ctx.lineTo(W * 0.68, top + 64); ctx.lineTo(W * 0.84, top + 30); ctx.lineTo(W, top + 72); ctx.lineTo(W, G2.wallY); ctx.closePath(); ctx.fill();
  // 路：从远处一直通到城门，越近越宽
  ctx.fillStyle = '#4d3c2a';
  ctx.beginPath(); ctx.moveTo(W / 2 - 22, top + 6); ctx.lineTo(W / 2 + 22, top + 6); ctx.lineTo(W / 2 + 62, G2.wallY + 4); ctx.lineTo(W / 2 - 62, G2.wallY + 4); ctx.closePath(); ctx.fill();
  // 路上的 4 个站点（车一轮走一步）
  for (let k = 0; k < SG.ROUNDS; k++) {
    const y = G2.roadTop + k * (G2.roadBot - G2.roadTop) / (SG.ROUNDS - 1);
    ctx.fillStyle = k < siegeFx.cartStep ? 'rgba(0,0,0,0.25)' : 'rgba(255,240,200,0.18)';
    ctx.fillRect(W / 2 - 30 - k * 6, y + 26, 60 + k * 12, 3);
  }
  // 车：一轮走一步，平滑地挪
  if (siegeFx.lastWave !== g.wave) { siegeFx.lastWave = g.wave; siegeFx.cartStep = 0; siegeFx.hpShow = g.hp; waveBanner(); }
  const target = g.round - 1;
  siegeFx.cartStep += (target - siegeFx.cartStep) * 0.12;
  if (siegeFx.hpShow === undefined || siegeFx.hpShow > g.hpMax) siegeFx.hpShow = g.hp;
  const dead = g.phase !== 'play' || clock - siegeFx.cartDead < 0.6;
  const cp = cartPos();
  if (!dead) {
    const hitA = clock - siegeFx.cartHit;
    const jig = hitA < 0.3 ? Math.sin(hitA * 70) * 5 : 0;
    drawCart(cp.x + jig, cp.y, g.waveDef.boss, hitA < 0.12);
    // 大血条：固定在顶上第二行，整条宽，写着车名和剩多少血
    const bw = W - 120, bh = 18, bx = 78, by = L.top + 36;
    const frac = Math.max(0, siegeFx.hpShow / g.hpMax);
    ctx.fillStyle = COL.ink; rr(bx - 2, by - 2, bw + 4, bh + 4, 8); ctx.fill();
    ctx.fillStyle = '#2a1414'; rr(bx, by, bw, bh, 7); ctx.fill();
    ctx.fillStyle = frac < 0.3 ? '#ff7a4a' : COL.red; rr(bx, by, Math.max(6, bw * frac), bh, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(bx + 4, by + 2, Math.max(0, bw * frac - 8), 3);
    text('血 ' + Math.max(0, Math.round(siegeFx.hpShow)) + ' / ' + g.hpMax, bx + bw / 2, by + bh / 2 + 1, 14, COL.text);
    text(g.waveDef.name, bx - 8, by + bh / 2, 16, g.waveDef.boss ? COL.red : COL.text, 'right');
    // 一根细线把血条和车连起来，看得出是这辆车的血
    ctx.strokeStyle = 'rgba(226,85,59,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(cp.x, by + bh + 2); ctx.lineTo(cp.x, cp.y - 42); ctx.stroke(); ctx.setLineDash([]);
  }
  // 城墙：砖色一条，带垛口；中间城门
  const wy = G2.wallY;
  ctx.fillStyle = COL.ink; ctx.fillRect(0, wy - 2, W, 40);
  ctx.fillStyle = '#6b5a48'; ctx.fillRect(0, wy, W, 36);
  for (let x = 0; x < W; x += 26) { ctx.fillStyle = '#7d6a55'; ctx.fillRect(x, wy - 10, 16, 12); ctx.fillStyle = COL.ink; ctx.fillRect(x, wy - 12, 16, 2); }
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = 0; x < W; x += 20) ctx.fillRect(x, wy + 17, 10, 2);
  // 城门（车撞的就是这里）
  const near = !dead && g.round >= SG.ROUNDS;
  ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(W / 2, wy + 36, 24, Math.PI, 0); ctx.fill();
  ctx.fillStyle = near ? (Math.sin(clock * 12) > 0 ? COL.red : '#5a2a20') : '#3a2a1c'; ctx.beginPath(); ctx.arc(W / 2, wy + 36, 20, Math.PI, 0); ctx.fill();
  // 机关栏：嵌在城墙上
  for (let n = 0; n < SG.SLOTS; n++) {
    const p = relicSlotPos(n);
    const r = g.relics[n];
    if (!r) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2 - 2, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    const pa = relicPop[r.id] ? Math.max(0, 0.3 - (clock - relicPop[r.id])) / 0.3 : 0;
    relicIcon(r.id, p.x, p.y, p.s, r.lv, pa);
    buttons.push({ id: 'relic' + n, x: p.x - p.s / 2, y: p.y - p.s / 2, w: p.s, h: p.s, fn: () => { siegeFx.tip = { id: r.id, t: clock }; } });
  }
  // 左上：返回、第几波；右上：还有几步撞门
  button('map', 10, top - 4, 40, 32, '‹', { size: 24, bg: COL.wood, fn: () => { timeline = []; mode = 'map'; } });
  text((g.daily ? '每日 · ' : '') + '第 ' + (g.wave + 1) + ' 波', 58, top + 12, 15, g.daily ? COL.jade : COL.text, 'left');
  if (!dead) {
    const left = SG.ROUNDS - g.round + 1;
    const urgent = left <= 1;
    text(urgent ? '下一轮就撞门！' : '还有 ' + left + ' 轮撞门', W - 12, top + 12, urgent ? 16 + Math.sin(clock * 10) : 15, urgent ? COL.red : COL.text, 'right');
  }
  if (g.charge > 1) text('下次打车 ×' + g.charge, W - 12, top + 70, 13, COL.brassLight, 'right');
  // 点机关看一行字
  if (siegeFx.tip && clock - siegeFx.tip.t < 2) {
    const R = SG.RELICS[siegeFx.tip.id], L2 = g.lvOf(siegeFx.tip.id);
    const s2 = R.name + '：' + R.desc[Math.max(0, L2 - 1)];
    ctx.font = 'bold 15px "PingFang SC", sans-serif';
    const tw = Math.min(W - 16, ctx.measureText(s2).width + 24);
    ctx.fillStyle = COL.steam; rr((W - tw) / 2, wy - 40, tw, 30, 8); ctx.fill();
    ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s2, W / 2, wy - 25, W - 30);
  }
  // 换波横幅
  const bn = siegeFx.banner;
  if (bn && clock - bn.t < 2.4 && g.phase === 'play') {
    const a = Math.min(1, (clock - bn.t) * 4) * Math.min(1, (2.4 - (clock - bn.t)) * 3);
    ctx.globalAlpha = a;
    ctx.fillStyle = COL.shade + '0.78)'; ctx.fillRect(0, L.by + L.board * 0.36, W, bn.sub ? 76 : 50);
    text(bn.text, W / 2, L.by + L.board * 0.36 + 25, 26, bn.boss ? COL.red : COL.brassLight);
    if (bn.sub) text(bn.sub, W / 2, L.by + L.board * 0.36 + 56, 16, COL.text, 'center', 'normal');
    ctx.globalAlpha = 1;
  }
}
// 弩箭：从消掉的那一排飞到车上（画在最上层）
function drawMissiles() {
  missiles = missiles.filter((m) => clock - m.t < 0.4);
  const cp = cartPos();
  missiles.forEach((m) => {
    const a = (clock - m.t) / 0.4, e = a * a;
    const x = m.x0 + (cp.x - m.x0) * e, y = m.y0 + (cp.y + 10 - m.y0) * e;
    const ang = Math.atan2(cp.y - m.y0, cp.x - m.x0);
    const len = 46 + Math.min(40, m.dmg / 4);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(255,240,200,0.5)'; ctx.fillRect(-len - 30, -3, 30, 6);
    ctx.fillStyle = COL.brassLight; ctx.fillRect(-len, -2.5, len, 5);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.fill();
    ctx.restore();
    text(String(m.dmg), x + 18, y - 14, 18, COL.brassLight);
  });
}
// 机关第一次发动时的那句说明（压在棋盘下沿，2.6 秒）
function drawCaption() {
  const cp = siegeFx.caption;
  if (!cp || clock - cp.t > 2.6) return;
  const a = Math.min(1, (clock - cp.t) * 5) * Math.min(1, (2.6 - (clock - cp.t)) * 3);
  ctx.globalAlpha = a;
  ctx.font = 'bold 16px "PingFang SC", sans-serif';
  const tw = Math.min(W - 20, ctx.measureText(cp.text).width + 28);
  const y = L.by + L.board - 52;
  ctx.fillStyle = COL.steam; rr((W - tw) / 2, y, tw, 40, 10); ctx.fill();
  ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(cp.text, W / 2, y + 21, W - 40);
  ctx.globalAlpha = 1;
}
// 攻城车（正面朝下，冲着城门来）：木架子 + 顶棚 + 往下伸的撞木 + 四个轮子；头目是红顶
function drawCart(x, y, boss, white) {
  const wood = white ? '#fff' : '#8a6438', dark = white ? '#fff' : '#5e4226';
  // 轮子
  for (const [dx, dy] of [[-34, -16], [34, -16], [-34, 14], [34, 14]]) {
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(x + dx, y + dy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.copper; ctx.beginPath(); ctx.arc(x + dx, y + dy, 5.5, 0, Math.PI * 2); ctx.fill();
  }
  // 车身
  ctx.fillStyle = COL.ink; rr(x - 30, y - 26, 60, 52, 6); ctx.fill();
  ctx.fillStyle = wood; rr(x - 28, y - 24, 56, 48, 5); ctx.fill();
  ctx.fillStyle = dark; for (let k = -1; k <= 1; k++) ctx.fillRect(x - 28, y + k * 14 - 1, 56, 3);
  // 顶棚
  ctx.fillStyle = white ? '#fff' : boss ? '#b8322a' : '#6b4a2a';
  ctx.beginPath(); ctx.moveTo(x - 34, y - 20); ctx.lineTo(x, y - 40); ctx.lineTo(x + 34, y - 20); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.stroke();
  // 撞木：往下伸，铜头
  ctx.fillStyle = COL.ink; ctx.fillRect(x - 7, y + 20, 14, 26);
  ctx.fillStyle = dark; ctx.fillRect(x - 5, y + 20, 10, 24);
  ctx.fillStyle = COL.brassLight; rr(x - 9, y + 42, 18, 10, 3); ctx.fill();
  if (boss) { ctx.fillStyle = COL.brassLight; ctx.beginPath(); ctx.arc(x, y - 30, 4, 0, Math.PI * 2); ctx.fill(); }
}
// 三选一：三张横卡竖着排（拇指够得着）
function drawSiegeChoose() {
  if (g.phase !== 'choose' || !g.offer || clock < siegeFx.chooseAt || siegeBusy()) return;
  const age = clock - siegeFx.chooseAt;
  ctx.fillStyle = COL.shade + Math.min(0.85, age * 3) + ')'; ctx.fillRect(0, 0, W, H);
  const opening = g.wavesWon === 0;
  const single = g.offer.length === 1;
  text(single ? '打掉了！送你一件机关' : opening ? '开局挑一件机关' : '打掉了！挑一件机关', W / 2, L.by + 10, 26, COL.brassLight);
  text(single || !Object.keys(save.relicGot).length ? '机关会自己帮你打车，你照常消方块就行' : '下一波：' + (SG.WAVES[g.wave + 1] ? SG.WAVES[g.wave + 1].name : '重车'), W / 2, L.by + 42, 14, COL.dim, 'center', 'normal');
  const cw = Math.min(W - 40, 360), ch = 96, x = (W - cw) / 2;
  g.offer.forEach((id, n) => {
    const k = Math.min(1, Math.max(0, (age - n * 0.06) / 0.18));
    if (k <= 0) return;
    const y = L.by + 72 + n * (ch + 14) + (1 - k) * 30;
    const R = SG.RELICS[id];
    const have = g.lvOf(id);
    ctx.globalAlpha = k;
    const pressed = downBtn === 'pick' + n;
    ctx.fillStyle = COL.ink; rr(x, y + 5, cw, ch, 14); ctx.fill();
    ctx.fillStyle = COL.wood; rr(x, y + (pressed ? 2 : 0), cw, ch, 14); ctx.fill();
    ctx.strokeStyle = SCHOOL_COL[R.school]; ctx.lineWidth = 4; rr(x + 2, y + 2 + (pressed ? 2 : 0), cw - 4, ch - 4, 12); ctx.stroke();
    relicIcon(id, x + 46, y + ch / 2, 52, have ? have + 1 : 1, 0);
    text(R.name + (have ? '  升到 ' + (have + 1) + ' 级' : ''), x + 84, y + 28, 20, COL.text, 'left');
    text(R.desc[Math.min(2, have)], x + 84, y + 58, 15, COL.text, 'left', 'normal');
    const pal = SG.palOf(g, id);
    if (!save.relicGot[id]) text('新！', x + cw - 14, y + 26, 15, COL.red, 'right');
    else if (pal && !have) text('配你的' + pal, x + cw - 14, y + 26, 13, COL.jade, 'right');
    ctx.globalAlpha = 1;
    buttons.push({ id: 'pick' + n, x, y, w: cw, h: ch, fn: () => {
      save.relicGot[id] = true; persist();
      g.pick(id);
      relicPop[id] = clock + 0.05;
      P.sound('coin', 0.6);
      if (g.phase === 'play') waveBanner();
      if (g.over) endGame();
    } });
  });
}
function endSiege() {
  if (g.won && g.firstRun && !save.siegeDone) save.siegeDone = true;
  if (!g.daily && !g.endlessOn && (!g.firstRun || g.won)) save.siegeRuns = (save.siegeRuns || 0) + 1;
  const prevBest = save.siegeBest || 0;
  let dailyPrev = 0;
  if (g.daily) {
    const d = dailyRec();
    dailyPrev = d.best;
    d.best = Math.max(d.best, g.wavesWon);
    d.bestHit = Math.max(d.bestHit, g.bestHit);
  } else save.siegeBest = Math.max(prevBest, g.wavesWon);
  coinsGot = Math.floor(g.totalDmg / 40) + g.wavesWon * 3;
  save.coins += coinsGot;
  persist();
  result = { won: g.won, reason: g.reason, near: g.nearMiss(), doubled: false, prevBest, dailyPrev, record: g.daily ? g.wavesWon > dailyPrev : g.endlessOn && g.wavesWon > prevBest };
  mode = 'over';
  if (!g.won) { P.sound('lose', 0.6); say(g.reason === 'gate' ? '城破了' : '堵住了'); }
}
// 失败时那一句「差几波」（Cc 定的方向：失败时显示「差一波就守住了」）
function wavesLine() {
  const r = result, n = g.wavesWon;
  if (g.daily) {
    if (r.record) return n > 0 ? '今天新纪录：守住 ' + n + ' 波！' : '';
    const gap = r.dailyPrev - n;
    return gap === 0 ? '追平今天最好的 ' + r.dailyPrev + ' 波，再守一波就破纪录' : '差 ' + gap + ' 波追平今天最好的 ' + r.dailyPrev + ' 波';
  }
  if (!g.endlessOn) { const gap = SG.FIRST_RUN_WAVES - n; return gap === 1 ? '差一波就守住了！' : '守住 ' + n + ' 波，差 ' + gap + ' 波就守住了'; }
  if (r.record) return '新纪录：守住 ' + n + ' 波！';
  const gap = r.prevBest - n;
  return gap <= 0 ? '' : '差 ' + gap + ' 波追上你最好的 ' + r.prevBest + ' 波';
}
function drawSiegeOver() {
  const age = clock - overAt;
  const r = result;
  ctx.fillStyle = COL.shade + Math.min(0.85, age * 2) + ')'; ctx.fillRect(0, 0, W, H);
  if (age < 0.4) return;
  const pw = Math.min(W - 40, 340), ph = 360, px = (W - pw) / 2, py = Math.max(L.top + 40, (H - ph) / 2 - 40);
  panel(px, py, pw, ph);
  const title = r.won ? '守住了！' : g.daily && r.record && g.wavesWon > 0 ? '新纪录！' : g.reason === 'gate' ? (r.near ? '只差 ' + g.hp + ' 点！' : '城破了') : '堵住了';
  text(title, W / 2, py + 38, 30, r.won ? COL.brassLight : r.near ? COL.red : COL.text);
  const wl = r.won ? '' : wavesLine();
  if (wl) text(wl, W / 2, py + 72, 17, r.record ? COL.brassLight : COL.red);
  text('打下 ' + g.wavesWon + ' 波  ·  最狠一手 ' + g.bestHit + ' 点', W / 2, py + (wl ? 98 : 82), 15, COL.text, 'center', 'normal');
  // 这一局的机关
  const n = g.relics.length;
  g.relics.forEach((rl, i) => relicIcon(rl.id, W / 2 + (i - (n - 1) / 2) * 50, py + 132, 38, rl.lv, 0));
  if (!n) text('（没拿机关）', W / 2, py + 132, 14, COL.dim, 'center', 'normal');
  text('+' + coinsGot + ' 金  ·  ' + (g.daily ? '今天最好 ' + dailyRec().best + ' 波' : '最多守住 ' + save.siegeBest + ' 波'), W / 2, py + 172, 15, COL.brassLight, 'center', 'normal');
  const bw = pw - 48, bx = px + 24;
  if (g.daily) {
    // 每日一城：晒成绩最大；再守一次要看今天还剩几次
    button('share', bx, py + 196, bw, 58, '晒成绩', { size: 24, fn: () => { mode = 'share'; } });
    const left = dailyLeft();
    if (left > 0) button('again', bx, py + 266, bw * 0.6 - 6, 46, '再守（剩 ' + left + ' 次）', { size: 16, bg: COL.copper, fn: () => newDaily() });
    else button('dailyAd', bx, py + 266, bw * 0.6 - 6, 46, '再来一次', { size: 16, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { dailyRec().extra++; persist(); newDaily(); }) });
    button('tomap', bx + bw * 0.6 + 6, py + 266, bw * 0.4 - 6, 46, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
    return;
  }
  if (r.won) {
    button('cont', bx, py + 196, bw, 58, '继续守（车更硬）', { size: 22, fn: () => { g.continueRun(); g._ended = false; mode = 'play'; result = null; siegeFx.chooseAt = clock + 0.1; } });
    button('again', bx, py + 266, bw * 0.6 - 6, 46, '再守一次', { size: 18, bg: COL.copper, fn: () => newSiege() });
    button('tomap', bx + bw * 0.6 + 6, py + 266, bw * 0.4 - 6, 46, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
  } else {
    button('again', bx, py + 196, bw, 58, '再守一次', { size: 24, fn: () => newSiege() });
    if (g.adsUsed < C.adMax) {
      button('revive', bx, py + 266, bw * 0.6 - 6, 46, g.reason === 'gate' ? '多打一轮' : '清空正中间', { size: 17, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { g.revive(); g._ended = false; mode = 'play'; result = null; stats.starts.push(P.now()); }) });
      button('tomap', bx + bw * 0.6 + 6, py + 266, bw * 0.4 - 6, 46, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
    } else button('tomap', bx, py + 266, bw, 46, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
  }
}

// 晒成绩：一张竖卡（微信里接分享给好友；浏览器试玩版只显示这张卡）
function drawShareCard() {
  ctx.fillStyle = COL.shade + '0.9)'; ctx.fillRect(0, 0, W, H);
  const cw = Math.min(W - 60, 320), chh = Math.min(H - 220, 470), x = (W - cw) / 2, y = (H - chh) / 2 - 30;
  ctx.fillStyle = COL.ink; rr(x, y + 6, cw, chh, 18); ctx.fill();
  const bgG = ctx.createLinearGradient(0, y, 0, y + chh);
  bgG.addColorStop(0, COL.bg); bgG.addColorStop(1, COL.bgLow);
  ctx.fillStyle = bgG; rr(x, y, cw, chh, 18); ctx.fill();
  ctx.strokeStyle = COL.brass; ctx.lineWidth = 3; rr(x + 6, y + 6, cw - 12, chh - 12, 14); ctx.stroke();
  const d = dailyRec();
  const [yy, mm, dd] = d.date.split('-');
  text('每日一城 · ' + (+mm) + ' 月 ' + (+dd) + ' 日', W / 2, y + 40, 18, COL.jade);
  text('守住', W / 2, y + 92, 20, COL.text, 'center', 'normal');
  text(String(g.wavesWon), W / 2, y + 150, 88, COL.brassLight);
  text('波', W / 2, y + 206, 20, COL.text, 'center', 'normal');
  drawCart(W / 2 - 70, y + 250, true, false);
  starShape(W / 2 + 70, y + 250, 16, '#efe2ff');
  const n = g.relics.length;
  g.relics.forEach((rl, i) => relicIcon(rl.id, W / 2 + (i - (n - 1) / 2) * 46, y + 304, 36, rl.lv, 0));
  text('最狠一手 ' + g.bestHit + ' 点', W / 2, y + 352, 16, COL.text, 'center', 'normal');
  text('今天人人守同一座城，你能守几波？', W / 2, y + chh - 50, 14, COL.dim, 'center', 'normal');
  text('九宫消', W / 2, y + chh - 24, 16, COL.brassLight);
  text('（微信里点「发给好友」就把这张图发出去）', W / 2, y + chh + 30, 13, COL.dim, 'center', 'normal');
  const bw = Math.min(W - 60, 300);
  button('shareClose', (W - bw) / 2, y + chh + 52, bw, 50, '好', { size: 20, fn: () => { mode = 'over'; } });
}

// ---------- 主循环 ----------
function frame() {
  const now = P.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update((mode === 'album' && albumFrom === 'play') || mode === 'cut' ? 0 : dt);
  buttons = [];
  LY.setMetrics(W, L.top, H); LY.beginFrame();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (mode !== 'cut' && CUT.playing) CUT.clear(); // 过场中被别的入口切走了（只有测试会这样）
  if (mode === 'cut') {
    CUT.update(dt * 1000);
    if (CUT.playing) CUT.draw(); else { endCuts(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  } else if (mode === 'album') {
    drawAlbum();
  } else if (mode === 'home') {
    drawHome();
  } else if (mode === 'settings') {
    drawSettings();
  } else if (mode === 'camp') {
    drawCamp();
  } else if (mode === 'map') {
    ctx.save();
    drawChapter(); // 0.8：章页取代弯路地图（drawMap 留着不删）
    ctx.restore();
  } else {
    ctx.save();
    if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawBg();
    drawHud();
    drawBoard(mode === 'play');
    drawTray();
    drawFoot();
    drawFx();
    drawTutorial();
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = 'rgba(255,244,214,' + flash + ')'; ctx.fillRect(0, 0, W, H); }
    if (mode === 'over' || mode === 'share' || (mode === 'ad' && result)) drawOver();
    if (mode === 'share') { buttons = buttons.filter((b) => b.id === 'map'); drawShareCard(); }
    if (mode === 'intro') drawIntro();
    if (mode === 'start') drawStartCard();
    if (mode === 'play' && g.siege) { drawCaption(); drawSiegeChoose(); }
    if ((mode === 'play' || mode === 'intro') && g.pets) drawPetCaption();
    if (mode === 'ad') drawAd();
  }
  P.nextFrame(frame);
}

// 第一次打开：直接进第 1 关（10 秒内爽）；以后先看旅程地图
CUT = require('./cuts.js')({
  P, W, H, dpr, withCtx, petIcon, inkMonster, text, PG, sound: (n, v) => P.sound(n, v),
  get save() { return save; }, persist, getCtx: () => ctx,
});
if (!save.petTutDone) newPetLevel(0);
else { newPetLevel(0, true); mode = 'home'; } // 老玩家先看主菜单 // 以后每次打开先看主菜单
P.nextFrame(frame);

// 给测试用（只在浏览器里挂到 window 上）
// 游戏修改器（共用界面编辑器）要的接口：画面名、切画面、画布大小（只在浏览器里挂上）
const EDITOR_SCENES = [
  { id: 'home', name: '主菜单', go: () => { CUT.clear(); mode = 'home'; } },
  { id: 'map', name: '地图（章页）', go: () => { CUT.clear(); chapView = null; chapSel = null; mode = 'map'; } },
  { id: 'camp', name: '营地', go: () => { CUT.clear(); mode = 'map'; openCamp(); } },
  { id: 'play', name: '关里', note: '先只能评论', go: () => { newPetLevel(Math.min(save.petStage, PLV.length - 1), true); CUT.clear(); if (mode === 'intro') mode = 'play'; } },
  { id: 'over', name: '结算', note: '先只能评论', go: () => { newPetLevel(Math.min(save.petStage, PLV.length - 1), true); CUT.clear(); g.over = true; g.won = true; g.reason = 'win'; g._ended = false; endGame(); CUT.clear(); mode = 'over'; overAt = clock - 5; } },
  { id: 'settings', name: '设置', note: '先只能评论', go: () => { CUT.clear(); settingsFrom = 'home'; mode = 'settings'; } },
];
P.exposeForTest('__app', {
  get sceneName() { return mode === 'cut' ? cutPrev : mode === 'intro' ? 'play' : mode; },
  overlays: [], W, H, redraw() {}, editorScenes: EDITOR_SCENES,
});
P.exposeForTest('__layout', LY);
P.exposeForTest('__game', {
  get g() { return g; }, get mode() { return mode; }, set mode(v) { mode = v; }, get result() { return result; }, get save() { return save; },
  get paintIdx() { return paintIdx; }, stats, L, fingerFor, slotCenter, buttons: () => buttons.slice(),
  get stageIdx() { return stageIdx; }, get chipPos() { return chipPos; }, LV, newStage, SG, newSiege, newDaily, dailyLeft: () => dailyLeft(), siegeBusy: () => siegeBusy(),
  PG, PLV, newPetLevel, newEvolution, openCamp, feedPet, get petIdx() { return petIdx; },
  reset() { save = freshSave(); persist(); newStage(0); },
  setSave(o) { Object.assign(save, o); persist(); },
  get cutPlaying() { return CUT.playing; }, levelUpPet, danToLevel, get CUT() { return CUT; }, playCuts, skipCuts() { while (mode === 'cut') { CUT.skip(); if (!CUT.playing) endCuts(); } if (mode === 'start' && startCard) { mode = startCard.next || 'play'; startCard = null; } },
  newGame, endGame, core,
});
