# Scenery art: the prompts

Companion to `SCENERY-ART-SPEC.md`, which says what the art has to be.
This says what to paste into the image model to get it.

Read this first: **one prompt per place, not one prompt for all
seven.** A single generation asked for seven places bleeds the
palettes into each other and averages the styles, and the failure is
not obvious until the strips are built and two places look like
cousins. Seven runs of the same master prompt with a different block
pasted underneath costs a few minutes and is the difference between
art that packs and art that has to be redone. There is an all in one
variant at the bottom if you want to try it anyway.

**What is being asked for is a sheet of parts, not a strip.** The
30 by 544 verge strips get composed here from these parts. See the
spec for why.

---

## The master prompt

This block is identical every time. Paste it, then paste one place
block from below, then generate.

> A pixel art sprite sheet for a retro 8 bit top down arcade driving
> game, in the style of early 1990s console pixel art.
>
> STRICT RULES, follow all of them:
>
> - Every object is seen from DIRECTLY ABOVE, straight down, looking
>   at the top of it. No side views. No three quarter views. No
>   perspective. No horizon. The camera is a satellite.
> - Flat colours only. No gradients, no soft shading, no
>   anti-aliasing, no blur, no glow, no drop shadows, no texture
>   overlays. Hard pixel edges everywhere.
> - Use ONLY the colours listed in the block below, plus the outline
>   colour #262b44. No other colours anywhere.
> - Every object has a one pixel dark outline in #262b44 around it.
> - Background is solid magenta #ff00ff, filling every part of the
>   image that is not an object.
> - Lay the objects out on an even grid with clear magenta space
>   between them. Objects must not touch each other or overlap.
> - Each object is a simple bold silhouette that stays readable when
>   shrunk to twenty pixels wide. The shape carries it. Detail inside
>   the shape is wasted and will be lost.
> - No text, no labels, no numbers, no captions, no watermark, no
>   borders, no drop shadow under the sheet, no UI, no frame.
> - Square image.
>
> Draw the following objects, one per grid cell:

---

## The place blocks

Paste one of these directly after the master prompt.

### 1. Container yard

> COLOURS: #a8a8b0 light concrete, #7e7e88 dark concrete, #d8c24a
> faded painted line yellow, #c0463a container red, #3a6ea8 container
> blue, #3f8a5a container green, #a05a2c rust orange.
>
> OBJECTS:
> 1. A large square patch of cracked concrete ground with a faded
>    yellow painted line running across it, as a flat repeating
>    surface texture with no objects on it.
> 2. A single shipping container seen from directly above: a long
>    rectangle with ribbed corrugated sides and end doors, in red.
> 3. The same shipping container in blue.
> 4. The same shipping container in green.
> 5. Two shipping containers stacked, seen from above, the top one
>    slightly offset so both are visible.
> 6. A wooden pallet stacked with steel drums, seen from above.
> 7. A short steel bollard seen from above, a small circle with a
>    painted top.
> 8. The leg and base of a gantry crane seen from above: a heavy
>    square steel foot with cross bracing.

### 2. Canyon

> COLOURS: #d0855a light rock, #b3603a mid rock, #8a3f28 dark rock,
> #5e2c26 shadow, #e0b27e pale sand, #7a6a3a dry brush.
>
> OBJECTS:
> 1. A large square patch of red desert dirt and gravel as a flat
>    repeating surface texture, no objects on it.
> 2. A section of tall red rock canyon wall seen from directly above:
>    a long ragged band of layered rock with deep shadow along one
>    edge, as if looking down into a gorge.
> 3. A second, different section of the same canyon wall, more
>    broken and fractured.
> 4. A third section of the same canyon wall, narrower, with a
>    ledge.
> 5. A fallen boulder seen from above, rounded, with a shadow side.
> 6. A dead dry shrub seen from above, a sparse tangle of twigs.
> 7. A natural rock arch seen from above, a band of rock with a hole
>    through it showing the ground below.

Note: the wall is most of this strip, so the three wall sections
matter more than the props. Make them clearly different from one
another so they can be stacked without an obvious repeat.

### 3. Orchard

