// 0.9.20 新版第二章 · 土 · 梯田（照 Fable 新版第三节第二章；第 15、19 关的怪照第一章的审查一样减了，头 20 关都要大多数人一次过得去）
// 盘面字符：. 空  # 旧块  m 小墨怪  G 墨苔怪  N 粘墨怪（往托盘里的块上吐泥）  Z 金属  D 一堆土（只有爆竹鼠啃过的块带的小爆竹炸得开，段 1 起堵路）  K 头目
// par = 机器人赢局手数中位 × 0.55（test/ch1_measure.js 量的）
const E = '.........';
module.exports = [
  { // 11 教：鼠的技能块拖到托盘里的一块上，啃掉一格。开局故意发几块放不太下的大块；能量差一格
    goal: { monster: 5 }, d: 0.05, crawl: 3, colors: [1, 0, 3], only: 'baozhu', fastCharge: true, intro: 'baozhu', startHand: ['5h', 'L5a', 'r23'], dan: 2, par: 16,
    board: [E, '##m###.##', E, '.##...##.', '.###m###.', E, E, '##.###m##', E],
    waves: [[E, E, E, '.....m...', E, E, E, E, '..m......']],
  },
  { // 12 教：啃过的块上留一个小爆竹，把它放在土堆旁边，土堆打开变一格土色块（段 1 规则 2）
    goal: { monster: 5 }, d: 0.05, crawl: 3, colors: [1, 0, 3], only: 'baozhu', fastCharge: true, intro: 'dirt', dan: 2, par: 17,
    board: [E, '##m#D#.##', E, '.##...##.', '.##D#m##.', E, E, '##.##Dm##', E],
    waves: [[E, E, E, '....m....', E, E, E, E, '..m......']],
  },
  { // 13 普通：练。老怪混进来
    goal: { monster: 6 }, d: 0.12, crawl: 3, colors: [1, 0, 3], dan: 2, par: 27,
    board: [E, '#G##D#.##', E, '.D#..##..', '.##m#D##.', E, E, '##.D##G#.', E],
    waves: [[E, E, E, '....m....', E, E, '.m.......', E, '......m..']],
  },
  { // 14 教：粘墨怪每 4 手往托盘里一块上吐一团泥，那块多出一格（段 1 起不瞪、不预告吐哪块，只看得出什么时候吐）。几条路：快吐了留小块在手上、抓掉它、硬放、啃掉泥
    goal: { monster: 5 }, d: 0.08, crawl: 3, colors: [1, 0, 3], intro: 'sticky', dan: 2, par: 16,
    board: [E, '##N###.##', E, '.##...##.', '.###m###.', E, E, '##.###m##', E],
    waves: [[E, E, E, '....m....', E, E, E, E, '..m......']],
  },
  { // 15 难：不教新的
    goal: { monster: 8 }, d: 0.15, dSeg: [0.1, 0.15, 0.32], crawl: 3, hard: 1, colors: [1, 0, 3], dan: 4, par: 37,
    board: [E, '#N##.#D#.', E, '...m.....', E, '.D#.#m##D', E, E, E],
    waves: [[E, '......m..', E, E, '.N.......', E, E, '.....m...', E], [E, E, '..m......', E, E, E, '.......m.', E, E]],
  },
  { // 16 爽：冲锋关（第二章比第一章长一点：27 块）
    goal: { lines: 27 }, d: 0, colors: [1, 0, 3, 2], rush: { t3: 40, t2: 54, lose: 68 }, intro: 'rush', dan: 2, danStars: [2, 3, 4], par: 27,
    board: [E, E, E, E, E, E, E, E, E],
  },
  { // 17 普通：盘上被留墨、手上被加泥，两头一起来
    goal: { monster: 7 }, d: 0.15, crawl: 3, colors: [1, 0, 3], dan: 2, par: 17,
    board: [E, '##N###.##', E, '.##..G##.', '.###m###.', E, E, '##.N##G##', E],
    waves: [[E, E, E, '....m....', E, E, E, E, '..m......']],
  },
  { // 18 普通：第一次「带谁」：金属（铜雀啄）和土堆（鼠的爆竹炸）各一半，只能带一只
    goal: { monster: 8 }, d: 0.15, crawl: 3, colors: [1, 0, 3], dan: 2, par: 31,
    board: [E, '#Z#m#D#.#', E, '.D#..Z#..', '.##m#D##.', E, E, '#Z.##m#D.', '..Z......'],
    waves: [[E, E, E, '....m....', E, E, '.m.......', E, '......m.m'], [E, E, '..m......', E, E, E, E, E, E]],
  },
  { // 19 难：全上
    goal: { monster: 10 }, d: 0.22, dSeg: [0.12, 0.22, 0.4], crawl: 3, hard: 2, colors: [1, 0, 3], dan: 4, par: 36,
    board: [E, '#N##D#Z#.', E, '...m.....', E, '.Z#G#m##D', E, '..D......', E],
    waves: [[E, '......m..', E, E, '.N.......', E, E, '.....G...', E], [E, E, '..m......', E, E, E, '.......m.', E, '...m.....']],
  },
  { // 20 头目：泥沼怪 10 颗心，每 3 手往托盘里一块上吐泥（段 1 起不瞪）；每挨 3 下跳一次
    goal: { boss: 1 }, d: 0.12, bigHp: 10, bossKind: 'mud', bossEvery: 3, bossNoSpit: true, bossMud: true, colors: [1, 0, 3], intro: 'boss2', dan: 8, par: 27,
    board: [E, '..#...#..', '.D.......', E, '...KK....', '...KK....', '.......D.', '..#..D#..', E],
  },
];
