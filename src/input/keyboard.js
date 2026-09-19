/*
  Keyboard adapter. Normalizes keys to intents and nothing else. Key
  repeat is ignored: one press, one intent.
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
        emit({ type: 'boost' });
        break;
      case 'Escape':
      case 'KeyP':
        e.preventDefault();
        emit({ type: 'pause' });
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
