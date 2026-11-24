// 洛书九宫 原型 0.3：旅程地图 + 15 关（照 Woodoku 旅程）、经典 3 分钟拼画、拖块、特效、结算、画册。规则全在 core.js，关卡在 levels.js。
const P = require('./platform.js');
const C = require('./config.js');
const core = require('./core.js');
const art = require('./art.js');
const LV = require('./levels.js');
const SG = require('./siege.js');
const PG = require('./petgame.js');
const PLV = require('./petlevels.js');

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
  L.trayH = Math.max(110, Math.min(L.cell * 4, H - (L.by + L.board + 22) - 96));
  // 屏幕高出来的部分：整体往下挪一点，手指够得着
  const slack = H - (L.by + L.board + 22 + L.trayH + 96);
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
function text(s, x, y, size, col, align, weight) {
  ctx.font = (weight || 'bold') + ' ' + size + 'px "PingFang SC", "Hiragino Sans GB", sans-serif';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = COL.ink;
  ctx.strokeText(s, x, y);
  ctx.fillStyle = col;
  ctx.fillText(s, x, y);
}
function button(id, x, y, w, h, label, opt) {
  const o = opt || {};
  const pressed = downBtn === id;
  const dy = pressed ? 2 : 0;
  ctx.fillStyle = COL.ink;
  rr(x, y + 4, w, h, 12); ctx.fill();
  ctx.fillStyle = o.bg || COL.brass;
  rr(x, y + dy, w, h, 12); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  rr(x + 4, y + dy + 3, w - 8, h * 0.35, 8); ctx.fill();
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
  rr(x, y + dy, w, h, 12); ctx.stroke();
  text(label, x + w / 2, y + h / 2 + dy + 1, o.size || 20, o.fg || COL.text);
  if (o.ad) {
    // 小电视图标 = 广告
    const ix = x + w - 22, iy = y + dy + 6;
    ctx.fillStyle = COL.red; rr(ix, iy, 16, 12, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(ix + 6, iy + 3); ctx.lineTo(ix + 12, iy + 6); ctx.lineTo(ix + 6, iy + 9); ctx.fill();
  }
  buttons.push({ id, x, y, w, h, fn: o.fn });
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
  else if (key === 'monster') inkMonster(cx, cy, s * 0.55, false);
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
function slotCenter(i) {
  return { x: (W / 3) * (i + 0.5), y: L.trayY + L.trayH / 2 };
}
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
      const i = Math.max(0, Math.min(2, Math.floor(x / (W / 3))));
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
  cleared.forEach((k) => {
    clearing.push({ k, t: clock });
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
  button('map', 10, y + 4, 62, 38, '‹ 地图', { size: 15, bg: COL.wood, fn: () => { if (g.over && !g._ended) endGame(); timeline = []; mode = 'map'; } }); // 赢的那一下马上点回去：先把这关记上账
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
  button('map', 10, y + 4, 62, 38, '‹ 地图', { size: 15, bg: COL.wood, fn: () => { if (g.over && !g._ended) endGame(); timeline = []; mode = 'map'; } }); // 赢的那一下马上点回去：先把这关记上账
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
    willClear.forEach((k) => ctx.fillRect(cellX(k % 9), cellY(Math.floor(k / 9)), cell, cell));
  }
  // 块
  for (let k = 0; k < 81; k++) {
    if (!g.board[k]) continue;
    const pop = popping.find((p) => p.k === k);
    const sc = pop ? 1 + 0.18 * (1 - (clock - pop.t) / 0.15) : 1;
    const s = cell * sc, x = cellX(k % 9) + (cell - s) / 2, y = cellY(Math.floor(k / 9)) + (cell - s) / 2;
    if (g.board[k] === 3) { inkMonster(x + s / 2, y + s / 2, s * 0.4, false); continue; }
    if (g.board[k] === 6) { armorMonster(x + s / 2, y + s / 2, s * 0.4, petFx.armorBounce && petFx.armorBounce[k] ? Math.max(0, 0.3 - (clock - petFx.armorBounce[k])) : 0); continue; }
    if (g.board[k] === 7) { jumperMonster(x + s / 2, y + s / 2, s * 0.4, g.jumpPlan && g.jumpPlan[k] !== undefined ? g.jumpPlan[k] : null, k); continue; }
    if (g.board[k] === 5) { ironRock(x, y, s); if (g.rockHp && g.rockHp[k] > 1) { ctx.strokeStyle = '#8a90a0'; ctx.lineWidth = 2; ctx.strokeRect(x + 4, y + 4, s - 8, s - 8); ctx.strokeRect(x + 8, y + 8, s - 16, s - 16); } continue; }
    if (g.board[k] === 4) {
      // 大墨怪：2×2 画成一只，只在左上那格画
      if (g.bigCells && g.bigCells[0] === k) {
        const hit = petFx.bossHit && clock - petFx.bossHit < 0.3 ? Math.sin(clock * 70) * 5 : 0;
        const scared = petFx.bossScared ? Math.sin(clock * 40) * 2 : 0;
        inkMonster(x + s + hit + scared, y + s, s * 0.85 * (petFx.bossScared ? 0.94 : 1), true);
        // 头上几颗红心 = 还要打几下；打中一下碎一颗（宠物咬、或者它晕着时打中，碎两颗）
        const tot = g.stage.bigHp || 3, hs = tot > 5 ? 7 : 10, gap = tot > 5 ? 17 : 26;
        for (let n = 0; n < tot; n++) heart(x + s - (tot - 1) * gap / 2 + n * gap, y - 22, hs, n < g.bigHp);
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
    ctx.fillStyle = a < 0.4 ? '#fff' : COL.brassLight;
    ctx.fillRect(x, y, s, s);
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
  for (let i = 0; i < 3; i++) {
    const p = g.hand[i];
    if (!p || (drag && drag.slot === i)) continue;
    const c = slotCenter(i);
    const fits = core.anyPlacement(g.board, p);
    const s = Math.min(L.mini, ((W / 3) - 20) / p.w, (L.trayH - 16) / p.h);
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
  drawMofei();
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
    if (f.kind === 'shard') { ctx.fillStyle = a > 0.6 ? COL.brassLight : COL.brass; ctx.fillRect(f.x, f.y, f.s, f.s); }
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
    text(t.s, Math.max(half, Math.min(W - half, t.x)), t.y - age * (t.big ? 20 : 50), sz, t.col);
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
  ctx.fillStyle = COL.ink; rr(px, py + 6, pw, ph, 18); ctx.fill();
  ctx.fillStyle = COL.wood; rr(px, py, pw, ph, 18); ctx.fill();
  ctx.strokeStyle = COL.brass; ctx.lineWidth = 3; rr(px + 6, py + 6, pw - 12, ph - 12, 14); ctx.stroke();
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
    else { goalIcon(key, cx - 12, gy, 20); text('×' + st.goal[key], cx + 14, gy, 16, COL.text); }
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
  const campNew = save.gourd > 0 || (save.dan > 0 && save.petOrder.length);
  button('camp', bx3, H - 82, b3, 46, '营地', { size: 18, bg: '#3f9a7c', fn: () => openCamp() });
  if (campNew) { ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(bx3 + b3 - 6, H - 82, 8, 0, Math.PI * 2); ctx.fill(); }
  button('classic', bx3 + b3 + 6, H - 82, b3, 46, '经典拼画', { size: 15, bg: COL.copper, fn: () => newGame(false) });
  button('album3', bx3 + (b3 + 6) * 2, H - 82, b3, 46, '画册', { size: 17, bg: COL.wood, fn: () => openAlbum() });
  text('葫芦里 ' + save.gourd + ' 只怪 · ' + save.dan + ' 颗丹', W / 2, H - 22, 12, COL.dim, 'center', 'normal');
}

// ---------- 新东西的说明卡（一张小动画 + 一两行字 +「继续」） ----------
const INTRO = {
  gem: { title: '收集宝石', lines: ['宝石所在的那一排或那个大格', '一消掉，就收走它'], row: ['b', 'g', 'b', '.', 'b'], key: 'b' },
  box: { title: '机关匣', lines: ['它自己消不掉。它在的那一排', '或大格每消掉一次，收一个'], row: ['b', 'M', 'b', '.', 'b'], key: 'box' },
  bubble: { title: '泡泡', lines: ['先把块放到泡泡上，', '再消掉那一格，泡泡就破'], row: ['b', 'b', '*', 'b', 'b'], key: 'bubble' },
  // 0.5 宠物线
  monster: { title: '小墨怪', lines: ['它蹲在哪一排，', '把那一排消掉，就抓到它'], row: ['b', 'm', 'b', '.', 'b'], key: 'monster' },
  pet: { title: '铜雀在积蓄能量', lines: ['它脚下那条是能量：你每消掉一排，它攒一格', '攒够了，它就出手帮你'], pet: 'tongque' },
  color: { title: '金色能让它攒得更快', lines: ['消掉金色的方块，金光飞到铜雀身上，', '每 3 块多攒一格能量'], pet: 'tongque', glow: true },
  rock: { title: '铁石', lines: ['你消不掉它：只有宠物出手', '射到、炸到，才打得碎'], rockPic: true },
  boss: { title: '大墨怪', lines: ['它占四格，消不掉；', '它在的那一排每消一次，打它一下'], pet: null, bossPic: true },
  baozhu: { title: '爆竹鼠出战', lines: ['它会跳下来，', '把最挤的大格啃掉一大块'], pet: 'baozhu' },
  modou: { title: '墨斗蚕出战', lines: ['它会爬过去吐丝，', '把快满的一排补满、消掉'], pet: 'modou' },
  armor: { title: '铁甲怪', lines: ['你消掉它那排，锅只弹一下；', '宠物碰它一下，锅才碎'], armorPic: true },
  jumper: { title: '跳跳怪', lines: ['每放 3 块它跳一格，', '跳不出它在的那个大格'], jumperPic: true },
  acts: { title: '让宠物多出手', lines: ['顶上画着几个宠物头像，', '它出手几次才算过关'], pet: 'tongque' },
};
function drawIntro() {
  const it = INTRO[introKind];
  ctx.fillStyle = COL.shade + '0.8)'; ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - 40, 340), ph = 330, px = (W - pw) / 2, py = (H - ph) / 2 - 30;
  ctx.fillStyle = COL.ink; rr(px, py + 6, pw, ph, 18); ctx.fill();
  ctx.fillStyle = COL.wood; rr(px, py, pw, ph, 18); ctx.fill();
  ctx.strokeStyle = COL.brass; ctx.lineWidth = 3; rr(px + 6, py + 6, pw - 12, ph - 12, 14); ctx.stroke();
  text(it.title, W / 2, py + 40, 28, COL.brassLight);
  if (!it.row) {
    // 宠物 / 头目：画一个大图，下面两行字
    const cy = py + 118;
    if (it.bossPic) inkMonster(W / 2, cy, 42, true);
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

// ---------- 主菜单：标题 + 继续 + 营地 / 经典拼画 / 画册 / 设置 ----------
// （正式的标题背景图等 Midjourney 主页图到了再换；现在是代码画的九宫格 + 宠物）
function drawHome() {
  drawBg();
  const cy = L.top + 150;
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
  const bw = Math.min(W - 60, 300), bx = (W - bw) / 2;
  let y = Math.max(cy + 196, H - 360);
  const cur = Math.min(save.petStage, PLV.length - 1);
  button('homePlay', bx, y, bw, 66, save.petStage ? '继续 · ' + petLevelName(cur) : '开始', { size: 26, fn: () => { mode = 'map'; } });
  y += 82;
  const hw = (bw - 12) / 2;
  button('homeCamp', bx, y, hw, 52, '营地', { size: 19, bg: '#3f9a7c', fn: () => openCamp() });
  if (save.gourd > 0 || (save.dan > 0 && save.petOrder.length)) { ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(bx + hw - 6, y + 2, 8, 0, Math.PI * 2); ctx.fill(); }
  button('homeAlbum', bx + hw + 12, y, hw, 52, '画册', { size: 19, bg: COL.wood, fn: () => openAlbum() });
  y += 64;
  button('homeClassic', bx, y, hw, 52, '经典拼画', { size: 17, bg: COL.copper, fn: () => newGame(false) });
  button('homeSettings', bx + hw + 12, y, hw, 52, '设置', { size: 19, bg: COL.woodDark, fn: () => { settingsAsk = 0; settingsFrom = 'home'; mode = 'settings'; } });
  text('试玩版 0.6.1', W / 2, H - 18, 11, COL.dim, 'center', 'normal');
}

// ---------- 设置：声音、振动、重新开始（Cc 11-24：「没有设置页，没法让我重新开始……退不回主菜单」） ----------
let settingsFrom = 'home';
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
  button('setReset', bx, y, bw, 58, asking ? '真的清空？再点一次' : '重新开始', { size: 22, bg: COL.red, fn: () => {
    if (!asking) { settingsAsk = clock; return; }
    // 清空所有进度（宠物、关卡、葫芦、金币、画册……），从第 1 关重新来
    const keepCuts = save.cutSeen; save = freshSave(); save.cutSeen = keepCuts || {}; persist();
    P.setMuted(false);
    settingsAsk = 0;
    newPetLevel(0);
  } });
  text(asking ? '宠物、关卡、葫芦、金币全部清空，回到第 1 关' : '清空所有进度，从第 1 关重新玩', W / 2, y + 80, 14, asking ? COL.red : COL.dim, 'center', 'normal');
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
const EXP_NEED = [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 999];
const DAN_EXP = 2;
function petNodeLabel(i) { return String(i + 1); }
const chapterName = (i) => (i < 10 ? '第一章 · 工坊后院' : '第二章 · 水车坊');
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
function newPetLevel(i, quiet) { // quiet：只把盘面摆好、不放过场（开机时给老玩家垫底用）
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
  // 「第一次打借你一只」的关：过了以后带自己的
  const st1 = st0.firstTeamOnly && save.petStage > i && ownedTeam().length ? Object.assign({}, st0, { team: null, fastCharge: false }) : st0;
  g = PG.createPetGame({ stage: st1, team: st1.team ? null : ownedTeam(), seed: (P.now() ^ (save.plays * 2654435761)) >>> 0, tutorial: i === 0 && !save.petTutDone });
  startPet(st1);
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
  timeline = []; ghosts = []; petRuns = []; beams = []; colBolts = []; petInk = []; // 上一关没演完的动画清掉，免得新盘面上闪一下
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
    const full = pt.energy >= max - 1 && pt.energy > 0;
    if (full) { ctx.strokeStyle = 'rgba(243,210,122,' + (0.4 + Math.sin(clock * 8) * 0.3) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, Math.PI * 2); ctx.stroke(); }
    if (petOut(pt.id)) { ctx.strokeStyle = COL.woodLine; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    else petIcon(pt.id, p.x, p.y, 46, pt.lv, pop);
    // 能量条
    const bw = 64, seg = (bw - (max - 1) * 3) / max, by = p.y + 29;
    for (let k = 0; k < max; k++) {
      ctx.fillStyle = COL.ink; rr(p.x - bw / 2 + k * (seg + 3) - 1, by - 1, seg + 2, 9, 3); ctx.fill();
      ctx.fillStyle = k < pt.energy ? C.blockColors[d.color][1] : COL.woodDark; rr(p.x - bw / 2 + k * (seg + 3), by, seg, 7, 3); ctx.fill();
    }
    buttons.push({ id: 'pet' + n, x: p.x - 28, y: p.y - 28, w: 56, h: 56, fn: () => { petFx.caption = { text: d.name + ' ' + pt.lv + ' 级：' + PG.petDesc(pt.id, pt.lv), t: clock }; } });
  });
}
// 进化关：正中间铺一层宠物颜色、一亮一暗；亮了的格子金边
function drawPetBoard() {
  if (g.bigHp > 0) drawBossHints();
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
  juice({ piece: ev.piece, r: ev.r, c: ev.c, units: ev.units, cells: ev.cells, gained: ev.gained, newlyLit: [], revealed: [], center: false, crossbow: null, win: false, combo: ev.combo, streak: ev.streak, beat: ev.beat, collected: ev.collected });
  if (ev.fire) { const c = boxCenter(ev.fire.box); rings.push({ t: clock, big: false, at: c }); flash = 0.25; P.sound('combo3', 0.7); shake = Math.max(shake, 8); }
  // 同色的块化成光点飞到宠物身上
  ev.sparks.forEach((sp) => {
    const n = g.team.findIndex((p) => p.id === sp.id), to = petPos(n);
    sp.cells.slice(0, 9).forEach((k, j) => flyers.push({ what: 'spark', pet: sp.id, col: C.blockColors[PG.PETS[sp.id].color][1], x: cellX(k % 9) + L.cell / 2, y: cellY(Math.floor(k / 9)) + L.cell / 2, t: clock + 0.05 + j * 0.03, to }));
  });
  if (ev.lit) { ev.lit.forEach((k, j) => setTimeout(() => P.sound('chain' + Math.min(12, g.evLit.size - ev.lit.length + j + 1), 0.6), j * 80)); }
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
    // 啃的顺序：一排就从头到尾，一个大格就蛇形走
    let cells = act.cells.slice();
    if (act.kind === 'box') cells.sort((x, y) => { const rx = Math.floor(x / 9), ry = Math.floor(y / 9); return rx !== ry ? rx - ry : (rx % 2 ? (y % 9) - (x % 9) : (x % 9) - (y % 9)); });
    else cells.sort((x, y) => x - y);
    (ev.rocks || []).forEach((k) => { if (!cells.includes(k)) cells.push(k); });
    let pts = cells.map((k) => ({ x: cellX(k % 9) + L.cell / 2, y: cellY(Math.floor(k / 9)) + L.cell / 2 }));
    if (act.kind === 'gift') {
      const slot = g.hand.findIndex((x) => x && x.special === 'fire');
      pts = [slotCenter(Math.max(0, slot))];
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
      ghosts.push({ k, t: bite, appear: inkCells.has(k) ? reach : 0, ci: colorsBefore[k] === undefined ? 0 : colorsBefore[k], ink: inkCells.has(k), rock: g.board[k] === 0 && (ev.rocks || []).includes(k) });
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
    if (clock >= gh.t) { clearing.push({ k: gh.k, t: clock }); return false; }
    const x = cellX(gh.k % 9), y = cellY(Math.floor(gh.k / 9));
    if (gh.appear && clock < gh.appear) return true; // 蚕还没爬到：这格还空着
    if (gh.rock) ironRock(x, y, L.cell);
    else if (gh.ink) { ctx.fillStyle = '#efe8d8'; ctx.fillRect(x + 4, y + 4, L.cell - 8, L.cell - 8); ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; for (let q = 1; q < 4; q++) { ctx.beginPath(); ctx.moveTo(x + 4, y + 4 + q * (L.cell - 8) / 4); ctx.lineTo(x + L.cell - 4, y + 4 + q * (L.cell - 8) / 4); ctx.stroke(); } }
    else block(x, y, L.cell, 1, gh.ci);
    return true;
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
function endPet() {
  const st = g.stage;
  const r = { won: g.won, reason: g.reason, near: g.nearMiss(), caught: g.caught, gift: null, evolved: null, dan: 0, exp: [] };
  const petReplay = !st.evolve && petIdx < save.petStage; // 这关以前过过
  // 出战的宠物涨经验：每出手一次 +1，过关 +3（没过 +1）。加场借来的宠物不算
  if (!st.evolve && !st.bonus) g.team.forEach((pt) => {
    const rec = save.pets[pt.id];
    if (!rec) return;
    const before = { lv: rec.lv, exp: rec.exp };
    // 出手经验最多算 5 次；已经过了的关重打，经验减半（免得刷最容易的关练级）
    let gain = Math.min(5, g.petActsTotal[pt.id] || 0) + (g.won ? 3 : 1);
    if (petReplay) gain = Math.max(1, Math.floor(gain / 2));
    addExp(rec, gain);
    r.exp.push({ id: pt.id, before, after: { lv: rec.lv, exp: rec.exp }, gain });
  });
  save.gourd += g.caught; // 抓到的怪收进葫芦（输了也收）
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
    // 过关送一颗丹：拿到宠物以后、第一次过这关才送
    if (save.petOrder.length && !petReplay) { save.dan += 1; r.dan = 1; }
  }
  coinsGot = Math.floor(g.score * C.coinPerScore) + (g.won ? C.coinStageWin : 0);
  save.coins += coinsGot;
  persist();
  result = r;
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
  ctx.fillStyle = COL.ink; rr(px, py + 6, pw, ph, 18); ctx.fill();
  ctx.fillStyle = COL.wood; rr(px, py, pw, ph, 18); ctx.fill();
  ctx.strokeStyle = COL.brass; ctx.lineWidth = 3; rr(px + 6, py + 6, pw - 12, ph - 12, 14); ctx.stroke();
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
    text('+' + e.gain + ' 经验', px + pw - 24, y + 6, 14, COL.jade, 'right');
    const bw = pw - 110;
    ctx.fillStyle = COL.ink; rr(px + 70, y + 20, bw, 10, 5); ctx.fill();
    ctx.fillStyle = COL.jade; rr(px + 70, y + 20, Math.max(6, bw * frac), 10, 5); ctx.fill();
    if (k >= 1 && e.after.lv > e.before.lv) text('升到 ' + e.after.lv + ' 级！', px + 70 + bw / 2, y + 25, 12, COL.brassLight);
    else text((k < 1 ? e.before.exp : e.after.exp) + ' / ' + EXP_NEED[lvNow], px + 70 + bw / 2, y + 25, 10, COL.text);
    y += 42;
  });
  // 抓到的怪收进葫芦
  if (r.caught) {
    const msg = '收进葫芦 ' + r.caught + ' 只墨怪' + (r.dan ? ' · 送 1 颗丹' : '');
    ctx.font = 'normal 15px "PingFang SC", sans-serif';
    const tw = ctx.measureText(msg).width;
    gourdIcon(W / 2 - tw / 2 - 4, y + 12, 18);
    text(msg, W / 2 + 12, y + 12, 15, COL.text, 'center', 'normal'); y += 34;
  }
  else if (r.dan) { text('送 1 颗丹', W / 2, y + 12, 15, COL.text, 'center', 'normal'); y += 34; }
  const bw = pw - 48, bx = px + 24, by = py + ph - 128;
  const canFeed = save.petOrder.length && (save.gourd > 0 || save.dan > 0);
  if (r.won) {
    const next = petIdx + 1 < PLV.length;
    const nextNeedsLv = next && PLV[petIdx + 1].evolveLevel && (!save.pets[PLV[petIdx + 1].evolveLevel] || save.pets[PLV[petIdx + 1].evolveLevel].lv < PG.PETS[PLV[petIdx + 1].evolveLevel].evoLv) && !save.pets[PG.PETS[PLV[petIdx + 1].evolveLevel].evo];
    if (canFeed && (nextNeedsLv || petIdx === 4)) {
      button('tocamp', bx, by, bw, 58, '去营地炼丹、喂宠物', { size: 21, bg: '#3f9a7c', fn: () => openCamp() });
      button('next', bx, by + 70, bw * 0.6 - 6, 44, next ? '下一关' : '地图', { size: 17, bg: COL.copper, fn: () => (next ? newPetLevel(petIdx + 1) : (mode = 'map')) });
    } else {
      button('next', bx, by, bw, 58, next ? '下一关' : '回地图', { size: 24, fn: () => (next ? newPetLevel(petIdx + 1) : (mode = 'map')) });
      button('tocamp', bx, by + 70, bw * 0.6 - 6, 44, '营地', { size: 17, bg: '#3f9a7c', fn: () => openCamp() });
    }
    button('tomap', bx + bw * 0.6 + 6, by + 70, bw * 0.4 - 6, 44, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
  } else {
    button('again', bx, by, bw, 58, '再试一次', { size: 24, fn: () => (g.stage.evolve ? newEvolution(g.stage.evolve.pet, petIdx) : newPetLevel(petIdx)) });
    if (g.adsUsed < C.adMax) {
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
function drawCamp() {
  drawBg();
  // 草棚：一个三角顶 + 两根柱子（占位，等正式图）
  ctx.fillStyle = '#3a2a1c'; ctx.beginPath(); ctx.moveTo(W / 2 - 150, L.top + 120); ctx.lineTo(W / 2, L.top + 50); ctx.lineTo(W / 2 + 150, L.top + 120); ctx.fill();
  ctx.fillStyle = '#5a4630'; ctx.fillRect(W / 2 - 130, L.top + 120, 10, 70); ctx.fillRect(W / 2 + 120, L.top + 120, 10, 70);
  text('营地', W / 2, L.top + 22, 26, COL.brassLight);
  button('campBack', 10, L.top + 4, 92, 36, campFrom === 'home' ? '‹ 主菜单' : '‹ 地图', { size: 15, bg: COL.wood, fn: () => { mode = campFrom; } });
  text((brewing ? save.dan - brewing.n : save.dan) + ' 颗丹', W - 16, L.top + 22, 17, COL.brassLight, 'right');
  // 葫芦 + 炼丹
  const gx = W / 2, gy = L.top + 160;
  const shake2 = brewing ? Math.sin(clock * 30) * 3 : 0;
  gourdIcon(gx + shake2, gy, 46);
  if (brewing) {
    for (let n = 0; n < 4; n++) { const a = (clock * 0.8 + n / 4) % 1; ctx.globalAlpha = 1 - a; ctx.fillStyle = COL.steam; ctx.beginPath(); ctx.arc(gx + Math.sin(n * 2 + clock) * 10, gy - 50 - a * 40, 8 + a * 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    text('炼丹中… ' + Math.max(0, Math.ceil(brewing.until - clock)), gx, gy + 60, 17, COL.text);
    if (clock >= brewing.until) { petMsg = { text: '炼好了！得到 ' + brewing.n + ' 颗丹', t: clock }; P.sound('win', 0.6); brewing = null; }
  } else {
    text('葫芦里 ' + save.gourd + ' 只墨怪', gx, gy + 52, 16, COL.text, 'center', 'normal');
    if (save.gourd > 0) button('brew', gx - 80, gy + 70, 160, 46, '炼丹', { size: 20, bg: COL.red, fn: () => { brewing = { until: clock + 3, n: save.gourd }; save.dan += save.gourd; save.gourd = 0; persist(); P.sound('select', 0.6); } }); // 丹当场进存档，3 秒只是演动画（中途退出也不会丢）
  }
  // 宠物卡
  let y = gy + 136;
  if (!save.petOrder.length) text('还没有宠物：打过第 3 关就有', W / 2, y + 20, 16, COL.dim, 'center', 'normal');
  save.petOrder.forEach((id, n) => {
    const rec = save.pets[id], d = PG.PETS[id];
    const cy = y + n * 100, cx = 20, cw = W - 40;
    const active = save.activePet === id || (!save.activePet && n === 0);
    ctx.fillStyle = COL.ink; rr(cx, cy + 4, cw, 92, 12); ctx.fill();
    ctx.fillStyle = COL.wood; rr(cx, cy, cw, 92, 12); ctx.fill();
    if (active) { ctx.strokeStyle = COL.jade; ctx.lineWidth = 3; rr(cx + 2, cy + 2, cw - 4, 88, 11); ctx.stroke(); }
    petIcon(id, cx + 42, cy + 36, 50, 0, petFx.pop[id] ? Math.max(0, 0.3 - (clock - petFx.pop[id])) / 0.3 : 0);
    text(d.name + '  ' + rec.lv + ' 级', cx + 80, cy + 22, 18, COL.text, 'left');
    // 只写本事；攒法缩成名字旁边一个小标签
    const line2 = PG.petDesc(id, rec.lv);
    let fs = 14; ctx.font = 'bold ' + fs + 'px "PingFang SC", sans-serif';
    while (fs > 10 && ctx.measureText(line2).width > cw - 196) { fs--; ctx.font = 'bold ' + fs + 'px "PingFang SC", sans-serif'; }
    text(line2, cx + 80, cy + 44, fs, COL.brassLight, 'left');
    // 攒法小标签放在头像底下
    const tag = PG.CHARGE_TAG[d.charge];
    ctx.fillStyle = COL.woodDark; rr(cx + 8, cy + 72, 68, 16, 8); ctx.fill();
    text('⚡' + tag, cx + 42, cy + 80, 10, COL.dim, 'center', 'normal');
    // 经验条：写着现在几点、要几点升级；能进化的写「可以进化了」
    const need = EXP_NEED[rec.lv] || 999, bw = cw - 200;
    ctx.fillStyle = COL.ink; rr(cx + 80, cy + 58, bw, 12, 6); ctx.fill();
    ctx.fillStyle = COL.jade; rr(cx + 80, cy + 58, Math.max(6, bw * Math.min(1, rec.exp / need)), 12, 6); ctx.fill();
    text(d.evo && rec.lv >= d.evoLv ? '可以进化了！' : '经验 ' + rec.exp + ' / ' + need + (d.evo ? '　' + d.evoLv + ' 级进化' : ''), cx + 80 + bw / 2, cy + 64, 10, COL.text);
    const canEvolve = d.evo && rec.lv >= d.evoLv;
    if (canEvolve) {
      ctx.strokeStyle = 'rgba(243,210,122,' + (0.5 + Math.sin(clock * 6) * 0.4) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx + 42, cy + 41, 32, 0, Math.PI * 2); ctx.stroke();
      button('evolve' + n, cx + cw - 104, cy + 10, 92, 40, '进化', { size: 19, bg: COL.red, fn: () => newEvolution(id) });
    } else {
      button('feed' + n, cx + cw - 104, cy + 10, 92, 40, '喂一颗', { size: 17, bg: save.dan > 0 ? COL.brass : COL.woodDark, fg: save.dan > 0 ? COL.text : COL.dim, fn: () => feedPet(id) });
    }
    // 出战：只能带一只，选好了就一直带它
    if (active) text('出战中', cx + cw - 58, cy + 70, 14, COL.jade);
    else button('pick' + n, cx + cw - 104, cy + 56, 92, 30, '让它出战', { size: 13, bg: '#3f9a7c', fn: () => { save.activePet = id; persist(); petFx.pop[id] = clock; P.sound('select', 0.6); petMsg = { text: PG.PETS[id].name + ' 出战！下一关就带它', t: clock }; } });
  });
  if (petMsg && clock - petMsg.t < 2.6) {
    ctx.font = 'bold 15px "PingFang SC", sans-serif';
    const tw = Math.min(W - 16, ctx.measureText(petMsg.text).width + 28);
    ctx.fillStyle = COL.steam; rr((W - tw) / 2, H - 120, tw, 40, 10); ctx.fill();
    ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(petMsg.text, W / 2, H - 99, W - 36);
  }
  const bw = Math.min(W - 60, 300);
  const cur = Math.min(save.petStage, PLV.length - 1);
  button('campPlay', (W - bw) / 2, H - 72, bw, 54, '去闯' + petLevelName(cur).replace(' · 进化', ''), { size: 20, fn: () => newPetLevel(cur) });
}
function addExp(rec, n) {
  rec.exp += n;
  let up = 0;
  while (rec.lv < 10 && rec.exp >= EXP_NEED[rec.lv]) { rec.exp -= EXP_NEED[rec.lv]; rec.lv++; up++; }
  return up;
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
  ctx.fillStyle = COL.ink; rr(px, py + 6, pw, ph, 18); ctx.fill();
  ctx.fillStyle = COL.wood; rr(px, py, pw, ph, 18); ctx.fill();
  ctx.strokeStyle = COL.brass; ctx.lineWidth = 3; rr(px + 6, py + 6, pw - 12, ph - 12, 14); ctx.stroke();
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
    drawMap();
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
P.exposeForTest('__game', {
  get g() { return g; }, get mode() { return mode; }, set mode(v) { mode = v; }, get result() { return result; }, get save() { return save; },
  get paintIdx() { return paintIdx; }, stats, L, fingerFor, slotCenter, buttons: () => buttons.slice(),
  get stageIdx() { return stageIdx; }, get chipPos() { return chipPos; }, LV, newStage, SG, newSiege, newDaily, dailyLeft: () => dailyLeft(), siegeBusy: () => siegeBusy(),
  PG, PLV, newPetLevel, newEvolution, openCamp, feedPet, get petIdx() { return petIdx; },
  reset() { save = freshSave(); persist(); newStage(0); },
  setSave(o) { Object.assign(save, o); persist(); },
  get cutPlaying() { return CUT.playing; }, get CUT() { return CUT; }, playCuts, skipCuts() { while (mode === 'cut') { CUT.skip(); if (!CUT.playing) endCuts(); } },
  newGame, endGame, core,
});
