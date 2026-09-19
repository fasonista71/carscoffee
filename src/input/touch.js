/*
  Touch adapter: swipe and tap zones, both active, normalized to the
  same intents the keyboard produces.

  Listens on the stage element, which fills the viewport, rather than
  the canvas or the window. Two reasons, and they pull in opposite
  directions.

  Not the canvas: it is letterboxed, so canvas only listeners leave a
  band of dead screen around the play area, and lane taps land exactly
  there. Tap zones are screen thirds, not canvas thirds.

  Not the window: since iOS 11.3, WebKit makes touchstart and touchmove
  listeners on window, document and body passive by DEFAULT, and a
  passive listener cannot preventDefault. That matters more than it
  sounds, because Apple documents that a one finger drag is a pan, and
  during a pan iOS sends the page no touch events at all. Fail to
  prevent the default and you do not merely fail to stop a scroll, you
  stop receiving the gesture. Taps still arrive, drags vanish. A
  listener on an ordinary element is not covered by that rule.

  Every touch is tracked independently by identifier, so a second tap
  that begins before the first finger has lifted still registers. Fast
  alternating thumb taps depend on this.

  That claim used to be false. A second contact ran active.clear() and
  threw away the in-flight gesture, so two thumbs produced no lane
  changes at all and then a pause on lift. On a two thumb fidget game
  that is the whole control scheme gone. Nothing caught it because no
  test drives this adapter.

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
    dominant vertical axis upward is boost, downward is unmapped and
    reserved, because the genre reads down as duck or brake.
  - A release with no swipe within tapMaxMs is a tap. The adapter does
    not decide what a tap means; it emits the position and the app
    resolves it per TUNING.input.tapMode, since resolution can depend
    on canvas geometry and car position, which input has no business
    knowing.
  - Two fingers down together, with neither of them doing anything
    else, is also a pause. If either finger tapped or swiped, the
    gesture was play and no pause is emitted: alternating thumbs
    routinely put two fingers on the glass at once and must never
    pause the run.
  - Two fingers is the backup for the pause button in the HUD, and it
    toggles, so it also resumes.

  There is deliberately no gesture for the dev overlay. It used to be
  three fingers, which shipped, and meant a player could open a panel
  of live tuning sliders by accident. The overlay is now behind a URL
  parameter and is not in the build at all.
*/

import { TUNING } from '../game/tuning.js';

export function attachTouch(emit, target) {
  /* The stage element when the app hands us one, the window only as a
     last resort (see the passive by default note above). */
  const node = target || document.getElementById('stage') || window;
  /* identifier -> { x, y, time, swiped } */
  const active = new Map();
  /* Most fingers seen during the current gesture, and whether any of
     them did something the player meant as play. Both are resolved
     when the last finger lifts and reset on cancel, because a gesture
     the OS steals must not leave its count behind to poison the next
     tap. */
  let gestureMax = 0;
  let gesturePlayed = false;

  function onOverlay(e) {
    return Boolean(e.target && e.target.closest
      && e.target.closest('#dev-overlay, #initials-entry'));
  }

  function onTouchStart(e) {
    if (onOverlay(e)) return;
    e.preventDefault();
    gestureMax = Math.max(gestureMax, e.touches.length);
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      const t = e.changedTouches[i];
      active.set(t.identifier, { x: t.clientX, y: t.clientY, time: e.timeStamp, swiped: false });
      /* Where the finger went down, so a menu can show the button
         pressed while it is held. Gameplay ignores this entirely:
         nothing may act on a press, only on a release. */
      emit({ type: 'pressAt', clientX: t.clientX, clientY: t.clientY });
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
        gesturePlayed = true;
        /* Dragged off, so it is not being pressed any more. */
        emit({ type: 'pressEnd' });
        if (Math.abs(dx) >= Math.abs(dy)) {
          emit({ type: 'lane', dir: dx > 0 ? 1 : -1 });
        } else if (dy < 0) {
          emit({ type: 'boost' });
        }
        /* Downward is deliberately unmapped. It briefly meant pause,
           which is wrong twice over: in every runner a player has
           met, down is duck, slide or brake, and on an iPhone a
           downward swipe that starts near the top edge belongs to
           Notification Centre. Pause is a button in the HUD now. */
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
      if (rec.swiped || e.timeStamp - rec.time > TUNING.input.tapMaxMs) {
        /* Not a clean tap, but menus still want to know where the
           finger lifted: a slightly sloppy press must press buttons.
           Gameplay ignores this intent entirely. */
        emit({ type: 'releaseAt', clientX: t.clientX, clientY: t.clientY });
        continue;
      }
      gesturePlayed = true;
      emit({ type: 'tapAt', clientX: t.clientX, clientY: t.clientY });
    }
    if (e.touches.length === 0) {
      /* A pause only when two fingers were down together and neither
         of them played. Two thumbs mid rally hit gestureMax 2 all the
         time and must be left alone. */
      if (gestureMax === 2 && !gesturePlayed) emit({ type: 'pause' });
      gestureMax = 0;
      gesturePlayed = false;
    }
  }

  function onTouchCancel(e) {
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      active.delete(e.changedTouches[i].identifier);
    }
    /* The OS took the gesture; nothing is being held any more. */
    emit({ type: 'pressEnd' });
    /* A notification, a call or a control centre swipe cancels the
       gesture. Without this reset the count survived into the next
       one, so a single later tap could fire a pause. */
    if (e.touches.length === 0) {
      gestureMax = 0;
      gesturePlayed = false;
    }
  }

  node.addEventListener('touchstart', onTouchStart, { passive: false });
  node.addEventListener('touchmove', onTouchMove, { passive: false });
  node.addEventListener('touchend', onTouchEnd, { passive: false });
  node.addEventListener('touchcancel', onTouchCancel);

  return () => {
    node.removeEventListener('touchstart', onTouchStart);
    node.removeEventListener('touchmove', onTouchMove);
    node.removeEventListener('touchend', onTouchEnd);
    node.removeEventListener('touchcancel', onTouchCancel);
  };
}
