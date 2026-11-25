// 每关 × 每只宠物：赢率、赢的那局几手、算上输的局平均要几手才过（期望手数）。看「对口 / 不对口 / 不带」差多少。
// 用法：node matrix.js [关卡表] [从=12] [到=30] [N=60] [手法=8] [规则 JSON] [宠物等级 JSON，如 {"jinchique":6,"baozhu":4}]
const path = require('path');
const PG = require('./petgame_counter.js');
const FM = require('./fm_counter.js');
const PLV = require(path.resolve(process.argv[2] || __dirname + '/petlevels_counter_v1.js'));
const from = +process.argv[3] || 12, to = +process.argv[4] || 30, N = +process.argv[5] || 60, sk = +process.argv[6] || 8;
if (process.argv[7]) { const r = JSON.parse(process.argv[7]); for (const k in r) { if (r[k] && typeof r[k] === 'object' && PG.RULES[k]) Object.assign(PG.RULES[k], r[k]); else PG.RULES[k] = r[k]; } }
const LV = Object.assign({ jinchique: 6, baozhu: 4, modou: 3, qilin: 3 }, process.argv[8] ? JSON.parse(process.argv[8]) : {});
function rate(st, team, N2) {
  let w = 0, mv = 0, all = 0, ct = 0, ms = 0, acts = 0;
  for (let s = 1; s <= (N2 || N); s++) { const g = FM.play(st, team, s * 7919 + 3, sk); all += g.moves; if (g.won) { w++; mv += g.moves; ct += g.monStats.counter || 0; ms += g.monStats.petMiss || 0; acts += Object.values(g.petActsTotal).reduce((a, b) => a + b, 0); } }
  return { win: Math.round(w / (N2 || N) * 100), moves: w ? mv / w : 0, exp: w ? all / w : 999, counter: w ? ct / w : 0, miss: w ? ms / w : 0, acts: w ? acts / w : 0 };
}
const f = (r) => `${String(r.win).padStart(3)}% ${r.moves.toFixed(0).padStart(2)}手(期望${r.exp.toFixed(0).padStart(3)}) 克${r.counter.toFixed(1)} 空${r.miss.toFixed(1)} 出手${r.acts.toFixed(1)}`;
function row(i, st, quiet) {
  const best = PG.bestPetFor(st);
  const out = {};
  for (const id of ['jinchique', 'baozhu', 'modou', 'qilin']) out[id] = rate(st, [{ id, lv: LV[id] }]);
  out.none = rate(st, []);
  if (!quiet) {
    console.log(`第${i + 1}关 ${JSON.stringify(st.goal)} ${st.only ? '点名' + st.only : ''} 照克制表最对口：${best.filter((x) => x.n > 0).map((x) => x.id + x.n).join(' ')}`);
    for (const id in out) console.log(`   ${(id === 'none' ? '不带' : PG.PETS[id].name + LV[id]).padEnd(5, '　')} ${f(out[id])}`);
  }
  return out;
}
module.exports = { rate, row, f, LV };
if (require.main === module) for (let i = from - 1; i < to; i++) row(i, PLV[i]);
