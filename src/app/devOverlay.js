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
    'width: 230px',
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
