/*
  Touch adapter: swipe and tap zones, both active, normalized to the
  same intents the keyboard produces.

  Listens on the whole viewport, not the canvas. The canvas is
  letterboxed, so canvas only listeners leave a band of dead screen
  around the play area, and lane taps land exactly there. Tap zones
  are therefore screen thirds, not canvas thirds.

  Every touch is tracked independently by identifier, so a second tap
  that begins before the first finger has lifted still registers. Fast
  alternating thumb taps depend on this.

  Uses Touch Events rather than Pointer Events. This is deliberate:
  Touch Events are the oldest and most battle tested touch path on iOS
  Safari, and the pointer implementation there has a documented history
  of quirks. Revisit after the real device checkpoint if desired.

  preventDefault here also suppresses the synthetic mouse and click
  events iOS would otherwise emit, so the desktop click handler in
  app/ never double fires on touch devices. Touches that start on the
  dev overlay are left alone entirely so its sliders keep working.

  Gesture rules:
  - Finger travel past swipeThresholdPx classifies the touch as a
    swipe: dominant horizontal axis is a lane change in that direction,
    dominant vertical axis upward is boost, downward is unmapped.
  - A release with no swipe within tapMaxMs is a tap. The adapter does
    not decide what a tap means; it emits the position and the app
    resolves it per TUNING.input.tapMode, since resolution can depend
    on canvas geometry and car position, which input has no business
    knowing.
  - A three finger touch toggles the dev overlay.
*/

import { TUNING } from '../game/tuning.js';

export function attachTouch(emit) {
  /* identifier -> { x, y, time, swiped } */
  const active = new Map();

  function onOverlay(e) {
    return Boolean(e.target && e.target.closest && e.target.closest('#dev-overlay'));
  }

  function onTouchStart(e) {
    if (onOverlay(e)) return;
    e.preventDefault();
    if (e.touches.length >= 3) {
      emit({ type: 'devtoggle' });
      active.clear();
      return;
    }
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      const t = e.changedTouches[i];
      active.set(t.identifier, { x: t.clientX, y: t.clientY, time: e.timeStamp, swiped: false });
    }
  }

  function onTouchMove(e) {
    if (onOverlay(e)) return;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      const t = e.changedTouches[i];
      const rec = active.get(t.identifier);
      if (!rec || rec.swiped) continue;
      const dx = t.clientX - rec.x;
      const dy = t.clientY - rec.y;
      const th = TUNING.input.swipeThresholdPx;
      if (Math.abs(dx) >= th || Math.abs(dy) >= th) {
        rec.swiped = true;
        if (Math.abs(dx) >= Math.abs(dy)) {
          emit({ type: 'lane', dir: dx > 0 ? 1 : -1 });
        } else if (dy < 0) {
          emit({ type: 'boost' });
        }
      }
    }
  }

  function onTouchEnd(e) {
    if (onOverlay(e)) return;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      const t = e.changedTouches[i];
      const rec = active.get(t.identifier);
      if (!rec) continue;
      active.delete(t.identifier);
      if (rec.swiped) continue;
      if (e.timeStamp - rec.time > TUNING.input.tapMaxMs) continue;
      emit({ type: 'tapAt', clientX: t.clientX });
    }
  }

  function onTouchCancel(e) {
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      active.delete(e.changedTouches[i].identifier);
    }
  }

  window.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: false });
  window.addEventListener('touchcancel', onTouchCancel);

  return () => {
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchCancel);
  };
}
