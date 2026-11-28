// 丹的算术（段 2「丹」，照 ../九宫消_段2丹细设计_Fable_20261128.md 附录 B；Cc 11-28 定：丹价 100 颗满级、丹进丹袋玩家挑喂谁、没亮的槽重打补给、借宠封顶 2 槽、测试员跳关不给丹）
// 只做算术：不碰画面、声音、存档读写、时钟。存档对象当参数传进来、在它上面改；今天几号由 main.js 读好了传进来。
// 不 require 别的文件（B3 查）。关卡对象（stage）当参数传进来，这里不自己去查关卡表。

// ---- 常量 ----
const EXP_NEED = [0, 5, 7, 9, 11, 12, 13, 14, 14, 15]; // [lv] = 从 lv 级升到 lv+1 级要几颗；[0] 不用（Cc 11-28 定 A：满级 100 颗、5 级进化累计 32 颗）
const LV_CAP = 10, EVO_LV = 5; // EVO_LV 和 petgame.EVO_LV 是同一个数（T226 断言相等）
const PET_FULL = 100, EVO_TOTAL = 32; // 只给测试和文档对数用
const SLOT_DAN = { normal: 1, teach: 1, rush: 1, hard: 2, boss: 3 }; // 一个槽里装几颗
const REPLAY_DAN = { normal: 1, teach: 1, rush: 1, hard: 2, boss: 3 }; // 过了的关每天重打一次给几颗
const FULL_BONUS = 1, HELP_CAP = 2, NEW_PET_EXP = 1;
const ECON_VER = 2; // 存档里的 save.econ：2 = 已经照这一版换算过

const num = (v, lo, hi) => { v = Math.floor(+v); return v >= lo ? Math.min(hi, v) : lo; }; // 不是数也落到 lo

// ---- 类型和槽 ----
// 规则 1：先中哪条算哪条
function kindOf(stage) {
  if (stage && stage.goal && stage.goal.boss) return 'boss';
  if (stage && stage.hard) return 'hard';
  if (stage && stage.rush) return 'rush';
  if (stage && stage.teach) return 'teach';
  return 'normal';
}
const cut2 = (par) => Math.floor(par * 1.5); // 1.5 倍：半手往下取
// 规则 2：这一局亮几个槽。run = { won, moves, sec, revives, lent }
function rawSlots(stage, run) {
  const kind = kindOf(stage);
  if (kind === 'teach') return 3;
  if (kind === 'rush') { const s = +run.sec || 0; return s <= stage.rush.t3 ? 3 : s <= stage.rush.t2 ? 2 : 1; }
  if (!(stage.par > 0)) return 3; // 忘了填标准手数当 3 槽（T203 拦着）
  const m = run.moves || 0;
  return m <= stage.par ? 3 : m <= cut2(stage.par) ? 2 : 1;
}
const helped = (run) => (run.revives || 0) > 0 || !!run.lent;
function slotsOf(stage, run) {
  if (!run || !run.won) return 0;
  const n = rawSlots(stage, run);
  return helped(run) ? Math.min(HELP_CAP, n) : n; // 帮手封顶，最后算
}
// 关里每一手之后调：现在亮几个、再放几块下一个槽会暗、要不要显示计数器
// 没赢的时候，按「下一手赢」算（放完第「标」块还没赢，第 3 槽当场暗）
function live(stage, run) {
  const kind = kindOf(stage), cap = helped(run) ? HELP_CAP : 3;
  if (run.won) return { slots: slotsOf(stage, run), left: 0, counter: false, capped: cap < 3 };
  let base, left = 0;
  if (kind === 'teach') base = 3;
  else if (kind === 'rush') base = rawSlots(stage, run);
  else if (!(stage.par > 0)) base = 3;
  else {
    const m = run.moves || 0, p = stage.par, p2 = cut2(p);
    if (m < p) { base = 3; left = p - m; } else if (m < p2) { base = 2; left = p2 - m; } else base = 1;
    if (base === 3 && cap < 3) left = p2 - m; // 封顶以后第 3 槽已经暗了，计数器倒数第 2 槽
  }
  const slots = Math.min(cap, base);
  return { slots, left: slots > 1 ? left : 0, counter: kind !== 'teach' && kind !== 'rush' && slots > 1 && left > 0, capped: cap < 3 };
}
// 两次 live 之间哪个槽暗了（给段 4 的「飞过去撞一下」）
function slotEvents(stage, before, after) {
  const out = [], kind = kindOf(stage);
  for (let s = before.slots; s > after.slots; s--) out.push({ slot: s, why: kind === 'rush' ? 'time' : s === 3 && after.capped && !before.capped ? 'revive' : 'moves' });
  return out;
}
// 这几个槽一辈子该拿的丹（含第一次拿满那 1 颗）
const owedK = (kind, slots) => slots * SLOT_DAN[kind] + (slots === 3 ? FULL_BONUS : 0);
const owed = (stage, slots) => owedK(kindOf(stage), slots);
const levelMax = (stage) => owed(stage, 3); // 4 / 7 / 10

