/*
  Initials entry. A real text input rather than a canvas letter
  picker, so a phone raises its own keyboard and a desktop player can
  simply type.

  iOS only opens the keyboard from inside a user gesture, and the game
  over screen arrives without one, so focus() is attempted for desktop
  but the field is drawn large and obviously tappable for touch: the
  tap that focuses it is the gesture that opens the keyboard.

  The panel carries an id that the touch adapter checks, so the swipe
  and tap handlers leave it alone.

  Three iOS specific problems were fixed here, all on the primary
  surface and none of them reachable by the automation:

  1. The input inherited -webkit-user-select: none from <body> and
     never overrode it, which is the long standing WebKit cause of a
     field that will not take a caret. It now sets it explicitly.
  2. The card was centred on the layout viewport, which iOS does not
     shrink when the keyboard opens, so on a small phone the Save
     button sat underneath the keyboard with position: fixed and
     overflow: hidden leaving nothing to scroll. The panel now tracks
     visualViewport and can scroll as a fallback.
  3. There was one exit control and no way past it. If the field would
     not focus or Save was hidden, the only recovery was reloading the
     page, against the promise that you can abandon a run in ten
     seconds without losing anything. There is now a Skip control and
     a backdrop tap.

  The field is also pre-filled with the default rather than
  substituting it silently: leaderboard.cleanName falls back to AAA
  for an empty commit, and a player who tapped Save without typing
  used to get AAA on the board with nothing having said so.
*/

import { NAME_LENGTH } from './leaderboard.js';

export function createInitialsEntry(onCommit) {
  const panel = document.createElement('div');
  panel.id = 'initials-entry';
  panel.style.cssText = [
    'position: fixed',
    'left: 0',
    'top: 0',
    'width: 100%',
    'height: 100%',
    'z-index: 20',
    'display: none',
    /* Anchored near the top rather than centred, so the keyboard
       rising from the bottom has somewhere to go, and scrollable so
       the card is always reachable even if it does not. */
    'align-items: flex-start',
    'justify-content: center',
    'padding: 6vh 0 24px',
    'box-sizing: border-box',
    'overflow-y: auto',
    '-webkit-overflow-scrolling: touch',
    'background: rgba(26, 28, 44, 0.82)',
    'touch-action: auto'
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'width: min(280px, 80vw)',
    'padding: 18px 16px',
    'text-align: center',
    'background: #262b44',
    'border: 2px solid #ffd93d',
    'color: #f4f4f4',
    'font: 13px/1.6 ui-monospace, Menlo, monospace',
    'letter-spacing: 0.08em',
    'text-transform: uppercase'
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Top five';
  title.style.cssText = 'color:#ffd93d;margin-bottom:2px;';

  const score = document.createElement('div');
  score.style.cssText = 'margin-bottom:12px;font-size:11px;color:#9aa7c4;';

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = NAME_LENGTH;
  input.autocomplete = 'off';
  input.autocapitalize = 'characters';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Your initials, three characters');
  input.style.cssText = [
    'width: 100%',
    'box-sizing: border-box',
    'padding: 12px 0',
    'text-align: center',
    'font: 34px/1 ui-monospace, Menlo, monospace',
    'letter-spacing: 0.35em',
    'text-indent: 0.35em',
    'text-transform: uppercase',
    'color: #f4f4f4',
    'background: #1a1c2c',
    'border: 2px solid #5a5a6e',
    'border-radius: 0',
    'outline: none',
    /* html, body set user-select: none and the panel is a child of
       body. Without this the field can refuse a caret on WebKit. */
    '-webkit-user-select: text',
    'user-select: text'
  ].join(';');

  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Save';
  save.style.cssText = [
    'margin-top: 14px',
    'width: 100%',
    'padding: 12px 0',
    'font: 14px/1 ui-monospace, Menlo, monospace',
    'letter-spacing: 0.12em',
    'text-transform: uppercase',
    'color: #262b44',
    'background: #ffd93d',
    'border: 0',
    'cursor: pointer'
  ].join(';');

  /* The way out. The run is already scored and any new personal best
     is already persisted before this panel opens, so skipping keeps
     the board entry under the initials shown in the field and costs
     the player nothing. */
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.textContent = 'Skip';
  skip.style.cssText = [
    'margin-top: 8px',
    'width: 100%',
    'padding: 9px 0',
    'font: 11px/1 ui-monospace, Menlo, monospace',
    'letter-spacing: 0.12em',
    'text-transform: uppercase',
    'color: #9aa7c4',
    'background: transparent',
    'border: 0',
    'cursor: pointer'
  ].join(';');

  const hint = document.createElement('div');
  hint.textContent = 'Three letters or numbers';
  hint.style.cssText = 'margin-top:10px;font-size:10px;color:#5a5a6e;';

  card.appendChild(title);
  card.appendChild(score);
  card.appendChild(input);
  card.appendChild(save);
  card.appendChild(skip);
  card.appendChild(hint);
  panel.appendChild(card);
  document.body.appendChild(panel);

  /*
    iOS reports the space the keyboard leaves through visualViewport
    and nowhere else. Sizing the panel to it keeps the card and the
    Save button inside the part of the screen the player can see.
  */
  const vv = window.visualViewport;
  function fitToViewport() {
    if (!vv || panel.style.display === 'none') return;
    panel.style.height = vv.height + 'px';
    panel.style.top = vv.offsetTop + 'px';
  }
  if (vv) {
    vv.addEventListener('resize', fitToViewport);
    vv.addEventListener('scroll', fitToViewport);
  }

  input.addEventListener('focus', () => { input.select(); });
  input.addEventListener('keydown', (e) => {
    /* The field owns its keys; gameplay must not see them. */
    e.stopPropagation();
    if (e.key === 'Enter') commit();
  });
  save.addEventListener('click', commit);
  skip.addEventListener('click', commit);
  /* A tap on the scrim, not on the card, is also a way out. */
  panel.addEventListener('click', (e) => { if (e.target === panel) commit(); });

  let open = false;

  function commit() {
    if (!open) return;
    open = false;
    panel.style.display = 'none';
    input.blur();
    onCommit(input.value);
  }

  return {
    isOpen() { return open; },
    show(meters) {
      open = true;
      /* Pre-filled, not blank. cleanName substitutes AAA for an empty
         commit either way; showing it makes the default visible and
         editable instead of silent, and focus() selects it so the
         first keystroke replaces it. */
      input.value = 'AAA';
      score.textContent = meters + ' m';
      panel.style.display = 'flex';
      fitToViewport();
      /* Works on desktop; on iOS the player's tap does it instead. */
      try { input.focus(); } catch (e) { /* ignore */ }
    }
  };
}
