// 浏览器机器人：真用鼠标拖块玩，截图，量「死到再开局几秒」。用法：node test/robot.js
const path = require('path');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const SHOTS = path.join(__dirname, 'shots');
const url = 'file://' + path.join(__dirname, '..', 'preview.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(400);
  const off = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  await page.waitForTimeout(900);
  await shot('01_开局_教学手势');

  // 拖一块到 (r, c)
  async function dragTo(i, r, c) {
    const pos = await page.evaluate(([i, r, c]) => {
      const G = window.__game; const p = G.g.hand[i];
      return { from: G.slotCenter(i), to: G.fingerFor(p, r, c) };
    }, [i, r, c]);
    await page.mouse.move(off.x + pos.from.x, off.y + pos.from.y);
    await page.mouse.down();
    const steps = 6;
    for (let k = 1; k <= steps; k++) {
      await page.mouse.move(off.x + pos.from.x + ((pos.to.x - pos.from.x) * k) / steps, off.y + pos.from.y + ((pos.to.y - pos.from.y) * k) / steps);
      await page.waitForTimeout(12);
    }
    await page.mouse.up();
  }
  const click = async (id) => {
    const b = await page.evaluate((id) => window.__game.buttons().find((x) => x.id === id), id);
    if (!b) return false;
    await page.mouse.click(off.x + b.x + b.w / 2, off.y + b.y + b.h / 2);
    return true;
  };
  // 机器人用真拖拽玩到这一关结束
  async function playStage(maxMoves) {
    for (let k = 0; k < maxMoves; k++) {
      const m = await page.evaluate(() => { const G = window.__game; if (G.g.over || G.mode !== 'play') return null; const b = G.core.bestMove(G.g, 1); return b && { i: b.i, r: b.r, c: b.c }; });
      if (!m) break;
      await dragTo(m.i, m.r, m.c);
      await page.waitForTimeout(40);
    }
    return page.evaluate(() => ({ won: window.__game.g.won, over: window.__game.g.over, moves: window.__game.g.moves, mode: window.__game.mode }));
  }

  // ---------- 旅程 ----------
  let st = await page.evaluate(() => ({ stage: window.__game.stageIdx, mode: window.__game.mode }));
  ok(st.stage === 0 && st.mode === 'play', '第一次打开直接进旅程第 1 关（不先看地图）');
  // 第一块：3×3 进中宫，一下消掉一宫
  await dragTo(0, 3, 3);
  await page.waitForTimeout(140);
  await shot('02_第1关_第一下消一宫');
  st = await page.evaluate(() => ({ score: window.__game.g.score, empty: window.__game.core.UNITS[22].every((k) => !window.__game.g.board[k]) }));
  ok(st.empty && st.score >= 18, '第一块 3×3 放进中宫：一下消掉一宫（' + st.score + ' 分）');
  await page.waitForTimeout(500);
  st = await playStage(40);
  await page.waitForTimeout(400);
  await shot('03_第1关_过关字');
  await page.waitForTimeout(1100);
  await shot('04_第1关完成卡');
  ok(st.won, '真鼠标拖 ' + st.moves + ' 块过第 1 关（冲 75 分）');
  await click('next');
  await page.waitForTimeout(400);
  await shot('05_第2关_说明卡');
  st = await page.evaluate(() => ({ stage: window.__game.stageIdx, mode: window.__game.mode }));
  ok(st.stage === 1 && st.mode === 'intro', '点「下一关」进第 2 关，先弹「收集宝石」说明卡');
  await click('introOk');
  await page.waitForTimeout(200);
  let sawFly = false;
  for (let k = 0; k < 40; k++) {
    const m = await page.evaluate(() => { const G = window.__game; if (G.g.over) return null; const b = G.core.bestMove(G.g, 1); return b && { i: b.i, r: b.r, c: b.c }; });
    if (!m) break;
    await dragTo(m.i, m.r, m.c);
    await page.waitForTimeout(60);
    if (!sawFly && (await page.evaluate(() => Object.values(window.__game.g.got).some((v) => v > 0)))) {
      sawFly = true; await page.waitForTimeout(120); await shot('06_第2关_宝石飞向计数');
    }
  }
  st = await page.evaluate(() => ({ won: window.__game.g.won, moves: window.__game.g.moves }));
  ok(st.won && sawFly, '第 2 关收满 3 颗青金过关（' + st.moves + ' 块），收到时宝石飞向顶上');
  // 失败 → 「再试一次」量重开
  const rs = [];
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => { const G = window.__game; G.newStage(9); G.g.over = true; G.g.reason = 'stuck'; G.endGame(); });
    const tOver = await page.evaluate(async () => { const G = window.__game; while (!G.buttons().some((b) => b.id === 'again')) await new Promise((r) => setTimeout(r, 16)); return G.stats.overs[G.stats.overs.length - 1]; });
    if (k === 0) await shot('07_旅程_堵住了');
    await click('again');
    const tStart = await page.evaluate(() => window.__game.stats.starts[window.__game.stats.starts.length - 1]);
    rs.push((tStart - tOver) / 1000);
  }
  ok(rs.every((x) => x <= 3), '旅程输了点「再试一次」重开：平均 ' + (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2) + ' 秒');
  // 地图
  await click('map');
  await page.waitForTimeout(400);
  await shot('08_旅程地图');
  st = await page.evaluate(() => ({ mode: window.__game.mode, btn: window.__game.buttons().map((b) => b.id) }));
  ok(st.mode === 'map' && st.btn.includes('play') && st.btn.includes('node1') && st.btn.includes('classic'), '左上「‹」回地图：有「第 N 关」、能点过的关、有「经典拼画」');

  // ---------- 经典拼画（0.1 / 0.2 的玩法） ----------
  await click('classic');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !window.__game.g.stage && window.__game.mode === 'play'), '地图点「经典拼画」进 3 分钟拼画');
  // 机器人接着玩，用真拖拽
  let moves = 0, sawGhost = false;
  for (; moves < 40; moves++) {
    const m = await page.evaluate(() => { const G = window.__game; if (G.g.over) return null; const b = G.core.bestMove(G.g, 1); return b && { i: b.i, r: b.r, c: b.c }; });
    if (!m) break;
    if (moves === 6) {
      // 截一张拖到一半的图：看落点高亮
      const pos = await page.evaluate(([i, r, c]) => { const G = window.__game; return { from: G.slotCenter(i), to: G.fingerFor(G.g.hand[i], r, c) }; }, [m.i, m.r, m.c]);
      await page.mouse.move(off.x + pos.from.x, off.y + pos.from.y); await page.mouse.down();
      await page.mouse.move(off.x + pos.to.x, off.y + pos.to.y, { steps: 5 });
      await page.waitForTimeout(60);
      await shot('09_经典_拖动中_落点高亮');
      sawGhost = true;
      await page.mouse.up();
    } else await dragTo(m.i, m.r, m.c);
    await page.waitForTimeout(moves % 7 === 3 ? 90 : 30);
    if (moves === 15) await shot('10_经典_玩到一半');
  }
  st = await page.evaluate(() => ({ moves: window.__game.g.moves, lit: window.__game.g.litCount(), score: window.__game.g.score }));
  ok(st.moves >= 15, '真鼠标拖了 ' + st.moves + ' 步，亮了 ' + st.lit + ' 宫，' + st.score + ' 分');
  ok(sawGhost, '拖动中截图');

  // 时间到 → 结算页
  await page.evaluate(() => { window.__game.g.timeLeft = 0.05; });
  await page.waitForTimeout(800);
  await shot('11_经典_时间到');
  st = await page.evaluate(() => ({ mode: window.__game.mode, btn: window.__game.buttons().map((b) => b.id) }));
  ok(st.mode === 'over' && st.btn.includes('again') && st.btn.includes('revive'), '时间到出结算页，有「再来」和「+20 秒」');

  // 量死到再开局：结束那一刻到能点再来、点下去开新局
  const times = [];
  for (let k = 0; k < 5; k++) {
    const t = await page.evaluate(async () => {
      const G = window.__game;
      if (G.mode !== 'over') { G.g.timeLeft = 0.01; await new Promise((r) => setTimeout(r, 60)); }
      const tOver = G.stats.overs[G.stats.overs.length - 1];
      // 等结算按钮出现
      while (!G.buttons().some((b) => b.id === 'again')) await new Promise((r) => setTimeout(r, 16));
      return { tOver, again: G.buttons().find((b) => b.id === 'again') };
    });
    await page.mouse.click(off.x + t.again.x + t.again.w / 2, off.y + t.again.y + t.again.h / 2);
    const tStart = await page.evaluate(() => window.__game.stats.starts[window.__game.stats.starts.length - 1]);
    times.push((tStart - t.tOver) / 1000);
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.__game.g.timeLeft = 0.01; });
    await page.waitForTimeout(120);
  }
  const avgRestart = times.reduce((a, b) => a + b, 0) / times.length;
  ok(avgRestart <= 3, '死到再开局平均 ' + avgRestart.toFixed(2) + ' 秒（机器人一看到按钮就点）');

  // 堆死 → 复活（清空中宫）
  await page.evaluate(() => {
    const G = window.__game; G.newGame(false);
    for (let k = 0; k < 81; k++) G.g.board[k] = ((k % 9) + Math.floor(k / 9)) % 4 === 0 ? 0 : 1;
    G.g.lit = [true, true, true, true, false, true, true, false, true];
    G.g.hand = [G.core.PIECES.sq3, G.core.PIECES['5h'], null];
    G.g.over = true; G.g.reason = 'stuck'; G.endGame();
  });
  await page.waitForTimeout(700);
  await shot('12_经典_只差2宫');
  const near = await page.evaluate(() => window.__game.result.near);
  ok(near, '亮 7 宫输了算「差一点」，失败页写「只差 2 宫」');
  const rv = await page.evaluate(() => window.__game.buttons().find((b) => b.id === 'revive'));
  await page.mouse.click(off.x + rv.x + 20, off.y + rv.y + 20);
  await page.waitForTimeout(400);
  await shot('13_广告占位');
  await page.waitForTimeout(3200);
  st = await page.evaluate(() => { const G = window.__game; return { mode: G.mode, center: G.core.UNITS[22].every((k) => !G.g.board[k]) }; });
  ok(st.mode === 'play' && st.center, '看完占位广告：复活、中宫清空');

  // 拼完整幅画
  await page.evaluate(() => {
    const G = window.__game; G.newGame(false);
    G.g.board = new Array(81).fill(0);
    for (let k = 0; k < 81; k++) G.g.revealed[k] = G.core.boxOf(Math.floor(k / 9), k % 9) === 8 ? 0 : 1;
    G.g.lit = [true, true, true, true, true, true, true, true, false];
    G.g.hand = [G.core.PIECES.sq3, G.core.PIECES['1'], G.core.PIECES['1']];
  });
  await dragTo(0, 6, 6);
  await page.waitForTimeout(80);
  await shot('14_经典_拼成白闪');
  await page.waitForTimeout(900);
  await shot('15_经典_拼成结算');
  st = await page.evaluate(() => ({ won: window.__game.result && window.__game.result.won, wins: window.__game.save.wins, items: window.__game.save.items }));
  ok(st.won && st.wins === 1 && st.items.sparrow, '拼成第一张画：收进画册、得到铜雀');

  // 画册
  const alb = await page.evaluate(() => window.__game.buttons().find((b) => b.id === 'album2'));
  await page.mouse.click(off.x + alb.x + 20, off.y + alb.y + 20);
  await page.waitForTimeout(300);
  await shot('16_画册');
  ok((await page.evaluate(() => window.__game.mode)) === 'album', '画册打开');

  ok(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} 项通过，${fail} 项没过`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
