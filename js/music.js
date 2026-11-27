// 背景音乐 + 关与关之间的过场声（0.9.18，声音会话交接：../九宫消_声音包装方案_1.0.md 第五节；记谱、伴奏、乐器全是从 ../声音试听/试听_6.html、试听_7.html 搬过来的）
// 全部用 WebAudio 实时合成（编钟、竹笛、埙、鼓、古琴），只用 do re mi sol la，和消除的编钟永远合得上。
// 同一章分三种紧张程度：0 普通 / 1 难关（稍快、多一层鼓）/ 2 头目（最紧张）；打完头目收一句安静尾声。
// 微信的 WebAudio 少几样东西（回声、颤音连线）时就不用那几样，不报错；每个音单独 try，一个音出错不影响别的。
// 防哑：所有算出来的采样（古琴、噪声）存进去之前查一遍不是数字就写 0（试听_5 踩过：一个 NaN 进回声，全部声音都哑了）。
let ctx = null, out = null, rev = null, bgmBus = null, bgmVol = 0.45, muted = false;
const toBgm = true;
function init(a, destination) {
  if (ctx === a) return true;
  ctx = a; out = null; rev = null; bgmBus = null; noiseBuf = null;
  try {
    out = a.createGain(); out.gain.value = 0.75; out.connect(destination || a.destination);
    bgmBus = a.createGain(); bgmBus.gain.value = muted ? 0 : bgmVol; bgmBus.connect(out);
    if (typeof a.createConvolver === 'function') {
      const len = Math.floor(a.sampleRate * 2.2), ir = a.createBuffer(2, len, a.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      const conv = a.createConvolver(); conv.buffer = ir; rev = a.createGain(); rev.gain.value = 0.22; rev.connect(conv); conv.connect(bgmBus);
    }
  } catch (e) { rev = null; }
  return !!out;
}
const bus = () => bgmBus;
function dest(wet) { const g = ctx.createGain(); g.connect(bus()); if (wet && rev) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(rev); } return g; }
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const now = () => ctx.currentTime;
function env(g, t, a, peak, hold, rel) { peak = Number.isFinite(peak) && peak > 0 ? peak : 0.0001; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); if (hold) g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + (hold || 0) + rel); }
function osc(t, f, type, dur, to) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(Number.isFinite(f) ? f : 440, t); o.connect(to); o.start(t); o.stop(t + dur); return o; }
let noiseBuf = null;
function noise(t, dur, to) { if (!noiseBuf) { const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; } const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.connect(to); s.start(t, Math.random()); s.stop(t + dur); return s; }
const clean = (d) => { for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) d[i] = 0; return d; };

