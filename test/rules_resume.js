// 段 3 规则 11「中途退出接着打」（段 3 细设计第五节 T360–T366，T317）。用法：node test/rules_resume.js [每关几局，默认 4；--full = 12]
// 规则层：打到第 K 手存盘 → 过一遍文字（JSON）→ 新开一局恢复 → 两边照同一个机器人打到底，每一手都要一样。
// 进游戏那一半（main.js 每手写 luoshu_run_v1、开机恢复、版本 / 关卡表指纹对不上丢掉、试玩记录「恢复」）在 test/resume_boot.js
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
done();
