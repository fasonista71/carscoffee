/*
  Keyboard adapter. Normalizes keys to intents and nothing else. Key
  repeat is ignored: one press, one intent.
*/

export function attachKeyboard(emit) {
  function onKeyDown(e) {
    if (e.repeat) return;
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
      default:
        break;
    }
  }
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
