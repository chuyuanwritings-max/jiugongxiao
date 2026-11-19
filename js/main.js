// 洛书九宫 原型 0.1：画面、拖块、特效、结算、画册。规则全在 core.js。
const P = require('./platform.js');
const C = require('./config.js');
const core = require('./core.js');
const art = require('./art.js');

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
  };
}
let save = Object.assign(freshSave(), P.load(KEY) || {});
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
  L.mini = Math.max(18, Math.round(L.cell * 0.66)); // 底下三块的格子大小
  L.lift = Math.round(L.cell * 2.1); // 拖起来浮在手指上方多高
  L.footY = L.trayY + L.trayH + 8;
})();

// 每张画一张小画布
const paintCanvas = [0, 1, 2].map((i) => art.render(i, P.makeCanvas(art.SIZE, art.SIZE)));
const PX = art.SIZE / 9; // 一格对应几个画的像素

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

function newGame(endless) {
  const single = !endless && save.buySingle && save.coins >= C.singleCost;
  if (single) { save.coins -= C.singleCost; save.buySingle = false; }
  paintIdx = save.wins % art.COUNT;
  g = core.createGame({
    level: endless ? 2 : Math.min(save.wins, 4), endless, seed: (P.now() ^ (save.plays * 2654435761)) >>> 0,
    items: save.items, single, tutorial: !save.tutorialDone,
  });
  save.plays++;
  persist();
  mode = 'play';
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
// 黄铜机关块
function block(x, y, s, alpha, tint) {
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.fillStyle = COL.ink;
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = tint || COL.brass;
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
  ctx.fillStyle = COL.brassLight;
  ctx.fillRect(x + 2, y + 2, s - 4, Math.max(2, s * 0.18));
  ctx.fillRect(x + 2, y + 2, Math.max(2, s * 0.14), s - 4);
  ctx.fillStyle = COL.brassDark;
  ctx.fillRect(x + 2, y + s - 2 - Math.max(2, s * 0.16), s - 4, Math.max(2, s * 0.16));
  // 中间的铆钉
  if (s > 14) {
    ctx.fillStyle = COL.copper;
    ctx.fillRect(x + s / 2 - s * 0.12, y + s / 2 - s * 0.12, s * 0.24, s * 0.24);
  }
  ctx.globalAlpha = 1;
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
    if (mode === 'play' && !g.over && y > L.trayY - 20) {
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
  const ev = g.place(i, s.r, s.c);
  if (!ev) return;
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
  if (ev.win) { P.sound('win', 0.8); say('成了！'); flash = 0.6; }
  else if (ev.center) say('城心！');
  else if (ev.beat >= 4) say(ev.combo >= 2 ? '好！' : '连上了');
  else if (ev.newlyLit.length) say('亮了');
}

// ---------- 一局结束 ----------
function endGame() {
  overAt = clock;
  stats.overs.push(P.now());
  drag = null;
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
  shake *= Math.pow(0.002, dt);
  if (shake < 0.3) shake = 0;
  flash = Math.max(0, flash - dt * 1.6);
  if (g) displayScore += (g.score - displayScore) * Math.min(1, dt * 10);
}

// ---------- 画 ----------
function drawBg() {
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);
  // 淡淡的齿轮背景
  ctx.globalAlpha = 0.05;
  gearIcon(W * 0.1, H * 0.92, 60, clock * 0.1, COL.brass);
  gearIcon(W * 0.95, H * 0.12, 46, -clock * 0.13, COL.brass);
  ctx.globalAlpha = 1;
}
function drawHud() {
  const y = L.top;
  // 分数
  text(String(Math.round(displayScore)), 18, y + 18, 30, COL.text, 'left');
  text('最高 ' + (g.endless ? save.bestEndless : save.best), 18, y + 46, 13, COL.dim, 'left', 'normal');
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
  ctx.fillStyle = COL.brassDark; ctx.fillRect(bx - 3, by - 3, B + 6, B + 6);
  const pc = paintCanvas[paintIdx];
  ctx.imageSmoothingEnabled = false;
  for (let k = 0; k < 81; k++) {
    const r = Math.floor(k / 9), c = k % 9, x = cellX(c), y = cellY(r);
    const box = core.boxOf(r, c);
    if (g.revealed[k]) {
      ctx.drawImage(pc, c * PX, r * PX, PX, PX, x, y, cell, cell);
      if (!g.lit[box]) { ctx.fillStyle = 'rgba(10,6,4,0.45)'; ctx.fillRect(x, y, cell, cell); }
    } else {
      ctx.fillStyle = (r + c) % 2 ? COL.wood : '#3f2a1b';
      ctx.fillRect(x, y, cell, cell);
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
  // 宫线（铜）
  ctx.strokeStyle = COL.brass; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(bx + i * 3 * cell, by); ctx.lineTo(bx + i * 3 * cell, by + B);
    ctx.moveTo(bx, by + i * 3 * cell); ctx.lineTo(bx + B, by + i * 3 * cell);
  }
  ctx.stroke();
  // 中宫的红框（城心）
  ctx.strokeStyle = 'rgba(226,85,59,0.55)'; ctx.lineWidth = 2;
  ctx.strokeRect(cellX(3) + 2, cellY(3) + 2, cell * 3 - 4, cell * 3 - 4);

  // 拖的时候：落点和会消掉的格子
  let ghost = null, willClear = null;
  if (showGhost && drag && g.hand[drag.slot]) {
    const p = g.hand[drag.slot];
    const s = snap(p, drag.x, drag.y);
    if (core.canPlace(g.board, p, s.r, s.c)) {
      ghost = { p, s };
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
    block(x, y, s, 1, willClear && willClear.has(k) ? COL.brassLight : undefined);
  }
  if (ghost) {
    ghost.p.cells.forEach(([dr, dc]) => block(cellX(ghost.s.c + dc), cellY(ghost.s.r + dr), cell, 0.4));
  }
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
    const cx = cellX(4) + cell / 2, cy = cellY(4) + cell / 2;
    for (let n = 0; n < 3; n++) {
      const rad = (a * 1.2 - n * 0.15) * B * 0.8;
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
  ctx.fillStyle = n % 2 ? 'rgba(239,230,214,0.28)' : 'rgba(10,6,4,0.45)';
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const d = s / (Math.max(cols, rows) + 1.2);
  for (let i = 0; i < n; i++) {
    const cx = x + s / 2 + ((i % cols) - (cols - 1) / 2) * d;
    const cy = y + s / 2 + (Math.floor(i / cols) - (rows - 1) / 2) * d;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, d * 0.28), 0, Math.PI * 2); ctx.fill();
  }
}
function drawPiece(p, cx, cy, s, alpha) {
  const x0 = cx - (p.w * s) / 2, y0 = cy - (p.h * s) / 2;
  p.cells.forEach(([r, c]) => block(x0 + c * s, y0 + r * s, s, alpha));
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
    drawPiece(p, c.x, c.y, s, fits ? 1 : 0.28);
  }
  if (drag && g.hand[drag.slot]) {
    const p = g.hand[drag.slot];
    drawPiece(p, drag.x, drag.y - L.lift, L.cell, 0.95);
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
    text(t.s, t.x, t.y - age * (t.big ? 20 : 50), Math.round(t.size * pop), t.col);
    ctx.globalAlpha = 1;
  });
}
function drawTutorial() {
  if (save.tutorialDone || !g || g.moves > 0 || drag || !g.hand[0]) return;
  // 手指动画：把第一块（3×3）拖进中宫
  tutorialT += 1 / 60;
  const a = (tutorialT % 2.2) / 1.6;
  const from = slotCenter(0);
  const to = fingerFor(g.hand[0], 3, 3);
  const k = Math.min(1, Math.max(0, a));
  const e = k * k * (3 - 2 * k);
  const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e;
  if (a > 0 && a <= 1) drawPiece(g.hand[0], x, y - L.lift * e, L.mini + (L.cell - L.mini) * e, 0.45);
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
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = COL.ink; ctx.fillRect(x - 4, y - 4, s + 8, s + 8);
  ctx.drawImage(paintCanvas[idx], 0, 0, art.SIZE, art.SIZE, x, y, s, s);
  const q = s / 3;
  for (let b = 0; b < 9; b++) {
    if (litArr[b]) continue;
    const bx = x + (b % 3) * q, by = y + Math.floor(b / 3) * q;
    ctx.fillStyle = 'rgba(20,12,8,0.86)'; ctx.fillRect(bx, by, q, q);
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
function drawOver() {
  const age = clock - overAt;
  ctx.fillStyle = 'rgba(8,5,3,' + Math.min(0.92, age * 3) + ')';
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

// ---------- 画册 ----------
let albumFrom = 'play';
function openAlbum() {
  albumFrom = mode === 'over' ? 'over' : 'play';
  if (albumFrom === 'play' && g && !g.over) { /* 画册打开时时间也走：原型里先这样，开局前看 */ }
  mode = 'album';
}
function drawAlbum() {
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);
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
    gearIcon(44, yy, 12, have ? clock : 0, have ? COL.brass : '#3a2a20');
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
    size: 16, bg: endlessOpen ? COL.copper : '#2a1d15', fg: endlessOpen ? COL.text : COL.dim,
    fn: () => endlessOpen && newGame(true),
  });
  const bw = Math.min(W - 60, 300);
  button('back', (W - bw) / 2, H - 96, bw, 60, albumFrom === 'over' ? '再来' : '回去', {
    size: 24, fn: () => (albumFrom === 'over' ? newGame(g.endless && save.wins >= 2) : (mode = 'play')),
  });
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
    if (mode === 'ad') drawAd();
  }
  P.nextFrame(frame);
}

newGame(false);
P.nextFrame(frame);

// 给测试用（只在浏览器里挂到 window 上）
P.exposeForTest('__game', {
  get g() { return g; }, get mode() { return mode; }, get result() { return result; }, get save() { return save; },
  get paintIdx() { return paintIdx; }, stats, L, fingerFor, slotCenter, buttons: () => buttons.slice(),
  reset() { save = freshSave(); persist(); newGame(false); },
  setSave(o) { Object.assign(save, o); persist(); },
  newGame, endGame, core,
});
