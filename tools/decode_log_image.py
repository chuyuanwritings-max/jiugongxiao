#!/usr/bin/env python3
# 把朋友发来的「试玩记录方格图」解回 JGX1: 文字，再交给 test/decode_log.js 翻成中文（0.9.17）
# 用法：/opt/homebrew/bin/python3.14 tools/decode_log_image.py 图.jpg [名字]
#   → 在图旁边写出 图.txt（JGX1:…），并自动跑 node test/decode_log.js 图.txt 名字
# 图的格式见 js/logimg.js：黑框 + 白边 + 每格 1 比特；数据 = 'JGXI' + 长度 + CRC32 + deflate-raw 字节
import sys, os, base64, zlib, subprocess
import numpy as np
from PIL import Image

COLS = 208  # 和 js/logimg.js 一样


def decode(path):
    im = np.asarray(Image.open(path).convert('L'), dtype=np.float32)
    dark = im < 128
    H, W = dark.shape
    rowfrac = dark.mean(axis=1)
    lines = np.nonzero(rowfrac > 0.85)[0]
    if len(lines) < 2:
        raise SystemExit('没找到黑框：图是不是被截掉了？请让朋友发原图')
    top, bottom = lines[0], lines[-1]
    colfrac = dark[top:bottom + 1].mean(axis=0)
    cols = np.nonzero(colfrac > 0.85)[0]
    left, right = cols[0], cols[-1]
    bw = (right - left + 1) / (COLS + 4)
    rows = int(round((bottom - top + 1) / bw)) - 4
    bh = (bottom - top + 1) / (rows + 4)
    bits = []
    for r in range(rows):
        y = top + (2 + r + 0.5) * bh
        y0, y1 = int(y - bh * 0.25), int(y + bh * 0.25) + 1
        for c in range(COLS):
            x = left + (2 + c + 0.5) * bw
            x0, x1 = int(x - bw * 0.25), int(x + bw * 0.25) + 1
            bits.append(1 if im[y0:y1, x0:x1].mean() < 128 else 0)
    by = bytearray()
    for i in range(0, len(bits) - 7, 8):
        v = 0
        for b in bits[i:i + 8]:
            v = (v << 1) | b
        by.append(v)
    if bytes(by[:4]) != b'JGXI':
        raise SystemExit('图里认不出记录（开头不对）。格子大小 %.2f 像素；请让朋友发原图' % bw)
    n = int.from_bytes(by[4:8], 'big')
    crc = int.from_bytes(by[8:12], 'big')
    data = bytes(by[12:12 + n])
    if len(data) != n or (zlib.crc32(data) & 0xffffffff) != crc:
        raise SystemExit('图里的记录有几格认错了（校验不对）。请让朋友点「发送给朋友」时勾选原图，或者重发一次')
    return 'JGX1:' + base64.b64encode(data).decode('ascii'), bw


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__ or '用法：decode_log_image.py 图 [名字]')
    path = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(os.path.basename(path))[0]
    text, bw = decode(path)
    out = os.path.splitext(path)[0] + '.txt'
    open(out, 'w').write(text)
    print('解出来了：%d 字，格子 %.2f 像素 → %s' % (len(text), bw, out))
    here = os.path.dirname(os.path.abspath(__file__))
    subprocess.run(['node', os.path.join(here, '..', 'test', 'decode_log.js'), out, name])