// ---- 结算 ----
const dayKey = (y, m, d) => y * 10000 + m * 100 + d;
const recOf = (save, idx) => { const r = save.slots && save.slots[idx]; return r && r.s > 0 ? r : { s: 0, got: 0 }; };
// 段 3（Cc 11-28 定）：第 1、2 关三五手就打完，重打不给每天那一份（关卡表 noReplay；没亮的槽照补，但教学关过了就满槽）
const replayDanOf = (stage) => (stage && stage.noReplay ? 0 : REPLAY_DAN[kindOf(stage)]);
// 这关过了、今天还没拿过重打那一份（上次的日期比今天晚 = 钟往回调过：不给）。stage 给了、又是 noReplay 的关：永远不开
function replayOpen(save, idx, today, stage) {
  if (stage && !replayDanOf(stage)) return false;
  if (!(recOf(save, idx).s > 0)) return false;
  const d = save.danDay && save.danDay[idx];
  return !d || d < today;
}
// 结算一局。opt = { practice }：测试员跳着玩还没打到的关传 true（不给丹、不亮槽）
function settle(save, idx, stage, run, today, opt) {
  if (run._receipt) return run._receipt; // 同一局结算两次：只给一次
  const kind = kindOf(stage), practice = !!(opt && opt.practice), rec = recOf(save, idx);
  const r = { won: !!run.won, kind, practice, slots: 0, best: rec.s, lit: ['off', 'off', 'off'], perSlot: SLOT_DAN[kind], slotPay: 0, fullFirst: false, replayPay: 0, total: 0, first: rec.s === 0, cap: null, danAfter: save.dan || 0 };
  run._receipt = r;
  if (!run.won || practice) return r; // 没赢、跳关：存档一个字不改
  const slots = slotsOf(stage, run), raw = rawSlots(stage, run);
  r.slots = slots;
  if (slots < raw) r.cap = (run.revives || 0) > 0 ? 'revive' : 'lent';
  r.best = Math.max(rec.s, slots);
  r.lit = [1, 2, 3].map((n) => (n <= slots ? (n <= rec.s ? 'had' : 'new') : 'off')); // 这一局亮的槽：以前就亮过（不再给）/ 新亮的；没亮
  r.slotPay = Math.max(0, owed(stage, r.best) - rec.got);
  r.fullFirst = r.best === 3 && rec.s < 3;
  if (!r.first && replayOpen(save, idx, today, stage)) { r.replayPay = replayDanOf(stage); save.danDay = save.danDay || {}; save.danDay[idx] = today; }
  r.total = r.slotPay + r.replayPay;
  save.slots = save.slots || {};
  save.slots[idx] = { s: r.best, got: Math.max(rec.got, owed(stage, r.best)) };
  save.dan = (save.dan || 0) + r.total;
  r.danAfter = save.dan;
  return r;
}

