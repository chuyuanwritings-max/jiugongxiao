// 洛书九宫 原型 0.3：旅程地图 + 15 关（照 Woodoku 旅程）、经典 3 分钟拼画、拖块、特效、结算、画册。规则全在 core.js，关卡在 levels.js。
const P = require('./platform.js');
const C = require('./config.js');
const core = require('./core.js');
const art = require('./art.js');
const LV = require('./levels.js');
const SG = require('./siege.js');

const COL = C.color;
const KEY = 'luoshu_save_v1';
const ITEMS = [
  { id: 'sparrow', name: '铜雀', tip: '消中宫 +5 秒' },
  { id: 'crossbow', name: '连弩车', tip: '连击 3 射穿一行' },
  { id: 'turtle', name: '蒸汽龟', tip: '堆死时送单格' },
];

function freshSave() {
  return {
    wins: 0, won: [false, false, false], litEver: [0, 1, 2].map(() => new Array(9).fill(false)),
    coins: 0, best: 0, bestEndless: 0, items: {}, tutorialDone: false, buySingle: false, plays: 0,
    stage: 0, introSeen: {}, // 旅程：已经过了几关、哪些说明卡看过
    siegeDone: false, siegeBest: 0, // 守城：第一局（教学）打过没有、最多守住几波
  };
}
let save = Object.assign(freshSave(), P.load(KEY) || {});
if (!save.introSeen) save.introSeen = {};
const persist = () => P.save(KEY, save);

// ---------- 画布和布局 ----------
const scr = P.setup(onTouch);
const { ctx, width: W, height: H, dpr } = scr;
const L = {};
(function layout() {
  L.top = H > 760 ? 34 : 14;
  const B = Math.min(W - 20, Math.floor(H * 0.48), 432);
  L.cell = Math.floor(B / 9);
  L.board = L.cell * 9;
  L.bx = Math.round((W - L.board) / 2);
  L.by = L.top + 86;
  L.trayH = Math.max(110, Math.min(L.cell * 4, H - (L.by + L.board + 22) - 96));
  // 屏幕高出来的部分：整体往下挪一点，手指够得着
  const slack = H - (L.by + L.board + 22 + L.trayH + 96);
  if (slack > 0) { L.top += Math.round(slack * 0.45); L.by += Math.round(slack * 0.45); }
  L.trayY = L.by + L.board + 22;
  L.mini = Math.max(20, Math.round(L.cell * 0.82)); // 底下三块的格子大小
  L.lift = Math.round(L.cell * 2.1); // 拖起来浮在手指上方多高
  L.footY = L.trayY + L.trayH + 8;
})();

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
  const n = C.blockColors.length;
  return ((g.deals || 0) * 3 + i * 2 + (g.seedColor || 0)) % n;
}

// ---------- 状态 ----------
let g = null; // 这一局
let paintIdx = 0;
let mode = 'play'; // play / over / album / ad
let overAt = 0; // 结束的时刻（结算页晚一点出来）
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
  const k = ci < 0 ? C.prefillColor : C.blockColors[ci || 0];
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
  else if (ev.center) say('城心！');
  else if (ev.beat >= 4) say(ev.combo >= 2 ? '好！' : '连上了');
  else if (ev.newlyLit.length) say('亮了');
}

