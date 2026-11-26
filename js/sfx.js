// 音效：全部用代码合成（不用音频文件），微信和浏览器都用 WebAudio 播放。make(name, sr) 返回一串 -1..1 的采样。
// 0.9.18 换成声音会话定下的一整套（../九宫消_声音包装方案_1.0.md 第四、五节；音色照 ../声音试听/试听_1.html 的编钟）：
//   ① 消除一律编钟和弦，第几声由连消数定：五声 5 级（第 k 声 = do re mi sol la 上第 k+2、k+3、k+5 格，第 1 声 mi sol do），第 6 声起「一路扫上去」；
//   ② 放块的「咔嗒」永远同一个音（衬托消除）；③ 一个声音一个意思；④ 越大的事越响、越低、越长；⑤ 有音高的只用 do re mi sol la，和背景音乐合得上。
// 防哑：算出来的采样里有不是数字的，一律写 0（试听_5 踩过：一个 NaN 进回声，全部声音都哑了）。

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
const TAU = 2 * Math.PI;
const sin = (f, t) => Math.sin(TAU * f * t);
const sq = (f, t) => Math.sign(Math.sin(TAU * f * t));
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
// 五声音阶：第 i 格（0 = 中央 do），往上 do re mi sol la 一格格走
const P5 = [0, 2, 4, 7, 9];
const pn = (i) => 60 + 12 * Math.floor(i / 5) + P5[((i % 5) + 5) % 5];
// 编钟：五个不整齐的泛音，各自衰减（照试听_1 的 bell：泛音比 1 / 2.01 / 2.76 / 4.07 / 5.43）
const BELL = [[1, 0.45, 2.2], [2.01, 0.2, 1.4], [2.76, 0.15, 1.0], [4.07, 0.08, 0.55], [5.43, 0.05, 0.35]];
function bell(m, t, vol) {
  if (t < 0) return 0;
  const f = hz(m);
  let v = 0;
  for (const [r, a, d] of BELL) v += a * Math.sin(TAU * f * r * t) * (t < 0.003 ? t / 0.003 : Math.exp((-9.2 * t) / d));
  return v * vol;
}
// 木头：短，高泛音很快没了
function wood(f, t, vol) {
  if (t < 0) return 0;
  return (0.55 * Math.sin(TAU * f * t) * Math.exp((-9.2 * t) / 0.12) + 0.18 * Math.sin(TAU * f * 3.9 * t) * Math.exp((-9.2 * t) / 0.04) + 0.05 * Math.sin(TAU * f * 9.2 * t) * Math.exp((-9.2 * t) / 0.015)) * vol;
}
// 敲击的「嚓」：高频噪声一下
const click = (t, n, vol, d) => (t < 0 ? 0 : n() * env(t, 0.0008, d || 0.006) * vol);
// 一个和弦（几个音同时敲）
const chordAt = (notes, vol) => (t, n) => notes.reduce((a, m) => a + bell(m, t, vol), 0) + click(t, n, 0.12, 0.01);
// 消除第 k 声（k = 0..4）
const clearChord = (k) => chordAt([pn(k + 2), pn(k + 3), pn(k + 5)], 0.42);
// 到顶：一路扫上去（9 个音 45 毫秒一个）+ 落在一个大和弦上
const sweep = (t, n) => { let v = 0; for (let i = 0; i < 9; i++) v += bell(pn(5 + i), t - i * 0.045, 0.2 + i * 0.02); for (const m of [76, 79, 84, 96]) v += bell(m, t - 0.45, 0.32); return v + click(t, n, 0.12, 0.01); };
// 低音大钟「咚——」（只给大事：一下消 5 处以上 / 过关那一手、头目跳）
const dong = (t, n) => bell(36, t, 0.9) + Math.sin(TAU * (48 + 60 * Math.exp(-t * 10)) * t) * env(t, 0.002, 0.45) * 0.6 + n() * env(t, 0.001, 0.03) * 0.25;
// 一串音（每个 step 秒一个）
const run = (notes, step, vol, voice) => (t) => notes.reduce((a, m, i) => a + (voice || bell)(m, t - i * step, vol), 0);
// 过关：编钟敲第一章开头那句的最后一句（往上提一个八度），再「啵、啵、啵」墨怪收进葫芦
const WIN_LINE = [[76, 0], [74, 1], [72, 1.5], [69, 2], [72, 3], [74, 4], [72, 5]]; // E D C A C | D C（一拍 0.19 秒）
const pop = (t, vol) => (t < 0 ? 0 : Math.sin(TAU * (320 + 900 * Math.min(1, t / 0.05)) * t) * env(t, 0.002, 0.035) * vol);

