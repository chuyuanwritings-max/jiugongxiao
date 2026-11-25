// 规则自检（v2）：一关一只怪，把每只宠物的技能块放到它旁边，看抓没抓走；铁石、头目、换盘、手数上限也各试一次。用法：node selftest.js
const PG = require('./petgame_counter.js');
const E9 = '.........';
const PETS = ['tongque', 'baozhu', 'modou', 'qilin'], N = { tongque: '铜雀', baozhu: '爆竹鼠', modou: '墨斗蚕', qilin: '火麒麟' };
// 技能块放哪能打到 (4,4)：横条放左边、竖条放上面、一圈放左边、斜叉放左上
const AT = { tongque: [4, 3], qilin: [3, 4], baozhu: [4, 3], modou: [3, 3] };
function shoot(st, id) {
  const g = PG.createPetGame({ stage: st, team: [{ id, lv: 1 }], seed: 7 });
  g.hand[3] = Object.assign({}, PG.FIRE, { pet: id, tier: 1 });
  const ev = g.place(3, AT[id][0], AT[id][1]);
  return { g, ev };
}
let bad = 0;
const expect = { m: 'all', A: 'tongque', C: 'tongque', J: 'baozhu', S: 'baozhu', G: 'modou', E: 'modou', T: 'qilin', 0: 'tongque', 1: 'baozhu', 2: 'modou', 5: 'qilin' };
const NAME = { A: '甲壳怪一层', C: '甲壳怪三层', J: '跳跳怪', S: '分身怪', G: '墨苔怪', E: '馋嘴怪', T: '炸弹怪', 0: '挑色怪·金', 1: '挑色怪·红', 2: '挑色怪·绿', 5: '挑色怪·橙', m: '小墨怪' };
for (const ch of ['m', 'A', 'C', 'J', 'S', 'G', 'E', 'T', '0', '1', '2', '5']) {
  const row = [];
  for (const id of PETS) {
    const { g } = shoot({ goal: { monster: 99 }, d: 0, colors: [3], board: [E9, E9, E9, E9, '....' + ch + '....', E9, E9, E9, E9] }, id);
    const caught = g.caught > 0, want = expect[ch] === 'all' || expect[ch] === id;
    if (caught !== want || g.moves !== 0) bad++;
    row.push(N[id] + (caught ? ' 抓走' : ' 打不动') + (caught !== want ? ' ✗' : ''));
  }
  console.log(NAME[ch].padEnd(6, '　'), row.join('｜'));
}
for (const id of PETS) { const { g } = shoot({ goal: { rock: 9 }, d: 0, colors: [3], board: [E9, E9, E9, E9, '....Q....', E9, E9, E9, E9] }, id); const broke = g.got.rock > 0; if (broke !== (id === 'baozhu')) bad++; console.log('两层铁石　', N[id], broke ? '一下碎' : '裂一层', broke !== (id === 'baozhu') ? '✗' : ''); }
for (const [kind, kn] of [['spit', '大墨怪'], ['eat', '大馋嘴'], ['split', '分身王']]) {
  const row = [];
  for (const id of PETS) {
    const { g } = shoot({ goal: { boss: 1 }, d: 0, colors: [3], bigHp: 9, bossKind: kind, board: [E9, E9, E9, E9, '....KK...', '....KK...', E9, E9, E9] }, id);
    const d = 9 - g.bigHp, want = PG.RULES.bossWeak[kind] === PG.PETS[id].kind ? PG.RULES.bossWeakDmg : PG.RULES.bossOtherDmg;
    if (d !== want) bad++; row.push(N[id] + ' 掉 ' + d + ' 颗心' + (d !== want ? ' ✗' : ''));
  }
  console.log(kn.padEnd(6, '　'), row.join('｜'));
}
// 技能块各打几格（放在正中间）
console.log('技能块大小（小 / 中 / 大）：' + PETS.map((id) => N[id] + ' ' + [1, 2, 3].map((t) => PG.skillCells(PG.PETS[id].shape, t, 4, 4).length).join(' / ') + ' 格').join('；'));
// 一波一波：抓光这一波，下一波冒出来；盘面不清空；抓够数才过关
{ const st = { goal: { monster: 2 }, d: 0, colors: [3], board: ['##.......', E9, E9, E9, '....m....', E9, E9, E9, E9], waves: [[E9, E9, E9, E9, '....m....', E9, E9, E9, E9]] };
  const { g, ev } = shoot(st, 'tongque'); const ok = !g.won && g.waveNo === 2 && g.board[40] === 3 && g.board[0] === 1 && ev.wave; if (!ok) bad++; console.log('下一波　　', ok ? '第一波抓光 → 第二波冒出来，原来的块还在，还没过关' : '✗'); }
// 冲宠物喷墨：甲壳怪偷爆竹鼠的能量，偷不走铜雀的
for (const id of PETS.slice(0, 2)) { const g = PG.createPetGame({ stage: { goal: { monster: 9 }, d: 0, colors: [3], board: [E9, E9, E9, E9, '....A....', E9, E9, E9, '.........'] }, team: [{ id, lv: 1 }], seed: 3 });
  g.team[0].energy = 2;
  for (let t = 0; t < 40 && g.moves < 7 && !g.over; t++) { const i = g.hand.findIndex((p) => p && !p.special); let done = false; for (let k = 0; k < 81 && !done; k++) { const r = Math.floor(k / 9), c = k % 9; if (r >= 3 && r <= 5) continue; if (g.place(i, r, c)) done = true; } }
  const n = g.monStats.drained || 0;
  const want = id === 'baozhu'; if ((n > 0) !== want) bad++; console.log('偷能量　　', N[id], n > 0 ? '被甲壳怪偷了 ' + n + ' 格' : '没被偷', (n > 0) !== want ? '✗' : ''); }
console.log(bad ? '有 ' + bad + ' 处不对' : '全部对得上');