// ---------- 一局结束 ----------
function endGame() {
  overAt = clock;
  stats.overs.push(P.now());
  drag = null;
  if (g.siege) return endSiege();
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
    chipPop[f.what] = clock;
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
  button('map', 12, y + 4, 44, 38, '‹', { size: 28, bg: COL.wood, fn: () => { mode = 'map'; } });
  text('第 ' + (stageIdx + 1) + ' 关', W / 2, y + 10, 15, COL.dim, 'center', 'normal');
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
  if (g.stage) return drawStageHud();
  const y = L.top;
  button('map', 12, y + 4, 44, 38, '‹', { size: 28, bg: COL.wood, fn: () => { mode = 'map'; } });
  // 分数
  text(String(Math.round(displayScore)), 66, y + 18, 30, COL.text, 'left');
  text('最高 ' + (g.endless ? save.bestEndless : save.best), 66, y + 46, 13, COL.dim, 'left', 'normal');
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
  flyers.forEach((f) => {
    const a = (clock - f.t) / 0.55;
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
  if ((save.tutorialDone && !siegeTut) || !g || g.moves > 0 || drag || !g.hand[0]) return;
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
      button('revive', bx, py + 270, bw * 0.6 - 6, 44, '清空中宫', { size: 17, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { g.revive(); mode = 'play'; result = null; stats.starts.push(P.now()); }) });
      button('tomap', bx + bw * 0.6 + 6, py + 270, bw * 0.4 - 6, 44, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
    } else button('tomap', bx, py + 270, bw, 44, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
function drawOver() {
  if (g.siege) return drawSiegeOver();
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
  else if (9 - r.lit <= 2) title = '只差 ' + (9 - r.lit) + ' 宫！';
  else title = '亮了 ' + r.lit + ' / 9 宫';
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
    const lbl = g.reason === 'time' ? '+20 秒' : '清空中宫';
    button('revive', (W - bw) / 2, by + 76, bw * 0.62 - 6, 50, lbl, { size: 19, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { g.revive(); mode = 'play'; result = null; stats.starts.push(P.now()); }) });
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
  const top = L.top + 110, bottom = H - 250;
  const step = (bottom - top) / (MAP_SHOW - 1);
  return { x: W / 2 + (i % 2 ? 1 : -1) * Math.min(62, W * 0.16), y: bottom - (i - lo) * step, step };
}
// 两关之间的小图：第 i 关过了才亮。每 5 关一张画，5 张小图 = 那张画的 5 宫
function mapPicture(i, x, y, s) {
  const ch = Math.floor(i / 5) % art.COUNT, b = (i % 5) * 2;
  const S = paintSize[ch], q = S / 3;
  const open = i < save.stage;
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
  const cur = Math.min(save.stage, LV.length - 1);
  const done = save.stage >= LV.length;
  const lo = Math.max(0, Math.min(cur - 1, LV.length - MAP_SHOW));
  const hi = lo + MAP_SHOW - 1;
  // 路：先画整条（往两头多画一节，像能接着走），过了的那段是黄铜色
  for (let i = lo - 1; i <= hi; i++) {
    if (i < 0 || i + 1 >= LV.length) continue;
    const a = mapNodePos(i, lo), b = mapNodePos(i + 1, lo);
    const passed = i + 1 <= save.stage;
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
    const passed = i < save.stage, isCur = i === cur && !done;
    const rad = isCur ? 30 + Math.sin(clock * 4) * 2 : 26;
    if (isCur) {
      ctx.strokeStyle = 'rgba(111,208,168,' + (0.5 + Math.sin(clock * 4) * 0.3) + ')'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y, rad + 8, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(x, y + 3, rad + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = passed ? COL.brass : isCur ? COL.red : COL.woodDark; // 当前关用朱砂：全屏唯一一点高饱和
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    text(String(i + 1), x, y + 1, isCur ? 26 : 22, passed ? COL.ink : isCur ? COL.text : COL.dim);
    if (passed) text('✓', x + 20, y - 20, 16, COL.jade);
    // 每 5 关一个齿轮奖章（拼成一张画）
    if (i % 5 === 4) gearIcon(x, y - rad - 16, 11, passed ? clock : 0, passed ? COL.brassLight : COL.woodLine);
    // 过了的关和当前关能点
    if (i <= cur) buttons.push({ id: 'node' + i, x: x - rad, y: y - rad, w: rad * 2, h: rad * 2, fn: () => newStage(i) });
  }
  // 顶栏压在路上面：标题、进度、金币
  const hg = ctx.createLinearGradient(0, 0, 0, L.top + 70);
  hg.addColorStop(0, COL.bg); hg.addColorStop(0.75, COL.bg); hg.addColorStop(1, 'rgba(14,19,48,0)');
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W, L.top + 70);
  text('旅程', W / 2, L.top + 24, 28, COL.brassLight);
  text(save.coins + ' 金', W - 20, L.top + 24, 17, COL.brassLight, 'right');
  text(Math.min(save.stage, LV.length) + ' / ' + LV.length, 20, L.top + 24, 17, COL.dim, 'left');
  // 底栏同样压住路
  const fg = ctx.createLinearGradient(0, H - 215, 0, H);
  fg.addColorStop(0, 'rgba(9,12,32,0)'); fg.addColorStop(0.2, COL.bgLow); fg.addColorStop(1, COL.bgLow);
  ctx.fillStyle = fg; ctx.fillRect(0, H - 215, W, 215);
  // 下一关要干什么：目标图标
  const st = LV[cur];
  const keys = Object.keys(st.goal);
  const gy = H - 186;
  const cw = 58, x0 = W / 2 - (cw * keys.length) / 2;
  keys.forEach((key, n) => {
    const cx = x0 + cw * n + cw / 2;
    if (key === 'score') text(st.goal.score + ' 分', cx, gy, 18, COL.text);
    else { goalIcon(key, cx - 12, gy, 20); text('×' + st.goal[key], cx + 14, gy, 16, COL.text); }
  });
  const bw = Math.min(W - 60, 300);
  button('play', (W - bw) / 2, H - 160, bw, 64, done ? '再玩第 ' + LV.length + ' 关' : '第 ' + (cur + 1) + ' 关', { size: 28, fn: () => newStage(cur) });
  const b3 = (bw - 16) / 3, bx3 = (W - bw) / 2;
  button('siege', bx3, H - 82, b3, 46, '守城', { size: 18, bg: COL.red, fn: () => newSiege() });
  button('classic', bx3 + b3 + 8, H - 82, b3, 46, '经典拼画', { size: 15, bg: COL.copper, fn: () => newGame(false) });
  button('album3', bx3 + (b3 + 8) * 2, H - 82, b3, 46, '画册', { size: 17, bg: COL.wood, fn: () => openAlbum() });
  // 「守城」是肉鸽试玩版：角上一个小红点「新」
  ctx.fillStyle = COL.jade; ctx.beginPath(); ctx.arc(bx3 + b3 - 6, H - 80, 9, 0, Math.PI * 2); ctx.fill();
  text('新', bx3 + b3 - 6, H - 80, 11, COL.ink, 'center');
}

// ---------- 新东西的说明卡（一张小动画 + 一两行字 +「继续」） ----------
const INTRO = {
  gem: { title: '收集宝石', lines: ['消掉宝石所在的', '行、列或宫，就收走它'], row: ['b', 'g', 'b', '.', 'b'], key: 'b' },
  box: { title: '机关匣', lines: ['它消不掉。它在的行、列或宫', '每消一次，收一个'], row: ['b', 'M', 'b', '.', 'b'], key: 'box' },
  bubble: { title: '泡泡', lines: ['先把块放到泡泡上，', '再消掉那一格，泡泡就破'], row: ['b', 'b', '*', 'b', 'b'], key: 'bubble' },
};
function drawIntro() {
  const it = INTRO[introKind];
  ctx.fillStyle = COL.shade + '0.8)'; ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - 40, 340), ph = 330, px = (W - pw) / 2, py = (H - ph) / 2 - 30;
  ctx.fillStyle = COL.ink; rr(px, py + 6, pw, ph, 18); ctx.fill();
  ctx.fillStyle = COL.wood; rr(px, py, pw, ph, 18); ctx.fill();
  ctx.strokeStyle = COL.brass; ctx.lineWidth = 3; rr(px + 6, py + 6, pw - 12, ph - 12, 14); ctx.stroke();
  text(it.title, W / 2, py + 40, 28, COL.brassLight);
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
    const from = it.key === 'box' ? it.row.indexOf('M') : it.key === 'bubble' ? hole : gemCell;
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
  albumFrom = mode === 'over' ? 'over' : mode === 'map' ? 'map' : 'play';
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
    size: 24, fn: () => (albumFrom === 'map' ? (mode = 'map') : albumFrom === 'over' ? (g.stage ? (mode = 'over') : newGame(g.endless && save.wins >= 2)) : (mode = 'play')),
  });
}

