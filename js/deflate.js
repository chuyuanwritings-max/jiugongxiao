// 极小的压缩（0.9.14 debug）：微信小游戏里没有浏览器的 CompressionStream，原来「复制试玩记录」在微信里拷出来的是没压过的原样记录，
// 打十关就两万多字，粘不进一条微信消息。这里用代码自己压：格式和浏览器的 deflate-raw 一样（固定 Huffman + 往回找重复），
// 所以拷出来还是「JGX1:」开头，解码工具 test/decode_log.js 不用改。压完自己解一遍对过才用，对不上就返回 null（外面退回原样）。
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

function utf8(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) { const d = str.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function base64(bytes) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const parts = []; let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    s += A[a >> 2] + A[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? A[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? A[c & 63] : '=');
    if (s.length > 8192) { parts.push(s); s = ''; }
  }
  parts.push(s);
  return parts.join('');
}
function deflateRaw(src) {
  const n = src.length, out = [];
  let acc = 0, nb = 0;
  const put = (v, bits) => { acc |= v << nb; nb += bits; while (nb >= 8) { out.push(acc & 255); acc >>>= 8; nb -= 8; } }; // 低位先出；一次最多 13 位
  const code = (v, bits) => { let r = 0; for (let i = 0; i < bits; i++) r |= ((v >> i) & 1) << (bits - 1 - i); put(r, bits); }; // Huffman 码高位先出
  const sym = (s) => { if (s < 144) code(0x30 + s, 8); else if (s < 256) code(0x190 + s - 144, 9); else if (s < 280) code(s - 256, 7); else code(0xc0 + s - 280, 8); };
  put(1, 1); put(1, 2); // 只有一段，固定 Huffman
  const head = new Int32Array(32768).fill(-1), prev = new Int32Array(n > 0 ? n : 1);
  const hash = (i) => ((src[i] << 10) ^ (src[i + 1] << 5) ^ src[i + 2]) & 32767;
  let i = 0;
  while (i < n) {
    let bestLen = 0, bestDist = 0;
    if (i + 2 < n) {
      const h = hash(i);
      let p = head[h], chain = 24;
      const maxLen = Math.min(258, n - i);
      while (p >= 0 && i - p <= 32768 && chain-- > 0) {
        if (src[p + bestLen] === src[i + bestLen]) { let l = 0; while (l < maxLen && src[p + l] === src[i + l]) l++; if (l > bestLen) { bestLen = l; bestDist = i - p; if (l === maxLen) break; } }
        p = prev[p];
      }
    }
    if (bestLen >= 3) {
      let lc = 28; while (LBASE[lc] > bestLen) lc--;
      sym(257 + lc); if (LEXT[lc]) put(bestLen - LBASE[lc], LEXT[lc]);
      let dc = 29; while (DBASE[dc] > bestDist) dc--;
      code(dc, 5); if (DEXT[dc]) put(bestDist - DBASE[dc], DEXT[dc]);
      for (let k = 0; k < bestLen; k++, i++) if (i + 2 < n) { const h = hash(i); prev[i] = head[h]; head[h] = i; }
    } else {
      sym(src[i]);
      if (i + 2 < n) { const h = hash(i); prev[i] = head[h]; head[h] = i; }
      i++;
    }
  }
  sym(256);
  if (nb > 0) out.push(acc & 255);
  return out;
}
// 只解自己压的那一种（一段、固定 Huffman），压完对一遍用
function inflateFixed(z) {
  let pos = 0, acc = 0, nb = 0;
  const bit = () => { if (nb === 0) { if (pos >= z.length) throw new Error('短了'); acc = z[pos++]; nb = 8; } const b = acc & 1; acc >>= 1; nb--; return b; };
  const bits = (k) => { let v = 0; for (let i = 0; i < k; i++) v |= bit() << i; return v; };
  const hbits = (k, v) => { for (let i = 0; i < k; i++) v = (v << 1) | bit(); return v; };
  if (bits(1) !== 1 || bits(2) !== 1) throw new Error('不是固定 Huffman');
  const out = [];
  for (;;) {
    let c = hbits(7, 0), s;
    if (c <= 23) s = 256 + c;
    else { c = hbits(1, c); if (c >= 0x30 && c <= 0xbf) s = c - 0x30; else if (c >= 0xc0 && c <= 0xc7) s = 280 + c - 0xc0; else { c = hbits(1, c); s = 144 + c - 0x190; } }
    if (s === 256) break;
    if (s < 256) { out.push(s); continue; }
    const lc = s - 257, len = LBASE[lc] + (LEXT[lc] ? bits(LEXT[lc]) : 0), dc = hbits(5, 0), dist = DBASE[dc] + (DEXT[dc] ? bits(DEXT[dc]) : 0);
    if (!(len >= 3) || !(dist >= 1) || dist > out.length) throw new Error('坏的');
    for (let k = 0, from = out.length - dist; k < len; k++) out.push(out[from + k]);
  }
  return out;
}
// 一段字 → 'JGX1:' 后面那串 base64；出任何岔子返回 null
function pack(str) {
  try {
    const raw = utf8(str), z = deflateRaw(raw), back = inflateFixed(z);
    if (back.length !== raw.length) return null;
    for (let i = 0; i < raw.length; i++) if (back[i] !== raw[i]) return null;
    return base64(z);
  } catch (e) { return null; }
}
module.exports = { pack, deflateRaw, inflateFixed, utf8, base64 };
