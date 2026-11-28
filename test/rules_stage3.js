// 段 3「关卡」规则测试（../九宫捉妖_段3关卡细设计_Fable_20261128.md 第五节）：不开画面，直接调规则层。用法：node test/rules_stage3.js
// 这一份管：关卡表（T301–T308）、开局先演一次（T310–T316、T307）、第 3 关卡口（T320、T321）；后面几步再往里加流程、请帮手的测试。存盘恢复在 test/rules_resume.js
const { PG, core, CELL, ok, t, done, K } = require('./rules_lib.js');
const PLV = require('../js/petlevels.js');
const E = '.........';
// 「开局先演」的 7 关（第 1 步先用附录 B 的盘面自己摆，第 5 步换了关卡表以后直接读关卡表）
const ACT = [4, 8, 10, 12, 13, 17, 20];
const stageOf = (n) => PLV[n - 1];
const game = (n, o) => PG.createPetGame(Object.assign({ stage: stageOf(n), team: [{ id: 'tongque', lv: 2 }], seed: 7 }, o || {}));
const fp = (g) => JSON.stringify([g.board, g.color, g.hand, g.mon, g.boss, g.bigCells, g.moves, g.team]);

// ---------- 开局先演一次（规则 4）----------
t('T310', () => {
  const g = game(4), ev = g.openingAct();
  ok(ev && ev.opening === 'crawl' && g.board[K(1, 2)] === CELL.EMPTY && g.board[K(2, 2)] === CELL.MON && g.mon[K(2, 2)] && g.mon[K(2, 2)].t === 'ink' && !g.mon[K(1, 2)], 'T310 第 4 关开局先演：第 2 排第 3 列那只爬到第 3 排第 3 列（ev.crawl ' + JSON.stringify(ev && ev.crawl) + '）');
  ok(g.moves === 0, 'T310 演完手数还是 0');
  const before = fp(g), ev2 = g.openingAct();
  ok(ev2 === null && fp(g) === before, 'T310 再调一次：什么都不变（返回 null）');
});
t('T311', () => {
  const g = game(13), ev = g.openingAct();
  ok(g.board[K(2, 2)] === CELL.MON && g.mon[K(2, 2)].t === 'moss' && g.board[K(1, 2)] === CELL.BLOCK && g.color[K(1, 2)] === -2 && ev.moss && ev.moss.length === 1, 'T311 第 13 关：墨苔怪到了第 3 排第 3 列，原地是一块墨（颜色 -2）');
  ok(g.monStats.moss === 0 && !g.monStats.crawls, 'T311 开局这一下不算进「墨苔怪留了几次墨」（monStats.moss = ' + g.monStats.moss + '）');
});
t('T312', () => {
  let good = 0, tried = 0;
  for (let s = 1; s <= 20; s++) {
    const g = game(17, { seed: s }), sizes0 = g.hand.slice(0, 3).map((p) => p.cells.length), ev = g.openingAct();
    if (!ev.mudSpit) continue; tried++;
    const slot = ev.mudSpit[0].slot, p = g.hand[slot], m = g.mon[K(3, 6)];
    const others = [0, 1, 2].filter((j) => j !== slot).every((j) => !g.hand[j].mudded);
    if (p.mudded && p.cells.length === sizes0[slot] + 1 && others && m && m.t === 'sticky' && m.cd === PG.MON.sticky.cd) good++;
  }
  ok(tried >= 18 && good === tried, 'T312 第 17 关 20 个种子：手上正好一块多了一格、记着沾过泥，那只粘墨怪的倒数回到 4（吐成 ' + tried + ' 局，对的 ' + good + ' 局）');
});
t('T313', () => {
  let good = 0, tried = 0;
  for (let s = 1; s <= 20; s++) {
    const g = game(20, { seed: s }), sizes0 = g.hand.slice(0, 3).map((p) => p.cells.length), ev = g.openingAct();
    if (!ev.mudSpit) continue; tried++;
    const slot = ev.mudSpit[0].slot;
    if (g.hand[slot].mudded && g.hand[slot].cells.length === sizes0[slot] + 1 && g.boss.mudCd === 3 && [0, 1, 2].filter((j) => g.hand[j].mudded).length === 1) good++;
  }
  ok(tried >= 18 && good === tried, 'T313 第 20 关：手上正好一块多了一格，泥沼怪的倒数回到 3（吐成 ' + tried + ' 局，对的 ' + good + ' 局）');
});
t('T314', () => {
  const g = game(10), b0 = g.board.slice(), ev = g.openingAct(), want = [K(4, 3), K(4, 4), K(5, 3), K(5, 4)];
  const ring = [K(3, 2), K(3, 3), K(3, 4), K(4, 2), K(4, 5), K(5, 2), K(5, 5), K(6, 3), K(6, 4)];
  ok(JSON.stringify(g.bigCells) === JSON.stringify(want) && want.every((k) => g.board[k] === CELL.BOSS), 'T314 第 10 关：头目的 4 格在盘中间');
  ok([K(0, 0), K(0, 1), K(1, 0), K(1, 1)].every((k) => g.board[k] === CELL.EMPTY), 'T314 原来左上角 4 格空了');
  ok(ring.every((k) => b0[k] === CELL.BLOCK && g.board[k] === CELL.EMPTY) && ev.bossJump && ev.bossJump.crushed.length === 9, 'T314 周围一圈 9 块旧块没了（踩碎 ' + (ev.bossJump && ev.bossJump.crushed.length) + ' 块）');
  ok(g.board[K(2, 7)] === CELL.METAL && g.board[K(8, 0)] === CELL.METAL, 'T314 两块金属还在');
  ok(g.caught === 0 && g.boss.hp === 9 && g.boss.jumpTo === null, 'T314 这一跳不算抓、不掉心、不留下一跳');
});
t('T315', () => {
  for (const n of [8, 12]) {
    const g = game(n), ev = g.openingAct(), at = n === 8 ? CELL.METAL : CELL.DIRT;
    ok(ev.opening === 'blocked' && ev.blockedFull.length === 1 && ev.blockedFull[0].u === 19 && JSON.stringify(ev.blockedFull[0].at) === JSON.stringify([K(2, 5)]) && g.board[K(2, 5)] === at, 'T315 第 ' + n + ' 关：报出「摆满被堵」——上面中间的大格，堵着的是它右下角那格（' + JSON.stringify(ev.blockedFull) + '）');
  }
});
t('T316', () => {
  const bad = [];
  for (const n of ACT) for (const id of ['tongque', 'huli', 'baozhu', 'modou', 'lvgui']) {
    const g = game(n, { team: [{ id, lv: 3 }] }), e0 = g.team.map((p) => p.energy).join(','), ev = g.openingAct();
    if (!ev || g.moves !== 0 || g.team.map((p) => p.energy).join(',') !== e0 || g.hand[3] || g.over || ev.petActs.length || Object.keys(ev.energy).length) bad.push(n + '/' + id);
  }
  ok(!bad.length, 'T316 7 关 × 五只各演一次：手数 0、表盘没变、宠物格没多出技能块、没判输（不对的：' + (bad.join('、') || '没有') + '）');
  // 没有 firstAct 的关：什么都不做
  const g = PG.createPetGame({ stage: { goal: { monster: 1 }, colors: [3], board: [E, '...m.....', E, E, E, E, E, E, E] }, team: [], seed: 3 }), b = fp(g);
  ok(g.openingAct() === null && fp(g) === b, 'T316 没写「开局先演」的关：调了什么都不变');
});
t('T307a', () => {
  // 演完以后手上三块一定还放得下（第 307 条的后一半；前一半等换关卡表以后查全部 20 关）
  const bad = [];
  for (const n of ACT) for (let s = 1; s <= 50; s++) { const g = game(n, { seed: s }); g.openingAct(); if (!core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean))) bad.push(n + '/' + s); }
  ok(!bad.length, 'T307 7 关 × 50 个种子：开局先演完，手上三块都有一种顺序放得下（放不下的：' + (bad.slice(0, 6).join('、') || '没有') + '）');
});
t('T316b', () => {
  // simulate()（机器人、量数都走它）开局调一次
  const g = PG.simulate({ stage: stageOf(4), team: [], seed: 5, skill: 1 });
  ok(g._opened === true, 'T316 机器人的 simulate() 开局先演了一次');
});

