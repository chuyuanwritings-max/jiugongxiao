// 段 3 规则 11「中途退出接着打」（段 3 细设计第五节 T360–T366，T317）。用法：node test/rules_resume.js [每关几局，默认 4；--full = 12]
// 规则层：打到第 K 手存盘 → 过一遍文字（JSON）→ 新开一局恢复 → 两边照同一个机器人打到底，每一手都要一样。
// 下半截是进游戏那一半（模拟微信开机，test/wx-env.js）：main.js 每手写 luoshu_run_v1、关掉再开机接着打、版本 / 关卡表指纹对不上丢掉、试玩记录「恢复」（T362、T366）
const { PG, core, ok, t, done } = require('./rules_lib.js');
const PLV = require('../js/petlevels.js');
const N = process.argv.includes('--full') ? 12 : +process.argv.find((a) => /^\d+$/.test(a)) || 4;
const PETS = ['tongque', 'huli', 'baozhu', 'modou', 'lvgui'];
const evoId = (id, lv) => (lv >= PG.ULT_LV ? PG.PETS[PG.PETS[id].evo].evo : lv >= PG.EVO_LV ? PG.PETS[id].evo : id);
// 机器人走一步（和量数脚本同一个打法）
const step = (g) => { if (PG.useSkillIfGood(g)) return true; const m = PG.bestMove(g, 1); if (!m) { if (g.hand[3]) { const s = PG.skillBest(g); if (s && g.useSkill(s)) return true; } return false; } g.place(m.i, m.r, m.c); return true; };
const fp = (g) => JSON.stringify([g.board, g.color, g.hand.map((p) => (p ? [p.id, p.cells, p.mud, p.gnawed, p.uses, p.mudded] : 0)), g.team.map((x) => x.energy), g.moves, core.goalLeft(g), g.over, g.won, g.mon.map((m) => (m ? [m.t, m.cd, m.walk, m.step, m.tied] : 0)), g.boss && [g.boss.hits, g.boss.jumpTo, g.boss.mudCd, g.bigHp, g.bigCells], g.waveNo, g.crumb]);

