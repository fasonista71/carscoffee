/*
  Entity factories and pure helpers. Obstacles and pickups are added in
  build steps 4 and 6; only the player exists in this slice.
*/

export function createPlayer(vehicle) {
  return {
    lane: 1,
    tween: null,
    queuedDir: 0,
    hitbox: { wPx: vehicle.hitbox.wPx, hPx: vehicle.hitbox.hPx },
    spriteKey: vehicle.spriteKey
  };
}

function easeOutQuad(t) {
  return t * (2 - t);
}

/*
  The player's lane position as a float, easing applied. 0 is the left
  lane. During a tween this lands between lanes; the renderer maps it
  to an x coordinate.
*/
export function playerLaneFloat(player) {
  if (!player.tween) return player.lane;
  const t = player.tween.frame / player.tween.totalFrames;
  return player.tween.from + (player.tween.to - player.tween.from) * easeOutQuad(t);
}
