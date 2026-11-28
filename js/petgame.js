// 九宫消 + 宠物的规则层（段 1 收拾后的现行规矩；细设计 ../九宫消_段1规则细设计_Fable_20261127.md）。不画图，Node 里也能跑。
// ① 拖块进 9×9，凑满一排 / 一列 / 一个大格就消；消掉墨怪所在的排 = 抓到。没有手数上限，输法只有「三块都放不下」。
// ② 墨怪一波一波来（stage.waves）：小墨怪、墨苔怪（爬过留墨）、粘墨怪（往托盘里的块上吐泥）；头目占 2×2，穿过它的排消一次掉一颗心。
// ③ 盘上的障碍：金属（只有铜雀的羽毛啄得开）、土堆（只有爆竹鼠啃过的块带的小爆竹炸得开）。
// ④ 宠物：消一排亮一格，亮满吐一块技能块到托盘第 4 格（宠物格），你自己拖去用。用技能块不算一手。
// ⑤ 堵死时宠物格空着、表盘里有能量，宠物提前把技能块给你（救命）。
// 旧规矩（宠物自己出手、克制、偷能量、铁石、宝石、进化关……）段 1 拆掉了，要看去 git 的 v0.9.24。
const C = require('./config.js');
const core = require('./core.js');
const CELL = core.CELL; // 格子名字：CELL.BLOCK、CELL.METAL……
const { UNITS } = core;

// 颜色 = C.blockColors 的序号：0 黄铜金 1 朱砂红 2 青铜绿 3 青金蓝 4 紫晶 5 赤铜 6 水银青；-1 旧铁灰（预放的块）；-2 墨块（墨苔怪留的）
const IS_MON = (v) => v === CELL.MON;
// 墨怪的种类。cd = 隔几手动一次手
const MON = {
  ink: { name: '小墨怪' },
  moss: { name: '墨苔怪', cd: 3 },
  sticky: { name: '粘墨怪', cd: 4 }, // 0.9.20 第二章：每 4 手往托盘里一块上吐泥，那块多一格；吐完爬一格（段 1 规则 5：不瞪、不预告吐哪块，m.cd 是还剩几手）
};
const MON_CHAR = { m: 'ink', G: 'moss', N: 'sticky' };
const newMon = (t) => ({ t, cd: MON[t].cd || 0 });
const BOSS_MUD_CD = 3; // 段 1 规则 5：泥沼怪每 3 手吐一次
// 段 3 规则 11：存盘里存哪些（都是规则层的数；画面、计时由 main.js 另存）。SNAP_VER 对不上的存盘丢掉
const SNAP_VER = 1;
const SNAP_KEYS = ['board', 'color', 'hand', 'handColor', 'team', 'bigHp', 'bigCells', 'boss', 'skillUses', 'mon', 'silkHp', 'monStats', 'playStats', 'caught', 'petActsTotal', 'waveQ', 'waveNo', 'waveTotal', 'got', 'moves', 'score', 'streak', 'dryRun', 'deals', 'adsUsed', 'revivesUsed', 'rescues', 'skillStats', 'skillCaught', 'crumb', 'homeDeals', 'badDeals', 'lastDealOK', 'lastDealMove', 'lastDealUnfair', 'over', 'won', 'reason', 'elapsed', 'bestCombo', '_opened', 'monLeft'];
const SNAP_NEED = ['board', 'color', 'hand', 'team', 'mon', 'moves', 'got', 'waveQ'];
const near8 = (k) => { const r = Math.floor(k / 9), c = k % 9, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const a = r + dr, b = c + dc; if (a >= 0 && a < 9 && b >= 0 && b < 9) out.push(a * 9 + b); } return out; };
const CLEARABLE = (v) => v === CELL.BLOCK || IS_MON(v); // 消得掉的：方块、墨怪

// 宠物的本事：peck 啄（铜雀）｜gnaw 啃（爆竹鼠）｜silk 吐丝（墨斗蚕）｜fire 火珠（小狮子）｜turn 转块（绿龟）
const at = (arr, lv) => arr[Math.min(arr.length, Math.max(1, lv)) - 1];
// 段 1 第二节：每只宠物 1–10 级。n = 打几格 / 几口 / 补几格 / 火苗 / 转几块；ring = 表盘几格（攒满要消几排）
// 每升一级只变一样（打得多 / 攒得快 / 5 级长大 / 10 级绝招）；没有「开局带能量」（Cc 11-27「B 轮流两样」）
// 绿龟只涨表盘、一颗水珠永远转 1 块，5 级学翻面、10 级学变形（Cc 段 1 定，替换细设计里龟那一行）
const SKILL = {
  n: { tongque: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3], baozhu: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3], modou: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3], huli: [1, 1, 1, 1, 1, 2, 2, 3, 3, 3], lvgui: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  ring: { tongque: [8, 7, 6, 6, 6, 5, 5, 4, 3, 3], baozhu: [8, 7, 6, 6, 6, 5, 5, 4, 3, 3], modou: [9, 8, 7, 7, 7, 6, 6, 5, 4, 4], huli: [11, 10, 9, 8, 8, 8, 7, 7, 6, 6], lvgui: [10, 9, 8, 7, 7, 6, 5, 4, 3, 3] }, // 段 3 规则 12（Cc 11-28 批）：一尾狐整列加 1 格
  kind: { tongque: 'peck', baozhu: 'gnaw', modou: 'silk', huli: 'fire', lvgui: 'turn' },
  intro: 1, // 登场关 / 升级后第一关（fastCharge）：开局只差几格就满
};
const EVO_LV = 5, ULT_LV = 10; // 5 级长大、10 级学绝招
// 长大版映回小时候版
const BASE_OF = { jinchique: 'tongque', dapeng: 'tongque', baozhuwang: 'baozhu', dilong: 'baozhu', canjian: 'modou', hudie: 'modou', sanweihu: 'huli', jiuweihu: 'huli', dagui: 'lvgui', xuanwu: 'lvgui' };
const baseId = (id) => BASE_OF[id] || id;
const skillKind = (id) => SKILL.kind[baseId(id)];
const skillN = (id, lv) => at(SKILL.n[baseId(id)], lv);
const ringOf = (id, lv) => at(SKILL.ring[baseId(id)], lv);
// 五只宠物，每只三个样子：1 级小时候 → 5 级长大 → 10 级完全体（11-28 Cc 定 A 新阵容，全量设计第 207 条；长大要像宝可梦那样有质变）
// 编号是内部用的，不改老编号，只改名字；规则（本事、升级表）一点不变
const PETS = {
  tongque: { name: '小铜雀', color: 0, evo: 'jinchique', evoLv: EVO_LV }, jinchique: { name: '铜隼', color: 0, evo: 'dapeng', evoLv: ULT_LV }, dapeng: { name: '金翅大鹏', color: 0 }, // 金：啄
  baozhu: { name: '小穿山甲', color: 1, evo: 'baozhuwang', evoLv: EVO_LV }, baozhuwang: { name: '穿山甲', color: 1, evo: 'dilong', evoLv: ULT_LV }, dilong: { name: '地龙', color: 1 }, // 土：啃一口、把土堆挖塌
  modou: { name: '蚕宝宝', color: 2, evo: 'canjian', evoLv: EVO_LV }, canjian: { name: '蚕茧', color: 2, evo: 'hudie', evoLv: ULT_LV }, hudie: { name: '蝴蝶', color: 2 }, // 木：吐丝补空格
  huli: { name: '一尾狐', color: 5, evo: 'sanweihu', evoLv: EVO_LV }, sanweihu: { name: '三尾狐', color: 5, evo: 'jiuweihu', evoLv: ULT_LV }, jiuweihu: { name: '九尾狐', color: 5 }, // 火：狐火烫墨怪（女性）
  lvgui: { name: '小龟', color: 6, evo: 'dagui', evoLv: EVO_LV }, dagui: { name: '灵龟', color: 6, evo: 'xuanwu', evoLv: ULT_LV }, xuanwu: { name: '玄武', color: 6 }, // 水：转手上的块
};
// 升到下一级变的是哪一样（段 1 附录 D 丁；给升级演示 R-087 和 T107 用）：'n' 打得多 / 'ring' 攒得快 / 'evo' 5 级长大 / 'ult' 10 级绝招；满级返回 ''
function petGain(id, lv) {
  const to = lv + 1;
  if (to > ULT_LV) return '';
  if (to === EVO_LV) return 'evo';
  if (to === ULT_LV) return 'ult';
  if (skillN(id, to) !== skillN(id, lv)) return 'n';
  if (ringOf(id, to) !== ringOf(id, lv)) return 'ring';
  return '';
}
// 这一关带谁最顺（段 3 规则 10：名单认五只小时候的编号）：金属数给小铜雀、土堆数给小穿山甲，另外三只是 0；没有障碍 → 空
function bestPetFor(st) {
  let metal = 0, dirt = 0;
  st.board.forEach((row) => row.split('').forEach((ch) => { if (ch === 'Z') metal++; else if (ch === 'D') dirt++; }));
  const out = [{ id: 'tongque', n: metal }, { id: 'baozhu', n: dirt }, { id: 'huli', n: 0 }, { id: 'modou', n: 0 }, { id: 'lvgui', n: 0 }].sort((x, y) => y.n - x.n);
  return out[0].n > 0 ? out : [];
}
// 段 3 规则 10：连输两次「请对口的来帮忙」请谁。carried = 带着的那只（任何样子），owned = 自己有的（任何样子）。
// 只有「盘上有带着的这只打不开的障碍，而自己有一只打得开（其中一种）」才请；带的已经是小铜雀或小穿山甲（打得开其中一种）就不请。返回小时候的编号或 null
function helperFor(st, carried, owned) {
  const c = baseId(carried), rank = bestPetFor(st).filter((x) => x.n > 0);
  if (!rank.length || rank.some((x) => x.id === c)) return null;
  const mine = new Set((owned || []).map(baseId));
  const hit = rank.find((x) => mine.has(x.id));
  return hit ? hit.id : null;
}
// 技能块：每只宠物都是这个 1 格的模子
const SKILL_PIECE = { id: 'skill', cat: 0, cells: [[0, 0]], h: 1, w: 1, special: 'skill' };
// 一块技能块用几次：鼠按口数；铜雀 10 级三根羽毛分开用；其余 1 次
const skillPiece = (pt) => { const kind = skillKind(pt.id), n = skillN(pt.id, pt.lv), lv = pt.lv || 1; return Object.assign({}, SKILL_PIECE, { pet: pt.id, lv, kind, n, uses: kind === 'gnaw' ? n : kind === 'peck' && lv >= ULT_LV ? 3 : 1 }); };
// 段 1 规则 3：金凤凰拖着羽毛选横竖。prev：'h' | 'v'；dx, dy：羽毛尖离落点格中心的偏移（单位 = 格）。0.15、0.12 是起始值，段 4 拿真手指调
function peckDir(prev, dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.hypot(dx, dy) < 0.15) return prev;
  if (prev === 'h') return ay - ax > 0.12 ? 'v' : 'h';
  return ax - ay > 0.12 ? 'h' : 'v';
}
// 自己抽一块（照 core.js 的 pickPiece；core 没导出）
function pickPiece(rand, d) {
  const w = [C.weightSmall(d), C.weightMid(d), C.weightBig(d)].map((x) => Math.max(0.02, x));
  let t = rand() * (w[0] + w[1] + w[2]), cat = 0;
  while (cat < 2 && t > w[cat]) { t -= w[cat]; cat++; }
  const pool = core.IDS.filter((id) => core.PIECES[id].cat === cat);
  return core.PIECES[pool[Math.floor(rand() * pool.length)]];
}
// 从一块里啃掉第 j 格（剩下的要还连着；只剩一格就整块吃掉 → null）
function gnawPiece(p, j) {
  if (p.cells.length <= 1) return null;
  const rest = p.cells.filter((_, k) => k !== j);
  const seen = new Set([0]), q = [0];
  while (q.length) { const a = rest[q.pop()]; rest.forEach((b, k) => { if (!seen.has(k) && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1) { seen.add(k); q.push(k); } }); }
  if (seen.size !== rest.length) return undefined; // 啃完断成两截：不让啃
  const r0 = Math.min(...rest.map((x) => x[0])), c0 = Math.min(...rest.map((x) => x[1]));
  const cells = rest.map(([a, b]) => [a - r0, b - c0]);
  const mud = p.mud === undefined || p.mud === j ? undefined : p.mud > j ? p.mud - 1 : p.mud;
  return { id: p.id + '~', cat: p.cat, cells, h: Math.max(...cells.map((x) => x[0])) + 1, w: Math.max(...cells.map((x) => x[1])) + 1, gnawed: (p.gnawed || 0) + 1, mud, mudded: p.mudded };
}
// 段 1 规则 8：绿龟改手上那块的样子、不改格数。rot = 顺时针几个四分之一圈，flip = 左右镜像（先翻再转）；格子顺序不变，所以泥、小爆竹跟着走
function turnPiece(p, rot, flip) {
  let cells = p.cells.map(([r, c]) => [r, c]), h = p.h, w = p.w;
  if (flip) cells = cells.map(([r, c]) => [r, w - 1 - c]);
  for (let i = 0; i < rot; i++) { cells = cells.map(([r, c]) => [c, h - 1 - r]); const t = h; h = w; w = t; }
  return Object.assign({}, p, { id: p.id + (flip ? 'f' : '') + (rot ? 'r' + rot : ''), cells, h, w });
}
const shapeKey = (cells) => cells.map(([r, c]) => r + ',' + c).sort().join(' ');
const orientKeys = (p) => { const out = new Set(); for (const f of [false, true]) for (let r = 0; r < 4; r++) out.add(shapeKey(turnPiece(p, r, f).cells)); return out; };
const near4 = (k) => { const r = Math.floor(k / 9), c = k % 9, out = []; if (r > 0) out.push(k - 9); if (r < 8) out.push(k + 9); if (c > 0) out.push(k - 1); if (c < 8) out.push(k + 1); return out; };
// 铜雀的同一类：metal 金属 / ink 墨块 / block 普通块（你放的、旧块、泥巴格）；别的啄不到
const peckKindOf = (v, col) => (v === CELL.METAL ? 'metal' : v === CELL.BLOCK ? (col === -2 ? 'ink' : 'block') : null);
// 铜雀啄得到的：方块（含墨块）、金属。墨怪、头目啄不到（Cc 11-27 第 4 件：除了火，宠物不抓怪、不打头目）
const PECKABLE = (v) => v === CELL.BLOCK || v === CELL.METAL;
const petDef = (p) => PETS[p.id];
function energyMax(g, p) {
  return ringOf(p.id, p.lv);
}
// 这一关一共几波：开局盘上那一波 + 后面一波一波冒出来的（关卡卡片、宠物园、关里顶上的圆点都用这一个数）
const waveTotalOf = (st) => 1 + ((st && st.waves) || []).length;
// 段 3 规则 3：「只差 1 格」认宠物。st.fastCharge = true（main.js：新宠物第一次出战 / 升级后第一关）→ 带谁都给；= '宠物编号'（关卡表：第 3、8、12 关）→ 只有带这只（长大版也算）才给
const fastFor = (st, p) => st.fastCharge === true || (typeof st.fastCharge === 'string' && baseId(p.id) === st.fastCharge);

