/* Shown small on the title screen so a stale phone cache is visible
   at a glance. Bump when shipping. */
export const BUILD_TAG = 'M9.1';

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
    /*
      A tap two lanes away crosses in one motion rather than in two
      moves. The sweep is longer than a single lane change and shorter
      than two of them (298ms against 340 at the default 170), so the
      wide move stays the quicker way across while still having enough
      weight on screen to read as a manoeuvre rather than a snap. A
      multiplier and not a fixed duration, because laneTweenMs is per
      vehicle and a heavier car should sweep heavier too.

      The fair gap is sized for a worst case two lane crossing at two
      separate tween lengths, so a car that can do it in one is inside
      a budget that was already being paid. That is an argument, not a
      proof: the oracle drives the simulation with one lane moves, so
      it does not exercise this, and its silence about it is not a
      pass. GUESS, chosen by feel, confirmed on device.
    */
    laneSweepMult: 1.75,
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
    /*
      Clusters: rows may pack bumper to bumper when a guaranteed open
      corridor runs through them (every corridor lane stays open), so
      traffic reads crowded without ever demanding a lane change
      there is no room to make.

      The cap counts continuations, so a queue is one leading row plus
      this many: two gives three cars nose to tail and no more.

      It was seven. Measured over 18km the queue lengths came out
      1:20% 2:16% 3:11% 4:12% 5:10% 6:7% 7:2% 8:22%, so more than a
      fifth of all packs ran the full eight rows, and since 92% of
      rows are a single car and a cluster may never narrow its open
      lanes, that reads on screen as eight cars in single file in one
      lane with an empty road either side. Three is a queue. Eight is
      a car park.
    */
    clusterMaxLen: 2,
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
    /*
      Traffic is either crawling or moving with the flow, and share is
      how much of the moving traffic takes the fast band. The per tier
      speedFrac range below is now the crawl band alone.

      The two bands have to average out to roughly what the old single
      range averaged, and this share is what holds that. The fair gap
      is measured against the player's own speed rather than the
      closing speed, which is the conservative choice and the right
      one, because the clamp can slow a row after it has been placed.
      The price is that faster traffic thins the road: measured over
      18km, a quarter share costs nothing (43 cars per km against 43,
      2.02 cars on screen against 2.08, an empty road on 8% of frames
      against 7%), where a 40% share costs a tenth of them and a
      single range reaching 0.82 costs a fifth.
    */
    flow: { share: 0.25, fracMin: 0.46, fracMax: 0.72 },
    breakdownEveryMeters: 500,
    breakdownJitterFrac: 0.5
  },

  /*
    Difficulty tiers, entered at distance milestones. Each tier sets
    the dials that make the road harder: scroll speed, how loose the
    gaps run, how often rows force a single lane, how much traffic
    clusters, how slowly the crawling traffic crawls, and how few rows
    sit still. speedFracMin and speedFracMax are the crawl band only;
    the flow band is shared across tiers and lives in traffic.flow. Passive fuel drain scales with the tier's speed. Tier
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
    { atMeters: 0,    theme: 'mountain', speed: 1.0,  gapJitterMax: 1.14, doubleRowChance: 0.42, clusterChance: 0.95, stalledChance: 0.30, speedFracMin: 0.12, speedFracMax: 0.30, aggro: 0.22 },
    { atMeters: 1000, theme: 'farmland', speed: 1.1,  gapJitterMax: 1.13, doubleRowChance: 0.44, clusterChance: 0.95, stalledChance: 0.29, speedFracMin: 0.11, speedFracMax: 0.30, aggro: 0.27 },
    { atMeters: 2000, theme: 'desert',   speed: 1.2,  gapJitterMax: 1.12, doubleRowChance: 0.46, clusterChance: 0.96, stalledChance: 0.28, speedFracMin: 0.10, speedFracMax: 0.29, aggro: 0.32 },
    { atMeters: 3000, theme: 'volcanic', speed: 1.31, gapJitterMax: 1.11, doubleRowChance: 0.48, clusterChance: 0.96, stalledChance: 0.27, speedFracMin: 0.09, speedFracMax: 0.29, aggro: 0.37 },
    { atMeters: 4000, theme: 'snow',     speed: 1.42, gapJitterMax: 1.10, doubleRowChance: 0.50, clusterChance: 0.96, stalledChance: 0.26, speedFracMin: 0.08, speedFracMax: 0.28, aggro: 0.42 },
    { atMeters: 5000, theme: 'forest',   speed: 1.53, gapJitterMax: 1.10, doubleRowChance: 0.52, clusterChance: 0.97, stalledChance: 0.25, speedFracMin: 0.07, speedFracMax: 0.28, aggro: 0.46 },
    { atMeters: 6000, theme: 'beach',    speed: 1.64, gapJitterMax: 1.09, doubleRowChance: 0.54, clusterChance: 0.97, stalledChance: 0.24, speedFracMin: 0.06, speedFracMax: 0.27, aggro: 0.50 },
    /* Speed stops here on purpose. Everything past this point changes
       what the road is made of, not how fast it comes at you: the
       ceiling has to be reachable or the game turns into a reaction
       time test and casual players leave. */
    { atMeters: 7000, theme: 'cliffs',   speed: 1.75, gapJitterMax: 1.09, doubleRowChance: 0.56, clusterChance: 0.97, stalledChance: 0.23, speedFracMin: 0.05, speedFracMax: 0.27, aggro: 0.54 },
    { atMeters: 8000, theme: 'city',     speed: 1.75, gapJitterMax: 1.08, doubleRowChance: 0.58, clusterChance: 0.97, stalledChance: 0.22, speedFracMin: 0.05, speedFracMax: 0.26, aggro: 0.58 },
    { atMeters: 9000, theme: 'forest',   speed: 1.75, gapJitterMax: 1.08, doubleRowChance: 0.60, clusterChance: 0.97, stalledChance: 0.21, speedFracMin: 0.04, speedFracMax: 0.26, aggro: 0.62 }
  ],
  /* Per frame step toward a new tier's speed multiplier. At 0.003 a
     12 percent tier jump ramps over roughly 40 frames. GUESS. */
  tierRampPerFrame: 0.003,

  /* How far apart the tiers sit past the last authored rung. The
     ladder above stops at ten; beyond it the tier number keeps
     counting and the scenery keeps changing on the same cadence,
     while every difficulty number stays frozen at the last rung. */
  tierStepMeters: 1000,

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
    passEveryMeters: 340,
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
    chaseGapPx: 90,
    /*
      How a pursuit ends. Rather than the pair simply leaving the top
      of the screen and never being heard from again, this share of
      them resolves: the runner is stopped in a lane up the road with
      the police car behind it, hazards and wig wag going, and the
      player has to get round the pair.

      pullOverAtPx is where they stop, measured ahead of the player,
      and it is well past the 250px of road the screen shows on
      purpose. The player never watches them pull over, they come
      across it, which is both what happens in life and much easier to
      make fair: by the time the pair is on screen it has been a
      static obstacle for a while and every ordinary rule has applied
      to it.

      The pair becomes two stopped rows, one car each in the same
      lane, which is a shape the generator could have produced by
      itself. That is the whole trick: it means the fair gap, the
      traffic clamp, the corridor rule and the fairness oracle all
      cover it without knowing it is special. When the geometry does
      not allow it the pursuit simply leaves, the way a pass that
      cannot find a clear lane simply does not spawn.
    */
    pullOverChance: 0.55,
    pullOverAtPx: 560,
    /* How far up the road to look for a gap big enough to stop in
       before giving up and letting the pursuit leave. */
    pullOverSearchPx: 900
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
    /*
      The initials wheel. Three columns of one character, changed with
      the chevron above and below each one. colPitchPx is the distance
      between column centres, and the hit boxes are the full pitch
      wide so a thumb never lands between two of them.
    */
    initials: {
      /*
        chevronDy is the distance from the character to each chevron,
        and it is a thumb measurement rather than a visual one. At 19
        the top control sat ten pixels from the glyph, which on a
        phone means the hand reaching up to it lands across the very
        character it is changing. The character is the only feedback
        this screen gives, so covering it makes the control useless
        at the moment it is used.

        Later passes moved the chevrons back in toward the character,
        26 to 21 to 18, because out there they read as two loose arrows
        floating in the plate rather than as the two buttons belonging
        to the letter between them. At 18 they sit about six pixels off
        the glyph, which is as close as they go before the lower one
        starts touching its descender row. The thumb problem that pushed them out in
        the first place is already solved by the swap: the control the
        hand reaches for most is the lower one, and a hand coming from
        the bottom of the phone never crosses the glyph to get there.

        The targets grew instead of the gap. Columns are 46 wide rather
        than 34, which is the whole plate interior split three ways,
        and hitPadPx lets each one run a few pixels past the plate edge
        top and bottom without reaching the Save button's own padding.
      */
      plateY: 112, plateH: 78, colPitchPx: 46, letterScale: 3,
      letterCy: 155, chevronDy: 18, hitHPx: 20, hitPadPx: 4
    },
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
    /*
      lenPx is a floor, not the length. A mark is stamped once per
      rendered frame, and the road moves 3 pixels per frame at the
      opening speed and nearly 7 under boost in the late tiers, so a
      fixed 2 pixel stamp drew a dotted line with more gap than rubber
      in it and got fainter the faster you went, which is backwards.
      Each mark now spans the ground covered since the last one, up to
      maxLenPx so a stall or a tab switch cannot lay a long bar.
    */
    skid: { trackPx: 7, wPx: 3, lenPx: 3, maxLenPx: 14, fadeMs: 1400, maxAlpha: 1, minStrength: 0.35, sweepStrength: 0.7, maxBridge: 8 },
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
    /*
      Working vehicles run their own lights, on their own beat, so a
      lane of traffic is not all one dead sheet of parked art. Drawn
      the way the wig wags are, as pixels on the sprite rather than as
      new frames in the atlas, so this costs no art and no load time.
      roofFrac is the distance down the sprite to the light, which is
      the cab on anything with a bed behind it.

      The taxi sign blinks on and off. At 560 the two states came and
      went inside a fifth of a second each and the eye read one
      unsteady lamp rather than a light turning on and turning off,
      which is the opposite of what a roof sign is for. Just over a
      second a side is a blink.

      The recovery truck gets the police wig wag rather than a beacon
      of its own: same two lamps trading sides on the same beat, same
      strobe pixel between them, in orange. A tow on the hard shoulder
      is running the same kind of light in real life, and reusing the
      pattern means a player who has learned to read the police roof
      already reads this one.
    */
    workLights: {
      /*
        Measured off the art rather than guessed at. The taxi's frame
        is 48 tall: hood to row 11, windshield 12 to 18, and the roof
        sign is painted on rows 25 to 29, so the lamp goes inside the
        sign that is already there rather than on the glass in front
        of it. The tow truck is 70 tall with its cab roof on rows 25
        to 36, and the beacon sits at the front of it.
      */
      taxi: { roofFrac: 0.55, kind: 'sign', ms: 1100 },
      tow_truck: { roofFrac: 0.38, kind: 'wigwag', ms: 140 }
    },
    /*
      Where the bodywork ends, as a fraction of the frame, for the
      hazard flashers that go on a breakdown's rear corners. The tow
      truck's boom and hook hang nine pixels past the back of the
      truck, so the corners of the frame are not the corners of the
      vehicle and its flashers were floating in the road behind it.
    */
    bodyBottomFrac: { default: 1, tow_truck: 0.87 },
    /* Roadside parallax: the far band scrolls slower than the road,
       the near band rides with it. */
    /*
      The roadside is Jason's art, one strip per side.
      stripWPx has to equal road.roadLeftPx, because the strip is
      exactly the ground between the screen edge and the tarmac, and
      the sheet in assets/scenery.png is cut to that width.
    */
    scenery: { stripWPx: 30 }
  },

  /*
    Scenery themes, one per tier: the run climbs from mountain roads
    through desert, snow, and beach into the cityscape. Colors only;
    the drawing styles live in render.
  */
  /*
    label is what the place is called, which is what the tier callout
    announces: the road going somewhere new is the interesting fact,
    and "faster, denser" was a difficulty note dressed up as one. Two
    tiers share the forest, so two tiers say Forest, which is true.

    banner is the tier callout's headline colour, one per place, taken
    from what that place is made of rather than the single amber every
    tier used to announce itself in. It is the one thing on the callout
    that changes, so the words read the same and the arrival reads as
    somewhere new. Every one of them is light enough to hold up on the
    dark plate the callout sits on.
  */
  /* The scenes the road cycles through past the last authored tier,
     shuffled per run from the run's own seed. Every key here must
     have an entry in sceneryThemes and a left and right strip in
     SCENERY_STRIPS. */
  sceneryCycle: ['mountain', 'farmland', 'desert', 'volcanic', 'snow',
    'forest', 'beach', 'cliffs', 'city'],

  sceneryThemes: {
    mountain: { farDensity: 85, nearDensity: 70, farItem: 'peak',     nearItem: 'pine',     offroad: '#79b364', far: '#8a93a6', farDark: '#6e7789', farAccent: '#f4f4f4', near: '#3f7a3a', nearDark: '#2f5c2c', trunk: '#7a5a3a', banner: '#b9cdf0', label: 'Mountains' },
    farmland: { farDensity: 32, nearDensity: 42, farItem: 'barn',     nearItem: 'cow',      offroad: '#8fbf5a', far: '#b4553f', farDark: '#8c3f2e', farAccent: '#f4f4f4', near: '#5aa03f', nearDark: '#2c3a28', trunk: '#8c6a3f', banner: '#e0a83c', label: 'Farmland' },
    desert:   { farDensity: 55, nearDensity: 58, farItem: 'mesa',     nearItem: 'cactus',   offroad: '#ddba75', far: '#b97e4b', farDark: '#94603a', farAccent: '#d19a63', near: '#4e9e3f', nearDark: '#3c7a31', trunk: '#4e9e3f', banner: '#e8a54f', label: 'Desert' },
    volcanic: { farDensity: 34, nearDensity: 62, farItem: 'volcano',  nearItem: 'lavarock', offroad: '#4a4046', far: '#5a4a52', farDark: '#3d3239', farAccent: '#ff6b35', near: '#6b5b62', nearDark: '#463b41', trunk: '#ffb937', banner: '#ff6b35', label: 'Lava Fields' },
    snow:     { farDensity: 85, nearDensity: 58, farItem: 'snowpeak', nearItem: 'snowfront',     offroad: '#e9edf4', far: '#c7d0dd', farDark: '#a6b1c2', farAccent: '#ffffff', near: '#2f5c4a', nearDark: '#234636', trunk: '#5a4632', banner: '#cfe6ff', label: 'Snowline' },
    forest:   { farDensity: 80, nearDensity: 88, farItem: 'peak',     nearItem: 'pine',     offroad: '#3f7a3a', far: '#2f5c4a', farDark: '#234636', farAccent: '#4e9e3f', near: '#2f6b2c', nearDark: '#1f4a1e', trunk: '#5a4632', banner: '#7bd06a', label: 'Forest' },
    beach:    { farDensity: 100, nearDensity: 54, farItem: 'water',    nearItem: 'beachfront',     offroad: '#ecd493', far: '#3f9edb', farDark: '#2f7fb8', farAccent: '#f4f4f4', near: '#3f8a3a', nearDark: '#2f6b2c', trunk: '#8a6238', banner: '#4fc9e8', label: 'Coast' },
    cliffs:   { farDensity: 72, nearDensity: 58, farItem: 'mesa',     nearItem: 'scrub',    offroad: '#b9b0a0', far: '#9a8a78', farDark: '#786a5c', farAccent: '#cdbfa8', near: '#6b8a4f', nearDark: '#4f6b39', trunk: '#8a7a68', banner: '#d8c49a', label: 'Cliffs' },
    city:     { farDensity: 78, nearDensity: 52, farItem: 'building', nearItem: 'treeblob', offroad: '#adadb8', far: '#8f9ab8', farDark: '#717c9c', farAccent: '#f4f4f4', near: '#4e9e3f', nearDark: '#3c7a31', trunk: '#7a5a3a', banner: '#a8bde8', label: 'City' }
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
      skidMark: '#2a2b40',
      building: '#9aa7c4',
      buildingDark: '#7c88a6',
      tree: '#4e9e3f',
      treeDark: '#3c7a31',
      slick: '#241839',
      slickSheen: '#43306b',
      slickArrow: '#c2b1ff',
      hazardLight: '#ffb937',
      /* The same amber with the lamp off: still warm, clearly unlit. */
      hazardLightDim: '#7a5214',
      wigWagRed: '#ff2a2a',
      wigWagRedDim: '#701414',
      wigWagBlue: '#2a6aff',
      wigWagBlueDim: '#142d70',
      /* The recovery truck's wig wag. Orange rather than the amber
         the hazard flashers use, because the truck itself is yellow
         and amber on yellow is one colour at this size. */
      wigWagAmber: '#ff7a14',
      wigWagAmberDim: '#6b2f05',
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

/*
  The roadside, assets/scenery.png: two strips per place, the left
  verge and the right verge as they were drawn, then the sea. Thirty
  pixels wide, 544 tall, in this order.

  Nothing is mirrored and nothing is flipped. Each side of the road
  gets the verge that was drawn for that side, so the shoulder, the
  light and the lie of the ground all run the way the artist drew
  them. The one exception is the sea, which is cut from the east verge
  and mirrored when the coast is on the west, because that is the
  difference between water on one side and water on the other.

  Each strip loops on itself: the crop was chosen so its two ends
  match, and the last few rows cross fade into the first, so the
  repeat has no seam without turning anything upside down.
*/
export const SCENERY_STRIPS = [
  'mountain_left', 'mountain_right',
  'farmland_left', 'farmland_right',
  'desert_left', 'desert_right',
  'volcanic_left', 'volcanic_right',
  'snow_left', 'snow_right',
  'forest_left', 'forest_right',
  'beach_left', 'beach_right',
  'cliffs_left', 'cliffs_right',
  'city_left', 'city_right',
  'sea'
];

export const SCENERY_STRIP_H = 544;

/* Which place has a coast, and how often a pass down the strip is
   water rather than land. Rolled per side, so a stretch can have the
   sea to the east, to the west, on both, or on neither. */
export const SCENERY_SEA_THEMES = ['beach'];
export const SCENERY_SEA_IN = 3;

export const PLAYER_SPRITES = ['fourbyfour', 'sport_coupe', 'classic'];

/*
  Paint.

  The sheet's nine civilian bodies each carry four colours, baked in
  by the artist. These repaint them in Jason's reference lists: the
  Porsche colours on the traffic, the Land Rover colours reserved for
  the 4x4, which is the car he drives.

  How it works is in src/render/paint.js. What matters here: `from` is
  the frame the paint is taken off, `mask` is a second frame of the
  same body, and the difference between the two is exactly the paint
  and nothing else. `jobs` then says which sprite name gets which
  colour. Those names are the artist's and are now only slots, so
  sport_white_rose being silver is not a mistake; the colour is the
  hex beside it, and nothing outside this table and the renderer knows
  or cares.

  Deleting this table puts the original artwork back, unchanged.

  Names are kept for the record and never travel into a key: the port
  brief requires neutral vehicle identifiers, and a colour reference
  is not a trademark while a tuning key named after a marque would be.

  Two colours from the lists are deliberately absent from traffic.
  Black (#111214) disappears against the road at twenty seven pixels:
  not a look, a car you cannot see, and this game asks you to see
  cars. Midnight Blue (#18283E) is nearly as dark and survives only on
  the pickup, whose pale bed carries it. Judged from a render of all
  nine bodies in all their colours against the road grey, which is
  what "exact hex, then judge" earns you.
*/
export const REPAINTS = [
  {
    from: 'sport_white', mask: 'sport_white_blue',
    jobs: [
      ['sport_white', '#D01820'],        /* Guards Red */
      ['sport_white_blue', '#F0EFE8'],   /* Grand Prix White */
      ['sport_white_rose', '#245AA5'],   /* Maritime Blue */
      ['sport_white_green', '#B9BEC2']   /* Polar Silver Metallic */
    ]
  },
  {
    from: 'muscle', mask: 'muscle_red',
    jobs: [
      ['muscle', '#D01820'],             /* Guards Red */
      ['muscle_red', '#F3C300'],         /* Speed Yellow */
      ['muscle_blue', '#169BC4'],        /* Riviera Blue */
      ['muscle_lime', '#7D2930']         /* Arena Red Metallic */
    ]
  },
  {
    from: 'super_car', mask: 'super_car_green',
    jobs: [
      ['super_car', '#169BC4'],          /* Riviera Blue */
      ['super_car_green', '#F3C300'],    /* Speed Yellow */
      ['super_car_cyan', '#D01820'],     /* Guards Red */
      ['super_car_plum', '#F0EFE8']      /* Grand Prix White */
    ]
  },
  {
    from: 'hot_hatch', mask: 'hot_hatch_amber',
    jobs: [
      ['hot_hatch', '#D12F67'],          /* Rubystone Red */
      ['hot_hatch_amber', '#79C6A3'],    /* Mint Green */
      ['hot_hatch_teal', '#245AA5'],     /* Maritime Blue */
      ['hot_hatch_indigo', '#F3C300']    /* Speed Yellow */
    ]
  },
  {
    from: 'pickup', mask: 'pickup_green',
    jobs: [
      ['pickup', '#7D2930'],             /* Arena Red Metallic */
      ['pickup_green', '#18283E'],       /* Midnight Blue Metallic */
      ['pickup_blue', '#F0EFE8'],        /* Grand Prix White */
      ['pickup_amber', '#176661']        /* Amazon Green Metallic */
    ]
  },
  {
    from: 'van', mask: 'van_blue',
    jobs: [
      ['van', '#F0EFE8'],                /* Grand Prix White */
      ['van_blue', '#B9BEC2'],           /* Polar Silver Metallic */
      ['van_amber', '#245AA5'],          /* Maritime Blue */
      ['van_teal', '#79C6A3']            /* Mint Green */
    ]
  },
  {
    from: 'wagon', mask: 'wagon_cyan',
    jobs: [
      ['wagon', '#176661'],              /* Amazon Green Metallic */
      ['wagon_cyan', '#B9BEC2'],         /* Polar Silver Metallic */
      ['wagon_orange', '#D01820'],       /* Guards Red */
      ['wagon_green', '#79C6A3']         /* Mint Green */
    ]
  },
  {
    from: 'camper', mask: 'camper_blue',
    jobs: [
      ['camper', '#F0EFE8'],             /* Grand Prix White */
      ['camper_blue', '#79C6A3'],        /* Mint Green */
      ['camper_green', '#F3C300'],       /* Speed Yellow */
      ['camper_red', '#B9BEC2']          /* Polar Silver Metallic */
    ]
  },
  {
    from: 'suv', mask: 'suv_blue',
    jobs: [
      ['suv', '#B9BEC2'],                /* Polar Silver Metallic */
      ['suv_blue', '#245AA5'],           /* Maritime Blue */
      ['suv_green', '#176661'],          /* Amazon Green Metallic */
      ['suv_amber', '#7D2930']           /* Arena Red Metallic */
    ]
  }
];

/*
  The player's 4x4, in Coniston Green, the definitive Defender colour.

  It has no second variant, so there is no pair to diff and no free
  mask. Its paint is a distinct olive against dark trim and black
  glass, so a narrow hue band finds it cleanly, which is not true of
  the white or near black cars, and is why this route is used here and
  nowhere else. Checked against a render before it shipped.
*/
export const PLAYER_REPAINTS = [
  { from: 'fourbyfour', hueMask: true, jobs: [['fourbyfour', '#3F6048']] }
];

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
