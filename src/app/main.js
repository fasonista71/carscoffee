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
import { playerLaneFloat } from '../game/entities.js';
import { createRenderer } from '../render/renderer.js';
import { loadSprites } from '../render/sprites.js';
import { attachKeyboard } from '../input/keyboard.js';
import { attachTouch } from '../input/touch.js';
import { createAudio } from '../audio/audio.js';
import { createLoop } from './loop.js';
import { createDevOverlay } from './devOverlay.js';
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
let hapticsOn = loadSetting('cc.haptics.v1', '1') === '1';
audio.setMuted(!soundOn);
haptics.setEnabled(hapticsOn);

const highs = {};
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

const overlay = createDevOverlay(() => world);

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
  prevSnap = currSnap = snapshot();
  mode = 'playing';
  audio.startMusic();
}

function pauseRun() {
  if (mode !== 'playing') return;
  mode = 'paused';
  menuEnteredAt = performance.now();
  audio.stopMusic();
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

function handleMenuTap(clientX, clientY) {
  if (performance.now() - menuEnteredAt < TUNING.render.menu.cooldownMs) return;
  const p = renderer.screenToLogical(clientX, clientY);
  const id = renderer.hitTestMenu(mode, p.x, p.y);
  if (!id) return;
  if (id === 'primary') {
    if (mode === 'paused') resumeRun();
    else startRun();
  } else if (id === 'restart') {
    startRun();
  } else if (id === 'car') {
    cycleVehicle();
  } else if (id === 'sound') {
    soundOn = !soundOn;
    audio.setMuted(!soundOn);
    if (!soundOn) audio.stopMusic();
    saveSetting('cc.sound.v1', soundOn ? '1' : '0');
  } else if (id === 'haptics') {
    hapticsOn = !hapticsOn;
    haptics.setEnabled(hapticsOn);
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
  if (intent.type === 'devtoggle') {
    overlay.toggle();
    return;
  }
  if (intent.type === 'pause') {
    if (mode === 'playing') pauseRun();
    else if (mode === 'paused') resumeRun();
    return;
  }
  if (mode !== 'playing') {
    /* Menus respond only to taps on their buttons. Nothing here can
       start a run by swipe, key, or stray tap. */
    if (intent.type === 'tapAt') handleMenuTap(intent.clientX, intent.clientY);
    return;
  }
  pending.push(intent.type === 'tapAt' ? resolveTap(intent.clientX) : intent);
}

let fps = 0;
let fpsFrames = 0;
let fpsWindowStart = performance.now();

const BOOST_TOTAL_FRAMES = Math.max(1, Math.round((TUNING.boost.durationMs / 1000) * TUNING.logic.hz));

const loop = createLoop({
  update() {
    if (mode !== 'playing' || !world) return;
    prevSnap = currSnap;
    const intents = pending;
    pending = [];
    step(world, intents);
    currSnap = snapshot();
    for (let i = 0; i < world.events.length; i += 1) {
      audio.play(world.events[i]);
      haptics.trigger(world.events[i]);
    }
    if (world.status === 'dead') {
      mode = 'gameOver';
      menuEnteredAt = performance.now();
      audio.stopMusic();
      const meters = Math.floor(distanceMeters(world));
      if (meters > getHigh(world.vehicleId)) {
        setHigh(world.vehicleId, meters);
        newBest = true;
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
    view.boostReady = world ? world.fuel >= TUNING.boost.minFuel : true;
    view.deathCause = world ? world.deathCause : null;
    view.meters = world ? Math.floor(distanceMeters(world)) : 0;
    view.spinFrames = world ? world.spinFrames : 0;
    view.invulnFrames = world ? world.invulnFrames : 0;
    view.tier = world ? world.tier : 0;
    view.tierFlashFrames = world ? world.tierFlashFrames : 0;
    view.stumbleAvailable = world ? world.stumbleAvailable : true;
    view.playerSpriteKey = world ? world.player.spriteKey : VEHICLES[vehicleId].spriteKey;
    view.high = world ? getHigh(world.vehicleId) : getHigh(vehicleId);
    view.newBest = newBest;
    view.vehicleName = VEHICLES[vehicleId].name;
    view.soundOn = soundOn;
    view.hapticsOn = hapticsOn;
    view.hapticsSupported = haptics.supported;
    renderer.drawFrame(view);

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
attachTouch(onIntent);

/* Desktop mouse: menu button clicks. Touch never reaches here because
   the touch adapter suppresses synthetic clicks. */
canvas.addEventListener('click', (e) => {
  audio.unlock();
  if (mode !== 'playing') handleMenuTap(e.clientX, e.clientY);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseRun();
});
window.addEventListener('blur', pauseRun);

/* Sprites load once before the first frame; the game does not start
   on a half loaded sheet. */
loadSprites()
  .then(() => loop.start())
  .catch((err) => {
    console.error(err);
  });