// ---- 升级（丹在丹袋里，玩家在宠物园里挑给谁；点一下升一级）----
const newPet = () => ({ lv: 1, exp: NEW_PET_EXP }); // 新宠物自己叼着 1 颗
const cost = (rec) => (!rec || rec.lv >= LV_CAP ? Infinity : Math.max(0, EXP_NEED[rec.lv] - (rec.exp || 0)));
const canLevel = (save, id) => !!(save.pets && save.pets[id]) && (save.dan || 0) >= cost(save.pets[id]);
const canLevelAny = (save) => (save.petOrder || []).some((id) => canLevel(save, id));
// 够才扣丹、升一级、这一级喂的清零。长大版换编号（tongque → jinchique → dapeng）还是 main.js 的 evolvePet 做
function levelUp(save, id) {
  const rec = save.pets && save.pets[id];
  const c = cost(rec), lv0 = rec ? rec.lv : 0;
  if (!rec || !((save.dan || 0) >= c)) return { ok: false, cost: c, lv0, lv1: lv0, evo: false, ult: false };
  save.dan -= c; rec.lv++; rec.exp = 0;
  return { ok: true, cost: c, lv0, lv1: rec.lv, evo: rec.lv === EVO_LV, ult: rec.lv === LV_CAP };
}
// 等级、这一级喂了几颗收进范围；喂的够了这一级的价就往上滚（老存档 8、9 级新价便宜 1 颗）。→ 升了几级
function normalizePet(rec) {
  const lv0 = num(rec.lv, 1, LV_CAP);
  rec.lv = lv0; rec.exp = num(rec.exp, 0, 1e6);
  while (rec.lv < LV_CAP && rec.exp >= EXP_NEED[rec.lv]) { rec.exp -= EXP_NEED[rec.lv]; rec.lv++; }
  if (rec.lv >= LV_CAP) rec.exp = 0;
  return rec.lv - lv0;
}

// ---- 老存档（0.9.24 → 段 2；丹细设计第三节）----
// 冻住的 0.9.24 关卡类型和当时的给法：段 3 重排关卡不许动它（不然老存档会按错的类型补丹）
const OLD_KIND = { t: 'teach', n: 'normal', H: 'hard', R: 'rush', B: 'boss' };
const OLD_0924 = {
  kind: 'ttttHtRtHB' + 'ttntHRnnHB', // 第 1–20 关：教 t、普通 n、难 H、冲锋 R、头目 B
  kindAt(i) { return OLD_KIND[OLD_0924.kind[i]] || null; },
  // 0.9.24 第一次过这关给了几颗：普通类 2、难 4、头目 8，三星另加 1；冲锋关按星 2 / 3 / 4（不加）
  pay(kind, stars) { if (kind === 'rush') return [2, 3, 4][Math.max(1, Math.min(3, stars)) - 1]; return (kind === 'hard' ? 4 : kind === 'boss' ? 8 : 2) + (stars >= 3 ? 1 : 0); },
  levelMax(i) { const k = OLD_0924.kindAt(i); return k ? owedK(k, 3) : 0; },
};
const DROPPED = ['coins', 'gourd', 'best', 'bestEndless', 'buySingle', 'lastFed']; // 砍掉的数
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const needsMigrate = (save) => !(save && save.econ >= ECON_VER);
// 在 save 上改。备份由 main.js 在调这个之前做（res.backup = 要备份）
function migrate(save) {
  const res = { gift: 0, levels: [], pets: [], dropped: [], backup: false };
  if (!isObj(save) || !needsMigrate(save)) return res;
  res.backup = true;
  save.dan = num(save.dan, 0, 1e9); // 丹：原来几颗还是几颗
  const n = num(save.petStage, 0, OLD_0924.kind.length), best = isObj(save.best) ? save.best : {};
  if (!isObj(save.slots)) save.slots = {};
  // 只看真打过的关（「打到第几关」以前）。测试员跳着玩后面的关留下的星：不算槽、不补丹（当时到手的丹不收回）
  for (let i = 0; i < n; i++) {
    const kind = OLD_0924.kindAt(i); if (!kind) continue;
    const b = best[i], stars = isObj(b) ? num(b.stars, 0, 3) : 0;
    // 星 → 槽：教学关 3；冲锋关和星一样；别的 2、3 星 = 3 槽（旧 2 星 = 标准手数以内），1 星或没记录 = 1 槽
    const slots = kind === 'teach' ? 3 : kind === 'rush' ? Math.max(1, stars) : stars >= 2 ? 3 : 1;
    const oldPaid = OLD_0924.pay(kind, Math.max(1, stars)); // 过了关就至少给过 1 星的那份
    const topup = Math.max(0, owedK(kind, slots) - oldPaid); // 少的不扣
    const got = Math.max(oldPaid + topup, owedK(kind, slots)); // 记成已拿：以后补槽不重复给
    const had = isObj(save.slots[i]) ? save.slots[i] : { s: 0, got: 0 };
    save.slots[i] = { s: Math.max(num(had.s, 0, 3), slots), got: Math.max(num(had.got, 0, 1e6), got) };
    res.gift += topup;
    res.levels.push({ idx: i, stars, slots, oldPaid, topup, got: save.slots[i].got });
  }
  save.dan += res.gift;
  // 宠物：有哪几只、几级原样；这一级喂了几颗原样，够新价就往上滚（等级只升不降）
  if (isObj(save.pets)) Object.keys(save.pets).forEach((id) => { const r = save.pets[id]; if (!isObj(r)) return; const lv0 = r.lv; normalizePet(r); res.pets.push({ id, lv0, lv1: r.lv }); });
  DROPPED.forEach((k) => { if (k in save) { delete save[k]; res.dropped.push(k); } });
  save.econ = ECON_VER; save.econGift = res.gift; // 段 5 可以在第一次打开时演一下「补给你 N 颗」
  return res;
}

