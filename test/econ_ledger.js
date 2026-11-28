// 段 2 算账（丹细设计第二节、第四节 T241–T246）：三种玩家纯算一遍现在的 20 关，再让手熟、手生两档机器人真打 20 关、照真规矩结算
// 用法：node test/econ_ledger.js [每关几局，默认 40] [--write]（--write 把 T246 的报告存到 test/econ_report_seg2.txt，交给段 3）
// 黄灯：「普通人」「手生的」是估的，机器人没拿真人校准过；只有「全拿满」是定数
const fs = require('fs'), path = require('path');
const E = require('../js/economy.js'), PG = require('../js/petgame.js'), PLV = require('../js/petlevels.js');
const N = +process.argv.find((a) => /^\d+$/.test(a)) || 40;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
const t = (name, fn) => { try { fn(); } catch (e) { fail++; console.log('✗ ' + name + '：抛出异常 ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const P = E.PROFILES;

t('T241', () => {
  const L = ['weak', 'avg', 'full'].map((k) => E.ledger(PLV, P[k]));
  ok(eq(L.map((l) => l.first), [55, 67, 104]), 'T241 三种玩家第一次过关（含拿满 +1）：手生的 / 普通人 / 全拿满 = 55 / 67 / 104（算出来 ' + L.map((l) => l.first).join(' / ') + '）');
  ok(eq(L.map((l) => l.byChapter[0]), [32, 38, 52]), 'T241 其中第一章 32 / 38 / 52（算出来 ' + L.map((l) => l.byChapter[0]).join(' / ') + '）');
  const R = E.ledger(PLV, P.avg, { replay: true });
  ok(R.replay === 16 && R.total === 83, 'T241 普通人加「一点重打」（8 局：每天那一份 10 + 补亮的槽和拿满 6）= 83（算出来 ' + R.total + '）');
});
t('T242', () => {
  const kinds = {}; PLV.forEach((st) => { const k = E.kindOf(st); kinds[k] = (kinds[k] || 0) + 1; });
  const want = PLV.reduce((a, st) => a + E.levelMax(st), 0), full = E.ledger(PLV, P.full).first;
  ok(full === want, 'T242 全拿满 = 每类关数 × 上限的和（' + JSON.stringify(kinds) + ' → ' + want + '）');
  ok(full >= 96 && full <= 112, 'T242 前两章全拿满在 96–112 之间（现在 ' + full + '）' + (full >= 96 && full <= 112 ? '' : '——回去看段 2 细设计第二节第 8 条'));
});
t('T243', () => {
  const f = E.focusPath(PLV, P.avg);
  ok(f.evoAt >= 8 && f.evoAt <= 10, 'T243 普通人专心养一只：第 ' + f.evoAt + ' 关打完进化（线：第 8–10 关）');
  ok(f.after[19] === 7 || f.after[19] === 8, 'T243 第 20 关打完 ' + f.after[19] + ' 级（线：7 或 8 级），剩 ' + f.left + ' 颗');
  ok(eq(E.lvAt(PLV, 'focus'), [1, 1, 2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 7, 7]), 'T243 进每一关时大概几级（专心）：进第 3 关 2 级、4–5 关 3 级、6–9 关 4 级、10–12 关 5 级、13–15 关 6 级、16–20 关 7 级');
  ok(Math.max(...E.lvAt(PLV, 'wide')) <= 3, 'T243 平摊着养：五只都不超过 3 级（' + E.lvAt(PLV, 'wide').join(',') + '）');
});
t('T244', () => {
  const avg = E.ledger(PLV, P.avg).first, rep = E.ledger(PLV, P.avg, { replay: true }).total, evo1 = E.EVO_TOTAL - E.NEW_PET_EXP, to3 = E.EXP_NEED[1] + E.EXP_NEED[2] - E.NEW_PET_EXP;
  ok(2 * evo1 <= avg, 'T244 普通人 ' + avg + ' 颗：够进化两只（2 × ' + evo1 + ' = ' + 2 * evo1 + '）');
  ok(3 * evo1 > rep, 'T244 加一点重打 ' + rep + ' 颗也不够进化三只（3 × ' + evo1 + ' = ' + 3 * evo1 + '）');
  ok(5 * to3 < avg, 'T244 五只都到 3 级（5 × ' + to3 + ' = ' + 5 * to3 + '）还有剩');
});
t('T245', () => {
  const a = E.project6(PLV, P.avg, null, { replay: true }), f = E.project6(PLV, P.full), w = E.project6(PLV, P.weak), m = E.project6(PLV, P.avg);
  console.log('   黄灯：第 3–6 章没排，按每章 3 教 + 3 普通 + 1 冲锋 + 2 难 + 1 头目估。六章合计 手生 ' + w.total + ' / 普通 ' + m.total + ' / 普通加一点重打 ' + Math.round(a.total) + ' / 全拿满 ' + f.total + '；养满 ' + [w, m, a, f].map((x) => x.pets.toFixed(1)).join(' / ') + ' 只');
  ok(a.pets >= 2.0, 'T245 普通人加一点重打：六章养满 ' + a.pets.toFixed(2) + ' 只（线 ≥ 2.0）');
  ok(f.pets <= 3.3, 'T245 全拿满：六章养满 ' + f.pets.toFixed(2) + ' 只（线 ≤ 3.3）');
});

// ---- T246 机器人算账（R-054）：只出报告，不设线 ----
// 一个「玩家」从第 1 关打到第 20 关：每关打到赢为止（最多 8 次），机器人手数 × 0.55 当人的手数（冲锋关看秒数：每块手熟 1.2 秒、手生 2 秒），照真规矩结算；
// 带谁：点名关带点名的，别的关带第一只；喂法：专心（全喂第一只）/ 平摊（每次给最低的升）。等级是这个玩家自己攒的丹真喂出来的
const BOTS = [{ key: 'skilled', name: '手熟', skill: 1, sec: 1.2 }, { key: 'weak', name: '手生', skill: 0.6, sec: 2.0 }];
function playOne(st, team, seed, skill) {
  const g = PG.createPetGame({ stage: st, team, seed });
  let guard = 0;
  while (!g.over && guard++ < 400) {
    if (PG.useSkillIfGood(g)) continue;
    const m = PG.bestMove(g, skill);
    if (!m) { if (g.hand[3]) { const s = PG.skillBest && PG.skillBest(g); if (s && g.useSkill(s)) continue; } break; }
    g.place(m.i, m.r, m.c);
  }
  return { won: !!g.won, moves: g.moves };
}
function campaign(bot, mode, p) {
  const save = { dan: 0, slots: {}, danDay: {}, pets: {}, petOrder: [], petStage: 0 }, rows = [];
  PLV.forEach((st, li) => {
    const own = st.only ? (save.petOrder.find((id) => PG.baseId(id) === PG.baseId(st.only)) || null) : save.petOrder[0];
    const team = own ? [{ id: own, lv: save.pets[own].lv }] : [];
    let res = null, tries = 0;
    for (; tries < 8; tries++) { res = playOne(st, team, 70000 + p * 7919 + li * 131 + tries * 17 + (bot.key === 'weak' ? 3 : 0), bot.skill); if (res.won) break; }
    const human = Math.max(1, Math.round(res.moves * 0.55));
    const r = E.settle(save, li, st, { won: res.won, moves: human, sec: res.moves * bot.sec, revives: 0, lent: false }, 1);
    if (res.won) save.petStage = li + 1;
    if (res.won && st.gift && !save.pets[st.gift]) { save.pets[st.gift] = E.newPet(); save.petOrder.push(st.gift); }
    // 喂：专心全给第一只；平摊每次给最低的。到 5 级、10 级换成长大版（main.js 的 evolvePet 做的事）
    for (;;) {
      const id = mode === 'focus' ? save.petOrder[0] : save.petOrder.slice().sort((a, b) => save.pets[a].lv - save.pets[b].lv)[0];
      if (!id) break; const up = E.levelUp(save, id); if (!up.ok) break;
      const d = PG.PETS[id]; if (d.evo && save.pets[id].lv >= d.evoLv) { save.pets[d.evo] = save.pets[id]; delete save.pets[id]; save.petOrder = save.petOrder.map((x) => (x === id ? d.evo : x)); }
    }
    rows.push({ li, won: res.won, tries: tries + (res.won ? 1 : 0), slots: r.slots, dan: r.total, bag: save.dan, lvs: save.petOrder.map((id) => save.pets[id].lv) });
  });
  return rows;
}
t('T246', () => {
  const lines = [], out = (s) => { lines.push(s); console.log('   ' + s); };
  out('T246 机器人算账（段 2，黄灯：机器人没拿真人校准过；手数 × 0.55 当人；每关打到赢为止最多 8 次）。每档 ' + N + ' 个玩家 × 20 关');
  const prof = { weak: E.ledger(PLV, P.weak).perLevel, avg: E.ledger(PLV, P.avg).perLevel, full: E.ledger(PLV, P.full).perLevel };
  const summary = {};
  for (const bot of BOTS) for (const mode of ['focus', 'wide']) {
    const runs = []; for (let p = 0; p < N; p++) runs.push(campaign(bot, mode, p));
    out('\n== ' + bot.name + '机器人 · ' + (mode === 'focus' ? '专心养一只' : '平摊') + ' ==');
    out('关 类    1槽% 2槽% 3槽%  平均丹  累计丹  平均几次赢  宠物等级（平均）   对照：手生/普通/全满 每关丹');
    let cum = 0;
    PLV.forEach((st, li) => {
      const rs = runs.map((rw) => rw[li]), n3 = [1, 2, 3].map((k) => Math.round((rs.filter((x) => x.slots === k).length / N) * 100));
      const dan = rs.reduce((a, x) => a + x.dan, 0) / N; cum += dan;
      const lvs = [0, 1].map((j) => { const v = rs.filter((x) => x.lvs[j]).map((x) => x.lvs[j]); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '-'; });
      out(String(li + 1).padStart(2) + ' ' + E.kindOf(st).padEnd(6) + ' ' + n3.map((x) => String(x).padStart(4)).join(' ') + '  ' + dan.toFixed(1).padStart(6) + '  ' + cum.toFixed(1).padStart(6) + '  ' + (rs.reduce((a, x) => a + x.tries, 0) / N).toFixed(1).padStart(8) + '    ' + lvs.join(' / ').padEnd(14) + '   ' + [prof.weak[li].dan, prof.avg[li].dan, prof.full[li].dan].join(' / '));
    });
    const tot = runs.map((rw) => rw.reduce((a, x) => a + x.dan, 0)).sort((a, b) => a - b);
    summary[bot.key + '_' + mode] = { mean: cum, med: tot[Math.floor(N / 2)], min: tot[0], max: tot[N - 1] };
    out('前两章合计：平均 ' + cum.toFixed(1) + ' 颗，中位 ' + tot[Math.floor(N / 2)] + '，最少 ' + tot[0] + '，最多 ' + tot[N - 1] + '（对照：手生的 55 / 普通人 67 / 全拿满 104）');
  }
  out('\n交给段 3：普通关普通人拿 3 槽的局数要在 40%–60%、难关 20%–40%、头目关 30%–50%（第二节第 8 条第 1 项），对不上就重量标准手数');
  if (process.argv.includes('--write')) fs.writeFileSync(path.join(__dirname, 'econ_report_seg2.txt'), lines.join('\n') + '\n');
  ok(Object.values(summary).every((s) => s.mean > 0), 'T246 机器人报告出来了：' + Object.entries(summary).map(([k, s]) => k + ' 平均 ' + s.mean.toFixed(1)).join('，') + (process.argv.includes('--write') ? '（存到 test/econ_report_seg2.txt）' : ''));
});

console.log(pass + ' 项通过，' + fail + ' 项没过');
process.exit(fail ? 1 : 0);