// ---------- 乐器（照搬试听_6）----------
//INST
const INST = {
  orig(t, m, vol) { const g = dest(0.1); g.gain.value = 0; [[1, 0.25, 1.2], [2, 0.08, 0.5], [3, 0.03, 0.3]].forEach(([r, a, d]) => { const gg = ctx.createGain(); env(gg, t, 0.004, a * vol * 2, 0, d); gg.connect(bus()); osc(t, hz(m) * r, 'sine', d + 0.1, gg); }); },
  bell(t, m, vol) { // 编钟：五个不整齐的泛音 + 敲击声
    const g = dest(0.35); g.gain.value = vol;
    [[1, 0.45, 2.2], [2.01, 0.2, 1.4], [2.76, 0.15, 1.0], [4.07, 0.08, 0.55], [5.43, 0.05, 0.35]].forEach(([r, a, d]) => { const gg = ctx.createGain(); env(gg, t, 0.003, a, 0, d); gg.connect(g); osc(t, hz(m) * r, 'sine', d + 0.1, gg); });
    const ng = ctx.createGain(), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500; env(ng, t, 0.001, 0.08, 0, 0.03); noise(t, 0.06, hp); hp.connect(ng); ng.connect(g);
  },
  flute(t, m, vol, len) { // 竹笛：基音 + 少量泛音，慢慢起，颤音，带气声
    const f = hz(m), g = dest(0.3); env(g, t, 0.06, vol, len * 0.6, 0.18);
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + 0.25); vib.connect(vg); vib.start(t); vib.stop(t + len + 0.4);
    [[1, 0.55, 'sine'], [2, 0.12, 'sine'], [3, 0.05, 'sine']].forEach(([r, a, ty]) => { const gg = ctx.createGain(); gg.gain.value = a; gg.connect(g); const o = osc(t, f * r, ty, len + 0.4, gg); try { vg.connect(o.frequency); } catch (e) { /* 微信里连不上颤音就不颤 */ } });
    const bp = ctx.createBiquadFilter(), bg = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2; bg.gain.value = 0.16; noise(t, len + 0.3, bp); bp.connect(bg); bg.connect(g);
  },
  xun(t, m, vol, len) { // 埙：几乎纯的低音，闷，起得更慢，气声更重
    const f = hz(m), g = dest(0.35); env(g, t, 0.09, vol, len * 0.6, 0.25);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 2.5; lp.connect(g);
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 4.2; vg.gain.value = f * 0.007; vib.connect(vg); vib.start(t); vib.stop(t + len + 0.5);
    [[1, 0.7, 'sine'], [2, 0.08, 'triangle']].forEach(([r, a, ty]) => { const gg = ctx.createGain(); gg.gain.value = a; gg.connect(lp); const o = osc(t, f * r, ty, len + 0.5, gg); try { vg.connect(o.frequency); } catch (e) { /* 微信里连不上颤音就不颤 */ } });
    const bp = ctx.createBiquadFilter(), bg = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = f * 1.5; bp.Q.value = 1.2; bg.gain.value = 0.28; noise(t, len + 0.4, bp); bp.connect(bg); bg.connect(g);
  },
  drum(t, m, vol) { // 调了音的鼓：音高往下掉的「咚」+ 鼓皮的沙沙声
    const f = hz(m), g = dest(0.25); g.gain.value = vol;
    const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04); env(og, t, 0.002, 0.9, 0, 0.35); o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.5);
    const bp = ctx.createBiquadFilter(), ng = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = f * 3; bp.Q.value = 0.8; env(ng, t, 0.001, 0.35, 0, 0.06); noise(t, 0.12, bp); bp.connect(ng); ng.connect(g);
  },
  bigdrum(t, vol) { const g = dest(0.3); g.gain.value = vol; const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12); env(og, t, 0.002, 1, 0, 0.6); o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.8);
    const lp = ctx.createBiquadFilter(), ng = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 900; env(ng, t, 0.001, 0.5, 0, 0.08); noise(t, 0.15, lp); lp.connect(ng); ng.connect(g); },
  qin(t, m, vol) { // 古琴：拨弦（弦一样慢慢停下来的算法）+ 一点往上的滑音
    const f = hz(m), sr = ctx.sampleRate, n = Math.floor(sr * 3), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), N = Math.round(sr / f);
    for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
    for (let i = N + 1; i < n; i++) d[i] = 0.4985 * (d[i - N] + d[i - N - 1]); // 从 N+1 起：d[-1] 不存在，会算出 NaN，让整个声音（连回声）全哑
    for (let i = 0; i < N; i++) d[i] *= i / N;
    clean(d);
    const s = ctx.createBufferSource(), g = dest(0.3), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 6; g.gain.value = vol * 1.4;
    s.buffer = b; s.playbackRate.setValueAtTime(0.97, t); s.playbackRate.linearRampToValueAtTime(1, t + 0.12); s.connect(lp); lp.connect(g); s.start(t);
    const body = ctx.createGain(); env(body, t, 0.003, vol * 0.35, 0, 1.6); body.connect(g); osc(t, f, 'sine', 1.8, body);
  },
};


//RAIN
function rain(t, dur) { const lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = dest(0); lp.type = 'lowpass'; lp.frequency.value = 5000; hp.type = 'highpass'; hp.frequency.value = 700; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.4); g.gain.setValueAtTime(0.09, t + dur - 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3); noise(t, dur + 0.4, lp); lp.connect(hp); hp.connect(g);
  for (let i = 0; i < dur * 6; i++) { const tt = t + Math.random() * dur, dg = dest(0.2); env(dg, tt, 0.001, 0.05 + Math.random() * 0.05, 0, 0.03); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500 + Math.random() * 3000; noise(tt, 0.05, bp); bp.connect(dg); } }
