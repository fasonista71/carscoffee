/*
  Bootstrap and state machine. Owns the world instance, drains input
  intents into the fixed timestep, snapshots state for interpolated
  rendering, handles pause on visibility loss, and runs the menus.

  Starting or restarting a run happens ONLY through the primary menu
  button, and menu taps are ignored for a beat after a menu opens, so
  a frantic last second tap can never launch a run by accident.
*/

import { TUNING, VEHICLES, ENVIRONMENTS } from '../game/tuning.js';
import { createWorld, step, distanceMeters, isBoosting } from '../game/world.js';
import { playerLaneFloat, laneCenterXPx } from '../game/entities.js';
import { createRenderer } from '../render/renderer.js';
import { loadSprites } from '../render/sprites.js';
import { attachKeyboard } from '../input/keyboard.js';
import { attachTouch } from '../input/touch.js';
import { attachPointer } from '../input/pointer.js';
import { createAudio } from '../audio/audio.js';
import { createLoop } from './loop.js';
import { createLeaderboard, localStore, cleanName } from './leaderboard.js';
import { createInitialsEntry } from './initials.js';
import { createHaptics } from './haptics.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const audio = createAudio();
const haptics = createHaptics();

let mode = 'title';
let world = null;
let pending = [];
let prevSnap = { distancePx: 0, laneFloat: 1 };
let currSnap = prevSnap;
let menuEnteredAt = 0;
let newBest = false;
/* The board and the run waiting to be named. newEntryIndex marks the
   row just earned so the render can pick it out; it clears when the
   next run starts. */
const board = createLeaderboard(localStore('cc.board.v1'));
let pendingMeters = 0;
let newEntryIndex = -1;
const initials = createInitialsEntry((typed) => {
  const meters = pendingMeters;
  const name = cleanName(typed);
  pendingMeters = 0;
  board.submit(name, meters, world ? world.vehicleId : vehicleId).then((list) => {
    newEntryIndex = list.findIndex((e) => e.name === name && e.meters === meters);
  });
});

/* Persisted settings and per vehicle high scores. */
const UNLOCKED = Object.values(VEHICLES).filter((v) => !v.locked).map((v) => v.id);

function loadSetting(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* private mode etc.; the game still works without persistence */
  }
}

let vehicleId = loadSetting('cc.vehicle.v1', UNLOCKED[0]);
if (!UNLOCKED.includes(vehicleId)) vehicleId = UNLOCKED[0];
let soundOn = loadSetting('cc.sound.v1', '1') === '1';
/* The coffee tip is a one time lesson, not a recurring nag: once it
   has been shown on any run in this browser it never returns. Clear
   site data to see it again while testing. */
let coffeeTipDone = loadSetting('cc.coffeetip.v1', '0') === '1';
let coffeeTipUntilMs = 0;
/* Spent on reading time, not on the simulation event. See the note
   over drawCoffeeTip in renderer.js: the event fires with the cup
   about three pixels inside the draw cut off, so writing the flag
   there could burn the lesson with nothing on screen. The renderer
   reports whether it drew, and the flag is written once the callout
   has actually been up long enough to read. */
let coffeeTipShownMs = 0;
const COFFEE_TIP_READ_MS = 1200;
let hapticsOn = loadSetting('cc.haptics.v1', '1') === '1';
audio.setMuted(!soundOn);
haptics.setEnabled(hapticsOn);

const highs = {};
/*
  One time carry over of the best distance from before the cars were
  renamed.

  The high score key embeds the vehicle id (cc.high.<id>.city.v1), and
  this release renamed every id: sports and lambo became coupe,
  fourbyfour and classic. Without this, a returning player's best read
  as zero while the top five board, which is keyed on nothing, still
  displayed the very run that set it. The screen contradicted itself.

  Deliberately written to scan for any legacy cc.high.*.city.v1 rather
  than to hardcode the two old ids, because the ids are exactly the
  thing that changed and a future rename would break a hardcoded map
  the same way. The old keys are left in place: this reads them, it
  does not consume them, so a mistake here is recoverable.

  All three cars inherit the same carried best. They have identical
  handling in this build, so a per car best is close to meaningless,
  and showing a player a number lower than one they actually reached
  is the failure being fixed.
*/
const MIGRATION_KEY = 'cc.migrated.v2';

