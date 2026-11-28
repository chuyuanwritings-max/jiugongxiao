// 段 3 量数的公用底子（段 3 细设计第三节、附录 D）：test/seg3_measure.js、test/fake_challenge.js 都用它。黄灯：机器人没拿真人校准过。
// 三条规矩（附录 D 末尾）：① 每关只带打到这关已有的宠物；② 等级三档：1 级（一口没喂）、平摊（economy.lvAt 'wide'）、专心（'focus'，只第一只）；
// ③「只差 1 格」只在带对口那只（关卡表 fastCharge：第 3、8、12 关）或带刚来那只（它登场的那一关）时给。
// 机器人：手熟 skill 1（每手挑最好的）、手生 skill 0.6（十手里有四手挑第 2–5 好的）；技能块照 petgame.useSkillIfGood（含附录 D 补的两手）
const PG = require('../js/petgame.js'), core = require('../js/core.js'), EC = require('../js/economy.js'), PLV = require('../js/petlevels.js');
const BASE = ['tongque', 'huli', 'baozhu', 'modou', 'lvgui'];
const NAME = { tongque: '雀', huli: '狐', baozhu: '甲', modou: '蚕', lvgui: '龟' };
const FACTOR = 0.7; // Cc 11-28：标准手数 = 机器人手数 × 0.7（Cc 自己的真实记录约 0.78；细设计原写 0.55）
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
const ownedAt = (li) => PLV.slice(0, li).map((st) => st.gift).filter(Boolean);
// 它第一次能带的那一关（送它的关之后第一个不是冲锋关的关）
const debutOf = (id) => { const gi = PLV.findIndex((st) => st.gift === id); for (let i = gi + 1; i < PLV.length; i++) if (!PLV[i].rush) return i; return -1; };
const evoId = (id, lv) => (lv >= PG.ULT_LV ? PG.PETS[PG.PETS[id].evo].evo : lv >= PG.EVO_LV ? PG.PETS[id].evo : id);
const FOCUS = EC.lvAt(PLV, 'focus'), WIDE = EC.lvAt(PLV, 'wide');
// 每关每类：普通、教学关取中位；难关 35% 那个位置；头目 40%（规则 7）
const Q_OF = { teach: 0.5, normal: 0.5, hard: 0.35, boss: 0.4 };
// 一局：返回输赢、手数、新东西自己放了几次本事（开局演的那一次不算）
function play(li, pet, lv, seed, skill) {
  const st0 = PLV[li], fast = !!pet && (st0.fastCharge === pet || debutOf(pet) === li);
  const st = Object.assign({}, st0, { fastCharge: fast });
  const g = PG.createPetGame({ stage: st, team: pet ? [{ id: evoId(pet, lv), lv }] : [], seed });
  const A = { crawl: 0, moss: 0, mud: 0, jump: 0, blocked: 0, opened: 0 };
  const count = (ev) => { if (!ev) return; if (ev.crawl) A.crawl += ev.crawl.filter((x) => x.t !== 'sticky').length; if (ev.moss) A.moss += ev.moss.length; if (ev.mudSpit) A.mud += ev.mudSpit.length; if (ev.bossJump) A.jump++; if (ev.blockedFull) A.blocked += ev.blockedFull.length; if (ev.metal) A.opened += ev.metal.length; if (ev.blast) A.opened += ev.blast.length; };
  g.openingAct();
  let guard = 0, soft = false;
  while (!g.over && guard++ < 401) {
    if (g.hand[3]) { const s = PG.smartSkill(g), fits = [0, 1, 2].some((i) => g.hand[i] && core.anyPlacement(g.board, g.hand[i])); if (s && (s.v >= 100 || !fits)) { const ev = g.useSkill(s); if (ev) { count(ev); continue; } } }
    const m = PG.bestMove(g, skill);
    if (!m) { if (g.hand[3]) { const s = PG.skillBest(g); if (s) { const ev = g.useSkill(s); if (ev) { count(ev); continue; } } } soft = true; break; }
    count(g.place(m.i, m.r, m.c));
  }
  return { won: !!g.won, moves: g.moves, A, soft: soft && !g.over, long: g.moves > 400 || (!g.over && !soft), skills: g.skillUses || 0, petCaught: g.playStats.goalsByPet };
}
// 一格：这关 × 这只 × 这个等级 × 这档手法，打 n 局
function cell(li, pet, lv, skill, n) {
  let w = 0, soft = 0, long = 0, skills = 0; const wm = [], acc = { crawl: 0, moss: 0, mud: 0, jump: 0, blocked: 0, opened: 0 };
  for (let i = 0; i < n; i++) {
    const r = play(li, pet, lv, 5000 + li * 977 + i * 31 + (pet ? BASE.indexOf(pet) : 9) * 7 + lv * 3 + (skill < 1 ? 1 : 0), skill);
    if (r.won) { w++; wm.push(r.moves); } if (r.soft) soft++; if (r.long) long++; skills += r.skills;
    for (const k in acc) acc[k] += r.A[k];
  }
  for (const k in acc) acc[k] /= n;
  return { pet, lv, rate: Math.round((w / n) * 100), wm, med: pct(wm, 0.5), soft, long, skills: skills / n, acc, n };
}
// 这一关要量哪几格：[宠物, 等级, 档名]
function combos(li) {
  const owned = ownedAt(li), out = [];
  if (!owned.length) return [[null, 1, 'none']];
  owned.forEach((p, idx) => { out.push([p, 1, 'worst']); if (WIDE[li] > 1) out.push([p, WIDE[li], 'wide']); if (idx === 0 && FOCUS[li] > WIDE[li]) out.push([p, FOCUS[li], 'focus']); });
  return out;
}
// 标准手数用的那一池：平摊档所有已有宠物的赢局（没有平摊档 = 1 级那一档）
const parPool = (rows) => { const w = rows.filter((r) => r.tag === 'wide'), base = w.length ? w : rows.filter((r) => r.tag === 'worst' || r.tag === 'none'); return [].concat(...base.map((r) => r.wm)); };
const parFrom = (pool, kind) => Math.round(pct(pool, Q_OF[kind]) * FACTOR);
module.exports = { PG, core, EC, PLV, BASE, NAME, FACTOR, pct, ownedAt, debutOf, evoId, FOCUS, WIDE, Q_OF, play, cell, combos, parPool, parFrom };
