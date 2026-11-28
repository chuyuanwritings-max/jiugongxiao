// 段 1 整段验收 A3 / A4（规则细设计第三节）：手熟的机器人带五只宠物各打一遍 20 关，每关 N 局（默认 40）。
// A3 的线：每只每关过关率 ≥ 60%；没有一局卡死（没输也没得动）；没有一局超过 400 手。
// A4 只出报告：过关率、赢局手数中位、技能块用了几次、打开了几个障碍、带它时的三个结构数（规则 11 结构线：开不了的障碍 / 被堵的排列大格 / 死格）。
// 黄灯：机器人没拿真人校准过。用法：node test/a3_measure.js [每关几局] [--write]（--write 把报告存到 test/a4_report_seg1.txt）
// 过关率不到 60% 只标黄、不算没过：前两章的障碍要段 3 照规则 11 重摆（Cc 段 1 定：R-021 两条都留，关卡让路，段 3 做）。卡死、超 400 手是硬线。
const fs = require('fs'), path = require('path');
const PG = require('../js/petgame.js'), PLV = require('../js/petlevels.js'), core = require('../js/core.js');
const CELL = core.CELL, UNITS = core.UNITS;
const N = +process.argv.find((a) => /^\d+$/.test(a)) || 40;
const PETS5 = ['tongque', 'baozhu', 'modou', 'huli', 'lvgui'];
// 「打到这一关大概几级」：段 2 起照丹细设计第二节第 8 条第 8 项，用 economy.lvAt 的两套：专心养一只（默认）、平摊（--wide，五只都不超过 3 级）
// 原来照旧丹价 4/6/6/8… 和关卡表里的 st.dan 现算；段 2 丹价换成 100 颗满级、关卡表的丹数删了
const MODE = process.argv.includes('--wide') ? 'wide' : 'focus';
const LV_AT = require('../js/economy.js').lvAt(PLV, MODE);
const evoId = (id, lv) => (lv >= PG.EVO_LV ? PG.PETS[id].evo : id);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
// 规则 11 结构线：只带这只宠物时，开不了的障碍、被它们堵住的排列大格、死格
function structure(st, pet) {
  const b = []; st.board.forEach((row) => row.split('').forEach((ch) => b.push(ch)));
  const cant = (ch) => (ch === 'Z' && pet !== 'tongque') || (ch === 'D' && pet !== 'baozhu');
  const obs = b.filter(cant).length;
  const blocked = UNITS.map((u) => u.some((k) => cant(b[k]))), nBlocked = blocked.filter(Boolean).length;
  let dead = 0; for (let k = 0; k < 81; k++) { if (cant(b[k]) || b[k] === 'K') continue; const r = Math.floor(k / 9), c = k % 9; if (blocked[r] && blocked[9 + c] && blocked[18 + core.boxOf(r, c)]) dead++; }
  return { obs, nBlocked, dead };
}
let hard = 0; const warn = [], lines = [];
const out = (s) => { lines.push(s); console.log(s); };
out('A4 报告（段 1，黄灯；手熟机器人 skill 1，每关 ' + N + ' 局；宠物等级 = 打到这一关大概几级，段 2 起照 economy.lvAt「' + (MODE === 'wide' ? '平摊' : '专心') + '」）');
for (const pet of PETS5) {
  out('\n== 带 ' + PG.PETS[pet].name + ' ==');
  out('关  级  过关率  赢局手数中位  技能块/局  打开障碍/局  开不了的障碍 被堵排列大格 死格');
  PLV.forEach((st, li) => {
    const lv = LV_AT[li], id = evoId(pet, lv);
    let wins = 0, soft = 0, long = 0, skills = 0, opened = 0; const wm = [];
    for (let n = 0; n < N; n++) {
      const g = PG.createPetGame({ stage: st, team: [{ id, lv }], seed: 9000 + li * 977 + n * 31 + PETS5.indexOf(pet) * 7 });
      let guard = 0, stuckFree = true;
      while (!g.over && guard++ < 401) {
        if (PG.useSkillIfGood(g)) continue;
        const m = PG.bestMove(g, 1);
        if (!m) { if (g.hand[3]) { const s = PG.skillBest(g); if (s && g.useSkill(s)) continue; } stuckFree = false; break; }
        g.place(m.i, m.r, m.c);
      }
      if (!g.over && !stuckFree) soft++;
      if (g.moves > 400 || (!g.over && stuckFree)) long++;
      if (g.won) { wins++; wm.push(g.moves); }
      skills += g.skillUses || 0; opened += (g.monStats.metal || 0) + (g.monStats.dirt || 0);
    }
    const s = structure(st, pet), rate = Math.round((wins / N) * 100);
    out(String(li + 1).padStart(2) + '  ' + String(lv).padStart(2) + '  ' + String(rate).padStart(4) + '%  ' + String(med(wm)).padStart(8) + '      ' + (skills / N).toFixed(1).padStart(5) + '     ' + (opened / N).toFixed(1).padStart(5) + '        ' + s.obs + '            ' + s.nBlocked + '           ' + s.dead + (soft ? '  卡死 ' + soft : '') + (long ? '  超 400 手 ' + long : '') + (rate < 60 ? '  ← 黄：不到 60%' : ''));
    if (soft || long) hard++;
    if (rate < 60) warn.push(PG.PETS[pet].name + ' 第 ' + (li + 1) + ' 关 ' + rate + '%');
  });
}
out('\n过关率不到 60%（黄灯，段 3 重摆障碍）：' + (warn.length ? warn.length + ' 处：' + warn.join('、') : '没有'));
if (process.argv.includes('--write')) fs.writeFileSync(path.join(__dirname, 'a4_report_seg1.txt'), lines.join('\n') + '\n');
console.log(hard ? '✗ A3 硬线没过：' + hard + ' 处有卡死或超 400 手' : '✓ A3 硬线：五只宠物 × 20 关没有一局卡死、没有一局超过 400 手');
console.log((hard ? 0 : 1) + ' 项通过，' + (hard ? 1 : 0) + ' 项没过');
process.exit(hard ? 1 : 0);
