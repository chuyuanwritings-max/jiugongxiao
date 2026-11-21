// 守城（肉鸽试玩版）的规则层：波次、攻城车、8 件机关、三选一、机器人。不画图，Node 里也能跑（test/measure_siege.js）。
// 设计见 ../肉鸽构筑分析_20261120.md 第三、七节。拖块、凑满、消掉不变；消除 = 打攻城车，打掉一辆三选一拿一件机关，机关全自动发动。
const C = require('./config.js');
const core = require('./core.js');
const { UNITS, PIECES } = core;

// ---------- 波次 ----------
// 每波 4 轮（一轮 = 发三块），车每轮走一步，4 轮里血没打光 = 城破
const WAVES = [
  { name: '小车', hp: 60 },
  { name: '冲车', hp: 100 },
  { name: '云梯', hp: 140, boss: 'ladder', bossLine: '云梯：只有消行、消列才打得动它' },
  { name: '重车', hp: 180 },
  { name: '铁甲车', hp: 250, boss: 'armor', bossLine: '铁甲车：一手打不到 30 点的全被挡掉' },
];
const FIRST_RUN_WAVES = 3; // 试玩版：3 波算守住，之后可以「继续守」
const ROUNDS = 4;
const LINE_DMG = 20; // 消一条（行 / 列 / 宫）打多少；一手里第 n 条打 20 × n（连锁越长越疼，机关叠起来才有质变）
const CELL_DMG = 3; // 机关打掉一格打多少
const SLOTS = 5; // 机关栏几格

// ---------- 洛书飞星：星按 5 → 6 → 7 → 8 → 9 → 1 → 2 → 3 → 4 的顺序每轮飞一宫 ----------
// 洛书九宫：4 9 2 / 3 5 7 / 8 1 6
const LUOSHU_BOX = { 4: 0, 9: 1, 2: 2, 3: 3, 5: 4, 7: 5, 8: 6, 1: 7, 6: 8 };
const STAR_PATH = [5, 6, 7, 8, 9, 1, 2, 3, 4].map((n) => LUOSHU_BOX[n]);

// ---------- 8 件机关（一行字，16 字以内） ----------
// school：流派（卡片边的颜色）  pal：能和谁连（三选一卡上标「配你的 XX」）
const RELICS = {
  crossbow: { name: '连弩', glyph: '弩', school: 'bow', pal: ['loader', 'inkline'],
    desc: ['消行或列，隔壁更满的那条也射穿', '消行或列，两边各射穿一条', '两边各射穿，每格多打 2 点'] },
  loader: { name: '弩机上弦', glyph: '弦', school: 'bow', pal: ['crossbow'],
    desc: ['消行列：下次消除 ×2，送长条', '消行列：下次消除 ×2.5，送长条', '消行列：下次消除 ×3，送两根'] },
  inkline: { name: '墨斗', glyph: '墨', school: 'ink', pal: ['crossbow', 'thunder'],
    desc: ['一消就把只差三格的一行补满', '一消就把只差四格的一行补满', '一消就补满两条只差四格的'] },
  thunder: { name: '火雷', glyph: '雷', school: 'fire', pal: ['chain', 'inkline'],
    desc: ['消一宫，旁边最满的一宫也炸平', '消一宫，旁边最满的两宫炸平', '炸平两宫，每格多打 3 点'] },
  chain: { name: '连环雷', glyph: '连', school: 'fire', pal: ['thunder'],
    desc: ['炸平的宫接着炸旁边，连 2 次', '炸平的宫接着炸旁边，连 3 次', '炸平的宫接着炸旁边，连 4 次'] },
  center5: { name: '五居中', glyph: '五', school: 'luoshu', pal: ['hetu', 'star'],
    desc: ['消中宫，这一手伤害 ×5', '消中宫，这一手伤害 ×6', '消中宫，这一手伤害 ×8'] },
  hetu: { name: '河图', glyph: '河', school: 'luoshu', pal: ['center5', 'star'],
    desc: ['每消一次中宫，倍率永久 +0.3', '每消一次中宫，倍率永久 +0.45', '每消一次中宫，倍率永久 +0.6'] },
  star: { name: '飞星', glyph: '星', school: 'star', pal: ['center5', 'hetu'],
    desc: ['星每轮飞一宫，消到星那宫 ×3', '星每轮飞一宫，消到星那宫 ×4', '星每轮飞一宫，消到星那宫 ×5'] },
};
const RELIC_IDS = Object.keys(RELICS);
const lv = (st, id) => st.relics.find((r) => r.id === id)?.lv || 0;