//SONGS
const PC = { C: 0, D: 2, E: 4, G: 7, A: 9 };
function parse(str) {
  const out = []; let beat = 0, bar = 0, barBeat = 0;
  str.trim().split(/\s+/).forEach((tok) => {
    if (tok === '|') { if (Math.abs(barBeat - 4) > 1e-6) console.warn('小节不满 4 拍', bar, barBeat, str.slice(0, 30)); bar++; barBeat = 0; return; }
    const [n, d] = tok.split(':'); const len = parseFloat(d);
    if (n !== '-') out.push({ b: beat, len, m: (parseInt(n.slice(-1)) + 1) * 12 + PC[n[0]] });
    beat += len; barBeat += len;
  });
  return { notes: out, beats: beat };
}
const P5 = [0, 2, 4, 7, 9];
function sh(m, k) { const pc = ((m % 12) + 12) % 12, idx = P5.indexOf(pc), i = Math.floor(m / 12) * 5 + idx + k; return Math.floor(i / 5) * 12 + P5[((i % 5) + 5) % 5]; }
const tones = (r) => [r, sh(r, 2), sh(r, 3), r + 12]; // 根音 + 五声里的两个音 + 高八度，永远不出五个音
const N = (s) => s.split(' ').map((x) => (parseInt(x.slice(-1)) + 1) * 12 + PC[x[0]]);

