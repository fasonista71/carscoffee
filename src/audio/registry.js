/*
  Audio lands in build step 10: an event name registry with synthesized
  Web Audio placeholders, an explicit first tap unlock for iOS, and a
  manifest seam so real files replace placeholders by editing a map of
  event names to file paths.

  The file exists now so the seam is fixed. Nothing imports it yet.
*/

export const AUDIO_EVENTS = [
  'coffee_pickup',
  'heart_pickup',
  'boost_start',
  'boost_end',
  'crash',
  'stumble',
  'lane_change',
  'rubble_hit',
  'slick_slide',
  'fuel_low',
  'tier_up',
  'overtake',
  'siren',
  'boost_hint',
  'game_over',
  'music_loop'
];
