// 单关调参工具（0.9）：node -e "const T=require('./test/tune_level.js'); T(关序号0起, [{id:'tongque',lv:2}], [['现在',{}],['改法',{d:0.3}]])"
// 单关调参：给一关几种改法，各跑 N 局，看普通 / 手很生 / 新手的赢率
const PG = require(__dirname + '/../js/petgame.js');
const core = require(__dirname + '/../js/core.js');
const PLV = require(__dirname + '/../js/petlevels.js');
const N = 60;
function play(st, team, seed, skill) {
  if (skill >= 0) return PG.simulate({ stage: st, team, seed, skill });
  const g = PG.createPetGame({ stage: st, team, seed }); let guard = 0;
  while (!g.over && guard++ < 400) { let m; if (g.rand() < -skill) { const all = []; g.hand.forEach((p, i) => { if (p) for (const [r, c] of core.placements(g.board, p)) all.push({ i, r, c }); }); m = all.length ? all[Math.floor(g.rand() * all.length)] : null; } else m = PG.bestMove(g, 0.25); if (!m) break; g.place(m.i, m.r, m.c); }
  return g;
}
const rate = (st, team, skill) => { let w = 0, mv = 0; for (let s = 1; s <= N; s++) { const g = play(st, team, s * 7919 + 3, skill); if (g.won) { w++; mv += g.moves; } } return Math.round((w / N) * 100) + '%(' + (w ? Math.round(mv / w) : 0) + '手)'; };
module.exports = (i, team, variants) => {
  console.log(`第${i + 1}关 带${team.map((t) => PG.PETS[t.id].name + t.lv).join('')}`);
  for (const [name, mod] of variants) { const st = Object.assign({}, PLV[i], mod); console.log('  ' + name.padEnd(20, '　') + ' 普通 ' + rate(st, team, 0.5) + '  手很生 ' + rate(st, team, 0.25) + '  新手 ' + rate(st, team, -0.4)); }
};
