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
    /* Finger travel in CSS px before a touch becomes a swipe. GUESS. */
    swipeThresholdPx: 24,
    /* A press and release under this duration counts as a tap. GUESS. */
    tapMaxMs: 250
  },

  render: {
    logicalW: 180,
    logicalH: 320,
    /* Vertical center of the player sprite on the logical screen. */
    playerYPx: 252,
    dashLengthPx: 12,
    dashGapPx: 12,
    dashWidthPx: 2,
    edgeLineWidthPx: 2
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
    hitbox: { wPx: 12, hPx: 20 },
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
