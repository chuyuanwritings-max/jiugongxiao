// Fable 的手感测量（2026-11-24）：在 tune_level.js 的基础上多量几样「爽不爽」的数。不改 js/ 里的游戏代码。
// 量：赢率、赢的那局几手（平均 / 最少 / 最多的一成）、几成的手有消、最长几手没消、第几手第一次消、第几手第一次收到目标、宠物出手几次。
// 用法 1（整张表）：node test/fable_measure.js [关卡表路径=../js/petlevels.js] [从第几关=1] [到第几关=30] [每种几局=80]
// 用法 2（单关试改法）：node -e "const M=require('./test/fable_measure.js'); M.tune(1, [], [['现在',{}],['改法',{...}]], '../js/petlevels.js')"
const path = require('path');
const PG = require(__dirname + '/../js/petgame.js');
const core = require(__dirname + '/../js/core.js');

// 每关带谁、几级：照 0.9「从头打到尾」里「手很生 · 聪明玩家」量到的平均等级（campaign_0.9.txt）
const TEAM = [null, null, null, ['tongque', 1], ['tongque', 2], ['tongque', 3], ['tongque', 3], ['tongque', 4], ['tongque', 4], ['tongque', 4],
  ['baozhu', 2], ['jinchique', 5], ['jinchique', 5], ['baozhu', 2], ['baozhu', 3], ['baozhu', 3], ['modou', 2], ['jinchique', 6], ['jinchique', 6], ['jinchique', 6],
  ['baozhu', 4], ['jinchique', 7], ['modou', 3], ['modou', 3], ['baozhu', 4], ['qilin', 2], ['baozhu', 5], ['modou', 4], ['jinchique', 7], ['jinchique', 7]];
const teamOf = (i) => (TEAM[i] ? [{ id: TEAM[i][0], lv: TEAM[i][1] }] : []);

// 盯目标 = 每手都奔着目标（真人认真打的下限）；一般人 = 六成的手奔着目标、四成随手放个还行的位置；生手 = 四成奔目标、三成还行、三成乱放。
// 后三种是游戏自带的机器人（上一轮平衡测试用的），留着对照。
const SKILLS = [['盯目标', 9], ['一般人', 8], ['生手', 7], ['旧·普通', 0.5], ['旧·手很生', 0.25], ['旧·新手', -0.4]];
// 「盯着目标打的人」：每一手都挑离目标最近的摆法（先收得到的，再把目标所在的排往满里凑），不乱放。
// 游戏自带的机器人不会「往目标那排凑」，所以它量出来的手数比认真的真人多得多（Cc 第 2 关 3 手打完，自带机器人要 13–16 手）。这个机器人量的是「真人最快几手」。
function seekMove(g) {
  const U = core.UNITS, left = core.goalLeft(g);
  const wantMon = left.monster > 0 || left.all > 0;
  const isT = (b, k, gem) => (gem[k] && left[core.GEMS[gem[k]].id] > 0 && b[k]) || (b[k] === 3 && wantMon) || (b[k] === 2 && left.box > 0) || (b[k] === 4 && left.boss > 0);
  const cands = [];
  g.hand.forEach((p, i) => {
    if (!p || p.special) return;
    for (const [r, c] of core.placements(g.board, p)) {
      const res = core.placeAndClear(g.board, p, r, c);
      const gem = g.gem.slice();
      const hg = g.handGem && g.handGem[i];
      if (hg) gem[(r + p.cells[hg.cell][0]) * 9 + c + p.cells[hg.cell][1]] = hg.kind;
      const full = g.board.slice(); p.cells.forEach(([dr, dc]) => (full[(r + dr) * 9 + c + dc] = 1));
      let v = res.units.length * (left.rock > 0 || left.acts > 0 || left.score > 0 ? 40 : 8);
      for (const k of res.cells) if (isT(full, k, gem)) v += 100;
      for (const u of res.units) if (U[u].some((k) => (g.board[k] === 2 && left.box > 0) || (g.board[k] === 4 && left.boss > 0))) v += 100;
      for (const k of res.cells) gem[k] = 0;
      for (let u = 0; u < 27; u++) { if (!U[u].some((k) => isT(res.board, k, gem))) continue; const n = U[u].filter((k) => res.board[k]).length; v += n * n * 0.5; }
      v += core.evalBoard(res.board, null);
      cands.push({ i, r, c, v, board: res.board });
    }
  });
  if (!cands.length) return null;
  cands.sort((a, b) => b.v - a.v);
  const top = cands.slice(0, 8);
  for (const m of top) { const rest = g.hand.filter((p, k) => p && k !== m.i && !p.special); if (rest.length && !core.solvable(m.board, rest)) m.v -= 1000; else if (g.previewN && g.nextHand && rest.length < 3) { const look = rest.concat(g.nextHand.slice(0, Math.min(g.previewN, 3 - rest.length))); if (look.length > rest.length && !core.solvable(m.board, look)) m.v -= 500; } if (g.previewN && g.nextHand && PG.RULES.previewPlan) { let bonus = 0; for (const q of g.nextHand.slice(0, g.previewN)) { let mx = 0; for (const [r2, c2] of core.placements(m.board, q)) { const u2 = core.placeAndClear(m.board, q, r2, c2).units.length; if (u2 > mx) mx = u2; } bonus += mx; } m.v += bonus * PG.RULES.previewPlan; } }
  top.sort((a, b) => b.v - a.v);
  return top[0];
}

