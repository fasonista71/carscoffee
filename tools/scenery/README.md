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

## Generated environment sheets

`strips_from_sheet.py` turns a generated environment sheet into game
verge strips. The sheets come back as columns of road with a verge
either side, drawn about 52 pixels of verge against a 53 pixel road
where the game is 30 against 120, so the road in the picture is thrown
away and only the verges are kept.

Two things in it are worth knowing before changing it.

**The crop is the 40 pixels NEAREST the road, not the whole verge.**
That is the part the player looks at, because their eye is on the car,
and 40 by the sheet's 720 tall scales by exactly 0.75 to 30 by 540,
which means nothing is squashed: a round tree stays round. The outer
twelve pixels of each verge are discarded.

**Each strip is rolled before the loop point is cross faded.** Blending
two different pictures into each other ghosts, and the ghost is only
visible where something big sits on the join: the first pass put a
gantry crane over a stack of containers and it read as a double
exposure. The tool now finds the calmest window of rows in the strip
and rolls that to the bottom, so the blend happens over plain ground.

    python3 tools/scenery/strips_from_sheet.py \
      tools/scenery/sources/environment-tiles-02.png out/ canyon wetland

The column coordinates for a given sheet live in `COLUMNS` at the top
of the file and are measured from the sheet, not guessed. A new sheet
needs its own entries.

`sources/` holds the sheets the shipped strips were cut from, because
without them the strips cannot be rebuilt.
