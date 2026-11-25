// 关卡生成器 + 手数上限自动定：照下面的「配方」生成每一波墨怪的位置，用机器人量出手数上限，写出 ../petlevels_counter.js。
// 用法：node build_levels.js [每关量几局=60] [只看不写=0]
// 配方 = 第一波的盘面（手摆）+ 后面每一波有哪些墨怪（位置由生成器按「互相不挨着」摆）+ 这关归谁 + 难度档。
// 手数上限怎么定：带对口宠物的「一般人」有 pb 的机会打得完，带不对口宠物的只有 pw 的机会（两个数取大的那个上限）。
const fs = require('fs');
const PG = require('./petgame_counter.js'), FM = require('./fm_counter.js'), core = require('../../js/core.js');
const N = +process.argv[2] || 60, DRY = !!+process.argv[3];
const DADD = 0.15; // 第 11 关起、不点名的关：大块多发一点（带对口宠物的人技能块来得勤，扛得住；带错的扛不住）
if (process.env.RESCUE) PG.RULES.rescue = process.env.RESCUE;
const NAME = { tongque: '铜雀', baozhu: '爆竹鼠', modou: '墨斗蚕', qilin: '火麒麟' };
// 难度档：[对口的打得完的机会, 不对口的打得完的机会]
const SLACK = 1.15;
const CAP = 1.5; // 为了让不对口的也有机会，上限最多放宽到「对口的够用」的 1.5 倍
const TIER = { 易: [0.97, 0.7], 普通: [0.95, 0.55], 难: [0.9, 0.45], 超难: [0.85, 0.4], 头目: [0.88, 0.4] };
// 聪明玩家打到这一关时，各只宠物大概几级（照 campaign_counter.js 量到的平均等级，量完回填）
const lvAt = (i) => ({ tongque: i < 5 ? 1 : i < 9 ? 2 : i < 14 ? 3 : i < 24 ? 4 : 5, baozhu: i < 13 ? 2 : i < 18 ? 3 : i < 26 ? 4 : 5, modou: i < 19 ? 2 : i < 25 ? 3 : 4, qilin: i < 23 ? 2 : 3 });
const E = '.........';
// waves：后面几张盘 = 把第一张盘翻一下（'h' 左右翻 / 'v' 上下翻 / 't' 转 90°）+ 换几种怪（{ m: 'J' } = 小墨怪换成跳跳怪）。也可以直接写一张盘。
const SPECS = [
  // ===== 第一章「工坊后院」：只有铜雀，一样一样学 =====
  { note: '学拖块、消掉。盘面没动。过关就送铜雀（原来第 3 关才送）。', tier: null, st: { goal: { score: 90 }, d: 0, colors: [3, 2, 1], gift: 'tongque', board: ['....#....', '.#.....#.', E, '#.......#', '#.......#', '#.......#', E, '.#.....#.', '....#....'] } },
  { note: '铜雀登场（充得特别快）+ 小墨怪：学「能量满了它吐一块技能块，拖到墨怪旁边」。小墨怪自己消也抓得到。', tier: null, only: 'tongque', st: { goal: {}, d: 0, colors: [0, 3, 2], lend: 1, fastCharge: true, intro: 'pet', board: [E, E, '###m..###', E, '.#m#.#m#.', E, '###...###', 'm#.....#m', '###...###'] } },
  { note: '宝石 5 颗，全摆在盘上。盘面没动。', tier: null, st: { goal: { b: 5 }, d: 0, intro: 'gem', colors: [0, 3, 2], board: [E, '.##b.b##.', E, E, '###b..###', E, E, 'b##...##b', E] } },
  { note: '第一次「一关两张盘」：这张盘的墨怪抓光，换下一张。金色的块喂铜雀。', tier: null, best: 'tongque', st: { goal: {}, d: 0.1, colors: [0, 0, 3, 2], intro: 'wave', board: [E, '###...###', '....m....', '..m...m..', E, '..m...m..', '....m....', '###...###', E] }, waves: [['t', {}]] },
  { note: '第一次限手数（给得松）：学「顶上的数字是还剩几手」。三张盘。', tier: '易', best: 'tongque', st: { goal: {}, d: 0.15, colors: [0, 3, 2], intro: 'moves', board: ['###...###', E, '.m.....m.', E, '##m...m##', E, E, E, '###...###'] }, waves: [['v', {}], ['t', {}]] },
  { note: '两种宝石各 4 颗，一半长在发下来的块上。盘面没动，不限手数（喘气）。', tier: null, st: { goal: { b: 4, g: 4 }, d: 0.1, intro: 'gempiece', gemRate: 0.4, colors: [0, 3, 2], board: [E, E, '###b..###', E, 'b#.....#g', E, '###..g###', E, E] } },
  { note: '机关匣收 3 次。盘面没动，不限手数。', tier: null, st: { goal: { box: 3 }, d: 0.05, intro: 'box', colors: [0, 3, 2], board: ['....#....', '....#....', E, '....#....', '##.#M#.##', '....#....', E, '....#....', '....#....'] } },
  { note: '满盘开局（难）：三张盘，小墨怪一共 12 只。', tier: '难', best: 'tongque', hard: 1, st: { goal: {}, d: 0.25, luck: 0.8, colors: [0, 3, 1], board: ['#..###..#', E, '.#m#.#m..', E, E, E, '..m#.#m#.', E, '#..###..#'] }, waves: [['h', {}], ['t', {}]] },
  { note: '铁石（超难）：你消不掉，只有技能块打得碎。两张盘，每张 4 块铁石 + 4 只小墨怪。', tier: '超难', best: 'tongque', hard: 2, st: { goal: {}, d: 0.2, luck: 0.8, colors: [0, 3, 2], intro: 'rock', board: [E, '..R...R..', '###...###', '.m.....m.', E, '.m.....m.', '###...###', '..R...R..', E] }, waves: [['t', {}]] },
  { note: '头目：大墨怪 12 颗心（谁的技能块碰到它都掉 1 颗；你自己消，它晕着掉 2 颗）。过关送爆竹鼠。', tier: '头目', best: 'tongque', st: { goal: { boss: 1 }, intro: 'boss', colors: [0, 1, 3], gift: 'baozhu', bigHp: 12, d: 0.15, luck: 0.9, board: [E, '.#.....#.', E, E, '...KK....', '...KK....', E, '.#.....#.', E] } },
  // ===== 第二章「水车坊」：带谁要挑了 =====
  { note: '爆竹鼠登场（借你 2 级的、充得特别快）：铁石三块一堆，它的爆竹一炸一圈、一下两层。两张盘。', tier: '易', only: 'baozhu', st: { goal: {}, d: 0.12, lend: 2, fastCharge: true, colors: [1, 0, 3], intro: 'baozhu', board: [E, '###...###', 'RR.......', 'R......m.', E, '.m......Q', '.......QQ', '###...###', E] }, waves: [['h', {}]] },
  { note: '甲壳怪第一次出场：铜雀的技能块一啄，连甲带怪抓走。三张盘，第三张有两层的。', tier: '普通', best: 'tongque', st: { goal: {}, d: 0.12, colors: [0, 3, 2], intro: 'shell', board: [E, E, '##A#..###', E, '.##.m.##.', E, '###..#A##', E, E] }, waves: [['v', {}], ['h', { m: 'B' }]] },
  { note: '点名铜雀：甲壳怪三张盘，越来越厚。', tier: '普通', only: 'tongque', st: { goal: {}, d: 0.1, colors: [0, 3, 2], board: ['###...###', E, '#.A...A.#', E, '#.m.B.m.#', E, '#.......#', E, '.#.....#.'] }, waves: [['v', {}], ['h', { m: 'A' }]] },
  { note: '点名爆竹鼠：跳跳怪第一次出场，爆竹一炸一圈，它没地方跳。三张盘。', tier: '普通', only: 'baozhu', st: { goal: {}, d: 0.15, colors: [1, 0, 3], intro: 'jumper', board: [E, '.J.....m.', '###...###', E, E, E, '###...###', '.m.....J.', E] }, waves: [['h', {}], ['v', { m: 'J' }]] },
  { note: '难（组合）：第一道真选择题。跳跳怪 + 铁石，都归爆竹鼠。两张盘。', tier: '难', best: 'baozhu', hard: 1, st: { goal: {}, d: 0.2, luck: 0.8, colors: [1, 0, 3], board: [E, '.J.....m.', '###...###', 'R...m...R', 'R#..J..#R', E, '###...###', '.m.....J.', E] }, waves: [['h', { m: 'J' }]] },
  { note: '爽关：12 只小墨怪一口气抓，两张盘。带谁都行。过关送墨斗蚕。', tier: '易', st: { goal: {}, d: 0.1, colors: [0, 1, 3], gift: 'modou', board: ['m###.###m', '#m.....m#', '##.....##', '###m.m###', E, '###m.m###', '##.....##', '#m.....m#', 'm###.###m'] }, waves: [['t', {}]] },
  { note: '墨斗蚕登场（借你 2 级的、充得特别快）：小墨怪斜着排，它的丝斜着缠，一下缠两只。两张盘。', tier: '易', only: 'modou', st: { goal: {}, d: 0.08, lend: 2, fastCharge: true, colors: [2, 0, 3], intro: 'modou', board: [E, '.m...m...', '###...###', '...m...m.', E, '.m...m...', '###...###', '...m...m.', E] }, waves: [['h', {}]] },
  { note: '馋嘴怪第一次出场：归墨斗蚕。三张盘。', tier: '普通', best: 'modou', st: { goal: {}, d: 0.08, colors: [0, 2, 3], intro: 'eat', board: [E, '.m.....m.', '##E#..#..', E, '.#.#m#.#.', E, '..#..#m##', E, E] }, waves: [['v', {}], ['h', { E: '2' }]] },
  { note: '超难（组合）：铁石三块一堆（两层）+ 跳跳怪，都归爆竹鼠。两张盘。', tier: '超难', best: 'baozhu', hard: 2, st: { goal: {}, d: 0.25, luck: 0.8, colors: [1, 0, 3], board: ['QQ...#.#.', 'Q#....J..', '.....#.#.', '.m.......', '....#..m.', E, '.#.#.....', '..J...#QQ', '.#.#...#Q'] }, waves: [['h', {}]] },
  { note: '头目：大馋嘴 16 颗心，怕墨斗蚕（它的技能块碰一下 3 颗心，别的 1 颗）。过关送火麒麟。', tier: '头目', best: 'modou', st: { goal: { boss: 1 }, colors: [1, 0, 3], gift: 'qilin', bigHp: 16, d: 0.2, luck: 0.8, bossKind: 'eat', intro: 'boss2', board: [E, '.#.....#.', E, '..#...#..', '...KK....', '...KK....', '..#...#..', '.#.....#.', E] } },
  // ===== 第三章「染坊」：四只宠物各有各的活 =====
  { note: '火麒麟登场（借你 2 级的、充得特别快）：小墨怪竖着排，它的火竖着烧。两张盘。', tier: '易', only: 'qilin', st: { goal: {}, d: 0.1, lend: 2, fastCharge: true, colors: [5, 0, 3], intro: 'qilin', board: ['..m......', '.##......', '..m.....#', '.##...m..', E, '......m#.', '#....#...', '...###m..', 'm..#.#...'] }, waves: [['h', {}]] },
  { note: '挑色怪（红）第一次出场：归爆竹鼠。三张盘。', tier: '普通', best: 'baozhu', st: { goal: {}, d: 0.12, colors: [1, 0, 3], intro: 'color', board: [E, E, '##1#..###', E, '.#m...m#.', E, '###..#1##', E, E] }, waves: [['v', {}], ['h', { m: '1' }]] },
  { note: '点名墨斗蚕：墨苔怪第一次出场 + 绿色挑色怪。三张盘。', tier: '普通', only: 'modou', st: { goal: {}, d: 0.08, colors: [2, 0, 3], intro: 'moss', board: [E, E, '##G#..#..', E, '.2..m..m.', E, '..#..#m##', E, E] }, waves: [['v', {}], ['h', { m: '2' }]] },
  { note: '炸弹怪第一次出场 + 橙色挑色怪：都归火麒麟。三张盘。', tier: '普通', best: 'qilin', st: { goal: {}, d: 0.1, colors: [5, 0, 3], intro: 'bomb', board: ['.....5...', '.##......', '.#T#....#', '.##......', E, '......##.', '#....#T#.', '...###...', 'm..#m#...'] }, waves: [['h', {}], ['v', { m: '5' }]] },
  { note: '难（组合）：铜雀 / 金翅雀的主场。金色挑色怪 + 甲壳怪。三张盘。', tier: '难', best: 'tongque', hard: 1, st: { goal: {}, d: 0.15, luck: 0.9, colors: [0, 3, 1], board: ['##.....##', '#.0.m.0.#', E, '.A..B..A.', E, '.m.....m.', E, '#.......#', '##.....##'] }, waves: [['v', {}], ['t', {}]] },
  { note: '墨苔怪 + 馋嘴怪 + 绿色挑色怪：都归墨斗蚕。三张盘。', tier: '普通', best: 'modou', st: { goal: {}, d: 0.05, colors: [2, 0, 3], board: [E, '.#2...m#.', '##G#.#E.#', E, '.m..#..2.', E, '#.m#.#2##', '.#.....#.', E] }, waves: [['h', {}], ['v', {}]] },
  { note: '点名爆竹鼠：分身怪第一次出场 + 跳跳怪。三张盘。', tier: '普通', only: 'baozhu', st: { goal: { all: 1 }, d: 0.12, colors: [1, 0, 3], intro: 'split', board: [E, '.J.......', '##S#..###', E, '...#m#...', E, '###..#S##', E, E] }, waves: [['h', {}], ['v', { m: 'J' }]] },
  { note: '炸弹怪 + 橙色挑色怪：都归火麒麟。三张盘。', tier: '普通', best: 'qilin', st: { goal: {}, d: 0.15, colors: [5, 2, 3], board: ['#.......#', '.#.....#.', '..#.T.#..', E, '.5..m..5.', E, '..#.T.#..', '.#.....#.', '#.......#'] }, waves: [['t', {}], ['t', { m: 'T' }]] },
  { note: '超难（组合）：分身怪 + 跳跳怪 + 两堆铁石，都归爆竹鼠。两张盘。', tier: '超难', best: 'baozhu', hard: 2, st: { goal: { all: 1 }, d: 0.25, luck: 0.8, colors: [0, 1, 3], board: ['RR......#', 'R#.......', '...#S#...', '.#.....#.', '..J...J..', '.#.....#.', '...#S#...', '.......#Q', '#......QQ'] }, waves: [['v', { J: '1' }]] },
  { note: '头目：分身王 18 颗心，怕爆竹鼠。', tier: '头目', best: 'baozhu', st: { goal: { boss: 1 }, colors: [1, 0, 3], bigHp: 18, d: 0.2, luck: 0.8, bossKind: 'split', intro: 'boss3', board: [E, '.#.....#.', E, '..#...#..', '...KK....', '...KK....', '..#...#..', '.#.....#.', E] } },
];
// 把一张盘翻一下、换几种怪
function tf(board, flip, swap) {
  let g = board.map((r) => r.split(''));
  if (flip === 'h') g = g.map((r) => r.slice().reverse());
  else if (flip === 'v') g = g.slice().reverse();
  else if (flip === 't') g = g[0].map((_, c) => g.map((r) => r[c]));
  return g.map((r) => r.map((ch) => (swap && swap[ch]) || ch).join(''));
}
const isMon = (ch) => 'mABCJEGTS0123456'.includes(ch);
function build(sp, i) {
  const st = Object.assign({}, sp.st, { goal: Object.assign({}, sp.st.goal) });
  if (sp.waves) st.waves = sp.waves.map((w) => (typeof w[0] === 'string' && w[0].length === 9 ? w : tf(st.board, w[0], w[1])));
  const all = st.board.concat(...(st.waves || [])).join('').split('');
  const mons = all.filter(isMon).length, rocks = all.filter((ch) => ch === 'R' || ch === 'Q').length;
  const plain = !st.goal.all && !st.goal.boss && !('b' in st.goal) && !st.goal.box && !st.goal.score;
  if (mons && plain) st.goal.monster = mons;
  if (rocks && !st.goal.boss) st.goal.rock = rocks;
  if (sp.only) st.only = sp.only; else if (sp.best) st.best = sp.best;
  if (sp.hard) st.hard = sp.hard;
  if (DADD && i >= 10 && !sp.only && sp.best) st.d = +((st.d || 0) + DADD).toFixed(2);
  return st;
}
const quant = (arr, q) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * q))]; };
function runs(st, team, sk) { const out = []; for (let s = 1; s <= N; s++) { const g = FM.play(st, team, s * 7919 + 3, sk); out.push(g.won ? g.moves : Infinity); } return out; }
const rate = (arr) => { const w = arr.filter((x) => x < Infinity); return { win: Math.round(w.length / arr.length * 100), moves: w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0 }; };
function stats(st, team, sk) {
  const wins = [], losses = [];
  for (let s = 1; s <= N; s++) { const g = FM.play(st, team, s * 7919 + 3, sk); (g.won ? wins : losses).push(g); }
  const avg = (a, f) => (a.length ? a.reduce((x, g) => x + f(g), 0) / a.length : 0);
  const dr = wins.map((g) => g.playStats.maxDry).sort((a, b) => a - b), nearN = losses.filter((g) => g.nearMiss()).length;
  return { win: Math.round(wins.length / N * 100), moves: avg(wins, (g) => g.moves), losses: losses.length, nearN, near: losses.length ? Math.round(nearN / losses.length * 100) : 0, dry: avg(wins, (g) => g.playStats.maxDry), dryP90: dr[Math.floor(dr.length * 0.9)] || 0, firstClear: avg(wins, (g) => g.log.firstClear) };
}
const out = [], info = [];
SPECS.forEach((sp, i) => {
  const st = build(sp, i), L = lvAt(i);
  const bestId = sp.only || sp.best || 'tongque';
  const wrongId = bestId === 'tongque' ? 'baozhu' : 'tongque';
  const team = (id) => (i === 0 ? [] : [{ id, lv: Math.max(L[id], sp.only && st.lend ? st.lend : 0) }]);
  const A = stats(st, team(bestId), 8), A7 = stats(st, team(bestId), 7);
  let line = `第${i + 1}关 ${sp.tier || ''} ${sp.only ? '点名' : '带'}${NAME[bestId]}${L[bestId]}：一般人 ${A.win}% ${A.moves.toFixed(0)}手 生手 ${A7.win}% ${A7.moves.toFixed(0)}手｜输的局差一点 ${A.near}%/${A7.near}% 最长没消 ${A.dry.toFixed(1)}（一成的局 ≥${A.dryP90}）`;
  const rec = { lv: i + 1, tier: sp.tier, best: bestId, only: !!sp.only, bestWin: A.win, bestMoves: +A.moves.toFixed(0), bestWinNovice: A7.win, bestMovesNovice: +A7.moves.toFixed(0), near: A.near, nearNovice: A7.near, losses: A.losses, lossesNovice: A7.losses, nearN: A.nearN, nearNNovice: A7.nearN, dry: +A.dry.toFixed(1), dryP90: A.dryP90, firstClear: +A.firstClear.toFixed(1) };
  if (!sp.only && i >= 10 && (sp.best)) {
    const B = stats(st, team(wrongId), 8), B7 = stats(st, team(wrongId), 7);
    line += `｜不对口（${NAME[wrongId]}${L[wrongId]}）一般人 ${B.win}% ${B.moves.toFixed(0)}手 生手 ${B7.win}% ${B7.moves.toFixed(0)}手`;
    Object.assign(rec, { wrong: wrongId, wrongWin: B.win, wrongMoves: +B.moves.toFixed(0), wrongWinNovice: B7.win });
  }
  console.log(line);
  out.push({ sp, st, rec }); info.push(rec);
});
if (!DRY) {
  const head = fs.readFileSync(__dirname + '/levels_head.txt', 'utf8');
  const fmt = (st) => {
    const keys = Object.keys(st).filter((k) => k !== 'board' && k !== 'waves');
    let s = '    ' + keys.map((k) => k + ': ' + JSON.stringify(st[k]).replace(/"([a-zA-Z]+)":/g, '$1: ').replace(/"/g, "'").replace(/,/g, ', ').replace(/\{/g, '{ ').replace(/\}/g, ' }')).join(', ') + ',\n';
    s += "    board: ['" + st.board.join("', '") + "'],\n";
    if (st.waves) s += '    waves: [\n' + st.waves.map((w) => "      ['" + w.join("', '") + "'],\n").join('') + '    ],\n';
    return s;
  };
  let body = head + 'module.exports = [\n';
  out.forEach(({ sp, st, rec }, i) => {
    if (i === 0) body += '  // ===== 第一章「工坊后院」：只有铜雀，一样一样学 =====\n';
    if (i === 10) body += '  // ===== 第二章「水车坊」：会跑、会啃你的块的墨怪；手上不止一只宠物了，带谁要挑 =====\n';
    if (i === 20) body += '  // ===== 第三章「染坊」：挑颜色的、长墨的、会爆的、会分身的；四只宠物各有各的活 =====\n';
    let m = `带对口的：一般人 ${rec.bestWin}% 过、平均 ${rec.bestMoves} 手；生手 ${rec.bestWinNovice}%` + (rec.wrong ? `。带${NAME[rec.wrong]}：一般人 ${rec.wrongWin}%、生手 ${rec.wrongWinNovice}%` : '') + '。';
    body += `  { // ${i + 1} ${sp.note}\n    //    ${m}\n` + fmt(st) + '  },\n';
  });
  body += '];\n\n// 进化关的盘面：正中间空着，四周散放一些，只发宠物颜色、旧铁和蓝三种块（照抄 js/petlevels.js）\nmodule.exports.evolveStage = (petId, color) => ({\n  goal: { evolve: 9 }, d: 0.1, evolve: { pet: petId }, team: null, colors: [color, -1, 3],\n  board: [\'#.......#\', \'.........\', \'..#...#..\', \'.........\', \'.........\', \'.........\', \'..#...#..\', \'.........\', \'#.......#\'],\n});\n';
  fs.writeFileSync(__dirname + '/../petlevels_counter.js', body);
  fs.mkdirSync(__dirname + '/results', { recursive: true });
  fs.writeFileSync(__dirname + '/results/build_levels.json', JSON.stringify(info, null, 1));
}
