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

  // 正式插画（Midjourney）：放进 images/ 后把文件名写在这里，按画的顺序（机关城 / 墨非·沙盘 / 城头日出）。
  // 空着或某张读不到，就用 art.js 里代码画的那张。只读列在这里的，免得找不到文件时控制台报错
  paintImages: [],

  // 块的颜色：每发一块换一种宝石色，放下以后保留（黄铜金、朱砂、青铜绿、青金、紫晶、赤铜、水银青）
  blockColors: [
    ['#e0a83a', '#ffe08a', '#8a5a14'],
    ['#d9483b', '#ff9a86', '#7e1f17'],
    ['#3fae7f', '#9ff0c6', '#1c6646'],
    ['#3d6fd1', '#9fc0ff', '#1d3b80'],
    ['#9a62d6', '#d8b6ff', '#552f88'],
    ['#e07b39', '#ffc08a', '#86401a'],
    ['#33b8c0', '#a6f2f5', '#156a70'],
  ],

  // 旅程：预放的块（旧木色，和自己放的宝石色块分开）、宝石颜色 [主色, 亮面]（1 青金 2 翠玉 3 琥珀 4 粉晶 5 紫晶）
  prefillColor: ['#a07a52', '#d6b283', '#5e4228'],
  gemColors: [null, ['#3567d6', '#b9d2ff'], ['#2fa36a', '#b6f3d2'], ['#e39a2c', '#ffe1a1'], ['#e0709f', '#ffd1e3'], ['#8d55d4', '#e0c6ff']],
  coinStageWin: 10, // 旅程过一关给的金币

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
