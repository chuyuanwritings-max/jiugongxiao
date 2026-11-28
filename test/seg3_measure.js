// 段 3 量数（段 3 细设计第五节 T331–T336；黄灯：机器人没拿真人校准过）。
// 每关 × 打到这关已有的每只 ×（1 级 / 平摊 / 专心）× 手熟、手生，各打 N 局。
// 用法：node test/seg3_measure.js [每格几局，默认 200] [--quick（每格 24 局，check-all 用）] [--write（存 test/seg3_par_report.txt 和 test/seg3_report.txt）]
// 红线（不过算没过）：T331 手生过关率 普通类 ≥ 75%、难关头目 ≥ 55%；T332 最慢那只的赢局手数中位 × 0.7 ≤ 标准手数 × 1.5；T334 标准手数和量出来的差 ≤ 2（--quick 局数少，放宽到 4）；T335 没有一局卡死、没有一局超过 400 手。
// 黄线（只打印）：T331 普通类 ≥ 80%、难关头目 ≥ 60%；T333 一关多长（× 0.7 折成人）普通类 20–30 手、难关头目 30–40 手；T336 对口省不省手、专心和平摊差多少
const fs = require('fs'), path = require('path');
const L = require('./seg3_lib.js'), { PLV, EC, NAME, FACTOR, pct, cell, combos, parPool, parFrom, Q_OF } = L;
const QUICK = process.argv.includes('--quick'), WRITE = process.argv.includes('--write');
const N = QUICK ? 24 : +process.argv.find((a) => /^\d+$/.test(a)) || 200;
let pass = 0, fail = 0; const yellow = [], lines = [], par = [];
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
const out = (s) => { lines.push(s); console.log(s); };
const TAG = { none: '不带', worst: '1 级', wide: '平摊', focus: '专心' };
const t0 = Date.now();
out('段 3 量数报告（黄灯；每格 ' + N + ' 局；手熟 skill 1 / 手生 skill 0.6；标准手数 = 手熟机器人赢局手数 × ' + FACTOR + '，普通、教学关取中位，难关 35%，头目 40%）');
out('专心等级 ' + L.FOCUS.join(',') + '；平摊等级 ' + L.WIDE.join(','));
out('关 类     宠物@级      手生过关率  手熟过关率  手熟手数 25/50/75   技能/局  爬 墨 泥 跳 堵 开');
const red = { rate: [], soft: [], slow: [], parDiff: [] }, lens = [];
PLV.forEach((st, li) => {
  const kind = EC.kindOf(st);
  if (kind === 'rush') { par.push({ n: li + 1, kind, par: st.par, note: '冲锋关：标准手数 = 块数，三条秒数线不动（Cc 11-28 定）' }); out(String(li + 1).padStart(2) + ' 冲锋（不量，秒数线照旧 ' + [st.rush.t3, st.rush.t2, st.rush.lose].join(' / ') + '）'); return; }
  const rows = combos(li).map(([pet, lv, tag]) => { const a = cell(li, pet, lv, 1, N), b = cell(li, pet, lv, 0.6, N); return { pet, lv, tag, a, b, wm: a.wm }; });
  const normalish = kind === 'teach' || kind === 'normal', redLine = normalish ? 75 : 55, yLine = normalish ? 80 : 60;
  rows.forEach((r) => {
    const a = r.a, x = a.acc;
    out(String(li + 1).padStart(2) + ' ' + kind.padEnd(6) + ' ' + ((r.pet ? NAME[r.pet] : '无') + r.lv + TAG[r.tag]).padEnd(8) + '   ' + String(r.b.rate).padStart(4) + '%      ' + String(a.rate).padStart(4) + '%      ' + (pct(a.wm, 0.25) + '/' + a.med + '/' + pct(a.wm, 0.75)).padStart(10) + '        ' + a.skills.toFixed(1) + '   ' + [x.crawl, x.moss, x.mud, x.jump, x.blocked, x.opened].map((v) => v.toFixed(1)).join(' ') + (a.soft + r.b.soft ? '  卡死 ' + (a.soft + r.b.soft) : '') + (a.long + r.b.long ? '  超 400 手 ' + (a.long + r.b.long) : ''));
    if (r.b.rate < redLine) red.rate.push((li + 1) + '关' + NAME[r.pet] + r.lv + ' ' + r.b.rate + '%');
    else if (r.b.rate < yLine) yellow.push('T331 第 ' + (li + 1) + ' 关带' + (r.pet ? NAME[r.pet] : '-') + r.lv + '级 手生 ' + r.b.rate + '%（黄线 ' + yLine + '%）');
    if (a.soft + r.b.soft + a.long + r.b.long) red.soft.push((li + 1) + '关' + (r.pet || '-') + r.lv);
  });
  const pool = parPool(rows), want = parFrom(pool, kind), med = pct(pool, 0.5);
  // 第 1、2 关是手把手的教学关（3 手、7 手），不照取法定（规则 7）；教学关过了就满槽，标准手数不影响丹
  const fixed = li < 2;
  par.push({ n: li + 1, kind, par: st.par, want, med, q: Q_OF[kind], pool: pool.length, note: fixed ? '手把手教学关，照旧（取法算出来是 ' + want + '）' : '' });
  if (!fixed && Math.abs(st.par - want) > (QUICK ? 4 : 2)) red.parDiff.push((li + 1) + '关 表里 ' + st.par + ' / 量出来 ' + want);
  // T332：最慢的那只（平摊档；没有平摊档用 1 级）
  const base = rows.filter((r) => r.tag === 'wide').length ? rows.filter((r) => r.tag === 'wide') : rows.filter((r) => r.tag === 'worst' || r.tag === 'none');
  const slow = base.reduce((m, r) => (r.a.med > m.a.med ? r : m), base[0]);
  if (!fixed && slow.a.med * FACTOR > st.par * 1.5) red.slow.push((li + 1) + '关 ' + NAME[slow.pet] + ' ' + slow.a.med + '×' + FACTOR + ' > ' + st.par + '×1.5');
  if (li >= 2) lens.push({ n: li + 1, kind, human: Math.round(med * FACTOR) });
  out('   → 合并（' + pool.length + ' 局赢）中位 ' + med + '，取 ' + Q_OF[kind] + ' 位置 × ' + FACTOR + ' = ' + want + '；表里标准手数 ' + st.par + '；最慢的 ' + (slow.pet ? NAME[slow.pet] : '-') + ' 中位 ' + slow.a.med);
});
ok(!red.rate.length, 'T331 手生机器人带任何一只已有的宠物（1 级、平摊、专心）：普通类过关率 ≥ 75%、难关头目 ≥ 55%（没过：' + (red.rate.join('、') || '没有') + '）');
ok(!red.slow.length, 'T332 每关最慢的那只：赢局手数中位 × ' + FACTOR + ' ≤ 标准手数 × 1.5（没过：' + (red.slow.join('、') || '没有') + '）');
ok(!red.parDiff.length, 'T334 每关标准手数和规则 7 的取法（× ' + FACTOR + '）算出来的差 ≤ ' + (QUICK ? 4 : 2) + ' 手（没过：' + (red.parDiff.join('、') || '没有') + '）');
ok(!red.soft.length, 'T335 没有一局卡死（没输也没得动）、没有一局超过 400 手（有的：' + (red.soft.join('、') || '没有') + '）');
// T333 一关多长（黄线）
lens.forEach((x) => { const lo = x.kind === 'hard' || x.kind === 'boss' ? 30 : 20, hi = lo + 10; if (x.human < lo || x.human > hi) yellow.push('T333 第 ' + x.n + ' 关（' + x.kind + '）折成人 ' + x.human + ' 手（线 ' + lo + '–' + hi + '）'); });
out('\nT333 一关多长（合并中位 × ' + FACTOR + ' 折成人）：' + lens.map((x) => x.n + ':' + x.human).join(' '));
out('黄线（只打印）：' + (yellow.length ? '\n  ' + yellow.join('\n  ') : '没有'));
out('用了 ' + Math.round((Date.now() - t0) / 1000) + ' 秒');
if (WRITE) {
  fs.writeFileSync(path.join(__dirname, 'seg3_report.txt'), lines.join('\n') + '\n');
  const pl = ['段 3 标准手数（Cc 11-28 定：机器人手数 × ' + FACTOR + '；细设计原写 0.55）。手熟机器人，平摊档所有已有宠物合在一起（第 3–5 关只有 1 级小铜雀），每只 ' + N + ' 局。', '取法：普通、教学关取中位，难关取 35% 那个位置，头目取 40%；四舍五入。冲锋关不量（标准手数 = 块数，秒数线不动）。', '', '关  类      表里标准手数  量出来（取法）  合并中位  赢局数  细设计 0.55 版  说明'];
  const OLD55 = [3, 7, 25, 20, 29, 22, 24, 23, 29, 29, 21, 24, 25, 26, 29, 27, 25, 24, 27, 29];
  par.forEach((p) => pl.push(String(p.n).padStart(2) + '  ' + p.kind.padEnd(6) + '  ' + String(p.par).padStart(8) + '      ' + String(p.want === undefined ? '-' : p.want).padStart(8) + '      ' + String(p.med === undefined ? '-' : p.med).padStart(6) + '   ' + String(p.pool === undefined ? '-' : p.pool).padStart(5) + '   ' + String(OLD55[p.n - 1]).padStart(8) + '        ' + (p.note || '')));
  fs.writeFileSync(path.join(__dirname, 'seg3_par_report.txt'), pl.join('\n') + '\n');
  console.log('存好了 test/seg3_report.txt、test/seg3_par_report.txt');
}
console.log(pass + ' 项通过，' + fail + ' 项没过');
process.exit(fail ? 1 : 0);