function goalHave(g) { let h = 0; for (const k in g.stage.goal) { if (k === 'score') continue; if (k === 'all') { h -= g.monLeft || 0; continue; } if (k === 'boss') { h -= g.bigHp; continue; } h += g.got[k] || 0; } return h; }

function play(st, team, seed, skill) {
  const g = PG.createPetGame({ stage: st, team, seed, tutorial: !!st.__tut }); // 第 1 关第一次打：第一组发的是教学那三块（3×3、5 长条、4 长条），照 main.js
  const log = { firstClear: 0, firstGoal: 0, goalMoves: [] };
  let guard = 0, have = goalHave(g);
  while (!g.over && guard++ < 900) {
    if (PG.useSkillIfGood(g)) { const h3 = goalHave(g); if (h3 > have) { if (!log.firstGoal) log.firstGoal = g.moves; log.goalMoves.push(g.moves); } have = h3; continue; }
    let m;
    if (skill === 8) m = g.rand() < 0.6 ? seekMove(g) : PG.bestMove(g, 0.25);
    else if (skill === 7) { const x = g.rand(); if (x < 0.4) m = seekMove(g); else if (x < 0.7) m = PG.bestMove(g, 0.25); else { const all = []; g.hand.forEach((p, i) => { if (p && !p.special) for (const [r, c] of core.placements(g.board, p)) all.push({ i, r, c }); }); m = all.length ? all[Math.floor(g.rand() * all.length)] : null; } }
    else if (skill < 0 && g.rand() < -skill) {
      const all = [];
      g.hand.forEach((p, i) => { if (p && !p.special) for (const [r, c] of core.placements(g.board, p)) all.push({ i, r, c }); });
      m = all.length ? all[Math.floor(g.rand() * all.length)] : null;
    } else m = skill === 9 ? seekMove(g) : PG.bestMove(g, skill < 0 ? 0.25 : skill);
    if (!m) { if (g.hand[3]) { const s2 = PG.skillBest(g); if (s2 && g.useSkill(s2)) continue; } break; }
    const ev = g.place(m.i, m.r, m.c);
    if (ev && (ev.units.length || ev.petActs.length) && !log.firstClear) log.firstClear = g.moves;
    const h2 = goalHave(g);
    if (h2 > have) { if (!log.firstGoal) log.firstGoal = g.moves; log.goalMoves.push(g.moves); }
    have = h2;
  }
  g.log = log;
  return g;
}

