// 段 1 规则 6–8：墨斗蚕 / 蝴蝶、小狮子 / 麒麟、绿龟 / 大龟（规则细设计第三节 T70–T96，龟的 5、10 级照 Cc 段 1 定）。用法：node test/rules_pets.js
const fs = require('fs'), path = require('path');
const { PG, core, CELL, P, ok, t, done, mk, K, giveSkill } = require('./rules_lib.js');
const md = (lv) => [{ id: lv >= 5 ? 'hudie' : 'modou', lv }], sz = (lv) => [{ id: lv >= 5 ? 'sanweihu' : 'huli', lv }], lg = (lv) => [{ id: lv >= 5 ? 'dagui' : 'lvgui', lv }];
const JAM = (() => { const z = [[0, 0], [1, 3], [2, 6], [3, 1], [4, 4], [5, 7], [6, 2], [7, 5], [8, 8]]; const rows = []; for (let r = 0; r < 9; r++) { let s = ''; for (let c = 0; c < 9; c++) s += z.some(([a, b]) => a === r && b === c) ? 'Z' : (r === 0 && c === 1) || (r === 8 && c === 7) ? '.' : '#'; rows.push(s); } return rows; })();
const shape = (p) => p.cells.map(([r, c]) => r + ',' + c).sort().join(' ');
const turned = (p, n) => { let cells = p.cells, h = p.h; for (let i = 0; i < n; i++) { cells = cells.map(([r, c]) => [c, h - 1 - r]); h = Math.max(...cells.map((x) => x[0])) + 1; } return cells.map(([r, c]) => r + ',' + c).sort().join(' '); };

// ---------- 规则 6：蚕 ----------
t('T70', () => {
  const g = mk({ 4: '###m####.' }, { team: md(1), hand: ['1'] });
  giveSkill(g);
  const ev = g.useSkill({ r: 4, c: 8 });
  ok(ev && ev.units.includes(4) && g.caught === 1 && g.team[0].energy === 0, 'T70 蚕 1 级、一排差 1 格、排里一只怪：丝补那格 → 整排消、抓到怪、能量不涨');
});
t('T71', () => {
  const g = mk({ 4: '####..###' }, { team: md(4), hand: ['1'] });
  giveSkill(g);
  const ev = g.useSkill({ r: 4, c: 4 });
  ok(ev && ev.units.includes(4) && ev.skill.fill.length === 2, 'T71 蚕 4 级、一排差 2 格：丝落在其中一格，两格都补，整排消');
});
t('T72', () => {
  const g = mk({ 4: '####.####', 5: '.........' }, { team: md(4), hand: ['1'] });
  giveSkill(g);
  const ev = g.useSkill({ r: 4, c: 4 });
  ok(ev && ev.skill.fill.length === 1 && g.board.slice(45, 54).every((v) => v === 0), 'T72 蚕 4 级、这一排只有落点一个空格：只补 1 格，别的排不动');
});
t('T73', () => {
  const g = mk({ 4: '...m.....' }, { team: md(4), hand: ['1'], stage: { crawl: 3 } });
  giveSkill(g);
  g.useSkill({ r: 4, c: 4 });
  const m = g.mon[K(4, 3)];
  ok(m && !(m.tied > 0) && g.caught === 0, 'T73 蚕 1–4 级、丝旁边有小墨怪、没凑满：怪还在，没被抓，也没被缠');
});
t('T74', () => {
  const g = mk({ 3: '....m....', 4: '...m.....', 7: '#........' }, { team: md(5), hand: ['1', '1', '1'], stage: { crawl: 3 } });
  g.mon[K(4, 3)].step = K(5, 3); // 这只下一手就爬
  g.mon[K(3, 4)].walk = 3;
  giveSkill(g);
  const ev = g.useSkill({ r: 4, c: 4 });
  const a = g.mon[K(4, 3)], b = g.mon[K(3, 4)];
  ok(ev && ev.tied && ev.tied.k === K(4, 3) && a.tied === 3 && !(b.tied > 0), 'T74 蝴蝶、丝旁边两只怪：只缠下一手就爬的那只（ev.tied）');
  let stay = true;
  for (let n = 0; n < 3; n++) { g.hand[0] = P['1']; g.place(0, 8, n * 2); if (g.board[K(4, 3)] !== CELL.MON) stay = false; }
  g.hand[0] = P['1']; g.place(0, 8, 6);
  ok(stay && g.board[K(5, 3)] === CELL.MON && g.board[K(4, 3)] === CELL.EMPTY, 'T74 之后 3 手它不动，第 4 手恢复（爬走了）');
});
t('T75', () => {
  const g = mk({ 3: '...KK....', 4: '...KK....' }, { team: md(5), hand: ['1'] });
  giveSkill(g);
  const hp = g.bigHp, ev = g.useSkill({ r: 3, c: 5 });
  ok(ev && !ev.tied && g.bigHp === hp && !(g.boss.tied > 0), 'T75 蝴蝶、丝挨着头目：头目不受影响');
});
t('T76', () => {
  const g = mk({ 4: '########.' }, { team: md(10), hand: ['1'] });
  giveSkill(g);
  const ev = g.useSkill({ r: 4, c: 8 });
  ok(ev && ev.units.includes(4) && g.board[K(4, 8)] === CELL.BLOCK && g.board[K(4, 0)] === CELL.EMPTY, 'T76 蚕 10 级：丝块所在的排满了消掉，那格变旧丝、仍算有块');
  g.board.fill(CELL.BLOCK, 36, 44); g.hand[0] = P['1'];
  // 再凑满一次（第 4 排只差 (4,8) 已经是旧丝，所以补上别的格就满）
  g.board[K(4, 7)] = 0; g.place(0, 4, 7);
  ok(g.board[K(4, 8)] === CELL.EMPTY, 'T76 再凑满一次：旧丝才空');
});
t('T77', () => {
  const g = mk({ 4: 'Z#######.' }, { team: md(1), hand: ['1'] });
  giveSkill(g);
  const ev = g.useSkill({ r: 4, c: 8 });
  ok(ev && !ev.units.length && g.board[K(4, 1)] === CELL.BLOCK, 'T77 蚕、排里有金属、其余补满：丝补最后一格，不消');
});