function migrateLegacyHighScores() {
  if (loadSetting(MIGRATION_KEY, '') === '1') return;
  /*
    Only scores filed under an id this build no longer has are legacy.
    Scanning every cc.high key instead would take the best across all
    of them and copy it onto the others, which would silently inflate
    a current player's per car bests. Verified against the shipped
    zip: the previous build's ids are 'sports' and 'lambo' and the key
    shape is exactly this.
  */
  let legacyBest = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      const m = key && /^cc\.high\.([a-z0-9_]+)\.city\.v1$/.exec(key);
      if (!m || UNLOCKED.indexOf(m[1]) !== -1) continue;
      const v = Number(localStorage.getItem(key)) || 0;
      if (v > legacyBest) legacyBest = v;
    }
  } catch (e) {
    /* storage unreadable; nothing to carry over and nothing to do */
    return;
  }
  if (legacyBest > 0) {
    for (const id of UNLOCKED) {
      /* Never lower or overwrite a best this build already holds. */
      const current = Number(loadSetting('cc.high.' + id + '.city.v1', '0')) || 0;
      if (current < legacyBest) saveSetting('cc.high.' + id + '.city.v1', String(legacyBest));
    }
  }
  saveSetting(MIGRATION_KEY, '1');
}

migrateLegacyHighScores();

function getHigh(id) {
  if (!(id in highs)) {
    highs[id] = Number(loadSetting('cc.high.' + id + '.city.v1', '0')) || 0;
  }
  return highs[id];
}
function setHigh(id, meters) {
  highs[id] = meters;
  saveSetting('cc.high.' + id + '.city.v1', String(meters));
}

/*
  The dev overlay is opt in and is not in the shipped bundle.

  It used to be statically imported and opened by a three finger
  touch, which meant a player could bring up twenty five live tuning
  sliders by accident, on a panel with no close control, writing
  straight into the TUNING singleton the fairness geometry reads. A
  score set on an altered config then went to storage like any other.

  Now: no gesture opens it, the module is only fetched when the URL
  asks for it, and the packaging step leaves the file out, so on the
  public build the import fails and is swallowed. Locally the file is
  there and ?dev=1 still works.
*/
let overlay = { toggle() {}, setStats() {} };
if (new URLSearchParams(location.search).has('dev')) {
  import('./devOverlay.js')
    .then((m) => { overlay = m.createDevOverlay(() => world); })
    .catch(() => { /* not in this build; the no-op stub stands in */ });
}

function snapshot() {
  return { distancePx: world.distancePx, laneFloat: playerLaneFloat(world.player) };
}

function startRun() {
  /* Each run gets a fresh seed. The clock is fine here in app/; the
     simulation itself stays deterministic for whatever seed it gets,
     which is what the headless tests prove. */
  world = createWorld({
    seed: Date.now() >>> 0,
    vehicle: VEHICLES[vehicleId],
    environment: ENVIRONMENTS.city
  });
  world.laneTweenMs = TUNING.movement.laneTweenMs;
  pending = [];
  newBest = false;
  newEntryIndex = -1;
  prevSnap = currSnap = snapshot();
  mode = 'playing';
  audio.startMusic();
}

function pauseRun() {
  if (mode !== 'playing') return;
  mode = 'paused';
  menuEnteredAt = performance.now();
  audio.stopMusic();
  audio.stopSiren();
}

function resumeRun() {
  mode = 'playing';
  audio.startMusic();
}

