// 九宫消 + 宠物（0.5 最小试玩版）的规则层。设计见 ../九宫消加宠物_设计与调研_20261124.md。
// 拖块、凑满一排或一个大格就消，这个不变。多出来的：
//   ① 方块的颜色有用了：带谁出战，就多发谁颜色的方块；消掉谁的颜色，就给谁多充能。
//   ② 宠物脚下一条能量，消掉东西就涨；满了它出手：自己出手（射一排 / 炸一个大格 / 补满一排），或者「送你一块」火块让你亲手放。
//   ③ 小墨怪（消掉它站的那一排或大格就抓到）、大墨怪（占 2×2，要消它 3 次）。抓到的怪收进葫芦，局外炼丹喂宠物。
//   ④ 进化关：用宠物的颜色把正中间的大格一格格点亮，9 格都亮了就进化。
const C = require('./config.js');
const core = require('./core.js');
const { UNITS, PIECES } = core;

// 颜色 = C.blockColors 的序号：0 黄铜金 1 朱砂红 2 青铜绿 3 青金蓝 4 紫晶 5 赤铜 6 水银青；-1 = 旧铁灰（预放的块）
const COLOR_NAME = ['金色', '红色', '绿色', '蓝色', '紫色', '橙色', '青色'];
// 宠物：每只一行大白话（Cc 规矩：屏幕上只用「一排」「大格」「正中间」）
const PETS = {
  tongque: { name: '铜雀', color: 0, energy: 4, act: 'row', n: 1, desc: '帮你射掉最满的一排', first: '铜雀：帮你射掉了最满的一排！', evo: 'jinchique', evoLv: 5 },
  jinchique: { name: '金翅雀', color: 0, energy: 4, act: 'row', n: 2, desc: '一次射掉最满的两排', first: '金翅雀：一次射掉两排！' },
  baozhu: { name: '爆竹鼠', color: 1, energy: 5, act: 'box', desc: '炸掉最挤的一个大格', first: '爆竹鼠：把最挤的大格炸空了！' },
  modou: { name: '墨斗蚕', color: 2, energy: 4, act: 'fill', desc: '把快满的一排补满', first: '墨斗蚕：把快满的一排补满，消掉了！' },
  qilin: { name: '火麒麟', color: 5, energy: 5, act: 'gift', desc: '送你一块火块，放哪儿炸哪个大格', first: '火麒麟送你一块火块：放到哪个大格，就炸掉那个大格！' },
};
const FIRE = { id: 'fire', cat: 0, cells: [[0, 0]], h: 1, w: 1, special: 'fire' };
const ROW = (u) => (u < 9 ? 'row' : u < 18 ? 'col' : 'box');
function petDef(p) { return PETS[p.id]; }
function energyMax(g, p) {
  if (g.stage.fastCharge) return 2; // 第 4 关：铜雀充得特别快，让人一眼看到它在帮忙
  return Math.max(2, petDef(p).energy - (p.lv >= 3 ? 1 : 0));
}

