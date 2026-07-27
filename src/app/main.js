/*
  Bootstrap and state machine. Owns the world instance, drains input
  intents into the fixed timestep, snapshots state for interpolated
  rendering, and handles pause on visibility loss.

  States in this slice: title, playing, paused. The select screens and
  gameOver arrive in later build steps; the machine is a plain mode
  string plus routing in onIntent, which is all the brief's flow needs.
*/

import { TUNING, VEHICLES, ENVIRONMENTS } from '../game/tuning.js';
import { createWorld, step, distanceMeters } from '../game/world.js';
import { playerLaneFloat } from '../game/entities.js';
import { createRenderer } from '../render/renderer.js';
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

const overlay = createDevOverlay(() => world);

function snapshot() {
  return { distancePx: world.distancePx, laneFloat: playerLaneFloat(world.player) };
}

function startRun() {
  world = createWorld({
    seed: 0xc0ffee,
    vehicle: VEHICLES.sports,
    environment: ENVIRONMENTS.city
  });
  /* Pick up any live overlay tuning done on the title screen. */
  world.laneTweenMs = TUNING.movement.laneTweenMs;
  pending = [];
  prevSnap = currSnap = snapshot();
  mode = 'playing';
}

function pause() {
  if (mode === 'playing') mode = 'paused';
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
  pending.push(intent);
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
attachTouch(canvas, onIntent);

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

loop.start();
