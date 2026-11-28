// 11-28 Cc 定 B「大头目跳走，周围一圈也踩」：落脚 4 格 + 外面一圈的方块都踩碎；外面一圈的墨怪、金属、土堆不动
const PG = require('../js/petgame.js'), PLV = require('../js/petlevels.js'), core = require('../js/core.js'), C = core.CELL;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
const li = PLV.findIndex((st) => st.goal && st.goal.boss);
const g = PG.createPetGame({ stage: PLV[li], team: [{ id: 'tongque', lv: 3 }], seed: 7 });
g.openingAct(); // 段 3：新第 10 关头目开局写在左上角、开局先跳到盘中间；先演完，左上角才是「离头目远的落脚点」
const b = g.board;
// 找一个离头目远的落脚点：左上角 (1,1)，外圈是第 0–3 行、第 0–3 列
const tl = 1 * 9 + 1, land = [tl, tl + 1, tl + 9, tl + 10];
for (let r = 0; r <= 3; r++) for (let c = 0; c <= 3; c++) { const k = r * 9 + c; if (!g.bigCells.includes(k)) { b[k] = C.BLOCK; g.color[k] = 1; } }
b[0] = C.METAL; b[3] = C.DIRT; b[27] = C.MON; g.mon[27] = { t: 'ink', hp: 0, col: -1 };
g.boss.jumpTo = tl; g.boss.planMove = -1;
// 随便放一块（放在右下，不碰左上），让头目这一手跳
const i = [0, 1, 2].find((j) => g.hand[j] && core.placements(g.board, g.hand[j]).some(([r, c]) => r >= 5 && c >= 5));
const at = core.placements(g.board, g.hand[i]).find(([r, c]) => r >= 5 && c >= 5);
const ev = g.place(i, at[0], at[1]);
const nb = g.board;
ok(ev && ev.bossJump && ev.bossJump.to === tl, '头目跳到了左上角 (1,1)');
ok(land.every((k) => nb[k] === C.BOSS), '落脚 4 格是头目');
const ringBlocks = [1, 2, 9, 12, 18, 21, 28, 29, 30].filter((k) => !land.includes(k));
ok(ringBlocks.every((k) => nb[k] === C.EMPTY), '外面一圈的方块都踩碎了（' + ringBlocks.filter((k) => nb[k] !== C.EMPTY).length + ' 格没碎）');
ok(nb[0] === C.METAL && nb[3] === C.DIRT, '外面一圈的金属、土堆不动');
ok(nb[27] === C.MON, '外面一圈的墨怪不动（不替你抓怪）');
ok((ev.bossJump.crushed || []).length >= 8, '踩碎的格子记在 ev.bossJump.crushed（' + (ev.bossJump.crushed || []).length + ' 格），画面照它演');
console.log(pass + ' 项通过，' + fail + ' 项没过'); process.exit(fail ? 1 : 0);
