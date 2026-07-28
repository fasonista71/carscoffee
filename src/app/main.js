/*
  Bootstrap and state machine. Owns the world instance, drains input
  intents into the fixed timestep, snapshots state for interpolated
  rendering, and handles pause on visibility loss.

  States in this slice: title, playing, paused. The select screens and
  gameOver arrive in later build steps; the machine is a plain mode
  string plus routing in onIntent, which is all the brief's flow needs.
*/

import { TUNING, VEHICLES, ENVIRONMENTS } from '../game/tuning.js';
import { createWorld, step, distanceMeters, isBoosting } from '../game/world.js';
import { playerLaneFloat } from '../game/entities.js';
import { createRenderer } from '../render/renderer.js';
import { loadSprites } from '../render/sprites.js';
import { attachKeyboard } from '../input/keyboard.js';
import { attachTouch } from '../input/touch.js';
import { createLoop } from './loop.js';
import { createDevOverlay } from './devOverlay.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);

let mode = 'title';
let world = null;
let pending = [];
let prevSnap = { distancePx: 0, laneFloat: 1 };
let currSnap = prevSnap;

/* Persisted high score, per vehicle and environment so future
   combos never collide. */
const HIGH_KEY = 'cc.high.sports.city.v1';
let high = 0;
try {
  high = Number(localStorage.getItem(HIGH_KEY)) || 0;
} catch (e) {
  high = 0;
}
let newBest = false;

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
    vehicle: VEHICLES.sports,
    environment: ENVIRONMENTS.city
  });
  /* Pick up any live overlay tuning done on the title screen. */
  world.laneTweenMs = TUNING.movement.laneTweenMs;
  pending = [];
  newBest = false;
  prevSnap = currSnap = snapshot();
  mode = 'playing';
}

function pause() {
  if (mode === 'playing') mode = 'paused';
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
  if (intent.type === 'devtoggle') {
    overlay.toggle();
    return;
  }
  if (mode === 'title') {
    startRun();
    return;
  }
  if (mode === 'paused') {
    mode = 'playing';
    return;
  }
  if (mode === 'gameOver') {
    /* Instant restart: game over to playing again in one input. */
    startRun();
    return;
  }
  pending.push(intent.type === 'tapAt' ? resolveTap(intent.clientX) : intent);
}

let fps = 0;
let fpsFrames = 0;
let fpsWindowStart = performance.now();

const loop = createLoop({
  update() {
    if (mode !== 'playing' || !world) return;
    prevSnap = currSnap;
    const intents = pending;
    pending = [];
    step(world, intents);
    currSnap = snapshot();
    if (world.status === 'dead') {
      mode = 'gameOver';
      const meters = Math.floor(distanceMeters(world));
      if (meters > high) {
        high = meters;
        newBest = true;
        try {
          localStorage.setItem(HIGH_KEY, String(high));
        } catch (e) {
          /* private mode etc.; the run still works without persistence */
        }
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
    view.fuel = world ? world.fuel : TUNING.fuel.max;
    view.boosting = world ? isBoosting(world) : false;
    view.deathCause = world ? world.deathCause : null;
    view.meters = world ? Math.floor(distanceMeters(world)) : 0;
    view.spinFrames = world ? world.spinFrames : 0;
    view.invulnFrames = world ? world.invulnFrames : 0;
    view.tier = world ? world.tier : 0;
    view.tierFlashFrames = world ? world.tierFlashFrames : 0;
    view.stumbleAvailable = world ? world.stumbleAvailable : true;
    view.high = high;
    view.newBest = newBest;
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

/* Desktop mouse: advance title and paused screens. Touch never reaches
   here because the touch adapter suppresses synthetic clicks. */
canvas.addEventListener('click', () => {
  if (mode === 'title') startRun();
  else if (mode === 'paused') mode = 'playing';
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('blur', pause);

/* Sprites load once before the first frame; the game does not start
   on a half loaded sheet. */
loadSprites()
  .then(() => loop.start())
  .catch((err) => {
    console.error(err);
  });
