// 0.9.12：换成 Fable「宠物技能重做」的规则（报告 ../九宫消_宠物技能重做_20261125.md；副本 test/fable_skills/petgame_s.js）。
// 四种本事：铜雀啄（盘上一排最近的 N 样）、爆竹鼠啃（手上的块 1 格 / 盘上的怪和铁石）、墨斗蚕吐丝（补空格）、火麒麟照亮下一批 + 火星。1 级只动 1–2 格；攒能量只算「消一排 +1」。
// 0.9.8：合进 Fable 的「宠物系统重做 · 不限手数版」（报告：../九宫消_宠物系统重做_20261125.md 第十三节；副本 test/fable_counter/petgame_counter.js），再补回 0.9.6 记录器要的统计。
// 和原版的四处不同：
//   ① 宠物不再自己出手。能量满了，它吐一块「技能块」到托盘的第 4 格（宠物格，g.hand[3]），你自己拖到盘上，放哪打哪；存着不用也行（最多存一块）。
//      技能块只打它周围一小片（3–13 格），放下去不算一手、墨怪不动。四只宠物四种形状：铜雀横着啄、火麒麟竖着烧、爆竹鼠炸一圈、墨斗蚕斜着缠。
//   ② 克制：每种墨怪只有对口的宠物的技能块抓得走（不管几层甲、什么颜色、不分身）；不对口的打不动它，只清得掉旁边的方块。小墨怪谁都抓得走。你自己消，规矩不变。
//   ③ 所有宠物一个攒法：每消掉一排 / 一个大格攒一格；消掉它颜色的方块每 3 块多攒一格。
//   ④ 没有手数上限（Cc 11-25 否了）。一关的墨怪分几波冒出来（stage.waves），盘面不清空；输法只有「三块都放不下」。
//   ⑤ 救命并在宠物身上：堵死时能量条里有东西，它就提前把技能块给你。
// 上一版（宠物自己出手 + 克制）留在 v1_auto/。
// 九宫消 + 宠物（0.6）的规则层。设计见 ../九宫消加宠物_设计与调研_20261124.md、检验和改法见 ../九宫消_玩法检验与关卡对照_20261125.md。
// 拖块、凑满一排或一个大格就消，这个不变。多出来的：
//   ① 方块的颜色有用了：带谁出战，就多发谁颜色的方块；消掉谁的颜色，就给谁多充能。
//   ② 宠物脚下一条能量，攒满了它自己出手（啄 / 啃 / 吐丝补满），或者吐一颗火球给你亲手放。没地方下手就先憋着，不空放。
//   ③ 墨怪（0.7 起一大家子，图鉴见 ../九宫消_墨怪与头目图鉴_20261124.md）：盘面上都记成 3，种类、甲、颜色、倒数记在 g.mon[k]。
//      小墨怪、甲壳怪（几层甲，每消一次掉一层）、跳跳怪、馋嘴怪（啃你的块）、挑色怪（那排里要有它的颜色）、墨苔怪（长墨块）、
//      炸弹怪（倒数到 0 溅墨）、分身怪（打一下分成两只小墨怪）。宠物碰一下伤害加倍、不挑颜色、不让它分身。
//      头目占 2×2，头上几颗心，半血跳走：大墨怪（吐墨）、大馋嘴（啃块）、分身王（挨一下蹦一只小墨怪）。抓到的收进葫芦，局外炼丹喂宠物。
//   ④ 铁石（只有宠物打得碎，有的两层）、机关匣、宝石、泡泡；进化关：用宠物的颜色把正中间的大格一格格点亮。
const C = require('./config.js');
const core = require('./core.js');
const { UNITS } = core;

// 盘面的值：0 空 1 块 2 机关匣 3 墨怪（各种，见 g.mon）4 头目 5 铁石
// 颜色 = C.blockColors 的序号：0 黄铜金 1 朱砂红 2 青铜绿 3 青金蓝 4 紫晶 5 赤铜 6 水银青；-1 旧铁灰（预放的块）；-2 墨块（大墨怪吐的）
const COLOR_NAME = ['金色', '红色', '绿色', '蓝色', '紫色', '橙色', '青色'];
const IS_MON = (v) => v === 3;
// 墨怪的种类。cd = 隔几手动一次手；hp = 甲壳怪的甲有几层
const MON = {
  ink: { name: '小墨怪' }, shell: { name: '甲壳怪' }, jump: { name: '跳跳怪' }, eat: { name: '馋嘴怪', cd: 3 },
  color: { name: '挑色怪' }, moss: { name: '墨苔怪', cd: 3 }, bomb: { name: '炸弹怪', cd: 9 }, split: { name: '分身怪' },
  sticky: { name: '粘墨怪', cd: 4 }, // 0.9.20 第二章：每 4 手往托盘里一块上吐泥（先瞪一手），那块多一格；吐完爬一格
};
const MON_CHAR = { m: 'ink', A: 'shell', B: 'shell', C: 'shell', J: 'jump', E: 'eat', G: 'moss', T: 'bomb', S: 'split', N: 'sticky' };
const cdOf = (t) => (RULES.pester[t] || MON[t].cd || 0);
const newMon = (t, extra) => Object.assign({ t, hp: 0, col: -1, cd: cdOf(t), tgt: null }, extra || {});
const near8 = (k) => { const r = Math.floor(k / 9), c = k % 9, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const a = r + dr, b = c + dc; if (a >= 0 && a < 9 && b >= 0 && b < 9) out.push(a * 9 + b); } return out; };
const EATABLE = (v) => v === 1 || IS_MON(v);

