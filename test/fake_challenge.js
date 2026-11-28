// 段 3 规则 5 T330「假挑战」（全量设计 157、181；台账 R-060）：新东西出场的那 7 关，已有的每只宠物（平摊等级）各打 N 局，
// 数新东西「自己」放了几次本事（开局先演的那一次不算），每只的平均都要 ≥ 2 次，不到就改关。以后每出一个新东西，往 THINGS 里加一行。
// 黄灯：机器人手熟 skill 1。用法：node test/fake_challenge.js [每只几局，默认 200] [--quick（每只 30 局，check-all 用）]
const L = require('./seg3_lib.js'), { PLV, NAME, cell, ownedAt, WIDE } = L;
const QUICK = process.argv.includes('--quick'), N = QUICK ? 40 : +process.argv.find((a) => /^\d+$/.test(a)) || 200;
const LINE = QUICK ? 1.9 : 2; // --quick 局数少：给 0.1 的误差（和 T331 给 5 个点一个道理）；红线照整 2 要跑 200 局
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
// 关号 → 新东西、什么算放了一次（acc 是 seg3_lib.play 数的：爬 crawl、留墨 moss、吐泥 mud、头目跳 jump、摆满被堵 blocked、被打开 opened）
const THINGS = [
  [4, '墨怪爬', (a) => [a.crawl]],
  [8, '金属：摆满被它堵着 + 被啄开', (a) => [a.blocked + a.opened]],
  [10, '大墨怪跳', (a) => [a.jump]],
  [12, '土堆：摆满被它堵着 + 被挖塌', (a) => [a.blocked + a.opened]],
  [13, '墨苔怪留墨', (a) => [a.moss]],
  [17, '粘墨怪吐泥', (a) => [a.mud]],
  [20, '泥沼怪吐泥 / 跳', (a) => [a.mud, a.jump]],
];
const acts = PLV.map((st, i) => (st.firstAct ? i + 1 : null)).filter(Boolean);
ok(THINGS.map((x) => x[0]).join() === acts.join(), 'T330 表里管的 7 关就是关卡表里「开局先演」的那 7 关（' + acts.join('、') + '）');
for (const [n, what, f] of THINGS) {
  const li = n - 1, rows = ownedAt(li).map((p) => { const c = cell(li, p, Math.max(1, WIDE[li]), 1, N); return { p, v: f(c.acc) }; });
  const low = Math.min(...rows.map((r) => Math.min(...r.v)));
  // 头目跳：9 颗心、每挨 3 下跳一次，一局最多跳 2 次，所以平均正好贴着 2（偶尔一局最后 3 颗心一手打光、第二跳来不及跳）。照细设计表 C 的读法，平均取一位小数比线；没到整 2 的打一行黄灯
  if (low < 2 && Math.round(low * 10) / 10 >= 2) console.log('   黄灯：第 ' + n + ' 关最少的那只平均 ' + low.toFixed(3) + ' 次，贴着线（头目心再减就会破）');
  ok(Math.round(low * 10) / 10 >= LINE, 'T330 第 ' + n + ' 关「' + what + '」每局自己放了几次（' + N + ' 局 × 每只）：' + rows.map((r) => NAME[r.p] + ' ' + r.v.map((x) => x.toFixed(1)).join(' / ')).join('，') + '；最少 ' + low.toFixed(1) + '（线 ≥ ' + LINE + '）');
}
console.log(pass + ' 项通过，' + fail + ' 项没过');
process.exit(fail ? 1 : 0);
