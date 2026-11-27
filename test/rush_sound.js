// 0.9.23 冲锋关连消声（Cc 11-27：「第一次“消”是一声，第二次“消”是提高音调……直到第五次“消”才是连音的那个编钟……为什么第七关上来直接就是连音的编钟啊？」）
// 真点屏幕把第 7 关塞 7 块，看每一块放的消除声：应该是 clear0、clear1、clear2、clear3、clear4、sweep、clear0
const path = require('path');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
(async () => {
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('file://' + path.join(__dirname, '..', 'preview.html')); await page.waitForTimeout(400);
  const off = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await page.evaluate(() => { const G = window.__game; G.setSave({ petTutDone: true, tutorialDone: true, petStage: 8, introSeen: { rush: true }, pets: { tongque: { lv: 3, exp: 0 } }, petOrder: ['tongque'], activePet: 'tongque' }); G.newPetLevel(6); G.skipCuts(); G.CUT.clear(); G.mode = 'play'; });
  await page.waitForTimeout(1500);
  const got = [];
  for (let n = 0; n < 7; n++) {
    await page.evaluate(() => window.__game.clearSoundLog());
    const mv = await page.evaluate(() => { const G = window.__game, g = G.g; for (let i = 0; i < 3; i++) { if (!g.hand[i]) continue; const at = g.rushGap[i]; if (at && g.rushOK(i, at.r, at.c)) return { from: G.slotCenter(i), to: G.fingerFor(g.hand[i], at.r, at.c) }; } return null; });
    if (!mv) break;
    await page.mouse.move(off.x + mv.from.x, off.y + mv.from.y); await page.mouse.down();
    for (let k = 1; k <= 6; k++) { await page.mouse.move(off.x + mv.from.x + (mv.to.x - mv.from.x) * k / 6, off.y + mv.from.y + (mv.to.y - mv.from.y) * k / 6); await page.waitForTimeout(10); }
    await page.mouse.up(); await page.waitForTimeout(900);
    const log = await page.evaluate(() => window.__game.soundLog());
    const fresh = log.filter((x) => /^clear\d|^sweep$/.test(x));
    got.push(fresh[0] || '（没声）');
  }
  console.log('7 块的消除声：' + got.join(' → '));
  const want = ['clear0', 'clear1', 'clear2', 'clear3', 'clear4', 'sweep', 'clear0'];
  ok(got.join() === want.join(), '一块升一级、第 6 块才扫上去（编钟连音）、第 7 块从头');
  console.log(pass + ' 项通过，' + fail + ' 项没过'); await browser.close(); process.exit(fail ? 1 : 0);
})();
