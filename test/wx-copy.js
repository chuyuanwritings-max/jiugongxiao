// 微信里「复制试玩记录」的专门测试（0.9.15，Cc 11-26：「复制试玩记录还是复制不了，他说失败了」）。
// 真微信里剪贴板是隐私接口：后台没声明「剪贴板」时 wx.setClipboardData 走 fail（errno 112）。这里照那样模拟：
//   1. 复制成功：剪贴板里是能解开的完整记录；
//   2. 复制被拦（errno 112）：不能只说「失败」——要弹出微信输入弹窗，把记录一段段放进去，拼起来正好是完整记录；按钮上写原因；记一条出错（X）。
// 用法：node test/wx-copy.js
const { boot, playStep } = require('./wx-env.js');
const D = require('./decode_log.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };

function playSome(E) { // 打两关攒点记录
  const { G, run, btn, tap } = E;
  for (let s = 0; s < 3000 && G.save.petStage < 2; s++) {
    const m = G.mode;
    if (m === 'cut') { E.touch('down', 195, 420); run(2); E.touch('up', 195, 420); run(2); continue; }
    if (m === 'intro') { run(10); const b = btn('introOk'); if (b) tap(b); continue; }
    if (m === 'start') { run(10); const b = btn('startGo'); if (b) tap(b); continue; }
    if (m === 'over') { run(80); const b = G.result && G.result.won ? btn('tocamp') : btn('again'); if (b) tap(b); continue; }
    if (m === 'camp') { tap(btn('campPlay')); continue; }
    if (m === 'map') { const b = btn('play'); if (b) tap(b); continue; }
    if (m === 'play') { if (G.g.over) { run(20); continue; } if (!playStep(E)) run(20); continue; }
    run(5);
  }
}

// 1. 复制成功
{
  const E = boot({ seed: 3 });
  playSome(E);
  E.G.mode = 'settings'; E.run(3);
  E.tap(E.btn('setCopyLog')); E.run(3);
  let d = null; try { d = D.decode(E.env.clip); } catch (e) {}
  ok(d && d.events.length > 20 && d.log.length >= 1, '微信复制成功：剪贴板里是能解开的完整记录（' + (E.env.clip || '').length + ' 字，' + (d ? d.events.length : 0) + ' 条操作）');
  E.restore();
}
// 2. 复制被微信拦住（errno 112：没在隐私指引里声明剪贴板）
{
  const E = boot({ seed: 4 });
  const shown = [];
  global.wx.setClipboardData = (x) => x.fail && x.fail({ errMsg: 'setClipboardData:fail api scope is not declared in the privacy agreement', errno: 112 });
  global.wx.showModal = (x) => { shown.push(x); x.success && x.success({ confirm: true, content: x.content }); };
  playSome(E);
  E.G.mode = 'settings'; E.run(3);
  const full = E.G.T.exportText({ ver: 'x', log: E.G.save.playLog || [] });
  E.tap(E.btn('setCopyLog')); E.run(3);
  const chunks = shown.filter((x) => x.editable).map((x) => x.content);
  const joined = chunks.join('');
  let d = null; try { d = D.decode(joined); } catch (e) {}
  ok(chunks.length >= 1 && d && d.events.length > 20, '复制被拦：弹出微信输入弹窗 ' + chunks.length + ' 段，拼起来是能解开的完整记录（' + joined.length + ' 字）');
  ok(chunks.every((c) => c.length <= 1000), '每段不超过 1000 字');
  ok(shown.length && /第 1\/\d+ 段|试玩记录/.test(shown[0].title || ''), '弹窗标题写清第几段（「' + (shown[0] && shown[0].title) + '」）');
  // 0.9.25：提示「怎么做」写在上面那颗大按钮（setSendLog）上，「复制文字」按钮本身不换字（0.9.17 起就这样，这条测试一直红）
  const label = [(E.btn('setSendLog') || {}).label, (E.btn('setCopyLog') || {}).label].join(' ');
  ok(/长按|拷贝/.test(label), '按钮上写怎么做（「' + label + '」），不只说失败');
  const xs = E.errs().filter((e) => e[2] === 'copy');
  ok(xs.length >= 1 && /privacy|112/.test(JSON.stringify(xs[0])), '复制被拦的原因记进了试玩记录（' + (xs[0] ? String(xs[0][3]).slice(0, 60) : '没有') + '）');
  E.restore();
}
console.log(`\n${pass} 项通过，${fail} 项没过`);
process.exit(fail ? 1 : 0);
