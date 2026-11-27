// 段 1 规则 1–2（障碍堵路、打开变普通格）+ 头目跳位避开（规则细设计第三节 T01–T17）。用法：node test/rules_obstacle.js
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { PG, core, CELL, ok, t, done, mk, K, giveSkill } = require('./rules_lib.js');
const PLV = require('../js/petlevels.js');
const TQ = [{ id: 'tongque', lv: 1 }];

// ---------- 规则 1：障碍所在的排、列、大格，摆满了也不消 ----------
t('T01', () => {
  const g = mk({ 4: '########Z' }, { team: TQ, hand: ['1'] });
  const ev = g.place(0, 0, 0);
  ok(ev && !ev.units.length && g.board[K(4, 0)] === CELL.BLOCK && g.team[0].energy === 0, 'T01 一排 8 格块 + 1 格金属：再放一块到别处，这一排不消、不亮能量');
});
t('T02', () => {
  const g = mk({ 4: '########D' }, { team: TQ, hand: ['1'] });
  const ev = g.place(0, 0, 0);
  ok(ev && !ev.units.length && g.board[K(4, 0)] === CELL.BLOCK && g.board[K(4, 8)] === CELL.DIRT, 'T02 换成土堆：一样不消');
});
t('T03', () => {
  const rows = { 0: '..Z......' }; for (let r = 1; r < 8; r++) rows[r] = '..#......';
  const g = mk(rows, { team: TQ, hand: ['1'] });
  const ev = g.place(0, 8, 2);
  ok(ev && !ev.units.length && g.board[K(1, 2)] === CELL.BLOCK && g.playStats.dry === 1 && g.playStats.clearMoves === 0, 'T03 一列差 1 格满、列里有金属：补上不消，这一手算没消');
  const bf = ev && ev.blockedFull;
  ok(!!bf && bf.some((x) => x.u === 9 + 2 && x.at.includes(K(0, 2))), 'T03 事件 ev.blockedFull：写明是第 2 列、堵着的是金属那格');
});
t('T04', () => {
  const g = mk({ 0: '#D#', 1: '###', 2: '##.' }, { team: TQ, hand: ['1'] });
  const ev = g.place(0, 2, 2);
  ok(ev && !ev.units.length && g.board[K(0, 0)] === CELL.BLOCK, 'T04 一个大格差 1 格满、里面有土堆：补上不消');
});
t('T05', () => {
  const rows = { 0: '....Z....', 4: '####.####' }; [1, 2, 3, 5, 6, 7, 8].forEach((r) => (rows[r] = '....#....'));
  const g = mk(rows, { team: TQ, hand: ['1'] });
  const ev = g.place(0, 4, 4);
  ok(ev && ev.units.length === 1 && ev.units[0] === 4 && g.board[K(4, 0)] === CELL.EMPTY && g.board[K(1, 4)] === CELL.BLOCK && g.board[K(0, 4)] === CELL.METAL, 'T05 一块同时补满干净的第 4 排和有金属的第 4 列：只消第 4 排');
});
t('T14', () => {
  const g = mk({ 4: 'Z#######.', 5: '........m' }, { team: TQ, hand: ['1'], stage: { crawl: 3 } });
  g.mon[K(5, 8)].step = K(4, 8); // 下一手爬进第 4 排最后一格
  const ev = g.place(0, 0, 0);
  ok(ev && g.board[K(4, 8)] === CELL.MON && !ev.crawlClear && g.board[K(4, 1)] === CELL.BLOCK, 'T14 墨怪爬进去凑满一排、排里有金属：不消');
});
t('T17', () => {
  const g = mk({ 0: 'Z#######.' }, { hand: ['1'] });
  ok(g.clearingHome(0) === null, 'T17 只有放进被堵的排才「能消」的块：发块时不算它「有地方消」');
  const g2 = mk({ 0: '########.' }, { hand: ['1'] });
  ok(!!g2.clearingHome(0), 'T17 对照：同样的排不堵，就算有地方消');
});
t('T16', () => {
  // 冲锋关（第 7、16 关）没有障碍：固定发牌的指纹和段 0 留底一样（段 0 的数抄在这里，段 1 第 12 步重拍留底以后照样要对得上）
  const OLD = { '7/11/tongque': '63dfe5189099c711', '7/22/tongque': '84aa1e1fcd49d27e', '7/33/tongque': '78b68f5a39973d17', '16/11/tongque': '4543f4ab61df5059', '16/11/baozhu': '26cb4fa89b3aa66d', '16/22/tongque': '547cbb899bacb0ab', '16/22/baozhu': '547cbb899bacb0ab', '16/33/tongque': '657f72519384b539', '16/33/baozhu': '8354e641867af535' };
  let same = 0;
  for (const key of Object.keys(OLD)) {
    const [li, seed, pet] = key.split('/');
    const g = PG.createPetGame({ stage: PLV[+li - 1], team: [{ id: pet, lv: 3 }], seed: +seed });
    const h = crypto.createHash('sha1');
    const snap = () => h.update(JSON.stringify([g.board, g.hand.map((p) => (p ? p.id + (p.mud !== undefined ? 'm' + p.mud : '') : '-')), core.goalLeft(g), g.over, g.won]));
    snap(); let guard = 0;
    while (!g.over && guard++ < 300) { if (PG.useSkillIfGood(g)) { snap(); continue; } const m = PG.bestMove(g, 1); if (!m) break; g.place(m.i, m.r, m.c); snap(); }
    if (h.digest('hex').slice(0, 16) === OLD[key]) same++;
  }
  ok(same === Object.keys(OLD).length, 'T16 第 7、16 关 9 局指纹和段 0 一样：' + same + ' / ' + Object.keys(OLD).length);
});
t('判满唯一入口', () => {
  // 附录 B：js/ 里不许再自己写 UNITS[u].every((k) => b[k]) 这种判满
  const bad = ['core.js', 'petgame.js', 'main.js'].filter((f) => /\.every\(\((\w+)\) => \w+\[\1\]\)/.test(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')));
  ok(!bad.length && typeof core.unitFull === 'function', '判满只有 core.unitFull 一处（自己判满的文件：' + (bad.join('、') || '没有') + '）');
});

done();
