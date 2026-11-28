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


  // 机关收藏
  sparrowSec: 5, // 铜雀：消中宫 +5 秒
  crossbowStreak: 3, // 连弩车：连击到 3 射穿最满的一行

  // 正式插画（Midjourney）：放进 images/ 后把文件名写在这里，按画的顺序（机关城 / 墨非·沙盘 / 城头日出）。
  // 空着或某张读不到，就用 art.js 里代码画的那张。只读列在这里的，免得找不到文件时控制台报错
  paintImages: [],
  // 0.8.1 Midjourney 第 1 批（画风 BDL-02-a 无主之地2 简化版，需求单 生图/需求_主视觉与宠物头像_20261124.md）：
  // 图放进 images/ 后把文件名写在这里就自动换上；空着或读不到，就用代码画的（圆章一个字、九宫格徽记）
  homeArt: 'home.jpg', // 主菜单主视觉，9:16（第 1 批 Cc 选第 1 张）
  petArt: { tongque: 'pet_tongque.png', jinchique: 'pet_jinchique.png', baozhu: 'pet_baozhu.png', modou: 'pet_modou.png', sanweihu: 'pet_qilin.png' }, // 抠好底、256×256

  // 块的颜色：每发一块换一种宝石色，放下以后保留（黄铜金、朱砂、青铜绿、青金、紫晶、赤铜、水银青）
  blockColors: [
    // 0.4 照风格库 LDR-S1E08-a 祝有好收获：每种降一点艳度，让「消掉时的光」成为盘面上最亮的东西。[主色, 高光, 硬阴影]
    ['#c9a04a', '#f3d27a', '#7f602c'], // 黄铜
    ['#c4483c', '#f19a86', '#6e231c'], // 朱砂
    ['#3f9a7c', '#a6e6c8', '#1f5a46'], // 青绿
    ['#4470c0', '#a9c4f2', '#233c73'], // 青金
    ['#8a62bf', '#d3bdf0', '#4c3173'], // 紫晶
    ['#c27440', '#f3bf8c', '#6e3a1a'], // 赤铜
    ['#3fa3aa', '#a9e8ea', '#1d5d62'], // 水银青
  ],

  // 旅程：预放的块（旧铁灰青，和自己放的宝石色块分开）、宝石颜色 [主色, 亮面]（1 青金 2 翠玉 3 琥珀 4 粉晶 5 紫晶）
  prefillColor: ['#6a7c82', '#b6c6c8', '#3a474d'], // 预放的旧块：旧铁灰青，一眼和新块（宝石色）分开
  gemColors: [null, ['#3567d6', '#b9d2ff'], ['#2fa36a', '#b6f3d2'], ['#e39a2c', '#ffe1a1'], ['#e0709f', '#ffd1e3'], ['#8d55d4', '#e0c6ff']],

  // 换皮用的颜色。0.4 起照风格库 LDR-S1E08-a 祝有好收获：靛蓝夜色底 + 黄铜（#9C7F42 / 暗 #7F602C / 高光 #EFBE63）+ 一点朱砂；
  // 线是深褐近黑 #1E1A16。对应墨非的衣服：深靛蓝长袍、黄铜滚边。（0.3 以前是深褐木头，离 Woodoku 太近）
  color: {
    bg: '#0e1330', // 靛蓝夜（上）
    bgLow: '#090c20', // 靛蓝夜（下）
    bg2: '#151c3e', // 托盘
    wood: '#1d2752', // 面板、次要按钮
    woodDark: '#121937',
    woodLine: '#2a3768',
    cellA: '#1c2650', cellB: '#202b59', // 格子：深的一宫
    cellC: '#243163', cellD: '#28366b', // 格子：浅的一宫
    shade: 'rgba(6,8,22,', // 压暗用（后面接透明度）
    copper: '#9c7f42',
    brass: '#d1a650',
    brassLight: '#efbe63',
    brassDark: '#7f602c',
    ink: '#1e1a16',
    steam: '#ebe5d4',
    red: '#d2463a',
    jade: '#6fd0a8',
    text: '#f3ead6',
    dim: '#a3a9c9', // 0.8 照 Fable UI 对照调亮一点，13 号字才看得清
  },
  // 0.8 主题「靛蓝黄铜」（照 ../九宫消_关卡页专属关与UI对照_20261124.md 第四节）：所有页面只从这里取。
  // 以后出第二套就再加一个对象，整套一起换；不给玩家单独挑颜色。
  theme: {
    card: '#19224a', cardOn: '#222d5e', line: '#2a3768', faint: '#5d658f',
    brass: '#d1a650', brassEdge: '#7f602c', onBrass: '#1e1a16',
    red: '#d2463a', jade: '#6fd0a8', violet: '#8a62bf',
    sizes: [11, 13, 16, 20, 28], // 字号只留 5 档（棋盘上的飘字、过场里的大字不算）
    rCard: 20, rBtn: 16, rCell: 14,
  },
};
