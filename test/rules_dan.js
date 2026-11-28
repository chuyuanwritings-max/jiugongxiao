// 段 2「丹」规则测试（丹细设计第四节 T201–T231、T247–T252，B3）：不开画面，直接调 js/economy.js 的纯函数
// Cc 11-28 定：丹价 5/7/9/11/12/13/14/14/15（100 颗满级）；丹进丹袋、玩家在宠物园挑喂谁；没亮的槽重打亮了补给；借宠封顶 2 槽；测试员跳关不给丹
const fs = require('fs'), path = require('path');
const E = require('../js/economy.js'), PG = require('../js/petgame.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
const t = (name, fn) => { try { fn(); } catch (e) { fail++; console.log('✗ ' + name + '：抛出异常 ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 造几类关（不靠关卡表，关卡表的检查在下面 T201–T203、T252）
const NORMAL = { goal: { monster: 5 }, par: 20 }, N7 = { goal: { monster: 5 }, par: 7 }, TEACH = { goal: { monster: 5 }, par: 7, teach: 1 };
const HARD = { goal: { monster: 8 }, hard: 1, par: 35 }, BOSS = { goal: { boss: 1 }, par: 30 }, RUSH = { goal: { lines: 24 }, rush: { t3: 36, t2: 48, lose: 60 }, par: 24 };
const win = (moves, x) => Object.assign({ won: true, moves, sec: 0, revives: 0, lent: false }, x || {});
const fresh = () => ({ dan: 0, slots: {}, danDay: {}, pets: {}, petOrder: [], petStage: 0 });
const D1 = E.dayKey(2026, 11, 28), D2 = E.dayKey(2026, 11, 29), D3 = E.dayKey(2026, 11, 30), D0 = E.dayKey(2026, 11, 27);

// ---- 规则 1–2：类型、槽 ----
t('T204', () => ok(eq([20, 21, 30, 31].map((m) => E.slotsOf(NORMAL, win(m))), [3, 2, 2, 1]), 'T204 普通关标 20：第 20 / 21 / 30 / 31 手赢 → 3 / 2 / 2 / 1 槽'));
t('T205', () => ok(eq([10, 11].map((m) => E.slotsOf(N7, win(m))), [2, 1]) && E.cut2(7) === 10, 'T205 标 7：第 10 / 11 手赢 → 2 / 1 槽（1.5 倍半手往下取）'));
t('T206', () => ok(E.slotsOf(TEACH, win(99)) === 3, 'T206 教学关第 99 手赢 → 3 槽'));
t('T207', () => ok(E.slotsOf(NORMAL, win(15, { revives: 1 })) === 2 && E.slotsOf(TEACH, win(5, { revives: 1 })) === 2 && E.slotsOf(BOSS, win(20, { revives: 1 })) === 2, 'T207 用过救命：普通关标准内、教学关、头目关标准内 → 都是 2 槽'));
t('T208', () => ok(E.slotsOf(NORMAL, win(31, { revives: 1 })) === 1, 'T208 用过救命、手数超 1.5 倍 → 1 槽（封顶不往上抬）'));
t('T209', () => ok(E.slotsOf(NORMAL, win(15, { lent: true })) === 2 && E.slotsOf(NORMAL, win(15, { lent: false })) === 3, 'T209 带借来的宠物标准内赢 → 2 槽；带自己的 → 3 槽'));
t('T210', () => ok(eq([36, 36.1, 48, 48.1, 60].map((s) => E.slotsOf(RUSH, win(30, { sec: s }))), [3, 2, 2, 1, 1]), 'T210 冲锋关第 7 关 36 / 36.1 / 48 / 48.1 / 60 秒 → 3 / 2 / 2 / 1 / 1 槽'));
t('T211', () => ok(E.slotsOf(NORMAL, { won: false, moves: 5 }) === 0 && E.slotsOf(TEACH, { won: false, moves: 5 }) === 0, 'T211 输了 → 0 槽'));
t('T212', () => {
  const L = (m, x) => E.live(NORMAL, Object.assign({ won: false, moves: m, revives: 0 }, x || {}));
  const a = L(0), b = L(19), c = L(20), d = L(30), e = L(5, { revives: 1 });
  ok(a.slots === 3 && a.left === 20 && a.counter, 'T212 计数器标 20：开局剩 20、3 槽亮');
  ok(b.slots === 3 && b.left === 1, 'T212 放完第 19 块：剩 1');
  ok(c.slots === 2 && c.left === 10 && c.counter, 'T212 放完第 20 块没赢：第 3 槽暗、计数器变成剩 10');
  ok(d.slots === 1 && !d.counter, 'T212 放完第 30 块没赢：第 2 槽暗、计数器收起');
  ok(e.slots === 2, 'T212 用救命：第 3 槽当场暗');
  const ev = E.slotEvents(NORMAL, L(19), c), ev2 = E.slotEvents(NORMAL, L(5), e), ev3 = E.slotEvents(NORMAL, L(29), d);
  ok(eq(ev, [{ slot: 3, why: 'moves' }]) && eq(ev2, [{ slot: 3, why: 'revive' }]) && eq(ev3, [{ slot: 2, why: 'moves' }]), 'T212 槽变暗事件：手数 / 救命各报一次，带第几个槽');
  const tl = E.live(TEACH, { won: false, moves: 50 }), rl = E.live(RUSH, { won: false, moves: 3, sec: 10 });
  ok(tl.slots === 3 && !tl.counter && rl.slots === 3 && !rl.counter, 'T212 教学关、冲锋关不出计数器');
  ok(eq(E.slotEvents(RUSH, E.live(RUSH, { won: false, sec: 36 }), E.live(RUSH, { won: false, sec: 37 })), [{ slot: 3, why: 'time' }]), 'T212 冲锋关过了刻痕：第 3 槽暗，原因是时间');
  ok(E.live(NORMAL, win(20)).slots === 3, 'T212 赢的那一手：亮几个和结算一样');
});

// ---- 规则 3–6：给多少丹 ----
const once = (stage, run, save, idx, day, opt) => E.settle(save || fresh(), idx || 0, stage, run, day || D1, opt);
t('T213', () => {
  const r = (st, m) => once(st, win(m)).total;
  ok(eq([r(NORMAL, 31), r(NORMAL, 25), r(NORMAL, 20)], [1, 2, 4]), 'T213 普通关第一次 1 / 2 / 3 槽 → 1 / 2 / 4 颗');
  ok(eq([r(HARD, 60), r(HARD, 40), r(HARD, 30)], [2, 4, 7]), 'T213 难关第一次 1 / 2 / 3 槽 → 2 / 4 / 7 颗');
  ok(eq([r(BOSS, 50), r(BOSS, 40), r(BOSS, 30)], [3, 6, 10]), 'T213 头目关第一次 1 / 2 / 3 槽 → 3 / 6 / 10 颗');
  ok(E.levelMax(NORMAL) === 4 && E.levelMax(TEACH) === 4 && E.levelMax(RUSH) === 4 && E.levelMax(HARD) === 7 && E.levelMax(BOSS) === 10, 'T213 每关一辈子最多 4 / 7 / 10');
});
t('T214', () => ok(once(TEACH, win(50)).total === 4, 'T214 教学关第一次过 → 4 颗（3 + 拿满 1）'));
t('T215', () => ok(eq([60, 48, 36].map((s) => once(RUSH, win(30, { sec: s })).total), [1, 2, 4]), 'T215 冲锋关第一次 1 / 2 / 3 槽 → 1 / 2 / 4 颗'));
t('T216', () => {
  const s = fresh(), a = E.settle(s, 0, NORMAL, win(25), D1), b = E.settle(s, 0, NORMAL, win(19), D2);
  ok(a.total === 2 && b.total === 3, 'T216 普通关先 2 槽过 → 2；换一天 3 槽过 → 3');
  ok(b.slotPay === 2 && b.fullFirst && b.replayPay === 1 && eq(b.lit, ['had', 'had', 'new']), 'T216 结算单分开写：补槽 1 + 拿满 1（slotPay 2，fullFirst）+ 重打 1；第 3 槽是新亮的');
});
t('T217', () => {
  const s = fresh(), a = E.settle(s, 9, BOSS, win(25, { revives: 1 }), D1), b = E.settle(s, 9, BOSS, win(25), D2), c = E.settle(s, 9, BOSS, win(25), D3);
  ok(a.total === 6 && a.cap === 'revive' && b.total === 7 && b.slotPay === 4 && b.replayPay === 3 && c.total === 3, 'T217 头目关：先救命标准内 6；换天不救命 7（3 + 1 + 3）；再换天 3');
});
t('T218', () => {
  const s = fresh(), a = E.settle(s, 4, HARD, win(30), D1), b = E.settle(s, 4, HARD, win(99), D2);
  ok(a.total === 7 && b.total === 2 && b.slotPay === 0 && s.slots[4].s === 3, 'T218 难关先 3 槽 7；换天 1 槽 2（只有重打）；最好成绩还是 3 槽');
});
t('T219', () => {
  const s = fresh(); E.settle(s, 0, NORMAL, win(20), D1);
  const rs = [1, 2, 3].map(() => E.settle(s, 0, NORMAL, win(20), D2).replayPay);
  ok(eq(rs, [1, 0, 0]), 'T219 同一关同一天重打赢 3 次：重打那一份只给 1 次');
});
t('T220', () => { const s = fresh(); const a = E.settle(s, 0, NORMAL, win(20), D1), b = E.settle(s, 0, NORMAL, win(20), D1); ok(a.replayPay === 0 && a.first && b.replayPay === 1, 'T220 第一次过关不算重打；当天马上再赢一次给重打那一份'); });
t('T221', () => { const s = fresh(); E.settle(s, 0, NORMAL, win(20), D0); E.settle(s, 0, NORMAL, win(20), D1); ok(E.settle(s, 0, NORMAL, win(20), D2).replayPay === 1, 'T221 昨天重打过，今天再赢 → 给'); });
t('T222', () => { const s = fresh(); E.settle(s, 0, NORMAL, win(20), D1); s.danDay[0] = D3; ok(!E.replayOpen(s, 0, D2) && E.settle(s, 0, NORMAL, win(20), D2).replayPay === 0 && s.danDay[0] === D3, 'T222 上次重打的日期比今天晚（钟往回调）→ 不给，记录不动'); });
t('T223', () => {
  const s = fresh(); let full = 0;
  for (let k = 0; k < 6; k++) { const r = E.settle(s, 0, NORMAL, win(20), D1 + k); if (r.fullFirst) full++; }
  ok(full === 1 && s.slots[0].got === 4, 'T223 拿满那 1 颗：先 3 槽过，再 3 槽过 5 次 → 只给 1 次');
});
t('T224', () => {
  const kinds = [NORMAL, TEACH, HARD, BOSS, RUSH, N7], s = fresh(); let seed = 12345, sum = 0, bad = 0;
  const rnd = (n) => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed % n; };
  const stOf = (i) => kinds[i % kinds.length];
  for (let k = 0; k < 200; k++) {
    const idx = rnd(12), st = stOf(idx), won = rnd(4) > 0;
    const r = E.settle(s, idx, st, { won, moves: 1 + rnd(80), sec: rnd(70), revives: rnd(5) === 0 ? 1 : 0, lent: rnd(6) === 0 }, E.dayKey(2026, 12, 1 + rnd(20)));
    sum += r.total;
    Object.keys(s.slots).forEach((i) => { if (s.slots[i].got > E.levelMax(stOf(+i))) bad++; });
  }
  ok(!bad && s.dan === sum && sum > 100, 'T224 随便打 200 局：每关已拿 ≤ 4 / 7 / 10；丹袋 = 所有结算单的合计（' + sum + ' 颗）');
});
t('T225', () => {
  const s = fresh(), run = win(20), a = E.settle(s, 0, NORMAL, run, D1), d1 = s.dan, b = E.settle(s, 0, NORMAL, run, D1);
  ok(a === b && s.dan === d1 && d1 === 4, 'T225 同一局结算两次：第二次不给，返回的结算单和第一次一样');
});

// ---- 规则 7–9：丹袋、升级、别的情况 ----
t('T226', () => {
  const N = E.EXP_NEED.slice(1), sum = N.reduce((a, b) => a + b, 0), to5 = N.slice(0, 4).reduce((a, b) => a + b, 0);
  ok(eq(N, [5, 7, 9, 11, 12, 13, 14, 14, 15]) && sum === 100 && sum === E.PET_FULL && to5 === 32 && to5 === E.EVO_TOTAL && N.every((x, i) => !i || x >= N[i - 1]), 'T226 价表 5、7、9、11、12、13、14、14、15；合计 100；到 5 级累计 32；没有哪一级比上一级便宜');
  ok(E.EVO_LV === PG.EVO_LV && E.LV_CAP === PG.ULT_LV, 'T226 economy 的 5 级长大、10 级满级和 petgame 是同一个数');
});
t('T227', () => {
  const s = { dan: 4, pets: { tongque: { lv: 1, exp: 0 } }, petOrder: ['tongque'] };
  const a = E.levelUp(s, 'tongque'); const d4 = s.dan; s.dan = 5; const b = E.levelUp(s, 'tongque');
  ok(!a.ok && d4 === 4 && b.ok && s.pets.tongque.lv === 2 && s.dan === 0, 'T227 丹袋 4 颗点升级：不动不扣；5 颗再点：升到 2 级、丹袋 0');
});
t('T228', () => { const p = E.newPet(); ok(p.lv === 1 && p.exp === 1 && E.cost(p) === 4, 'T228 新来的宠物：1 级、已经喂了 1 颗；升 2 级只要 4 颗'); });
t('T229', () => {
  const s = { dan: 200, pets: { tongque: E.newPet() }, petOrder: ['tongque'] }; let n = 0, oneEach = true;
  for (let k = 0; k < 15; k++) { const lv0 = s.pets.tongque.lv, r = E.levelUp(s, 'tongque'); if (r.ok) { n++; if (s.pets.tongque.lv !== lv0 + 1) oneEach = false; } }
  ok(oneEach && n === 9 && s.pets.tongque.lv === 10 && 200 - s.dan === 99 && !E.canLevel(s, 'tongque'), 'T229 丹袋 200 颗连点：每次一级；到 10 级点不动；一共扣 99 颗（它自己叼了 1 颗）');
});
t('T230', () => {
  const s = { dan: 50, pets: { tongque: { lv: 4, exp: 0 } }, petOrder: ['tongque'] }, r = E.levelUp(s, 'tongque');
  const s2 = { dan: 50, pets: { jinchique: { lv: 9, exp: 0 } }, petOrder: ['jinchique'] }, r2 = E.levelUp(s2, 'jinchique');
  ok(r.ok && r.evo && !r.ult && r.cost === 11 && s.dan === 39, 'T230 4 级升 5 级：结果写着「到了长大的等级」，丹只扣一次（11 颗）');
  ok(r2.ok && r2.ult && !r2.evo && r2.cost === 15 && s2.dan === 35, 'T230 9 级升 10 级：结果写着「学绝招」（第二次长大），扣 15 颗');
});
t('T247', () => {
  const s = fresh(); E.settle(s, 0, NORMAL, win(25), D1); const snap = JSON.stringify(s);
  const r = E.settle(s, 0, NORMAL, { won: false, moves: 40 }, D2);
  ok(r.total === 0 && JSON.stringify(s) === snap, 'T247 输了：丹袋、槽、今天重打的记录、已拿的数都不变');
});
t('T248', () => {
  const s = fresh(); s.petStage = 2; const snap = JSON.stringify(s);
  const r = E.settle(s, 6, RUSH, win(20, { sec: 30 }), D1, { practice: true });
  ok(r.total === 0 && r.practice && JSON.stringify(s) === snap && !s.slots[6] && s.petStage === 2, 'T248 测试员模式真进度第 3 关、跳去赢第 7 关：丹袋不变、第 7 关没有槽的记录、进度不变');
});
t('T249', () => {
  const s = fresh(); const a = E.settle(s, 2, TEACH, win(10), D1, { practice: false }), b = E.settle(s, 2, TEACH, win(10), D2, { practice: false });
  ok(a.total === 4 && b.total === 1, 'T249 测试员模式下赢自己真打到的那一关、重打过了的关：照常给');
});
t('T250', () => {
  const s = fresh(); s.pets = { tongque: { lv: 2, exp: 0 } }; E.settle(s, 0, NORMAL, win(20), D1);
  const r = E.settle(s, 0, NORMAL, win(20, { lent: true }), D2);
  ok(r.replayPay === 1 && s.dan === 5 && s.pets.tongque.exp === 0 && s.pets.tongque.lv === 2, 'T250 带借来的宠物赢：丹进丹袋（不进宠物）；重打那一份照给');
});

// ---- B3：算丹的文件不碰画面、声音、存档读写、时钟 ----
t('B3', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'economy.js'), 'utf8').replace(/\/\/.*$/gm, '');
  const reqs = (src.match(/require\(([^)]*)\)/g) || []).filter((x) => !/petlevels/.test(x));
  ok(!reqs.length && !/\bDate\b|P\.now|persist\(|wx\.|window\.|ctx\.|\bsave\s*=(?!=)/.test(src), 'B3 economy.js 不引用画面、平台文件，不读时钟，不碰全局存档');
});

// 关卡表那几条（T201–T203、T231、T252）段 2 第 3 步加在这里

console.log(pass + ' 项通过，' + fail + ' 项没过');
process.exit(fail ? 1 : 0);
