// 【宠物系统重做副本 v2，Fable 2026-11-25】在 js/petgame.js 0.9.5 上改。报告：../../../九宫消_宠物系统重做_20261125.md 第二节。Kira 照着合进 js/petgame.js。
// 和原版的四处不同：
//   ① 宠物不再自己出手。能量满了，它吐一块「技能块」到托盘的第 4 格（宠物格，g.hand[3]），你自己拖到盘上，放哪打哪；存着不用也行（最多存一块）。
//      技能块只打它周围一小片（3–13 格），放下去不算一手、墨怪不动。四只宠物四种形状：铜雀横着啄、火麒麟竖着烧、爆竹鼠炸一圈、墨斗蚕斜着缠。
//   ② 克制：每种墨怪只有对口的宠物的技能块抓得走（不管几层甲、什么颜色、不分身）；不对口的打不动它，只清得掉旁边的方块。小墨怪谁都抓得走。你自己消，规矩不变。
//   ③ 所有宠物一个攒法：每消掉一排 / 一个大格攒一格；消掉它颜色的方块每 3 块多攒一格。
//   ④ 没有手数上限（Cc 11-25 否了）。一关的墨怪分几波冒出来（stage.waves），盘面不清空；输法只有「三块都放不下」。
//   ⑤ 救命并在宠物身上：堵死时能量条里有东西，它就提前把技能块给你。
// 上一版（宠物自己出手 + 克制）留在 v1_auto/。
// 九宫消 + 宠物（0.6）的规则层。设计见 ../九宫消加宠物_设计与调研_20261124.md、检验和改法见 ../九宫消_玩法检验与关卡对照_20261125.md。
// 拖块、凑满一排或一个大格就消，这个不变。多出来的：
//   ① 方块的颜色有用了：带谁出战，就多发谁颜色的方块；消掉谁的颜色，就给谁多充能。
//   ② 宠物脚下一条能量，攒满了它自己出手（啄 / 啃 / 吐丝补满），或者吐一颗火球给你亲手放。没地方下手就先憋着，不空放。
//   ③ 墨怪（0.7 起一大家子，图鉴见 ../九宫消_墨怪与头目图鉴_20261124.md）：盘面上都记成 3，种类、甲、颜色、倒数记在 g.mon[k]。
//      小墨怪、甲壳怪（几层甲，每消一次掉一层）、跳跳怪、馋嘴怪（啃你的块）、挑色怪（那排里要有它的颜色）、墨苔怪（长墨块）、
//      炸弹怪（倒数到 0 溅墨）、分身怪（打一下分成两只小墨怪）。宠物碰一下伤害加倍、不挑颜色、不让它分身。
//      头目占 2×2，头上几颗心，半血跳走：大墨怪（吐墨）、大馋嘴（啃块）、分身王（挨一下蹦一只小墨怪）。抓到的收进葫芦，局外炼丹喂宠物。
//   ④ 铁石（只有宠物打得碎，有的两层）、机关匣、宝石、泡泡；进化关：用宠物的颜色把正中间的大格一格格点亮。
const C = require('../../js/config.js');
const core = require('../../js/core.js');
const { UNITS } = core;

// 盘面的值：0 空 1 块 2 机关匣 3 墨怪（各种，见 g.mon）4 头目 5 铁石
// 颜色 = C.blockColors 的序号：0 黄铜金 1 朱砂红 2 青铜绿 3 青金蓝 4 紫晶 5 赤铜 6 水银青；-1 旧铁灰（预放的块）；-2 墨块（大墨怪吐的）
const COLOR_NAME = ['金色', '红色', '绿色', '蓝色', '紫色', '橙色', '青色'];
const IS_MON = (v) => v === 3;
// 墨怪的种类。cd = 隔几手动一次手；hp = 甲壳怪的甲有几层
const MON = {
  ink: { name: '小墨怪' }, shell: { name: '甲壳怪' }, jump: { name: '跳跳怪' }, eat: { name: '馋嘴怪', cd: 3 },
  color: { name: '挑色怪' }, moss: { name: '墨苔怪', cd: 3 }, bomb: { name: '炸弹怪', cd: 9 }, split: { name: '分身怪' },
};
const MON_CHAR = { m: 'ink', A: 'shell', B: 'shell', C: 'shell', J: 'jump', E: 'eat', G: 'moss', T: 'bomb', S: 'split' };
const cdOf = (t) => (RULES.pester[t] || MON[t].cd || 0);
const newMon = (t, extra) => Object.assign({ t, hp: 0, col: -1, cd: cdOf(t), tgt: null }, extra || {});
const near8 = (k) => { const r = Math.floor(k / 9), c = k % 9, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const a = r + dr, b = c + dc; if (a >= 0 && a < 9 && b >= 0 && b < 9) out.push(a * 9 + b); } return out; };
const EATABLE = (v) => v === 1 || IS_MON(v);

