// 段 3「关卡」规则测试（../九宫捉妖_段3关卡细设计_Fable_20261128.md 第五节）：不开画面，直接调规则层。用法：node test/rules_stage3.js
// 这一份管：开局先演一次（T310–T317）、存盘恢复的规则层（T360、T361、T363–T365）；后面几步再往里加关卡表、流程、请帮手的测试
const { PG, core, CELL, ok, t, done, K } = require('./rules_lib.js');
const PLV = require('../js/petlevels.js');
const E = '.........';
// 「开局先演」的 7 关：关卡表换成新 20 关以前，用附录 B 的盘面自己摆（换表以后直接读关卡表）
const FIX = {
  4: { goal: { monster: 5 }, teach: 1, d: 0.04, crawl: 3, colors: [0, 3, 2], firstAct: { kind: 'crawl', from: [1, 2], to: [2, 2] }, board: [E, '##m###.##', E, '.##...##.', '.###m###.', E, E, '##.###m##', E], waves: [[E, E, E, '.....m...', E, E, E, E, '..m......']] },
  8: { goal: { monster: 6 }, teach: 1, d: 0.1, crawl: 3, colors: [0, 3, 2], firstAct: { kind: 'blocked' }, board: ['...###...', '...#m#...', '...##Z...', '.#.....#.', '###m#.###', E, E, '#m###.###', '........Z'], waves: [[E, E, E, '...m.....', E, E, E, E, '......m..'], [E, E, '.m.......', E, E, E, E, E, E]] },
  10: { goal: { boss: 1 }, d: 0.1, bigHp: 9, bossKind: 'spit', bossEvery: 3, bossNoSpit: true, colors: [0, 3, 2], firstAct: { kind: 'jump', to: [4, 3] }, board: ['KK.......', 'KK#...#..', '.......Z.', '..###....', '..#..#...', '..#..#...', '...##....', '..#...#..', 'Z........'] },
  12: { goal: { monster: 6 }, teach: 1, d: 0.05, crawl: 3, colors: [1, 0, 3], firstAct: { kind: 'blocked' }, board: ['...###...', '...#m#...', '...##D...', '.#.....#.', '###m#.###', E, E, '##.###m##', 'D........'], waves: [[E, E, E, '....m....', E, E, E, E, '..m......'], [E, E, '.m.......', E, E, E, E, E, E]] },
  13: { goal: { monster: 6 }, teach: 1, d: 0.12, crawl: 3, colors: [1, 0, 3], firstAct: { kind: 'crawl', from: [1, 2], to: [2, 2] }, board: [E, '##G###.##', E, '.##..###.', '.##m###..', E, E, '#.###G##.', E], waves: [[E, E, E, '....m....', E, E, E, E, '..G......'], [E, E, E, E, E, '......m..', E, E, E]] },
  17: { goal: { monster: 7 }, teach: 1, d: 0.08, crawl: 3, colors: [1, 0, 3], firstAct: { kind: 'mud', at: [3, 6] }, board: [E, '##m###.##', E, '......N..', '.###m###.', E, E, '##.###m##', E], waves: [[E, E, E, E, E, '.N.......', E, E, '....m....'], [E, '.......m.', E, E, E, E, E, E, E]] },
  20: { goal: { boss: 1 }, d: 0.03, bigHp: 9, bossKind: 'mud', bossEvery: 3, bossNoSpit: true, bossMud: true, colors: [1, 0, 3], firstAct: { kind: 'bossMud' }, board: ['D........', E, E, E, '...KK....', '...KK....', E, E, '........D'] },
};
const ACT = [4, 8, 10, 12, 13, 17, 20];
const stageOf = (n) => (PLV[n - 1] && PLV[n - 1].firstAct ? PLV[n - 1] : FIX[n]);
const game = (n, o) => PG.createPetGame(Object.assign({ stage: stageOf(n), team: [{ id: 'tongque', lv: 2 }], seed: 7 }, o || {}));
const fp = (g) => JSON.stringify([g.board, g.color, g.hand, g.mon, g.boss, g.bigCells, g.moves, g.team]);