const SONGS = {
  1: { name: '第一章 金 · 清晨的工坊', mood: '安静、好奇、有盼头', bpm: 66, swing: 0,
    form: ['A', 'A', 'B', 'A'], formName: ['编钟独奏', '轻轻加进伴奏', '往上走（这首最响）', '回到开头，收住'],
    A: 'E4:1 G4:1 A4:1.5 G4:.5 | E4:1 D4:1 C4:2 | E4:1 G4:1 C5:1.5 D5:.5 | A4:3 -:1 | G4:.5 C5:.5 D5:1 A4:2 | G4:1 E4:1 D4:2 | E4:1 D4:.5 C4:.5 A3:1 C4:1 | D4:1 C4:3',
    B: 'A4:1 C5:1 D5:1 E5:1 | D5:1.5 C5:.5 A4:2 | G4:1 A4:1 C5:1 D5:.5 E5:.5 | G5:3 -:1 | E5:1 D5:1 C5:1 A4:1 | G4:.5 C5:.5 D5:1 A4:2 | G4:1 E4:1 G4:1 A4:1 | G4:4',
    bass: { A: N('C3 C3 C3 A2 G2 G2 A2 C3'), B: N('A2 A2 G2 G2 C3 G2 E2 G2') } },
  2: { name: '第二章 土 · 正午的梯田', mood: '开阔、暖、稳稳往前', bpm: 84, swing: 0,
    form: ['A', 'A', 'B', 'A'], formName: ['埙 + 农家鼓', '加进古琴底音', '往高处走', '回到开头'],
    A: 'G4:1 A4:1 C5:1 A4:1 | G4:1 E4:1 D4:2 | E4:1 G4:1 A4:1 C5:1 | D5:3 -:1 | D5:1 C5:.5 A4:.5 G4:1 A4:1 | D4:.5 G4:.5 A4:1 E4:2 | G4:1 E4:1 D4:1 E4:1 | G4:4',
    B: 'C5:1 D5:1 E5:2 | D5:1 C5:1 A4:2 | C5:1 A4:1 G4:1 E4:1 | D4:3 -:1 | E4:1 G4:1 A4:1 C5:1 | D5:1.5 C5:.5 A4:2 | G4:.5 A4:.5 C5:1 A4:1 E4:1 | G4:4',
    bass: { A: N('G2 C3 C3 D3 G2 D3 C3 G2'), B: N('C3 A2 C3 D3 C3 D3 C3 G2') } },
  3: { name: '第三章 木 · 下午的竹林', mood: '最欢快、最亮', bpm: 120, swing: 0.16,
    form: ['A', 'A', 'B', 'A', 'B', 'A'], formName: ['竹笛 + 木鱼', '加进古琴', '往高处蹦', '回来', '再蹦一次', '回来'],
    A: 'G5:.5 A5:.5 G5:.5 E5:.5 D5:.5 E5:.5 G5:1 | A5:.5 G5:.5 E5:.5 D5:.5 C5:2 | D5:.5 E5:.5 G5:.5 A5:.5 C6:1 A5:1 | G5:1.5 E5:.5 G5:2 | G5:.5 C6:.5 D6:1 A5:2 | G5:.5 E5:.5 D5:.5 E5:.5 G5:1 E5:1 | D5:.5 C5:.5 D5:.5 E5:.5 G5:.5 E5:.5 D5:1 | C5:3 -:1',
    B: 'A5:1 G5:.5 A5:.5 C6:1 A5:1 | G5:.5 E5:.5 G5:.5 A5:.5 G5:2 | E5:1 D5:.5 E5:.5 G5:1 E5:1 | D5:.5 C5:.5 A4:.5 C5:.5 D5:2 | E5:.5 G5:.5 A5:.5 C6:.5 D6:1 E6:1 | D6:.5 C6:.5 A5:.5 G5:.5 A5:2 | G5:.5 A5:.5 G5:.5 E5:.5 D5:.5 E5:.5 D5:.5 C5:.5 | D5:1 E5:1 G5:2',
    bass: { A: N('C3 A2 C3 G2 G2 C3 G2 C3'), B: N('A2 C3 A2 G2 A2 A2 G2 G2') } },
  4: { name: '第四章 火 · 夜里的熔炉', mood: '暗、害怕、一路逼近，最后最响', bpm: 96, swing: 0,
    form: ['A', 'A', 'B', 'B'], formName: ['低鼓敲出旋律', '心跳一样的底音进来', '往上逼', '最响'],
    A: 'A3:.5 A3:.5 C4:.5 A3:.5 D4:1 C4:1 | A3:.5 A3:.5 G3:.5 A3:.5 E3:2 | A3:.5 A3:.5 C4:.5 D4:.5 E4:1 D4:1 | C4:.5 D4:.5 C4:.5 A3:.5 G3:2 | E3:.5 A3:.5 C4:1 G3:2 | A3:.5 G3:.5 E3:.5 G3:.5 A3:2 | C4:.5 D4:.5 E4:.5 G4:.5 E4:1 D4:1 | E4:2 A3:2',
    B: 'E4:.5 E4:.5 G4:.5 E4:.5 A4:1 G4:1 | E4:.5 D4:.5 E4:.5 G4:.5 A4:2 | C5:.5 A4:.5 G4:.5 A4:.5 E4:1 D4:1 | E4:.5 G4:.5 A4:.5 C5:.5 D5:2 | E4:.5 A4:.5 C5:1 G4:2 | A4:.5 G4:.5 E4:.5 D4:.5 E4:2 | A4:.5 C5:.5 D5:.5 E5:.5 D5:.5 C5:.5 A4:.5 G4:.5 | A4:4',
    bass: { A: N('A2 A2 A2 G2 E2 A2 C3 A2'), B: N('C3 A2 A2 G2 E2 A2 D3 A2') } },
  5: { name: '第五章 水 · 深夜暴雨的河', mood: '最低谷：冷、空、孤单，找不到家', bpm: 54, swing: 0,
    form: ['A', 'A', 'B'], formName: ['几声古琴泛音 + 雨', '泛音多了一层', '最后涌起来'],
    A: 'D5:3 -:1 | E5:1 D5:1 A4:2 | -:1 C5:1 D5:2 | A4:4 | D5:.5 G5:.5 A5:1 E5:2 | D5:4 | -:2 C5:1 A4:1 | E5:4',
    B: 'A4:1 C5:1 D5:1 E5:1 | G5:2 E5:2 | D5:1 E5:1 G5:1 A5:1 | C6:3 -:1 | A5:1 G5:1 E5:1 D5:1 | D5:.5 G5:.5 A5:1 E5:2 | D5:2 C5:2 | A4:4',
    bass: { A: N('D2 D2 A1 A1 G1 G1 A1 A1'), B: N('A1 C2 D2 E2 A1 G1 D2 A1') } },
  6: { name: '第六章 五行合一 · 天亮的城心', mood: '最热、最亮，五样都回来，回到第一章的家', bpm: 76, swing: 0,
    form: ['I', 'A', 'A', 'B', 'B', 'A'], formName: ['编钟敲出小记号（几乎无声起）', '竹笛吹起第一章那段', '埙、古琴、编钟一件件加进来', '五件一起 + 鼓（最高潮）', '最高潮再来一次', '安静下来，回到家'],
    I: 'G4:.5 C5:.5 D5:1 A4:2 | -:4 | G4:.5 C5:.5 D5:1 A4:2 | -:4',
    A: 'E4:1 G4:1 A4:1.5 G4:.5 | E4:1 D4:1 C4:2 | E4:1 G4:1 C5:1.5 D5:.5 | A4:3 -:1 | G4:.5 C5:.5 D5:1 A4:2 | G4:1 E4:1 D4:2 | E4:1 D4:.5 C4:.5 A3:1 C4:1 | D4:1 C4:3',
    B: 'C5:1 D5:1 E5:1 G5:1 | A5:2 G5:1 E5:1 | D5:1 E5:1 G5:1 A5:1 | C6:3 -:1 | G5:.5 C6:.5 D6:1 A5:2 | G5:1 E5:1 D5:1 E5:1 | G5:.5 C6:.5 D6:1 E6:2 | C6:4',
    bass: { I: N('C3 C3 C3 C3'), A: N('C3 C3 C3 A2 G2 G2 A2 C3'), B: N('C3 A2 G2 A2 G2 E2 G2 C3') } },
};

