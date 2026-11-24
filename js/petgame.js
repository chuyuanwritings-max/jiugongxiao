// 九宫消 + 宠物（0.6）的规则层。设计见 ../九宫消加宠物_设计与调研_20261124.md、检验和改法见 ../九宫消_玩法检验与关卡对照_20261125.md。
// 拖块、凑满一排或一个大格就消，这个不变。多出来的：
//   ① 方块的颜色有用了：带谁出战，就多发谁颜色的方块；消掉谁的颜色，就给谁多充能。
//   ② 宠物脚下一条能量，攒满了它自己出手（啄 / 啃 / 吐丝补满），或者吐一颗火球给你亲手放。没地方下手就先憋着，不空放。
//   ③ 墨怪：小墨怪（消掉它那一排就抓到）、铁甲怪（扣着铁锅，消了只掀掉锅，宠物碰一下才抓走）、跳跳怪（每 3 块跳一格，不出它的大格）、
//      大墨怪（头目，占 2×2，头上几颗心；会吐墨块、半血跳走、吐完晕一下，晕的时候打中掉 2 颗心）。抓到的收进葫芦，局外炼丹喂宠物。
//   ④ 铁石（只有宠物打得碎，有的两层）、机关匣、宝石、泡泡；进化关：用宠物的颜色把正中间的大格一格格点亮。
const C = require('./config.js');
const core = require('./core.js');
const { UNITS } = core;

// 盘面的值：0 空 1 块 2 机关匣 3 小墨怪 4 大墨怪 5 铁石 6 铁甲怪 7 跳跳怪
// 颜色 = C.blockColors 的序号：0 黄铜金 1 朱砂红 2 青铜绿 3 青金蓝 4 紫晶 5 赤铜 6 水银青；-1 旧铁灰（预放的块）；-2 墨块（大墨怪吐的）
const COLOR_NAME = ['金色', '红色', '绿色', '蓝色', '紫色', '橙色', '青色'];
const IS_MON = (v) => v === 3 || v === 6 || v === 7;
const EATABLE = (v) => v === 1 || IS_MON(v);

// 宠物：从弱鸡慢慢变强（energy(lv) 攒满要几格，越练越少；power(lv) 一次能干多少，越练越多）
// 0.6 按检验报告调：消一排型（铜雀、爆竹鼠）格数调少，一关能出手 3 次上下；放一块型（墨斗蚕、火麒麟）格数调多，免得它们比别人强一大截
const PETS = {
  tongque: { name: '铜雀', color: 0, charge: 'clear', act: 'row', energy: (lv) => [0, 4, 4, 3, 3, 3][Math.min(5, lv)], power: (lv) => [0, 3, 5, 7, 9, 9, 9, 9, 9, 9, 9][lv], lines: 1, evo: 'jinchique', evoLv: 5, good: '铁甲怪' },
  jinchique: { name: '金翅雀', color: 0, charge: 'clear', act: 'row', energy: () => 3, power: () => 9, lines: 2, good: '铁甲怪' },
  baozhu: { name: '爆竹鼠', color: 1, charge: 'clear', act: 'box', energy: (lv) => [0, 5, 5, 4, 4, 3][Math.min(5, lv)], power: (lv) => [0, 4, 6, 9, 9, 9, 9, 9, 9, 9, 9][lv], good: '跳跳怪、铁石' },
  modou: { name: '墨斗蚕', color: 2, charge: 'place', act: 'fill', energy: (lv) => Math.max(6, 10 - (lv - 1)), power: (lv) => Math.min(3, lv), good: '墨块、机关匣' }, // power = 能补差几格的一排
  qilin: { name: '火麒麟', color: 5, charge: 'place', act: 'gift', energy: (lv) => Math.max(7, 12 - (lv - 1)), power: (lv) => (lv >= 3 ? 9 : 5) }, // 火球：5 = 炸十字 5 格；9 = 炸整个大格
};
// 每只宠物这一级的本事：只写它干什么，动词照它是什么东西来（雀啄、金翅俯冲、鼠啃、蚕吐丝、麒麟吐火球）
function petDesc(id, lv) {
  const d = PETS[id], pw = d.power(lv || 1);
  if (id === 'tongque') return pw >= 9 ? '啄掉最满的一整排' : '啄掉最满那排的 ' + pw + ' 格';
  if (id === 'jinchique') return '俯冲扫掉最满的两排';
  if (id === 'baozhu') return pw >= 9 ? '啃空最挤的大格' : '啃掉最挤大格的 ' + pw + ' 格';
  if (id === 'modou') return '吐丝补满只差 ' + pw + ' 格的一排';
  if (id === 'qilin') return pw >= 9 ? '吐火球给你：放哪炸空哪个大格' : '吐火球给你：放哪炸哪（十字）';
  return '';
}
const CHARGE_TAG = { clear: '消一排 +1', place: '放一块 +1' };
const CHARGE_TEXT = { clear: '每消掉一排，攒一格能量', place: '每放一块，攒一格能量' };
const FIRE = { id: 'fire', cat: 0, cells: [[0, 0]], h: 1, w: 1, special: 'fire', power: 9 };
const fireOf = (pw) => (pw >= 9 ? FIRE : Object.assign({}, FIRE, { power: 5 }));
const petDef = (p) => PETS[p.id];
function energyMax(g, p) {
  if (g.stage.fastCharge) return 3; // 第 4 关：铜雀充得特别快，让人一眼看到它在帮忙
  return petDef(p).energy(p.lv);
}
const crossCells = (r, c) => [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && a < 9 && b >= 0 && b < 9).map(([a, b]) => a * 9 + b);
const boxOfK = (k) => core.boxOf(Math.floor(k / 9), k % 9);