// 宠物：能量满了吐一块技能块。tier（技能块大小）：1–2 级小、3–4 级中、5 级起（进化后）大。energy(lv)：攒满要几格。
// kind = 克制表里它算哪一路（row 啄 / box 炸 / fill 缠 / gift 烧）；shape = 技能块打哪几格（h 横条 / v 竖条 / sq 一圈 / x 斜叉）
const tierOf = (lv) => (lv >= 5 ? 3 : lv >= 3 ? 2 : 1);
// 【技能重做】四种本事：peck 啄（盘上，横着一排里最近的 N 样东西）｜gnaw 啃（N 口，每口 1 格：手上的块或者盘上）｜silk 吐丝（补上这一排里最近的 N 个空格）｜fire 喷火（烧 1 格，顺着同一种颜色蹿，一共 N 格）
// swap（实验）：把手上的一块换掉，从 N 块里挑一块。
const at = (arr, lv) => arr[Math.min(arr.length, Math.max(1, lv)) - 1];
const SKILL = {
  // 每只宠物每一级（1–9 级；5 级 = 进化）：n 打几格（啃 = 几口）｜energy 攒满要几格｜start 开局带几格能量
  n: { tongque: [2, 3, 3, 3, 4, 4, 5, 5, 6], baozhu: [1, 1, 1, 1, 2, 2, 2, 3, 3], modou: [1, 1, 1, 1, 2, 2, 2, 3, 3], qilin: [1, 1, 1, 1, 2, 2, 2, 2, 3] },
  energy: { tongque: [6, 6, 6, 5, 4, 4, 4, 3, 3], baozhu: [7, 7, 6, 6, 5, 5, 4, 4, 3], modou: [7, 7, 6, 6, 5, 5, 4, 4, 3], qilin: [6, 6, 6, 5, 4, 4, 4, 3, 3] },
  start: { tongque: [0, 0, 2, 2, 2, 3, 3, 3, 3], baozhu: [0, 2, 2, 3, 3, 4, 4, 4, 4], modou: [0, 2, 2, 3, 3, 4, 4, 4, 4], qilin: [0, 2, 2, 2, 2, 3, 3, 3, 3] },
  look: { qilin: [1, 1, 2, 2, 2, 2, 3, 3, 3] }, // 火麒麟「照亮」：一直看得见下一批的头几块
  kind: { tongque: 'peck', baozhu: 'gnaw', modou: 'silk', qilin: 'fire' },
  uses: { tongque: [1, 1, 1, 1, 1, 1, 1, 1, 1] }, // 一块技能块能用几次（啃不看这个，它按口数算）
  intro: 1, // 登场关（fastCharge）：开局的能量只差几格就满（第一次消就出技能块，教完就照平常攒）
};
const baseId = (id) => (id === 'jinchique' ? 'tongque' : id === 'baozhuwang' ? 'baozhu' : id);
const skillKind = (id) => SKILL.kind[baseId(id)];
const skillN = (id, lv) => at(SKILL.n[baseId(id)], lv);
const lookOf = (id, lv) => (SKILL.look[baseId(id)] ? at(SKILL.look[baseId(id)], lv) : 0);
const startOf = (id, lv) => at(SKILL.start[baseId(id)], lv);
const PETS = {
  tongque: { name: '铜雀', color: 0, charge: 'clear', act: 'gift', kind: 'row', shape: 'h', energy: (lv) => at(SKILL.energy.tongque, lv), power: tierOf, evo: 'jinchique', evoLv: 5 },
  jinchique: { name: '金翅雀', color: 0, charge: 'clear', act: 'gift', kind: 'row', shape: 'h', energy: (lv) => at(SKILL.energy.tongque, lv), power: () => 3 },
  baozhu: { name: '爆竹鼠', color: 1, charge: 'clear', act: 'gift', kind: 'box', shape: 'sq', energy: (lv) => at(SKILL.energy.baozhu, lv), power: tierOf, evo: 'baozhuwang', evoLv: 5 },
  baozhuwang: { name: '爆竹鼠王', color: 1, charge: 'clear', act: 'gift', kind: 'box', shape: 'sq', energy: (lv) => at(SKILL.energy.baozhu, lv), power: () => 3 }, // 0.9.20 5 级进化：会转（把托盘里一块转四分之一圈）
  modou: { name: '墨斗蚕', color: 2, charge: 'clear', act: 'gift', kind: 'fill', shape: 'x', energy: (lv) => at(SKILL.energy.modou, lv), power: tierOf, evoLv: 5 },
  qilin: { name: '火麒麟', color: 5, charge: 'clear', act: 'gift', kind: 'gift', shape: 'v', energy: (lv) => at(SKILL.energy.qilin, lv), power: tierOf, evoLv: 5 },
};
// 技能块放在 (r, c)，打到哪几格（含它自己那格）
function skillCells(shape, tier, r, c) {
  const out = [[0, 0]];
  const n = tier; // 伸出去几格（横条、竖条多伸一格：5 / 7 / 9 格；一圈和斜叉：5 / 9 / 13 格）
  if (shape === 'h') for (let d = 1; d <= n + 1; d++) out.push([0, -d], [0, d]);
  else if (shape === 'v') for (let d = 1; d <= n + 1; d++) out.push([-d, 0], [d, 0]);
  else if (shape === 'x') for (let d = 1; d <= n; d++) out.push([-d, -d], [-d, d], [d, -d], [d, d]);
  else if (shape === 'sq') {
    out.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    if (tier >= 2) out.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (tier >= 3) out.push([-2, 0], [2, 0], [0, -2], [0, 2]);
  }
  return out.map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && a < 9 && b >= 0 && b < 9).map(([a, b]) => a * 9 + b);
}
const SKILL_VERB = { h: '横着啄', v: '竖着烧', sq: '炸', x: '斜着缠' };
// 每只宠物这一级的本事（一行字；0.9.12 照 Fable 技能重做第七节第 15 条的底稿，等和 Cc 逐字定）
function petDesc(id, lv) {
  lv = lv || 1;
  const k = skillKind(id), n = skillN(id, lv), e = PETS[id].energy(lv);
  if (k === 'peck') return '啄：啄掉这一排最近的 ' + n + ' 格 · 消 ' + e + ' 排出一块';
  if (k === 'gnaw') return '啃：啃掉手上的块 ' + n + ' 格（也啃墨怪、铁石）· 消 ' + e + ' 排出一块';
  if (k === 'silk') return '吐丝：补 ' + n + ' 个空格，缠走挨着的怪 · 消 ' + e + ' 排出一块';
  if (k === 'fire') return '照亮下一批 ' + lookOf(id, lv) + ' 块 · 火星烧 ' + n + ' 格 · 消 ' + e + ' 排出一颗';
  return '';
}
// 升一级多了什么（一句话；升级那一下、营地卡片上写）：「啄 2 格 → 3 格」「消 6 排 → 5 排出一块」「开局带 2 格能量」
function petGain(id, lv) {
  const k = skillKind(id), out = [];
  const n0 = skillN(id, lv), n1 = skillN(id, lv + 1), e0 = PETS[id].energy(lv), e1 = PETS[id].energy(lv + 1), s0 = startOf(id, lv), s1 = startOf(id, lv + 1), l0 = lookOf(id, lv), l1 = lookOf(id, lv + 1);
  const verb = { peck: '啄', gnaw: '啃', silk: '补', fire: '火星烧' }[k] || '';
  if (n1 > n0) out.push(verb + ' ' + n0 + ' 格 → ' + n1 + ' 格');
  if (e1 < e0) out.push('消 ' + e0 + ' 排 → ' + e1 + ' 排出一块');
  if (s1 > s0) out.push('开局带 ' + s1 + ' 格能量');
  if (l1 > l0) out.push('照亮 ' + l0 + ' 块 → ' + l1 + ' 块');
  return out.join('，');
}
const CHARGE_TAG = { clear: '消一排 +1', place: '消一排 +1' };
const CHARGE_TEXT = { clear: '每消掉一排，攒一格能量', place: '每放一块，攒一格能量' };
// ---------- 克制（Cc 11-25 定 A：「带对的宠物」要真的要紧）----------
// 每种墨怪只怕一只宠物；小墨怪谁都怕。对口的技能块一下抓走（不管几层甲、什么颜色、不分身、跳不掉）；
// 不对口的打不动它（它缩一下躲过去），只清得掉它身边的方块。你自己消，规矩和原来一样。
//   row 铜雀 / 金翅雀  box 爆竹鼠  fill 墨斗蚕  gift 火麒麟
const RULES = {
  nemesis: { shell: 'row', eat: 'fill', jump: 'box', split: 'box', moss: 'fill', bomb: 'gift' }, // 挑色怪：和它同色的宠物
  bossWeak: { spit: null, eat: 'fill', split: 'box' }, // 头目怕谁（null = 谁咬都掉 1 颗心）
  bossWeakDmg: 3,    // 对口的宠物咬头目一口掉几颗心
  bossOtherDmg: 1,   // 别的宠物咬一口掉几颗心（和原来一样）
  pester: {}, // 0.9.17：墨怪偷宠物能量砍掉（Cc 11-27 第 9 件定 A 全砍）。原来：{ shell: 3, jump: 3, color: 3, split: 3 } // 这几种墨怪活着的时候，每隔几手冲宠物喷一口墨：偷走 steal 格能量（先瞪宠物一手；它的克星不怕）。墨苔怪长墨时、馋嘴怪啃块时也偷。
  steal: 0,          // 墨怪对宠物使坏：馋嘴怪 / 大馋嘴每啃一口，偷走宠物几格能量（它的克星墨斗蚕不怕）
  bombDrain: false,   // 炸弹怪炸开时，把宠物的能量炸光（它的克星火麒麟不怕）
  rescue: 'any',     // 救命：三块都放不下、宠物格空着时，宠物提前把技能块给你、能量清空。'any' = 能量条里有一格就救；'half' = 攒到一半以上才救
  startEnergy: null,
  handMode: 'gnaw', swapN: 1, // 【实验】啃的技能块拖到手上的块上：'gnaw' 啃掉一格｜'swap' 换一块（从 swapN 块里挑）｜'none' 不能用在手上
  gnawBlocks: false, // 啃：盘上啃不啃普通方块（false = 盘上只啃墨怪、铁石、头目；方块要啃就啃手上的）
  colorPer: 0,  // 消掉它颜色的方块，每几块多攒一格（0 = 不算颜色，只算「消一排 +1」）
  rescueMin: 1, // 救命：能量条里至少有几格，宠物才提前给技能块
  previewPlan: 0, // 【实验】会用预览的机器人：看得见的块放下去能消几排，每排加几分
  preview: 0,   // 【实验】一直看得见下一批的头几块（0 = 不看）
  refill: false, // 【实验】用掉一块马上补一块 // 【难度实验】几级的宠物开局带几格能量
  rockNemesis: 'box', rockDmg: 2, // 爆竹鼠一口啃穿两层铁石，别的宠物一次一层
};
// 这只宠物（pet = { act, color }）是不是这只墨怪的克星
function isCounter(m, pet) {
  if (!m || !pet) return false;
  if (m.t === 'ink') return true;
  if (m.t === 'color') return pet.color === m.col;
  return RULES.nemesis[m.t] === pet.act;
}
const petOf = (id) => ({ act: PETS[id].kind, color: PETS[id].color, id });
// 这一关带谁最顺：数一数盘上的东西各怕谁（给关卡表的 best、章页「带它最顺」「先练谁」用）
function bestPetFor(st) {
  const sc = { row: 0, box: 0, fill: 0, gift: 0 }, colSc = {};
  st.board.forEach((row) => row.split('').forEach((ch) => {
    const t = MON_CHAR[ch];
    if (t && t !== 'ink') { const a = RULES.nemesis[t]; sc[a] += t === 'shell' ? (ch === 'A' ? 1 : ch === 'B' ? 2 : 3) : 2; }
    else if (ch >= '0' && ch <= '6') colSc[+ch] = (colSc[+ch] || 0) + 2;
    else if (ch === 'R') sc[RULES.rockNemesis] += 1; else if (ch === 'Q') sc[RULES.rockNemesis] += 2;
    else if (ch === 'M') sc.fill += 2;
    else if (ch === 'Z') sc.row += 2;
    else if (ch === 'D') sc.box += 2;
  }));
  if (st.goal.boss) { const a = RULES.bossWeak[st.bossKind || 'spit']; if (a) sc[a] += 10; }
  const ids = ['tongque', 'baozhu', 'modou', 'qilin'];
  const score = (id) => sc[PETS[id].kind] + (colSc[PETS[id].color] || 0);
  const out = ids.map((id) => ({ id, n: score(id) })).sort((x, y) => y.n - x.n);
  return out[0].n > 0 ? out : [];
}
const FIRE = { id: 'skill', cat: 0, cells: [[0, 0]], h: 1, w: 1, special: 'skill' }; // 名字留着给 main.js；现在每只宠物的技能块都是这个模子
const skillPiece = (pt) => { const kind = skillKind(pt.id), n = skillN(pt.id, pt.lv); return Object.assign({}, FIRE, { pet: pt.id, tier: PETS[pt.id].power(pt.lv), kind, n, uses: kind === 'gnaw' ? n : SKILL.uses[baseId(pt.id)] ? at(SKILL.uses[baseId(pt.id)], pt.lv) : 1 }); };
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
  return { id: p.id + '~', cat: p.cat, cells, h: Math.max(...cells.map((x) => x[0])) + 1, w: Math.max(...cells.map((x) => x[1])) + 1, gnawed: (p.gnawed || 0) + 1, mud };
}
const near4 = (k) => { const r = Math.floor(k / 9), c = k % 9, out = []; if (r > 0) out.push(k - 9); if (r < 8) out.push(k + 9); if (c > 0) out.push(k - 1); if (c < 8) out.push(k + 1); return out; };
const OCC = (v) => v === 1 || v === 3 || v === 4 || v === 5 || v === 6; // 技能块打得到的东西：方块、墨怪、头目、铁石、金属
// 0.9.17 五行东西（第一章：金属，盘面值 6）：占一格、算填了，凑满那一排别的都消、它还在；只有同色的宠物（铜雀）啄得掉
const PECKABLE = (v) => v === 1 || v === 5 || v === 6; // 铜雀啄得到的：方块（含墨块）、铁石、金属。墨怪、头目啄不到（Cc 11-27 第 4 件：除了火麒麟，宠物不抓怪、不打头目）
const petDef = (p) => PETS[p.id];
function energyMax(g, p) {
  return petDef(p).energy(p.lv);
}
const crossCells = (r, c) => [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && a < 9 && b >= 0 && b < 9).map(([a, b]) => a * 9 + b);
const boxOfK = (k) => core.boxOf(Math.floor(k / 9), k % 9);
// 这一关一共几波：开局盘上那一波 + 后面一波一波冒出来的（关卡卡片、宠物园、关里顶上的圆点都用这一个数）
const waveTotalOf = (st) => 1 + ((st && st.waves) || []).length;

