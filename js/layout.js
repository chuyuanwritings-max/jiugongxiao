// 界面布局表（0.9.1，给「游戏修改器」= 共用界面编辑器用，见 ../../00_界面编辑器/README.md）。
// Cc 11-24：「以后我告诉你开游戏修改器，你就打开那个界面，咱们俩一起协同工作」。
// 每个能拖的界面元素一个 id；位置按设计稿算：宽 390，内容区从 top=34（顶上安全区下）到 bottom=844（屏幕底）——就是 390×844 手机上现在的样子。
// 锚点：ax 横向 l 贴左 / r 贴右 / c 居中 / s 左右拉满；ay 纵向 t 贴顶 / b 贴底 / m 居中。
// 换手机：位置按宽、高各自的比例挪，大小按两个比例里小的那个缩。
// Cc 在修改器里摆好的结果存在 原型/layout.json，打包时生成 js/layout_data.js，盖在默认值上。修改器本身不进微信包。
const REF = { W: 390, top: 34, bottom: 844 };

const DEFS = {
  // 主菜单（screen 要等于 main.js 的 sceneName）
  'home.title': { name: '标题（九宫消 + 小字）', screen: 'home', x: 95, y: 50, w: 200, h: 80, ax: 'c', ay: 't' },
  'home.main': { name: '继续大按钮', screen: 'home', x: 45, y: 664, w: 300, h: 60, ax: 'c', ay: 'b' },
  'home.bar': { name: '底栏图标（营地 / 画册 / 经典拼画 / 设置）', screen: 'home', x: 16, y: 752, w: 358, h: 56, ax: 's', ay: 'b' },
  // 地图（章页）
  'map.grid': { name: '九个关卡格', screen: 'map', x: 16, y: 104, w: 358, h: 340, ax: 's', ay: 't' },
  'map.boss': { name: '头目卡 / 关卡预览卡', screen: 'map', x: 16, y: 530, w: 358, h: 120, ax: 's', ay: 'b' },
  'map.train': { name: '先练谁', screen: 'map', x: 16, y: 660, w: 358, h: 40, ax: 's', ay: 'b' },
  'map.play': { name: '继续大按钮', screen: 'map', x: 16, y: 710, w: 358, h: 58, ax: 's', ay: 'b' },
  'map.bar': { name: '底栏图标（营地 / 画册 / 经典拼画）', screen: 'map', x: 16, y: 780, w: 358, h: 56, ax: 's', ay: 'b' },
  // 营地
  'camp.gourd': { name: '宠物园（上沿）', screen: 'camp', x: 16, y: 88, w: 358, h: 84, ax: 's', ay: 't' },
  'camp.pets': { name: '宠物园（下沿）', screen: 'camp', x: 16, y: 184, w: 358, h: 500, ax: 's', ay: 't' },
  'camp.next': { name: '下一关卡', screen: 'camp', x: 16, y: 696, w: 358, h: 56, ax: 's', ay: 'b' },
  'camp.go': { name: '出发大按钮', screen: 'camp', x: 16, y: 764, w: 358, h: 56, ax: 's', ay: 'b' },
};

let data = {};
try { data = (require('./layout_data.js') || {}).elements || {}; } catch (e) { data = {}; }

let M = { W: REF.W, top: REF.top, bottom: REF.bottom };
const used = {}; // 这一帧画了哪些元素（修改器用来画框）

function setMetrics(W, top, bottom) { M = { W, top, bottom }; }
function transform() {
  const sx = M.W / REF.W, sy = (M.bottom - M.top) / (REF.bottom - REF.top);
  return { sx, sy, s: Math.min(sx, sy), W: M.W, top: M.top, bottom: M.bottom, mid: (M.top + M.bottom) / 2, ref: REF };
}
function def(id) {
  const d = DEFS[id];
  if (!d) throw new Error('布局表里没有 ' + id);
  return Object.assign({}, d, data[id] || {});
}
// 设计稿坐标 → 这台手机上的坐标（逻辑像素）
function rect(id) {
  const d = def(id), T = transform();
  let x, w;
  if (d.ax === 's') { x = d.x * T.sx; w = T.W - (REF.W - d.w) * T.sx; }
  else {
    w = d.w * T.s;
    if (d.ax === 'l') x = d.x * T.sx;
    else if (d.ax === 'r') x = T.W - (REF.W - d.x - d.w) * T.sx - w;
    else x = T.W / 2 + (d.x + d.w / 2 - REF.W / 2) * T.sx - w / 2;
  }
  const h = d.h * T.s;
  let y;
  if (d.ay === 't') y = T.top + (d.y - REF.top) * T.sy;
  else if (d.ay === 'b') y = T.bottom - (REF.bottom - d.y - d.h) * T.sy - h;
  else y = T.mid + (d.y + d.h / 2 - (REF.top + REF.bottom) / 2) * T.sy - h / 2;
  const r = { x, y, w, h };
  used[id] = r;
  return r;
}
// 元素里的字跟着框缩放：框现在的高 ÷ 默认的高
function k(id, r) { return Math.max(0.6, Math.min(1.6, r.h / DEFS[id].h)); }
function beginFrame() { for (const key in used) delete used[key]; }
function setData(elements) { data = elements || {}; }
function getData() { return data; }

module.exports = { REF, DEFS, rect, def, k, transform, setMetrics, beginFrame, used, setData, getData };
