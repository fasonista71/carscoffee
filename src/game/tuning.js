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
    horizonPx: 560,
    /* How far behind the car obstacles are removed. */
    despawnBehindPx: 120,
    /* Human time to notice a pattern before having to act. Feeds the
       fairness gap between obstacle rows. GUESS. */
    reactionBufferMs: 260,
    /* Total forgiveness subtracted from combined half extents, so
       near misses feel like near misses. GUESS. Collision boxes are
       per variant now; see TRAFFIC_VARIANTS below. */
    hitboxShrinkPx: 4
  },

  traffic: {
    /* Rear traffic slows to match the row ahead this many px before
       that pair's minimum gap would be violated. Keeps moving rows
       from ever bunching into an unfair wall. */
    clampMarginPx: 12,
    /* Clusters: rows may pack bumper to bumper when a guaranteed open
       corridor runs through them (every corridor lane stays open), so
       traffic reads crowded without ever demanding a lane change
       there is no room to make. */
    clusterMaxLen: 6,
    /* When continuing a cluster, incompatible lane patterns are
       rerolled up to this many extra times. Keeps clusters long and
       the road crowded. */
    clusterRerolls: 2,
    tightExtraGapPx: 8
  },

  /*
    Difficulty tiers, entered at distance milestones. Each tier sets
    the dials that make the road harder: scroll speed, how loose the
    gaps run, how often rows force a single lane, how much traffic
    clusters, how mixed the traffic speeds are, and how few rows sit
    still. Passive fuel drain scales with the tier's speed. Tier
    transitions ramp the speed over about two seconds rather than
    stepping it, and announce themselves with a banner and flash.
    All values are GUESSES to be tuned by feel.
  */
  tiers: [
    { atMeters: 0,    speed: 1.0,  gapJitterMax: 1.35, doubleRowChance: 0.42, clusterChance: 0.8,  stalledChance: 0.3,  speedFracMin: 0.12, speedFracMax: 0.62 },
    { atMeters: 300,  speed: 1.12, gapJitterMax: 1.3,  doubleRowChance: 0.46, clusterChance: 0.84, stalledChance: 0.28, speedFracMin: 0.1,  speedFracMax: 0.66 },
    { atMeters: 700,  speed: 1.25, gapJitterMax: 1.26, doubleRowChance: 0.5,  clusterChance: 0.87, stalledChance: 0.26, speedFracMin: 0.08, speedFracMax: 0.7 },
    { atMeters: 1200, speed: 1.4,  gapJitterMax: 1.22, doubleRowChance: 0.54, clusterChance: 0.9,  stalledChance: 0.24, speedFracMin: 0.06, speedFracMax: 0.72 },
    { atMeters: 1800, speed: 1.56, gapJitterMax: 1.18, doubleRowChance: 0.58, clusterChance: 0.92, stalledChance: 0.22, speedFracMin: 0.05, speedFracMax: 0.74 },
    { atMeters: 2600, speed: 1.75, gapJitterMax: 1.15, doubleRowChance: 0.62, clusterChance: 0.94, stalledChance: 0.2,  speedFracMin: 0.04, speedFracMax: 0.75 }
  ],
  /* Per frame step toward a new tier's speed multiplier. At 0.003 a
     12 percent tier jump ramps over roughly 40 frames. GUESS. */
  tierRampPerFrame: 0.003,

  hazards: {
    /* Chance a full gap (never a cluster interior) carries a hazard.
       GUESS. */
    spawnChancePerGap: 0.3,
    slick: {
      hitbox: { wPx: 26, hPx: 12 },
      /* Steering is gone for this long after the forced slide begins.
         Brief says roughly 0.8s. */
      slideLockMs: 800
    },
    rubble: {
      hitbox: { wPx: 18, hPx: 12 },
      fuelCost: 12,
      /* Brief: a brief speed loss, which costs score. GUESSES. */
      slowMs: 750,
      slowFactor: 0.6
    }
  },

  stumble: {
    /* One free lethal contact per run: spin, speed drop, and this
       much blinking invulnerability. Brief says roughly 1.2s. */
    invulnMs: 1200,
    spinMs: 750,
    slowMs: 1000
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
    /* Chance each spawned row brings a cup with it. Lowered from
       0.35 so fuel pressure bites harder. GUESS. */
    spawnChancePerRow: 0.22,
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
    /* Centered cartoon gauge: cup icon plus capsule bar. */
    fuelBar: { wPx: 96, hPx: 8, yPx: 8, cupGapPx: 3 },
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
      dim: 'rgba(26, 28, 44, 0.6)',
      slick: '#241839',
      slickArrow: '#8d7ae0',
      rubbleLight: '#b3a58c',
      rubbleMid: '#8a7a66',
      rubbleDark: '#5c5044',
      heartEmpty: '#3a3f52'
    }
  }
};

