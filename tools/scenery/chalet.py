"""
The snow chalet, cut from the farmland barn.

The snow strips had trees and rocks and no landmark, and the farmland
strip has one that already sits right for this camera, at the right
size, against the screen edge. So the chalet is the barn: same
silhouette, same roof planes, same trim, reskinned. Timber walls in
place of the red boards, the slate darkened and warmed so it reads as
shingle, snow laid along the top of every roof column and banked at
the foot of the walls, and the barn's window lit.

The barn is extracted rather than hand drawn because a hand drawn one
would be the only building in the game not by the same hand.
"""
from PIL import Image
import colorsys
from collections import deque

import sys
SRC = sys.argv[1] if len(sys.argv) > 1 else 'assets/scenery.png'
DST = sys.argv[2] if len(sys.argv) > 2 else 'assets/scenery.png'
im = Image.open(SRC).convert('RGB')
X0, Y0, X1, Y1 = 3*30+2, 6, 3*30+30, 69
src = im.crop((X0, Y0, X1, Y1)); w, h = src.size; sp = src.load()

def isgreen(r, g, b): return g > r*1.10 and g > b*1.10

def biggest(mask):
    nb = ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1))
    seen = [[False]*h for _ in range(w)]; best = []
    for x in range(w):
        for y in range(h):
            if mask[x][y] and not seen[x][y]:
                q = deque([(x, y)]); seen[x][y] = True; comp = []
                while q:
                    cx, cy = q.popleft(); comp.append((cx, cy))
                    for dx, dy in nb:
                        ax, ay = cx+dx, cy+dy
                        if 0 <= ax < w and 0 <= ay < h and mask[ax][ay] and not seen[ax][ay]:
                            seen[ax][ay] = True; q.append((ax, ay))
                if len(comp) > len(best): best = comp
    return best

solid = [[not isgreen(*sp[x, y]) for y in range(h)] for x in range(w)]
comp = set(biggest(solid))

kind = {}
for (x, y) in comp:
    r, g, b = sp[x, y]
    hh, ss, vv = colorsys.rgb_to_hsv(r/255, g/255, b/255)
    if ss < 0.36 and (vv < 0.92 or ss < 0.2): k = 'trim' if vv > 0.72 else 'roof'
    elif hh > 0.90 or hh < 0.09: k = 'wall'
    else: continue
    kind[(x, y)] = (k, hh, ss, vv)

# The paddock fence leans on the barn and one rail crosses the top of
# the roof, so both come out with it. The rails are the only timber
# above the wall band, and the posts are the only thing left of the
# roof's own white trim, which is a clean line all the way down.
left = {}
edge = 16
for y in range(h):
    ws = [x for x in range(w) if kind.get((x, y), ('',))[0] == 'trim']
    if ws: edge = min(ws)
    left[y] = max(0, (edge if y < 26 else 2) - 1)

WALL_TOP = 44
final = {}
for (x, y), v in kind.items():
    if y >= 62: continue
    if x < left[y]: continue
    if v[0] == 'wall' and y < WALL_TOP: continue
    final[(x, y)] = v

out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); op = out.load()
def put(x, y, hsv):
    r, g, b = colorsys.hsv_to_rgb(*hsv)
    op[x, y] = (int(r*255+.5), int(g*255+.5), int(b*255+.5), 255)

SNOW = (0.585, 0.05, 0.99)
SNOW_SHADE = (0.585, 0.13, 0.86)
WIN_X, WIN_Y = (11, 23), (53, 61)

for (x, y), (k, hh, ss, vv) in final.items():
    if k == 'trim':
        put(x, y, SNOW)
    elif k == 'roof':
        put(x, y, (0.068, min(0.20, ss*0.7 + 0.05), max(0.14, vv*0.58)))
    else:
        put(x, y, (0.085, min(0.55, ss*0.75), max(0.22, vv*0.96)))

# The window, drawn rather than recoloured: the barn's is a white cross
# on boards, and tinting its pixels one by one came out as confetti at
# this size. A lit rectangle with two bars across it is what a window is
# from a moving car.
FRAME = (0.075, 0.55, 0.20)
LIT = (0.105, 0.86, 0.97)
LIT_DIM = (0.095, 0.90, 0.72)
for y in range(WIN_Y[0], WIN_Y[1] + 1):
    for x in range(WIN_X[0], WIN_X[1] + 1):
        if (x, y) not in final: continue
        border = x in (WIN_X[0], WIN_X[1]) or y in (WIN_Y[0], WIN_Y[1])
        mullion = x == (WIN_X[0] + WIN_X[1]) // 2 or y == (WIN_Y[0] + WIN_Y[1]) // 2
        put(x, y, FRAME if border or mullion else (LIT if y < (WIN_Y[0] + WIN_Y[1]) // 2 else LIT_DIM))

# The hayloft door above it, lit too, so the wall has two warm marks
# rather than one and the building reads as lived in at a glance.
for y in range(46, 48):
    for x in range(11, 14):
        if (x, y) in final: put(x, y, LIT_DIM)

# Snow lying on the roof: the top of every roof column, two deep, three
# where the pitch is shallow enough to hold it.
byx = {}
for (x, y), (k, _, _, _) in final.items():
    if k in ('roof', 'trim'): byx.setdefault(x, []).append(y)
for x, ys in byx.items():
    top = min(ys)
    put(x, top, SNOW)
    for d in (1, 2):
        if top+d in ys: put(x, top+d, SNOW)
    if top+3 in ys and x % 3 != 1: put(x, top+3, SNOW_SHADE)
    if top+4 in ys and x % 5 == 0: put(x, top+4, SNOW_SHADE)

# Snow banked against the foot of the walls.
byxw = {}
for (x, y), (k, _, _, _) in final.items():
    if k == 'wall': byxw.setdefault(x, []).append(y)
for x, ys in byxw.items():
    bot = max(ys)
    put(x, bot, SNOW_SHADE)
    if bot-1 in ys and x % 4 != 2: put(x, bot-1, SNOW)


# ---- placing it in the right hand snow verge ----

import random


base = Image.open(SRC).convert('RGBA')
chalet = out          # straight from the pass above

STRIP = 9                 # snow_right
X = STRIP*30
CLEAR = (283, 364)        # the tree that used to stand here
POOL = list(range(286, 313)) + list(range(92, 118)) + list(range(490, 524))

rng = random.Random(20260919)
px = base.load()
for y in range(*CLEAR):
    sy = rng.choice(POOL)
    for x in range(30):
        px[X+x, y] = px[X+x, sy]

base.alpha_composite(chalet, (X+2, 284))
base.convert('RGB').convert('P', palette=Image.ADAPTIVE, colors=112).save(DST, optimize=True)
print('wrote', DST)
