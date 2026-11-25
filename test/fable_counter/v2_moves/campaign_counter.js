// 【v2：技能块 + 克制 + 限手数 + 新的丹】
// 丹：头目关必掉 3 颗、难关和超难关必掉 2 颗；普通关六成的机会掉 1 颗，连着两关没掉、第三关一定掉；重打不掉。出战不再涨经验。
// 升级：到 5 级共 14 颗（2、3、4、5），到 10 级再 50 颗，到 15 级再 100 颗。5 级要打过进化关才算进化（技能块变大）；没进化就按 4 级的本事算。
// 保底：同一关连输 3 次，下一局发块放松、手数上限 ×1.4；连输 5 次 ×2。点名的关连输 2 次借你一只 3 级以上的。
// 克制规则的「从头打到尾」：聪明玩家 对 偷懒玩家（还有几种固定选法）× 手法 × N 遍。照 main.js 0.9.3 的真规矩（和 /tmp/jiancha_jgx/campaign2.js 一个算法）。
// 用法：node campaign_counter.js N [关卡表=../petlevels_counter.js] [规则 JSON] [选法,逗号分开=smart,lazy] [手法=8,7]
const path = require('path');
const PG = require('./petgame_counter.js');
const C = require('../../../js/config.js');
const FM = require('./fm_counter.js');
const N = +process.argv[2] || 24;
const PLV = require(path.resolve(process.argv[3] || __dirname + '/petlevels_counter_v2.js'));
if (process.argv[4]) { const r = JSON.parse(process.argv[4]); for (const k in r) { if (r[k] && typeof r[k] === 'object' && PG.RULES[k]) Object.assign(PG.RULES[k], r[k]); else PG.RULES[k] = r[k]; } }
const STRATS = (process.argv[5] || 'smart,lazy').split(',');
const SKS = (process.argv[6] || '8,7').split(',').map(Number);
const QUIET = !!process.env.QUIET;
const MAXTRY = 15, DROP = process.env.DROP === undefined ? 0.6 : +process.env.DROP, COSTK = +process.env.COSTK || 1;
const COST = [0, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]; // n 级升 n+1 级要几颗丹：到 5 级共 14 颗、到 10 级再 50 颗、到 15 级再 100 颗（和长线耐玩调研对齐）
const cost = (lv) => (lv < 15 ? Math.round(COST[lv] * COSTK) : Infinity);
const effLv = (rec) => (rec.lv >= 5 && !rec.evolved ? 4 : rec.lv);
const ownedOf = (save, id) => { if (!id) return null; if (save.pets[id]) return id; const e = PG.PETS[id] && PG.PETS[id].evo; return e && save.pets[e] ? e : null; };
// 这一关带谁最顺：关卡表写了 best 就用 best（best 可以是一个 id，也可以是按好坏排的几个）；没写就照克制表数
const bestList = (st) => (st.best && !process.env.NOBEST ? [].concat(st.best) : PG.bestPetFor(st).filter((x) => x.n > 0).map((x) => x.id));
const pickOwned = (save, st) => { for (const id of bestList(st)) { const o = ownedOf(save, id); if (o) return o; } return null; };
// nudge = 偷懒，但同一关连输两次就换上对口的
// strat: smart = 每关换最对口的，丹喂下一关要用的；lazy = 一直带第一只，丹全喂它；
//        swapOnly = 每关换最对口的，但丹全喂第一只；feedOnly = 一直带第一只，丹照聪明的喂；fix:<id> = 一直带这只（没拿到之前带第一只），丹全喂它
function runCampaign(skill, strat, seed0) {
  const save = { pets: {}, petOrder: [], activePet: null, gourd: 0, dan: 0, stage: 0, loss: {}, coins: 0 };
  const out = []; let seed = seed0, moves = 0; let rs = (seed0 * 2654435761) >>> 0; const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
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
      if (strat === 'nudge' && (save.loss[i] || 0) >= 2) { const b = pickOwned(save, st0); if (b) { act = b; rec.nudged = true; } }
      const borrow = strat === 'nudge' && rec.nudged ? 3 : 0; // 听劝的：结算页「请对口的来帮忙」，借一只 3 级的（自己的更高就用自己的） // 偷懒，但同一关连输两次就听劝换上对口的（只管这一关）
      let team = act ? [{ id: act, lv: Math.max(borrow, effLv(save.pets[act])) }] : [];
      if (st0.only) {
        const own = ownedOf(save, st0.only); let lv = own ? effLv(save.pets[own]) : 0;
        if (st0.lend && save.stage <= i) lv = Math.max(lv, st0.lend);
        if ((save.loss[i] || 0) >= 2) { lv = Math.max(lv, Math.max(3, Math.max(1, lv) + 2)); rec.lent = true; }
        team = [{ id: own || st0.only, lv: Math.max(1, lv) }];
      }
      const st1 = Object.assign({}, st0, { fastCharge: !!st0.fastCharge && save.stage <= i });
      if ((save.loss[i] || 0) >= 3) { st1.luck = 1; st1.d = (save.loss[i] || 0) >= 5 ? 0 : Math.max(0, (st0.d || 0) - 0.15); if (st0.moves) { st1.moves = Math.ceil(st0.moves * ((save.loss[i] || 0) >= 5 ? 2 : 1.4)); if ((save.loss[i] || 0) >= 8) delete st1.moves; } rec.eased = true; }
      if (i === 0 && tries === 1) st1.__tut = true;
      const g = FM.play(st1, team, (seed = (seed * 1103515245 + 12345) >>> 0), skill);
      moves += g.moves;
      const replay = i < save.stage;
      if (!g.won) rec[g.reason === 'moves' ? 'outMoves' : 'outStuck'] = (rec[g.reason === 'moves' ? 'outMoves' : 'outStuck'] || 0) + 1;
      if (g.won) {
        save.stage = Math.max(save.stage, i + 1);
        // 丹：头目关必掉 3 颗、难关和超难关必掉 2 颗；普通关 DROP（六成）的机会掉 1 颗，连着两关没掉、第三关一定掉。重打已经过的关不掉。
        if (!replay) { let n = 0; if (st0.goal.boss) n = 3; else if (st0.hard) n = 2; else if (rnd() < DROP || save.dry >= 2) n = 1; save.dry = n ? 0 : (save.dry || 0) + 1; save.dan += n; rec.danIn = n; save.danTotal = (save.danTotal || 0) + n; }
        if (st0.gift && !save.pets[st0.gift]) { save.pets[st0.gift] = { lv: 1, exp: 0 }; save.petOrder.push(st0.gift); if (!save.activePet) save.activePet = st0.gift; }
        delete save.loss[i]; win = g; break;
      } else { save.loss[i] = (save.loss[i] || 0) + 1; }
    }
    rec.tries = tries; rec.firstWin = tries === 1 && !!win; rec.stuck = !win; rec.allMoves = moves - m0;
    if (win) { rec.moves = win.moves; rec.petId = win.team[0] && win.team[0].id; rec.petLv = win.team[0] ? win.team[0].lv : 0; rec.uses = win.skillUses; rec.counter = win.monStats.counter || 0; rec.miss = win.monStats.petMiss || 0; rec.acts = Object.values(win.petActsTotal).reduce((a, b) => a + b, 0); }
    // 营地：一下升一级（丹够才升）。聪明：喂后面最近一关要用的那只
    let feedId = strat === 'swapFeedFirst' ? save.petOrder[0] : save.activePet;
    if (fix && ownedOf(save, fix)) feedId = ownedOf(save, fix);
    if (feedSmart) { for (let j = i + 1; j < Math.min(PLV.length, i + 4); j++) { const w = PLV[j].only ? ownedOf(save, PLV[j].only) : pickOwned(save, PLV[j]); if (w) { feedId = w; break; } } }
    while (feedId && save.dan >= cost(save.pets[feedId].lv)) { save.dan -= cost(save.pets[feedId].lv); save.pets[feedId].lv++; }
    for (const id of save.petOrder.slice()) {
      const d = PG.PETS[id];
      if (save.pets[id] && d.evoLv && !save.pets[id].evolved && save.pets[id].lv >= d.evoLv) {
        const evSt = PLV.evolveStage(id, d.color); let ok = false, t = 0;
        for (; t < MAXTRY && !ok; t++) { const eg = FM.play(evSt, [{ id, lv: 4 }], (seed = (seed * 1103515245 + 12345) >>> 0), skill); moves += eg.moves; ok = eg.won; rec.evoTries = (rec.evoTries || 0) + 1; rec.evoMoves = (rec.evoMoves || 0) + eg.moves; }
        if (ok) { save.pets[id].evolved = true; if (d.evo) { save.pets[d.evo] = save.pets[id]; delete save.pets[id]; save.petOrder = save.petOrder.map((x) => (x === id ? d.evo : x)); if (save.activePet === id) save.activePet = d.evo; } }
      }
    }
    rec.lvs = Object.keys(save.pets).map((id) => id.slice(0, 2) + save.pets[id].lv).join(' ');
    rec.danLeft = save.dan;
    out.push(rec);
  }
  return { out, moves, dan: save.danTotal || 0, pets: JSON.parse(JSON.stringify(save.pets)) };
}
const SKN = { 7: '生手', 8: '一般人', 9: '盯目标' };
const res = {};
for (const sk of SKS) for (const strat of STRATS) {
  const key = strat + '·' + SKN[sk]; const runs = [];
  for (let r = 0; r < N; r++) runs.push(runCampaign(sk, strat, 1000 + r * 7919));
  const L = PLV.map((st, i) => {
    const rs = runs.map((x) => x.out[i]); const avg = (f) => rs.reduce((a, x) => a + f(x), 0) / rs.length;
    const pc = {}; rs.forEach((x) => { if (x.petId) pc[x.petId] = (pc[x.petId] || 0) + 1; });
    return { lv: i + 1, outMoves: +avg((x) => x.outMoves || 0).toFixed(2), outStuck: +avg((x) => x.outStuck || 0).toFixed(2), uses: +avg((x) => x.uses || 0).toFixed(1), first: Math.round(rs.filter((x) => x.firstWin).length / rs.length * 100), tries: +avg((x) => x.tries).toFixed(2), maxTries: Math.max(...rs.map((x) => x.tries)), stuck: rs.filter((x) => x.stuck).length, eased: rs.filter((x) => x.eased).length, lent: rs.filter((x) => x.lent).length,
      winMoves: +avg((x) => x.moves).toFixed(1), allMoves: +avg((x) => x.allMoves).toFixed(1), evo: +avg((x) => x.evoMoves || 0).toFixed(1), pet: Object.keys(pc).sort((a, b) => pc[b] - pc[a])[0] || '', petLv: +avg((x) => x.petLv || 0).toFixed(1), counter: +avg((x) => x.counter || 0).toFixed(1), miss: +avg((x) => x.miss || 0).toFixed(1), acts: +avg((x) => x.acts || 0).toFixed(1) };
  });
  const tot = (f) => runs.reduce((a, x) => a + f(x), 0) / runs.length;
  const mv = runs.map((x) => x.moves).sort((a, b) => a - b), tr = runs.map((x) => x.out.reduce((a, o) => a + o.tries, 0));
  const fin = {}; runs.forEach((x) => { for (const id in x.pets) fin[id] = (fin[id] || 0) + x.pets[id].lv / runs.length; });
  res[key] = { dan: +tot((x) => x.dan).toFixed(1), L, tries: +tot((x) => x.out.reduce((a, o) => a + o.tries, 0)).toFixed(2), moves: +tot((x) => x.moves).toFixed(1), movesP10: mv[Math.floor(N * 0.1)], movesP90: mv[Math.floor(N * 0.9)], stuckRuns: runs.filter((x) => x.out.some((o) => o.stuck)).length, maxTries: Math.max(...L.map((x) => x.maxTries)), finalLv: fin, runMoves: runs.map((x) => x.moves), runTries: tr };
  console.log(`${key} N=${N} 总局数 ${res[key].tries} 总手数 ${res[key].moves}（一成最少 ${res[key].movesP10}，一成最多 ${res[key].movesP90}） 一共拿到 ${res[key].dan} 颗丹 卡死的遍 ${res[key].stuckRuns} 单关最多打 ${res[key].maxTries} 次 最后等级 ${Object.keys(fin).map((id) => id.slice(0, 2) + fin[id].toFixed(1)).join(' ')}`);
  { const bad = L.filter((x) => x.stuck || x.maxTries >= 9); if (bad.length) console.log('  !! 打得最多的关: ' + bad.map((x) => `第${x.lv}关 最多${x.maxTries}次 平均${x.tries} 卡死${x.stuck}遍`).join('；')); }
  if (!QUIET) {
    console.log('  带谁:     ' + L.map((x) => (x.pet || '--').slice(0, 2)).join(' '));
    console.log('  等级:     ' + L.map((x) => x.petLv.toFixed(0)).join('  '));
    console.log('  一次过%:  ' + L.map((x) => x.first).join(' '));
    console.log('  平均几次: ' + L.map((x) => x.tries).join(' '));
    console.log('  总手数:   ' + L.map((x) => x.allMoves.toFixed(0)).join(' '));
    console.log('  输在手数: ' + L.map((x) => x.outMoves).join(' '));
    console.log('  输在堵死: ' + L.map((x) => x.outStuck).join(' '));
    console.log('  技能几次: ' + L.map((x) => x.uses).join(' '));
  }
}
const sm = (sk) => res['smart·' + SKN[sk]], lz = (sk) => res['lazy·' + SKN[sk]];
for (const sk of SKS) if (sm(sk) && lz(sk)) {
  const a = sm(sk), b = lz(sk);
  console.log(`== ${SKN[sk]}：聪明比偷懒 少打 ${((1 - a.tries / b.tries) * 100).toFixed(1)}% 的局、少 ${((1 - a.moves / b.moves) * 100).toFixed(1)}% 的手`);
  if (!QUIET) console.log('  每关偷懒多几手: ' + a.L.map((x, i) => (b.L[i].allMoves + b.L[i].evo - x.allMoves - x.evo).toFixed(0)).join(' '));
}
if (process.env.OUT) require('fs').writeFileSync(process.env.OUT, JSON.stringify(res, null, 1));