/*
  Vehicle and environment configs. One of each is real in this slice.
  The locked entries exist so the select screens exercise the config
  driven structure from day one. Adding a vehicle later must be a new
  entry here plus art, never a logic change.
*/

/*
  The traffic pool: every usable vehicle frame in the sheet, with its
  true size as its collision box, so a truck occupies its visual
  length and a bike is as small as it looks. Excluded on purpose:
  the taxi family (cut by request), the dumptruck (wider than a
  lane), the porsche (it is the player), the motorcycles and the junk
  bed pickups (cut by request). Render maps sprite names
  to atlas frames; the generator picks by index with an anti repeat
  memory so neighbors rarely match.
*/
export const TRAFFIC_VARIANTS = [
  { sprite: 'tow_truck', wPx: 33, hPx: 70 },
  { sprite: 'tow_truck2', wPx: 33, hPx: 70 },
  { sprite: 'tow_truck3', wPx: 33, hPx: 69 },
  { sprite: 'truck2', wPx: 33, hPx: 66 },
  { sprite: 'truck3', wPx: 33, hPx: 66 },
  { sprite: 'landcruiser', wPx: 29, hPx: 56 },
  { sprite: 'landcruiser2', wPx: 29, hPx: 56 },
  { sprite: 'landcruiser3', wPx: 29, hPx: 56 },
  { sprite: 'van', wPx: 29, hPx: 56 },
  { sprite: 'raptor', wPx: 28, hPx: 55 },
  { sprite: 'raptor2', wPx: 28, hPx: 55 },
  { sprite: 'pickup', wPx: 28, hPx: 51 },
  { sprite: 'suv', wPx: 28, hPx: 50 },
  { sprite: 'suv2', wPx: 28, hPx: 50 },
  { sprite: 'van2', wPx: 27, hPx: 50 },
  { sprite: 'van3', wPx: 27, hPx: 50 },
  { sprite: 'mustang2', wPx: 26, hPx: 49 },
  { sprite: 'mustang3', wPx: 26, hPx: 47 },
  { sprite: 'camaro', wPx: 26, hPx: 48 },
  { sprite: 'camaro2', wPx: 26, hPx: 48 },
  { sprite: 'challenger2', wPx: 28, hPx: 48 },
  { sprite: 'challenger3', wPx: 28, hPx: 48 },
  { sprite: 'lexus', wPx: 26, hPx: 48 },
  { sprite: 'lexus2', wPx: 26, hPx: 48 },
  { sprite: 'lexus3', wPx: 26, hPx: 48 },
  { sprite: 'gwagon', wPx: 27, hPx: 47 },
  { sprite: 'gwagon2', wPx: 27, hPx: 47 },
  { sprite: 'patrol', wPx: 27, hPx: 47 },
  { sprite: 'patrol2', wPx: 27, hPx: 47 },
  { sprite: 'bmw', wPx: 25, hPx: 47 },
  { sprite: 'bmw2', wPx: 25, hPx: 47 },
  { sprite: 'bmw3', wPx: 25, hPx: 47 },
  { sprite: 'lancer', wPx: 26, hPx: 47 },
  { sprite: 'lancer2', wPx: 26, hPx: 47 },
  { sprite: 'lambo', wPx: 27, hPx: 46 },
  { sprite: 'lambo2', wPx: 27, hPx: 46 },
  { sprite: 'wrangler', wPx: 24, hPx: 46 },
  { sprite: 'wrangler2', wPx: 24, hPx: 46 },
  { sprite: 'wrangler3', wPx: 24, hPx: 46 },
  { sprite: 'wrangler4', wPx: 24, hPx: 46 },
  { sprite: 'sunny', wPx: 25, hPx: 45 },
  { sprite: 'tida', wPx: 24, hPx: 43 },
  { sprite: 'tida2', wPx: 24, hPx: 43 },
  { sprite: 'tida3', wPx: 24, hPx: 43 },
  { sprite: 'mini', wPx: 24, hPx: 42 },
  { sprite: 'convertible', wPx: 24, hPx: 41 },
  { sprite: 'figo', wPx: 24, hPx: 41 },
  { sprite: 'figo2', wPx: 24, hPx: 41 }
];

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
