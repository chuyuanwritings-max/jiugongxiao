// 段 1 规则 9：能量和表盘（规则细设计第三节 T100–T106）。用法：node test/rules_energy.js
const { PG, CELL, P, ok, t, done, mk, K, giveSkill } = require('./rules_lib.js');
const PETS5 = ['tongque', 'baozhu', 'modou', 'shizi', 'lvgui'];
const tq = (lv) => [{ id: 'tongque', lv }];
// 放 1 格到 (0,8) 一手消三处：第 0 排、第 8 列、右上大格
const THREE = { 0: '########.', 1: '......###', 2: '......###', 3: '........#', 4: '........#', 5: '........#', 6: '........#', 7: '........#', 8: '........#' };
// 每排、每列、每个大格都有一格金属（不会消），只留 (0,1)、(8,7) 两个孤零零的空格
const JAM = (() => { const z = [[0, 0], [1, 3], [2, 6], [3, 1], [4, 4], [5, 7], [6, 2], [7, 5], [8, 8]]; const rows = []; for (let r = 0; r < 9; r++) { let s = ''; for (let c = 0; c < 9; c++) s += z.some(([a, b]) => a === r && b === c) ? 'Z' : (r === 0 && c === 1) || (r === 8 && c === 7) ? '.' : '#'; rows.push(s); } return rows; })();
const stuckAfter = (lv, energy) => { const g = mk(JAM, { team: tq(lv), hand: ['1', 'sq2', 'sq2'] }); g.team[0].energy = energy; const ev = g.place(0, 0, 1); return { g, ev }; };

t('T100', () => {
  const g = mk(THREE, { team: tq(1), hand: ['1'] });
  g.team[0].energy = 7;
  const ev = g.place(0, 0, 8);
  ok(ev && ev.units.length === 3 && g.hand[3] && g.hand[3].special === 'skill' && g.team[0].energy === 2, 'T100 表盘 8 格亮 7 格、一手消 3 处：吐技能块，表盘剩 2 格（现在 ' + g.team[0].energy + '）');
});
t('T101', () => {
  const g = mk(THREE, { team: tq(1), hand: ['1'] });
  giveSkill(g); g.team[0].energy = 6;
  g.place(0, 0, 8);
  const e1 = g.team[0].energy;
  // 再凑一次三处
  Object.keys(THREE).forEach((r) => THREE[r].split('').forEach((ch, c) => { const k = K(+r, c); if (ch === '#') { g.board[k] = CELL.BLOCK; g.color[k] = 3; } }));
  g.hand[0] = P['1']; g.place(0, 0, 8);
  ok(e1 === 8 && g.team[0].energy === 8 && g.hand[3], 'T101 宠物格里有技能块：再消多少排，表盘停在满格（' + e1 + '、' + g.team[0].energy + '，满格 8）');
});
t('T102', () => {
  let bad = [];
  for (const id of PETS5) for (let lv = 1; lv <= 10; lv++) { const g = mk({}, { team: [{ id, lv }] }); const g2 = PG.createPetGame({ stage: { goal: { monster: 9 }, board: Array(9).fill('.........') }, team: [{ id, lv }], seed: 3 }); if (g2.team[0].energy !== 0) bad.push(id + lv); }
  ok(!bad.length, 'T102 不是登场关：五只宠物每一级开局表盘都是 0 格（不对的：' + (bad.join('、') || '没有') + '）');
});
t('T103', () => {
  let bad = [];
  for (const id of PETS5) for (let lv = 1; lv <= 10; lv++) { const g = PG.createPetGame({ stage: { goal: { monster: 9 }, board: Array(9).fill('.........'), fastCharge: true }, team: [{ id, lv }], seed: 3 }); if (g.team[0].energy !== PG.energyMax(g, g.team[0]) - 1) bad.push(id + lv); }
  ok(!bad.length, 'T103 登场关 / 升级后第一关（fastCharge）：开局只差 1 格（不对的：' + (bad.join('、') || '没有') + '）');
});
t('T104', () => {
  const { g } = stuckAfter(1, 3);
  ok(g.over && g.reason === 'stuck' && !g.hand[3], 'T104 表盘 8 格亮 3 格、三块都放不下：不救，算堵死');
});
t('T105', () => {
  const { g, ev } = stuckAfter(1, 4);
  ok(!g.over && g.hand[3] && g.team[0].energy === 0 && ev.rescue === 'tongque', 'T105 表盘 8 格亮 4 格、三块都放不下：给技能块，表盘清零');
});
t('T106', () => {
  const r = [[2, 4, true], [9, 2, true], [2, 3, false], [9, 1, false]].map(([lv, e, want]) => { const { g } = stuckAfter(lv, e); const ring = PG.energyMax(g, g.team[0]); return { ring, e, want, got: !!g.hand[3] }; });
  ok(r.every((x) => x.got === x.want) && r[0].ring === 7 && r[1].ring === 3, 'T106 过半才救：' + r.map((x) => x.ring + ' 格亮 ' + x.e + ' 格' + (x.got ? '救' : '不救')).join('，'));
});
t('技能消不攒', () => {
  // 规则 9：羽毛啄开金属、丝补满引起的消除不攒能量（Cc 同意的收紧第 3 条）
  const g = mk({ 4: 'Z########' }, { team: tq(1), hand: ['1'] });
  giveSkill(g, { n: 1 }); g.team[0].energy = 3;
  g.useSkill({ r: 4, c: 0 });
  const g2 = mk({ 4: '########.' }, { team: [{ id: 'modou', lv: 1 }], hand: ['1'] });
  giveSkill(g2); g2.team[0].energy = 3;
  const ev2 = g2.useSkill({ r: 4, c: 8 });
  ok(g.team[0].energy === 3 && ev2 && ev2.units.includes(4) && g2.team[0].energy === 3, '羽毛开金属、丝补满消掉的排：表盘不动');
});

done();