// opts: { stage, team:[{id,lv}], seed, tutorial }
function createPetGame(opts) {
  const o = opts || {};
  const st = o.stage;
  const g = core.createGame({ stage: st, seed: o.seed, tutorial: o.tutorial });
  Object.assign(g, {
    pets: true,
    color: new Array(81).fill(0),
    rockHp: new Array(81).fill(0),
    handColor: [0, 0, 0, 0],
    team: (st.team || o.team || []).map((p) => ({ id: p.id, lv: p.lv || 1, energy: RULES.startEnergy ? RULES.startEnergy(p.lv || 1) : st.fastCharge ? Math.max(startOf(p.id, p.lv || 1), PETS[p.id].energy(p.lv || 1) - SKILL.intro) : startOf(p.id, p.lv || 1) })),
    bigHp: 0, bigCells: [], boss: null, skillUses: 0,
    jumpPlan: {}, // 跳跳怪：下一手要跳到哪（先探头）
    mon: new Array(81).fill(null), // 墨怪的种类和状态
    spawnQ: [], // 分身怪 / 分身王：这一手打完以后要蹦出来的小墨怪（从哪格旁边）
    monStats: { cracks: 0, eats: 0, moss: 0, bombs: 0, spawns: 0, colorMiss: 0 }, // 这一关墨怪干了几回（测试和以后的统计用）
    playStats: { clearMoves: 0, dry: 0, maxDry: 0, bossByPlayer: 0, bossByPet: 0, units: 0, firstClear: 0, firstGoal: 0, goalsByPet: 0, goalsByPlayer: 0 }, // 0.9.6 记录器：第几手第一次消 / 第一次碰到目标、目标谁完成的； // 手感统计：几手有消、最长几手没消、头目的心谁打掉的
    evLit: new Set(), evColor: st.evolve ? PETS[st.evolve.pet].color : null,
    caught: 0, petActsTotal: {},
  });
  // 盘面字符：m 小墨怪；A/B/C 甲壳怪 1/2/3 层；J 跳跳怪；E 馋嘴怪；G 墨苔怪；T 炸弹怪；S 分身怪；0–6 挑色怪（那种颜色）；
  //           K 头目（2×2）；R 铁石；Q 两层铁石
  // 把一个字符摆到盘上的第 k 格（墨怪 / 铁石）；摆了返回 true
  function putChar(b, ch, k) {
    if (MON_CHAR[ch]) { b[k] = 3; g.mon[k] = newMon(MON_CHAR[ch], { hp: ch === 'A' ? 1 : ch === 'B' ? 2 : ch === 'C' ? 3 : 0 }); return true; }
    if (ch >= '0' && ch <= '6') { b[k] = 3; g.mon[k] = newMon('color', { col: +ch }); return true; }
    if (ch === 'R') { b[k] = 5; g.rockHp[k] = 1; return true; }
    if (ch === 'Q') { b[k] = 5; g.rockHp[k] = 2; return true; }
    if (ch === 'Z') { b[k] = 6; return true; } // 金属
    if (ch === 'D') { b[k] = 7; return true; } // 0.9.20 第二章：一堆土（只有爆竹鼠啃过的块带的小爆竹炸得塌）
    return false;
  }
  st.board.forEach((row, r) => row.split('').forEach((ch, c) => {
    const k = r * 9 + c;
    if (!putChar(g.board, ch, k) && ch === 'K') { g.board[k] = 4; g.bigCells.push(k); }
    if (g.board[k] === 1) g.color[k] = -1;
  }));
  // 一波一波冒出来（stage.waves）：盘上的墨怪抓光了（要打铁石的关，铁石也打光了），下一波墨怪从墨里冒出来。盘面不清空：你放的块、墨块都还在。
  // 每一波写成一张 9×9 的小图，只认里面的墨怪和铁石；那一格被占了，就冒在离它最近的空格。没有手数上限，也没有倒计时：输法只有「三块都放不下」。
  const isMonCh = (ch) => !!MON_CHAR[ch] || (ch >= '0' && ch <= '6');
  g.waveQ = (st.waves || []).map((w) => w.slice());
  g.waveNo = 1; g.waveTotal = waveTotalOf(st);
  const waveMonCount = () => g.waveQ.reduce((a, w) => a + w.join('').split('').filter(isMonCh).length, 0);
  function nextWave(b, ev) {
    if (!g.waveQ.length || g.mon.some(Boolean)) return;
    if ('rock' in g.got && b.some((v) => v === 5)) return; // 要打铁石的关：这张盘的铁石也打光了才换
    const w = g.waveQ.shift(); g.waveNo++;
    const dropped = [];
    w.forEach((row, r) => row.split('').forEach((ch, c) => {
      if (!isMonCh(ch) && ch !== 'R' && ch !== 'Q') return;
      let k = r * 9 + c;
      if (b[k] !== 0) { let best = -1, bd = 99; for (let x = 0; x < 81; x++) { if (b[x] !== 0) continue; const d = Math.abs(Math.floor(x / 9) - r) + Math.abs((x % 9) - c); if (d < bd) { bd = d; best = x; } } k = best; }
      if (k >= 0 && putChar(b, ch, k)) dropped.push(k);
    }));
    ev.wave = { no: g.waveNo, of: g.waveTotal, cells: dropped };
  }
  if (g.bigCells.length) {
    g.bigHp = st.bigHp || 3;
    g.boss = { kind: st.bossKind || 'spit', hp: g.bigHp, max: g.bigHp, phase: 1, count: 0, nextSpit: null, eatPlan: null, jumpTo: null, stun: false, angry: !!st.bossAngry };
  }
  if (g.boss && g.boss.kind === 'split') g.boss.stun = !g.mon.some(Boolean);
  // 挑色怪的颜色一定发得出来
  const monCols = [...new Set(g.mon.filter((m) => m && m.col >= 0).map((m) => m.col))]; // 不改关卡表本身
  // 发块的颜色：出战宠物的颜色多发（×2.5），这一关的颜色表里没有它的颜色就自动加上；进化关只发它的颜色和旧铁、蓝
  const palette = (st.colors || [0, 1, 2, 3]).slice();
  monCols.forEach((ci) => { if (!palette.includes(ci)) palette.push(ci); });
  if (!st.evolve) g.team.forEach((p) => { if (!palette.includes(petDef(p).color)) palette.push(petDef(p).color); });
  g.pickColor = () => {
    const ws = palette.map((ci) => ({ ci, w: g.team.some((p) => petDef(p).color === ci) ? 2.5 : 1 }));
    let t = g.rand() * ws.reduce((a, x) => a + x.w, 0);
    for (const x of ws) { if ((t -= x.w) <= 0) return x.ci; }
    return ws[0].ci;
  };
  g.previewN = Math.max(RULES.preview || 0, ...g.team.map((p) => lookOf(p.id, p.lv)), 0);
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
      if (core.solvable(g.board, h.filter(Boolean))) { g.hand[j] = q; g.handGem[j] = null; g.homeDeals = (g.homeDeals || 0) + 1; return; }
    }
  }
  const baseDeal = g.deal;
  g.deal = () => { const sk = g.hand[3] || null; baseDeal();
    if (!st.rush && !(o.tutorial && !g.moves)) ensureHome();
    if (g.previewN) { // 下一批是提前抽好的。看得见的那几块照原样发，看不见的可以重抽，凑到「三块有一种放法全放得下」；实在凑不出，就当着玩家的面换掉（记一次「预览说了不算」）
      if (g.nextHand) {
        const keep = g.nextHand.slice(0, g.previewN); let ok = null, d = g.diff ? g.diff() : 0;
        if (core.solvable(g.board, g.nextHand)) ok = g.nextHand.slice();
        else for (let t = 0; t < 40 && !ok && keep.length < 3; t++) { const h = keep.concat(Array.from({ length: 3 - keep.length }, () => pickPiece(g.rand, d))); if (core.solvable(g.board, h)) ok = h; d = Math.max(0, d - 0.08); }
        if (ok) { g.hand = ok; g.handGem = g.handGem.map((x, k) => (x && g.hand[k] && x.cell < g.hand[k].cells.length ? x : null)); } else g.previewLies = (g.previewLies || 0) + 1;
        g.previewDeals = (g.previewDeals || 0) + 1;
      }
      g.nextHand = [0, 1, 2].map(() => pickPiece(g.rand, g.diff ? g.diff() : 0));
    }
    g.hand[3] = sk; g.handGem[3] = null; g.handColor = colorsOfHand(); g.lastDealOK = core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean)); g.lastDealMove = g.moves; g.lastDealUnfair = !g.lastDealOK && core.solvable(g.board, [core.PIECES['1'], core.PIECES['2h'], core.PIECES['1']]); if (!g.lastDealOK) g.badDeals = (g.badDeals || 0) + 1; };
  g.lastDealOK = core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean)); g.lastDealMove = 0;
  // 【难度实验】一关里越往后越挤：发大块的多少跟着第几波走（st.dWave = 每过一波加多少）
  // st.dSeg = [第一段, 第二段, 第三段] 各发多少大块（第一段送、后面越来越挤）；头目关：st.dBoss2 = 它半血以后再加多少
  g.diff = () => (st.dSeg ? st.dSeg[Math.min((g.waveNo || 1) - 1, st.dSeg.length - 1)] : (st.d || 0)) + (st.dBoss2 && g.boss && g.boss.phase === 2 ? st.dBoss2 : 0) + (st.dBoss3 && g.boss && g.bigHp * 5 <= g.boss.max ? st.dBoss3 : 0); // dBoss3：头目只剩两成血时再加
  const baseReroll = g.reroll;
  g.reroll = () => { const sk = g.hand[3] || null; g.hand.length = 3; baseReroll(); g.hand[3] = sk; g.handGem[3] = null; g.handColor = colorsOfHand(); if (st.rush && g.rushRepair) g.rushRepair(); };
  g.hand[3] = null; g.handGem[3] = null;
  g.handColor = colorsOfHand();
  // 0.9.14 debug：开局这三块是 core 在墨怪、铁石、头目摆上盘之前发的，五十局里有一局三块没法全放下。照「发牌一定有活路」（Cc 11-25 定）重发一次；新手引导那一手不动
  if (!o.tutorial && !core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean))) g.deal();
  // ---------- 0.9.20 冲锋关重做（Cc 11-27「记一下」：「手上3个牌，棋盘上就应该只有这3个空位……迅速地眯着眼睛一扫就知道哪个放哪个……
  // 这3个牌都放完，整个棋盘也变新牌也发出来了，就相当于不停地爽……塞塞塞塞塞」）----------
  // 盘面永远是满的，只留正好 3 个空，每个空的形状 = 手上一块；三个空各占自己的行、列、大格，互不挨着，所以塞哪块都一定整片消。
  // 消完马上补满（只留没塞的那几个空）；三块都塞完：整盘换新、再发三块。塞错了也不会输：照新盘面重新挖空。没有墨怪，宠物不出技能块。
  const RUSH_POOL = core.IDS.filter((id) => core.PIECES[id].cells.length >= 2 && core.PIECES[id].cells.length <= 5);
  g.rushGap = [null, null, null]; // 每块对应的空：{ r, c }
  const gapCells = (p, at) => p.cells.map(([dr, dc]) => (at.r + dr) * 9 + at.c + dc);
  const unitsOf = (cells) => { const s2 = new Set(); cells.forEach((k) => { const r = Math.floor(k / 9), c = k % 9; s2.add(r); s2.add(9 + c); s2.add(18 + core.boxOf(r, c)); }); return s2; };
  // 0.9.21 冲锋关垫满的格子用「铜砖」（盘面值 8，Cc 11-27：「专门换另外一种填满了也不会消的特殊色块来表示……这样就不会打破我们的九宫消规则了」）：
  // 铜砖算满，但一整排全是铜砖不消；玩家塞进去那块所在的排 / 列 / 大格才消（连铜砖一起炸）
  function fillAll(b, keep) { const added = []; for (let k = 0; k < 81; k++) if (b[k] === 0 && !keep.has(k)) { b[k] = 8; g.color[k] = 0; added.push(k); } return added; }
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
      for (let i = 0; i < 3; i++) { g.hand[i] = core.PIECES[RUSH_POOL[Math.floor(g.rand() * RUSH_POOL.length)]]; g.handColor[i] = g.pickColor(); g.handGem[i] = null; }
      g.rushGap = [null, null, null];
      for (let k = 0; k < 81; k++) { b[k] = 8; g.color[k] = 0; }
      if ([0, 1, 2].every((i) => carve(b, i))) break;
    }
    ensureGaps([0, 1, 2]);
    const fix = rushFixPlan();
    if (ev) { ev.rushBoard = true; ev.rushNew = [0, 1, 2]; ev.rushFix = fix; } else g.rushFixStart = fix;
  }
  // 0.9.21 修第 16 关卡死（Cc 11-27：「整个地图都是满的，手里还有一块塞不进去、没地方放了，但它也不消」）：
  // 原来剩下的块重挖不出空就不管了。现在保证手上每块都有自己的空：先只重挖坏掉的，不行就剩下的全部重挖，再不行换小一点的块
  g.rushOK = (i, r, c) => { const p = g.hand[i]; if (!p || !core.canPlace(g.board, p, r, c)) return false; const b2 = g.board.slice(), placed = p.cells.map(([dr, dc]) => (r + dr) * 9 + c + dc); placed.forEach((k) => { b2[k] = 1; }); return placed.some((k) => UNITS.some((u) => u.includes(k) && u.every((x) => b2[x]))); };
  // 万一哪条路把手上的块换了（看广告换一批之类）：重挖到每块都有一放就消的空
  g.rushStuck = () => st.rush && !g.over && [0, 1, 2].some((i) => g.hand[i] && !core.placements(g.board, g.hand[i]).some(([r, c]) => g.rushOK(i, r, c)));
  g.rushRepair = () => { for (let k = 0; k < 81; k++) if (g.board[k] === 0) g.board[k] = 8; g.rushGap = [null, null, null]; ensureGaps([0, 1, 2]); };
  const rushFits = (i) => { const at = g.rushGap[i]; return !!(at && g.hand[i] && core.canPlace(g.board, g.hand[i], at.r, at.c)); };
  function ensureGaps(slots) {
    const b = g.board;
    slots = slots.filter((i) => g.hand[i]);
    slots.forEach((i) => { if (!rushFits(i)) { g.rushGap[i] = null; carve(b, i); } });
    for (let t = 0; t < 80 && !slots.every(rushFits); t++) {
      slots.forEach((i) => { const at = g.rushGap[i]; if (at && g.hand[i]) gapCells(g.hand[i], at).forEach((k) => { if (b[k] === 0) b[k] = 8; }); g.rushGap[i] = null; });
      const order = slots.slice().sort(() => g.rand() - 0.5);
      if (t >= 30) { const small = RUSH_POOL.filter((id) => core.PIECES[id].cells.length <= (t >= 55 ? 2 : 3)); const j = order[Math.floor(g.rand() * order.length)]; g.hand[j] = core.PIECES[small[Math.floor(g.rand() * small.length)]]; }
      order.forEach((i) => carve(b, i));
    }
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
    const cells = gapCells(g.hand[j], g.rushGap[j]);
    return { kind: 'peck', pet: pt.id, k: cells[Math.floor(g.rand() * cells.length)] };
  }
  // 塞完一块以后：补满（留着剩下几块的空）；剩下哪块的空被弄坏了就重挖；三块都塞完就整盘换新
  function rushAfter(ev, placedSlot) {
    g.rushGap[placedSlot] = null;
    const left = [0, 1, 2].filter((i) => g.hand[i]);
    if (!left.length) { g.rushBoards = (g.rushBoards || 0) + 1; ev.rushBurst = []; for (let k = 0; k < 81; k++) if (g.board[k]) ev.rushBurst.push(k); rushBoard(ev); return; } // 三块塞完：剩下的铜砖整盘炸开，再换新盘
    const keep = new Set(); left.forEach((i) => { if (g.rushGap[i]) gapCells(g.hand[i], g.rushGap[i]).forEach((k) => keep.add(k)); });
    ev.refill = fillAll(g.board, keep);
    ensureGaps(left);
  }
  if (st.rush) {
    g.rush = true;
    rushBoard(null);
  } else if (st.startHand && !o.tutorial) { st.startHand.forEach((id, j) => { g.hand[j] = core.PIECES[id]; g.handGem[j] = null; }); } // 0.9.20 第 11 关：开局故意发几块放不太下的大块（教啃）
  else if (!o.tutorial) ensureHome();
  g.rushHome = (i) => (st.rush ? clearingHome(g.board, g.hand[i]) : null);
  // 火麒麟的灯：开局也照着下一批（原来第一批放完才开始照，登场关一开局什么都看不到）
  if (g.previewN && !g.nextHand) g.nextHand = [0, 1, 2].map(() => pickPiece(g.rand, g.diff()));
  // 看广告复活以后一定有块可放（0.9.14 debug）：正中间是头目 / 墨怪 / 铁石时「清空正中间」清不出地方，换一组又没换到放得下的，
  // 原来就成了「没判输、也没块能放」，点什么都没反应。现在把放不下的换成 1 格的；盘上一个空格都没有才照旧算输
  // 0.9.17 看广告救命（Fable 新版第八节 + Cc 11-27 第 8 件定 B）：清最挤的 3 个大格（只清你放的块和墨块；墨怪、金属、头目不动），
  // 手上三块换成小块（1–3 格）、保证放得下；一关最多 3 次（C.adMax）。g.lastRevive = 清了哪几格（画面照这个演）
  const SMALL = core.IDS.filter((id) => core.PIECES[id].cat === 0);
  g.revive = () => {
    g.adsUsed++; g.revivesUsed = (g.revivesUsed || 0) + 1;
    const b = g.board;
    // 0.9.20（Cc 11-27 第 134 条定「改」）：第 1 次清最挤的 3 个大格、第 2 次 2 个、第 3 次 1 个；用过救命这关最多 2 星（main.js 的 liveStars）
    const nBox = [3, 2, 1][Math.min(2, g.revivesUsed - 1)];
    const boxes = [...Array(9).keys()].map((bx) => ({ bx, n: UNITS[18 + bx].filter((k) => b[k] === 1).length })).sort((x, y) => y.n - x.n || x.bx - y.bx).slice(0, nBox).filter((x) => x.n > 0).map((x) => x.bx);
    const cells = [];
    boxes.forEach((bx) => UNITS[18 + bx].forEach((k) => { if (b[k] === 1) { b[k] = 0; g.color[k] = 0; g.gem[k] = 0; cells.push(k); } }));
    for (let i = 0; i < 3; i++) {
      let q = null;
      for (let t = 0; t < 30 && !q; t++) { const c = core.PIECES[SMALL[Math.floor(g.rand() * SMALL.length)]]; if (core.anyPlacement(b, c)) q = c; }
      g.hand[i] = q || core.PIECES['1']; g.handGem[i] = null; g.handColor[i] = g.pickColor();
    }
    g.lastRevive = { boxes, cells };
    g.over = false; g.reason = null; g._ended = false;
    syncAll();
    if (g.stuck()) { g.over = true; g.reason = 'stuck'; }
  };
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
  // 墨怪偷 / 炸宠物的能量（m = 动手的那只墨怪）：不是它克星的宠物才中招。炸弹怪炸光，别的偷 RULES.steal 格。
  function drainPets(m, k, ev) {
    for (const pt of g.team) {
      if (isCounter(m, petOf(pt.id)) || pt.energy <= 0) continue;
      if (m.t === 'bomb' ? !RULES.bombDrain : !RULES.steal) continue;
      const n = m.t === 'bomb' ? pt.energy : Math.min(pt.energy, RULES.steal);
      pt.energy -= n; g.monStats.drained = (g.monStats.drained || 0) + n; (ev.drain = ev.drain || []).push({ from: k, id: pt.id, n, kind: m.t });
    }
  }

  // 墨怪挨一下：抓到了返回 true。byPet：宠物下的手（伤害加倍、不挑颜色、不分身）；colorOk(k, col)：消掉的那一排里有没有这种颜色
  function hitMon(k, ev, byPet, colorOk, pet) {
    const m = g.mon[k];
    if (!m) return true;
    if (byPet && pet) {
      // 克制：对口的一下抓走（ev.counter：画「克」的特效）；不对口的打不动（ev.petMiss：它缩一下、灰火花）
      if (isCounter(m, pet)) { if (m.t !== 'ink') { (ev.counter = ev.counter || []).push({ k, t: m.t, by: pet.id }); g.monStats.counter = (g.monStats.counter || 0) + 1; } return true; }
      (ev.petMiss = ev.petMiss || []).push({ k, t: m.t, by: pet.id }); g.monStats.petMiss = (g.monStats.petMiss || 0) + 1;
      return false;
    }
    if (m.t === 'shell' && m.hp > 0) {
      const dmg = byPet ? 2 : 1;
      if (m.hp >= dmg) { m.hp -= dmg; g.monStats.cracks++; (ev.shellCrack = ev.shellCrack || []).push({ k, left: m.hp, n: dmg }); return false; }
    }
    if (m.t === 'color' && !byPet && !(colorOk && colorOk(k, m.col))) { g.monStats.colorMiss++; (ev.colorMiss = ev.colorMiss || []).push(k); return false; }
    if (m.t === 'split' && !byPet) g.spawnQ.push({ k, n: 2, from: 'split' });
    return true;
  }
  // 清掉一批格子
  function clearCells(b, cells, ev, byPet, colorOk, pet) {
    for (const k of cells) {
      const v = b[k];
      if (v === 0 || v === 2 || v === 4 || v === 5 || v === 7) continue;
      if (v === 6) { if (byPet && pet && pet.color === PETS.tongque.color) { b[k] = 0; (ev.metal = ev.metal || []).push(k); g.monStats.metal = (g.monStats.metal || 0) + 1; } continue; } // 金属：只有铜雀（金色）啄得掉
      if (IS_MON(v)) {
        if (!hitMon(k, ev, byPet, colorOk, pet)) continue;
        if (byPet) g.playStats.goalsByPet++; else g.playStats.goalsByPlayer++;
        if ('monster' in g.got) g.got.monster++; g.caught++; ev.collected.push({ k, what: 'monster', t: g.mon[k] ? g.mon[k].t : 'ink', col: g.mon[k] ? g.mon[k].col : -1 }); delete g.jumpPlan[k]; g.mon[k] = null;
      }
      if (g.gem[k]) { const id = core.GEMS[g.gem[k]].id; if (id in g.got) { g.got[id]++; ev.collected.push({ k, what: id }); } g.gem[k] = 0; }
      if (g.bubble[k]) { g.bubble[k] = 0; if ('bubble' in g.got) { g.got.bubble++; ev.collected.push({ k, what: 'bubble' }); } }
      b[k] = 0;
    }
  }
  // 一次「消掉」（一排 / 一个大格）碰到了机关匣或大墨怪
  function unitTouches(b, cells, ev, byPet, pet) {
    if ('box' in g.got && cells.some((k) => b[k] === 2)) { g.got.box++; ev.collected.push({ k: cells.find((k) => b[k] === 2), what: 'box' }); }
    if (g.boss && g.bigHp > 0 && cells.some((k) => b[k] === 4) && !(byPet && ev.petBossDone)) {
      if (byPet) ev.petBossDone = true; // 0.9：宠物出手一次最多咬头目一口（金翅雀一次扫两排，原来能咬两口）
      const weak = RULES.bossWeak[g.boss.kind];
      // 克制：头目怕的那只宠物咬一口掉 2 颗心，别的宠物咬一口 1 颗（和原来一样）；你自己打：它晕着 2 颗，平时 1 颗（没变）
      const dmg = byPet ? (weak && pet && pet.act === weak ? RULES.bossWeakDmg : RULES.bossOtherDmg) : st.bossEvery ? 1 : ev.stunHit ? 2 : 1; // 0.9.17：「破绽」砍掉，新头目挨一下就是 1 颗心
      if (byPet && dmg > 1) (ev.counter = ev.counter || []).push({ k: g.bigCells[0], t: 'boss', by: pet && pet.id });
      // 原来的注释：0.9：它刚动完手正晕着时你打中它，一下掉 2 颗心；宠物咬只掉 1 颗（量出来宠物替你打掉了大半的心）
      g.bigHp = Math.max(0, g.bigHp - dmg);
      g.boss.hp = g.bigHp;
      ev.bigHits.push({ k: g.bigCells[0], dmg });
      if (byPet) { g.playStats.bossByPet += dmg; g.playStats.goalsByPet += dmg; } else { g.playStats.bossByPlayer += dmg; g.playStats.goalsByPlayer += dmg; }
      if (g.boss.kind === 'split' && g.bigHp > 0) g.spawnQ.push({ k: g.bigCells[0], n: 1, from: 'boss' }); // 分身王：挨一下蹦一只小墨怪
      // 0.9.17（Fable 新版第一章第 10 关）：每挨 st.bossEvery 下跳一次，跳之前落脚的 2×2 先亮红框一手
      if (st.bossEvery && g.bigHp > 0) { g.boss.hits = (g.boss.hits || 0) + dmg; if (g.boss.hits >= st.bossEvery && g.boss.jumpTo === null) { g.boss.hits = 0; planBossJump(b, ev); } }
      if (g.bigHp === 0) {
        g.bigCells.forEach((k) => (b[k] = 0));
        g.caught += 3;
        if ('boss' in g.got) g.got.boss = 1;
        ev.collected.push({ k: g.bigCells[0], what: 'boss' });
        ev.bossDown = true;
      }
    }
  }
  function planBossJump(b, ev) {
    const opts2 = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const tl = r * 9 + c, cells = [tl, tl + 1, tl + 9, tl + 10];
      if (cells.some((k) => g.bigCells.includes(k))) continue;
      if (cells.every((k) => b[k] === 0 || b[k] === 1)) opts2.push(tl);
    }
    if (opts2.length) { g.boss.jumpTo = opts2[Math.floor(g.rand() * opts2.length)]; g.boss.planMove = g.moves; ev.bossJumpPlan = g.boss.jumpTo; }
  }
  const rockLeft = () => 'rock' in g.got && g.got.rock < st.goal.rock;
  function breakRocks(b, cells, ev, pet) {
    for (const k of cells) {
      if (b[k] !== 5) continue;
      const dmg = pet && pet.act === RULES.rockNemesis ? RULES.rockDmg : 1;
      if (g.rockHp[k] > dmg) { g.rockHp[k] -= dmg; (ev.rockCrack = ev.rockCrack || []).push(k); continue; } // 两层：先裂
      b[k] = 0; g.rockHp[k] = 0;
      if ('rock' in g.got) g.got.rock++;
      g.playStats.goalsByPet++; // 铁石只有宠物打得碎
      ev.collected.push({ k, what: 'rock' }); (ev.rocks = ev.rocks || []).push(k);
    }
  }
  // 救命（并在宠物身上，没有另外的计数）：三块都放不下、宠物格空着的时候，能量条里只要有东西，宠物就提前把技能块给你，能量清空。
  // 技能块只有一格，永远放得下；放下去清掉周围一小片，腾出地方。能量是空的就救不了：所以平时多消几排，就是在给自己攒命。
  function rescue(ev) {
    if (!g.stuck() || g.hand[3] || !g.team.length) return;
    const ok = (x) => (RULES.rescue === 'half' ? x.energy * 2 >= energyMax(g, x) : x.energy >= RULES.rescueMin);
    const pt = g.team.filter(ok).sort((x, y) => y.energy / energyMax(g, y) - x.energy / energyMax(g, x))[0];
    if (pt) pt.energy = 0;
    if (!pt) return;
    g.hand[3] = skillPiece(pt); g.handColor[3] = petDef(pt).color; ev.rescue = pt.id; g.rescues = (g.rescues || 0) + 1;
    ev.petActs.push({ id: pt.id, kind: 'gift', lines: [], boxes: [], cells: [], rescue: true });
  }
  // 【技能重做】技能块用在哪（tg）：盘上 { r, c }；手上的块 { hand: 第几块, cell: 它的第几格 }。返回这一下会碰到什么（画面照这个亮），用不了返回 null。
  //   啄：拖到盘上哪一格都行，啄掉这一排里离它最近的 N 样东西。喷火：拖到一样东西上，烧掉它，火顺着同一种颜色（墨块、小墨怪算同一种）蹿，一共 N 格。
  //   啃：拖到盘上一样东西上啃 1 格，或者拖到手上的块的某一格上啃掉它；一块技能块能啃 N 口。吐丝：拖到空格上，补上它和这一排里离它最近的空格，一共 N 格；丝挨着的墨怪被缠住。
  function skillPlan(pc, tg, b0) {
    const b = b0 || g.board, kind = pc.kind, n = pc.n;
    if (tg.hand !== undefined) {
      const p = g.hand[tg.hand];
      if (!p || p.special || tg.hand > 2) return null;
      if (kind === 'gnaw' && RULES.handMode === 'none') return null;
      if (kind === 'gnaw' && RULES.handMode === 'swap') return { hand: tg.hand, swap: true, n: RULES.swapN, cells: [], fill: [] };
      if (kind === 'gnaw') { const q = gnawPiece(p, tg.cell); return q === undefined ? null : { hand: tg.hand, cell: tg.cell, to: q, cells: [], fill: [] }; }
      if (kind === 'swap') return { hand: tg.hand, swap: true, cells: [], fill: [] };
      return null;
    }
    const k = tg.r * 9 + tg.c;
    if (kind === 'peck') {
      const line = pc.dir === 'v' ? UNITS[9 + tg.c] : UNITS[tg.r], pos = (x) => (pc.dir === 'v' ? Math.floor(x / 9) - tg.r : (x % 9) - tg.c);
      const row = line.filter((x) => PECKABLE(b[x])).sort((x, y) => Math.abs(pos(x)) - Math.abs(pos(y)) || x - y).slice(0, n);
      return row.length ? { cells: row, fill: [] } : null;
    }
    if (kind === 'gnaw') return null; // 0.9.20（Cc 定：鼠只啃手上的块、不上盘）
    if (kind === 'fire') {
      if (!OCC(b[k])) return null;
      // 同一种东西：方块 = 同一种颜色的方块（墨块算一种）；墨怪 = 同一种墨怪（挑色怪还要同色）；铁石 = 铁石；头目只烧它自己
      const same = (x) => { if (x === k || b[x] !== b[k]) return false; if (b[k] === 1) return g.color[x] === g.color[k]; if (b[k] === 3) { const m1 = g.mon[k], m2 = g.mon[x]; return !!m1 && !!m2 && m1.t === m2.t && m1.col === m2.col; } return b[k] === 5; };
      const dist = (x) => Math.abs(Math.floor(x / 9) - tg.r) + Math.abs((x % 9) - tg.c);
      const out = [k].concat([...Array(81).keys()].filter(same).sort((x, y) => dist(x) - dist(y) || x - y).slice(0, n - 1));
      return { cells: out, fill: [] };
    }
    if (kind === 'silk') {
      if (b[k] !== 0) return null;
      const fill = UNITS[tg.r].filter((x) => b[x] === 0).sort((x, y) => Math.abs((x % 9) - tg.c) - Math.abs((y % 9) - tg.c) || x - y).slice(0, n);
      // 丝粘到的（上下左右挨着的）东西里，最多缠 N 样（补几格就最多缠几样）：先挑它克的墨怪，再小墨怪、铁石、头目，最后才是它打不动的
      const pet = petOf(pc.pet), rank = (x) => (b[x] === 3 && g.mon[x] ? (g.mon[x].t === 'ink' ? 1 : isCounter(g.mon[x], pet) ? 0 : 4) : b[x] === 5 ? 2 : 3);
      const adj = [...new Set(fill.flatMap(near4))].filter((x) => !fill.includes(x) && (b[x] === 3 || b[x] === 4 || b[x] === 5)).sort((x, y) => rank(x) - rank(y) || x - y).slice(0, n);
      return { cells: adj, fill };
    }
    return null;
  }
  g.skillPlan = (tg) => (g.hand[3] ? skillPlan(g.hand[3], tg) : null);
  g.skillUsable = () => { const pc = g.hand[3]; if (!pc) return false; if (pc.kind === 'gnaw' || pc.kind === 'swap') return true; return pc.kind === 'silk' ? g.board.some((v) => v === 0) : pc.kind === 'peck' ? g.board.some(PECKABLE) : g.board.some(OCC); };
  const baseFits = g.fits;
  g.fits = (i) => (i === 3 ? g.skillUsable() : baseFits(i));
  // 用技能块。不算一手，墨怪不动，不发新块。
  function useSkill(i, tg) {
    const p = g.hand[i], pet = petOf(p.pet), plan = skillPlan(p, tg);
    if (!plan) return null;
    const b = g.board.slice(), cells = plan.cells;
    const ev = { piece: p, r: tg.r, c: tg.c, placed: [], units: [], cells: [], collected: [], bigHits: [], petActs: [], energy: {}, sparks: [], fire: null, gained: 0, win: false, stunHit: false, skill: { pet: p.pet, kind: p.kind, n: p.n, cells, fill: plan.fill, hand: plan.hand } };
    if (p.bossBit) ev.petBossDone = true; // 一块技能块最多咬头目一口（啃能啃好几口，也只算一口）
    const c0 = g.caught;
    g.skillStats = g.skillStats || { hand: 0, board: 0, cells: 0, uses: 0, caught: 0 };
    if (plan.hand !== undefined) {
      g.skillStats.hand++;
      if (plan.swap) {
        // 换块（实验）：从 N 块里挑一块。机器人挑「放得下、而且放下去盘面最好」的那块。
        const d = Math.max(0, g.diff() - 0.3), cands = Array.from({ length: plan.n || p.n }, () => pickPiece(g.rand, d));
        const score = (q) => { let best = -1e9; for (const [r, c] of core.placements(b, q)) { const res = core.placeAndClear(b, q, r, c); best = Math.max(best, res.units.length * 9 + core.evalBoard(res.board, null)); } return best; };
        g.hand[plan.hand] = cands.map((q) => ({ q, v: score(q) })).sort((x, y) => y.v - x.v)[0].q; g.handGem[plan.hand] = null;
      } else {
        const hg = g.handGem[plan.hand];
        g.hand[plan.hand] = plan.to;
        if (hg) g.handGem[plan.hand] = hg.cell === plan.cell || !plan.to ? null : { cell: hg.cell > plan.cell ? hg.cell - 1 : hg.cell, kind: hg.kind };
        if (!g.hand.slice(0, 3).some(Boolean)) { const keep = g.hand[3]; g.deal(); g.hand[3] = keep; } // 啃光了最后一块：发新的
      }
    } else {
      g.skillStats.board++;
      if (plan.fill.length) plan.fill.forEach((k) => { b[k] = 1; g.color[k] = PETS[p.pet].color; });
      breakRocks(b, cells, ev, pet);
      if (cells.some((k) => b[k] === 4)) unitTouches(b, cells, ev, true, pet);
      if (ev.petBossDone) p.bossBit = true;
      const before = cells.filter((k) => EATABLE(b[k]));
      clearCells(b, cells, ev, true, null, pet);
      ev.cells = before.filter((k) => b[k] === 0);
      g.skillStats.cells += ev.cells.length + plan.fill.length;
      if (plan.fill.length) {
        // 丝补满了一排 / 一个大格：照你自己消的规矩消掉（不给它攒能量，不然它能自己养自己）
        const units = []; for (let u = 0; u < 27; u++) if (UNITS[u].every((k) => b[k])) units.push(u);
        if (units.length) {
          const set = new Set(); units.forEach((u) => { unitTouches(b, UNITS[u], ev); UNITS[u].forEach((k) => set.add(k)); });
          const b1 = b.slice(); const colorOk = (k, col) => units.some((u) => UNITS[u].includes(k) && UNITS[u].some((x) => b1[x] === 1 && g.color[x] === col));
          const was = [...set].filter((k) => EATABLE(b[k]));
          clearCells(b, [...set], ev, false, colorOk);
          ev.units = units; ev.cells = ev.cells.concat(was.filter((k) => b[k] === 0)); g.skillStats.silkUnits = (g.skillStats.silkUnits || 0) + units.length;
        }
      }
    }
    g.skillCaught = (g.skillCaught || 0) + g.caught - c0; g.skillStats.caught += g.caught - c0;
    p.uses--; g.skillStats.uses++;
    if (p.uses <= 0) { g.hand[i] = null; g.skillUses++; if ('acts' in g.got) g.got.acts++; g.petActsTotal[p.pet] = (g.petActsTotal[p.pet] || 0) + 1; }
    while (g.spawnQ.length) { const sp = g.spawnQ.shift(); spawnAround(b, sp.k, sp.n, ev); }
    nextWave(b, ev);
    if (!g.playStats.firstGoal && (ev.collected.some((x) => x.what !== 'bubble') || ev.bigHits.length)) g.playStats.firstGoal = Math.max(1, g.moves);
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
  // 0.9.20 爆竹鼠 5 级进化「转」：技能块停在托盘里一块上，它转四分之一圈；松手就算用掉一口（不啃）
  g.canRotate = () => !!(g.hand[3] && g.hand[3].pet === 'baozhuwang');
  g.rotateHand = (i) => { const p = g.hand[i]; if (!p || p.special || i > 2) return false; const cells = p.cells.map(([r, c]) => [c, p.h - 1 - r]); const mi = p.mud; g.hand[i] = Object.assign({}, p, { id: p.id + 'r', cells, h: p.w, w: p.h, mud: mi }); return true; };
  g.spendBite = () => { const p = g.hand[3]; if (!p) return; p.uses--; if (p.uses <= 0) { g.hand[3] = null; g.skillUses++; g.petActsTotal[p.pet] = (g.petActsTotal[p.pet] || 0) + 1; } };

  // ---------- 墨怪的回合（每放一块之后） ----------
  // 一块方块所在的一排、一竖、一大格加起来有多满（馋嘴专挑最满的啃，最气人）
  const crowd = (b, k) => { const r = Math.floor(k / 9), c = k % 9; return [UNITS[r], UNITS[9 + c], UNITS[18 + core.boxOf(r, c)]].reduce((a, u) => a + u.filter((x) => b[x]).length, 0); };
  const pick = (arr) => arr[Math.floor(g.rand() * arr.length)];
  const inkAt = (b, k) => { b[k] = 1; g.color[k] = -2; g.gem[k] = 0; };
  function moveMon(b, from, to) { b[to] = 3; b[from] = 0; g.mon[to] = g.mon[from]; g.mon[from] = null; }
  // 分身：在 k 旁边的空格蹦出 n 只小墨怪（先找挨着的，再找同一个大格，再随便）
  function spawnAround(b, k, n, ev) {
    const pools = [near8(k).filter((x) => b[x] === 0), UNITS[18 + boxOfK(k)].filter((x) => b[x] === 0), [...Array(81).keys()].filter((x) => b[x] === 0)];
    for (let i = 0; i < n; i++) {
      const pool = pools.map((pl) => pl.filter((x) => b[x] === 0)).find((pl) => pl.length);
      if (!pool) return;
      const to = pick(pool);
      b[to] = 3; g.mon[to] = newMon('ink');
      (ev.spawns = ev.spawns || []).push({ from: k, to }); g.monStats.spawns++;
    }
  }
  // 0.9.17 墨怪是活的（Fable 新版规矩 2）：st.crawl = 每几手爬一格。爬之前一手，要去的那格先冒一对小脚印（m.step）。
  // 脚印那格被你放了块，它这一手就不动，下一轮换个方向。四面都堵死就困在原地。墨苔怪爬走时，原来那格留一块墨。
  // 0.9.20（Cc 11-27：「莫怪自己跳到一个位置会把那一格填满，那一格应该当时就炸，不要等我放下一首再炸」）：
  // 墨怪爬进去（墨苔怪留下墨）正好凑满一排 / 一竖 / 一大格，当场消掉，算你抓的
  function crawlClear(b, keys, ev) {
    const units = [];
    for (let u = 0; u < 27; u++) if (!units.includes(u) && UNITS[u].some((x) => keys.includes(x)) && UNITS[u].every((x) => b[x])) units.push(u);
    if (!units.length) return;
    const set = new Set(); units.forEach((u) => { unitTouches(b, UNITS[u], ev); UNITS[u].forEach((x) => set.add(x)); });
    const was = [...set].filter((x) => EATABLE(b[x]));
    const c0 = ev.collected.length;
    clearCells(b, [...set], ev, false, () => true);
    const cells = was.filter((x) => b[x] === 0);
    (ev.crawlClear = ev.crawlClear || []).push({ units, cells, collected: ev.collected.slice(c0) });
    if ('lines' in g.got) g.got.lines += units.length;
    for (const pt of st.rush ? [] : g.team) pt.energy = Math.min(energyMax(g, pt) * 2 - 1, pt.energy + units.length);
    giveSkill(ev);
  }
  function crawlTurn(b, ev) {
    if (!st.crawl) return;
    const claimed = new Set();
    for (let k = 0; k < 81; k++) {
      const m = g.mon[k];
      if (b[k] !== 3 || !m || m.moved === g.moves || (m.t !== 'ink' && m.t !== 'moss')) continue;
      if (m.step !== undefined && m.step !== null) {
        const t = m.step; m.step = null; m.walk = st.crawl;
        if (b[t] === 0 && !claimed.has(t)) {
          moveMon(b, k, t); g.mon[t].moved = g.moves; claimed.add(t);
          if (m.t === 'moss') { inkAt(b, k); g.monStats.moss++; (ev.moss = ev.moss || []).push({ from: t, k }); }
          (ev.crawl = ev.crawl || []).push({ from: k, to: t, t: m.t }); g.monStats.crawls = (g.monStats.crawls || 0) + 1;
          crawlClear(b, [t, k], ev);
        } else (ev.crawlBlocked = ev.crawlBlocked || []).push(k);
        continue;
      }
      if (m.walk === undefined) m.walk = st.crawl;
      if (--m.walk > 0) continue;
      const opts2 = near4(k).filter((x) => b[x] === 0 && !claimed.has(x) && !Object.values(g.mon).some((o) => o && o.step === x));
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
      const cells = raw.map(([a, b2]) => [a - r0, b2 - c0]), q = { id: p.id + '+', cat: Math.min(2, p.cat + 1), cells, h: Math.max(...cells.map((x) => x[0])) + 1, w: Math.max(...cells.map((x) => x[1])) + 1, gnawed: p.gnawed, mud: cells.length - 1 };
      if (q.h <= 5 && q.w <= 5 && (anywhere || core.anyPlacement(g.board, q))) return q;
    }
    return null;
  }
  // from：动手的那格（画泥团从哪飞出来）；mon：那只怪（或头目）身上记着瞪的是哪一块
  function mudTurn(who, from, ev) {
    if (who.glare !== undefined && who.glare !== null) {
      const slot = who.glare; who.glare = null;
      const p = g.hand[slot];
      if (p && !p.special && p.mud === undefined) { const q = addMud(p); if (q) { g.hand[slot] = q; (ev.mudSpit = ev.mudSpit || []).push({ from, slot }); g.monStats.mud = (g.monStats.mud || 0) + 1; return true; } }
      return false;
    }
    const opts = [0, 1, 2].filter((j) => g.hand[j] && !g.hand[j].special && g.hand[j].mud === undefined);
    if (opts.length) { who.glare = opts[Math.floor(g.rand() * opts.length)]; (ev.mudGlare = ev.mudGlare || []).push({ from, slot: who.glare }); }
    return false;
  }
  g.mudGlares = () => { const out = []; g.mon.forEach((m, k) => { if (m && m.t === 'sticky' && m.glare !== undefined && m.glare !== null) out.push({ k, slot: m.glare }); }); if (g.boss && g.boss.glare !== undefined && g.boss.glare !== null) out.push({ k: g.bigCells[0], slot: g.boss.glare, boss: true }); return out; };
  function stickyTurn(b, ev) {
    for (let k = 0; k < 81; k++) {
      const m = g.mon[k];
      if (b[k] !== 3 || !m || m.t !== 'sticky' || m.moved === g.moves) continue;
      if (m.glare !== undefined && m.glare !== null) {
        mudTurn(m, k, ev); m.cd = MON.sticky.cd;
        // 吐完爬一格（往空格）
        const opts2 = near4(k).filter((x) => b[x] === 0);
        if (opts2.length) { const t = opts2[Math.floor(g.rand() * opts2.length)]; moveMon(b, k, t); g.mon[t].moved = g.moves; (ev.crawl = ev.crawl || []).push({ from: k, to: t, t: 'sticky' }); crawlClear(b, [t], ev); }
      } else if (--m.cd <= 1) mudTurn(m, k, ev);
    }
  }
  function monsterTurn(b, ev) {
    crawlTurn(b, ev);
    stickyTurn(b, ev);
    // 跳跳怪：上一手探过头的，这一手跳过去；每 3 块探一次头
    for (const from of Object.keys(g.jumpPlan).map(Number)) {
      const to = g.jumpPlan[from];
      delete g.jumpPlan[from];
      if (b[from] === 3 && g.mon[from] && g.mon[from].t === 'jump' && b[to] === 0) { moveMon(b, from, to); (ev.jumps = ev.jumps || []).push({ from, to }); }
    }
    if (g.moves % 3 === 2) {
      for (let k = 0; k < 81; k++) {
        if (b[k] !== 3 || !g.mon[k] || g.mon[k].t !== 'jump') continue;
        const empty = UNITS[18 + boxOfK(k)].filter((x) => b[x] === 0 && !Object.values(g.jumpPlan).includes(x));
        if (empty.length) g.jumpPlan[k] = pick(empty);
      }
    }
    // 馋嘴怪 / 墨苔怪：每隔几手先亮出要动的那格（tgt），下一手动手；炸弹怪：倒数到 0 溅墨
    for (let k = 0; k < 81; k++) {
      const m = g.mon[k];
      if (b[k] !== 3 || !m) continue;
      if (RULES.pester[m.t] > 0) {
        // 冲宠物喷墨：先瞪一手（ev.glare），下一手偷能量
        if (m.tgt !== null) { m.tgt = null; m.cd = RULES.pester[m.t]; drainPets(m, k, ev); }
        else if (--m.cd <= 0) { m.tgt = -1; (ev.glare = ev.glare || []).push(k); }
      } else if (m.t === 'eat' || (m.t === 'moss' && !st.crawl)) {
        if (m.tgt !== null) {
          const t = m.tgt; m.tgt = null; m.cd = MON[m.t].cd;
          if (m.t === 'eat' && b[t] === 1) { b[t] = 0; g.color[t] = 0; g.gem[t] = 0; g.monStats.eats++; (ev.eats = ev.eats || []).push({ from: k, k: t }); drainPets(m, k, ev); }
          if (m.t === 'moss' && b[t] === 0) { inkAt(b, t); g.monStats.moss++; (ev.moss = ev.moss || []).push({ from: k, k: t }); drainPets(m, k, ev); }
        } else if (--m.cd <= 0) {
          const opts2 = near8(k).filter((x) => (m.t === 'eat' ? b[x] === 1 : b[x] === 0));
          if (!opts2.length) { m.cd = 1; continue; }
          if (m.t === 'eat') { const best = Math.max(...opts2.map((x) => crowd(b, x))); m.tgt = pick(opts2.filter((x) => crowd(b, x) === best)); }
          else m.tgt = pick(opts2);
        }
      } else if (m.t === 'bomb') {
        if (--m.cd <= 0) {
          const ring1 = near8(k).filter((x) => b[x] === 0), ring2 = [...new Set(ring1.flatMap(near8))].filter((x) => b[x] === 0 && !ring1.includes(x));
          const cells = ring1.concat(ring2).slice(0, 6);
          cells.forEach((x) => inkAt(b, x));
          (ev.bombs = ev.bombs || []).push({ k, cells }); g.monStats.bombs++; drainPets(m, k, ev);
          m.cd = MON.bomb.cd;
        }
      }
    }
    // 头目
    const bs = g.boss;
    if (!bs || g.bigHp <= 0) return;
    bs.count++;
    // 跳：上一手亮过红的地方，这一手跳过去，落下时把那 4 格里的块压碎
    if (bs.jumpTo !== null && !(bs.planMove !== undefined && g.moves <= bs.planMove)) { // 红框至少亮一手再跳
      const tl = bs.jumpTo, cells = [tl, tl + 1, tl + 9, tl + 10];
      const old = g.bigCells.slice();
      old.forEach((k) => (b[k] = 0));
      const crushed = cells.filter((k) => EATABLE(b[k]));
      clearCells(b, crushed, ev, false);
      cells.forEach((k) => { b[k] = 4; g.color[k] = 0; });
      g.bigCells = cells;
      ev.bossJump = { from: old[0], to: tl, crushed };
      bs.jumpTo = null;
    }
    if (!st.bossEvery && bs.phase === 1 && g.bigHp * 2 <= bs.max) {
      // 半血：找个能落脚的 2×2，先亮红一手
      bs.phase = 2;
      const opts2 = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const tl = r * 9 + c, cells = [tl, tl + 1, tl + 9, tl + 10];
        if (cells.some((k) => g.bigCells.includes(k))) continue;
        if (cells.every((k) => b[k] === 0 || b[k] === 1)) opts2.push(tl);
      }
      if (opts2.length) { bs.jumpTo = pick(opts2); ev.bossJumpPlan = bs.jumpTo; }
    }
    if (st.bossMud) { if (bs.glare !== undefined && bs.glare !== null) mudTurn(bs, g.bigCells[0], ev); else if (bs.count % 3 === 2) mudTurn(bs, g.bigCells[0], ev); } // 0.9.20 第二章头目泥沼怪：每 3 手往托盘里一块上吐泥（先瞪一手）
    if (st.bossNoSpit) { bs.stun = false; return; } // 0.9.17 第一章的大墨怪只会跳，不吐墨（一关只教「心、穿过它的排、跳」三件事）
    // 分身王：盘上没有它的小墨怪时吓得发抖（这时候打它掉 2 颗心）
    if (bs.kind === 'split') { bs.stun = !g.mon.some(Boolean); return; }
    const every = (bs.phase === 1 ? (bs.kind === 'eat' ? 3 : 4) : 3) - (bs.angry ? 1 : 0); // 第二阶段、发怒的头目动得更勤
    const nearCells = (want) => { const out = new Set(); g.bigCells.forEach((k) => { const r = Math.floor(k / 9), c = k % 9; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 9 && cc >= 0 && cc < 9 && want(b[rr * 9 + cc])) out.add(rr * 9 + cc); } }); return [...out]; };
    if (bs.kind === 'eat') {
      // 大馋嘴：上一手亮过牙印的两块，这一手啃掉；啃完嘴里塞满在嚼（这一手打它掉 2 颗心）
      if (bs.eatPlan) {
        const got = bs.eatPlan.filter((k) => b[k] === 1);
        got.forEach((k) => { b[k] = 0; g.color[k] = 0; g.gem[k] = 0; });
        if (got.length) { ev.bossEats = got; g.monStats.eats += got.length; drainPets({ t: 'eat' }, g.bigCells[0], ev); }
        bs.eatPlan = null; bs.stun = true; return;
      }
      bs.stun = false;
      if (bs.count % every === every - 1) {
        const pool = nearCells((v) => v === 1).sort((x, y) => crowd(b, y) - crowd(b, x)).slice(0, 6);
        if (pool.length) { const a = pick(pool); const rest = pool.filter((x) => x !== a); bs.eatPlan = rest.length ? [a, pick(rest)] : [a]; }
      }
      return;
    }
    // 大墨怪：吐墨。阶段一每 4 块、阶段二每 3 块吐一块；吐之前一手先冒黑泡（nextSpit）
    if (bs.nextSpit !== null) {
      const k = bs.nextSpit;
      bs.nextSpit = null;
      if (b[k] === 0) { inkAt(b, k); ev.bossSpit = k; bs.stun = true; g.spits = (g.spits || 0) + 1; return; }
    }
    bs.stun = false;
    if (bs.count % every === every - 1) {
      const near = nearCells((v) => v === 0);
      const pool = near.length ? near : [...Array(81).keys()].filter((k) => b[k] === 0);
      if (pool.length) bs.nextSpit = pick(pool);
    }
  }

  // 目标「抓光盘上的墨怪」：all = 1 表示抓光了；monLeft = 还剩几只（顶上显示这个数）
  function syncAll() { g.monLeft = g.mon.filter(Boolean).length + g.spawnQ.length + waveMonCount(); if ('all' in g.got) g.got.all = g.monLeft ? 0 : 1; }
  syncAll();
  g.place = (i, r, c) => {
    const p = g.hand[i];
    if (p && !g.over && p.special === 'skill') return useSkill(i, { r, c });
    if (!p || g.over || !core.canPlace(g.board, p, r, c)) return null;
    if (st.rush && !g.rushOK(i, r, c)) return null; // 0.9.21 冲锋关：只收「一放就消」的位置（小块塞进大空的一角不算，弹回去）
    const ci = g.handColor[i];
    const b = g.board.slice();
    const ev0 = {};
    const placed = p.cells.map(([dr, dc]) => (r + dr) * 9 + c + dc);
    placed.forEach((k) => { b[k] = 1; g.color[k] = ci; });
    // 0.9.20（Cc 定 A）：爆竹鼠啃过的块上留着一个点着的小爆竹，放下去，上下左右挨着的土堆全炸塌
    if (p.gnawed) { const blown = [...new Set(placed.flatMap(near4))].filter((x) => b[x] === 7); blown.forEach((x) => { b[x] = 0; g.color[x] = 0; }); if (blown.length) { ev0.blast = blown; g.monStats.dirt = (g.monStats.dirt || 0) + blown.length; } }
    const hg = g.handGem && g.handGem[i];
    if (hg) g.gem[placed[hg.cell]] = hg.kind;
    if (g.handGem) g.handGem[i] = null;
    g.hand[i] = null;
    g.moves++;
    const ev = Object.assign(ev0, { piece: p, r, c, placed, units: [], cells: [], collected: [], bigHits: [], petActs: [], energy: {}, sparks: [], fire: null, gained: p.cells.length, win: false, stunHit: !!(g.boss && g.boss.stun) });
    if (st.evolve) {
      const center = new Set(UNITS[22]);
      placed.forEach((k) => { if (center.has(k) && ci === g.evColor && !g.evLit.has(k)) { g.evLit.add(k); ev.lit = (ev.lit || []).concat(k); } });
      g.got.evolve = g.evLit.size;
    }
    // 1. 照常消
    const units = [];
    for (let u = 0; u < 27; u++) if (UNITS[u].every((k) => b[k]) && (!st.rush || UNITS[u].some((k) => b[k] === 1))) units.push(u); // 冲锋关：全是铜砖的排不消
    const colorsBefore = g.color.slice();
    let clearedCells = [];
    if (units.length) {
      const set = new Set();
      units.forEach((u) => { unitTouches(b, UNITS[u], ev); UNITS[u].forEach((k) => set.add(k)); });
      clearedCells = [...set].filter((k) => b[k] === 1 || b[k] === 8 || (IS_MON(b[k]) && !(g.mon[k] && g.mon[k].t === 'shell' && g.mon[k].hp > 0)));
      // 挑色怪：它在的那几排 / 大格里，有没有它那种颜色的方块
      const b0 = b.slice(); // 先拍一张：清的过程中格子会一格格变空
      const colorOk = (k, col) => units.some((u) => UNITS[u].includes(k) && UNITS[u].some((x) => b0[x] === 1 && g.color[x] === col));
      clearCells(b, [...set], ev, false, colorOk);
    }
    ev.units = units; ev.cells = clearedCells;
    if (units.length) g.got.lines = (g.got.lines || 0) + (st.rush ? 1 : units.length); // 冲锋关按「塞了几块」算 // 0.9.14：「消掉几排」的目标（第 1 关；不管带没带宠物都算）
    const ps = g.playStats; ps.units += units.length;
    if (units.length) { ps.clearMoves++; ps.dry = 0; if (!ps.firstClear) ps.firstClear = g.moves; } else { ps.dry++; ps.maxDry = Math.max(ps.maxDry, ps.dry); }
    // 2. 积蓄能量：每消一排 / 一个大格 +1；消掉它颜色的方块每 3 块再 +1。宠物格里已经有技能块时，最多攒到满。
    for (const pt of st.rush ? [] : g.team) {
      const mine = clearedCells.filter((k) => colorsBefore[k] === petDef(pt).color);
      const gain = units.length + (RULES.colorPer ? Math.floor(mine.length / RULES.colorPer) : 0); g.gainStats = g.gainStats || { u: 0, c: 0 }; g.gainStats.u += units.length; g.gainStats.c += RULES.colorPer ? Math.floor(mine.length / RULES.colorPer) : 0;
      if (gain) { pt.energy = Math.min(energyMax(g, pt) * 2 - 1, pt.energy + gain); ev.energy[pt.id] = gain; }
      if (mine.length) ev.sparks.push({ id: pt.id, cells: mine });
    }
    // 3. 能量满了：吐技能块到宠物格
    giveSkill(ev);
    if (!g.playStats.firstGoal && (ev.collected.some((x) => x.what !== 'bubble') || ev.bigHits.length)) g.playStats.firstGoal = Math.max(1, g.moves);
    // 4. 分身：这一手打中的分身怪 / 分身王，现在蹦出小墨怪
    while (g.spawnQ.length) { const sp = g.spawnQ.shift(); spawnAround(b, sp.k, sp.n, ev); }
    nextWave(b, ev); // 这一波抓光了：下一波掉下来（刚掉下来的这一手不动）
    // 5. 墨怪的回合（过关就不动了）
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
    if (done()) { ev.win = true; g.over = true; g.won = true; g.reason = 'win'; return ev; }
    if (st.rush) { rushAfter(ev, i); return ev; } // 冲锋关：补满、重挖，三块塞完整盘换新
    if (RULES.refill) { // 【实验】随用随补：用掉一块马上补一块（照样保证有活路）
      let d = g.diff(), q = null; const others = g.hand.slice(0, 3).filter(Boolean);
      for (let t = 0; t < 40; t++) { q = pickPiece(g.rand, d); if (core.solvable(g.board, others.concat(q))) break; d = Math.max(0, d - 0.08); q = null; }
      if (!q && core.anyPlacement(g.board, core.PIECES['1'])) q = core.PIECES['1'];
      if (q) { g.hand[i] = q; g.handColor[i] = g.pickColor(); g.handGem[i] = null; }
    }
    if (!g.hand.slice(0, 3).some(Boolean)) g.deal();
    rescue(ev);
    if (g.stuck()) { g.over = true; g.reason = 'stuck'; ev.stuck = true; }
    return ev;
  };
  // 宠物下一次要下手的地方（能量差 1 格时画面亮出来）
  g.petTarget = () => null; // 技能块由你自己放，没有「它要下手的地方」了
  g.skillCells = (pc, r, c) => { const pl = skillPlan(pc, { r, c }); return pl ? pl.cells.concat(pl.fill) : []; }; // 拖着技能块时，画面照这个亮
  g.skillBest = () => skillBest(g);
  // 「差一点」（0.9.4，检验报告 C10 / E3）：头目按打掉了几颗心算、抓光关按抓了几只算（原来按「打死了没有」算，头目、抓光关永远不说差一点）；门槛从七成收到八成
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
  g.goalLeft = () => core.goalLeft(g);
  return g;
}

