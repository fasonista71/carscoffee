/*
  Pointer adapter: the fallback for browsers that hand this game mouse
  style input instead of touch events.

  iOS Safari in Desktop mode does exactly that. A finger produces
  pointer and mouse events with pointerType 'mouse', and no touch
  events at all, so the touch adapter never fires and the only thing
  that still worked was the menu, which had a click handler of its
  own. This adapter closes that gap: same thresholds, same intents, so
  a drag is a swipe and a press is a tap wherever pointers exist.

  Ownership rules, so nothing ever fires twice:
  - pointerType 'touch' is always the touch adapter's, never ours.
    Deciding that by "no touch event has arrived yet" looks tempting
    and is wrong: pointerdown precedes touchstart, so the first
    gesture of every session would be handled by both.
  - preventDefault on pointerdown suppresses the compatibility mouse
    and click events, the same way the touch adapter does.
  - handledRecently() lets the legacy click handler stand down. A
    browser with neither touch nor pointer events still gets taps
    through that handler, which is the last line of defence.
*/

import { TUNING } from '../game/tuning.js';

export function attachPointer(emit) {
  let rec = null;
  let handledAt = -Infinity;

  function onOverlay(e) {
    return Boolean(e.target && e.target.closest
      && e.target.closest('#dev-overlay, #initials-entry'));
  }

  function owns(e) {
    if (onOverlay(e)) return false;
    /* A browser that calls this a touch will also send touch events. */
    if (e.pointerType === 'touch') return false;
    return true;
  }

  function onDown(e) {
    if (!owns(e)) return;
    e.preventDefault();
    rec = { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp, swiped: false };
    emit({ type: 'pressAt', clientX: e.clientX, clientY: e.clientY });
  }

  function onMove(e) {
    if (!rec || e.pointerId !== rec.id || rec.swiped) return;
    const dx = e.clientX - rec.x;
    const dy = e.clientY - rec.y;
    const th = TUNING.input.swipeThresholdPx;
    if (Math.abs(dx) >= th || Math.abs(dy) >= th) {
      rec.swiped = true;
      handledAt = e.timeStamp;
      emit({ type: 'pressEnd' });
      if (Math.abs(dx) >= Math.abs(dy)) emit({ type: 'lane', dir: dx > 0 ? 1 : -1 });
      else if (dy < 0) emit({ type: 'boost' });
    }
  }

  function onUp(e) {
    if (!rec || e.pointerId !== rec.id) return;
    const r = rec;
    rec = null;
    handledAt = e.timeStamp;
    if (r.swiped || e.timeStamp - r.time > TUNING.input.tapMaxMs) {
      emit({ type: 'releaseAt', clientX: e.clientX, clientY: e.clientY });
      return;
    }
    emit({ type: 'tapAt', clientX: e.clientX, clientY: e.clientY });
  }

  function onCancel() { rec = null; emit({ type: 'pressEnd' }); }

  if (typeof window.PointerEvent === 'function') {
    window.addEventListener('pointerdown', onDown, { passive: false });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: false });
    window.addEventListener('pointercancel', onCancel);
  }

  return {
    /* True if this adapter has just resolved a gesture, so the legacy
       click handler can stand down rather than fire it twice. */
    handledRecently(now) {
      return now - handledAt < 700;
    }
  };
}
