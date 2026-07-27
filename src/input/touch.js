/*
  Touch adapter: swipe and tap zones, both active, normalized to the
  same intents the keyboard produces.

  Uses Touch Events rather than Pointer Events. This is deliberate:
  Touch Events are the oldest and most battle tested touch path on iOS
  Safari, and the pointer implementation there has a documented history
  of quirks. Revisit after the real device checkpoint if desired.

  preventDefault on touchstart and touchend also suppresses the
  synthetic mouse and click events iOS would otherwise emit, so the
  desktop click handler in app/ never double fires on touch devices.

  Gesture rules:
  - Finger travel past swipeThresholdPx classifies the touch as a
    swipe: dominant horizontal axis is a lane change in that direction,
    dominant vertical axis upward is boost, downward is unmapped.
  - A press and release under tapMaxMs with no swipe is a tap, resolved
    by screen third: left third lane left, right third lane right,
    center third boost.
  - A long still press does nothing, so a resting finger cannot fire.
  - A three finger touch toggles the dev overlay.
*/

import { TUNING } from '../game/tuning.js';

export function attachTouch(canvas, emit) {
  let start = null;
  let swipeConsumed = false;

  function findTouch(list, id) {
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].identifier === id) return list[i];
    }
    return null;
  }

  function onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length >= 3) {
      emit({ type: 'devtoggle' });
      start = null;
      return;
    }
    if (e.touches.length === 1) {
      const t = e.changedTouches[0];
      start = { x: t.clientX, y: t.clientY, time: e.timeStamp, id: t.identifier };
      swipeConsumed = false;
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (!start || swipeConsumed) return;
    const t = findTouch(e.changedTouches, start.id);
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const th = TUNING.input.swipeThresholdPx;
    if (Math.abs(dx) >= th || Math.abs(dy) >= th) {
      swipeConsumed = true;
      if (Math.abs(dx) >= Math.abs(dy)) {
        emit({ type: 'lane', dir: dx > 0 ? 1 : -1 });
      } else if (dy < 0) {
        emit({ type: 'boost' });
      }
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    if (!start) return;
    const t = findTouch(e.changedTouches, start.id);
    if (!t) return;
    const wasSwipe = swipeConsumed;
    const elapsed = e.timeStamp - start.time;
    const endX = t.clientX;
    start = null;
    swipeConsumed = false;
    if (wasSwipe || elapsed > TUNING.input.tapMaxMs) return;
    const rect = canvas.getBoundingClientRect();
    const rel = (endX - rect.left) / rect.width;
    if (rel < 1 / 3) emit({ type: 'lane', dir: -1 });
    else if (rel > 2 / 3) emit({ type: 'lane', dir: 1 });
    else emit({ type: 'boost' });
  }

  function onTouchCancel() {
    start = null;
    swipeConsumed = false;
  }

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchCancel);

  return () => {
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('touchcancel', onTouchCancel);
  };
}
