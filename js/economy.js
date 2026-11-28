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
const owed = (stage, slots) => slots * SLOT_DAN[kindOf(stage)] + (slots === 3 ? FULL_BONUS : 0);
const levelMax = (stage) => owed(stage, 3); // 4 / 7 / 10

// ---- 结算 ----
const dayKey = (y, m, d) => y * 10000 + m * 100 + d;
const recOf = (save, idx) => { const r = save.slots && save.slots[idx]; return r && r.s > 0 ? r : { s: 0, got: 0 }; };
// 这关过了、今天还没拿过重打那一份（上次的日期比今天晚 = 钟往回调过：不给）
function replayOpen(save, idx, today) {
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
  if (!r.first && replayOpen(save, idx, today)) { r.replayPay = REPLAY_DAN[kind]; save.danDay = save.danDay || {}; save.danDay[idx] = today; }
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

module.exports = {
  EXP_NEED, LV_CAP, EVO_LV, PET_FULL, EVO_TOTAL, SLOT_DAN, REPLAY_DAN, FULL_BONUS, HELP_CAP, NEW_PET_EXP, ECON_VER,
  kindOf, cut2, slotsOf, live, slotEvents, owed, levelMax,
  dayKey, replayOpen, settle,
  newPet, cost, canLevel, canLevelAny, levelUp, normalizePet,
};
