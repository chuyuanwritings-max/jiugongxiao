// 段 2 老存档换算测试（丹细设计第三节、附录 E；T232–T240）：纯函数 economy.migrate 跑一遍，再塞进模拟微信（test/wx-env.js）开机跑一遍
// 总原则：玩家手里的东西只多不少。宠物、等级、进度、丹一样不动；按新规矩该多给的补上；金币、葫芦、分数、星删掉
const E = require('../js/economy.js'), PLV = require('../js/petlevels.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
const t = (name, fn) => { try { fn(); } catch (e) { fail++; console.log('✗ ' + name + '：抛出异常 ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (x) => JSON.parse(JSON.stringify(x));
const KEY = 'luoshu_save_v1';

// 存档甲：照 0.9.24 的 freshSave 和 settlePet 搭的，打到第 14 关（附录 E）
const STARS_A = [3, 3, 2, 1, 1, 2, 2, 1, 2, 1, 3, 2, 1, 1], SCORES_A = [96, 240, 388, 301, 610, 352, 1180, 420, 905, 730, 366, 344, 512, 298];
const SAVE_A = {
  wins: 0, won: [false, false, false], litEver: [0, 1, 2].map(() => new Array(9).fill(false)),
  coins: 233, bestEndless: 0, items: {}, tutorialDone: true, buySingle: false, plays: 41,
  stage: 0, introSeen: { catch: 1, pet: 1, crawl: 1, metal: 1, rush: 1, moss: 1, boss: 1, baozhu: 1, dirt: 1 },
  siegeDone: false, siegeBest: 0, daily: null, siegeRuns: 0, relicSeen: {}, relicGot: {},
  ch1new: 1, petTutDone: true, feedTaught: true, tester: false,
  petStage: 14,
  pets: { jinchique: { lv: 6, exp: 4 }, baozhu: { lv: 3, exp: 2 } },
  petOrder: ['jinchique', 'baozhu'], activePet: 'jinchique', lastFed: 'jinchique',
  petSeen: { tongque: 1, baozhu: 1 }, freshPet: { tongque: true },
  gourd: 61, dan: 7,
  best: Object.fromEntries(STARS_A.map((s, i) => [i, { stars: s, score: SCORES_A[i] }])),
  danDay: { 3: 20261127, 0: 20261126 },
  loss: { 14: 2 },
  cutSeen: { chapter0: true, chapter1: true, gift_tongque: true, gift_baozhu: true },
  muted: false, noVibrate: true,
  playLog: [
    { lv: 12, won: 1, quit: 0, moves: 21, sec: 140, firstClear: 2, firstGoal: 4, maxDry: 5, prog: 100, petActs: 6, petGoals: 2, myGoals: 3, skills: 3, rescues: 0, wave: 2, stars: 2, score: 344, pet: 'baozhu', petLv: 3, ver: '0.9.24', t: '2026-11-27T02:41' },
    { lv: 13, won: 0, quit: 1, moves: 30, sec: 188, firstClear: 1, firstGoal: 6, maxDry: 7, prog: 55, petActs: 4, petGoals: 1, myGoals: 2, skills: 2, rescues: 0, wave: 1, stars: 0, score: 0, pet: 'jinchique', petLv: 6, ver: '0.9.24', t: '2026-11-27T02:58' },
    { lv: 13, won: 1, quit: 0, moves: 44, sec: 201, firstClear: 1, firstGoal: 5, maxDry: 6, prog: 100, petActs: 9, petGoals: 3, myGoals: 3, skills: 4, rescues: 0, wave: 2, stars: 1, score: 512, pet: 'jinchique', petLv: 6, ver: '0.9.24', t: '2026-11-27T03:10' },
  ],
};
const SAME_KEYS = ['pets', 'petOrder', 'activePet', 'petStage', 'danDay', 'loss', 'cutSeen', 'playLog', 'muted', 'noVibrate', 'introSeen', 'petSeen', 'freshPet'];
const GONE = ['gourd', 'coins', 'best', 'bestEndless', 'buySingle', 'lastFed'];
const SLOTS_A = [3, 3, 3, 3, 1, 3, 2, 3, 3, 1, 3, 3, 1, 3], GOT_A = [4, 4, 4, 4, 4, 4, 3, 4, 7, 8, 4, 4, 2, 4];
const slotsArr = (s, n) => Array.from({ length: n }, (_, i) => (s.slots[i] ? s.slots[i].s : 0));
const gotArr = (s, n) => Array.from({ length: n }, (_, i) => (s.slots[i] ? s.slots[i].got : 0));
const win = (moves, x) => Object.assign({ won: true, moves, sec: 0, revives: 0, lent: false }, x || {});

t('T232', () => {
  const s = clone(SAVE_A), res = E.migrate(s);
  ok(s.dan === 25 && s.econGift === 18 && res.gift === 18 && s.econ === E.ECON_VER, 'T232 存档甲：丹 = 7 + 18 = 25；补丹数记的是 18；打上换算过的记号');
  ok(eq(slotsArr(s, 14), SLOTS_A) && eq(gotArr(s, 14), GOT_A), 'T232 14 关的槽 3、3、3、3、1、3、2、3、3、1、3、3、1、3；已拿 4、4、4、4、4、4、3、4、7、8、4、4、2、4');
  ok(!Object.keys(s.slots).some((i) => +i >= 14), 'T232 没打到的关没有槽的记录');
  ok(SAME_KEYS.every((k) => eq(s[k], SAVE_A[k])), 'T232 宠物（铜隼 6 级已喂 4 颗、穿山甲 3 级已喂 2 颗）、进度 14、出战、重打记录、连输、过场、试玩记录、设置原样');
  const top = JSON.stringify(Object.assign({}, s, { playLog: [] })); // 试玩记录里老的行不改（附录 F），别的地方都不该再有
  ok(GONE.every((k) => !(k in s)) && !/"stars"|"score"/.test(top), 'T232 金币、葫芦、分数、星、上次喂的是谁都没了');
});
t('T233', () => { const s = clone(SAVE_A); E.migrate(s); const once = JSON.stringify(s); const r2 = E.migrate(s); ok(JSON.stringify(s) === once && r2.gift === 0, 'T233 存档甲换算两遍：第二遍什么都不变'); });
t('T234', () => {
  const D = 20261201;
  const s = clone(SAVE_A); E.migrate(s);
  const r = E.settle(s, 9, PLV[9], win(PLV[9].par), D);
  ok(r.total === 5 && r.slotPay === 2 && r.replayPay === 3, 'T234 换算后换一天：第 10 关（头目，已拿 8）标准内不用救命过 → 5 颗（补 2 + 重打 3）');
  const s2 = clone(SAVE_A); E.migrate(s2);
  const a = E.settle(s2, 4, PLV[4], win(PLV[4].par + 1), D), b = E.settle(s2, 4, PLV[4], win(PLV[4].par), D);
  ok(a.total === 2 && a.slotPay === 0 && b.total === 3 && b.slotPay === 3, 'T234 第 5 关（难，已拿 4）2 槽过 → 2（只有重打）；再 3 槽过 → 补 3');
});
t('T235', () => {
  const all = (stars) => ({ ch1new: 1, petStage: 20, dan: 0, pets: {}, petOrder: [], best: Object.fromEntries(PLV.map((_, i) => [i, { stars, score: 100 }])) });
  const g = [3, 2, 1].map((st) => { const s = all(st); E.migrate(s); return s; });
  ok(eq(g.map((s) => s.econGift), [22, 40, 18]), 'T235 20 关全 3 星 / 全 2 星 / 全 1 星：补 22 / 40 / 18');
  const paid = PLV.reduce((a, st, i) => a + E.OLD_0924.pay(E.OLD_0924.kindAt(i), 3), 0);
  ok(paid === 82 && paid + g[0].econGift === 104 && gotArr(g[0], 20).reduce((a, b) => a + b, 0) === 104, 'T235 全 3 星的「当时给的 82 + 补的 22」正好 104（= 新规矩全拿满）');
});
t('T236', () => {
  const s = { petStage: 20, dan: 3, pets: { jinchique: { lv: 8, exp: 14 }, baozhuwang: { lv: 9, exp: 15 }, canjian: { lv: 7, exp: 12 } }, petOrder: ['jinchique', 'baozhuwang', 'canjian'] };
  E.migrate(s);
  ok(eq(s.pets.jinchique, { lv: 9, exp: 0 }) && eq(s.pets.baozhuwang, { lv: 10, exp: 0 }) && eq(s.pets.canjian, { lv: 7, exp: 12 }), 'T236 存档乙：8 级已喂 14 → 9 级已喂 0；9 级已喂 15 → 10 级；7 级已喂 12（新价 13）不变');
});
t('T237', () => {
  const s = { petStage: 2, dan: 9, pets: { tongque: { lv: 3, exp: 0 } }, petOrder: ['tongque'], tester: true, best: { 0: { stars: 3, score: 1 }, 1: { stars: 2, score: 1 }, 6: { stars: 3, score: 9 }, 15: { stars: 1, score: 9 } } };
  const r = E.migrate(s);
  ok(!s.slots[6] && !s.slots[15] && !r.levels.some((x) => x.idx === 6 || x.idx === 15) && s.dan >= 9, 'T237 存档丙（测试员玩过的）：进度第 3 关，第 7、16 关的星不算槽、不补丹；丹袋不减');
});
t('T238', () => {
  const s = { petStage: '5', dan: 'abc', pets: { tongque: { lv: 14, exp: 'x' }, baozhu: null, modou: { lv: -3 } }, best: { 0: { stars: 7 }, 1: { stars: 'two' }, 2: { stars: -1 }, 3: null, 4: 'x' } };
  let threw = false; try { E.migrate(s); } catch (e) { threw = e; }
  ok(!threw, 'T238 存档丁（坏的）：不报错' + (threw ? '（' + threw.message + '）' : ''));
  ok(!threw && Number.isInteger(s.dan) && s.dan >= 0 && s.pets.tongque.lv === 10 && s.pets.modou.lv === 1, 'T238 丹按 0 起；宠物 14 级按 10 级；-3 级按 1 级');
  ok(!threw && s.slots[0].s === 3 && s.slots[1].s >= 1 && s.slots[2].s >= 1 && s.slots[4].s >= 1 && !s.slots[5], 'T238 星按 0–3 收（7 → 3、字 → 0、负数 → 0，过了的关至少 1 槽）；进度 5 以后不记');
});
t('T240', () => {
  let seed = 99, bad = [];
  const rnd = (n) => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed % n; };
  const IDS = ['tongque', 'jinchique', 'baozhu', 'baozhuwang', 'modou', 'canjian', 'huli', 'lvgui', 'dagui'];
  for (let k = 0; k < 300; k++) {
    const st = rnd(21), pets = {};
    IDS.forEach((id) => { if (rnd(3) === 0) pets[id] = { lv: 1 + rnd(11), exp: rnd(18) }; });
    const best = {}; for (let i = 0; i < 20; i++) if (rnd(4)) best[i] = { stars: rnd(4), score: rnd(999) };
    const s = { petStage: st, dan: rnd(60), pets, petOrder: Object.keys(pets), best, gourd: rnd(99), coins: rnd(500) }, before = clone(s);
    try { E.migrate(s); } catch (e) { bad.push(k + ' 报错 ' + e.message); continue; }
    if (s.dan < before.dan) bad.push(k + ' 丹少了');
    if (Object.keys(s.pets).length !== Object.keys(before.pets).length) bad.push(k + ' 宠物少了');
    Object.keys(before.pets).forEach((id) => { if (s.pets[id].lv < Math.min(10, before.pets[id].lv)) bad.push(k + ' ' + id + ' 降级'); });
    if (s.petStage !== before.petStage) bad.push(k + ' 进度变了');
    Object.keys(s.slots).forEach((i) => { if (s.slots[i].got > E.OLD_0924.levelMax(+i)) bad.push(k + ' 第 ' + (+i + 1) + ' 关已拿超上限'); });
  }
  ok(!bad.length, 'T240 随机 300 份老存档：丹不减、宠物一只不少、等级不降、进度不变、每关已拿不超上限、不报错' + (bad.length ? '（' + bad.slice(0, 4).join('；') + '）' : ''));
});

// ---- 同一份存档甲塞进模拟微信开机（main.js 的 fixSave 真跑一遍）；T239 备份 ----
t('boot', () => {
  const { boot } = require('./wx-env.js');
  const raw = JSON.stringify(SAVE_A);
  const E1 = boot({ seed: 5, store: { [KEY]: raw } }), G = E1.G, s = G.save;
  ok(s.dan === 25 && s.econGift === 18 && s.econ === E.ECON_VER && eq(slotsArr(s, 14), SLOTS_A) && eq(gotArr(s, 14), GOT_A), '开机换算存档甲：丹 25、补 18、14 关的槽和已拿照表');
  // 段 3 换关卡表：一尾狐第 5 关、蚕宝宝第 13 关送，打到第 15 关的存档甲开机时照关卡表补上这两只（1 级、自己叼 1 颗），原有的两只原样
  ok(eq(s.pets, Object.assign({}, SAVE_A.pets, { huli: E.newPet(), modou: E.newPet() })) && eq(s.petOrder, SAVE_A.petOrder.concat(['huli', 'modou'])) && s.activePet === 'jinchique' && s.petStage === 14 && eq(s.danDay, SAVE_A.danDay) && eq(s.loss, SAVE_A.loss), '开机换算存档甲：宠物、出战、进度、重打记录、连输原样（照新关卡表补上一尾狐、蚕宝宝）');
  ok(GONE.every((k) => !(k in s)), '开机换算存档甲：金币、葫芦、分数、星、上次喂的是谁都没了');
  ok(E1.store[KEY + '_bak0924'] === raw, 'T239 换算前的存档原文另存了一份，一字不差');
  ok(!E1.errs().length, '开机换算：没有报错' + (E1.errs().length ? '（' + JSON.stringify(E1.errs()[0]).slice(0, 120) + '）' : ''));
  const store2 = Object.assign({}, E1.store); E1.restore();
  const E2 = boot({ seed: 6, store: store2 }), s2 = E2.G.save;
  ok(s2.dan === 25 && eq(gotArr(s2, 14), GOT_A) && E2.store[KEY + '_bak0924'] === raw, 'T233 / T239 再开一次机：不再补丹；备份没被第二遍盖掉');
  E2.restore();
  // 0.9.24 的墨斗蚕 5 级长大叫 hudie；11-28 新阵容里 hudie 是 10 级的第三个样子，5–9 级的应该是蚕茧 canjian
  const old3 = Object.assign(clone(SAVE_A), { pets: { jinchique: { lv: 6, exp: 4 }, baozhu: { lv: 3, exp: 2 }, hudie: { lv: 6, exp: 3 } }, petOrder: ['jinchique', 'baozhu', 'hudie'], activePet: 'hudie' });
  const E3 = boot({ seed: 7, store: { [KEY]: JSON.stringify(old3) } }), s3 = E3.G.save;
  ok(eq(s3.pets.canjian, { lv: 6, exp: 3 }) && !s3.pets.hudie && s3.activePet === 'canjian' && s3.petOrder.includes('canjian'), '老存档 6 级的「蝴蝶」（0.9.24 的长大版）换成新阵容的蚕茧，等级和已喂的丹原样');
  E3.restore();
  // 新玩家：不换算、不备份
  const E4 = boot({ seed: 8, store: {} });
  ok(E4.G.save.econ === E.ECON_VER && !(KEY + '_bak0924' in E4.store) && !E4.G.save.econGift, '新玩家：不换算、不备份');
  E4.restore();
});

console.log(pass + ' 项通过，' + fail + ' 项没过');
process.exit(fail ? 1 : 0);
