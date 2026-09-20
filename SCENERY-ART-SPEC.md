# Scenery art: the spec for a new place

Rewritten 20 September 2026. The previous version of this file
described the procedural scenery system, where the roadside was two
narrow strips of code drawn shapes picked from a table. That system is
gone. The roadside is painted art now, and almost everything the old
file said about sizes, angles and objects is wrong. If you have a copy
of it open, close it.

---

## The hard limits

These are not style choices, they are the screen.

The game draws to a 180 by 320 pixel picture and blows the whole thing
up with smoothing off. The road takes the middle, x 30 to 150. That
leaves **30 pixels of roadside per side**.

Each roadside is **one painted strip, 30 pixels wide by 544 tall**.
Every place needs two of them, a left and a right.

- **Left and right are different art.** They are not mirrors of each
  other. The sea strip is the only thing in the game that is ever
  mirrored, and that is a deliberate exception.
- **The strip tiles vertically forever.** It is drawn at y, y+544,
  y+1088 and so on, so pixel row 543 has to flow into row 0 with no
  visible seam. Cross fading the top and bottom into each other is how
  the existing strips do it.
- **Top down.** The camera looks straight down, the same as it does at
  the cars. Trees are seen from above, roofs are seen from above,
  fences are seen from above. Do not draw anything side on.
- **Flat colour, hard edges.** No gradients, no soft edges, no
  anti-aliasing, no blur, no drop shadows. Every pixel is one colour
  from the place's palette.
- **Small palette.** The whole sheet is 88 colours today across
  nineteen strips. A new place should add eight to twelve, not sixty.
- **Shared colours.** The road is `#5a5a6e` and the outline colour
  used across the whole game is `#262b44`.
- **The inner edge matters most.** The pixels nearest the road are
  what the player actually sees while driving, because their eye is on
  the car. The outer edge is at the screen edge and is half noticed.

---

## What a new place costs in code

Four entries, and a test fails if any of them is missing.

1. Two columns appended to `assets/scenery.png`. The sheet is 570 by
   544 today, nineteen columns of 30, in the order `SCENERY_STRIPS`
   lists them.
2. One `<name>_left` and one `<name>_right` in `SCENERY_STRIPS`
   (`src/game/tuning.js`).
3. One entry in `TUNING.sceneryCycle`, which is the tour the road
   repeats past the last tier.
4. One row in `TUNING.sceneryThemes`. **Only three fields are read by
   anything:** `offroad` (the flat colour painted behind the strip,
   which shows through any transparency), `banner` (the place name's
   colour on the tier banner) and `label` (the place name itself). The
   other ten fields in every existing row are dead leftovers from the
   procedural era and should be deleted at some point.

`test/scenes.test.js` checks all four and fails on a half added place.

---

## What to ask an image model for

**Do not ask for the strip.** A 30 pixel wide seamless tiling band is
1:18 aspect and nothing generative handles it usefully. What comes
back will be a picture of a road, not a verge strip, and shrinking a
1024 pixel image to 30 destroys the only thing that makes this art
work, which is that every pixel was placed on purpose.

Ask for the parts instead, one object per image, and they get
assembled into the strip here.

**Per place, generate:**

1. **One ground swatch.** A square patch of the verge surface: grass,
   gravel, sand, water, rock. This becomes the base the band is filled
   with, so it wants to be flat and even rather than a composition.
2. **Three to five props.** The characteristic objects of the place.
   Each one on its own, centred, on a plain background.
3. **One landmark, optional.** A bigger single object that appears
   once per 544 pixel loop, on one side only. The snow chalet is the
   model for this.

**Target sizes**, in final game pixels, so you know what survives:

| Kind | Width | Height |
|---|---|---|
| Small prop (cone, rock, reed clump) | 4 to 10 | 6 to 14 |
| Medium prop (tree, container, machine) | 10 to 20 | 12 to 28 |
| Large prop (wall section, tank) | up to 26 | up to 40 |
| Landmark | up to 26 | up to 60 |

