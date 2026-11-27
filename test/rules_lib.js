// 段 1 规则测试的公用小工具（规则细设计第三节：不开画面，直接摆盘面、调规则、看结果）
const PG = require('../js/petgame.js'), core = require('../js/core.js');
const CELL = core.CELL, P = core.PIECES;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
// 一条测试：出了异常也记成没过，接着跑下一条
const t = (name, fn) => { try { fn(); } catch (e) { fail++; console.log('✗ ' + name + '：抛出异常 ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); } };
const done = () => { console.log(pass + ' 项通过，' + fail + ' 项没过'); process.exit(fail ? 1 : 0); };
const E = '.........';
// 造一局：rows = 9 行字符（. 空  # 块  m 小墨怪  G 墨苔怪  N 粘墨怪  Z 金属  D 土堆  K 头目  ~ 墨块  @ 泥巴格），不写的行是空的
// o：{ team: [{ id, lv }], stage: 关卡表里多写的字段, hand: ['1', '2h', …]（不写 = 三格都空）, seed }
function mk(rows, o) {
  o = o || {};
  const board = Array.from({ length: 9 }, (_, r) => (rows[r] || E).replace(/[~@]/g, '#'));
  const st = Object.assign({ goal: { monster: 99 }, d: 0, colors: [3], board }, o.stage || {});
  const g = PG.createPetGame({ stage: st, team: o.team || [], seed: o.seed || 7 });
  for (let r = 0; r < 9; r++) (rows[r] || E).split('').forEach((ch, c) => { const k = r * 9 + c; if (ch === '~') g.color[k] = -2; if (ch === '@') g.color[k] = -3; if (ch === '#') g.color[k] = 3; });
  g.hand = [0, 1, 2].map((j) => (o.hand && o.hand[j] ? (typeof o.hand[j] === 'string' ? P[o.hand[j]] : o.hand[j]) : null)).concat([null]);
  g.handColor = [3, 3, 3, 3];
  g.team.forEach((pt) => (pt.energy = 0));
  return g;
}
const K = (r, c) => r * 9 + c;
// 给宠物格塞一块技能块（等级照 team[0]）
function giveSkill(g, extra) {
  const pt = g.team[0];
  g.hand[3] = Object.assign({}, PG.SKILL_PIECE, PG.skillPieceOf ? PG.skillPieceOf(pt) : { pet: pt.id, kind: PG.skillKind(pt.id), n: PG.skillN(pt.id, pt.lv), uses: 1 }, extra || {});
  return g.hand[3];
}
module.exports = { PG, core, CELL, P, ok, t, done, mk, K, E, giveSkill };