// opts: { stage, team:[{id,lv}], seed, tutorial }
function createPetGame(opts) {
  const o = opts || {};
  const st = o.stage;
  const g = core.createGame({ stage: st, seed: o.seed, tutorial: o.tutorial });
  Object.assign(g, {
    pets: true,
    color: new Array(81).fill(0),
    handColor: [0, 0, 0],
    team: (st.team || o.team || []).map((p) => ({ id: p.id, lv: p.lv || 1, energy: 0 })),
    bigHp: 0, bigCells: [], giftPending: 0,
    evLit: new Set(), evColor: st.evolve ? PETS[st.evolve.pet].color : null,
    caught: 0, petActsTotal: {},
  });
  // 盘面里的怪：m 小墨怪；K 大墨怪（2×2 那四格）
  st.board.forEach((row, r) => row.split('').forEach((ch, c) => {
    const k = r * 9 + c;
    if (ch === 'm') g.board[k] = 3;
    else if (ch === 'K') { g.board[k] = 4; g.bigCells.push(k); }
    if (g.board[k] === 1) g.color[k] = -1;
  }));
  if (g.bigCells.length) g.bigHp = st.bigHp || 3;
  // 发块的颜色：出战宠物的颜色多发（×2.5）；进化关只发它的颜色和旧铁
  const palette = st.colors || [0, 1, 2, 3];
  g.pickColor = () => {
    const opts2 = palette.map((ci) => ({ ci, w: g.team.some((p) => petDef(p).color === ci) ? 2.5 : 1 }));
    let t = g.rand() * opts2.reduce((a, x) => a + x.w, 0);
    for (const x of opts2) { if ((t -= x.w) <= 0) return x.ci; }
    return opts2[0].ci;
  };
  const baseDeal = g.deal;
  g.deal = () => {
    baseDeal();
    g.handColor = g.hand.map(() => g.pickColor());
    giveGift();
  };
  const baseReroll = g.reroll;
  g.reroll = () => { baseReroll(); g.handColor = g.hand.map((p, i) => (p && p.special ? 5 : g.pickColor())); };
  // 火麒麟送的火块：放进空出来的那一格
  function giveGift() {
    while (g.giftPending > 0) {
      const slot = g.hand.findIndex((x) => !x);
      if (slot < 0) break;
      g.hand[slot] = FIRE; g.handColor[slot] = 5; if (g.handGem) g.handGem[slot] = null; g.giftPending--;
    }
  }
  g.handColor = g.hand.map(() => g.pickColor());

  // 清掉一批格子：小墨怪算抓到、宝石和泡泡算收到；机关匣和大墨怪不清
  function clearCells(b, cells, ev) {
    const got = [];
    for (const k of cells) {
      const v = b[k];
      if (v === 2 || v === 4) continue;
      if (v === 3 && 'monster' in g.got) { g.got.monster++; g.caught++; got.push({ k, what: 'monster' }); }
      else if (v === 3) { g.caught++; got.push({ k, what: 'monster' }); }
      if (v && g.gem[k]) { const id = core.GEMS[g.gem[k]].id; if (id in g.got) { g.got[id]++; got.push({ k, what: id }); } g.gem[k] = 0; }
      if (v && g.bubble[k]) { g.bubble[k] = 0; if ('bubble' in g.got) { g.got.bubble++; got.push({ k, what: 'bubble' }); } }
      b[k] = 0;
    }
    ev.collected.push(...got);
  }
  // 一次「消掉」（一排 / 一个大格）碰到了机关匣或大墨怪
  function unitTouches(b, cells, ev) {
    if ('box' in g.got && cells.some((k) => b[k] === 2)) { g.got.box++; ev.collected.push({ k: cells.find((k) => b[k] === 2), what: 'box' }); }
    if (g.bigHp > 0 && cells.some((k) => b[k] === 4)) {
      g.bigHp--;
      ev.bigHits.push(g.bigCells[0]);
      if (g.bigHp === 0) {
        g.bigCells.forEach((k) => (b[k] = 0));
        g.caught += 3;
        if ('boss' in g.got) g.got.boss = 1;
        ev.collected.push({ k: g.bigCells[0], what: 'boss' });
        ev.bossDown = true;
      }
    }
  }
  const lineCells = (axis, i) => UNITS[axis === 'row' ? i : axis === 'col' ? 9 + i : 18 + i];
  const fillCount = (b, cells) => cells.filter((k) => b[k] === 1 || b[k] === 3).length;

  // 宠物出手（在 b 上改），返回画面要的信息
  function petAct(b, p, ev) {
    const d = petDef(p);
    const act = { id: p.id, kind: d.act, lines: [], boxes: [], cells: [] };
    if (d.act === 'row') {
      const cand = [];
      for (let i = 0; i < 9; i++) { cand.push({ axis: 'row', i, n: fillCount(b, lineCells('row', i)) }); cand.push({ axis: 'col', i, n: fillCount(b, lineCells('col', i)) }); }
      cand.sort((x, y) => y.n - x.n);
      for (const L of cand.slice(0, d.n)) {
        if (!L.n) break;
        const cells = lineCells(L.axis, L.i);
        unitTouches(b, cells, ev);
        act.cells.push(...cells.filter((k) => b[k] === 1 || b[k] === 3));
        clearCells(b, cells, ev);
        act.lines.push({ axis: L.axis, idx: L.i });
      }
    } else if (d.act === 'box') {
      let best = -1, bn = 0;
      for (let bx = 0; bx < 9; bx++) { const n = fillCount(b, lineCells('box', bx)); if (n > bn) { bn = n; best = bx; } }
      if (best >= 0) {
        const cells = lineCells('box', best);
        unitTouches(b, cells, ev);
        act.cells.push(...cells.filter((k) => b[k] === 1 || b[k] === 3));
        clearCells(b, cells, ev);
        act.boxes.push(best);
      }
    } else if (d.act === 'fill') {
      let best = null;
      for (const axis of ['row', 'col']) for (let i = 0; i < 9; i++) {
        const e = lineCells(axis, i).filter((k) => !b[k]).length;
        if (e >= 1 && e <= 3 && (!best || e < best.e)) best = { axis, i, e };
      }
      if (best) {
        const cells = lineCells(best.axis, best.i);
        const filled = cells.filter((k) => !b[k]);
        filled.forEach((k) => { b[k] = 1; g.color[k] = 2; });
        unitTouches(b, cells, ev);
        act.cells.push(...cells.filter((k) => b[k] === 1 || b[k] === 3));
        clearCells(b, cells, ev);
        act.lines.push({ axis: best.axis, idx: best.i, filled });
      }
    } else if (d.act === 'gift') {
      g.giftPending++;
    }
    return act;
  }

  g.place = (i, r, c) => {
    const p = g.hand[i];
    if (!p || g.over || !core.canPlace(g.board, p, r, c)) return null;
    const ci = g.handColor[i];
    const b = g.board.slice();
    const placed = p.cells.map(([dr, dc]) => (r + dr) * 9 + c + dc);
    placed.forEach((k) => { b[k] = 1; g.color[k] = ci; });
    const hg = g.handGem && g.handGem[i];
    if (hg) g.gem[placed[hg.cell]] = hg.kind; // 块上带的宝石落到盘上
    if (g.handGem) g.handGem[i] = null;
    g.hand[i] = null;
    g.moves++;
    const ev = { piece: p, r, c, placed, units: [], cells: [], collected: [], bigHits: [], petActs: [], energy: {}, sparks: [], fire: null, gained: p.cells.length, win: false };
    // 进化关：宠物颜色的块放进正中间，那一格就亮（亮了就一直亮，不怕被消掉）
    if (st.evolve) {
      const center = new Set(UNITS[22]);
      placed.forEach((k) => { if (center.has(k) && ci === g.evColor && !g.evLit.has(k)) { g.evLit.add(k); ev.lit = (ev.lit || []).concat(k); } });
      g.got.evolve = g.evLit.size;
    }
    // 1. 照常消
    const units = [];
    for (let u = 0; u < 27; u++) if (UNITS[u].every((k) => b[k])) units.push(u);
    const colorsBefore = g.color.slice();
    let clearedCells = [];
    if (units.length) {
      const set = new Set();
      units.forEach((u) => { unitTouches(b, UNITS[u], ev); UNITS[u].forEach((k) => set.add(k)); });
      clearedCells = [...set].filter((k) => b[k] === 1 || b[k] === 3);
      clearCells(b, [...set], ev);
    }
    // 火块：放哪儿就炸那个大格
    if (p.special === 'fire') {
      const bx = core.boxOf(r, c);
      const cells = UNITS[18 + bx];
      unitTouches(b, cells, ev);
      const hit = cells.filter((k) => b[k] === 1 || b[k] === 3);
      clearedCells = clearedCells.concat(hit);
      clearCells(b, cells, ev);
      ev.fire = { box: bx, cells: hit };
      units.push(18 + bx);
    }
    ev.units = units; ev.cells = clearedCells;
    // 2. 充能：消掉几条，每只宠物涨几格；消掉谁颜色的块，每 3 块给谁多涨 1 格
    for (const pt of g.team) {
      const mine = clearedCells.filter((k) => colorsBefore[k] === petDef(pt).color);
      const gain = units.length + Math.floor(mine.length / 3);
      if (gain) { pt.energy = Math.min(energyMax(g, pt), pt.energy + gain); ev.energy[pt.id] = gain; }
      if (mine.length) ev.sparks.push({ id: pt.id, cells: mine });
    }
    // 3. 能量满的宠物出手（从左到右，每只一次）
    for (const pt of g.team) {
      if (pt.energy >= energyMax(g, pt)) {
        pt.energy = 0;
        const act = petAct(b, pt, ev);
        ev.petActs.push(act);
        g.petActsTotal[pt.id] = (g.petActsTotal[pt.id] || 0) + 1;
      }
    }
    g.board = b;
    // 计分：放下的格子 + 每条 20，一手里多条越来越多；宠物清掉的每排 +10
    let pts = 0;
    if (units.length) { g.streak++; pts = units.length * 20 * (1 + Math.min(1.5, (units.length - 1) * 0.5)) * (1 + Math.min(1, (g.streak - 1) * 0.25)); }
    else g.streak = 0;
    pts += ev.petActs.reduce((a, x) => a + (x.lines.length + x.boxes.length) * 10 + x.cells.length, 0);
    ev.gained += Math.round(pts);
    g.score += ev.gained;
    ev.combo = units.length; ev.streak = g.streak;
    ev.beat = !units.length && !ev.petActs.length ? 1 : ev.petActs.length >= 2 || units.length >= 3 ? 5 : ev.petActs.length || units.length >= 2 ? 4 : units.some((u) => u >= 18) ? 3 : 2;
    // 过关？
    const left = core.goalLeft(g);
    if (Object.keys(left).every((k) => left[k] === 0)) {
      ev.win = true; g.over = true; g.won = true; g.reason = 'win';
      return ev;
    }
    if (!g.hand.some(Boolean)) g.deal();
    else giveGift();
    if (g.stuck()) { g.over = true; g.reason = 'stuck'; ev.stuck = true; }
    return ev;
  };
  g.nearMiss = () => !g.won && core.goalLeft(g) && (() => { let need = 0, have = 0; for (const k in st.goal) { const n = st.goal[k]; need += n; have += Math.min(n, k === 'score' ? g.score : g.got[k] || 0); } return need && have / need >= 0.7; })();
  g.goalLeft = () => core.goalLeft(g);
  return g;
}

