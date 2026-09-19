/*
  Haptics behind an interface, per the brief: feature detect
  navigator.vibrate on web, so native haptics can slot into this same
  seam later. iOS Safari does not implement vibrate, so on iPhones
  this stays silent until the native wrap; Android phones buzz today.
*/

const PATTERNS = {
  heart_pickup: [15, 20, 15],
  crash: [70, 50, 90],
  stumble: [40, 30, 40],
  rubble_hit: [25],
  slick_slide: [15, 25, 15],
  boost_start: [12],
  /* A crossing has more to it than a lane change, which has no
     pattern at all: two short taps, the tyres and then the landing. */
  lane_sweep: [10, 30, 10],
  tier_up: [20, 25, 20],
  overtake: [8, 20, 8],
  siren: [12, 40, 12, 40, 12],
  boost_hint: [10, 30, 10],
  game_over: [80],
  /* A menu press should feel like a button, not like a crash. These
     are the lightest patterns in the table on purpose. */
  ui_press: [8],
  ui_confirm: [12, 20, 12],
  ui_toggle_on: [10],
  ui_toggle_off: [10]
};

export function createHaptics() {
  const supported = typeof navigator !== 'undefined'
    && typeof navigator.vibrate === 'function';
  let enabled = true;

  return {
    supported,
    get enabled() { return enabled; },
    setEnabled(v) { enabled = v; },
    trigger(name) {
      if (!supported || !enabled) return;
      const pattern = PATTERNS[name];
      if (pattern) navigator.vibrate(pattern);
    }
  };
}