// ---------- 规则 7：小狮子 ----------
t('T80', () => {
  const g = mk({ 4: '....m....' }, { team: sz(1), hand: ['1'] });
  giveSkill(g);
  const ev = g.useSkill({ r: 4, c: 4 });
  ok(ev && g.board[K(4, 4)] === CELL.EMPTY && g.got.monster === 1 && (ev.burn || []).length === 1, 'T80 狮 1 级、一只小墨怪：火珠拖上去当场没了，目标 +1（ev.burn）');
});
t('T81', () => {
  const g = mk({ 4: '....G....' }, { team: sz(1), hand: ['1'] });
  giveSkill(g); g.useSkill({ r: 4, c: 4 });
  ok(g.board[K(4, 4)] === CELL.EMPTY && g.color[K(4, 4)] !== -2, 'T81 墨苔怪被烫走：原地不留墨');
});
t('T82', () => {
  const g = mk({ 3: '...KK....', 4: '...KK....' }, { team: sz(1), hand: ['1'], stage: { bossEvery: 3, bigHp: 9 } });
  g.boss.hits = 2; giveSkill(g);
  const ev = g.useSkill({ r: 3, c: 3 });
  ok(ev && g.bigHp === 8 && g.boss.jumpTo !== null, 'T82 狮 1 级、头目已挨 2 下：烫掉 1 心，算第 3 下，它准备跳');
});
t('T83', () => {
  const g = mk({ 4: '.#Z......' }, { team: sz(1), hand: ['1'] });
  giveSkill(g);
  ok([[4, 0], [4, 1], [4, 2]].every(([r, c]) => !g.skillPlan({ r, c })), 'T83 狮：拖到空格、方块、金属上用不了');
});
t('T84', () => {
  const g = mk({ 4: 'm.m#m....' }, { team: sz(5), hand: ['1'] });
  giveSkill(g);
  const ev = g.useSkill({ r: 4, c: 0, dir: 'r' });
  ok(ev && g.board[K(4, 0)] === CELL.EMPTY && g.board[K(4, 2)] === CELL.EMPTY && g.board[K(4, 4)] === CELL.MON, 'T84 麒麟一道火：怪、空格、怪、方块、怪 → 前两只烫走，方块后面那只没事');
});
t('T85', () => {
  const g = mk({ 3: '...KK....', 4: '...KK....' }, { team: sz(6), hand: ['1', '1'], stage: { bossEvery: 9, bigHp: 9 } });
  giveSkill(g); g.useSkill({ r: 3, c: 3 });
  g.place(0, 8, 0);
  ok(g.bigHp === 7, 'T85 狮 6 级（2 个火苗）、烫头目再放 1 块没打到它：共掉 2 心（剩 ' + g.bigHp + '）');
});
t('T86', () => {
  const g = mk({ 3: '...KK....', 4: '...KK....' }, { team: sz(6), hand: ['1', '1', '1'], stage: { bossEvery: 9, bigHp: 9 } });
  giveSkill(g); g.useSkill({ r: 3, c: 3 });
  g.boss.jumpTo = K(6, 5); g.boss.planMove = -1; // 下一手它跳
  g.place(0, 0, 0); g.place(1, 0, 2);
  ok(g.bigHp === 8 && g.bigCells[0] === K(6, 5), 'T86 狮 6 级、烫完头目下一手它跳了：火灭，之后不再掉心（剩 ' + g.bigHp + '）');
});
t('T87', () => {
  const g = mk({ 4: '....m....', 6: '.m.......' }, { team: sz(6), hand: ['1'] });
  giveSkill(g); g.useSkill({ r: 4, c: 4 });
  ok(g.caught === 1 && g.board[K(6, 1)] === CELL.MON, 'T87 狮 6 级烫小墨怪：抓 1 只，多的火苗作废');
});
t('引火', () => {
  const g = mk({ 3: '...KK....', 4: '##.KK####' }, { team: sz(10), hand: ['1'], stage: { bossEvery: 9, bigHp: 9 } });
  giveSkill(g); g.useSkill({ r: 3, c: 3 }); // 掉 1 心，身上 2 个火苗
  g.place(0, 4, 2); // 凑满穿过它的第 4 排
  ok(g.bigHp === 6 && g.boss.fire === 2, '麒麟 10 级引火：身上有火苗时凑满穿过它的排，正常 1 心 + 火再烫 1 心、火苗回满，这一手不再另烧（剩 ' + g.bigHp + '）');
});