function cycleVehicle() {
  const idx = (UNLOCKED.indexOf(vehicleId) + 1) % UNLOCKED.length;
  vehicleId = UNLOCKED[idx];
  saveSetting('cc.vehicle.v1', vehicleId);
}

/*
  The ring switch hint. Shown once, to touch devices only, because the
  page cannot read the switch and a permanent warning that is usually
  wrong is worse than none. It goes away when the player taps it or
  finishes a run, whichever comes first.
*/
const IS_TOUCH = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
let soundTipOn = IS_TOUCH && loadSetting('cc.soundtip.v1', '1') === '1';

/*
  Evaluated at use, not at boot, because two of the three conditions
  change during a session.

  The board one is the important one. drawTitle draws the menu first,
  putting this hint at y 284 and 292, then draws the board band from
  y 270 straight over it, and the hint's padded hit box survives
  underneath as an invisible tap target across three leaderboard rows.
  drawBoard's own comment says an empty board is what keeps it clear
  of the hint, and that holds for anyone who started on this build,
  because the hint is dismissed at game over. It does not hold for a
  returning player, who arrives with a full board and no
  cc.soundtip.v1 at all. That is most of the audience for an update.

  The sound one is simpler: a player who set Sound to OFF on the row
  directly above should not then be told to go check a hardware
  switch. The HUD already gets this right and draws a mute glyph.
*/
function soundTipVisible() {
  return soundTipOn && soundOn && board.entries().length === 0;
}

function dismissSoundTip() {
  if (!soundTipOn) return;
  soundTipOn = false;
  saveSetting('cc.soundtip.v1', '0');
}

/*
  Which menu row the finger is currently holding down, or null. Render
  only: nothing acts on a press, so a player can put a finger on Start,
  think better of it, slide off and let go with nothing having
  happened. The button still says it heard them.
*/
let pressedMenuId = null;

function uiSound(name) {
  audio.play(name);
  haptics.trigger(name);
}

function menuIdAt(clientX, clientY) {
  if (initials.isOpen()) return null;
  if (mode !== 'title' && mode !== 'paused' && mode !== 'gameOver') return null;
  const p = renderer.screenToLogical(clientX, clientY);
  return renderer.hitTestMenu(mode, p.x, p.y, soundTipVisible() && mode === 'title', haptics.supported);
}

function handleMenuPress(clientX, clientY) {
  if (performance.now() - menuEnteredAt < TUNING.render.menu.cooldownMs) return;
  const id = menuIdAt(clientX, clientY);
  if (!id || id === 'soundtip') return;
  pressedMenuId = id;
  uiSound('ui_press');
}

function handleMenuTap(clientX, clientY) {
  if (initials.isOpen()) return;
  if (performance.now() - menuEnteredAt < TUNING.render.menu.cooldownMs) return;
  const p = renderer.screenToLogical(clientX, clientY);
  const id = renderer.hitTestMenu(mode, p.x, p.y, soundTipVisible() && mode === 'title', haptics.supported);
  if (!id) return;
  if (id === 'soundtip') {
    uiSound('ui_toggle_off');
    dismissSoundTip();
    return;
  }
  if (id === 'primary') {
    uiSound('ui_confirm');
    if (mode === 'paused') resumeRun();
    else startRun();
  } else if (id === 'restart') {
    uiSound('ui_confirm');
    startRun();
  } else if (id === 'car') {
    uiSound('ui_toggle_on');
    cycleVehicle();
  } else if (id === 'sound') {
    soundOn = !soundOn;
    if (soundOn) {
      /* Unmute first, or the sound that says sound is back never
         plays. Going the other way, the blip is already scheduled on
         the context by the time the mute flag is set, so it is heard
         and only the next one is silenced. */
      audio.setMuted(false);
      uiSound('ui_toggle_on');
    } else {
      uiSound('ui_toggle_off');
      audio.setMuted(true);
      audio.stopMusic();
    }
    saveSetting('cc.sound.v1', soundOn ? '1' : '0');
  } else if (id === 'haptics') {
    hapticsOn = !hapticsOn;
    haptics.setEnabled(hapticsOn);
    /* setEnabled before the cue, so turning rumble on is felt. */
    uiSound(hapticsOn ? 'ui_toggle_on' : 'ui_toggle_off');
    saveSetting('cc.haptics.v1', hapticsOn ? '1' : '0');
  }
}

