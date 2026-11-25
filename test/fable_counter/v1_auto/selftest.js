// 克制规则自检：一关一只怪，让每只宠物各出手一次，看抓没抓走；铁石、头目也各试一次。用法：node selftest.js
const PG = require('./petgame_counter.js');
const E9 = '.........';
const board = (r3, r4) => [E9, E9, E9, r3 || E9, r4, E9, E9, E9, E9];
const PETS = [['tongque', 5], ['baozhu', 5], ['modou', 5], ['qilin', 5]];
// 攒满能量，往左上角放一块（不碰目标那一排）触发出手；火麒麟：拿到火球后放到 fireAt
function tryPet(st, id, lv, fireAt) {
  const g = PG.createPetGame({ stage: st, team: [{ id, lv }], seed: 7 });
  g.team[0].energy = 99;
  for (let n = 0; n < 8 && !g.over; n++) {
    const fi = g.hand.findIndex((p) => p && p.special === 'fire');
    if (fi >= 0) { g.place(fi, fireAt[0], fireAt[1]); break; }
    const i = g.hand.findIndex(Boolean);
    let done = false;
    for (let r = 0; r < 3 && !done; r++) for (let c = 0; c < 9 && !done; c++) if (g.place(i, r, c)) done = true;
    if (id !== 'qilin') break;
    g.team[0].energy = 99;
  }
  return g;
}
let bad = 0;
const N = { tongque: '铜雀', baozhu: '爆竹鼠', modou: '墨斗蚕', qilin: '火麒麟' };
const expect = { A: 'tongque', C: 'tongque', J: 'baozhu', S: 'baozhu', G: 'modou', E: 'modou', T: 'qilin', 0: 'tongque', 1: 'baozhu', 2: 'modou', 5: 'qilin', m: 'all' };
const NAME = { A: '甲壳怪一层', C: '甲壳怪三层', J: '跳跳怪', S: '分身怪', G: '墨苔怪', E: '馋嘴怪', T: '炸弹怪', 0: '挑色怪·金', 1: '挑色怪·红', 2: '挑色怪·绿', 5: '挑色怪·橙', m: '小墨怪' };
for (const ch of ['m', 'A', 'C', 'J', 'S', 'G', 'E', 'T', '0', '1', '2', '5']) {
  const row = [];
  for (const [id, lv] of PETS) {
    const g = tryPet({ goal: { monster: 99 }, d: 0, colors: [3], board: board(null, '#####' + ch + '...') }, id, lv, [3, 4]);
    const caught = g.caught > 0, want = expect[ch] === 'all' || expect[ch] === id;
    if (caught !== want) bad++;
    row.push(N[id] + (caught ? ' 抓走' : ' 打不动') + (caught !== want ? ' ✗' : ''));
  }
  console.log(NAME[ch].padEnd(6, '　'), row.join('｜'));
}
for (const [id, lv] of PETS) {
  const g = tryPet({ goal: { rock: 9 }, d: 0, colors: [3], board: board(null, '#####Q...') }, id, lv, [3, 4]);
  const broke = g.got.rock > 0; if (broke !== (id === 'baozhu')) bad++;
  console.log('两层铁石　', N[id], broke ? '一口碎' : '裂一层', broke !== (id === 'baozhu') ? '✗' : '');
}
for (const [kind, kn] of [['spit', '大墨怪'], ['eat', '大馋嘴'], ['split', '分身王']]) {
  const row = [];
  for (const [id, lv] of PETS) {
    const rows = id === 'modou' ? ['######KK.', '######KK.'] : ['.....#KK.', '.....#KK.'];
    const g = tryPet({ goal: { boss: 1 }, d: 0, colors: [3], bigHp: 9, bossKind: kind, board: board(rows[0], rows[1]) }, id, lv, [3, 8]);
    const d = 9 - g.bigHp, want = PG.RULES.bossWeak[kind] === PG.PETS[id].act ? 2 : 1;
    if (d !== want) bad++; row.push(N[id] + ' 咬掉 ' + d + ' 颗心' + (d !== want ? ' ✗' : ''));
  }
  console.log(kn.padEnd(6, '　'), row.join('｜'));
}
console.log(bad ? '有 ' + bad + ' 处不对' : '全部对得上');
