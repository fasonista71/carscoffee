"""
Repaints the three cars on the badge.

The badge is the one piece of store art not shot from the game, and
its cars were white, red and blue while the traffic on the road is
nine Porsche paint-to-sample colours. Same drawing, new paint, by the
same method the game uses at load: a mask of the body, then a recolour
that keeps each pixel's brightness relative to the body's mean, so the
shading survives and only the hue moves. See src/render/paint.js.

  python3 tools/store/badge.py <combination> [out.png]

Combinations are named below. With no arguments it writes a contact
sheet of all of them instead.
"""
import colorsys
import sys
from PIL import Image

SRC = 'assets/badge.png'

# The three cars, left to right, with the column band each sits in and
# how to tell its bodywork from its glass, lights and stripes.
CARS = [
    ('left', 35, 62, 'neutral'),
    ('middle', 76, 103, 'red'),
    ('right', 117, 144, 'blue'),
]
BAND = (78, 112)

PTS = {
    'guards_red': '#D01820',
    'speed_yellow': '#F3C300',
    'riviera_blue': '#169BC4',
    'grand_prix_white': '#F0EFE8',
    'maritime_blue': '#245AA5',
    'mint_green': '#79C6A3',
    'rubystone_red': '#D12F67',
    'polar_silver': '#B9BEC2',
    'arena_red': '#7D2930',
    'midnight_blue': '#18283E',
    'amazon_green': '#176661',
}

COMBOS = {
    # The three everyone pictures when they hear Porsche.
    'classic': ('speed_yellow', 'guards_red', 'riviera_blue'),
    # Quieter, and closer to what a real cars and coffee row looks like.
    'paddock': ('mint_green', 'guards_red', 'midnight_blue'),
    # Nearest to the badge as it stands, in real paint codes.
    'asis': ('grand_prix_white', 'guards_red', 'maritime_blue'),
    # The odd one out, for comparison.
    'loud': ('rubystone_red', 'speed_yellow', 'amazon_green'),
}


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def body_mask(px, x0, x1, kind):
    out = []
    for y in range(*BAND):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            if kind == 'neutral':
                # Bright and colourless: the bodywork. The headlights are
                # warm and the glass is dark, so both are left alone.
                if mx - mn < 20 and mx > 140:
                    out.append((x, y))
            elif kind == 'red':
                if r - max(g, b) > 30 and r > 70:
                    out.append((x, y))
            elif kind == 'blue':
                if b - max(r, g) > 30 and b > 60:
                    out.append((x, y))
    return out


def repaint(im, target):
    px = im.load()
    for (_, x0, x1, kind), colour in zip(CARS, target):
        mask = body_mask(px, x0, x1, kind)
        if not mask:
            continue
        mean = sum(colorsys.rgb_to_hsv(*[c / 255 for c in px[x, y][:3]])[2]
                   for x, y in mask) / len(mask)
        if mean == 0:
            continue
        hc, sc, vc = colorsys.rgb_to_hsv(*[c / 255 for c in hex_rgb(PTS[colour])])
        for x, y in mask:
            r, g, b, a = px[x, y]
            v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[2]
            ratio = v / mean
            nv = max(0.0, min(1.0, vc * ratio))
            # Shadows lose some saturation rather than all of it: a fully
            # saturated dark pixel reads as a colour cast, a desaturated
            # one reads as shade.
            ns = min(1.0, sc * (0.55 + 0.45 * min(ratio, 1.4)))
            nr, ng, nb = colorsys.hsv_to_rgb(hc, ns, nv)
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return im


def main():
    if len(sys.argv) < 2:
        base = Image.open(SRC).convert('RGBA')
        names = list(COMBOS)
        scale = 3
        pad = 12
        w = base.width * scale
        h = base.height * scale
        sheet = Image.new('RGBA', (w + pad * 2, (h + pad) * len(names) + pad), (18, 18, 26, 255))
        for i, name in enumerate(names):
            out = repaint(base.copy(), COMBOS[name])
            sheet.alpha_composite(out.resize((w, h), Image.NEAREST), (pad, pad + i * (h + pad)))
        sheet.save('badge-options.png')
        print('wrote badge-options.png:', ', '.join(names))
        return
    name = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else 'badge.png'
    repaint(Image.open(SRC).convert('RGBA'), COMBOS[name]).save(out_path)
    print('wrote', out_path, 'as', name, COMBOS[name])


main()
