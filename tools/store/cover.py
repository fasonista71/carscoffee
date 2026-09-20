"""
The itch cover and the page banner.

Both are the badge over a piece of real road, so the store art and the
game are the same picture. The road comes from tools/store/shots.mjs,
which films a stretch with nothing on it for exactly this, and
everything is scaled by a whole number with nearest neighbour, so the
pixels stay pixels.

The banner is wider than the game is, and the game is 180 logical
pixels wide and no more. The first version filled the extra width with
more verge taken from further along the same strip, which is honest
art but left a hard vertical seam where the two columns met: the
ground shades toward the road, so two verges side by side do not
join. The banner is cropped from the frame at six times instead, which
loses ten logical pixels off each verge and has no seam in it at all.

  python3 tools/store/cover.py <plates dir> <out dir>
"""
import sys
from PIL import Image

PLATES = sys.argv[1] if len(sys.argv) > 1 else 'out'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'out'

W, H = 180, 320                 # the game's logical buffer

# Where the run HUD stops. Below this line the frame is all road.
HUD_BOTTOM = 42


def native(path):
    """A filmed plate, back at 180x320. The capture runs at a whole
    number of device pixels per logical one, so this is exact."""
    im = Image.open(path).convert('RGB')
    scale = im.width // W
    return im.resize((W, H), Image.NEAREST) if scale != 1 else im


def dim(im, factor):
    return Image.eval(im, lambda v: int(v * factor))


def cover(plate, badge):
    rows = 125                                  # 125 * 4 = 500
    body = plate.crop((0, HUD_BOTTOM, W, HUD_BOTTOM + rows))
    big = dim(body, 0.78).resize((W * 4, rows * 4), Image.NEAREST)
    out = big.crop(((W * 4 - 630) // 2, 0, (W * 4 - 630) // 2 + 630, 500))
    b = badge.resize((badge.width * 3, badge.height * 3), Image.NEAREST)
    out = out.convert('RGBA')
    out.alpha_composite(b, ((630 - b.width) // 2, (500 - b.height) // 2))
    return out.convert('RGB')


def banner(plate, badge):
    rows = 90                                   # 90 * 6 = 540
    body = plate.crop((0, HUD_BOTTOM, W, HUD_BOTTOM + rows))
    big = dim(body, 0.78).resize((W * 6, rows * 6), Image.NEAREST)
    out = big.crop(((W * 6 - 960) // 2, 0, (W * 6 - 960) // 2 + 960, 540)).convert('RGBA')
    b = badge.resize((badge.width * 3, badge.height * 3), Image.NEAREST)
    out.alpha_composite(b, ((960 - b.width) // 2, (540 - b.height) // 2))
    return out.convert('RGB')


badge = Image.open('assets/badge.png').convert('RGBA')
plate = native(PLATES + '/plate-mountain.png')
cover(plate, badge).save(OUT + '/cover-630x500.png')
banner(plate, badge).save(OUT + '/banner-960x540.png')
print('wrote cover-630x500.png and banner-960x540.png')