// ---------- 机器人 ----------
function bestMove(g, skill) {
  const st = g.stage;
  const left = core.goalLeft(g);
  const cands = [];
  g.hand.forEach((p, i) => {
    if (!p || p.special) return;
    for (const [r, c] of core.placements(g.board, p)) {
      const placed = p.cells.map(([dr, dc]) => (r + dr) * 9 + c + dc);
      let v, board;
      if (p.special === 'fire') {
        const cells = (p.power || 9) >= 9 ? UNITS[18 + core.boxOf(r, c)] : crossCells(r, c);
        board = g.board.slice(); cells.forEach((k) => { if (EATABLE(board[k])) board[k] = 0; });
        v = cells.filter((k) => EATABLE(g.board[k])).length * 2 + cells.filter((k) => IS_MON(g.board[k])).length * 14 + (cells.some((k) => g.board[k] === 4) ? 16 : 0) + cells.filter((k) => g.board[k] === 5).length * 12 + core.evalBoard(board, null);
      } else {
        const res = core.placeAndClear(g.board, p, r, c);
        board = res.board;
        v = res.units.length * 9 + core.evalBoard(res.board, null);
        // 墨怪：甲壳怪敲一层也算进展；挑色怪要那排里有它的颜色；会还手的（啃、长墨、快爆）不管目标是什么都值得先打
        const ci0 = g.handColor[i];
        for (const k of res.cells) {
          const m = g.board[k] === 3 && g.mon[k];
          if (!m) continue;
          let hitV = 14;
          if (m.t === 'shell' && m.hp > 0) hitV = 7;
          if (m.t === 'color') {
            const ok = res.units.some((u) => UNITS[u].includes(k) && UNITS[u].some((x) => (placed.includes(x) ? ci0 : g.board[x] === 1 ? g.color[x] : -9) === m.col));
            hitV = ok ? 16 : 0;
          }
          v += left.monster > 0 || left.all > 0 ? hitV : 0;
          if (m.t === 'eat' || m.t === 'moss') v += 6;
          if (m.t === 'bomb') v += m.cd <= 3 ? 12 : 4;
        }
        if (left.boss > 0 && res.units.some((u) => UNITS[u].some((k) => g.board[k] === 4))) v += 16 + (g.boss && g.boss.stun ? 16 : 0);
        if (left.box > 0 && res.units.some((u) => UNITS[u].some((k) => g.board[k] === 2))) v += 16;
        if (left.rock > 0 || left.acts > 0) v += res.units.length * 3;
        for (const k of res.cells) if (g.gem[k] && left[core.GEMS[g.gem[k]].id] > 0) v += 14;
        if (left.bubble > 0) v += res.cells.filter((k) => g.bubble[k]).length * 8;
        const ci = g.handColor[i];
        if (g.team.some((pt) => PETS[pt.id].color === ci)) v += res.cells.length ? 2 : 0;
        if (st.evolve) {
          const center = new Set(UNITS[22]);
          if (ci === g.evColor) v += placed.filter((k) => center.has(k) && !g.evLit.has(k)).length * 7;
          else v -= placed.filter((k) => center.has(k) && !g.evLit.has(k)).length * 3;
        }
      }
      cands.push({ i, r, c, v, board });
    }
  });
  if (!cands.length) return null;
  cands.sort((a, b) => b.v - a.v);
  const top = cands.slice(0, 10);
  for (const m of top) {
    const rest = g.hand.filter((p, k) => p && !p.special && k !== m.i);
    if (rest.length && !core.solvable(m.board, rest)) m.v -= 100;
    else if (g.previewN && g.nextHand && rest.length < 3) { const look = rest.concat(g.nextHand.slice(0, Math.min(g.previewN, 3 - rest.length))); if (look.length > rest.length && !core.solvable(m.board, look)) m.v -= 60; } if (g.previewN && g.nextHand && RULES.previewPlan) { let bonus = 0; for (const q of g.nextHand.slice(0, g.previewN)) { let mx = 0; for (const [r2, c2] of core.placements(m.board, q)) { const u2 = core.placeAndClear(m.board, q, r2, c2).units.length; if (u2 > mx) mx = u2; } bonus += mx; } m.v += bonus * RULES.previewPlan; } // 看得见下一批：别把它堵死
  }
  top.sort((a, b) => b.v - a.v);
  const s = skill === undefined ? 1 : skill;
  if (s >= 1 || g.rand() < s) return top[0];
  return top[Math.min(top.length - 1, 1 + Math.floor(g.rand() * 4))];
}
function simulate(opts) {
  const o = Object.assign({ skill: 1, secPerMove: () => 3 }, opts);
  const g = createPetGame(o);
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

// 机器人用技能块：把每一种用法都试一遍，挑最值的。v ≥ 100 = 至少办成一件正经事（抓到墨怪 / 碎铁石 / 咬到头目 / 收到宝石 / 让本来消不掉的目标消掉）。
function skillBest(g) {
  const p = g.hand[3];
  if (!p) return null;
  const pet = petOf(p.pet), left = core.goalLeft(g), wantMon = left.monster > 0 || left.all > 0, b = g.board;
  const fitsNow = [0, 1, 2].some((i) => g.hand[i] && core.anyPlacement(b, g.hand[i]));
  const hands = [0, 1, 2].map((i) => g.hand[i]).filter(Boolean);
  const bossV = () => 100 * (g.boss && RULES.bossWeak[g.boss.kind] === pet.act ? RULES.bossWeakDmg : RULES.bossOtherDmg);
  let best = null; const seen = new Set();
  const offer = (tg, v) => { if (!best || v > best.v) best = Object.assign({ v }, tg); };
  const scoreHit = (cells, nb) => { // 技能块碰到的格子值多少；顺手把「打完以后的盘面」写进 nb
    let v = 0, boss = false;
    for (const x of cells) {
      const bv = b[x];
      if (bv === 3 && g.mon[x]) { if (isCounter(g.mon[x], pet)) { v += (wantMon ? 100 : 30) + (g.mon[x].t !== 'ink' ? 20 : 0); nb[x] = 0; } }
      else if (bv === 5) { v += left.rock > 0 ? 100 : 3; if (g.rockHp[x] <= (pet.act === RULES.rockNemesis ? RULES.rockDmg : 1)) nb[x] = 0; }
      else if (bv === 4) boss = true;
      else if (bv === 1) { v += (g.gem[x] && left[core.GEMS[g.gem[x]].id] > 0 ? 100 : 0) + (g.color[x] === -2 ? 2 : 0.5); nb[x] = 0; }
    }
    if (boss && g.bigHp > 0 && !p.bossBit) v += bossV();
    return v;
  };
  const unstick = (nb, hs) => (!fitsNow && (hs || hands).some((h) => core.anyPlacement(nb, h)) ? 1000 : 0);
  if (p.kind === 'peck' || p.kind === 'fire' || p.kind === 'gnaw') {
    for (let k = 0; k < 81; k++) {
      const pl = g.skillPlan({ r: Math.floor(k / 9), c: k % 9 });
      if (!pl) continue;
      const key = pl.cells.join(','); if (seen.has(key)) continue; seen.add(key);
      const nb = b.slice(); const v = scoreHit(pl.cells, nb);
      offer({ r: Math.floor(k / 9), c: k % 9 }, v + unstick(nb) + (fitsNow ? 0 : core.evalBoard(nb, null) * 0.01));
    }
  }
  if (p.kind === 'silk') {
    for (let k = 0; k < 81; k++) {
      const pl = g.skillPlan({ r: Math.floor(k / 9), c: k % 9 });
      if (!pl) continue;
      const nb = b.slice(); let v = scoreHit(pl.cells, nb);
      pl.fill.forEach((x) => (nb[x] = 1));
      const units = []; for (let u = 0; u < 27; u++) if (UNITS[u].every((x) => nb[x])) units.push(u);
      const set = new Set(); units.forEach((u) => UNITS[u].forEach((x) => set.add(x)));
      for (const x of set) {
        if (nb[x] === 3 && g.mon[x]) { const m = g.mon[x]; const ok = m.t === 'color' ? false : !(m.t === 'shell' && m.hp > 0); v += wantMon ? (ok ? 100 : m.t === 'shell' ? 40 : 0) : 10; if (ok) nb[x] = 0; }
        else if (nb[x] === 1) { if (g.gem[x] && left[core.GEMS[g.gem[x]].id] > 0) v += 100; nb[x] = 0; }
        else if (nb[x] === 4 && left.boss > 0) v += 100; else if (nb[x] === 2 && left.box > 0) v += 100;
      }
      v += units.length * 30 - (units.length ? 0 : pl.fill.length * 3); // 补了没消掉：白占地方
      offer({ r: Math.floor(k / 9), c: k % 9 }, v + unstick(nb));
    }
  }
  if (p.kind === 'gnaw' && RULES.handMode === 'gnaw') {
    // 啃手上的块：① 它本来放不下，啃一口就放得下；② 啃一口以后正好能消掉一排带墨怪的（原来那块办不到）
    const catchOf = (q) => { let m = 0; for (const [r, c] of core.placements(b, q)) { const res = core.placeAndClear(b, q, r, c); if (!res.units.length) continue; let n = 0; for (const x of res.cells) if (b[x] === 3) n++; for (const u of res.units) if (UNITS[u].some((x) => (b[x] === 4 && left.boss > 0) || (b[x] === 2 && left.box > 0))) n++; if (n + res.units.length * 0.1 > m) m = n + res.units.length * 0.1; } return m; };
    [0, 1, 2].forEach((i) => {
      const h = g.hand[i]; if (!h) return;
      const fit0 = core.anyPlacement(b, h), c0 = fit0 ? catchOf(h) : 0;
      h.cells.forEach((_, j) => {
        const q = gnawPiece(h, j); if (q === undefined) return;
        let v = 0;
        if (!q) v = fitsNow ? 0 : 20; // 整块吃掉
        else { const fit1 = core.anyPlacement(b, q); if (!fit0 && fit1) v = fitsNow ? 40 : 1000; else if (!fit0) v = fitsNow ? 0 : 10 - q.cells.length; if (fit1 && (wantMon || left.boss > 0 || left.box > 0)) { const c1 = catchOf(q); if (c1 >= 1 && c1 > c0 + 0.5) v += 100 + (c1 - c0) * 10; } }
        if (v > 0) offer({ hand: i, cell: j }, v);
      });
    });
  }
  if (p.kind === 'swap' || (p.kind === 'gnaw' && RULES.handMode === 'swap')) [0, 1, 2].forEach((i) => { const h = g.hand[i]; if (!h) return; const fit0 = core.anyPlacement(b, h); offer({ hand: i }, fit0 ? 1 + h.cells.length * 0.1 : fitsNow ? 40 : 1000); }); // 换掉放不下的那块
  return best;
}
// 有正经事可办就用；三块都放不下，也用（腾地方）
function useSkillIfGood(g) {
  if (!g.hand[3] || g.over) return false;
  const s = skillBest(g);
  if (!s) return false;
  const fits = [0, 1, 2].some((i) => g.hand[i] && core.anyPlacement(g.board, g.hand[i]));
  if (s.v >= 100 || !fits) return !!g.useSkill(s);
  return false;
}
module.exports = { waveTotalOf, petGain, lookOf, startOf, SKILL, skillKind, skillN, gnawPiece, pickPiece, RULES, isCounter, bestPetFor, skillCells, skillBest, useSkillIfGood, tierOf, petDesc, CHARGE_TAG, CHARGE_TEXT, PETS, FIRE, COLOR_NAME, IS_MON, MON, createPetGame, bestMove, simulate, energyMax };
