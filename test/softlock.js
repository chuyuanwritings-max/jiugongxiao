// 卡死专项（0.9.14 debug 上线前 debug）：模拟微信环境，全用真触摸。每一项对着一个真问题，修之前会失败。
// 一类：点什么都没反应（多指、丢了抬起、复活后没块可放、说明卡盖着过关、画面出错）；
// 二类：判了输赢但结算页没出（普通块抓最后一只、救命块、头目、进化动画、波次交界、点「‹ 地图」）；
// 三类：微信专有（胶囊按钮挡东西、没有 ellipse 的画布、存储满了、老存档）。用法：node test/softlock.js
// 0.9.25 对着现在的设计重写：只有前两章 20 关（js/chapter1.js + chapter2.js）；宠物只有铜雀（第 2 关送）、爆竹鼠（第 10 关送）；
// 宠物的技能块不抓怪、不打头目（petgame.js 的 PECKABLE）；喂到 5 级自动进化（演一段 evoAnim）；老存档（没有 ch1new）清回第 1 关
const fs = require('fs'), path = require('path');
const { boot, playStep, ROOT } = require('./wx-env.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
const section = (name, fn) => { try { fn(); } catch (e) { fail++; console.log('✗ ' + name + '：抛出异常 ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); } };
const SEEN = { pet: 1, gem: 1, wave: 1, monster: 1, gempiece: 1, box: 1, rock: 1, boss: 1, baozhu: 1, shell: 1, jumper: 1, modou: 1, eat: 1, boss2: 1, qilin: 1, color: 1, moss: 1, bomb: 1, split: 1, boss3: 1, steal: 1 };
// 现在这一版的存档：打到第 12 关（过了 11 关），手里是第 2 关送的铜雀、第 10 关送的爆竹鼠。ch1new 表示「已经是新版存档」，不会被清回第 1 关
const OLD = (extra) => JSON.stringify(Object.assign({ ch1new: 1, petTutDone: true, tutorialDone: true, petStage: 11, pets: { tongque: { lv: 4, exp: 1 }, baozhu: { lv: 2, exp: 1 } }, petOrder: ['tongque', 'baozhu'], activePet: 'tongque', dan: 5, introSeen: SEEN, cutSeen: { chapter0: true, chapter1: true, chapter2: true } }, extra || {}));
// 进第 i 关（0 起）、过掉卡片和说明卡，停在能拖块的时候
function enter(E, i, lendLv, lendId) {
  const { G, run, tap, btn, touch } = E;
  if (i >= G.PLV.length) throw new Error('没有第 ' + (i + 1) + ' 关（现在一共 ' + G.PLV.length + ' 关）'); // 关卡表只有 20 关：写错关号直接报出来，不偷偷换一关
  G.newPetLevel(i, false, lendLv, lendId); run(3);
  for (let n = 0; n < 40 && G.mode !== 'play'; n++) {
    if (G.mode === 'cut') { touch('down', 100, 300); run(2); touch('up', 100, 300); }
    else if (G.mode === 'start') { run(10); tap(btn('startGo')); }
    else if (G.mode === 'intro') { run(10); tap(btn('introOk')); }
    run(3);
  }
  run(40);
  return G.g;
}
// 把盘面清空、只留指定的东西；rows：{ 行号: '9 个字符' }（# 块 m 小墨怪 A 甲壳怪 K 头目 R 铁石 . 空）
function setBoard(g, rows) {
  for (let k = 0; k < 81; k++) { g.board[k] = 0; g.mon[k] = null; g.color[k] = 0; g.gem[k] = 0; g.rockHp[k] = 0; g.bubble[k] = 0; }
  g.bigCells = []; g.jumpPlan = {};
  Object.keys(rows).forEach((r) => rows[r].split('').forEach((ch, c) => {
    const k = +r * 9 + c;
    if (ch === '#') { g.board[k] = 1; g.color[k] = 3; }
    else if (ch === 'm') { g.board[k] = 3; g.mon[k] = { t: 'ink', hp: 0, col: -1, cd: 0, tgt: null }; }
    else if (ch === 'A') { g.board[k] = 3; g.mon[k] = { t: 'shell', hp: 1, col: -1, cd: 3, tgt: null }; }
    else if (ch === 'K') { g.board[k] = 4; g.bigCells.push(k); }
    else if (ch === 'R') { g.board[k] = 5; g.rockHp[k] = 1; }
  }));
}
const dragTo = (E, slot, r, c, id) => { const { G, touch, run } = E, from = G.slotCenter(slot), to = G.fingerFor(G.g.hand[slot], r, c); touch('down', from.x, from.y, id); run(2); touch('move', to.x, to.y, id); run(2); touch('up', to.x, to.y, id); };
const waitMode = (E, m, frames) => { for (let n = 0; n < (frames || 200) && E.G.mode !== m; n++) E.run(1); return E.G.mode === m; };
const noWatchdog = (E) => !E.errs().length;
const P1 = (E) => E.G.core.PIECES['1'];

// ---------- 一类：点什么都没反应 ----------
section('多指', () => {
  const E = boot({ seed: 11, store: { luoshu_save_v1: OLD() } }), { G, touch, run, btn } = E;
  const g = enter(E, 11);
  const m = G.PG.bestMove(g, 1), piece = g.hand[m.i], pen = btn('snap');
  touch('down', pen.x + 10, pen.y + 10, 7); run(2); // 左手拇指搭在左下角那支笔上
  const from = G.slotCenter(m.i), to = G.fingerFor(piece, m.r, m.c);
  touch('down', from.x, from.y, 8); run(2); touch('move', to.x, to.y, 8); run(2); touch('up', to.x, to.y, 8); run(5); // 右手拖块，先松
  ok(g.moves === 1 && !G.drag, '一根手指搭在按钮上、另一根拖块先松手：块照样放下去（放了 ' + g.moves + ' 手，拖着的 ' + (G.drag ? '还悬着' : '没有了') + '）');
  touch('up', pen.x + 300, pen.y - 300, 7); run(20); // 左手滑开再抬起：不算点那支笔
  const m2 = G.PG.bestMove(g, 1); dragTo(E, m2.i, m2.r, m2.c, 1); run(20);
  ok(g.moves === 2, '之后一根手指照常能拖（放了 ' + g.moves + ' 手）');
  ok(noWatchdog(E), '没有出错记账');
});
section('丢了抬起', () => {
  const E = boot({ seed: 12, store: { luoshu_save_v1: OLD() } }), { G, touch, run, btn } = E;
  const g = enter(E, 11);
  const m = G.PG.bestMove(g, 1), from = G.slotCenter(m.i);
  touch('down', from.x, from.y, 3); run(2); touch('move', from.x + 30, from.y - 200, 3); run(2);
  E.lose(3); run(30); // 手指已经离开屏幕，但微信没给「抬起」（系统手势、来电）
  ok(!!G.drag, '（前提）没收到抬起，块还悬着');
  const m2 = G.PG.bestMove(g, 1); dragTo(E, m2.i, m2.r, m2.c, 4); run(20);
  ok(g.moves === 1 && !G.drag, '下一次按下：悬着的那块作废，新的这一下照常拖、放得下（放了 ' + g.moves + ' 手）');
  // 切到后台：拖着的块放回去
  const m3 = G.PG.bestMove(g, 1), f3 = G.slotCenter(m3.i);
  touch('down', f3.x, f3.y, 5); run(2); ok(!!G.drag, '（前提）拖着一块');
  E.env.hide(); E.lose(5); run(5); E.env.show(); run(5);
  ok(!G.drag, '切到后台再回来：拖着的块放回托盘');
  // 被系统打断（微信给的是「取消」不是「抬起」）：块回托盘，不落在打断那一刻的位置
  const m4 = G.PG.bestMove(g, 1), f4 = G.slotCenter(m4.i), t4 = G.fingerFor(g.hand[m4.i], m4.r, m4.c), mv = g.moves;
  touch('down', f4.x, f4.y, 9); run(2); touch('move', t4.x, t4.y, 9); run(2); touch('cancel', t4.x, t4.y, 9); run(5);
  ok(!G.drag && g.moves === mv && !!g.hand[m4.i], '拖到盘上时被系统打断：块回到托盘，没有落下去');
  const b = btn('map'); E.tap(b, 6); run(5);
  ok(G.mode === 'map', '回来以后按钮点得动（点「‹ 地图」到了 ' + G.mode + '）');
});
section('多指乱按', () => {
  // 两三根手指随机按下 / 挪 / 抬起 / 丢了抬起 / 被打断，穿插切后台；每乱按一阵，查一次「单指还能不能正常放一块」。修之前 300 次里有 140 次放不了
  let bad = 0, checks = 0, errs = 0;
  for (let sd = 1; sd <= 12; sd++) {
    const E = boot({ seed: sd, store: { luoshu_save_v1: OLD() } }), { G, run, touch } = E;
    enter(E, 11);
    for (let round = 0; round < 25; round++) {
      for (let k = 0; k < 40; k++) {
        const id = 2 + Math.floor(Math.random() * 3), x = Math.random() * E.W, y = E.H * 0.3 + Math.random() * E.H * 0.7, r = Math.random();
        if (r < 0.3) touch('down', x, y, id); else if (r < 0.6) touch('move', x, y, id); else if (r < 0.8) touch('up', x, y, id); else if (r < 0.88) E.lose(id); else if (r < 0.94) touch('cancel', x, y, id); else { E.env.hide(); run(2); E.env.show(); }
        run(1 + Math.floor(Math.random() * 3));
      }
      for (const id of [2, 3, 4]) E.lose(id); run(5);
      for (let k = 0; k < 400 && G.mode === 'ad'; k++) run(1);
      if (G.mode !== 'play' || G.g.over || !G.PG.bestMove(G.g, 1)) enter(E, 11); // 乱按点到了「‹ 地图」、结算、广告：回到关里再查
      const g = G.g, m = G.PG.bestMove(g, 1); if (!m) continue;
      const mv = g.moves; dragTo(E, m.i, m.r, m.c, 1); run(10); checks++;
      if (g.moves !== mv + 1 || G.drag) bad++;
    }
    errs += E.errs().length;
  }
  ok(checks >= 250 && bad === 0 && errs === 0, '多指乱按 12 轮以后，单指放块 ' + checks + ' 次全都放得下（放不了 ' + bad + ' 次，出错记账 ' + errs + ' 条）');
});
section('复活', () => {
  // 正中间没有能清的方块（铁石占着），盘上只剩孤零零的单个空格（每排三个，放一两块下去什么都消不掉），手上三块大的 → 复活以后必须有块可放
  const E = boot({ seed: 13, store: { luoshu_save_v1: OLD() } }), { G, run, btn, tap } = E;
  const g = enter(E, 11);
  const jam = () => {
    // 每排、每竖、每个大格都留着空格（放一块下去不会消掉什么），但空格全是孤零零的一个：只有 1 格的块放得下
    for (let k = 0; k < 81; k++) { if (g.board[k] >= 2) continue; const r = Math.floor(k / 9), c = k % 9, m = ((c - 2 * r) % 9 + 9) % 9; g.board[k] = m % 3 === 0 ? 0 : 1; g.color[k] = 3; }
    [30, 31, 32, 39, 40, 41, 48, 49, 50].forEach((k) => { if (g.board[k] === 1) { g.board[k] = 5; g.rockHp[k] = 2; } }); // 正中间没有能清的方块（头目 / 铁石占着）
    g.team.forEach((t) => (t.energy = 0)); g.hand = [G.core.PIECES.sq3, G.core.PIECES['5h'], G.core.PIECES.L5a, null];
  };
  jam();
  ok(g.stuck(), '（前提）三块都放不下、宠物没能量');
  g.over = true; g.reason = 'stuck'; G.endGame(); run(60);
  ok(G.mode === 'over' && btn('revive'), '堵死 → 结算页有「清空正中间」');
  tap(btn('revive')); for (let n = 0; n < 400 && G.mode === 'ad'; n++) run(1); run(10);
  ok(G.mode === 'play' && !g.over && !g.stuck(), '看完广告回到关里：一定有块可放（手上 ' + g.hand.slice(0, 3).map((p) => (p ? p.id : '-')).join(',') + '，' + (g.stuck() ? '全放不下' : '放得下') + '）');
  const m = G.PG.bestMove(g, 1); ok(!!m, '机器人找得到能放的一手');
  if (m) { dragTo(E, m.i, m.r, m.c); run(40); ok(g.moves >= 1, '真拖一块放得下'); }
  // 再堵死一次：结算页照样出（0.9.14 修过的那个）
  if (!g.over) { jam(); g.over = true; g.reason = 'stuck'; }
  ok(waitMode(E, 'over', 300) && !!G.result, '复活后再堵死：结算页照样弹');
  ok(noWatchdog(E), '全程没有靠看门狗、没有出错记账' + (E.errs().length ? '：' + E.errs()[0].slice(2, 4).join(' / ') : ''));
});
section('画面连着出错', () => {
  const E = boot({ seed: 14, store: { luoshu_save_v1: OLD() } }), { G, run, btn } = E;
  const g = enter(E, 11);
  g.over = true; g.reason = 'stuck'; G.endGame(); run(60);
  G.result.exp = null; // 结算页画到一半每帧出错（0.9.14 那次真 bug 的样子）：按钮一个都出不来
  run(5); ok(!btn('again'), '（前提）结算页画到一半出错，按钮出不来');
  run(90);
  ok(G.mode === 'map' && !!btn('play'), '半秒以后自动换到地图，按钮点得动（现在在 ' + G.mode + '）');
  ok(E.events().some((e) => e[1] === 'X' && e[2] === 'rescue'), '试玩记录里记了一笔「rescue」');
});

// ---------- 二类：判了输赢，结算页必须自己出来（不靠看门狗） ----------
// 每一项：摆一个「再一下就赢」的盘面 → 真触摸做那一下 → 结算页出来、是赢、试玩记录里没有看门狗
function winCase(name, lv, setup, act, extra) {
  section(name, () => {
    const E = boot({ seed: 20 + lv, store: { luoshu_save_v1: OLD(extra) } }), { G, run } = E;
    const g = enter(E, lv);
    setup(E, g); run(3);
    act(E, g);
    const got = waitMode(E, 'over', 200); run(120);
    ok(got && G.result && G.result.won && E.btn('tocamp') && noWatchdog(E), name + '：结算页出来了、能点「回宠物园」（' + (got ? '出了' : '没出，停在 ' + G.mode) + (E.errs().length ? '；出错记账：' + E.errs()[0].slice(2, 4).join(' / ') : '') + '）');
  });
}
const lastMon = (g) => { g.waveQ.length = 0; if ('monster' in g.got) g.got.monster = g.stage.goal.monster - 1; if ('rock' in g.got) g.got.rock = g.stage.goal.rock; };
winCase('普通块消掉最后一只墨怪', 11, (E, g) => { setBoard(g, { 4: 'm#######.' }); lastMon(g); g.hand = [P1(E), null, null, null]; }, (E) => dragTo(E, 0, 4, 8));
// 删了「技能块（啄）抓到最后一只墨怪」：现在宠物的技能块不抓怪（petgame.js PECKABLE 不含墨怪，只有火麒麟会，前两章没有它）
// 救命块（0.9.25 改）：技能块不抓怪了，改成「救命块啄开一条缝 → 普通块凑满那一排抓到最后一只」。第 13 关（不点名，带铜雀）
winCase('救命的技能块啄开路、普通块抓到最后一只', 12, (E, g) => {
  setBoard(g, { 0: '#.#.#.#.#', 1: '.#.#.#.#.', 2: '#.#.#.#.#', 3: '.#.#.#.#.', 4: 'm.#######', 5: '.#.#.#.#.', 6: '#.#.#.#.#', 7: '.#.#.#.#.', 8: '#.#.#.#..' });
  const n = E.G.PG.skillN(g.team[0].id, g.team[0].lv); // 铜雀啄几格：啄完第 4 排空出 n + 1 格，正好放一根 (n+1) 横条
  lastMon(g); g.team[0].energy = 2; g.hand = [E.G.core.PIECES['2h'], E.G.core.PIECES[(n + 1) + 'h'], null, null];
}, (E, g) => {
  dragTo(E, 0, 8, 7); E.run(40); // 放完这块，剩下那根横条哪都放不下 → 宠物提前把技能块给你
  if (!g.hand[3]) throw new Error('宠物没来救（手上没有技能块）'); if (g.over) throw new Error('有救命块却判了输');
  dragTo(E, 3, 4, 1); E.run(40); // 啄第 4 排：怪旁边空出一条
  if (g.over) throw new Error('啄完判了输'); dragTo(E, 1, 4, 1);
});
winCase('头目最后一颗心（普通块）', 9, (E, g) => { setBoard(g, { 3: '....KK...', 4: '####KK##.' }); g.bigHp = 1; g.boss.hp = 1; g.boss.jumpTo = null; g.boss.nextSpit = null; g.hand = [P1(E), null, null, null]; }, (E) => dragTo(E, 0, 4, 8));
winCase('泥沼怪最后一颗心（第 20 关，普通块）', 19, (E, g) => { setBoard(g, { 3: '....KK...', 4: '####KK##.' }); g.bigHp = 1; g.boss.hp = 1; g.boss.jumpTo = null; g.boss.nextSpit = null; g.hand = [P1(E), null, null, null]; }, (E) => dragTo(E, 0, 4, 8));
// 删了「头目最后一颗心（技能块）」：技能块打不到头目（petgame.js PECKABLE 不含头目，Cc 11-27 第 4 件）
// 删了「分身王最后一颗心」：分身王在旧 30 关表里，前两章没有
// 删了「抓光关（all）最后一只」：前两章没有「抓光」目标的关
section('波次交界', () => {
  const E = boot({ seed: 31, store: { luoshu_save_v1: OLD() } }), { G, run } = E;
  const g = enter(E, 17); // 第 18 关：3 波（第 12 关现在只有 2 波）
  ok(g.waveTotal === 3 && g.waveQ.length === 2, '（前提）第 18 关 3 波');
  for (let w = 1; w <= 2; w++) {
    setBoard(g, { 4: 'm#######.' }); g.got.monster = Math.min(g.got.monster, g.stage.goal.monster - 2); g.hand = [P1(E), E.G.core.PIECES['2h'], null, null];
    dragTo(E, 0, 4, 8); run(80);
    ok(!g.over && g.waveNo === w + 1 && g.mon.some(Boolean) && G.mode === 'play', '抓光第 ' + w + ' 波：第 ' + g.waveNo + ' 波冒出来，接着打（盘上 ' + g.mon.filter(Boolean).length + ' 只）');
    const m = G.PG.bestMove(g, 1); ok(!!m, '第 ' + (w + 1) + ' 波冒出来以后还有块能放');
  }
  setBoard(g, { 4: 'm#######.' }); g.got.monster = g.stage.goal.monster - 1; g.hand = [P1(E), null, null, null];
  dragTo(E, 0, 4, 8);
  ok(waitMode(E, 'over', 200) && G.result.won && noWatchdog(E), '最后一波抓光：过关，结算页出来');
});
// 0.9.17 起没有进化关了（Cc 11-27 第 9 件）：宠物园里喂到 5 级，当场演一段进化（evoAnim，整屏盖住，点 evoTap 跳过）。
// 要查的卡死：动画盖着的时候点什么都没反应——演完 / 点掉以后，宠物园必须点得动；没人点也要自己收
section('进化动画', () => {
  const E = boot({ seed: 32, store: { luoshu_save_v1: OLD({ pets: { tongque: { lv: 4, exp: 0 }, baozhu: { lv: 1, exp: 1 } }, dan: 30 }) } }), { G, run, btn, tap } = E;
  G.openCamp(); run(5); tap(btn('gpet_tongque')); run(5);
  ok(!!btn('feedG'), '宠物园：4 级的铜雀点一下，气泡里是「喂丹」');
  tap(btn('feedG')); run(60);
  ok(G.save.pets.jinchique && G.save.pets.jinchique.lv === 5 && !G.save.pets.tongque && G.save.activePet === 'jinchique', '喂到 5 级：当场进化成金翅雀，出战的也换成金翅雀');
  ok(!btn('evoTap') && !btn('campPlay'), '进化动画开演：前 3 秒整屏盖住，点不掉（也点不到底下的按钮）');
  for (let n = 0; n < 400 && !btn('evoTap'); n++) run(1);
  ok(!!btn('evoTap'), '3 秒以后能点（整屏的 evoTap）');
  tap(btn('evoTap')); run(5); tap(btn('evoTap')); run(10); // 点一下跳到结尾，再点一下关掉
  ok(G.mode === 'camp' && !btn('evoTap') && !!btn('gpet_jinchique') && !!btn('campPlay'), '点两下关掉动画：回到宠物园，金翅雀在园子里，「出发」点得动');
  tap(btn('campPlay')); run(10);
  ok(G.mode === 'map' && noWatchdog(E), '点「出发」到了地图（' + G.mode + '），没有出错记账');
  // 没人点：动画自己收
  const E2 = boot({ seed: 37, store: { luoshu_save_v1: OLD({ pets: { tongque: { lv: 4, exp: 0 } }, petOrder: ['tongque'], dan: 30 }) } });
  E2.G.openCamp(); E2.run(5); E2.tap(E2.btn('gpet_tongque')); E2.run(5); E2.tap(E2.btn('feedG'));
  E2.run(800); // 约 13 秒
  ok(!E2.btn('evoTap') && !!E2.btn('campPlay') && !E2.errs().length, '进化动画没人点：十来秒后自己收，宠物园照样点得动');
  // 删了「进化关点顶上的目标图标」：没有进化关了
  // 坏存档 / 手改的存档里，5 级以上还没进化的宠物（fixSave 只把等级夹到 1–10，不替它进化）：宠物园里还会出「进化」按钮，它走的是已经删掉的进化关
  const E3 = boot({ seed: 38, store: { luoshu_save_v1: OLD({ pets: { tongque: { lv: 3, exp: 0 }, baozhu: { lv: 99, exp: -3 } } }) } });
  E3.G.openCamp(); E3.run(5); E3.tap(E3.btn('gpet_baozhu')); E3.run(5);
  if (E3.btn('evolveG')) { E3.tap(E3.btn('evolveG')); E3.run(30); }
  ok(!E3.errs().length && (E3.G.save.pets.baozhuwang || !E3.btn('evolveG')), '存档里 10 级还没进化的爆竹鼠：宠物园里点它、点「进化」不出错，能进化或者不给这个按钮' + (E3.errs().length ? '（出错记账：' + E3.errs()[0].slice(2, 4).join(' / ') + '）' : ''));
});
section('说明卡盖着的时候过关', () => {
  // 第一次被偷能量：1.2 秒后弹「墨怪会偷能量」。那一刻手上正拖着能过关的那一块
  const seen = Object.assign({}, SEEN); delete seen.steal;
  const E = boot({ seed: 33, store: { luoshu_save_v1: OLD({ introSeen: seen, activePet: 'baozhu' }) } }), { G, run, touch, btn, tap } = E;
  const g = enter(E, 11);
  setBoard(g, { 4: 'm######..', 0: 'A........' }); lastMon(g); g.got.monster = g.stage.goal.monster - 2; // 还差两只：甲壳怪一只、小墨怪一只……其实只要抓到一只就把数补齐
  g.got.monster = g.stage.goal.monster - 1;
  g.mon[0].tgt = -1; g.team[0].energy = 3; g.hand = [P1(E), P1(E), null, null]; run(3);
  dragTo(E, 0, 4, 7); run(10); // 这一手：甲壳怪冲爆竹鼠喷墨（偷能量），1.2 秒后要弹卡
  ok(!g.over && !!E.G.T, '（前提）放了一手，被偷了能量');
  const from = G.slotCenter(1), to = G.fingerFor(g.hand[1], 4, 8);
  touch('down', from.x, from.y, 1); run(2); touch('move', to.x, to.y, 1); run(90); // 拖着不放，等过了弹卡的时间
  ok(G.mode === 'play', '手上拖着块的时候，说明卡不弹（现在 ' + G.mode + '）');
  touch('up', to.x, to.y, 1);
  const got = waitMode(E, 'over', 200);
  if (G.mode === 'intro') { tap(btn('introOk')); run(250); }
  ok(got && G.result && G.result.won && noWatchdog(E), '松手过关：结算页直接出来，不靠看门狗（' + G.mode + (E.errs().length ? '；' + E.errs()[0].slice(2, 4).join(' / ') : '') + '）');
});
section('点「‹ 地图」', () => {
  const E = boot({ seed: 34, store: { luoshu_save_v1: OLD() } }), { G, run, btn, tap } = E;
  let g = enter(E, 11);
  setBoard(g, { 4: 'm#######.' }); lastMon(g); g.hand = [P1(E), null, null, null]; run(2);
  dragTo(E, 0, 4, 8); run(1);
  ok(g.over && g.won && G.mode === 'play', '（前提）刚过关，结算页还没出');
  tap(btn('map')); run(10);
  ok(G.mode === 'camp' && G.save.petStage >= 12, '过关那一下马上点「‹ 地图」：记了账（进度 ' + G.save.petStage + '），回宠物园（' + G.mode + '）');
  ok(G.mode === 'camp' && !!btn('campPlay'), '宠物园里能点「出发」');
  g = enter(E, 11);
  const m = G.PG.bestMove(g, 1); dragTo(E, m.i, m.r, m.c); run(20);
  tap(btn('map')); run(10);
  ok(G.mode === 'map' && !!btn('play') && G.save.playLog[G.save.playLog.length - 1].quit === 1, '打到一半点「‹ 地图」：回地图，记一行中途退出');
  g = enter(E, 11);
  g.hand = [E.G.core.PIECES.sq3, null, null, null]; for (let k = 0; k < 81; k++) if (!g.board[k] && (k % 9 + Math.floor(k / 9)) % 2) { g.board[k] = 1; g.color[k] = 3; } g.team[0].energy = 0;
  g.over = true; g.reason = 'stuck'; run(1);
  tap(btn('map')); run(10);
  ok(G.mode === 'map' && !!btn('play'), '堵死那一下马上点「‹ 地图」：回地图（' + G.mode + '）');
  ok(noWatchdog(E), '没有出错记账');
});
section('换一组', () => {
  const E = boot({ seed: 35, store: { luoshu_save_v1: OLD() } }), { G, run, btn, tap } = E;
  const g = enter(E, 11);
  setBoard(g, { 0: '#.#.#.#.#', 2: '.#.#.#.#.', 4: 'm.#.#.#.#', 6: '.#.#.#.#.', 8: '#.#.#.#.#', 1: '.#.#.#.#.', 3: '#.#.#.#.#', 5: '.#.#.#.#.', 7: '#.#.#.#..' });
  g.hand = [P1(E), E.G.core.PIECES.sq3, E.G.core.PIECES['5h'], null]; run(5);
  ok(!!btn('reroll'), '有块放不下、还有块能放：出「换一组」');
  tap(btn('reroll')); for (let n = 0; n < 400 && G.mode === 'ad'; n++) run(1); run(5);
  ok(G.mode === 'play' && !g.over && !g.stuck() && G.core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean)), '看完广告：换来的三块放得下（' + g.hand.slice(0, 3).map((p) => (p ? p.id : '-')).join(',') + '）');
});

// ---------- 新功能 ----------
section('啃手上的块', () => {
  for (const [w, h] of [[375, 667], [390, 844], [430, 932]]) {
    const E = boot({ seed: 40, w, h, store: { luoshu_save_v1: OLD({ activePet: 'baozhu' }) } }), { G, run, touch } = E;
    const g = enter(E, 11);
    const bad = []; let tried = 0;
    for (const id of G.core.IDS) {
      const piece = G.core.PIECES[id];
      for (let slot = 0; slot < 3; slot++) for (let j = 0; j < piece.cells.length; j++) {
        if (slot !== (j % 3)) continue; // 每个格子在三个托盘位置里轮着试
        const want = G.PG.gnawPiece(piece, j);
        if (want === undefined) continue; // 啃了会断成两截：本来就不让啃
        g.hand = [null, null, null, Object.assign({}, G.PG.FIRE, { pet: 'baozhu', tier: 1, kind: 'gnaw', n: 1, uses: 1 })]; g.hand[slot] = piece; g.hand[(slot + 1) % 3] = G.core.PIECES['2h']; g.handColor[3] = 1; g.over = false;
        run(2); tried++;
        const f = G.fingerForHand(slot, j), from = G.slotCenter(3);
        touch('down', from.x, from.y); run(1); touch('move', f.enter.x, f.enter.y); run(1);
        for (let k = 1; k <= 4; k++) { touch('move', f.enter.x + ((f.x - f.enter.x) * k) / 4, f.enter.y + ((f.y - f.enter.y) * k) / 4); run(1); } // 像手指那样一路挪上去
        touch('up', f.x, f.y); run(2);
        const now = g.hand[slot];
        if (g.hand[3] || (want === null ? now !== null : !now || now.cells.length !== piece.cells.length - 1)) bad.push(id + ' 第' + (j + 1) + '格@托盘' + (slot + 1));
      }
    }
    ok(!bad.length, w + '×' + h + '：每种块每个啃得动的格子，真触摸都啃得到（试了 ' + tried + ' 个' + (bad.length ? '；啃不到 ' + bad.length + ' 个：' + bad.slice(0, 6).join('、') : '') + '）');
  }
});
section('几波', () => {
  const PG = require(path.join(ROOT, 'js/petgame.js')), PLV = require(path.join(ROOT, 'js/petlevels.js'));
  const bad = PLV.map((st, i) => (PG.createPetGame({ stage: st, team: i ? [{ id: 'tongque', lv: 1 }] : [], seed: 5 }).waveTotal === PG.waveTotalOf(st) ? null : i + 1)).filter(Boolean);
  ok(PLV.length === 20 && !bad.length && PG.waveTotalOf(PLV[4]) === 3 && PG.waveTotalOf(PLV[3]) === 2 && PG.waveTotalOf(PLV[0]) === 1, '20 关：卡片上画的波数 = 关里顶上的圆点数（第 5 关 3 波、第 4 关 2 波、第 1 关 1 波）' + (bad.length ? '；对不上：' + bad.join(',') : ''));
  const src = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  ok(!/waves\.length/.test(src) && (src.match(/PG\.waveTotalOf\(/g) || []).length >= 2, 'main.js 里关卡卡片、宠物园都用 PG.waveTotalOf，不再自己数（原来少数一波）');
  // 删了「第 12 关的卡片上写『3 波』」：0.9.20 起卡片不写字（wordsOff），波数只画圆点，数是上面那条 PG.waveTotalOf 管的
});
section('手选宠物', () => {
  const E = boot({ seed: 42, store: { luoshu_save_v1: OLD({ freshPet: { tongque: true }, petStage: 11 }) } }), { G, run, btn, tap } = E;
  G.newPetLevel(12); run(20); // 第 13 关：不点名
  ok(G.mode === 'start' && ['tongque', 'baozhu'].every((id) => btn('cardPet_' + id)), '不点名的关（第 13 关）：卡片上摆出铜雀、爆竹鼠两只');
  const full = (g) => g.team[0].energy >= G.PG.energyMax(g, g.team[0]) - 1;
  ok(full(G.g), '（前提）刚升过级的铜雀：这一关开局能量只差一格');
  for (const id of ['baozhu', 'tongque', 'baozhu', 'baozhu', 'tongque']) { tap(btn('cardPet_' + id)); run(3); }
  ok(G.mode === 'start' && G.g.team[0].id === 'tongque' && G.save.activePet === 'tongque', '连着点 5 下换来换去：还在卡片上，最后选的是铜雀');
  ok(full(G.g), '换一圈再换回铜雀：「能量只差一格」还在（原来一摆出卡片就用掉了）');
  tap(btn('startGo')); run(30);
  ok(G.mode === 'play' && !(G.save.freshPet || {}).tongque, '点「开打」才用掉');
  ok(G.g.team[0].id === 'tongque' && G.buttons().some((b) => b.id === 'petSlot'), '进关：右下角宠物格里是铜雀');
  // 点名关：不给换
  G.newPetLevel(10); run(20); // 第 11 关 only: 'baozhu'（第 3 关点名铜雀、第 11、12 关点名爆竹鼠，以后会改，先照现在的表测）
  ok(G.mode === 'start' && !G.buttons().some((b) => b.id.startsWith('cardPet_')) && G.g.team[0].id === 'baozhu', '点名关（第 11 关点名爆竹鼠）：卡片上不给换，出战的是爆竹鼠');
  tap(btn('startGo')); run(20); if (G.mode === 'intro') tap(btn('introOk'));
  ok(G.save.activePet === 'tongque', '点名只管这一关：平时带的还是铜雀');
  // 只有 1 只宠物
  const E1 = boot({ seed: 43, store: { luoshu_save_v1: OLD({ petStage: 3, pets: { tongque: { lv: 1, exp: 1 } }, petOrder: ['tongque'] }) } });
  E1.G.newPetLevel(3); E1.run(20);
  ok(E1.G.mode === 'start' && !E1.G.buttons().some((b) => b.id.startsWith('cardPet_')) && !!E1.btn('startGo'), '只有 1 只宠物：卡片上不摆选择，直接「开打」');
  E1.G.openCamp(); E1.run(20); E1.tap(E1.btn('gpet_tongque')); E1.run(5);
  ok(E1.btn('feedG') && !E1.errs().length, '只有 1 只宠物的宠物园：点它冒气泡，不出错');
});
// 删了「火麒麟的灯」（开局照着下一批、托盘下面画「下一批」）：前两章没有火麒麟，也没有「下一批」
section('开局发牌', () => {
  const PG = require(path.join(ROOT, 'js/petgame.js')), PLV = require(path.join(ROOT, 'js/petlevels.js')), core = require(path.join(ROOT, 'js/core.js'));
  let n = 0, bad = 0;
  for (let i = 1; i < PLV.length; i++) for (let s = 1; s <= 60; s++) { const st = PLV[i], g = PG.createPetGame({ stage: st, team: [{ id: st.only || ['tongque', 'baozhu'][s % 2], lv: 1 + (s % 4) }], seed: s * 7919 + i * 13 }); n++; if (!core.solvable(g.board, g.hand.slice(0, 3))) bad++; }
  ok(bad === 0, '第 2–' + PLV.length + ' 关各开 60 局：开局三块都有一种放法全放得下（' + n + ' 局里 ' + bad + ' 局不行；原来五十局有一局）');
});

section('关卡表自检', () => {
  // 关卡表写错一个字就是一关卡死：目标比盘上的东西多 = 永远过不了；说明卡的名字没有 = 那张卡每帧出错、「继续」出不来
  const PG = require(path.join(ROOT, 'js/petgame.js')), PLV = require(path.join(ROOT, 'js/petlevels.js'));
  const src = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8'), intro = src.slice(src.indexOf('const INTRO = {'), src.indexOf('// 关卡卡片：第几关'));
  const bad = [], cnt = (rows, set) => rows.join('').split('').filter((ch) => set.includes(ch)).length;
  PLV.forEach((st, i) => {
    // 墨怪的字照 petgame.js 的 MON_CHAR（N = 0.9.20 第二章的粘墨怪；原来没数它，第 14、15、17、19 关被错报「怪不够」）
    const all = [st.board].concat(st.waves || []), mons = all.reduce((a, w) => a + cnt(w, 'mABCJEGTSN0123456'), 0), rocks = all.reduce((a, w) => a + cnt(w, 'RQ'), 0);
    if (st.goal.monster > mons) bad.push((i + 1) + ' 关要抓 ' + st.goal.monster + ' 只，一共只有 ' + mons);
    if (st.goal.rock > rocks) bad.push((i + 1) + ' 关要碎 ' + st.goal.rock + ' 块铁石，只有 ' + rocks);
    if (st.goal.boss && cnt(st.board, 'K') !== 4) bad.push((i + 1) + ' 关头目不是 2×2');
    if (st.goal.box && !cnt(st.board, 'M')) bad.push((i + 1) + ' 关没有机关匣');
    if (st.intro && !new RegExp('\\b' + st.intro + ': \\{').test(intro)) bad.push((i + 1) + ' 关的说明卡 ' + st.intro + ' 没有');
    for (const k of ['only', 'gift', 'best']) if (st[k] && !PG.PETS[st[k]]) bad.push((i + 1) + ' 关 ' + k + ' 不认识 ' + st[k]);
    if (all.some((w) => w.length !== 9 || w.some((r) => r.length !== 9))) bad.push((i + 1) + ' 关盘面不是 9×9');
    if ((st.goal.rock || st.goal.acts) && i === 0) bad.push('第 1 关没有宠物，却要宠物才过得了');
  });
  ok(PLV.length === 20 && !bad.length, '20 关关卡表：目标都够得着、说明卡都有、点名的宠物都认得' + (bad.length ? '——' + bad.join('；') : ''));
});

// ---------- 三类：微信专有 ----------
section('胶囊按钮', () => {
  for (const [w, h] of [[375, 667], [390, 844], [430, 932]]) {
    const E = boot({ seed: 50, w, h, store: { luoshu_save_v1: OLD() } }), { G, run } = E;
    const cap = G.capsule, hit = (r) => r.x < cap.right + 4 && r.x + (r.w || 0) > cap.left - 4 && r.y < cap.bottom + 2 && r.y + (r.h || 0) > cap.top - 2;
    const under = [];
    const scan = (page) => { const drawn = E.frameDrawn(); G.buttons().filter((b) => b.id !== 'map' || true).forEach((b) => { if (hit(b)) under.push(page + ' 按钮 ' + b.id); }); drawn.forEach((d) => { if (hit({ x: d.x - 4, y: d.y - 8, w: 8, h: 16 })) under.push(page + ' 字「' + d.s + '」'); }); };
    G.mode = 'home'; run(5); scan('主菜单');
    G.mode = 'map'; run(5); scan('地图');
    G.openCamp(); run(5); scan('宠物园');
    G.mode = 'settings'; run(5); scan('设置');
    G.newPetLevel(11); run(20); scan('关卡卡片');
    E.tap(E.btn('startGo')); run(30); scan('关里');
    G.newPetLevel(19); run(20); E.tap(E.btn('startGo')); run(30); scan('关里（头目关）'); // 前两章没有两个目标的关：换成头目关（顶上是心）
    G.g.over = true; G.g.reason = 'stuck'; G.endGame(); run(80); scan('结算');
    ok(cap && !under.length, w + '×' + h + '：胶囊按钮底下没有按钮、没有字（胶囊 ' + Math.round(cap.left) + '–' + Math.round(cap.right) + ' × ' + cap.top + '–' + cap.bottom + (under.length ? '；被挡住：' + [...new Set(under)].slice(0, 6).join('，') : '') + '）');
    ok(E.errs().length === 0, w + '×' + h + '：各页都不出错');
  }
});
section('按钮不出屏、不叠在一起', () => {
  for (const [w, h] of [[375, 667], [430, 932]]) {
    const E = boot({ seed: 51, w, h, store: { luoshu_save_v1: OLD({ loss: { 12: 2 } }) } }), { G, run } = E;
    const bad = [];
    const scan = (page, pairs) => {
      run(2); const bs = G.buttons();
      bs.forEach((b) => { if (b.x < -1 || b.y < -1 || b.x + b.w > w + 1 || b.y + b.h > h + 1) bad.push(page + ' ' + b.id + ' 出屏'); });
      (pairs || []).forEach(([a, c]) => { const A = bs.find((b) => b.id === a), C = bs.find((b) => b.id === c); if (A && C && A.x < C.x + C.w && C.x < A.x + A.w && A.y < C.y + C.h && C.y < A.y + A.h) bad.push(page + ' ' + a + ' 和 ' + c + ' 叠在一起'); });
    };
    G.mode = 'home'; run(5); scan('主菜单', [['snap', 'homePlay']]);
    G.mode = 'map'; run(5); scan('地图', [['snap', 'play'], ['snap', 'train'], ['play', 'train'], ['settings', 'chNext'], ['home', 'chPrev'], ['cell10', 'home'], ['cell12', 'settings']]);
    G.openCamp(); run(5); scan('宠物园', [['snap', 'campPlay'], ['campBack', 'gpet_tongque']]);
    E.tap(E.btn('gpet_tongque')); run(5); scan('宠物园气泡', [['feedG', 'campPlay']]);
    G.mode = 'settings'; run(5); scan('设置', [['snap', 'setBack'], ['setCopyLog', 'setBack'], ['setCopyLog', 'setReset']]);
    G.newPetLevel(14); run(20); scan('关卡卡片', [['startGo', 'cardPet_tongque'], ['startGo', 'cardPet_baozhu'], ['cardPet_tongque', 'cardPet_baozhu'], ['snap', 'startGo']]); // 第 15 关：不点名，摆两只
    E.tap(E.btn('startGo')); run(30); scan('关里', [['snap', 'petSlot'], ['map', 'goal_monster']]);
    G.g.over = true; G.g.reason = 'stuck'; G.endGame(); run(80); scan('输了', [['again', 'revive'], ['again', 'tomap'], ['revive', 'tomap'], ['overCopyLog', 'tomap'], ['overCopyLog', 'revive'], ['snap', 'overCopyLog']]);
    // 「请 X 来帮忙」只在你手里有更对口的宠物时出：第 13 关是土堆关（爆竹鼠对口），带着铜雀连输两次 → 请爆竹鼠
    G.newPetLevel(12); run(20); E.tap(E.btn('startGo')); run(20); if (G.mode === 'intro') E.tap(E.btn('introOk')); G.g.over = true; G.g.reason = 'stuck'; G.endGame(); run(80); scan('连输两次', [['again', 'lend'], ['lend', 'tomap'], ['overCopyLog', 'lend'], ['snap', 'overCopyLog']]);
    ok(!!E.btn('lend') && G.g.team[0].id === 'tongque', w + '×' + h + '：第 13 关带铜雀连输两次以后，结算页有「请爆竹鼠来帮忙」');
    ok(!bad.length, w + '×' + h + '：各页按钮都在屏幕里、不叠在一起' + (bad.length ? '——' + bad.slice(0, 6).join('；') : ''));
  }
});
section('没有 ellipse 的画布', () => {
  const E = boot({ seed: 52, ellipse: false, store: { luoshu_save_v1: OLD({ petStage: 20 }) } }), { G, run } = E;
  for (const lv of [7, 13, 9, 19]) { enter(E, lv); run(30); for (let n = 0; n < 6 && !G.g.over; n++) { playStep(E, 1); } } // 墨苔怪、粘墨怪、大墨怪、泥沼怪
  G.newPetLevel(11); run(30);
  ok(E.errs().length === 0, '老微信画布（没有 ctx.ellipse）：墨苔怪、粘墨怪、两个头目关画得出来，不出错' + (E.errs().length ? '：' + E.errs()[0].slice(2, 4).join(' / ') : ''));
});
section('存储满了', () => {
  const big = []; for (let i = 0; i < 39990; i++) big.push([i % 50, 'd', i % 3, i % 9, (i * 7) % 9, 'L4a', i % 2, 1, 0]);
  const E = boot({ seed: 53, storageLimit: 1024 * 1024, store: { luoshu_save_v1: OLD(), jgx_ev1: JSON.stringify(big).slice(0, 1024 * 1024 - 10).replace(/,\[[^\]]*$/, ']') } }), { G, run } = E;
  const before = E.store.jgx_ev1.length;
  enter(E, 11); for (let n = 0; n < 30 && !G.g.over; n++) playStep(E, 1);
  for (let i = 0; i < 3000; i++) G.T.rec('d', 1, 2, 3, 'L4a', 0, 1, 0);
  G.T.flush();
  const after = JSON.parse(E.store.jgx_ev1);
  ok(E.store.jgx_ev1.length <= 1024 * 1024 && after[after.length - 1][1] === 'd' && after.length > 20000, '试玩记录快到微信的 1 MB 上限：丢掉最早的一截，新的照样存得进去（原来 ' + Math.round(before / 1024) + ' KB，现在 ' + Math.round(E.store.jgx_ev1.length / 1024) + ' KB、' + after.length + ' 条）');
  const E2 = boot({ seed: 54, store: { luoshu_save_v1: OLD(), jgx_ev1: '{"坏的":1}' } }); E2.run(30);
  ok(E2.G.mode === 'home' && E2.G.T.count() >= 1, '试玩记录读出来不是一串记录：从空的开始，照常开机');
});
section('复制试玩记录', () => {
  const zlib = require('zlib'), D = require('./decode_log.js'), Z = require(path.join(ROOT, 'js/deflate.js'));
  // 自己写的压缩：和标准的 deflate 对得上（zlib 解得开、一字不差）
  let seed = 7, bad = 0, n = 0; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cases = ['', 'a', 'ab', 'abc', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'.repeat(40), '九宫消试玩记录😀「」'.repeat(200)];
  for (let t = 0; t < 120; t++) { const len = Math.floor(rnd() * 2500); let x = ''; for (let i = 0; i < len; i++) x += t % 3 === 0 ? String.fromCharCode(32 + Math.floor(rnd() * 95)) : t % 3 === 1 ? 'abc,[]"0123'[Math.floor(rnd() * 11)] : String.fromCharCode(0x4e00 + Math.floor(rnd() * 400)); cases.push(x); }
  cases.forEach((x) => { n++; const z = Z.pack(x); if (z === null || zlib.inflateRawSync(Buffer.from(z, 'base64')).toString('utf8') !== x) bad++; });
  ok(bad === 0, '微信里用的压缩（js/deflate.js）：' + n + ' 段各种字，标准 zlib 都解得开、一字不差');
  // 真在微信环境里打几关再点「复制试玩记录」
  const E = boot({ seed: 55 }), { G, run, touch, tap, btn } = E;
  for (let steps = 0; G.save.petStage < 4 && steps < 4000; steps++) {
    const m = G.mode;
    if (m === 'cut') { touch('down', 195, 420); run(2); touch('up', 195, 420); } else if (m === 'intro') { run(10); tap(btn('introOk')); } else if (m === 'start') { run(10); tap(btn('startGo')); }
    else if (m === 'map') tap(btn('play')); else if (m === 'camp') tap(btn('campPlay')); else if (m === 'over') { run(80); tap(G.result.won ? btn('tocamp') : btn('again')); run(20); }
    else if (m === 'play') { if (G.g.over) run(20); else if (!playStep(E, 1)) run(30); } else run(5);
  }
  for (let k = 0; k < 20 && G.mode !== 'over'; k++) run(10);
  const b = btn('overCopyLog') || (G.mode = 'settings', run(3), btn('setCopyLog'));
  tap(b); run(3);
  const txt = E.env.clip || '', rawLen = JSON.stringify({ game: '九宫消', fmt: 1, ver: '0.9.14', log: G.save.playLog, ev: G.T._all() }).length;
  let d = null; try { d = D.decode(txt); } catch (e) { /* 解不开 */ }
  ok(txt.slice(0, 5) === 'JGX1:' && d && d.log.length === G.save.playLog.length && d.events.length >= G.T.count() - 4, '微信里点「复制试玩记录」：拷出来是压过的（' + txt.length + ' 字，原样要 ' + rawLen + ' 字），解码工具解得开，' + (d ? d.log.length + ' 局、' + d.events.length + ' 条都在' : '解不开'));
  ok(txt.length < rawLen * 0.45, '压到原来的四成半以下（' + Math.round((txt.length / rawLen) * 100) + '%）');
});
section('开机出错不黑屏', () => {
  // 新玩家开机第一件事是放第一章的过场。画过场要新开画布：让它开不出来（老机型内存紧的时候会这样）
  const E = boot({ seed: 56, canvasLimit: 4 }), { G, run, btn, tap, touch } = E;
  run(30);
  ok(G.mode === 'home' && !!btn('homePlay') && E.events().some((e) => e[1] === 'X' && e[2] === 'init'), '开机那一步出错：不黑屏，退到主菜单，记了一笔（现在在 ' + G.mode + '）');
  tap(btn('homePlay')); run(10); tap(btn('play')); run(60);
  for (let n = 0; n < 30 && G.mode !== 'play'; n++) { if (G.mode === 'cut') { touch('down', 100, 300); run(1); touch('up', 100, 300); } run(5); }
  ok(G.mode === 'play', '点「开始」「继续」照样进得了第 1 关（过场放不出来就跳过）');
  const t = G.tutorialTarget(); if (t) { dragTo(E, 0, t.r, t.c); run(30); }
  ok(G.g.moves === 1, '进去以后放得了块');
});
section('老存档', () => {
  // 0.9.17 起：没有 ch1new 的老存档（0.9.16 以前）开机清回第 1 关，宠物、丹清掉，试玩记录、看过的过场留着（main.js fixSave）。铜雀是第 2 关送的
  // reset: true = 这份存档开机后应该被清回第 1 关
  const OLD_LOG = [{ lv: 3, won: 1, moves: 20, sec: 60, ver: '0.9.13' }, { lv: 4, won: 0, moves: 25, sec: 80, ver: '0.9.13' }];
  const cases = {
    '现在这一版：打到第 12 关、铜雀和爆竹鼠': { save: OLD() },
    '0.9.13 打到第 12 关、4 只宠物（没有 ch1new）': { reset: true, keepLog: OLD_LOG.length, save: JSON.stringify({ petTutDone: true, tutorialDone: true, petStage: 12, pets: { tongque: { lv: 4, exp: 1 }, baozhu: { lv: 2, exp: 1 }, modou: { lv: 1, exp: 1 }, qilin: { lv: 1, exp: 0 } }, petOrder: ['tongque', 'baozhu', 'modou', 'qilin'], activePet: 'tongque', dan: 5, introSeen: SEEN, cutSeen: { chapter0: true, chapter1: true }, playLog: OLD_LOG }) },
    '0.9.8 刚拿到铜雀、没选过出战': { reset: true, save: JSON.stringify({ petTutDone: true, tutorialDone: true, petStage: 1, pets: { tongque: { lv: 1, exp: 0 } }, petOrder: ['tongque'], gourd: 3, dan: 1, introSeen: {}, cutSeen: { chapter0: true } }) },
    '更老的：过了 5 关、一只宠物都没有': { reset: true, save: JSON.stringify({ petTutDone: true, tutorialDone: true, petStage: 5, pets: {}, petOrder: [], introSeen: { monster: true } }) },
    // 下面三份是新版存档（有 ch1new，不清档）里写坏的字段：fixSave 要把它们理顺
    '出战的那只已经进化掉了、顺序表里还是旧名字': { save: JSON.stringify({ ch1new: 1, petTutDone: true, petStage: 15, pets: { jinchique: { lv: 5, exp: 0 }, baozhu: { lv: 2, exp: 0 } }, petOrder: ['tongque', 'baozhu'], activePet: 'tongque', lastFed: 'tongque', freshPet: { tongque: true }, introSeen: SEEN }) },
    '经验比这一级要的还多、等级超了、丹是负数': { save: JSON.stringify({ ch1new: 1, petTutDone: true, petStage: 8, pets: { tongque: { lv: 3, exp: 40 }, baozhu: { lv: 99, exp: -3 } }, petOrder: ['tongque', 'baozhu'], activePet: 'baozhu', dan: -2, introSeen: SEEN }) },
    '存档里有不认识的宠物、字段类型不对': { save: JSON.stringify({ ch1new: 1, petTutDone: true, petStage: '7', pets: { tongque: { lv: '2', exp: null }, laohu: { lv: 3, exp: 1 }, modou: null }, petOrder: ['laohu', 'tongque', 'tongque', 'modou'], activePet: 'laohu', loss: [1, 2], playLog: { a: 1 }, introSeen: null, cutSeen: null, freshPet: 3 }) },
    '全打完了（20 关）': { save: OLD({ petStage: 20, pets: { jinchique: { lv: 7, exp: 2 }, baozhuwang: { lv: 5, exp: 0 } }, petOrder: ['jinchique', 'baozhuwang'], activePet: 'jinchique' }) },
    '关数比现在的还多': { save: OLD({ petStage: 47 }) },
    '存档不是 JSON': { reset: true, save: '这不是存档' },
    '连输过很多次、带着 400 局记录': { save: OLD({ loss: { 12: 9, 3: 2 }, playLog: Array.from({ length: 400 }, (_, i) => ({ lv: i % 12 + 1, won: 1, moves: 30, sec: 100, ver: '0.9.10' })) }) },
  };
  for (const name of Object.keys(cases)) {
    let E, note = '';
    const cs = cases[name];
    try {
      E = boot({ seed: 60, store: { luoshu_save_v1: cs.save } }); const { G, run, btn, tap, touch } = E;
      run(20);
      if (G.save.ch1new !== 1) throw new Error('开机以后存档上没有 ch1new');
      if (cs.reset) {
        if (G.save.petStage !== 0 || Object.keys(G.save.pets).length || G.save.petOrder.length) throw new Error('老存档没清回第 1 关：进度 ' + G.save.petStage + '，宠物 ' + Object.keys(G.save.pets).join(','));
        if (cs.keepLog && (G.save.playLog || []).length !== cs.keepLog) throw new Error('清档时把试玩记录也清了');
        note = '清回第 1 关、宠物清空；';
      } else if (G.save.petStage === 0) throw new Error('新版存档被当成老存档清了');
      const NL = G.PLV.length;
      for (let n = 0; n < 60 && G.mode === 'cut'; n++) { touch('down', 100, 300); run(1); touch('up', 100, 300); run(2); }
      const fresh = !G.save.petTutDone;
      if (!fresh) {
        if (G.mode !== 'home') throw new Error('开机没到主菜单：' + G.mode);
        tap(btn('homePlay')); run(10); if (G.mode !== 'map') throw new Error('点「继续」没到地图');
        G.openCamp(); run(20); const first = G.save.petOrder[0]; if (first) { tap(btn('gpet_' + first)); run(10); if (btn('feedG')) tap(btn('feedG')); run(40); }
        for (let n = 0; n < 900 && btn('evoTap') === undefined && G.save.pets[first] === undefined && first; n++) run(1); // 喂到 5 级会当场进化：等动画能点
        for (let n = 0; n < 3 && btn('evoTap'); n++) { tap(btn('evoTap')); run(5); }
        tap(btn('campPlay')); run(10); if (G.mode !== 'map') throw new Error('宠物园「出发」没回地图');
        if (G.save.petStage < NL) { tap(btn('play')); run(20); }
      }
      for (let n = 0; n < 40 && G.mode !== 'play' && G.save.petStage < NL; n++) { if (G.mode === 'cut') { touch('down', 100, 300); run(1); touch('up', 100, 300); } else if (G.mode === 'start') tap(btn('startGo')); else if (G.mode === 'intro') tap(btn('introOk')); run(8); }
      if (G.save.petStage < NL) { if (G.mode !== 'play') throw new Error('进不了关：停在 ' + G.mode); for (let n = 0; n < 12 && !G.g.over; n++) playStep(E, 1); if (G.g.moves < 1) throw new Error('进了关放不了块'); const st = G.PLV[G.petIdx]; if (('rock' in st.goal || st.only) && !G.g.team.length) throw new Error('要宠物的关没有宠物'); }
      if (btn('snap')) { tap(btn('snap')); run(3); }
      const bad = G.save.petOrder.filter((id) => !G.save.pets[id] || !G.PG.PETS[id]);
      if (bad.length || (G.save.petOrder.length && !G.save.pets[G.save.activePet])) throw new Error('存档里宠物还是对不上：' + bad.join(','));
      if (G.save.petStage >= 2 && !G.save.pets.tongque && !G.save.pets.jinchique) throw new Error('过了第 2 关（送铜雀的那关）却没有铜雀');
      if (G.save.petStage >= 10 && !G.save.pets.baozhu && !G.save.pets.baozhuwang) throw new Error('过了第 10 关（送爆竹鼠的那关）却没有爆竹鼠');
      Object.keys(G.save.pets).forEach((id) => { if (!(G.danToLevel(id) >= 1)) throw new Error(id + ' 升一级要 ' + G.danToLevel(id) + ' 颗丹'); });
      if (E.errs().length) throw new Error('出错记账：' + E.errs()[0].slice(2, 5).join(' / '));
      note += '第 ' + (G.petIdx + 1) + ' 关，宠物 ' + (G.save.petOrder.join('、') || '无');
    } catch (e) { ok(false, '老存档「' + name + '」：' + (e && e.message)); continue; }
    ok(true, '老存档「' + name + '」：开机、主菜单、地图、宠物园、进关放块都不出错（' + note + '）');
  }
});

console.log(`\n${pass} 项通过，${fail} 项没过`);
process.exit(fail ? 1 : 0);
