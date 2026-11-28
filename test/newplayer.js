// 新玩家真流程（0.9.12 起，Cc 11-26：「我从第一关的引导就点不了……类似这样的错误你要检查好啊，不然玩家进来 1 分钟就想走了」）。
// 从清空的存档开始，只用真鼠标点屏幕上真有的按钮、照新手引导拖块，不改盘面、不跳关、不调内部函数开关，
// 一路打到第一章打完（第 10 关头目）。哪一步卡住（同一个画面 40 次没变化）就截图报错。
// 用法：node test/newplayer.js [打到第几关=10]
const path = require('path');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const url = 'file://' + path.join(__dirname, '..', 'preview.html');
const SHOTS = path.join(__dirname, 'shots');
const TARGET = +process.argv[2] || 10;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };

(async () => {
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(500);
  const off = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const clickAt = async (x, y) => { await page.mouse.click(off.x + x, off.y + y); };
  const clickBtn = async (id) => { const b = await page.evaluate((id) => window.__game.buttons().find((x) => x.id === id), id); if (!b) return false; await clickAt(b.x + b.w / 2, b.y + b.h / 2); return true; };
  const drag = async (from, to) => {
    await page.mouse.move(off.x + from.x, off.y + from.y); await page.mouse.down();
    for (let k = 1; k <= 6; k++) { await page.mouse.move(off.x + from.x + ((to.x - from.x) * k) / 6, off.y + from.y + ((to.y - from.y) * k) / 6); await page.waitForTimeout(10); }
    await page.mouse.up();
  };

  const log = [], tries = {}, seen = { tut: null, intro: [], skillUsed: 0, gnaw: 0, fed: 0, start: 0 };
  let last = '', same = 0, steps = 0, stalled = null;
  const t0 = Date.now();
  while (steps++ < 6000) {
    const s = await page.evaluate(() => {
      const G = window.__game, g = G.g;
      return { mode: G.mode, stage: G.save.petStage, idx: G.petIdx, over: g && g.over, won: g && g.won, moves: g && g.moves,
        btns: G.buttons().map((b) => b.id), tut: g && g.moves === 0 && G.petIdx === 0 && !G.save.petTutDone ? G.tutorialTarget() : null };
    });
    if (s.stage >= TARGET) break;
    const key = s.mode + '|' + s.idx + '|' + s.moves + '|' + s.btns.join(',');
    same = key === last ? same + 1 : 0; last = key;
    if (same >= 40) { stalled = s; await shot('NP_卡住_' + s.mode + '_第' + (s.idx + 1) + '关'); break; }
    if (s.mode === 'cut') { await clickAt(195, 420); await page.waitForTimeout(120); continue; }
    if (s.mode === 'intro') { if (!seen.intro.includes(s.idx)) seen.intro.push(s.idx); await page.waitForTimeout(150); if (!(await clickBtn('introOk'))) await clickAt(195, 600); await page.waitForTimeout(150); continue; }
    if (s.mode === 'start') { seen.start++; await page.waitForTimeout(200); if (!(await clickBtn('startGo'))) await clickAt(195, 600); await page.waitForTimeout(150); continue; }
    if (s.mode === 'home') { await clickBtn('homePlay'); await page.waitForTimeout(200); continue; }
    if (s.mode === 'map') { await clickBtn('play'); await page.waitForTimeout(200); continue; }
    if (s.btns && s.btns.includes('evoTap')) { await clickBtn('evoTap'); await page.waitForTimeout(150); continue; } // 0.9.20 进化动画
    if (s.mode === 'camp') {
      // 像真人：先把丹喂给出战的那只（够就点「升级」），能进化就进化，然后「出发」
      // 0.9.13 宠物园：先点出战的那只（冒气泡），够丹就点丹图标升级、能进化就进化，然后「出发」
      const b = await page.evaluate(() => { const G = window.__game; const bs = G.buttons(); const act = G.save.activePet || G.save.petOrder[0]; const ev = bs.find((x) => x.id === 'evolveG'); const fd = bs.find((x) => x.id === 'feedG') && G.save.dan >= G.danToLevel(act) ? 'feedG' : null; const open = bs.find((x) => x.id === 'gpet_' + act) && !bs.find((x) => x.id === 'feedG' || x.id === 'evolveG') && (G.save.dan >= G.danToLevel(act) || (G.PG.PETS[act].evo && G.save.pets[act].lv >= G.PG.PETS[act].evoLv)) ? 'gpet_' + act : null; return (ev && ev.id) || fd || open || 'campPlay'; });
      if (b === 'feedG') seen.fed++;
      if (b) await clickBtn(b); await page.waitForTimeout(250); continue;
    }
    if (s.mode === 'over') {
      await page.waitForTimeout(400);
      if (s.won) { if (!(await clickBtn('tocamp'))) await clickBtn('map'); }
      else { tries[s.idx] = (tries[s.idx] || 1) + 1; if (!(await clickBtn('lend'))) await clickBtn('again'); }
      await page.waitForTimeout(300); continue;
    }
    if (s.mode === 'play') {
      if (s.over) { await page.waitForTimeout(200); continue; }
      if (s.tut && seen.tut === null) seen.tut = s.tut;
      // 有新手引导就照引导拖；不然照机器人挑的那一手拖（技能块：有正经事可办才用）
      const m = await page.evaluate(() => {
        const G = window.__game, g = G.g;
        if (g.moves === 0 && G.petIdx === 0 && !G.save.petTutDone) { const t = G.tutorialTarget(); if (t) return { from: G.slotCenter(0), to: G.fingerFor(g.hand[0], t.r, t.c) }; }
        let sk = g.hand[3] && G.PG.skillBest(g);
        const reach = (t) => { if (t.hand !== undefined) return true; const f = G.fingerFor(g.hand[3], t.r, t.c), got = G.skillTarget({ x: f.x, y: f.y }); return !!got && got.r === t.r && got.c === t.c; }; const fitsAny = [0, 1, 2].some((i) => g.hand[i] && G.core.anyPlacement(g.board, g.hand[i])); if (sk && !reach(sk)) { sk = null; if (!fitsAny) for (let k = 0; k < 81 && !sk; k++) { const t2 = { r: Math.floor(k / 9), c: k % 9 }; if (g.skillPlan(t2) && reach(t2)) sk = Object.assign(t2, { v: 1 }); } } /* 段 3：真人手指够不着的格子换一格点（和 wx-env 的 playStep 一样；原来 390、430 宽屏右下角两格够不着，段 3 已把取消线往下挪半格，这里留着防万一） */
        // 0.9.25：第一章宠物不抓怪、金属还不堵路，机器人挑不出「正经事」就从来不拖技能块（这条测试常年红）。第 3 关是教拖技能块的关：照新手那样，有就拖
        if (sk && (sk.v >= 100 || G.petIdx === 2 || ![0, 1, 2].some((i) => g.hand[i] && G.core.anyPlacement(g.board, g.hand[i])))) {
          if (sk.hand !== undefined) { const f = G.fingerForHand(sk.hand, sk.cell || 0); /* 段 3：小龟的转块没有「第几格」 */ return { from: G.slotCenter(3), via: f.enter, to: f, skill: 'hand' }; }
          return { from: G.slotCenter(3), to: G.fingerFor(g.hand[3], sk.r, sk.c), skill: 'board' };
        }
        const b = G.PG.bestMove(g, 1); return b && { from: G.slotCenter(b.i), to: G.fingerFor(g.hand[b.i], b.r, b.c) };
      });
      if (!m) { await page.waitForTimeout(150); continue; }
      if (m.via) { await page.mouse.move(off.x + m.from.x, off.y + m.from.y); await page.mouse.down(); await page.mouse.move(off.x + m.via.x, off.y + m.via.y, { steps: 5 }); await page.mouse.move(off.x + m.to.x, off.y + m.to.y, { steps: 5 }); await page.mouse.up(); }
      else await drag(m.from, m.to);
      if (m.skill) { seen.skillUsed++; if (m.skill === 'hand') seen.gnaw++; }
      await page.waitForTimeout(60);
      continue;
    }
    await page.waitForTimeout(150);
  }
  const fin = await page.evaluate(() => ({ stage: window.__game.save.petStage, pets: window.__game.save.pets, dan: window.__game.save.dan, log: (window.__game.save.playLog || []).length }));
  await shot('NP_第一章打完');
  const min = ((Date.now() - t0) / 60000).toFixed(1);
  ok(seen.tut && seen.tut.n >= 1, '第 1 关新手引导：手指演示的一手放得下、能消一排（' + JSON.stringify(seen.tut) + '）');
  ok(!stalled, '新玩家从头打：没有卡住的画面' + (stalled ? '——卡在「' + stalled.mode + '」第 ' + (stalled.idx + 1) + ' 关，按钮：' + stalled.btns.join(',') : ''));
  ok(fin.stage >= TARGET, '新玩家只点真按钮，打到第 ' + fin.stage + ' 关（目标 ' + TARGET + '），用了 ' + min + ' 分钟测试时间');
  ok(seen.skillUsed > 0, '一路上真拖了 ' + seen.skillUsed + ' 次技能块');
  ok(seen.fed > 0, '在营地真点「升级」喂了 ' + seen.fed + ' 次丹；最后宠物：' + Object.entries(fin.pets).map(([k, v]) => k + ' ' + v.lv + ' 级').join('、'));
  ok(fin.log >= TARGET, '试玩记录记了 ' + fin.log + ' 局');
  console.log('  每关打了几次（没写的是一次过）：' + JSON.stringify(tries) + '；见过说明卡的关：' + seen.intro.map((i) => i + 1).join(','));
  ok(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} 项通过，${fail} 项没过`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
