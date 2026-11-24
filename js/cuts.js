// 过场（0.6.1）：照 ../../../00_过场动画制作_技能_1.0.md，用共用播放器 cutscene.js。
// 总指挥定的九宫消用法（想法/过场动画_各游戏用法_20261121.md）：
//   F 运镜大图：每章开场，镜头摇过这一章的机关城全景，硬切推到这章的大墨怪，出章名；
//   B 角色登场：每只新宠物第一次到手；
//   C 短版：宠物进化、过章。
// 关里宠物出手不放过场。第二次起播短版，点一下就跳过；奖励在过场开始前就已经入账。
// 图全部代码画（8 比特像素，和 art.js 的插画一个味道）；Midjourney 的横幅全景到了以后只换 panorama()。
const { createCutscene } = require('./cutscene.js');

const DARK = { cy: 0.45, inner: 0.22, outer: 0.62, strength: 0.8 };
const SKY = ['#0b1030', '#101640', '#152050', '#1b2a5e'];
const BRASS = '#c9a050', BRASS_L = '#f3d27a', INK = '#120e18', RED = '#e2553b', STEAM = '#c8d0e0';
const WOOD = '#5a3a22', WOOD_D = '#3a2416', STONE = '#2a3150';

// 每章：全景、字、大墨怪蹲在全景的哪一点（0～1）
const CHAPTERS = [
  { name: '第一章 · 工坊后院', line: '大墨怪躲在后院！', boss: [0.88, 0.62] },
  { name: '第二章 · 水车坊', line: '大馋嘴占了水车坊！', boss: [0.86, 0.6] },
  { name: '第三章 · 染坊', line: '分身王躲在布后面！', boss: [0.86, 0.62] },
];

