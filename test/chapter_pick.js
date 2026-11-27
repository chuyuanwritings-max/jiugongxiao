// 0.9.21 章页选哪关玩哪关（Cc 11-27：「我选了第 16 关之后，按 play 还是自动往后面玩」）+ 测试员模式（任选关卡，不改真进度）
const path = require('path');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
(async () => {
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('file://' + path.join(__dirname, '..', 'preview.html')); await page.waitForTimeout(400);
  const off = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const click = async (id) => { const b = await page.evaluate((id) => window.__game.buttons().find((x) => x.id === id), id); if (!b) return false; await page.mouse.click(off.x + b.x + b.w / 2, off.y + b.y + b.h / 2); await page.waitForTimeout(150); return true; };
  const base = { petTutDone: true, tutorialDone: true, introSeen: { rush: true }, pets: { tongque: { lv: 3, exp: 0 }, baozhu: { lv: 2, exp: 0 } }, petOrder: ['tongque', 'baozhu'], activePet: 'tongque' };
  await page.evaluate((b) => { const G = window.__game; G.setSave(Object.assign({}, b, { petStage: 17, tester: false })); G.mode = 'map'; }, base);
  await page.waitForTimeout(200);
  await click('chNext'); await page.waitForTimeout(150);
  ok(await click('cell15'), '第二章能点第 16 关');
  await click('play'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => window.__game.petIdx) === 15, '选了第 16 关按开始，进的是第 16 关（不是第 18 关）：' + await page.evaluate(() => window.__game.petIdx + 1));
  // 测试员模式
  await page.evaluate((b) => { const G = window.__game; G.setSave(Object.assign({}, b, { petStage: 3, tester: false })); G.mode = 'settings'; }, base);
  await page.waitForTimeout(150);
  ok(await click('setTester'), '设置里有测试员模式按钮');
  ok(await page.evaluate(() => window.__game.save.tester === true), '点一下打开');
  await page.evaluate(() => { window.__game.mode = 'map'; }); await page.waitForTimeout(150);
  await click('chNext'); await page.waitForTimeout(150);
  ok(await click('cell15'), '测试员模式：没打到的第 16 关也能点');
  await click('play'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => window.__game.petIdx) === 15, '测试员模式：进得去第 16 关');
  const after = await page.evaluate(() => { const G = window.__game; G.g.over = true; G.g.won = true; G.g.reason = 'win'; G.g.got.lines = 99; G.endGame(); return G.save.petStage; });
  ok(after === 3, '测试员跳着打赢第 16 关，真进度不变（还是第 4 关）：' + after);
  console.log(pass + ' 项通过，' + fail + ' 项没过'); await browser.close(); process.exit(fail ? 1 : 0);
})();
