// 规则层：棋盘、块、消除、计分、出块、机器人。不画图，Node 里也能跑（test/measure.js 用它量数）。
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

// ---------- 棋盘：81 格，0 空 1 有块 2 机关匣（固定格：占地方、算满，但消不掉）3 小墨怪 4 大墨怪 ----------
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
const CENTER_UNIT = 18 + 4;

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
function fullUnits(board) {
  const out = [];
  for (let u = 0; u < 27; u++) if (UNITS[u].every((i) => board[i])) out.push(u);
  return out;
}
// 放下并消除，返回新棋盘和消掉的单位（不改原棋盘）
function placeAndClear(board, p, r, c) {
  const b = board.slice();
  for (const [dr, dc] of p.cells) b[(r + dr) * 9 + c + dc] = 1;
  const units = fullUnits(b);
  const cells = new Set();
  units.forEach((u) => UNITS[u].forEach((i) => cells.add(i)));
  // 2 机关匣、4 大墨怪、5 铁石：占地方、算满，但消不掉（铁石只有宠物打得碎）；3 小墨怪：算满，消掉就抓到
  cells.forEach((i) => b[i] !== CELL.CHEST && b[i] !== CELL.BOSS && b[i] !== CELL.ROCK && b[i] !== CELL.METAL && b[i] !== CELL.DIRT && (b[i] = 0));
  return { board: b, units, cells: [...cells].filter((i) => b[i] !== CELL.CHEST && b[i] !== CELL.BOSS && b[i] !== CELL.ROCK && b[i] !== CELL.METAL && b[i] !== CELL.DIRT) };
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

// ---------- 一局 ----------
// opts: { level, endless, seed, items:{sparrow,crossbow,turtle}, single, tutorial, stage }
// stage = 旅程的一关（js/levels.js 里的一项）：不限时、开局有预放的盘面、目标是冲分 / 收宝石 / 机关匣 / 泡泡，
// 达到目标就过关，只有三块都放不下才输。照 Woodoku「旅程」模式（../关卡拆解_Woodoku旅程_20261120.md）。
function createGame(opts) {
  const o = opts || {};
  const rand = rng(o.seed || (Date.now() & 0x7fffffff));
  const level = o.level || 0;
  const st = o.stage || null;
  const timeLimit = o.endless || st ? Infinity : level === 0 ? C.timeFirst : C.timeNormal;
  const g = {
    level, endless: !!o.endless, items: o.items || {}, rand,
    board: new Array(81).fill(0),
    revealed: new Array(81).fill(0),
    lit: new Array(9).fill(false),
    litOrder: [],
    hand: [null, null, null],
    score: 0, streak: 0, bestCombo: 0, moves: 0,
    timeLimit, timeLeft: timeLimit, elapsed: 0,
    adsUsed: 0, turtleUsed: false,
    over: false, won: false, reason: null,
    deals: 0,
    stage: st, // 旅程：这一关
    gem: new Array(81).fill(0), // 格子上的宝石：0 没有，1–5 = GEMS 的第几种
    bubble: new Array(81).fill(0), // 泡泡：格子上放块、再把这格消掉才算戳破
    handGem: [null, null, null], // 托盘里的块带的宝石 { cell, kind }
    got: {}, // 收了多少：b/g/o/p/v（宝石）、box、bubble
  };
  if (st) loadStage(g, st);

  g.diff = () => {
    if (st) return st.d || 0;
    const frac = g.endless ? Math.min(1, g.moves / 120) : 1 - g.timeLeft / g.timeLimit;
    const d = Math.min(C.diffMax, level * C.diffPerLevel + frac * C.diffPerTime);
    return level === 0 && !g.endless ? d * C.diffFirstScale : d;
  };
  g.deal = () => {
    g.deals++;
    if (o.tutorial && g.deals === 1) {
      // 第一组：3×3 正好填满一宫；5 + 4 放一行就消。关卡可以自己定第一手（st.tutHand，0.9.12：宠物第 1 关的盘面是两排缺口，配 5 格、4 格长条）
      g.hand = (st && st.tutHand ? st.tutHand : ['3h', '5h', '4h']).map((id) => PIECES[id]);
    } else {
      // luck（0.9）：这一关发的三块「保证都放得下」的机会。普通关 1（一定放得下）；难关、超难关、头目关调低，手熟的人也会被逼到（照 0.9 从头打到尾的测量）
      const guarantee = g.endless ? g.rand() < Math.max(0.5, 1 - g.moves / 200) : st && st.luck !== undefined ? g.rand() < st.luck : true;
      g.hand = dealHand(g.board, g.rand, g.diff(), guarantee);
      if (o.single && g.deals === 1) g.hand[2] = PIECES['1'];
    }
    g.handGem = g.hand.map((p) => gemForPiece(g, p));
  };
  g.handPieces = () => g.hand.filter(Boolean);
  g.fits = (i) => !!g.hand[i] && anyPlacement(g.board, g.hand[i]);
  g.stuck = () => g.handPieces().length > 0 && g.hand.every((p, i) => !p || !g.fits(i));
  // 手上有块放不下、但还有块能放：差一点，给「换一组」按钮
  g.someBlocked = () => g.hand.some((p, i) => p && !g.fits(i)) && !g.stuck();

  // 返回这一步发生的所有事，画面层照着放特效
  g.place = (i, r, c) => {
    const p = g.hand[i];
    if (!p || g.over || !canPlace(g.board, p, r, c)) return null;
    // 块上带的宝石先落到盘上
    const hg = g.handGem[i];
    if (hg) g.gem[(r + p.cells[hg.cell][0]) * 9 + c + p.cells[hg.cell][1]] = hg.kind;
    const before = g.board;
    const res = placeAndClear(g.board, p, r, c);
    g.board = res.board;
    g.hand[i] = null;
    g.handGem[i] = null;
    g.moves++;
    const ev = { piece: p, r, c, units: res.units, cells: res.cells, gained: p.cells.length, newlyLit: [], revealed: [], center: false, crossbow: null, win: false, collected: [] };
    if (st) collect(g, res, before, ev);
    let pts = 0;
    for (const u of res.units) {
      const center = u === CENTER_UNIT && !st;
      if (center) ev.center = true;
      pts += C.scoreUnit * (center ? C.centerMul : 1);
    }
    if (res.units.length) {
      g.streak++;
      const mul = res.units.length * (1 + Math.min(C.streakMax, (g.streak - 1) * C.streakStep));
      pts = Math.round(pts * mul);
      g.bestCombo = Math.max(g.bestCombo, res.units.length);
    } else g.streak = 0;
    ev.gained += pts;
    ev.combo = res.units.length;
    ev.streak = g.streak;
    // 连弩车：连击到 3 射穿最满的一行（不算格子满，只是把块打掉、擦亮底下）
    if (g.items.crossbow && g.streak > 0 && g.streak % C.crossbowStreak === 0) {
      let best = -1, bestN = 0;
      for (let rr = 0; rr < 9; rr++) {
        const n = UNITS[rr].filter((k) => g.board[k]).length;
        if (n > bestN) { bestN = n; best = rr; }
      }
      if (best >= 0) {
        const hit = UNITS[best].filter((k) => g.board[k]);
        hit.forEach((k) => (g.board[k] = 0));
        ev.crossbow = { row: best, cells: hit };
        ev.cells = ev.cells.concat(UNITS[best]);
        ev.gained += hit.length * 2;
      }
    }
    // 擦亮底下的画（旅程里不压画）
    if (!st) for (const k of ev.cells) if (!g.revealed[k]) { g.revealed[k] = 1; ev.revealed.push(k); }
    for (let b = 0; b < 9; b++) {
      if (!g.lit[b] && UNITS[18 + b].every((k) => g.revealed[k])) {
        g.lit[b] = true; g.litOrder.push(b); ev.newlyLit.push(b);
      }
    }
    if (ev.center && g.items.sparrow && !g.endless) { g.timeLeft += C.sparrowSec; ev.sparrow = true; }
    g.score += ev.gained;
    ev.beat = !res.units.length && !ev.crossbow ? 1
      : ev.center || res.units.length >= 4 ? 5
      : res.units.length >= 2 || g.streak >= 3 ? 4
      : res.units.some((u) => u >= 18) ? 3 : 2;
    if (st && goalDone(g)) {
      ev.win = true; ev.beat = Math.max(ev.beat, 4);
      g.over = true; g.won = true; g.reason = 'win';
      return ev;
    }
    if (!g.endless && !st && g.lit.every(Boolean)) {
      ev.win = true; ev.beat = 6;
      ev.timeBonus = Math.round(g.timeLeft * C.timeBonusPerSec);
      g.score += ev.timeBonus;
      g.over = true; g.won = true; g.reason = 'win';
      return ev;
    }
    if (!g.handPieces().length) g.deal();
    if (g.stuck()) {
      if (g.items.turtle && !g.turtleUsed && g.board.some((x) => !x)) {
        g.turtleUsed = true; ev.turtle = true;
        const slot = g.hand.findIndex((x) => !x || !anyPlacement(g.board, x));
        g.hand[slot] = PIECES['1'];
      } else {
        g.over = true; g.reason = 'stuck'; ev.stuck = true;
      }
    }
    return ev;
  };
  g.tick = (dt) => {
    if (g.over) return false;
    g.elapsed += dt;
    if (g.endless) return false;
    g.timeLeft = Math.max(0, g.timeLeft - dt);
    if (g.timeLeft <= 0) { g.over = true; g.reason = 'time'; return true; }
    return false;
  };
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
  // 假广告：复活。放不下 → 清空中宫再发；时间到 → 加 20 秒
  g.revive = () => {
    g.adsUsed++;
    if (g.reason === 'time') g.timeLeft += C.reviveTime;
    else {
      UNITS[CENTER_UNIT].forEach((k) => { if (g.board[k] === CELL.BLOCK) { g.board[k] = 0; g.gem[k] = 0; } });
      if (g.stuck()) g.reroll(), g.adsUsed--;
    }
    g.over = false; g.reason = null;
  };
  g.litCount = () => g.lit.filter(Boolean).length;
  // 差一点：画只差 1–2 宫没亮；旅程里 = 目标完成了七成以上
  g.nearMiss = () => !g.won && (st ? goalFrac(g) >= 0.7 : g.litCount() >= 7);
  g.goalLeft = () => goalLeft(g);
  g.goalFrac = () => goalFrac(g);
  g.deal();
  return g;
}

// ---------- 旅程：盘面、目标、收集 ----------
// 宝石五种（Woodoku 用蓝 / 绿 / 橙 / 粉 / 紫，我们换成矿石名）
const GEMS = [null,
  { id: 'b', name: '青金' }, { id: 'g', name: '翠玉' }, { id: 'o', name: '琥珀' }, { id: 'p', name: '粉晶' }, { id: 'v', name: '紫晶' }];
const GEM_OF = { b: 1, g: 2, o: 3, p: 4, v: 5 };
// 盘面用 9 行字符写：. 空  # 预放的块  b g o p v 带宝石的块  M 机关匣  * 空格上的泡泡  + 泡泡上已经压着块
function loadStage(g, st) {
  st.board.forEach((row, r) => row.split('').forEach((ch, c) => {
    const k = r * 9 + c;
    if (ch === '#') g.board[k] = 1;
    else if (GEM_OF[ch]) { g.board[k] = 1; g.gem[k] = GEM_OF[ch]; }
    else if (ch === 'M') g.board[k] = 2;
    else if (ch === '*') g.bubble[k] = 1;
    else if (ch === '+') { g.board[k] = 1; g.bubble[k] = 1; }
  }));
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
function goalDone(g) {
  const left = goalLeft(g);
  return Object.keys(left).every((k) => left[k] === 0);
}
function goalFrac(g) {
  let need = 0, have = 0;
  for (const key in g.stage.goal) {
    const n = g.stage.goal[key];
    need += n;
    have += Math.min(n, key === 'score' ? g.score : g.got[key] || 0);
  }
  return need ? have / need : 1;
}
// 发块时：收宝石的关，有一定机会让块上带一颗还缺的宝石（宝石永远收得完，不会卡死）
function gemForPiece(g, p) {
  const st = g.stage;
  if (!st || !p || !st.gemRate || g.rand() >= st.gemRate) return null;
  const left = goalLeft(g);
  const need = [];
  for (const key in left) if (GEM_OF[key] && left[key] > 0) {
    // 盘上已经有的不算缺
    const onBoard = g.gem.filter((x) => x === GEM_OF[key]).length;
    if (left[key] > onBoard) need.push(GEM_OF[key]);
  }
  if (!need.length) return null;
  return { cell: Math.floor(g.rand() * p.cells.length), kind: need[Math.floor(g.rand() * need.length)] };
}
// 这一步消掉了什么：宝石、泡泡、碰到机关匣
function collect(g, res, before, ev) {
  for (const k of res.cells) {
    if (g.gem[k]) {
      const id = GEMS[g.gem[k]].id;
      if (id in g.got) { g.got[id]++; ev.collected.push({ k, what: id }); }
      g.gem[k] = 0;
    }
    if (g.bubble[k]) {
      g.bubble[k] = 0;
      if ('bubble' in g.got) { g.got.bubble++; ev.collected.push({ k, what: 'bubble' }); }
    }
  }
  // 机关匣：消掉的行 / 列 / 宫里有它，就收一个（一步最多收一个，照 Woodoku 的信箱）
  if ('box' in g.got) {
    const boxCell = res.units.map((u) => UNITS[u].find((k) => g.board[k] === CELL.CHEST)).find((k) => k !== undefined);
    if (boxCell !== undefined) { g.got.box++; ev.collected.push({ k: boxCell, what: 'box' }); }
  }
}
// 机器人看目标：这一步能收几个（只数还缺的）
function goalGain(g, res, p, r, c, hi) {
  const st = g.stage;
  if (!st) return 0;
  const left = goalLeft(g);
  let v = 0;
  const placed = new Set(p.cells.map(([dr, dc]) => (r + dr) * 9 + c + dc));
  const handCell = g.handGem[hi] ? (r + p.cells[g.handGem[hi].cell][0]) * 9 + c + p.cells[g.handGem[hi].cell][1] : -1;
  for (const k of res.cells) {
    const kind = k === handCell ? g.handGem[hi].kind : g.gem[k];
    if (kind && left[GEMS[kind].id] > 0) v += 14;
    if (g.bubble[k] && left.bubble > 0) v += 8;
  }
  if (left.box > 0 && res.units.some((u) => UNITS[u].some((k) => g.board[k] === CELL.CHEST))) v += 16;
  // 盖住泡泡也有一点好处（下一步才能戳破）
  if (left.bubble > 0) for (const k of placed) if (g.bubble[k] && !res.cells.includes(k)) v += 1.5;
  if (left.score > 0) v += res.units.length * 2;
  return v;
}
// 目标格附近的行 / 列 / 宫快满了：值得留着凑
function goalShape(g, board) {
  const st = g.stage;
  if (!st) return 0;
  const left = goalLeft(g);
  let s = 0;
  for (let u = 0; u < 27; u++) {
    const cells = UNITS[u];
    const hasTarget = cells.some((k) => (g.gem[k] && left[GEMS[g.gem[k]].id] > 0 && board[k]) || (g.bubble[k] && left.bubble > 0) || (board[k] === CELL.CHEST && left.box > 0));
    if (!hasTarget) continue;
    const n = cells.filter((k) => board[k]).length;
    if (n >= 5) s += (n - 4) * 0.7;
  }
  return s;
}

// ---------- 机器人 ----------
function evalBoard(board, revealed) {
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
  // 一宫里快满、但那宫还没亮：值得留着凑
  if (revealed) {
    for (let b = 0; b < 9; b++) {
      const u = UNITS[18 + b];
      if (u.every((k) => revealed[k])) continue;
      const n = u.filter((k) => board[k]).length;
      if (n >= 5) s += (n - 4) * 0.6;
    }
  }
  return s;
}
// skill 0..1：1 = 每步都挑最好的；越低越常挑次好的
function bestMove(g, skill) {
  const cands = [];
  g.hand.forEach((p, i) => {
    if (!p) return;
    for (const [r, c] of placements(g.board, p)) {
      const res = placeAndClear(g.board, p, r, c);
      let newRev = 0;
      for (const k of res.cells) if (!g.revealed[k]) newRev++;
      const centerBonus = res.units.includes(CENTER_UNIT) && !g.stage ? 6 : 0;
      const v = res.units.length * 9 + (g.stage ? 0 : newRev * 1.2) + centerBonus + evalBoard(res.board, g.stage ? null : g.revealed)
        + goalGain(g, res, p, r, c, i) + goalShape(g, res.board);
      cands.push({ i, r, c, v, board: res.board });
    }
  });
  if (!cands.length) return null;
  cands.sort((a, b) => b.v - a.v);
  // 前几名里检查：剩下的块还放得下吗
  const top = cands.slice(0, 10);
  for (const m of top) {
    const rest = g.hand.filter((p, k) => p && k !== m.i);
    if (rest.length && !solvable(m.board, rest)) m.v -= 100;
  }
  top.sort((a, b) => b.v - a.v);
  const s = skill === undefined ? 1 : skill;
  if (s >= 1) return top[0];
  // 手生的人：按 skill 的概率挑第一，不然在前几名里随便挑
  if (g.rand() < s) return top[0];
  return top[Math.min(top.length - 1, 1 + Math.floor(g.rand() * 4))];
}
function randomMove(g) {
  const all = [];
  g.hand.forEach((p, i) => p && placements(g.board, p).forEach(([r, c]) => all.push({ i, r, c })));
  return all.length ? all[Math.floor(g.rand() * all.length)] : null;
}

// 模拟一局：secPerMove 是人放一块要几秒（含想和拖）
function simulate(opts) {
  const o = Object.assign({ skill: 1, random: false, secPerMove: () => 3 }, opts);
  const g = createGame(o);
  let guard = 0;
  while (!g.over && guard++ < 2000) {
    const m = o.random ? randomMove(g) : bestMove(g, o.skill);
    if (!m) break;
    const dt = o.secPerMove(g);
    if (g.tick(dt)) break;
    g.place(m.i, m.r, m.c);
    if (o.endless && g.moves > (o.maxMoves || 400)) break;
  }
  return g;
}

// 0.9.25 收拾：盘面上每一格是什么，用名字不用数字（Fable 代码体检第 6 步）
const CELL = { EMPTY: 0, BLOCK: 1, CHEST: 2, MON: 3, BOSS: 4, ROCK: 5, METAL: 6, DIRT: 7, BRICK: 8 }; // 空 / 方块 / 机关匣 / 小墨怪 / 头目 / 铁石 / 金属 / 土堆 / 冲锋关铜砖
module.exports = { CELL, GEMS, GEM_OF, goalLeft, rng, PIECES, IDS, UNITS, CENTER_UNIT, boxOf, canPlace, placements, anyPlacement, placeAndClear, solvable, dealHand, createGame, bestMove, randomMove, simulate, evalBoard };
