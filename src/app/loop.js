/*
  Fixed timestep loop: logic at exactly TUNING.logic.hz via an
  accumulator, rendering every animation frame with an interpolation
  alpha. The frame delta is clamped, and start() zeroes the clock and
  accumulator, so resuming after a backgrounded tab can never spiral
  into a burst of catch up steps.
*/

import { TUNING } from '../game/tuning.js';

export function createLoop({ update, render }) {
  let acc = 0;
  let last = null;
  let rafId = null;
  let running = false;

  function frame(now) {
    if (!running) return;
    if (last === null) last = now;
    let delta = now - last;
    last = now;
    if (delta > TUNING.logic.maxFrameDeltaMs) delta = TUNING.logic.maxFrameDeltaMs;
    acc += delta;
    const stepMs = 1000 / TUNING.logic.hz;
    while (acc >= stepMs) {
      update();
      acc -= stepMs;
    }
    render(acc / stepMs);
    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = null;
      acc = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