> COLOURS: #8fb757 grass, #6d9442 dark grass, #3f7a3a leaf green,
> #2c5c2c dark leaf green, #7a5a3a trunk brown, #a98a5e track brown,
> #c0463a fruit red.
>
> OBJECTS:
> 1. A large square patch of mown grass with two parallel tractor
>    tyre tracks running across it, as a flat repeating surface
>    texture.
> 2. A mature fruit tree seen from directly above: a round dense
>    canopy, neatly circular, with small red fruit dotted in it.
> 3. The same fruit tree slightly smaller and a shade darker.
> 4. A young tree tied to a wooden stake, seen from above: a small
>    canopy with a stake beside it.
> 5. A run of irrigation pipe seen from above, a straight pipe with
>    joints and small sprinkler heads.
> 6. A round galvanised water tank seen from above.
> 7. A parked tractor seen from directly above.

Note: these trees are planted in rows, so they want to look regular
and cultivated, nothing like a wild forest.

### 4. Sunflowers

> COLOURS: #ffd93d petal yellow, #e0a83c deep gold, #7a4a28 seed head
> brown, #4e8a3a stem green, #356b2c dark leaf green, #8fb757 verge
> grass.
>
> OBJECTS:
> 1. A large square patch of dense sunflower field seen from directly
>    above: rows of yellow flower heads packed together with dark
>    green leaves between them, as a flat repeating surface texture.
> 2. A second patch of the same field, slightly darker and in shadow.
> 3. A single sunflower seen from directly above: a ring of yellow
>    petals around a brown centre, with green leaves behind.
> 4. A cluster of three sunflowers seen from above at slightly
>    different sizes.
> 5. A large square patch of mown grass verge as a flat repeating
>    surface texture.

Note: this place is a texture more than a set of objects, so the two
field patches are the important part.

### 5. Roadworks

> COLOURS: #e8763a hi-vis orange, #e8e4dc barrier white, #a8a096
> light gravel, #786f66 dark gravel, #8a6a48 churned dirt, #e8b83a
> machine yellow, #6a7280 steel grey.
>
> OBJECTS:
> 1. A large square patch of churned dirt and gravel with tyre ruts,
>    as a flat repeating surface texture.
> 2. A traffic cone seen from directly above: concentric orange and
>    white rings on a square base.
> 3. A concrete jersey barrier seen from above, a long slab with
>    orange and white stripes at the ends.
> 4. A neat stack of large pipes seen from above.
> 5. A pile of excavated spoil seen from above, a rough heap of dirt.
> 6. A steel road plate seen from above, a rectangle with bolt holes
>    and a worn surface.
> 7. A small yellow excavator seen from directly above, with its arm
>    folded.
> 8. A yellow road roller seen from directly above.

### 6. Wetland

> COLOURS: #2f4a44 dark water, #3f6b5c mid water, #6a9a84 water
> highlight, #8a9a4a reed olive, #7a7060 grey trunk, #4e7a3f moss
> green.
>
> OBJECTS:
> 1. A large square patch of still dark swamp water seen from
>    directly above, with faint surface highlights, as a flat
>    repeating surface texture with nothing in it.
> 2. A cypress tree trunk rising out of water seen from directly
>    above: a ring of trunk with small knee roots poking up around
>    it.
> 3. A clump of tall reeds seen from directly above.
> 4. A patch of lily pads on water seen from directly above.
> 5. A half sunken log seen from above, partly under the water.
> 6. A small wooden shack on stilts seen from directly above, a
>    square roof with posts visible in the water around it.
> 7. A short wooden jetty seen from directly above, planks running
>    out over the water.

### 7. Autumn (optional)

Autumn can be built here from the existing forest strips with the
leaves turned and the floor changed to litter, and doing it that way
guarantees it is by the same hand. Only generate this one if the
derived version does not convince.

> COLOURS: #c0463a maple red, #d07a32 burnt orange, #e0a83c gold,
> #8a6a3a leaf litter brown, #5a4632 trunk brown, #4e7a3f held back
> green.
>
> OBJECTS:
> 1. A large square patch of fallen autumn leaf litter on the ground,
>    as a flat repeating surface texture.
> 2. A broadleaf tree in full autumn colour seen from directly above:
>    a round canopy of red and orange leaves.
> 3. A second autumn tree in gold and orange, a different size.
> 4. A third tree that has kept its green, for variety in the mix.
> 5. A bare tree seen from directly above, branches visible with few
>    leaves.
> 6. A fallen log with leaves over it, seen from above.