t('T360', () => {
  let same = 0, diff = 0, n = 0; const bad = [];
  PLV.forEach((st, li) => {
    if (st.rush) return;
    for (let k = 0; k < N; k++) {
      const pet = li < 2 ? null : PETS[k % 5], lv = [1, 3, 5, 7, 10][(k + li) % 5];
      const opts = { stage: st, team: pet ? [{ id: evoId(pet, lv), lv }] : [], seed: 4000 + li * 31 + k * 7 };
      const a = PG.createPetGame(opts); a.openingAct();
      const K = 1 + ((li * 7 + k * 5) % 23); let guard = 0;
      while (!a.over && a.moves < K && guard++ < 200) if (!step(a)) break;
      if (a.over) continue;
      n++;
      const b = PG.restorePetGame(opts, JSON.parse(JSON.stringify(a.snapshot())));
      let ok1 = !!b && fp(a) === fp(b), g2 = 0;
      while (ok1 && !a.over && g2++ < 400) { const x = step(a), y = step(b); ok1 = x === y && fp(a) === fp(b); if (!x) break; }
      if (ok1 && a.over === b.over && a.won === b.won && a.moves === b.moves) same++; else { diff++; bad.push('第' + (li + 1) + '关 ' + (pet || '-') + lv + ' 第' + K + '手'); }
    }
  });
  ok(n >= 18 && !diff, 'T360 ' + n + ' 局「存 → 关掉 → 恢复 → 接着打」：每一手的盘面、颜色、手牌、墨怪、头目、表盘、手数、输赢都一样（' + same + ' 局一样，' + diff + ' 局不一样' + (bad.length ? '：' + bad.slice(0, 5).join('、') : '') + '）');
});
t('T361', () => {
  let maxLen = 0, allStr = true;
  PLV.forEach((st, li) => {
    if (st.rush) return;
    const g = PG.createPetGame({ stage: st, team: li < 2 ? [] : [{ id: 'baozhu', lv: 3 }], seed: 90 + li }); g.openingAct();
    for (let k = 0; k < 12 && !g.over; k++) step(g);
    const s = JSON.stringify(g.snapshot()); if (typeof s !== 'string' || JSON.stringify(JSON.parse(s)) !== s) allStr = false; maxLen = Math.max(maxLen, s.length);
  });
  ok(allStr && maxLen < 4000, 'T361 存盘是纯文字（存进手机再读出来一个字不差），最大一份 ' + maxLen + ' 字节（线 < 4000）');
});
t('T363', () => {
  const st = PLV.find((x) => !x.rush && x.waves), opts = { stage: st, team: [{ id: 'tongque', lv: 2 }], seed: 5 };
  const g = PG.createPetGame(opts); step(g); step(g);
  const good = g.snapshot(), cases = { 缺盘面: Object.assign({}, good, { board: undefined }), 缺随机数: Object.assign({}, good, { rng: undefined }), 版本不对: Object.assign({}, good, { v: 99 }), 盘面尺寸不对: Object.assign({}, good, { board: good.board.slice(0, 40) }), 不是对象: 'abc', 空: null };
  delete cases.缺盘面.board;
  const res = Object.entries(cases).map(([k, s]) => { let r, threw = false; try { r = PG.restorePetGame(opts, s); } catch (e) { threw = true; } return [k, r === null && !threw]; });
  ok(res.every((x) => x[1]), 'T363 存盘缺字段、版本记号不对、盘面不对、不是对象：恢复返回 null、不报错（' + res.map((x) => x[0] + (x[1] ? '✓' : '✗')).join(' ') + '）');
  ok(!!PG.restorePetGame(opts, good), 'T363 好的那份照常恢复');
});
t('T364', () => {
  const rush = PLV.filter((x) => x.rush);
  const g = PG.createPetGame({ stage: rush[0], team: [{ id: 'tongque', lv: 1 }], seed: 3 });
  ok(rush.length === 2 && g.snapshot() === null && PG.restorePetGame({ stage: rush[0], team: [], seed: 3 }, { v: PG.SNAP_VER, rng: 1, board: [], hand: [], team: [], mon: [], moves: 0, got: {}, waveQ: [] }) === null, 'T364 冲锋关不出存盘，也不从存盘恢复');
});
t('T365', () => {
  // 同一份存盘恢复两次，各放同一块：后面发的三块一样（随机数的位置也存了，换不了牌）
  let checked = 0, same = 0;
  for (let s = 0; s < 6; s++) {
    const st = PLV[2 + s], opts = { stage: st, team: [{ id: 'tongque', lv: 2 }], seed: 300 + s };
    if (st.rush) continue;
    const g = PG.createPetGame(opts); g.openingAct(); for (let k = 0; k < 4 && !g.over; k++) step(g);
    if (g.over) continue;
    const snap = JSON.stringify(g.snapshot()), a = PG.restorePetGame(opts, JSON.parse(snap)), b = PG.restorePetGame(opts, JSON.parse(snap));
    // 一直放到发新牌为止（三块放完），两边比手上新发的三块和盘面
    let guard = 0, d0 = a.deals; while (!a.over && a.deals === d0 && guard++ < 10) { const m = PG.bestMove(a, 1); if (!m) break; a.place(m.i, m.r, m.c); b.place(m.i, m.r, m.c); g.place(m.i, m.r, m.c); }
    if (a.deals === d0) continue; checked++;
    if (JSON.stringify(a.hand) === JSON.stringify(b.hand) && JSON.stringify(a.board) === JSON.stringify(b.board) && JSON.stringify(a.hand) === JSON.stringify(g.hand)) same++;
  }
  ok(checked >= 3 && same === checked, 'T365 同一份存盘恢复两次、放一样的块：新发的三块一样，也和没退出的那一局一样（比了 ' + checked + ' 局，一样 ' + same + ' 局）');
});
t('T317', () => {
  const st = PLV.find((x) => x.firstAct) || { goal: { monster: 2 }, crawl: 3, colors: [3], firstAct: { kind: 'crawl', from: [1, 2], to: [2, 2] }, board: ['.........', '##m###.##', '.........', '.........', '....m....', '.........', '.........', '.........', '.........'] };
  const opts = { stage: st, team: [{ id: 'tongque', lv: 2 }], seed: 9 }, g = PG.createPetGame(opts); g.openingAct(); step(g);
  const b = PG.restorePetGame(opts, JSON.parse(JSON.stringify(g.snapshot()))), before = fp(b);
  ok(b._opened === true && b.openingAct() === null && fp(b) === before, 'T317 开局先演完、存盘再恢复：不会再演一次');
});
// ---------- 进游戏：存 → 关掉 → 开机 → 接着打 ----------
const { boot, playStep } = require('./wx-env.js');
const RUN = 'luoshu_run_v1';
const SAVE = (o) => JSON.stringify(Object.assign({ ch1new: 1, econ: 2, petTutDone: true, tutorialDone: true, petStage: 12, pets: { tongque: { lv: 3, exp: 0 }, huli: { lv: 2, exp: 0 }, baozhu: { lv: 1, exp: 1 } }, petOrder: ['tongque', 'huli', 'baozhu'], activePet: 'tongque', petSeen: { tongque: true, huli: true, baozhu: true }, introSeen: { pet: 1, catch: 1, crawl: 1, metal: 1, rush: 1, moss: 1, boss: 1, dirt: 1, sticky: 1, boss2: 1 }, cutSeen: { chapter0: true, chapter1: true } }, o || {}));
const enterPlay = (E, i, help) => { const { G, run } = E; if (help) G.newPetLevel(i, false, 3, help); else G.newPetLevel(i); run(3); for (let n = 0; n < 20 && G.mode !== 'play'; n++) { if (G.mode === 'start') E.tap(E.btn('startGo')); else if (G.mode === 'intro') E.tap(E.btn('introOk')); else G.skipCuts(); run(3); } run(40); };
const fpG = (g) => JSON.stringify([g.board, g.hand.map((p) => (p ? p.id : 0)), g.mon.map((m) => (m ? m.t : 0)), g.moves, g.team.map((x) => x.energy), g.boss && g.bigHp]);
t('T362', () => {
  // 打两手 → 关掉（拿存储另开一局）→ 开机 → 主页「继续」直接回到那一盘
  const E = boot({ seed: 21, store: { luoshu_save_v1: SAVE() } }); enterPlay(E, 11);
  for (let k = 0; k < 3; k++) playStep(E, 1);
  const g = E.G.g, before = fpG(g), moves = g.moves; E.tap(E.btn('map')); E.run(10); // 打到一半点「‹ 地图」退出（记一行中途退出，存盘留着）
  const store = Object.assign({}, E.store); E.restore();
  const rec = JSON.parse(store[RUN]);
  ok(rec && rec.idx === 11 && rec.snap.moves === moves && typeof store[RUN] === 'string' && store[RUN].length < 6000, 'T362 每放一块存一份：luoshu_run_v1 是文字，记着第 12 关、放了 ' + rec.snap.moves + ' 手（' + store[RUN].length + ' 字节）');
  const E2 = boot({ seed: 22, store }), G2 = E2.G; E2.run(10);
  ok(G2.mode === 'home', '（前提）开机先到主页');
  E2.tap(E2.btn('homePlay')); E2.run(10);
  ok(G2.mode === 'play' && G2.petIdx === 11 && fpG(G2.g) === before && G2.g._resumes === 1, 'T362 主页「继续」：直接回到那一盘（不弹关牌、说明卡），盘面、手牌、墨怪、表盘、手数一样');
  playStep(E2, 1); E2.run(10);
  ok(G2.g.moves === moves + 1 && !E2.errs().length, 'T362 接着放得下一块（' + G2.g.moves + ' 手），没有出错记账' + (E2.errs().length ? '：' + JSON.stringify(E2.errs()[0]).slice(0, 160) : ''));
  // 接着打赢：手数、救命、借宠都接着算——用过一次救命，标准手数内赢 → 2 个槽
  G2.g.revive(); playStep(E2, 1); E2.run(5);
  const store2 = Object.assign({}, E2.store); E2.restore();
  const E3 = boot({ seed: 23, store: store2 }), G3 = E3.G; E3.run(5); G3.newPetLevel(11); E3.run(10);
  ok(G3.mode === 'play' && G3.g.revivesUsed >= 1, 'T362 从章页点这一关也是回到那一盘，用过的救命也带回来了');
  const g3 = G3.g; g3.over = true; g3.won = true; g3.reason = 'win'; G3.endGame(); E3.run(90);
  ok(G3.result && G3.result.won && G3.result.pay.slots === 2 && (!E3.store[RUN] || E3.store[RUN] === 'null'), 'T362 用过救命、标准手数内赢：2 个槽（' + (G3.result && G3.result.pay.slots) + '）；赢了存盘删掉');
  const log = G3.save.playLog[G3.save.playLog.length - 1];
  ok(log && log.resumed === 2 && E3.events().some((e) => e[1] === 'R'), 'T366 试玩记录：恢复的那一局多一个「恢复过几次」（' + (log && log.resumed) + '），事件里有一条「R」');
  ok(G3.save.playLog.filter((r) => r.lv === 12 && r.quit).length === 1, 'T366 中途按「‹ 地图」退出那一次照旧记一行「中途退出」');
  E3.restore();
  // 借来的：请帮手来打，存盘恢复后还是借的
  const E4 = boot({ seed: 24, store: { luoshu_save_v1: SAVE() } }); enterPlay(E4, 11, 'baozhu'); playStep(E4, 1); playStep(E4, 1);
  const st4 = Object.assign({}, E4.store), lent0 = E4.G.g.lent; E4.restore();
  const E5 = boot({ seed: 25, store: st4 }); E5.run(5); E5.tap(E5.btn('homePlay')); E5.run(10);
  const g5 = E5.G.g; g5.over = true; g5.won = true; g5.reason = 'win'; E5.G.endGame(); E5.run(90);
  ok(lent0 && g5.lent && E5.G.result.pay.slots === 2, 'T362 借来的小穿山甲打到一半退出、恢复后标准手数内赢：还是借的，2 个槽');
  E5.restore();
});
t('T363b', () => {
  const E = boot({ seed: 31, store: { luoshu_save_v1: SAVE() } }); enterPlay(E, 11); playStep(E, 1); playStep(E, 1);
  const store = Object.assign({}, E.store); E.restore();
  const bad = { 版本不对: (r) => { r.ver = '0.0.1'; }, 关卡表不对: (r) => { r.table = 'x'; }, 存盘坏了: (r) => { r.snap = { v: 1 }; }, 不是对象: () => 'abc' };
  const res = Object.entries(bad).map(([k, f]) => {
    const r = JSON.parse(store[RUN]), r2 = f(r), st = Object.assign({}, store, { [RUN]: JSON.stringify(r2 === undefined ? r : r2) });
    const E2 = boot({ seed: 32, store: st }); E2.run(5); E2.tap(E2.btn('homePlay')); E2.run(10);
    const went = E2.G.mode === 'map' && !E2.errs().length; E2.G.newPetLevel(11); E2.run(5);
    const fresh = E2.G.mode === 'start' && E2.G.g.moves === 0; E2.restore(); return [k, went && fresh];
  });
  ok(res.every((x) => x[1]), 'T363 版本号、关卡表指纹对不上、存盘坏了：丢掉，从关牌重新开始，不报错（' + res.map((x) => x[0] + (x[1] ? '✓' : '✗')).join(' ') + '）');
});
t('T364b', () => {
  const E = boot({ seed: 41, store: { luoshu_save_v1: SAVE() } }); enterPlay(E, 6); for (let k = 0; k < 3; k++) playStep(E, 1);
  ok(E.G.g.rush && E.G.g.moves >= 1 && !(E.store[RUN] && E.store[RUN] !== 'null'), 'T364 冲锋关放了几块：不出存盘（退出就作废，不算输）');
  E.restore();
  // 输了停在结算页时退出：回来还是那一页；点「再试一次」= 放弃这一盘
  const E2 = boot({ seed: 42, store: { luoshu_save_v1: SAVE() } }); enterPlay(E2, 12); playStep(E2, 1);
  // 造一个堵死：盘面摆成棋盘格（哪一排都不满、哪儿都放不下 3×3），手上一块 1 格、两块 3×3；宠物拿掉（不然会来救命）
  const g = E2.G.g; g.hand = [E2.G.core.PIECES['1'], E2.G.core.PIECES.sq3, E2.G.core.PIECES.sq3, null]; for (let k = 0; k < 81; k++) { g.mon[k] = null; g.board[k] = (Math.floor(k / 9) + k % 9) % 2 ? 0 : 1; g.color[k] = 3; } g.waveQ = []; g.team = []; const k0 = g.board.findIndex((v) => !v); const from = E2.G.slotCenter(0), to = E2.G.fingerFor(g.hand[0], Math.floor(k0 / 9), k0 % 9); E2.touch('down', from.x, from.y); E2.run(2); E2.touch('move', to.x, to.y); E2.run(2); E2.touch('up', to.x, to.y); E2.run(120);
  const lost = E2.G.mode === 'over' && !E2.G.result.won, st2 = Object.assign({}, E2.store), loss0 = E2.G.save.loss[12]; E2.restore();
  const E3 = boot({ seed: 43, store: st2 }); E3.run(5); E3.G.newPetLevel(12); E3.run(40);
  const back = E3.G.mode === 'over' && E3.G.result && !E3.G.result.won && E3.G.save.loss[12] === loss0;
  E3.tap(E3.btn('again')); E3.run(10);
  ok(lost && back && E3.G.g.moves === 0 && !(E3.store[RUN] && E3.store[RUN] !== 'null'), 'T364 堵死了停在「救命还是放弃」那一页时退出：回来还是那一页（连输次数不再加）；点「再试一次」存盘删掉、从头开（lost ' + lost + ' back ' + back + '）');
  E3.restore();
});

done();