// 宠物：能量满了吐一块技能块。tier（技能块大小）：1–2 级小、3–4 级中、5 级起（进化后）大。energy(lv)：攒满要几格。
// kind = 克制表里它算哪一路（row 啄 / box 炸 / fill 缠 / gift 烧）；shape = 技能块打哪几格（h 横条 / v 竖条 / sq 一圈 / x 斜叉）
const tierOf = (lv) => (lv >= 5 ? 3 : lv >= 3 ? 2 : 1);
const PETS = {
  tongque: { name: '铜雀', color: 0, charge: 'clear', act: 'gift', kind: 'row', shape: 'h', energy: (lv) => (lv >= 4 ? 2 : 3), power: tierOf, evo: 'jinchique', evoLv: 5 },
  jinchique: { name: '金翅雀', color: 0, charge: 'clear', act: 'gift', kind: 'row', shape: 'h', energy: () => 2, power: () => 3 },
  baozhu: { name: '爆竹鼠', color: 1, charge: 'clear', act: 'gift', kind: 'box', shape: 'sq', energy: (lv) => (lv >= 4 ? 3 : 4), power: tierOf, evoLv: 5 },
  modou: { name: '墨斗蚕', color: 2, charge: 'clear', act: 'gift', kind: 'fill', shape: 'x', energy: (lv) => (lv >= 4 ? 2 : 3), power: tierOf, evoLv: 5 },
  qilin: { name: '火麒麟', color: 5, charge: 'clear', act: 'gift', kind: 'gift', shape: 'v', energy: (lv) => (lv >= 4 ? 2 : 3), power: tierOf, evoLv: 5 },
};
// 技能块放在 (r, c)，打到哪几格（含它自己那格）
function skillCells(shape, tier, r, c) {
  const out = [[0, 0]];
  const n = tier; // 伸出去几格（横条、竖条多伸一格：5 / 7 / 9 格；一圈和斜叉：5 / 9 / 13 格）
  if (shape === 'h') for (let d = 1; d <= n + 1; d++) out.push([0, -d], [0, d]);
  else if (shape === 'v') for (let d = 1; d <= n + 1; d++) out.push([-d, 0], [d, 0]);
  else if (shape === 'x') for (let d = 1; d <= n; d++) out.push([-d, -d], [-d, d], [d, -d], [d, d]);
  else if (shape === 'sq') {
    out.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    if (tier >= 2) out.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (tier >= 3) out.push([-2, 0], [2, 0], [0, -2], [0, 2]);
  }
  return out.map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && a < 9 && b >= 0 && b < 9).map(([a, b]) => a * 9 + b);
}
const SKILL_VERB = { h: '横着啄', v: '竖着烧', sq: '炸', x: '斜着缠' };
// 每只宠物这一级的本事（一行字）
function petDesc(id, lv) {
  const d = PETS[id], t = d.power(lv || 1), n = skillCells(d.shape, t, 4, 4).length;
  return '吐一块技能块：放哪，' + SKILL_VERB[d.shape] + '哪（' + n + ' 格）';
}
const CHARGE_TAG = { clear: '消一排 +1', place: '消一排 +1' };
const CHARGE_TEXT = { clear: '每消掉一排，攒一格能量', place: '每放一块，攒一格能量' };
// ---------- 克制（Cc 11-25 定 A：「带对的宠物」要真的要紧）----------
// 每种墨怪只怕一只宠物；小墨怪谁都怕。对口的技能块一下抓走（不管几层甲、什么颜色、不分身、跳不掉）；
// 不对口的打不动它（它缩一下躲过去），只清得掉它身边的方块。你自己消，规矩和原来一样。
//   row 铜雀 / 金翅雀  box 爆竹鼠  fill 墨斗蚕  gift 火麒麟
const RULES = {
  nemesis: { shell: 'row', eat: 'fill', jump: 'box', split: 'box', moss: 'fill', bomb: 'gift' }, // 挑色怪：和它同色的宠物
  bossWeak: { spit: null, eat: 'fill', split: 'box' }, // 头目怕谁（null = 谁咬都掉 1 颗心）
  bossWeakDmg: 3,    // 对口的宠物咬头目一口掉几颗心
  bossOtherDmg: 1,   // 别的宠物咬一口掉几颗心（和原来一样）
  pester: { shell: 3, jump: 3, color: 3, split: 3 }, // 这几种墨怪活着的时候，每隔几手冲宠物喷一口墨：偷走 steal 格能量（先瞪宠物一手；它的克星不怕）。墨苔怪长墨时、馋嘴怪啃块时也偷。
  steal: 2,          // 墨怪对宠物使坏：馋嘴怪 / 大馋嘴每啃一口，偷走宠物几格能量（它的克星墨斗蚕不怕）
  bombDrain: true,   // 炸弹怪炸开时，把宠物的能量炸光（它的克星火麒麟不怕）
  rescue: 'any',     // 救命：三块都放不下、宠物格空着时，宠物提前把技能块给你、能量清空。'any' = 能量条里有一格就救；'half' = 攒到一半以上才救
  rockNemesis: 'box', rockDmg: 2, // 爆竹鼠一口啃穿两层铁石，别的宠物一次一层
};
// 这只宠物（pet = { act, color }）是不是这只墨怪的克星
function isCounter(m, pet) {
  if (!m || !pet) return false;
  if (m.t === 'ink') return true;
  if (m.t === 'color') return pet.color === m.col;
  return RULES.nemesis[m.t] === pet.act;
}
const petOf = (id) => ({ act: PETS[id].kind, color: PETS[id].color, id });
// 这一关带谁最顺：数一数盘上的东西各怕谁（给关卡表的 best、章页「带它最顺」「先练谁」用）
function bestPetFor(st) {
  const sc = { row: 0, box: 0, fill: 0, gift: 0 }, colSc = {};
  st.board.forEach((row) => row.split('').forEach((ch) => {
    const t = MON_CHAR[ch];
    if (t && t !== 'ink') { const a = RULES.nemesis[t]; sc[a] += t === 'shell' ? (ch === 'A' ? 1 : ch === 'B' ? 2 : 3) : 2; }
    else if (ch >= '0' && ch <= '6') colSc[+ch] = (colSc[+ch] || 0) + 2;
    else if (ch === 'R') sc[RULES.rockNemesis] += 1; else if (ch === 'Q') sc[RULES.rockNemesis] += 2;
    else if (ch === 'M') sc.fill += 2;
  }));
  if (st.goal.boss) { const a = RULES.bossWeak[st.bossKind || 'spit']; if (a) sc[a] += 10; }
  const ids = ['tongque', 'baozhu', 'modou', 'qilin'];
  const score = (id) => sc[PETS[id].kind] + (colSc[PETS[id].color] || 0);
  const out = ids.map((id) => ({ id, n: score(id) })).sort((x, y) => y.n - x.n);
  return out[0].n > 0 ? out : [];
}
const FIRE = { id: 'skill', cat: 0, cells: [[0, 0]], h: 1, w: 1, special: 'skill' }; // 名字留着给 main.js；现在每只宠物的技能块都是这个模子
const skillPiece = (pt) => Object.assign({}, FIRE, { pet: pt.id, tier: PETS[pt.id].power(pt.lv) });
const petDef = (p) => PETS[p.id];
function energyMax(g, p) {
  if (g.stage.fastCharge) return 3; // 登场关：充得特别快，让人一眼看到它在帮忙
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
    handColor: [0, 0, 0, 0],
    team: (st.team || o.team || []).map((p) => ({ id: p.id, lv: p.lv || 1, energy: 0 })),
    bigHp: 0, bigCells: [], boss: null, skillUses: 0,
    jumpPlan: {}, // 跳跳怪：下一手要跳到哪（先探头）
    mon: new Array(81).fill(null), // 墨怪的种类和状态
    spawnQ: [], // 分身怪 / 分身王：这一手打完以后要蹦出来的小墨怪（从哪格旁边）
    monStats: { cracks: 0, eats: 0, moss: 0, bombs: 0, spawns: 0, colorMiss: 0 }, // 这一关墨怪干了几回（测试和以后的统计用）
    playStats: { clearMoves: 0, dry: 0, maxDry: 0, bossByPlayer: 0, bossByPet: 0, units: 0 }, // 手感统计：几手有消、最长几手没消、头目的心谁打掉的
    evLit: new Set(), evColor: st.evolve ? PETS[st.evolve.pet].color : null,
    caught: 0, petActsTotal: {},
  });
  // 盘面字符：m 小墨怪；A/B/C 甲壳怪 1/2/3 层；J 跳跳怪；E 馋嘴怪；G 墨苔怪；T 炸弹怪；S 分身怪；0–6 挑色怪（那种颜色）；
  //           K 头目（2×2）；R 铁石；Q 两层铁石
  // 把一个字符摆到盘上的第 k 格（墨怪 / 铁石）；摆了返回 true
  function putChar(b, ch, k) {
    if (MON_CHAR[ch]) { b[k] = 3; g.mon[k] = newMon(MON_CHAR[ch], { hp: ch === 'A' ? 1 : ch === 'B' ? 2 : ch === 'C' ? 3 : 0 }); return true; }
    if (ch >= '0' && ch <= '6') { b[k] = 3; g.mon[k] = newMon('color', { col: +ch }); return true; }
    if (ch === 'R') { b[k] = 5; g.rockHp[k] = 1; return true; }
    if (ch === 'Q') { b[k] = 5; g.rockHp[k] = 2; return true; }
    return false;
  }
  st.board.forEach((row, r) => row.split('').forEach((ch, c) => {
    const k = r * 9 + c;
    if (!putChar(g.board, ch, k) && ch === 'K') { g.board[k] = 4; g.bigCells.push(k); }
    if (g.board[k] === 1) g.color[k] = -1;
  }));
  // 一波一波冒出来（stage.waves）：盘上的墨怪抓光了（要打铁石的关，铁石也打光了），下一波墨怪从墨里冒出来。盘面不清空：你放的块、墨块都还在。
  // 每一波写成一张 9×9 的小图，只认里面的墨怪和铁石；那一格被占了，就冒在离它最近的空格。没有手数上限，也没有倒计时：输法只有「三块都放不下」。
  const isMonCh = (ch) => !!MON_CHAR[ch] || (ch >= '0' && ch <= '6');
  g.waveQ = (st.waves || []).map((w) => w.slice());
  g.waveNo = 1; g.waveTotal = 1 + g.waveQ.length;
  const waveMonCount = () => g.waveQ.reduce((a, w) => a + w.join('').split('').filter(isMonCh).length, 0);
  function nextWave(b, ev) {
    if (!g.waveQ.length || g.mon.some(Boolean)) return;
    if ('rock' in g.got && b.some((v) => v === 5)) return; // 要打铁石的关：这张盘的铁石也打光了才换
    const w = g.waveQ.shift(); g.waveNo++;
    const dropped = [];
    w.forEach((row, r) => row.split('').forEach((ch, c) => {
      if (!isMonCh(ch) && ch !== 'R' && ch !== 'Q') return;
      let k = r * 9 + c;
      if (b[k] !== 0) { let best = -1, bd = 99; for (let x = 0; x < 81; x++) { if (b[x] !== 0) continue; const d = Math.abs(Math.floor(x / 9) - r) + Math.abs((x % 9) - c); if (d < bd) { bd = d; best = x; } } k = best; }
      if (k >= 0 && putChar(b, ch, k)) dropped.push(k);
    }));
    ev.wave = { no: g.waveNo, of: g.waveTotal, cells: dropped };
  }
  if (g.bigCells.length) {
    g.bigHp = st.bigHp || 3;
    g.boss = { kind: st.bossKind || 'spit', hp: g.bigHp, max: g.bigHp, phase: 1, count: 0, nextSpit: null, eatPlan: null, jumpTo: null, stun: false, angry: !!st.bossAngry };
  }
  if (g.boss && g.boss.kind === 'split') g.boss.stun = !g.mon.some(Boolean);
  // 挑色怪的颜色一定发得出来
  const monCols = [...new Set(g.mon.filter((m) => m && m.col >= 0).map((m) => m.col))]; // 不改关卡表本身
  // 发块的颜色：出战宠物的颜色多发（×2.5），这一关的颜色表里没有它的颜色就自动加上；进化关只发它的颜色和旧铁、蓝
  const palette = (st.colors || [0, 1, 2, 3]).slice();
  monCols.forEach((ci) => { if (!palette.includes(ci)) palette.push(ci); });
  if (!st.evolve) g.team.forEach((p) => { if (!palette.includes(petDef(p).color)) palette.push(petDef(p).color); });
  g.pickColor = () => {
    const ws = palette.map((ci) => ({ ci, w: g.team.some((p) => petDef(p).color === ci) ? 2.5 : 1 }));
    let t = g.rand() * ws.reduce((a, x) => a + x.w, 0);
    for (const x of ws) { if ((t -= x.w) <= 0) return x.ci; }
    return ws[0].ci;
  };
  // 托盘第 4 格 = 宠物格：技能块放这儿，发新块、换一组都不动它
  const colorsOfHand = () => g.hand.map((p) => (p && p.special ? PETS[p.pet].color : g.pickColor()));
  const baseDeal = g.deal;
  g.deal = () => { const sk = g.hand[3] || null; baseDeal(); g.hand[3] = sk; g.handGem[3] = null; g.handColor = colorsOfHand(); };
  const baseReroll = g.reroll;
  g.reroll = () => { const sk = g.hand[3] || null; g.hand.length = 3; baseReroll(); g.hand[3] = sk; g.handGem[3] = null; g.handColor = colorsOfHand(); };
  g.hand[3] = null; g.handGem[3] = null;
  g.handColor = colorsOfHand();
  // 能量满了、宠物格空着：吐一块技能块（能量多出来的留着）。宠物格占着就先憋着。
  function giveSkill(ev) {
    for (const pt of g.team) {
      if (g.hand[3] || pt.energy < energyMax(g, pt)) continue;
      pt.energy -= energyMax(g, pt);
      g.hand[3] = skillPiece(pt); g.handColor[3] = petDef(pt).color;
      if (ev) ev.petActs.push({ id: pt.id, kind: 'gift', lines: [], boxes: [], cells: [] });
    }
  }
  // 墨怪偷 / 炸宠物的能量（m = 动手的那只墨怪）：不是它克星的宠物才中招。炸弹怪炸光，别的偷 RULES.steal 格。
  function drainPets(m, k, ev) {
    for (const pt of g.team) {
      if (isCounter(m, petOf(pt.id)) || pt.energy <= 0) continue;
      if (m.t === 'bomb' ? !RULES.bombDrain : !RULES.steal) continue;
      const n = m.t === 'bomb' ? pt.energy : Math.min(pt.energy, RULES.steal);
      pt.energy -= n; g.monStats.drained = (g.monStats.drained || 0) + n; (ev.drain = ev.drain || []).push({ from: k, id: pt.id, n, kind: m.t });
    }
  }

  // 墨怪挨一下：抓到了返回 true。byPet：宠物下的手（伤害加倍、不挑颜色、不分身）；colorOk(k, col)：消掉的那一排里有没有这种颜色
  function hitMon(k, ev, byPet, colorOk, pet) {
    const m = g.mon[k];
    if (!m) return true;
    if (byPet && pet) {
      // 克制：对口的一下抓走（ev.counter：画「克」的特效）；不对口的打不动（ev.petMiss：它缩一下、灰火花）
      if (isCounter(m, pet)) { if (m.t !== 'ink') { (ev.counter = ev.counter || []).push({ k, t: m.t, by: pet.id }); g.monStats.counter = (g.monStats.counter || 0) + 1; } return true; }
      (ev.petMiss = ev.petMiss || []).push({ k, t: m.t, by: pet.id }); g.monStats.petMiss = (g.monStats.petMiss || 0) + 1;
      return false;
    }
    if (m.t === 'shell' && m.hp > 0) {
      const dmg = byPet ? 2 : 1;
      if (m.hp >= dmg) { m.hp -= dmg; g.monStats.cracks++; (ev.shellCrack = ev.shellCrack || []).push({ k, left: m.hp, n: dmg }); return false; }
    }
    if (m.t === 'color' && !byPet && !(colorOk && colorOk(k, m.col))) { g.monStats.colorMiss++; (ev.colorMiss = ev.colorMiss || []).push(k); return false; }
    if (m.t === 'split' && !byPet) g.spawnQ.push({ k, n: 2, from: 'split' });
    return true;
  }
  // 清掉一批格子
  function clearCells(b, cells, ev, byPet, colorOk, pet) {
    for (const k of cells) {
      const v = b[k];
      if (v === 0 || v === 2 || v === 4 || v === 5) continue;
      if (IS_MON(v)) {
        if (!hitMon(k, ev, byPet, colorOk, pet)) continue;
        if ('monster' in g.got) g.got.monster++; g.caught++; ev.collected.push({ k, what: 'monster', t: g.mon[k] ? g.mon[k].t : 'ink', col: g.mon[k] ? g.mon[k].col : -1 }); delete g.jumpPlan[k]; g.mon[k] = null;
      }
      if (g.gem[k]) { const id = core.GEMS[g.gem[k]].id; if (id in g.got) { g.got[id]++; ev.collected.push({ k, what: id }); } g.gem[k] = 0; }
      if (g.bubble[k]) { g.bubble[k] = 0; if ('bubble' in g.got) { g.got.bubble++; ev.collected.push({ k, what: 'bubble' }); } }
      b[k] = 0;
    }
  }
  // 一次「消掉」（一排 / 一个大格）碰到了机关匣或大墨怪
  function unitTouches(b, cells, ev, byPet, pet) {
    if ('box' in g.got && cells.some((k) => b[k] === 2)) { g.got.box++; ev.collected.push({ k: cells.find((k) => b[k] === 2), what: 'box' }); }
    if (g.boss && g.bigHp > 0 && cells.some((k) => b[k] === 4) && !(byPet && ev.petBossDone)) {
      if (byPet) ev.petBossDone = true; // 0.9：宠物出手一次最多咬头目一口（金翅雀一次扫两排，原来能咬两口）
      const weak = RULES.bossWeak[g.boss.kind];
      // 克制：头目怕的那只宠物咬一口掉 2 颗心，别的宠物咬一口 1 颗（和原来一样）；你自己打：它晕着 2 颗，平时 1 颗（没变）
      const dmg = byPet ? (weak && pet && pet.act === weak ? RULES.bossWeakDmg : RULES.bossOtherDmg) : ev.stunHit ? 2 : 1;
      if (byPet && dmg > 1) (ev.counter = ev.counter || []).push({ k: g.bigCells[0], t: 'boss', by: pet && pet.id });
      // 原来的注释：0.9：它刚动完手正晕着时你打中它，一下掉 2 颗心；宠物咬只掉 1 颗（量出来宠物替你打掉了大半的心）
      g.bigHp = Math.max(0, g.bigHp - dmg);
      g.boss.hp = g.bigHp;
      ev.bigHits.push({ k: g.bigCells[0], dmg });
      if (byPet) g.playStats.bossByPet += dmg; else g.playStats.bossByPlayer += dmg;
      if (g.boss.kind === 'split' && g.bigHp > 0) g.spawnQ.push({ k: g.bigCells[0], n: 1, from: 'boss' }); // 分身王：挨一下蹦一只小墨怪
      if (g.bigHp === 0) {
        g.bigCells.forEach((k) => (b[k] = 0));
        g.caught += 3;
        if ('boss' in g.got) g.got.boss = 1;
        ev.collected.push({ k: g.bigCells[0], what: 'boss' });
        ev.bossDown = true;
      }
    }
  }
  const rockLeft = () => 'rock' in g.got && g.got.rock < st.goal.rock;
  function breakRocks(b, cells, ev, pet) {
    for (const k of cells) {
      if (b[k] !== 5) continue;
      const dmg = pet && pet.act === RULES.rockNemesis ? RULES.rockDmg : 1;
      if (g.rockHp[k] > dmg) { g.rockHp[k] -= dmg; (ev.rockCrack = ev.rockCrack || []).push(k); continue; } // 两层：先裂
      b[k] = 0; g.rockHp[k] = 0;
      if ('rock' in g.got) g.got.rock++;
      ev.collected.push({ k, what: 'rock' }); (ev.rocks = ev.rocks || []).push(k);
    }
  }
  // 救命（并在宠物身上，没有另外的计数）：三块都放不下、宠物格空着的时候，能量条里只要有东西，宠物就提前把技能块给你，能量清空。
  // 技能块只有一格，永远放得下；放下去清掉周围一小片，腾出地方。能量是空的就救不了：所以平时多消几排，就是在给自己攒命。
  function rescue(ev) {
    if (!g.stuck() || g.hand[3] || !g.team.length) return;
    const ok = (x) => (RULES.rescue === 'half' ? x.energy * 2 >= energyMax(g, x) : x.energy >= 1);
    const pt = g.team.filter(ok).sort((x, y) => y.energy / energyMax(g, y) - x.energy / energyMax(g, x))[0];
    if (pt) pt.energy = 0;
    if (!pt) return;
    g.hand[3] = skillPiece(pt); g.handColor[3] = petDef(pt).color; ev.rescue = pt.id;
    ev.petActs.push({ id: pt.id, kind: 'gift', lines: [], boxes: [], cells: [], rescue: true });
  }
  // 放技能块：打它周围那一小片。不算一手，墨怪不动，不发新块。
  function useSkill(i, r, c) {
    const p = g.hand[i], pet = petOf(p.pet), cells = skillCells(PETS[p.pet].shape, p.tier, r, c);
    const b = g.board.slice();
    const ev = { piece: p, r, c, placed: [], units: [], cells: [], collected: [], bigHits: [], petActs: [], energy: {}, sparks: [], fire: null, gained: 0, win: false, stunHit: false, skill: { pet: p.pet, tier: p.tier, cells } };
    breakRocks(b, cells, ev, pet);
    if (cells.some((k) => b[k] === 4)) unitTouches(b, cells, ev, true, pet);
    const before = cells.filter((k) => EATABLE(b[k]));
    const c0 = g.caught;
    clearCells(b, cells, ev, true, null, pet);
    g.skillCaught = (g.skillCaught || 0) + g.caught - c0; // 统计：技能块抓走了几只
    ev.cells = before.filter((k) => b[k] === 0);
    g.hand[i] = null; g.skillUses++;
    if ('acts' in g.got) g.got.acts++;
    g.petActsTotal[p.pet] = (g.petActsTotal[p.pet] || 0) + 1;
    while (g.spawnQ.length) { const sp = g.spawnQ.shift(); spawnAround(b, sp.k, sp.n, ev); }
    nextWave(b, ev);
    g.board = b;
    ev.gained = ev.cells.length; g.score += ev.gained;
    syncAll();
    const left = core.goalLeft(g);
    if (Object.keys(left).every((k) => left[k] === 0)) { ev.win = true; g.over = true; g.won = true; g.reason = 'win'; return ev; }
    rescue(ev);
    if (g.stuck()) { g.over = true; g.reason = 'stuck'; ev.stuck = true; }
    return ev;
  }

  // ---------- 墨怪的回合（每放一块之后） ----------
  // 一块方块所在的一排、一竖、一大格加起来有多满（馋嘴专挑最满的啃，最气人）
  const crowd = (b, k) => { const r = Math.floor(k / 9), c = k % 9; return [UNITS[r], UNITS[9 + c], UNITS[18 + core.boxOf(r, c)]].reduce((a, u) => a + u.filter((x) => b[x]).length, 0); };
  const pick = (arr) => arr[Math.floor(g.rand() * arr.length)];
  const inkAt = (b, k) => { b[k] = 1; g.color[k] = -2; g.gem[k] = 0; };
  function moveMon(b, from, to) { b[to] = 3; b[from] = 0; g.mon[to] = g.mon[from]; g.mon[from] = null; }
  // 分身：在 k 旁边的空格蹦出 n 只小墨怪（先找挨着的，再找同一个大格，再随便）
  function spawnAround(b, k, n, ev) {
    const pools = [near8(k).filter((x) => b[x] === 0), UNITS[18 + boxOfK(k)].filter((x) => b[x] === 0), [...Array(81).keys()].filter((x) => b[x] === 0)];
    for (let i = 0; i < n; i++) {
      const pool = pools.map((pl) => pl.filter((x) => b[x] === 0)).find((pl) => pl.length);
      if (!pool) return;
      const to = pick(pool);
      b[to] = 3; g.mon[to] = newMon('ink');
      (ev.spawns = ev.spawns || []).push({ from: k, to }); g.monStats.spawns++;
    }
  }
  function monsterTurn(b, ev) {
    // 跳跳怪：上一手探过头的，这一手跳过去；每 3 块探一次头
    for (const from of Object.keys(g.jumpPlan).map(Number)) {
      const to = g.jumpPlan[from];
      delete g.jumpPlan[from];
      if (b[from] === 3 && g.mon[from] && g.mon[from].t === 'jump' && b[to] === 0) { moveMon(b, from, to); (ev.jumps = ev.jumps || []).push({ from, to }); }
    }
    if (g.moves % 3 === 2) {
      for (let k = 0; k < 81; k++) {
        if (b[k] !== 3 || !g.mon[k] || g.mon[k].t !== 'jump') continue;
        const empty = UNITS[18 + boxOfK(k)].filter((x) => b[x] === 0 && !Object.values(g.jumpPlan).includes(x));
        if (empty.length) g.jumpPlan[k] = pick(empty);
      }
    }
    // 馋嘴怪 / 墨苔怪：每隔几手先亮出要动的那格（tgt），下一手动手；炸弹怪：倒数到 0 溅墨
    for (let k = 0; k < 81; k++) {
      const m = g.mon[k];
      if (b[k] !== 3 || !m) continue;
      if (RULES.pester[m.t] > 0) {
        // 冲宠物喷墨：先瞪一手（ev.glare），下一手偷能量
        if (m.tgt !== null) { m.tgt = null; m.cd = RULES.pester[m.t]; drainPets(m, k, ev); }
        else if (--m.cd <= 0) { m.tgt = -1; (ev.glare = ev.glare || []).push(k); }
      } else if (m.t === 'eat' || m.t === 'moss') {
        if (m.tgt !== null) {
          const t = m.tgt; m.tgt = null; m.cd = MON[m.t].cd;
          if (m.t === 'eat' && b[t] === 1) { b[t] = 0; g.color[t] = 0; g.gem[t] = 0; g.monStats.eats++; (ev.eats = ev.eats || []).push({ from: k, k: t }); drainPets(m, k, ev); }
          if (m.t === 'moss' && b[t] === 0) { inkAt(b, t); g.monStats.moss++; (ev.moss = ev.moss || []).push({ from: k, k: t }); drainPets(m, k, ev); }
        } else if (--m.cd <= 0) {
          const opts2 = near8(k).filter((x) => (m.t === 'eat' ? b[x] === 1 : b[x] === 0));
          if (!opts2.length) { m.cd = 1; continue; }
          if (m.t === 'eat') { const best = Math.max(...opts2.map((x) => crowd(b, x))); m.tgt = pick(opts2.filter((x) => crowd(b, x) === best)); }
          else m.tgt = pick(opts2);
        }
      } else if (m.t === 'bomb') {
        if (--m.cd <= 0) {
          const ring1 = near8(k).filter((x) => b[x] === 0), ring2 = [...new Set(ring1.flatMap(near8))].filter((x) => b[x] === 0 && !ring1.includes(x));
          const cells = ring1.concat(ring2).slice(0, 6);
          cells.forEach((x) => inkAt(b, x));
          (ev.bombs = ev.bombs || []).push({ k, cells }); g.monStats.bombs++; drainPets(m, k, ev);
          m.cd = MON.bomb.cd;
        }
      }
    }
    // 头目
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
      if (opts2.length) { bs.jumpTo = pick(opts2); ev.bossJumpPlan = bs.jumpTo; }
    }
    // 分身王：盘上没有它的小墨怪时吓得发抖（这时候打它掉 2 颗心）
    if (bs.kind === 'split') { bs.stun = !g.mon.some(Boolean); return; }
    const every = (bs.phase === 1 ? (bs.kind === 'eat' ? 3 : 4) : 3) - (bs.angry ? 1 : 0); // 第二阶段、发怒的头目动得更勤
    const nearCells = (want) => { const out = new Set(); g.bigCells.forEach((k) => { const r = Math.floor(k / 9), c = k % 9; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 9 && cc >= 0 && cc < 9 && want(b[rr * 9 + cc])) out.add(rr * 9 + cc); } }); return [...out]; };
    if (bs.kind === 'eat') {
      // 大馋嘴：上一手亮过牙印的两块，这一手啃掉；啃完嘴里塞满在嚼（这一手打它掉 2 颗心）
      if (bs.eatPlan) {
        const got = bs.eatPlan.filter((k) => b[k] === 1);
        got.forEach((k) => { b[k] = 0; g.color[k] = 0; g.gem[k] = 0; });
        if (got.length) { ev.bossEats = got; g.monStats.eats += got.length; drainPets({ t: 'eat' }, g.bigCells[0], ev); }
        bs.eatPlan = null; bs.stun = true; return;
      }
      bs.stun = false;
      if (bs.count % every === every - 1) {
        const pool = nearCells((v) => v === 1).sort((x, y) => crowd(b, y) - crowd(b, x)).slice(0, 6);
        if (pool.length) { const a = pick(pool); const rest = pool.filter((x) => x !== a); bs.eatPlan = rest.length ? [a, pick(rest)] : [a]; }
      }
      return;
    }
    // 大墨怪：吐墨。阶段一每 4 块、阶段二每 3 块吐一块；吐之前一手先冒黑泡（nextSpit）
    if (bs.nextSpit !== null) {
      const k = bs.nextSpit;
      bs.nextSpit = null;
      if (b[k] === 0) { inkAt(b, k); ev.bossSpit = k; bs.stun = true; g.spits = (g.spits || 0) + 1; return; }
    }
    bs.stun = false;
    if (bs.count % every === every - 1) {
      const near = nearCells((v) => v === 0);
      const pool = near.length ? near : [...Array(81).keys()].filter((k) => b[k] === 0);
      if (pool.length) bs.nextSpit = pick(pool);
    }
  }

  // 目标「抓光盘上的墨怪」：all = 1 表示抓光了；monLeft = 还剩几只（顶上显示这个数）
  function syncAll() { g.monLeft = g.mon.filter(Boolean).length + g.spawnQ.length + waveMonCount(); if ('all' in g.got) g.got.all = g.monLeft ? 0 : 1; }
  syncAll();
  g.place = (i, r, c) => {
    const p = g.hand[i];
    if (!p || g.over || !core.canPlace(g.board, p, r, c)) return null;
    if (p.special === 'skill') return useSkill(i, r, c);
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
      clearedCells = [...set].filter((k) => b[k] === 1 || (IS_MON(b[k]) && !(g.mon[k] && g.mon[k].t === 'shell' && g.mon[k].hp > 0)));
      // 挑色怪：它在的那几排 / 大格里，有没有它那种颜色的方块
      const b0 = b.slice(); // 先拍一张：清的过程中格子会一格格变空
      const colorOk = (k, col) => units.some((u) => UNITS[u].includes(k) && UNITS[u].some((x) => b0[x] === 1 && g.color[x] === col));
      clearCells(b, [...set], ev, false, colorOk);
    }
    ev.units = units; ev.cells = clearedCells;
    const ps = g.playStats; ps.units += units.length;
    if (units.length) { ps.clearMoves++; ps.dry = 0; } else { ps.dry++; ps.maxDry = Math.max(ps.maxDry, ps.dry); }
    // 2. 积蓄能量：每消一排 / 一个大格 +1；消掉它颜色的方块每 3 块再 +1。宠物格里已经有技能块时，最多攒到满。
    for (const pt of g.team) {
      const mine = clearedCells.filter((k) => colorsBefore[k] === petDef(pt).color);
      const gain = units.length + Math.floor(mine.length / 3);
      if (gain) { pt.energy = Math.min(energyMax(g, pt) * 2 - 1, pt.energy + gain); ev.energy[pt.id] = gain; }
      if (mine.length) ev.sparks.push({ id: pt.id, cells: mine });
    }
    // 3. 能量满了：吐技能块到宠物格
    giveSkill(ev);
    // 4. 分身：这一手打中的分身怪 / 分身王，现在蹦出小墨怪
    while (g.spawnQ.length) { const sp = g.spawnQ.shift(); spawnAround(b, sp.k, sp.n, ev); }
    nextWave(b, ev); // 这一波抓光了：下一波掉下来（刚掉下来的这一手不动）
    // 5. 墨怪的回合（过关就不动了）
    syncAll();
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
    syncAll();
    left = core.goalLeft(g);
    if (done()) { ev.win = true; g.over = true; g.won = true; g.reason = 'win'; return ev; }
    if (!g.hand.slice(0, 3).some(Boolean)) g.deal();
    rescue(ev);
    if (g.stuck()) { g.over = true; g.reason = 'stuck'; ev.stuck = true; }
    return ev;
  };
  // 宠物下一次要下手的地方（能量差 1 格时画面亮出来）
  g.petTarget = () => null; // 技能块由你自己放，没有「它要下手的地方」了
  g.skillCells = (pc, r, c) => skillCells(PETS[pc.pet].shape, pc.tier, r, c); // 拖着技能块时，画面照这个亮出它会打到哪几格
  g.skillBest = () => skillBest(g);
  // 「差一点」（0.9.4，检验报告 C10 / E3）：头目按打掉了几颗心算、抓光关按抓了几只算（原来按「打死了没有」算，头目、抓光关永远不说差一点）；门槛从七成收到八成
  g.nearMiss = () => !g.won && (() => {
    let need = 0, have = 0;
    for (const k in st.goal) {
      if (k === 'boss' && g.boss) { need += g.boss.max; have += g.boss.max - g.bigHp; continue; }
      if (k === 'all') { const tot = g.caught + (g.monLeft || 0); need += tot; have += g.caught; continue; }
      const n = st.goal[k]; need += n; have += Math.min(n, k === 'score' ? g.score : g.got[k] || 0);
    }
    return need && have / need >= 0.8;
  })();
  g.goalLeft = () => core.goalLeft(g);
  return g;
}

