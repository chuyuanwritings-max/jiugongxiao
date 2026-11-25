// 克制规则的「从头打到尾」：聪明玩家 对 偷懒玩家（还有几种固定选法）× 手法 × N 遍。照 main.js 0.9.3 的真规矩（和 /tmp/jiancha_jgx/campaign2.js 一个算法）。
// 用法：node campaign_counter.js N [关卡表=../petlevels_counter.js] [规则 JSON] [选法,逗号分开=smart,lazy] [手法=8,7]
const path = require('path');
const PG = require('./petgame_counter.js');
const C = require('../../../js/config.js');
const FM = require('./fm_counter.js');
const N = +process.argv[2] || 24;
const PLV = require(path.resolve(process.argv[3] || __dirname + '/petlevels_counter_v1.js'));
if (process.argv[4]) { const r = JSON.parse(process.argv[4]); for (const k in r) { if (r[k] && typeof r[k] === 'object' && PG.RULES[k]) Object.assign(PG.RULES[k], r[k]); else PG.RULES[k] = r[k]; } }
const STRATS = (process.argv[5] || 'smart,lazy').split(',');
const SKS = (process.argv[6] || '8,7').split(',').map(Number);
const QUIET = !!process.env.QUIET;
const EXP_NEED = [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 999], DAN_EXP = 2, MAXTRY = 12;
function addExp(rec, n) { rec.exp += n; let up = 0; while (rec.lv < 10 && rec.exp >= EXP_NEED[rec.lv]) { rec.exp -= EXP_NEED[rec.lv]; rec.lv++; up++; } return up; }
const ownedOf = (save, id) => { if (!id) return null; if (save.pets[id]) return id; const e = PG.PETS[id] && PG.PETS[id].evo; return e && save.pets[e] ? e : null; };
const danToLevel = (rec) => (rec.lv < 10 ? Math.ceil((EXP_NEED[rec.lv] - rec.exp) / DAN_EXP) : Infinity);
// 这一关带谁最顺：关卡表写了 best 就用 best（best 可以是一个 id，也可以是按好坏排的几个）；没写就照克制表数
const bestList = (st) => (st.best && !process.env.NOBEST ? [].concat(st.best) : PG.bestPetFor(st).filter((x) => x.n > 0).map((x) => x.id));
const pickOwned = (save, st) => { for (const id of bestList(st)) { const o = ownedOf(save, id); if (o) return o; } return null; };
// nudge = 偷懒，但同一关连输两次就换上对口的
// strat: smart = 每关换最对口的，丹喂下一关要用的；lazy = 一直带第一只，丹全喂它；
//        swapOnly = 每关换最对口的，但丹全喂第一只；feedOnly = 一直带第一只，丹照聪明的喂；fix:<id> = 一直带这只（没拿到之前带第一只），丹全喂它
function runCampaign(skill, strat, seed0) {
  const save = { pets: {}, petOrder: [], activePet: null, gourd: 0, dan: 0, stage: 0, loss: {}, coins: 0 };
  const out = []; let seed = seed0, moves = 0;
  const swap = strat === 'smart' || strat === 'swapOnly' || strat === 'swapFeedFirst', feedSmart = strat === 'smart' || strat === 'feedOnly';
  const fix = strat.startsWith('fix:') ? strat.slice(4) : null;
  for (let i = 0; i < PLV.length; i++) {
    const st0 = PLV[i];
    if (swap) { const b = pickOwned(save, st0); if (b) save.activePet = b; }
    if (fix && ownedOf(save, fix)) save.activePet = ownedOf(save, fix);
    let tries = 0, win = null; const m0 = moves;
    const rec = { tries: 0, firstWin: false, moves: 0, lent: false, eased: false };
    while (tries < MAXTRY) {
      tries++;
      let act = save.activePet;
      if (strat === 'nudge' && (save.loss[i] || 0) >= 2) { const b = pickOwned(save, st0); if (b) { act = b; rec.nudged = true; } } // 偷懒，但同一关连输两次就听劝换上对口的（只管这一关）
      let team = act ? [{ id: act, lv: save.pets[act].lv }] : [];
      if (st0.only) {
        const own = ownedOf(save, st0.only); let lv = own ? save.pets[own].lv : 0;
        if (st0.lend && save.stage <= i) lv = Math.max(lv, st0.lend);
        if ((save.loss[i] || 0) >= 2) { lv = Math.max(lv, Math.max(3, Math.max(1, lv) + 2)); rec.lent = true; }
        team = [{ id: own || st0.only, lv: Math.max(1, lv) }];
      }
      const st1 = Object.assign({}, st0, { fastCharge: !!st0.fastCharge && save.stage <= i });
      if ((save.loss[i] || 0) >= 3) { st1.luck = 1; st1.d = Math.max(0, (st0.d || 0) - 0.15); rec.eased = true; }
      if (i === 0 && tries === 1) st1.__tut = true;
      const g = FM.play(st1, team, (seed = (seed * 1103515245 + 12345) >>> 0), skill);
      moves += g.moves;
      const replay = i < save.stage;
      g.team.forEach((pt) => { const r = save.pets[pt.id]; if (!r) return; let gain = Math.min(5, g.petActsTotal[pt.id] || 0) + (g.won ? 3 : 1); if (replay) gain = Math.max(1, Math.floor(gain / 2)); if (st0.only && g.won && !replay && ownedOf(save, st0.only) === pt.id) gain *= 2; if (process.env.EXPK) gain = Math.max(1, Math.round(gain * +process.env.EXPK)); addExp(r, gain); });
      save.gourd += g.caught;
      const auto = Math.floor(save.gourd / 2); save.dan += auto; save.gourd -= auto * 2;
      if (g.won) {
        save.stage = Math.max(save.stage, i + 1);
        if (st0.gift && !save.pets[st0.gift]) { save.pets[st0.gift] = { lv: 1, exp: 0 }; save.petOrder.push(st0.gift); if (!save.activePet) save.activePet = st0.gift; }
        if (save.petOrder.length && !replay) save.dan++;
        if (st0.only && !replay) save.dan++;
        delete save.loss[i]; win = g; break;
      } else { save.loss[i] = (save.loss[i] || 0) + 1; }
    }
    rec.tries = tries; rec.firstWin = tries === 1 && !!win; rec.stuck = !win; rec.allMoves = moves - m0;
    if (win) { rec.moves = win.moves; rec.petId = win.team[0] && win.team[0].id; rec.petLv = win.team[0] ? win.team[0].lv : 0; rec.counter = win.monStats.counter || 0; rec.miss = win.monStats.petMiss || 0; rec.acts = Object.values(win.petActsTotal).reduce((a, b) => a + b, 0); }
    // 营地：一下升一级（丹够才升）。聪明：喂后面最近一关要用的那只
    let feedId = strat === 'swapFeedFirst' ? save.petOrder[0] : save.activePet;
    if (fix && ownedOf(save, fix)) feedId = ownedOf(save, fix);
    if (feedSmart) { for (let j = i + 1; j < Math.min(PLV.length, i + 4); j++) { const w = PLV[j].only ? ownedOf(save, PLV[j].only) : pickOwned(save, PLV[j]); if (w) { feedId = w; break; } } }
    while (feedId && save.dan >= danToLevel(save.pets[feedId])) { const c = danToLevel(save.pets[feedId]); save.dan -= c; addExp(save.pets[feedId], c * DAN_EXP); }
    for (const id of save.petOrder.slice()) {
      const d = PG.PETS[id];
      if (d.evo && save.pets[id] && save.pets[id].lv >= d.evoLv) {
        const evSt = PLV.evolveStage(id, d.color); let ok = false, t = 0;
        for (; t < MAXTRY && !ok; t++) { const eg = FM.play(evSt, [{ id, lv: save.pets[id].lv }], (seed = (seed * 1103515245 + 12345) >>> 0), skill); moves += eg.moves; ok = eg.won; rec.evoTries = (rec.evoTries || 0) + 1; rec.evoMoves = (rec.evoMoves || 0) + eg.moves; }
        if (ok) { save.pets[d.evo] = save.pets[id]; delete save.pets[id]; save.petOrder = save.petOrder.map((x) => (x === id ? d.evo : x)); if (save.activePet === id) save.activePet = d.evo; }
      }
    }
    rec.lvs = Object.keys(save.pets).map((id) => id.slice(0, 2) + save.pets[id].lv).join(' ');
    rec.danLeft = save.dan;
    out.push(rec);
  }
  return { out, moves, pets: JSON.parse(JSON.stringify(save.pets)) };
}
const SKN = { 7: '生手', 8: '一般人', 9: '盯目标' };
const res = {};
for (const sk of SKS) for (const strat of STRATS) {
  const key = strat + '·' + SKN[sk]; const runs = [];
  for (let r = 0; r < N; r++) runs.push(runCampaign(sk, strat, 1000 + r * 7919));
  const L = PLV.map((st, i) => {
    const rs = runs.map((x) => x.out[i]); const avg = (f) => rs.reduce((a, x) => a + f(x), 0) / rs.length;
    const pc = {}; rs.forEach((x) => { if (x.petId) pc[x.petId] = (pc[x.petId] || 0) + 1; });
    return { lv: i + 1, first: Math.round(rs.filter((x) => x.firstWin).length / rs.length * 100), tries: +avg((x) => x.tries).toFixed(2), maxTries: Math.max(...rs.map((x) => x.tries)), stuck: rs.filter((x) => x.stuck).length, eased: rs.filter((x) => x.eased).length, lent: rs.filter((x) => x.lent).length,
      winMoves: +avg((x) => x.moves).toFixed(1), allMoves: +avg((x) => x.allMoves).toFixed(1), evo: +avg((x) => x.evoMoves || 0).toFixed(1), pet: Object.keys(pc).sort((a, b) => pc[b] - pc[a])[0] || '', petLv: +avg((x) => x.petLv || 0).toFixed(1), counter: +avg((x) => x.counter || 0).toFixed(1), miss: +avg((x) => x.miss || 0).toFixed(1), acts: +avg((x) => x.acts || 0).toFixed(1) };
  });
  const tot = (f) => runs.reduce((a, x) => a + f(x), 0) / runs.length;
  const mv = runs.map((x) => x.moves).sort((a, b) => a - b), tr = runs.map((x) => x.out.reduce((a, o) => a + o.tries, 0));
  const fin = {}; runs.forEach((x) => { for (const id in x.pets) fin[id] = (fin[id] || 0) + x.pets[id].lv / runs.length; });
  res[key] = { L, tries: +tot((x) => x.out.reduce((a, o) => a + o.tries, 0)).toFixed(2), moves: +tot((x) => x.moves).toFixed(1), movesP10: mv[Math.floor(N * 0.1)], movesP90: mv[Math.floor(N * 0.9)], stuckRuns: runs.filter((x) => x.out.some((o) => o.stuck)).length, maxTries: Math.max(...L.map((x) => x.maxTries)), finalLv: fin, runMoves: runs.map((x) => x.moves), runTries: tr };
  console.log(`${key} N=${N} 总局数 ${res[key].tries} 总手数 ${res[key].moves}（一成最少 ${res[key].movesP10}，一成最多 ${res[key].movesP90}） 卡死的遍 ${res[key].stuckRuns} 单关最多打 ${res[key].maxTries} 次 最后等级 ${Object.keys(fin).map((id) => id.slice(0, 2) + fin[id].toFixed(1)).join(' ')}`);
  { const bad = L.filter((x) => x.stuck || x.maxTries >= 7); if (bad.length) console.log('  !! 打得最多的关: ' + bad.map((x) => `第${x.lv}关 最多${x.maxTries}次 平均${x.tries} 卡死${x.stuck}遍`).join('；')); }
  if (!QUIET) {
    console.log('  带谁:     ' + L.map((x) => (x.pet || '--').slice(0, 2)).join(' '));
    console.log('  等级:     ' + L.map((x) => x.petLv.toFixed(0)).join('  '));
    console.log('  一次过%:  ' + L.map((x) => x.first).join(' '));
    console.log('  平均几次: ' + L.map((x) => x.tries).join(' '));
    console.log('  总手数:   ' + L.map((x) => x.allMoves.toFixed(0)).join(' '));
  }
}
const sm = (sk) => res['smart·' + SKN[sk]], lz = (sk) => res['lazy·' + SKN[sk]];
for (const sk of SKS) if (sm(sk) && lz(sk)) {
  const a = sm(sk), b = lz(sk);
  console.log(`== ${SKN[sk]}：聪明比偷懒 少打 ${((1 - a.tries / b.tries) * 100).toFixed(1)}% 的局、少 ${((1 - a.moves / b.moves) * 100).toFixed(1)}% 的手`);
  if (!QUIET) console.log('  每关偷懒多几手: ' + a.L.map((x, i) => (b.L[i].allMoves + b.L[i].evo - x.allMoves - x.evo).toFixed(0)).join(' '));
}
if (process.env.OUT) require('fs').writeFileSync(process.env.OUT, JSON.stringify(res, null, 1));
