// 平台层：只有这个文件知道自己跑在微信里还是浏览器里。
// 微信小游戏：wx.createCanvas / wx.onTouchStart / wx.createRewardedVideoAd
// 浏览器预览：一张 <canvas id="game">，用 pointer 事件（只用一种事件，免得一次点击被算两次）
const isWx = typeof wx !== 'undefined' && wx && typeof wx.createCanvas === 'function';

function setup(onTouch) {
  let canvas, width, height, dpr, capsule = null;
  if (isWx) {
    canvas = wx.createCanvas();
    const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
    width = info.windowWidth;
    height = info.windowHeight;
    dpr = Math.min(2, info.pixelRatio || 2); // 0.8.4：最多按 2 倍画（3 倍屏多画一倍多的像素，手机上看不出差别，却会卡）
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    // 右上角的胶囊按钮（「···」和关闭，微信自己画在最上面）：它挡住的地方不能放东西（0.9.14 debug）
    try {
      let r = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
      if (!r || !(r.width > 0) || !(r.bottom > 0) || r.bottom > height / 3) { // 有的机型开机时拿到全 0：照状态栏高度估一个
        const sb = info.statusBarHeight > 0 ? info.statusBarHeight : (info.safeArea && info.safeArea.top > 0 ? info.safeArea.top : height > 760 ? 47 : 20);
        r = { left: width - 94, right: width - 7, top: sb + 4, bottom: sb + 36 };
      }
      capsule = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    } catch (e) { capsule = null; }
    // live = 现在还按在屏幕上的手指（e.touches）。切后台、系统手势有时不给「抬起」，游戏靠它知道拖着的那根手指早就不在了
    const send = (type) => (e) => {
      const list = e.changedTouches || [];
      const live = e.touches ? Array.prototype.map.call(e.touches, (t) => t.identifier) : undefined;
      for (let i = 0; i < list.length; i++) {
        onTouch(type, list[i].identifier, list[i].clientX, list[i].clientY, live);
      }
    };
    wx.onTouchStart((e) => {
      unlockAudio();
      send('down')(e);
    });
    wx.onTouchMove(send('move'));
    wx.onTouchEnd(send('up'));
    wx.onTouchCancel(send('cancel')); // 被系统打断（来电、切后台、系统手势）：不算松手，拖着的块放回托盘（原来当成松手，块会落在打断那一刻的位置）
  } else {
    canvas = document.getElementById('game');
    // 电脑上预览时装成一部手机大小；手机浏览器里就占满屏
    const phone = window.innerWidth > 520;
    width = phone ? 390 : window.innerWidth;
    height = phone ? Math.min(844, window.innerHeight - 20) : window.innerHeight;
    // 游戏修改器切机型时，指定装成哪部手机
    const dev = window.__DEVICE;
    if (dev) { width = dev.w; height = dev.h; }
    if (window.__CAPSULE) capsule = window.__CAPSULE; // 测试：在网页里装一个微信的胶囊按钮
    dpr = Math.min(2, window.devicePixelRatio || 2); // 同上：网页版 3 倍屏也按 2 倍画
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      unlockAudio();
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      onTouch('down', e.pointerId, p[0], p[1]);
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e);
      onTouch('move', e.pointerId, p[0], p[1]);
    });
    const up = (e) => {
      const p = pos(e);
      onTouch('up', e.pointerId, p[0], p[1]);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', (e) => { const p = pos(e); onTouch('cancel', e.pointerId, p[0], p[1]); });
  }
  const ctx = canvas.getContext('2d');
  polyfillEllipse(ctx);
  return { canvas, ctx, width, height, dpr, capsule };
}
// 老的微信画布没有 ctx.ellipse（馋嘴怪的嘴、甲壳怪的壳、过场都在用）：没有就用「挪、转、压扁、画圆弧」补一个，补在原型上，离屏画布也有
function polyfillEllipse(ctx) {
  try {
    if (!ctx || typeof ctx.ellipse === 'function') return;
    const fn = function (x, y, rx, ry, rot, a0, a1, ccw) { this.save(); this.translate(x, y); this.rotate(rot || 0); this.scale(rx, ry); this.arc(0, 0, 1, a0, a1, !!ccw); this.restore(); };
    const proto = Object.getPrototypeOf(ctx);
    if (proto && proto !== Object.prototype) proto.ellipse = fn;
    if (typeof ctx.ellipse !== 'function') ctx.ellipse = fn;
  } catch (e) { /* 补不上就算了 */ }
}

