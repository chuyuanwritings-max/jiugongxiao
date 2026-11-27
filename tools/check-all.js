// 一条命令跑全部检查（0.9.25 收拾第 2 步，Fable 代码体检「做完的 5 个条件」之 1、4）。用法：node tools/check-all.js [--no-baseline]
// ① 先核对 preview.html 里盖的指纹和现在的代码对不对得上：对不上 = 测的是旧包，直接停；
// ② 跑留底（玩法没被收拾改坏）；③ 跑全部测试。全过才算绿。不许有「一直不过」的测试：过时的要么改要么删。
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const want = require('./srchash.js')(root);
const html = fs.readFileSync(path.join(root, 'preview.html'), 'utf8'), m = html.match(/window\.__BUILD = '([0-9a-f]+)'/);
if (!m || m[1] !== want) { console.log('✗ preview.html 是旧包（包里 ' + (m ? m[1] : '没有指纹') + '，代码是 ' + want + '）。先跑 node tools/build-preview.js'); process.exit(2); }
console.log('✓ 包是新的（指纹 ' + want + '）');
const TESTS = [
  // 不开画面的
  ['rush_flow', 'node'], ['ch1_measure', 'node', ['20']],
  // 段 1 规则测试（规则细设计第三节）
  ['rules_obstacle', 'node'], ['rules_mud', 'node'], ['rules_energy', 'node'], ['rules_tongque', 'node'], ['rules_baozhu', 'node'], ['rules_pets', 'node'], ['rules_levels', 'node'],
  // 开画面的（Playwright，测的是 preview.html）
  ['wx-play', 'pw'], ['newplayer', 'pw'], ['revive', 'pw'], ['chapter_pick', 'pw'], ['gnaw_cancel', 'pw'], ['rush_sound', 'pw'], ['rush_speed', 'pw'], ['logpages_real', 'pw'], ['logimg', 'node'], ['wx-smoke', 'pw'], ['wx-copy', 'node'], ['wx-full', 'node'], ['softlock', 'node'],
];
const only = process.argv.filter((a) => !a.startsWith('--')).slice(2);
const res = [];
if (!process.argv.includes('--no-baseline')) {
  try { execFileSync('node', [path.join(__dirname, 'baseline.js'), 'check'], { stdio: 'pipe', timeout: 600000 }); res.push(['留底', true, '']); }
  catch (e) { res.push(['留底', false, String(e.stdout || '').trim().split('\n').pop()]); }
}
// 12 个主要画面 × 三种尺寸截图，任何一页报错就算没过（0.9.25 拆守城时差点把共用的小工具一起删了）
if (!only.length) { try { execFileSync('node', [path.join(__dirname, 'shots.js'), 'check'], { cwd: root, stdio: 'pipe', timeout: 600000 }); res.push(['三尺寸截图不报错', true, 'test/baseline/shots/check/']); } catch (e) { res.push(['三尺寸截图不报错', false, String(e.stdout || '').trim().split('\n').filter((l) => l.includes('✗')).join(' / ').slice(0, 200)]); } }
for (const [name, , args] of TESTS) {
  if (only.length && !only.includes(name)) continue;
  const f = path.join(root, 'test', name + '.js'); if (!fs.existsSync(f)) { res.push([name, false, '测试文件不见了']); continue; }
  const t0 = Date.now();
  try { const out = execFileSync('node', [f].concat(args || []), { cwd: root, stdio: 'pipe', timeout: 600000 }).toString(); res.push([name, true, (out.trim().split('\n').reverse().find((l) => /项通过|✓|通过/.test(l)) || '').slice(0, 60) + '（' + Math.round((Date.now() - t0) / 1000) + ' 秒）']); }
  catch (e) { const out = String(e.stdout || '') + String(e.stderr || ''); res.push([name, false, (out.split('\n').filter((l) => l.includes('✗')).slice(0, 2).join(' / ') || out.trim().split('\n').pop() || '').slice(0, 160)]); }
}
res.forEach(([n, ok, msg]) => console.log((ok ? '✓ ' : '✗ ') + n + '  ' + msg));
const bad = res.filter((r) => !r[1]).length;
console.log(bad ? '\n✗ ' + bad + ' 项没过' : '\n✓ 全绿：' + res.length + ' 项');
process.exit(bad ? 1 : 0);
