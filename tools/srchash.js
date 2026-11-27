// 源代码指纹（0.9.25 收拾第 2 步，Fable 代码体检）：game.js + js/*.js 的内容算一个 sha1。
// 打包时盖进 preview.html；测试开跑前先核对，包是旧的就不许测（0.9.22 吃过「测的是旧包」的亏）
const fs = require('fs'), path = require('path'), crypto = require('crypto');
module.exports = function srcHash(root) {
  const files = ['game.js'].concat(fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js') && f !== 'layout_data.js').sort().map((f) => 'js/' + f));
  const h = crypto.createHash('sha1');
  files.forEach((f) => { h.update(f + '\n'); h.update(fs.readFileSync(path.join(root, f))); });
  const lay = path.join(root, 'layout.json'); if (fs.existsSync(lay)) h.update(fs.readFileSync(lay));
  return h.digest('hex').slice(0, 12);
};