// opts: { stage, team:[{id,lv}], seed, tutorial, crumb }（crumb: false = 不给 10 级鼠的小土块，main.js 画面接上以前用）
function createPetGame(opts) {
  const o = opts || {};
  const st = o.stage;
  const g = core.createGame({ stage: st, seed: o.seed, tutorial: o.tutorial });
  Object.assign(g, {
    pets: true,
    color: new Array(81).fill(0),
    handColor: [0, 0, 0, 0],
    team: (st.team || o.team || []).map((p) => ({ id: p.id, lv: p.lv || 1, energy: fastFor(st, p) ? ringOf(p.id, p.lv || 1) - SKILL.intro : 0 })), // 段 1 规则 9：不带开局能量，只有「只差 1 格」的时候差 1 格
    bigHp: 0, bigCells: [], boss: null, skillUses: 0,
    mon: new Array(81).fill(null), // 墨怪的种类和状态
    silkHp: new Array(81).fill(0), // 蝴蝶 10 级的丝：2 = 新丝（消一次变旧丝）、1 = 旧丝（再消一次才没）
    monStats: { moss: 0 }, // 这一关墨怪干了几回（测试和以后的统计用）
    playStats: { clearMoves: 0, dry: 0, maxDry: 0, bossByPlayer: 0, units: 0, firstClear: 0, firstGoal: 0, goalsByPet: 0, goalsByPlayer: 0 }, // 0.9.6 记录器：第几手第一次消 / 第一次碰到目标、目标谁完成的； // 手感统计：几手有消、最长几手没消、头目的心谁打掉的
    caught: 0, petActsTotal: {},
  });
  // 盘面字符：m 小墨怪；G 墨苔怪；N 粘墨怪；Z 金属；D 土堆；K 头目（2×2）
  // 把一个字符摆到盘上的第 k 格（墨怪 / 障碍）；摆了返回 true
  function putChar(b, ch, k) {
    if (MON_CHAR[ch]) { b[k] = CELL.MON; g.mon[k] = newMon(MON_CHAR[ch]); return true; }
    if (ch === 'Z') { b[k] = CELL.METAL; return true; } // 金属
    if (ch === 'D') { b[k] = CELL.DIRT; return true; } // 0.9.20 第二章：一堆土（只有爆竹鼠啃过的块带的小爆竹炸得塌）
    return false;
  }
  st.board.forEach((row, r) => row.split('').forEach((ch, c) => {
    const k = r * 9 + c;
    if (!putChar(g.board, ch, k) && ch === 'K') { g.board[k] = CELL.BOSS; g.bigCells.push(k); }
    if (g.board[k] === CELL.BLOCK) g.color[k] = -1;
  }));
  // 一波一波冒出来（stage.waves）：盘上的墨怪抓光了，下一波墨怪从墨里冒出来。盘面不清空：你放的块、墨块都还在。
  // 每一波写成一张 9×9 的小图，只认里面的墨怪；那一格被占了，就冒在离它最近的空格。
  const isMonCh = (ch) => !!MON_CHAR[ch];
  g.waveQ = (st.waves || []).map((w) => w.slice());
  g.waveNo = 1; g.waveTotal = waveTotalOf(st);
  const waveMonCount = () => g.waveQ.reduce((a, w) => a + w.join('').split('').filter(isMonCh).length, 0);
  function nextWave(b, ev) {
    if (!g.waveQ.length || g.mon.some(Boolean)) return;
    const w = g.waveQ.shift(); g.waveNo++;
    const dropped = [];
    w.forEach((row, r) => row.split('').forEach((ch, c) => {
      if (!isMonCh(ch)) return;
      let k = r * 9 + c;
      if (b[k] !== CELL.EMPTY) { let best = -1, bd = 99; for (let x = 0; x < 81; x++) { if (b[x] !== CELL.EMPTY) continue; const d = Math.abs(Math.floor(x / 9) - r) + Math.abs((x % 9) - c); if (d < bd) { bd = d; best = x; } } k = best; }
      if (k >= 0 && putChar(b, ch, k)) dropped.push(k);
    }));
    ev.wave = { no: g.waveNo, of: g.waveTotal, cells: dropped };
  }
  if (g.bigCells.length) {
    g.bigHp = st.bigHp || 3;
    g.boss = { kind: st.bossKind || 'spit', hp: g.bigHp, max: g.bigHp, count: 0, jumpTo: null };
    if (st.bossMud) g.boss.mudCd = BOSS_MUD_CD; // 泥沼怪：还剩几手吐泥（单独的倒数，不和别的计数搅在一起）
  }
  // 发块的颜色：出战宠物的颜色多发（×2.5），这一关的颜色表里没有它的颜色就自动加上
  const palette = (st.colors || [0, 1, 2, 3]).slice();
  g.team.forEach((p) => { if (!palette.includes(petDef(p).color)) palette.push(petDef(p).color); });
  g.pickColor = () => {
    const ws = palette.map((ci) => ({ ci, w: g.team.some((p) => petDef(p).color === ci) ? 2.5 : 1 }));
    let t = g.rand() * ws.reduce((a, x) => a + x.w, 0);
    for (const x of ws) { if ((t -= x.w) <= 0) return x.ci; }
    return ws[0].ci;
  };
  // 托盘第 4 格 = 宠物格：技能块放这儿，发新块、换一组都不动它
  const colorsOfHand = () => g.hand.map((p) => (p && p.special ? PETS[p.pet].color : g.pickColor()));
  // 0.9.17：这块放到盘上哪儿能消掉东西（能消几处最多的那个位置）；没有返回 null
  function clearingHome(b, p) {
    if (!p || p.special) return null;
    let best = null;
    for (const [r, c] of core.placements(b, p)) { const n = core.placeAndClear(b, p, r, c).units.length; if (n && (!best || n > best.units)) best = { r, c, units: n }; }
    return best;
  }
  g.clearingHome = (i) => clearingHome(g.board, g.hand[i]);
  // 普通关发块（学 Woodoku，Cc 11-27「照清单全做」第 4 条）：三块里至少一块有个「放下去就能消」的家；同时照旧保证三块都放得下
  function ensureHome() {
    const hand = g.hand.slice(0, 3);
    if (hand.some((p) => clearingHome(g.board, p))) return;
    const d = g.diff ? g.diff() : 0;
    for (let t = 0; t < 40; t++) {
      const j = Math.floor(g.rand() * 3), q = pickPiece(g.rand, d);
      if (!clearingHome(g.board, q)) continue;
      const h = hand.slice(); h[j] = q;
      if (core.solvable(g.board, h.filter(Boolean))) { g.hand[j] = q; g.homeDeals = (g.homeDeals || 0) + 1; return; }
    }
  }
  const baseDeal = g.deal;
  g.deal = () => { const sk = g.hand[3] || null; baseDeal();
    if (!st.rush && !(o.tutorial && !g.moves)) ensureHome();
    g.hand[3] = sk; g.handColor = colorsOfHand(); g.lastDealOK = core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean)); g.lastDealMove = g.moves; g.lastDealUnfair = !g.lastDealOK && core.solvable(g.board, [core.PIECES['1'], core.PIECES['2h'], core.PIECES['1']]); if (!g.lastDealOK) g.badDeals = (g.badDeals || 0) + 1; };
  g.lastDealOK = core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean)); g.lastDealMove = 0;
  // 【难度】一关里越往后越挤：st.dSeg = [第一段, 第二段, 第三段] 各发多少大块（跟着第几波走）
  g.diff = () => (st.dSeg ? st.dSeg[Math.min((g.waveNo || 1) - 1, st.dSeg.length - 1)] : (st.d || 0));
  const baseReroll = g.reroll;
  g.reroll = () => { const sk = g.hand[3] || null; g.hand.length = 3; baseReroll(); g.hand[3] = sk; g.handColor = colorsOfHand(); if (st.rush && g.rushRepair) g.rushRepair(); };
  g.hand[3] = null;
  g.handColor = colorsOfHand();
  // 0.9.14 debug：开局这三块是 core 在墨怪、头目摆上盘之前发的，五十局里有一局三块没法全放下。照「发牌一定有活路」（Cc 11-25 定）重发一次；新手引导那一手不动
  if (!o.tutorial && !core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean))) g.deal();
  // ---------- 0.9.20 冲锋关重做（Cc 11-27「记一下」：「手上3个牌，棋盘上就应该只有这3个空位……迅速地眯着眼睛一扫就知道哪个放哪个……
  // 这3个牌都放完，整个棋盘也变新牌也发出来了，就相当于不停地爽……塞塞塞塞塞」）----------
  // 盘面永远是满的，只留正好 3 个空，每个空的形状 = 手上一块；三个空各占自己的行、列、大格，互不挨着，所以塞哪块都一定整片消。
  // 消完马上补满（只留没塞的那几个空）；三块都塞完：整盘换新、再发三块。塞错了也不会输：照新盘面重新挖空。没有墨怪，宠物不出技能块。
  const RUSH_POOL = core.IDS.filter((id) => core.PIECES[id].cells.length >= 2 && core.PIECES[id].cells.length <= 5);
  g.rushGap = [null, null, null]; // 每块对应的空：{ r, c }
  const gapCells = (p, at) => p.cells.map(([dr, dc]) => (at.r + dr) * 9 + at.c + dc);
  const unitsOf = (cells) => { const s2 = new Set(); cells.forEach((k) => { const r = Math.floor(k / 9), c = k % 9; s2.add(r); s2.add(9 + c); s2.add(18 + core.boxOf(r, c)); }); return s2; };
  // 冲锋关的盘：平常的彩色方块铺满，只在「本来该消、却没消」的排 / 列 / 大格里放一块「铜砖」（盘面值 8）
  // 0.9.22 Cc 11-27：「是指能消除而没消除的部分用特殊块儿，而不是全图都用特殊块儿。全图都用特殊块儿的话，爽感不太好」
  // 规矩：只有你这一块塞进去的那几排 / 列 / 大格会消（连里面的铜砖一起炸）；别的满着的排，里面一定有铜砖，所以一看就知道它不会自己消
  function fillAll(b, keep) { const added = []; for (let k = 0; k < 81; k++) if (b[k] === CELL.EMPTY && !keep.has(k)) { b[k] = 1; g.color[k] = g.pickColor(); added.push(k); } placeBricks(new Set(added)); return added; }
  function placeBricks(prefer) {
    const b = g.board;
    for (let t = 0; t < 30; t++) {
      const open = UNITS.map((u, ui) => ui).filter((ui) => core.unitFull(b, ui) && !UNITS[ui].some((k) => b[k] === CELL.BRICK));
      if (!open.length) return;
      const openSet = new Set(open);
      let best = -1, bs = -1;
      for (let k = 0; k < 81; k++) {
        if (b[k] !== CELL.BLOCK) continue;
        const r = Math.floor(k / 9), c = k % 9, hits = [r, 9 + c, 18 + core.boxOf(r, c)].filter((u) => openSet.has(u)).length;
        if (!hits) continue;
        const sc = hits * 10 + (prefer && prefer.has(k) ? 4 : 0) + g.rand() * 3;
        if (sc > bs) { bs = sc; best = k; }
      }
      if (best < 0) return;
      b[best] = 8; g.color[best] = 0;
    }
  }
  // 给第 i 块挖一个空：不碰别的块的空所在的行、列、大格
  function carve(b, i) {
    const p = g.hand[i]; if (!p) return false;
    const used = new Set(); for (let j = 0; j < 3; j++) if (j !== i && g.rushGap[j] && g.hand[j]) unitsOf(gapCells(g.hand[j], g.rushGap[j])).forEach((u) => used.add(u));
    const opts = [];
    for (let r = 0; r + p.h <= 9; r++) for (let c = 0; c + p.w <= 9; c++) { const cells = gapCells(p, { r, c }); if ([...unitsOf(cells)].some((u) => used.has(u))) continue; opts.push({ r, c }); }
    if (!opts.length) return false;
    const at = opts[Math.floor(g.rand() * opts.length)];
    gapCells(p, at).forEach((k) => { b[k] = 0; g.color[k] = 0; });
    g.rushGap[i] = at;
    return true;
  }
  // 新的一盘：三块新的 + 满盘 + 挖三个空（挖不下就换小一点的块再来）
  function rushBoard(ev) {
    const b = g.board;
    for (let t = 0; t < 60; t++) {
      for (let i = 0; i < 3; i++) { g.hand[i] = core.PIECES[RUSH_POOL[Math.floor(g.rand() * RUSH_POOL.length)]]; g.handColor[i] = g.pickColor(); }
      g.rushGap = [null, null, null];
      for (let k = 0; k < 81; k++) { b[k] = 1; g.color[k] = g.pickColor(); }
      if ([0, 1, 2].every((i) => carve(b, i))) break;
    }
    ensureGaps([0, 1, 2]);
    const fix = rushFixPlan();
    if (ev) { ev.rushBoard = true; ev.rushNew = [0, 1, 2]; ev.rushFix = fix; } else g.rushFixStart = fix;
  }
  // 0.9.21 修第 16 关卡死（Cc 11-27：「整个地图都是满的，手里还有一块塞不进去、没地方放了，但它也不消」）：
  // 原来剩下的块重挖不出空就不管了。现在保证手上每块都有自己的空：先只重挖坏掉的，不行就剩下的全部重挖，再不行换小一点的块
  g.rushOK = (i, r, c) => { const p = g.hand[i]; if (!p || !core.canPlace(g.board, p, r, c)) return false; const b2 = g.board.slice(), placed = p.cells.map(([dr, dc]) => (r + dr) * 9 + c + dc); placed.forEach((k) => { b2[k] = 1; }); return placed.some((k) => UNITS.some((u, ui) => u.includes(k) && core.unitFull(b2, ui))); };
  // 万一哪条路把手上的块换了（看广告换一批之类）：重挖到每块都有一放就消的空
  g.rushStuck = () => st.rush && !g.over && [0, 1, 2].some((i) => g.hand[i] && !core.placements(g.board, g.hand[i]).some(([r, c]) => g.rushOK(i, r, c)));
  g.rushRepair = () => { for (let k = 0; k < 81; k++) if (g.board[k] === CELL.EMPTY) { g.board[k] = 1; g.color[k] = g.pickColor(); } g.rushGap = [null, null, null]; ensureGaps([0, 1, 2]); };
  const rushFits = (i) => { const at = g.rushGap[i]; return !!(at && g.hand[i] && core.canPlace(g.board, g.hand[i], at.r, at.c)); };
  function ensureGaps(slots) {
    const b = g.board;
    slots = slots.filter((i) => g.hand[i]);
    slots.forEach((i) => { if (!rushFits(i)) { g.rushGap[i] = null; carve(b, i); } });
    for (let t = 0; t < 80 && !slots.every(rushFits); t++) {
      slots.forEach((i) => { const at = g.rushGap[i]; if (at && g.hand[i]) gapCells(g.hand[i], at).forEach((k) => { if (b[k] === CELL.EMPTY) { b[k] = 1; g.color[k] = g.pickColor(); } }); g.rushGap[i] = null; });
      const order = slots.slice().sort(() => g.rand() - 0.5);
      if (t >= 30) { const small = RUSH_POOL.filter((id) => core.PIECES[id].cells.length <= (t >= 55 ? 2 : 3)); const j = order[Math.floor(g.rand() * order.length)]; g.hand[j] = core.PIECES[small[Math.floor(g.rand() * small.length)]]; }
      order.forEach((i) => carve(b, i));
    }
    placeBricks(null);
  }
  // 0.9.21 宠物自动出击（Cc 11-27：「换新棋盘宠物立马上去修，然后我就放放放」）：新盘面「看上去差一点」，出战宠物飞上去修好。
  // 规则上盘面本来就是好的（只是画面上先多画一格），所以玩家不用等宠物、随时能放；机器人也不受影响
  function rushFixPlan() {
    const pt = g.team && g.team[0]; if (!pt) return null;
    const kind = skillKind(pt.id);
    const slots = [0, 1, 2].filter((i) => g.hand[i] && g.rushGap[i]);
    if (!slots.length) return null;
    const j = slots[Math.floor(g.rand() * slots.length)];
    if (kind === 'gnaw') { const q = addMud(g.hand[j], true); if (q) return { kind: 'gnaw', pet: pt.id, slot: j, piece: q, orig: g.hand[j] }; }
    // 段 3 规则 9：五只各报自己的修法（画法段 4、6）。小龟：手上那块先画成转歪的（rot 1–3），龟把它转正
    if (kind === 'turn') { const p = g.hand[j], rot = 1 + Math.floor(g.rand() * 3); if (shapeKey(turnPiece(p, rot, false).cells) !== shapeKey(p.cells)) return { kind: 'turn', pet: pt.id, slot: j, rot }; }
    const cells = gapCells(g.hand[j], g.rushGap[j]);
    // 蚕宝宝：这块的空旁边「少画的一格」（空的邻格里挑一个现在是块的，画面先当它是空的，丝补上）
    if (kind === 'silk') { const nb = [...new Set(cells.flatMap(near4))].filter((x) => !cells.includes(x) && g.board[x] === CELL.BLOCK); if (nb.length) return { kind: 'silk', pet: pt.id, k: nb[Math.floor(g.rand() * nb.length)] }; }
    // 小铜雀啄掉、一尾狐烧掉「多画的那一格」（空里的一格，画面先画成有块）
    return { kind: kind === 'fire' ? 'fire' : 'peck', pet: pt.id, k: cells[Math.floor(g.rand() * cells.length)] };
  }
  // 塞完一块以后：补满（留着剩下几块的空）；剩下哪块的空被弄坏了就重挖；三块都塞完就整盘换新
  function rushAfter(ev, placedSlot) {
    g.rushGap[placedSlot] = null;
    const left = [0, 1, 2].filter((i) => g.hand[i]);
    if (!left.length) { g.rushBoards = (g.rushBoards || 0) + 1; ev.rushBurst = []; for (let k = 0; k < 81; k++) if (g.board[k]) ev.rushBurst.push(k); rushBoard(ev); return; } // 三块塞完：剩下的铜砖整盘炸开，再换新盘
    const keep = new Set(); left.forEach((i) => { if (g.rushGap[i]) gapCells(g.hand[i], g.rushGap[i]).forEach((k) => keep.add(k)); });
    ev.refill = fillAll(g.board, keep);
    ensureGaps(left);
    ev.rushFix = rushFixPlan(); // 0.9.22 每放一块，宠物都飞出去修一下剩下的（Cc：「宠物应该自动地从右下角不停地飞出去，要么啃地图，要么啃我手上」）
  }
  if (st.rush) {
    g.rush = true;
    rushBoard(null);
  } else if (st.startHand && !o.tutorial) { st.startHand.forEach((id, j) => { g.hand[j] = core.PIECES[id]; }); } // 0.9.20 第 11 关：开局故意发几块放不太下的大块（教啃）
  else if (!o.tutorial) ensureHome();
  g.rushHome = (i) => (st.rush ? clearingHome(g.board, g.hand[i]) : null);
  // 看广告复活以后一定有块可放（0.9.14 debug）。0.9.17 看广告救命（Fable 新版第八节 + Cc 11-27 第 8 件定 B）：清最挤的 3 个大格（只清你放的块和墨块；墨怪、金属、头目不动），
  // 手上三块换成小块（1–3 格）、保证放得下；一关最多 3 次（C.adMax）。g.lastRevive = 清了哪几格（画面照这个演）
  const SMALL = core.IDS.filter((id) => core.PIECES[id].cat === 0);
  g.revive = () => {
    g.adsUsed++; g.revivesUsed = (g.revivesUsed || 0) + 1;
    const b = g.board;
    // 0.9.20（Cc 11-27 第 134 条定「改」）：第 1 次清最挤的 3 个大格、第 2 次 2 个、第 3 次 1 个；用过救命这关最多 2 星（main.js 的 liveStars）
    const nBox = [3, 2, 1][Math.min(2, g.revivesUsed - 1)];
    const boxes = [...Array(9).keys()].map((bx) => ({ bx, n: UNITS[18 + bx].filter((k) => b[k] === CELL.BLOCK).length })).sort((x, y) => y.n - x.n || x.bx - y.bx).slice(0, nBox).filter((x) => x.n > 0).map((x) => x.bx);
    const cells = [];
    boxes.forEach((bx) => UNITS[18 + bx].forEach((k) => { if (b[k] === CELL.BLOCK) { b[k] = 0; g.color[k] = 0; g.silkHp[k] = 0; cells.push(k); } }));
    for (let i = 0; i < 3; i++) {
      let q = null;
      for (let t = 0; t < 30 && !q; t++) { const c = core.PIECES[SMALL[Math.floor(g.rand() * SMALL.length)]]; if (core.anyPlacement(b, c)) q = c; }
      g.hand[i] = q || core.PIECES['1']; g.handColor[i] = g.pickColor();
    }
    g.lastRevive = { boxes, cells };
    g.over = false; g.reason = null; g._ended = false;
    syncAll();
    if (g.stuck()) { g.over = true; g.reason = 'stuck'; }
  };
  // 段 1 规则 9：放块（含墨怪爬进去凑满）消一处亮一格。宠物格空着先加再吐；宠物格里有块时表盘最多亮满，不再往上涨（不让囤）
  function charge(n, ev) {
    if (st.rush || !n) return;
    for (const pt of g.team) { pt.energy += n; if (ev) ev.energy[pt.id] = n; }
    giveSkill(ev);
    for (const pt of g.team) if (g.hand[3]) pt.energy = Math.min(pt.energy, energyMax(g, pt));
  }
  // 能量满了、宠物格空着：吐一块技能块（能量多出来的留着）。宠物格占着就先憋着。
  function giveSkill(ev) {
    if (st.rush) return;
    for (const pt of g.team) {
      if (g.hand[3] || pt.energy < energyMax(g, pt)) continue;
      pt.energy -= energyMax(g, pt);
      g.hand[3] = skillPiece(pt); g.handColor[3] = petDef(pt).color;
      if (ev) ev.petActs.push({ id: pt.id, kind: 'gift', lines: [], boxes: [], cells: [] });
    }
  }
  // 清掉一批格子。byPet：技能块下的手；petId：哪只宠物（金属只有铜雀啄得开）
  function clearCells(b, cells, ev, byPet, petId) {
    for (const k of cells) {
      const v = b[k];
      if (v === CELL.EMPTY || v === CELL.BOSS || v === CELL.DIRT) continue;
      if (v === CELL.METAL) { if (byPet && baseId(petId) === 'tongque') openCell(b, k, PETS.tongque.color, ev); continue; } // 金属：只有铜雀的羽毛啄得开
      if (IS_MON(v)) {
        if (byPet) g.playStats.goalsByPet++; else g.playStats.goalsByPlayer++;
        if ('monster' in g.got) g.got.monster++; g.caught++; ev.collected.push({ k, what: 'monster', t: g.mon[k] ? g.mon[k].t : 'ink' }); g.mon[k] = null;
      }
      if (v === CELL.BLOCK && g.silkHp[k] > 1) { g.silkHp[k] = 1; (ev.oldSilk = ev.oldSilk || []).push(k); continue; } // 段 1 规则 6 蝴蝶 10 级「丝不断」：消一次变旧丝，仍算有块
      g.silkHp[k] = 0;
      b[k] = 0;
    }
  }
  // 段 1 规则 2（Cc 11-27「泥土块变成普通的格子也能消才对」「金属一样变普通格」）：打开 = 变一格普通方块（打开它的宠物的颜色），不是变空格
  function openCell(b, k, color, ev) {
    const was = b[k]; b[k] = CELL.BLOCK; g.color[k] = color;
    if (was === CELL.METAL) { (ev.metal = ev.metal || []).push(k); g.monStats.metal = (g.monStats.metal || 0) + 1; }
    else { (ev.blast = ev.blast || []).push(k); g.monStats.dirt = (g.monStats.dirt || 0) + 1; }
  }
  // 打开以后马上看它的排、列、大格：满了当场消，算你消的（抓怪、头目掉心、算「消几排」），不攒能量（规则 9）
  function openClear(b, opened, ev) {
    const units = [];
    for (let u = 0; u < 27; u++) if (UNITS[u].some((k) => opened.includes(k)) && core.unitFull(b, u)) units.push(u);
    if (!units.length) return [];
    const set = new Set(); units.forEach((u) => { unitTouches(b, UNITS[u], ev); UNITS[u].forEach((k) => set.add(k)); });
    const was = [...set].filter((k) => CLEARABLE(b[k]));
    clearCells(b, [...set], ev, false);
    const cells = was.filter((k) => b[k] === CELL.EMPTY);
    if ('lines' in g.got) g.got.lines += units.length;
    ev.openClear = { units, cells };
    return units;
  }
  // 头目掉心。o.hit：算它「挨了一下」（凑够 bossEvery 下跳）；o.byPet：宠物打的（小狮子的火）
  function bossHit(b, ev, dmg, o) {
    o = o || {};
    g.bigHp = Math.max(0, g.bigHp - dmg);
    g.boss.hp = g.bigHp;
    ev.bigHits.push({ k: g.bigCells[0], dmg, fire: !!o.fire });
    if (o.byPet || o.fire) g.playStats.goalsByPet += dmg; else { g.playStats.bossByPlayer += dmg; g.playStats.goalsByPlayer += dmg; }
    // 0.9.17（Fable 新版第一章第 10 关）：每挨 st.bossEvery 下跳一次，跳之前落脚的 2×2 先亮红框一手
    if (o.hit && st.bossEvery && g.bigHp > 0) { g.boss.hits = (g.boss.hits || 0) + dmg; if (g.boss.hits >= st.bossEvery && g.boss.jumpTo === null) { g.boss.hits = 0; planBossJump(b, ev); } }
    if (g.bigHp === 0) {
      g.bigCells.forEach((k) => (b[k] = 0));
      g.caught += 3;
      if ('boss' in g.got) g.got.boss = 1;
      ev.collected.push({ k: g.bigCells[0], what: 'boss' });
      ev.bossDown = true;
    }
  }
  // 一次「消掉」（一排 / 一个大格）碰到了头目：掉一颗心（0.9.17：「破绽」砍掉，挨一下就是 1 颗心）
  function unitTouches(b, cells, ev) {
    if (!(g.boss && g.bigHp > 0 && cells.some((k) => b[k] === CELL.BOSS))) return;
    bossHit(b, ev, 1, { hit: true });
    // 段 1 规则 7 麒麟 10 级「引火」：身上还有火苗时凑满穿过它的排，火再多烫 1 颗、火苗回满（这一手不再另烧，取弱的读法）
    const bs = g.boss;
    if (bs.fire > 0 && bs.fireUlt && g.bigHp > 0) { bossHit(b, ev, 1, { fire: true }); bs.fire = bs.fireMax; bs.fireLit = g.moves; (ev.bossFire = ev.bossFire || []).push({ left: bs.fire, lit: true }); }
  }
  function planBossJump(b, ev) {
    const opts2 = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const tl = r * 9 + c, cells = [tl, tl + 1, tl + 9, tl + 10];
      if (cells.some((k) => g.bigCells.includes(k))) continue;
      if (!cells.every((k) => b[k] === CELL.EMPTY || b[k] === CELL.BLOCK)) continue;
      // 段 1 规则 1：穿过它的 2 排 2 列里至少留 2 条没被障碍堵的，不然你打不到它（都不行就这次不跳）
      const open = [r, r + 1, 9 + c, 9 + c + 1].filter((u) => !UNITS[u].some((k) => core.BLOCKS_CLEAR(b[k]))).length;
      if (open >= 2) opts2.push(tl);
    }
    if (opts2.length) { g.boss.jumpTo = opts2[Math.floor(g.rand() * opts2.length)]; g.boss.planMove = g.moves; ev.bossJumpPlan = g.boss.jumpTo; }
  }
  // 救命（并在宠物身上）：三块都放不下、宠物格空着、表盘亮了一半以上（单数往上取：8 格亮 4、7 格亮 4、3 格亮 2）→ 宠物提前把技能块给你，表盘清零
  // 段 1 规则 9（Cc 同意的收紧第 4 条）：原来亮一格就给，改成过半。给了也不保证救得活
  function rescue(ev) {
    if (!g.stuck() || g.hand[3] || !g.team.length) return;
    const ok = (x) => x.energy >= Math.ceil(energyMax(g, x) / 2);
    const pt = g.team.filter(ok).sort((x, y) => y.energy / energyMax(g, y) - x.energy / energyMax(g, x))[0];
    if (!pt) return;
    pt.energy = 0;
    g.hand[3] = skillPiece(pt); g.handColor[3] = petDef(pt).color; ev.rescue = pt.id; g.rescues = (g.rescues || 0) + 1;
    ev.petActs.push({ id: pt.id, kind: 'gift', lines: [], boxes: [], cells: [], rescue: true });
  }
  // 技能块用在哪（tg）：盘上 { r, c }；手上的块 { hand: 第几块, cell: 它的第几格 }。返回这一下会碰到什么（画面照这个亮），用不了返回 null。
  //   啄：拖到盘上哪一格都行，啄掉这一排里离它最近的 N 样东西。
  //   啃：拖到手上的块的某一格上啃掉它；一块技能块能啃 N 口。吐丝：拖到空格上，补上它和这一排里离它最近的空格，一共 N 格。
  function skillPlan(pc, tg, b0) {
    const b = b0 || g.board, kind = pc.kind, n = pc.n;
    if (tg.hand !== undefined) {
      const p = g.hand[tg.hand];
      if (!p || p.special || tg.hand > 2) return null;
      if (kind === 'gnaw') {
        // 段 1 规则 4（Cc 同意的收紧第 1 条）：只剩 1 格的块、已经带着小爆竹的块（一块只挨一口）、啃了会断成两截的格子，都啃不了
        if (p.cells.length <= 1 || p.gnawed) return null;
        const q = gnawPiece(p, tg.cell); if (!q) return null;
        if ((pc.lv || 1) >= EVO_LV) q.blast8 = true; // 鼠王啃过的块：小爆竹炸周围一圈 8 格
        return { hand: tg.hand, cell: tg.cell, to: q, cells: [], fill: [] };
      }
      if (kind === 'turn') {
        // 段 1 规则 8 + Cc 段 1 定：1 级转、5 级大龟还能翻面、10 级还能变形（同样格数的另一种形状，3 种里选）。转了等于没转的不算用掉
        const lv = pc.lv || 1;
        if (tg.shape !== undefined) {
          if (lv < ULT_LV) return null;
          const id = g.turnShapes(tg.hand)[tg.shape]; if (!id) return null;
          return { hand: tg.hand, to: Object.assign({}, core.PIECES[id], { id: id + '*', gnawed: p.gnawed, blast8: p.blast8, mudded: p.mudded }), shape: id, cells: [], fill: [] }; // 变形：泥没了，小爆竹还在
        }
        const flip = !!tg.flip && lv >= EVO_LV, rot = tg.rot === undefined ? (tg.flip ? 0 : 1) : ((tg.rot % 4) + 4) % 4;
        const q = turnPiece(p, rot, flip);
        return shapeKey(q.cells) === shapeKey(p.cells) ? null : { hand: tg.hand, to: q, rot, flip, cells: [], fill: [] };
      }
      return null;
    }
    const k = tg.r * 9 + tg.c;
    if (kind === 'peck') {
      // 段 1 规则 3（Cc 同意的收紧第 2 条）：点什么啄什么。落点那格 + 同一条线上离它最近的同一类（金属 / 墨块 / 普通块），不拿别的类凑数
      const kd = peckKind(b, k); if (!kd) return null; // 空格、墨怪、头目、土堆：用不了，羽毛滑回去
      if ((pc.lv || 1) >= ULT_LV) return { cells: [k], fill: [] }; // 10 级三根羽毛：每根只啄落点
      const dir = (pc.lv || 1) >= EVO_LV && tg.dir === 'v' ? 'v' : 'h'; // 1–4 级只能横着
      const line = dir === 'v' ? UNITS[9 + tg.c] : UNITS[tg.r], pos = (x) => (dir === 'v' ? Math.floor(x / 9) - tg.r : (x % 9) - tg.c);
      const more = line.filter((x) => x !== k && peckKind(b, x) === kd).sort((x, y) => Math.abs(pos(x)) - Math.abs(pos(y)) || x - y).slice(0, n - 1); // 等距先左（先上）
      return { cells: [k].concat(more), fill: [], dir };
    }
    if (kind === 'silk') {
      if (b[k] !== CELL.EMPTY) return null;
      const fill = UNITS[tg.r].filter((x) => b[x] === CELL.EMPTY).sort((x, y) => Math.abs((x % 9) - tg.c) - Math.abs((y % 9) - tg.c) || x - y).slice(0, n);
      // 段 1 规则 6：蚕的丝不抓怪（Cc 11-27：除了火，宠物的技能不抓怪）。5 级蝴蝶：挨着的墨怪里缠住一只（最快要动的那只），头目缠不住
      let tie = null;
      if ((pc.lv || 1) >= EVO_LV) { const adj = [...new Set(fill.flatMap(near4))].filter((x) => b[x] === CELL.MON && g.mon[x]).sort((x, y) => urgency(x) - urgency(y) || x - y); tie = adj.length ? adj[0] : null; }
      return { cells: [], fill, tie };
    }
    if (kind === 'fire') {
      // 段 1 规则 7：火珠拖到墨怪或头目身上，烫一下；5 级麒麟朝 dir（u d l r）喷一道火，穿过空格和怪，撞到方块、障碍、头目或盘边为止
      if (b[k] !== CELL.MON && b[k] !== CELL.BOSS) return null;
      const cells = [k], line = [];
      const step = { u: [-1, 0], d: [1, 0], l: [0, -1], r: [0, 1] }[(pc.lv || 1) >= EVO_LV ? tg.dir : null];
      if (step && b[k] !== CELL.BOSS) {
        let r = tg.r + step[0], c = tg.c + step[1];
        while (r >= 0 && r < 9 && c >= 0 && c < 9) {
          const x = r * 9 + c; line.push(x);
          if (b[x] === CELL.MON) cells.push(x); else if (b[x] === CELL.BOSS) { cells.push(x); break; } else if (b[x] !== CELL.EMPTY) break;
          r += step[0]; c += step[1];
        }
      }
      return { cells, fill: [], dir: step ? tg.dir : null, line };
    }
    return null; // 鼠只啃手上的块、不上盘（0.9.20 Cc 定）；火的新写法在段 1 第 9 步
  }
  const peckKind = (b, x) => peckKindOf(b[x], g.color[x]);
  // 墨怪还剩几手要动（蝴蝶缠「最快要动的那只」；粘墨怪看吐泥的倒数）
  const urgency = (x) => { const m = g.mon[x]; if (!m) return 99; if (m.t === 'sticky') return m.cd; if (m.step !== undefined && m.step !== null) return 0; return m.walk === undefined ? st.crawl || 99 : m.walk; };
  // 大龟 10 级变形的 3 种候选（同样格数、不是这块转 / 翻得到的样子）；每块技能块对每一块只抽一次
  g.turnShapes = (j) => {
    const pc = g.hand[3], p = g.hand[j]; if (!pc || !p) return [];
    pc.shapes = pc.shapes || {}; const key = j + ':' + p.id;
    if (!pc.shapes[key]) { const own = orientKeys(p), pool = core.IDS.filter((id) => core.PIECES[id].cells.length === p.cells.length && !own.has(shapeKey(core.PIECES[id].cells))), out = []; while (pool.length && out.length < 3) out.push(pool.splice(Math.floor(g.rand() * pool.length), 1)[0]); pc.shapes[key] = out; }
    return pc.shapes[key];
  };
  g.skillPlan = (tg) => (g.hand[3] ? skillPlan(g.hand[3], tg) : null);
  // 0.9.25 修卡死：手上只剩斜着连的块（哪一格都啃不了）时，原来还当技能能用、不判堵死，玩家就卡在那儿（全流程测试「手生」那趟查出来的）
  g.skillUsable = () => { const pc = g.hand[3]; if (!pc) return false; if (pc.kind === 'gnaw') return [0, 1, 2].some((j) => g.hand[j] && g.hand[j].cells.some((_, n) => !!g.skillPlan({ hand: j, cell: n }))); if (pc.kind === 'turn') return [0, 1, 2].some((j) => g.hand[j] && ([1, 2, 3].some((rot) => !!g.skillPlan({ hand: j, rot })) || !!g.skillPlan({ hand: j, rot: 0, flip: true }))); return pc.kind === 'silk' ? g.board.some((v) => v === CELL.EMPTY) : pc.kind === 'peck' ? g.board.some(PECKABLE) : pc.kind === 'fire' ? g.board.some((v) => v === CELL.MON || v === CELL.BOSS) : false; }; // 防卡死：火要盘上有怪，龟要手上有一块转了会变样
  // 小土块也算「手上的块」：盘上有空格就不算堵死（附录 C）
  const baseStuck = g.stuck;
  g.stuck = () => baseStuck() && !(g.crumb && g.board.some((v) => v === CELL.EMPTY));
  const baseFits = g.fits;
  g.fits = (i) => (i === 3 ? g.skillUsable() : baseFits(i));
  // 用技能块。不算一手，墨怪不动，不发新块。
  function useSkill(i, tg) {
    const p = g.hand[i], plan = skillPlan(p, tg);
    if (!plan) return null;
    const b = g.board.slice(), cells = plan.cells;
    const ev = { piece: p, r: tg.r, c: tg.c, placed: [], units: [], cells: [], collected: [], bigHits: [], petActs: [], energy: {}, sparks: [], fire: null, gained: 0, win: false, skill: { pet: p.pet, kind: p.kind, n: p.n, cells, fill: plan.fill, hand: plan.hand } };
    const c0 = g.caught;
    g.skillStats = g.skillStats || { hand: 0, board: 0, cells: 0, uses: 0, caught: 0 };
    if (plan.hand !== undefined) {
      g.skillStats.hand++;
      g.hand[plan.hand] = plan.to;
      if (p.kind === 'turn') ev.turn = { hand: plan.hand, to: plan.to, rot: plan.rot, flip: plan.flip, shape: plan.shape };
      // 10 级绝招：啃下来的那一格变成一块 1 格小土块，放在宠物格旁边的小位子（最多存 1 块，有了就不留）
      if (p.kind === 'gnaw' && (p.lv || 1) >= ULT_LV && !g.crumb && o.crumb !== false) { g.crumb = { id: 'crumb', cat: 0, cells: [[0, 0]], h: 1, w: 1, crumb: true }; ev.crumb = true; }
      if (!g.hand.slice(0, 3).some(Boolean)) { const keep = g.hand[3]; g.deal(); g.hand[3] = keep; } // 啃光了最后一块：发新的
    } else if (p.kind === 'fire') {
      // 小狮子：烫走小墨怪 / 墨苔怪（不留墨）/ 粘墨怪，算你抓的；头目掉 1 心、算挨了一下；6 级起头目身上留火苗（n − 1 个），每放一块再烧 1 心，头目一跳就灭
      g.skillStats.board++;
      ev.burn = [];
      let bossDone = false;
      for (const x of cells) {
        if (b[x] === CELL.MON) { clearCells(b, [x], ev, true, p.pet); ev.burn.push({ k: x, what: 'caught' }); }
        else if (b[x] === CELL.BOSS && !bossDone && g.bigHp > 0) {
          bossDone = true; bossHit(b, ev, 1, { hit: true, byPet: true }); ev.burn.push({ k: x, what: 'heart' });
          if (p.n > 1 && g.bigHp > 0) { g.boss.fire = g.boss.fireMax = p.n - 1; g.boss.fireUlt = (p.lv || 1) >= ULT_LV; (ev.bossFire = ev.bossFire || []).push({ left: g.boss.fire }); }
        }
      }
    } else {
      g.skillStats.board++;
      if (plan.fill.length) plan.fill.forEach((k) => { b[k] = 1; g.color[k] = PETS[p.pet].color; if ((p.lv || 1) >= ULT_LV) g.silkHp[k] = 2; });
      const before = cells.filter((k) => CLEARABLE(b[k]));
      clearCells(b, cells, ev, true, p.pet);
      ev.cells = before.filter((k) => b[k] === CELL.EMPTY);
      g.skillStats.cells += ev.cells.length + plan.fill.length;
      if (ev.metal) { const u = openClear(b, ev.metal, ev); if (u.length) { ev.units = u; ev.cells = ev.cells.concat(ev.openClear.cells); } } // 羽毛啄开金属：这些金属的排满了当场消
      if (plan.fill.length) {
        // 丝补满了一排 / 一个大格：照你自己消的规矩消掉（不给它攒能量，不然它能自己养自己）
        const units = []; for (let u = 0; u < 27; u++) if (core.unitFull(b, u)) units.push(u);
        if (units.length) {
          const set = new Set(); units.forEach((u) => { unitTouches(b, UNITS[u], ev); UNITS[u].forEach((k) => set.add(k)); });
          const was = [...set].filter((k) => CLEARABLE(b[k]));
          clearCells(b, [...set], ev, false);
          ev.units = units; ev.cells = ev.cells.concat(was.filter((k) => b[k] === CELL.EMPTY)); g.skillStats.silkUnits = (g.skillStats.silkUnits || 0) + units.length;
        }
      }
      if (plan.tie !== null && plan.tie !== undefined && b[plan.tie] === CELL.MON && g.mon[plan.tie]) { g.mon[plan.tie].tied = 3; ev.tied = { k: plan.tie, n: 3 }; } // 蝴蝶：缠住 3 手（已经缠着的回到 3，不叠）
    }
    g.skillCaught = (g.skillCaught || 0) + g.caught - c0; g.skillStats.caught += g.caught - c0;
    p.uses--; g.skillStats.uses++;
    if (p.uses <= 0) { g.hand[i] = null; g.skillUses++; g.petActsTotal[p.pet] = (g.petActsTotal[p.pet] || 0) + 1; }
    nextWave(b, ev);
    if (!g.playStats.firstGoal && (ev.collected.length || ev.bigHits.length)) g.playStats.firstGoal = Math.max(1, g.moves);
    g.board = b;
    ev.gained = ev.cells.length; g.score += ev.gained;
    syncAll();
    const left = core.goalLeft(g);
    if (Object.keys(left).every((k) => left[k] === 0)) { ev.win = true; g.over = true; g.won = true; g.reason = 'win'; return ev; }
    rescue(ev);
    if (g.stuck()) { g.over = true; g.reason = 'stuck'; ev.stuck = true; }
    return ev;
  }
  g.useSkill = (tg) => (g.hand[3] && !g.over ? useSkill(3, tg) : null);
  // 鼠王不会转块（段 1 规则 4：转归绿龟）

  // ---------- 墨怪的回合（每放一块之后） ----------
  const pick = (arr) => arr[Math.floor(g.rand() * arr.length)];
  const inkAt = (b, k) => { b[k] = 1; g.color[k] = -2; };
  function moveMon(b, from, to) { b[to] = 3; b[from] = 0; g.mon[to] = g.mon[from]; g.mon[from] = null; }
  // 0.9.17 墨怪是活的（Fable 新版规矩 2）：st.crawl = 每几手爬一格。爬之前一手，要去的那格先冒一对小脚印（m.step）。
  // 脚印那格被你放了块，它这一手就不动，下一轮换个方向。四面都堵死就困在原地。墨苔怪爬走时，原来那格留一块墨。
  // 0.9.20（Cc 11-27：「莫怪自己跳到一个位置会把那一格填满，那一格应该当时就炸，不要等我放下一首再炸」）：
  // 墨怪爬进去（墨苔怪留下墨）正好凑满一排 / 一竖 / 一大格，当场消掉，算你抓的
  function crawlClear(b, keys, ev) {
    const units = [];
    for (let u = 0; u < 27; u++) if (!units.includes(u) && UNITS[u].some((x) => keys.includes(x)) && core.unitFull(b, u)) units.push(u);
    if (!units.length) return;
    const set = new Set(); units.forEach((u) => { unitTouches(b, UNITS[u], ev); UNITS[u].forEach((x) => set.add(x)); });
    const was = [...set].filter((x) => CLEARABLE(b[x]));
    const c0 = ev.collected.length;
    clearCells(b, [...set], ev, false);
    const cells = was.filter((x) => b[x] === CELL.EMPTY);
    (ev.crawlClear = ev.crawlClear || []).push({ units, cells, collected: ev.collected.slice(c0) });
    if ('lines' in g.got) g.got.lines += units.length;
    charge(units.length, ev);
  }
  function crawlTurn(b, ev) {
    if (!st.crawl) return;
    const claimed = new Set();
    for (let k = 0; k < 81; k++) {
      const m = g.mon[k];
      if (b[k] !== CELL.MON || !m || m.moved === g.moves || m.held === g.moves || (m.t !== 'ink' && m.t !== 'moss')) continue;
      if (m.step !== undefined && m.step !== null) {
        const t = m.step; m.step = null; m.walk = st.crawl;
        if (b[t] === CELL.EMPTY && !claimed.has(t)) {
          moveMon(b, k, t); g.mon[t].moved = g.moves; claimed.add(t);
          if (m.t === 'moss') { inkAt(b, k); g.monStats.moss++; (ev.moss = ev.moss || []).push({ from: t, k }); }
          (ev.crawl = ev.crawl || []).push({ from: k, to: t, t: m.t }); g.monStats.crawls = (g.monStats.crawls || 0) + 1;
          crawlClear(b, [t, k], ev);
        } else (ev.crawlBlocked = ev.crawlBlocked || []).push(k);
        continue;
      }
      if (m.walk === undefined) m.walk = st.crawl;
      if (--m.walk > 0) continue;
      const opts2 = near4(k).filter((x) => b[x] === CELL.EMPTY && !claimed.has(x) && !Object.values(g.mon).some((o) => o && o.step === x));
      if (!opts2.length) { m.walk = 1; continue; }
      m.step = pick(opts2); claimed.add(m.step); (ev.footprint = ev.footprint || []).push({ from: k, to: m.step });
    }
  }
  // 0.9.20 粘墨怪 / 泥沼怪往托盘里一块上吐泥：那块多出一格（挨着原来的格子）。保底：加完一定还放得下，否则不吐；同一块只吐一次；不碰技能块
  function addMud(p, anywhere) { // anywhere：冲锋关宠物修那一下只是画面，不用管盘上放不放得下
    const has = new Set(p.cells.map(([r, c]) => r + ',' + c)), cand = [];
    p.cells.forEach(([r, c]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => { const key = (r + dr) + ',' + (c + dc); if (!has.has(key) && !cand.includes(key)) cand.push(key); }));
    for (let t = 0; t < cand.length * 2; t++) {
      const [nr, nc] = cand[Math.floor(g.rand() * cand.length)].split(',').map(Number);
      const raw = p.cells.concat([[nr, nc]]), r0 = Math.min(...raw.map((x) => x[0])), c0 = Math.min(...raw.map((x) => x[1]));
      const cells = raw.map(([a, b2]) => [a - r0, b2 - c0]), q = { id: p.id + '+', cat: Math.min(2, p.cat + 1), cells, h: Math.max(...cells.map((x) => x[0])) + 1, w: Math.max(...cells.map((x) => x[1])) + 1, gnawed: p.gnawed, blast8: p.blast8, mud: cells.length - 1 };
      if (q.h <= 5 && q.w <= 5 && (anywhere || core.anyPlacement(g.board, q))) return q;
    }
    return null;
  }
  // 段 1 规则 5（Cc 11-27「他只要一预告，我就把那块用掉不就好了吗」）：吐的那一手才挑块。
  // 从手上「还没放、还没沾过泥、不是技能块、加一格以后盘上还放得下」的块里随机挑一块；挑不出来这次不吐（ev.mudSkip）
  function spitMud(from, ev) {
    const opts = [0, 1, 2].filter((j) => g.hand[j] && !g.hand[j].special && !g.hand[j].mudded && g.hand[j].mud === undefined);
    while (opts.length) {
      const slot = opts.splice(Math.floor(g.rand() * opts.length), 1)[0];
      const q = addMud(g.hand[slot]);
      if (q) { q.mudded = true; g.hand[slot] = q; (ev.mudSpit = ev.mudSpit || []).push({ from, slot }); g.monStats.mud = (g.monStats.mud || 0) + 1; return true; }
    }
    (ev.mudSkip = ev.mudSkip || []).push({ from });
    return false;
  }
  // 每放一块，泥怪的倒数减 1（画面读 m.cd / boss.mudCd：3、2、1 越抖越快，归段 4）
  function mudCount() {
    g.mon.forEach((m) => { if (m && m.t === 'sticky' && m.held !== g.moves) m.cd--; }); // 缠住时倒数停住
    if (g.boss && g.bigHp > 0 && st.bossMud) g.boss.mudCd--;
  }
  // 结算顺序第 10 步：手空了先发新三块，再吐泥（不然每次卡着最后一块放，就永远躲得掉）
  function mudTurn(b, ev) {
    for (let k = 0; k < 81; k++) {
      const m = g.mon[k];
      if (b[k] !== CELL.MON || !m || m.t !== 'sticky' || m.cd > 0 || m.spat === g.moves) continue;
      m.spat = g.moves; spitMud(k, ev); m.cd = MON.sticky.cd;
      // 吐完爬一格（往空格）
      const opts2 = near4(k).filter((x) => b[x] === CELL.EMPTY);
      if (opts2.length) { const t = opts2[Math.floor(g.rand() * opts2.length)]; moveMon(b, k, t); g.mon[t].moved = g.moves; (ev.crawl = ev.crawl || []).push({ from: k, to: t, t: 'sticky' }); crawlClear(b, [t], ev); }
    }
    const bs = g.boss;
    if (bs && g.bigHp > 0 && st.bossMud && bs.mudCd <= 0) { spitMud(g.bigCells[0], ev); bs.mudCd = BOSS_MUD_CD; }
  }
  // 头目落到 tl（2×2 的左上角）：落脚的 4 格 + 外面一圈（最多 16 格）。11-28 Cc 定 B「周围一圈也踩」：落脚那 4 格照旧什么能清的都压掉；
  // 外面那一圈只踩碎方块（墨怪、金属、土堆不动，免得头目替你开障碍、抓怪）。平时的跳和段 3「开局先演」的那一跳共用这一个
  function bossLand(b, tl, ev) {
    const cells = [tl, tl + 1, tl + 9, tl + 10], old = g.bigCells.slice();
    old.forEach((k) => (b[k] = 0));
    const r0 = Math.floor(tl / 9), c0 = tl % 9, ring = [];
    for (let r = r0 - 1; r <= r0 + 2; r++) for (let c = c0 - 1; c <= c0 + 2; c++) { if (r < 0 || r > 8 || c < 0 || c > 8) continue; const k = r * 9 + c; if (!cells.includes(k) && b[k] === CELL.BLOCK) ring.push(k); }
    const crushed = cells.filter((k) => CLEARABLE(b[k])).concat(ring);
    clearCells(b, crushed, ev, false);
    cells.forEach((k) => { b[k] = 4; g.color[k] = 0; });
    g.bigCells = cells;
    ev.bossJump = { from: old[0], to: tl, crushed };
  }
  function monsterTurn(b, ev) {
    // 被蝴蝶的丝缠住的：这一手不爬、不吐泥、不留墨，一手掉一圈丝
    g.mon.forEach((m) => { if (m && m.tied > 0) { m.tied--; m.held = g.moves; } });
    crawlTurn(b, ev);
    mudCount();
    // 头目
    const bs = g.boss;
    if (!bs || g.bigHp <= 0) return;
    bs.count++;
    // 跳：上一手亮过的地方，这一手跳过去，落下时把落脚 4 格和周围一圈的块踩碎（11-28 Cc 定）
    if (bs.jumpTo !== null && !(bs.planMove !== undefined && g.moves <= bs.planMove)) { // 红框至少亮一手再跳
      bossLand(b, bs.jumpTo, ev);
      bs.jumpTo = null;
      if (bs.fire > 0) { bs.fire = 0; (ev.bossFire = ev.bossFire || []).push({ left: 0, out: true }); } // 头目一跳，火就灭
    }
    // 身上还有火苗：每放一块烧 1 心（段 1 规则 7，6 级起）
    if (bs.fire > 0 && bs.fireLit !== g.moves && g.bigHp > 0) { bs.fire--; bossHit(b, ev, 1, { fire: true }); (ev.bossFire = ev.bossFire || []).push({ left: bs.fire }); }
  }

  // 目标「抓光盘上的墨怪」：all = 1 表示抓光了；monLeft = 还剩几只（顶上显示这个数）
  function syncAll() { g.monLeft = g.mon.filter(Boolean).length + waveMonCount(); if ('all' in g.got) g.got.all = g.monLeft ? 0 : 1; }
  syncAll();
  g.place = (i, r, c) => {
    const p = i === 4 ? g.crumb : g.hand[i]; // 第 4 格 = 10 级鼠的小土块（放它算正常的一手）
    if (p && !g.over && p.special === 'skill') return useSkill(i, { r, c });
    if (!p || g.over || !core.canPlace(g.board, p, r, c)) return null;
    if (st.rush && !g.rushOK(i, r, c)) return null; // 0.9.21 冲锋关：只收「一放就消」的位置（小块塞进大空的一角不算，弹回去）
    const ci = i === 4 ? PETS.baozhu.color : g.handColor[i];
    const b = g.board.slice();
    const ev0 = {};
    const placed = p.cells.map(([dr, dc]) => (r + dr) * 9 + c + dc);
    placed.forEach((k) => { b[k] = 1; g.color[k] = ci; });
    if (p.mud !== undefined && placed[p.mud] !== undefined) g.color[placed[p.mud]] = -3; // 泥巴格落盘：普通块，颜色记 -3（和墨块 -2 一个路数；画法段 4）
    // 0.9.20（Cc 定 A）：爆竹鼠啃过的块上留着一个点着的小爆竹，放下去，上下左右挨着的土堆全打开（段 1 规则 2：变一格土色普通块，和这块一起检查满没满）
    if (p.gnawed) { [...new Set(placed.flatMap(p.blast8 ? near8 : near4))].filter((x) => b[x] === CELL.DIRT).forEach((x) => openCell(b, x, PETS.baozhu.color, ev0)); if (p.blast8) ev0.blast8 = true; } // 鼠王：周围 8 格（斜角也算）
    if (i === 4) g.crumb = null; else g.hand[i] = null;
    g.moves++;
    const ev = Object.assign(ev0, { piece: p, r, c, placed, units: [], cells: [], collected: [], bigHits: [], petActs: [], energy: {}, sparks: [], fire: null, gained: p.cells.length, win: false });
    // 1. 照常消
    const units = [];
    const placedSet = new Set(placed);
    for (let u = 0; u < 27; u++) if (core.unitFull(b, u) && (!st.rush || UNITS[u].some((k) => placedSet.has(k)))) units.push(u); // 冲锋关：只消你这一块塞进去的那几排 / 列 / 大格
    // 规则 1：这一手摆满了、但被障碍堵着没消的排（给段 4、6 演「满了不炸」）
    for (let u = 0; u < 27; u++) { if (!UNITS[u].some((k) => placedSet.has(k))) continue; const at = core.unitBlockedBy(b, u); if (at) (ev.blockedFull = ev.blockedFull || []).push({ u, at }); }
    const colorsBefore = g.color.slice();
    let clearedCells = [];
    if (units.length) {
      const set = new Set();
      units.forEach((u) => { unitTouches(b, UNITS[u], ev); UNITS[u].forEach((k) => set.add(k)); });
      clearedCells = [...set].filter((k) => b[k] === CELL.BLOCK || b[k] === CELL.BRICK || IS_MON(b[k]));
      clearCells(b, [...set], ev, false);
    }
    ev.units = units; ev.cells = clearedCells;
    if (ev.blast) { const ou = units.filter((u) => UNITS[u].some((k) => ev.blast.includes(k))); if (ou.length) ev.openClear = { units: ou, cells: clearedCells.filter((k) => ou.some((u) => UNITS[u].includes(k))) }; }
    if (units.length) g.got.lines = (g.got.lines || 0) + (st.rush ? 1 : units.length); // 冲锋关按「塞了几块」算 // 0.9.14：「消掉几排」的目标（第 1 关；不管带没带宠物都算）
    const ps = g.playStats; ps.units += units.length;
    if (units.length) { ps.clearMoves++; ps.dry = 0; if (!ps.firstClear) ps.firstClear = g.moves; } else { ps.dry++; ps.maxDry = Math.max(ps.maxDry, ps.dry); }
    // 2. 积蓄能量：每消一排 / 一个大格 +1。宠物格里已经有技能块时，最多攒到满。
    for (const pt of st.rush ? [] : g.team) {
      const mine = clearedCells.filter((k) => colorsBefore[k] === petDef(pt).color);
      if (mine.length) ev.sparks.push({ id: pt.id, cells: mine });
    }
    // 3. 能量满了：吐技能块到宠物格
    charge(units.length, ev);
    if (!g.playStats.firstGoal && (ev.collected.length || ev.bigHits.length)) g.playStats.firstGoal = Math.max(1, g.moves);
    nextWave(b, ev); // 这一波抓光了：下一波掉下来（刚掉下来的这一手不动）
    // 4. 墨怪的回合（过关就不动了）
    syncAll();
    let left = core.goalLeft(g);
    const done = () => Object.keys(left).every((k) => left[k] === 0);
    if (!done()) monsterTurn(b, ev);
    g.board = b;
    // 计分
    let pts = 0;
    // 0.9.18 连消照 Block Blast（声音包装方案第五节第 2 条）：隔 2 手没消不断，第 3 手还没消才归零；一手消几处就加几级。同一个数管声音、「连消 N」、盘边发光
    if (units.length) { g.streak = (g.streak || 0) + units.length; g.dryRun = 0; pts = units.length * 20 * (1 + Math.min(1.5, (units.length - 1) * 0.5)) * (1 + Math.min(1, (g.streak - 1) * 0.12)); }
    else { g.dryRun = (g.dryRun || 0) + 1; if (g.dryRun >= 3) g.streak = 0; }
    pts += ev.petActs.reduce((a, x) => a + (x.lines.length + x.boxes.length) * 10 + x.cells.length, 0);
    ev.gained += Math.round(pts);
    g.score += ev.gained;
    ev.combo = units.length; ev.streak = g.streak;
    ev.beat = !units.length && !ev.petActs.length ? 1 : ev.petActs.length >= 2 || units.length >= 3 ? 5 : ev.petActs.length || units.length >= 2 ? 4 : units.some((u) => u >= 18) ? 3 : 2;
    syncAll();
    left = core.goalLeft(g);
    if (done()) { if (st.rush) ev.rushStep = 5; ev.win = true; g.over = true; g.won = true; g.reason = 'win'; return ev; }
    if (st.rush) { g.rushChain = (g.rushChain || 0) + 1; ev.rushStep = (g.rushChain - 1) % 6; rushAfter(ev, i); return ev; } // 0.9.22 冲锋关的连消声：一块一级往上爬，第 6 块到顶扫上去，再从头来 // 冲锋关：补满、重挖，三块塞完整盘换新
    if (!g.hand.slice(0, 3).some(Boolean)) g.deal();
    mudTurn(g.board, ev);
    syncAll(); left = core.goalLeft(g);
    if (done()) { ev.win = true; g.over = true; g.won = true; g.reason = 'win'; return ev; } // 粘墨怪吐完爬进去凑满、抓到最后一只
    rescue(ev);
    if (g.stuck()) { g.over = true; g.reason = 'stuck'; ev.stuck = true; }
    return ev;
  };
  // 拖着技能块时，画面照这个亮
  g.skillLit = (pc, r, c) => { const pl = skillPlan(pc, { r, c }); return pl ? pl.cells.concat(pl.fill) : []; };
  g.skillBest = () => skillBest(g);
  // 「差一点」（0.9.4，检验报告 C10 / E3）：头目按打掉了几颗心算、抓光关按抓了几只算；门槛八成
  // 离过关还有多远：0–1（头目按心、抓光按抓了几只、其余按目标数；冲分按分数）
  g.progressFrac = () => {
    let need = 0, have = 0;
    for (const k in st.goal) {
      if (k === 'boss' && g.boss) { need += g.boss.max; have += g.boss.max - g.bigHp; continue; }
      if (k === 'all') { const tot = g.caught + (g.monLeft || 0); need += tot; have += g.caught; continue; }
      const n = st.goal[k]; need += n; have += Math.min(n, k === 'score' ? g.score : g.got[k] || 0);
    }
    return need ? have / need : 0;
  };
  g.nearMiss = () => !g.won && (() => {
    let need = 0, have = 0;
    for (const k in st.goal) {
      if (k === 'boss' && g.boss) { need += g.boss.max; have += g.boss.max - g.bigHp; continue; }
      if (k === 'all') { const tot = g.caught + (g.monLeft || 0); need += tot; have += g.caught; continue; }
      const n = st.goal[k]; need += n; have += Math.min(n, k === 'score' ? g.score : g.got[k] || 0);
    }
    return need && have / need >= 0.8;
  })();
  // ---- 段 3 规则 4（全量设计 181）：新东西第一次出场的那一关，开局先把本事放一次。st.firstAct：
  //   { kind: 'crawl', from: [r, c], to: [r, c] }（小墨怪、墨苔怪；墨苔怪原地留墨）｜{ kind: 'mud', at: [r, c] }（粘墨怪吐泥）｜{ kind: 'bossMud' }（泥沼怪吐泥）
  //   ｜{ kind: 'jump', to: [r, c] }（头目跳，落脚 2×2 的左上角）｜{ kind: 'blocked' }（只报出「摆满被堵」的地方）。行列从 0 数。
  // 只能在第 0 手调一次（调过记 g._opened，存盘里带着）。不算一手、不攒能量、不救命；不算进 monStats（假挑战只数它「自己」放的）
  // 返回的事件和 g.place 的同名（ev.crawl、ev.moss、ev.mudSpit、ev.bossJump、ev.blockedFull），另加 ev.opening = kind；没有 firstAct 返回 null
  g.openingAct = () => {
    const fa = st.firstAct; if (!fa || g._opened || g.moves || g.over) return null; g._opened = true;
    const b = g.board, ev = { opening: fa.kind, units: [], cells: [], collected: [], bigHits: [], petActs: [], energy: {}, sparks: [] };
    if (fa.kind === 'crawl') {
      const k = fa.from[0] * 9 + fa.from[1], t = fa.to[0] * 9 + fa.to[1], m = g.mon[k];
      if (m && b[t] === CELL.EMPTY) { moveMon(b, k, t); if (m.t === 'moss') { inkAt(b, k); (ev.moss = []).push({ from: t, k }); } ev.crawl = [{ from: k, to: t, t: m.t }]; m.walk = st.crawl; }
    } else if (fa.kind === 'mud') {
      const k = fa.at[0] * 9 + fa.at[1], m = g.mon[k];
      if (m && m.t === 'sticky') { spitMud(k, ev); m.cd = MON.sticky.cd; }
    } else if (fa.kind === 'bossMud') { if (g.boss) { spitMud(g.bigCells[0], ev); g.boss.mudCd = BOSS_MUD_CD; } }
    else if (fa.kind === 'jump') { if (g.boss) bossLand(b, fa.to[0] * 9 + fa.to[1], ev); }
    else if (fa.kind === 'blocked') { ev.blockedFull = []; for (let u = 0; u < 27; u++) { const at2 = core.unitBlockedBy(b, u); if (at2) ev.blockedFull.push({ u, at: at2 }); } }
    if (g.monStats.mud) g.monStats.mud--; // spitMud 记了一次：开局这一下不算
    // 演完以后手上三块要还放得下（不然重发；写死开局三块的关不动）
    if (!st.startHand && !core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean))) g.deal();
    syncAll();
    return ev;
  };
  // ---- 段 3 规则 11（R-062）：中途退出接着打。snapshot() 出一份纯文字能存的存盘（整盘、墨怪各自数到第几手、头目、手上三块的整块样子、宠物格、表盘、波次、手数、救命、发牌的随机数走到哪）；
  // 恢复用文件末尾的 restorePetGame。规则代码里用随机数的地方都是现用现读 g.rand，没有谁把它存在自己手里（不然 T365 会红）。冲锋关不存（比的是秒数）
  g.snapshot = () => {
    if (st.rush) return null;
    const out = { v: SNAP_VER, rng: g.rand.state() };
    SNAP_KEYS.forEach((k) => { if (g[k] !== undefined) out[k] = g[k]; });
    return JSON.parse(JSON.stringify(out));
  };
  g._restore = (snap) => {
    SNAP_KEYS.forEach((k) => { if (k in snap) g[k] = JSON.parse(JSON.stringify(snap[k])); });
    for (let k = 0; k < 81; k++) if (g.mon[k] === undefined) g.mon[k] = null;
    g.rand = core.rng(1, snap.rng);
  };
  g.goalLeft = () => core.goalLeft(g);
  return g;
}