Nothing can exceed 30 wide, and anything over about 26 touches both
edges of the strip and stops reading as an object.

**Prompt to paste**, with the bracketed parts filled in:

> Pixel art sprite of [a shipping container], **seen from directly
> above**, for a retro 8 bit arcade game. Flat colours only, no
> gradients, no shading, no anti-aliasing, no blur, hard pixel edges.
> Use only these colours: [list the four or five hex values]. A dark
> outline in #262b44 around the object. Plain magenta #ff00ff
> background. Object centred, filling most of the frame. Simple bold
> silhouette that reads at thumbnail size. No text, no watermark, no
> ground, no sky, no shadow, no other objects.

Magenta rather than white because white appears inside the snow and
beach art, and a background colour that is nowhere in the sprite makes
cutting it out exact rather than a judgement call.

**What to send back:**

- One PNG per object. Any size from about 256 pixels up. Bigger is not
  better past roughly 512, it just takes longer to shrink.
- Named `<place>-<object>.png`, for example `canyon-boulder.png`,
  `docks-container.png`, `docks-crane.png`.
- The ground swatch named `<place>-ground.png`.
- The landmark named `<place>-landmark.png`.

**What happens to them here:** each one is shrunk to its target size,
every pixel snapped to the place's palette, the band composed from the
ground swatch with the props placed down it at varying spacing, the
top and bottom cross faded so the loop is invisible, the landmark
placed once on one side, and the result appended to the sheet as two
columns. Then a screenshot at actual size, on the road, at a phone's
pixel ratio, before anything is committed. Anything that does not
survive the shrink comes back to you next to the version that does and
we pick.

---

## The sixteen places

Ten rungs on the tier ladder, one per 1,000m, then the rest appear
only in the cycle past 10km. That ordering is deliberate: the ladder
is the first 5.8 minutes and every player sees it, so it holds no
repeats, and a run that gets past it drives six places it has never
seen before, out to 16km.

| Rung | Place | Status |
|---|---|---|
| 0 | mountain | exists |
| 1 | farmland | exists |
| 2 | desert | exists |
| 3 | volcanic | exists |
| 4 | snow | exists |
| 5 | forest | exists |
| 6 | beach | exists |
| 7 | cliffs | exists |
| 8 | city | exists |
| 9 | **container yard** | NEW, replaces forest's second appearance |

Cycle only, first seen between 11km and 16km:

| Place | Status |
|---|---|
| canyon | NEW |
| orchard | NEW |
| sunflowers | NEW |
| roadworks | NEW |
| wetland | NEW |
| autumn | NEW, derived from forest, needs no generated art |

Six places need art. Autumn is a palette shift of the two forest
strips and can be built here without anything being generated, which
is worth doing first because it is free and it proves the pipeline
before any art is commissioned.

---

## The seven new places, in detail

Palette values below are GUESSES and should be replaced by colours
pulled out of the finished art. `banner` is the place name's colour on
the tier banner and wants to be bright enough to read on a dark box.

### container yard

The port at the end of the city. Stacked steel, painted lines, cranes.

- **Ground:** cracked concrete with faded yellow painted lines.
- **Props:** a shipping container from above (the strongest motif,
  repeated in several colours), a stack of two containers, a pallet
  of drums, a bollard.
- **Landmark:** a gantry crane leg, or a straddle carrier.
- **Palette:** concrete greys, rust orange, container red, container
  blue, container green, faded yellow line.
- `offroad` `#8e8e96`, `banner` `#ff7a4c`, `label` "Container Yard"

Containers from above are rectangles with ribbed sides, which reads
perfectly at this size and is the reason this place works.

### canyon

Red rock walls tight to the road. The narrowest the world ever feels.

- **Ground:** red dirt with gravel, only a few pixels wide at the road
  edge.
- **Props:** a wall section (this is most of the strip, so generate
  two or three variants that can be stacked), a fallen boulder, a dead
  shrub.
- **Landmark:** an arch or a slot in the wall.
- **Palette:** rust red, deep shadow red, ochre, pale sandstone,
  shadow purple, dead brush brown.