// ---------- 小工具 ----------
const lineCells = (axis, i) => UNITS[axis === 'row' ? i : 9 + i];
const boxCells = (b) => UNITS[18 + b];
const countBlocks = (board, cells) => cells.filter((k) => board[k] === 1).length;
function fullUnits(b) {
  const out = [];
  for (let u = 0; u < 27; u++) if (UNITS[u].every((k) => b[k])) out.push(u);
  return out;
}
// 第 b 宫和第 nb 宫贴着的那一边，往 nb 里数 depth 层
function edgeCells(b, nb, depth) {
  const br = Math.floor(nb / 3) * 3, bc = (nb % 3) * 3;
  const out = [];
  for (let d = 0; d < depth; d++) {
    for (let i = 0; i < 3; i++) {
      if (nb === b - 3) out.push((br + 2 - d) * 9 + bc + i); // 上面那宫的下边
      else if (nb === b + 3) out.push((br + d) * 9 + bc + i); // 下面那宫的上边
      else if (nb === b - 1) out.push((br + i) * 9 + bc + 2 - d); // 左边那宫的右边
      else out.push((br + i) * 9 + bc + d); // 右边那宫的左边
    }
  }
  return out;
}
function neighbors(b) {
  const out = [];
  if (b >= 3) out.push(b - 3);
  if (b <= 5) out.push(b + 3);
  if (b % 3 > 0) out.push(b - 1);
  if (b % 3 < 2) out.push(b + 1);
  return out;
}

