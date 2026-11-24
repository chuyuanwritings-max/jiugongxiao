// 从头打到尾的玩家模拟（0.9）：Cc 11-24「宠物强度跟 boss 难度你得测试一下呀，你这不能自己瞎编啊」。
// 机器人从第 1 关打到第 30 关，照游戏里的真规矩拿奖励、长经验、炼丹、喂宠物、进化、换出战宠物（规矩照抄 main.js 的 endPet / feedPet / levelTeam）。
// 每关一直打到过（最多 12 次）；输两次的专属关会借一只。两种玩家 × 三种手法，各跑 N 遍，量：
//   第一次就过的比例、平均打几次、赢的那局几手、宠物出手几次、几成的手有消、最长几手没消、头目的心谁打掉的、宠物几级。
// 用法：node test/campaign.js [每种跑几遍=16] [只量第几关起=1]
const PG = require('../js/petgame.js');
const PLV = require(process.env.PLV || './petlevels_fable.js'); // Fable：读自己的关卡表（PLV=../js/petlevels.js 就是量现在的）
const FM = require('./fable_measure.js');
const N = +process.argv[2] || 16;
const EXP_NEED = [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 999];
const DAN_EXP = 2;
const MAXTRY = 12;
const core = require('../js/core.js');
// 一局：skill < 0 表示「新手」：有 -skill 的机会随手乱放（随便挑一个放得下的位置），其余照手很生（0.25）下
function play(opts) {
  if (opts.skill >= 7) return FM.play(opts.stage, opts.team, opts.seed, opts.skill); // 7 生手 / 8 一般人 / 9 盯目标（见 fable_measure.js）
  if (opts.skill >= 0) return PG.simulate(opts);
  const g = PG.createPetGame(opts);
  let guard = 0;
  while (!g.over && guard++ < 400) {
    let m;
    if (g.rand() < -opts.skill) {
      const all = [];
      g.hand.forEach((p, i) => { if (p) for (const [r, c] of core.placements(g.board, p)) all.push({ i, r, c }); });
      m = all.length ? all[Math.floor(g.rand() * all.length)] : null;
    } else m = PG.bestMove(g, 0.25);
    if (!m) break;
    g.place(m.i, m.r, m.c);
  }
  return g;
}

function addExp(rec, n) { rec.exp += n; while (rec.lv < 10 && rec.exp >= EXP_NEED[rec.lv]) { rec.exp -= EXP_NEED[rec.lv]; rec.lv++; } }
const ownedOf = (save, id) => { if (!id) return null; if (save.pets[id]) return id; const e = PG.PETS[id] && PG.PETS[id].evo; return e && save.pets[e] ? e : null; };

function runCampaign(skill, smart, seed0) {
  const save = { pets: {}, petOrder: [], activePet: null, gourd: 0, dan: 0, stage: 0, loss: {} };
  const out = [];
  let seed = seed0;
  for (let i = 0; i < PLV.length; i++) {
    const st0 = PLV[i];
    // 聪明的玩家：进关前把「带它最顺」的那只换上；懒的玩家一直带第一只
    if (smart && st0.best && ownedOf(save, st0.best)) save.activePet = ownedOf(save, st0.best);
    let tries = 0, win = null, lent = false;
    const rec = { i, tries: 0, firstWin: false, moves: 0, acts: 0, petLv: 0, petId: null, clearRate: 0, maxDry: 0, bossP: 0, bossPet: 0, bossAct: 0, losses: [] };
    while (tries < MAXTRY) {
      tries++;
      // 进关带谁（照 levelTeam）
      let team = save.activePet ? [{ id: save.activePet, lv: save.pets[save.activePet].lv }] : [];
      if (st0.only) {
        const own = ownedOf(save, st0.only);
        let lv = own ? save.pets[own].lv : 0;
        if (st0.lend && save.stage <= i) lv = Math.max(lv, st0.lend);
        if (st0.only && (save.loss[i] || 0) >= 2) { lv = Math.max(lv, Math.max(3, lv + 2)); lent = true; }
        team = [{ id: own || st0.only, lv: Math.max(1, lv) }];
      }
      const st1 = Object.assign({}, st0, { fastCharge: !!st0.fastCharge && save.stage <= i });
      if ((save.loss[i] || 0) >= 3) { st1.luck = 1; st1.d = Math.max(0, (st0.d || 0) - 0.15); } // 保底（照 main.js 0.9）
      const g = play({ stage: st1, team, seed: (seed = (seed * 1103515245 + 12345) >>> 0), skill });
      // 结算（照 endPet）
      const replay = i < save.stage;
      g.team.forEach((pt) => {
        const r = save.pets[pt.id];
        if (!r) return;
        let gain = Math.min(5, g.petActsTotal[pt.id] || 0) + (g.won ? 3 : 1);
        if (replay) gain = Math.max(1, Math.floor(gain / 2));
        if (st0.only && g.won && !replay && ownedOf(save, st0.only) === pt.id) gain *= 2;
        addExp(r, gain);
      });
      save.gourd += g.caught;
      if (g.won) {
        save.stage = Math.max(save.stage, i + 1);
        if (st0.gift && !save.pets[st0.gift]) { save.pets[st0.gift] = { lv: 1, exp: 0 }; save.petOrder.push(st0.gift); if (!save.activePet) save.activePet = st0.gift; }
        if (save.petOrder.length && !replay) save.dan += 1;
        if (st0.only && !replay) save.dan += 1;
        delete save.loss[i];
      } else { save.loss[i] = (save.loss[i] || 0) + 1; rec.losses.push(g.reason); }
      if (g.won) { win = g; break; }
    }
    rec.tries = tries; rec.firstWin = tries === 1 && !!win; rec.lent = lent;
    const g = win;
    if (g) {
      rec.moves = g.moves; rec.acts = Object.values(g.petActsTotal).reduce((a, b) => a + b, 0);
      rec.petId = g.team[0] && g.team[0].id; rec.petLv = g.team[0] ? g.team[0].lv : 0;
      rec.clearRate = g.playStats.clearMoves / Math.max(1, g.moves); rec.maxDry = g.playStats.maxDry;
      rec.bossP = g.playStats.bossByPlayer; rec.bossPet = g.playStats.bossByPet;
      rec.bossAct = (g.spits || 0) + (g.boss ? g.monStats.eats : 0) + (st0.bossKind === 'split' ? g.monStats.spawns : 0);
    } else rec.stuck = true;
    out.push(rec);
    // 回营地：炼丹，喂丹（聪明的喂下一关要用的那只，懒的喂出战的那只）；铜雀够 5 级就去打进化关
    { const n = Math.floor(save.gourd / 2); save.dan += n; save.gourd -= n * 2; } // 两只墨怪炼一颗丹（照 main.js 0.9）
    const next = PLV[i + 1];
    let feedId = save.activePet;
    if (smart && next) feedId = ownedOf(save, next.only || next.best) || save.activePet;
    while (feedId && save.dan > 0) { save.dan--; addExp(save.pets[feedId], DAN_EXP); }
    for (const id of save.petOrder.slice()) {
      const d = PG.PETS[id];
      if (d.evo && save.pets[id] && save.pets[id].lv >= d.evoLv) {
        const evSt = PLV.evolveStage(id, d.color);
        let ok = false;
        for (let t = 0; t < MAXTRY && !ok; t++) ok = play({ stage: evSt, team: [{ id, lv: save.pets[id].lv }], seed: (seed = (seed * 1103515245 + 12345) >>> 0), skill }).won;
        if (ok) { save.pets[d.evo] = save.pets[id]; delete save.pets[id]; save.petOrder = save.petOrder.map((x) => (x === id ? d.evo : x)); if (save.activePet === id) save.activePet = d.evo; }
      }
    }
  }
  return out;
}

