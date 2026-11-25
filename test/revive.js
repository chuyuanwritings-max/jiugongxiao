// 看广告复活的专门测试（0.9.14，Cc 11-26：「看了广告清掉中间，后来又堵死了，结果现在不给我跳出游戏结束的记录……我现在什么都点不了，卡死了」）。
// 真鼠标：堵死 → 结算页点「清空正中间」→ 等占位广告 → 复活继续 → 再堵死 → 结算页一定要弹出来、按钮点得动。
// 也测「换一组」广告。用法：node test/revive.js
const path = require('path');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const url = 'file://' + path.join(__dirname, '..', 'preview.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(400);
  const off = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const clickBtn = async (id) => { const b = await page.evaluate((id) => window.__game.buttons().find((x) => x.id === id), id); if (!b) return false; await page.mouse.click(off.x + b.x + b.w / 2, off.y + b.y + b.h / 2); return true; };
  const drag = async (from, to) => { await page.mouse.move(off.x + from.x, off.y + from.y); await page.mouse.down(); await page.mouse.move(off.x + to.x, off.y + to.y, { steps: 6 }); await page.mouse.up(); };
  // 摆一盘「只剩一个地方放得下」：除了右下角一格全满（不成整排），手上三块里两块放不下、一块 1 格
  const jam = () => page.evaluate(() => {
    const G = window.__game, g = G.g, U = G.core.UNITS;
    // 每排、每竖都正好空 2 格（(c - 2r) mod 9 是 0 或 4），宠物能量清零（不会救命），手上：1 格 + 两块 3×3
    for (let k = 0; k < 81; k++) { const r = Math.floor(k / 9), c = k % 9, m = ((c - 2 * r) % 9 + 9) % 9; g.board[k] = m === 0 || m === 4 ? 0 : 1; if (g.board[k]) { g.color[k] = 0; g.gem[k] = 0; } g.mon[k] = null; }
    g.team.forEach((t) => (t.energy = 0));
    g.hand = [G.core.PIECES['1'], G.core.PIECES.sq3, G.core.PIECES.sq3, null];
    // 1 格放哪都凑不满一个单元：挑一个空格，它所在的排、竖、大格都至少还空 2 格
    const ok = (k) => U.filter((u) => u.includes(k)).every((u) => u.filter((x) => !g.board[x]).length >= 2);
    const k0 = [...Array(81).keys()].find((k) => !g.board[k] && ok(k));
    return k0;
  });
  await page.evaluate(() => { const G = window.__game; G.skipCuts(); G.setSave({ petTutDone: true, petStage: 5, petOrder: ['tongque'], pets: { tongque: { lv: 2, exp: 0 } }, activePet: 'tongque', introSeen: { pet: true, wave: true, gem: true, gempiece: true, box: true, rock: true, steal: true } }); G.newPetLevel(4); G.skipCuts(); });
  await page.waitForTimeout(500);
  // 第一次堵死
  let k0 = await jam();
  let pos = await page.evaluate((k0) => { const G = window.__game, g = G.g; return { from: G.slotCenter(0), to: G.fingerFor(g.hand[0], Math.floor(k0 / 9), k0 % 9) }; }, k0);
  await drag(pos.from, pos.to);
  await page.waitForTimeout(2500);
  let st = await page.evaluate(() => ({ mode: window.__game.mode, over: window.__game.g.over, btn: window.__game.buttons().map((b) => b.id) }));
  ok(st.mode === 'over' && st.btn.includes('revive'), '第一次堵死：弹结算页、有「清空正中间」（' + st.mode + '，' + st.btn.join(',') + '）');
  await clickBtn('revive');
  await page.waitForTimeout(3600); // 占位广告 3 秒
  st = await page.evaluate(() => ({ mode: window.__game.mode, over: window.__game.g.over }));
  ok(st.mode === 'play' && !st.over, '看完广告：复活、接着玩（' + st.mode + '）');
  // 第二次堵死
  await page.waitForTimeout(300);
  k0 = await jam();
  pos = await page.evaluate((k0) => { const G = window.__game, g = G.g; return { from: G.slotCenter(0), to: G.fingerFor(g.hand[0], Math.floor(k0 / 9), k0 % 9) }; }, k0);
  await drag(pos.from, pos.to);
  await page.waitForTimeout(2500);
  st = await page.evaluate(() => ({ mode: window.__game.mode, btn: window.__game.buttons().map((b) => b.id), result: !!window.__game.result, log: (window.__game.save.playLog || []).length, loss: (window.__game.save.loss || {})[4] }));
  ok(st.mode === 'over' && st.result && st.btn.includes('again'), '复活后又堵死：结算页照样弹出来、有「再试一次」（' + st.mode + '，' + st.btn.join(',') + '）');
  ok(st.log === 1 && st.loss === 1, '复活过的那一局只算输一次、记一行（记了 ' + st.log + ' 行，连输 ' + st.loss + ' 次）');
  await clickBtn('again');
  await page.waitForTimeout(600);
  st = await page.evaluate(() => ({ mode: window.__game.mode }));
  ok(st.mode === 'play' || st.mode === 'start' || st.mode === 'intro', '「再试一次」点得动（' + st.mode + '）');
  // 换一组
  await page.evaluate(() => { const G = window.__game; if (G.mode !== 'play') G.skipCuts(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const G = window.__game, g = G.g; g.hand[0] = G.core.PIECES.sq3; g.hand[1] = G.core.PIECES.sq3; for (let k = 0; k < 81; k++) if ((Math.floor(k / 9) % 3) === 1 && g.board[k] === 0) { g.board[k] = 1; g.color[k] = 0; } });
  await page.waitForTimeout(200);
  const hasReroll = await clickBtn('reroll');
  if (hasReroll) { await page.waitForTimeout(3600); }
  st = await page.evaluate(() => ({ mode: window.__game.mode, hand: window.__game.g.hand.slice(0, 3).map((p) => p && p.id).join(',') }));
  ok(!hasReroll || st.mode === 'play', '「换一组」看完广告回到关里（' + (hasReroll ? st.hand : '这盘没出换一组') + '）');
  ok(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} 项通过，${fail} 项没过`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
