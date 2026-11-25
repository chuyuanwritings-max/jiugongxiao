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
// 换盘：抓光这张盘的墨怪，下一张落下来；抓够数才过关
{ const st = { goal: { monster: 2 }, d: 0, colors: [3], board: [E9, E9, E9, E9, '....m....', E9, E9, E9, E9], waves: [[E9, E9, E9, E9, '##..m..##', E9, E9, E9, E9]] };
  const { g, ev } = shoot(st, 'tongque'); const ok = !g.won && g.waveNo === 2 && g.board[40] === 3 && g.board[36] === 1 && ev.wave; if (!ok) bad++; console.log('换盘　　　', ok ? '第一张抓光 → 第二张落下，还没过关' : '✗'); }
// 手数上限：用完没过关算输；宠物格里还有技能块，让你用掉再算
{ const g = PG.createPetGame({ stage: { goal: { monster: 1 }, moves: 1, d: 0, colors: [3], board: [E9, E9, E9, E9, '....m....', E9, E9, E9, E9] }, team: [{ id: 'tongque', lv: 1 }], seed: 3 });
  g.hand[3] = Object.assign({}, PG.FIRE, { pet: 'tongque', tier: 1 });
  const i = g.hand.findIndex((p) => p && !p.special); let done = false;
  for (let c = 0; c < 9 && !done; c++) if (g.place(i, 0, c)) done = true;
  const a = !g.over && g.movesLeft() === 0; g.place(3, 4, 3); const ok = a && g.won; if (!ok) bad++; console.log('手数上限　', ok ? '手数用完、技能块还在 → 用技能块抓到最后一只，过关' : '✗'); }
console.log(bad ? '有 ' + bad + ' 处不对' : '全部对得上');