// ---------- 机器人（段 1 附录 F：会开障碍、会造爆竹块、别往死格里放；加分的数都没校准，黄灯）----------
// 这只宠物开得了哪种障碍
const opensOf = (g) => { const ids = g.team.map((pt) => baseId(pt.id)); return { metal: ids.includes('tongque'), dirt: ids.includes('baozhu') }; };
const deadFor = (g, v) => { const o = opensOf(g); return (v === CELL.METAL && !o.metal) || (v === CELL.DIRT && !o.dirt); };
// 一格的排、列、大格全被开不了的障碍堵着：放进去就再也消不掉（规则 11 的「死格」）
function isDeadCell(g, b, k) {
  const r = Math.floor(k / 9), c = k % 9;
  return [r, 9 + c, 18 + core.boxOf(r, c)].every((u) => UNITS[u].some((x) => deadFor(g, b[x])));
}
// 照规则放一块（爆竹先炸开挨着的土堆，再判满），不改原盘面
function simPlace(board, p, r, c) {
  const b = board.slice(), placed = p.cells.map(([dr, dc]) => (r + dr) * 9 + c + dc);
  placed.forEach((k) => { b[k] = CELL.BLOCK; });
  const opened = p.gnawed ? [...new Set(placed.flatMap(p.blast8 ? near8 : near4))].filter((x) => b[x] === CELL.DIRT) : [];
  opened.forEach((x) => { b[x] = CELL.BLOCK; });
  const units = []; for (let u = 0; u < 27; u++) if (core.unitFull(b, u)) units.push(u);
  const set = new Set(); units.forEach((u) => UNITS[u].forEach((x) => set.add(x)));
  const cells = [...set].filter((x) => b[x] !== CELL.BOSS);
  cells.forEach((x) => { b[x] = CELL.EMPTY; });
  return { board: b, units, cells, opened, placed };
}
function bestMove(g, skill) {
  const left = core.goalLeft(g);
  const cands = [];
  const hand = g.hand.slice(0, 3).map((p, i) => ({ p, i })).concat(g.crumb ? [{ p: g.crumb, i: 4 }] : []);
  hand.forEach(({ p, i }) => {
    if (!p || p.special) return;
    for (const [r, c] of core.placements(g.board, p)) {
      const res = simPlace(g.board, p, r, c);
      const board = res.board;
      let v = res.units.length * 9 + core.evalBoard(res.board) + res.opened.length * 40; // 炸开一个土堆 +40
      // 墨怪：抓到加分；墨苔怪会留墨，值得先打
      for (const k of res.cells) {
        const m = g.board[k] === CELL.MON && g.mon[k];
        if (!m) continue;
        v += left.monster > 0 || left.all > 0 ? 14 : 0;
        if (m.t === 'moss') v += 6;
      }
      if (left.boss > 0 && res.units.some((u) => UNITS[u].some((k) => g.board[k] === CELL.BOSS))) v += 16;
      // 别往死格里放：每格 −2.5
      v -= res.placed.filter((k) => board[k] && isDeadCell(g, board, k)).length * 2.5;
      const ci = i === 4 ? PETS.baozhu.color : g.handColor[i];
      if (g.team.some((pt) => PETS[pt.id].color === ci)) v += res.cells.length ? 2 : 0;
      cands.push({ i, r, c, v, board });
    }
  });
  if (!cands.length) return null;
  cands.sort((a, b) => b.v - a.v);
  const top = cands.slice(0, 10);
  for (const m of top) {
    const rest = g.hand.filter((p, k) => p && !p.special && k !== m.i && k < 3);
    if (rest.length && !core.solvable(m.board, rest)) m.v -= 100;
  }
  top.sort((a, b) => b.v - a.v);
  const s = skill === undefined ? 1 : skill;
  if (s >= 1 || g.rand() < s) return top[0];
  return top[Math.min(top.length - 1, 1 + Math.floor(g.rand() * 4))];
}
function simulate(opts) {
  const o = Object.assign({ skill: 1, secPerMove: () => 3 }, opts);
  const g = createPetGame(o);
  if (o.openMode) g.openMode = o.openMode; // 'asap' 见了就开（默认）/ 'fill' 先补满再开（段 3 量两种打法差几手）
  g.openingAct(); // 段 3 规则 4：开局先演一次（没写 firstAct 的关什么都不做）
  let guard = 0;
  while (!g.over && guard++ < 400) {
    if (useSkillIfGood(g)) continue;
    const m = bestMove(g, o.skill);
    if (!m) { if (g.hand[3]) { const s = skillBest(g); if (s && g.useSkill(s)) continue; } break; }
    g.elapsed += o.secPerMove(g);
    g.place(m.i, m.r, m.c);
  }
  return g;
}

