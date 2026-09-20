# Store art

Everything the itch page shows, made from the game rather than around
it. Screenshots are filmed frames, the cover and the banner are the
badge over a real stretch of road, and the trailer is next door in
`tools/trailer/`.

The point of keeping this is that the art goes stale every time the
game changes. The first set was made by hand in one sitting and could
not be redone when the scenery was replaced; this can be rerun.

## Run it

    bash tools/trailer/prepare.sh
    (cd tools/trailer/stage && python3 -m http.server 8484) &
    node tools/store/shots.mjs                 # OUT=out by default
    python3 tools/store/cover.py out out

`shots.mjs` needs `tools/trailer/stage`, the capture copy of the build
with the read only world hook appended, because it drives the game
with the trailer's own autopilot. `ONLY=snow,coast` films a subset
while you are iterating on one.

## What comes out

| file | what it is |
| --- | --- |
| `screenshot-1-title.png` | the title screen, road running behind it |
| `screenshot-2-farmland.png` | the barn, the fences and the hay |
| `screenshot-3-snow.png` | the chalet |
| `screenshot-4-coast.png` | water both sides |
| `screenshot-5-pursuit.png` | a marked police car behind the speeder it is chasing |
| `screenshot-6-initials.png` | the wheel, with a name on it |
| `plate-mountain.png`, `plate-farmland.png` | empty road, the backing for the cover and the banner |
| `cover-630x500.png` | itch cover |
| `banner-960x540.png` | itch page banner |

All 540x960, three device pixels per logical one.

## How a shot finds its moment

Each shot drives to a distance, then films a spread of candidate
frames and keeps the best one by its own scorer. The scorers run
inside the page against the canvas, and they differ:

- **By pixel**, where the subject is a colour nothing else on that
  strip has. The barn is the only large red mass off the road; the sea
  is the only blue.
- **By world**, where the pixels cannot tell. A red car beside a blue
  one looks exactly like a wig wag, so the pursuit shot asks the world
  where the emergency vehicle is, and refuses any frame without the
  speeder it is chasing still in front of it.
- **By arithmetic**, where the subject is in a known place in the art.
  The chalet is rows 284 to 346 of a 544 tall verge strip, so its
  screen position falls out of the scroll offset. If the chalet moves,
  that number moves with it, and `tools/scenery/README.md` says so.

Two things this does that a person with a phone cannot. The coast is
6000 metres in and the autopilot dies well before that, so the pilot
is kept alive: fuel and hearts are topped up every step. And the frame
is kept at the moment it wins rather than found again afterwards. An
earlier version swept, remembered which frame won and replayed to it;
it never arrived, because the game starts when its art has loaded and
a fixed number of steps from page load puts the world somewhere
slightly different every take. Every shot was of the frame next door.

## The badge

`badge.py` repaints the three cars on `assets/badge.png`, which is the
title screen badge as well as the store one. Same drawing, new paint,
by the method the game uses on its traffic at load: a mask of the
bodywork, then a recolour that keeps each pixel's brightness relative
to the body's mean, so the shading survives and only the hue moves.
Glass, lights and stripes are left alone because none of them are
bodywork coloured.

    python3 tools/store/badge.py            # contact sheet of the combinations
    python3 tools/store/badge.py asis assets/badge.png

## What is not here

The two itch theme tiles, `page-background-tile.png` and
`embed-background-tile.png`, are abstract: a dark coffee cup pattern
and a dark road. Neither carries any scenery, so neither goes stale
when the art does, and they are kept as they are.
