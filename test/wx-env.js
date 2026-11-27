// 模拟微信小游戏环境（没有 window / document，只有 wx）的公用底座（0.9.14 debug）。
// 每叫一次 boot() 就重新装一遍游戏（清掉 require 缓存），可以换屏幕大小、塞老存档、拿掉 ctx.ellipse、给胶囊按钮的位置。
// 用它的测试：test/wx-full.js（1–30 关全流程）、test/softlock.js（卡死专项）。
const path = require('path');
const ROOT = path.join(__dirname, '..');
const realNow = Date.now.bind(Date), realRandom = Math.random;

function boot(opts) {
  const o = Object.assign({ w: 390, h: 844, store: {}, seed: 1, ellipse: true, capsule: undefined }, opts || {});
  // 清掉上一次装的游戏
  for (const k of Object.keys(require.cache)) if (k.startsWith(ROOT + path.sep + 'js' + path.sep) || k === path.join(ROOT, 'game.js')) delete require.cache[k];
  const drawn = []; // 画到屏幕上的字和它的位置（查重叠、出屏用）：{ s, x, y }
  let tf = [1, 0, 0, 1, 0, 0]; const stack = [];
  const base = {
    save() { stack.push(tf.slice()); }, restore() { if (stack.length) tf = stack.pop(); },
    setTransform(a, b, c, d, e, f) { tf = [a, b, c, d, e, f]; },
    translate(x, y) { tf[4] += tf[0] * x + tf[2] * y; tf[5] += tf[1] * x + tf[3] * y; },
    scale(x, y) { tf[0] *= x; tf[1] *= x; tf[2] *= y; tf[3] *= y; },
    rotate() {},
    fillText(s, x, y) { drawn.push({ s: String(s), x: (tf[0] * x + tf[2] * y + tf[4]) / env.dpr, y: (tf[1] * x + tf[3] * y + tf[5]) / env.dpr }); },
  };
  const ctx = new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'ellipse' && !o.ellipse) return undefined; // 老的微信画布没有 ellipse
      if (/create(Linear|Radial)Gradient|createPattern/.test(k)) return () => ({ addColorStop() {} });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const handlers = {}; let frames = []; const store = Object.assign({}, o.store);
  const env = { dpr: 2, canvases: 0, hides: [], shows: [], hide() { env.hides.forEach((f) => f()); }, show() { env.shows.forEach((f) => f()); }, wxErr: null, modal: { confirm: true, content: '测试备注' }, clip: null, vib: [] };
  global.wx = {
    createCanvas: () => { if (o.canvasLimit && ++env.canvases > o.canvasLimit) throw new Error('createCanvas 失败（测试故意的）'); return { width: 0, height: 0, getContext: () => ctx }; }, createImage: () => ({}),
    getWindowInfo: () => ({ windowWidth: o.w, windowHeight: o.h, pixelRatio: 3 }),
    onTouchStart: (f) => (handlers.down = f), onTouchMove: (f) => (handlers.move = f), onTouchEnd: (f) => (handlers.up = f), onTouchCancel: (f) => (handlers.cancel = f),
    vibrateShort: (x) => env.vib.push(x && x.type), onHide: (f) => env.hides.push(f), onShow: (f) => env.shows.push(f), onError: (f) => (env.wxErr = f),
    setClipboardData: (x) => { env.clip = x.data; x.success && x.success(); }, showModal: (x) => x.success && x.success(env.modal),
    getStorageSync: (k) => (k in store ? store[k] : ''), setStorageSync: (k, v) => { if (o.storageLimit && String(v).length > o.storageLimit) throw new Error('exceed storage limit'); store[k] = v; },
  };
  if (o.capsule !== null) { // 右上角的胶囊按钮（「···」和关闭）：iPhone 上大约 87×32，离右边 7，在状态栏下面 4
    const top = o.capsule && o.capsule.top !== undefined ? o.capsule.top : o.h > 760 ? 51 : 24;
    global.wx.getMenuButtonBoundingClientRect = () => ({ width: 87, height: 32, left: o.w - 7 - 87, right: o.w - 7, top, bottom: top + 32 });
  }
  global.requestAnimationFrame = (f) => frames.push(f); globalThis.__WX_TEST__ = true;
  // 微信小游戏里没有浏览器的这几样（Node 里有）：拿掉，不然测到的是网页那条路
  for (const k of ['CompressionStream', 'DecompressionStream', 'Blob', 'btoa', 'atob', 'TextEncoder', 'TextDecoder', 'navigator', 'performance']) { try { Object.defineProperty(globalThis, k, { value: undefined, configurable: true, writable: true }); } catch (e) { /* 拿不掉就算了 */ } }
  if (typeof global.window !== 'undefined' || typeof global.document !== 'undefined') throw new Error('环境不干净');
  let now = 1e12 + o.seed * 7919; Date.now = () => now;
  let rs = (o.seed * 2654435761) >>> 0 || 1; Math.random = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
  const step = () => { now += 16; const f = frames.shift(); if (f) f(); };
  const run = (n) => { for (let i = 0; i < n; i++) step(); };
  const live = new Map(); // 现在按在屏幕上的手指（微信的 e.touches）
  const touch = (type, x, y, id) => {
    id = id === undefined ? 1 : id;
    if (type === 'down' || type === 'move') live.set(id, { identifier: id, clientX: x, clientY: y }); else live.delete(id);
    handlers[type === 'cancel' ? 'cancel' : type]({ changedTouches: [{ identifier: id, clientX: x, clientY: y }], touches: [...live.values()] });
  };
  const lose = (id) => live.delete(id === undefined ? 1 : id); // 手指抬起来了，但微信没告诉游戏（切后台、系统手势）
  require(path.join(ROOT, 'game.js'));
  run(5);
  const G = globalThis.__game;
  const btn = (id) => G.buttons().find((b) => b.id === id);
  const tap = (b, id) => { if (!b) return false; touch('down', b.x + b.w / 2, b.y + b.h / 2, id); run(1); touch('up', b.x + b.w / 2, b.y + b.h / 2, id); run(3); };
  const events = () => { if (G.T) G.T.flush(); try { return JSON.parse(store['jgx_ev1'] || '[]'); } catch (e) { return []; } };
  const errs = () => { if (G.T) G.T.flush(); return events().filter((e) => e[1] === 'X'); };
  const frameDrawn = () => { drawn.length = 0; run(1); return drawn.slice(); };
  return { G, run, step, touch, tap, btn, store, env, errs, events, frameDrawn, lose, W: o.w, H: o.h, advance: (ms) => { now += ms; }, restore: () => { Date.now = realNow; Math.random = realRandom; } };
}

