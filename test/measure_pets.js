// 九宫消 + 宠物 0.5：规则层直接跑，量设计文档第十二节的数。用法：node test/measure_pets.js [每关局数]
const PG = require('../js/petgame.js');
const LV = require('../js/petlevels.js');
const N = +process.argv[2] || 100;
const human = (g) => 2.2 + g.rand() * 1.6;
const out = [];
const log = (s) => { console.log(s); out.push(s); };
function run(stage, team, skill) {
  let won = 0, secs = 0, acts = 0, moves = 0, caught = 0;
  for (let s = 1; s <= N; s++) {
    const g = PG.simulate({ stage, team, seed: s * 7919 + 13, skill, secPerMove: human });
    if (g.won) won++;
    secs += g.elapsed; moves += g.moves; caught += g.caught;
    acts += Object.values(g.petActsTotal).reduce((a, b) => a + b, 0);
  }
  return { won: Math.round((won / N) * 100), secs: Math.round(secs / N), acts: (acts / N).toFixed(1), caught: (caught / N).toFixed(1) };
}
const myTeam = [[], [], [], [], [{ id: 'tongque', lv: 2 }], [{ id: 'tongque', lv: 3 }], [{ id: 'tongque', lv: 3 }], [{ id: 'tongque', lv: 4 }], null, [{ id: 'jinchique', lv: 5 }]];
LV.forEach((st0, i) => {
  const st = st0.evolveLevel ? LV.evolveStage(st0.evolveLevel, PG.PETS[st0.evolveLevel].color) : st0;
  const team = st0.evolveLevel ? [{ id: st0.evolveLevel, lv: 5 }] : st.team || myTeam[i] || [];
  const goal = Object.entries(st.goal).map(([k, v]) => k + v).join(' ');
  const a = run(st, team, 1), b = run(st, team, 0.5);
  let line = `${st0.bonus ? '加场' : '第' + (i + 1) + '关'} ${goal.padEnd(14)}| 会玩 赢${a.won}% ${a.secs}秒 宠物出手${a.acts}次 抓怪${a.caught} | 手生 赢${b.won}%`;
  if (team.length && !st.evolve) { const c = run(Object.assign({}, st, { team: null, fastCharge: false }), [], 0.5); line += ` | 手生不带宠物 赢${c.won}%`; }
  log(line);
});
module.exports = out;
