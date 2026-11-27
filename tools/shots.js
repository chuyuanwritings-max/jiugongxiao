// 三种手机尺寸各截 12 个主要画面（0.9.25 收拾第 1 步）。用法：node tools/shots.js 目录名（存到 test/baseline/shots/目录名/）
// 小屏 375×667、常见 390×844、安卓大屏 412×915；顶上留 88 像素当微信胶囊（真机右上角那颗）
const path = require('path'), fs = require('fs');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const tag = process.argv[2] || 'now', root = path.join(__dirname, '..'), out = path.join(root, 'test', 'baseline', 'shots', tag);
const VPS = [[375, 667], [390, 844], [412, 915]];
const SAVE = { petTutDone: true, tutorialDone: true, petStage: 20, introSeen: { catch: true, pet: true, crawl: true, metal: true, rush: true, moss: true, boss: true, baozhu: true, dirt: true, sticky: true, boss2: true }, cutSeen: {}, pets: { tongque: { lv: 3, exp: 0 }, baozhu: { lv: 2, exp: 0 } }, petOrder: ['tongque', 'baozhu'], activePet: 'tongque', dan: 5 };
const SCENES = [
  ['01_主菜单', (G) => { G.mode = 'home'; }],
  ['02_章页', (G) => { G.mode = 'map'; }],
  ['03_宠物园', (G) => { G.openCamp(); }],
  ['04_设置', (G) => { G.mode = 'settings'; }],
  ['05_第1关', (G) => { G.newPetLevel(0); G.skipCuts(); G.mode = 'play'; }],
  ['06_进关卡片_第12关', (G) => { G.newPetLevel(11); G.CUT.clear(); }],
  ['07_第7关冲锋', (G) => { G.newPetLevel(6); G.skipCuts(); G.mode = 'play'; }],
  ['08_第10关头目', (G) => { G.newPetLevel(9); G.skipCuts(); G.mode = 'play'; }],
  ['09_第12关土堆', (G) => { G.newPetLevel(11); G.skipCuts(); G.mode = 'play'; }],
  ['10_第14关粘墨怪', (G) => { G.newPetLevel(13); G.skipCuts(); G.mode = 'play'; }],
  ['11_第20关头目', (G) => { G.newPetLevel(19); G.skipCuts(); G.mode = 'play'; }],
  ['12_结算', (G) => { G.newPetLevel(3); G.skipCuts(); G.mode = 'play'; const g = G.g; g.over = true; g.won = true; g.reason = 'win'; G.endGame(); G.skipCuts(); }],
];
(async () => {
  const browser = await chromium.launch();
  let n = 0, bad = 0;
  for (const [w, h] of VPS) {
    const dir = path.join(out, w + 'x' + h); fs.mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto('file://' + path.join(root, 'preview.html')); await page.waitForTimeout(400);
    for (const [name, go] of SCENES) {
      await page.evaluate((s) => { const G = window.__game; G.setSave(JSON.parse(s)); }, JSON.stringify(SAVE));
      await page.evaluate('(' + go.toString() + ')(window.__game)');
      await page.waitForTimeout(1600);
      await page.screenshot({ path: path.join(dir, name + '.png') }); n++;
    }
    if (errs.length) { bad += errs.length; console.log('✗ ' + w + 'x' + h + ' 报错：' + errs.slice(0, 3).join(' | ')); }
    await page.close();
  }
  await browser.close();
  console.log((bad ? '✗ ' : '✓ ') + '截好 ' + n + ' 张：' + out + (bad ? '（有 ' + bad + ' 个报错）' : '，没有报错'));
  process.exit(bad ? 1 : 0);
})();
