// 段 3 新第一章（照 ../九宫捉妖_段3关卡细设计_Fable_20261128.md 附录 B；Cc 11-28 批：宠物来的顺序、一尾狐表盘加 1、第 20 关 9 颗心；标准手数 × 0.7）
// 盘面字符：. 空  # 旧块  m 小墨怪  G 墨苔怪  Z 金属（只有小铜雀啄得开，堵路）  K 头目（2×2）
// crawl = 墨怪每几手爬一格（爬之前一手冒脚印）；rush = 冲锋关；bossEvery = 头目每挨几下跳一次；gift = 过关送哪只宠物（只送一次）
// firstAct = 开局先演一次（段 3 规则 4，petgame 的 g.openingAct）；fastCharge: '宠物编号' = 只有带这只（长大版也算）、第一次打这关时表盘开局只差 1 格（段 3 规则 3）
// 不点名（Cc 11-27「要练哪个是你自己的选择」）：没有 only、lend，每关带任何一只已经到手的宠物都打得过（test/seg3_measure.js 量）
// teach = 教学关（段 2：过了就 3 个丹槽，不看手数）。丹看关卡类型自动算（js/economy.js）。noReplay = 重打不给每天那一份（Cc 11-28 定：第 1、2 关）
// par = 「标准手数」= 手熟机器人赢局手数（普通、教学关取中位，难关 35% 那个位置，头目 40%）× 0.7（Cc 11-28：真人约是机器人的 0.78 倍，3 槽太难），见 test/seg3_par_report.txt
const E = '.........';
module.exports = [
  { // 1 教：拖块、凑满就消（不动）
    goal: { lines: 3 }, teach: 1, noReplay: 1, d: 0, colors: [3, 2, 1], tutHand: ['3h', '3v', 'sq2'], tutFirst: { piece: 0, r: 1, c: 3 }, par: 3,
    board: ['.......#.', '###...###', '.......#.', '.......#.', E, E, '###......', '..#....#.', '..#....#.'],
  },
  { // 2 教：抓墨怪（不动）。过关后小铜雀来
    goal: { monster: 4 }, teach: 1, noReplay: 1, d: 0, colors: [0, 3, 2], gift: 'tongque', par: 7, intro: 'catch',
    board: [E, '###m###..', E, '#.####m##', E, '##m##.###', E, '.####m##.', E],
  },
  { // 3 教：第一根羽毛。卡口：第 5 排的怪只差「啄掉 (4,7) 再放 3 横」
    goal: { monster: 5 }, teach: 1, d: 0, colors: [0, 3, 2], fastCharge: 'tongque', intro: 'pet', par: 25, startHand: ['2v', '3h', 'L4a'],
    board: [E, '###.#####', E, '......#.#', '##m###.#.', '......#.#', E, '#m.......', E],
    waves: [[E, E, '..m......', E, E, E, '......m..', E, E], [E, E, E, '....m....', E, E, E, E, E]],
  },
  { // 4 教：墨怪会爬。开局先演：(1,2) 那只从只差 1 格的排上爬走
    goal: { monster: 5 }, teach: 1, d: 0.04, crawl: 3, colors: [0, 3, 2], intro: 'crawl', par: 20, firstAct: { kind: 'crawl', from: [1, 2], to: [2, 2] },
    board: [E, '##m###.##', E, '.##...##.', '.###m###.', E, E, '##.###m##', E],
    waves: [[E, E, E, '.....m...', E, E, E, E, '..m......']],
  },
  { // 5 难：不教新的。过关后一尾狐来
    goal: { monster: 7 }, d: 0.12, dSeg: [0.08, 0.12, 0.3], crawl: 3, hard: 1, colors: [0, 3, 2], par: 29, gift: 'huli',
    board: [E, '#m##.###.', E, '...m.....', E, '.###.#m##', E, E, E],
    waves: [[E, '......m..', E, E, '.m.......', E, E, '.....m...', E], [E, E, '..m......', E, E, E, E, E, E]],
  },
  { // 6 教：第一次有两只宠物、第一次自己挑带谁。两只怪蹲在空排上（狐火的好靶子），带小铜雀照样打
    goal: { monster: 5 }, teach: 1, d: 0.08, crawl: 3, colors: [0, 3, 2], par: 22,
    board: [E, '.##m##.#.', E, '......m..', '###.###..', E, '.m.......', '...##.###', E],
    waves: [[E, E, '....m....', E, E, E, E, E, '..m......']],
  },
  { // 7 冲锋（不动）
    goal: { lines: 24 }, d: 0, colors: [0, 3, 2, 1], rush: { t3: 36, t2: 48, lose: 60 }, intro: 'rush', par: 24,
    board: [E, E, E, E, E, E, E, E, E],
  },
  { // 8 教：金属。封箱：上面中间的大格摆满了、被 (2,5) 的金属堵着，(1,4) 封着一只怪。第 5 排只差 1 格
    goal: { monster: 6 }, teach: 1, d: 0.1, crawl: 3, colors: [0, 3, 2], fastCharge: 'tongque', intro: 'metal', par: 23, firstAct: { kind: 'blocked' },
    board: ['...###...', '...#m#...', '...##Z...', '.#.....#.', '###m#.###', E, E, '#m###.###', '........Z'],
    waves: [[E, E, E, '...m.....', E, E, E, E, '......m..'], [E, E, '.m.......', E, E, E, E, E, E]],
  },
  { // 9 难：爬 + 金属 2。正中间的大格封着一只怪（金属在 (5,5)），另一块在左下角
    goal: { monster: 7 }, d: 0.2, dSeg: [0.1, 0.2, 0.4], crawl: 3, hard: 2, colors: [0, 3, 2], par: 29,
    board: [E, '#m##.###.', E, '...###...', '...#m#...', '...##Z...', E, '.#m#..##.', 'Z........'],
    waves: [[E, '......m..', E, E, '.m.......', E, E, '.....m...', E], [E, E, '..m......', E, E, E, E, E, E]],
  },
  { // 10 头目：大墨怪 9 心，每挨 3 下跳。开局先演：从左上角跳到 (4,3)，踩碎落脚 4 格 + 一圈 9 块。过关后小穿山甲来
    goal: { boss: 1 }, d: 0.1, bigHp: 9, bossKind: 'spit', gift: 'baozhu', bossEvery: 3, bossNoSpit: true, colors: [0, 3, 2], intro: 'boss', par: 29, firstAct: { kind: 'jump', to: [4, 3] },
    board: ['KK.......', 'KK#...#..', '.......Z.', '..###....', '..#..#...', '..#..#...', '...##....', '..#...#..', 'Z........'],
  },
];
