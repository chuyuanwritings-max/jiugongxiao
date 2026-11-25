// 试玩记录「复制」的专门测试（0.9.11：Cc 在手机网页里点复制报「复制不了」，记录拿不出来）。
// 真鼠标点按钮（算「手指点下去」），分三种浏览器：
//   1. 普通浏览器：剪贴板里真有全部记录；
//   2. 像微信内置浏览器 / iPhone 网页：没有 navigator.clipboard、execCommand 也复制不了 → 弹出复制框，框里是全部记录，点「复制」有回应；
//   3. 只有老办法能用（没有 navigator.clipboard）：照样复制成功。
// 另外查：中途退出也记一行。用法：node test/copylog.js
const path = require('path');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const url = 'file://' + path.join(__dirname, '..', 'preview.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };

async function openWith(browser, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(400);
  const off = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  // 造 37 局记录，进设置页
  await page.evaluate(() => {
    const G = window.__game; G.skipCuts();
    G.save.playLog = Array.from({ length: 37 }, (_, i) => ({ lv: (i % 9) + 1, won: i % 3 ? 1 : 0, moves: 30 + i, sec: 120 + i, ver: 'test' }));
    G.mode = 'settings';
  });
  await page.waitForTimeout(120);
  const clickBtn = async (id) => {
    const b = await page.evaluate((id) => window.__game.buttons().find((x) => x.id === id), id);
    if (!b) return false;
    await page.mouse.click(off.x + b.x + b.w / 2, off.y + b.y + b.h / 2);
    return true;
  };
  return { ctx, page, off, errors, clickBtn };
}

(async () => {
  const browser = await chromium.launch();

  // 1. 普通浏览器
  {
    const { ctx, page, errors, clickBtn } = await openWith(browser);
    ok(await clickBtn('setCopyLog'), '设置页有「复制试玩记录」');
    await page.waitForTimeout(300);
    const got = await page.evaluate(() => navigator.clipboard.readText());
    let n = -1; try { n = JSON.parse(got).log.length; } catch (e) {}
    const box = await page.$('#copyBox');
    ok(n === 37 && !box, '普通浏览器：一点就复制进剪贴板，37 局全在（实际 ' + n + ' 局），不弹框');
    ok(errors.length === 0, '普通浏览器：没有报错' + (errors.length ? '：' + errors[0] : ''));
    await ctx.close();
  }

  // 2. 像微信内置浏览器：两种复制都不给用
  {
    const { ctx, page, errors, clickBtn } = await openWith(browser, () => {
      Object.defineProperty(navigator, 'clipboard', { get: () => undefined });
      document.execCommand = () => false;
    });
    await clickBtn('setCopyLog');
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => { const t = document.getElementById('copyBoxText'); return t ? t.value : null; });
    let n = -1; try { n = JSON.parse(box).log.length; } catch (e) {}
    ok(n === 37, '复制不了的浏览器：弹出复制框，框里是全部 37 局（实际 ' + n + ' 局）');
    await page.click('#copyBoxCopy');
    const label = await page.textContent('#copyBoxCopy');
    const sel = await page.evaluate(() => { const t = document.getElementById('copyBoxText'); return t.selectionEnd - t.selectionStart; });
    ok(/全选/.test(label) && sel === box.length, '复制框的「复制」点了有回应：全选好了，提示长按拷贝（「' + label + '」）');
    const msg = await page.evaluate(() => window.__game.buttons().find((x) => x.id === 'setCopyLog').label);
    ok(/弹出的框/.test(msg), '游戏里的按钮写「在弹出的框里复制」，不再写「截个图」（「' + msg + '」）');
    await page.click('text=关闭');
    ok(!(await page.$('#copyBox')), '复制框能关掉');
    ok(errors.length === 0, '复制不了的浏览器：没有报错' + (errors.length ? '：' + errors[0] : ''));
    await ctx.close();
  }

  // 3. 只有老办法
  {
    const { ctx, page, clickBtn } = await openWith(browser, () => {
      Object.defineProperty(navigator, 'clipboard', { get: () => undefined });
    });
    await clickBtn('setCopyLog');
    await page.waitForTimeout(300);
    const box = await page.$('#copyBox');
    const msg = await page.evaluate(() => window.__game.buttons().find((x) => x.id === 'setCopyLog').label);
    ok(!box && /已复制 37 局/.test(msg), '没有新剪贴板的浏览器：老办法复制成功（「' + msg + '」）');
    await ctx.close();
  }

  // 4. 中途退出也记一行
  {
    const { ctx, page, off } = await openWith(browser);
    await page.evaluate(() => { const G = window.__game; G.save.playLog = []; G.newPetLevel(0); });
    await page.waitForTimeout(200);
    const pos = await page.evaluate(() => { const G = window.__game, b = G.PG.bestMove(G.g, 1); return { from: G.slotCenter(b.i), to: G.fingerFor(G.g.hand[b.i], b.r, b.c) }; });
    await page.mouse.move(off.x + pos.from.x, off.y + pos.from.y); await page.mouse.down();
    await page.mouse.move(off.x + pos.to.x, off.y + pos.to.y, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(200);
    const b = await page.evaluate(() => window.__game.buttons().find((x) => x.id === 'map'));
    await page.mouse.click(off.x + b.x + b.w / 2, off.y + b.y + b.h / 2);
    await page.waitForTimeout(150);
    const log = await page.evaluate(() => window.__game.save.playLog);
    ok(log.length === 1 && log[0].quit === 1 && log[0].lv === 1 && log[0].moves >= 1, '打了一手就退回地图：记下一行「中途退出」（' + JSON.stringify(log[0] || {}).slice(0, 80) + '）');
    await ctx.close();
  }

  console.log(`\n${pass} 项通过，${fail} 项没过`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
