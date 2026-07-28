/*
  Entity factories and pure helpers. Pickups are added in build step 6.
*/

import { TUNING } from './tuning.js';

/*
  Lane geometry, shared by simulation (collision) and rendering
  (drawing), so the two can never disagree about where a lane is.
*/
export function laneCenterXPx(laneFloat) {
  return TUNING.road.roadLeftPx + TUNING.road.laneWidthPx * (laneFloat + 0.5);
}

export function createPlayer(vehicle) {
  return {
    lane: 1,
    tween: null,
    queuedDir: 0,
    hitbox: { wPx: vehicle.hitbox.wPx, hPx: vehicle.hitbox.hPx },
    spriteKey: vehicle.spriteKey
  };
}

/*
  Smoothstep: an S curve that starts gently, commits through the
  middle, and settles into the target lane. The previous ease out
  curve jumped immediately and decelerated, which read as an abrupt
  snap on device; this is the organic lane shift.
*/
function easeSmooth(t) {
  return t * t * (3 - 2 * t);
}

/*
  The player's lane position as a float, easing applied. 0 is the left
  lane. During a tween this lands between lanes; the renderer maps it
  to an x coordinate.
*/
export function playerLaneFloat(player) {
  if (!player.tween) return player.lane;
  const t = player.tween.frame / player.tween.totalFrames;
  return player.tween.from + (player.tween.to - player.tween.from) * easeSmooth(t);
}
