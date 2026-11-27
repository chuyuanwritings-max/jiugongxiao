// 规则层：棋盘、块、消除、出块。不画图，Node 里也能跑。段 1 收拾：最早那套（限时、点亮九宫、旅程收宝石）拆了，只留宠物规则用的底子（规则细设计附录 D 丙）
const C = require('./config.js');

// ---------- 随机数（可复现） ----------
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ---------- 块 ----------
// 用字符画写，'#' 是格子。cat：0 小 / 1 中 / 2 大
const SHAPES = [
  ['1', 0, ['#']],
  ['2h', 0, ['##']], ['2v', 0, ['#', '#']],
  ['3h', 0, ['###']], ['3v', 0, ['#', '#', '#']],
  ['c3a', 0, ['##', '#.']], ['c3b', 0, ['##', '.#']], ['c3c', 0, ['#.', '##']], ['c3d', 0, ['.#', '##']],
  ['4h', 1, ['####']], ['4v', 1, ['#', '#', '#', '#']],
  ['sq2', 1, ['##', '##']],
  ['L4a', 1, ['#.', '#.', '##']], ['L4b', 1, ['.#', '.#', '##']], ['L4c', 1, ['##', '#.', '#.']], ['L4d', 1, ['##', '.#', '.#']],
  ['L4e', 1, ['###', '#..']], ['L4f', 1, ['###', '..#']], ['L4g', 1, ['#..', '###']], ['L4h', 1, ['..#', '###']],
  ['T4a', 1, ['###', '.#.']], ['T4b', 1, ['.#.', '###']], ['T4c', 1, ['#.', '##', '#.']], ['T4d', 1, ['.#', '##', '.#']],
  ['S4a', 1, ['.##', '##.']], ['Z4a', 1, ['##.', '.##']], ['S4b', 1, ['#.', '##', '.#']], ['Z4b', 1, ['.#', '##', '#.']],
  ['5h', 2, ['#####']], ['5v', 2, ['#', '#', '#', '#', '#']],
  // 0.9.17：3×3 大方块拿掉（Cc 11-26：「你为什么要设计那样的块呢？」——在九宫消里放进空宫自己就消，要么白送要么卡死；Kira 先定 A，待 Cc 看）
  ['plus', 2, ['.#.', '###', '.#.']],
  ['L5a', 2, ['#..', '#..', '###']], ['L5b', 2, ['..#', '..#', '###']], ['L5c', 2, ['###', '#..', '#..']], ['L5d', 2, ['###', '..#', '..#']],
  ['r23', 2, ['###', '###']], ['r32', 2, ['##', '##', '##']],
  // 0.9.17 斜块（学 Woodoku，Cc 11-27 定「照清单全做」）：只靠角挨着，专门填斜缝
  ['d2a', 0, ['#.', '.#']], ['d2b', 0, ['.#', '#.']],
  ['d3a', 1, ['#..', '.#.', '..#']], ['d3b', 1, ['..#', '.#.', '#..']],
  ['d4a', 2, ['#...', '.#..', '..#.', '...#']], ['d4b', 2, ['...#', '..#.', '.#..', '#...']],
];
const PIECES = {};
SHAPES.forEach(([id, cat, rows]) => {
  const cells = [];
  rows.forEach((row, r) => row.split('').forEach((ch, c) => ch === '#' && cells.push([r, c])));
  PIECES[id] = { id, cat, cells, h: rows.length, w: rows[0].length };
});
const IDS = Object.keys(PIECES);
// 3×3 不再发（不在 IDS 里），只留给测试拿来造「放不下」的局面
PIECES.sq3 = { id: 'sq3', cat: 2, cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], h: 3, w: 3 };
const HARD = ['5h', '5v', 'L5a', 'L5d', 'd4a', 'd4b'];

// ---------- 棋盘：81 格，值见文件末尾的 CELL ----------
const boxOf = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);
const UNITS = []; // 27 个：0–8 行，9–17 列，18–26 宫
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) {
  const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
  const u = [];
  for (let i = 0; i < 9; i++) u.push((br + Math.floor(i / 3)) * 9 + bc + (i % 3));
  UNITS.push(u);
}

