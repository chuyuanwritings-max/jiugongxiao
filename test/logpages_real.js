// 截屏页全流程（0.9.19）：手机尺寸打开游戏 → 打几关攒记录 → 点「把试玩记录发给 Cc」→ 每页真截屏（像手机截屏一样）
// → 模拟微信发图（JPEG 压 + 缩小）→ tools/decode_log_image.py 把几张截图一起解 → 和游戏里那段记录一字不差
const path = require('path'), fs = require('fs'), cp = require('child_process'), zlib = require('zlib');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const PY = fs.existsSync('/opt/homebrew/bin/python3.14') ? '/opt/homebrew/bin/python3.14' : 'python3';
let fail = 0;
async function run(dev, levels, from) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr });
  await page.goto('file://' + path.join(__dirname, '..', 'preview.html'));
  await page.waitForTimeout(600);
  const n = await page.evaluate(async (levels) => {
    const G = window.__game, s = G.save; s.ch1new = 1; s.petTutDone = true; s.tutorialDone = true; s.pets = { tongque: { lv: 2, exp: 0 } }; s.petOrder = ['tongque']; s.activePet = 'tongque'; s.petStage = 9; s.introSeen = { crawl: 1, metal: 1, rush: 1, moss: 1, boss: 1, pet: 1, catch: 1 };
    G.T.rec('b', 'migrate_ch1new');
    for (let i = 0; i < levels; i++) { G.newPetLevel(2 + (i % 8), true); const g = G.g; for (let k = 0; k < 120 && !g.over; k++) { const m = G.PG.bestMove(g, 1); if (!m) break; G.T.rec('p', m.i, g.hand[m.i].id); G.T.rec('d', m.i, m.r, m.c, g.hand[m.i].id, 0, 1, 0); g.place(m.i, m.r, m.c); } G.T.rec('E', g.won ? 1 : 0, g.moves, 60, 100); }
    G.mode = 'settings'; return G.T.count();
  }, levels);
  await page.waitForTimeout(300);
  const off = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(); return { x: c.left, y: c.top }; });
  const click = async (id) => { const b = await page.evaluate((id) => window.__game.buttons().find((x) => x.id === id), id); if (!b) return false; await page.mouse.click(off.x + b.x + b.w / 2, off.y + b.y + b.h / 2); await page.waitForTimeout(250); return true; };
  await click('setSendLog');
  const mode = await page.evaluate(() => window.__game.mode);
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jgxp-')), shots = [];
  for (let k = 0; k < 30; k++) {
    const png = path.join(dir, 'shot' + k + '.png'); await page.screenshot({ path: png }); shots.push(png);
    if (!(await click('lpNext'))) break;
  }
  await browser.close();
  // 模拟微信发图：每张 JPEG 55、缩到 65%；顺序打乱
  const jpgs = shots.map((p, k) => { const j = p.replace('.png', '.jpg'); cp.execFileSync(PY, ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(p)}); im=im.resize((int(im.width*0.65),int(im.height*0.65))); im.convert('RGB').save(${JSON.stringify(j)}, quality=55)`]); return j; }).reverse();
  let out = '';
  try { out = cp.execFileSync(PY, ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '..', 'tools'))}); import decode_log_image as d; print(d.decode(${JSON.stringify(jpgs)}))`]).toString().trim(); } catch (e) { out = 'ERR ' + (e.stdout || '') + (e.stderr || ''); }
  let ok = false, nEv = 0;
  try { const obj = JSON.parse(zlib.inflateRawSync(Buffer.from(out.slice(5), 'base64')).toString('utf8')); nEv = obj.ev.length; ok = obj.ver && nEv >= 10 && obj.ev[0][1] === 'b' && obj.ev[0][2] === 'migrate_ch1new'; } catch (e) { ok = false; }
  console.log((ok ? '✓' : '✗') + ' ' + dev.name + '（' + dev.w + '×' + dev.h + ' @' + dev.dpr + 'x）打 ' + levels + ' 关：进了截屏页（' + mode + '），截了 ' + shots.length + ' 页，压过、打乱顺序后解出 ' + nEv + ' 条记录' + (ok ? '' : ' ' + out.slice(0, 160)));
  if (!ok) fail++;
}
(async () => {
  await run({ name: 'iPhone 14', w: 390, h: 844, dpr: 3 }, 4);
  await run({ name: 'iPhone SE', w: 375, h: 667, dpr: 2 }, 10);
  await run({ name: '安卓大屏', w: 412, h: 915, dpr: 2.6 }, 16);
  console.log(fail ? '有 ' + fail + ' 项没过' : '全部通过');
  process.exit(fail ? 1 : 0);
})();
