// 洛书九宫 原型 0.3：旅程地图 + 15 关（照 Woodoku 旅程）、经典 3 分钟拼画、拖块、特效、结算、画册。规则全在 core.js，关卡在 levels.js。
const P = require('./platform.js');
const C = require('./config.js');
const core = require('./core.js');
const CELL = core.CELL;
const art = require('./art.js');
const PG = require('./petgame.js');
const PLV = require('./petlevels.js');
const EC = require('./economy.js'); // 段 2：丹的算术全在这里（槽、结算、升级价、老存档换算）
const FLOW = require('./flow.js'); // 段 3 规则 2：过关以后走哪几步（结算 → 过章 → 新宠物出场 → 教换宠物 → 下一关）
const LY = require('./layout.js');
const T = require('./telemetry.js'); // 全流程试玩记录（0.9.12）
const VERSION = '0.9.24'; // 0.9.1 游戏修改器的布局表：能拖的元素在哪

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
    items: {}, tutorialDone: false, plays: 0, // 段 2：金币、分数、最高分、局外单格删了
    stage: 0, introSeen: {}, // 旅程：已经过了几关、哪些说明卡看过
    siegeDone: false, siegeBest: 0, // 守城：第一局（教学）打过没有、最多守住几波
    daily: null, // 每日一城：{ date, tries, extra, best, bestHit }
    // 0.5 九宫消 + 宠物：宠物章节过到第几关、有哪些宠物（等级、这一级喂了几颗丹）、出战顺序、丹袋里几颗丹
    // 段 2：slots = 每关最好亮过几个丹槽、从槽里拿走了几颗 { [关]: { s, got } }；econ = 照段 2 换算过（新存档不用换算）
    petStage: 0, pets: {}, petOrder: [], dan: 0, slots: {}, econ: EC.ECON_VER, petSeen: {}, petTutDone: false,
    cutSeen: {}, // 0.6.1 过场：哪些看过（看过的第二次起播短版；「重新开始」也不清）
    siegeRuns: 0, relicSeen: {}, relicGot: {}, // 守城玩过几局；哪些机关见过发动、拿到过（第一次发动打一句说明、卡上标「新」）
  };
}
const loadedSave = P.load(KEY); // 段 2：换算老存档之前原样留一份（见 fixSave）
let save = Object.assign(freshSave(), P.load(KEY) || {});
if (loadedSave && !(loadedSave.econ >= EC.ECON_VER)) delete save.econ; // 老存档：不能让 freshSave 的「换算过了」盖上去
if (!save.introSeen) save.introSeen = {};
if (!save.relicSeen) save.relicSeen = {};
if (!save.relicGot) save.relicGot = {};
if (!save.pets) save.pets = {};
if (!save.petOrder) save.petOrder = [];
if (!save.petSeen) save.petSeen = {};
const persist = () => P.save(KEY, save);

// ---------- 画布和布局 ----------
const scr = P.setup(onTouch);
T.rec('o', VERSION, Math.round(scr.width), Math.round(scr.height), Math.round(Date.now() / 1000)); // 试玩记录：开游戏
let ctx = scr.ctx; // let：过场要借现成的画法（petIcon、inkMonster）画到离屏画布上，见 withCtx
const { width: W, height: H, dpr } = scr;
function withCtx(c2, fn) { const keep = ctx; ctx = c2; try { fn(); } finally { ctx = keep; } }
const L = {};
// 微信右上角的胶囊按钮（「···」和关闭）永远盖在最上面。地图页的设置齿轮和「›」、宠物园的丹数原来正好在它底下（看不见、点了是关游戏）：
// 这两页的顶栏整体让到胶囊下面（0.9.14 debug）。关里顶上右边本来就空着，不用动；网页里没有胶囊，也不动
const CAP = scr.capsule || null;
const uiTop = () => (CAP ? Math.max(L.top, Math.round(CAP.bottom) + 6) : L.top);
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
  L.mini = Math.max(16, Math.round(L.cell * 0.56)); // 底下三块的格子大小（0.9.17 学 Woodoku：托盘里画小，拿起来变成盘上格子那么大）
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
let startCard = null; // 进关前的关卡卡片：{ t, i, next }
function playCuts() {
  if (!CUT.pending || mode === 'cut') return;
  cutPrev = mode; mode = 'cut'; CUT.start();
}
function endCuts() { mode = cutPrev; if (mode === 'over') overAt = clock; // 回到结算页：「过关！」和经验条从头演
  if (entranceShown.length) { entranceShown.forEach((id) => { save.petSeen[id] = true; }); entranceShown = []; persist(); } // 段 3 规则 2：新宠物出场演完才擦「还没看过出场」
}
let entranceShown = []; // 这一串过场里演了哪几只新宠物的出场
// 段 3 规则 2：开机、进章页时，有到手了还没看过出场的（中途关掉游戏、老存档补发的），一次补演一只
function catchUpEntrance() {
  if (mode !== 'map' || CUT.playing || CUT.pending) return;
  const id = (save.petOrder || []).find((x) => save.petSeen[x] === false);
  if (!id) return;
  CUT.petIntro(id); entranceShown.push(id); playCuts();
}
let result = null; // 结算信息
let drag = null; // { slot, x, y, id }
let downBtn = null, downTouch = null; // 按着的按钮、是哪根手指按的
let buttons = [];
let t0 = P.now();
let last = t0;
let clock = 0; // 秒，画面用
let stopUntil = 0; // 顿帧
let shake = 0;
let fx = []; // 特效粒子
let texts = []; // 跳字
let clearing = []; // 正在碎掉的块 { k, t }
let handSeen = [null, null, null, null], handAt = [0, 0, 0, 0]; // 托盘每格上次画的是哪块、什么时候换上的（滑上来的动画）
let enterAt = -9; // 进关：盘面上的东西从左上到右下一格格弹出来
let monIn = {}; // 墨怪冒出来的时刻（下一波、分身）：从上面掉下来、压扁一下站住
let transAt = -9; // 换页面的时刻：0.3 秒淡入
let popping = []; // 刚放下的块 { k, t }
let litAnim = []; // 城区点亮 { b, t }
let bolts = []; // 连弩 { row, t }
let rings = []; // 洛书光阵 { t, big }
let flash = 0;
let displayScore = 0;
let lastTouchMs = 0; // 0.9.17 冲锋关：犹豫 2 秒，能塞的那个空闪一下
const monSlide = {}; // 0.9.17 墨怪爬：{ 到哪格: { from, t } }，画的时候从原来那格滑过去
const cellIn = {}; // 0.9.17 冲锋关补进来的格子：{ 格: 开始弹出的时间 }
let lastTick = -1;
let ad = null; // { until, done }
let tutorialT = 0;
let mofei = { jump: 0, say: '', sayT: 0 };
let stageIdx = -1; // 旅程第几关（0 起）；-1 = 经典拼画
let flyers = []; // 收走的宝石 / 匣 / 泡泡飞向顶上的计数 { what, x, y, t }
let chipPos = {}; // 顶上每个计数的位置（每帧画的时候记下）
let chipPop = {}; // 计数收到东西时弹一下
let introKind = null; // 正在看的说明卡

