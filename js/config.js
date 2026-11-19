// 可调的数都在这里。机器人量出来的结果见 README。
module.exports = {
  // 一局几秒：第一张画送分，后面 3 分钟
  timeFirst: 270,
  timeNormal: 180,
  // 拼完整幅画剩下的每秒换多少分
  timeBonusPerSec: 10,

  // 计分
  scoreUnit: 18, // 消一行 / 一列 / 一宫
  centerMul: 5, // 中宫按洛书「五居中」×5
  streakStep: 0.25, // 连着几步都消，每多一步倍率 +0.25
  streakMax: 3,

  // 出块难度：d = 画的序号 × perLevel + 这局过了几成 × perTime（0..1）
  diffPerLevel: 0.22,
  diffPerTime: 0.45,
  diffMax: 1,
  diffFirstScale: 0.4, // 第一张画：难度打四折，送分
  // 三类块的权重：小 / 中 / 大，随 d 变
  weightSmall: (d) => 1.4 - d * 0.9,
  weightMid: () => 1,
  weightBig: (d) => 0.15 + d * 0.9,
  // 发三块时最多重抽几次来保证「有一种摆法三块都放得下」
  dealTries: 40,

  // 假广告：每局最多几次，占位倒计时几秒
  adMax: 3,
  adSec: 3,
  reviveTime: 20,

  // 金币
  coinPerScore: 1 / 60,
  coinPerBox: 2,
  coinWin: 30,
  singleCost: 20, // 局外道具：开局送一个单格小块

  // 机关收藏
  sparrowSec: 5, // 铜雀：消中宫 +5 秒
  crossbowStreak: 3, // 连弩车：连击到 3 射穿最满的一行

  // 换皮用的颜色（黄铜深褐 + 蒸汽白，深色底）
  color: {
    bg: '#120c0a',
    bg2: '#1d1410',
    wood: '#3a2618',
    woodDark: '#24170f',
    woodLine: '#4a3221',
    copper: '#b8743a',
    brass: '#d9a441',
    brassLight: '#f3d27a',
    brassDark: '#7a4f1d',
    ink: '#0d0806',
    steam: '#efe6d6',
    red: '#e2553b',
    jade: '#6fd0a8',
    text: '#f6ead2',
    dim: '#8c7a66',
  },
};
