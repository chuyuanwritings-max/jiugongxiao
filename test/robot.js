// 浏览器机器人：真用鼠标拖块玩，截图，量「死到再开局几秒」。用法：node test/robot.js
const path = require('path');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const SHOTS = path.join(__dirname, 'shots');
const url = 'file://' + path.join(__dirname, '..', 'preview.html');
let pass = 0, fail = 0;
const T0 = Date.now();
const ok = (c, m) => { const t = ((Date.now() - T0) / 1000).toFixed(0) + 's '; if (c) { pass++; console.log('✓ ' + m + '  [' + t + ']'); } else { fail++; console.log('✗ ' + m + '  [' + t + ']'); } };

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

  // ---------- 0.5 九宫消 + 宠物 ----------
  const petPlay = async (max, until) => {
    for (let k = 0; k < max; k++) {
      const m = await page.evaluate(() => { const G = window.__game; if (G.g.over || G.mode !== 'play') return null; const b = G.PG.bestMove(G.g, 1); return b && { i: b.i, r: b.r, c: b.c }; });
      if (!m) break;
      await dragTo(m.i, m.r, m.c);
      await page.waitForTimeout(50);
      if (until && (await page.evaluate(until))) return true;
    }
    return false;
  };
  // 先跳过过场，等一帧（按钮表每帧重画）再点说明卡的「继续」
  const closeIntro = async () => {
    await page.evaluate(() => window.__game.skipCuts());
    await page.waitForTimeout(60);
    await page.evaluate(() => { const b = window.__game.buttons().find((x) => x.id === 'introOk'); if (b) b.fn(); });
  };
  // 0.6.1：第一次打开先放第一章开场（镜头摇过工坊后院、硬切推到大墨怪），真鼠标点一下跳过
  const cut0 = await page.evaluate(() => window.__game.mode);
  await page.mouse.click(off.x + 200, off.y + 400);
  await page.waitForTimeout(150);
  await shot('01b_跳过开场_教学手势');
  let st = await page.evaluate(() => ({ pets: !!window.__game.g.pets, idx: window.__game.petIdx, mode: window.__game.mode, seen: !!window.__game.save.cutSeen.chapter0 }));
  ok(cut0 === 'cut' && st.seen, '第一次打开先放第一章开场过场（运镜大图）');
  ok(st.pets && st.idx === 0 && st.mode === 'play', '点一下跳过过场，直接进第 1 关（不先看地图）');
  await dragTo(0, 3, 3);
  await page.waitForTimeout(140);
  await shot('02_第1关_第一下消一宫');
  await petPlay(40);
  await page.waitForTimeout(1300);
  await shot('03_第1关完成');
  st = await page.evaluate(() => ({ won: window.__game.g.won, stage: window.__game.save.petStage }));
  ok(st.won && st.stage === 1, '真鼠标拖块过第 1 关');
  // 第 3 关：小墨怪，过关送铜雀
  await page.evaluate(() => window.__game.newPetLevel(2));
  await page.waitForTimeout(300);
  await shot('04_第3关_小墨怪说明卡');
  st = await page.evaluate(() => window.__game.mode);
  await closeIntro();
  await petPlay(30);
  await page.waitForTimeout(1300);
  await shot('05_第3关_送铜雀');
  st = await page.evaluate(() => ({ won: window.__game.g.won, caught: window.__game.g.caught, pets: window.__game.save.petOrder.slice(), dan: window.__game.save.dan, auto: window.__game.result && window.__game.result.danAuto }));
  ok(st.won && st.caught >= 2 && st.pets.includes('tongque') && st.auto >= 1 && st.dan >= st.auto, '第 3 关抓到 ' + st.caught + ' 只墨怪，过关自动炼成 ' + st.auto + ' 颗丹（不用再去点炼丹），得到铜雀');
  // 过关只给「回营地」，没有「下一关」
  await page.evaluate(() => window.__game.skipCuts());
  await page.waitForTimeout(1300);
  await shot('05b_过关只回营地');
  st = await page.evaluate(() => window.__game.buttons().map((x) => x.id));
  const toCamp = st.includes('tocamp') && !st.includes('next') && !st.includes('tomap');
  await click('tocamp');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ mode: window.__game.mode, play: window.__game.buttons().some((x) => x.id === 'campPlay') }));
  ok(toCamp && st.mode === 'camp' && st.play, '过关后只有「回营地」一个按钮（没有下一关）；营地里能去闯下一关');
  // 第 4 关：铜雀出战，自己出手
  await page.evaluate(() => window.__game.newPetLevel(3));
  await page.waitForTimeout(300);
  await closeIntro();
  const acted = await petPlay(40, () => Object.keys(window.__game.g.petActsTotal).length > 0);
  await page.waitForTimeout(380);
  await shot('06_第4关_铜雀出手');
  ok(acted, '第 4 关铜雀能量满了自己出手（射掉最满的一排）');
  await petPlay(40);
  await page.waitForTimeout(2200);
  await shot('06b_第4关_经验条');
  st = await page.evaluate(() => { const r = window.__game.result; return r && r.exp && r.exp[0]; });
  ok(st && st.id === 'tongque' && st.gain >= 3, '过关后结算页出宠物经验条：铜雀 +' + (st && st.gain) + ' 经验');
  // 第 9 关：铁石只有宠物打得碎
  await page.evaluate(() => { const G = window.__game; G.setSave({ petStage: 8 }); G.newPetLevel(8); });
  await page.waitForTimeout(300);
  await closeIntro();
  await shot('06c_第9关_铁石');
  await petPlay(80);
  await page.waitForTimeout(1600);
  st = await page.evaluate(() => ({ won: window.__game.g.won, rock: window.__game.g.got.rock }));
  ok(st.won && st.rock >= 4, '第 9 关铁石关：普通消除消不掉，铜雀出手打碎 4 块铁石过关');
  // 营地：一下升一级（「升级 · N 颗」），升到 5 级出现「进化」
  await page.evaluate(() => { const G = window.__game; G.save.pets.tongque = { lv: 4, exp: 10 }; G.setSave({ dan: 20 }); G.openCamp(); });
  await page.waitForTimeout(200);
  await shot('07_营地_升级按钮');
  await click('feed0');
  await page.waitForTimeout(300);
  await shot('08_营地_可以进化');
  st = await page.evaluate(() => ({ lv: window.__game.save.pets.tongque.lv, btn: window.__game.buttons().map((b) => b.id) }));
  ok(st.lv >= 5 && st.btn.includes('evolve0'), '营地：点「升级 · N 颗」一下升一级，铜雀到 5 级，出现「进化」');
  // 进化关
  await click('evolve0');
  await page.waitForTimeout(400);
  await shot('09_进化关');
  await petPlay(60);
  await page.waitForTimeout(1400);
  await shot('10_进化成功');
  st = await page.evaluate(() => ({ won: window.__game.g.won, pets: window.__game.save.petOrder.slice() }));
  ok(st.won && st.pets.includes('jinchique') && !st.pets.includes('tongque'), '进化关：金色方块把正中间 9 格点亮，铜雀进化成金翅雀');
  // 第 10 关：大墨怪
  await page.evaluate(() => { const G = window.__game; G.setSave({ petStage: 9 }); G.newPetLevel(9); });
  await page.waitForTimeout(300);
  await closeIntro();
  await shot('11_第10关_大墨怪');
  await petPlay(60);
  await page.waitForTimeout(1400);
  st = await page.evaluate(() => ({ won: window.__game.g.won, pets: window.__game.save.petOrder.slice() }));
  ok(st.won && st.pets.includes('baozhu'), '第 10 关打倒大墨怪（消 3 次），得到爆竹鼠');
  // 第 11 关：第一次打借你 2 级爆竹鼠，啃掉挤在一个大格里的铁石
  await page.evaluate(() => { const G = window.__game; G.setSave({ petStage: 10 }); G.newPetLevel(10); });
  await page.waitForTimeout(300);
  await closeIntro();
  await shot('12_第11关_爆竹鼠铁石');
  await petPlay(80);
  await page.waitForTimeout(1600);
  st = await page.evaluate(() => ({ won: window.__game.g.won, team: window.__game.g.team.map((t) => t.id), rock: window.__game.g.got.rock}));
  ok(st.won && st.team[0] === 'baozhu' && st.rock >= 3, '第 11 关：借来的爆竹鼠啃碎 3 块铁石过关');
  // 第 12 关：甲壳怪——不带宠物也打得死：第一次消掉它掉一层甲，再消一次抓走
  await page.evaluate(() => { const G = window.__game; G.setSave({ petStage: 11, activePet: 'jinchique' }); G.newPetLevel(11); G.g.team = []; });
  await page.waitForTimeout(300);
  await closeIntro();
  const cracked = await petPlay(40, () => window.__game.g.monStats.cracks > 0);
  await page.waitForTimeout(200);
  await shot('12b_第12关_甲壳怪掉一层');
  await petPlay(60);
  await page.waitForTimeout(1600);
  st = await page.evaluate(() => ({ won: window.__game.g.won, cracks: window.__game.g.monStats.cracks, got: window.__game.g.got.monster }));
  ok(cracked && st.cracks >= 1 && st.got >= 1, '第 12 关：不带宠物，消一次甲壳怪掉一层甲（掉了 ' + st.cracks + ' 层），再消抓走（抓到 ' + st.got + ' 只）');
  // 墨苔怪 + 馋嘴怪：固定一块测试盘（两只都蹲在空排上，不会一开局就被抓走），规则层跑 30 手，看它们真的啃块、长墨
  st = await page.evaluate(() => {
    const G = window.__game;
    const stage = { goal: { monster: 9 }, d: 0.1, colors: [0, 3, 2], board: ['.........', '.........', '..E......', '.##......', '.........', '......##.', '......G..', '.........', '.........'] };
    const tot = { eats: 0, moss: 0 };
    for (let seed = 1; seed <= 3; seed++) {
      const g = G.PG.createPetGame({ stage, team: [], seed });
      for (let k = 0; k < 30 && !g.over; k++) { const m = G.PG.bestMove(g, 0.3); if (!m) break; g.place(m.i, m.r, m.c); }
      tot.eats += g.monStats.eats; tot.moss += g.monStats.moss;
    }
    return tot;
  });
  ok(st.eats > 0 && st.moss > 0, '馋嘴怪啃掉 ' + st.eats + ' 块、墨苔怪长出 ' + st.moss + ' 块墨（固定测试盘，3 局）');
  // 第 27 关：分身怪——打一下裂成两只小墨怪，目标「抓光」
  await page.evaluate(() => { const G = window.__game; G.newPetLevel(26); G.g.team = []; });
  await page.waitForTimeout(300);
  await closeIntro();
  await petPlay(80);
  await page.waitForTimeout(1600);
  st = await page.evaluate(() => ({ won: window.__game.g.won, spawns: window.__game.g.monStats.spawns, left: window.__game.g.monLeft }));
  ok(st.won && st.spawns >= 2 && st.left === 0, '第 27 关：分身怪裂出 ' + st.spawns + ' 只小墨怪，全部抓光过关');
  // 火麒麟：放块攒能量，吐一颗火球进托盘
  await page.evaluate(() => { const G = window.__game; G.save.pets.qilin = { lv: 1, exp: 0 }; if (!G.save.petOrder.includes('qilin')) G.save.petOrder.push('qilin'); G.setSave({ petStage: 20, activePet: 'qilin' }); G.newPetLevel(19); });
  await page.waitForTimeout(300);
  await closeIntro();
  const gotFire = await petPlay(60, () => window.__game.g.hand.some((p) => p && p.special === 'fire'));
  await page.waitForTimeout(400);
  await shot('12c_第20关_火块和吐墨');
  await petPlay(30, () => window.__game.g.monStats.eats > 0);
  st = await page.evaluate(() => ({ ink: window.__game.g.monStats.eats > 0 }));
  ok(gotFire, '火麒麟出战：攒满往托盘里送一颗火块');
  ok(st.ink, '第 20 关：头目大馋嘴会啃掉身边的块（先亮牙印）');
  // 0.8 专属关：第 13 关点名铜雀；出战的是爆竹鼠，点开打自动换上金翅雀（铜雀进化后的也算），营地里的选择不变
  await page.evaluate(() => { const G = window.__game; G.save.introSeen.shell = 1; G.setSave({ activePet: 'baozhu' }); G.newPetLevel(12); });
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ team: window.__game.g.team[0].id, active: window.__game.save.activePet }));
  ok(st.team === 'jinchique' && st.active === 'baozhu', '专属关（第 13 关点名铜雀）：自动换上金翅雀，营地里选的爆竹鼠不变');
  await page.evaluate(() => { const G = window.__game; G.g.over = true; G.g.reason = 'stuck'; G.endGame(); });
  await page.waitForTimeout(700);
  await click('tomap');
  await page.waitForTimeout(400);
  await shot('13_章页');
  st = await page.evaluate(() => ({ mode: window.__game.mode, btn: window.__game.buttons().map((b) => b.id) }));
  ok(st.mode === 'map' && st.btn.includes('play') && st.btn.includes('camp') && st.btn.includes('classic') && !st.btn.includes('siege') && st.btn.filter((x) => x.startsWith('cell')).length === 10, '章页：一章 9 个关卡格 + 头目卡、开打、营地、经典拼画；守城收起来了');
  // 章页底部大按钮永远是「继续 · 第 N 关」：点别的格子只看预览，按钮不变（Cc 11-24：「底下的这个选项不应该变」）
  const fixedLbl = await page.evaluate(() => {
    const G = window.__game, lbl = () => (G.buttons().find((b) => b.id === 'play') || {}).label;
    const a = lbl(); const c = G.buttons().find((b) => b.id.startsWith('cell') && b.id !== 'cell' + G.save.petStage); if (c) c.fn();
    return { a, cell: c && c.id };
  });
  await page.waitForTimeout(150);
  st = await page.evaluate(() => ({ lbl: (window.__game.buttons().find((b) => b.id === 'play') || {}).label, preview: window.__game.buttons().some((b) => b.id === 'preview') }));
  ok(/^继续 · 第 \d+ 关/.test(fixedLbl.a) && st.lbl === fixedLbl.a && st.preview, '章页：点别的关只出预览卡，底部按钮一直是「' + st.lbl + '」');
  // 设置：声音开关、重新开始（点两下才清空）
  await click('settings');
  await page.waitForTimeout(200);
  await shot('13b_设置');
  await click('setSound');
  await page.waitForTimeout(100);
  st = await page.evaluate(() => window.__game.save.muted);
  await click('setSound');
  await click('setReset');
  await page.waitForTimeout(100);
  const half = await page.evaluate(() => window.__game.save.petStage);
  await click('setReset');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ stage: window.__game.save.petStage, pets: window.__game.save.petOrder.length, idx: window.__game.petIdx, mode: window.__game.mode }));
  ok(st === true && half > 0 && after.stage === 0 && after.pets === 0 && after.idx === 0 && after.mode === 'play', '设置：声音能关；「重新开始」点一下要确认、点第二下才清空进度，回到第 1 关');
  await page.evaluate(() => { const G = window.__game; G.setSave({ petTutDone: true, tutorialDone: true }); });
  await click('map');
  await page.waitForTimeout(300);

  // ---------- 经典拼画（0.1 / 0.2 的玩法） ----------
  await click('classic');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !window.__game.g.stage && window.__game.mode === 'play'), '地图点「经典拼画」进 3 分钟拼画');
  // 机器人接着玩，用真拖拽
  let moves = 0, sawGhost = false;
  for (; moves < 40; moves++) {
    // 亮到 8 宫就停：再亮一宫画就拼成了，后面「时间到」那一项就测不到（以前偶尔因此不过）
    const m = await page.evaluate(() => { const G = window.__game; if (G.g.over || G.g.litCount() >= 8) return null; const b = G.core.bestMove(G.g, 1); return b && { i: b.i, r: b.r, c: b.c }; });
    if (!m) break;
    if (moves === 6) {
      // 截一张拖到一半的图：看落点高亮
      const pos = await page.evaluate(([i, r, c]) => { const G = window.__game; return { from: G.slotCenter(i), to: G.fingerFor(G.g.hand[i], r, c) }; }, [m.i, m.r, m.c]);
      await page.mouse.move(off.x + pos.from.x, off.y + pos.from.y); await page.mouse.down();
      await page.mouse.move(off.x + pos.to.x, off.y + pos.to.y, { steps: 5 });
      await page.waitForTimeout(60);
      await shot('12_经典_拖动中_落点高亮');
      sawGhost = true;
      await page.mouse.up();
    } else await dragTo(m.i, m.r, m.c);
    await page.waitForTimeout(moves % 7 === 3 ? 90 : 30);
    if (moves === 15) await shot('13_经典_玩到一半');
  }
  st = await page.evaluate(() => ({ moves: window.__game.g.moves, lit: window.__game.g.litCount(), score: window.__game.g.score }));
  ok(st.moves >= 15, '真鼠标拖了 ' + st.moves + ' 步，亮了 ' + st.lit + ' 宫，' + st.score + ' 分');
  ok(sawGhost, '拖动中截图');

  // 时间到 → 结算页
  await page.evaluate(() => { window.__game.g.timeLeft = 0.05; });
  await page.waitForTimeout(800);
  await shot('14_经典_时间到');
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
  await shot('15_经典_只差2宫');
  const near = await page.evaluate(() => window.__game.result.near);
  ok(near, '亮 7 宫输了算「差一点」，失败页写「只差 2 宫」');
  const rv = await page.evaluate(() => window.__game.buttons().find((b) => b.id === 'revive'));
  await page.mouse.click(off.x + rv.x + 20, off.y + rv.y + 20);
  await page.waitForTimeout(400);
  await shot('16_广告占位');
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
  await shot('17_经典_拼成白闪');
  await page.waitForTimeout(900);
  await shot('18_经典_拼成结算');
  st = await page.evaluate(() => ({ won: window.__game.result && window.__game.result.won, wins: window.__game.save.wins, items: window.__game.save.items }));
  ok(st.won && st.wins === 1 && st.items.sparrow, '拼成第一张画：收进画册、得到铜雀');

  // 画册
  const alb = await page.evaluate(() => window.__game.buttons().find((b) => b.id === 'album2'));
  await page.mouse.click(off.x + alb.x + 20, off.y + alb.y + 20);
  await page.waitForTimeout(300);
  await shot('19_画册');
  ok((await page.evaluate(() => window.__game.mode)) === 'album', '画册打开');

  ok(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} 项通过，${fail} 项没过`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