// 机器人用技能块：把每一种用法都试一遍，挑最值的。v ≥ 100 = 至少办成一件正经事（抓到墨怪 / 咬到头目 / 让本来放不下的块放得下）。
function skillBest(g) {
  const p = g.hand[3];
  if (!p) return null;
  const left = core.goalLeft(g), wantMon = left.monster > 0 || left.all > 0, b = g.board;
  const fitsNow = [0, 1, 2].some((i) => g.hand[i] && core.anyPlacement(b, g.hand[i]));
  const hands = [0, 1, 2].map((i) => g.hand[i]).filter(Boolean);
  let best = null; const seen = new Set();
  const offer = (tg, v) => { if (!best || v > best.v) best = Object.assign({ v }, tg); };
  const scoreHit = (cells, nb) => { // 技能块碰到的格子值多少；顺手把「打完以后的盘面」写进 nb
    let v = 0; const opened = [];
    for (const x of cells) { if (b[x] === CELL.BLOCK) { v += g.color[x] === -2 ? 2 : 0.5; nb[x] = 0; } else if (b[x] === CELL.METAL) { nb[x] = CELL.BLOCK; opened.push(x); } }
    // 附录 F：啄开金属 100 分（先补满再开：只在当场满了才给）；当场满了每处再 +80、排里每只怪 +60
    const full = []; for (let u = 0; u < 27; u++) if (UNITS[u].some((x) => opened.includes(x)) && core.unitFull(nb, u)) full.push(u);
    if (opened.length) v += (g.openMode === 'fill' && !full.length ? 5 : 100) + full.length * 80 + full.reduce((a, u) => a + UNITS[u].filter((x) => b[x] === CELL.MON).length * 60, 0);
    return v;
  };
  const unstick = (nb, hs) => (!fitsNow && (hs || hands).some((h) => core.anyPlacement(nb, h)) ? 1000 : 0);
  if (p.kind === 'peck') {
    for (let k = 0; k < 81; k++) for (const dir of (p.lv || 1) >= EVO_LV && (p.lv || 1) < ULT_LV ? ['h', 'v'] : ['h']) {
      const tg = { r: Math.floor(k / 9), c: k % 9, dir };
      const pl = g.skillPlan(tg);
      if (!pl) continue;
      const key = pl.cells.join(','); if (seen.has(key)) continue; seen.add(key);
      const nb = b.slice(); const v = scoreHit(pl.cells, nb);
      offer(tg, v + unstick(nb) + (fitsNow ? 0 : core.evalBoard(nb) * 0.01));
    }
  }
  if (p.kind === 'silk') {
    for (let k = 0; k < 81; k++) {
      const pl = g.skillPlan({ r: Math.floor(k / 9), c: k % 9 });
      if (!pl) continue;
      const nb = b.slice(); let v = scoreHit(pl.cells, nb);
      pl.fill.forEach((x) => (nb[x] = 1));
      const units = []; for (let u = 0; u < 27; u++) if (core.unitFull(nb, u)) units.push(u);
      const set = new Set(); units.forEach((u) => UNITS[u].forEach((x) => set.add(x)));
      for (const x of set) {
        if (nb[x] === CELL.MON && g.mon[x]) { v += wantMon ? 100 : 10; nb[x] = 0; }
        else if (nb[x] === CELL.BLOCK) nb[x] = 0;
        else if (nb[x] === CELL.BOSS && left.boss > 0) v += 100;
      }
      v += units.length * 30 - (units.length ? 0 : pl.fill.length * 3); // 补了没消掉：白占地方
      offer({ r: Math.floor(k / 9), c: k % 9 }, v + unstick(nb));
    }
  }
  if (p.kind === 'fire') {
    // 狮：烫「最难抓的那只」（它的排、列、大格里最空的）；头目关优先烫头目
    const empt = (k) => { const r = Math.floor(k / 9), c = k % 9; return [r, 9 + c, 18 + core.boxOf(r, c)].reduce((a, u) => a + UNITS[u].filter((x) => !b[x]).length, 0); };
    for (let k = 0; k < 81; k++) for (const dir of (p.lv || 1) >= EVO_LV ? ['u', 'd', 'l', 'r'] : [null]) {
      const tg = { r: Math.floor(k / 9), c: k % 9, dir }; const pl = g.skillPlan(tg); if (!pl) continue;
      let v = 0; for (const x of pl.cells) v += b[x] === CELL.BOSS ? (left.boss > 0 ? 150 : 0) : (wantMon ? 100 : 20) + empt(x);
      offer(tg, v);
    }
  }
  if (p.kind === 'turn') {
    // 龟：手上有放不下的块、转了就放得下 → 1000；转了能多消一处 → 100
    const most = (q) => { let m = 0; for (const [r, c] of core.placements(b, q)) m = Math.max(m, simPlace(b, q, r, c).units.length); return m; };
    [0, 1, 2].forEach((i) => {
      const h = g.hand[i]; if (!h) return;
      const fit0 = core.anyPlacement(b, h), m0 = fit0 ? most(h) : 0;
      for (const tg of [{ rot: 1 }, { rot: 2 }, { rot: 3 }, { rot: 0, flip: true }, { rot: 1, flip: true }, { rot: 2, flip: true }, { rot: 3, flip: true }, { shape: 0 }, { shape: 1 }, { shape: 2 }]) {
        const pl = g.skillPlan(Object.assign({ hand: i }, tg)); if (!pl) continue;
        const fit1 = core.anyPlacement(b, pl.to);
        const v = !fit0 && fit1 ? (fitsNow ? 40 : 1000) : fit1 && most(pl.to) > m0 ? 100 : 0;
        if (v > 0 || !fitsNow) offer(Object.assign({ hand: i }, tg), v || 1); // 三块都放不下：转一下也算一种走法（转完还放不下就照常判输）
      }
    });
  }
  if (p.kind === 'gnaw') {
    // 附录 F 造爆竹块：盘上有土堆、手上没有带爆竹的块时，啃一口，要求啃完有一个贴着土堆的放法
    const dirt = b.some((v) => v === CELL.DIRT) && !hands.some((h) => h.gnawed);
    const nearDirt = (q) => core.placements(b, q).some(([r, c]) => q.cells.some(([dr, dc]) => (q.blast8 ? near8 : near4)((r + dr) * 9 + c + dc).some((x) => b[x] === CELL.DIRT)));
    // 啃手上的块：① 它本来放不下，啃一口就放得下；② 啃一口以后正好能消掉一排带墨怪的（原来那块办不到）
    const catchOf = (q) => { let m = 0; for (const [r, c] of core.placements(b, q)) { const res = core.placeAndClear(b, q, r, c); if (!res.units.length) continue; let n = 0; for (const x of res.cells) if (b[x] === CELL.MON) n++; for (const u of res.units) if (UNITS[u].some((x) => b[x] === CELL.BOSS && left.boss > 0)) n++; if (n + res.units.length * 0.1 > m) m = n + res.units.length * 0.1; } return m; };
    [0, 1, 2].forEach((i) => {
      const h = g.hand[i]; if (!h) return;
      const fit0 = core.anyPlacement(b, h), c0 = fit0 ? catchOf(h) : 0;
      h.cells.forEach((_, j) => {
        const pl = g.skillPlan({ hand: i, cell: j }); if (!pl) return; const q = pl.to; // 照规则能不能啃（一块一口、最后一格不啃）
        let v = 0;
        if (!q) v = fitsNow ? 0 : 20; // 整块吃掉
        else { const fit1 = core.anyPlacement(b, q); if (!fit0 && fit1) v = fitsNow ? 40 : 1000; else if (!fit0) v = fitsNow ? 0 : 10 - q.cells.length; if (fit1 && (wantMon || left.boss > 0)) { const c1 = catchOf(q); if (c1 >= 1 && c1 > c0 + 0.5) v += 100 + (c1 - c0) * 10; } }
        if (dirt && q && nearDirt(q)) v = Math.max(v, 100 + q.cells.length);
        if (v > 0) offer({ hand: i, cell: j }, v);
      });
    });
  }
  return best;
}
// 段 3 附录 D：机器人补的两手（量数用；分数没校准，黄灯）
// 这块放下去最多能抓几只（打到头目算 1）
function catchOf(g, bd, q) { let m = 0; for (const [r, c] of core.placements(bd, q)) { const res = core.placeAndClear(bd, q, r, c); if (!res.units.length) continue; let n = 0; for (const x of res.cells) if (bd[x] === CELL.MON) n++; if (g.boss && g.bigHp > 0) for (const u of res.units) if (UNITS[u].some((x) => bd[x] === CELL.BOSS)) n++; if (n > m) m = n; } return m; }
// ① 蚕宝宝：补满任何一排都算正经事（原来要那一排上有怪才补）
// ② 小铜雀「卡口」：现在手上哪块都抓不到；啄掉怪那一排 / 列 / 大格里的一格以后，有一块放进去抓得到 → 啄（原来只在开金属和堵死时才用羽毛）
function smartSkill(g) {
  const base = skillBest(g), p = g.hand[3];
  if (!p) return base;
  if (p.kind === 'silk') return base && base.v >= 30 && base.v < 100 ? Object.assign({}, base, { v: 100 }) : base;
  if (p.kind !== 'peck' || (base && base.v >= 100)) return base;
  const b = g.board, hands = [0, 1, 2].map((i) => g.hand[i]).filter(Boolean);
  if (!hands.length || Math.max(0, ...hands.map((h) => catchOf(g, b, h))) >= 1) return base;
  const hot = new Set(); for (let u = 0; u < 27; u++) if (UNITS[u].some((x) => b[x] === CELL.MON || b[x] === CELL.BOSS)) UNITS[u].forEach((x) => { if (b[x] === CELL.BLOCK) hot.add(x); });
  let best = base; const seen = new Set();
  for (const k of hot) for (const dir of (p.lv || 1) >= EVO_LV && (p.lv || 1) < ULT_LV ? ['h', 'v'] : ['h']) {
    const tg = { r: Math.floor(k / 9), c: k % 9, dir }, pl = g.skillPlan(tg); if (!pl) continue;
    const key = pl.cells.join(','); if (seen.has(key)) continue; seen.add(key);
    const nb = b.slice(); pl.cells.forEach((x) => { if (nb[x] === CELL.BLOCK) nb[x] = 0; });
    const c1 = Math.max(0, ...hands.map((h) => catchOf(g, nb, h)));
    if (c1 >= 1) { const v = 100 + c1 * 10 - pl.cells.length; if (!best || v > best.v) best = Object.assign({ v }, tg); }
  }
  return best;
}
// 有正经事可办就用；三块都放不下，也用（腾地方）
function useSkillIfGood(g) {
  if (!g.hand[3] || g.over) return false;
  const s = smartSkill(g);
  if (!s) return false;
  const fits = [0, 1, 2].some((i) => g.hand[i] && core.anyPlacement(g.board, g.hand[i]));
  if (s.v >= 100 || !fits) return !!g.useSkill(s);
  return false;
}
// 从存盘接着打：opts 和开这一局时一样（stage、team、seed）。存盘坏了 / 版本对不上 / 盘面尺寸不对 → null（调的地方丢掉存盘、从头开）
function restorePetGame(opts, snap) {
  if (!snap || typeof snap !== 'object' || snap.v !== SNAP_VER || typeof snap.rng !== 'number' || !SNAP_NEED.every((k) => k in snap)) return null;
  if (!Array.isArray(snap.board) || snap.board.length !== 81 || !Array.isArray(snap.hand) || !Array.isArray(snap.mon) || snap.mon.length !== 81) return null;
  if (opts && opts.stage && opts.stage.rush) return null;
  const g = createPetGame(opts); g._restore(snap); return g;
}
module.exports = { helperFor, restorePetGame, SNAP_VER, smartSkill, fastFor, peckDir, skillPieceOf: (pt) => skillPiece(pt), waveTotalOf, petGain, BASE_OF, SKILL, EVO_LV, ULT_LV, baseId, ringOf, skillKind, skillN, gnawPiece, pickPiece, bestPetFor, skillBest, useSkillIfGood, PETS, SKILL_PIECE, IS_MON, MON, createPetGame, bestMove, simulate, energyMax };