const SKILLS = [['生手（四成奔目标、三成乱放）', 7], ['一般人（六成奔目标）', 8], ['盯目标', 9], ['旧·新手（四成乱放）', -0.4], ['旧·手很生', 0.25]];
const lines = [];
const say = (s) => { console.log(s); lines.push(s); };
say(`从头打到尾 × ${N} 遍（机器人照游戏规矩拿经验、炼丹、喂宠物、进化；每关打到过为止，最多 ${MAXTRY} 次）`);
for (const smart of [true]) {
  for (const [sname, skill] of SKILLS) {
    const runs = [];
    for (let r = 0; r < N; r++) runs.push(runCampaign(skill, smart, 1000 + r * 7919));
    say(`\n=== ${smart ? '聪明玩家（换最顺的宠物、喂下一关要的）' : '懒玩家（一直带第一只、只喂它）'} · ${sname} ===`);
    say('关   类型        一次过  平均几次  赢的那局几手  宠物出手  几成手有消  最长几手没消  宠物（几级）        头目心：玩家/宠物  头目动手');
    let totalTries = 0, totalMoves = 0;
    PLV.forEach((st, i) => {
      const rs = runs.map((x) => x[i]);
      const avg = (f) => rs.reduce((a, x) => a + f(x), 0) / rs.length;
      const first = Math.round((rs.filter((x) => x.firstWin).length / rs.length) * 100);
      const tries = avg((x) => x.tries); totalTries += tries; totalMoves += avg((x) => x.moves) * tries;
      const kind = st.goal.boss ? '头目' : st.hard === 2 ? '超难' : st.hard === 1 ? '难' : st.only ? '专属' : '';
      const pets = {}; rs.forEach((x) => { if (x.petId) pets[x.petId] = (pets[x.petId] || 0) + 1; });
      const topPet = Object.keys(pets).sort((a, b) => pets[b] - pets[a])[0];
      const lvAvg = avg((x) => x.petLv).toFixed(1);
      const stuck = rs.filter((x) => x.stuck).length;
      say(`${String(i + 1).padStart(2)}  ${kind.padEnd(4, '　')}  ${String(first).padStart(5)}%  ${tries.toFixed(1).padStart(7)}  ${avg((x) => x.moves).toFixed(0).padStart(11)}  ${avg((x) => x.acts).toFixed(1).padStart(7)}  ${(avg((x) => x.clearRate) * 100).toFixed(0).padStart(9)}%  ${avg((x) => x.maxDry).toFixed(1).padStart(11)}  ${(topPet ? PG.PETS[topPet].name : '—').padEnd(4, '　')}${lvAvg.padStart(5)}  ${st.goal.boss ? (avg((x) => x.bossP).toFixed(1) + ' / ' + avg((x) => x.bossPet).toFixed(1)).padStart(16) : ''.padStart(16)}  ${st.goal.boss ? avg((x) => x.bossAct).toFixed(1) : ''}${stuck ? '  卡住 ' + stuck + ' 遍' : ''}`);
    });
    say(`合计：平均要打 ${totalTries.toFixed(0)} 局，约 ${Math.round(totalMoves)} 手（按每手 4 秒约 ${Math.round((totalMoves * 4) / 60)} 分钟）`);
  }
}
require('fs').writeFileSync(require('path').join(__dirname, 'campaign_fable_' + (process.env.TAG || 'new') + '.txt'), lines.join('\n'));
