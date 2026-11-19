// 三张代码画的插画（8 比特：先画在 72×72 的小格子上，再放大，像素颗粒保留）。
// 一宫 = 24×24 像素。以后换成正式插画，只换这里。
const S = 72;

function px(ctx, x, y, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function bands(ctx, cols, y0, y1) {
  const h = (y1 - y0) / cols.length;
  cols.forEach((c, i) => px(ctx, 0, y0 + i * h, S, h + 1, c));
}
function disk(ctx, cx, cy, r, col) {
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y));
    px(ctx, cx - w, cy + y, w * 2 + 1, 1, col);
  }
}
function gear(ctx, cx, cy, r, col, hole) {
  disk(ctx, cx, cy, r, col);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    px(ctx, cx + Math.cos(a) * (r + 1) - 1, cy + Math.sin(a) * (r + 1) - 1, 2, 2, col);
  }
  if (hole) disk(ctx, cx, cy, Math.max(1, Math.floor(r / 3)), hole);
}
function cloud(ctx, x, y, w, col) {
  px(ctx, x, y + 2, w, 3, col);
  px(ctx, x + 2, y, w - 5, 3, col);
  px(ctx, x + w * 0.4, y - 1, w * 0.3, 2, col);
}
function tower(ctx, x, base, w, h, body, roof, win) {
  px(ctx, x, base - h, w, h, body);
  // 檐
  px(ctx, x - 2, base - h - 2, w + 4, 2, roof);
  px(ctx, x - 1, base - h - 4, w + 2, 2, roof);
  px(ctx, x + w / 2 - 1, base - h - 7, 2, 3, roof);
  for (let yy = base - h + 3; yy < base - 3; yy += 5) for (let xx = x + 2; xx < x + w - 2; xx += 4) px(ctx, xx, yy, 2, 2, win);
}
function person(ctx, x, base, o) {
  // 小人：头 4×4，身 6×9；o: { robe, trim, hair, skin, big, goggles, hammer, bun }
  const sc = o.big ? 1.25 : 1;
  const bw = Math.round(6 * sc), bh = Math.round(10 * sc);
  const bx = x - bw / 2, by = base - bh;
  px(ctx, bx, by, bw, bh, o.robe);
  px(ctx, bx, by + 3, bw, 1, o.trim);
  px(ctx, bx + bw / 2 - 0.5, by, 1, bh, o.trim);
  px(ctx, x - 2, by - 5, 4, 5, o.skin);
  px(ctx, x - 2, by - 6, 4, 2, o.hair);
  if (o.bun) px(ctx, x - 1, by - 8, 2, 2, o.hair);
  if (o.longhair) px(ctx, x + 1, by - 5, 2, 5, o.hair);
  if (o.goggles) px(ctx, x - 2, by - 5, 4, 1, '#d9a441');
  if (o.hammer) { px(ctx, bx + bw, by - 6, 1, 10, '#6b4a2a'); px(ctx, bx + bw - 1, by - 8, 4, 3, '#9aa0a6'); }
  if (o.staff) px(ctx, bx - 1, by - 7, 1, bh + 7, '#d9a441');
}