// ---------- 守城（肉鸽试玩版）：画面 ----------
// 规则在 siege.js。这里管：车道和攻城车、机关栏、机关一件件发动的动画、三选一卡、结算。
const SCHOOL_COL = { bow: '#4470c0', fire: COL.red, luoshu: COL.brass, star: '#8a62bf', ink: '#3f9a7c' };
let timeline = []; // 排好时间的小事件 { t, fn }
let ghosts = []; // 被机关打掉、还没轮到它碎的格子 { k, t, ci }
let relicPop = {}; // 机关栏图标跳一下 { id: 时刻 }
let beams = []; // 机关栏连到棋盘的一道光 { from, to, t, col }
let colBolts = []; // 竖着射的连弩 { col, t }
let siegeFx = { cartX: 0, cartHit: -9, cartDead: -9, banner: null, chooseAt: 0, tip: null, lastWave: -1 };
function runTimeline() {
  if (!timeline.length) return;
  const due = timeline.filter((e) => clock >= e.t);
  timeline = timeline.filter((e) => clock < e.t);
  due.forEach((e) => e.fn());
}
const siegeBusy = () => timeline.length > 0;
function newSiege() {
  stageIdx = -1;
  g = SG.createSiege({ seed: (P.now() ^ (save.plays * 2654435761)) >>> 0, tutorial: !save.siegeDone });
  startCommon();
  for (const k of g.prefilled) colorAt[k] = -1;
  timeline = []; ghosts = []; relicPop = {}; beams = []; colBolts = [];
  siegeFx = { cartX: 0, cartHit: -9, cartDead: -9, banner: null, chooseAt: clock + (g.phase === 'choose' ? 0.2 : 0), tip: null, lastWave: -1 };
  waveBanner();
}
function waveBanner() {
  const w = g.waveDef;
  siegeFx.banner = { text: '第 ' + (g.wave + 1) + ' 波 · ' + w.name + (w.bossLine ? '' : ''), sub: w.bossLine || '', t: clock };
}
// 机关栏里第 n 格的中心
function relicSlotPos(n) {
  const s = 40, gap = 8, tot = SG.SLOTS * s + (SG.SLOTS - 1) * gap;
  return { x: (W - tot) / 2 + n * (s + gap) + s / 2, y: L.top + 66, s };
}
function boxCenter(b) { return { x: cellX((b % 3) * 3) + L.cell * 1.5, y: cellY(Math.floor(b / 3) * 3) + L.cell * 1.5 }; }
function lineCenter(l) { return l.axis === 'row' ? { x: L.bx + L.board / 2, y: cellY(l.idx) + L.cell / 2 } : { x: cellX(l.idx) + L.cell / 2, y: L.by + L.board / 2 }; }
const cartLane = () => ({ x0: 40, x1: W - 58, y: L.top + 26 });
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
      const lbl = '×' + (Math.round(m.m * 100) / 100);
      texts.push({ s: lbl, x: W / 2, y: L.by + L.board * 0.38, t: clock, size: 52, col: m.id === 'star' ? '#d3bdf0' : COL.brassLight, big: true });
      P.sound('five', 0.5);
    } });
    t += 0.2;
  });
  // 最后：总伤害飞上去砸在车上
  const lane = cartLane();
  timeline.push({ t, fn: () => {
    if (res.dmg > 0) {
      flyers.push({ what: 'dmg', s: '-' + res.dmg, x: L.bx + L.board / 2, y: L.by + L.board * 0.5, t: clock, to: { x: lane.x0 + siegeFx.cartX, y: lane.y } });
      if (nRelic >= 2) say(nRelic >= 4 ? '好一串！' : '连上了');
    }
  } });
  timeline.push({ t: t + 0.5, fn: () => {
    if (res.dmg > 0) { siegeFx.cartHit = clock; P.sound(res.dmg >= 60 ? 'combo4' : 'place', 0.6); }
    if (sev.killed) {
      siegeFx.cartDead = clock;
      const lx = lane.x0 + siegeFx.cartX;
      for (let n = 0; n < 14; n++) { const a = Math.random() * Math.PI * 2, sp = 100 + Math.random() * 160; fx.push({ kind: 'gear', x: lx, y: lane.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, t: clock, life: 0.9, s: 5 + Math.random() * 6, a: 0 }); }
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
  const y = L.top;
  button('map', 12, y + 48, 40, 36, '‹', { size: 26, bg: COL.wood, fn: () => { timeline = []; mode = 'map'; } });
  // 车道：从左往右四步，右边是城门
  const lane = cartLane();
  ctx.fillStyle = COL.ink; rr(lane.x0 - 10, lane.y + 10, lane.x1 - lane.x0 + 20, 8, 4); ctx.fill();
  ctx.fillStyle = '#5a4630'; rr(lane.x0 - 10, lane.y + 9, lane.x1 - lane.x0 + 20, 6, 3); ctx.fill();
  for (let n = 0; n <= SG.ROUNDS; n++) {
    const x = lane.x0 + ((lane.x1 - lane.x0) * n) / SG.ROUNDS;
    ctx.fillStyle = n === SG.ROUNDS ? COL.red : COL.woodLine; ctx.fillRect(x - 1, lane.y + 6, 2, 12);
  }
  // 城门
  const gx = lane.x1 + 14;
  ctx.fillStyle = COL.ink; rr(gx - 16, lane.y - 16, 32, 36, 4); ctx.fill();
  ctx.fillStyle = '#6b5a44'; rr(gx - 14, lane.y - 14, 28, 32, 3); ctx.fill();
  ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(gx, lane.y + 18, 8, Math.PI, 0); ctx.fill();
  ctx.fillStyle = COL.red; ctx.fillRect(gx - 14, lane.y - 18, 28, 5);
  // 车：每轮走一步，平滑地挪过去
  const target = ((g.round - 1) / SG.ROUNDS) * (lane.x1 - lane.x0);
  if (siegeFx.lastWave !== g.wave) { siegeFx.lastWave = g.wave; siegeFx.cartX = 0; waveBanner(); }
  siegeFx.cartX += (target - siegeFx.cartX) * Math.min(1, 0.1);
  const dead = g.phase !== 'play' || clock - siegeFx.cartDead < 0.6;
  if (!dead) {
    const hitA = clock - siegeFx.cartHit;
    const jig = hitA < 0.25 ? Math.sin(hitA * 60) * 4 : 0;
    const cx = lane.x0 + siegeFx.cartX + jig, cy = lane.y;
    drawCart(cx, cy, g.waveDef.boss, hitA < 0.12);
    // 血条
    const bw = 64, frac = g.hp / g.hpMax;
    ctx.fillStyle = COL.ink; rr(cx - bw / 2 - 2, cy - 30, bw + 4, 11, 5); ctx.fill();
    ctx.fillStyle = COL.woodDark; rr(cx - bw / 2, cy - 29, bw, 8, 4); ctx.fill();
    ctx.fillStyle = frac < 0.3 ? COL.jade : COL.red; rr(cx - bw / 2, cy - 29, Math.max(4, bw * frac), 8, 4); ctx.fill();
    text(String(g.hp), cx + bw / 2 + 16, cy - 25, 13, COL.text);
  }
  // 右边：第几波、车名（上弦时换成上弦倍率）
  text('第 ' + (g.wave + 1) + ' 波', W - 12, y + 50, 13, COL.dim, 'right', 'normal');
  if (g.charge > 1) text('上弦 ×' + g.charge, W - 12, y + 67, 13, COL.brassLight, 'right');
  else text(g.waveDef.name, W - 12, y + 67, 13, g.waveDef.boss ? COL.red : COL.text, 'right');
  // 机关栏
  for (let n = 0; n < SG.SLOTS; n++) {
    const p = relicSlotPos(n);
    const r = g.relics[n];
    if (!r) {
      ctx.strokeStyle = COL.woodLine; ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2 - 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    const pa = relicPop[r.id] ? Math.max(0, 0.3 - (clock - relicPop[r.id])) / 0.3 : 0;
    relicIcon(r.id, p.x, p.y, p.s, r.lv, pa);
    buttons.push({ id: 'relic' + n, x: p.x - p.s / 2, y: p.y - p.s / 2, w: p.s, h: p.s, fn: () => { siegeFx.tip = { id: r.id, t: clock }; } });
  }
  // 点机关看一行字
  if (siegeFx.tip && clock - siegeFx.tip.t < 2) {
    const R = SG.RELICS[siegeFx.tip.id], L2 = g.lvOf(siegeFx.tip.id);
    const s2 = R.name + '：' + R.desc[Math.max(0, L2 - 1)];
    ctx.font = 'bold 15px sans-serif';
    const tw = ctx.measureText(s2).width + 24;
    ctx.fillStyle = COL.steam; rr((W - tw) / 2, L.top + 90, tw, 30, 8); ctx.fill();
    ctx.font = 'bold 15px "PingFang SC", sans-serif'; ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s2, W / 2, L.top + 105);
  }
  // 换波横幅（头目一行规矩）
  const bn = siegeFx.banner;
  if (bn && clock - bn.t < 2.2 && g.phase === 'play') {
    const a = Math.min(1, (clock - bn.t) * 4) * Math.min(1, (2.2 - (clock - bn.t)) * 3);
    ctx.globalAlpha = a;
    ctx.fillStyle = COL.shade + '0.75)'; ctx.fillRect(0, L.by + L.board * 0.36, W, bn.sub ? 76 : 50);
    text(bn.text, W / 2, L.by + L.board * 0.36 + 25, 26, bn.sub ? COL.red : COL.brassLight);
    if (bn.sub) text(bn.sub, W / 2, L.by + L.board * 0.36 + 56, 15, COL.text, 'center', 'normal');
    ctx.globalAlpha = 1;
  }
}
// 攻城车：木车身 + 两个轮子 + 前面一根撞木；头目是红顶
function drawCart(x, y, boss, white) {
  ctx.fillStyle = COL.ink; rr(x - 22, y - 14, 44, 24, 4); ctx.fill();
  ctx.fillStyle = white ? '#fff' : boss ? '#8f3b2e' : '#7a5a36'; rr(x - 20, y - 12, 40, 20, 3); ctx.fill();
  ctx.fillStyle = white ? '#fff' : '#a9824f'; ctx.fillRect(x - 18, y - 10, 36, 4);
  ctx.fillStyle = COL.ink; ctx.fillRect(x + 18, y - 4, 16, 6);
  ctx.fillStyle = COL.copper; ctx.fillRect(x + 30, y - 6, 6, 10);
  if (boss) { ctx.fillStyle = COL.red; ctx.beginPath(); ctx.moveTo(x - 20, y - 12); ctx.lineTo(x, y - 24); ctx.lineTo(x + 20, y - 12); ctx.fill(); }
  for (const wx of [x - 12, x + 12]) {
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(wx, y + 10, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.copper; ctx.beginPath(); ctx.arc(wx, y + 10, 4.5, 0, Math.PI * 2); ctx.fill();
  }
}
// 三选一：三张横卡竖着排（拇指够得着）
function drawSiegeChoose() {
  if (g.phase !== 'choose' || !g.offer || clock < siegeFx.chooseAt || siegeBusy()) return;
  const age = clock - siegeFx.chooseAt;
  ctx.fillStyle = COL.shade + Math.min(0.85, age * 3) + ')'; ctx.fillRect(0, 0, W, H);
  const opening = g.wavesWon === 0;
  text(opening ? '开局挑一件机关' : '打掉了！挑一件机关', W / 2, L.by + 10, 26, COL.brassLight);
  text(opening ? '机关会自己发动' : '下一波：' + (SG.WAVES[g.wave + 1] ? SG.WAVES[g.wave + 1].name : '重车'), W / 2, L.by + 42, 14, COL.dim, 'center', 'normal');
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
    if (pal && !have) text('配你的' + pal, x + cw - 14, y + 26, 13, COL.jade, 'right');
    ctx.globalAlpha = 1;
    buttons.push({ id: 'pick' + n, x, y, w: cw, h: ch, fn: () => {
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
  save.siegeBest = Math.max(save.siegeBest || 0, g.wavesWon);
  coinsGot = Math.floor(g.totalDmg / 40) + g.wavesWon * 3;
  save.coins += coinsGot;
  persist();
  result = { won: g.won, reason: g.reason, near: g.nearMiss(), doubled: false };
  mode = 'over';
  if (!g.won) { P.sound('lose', 0.6); say(g.reason === 'gate' ? '城破了' : '堵住了'); }
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
  const title = r.won ? '守住了！' : g.reason === 'gate' ? (r.near ? '只差 ' + g.hp + ' 点！' : '城破了') : '堵住了';
  text(title, W / 2, py + 42, 30, r.won ? COL.brassLight : r.near ? COL.red : COL.text);
  text('打下 ' + g.wavesWon + ' 波  ·  最狠一手 ' + g.bestHit + ' 点', W / 2, py + 82, 16, COL.text, 'center', 'normal');
  // 这一局的机关
  const n = g.relics.length;
  g.relics.forEach((rl, i) => relicIcon(rl.id, W / 2 + (i - (n - 1) / 2) * 50, py + 126, 40, rl.lv, 0));
  if (!n) text('（没拿机关）', W / 2, py + 126, 14, COL.dim, 'center', 'normal');
  text('+' + coinsGot + ' 金  ·  最多守住 ' + save.siegeBest + ' 波', W / 2, py + 170, 15, COL.brassLight, 'center', 'normal');
  const bw = pw - 48, bx = px + 24;
  if (r.won) {
    button('cont', bx, py + 196, bw, 58, '继续守（车更硬）', { size: 22, fn: () => { g.continueRun(); mode = 'play'; result = null; siegeFx.chooseAt = clock + 0.1; } });
    button('again', bx, py + 266, bw * 0.6 - 6, 46, '再守一次', { size: 18, bg: COL.copper, fn: () => newSiege() });
    button('tomap', bx + bw * 0.6 + 6, py + 266, bw * 0.4 - 6, 46, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
  } else {
    button('again', bx, py + 196, bw, 58, '再守一次', { size: 24, fn: () => newSiege() });
    if (g.adsUsed < C.adMax) {
      button('revive', bx, py + 266, bw * 0.6 - 6, 46, g.reason === 'gate' ? '多打一轮' : '清空中宫', { size: 17, bg: COL.copper, ad: true, fn: () => continueAfterAd(() => { g.revive(); mode = 'play'; result = null; stats.starts.push(P.now()); }) });
      button('tomap', bx + bw * 0.6 + 6, py + 266, bw * 0.4 - 6, 46, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
    } else button('tomap', bx, py + 266, bw, 46, '地图', { size: 17, bg: COL.woodDark, fn: () => { mode = 'map'; } });
  }
}

// ---------- 主循环 ----------
function frame() {
  const now = P.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(mode === 'album' && albumFrom === 'play' ? 0 : dt);
  buttons = [];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (mode === 'album') {
    drawAlbum();
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
    if (mode === 'over' || (mode === 'ad' && result)) drawOver();
    if (mode === 'intro') drawIntro();
    if (mode === 'play' && g.siege) drawSiegeChoose();
    if (mode === 'ad') drawAd();
  }
  P.nextFrame(frame);
}

// 第一次打开：直接进第 1 关（10 秒内爽）；以后先看旅程地图
if (!save.tutorialDone) newStage(0);
else { newStage(Math.min(save.stage, LV.length - 1)); mode = 'map'; }
P.nextFrame(frame);

// 给测试用（只在浏览器里挂到 window 上）
P.exposeForTest('__game', {
  get g() { return g; }, get mode() { return mode; }, get result() { return result; }, get save() { return save; },
  get paintIdx() { return paintIdx; }, stats, L, fingerFor, slotCenter, buttons: () => buttons.slice(),
  get stageIdx() { return stageIdx; }, get chipPos() { return chipPos; }, LV, newStage, SG, newSiege, siegeBusy: () => siegeBusy(),
  reset() { save = freshSave(); persist(); newStage(0); },
  setSave(o) { Object.assign(save, o); persist(); },
  newGame, endGame, core,
});