---

## What to check before sending the files over

Three failures are worth a re-roll, and only the first one cannot be
fixed here.

1. **Wrong camera.** If anything is drawn side on or three quarter,
   reject the whole sheet. This is the one thing that cannot be
   repaired by shrinking or recolouring, and image models drift to
   side views constantly because most pixel art they have seen is
   side on. If it keeps happening, add "bird's eye view, looking
   straight down at the ground from a helicopter" to the master.
2. **Objects touching or overlapping.** They have to be cut out
   individually. If they bleed into each other it is a re-roll.
3. **Background not magenta**, or magenta appearing inside an object.
   Either one makes the cut out a judgement call instead of exact.

Smooth edges, anti-aliasing and extra colours are not worth a re-roll.
Those get fixed here by shrinking and snapping to the palette, which
is where the pixel art actually happens.

---

## What to send back

- One PNG per place, the whole sheet, at whatever size it generates.
- Named for the place: `container-yard.png`, `canyon.png`,
  `orchard.png`, `sunflowers.png`, `roadworks.png`, `wetland.png`.
- If you re-roll and like two versions, send both and say so.

Then: each object is cut from the magenta, shrunk to its target size
from the spec, every pixel snapped to the place's palette, the two
verge strips composed from the ground texture with the props placed
down them, the top and bottom cross faded so the vertical loop is
invisible, and the landmark placed once on one side. Then a screenshot
at actual size on the road at a phone's pixel ratio, before anything
is committed, and anything that did not survive the shrink comes back
to you next to the version that did.

---

## The all in one variant

If you want to try getting everything from a single generation, this
is the version to use. Expect to re-roll it several times and expect
the palettes to bleed between places. It is worth one attempt because
if it works it saves six runs.

> A pixel art sprite sheet for a retro 8 bit top down arcade driving
> game, in the style of early 1990s console pixel art.
>
> [paste the STRICT RULES from the master prompt here]
>
> The sheet has six rows. Every object in a row uses only that row's
> colours. Rows are clearly separated by magenta space.
>
> ROW 1, container yard, colours #a8a8b0 #7e7e88 #d8c24a #c0463a
> #3a6ea8 #3f8a5a #a05a2c: cracked concrete ground patch, a red
> shipping container, a blue shipping container, two stacked
> containers, a pallet of steel drums, a gantry crane foot.
>
> ROW 2, canyon, colours #d0855a #b3603a #8a3f28 #5e2c26 #e0b27e
> #7a6a3a: red gravel ground patch, three different sections of
> layered red canyon wall, a fallen boulder, a dead shrub.
>
> ROW 3, orchard, colours #8fb757 #6d9442 #3f7a3a #2c5c2c #7a5a3a
> #a98a5e #c0463a: mown grass ground patch with tyre tracks, a round
> fruit tree with red fruit, a smaller fruit tree, a young tree on a
> stake, a run of irrigation pipe, a water tank.
>
> ROW 4, sunflowers, colours #ffd93d #e0a83c #7a4a28 #4e8a3a #356b2c
> #8fb757: a dense sunflower field patch, a darker sunflower field
> patch, a single sunflower, a cluster of three sunflowers, a grass
> verge patch.
>
> ROW 5, roadworks, colours #e8763a #e8e4dc #a8a096 #786f66 #8a6a48
> #e8b83a #6a7280: churned dirt ground patch with ruts, a traffic
> cone, a striped concrete barrier, a stack of pipes, a spoil heap, a
> yellow excavator.
>
> ROW 6, wetland, colours #2f4a44 #3f6b5c #6a9a84 #8a9a4a #7a7060
> #4e7a3f: still dark water patch, a cypress trunk with knee roots, a
> clump of reeds, a patch of lily pads, a sunken log, a shack on
> stilts.
>
> Every object seen from DIRECTLY ABOVE. Background solid magenta
> #ff00ff. No text or labels anywhere.

---

## A note on the colours

Every hex above is a guess, chosen to sit with the 88 colours already
on the sheet rather than pulled from anything. They are there to steer
the model and to stop seven places drifting into seven unrelated
palettes. Exactness does not matter, because every pixel gets snapped
to a final palette here, and the final palette gets pulled out of
whatever art actually comes back.
