// 0.9.21 老鼠啃手上的块：拖回自己的宠物格松手 = 取消，不能啃（Cc 11-27：「我有的时候松手了想取消这个技能，它还是把它啃了」）
const path = require('path');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
// 注意：测的是 preview.html，改了 js/ 先跑 node tools/build-preview.js
const url = 'file://' + path.join(__dirname, '..', 'preview.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
(async () => {
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(url); await page.waitForTimeout(400);
  const off = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const setup = () => page.evaluate(() => {
    const G = window.__game;
    G.setSave({ petTutDone: true, tutorialDone: true, petStage: 12, pets: { tongque: { lv: 2, exp: 0 }, baozhu: { lv: 1, exp: 0 } }, petOrder: ['tongque', 'baozhu'], activePet: 'baozhu' });
    G.newPetLevel(11); G.skipCuts(); G.CUT.clear(); G.mode = 'play';
    const g = G.g, pt = g.team[0]; pt.energy = 999;
    g.hand[3] = Object.assign({}, G.PG.SKILL_PIECE, { pet: pt.id, kind: 'gnaw', n: 1, uses: 1, special: 'skill' }); g.handColor[3] = 1;
    const j = 0; g.hand[0] = Object.assign({}, G.core.PIECES['3h']); g.handColor[0] = 0; // 固定一条 3 格横条：啃两头哪一格都行
    return { j, cells: g.hand[j].cells.length, from: G.slotCenter(3), aim: G.fingerForHand(j, 0) };
  });
  const move = async (pts) => { await page.mouse.move(off.x + pts[0].x, off.y + pts[0].y); await page.mouse.down(); for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; for (let k = 1; k <= 6; k++) { await page.mouse.move(off.x + a.x + (b.x - a.x) * k / 6, off.y + a.y + (b.y - a.y) * k / 6); await page.waitForTimeout(12); } } await page.mouse.up(); await page.waitForTimeout(300); };
  const after = (j) => page.evaluate((j) => { const g = window.__game.g; return { cells: g.hand[j] ? g.hand[j].cells.length : -1, skill: !!g.hand[3], ev: JSON.stringify(window.__game.T._all().slice(-4)) }; }, j);
  let s = await setup();
  await move([s.from, s.aim.enter, s.aim, s.from]);
  let a = await after(s.j);
  if (!a.skill) console.log('  调试', a.ev);
  ok(a.cells === s.cells && a.skill, '对准一块以后拖回宠物格松手：没啃（' + s.cells + ' 格还是 ' + a.cells + ' 格），技能块还在');
  s = await setup();
  await move([s.from, s.aim.enter, s.aim]);
  a = await after(s.j);
  ok(a.cells === s.cells - 1 && !a.skill, '对准了松手：照样啃掉一格（' + s.cells + ' → ' + a.cells + '）');
  console.log(pass + ' 项通过，' + fail + ' 项没过');
  await browser.close(); process.exit(fail ? 1 : 0);
})();
