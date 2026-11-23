// 守城试玩版：规则层直接跑，量肉鸽分析第七节的六个数。用法：node test/measure_siege.js [局数]
const S = require('../js/siege.js');
const N = +process.argv[2] || 150;
const human = (g) => 2.2 + g.rand() * 1.6;
// A. 生死线：同一批种子，开局直接带上一套机关 vs 不带，比每一手平均伤害（只算有伤害的波，打 5 波看）
function perMove(relics) {
  let dmg = 0, moves = 0, trig = {}, chain3 = 0, waves = 0;
  for (let s = 1; s <= N; s++) {
    const g = S.simulate({ seed: s * 7919, relics, noRelics: !relics, pick: 'none', secPerMove: human, maxWaves: 5 });
    dmg += g.totalDmg; moves += g.moves; waves += Math.max(1, g.wave + (g.over ? 0 : 0));
    for (const k in g.triggers) trig[k] = (trig[k] || 0) + g.triggers[k];
    if (g.maxChain >= 3) chain3++;
  }
  const wavesPlayed = moves / 12;
  const perWave = {}; for (const k in trig) perWave[k] = (trig[k] / wavesPlayed).toFixed(1);
  return { avg: dmg / moves, perWave, chain3: Math.round((chain3 / N) * 100) + '%' };
}
const none = perMove(null);
console.log(`不带机关：每手平均 ${none.avg.toFixed(1)} 点`);
const sets = {
  '连弩（单件）': [{ id: 'crossbow', lv: 1 }],
  '火雷（单件）': [{ id: 'thunder', lv: 1 }],
  '墨斗（单件）': [{ id: 'inkline', lv: 1 }],
  '五居中（单件）': [{ id: 'center5', lv: 1 }],
  '飞星（单件）': [{ id: 'star', lv: 1 }],
  '永动弩（墨斗+连弩+弩机上弦）': [{ id: 'inkline', lv: 1 }, { id: 'crossbow', lv: 1 }, { id: 'loader', lv: 1 }],
  '满城烟火（火雷+连环雷）': [{ id: 'thunder', lv: 1 }, { id: 'chain', lv: 1 }],
  '洛书倍率机（飞星+五居中+河图）': [{ id: 'star', lv: 1 }, { id: 'center5', lv: 1 }, { id: 'hetu', lv: 1 }],
};
const out = [`不带机关：每手 ${none.avg.toFixed(1)} 点`];
for (const [name, relics] of Object.entries(sets)) {
  const r = perMove(relics);
  const line = `${name}：每手 ${r.avg.toFixed(1)} 点 = 不带的 ${(r.avg / none.avg).toFixed(2)} 倍；每波发动 ${JSON.stringify(r.perWave)}；一手连发 3 件以上的局 ${r.chain3}`;
  console.log(line); out.push(line);
}
// B. 真玩：第一局（教学，3 波）和普通局（开局三选一，打满 5 波），机器人自己三选一
for (const [label, opt] of [['第 1 局（3 波，教学）', { tutorial: true }], ['第 2 局（3 波，4 件）', { runNo: 1 }], ['第 4 局（3 波，8 件全开）', { runNo: 3 }], ['每日一城（不封顶）', { daily: true }]]) {
  let won = 0, secs = 0, waves = 0, gate = 0, stuck = 0, near = 0;
  for (let s = 1; s <= N; s++) {
    const g = S.simulate(Object.assign({ seed: s * 31 + 7, pick: 'auto', secPerMove: human }, opt, opt.daily ? { daily: 20261121 + s } : {}));
    secs += g.elapsed; waves += g.wavesWon;
    const goal = opt.daily ? 99 : 3;
    if (g.wavesWon >= goal) won++; else { if (g.reason === 'gate') gate++; if (g.reason === 'stuck') stuck++; if (g.nearMiss()) near++; }
  }
  const lost = N - won;
  const line = `${label}：守住 ${Math.round((won / N) * 100)}%，平均 ${Math.round(secs / N)} 秒，平均打下 ${(waves / N).toFixed(1)} 波；输的局：城破 ${gate}、堵死 ${stuck}、只差三成血以内 ${lost ? Math.round((near / lost) * 100) : 0}%`;
  console.log(line); out.push(line);
}
module.exports = out;
