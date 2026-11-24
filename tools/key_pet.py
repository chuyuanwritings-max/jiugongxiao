# 宠物头像抠底（0.8.2）。用法：python3 tools/key_pet.py 原图.png images/pet_xxx.png green  （本身是绿色的宠物用 white，比如墨斗蚕）
# 抠底：从四边往里灌，灌到的「底色」都变透明（黑描边挡住，进不了宠物身体）；边上一圈去绿边；裁到内容再补成方形
import subprocess, sys, colorsys
from collections import deque
src, dst, mode = sys.argv[1], sys.argv[2], sys.argv[3]
W = H = 1024
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], capture_output=True, check=True).stdout
px = bytearray(raw)
def bg(i):
    r, g, b = px[i], px[i+1], px[i+2]
    if mode == 'green':
        h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
        return g >= r and g >= b and 0.18 < h < 0.50 and s > 0.15 and v > 0.08
    # white：白底 + 浅灰绿的投影（低饱和、不太暗）
    h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
    return v > 0.45 and s < 0.30
mask = bytearray(W*H)  # 1 = 底
q = deque()
for x in range(W):
    for y in (0, H-1): q.append(y*W+x)
for y in range(H):
    for x in (0, W-1): q.append(y*W+x)
while q:
    p = q.popleft()
    if mask[p] or not bg(p*4): continue
    mask[p] = 1
    x, y = p % W, p // W
    if x > 0: q.append(p-1)
    if x < W-1: q.append(p+1)
    if y > 0: q.append(p-W)
    if y < H-1: q.append(p+W)
# 绿底的宠物身上没有绿色：被描边围住、灌不到的绿色小空隙（鬃毛里、腿中间）也一起抠掉
if mode == 'green':
    for p in range(W*H):
        if not mask[p] and bg(p*4): mask[p] = 1
# 去边：挨着底的那两圈像素，绿色压下去、半透明一点
for p in range(W*H):
    i = p*4
    if mask[p]: px[i+3] = 0; continue
    x, y = p % W, p // W
    near = 0
    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1),(2,0),(-2,0),(0,2),(0,-2)):
        xx, yy = x+dx, y+dy
        if 0 <= xx < W and 0 <= yy < H and mask[yy*W+xx]: near += 1 if abs(dx)+abs(dy) == 1 else 0.5
    if near:
        r, g, b = px[i], px[i+1], px[i+2]
        if mode == 'green': px[i+1] = min(g, max(r, b))
        else:
            m = min(r, g, b)
            if m > 200: px[i+3] = 120
        if near >= 2: px[i+3] = min(px[i+3], 170)
# 裁到内容，补成方形（四周留 4%）
xs = [p % W for p in range(W*H) if px[p*4+3] > 40]; ys = [p // W for p in range(W*H) if px[p*4+3] > 40]
x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
side = int(max(x1-x0, y1-y0) * 1.08); cx, cy = (x0+x1)//2, (y0+y1)//2
out = bytearray(side*side*4)
for yy in range(side):
    sy = cy - side//2 + yy
    if not (0 <= sy < H): continue
    for xx in range(side):
        sx = cx - side//2 + xx
        if 0 <= sx < W:
            si, di = (sy*W+sx)*4, (yy*side+xx)*4
            out[di:di+4] = px[si:si+4]
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{side}x{side}', '-i', '-', '-vf', 'scale=256:256:flags=lanczos', dst], input=bytes(out), check=True)
print(dst, 'bbox', x0, y0, x1, y1)
