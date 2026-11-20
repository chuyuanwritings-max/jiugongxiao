// 旅程 15 关：规则层直接跑，量每关赢多少、要放几块、用时（按每块 2.2–3.8 秒）、输局里差一点占多少。
// 用法：node test/measure_journey.js [每关局数]
const core = require('../js/core.js');
const LV = require('../js/levels.js');
const N = +process.argv[2] || 200;
const human = (g) => 2.2 + g.rand() * 1.6;
function run(i, skill, random) {
  let wins = 0, losses = 0, near = 0, moves = 0, secs = 0, winSecs = 0;
  for (let s = 1; s <= N; s++) {
    const g = core.simulate({ stage: LV[i], seed: s * 7919 + i, skill, random, secPerMove: human, tutorial: i === 0 });
    moves += g.moves; secs += g.elapsed;
    if (g.won) { wins++; winSecs += g.elapsed; } else { losses++; if (g.nearMiss()) near++; }
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '-');
  return { 赢: pct(wins, N), 块: (moves / N).toFixed(1), 秒: Math.round(secs / N), 赢的局秒: wins ? Math.round(winSecs / wins) : '-', 输局差一点: pct(near, losses) };
}
const rows = [];
for (let i = 0; i < LV.length; i++) {
  const a = run(i, 1), b = run(i, 0.5), r = run(i, 1, true);
  const goal = Object.entries(LV[i].goal).map(([k, v]) => k + v).join(' ');
  const row = `第${String(i + 1).padStart(2)}关 ${goal.padEnd(12)} | 会玩 赢${a.赢} ${a.块}块 ${a.秒}秒 差一点${a.输局差一点} | 手生 赢${b.赢} ${b.秒}秒 差一点${b.输局差一点} | 乱放 赢${r.赢}`;
  console.log(row); rows.push(row);
}
module.exports = rows;