//ACC
function accomp(c, i, sec, bar, r, t, q) {
  const S = SONGS[c];
  if (c === 1) {
    if (i >= 1) INST.bell(t, r - 12, 0.18);
    if (i >= 1) [0, 2].forEach((b, k) => INST.qin(t + b * q, k ? sh(r, 3) : r, 0.22));
    if (sec === 'B') INST.xun(t, r + 12, 0.08, q * 3.8);
  }
  if (c === 2) {
    INST.bigdrum(t, 0.14); INST.bigdrum(t + 2 * q, 0.09);
    if (i >= 1) { INST.drum(t + q, 55, 0.07); INST.drum(t + 3 * q, 55, 0.07); INST.qin(t, r - 12, 0.22); }
    if (sec === 'B') INST.bell(t, r + 12, 0.1);
  }
  if (c === 3) {
    for (let b = 0.5; b < 4; b += 1) INST.drum(t + (b + S.swing) * q, 84, 0.09);
    INST.qin(t, r - 12, 0.3); INST.qin(t + 2 * q, sh(r, 3) - 12, 0.2);
    if (i >= 1) { const tn = tones(r); for (let e = 0; e < 8; e++) if (e % 2) INST.qin(t + (e * 0.5 + S.swing) * q, tn[e % 4], 0.1); }
  }
  if (c === 4) {
    const boost = [0.75, 0.9, 1.05, 1.25][i];
    const beats = i >= 2 ? [0, 1, 2, 3] : [0, 2];
    beats.forEach((b) => INST.bigdrum(t + b * q, (b === 0 ? 0.6 : 0.35) * boost));
    if (i >= 1) for (let e = 0; e < (i >= 3 ? 8 : 4); e++) INST.drum(t + e * (i >= 3 ? 0.5 : 1) * q, r - 12, 0.16 * boost);
    if (i >= 1) INST.xun(t, r - 12, 0.07 * boost, q * 3.9);
    if (bar === 7 && i >= 2) [3, 3.25, 3.5, 3.75].forEach((b, k) => INST.drum(t + b * q, r - 5 + k * 2, 0.25 * boost));
  }
  if (c === 5) {
    if (bar % 2 === 0 && sec === 'A') INST.qin(t, r, 0.28);
    if (sec === 'B') {
      const lift = (bar + 1) / 8;
      for (let e = 0; e < 8; e++) INST.qin(t + e * 0.5 * q, r + 12, 0.08 + 0.32 * lift);
      rumble(t, q * 4, 0.08 + 0.45 * lift);
      if (bar === 3) INST.bigdrum(t, 0.45);
    }
    if (bar === 0) rain(t, q * 32);
  }
  if (c === 6) {
    const full = sec === 'B', loud = i === 4 ? 1.2 : 1;
    if (sec === 'I') { INST.bell(t, 36, 0.2); return; }
    INST.qin(t, r - 12, 0.32 * loud); INST.qin(t + 2 * q, sh(r, 3) - 12, 0.2 * loud);
    if (i >= 2) INST.bell(t, r + 12, 0.14 * loud);
    if (full) { INST.bigdrum(t, 0.55 * loud); INST.bigdrum(t + 2 * q, 0.35 * loud); INST.drum(t + q, 62, 0.14 * loud); INST.drum(t + 3 * q, 62, 0.14 * loud); INST.xun(t, r, 0.12 * loud, q * 3.9); }
    if (i === 5) { /* 最后一段：只剩竹笛和古琴 */ }
  }
}
// 旋律用什么乐器奏
function melody(c, i, sec, n, t, len) {
  if (c === 1) INST.bell(t, n.m - 12, [0.34, 0.3, 0.38, 0.26][i]);
  if (c === 2) INST.xun(t, n.m - 12, 0.3, len);
  if (c === 3) INST.flute(t, n.m, 0.3, Math.min(len, 0.9));
  if (c === 4) INST.drum(t, n.m, [0.45, 0.5, 0.6, 0.72][i]);
  if (c === 5) { harm(t, n.m, sec === 'B' ? 0.5 : (i === 0 ? 0.3 : 0.34)); if (i >= 1) harm(t + 0.02, n.m + 12, 0.12); if (sec === 'B') INST.qin(t, n.m - 12, 0.3); }
  if (c === 6) {
    if (sec === 'I') { INST.bell(t, n.m, 0.36); return; }
    const loud = i === 4 ? 1.2 : 1;
    INST.flute(t, n.m + (sec === 'A' ? 12 : 0), 0.28 * loud, len);
    if (i >= 2 && len >= 1.5 * (60 / SONGS[6].bpm)) INST.xun(t, n.m - 12, 0.18 * loud, len);
    if (sec === 'B' && len >= 60 / SONGS[6].bpm) INST.bell(t, n.m, 0.2 * loud);
  }
}
// 古琴泛音：又高又细、像玻璃，第五章的「冷」
function harm(t, m, vol) {
  const g = dest(0.5); g.gain.value = vol;
  [[1, 0.6, 2.6], [2, 0.12, 1.2], [3, 0.04, 0.6]].forEach(([r, a, d]) => { const gg = ctx.createGain(); env(gg, t, 0.006, a, 0, d); gg.connect(g); osc(t, hz(m) * r, 'sine', d + 0.1, gg); });
  const hp = ctx.createBiquadFilter(), ng = ctx.createGain(); hp.type = 'highpass'; hp.frequency.value = 5000; env(ng, t, 0.001, 0.04, 0, 0.02); noise(t, 0.04, hp); hp.connect(ng); ng.connect(g);
}
// 低处滚上来的闷响（第五章最后涌起来）
function rumble(t, dur, vol) { const lp = ctx.createBiquadFilter(), g = dest(0.2); lp.type = 'lowpass'; lp.frequency.value = 220; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.9); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2); noise(t, dur + 0.3, lp); lp.connect(g); }


