// 0.9.24 冲锋关不够快就输（Cc 11-27：「爽关唯一难度就是在速度上……不够快就输了」）
// ① 手快的人（每块拖 0.1 秒、看 0.6 秒）塞完第 7 关要几秒、拿几星；② 香烧完还没塞够 → 输，结算页只有「再试一次」，没有救命
const path = require('path');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
(async () => {
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('file://' + path.join(__dirname, '..', 'preview.html')); await page.waitForTimeout(400);
  const off = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const start = async (li) => { await page.evaluate((li) => { const G = window.__game; G.setSave({ petTutDone: true, tutorialDone: true, petStage: 17, introSeen: { rush: true }, pets: { tongque: { lv: 3, exp: 0 } }, petOrder: ['tongque'], activePet: 'tongque' }); G.newPetLevel(li); G.skipCuts(); G.CUT.clear(); G.mode = 'play'; }, li); await page.waitForTimeout(1200); };
  for (const [li, think] of [[6, 600], [6, 1100], [15, 600]]) {
    await start(li);
    for (let n = 0; n < 40; n++) {
      const st = await page.evaluate(() => { const g = window.__game.g; return { over: g.over }; }); if (st.over) break;
      const mv = await page.evaluate(() => { const G = window.__game, g = G.g; for (let i = 0; i < 3; i++) { if (!g.hand[i]) continue; const at = g.rushGap[i]; if (at && g.rushOK(i, at.r, at.c)) return { from: G.slotCenter(i), to: G.fingerFor(g.hand[i], at.r, at.c) }; } return null; });
      if (!mv) { await page.waitForTimeout(100); continue; }
      await page.waitForTimeout(think);
      await page.mouse.move(off.x + mv.from.x, off.y + mv.from.y); await page.mouse.down();
      for (let k = 1; k <= 5; k++) { await page.mouse.move(off.x + mv.from.x + (mv.to.x - mv.from.x) * k / 5, off.y + mv.from.y + (mv.to.y - mv.from.y) * k / 5); await page.waitForTimeout(20); }
      await page.mouse.up();
    }
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const G = window.__game, g = G.g; return { won: g.won, sec: g.rushSec, stars: G.result && G.result.stars, lose: g.stage.rush.lose, t3: g.stage.rush.t3, t2: g.stage.rush.t2 }; });
    console.log('第 ' + (li + 1) + ' 关，每块看 ' + think / 1000 + ' 秒：' + (r.won ? '赢' : '输') + '，用了 ' + (r.sec || 0).toFixed(1) + ' 秒，' + (r.stars || 0) + ' 星（3 星 ≤ ' + r.t3 + ' 秒，2 星 ≤ ' + r.t2 + ' 秒，' + r.lose + ' 秒烧完就输）');
    if (think === 600) ok(r.won && r.stars === 3, '第 ' + (li + 1) + ' 关手快（每块看 0.6 秒）拿得到 3 星');
  }
  // 还没烧完：50 秒时还在打
  await start(6);
  await page.evaluate(() => { const g = window.__game.g; g.rushT0 = Date.now() - 50000; });
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => !window.__game.g.over), '50 秒时香还没烧完，还在打');
  // 香烧完
  await start(6);
  await page.evaluate(() => { const g = window.__game.g; g.rushT0 = Date.now() - 61000; });
  await page.waitForTimeout(2500);
  const lost = await page.evaluate(() => { const G = window.__game, g = G.g; return { over: g.over, won: g.won, reason: g.reason, mode: G.mode, btns: G.buttons().map((b) => b.id) }; });
  ok(lost.over && !lost.won && lost.reason === 'time', '香烧完还没塞够：输了（' + lost.reason + '）');
  ok(lost.btns.includes('again') && !lost.btns.includes('revive'), '输了只给「再试一次」，没有救命：' + lost.btns.join(','));
  console.log(pass + ' 项通过，' + fail + ' 项没过'); await browser.close(); process.exit(fail ? 1 : 0);
})();