// ---------- 关卡表（第五节「关卡表」）----------
const BASE = ['tongque', 'huli', 'baozhu', 'modou', 'lvgui'];
const ownedAt = (li) => PLV.slice(0, li).map((st) => st.gift).filter(Boolean); // 进第 li 关（0 起）时已经有哪几只
const fs = require('fs'), path = require('path');
t('T301', () => {
  const gifts = PLV.map((st, i) => (st.gift ? (i + 1) + ':' + st.gift : null)).filter(Boolean).join(' ');
  ok(gifts === '2:tongque 5:huli 10:baozhu 13:modou 17:lvgui', 'T301 第 2、5、10、13、17 关依次送小铜雀、一尾狐、小穿山甲、蚕宝宝、小龟，别的关不送（' + gifts + '）');
  ok(ownedAt(PLV.length).sort().join() === BASE.slice().sort().join(), 'T301 20 关内五只到齐');
});
t('T302', () => {
  const tab = ['chapter1.js', 'chapter2.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8').replace(/\/\/.*$/gm, '')).join('\n');
  const js = fs.readdirSync(path.join(__dirname, '..', 'js')).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8').replace(/\/\/.*$/gm, '')]);
  const hit = js.filter(([, src]) => /\.only\b|\.lend\b|onlyPet|lendLv|\bforced\b/.test(src)).map(([f]) => f);
  ok(!/\bonly\s*:|\blend\s*:/.test(tab) && PLV.every((st) => !('only' in st) && !('lend' in st)), 'T302 关卡表里没有 only、lend 字段');
  ok(!hit.length, 'T302 js/ 里搜不到读 only、lend 的地方（点名、借一只高两级的、进关卡片的「被点名换人」）' + (hit.length ? '：' + hit.join('、') : ''));
});
t('T304', () => {
  const bad = [];
  PLV.forEach((st, i) => {
    const grids = [st.board].concat(st.waves || []);
    if (!grids.every((gr) => gr.length === 9 && gr.every((row) => row.length === 9 && /^[.#mGNZDK]+$/.test(row)))) bad.push((i + 1) + ' 字符或尺寸');
    if (st.goal.monster) { const n = grids.reduce((a, gr) => a + gr.join('').split('').filter((ch) => 'mGN'.includes(ch)).length, 0); if (n !== st.goal.monster) bad.push((i + 1) + ' 怪 ' + n + '≠' + st.goal.monster); }
    if (st.goal.boss) { const ks = []; st.board.forEach((row, r) => row.split('').forEach((ch, c) => { if (ch === 'K') ks.push(r * 9 + c); })); if (!(ks.length === 4 && ks[1] === ks[0] + 1 && ks[2] === ks[0] + 9 && ks[3] === ks[0] + 10)) bad.push((i + 1) + ' 头目不是 2×2'); }
  });
  ok(!bad.length, 'T304 每关盘面和每一波都是 9×9、只有认识的字符；盘上加各波的墨怪数 = 目标数；头目关正好 4 个 K、是 2×2（不对的：' + (bad.join('、') || '没有') + '）');
});
t('T305', () => {
  const first = (re) => PLV.findIndex((st) => [st.board].concat(st.waves || []).some((gr) => re.test(gr.join('')))) + 1;
  const f = { Z: first(/Z/), D: first(/D/), G: first(/G/), N: first(/N/) };
  ok(f.Z === 8 && f.D === 12 && f.G === 13 && f.N === 17, 'T305 新东西的排期：金属第 ' + f.Z + ' 关、土堆第 ' + f.D + ' 关、墨苔怪第 ' + f.G + ' 关、粘墨怪第 ' + f.N + ' 关第一次出现（线：8、12、13、17）');
  const firstCrawl = PLV.findIndex((st) => st.crawl) + 1, firstBoss = PLV.findIndex((st) => st.goal.boss) + 1, firstMudBoss = PLV.findIndex((st) => st.bossMud) + 1;
  const acts = PLV.map((st, i) => (st.firstAct ? [i + 1, st.firstAct.kind] : null)).filter(Boolean);
  const want = { 4: firstCrawl, 8: f.Z, 10: firstBoss, 12: f.D, 13: f.G, 17: f.N, 20: firstMudBoss };
  ok(acts.length === 7 && acts.every(([n]) => want[n] === n), 'T305 「开局先演」的 7 关（' + acts.map((a) => a.join(' ')).join('、') + '）演的那样东西都是这一关第一次出现');
});
// 规则 6 结构线：带这只宠物时开不了的障碍、被它们堵住的排列大格、死格
function structure(st, pet) {
  const b = []; st.board.forEach((row) => row.split('').forEach((ch) => b.push(ch)));
  const cant = (ch) => (ch === 'Z' && pet !== 'tongque') || (ch === 'D' && pet !== 'baozhu');
  const blocked = core.UNITS.map((u) => u.some((k) => cant(b[k])));
  let dead = 0; for (let k = 0; k < 81; k++) { if (cant(b[k]) || b[k] === 'K') continue; const r = Math.floor(k / 9), c = k % 9; if (blocked[r] && blocked[9 + c] && blocked[18 + core.boxOf(r, c)]) dead++; }
  return { obs: b.filter(cant).length, nBlocked: blocked.filter(Boolean).length, dead, cant };
}
t('T306', () => {
  const bad = []; let worst = [0, 0, 0];
  PLV.forEach((st, li) => {
    const owned = ownedAt(li);
    for (const pet of owned.length ? owned : [null]) {
      const s = structure(st, pet); worst = [Math.max(worst[0], s.obs), Math.max(worst[1], s.nBlocked), Math.max(worst[2], s.dead)];
      if (s.obs > 2 || s.nBlocked > 6 || s.dead > 4) bad.push((li + 1) + '/' + pet + ' ' + s.obs + '/' + s.nBlocked + '/' + s.dead);
      if (st.goal.boss && pet) {
        const g = PG.createPetGame({ stage: st, team: [{ id: pet, lv: 1 }], seed: 3 }); g.openingAct();
        const r = Math.floor(g.bigCells[0] / 9), c = g.bigCells[0] % 9, open = [r, r + 1, 9 + c, 10 + c].filter((u) => !core.UNITS[u].some((k) => (g.board[k] === CELL.METAL && pet !== 'tongque') || (g.board[k] === CELL.DIRT && pet !== 'baozhu'))).length;
        if (open < 2) bad.push((li + 1) + '/' + pet + ' 头目只有 ' + open + ' 条路');
      }
    }
  });
  ok(!bad.length, 'T306 每关 × 打到这关时已有的每只：开不了的障碍 ≤ 2、被堵的排列大格 ≤ 6、死格 ≤ 4，头目开局站的地方穿过它的 2 排 2 列至少 2 条没被堵（最多 ' + worst.join(' / ') + '；不对的：' + (bad.join('、') || '没有') + '）');
});
t('T307', () => {
  const bad = [];
  PLV.forEach((st, li) => {
    if (st.rush) return;
    const pet = ownedAt(li)[0];
    for (let s = 1; s <= 50; s++) {
      const g = PG.createPetGame({ stage: st, team: pet ? [{ id: pet, lv: 1 }] : [], seed: s * 13 + li, tutorial: li === 0 });
      if (!core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean))) { bad.push((li + 1) + '/' + s + ' 开局'); continue; }
      g.openingAct(); if (!core.solvable(g.board, g.hand.slice(0, 3).filter(Boolean))) bad.push((li + 1) + '/' + s + ' 演完');
    }
  });
  ok(!bad.length, 'T307 每关 50 个种子：开局手上三块（含写死的）不用技能都有一种顺序放得下，开局先演完也放得下（放不下的：' + (bad.slice(0, 6).join('、') || '没有') + '）');
});
t('T308', () => {
  const rows = [];
  for (const [n, pet] of [[3, 'tongque'], [8, 'tongque'], [12, 'baozhu']]) {
    const st = PLV[n - 1], other = pet === 'tongque' ? 'huli' : 'tongque';
    const a = PG.createPetGame({ stage: st, team: [{ id: pet, lv: 2 }], seed: 3 }), b = PG.createPetGame({ stage: st, team: [{ id: other, lv: 2 }], seed: 3 });
    const evo = PG.createPetGame({ stage: st, team: [{ id: PG.PETS[pet].evo, lv: 5 }], seed: 3 });
    rows.push(st.fastCharge === pet && a.team[0].energy === PG.ringOf(pet, 2) - 1 && b.team[0].energy === 0 && evo.team[0].energy === PG.ringOf(pet, 5) - 1);
  }
  ok(rows.every(Boolean) && PLV.filter((st) => st.fastCharge).map((st) => PLV.indexOf(st) + 1).join() === '3,8,12', 'T308 第 3、8、12 关：带对口的那只（长大版也算）表盘 = 满格 − 1，带别的宠物 0（' + rows.join(',') + '）');
  const { boot } = require('./wx-env.js');
  const S = (stage) => JSON.stringify({ ch1new: 1, econ: 2, petTutDone: true, tutorialDone: true, petStage: stage, pets: { tongque: { lv: 2, exp: 0 }, huli: { lv: 1, exp: 0 } }, petOrder: ['tongque', 'huli'], activePet: 'tongque', introSeen: { pet: 1, catch: 1, crawl: 1, metal: 1 }, cutSeen: { chapter0: true } });
  const E1 = boot({ seed: 2, store: { luoshu_save_v1: S(2) } }); E1.G.newPetLevel(2); E1.run(3); const first = E1.G.g.team[0].energy; E1.restore();
  const E2 = boot({ seed: 2, store: { luoshu_save_v1: S(6) } }); E2.G.newPetLevel(2); E2.run(3); const again = E2.G.g.team[0].energy; E2.restore();
  ok(first === PG.ringOf('tongque', 2) - 1 && again === 0, 'T308 进游戏：第一次打第 3 关带小铜雀只差 1 格（' + first + '），重打是 0（' + again + '）');
});
// ---------- 第 3 关卡口（段 1 留给段 3 的「早 ≥ 2 手」）----------
t('T320', () => {
  const g = PG.createPetGame({ stage: PLV[2], team: [{ id: 'tongque', lv: 1 }], seed: 7 });
  ok(g.hand.slice(0, 3).map((p) => p.id).join() === '2v,3h,L4a' && g.team[0].energy === PG.ringOf('tongque', 1) - 1, 'T320 第 3 关开局三块写死 2 竖、3 横、L；表盘只差 1 格');
  const e1 = g.place(0, 0, 3);
  ok(e1 && e1.units.length === 1 && g.hand[3] && g.hand[3].kind === 'peck', 'T320 第 1 手 2 竖放第 1、2 排第 4 列：消一排，宠物格里有羽毛');
  ok(!core.canPlace(g.board, g.hand[1], 4, 6), 'T320 啄之前 3 横放不进第 5 排第 7–9 列');
  const e2 = g.useSkill({ r: 4, c: 7, dir: 'h' });
  ok(e2 && g.board[K(4, 7)] === CELL.EMPTY && g.moves === 1, 'T320 羽毛啄第 5 排第 8 列：啄掉那一格（不算一手）');
  const e3 = g.place(1, 4, 6);
  ok(e3 && e3.collected.filter((c) => c.what === 'monster').length === 1 && g.moves === 2, 'T320 第 2 手 3 横放进去：抓到 1 只（照引导第 ' + g.moves + ' 手抓到第一只）');
});
t('T321', () => {
  const h0 = PG.createPetGame({ stage: PLV[2], team: [], seed: 5 }); let best = 99, tried = 0;
  const rec = (b, hand, depth) => { hand.forEach((p, i) => { if (!p) return; for (const [r, c] of core.placements(b, p)) { tried++; const res = core.placeAndClear(b, p, r, c); if (res.cells.some((k) => b[k] === CELL.MON)) { best = Math.min(best, depth + 1); continue; } const nh = hand.slice(); nh[i] = null; if (depth + 1 < 3) rec(res.board, nh, depth + 1); } }); };
  rec(h0.board, h0.hand.slice(0, 3), 0);
  ok(best === 99 && tried > 1000, 'T321 第 3 关不用羽毛，把开局三块的所有放法穷举（' + tried + ' 种）：没有一种抓得到怪');
});

// ---------- 新宠物的流程（规则 2、3）----------
const FLOW = require('../js/flow.js');
t('T325', () => {
  const f = (o) => FLOW.flowAfterWin(o).join(' → ');
  ok(f({ boss: false, chapterEnd: false, gift: 'huli', first: true, owned: 2 }) === 'result → petEntrance → switchTeach → nextCard', 'T325 第 5 关第一次过：结算 → 出场（一尾狐）→ 教换宠物 → 下一关');
  ok(f({ boss: true, chapterEnd: true, gift: 'baozhu', first: true, owned: 3 }) === 'result → chapterClear → petEntrance → switchTeach → nextCard', 'T325 第 10 关第一次过：结算 → 过章 → 出场 → 教换 → 下一关');
  ok(f({ boss: false, chapterEnd: false, gift: 'tongque', first: true, owned: 1 }) === 'result → petEntrance → nextCard', 'T325 第 2 关第一次过：结算 → 出场 → 下一关（只有一只，没有教换）');
  ok(f({ boss: true, chapterEnd: true, gift: null, first: true, owned: 5 }) === 'result → chapterClear → nextCard', 'T325 第 20 关第一次过：结算 → 过章 → 下一关');
  ok(f({ boss: true, chapterEnd: true, gift: null, first: false, owned: 5 }) === 'result → nextCard' && f({ boss: false, chapterEnd: false, gift: null, first: false, owned: 2 }) === 'result → nextCard', 'T325 任何关重打：结算 → 下一关');
});
const { boot } = require('./wx-env.js');
const SAVE = (o) => JSON.stringify(Object.assign({ ch1new: 1, econ: 2, petTutDone: true, tutorialDone: true, petStage: 4, pets: { tongque: { lv: 3, exp: 0 } }, petOrder: ['tongque'], activePet: 'tongque', introSeen: { pet: 1, catch: 1, crawl: 1, metal: 1, rush: 1, moss: 1, boss: 1, dirt: 1, sticky: 1, boss2: 1 }, cutSeen: { chapter0: true, chapter1: true } }, o || {}));
const winNow = (E, i) => { const { G, run } = E; G.newPetLevel(i); run(3); G.skipCuts(); G.mode = 'play'; run(3); const g = G.g; g.over = true; g.won = true; g.reason = 'win'; G.endGame(); run(90); };
t('T326', () => {
  const E = boot({ seed: 4, store: { luoshu_save_v1: SAVE() } }), { G, run } = E;
  winNow(E, 4);
  const s = G.save, r = G.result, seenTxt = E.frameDrawn().map((d) => d.s).join('|');
  ok(r && r.gift === 'huli' && s.pets.huli && s.pets.huli.lv === 1 && s.pets.huli.exp === 1 && s.petSeen.huli === false && s.freshPet && s.freshPet.huli, 'T326 第 5 关赢的那一手：存档里已经有一尾狐（1 级、自己叼 1 颗），记着「还没看过出场」、「第一次出战只差 1 格」');
  ok(G.mode === 'over' && !/新宠物/.test(seenTxt) && !G.cutPlaying, 'T326 先出结算页：面板上不画新宠物，过场还没放（规则 2 第 ① 步）');
  ok(r.flow.join() === 'result,petEntrance,switchTeach,nextCard', 'T326 这一局的步子：' + r.flow.join(' → '));
  E.tap(E.btn('tocamp')); run(3);
  const inCut = G.mode === 'cut'; G.skipCuts(); run(5);
  ok(inCut && G.mode === 'camp' && s.petSeen.huli === true && s.switchTeach && s.switchTeach.id === 'huli', 'T326 点「继续」：放一尾狐的出场 → 演完擦掉「没看过」的记号 → 回宠物园，下一关的关牌上要教换宠物');
  const n0 = s.petOrder.length; winNow(E, 4);
  ok(!G.result.gift && s.petOrder.length === n0 && G.result.flow.join() === 'result,nextCard', 'T326 重打第 5 关：不再送，步子只有结算 → 下一关');
  E.restore();
  // 第 10 关：先过章、再出场
  const E2 = boot({ seed: 5, store: { luoshu_save_v1: SAVE({ petStage: 9, pets: { tongque: { lv: 3, exp: 0 }, huli: { lv: 1, exp: 1 } }, petOrder: ['tongque', 'huli'], petSeen: { tongque: true, huli: true } }) } });
  winNow(E2, 9); E2.tap(E2.btn('tocamp')); E2.run(3);
  const order = []; for (let k = 0; k < 4 && E2.G.mode === 'cut'; k++) { order.push(Object.keys(E2.G.save.cutSeen).filter((x) => /^(clear|pet_)/.test(x)).join('+')); E2.G.CUT.skip(); E2.run(2); }
  ok(E2.G.result.flow.join() === 'result,chapterClear,petEntrance,switchTeach,nextCard' && order[0] === 'clear0' && /pet_baozhu/.test(order[1] || ''), 'T326 第 10 关第一次过：点「继续」先放过章，再放小穿山甲出场（' + order.join(' / ') + '）');
  E2.restore();
  // 中途关掉：下次进章页补演
  const E3 = boot({ seed: 6, store: { luoshu_save_v1: SAVE({ petStage: 5, pets: { tongque: { lv: 3, exp: 0 }, huli: { lv: 1, exp: 1 } }, petOrder: ['tongque', 'huli'], petSeen: { huli: false } }) } });
  E3.G.mode = 'map'; E3.run(3); const c3 = E3.G.mode === 'cut'; E3.G.skipCuts(); E3.run(3);
  ok(c3 && E3.G.save.petSeen.huli === true && E3.G.mode === 'map', 'T326 拿到了还没看出场就关掉游戏：下次进章页先补演，演完擦掉记号');
  E3.restore();
  // 老存档：打过第 5、13 关但手里没有一尾狐、蚕宝宝 → 开机补上，排队演
  const E4 = boot({ seed: 7, store: { luoshu_save_v1: SAVE({ petStage: 14, pets: { tongque: { lv: 3, exp: 0 }, baozhu: { lv: 2, exp: 0 } }, petOrder: ['tongque', 'baozhu'] }) } });
  const s4 = E4.G.save; ok(s4.pets.huli && s4.pets.modou && s4.petSeen.huli === false && s4.petSeen.modou === false, 'T326 老存档打过第 5、13 关：开机补上一尾狐、蚕宝宝，记着「还没看过出场」');
  E4.G.mode = 'map'; E4.run(3); E4.G.skipCuts(); E4.run(3); const one = [s4.petSeen.huli, s4.petSeen.modou].filter(Boolean).length; E4.G.skipCuts(); E4.run(3);
  ok(one === 1 && s4.petSeen.huli === true && s4.petSeen.modou === true, 'T326 补演一次一只（先演完一只，再演下一只）');
  E4.restore();
});
t('T327', () => {
  const E = boot({ seed: 8, store: { luoshu_save_v1: SAVE() } }), { G, run } = E;
  winNow(E, 4); E.tap(E.btn('tocamp')); run(3); G.skipCuts(); run(3);
  G.newPetLevel(2); run(5); // 重打第 3 关（不是登场关）。出战的还是原来的小铜雀
  const t0 = JSON.stringify(G.save.switchTeach);
  ok(G.mode === 'start' && G.buttons().some((b) => b.id === 'cardPet_huli') && G.save.switchTeach.id === 'huli' && !G.save.switchTeach.step, 'T327 关牌上两块圆牌并排，先指着新来的一尾狐（' + t0 + '）');
  E.tap(E.btn('cardPet_huli')); run(5);
  const e1 = G.g.team[0].energy, want = PG.ringOf('huli', 1) - 1, t1 = G.save.switchTeach;
  ok(G.g.team[0].id === 'huli' && e1 === want && G.save.freshPet.huli && t1 && t1.step === 1 && t1.from === 'tongque', 'T327 点了一尾狐：它第一次出战（随便哪一关）表盘 = 满格 − 1（' + e1 + ' / ' + want + '），还没用掉；手指改指回小铜雀');
  E.tap(E.btn('cardPet_tongque')); run(5);
  ok(!G.save.switchTeach && G.g.team[0].id === 'tongque', 'T327 点回小铜雀：教换宠物收起');
  E.tap(E.btn('cardPet_huli')); run(5);
  E.tap(E.btn('startGo')); run(5);
  ok(G.mode === 'play' && G.g.team[0].id === 'huli' && !G.save.freshPet.huli, 'T327 带一尾狐点「开打」：这时才用掉「只差 1 格」');
  G.newPetLevel(2); run(5);
  ok(G.g.team[0].energy === 0, 'T327 第二次带它：0（' + G.g.team[0].energy + '）');
  ok(!E.errs().length, 'T327 没有出错记账' + (E.errs().length ? '：' + JSON.stringify(E.errs()[0]).slice(0, 160) : ''));
  E.restore();
});

// ---------- 连输两次请帮手（规则 10）----------
t('T350', () => {
  const r8 = PG.bestPetFor(PLV[7]), r12 = PG.bestPetFor(PLV[11]), r19 = PG.bestPetFor(PLV[18]);
  ok(r8.map((x) => x.id).sort().join() === BASE.slice().sort().join() && r8[0].id === 'tongque' && r8[0].n === 2 && r12[0].id === 'baozhu' && r12[0].n === 2, 'T350 名单是五只的小时候编号；金属数给小铜雀（第 8 关 2）、土堆数给小穿山甲（第 12 关 2），另外三只 0');
  ok(r19.filter((x) => x.n > 0).length === 2 && !PG.bestPetFor(PLV[3]).length && !PG.bestPetFor(PLV[13]).length, 'T350 第 19 关两种都有；没有障碍的关（第 4、14 关）返回空');
});
t('T351', () => {
  const all = ['tongque', 'huli', 'baozhu', 'modou', 'lvgui'], H = (n, c, own) => PG.helperFor(PLV[n - 1], c, own);
  const cases = [
    [8, 'huli', ['tongque', 'huli'], 'tongque'], [8, 'jinchique', all, null], [8, 'huli', ['huli', 'baozhu'], null],
    [12, 'tongque', ['tongque', 'baozhu'], 'baozhu'], [12, 'lvgui', all, 'baozhu'], [12, 'baozhuwang', all, null],
    [19, 'lvgui', all, 'tongque'], [19, 'modou', ['modou', 'baozhu'], 'baozhu'], [19, 'tongque', all, null], [19, 'baozhu', all, null],
    [14, 'lvgui', all, null], [4, 'tongque', ['tongque'], null], [20, 'huli', all, 'baozhu'],
  ];
  const bad = cases.filter(([n, c, own, want]) => H(n, c, own) !== want).map(([n, c, , want]) => n + '/' + c + '→' + H(n, c, cases.find((x) => x[0] === n && x[1] === c)[2]) + '（要 ' + want + '）');
  ok(!bad.length, 'T351 一张小表逐格查（带谁 × 有什么障碍 × 自己有没有对口的）：只有带的这只有打不开的、自己有打得开的才请；带小龟也给；没障碍的关不给（不对的：' + (bad.join('、') || '没有') + '）');
  // 进游戏：连输两次以后请来的不到 3 级按 3 级算、记成借的；已经 3 级以上就是自己的
  const run2 = (lvB) => {
    const E = boot({ seed: 9, store: { luoshu_save_v1: SAVE({ petStage: 11, pets: { tongque: { lv: 3, exp: 0 }, huli: { lv: 2, exp: 0 }, baozhu: { lv: lvB, exp: 0 } }, petOrder: ['tongque', 'huli', 'baozhu'], petSeen: { tongque: true, huli: true, baozhu: true }, activePet: 'lvgui', loss: { 11: 1 } }) } }), { G, run } = E;
    G.save.pets.lvgui = { lv: 1, exp: 1 }; G.save.petOrder.push('lvgui'); G.save.activePet = 'lvgui'; G.save.petSeen.lvgui = true;
    G.newPetLevel(11); run(3); G.skipCuts(); G.mode = 'play'; run(3); const g = G.g; g.over = true; g.won = false; g.reason = 'stuck'; G.endGame(); run(90);
    const b = E.btn('lend'); let lv = 0, lent = null; if (b) { E.tap(b); run(5); lv = G.g.team[0].lv; lent = G.g.lent; } const id = G.g.team[0].id; E.restore(); return { b: !!b, lv, lent, id };
  };
  const a = run2(1), c = run2(5);
  ok(a.b && a.id === 'baozhu' && a.lv === 3 && a.lent === true, 'T351 第 12 关带小龟连输两次：有「请小穿山甲来帮忙」，自己的 1 级按 3 级算、记成借的（最多 2 槽）');
  ok(c.b && c.lv === 5 && c.lent === false, 'T351 自己的小穿山甲已经 5 级：就用自己的，不算借');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
  ok(!/借一只 .* 级的再来/.test(src), 'T351 「借一只高两级的再来」拿掉了');
});

done();
