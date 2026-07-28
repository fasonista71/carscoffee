/*
  Every gameplay number lives here. Nothing elsewhere in the codebase is
  allowed to carry a magic number. The dev overlay mutates this object
  live, so modules should read values at the moment of use, not cache
  them at import time.

  Values marked GUESS are starting points chosen by feel and intent,
  not verified against play. They exist to be tuned.
*/

export const TUNING = {
  logic: {
    hz: 60,
    /* Accumulator clamp. On resume from a backgrounded tab the frame
       delta is capped to this, so the simulation never spirals. GUESS. */
    maxFrameDeltaMs: 100
  },

  road: {
    laneCount: 3,
    laneWidthPx: 40,
    roadLeftPx: 30
  },

  movement: {
    /* Lane change duration. The brief says start near 120. GUESS. */
    laneTweenMs: 120,
    /* Exactly one input may queue during a tween. Brief requirement. */
    maxQueuedInputs: 1
  },

  speed: {
    /* Scroll speed of the world in logical px per second. GUESS. */
    basePxPerSec: 150,
    /* Purely a display conversion for the score readout. GUESS. */
    pxPerMeter: 8
  },

  input: {
    /* How taps resolve.
       'lane': a tap targets the lane under the finger. The car moves
       one lane toward it; a tap on the car's own lane is boost. This
       matches the spatial instinct found in device testing.
       'thirds': the original brief spec. Left and right screen thirds
       move by direction, center third is boost.
       Both stay implemented so they can be A/B tested live. */
    tapMode: 'lane',
    /* Finger travel in CSS px before a touch becomes a swipe. GUESS. */
    swipeThresholdPx: 24,
    /* A release with no swipe within this duration counts as a tap.
       Generous on purpose: the cost of rejecting a real tap is far
       higher than the cost of accepting a slow one. GUESS. */
    tapMaxMs: 500
  },

  obstacles: {
    /* Clear road before the first obstacle appears. GUESS. */
    firstSpawnDistPx: 600,
    /* How far ahead of the car the generator stays. */
    horizonPx: 480,
    /* How far behind the car obstacles are removed. */
    despawnBehindPx: 120,
    /* Human time to notice a pattern before having to act. Feeds the
       fairness gap between obstacle rows. GUESS. */
    reactionBufferMs: 350,
    /* Row gaps are the fair minimum times 1 to this. Lower means
       denser, harder track. GUESS. */
    gapJitterMax: 1.9,
    /* Chance a row blocks two lanes instead of one. GUESS. */
    doubleRowChance: 0.3,
    /* Uniform collision box for stalled cars regardless of which art
       variant is drawn. Slightly smaller than the art reads. */
    stalledHitbox: { wPx: 24, hPx: 44 },
    /* Total forgiveness subtracted from combined half extents, so
       near misses feel like near misses. GUESS. */
    hitboxShrinkPx: 4,
    /* Must match the variant list in render sprites. */
    stalledVariantCount: 7
  },

  traffic: {
    /* Chance a row of cars is stalled (speed zero) rather than
       moving. GUESS. */
    stalledChance: 0.4,
    /* Moving rows travel at this fraction of the player's base speed,
       chosen per row. The band keeps closing speeds meaningful: slow
       traffic rushes at you, fast traffic creeps back at you. GUESS. */
    speedFracMin: 0.25,
    speedFracMax: 0.5,
    /* Rear traffic slows to match the row ahead this many px before
       the fair minimum gap would be violated. Keeps moving rows from
       ever bunching into an unfair wall. */
    clampMarginPx: 12
  },

  fuel: {
    max: 100,
    /* Sized so ignoring coffee entirely ends a run in roughly 45
       seconds, per the brief. Scales with speed tiers in step 9.
       GUESS. */
    passiveDrainPerSec: 2.2,
    /* Extra drain while boosting, on top of passive. GUESS. */
    boostDrainPerSec: 12,
    coffeeRefill: 18,
    /* Below this the meter turns red; feeds the fuel_low sound in
       step 10. GUESS. */
    lowThreshold: 25
  },

  boost: {
    /* Fixed duration burst, not a hold. Gated only by minFuel; no
       separate cooldown, no extension while active. */
    durationMs: 1200,
    speedMultiplier: 1.45,
    minFuel: 10
  },

  coffee: {
    /* Chance each spawned row brings a cup with it. GUESS. */
    spawnChancePerRow: 0.35,
    /* Share of cups placed in tension (beside or in the forced path
       of a hazard) versus free cups in gaps. Kept above the brief's
       70 percent floor. */
    tensionRatio: 0.75,
    hitbox: { wPx: 12, hPx: 14 },
    /* Collection is forgiving by this much on each axis. */
    pickupSlopPx: 2
  },

  render: {
    logicalW: 180,
    logicalH: 320,
    /* Vertical center of the player sprite on the logical screen. */
    playerYPx: 252,
    dashLengthPx: 12,
    dashGapPx: 12,
    dashWidthPx: 2,
    edgeLineWidthPx: 2,
    fuelBar: { x: 4, y: 4, w: 80, h: 5 },
    /* Cup shiver rate. Purely visual. */
    coffeeJiggleHz: 6
  },

  /* City palette, roughly 11 colors. Cheerful, high contrast. */
  palette: {
    city: {
      outline: '#262b44',
      offroad: '#7ec850',
      road: '#5a5a6e',
      dash: '#f4f4f4',
      edgeLine: '#ffd93d',
      carBody: '#e43b44',
      carDark: '#9e2835',
      carWindow: '#5fcde4',
      tire: '#1a1c2c',
      text: '#f4f4f4',
      dim: 'rgba(26, 28, 44, 0.6)'
    }
  }
};

/*
  Vehicle and environment configs. One of each is real in this slice.
  The locked entries exist so the select screens exercise the config
  driven structure from day one. Adding a vehicle later must be a new
  entry here plus art, never a logic change.
*/

export const VEHICLES = {
  sports: {
    id: 'sports',
    name: 'Sports car',
    hitbox: { wPx: 20, hPx: 36 },
    laneTweenMs: TUNING.movement.laneTweenMs,
    baseSpeedMultiplier: 1,
    fuelBurnMultiplier: 1,
    boostMultiplier: 1.6,
    spriteKey: 'player_car',
    locked: false
  },
  suv: { id: 'suv', name: '4x4 SUV', locked: true },
  moto: { id: 'moto', name: 'Motorcycle', locked: true }
};

export const ENVIRONMENTS = {
  city: {
    id: 'city',
    name: 'City',
    paletteKey: 'city',
    parallaxLayers: ['skyline', 'buildings', 'roadside'],
    obstacleWeights: { stalled: 0.5, slick: 0.25, rubble: 0.25 },
    musicKey: 'music_loop',
    locked: false
  },
  desert: { id: 'desert', name: 'Desert', locked: true },
  mountain: { id: 'mountain', name: 'Mountain', locked: true },
  beach: { id: 'beach', name: 'Beach', locked: true }
};