// 离屏画布：微信里第一次之后的 wx.createCanvas() 都是离屏的
function makeCanvas(w, h) {
  const c = isWx ? wx.createCanvas() : document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// 读一张图片（微信 wx.createImage，浏览器 new Image）。读不到就调 fail，不报错
function loadImage(src, ok, fail) {
  try {
    const img = isWx ? wx.createImage() : new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail && fail();
    img.src = src;
  } catch (e) {
    if (fail) fail();
  }
}

function now() {
  return Date.now();
}

function nextFrame(fn) {
  return requestAnimationFrame(fn);
}

// 震动三档：light / medium / heavy（照 ../../../00_震动手感规矩_1.0.md）。旧写法 true = heavy、false = light 也认。
// 安卓有的机型不认 type 会走 fail：安静，什么都不做。
function vibrate(level) {
  const type = level === true ? 'heavy' : level === 'medium' || level === 'heavy' ? level : 'light';
  try {
    if (isWx && wx.vibrateShort) {
      wx.vibrateShort({ type, fail() {} });
    } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(type === 'heavy' ? 30 : type === 'medium' ? 18 : 10);
    }
  } catch (e) { /* 不报错 */ }
}

// 激励视频。填了广告位 id 且在微信里才放真广告，返回 true；
// 否则返回 false，由游戏自己放「广告占位」倒计时。
let rewardedAd = null;
function showRewardedAd(adUnitId, onReward, onSkip) {
  if (!isWx || !adUnitId || !wx.createRewardedVideoAd) return false;
  if (!rewardedAd) rewardedAd = wx.createRewardedVideoAd({ adUnitId });
  rewardedAd.offClose();
  rewardedAd.onClose((res) => {
    // 旧版基础库 res 为 undefined，算看完
    if (!res || res.isEnded) onReward();
    else onSkip();
  });
  rewardedAd.show().catch(() => {
    rewardedAd.load().then(() => rewardedAd.show()).catch(() => onReward());
  });
  return true;
}

// 音效：WebAudio（微信 wx.createWebAudioContext，浏览器 AudioContext）。放不出来就安静，不报错
const sfx = require('./sfx.js');
let audio = null;
const buffers = {};
let muted = false;
function audioCtx() {
  if (audio !== null) return audio;
  try {
    if (isWx && wx.createWebAudioContext) audio = wx.createWebAudioContext();
    else if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) audio = new (window.AudioContext || window.webkitAudioContext)();
    else audio = false;
  } catch (e) {
    audio = false;
  }
  return audio;
}
// 浏览器要在手指点下去的那一刻打开声音
let warmed = false;
function unlockAudio() {
  const a = audioCtx();
  if (a && a.state === 'suspended' && a.resume) a.resume();
  if (a && !warmed) { warmed = true; warmSounds(); } // 0.9.18：第一次碰屏幕后，把常用的声音一个个先算好
}
// 0.9.18：同一瞬间好几声，消除和弦最优先，别的自动变小（声音包装方案第四节第 6 条）
const BIG = /^(clear\d|sweep|dong|line|box|combo\d|five)$/;
let lastBigAt = -9;
function sound(name, volume) {
  if (muted) return;
  const a = audioCtx();
  if (!a) return;
  try {
    if (BIG.test(name)) lastBigAt = a.currentTime;
    else if (a.currentTime - lastBigAt < 0.25) volume = (volume === undefined ? 0.6 : volume) * 0.5;
    if (!buffers[name]) {
      const sr = 22050;
      const data = sfx.make(name, sr);
      if (!data) return;
      const buf = a.createBuffer(1, data.length, sr);
      buf.getChannelData(0).set(data);
      buffers[name] = buf;
    }
    const src = a.createBufferSource();
    src.buffer = buffers[name];
    const g = a.createGain();
    g.gain.value = volume === undefined ? 0.6 : volume;
    src.connect(g);
    g.connect(a.destination);
    src.start(0);
  } catch (e) {
    // 放不出声音就算了
  }
}
function setMuted(v) {
  muted = !!v;
  music.setMuted(muted);
}
// 先把常用的声音算好（一个一个来，不卡画面）：第一次消除不用现算 2 秒的编钟
function warmSounds(list) {
  const a = audioCtx();
  if (!a) return;
  const todo = (list || ['place', 'pick', 'deny', 'clear0', 'clear1', 'clear2', 'clear3', 'clear4', 'sweep', 'dong', 'pop', 'deal', 'tap', 'select', 'thump', 'plop', 'skitter', 'chirp', 'peck', 'win', 'lose', 'lit']).filter((n) => !buffers[n]);
  const step = () => {
    const name = todo.shift();
    if (!name) return;
    try { const sr = 22050, data = sfx.make(name, sr); if (data) { const buf = a.createBuffer(1, data.length, sr); buf.getChannelData(0).set(data); buffers[name] = buf; } } catch (e) { /* 算不出来就到时候再算 */ }
    setTimeout(step, 30);
  };
  setTimeout(step, 50);
}
// 背景音乐（js/music.js）：放第几章、紧张程度；打完头目收尾；过场声
const music = require('./music.js');
function musicReady() { const a = audioCtx(); return !!a && music.init(a, a.destination); }
const bgm = {
  play: (c, tens) => { try { if (musicReady()) music.play(c, tens); } catch (e) { /* 放不出来就安静 */ } },
  stop: () => { try { music.stop(); } catch (e) { /* */ } },
  outro: (c) => { try { if (musicReady()) music.outro(c); } catch (e) { /* */ } },
  sting: (k) => { try { return musicReady() ? music.sting(k) : 0; } catch (e) { return 0; } },
  playing: () => music.playing(),
};

