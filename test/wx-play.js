// 模拟微信小游戏环境（没有 window / document，只有 wx）一路打第 1–10 关（0.9.14）：
// 用真触摸事件拖块、用技能块；结算页、宠物园、进关卡片的按钮照常点；第 5 关故意堵死一次、看广告复活、再打完。
// 抓的是「只在微信里才会出的错」：游戏里的出错记账（代号 X）、抛出来的异常、卡住不动。用法：node test/wx-play.js
const path = require('path');
const ctx = new Proxy({}, { get(t, k) { if (k in t) return t[k]; if (/create(Linear|Radial)Gradient|createPattern/.test(k)) return () => ({ addColorStop() {} }); if (k === 'measureText') return (s) => ({ width: String(s).length * 10 }); return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
const handlers = {}; let frames = []; const store = {}; let wxErr = null;
global.wx = { createCanvas: () => ({ width: 0, height: 0, getContext: () => ctx }), createImage: () => ({}), getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3 }),
  onTouchStart: (f) => (handlers.down = f), onTouchMove: (f) => (handlers.move = f), onTouchEnd: (f) => (handlers.up = f), onTouchCancel: () => {}, vibrateShort: () => {}, onHide: () => {}, onShow: () => {}, onError: (f) => (wxErr = f),
  setClipboardData: (o) => o.success && o.success(), showModal: (o) => o.success && o.success({ confirm: true, content: '测试备注' }),
  getStorageSync: (k) => store[k] || '', setStorageSync: (k, v) => { store[k] = v; }, createInnerAudioContext: () => ({ play() {}, stop() {}, onError() {} }) };
global.requestAnimationFrame = (f) => frames.push(f); globalThis.__WX_TEST__ = true;
if (typeof global.window !== 'undefined' || typeof global.document !== 'undefined') throw new Error('环境不干净');
let now = 1e12; Date.now = () => now;
const step = () => { now += 16; const f = frames.shift(); if (f) f(); };
const run = (n) => { for (let i = 0; i < n; i++) step(); };
const touch = (type, x, y) => handlers[type]({ changedTouches: [{ identifier: 1, clientX: x, clientY: y }], touches: [] });
const tap = (b) => { touch('down', b.x + b.w / 2, b.y + b.h / 2); run(1); touch('up', b.x + b.w / 2, b.y + b.h / 2); run(3); };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };
const thrown = [];
try {
  require(path.join(__dirname, '..', 'game.js')); run(5);
  const G = globalThis.__game;
  const btn = (id) => G.buttons().find((b) => b.id === id);
  let steps = 0, last = '', same = 0, revived = false, stuckAt = null;
  while (G.save.petStage < 10 && steps++ < 20000) {
    const g = G.g, mode = G.mode;
    const key = mode + '|' + G.petIdx + '|' + (g && g.moves) + '|' + G.buttons().map((b) => b.id).join(',');
    same = key === last ? same + 1 : 0; last = key;
    if (same > 400) { stuckAt = key; break; }
    if (mode === 'cut') { touch('down', 195, 420); run(2); continue; }
    if (mode === 'intro') { run(10); const b = btn('introOk'); if (b) tap(b); continue; }
    if (mode === 'start') { run(10); const b = btn('startGo'); if (b) tap(b); continue; }
    if (mode === 'home') { const b = btn('homePlay'); if (b) tap(b); continue; }
    if (mode === 'map') { const b = btn('play'); if (b) tap(b); continue; }
    if (mode === 'ad') { run(10); continue; }
    if (G.buttons().some((x) => x.id === 'evoTap')) { tap(btn('evoTap')); run(5); continue; } // 0.9.20 进化动画：点一下跳过 / 关掉
    if (mode === 'camp' && !btn('campPlay')) { run(10); continue; }
    if (mode === 'camp') { const act = G.save.activePet || G.save.petOrder[0]; const fd = btn('feedG'), ev = btn('evolveG'); if (ev) tap(ev); else if (fd && G.save.dan >= G.danToLevel(act)) tap(fd); else if (!fd && G.save.dan >= G.danToLevel(act)) { const b = btn('gpet_' + act); if (b) tap(b); else tap(btn('campPlay')); } else tap(btn('campPlay')); run(5); continue; }
    if (mode === 'over') { run(80); const r = G.result; const b = r && r.won ? btn('tocamp') : (!revived && btn('revive')) || btn('lend') || btn('again'); if (b) { if (b.id === 'revive') revived = true; tap(b); } run(20); continue; }
    if (mode === 'play') {
      if (g.over) { run(20); continue; }
      // 第 5 关第一次：故意堵死（宠物能量清零、盘面每排空两格、手上 1 格 + 两块 3×3）
      if (G.petIdx === 4 && !revived && g.moves >= 3 && !g._jammed) {
        g._jammed = true; const U = G.core.UNITS;
        for (let k = 0; k < 81; k++) { if (g.board[k] >= 2) continue; const r = Math.floor(k / 9), c = k % 9, m = ((c - 2 * r) % 9 + 9) % 9; g.board[k] = m === 0 || m === 4 ? 0 : 1; if (g.board[k]) { g.color[k] = 0; } } // 墨怪、障碍留着（不然目标永远完不成；段 1 宝石拆了）
        g.team.forEach((t) => (t.energy = 0)); g.hand = [G.core.PIECES['1'], G.core.PIECES.sq3, G.core.PIECES.sq3, null];
        const okK = (k) => U.filter((u) => u.includes(k)).every((u) => u.filter((x) => !g.board[x]).length >= 2);
        const k0 = [...Array(81).keys()].find((k) => !g.board[k] && okK(k));
        if (k0 !== undefined) { const f0 = G.slotCenter(0), t0 = G.fingerFor(g.hand[0], Math.floor(k0 / 9), k0 % 9); touch('down', f0.x, f0.y); run(2); touch('move', t0.x, t0.y); run(2); touch('up', t0.x, t0.y); run(30); continue; }
      }
      let from, to;
      let sk = g.hand[3] && G.PG.skillBest(g);
      const reach = (t) => { if (t.hand !== undefined) return true; const f = G.fingerFor(g.hand[3], t.r, t.c), got = G.skillTarget({ x: f.x, y: f.y }); return !!got && got.r === t.r && got.c === t.c; }; const fitsAny = [0, 1, 2].some((i) => g.hand[i] && G.core.anyPlacement(g.board, g.hand[i])); if (sk && !reach(sk)) { sk = null; if (!fitsAny) for (let k = 0; k < 81 && !sk; k++) { const t2 = { r: Math.floor(k / 9), c: k % 9 }; if (g.skillPlan(t2) && reach(t2)) sk = Object.assign(t2, { v: 1 }); } } /* 段 3：真人手指够不着的格子换一格点（和 wx-env 的 playStep 一样；原来 390、430 宽屏右下角两格够不着，段 3 已把取消线往下挪半格，这里留着防万一） */
      if (sk && (sk.v >= 100 || ![0, 1, 2].some((i) => g.hand[i] && G.core.anyPlacement(g.board, g.hand[i])))) {
        if (sk.hand !== undefined) { const f = G.fingerForHand(sk.hand, sk.cell || 0); /* 段 3：小龟的转块没有「第几格」 */ from = G.slotCenter(3); touch('down', from.x, from.y); run(2); touch('move', f.enter.x, f.enter.y); run(2); touch('move', f.x, f.y); run(2); touch('up', f.x, f.y); run(30); continue; }
        from = G.slotCenter(3); to = G.fingerFor(g.hand[3], sk.r, sk.c);
      } else if (g.moves === 0 && G.petIdx === 0 && !G.save.petTutDone && G.tutorialTarget()) { const t = G.tutorialTarget(); from = G.slotCenter(0); to = G.fingerFor(g.hand[0], t.r, t.c); }
      else { const b = G.PG.bestMove(g, 1); if (!b) { run(30); continue; } from = G.slotCenter(b.i); to = G.fingerFor(g.hand[b.i], b.r, b.c); }
      touch('down', from.x, from.y); run(2); touch('move', to.x, to.y); run(2); touch('up', to.x, to.y); run(30);
      if (Math.random() < 0.02) { const s = btn('snap'); if (s) tap(s); } // 偶尔点一下「记一下」
      continue;
    }
    run(5);
  }
  const ev = JSON.parse(store['jgx_ev1'] || '[]'), errs = ev.filter((e) => e[1] === 'X');
  ok(!stuckAt, '微信环境一路打：没有卡住' + (stuckAt ? '——卡在 ' + stuckAt : ''));
  ok(G.save.petStage >= 10, '微信环境打到第 ' + G.save.petStage + ' 关（目标 10）');
  ok(revived, '中途看广告复活过一次，之后照样打完');
  ok(errs.length === 0, '游戏里没有出错记账' + (errs.length ? '：' + errs.slice(0, 3).map((e) => e.slice(2).join(' / ')).join(' || ') : ''));
  ok(ev.some((e) => e[1] === 'S'), '「记一下」在微信里能记（写备注走 wx.showModal）');
} catch (e) { thrown.push(e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : String(e)); }
ok(thrown.length === 0, '没有抛出异常' + (thrown.length ? '：' + thrown[0] : ''));
console.log(`\n${pass} 项通过，${fail} 项没过`);
process.exit(fail ? 1 : 0);
