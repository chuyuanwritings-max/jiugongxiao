// 不开浏览器，直接用规则层跑几百局，量：一局几秒、赢多少、输的局里差一点占多少、闭眼乱放赢多少。
// 用法：node test/measure.js [每档局数]
const core = require('../js/core.js');
const N = +process.argv[2] || 200;

// 人放一块要几秒：2.2–3.8 秒（含看、想、拖）。真人数据等 Cc 试玩再校
const human = (g) => 2.2 + g.rand() * 1.6;
const fast = (g) => 1.6 + g.rand() * 1.0;

function run(label, opts) {
  let wins = 0, near = 0, losses = 0, stuck = 0, len = 0, lit = 0, score = 0;
  const t0 = Date.now();
  for (let s = 1; s <= N; s++) {
    const g = core.simulate(Object.assign({ seed: s * 7919 }, opts));
    len += g.elapsed;
    lit += g.litCount();
    score += g.score;
    if (g.won) wins++;
    else {
      losses++;
      if (g.nearMiss()) near++;
      if (g.reason === 'stuck') stuck++;
    }
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '-');
  const row = {
    档: label, 赢: pct(wins, N), 平均秒: Math.round(len / N), 平均亮宫: (lit / N).toFixed(1), 平均分: Math.round(score / N),
    输局差一点: pct(near, losses), 输局里堆死: pct(stuck, losses), 用时ms: Date.now() - t0,
  };
  console.log(JSON.stringify(row));
  return row;
}

const out = [];
for (const level of [0, 1, 2, 3]) {
  out.push(run(`第${level + 1}张画 · 会玩`, { level, skill: 1, secPerMove: human }));
  out.push(run(`第${level + 1}张画 · 手生`, { level, skill: 0.5, secPerMove: human }));
}
out.push(run('第2张画 · 手快会玩', { level: 1, skill: 1, secPerMove: fast }));
out.push(run('第1张画 · 闭眼乱放', { level: 0, random: true, secPerMove: human }));
out.push(run('第2张画 · 闭眼乱放', { level: 1, random: true, secPerMove: human }));
module.exports = out;
