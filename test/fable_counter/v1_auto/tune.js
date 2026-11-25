// 单关试改法：node tune.js 第几关 '宠物:等级,宠物:等级' '[{改法1},{改法2}]' [N=60]
const PG = require('./petgame_counter.js'), FM = require('./fm_counter.js'), PLV = require('./petlevels_counter_v1.js');
const i = +process.argv[2] - 1, teams = process.argv[3].split(',').map((x) => x.split(':')), mods = JSON.parse(process.argv[4] || '[{}]'), N = +process.argv[5] || 60;
function rate(st, team, sk) { let w = 0, mv = 0, all = 0, fc = 0, dry = 0; for (let s = 1; s <= N; s++) { const g = FM.play(st, team, s * 7919 + 3, sk); all += g.moves; if (g.won) { w++; mv += g.moves; fc += g.log.firstClear; dry += g.playStats.maxDry; } } return `${String(Math.round(w / N * 100)).padStart(3)}% ${(w ? mv / w : 0).toFixed(0).padStart(2)}手(期望${(w ? all / w : 999).toFixed(0)}) 首消${(w ? fc / w : 0).toFixed(1)} 旱${(w ? dry / w : 0).toFixed(1)}`; }
for (const mod of mods) {
  const st = Object.assign({}, PLV[i], mod);
  console.log(`第${i + 1}关 ${JSON.stringify(mod).slice(0, 150)}`);
  for (const [id, lv] of teams) { const team = id === 'none' ? [] : [{ id, lv: +lv }]; console.log(`   ${(id === 'none' ? '不带' : PG.PETS[id].name + lv).padEnd(5, '　')} 一般人 ${rate(st, team, 8)}｜生手 ${rate(st, team, 7)}`); }
}
