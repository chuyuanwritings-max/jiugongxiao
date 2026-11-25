// 全流程试玩记录（0.9.12，Cc 11-25：「你统计的记录，应该是整套游戏流程全部操作的记录……
// 甚至玩家在什么时候停下来不玩了、歇了一会、过一会再接着玩，这些数据你都要统计。」）
//
// 每一件事记一条：[离上一条过了几个 0.1 秒, 代号, ...数据]。代号表（解码工具 test/decode_log.js 照这张表翻成中文）：
//   o 开游戏(版本, 屏宽, 屏高, 绝对时间秒)   h 切到后台   s 回到前台(离开了几秒)   i 停手(几秒没碰屏幕)
//   m 换页面(去哪页)   b 点按钮(按钮名)
//   L 开一关(第几关, 出战宠物, 宠物等级, 这关第几次打)   E 一关打完(赢1/输0, 几手, 几秒, 目标完成百分比)   q 中途退出(几手, 几秒, 百分比)
//   p 拿起(第几格, 块名)   d 放下成了(第几格, 行, 列, 块名, 消了几条, 节拍, 抓到几个)   x 放下没成(第几格, 行, 列)
//   k 用技能块(宠物, 行, 列, 打到几格, 克住几只, 打不动几只)   r 宠物救命(宠物)   n 被偷能量(几次)   w 下一波(第几波, 共几波)
//   营地里喂丹、换出战、进化、看广告复活、设置里的开关：都是按钮，记在 b 里（按钮名见解码工具）
const P = require('./platform.js');
const KEY = 'jgx_ev1';
const MAX = 40000; // 一条约 20 字，存满约 0.8 MB；满了丢最早的
let ev = P.load(KEY) || [];
let last = Date.now(), lastInput = Date.now(), hiddenAt = 0, dirty = false, timer = null;
let packed = null; // 预先压缩好的导出（复制必须在手指点下去那一刻同步做，压缩是异步的，所以先备好）

function flush() { timer = null; if (dirty) { P.save(KEY, ev); dirty = false; } }
function rec(code, ...data) {
  const now = Date.now();
  ev.push([Math.round((now - last) / 100), code, ...data]);
  last = now;
  if (ev.length > MAX) ev.splice(0, ev.length - MAX);
  dirty = true;
  if (!timer) timer = setTimeout(flush, 4000); // 攒 4 秒写一次（整份写进手机存储，太勤会卡）；切后台时马上写
}
// 每次碰屏幕先叫这个：离上次碰超过 10 秒，记一条「停手」
function input() {
  const now = Date.now();
  if (!hiddenAt && now - lastInput > 10000) rec('i', Math.round((now - lastInput) / 1000));
  lastInput = now;
}
P.onVisibility((visible) => {
  const now = Date.now();
  if (!visible) { if (hiddenAt) return; hiddenAt = now; rec('h'); flush(); }
  else { rec('s', hiddenAt ? Math.round((now - hiddenAt) / 1000) : 0); hiddenAt = 0; lastInput = now; }
});

function payload(extra) { return Object.assign({ game: '九宫消', fmt: 1 }, extra, { ev }); }
// 预先压缩：浏览器有 CompressionStream 就压成 JGX1:base64（一般小十倍），没有就原样 JSON
function prepare(extra) {
  const raw = JSON.stringify(payload(extra));
  packed = { text: raw, n: ev.length };
  if (typeof CompressionStream === 'undefined' || typeof Blob === 'undefined') return;
  try {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    new Response(stream).arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      if (packed && packed.n === ev.length) packed = { text: 'JGX1:' + btoa(bin), n: ev.length };
    }).catch(() => {});
  } catch (e) { /* 没压缩就用原样的 */ }
}
// 复制时用：备好的压缩包只差最后几条（比如点「复制」这一下）就直接用；差多了现场出一份原样的
function exportText(extra) {
  if (!packed || ev.length - packed.n > 3 || ev.length < packed.n) prepare(extra);
  return packed.text;
}
module.exports = { rec, input, prepare, exportText, count: () => ev.length, flush, _all: () => ev };
