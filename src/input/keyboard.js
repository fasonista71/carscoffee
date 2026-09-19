/*
  Keyboard adapter. Normalizes keys to intents and nothing else. Key
  repeat is ignored: one press, one intent.

  Arrows and WASD steer, up and W and Space boost, Escape and P pause,
  Enter and Space confirm a menu, R restarts. The scroll keys the game
  does not use are swallowed rather than ignored, because an unhandled
  one reaches the embedding page and pulls it out from under the
  player mid run.
*/

export function attachKeyboard(emit) {
  function onKeyDown(e) {
    if (e.repeat) return;
    /* While a text field has focus (initials entry, dev overlay), the
       field owns the keyboard and gameplay ignores it. */
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault();
        emit({ type: 'lane', dir: -1 });
        break;
      case 'ArrowRight':
      case 'KeyD':
        e.preventDefault();
        emit({ type: 'lane', dir: 1 });
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        e.preventDefault();
        /* Boost in play, confirm on a menu. The adapter does not know
           which, so it says both and the app picks. */
        emit({ type: 'boost' });
        emit({ type: 'confirm' });
        break;
      case 'Escape':
      case 'KeyP':
        e.preventDefault();
        emit({ type: 'pause' });
        break;
      /* Menus were mouse only: a desktop player could not start a
         run, restart one, or reach Go again without pointing at it.
         Enter and Space confirm the primary button everywhere, which
         is the one keyboard convention no game skips. Space is also
         boost, and the app routes it by mode, so it never means both
         at once. */
      case 'Enter':
      case 'NumpadEnter':
        e.preventDefault();
        emit({ type: 'confirm' });
        break;
      /* R restarts from the game over and paused screens, as it does
         in most things with a game over screen. */
      case 'KeyR':
        e.preventDefault();
        emit({ type: 'restart' });
        break;
      case 'ArrowDown':
      case 'KeyS':
      case 'PageUp':
      case 'PageDown':
      case 'Home':
      case 'End':
        /* The game does nothing with these, but embedded in a page an
           unhandled scroll key reaches the host and pulls the page out
           from under the player mid run. Swallow them and emit
           nothing. */
        e.preventDefault();
        break;
      default:
        break;
    }
  }
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