// opts: { stage, team:[{id,lv}], seed, tutorial }
function createPetGame(opts) {
  const o = opts || {};
  const st = o.stage;
  const g = core.createGame({ stage: st, seed: o.seed, tutorial: o.tutorial });
  Object.assign(g, {
    pets: true,
    color: new Array(81).fill(0),
    rockHp: new Array(81).fill(0),
    handColor: [0, 0, 0],
    team: (st.team || o.team || []).map((p) => ({ id: p.id, lv: p.lv || 1, energy: 0 })),
    bigHp: 0, bigCells: [], boss: null, giftPending: 0,
    jumpPlan: {}, // 跳跳怪：下一手要跳到哪（先探头）
    evLit: new Set(), evColor: st.evolve ? PETS[st.evolve.pet].color : null,
    caught: 0, petActsTotal: {},
  });
  // 盘面字符：m 小墨怪；A 铁甲怪；J 跳跳怪；K 大墨怪（2×2）；R 铁石；Q 两层铁石
  st.board.forEach((row, r) => row.split('').forEach((ch, c) => {
    const k = r * 9 + c;
    if (ch === 'm') g.board[k] = 3;
    else if (ch === 'A') g.board[k] = 6;
    else if (ch === 'J') g.board[k] = 7;
    else if (ch === 'K') { g.board[k] = 4; g.bigCells.push(k); }
    else if (ch === 'R') { g.board[k] = 5; g.rockHp[k] = 1; }
    else if (ch === 'Q') { g.board[k] = 5; g.rockHp[k] = 2; }
    if (g.board[k] === 1) g.color[k] = -1;
  }));
  if (g.bigCells.length) {
    g.bigHp = st.bigHp || 3;
    g.boss = { hp: g.bigHp, max: g.bigHp, phase: 1, count: 0, nextSpit: null, jumpTo: null, stun: false, angry: !!st.bossAngry };
  }
  // 发块的颜色：出战宠物的颜色多发（×2.5），这一关的颜色表里没有它的颜色就自动加上；进化关只发它的颜色和旧铁、蓝
  const palette = (st.colors || [0, 1, 2, 3]).slice();
  if (!st.evolve) g.team.forEach((p) => { if (!palette.includes(petDef(p).color)) palette.push(petDef(p).color); });
  g.pickColor = () => {
    const ws = palette.map((ci) => ({ ci, w: g.team.some((p) => petDef(p).color === ci) ? 2.5 : 1 }));
    let t = g.rand() * ws.reduce((a, x) => a + x.w, 0);
    for (const x of ws) { if ((t -= x.w) <= 0) return x.ci; }
    return ws[0].ci;
  };
  const baseDeal = g.deal;
  g.deal = () => { baseDeal(); g.handColor = g.hand.map(() => g.pickColor()); giveGift(); };
  // 换一组：火球留着不换
  const baseReroll = g.reroll;
  g.reroll = () => {
    const keep = g.hand.map((p) => (p && p.special ? p : null));
    baseReroll();
    g.hand = g.hand.map((p, i) => keep[i] || p);
    g.handColor = g.hand.map((p) => (p && p.special ? 5 : g.pickColor()));
  };
  function giveGift() {
    while (g.giftPending > 0) {
      const slot = g.hand.findIndex((x) => !x);
      if (slot < 0) break;
      g.hand[slot] = fireOf(g.giftPower || 9); g.handColor[slot] = 5; if (g.handGem) g.handGem[slot] = null; g.giftPending--;
    }
  }
  g.handColor = g.hand.map(() => g.pickColor());

  // 清掉一批格子。byPet：宠物下的手（铁甲怪只有宠物抓得走；你消掉它那排只是把锅掀了）
  function clearCells(b, cells, ev, byPet) {
    for (const k of cells) {
      const v = b[k];
      if (v === 0 || v === 2 || v === 4 || v === 5) continue;
      // 铁甲怪：你消掉它那一排，锅「当」地弹一下，它缩头，抓不走；宠物碰它一下，锅碎了，变回小墨怪，再消就抓到
      if (v === 6 && !byPet) { (ev.armorBounce = ev.armorBounce || []).push(k); continue; }
      if (v === 6 && byPet) { b[k] = 3; (ev.armorBreak = ev.armorBreak || []).push(k); continue; }
      if (IS_MON(v)) { if ('monster' in g.got) g.got.monster++; g.caught++; ev.collected.push({ k, what: 'monster' }); delete g.jumpPlan[k]; }
      if (g.gem[k]) { const id = core.GEMS[g.gem[k]].id; if (id in g.got) { g.got[id]++; ev.collected.push({ k, what: id }); } g.gem[k] = 0; }
      if (g.bubble[k]) { g.bubble[k] = 0; if ('bubble' in g.got) { g.got.bubble++; ev.collected.push({ k, what: 'bubble' }); } }
      b[k] = 0;
    }
  }
  // 一次「消掉」（一排 / 一个大格）碰到了机关匣或大墨怪
  function unitTouches(b, cells, ev, byPet) {
    if ('box' in g.got && cells.some((k) => b[k] === 2)) { g.got.box++; ev.collected.push({ k: cells.find((k) => b[k] === 2), what: 'box' }); }
    if (g.boss && g.bigHp > 0 && cells.some((k) => b[k] === 4)) {
      const dmg = byPet || ev.stunHit ? 2 : 1; // 宠物咬它、或者它刚吐完墨正晕着：一下掉 2 颗心
      g.bigHp = Math.max(0, g.bigHp - dmg);
      g.boss.hp = g.bigHp;
      ev.bigHits.push({ k: g.bigCells[0], dmg });
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
  const fillCount = (b, cells) => cells.filter((k) => EATABLE(b[k])).length;
  const rockLeft = () => 'rock' in g.got && g.got.rock < st.goal.rock;
  // 宠物挑地方：越满越好；铁石（铁石关）、铁甲怪、跳跳怪、大墨怪加分
  const lineScore = (b, cells) => fillCount(b, cells)
    + (rockLeft() ? cells.filter((k) => b[k] === 5).length * 5 : 0)
    + cells.filter((k) => b[k] === 6).length * 3 + cells.filter((k) => b[k] === 7).length * 2
    + (g.bigHp > 0 && cells.some((k) => b[k] === 4) ? 4 : 0);
  function breakRocks(b, cells, ev) {
    for (const k of cells) {
      if (b[k] !== 5) continue;
      if (g.rockHp[k] > 1) { g.rockHp[k]--; (ev.rockCrack = ev.rockCrack || []).push(k); continue; } // 两层：先裂
      b[k] = 0; g.rockHp[k] = 0;
      if ('rock' in g.got) g.got.rock++;
      ev.collected.push({ k, what: 'rock' }); (ev.rocks = ev.rocks || []).push(k);
    }
  }
  // 一排 / 一个大格里先啃哪几格：铁石 > 铁甲怪 > 跳跳怪 > 小墨怪 > 带宝石的 > 普通块
  function pickBites(b, cells, n) {
    const pri = (k) => (b[k] === 5 ? (rockLeft() ? 5 : 0.5) : b[k] === 6 ? 4 : b[k] === 7 ? 3.5 : b[k] === 3 ? 3 : g.gem[k] ? 2 : b[k] === 1 ? 1 : 0);
    return cells.filter((k) => pri(k) > 0).sort((x, y) => pri(y) - pri(x)).slice(0, n);
  }
  // 这只宠物现在能下手的地方（按好坏排）；空 = 没地方下手，先憋着
  function targets(b, p) {
    const d = petDef(p), pw = d.power(p.lv);
    if (d.act === 'row') {
      const out = [];
      for (let i = 0; i < 9; i++) for (const axis of ['row', 'col']) { const n = lineScore(b, lineCells(axis, i)); if (n > 0) out.push({ axis, i, n }); }
      return out.sort((x, y) => y.n - x.n);
    }
    if (d.act === 'box') {
      const out = [];
      for (let bx = 0; bx < 9; bx++) { const n = lineScore(b, lineCells('box', bx)); if (n > 0) out.push({ axis: 'box', i: bx, n }); }
      return out.sort((x, y) => y.n - x.n);
    }
    if (d.act === 'fill') {
      const out = [];
      for (const axis of ['row', 'col']) for (let i = 0; i < 9; i++) {
        const cells = lineCells(axis, i), e = cells.filter((k) => !b[k]).length;
        if (e >= 1 && e <= pw) out.push({ axis, i, n: 10 - e + cells.filter((k) => b[k] === 5 || IS_MON(b[k]) || g.color[k] === -2).length * 2 });
      }
      return out.sort((x, y) => y.n - x.n);
    }
    return [{ axis: 'gift' }];
  }
  // 宠物出手（在 b 上改）。tg 不给就挑最好的；返回 null = 没地方下手
  function petAct(b, p, ev, tgList) {
    const d = petDef(p), pw = d.power(p.lv);
    const list = tgList || targets(b, p);
    if (!list.length) return null;
    const act = { id: p.id, kind: d.act, lines: [], boxes: [], cells: [] };
    const bite = (cells) => {
      const eat = pw >= 9 ? cells.filter((k) => EATABLE(b[k]) || b[k] === 5) : pickBites(b, cells, pw);
      if (pw >= 9 || cells.some((k) => b[k] === 4)) unitTouches(b, pw >= 9 ? cells : cells.filter((k) => b[k] === 4), ev, true);
      breakRocks(b, eat, ev);
      act.cells.push(...eat.filter((k) => EATABLE(b[k]) || (ev.rocks || []).includes(k) || (ev.rockCrack || []).includes(k)));
      clearCells(b, eat.filter((k) => EATABLE(b[k])), ev, true);
      eat.filter((k) => b[k] === 3 && (ev.armorBreak || []).includes(k)).forEach((k) => { if (!act.cells.includes(k)) act.cells.push(k); });
    };
    if (d.act === 'row') {
      for (const L of list.slice(0, d.lines || 1)) { bite(lineCells(L.axis, L.i)); act.lines.push({ axis: L.axis, idx: L.i }); }
    } else if (d.act === 'box') {
      const L = list[0]; bite(lineCells('box', L.i)); act.boxes.push(L.i);
    } else if (d.act === 'fill') {
      const L = list[0], cells = lineCells(L.axis, L.i);
      const filled = cells.filter((k) => !b[k]);
      filled.forEach((k) => { b[k] = 1; g.color[k] = 2; });
      unitTouches(b, cells, ev, true);
      breakRocks(b, cells, ev); // 丝把铁石勒碎（带错宠物只是慢，不会死局）
      act.cells.push(...cells.filter((k) => EATABLE(b[k])));
      clearCells(b, cells, ev, true);
      act.lines.push({ axis: L.axis, idx: L.i, filled });
    } else if (d.act === 'gift') {
      g.giftPending++;
      g.giftPower = pw;
    }
    if ('acts' in g.got) g.got.acts++;
    return act;
  }
  // 救场：把能下手的地方挨个试，挑「啃完以后手上有块放得下」的那一处
  function rescueTarget(p) {
    const list = targets(g.board, p).slice(0, 10);
    for (const t of list) {
      const b2 = g.board.slice();
      const dummy = { collected: [], bigHits: [] };
      const save = { got: JSON.stringify(g.got), bigHp: g.bigHp, rockHp: g.rockHp.slice(), color: g.color.slice(), gift: g.giftPending, caught: g.caught };
      petAct(b2, p, dummy, [t]);
      const ok = g.hand.some((pc) => pc && core.anyPlacement(b2, pc));
      g.got = JSON.parse(save.got); g.bigHp = save.bigHp; if (g.boss) g.boss.hp = save.bigHp; g.rockHp = save.rockHp; g.color = save.color; g.giftPending = save.gift; g.caught = save.caught;
      if (ok) return [t];
    }
    return null;
  }

  // ---------- 墨怪的回合（每放一块之后） ----------
  function monsterTurn(b, ev) {
    // 跳跳怪：上一手探过头的，这一手跳过去；每 3 块探一次头
    for (const from of Object.keys(g.jumpPlan).map(Number)) {
      const to = g.jumpPlan[from];
      delete g.jumpPlan[from];
      if (b[from] === 7 && b[to] === 0) { b[to] = 7; b[from] = 0; (ev.jumps = ev.jumps || []).push({ from, to }); }
    }
    if (g.moves % 3 === 2) {
      for (let k = 0; k < 81; k++) {
        if (b[k] !== 7) continue;
        const bx = boxOfK(k), empty = UNITS[18 + bx].filter((x) => b[x] === 0 && !Object.values(g.jumpPlan).includes(x));
        if (empty.length) g.jumpPlan[k] = empty[Math.floor(g.rand() * empty.length)];
      }
    }
    // 大墨怪
    const bs = g.boss;
    if (!bs || g.bigHp <= 0) return;
    bs.count++;
    // 跳：上一手亮过红的地方，这一手跳过去，落下时把那 4 格里的块压碎
    if (bs.jumpTo !== null) {
      const tl = bs.jumpTo, cells = [tl, tl + 1, tl + 9, tl + 10];
      const old = g.bigCells.slice();
      old.forEach((k) => (b[k] = 0));
      const crushed = cells.filter((k) => EATABLE(b[k]));
      clearCells(b, crushed, ev, false);
      cells.forEach((k) => { b[k] = 4; g.color[k] = 0; });
      g.bigCells = cells;
      ev.bossJump = { from: old[0], to: tl, crushed };
      bs.jumpTo = null;
    }
    if (bs.phase === 1 && g.bigHp * 2 <= bs.max) {
      // 半血：找个能落脚的 2×2，先亮红一手
      bs.phase = 2;
      const opts2 = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const tl = r * 9 + c, cells = [tl, tl + 1, tl + 9, tl + 10];
        if (cells.some((k) => g.bigCells.includes(k))) continue;
        if (cells.every((k) => b[k] === 0 || b[k] === 1)) opts2.push(tl);
      }
      if (opts2.length) { bs.jumpTo = opts2[Math.floor(g.rand() * opts2.length)]; ev.bossJumpPlan = bs.jumpTo; }
    }
    // 吐墨：阶段一每 4 块、阶段二每 3 块吐一块；吐之前一手先冒黑泡（nextSpit）
    const every = (bs.phase === 1 ? 4 : 3) - (bs.angry ? 1 : 0); // 第二章的头目吐得更勤
    if (bs.nextSpit !== null) {
      const k = bs.nextSpit;
      bs.nextSpit = null;
      if (b[k] === 0) { b[k] = 1; g.color[k] = -2; ev.bossSpit = k; bs.stun = true; g.spits = (g.spits || 0) + 1; return; }
    }
    bs.stun = false;
    if (bs.count % every === every - 1) {
      const near = [];
      g.bigCells.forEach((k) => { const r = Math.floor(k / 9), c = k % 9; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 9 && cc >= 0 && cc < 9 && b[rr * 9 + cc] === 0) near.push(rr * 9 + cc); } });
      const pool = near.length ? near : [...Array(81).keys()].filter((k) => b[k] === 0);
      if (pool.length) bs.nextSpit = pool[Math.floor(g.rand() * pool.length)];
    }
  }

  g.place = (i, r, c) => {
    const p = g.hand[i];
    if (!p || g.over || !core.canPlace(g.board, p, r, c)) return null;
    const ci = g.handColor[i];
    const b = g.board.slice();
    const placed = p.cells.map(([dr, dc]) => (r + dr) * 9 + c + dc);
    placed.forEach((k) => { b[k] = 1; g.color[k] = ci; });
    const hg = g.handGem && g.handGem[i];
    if (hg) g.gem[placed[hg.cell]] = hg.kind;
    if (g.handGem) g.handGem[i] = null;
    g.hand[i] = null;
    g.moves++;
    const ev = { piece: p, r, c, placed, units: [], cells: [], collected: [], bigHits: [], petActs: [], energy: {}, sparks: [], fire: null, gained: p.cells.length, win: false, stunHit: !!(g.boss && g.boss.stun) };
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
      clearedCells = [...set].filter((k) => EATABLE(b[k]));
      clearCells(b, [...set], ev, false);
    }
    // 火球：9 = 炸空整个大格；5 = 炸十字（放下的那格 + 上下左右）
    if (p.special === 'fire') {
      const bx = core.boxOf(r, c);
      const big = (p.power || 9) >= 9;
      const cells = big ? UNITS[18 + bx] : crossCells(r, c);
      breakRocks(b, cells, ev);
      if (big || cells.some((k) => b[k] === 4)) unitTouches(b, cells, ev, true);
      const hit = cells.filter((k) => EATABLE(b[k]));
      clearedCells = clearedCells.concat(hit);
      clearCells(b, cells, ev, true); // 火球是麒麟给的，算宠物下手
      ev.fire = { box: bx, cells: hit, small: !big, r, c };
      if (big) units.push(18 + bx);
    }
    ev.units = units; ev.cells = clearedCells;
    // 2. 积蓄能量（多出来的留到下一次）
    for (const pt of g.team) {
      const mine = clearedCells.filter((k) => colorsBefore[k] === petDef(pt).color);
      const gain = (petDef(pt).charge === 'place' ? 1 : units.length) + Math.floor(mine.length / 3);
      if (gain) { pt.energy = Math.min(energyMax(g, pt) * 2 - 1, pt.energy + gain); ev.energy[pt.id] = gain; }
      if (mine.length) ev.sparks.push({ id: pt.id, cells: mine });
    }
    // 3. 能量满的宠物出手；没地方下手就憋着，能量留满
    for (const pt of g.team) {
      if (pt.energy >= energyMax(g, pt)) {
        const act = petAct(b, pt, ev);
        if (act) { pt.energy -= energyMax(g, pt); ev.petActs.push(act); g.petActsTotal[pt.id] = (g.petActsTotal[pt.id] || 0) + 1; }
      }
    }
    // 4. 墨怪的回合（过关就不动了）
    let left = core.goalLeft(g);
    const done = () => Object.keys(left).every((k) => left[k] === 0);
    if (!done()) monsterTurn(b, ev);
    g.board = b;
    // 计分
    let pts = 0;
    if (units.length) { g.streak++; pts = units.length * 20 * (1 + Math.min(1.5, (units.length - 1) * 0.5)) * (1 + Math.min(1, (g.streak - 1) * 0.25)); }
    else g.streak = 0;
    pts += ev.petActs.reduce((a, x) => a + (x.lines.length + x.boxes.length) * 10 + x.cells.length, 0);
    ev.gained += Math.round(pts);
    g.score += ev.gained;
    ev.combo = units.length; ev.streak = g.streak;
    ev.beat = !units.length && !ev.petActs.length ? 1 : ev.petActs.length >= 2 || units.length >= 3 ? 5 : ev.petActs.length || units.length >= 2 ? 4 : units.some((u) => u >= 18) ? 3 : 2;
    left = core.goalLeft(g);
    if (done()) { ev.win = true; g.over = true; g.won = true; g.reason = 'win'; return ev; }
    if (!g.hand.some(Boolean)) g.deal();
    else giveGift();
    // 雪中送炭：快堵死了，攒到一半以上的宠物提前出手，挑「啃完你手上的块放得下」的地方
    if (g.stuck()) {
      const helpers = g.team.filter((pt) => pt.energy * 2 >= energyMax(g, pt)).sort((x, y) => y.energy / energyMax(g, y) - x.energy / energyMax(g, x));
      for (const pt of helpers) {
        if (!g.stuck()) break;
        if (petDef(pt).act === 'gift') {
          const slot = g.hand.findIndex((x, k) => x && !g.fits(k));
          if (slot >= 0) { g.hand[slot] = fireOf(petDef(pt).power(pt.lv)); g.handColor[slot] = 5; if (g.handGem) g.handGem[slot] = null; }
          pt.energy = 0;
          ev.petActs.push({ id: pt.id, kind: 'gift', lines: [], boxes: [], cells: [], rescue: true });
        } else {
          const tg = rescueTarget(pt);
          if (!tg) continue;
          const b2 = g.board.slice();
          const act = petAct(b2, pt, ev, tg);
          g.board = b2;
          pt.energy = 0;
          act.rescue = true;
          ev.petActs.push(act);
        }
        g.petActsTotal[pt.id] = (g.petActsTotal[pt.id] || 0) + 1;
        ev.rescue = pt.id;
      }
      left = core.goalLeft(g);
      if (done()) { ev.win = true; g.over = true; g.won = true; g.reason = 'win'; return ev; }
    }
    if (g.stuck()) { g.over = true; g.reason = 'stuck'; ev.stuck = true; }
    return ev;
  };
  // 宠物下一次要下手的地方（能量差 1 格时画面亮出来）
  g.petTarget = (pt) => { const t = targets(g.board, pt)[0]; return t && t.axis !== 'gift' ? t : null; };
  g.nearMiss = () => !g.won && (() => { let need = 0, have = 0; for (const k in st.goal) { const n = st.goal[k]; need += n; have += Math.min(n, k === 'score' ? g.score : g.got[k] || 0); } return need && have / need >= 0.7; })();
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
      let v, board;
      if (p.special === 'fire') {
        const cells = (p.power || 9) >= 9 ? UNITS[18 + core.boxOf(r, c)] : crossCells(r, c);
        board = g.board.slice(); cells.forEach((k) => { if (EATABLE(board[k])) board[k] = 0; });
        v = cells.filter((k) => EATABLE(g.board[k])).length * 2 + cells.filter((k) => IS_MON(g.board[k])).length * 14 + (cells.some((k) => g.board[k] === 4) ? 16 : 0) + cells.filter((k) => g.board[k] === 5).length * 12 + core.evalBoard(board, null);
      } else {
        const res = core.placeAndClear(g.board, p, r, c);
        board = res.board;
        v = res.units.length * 9 + core.evalBoard(res.board, null);
        if (left.monster > 0) v += res.cells.filter((k) => g.board[k] === 3 || g.board[k] === 7).length * 14;
        if (left.boss > 0 && res.units.some((u) => UNITS[u].some((k) => g.board[k] === 4))) v += 16 + (g.boss && g.boss.stun ? 16 : 0);
        if (left.box > 0 && res.units.some((u) => UNITS[u].some((k) => g.board[k] === 2))) v += 16;
        if (left.rock > 0 || left.acts > 0) v += res.units.length * 3;
        for (const k of res.cells) if (g.gem[k] && left[core.GEMS[g.gem[k]].id] > 0) v += 14;
        if (left.bubble > 0) v += res.cells.filter((k) => g.bubble[k]).length * 8;
        const ci = g.handColor[i];
        if (g.team.some((pt) => PETS[pt.id].color === ci)) v += res.cells.length ? 2 : 0;
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
  while (!g.over && guard++ < 400) {
    const m = bestMove(g, o.skill);
    if (!m) break;
    g.elapsed += o.secPerMove(g);
    g.place(m.i, m.r, m.c);
  }
  return g;
}

module.exports = { petDesc, CHARGE_TAG, CHARGE_TEXT, PETS, FIRE, COLOR_NAME, IS_MON, createPetGame, bestMove, simulate, energyMax };