// 存档：微信用 wx.setStorageSync，浏览器用 localStorage
function load(key) {
  try {
    const raw = isWx ? wx.getStorageSync(key) : window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// 存上了返回 true；存不了（微信一个键最多 1 MB、满了会抛错）返回 false，不报错
function save(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (isWx) wx.setStorageSync(key, raw);
    else window.localStorage.setItem(key, raw);
    return true;
  } catch (e) {
    return false;
  }
}

function exposeForTest(name, value) {
  if (typeof globalThis !== 'undefined' && globalThis.__WX_TEST__) globalThis[name] = value; // 模拟微信环境的测试（test/wx-play.js）用
  if (!isWx && typeof window !== 'undefined') window[name] = value;
}

// 复制一段字到剪贴板（试玩记录给 Kira）
// 复制（0.9.11 修：Cc 11-25 在手机网页里点「复制试玩记录」报「复制不了」，玩了半天的记录拿不出来）。
// 微信内置浏览器、iPhone 的网页经常不给用 navigator.clipboard，所以三层：
// ① 老办法：藏一个文本框、选中、execCommand('copy')（手指点下去的那一刻同步做，iPhone 也认）；
// ② 新办法 navigator.clipboard；
// ③ 都不行：弹一个网页框，里面是全部记录（已全选）和一个真的「复制」按钮，复制不了也能长按「全选 → 拷贝」。
// 回调 ok(true) = 已复制；ok('box') = 弹了框。
function legacyCopy(str) {
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = str;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;font-size:16px;';
  document.body.appendChild(ta);
  let done = false;
  try {
    ta.focus(); ta.select(); ta.setSelectionRange(0, str.length);
    done = document.execCommand('copy');
  } catch (e) { done = false; }
  document.body.removeChild(ta);
  if (typeof window !== 'undefined' && window.getSelection) window.getSelection().removeAllRanges();
  return done;
}
function showCopyBox(str, title) {
  const old = document.getElementById('copyBox');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'copyBox';
  box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(8,10,24,0.98);display:flex;flex-direction:column;padding:24px 18px;gap:12px;font-family:"PingFang SC",sans-serif;color:#f3e6c8;';
  const h = document.createElement('div');
  h.textContent = title || '试玩记录';
  h.style.cssText = 'font-size:20px;font-weight:bold;text-align:center;';
  const tip = document.createElement('div');
  tip.textContent = '点下面的「复制」；还是不行，就长按框里的字 → 全选 → 拷贝，粘到微信发回来。';
  tip.style.cssText = 'font-size:14px;line-height:1.5;color:#cfc3a6;';
  const ta = document.createElement('textarea');
  ta.id = 'copyBoxText';
  ta.value = str;
  ta.readOnly = true;
  ta.style.cssText = 'flex:1;width:100%;box-sizing:border-box;font-size:12px;border-radius:10px;padding:10px;background:#141a33;color:#e8e2d0;border:1px solid #c99a4a;';
  ta.addEventListener('focus', () => ta.select());
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px;';
  const mk = (label, bg, fg) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'flex:1;height:52px;font-size:18px;font-weight:bold;border:none;border-radius:12px;background:' + bg + ';color:' + fg + ';'; return b; };
  const copyBtn = mk('复制', '#d4a64a', '#1b1408'), closeBtn = mk('关闭', '#3a3550', '#f3e6c8');
  copyBtn.id = 'copyBoxCopy';
  copyBtn.addEventListener('click', () => {
    const done = () => { copyBtn.textContent = '已复制 ✓ 粘到微信发回来'; };
    if (legacyCopy(str)) return done();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(str).then(done, () => { ta.focus(); ta.select(); copyBtn.textContent = '已全选，请长按 → 拷贝'; });
    else { ta.focus(); ta.select(); copyBtn.textContent = '已全选，请长按 → 拷贝'; }
  });
  closeBtn.addEventListener('click', () => box.remove());
  row.appendChild(copyBtn); row.appendChild(closeBtn);
  box.appendChild(h); box.appendChild(tip); box.appendChild(ta); box.appendChild(row);
  document.body.appendChild(box);
}
// 复制不了时的后路：一段一段放进微信的输入弹窗（每段 1000 字），玩家长按全选拷贝、粘到微信，再点「下一段」
function modalChunks(str, title, done) {
  const CH = 1000, n = Math.max(1, Math.ceil(str.length / CH));
  const show = (k) => {
    if (k >= n) { done && done(); return; }
    wx.showModal({ title: (title || '试玩记录') + (n > 1 ? ' 第 ' + (k + 1) + '/' + n + ' 段' : ''), content: str.slice(k * CH, (k + 1) * CH), editable: true, placeholderText: '', confirmText: k < n - 1 ? '下一段' : '好了', cancelText: '关闭',
      success: (r) => { if (r.confirm) show(k + 1); else done && done(); }, fail: () => done && done() });
  };
  show(0);
}
function copyText(str, ok, title) {
  const cb = (v, why) => ok && ok(v, why);
  try {
    if (isWx && !(ok && ok._p)) { const ok2 = (v, why) => cb(v, why); ok2._p = true; return withPrivacy(() => copyText(str, ok2, title), () => copyText(str, ok2, title)); }
    if (isWx) {
      // 0.9.15：微信 2023-09 起剪贴板是「隐私接口」，后台没在《用户隐私保护指引》里声明「剪贴板」就会失败（errno 112）。
      // 失败了不只说「失败」：把原因带回去；再把记录分段放进微信自己的输入弹窗，长按「全选 → 拷贝」照样拿得走（系统输入框的复制不走这个接口）
      wx.setClipboardData({ data: str, success: () => cb(true), fail: (e) => { const msg = (e && (e.errMsg || e.errno)) || ''; if (wx.showModal) modalChunks(str, title, () => cb('modal', msg)); else cb(false, msg); } });
      return;
    }
    if (legacyCopy(str)) return cb(true);
    const box = () => { showCopyBox(str, title); cb('box'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(str).then(() => cb(true), box);
    else box();
  } catch (e) {
    try { showCopyBox(str, title); cb('box'); } catch (e2) { cb(false); }
  }
}
// 把一张画好的图「发送给朋友」（0.9.17：试玩记录画成方格图发给 Cc，见 js/logimg.js）
// 微信：画布 → 临时 png → wx.showShareImageMenu（弹出「发送给朋友 / 收藏 / 保存」）。cb(true) 弹出来了，cb(false, 原因) 没弹出来
// 网页：盖一层，上面是这张图，长按图片就能发送 / 保存
// 0.9.19：微信的隐私接口（剪贴板、相册）先走一遍官方的「同意隐私」弹窗；后台《用户隐私保护指引》里声明了才放行（没声明会报 no privacy api permission）
function withPrivacy(fn, fail) {
  try {
    if (isWx && typeof wx.requirePrivacyAuthorize === 'function') { wx.requirePrivacyAuthorize({ success: () => fn(), fail: (e) => fail && fail((e && e.errMsg) || '没同意隐私') }); return; }
  } catch (e) { /* 老版本微信没有这个接口：直接用 */ }
  fn();
}
function openPrivacy() { try { if (isWx && wx.openPrivacyContract) wx.openPrivacyContract({}); } catch (e) { /* */ } }
function shareImage(canvas, cb) {
  const done = (v, why) => cb && cb(v, why);
  try {
    if (isWx) {
      if (!cb || !cb._p) { const cb2 = (v, why) => done(v, why); cb2._p = true; return withPrivacy(() => shareImage(canvas, cb2), (why) => done(false, why)); }
      if (typeof wx.showShareImageMenu !== 'function') return done(false, '微信版本太老，没有发图功能');
      canvas.toTempFilePath({
        x: 0, y: 0, width: canvas.width, height: canvas.height, destWidth: canvas.width, destHeight: canvas.height, fileType: 'png',
        success: (r) => wx.showShareImageMenu({ path: r.tempFilePath, success: () => done(true), fail: (e) => done(false, (e && e.errMsg) || '取消了') }),
        fail: (e) => done(false, '图没存下来：' + ((e && e.errMsg) || '')),
      });
      return;
    }
    const old = document.getElementById('shareImgBox');
    if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'shareImgBox';
    box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(8,10,24,0.97);display:flex;flex-direction:column;align-items:center;padding:16px;gap:10px;overflow:auto;font-family:"PingFang SC",sans-serif;color:#f3e6c8;';
    const tip = document.createElement('div');
    tip.textContent = '长按下面这张图 → 发送给朋友（发给 Cc）或保存到相册再发';
    tip.style.cssText = 'font-size:15px;line-height:1.5;text-align:center;';
    const img = document.createElement('img');
    img.id = 'shareImg';
    img.src = canvas.toDataURL('image/png');
    img.style.cssText = 'width:100%;max-width:540px;background:#fff;';
    const close = document.createElement('button');
    close.textContent = '关闭';
    close.style.cssText = 'height:48px;width:160px;font-size:18px;border:none;border-radius:12px;background:#3a3550;color:#f3e6c8;flex:none;';
    close.addEventListener('click', () => box.remove());
    box.appendChild(tip); box.appendChild(img); box.appendChild(close);
    document.body.appendChild(box);
    done(true);
  } catch (e) {
    done(false, String((e && e.message) || e));
  }
}
// 让玩家打一句话（试玩「记一下」用）：微信用可输入的弹窗，网页用 prompt。取消或不写 → cb('')
function askText(title, hint, cb) {
  try {
    if (isWx && wx.showModal) { wx.showModal({ title, editable: true, placeholderText: hint, confirmText: '记下', success: (r) => cb(r.confirm ? r.content || '' : null), fail: () => cb('') }); return; }
    if (typeof window !== 'undefined' && window.prompt) { const r = window.prompt(title + '\n' + hint, ''); cb(r === null ? null : r); return; }
  } catch (e) { /* 拿不到输入就当没写 */ }
  cb('');
}
// 全局报错（试玩记录用）：微信 wx.onError，网页 window error
function onError(cb) {
  try {
    if (isWx && wx.onError) { wx.onError((r) => cb((r && r.message) || String(r))); return; }
    if (typeof window !== 'undefined') window.addEventListener('error', (e) => cb(e.message || String(e)));
  } catch (e) { /* 拿不到就不记 */ }
}
// 切到后台 / 回到前台（试玩记录用）：微信 wx.onHide / onShow，网页 visibilitychange
// 切到后台：背景音乐停；回来接着放
(function () {
  const hook = (visible) => { try { if (visible) music.resume(); else music.pause(); } catch (e) { /* */ } };
  try {
    if (isWx) { wx.onHide && wx.onHide(() => hook(false)); wx.onShow && wx.onShow(() => hook(true)); }
    else if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => hook(document.visibilityState === 'visible'));
  } catch (e) { /* */ }
})();
function onVisibility(cb) {
  try {
    if (isWx) { wx.onHide && wx.onHide(() => cb(false)); wx.onShow && wx.onShow(() => cb(true)); return; }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => cb(document.visibilityState === 'visible'));
      window.addEventListener('pagehide', () => cb(false));
    }
  } catch (e) { /* 拿不到就不记 */ }
}
module.exports = { onError, askText, onVisibility, copyText, shareImage, isWx, setup, makeCanvas, loadImage, now, nextFrame, vibrate, showRewardedAd, load, save, exposeForTest, sound, unlockAudio, setMuted, warmSounds, bgm, openPrivacy };
