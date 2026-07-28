/*
  Dev tuning overlay, movement slice. Toggle with backtick on keyboard
  or a three finger tap on touch. Sliders write straight into TUNING
  (and the live world where a value was copied at run start), so
  changes apply immediately without a restart.

  The full overlay described in the brief grows here in build step 12.
*/

import { TUNING } from '../game/tuning.js';

export function createDevOverlay(getWorld) {
  const panel = document.createElement('div');
  panel.id = 'dev-overlay';
  panel.style.cssText = [
    'position: fixed',
    'top: 8px',
    'left: 8px',
    'z-index: 10',
    'display: none',
    'width: 240px',
    'max-height: 86vh',
    'overflow-y: auto',
    'padding: 10px',
    'background: rgba(20, 22, 38, 0.92)',
    'color: #f4f4f4',
    'font: 12px/1.5 monospace',
    'border: 1px solid #5fcde4',
    'touch-action: auto',
    '-webkit-user-select: none',
    'user-select: none'
  ].join(';');

  const stats = document.createElement('div');
  stats.style.cssText = 'margin-bottom: 8px; white-space: pre;';
  panel.appendChild(stats);

  function addSlider(label, min, max, stepSize, get, set) {
    const row = document.createElement('label');
    row.style.cssText = 'display: block; margin-bottom: 6px;';
    const caption = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(stepSize);
    input.value = String(get());
    input.style.cssText = 'width: 100%;';
    const refresh = () => {
      caption.textContent = label + ': ' + get();
    };
    input.addEventListener('input', () => {
      set(Number(input.value));
      refresh();
    });
    refresh();
    row.appendChild(caption);
    row.appendChild(input);
    panel.appendChild(row);
  }

  function addSelect(label, options, get, set) {
    const row = document.createElement('label');
    row.style.cssText = 'display: block; margin-bottom: 6px;';
    const caption = document.createElement('div');
    caption.textContent = label;
    const sel = document.createElement('select');
    sel.style.cssText = 'width: 100%; font: 12px monospace;';
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      sel.appendChild(opt);
    }
    sel.value = get();
    sel.addEventListener('change', () => set(sel.value));
    row.appendChild(caption);
    row.appendChild(sel);
    panel.appendChild(row);
  }

  addSelect('Tap mode', ['lane', 'thirds'],
    () => TUNING.input.tapMode,
    (v) => { TUNING.input.tapMode = v; });

  addSlider('Lane tween ms', 60, 300, 10,
    () => TUNING.movement.laneTweenMs,
    (v) => {
      TUNING.movement.laneTweenMs = v;
      const w = getWorld();
      if (w) w.laneTweenMs = v;
    });

  addSlider('Scroll px per sec', 60, 400, 10,
    () => TUNING.speed.basePxPerSec,
    (v) => { TUNING.speed.basePxPerSec = v; });

  addSlider('Swipe threshold px', 8, 64, 2,
    () => TUNING.input.swipeThresholdPx,
    (v) => { TUNING.input.swipeThresholdPx = v; });

  addSlider('Tap max ms', 100, 800, 10,
    () => TUNING.input.tapMaxMs,
    (v) => { TUNING.input.tapMaxMs = v; });

  function addSection(title) {
    const el = document.createElement('div');
    el.textContent = title;
    el.style.cssText = 'margin: 10px 0 4px; color: #ffd93d; font-weight: bold;';
    panel.appendChild(el);
  }

  addSection('Boost');

  addSlider('Boost duration ms', 400, 2500, 50,
    () => TUNING.boost.durationMs,
    (v) => { TUNING.boost.durationMs = v; });

  addSlider('Boost multiplier', 1.1, 2, 0.05,
    () => TUNING.boost.speedMultiplier,
    (v) => { TUNING.boost.speedMultiplier = v; });

  addSlider('Boost min fuel', 0, 30, 1,
    () => TUNING.boost.minFuel,
    (v) => { TUNING.boost.minFuel = v; });

  addSection('Fuel');

  addSlider('Fuel drain per sec', 0.5, 6, 0.1,
    () => TUNING.fuel.passiveDrainPerSec,
    (v) => { TUNING.fuel.passiveDrainPerSec = v; });

  addSlider('Boost drain per sec', 2, 30, 1,
    () => TUNING.fuel.boostDrainPerSec,
    (v) => { TUNING.fuel.boostDrainPerSec = v; });

  addSlider('Coffee refill', 5, 50, 1,
    () => TUNING.fuel.coffeeRefill,
    (v) => { TUNING.fuel.coffeeRefill = v; });

  addSlider('Rubble fuel cost', 0, 30, 1,
    () => TUNING.hazards.rubble.fuelCost,
    (v) => { TUNING.hazards.rubble.fuelCost = v; });

  addSection('Coffee and hazards');

  addSlider('Cup chance per row', 0, 0.6, 0.02,
    () => TUNING.coffee.spawnChancePerRow,
    (v) => { TUNING.coffee.spawnChancePerRow = v; });

  addSlider('In tension ratio', 0.5, 1, 0.05,
    () => TUNING.coffee.tensionRatio,
    (v) => { TUNING.coffee.tensionRatio = v; });

  addSlider('Hazard chance per gap', 0, 0.8, 0.05,
    () => TUNING.hazards.spawnChancePerGap,
    (v) => { TUNING.hazards.spawnChancePerGap = v; });

  addSection('Tiers');

  for (let i = 0; i < TUNING.tiers.length; i += 1) {
    if (i > 0) {
      addSlider('T' + (i + 1) + ' at meters', 500, 14000, 250,
        () => TUNING.tiers[i].atMeters,
        (v) => { TUNING.tiers[i].atMeters = v; });
    }
    addSlider('T' + (i + 1) + ' speed', 1, 2.2, 0.02,
      () => TUNING.tiers[i].speed,
      (v) => { TUNING.tiers[i].speed = v; });
    addSlider('T' + (i + 1) + ' gap span', 1.05, 1.9, 0.05,
      () => TUNING.tiers[i].gapJitterMax,
      (v) => { TUNING.tiers[i].gapJitterMax = v; });
  }

  document.body.appendChild(panel);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') toggle();
  });

  function toggle() {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }

  function setStats({ fps, meters }) {
    if (panel.style.display === 'none') return;
    stats.textContent = 'fps ' + fps + '\ndistance ' + meters + ' m';
  }

  return { toggle, setStats };
}