// ---------- 一手的结算（纯函数：不改 st，返回新棋盘、伤害、一串步骤给画面放） ----------
// st：{ relics:[{id,lv}], starBox, hetuBonus, boss, tutorialX5 }
function resolve(board, st, p, r, c) {
  const b = board.slice();
  const placed = p.cells.map(([dr, dc]) => (r + dr) * 9 + c + dc);
  placed.forEach((k) => (b[k] = 1));
  const steps = [];
  const events = []; // 消掉的「一条」：{ type: 'row'|'col'|'box', idx, by }
  const touched = new Set(); // 这一手打掉 / 消掉的所有格子（看有没有碰到星）
  let base = placed.length;
  let lineN = 0;
  const lineDmg = (type) => { lineN++; return st.boss === 'ladder' && type === 'box' ? 0 : LINE_DMG * lineN; };

  // 1. 先照常消
  const units = fullUnits(b);
  if (units.length) {
    const cells = new Set();
    units.forEach((u) => UNITS[u].forEach((k) => cells.add(k)));
    cells.forEach((k) => { if (b[k] !== 2) b[k] = 0; touched.add(k); });
    units.forEach((u) => {
      const type = u < 9 ? 'row' : u < 18 ? 'col' : 'box';
      events.push({ type, idx: u % 9, by: null });
      base += lineDmg(type);
    });
    steps.push({ kind: 'clear', units, cells: [...cells], dmg: base });
  }
  if (!events.length) return { board: b, dmg: Math.round(base * (1 + (st.hetuBonus || 0))), base, mult: 1 + (st.hetuBonus || 0), mults: [], steps, events, loader: 0, centerHit: false, starHit: false, placed };

  // 火雷：把 bx 旁边最满的宫炸平（算消一宫）；连环雷：炸平的宫再引爆它旁边最满的，一层层传
  let chainLeft = lv(st, 'chain') ? lv(st, 'chain') + 1 : 0;
  const blasted = new Set();
  const blast = (bx, step, count, depth) => {
    const L = lv(st, 'thunder');
    const per = CELL_DMG + (L >= 3 ? 3 : 0);
    const targets = neighbors(bx).filter((nb) => !blasted.has(nb))
      .map((nb) => ({ nb, n: countBlocks(b, boxCells(nb)) })).filter((x) => x.n > 0)
      .sort((x, y) => y.n - x.n).slice(0, count);
    for (const { nb } of targets) {
      blasted.add(nb);
      const hit = boxCells(nb).filter((k) => b[k] === 1);
      hit.forEach((k) => { b[k] = 0; touched.add(k); });
      events.push({ type: 'box', idx: nb, by: depth ? 'chain' : 'thunder' });
      const dmg = lineDmg('box') + hit.length * per;
      base += dmg; step.dmg += dmg;
      step.cells = step.cells.concat(hit);
      (step.boxes = step.boxes || []).push(nb);
      if (chainLeft > 0) {
        chainLeft--;
        const s2 = { kind: 'relic', id: 'chain', box: nb, cells: [], dmg: 0 };
        steps.push(s2);
        blast(nb, s2, 1, depth + 1);
        if (!s2.cells.length) steps.splice(steps.indexOf(s2), 1);
      }
    }
  };
  const chainCheck = () => {};

  // 2. 机关从左到右轮一遍，每件一手最多发动一次；谁发动出了新的「一条」，再轮一遍
  const used = new Set();
  let loader = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const { id, lv: L } of st.relics) {
      if (used.has(id)) continue;
      const lastLine = [...events].reverse().find((e) => e.type !== 'box');
      const lastBox = [...events].reverse().find((e) => e.type === 'box');
      if (id === 'crossbow' && lastLine) {
        used.add(id); changed = true;
        const before = b.slice();
        const cand = [lastLine.idx - 1, lastLine.idx + 1].filter((i) => i >= 0 && i <= 8)
          .map((i) => ({ i, n: countBlocks(b, lineCells(lastLine.type, i)) })).filter((x) => x.n > 0)
          .sort((x, y) => y.n - x.n);
        const shoot = L >= 2 ? cand : cand.slice(0, 1);
        const step = { kind: 'relic', id, lines: [], cells: [], dmg: 0 };
        for (const { i } of shoot) {
          const hit = lineCells(lastLine.type, i).filter((k) => b[k] === 1);
          hit.forEach((k) => { b[k] = 0; touched.add(k); });
          events.push({ type: lastLine.type, idx: i, by: id });
          const dmg = lineDmg(lastLine.type) + hit.length * (CELL_DMG + (L >= 3 ? 2 : 0));
          base += dmg; step.dmg += dmg;
          step.lines.push({ axis: lastLine.type, idx: i });
          step.cells = step.cells.concat(hit);
        }
        if (shoot.length) { steps.push(step); chainCheck(before, step); }
      } else if (id === 'loader' && lastLine) {
        used.add(id); changed = true;
        loader = L;
        steps.push({ kind: 'relic', id, cells: [], dmg: 0 });
      } else if (id === 'inkline' && events.length) {
        used.add(id); changed = true;
        const maxE = L >= 2 ? 4 : 3;
        const times = L >= 3 ? 2 : 1;
        const step = { kind: 'relic', id, lines: [], cells: [], dmg: 0 };
        for (let t = 0; t < times; t++) {
          let best = null;
          for (const axis of ['row', 'col']) for (let i = 0; i < 9; i++) {
            const cells = lineCells(axis, i);
            const e = cells.filter((k) => !b[k]).length;
            if (e >= 1 && e <= maxE && (!best || e < best.e)) best = { axis, i, e };
          }
          if (!best) break;
          const cells = lineCells(best.axis, best.i);
          const filled = cells.filter((k) => !b[k]);
          cells.forEach((k) => { if (b[k] !== 2) b[k] = 0; touched.add(k); });
          events.push({ type: best.axis, idx: best.i, by: id });
          const ld = lineDmg(best.axis);
          base += ld; step.dmg += ld;
          step.lines.push({ axis: best.axis, idx: best.i, filled });
          step.cells = step.cells.concat(cells);
        }
        if (step.lines.length) steps.push(step);
      } else if (id === 'thunder' && lastBox) {
        used.add(id); changed = true;
        const step = { kind: 'relic', id, box: lastBox.idx, cells: [], dmg: 0 };
        steps.push(step);
        blasted.add(lastBox.idx);
        blast(lastBox.idx, step, L >= 2 ? 2 : 1, 0);
      }
    }
  }

  // 3. 倍率
  const centerHit = events.some((e) => e.type === 'box' && e.idx === 4);
  const starHit = lv(st, 'star') > 0 && st.starBox !== undefined && boxCells(st.starBox).some((k) => touched.has(k));
  let mult = 1 + (st.hetuBonus || 0);
  const mults = [];
  if (st.charge > 1) { mult *= st.charge; mults.push({ id: 'loader', m: st.charge }); } // 上弦的倍率：下一次有消除的那一手用掉
  if (centerHit && (lv(st, 'center5') || st.tutorialX5)) {
    const m = [5, 5, 6, 8][lv(st, 'center5')] || 5;
    mult *= m; mults.push({ id: 'center5', m });
  }
  if (starHit) { const m = [0, 3, 4, 5][lv(st, 'star')]; mult *= m; mults.push({ id: 'star', m }); }
  if (st.hetuBonus) mults.push({ id: 'hetu', m: 1 + st.hetuBonus });
  let dmg = Math.round(base * mult);
  if (st.boss === 'armor' && dmg < 30) dmg = 0;
  return { board: b, dmg, base, mult, mults, steps, events, loader, centerHit, starHit, placed };
}