// ---- 算账（测试、机器人用，游戏里不调；丹细设计第二节）----
// 三种玩家：每类关亮几个槽。难关、头目是一串，按它在第几次出现轮着取（普通人：每章两关难关一关 2 槽一关 1 槽；头目一章 2 槽一章 1 槽）（黄灯，只有「全拿满」是定数）
const PROFILES = {
  weak: { name: '手生的', teach: 3, normal: 1, rush: 1, hard: [1], boss: [1] },
  avg: { name: '普通人', teach: 3, normal: 2, rush: 2, hard: [2, 1], boss: [2, 1] },
  full: { name: '全拿满', teach: 3, normal: 3, rush: 3, hard: [3], boss: [3] },
};
// 造一局「正好亮 n 个槽」的赢（走真的 slotsOf，不另算）
function runFor(stage, n) {
  const kind = kindOf(stage), run = { won: true, moves: 1, sec: 0, revives: 0, lent: false };
  if (kind === 'rush') run.sec = n === 3 ? stage.rush.t3 : n === 2 ? stage.rush.t2 : stage.rush.t2 + 1;
  else if (kind !== 'teach' && stage.par > 0) run.moves = n === 3 ? stage.par : n === 2 ? cut2(stage.par) : cut2(stage.par) + 1;
  return run;
}
function slotsFor(profile, kind, occ) {
  const v = profile[kind];
  if (!Array.isArray(v)) return v;
  occ[kind] = (occ[kind] || 0) + 1;
  return v[(occ[kind] - 1) % v.length];
}
// 第一次一关一关打过去，每关拿多少。opt.replay：再加「一点重打」（第二节第 1 条：6 关普通类 + 2 关难关各重打 1 局，其中两关普通关 2 → 3 槽、一关难关 1 → 2 槽）
function ledger(levels, profile, opt) {
  const save = { dan: 0, slots: {}, danDay: {} }, occ = {}, perLevel = [];
  levels.forEach((st, i) => { const kind = kindOf(st), n = slotsFor(profile, kind, occ), r = settle(save, i, st, runFor(st, n), 1); perLevel.push({ i, kind, slots: n, dan: r.total, bag: save.dan }); });
  const first = save.dan, byChapter = [];
  perLevel.forEach((x) => { const c = Math.floor(x.i / 10); byChapter[c] = (byChapter[c] || 0) + x.dan; });
  let replay = 0;
  if (opt && opt.replay) {
    const norm = perLevel.filter((x) => (x.kind === 'teach' || x.kind === 'normal' || x.kind === 'rush') && replayDanOf(levels[x.i])), hard = perLevel.filter((x) => x.kind === 'hard');
    const up2 = norm.filter((x) => x.slots === 2 && x.kind !== 'teach').slice(0, 2).map((x) => x.i), upH = hard.filter((x) => x.slots === 1).slice(0, 1).map((x) => x.i);
    const pick = up2.concat(norm.filter((x) => !up2.includes(x.i)).map((x) => x.i)).slice(0, 6).concat(upH.concat(hard.filter((x) => !upH.includes(x.i)).map((x) => x.i)).slice(0, 2));
    pick.forEach((i) => { const x = perLevel[i], n = up2.includes(i) ? 3 : upH.includes(i) ? 2 : x.slots; replay += settle(save, i, levels[i], runFor(levels[i], n), 2).total; });
  }
  return { perLevel, first, replay, total: first + replay, byChapter };
}
// 专心养一只：丹全喂第一只来的宠物（它自己叼着 1 颗），够就升。→ 每关打完它几级（还没有宠物 = 0）、第几关打完长大
function focusPath(levels, profile, opt) {
  const save = { dan: 0, slots: {}, danDay: {}, pets: {}, petOrder: [] }, occ = {}, after = [];
  let evoAt = 0;
  levels.forEach((st, i) => {
    settle(save, i, st, runFor(st, slotsFor(profile, kindOf(st), occ)), 1);
    if (st.gift && !save.pets[st.gift]) { save.pets[st.gift] = newPet(); save.petOrder.push(st.gift); }
    const id = save.petOrder[0];
    if (id) while (levelUp(save, id).ok) { if (!evoAt && save.pets[id].lv >= EVO_LV) evoAt = i + 1; }
    after.push(id ? save.pets[id].lv : 0);
  });
  return { after, evoAt, left: save.dan };
}
// 平摊：第一只宠物一来就当五只都在（前两章五只出齐，R-057），每次给最低的那只升。→ 每关打完五只里最低的几级
function widePath(levels, profile) {
  const save = { dan: 0, slots: {}, danDay: {}, pets: {}, petOrder: [] }, occ = {}, after = [];
  levels.forEach((st, i) => {
    settle(save, i, st, runFor(st, slotsFor(profile, kindOf(st), occ)), 1);
    if (st.gift && !save.petOrder.length) for (let k = 0; k < 5; k++) { save.pets['p' + k] = newPet(); save.petOrder.push('p' + k); }
    for (;;) { const low = save.petOrder.slice().sort((a, b) => save.pets[a].lv - save.pets[b].lv)[0]; if (!low || !levelUp(save, low).ok) break; }
    after.push(save.petOrder.length ? Math.min(...save.petOrder.map((id) => save.pets[id].lv)) : 0);
  });
  return { after, left: save.dan };
}
// 进每一关时宠物大概几级（给 a3_measure、段 3 用；照「普通人」）。mode = 'focus' | 'wide'
function lvAt(levels, mode) {
  const p = mode === 'wide' ? widePath(levels, PROFILES.avg) : focusPath(levels, PROFILES.avg);
  return levels.map((_, i) => Math.max(1, i ? p.after[i - 1] : 1));
}
// 第二节第 5 条的六章推算（黄灯：第 3–6 章还没排）。later = 后四章每章各类几关 + 每章重打大约多拿几颗
const LATER = { teach: 3, normal: 3, rush: 1, hard: 2, boss: 1, chapters: 4, replay: (35 - 16) / 4 };
function project6(levels, profile, later, opt) {
  later = Object.assign({}, LATER, later || {});
  const one = [];
  ['teach', 'normal', 'rush', 'hard', 'boss'].forEach((k) => { for (let n = 0; n < later[k]; n++) one.push(k === 'teach' ? { teach: 1, par: 20, goal: {} } : k === 'rush' ? { rush: { t3: 36, t2: 48, lose: 60 }, goal: {} } : k === 'hard' ? { hard: 1, par: 35, goal: {} } : k === 'boss' ? { par: 30, goal: { boss: 1 } } : { par: 20, goal: {} }); });
  let all = levels.slice(); for (let c = 0; c < later.chapters; c++) all = all.concat(one);
  const l = ledger(all, profile, { replay: opt && opt.replay }), replay = opt && opt.replay ? l.replay + later.replay * later.chapters : 0;
  const total = l.first + replay;
  return { total, first: l.first, replay, pets: total / PET_FULL };
}

module.exports = {
  EXP_NEED, LV_CAP, EVO_LV, PET_FULL, EVO_TOTAL, SLOT_DAN, REPLAY_DAN, FULL_BONUS, HELP_CAP, NEW_PET_EXP, ECON_VER,
  kindOf, cut2, slotsOf, live, slotEvents, owed, levelMax,
  dayKey, replayOpen, replayDanOf, settle,
  newPet, cost, canLevel, canLevelAny, levelUp, normalizePet,
  OLD_0924, needsMigrate, migrate,
  PROFILES, ledger, focusPath, widePath, lvAt, project6,
};