// ---------- 规则 8：龟 ----------
t('T90', () => {
  const g = mk({}, { team: lg(1), hand: ['4h'] });
  giveSkill(g);
  const ev = g.useSkill({ hand: 0, rot: 1 });
  ok(ev && g.hand[0].w === 1 && g.hand[0].h === 4 && !g.hand[3] && ev.turn, 'T90 龟 1 级、横着的 4 格长条转 1 下：变竖的，技能块用掉（ev.turn）');
});
t('T91', () => {
  const g = mk({}, { team: lg(1), hand: ['L4a'] });
  const pc = giveSkill(g);
  g.useSkill({ hand: 0, rot: 3 });
  ok(shape(g.hand[0]) === turned(P.L4a, 3) && !g.hand[3] && pc.uses === 0, 'T91 L 形转 3 下松手：是转了 3 下的方向，只算用掉 1 次');
});
t('T92', () => {
  const g = mk({}, { team: lg(1), hand: ['sq2'] });
  const pc = giveSkill(g);
  ok([1, 2, 3].every((rot) => !g.useSkill({ hand: 0, rot })) && g.hand[3] === pc && pc.uses === 1, 'T92 2×2 方块：转了等于没转，用不了，次数不减');
});
t('T93', () => {
  const g = mk({}, { team: lg(1), hand: ['L4a'] });
  const pc = giveSkill(g);
  ok(!g.useSkill({ hand: 0, rot: 4 }) && g.hand[3] === pc, 'T93 转 4 下回原样松手：次数不减');
});
t('T94', () => {
  const g = mk({}, { team: lg(1), hand: [Object.assign({}, P['3h'], { id: '3h~+', mud: 2, mudded: true, gnawed: 1 })] });
  giveSkill(g); g.useSkill({ hand: 0, rot: 1 });
  ok(g.hand[0].mud === 2 && g.hand[0].gnawed && g.hand[0].mudded && g.hand[0].w === 1, 'T94 带泥、带爆竹的块转：泥和爆竹都还在');
});
t('T95', () => {
  const g = mk(JAM, { team: lg(1), hand: ['1', 'sq2', 'plus'] });
  giveSkill(g);
  g.place(0, 0, 1);
  ok(g.over && g.reason === 'stuck', 'T95 手上全是转了不变的块、都放不下：算堵死');
});
t('翻面', () => {
  const g = mk({}, { team: lg(4), hand: ['L4a'] });
  giveSkill(g);
  ok(!g.skillPlan({ hand: 0, rot: 0, flip: true }), '龟 1–4 级传「翻面」：不认（Cc 段 1 定：5 级才学）');
  const g2 = mk({}, { team: lg(5), hand: ['L4a'] });
  giveSkill(g2); g2.useSkill({ hand: 0, rot: 0, flip: true });
  ok(shape(g2.hand[0]) === shape(P.L4b), '大龟 5 级翻面：L 变成反 L');
});
t('变形', () => {
  const g = mk({}, { team: lg(10), hand: [Object.assign({}, P.L4a, { id: 'L4a~+', mud: 1, mudded: true, gnawed: 1 })] });
  giveSkill(g);
  const opts = g.turnShapes(0);
  ok(opts.length === 3 && opts.every((id) => P[id].cells.length === 4 && id !== 'L4a'), '大龟 10 级变形：给 3 种同样 4 格的别的形状（' + opts.join('、') + '）');
  g.useSkill({ hand: 0, shape: 1 });
  ok(shape(g.hand[0]) === shape(P[opts[1]]) && g.hand[0].mud === undefined && g.hand[0].gnawed, '变形以后：形状换成选的那种，泥没了，小爆竹还在');
  const g9 = mk({}, { team: lg(9), hand: ['L4a'] }); giveSkill(g9);
  ok(!g9.skillPlan({ hand: 0, shape: 0 }), '9 级还不会变形');
});
t('T96', () => {
  // 只搜规则文件：main.js 里火麒麟「照亮下一批」的旧说明卡、旧画法归段 6 的画面清单（附录 G）
  const rules = ['petgame.js', 'core.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');
  ok(!/预言|下一批|对调|canRotate|rotateHand/.test(rules), 'T96 规则里搜「预言」「下一批」「对调」和鼠王的「转」：搜不到');
});

done();