// ---------- 一局 ----------
// opts: { seed, tutorial, daily（每日一城：当天日期 20261121 这样的数）, relics:[{id,lv}]（测试用：开局直接带）, noRelics（测试用：不拿机关） }
// 每日一城：所有人当天同一串候选块、每一波同一组三选一；不封顶，一直守到城破，比谁守的波数多
function createSiege(opts) {
  const o = opts || {};
  const stage = { goal: {}, board: ['.........', '....#....'.replace('#', '.'), '.........', '.........', '.........', '.........', '.........', '.........', '.........'], d: 0.12 };
  const g = core.createGame({ stage, seed: o.seed, tutorial: o.tutorial });
  // 开局盘面：照旅程第 1 关摆 12 块旧铁块（中宫空着，教学第一块 3×3 放进去）
  const START = ['....#....', '.#.....#.', '.........', '#.......#', '#.......#', '#.......#', '.........', '.#.....#.', '....#....'];
  START.forEach((row, r) => row.split('').forEach((ch, c) => { if (ch === '#') g.board[r * 9 + c] = 1; }));
  Object.assign(g, {
    siege: true,
    wave: 0, waveDef: WAVES[0], hp: WAVES[0].hp, hpMax: WAVES[0].hp, round: 1,
    hpScale: o.tutorial ? 0.6 : 1, // 第一局车的血打七五折：第一局必须守得住
    relics: (o.relics || []).map((x) => ({ ...x })),
    starBox: STAR_PATH[0], starStep: 0, hetuBonus: 0,
    pendingLoader: 0, tutorialX5: !!o.tutorial,
    phase: 'play', // play / choose / won（守住 3 波）
    offer: null, wavesWon: 0, totalDmg: 0, waveDmg: 0, bestHit: 0, maxChain: 0,
    triggers: {}, firstRun: !!o.tutorial,
  });
  if (o.daily) {
    g.daily = o.daily;
    g.endlessOn = true; // 不在第 3 波停，一直守
    g.pieceRand = core.rng((o.daily * 2654435761) >>> 0); // 出块单独一条随机数：不受拿了什么机关影响
    g.hand = core.dealHand(g.board, g.pieceRand, g.diff(), true);
  }
  g.prefilled = new Set(START.flatMap((row, r) => row.split('').map((ch, c) => (ch === '#' ? r * 9 + c : -1))).filter((k) => k >= 0));
  g.diff = () => Math.min(0.6, 0.12 + g.wave * 0.08);
  const baseDeal = g.deal;
  // 发一轮：车走一步（第一轮不算）、星飞一宫、弩机上弦的长条
  g.newRound = () => {
    if (g.pieceRand) { g.deals++; g.hand = core.dealHand(g.board, g.pieceRand, g.diff(), true); }
    else baseDeal();
    if (g.pendingLoader) {
      const L = g.pendingLoader;
      const ids = L >= 2 ? ['5h', '5v'] : ['4h', '4v'];
      const slots = L >= 3 ? [0, 1] : [0];
      const hand = g.hand.slice();
      slots.forEach((s) => (hand[s] = PIECES[ids[Math.floor(g.rand() * 2)]]));
      if (core.solvable(g.board, hand)) g.hand = hand;
      else {
        // 换个方向再试一次
        slots.forEach((s) => (hand[s] = PIECES[hand[s].id === ids[0] ? ids[1] : ids[0]]));
        if (core.solvable(g.board, hand)) g.hand = hand;
      }
      g.pendingLoader = 0;
      g.loaderDealt = true;
    } else g.loaderDealt = false;
    g.handGem = [null, null, null];
  };
  g.moveStar = () => {
    g.starStep = (g.starStep + 1) % 9;
    g.starBox = STAR_PATH[g.starStep];
  };
  g.charge = 1; // 弩机上弦：下一手的倍率
  g.state = () => ({ relics: g.relics, starBox: g.starBox, hetuBonus: g.hetuBonus, boss: g.waveDef.boss, tutorialX5: g.tutorialX5, charge: g.charge });

  g.place = (i, r, c) => {
    const p = g.hand[i];
    if (!p || g.over || g.phase !== 'play' || !core.canPlace(g.board, p, r, c)) return null;
    const res = resolve(g.board, g.state(), p, r, c);
    g.board = res.board;
    g.hand[i] = null;
    g.moves++;
    if (res.events.length) g.tutorialX5 = false; // 教学白送的 ×5 只给第一次
    if (res.centerHit && lv(g, 'hetu')) g.hetuBonus += [0, 0.3, 0.45, 0.6][lv(g, 'hetu')];
    // 弩机上弦：有消除的这一手用掉攒着的倍率；这一手又消了行列，就重新上弦
    if (res.events.length) g.charge = res.loader ? [1, 2, 2.5, 3][res.loader] : 1;
    if (res.loader) g.pendingLoader = Math.max(g.pendingLoader, res.loader);
    res.steps.forEach((s) => { if (s.kind === 'relic') g.triggers[s.id] = (g.triggers[s.id] || 0) + 1; });
    const relicSteps = res.steps.filter((s) => s.kind === 'relic').length + (res.mults || []).length;
    g.maxChain = Math.max(g.maxChain, relicSteps);
    g.streak = res.events.length ? g.streak + 1 : 0;
    const ev = { piece: p, r, c, res, dmg: res.dmg, killed: false, waveWon: false, runWon: false, gate: false, stuck: false };
    g.hp = Math.max(0, g.hp - res.dmg);
    g.score += res.dmg; g.totalDmg += res.dmg; g.waveDmg += res.dmg;
    g.bestHit = Math.max(g.bestHit, res.dmg);
    if (g.hp <= 0) {
      ev.killed = true;
      g.wavesWon++;
      if (g.firstRun && g.wavesWon >= FIRST_RUN_WAVES && !g.endlessOn) {
        g.phase = 'won'; ev.runWon = true; g.over = true; g.won = true; g.reason = 'win';
        return ev;
      }
      g.phase = 'choose';
      g.offer = makeOffer(g);
      return ev;
    }
    if (!g.hand.some(Boolean)) {
      if (g.round >= ROUNDS) {
        g.over = true; g.reason = 'gate'; ev.gate = true;
        return ev;
      }
      g.round++;
      g.moveStar();
      g.newRound();
    }
    if (g.stuck()) { g.over = true; g.reason = 'stuck'; ev.stuck = true; }
    return ev;
  };
  // 三选一拿了一件（或升级）
  g.pick = (id) => {
    if (g.phase !== 'choose') return;
    const have = g.relics.find((r) => r.id === id);
    if (have) have.lv = Math.min(3, have.lv + 1);
    else if (g.relics.length < SLOTS) g.relics.push({ id, lv: 1 });
    g.offer = null;
    if (g.openingPick) { g.openingPick = false; g.phase = 'play'; return; } // 开局那一次不换波
    g.nextWave();
  };
  g.nextWave = () => {
    g.wave++;
    const w = WAVES[g.wave] || { name: '重车', hp: Math.round(WAVES[WAVES.length - 1].hp * Math.pow(1.4, g.wave - WAVES.length + 1)) };
    g.waveDef = w; g.hp = Math.round(w.hp * g.hpScale); g.hpMax = g.hp; g.round = 1; g.waveDmg = 0;
    g.phase = 'play';
    // 手上还剩的块留着；手空了就发新的一轮
    if (!g.hand.some(Boolean)) { g.moveStar(); g.newRound(); }
    if (g.stuck()) { g.over = true; g.reason = 'stuck'; }
  };
  // 守住 3 波以后「继续守」
  g.continueRun = () => {
    g.endlessOn = true; g.over = false; g.won = false; g.reason = null;
    g.phase = 'choose'; g.offer = makeOffer(g);
  };
  // 假广告复活：城破 → 多打一轮；堵死 → 清空中宫再发
  const baseRevive = g.revive;
  g.revive = () => {
    if (g.reason === 'gate') {
      g.adsUsed++;
      g.round--; g.over = false; g.reason = null;
      g.moveStar(); g.newRound();
    } else baseRevive();
  };
  g.nearMiss = () => !g.won && g.reason === 'gate' && g.hp <= g.hpMax * 0.3;
  g.lvOf = (id) => lv(g, id);
  // 开局：第一局先打一辆车再选；以后开局先三选一
  if (!o.tutorial && !o.noRelics && !o.relics) { g.phase = 'choose'; g.offer = makeOffer(g); g.openingPick = true; }
  return g;
}