/*
  Positional taps resolve here, where render geometry and tuning meet.
  'lane' mode: the tap targets the lane under the finger, clamped, so
  letterbox and offroad taps pull toward the nearest lane. 'thirds'
  mode: the original brief spec, kept for A/B testing.
*/
function resolveTap(clientX) {
  if (TUNING.input.tapMode === 'thirds') {
    const rel = clientX / window.innerWidth;
    if (rel < 1 / 3) return { type: 'lane', dir: -1 };
    if (rel > 2 / 3) return { type: 'lane', dir: 1 };
    return { type: 'boost' };
  }
  const lx = renderer.screenToLogicalX(clientX);
  const raw = Math.floor((lx - TUNING.road.roadLeftPx) / TUNING.road.laneWidthPx);
  const lane = Math.max(0, Math.min(TUNING.road.laneCount - 1, raw));
  return { type: 'tapLane', lane };
}

function onIntent(intent) {
  /* Any gesture is a legal moment to unlock the sound engine. */
  audio.unlock();
  if (intent.type === 'pause') {
    if (mode === 'playing') pauseRun();
    else if (mode === 'paused') resumeRun();
    return;
  }
  if (intent.type === 'pressEnd') {
    pressedMenuId = null;
    return;
  }
  if (mode !== 'playing') {
    /* Menus respond only to presses on their buttons, but accept a
       sloppy press (releaseAt) as readily as a clean tap. Nothing
       here can start a run by swipe, key, or stray tap. */
    if (intent.type === 'pressAt') {
      handleMenuPress(intent.clientX, intent.clientY);
      return;
    }
    if (intent.type === 'tapAt' || intent.type === 'releaseAt') {
      pressedMenuId = null;
      handleMenuTap(intent.clientX, intent.clientY);
    }
    return;
  }
  pressedMenuId = null;
  if (intent.type === 'releaseAt' || intent.type === 'pressAt') return;
  pending.push(intent.type === 'tapAt' ? resolveTap(intent.clientX) : intent);
}

let fps = 0;
let fpsFrames = 0;
let fpsWindowStart = performance.now();

/*
  Screen shake, render only. Counted in 60Hz frames because that is
  how it was tuned, but stepped by wall clock: on a 120Hz ProMotion
  phone a frame counted shake ran out in half the time, which is
  exactly the hardware most likely to be running this.
*/
const SHAKE_REF_HZ = 60;
let shakeFrames = 0;
let shakeMag = 0;
let lastShakeMs = 0;
let lastTipMs = 0;
function startShake(frames, mag) {
  shakeFrames = Math.max(shakeFrames, frames);
  shakeMag = Math.max(shakeMag, mag);
}

const BOOST_TOTAL_FRAMES = Math.max(1, Math.round((TUNING.boost.durationMs / 1000) * TUNING.logic.hz));

