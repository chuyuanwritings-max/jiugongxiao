// 每关 × 每只宠物（对口 / 不对口 / 不带）：一般人、生手的赢率和手数；生手连输 3 次放水以后的赢率。看「不对口也能过，只是慢」。
// 用法：node wrongpet.js [关卡表] [从=12] [到=30] [N=100] [等级 JSON]
const path = require('path');
const PG = require('./petgame_counter.js'), FM = require('./fm_counter.js');
const PLV = require(path.resolve(process.argv[2] || __dirname + '/petlevels_counter_v1.js'));
const from = +process.argv[3] || 12, to = +process.argv[4] || 30, N = +process.argv[5] || 100;
const LV = Object.assign({ jinchique: 6, baozhu: 4, modou: 3, qilin: 3 }, process.argv[6] ? JSON.parse(process.argv[6]) : {});
function rate(st, team, sk) { let w = 0, mv = 0, all = 0; for (let s = 1; s <= N; s++) { const g = FM.play(st, team, s * 7919 + 3, sk); all += g.moves; if (g.won) { w++; mv += g.moves; } } return { win: Math.round(w / N * 100), moves: w ? mv / w : 0, exp: w ? all / w : 999 }; }
const out = [];
for (let i = from - 1; i < to; i++) {
  const st = PLV[i], eased = Object.assign({}, st, { luck: 1, d: Math.max(0, (st.d || 0) - 0.15) });
  const best = st.only || [].concat(st.best || [])[0] || (PG.bestPetFor(st)[0] || {}).id || '';
  const bestId = best === 'tongque' ? 'jinchique' : best;
  const row = { lv: i + 1, best: bestId, only: !!st.only, r: {} };
  let line = `第${String(i + 1).padStart(2)}关 ${st.only ? '点名' : '对口'}${bestId ? PG.PETS[bestId].name : '（都行）'}`.padEnd(12, '　');
  for (const id of ['jinchique', 'baozhu', 'modou', 'qilin', 'none']) {
    const team = id === 'none' ? [] : [{ id, lv: LV[id] }];
    const a = rate(st, team, 8), b = rate(st, team, 7), c = rate(eased, team, 7);
    row.r[id] = { 一般人: a, 生手: b, 生手放水: c };
    line += `｜${id === bestId ? '★' : ' '}${id === 'none' ? '不带' : PG.PETS[id].name.slice(-1)} ${String(a.win).padStart(3)}% ${a.moves.toFixed(0).padStart(2)}手 生${String(b.win).padStart(3)}% ${b.moves.toFixed(0).padStart(2)}手 放水${String(c.win).padStart(3)}%`;
  }
  console.log(line); out.push(row);
}
if (process.env.OUT) require('fs').writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
