#!/usr/bin/env python3
# 把试玩记录的图解回 JGX1: 文字，再交给 test/decode_log.js 翻成中文。
# 两种图都认：① 一键发图的方格图（'JGXI'，一行 208 格）；② 截屏页（'JGXP'，一行 96 格，几张截图拼起来，顺序乱了也行）
# 用法：/opt/homebrew/bin/python3.14 tools/decode_log_image.py 图1.jpg [图2.jpg …] [--name 名字]
import sys, os, base64, zlib, subprocess
import numpy as np
from PIL import Image


def read_grid(path, cols):
    im = np.asarray(Image.open(path).convert('L'), dtype=np.float32)
    dark = im < 128
    rowfrac = dark.mean(axis=1)
    lines = np.nonzero(rowfrac > 0.8)[0]
    if len(lines) < 2:
        raise ValueError('没找到黑框（图是不是被截掉了？）')
    top, bottom = lines[0], lines[-1]
    colfrac = dark[top:bottom + 1].mean(axis=0)
    cs = np.nonzero(colfrac > 0.8)[0]
    left, right = cs[0], cs[-1]
    bw = (right - left + 1) / (cols + 4)
    rows = int(round((bottom - top + 1) / bw)) - 4
    bh = (bottom - top + 1) / (rows + 4)
    bits = []
    for r in range(rows):
        y = top + (2 + r + 0.5) * bh
        y0, y1 = int(y - bh * 0.22), int(y + bh * 0.22) + 1
        for c in range(cols):
            x = left + (2 + c + 0.5) * bw
            x0, x1 = int(x - bw * 0.22), int(x + bw * 0.22) + 1
            bits.append(1 if im[y0:y1, x0:x1].mean() < 128 else 0)
    by = bytearray()
    for i in range(0, len(bits) - 7, 8):
        v = 0
        for b in bits[i:i + 8]:
            v = (v << 1) | b
        by.append(v)
    return bytes(by), bw


def decode(paths):
    if isinstance(paths, str):
        paths = [paths]
    pages, single = {}, None
    for p in paths:
        got = None
        for cols in (96, 208):
            try:
                by, bw = read_grid(p, cols)
            except ValueError as e:
                err = str(e); continue
            if by[:4] == b'JGXP' and cols == 96:
                got = ('P', by, bw); break
            if by[:4] == b'JGXI' and cols == 208:
                got = ('I', by, bw); break
        if not got:
            raise SystemExit('%s：认不出记录。请发原图（别裁剪），或者重新截一张' % os.path.basename(p))
        kind, by, bw = got
        if kind == 'I':
            n = int.from_bytes(by[4:8], 'big'); crc = int.from_bytes(by[8:12], 'big'); data = by[12:12 + n]
            if len(data) != n or (zlib.crc32(data) & 0xffffffff) != crc:
                raise SystemExit('%s：有几格认错了，请发原图' % os.path.basename(p))
            single = data
        else:
            i, n = by[4], by[5]
            total = int.from_bytes(by[6:10], 'big'); crc = int.from_bytes(by[10:14], 'big'); ln = int.from_bytes(by[14:16], 'big')
            pages[i] = (n, total, crc, by[16:16 + ln])
    if single is not None and not pages:
        data = single
    else:
        if not pages:
            raise SystemExit('没有认出任何一页')
        n, total, crc, _ = next(iter(pages.values()))
        missing = [k + 1 for k in range(n) if k not in pages]
        if missing:
            raise SystemExit('还差第 %s 页（一共 %d 页）' % ('、'.join(map(str, missing)), n))
        data = b''.join(pages[k][3] for k in range(n))
        if len(data) != total or (zlib.crc32(data) & 0xffffffff) != crc:
            raise SystemExit('拼起来校验不对：有一页认错了，请重发那几张截图的原图')
    return 'JGX1:' + base64.b64encode(data).decode('ascii')


if __name__ == '__main__':
    args = sys.argv[1:]
    name = None
    if '--name' in args:
        k = args.index('--name'); name = args[k + 1]; del args[k:k + 2]
    if not args:
        raise SystemExit('用法：decode_log_image.py 图1 [图2 …] [--name 名字]')
    text = decode(args)
    out = os.path.splitext(args[0])[0] + '.txt'
    open(out, 'w').write(text)
    print('解出来了：%d 字 → %s' % (len(text), out))
    here = os.path.dirname(os.path.abspath(__file__))
    subprocess.run(['node', os.path.join(here, '..', 'test', 'decode_log.js'), out, name or os.path.splitext(os.path.basename(args[0]))[0]])