function canPlace(board, p, r, c) {
  if (r < 0 || c < 0 || r + p.h > 9 || c + p.w > 9) return false;
  for (const [dr, dc] of p.cells) if (board[(r + dr) * 9 + c + dc]) return false;
  return true;
}
function placements(board, p) {
  const out = [];
  for (let r = 0; r + p.h <= 9; r++) for (let c = 0; c + p.w <= 9; c++) if (canPlace(board, p, r, c)) out.push([r, c]);
  return out;
}
function anyPlacement(board, p) {
  for (let r = 0; r + p.h <= 9; r++) for (let c = 0; c + p.w <= 9; c++) if (canPlace(board, p, r, c)) return true;
  return false;
}
// 段 1 规则 1（Cc 11-27「那格子放在那儿不消也不影响我过关，我为什么非要消它呢」）：金属、土堆堵路
const BLOCKS_CLEAR = (v) => v === CELL.METAL || v === CELL.DIRT;
// 全游戏唯一的判满（附录 B）：9 格都有东西，而且里面没有金属、土堆
function unitFull(board, u) { const cs = UNITS[u]; for (let i = 0; i < 9; i++) { const v = board[cs[i]]; if (!v || BLOCKS_CLEAR(v)) return false; } return true; }
// 9 格都有东西、但被障碍堵着：返回堵着的那几格（给 ev.blockedFull）；没摆满或没堵返回 null
function unitBlockedBy(board, u) { const cs = UNITS[u], at = []; for (let i = 0; i < 9; i++) { const v = board[cs[i]]; if (!v) return null; if (BLOCKS_CLEAR(v)) at.push(cs[i]); } return at.length ? at : null; }
function fullUnits(board) {
  const out = [];
  for (let u = 0; u < 27; u++) if (unitFull(board, u)) out.push(u);
  return out;
}
// 放下并消除，返回新棋盘和消掉的单位（不改原棋盘）
function placeAndClear(board, p, r, c) {
  const b = board.slice();
  for (const [dr, dc] of p.cells) b[(r + dr) * 9 + c + dc] = 1;
  const units = fullUnits(b);
  const cells = new Set();
  units.forEach((u) => UNITS[u].forEach((i) => cells.add(i)));
  // 头目：占地方、算满，但消不掉；小墨怪：算满，消掉就抓到（金属、土堆所在的排根本不满，见 unitFull）
  const stays = (v) => v === CELL.BOSS;
  cells.forEach((i) => !stays(b[i]) && (b[i] = 0));
  return { board: b, units, cells: [...cells].filter((i) => !stays(b[i])) };
}
// 有没有一种顺序和摆法，能把这几块全放下（中间会消除）
function solvable(board, pieces) {
  if (!pieces.length) return true;
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k];
    const rest = pieces.slice(0, k).concat(pieces.slice(k + 1));
    for (let r = 0; r + p.h <= 9; r++) for (let c = 0; c + p.w <= 9; c++) {
      if (!canPlace(board, p, r, c)) continue;
      if (!rest.length) return true;
      if (solvable(placeAndClear(board, p, r, c).board, rest)) return true;
    }
  }
  return false;
}

// ---------- 出块 ----------
function pickPiece(rand, d) {
  const w = [C.weightSmall(d), C.weightMid(d), C.weightBig(d)].map((x) => Math.max(0.02, x));
  // 每类里的块数不同：按类先抽，再类内平均抽
  let t = rand() * (w[0] + w[1] + w[2]);
  let cat = 0;
  while (cat < 2 && t > w[cat]) { t -= w[cat]; cat++; }
  const pool = IDS.filter((id) => PIECES[id].cat === cat);
  return PIECES[pool[Math.floor(rand() * pool.length)]];
}
// 发三块：保证有一种摆法三块全放得下（guarantee=false 时只保证至少一块放得下）
function dealHand(board, rand, d, guarantee) {
  let last = null;
  for (let t = 0; t < C.dealTries; t++) {
    const hand = [pickPiece(rand, d), pickPiece(rand, d), pickPiece(rand, d)];
    last = hand;
    if (guarantee ? solvable(board, hand) : hand.some((p) => anyPlacement(board, p))) return hand;
    // 抽不出来就慢慢降难度
    d = Math.max(0, d - 0.08);
  }
  // 实在不行：塞小块
  const small = [PIECES['1'], PIECES['2h'], PIECES['1']];
  return solvable(board, small) ? small : last;
}

