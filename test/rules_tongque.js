// 段 1 规则 3：铜雀 / 金凤凰「点什么啄什么」（规则细设计第三节 T20–T30）。用法：node test/rules_tongque.js
const { PG, CELL, ok, t, done, mk, K, giveSkill } = require('./rules_lib.js');
const tq = (lv) => [{ id: 'tongque', lv }];
const pecked = (g, r, c, extra) => { giveSkill(g, extra); return g.useSkill(Object.assign({ r, c }, extra && extra.tg)); };

t('T20', () => {
  const g = mk({ 4: '..###....' }, { team: tq(1) });
  const ev = pecked(g, 4, 3);
  ok(ev && g.board[K(4, 3)] === CELL.EMPTY && g.board[K(4, 2)] === CELL.BLOCK && g.board[K(4, 4)] === CELL.BLOCK, 'T20 1 级：落在一格普通块上，只那一格变空');
});
t('T21', () => {
  const g = mk({ 4: '...#Z#...' }, { team: tq(4) });
  const ev = pecked(g, 4, 4);
  ok(ev && g.board[K(4, 4)] === CELL.BLOCK && (ev.metal || []).length === 1 && g.board[K(4, 3)] === CELL.BLOCK && g.board[K(4, 5)] === CELL.BLOCK && g.color[K(4, 3)] === 3, 'T21 4 级（啄 2 格）、普通块 金属 普通块：只开金属，两边的普通块不动');
});
t('T22', () => {
  const g = mk({ 4: '.Z...Z...' }, { team: tq(4) });
  const ev = pecked(g, 4, 1);
  ok(ev && (ev.metal || []).length === 2 && g.board[K(4, 1)] === CELL.BLOCK && g.board[K(4, 5)] === CELL.BLOCK, 'T22 4 级、一排里两块金属：落在一块上，两块都开');
});
t('T23', () => {
  const g = mk({ 4: '~#~#~....' }, { team: tq(7) });
  pecked(g, 4, 0);
  ok([0, 2, 4].every((c) => g.board[K(4, c)] === CELL.EMPTY) && [1, 3].every((c) => g.board[K(4, c)] === CELL.BLOCK), 'T23 7 级（啄 3 格）、3 格墨块夹着普通块：3 格墨块没了，普通块不动');
});
t('T24', () => {
  const g = mk({ 3: '.m.KK....', 4: '...KK..D.' }, { team: tq(4) });
  const pc = giveSkill(g), uses = pc.uses;
  const tries = [[0, 0], [3, 1], [3, 3], [4, 7]].map(([r, c]) => g.useSkill({ r, c }));
  ok(tries.every((x) => x === null) && g.hand[3] === pc && pc.uses === uses, 'T24 落在空格、墨怪、头目、土堆上：用不了，技能块还在，次数不减');
});
t('T25', () => {
  const g = mk({ 4: '..#.#.#..' }, { team: tq(4) });
  pecked(g, 4, 4);
  ok(g.board[K(4, 4)] === CELL.EMPTY && g.board[K(4, 2)] === CELL.EMPTY && g.board[K(4, 6)] === CELL.BLOCK, 'T25 4 级、左右等距各一个同类：啄落点 + 左边那个');
});
const CROSS = { 3: '....#....', 4: '...##....', 5: '....#....' };
t('T26', () => {
  const g = mk(CROSS, { team: tq(4) });
  pecked(g, 4, 4, { tg: { dir: 'v' } });
  ok(g.board[K(4, 3)] === CELL.EMPTY && g.board[K(3, 4)] === CELL.BLOCK, 'T26 1–4 级传「竖着」：被忽略，照横着算');
});
t('T27', () => {
  const g = mk(CROSS, { team: tq(5) });
  pecked(g, 4, 4, { tg: { dir: 'v' } });
  ok(g.board[K(3, 4)] === CELL.EMPTY && g.board[K(4, 3)] === CELL.BLOCK && g.board[K(5, 4)] === CELL.BLOCK, 'T27 5 级传「竖着」：啄的是那一列（等距先上）');
});
t('T28', () => {
  const d = PG.peckDir;
  const r = [d('h', 0.3, 0.05) === 'h', d('h', 0.05, -0.3) === 'v', d('v', 0.05, 0.05) === 'v', d('h', 0.2, 0.25) === 'h', d('h', 0.1, 0.3) === 'v'];
  ok(r.every(Boolean), 'T28 方向算法：(0.3,0.05) 横；(0.05,−0.3) 竖；不到 0.15 不改；没多出 0.12 不换；(0.1,0.3) 换成竖（' + r.map((x) => (x ? '对' : '错')).join(' ') + '）');
});
t('T29', () => {
  const g = mk({ 4: '#########', 6: '###......' }, { team: tq(10) });
  const pc = giveSkill(g);
  const ev = g.useSkill({ r: 4, c: 4, dir: 'h' });
  ok(ev && g.board[K(4, 4)] === CELL.EMPTY && g.board[K(4, 3)] === CELL.BLOCK && g.board[K(4, 5)] === CELL.BLOCK && g.hand[3] === pc && pc.uses === 2, 'T29 10 级用一次：只啄落点一格；技能块还在，剩 2 根');
  g.useSkill({ r: 6, c: 0 }); g.useSkill({ r: 4, c: 0 });
  ok(!g.hand[3] && g.board[K(6, 0)] === CELL.EMPTY && g.board[K(4, 0)] === CELL.EMPTY, 'T29 三根可以点在盘上任何地方，用完技能块消失');
});
t('T30', () => {
  const THREE = { 0: '########.', 1: '......###', 2: '......###', 3: '........#', 4: '........#', 5: '........#', 6: '........#', 7: '........#', 8: '#.......#' };
  const g = mk(THREE, { team: tq(10), hand: ['1'] });
  const pc = giveSkill(g); g.useSkill({ r: 8, c: 0 }); g.useSkill({ r: 7, c: 8 }); // 用掉 2 根，剩 1 根
  g.board[K(7, 8)] = CELL.BLOCK;
  const ev = g.place(0, 0, 8);
  ok(ev && ev.units.length === 3 && g.hand[3] === pc && pc.uses === 1 && g.team[0].energy === PG.energyMax(g, g.team[0]), 'T30 10 级还剩 1 根羽毛没用、再消 3 排：表盘亮满就停，不吐新的');
});

done();
