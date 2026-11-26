// 试玩记录方格图：画 → 存成图 → 用 JPEG 压、缩小（模拟微信发图） → tools/decode_log_image.py 解回 → 和原来一字不差（0.9.17）
// 用法：node test/logimg.js
const fs = require('fs'), path = require('path'), zlib = require('zlib'), cp = require('child_process');
const Z = require('../js/deflate.js'), LI = require('../js/logimg.js');
const PY = fs.existsSync('/opt/homebrew/bin/python3.14') ? '/opt/homebrew/bin/python3.14' : 'python3';
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jgxi-'));
// 假画布：只认 fillRect（logimg 只用它画格子）和 fillText（不画，字不影响解码）
function fakeCanvas(w, h) {
  const px = new Uint8Array(w * h).fill(255); let fill = 255;
  const ctx = { set fillStyle(v) { fill = /#0{6}/.test(v) ? 0 : 255; }, get fillStyle() { return fill; }, fillRect(x, y, ww, hh) { for (let j = Math.max(0, y | 0); j < Math.min(h, (y + hh) | 0); j++) px.fill(fill, j * w + Math.max(0, x | 0), j * w + Math.min(w, (x + ww) | 0)); }, fillText() {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {} };
  return { width: w, height: h, getContext: () => ctx, px };
}
function savePgm(c, file) { fs.writeFileSync(file, Buffer.concat([Buffer.from('P5\n' + c.width + ' ' + c.height + '\n255\n'), Buffer.from(c.px)])); }
// 造几份记录：小的、真人那份、大的（超过容量要截）
const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'real_log.json'), 'utf8'));
const evs = []; for (let i = 0; i < 6000; i++) evs.push([i % 37, 'dpxkLE'[i % 6], i % 9, (i * 7) % 81, 'L3', i % 3]);
const cases = [
  { name: '小', obj: { game: '九宫消', fmt: 1, ver: 'test', log: real.slice(0, 3), ev: evs.slice(0, 200) } },
  { name: '十关左右', obj: { game: '九宫消', fmt: 1, ver: 'test', log: real, ev: evs.slice(0, 1500) } },
  { name: '很大', obj: { game: '九宫消', fmt: 1, ver: 'test', log: real, ev: evs } },
];
let fail = 0;
for (const cs of cases) {
  let raw = JSON.stringify(cs.obj), z = Z.deflateRaw(Z.utf8(raw));
  if (z.length > LI.capacity()) { // 和游戏里一样：只留最近的
    let n = cs.obj.ev.length; while (n > 0 && z.length > LI.capacity()) { n = Math.floor(n * 0.9); raw = JSON.stringify(Object.assign({}, cs.obj, { ev: cs.obj.ev.slice(-n) })); z = Z.deflateRaw(Z.utf8(raw)); }
  }
  const cv = LI.draw(z, fakeCanvas, { title: 't', lines: [] });
  const pgm = path.join(tmp, cs.name + '.pgm');
  savePgm(cv, pgm);
  for (const [q, sc] of [[95, 1], [60, 0.75], [45, 0.6]]) { // 原图；微信普通压缩；压得很狠
    const jpg = path.join(tmp, cs.name + '_' + q + '.jpg');
    cp.execFileSync(PY, ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(pgm)}); im=im.resize((int(im.width*${sc}),int(im.height*${sc})), Image.BILINEAR); im.convert('RGB').save(${JSON.stringify(jpg)}, quality=${q})`]);
    let out = '';
    try { out = cp.execFileSync(PY, ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '..', 'tools'))}); import decode_log_image as d; print(d.decode(${JSON.stringify(jpg)})[0])`]).toString().trim(); } catch (e) { out = 'ERR ' + (e.stdout || '') + (e.stderr || ''); }
    let ok = false;
    try { ok = zlib.inflateRawSync(Buffer.from(out.slice(5), 'base64')).toString('utf8') === raw; } catch (e) { ok = false; }
    console.log((ok ? '✓' : '✗') + ' ' + cs.name + '（' + z.length + ' 字节，图 ' + cv.width + '×' + cv.height + '）JPEG ' + q + ' 缩到 ' + Math.round(sc * 100) + '%');
    if (!ok) { fail++; console.log('   ', out.slice(0, 200)); }
  }
}
console.log(fail ? '有 ' + fail + ' 项没过' : '全部通过');
process.exit(fail ? 1 : 0);
