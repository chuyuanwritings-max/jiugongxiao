// 新版第一章（0.9.17）：机器人把每关各打 N 局，量赢率、手数（给 par 和难度用）。用法：node test/ch1_measure.js [局数] [铜雀等级]
const PG = require('../js/petgame.js'), L = require('../js/petlevels.js');
const N = +process.argv[2] || 60, LV = +process.argv[3] || 2;
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
L.forEach((st, i) => {
  const wins = [], all = []; let crawls = 0, metal = 0, jumps = 0, hearts = 0;
  for (let n = 0; n < N; n++) {
    const team = i >= 10 ? [{ id: (st.only || "baozhu"), lv: LV }] : i >= 2 ? [{ id: "tongque", lv: LV }] : [];
    const g = PG.simulate({ stage: st, team, seed: 1000 + n * 7919, skill: 1 });
    all.push(g.moves); if (g.won) wins.push(g.moves);
    crawls += g.monStats.crawls || 0; metal += g.monStats.metal || 0;
    if (g.boss) hearts += g.boss.max - g.bigHp;
  }
  console.log(String(i + 1).padStart(2), (st.hard ? '难' : st.goal.boss ? '头' : st.rush ? '冲' : '  '), '赢', Math.round((wins.length / N) * 100) + '%', ' 赢局手数中位', med(wins), ' 全部中位', med(all), ' 爬/局', (crawls / N).toFixed(1), ' 啄金属/局', (metal / N).toFixed(1), st.goal.boss ? ' 心/局 ' + (hearts / N).toFixed(1) : '');
});
