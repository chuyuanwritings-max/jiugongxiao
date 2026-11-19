// 音效：全部用代码合成（不用音频文件），微信和浏览器都用 WebAudio 播放。
// 以后换成正式音效，只要换这里。make(name, sr) 返回一串 -1..1 的采样。
// 大事件比小事件响、长、低音多（爽感分级）。

function env(t, a, d) {
  return t < a ? t / a : Math.exp(-(t - a) / d);
}
function noise(seed) {
  let s = seed || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
}
const sin = (f, t) => Math.sin(2 * Math.PI * f * t);
const sq = (f, t) => Math.sign(Math.sin(2 * Math.PI * f * t));
// 一串音：notes 每个 step 秒
function arp(notes, step, decay, wave) {
  return (t) => {
    const i = Math.min(notes.length - 1, Math.floor(t / step));
    const k = t - i * step;
    return (wave || sin)(notes[i], t) * env(k, 0.003, decay);
  };
}

const RECIPES = {
  // 拿起块：轻「嗒」
  pick: { len: 0.06, f: (t, n) => n() * env(t, 0.001, 0.008) * 0.3 + sin(1200, t) * env(t, 0.001, 0.015) * 0.2 },
  // 放下：木头落位
  place: { len: 0.14, f: (t, n) => sin(180 - 300 * t, t) * env(t, 0.002, 0.03) * 0.8 + n() * env(t, 0.001, 0.01) * 0.4 },
  // 放不下：弹回去
  deny: { len: 0.16, f: (t) => sq(150, t) * env(t, 0.005, 0.05) * 0.18 },
  // 消一条：齿轮咔啦 + 蒸汽嘶
  line: { len: 0.35, f: (t, n) => (sq(90 + (Math.floor(t * 60) % 2) * 40, t) * env(t, 0.002, 0.05) * 0.25 + n() * env(t, 0.01, 0.12) * 0.25 + sin(660, t) * env(t, 0.003, 0.08) * 0.25) },
  // 消一宫：上扬
  box: { len: 0.5, f: (t, n) => arp([523, 784, 1047], 0.07, 0.12)(t) * 0.45 + n() * env(t, 0.01, 0.15) * 0.2 + sin(110, t) * env(t, 0.002, 0.1) * 0.4 },
  // 连击：一串越来越高（combo2..combo5 由画面层按级别挑）
  combo2: { len: 0.4, f: arp([659, 880, 1175], 0.06, 0.09) },
  combo3: { len: 0.45, f: arp([784, 1047, 1319, 1568], 0.055, 0.09) },
  combo4: { len: 0.5, f: arp([880, 1175, 1568, 1760, 2093], 0.05, 0.1) },
  // 中宫 ×5：重鼓 + 和弦
  five: { len: 1.0, f: (t, n) => sin(60 + 40 * Math.exp(-t * 8), t) * env(t, 0.002, 0.25) * 0.9 + n() * env(t, 0.001, 0.05) * 0.4 + (sin(523, t) + sin(659, t) + sin(784, t)) * env(t, 0.02, 0.35) * 0.15 },
  // 城区点亮：叮
  lit: { len: 0.4, f: (t) => (sin(1568, t) + sin(2093, t) * 0.5) * env(t, 0.002, 0.15) * 0.3 },
  // 连弩齐射
  bolt: { len: 0.3, f: (t, n) => n() * env(t, 0.001, 0.04) * 0.5 + sin(400 - 900 * t, t) * env(t, 0.002, 0.08) * 0.3 },
  // 金币
  coin: { len: 0.22, f: (t) => sq(t < 0.07 ? 1320 : 1760, t) * env(t < 0.07 ? t : t - 0.07, 0.002, 0.06) * 0.22 },
  // 最后 10 秒：嘀
  tick: { len: 0.05, f: (t) => sin(1000, t) * env(t, 0.002, 0.02) * 0.35 },
  // 整幅画拼完
  win: { len: 1.2, f: (t) => arp([523, 659, 784, 1047, 1319, 1568], 0.1, 0.3)(t) * 0.45 + sin(130, t) * env(t, 0.01, 0.4) * 0.3 },
  // 输
  lose: { len: 0.8, f: (t) => sin(440 - 240 * t, t) * env(t, 0.01, 0.3) * 0.4 },
  // 按钮
  tap: { len: 0.05, f: (t) => sin(900, t) * env(t, 0.001, 0.02) * 0.3 },
};

function make(name, sr) {
  const r = RECIPES[name];
  if (!r) return null;
  const n = Math.floor(r.len * sr);
  const out = new Float32Array(n);
  const rnd = noise(name.length * 7919);
  for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, r.f(i / sr, rnd)));
  return out;
}

module.exports = { make, NAMES: Object.keys(RECIPES) };
