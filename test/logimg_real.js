// 真画布版：在 preview.html 里点「把试玩记录发给 Cc」，拿到那张图 → JPEG 压 + 缩小 → tools/decode_log_image.py 解 → 和游戏里的记录对得上（0.9.17）
const path = require('path'), fs = require('fs'), cp = require('child_process'), zlib = require('zlib');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const PY = fs.existsSync('/opt/homebrew/bin/python3.14') ? '/opt/homebrew/bin/python3.14' : 'python3';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('file://' + path.join(__dirname, '..', 'preview.html'));
  await page.waitForTimeout(600);
  // 造一段像样的记录：打几关（机器人）
  const n = await page.evaluate(async () => {
    const G = window.__game, s = G.save; s.petTutDone = true; s.tutorialDone = true; s.pets = { tongque: { lv: 2, exp: 0 } }; s.petOrder = ['tongque']; s.activePet = 'tongque'; s.petStage = 9; s.introSeen = { crawl: 1, metal: 1, rush: 1, moss: 1, boss: 1, pet: 1, catch: 1 };
    for (let i = 2; i < 10; i++) { G.newPetLevel(i, true); const g = G.g; for (let k = 0; k < 120 && !g.over; k++) { const m = G.PG.bestMove(g, 1); if (!m) break; G.T.rec('d', m.i, m.r, m.c, g.hand[m.i].id, 0, 1, 0); g.place(m.i, m.r, m.c); } G.T.rec('E', g.won ? 1 : 0, g.moves, 60, 100); }
    G.mode = 'settings'; return G.T.count();
  });
  await page.waitForTimeout(300);
  const b = await page.evaluate(() => window.__game.buttons().find((x) => x.id === 'setSendLog'));
  const r = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(); return { x: c.left, y: c.top }; });
  await page.mouse.click(r.x + b.x + b.w / 2, r.y + b.y + b.h / 2);
  await page.waitForTimeout(800);
  const src = await page.evaluate(() => { const i = document.getElementById('shareImg'); return i ? i.src : null; });
  const ev = await page.evaluate(() => JSON.stringify(window.__game.T._all()));
  await browser.close();
  if (!src) { console.log('✗ 没弹出图'); process.exit(1); }
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jgxr-')), png = path.join(dir, 'log.png'), jpg = path.join(dir, 'log.jpg');
  fs.writeFileSync(png, Buffer.from(src.split(',')[1], 'base64'));
  cp.execFileSync(PY, ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(png)}); im=im.resize((int(im.width*0.7),int(im.height*0.7))); im.convert('RGB').save(${JSON.stringify(jpg)}, quality=55)`]);
  const out = cp.execFileSync(PY, ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '..', 'tools'))}); import decode_log_image as d; print(d.decode(${JSON.stringify(jpg)})[0])`]).toString().trim();
  const obj = JSON.parse(zlib.inflateRawSync(Buffer.from(out.slice(5), 'base64')).toString('utf8'));
  const okEv = obj.ev.length >= n && JSON.stringify(obj.ev) === JSON.stringify(JSON.parse(ev).slice(obj.cut || 0, (obj.cut || 0) + obj.ev.length)); // 点按钮那一下之后又多记了几条，只比图里装的那一段
  console.log((okEv ? '✓' : '✗') + ' 真画布出图（' + n + ' 条记录，图 ' + png + '）→ JPEG 55 缩到 70% → 解回来和游戏里的记录一模一样（解出 ' + obj.ev.length + ' 条，版本 ' + obj.ver + '）');
  process.exit(okEv ? 0 : 1);
})();