// 三选一：第一局固定连弩 / 火雷 / 墨斗；之后随机，偏向「能和已有的连上」和升级。机关栏满了只出升级
function makeOffer(g) {
  if (g.firstRun && g.wavesWon === 1 && !g.relics.length) return ['crossbow', 'thunder', 'inkline'];
  const owned = g.relics.map((r) => r.id);
  let pool = RELIC_IDS.filter((id) => (owned.includes(id) ? lv(g, id) < 3 : owned.length < SLOTS));
  // 每日一城：每一波的三选一按日期和第几波定，人人一样（不按各人拿过什么调权重）
  const rnd = g.daily ? core.rng(((g.daily ^ ((g.wavesWon + 1) * 40503)) * 2246822519) >>> 0) : g.rand;
  const weight = g.daily ? () => 1 : (id) => {
    let w = 1;
    if (owned.includes(id)) w += 0.6;
    if (owned.some((o2) => RELICS[o2].pal.includes(id))) w += 1.2;
    return w;
  };
  const out = [];
  while (out.length < 3 && pool.length) {
    const tot = pool.reduce((a, id) => a + weight(id), 0);
    let t = rnd() * tot;
    let k = 0;
    while (k < pool.length - 1 && t > weight(pool[k])) { t -= weight(pool[k]); k++; }
    out.push(pool[k]);
    pool = pool.filter((x) => x !== pool[k]);
  }
  return out;
}
// 卡上写「配你的 XX」
function palOf(g, id) {
  const mate = g.relics.find((r) => RELICS[r.id].pal.includes(id) || RELICS[id].pal.includes(r.id));
  return mate ? RELICS[mate.id].name : null;
}