const loop = createLoop({
  update() {
    if (mode !== 'playing' || !world) return;
    prevSnap = currSnap;
    const intents = pending;
    pending = [];
    step(world, intents);
    currSnap = snapshot();
    /* The siren follows the pursuit rather than firing once at
       spawn: hand the engine the chase car's offset each frame so it
       can fade and bend the pitch as the car goes by. */
    let chase = null;
    for (let i = 0; i < world.overtakers.length; i += 1) {
      if (world.overtakers[i].emergency) { chase = world.overtakers[i]; break; }
    }
    audio.updateSiren(chase !== null, chase === null ? 0 : chase.distPx - world.distancePx);
    for (let i = 0; i < world.events.length; i += 1) {
      const ev = world.events[i];
      audio.play(ev);
      haptics.trigger(ev);
      if (ev === 'coffee_pickup' || ev === 'heart_pickup' || ev === 'nitro_pickup') {
        renderer.addPickupPop(
          laneCenterXPx(currSnap.laneFloat),
          TUNING.render.playerYPx - 16,
          ev === 'heart_pickup' ? 'heart' : (ev === 'nitro_pickup' ? 'nitro' : 'coffee')
        );
      }
      if (ev === 'coffee_seen' && !coffeeTipDone) {
        coffeeTipUntilMs = performance.now() + TUNING.tips.coffeeShowMs;
      }
      if (ev === 'stumble') startShake(10, 3);
      else if (ev === 'rubble_hit') startShake(6, 2);
      else if (ev === 'crash') startShake(14, 4);
    }
    if (world.status === 'dead') {
      mode = 'gameOver';
      menuEnteredAt = performance.now();
      audio.stopMusic();
      audio.stopSiren();
      dismissSoundTip();
      const meters = Math.floor(distanceMeters(world));
      if (meters > getHigh(world.vehicleId)) {
        setHigh(world.vehicleId, meters);
        newBest = true;
      }
      if (board.qualifies(meters)) {
        pendingMeters = meters;
        initials.show(meters);
      }
    }
  },
  render(alpha) {
    let view;
    if (mode === 'playing' && world) {
      view = {
        mode,
        distancePx: prevSnap.distancePx + (currSnap.distancePx - prevSnap.distancePx) * alpha,
        laneFloat: prevSnap.laneFloat + (currSnap.laneFloat - prevSnap.laneFloat) * alpha
      };
    } else {
      view = { mode, distancePx: currSnap.distancePx, laneFloat: currSnap.laneFloat };
    }
    view.rows = world ? world.rows : [];
    view.pickups = world ? world.pickups : [];
    view.hazards = world ? world.hazards : [];
    view.overtakers = world ? world.overtakers : [];
    view.fuel = world ? world.fuel : TUNING.fuel.max;
    view.boosting = world ? isBoosting(world) : false;
    view.boostFrac = world ? world.boostFramesLeft / BOOST_TOTAL_FRAMES : 0;
    view.nitroCharges = world ? world.nitroCharges : 0;
    view.boostReady = world ? (world.fuel >= TUNING.boost.minFuel || world.nitroCharges > 0) : true;
    view.boostHint = world ? world.boostHint : false;
    view.deathCause = world ? world.deathCause : null;
    view.meters = world ? Math.floor(distanceMeters(world)) : 0;
    view.spinFrames = world ? world.spinFrames : 0;
    view.invulnFrames = world ? world.invulnFrames : 0;
    view.tier = world ? world.tier : 0;
    view.tierFlashFrames = world ? world.tierFlashFrames : 0;
    view.hearts = world ? world.hearts : TUNING.lives.start;
    const shakeNow = performance.now();
    const shakeUnits = lastShakeMs === 0
      ? 1
      : Math.min(4, Math.max(0, shakeNow - lastShakeMs) * SHAKE_REF_HZ / 1000);
    lastShakeMs = shakeNow;
    if (shakeFrames > 0) {
      shakeFrames -= shakeUnits;
      view.shakeX = Math.round((Math.random() * 2 - 1) * shakeMag);
      view.shakeY = Math.round((Math.random() * 2 - 1) * shakeMag);
      if (shakeFrames <= 0) { shakeFrames = 0; shakeMag = 0; }
    } else {
      view.shakeX = 0;
      view.shakeY = 0;
    }
    view.coffeeTip = !coffeeTipDone && performance.now() < coffeeTipUntilMs;
    view.playerSpriteKey = world ? world.player.spriteKey : VEHICLES[vehicleId].spriteKey;
    view.high = world ? getHigh(world.vehicleId) : getHigh(vehicleId);
    view.newBest = newBest;
    view.vehicleName = VEHICLES[vehicleId].name;
    view.soundOn = soundOn;
    view.soundTip = soundTipVisible() && mode === 'title';
    view.board = board.entries();
    view.newEntryIndex = newEntryIndex;
    view.hapticsOn = hapticsOn;
    view.hapticsSupported = haptics.supported;
    view.pressedMenuId = pressedMenuId;
    renderer.drawFrame(view);

    /* drawFrame sets coffeeTipDrawn. Only time the player could
       actually have read counts toward spending the lesson. */
    if (view.coffeeTipDrawn && !coffeeTipDone) {
      coffeeTipShownMs += Math.min(100, shakeNow - (lastTipMs || shakeNow));
      if (coffeeTipShownMs >= COFFEE_TIP_READ_MS) {
        coffeeTipDone = true;
        saveSetting('cc.coffeetip.v1', '1');
      }
    }
    lastTipMs = shakeNow;

    fpsFrames += 1;
    const now = performance.now();
    if (now - fpsWindowStart >= 500) {
      fps = Math.round((fpsFrames * 1000) / (now - fpsWindowStart));
      fpsFrames = 0;
      fpsWindowStart = now;
    }
    overlay.setStats({ fps, meters: world ? Math.floor(distanceMeters(world)) : 0 });
  }
});