//H7
function snare(t, vol) { const g = dest(0.25); g.gain.value = vol; const bp = ctx.createBiquadFilter(), ng = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7; env(ng, t, 0.001, 0.9, 0, 0.12); noise(t, 0.2, bp); bp.connect(ng); ng.connect(g); const bg = ctx.createGain(); env(bg, t, 0.001, 0.5, 0, 0.08); bg.connect(g); osc(t, 190, 'triangle', 0.15, bg); }
function hat(t, vol) { const g = dest(0.1); g.gain.value = vol; const hp = ctx.createBiquadFilter(), ng = ctx.createGain(); hp.type = 'highpass'; hp.frequency.value = 7500; env(ng, t, 0.001, 0.6, 0, 0.03); noise(t, 0.06, hp); hp.connect(ng); ng.connect(g); }
function whoosh(t, dur, vol) { const bp = ctx.createBiquadFilter(), g = dest(0.3); bp.type = 'bandpass'; bp.Q.value = 1.5; bp.frequency.setValueAtTime(200, t); bp.frequency.exponentialRampToValueAtTime(5000, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.85); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.15); noise(t, dur + 0.2, bp); bp.connect(g); }
function bass(t, m, vol, len) { const g = dest(0.05); env(g, t, 0.004, vol, 0, len || 0.25); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(g); osc(t, hz(m), 'triangle', (len || 0.25) + 0.1, lp); osc(t, hz(m) * 2, 'sine', (len || 0.25) + 0.1, lp); }