function measure(st, team, skill, N) {
  const wins = [];
  let w = 0;
  for (let s = 1; s <= N; s++) { const g = play(st, team, s * 7919 + 3, skill); if (g.won) { w++; wins.push(g); } }
  const avg = (f) => (wins.length ? wins.reduce((a, g) => a + f(g), 0) / wins.length : 0);
  const mv = wins.map((g) => g.moves).sort((a, b) => a - b);
  return {
    win: Math.round((w / N) * 100),
    moves: avg((g) => g.moves),
    lo: mv.length ? mv[Math.floor(mv.length * 0.1)] : 0,
    hi: mv.length ? mv[Math.floor(mv.length * 0.9)] : 0,
    clear: avg((g) => g.playStats.clearMoves / Math.max(1, g.moves)) * 100,
    dry: avg((g) => g.playStats.maxDry),
    firstClear: avg((g) => g.log.firstClear),
    firstGoal: avg((g) => g.log.firstGoal),
    acts: avg((g) => Object.values(g.petActsTotal).reduce((a, b) => a + b, 0)),
  };
}
const fmtS = (m) => `${String(m.win).padStart(3)}% ${m.moves.toFixed(0).padStart(2)}手`;
const fmt = (m) => `${String(m.win).padStart(3)}% ${m.moves.toFixed(0).padStart(2)}手(${m.lo}–${m.hi}) 消${m.clear.toFixed(0)}% 旱${m.dry.toFixed(1)} 首消${m.firstClear.toFixed(1)} 首收${m.firstGoal.toFixed(1)} 宠${m.acts.toFixed(1)}`;

function table(file, from, to, N) {
  const PLV = require(path.resolve(__dirname, file));
  console.log(`${file}  每种 ${N} 局｜赢率 平均手数(最少一成–最多一成) 几成手有消 最长几手没消 第几手第一次消 第几手第一次收到目标 宠物出手`);
  for (let i = from - 1; i < Math.min(to, PLV.length); i++) {
    const st = i === 0 ? Object.assign({ __tut: true }, PLV[i]) : PLV[i], team = st.only ? [{ id: st.only, lv: Math.max(st.lend || 0, TEAM[i] && TEAM[i][0] === st.only ? TEAM[i][1] : TEAM[i] ? TEAM[i][1] : 1) }] : teamOf(i);
    const kind = st.goal.boss ? '头目' : st.hard === 2 ? '超难' : st.hard === 1 ? '难' : st.only ? '专属' : '';
    console.log(`第${String(i + 1).padStart(2)}关 ${kind.padEnd(2, '　')} ${JSON.stringify(st.goal)} ${team.map((t) => PG.PETS[t.id].name + t.lv).join('') || '无宠物'}`);
    console.log('    ' + SKILLS.slice(0, 3).map(([name, sk]) => name + ' ' + fmt(measure(st, team, sk, N))).join('\n    '));
    console.log('    ' + SKILLS.slice(3).map(([name, sk]) => name + ' ' + fmtS(measure(st, team, sk, N))).join('  '));
  }
}
function tune(i, team, variants, file, N) {
  const PLV = require(path.resolve(__dirname, file || '../js/petlevels.js'));
  const tm = team || teamOf(i);
  console.log(`第${i + 1}关 带${tm.map((t) => PG.PETS[t.id].name + t.lv).join('') || '无'}`);
  for (const [name, mod] of variants) {
    const st = Object.assign(i === 0 ? { __tut: true } : {}, PLV[i] || {}, mod);
    console.log('  ' + name);
    console.log('    ' + SKILLS.slice(0, 3).map(([sn, sk]) => sn + ' ' + fmt(measure(st, tm, sk, N || 60))).join('\n    '));
    console.log('    ' + SKILLS.slice(3).map(([sn, sk]) => sn + ' ' + fmtS(measure(st, tm, sk, N || 60))).join('  '));
  }
}
module.exports = { table, tune, measure, play, teamOf, TEAM, fmt };
if (require.main === module) table(process.argv[2] || '../js/petlevels.js', +process.argv[3] || 1, +process.argv[4] || 30, +process.argv[5] || 80);
