// 0.9.21 冲锋关不卡死（Cc 11-27：「整个地图都是满的，手里还有一块塞不进去、没地方放了，但它也不消」）
// 纯引擎：第 7、16 关各打 300 局，每一手都检查「手上每块都有地方放、放下去一定消」；0.9.22 起铜砖只放在「本来该消却没消」的排里：每条满着的排 / 列 / 大格里都要有铜砖，铜砖要少
const PG = require('../js/petgame.js'), PLV = require('../js/petlevels.js'), core = require('../js/core.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
for (const li of [6, 15]) {
  const st = PLV[li]; let rejectFail = 0, stuck = 0, noClear = 0, brickClear = 0, fullNoBrick = 0, bricks = 0, checks = 0, stepBad = 0, moves = 0, boards = 0, wins = 0, fixes = { peck: 0, gnaw: 0, none: 0 };
  for (let s = 0; s < 300; s++) {
    for (const pet of ['tongque', 'baozhu']) {
      const g = PG.createPetGame({ stage: st, team: [{ id: pet, lv: 1 }], seed: 1000 + s * 7 + (pet === 'baozhu' ? 1 : 0) });
      const f0 = g.rushFixStart; fixes[f0 ? f0.kind : 'none']++;
      for (let m = 0; m < 200 && !g.over; m++) {
        const slots = [0, 1, 2].filter((i) => g.hand[i]);
        if (!slots.every((i) => core.placements(g.board, g.hand[i]).length)) { stuck++; break; }
        const i = slots[Math.floor(Math.random() * slots.length)], all = core.placements(g.board, g.hand[i]), ps = all.filter(([r, c]) => g.rushOK(i, r, c)), at = ps[Math.floor(Math.random() * ps.length)];
        if (!ps.length) { stuck++; break; }
        const bad = all.find(([r, c]) => !g.rushOK(i, r, c)); if (bad && g.place(i, bad[0], bad[1]) !== null) rejectFail++;
        const before = g.board.slice();
        const ev = g.place(i, at[0], at[1]); moves++;
        if (!ev) { stuck++; break; }
        if (!ev.units.length) noClear++;
        if (ev.units.some((u) => !core.UNITS[u].some((k) => before[k] === 0))) brickClear++; // 消掉的必须是这一手塞满的（原来有空）
        if (ev.rushStep === undefined || ev.rushStep !== (m % 6) && !ev.win) stepBad++;
        if (!g.over) { checks++; bricks += g.board.filter((v) => v === 8).length; core.UNITS.forEach((u) => { if (u.every((k) => g.board[k]) && !u.some((k) => g.board[k] === 8)) fullNoBrick++; }); }
        if (ev.rushBoard) { boards++; fixes[ev.rushFix ? ev.rushFix.kind : 'none']++; }
      }
      if (g.won) wins++;
    }
  }
  console.log('第 ' + (li + 1) + ' 关：600 局，' + moves + ' 手，换盘 ' + boards + ' 次，赢 ' + wins + ' 局；宠物修：' + JSON.stringify(fixes));
  ok(stuck === 0, '第 ' + (li + 1) + ' 关没有一次卡死（手上有块放不下）：' + stuck);
  ok(noClear === 0, '第 ' + (li + 1) + ' 关每一手都消：没消的 ' + noClear + ' 手');
  ok(brickClear === 0, '第 ' + (li + 1) + ' 关只消这一手塞满的排，别的满排不自己消：' + brickClear);
  ok(fullNoBrick === 0, '第 ' + (li + 1) + ' 关每条满着的排 / 列 / 大格里都有铜砖（看得出它不会消）：缺 ' + fullNoBrick);
  ok(bricks / checks < 14, '第 ' + (li + 1) + ' 关铜砖少：平均每盘 ' + (bricks / checks).toFixed(1) + ' 块（81 格里）');
  ok(stepBad === 0, '第 ' + (li + 1) + ' 关连消声一块升一级、6 块一轮：错 ' + stepBad);
  ok(rejectFail === 0, '第 ' + (li + 1) + ' 关放在不会消的地方会被弹回：' + rejectFail);
  ok(fixes.none === 0, '第 ' + (li + 1) + ' 关每一盘宠物都有东西修');
}
console.log(pass + ' 项通过，' + fail + ' 项没过'); process.exit(fail ? 1 : 0);
