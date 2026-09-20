# Scenery art notes

The verge strips in `assets/scenery.png` are 19 columns of 30x544, in
the order `SCENERY_STRIPS` lists them in `src/game/tuning.js`. They are
whole strips rather than tiles, cross faded at the loop point, and only
the sea strip is ever mirrored.

## The snow chalet

The snow verges had trees and rocks and no landmark. The chalet is the
farmland barn reskinned, not a new drawing, so it is by the same hand
as everything else at the same size and the same camera angle:

- the red boards become timber
- the slate is darkened and warmed until it reads as shingle rather
  than as metal, which is what lets snow read as snow on top of it
- snow is laid along the top of every roof column and banked at the
  foot of the walls
- the barn's window and hayloft door are lit

It stands in the right hand snow verge at y 284, where a fir used to
be. That fir was painted out first with clean snow rows taken from
elsewhere in the same strip, so the ground under and around it is the
strip's own texture rather than a flat fill.

One chalet per loop, on one side only. The left hand snow verge would
need the building mirrored to sit against the screen edge the way the
barn does, and mirrored art is the one thing these strips do not do.

`chalet.py` is the script that made it. It has already been applied to
`assets/scenery.png`; running it again would stack a second copy on
top of the first.