const PAINTINGS = [
  {
    id: 'city', name: '机关城',
    draw(ctx) {
      bands(ctx, ['#2a1d3d', '#3c2348', '#5e2f50', '#8a3f4f', '#c25f45', '#e88b46', '#f4b860'], 0, 46);
      // 太阳在中宫
      disk(ctx, 36, 36, 9, '#ffe3a0');
      disk(ctx, 36, 36, 7, '#fff2c8');
      cloud(ctx, 6, 10, 14, '#7a4a6a'); cloud(ctx, 48, 6, 16, '#7a4a6a'); cloud(ctx, 52, 22, 12, '#b0625a');
      // 远山
      for (let x = 0; x < S; x++) px(ctx, x, 40 + Math.round(Math.sin(x * 0.18) * 2 + Math.sin(x * 0.05) * 3), 1, 10, '#4a2a3e');
      // 城墙
      px(ctx, 0, 52, S, 20, '#3a2418');
      for (let x = 0; x < S; x += 6) px(ctx, x, 50, 4, 2, '#3a2418');
      px(ctx, 0, 56, S, 1, '#57361f');
      // 楼阁
      tower(ctx, 6, 54, 10, 16, '#4a2c1c', '#7a4f1d', '#ffd27a');
      tower(ctx, 22, 54, 8, 22, '#523020', '#b8743a', '#ffd27a');
      tower(ctx, 44, 54, 9, 26, '#4a2c1c', '#d9a441', '#ffd27a');
      tower(ctx, 58, 54, 10, 14, '#523020', '#7a4f1d', '#ffd27a');
      // 大齿轮和水车
      gear(ctx, 34, 56, 7, '#b8743a', '#3a2418');
      gear(ctx, 66, 48, 4, '#d9a441', '#3a2418');
      gear(ctx, 14, 46, 3, '#d9a441', '#3a2418');
      // 城门
      px(ctx, 30, 62, 9, 10, '#1d120c'); px(ctx, 31, 61, 7, 1, '#1d120c');
      // 蒸汽
      cloud(ctx, 46, 22, 9, '#efe6d6'); cloud(ctx, 20, 26, 7, '#efe6d6'); cloud(ctx, 60, 34, 7, '#e8d8c4');
      // 机关鸟
      px(ctx, 12, 18, 5, 2, '#b8743a'); px(ctx, 10, 17, 2, 1, '#d9a441'); px(ctx, 17, 17, 2, 1, '#d9a441'); px(ctx, 14, 17, 1, 1, '#ffe3a0');
      px(ctx, 54, 30, 4, 1, '#b8743a'); px(ctx, 53, 29, 1, 1, '#d9a441'); px(ctx, 58, 29, 1, 1, '#d9a441');
      // 灯火
      for (let x = 3; x < S; x += 9) px(ctx, x, 66, 2, 2, '#ffb04a');
    },
  },
  {
    id: 'mofei', name: '墨非·沙盘',
    draw(ctx) {
      bands(ctx, ['#1e1410', '#2a1b13', '#352218', '#40291c'], 0, 48);
      // 后墙书架
      for (let y = 6; y < 40; y += 10) {
        px(ctx, 2, y + 7, S - 4, 1, '#5a3a22');
        for (let x = 4; x < S - 4; x += 3) px(ctx, x, y + 2 + ((x * 7) % 3), 2, 5 - ((x * 7) % 3), ['#7a3b2e', '#3e5a4a', '#8a6a3a', '#4a3a5a'][(x / 3) % 4 | 0]);
      }
      // 吊着的齿轮
      gear(ctx, 12, 8, 5, '#b8743a', '#1e1410'); gear(ctx, 60, 10, 6, '#d9a441', '#1e1410'); gear(ctx, 52, 4, 3, '#b8743a', '#1e1410');
      // 灯光
      disk(ctx, 36, 24, 14, '#4e3220'); disk(ctx, 36, 24, 10, '#5e3c24');
      // 墨非（中宫，站在沙盘后面）
      person(ctx, 36, 44, { robe: '#26303c', trim: '#d9a441', hair: '#0e0a08', skin: '#e9b88e', bun: true, staff: true, big: true });
      // 手里的墨斗线：一条红线拉到沙盘
      px(ctx, 40, 36, 1, 10, '#e2553b');
      // 沙盘
      px(ctx, 4, 46, 64, 22, '#6b4a2a');
      px(ctx, 6, 48, 60, 18, '#c9a46a');
      px(ctx, 4, 46, 64, 1, '#d9a441'); px(ctx, 4, 67, 64, 1, '#3a2418');
      // 沙盘上的九宫和小机关
      for (let k = 1; k < 3; k++) { px(ctx, 6 + k * 20, 48, 1, 18, '#8a6a3a'); px(ctx, 6, 48 + k * 6, 60, 1, '#8a6a3a'); }
      [[12, 50], [30, 56], [52, 50], [18, 62], [44, 62], [58, 58]].forEach(([x, y], i) => {
        px(ctx, x, y, 3, 3, i % 2 ? '#b8743a' : '#3e5a4a'); px(ctx, x + 1, y - 2, 1, 2, '#d9a441');
      });
      disk(ctx, 36, 57, 2, '#e2553b');
      // 地面
      px(ctx, 0, 68, S, 4, '#1a100b');
    },
  },
  {
    id: 'dawn', name: '城头日出',
    draw(ctx) {
      bands(ctx, ['#1f2a4a', '#2e3a5e', '#4e4a6e', '#8a5a6e', '#d07a62', '#f2a660', '#ffd38a'], 0, 50);
      disk(ctx, 36, 50, 12, '#ffe7b0'); disk(ctx, 36, 50, 9, '#fff6da');
      for (let k = 0; k < 7; k++) px(ctx, 36 + (k - 3) * 9, 20 + Math.abs(k - 3) * 4, 1, 14 - Math.abs(k - 3) * 3, '#ffe3a0');
      cloud(ctx, 4, 14, 16, '#c8889a'); cloud(ctx, 50, 10, 18, '#c8889a'); cloud(ctx, 26, 30, 10, '#f6c890');
      // 机关鸟群
      [[14, 24], [20, 20], [56, 26], [62, 22], [60, 30]].forEach(([x, y]) => { px(ctx, x, y, 3, 1, '#3a2418'); px(ctx, x - 1, y - 1, 1, 1, '#3a2418'); px(ctx, x + 3, y - 1, 1, 1, '#3a2418'); });
      // 城墙
      px(ctx, 0, 54, S, 18, '#2e1d14');
      for (let x = 0; x < S; x += 6) px(ctx, x, 51, 4, 3, '#2e1d14');
      px(ctx, 0, 58, S, 1, '#4a2e1c');
      gear(ctx, 8, 62, 4, '#7a4f1d', '#2e1d14'); gear(ctx, 64, 63, 5, '#7a4f1d', '#2e1d14');
      // 三个人（剪影带一点亮边）：阿铸 / 墨非 / 汐娘
      person(ctx, 24, 51, { robe: '#3a2a22', trim: '#b8743a', hair: '#120c0a', skin: '#c08a66', big: true, hammer: true });
      person(ctx, 36, 51, { robe: '#26303c', trim: '#d9a441', hair: '#0e0a08', skin: '#e9b88e', bun: true, staff: true });
      person(ctx, 47, 51, { robe: '#4a2a3a', trim: '#e2553b', hair: '#1a0e0e', skin: '#f0c49a', goggles: true, longhair: true });
    },
  },
];

// 画到一张 72×72 的小画布上（canvas 由平台层给）
function render(index, canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  PAINTINGS[index % PAINTINGS.length].draw(ctx);
  return canvas;
}

module.exports = { SIZE: S, PAINTINGS, COUNT: PAINTINGS.length, render };
