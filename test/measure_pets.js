// 九宫消 + 宠物：规则层直接跑，量每关赢率、步数、宠物出手几次；带对口的、带别的、不带宠物各量一遍。用法：node test/measure_pets.js [每关局数]
const PG = require('../js/petgame.js');
const LV = require('../js/petlevels.js');
const N = +process.argv[2] || 60;
// 打到这一关时，玩家的宠物大概几级（按经验节奏估）
const lvAt = (i) => (i < 4 ? 1 : i < 8 ? 2 : i < 12 ? 3 : i < 16 ? 4 : 5);
function run(stage, team, skill) {
  let won = 0, moves = 0, acts = 0;
  for (let s = 1; s <= N; s++) {
    const g = PG.simulate({ stage, team, seed: s * 7919 + 13, skill });
    if (g.won) won++;
    moves += g.moves; acts += Object.values(g.petActsTotal).reduce((a, b) => a + b, 0);
  }
  return { won: Math.round((won / N) * 100), moves: Math.round(moves / N), acts: (acts / N).toFixed(1) };
}
const out = [];
LV.forEach((st, i) => {
  if (i < 3) { const a = run(st, [], 0.5); const line = `第${i + 1}关 ${Object.entries(st.goal).map(([k, v]) => k + v).join(' ').padEnd(16)}| 手生 赢${a.won}% ${a.moves}步`; console.log(line); out.push(line); return; }
  const bestId = st.best || 'tongque';
  const id = bestId === 'tongque' && lvAt(i) >= 5 ? 'jinchique' : bestId;
  const team = st.team || [{ id, lv: lvAt(i) }];
  const other = [{ id: bestId === 'baozhu' ? 'tongque' : 'baozhu', lv: lvAt(i) }];
  const a = run(st, team, 0.5), b = run(Object.assign({}, st, { team: null, fastCharge: false }), other, 0.5), c = run(Object.assign({}, st, { team: null, fastCharge: false }), [], 0.5);
  const line = `第${i + 1}关 ${Object.entries(st.goal).map(([k, v]) => k + v).join(' ').padEnd(16)}| 手生带${PG.PETS[team[0].id].name}${team[0].lv}级 赢${a.won}% ${a.moves}步 出手${a.acts}次 | 带${PG.PETS[other[0].id].name} 赢${b.won}% ${b.moves}步 | 不带 赢${c.won}%${st.hard ? '  [' + (st.hard === 2 ? '超难' : '难') + ']' : ''}`;
  console.log(line); out.push(line);
});
module.exports = out;
