/* Shown small on the title screen so a stale phone cache is visible
   at a glance. Bump when shipping. */
export const BUILD_TAG = 'M9';

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
    /* Lane change duration. Started at the brief's 120; raised after
       device testing read the change as an abrupt snap. Combined with
       the smoothstep easing in entities.js this is what makes the
       shift feel organic. GUESS. */
    laneTweenMs: 170,
    /* Exactly one input may queue during a tween. Brief requirement. */
    maxQueuedInputs: 1
  },

  speed: {
    /* Scroll speed of the world in logical px per second. Raised
       from 150 after device testing: the road wanted more urgency at
       every tier, and the tier multipliers ride on top of this. */
    basePxPerSec: 165,
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
    /* How far ahead of the car the generator stays: at least this
       many px, and at least horizonSecs of travel at current speed,
       so fast tiers still have room to seed slicks with their full
       recovery offsets. */
    horizonPx: 560,
    horizonSecs: 3.2,
    /* How far behind the car obstacles are removed. */
    despawnBehindPx: 120,
    /* Human time to notice a pattern before having to act. Feeds the
       fairness gap between obstacle rows. GUESS. */
    reactionBufferMs: 230,
    /* Total forgiveness subtracted from combined half extents, so
       near misses feel like near misses. GUESS. Collision boxes are
       per variant now; see TRAFFIC_VARIANTS below. */
    hitboxShrinkPx: 4,
    /* Movement is the game, so camping the center lane must not pay.
       Single rows block the center this much more often than an edge,
       and double rows leave an edge open more often than the center.
       Because cluster corridors inherit from these rows, the bias
       cascades into whole clusters. GUESSES. */
    laneBlockWeights: [0.28, 0.44, 0.28],
    doubleOpenWeights: [0.4, 0.2, 0.4]
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
    clusterMaxLen: 7,
    /* When continuing a cluster, incompatible lane patterns are
       rerolled up to this many extra times. Keeps clusters long and
       the road crowded. Raised from 2 when the tight rule got
       stricter (open lanes may never narrow inside a cluster), which
       rejects more rolls. */
    clusterRerolls: 4,
    tightExtraGapPx: 8,
    /* Organic packs: each car in a row slides up to this far forward
       or back of the row line, so clusters stagger like real traffic
       instead of marching in ranks. Fairness stays intact because
       every row's stored extent is inflated by the full stagger span;
       collisions use the exact per car positions. */
    staggerMaxPx: 10,
    /* Bumper gap variance inside a cluster, as a fraction above the
       tight minimum. Wider than the old 0.35 so pack spacing reads
       ragged and natural. */
    tightGapJitterSpan: 0.6,
    /* Breakdowns. Stopped dead is no longer routine: rows that roll
       stalled crawl at the tier's slowest fraction instead. Roughly
       every breakdownEveryMeters (jittered so it stays a surprise,
       like the overtakers), the next full gap single car row stops
       dead with its hazard flashers on. Single car only, never
       inside a pack, so two flashing cars never sit together. */
    breakdownEveryMeters: 500,
    breakdownJitterFrac: 0.5
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
  /*
    aggro: the share of full gap rows that deliberately target the
    player, dropping a single block onto the player's lane or opening
    a forced row's lane far from the player. Movement is the game;
    aggro is what makes sitting still lose. Pass frequency is no
    longer a tier field; it is scheduled by distance in overtakers.
  */
  tiers: [
    { atMeters: 0,    theme: 'mountain', speed: 1.0,  gapJitterMax: 1.35, doubleRowChance: 0.42, clusterChance: 0.80, stalledChance: 0.30, speedFracMin: 0.12, speedFracMax: 0.62, aggro: 0.22 },
    { atMeters: 1000, theme: 'farmland', speed: 1.1,  gapJitterMax: 1.32, doubleRowChance: 0.44, clusterChance: 0.82, stalledChance: 0.29, speedFracMin: 0.11, speedFracMax: 0.64, aggro: 0.27 },
    { atMeters: 2000, theme: 'desert',   speed: 1.2,  gapJitterMax: 1.29, doubleRowChance: 0.46, clusterChance: 0.84, stalledChance: 0.28, speedFracMin: 0.10, speedFracMax: 0.66, aggro: 0.32 },
    { atMeters: 3000, theme: 'volcanic', speed: 1.31, gapJitterMax: 1.26, doubleRowChance: 0.48, clusterChance: 0.86, stalledChance: 0.27, speedFracMin: 0.09, speedFracMax: 0.68, aggro: 0.37 },
    { atMeters: 4000, theme: 'snow',     speed: 1.42, gapJitterMax: 1.24, doubleRowChance: 0.50, clusterChance: 0.87, stalledChance: 0.26, speedFracMin: 0.08, speedFracMax: 0.70, aggro: 0.42 },
    { atMeters: 5000, theme: 'forest',   speed: 1.53, gapJitterMax: 1.22, doubleRowChance: 0.52, clusterChance: 0.89, stalledChance: 0.25, speedFracMin: 0.07, speedFracMax: 0.71, aggro: 0.46 },
    { atMeters: 6000, theme: 'beach',    speed: 1.64, gapJitterMax: 1.20, doubleRowChance: 0.54, clusterChance: 0.90, stalledChance: 0.24, speedFracMin: 0.06, speedFracMax: 0.72, aggro: 0.50 },
    /* Speed stops here on purpose. Everything past this point changes
       what the road is made of, not how fast it comes at you: the
       ceiling has to be reachable or the game turns into a reaction
       time test and casual players leave. */
    { atMeters: 7000, theme: 'cliffs',   speed: 1.75, gapJitterMax: 1.18, doubleRowChance: 0.56, clusterChance: 0.91, stalledChance: 0.23, speedFracMin: 0.05, speedFracMax: 0.73, aggro: 0.54 },
    { atMeters: 8000, theme: 'city',     speed: 1.75, gapJitterMax: 1.16, doubleRowChance: 0.58, clusterChance: 0.92, stalledChance: 0.22, speedFracMin: 0.05, speedFracMax: 0.74, aggro: 0.58 },
    { atMeters: 9000, theme: 'forest',   speed: 1.75, gapJitterMax: 1.15, doubleRowChance: 0.60, clusterChance: 0.93, stalledChance: 0.21, speedFracMin: 0.04, speedFracMax: 0.75, aggro: 0.62 }
  ],
  /* Per frame step toward a new tier's speed multiplier. At 0.003 a
     12 percent tier jump ramps over roughly 40 frames. GUESS. */
  tierRampPerFrame: 0.003,

  hazards: {
    /* Chance a full gap (never a cluster interior) carries a hazard.
       Raised from 0.3: traffic smears away a share of slicks, so the
       spawn rate compensates. GUESS. */
    spawnChancePerGap: 0.4,
    slick: {
      /* Grown from 26x12 after device feedback: it needs to read
         instantly at speed. */
      hitbox: { wPx: 30, hPx: 14 },
      /* Steering is gone for this long after the forced slide begins.
         Brief says roughly 0.8s. */
      slideLockMs: 800,
      /* A slick claims a gap big enough for its recovery guarantee
         (this much beyond the computed recovery), instead of waiting
         for one to be rolled by luck. Without this, slicks almost
         never find a legal home. */
      gapClaimExtraPx: 90,
      /* The brief's classic: a cup just past the slick in its lane,
         so the safe line and the fueled line differ. */
      cupChance: 0.5,
      cupAheadPx: 55,
      /* Traffic that drives over a slick smears it away (culled when
         a row overlaps within this range), and a slick refuses to
         fire its slide unless the target lane is clear for the lock
         distance plus this margin. Both guards exist because moving
         traffic can rearrange itself around a static puddle after
         spawn time checks have passed. */
      cullOverlapPx: 60,
      guardExtraPx: 40
    },
    rubble: {
      hitbox: { wPx: 22, hPx: 14 },
      fuelCost: 12,
      /* Brief: a brief speed loss, which costs score. GUESSES. */
      slowMs: 750,
      slowFactor: 0.6
    }
  },

  overtakers: {
    /* Sports cars that catch up from behind and speed past. How
       often is scheduled by distance (see the pacing note below);
       speed, lane and spawn distance vary per car so no two passes
       feel alike. */
    speedMultMin: 1.7,
    speedMultMax: 2.6,
    spawnBehindPx: 400,
    spawnBehindJitter: 0.5,
    despawnAheadPx: 380,
    /* How far behind the player the pass vetting reaches. Ahead of
       the player EVERY existing row is vetted, because a slow speeder
       stays on the road long enough to catch rows far out; rows
       spawned during the pass are steered off its lane instead. */
    clearLanePx: 400,
    /* How long a merging car takes to slide into the middle lane,
       and how far ahead of the player a car must be to be allowed to
       start that merge: closer than this and it would land in the
       player's face with no time to read it. There is no shoulder;
       cars that cannot merge into a lane (breakdowns, packed
       clusters, too close) simply block the pass from spawning. */
    yieldMs: 600,
    yieldMinAheadPx: 240,
    /* Never spawn when, within this many seconds around the pass,
       any row's guaranteed corridor collapses to the overtaker's
       lane. Clusters can pin the player to their corridor, so the
       guard checks corridors, not just single rows. */
    squeezeGuardSec: 1.2,
    /*
      Pacing is measured in road, not in dice. A pass was a per second
      probability, which made passes arrive every few seconds and made
      the rate swing with the tier table; now the schedule is one pass
      per passEveryMeters of odometer, give or take passJitter, and
      the first one waits until firstPassAtMeters so the opening
      stretch stays calm. Because the clock is distance, a pass costs
      the same road at every tier but less wall time as the car speeds
      up, which is the busier feel later tiers want, for free.

      A blocked attempt (no clear lane, traffic that cannot yield)
      does not burn the slot: the scheduler keeps retrying once a
      second until one lands, then measures the next gap from there.
    */
    passEveryMeters: 420,
    passJitter: 0.4,
    firstPassAtMeters: 1000,
    /* Pursuits: this share of passes bring the law along. The
       emergency vehicle only ever CHASES, riding chaseGapPx behind
       the speeder in the same lane, wig wag lights going, one longer
       two car pass. The three unit fleet lives in world.js: blue
       truck as SWAT van, red truck as fire truck, blue car as
       police; swap those sprites when real assets arrive. Exactly
       one pass event runs at a time (a lone speeder or one pursuit
       pair); the next cannot start until it is over. The number
       reads high for "one in four" because the floor below rejects
       some of these rolls; measured over 24 seeds the law actually
       turns up every 2085m (median), which is the target. */
    emergencyChance: 0.34,
    /* Share of the remaining passes that are an ambulance or a fire
       truck running alone on a call rather than a sports car. Same
       mechanics as any pass, different sprite and a siren, so it
       costs nothing to run and it is the only thing those two
       vehicles do now that they are out of traffic. */
    soloCallChance: 0.12,
    /* An independent one in four roll produces clumps: two pursuits
       485m apart happened in a tenth of cases, which reads as the law
       being everywhere rather than rare. A hard floor between chases
       turns "rare on average" into "rare as experienced", which is
       the thing actually being asked for. */
    emergencyMinGapMeters: 1200,
    chaseGapPx: 90
  },

  nitro: {
    /* A bottle on the road that banks a free boost: full duration, no
       coffee burned, and usable below the fuel floor that normally
       gates one. That last part is the point. Boost is the escape
       move, and the moment you most need one is the moment you can
       least afford it. Banked rather than fired on pickup, because
       every gap on this road is sized against the speed the player
       will be doing, and that model only holds while boosting is a
       choice. */
    pickupChancePerGap: 0.05,
    /* Charges bank rather than firing on pickup, so holding two is
       possible; more than that and the road stops mattering. */
    maxCharges: 2,
    hitbox: { wPx: 12, hPx: 14 }
  },

  tips: {
    /* One time teaching moments. coffeeLeadPx is how far ahead of the
       player the first cup has to be for the tip to fire: far enough
       that the player can still act on it, close enough that the cup
       is clearly on screen and obviously the thing being pointed at.
       The ceiling is playerYPx (252): a cup further ahead than that
       has not entered the frame yet, and 260 put the callout under
       the HUD band with its top line cut off. At 200 the cup sits
       about 10px below the band with the whole callout in clear
       road. showMs is how long it stays up afterwards. */
    coffeeLeadPx: 200,
    coffeeShowMs: 3200,
    /*
      The control lessons. Nothing in the product ever told a player
      how to steer: every string the game can show was extracted and
      not one mentioned tapping, swiping or lanes. Left and right get
      found by flailing on a three lane runner; swipe up to boost does
      not, and the BOOST! prompt appears over the car without saying
      what to do about it.

      Both are taught at the moment they first matter, in the same
      callout language as the coffee lesson, once each per browser.
      steerShowMs is how long the steering callout hangs about on a run
      that never uses it: long enough to read twice, short enough that
      it is not still there when the first row arrives.
    */
    steerShowMs: 5000,
    /* Time a lesson has to be genuinely on screen before it counts as
       taught. The same budget the coffee lesson is spent on. */
    readMs: 1200
  },

  stumble: {
    /* The forgiveness treatment a spent heart buys: spin, speed
       drop, and this much blinking invulnerability. */
    invulnMs: 1200,
    spinMs: 750,
    slowMs: 1000
  },

  lives: {
    /* Three hearts per run. A lethal contact spends one with the
       stumble treatment; the last heart ends the run. Hearts also
       appear on the road as rare pickups, like coffee. */
    start: 3,
    max: 3,
    /* Heart pickups only appear once at least two hearts are spent;
       until then the road never offers a refill. */
    minSpentForPickup: 2,
    pickupChancePerGap: 0.07,
    hitbox: { wPx: 14, hPx: 12 }
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
       separate cooldown, no extension while active. Grown from
       1200ms at 1.45x: the boost is the escape move when a speeder
       owns your lane, so it has to cover real road. The multiplier
       stays under the slowest overtaker (1.7) so the pass guard's
       closing speed math never degenerates. */
    durationMs: 2000,
    speedMultiplier: 1.65,
    minFuel: 10
  },

  coffee: {
    /* Chance each spawned row brings a cup with it. Went 0.35 to
       0.22 to make fuel bite, then back up to 0.32 once the faster
       base speed made the old rate feel starved. Flat across tiers
       for now; per tier rates are the obvious next step. */
    spawnChancePerRow: 0.32,
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
    /* The shaded HUD band across the top: two rows. Row one holds the
       distance and best plates with double size chunky digits, row
       two holds the fuel gauge, stumble heart, and boost pill. */
    hudBandHPx: 42,
    /* Row one: distance plate, the three hearts centered, best
       plate. Row two: coffee gauge on the left two thirds, labeled
       boost meter on the right third. */
    /* labelWPx is the footprint of the word to the left of the gauge.
       The bar shrank from 84 to make room for it, keeping the boost
       pill in exactly the same place. */
    fuelBar: { wPx: 77, hPx: 8, yPx: 28, labelWPx: 26 },
    hudPlate: { wPx: 50, hPx: 17, yPx: 3, marginPx: 2 },
    /* The pause control, top right, where a phone game puts it. The
       plate is 18 wide but the tap target is the whole corner of the
       band: 26 by 42 logical, which is 52 by 84 CSS at the 2x scale a
       phone reaches, so it clears the 44pt minimum on both axes. The
       target is bounded in y as well as x on purpose, because a tap
       resolves to a lane by its x alone, and a player steering by
       tapping the right hand lane must not pause instead. */
    pauseBtn: { wPx: 18, hPx: 17, hitWPx: 26 },
    /* The best score is narrower than the distance beside it: five
       digits at double size is 38px, where the distance carries an M
       as well and needs 46. Giving it its own width is what lets both
       corner buttons and both plates share a 180px row. */
    hudHighPlate: { wPx: 42 },
    boostPill: { wPx: 42, hPx: 8 },
    /* Menu layout: one primary button plus option rows, hit tested in
       logical coordinates. Restart taps are ignored for a beat after
       a menu opens, so a frantic last tap cannot start a new run. */
    /* The title screen's bottom band. The board used to sit at a
       constant y whatever the menu above it did, which left a 29px
       void under Sound on iOS, where there is no Rumble row, and
       butted the board flush against Rumble's outline on Android. It
       now hangs off the last row, and is pulled back up when a full
       board would otherwise run off the bottom of a 320px screen. */
    boardGapPx: 10,
    boardBottomMarginPx: 4,
    /* How long the car you just chose is held up where you can see
       it. The title screen has no spare room for a permanent preview
       (the badge takes the top 130px and the menu the next 120), and
       the live car at playerYPx sits behind the option rows and the
       board, so about five pixels of it were visible. Cycling the car
       now puts it on a plate in the board's place for a beat. */
    carPreviewMs: 1400,
    /*
      Boost used to grow a pair of flames out of the back of the car,
      which is a rocket, not a car. It leaves rubber instead: two marks
      laid under the rear wheels and left on the road behind, darkest
      at the moment of the launch and thinning as the boost settles,
      the way wheelspin actually goes. trackPx is the distance from the
      car's centre line to each wheel.
    */
    skid: { trackPx: 7, wPx: 2, lenPx: 2, fadeMs: 800, maxAlpha: 0.85 },
    /* Where the car waits on the title screen: on the road below the
       last menu row, framed, this far off the bottom edge. It does not
       move while it is there, so choosing a car never makes it jump.
       On a layout with a Rumble row there is not this much room, and
       the frame tucks under the row rather than running off the
       bottom. */
    titleCarBottomPx: 22,
    /* And the drive up when a run starts, from wherever the car was
       last drawn to the driving position. Short enough that it is a
       start rather than a cutscene, and it happens before the first
       row can be anywhere near the player. */
    runIntroMs: 420,
    menu: {
      /* Sized so buttons meet the 44 point minimum touch target on a
         phone at 2x logical scale, plus padded hit testing. */
      primary: { wPx: 108, hPx: 26 },
      option: { wPx: 140, hPx: 22, gapPx: 7 },
      /* Clearance above a destructive row (Restart). The ordinary gap
         of 7 is smaller than twice the hit pad, which left one pixel
         between a toggle and an irreversible run ender. */
      destructiveGapPx: 18,
      hitPadPx: 6,
      /* The minimum a finger should meet, in CSS pixels, which is what
         44 points means on both platforms. The pad grows to hold this
         when the integer scale drops the whole interface a step. */
      minTargetCssPx: 44,
      cooldownMs: 350
    },
    /* Cup shiver rate. Purely visual. */
    coffeeJiggleHz: 6,
    /* Blink period for the boost prompt (label, pill ring, and the
       BOOST! callout over the car). Purely visual. */
    boostHintBlinkMs: 130,
    /* The gauge label alternates COFFEE and LOW while the tank is
       under fuel.lowThreshold. Slower than the boost prompt: this is a
       warning to read, not a prompt to act on this instant. */
    lowBlinkMs: 450,
    /* Stopped cars run their hazard flashers at this period, each row
       phase shifted so the road never blinks in unison. Visual. */
    hazardBlinkMs: 460,
    /* Emergency roof lights alternate sides at this period. Visual. */
    wigWagMs: 140,
    /* Where the light bar sits on each emergency sprite, as a
       fraction of sprite height from the top. Measured off the new
       art rather than guessed: the three police cars all carry their
       painted bar at 0.44 to 0.46, the SWAT van at 0.30, the
       ambulance at 0.08 and the fire truck at 0.11, so the animated
       wig wag lands on the bar that is already drawn. */
    wigWagRoofFrac: { default: 0.45, swat: 0.30, ambulance: 0.08, fire_truck: 0.11 },
    /* Roadside parallax: the far band scrolls slower than the road,
       the near band rides with it. */
    scenery: { farFactor: 0.55, periodPx: 56 }
  },

  /*
    Scenery themes, one per tier: the run climbs from mountain roads
    through desert, snow, and beach into the cityscape. Colors only;
    the drawing styles live in render.
  */
  sceneryThemes: {
    mountain: { farDensity: 85, nearDensity: 70, farItem: 'peak',     nearItem: 'pine',     offroad: '#79b364', far: '#8a93a6', farDark: '#6e7789', farAccent: '#f4f4f4', near: '#3f7a3a', nearDark: '#2f5c2c', trunk: '#7a5a3a' },
    farmland: { farDensity: 32, nearDensity: 42, farItem: 'barn',     nearItem: 'cow',      offroad: '#8fbf5a', far: '#b4553f', farDark: '#8c3f2e', farAccent: '#f4f4f4', near: '#5aa03f', nearDark: '#2c3a28', trunk: '#8c6a3f' },
    desert:   { farDensity: 55, nearDensity: 58, farItem: 'mesa',     nearItem: 'cactus',   offroad: '#ddba75', far: '#b97e4b', farDark: '#94603a', farAccent: '#d19a63', near: '#4e9e3f', nearDark: '#3c7a31', trunk: '#4e9e3f' },
    volcanic: { farDensity: 34, nearDensity: 62, farItem: 'volcano',  nearItem: 'lavarock', offroad: '#4a4046', far: '#5a4a52', farDark: '#3d3239', farAccent: '#ff6b35', near: '#6b5b62', nearDark: '#463b41', trunk: '#ffb937' },
    snow:     { farDensity: 85, nearDensity: 58, farItem: 'snowpeak', nearItem: 'snowfront',     offroad: '#e9edf4', far: '#c7d0dd', farDark: '#a6b1c2', farAccent: '#ffffff', near: '#2f5c4a', nearDark: '#234636', trunk: '#5a4632' },
    forest:   { farDensity: 80, nearDensity: 88, farItem: 'peak',     nearItem: 'pine',     offroad: '#3f7a3a', far: '#2f5c4a', farDark: '#234636', farAccent: '#4e9e3f', near: '#2f6b2c', nearDark: '#1f4a1e', trunk: '#5a4632' },
    beach:    { farDensity: 100, nearDensity: 54, farItem: 'water',    nearItem: 'beachfront',     offroad: '#ecd493', far: '#3f9edb', farDark: '#2f7fb8', farAccent: '#f4f4f4', near: '#3f8a3a', nearDark: '#2f6b2c', trunk: '#8a6238' },
    cliffs:   { farDensity: 72, nearDensity: 58, farItem: 'mesa',     nearItem: 'scrub',    offroad: '#b9b0a0', far: '#9a8a78', farDark: '#786a5c', farAccent: '#cdbfa8', near: '#6b8a4f', nearDark: '#4f6b39', trunk: '#8a7a68' },
    city:     { farDensity: 78, nearDensity: 52, farItem: 'building', nearItem: 'treeblob', offroad: '#adadb8', far: '#8f9ab8', farDark: '#717c9c', farAccent: '#f4f4f4', near: '#4e9e3f', nearDark: '#3c7a31', trunk: '#7a5a3a' }
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
      hudBand: 'rgba(26, 28, 44, 0.55)',
      /* Rubber on tarmac: darker than the road, lighter than the
         outline, so a mark reads as a mark rather than as a hole. */
      skidMark: '#33334a',
      building: '#9aa7c4',
      buildingDark: '#7c88a6',
      tree: '#4e9e3f',
      treeDark: '#3c7a31',
      slick: '#241839',
      slickSheen: '#43306b',
      slickArrow: '#c2b1ff',
      hazardLight: '#ffb937',
      wigWagRed: '#ff2a2a',
      wigWagRedDim: '#701414',
      wigWagBlue: '#2a6aff',
      wigWagBlueDim: '#142d70',
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
/*
  Atlas frames the player's own cars wear. These are deliberately
  absent from TRAFFIC_VARIANTS, so no other car on the road can ever
  be drawn in the player's bodywork and a pursuit can never look like
  the police are chasing you. The filter in world.js is a second
  guard on the same rule. Keep in step with ALIASES in
  src/render/sprites.js.
*/
/*
  The faces a rubble hazard can wear. One hitbox, one cost, eleven
  looks: the road stopped reading as the same grey lump every time
  without a single gameplay number moving. Index into this comes from
  the row spec's artRoll.
*/
export const OBSTACLE_SPRITES = [
  'obs_rubble', 'obs_cone', 'obs_barrier', 'obs_tire', 'obs_box',
  'obs_drum', 'obs_pallet', 'obs_roadwork', 'obs_spikes', 'obs_log',
  'obs_crate'
];

export const PLAYER_SPRITES = ['fourbyfour', 'sport_coupe', 'classic'];

export const TRAFFIC_VARIANTS = [
  /*
    Civilian traffic. pickVariant only ever deals inside this run.

    model is the bodyshell; sprite is the paint. Twenty bodies carry
    forty seven sprites, because repainting a car is free and drawing
    one is not. The distinction earns its keep in the picker: two
    muscle cars in adjacent lanes read as a repeat even in different
    colours, so the no-repeat memory works on model, not on sprite.

    Three groups are absent by design. The player's own three cars,
    because seeing the model you are driving in the next lane reads as
    a glitch. The police, ambulance and fire truck, because an
    emergency vehicle should mean something is happening. And nothing
    whose colour is information is ever repainted: no blue taxis, no
    green fire trucks.
  */
  { sprite: 'sport_white',        wPx: 27, hPx: 46, model: 'sport_white' },
  { sprite: 'sport_white_blue',   wPx: 27, hPx: 46, model: 'sport_white' },
  { sprite: 'sport_white_rose',   wPx: 27, hPx: 46, model: 'sport_white' },
  { sprite: 'sport_white_green',  wPx: 27, hPx: 46, model: 'sport_white' },
  { sprite: 'muscle',             wPx: 27, hPx: 48, model: 'muscle' },
  { sprite: 'muscle_red',         wPx: 27, hPx: 48, model: 'muscle' },
  { sprite: 'muscle_blue',        wPx: 27, hPx: 48, model: 'muscle' },
  { sprite: 'muscle_lime',        wPx: 27, hPx: 48, model: 'muscle' },
  { sprite: 'super_car',          wPx: 27, hPx: 46, model: 'super_car' },
  { sprite: 'super_car_green',    wPx: 27, hPx: 46, model: 'super_car' },
  { sprite: 'super_car_cyan',     wPx: 27, hPx: 46, model: 'super_car' },
  { sprite: 'super_car_plum',     wPx: 27, hPx: 46, model: 'super_car' },
  { sprite: 'hot_hatch',          wPx: 26, hPx: 44, model: 'hot_hatch' },
  { sprite: 'hot_hatch_amber',    wPx: 26, hPx: 44, model: 'hot_hatch' },
  { sprite: 'hot_hatch_teal',     wPx: 26, hPx: 44, model: 'hot_hatch' },
  { sprite: 'hot_hatch_indigo',   wPx: 26, hPx: 44, model: 'hot_hatch' },
  { sprite: 'pickup',             wPx: 29, hPx: 56, model: 'pickup' },
  { sprite: 'pickup_green',       wPx: 29, hPx: 56, model: 'pickup' },
  { sprite: 'pickup_blue',        wPx: 29, hPx: 56, model: 'pickup' },
  { sprite: 'pickup_amber',       wPx: 29, hPx: 56, model: 'pickup' },
  { sprite: 'van',                wPx: 29, hPx: 56, model: 'van' },
  { sprite: 'van_blue',           wPx: 29, hPx: 56, model: 'van' },
  { sprite: 'van_amber',          wPx: 29, hPx: 56, model: 'van' },
  { sprite: 'van_teal',           wPx: 29, hPx: 56, model: 'van' },
  { sprite: 'wagon',              wPx: 28, hPx: 52, model: 'wagon' },
  { sprite: 'wagon_cyan',         wPx: 28, hPx: 52, model: 'wagon' },
  { sprite: 'wagon_orange',       wPx: 28, hPx: 52, model: 'wagon' },
  { sprite: 'wagon_green',        wPx: 28, hPx: 52, model: 'wagon' },
  { sprite: 'camper',             wPx: 29, hPx: 62, model: 'camper' },
  { sprite: 'camper_blue',        wPx: 29, hPx: 62, model: 'camper' },
  { sprite: 'camper_green',       wPx: 29, hPx: 62, model: 'camper' },
  { sprite: 'camper_red',         wPx: 29, hPx: 62, model: 'camper' },
  { sprite: 'suv',                wPx: 29, hPx: 56, model: 'suv' },
  { sprite: 'suv_blue',           wPx: 29, hPx: 56, model: 'suv' },
  { sprite: 'suv_green',          wPx: 29, hPx: 56, model: 'suv' },
  { sprite: 'suv_amber',          wPx: 29, hPx: 56, model: 'suv' },
  { sprite: 'roadster',           wPx: 26, hPx: 44, model: 'roadster' },
  { sprite: 'rally',              wPx: 27, hPx: 46, model: 'rally' },
  { sprite: 'luxury_sedan',       wPx: 27, hPx: 48, model: 'luxury_sedan' },
  { sprite: 'taxi',               wPx: 27, hPx: 48, model: 'taxi' },
  { sprite: 'rideshare',          wPx: 27, hPx: 48, model: 'rideshare' },
  { sprite: 'delivery',           wPx: 29, hPx: 60, model: 'delivery' },
  { sprite: 'food_truck',         wPx: 29, hPx: 62, model: 'food_truck' },
  { sprite: 'tow_truck',          wPx: 33, hPx: 70, model: 'tow_truck' },
  { sprite: 'snow_plow',          wPx: 31, hPx: 64, model: 'snow_plow' },
  { sprite: 'garbage',            wPx: 33, hPx: 70, model: 'garbage' },
  { sprite: 'cement_truck',       wPx: 33, hPx: 70, model: 'cement_truck' },
  /* On a call only, past TRAFFIC_CIVILIAN_COUNT. The first four run
     pursuits behind a speeder; the last two run alone. */
  { sprite: 'police_cruiser',     wPx: 28, hPx: 52, model: 'police_cruiser' },
  { sprite: 'state_police',       wPx: 28, hPx: 52, model: 'state_police' },
  { sprite: 'sheriff',            wPx: 28, hPx: 52, model: 'sheriff' },
  { sprite: 'swat',               wPx: 31, hPx: 64, model: 'swat' },
  { sprite: 'ambulance',          wPx: 31, hPx: 62, model: 'ambulance' },
  { sprite: 'fire_truck',         wPx: 33, hPx: 70, model: 'fire_truck' }
];

/* Index of the first call-only vehicle. Ordinary traffic deals over
   [0, TRAFFIC_CIVILIAN_COUNT). */
export const TRAFFIC_CIVILIAN_COUNT = 47;


export const VEHICLES = {
  /*
    Three cars, all unlocked from the start. Handling is identical
    across them on purpose: the choice is meant to be taste, not a
    difficulty setting. The one thing that does differ is the hitbox,
    because it is derived from the sprite, and the 4x4 really is a
    bigger object on the road. Hitboxes run about four fifths of the
    sprite so a near miss reads as a near miss.
  */
  coupe: {
    id: 'coupe',
    name: 'Sport coupe',
    hitbox: { wPx: 22, hPx: 40 },
    laneTweenMs: TUNING.movement.laneTweenMs,
    baseSpeedMultiplier: 1,
    fuelBurnMultiplier: 1,
    boostMultiplier: 1.6,
    spriteKey: 'player_coupe',
    locked: false
  },
  fourbyfour: {
    id: 'fourbyfour',
    name: '4x4',
    hitbox: { wPx: 24, hPx: 45 },
    laneTweenMs: TUNING.movement.laneTweenMs,
    baseSpeedMultiplier: 1,
    fuelBurnMultiplier: 1,
    boostMultiplier: 1.6,
    spriteKey: 'player_4x4',
    locked: false
  },
  classic: {
    id: 'classic',
    name: 'Classic',
    hitbox: { wPx: 22, hPx: 40 },
    laneTweenMs: TUNING.movement.laneTweenMs,
    baseSpeedMultiplier: 1,
    fuelBurnMultiplier: 1,
    boostMultiplier: 1.6,
    spriteKey: 'player_classic',
    locked: false
  }
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