// ---------- 排程：照试听_6 的 build / fire，多一个紧张程度 ----------
let curC = null, tension = 0, evs = [], loopBeats = 0, ptr = 0, loopN = 0, t0 = 0, timer = null, q = 0.9;
function build(c) {
  const S = SONGS[c]; evs = []; let b0 = 0;
  S.form.forEach((sec, i) => {
    const sc = parse(S[sec]);
    sc.notes.forEach((n) => evs.push({ b: b0 + n.b, kind: 'mel', i, sec, n }));
    const bars = Math.round(sc.beats / 4), bl = S.bass[sec];
    for (let bar = 0; bar < bars; bar++) evs.push({ b: b0 + bar * 4, kind: 'acc', i, sec, bar, r: bl[bar % bl.length] });
    b0 += sc.beats;
  });
  loopBeats = b0; evs.sort((a, b) => a.b - b.b);
}
const safe = (fn) => { try { fn(); } catch (e) { /* 这个音放不出来就算了 */ } };
function fire(c, e, t) {
  const S = SONGS[c];
  if (e.kind === 'mel') { const sw = Math.abs((e.n.b % 1) - 0.5) < 1e-6 ? S.swing * q : 0; safe(() => melody(c, e.i, e.sec, e.n, t + sw, e.n.len * q)); }
  if (e.kind === 'acc') {
    safe(() => accomp(c, e.i, e.sec, e.bar, e.r, t, q));
    // 难关：多一层低鼓（每拍一下）；头目：每拍大鼓 + 反拍小鼓，最紧张
    if (tension >= 1) safe(() => { for (let b = 0; b < 4; b++) INST.drum(t + b * q, e.r - 12, 0.1); });
    if (tension === 2) safe(() => { for (let b = 0; b < 4; b++) { INST.bigdrum(t + b * q, b === 0 ? 0.42 : 0.26); INST.drum(t + (b + 0.5) * q, e.r, 0.08); } });
    // 冲锋关（第 4 档，Cc：「很爽，很激昂，快速的那种音乐」）：一三拍大鼓、二四拍小鼓、八分音符的镲，底下一条跑动的低音，一路往前推
    if (tension === 3) safe(() => {
      for (let b = 0; b < 4; b++) { if (b % 2 === 0) INST.bigdrum(t + b * q, 0.5); else snare(t + b * q, 0.42); hat(t + b * q, 0.32); hat(t + (b + 0.5) * q, 0.2); }
      [0, 1.5, 2, 3, 3.5].forEach((b, k) => bass(t + b * q, (k % 2 ? sh(e.r, 2) : e.r), 0.42, q * 0.45));
    });
  }
}
function tick() {
  if (curC === null || !ctx) return;
  for (let guard = 0; guard < 400; guard++) { const e = evs[ptr], t = t0 + (loopN * loopBeats + e.b) * q; if (t > now() + 0.7) break; if (t > now() - 0.05) fire(curC, e, t); ptr++; if (ptr >= evs.length) { ptr = 0; loopN++; } }
}
// 放第 c 章（1–6）的曲子；tens = 0 普通 / 1 难关 / 2 头目。同一首同一档在放就不动
function play(c, tens) {
  if (!ctx || !SONGS[c]) return;
  if (curC === c && tension === (tens || 0) && timer) return;
  stop(true);
  curC = c; tension = tens || 0; build(c); ptr = 0; loopN = 0;
  q = 60 / (SONGS[c].bpm * (tension === 3 ? 1.75 : tension === 2 ? 1.15 : tension === 1 ? 1.08 : 1));
  t0 = now() + 0.2;
  if (bgmBus) { bgmBus.gain.cancelScheduledValues(now()); bgmBus.gain.setValueAtTime(0.0001, now()); bgmBus.gain.linearRampToValueAtTime(muted ? 0.0001 : bgmVol, now() + 1.2); }
  tick(); timer = setInterval(tick, 120);
}
// 停（fade = 淡出一秒）
function stop(quick) {
  if (timer) clearInterval(timer); timer = null; curC = null;
  if (!quick && bgmBus && ctx) safe(() => { bgmBus.gain.cancelScheduledValues(now()); bgmBus.gain.setValueAtTime(bgmBus.gain.value, now()); bgmBus.gain.linearRampToValueAtTime(0.0001, now() + 1); setTimeout(() => { if (curC === null && bgmBus) bgmBus.gain.value = muted ? 0 : bgmVol; }, 1300); });
}
// 打完头目：音乐停下，编钟轻轻敲这一章开头那句的最后两小节（安静尾声）
function outro(c) {
  stop(false);
  if (!ctx || !SONGS[c]) return;
  const sc = parse(SONGS[c].A), qq = 60 / SONGS[c].bpm, from = sc.beats - 8, t = now() + 1.1;
  sc.notes.filter((n) => n.b >= from).forEach((n) => safe(() => INST.bell(t + (n.b - from) * qq, n.m, 0.22)));
  setTimeout(() => { if (bgmBus && curC === null) bgmBus.gain.value = muted ? 0 : bgmVol; }, 0);
}
// 切后台停、回来接着放（从现在的拍子接上）
let pausedC = null, pausedT = 0;
function pause() { if (curC !== null) { pausedC = curC; pausedT = tension; stop(true); } }
function resume() { if (pausedC !== null) { const c = pausedC; pausedC = null; play(c, pausedT); } }
function setMuted(v) { muted = !!v; if (bgmBus) bgmBus.gain.value = muted ? 0 : bgmVol; }
// 关与关之间的过场（试听_7 的 STING.B）、换章（STING.C）。不受背景音量影响，走 out
function sting(kind) {
  if (!ctx || muted) return 0;
  const t0s = now() + 0.1;
  const saveBus = bgmBus; bgmBus = out; // 过场声比背景响一些
  let len = 0;
  safe(() => {
    if (kind === 'B') {
      const qq = 60 / 116;
      [['C2', 0], ['C2', 0.75], ['E2', 1], ['G2', 1.5], ['A2', 2.5], ['G2', 3], ['C2', 4], ['C2', 4.75], ['E2', 5], ['G2', 5.5], ['A2', 6], ['C3', 6.5], ['D3', 7]].forEach(([n, b]) => bass(t0s + b * qq, N(n)[0] + 12, 0.55));
      for (let b = 0; b < 8; b += 0.5) hat(t0s + b * qq, b % 1 ? 0.25 : 0.4);
      [1, 3, 5, 7].forEach((b) => snare(t0s + b * qq, 0.5)); [0, 2, 4, 6].forEach((b) => INST.bigdrum(t0s + b * qq, 0.45));
      [['G4', 0.5], ['A4', 1], ['C5', 1.5], ['D5', 4.5], ['C5', 5], ['A4', 5.5]].forEach(([n, b]) => INST.bell(t0s + b * qq, N(n)[0], 0.3));
      const hit = t0s + 8 * qq; INST.bigdrum(hit, 0.9); snare(hit, 0.6); N('C4 E4 G4 C5').forEach((m) => INST.bell(hit, m, 0.38));
      len = 8 * qq + 2.5;
    } else {
      whoosh(t0s, 2.2, 0.35);
      for (let i = 0; i < 11; i++) INST.qin(t0s + 0.2 + i * 0.17, sh(55, i), 0.25 + i * 0.02);
      const land = t0s + 2.4; INST.bigdrum(land, 0.8); N('G4 C5 D5 G5').forEach((m) => INST.bell(land, m, 0.32)); INST.flute(land + 0.05, 79, 0.2, 1.6);
      len = 5.5;
    }
  });
  bgmBus = saveBus;
  return len;
}
// 0.9.22 现在在这一拍的哪里（0 = 正在拍点上，越接近 1 越靠近下一拍）；没在放就是 null。冲锋关画面跟着鼓点闪用
const beat = () => (timer && ctx && q > 0 ? ((((now() - t0) / q) % 1) + 1) % 1 : null);
module.exports = { init, play, stop, outro, pause, resume, setMuted, sting, SONGS, playing: () => curC, beat };