const RECIPES = {
  // —— 放块 ——
  pick: { len: 0.06, f: (t, n) => wood(hz(96), t, 0.5) + click(t, n, 0.15) }, // 拿起：很短很轻的高音「嗒」
  deny: { len: 0.18, f: (t, n) => Math.sin(TAU * (140 - 60 * t) * t) * env(t, 0.004, 0.05) * 0.35 + n() * env(t, 0.002, 0.03) * 0.08 }, // 没放成、弹回托盘：闷「噗」
  place: { len: 0.16, f: (t, n) => wood(hz(81), t, 0.7) + click(t, n, 0.35, 0.004) + wood(hz(81), t - 0.03, 0.35) + click(t - 0.03, n, 0.2, 0.004) }, // 放下：机关「咔嗒」卡进槽，永远同一个音
  deal: { len: 0.28, f: (t, n) => { let v = 0; const k = t / 0.28; v = n() * Math.sin(Math.PI * Math.min(1, k)) * 0.16 * (0.4 + k); return v; } }, // 发新的三块：托盘滑上来，轻「唰」
  // —— 消除：编钟和弦 5 级 + 一路扫上去 + 低音大钟 ——
  clear0: { len: 2.3, f: clearChord(0) },
  clear1: { len: 2.3, f: clearChord(1) },
  clear2: { len: 2.3, f: clearChord(2) },
  clear3: { len: 2.3, f: clearChord(3) },
  clear4: { len: 2.3, f: clearChord(4) },
  sweep: { len: 2.8, f: sweep },
  dong: { len: 2.6, f: dong },
  // —— 墨怪 ——
  pop: { len: 0.12, f: (t) => pop(t, 0.5) }, // 墨怪被吸进葫芦「啵」
  thump: { len: 0.45, f: (t, n) => Math.sin(TAU * (100 - 45 * Math.min(1, t * 6)) * t) * env(t, 0.002, 0.12) * 0.85 + n() * env(t, 0.001, 0.02) * 0.3 + Math.sin(TAU * 150 * t) * env(t - 0.05 < 0 ? 0 : t - 0.05, 0.02, 0.08) * (t > 0.05 ? 0.18 : 0) }, // 头目挨打「嘭」+ 闷哼
  plop: { len: 0.14, f: (t, n) => Math.sin(TAU * (520 - 1800 * Math.min(0.15, t)) * t) * env(t, 0.002, 0.03) * 0.4 + click(t, n, 0.2, 0.005) }, // 下一波，一只只落进格子「啪嗒」
  skitter: { len: 0.22, f: (t, n) => click(t, n, 0.18, 0.004) + click(t - 0.06, n, 0.14, 0.004) + click(t - 0.12, n, 0.12, 0.004) }, // 墨怪要爬：窸窸窣窣小碎步
  crunch: { len: 0.2, f: (t, n) => n() * env(t, 0.001, 0.05) * 0.45 * (1 + 0.5 * sq(60, t)) }, // 啃「咔嚓」
  clank: { len: 0.4, f: (t) => run([88, 93], 0.0, 0.25, (m, tt) => (tt < 0 ? 0 : Math.sin(TAU * hz(m) * tt) * Math.exp(-tt * 9) + 0.4 * Math.sin(TAU * hz(m) * 2.7 * tt) * Math.exp(-tt * 14)))(t) }, // 掉一层甲「当啷」
  // —— 宠物 ——
  chirp: { len: 0.28, f: (t) => { const s = (tt) => (tt < 0 || tt > 0.09 ? 0 : Math.sin(TAU * (2600 + 1400 * Math.sin(Math.PI * tt / 0.09)) * tt) * Math.sin(Math.PI * tt / 0.09) * 0.32); return s(t) + s(t - 0.13); } }, // 铜雀「啾啾」
  peck: { len: 0.3, f: (t, n) => wood(hz(91), t, 0.5) + click(t, n, 0.2) + wood(hz(91), t - 0.08, 0.45) + click(t - 0.08, n, 0.18) + wood(hz(91), t - 0.16, 0.4) + click(t - 0.16, n, 0.16) }, // 啄「笃笃笃」
  shing: { len: 1.0, f: (t, n) => (Math.sin(TAU * 2093 * t) * 0.3 + Math.sin(TAU * 3142 * t) * 0.18 + Math.sin(TAU * 4710 * t) * 0.1) * env(t, 0.002, 0.35) + n() * env(t, 0.001, 0.02) * 0.2 }, // 克住墨怪：金光「锵——」
  lvup: { len: 1.6, f: run([pn(7), pn(8), pn(9), pn(10), pn(12)], 0.07, 0.3) }, // 宠物升级：编钟往上扫一小段
  // —— 局外 ——
  tap: { len: 0.05, f: (t, n) => wood(hz(88), t, 0.45) + click(t, n, 0.1) }, // 点按钮：木头「嗒」
  select: { len: 0.07, f: (t, n) => wood(hz(91), t, 0.4) + click(t, n, 0.08) },
  win: { len: 3.0, f: (t, n) => WIN_LINE.reduce((a, [m, b]) => a + bell(m, t - b * 0.19, 0.34), 0) + bell(60, t - 5 * 0.19, 0.3) + pop(t - 1.6, 0.4) + pop(t - 1.8, 0.4) + pop(t - 2.0, 0.45) + click(t, n, 0.1, 0.01) },
  lose: { len: 1.2, f: (t) => (t < 0.45 ? Math.sin(TAU * hz(67) * t) * env(t, 0.03, 0.25) : Math.sin(TAU * hz(64) * (t - 0.45)) * env(t - 0.45, 0.03, 0.35)) * 0.3 }, // 输了：两个往下走的软音
  ding: { len: 1.4, f: (t) => bell(pn(15), t, 0.35) }, // 放得好：一声很亮的高音钟「叮——」
  // —— 老名字（别的地方还在叫）——
  coin: { len: 0.6, f: (t) => bell(pn(12), t, 0.3) },
  lit: { len: 1.6, f: run([pn(7), pn(8), pn(9), pn(10), pn(12)], 0.07, 0.3) },
  tick: { len: 0.05, f: (t) => sin(1000, t) * env(t, 0.002, 0.02) * 0.35 },
  bolt: { len: 0.3, f: (t, n) => n() * env(t, 0.001, 0.04) * 0.5 + sin(400 - 900 * t, t) * env(t, 0.002, 0.08) * 0.3 },
};
// 老名字 → 新声音（line / box / combo2–4 / five 不再分档，按连消挑和弦；没改到的地方也不会哑）
const ALIAS = { line: 'clear0', box: 'clear1', combo2: 'clear1', combo3: 'clear2', combo4: 'clear3', five: 'sweep' };
// chain1..chain15：五声往上一个一个的单音编钟（喂丹一颗比一颗高、星星一颗颗蹦）
function recipeOf(name) {
  if (RECIPES[name]) return RECIPES[name];
  if (ALIAS[name]) return RECIPES[ALIAS[name]];
  const m = /^chain(\d+)$/.exec(name) || /^feed(\d+)$/.exec(name);
  if (m) { const k = +m[1]; return { len: 1.3, f: (t) => bell(pn(4 + k), t, 0.36) }; }
  return null;
}

function make(name, sr) {
  const r = recipeOf(name);
  if (!r) return null;
  const n = Math.floor(r.len * sr);
  const out = new Float32Array(n);
  const rnd = noise(name.length * 7919 + 13);
  let peak = 0;
  for (let i = 0; i < n; i++) { const v = r.f(i / sr, rnd); out[i] = Number.isFinite(v) ? v : 0; peak = Math.max(peak, Math.abs(out[i])); }
  if (peak > 0.98) { const k = 0.98 / peak; for (let i = 0; i < n; i++) out[i] *= k; } // 几个音叠起来超过 1：整体压一压，不削波
  return out;
}

module.exports = { make, NAMES: Object.keys(RECIPES), pn };
