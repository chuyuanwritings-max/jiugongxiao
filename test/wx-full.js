// 全流程（0.9.14 debug 上线前 debug）：模拟微信环境，从清空的存档用真触摸一路打到第 30 关打完，四趟：
// 0.9.25：前两章普通关很好过，「手生」用 skill 0.3 一次都不输，测不到输了以后的那几条路；改成完全随手放（skill 0）
// 高手 / 一般 / 手生 × 三种屏幕（375×667、390×844、430×932）。手生的那两趟会反复输：再试一次、连输两次「请 X 来帮忙」、
// 连输三次以上暗中放松、看广告复活、换一组；在关卡卡片上随手换宠物；能进化就进化。
// 每一步都查：没卡住（同一个画面不动）、关里没判输赢时一定有事可做、没有出错记账（代号 X，看门狗也算）。
// 用法：node test/wx-full.js [只跑第几趟]
const { boot, playStep } = require('./wx-env.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
const RUNS = [
  { name: '高手', seed: 1, skill: 1, w: 390, h: 844 },
  { name: '一般', seed: 5, skill: 0.6, w: 375, h: 667 },
  { name: '手生', seed: 3, skill: 0, w: 430, h: 932 },
  { name: '手生（另一局）', seed: 8, skill: 0, w: 390, h: 844 },
];
const only = +process.argv[2] || 0;
// 0.9.25 收拾：照现在的前两章（20 关）算目标，不再写死 30 关和四只宠物
const PLV = require('../js/petlevels.js'), N = PLV.length;
const WANT_GIFT = PLV.map((st, i) => (st.gift ? (i + 1) + ':' + st.gift : null)).filter(Boolean).join(',');
const WANT_BOSS = PLV.map((st, i) => (st.goal && st.goal.boss ? i + 1 : null)).filter(Boolean);
RUNS.forEach((R, n) => {
  if (only && only !== n + 1) return;
  const E = boot({ seed: R.seed, w: R.w, h: R.h });
  const { G, run, touch, tap, btn } = E;
  let steps = 0, last = '', same = 0, stuckAt = null, softlock = null, thrown = null;
  const tries = {}, seen = { lend: 0, revive: 0, evolve: 0, pick: 0, reroll: 0, soften: 0, intro: new Set(), gift: [], boss: [], maxLoss: 0, skill: 0, gnaw: 0 };
  const t0 = process.hrtime.bigint();
  try {
    while (G.save.petStage < N && steps++ < 300000) {
      const g = G.g, mode = G.mode;
      const key = mode + '|' + G.petIdx + '|' + (g && g.moves) + '|' + (g && g.hand.map((p) => (p ? p.id + (p.uses || '') : '-')).join('')) + '|' + G.buttons().map((b) => b.id).join(',');
      same = key === last ? same + 1 : 0; last = key;
      if (same > 300) { stuckAt = key; break; }
      if (mode === 'cut') { touch('down', 195, 420); run(2); touch('up', 195, 420); continue; }
      if (mode === 'intro') { run(10); const b = btn('introOk'); if (b) { seen.intro.add(G.petIdx + 1); tap(b); } continue; }
      if (mode === 'start') {
        run(10);
        const picks = G.buttons().filter((b) => b.id.startsWith('cardPet_'));
        if (picks.length && Math.random() < 0.3) { seen.pick++; tap(picks[Math.floor(Math.random() * picks.length)]); run(5); continue; }
        if ((G.save.loss || {})[G.petIdx] >= 3) seen.soften++;
        const b = btn('startGo'); if (b) tap(b); continue;
      }
      if (mode === 'home') { const b = btn('homePlay'); if (b) tap(b); continue; }
      if (mode === 'map') { const b = btn('play'); if (b) tap(b); continue; }
      if (mode === 'ad') { run(10); continue; }
      if (mode === 'camp') {
        const act = G.save.activePet || G.save.petOrder[0], fd = btn('feedG'), ev = btn('evolveG');
        if (ev) { seen.evolve++; tap(ev); } else if (fd && G.save.dan >= G.danToLevel(act)) tap(fd);
        else if (!fd && G.save.dan >= G.danToLevel(act)) { const b = btn('gpet_' + act); if (b) tap(b); else tap(btn('campPlay') || btn('campBack')); } else tap(btn('campPlay') || btn('campBack'));
        run(5); continue;
      }
      if (mode === 'over') {
        run(80);
        const r = G.result; if (!r) { stuckAt = '结算页没有结果'; break; }
        let b;
        if (r.won) { if (r.gift) seen.gift.push(G.petIdx + 1 + ':' + r.gift); if (G.PLV[G.petIdx] && G.PLV[G.petIdx].goal.boss && !G.g.stage.evolve) seen.boss.push(G.petIdx + 1); b = btn('tocamp'); }
        else {
          tries[G.petIdx + 1] = (tries[G.petIdx + 1] || 0) + 1; seen.maxLoss = Math.max(seen.maxLoss, (G.save.loss || {})[G.petIdx] || 0);
          const rv = btn('revive'), ld = btn('lend');
          if (ld) { b = ld; seen.lend++; } else if (rv && Math.random() < 0.4) { b = rv; seen.revive++; } else b = btn('again');
        }
        if (!b) { stuckAt = '结算页没有能点的按钮：' + G.buttons().map((x) => x.id).join(','); break; }
        tap(b); run(20); continue;
      }
      if (mode === 'play') {
        if (g.over) { run(20); continue; }
        if (g.stuck()) { softlock = '第 ' + (G.petIdx + 1) + ' 关第 ' + g.moves + ' 手：没判输，但手上 ' + g.hand.map((p) => (p ? p.id : '-')).join(',') + ' 全放不下'; break; }
        const rr = btn('reroll'); if (rr && Math.random() < 0.3) { seen.reroll++; tap(rr); continue; }
        // 段 1：堵路以后手生机器人在障碍多的关（13、15、18–20）能连输几百次；同一关连输 20 次以后这一关改用手熟的打过去（输了以后那几条路前面早走到了；障碍段 3 照规则 11 重摆）
        const r = playStep(E, (G.save.loss || {})[G.petIdx] >= 20 ? 1 : R.skill);
        if (r === 'skill' || r === 'skill-hand') seen.skill++; if (r === 'skill-hand') seen.gnaw++;
        if (!r) run(30);
        continue;
      }
      run(5);
    }
  } catch (e) { thrown = e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e); }
  const errs = E.errs(), tag = R.name + '（' + R.w + '×' + R.h + '）';
  ok(!thrown, tag + '：没有抛出异常' + (thrown ? '：' + thrown : ''));
  ok(!stuckAt && !softlock, tag + '：一路没有卡住' + (stuckAt ? '——卡在 ' + stuckAt : '') + (softlock ? '——' + softlock : ''));
  ok(G.save.petStage >= N, tag + '：打完第 ' + G.save.petStage + ' 关（目标 ' + N + '），' + steps + ' 步，' + (Number(process.hrtime.bigint() - t0) / 1e9).toFixed(0) + ' 秒');
  ok(errs.length === 0, tag + '：没有出错记账、没有靠看门狗' + (errs.length ? '：' + errs.slice(0, 3).map((e) => e.slice(2, 5).join(' / ')).join(' || ') : ''));
  ok(seen.gift.join(',') === WANT_GIFT && G.save.petStage >= N, tag + '：宠物都在登场关到手（' + seen.gift.join('、') + '，应该是 ' + WANT_GIFT + '），头目都打过（' + seen.boss.concat(G.save.petStage >= N ? [N] : []).join('、') + '）');
  ok(seen.intro.size >= 6 && seen.skill > 0, tag + '：说明卡看了 ' + seen.intro.size + ' 张，技能块真拖了 ' + seen.skill + ' 次（啃手上的块 ' + seen.gnaw + ' 次），卡片上换宠物 ' + seen.pick + ' 次，进化 ' + seen.evolve + ' 次');
  // 0.9.25：「请 X 来帮忙」只在自己有一只更对口的宠物时才出；前两章的关大多不挑宠物，所以这里不再要求一定出现（只打印次数）。段 3 关卡重排时单独测
  if (R.skill < 0.5) ok(seen.revive > 0 && seen.reroll > 0 && seen.maxLoss >= 3 && seen.soften > 0, tag + '：输了重打都走到了——请宠物帮忙 ' + seen.lend + ' 次、看广告复活 ' + seen.revive + ' 次、换一组 ' + seen.reroll + ' 次、同一关最多连输 ' + seen.maxLoss + ' 次（连输 3 次以上开打 ' + seen.soften + ' 回）');
  // 段 2：丹账对得上——试玩记录里每局拿到的丹加起来 = 丹袋 + 喂掉的（新宠物自己叼的 1 颗不算）；赢的局亮 1–3 个槽，输的 0 个、0 颗
  { const rows = (G.save.playLog || []).filter((r) => !r.quit), earned = rows.reduce((a, r) => a + (r.dan || 0), 0);
    const spent = G.save.petOrder.reduce((a, id) => { const rec = G.save.pets[id]; let c = 0; for (let lv = 1; lv < rec.lv; lv++) c += G.EC.EXP_NEED[lv]; return a + c + rec.exp - G.EC.NEW_PET_EXP; }, 0);
    const odd = rows.filter((r) => !(r.won ? r.slots >= 1 && r.slots <= 3 : r.slots === 0 && r.dan === 0));
    ok(rows.length > 0 && !odd.length && earned === G.save.dan + spent, tag + '：丹账对得上——前两章一路拿到 ' + earned + ' 颗 = 丹袋 ' + G.save.dan + ' + 喂掉 ' + spent + '；赢的局亮 1–3 个槽、输的 0 个' + (odd.length ? '（对不上：' + JSON.stringify(odd.slice(0, 2).map((r) => [r.lv, r.won, r.slots, r.dan])) + '）' : '')); }
  console.log('  输过的关（关号: 次数）：' + JSON.stringify(tries) + '；宠物：' + G.save.petOrder.map((id) => id + ' ' + G.save.pets[id].lv + ' 级').join('、') + '；试玩记录 ' + (G.save.playLog || []).length + ' 局、' + G.T.count() + ' 条');
  // 全部打完以后：地图、宠物园、主菜单都还点得动
  if (G.save.petStage >= N && !thrown) {
    for (let k = 0; k < 40 && G.mode !== 'camp'; k++) { if (G.mode === 'cut') { touch('down', 195, 420); run(2); touch('up', 195, 420); } else if (G.mode === 'over') { run(80); const b = btn('tocamp'); if (b) tap(b); } run(10); }
    const a = G.mode === 'camp'; if (a) tap(btn('campPlay')); run(10);
    // 0.9.21 起「选哪关玩哪关」（Cc 11-27）：全部打完以后，章页按钮是「再玩」选中的那一关，点了就进关。进去再退回地图、回主菜单
    const b = G.mode === 'map' && !!btn('play'); if (b) { tap(btn('play')); run(10); }
    const inLv = G.mode === 'start' || G.mode === 'play' || G.mode === 'intro';
    for (let k = 0; k < 10 && G.mode !== 'map'; k++) { if (G.mode === 'start') { const sg = btn('startGo'); if (sg) tap(sg); } else if (btn('map')) tap(btn('map')); else if (btn('tomap')) tap(btn('tomap')); run(10); }
    const c = G.mode === 'map'; if (btn('home')) tap(btn('home')); run(10);
    ok(a && b && inLv && c && G.mode === 'home' && !!btn('homePlay') && !E.errs().length, tag + '：全部打完以后，宠物园 → 地图 →「再玩」进得去关 → 退回地图 → 主菜单都点得动，不出错');
  }
});
console.log(`\n${pass} 项通过，${fail} 项没过`);
process.exit(fail ? 1 : 0);
