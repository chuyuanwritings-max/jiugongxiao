// 一关一行的难度表（0.9.6，照 ../九宫消_打磨流程建议_20261125.md 第五节）。
// 每关先写「想要什么」（档位的线，量之前就写死），再用会奔目标的机器人量「实际是什么」，过线亮灯。
// 有真人记录（游戏设置里「复制试玩记录」贴进 test/real_log.json）就填「真人」那一列；没和真人对过的，最多亮黄灯。
// 用法：node test/difficulty_table.js [每种几局=100] [关卡表=../js/petlevels.js]
// 输出：../九宫消_难度表.md（给 Cc 看）、test/difficulty_table.json（给 Kira 用）
const fs = require('fs');
const path = require('path');
const M = require('./fable_measure.js');
const N = +process.argv[2] || 100;
const PLV = require(path.resolve(__dirname, process.argv[3] || '../js/petlevels.js'));

// 档位的线（打磨流程建议 5.1；「该打几手」等节奏总表定了整列重写）
const LINES = {
  first: { name: '第 1 关', moves: [8, 10], win: [100, 100], firstClear: 3, dry: 6, near: null },
  teach: { name: '教新东西', moves: [10, 14], win: [95, 100], firstClear: 3, dry: 6, near: null },
  normal: { name: '普通', moves: [12, 20], win: [80, 90], firstClear: 3, dry: 6, near: 50 },
  relief: { name: '喘气 / 爽关', moves: [8, 14], win: [95, 100], firstClear: 3, dry: 4, near: null },
  hard: { name: '难', moves: [16, 24], win: [55, 70], firstClear: 3, dry: 6, near: 50 },
  super: { name: '超难', moves: [20, 28], win: [35, 50], firstClear: 3, dry: 6, near: 50 },
  boss: { name: '头目', moves: [24, 32], win: [55, 70], firstClear: 3, dry: 6, near: 50 },
};
const RELIEF = new Set([5, 15]); // 第 6、16 关：喘气关、爽关（关卡表注释里写的）
function tierOf(st, i) {
  if (i === 0) return 'first';
  if (st.goal.boss) return 'boss';
  if (st.hard === 2) return 'super';
  if (st.hard === 1) return 'hard';
  if (RELIEF.has(i)) return 'relief';
  if (st.intro) return 'teach';
  return 'normal';
}

// 一种手法跑 N 局，记赢率、赢的那局手数、第一次消、最闷的一成局最长几手没消、输局里「差一点」的比例、宠物完成目标的比例
function run(st, team, skill) {
  const wins = [], losses = [];
  for (let s = 1; s <= N; s++) { const g = M.play(st, team, s * 7919 + 3, skill); (g.won ? wins : losses).push(g); }
  const avg = (arr, f) => (arr.length ? arr.reduce((a, g) => a + f(g), 0) / arr.length : 0);
  const dries = wins.concat(losses).map((g) => g.playStats.maxDry).sort((a, b) => a - b);
  const all = wins.concat(losses);
  const pet = all.reduce((a, g) => a + g.playStats.goalsByPet, 0), me = all.reduce((a, g) => a + g.playStats.goalsByPlayer, 0);
  return {
    win: Math.round((wins.length / N) * 100),
    moves: avg(wins, (g) => g.moves),
    firstClear: avg(all, (g) => g.playStats.firstClear || g.moves),
    dry90: dries.length ? dries[Math.floor(dries.length * 0.9)] : 0,
    near: losses.length ? Math.round((losses.filter((g) => g.progressFrac() >= 0.8).length / losses.length) * 100) : null,
    petShare: pet + me ? Math.round((pet / (pet + me)) * 100) : 0,
    acts: avg(all, (g) => Object.values(g.petActsTotal).reduce((a, b) => a + b, 0)),
  };
}

// 真人记录（可选）
let real = {};
const realFile = path.join(__dirname, 'real_log.json');
if (fs.existsSync(realFile)) {
  const raw = JSON.parse(fs.readFileSync(realFile, 'utf8'));
  const logs = Array.isArray(raw) ? raw : raw.log || [];
  logs.forEach((r) => { (real[r.lv] = real[r.lv] || []).push(r); });
}

