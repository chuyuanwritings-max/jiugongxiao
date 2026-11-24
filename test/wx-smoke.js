// 假装成微信小游戏环境跑 game.js：没有 document、没有 window，只有 wx。
// 能跑完 = 代码里没偷偷用网页才有的东西。用法：node test/wx-smoke.js
const path = require('path');
const calls = new Set();
const ctx = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
    return (...a) => { calls.add(k); };
  },
  set(t, k, v) { t[k] = v; return true; },
});
const handlers = {};
let frames = [];
global.wx = {
  createCanvas: () => ({ width: 0, height: 0, getContext: () => ctx }),
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3 }),
  onTouchStart: (f) => (handlers.down = f),
  onTouchMove: (f) => (handlers.move = f),
  onTouchEnd: (f) => (handlers.up = f),
  onTouchCancel: () => {},
  vibrateShort: () => {},
  getStorageSync: () => '',
  setStorageSync: () => {},
};
global.requestAnimationFrame = (f) => frames.push(f);
if (typeof global.document !== 'undefined' || typeof global.window !== 'undefined') throw new Error('环境不干净');

require(path.join(__dirname, '..', 'game.js'));
const run = (n) => { for (let i = 0; i < n; i++) { const f = frames.shift(); if (f) f(); } };
run(5);
const touch = (type, x, y) => handlers[type]({ changedTouches: [{ identifier: 1, clientX: x, clientY: y }] });
// 从托盘拖第一块到棋盘中间
touch('down', 65, 650); run(3); touch('move', 195, 420); run(3); touch('up', 195, 420); run(30);
for (const pt of [[195, 400], [195, 400]]) { touch('down', ...pt); touch('up', ...pt); run(30); }
run(200);
console.log('微信环境跑通：' + frames.length + ' 帧排队中，画图调用 ' + calls.size + ' 种');
if (!handlers.down || !calls.has('fillRect')) throw new Error('没画出东西或没注册触摸');
// 包体（0.9.4，检验法 A3）：照 project.config.json 的 ignore 算会打进微信包的文件，主包超过 4 MB 直接报错（自己留余量 3.5 MB 时提醒）
{
  const fs = require('fs');
  const root = path.join(__dirname, '..');
  const ign = (JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8')).packOptions || {}).ignore || [];
  const skipDir = new Set(ign.filter((x) => x.type === 'folder').map((x) => x.value).concat(['.git', 'node_modules']));
  const skipFile = new Set(ign.filter((x) => x.type === 'file').map((x) => x.value));
  let total = 0;
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir)) {
      const r = rel ? rel + '/' + name : name, p = path.join(dir, name), st = fs.statSync(p);
      if (st.isDirectory()) { if (!skipDir.has(r) && !skipDir.has(name) && !name.startsWith('.')) walk(p, r); }
      else if (!skipFile.has(r) && !name.startsWith('.') && !/\.md$/.test(name)) total += st.size;
    }
  };
  walk(root, '');
  const mb = (total / 1048576).toFixed(2);
  console.log('微信包大小：' + mb + ' MB（上限 4 MB）');
  if (total > 4 * 1048576) throw new Error('微信主包超过 4 MB：' + mb + ' MB');
  if (total > 3.5 * 1048576) console.log('提醒：主包超过 3.5 MB，快到上限了');
}