// ---------- 机器人：按手里的机关挑落点 ----------
function bestMove(g, skill) {
  const st = g.state();
  const cands = [];
  g.hand.forEach((p, i) => {
    if (!p) return;
    for (const [r, c] of core.placements(g.board, p)) {
      const res = resolve(g.board, st, p, r, c);
      // 伤害要紧，但别把盘面堆死；离城门越近越看重伤害
      const urgency = 0.35 + (g.round / ROUNDS) * 0.5;
      let v = res.dmg * urgency + res.events.length * 4 + core.evalBoard(res.board, null);
      // 有飞星就往星那宫凑，有五居中 / 河图就往中宫凑
      if (lv(g, 'star')) v += countBlocks(res.board, boxCells(g.starBox)) * 0.6;
      if (lv(g, 'center5') || lv(g, 'hetu')) v += countBlocks(res.board, boxCells(4)) * 0.5;
      cands.push({ i, r, c, v, board: res.board });
    }
  });
  if (!cands.length) return null;
  cands.sort((a, b) => b.v - a.v);
  const top = cands.slice(0, 10);
  for (const m of top) {
    const rest = g.hand.filter((p, k) => p && k !== m.i);
    if (rest.length && !core.solvable(m.board, rest)) m.v -= 100;
  }
  top.sort((a, b) => b.v - a.v);
  const s = skill === undefined ? 1 : skill;
  if (s >= 1 || g.rand() < s) return top[0];
  return top[Math.min(top.length - 1, 1 + Math.floor(g.rand() * 4))];
}
// 机器人三选一：有能连上的先拿能连上的，再升级
function bestPick(g, prefer) {
  if (prefer) { const hit = g.offer.find((id) => prefer.includes(id)); if (hit) return hit; }
  const owned = g.relics.map((r) => r.id);
  const score = (id) => (owned.some((o2) => RELICS[o2].pal.includes(id)) ? 2 : 0) + (owned.includes(id) ? 1 : 0) + g.rand() * 0.1;
  return g.offer.slice().sort((a, b) => score(b) - score(a))[0];
}
// 模拟一局。opts.pick：'none' 不拿 / 'auto' / 数组＝优先拿这几件
function simulate(opts) {
  const o = Object.assign({ skill: 1, secPerMove: () => 3 }, opts);
  const g = createSiege(o);
  let guard = 0;
  while (!g.over && guard++ < 400) {
    if (g.phase === 'choose') {
      if (o.pick === 'none') { g.offer = null; if (g.openingPick) { g.openingPick = false; g.phase = 'play'; } else g.nextWave(); continue; }
      g.pick(bestPick(g, Array.isArray(o.pick) ? o.pick : null));
      continue;
    }
    const m = bestMove(g, o.skill);
    if (!m) break;
    g.elapsed += o.secPerMove(g);
    g.place(m.i, m.r, m.c);
    if (o.maxWaves && g.wavesWon >= o.maxWaves) break;
  }
  return g;
}

module.exports = { WAVES, FIRST_RUN_WAVES, ROUNDS, SLOTS, RELICS, RELIC_IDS, STAR_PATH, resolve, createSiege, makeOffer, palOf, bestMove, bestPick, simulate };