const rows = [];
PLV.forEach((st, i) => {
  const team = M.teamOf(i), tier = tierOf(st, i), L = LINES[tier];
  const avgP = run(st, team, 8), raw = run(st, team, 7), seek = run(st, team, 9);
  const noPet = team.length ? run(st, [], 8) : null;
  const rl = real[i + 1] || [];
  const realWins = rl.filter((r) => r.won);
  const checks = [];
  const inR = (v, [a, b]) => v >= a && v <= b;
  checks.push(['几手', inR(avgP.moves, L.moves)]);
  checks.push(['一次过', inR(avgP.win, L.win)]);
  checks.push(['第一次消', avgP.firstClear <= L.firstClear + 0.5]);
  checks.push(['最闷', avgP.dry90 <= L.dry]);
  if (L.near !== null && avgP.near !== null) checks.push(['差一点', avgP.near >= L.near]);
  if (team.length) checks.push(['宠物干的', avgP.petShare <= 50]);
  const bad = checks.filter((c) => !c[1]).map((c) => c[0]);
  const calibrated = rl.length >= 3;
  rows.push({
    lv: i + 1, tier: L.name, line: L, avg: avgP, raw, seek, noPet, petMatter: noPet ? avgP.win - noPet.win : null,
    real: rl.length ? { n: rl.length, winRate: Math.round((realWins.length / rl.length) * 100), moves: realWins.length ? realWins.reduce((a, r) => a + r.moves, 0) / realWins.length : 0, sec: realWins.length ? realWins.reduce((a, r) => a + r.sec, 0) / realWins.length : 0 } : null,
    bad, lamp: bad.length ? '红' : calibrated ? '绿' : '黄',
  });
  process.stdout.write('.');
});
console.log();

// 给 Cc 的简表
const f0 = (v) => (v === null || v === undefined ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v);
const out = [];
out.push('# 《九宫消》难度表（' + new Date().toISOString().slice(0, 10) + '，' + N + ' 局 / 每种）');
out.push('');
out.push('照 `九宫消_打磨流程建议_20261125.md` 第五节。每关先写线，再量实际。**机器人的数还没和真人对过**（真人一列空着的关，最多黄灯）。脚本：`原型/test/difficulty_table.js`。');
out.push('');
out.push('- 「一般人」= 六成的手奔着目标、四成随手放；「生手」= 四成奔目标、三成还行、三成乱放；「最快」= 每手都奔目标。');
out.push('- 「最闷」= 最闷的一成局里，最长连着几手没消。「差一点」= 输的局里离过关只差两成以内的比例。');
out.push('- 「宠物干的」= 目标里宠物完成的占几成（线：玩家自己至少干一半）。「宠物要紧」= 带宠物一次过的比例 − 不带。');
out.push('- 「该打几手」那一列的线是照现在的短关写的，等节奏总表定了要整列重写。');
out.push('');
out.push('| 关 | 档位 | 几手 线 / 一般人 / 最快 | 一次过 线 / 一般人 / 生手 | 第一次消 | 最闷 线 / 实际 | 差一点 线 / 实际 | 宠物干的 | 宠物要紧 | 真人 | 灯 | 不过的 |');
out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
rows.forEach((r) => {
  const L = r.line;
  out.push(`| ${r.lv} | ${r.tier} | ${L.moves.join('–')} / ${f0(r.avg.moves)} / ${f0(r.seek.moves)} | ${L.win[0] === L.win[1] ? L.win[0] : L.win.join('–')}% / ${r.avg.win}% / ${r.raw.win}% | ${f0(r.avg.firstClear)} | ${L.dry} / ${r.avg.dry90} | ${L.near === null ? '—' : L.near + '%'} / ${r.avg.near === null ? '—' : r.avg.near + '%'} | ${r.noPet ? r.avg.petShare + '%' : '—'} | ${r.petMatter === null ? '—' : (r.petMatter >= 0 ? '+' : '') + r.petMatter} | ${r.real ? r.real.n + ' 局、' + r.real.winRate + '% 过、' + f0(r.real.moves) + ' 手、' + f0(r.real.sec) + ' 秒' : '没有'} | ${r.lamp} | ${r.bad.join('、') || '—'} |`);
});
const lamps = { 红: 0, 黄: 0, 绿: 0 };
rows.forEach((r) => lamps[r.lamp]++);
out.push('');
out.push(`**合计**：红 ${lamps['红']}、黄 ${lamps['黄']}、绿 ${lamps['绿']}。`);
fs.writeFileSync(path.join(__dirname, '..', '..', '九宫消_难度表.md'), out.join('\n') + '\n');
fs.writeFileSync(path.join(__dirname, 'difficulty_table.json'), JSON.stringify(rows, null, 1));
console.log('红 ' + lamps['红'] + '、黄 ' + lamps['黄'] + '、绿 ' + lamps['绿'] + ' → ../九宫消_难度表.md');