module.exports = function (api) {
  // api: { P, W, H, dpr, withCtx, petIcon, inkMonster, text, PG, sound, save, persist }
  const { P, W, H } = api;

  // ---------- 像素小工具（画在 320×160 的小画布上，放大时不抹平，颗粒保留） ----------
  const PW = 320, PH = 160;
  function seeded(s) { return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function disk(g, cx, cy, r, c) { for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); px(g, cx - w, cy + y, w * 2 + 1, 1, c); } }
  function gear(g, cx, cy, r, c, hole, rot) {
    disk(g, cx, cy, r, c);
    for (let k = 0; k < 8; k++) { const a = rot + (k / 8) * Math.PI * 2; px(g, cx + Math.cos(a) * (r + 1) - 2, cy + Math.sin(a) * (r + 1) - 2, 4, 4, c); }
    disk(g, cx, cy, Math.max(1, Math.round(r * 0.35)), hole);
  }
  function shed(g, x, base, w, h, roof) {
    px(g, x, base - h, w, h, WOOD); // 墙
    for (let yy = base - h + 3; yy < base; yy += 4) px(g, x, yy, w, 1, WOOD_D); // 木板缝
    for (let k = 0; k < w / 2 + 3; k++) px(g, x - 3 + k, base - h - k * 0.6, w + 6 - k * 2, 1, roof); // 斜顶
    px(g, x + w / 2 - 4, base - 10, 8, 10, INK); // 门
    px(g, x + 4, base - h + 5, 6, 5, BRASS_L); // 亮着的窗
  }
  function lantern(g, x, y) { px(g, x, y - 6, 1, 6, WOOD_D); px(g, x - 3, y, 7, 8, RED); px(g, x - 2, y + 2, 5, 3, '#ffb070'); }
  function smallInk(g, x, y) { disk(g, x, y, 4, INK); px(g, x - 2, y - 1, 1, 2, '#fff'); px(g, x + 1, y - 1, 1, 2, '#fff'); }
  function bigBoss(g, x, y, r) {
    // 头上两只朱砂角 + 白眼睛（和关卡里的大墨怪一个样）
    for (let k = 0; k < 7; k++) { px(g, x - r * 0.6 - k * 0.6, y - r - k, 3, 1, RED); px(g, x + r * 0.6 + k * 0.6 - 3, y - r - k, 3, 1, RED); }
    disk(g, x, y, r, INK);
    // 眼睛：像素图里方块眼比小圆干净
    const e = Math.round(r * 0.32), ey = Math.round(y - r * 0.3);
    px(g, x - r * 0.55, ey, e, e + 1, '#fff'); px(g, x + r * 0.55 - e, ey, e, e + 1, '#fff');
    px(g, x - r * 0.55 + e - 2, ey + 1, 2, 3, INK); px(g, x + r * 0.55 - e, ey + 1, 2, 3, INK);
    for (let k = 0; k < 5; k++) disk(g, x - r + k * r * 0.5, y + r * 0.85, Math.round(r * 0.28), INK); // 墨滴下摆
  }
  function skyAndCity(g, rnd) {
    SKY.forEach((c, i) => px(g, 0, i * 25, PW, 26, c));
    for (let k = 0; k < 60; k++) px(g, rnd() * PW, rnd() * 60, 1, 1, rnd() < 0.3 ? BRASS_L : '#8090c0');
    disk(g, 42, 24, 9, '#efe6d2'); disk(g, 46, 21, 8, SKY[0]); // 月牙
    // 远处的墨家机关城：一排塔，塔顶是齿轮，窗口点黄铜
    for (let x = 0; x < PW; x += 14 + Math.floor(rnd() * 10)) {
      const h = 18 + Math.floor(rnd() * 26), w = 8 + Math.floor(rnd() * 6);
      px(g, x, 100 - h, w, h, '#1a2148');
      if (rnd() < 0.5) gear(g, x + w / 2, 100 - h - 3, 3, '#232c5a', '#1a2148', 0);
      for (let yy = 100 - h + 4; yy < 98; yy += 6) if (rnd() < 0.5) px(g, x + 2, yy, 1, 2, BRASS);
    }
  }
  function panorama(ch) {
    const c = P.makeCanvas(PW, PH), g = c.getContext('2d'), rnd = seeded(11 + ch * 97);
    skyAndCity(g, rnd);
    if (ch === 0) {
      // 工坊后院：草棚 → 墙上大齿轮 + 烟囱冒汽 → 木箱、工作台、灯笼 → 最右边的棚子后面探出大墨怪
      px(g, 0, 128, PW, 32, STONE); for (let x = 0; x < PW; x += 10) px(g, x, 128 + ((x / 10) % 2) * 6, 9, 1, '#384068');
      shed(g, 16, 128, 56, 34, '#7a4a2a');
      px(g, 100, 70, 80, 58, '#3c3a52'); gear(g, 140, 98, 20, BRASS, '#3c3a52', 0.2); gear(g, 166, 80, 9, '#a07838', '#3c3a52', 0.5);
      px(g, 112, 40, 10, 30, '#4a4660'); for (let k = 0; k < 5; k++) disk(g, 118 + k * 4, 34 - k * 6, 4 + k, STEAM);
      px(g, 196, 112, 18, 16, WOOD); px(g, 214, 118, 14, 10, WOOD_D); px(g, 232, 116, 22, 3, WOOD); px(g, 234, 119, 2, 9, WOOD_D); px(g, 250, 119, 2, 9, WOOD_D);
      lantern(g, 204, 84); lantern(g, 236, 80);
      smallInk(g, 88, 124); smallInk(g, 186, 125); smallInk(g, 226, 112);
      bigBoss(g, CHAPTERS[0].boss[0] * PW, CHAPTERS[0].boss[1] * PH + 6, 16);
      shed(g, 292, 128, 30, 26, '#7a4a2a');
    } else if (ch === 2) {
      // 染坊：晾布架上挂着红蓝绿金的长布 → 一排染缸 → 最右边的布后面露出戴王冠的分身王
      px(g, 0, 126, PW, 34, '#3a2e3e'); for (let x = 0; x < PW; x += 12) px(g, x, 130 + ((x / 12) % 2) * 8, 10, 1, '#4c3e52');
      const cloth = ['#c94a3a', '#3f6fb0', '#3f9a5c', '#d9a640', '#8a4fb0'];
      for (let x = 8; x < 250; x += 46) {
        px(g, x, 56, 40, 3, WOOD); px(g, x, 56, 2, 72, WOOD_D); px(g, x + 38, 56, 2, 72, WOOD_D);
        for (let n = 0; n < 3; n++) { const c = cloth[(x / 46 + n) % 5 | 0], h = 34 + ((x + n * 7) % 16); px(g, x + 5 + n * 11, 59, 9, h, c); px(g, x + 5 + n * 11, 59 + h, 9, 2, INK); }
      }
      for (let n = 0; n < 5; n++) { const x = 20 + n * 48; disk(g, x, 128, 12, WOOD_D); px(g, x - 12, 122, 25, 6, WOOD); px(g, x - 10, 122, 21, 3, cloth[n]); }
      lantern(g, 100, 40); lantern(g, 196, 40);
      smallInk(g, 70, 118); smallInk(g, 160, 118); smallInk(g, 236, 120);
      const bx = CHAPTERS[2].boss[0] * PW, by = CHAPTERS[2].boss[1] * PH + 8;
      bigBoss(g, bx, by, 16);
      for (let k = 0; k < 5; k++) px(g, bx - 8 + k * 4, by - 26 - (k % 2 ? 0 : 4), 3, 6 + (k % 2 ? 0 : 4), BRASS_L); // 王冠
      px(g, bx - 9, by - 22, 19, 3, BRASS_L);
      px(g, 300, 50, 3, 80, WOOD_D); px(g, 304, 56, 12, 50, '#c94a3a');
    } else {
      // 水车坊：远山 → 河 → 两座水车磨坊 → 拱桥 → 最右边大墨怪蹲在河里，墨晕开
      for (let x = 0; x < PW; x++) { const h = 14 + Math.round(Math.sin(x * 0.05) * 6 + Math.sin(x * 0.13) * 3); px(g, x, 100 - h, 1, h, '#18204a'); }
      px(g, 0, 100, PW, 22, '#2b3a3a'); // 河岸
      px(g, 0, 122, PW, 38, '#1e4a7a'); for (let k = 0; k < 40; k++) px(g, rnd() * PW, 124 + rnd() * 34, 6 + rnd() * 8, 1, '#4a7ab0');
      for (const [x, r] of [[60, 20], [160, 16]]) {
        shed(g, x - 46, 122, 40, 32, '#6a4a2a');
        gear(g, x, 118, r, '#7a5a34', '#1e4a7a', 0.3);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; for (let t = 0; t < r; t += 2) px(g, x + Math.cos(a) * t, 118 + Math.sin(a) * t, 2, 2, WOOD_D); }
      }
      for (let x = 196; x < 250; x++) { const y = 112 - Math.round(Math.sin(((x - 196) / 54) * Math.PI) * 12); px(g, x, y, 1, 3, BRASS); }
      lantern(g, 210, 92); lantern(g, 236, 92);
      smallInk(g, 110, 128); smallInk(g, 186, 130);
      disk(g, CHAPTERS[1].boss[0] * PW, 140, 22, '#14182e'); // 墨在河里晕开
      bigBoss(g, CHAPTERS[1].boss[0] * PW, CHAPTERS[1].boss[1] * PH + 14, 16);
    }
    return c;
  }
  // 暗底（深靛蓝 + 中间亮一点）
  function darkBg() {
    const c = P.makeCanvas(64, 112), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 46, 4, 32, 46, 70); gr.addColorStop(0, '#26306a'); gr.addColorStop(1, '#070a1c');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 112);
    return c;
  }
  // 放射光底（进化、过章用）
  function raysBg(col) {
    const s = 256, c = P.makeCanvas(s, s), g = c.getContext('2d');
    g.fillStyle = '#141a40'; g.fillRect(0, 0, s, s); g.fillStyle = col;
    for (let i = 0; i < 16; i += 2) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a0) * s, s / 2 + Math.sin(a0) * s); g.lineTo(s / 2 + Math.cos(a1) * s, s / 2 + Math.sin(a1) * s); g.closePath(); g.fill();
    }
    return c;
  }
  // 宠物大头像（借 main.js 的 petIcon 画在离屏画布上）；sil = 涂黑成剪影
  function petImg(id, sil) {
    const d = api.dpr, s = 300, c = P.makeCanvas(s * d, s * d), g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    api.withCtx(g, () => api.petIcon(id, s / 2, s / 2, s * (id === 'jinchique' ? 0.5 : 0.62), 0, 0));
    if (sil) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#05060f'; g.fillRect(0, 0, c.width, c.height); }
    return c;
  }
  function bossImg() {
    const d = api.dpr, s = 300, c = P.makeCanvas(s * d, s * d), g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    api.withCtx(g, () => api.inkMonster(s / 2, s / 2 + 20, 100, true));
    return c;
  }
  // 被打扁的大墨怪：一摊墨 + ✕ 眼 + 两只角耷拉下来
  function bossBeatenImg() {
    const d = api.dpr, s = 300, c = P.makeCanvas(s * d, s * d), g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = '#2a2236'; g.beginPath(); g.ellipse(150, 210, 130, 42, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = INK; g.beginPath(); g.ellipse(150, 196, 96, 52, 0, Math.PI, 0); g.fill(); g.beginPath(); g.ellipse(150, 196, 96, 22, 0, 0, Math.PI); g.fill();
    g.strokeStyle = RED; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath(); g.moveTo(92, 160); g.lineTo(62, 176); g.moveTo(208, 160); g.lineTo(238, 176); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 7;
    for (const x of [118, 182]) { g.beginPath(); g.moveTo(x - 12, 172); g.lineTo(x + 12, 194); g.moveTo(x + 12, 172); g.lineTo(x - 12, 194); g.stroke(); }
    return c;
  }

  // ---------- 时间线 ----------
  // F：每章开场。pan 按这台手机的宽高比现算，硬切正好停在大墨怪上
  function chapterTl(ch, img) {
    const info = CHAPTERS[ch];
    const s = Math.max(W / img.width, H / img.height), dw = img.width * s, dh = img.height * s;
    const ox = (fx, zoom) => { const lim = (dw / 2 - W / 2 / zoom) / W; return Math.max(-lim, Math.min(lim, ((fx - 0.5) * dw) / W)); };
    const oy = (fy, zoom) => { const lim = (dh / 2 - H / 2 / zoom) / H; return Math.max(-lim, Math.min(lim, ((fy - 0.5) * dh) / H)); };
    const [bx, by] = info.boss;
    return {
      id: 'chapter' + ch, fps: 60, bg: '#000000', short: { from: 'punch' },
      layers: [{ id: 'pano', img: 'pano', fit: 'cover', z: 0 }],
      beats: [
        { id: 'black', type: 'darkIn', dur: 24,
          fx: [{ at: 0, fx: 'camera', pan: [ox(0.08, 1.1), 0], panDur: 0, to: 1.1 },
               { at: 0, fx: 'fade', from: 1, to: 0, dur: 24 }] },
        { id: 'sweep', type: 'hold', dur: 100,
          fx: [{ at: 0, fx: 'camera', pan: [ox(0.66, 1.1), 0], panDur: 100, panEase: 'inOut' },
               { at: 20, fx: 'text', str: info.name, in: 'fade', inDur: 16, pos: [0.5, 0.16], size: 24, strokeWidth: 5, dur: 70 },
               { at: 0, sfx: 'whoosh' }] },
        { id: 'still', type: 'hold', dur: 24 },
        { id: 'punch', type: 'strike', dur: 4,
          fx: [{ at: 0, fx: 'camera', pan: [ox(bx, 1.8), oy(by, 1.8)], panDur: 0, steps: [1.4, 1.6, 1.8], stepDur: 1 },
               { at: 0, fx: 'flash', alpha: 0.8, hold: 1, decay: 10 },
               { at: 0, fx: 'shake', amp: 7, dur: 10 },
               { at: 0, sfx: 'impact' }] },
        { id: 'pose', type: 'pose', dur: 70,
          fx: [{ at: 0, fx: 'camera', to: 1.9, dur: 70, ease: 'linear' },
               { at: 4, fx: 'text', str: info.line, in: 'pop', inDur: 10, pos: [0.5, 0.8], size: 30, strokeWidth: 6, color: '#f3d27a', dur: 66 }] },
        { id: 'out', type: 'out', dur: 14, fx: [{ at: 0, fx: 'fade', from: 0, to: 1, dur: 14 }] },
      ],
    };
  }
  // B：新宠物到手。剪影 6 帧 → 上色亮相（集中线、光柱、推镜、名字 + 一行本事）
  function petIntroTl(id) {
    const d = api.PG.PETS[id];
    return {
      id: 'pet_' + id, fps: 60, bg: '#070a1c', vignette: DARK, short: { from: 'reveal', dur: { hold: 20 } },
      layers: [
        { id: 'bg', img: 'bg', fit: 'cover', z: 0 },
        { id: 'hero', img: 'sil', z: 1, pos: [0.5, 0.44], anchor: [0.5, 0.5], h: 0.42, alpha: 0 },
      ],
      beats: [
        { id: 'black', type: 'darkIn', dur: 6, fx: [{ at: 0, fx: 'fade', from: 1, to: 1, dur: 6 }] },
        { id: 'flash', type: 'impact', dur: 12, frames: [{ f: 0, layer: 'hero', alpha: 1 }],
          fx: [{ at: 0, fx: 'flash', alpha: 1, hold: 2, decay: 12 }, { at: 0, sfx: 'whoosh' }] },
        { id: 'silhouette', type: 'hold', dur: 6 },
        { id: 'reveal', type: 'pose', dur: 50, frames: [{ f: 0, layer: 'hero', img: 'pose', alpha: 1 }],
          fx: [{ at: 0, fx: 'flash', alpha: 0.5, decay: 8 },
               { at: 0, fx: 'speedlines', origin: [0.5, 0.44], dur: 12, z: 0.6 },
               { at: 0, fx: 'rays', origin: [0.5, 0.44], z: 0.5, fadeIn: 8, alpha: 0.22, color: '#FFE6A0', dur: 110 },
               { at: 0, fx: 'camera', to: 1.08, dur: 50, ease: 'out', focus: [0.5, 0.44] },
               { at: 8, fx: 'text', str: '新伙伴 · ' + d.name, in: 'pop', pos: [0.5, 0.74], size: 32, color: '#f3d27a', dur: 102 },
               { at: 16, fx: 'text', str: api.PG.petDesc(id, 1), in: 'fade', pos: [0.5, 0.8], size: 16, color: '#e8e2d0', strokeWidth: 4, dur: 94 },
               { at: 0, sfx: 'sting' }] },
        { id: 'hold', type: 'hold', dur: 60, tracks: [{ layer: 'hero', prop: 'scale', from: 1, to: 1.03, ease: 'breathe' }] },
        { id: 'out', type: 'out', dur: 16, fx: [{ at: 0, fx: 'fade', from: 0, to: 1, dur: 16 }] },
      ],
    };
  }
  // C 短版：主角停一下 → 硬切 + 闪 → 换成放射光底、粒子、大字 → 淡黑。约 1.5 秒
  //   进化：旧头像 → 硬切成新头像；过章：大墨怪 → 硬切成被打扁的一摊墨（加命中星）
  function shortTl(id, word, sub, hit) {
    return {
      id, fps: 60, bg: '#070a1c', vignette: DARK,
      layers: [
        { id: 'bg', img: 'bg', fit: 'cover', z: 0 },
        { id: 'meta', img: 'rays', fit: 'cover', z: 0.5, alpha: 0 },
        { id: 'hero', img: 'before', z: 1, pos: [0.5, 0.44], anchor: [0.5, 0.5], h: 0.42 },
      ],
      beats: [
        { id: 'hold', type: 'hold', dur: 22, tracks: [{ layer: 'hero', prop: 'scale', from: 1, to: 1.04, ease: 'breathe' }] },
        { id: 'trigger', type: 'impact', dur: 2,
          frames: [{ f: 0, layer: 'hero', img: 'after' }],
          fx: [{ at: 0, fx: 'flash', alpha: 0.8, decay: 10 },
               { at: 0, fx: 'shake', amp: 6, dur: 8 },
               { at: 0, fx: 'speedlines', origin: [0.5, 0.44], dur: 12, z: 2 },
               { at: 0, fx: 'particles', preset: 'spark', n: 28, origin: [0.5, 0.44], z: 3 },
               { at: 0, fx: 'camera', steps: [1.08, 1.18], stepDur: 3, focus: [0.5, 0.44] },
               hit ? { at: 0, fx: 'star', origin: [0.5, 0.36], size: 0.14, z: 3 } : { at: 0, fx: 'rays', origin: [0.5, 0.44], z: 0.8, alpha: 0.25, fadeIn: 4, color: '#FFE6A0', dur: 56 },
               { at: 0, sfx: 'impact' }] },
        { id: 'meta', type: 'metaphor', dur: 54, frames: [{ f: 0, layer: 'meta', alpha: 0.55 }],
          tracks: [{ layer: 'meta', prop: 'scale', from: 1, to: 1.08, ease: 'linear' }],
          fx: [{ at: 0, fx: 'particles', preset: 'bokeh', n: 20, z: 0.7, dur: 54 },
               { at: 4, fx: 'text', str: word, in: 'pop', pos: [0.5, 0.16], size: 44, color: '#f3d27a', strokeWidth: 7, dur: 50 },
               { at: 12, fx: 'text', str: sub, in: 'fade', pos: [0.5, 0.76], size: 20, color: '#e8e2d0', strokeWidth: 5, dur: 42 },
               { at: 4, sfx: 'sting' }] },
        { id: 'out', type: 'out', dur: 12, fx: [{ at: 0, fx: 'fade', from: 0, to: 1, dur: 12 }] },
      ],
    };
  }

  // ---------- 排队、播放 ----------
  const SFX = { whoosh: ['select', 0.5], impact: ['combo4', 0.7], sting: ['win', 0.6] };
  const queue = [];
  let cs = null, pixel = false;
  function enqueue(key, make) { queue.push({ key, make }); }
  function startNext() {
    const it = queue.shift();
    if (!it) { cs = null; return false; }
    const seen = !!api.save.cutSeen[it.key];
    const { timeline, images } = it.make();
    pixel = !!images.pano;
    api.save.cutSeen[it.key] = true; api.persist();
    cs = createCutscene({
      ctx: api.getCtx(), width: W, height: H, images, timeline, short: seen,
      onSfx: (n) => { const s = SFX[n]; if (s) api.sound(s[0], s[1]); },
      onEnd: () => {},
    });
    return true;
  }
  return {
    get playing() { return !!cs; },
    get pending() { return queue.length > 0; },
    // 每章第一关开打前：F 运镜大图
    chapter(ch) {
      if (!CHAPTERS[ch]) return;
      enqueue('chapter' + ch, () => { const img = panorama(ch); return { timeline: chapterTl(ch, img), images: { pano: img } }; });
    },
    // 新宠物到手：B 角色登场
    petIntro(id) { enqueue('pet_' + id, () => ({ timeline: petIntroTl(id), images: { bg: darkBg(), sil: petImg(id, true), pose: petImg(id, false) } })); },
    // 进化：C 短版
    evolve(from, to) {
      const PG = api.PG;
      enqueue('evo_' + to, () => ({ timeline: shortTl('evo_' + to, '进化！', PG.PETS[from].name + ' → ' + PG.PETS[to].name, false),
        images: { bg: darkBg(), rays: raysBg('#2a3670'), before: petImg(from, false), after: petImg(to, false) } }));
    },
    // 过章（打倒这章的大墨怪）：C 短版
    chapterClear(ch) {
      enqueue('clear' + ch, () => ({ timeline: shortTl('clear' + ch, CHAPTERS[ch].name.split(' · ')[0] + ' 过关！', '大墨怪被打扁了', true),
        images: { bg: darkBg(), rays: raysBg('#3a2a5a'), before: bossImg(), after: bossBeatenImg() } }));
    },
    start() { return cs || startNext(); },
    update(dtMs) { if (!cs) return; cs.update(dtMs); if (cs.done) startNext(); },
    draw() {
      if (!cs) return;
      const ctx = api.getCtx();
      ctx.save(); if (pixel) ctx.imageSmoothingEnabled = false; // 像素全景放大不抹平（头像、光底照常平滑）
      cs.draw();
      ctx.restore();
      if (!cs.done) api.text('点一下跳过', W - 14, H - 22, 12, 'rgba(232,226,208,0.55)', 'right', 'normal');
    },
    skip() { if (cs) { cs.skip(); startNext(); } },
    clear() { queue.length = 0; cs = null; },
    CHAPTERS,
  };
};
