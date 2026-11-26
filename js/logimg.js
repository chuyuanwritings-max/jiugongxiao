// 试玩记录 → 一张黑白小方格的图（0.9.17，Cc 11-27：「测试结果转发的按钮一定要一定要修好啊！一定要让我朋友可以把测试结果转发给我」）
// 为什么是图：微信小游戏不能发文件；复制要后台声明「剪贴板」隐私接口才放行；分段弹窗太累。
// 但 wx.showShareImageMenu 能把一张图直接「发送给朋友」。所以把压缩好的记录（JGX1:… 那串字）画成黑白方格，
// 朋友点一下 → 选 Cc → 发送；Cc 把图存下来，用 tools/decode_log_image.py 解回原来那串字，再走 test/decode_log.js。
//
// 图的样子（从上往下）：
//   顶上几行字：游戏名、版本、局数、时间 —— 给人看的，解码不用
//   一圈黑框（1 格粗）+ 1 格白边 + 数据区：每格 1 比特，黑 = 1，白 = 0，一行 COLS 格，从左到右、从上到下
//   数据 = 'JGXI'(4 字节) + 长度(4 字节，大端) + CRC32(4 字节) + 压缩好的记录字节（deflate-raw，和 JGX1: 后面那串 base64 解开是同一份）
// 方格画得大（每格 5 像素），微信发图会压缩、缩小，解码时按黑框算格子大小、取每格中间的颜色，压过也认得出。
const COLS = 208; // 一行几格：宽 1080 像素 = (208 + 4 圈框) × 5 + 两边留白
const CELL = 5;
const PAD = 20; // 图边上留白（像素）
const HEAD = 150; // 顶上写字的高度
const MAXH = 4000; // 图最高多少像素（有的手机离屏画布太高会画不出来）；装不下就只装最近的一段

function crc32(bytes) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = (crc ^ bytes[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
// 压缩好的字节 → 要画的字节（前面加个头：认得出、知道多长、能查对错）
function frame(data) {
  return [74, 71, 88, 73].concat(u32(data.length), u32(crc32(data)), Array.from(data)); // 'JGXI'
}
// 最多装得下几个字节
function capacity() {
  const rows = Math.floor((MAXH - HEAD - PAD * 2) / CELL) - 4;
  return Math.floor((rows * COLS) / 8) - 12;
}
// 画到画布上。makeCanvas(w, h) 由外面给（微信 / 浏览器不一样）。info = { title, lines: [..] } 顶上写的字
function draw(data, makeCanvas, info) {
  const bytes = frame(data);
  const bits = bytes.length * 8;
  const rows = Math.ceil(bits / COLS);
  const w = PAD * 2 + (COLS + 4) * CELL;
  const h = HEAD + PAD * 2 + (rows + 4) * CELL;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  // 顶上的字
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText((info && info.title) || '九宫消 试玩记录', PAD, 18);
  ctx.font = '26px sans-serif';
  ((info && info.lines) || []).slice(0, 2).forEach((line, i) => ctx.fillText(String(line), PAD, 72 + i * 34));
  // 黑框：数据区外面空一格白，再一格黑
  const x0 = PAD, y0 = HEAD + PAD;
  ctx.fillRect(x0, y0, (COLS + 4) * CELL, CELL);
  ctx.fillRect(x0, y0 + (rows + 3) * CELL, (COLS + 4) * CELL, CELL);
  ctx.fillRect(x0, y0, CELL, (rows + 4) * CELL);
  ctx.fillRect(x0 + (COLS + 3) * CELL, y0, CELL, (rows + 4) * CELL);
  // 数据
  const dx = x0 + 2 * CELL, dy = y0 + 2 * CELL;
  for (let i = 0; i < bits; i++) {
    if (!((bytes[i >> 3] >> (7 - (i & 7))) & 1)) continue;
    ctx.fillRect(dx + (i % COLS) * CELL, dy + Math.floor(i / COLS) * CELL, CELL, CELL);
  }
  return c;
}
module.exports = { draw, capacity, crc32, COLS, CELL };