// ---------- 机器人 ----------
function bestMove(g, skill) {
  const st = g.stage;
  const left = core.goalLeft(g);
  const cands = [];
  g.hand.forEach((p, i) => {
    if (!p) return;
    for (const [r, c] of core.placements(g.board, p)) {
      const placed = p.cells.map(([dr, dc]) => (r + dr) * 9 + c + dc);
      let v;
      let board;
      if (p.special === 'fire') {
        const cells = UNITS[18 + core.boxOf(r, c)];
        const n = cells.filter((k) => g.board[k] === 1 || g.board[k] === 3).length;
        board = g.board.slice(); cells.forEach((k) => { if (board[k] === 1 || board[k] === 3) board[k] = 0; });
        v = n * 2 + cells.filter((k) => g.board[k] === 3).length * 14 + (cells.some((k) => g.board[k] === 4) ? 16 : 0) + core.evalBoard(board, null);
      } else {
        const res = core.placeAndClear(g.board, p, r, c);
        board = res.board;
        v = res.units.length * 9 + core.evalBoard(res.board, null);
        if (left.monster > 0) v += res.cells.filter((k) => g.board[k] === 3).length * 14;
        if (left.boss > 0 && res.units.some((u) => UNITS[u].some((k) => g.board[k] === 4))) v += 16;
        if (left.box > 0 && res.units.some((u) => UNITS[u].some((k) => g.board[k] === 2))) v += 16;
        for (const k of res.cells) if (g.gem[k] && left[core.GEMS[g.gem[k]].id] > 0) v += 14;
        if (left.bubble > 0) v += res.cells.filter((k) => g.bubble[k]).length * 8;
        // 宠物颜色的块消掉更好
        const ci = g.handColor[i];
        if (g.team.some((pt) => PETS[pt.id].color === ci)) v += res.cells.length ? 2 : 0;
        // 进化关：宠物颜色的块放进正中间没亮的格子
        if (st.evolve) {
          const center = new Set(UNITS[22]);
          if (ci === g.evColor) v += placed.filter((k) => center.has(k) && !g.evLit.has(k)).length * 7;
          else v -= placed.filter((k) => center.has(k) && !g.evLit.has(k)).length * 3;
        }
      }
      cands.push({ i, r, c, v, board });
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
function simulate(opts) {
  const o = Object.assign({ skill: 1, secPerMove: () => 3 }, opts);
  const g = createPetGame(o);
  let guard = 0;
  while (!g.over && guard++ < 600) {
    const m = bestMove(g, o.skill);
    if (!m) break;
    g.elapsed += o.secPerMove(g);
    g.place(m.i, m.r, m.c);
  }
  return g;
}

module.exports = { PETS, FIRE, COLOR_NAME, createPetGame, bestMove, simulate, energyMax };