attachKeyboard(onIntent);
attachTouch(onIntent, document.getElementById('stage'));
const pointer = attachPointer(onIntent);

/*
  Claim the keyboard the moment the game is touched.

  Embedded in a page, this game is an iframe, and arrow keys only reach
  it while that frame holds focus. A click would normally hand it over,
  but the pointer adapter calls preventDefault on pointerdown and
  moving focus is one of the defaults that cancels, so the host page
  keeps the keyboard and the arrows scroll it instead of driving. The
  frame therefore takes focus itself. tabIndex 0 rather than -1 so a
  keyboard user can still tab into the game; preventScroll so taking
  focus never yanks the host page around.
*/
canvas.tabIndex = 0;
function claimKeyboard() {
  try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
}
window.addEventListener('pointerdown', claimKeyboard, true);
window.addEventListener('mousedown', claimKeyboard, true);
window.addEventListener('touchstart', claimKeyboard, true);

/* Desktop mouse, and the fallback path for touch.

   Menus have always been reachable by click, gameplay only by touch
   intents, which is why an environment that delivers clicks but not
   touch events leaves the menus working and the car unresponsive. A
   click during play now resolves exactly like a tap. Wherever the
   touch adapter is working it calls preventDefault on touchstart and
   touchend, which suppresses the synthetic click, so this cannot
   double fire. */
canvas.addEventListener('click', (e) => {
  audio.unlock();
  /* The pointer adapter owns any gesture it just resolved. This only
     runs where pointer events do not exist at all. */
  if (pointer.handledRecently(performance.now())) return;
  if (mode !== 'playing') {
    handleMenuTap(e.clientX, e.clientY);
    return;
  }
  pending.push(resolveTap(e.clientX));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseRun();
});
window.addEventListener('blur', pauseRun);

/* Sprites load once before the first frame; the game does not start
   on a half loaded sheet. */
/*
  The boot handshake with the card in index.html. Nothing is drawn
  before loop.start(), and loadSprites can reject on a missing atlas,
  a missing frame, or either image failing, so a silent catch here was
  a permanent black screen with no message and no way back. A stalled
  image load never rejects at all, which is why the card also runs its
  own timeout rather than trusting this promise to settle.
*/
function bootDone() {
  if (typeof window.__ccBootOk === 'function') window.__ccBootOk();
}

function bootFailed(err) {
  console.error(err);
  if (typeof window.__ccBootFail === 'function') window.__ccBootFail(err);
}

Promise.all([loadSprites(), board.load()])
  .then(() => {
    loop.start();
    bootDone();
  })
  .catch(bootFailed);