function startCommon() {
  setLayout(g && g.siege ? 'siege' : g && g.pets && g.team.length ? 'pets' : 'normal'); // 没带宠物的关不留宠物栏
  g.seedColor = save.plays % 7;
  colorAt.fill(0);
  save.plays++;
  persist();
  mode = 'play';
  introKind = null; flyers = []; chipPop = {};
  result = null; drag = null; fx = []; texts = []; clearing = []; popping = []; litAnim = []; bolts = []; rings = [];
  displayScore = 0; flash = 0; lastTick = -1; tutorialT = 0;
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
// ---------- 0.9.20 全游戏一个字都不用（Cc 11-27：「你看 Journey 上面有任何一个字吗？游戏引导不用任何一个字啊」）----------
// 总闸：画面上所有带汉字的字一律不画（数字、×、✓ 这类符号照画）。只有给试玩朋友用的工具（发记录、复制、隐私指引、截屏页）留着字，
// 上线时这些工具会收起来。字原来带的意思，每一处都换成了图标、表情或小动画（按钮见 BTN_ICON，别的在各自的画面里）
const HAS_WORDS = /[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff01-\uff5e]/;
let allowWords = false;
const TOOL_IDS = new Set(['setTester', 'setSendLog', 'setCopyLog', 'setPrivacy', 'overSendLog', 'overCopyLog', 'lpPrev', 'lpNext', 'lpClose']);
const wordsOff = () => !allowWords && mode !== 'logpages';
function textW(...a) { const was = allowWords; allowWords = true; text(...a); allowWords = was; } // 不管「不用字」开关都要写出来的字：游戏名、版本号
function text(s, x, y, size, col, align, weight, stroke) {
  if (wordsOff() && HAS_WORDS.test(String(s))) return;
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
// 按钮上的图标（0.9.20 全游戏不用字）：哪个按钮画什么
function btnIcon(id) {
  if (id === 'setSound') return save.muted ? 'soundOff' : 'sound';
  if (id === 'setVibe') return save.noVibrate ? 'vibeOff' : 'vibe';
  return BTN_ICON[id] || 'play';
}
const BTN_ICON = { tomap: 'map', again: 'retry', revive: 'tvClear', play: 'play', map: 'map', settings: 'gear', lend: 'petPlus', introOk: 'play', home: 'home', double: 'x2', album: 'picture', album2: 'picture', album3: 'picture', tocamp: 'pet', toGarden: 'pet', startGo: 'play', single: 'play', shareClose: 'x', share: 'share', setVibe: 'vibe', setSound: 'sound', setReset: 'reset', setBack: 'back', reroll: 'tvSwap', next: 'play', homePlay: 'play', feedG: 'feed', evolveG: 'evolve', endless: 'play', dailyAd: 'tv', cont: 'play', classic: 'play', chPrev: 'prev', chNext: 'next', chGarden: 'pet', campPlay: 'play', campBack: 'back', camp: 'pet', back: 'back' };
// 代码画的图标（cx, cy 中心，s 大小，col 颜色）
function drawIcon(name, cx, cy, s, col) {
  ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, s * 0.12); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tri = (dir) => { ctx.beginPath(); ctx.moveTo(-s * 0.28 * dir, -s * 0.36); ctx.lineTo(s * 0.38 * dir, 0); ctx.lineTo(-s * 0.28 * dir, s * 0.36); ctx.closePath(); ctx.fill(); };
  const chev = (dir) => { ctx.beginPath(); ctx.moveTo(s * 0.12 * dir, -s * 0.34); ctx.lineTo(-s * 0.2 * dir, 0); ctx.lineTo(s * 0.12 * dir, s * 0.34); ctx.stroke(); };
  const tv = () => { ctx.fillStyle = COL.red; rr(-s * 0.42, -s * 0.3, s * 0.84, s * 0.6, s * 0.1); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.16); ctx.lineTo(s * 0.18, 0); ctx.lineTo(-s * 0.1, s * 0.16); ctx.fill(); };
  if (name === 'play' || name === 'next') tri(1);
  else if (name === 'back' || name === 'prev') chev(1);
  else if (name === 'retry') { ctx.beginPath(); ctx.arc(0, 0, s * 0.3, -Math.PI * 0.3, Math.PI * 1.45); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s * 0.32, -s * 0.38); ctx.lineTo(s * 0.3, -s * 0.06); ctx.lineTo(s * 0.02, -s * 0.16); ctx.fill(); }
  else if (name === 'map') { ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.28); ctx.lineTo(-s * 0.13, -s * 0.36); ctx.lineTo(s * 0.13, -s * 0.28); ctx.lineTo(s * 0.4, -s * 0.36); ctx.lineTo(s * 0.4, s * 0.28); ctx.lineTo(s * 0.13, s * 0.36); ctx.lineTo(-s * 0.13, s * 0.28); ctx.lineTo(-s * 0.4, s * 0.36); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * 0.13, -s * 0.36); ctx.lineTo(-s * 0.13, s * 0.28); ctx.moveTo(s * 0.13, -s * 0.28); ctx.lineTo(s * 0.13, s * 0.36); ctx.stroke(); }
  else if (name === 'home') { ctx.beginPath(); ctx.moveTo(-s * 0.38, 0); ctx.lineTo(0, -s * 0.36); ctx.lineTo(s * 0.38, 0); ctx.stroke(); ctx.strokeRect(-s * 0.24, -s * 0.04, s * 0.48, s * 0.38); }
  else if (name === 'gear') { ctx.restore(); gearIcon(cx, cy, s * 0.26, clock * 0.4, col); return; }
  else if (name === 'tv') tv();
  else if (name === 'tvClear') { ctx.translate(-s * 0.32, 0); tv(); ctx.translate(s * 0.72, 0); ctx.strokeStyle = col; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) ctx.strokeRect(-s * 0.2 + (i % 2) * s * 0.12, -s * 0.24 + i * s * 0.12, s * 0.22, s * 0.22); }
  else if (name === 'tvSwap') { ctx.translate(-s * 0.3, 0); tv(); ctx.translate(s * 0.68, 0); ctx.beginPath(); ctx.arc(0, 0, s * 0.2, -Math.PI * 0.3, Math.PI * 1.4); ctx.stroke(); }
  else if (name === 'pet' || name === 'petPlus') { ctx.restore(); const id = (name === 'pet' ? save.activePet : null) || save.activePet || 'tongque'; if (PG.PETS[id]) petIcon(id, cx - (name === 'petPlus' ? s * 0.18 : 0), cy, s * 0.9, 0, 0); if (name === 'petPlus') { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + s * 0.3, cy - s * 0.16); ctx.lineTo(cx + s * 0.3, cy + s * 0.16); ctx.moveTo(cx + s * 0.14, cy); ctx.lineTo(cx + s * 0.46, cy); ctx.stroke(); ctx.restore(); } return; }
  else if (name === 'feed') { ctx.restore(); danOrb(cx - s * 0.12, cy + s * 0.04, s * 0.2); ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + s * 0.24, cy + s * 0.22); ctx.lineTo(cx + s * 0.24, cy - s * 0.22); ctx.moveTo(cx + s * 0.12, cy - s * 0.08); ctx.lineTo(cx + s * 0.24, cy - s * 0.22); ctx.lineTo(cx + s * 0.36, cy - s * 0.08); ctx.stroke(); ctx.restore(); return; }
  else if (name === 'evolve') { for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-s * 0.04, -s * 0.38, s * 0.08, s * 0.76); } }
  else if (name === 'sound' || name === 'soundOff') { ctx.beginPath(); ctx.moveTo(-s * 0.36, -s * 0.12); ctx.lineTo(-s * 0.2, -s * 0.12); ctx.lineTo(0, -s * 0.32); ctx.lineTo(0, s * 0.32); ctx.lineTo(-s * 0.2, s * 0.12); ctx.lineTo(-s * 0.36, s * 0.12); ctx.closePath(); ctx.fill(); if (name === 'sound') { ctx.beginPath(); ctx.arc(s * 0.04, 0, s * 0.18, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(s * 0.04, 0, s * 0.32, -0.9, 0.9); ctx.stroke(); } else { ctx.beginPath(); ctx.moveTo(s * 0.12, -s * 0.14); ctx.lineTo(s * 0.38, s * 0.14); ctx.moveTo(s * 0.38, -s * 0.14); ctx.lineTo(s * 0.12, s * 0.14); ctx.stroke(); } }
  else if (name === 'vibe' || name === 'vibeOff') { ctx.strokeRect(-s * 0.13, -s * 0.3, s * 0.26, s * 0.6); if (name === 'vibe') { [-1, 1].forEach((d) => { ctx.beginPath(); ctx.moveTo(d * s * 0.24, -s * 0.2); ctx.lineTo(d * s * 0.32, -s * 0.07); ctx.lineTo(d * s * 0.24, s * 0.07); ctx.lineTo(d * s * 0.32, s * 0.2); ctx.stroke(); }); } else { ctx.beginPath(); ctx.moveTo(-s * 0.36, -s * 0.36); ctx.lineTo(s * 0.36, s * 0.36); ctx.stroke(); } }
  else if (name === 'reset') { ctx.beginPath(); ctx.arc(0, 0, s * 0.3, Math.PI * 0.2, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.38); ctx.lineTo(s * 0.32, -s * 0.06); ctx.lineTo(s * 0.02, -s * 0.12); ctx.fill(); ctx.fillRect(-s * 0.05, -s * 0.14, s * 0.1, s * 0.28); }
  else if (name === 'x') { ctx.beginPath(); ctx.moveTo(-s * 0.26, -s * 0.26); ctx.lineTo(s * 0.26, s * 0.26); ctx.moveTo(s * 0.26, -s * 0.26); ctx.lineTo(-s * 0.26, s * 0.26); ctx.stroke(); }
  else if (name === 'share') { ctx.beginPath(); ctx.moveTo(0, s * 0.1); ctx.lineTo(0, -s * 0.34); ctx.moveTo(-s * 0.16, -s * 0.18); ctx.lineTo(0, -s * 0.34); ctx.lineTo(s * 0.16, -s * 0.18); ctx.stroke(); ctx.strokeRect(-s * 0.3, -s * 0.06, s * 0.6, s * 0.4); }
  else if (name === 'x2') { ctx.restore(); text('×2', cx, cy, Math.round(s * 0.5), col); return; }
  else if (name === 'picture') { ctx.strokeRect(-s * 0.36, -s * 0.28, s * 0.72, s * 0.56); ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.2); ctx.lineTo(-s * 0.08, -s * 0.05); ctx.lineTo(s * 0.08, s * 0.1); ctx.lineTo(s * 0.18, 0); ctx.lineTo(s * 0.3, s * 0.2); ctx.stroke(); }
  else tri(1);
  ctx.restore();
}
function button(id, x, y, w, h, label, opt) {
  const o = opt || {};
  const iconOnly = wordsOff() && HAS_WORDS.test(String(label)) && !TOOL_IDS.has(id);
  if (TOOL_IDS.has(id)) allowWords = true;
  const kind = o.kind || (String(label).startsWith('‹') ? 'link' : o.bg ? 'sub' : 'main');
  const pressed = downBtn === id;
  ctx.save();
  if (pressed) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.97, 0.97); ctx.translate(-x - w / 2, -y - h / 2); }
  const r = Math.min(TH.rBtn, h / 2);
  if (kind === 'main') {
    ctx.fillStyle = TH.brassEdge; rr(x, y + 3, w, h, r); ctx.fill();
    ctx.fillStyle = o.danger ? TH.red : TH.brass; rr(x, y, w, h, r); ctx.fill();
    if (iconOnly) drawIcon(btnIcon(id), x + w / 2, y + h / 2 + 1, Math.min(h * 0.72, 40), o.danger ? COL.text : TH.onBrass); else text(label, x + w / 2, y + h / 2 + 1, o.size || 20, o.danger ? COL.text : TH.onBrass);
  } else if (kind === 'sub') {
    ctx.fillStyle = TH.card; rr(x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = o.hot ? TH.brass : o.danger ? TH.red : TH.line; ctx.lineWidth = o.hot || o.danger ? 2 : 1; rr(x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
    if (iconOnly) drawIcon(btnIcon(id), x + w / 2, y + h / 2 + 1, Math.min(h * 0.72, 40), o.danger ? '#f08a70' : o.fg || COL.text); else text(label, x + w / 2, y + h / 2 + 1, Math.min(o.size || 16, 20), o.danger ? '#f08a70' : o.fg || COL.text);
  } else {
    if (iconOnly) drawIcon(btnIcon(id) === 'play' ? 'back' : btnIcon(id), x + Math.min(w, h) / 2 + 4, y + h / 2, Math.min(h * 0.7, 34), COL.dim); else text(label, x + (String(label).startsWith('‹') ? 4 : w / 2), y + h / 2, 16, COL.dim, String(label).startsWith('‹') ? 'left' : 'center');
  }
  allowWords = false;
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
  if (key === 'lines') { const q = s / 3.4; for (let n = 0; n < 4; n++) block(x - s * 0.2 + n * q, y + s * 0.32, q, 1, n === 3 ? -1 : 2); ctx.strokeStyle = COL.brassLight; ctx.lineWidth = 2; ctx.strokeRect(x - s * 0.2 - 1, y + s * 0.32 - 1, q * 4 + 2, q + 2); return; } // 「消掉几排」：一排小方块
  if (key === 'box') chest(x, y, s);
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
  if (t === 'sticky') { // 0.9.20 粘墨怪：一团土黄色的泥，身上往下滴泥
    blob(cx, cy, r, '#3a2412', '#c08a4a', '#7a5228');
    ctx.fillStyle = '#7a5228'; for (let n = 0; n < 3; n++) { const dy = ((clock * 0.8 + n * 0.33) % 1) * r * 0.6; ctx.beginPath(); ctx.arc(cx - r * 0.5 + n * r * 0.5, cy + r * 0.8 + dy, r * 0.1 * (1 - dy / (r * 0.6)), 0, Math.PI * 2); ctx.fill(); }
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
  if (kind === 'mud') { // 0.9.20 泥沼怪：身上糊着泥、脚下一滩泥
    ctx.fillStyle = 'rgba(122,82,40,0.75)'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.95, r * 1.05, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a5228'; [[-0.5, -0.3, 0.22], [0.45, -0.1, 0.18], [-0.1, 0.4, 0.2]].forEach(([a, b, rr2]) => { ctx.beginPath(); ctx.arc(cx + a * r, cy + b * r, rr2 * r, 0, Math.PI * 2); ctx.fill(); });
    return;
  }
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
// 金属（0.9.17，第一章的五行东西）：一块铆着钉子的金色铜板；铜雀的技能块在手上时一闪一闪描金边（告诉玩家「拿它啄这个」）
// 0.9.21 冲锋关垫满盘面的「铜砖」：暗铜色、四颗铆钉，不是五行色，一看就不是玩家放的（Cc 11-27：「专门换另外一种填满了也不会消的特殊色块」）
function rushBrick(x, y, s) {
  const r = Math.max(3, s * 0.14);
  ctx.fillStyle = '#4a3b26'; rr(x + 1, y + 1, s - 2, s - 2, r); ctx.fill();
  ctx.fillStyle = '#6e5833'; rr(x + 3, y + 3, s - 6, (s - 6) * 0.5, r * 0.7); ctx.fill();
  ctx.strokeStyle = '#1E1A16'; ctx.lineWidth = 2; rr(x + 1, y + 1, s - 2, s - 2, r); ctx.stroke();
  ctx.fillStyle = '#9C7F42'; [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(x + s * a, y + s * b, Math.max(1.2, s * 0.05), 0, Math.PI * 2); ctx.fill(); });
}
function metalPlate(x, y, s, k) {
  // 凹进去的深色底 + 一块金锭（梯形）：和放下的金色方块一眼分得开（方块是满格的方糖，金属是坐在坑里的锭子）
  ctx.fillStyle = '#1a1206'; rr(x + 1, y + 1, s - 2, s - 2, 4); ctx.fill();
  ctx.strokeStyle = '#6a4e1c'; ctx.lineWidth = 2; rr(x + 2, y + 2, s - 4, s - 4, 4); ctx.stroke();
  const t = y + s * 0.3, b = y + s * 0.74, l = x + s * 0.14, r = x + s * 0.86, inset = s * 0.14;
  ctx.fillStyle = '#7a5410'; ctx.beginPath(); ctx.moveTo(l, b); ctx.lineTo(r, b); ctx.lineTo(r - inset, t); ctx.lineTo(l + inset, t); ctx.closePath(); ctx.fill();
  const gr = ctx.createLinearGradient(x, t, x, b); gr.addColorStop(0, '#fff1b0'); gr.addColorStop(0.45, '#f0c24a'); gr.addColorStop(1, '#a8761c');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(l + 2, b - 2); ctx.lineTo(r - 2, b - 2); ctx.lineTo(r - inset - 1, t + 2); ctx.lineTo(l + inset + 1, t + 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(l + inset + 3, t + 4, (r - l - inset * 2) * 0.5, 2);
  const sh = (clock * 0.5 + (k || 0) * 0.13) % 1.6; if (sh < 1) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; const sx = l + (r - l) * sh; ctx.beginPath(); ctx.arc(sx, t + (b - t) * 0.35, s * 0.04 + Math.sin(sh * Math.PI) * s * 0.03, 0, Math.PI * 2); ctx.fill(); }
  const sk = g && g.hand && g.hand[3];
  if (sk && sk.special === 'skill' && PG.PETS[sk.pet] && PG.PETS[sk.pet].color === 0) { ctx.strokeStyle = 'rgba(243,210,122,' + (0.55 + Math.sin(clock * 6) * 0.4) + ')'; ctx.lineWidth = 3; rr(x + 1.5, y + 1.5, s - 3, s - 3, 6); ctx.stroke(); }
}
// 一堆土（0.9.20 第二章）：坑里一座土黄色的小土包，上面几粒石子；爆竹鼠的技能块在手上时一闪一闪描红边（告诉玩家「拿啃过的块炸它」）
function dirtMound(x, y, s, k) {
  ctx.fillStyle = '#1a1206'; rr(x + 1, y + 1, s - 2, s - 2, 4); ctx.fill();
  ctx.fillStyle = '#5a3a1c'; ctx.beginPath(); ctx.ellipse(x + s / 2, y + s * 0.72, s * 0.42, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  const gr = ctx.createLinearGradient(x, y + s * 0.2, x, y + s * 0.8); gr.addColorStop(0, '#d29a5a'); gr.addColorStop(1, '#8a5a2c');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x + s * 0.1, y + s * 0.74); ctx.quadraticCurveTo(x + s * 0.28, y + s * 0.2, x + s * 0.52, y + s * 0.24); ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.3, x + s * 0.9, y + s * 0.74); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4a3016'; [[0.36, 0.5], [0.6, 0.44], [0.5, 0.62]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(x + s * a, y + s * b, s * 0.045, 0, Math.PI * 2); ctx.fill(); });
  const anyGnawed = g && g.hand && g.hand.some((q) => q && q.gnawed);
  if (anyGnawed) { ctx.strokeStyle = 'rgba(226,85,59,' + (0.55 + Math.sin(clock * 6) * 0.4) + ')'; ctx.lineWidth = 3; rr(x + 1.5, y + 1.5, s - 3, s - 3, 6); ctx.stroke(); }
}
// 啃过的块上那个点着的小爆竹（0.9.20）：画在这块的第一格右上角，引线冒火星
function cracker(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.5);
  ctx.fillStyle = COL.ink; ctx.fillRect(-s * 0.13 - 1, -s * 0.3 - 1, s * 0.26 + 2, s * 0.6 + 2);
  ctx.fillStyle = '#d8402a'; ctx.fillRect(-s * 0.13, -s * 0.3, s * 0.26, s * 0.6); ctx.fillStyle = '#f3d27a'; ctx.fillRect(-s * 0.13, -s * 0.05, s * 0.26, s * 0.1);
  ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.quadraticCurveTo(s * 0.12, -s * 0.42, s * 0.05, -s * 0.5); ctx.stroke();
  const sp = 0.6 + Math.sin(clock * 30) * 0.4; ctx.fillStyle = 'rgba(255,210,90,' + sp + ')'; ctx.beginPath(); ctx.arc(s * 0.05, -s * 0.52, s * (0.06 + 0.04 * sp), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// 一对小脚印（墨怪下一手要爬去的那格）：从它那边朝那格走过来
function footprints(from, to) {
  const x = cellX(to % 9) + L.cell / 2, y = cellY(Math.floor(to / 9)) + L.cell / 2, dx = (to % 9) - (from % 9), dy = Math.floor(to / 9) - Math.floor(from / 9);
  const ang = Math.atan2(dy, dx) + Math.PI / 2, a = 0.75 + Math.sin(clock * 8) * 0.25;
  ctx.fillStyle = 'rgba(226,85,59,' + (0.18 + Math.sin(clock * 8) * 0.1) + ')'; ctx.fillRect(cellX(to % 9) + 2, cellY(Math.floor(to / 9)) + 2, L.cell - 4, L.cell - 4); // 0.9.20：脚印那格底下淡淡发红，更显眼
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = 'rgba(30,22,44,' + a + ')';
  [[-1, 0.12], [1, -0.12]].forEach(([side, off]) => { const fx = side * L.cell * 0.13, fy = off * L.cell; ctx.beginPath(); ctx.ellipse(fx, fy, L.cell * 0.08, L.cell * 0.14, 0, 0, Math.PI * 2); ctx.fill(); for (let t = -1; t <= 1; t++) { ctx.beginPath(); ctx.arc(fx + t * L.cell * 0.05, fy - L.cell * 0.18, L.cell * 0.03, 0, Math.PI * 2); ctx.fill(); } });
  ctx.restore();
}
function drawMonHints() {
  const bite = (k) => {
    const x = cellX(k % 9), y = cellY(Math.floor(k / 9)), s = L.cell, a = 0.55 + Math.sin(clock * 10) * 0.35;
    ctx.fillStyle = 'rgba(18,14,24,' + a + ')';
    for (let n = 0; n < 3; n++) { ctx.beginPath(); ctx.arc(x + s * (0.25 + n * 0.25), y + 2, s * 0.13, 0, Math.PI); ctx.fill(); }
    ctx.strokeStyle = 'rgba(226,85,59,' + a + ')'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
  };
  const bubbles = (k) => { const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2; for (let n = 0; n < 3; n++) { const a = (clock * 1.5 + n / 3) % 1; ctx.globalAlpha = 1 - a; ctx.fillStyle = '#2f5a3c'; ctx.beginPath(); ctx.arc(x + (n - 1) * 8, y + 8 - a * 18, 4 + a * 5, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; };
  g.mon.forEach((m, k) => {
    if (!m || g.board[k] !== CELL.MON) return;
    if (m.step !== undefined && m.step !== null && !monSlide[k]) footprints(k, m.step); // 0.9.17 会爬的墨怪：下一手要去的那格冒脚印
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
// 拖起来浮多高（0.9.17 学 Block Blast：块越高浮得越高，最下面一格始终离手指一格以上，手指挡不住）
const liftOf = (p) => L.lift + Math.max(0, ((p && p.h) || 1) - 2) * L.cell * 0.5;
function snap(p, x, y) {
  const left = x - (p.w * L.cell) / 2;
  const top = y - liftOf(p) - (p.h * L.cell) / 2;
  return { r: Math.round((top - L.by) / L.cell), c: Math.round((left - L.bx) / L.cell) };
}
// 反过来：想放到 (r, c)，手指该在哪（测试和教学手势用）
function fingerFor(p, r, c) {
  if (p && p.special === 'skill') return { x: L.bx + c * L.cell + L.cell / 2, y: L.by + r * L.cell + L.cell / 2 + SKL() };
  return { x: L.bx + c * L.cell + (p.w * L.cell) / 2, y: L.by + r * L.cell + (p.h * L.cell) / 2 + liftOf(p) };
}
// 技能块拖到哪（0.9.12 技能重做）：盘上 { r, c }；爆竹鼠的「啃」拖到托盘里某一块上 { hand, cell }
// 悬在托盘那块上时，把它放大到盘面格子大小、抬到托盘上方（Fable 技能重做第七节第 10 条），技能块画在手指上方，对准哪一格就啃哪一格
function bigHandOrigin(j) { const q = g.hand[j], w = q.w * L.cell, h = q.h * L.cell; return { x: Math.max(8, Math.min(W - 8 - w, slotCenter(j).x - w / 2)), y: L.trayY - 8 - h }; }
// 技能块只有 1 格，浮得比普通块低一点（SKL），不然盘面最下面两排要把手指伸进托盘才够得着
const SKL = () => Math.round(L.cell * 1.2);
// 啃手上的块：手指伸进托盘深处（过了托盘上沿半格）就进「啃手上」；进了以后手指往上抬去对准放大的那块也不退出，直到抬出托盘上方两格半
function handHover(d) {
  const p = g.hand[3];
  if (!p || (p.kind !== 'gnaw' && p.kind !== 'turn')) return null; // 段 3 修：小龟的水珠也是拖到手上的块上用（原来只认啃，小龟第 17 关送来以后技能块拖不上去；转法先只给顺时针转一下，画法段 4、6）
  // 0.9.14 debug 修两处啃不到：① 5 格竖条最上面一格在「两格半」的退出线外面，手指一到那儿就退出 → 退出线跟着那块的高矮走；
  // ② 对准放大那块靠边的格子时手指还在托盘上沿，横着一过界就换成旁边那块 → 已经对上一块以后，手指还在它这几列的范围里就不换
  //    （往下伸过托盘中线，照旧是手指底下是哪块就换哪块）
  const deep = L.trayY + L.cell * 0.5;
  if (d.hl !== undefined && !g.hand[d.hl]) d.hl = undefined;
  if (d.y > deep) {
    const j0 = slotAt(d.x), onPiece = j0 <= 2 && !!g.hand[j0];
    if (j0 === 3) { d.hl = undefined; return null; } // 0.9.21 拖回自己的宠物格 = 不用了（Cc 11-27：「我有的时候松手了想取消这个技能，它还是把它啃了」——原来回到宠物格时还记着刚才对准的那块）
    if (d.hl === undefined) { if (onPiece) d.hl = j0; }
    else if (onPiece) {
      const o = bigHandOrigin(d.hl), inCols = d.x > o.x - L.cell * 0.5 && d.x < o.x + g.hand[d.hl].w * L.cell + L.cell * 0.5;
      if (j0 !== d.hl && (!inCols || d.y > L.trayY + L.trayH * 0.55)) d.hl = j0;
    } else if (d.y >= L.trayY + L.trayH) d.hl = undefined;
  } else if (d.hl !== undefined && d.y < Math.min(L.trayY - L.cell * 2.5, bigHandOrigin(d.hl).y + SKL() - L.cell)) d.hl = undefined;
  const j = d.hl;
  if (j === undefined || !g.hand[j]) return null;
  const q = g.hand[j], o = bigHandOrigin(j), vx = d.x, vy = d.y - SKL();
  let best = 0, bd = 1e9;
  q.cells.forEach(([r, c], n) => { const dd = (o.x + (c + 0.5) * L.cell - vx) ** 2 + (o.y + (r + 0.5) * L.cell - vy) ** 2; if (dd < bd) { bd = dd; best = n; } });
  return { hand: j, cell: best };
}
function skillTarget(d) {
  const p = g.hand[3];
  if (!p) return null;
  if (d.y > L.trayY && slotAt(d.x) === 3) return null; // 0.9.21 手指回到自己的宠物格 = 取消（不然技能块画在手指上方，正好落到盘面最下面一排，松手就用掉了）
  const h = handHover(d);
  if (h) return h;
  const vx = d.x, vy = d.y - SKL(); // 技能块画在手指上方 SKL 处，落在它中心所在的那一格
  const r = Math.floor((vy - L.by) / L.cell), c = Math.floor((vx - L.bx) / L.cell);
  if (!(r >= 0 && r < 9 && c >= 0 && c < 9)) return null;
  // 段 1 规则 3：拖着羽毛时每帧照 peckDir 算横竖（偏左右 = 横、偏上下 = 竖），松手传进 useSkill；亮线归段 4。原来「点一下换方向」拿掉
  if (p.kind === 'peck') d.dir = PG.peckDir(d.dir || 'h', (vx - L.bx) / L.cell - c - 0.5, (vy - L.by) / L.cell - r - 0.5);
  return { r, c, dir: d.dir };
}
// 反过来：想啃手上第 j 块的第 n 格，手指该在哪（测试用）
function fingerForHand(j, n) { const q = g.hand[j], o = bigHandOrigin(j), [r, c] = q.cells[n]; return { x: o.x + (c + 0.5) * L.cell, y: o.y + (r + 0.5) * L.cell + SKL(), enter: { x: slotCenter(j).x, y: L.trayY + L.trayH * 0.6 } }; }
// 如果放下去会消掉哪些格
function previewClear(p, r, c) {
  if (p.special === 'skill') return new Set(g.skillLit(p, r, c));
  const b = g.board.slice();
  for (const [dr, dc] of p.cells) b[(r + dr) * 9 + c + dc] = 1;
  const set = new Set();
  for (let u = 0; u < 27; u++) if (core.unitFull(b, u)) core.UNITS[u].forEach((k) => set.add(k)); // 段 1 规则 1：被障碍堵着的排拖块时不发亮
  return set;
}

// ---------- 输入 ----------
// ---------- 震动（0.9.9，照 ../../../00_震动手感规矩_1.0.md）----------
// 哪里都只叫 haptic('light' | 'medium' | 'heavy')，不直接叫 P.vibrate：
// 同一下（同一次点按、同一帧）叫了好几次，只震最重的那一档；离上一次震不到 40 毫秒就留到下一帧再震。
const HAPTIC_RANK = { light: 1, medium: 2, heavy: 3 }, HAPTIC_NAME = ['', 'light', 'medium', 'heavy'];
let hapticWant = 0, hapticLast = -1e9, hapticQueued = false;
function haptic(level) {
  hapticWant = Math.max(hapticWant, HAPTIC_RANK[level] || 1);
  if (!hapticQueued) { hapticQueued = true; Promise.resolve().then(hapticFlush); } // 这一下的代码全跑完再震，好挑出最重的
}
function hapticFlush() {
  hapticQueued = false;
  if (!hapticWant) return;
  const now = P.now();
  if (now - hapticLast < 40) return; // 没隔够：frame() 每帧还会再来叫一次
  const level = HAPTIC_NAME[hapticWant];
  hapticWant = 0; hapticLast = now;
  if (save.noVibrate) return;
  P.vibrate(level);
  if (typeof window !== 'undefined' && window.__hapticLog) window.__hapticLog.push({ t: now, level, mode }); // 机器人测试打桩
}
// 消除的「嘣嘣嘣」（0.9.11，Cc 11-25：「当我消掉色块的时候，我需要更大的震动反馈，比如说三声波浪"嘣嘣嘣"之类的。当然不要太腻」）：
// 三下，隔 80 毫秒，一下比一下轻，像浪退下去。消得越多越重。点、拿、放还是一下 light。
const CLEAR_WAVE = { line: ['medium', 'medium', 'light'], combo: ['heavy', 'medium', 'medium'], big: ['heavy', 'heavy', 'medium'], gap: 80 };
function hapticWave(levels) {
  haptic(levels[0]);
  levels.slice(1).forEach((lv, i) => setTimeout(() => haptic(lv), CLEAR_WAVE.gap * (i + 1)));
}
function hitButton(x, y) {
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y - 4 && y <= b.y + b.h + 6) return b;
  }
  return null;
}
function onTouch(type, id, x, y, live) { try { onTouchBody(type, id, x, y, live); } catch (err) { logErr('touch', err); drag = null; } }
// 拖到一半作废：块回托盘（切后台、系统手势把手指「吃」了，微信没给抬起）
function cancelDrag() { if (drag) { T.rec('x', drag.slot, -2, -2); drag = null; } }
P.onVisibility((visible) => { if (!visible) { cancelDrag(); downBtn = null; downTouch = null; } });
function onTouchBody(type, id, x, y, live) {
  // 0.9.14 debug 修两种「点什么都没反应」：live = 微信说现在还按在屏幕上的手指。
  // 拖着的那根早就不在了（没收到抬起）→ 这块作废，不然下面那句「只认一根手指」会把以后所有的点按都挡掉
  if (type === 'down' && live) { if (drag && live.indexOf(drag.id) < 0) cancelDrag(); if (downBtn && live.indexOf(downTouch) < 0) { downBtn = null; downTouch = null; } }
  if (type === 'cancel') { if (drag && drag.id === id) cancelDrag(); else if (downTouch === id) { downBtn = null; downTouch = null; } return; } // 被系统打断：不算松手
  if (mode === 'cut') { if (type === 'down') { CUT.skip(); if (!CUT.playing) endCuts(); } return; }
  if (evoAnim) { if (type === 'down' && clock - evoAnim.t > 3.2) { if (clock - evoAnim.t >= EVO_LEN) evoAnim = null; else evoAnim.t = clock - EVO_LEN; } return; } // 进化动画：前 3 秒不能点掉，之后点一下跳到结尾、再点关
  if (type === 'down') {
    T.input(); lastTouchMs = P.now();
    if (drag) return; // 只认一根手指
    if (downTouch === id) { downBtn = null; downTouch = null; } // 同一根手指又按下：上一次的按钮早松了
    const b = hitButton(x, y);
    if (b) { downBtn = b.id; downTouch = id; return; }
    if (mode === 'play' && g.pets && !g.over && x >= L.bx && x < L.bx + L.board && y >= L.by && y < L.by + L.board) { // 点棋盘上的墨怪 / 铁石 / 机关匣 / 头目：冒气泡说明
      const k = Math.floor((y - L.by) / L.cell) * 9 + Math.floor((x - L.bx) / L.cell);
      if (g.board[k] >= 2) { showInfo({ k }); return; }
      if (info) { info = null; return; }
    }
    if (mode === 'play' && !g.over && y > L.trayY - 20) {
      const i = slotAt(x);
      if (g.hand[i]) {
        drag = { slot: i, x, y, id, x0: x, y0: y };
        T.rec('p', i, g.hand[i].special || g.hand[i].id);
        P.sound('pick', 0.5);
        haptic('light');
      }
    }
  } else if (type === 'move') {
    if (drag && drag.id === id) { drag.x = x; drag.y = y; }
  } else if (type === 'up') {
    // 松的是按按钮的那根手指才算点按钮。原来不分手指：一根手指搭在按钮上（左下角那支笔、宠物格、「‹ 地图」），另一根拖块、先松手，
    // 这一下被当成「松开按钮」吞掉，块悬在半空，以后点什么都没反应
    if (downBtn && downTouch === id) {
      const b = hitButton(x, y);
      const was = downBtn;
      downBtn = null; downTouch = null;
      if (b && b.id === was && b.fn) { T.rec('b', b.id); P.sound('tap', 0.5); haptic('light'); b.fn(); }
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
  if (p && p.special === 'skill') { // 0.9.12：技能块不走「放进空格」那套，照落点用
    const tg = skillTarget(drag);
    drag = null;
    if (!tg || !g.skillPlan(tg)) { T.rec('x', 3, tg ? (tg.hand !== undefined ? 'h' + tg.hand : tg.r) : -1, tg ? (tg.hand !== undefined ? tg.cell : tg.c) : -1); P.sound('deny', 0.5); return; }
    const colorsBefore = colorAt.slice();
    const pev = g.useSkill(tg);
    if (!pev) return;
    for (let k = 0; k < 81; k++) if (g.board[k] === CELL.BLOCK) colorAt[k] = g.color[k];
    T.rec('k', pev.skill.pet, tg.hand !== undefined ? 'h' + tg.hand : tg.r, tg.hand !== undefined ? tg.cell : tg.c, pev.skill.cells.length + (pev.skill.fill || []).length, tg.dir || '', (pev.metal || []).length + (pev.blast || []).length); // 段 1 附录 G：克制、打不动两个数删了，换成方向、打开了几个障碍
    if (pev.rescue) T.rec('r', pev.rescue);
    if (pev.wave) T.rec('w', pev.wave.no, pev.wave.of);
    if (pev.win && !g._settled) settlePet();
    juicePets(pev, colorsBefore);
    return;
  }
  const s = snap(p, drag.x, drag.y);
  drag = null;
  if (!p || !core.canPlace(g.board, p, s.r, s.c)) {
    if (p) T.rec('x', i, s.r, s.c);
    P.sound('deny', 0.5);
    return;
  }
  const ci = handColor(i);
  // 0.9.17 第 1 关第一手只认那一横的缺口（Cc 11-27 第 13 件之④定 A）：放别处块滑回托盘，宠物摇头
  if (g.pets && petIdx === 0 && !save.petTutDone && g.moves === 0) { const tt = tutorialTarget(); if (tt && (i !== 0 || s.r !== tt.r || s.c !== tt.c)) { T.rec('x', i, s.r, s.c); P.sound('deny', 0.5); haptic('light'); petFx.tutNo = clock; return; } }
  if (g.pets) {
    if (g.rush && !g.rushT0) g.rushT0 = P.now(); // 冲锋关的香从第一手开始烧
    const colorsBefore = colorAt.slice();
    const pev = g.place(i, s.r, s.c);
    if (!pev) { if (g.rush) { T.rec('x', i, s.r, s.c); P.sound('deny', 0.45); haptic('light'); } return; } // 冲锋关放在不会消的地方：弹回去
    T.rec('d', i, s.r, s.c, p.id, (pev.units || []).length, pev.beat || 1, (pev.collected || []).length);
    if (pev.rescue) T.rec('r', pev.rescue);
    if (pev.drain && pev.drain.length) T.rec('n', pev.drain.length);
    if (pev.wave) T.rec('w', pev.wave.no, pev.wave.of);
    for (let k = 0; k < 81; k++) if (g.board[k] === CELL.BLOCK) colorAt[k] = g.color[k];
    if (!save.petTutDone) { save.petTutDone = true; save.tutorialDone = true; persist(); }
    if (pev.win && !g._settled) settlePet(); // 赢了马上记账，结算页等动画演完再出
    juicePets(pev, colorsBefore);
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
    haptic('light');
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
  }
  if (ev.crossbow) bolts.push({ row: ev.crossbow.row + 0.5, t: clock, dir: 1 });
  ev.newlyLit.forEach((b) => litAnim.push({ b, t: clock }));
  // 旅程：收走的东西飞向顶上的计数
  (ev.collected || []).forEach((c, n) => {
    flyers.push({ what: c.what, x: cellX(c.k % 9) + L.cell / 2, y: cellY(Math.floor(c.k / 9)) + L.cell / 2, t: clock + n * 0.05 });
  });
  // 声音。0.9.18 宠物关：消除一律编钟和弦，第几声照连消数：第 1–5 声五声往上，第 6 声起一路扫上去；一下消 5 处以上 / 过关那一手再加低音大钟（声音包装方案第五节第 1、3 条）
  if (g && g.pets) {
    const mons = (ev.collected || []).filter((c) => c.what === 'monster').length;
    for (let n = 0; n < Math.min(4, mons); n++) setTimeout(() => P.sound('pop', 0.55), 260 + n * 110); // 墨怪吸进葫芦「啵」
    // 0.9.22 冲锋关（Cc 11-27：「不是一消、二消、三消、四消、五消之后，连消最后的那个音乐是很爽的吗？你现在这个怎么感觉都一样啊？」）：原来一块就消两三处，两块以后就一直顶在最高那声。改成一块升一级，第 6 块扫上去，再从头爬
    const lv = g.rush && ev.rushStep !== undefined ? ev.rushStep : Math.max(0, (ev.streak || 1) - 1);
    if (ev.beat >= 2) P.sound(lv >= 5 ? 'sweep' : 'clear' + lv, 0.75);
    if (ev.beat >= 2 && ((ev.units && ev.units.length >= 5) || ev.win)) setTimeout(() => P.sound('dong', 0.8), 60);
  } else {
    if (ev.collected && ev.collected.length) setTimeout(() => P.sound('coin', 0.5), 380);
    if (ev.beat === 2) P.sound('line', 0.7);
    if (ev.beat === 3) P.sound('box', 0.8);
    if (ev.beat === 4) P.sound(ev.combo >= 3 || ev.streak >= 5 ? 'combo4' : ev.combo >= 2 ? 'combo3' : 'combo2', 0.7), P.sound('line', 0.5);
    if (ev.beat === 5) P.sound('five', 0.9), P.sound('combo4', 0.4);
  }
  if (ev.crossbow) P.sound('bolt', 0.6);
  if (ev.newlyLit.length) setTimeout(() => P.sound('lit', 0.6), 120);
  hapticWave(ev.win || ev.beat >= 5 ? CLEAR_WAVE.big : ev.beat >= 4 ? CLEAR_WAVE.combo : CLEAR_WAVE.line); // 消掉了：「嘣嘣嘣」三下波浪（Cc 11-25），连消也只来一串、取最重的那串
  // 跳字
  let label = '+' + ev.gained;
  texts.push({ s: label, x: cx, y: cy - 6, t: clock, size: 18 + ev.beat * 4, col: ev.beat >= 4 ? COL.brassLight : COL.text });
  if (ev.center) texts.push({ s: '×5', x: cellX(4) + L.cell / 2, y: cellY(4) + L.cell / 2, t: clock + 0.05, size: 64, col: COL.red, big: true });
  else if (ev.combo >= 2) texts.push({ s: '×' + ev.combo, x: W / 2, y: L.by + L.board * 0.32, t: clock, size: 30 + ev.combo * 4, col: COL.brassLight, big: true });
  else if (ev.streak >= 3) texts.push({ s: '♪' + ev.streak, x: W / 2, y: L.by + L.board * 0.32, t: clock, size: 30, col: COL.jade, big: true });
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
  haptic('heavy'); // 过关、输了都是大事
  stats.overs.push(P.now());
  drag = null;
  return endPet(); // 0.9.25 旅程、经典拼画的结算拆掉了，只剩宠物关
}
function continueAfterAd(fn) {
  ad = { until: clock + C.adSec, done: fn };
  mode = 'ad';
}

// ---------- 更新 ----------
// 出错记账（0.9.13）：不让一个错误把整个游戏卡死，记进试玩记录（代号 X）好查
let errCount = 0;
function logErr(where, err) {
  errCount++;
  if (errCount > 30) return; // 同一个错误每帧都出时，记前 30 次就够
  try { T.rec('X', where, String((err && err.message) || err).slice(0, 160), String((err && err.stack) || '').split('\n').slice(0, 4).join(' | ').slice(0, 400), mode, petIdx + 1); T.flush(); } catch (e2) { /* 记不了就算了 */ }
}
P.onError((msg) => logErr('wx', msg));
function update(dt) {
  clock += dt;
  runTimeline();
  // 看门狗：已经赢了 / 输了，3.5 秒还没出结算页，直接出（别让玩家对着一盘不能动的棋发呆）
  if (mode === 'play' && g && g.pets && g.over) { if (g._overSeen === undefined) g._overSeen = clock; else if (clock - g._overSeen > 3.5) { logErr('watchdog', 'over 但 3.5 秒没出结算页'); timeline = []; g._ended = false; if (!result) g._settled = false; try { endGame(); } catch (e) { logErr('watchdog-end', e); } g._overSeen = clock; } } else if (g) g._overSeen = undefined;
  // 判了输赢、排队的动画也空了，人还在关里：马上出结算页，不等看门狗（0.9.14 debug；比如说明卡盖着的时候过了关）
  if (mode === 'play' && g && g.pets && g.over && !g._ended && !timeline.length) { try { endGame(); } catch (e) { logErr('end-now', e); } }
  // 0.9.24 冲锋关不够快就输（Cc 11-27：「爽关唯一难度就是在速度上……必须得速度要求高一点，不够快就输了」）：香烧完还没塞够，就输；最后 5 秒每秒响一下
  if (mode === 'play' && g && g.rush && !g.over && g.rushT0 && g.stage.rush.lose) {
    const left = g.stage.rush.lose - rushSec();
    if (left <= 0) { g.over = true; g.won = false; g.reason = 'time'; g.rushSec = g.stage.rush.lose; T.rec('b', 'rushTimeUp'); }
    else if (left <= 5 && Math.ceil(left) !== g._tickSec) { g._tickSec = Math.ceil(left); P.sound('tap', 0.5); haptic('light'); }
  }
  if (mode === 'play' && g && g.rush && g.rushFixStart && !g._fixStarted) { g._fixStarted = true; playRushFix(g.rushFixStart, Math.max(clock, enterAt + 0.6) + 0.3); }
  if (mode === 'play' && g && g.rush && !g.over && !drag && g.rushStuck && g.rushStuck()) { g.rushRepair(); for (let k = 0; k < 81; k++) if (g.board[k] && !cellIn[k]) cellIn[k] = clock + ((k % 9) + Math.floor(k / 9)) * 0.01; T.rec('b', 'rushRepair'); } // 0.9.21 冲锋关万一卡住：整盘重铺（保险）
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
// 铁石该不该发光：这关要碎铁石、还没碎够，并且（技能块在宠物格里 或者 别的目标都完成了）
function rockCallNow() {
  if (!g || !g.stage || !g.stage.goal || !('rock' in g.stage.goal) || g.over) return false;
  const left = g.goalLeft();
  if (!left.rock) return false;
  const skillReady = !!(g.hand && g.hand[3] && g.hand[3].special === 'skill');
  return skillReady || Object.keys(left).every((key) => key === 'rock' || !left[key]);
}
// 目标格上的两三个字：图标旁边写清这是要干什么（Cc 11-26：「任务目标里要写清楚啊，抓多少个怪、碎多少个石头」）
const GOAL_VERB = { lines: '消排', monster: '抓墨怪', all: '抓墨怪', rock: '碎铁石', boss: '打头目', box: '收匣子', evolve: '点亮' };
function goalVerb(key) { return GOAL_VERB[key] || '收宝石'; }
// 旅程的顶栏：返回、第几关、目标计数（还差几个；够了打勾）
function drawStageHud() {
  const y = L.top;
  button('map', 10, y + 4, 62, 38, '‹ 地图', { size: 15, bg: COL.wood, fn: () => { if (g.over && !g._ended) endGame(); else if (!g.over && g.moves > 0) logPlay(true); timeline = []; if (g.won && g.pets) { CUT.clear(); openCamp(); } else mode = 'map'; } }); // 赢的那一下马上点回去：先把这关记上账；过了关一律回营地
  text(g.pets ? petLevelName() : '第 ' + (stageIdx + 1) + ' 关', W / 2, y + 10, 15, COL.dim, 'center', 'normal');
  if (g.pets && g.rush) { chipPos = {}; drawRushHud(y); return; } // 0.9.24 冲锋关顶上只放两样：还剩几块 + 一根大倒计时条
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
  const cw = 92, x0 = W / 2 - (cw * keys.length) / 2, rc = rockCallNow();
  keys.forEach((key, n) => {
    const cx = x0 + cw * n + cw / 2, cy = y + 40;
    const pop = chipPop[key] ? Math.max(0, 0.25 - (clock - chipPop[key])) * 2 : 0;
    ctx.fillStyle = key === 'rock' && rc ? 'rgba(243,210,122,' + (0.55 + Math.sin(clock * 5) * 0.35) + ')' : COL.ink; rr(cx - 43, cy - 19, 86, 38, 10); ctx.fill();
    ctx.fillStyle = COL.woodDark; rr(cx - 41, cy - 17, 82, 34, 9); ctx.fill();
    const sz = 22 * (1 + pop);
    goalIcon(key, cx - 26, cy, sz);
    chipPos[key] = { x: cx - 26, y: cy };
    text(goalVerb(key), cx + 12, cy - 8, 12, COL.dim); // 要干什么
    if (left[key] === 0) text('✓', cx + 14, cy, 22, COL.jade);
    else rods(cx + 14, cy, left[key], 18); // 0.9.20 还差几个：算筹
    buttons.push({ id: 'goal_' + key, x: cx - 43, y: cy - 19, w: 86, h: 38, fn: () => showInfo({ goal: key }) }); // 点目标图标：说明它是什么
  });
  if (g.pets && !g.rush) drawDanSlots(y);
  // 一共几波、现在第几波（0.9.14，Cc：「某一关里面一共要抓几波怪，你得写清楚啊！」）：打完的实心，正在打的闪
  if (g.pets && g.waveTotal > 1) {
    const n = g.waveTotal, cur = g.waveNo || 1, gap = 18, wx0 = W / 2 - ((n - 1) * gap) / 2, wy = y + 72;
    const jump = petFx.waveJump ? Math.max(0, 0.4 - (clock - petFx.waveJump)) / 0.4 : 0;
    text('波', wx0 - 20, wy, 12, COL.dim);
    for (let k = 0; k < n; k++) {
      const x = wx0 + k * gap, done = k < cur - 1, now = k === cur - 1, r0 = 6 + (now ? jump * 4 : 0);
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(x, wy, r0 + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = done ? COL.jade : now ? 'rgba(243,210,122,' + (0.6 + Math.sin(clock * 6) * 0.35) + ')' : COL.woodDark; ctx.beginPath(); ctx.arc(x, wy, r0, 0, Math.PI * 2); ctx.fill();
    }
  }
}
// 段 2 丹槽（丹细设计规则 2；取代 0.9.17 的分数和三颗星）：左上 3 个丹槽，难关每槽叠 2 颗、头目叠 3 颗。
// 普通关：放到第「标准手数」块还没赢暗一个，到 1.5 倍再暗一个，最后一个永远不暗；用过救命、带借来的宠物：第 3 个当场暗。教学关一直全亮
// 冲锋关：倒计时条上两道刻痕，烧过一道暗一个。亮几个全由 economy.live 算，这里只画（正式画法段 5）
function rushSec() { if (!g.rushT0) return 0; return g.rushSec !== undefined ? g.rushSec : (P.now() - g.rushT0) / 1000; }
const runOf = (gg) => ({ won: !!gg.won, moves: gg.moves || 0, sec: gg.rush ? rushSec() : 0, revives: gg.revivesUsed || 0, lent: !!gg.lent });
const today = () => { const d = new Date(); return EC.dayKey(d.getFullYear(), d.getMonth() + 1, d.getDate()); }; // 重打那一份按手机上的日期
// 一个丹槽：per 颗丹叠成一摞（难关 2、头目 3）。state：'new' 金 / 'had' 暗金（这关以前就拿过）/ 'off' 灰
function danSlot(x, y, r, per, state) {
  const cols = state === 'new' || state === true ? ['#7a5214', '#f2c14e', '#fff4c8'] : state === 'had' ? ['#4a3614', '#a8843a', '#d8c08a'] : ['#1a1830', '#3a3550', '#4a4560'];
  for (let k = per - 1; k >= 0; k--) {
    const yy = y - k * r * 0.62;
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(x, yy + r * 0.12, r + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cols[0]; ctx.beginPath(); ctx.arc(x, yy + r * 0.12, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cols[1]; ctx.beginPath(); ctx.arc(x, yy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cols[2]; ctx.beginPath(); ctx.arc(x - r * 0.35, yy - r * 0.35, r * 0.3, 0, Math.PI * 2); ctx.fill();
  }
}
const slotPer = (st) => EC.SLOT_DAN[EC.kindOf(st)];
// 0.9.24 冲锋关的顶栏（Cc 11-27：「时间的倒计时条必须得显示出来」「必须得更明显更明显才行」「上面一堆东西叠在一起……你这还能更丑一点吗」）：
// 原来分数、三颗星、24 根算筹、细细一根香叠在一起。现在只有两样：中间「方块 + 还剩几块」，盘面正上方一根整宽的粗倒计时条（星就刻在条上）
function drawRushHud(y) {
  const st = g.stage, left = g.goalLeft().lines || 0, t = rushSec(), lose = st.rush.lose || st.rush.t2 * 1.35;
  const rp = rushPlayPulse();
  // 还剩几块
  const cy = Math.min(y + 30, L.by - 62);
  goalIcon('lines', W / 2 - 34, cy, 26 * (1 + (chipPop.lines ? Math.max(0, 0.25 - (clock - chipPop.lines)) * 2 : 0)));
  chipPos.lines = { x: W / 2 - 34, y: cy };
  text(String(left), W / 2 + 14, cy + 1, 34, COL.text);
  buttons.push({ id: 'goal_lines', x: W / 2 - 60, y: cy - 22, w: 120, h: 44, fn: () => showInfo({ goal: 'lines' }) });
  // 倒计时条：满的时候整根亮，越烧越短；剩四成变橙、剩一成多变红并一闪一闪
  const bx = 18, bw = W - 36, bh = 18 + rp * 3, by = L.by - 24 - bh / 2;
  const frac = Math.max(0, Math.min(1, 1 - t / lose)), low = frac < 0.17, mid = frac < 0.4;
  const col = low ? (Math.sin(clock * 18) > 0 ? '#ff4a3a' : '#ffb03a') : mid ? '#ff9a3a' : '#f3d27a';
  ctx.fillStyle = '#120d0a'; rr(bx - 3, by - 3, bw + 6, bh + 6, (bh + 6) / 2); ctx.fill();
  ctx.fillStyle = '#3a2a22'; rr(bx, by, bw, bh, bh / 2); ctx.fill();
  if (frac > 0) { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = low ? 22 : 10 + rp * 10; ctx.fillStyle = col; rr(bx, by, Math.max(bh, bw * frac), bh, bh / 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; rr(bx + 4, by + 3, Math.max(bh - 8, bw * frac - 8), bh * 0.3, bh * 0.15); ctx.fill();
    const ex = bx + bw * frac; ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(ex, by + bh / 2, bh * 0.45 + Math.sin(clock * 20) * 2, 0, Math.PI * 2); ctx.fill(); } // 烧着的那头一颗火星
  // 丹槽刻在条上：过了这个时间那个槽就暗（段 2：原来刻的是星）
  [[st.rush.t3, 3], [st.rush.t2, 2]].forEach(([tt, n]) => { const nx = bx + bw * Math.max(0, 1 - tt / lose); ctx.fillStyle = '#120d0a'; ctx.fillRect(nx - 2, by - 5, 4, bh + 10); for (let k = 0; k < n; k++) danSlot(nx - (n - 1) * 7 + k * 14, by - 14, 5, 1, t <= tt); });
}
function drawDanSlots(y) {
  const st = g.stage, n = EC.live(st, runOf(g)).slots, per = slotPer(st);
  for (let k = 0; k < 3; k++) danSlot(22 + k * 22, y + 82, 7, per, k < n); // 段 2：不画分数；3 个丹槽（计数器的数段 5 画，R-055）
  if (!st.rush) return;
  const t = rushSec(), total = st.rush.lose || st.rush.t2 * 1.35, bw = Math.min(230, W - 170), bx = (W - bw) / 2, by = y + 74;
  const burn = Math.min(1, t / total), bx1 = bx + bw * burn;
  ctx.fillStyle = COL.ink; rr(bx - 2, by - 5, bw + 4, 10, 5); ctx.fill();
  ctx.fillStyle = '#8a5a34'; rr(bx1, by - 3, bx + bw - bx1, 6, 3); ctx.fill(); // 还没烧的那截
  ctx.fillStyle = '#3a2a22'; ctx.fillRect(bx, by - 1, bx1 - bx, 2); // 烧过的灰
  [st.rush.t3, st.rush.t2].forEach((tt) => { const nx = bx + bw * Math.min(1, tt / total); ctx.fillStyle = t > tt ? '#5a4a40' : COL.brassLight; ctx.fillRect(nx - 1.5, by - 8, 3, 16); });
  if (burn < 1) { const gl = 4 + Math.sin(clock * 9) * 1.5; ctx.fillStyle = 'rgba(255,140,60,0.45)'; ctx.beginPath(); ctx.arc(bx1, by, gl + 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.arc(bx1, by, gl * 0.6, 0, Math.PI * 2); ctx.fill(); for (let w = 0; w < 3; w++) { const a = (clock * 0.7 + w / 3) % 1; ctx.globalAlpha = (1 - a) * 0.5; ctx.fillStyle = '#d8d0e0'; ctx.beginPath(); ctx.arc(bx1 + Math.sin(a * 6 + w) * 5, by - 6 - a * 22, 2 + a * 3, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
}
function drawHud() {
  return drawStageHud(); // 0.9.25 只剩宠物关（经典拼画的顶栏拆掉了）
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
    if (g.stage) { // 段 1：点亮九宫的旧玩法拆了（附录 D 丙），g.revealed / g.lit 没了
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
    if (p.special === 'skill') {
      const tg = skillTarget(drag), plan = tg && tg.hand === undefined ? g.skillPlan(tg) : null;
      if (plan) { ghost = { p, s: { r: tg.r, c: tg.c }, ci: handColor(drag.slot), plan }; willClear = new Set(plan.cells); }
    } else if (core.canPlace(g.board, p, s.r, s.c)) {
      ghost = { p, s, ci: handColor(drag.slot) };
      willClear = previewClear(p, s.r, s.c);
    }
  }
  if (willClear && willClear.size) {
    ctx.fillStyle = 'rgba(243,210,122,' + (0.22 + Math.sin(clock * 10) * 0.08) + ')';
    if (ghost && ghost.p.special !== 'skill' && g.pets) { const hc = (C.blockColors[ghost.ci] || C.blockColors[0])[1]; ctx.fillStyle = hc; ctx.globalAlpha = 0.5 + Math.sin(clock * 10) * 0.12; } // 0.9.17：会消的那一排 / 一竖 / 一大格整片染成手上那块的颜色
    if (ghost && ghost.p.special === 'skill') { const sc = C.blockColors[PG.PETS[ghost.p.pet].color][1]; ctx.fillStyle = sc; ctx.globalAlpha = 0.4 + Math.sin(clock * 10) * 0.12; }
    willClear.forEach((k) => ctx.fillRect(cellX(k % 9), cellY(Math.floor(k / 9)), cell, cell));
    ctx.globalAlpha = 1;
  }
  // 0.9.17（Cc 11-26：「那石头看不出来是要让我碎的呀」）：还要碎铁石时，技能块备好了、或者只剩铁石没碎，盘上的铁石一闪一闪描金边——用图告诉玩家「技能块往这儿打」
  const rockCall = rockCallNow();
  // 块
  for (let k = 0; k < 81; k++) {
    if (!g.board[k]) continue;
    const pop = popping.find((p) => p.k === k);
    const ent = Math.min(1, Math.max(0, (clock - enterAt - (Math.floor(k / 9) + (k % 9)) * 0.022) / 0.22)); // 进关：一格格弹出来
    if (ent <= 0) continue;
    const entS = ent < 1 ? 1 + 2.2 * Math.pow(ent - 1, 3) + 1.2 * Math.pow(ent - 1, 2) : 1; // 先冲过头一点再落定
    const sc = (pop ? 1 + 0.18 * (1 - (clock - pop.t) / 0.15) : 1) * entS;
    const s = cell * sc, x = cellX(k % 9) + (cell - s) / 2, y = cellY(Math.floor(k / 9)) + (cell - s) / 2;
    if (g.board[k] === CELL.METAL) { metalPlate(x, y, s, k); continue; } // 0.9.17 金属
    if (g.board[k] === CELL.DIRT) { dirtMound(x, y, s, k); continue; } // 0.9.20 一堆土
    if (g.board[k] === CELL.BRICK) { const ca = cellIn[k] !== undefined ? (clock - cellIn[k]) / 0.28 : 9; if (ca < 0) continue; if (ca < 1) { const e = 1 - Math.pow(1 - ca, 3), ss = cell * e; rushBrick(cellX(k % 9) + (cell - ss) / 2, cellY(Math.floor(k / 9)) + (cell - ss) / 2 - (1 - e) * cell * 0.6, ss); continue; } delete cellIn[k]; rushBrick(x, y, s); continue; } // 0.9.21 铜砖
    if (cellIn[k] !== undefined) { const ca = (clock - cellIn[k]) / 0.28; if (ca < 0) continue; if (ca < 1) { const e = 1 - Math.pow(1 - ca, 3), ss = cell * e; block(cellX(k % 9) + (cell - ss) / 2, cellY(Math.floor(k / 9)) + (cell - ss) / 2 - (1 - e) * cell * 0.6, ss, 1, colorAt[k], false); continue; } delete cellIn[k]; } // 冲锋关补进来的格子：一格格弹进来
    if (g.board[k] === CELL.MON) {
      const sl = monSlide[k]; if (sl) { const sa = (clock - sl.t) / 0.32; if (sa >= 1) delete monSlide[k]; else if (sa >= 0) { const e = sa * sa * (3 - 2 * sa), fx0 = cellX(sl.from % 9), fy0 = cellY(Math.floor(sl.from / 9)), hop = Math.sin(sa * Math.PI) * cell * 0.25; drawMon(g.mon && g.mon[k], k, fx0 + (x - fx0) * e + s / 2, fy0 + (y - fy0) * e + s / 2 - hop, s * 0.4); continue; } } // 爬：从原来那格蹦过去
      const ma = monIn[k] !== undefined ? (clock - monIn[k]) / 0.45 : 9;
      if (ma < 0) continue;
      if (ma < 1) { const fall = Math.min(1, ma / 0.6), dy = -(1 - fall * fall) * cell * 1.6, sq = ma > 0.6 ? 1 - Math.sin(((ma - 0.6) / 0.4) * Math.PI) * 0.25 : 1; ctx.save(); ctx.translate(x + s / 2, y + s * 0.9 + dy); ctx.scale(1 / sq, sq); drawMon(g.mon && g.mon[k], k, 0, -s * 0.4, s * 0.4); ctx.restore(); continue; } // 冒出来：从上面掉下来、落地压扁一下
      // 0.9.20（Cc：「让那个怪越抖越快，直到最后才移动到下一格，不然我不知道它还有多久移动」）：还剩 3 手轻轻抖、2 手抖得快、下一手就走抖得最快
      const mm = g.mon && g.mon[k], rem = g.stage.crawl && mm && (mm.t === 'ink' || mm.t === 'moss') ? (mm.step !== undefined && mm.step !== null ? 1 : (mm.walk === undefined ? g.stage.crawl : mm.walk) + 1) : 9;
      const amp = rem === 1 ? s * 0.07 : rem === 2 ? s * 0.045 : rem === 3 ? s * 0.022 : 0, fq = rem === 1 ? 38 : rem === 2 ? 22 : 12;
      const jx = amp ? Math.sin(clock * fq + k) * amp : 0, jy = rem === 1 ? -Math.abs(Math.sin(clock * fq * 0.5 + k)) * s * 0.06 : 0;
      drawMon(mm, k, x + s / 2 + jx, y + s / 2 + jy, s * 0.4); continue;
    }
    if (g.board[k] === CELL.ROCK) { ironRock(x, y, s); if (rockCall) { ctx.strokeStyle = 'rgba(243,210,122,' + (0.55 + Math.sin(clock * 5) * 0.35) + ')'; ctx.lineWidth = 3; rr(x + 1.5, y + 1.5, s - 3, s - 3, 6); ctx.stroke(); } if (g.rockHp && g.rockHp[k] > 1) { ctx.strokeStyle = '#8a90a0'; ctx.lineWidth = 2; ctx.strokeRect(x + 4, y + 4, s - 8, s - 8); ctx.strokeRect(x + 8, y + 8, s - 16, s - 16); } continue; }
    if (g.board[k] === CELL.BOSS) {
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
    if (g.board[k] === CELL.CHEST) {
      // 机关匣：要被消的那一下亮一圈
      chest(x, y, s);
      if (willClear && willClear.has(k)) { ctx.strokeStyle = COL.brassLight; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, s - 4, s - 4); }
      continue;
    }
    block(x, y, s, 1, colorAt[k], willClear && willClear.has(k));
  }
  if (ghost && ghost.plan) {
    // 吐丝要补的空格：淡淡的宠物色；落点画一圈
    ghost.plan.fill.forEach((k) => block(cellX(k % 9), cellY(Math.floor(k / 9)), cell, 0.45, PG.PETS[ghost.p.pet].color));
    const tx = cellX(ghost.s.c) + cell / 2, ty = cellY(ghost.s.r) + cell / 2;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(tx, ty, cell * 0.3, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    ghost = null;
  }
  if (ghost) {
    ghost.p.cells.forEach(([dr, dc], n) => {
      block(cellX(ghost.s.c + dc), cellY(ghost.s.r + dr), cell, 0.4, ghost.ci);
    });
  }
  if (g.pets) drawPetBoard();
  // 正在碎掉的块：变白、缩小
  // 0.9.21 冲锋关宠物修之前：那个空里先多画一块铜砖，铜雀一啄就碎
  if (rushPatch && g.rush && clock < rushPatch.until && g.board[rushPatch.k] === CELL.EMPTY) rushBrick(cellX(rushPatch.k % 9), cellY(Math.floor(rushPatch.k / 9)), cell);
  clearing.forEach((cl) => {
    const a = (clock - cl.t) / 0.3;
    if (a < 0) return;
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
    if (p.mud === n) { ctx.globalAlpha = alpha; ctx.fillStyle = '#3a2412'; rr(x0 + c * s + 1, y0 + r * s + 1, s - 2, s - 2, s * 0.18); ctx.fill(); ctx.fillStyle = '#9a6a34'; rr(x0 + c * s + 3, y0 + r * s + 3, s - 6, s - 6, s * 0.18); ctx.fill(); ctx.fillStyle = '#6b4420'; ctx.beginPath(); ctx.arc(x0 + c * s + s * 0.35, y0 + r * s + s * 0.4, s * 0.1, 0, Math.PI * 2); ctx.arc(x0 + c * s + s * 0.62, y0 + r * s + s * 0.62, s * 0.08, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; return; } // 0.9.20 粘墨怪吐上来的泥格
    block(x0 + c * s, y0 + r * s, s, alpha, ci);
    if (hg && hg.cell === n) gem(x0 + c * s, y0 + r * s, s, hg.kind, alpha);
  });
  if (p.gnawed && !p.special) { const [r0, c0] = p.cells[0]; cracker(x0 + c0 * s + s * 0.85, y0 + r0 * s + s * 0.15, s); } // 啃过的块：小爆竹
}
function drawTray() {
  // 托盘
  ctx.fillStyle = COL.bg2; rr(8, L.trayY - 6, W - 16, L.trayH + 6, 14); ctx.fill();
  if (hasPetSlot()) {
    // 宠物格：一个虚线框，空着时淡淡画出出战宠物的影子；有技能块时框亮起来
    const c3 = slotCenter(3), w3 = SLOT3W() - 8, h3 = L.trayH - 12, pt = g.team[0], col = C.blockColors[PG.PETS[pt.id].color];
    ctx.strokeStyle = g.hand[3] ? col[1] : COL.woodLine; ctx.lineWidth = g.hand[3] ? 3 : 2; if (!g.hand[3]) ctx.setLineDash([5, 5]);
    rr(c3.x - w3 / 2, c3.y - h3 / 2, w3, h3, 10); ctx.stroke(); ctx.setLineDash([]);
    // 0.9.14：宠物本身住在这一格（顶上那只拿掉了）：没技能块时画它本身，脚下一条能量；刚被偷能量就抖一下、闪红
    const max = PG.energyMax(g, pt), dAge = petFx.drained && petFx.drained[pt.id] !== undefined ? clock - petFx.drained[pt.id] : 9;
    const shk = dAge < 0.5 ? Math.sin(clock * 60) * 4 * (1 - dAge * 2) : 0, pop = petFx.pop[pt.id] ? Math.max(0, 0.3 - (clock - petFx.pop[pt.id])) / 0.3 : 0;
    if (dAge < 0.5) { ctx.fillStyle = 'rgba(226,85,59,' + (0.45 - dAge * 0.9) + ')'; rr(c3.x - w3 / 2, c3.y - h3 / 2, w3, h3, 10); ctx.fill(); }
    if (!g.hand[3] && !petOut(pt.id)) petIcon(pt.id, c3.x + shk, c3.y - 10, Math.min(w3, h3) * 0.62, 0, pop);
    // 0.9.20「危险」的比划（Cc 定 A 炸毛盯着）：有墨怪下一手就要走（冒脚印了），宠物一圈尖刺炸开、抖一下
    if (g.mon && g.mon.some((m) => m && m.step !== undefined && m.step !== null)) { const rr0 = Math.min(w3, h3) * 0.36; ctx.fillStyle = 'rgba(226,85,59,' + (0.55 + Math.sin(clock * 14) * 0.3) + ')'; for (let n = 0; n < 10; n++) { const an = (n / 10) * Math.PI * 2 + Math.sin(clock * 20) * 0.05; const bx0 = c3.x + Math.cos(an) * rr0, by0 = c3.y - 10 + Math.sin(an) * rr0; ctx.beginPath(); ctx.moveTo(bx0 + Math.cos(an + 0.25) * 2, by0 + Math.sin(an + 0.25) * 2); ctx.lineTo(bx0 + Math.cos(an) * 9, by0 + Math.sin(an) * 9); ctx.lineTo(bx0 + Math.cos(an - 0.25) * 2, by0 + Math.sin(an - 0.25) * 2); ctx.fill(); } }
    const bw = w3 - 18, seg = (bw - (max - 1) * 2) / max, by = c3.y + h3 / 2 - 14;
    for (let k = 0; k < max; k++) { ctx.fillStyle = COL.ink; rr(c3.x - bw / 2 + k * (seg + 2) - 1, by - 1, seg + 2, 8, 3); ctx.fill(); ctx.fillStyle = g.rush || k < Math.min(max, pt.energy) ? col[1] : COL.woodDark; rr(c3.x - bw / 2 + k * (seg + 2), by, seg, 6, 3); ctx.fill(); }
    if (!g.hand[3]) buttons.push({ id: 'petSlot', x: c3.x - w3 / 2, y: c3.y - h3 / 2, w: w3, h: h3, fn: () => showInfo({ pet: pt.id }) });
  }
  for (let i = 0; i < 4; i++) {
    const p = g.hand[i];
    if (p !== handSeen[i]) { handSeen[i] = p; if (p) { handAt[i] = clock + (i < 3 ? i * 0.07 : 0); if (i === 0 && mode === 'play' && g && g.moves > 0) P.sound('deal', 0.45); } } // 0.9.18 发新块：轻「唰」 // 发新块：从托盘下面一块块滑上来（0.9.13，Cc：「所有只要动了我们玩家的东西，就全都需要用动画来做」）
    if (!p || (drag && drag.slot === i)) continue;
    const ha = Math.min(1, Math.max(0, (clock - (handAt[i] || -9)) / 0.28)), he = 1 - Math.pow(1 - ha, 3);
    if (ha <= 0) continue;
    ctx.save(); ctx.globalAlpha = he; ctx.translate(0, (1 - he) * 70);
    const c = slotCenter(i);
    const fits = i === 3 ? true : core.anyPlacement(g.board, p);
    // 0.9.12 的「快堵死预告」（描红边、发抖）删了：Cc 11-26「有一个红框框住我一格子，这是干嘛用的？……我明明放得下呀」——看不懂的提示等于没有
    const tight = false;
    const pv = rushShow(i, p);
    const s = i === 3 ? Math.min(L.mini * 1.5, SLOT3W() - 26, L.trayH - 26) : Math.min(L.mini, (slotW() - 20) / pv.w, (L.trayH - 16) / pv.h);
    const sx = tight ? Math.sin(clock * 28) * 1.6 : 0;
    if (tight) { ctx.strokeStyle = 'rgba(226,85,59,' + (0.55 + Math.sin(clock * 8) * 0.3) + ')'; ctx.lineWidth = 2; rr(c.x - (p.w * s) / 2 - 5 + sx, c.y - (p.h * s) / 2 - 5, p.w * s + 10, p.h * s + 10, 6); ctx.stroke(); }
    // 只剩技能块能用（三块都放不下）：技能块跳一跳、外面一圈光，告诉玩家「拖它」（0.9.14，Fable debug 报告：不然三块全灰像卡死了）
    const onlySkill = i === 3 && !g.over && ![0, 1, 2].some((j) => g.hand[j] && core.anyPlacement(g.board, g.hand[j]));
    // 0.9.20 卡住提示第一级（Cc 11-27 第 13 件之⑤定 A）：12 秒没碰屏幕，托盘里第一块放得下的块跳一跳
    const idle = mode === 'play' && g.pets && !g.over && !drag && !g.rush && P.now() - Math.max(lastTouchMs, g.startMs || 0) > 12000;
    const hopMe = idle && i < 3 && fits && [0, 1, 2].find((j) => g.hand[j] && core.anyPlacement(g.board, g.hand[j])) === i;
    const bounce = onlySkill || hopMe ? -Math.abs(Math.sin(clock * 6)) * 10 : 0;
    if (onlySkill) { ctx.strokeStyle = 'rgba(243,210,122,' + (0.5 + Math.sin(clock * 6) * 0.4) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c.x, c.y + bounce, s * 0.9, 0, Math.PI * 2); ctx.stroke(); }
    drawPiece(pv, c.x + sx, c.y + Math.sin(clock * 3 + i) * 1.5 + bounce, s, fits ? 1 : 0.28, handColor(i));
    if (i === 3 && p.uses > 1) { ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(c.x + s * 0.55, c.y - s * 0.55, 10, 0, Math.PI * 2); ctx.fill(); text('×' + p.uses, c.x + s * 0.55, c.y - s * 0.55 + 1, 11, '#fff'); } // 啃：还剩几口
    ctx.restore();
  }
  // 火麒麟的灯（0.9.12）：一直照着下一批的头几块，画在托盘下面
  // 爆竹鼠的技能块悬在托盘某一块上：那块放大、抬到托盘上方，对准的那格亮牙印（啃了会断成两截的格子打灰叉）
  if (drag && drag.slot === 3) {
    const h = handHover(drag);
    if (h) {
      const q = g.hand[h.hand], o = bigHandOrigin(h.hand), ok = !!g.skillPlan(h);
      ctx.fillStyle = 'rgba(10,12,28,0.75)'; rr(o.x - 8, o.y - 8, q.w * L.cell + 16, q.h * L.cell + 16, 10); ctx.fill();
      drawPiece(q, o.x + (q.w * L.cell) / 2, o.y + (q.h * L.cell) / 2, L.cell, 1, handColor(h.hand));
      const [r0, c0] = q.cells[h.cell], tx = o.x + c0 * L.cell, ty = o.y + r0 * L.cell;
      ctx.strokeStyle = ok ? COL.red : 'rgba(200,205,215,0.9)'; ctx.lineWidth = 4;
      if (ok) { ctx.strokeRect(tx + 3, ty + 3, L.cell - 6, L.cell - 6); ctx.fillStyle = COL.red; for (let n = 0; n < 3; n++) { ctx.beginPath(); ctx.moveTo(tx + L.cell * (0.2 + n * 0.22), ty + 4); ctx.lineTo(tx + L.cell * (0.31 + n * 0.22), ty + L.cell * 0.3); ctx.lineTo(tx + L.cell * (0.42 + n * 0.22), ty + 4); ctx.fill(); } }
      else { ctx.beginPath(); ctx.moveTo(tx + 8, ty + 8); ctx.lineTo(tx + L.cell - 8, ty + L.cell - 8); ctx.moveTo(tx + L.cell - 8, ty + 8); ctx.lineTo(tx + 8, ty + L.cell - 8); ctx.stroke(); }
    }
  }
  if (drag && g.hand[drag.slot]) {
    const p = g.hand[drag.slot];
    drawPiece(p, drag.x, drag.y - (p.special === 'skill' ? SKL() : liftOf(p)), L.cell, 0.95, handColor(drag.slot));
    // 啃手上：对准的那一格再描一圈在最上面（不然被手里的技能块挡住）
    const h = drag.slot === 3 ? handHover(drag) : null;
    if (h) { const q = g.hand[h.hand], o = bigHandOrigin(h.hand), [r0, c0] = q.cells[h.cell], ok = !!g.skillPlan(h); ctx.strokeStyle = ok ? COL.red : 'rgba(200,205,215,0.9)'; ctx.lineWidth = 4; ctx.setLineDash(ok ? [] : [6, 4]); ctx.strokeRect(o.x + c0 * L.cell + 2, o.y + r0 * L.cell + 2, L.cell - 4, L.cell - 4); ctx.setLineDash([]); }
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
  if (mofei.say && clock - mofei.sayT < 1.4 && !(wordsOff() && HAS_WORDS.test(mofei.say))) {
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
// 新手引导要演示的那一手：第一块放下去消得最多的位置（同样多取最上、最左）；放不下就不演
let tutCache = null;
function tutorialTarget() {
  const p = g && g.hand[0];
  if (!p) return null;
  const key = g.board.join('') + p.id;
  if (tutCache && tutCache.key === key) return tutCache.tg;
  let best = null;
  for (const [r, c] of core.placements(g.board, p)) { const n = core.placeAndClear(g.board, p, r, c).units.length; if (!best || n > best.n) best = { r, c, n }; }
  tutCache = { key, tg: best };
  return best;
}
// 看完广告救命（0.9.17 起清最挤的 3 个大格，见 petgame.js g.revive）：清掉的格子一格格碎掉飞走，闪一下、震一下（0.9.13，Cc：「看了广告清空正中间，需要给我一个动画反馈」）
function reviveFx() {
  const before = g.board.slice();
  // 0.9.14 修（Cc 11-26：看广告清空中间后又堵死，结算页不弹、卡死）：复活等于把这次「输」收回——
  // 结过的账、记过的那一行、连输次数都退回去，下次再输重新结账；不然结算页拿不到结果，画到一半出错卡住
  if (g.pets) {
    if (g._settled && !g.won) { save.loss = save.loss || {}; if (save.loss[petIdx] > 0) save.loss[petIdx]--; }
    if (g._logged && g._logRow !== undefined && g._logRow === (save.playLog || []).length - 1) save.playLog.pop();
    g._settled = false; g._logged = false; g._logRow = undefined; g._settleInfo = null; g._overSeen = undefined;
    T.rec('a', 'revive'); persist();
  }
  g.revive();
  const gone = []; for (let k = 0; k < 81; k++) if (before[k] && !g.board[k]) gone.push(k);
  gone.forEach((k, j) => {
    clearing.push({ k, t: clock + j * 0.04 });
    const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2;
    for (let n = 0; n < 5; n++) { const a2 = Math.random() * Math.PI * 2, v = 80 + Math.random() * 140; fx.push({ kind: 'shard', x, y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 120, t: clock + j * 0.04, life: 0.6, s: 3 + Math.random() * 4 }); }
  });
  if (gone.length) { rings.push({ t: clock, big: true }); flash = Math.max(flash, 0.35); shake = Math.max(shake, 8); P.sound('combo3', 0.8); haptic('heavy'); }
  handSeen = [null, null, null, null]; // 换过的块也滑上来
}
// 试玩「记一下」（0.9.13，Cc 11-26：「在界面最左下角放一个截图或快速记录的按键……复制报告时，它能将这些内容全部以文字形态描述并一起发送给你」）
// 点一下：可以写一句话（不写也行），把这一刻的样子用文字记进试玩记录（代号 S），复制记录时一起带走
let snapFlash = -9, snapCount = 0;
const MCH = { ink: 'm', shell: 'S', jump: 'J', eat: 'E', color: 'C', moss: 'O', bomb: 'K', split: 'P' };
function snapState() {
  const out = { mode, ver: VERSION };
  if (g && g.pets) {
    const rows = [];
    for (let r = 0; r < 9; r++) { let ln = ''; for (let c = 0; c < 9; c++) { const k = r * 9 + c, v = g.board[k]; ln += v === CELL.EMPTY ? '.' : v === CELL.BLOCK ? (g.color[k] === -2 ? '~' : String(g.color[k] >= 0 ? g.color[k] : '#')) : v === CELL.CHEST ? 'X' : v === CELL.MON ? ((g.mon[k] && MCH[g.mon[k].t]) || 'm') : v === CELL.BOSS ? 'B' : v === CELL.ROCK ? 'R' : '?'; } rows.push(ln); }
    Object.assign(out, { lv: g.stage && g.stage.evolve ? 'evo' : petIdx + 1, moves: g.moves, wave: (g.waveNo || 0) + '/' + (g.waveTotal || 0), over: !!g.over, board: rows,
      hand: g.hand.slice(0, 3).map((p) => (p ? p.id : '-')), skill: g.hand[3] ? g.hand[3].kind + (g.hand[3].uses > 1 ? '×' + g.hand[3].uses : '') : '-',
      pets: g.team.map((t) => t.id + ' ' + t.lv + '级 能量' + t.energy + '/' + PG.energyMax(g, t)), left: g.goalLeft() });
  }
  out.save = { stage: save.petStage, dan: save.dan, pets: save.petOrder.map((id) => id + ' ' + (save.pets[id] ? save.pets[id].lv : '?') + '级').join('、'), loss: save.loss && save.loss[petIdx] };
  return out;
}
function snapNow() {
  const st = snapState(); // 先拍下来（写字的时候游戏不动，但保险起见先拍）
  snapFlash = clock; P.sound('select', 0.6); haptic('light');
  P.askText('记一下', '哪里不对或想说什么？（可以不写）', (note) => { if (note === null) return; st.note = note; T.rec('S', st); snapCount++; T.flush(); });
}
function drawSnapButton() {
  if (mode === 'cut' || mode === 'ad' || mode === 'logpages') return;
  const x = 8, y = H - 50, w = 44, h = 44;
  const a = clock - snapFlash;
  ctx.fillStyle = 'rgba(20,24,48,0.75)'; rr(x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = a < 0.4 ? COL.brassLight : 'rgba(243,210,122,0.45)'; ctx.lineWidth = 2; rr(x + 0.5, y + 0.5, w - 1, h - 1, 12); ctx.stroke();
  // 一支小笔：一眼是「记一下」，不用字
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-0.7);
  ctx.fillStyle = COL.brassLight; ctx.fillRect(-3, -12, 6, 18); ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(3, 6); ctx.lineTo(0, 12); ctx.fill();
  ctx.fillStyle = COL.red; ctx.fillRect(-3, -15, 6, 4); ctx.restore();
  if (snapCount) { ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(x + w - 4, y + 4, 8, 0, Math.PI * 2); ctx.fill(); text(String(snapCount), x + w - 4, y + 5, 10, '#fff'); }
  if (a < 0.5) { ctx.fillStyle = 'rgba(255,255,255,' + (0.5 - a) + ')'; ctx.fillRect(0, 0, W, H); } // 拍照一闪
  buttons.push({ id: 'snap', x, y, w, h, fn: snapNow, label: '记一下' });
}
// 点墨怪 / 铁石 / 机关匣 / 头目 / 目标图标 / 宠物格：冒一个小气泡，画出它是什么、会干什么、谁克它（0.9.14，Cc：「我长按或点击它的时候，应该能告诉我这个怪物是什么效果，以及什么宠物克制它」）
let info = null; // { what, k?, t }
const MON_INFO = { ink: ['小墨怪', '消掉它那一排就抓到', null], shell: ['甲壳怪', '有甲，消一次掉一层；会偷能量', 'shell'], jump: ['跳跳怪', '隔几手跳一格；会偷能量', 'jump'], eat: ['馋嘴怪', '会啃掉你的块；会偷能量', 'eat'],
  color: ['挑色怪', '那一排要有它的颜色才消得掉', 'color'], moss: ['墨苔怪', '会往空格里长墨；会偷能量', 'moss'], bomb: ['炸弹怪', '数到 0 就炸，炸光能量', 'bomb'], split: ['分身怪', '打它会裂成两只', 'split'] };
function showInfo(o) { info = Object.assign({ t: clock }, o); P.sound('tap', 0.4); haptic('light'); }
function drawInfo() {
  if (!info || mode !== 'play' || clock - info.t > 3.5) { if (info && clock - info.t > 3.5) info = null; return; }
  let pic = null, name = '', line = '', pets = [];
  const k = info.k;
  if (info.pet) { const pt = g.team.find((x) => x.id === info.pet) || { lv: 1 }; name = PG.PETS[info.pet].name + ' Lv' + pt.lv; line = ''; pic = () => petIcon(info.pet, 0, 0, 40, 0, 0); }
  else if (k !== undefined && g.board[k] === CELL.MON && g.mon[k]) { const m = g.mon[k], mi = MON_INFO[m.t] || MON_INFO.ink; name = mi[0]; line = mi[1]; pets = []; pic = () => drawMon(m, -1, 0, 0, 18);
    if (g.stage.crawl && (m.t === 'ink' || m.t === 'moss')) { pets = []; pic = () => introPic(m.t === 'moss' ? 'moss' : 'crawl', 70, 2, 150); }
    if (m.t === 'sticky') { pets = []; pic = () => introPic('sticky', 70, 2, 150); } } // 0.9.20 无字：气泡里放它干什么的小动画（会爬 / 爬过留墨）；第一章宠物不抓怪，不画「克它」
  else if (k !== undefined && g.board[k] === CELL.METAL) { pic = () => introPic('metal', 70, 2, 150); }
  else if (k !== undefined && g.board[k] === CELL.DIRT) { pic = () => introPic('dirt', 70, 2, 150); }
  else if (k !== undefined && g.board[k] === CELL.BOSS) { const bk = (g.boss && g.boss.kind) || 'spit'; name = (BOSS_CARD[bk] || {}).name || '大墨怪'; line = '它那一排每消一次，打掉一颗心'; pic = () => { inkMonster(0, 0, 18, true); bossDress(bk, 0, 0, 18); }; }
  else if (info.goal) { const key = info.goal; pic = () => goalIcon(key, 0, 0, 30); name = key === 'lines' ? '消掉几排' : key === 'monster' || key === 'all' ? '抓墨怪' : key === 'rock' ? '打碎铁石' : key === 'boss' ? '打倒头目' : key === 'box' ? '收机关匣' : '收宝石'; line = key === 'lines' ? '凑满一排、一竖或一个大格就消掉' : key === 'rock' ? '只有宠物的技能打得碎' : key === 'boss' ? '它那一排每消一次，掉一颗心' : '消掉它们那一排就收走'; }
  else { info = null; return; }
  const bw = Math.min(W - 24, 300), bh = pets.length ? 96 : 70, bx = (W - bw) / 2;
  let by = L.by + 8; if (k !== undefined && Math.floor(k / 9) < 4) by = L.by + L.board - bh - 8; // 别挡住点的那一格
  const a = Math.min(1, (clock - info.t) * 6, (3.5 - (clock - info.t)) * 3);
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(12,16,36,0.95)'; rr(bx, by, bw, bh, 14); ctx.fill(); ctx.strokeStyle = COL.brassLight; ctx.lineWidth = 2; rr(bx + 1, by + 1, bw - 2, bh - 2, 14); ctx.stroke();
  ctx.save(); ctx.translate(bx + 34, by + 35); pic(); ctx.restore();
  text(name, bx + 64, by + 22, 16, COL.brassLight, 'left');
  text(line, bx + 64, by + 46, 12, COL.text, 'left', 'normal');
  if (pets.length) { text('克它', bx + 64, by + 74, 12, COL.dim, 'left', 'normal'); pets.forEach((id, n) => { const own = ownedOf(id); ctx.globalAlpha = a * (own ? 1 : 0.35); petIcon(own || id, bx + 108 + n * 34, by + 74, 26, 0, 0); }); ctx.globalAlpha = a; }
  if (k !== undefined) { ctx.strokeStyle = COL.brassLight; ctx.lineWidth = 3; ctx.strokeRect(cellX(k % 9) + 1, cellY(Math.floor(k / 9)) + 1, L.cell - 2, L.cell - 2); }
  ctx.restore();
}
// 一只点屏幕的手（图形引导用）：指尖在 (x, y)，tap 0–1 = 按下去的程度
function drawHand(x, y, tap) {
  const d = (tap || 0) * 6;
  ctx.save(); ctx.globalAlpha = 0.95;
  ctx.fillStyle = COL.steam; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + 10, y + 22 + d, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillRect(x + 5, y + d, 9, 22); ctx.strokeRect(x + 5, y + d, 9, 22);
  if (tap > 0.6) { ctx.strokeStyle = 'rgba(243,210,122,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 9, y, 14 + (tap - 0.6) * 30, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}
function drawTutorial() {
  const siegeTut = g && g.siege && g.firstRun && g.phase === 'play';
  const petTut = g && g.pets && petIdx === 0 && !save.petTutDone;
  if ((save.tutorialDone && !siegeTut && !petTut) || !g || g.moves > 0 || drag || !g.hand[0]) return;
  // 手指动画：把第一块拖到「放下去消得最多」的地方（0.9.12 起照当前盘面算，不再写死「3×3 放中宫」——新的第 1 关中宫是堵着的，Cc：「中间那个格子是被卡住的」）
  const tg = tutorialTarget();
  if (!tg) return;
  tutorialT += 1 / 60;
  const a = (tutorialT % 2.2) / 1.6;
  const from = slotCenter(0);
  const to = fingerFor(g.hand[0], tg.r, tg.c);
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

function drawOver() {
  return drawPetOver(); // 0.9.25 只剩宠物关
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

// ---------- 章页（0.8，照 ../九宫消_关卡页专属关与UI对照_20261124.md 第二节；学《小丑牌》「全部亮出来、只有当前那个能点」） ----------
// 一章一页：9 个普通关摆成 3×3（左到右、上到下），下面一张头目大卡，再下面「先练谁」和「开打」。
// Cc 11-24：「一次显示几关……提前看到这一页里一共有几关、最后一关的 Boss 是什么、有什么技能，以及需要哪个宠物特殊出战」
const BOSS_CARD = {
  spit: { name: '大墨怪', does: '每 4 手吐一团墨', fear: '吐完晕了，快打' },
  eat: { name: '大馋嘴', does: '每 3 手啃你两块', fear: '它在嚼的时候，快打' },
  split: { name: '分身王', does: '挨一下蹦一只小怪', fear: '小怪抓光，它就抖' },
  mud: { name: '泥沼怪', does: '每 3 手往托盘里吐泥', fear: '每挨 3 下跳一次' }, // 0.9.20 第二章头目
};
const MON_KEY = { m: 'ink', A: 'shell', B: 'shell', C: 'shell', J: 'jump', E: 'eat', G: 'moss', T: 'bomb', S: 'split', N: 'sticky' };
const MON_INTRO = { ink: 'monster', shell: 'shell', jump: 'jumper', eat: 'eat', color: 'color', moss: 'moss', bomb: 'bomb', split: 'split', sticky: 'sticky' };
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
  // 段 3（R-057）：不再点名，原来「① 前面最近的专属关点名的那只」那一条跟着拿掉
  const cnt = {};
  for (let i = Math.max(lo, cur); i < hi; i++) { const own = ownedOf(PLV[i].best); if (own) cnt[own] = (cnt[own] || 0) + 1; }
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
    // 段 2：✓ 换成这关最好亮过几个丹槽；今天重打还能拿丹，右上角亮一颗小丹
    const bst = (save.slots && save.slots[i] && save.slots[i].s) || 0;
    if (bst) for (let n = 0; n < 3; n++) danSlot(x + w / 2 + (n - 1) * 14, y + h - 12, 5, 1, n < bst);
    else text('✓', x + w - 14, y + 14, 16, TH.jade);
    if (EC.replayOpen(save, i, today(), PLV[i])) danOrb(x + w - 12, y + 13, 6 + Math.sin(clock * 3 + i) * 0.6);
  } else {
    const future = i > cur;
    ctx.save(); if (future) ctx.globalAlpha = 0.7;
    ctx.fillStyle = isCur ? TH.cardOn : TH.card; rr(x, y, w, h, TH.rCell); ctx.fill();
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
    // 宠物：建议的小头像（段 3：专属关的大头像跟着「点名」拿掉）
    if (st.best && ownedOf(st.best)) petIcon(ownedOf(st.best), x + w - 14, y + h - 14, 18, 0, 0);
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
  const pid = ownedOf(st.best);
  if (pid) { petIcon(pid, x + w - 34, y + h / 2 - 8, 32, 0, 0); text('最顺', x + w - 34, y + h / 2 + 24, 11, COL.dim, 'center', 'normal'); }
  buttons.push({ id: 'preview', x, y, w, h, fn: () => { if (i < save.petStage || i === Math.min(save.petStage, PLV.length - 1) || save.tester) newPetLevel(i); else chapSel = Math.floor(i / 10) * 10 + 9; } }); // 0.9.21 点预告卡就进这一关（Cc：「直接就点那个“下一关预告”……成为“下一关”」）
}
function drawChapter() {
  drawBg();
  const cur = Math.min(save.petStage, PLV.length - 1), done = save.petStage >= PLV.length;
  const lastCh = Math.floor((PLV.length - 1) / 10), curCh = done ? lastCh : Math.floor(cur / 10);
  if (chapView === null) chapView = curCh;
  const ch = chapView, lo = ch * 10, locked = ch > curCh && !save.tester;
  // 默认选中：本章是当前关；别的章选头目（下面显示头目卡）；锁住的章不选
  if (chapSel === null || (Math.floor(chapSel / 10) !== ch && chapSel >= 0)) chapSel = locked ? -1 : ch === curCh && !done ? cur : lo + 9;
  const top = uiTop(), info = { cur, done, locked, ch };
  // 顶栏：返回主菜单、章名（两边翻章）、设置
  button('home', 8, top, 92, 44, '‹ 主菜单', { fn: () => { mode = 'home'; } });
  button('settings', W - 56, top, 44, 44, '', { bg: COL.wood, fn: () => { settingsAsk = 0; settingsFrom = 'map'; mode = 'settings'; } });
  gearIcon(W - 34, top + 22, 9, clock * 0.4, COL.dim);
  text(CHAPTER_NAMES[ch] || '第 ' + (ch + 1) + ' 章', W / 2, top + 22, 20, COL.brassLight);
  // 0.9.14 debug：翻章的两个箭头不压在「‹ 主菜单」和齿轮上（390 宽的手机上「‹」有一半叠在「主菜单」上，点「主菜单」右半边会翻到上一章）
  if (ch > 0) button('chPrev', Math.max(W / 2 - 134, 8 + 92 + 4), top + 4, 30, 36, '‹', { fn: () => { chapView = ch - 1; chapSel = null; } });
  if (ch < (save.tester ? lastCh : Math.min(lastCh, curCh + 1))) button('chNext', Math.min(W / 2 + 104, W - 56 - 30 - 4), top + 4, 30, 36, '›', { kind: 'link', fn: () => { chapView = ch + 1; chapSel = null; } });
  // 进度点：9 小 1 大
  for (let n = 0; n < 10; n++) {
    const i = lo + n, x = W / 2 - 66 + n * 13 + (n === 9 ? 3 : 0), r = n === 9 ? 5 : 3;
    ctx.fillStyle = i < save.petStage ? TH.brass : i === cur && !done ? TH.jade : TH.line;
    ctx.beginPath(); ctx.arc(x, top + 52, r, 0, Math.PI * 2); ctx.fill();
  }
  // 段 2：顶上的总星、总分删了（丹细设计附录 A）
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
      const bp = bestOwnedFor(bst); // 段 3：头目卡「带谁最顺」读 bestPetFor（盘上有金属 → 小铜雀，有土堆 → 小穿山甲；自己有的才画）
      if (bp) { petIcon(bp, bx + bw - 30, bossY + bossH / 2 - 6, 30, 0, 0); text('最顺', bx + bw - 30, bossY + bossH / 2 + 20, 11, COL.dim, 'center', 'normal'); }
      if (bi < save.petStage) { ctx.save(); ctx.translate(fx, fy); ctx.rotate(-0.25); ctx.strokeStyle = TH.red; ctx.lineWidth = 3; rr(-34, -14, 68, 28, 6); ctx.stroke(); text('打倒了', 0, 0, 16, TH.red); ctx.restore(); }
    }
    if (!locked) buttons.push({ id: 'cell' + bi, x: bx, y: bossY, w: bw, h: bossH, fn: () => { chapSel = bi; P.sound('tap', 0.4); } });
  }
  // 先练谁（没话说就不出现）：点它去营地
  if (train) {
    const tw = rT.w, th = rT.h, tx0 = rT.x, mid = trainY + th / 2, rec = save.pets[train.id], need = EC.EXP_NEED[rec.lv] || 999;
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
  // 宠物园入口（0.9.16）：开打按钮左边一格，画出带的宠物；有丹可喂就冒红点、发光
  const gW = save.petOrder.length ? 60 : 0;
  if (gW) {
    const gid = save.activePet || save.petOrder[0], can = canLevelAny();
    button('chGarden', rP.x, btnY, gW - 8, rP.h, '', { kind: 'sub', hot: can, fn: () => openCamp() });
    petIcon(gid, rP.x + (gW - 8) / 2, btnY + rP.h / 2, Math.min(40, rP.h - 8), 0, can ? Math.max(0, Math.sin(clock * 5)) * 0.15 : 0);
    if (can) { ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(rP.x + gW - 14, btnY + 6, 7, 0, Math.PI * 2); ctx.fill(); }
  }
  // 0.9.21（Cc 11-27：「我选了第 16 关之后，按 play 还是自动往后面玩……怎么能重玩之前玩过的第 16 关呀？」）：选中哪一关就玩哪一关；打过的关、测试员模式下所有关都能玩
  const canPlay = (i) => i >= 0 && i < PLV.length && (i < save.petStage || i === cur || save.tester);
  const pick = canPlay(chapSel) ? chapSel : done ? -1 : cur;
  if (pick < 0) button('play', rP.x + gW, btnY, rP.w - gW, rP.h, '全部过关 · 新关卡在做', { kind: 'sub', size: 16, fn: () => {} });
  else {
    button('play', rP.x + gW, btnY, rP.w - gW, rP.h, (pick === cur && !done ? '继续' : '再玩') + ' · 第 ' + (pick + 1) + ' 关', { size: 20, fn: () => newPetLevel(pick) });
  }
  // 底栏去掉了（0.9.7，Cc 11-25：「经典拼画有啥用啊？……画册有啥用啊？……营地有啥用啊？……这都删了吧」）。过关后照旧回营地那一页；给宠物升级还能从上面「先练谁」进
}

// ---------- 新东西的说明卡（一张小动画 + 一两行字 +「继续」） ----------
const INTRO = {
  gem: { title: '收集宝石', lines: ['把它那一排消掉，就收走'], row: ['b', 'g', 'b', '.', 'b'], key: 'b' },
  box: { title: '机关匣', lines: ['它那一排每消一次，收一个'], row: ['b', 'M', 'b', '.', 'b'], key: 'box' },
  bubble: { title: '泡泡', lines: ['块放上去，再消掉，泡泡就破'], row: ['b', 'b', '*', 'b', 'b'], key: 'bubble' },
  // 0.5 宠物线
  monster: { title: '小墨怪', lines: ['消掉它那一排，就抓到它'], row: ['b', 'm', 'b', '.', 'b'], key: 'monster' },
  pet: { title: '铜雀出战', lines: ['啄掉这一排最近的 2 格'], pet: 'tongque' },
  gold: { title: '金色能让它攒得更快', lines: ['消金色的块，攒得更快'], pet: 'tongque', glow: true },
  rock: { title: '铁石', lines: ['只有宠物的技能打得碎'], rockPic: true },
  boss: { title: '大墨怪', lines: ['凑满穿过它的一排，打掉一颗心', '每挨 3 下它跳走，先亮红框'], custom: true },
  // 0.9.17 新版第一章的说明卡：代码画的小动画 + 一两行短字（美术这一版全用代码占位，Cc 11-27）
  catch: { title: '抓墨怪', lines: ['凑满它那一排，就抓到它'], row: ['b', 'm', 'b', '.', 'b'], key: 'monster' },
  crawl: { title: '墨怪会爬', lines: ['先冒脚印，下一手走过去', '块放在脚印上，就堵住它'], custom: true },
  metal: { title: '金属', lines: ['凑满了它也不消', '铜雀的技能块啄得碎'], custom: true },
  rush: { title: '冲锋关', lines: ['每块都有地方放，一放就消', '越快丹越多，慢了也不会输'], custom: true }, // 段 2：星换成丹（「慢了也不会输」0.9.24 起已经不对，待 Cc 定字时一起改）
  dirt: { title: '一堆土', lines: [''], custom: true },
  sticky: { title: '粘墨怪', lines: [''], custom: true },
  baozhu: { title: '爆竹鼠出战', lines: ['啃掉手上那块的 1 格'], pet: 'baozhu' },
  modou: { title: '墨斗蚕出战', lines: ['吐丝补上 1 个空格'], pet: 'modou' },
  gempiece: { title: '块上的宝石', lines: ['放下去，再消掉那一排'], row: ['b', 'b', 'b', '.', 'b'], key: 'b' },
  shell: { title: '甲壳怪', lines: ['铜雀一口连壳叼走'], monPic: { t: 'shell', hp: 2 } },
  eat: { title: '馋嘴怪', lines: ['会啃你的块 · 墨斗蚕克它'], monPic: { t: 'eat', tgt: 1 } },
  color: { title: '挑色怪', lines: ['同色的宠物克它'], monPic: { t: 'color', col: 1 } },
  moss: { title: '墨苔怪', lines: ['爬过的地方留一块墨', '墨块碍事，用铜雀啄掉'], custom: true },
  bomb: { title: '炸弹怪', lines: ['到 0 就炸 · 火麒麟克它'], monPic: { t: 'bomb', cd: 3 } },
  split: { title: '分身怪', lines: ['打它会分身 · 爆竹鼠克它'], monPic: { t: 'split' } },
  boss2: { title: '泥沼怪', lines: [''], custom: true },
  boss3: { title: '分身王', lines: ['会冒小墨怪 · 爆竹鼠克它'], bossPic: 'split' },
  jumper: { title: '跳跳怪', lines: ['会跳 · 爆竹鼠克它'], jumperPic: true },
  wave: { title: '墨怪一波一波来', lines: ['抓光一波，下一波冒出来'], row: ['b', 'm', 'b', '.', 'b'], key: 'monster' },
  sanweihu: { title: '火麒麟出战', lines: ['照亮下一批 · 火星烧 1 格'], pet: 'sanweihu' },
  steal: { title: '墨怪会偷能量', lines: ['紫闪电 = 要偷能量 · 克它的不怕'], monPic: { t: 'shell', hp: 1 } },
  acts: { title: '让宠物多出手', lines: ['宠物出手几次才过关'], pet: null, actsPic: true },
};
// 关卡卡片：第几关、难不难、目标、谁出战（被点名换人时演一下换人），点「开打」进关
// 0.9.21 冲锋关进关前（关牌、选宠物）：整个画面跟着鼓点一下一下抖、发热（Cc 11-27：「效果能不能做的不一样一点？让整个界面都在抖动」）
// 0.9.23 冲锋关泛的光照这一章的五行颜色（Cc 11-27：「那局爽关犯的光，是跟那一关五行颜色相匹配的光」；先说了「泛蓝光……不要泛红光」）
// 五行本色：金白、土黄、木青、火赤、水蓝（第一章金、第二章土、第三章木、第四章火、第五章水）
const RUSH_GLOW = [[236, 242, 255], [240, 184, 64], [96, 214, 140], [255, 106, 58], [74, 140, 255], [190, 150, 255]];
const rushGlow = (i) => RUSH_GLOW[Math.min(RUSH_GLOW.length - 1, Math.floor((i === undefined ? petIdx : i) / 10))];
function rushPhase() { const b = P.bgm.beat ? P.bgm.beat() : null; return b === null ? (clock * 2.4) % 1 : b; } // 跟着音乐的拍子；没音乐就照冲锋关的速度自己打拍
function rushCardBeat() {
  if (mode !== 'start' || !startCard || !PLV[startCard.i] || !PLV[startCard.i].rush) return null;
  const ph = rushPhase(), pulse = Math.pow(1 - ph, 3), amp = 4.5 * pulse;
  return { x: Math.sin(clock * 61) * amp, y: Math.cos(clock * 53) * amp * 0.7, pulse };
}
// 0.9.22 冲锋关打的时候：整个画面跟着同一个鼓点缓缓地一闪一闪（Cc 11-27：「整个屏幕也在缓缓地跟着节奏一起闪……跟外面的那个闪动节奏是一样的，跟着音乐走」）
function rushPlayPulse() { if (mode !== 'play' || !g || !g.rush || g.over) return 0; return Math.pow(1 - rushPhase(), 2.2); }
function drawStartCard() {
  const c = startCard, st = PLV[c.i], age = clock - c.t, ease = Math.min(1, age * 4);
  ctx.fillStyle = COL.shade + (0.78 * ease) + ')'; ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - 40, 330), ph = 340, px = (W - pw) / 2, py = (H - ph) / 2 - 20 + (1 - ease) * 30;
  ctx.save(); ctx.globalAlpha = ease;
  panel(px, py, pw, ph);
  text('第 ' + (c.i + 1) + ' 关', W / 2, py + 40, 28, COL.brassLight);
  if (wordsOff()) text(String(c.i + 1), W / 2, py + 40, 32, COL.brassLight); // 0.9.20 无字：只写关号
  // 段 2：关牌不放奖励（全量设计 172）：原来的「丹 2 颗」「丹 2–4 颗」「今天重打：丹 1 颗」删了
  const danTxt = '';
  // 0.9.20 无字：难关画两只红角、头目画头目头像、冲锋关画一根香
  { const iy = py + 72;
    const ix = W / 2;
    if (st.hard) { ctx.fillStyle = st.hard > 1 ? TH.violet : TH.red; for (const sx of [-1, 1]) { const hx = ix + sx * 7; ctx.beginPath(); ctx.moveTo(hx - 4, iy + 7); ctx.lineTo(hx + sx * 5, iy - 8); ctx.lineTo(hx + 4, iy + 7); ctx.fill(); } }
    else if (st.goal.boss) { inkMonster(ix, iy, 10, true); }
    else if (st.rush) { ctx.fillStyle = '#8a5a34'; ctx.fillRect(ix - 16, iy - 2, 32, 4); ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.arc(ix - 16, iy, 4, 0, Math.PI * 2); ctx.fill(); } }
  if (st.hard) text((st.hard > 1 ? '超难关' : '难关') + (danTxt ? ' · ' + danTxt : ''), W / 2, py + 70, 13, st.hard > 1 ? '#c58ae0' : '#f08a70');
  else if (st.goal.boss) text(BOSS_CARD[st.bossKind || 'spit'].name + (danTxt ? ' · ' + danTxt : ''), W / 2, py + 70, 13, '#f08a70');
  else if (st.rush) text('冲锋关 · 越快丹越多' + (danTxt ? ' · ' + danTxt : ''), W / 2, py + 70, 13, COL.jade);
  else if (danTxt) text(danTxt, W / 2, py + 70, 13, COL.dim);
  const bst0 = (save.slots && save.slots[c.i] && save.slots[c.i].s) || 0; // 段 2：最好那次亮过几个丹槽
  if (bst0) for (let n = 0; n < 3; n++) danSlot(W / 2 + (n - 1) * 16, py + 88, 6, 1, n < bst0);
  // 目标
  const keys = Object.keys(st.goal), cw = 76, gx0 = W / 2 - (cw * keys.length) / 2;
  keys.forEach((key, n) => {
    const cx = gx0 + cw * n + cw / 2, cy = py + 110;
    if (key === 'score') { text(st.goal.score + ' 分', cx, cy, 20, COL.text); return; }
    goalIcon(key, cx - 20, cy, 26); if (key === 'boss') { for (let hh = 0; hh < Math.min(9, st.bigHp || 3); hh++) heart(cx + 2 + (hh % 5) * 11, cy - 6 + Math.floor(hh / 5) * 12, 5, true); } else rods(cx + 2, cy, st.goal[key], 16, 'left'); // 0.9.20 无字：头目画几颗心，别的画算筹
  });
  // 一共几波（0.9.14）：一波一个圆点
  const nW = PG.waveTotalOf(st); // 0.9.14 debug：原来数的是「后面还有几波」，比关里顶上的圆点少一个（3 波写成 2 波）
  if (nW > 1) { const gap = 20, wx0 = W / 2 - ((nW - 1) * gap) / 2 + 14; text(nW + ' 波', wx0 - 34, py + 146, 13, COL.dim); for (let k = 0; k < nW; k++) { ctx.fillStyle = COL.brassLight; ctx.beginPath(); ctx.arc(wx0 + k * gap, py + 146, 6, 0, Math.PI * 2); ctx.fill(); } }
  // 谁出战：不点名的关，进关前自己手选（0.9.14，Cc：「进入下一关之前，让我手选」）
  const pid = g.team[0] && g.team[0].id;
  if (pid && save.petOrder.length > 1) {
    const ids = save.petOrder, cw2 = Math.min(70, (pw - 30) / ids.length), x0 = W / 2 - (cw2 * (ids.length - 1)) / 2, pyy = py + 196;
    const rank = PG.bestPetFor(st);
    ids.forEach((id, n) => {
      const x = x0 + n * cw2, on = id === pid, sel = petFx.pop[id] ? Math.max(0, 0.3 - (clock - petFx.pop[id])) / 0.3 : 0;
      if (on) { ctx.fillStyle = 'rgba(243,210,122,0.22)'; rr(x - cw2 / 2 + 3, pyy - 30, cw2 - 6, 66, 12); ctx.fill(); ctx.strokeStyle = COL.brassLight; ctx.lineWidth = 2; rr(x - cw2 / 2 + 3, pyy - 30, cw2 - 6, 66, 12); ctx.stroke(); }
      ctx.globalAlpha = ease * (on ? 1 : 0.6); petIcon(id, x, pyy - 4, on ? 44 : 38, 0, sel); ctx.globalAlpha = ease;
      lvPips(x, pyy + 26, save.pets[id].lv, 30);
      // 段 3 规则 2 第 ⑤ 步（占位画法，正式的段 6）：教换宠物——一圈金光 + 一个小三角指着该点的那块圆牌：先指新来的，点了再指回原来那只
      const tch = save.switchTeach; if (tch && !tch.step && pid === tch.id) { tch.step = 1; tch.from = ids.find((x) => x !== pid); } // 新来的已经在出战：直接指回原来那只
      const tgt = tch && (tch.step ? tch.from : tch.id);
      if (tgt === id) { const a3 = 0.5 + Math.sin(clock * 6) * 0.4; ctx.strokeStyle = 'rgba(243,210,122,' + a3 + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, pyy - 4, 30 + Math.sin(clock * 6) * 2, 0, Math.PI * 2); ctx.stroke(); const fy = pyy + 44 + Math.abs(Math.sin(clock * 4)) * 6; ctx.fillStyle = COL.brassLight; ctx.beginPath(); ctx.moveTo(x, fy - 10); ctx.lineTo(x - 9, fy + 6); ctx.lineTo(x + 9, fy + 6); ctx.fill(); }
      buttons.push({ id: 'cardPet_' + id, x: x - cw2 / 2, y: pyy - 30, w: cw2, h: 66, fn: () => { if (id === pid) return; teachSwitchTap(id, pid); save.activePet = id; persist(); petFx.pop[id] = clock; P.sound('select', 0.6); haptic('light'); const nx = startCard.next; keepMusicOnce = true; newPetLevel(c.i); if (startCard) { startCard.t = clock - 1; startCard.next = nx; } } });
    });
  } else if (pid) {
    const pyy = py + 178;
    petIcon(pid, W / 2, pyy, 56, g.team[0].lv, 0);
    text(PG.PETS[pid].name + ' 出战', W / 2, pyy + 46, 16, COL.text);
  }
  ctx.restore();
  button('startGo', px + 24, py + ph - 70, pw - 48, 52, '开打', { size: 20, fn: () => { if (save.switchTeach) { delete save.switchTeach; persist(); } mode = c.next || 'play'; startCard = null; g.startMs = P.now(); P.sound('select', 0.6); if (g._fresh && save.freshPet && save.freshPet[g._fresh]) { delete save.freshPet[g._fresh]; persist(); } } });
}
// 教换宠物（段 3 规则 2 第 ⑤ 步）：点了新来的 → 再指回原来那只；点回原来那只 → 教完。点「开打」也算教完
function teachSwitchTap(id, from) {
  const tch = save.switchTeach; if (!tch) return;
  if (!tch.step && id === tch.id) { tch.step = 1; tch.from = from; } else if (tch.step && id === tch.from) delete save.switchTeach;
}
// 宠物登场卡：一段小动画把技能演一遍（0.9.13，Cc：「每个宠物的技能你要用图形动画来教学，全是字谁读啊」）。2.6 秒一轮
const SKILL_DEMO = { pet: 1, baozhu: 1, modou: 1, sanweihu: 1 };
function drawSkillDemo(pet, cx, cy, w) {
  const kind = PG.skillKind(pet), col = PG.PETS[pet].color, cs = Math.min(44, w / 6.2), a = (clock % 2.6) / 2.6;
  const x0 = cx - cs * 2.5, rowY = cy - cs * 0.55;
  const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const cellBg = (n, y) => { ctx.fillStyle = n % 2 ? COL.cellC : COL.cellD; ctx.fillRect(x0 + n * cs, y, cs, cs); };
  const tile = (x, y, s2) => { block(x - s2 / 2, y - s2 / 2, s2, 1, col, true); petIcon(pet, x, y, s2 * 0.8, 0, 0); };
  const start = { x: cx + cs * 2.2, y: cy + cs * 1.6 }; // 技能块从右下（宠物格）出发
  if (kind === 'peck' || kind === 'fire') {
    // 一排：块、墨怪、空、块、墨怪；技能块落到中间 → 啄掉最近的两样（火：烧掉点中的那一格）
    const row = kind === 'peck' ? ['b', 'm', '.', 'b', 'm'] : ['b', 'b', 'm', 'b', '.'];
    const tgt = kind === 'peck' ? 2 : 2, hits = kind === 'peck' ? [1, 3] : [2];
    for (let n = 0; n < 5; n++) {
      cellBg(n, rowY);
      const gone = hits.includes(n) && a > 0.55 + hits.indexOf(n) * 0.1;
      const sh = hits.includes(n) && a > 0.5 && !gone ? Math.sin(clock * 60) * 2 : 0;
      if (gone) { const g2 = (a - 0.55 - hits.indexOf(n) * 0.1) / 0.15; if (g2 < 1) { ctx.globalAlpha = 1 - g2; block(x0 + n * cs + g2 * 4, rowY - g2 * 10, cs, 1, row[n] === 'm' ? -1 : 2); ctx.globalAlpha = 1; } continue; }
      if (row[n] === 'b') block(x0 + n * cs + sh, rowY, cs, 1, 2); else if (row[n] === 'm') inkMonster(x0 + n * cs + cs / 2 + sh, rowY + cs / 2, cs * 0.38, false);
    }
    if (kind === 'fire') { // 火麒麟的灯：下一批的第一块影子
      ctx.fillStyle = 'rgba(255,190,90,0.18)'; rr(cx - cs * 2.5, cy + cs * 0.75, cs * 2.4, cs * 1.1, 8); ctx.fill();
      ctx.globalAlpha = 0.7; block(cx - cs * 2.1, cy + cs * 1.0, cs * 0.6, 1, 3); block(cx - cs * 1.5, cy + cs * 1.0, cs * 0.6, 1, 3); block(cx - cs * 0.9, cy + cs * 1.0, cs * 0.6, 1, 3); ctx.globalAlpha = 1;
    }
    const k = ease(a / 0.4), tx = x0 + tgt * cs + cs / 2, ty = rowY + cs / 2;
    if (a < 0.5) tile(start.x + (tx - start.x) * k, start.y + (ty - start.y) * k - Math.sin(k * Math.PI) * 30, cs * 0.9);
    else if (a < 0.85) { ctx.globalAlpha = 1 - (a - 0.5) / 0.35; petIcon(pet, tx, ty - cs * 0.9 - Math.abs(Math.sin(clock * 14)) * 6, cs * 0.9, 0, 0); ctx.globalAlpha = 1; }
  } else if (kind === 'silk') {
    // 一排差一格，空格上面有只墨怪；技能块落进空格 → 补上 → 整排消掉、墨怪被缠走
    const filled = a > 0.45, clear = a > 0.62 && a < 0.9;
    for (let n = 0; n < 5; n++) { cellBg(n, rowY); if (clear) continue; if (n !== 2) block(x0 + n * cs, rowY, cs, 1, 1); else if (filled) block(x0 + n * cs, rowY, cs, 1, col, true); }
    if (clear) { ctx.fillStyle = 'rgba(243,210,122,' + (0.9 - (a - 0.62) * 3) + ')'; ctx.fillRect(x0, rowY, cs * 5, cs); }
    cellBg(2, rowY - cs); if (a < 0.62) inkMonster(x0 + 2.5 * cs, rowY - cs / 2, cs * 0.38, false); else if (a < 0.8) { const s3 = 1 - (a - 0.62) / 0.18; ctx.strokeStyle = C.blockColors[col][1]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x0 + 2.5 * cs, rowY - cs / 2, cs * 0.4 * s3, 0, Math.PI * 2); ctx.stroke(); }
    const k = ease(a / 0.4), tx = x0 + 2.5 * cs, ty = rowY + cs / 2;
    if (a < 0.45) tile(start.x + (tx - start.x) * k, start.y + (ty - start.y) * k - Math.sin(k * Math.PI) * 30, cs * 0.9);
  } else if (kind === 'gnaw') {
    // 上面一排缺 4 格；手上一条 5 格放不进 → 技能块啃掉一格 → 变 4 格 → 放进去，整排消掉
    const bitten = a > 0.42, placed = a > 0.66, clear = a > 0.78 && a < 0.95;
    for (let n = 0; n < 5; n++) { cellBg(n, rowY); if (clear) continue; if (n === 0 || (placed && n > 0)) block(x0 + n * cs, rowY, cs, 1, n === 0 ? 2 : 0); }
    if (clear) { ctx.fillStyle = 'rgba(243,210,122,' + (0.9 - (a - 0.78) * 4) + ')'; ctx.fillRect(x0, rowY, cs * 5, cs); }
    if (!placed) { // 手上的那条
      const hs = cs * 0.8, hn = bitten ? 4 : 5, hx = cx - (5 * hs) / 2, hy = cy + cs * 0.75;
      const lift = a > 0.55 ? ease((a - 0.55) / 0.11) : 0;
      for (let n = 0; n < hn; n++) block(hx + n * hs + (x0 + cs + n * cs - hx - n * hs) * lift, hy + (rowY - hy) * lift, hs + (cs - hs) * lift, 1, 0);
      if (a > 0.36 && a < 0.5) { ctx.strokeStyle = COL.red; ctx.lineWidth = 3; ctx.strokeRect(hx + 4 * hs + 2, hy + 2, hs - 4, hs - 4); }
      const k = ease(a / 0.36), tx = hx + 4.5 * hs, ty = hy + hs / 2;
      if (a < 0.42) tile(start.x + (tx - start.x) * k, start.y + (ty - start.y) * k - Math.sin(k * Math.PI) * 26, cs * 0.8);
    }
  }
}
// 说明卡上的小动画（0.9.17，代码画，2.4 秒一轮）
function introPic(kind, cx, cy, w) {
  const a = (clock % 2.4) / 2.4, cs = Math.min(46, w / 5.5);
  const cellBg = (x, y) => { ctx.fillStyle = COL.cellC; ctx.fillRect(x, y, cs, cs); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1); };
  if (kind === 'crawl' || kind === 'moss') {
    const x0 = cx - cs * 1.5, y0 = cy - cs / 2;
    for (let n = 0; n < 3; n++) cellBg(x0 + n * cs, y0);
    const hop = a > 0.45 && a < 0.7 ? (a - 0.45) / 0.25 : a >= 0.7 ? 1 : 0, e = hop * hop * (3 - 2 * hop);
    if (kind === 'moss' && hop > 0.3) block(x0 + cs, y0, cs, 1, -2); // 爬走的那格留一块墨
    if (a > 0.1 && a < 0.5) { ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(clock * 10) * 0.3; ctx.translate(x0 + cs * 2.5, y0 + cs / 2); ctx.rotate(Math.PI / 2); ctx.fillStyle = '#1e162c'; [[-1, 0.12], [1, -0.12]].forEach(([sd, off]) => { ctx.beginPath(); ctx.ellipse(sd * cs * 0.13, off * cs, cs * 0.08, cs * 0.14, 0, 0, Math.PI * 2); ctx.fill(); }); ctx.restore(); }
    drawMon({ t: kind === 'moss' ? 'moss' : 'ink', hp: 0, col: -1, tgt: null }, -1, x0 + cs * 1.5 + cs * e, y0 + cs / 2 - Math.sin(hop * Math.PI) * cs * 0.3, cs * 0.4);
    return;
  }
  if (kind === 'dirt') { // 啃过的块（带小爆竹）落到土堆旁边 → 土堆炸塌
    const x0 = cx - cs * 1.5, y0 = cy - cs / 2, T2 = (clock % 2.6) / 2.6;
    for (let n = 0; n < 3; n++) cellBg(x0 + n * cs, y0);
    if (T2 < 0.55) dirtMound(x0 + cs * 2, y0, cs, 0);
    const k = Math.min(1, T2 / 0.4), fy = y0 - cs * 1.8 * (1 - k * k);
    if (T2 < 0.7) { block(x0 + cs, fy, cs, 1, 1); cracker(x0 + cs * 1.85, fy + cs * 0.15, cs); }
    else block(x0 + cs, y0, cs, 1, 1);
    if (T2 > 0.5 && T2 < 0.75) { const b2 = (T2 - 0.5) / 0.25; ctx.fillStyle = 'rgba(255,190,90,' + (1 - b2) + ')'; ctx.beginPath(); ctx.arc(x0 + cs * 2.5, y0 + cs / 2, cs * (0.3 + b2 * 0.8), 0, Math.PI * 2); ctx.fill(); for (let n = 0; n < 6; n++) { const an = n * 1.05; ctx.fillStyle = '#c08a4a'; ctx.fillRect(x0 + cs * 2.5 + Math.cos(an) * b2 * cs * 1.2 - 3, y0 + cs / 2 + Math.sin(an) * b2 * cs * 1.2 - 3, 6, 6); } }
    return;
  }
  if (kind === 'sticky' || kind === 'boss2') { // 怪瞪着托盘里一块 → 吐一团泥 → 那块多出一格
    const T2 = (clock % 2.8) / 2.8, mx = cx - w * 0.28, my = cy - 4, px = cx + w * 0.22, py = cy + 10;
    if (kind === 'boss2') { inkMonster(mx, my, 26, true); ctx.fillStyle = 'rgba(122,82,40,0.6)'; ctx.beginPath(); ctx.ellipse(mx, my + 22, 26, 8, 0, 0, Math.PI * 2); ctx.fill(); } else drawMon({ t: 'sticky', hp: 0, col: -1, tgt: null }, -1, mx, my, 22);
    const piece = { id: 'x', cat: 0, cells: T2 > 0.62 ? [[0, 0], [0, 1], [1, 1]] : [[0, 0], [0, 1]], h: T2 > 0.62 ? 2 : 1, w: 2, mud: T2 > 0.62 ? 2 : undefined };
    drawPiece(piece, px, py, cs * 0.7, 1, 3);
    if (T2 > 0.15 && T2 < 0.45) { ctx.fillStyle = '#3a2412'; ctx.beginPath(); ctx.ellipse(px, py - cs * 0.9, 18, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; [-7, 7].forEach((dx) => { ctx.beginPath(); ctx.arc(px + dx, py - cs * 0.9, 4, 0, Math.PI * 2); ctx.fill(); }); }
    if (T2 > 0.45 && T2 < 0.62) { const k = (T2 - 0.45) / 0.17; ctx.fillStyle = '#6b4420'; ctx.beginPath(); ctx.arc(mx + (px - mx) * k, my + (py - my) * k - Math.sin(k * Math.PI) * 40, 8, 0, Math.PI * 2); ctx.fill(); }
    return;
  }
  if (kind === 'boss') { // 一排金光扫过它 → 掉一颗心，扫三次 → 旁边亮红框 → 它跳过去
    const T2 = (clock % 3.2) / 3.2, hits = T2 > 0.62 ? 3 : T2 > 0.42 ? 2 : T2 > 0.22 ? 1 : 0;
    const jump = T2 > 0.78 ? Math.min(1, (T2 - 0.78) / 0.12) : 0, bx = cx - w * 0.18 + jump * w * 0.36, by = cy + 8 - Math.sin(jump * Math.PI) * 40;
    if (T2 > 0.64 && T2 < 0.92) { ctx.strokeStyle = 'rgba(226,85,59,' + (0.5 + Math.sin(clock * 14) * 0.4) + ')'; ctx.lineWidth = 4; ctx.strokeRect(cx + w * 0.18 - 34, cy + 8 - 34, 68, 68); }
    [0.12, 0.32, 0.52].forEach((t0) => { if (T2 > t0 && T2 < t0 + 0.08) { const k = (T2 - t0) / 0.08; ctx.fillStyle = 'rgba(243,210,122,0.85)'; ctx.fillRect(cx - w * 0.45, cy + 8 - 10, w * 0.9 * k, 20); } });
    inkMonster(bx, by, 30, true);
    for (let hh = 0; hh < 3; hh++) heart(bx - 22 + hh * 22, by - 46, 8, hh >= hits);
    return;
  }
  if (kind === 'metal') {
    const x0 = cx - cs * 2.5, y0 = cy - cs / 2, cleared = a > 0.4 && a < 0.62, broke = a > 0.85;
    for (let n = 0; n < 5; n++) cellBg(x0 + n * cs, y0);
    for (let n = 0; n < 5; n++) { if (n === 1) { if (!broke) metalPlate(x0 + cs, y0, cs, 0); continue; } if (a > 0.4) continue; if (n === 3 && a < 0.3) continue; block(x0 + n * cs, y0, cs, 1, 3); }
    if (a < 0.3) { const k = a / 0.3; block(x0 + 3 * cs, y0 - cs * 1.4 * (1 - k * k), cs, 1, 3); }
    if (cleared) { ctx.fillStyle = 'rgba(255,240,200,0.5)'; ctx.fillRect(x0, y0, cs * 5, cs); }
    if (a > 0.65 && a <= 0.85) { const k = (a - 0.65) / 0.2; ctx.fillStyle = C.blockColors[0][1]; ctx.beginPath(); ctx.arc(cx + cs * 2 - (cs * 3.5) * k, y0 - cs * 1.2 + cs * 1.7 * k, 9, 0, Math.PI * 2); ctx.fill(); }
    if (broke) for (let n = 0; n < 6; n++) { const ang = n * 1.05, d = (a - 0.85) * 260; ctx.fillStyle = '#f3d27a'; ctx.fillRect(x0 + cs * 1.5 + Math.cos(ang) * d - 3, y0 + cs / 2 + Math.sin(ang) * d - 3, 6, 6); }
    ctx.strokeStyle = COL.brass; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, cs * 5, cs);
    return;
  }
  if (kind === 'rush') {
    const bw = w * 0.8, bx = cx - bw / 2, by = cy - 6, burn = a, bx1 = bx + bw * burn;
    ctx.fillStyle = '#8a5a34'; rr(bx1, by - 4, bx + bw - bx1, 8, 4); ctx.fill();
    ctx.fillStyle = '#3a2a22'; ctx.fillRect(bx, by - 1, bx1 - bx, 2);
    [0.4, 0.75].forEach((q) => { ctx.fillStyle = burn > q ? '#5a4a40' : COL.brassLight; ctx.fillRect(bx + bw * q - 2, by - 10, 4, 20); });
    ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.arc(bx1, by, 5 + Math.sin(clock * 9), 0, Math.PI * 2); ctx.fill();
    const n = burn <= 0.4 ? 3 : burn <= 0.75 ? 2 : 1;
    for (let k = 0; k < 3; k++) danSlot(cx + (k - 1) * 40, cy + 40, 12, 1, k < n); // 段 2：星换成丹槽
  }
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
    if (it.custom) introPic(introKind, W / 2, cy, pw - 40);
    else if (it.bossPic) { inkMonster(W / 2, cy, 42, true); bossDress(it.bossPic, W / 2, cy, 42); }
    else if (it.monPic) drawMon(it.monPic, -1, W / 2, cy, 40);
    else if (it.actsPic) petIcon((g && g.team && g.team[0] && g.team[0].id) || save.activePet || 'tongque', W / 2, cy, 84, 0, Math.sin(clock * 3) * 0.1); // 画正带着的那只
    else if (it.armorPic) armorMonster(W / 2, cy, 40, Math.max(0, Math.sin(clock * 3)) * 0.3);
    else if (it.jumperPic) jumperMonster(W / 2, cy, 40, null, 0);
    else if (it.rockPic) ironRock(W / 2 - 40, cy - 40, 80);
    else if (it.pet && SKILL_DEMO[introKind]) drawSkillDemo(it.pet, W / 2, cy + 6, pw - 40);
    else if (it.pet) {
      petIcon(it.pet, W / 2, cy, 84, 1, Math.sin(clock * 3) * 0.1);
      if (it.glow) for (let n = 0; n < 5; n++) { const a2 = (clock * 1.2 + n / 5) % 1; ctx.globalAlpha = 1 - a2; ctx.fillStyle = C.blockColors[0][1]; ctx.beginPath(); ctx.arc(W / 2 - 90 + a2 * 70, cy + 40 - a2 * 40, 5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    }
    it.lines.forEach((ln, n) => text(ln, W / 2, py + (SKILL_DEMO[introKind] ? 214 : 196) + n * 28, 17, COL.text, 'center', 'normal'));
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
    textW('九宫捉妖', rTi.x + rTi.w / 2, rTi.y + rTi.h * 0.35, Math.round(40 * kt), COL.brassLight); // 11-28 改名（Cc 定，小琦起的） // 0.9.24 游戏名字一定留着（Cc：「主页上面得有游戏名字啊，大哥，那个文字你不能删啊」）
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
  textW('九宫捉妖', W / 2, cy + 116, 40, COL.brassLight);
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
  textW('试玩版 ' + VERSION, W / 2, H - 22, 13, COL.dim, 'center', 'normal'); // 0.9.24 主页一定看得到版本号（Cc：「主页没有版本号，这不行啊」）
}

// ---------- 设置：声音、振动、重新开始（Cc 11-24：「没有设置页，没法让我重新开始……退不回主菜单」） ----------
let settingsFrom = 'home';
let copyMsg = null; // 「复制试玩记录」之后的一句提示
// 试玩版（0.9.10，Cc 11-25：「只要玩完一关，就有位置可以点到这个复制记录。这样的话，我朋友测试完了之后才能把这个记录发给我」）：
// 结算页底下也放一个。正式上线把 PLAYTEST 改成 false，结算页的就不出了（设置里的留着）
const PLAYTEST = true;
function copyPlayLog() {
  const n = (save.playLog || []).length;
  P.copyText(T.exportText({ ver: VERSION, log: save.playLog || [] }), (ok, why) => {
    copyMsg = { text: ok === true ? '已复制 ' + n + ' 局，粘到微信发回来' : ok === 'box' ? '在弹出的框里复制' : ok === 'modal' ? '弹窗里长按全选拷贝，一段段发回来' : '复制失败：' + String(why || '原因不明').slice(0, 24), t: clock, dur: ok === true ? 2.5 : 8 };
    if (ok !== true) logErr('copy', String(why || ok)); // 0.9.15：复制失败的原因记进试玩记录
  }, '试玩记录（' + n + ' 局）');
}
// 0.9.17（Cc 11-27：「一定要让我朋友可以把测试结果转发给我，不然的话我们就白测了」）：试玩记录画成一张黑白方格图，
// 点一下弹出微信的「发送给朋友」，选 Cc 发过去。Cc 存图 → tools/decode_log_image.py 解开。复制那个按钮留着当后路
const LI = require('./logimg.js');
// 0.9.19：微信不放行发图、复制（后台隐私指引没声明，见全量设计第 139 条），改成「截屏页」：记录铺满一屏黑白格子，截屏 → 下一页，截图发给 Cc。
// 只带新版第一章以后的记录（一般 1–2 页）。Cc 存图后 tools/decode_log_image.py 图1 图2 … 解开
let logPages = null; // { pages, i, cell, rows, from }
function sendPlayLog() {
  const topH = 64, botH = 96;
  const cell = Math.max(4, Math.floor((W * dpr - 24 * dpr) / (LI.PCOLS + 4)));
  const rows = Math.max(20, Math.floor(((H - topH - botH) * dpr) / cell) - 4);
  const pack = T.exportBytes({ ver: VERSION, log: (save.playLog || []).filter((r) => r && r.ver && r.ver >= '0.9.17') }, LI.pageCapacity(rows) * 40);
  if (!pack) { copyMsg = { text: '记录打不了包，改用复制文字', t: clock, dur: 6 }; logErr('logpages', 'pack'); return; }
  logPages = { pages: LI.splitPages(pack.bytes, rows), i: 0, cell, rows, from: mode, topH, kept: pack.kept };
  T.rec('b', 'logPages_' + logPages.pages.length);
  mode = 'logpages';
}
function drawLogPages() {
  const lp = logPages;
  if (!lp) { mode = 'settings'; return; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W * dpr, H * dpr);
  const pw = (LI.PCOLS + 4) * lp.cell, x0 = Math.round((W * dpr - pw) / 2), y0 = Math.round(lp.topH * dpr);
  LI.drawPage(ctx, lp.pages[lp.i], x0, y0, lp.cell, lp.rows);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = lp.pages.length;
  text('试玩记录 第 ' + (lp.i + 1) + ' / ' + n + ' 页', W / 2, 22, 17, '#000000');
  text(n > 1 ? '截一张屏，再点「下一页」；几张截图一起发给 Cc' : '截一张屏，把截图发给 Cc', W / 2, 46, 13, '#333333', 'center', 'normal');
  const by = H - 80, bw = (W - 48) / 3;
  // 按钮画成浅灰（不能是深色宽条：解码工具靠「整行几乎全黑」找格子的黑框）
  const lb = (id, x, label, fn) => { ctx.fillStyle = downBtn === id ? '#d0d0d0' : '#e8e8e8'; rr(x, by, bw, 50, 12); ctx.fill(); text(label, x + bw / 2, by + 26, 16, '#111111'); buttons.push({ id, x, y: by, w: bw, h: 50, fn, label }); };
  if (lp.i > 0) lb('lpPrev', 16, '上一页', () => { lp.i--; });
  if (lp.i < n - 1) lb('lpNext', 24 + bw, '下一页', () => { lp.i++; });
  lb('lpClose', 32 + bw * 2, '好了', () => { mode = lp.from || 'settings'; logPages = null; });
}
let settingsAsk = 0; // 「重新开始」要点两下：第一下变成「真的清空？」，3 秒内再点才清
P.setMuted(!!save.muted);
function drawSettings() {
  drawBg();
  text('设置', W / 2, L.top + 30, 28, COL.brassLight);
  const bw = Math.min(W - 60, 320), bx = (W - bw) / 2;
  let y = L.top + 90;
  button('setSound', bx, y, bw, 58, '声音：' + (save.muted ? '关' : '开'), { size: 22, bg: save.muted ? COL.woodDark : COL.copper, fn: () => { save.muted = !save.muted; P.setMuted(save.muted); persist(); } });
  y += 76;
  button('setVibe', bx, y, bw, 58, '震动：' + (save.noVibrate ? '关' : '开'), { size: 22, bg: save.noVibrate ? COL.woodDark : COL.copper, fn: () => { save.noVibrate = !save.noVibrate; persist(); } }); // 打开的那一下，按钮自己的 light 就会震
  y += 76;
  // 0.9.21 测试员模式（Cc 11-27：「在设置里开一个“测试员模式”，打开之后就可以手动选择想玩的关卡」）：章页所有关、所有章都能点、都能玩
  button('setTester', bx, y, bw, 50, '测试员模式：' + (save.tester ? '开（任选关卡）' : '关'), { size: 18, bg: save.tester ? COL.copper : COL.woodDark, fn: () => { save.tester = !save.tester; chapView = null; chapSel = null; persist(); } });
  y += 86;
  const asking = settingsAsk && clock - settingsAsk < 3;
  button('setReset', bx, y, bw, 58, asking ? '真的清空？再点一次' : '重新开始', { size: 22, bg: COL.red, danger: true, fn: () => {
    if (!asking) { settingsAsk = clock; return; }
    // 清空所有进度（宠物、关卡、丹……），从第 1 关重新来
    const keepCuts = save.cutSeen, keepLog = save.playLog; save = freshSave(); save.cutSeen = keepCuts || {}; save.playLog = keepLog || []; persist(); // 试玩记录也留着
    P.setMuted(false);
    settingsAsk = 0;
    newPetLevel(0);
  } });
  text(asking ? '宠物、关卡、丹全部清空，回到第 1 关' : '清空所有进度，从第 1 关重新玩', W / 2, y + 80, 14, asking ? COL.red : COL.dim, 'center', 'normal');
  // 试玩记录：复制出来贴给 Kira（难度表的「真人」那一列）
  const nLog = (save.playLog || []).length;
  button('setSendLog', bx, H - 226, bw, 50, copyMsg && clock - copyMsg.t < (copyMsg.dur || 2.5) ? copyMsg.text : '把试玩记录发给 Cc（' + nLog + ' 局）', { size: 16, hot: true, fn: sendPlayLog });
  button('setCopyLog', bx, H - 168, bw * 0.62 - 4, 44, '复制文字', { kind: 'sub', size: 13, fn: copyPlayLog });
  button('setPrivacy', bx + bw * 0.62 + 4, H - 168, bw * 0.38 - 4, 44, '隐私指引', { kind: 'sub', size: 12, fn: () => P.openPrivacy() }); // 微信要求：用了隐私接口就要能打开隐私指引
  button('setBack', bx, H - (PLAYTEST ? 114 : 100), bw, 60, settingsFrom === 'map' ? '回地图' : '回主菜单', { size: 24, fn: () => { mode = settingsFrom; } });
}

// ---------- 九宫消 + 宠物（0.5）：画面和局外 ----------
// 规则在 petgame.js，关卡在 petlevels.js，设计见 ../九宫消加宠物_设计与调研_20261124.md
let petIdx = 0; // 宠物章节第几关（0 起）
let petFx = { pop: {}, caption: null, banner: null, bossHit: -9, evolveFlash: -9 };
let petMsg = null; // 地图 / 营地上的一句提示 { text, t }
const PET_GLYPH = { tongque: '雀', jinchique: '翅', baozhu: '鼠', modou: '蚕', sanweihu: '麟' };
// 第 n 级升到 n+1 级要多少经验。经验从哪来：出战打一关（宠物每出手一次 +1，过关再 +3，没过 +1）、喂一颗丹 +2
// Cc 11-24：「刚拿到宠物直接就升到 5 级……游戏时长会变得太短」→ 门槛提高，铜雀大约要打十几关才够进化
// 0.9.8（Fable 宠物重做第五节）：只有丹能升级，出战不涨经验。升一级要几颗丹：到 5 级共 14 颗，到 10 级再 50 颗，到 15 级再 100 颗。rec.exp = 这一级已经喂了几颗
// 段 2：每升一级要几颗丹（Cc 11-28 定 A：5/7/9/11/12/13/14/14/15，满级 100、5 级进化累计 32）、重打一天一次，都在 js/economy.js
const baseOf = (id) => PG.baseId(id); // 段 1：五只宠物长大版都映回小时候版
// 段 1：PG.petGain 改成返回「这一级变的是哪一样」，屏幕上先借一个词（正式画法段 5、6）
const GAIN_WORD = { n: '打得多', ring: '攒得快', evo: '长大', ult: '学绝招' };
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
// 宠物等级不写数字（0.9.20）：脚下一排小金点，几级几颗；5 级以后换成小星（进化过）
function lvPips(x, y, lv, s) {
  const n = Math.min(10, lv), gap = Math.max(5, Math.min(8, s * 0.12)), x0 = x - ((n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) { if (i >= 4) starShape(x0 + i * gap, y, gap * 0.45, COL.brassLight); else { ctx.fillStyle = COL.brassLight; ctx.beginPath(); ctx.arc(x0 + i * gap, y, gap * 0.3, 0, Math.PI * 2); ctx.fill(); } }
}
// 还差几个用算筹表示（0.9.20，总表第八单元已定）：一根根小铜棍，五根一组；抓到一个弹飞一根
function rods(x, y, n, h, align) {
  n = Math.max(0, n | 0); h = h || 16;
  const gw = h * 0.28, gg = h * 0.55, groups = Math.ceil(n / 5), rowsN = n > 15 ? 2 : 1, perRow = Math.ceil(groups / rowsN);
  const wRow = (k) => { const gN = Math.min(perRow, groups - k * perRow); let w = 0; for (let gi = 0; gi < gN; gi++) { const inG = Math.min(5, n - (k * perRow + gi) * 5); w += inG * gw + (gi ? gg : 0); } return w; };
  for (let k = 0; k < rowsN; k++) {
    let cx = align === 'left' ? x : x - wRow(k) / 2; const cy = y + (rowsN > 1 ? (k ? h * 0.55 : -h * 0.55) : 0);
    for (let gi = 0; gi < perRow; gi++) {
      const gIdx = k * perRow + gi; if (gIdx >= groups) break;
      const inG = Math.min(5, n - gIdx * 5); if (gi) cx += gg;
      for (let j = 0; j < inG; j++) { ctx.fillStyle = COL.ink; ctx.fillRect(cx - 1, cy - h / 2 - 1, gw * 0.62 + 2, (rowsN > 1 ? h * 0.85 : h) + 2); ctx.fillStyle = '#d9a75a'; ctx.fillRect(cx, cy - h / 2, gw * 0.62, rowsN > 1 ? h * 0.85 : h); cx += gw; }
    }
  }
}
function petIcon(id, x, y, s, lv, pop) {
  const d = PG.PETS[id];
  const k = 1 + (pop || 0) * 0.3, r = (s / 2) * k;
  if (petArtImg[id]) {
    // 正式头像：抠好底的图直接画，不加圈（Cc 11-25：「宠物旁边不用放一个金圈啊，金圈压住了宠物，很丑」）
    ctx.drawImage(petArtImg[id], x - r * 1.15, y - r * 1.2, r * 2.3, r * 2.3);
    if (lv) lvPips(x, y + r * 1.05, lv, s);
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
  if (lv) lvPips(x, y + r * 1.05, lv, s);
}
// 专属关（0.8）：点名的宠物有没有（进化后的也算）；这一关实际带谁、几级
function ownedOf(id) { for (let k = 0; id && k < 3; k++) { if (save.pets[id]) return id; id = PG.PETS[id] && PG.PETS[id].evo; } return null; } // 11-28：每只三个样子，顺着长大的链往下找
// 段 3（R-057，Cc 11-27「要练哪个是你自己的选择」）：不点名，带的永远是自己选的出战宠物。唯一的例外：连输两次「请对口的来帮忙」，
// 请来的那只最少按 3 级算（自己的更高就用自己的）
function levelTeam(st, i, helpLv, helpId) {
  if (helpId) { const o = ownedOf(helpId); return [{ id: o || helpId, lv: Math.max(o ? save.pets[o].lv : 1, helpLv || 3) }]; }
  return ownedTeam();
}
// 这一关自己有的宠物里谁最对口（盘上有金属 → 小铜雀，有土堆 → 小穿山甲）；没有障碍 / 自己没有 → null
function bestOwnedFor(st) { const top = PG.bestPetFor(st).find((x) => x.n > 0 && ownedOf(x.id)); return top ? ownedOf(top.id) : null; }
function newPetLevel(i, quiet, helpLv, helpId) { // quiet：只把盘面摆好、不放过场（开机时给老玩家垫底用）；helpLv：借一只几级的
  const st0 = PLV[i];
  if (!st0) return;
  petIdx = i; stageIdx = -1;
  // 0.9.24 测试员跳到后面的关：前面关送的宠物先给上（Cc：「爽关里还是没有宠物啊」——跳关玩，第 2 关送的铜雀没拿到，冲锋关里就一只宠物都没有）
  if (save.tester) { for (let k = 0; k < i; k++) { const gf = PLV[k].gift; if (gf && !ownedOf(gf)) { save.pets[gf] = { lv: 3, exp: 0 }; save.petOrder.push(gf); if (!save.activePet) save.activePet = gf; } } persist(); }
  const team = levelTeam(st0, i, helpLv, helpId);
  // 段 3 规则 3：关卡表上的「只差 1 格」（第 3、8、12 关，只给对口的那只）只有第一次打这关有
  const st1 = Object.assign({}, st0, { fastCharge: save.petStage <= i ? st0.fastCharge || false : false });
  // 安全网（0.9.12，Cc 11-25 定「三层都上」）：同一关连输 3 次，后两段发的大块少四成；5 次少七成；7 次只发基础大小。过了这关就恢复（loss 清零），重打已过的关不放松。屏幕上什么都不显示
  const L0 = (save.loss && save.loss[i]) || 0;
  if (L0 >= 3 && i >= save.petStage) { const k = L0 >= 7 ? 0 : L0 >= 5 ? 0.3 : 0.6; st1.d = (st0.d || 0) * k; if (st0.dSeg) st1.dSeg = st0.dSeg.map((x, n) => (n ? x * k : x)); if (st0.dBoss2) st1.dBoss2 = st0.dBoss2 * k; if (st0.dBoss3) st1.dBoss3 = st0.dBoss3 * k; }
  // 升级后的第一关（只算第一次打）：开局能量只差一格就满，马上用到新本事（Fable 技能重做第六节第 6 件，Kira 先定 A，待 Cc 看）
  // 段 3 规则 3：新宠物第一次出战（和升级后第一关）不管是哪一关都只差 1 格，挂在宠物身上（save.freshPet），不挂在关上
  const fresh = team[0] && save.freshPet && save.freshPet[baseOf(team[0].id)] ? baseOf(team[0].id) : null;
  if (fresh) st1.fastCharge = true; // 0.9.14 debug：点「开打」才算用掉（原来一摆出关卡卡片就用掉，在卡片上换一只再换回来、或者退回地图，这份好处就没了）
  g = PG.createPetGame({ stage: st1, team, seed: (P.now() ^ (save.plays * 2654435761)) >>> 0, tutorial: i === 0 && !save.petTutDone, crumb: false }); // 段 1：10 级鼠的小土块还没有地方画、拖不了（段 4、5），画面接上以前游戏里先不给，免得「没输也动不了」
  // 段 2（Cc 11-28 定 A）：带进关的那只比自己养的高、或者根本没有这只 = 借来的，这关最多 2 个丹槽
  { const own = team[0] ? ownedOf(team[0].id) : null; g.lent = !!team[0] && (!own || team[0].lv > save.pets[own].lv); }
  g._fresh = fresh;
  chapView = null; chapSel = null;
  startPet(st1);
  // 进关前一张关卡卡片（0.9.5，Cc 11-25：「进入游戏关卡的时候进太快了，没有这个仪式感」「我刚刚没派蚕出战，他怎么就出来了？……你得告诉我啊」）
  g.startMs = P.now();
  if (!quiet && save.petTutDone) { startCard = { t: clock, i, next: mode }; mode = 'start'; }
  // 这一章第一次开打：先放这章的开场（镜头摇过全景，硬切推到大墨怪）
  if (!quiet && i % 10 === 0 && !save.cutSeen['chapter' + i / 10]) { CUT.chapter(i / 10); playCuts(); }
  startLevelMusic(st1, i, quiet);
}
// 0.9.18 背景音乐（js/music.js，曲子是声音会话写的六段）：按章挑曲子；普通 / 难关（稍快加一层鼓）/ 头目（最紧张）。
// 关与关之间先来一段过场声（试听_7 的 STING.B），换章的那一关用 STING.C；过场完了曲子才进来
let musicTimer = null;
// 0.9.21 进关卡片上换宠物只是重摆这一关：音乐接着放，不重新起头（Cc 11-27：「每切一次宠物，音乐就重新响一次……巨难听」）
let keepMusicOnce = false;
function startLevelMusic(st, i, quiet) {
  if (keepMusicOnce) { keepMusicOnce = false; return; }
  if (musicTimer) clearTimeout(musicTimer);
  const ch = Math.floor(i / 10) + 1, tens = st.rush ? 3 : st.goal && st.goal.boss ? 2 : st.hard ? 1 : 0; // 0.9.20 冲锋关单独一档：快、激昂
  if (quiet) { P.bgm.play(ch, tens); return; }
  P.bgm.stop();
  const len = P.bgm.sting(i % 10 === 0 ? 'C' : 'B');
  musicTimer = setTimeout(() => { musicTimer = null; if (mode === 'play' || mode === 'start' || mode === 'intro') P.bgm.play(ch, tens); }, Math.max(300, len * 850));
}
// ---------- 0.9.20 进化动画（Cc 11-27：「1. 先出现原来的宠物；2. 把它抠掉，只变成一个纯黑的影子；3. 一道光闪过，变成新贴图的影子；4. 慢慢浮现出来，显示出新的贴图」学宝可梦）----------
// 约 5.4 秒，前 3 秒不能点掉：① 0–0.9 屏幕暗下来，原来那只升到正中间、变大；② 0.9–1.7 变成纯黑影子，光点往它身上吸；
// ③ 1.7–3.3 两个影子来回换，越换越快，光越来越亮；3.3–3.6 白光闪满屏；④ 3.6–4.8 新样子从黑影里慢慢浮出来；4.8 起星星炸开、摆个姿势
let evoAnim = null;
const EVO_LEN = 5.4;
const evoCache = {};
function evoSprite(id, sil) {
  const key = id + (sil ? '_s' : '');
  if (evoCache[key]) return evoCache[key];
  const S = 360, c = P.makeCanvas(S, S), c2 = c.getContext('2d');
  withCtx(c2, () => petIcon(id, S / 2, S / 2, S * 0.5, 0, 0));
  if (sil) { c2.globalCompositeOperation = 'source-atop'; c2.fillStyle = '#05060c'; c2.fillRect(0, 0, S, S); c2.globalCompositeOperation = 'source-over'; }
  evoCache[key] = c;
  return c;
}
function drawEvoAnim() {
  const e = evoAnim, a = clock - e.t;
  if (a < 0) return;
  const cx = W / 2, cy = H * 0.42, size = Math.min(W * 0.75, 300);
  const ease = (k) => k * k * (3 - 2 * k), seg = (t0, t1) => Math.min(1, Math.max(0, (a - t0) / (t1 - t0)));
  // 背景暗下来，一圈光慢慢转
  ctx.fillStyle = 'rgba(4,5,14,' + Math.min(0.92, a * 1.4) + ')'; ctx.fillRect(0, 0, W, H);
  const glow = a < 1.7 ? seg(0.5, 1.7) * 0.4 : a < 3.3 ? 0.4 + seg(1.7, 3.3) * 0.6 : Math.max(0, 1 - seg(3.6, 5.0) * 0.7);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(a * 0.6);
  for (let n = 0; n < 12; n++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = 'rgba(255,232,170,' + (glow * 0.16) + ')'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-size * 0.12, -size * 1.4); ctx.lineTo(size * 0.12, -size * 1.4); ctx.fill(); }
  ctx.restore();
  const rg = ctx.createRadialGradient(cx, cy, 10, cx, cy, size * 0.75); rg.addColorStop(0, 'rgba(255,240,200,' + glow * 0.55 + ')'); rg.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  const draw = (img, alpha, sc) => { if (alpha <= 0) return; ctx.globalAlpha = alpha; const s2 = size * sc; ctx.drawImage(img, cx - s2 / 2, cy - s2 / 2, s2, s2); ctx.globalAlpha = 1; };
  const rise = ease(seg(0, 0.9)), bob = Math.sin(a * 3) * 4;
  if (a < 1.7) { // ① 升上来 ② 变黑影
    const sc = 0.55 + 0.45 * rise, k = ease(seg(0.9, 1.7));
    ctx.save(); ctx.translate(0, (1 - rise) * H * 0.25 + bob);
    draw(evoSprite(e.from), 1 - k, sc); draw(evoSprite(e.from, true), k, sc);
    ctx.restore();
    if (a > 0.6) for (let n = 0; n < 18; n++) { const t2 = (a * 0.9 + n / 18) % 1, ang = n * 2.4, d = (1 - t2) * size * 0.9; ctx.globalAlpha = t2; ctx.fillStyle = '#fff1c0'; ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d + bob, 2 + t2 * 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  } else if (a < 3.6) { // ③ 两个影子来回换，越换越快
    const k = seg(1.7, 3.3), period = 0.42 - 0.36 * k, showNew = Math.floor((a - 1.7) / period) % 2 === 1 || a > 3.3;
    const pulse = 1 + Math.sin(a * 20) * 0.02 * k;
    ctx.save(); ctx.translate(0, bob); draw(evoSprite(showNew ? e.to : e.from, true), 1, (showNew ? 1.08 : 1) * pulse); ctx.restore();
    ctx.globalAlpha = k * 0.5; ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, size * (0.45 + 0.1 * Math.sin(a * 12)), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  } else { // ④ 新样子慢慢浮出来
    const k = ease(seg(3.6, 4.8)), pop = a < 4.9 ? 1.08 - 0.08 * k : 1 + Math.max(0, 0.08 - (a - 4.9) * 0.3) * Math.sin((a - 4.9) * 14);
    ctx.save(); ctx.translate(0, bob); draw(evoSprite(e.to, true), 1 - k, 1.08 * pop); draw(evoSprite(e.to), k, 1.08 * pop); ctx.restore();
    if (a > 4.8) for (let n = 0; n < 14; n++) { const t2 = Math.min(1, (a - 4.8) * 1.3), ang = n * (Math.PI * 2 / 14); starShape(cx + Math.cos(ang) * size * (0.35 + t2 * 0.45), cy + Math.sin(ang) * size * (0.35 + t2 * 0.45), 9 * (1 - t2 * 0.6), COL.brassLight); }
  }
  // 白光闪满屏
  if (a > 3.25 && a < 3.9) { ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0, 1 - Math.abs(a - 3.4) * 2.2) + ')'; ctx.fillRect(0, 0, W, H); }
  // 声音：每一步一声（只响一次）
  const hit = (k2, t0, fn) => { if (a >= t0 && !e[k2]) { e[k2] = true; fn(); } };
  hit('_s0', 0.05, () => P.sound('lit', 0.6));
  hit('_s1', 0.9, () => { P.sound('clear0', 0.5); haptic('light'); });
  hit('_s2', 1.7, () => P.sound('clear2', 0.5));
  hit('_s3', 2.6, () => P.sound('clear4', 0.55));
  hit('_s4', 3.3, () => { P.sound('sweep', 0.8); haptic('heavy'); });
  hit('_s5', 4.8, () => { P.sound('dong', 0.7); P.sound('chirp', 0.6); haptic('medium'); });
  if (a > EVO_LEN + 0.6) { ctx.globalAlpha = 0.5 + Math.sin(clock * 4) * 0.3; text('▶', W / 2, H - 70, 26, COL.brassLight); ctx.globalAlpha = 1; } // 演完了：点哪儿都关
  if (a > 3.2) buttons.push({ id: 'evoTap', x: 0, y: 0, w: W, h: H, fn: null, label: '' }); // 整屏都能点（点的效果在 onTouchBody 里）；测试找得到
  if (a > EVO_LEN + 4) evoAnim = null; // 没人点也自己收
}
function startPet(st) {
  startCommon();
  enterAt = clock + 0.15; monIn = {}; handSeen = [null, null, null, null];
  timeline = []; ghosts = []; petRuns = []; rushPatch = null; rushMud = null; beams = []; colBolts = []; petInk = []; drainInk = []; // 上一关没演完的动画清掉，免得新盘面上闪一下
  for (let k = 0; k < 81; k++) if (g.board[k] === CELL.BLOCK) colorAt[k] = g.color[k];
  petFx = { pop: {}, caption: null, banner: st.line ? { text: st.line, t: clock + 0.3 } : null, bossHit: -9, evolveFlash: -9 };
  if (st.intro && !save.introSeen[st.intro]) { introKind = st.intro; mode = 'intro'; }
}
function petPos(n) { // 0.9.14：宠物住在右下角宠物格（出手、被偷能量、光点都飞到这里）
  const c = slotCenter(3);
  return { x: c.x, y: c.y - 8 };
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
    buttons.push({ id: 'pet' + n, x: p.x - 28, y: p.y - 28, w: 56, h: 56, fn: () => { petFx.caption = { text: d.name + ' ' + pt.lv + ' 级', t: clock }; } }); // 段 1：petDesc 拆了（游戏不用字），只说名字和等级
  });
}
// 进化关：正中间铺一层宠物颜色、一亮一暗；亮了的格子金边
let rushHintCache = null, stuckHint = null;
// 0.9.20 卡住提示第二级：25 秒没碰屏幕，出战的宠物飞出来，指一个「放得下」的地方（不是最好的那个）。一关最多 3 次，一次比一次来得晚（25 / 40 / 60 秒）
function drawStuckHint() {
  if (mode !== 'play' || !g.pets || g.over || drag || g.rush || !g.team.length) { stuckHint = null; return; }
  const idle = P.now() - Math.max(lastTouchMs, g.startMs || 0), used = g.hintsUsed || 0, need = [25000, 40000, 60000][used];
  if (!stuckHint) {
    if (!need || idle < need) return;
    const i = [0, 1, 2].find((j) => g.hand[j] && core.anyPlacement(g.board, g.hand[j])); if (i === undefined) return;
    const ps = core.placements(g.board, g.hand[i]); const pick = ps[Math.floor(ps.length / 2)];
    stuckHint = { i, r: pick[0], c: pick[1], t: clock, moves: g.moves }; g.hintsUsed = used + 1; T.rec('b', 'stuckHint' + g.hintsUsed); P.sound('chirp', 0.5);
  }
  if (g.moves !== stuckHint.moves || idle < 300) { stuckHint = null; return; }
  const h = stuckHint, a = clock - h.t, p = g.hand[h.i]; if (!p) { stuckHint = null; return; }
  const from = slotCenter(3), tx = cellX(h.c) + (p.w * L.cell) / 2, ty = cellY(h.r) - L.cell * 0.4, k = Math.min(1, a / 0.7), e = k * k * (3 - 2 * k);
  ctx.globalAlpha = 0.35 + Math.sin(clock * 5) * 0.15; p.cells.forEach(([dr, dc]) => block(cellX(h.c + dc), cellY(h.r + dr), L.cell, 1, handColor(h.i))); ctx.globalAlpha = 1;
  const px = from.x + (tx - from.x) * e, py = from.y + (ty - from.y) * e - Math.sin(e * Math.PI) * 60 + Math.sin(clock * 6) * 3;
  petIcon(g.team[0].id, px, py, 40, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(px, py + 18); ctx.lineTo(px - 6, py + 30); ctx.lineTo(px + 6, py + 30); ctx.fill(); // 小手指：指下去
}
function drawPetBoard() {
  drawStuckHint();
  // 0.9.22 冲锋关不再提示（Cc 11-27：「提示老是闪出来很讨厌，时不时就闪一下」——原来手停 2 秒就闪一下能塞的空，冲锋关本来就一眼看得出）
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
  if (bs && bs.jumpTo !== null) { const tl = bs.jumpTo; ctx.strokeStyle = 'rgba(226,85,59,' + (0.5 + Math.sin(clock * 12) * 0.4) + ')'; ctx.lineWidth = 4; ctx.strokeRect(cellX(tl % 9) + 2, cellY(Math.floor(tl / 9)) + 2, L.cell * 2 - 4, L.cell * 2 - 4); }
  // 拖块时：这一下能打到它吗
  petFx.bossScared = false;
  if (drag && g.hand[drag.slot]) {
    const p = g.hand[drag.slot], sn = snap(p, drag.x, drag.y);
    if (core.canPlace(g.board, p, sn.r, sn.c)) {
      // 这一下凑满的那一排 / 那个大格，本身含不含大墨怪的格子（原来按「格子落在它那几排上」算，会误报）
      const b2 = g.board.slice();
      for (const [dr, dc] of p.cells) b2[(sn.r + dr) * 9 + sn.c + dc] = 1;
      petFx.bossScared = core.UNITS.some((u, ui) => core.unitFull(b2, ui) && u.some((k) => g.bigCells.includes(k))); // 段 1：堵着的排打不到头目
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
    if (!cp || clock < cp.t || clock - cp.t > 2.8 || (wordsOff() && HAS_WORDS.test(cp.text))) continue;
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
  if (!ev.skill || (ev.units && ev.units.length)) juice(Object.assign({}, ev, { newlyLit: [], revealed: [], center: false, crossbow: null, win: false, combo: ev.combo || 0, streak: ev.streak || 0, beat: ev.beat || (ev.skill ? (ev.units.length >= 2 ? 3 : 2) : 1) })); // 0.9.25 收拾：规则给的结果整张往下传，只改这几样（0.9.22 漏传 rushStep 就是一个字段一个字段抄出的错） // 技能块（0.9.12）只有吐丝补满了一排才走消除那一套，别的由 juicePK 演
  if (ev.fire) { const c = boxCenter(ev.fire.box); rings.push({ t: clock, big: false, at: c }); flash = 0.25; P.sound('combo3', 0.7); shake = Math.max(shake, 8); }
  // 0.9.17：墨怪爬（从原来那格蹦过去）、冒脚印、金属被啄碎、冲锋关补格子
  (ev.crawl || []).forEach((e, j) => { monSlide[e.to] = { from: e.from, t: clock + 0.12 + j * 0.05 }; timeline.push({ t: clock + 0.12 + j * 0.05, fn: () => P.sound('skitter', 0.4) }); });
  if (ev.footprint && ev.footprint.length) timeline.push({ t: clock + 0.2, fn: () => P.sound('skitter', 0.22) });
  (ev.metal || []).forEach((k) => { const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2; for (let n = 0; n < 12; n++) { const a2 = Math.random() * Math.PI * 2, v = 90 + Math.random() * 140; fx.push({ kind: 'shard', x, y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 110, t: clock, life: 0.6, s: 3 + Math.random() * 4, col: '#f3d27a' }); } shake = Math.max(shake, 5); P.sound('shing', 0.55); haptic('medium'); });
  (ev.refill || []).forEach((k, j) => { cellIn[k] = clock + 0.3 + j * 0.006; });
  (ev.blast || []).forEach((k) => { const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2; for (let n = 0; n < 16; n++) { const a2 = Math.random() * Math.PI * 2, v = 100 + Math.random() * 160; fx.push({ kind: 'shard', x, y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 140, t: clock, life: 0.7, s: 3 + Math.random() * 5, col: Math.random() < 0.5 ? '#c08a4a' : '#ffb04a' }); } rings.push({ t: clock, big: false, at: { x, y } }); flash = Math.max(flash, 0.2); shake = Math.max(shake, 7); P.sound('bolt', 0.8); P.sound('thump', 0.5); haptic('heavy'); }); // 小爆竹炸塌土堆
  (ev.mudSpit || []).forEach((e, j) => { petInk.push({ from: { x: cellX(e.from % 9) + L.cell / 2, y: cellY(Math.floor(e.from / 9)) + L.cell / 2 }, toSlot: e.slot, t: clock + 0.2 + j * 0.1, mud: true }); timeline.push({ t: clock + 0.55 + j * 0.1, fn: () => { P.sound('crunch', 0.5); haptic('light'); handSeen[e.slot] = null; } }); });
  if (ev.rushFix && !ev.rushBoard) playRushFix(ev.rushFix, clock + 0.25); // 0.9.22 每放一块，宠物都从右下角飞出去修一下剩下的
  if (ev.rushBurst) { ev.rushBurst.forEach((k) => clearing.push({ k, t: clock + 0.06 + ((k % 9) + Math.floor(k / 9)) * 0.008 })); timeline.push({ t: clock + 0.08, fn: () => { P.sound('dong', 0.75); flash = Math.max(flash, 0.25); shake = Math.max(shake, 8); haptic('heavy'); } }); } // 0.9.21 三块塞完：剩下的铜砖整盘炸开
  if (ev.rushBoard) { for (let k = 0; k < 81; k++) if (g.board[k] === CELL.BLOCK || g.board[k] === CELL.BRICK) { colorAt[k] = g.color[k]; cellIn[k] = clock + 0.45 + ((k % 9) + Math.floor(k / 9)) * 0.018; } timeline.push({ t: clock + 0.45, fn: () => { P.sound('deal', 0.6); haptic('light'); } }); playRushFix(ev.rushFix, clock + 0.55); } // 冲锋关整盘换新：从左上角一路铺过去，宠物马上飞上去修
  (ev.crawlClear || []).forEach((cc) => timeline.push({ t: clock + 0.45, fn: () => { const monK = new Set(cc.collected.filter((c) => c.what === 'monster').map((c) => c.k)); cc.cells.forEach((k) => clearing.push({ k, t: clock, mon: monK.has(k) })); P.sound('clear' + Math.min(4, Math.max(0, (g.streak || 1) - 1)), 0.7); if (monK.size) setTimeout(() => P.sound('pop', 0.55), 250); shake = Math.max(shake, 5); flash = Math.max(flash, 0.15); haptic('medium'); } })); // 墨怪爬进去凑满：当场消
  if (ev.bossJumpPlan !== undefined) timeline.push({ t: clock + 0.15, fn: () => { P.sound('skitter', 0.5); haptic('medium'); } });
  juicePK(ev);
  // 同色的块化成光点飞到宠物身上
  ev.sparks.forEach((sp) => {
    const n = g.team.findIndex((p) => p.id === sp.id), to = petPos(n);
    sp.cells.slice(0, 9).forEach((k, j) => flyers.push({ what: 'spark', pet: sp.id, col: C.blockColors[PG.PETS[sp.id].color][1], x: cellX(k % 9) + L.cell / 2, y: cellY(Math.floor(k / 9)) + L.cell / 2, t: clock + 0.05 + j * 0.03, to }));
  });
  if (ev.lit) { ev.lit.forEach((k, j) => setTimeout(() => P.sound('chain' + Math.min(12, g.evLit.size - ev.lit.length + j + 1), 0.6), j * 80)); }
  const burst = (k, col, n, sp) => { const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2; for (let i = 0; i < n; i++) { const a2 = Math.random() * Math.PI * 2, v = (sp || 100) * (0.6 + Math.random() * 0.8); fx.push({ kind: 'shard', x, y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 90, t: clock, life: 0.55, s: 3 + Math.random() * 4, col }); } };
  const mark = (tab, k) => { petFx[tab] = petFx[tab] || {}; petFx[tab][k] = clock; };
  (ev.shellCrack || []).forEach((h) => { mark('shellHit', h.k); burst(h.k, STEEL[h.left % 3], 10 * h.n + (h.left === 0 ? 12 : 0), h.left === 0 ? 220 : 160); burst(h.k, '#ffffff', 4, 120); P.sound(h.left === 0 ? 'combo2' : 'tap', 0.9); shake = Math.max(shake, h.left === 0 ? 6 : 4); haptic('medium'); }); // 甲掉一层：铁片飞出去；最后一层碎掉更响更大
  (ev.colorMiss || []).forEach((k) => { mark('colorMiss', k); P.sound('tap', 0.4); });
  (ev.eats || []).concat((ev.bossEats || []).map((k) => ({ k }))).forEach((e) => { burst(e.k, (C.blockColors[colorsBefore[e.k]] || C.prefillColor)[0], 9, 90); P.sound('pick', 0.7); haptic('medium'); }); // 被啃掉的块碎成渣
  (ev.moss || []).forEach((e) => burst(e.k, '#2f5a3c', 6, 60));
  (ev.bombs || []).forEach((e) => { burst(e.k, '#ffb070', 16, 200); e.cells.forEach((k) => burst(k, '#2a2236', 4, 60)); flash = Math.max(flash, 0.25); shake = Math.max(shake, 8); P.sound('combo4', 0.7); haptic('heavy'); });
  (ev.spawns || []).forEach((e, j) => { monIn[e.to] = clock + j * 0.08; burst(e.to, '#3b3150', 6, 80); P.sound('select', 0.4); });
  (ev.armorBounce || []).forEach((k) => { petFx.armorBounce = petFx.armorBounce || {}; petFx.armorBounce[k] = clock; P.sound('tap', 0.7); });
  (ev.armorBreak || []).forEach((k) => { const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2; for (let n = 0; n < 8; n++) { const a2 = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 120; fx.push({ kind: 'shard', x, y, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp - 100, t: clock + 0.4, life: 0.6, s: 4 + Math.random() * 4 }); } });
  if (ev.bossSpit !== undefined) {
    // 大墨怪往那一格吐一团墨（墨团划弧线飞过去）
    const from = { x: cellX(g.bigCells[0] % 9) + L.cell, y: cellY(Math.floor(g.bigCells[0] / 9)) + L.cell };
    petInk.push({ from, k: ev.bossSpit, t: clock + 0.1 });
    timeline.push({ t: clock + 0.1, fn: () => P.sound('combo2', 0.5) });
  }
  if (ev.bossJump) { flash = 0.2; shake = Math.max(shake, 9); P.sound('dong', 0.75); haptic('heavy'); } // 头目跳 = 低音大钟
  if (ev.bossJump && ev.bossJump.crushed) { const t0 = ev.bossJump.to; ev.bossJump.crushed.forEach((k) => { const d = Math.abs(Math.floor(k / 9) - Math.floor(t0 / 9)) + Math.abs((k % 9) - (t0 % 9)); clearing.push({ k, t: clock + 0.05 + d * 0.04 }); }); } // 11-28：落脚处和周围一圈被踩碎的块，从落点往外一圈圈碎（正式画法段 4）
  if (ev.bigHits.length) {
    petFx.bossHit = clock; shake = Math.max(shake, 6); P.sound('thump', 0.75); haptic('medium'); // 头目挨打「嘭」
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
      ghosts.push({ k, t: bite, appear: inkCells.has(k) ? reach : 0, ci: colorsBefore[k] === undefined ? 0 : colorsBefore[k], ink: inkCells.has(k), rock: g.board[k] === CELL.EMPTY && (ev.rocks || []).includes(k), mon: monAt[k] || null });
      if (j % 2 === 0 && style !== 'spin') timeline.push({ t: bite, fn: () => { P.sound(style === 'fly' ? 'tap' : 'pick', 0.5); const x = cellX(k % 9) + L.cell / 2, y = cellY(Math.floor(k / 9)) + L.cell / 2; for (let c2 = 0; c2 < 4; c2++) { const a2 = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 90; fx.push({ kind: 'shard', x, y, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp - 60, t: clock, life: 0.45, s: 3 + Math.random() * 3 }); } } });
    });
    timeline.push({ t, fn: () => { P.sound(style === 'spit' ? 'combo2' : 'select', 0.6); if (act.rescue) flash = 0.3; } });
    if (style === 'spin') timeline.push({ t: spinEnd, fn: () => { P.sound('line', 0.7); flash = 0.12; } });
    timeline.push({ t: t + jump + cells.length * per, fn: () => { haptic('medium'); if (act.kind === 'box') { shake = Math.max(shake, 6); P.sound('combo3', 0.6); } } });
    t = run.end - 0.1;
  });
  timeline.push({ t, fn: () => { if (g.over && mode === 'play') endGame(); } });
}
// 宠物跳出来啃格子：起跳（抛物线）→ 沿着要啃的格子一格格走、嘴一张一合 → 跳回头像的位置
let petRuns = [];
// 0.9.21 冲锋关宠物自动出击（Cc 11-27：「换新棋盘宠物立马上去修，然后我就放放放，整个过程要特别流畅」）：画面上先多画一格，宠物飞过去修掉；不挡玩家，计时不停
let rushPatch = null, rushMud = null;
function playRushFix(fix, t0) {
  if (!fix || !g || !g.team || !g.team.length) return;
  const from = petPos(0), hitT = t0 + 0.26;
  const shards = (x, y, cols) => { for (let n = 0; n < 9; n++) { const a2 = Math.random() * Math.PI * 2, v = 80 + Math.random() * 120; fx.push({ kind: 'shard', x, y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 90, t: clock, life: 0.5, s: 3 + Math.random() * 3, col: cols[n % cols.length] }); } };
  if (fix.kind === 'peck') {
    const k = fix.k, pt = { x: cellX(k % 9) + L.cell / 2, y: cellY(Math.floor(k / 9)) + L.cell / 2 };
    rushPatch = { k, until: hitT };
    petRuns.push({ id: fix.pet, from, pts: [pt], t0, jump: 0.26, per: 0.12, ret: 0.2, style: 'fly', end: t0 + 0.58, keep: true });
    timeline.push({ t: hitT, fn: () => { shards(pt.x, pt.y, ['#6e5833', '#9C7F42', '#4a3b26']); P.sound('tap', 0.65); haptic('light'); } });
  } else {
    const sc = slotCenter(fix.slot);
    rushMud = { slot: fix.slot, orig: fix.orig, piece: fix.piece, until: hitT };
    petRuns.push({ id: fix.pet, from, pts: [sc], t0, jump: 0.26, per: 0.12, ret: 0.2, style: 'gnaw', end: t0 + 0.58, keep: true });
    timeline.push({ t: hitT, fn: () => { shards(sc.x, sc.y, ['#7a5228', '#c08a4a']); P.sound('crunch', 0.6); haptic('light'); } });
  }
}
// 托盘里这一块现在画成什么样：老鼠还没啃到之前，画多出一格泥的样子
const rushShow = (i, p) => (rushMud && g.rush && rushMud.slot === i && clock < rushMud.until && g.hand[i] === rushMud.orig ? rushMud.piece : p);
let petInk = []; // 大墨怪吐的墨团（飞行中）
let drainInk = []; // 墨怪冲宠物喷的墨团（0.9.8）
// 怪和宠物 PK 的画面（0.9.8，照 ../九宫消_宠物系统重做_20261125.md 第十三节）：技能块炸开、克住了、打不动、偷能量、下一波
function juicePK(ev) {
  const at = (k) => ({ x: cellX(k % 9) + L.cell / 2, y: cellY(Math.floor(k / 9)) + L.cell / 2 });
  const burst = (k, col, n, sp, delay) => { const c = at(k); for (let i = 0; i < n; i++) { const a2 = Math.random() * Math.PI * 2, v = (sp || 100) * (0.6 + Math.random() * 0.8); fx.push({ kind: 'shard', x: c.x, y: c.y, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 90, t: clock + (delay || 0), life: 0.55, s: 3 + Math.random() * 4, col }); } };
  if (ev.skill) {
    // 0.9.12 四种本事各演各的：啄 = 一格一格「笃」；啃手上 = 托盘那块掉渣；吐丝 = 绿丝绕成一团；火星 = 一团火
    const sk = ev.skill, col = C.blockColors[PG.PETS[sk.pet].color][1];
    if (sk.hand !== undefined) {
      const c = slotCenter(sk.hand);
      for (let n = 0; n < 12; n++) { const a2 = Math.random() * Math.PI * 2, v = 60 + Math.random() * 90; fx.push({ kind: 'shard', x: c.x, y: c.y - 10, vx: Math.cos(a2) * v, vy: Math.sin(a2) * v - 80, t: clock, life: 0.6, s: 3 + Math.random() * 3, col }); }
      P.sound('crunch', 0.8); haptic('medium'); // 啃「咔嚓」
    } else {
      const kind = sk.kind;
      if (kind === 'peck') P.sound('chirp', 0.6); // 0.9.18 每只宠物自己的叫声 + 招式声：铜雀「啾」+ 啄「笃笃笃」
      sk.cells.forEach((k, j) => { burst(k, kind === 'fire' ? '#ff8a3a' : col, kind === 'peck' ? 5 : 7, 120, j * 0.09); if (j) timeline.push({ t: clock + j * 0.09, fn: () => { haptic('light'); } }); });
      (sk.fill || []).forEach((k, j) => burst(k, col, 6, 70, j * 0.06));
      rings.push({ t: clock, big: false, at: at(ev.r * 9 + ev.c) });
      flash = Math.max(flash, 0.1); shake = Math.max(shake, 3);
      P.sound(kind === 'fire' ? 'bolt' : kind === 'silk' ? 'select' : 'peck', 0.75); haptic('medium');
    }
  }
  (ev.counter || []).forEach((c) => { burst(c.k, COL.brassLight, 18, 220); burst(c.k, '#ffffff', 6, 140); flash = Math.max(flash, 0.3); P.sound('shing', 0.7); haptic('medium'); }); // 克住了：金光「锵——」
  (ev.petMiss || []).forEach((m) => { petFx.petMiss = petFx.petMiss || {}; petFx.petMiss[m.k] = clock; burst(m.k, '#9aa0b0', 5, 70); P.sound('deny', 0.5); }); // 打不动：灰光挡住
  (ev.drain || []).forEach((d, j) => {
    const n = Math.max(0, g.team.findIndex((p) => p.id === d.id));
    const from = g.board[d.from] === CELL.BOSS ? { x: cellX(d.from % 9) + L.cell, y: cellY(Math.floor(d.from / 9)) + L.cell } : at(d.from);
    drainInk.push({ from, to: petPos(n), t: clock + 0.15 + j * 0.12, id: d.id, bomb: d.kind === 'bomb' });
  });
  if (ev.drain && ev.drain.length) timeline.push({ t: clock + 0.65, fn: () => haptic('heavy') }); // 被偷能量 = 被打：第一团墨打到宠物时重重震一下，几团只震一次
  // 第一次被偷能量：演完喷墨，出一张说明卡（只出一次）
  if (ev.drain && ev.drain.length && !save.introSeen.steal) timeline.push({ t: clock + 1.2, fn: showStealIntro });
  if (ev.wave) petFx.waveJump = clock + 0.1;
  if (ev.wave) { ev.wave.cells.forEach((k, j) => { monIn[k] = clock + 0.15 + j * 0.09; burst(k, '#3b3150', 10, 120, 0.1 + j * 0.04); }); flash = Math.max(flash, 0.2); shake = Math.max(shake, 5); ev.wave.cells.forEach((k, j) => timeline.push({ t: clock + 0.15 + j * 0.09, fn: () => P.sound('plop', 0.5) })); timeline.push({ t: clock + 0.1, fn: () => haptic('medium') }); } // 下一波：一只只落进格子「啪嗒、啪嗒」
}
// 手上正拖着块就等一等（0.9.14 debug）：原来卡片照弹，松手那一下块照样放下去；要是正好过关 / 堵死，「出结算页」那一步看到不在关里就不做了，点完「继续」对着一盘不能动的棋
function showStealIntro() {
  if (save.introSeen.steal || !g || !g.pets || g.over || mode !== 'play') return;
  if (drag) { timeline.push({ t: clock + 0.2, fn: showStealIntro }); return; }
  introKind = 'steal'; mode = 'intro';
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
const petOut = (id) => petRuns.some((r) => r.id === id && r.style !== 'spit' && !r.keep && clock >= r.t0 && clock < r.end); // keep：冲锋关飞出去的是分身，右下角的宠物留在原地

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
  drainInk = drainInk.filter((m) => { if (clock - m.t >= 0.5) { petFx.drained = petFx.drained || {}; petFx.drained[m.id] = clock; P.sound('pick', 0.6); return false; } return true; });
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
    const a = Math.max(0, (clock - m.t) / 0.45), sc = m.toSlot !== undefined ? slotCenter(m.toSlot) : null, tx = sc ? sc.x : cellX(m.k % 9) + L.cell / 2, ty = sc ? sc.y : cellY(Math.floor(m.k / 9)) + L.cell / 2;
    const x = m.from.x + (tx - m.from.x) * a, y = m.from.y + (ty - m.from.y) * a - Math.sin(a * Math.PI) * 50;
    ctx.fillStyle = m.mud ? '#6b4420' : '#2a2236'; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); // 0.9.20 泥团飞向托盘里那块
    ctx.fillStyle = m.mud ? '#a8743a' : '#4a3f5c'; ctx.beginPath(); ctx.arc(x - 3, y - 3, 3, 0, Math.PI * 2); ctx.fill();
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
  if (!g._settled || !result) settlePet();
  showPet();
}
function settlePet() {
  g._settled = true;
  const st = g.stage;
  const r = { won: g.won, reason: g.reason, near: g.nearMiss(), caught: g.caught, gift: null, pay: null }; // caught 先留着：R-016（葫芦留不留）定之前结算页还画着葫芦
  const petReplay = petIdx < save.petStage; // 这关以前过过
  const practice = !!(save.tester && petIdx > save.petStage); // 测试员跳着玩还没打到的关：不改真进度、不给丹、不亮槽（Cc 11-28 定 A）
  if (g.won) {
    if (!practice) save.petStage = Math.max(save.petStage, petIdx + 1);
    if (st.gift && !save.pets[st.gift]) { // 送宠物时它自己叼着 1 颗丹；只送一次
      save.pets[st.gift] = EC.newPet(); save.petOrder.push(st.gift); r.gift = st.gift; if (!save.activePet) save.activePet = st.gift;
      save.petSeen[st.gift] = false; // 段 3 规则 2：还没看过出场（出场演完才擦；中途关掉，下次进章页补演）
      save.freshPet = save.freshPet || {}; save.freshPet[st.gift] = true; // 段 3 规则 3：新宠物第一次出战，表盘开局只差 1 格（哪一关都算）
    }
  }
  // 段 2 丹（丹细设计规则 2–6）：亮几个槽、给几颗、重打那一份，全由 economy.settle 算，丹进丹袋（玩家在宠物园挑喂谁）
  if (st.rush && g.won) g.rushSec = rushSec();
  if (!g._payRun || !g._payRun.won) g._payRun = runOf(g); // 同一局赢了只结算一次；输了以后看广告救命接着打赢的，重新结算（输的那次没动存档）
  r.pay = EC.settle(save, petIdx, st, g._payRun, today(), { practice });
  // 同一关连输几次（专属关连输两次，结算页给「借一只再来」）
  save.loss = save.loss || {}; if (g.won) delete save.loss[petIdx]; else save.loss[petIdx] = (save.loss[petIdx] || 0) + 1;
  persist();
  // 段 3 规则 2：赢了以后走哪几步（结算页的「继续」照它排过场）
  if (g.won) r.flow = FLOW.flowAfterWin({ boss: !!(st.goal && st.goal.boss), chapterEnd: petIdx % 10 === 9, gift: r.gift, first: !petReplay, owned: save.petOrder.length });
  result = r;
  g._settleInfo = { petReplay };
  // 试玩记录器（0.9.6，打磨流程第 0 步）：每打完一局记一行，给难度表的「真人」那一列用。设置里「复制试玩记录」拿走
  logPlay(false);
}
// 试玩记录器：每打完一局记一行（0.9.11 起中途退出也记一行 quit: 1，多记技能块用了几次、宠物救命几次）
function logPlay(quit) {
  if (!g || !g.pets || !g.stage || g.stage.evolve || g._logged) return;
  g._logged = true;
  T.rec(quit ? 'q' : 'E', ...(quit ? [] : [g.won ? 1 : 0]), g.moves, Math.round((P.now() - (g.startMs || P.now())) / 1000), Math.round(g.progressFrac() * 100));
  const ps = g.playStats, pt = g.team[0];
  save.playLog = save.playLog || [];
  save.playLog.push({
    lv: petIdx + 1, won: g.won ? 1 : 0, quit: quit ? 1 : 0, moves: g.moves, sec: Math.round((P.now() - (g.startMs || P.now())) / 1000),
    firstClear: ps.firstClear, firstGoal: ps.firstGoal, maxDry: ps.maxDry, prog: Math.round(g.progressFrac() * 100),
    petActs: Object.values(g.petActsTotal).reduce((a, b) => a + b, 0), petGoals: ps.goalsByPet, myGoals: ps.goalsByPlayer,
    skills: g.skillUses || 0, rescues: g.rescues || 0, wave: g.waveNo || 0, slots: (result && result.pay && result.pay.slots) || 0, dan: (result && result.pay && result.pay.total) || 0, lent: g.lent ? 1 : 0, rushSec: g.rushSec !== undefined ? Math.round(g.rushSec) : undefined, ads: g.adsUsed || 0,
    pet: pt ? pt.id : '', petLv: pt ? pt.lv : 0, ver: VERSION, t: new Date().toISOString().slice(0, 16),
  });
  if (save.playLog.length > 400) save.playLog.splice(0, save.playLog.length - 400);
  g._logRow = save.playLog.length - 1;
  persist();
}
function showPet() {
  if (!result) settlePet(); // 保险：没有结果就先结账（0.9.14）
  const st = g.stage, r = result, petReplay = g._settleInfo ? g._settleInfo.petReplay : false;
  mode = 'over';
  if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  if (r.won && st.goal && st.goal.boss) P.bgm.outro(Math.floor(petIdx / 10) + 1); else P.bgm.stop(); // 打完头目收一句安静尾声
  if (r.evolved) { P.sound('win', 0.9); flash = 0.7; } else if (!g.won) { P.sound('lose', 0.6); say('堵住了'); }
  // 段 3 规则 2（Cc 11-27，全量设计 145）：结算页先只讲这一关。过章、新宠物出场挪到结算页「继续」之后（afterWinFlow）。东西上面已经入账了，跳过也不丢
  if (r.evolved) CUT.evolve(r.evolved.from, r.evolved.to);
  playCuts();
}
// 段 3 规则 2：结算页「继续」以后照 flowAfterWin 剩下的步子走：过章过场 → 新宠物出场 → 记下「教换宠物」（下一关的进关卡片上演）→ 回宠物园（Cc 11-24「每一关过完必定回营地」，再从宠物园去下一关的关牌）
// 出场动画、教换宠物的手指是占位的画法，正式的在段 6（R-097）
function afterWinFlow() {
  const r = result, steps = (r && r.flow) || [];
  if (steps.includes('chapterClear')) CUT.chapterClear(Math.floor(petIdx / 10));
  if (steps.includes('petEntrance') && r.gift) { CUT.petIntro(r.gift); entranceShown.push(r.gift); }
  if (steps.includes('switchTeach') && r.gift) { save.switchTeach = { id: r.gift, step: 0 }; persist(); }
  openCamp();
  playCuts();
}
// 输了以后右边那个小按钮：丹够升级就是「宠物园」（发金光 + 丹），不然是「地图」（0.9.16，Cc：「卡在第十关，退不回园子里去喂宠物了」）
function lossSideBtn(x, y, w, h) {
  if (canLevelAny()) {
    button('toGarden', x, y, w, h, '宠物园', { size: 16, bg: COL.wood, hot: true, fn: () => openCamp() });
    ctx.strokeStyle = 'rgba(243,210,122,' + (0.5 + Math.sin(clock * 6) * 0.4) + ')'; ctx.lineWidth = 3; rr(x - 3, y - 3, w + 6, h + 6, 12); ctx.stroke();
    danOrb(x + 14, y + h / 2, 8);
  } else button('tomap', x, y, w, h, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
}
function drawPetOver() {
  const age = clock - overAt;
  const r = result;
  const wait = r.won ? 1.0 : 0.35;
  ctx.fillStyle = COL.shade + Math.min(r.won ? 0.6 : 0.85, age * 2) + ')'; ctx.fillRect(0, 0, W, H);
  if (r.won && age < wait) { text(r.evolved ? '进化！' : '过关！', W / 2, L.by + L.board * 0.45, Math.round(64 * Math.min(1, 0.6 + age * 3)), COL.brassLight); return; }
  if (age < wait) return;
  const pw = Math.min(W - 40, 340), ph = (r.evolved ? 380 : !r.won ? 340 : 300) + (r.won && r.pay && r.pay.slots ? 70 : 0), px = (W - pw) / 2, py = Math.max(L.top + 10, (H - ph) / 2 - 30); // 0.9.13：没新宠物时面板收矮，不留大片空白
  panel(px, py, pw, ph);
  let y = py + 40;
  if (r.evolved) {
    text(PG.PETS[r.evolved.from].name + ' 进化了！', W / 2, y, 26, COL.brassLight);
    petIcon(r.evolved.to, W / 2, y + 74, 80, save.pets[r.evolved.to].lv, Math.sin(clock * 3) * 0.08);
    text(PG.PETS[r.evolved.to].name + ' ' + save.pets[r.evolved.to].lv + ' 级', W / 2, y + 140, 16, COL.text, 'center', 'normal');
    y += 160;
  } else if (r.won) {
    text(petLevelName() + ' 完成！', W / 2, y, 26, COL.brassLight);
    y += 44;
    // 段 2：3 个丹槽一个个亮（新亮的金、这关以前就拿过的暗金、没亮的灰；难关每槽叠 2 颗、头目叠 3 颗），下面一个总数。不画分数、不画「新纪录」（正式画法段 5）
    const pay = r.pay;
    if (pay && pay.slots) {
      const per = pay.perSlot || 1;
      for (let n = 0; n < 3; n++) {
        const ta = (age - wait - 0.15 - n * 0.28) / 0.3, on = pay.lit[n] !== 'off' && ta > 0;
        const sc = on ? Math.min(1, ta) * (1 + 0.35 * Math.max(0, 1 - Math.abs(ta - 1) * 3)) : 1;
        if (on && !r['_st' + n]) { r['_st' + n] = true; P.sound('chain' + (4 + n * 2), 0.7); haptic('light'); } // 声音先原样用星的，段 5 再配
        danSlot(W / 2 + (n - 1) * 48, y + 10, 13 * Math.max(0.3, sc), per, on ? pay.lit[n] : 'off');
      }
      y += 70;
    }
  } else {
    text(r.near ? '差一点！' : '堵住了', W / 2, y, 30, r.near ? COL.red : COL.text);
    if (wordsOff()) { // 0.9.20 无字：出战的宠物低着头掉一滴眼泪；差一点的话旁边一个快满的进度条
      const pid = g.team[0] && g.team[0].id; if (pid) { ctx.globalAlpha = 0.75; petIcon(pid, W / 2, y + 2, 46, 0, 0); ctx.globalAlpha = 1; }
      const ty = y - 4 + ((clock * 30) % 22); ctx.fillStyle = '#7fc4ff'; ctx.beginPath(); ctx.moveTo(W / 2 + 20, ty - 6); ctx.quadraticCurveTo(W / 2 + 26, ty + 2, W / 2 + 20, ty + 4); ctx.quadraticCurveTo(W / 2 + 14, ty + 2, W / 2 + 20, ty - 6); ctx.fill();
      if (r.near) { const bw2 = 120, bx2 = W / 2 - bw2 / 2, fr = Math.min(1, g.progressFrac()); ctx.fillStyle = COL.ink; rr(bx2 - 2, y + 30, bw2 + 4, 12, 6); ctx.fill(); ctx.fillStyle = COL.red; rr(bx2, y + 32, bw2 * fr, 8, 4); ctx.fill(); }
    }
    y += 40;
    const left = g.goalLeft(), keys = Object.keys(g.stage.goal), cw = 70, x0 = W / 2 - (cw * keys.length) / 2;
    text('还差', W / 2, y, 15, COL.dim, 'center', 'normal');
    keys.forEach((key, n) => {
      const cx = x0 + cw * n + cw / 2;
      if (key === 'score') text(left.score + ' 分', cx, y + 34, 22, COL.red);
      else { goalIcon(key, cx - 14, y + 34, 26); if (left[key]) rods(cx + 6, y + 34, left[key], 16, 'left'); else text('✓', cx + 16, y + 34, 22, COL.jade); }
    });
    y += 70;
  }
  // 抓到的怪收进葫芦
  // 0.9.13：不写句子，只画图标 + 数字（葫芦 = 抓到几只墨怪，金珠 = 掉了几颗丹），数字从 0 滚上去（Cc：「直接做一个墨怪被收进葫芦里的动画，然后在葫芦旁边写一个小数字」）
  const danGot = r.pay ? r.pay.total : 0; // 段 2：这一局一共拿到几颗（槽 + 第一次拿满 + 今天重打）
  if (r.caught || danGot) {
    const k = Math.min(1, Math.max(0, (age - wait - 0.2) / 0.7)), items = [];
    if (r.caught) items.push({ ic: 'gourd', n: Math.round(r.caught * k) });
    if (danGot) items.push({ ic: 'dan', n: Math.round(danGot * k) });
    items.forEach((it, j) => {
      const cx2 = W / 2 + (j - (items.length - 1) / 2) * 110, bob = k < 1 ? 0 : Math.sin(clock * 3 + j) * 2;
      if (it.ic === 'gourd') gourdIcon(cx2 - 20, y + 16 + bob, 22); else danOrb(cx2 - 20, y + 16 + bob, 13);
      text('×' + it.n, cx2 + 14, y + 17, 22, it.ic === 'dan' ? COL.brassLight : COL.text, 'left');
    });
    y += 44;
  }
  const bw = pw - 48, bx = px + 24, by = py + ph - 128;
  if (r.won) {
    // 过关一律回营地（Cc 11-24：「别给我直接进入下一关的选项，每一关过完了之后必定回营地」）：炼丹、喂宠物、换出战，再从营地去闯下一关
    button('tocamp', bx, by + 20, bw, 64, '回宠物园', { size: 28, fn: () => afterWinFlow() });
    // 够升级了：按钮外一圈金光，左边一颗丹带个向上的箭头（0.9.16：玩家不知道该回去喂）
    if (canLevelAny()) {
      const gy = by + 20 + 32, a2 = 0.5 + Math.sin(clock * 6) * 0.4;
      ctx.strokeStyle = 'rgba(243,210,122,' + a2 + ')'; ctx.lineWidth = 4; rr(bx - 4, by + 16, bw + 8, 72, 16); ctx.stroke();
      danOrb(bx + 30, gy, 11);
      const ay = gy - 4 - Math.abs(Math.sin(clock * 5)) * 5; ctx.fillStyle = COL.jade; ctx.beginPath(); ctx.moveTo(bx + 44, ay - 10); ctx.lineTo(bx + 52, ay); ctx.lineTo(bx + 36, ay); ctx.fill(); ctx.fillRect(bx + 41, ay, 6, 9);
    }
  } else {
    button('again', bx, by, bw, 58, '再试一次', { size: 24, fn: () => newPetLevel(petIdx) });
    const lost2 = save.loss && save.loss[petIdx] >= 2;
    // 0.9.12：连输两次，带的不是对口的 → 请对口的来帮忙，最少按 3 级算（Cc 11-25 定三层网的第一层，看得见、在教她带谁）
    // 段 3 规则 10：只在「盘上有带着的这只打不开的障碍、自己又有打得开的那只」时出（名单认五只，带小龟也给）；没有障碍的关不给
    const helper = lost2 && g.team[0] ? PG.helperFor(g.stage, g.team[0].id, save.petOrder) : null;
    const bestId = helper ? ownedOf(helper) : null;
    if (g.rush) lossSideBtn(bx, by + 70, bw, 44); // 0.9.24 冲锋关慢了输：只有「再试一次」，不给救命
    else if (bestId) {
      text('这关的障碍' + PG.PETS[g.team[0].id].name + '打不开。', W / 2, by - 14, 14, COL.dim, 'center', 'normal'); // 段 3：原来说「怪不怕」，其实说的是障碍（无字画法段 5、6）
      button('lend', bx, by + 70, bw * 0.6 - 6, 44, '请' + PG.PETS[bestId].name + '来帮忙', { size: 15, bg: COL.wood, hot: true, fn: () => newPetLevel(petIdx, false, 3, bestId) });
      lossSideBtn(bx + bw * 0.6 + 6, by + 70, bw * 0.4 - 6, 44);
    } else if (g.adsUsed < C.adMax) {
      button('revive', bx, by + 70, bw * 0.6 - 6, 44, '清最挤的 3 个大格', { size: 15, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { reviveFx(); g._ended = false; mode = 'play'; result = null; stats.starts.push(P.now()); }) });
      lossSideBtn(bx + bw * 0.6 + 6, by + 70, bw * 0.4 - 6, 44);
    } else lossSideBtn(bx, by + 70, bw, 44);
  }
  if (PLAYTEST) { // 面板底下，一关打完就点得到
    const nLog = (save.playLog || []).length;
    const ly = Math.min(H - 56, py + ph + 14);
    button('overSendLog', bx, ly, bw * 0.66 - 4, 44, copyMsg && clock - copyMsg.t < (copyMsg.dur || 2.5) ? copyMsg.text : '把记录发给 Cc（' + nLog + ' 局）', { size: 14, hot: true, fn: sendPlayLog });
    button('overCopyLog', bx + bw * 0.66 + 4, ly, bw * 0.34 - 4, 44, '复制文字', { kind: 'sub', size: 13, fn: copyPlayLog });
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
// 宠物园（0.9.13，Cc 11-26 定 C：「营地」改成宠物园）：宠物在园子里走来走去，点一只冒气泡（等级条、喂丹、出战），出战的插一面小旗；
// 丹数缩到右上角；底下只留下一关（图标）和出发。不留解释的字（Cc：「一切都以简洁为主，现在巨多字全是废话」）
let garden = {}; // 每只宠物在园子里的位置 { x, y, tx, ty, next, face }
let gardenEat = {}, gardenUp = {}; // 刚吃到丹的时刻；刚升级 { t, from, to }
let gardenSel = null, danShow = null, danOrbs = []; // 选中的那只；右上角丹数（滚动着变）；喂丹时飞过去的丹
function danOrb(x, y, r) { // 一颗丹：金色圆珠 + 高光
  ctx.fillStyle = '#7a5214'; ctx.beginPath(); ctx.arc(x, y + r * 0.12, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff4c8'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.32, 0, Math.PI * 2); ctx.fill();
}
function drawCamp() {
  drawBg();
  const top = uiTop();
  const rGd = LY.rect('camp.gourd'), rPt = LY.rect('camp.pets'), rNx = LY.rect('camp.next'), rGo = LY.rect('camp.go');
  button('campBack', 8, top, 56, 44, '‹', { kind: 'sub', size: 26, fn: () => { mode = campFrom; } });
  // 右上角：丹数（喂完数字滚下去）
  if (danShow === null) danShow = save.dan;
  danShow += (save.dan - danShow) * Math.min(1, 0.15);
  const dn = Math.round(danShow), chipX = W - 16 - 86, chipY = top + 6;
  ctx.fillStyle = 'rgba(20,24,48,0.7)'; rr(chipX, chipY, 86, 34, 17); ctx.fill();
  danOrb(chipX + 18, chipY + 17, 10);
  text('×' + dn, chipX + 54, chipY + 18, 18, COL.brassLight);
  // 园子：一块草地，宠物在上面走
  const gx = rGd.x, gy = rGd.y, gw = rGd.w, gh = rPt.y + rPt.h - rGd.y;
  const grd = ctx.createLinearGradient(0, gy, 0, gy + gh); grd.addColorStop(0, '#1b3b3a'); grd.addColorStop(1, '#13292e');
  ctx.fillStyle = grd; rr(gx, gy, gw, gh, 22); ctx.fill();
  ctx.strokeStyle = 'rgba(243,210,122,0.25)'; ctx.lineWidth = 2; rr(gx + 1, gy + 1, gw - 2, gh - 2, 22); ctx.stroke();
  for (let n = 0; n < 14; n++) { // 草丛和小灯，固定位置
    const tx = gx + 20 + ((n * 97) % (gw - 40)), ty = gy + 30 + ((n * 173) % (gh - 60));
    ctx.strokeStyle = 'rgba(120,190,150,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx - 5, ty); ctx.lineTo(tx - 2, ty - 9); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 12); ctx.moveTo(tx + 5, ty); ctx.lineTo(tx + 2, ty - 9); ctx.stroke();
    if (n % 5 === 0) { ctx.fillStyle = 'rgba(255,200,110,' + (0.35 + Math.sin(clock * 2 + n) * 0.15) + ')'; ctx.beginPath(); ctx.arc(tx + 14, ty - 18, 4, 0, Math.PI * 2); ctx.fill(); }
  }
  const ids = save.petOrder, sz = Math.min(92, gw / 3.4);
  const pad = sz * 0.6, ax0 = gx + pad, ax1 = gx + gw - pad, ay0 = gy + pad + 10, ay1 = gy + gh - pad;
  ids.forEach((id, k) => {
    let p = garden[id];
    if (!p) p = garden[id] = { x: ax0 + ((k + 0.5) / Math.max(1, ids.length)) * (ax1 - ax0), y: (ay0 + ay1) / 2 + (k % 2 ? 40 : -40), tx: 0, ty: 0, next: 0, face: 1 };
    if (clock > p.next && gardenSel !== id) { p.tx = ax0 + Math.random() * (ax1 - ax0); p.ty = ay0 + Math.random() * (ay1 - ay0); p.next = clock + 2 + Math.random() * 3; }
    if (gardenSel !== id && p.tx) { const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy); if (d > 2) { const v = Math.min(d, 40 / 60); p.x += (dx / d) * v; p.y += (dy / d) * v; p.face = dx < 0 ? -1 : 1; } }
  });
  // 别挤成一团：挨得太近就互相让开一点，目标点也换开
  for (let a = 0; a < ids.length; a++) for (let b2 = a + 1; b2 < ids.length; b2++) {
    const p = garden[ids[a]], q = garden[ids[b2]], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, min = sz * 0.95;
    if (d < min) { const push = (min - d) * 0.06, ux = dx / d, uy = dy / d; p.x -= ux * push; p.y -= uy * push; q.x += ux * push; q.y += uy * push; if (d < min * 0.7) { q.next = 0; } }
  }
  ids.forEach((id) => { const p = garden[id]; p.x = Math.max(ax0, Math.min(ax1, p.x)); p.y = Math.max(ay0, Math.min(ay1, p.y)); });
  // 远的先画（y 小的在后面）
  ids.slice().sort((a, b) => garden[a].y - garden[b].y).forEach((id) => {
    const p = garden[id], rec = save.pets[id], d = PG.PETS[id];
    const active = save.activePet === id || (!save.activePet && ids[0] === id);
    const walking = gardenSel !== id && p.tx && Math.hypot(p.tx - p.x, p.ty - p.y) > 2;
    const hop = walking ? Math.abs(Math.sin(clock * 9)) * 6 : Math.sin(clock * 2.4 + id.length) * 2;
    const pop = petFx.pop[id] ? Math.max(0, 0.35 - (clock - petFx.pop[id])) / 0.35 : 0;
    ctx.save(); ctx.translate(p.x, p.y + sz * 0.42); ctx.scale(1, 0.28); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.arc(0, 0, sz * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.restore(); // 影子（不用 ellipse：老的微信画布没有）

    ctx.save(); ctx.translate(p.x, p.y - hop); ctx.scale(p.face * (1 + pop * 0.25), 1 + pop * 0.25); petIcon(id, 0, 0, sz, 0, 0); ctx.restore();
    // 小牌子：几级（不写字说明）
    ctx.fillStyle = 'rgba(10,12,28,0.7)'; rr(p.x - 20, p.y + sz * 0.46, 40, 18, 9); ctx.fill();
    lvPips(p.x, p.y + sz * 0.46 + 9, rec.lv, sz); // 0.9.20 等级不写数字：几颗小金点

    const canEvolve = d.evo && rec.lv >= d.evoLv, canFeed = save.dan >= danToLevel(id);
    if ((canEvolve || canFeed) && gardenSel !== id) { const by = p.y - hop - sz * 0.55; ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(p.x - sz * 0.3, by, 7 + Math.sin(clock * 6), 0, Math.PI * 2); ctx.fill(); } // 有丹可喂 / 能进化：一个小红点
    buttons.push({ id: 'gpet_' + id, x: p.x - sz / 2, y: p.y - sz / 2, w: sz, h: sz, fn: () => { gardenSel = gardenSel === id ? null : id; petFx.pop[id] = clock; P.sound('select', 0.5); } });
  });
  // 选中的那只：气泡（等级条、喂丹、出战）
  if (gardenSel && save.pets[gardenSel]) {
    const id = gardenSel, p = garden[id], rec = save.pets[id], d = PG.PETS[id];
    const bw = 200, bh = 112, bx = Math.max(gx + 6, Math.min(gx + gw - bw - 6, p.x - bw / 2)), by = p.y - sz / 2 - bh - 14 < gy + 4 ? p.y + sz * 0.7 : p.y - sz / 2 - bh - 14;
    ctx.fillStyle = 'rgba(14,18,40,0.94)'; rr(bx, by, bw, bh, 14); ctx.fill(); ctx.strokeStyle = C.blockColors[d.color][1]; ctx.lineWidth = 2; rr(bx + 1, by + 1, bw - 2, bh - 2, 14); ctx.stroke();
    const need = EC.EXP_NEED[rec.lv] || 999, canEvolve = d.evo && rec.lv >= d.evoLv;
    text(d.name + ' Lv' + rec.lv, bx + 14, by + 18, 15, COL.text, 'left');
    if (wordsOff()) { petIcon(id, bx + 30, by + 18, 26, 0, 0); lvPips(bx + 80, by + 18, rec.lv, 40); }
    ctx.fillStyle = TH.line; rr(bx + 14, by + 34, bw - 28, 9, 4.5); ctx.fill();
    ctx.fillStyle = TH.jade; rr(bx + 14, by + 34, Math.max(6, (bw - 28) * Math.min(1, rec.exp / need)), 9, 4.5); ctx.fill();
    for (let n = 0; n < Math.min(need, 12); n++) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx + 14 + ((bw - 28) * (n + 1)) / Math.min(need, 12) - 1, by + 34, 1.5, 9); } // 条上一格一颗丹
    const half = (bw - 36) / 2, yb = by + 56;
    if (canEvolve) button('evolveG', bx + 14, yb, bw - 28, 42, '进化', { kind: 'sub', hot: true, dot: true, fn: () => { gardenSel = null; evolvePet(id, true); } });
    else {
      const cost = danToLevel(id), ok = save.dan >= cost;
      button('feedG', bx + 14, yb, half, 42, '', { kind: 'sub', hot: ok, fn: () => feedFx(id) });
      danOrb(bx + 14 + half * 0.32, yb + 21, 9); text('×' + cost, bx + 14 + half * 0.66, yb + 22, 16, ok ? COL.brassLight : COL.dim);
    }
    if (!canEvolve) text(GAIN_WORD[PG.petGain(id, rec.lv)] || '', bx + 22 + half + half / 2, yb + 21, 11, COL.dim, 'center', 'normal'); // 气泡右半：下一级多什么（一行小字）
  }
  // 喂丹：丹从右上角飞到宠物身上
  danOrbs = danOrbs.filter((o) => {
    const a = (clock - o.t) / 0.5; if (a < 0) return true;
    const p = garden[o.id]; if (!p) return false;
    if (a >= 1) { if (!o.done) { o.done = true; petFx.pop[o.id] = clock; gardenEat[o.id] = clock; P.sound(o.k !== undefined ? 'feed' + Math.min(10, o.k + 1) : 'coin', 0.5); haptic('light'); if (o.last && o.up) { gardenUp[o.id] = { t: clock, from: o.lv0, to: o.lv1 }; P.sound('lvup', 0.8); setTimeout(() => P.sound('chirp', 0.5), 120); haptic('medium'); } } return false; } // 0.9.18 喂丹：每颗「叮」一颗比一颗高；升级：宠物叫一声 + 编钟往上扫
    const x = o.x + (p.x - o.x) * a, y = o.y + (p.y - sz * 0.15 - o.y) * a - Math.sin(a * Math.PI) * 70; danOrb(x, y, 8); return true;
  });
  // 吃丹：嘴边一下嚼的光；升级：跳起来、一圈金光、「Lv3 → Lv4」翻过去、飘出这一级多了什么
  ids.forEach((id) => {
    const p = garden[id], e = gardenEat[id] !== undefined ? clock - gardenEat[id] : 9, u = gardenUp[id];
    if (e < 0.25) { ctx.fillStyle = 'rgba(255,230,150,' + (0.6 - e * 2.4) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y - sz * 0.15, 10 + e * 40, 0, Math.PI * 2); ctx.fill(); }
    if (u && clock - u.t < 2) {
      const ua = clock - u.t;
      ctx.strokeStyle = 'rgba(243,210,122,' + Math.max(0, 1 - ua) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, sz * (0.4 + ua * 0.6), 0, Math.PI * 2); ctx.stroke();
      for (let n = 0; n < 8; n++) { const ang = (n / 8) * Math.PI * 2 + ua, rad = sz * (0.3 + ua * 0.8); starShape(p.x + Math.cos(ang) * rad, p.y + Math.sin(ang) * rad, 5 * Math.max(0, 1 - ua / 1.5), COL.brassLight); }
      const flip = Math.min(1, ua / 0.35), txt = flip < 0.5 ? 'Lv' + u.from : 'Lv' + u.to;
      ctx.save(); ctx.translate(p.x, p.y - sz * 0.75 - ua * 10); ctx.scale(1, Math.abs(Math.cos(flip * Math.PI))); if (wordsOff()) lvPips(0, 0, flip < 0.5 ? u.from : u.to, 60); else text(txt, 0, 0, 22, COL.brassLight); ctx.restore(); // 0.9.20：升级时小金点多一颗（翻一下）
      if (ua > 0.4) { ctx.globalAlpha = Math.min(1, (2 - ua) * 2); text(GAIN_WORD[PG.petGain(id, u.from)] || '', p.x, p.y + sz * 0.75, 13, COL.text); ctx.globalAlpha = 1; }
    }
  });
  // 喂丹引导（0.9.16，Cc：「你这没有任何提示让我喂它」；Sylvie 打到第 8 关铜雀还是 1 级）：第一次攒够丹，一只手指先点宠物、气泡出来后再点丹的按钮；喂过一次就不再出现
  if (!save.feedTaught) {
    const ready = ids.filter((id) => save.dan >= danToLevel(id) && !(PG.PETS[id].evo && save.pets[id].lv >= PG.PETS[id].evoLv));
    const who = ready.includes(save.activePet) ? save.activePet : ready[0];
    if (who) {
      let tx, ty;
      const fb = gardenSel === who ? buttons.find((b) => b.id === 'feedG') : null;
      if (fb) { tx = fb.x + fb.w * 0.4; ty = fb.y + fb.h * 0.55; }
      else { const p = garden[who]; tx = p.x; ty = p.y; ctx.strokeStyle = 'rgba(243,210,122,' + (0.5 + Math.sin(clock * 6) * 0.4) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.55, 0, Math.PI * 2); ctx.stroke(); }
      const ph = (clock % 1.2) / 1.2, tap = ph < 0.5 ? 0 : Math.sin(((ph - 0.5) / 0.5) * Math.PI);
      drawHand(tx, ty, tap);
    }
  }
  // 一句很短的提示（升级了什么），飘一下就走
  if (petMsg && clock - petMsg.t < 2.2 && !(wordsOff() && HAS_WORDS.test(petMsg.text))) {
    const a = clock - petMsg.t; ctx.globalAlpha = Math.min(1, (2.2 - a) * 2);
    ctx.font = 'bold 15px "PingFang SC", sans-serif'; const tw = Math.min(W - 24, ctx.measureText(petMsg.text).width + 28);
    ctx.fillStyle = COL.steam; rr((W - tw) / 2, gy + 10 - a * 6, tw, 36, 10); ctx.fill(); ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(petMsg.text, W / 2, gy + 28 - a * 6, W - 36);
    ctx.globalAlpha = 1;
  }
  // 下一关：第几关 + 要抓的东西 + 谁最克它们（图标，不写字）
  const cur = Math.min(save.petStage, PLV.length - 1), nst = PLV[cur], ny = rNx.y, nh = rNx.h, nmid = ny + nh / 2;
  panel(rNx.x, ny, rNx.w, nh);
  text('第 ' + (cur + 1) + ' 关', rNx.x + 16, nmid, 14, COL.text, 'left');
  Object.keys(nst.goal).slice(0, 3).forEach((key, k) => {
    const x0 = rNx.x + 96 + k * 62;
    if (key === 'score') text(nst.goal.score + '分', x0 + 14, nmid, 13, COL.text);
    else { goalIcon(key, x0, nmid, 18); text(key === 'all' ? '全' : '×' + nst.goal[key], x0 + 12, nmid, 13, COL.text, 'left'); }
  });
  const bestOwned = bestOwnedFor(nst);
  const nW = PG.waveTotalOf(nst);
  if (nW > 1) { for (let k = 0; k < nW; k++) { ctx.fillStyle = COL.brassLight; ctx.beginPath(); ctx.arc(rNx.x + rNx.w - 34 - (nW - 1 - k) * 12, nmid, 4, 0, Math.PI * 2); ctx.fill(); } } // 几波：几个小圆点
  const goX = PLAYTEST ? Math.max(rGo.x, 62) : rGo.x; // 试玩版：左下角留给「记一下」那支笔
  button('campPlay', goX, rGo.y, rGo.w - (goX - rGo.x), rGo.h, '出发', { size: 22, fn: () => { gardenSel = null; chapView = null; chapSel = null; mode = 'map'; } });
}
function feedFx(id) {
  const before = save.dan, lv0 = save.pets[id].lv;
  levelUpPet(id);
  if (save.dan < before && !save.feedTaught) { save.feedTaught = true; persist(); T.rec('b', 'feedTaught'); }
  const nid = save.pets[id] ? id : PG.PETS[id].evo; // 0.9.17：喂到 5 级会直接进化，原来那只的名字就没了
  if (nid !== id && gardenSel === id) gardenSel = nid;
  if (save.dan < before) { const n = Math.min(8, before - save.dan), lv1 = save.pets[nid] ? save.pets[nid].lv : lv0; for (let i = 0; i < n; i++) danOrbs.push({ id: nid, k: i, x: W - 16 - 86 + 18, y: uiTop() + 23, t: clock + i * 0.09, last: i === n - 1, up: lv1 > lv0, lv0, lv1 }); petMsg = null; } // 升级的话由最后一颗丹落进嘴里那一下演
}
// 升一级要几颗丹（0.9.3：一下升一级，学 AFK Arena 的「升级」按钮；不再一颗一颗喂）。段 2：价表和扣丹在 economy，丹袋里的丹玩家挑给谁
const danToLevel = (id) => EC.cost(save.pets[id]);
const canEvolveNow = (id) => { const d = PG.PETS[id], rec = save.pets[id]; return !!(d && rec && d.evo && rec.lv >= d.evoLv); };
const canLevelAny = () => save.petOrder.some((id) => canEvolveNow(id) || (save.pets[id] && EC.canLevel(save, id)));
function levelUpPet(id) {
  const rec = save.pets[id], up = EC.levelUp(save, id);
  if (!up.ok) { if (rec) { petMsg = { text: '还差 ' + (up.cost - save.dan) + ' 颗丹', t: clock }; P.sound('deny', 0.5); } return; }
  petFx.pop[id] = clock;
  save.freshPet = save.freshPet || {}; save.freshPet[baseOf(id)] = true;
  const d = PG.PETS[id], gain = GAIN_WORD[PG.petGain(id, up.lv0)] || '';
  petMsg = { text: d.name + ' 升到 ' + rec.lv + ' 级！' + gain, t: clock };
  // 0.9.17 进化关砍了（Cc 11-27 第 9 件定 A 全砍）：喂到 5 级、10 级直接长大，演一段（金光、换成长大后的样子）
  if (canEvolveNow(id)) evolvePet(id, true);
  P.sound('lit', 0.7);
  persist();
}
// 进化（喂到 5 级自动进化；宠物园的「进化」按钮也走这里）。0.9.25：原来按钮还连着 0.9.17 就删掉的进化关，一点就出错（卡死专项测试查出）
function evolvePet(id, anim) {
  const d = PG.PETS[id], rec = save.pets[id];
  if (!d || !d.evo || !rec) return;
  const to = d.evo;
  save.pets[to] = { lv: rec.lv, exp: rec.exp }; delete save.pets[id];
  save.petOrder = save.petOrder.map((x) => (x === id ? to : x));
  if (save.activePet === id) save.activePet = to;
  if (save.freshPet) save.freshPet[baseOf(to)] = true;
  petFx.evolveFlash = clock; petFx.pop[to] = clock;
  petMsg = null;
  if (anim) evoAnim = { from: id, to, t: clock + 0.6 }; // 0.9.20：等最后一颗丹落进嘴里再开演
  T.rec('b', 'evolve_' + id);
  persist();
}
// ---------- 排好时间的动画小事件（守城画面已在 0.9.25 拆掉，这些是宠物关也在用的） ----------
let timeline = []; // 排好时间的小事件 { t, fn }
let ghosts = []; // 被机关打掉、还没轮到它碎的格子 { k, t, ci }
let relicPop = {}; // 机关栏图标跳一下 { id: 时刻 }
let beams = []; // 机关栏连到棋盘的一道光 { from, to, t, col }
let colBolts = []; // 竖着射的连弩 { col, t }
// 小工具（原来放在守城画面那一段里，0.9.25 拆守城时挪出来，宠物关也在用）
function boxCenter(b) { return { x: cellX((b % 3) * 3) + L.cell * 1.5, y: cellY(Math.floor(b / 3) * 3) + L.cell * 1.5 }; }
function starShape(x, y, r, col) {
  ctx.fillStyle = COL.ink; ctx.beginPath();
  for (let n = 0; n < 10; n++) { const a = -Math.PI / 2 + (n * Math.PI) / 5, rr2 = (n % 2 ? 0.45 : 1) * (r + 2); ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath();
  for (let n = 0; n < 10; n++) { const a = -Math.PI / 2 + (n * Math.PI) / 5, rr2 = (n % 2 ? 0.45 : 1) * r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fill();
}
function runTimeline() {
  if (!timeline.length) return;
  const due = timeline.filter((e) => clock >= e.t);
  timeline = timeline.filter((e) => clock < e.t);
  due.forEach((e) => { try { e.fn(); } catch (err) { logErr('timeline', err); } }); // 0.9.13：一件小事出错，后面的照常演（Cc 11-26 第 2 关过关卡死）
}

// ---------- 老存档整理（0.9.14 debug）：开机做一次。手机里可能是 0.9.8 以前的存档，对不上的地方会让某一页每帧出错、点不了 ----------
function fixSave() {
  const obj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  // 0.9.17 新版第一章：关卡、丹价、宠物本事全换了，老进度从第 1 关重新来（宠物、丹、葫芦一起清）；试玩记录、看过的过场、声音震动设置留着
  if (obj(save) && !save.ch1new) {
    if (save.petStage || (Array.isArray(save.petOrder) && save.petOrder.length)) {
      const keep = { playLog: save.playLog, cutSeen: save.cutSeen, muted: save.muted, noVibrate: save.noVibrate, plays: save.plays };
      Object.keys(save).forEach((k) => delete save[k]);
      Object.assign(save, freshSave(), keep);
      T.rec('b', 'migrate_ch1new');
    }
    save.ch1new = 1;
  }
  const int = (v, lo, hi) => { v = Math.floor(+v); return v >= lo ? Math.min(hi, v) : lo; }; // 不是数也落到 lo
  ['introSeen', 'relicSeen', 'relicGot', 'pets', 'petSeen', 'cutSeen', 'items'].forEach((k) => { if (!obj(save[k])) save[k] = {}; });
  if (!Array.isArray(save.petOrder)) save.petOrder = [];
  if (!Array.isArray(save.playLog)) save.playLog = [];
  if (save.loss !== undefined && !obj(save.loss)) delete save.loss;
  if (save.freshPet !== undefined && !obj(save.freshPet)) delete save.freshPet;
  ['dan', 'plays'].forEach((k) => { save[k] = int(save[k], 0, 1e9); });
  save.petStage = int(save.petStage, 0, PLV.length);
  // 段 2 老存档换算（丹细设计第三节）：0.9.24 的星 → 丹槽、按新规矩补丹、删金币 / 葫芦 / 分数 / 星。先把换算前的整份存档原样另存一份（只存第一次）
  if (EC.needsMigrate(save)) {
    if (loadedSave && !P.load(KEY + '_bak0924')) P.save(KEY + '_bak0924', loadedSave);
    const mg = EC.migrate(save);
    T.rec('b', 'migrate_econ', mg.gift); persist();
  }
  // 11-28 Cc 定 A 新阵容（全量设计第 207 条）：老存档里的旧编号换成新的。qilin（老的火麒麟 / 段 1 的麒麟）、shizi（段 1 的小狮子）都改成狐狸；5 级以上是三尾狐
  // 段 2 查出来：0.9.24 的墨斗蚕 5 级长大叫 hudie，新阵容里 hudie 是 10 级的第三个样子；5–9 级的换成第二个样子蚕茧 canjian（等级、已喂的丹原样）
  if (obj(save.pets) && obj(save.pets.hudie) && int(save.pets.hudie.lv, 1, EC.LV_CAP) < PG.ULT_LV && !save.pets.canjian) { save.pets.canjian = save.pets.hudie; delete save.pets.hudie; if (Array.isArray(save.petOrder)) save.petOrder = save.petOrder.map((x) => (x === 'hudie' ? 'canjian' : x)); if (save.activePet === 'hudie') save.activePet = 'canjian'; }
  if (obj(save.pets)) [['shizi', 'huli'], ['qilin', null]].forEach(([from, to0]) => { const r = save.pets[from]; if (!obj(r)) return; const to = to0 || (int(r.lv, 1, EC.LV_CAP) >= PG.EVO_LV ? 'sanweihu' : 'huli'); if (!save.pets[to]) save.pets[to] = r; delete save.pets[from]; if (Array.isArray(save.petOrder)) save.petOrder = save.petOrder.map((x) => (x === from ? to : x)); if (save.activePet === from) save.activePet = to; });
  // 宠物：只留认得的；等级、这一级喂了几颗落在范围里。段 2：喂的够了新价就往上滚一级（不再砍掉多的），等级只升不降
  Object.keys(save.pets).forEach((id) => {
    const r = save.pets[id];
    if (!PG.PETS[id] || !obj(r)) { delete save.pets[id]; return; }
    EC.normalizePet(r);
  });
  Object.keys(PG.PETS).forEach((id) => { const e = PG.PETS[id].evo; if (e && save.pets[id] && save.pets[e]) delete save.pets[id]; }); // 进化前后两只都在：留进化后的
  // 0.9.25：够级还没进化的（坏存档、手改的存档、老存档）：直接进化掉；11-28 起每只有两次长大，所以过两遍
  for (let pass = 0; pass < 2; pass++) Object.keys(save.pets).forEach((id) => { const d = PG.PETS[id]; if (d && d.evo && !save.pets[d.evo] && save.pets[id].lv >= d.evoLv) { save.pets[d.evo] = save.pets[id]; delete save.pets[id]; save.petOrder = save.petOrder.map((x) => (x === id ? d.evo : x)); if (save.activePet === id) save.activePet = d.evo; } });
  save.petOrder = save.petOrder.filter((id, n, a) => save.pets[id] && a.indexOf(id) === n);
  Object.keys(save.pets).forEach((id) => { if (save.petOrder.indexOf(id) < 0) save.petOrder.push(id); });
  // 过了送宠物的那一关、手里却没有那只（0.9.8 以前铜雀是第 3 关才送）：补上，不然后面要打铁石的关没有宠物永远过不了
  for (let i = 0; i < save.petStage && i < PLV.length; i++) { const gf = PLV[i].gift; if (gf && !ownedOf(gf)) { save.pets[gf] = EC.newPet(); save.petOrder.push(gf); save.petSeen[gf] = false; } } // 段 3：老存档补发的（打过第 5、13、17 关的）排队演出场
  if (!save.activePet || !save.pets[save.activePet]) save.activePet = save.petOrder[0] || null;
  if (!obj(save.slots)) save.slots = {};
  if (save.switchTeach !== undefined && !(obj(save.switchTeach) && save.pets[save.switchTeach.id] && save.petOrder.length > 1)) delete save.switchTeach; // 段 3：教换宠物的记号坏了 / 那只没了就不教
}

// ---------- 主循环 ----------
let lastModeRec = null;
let frameBad = 0; // 连着几帧画到一半出错
function frame() {
  try { frameBody(); frameBad = 0; } catch (err) { logErr('frame', err); if (++frameBad >= 30) { frameBad = 0; try { frameRescue(); } catch (e2) { logErr('rescue', e2); } } }
  P.nextFrame(frame); // 出错也照样排下一帧，画面不会定住
}
// 同一页连着半秒每帧都画到一半出错 = 这页的按钮出不来，玩家点什么都没反应（0.9.14 那次「结算页不弹」就是这样）。换到一页能点的：
// 结算 / 分享 → 地图（账在出结算页之前已经记好了）；进关卡片、说明卡 → 直接进关；广告 → 当看完；过场 → 跳过；地图、设置 → 主菜单；宠物园 → 地图。
// 关里出错不动它：棋盘和托盘画在前面，照样能拖
function frameRescue() {
  const was = mode;
  drag = null; downBtn = null; downTouch = null;
  if (mode === 'cut') { CUT.clear(); endCuts(); if (mode === 'cut') mode = 'map'; }
  else if (mode === 'over') mode = 'map';
  else if (mode === 'start') { mode = (startCard && startCard.next) || 'play'; startCard = null; }
  else if (mode === 'intro') { if (introKind) { save.introSeen[introKind] = true; persist(); } introKind = null; mode = 'play'; }
  else if (mode === 'ad') { const f = ad && ad.done; ad = null; mode = 'play'; if (f) f(); }
  else if (mode === 'camp') mode = 'map';
  else if (mode === 'map' || mode === 'settings') mode = 'home';
  if (mode !== was) T.rec('X', 'rescue', was + ' → ' + mode);
}
function frameBody() {
  const now = P.now();
  if (P.bgm.playing() !== null && !['play', 'intro', 'start', 'over', 'ad', 'cut'].includes(mode)) P.bgm.stop(); // 离开关卡（地图、宠物园、主菜单）：音乐停
  if (mode !== lastModeRec) { if (mode !== 'cut' && lastModeRec !== 'cut') transAt = clock; T.rec('m', mode); lastModeRec = mode; if (mode === 'play' && g && g.pets && !g._recL) { g._recL = true; const pt = g.team[0]; T.rec('L', g.stage && g.stage.evolve ? 'evo' : petIdx + 1, pt ? pt.id : '', pt ? pt.lv : 0, ((save.loss || {})[petIdx] || 0) + 1); } // 真进了关里才算开一关（开机时垫底摆好的盘不算）
  if (mode === 'over' || mode === 'settings') T.prepare({ ver: VERSION, log: save.playLog || [] }); } // 到结算、设置页先把记录压好，点复制时马上能用
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(mode === 'cut' ? 0 : dt);
  buttons = [];
  LY.setMetrics(W, mode === 'map' || mode === 'camp' ? uiTop() : L.top, H); LY.beginFrame();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (mode !== 'cut' && CUT.playing) CUT.clear(); // 过场中被别的入口切走了（只有测试会这样）
  if (mode === 'cut') {
    CUT.update(dt * 1000);
    if (CUT.playing) CUT.draw(); else { endCuts(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  } else if (mode === 'home') {
    drawHome();
  } else if (mode === 'settings') {
    drawSettings();
  } else if (mode === 'logpages') {
    drawLogPages();
  } else if (mode === 'camp') {
    drawCamp();
  } else if (mode === 'map') {
    catchUpEntrance();
    ctx.save();
    drawChapter(); // 0.8：章页取代弯路地图（旧地图 0.9.25 拆掉了）
    ctx.restore();
  } else {
    ctx.save();
    if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const rushBeat = rushCardBeat(); if (rushBeat) ctx.translate(rushBeat.x, rushBeat.y);
    // 0.9.20 学《潜水员戴夫》的头目亮相：头目关一开场镜头推近、抖一下，再拉远看全场
    if (g && g.pets && g.stage && g.stage.goal && g.stage.goal.boss && mode === 'play') { const ba = clock - enterAt; if (ba > -0.1 && ba < 1.3) { const k = Math.min(1, Math.max(0, (ba - 0.35) / 0.9)), z = 1.35 - 0.35 * (k * k * (3 - 2 * k)), qx = L.bx + L.board / 2, qy = L.by + L.board / 2; ctx.translate(qx, qy); ctx.scale(z, z); ctx.translate(-qx, -qy); if (ba < 0.35) ctx.translate(Math.sin(clock * 70) * 6, Math.cos(clock * 60) * 4); } }
    drawBg();
    drawHud();
    drawBoard(mode === 'play');
    drawTray();
    drawFoot();
    drawFx();
    drawTutorial();
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = 'rgba(255,244,214,' + flash + ')'; ctx.fillRect(0, 0, W, H); }
    { const rp = rushPlayPulse(); if (rp > 0.01) { const gc = rushGlow().join(','); ctx.fillStyle = 'rgba(' + gc + ',' + (0.05 + rp * 0.15) + ')'; ctx.fillRect(0, 0, W, H); ctx.save(); ctx.shadowColor = 'rgba(' + gc + ',0.95)'; ctx.shadowBlur = 10 + rp * 30; ctx.strokeStyle = 'rgba(' + gc + ',' + (0.35 + rp * 0.65) + ')'; ctx.lineWidth = 5 + rp * 7; ctx.strokeRect(L.bx - 7, L.by - 7, L.board + 14, L.board + 14); ctx.restore(); } }
    if (mode === 'over' || (mode === 'ad' && result)) drawOver();
    if (mode === 'intro') drawIntro();
    if (mode === 'start') { const rb = rushCardBeat(); ctx.save(); if (rb) ctx.translate(rb.x * 1.4, rb.y * 1.4); drawStartCard(); ctx.restore(); if (rb) { ctx.fillStyle = 'rgba(' + rushGlow(startCard.i).join(',') + ',' + (0.06 + rb.pulse * 0.1) + ')'; ctx.fillRect(0, 0, W, H); } }
    if ((mode === 'play' || mode === 'intro') && g.pets) drawPetCaption();
    if (g.pets) drawInfo();
    if (mode === 'ad') drawAd();
  }
  if (evoAnim) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); buttons = []; drawEvoAnim(); }
  if (g && g.pets && g.team && g.team.length && (mode === 'play' || mode === 'start') && clock - enterAt < 0.9 && clock - enterAt > -0.2) { // 0.9.20 进关：宠物从屏幕左边一路跑进右下角的宠物格
    const k = Math.min(1, Math.max(0, (clock - enterAt + 0.2) / 1.0)), to = slotCenter(3), x0 = -40, e = 1 - Math.pow(1 - k, 2);
    if (k < 1) { const px = x0 + (to.x - x0) * e, py = to.y - 10 - Math.abs(Math.sin(k * Math.PI * 4)) * 18; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); petIcon(g.team[0].id, px, py, 40, 0, 0); }
  }
  if (PLAYTEST && !evoAnim) drawSnapButton();
  // 换页面：0.3 秒从暗处淡进来（0.9.13，Cc：「一切转场都需要你做一个简单的动画」）
  const ta = (clock - transAt) / 0.3;
  if (ta < 1 && ta >= 0) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = 'rgba(6,8,20,' + (0.9 * (1 - ta) * (1 - ta)) + ')'; ctx.fillRect(0, 0, W, H); }
  hapticFlush(); // 上一下没隔够 40 毫秒、留下来的震动
}

// 第一次打开：直接进第 1 关（10 秒内爽）；以后先看旅程地图
CUT = require('./cuts.js')({
  P, W, H, dpr, withCtx, petIcon, inkMonster, text, PG, sound: (n, v) => P.sound(n, v),
  get save() { return save; }, persist, getCtx: () => ctx,
});
try { fixSave(); } catch (err) { logErr('fixSave', err); }
// 开机这一步出错（老存档里有读不懂的东西、过场图画不出来）不能黑屏：记一笔，退到主菜单
try {
  if (!save.petTutDone) newPetLevel(0);
  else { newPetLevel(0, true); mode = 'home'; } // 老玩家先看主菜单 // 以后每次打开先看主菜单
} catch (err) {
  logErr('init', err);
  try { CUT.clear(); newPetLevel(0, true); } catch (e2) { logErr('init2', e2); }
  mode = 'home';
}
P.nextFrame(frame);

// 给测试用（只在浏览器里挂到 window 上）
// 游戏修改器（共用界面编辑器）要的接口：画面名、切画面、画布大小（只在浏览器里挂上）
const EDITOR_SCENES = [
  { id: 'home', name: '主菜单', go: () => { CUT.clear(); mode = 'home'; } },
  { id: 'map', name: '地图（章页）', go: () => { CUT.clear(); chapView = null; chapSel = null; mode = 'map'; } },
  { id: 'camp', name: '宠物园', go: () => { CUT.clear(); mode = 'map'; openCamp(); } },
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
  get paintIdx() { return paintIdx; }, stats, L, fingerFor, fingerForHand, skillTarget, tutorialTarget, slotCenter, buttons: () => buttons.slice(),
  get stageIdx() { return stageIdx; }, get chipPos() { return chipPos; },
  PG, PLV, EC, newPetLevel, openCamp, get petIdx() { return petIdx; },
  reset() { save = freshSave(); persist(); newPetLevel(0); },
  setSave(o) { Object.assign(save, o); persist(); },
  get cutPlaying() { return CUT.playing; }, levelUpPet, danToLevel, get CUT() { return CUT; }, playCuts, skipCuts() { while (mode === 'cut') { CUT.skip(); if (!CUT.playing) endCuts(); } if (mode === 'start' && startCard) { mode = startCard.next || 'play'; startCard = null; } },
  soundLog: () => P.soundLog.slice(), clearSoundLog: () => { P.soundLog.length = 0; }, rushPulse: () => rushPlayPulse(), endGame, core, T, fixSave, get capsule() { return CAP; }, get uiTop() { return uiTop(); }, get drag() { return drag; },
});