- `offroad` `#c2703f`, `banner` `#f2743d`, `label` "Canyon"

Note for this one: the wall runs the full height rather than sitting
as objects on ground, so the ground swatch matters less and the wall
variants matter more.

### orchard

Ordered rows. The only place in the game with strict geometry, which
is exactly what makes it read as different from farmland and forest.

- **Ground:** mown grass with tractor tracks between rows.
- **Props:** a fruit tree from above (round, dense, regular), a young
  tree on a stake, an irrigation pipe run.
- **Landmark:** a water tank, or a parked tractor.
- **Palette:** olive green, dark leaf green, grass green, track brown,
  fruit red, pipe grey.
- `offroad` `#8fb757`, `banner` `#c6de63`, `label` "Orchard"

The trees should sit on a regular pitch, unlike forest where they are
scattered. Regularity is the whole point.

### sunflowers

A block of colour. The loudest place in the game and the cheapest to
read at a glance.

- **Ground:** a narrow strip of grass at the road edge, then field.
- **Props:** a sunflower head from above, a denser cluster, a field
  texture of heads at two brightnesses.
- **Landmark:** none needed. The field is the landmark.
- **Palette:** petal yellow, deep gold, centre brown, stem green, leaf
  green, grass verge.
- `offroad` `#b9bf4a`, `banner` `#ffd93d`, `label` "Sunflowers"

This one is a texture more than a set of objects, so the field patch
is the important generation.

### roadworks

Cones, barriers and machinery. The most on theme place in the set, and
the one where the roadside starts to resemble the road.

- **Ground:** churned dirt and gravel, with tyre ruts.
- **Props:** a traffic cone, a jersey barrier, a stack of pipes, a
  pile of spoil, a plate of steel.
- **Landmark:** a digger or a roller.
- **Palette:** hi-vis orange, barrier white, gravel grey, dirt brown,
  machine yellow, steel blue grey.
- `offroad` `#9e968a`, `banner` `#ffc21f`, `label` "Roadworks"

Worth being deliberate: the cones here must not read as the rubble
hazard on the road itself, or players will try to avoid the verge.
Keep them clearly outside the edge line and a different orange.

### wetland

Still dark water on both sides. The quietest place in the game, and a
good one to land right after roadworks in a tour.

- **Ground:** still dark water with a hint of reflection.
- **Props:** a cypress trunk with its knees, a reed clump, a lily pad
  patch, a half sunk log.
- **Landmark:** a shack on stilts, or a short jetty.
- **Palette:** water green black, water highlight, reed olive, trunk
  grey brown, moss green, pale reflection.
- `offroad` `#55705f`, `banner` `#7fd6b2`, `label` "Wetland"

### autumn

Forest, turned. No generation needed: it is the two forest strips with
the leaf colours shifted to golds, oranges and reds, the trunks warmed
and the ground turned to leaf litter.

- **Palette:** maple red, gold, burnt orange, brown leaf litter, trunk
  brown, one green held back so it does not read as a costume.
- `offroad` `#9c7440`, `banner` `#ff9448`, `label` "Autumn"

The one risk is that it reads as forest with a filter over it. The fix
is to change the ground as well as the leaves, so the floor is litter
rather than green, and to hold a little green in the mix rather than
turning everything.

---

## The code change that goes with these

Six of the seven new places never appear on the ladder, so the shuffle
that orders the cycle should put places the ladder never used at the
front of the first lap. Without that, a player reaching 11km gets a
random pick that is probably somewhere they have already been, and the
six new places are scattered across two laps instead of being the
reward for getting past the ladder.

Five lines in `sceneOrderForSeed` in `src/game/scenes.js`, and a test
that the first six entries past the ladder are all places the ladder
never used. Both land when the art does.

---

## What this does not touch

Nothing here goes near the road, the traffic, the tuning or the
simulation. The scenery cannot move a car: `test/scenes.test.js`
proves it by driving the same seed with two deliberately different
tours and requiring identical rows.
