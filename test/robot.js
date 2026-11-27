// 浏览器机器人：真用鼠标拖块玩，截图，量「死到再开局几秒」。用法：node test/robot.js
const path = require('path');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const SHOTS = path.join(__dirname, 'shots');
const url = 'file://' + path.join(__dirname, '..', 'preview.html');
let pass = 0, fail = 0;
const T0 = Date.now();
const ok = (c, m) => { const t = ((Date.now() - T0) / 1000).toFixed(0) + 's '; if (c) { pass++; console.log('✓ ' + m + '  [' + t + ']'); } else { fail++; console.log('✗ ' + m + '  [' + t + ']'); } };

(async () => {
  const browser = await chromium.launch({ args: ['--mute-audio'] });
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
  // 0.9.12：爆竹鼠的技能块拖到托盘里第 j 块的第 n 格上（啃掉它）
  async function dragHand(j, n) {
    const pos = await page.evaluate(([j, n]) => { const G = window.__game; return { from: G.slotCenter(3), to: G.fingerForHand(j, n) }; }, [j, n]);
    await page.mouse.move(off.x + pos.from.x, off.y + pos.from.y);
    await page.mouse.down();
    await page.mouse.move(off.x + pos.to.enter.x, off.y + pos.to.enter.y, { steps: 5 }); // 先伸进托盘里那一块（进「啃手上」），再往上对准放大的那一格
    await page.mouse.move(off.x + pos.to.x, off.y + pos.to.y, { steps: 5 });
    await page.waitForTimeout(30);
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
      const m = await page.evaluate(() => {
        const G = window.__game; if (G.mode === 'start') G.skipCuts(); if (G.g.over || G.mode !== 'play') return null;
        // 0.9.8：宠物格里有技能块、打得到正经东西（或者三块都放不下）就先拖它
        const s = G.g.hand[3] && G.PG.skillBest(G.g);
        if (s && (s.v >= 100 || ![0, 1, 2].some((i) => G.g.fits(i)))) return s.hand !== undefined ? { i: 3, hand: s.hand, cell: s.cell } : { i: 3, r: s.r, c: s.c };
        const b = G.PG.bestMove(G.g, 1); return b && { i: b.i, r: b.r, c: b.c };
      });
      if (!m) break;
      if (m.hand !== undefined) await dragHand(m.hand, m.cell); else await dragTo(m.i, m.r, m.c);
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
  // 0.9.9 震动（照 ../../00_震动手感规矩_1.0.md 第三节）：打桩记下每一次震动
  await page.evaluate(() => { window.__hapticLog = []; });
  const hlog = () => page.evaluate(() => window.__hapticLog.slice());
  {
    // 拿起来又放回托盘：拿起震一下 light，没放成的那一下不震
    const from = await page.evaluate(() => window.__game.slotCenter(0));
    await page.mouse.move(off.x + from.x, off.y + from.y); await page.mouse.down(); await page.waitForTimeout(60);
    const h1 = await hlog();
    await page.mouse.move(off.x + from.x + 4, off.y + from.y + 3); await page.mouse.up(); await page.waitForTimeout(120);
    const h2 = await hlog();
    ok(h1.length === 1 && h1[0].level === 'light' && h2.length === 1, '震动：拿起方块震一下轻的，拖回托盘没放成不震（' + h2.map((x) => x.level).join(',') + '）');
  }
  // 照新手引导的手指拖（不改盘面——0.9.12 就是因为测试改了盘面，没发现引导让人把 3×3 拖进堵着的中宫）
  const tut = await page.evaluate(() => { const G = window.__game, t = G.tutorialTarget(); return t && { r: t.r, c: t.c, n: t.n, ok: G.core.canPlace(G.g.board, G.g.hand[0], t.r, t.c), id: G.g.hand[0].id }; });
  ok(tut && tut.ok && tut.n >= 1, '第 1 关新手引导：手指演示的那一手放得下、而且能消一排（' + (tut && tut.id) + ' 放到 ' + (tut && tut.r) + ',' + (tut && tut.c) + '，消 ' + (tut && tut.n) + ' 排）');
  await dragTo(0, tut.r, tut.c);
  await page.waitForTimeout(140);
  await shot('02_第1关_第一下消一宫');
  {
    await page.waitForTimeout(250);
    const h = (await hlog()).slice(1), w = h.slice(1, 4);
    ok(h.length >= 4 && h[0].level === 'light' && w[0].level === 'medium' && w.length === 3 && w[2].t - w[0].t < 260, '震动：拿起 light、放下消掉一宫来一串「嘣嘣嘣」三下（' + h.map((x) => x.level).join(',') + '）');
  }
  const movesBefore = await page.evaluate(() => window.__game.g.moves), logBefore = (await hlog()).length;
  await petPlay(40);
  await page.waitForTimeout(1300);
  await shot('03_第1关完成');
  {
    const h = await hlog(), mv = (await page.evaluate(() => window.__game.g.moves)) - movesBefore, got = h.length - logBefore;
    const gaps = h.slice(1).map((x, i) => x.t - h[i].t), minGap = gaps.length ? Math.min(...gaps) : 99;
    ok(got >= mv * 2 && h.some((x) => x.level === 'heavy') && minGap >= 40, '震动：第 1 关 ' + mv + ' 手全都震了（' + got + ' 次，每手拿 + 放），过关 heavy，两次最少隔 ' + minGap + ' 毫秒');
  }
  st = await page.evaluate(() => ({ won: window.__game.g.won, stage: window.__game.save.petStage }));
  st = await page.evaluate(() => ({ won: window.__game.g.won, stage: window.__game.save.petStage, pets: window.__game.save.petOrder.slice() }));
  ok(st.won && st.stage === 1 && st.pets.includes('tongque'), '真鼠标拖块过第 1 关，过关就送铜雀（0.9.8 起第 1 关就给）');
  // 第 2 关：铜雀登场，学「攒满了吐一块技能块，拖到墨怪旁边」
  await page.evaluate(() => { const G = window.__game; G.skipCuts(); G.newPetLevel(1); });
  await page.waitForTimeout(300);
  await shot('04_第2关_铜雀说明卡');
  await closeIntro();
  await petPlay(30, () => !!window.__game.g.hand[3]);
  await page.waitForTimeout(500);
  await shot('04b_第2关_宠物格有技能块');
  // 拖技能块到一半：截图看预览（宠物颜色的格子 + 打得动的墨怪套亮圈）
  st = await page.evaluate(() => { const G = window.__game, s = G.g.hand[3] && G.PG.skillBest(G.g); return s && { from: G.slotCenter(3), to: G.fingerFor(G.g.hand[3], s.r, s.c) }; });
  if (st) {
    await page.mouse.move(off.x + st.from.x, off.y + st.from.y); await page.mouse.down();
    await page.mouse.move(off.x + st.to.x, off.y + st.to.y, { steps: 6 }); await page.waitForTimeout(80);
    await shot('04c_第2关_拖技能块_预览'); await page.mouse.up(); await page.waitForTimeout(250);
    await shot('04d_第2关_技能块打下去');
  }
  const used = await page.evaluate(() => window.__game.g.skillUses);
  await petPlay(30);
  await page.waitForTimeout(1300);
  st = await page.evaluate(() => ({ won: window.__game.g.won, caught: window.__game.g.caught, dan: window.__game.result && window.__game.result.dan }));
  ok(st.won && used >= 1 && typeof st.dan === 'number', '第 2 关：铜雀吐技能块、真鼠标拖到墨怪旁边（用了 ' + used + ' 次），抓到 ' + st.caught + ' 只过关');
  // 过关只给「回营地」，没有「下一关」
  await page.evaluate(() => window.__game.skipCuts());
  await page.waitForTimeout(1300);
  await shot('05b_过关只回营地');
  st = await page.evaluate(() => window.__game.buttons().map((x) => x.id));
  const toCamp = st.includes('tocamp') && !st.includes('next') && !st.includes('tomap');
  {
    const n = await page.evaluate(() => (window.__game.save.playLog || []).length);
    ok(st.includes('overCopyLog') && n >= 2, '试玩版：结算页底下有「复制试玩记录」（已记 ' + n + ' 局）');
  }
  await click('tocamp');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ mode: window.__game.mode, play: window.__game.buttons().some((x) => x.id === 'campPlay') }));
  ok(toCamp && st.mode === 'camp' && st.play, '过关后只有「回营地」一个按钮（没有下一关）；营地里能去闯下一关');
  // 第 4 关：墨怪一波一波来（盘面不清空）
  await page.evaluate(() => window.__game.newPetLevel(3));
  await page.waitForTimeout(300);
  await closeIntro();
  const waved = await petPlay(60, () => window.__game.g.waveNo >= 2);
  await page.waitForTimeout(300);
  await shot('06_第4关_第二波冒出来');
  ok(waved, '第 4 关：第一波抓光，第二波从墨里冒出来（盘面不清空）');
  await petPlay(80);
  await page.waitForTimeout(2200);
  await shot('06b_第4关_结算掉丹');
  st = await page.evaluate(() => { const r = window.__game.result; return r && { won: r.won, dan: r.dan, exp: (r.exp || []).length }; });
  ok(st && st.won && typeof st.dan === 'number' && st.exp === 0, '过关结算：出战不涨经验，只看掉没掉丹（这次掉了 ' + (st && st.dan) + ' 颗）');
  // 第 9 关：铁石只有宠物打得碎
  // 超难关：机器人也会输（盘面随机），最多打 3 次
  for (let tries = 0; tries < 3; tries++) {
    await page.evaluate(() => { const G = window.__game; G.setSave({ petStage: 8 }); G.newPetLevel(8); });
    await page.waitForTimeout(300);
    await closeIntro();
    if (!tries) await shot('06c_第9关_铁石');
    await petPlay(220);
    await page.waitForTimeout(1600);
    st = await page.evaluate(() => ({ won: window.__game.g.won, rock: window.__game.g.got.rock, need: window.__game.g.stage.goal.rock }));
    if (st.won) break;
  }
  ok(st.won && st.rock >= st.need, '第 9 关铁石关：普通消除消不掉，铜雀的技能块啄碎 ' + st.rock + ' 块铁石过关（0.9.12 起一关 ' + st.need + ' 块，放在最后一段）');
  // 营地：一下升一级（「升级 · N 颗」），升到 5 级出现「进化」
  await page.evaluate(() => { const G = window.__game; G.save.pets.tongque = { lv: 4, exp: 0 }; G.setSave({ dan: 20 }); G.openCamp(); });
  await page.waitForTimeout(200);
  // 0.9.13 宠物园：点宠物 → 气泡里点丹图标升级 → 够 5 级气泡里出「进化」
  await click('gpet_tongque');
  await page.waitForTimeout(300);
  await shot('07_宠物园_点宠物出气泡');
  await click('feedG');
  await page.waitForTimeout(700);
  await shot('08_宠物园_可以进化');
  st = await page.evaluate(() => ({ lv: window.__game.save.pets.tongque.lv, btn: window.__game.buttons().map((b) => b.id) }));
  ok(st.lv >= 5 && st.btn.includes('evolveG'), '宠物园：点铜雀冒气泡，点丹图标升一级，到 5 级出现「进化」');
  // 进化关
  await click('evolveG');
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
  for (let tries = 0; tries < 3; tries++) { // 头目关一般人六七成一次过：最多打 3 次
    if (tries) { await page.evaluate(() => window.__game.newPetLevel(9)); await page.waitForTimeout(300); await closeIntro(); }
    await petPlay(200);
    await page.waitForTimeout(1400);
    if (await page.evaluate(() => window.__game.g.won)) break;
  }
  st = await page.evaluate(() => ({ won: window.__game.g.won, pets: window.__game.save.petOrder.slice() }));
  ok(st.won && st.pets.includes('baozhu'), '第 10 关打倒大墨怪（消 3 次），得到爆竹鼠');
  // 第 11 关：第一次打借你 2 级爆竹鼠，啃掉挤在一个大格里的铁石
  await page.evaluate(() => { const G = window.__game; G.setSave({ petStage: 10 }); G.newPetLevel(10); });
  await page.waitForTimeout(300);
  await closeIntro();
  await shot('12_第11关_爆竹鼠铁石');
  for (let tries = 0; tries < 3; tries++) {
    if (tries) { await page.evaluate(() => window.__game.newPetLevel(10)); await page.waitForTimeout(300); await closeIntro(); }
    await petPlay(200);
    await page.waitForTimeout(1600);
    if (await page.evaluate(() => window.__game.g.won)) break;
  }
  st = await page.evaluate(() => ({ won: window.__game.g.won, team: window.__game.g.team.map((t) => t.id), rock: window.__game.g.got.rock, need: window.__game.g.stage.goal.rock, hand: (window.__game.g.skillStats || {}).hand || 0 }));
  ok(st.won && st.team[0] === 'baozhu' && st.rock >= st.need, '第 11 关：借来的爆竹鼠啃穿 ' + st.rock + ' 块铁石过关（啃手上的块 ' + st.hand + ' 次）');
  // 0.9.12 爆竹鼠「啃」：技能块拖到手上那块的一格上，啃掉它；真鼠标拖
  {
    await page.evaluate(() => { const G = window.__game; G.newPetLevel(10); });
    await page.waitForTimeout(300); await closeIntro();
    await page.evaluate(() => { const G = window.__game, g = G.g, pt = g.team[0]; g.hand[0] = G.core.PIECES['3h']; g.hand[3] = Object.assign({}, G.PG.FIRE, { pet: pt.id, kind: 'gnaw', n: 1, uses: 1, tier: 1 }); });
    await page.waitForTimeout(80);
    await dragHand(0, 0);
    await page.waitForTimeout(300);
    await shot('12b_爆竹鼠啃手上的块');
    st = await page.evaluate(() => { const g = window.__game.g; return { n: g.hand[0] ? g.hand[0].cells.length : 0, skill: !!g.hand[3] }; });
    ok(st.n === 2 && !st.skill, '爆竹鼠的技能块拖到手上 3 格的长条上：啃掉 1 格剩 2 格，技能块用掉（剩 ' + st.n + ' 格）');
  }
  // 0.9.12 技能块够得着盘面最下面一排（以前手指要伸进托盘，被当成「拖回去」）
  {
    await page.evaluate(() => { const G = window.__game, g = G.g, pt = g.team[0]; g.board[80] = 1; g.color[80] = 0; g.hand[3] = Object.assign({}, G.PG.FIRE, { pet: 'tongque', kind: 'peck', n: 2, uses: 1, tier: 1 }); });
    const ok8 = await page.evaluate(() => { const G = window.__game, f = G.fingerFor(G.g.hand[3], 8, 8), t = G.skillTarget({ x: f.x, y: f.y }); return !!t && t.r === 8 && t.c === 8; });
    ok(ok8, '技能块拖到最下面一排（第 9 行）也认得出落点');
  }
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
  // 怪偷能量（0.9.8 PK）：甲壳怪活着隔 3 手瞪宠物、下一手喷墨偷能量；它的克星铜雀不怕
  st = await page.evaluate(() => {
    const G = window.__game;
    const stage = { goal: { monster: 9 }, d: 0.1, colors: [0, 1, 3], board: ['.........', '.........', '..C......', '.##......', '.........', '......##.', '......C..', '.........', '.........'] };
    const run = (id) => { let n = 0; for (let seed = 1; seed <= 3; seed++) { const g = G.PG.createPetGame({ stage, team: [{ id, lv: 1 }], seed }); g.team[0].energy = 2; for (let k = 0; k < 12 && !g.over; k++) { const m = G.PG.bestMove(g, 0.3); if (!m) break; g.place(m.i, m.r, m.c); } n += g.monStats.drained || 0; } return n; };
    return { rat: run('baozhu'), bird: run('tongque') };
  });
  ok(st.rat > 0 && st.bird === 0, '甲壳怪偷能量：带爆竹鼠被偷 ' + st.rat + ' 格，带铜雀（克它）0 格');
  // 第 27 关：分身怪——打一下裂成两只小墨怪，目标「抓光」
  await page.evaluate(() => { const G = window.__game; G.newPetLevel(26); G.g.team = []; });
  await page.waitForTimeout(300);
  await closeIntro();
  await petPlay(250);
  await page.waitForTimeout(1600);
  st = await page.evaluate(() => ({ won: window.__game.g.won, spawns: window.__game.g.monStats.spawns, left: window.__game.g.monLeft }));
  ok(st.won && st.spawns >= 2 && st.left === 0, '第 27 关：分身怪裂出 ' + st.spawns + ' 只小墨怪，全部抓光过关');
  // 火麒麟：放块攒能量，吐一颗火球进托盘
  // 第 21 关点名火麒麟：它不被偷（这关的墨怪不偷它），攒满吐技能块
  await page.evaluate(() => { const G = window.__game; G.save.pets.sanweihu = { lv: 1, exp: 0 }; if (!G.save.petOrder.includes('sanweihu')) G.save.petOrder.push('sanweihu'); G.setSave({ petStage: 21, activePet: 'sanweihu' }); G.newPetLevel(20); });
  await page.waitForTimeout(300);
  await closeIntro();
  const gotFire = await petPlay(60, () => !!window.__game.g.hand[3]);
  await page.waitForTimeout(400);
  await shot('12c_第21关_火麒麟技能块');
  // 第 20 关：头目大馋嘴啃块
  await page.evaluate(() => { const G = window.__game; G.newPetLevel(19); });
  await page.waitForTimeout(300);
  await closeIntro();
  await petPlay(40, () => window.__game.g.monStats.eats > 0);
  await shot('12d_第20关_大馋嘴啃块');
  st = await page.evaluate(() => ({ ink: window.__game.g.monStats.eats > 0 }));
  ok(gotFire, '火麒麟出战：攒满往宠物格里吐一块技能块');
  ok(st.ink, '第 20 关：头目大馋嘴会啃掉身边的块（先亮牙印）');
  // 0.8 专属关：第 13 关点名铜雀；出战的是爆竹鼠，点开打自动换上金翅雀（铜雀进化后的也算），营地里的选择不变
  await page.evaluate(() => { const G = window.__game; G.save.introSeen.shell = 1; G.setSave({ activePet: 'baozhu' }); G.newPetLevel(12); });
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ team: window.__game.g.team[0].id, active: window.__game.save.activePet }));
  ok(st.team === 'jinchique' && st.active === 'baozhu', '专属关（第 13 关点名铜雀）：自动换上金翅雀，营地里选的爆竹鼠不变');
  await page.evaluate(() => { const G = window.__game; G.g.over = true; G.g.reason = 'stuck'; G.endGame(); });
  await page.waitForTimeout(700);
  if (!(await click('tomap'))) await click('map'); // 0.9.16：丹够升级时这个按钮是「宠物园」，就点左上角的「‹ 地图」
  await page.waitForTimeout(400);
  await shot('13_章页');
  st = await page.evaluate(() => ({ mode: window.__game.mode, btn: window.__game.buttons().map((b) => b.id) }));
  ok(st.mode === 'map' && st.btn.includes('play') && !st.btn.includes('camp') && !st.btn.includes('classic') && !st.btn.includes('album3') && !st.btn.includes('siege') && st.btn.filter((x) => x.startsWith('cell')).length === 10, '章页：一章 9 个关卡格 + 头目卡、开打；营地 / 画册 / 经典拼画入口都去掉了（0.9.7）');
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
  // 0.9.7 起没有入口了（Cc：「经典拼画有啥用啊？」），代码还在，直接调起来测，免得留着的代码坏掉
  await page.evaluate(() => window.__game.newGame(false));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !window.__game.g.stage && window.__game.mode === 'play'), '经典拼画（没有入口，代码还能跑）');
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

  {
    // 设置里关掉震动：照样玩，一下都不震；整局所有震动两两都隔够 40 毫秒
    await page.evaluate(() => { const G = window.__game; G.save.noVibrate = true; G.newGame(false); G.g.hand = [G.core.PIECES['1'], G.core.PIECES['1'], G.core.PIECES['1']]; });
    const n0 = (await hlog()).length;
    await dragTo(0, 0, 0); await page.waitForTimeout(120);
    const n1 = (await hlog()).length;
    await page.evaluate(() => { window.__game.save.noVibrate = false; });
    const h = await hlog(), gaps = h.slice(1).map((x, i) => x.t - h[i].t);
    ok(n1 === n0 && Math.min(...gaps) >= 40, '震动：设置里关掉就不震；整个测试 ' + h.length + ' 次震动，两次最少隔 ' + Math.min(...gaps) + ' 毫秒（' + ['light', 'medium', 'heavy'].map((l) => l + ' ' + h.filter((x) => x.level === l).length).join('、') + '）');
  }
  ok(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} 项通过，${fail} 项没过`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
