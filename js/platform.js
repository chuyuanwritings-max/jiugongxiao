// 平台层：只有这个文件知道自己跑在微信里还是浏览器里。
// 微信小游戏：wx.createCanvas / wx.onTouchStart / wx.createRewardedVideoAd
// 浏览器预览：一张 <canvas id="game">，用 pointer 事件（只用一种事件，免得一次点击被算两次）
const isWx = typeof wx !== 'undefined' && wx && typeof wx.createCanvas === 'function';

function setup(onTouch) {
  let canvas, width, height, dpr;
  if (isWx) {
    canvas = wx.createCanvas();
    const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
    width = info.windowWidth;
    height = info.windowHeight;
    dpr = Math.min(2, info.pixelRatio || 2); // 0.8.4：最多按 2 倍画（3 倍屏多画一倍多的像素，手机上看不出差别，却会卡）
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const send = (type) => (e) => {
      const list = e.changedTouches || [];
      for (let i = 0; i < list.length; i++) {
        onTouch(type, list[i].identifier, list[i].clientX, list[i].clientY);
      }
    };
    wx.onTouchStart((e) => {
      unlockAudio();
      send('down')(e);
    });
    wx.onTouchMove(send('move'));
    wx.onTouchEnd(send('up'));
    wx.onTouchCancel(send('up'));
  } else {
    canvas = document.getElementById('game');
    // 电脑上预览时装成一部手机大小；手机浏览器里就占满屏
    const phone = window.innerWidth > 520;
    width = phone ? 390 : window.innerWidth;
    height = phone ? Math.min(844, window.innerHeight - 20) : window.innerHeight;
    // 游戏修改器切机型时，指定装成哪部手机
    const dev = window.__DEVICE;
    if (dev) { width = dev.w; height = dev.h; }
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
    canvas.addEventListener('pointercancel', up);
  }
  return { canvas, ctx: canvas.getContext('2d'), width, height, dpr };
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
function unlockAudio() {
  const a = audioCtx();
  if (a && a.state === 'suspended' && a.resume) a.resume();
}
function sound(name, volume) {
  if (muted) return;
  const a = audioCtx();
  if (!a) return;
  try {
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
}

// 存档：微信用 wx.setStorageSync，浏览器用 localStorage
function load(key) {
  try {
    const raw = isWx ? wx.getStorageSync(key) : window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function save(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (isWx) wx.setStorageSync(key, raw);
    else window.localStorage.setItem(key, raw);
  } catch (e) {
    // 存不了就算了：原型里不影响玩
  }
}

function exposeForTest(name, value) {
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
function copyText(str, ok, title) {
  const cb = (v) => ok && ok(v);
  try {
    if (isWx) { wx.setClipboardData({ data: str, success: () => cb(true), fail: () => cb(false) }); return; }
    if (legacyCopy(str)) return cb(true);
    const box = () => { showCopyBox(str, title); cb('box'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(str).then(() => cb(true), box);
    else box();
  } catch (e) {
    try { showCopyBox(str, title); cb('box'); } catch (e2) { cb(false); }
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
function onVisibility(cb) {
  try {
    if (isWx) { wx.onHide && wx.onHide(() => cb(false)); wx.onShow && wx.onShow(() => cb(true)); return; }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => cb(document.visibilityState === 'visible'));
      window.addEventListener('pagehide', () => cb(false));
    }
  } catch (e) { /* 拿不到就不记 */ }
}
module.exports = { onError, askText, onVisibility, copyText, isWx, setup, makeCanvas, loadImage, now, nextFrame, vibrate, showRewardedAd, load, save, exposeForTest, sound, unlockAudio, setMuted };
