// 段 1 规则 4：爆竹鼠 / 鼠王（规则细设计第三节 T40–T51）。用法：node test/rules_baozhu.js
const fs = require('fs'), path = require('path');
const { PG, CELL, P, ok, t, done, mk, K, giveSkill } = require('./rules_lib.js');
const bz = (lv) => [{ id: 'baozhu', lv }];
// 每排、每列、每个大格都有一格金属（不会消），只留 (0,1)、(8,7) 两个孤零零的空格
const JAM = (() => { const z = [[0, 0], [1, 3], [2, 6], [3, 1], [4, 4], [5, 7], [6, 2], [7, 5], [8, 8]]; const rows = []; for (let r = 0; r < 9; r++) { let s = ''; for (let c = 0; c < 9; c++) s += z.some(([a, b]) => a === r && b === c) ? 'Z' : (r === 0 && c === 1) || (r === 8 && c === 7) ? '.' : '#'; rows.push(s); } return rows; })();
const gnawedOf = (id) => Object.assign({}, P[id], { id: id + '~', gnawed: 1 });

t('T40', () => {
  const g = mk({}, { team: bz(1), hand: ['4h'] });
  giveSkill(g);
  const ev = g.useSkill({ hand: 0, cell: 0 });
  ok(ev && g.hand[0].cells.length === 3 && g.hand[0].gnawed && !g.hand[3], 'T40 1 级、4 格长条啃一头：变 3 格、带爆竹，技能块消失');
});
t('T41', () => {
  const g = mk({}, { team: bz(1), hand: ['3h'] });
  giveSkill(g);
  ok(!g.skillPlan({ hand: 0, cell: 1 }), 'T41 3 格长条啃中间（会断成两截）：啃不了');
});
t('T42', () => {
  const g = mk({}, { team: bz(1), hand: ['1'] });
  giveSkill(g);
  ok(!g.skillPlan({ hand: 0, cell: 0 }), 'T42 只剩 1 格的块：啃不了（Cc 同意的收紧第 1 条）');
});
t('T43', () => {
  const g = mk({}, { team: bz(4), hand: [gnawedOf('4h'), '4h'] });
  const pc = giveSkill(g);
  ok(pc.uses === 2 && !g.skillPlan({ hand: 0, cell: 0 }) && !!g.skillPlan({ hand: 1, cell: 0 }), 'T43 4 级（2 口）、一块已经带爆竹：再啃它不行（一块只挨一口），啃另一块可以');
});
t('T44', () => {
  const g = mk({}, { team: bz(4), hand: [Object.assign({}, P['3h'], { id: '3h+', mud: 2, mudded: true })] });
  const pc = giveSkill(g);
  g.useSkill({ hand: 0, cell: 2 });
  ok(g.hand[0].cells.length === 2 && g.hand[0].mud === undefined && g.hand[0].gnawed && pc.uses === 1, 'T44 手上一块带泥、啃泥那格：泥没了，带爆竹，算一口');
});
t('T45', () => {
  const g = mk({ 4: '####.....' }, { team: bz(1), hand: ['4h'] });
  giveSkill(g);
  ok([[4, 0], [4, 5], [0, 0]].every(([r, c]) => !g.skillPlan({ r, c })), 'T45 门牙拖到盘上任何一格：用不了');
});
t('T46', () => {
  const g = mk({ 3: '.....D...' }, { team: bz(4), hand: ['2h'] });
  giveSkill(g); g.useSkill({ hand: 0, cell: 0 });
  g.place(0, 4, 4); // 1 格爆竹块放在 (4,4)，土堆在它右上斜角
  ok(g.board[K(3, 5)] === CELL.DIRT, 'T46 1–4 级啃过的块、土堆在它斜角：土堆不变');
});
t('T47', () => {
  const g = mk({ 3: '.....D...' }, { team: [{ id: 'baozhuwang', lv: 5 }], hand: ['2h'] });
  giveSkill(g); g.useSkill({ hand: 0, cell: 0 });
  const ev = g.place(0, 4, 4);
  ok(g.board[K(3, 5)] === CELL.BLOCK && ev && ev.blast8, 'T47 5 级鼠王啃过的块、土堆在它斜角：土堆打开（大爆竹，ev.blast8）');
});
t('T48', () => {
  const g = mk(JAM, { team: bz(4), hand: ['1', 'd3a', gnawedOf('sq2')] });
  giveSkill(g);
  const ev = g.place(0, 0, 1); // 放完这块：剩斜连 3 格、已带爆竹的方块，哪儿都放不下，也啃不了
  ok(ev && g.over && g.reason === 'stuck', 'T48 宠物格里有门牙、手上全是啃不了的块、都放不下：算堵死，不会停在「没输也动不了」');
});
t('T49', () => {
  const g = mk(JAM, { team: bz(4), hand: ['1', 'd3a', gnawedOf('1')] });
  giveSkill(g);
  g.place(0, 0, 1);
  ok(!g.over && !g.stuck(), 'T49 同 T48，但有一块放得下：不算堵死');
});
t('T50', () => {
  const g = mk({ 4: '#######..', 6: '..m......' }, { team: bz(10), hand: ['4h', '3h'], stage: { crawl: 3 } });
  g.mon[K(6, 2)].step = K(7, 2);
  giveSkill(g);
  const ev = g.useSkill({ hand: 0, cell: 0 });
  ok(ev && ev.crumb && g.crumb && g.crumb.cells.length === 1 && !g.crumb.gnawed, 'T50 10 级啃一口：小位子里多一块 1 格小土块（不带爆竹，ev.crumb）');
  const mv = g.moves, e0 = g.team[0].energy;
  g.place(4, 4, 7); // 小土块放到第 4 排：差 1 格还没满
  ok(g.moves === mv + 1 && g.board[K(7, 2)] === CELL.MON && !g.crumb, 'T50 把小土块放到盘上：算正常的一手（手数 +1、墨怪照动）');
  g.crumb = { id: 'crumb', cat: 0, cells: [[0, 0]], h: 1, w: 1, crumb: true };
  const ev2 = g.place(4, 4, 8);
  ok(ev2 && ev2.units.includes(4) && g.team[0].energy === e0 + 1, 'T50 小土块凑满一排：照常消、照常攒能量');
});
t('T51', () => {
  const g = mk({}, { team: bz(10), hand: ['4h', '4h', '4h'] });
  const pc = giveSkill(g);
  g.useSkill({ hand: 0, cell: 0 }); const c1 = g.crumb;
  g.useSkill({ hand: 1, cell: 0 });
  ok(pc.uses === 1 && g.crumb === c1, 'T51 10 级、小位子里已有一块再啃：小位子里还是 1 块（新啃下来的不留）');
});
t('鼠王不转', () => {
  const src = ['petgame.js', 'core.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');
  ok(!/canRotate|rotateHand|spendBite/.test(src), 'R-039 鼠王不会转块：规则里搜不到 canRotate / rotateHand / spendBite');
});

done();
