"""
Turn a generated environment sheet into game verge strips.

The sheets come back as columns of road with a verge either side, drawn
much wider than the game draws them: about 52 pixels of verge against a
53 pixel road, where the game has 30 against 120. So the road in the
picture is thrown away and only the verges are kept.

The crop is deliberately the 40 pixels NEAREST THE ROAD rather than the
whole verge. Two reasons. It is the part the player actually looks at,
because their eye is on the car. And 40 wide by the sheet's 720 tall
scales by exactly 0.75 to 30 by 540, which is the strip size the game
wants, so nothing is squashed: a round tree stays round.

Then the loop. A strip is drawn again and again down the screen, so its
last row has to flow into its first. The bottom rows are cross faded
into the top ones, which is how the strips already in the sheet do it.

    python3 tools/scenery/strips_from_sheet.py SHEET.png out/ [scene ...]
"""
import sys
import os
from PIL import Image

BAND = (139, 859)          # the tall strips, not the variation grid
STRIP_W = 30
STRIP_H = 544
CROP_W = 40                # 40 x 720 scales to 30 x 540, no distortion
FADE = 56                  # rows of cross fade at the loop point
COLORS = 20                # per strip, to keep the sheet's flat look

# scene: (column x0, x1, road x0, x1) with road x relative to the column
COLUMNS = {
    'docks':     (19, 174, 55, 102),
    'container': (189, 349, 48, 105),
    'canyon':    (361, 520, 51, 103),
    'orchard':   (526, 692, 57, 111),
    'sunflower': (697, 853, 55, 109),
    'roadworks': (867, 1024, 52, 106),
    'wetland':   (1040, 1195, 54, 103),
}


def verge(band, scene, side):
    """The 40 pixels of verge nearest the road, full height."""
    x0, x1, r0, r1 = COLUMNS[scene]
    if side == 'left':
        right = x0 + r0            # verge ends where the road starts
        box = (max(x0, right - CROP_W), 0, right, band.height)
    else:
        left = x0 + r1 + 1         # verge starts where the road ends
        box = (left, 0, min(x1 + 1, left + CROP_W), band.height)
    return band.crop(box)


def quietest_roll(img, fade=FADE):
    """
    Where to put the loop point.

    Cross fading two different pictures into each other ghosts, and the
    ghost is only visible when something big is sitting there: a crane
    blended over a stack of containers reads as a double exposure. So
    the strip is rolled first, until the rows that will be blended are
    the calmest ones in it, which in practice means plain ground.
    """
    px = img.load()
    h, w = img.height, img.width
    energy = []
    for y in range(h):
        row = [px[x, y] for x in range(w)]
        mean = [sum(c[k] for c in row) / w for k in range(3)]
        energy.append(sum(abs(c[k] - mean[k]) for c in row for k in range(3)) / w)
    best, bestv = 0, None
    for start in range(h):
        v = sum(energy[(start + i) % h] for i in range(fade))
        if bestv is None or v < bestv:
            bestv, best = v, start
    # roll so the calm window ends up at the bottom
    shift = (best + fade) % h
    out = Image.new('RGB', (w, h))
    out.paste(img.crop((0, shift, w, h)), (0, 0))
    out.paste(img.crop((0, 0, w, shift)), (0, h - shift))
    return out


def seamless(img, fade=FADE):
    """Blend the bottom rows into the top so the vertical loop is invisible."""
    img = quietest_roll(img, fade)
    out = img.copy()
    px = out.load()
    top = img.crop((0, 0, img.width, fade)).load()
    h = img.height
    for i in range(fade):
        a = (i + 1) / (fade + 1)
        y = h - fade + i
        for x in range(img.width):
            b = px[x, y]
            t = top[x, i]
            px[x, y] = tuple(int(round(b[k] * (1 - a) + t[k] * a)) for k in range(3))
    return out


def build(sheet_path, out_dir, scenes):
    im = Image.open(sheet_path).convert('RGB')
    band = im.crop((0, BAND[0], im.width, BAND[1]))
    os.makedirs(out_dir, exist_ok=True)
    made = []
    for scene in scenes:
        for side in ('left', 'right'):
            c = verge(band, scene, side)
            s = c.resize((STRIP_W, STRIP_H), Image.LANCZOS)
            s = seamless(s)
            s = s.quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
            path = os.path.join(out_dir, '%s_%s.png' % (scene, side))
            s.convert('RGB').save(path)
            made.append(path)
    return made


if __name__ == '__main__':
    sheet, out = sys.argv[1], sys.argv[2]
    names = sys.argv[3:] or list(COLUMNS)
    for p in build(sheet, out, names):
        print(p)