// ---------- 一局的底子（petgame.js 在上面加宠物规则，盖掉 place / revive） ----------
// opts: { seed, tutorial, stage }
function createGame(opts) {
  const o = opts || {};
  const rand = rng(o.seed || (Date.now() & 0x7fffffff));
  const st = o.stage || null;
  const g = {
    rand,
    board: new Array(81).fill(0),
    hand: [null, null, null],
    score: 0, streak: 0, bestCombo: 0, moves: 0,
    elapsed: 0,
    adsUsed: 0,
    over: false, won: false, reason: null,
    deals: 0,
    stage: st,
    got: {}, // 每个目标收了多少
  };
  if (st) loadStage(g, st);

  g.diff = () => (st && st.d) || 0;
  g.deal = () => {
    g.deals++;
    if (o.tutorial && g.deals === 1) {
      // 第一组：关卡可以自己定第一手（st.tutHand）
      g.hand = (st && st.tutHand ? st.tutHand : ['3h', '5h', '4h']).map((id) => PIECES[id]);
    } else {
      // luck：这一关发的三块「保证都放得下」的机会（不写 = 一定放得下）
      const guarantee = st && st.luck !== undefined ? g.rand() < st.luck : true;
      g.hand = dealHand(g.board, g.rand, g.diff(), guarantee);
    }
  };
  g.handPieces = () => g.hand.filter(Boolean);
  g.fits = (i) => !!g.hand[i] && anyPlacement(g.board, g.hand[i]);
  g.stuck = () => g.handPieces().length > 0 && g.hand.every((p, i) => !p || !g.fits(i));
  // 手上有块放不下、但还有块能放：差一点，给「换一组」按钮
  g.someBlocked = () => g.hand.some((p, i) => p && !g.fits(i)) && !g.stuck();
  // 不限时：只记用了多久（main.js 每帧叫）
  g.tick = (dt) => { if (!g.over) g.elapsed += dt; return false; };
  // 假广告：换一组（保证能放）
  g.reroll = () => {
    g.adsUsed++;
    const n = g.handPieces().length;
    let hand;
    for (let t = 0; t < 60; t++) {
      hand = Array.from({ length: n }, () => pickPiece(g.rand, Math.max(0, g.diff() - 0.3)));
      if (solvable(g.board, hand)) break;
    }
    let k = 0;
    g.hand = g.hand.map((p) => (p ? hand[k++] : null));
  };
  g.goalLeft = () => goalLeft(g);
  g.deal();
  return g;
}

// ---------- 盘面、目标 ----------
// 盘面用 9 行字符写：. 空  # 预放的块（墨怪、金属、土堆、头目由 petgame.js 摆）
function loadStage(g, st) {
  st.board.forEach((row, r) => row.split('').forEach((ch, c) => { if (ch === '#') g.board[r * 9 + c] = 1; }));
  for (const key in st.goal) g.got[key] = 0;
}
// 还差多少：{ key: 还差几个 }
function goalLeft(g) {
  const out = {};
  for (const key in g.stage.goal) {
    if (key === 'all') { out.all = g.monLeft || 0; continue; } // 抓光盘上的墨怪：还剩几只
    if (key === 'boss' && g.boss) { out.boss = g.bigHp; continue; } // 头目：还剩几颗心（0.9.4，原来写「还差 1」只）
    const have = key === 'score' ? g.score : g.got[key] || 0;
    out[key] = Math.max(0, g.stage.goal[key] - have);
  }
  return out;
}

// ---------- 机器人看盘面 ----------
function evalBoard(board) {
  let s = 0;
  // 孤立的空格（四面都堵死）最坏
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const i = r * 9 + c;
    if (board[i]) continue;
    let open = 0;
    if (r > 0 && !board[i - 9]) open++;
    if (r < 8 && !board[i + 9]) open++;
    if (c > 0 && !board[i - 1]) open++;
    if (c < 8 && !board[i + 1]) open++;
    if (open === 0) s -= 6;
    else if (open === 1) s -= 1.5;
  }
  // 边缘越碎越坏
  let edges = 0;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) if (!board[r * 9 + c] !== !board[r * 9 + c + 1]) edges++;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) if (!board[r * 9 + c] !== !board[r * 9 + c + 9]) edges++;
  s -= edges * 0.35;
  // 大块还能不能放
  for (const id of HARD) if (anyPlacement(board, PIECES[id])) s += 2.5;
  // 越空越好
  s -= board.reduce((a, b) => a + (b ? 1 : 0), 0) * 0.15;
  return s;
}

// 0.9.25 收拾：盘面上每一格是什么，用名字不用数字（Fable 代码体检第 6 步）
// 段 1：机关匣（2）、铁石（5）拆了，编号空着不重排（留底、试玩记录里存的是数字；规则细设计附录 D 丙）
const CELL = { EMPTY: 0, BLOCK: 1, MON: 3, BOSS: 4, METAL: 6, DIRT: 7, BRICK: 8 }; // 空 / 方块 / 小墨怪 / 头目 / 金属 / 土堆 / 冲锋关铜砖
module.exports = { CELL, BLOCKS_CLEAR, unitFull, unitBlockedBy, goalLeft, rng, PIECES, IDS, UNITS, boxOf, canPlace, placements, anyPlacement, placeAndClear, solvable, dealHand, createGame, evalBoard };