// ---------- 开局先演一次（规则 4）----------
t('T310', () => {
  const g = game(4), ev = g.openingAct();
  ok(ev && ev.opening === 'crawl' && g.board[K(1, 2)] === CELL.EMPTY && g.board[K(2, 2)] === CELL.MON && g.mon[K(2, 2)] && g.mon[K(2, 2)].t === 'ink' && !g.mon[K(1, 2)], 'T310 第 4 关开局先演：第 2 排第 3 列那只爬到第 3 排第 3 列（ev.crawl ' + JSON.stringify(ev && ev.crawl) + '）');
  ok(g.moves === 0, 'T310 演完手数还是 0');
  const before = fp(g), ev2 = g.openingAct();
  ok(ev2 === null && fp(g) === before, 'T310 再调一次：什么都不变（返回 null）');
});
t('T311', () => {
  const g = game(13), ev = g.openingAct();
  ok(g.board[K(2, 2)] === CELL.MON && g.mon[K(2, 2)].t === 'moss' && g.board[K(1, 2)] === CELL.BLOCK && g.color[K(1, 2)] === -2 && ev.moss && ev.moss.length === 1, 'T311 第 13 关：墨苔怪到了第 3 排第 3 列，原地是一块墨（颜色 -2）');
  ok(g.monStats.moss === 0 && !g.monStats.crawls, 'T311 开局这一下不算进「墨苔怪留了几次墨」（monStats.moss = ' + g.monStats.moss + '）');
});
t('T312', () => {
  let good = 0, tried = 0;
  for (let s = 1; s <= 20; s++) {
    const g = game(17, { seed: s }), sizes0 = g.hand.slice(0, 3).map((p) => p.cells.length), ev = g.openingAct();
    if (!ev.mudSpit) continue; tried++;
    const slot = ev.mudSpit[0].slot, p = g.hand[slot], m = g.mon[K(3, 6)];
    const others = [0, 1, 2].filter((j) => j !== slot).every((j) => !g.hand[j].mudded);
    if (p.mudded && p.cells.length === sizes0[slot] + 1 && others && m && m.t === 'sticky' && m.cd === PG.MON.sticky.cd) good++;
  }
  ok(tried >= 18 && good === tried, 'T312 第 17 关 20 个种子：手上正好一块多了一格、记着沾过泥，那只粘墨怪的倒数回到 4（吐成 ' + tried + ' 局，对的 ' + good + ' 局）');
});
t('T313', () => {
  let good = 0, tried = 0;
  for (let s = 1; s <= 20; s++) {
    const g = game(20, { seed: s }), sizes0 = g.hand.slice(0, 3).map((p) => p.cells.length), ev = g.openingAct();
    if (!ev.mudSpit) continue; tried++;
    const slot = ev.mudSpit[0].slot;
    if (g.hand[slot].mudded && g.hand[slot].cells.length === sizes0[slot] + 1 && g.boss.mudCd === 3 && [0, 1, 2].filter((j) => g.hand[j].mudded).length === 1) good++;
  }
  ok(tried >= 18 && good === tried, 'T313 第 20 关：手上正好一块多了一格，泥沼怪的倒数回到 3（吐成 ' + tried + ' 局，对的 ' + good + ' 局）');
});
t('T314', () => {
  const g = game(10), b0 = g.board.slice(), ev = g.openingAct(), want = [K(4, 3), K(4, 4), K(5, 3), K(5, 4)];
  const ring = [K(3, 2), K(3, 3), K(3, 4), K(4, 2), K(4, 5), K(5, 2), K(5, 5), K(6, 3), K(6, 4)];
  ok(JSON.stringify(g.bigCells) === JSON.stringify(want) && want.every((k) => g.board[k] === CELL.BOSS), 'T314 第 10 关：头目的 4 格在盘中间');
  ok([K(0, 0), K(0, 1), K(1, 0), K(1, 1)].every((k) => g.board[k] === CELL.EMPTY), 'T314 原来左上角 4 格空了');
  ok(ring.every((k) => b0[k] === CELL.BLOCK && g.board[k] === CELL.EMPTY) && ev.bossJump && ev.bossJump.crushed.length === 9, 'T314 周围一圈 9 块旧块没了（踩碎 ' + (ev.bossJump && ev.bossJump.crushed.length) + ' 块）');
  ok(g.board[K(2, 7)] === CELL.METAL && g.board[K(8, 0)] === CELL.METAL, 'T314 两块金属还在');
  ok(g.caught === 0 && g.boss.hp === 9 && g.boss.jumpTo === null, 'T314 这一跳不算抓、不掉心、不留下一跳');
});
t('T315', () => {
  for (const n of [8, 12]) {
    const g = game(n), ev = g.openingAct(), at = n === 8 ? CELL.METAL : CELL.DIRT;
    ok(ev.opening === 'blocked' && ev.blockedFull.length === 1 && ev.blockedFull[0].u === 19 && JSON.stringify(ev.blockedFull[0].at) === JSON.stringify([K(2, 5)]) && g.board[K(2, 5)] === at, 'T315 第 ' + n + ' 关：报出「摆满被堵」——上面中间的大格，堵着的是它右下角那格（' + JSON.stringify(ev.blockedFull) + '）');
  }
});
t('T316', () => {
  const bad = [];
  for (const n of ACT) for (const id of ['tongque', 'huli', 'baozhu', 'modou', 'lvgui']) {
    const g = game(n, { team: [{ id, lv: 3 }] }), e0 = g.team.map((p) => p.energy).join(','), ev = g.openingAct();
    if (!ev || g.moves !== 0 || g.team.map((p) => p.energy).join(',') !== e0 || g.hand[3] || g.over || ev.petActs.length || Object.keys(ev.energy).length) bad.push(n + '/' + id);
  }
  ok(!bad.length, 'T316 7 关 × 五只各演一次：手数 0、表盘没变、宠物格没多出技能块、没判输（不对的：' + (bad.join('、') || '没有') + '）');
  // 没有 firstAct 的关：什么都不做
  const g = PG.createPetGame({ stage: { goal: { monster: 1 }, colors: [3], board: [E, '...m.....', E, E, E, E, E, E, E] }, team: [], seed: 3 }), b = fp(g);
  ok(g.openingAct() === null && fp(g) === b, 'T316 没写「开局先演」的关：调了什么都不变');
});
t('T307a', () => {
  // 演完以后手上三块一定还放得下（第 307 条的后一半；前一半等换关卡表以后查全部 20 关）
  const bad = [];
  for (const n of ACT) for (let s = 1; s <= 50; s++) { const g = game(n, { seed: s }); g.openingAct(); if (!core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean))) bad.push(n + '/' + s); }
  ok(!bad.length, 'T307 7 关 × 50 个种子：开局先演完，手上三块都有一种顺序放得下（放不下的：' + (bad.slice(0, 6).join('、') || '没有') + '）');
});
t('T316b', () => {
  // simulate()（机器人、量数都走它）开局调一次
  const g = PG.simulate({ stage: stageOf(4), team: [], seed: 5, skill: 1 });
  ok(g._opened === true, 'T316 机器人的 simulate() 开局先演了一次');
});

done();