// 像人一样打一步（mode = play）：有正经事就用技能块，不然照机器人挑的那一手真拖。skill < 1 = 手生，常挑次好的
function playStep(E, skill) {
  const { G, run, touch } = E, g = G.g;
  let from, to;
  const fitsAny = [0, 1, 2].some((i) => g.hand[i] && G.core.anyPlacement(g.board, g.hand[i]));
  let sk = g.hand[3] && G.PG.skillBest(g);
  // 0.9.25：三块都放不下、机器人又挑不出「好用」的技能时，真人还是会随便用一下技能（不然就停在那儿了）。照真人：找任意一个能用的地方用掉
  if (!sk && g.hand[3] && !fitsAny) {
    for (let j = 0; j < 3 && !sk; j++) if (g.hand[j]) for (let n = 0; n < g.hand[j].cells.length && !sk; n++) if (g.skillPlan({ hand: j, cell: n })) sk = { hand: j, cell: n, v: 1 };
    for (let k = 0; k < 81 && !sk; k++) if (g.skillPlan({ r: Math.floor(k / 9), c: k % 9 })) sk = { r: Math.floor(k / 9), c: k % 9, v: 1 };
  }
  if (sk && (sk.v >= 100 || !fitsAny)) {
    if (sk.hand !== undefined) { const f = G.fingerForHand(sk.hand, sk.cell); from = G.slotCenter(3); touch('down', from.x, from.y); run(2); touch('move', f.enter.x, f.enter.y); run(2); touch('move', f.x, f.y); run(2); touch('up', f.x, f.y); run(30); return 'skill-hand'; }
    from = G.slotCenter(3); to = G.fingerFor(g.hand[3], sk.r, sk.c);
    touch('down', from.x, from.y); run(2); touch('move', to.x, to.y); run(2); touch('up', to.x, to.y); run(30); return 'skill';
  }
  if (g.moves === 0 && G.petIdx === 0 && !G.save.petTutDone && G.tutorialTarget()) { const t = G.tutorialTarget(); from = G.slotCenter(0); to = G.fingerFor(g.hand[0], t.r, t.c); }
  else { const b = G.PG.bestMove(g, skill === undefined ? 1 : skill); if (!b) return null; from = G.slotCenter(b.i); to = G.fingerFor(g.hand[b.i], b.r, b.c); }
  touch('down', from.x, from.y); run(2); touch('move', to.x, to.y); run(2); touch('up', to.x, to.y); run(30);
  return 'place';
}
module.exports = { boot, playStep, ROOT };
