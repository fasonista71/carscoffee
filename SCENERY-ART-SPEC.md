# Scenery art: what to ask GPT for, and what comes back

For D3 in `DESIGN-BACKLOG.md`. This is the brief to hand an image model, plus
what I do with the files afterwards.

## The hard limits

These are not style choices, they are the screen.

The game draws to a 180 by 320 pixel picture and blows it up whole. The road
takes the middle 120 pixels. That leaves 30 pixels of roadside per side, split
into two strips that scroll at different speeds, which is what makes the
roadside feel like it has depth:

| Strip | Width | Scroll | What it holds |
|---|---|---|---|
| Far | 15 px | Slower, 55% of road speed | The horizon: peaks, buildings, barns, the sea |
| Near | 13 px | Road speed | The verge: trees, cactus, rocks, cattle |

So **no scenery object can be wider than 15 pixels**, and most should be 8 to
13. Height is free: 16 to 40 pixels is the useful range, taller reads as a
mountain, shorter as a bush. Objects appear about every 56 pixels of road with
a random nudge, so they are seen one at a time, never as a crowd.

If you want richer, wider scenery than that, say so, because it means merging
the two strips into one 28 pixel band and losing the parallax. My advice is to
keep the two strips.

## The nine places

The run climbs through these in order, one per 1000 metres. Each has its own
seven colours, and **the art should use these and nothing else**, so the
roadside stays a set rather than nine unrelated pictures.

| Theme | Roadside ground | Far object | Far shadow | Far highlight | Near object | Near shadow | Trunk or detail |
|---|---|---|---|---|---|---|---|
| mountain | `#79b364` | `#8a93a6` | `#6e7789` | `#f4f4f4` | `#3f7a3a` | `#2f5c2c` | `#7a5a3a` |
| farmland | `#8fbf5a` | `#b4553f` | `#8c3f2e` | `#f4f4f4` | `#5aa03f` | `#2c3a28` | `#8c6a3f` |
| desert | `#ddba75` | `#b97e4b` | `#94603a` | `#d19a63` | `#4e9e3f` | `#3c7a31` | `#4e9e3f` |
| volcanic | `#4a4046` | `#5a4a52` | `#3d3239` | `#ff6b35` | `#6b5b62` | `#463b41` | `#ffb937` |
| snow | `#e9edf4` | `#c7d0dd` | `#a6b1c2` | `#ffffff` | `#2f5c4a` | `#234636` | `#5a4632` |
| forest | `#3f7a3a` | `#2f5c4a` | `#234636` | `#4e9e3f` | `#2f6b2c` | `#1f4a1e` | `#5a4632` |
| beach | `#ecd493` | `#3f9edb` (sea) | `#2f7fb8` | `#f4f4f4` | `#3f8a3a` | `#2f6b2c` | `#8a6238` |
| cliffs | `#b9b0a0` | `#9a8a78` | `#786a5c` | `#cdbfa8` | `#6b8a4f` | `#4f6b39` | `#8a7a68` |
| city | `#adadb8` | `#8f9ab8` | `#717c9c` | `#f4f4f4` | `#4e9e3f` | `#3c7a31` | `#7a5a3a` |

The road itself is `#5a5a6e` and the outline colour everywhere is `#262b44`.

## What to draw

Fifteen objects. Everything is currently drawn by code, in shapes; these
replace them.

| Object | Strip | Size | Where it appears |
|---|---|---|---|
| peak | far | 15 x 22-38 | mountain, forest |
| barn | far | 15 x 20-26 | farmland |
| mesa | far | 15 x 18-28 | desert, cliffs |
| volcano | far | 15 x 24-34 | volcanic |
| snowpeak | far | 15 x 22-38 | snow |
| building | far | 15 x 24-40 | city |
| sea | far | 15 wide, continuous | beach, with drifting foam rather than objects |
| pine | near | 11 x 18-24 | mountain, forest |
| cow | near | 11 x 8-10 | farmland |
| cactus | near | 9 x 14-20 | desert |
| lavarock | near | 11 x 8-12 | volcanic |
| snowfront | near | 13 x 10-16 | snow |
| treeblob | near | 13 x 14-18 | city |
| scrub | near | 11 x 8-12 | cliffs |
| beachfront | near | 13 x 10-16 | beach |
| palm | near | 11 x 18-24 | spare, unused today |

## Rules for the artwork

1. **Side on, not top down.** The cars are seen from above, the roadside is
   seen from the side. That mix is the convention this kind of game has always
   used and it is what the current scenery does.
2. **Flat colour only.** No gradients, no soft edges, no anti-aliasing, no
   drop shadows. Every pixel is one of the theme's colours.
3. **Four colours per object at most**, from that theme's row.
4. **A dark outline** in `#262b44` on the side facing the road, so the object
   separates from the ground behind it.
5. **Readable as a silhouette.** At this size the shape is the whole thing: a
   pine is a triangle, a barn is a box with a roof, a cow is a blob with four
   legs. Detail inside the shape is wasted.
6. **Transparent background**, and the object touching the bottom edge of the
   image, because it stands on the ground.

## How to ask for it

Image models do not draw a clean 15 by 30 pixel picture. Ask for it big and
flat, and I will shrink it and snap the colours to the palette, which is where
the pixel art actually happens. One object per image.

Prompt to paste, with the bracketed parts filled in:

> Pixel art sprite of [a pine tree], side view, for a retro arcade game.
> Flat colours only, no gradients, no shading, no anti-aliasing, hard edges.
> Use only these colours: [#3f7a3a for the body, #2f5c2c for the shaded side,
> #5a4632 for the trunk, #262b44 for the outline]. Dark outline on the left
> side only. Plain white background, object centred, object touching the
> bottom edge. Simple bold silhouette readable at thumbnail size. No text, no
> ground, no sky, no extra objects.

Then send me the files. What I need back:

- One PNG per object, any size over about 256 pixels tall.
- Named for the object: `pine.png`, `barn.png`, `mesa.png`.
- If an object varies by theme (a pine in snow versus a pine in forest), name
  it `pine-snow.png`.

I shrink each one to its target size, snap every pixel to the theme palette,
hand check the result at actual size against the road, and pack them into the
sprite sheet. Anything that does not survive the shrink, I will show you next
to the current version and we decide.

## What this does to the code

The scenery is procedural today: `FAR_ITEMS` and `NEAR_ITEMS` in
`src/render/renderer.js` are drawing functions, picked per theme by
`TUNING.sceneryThemes`. Replacing them with sprites means the same registry
pointing at frames instead of functions, the sheet growing by fifteen or so
small frames, and `test/atlas.test.js` keeping the contract honest. The theme
colour table stays exactly as it is, because the ground colour and the strips
are still drawn as colour.

Nothing here touches the road, the traffic or the simulation.