// ---------- 机器人 ----------
function bestMove(g, skill) {
  const st = g.stage;
  const left = core.goalLeft(g);
  const cands = [];
  g.hand.forEach((p, i) => {
    if (!p || p.special) return;
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
        // 墨怪：甲壳怪敲一层也算进展；挑色怪要那排里有它的颜色；会还手的（啃、长墨、快爆）不管目标是什么都值得先打
        const ci0 = g.handColor[i];
        for (const k of res.cells) {
          const m = g.board[k] === 3 && g.mon[k];
          if (!m) continue;
          let hitV = 14;
          if (m.t === 'shell' && m.hp > 0) hitV = 7;
          if (m.t === 'color') {
            const ok = res.units.some((u) => UNITS[u].includes(k) && UNITS[u].some((x) => (placed.includes(x) ? ci0 : g.board[x] === 1 ? g.color[x] : -9) === m.col));
            hitV = ok ? 16 : 0;
          }
          v += left.monster > 0 || left.all > 0 ? hitV : 0;
          if (m.t === 'eat' || m.t === 'moss') v += 6;
          if (m.t === 'bomb') v += m.cd <= 3 ? 12 : 4;
        }
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
    const rest = g.hand.filter((p, k) => p && !p.special && k !== m.i);
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
    if (useSkillIfGood(g)) continue;
    const m = bestMove(g, o.skill);
    if (!m) { if (g.hand[3]) { const s = skillBest(g); if (s && g.place(3, s.r, s.c)) continue; } break; }
    g.elapsed += o.secPerMove(g);
    g.place(m.i, m.r, m.c);
  }
  return g;
}

// 机器人放技能块：挑打得到最多「它打得动的东西」的那一格。v ≥ 100 = 至少打到一样正经东西（它克的墨怪 / 小墨怪 / 铁石 / 头目）
function skillBest(g) {
  const p = g.hand[3];
  if (!p) return null;
  const pet = petOf(p.pet), left = core.goalLeft(g), wantMon = left.monster > 0 || left.all > 0;
  let best = null;
  for (let k = 0; k < 81; k++) {
    if (g.board[k] !== 0) continue;
    const r = Math.floor(k / 9), c = k % 9, cells = skillCells(PETS[p.pet].shape, p.tier, r, c);
    let v = 0, touchBoss = false;
    for (const x of cells) {
      const bv = g.board[x];
      if (bv === 3 && g.mon[x]) v += isCounter(g.mon[x], pet) ? (wantMon ? 100 : 30) + (g.mon[x].t !== 'ink' ? 20 : 0) : 0;
      else if (bv === 5) v += left.rock > 0 ? 100 : 3;
      else if (bv === 4) touchBoss = true;
      else if (bv === 1) v += (g.gem[x] && left[core.GEMS[g.gem[x]].id] > 0 ? 100 : 0) + (g.color[x] === -2 ? 2 : 0.5); // 清掉墨块比清掉自己的块好
    }
    if (touchBoss && g.bigHp > 0) v += 100 * (g.boss && RULES.bossWeak[g.boss.kind] === pet.act ? RULES.bossWeakDmg : RULES.bossOtherDmg);
    if (!best || v > best.v) best = { r, c, v };
  }
  return best;
}
// 有正经东西可打就用；三块都放不下，也用（清地方）
function useSkillIfGood(g) {
  if (!g.hand[3] || g.over) return false;
  const s = skillBest(g);
  if (!s) return false;
  const fits = [0, 1, 2].some((i) => g.fits(i));
  if (s.v >= 100 || !fits) return !!g.place(3, s.r, s.c);
  return false;
}
module.exports = { RULES, isCounter, bestPetFor, skillCells, skillBest, useSkillIfGood, tierOf, petDesc, CHARGE_TAG, CHARGE_TEXT, PETS, FIRE, COLOR_NAME, IS_MON, MON, createPetGame, bestMove, simulate, energyMax };
