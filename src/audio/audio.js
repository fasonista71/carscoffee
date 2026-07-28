/*
  Sound engine. Synthesized Web Audio placeholders (square and
  triangle blips, noise bursts) behind the event name registry, plus a
  soft two bar chip bass loop for music_loop.

  The swap seam Jason asked for: MANIFEST maps event names to file
  urls. Any entry present is fetched and decoded at unlock time and
  played instead of its synth placeholder. Dropping in real sound is
  editing that map, nothing more.

  iOS: an AudioContext starts suspended until created or resumed
  inside a user gesture (verified against current MDN autoplay
  guidance). unlock() is called from the Start button press, which is
  exactly such a gesture.
*/

/* Event name -> file url. Fill in when real sounds arrive. */
const MANIFEST = {};

export function createAudio() {
  let ctx = null;
  let muted = false;
  let manifestLoaded = false;
  const buffers = new Map();
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  function unlock() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (!manifestLoaded) {
      manifestLoaded = true;
      for (const [name, url] of Object.entries(MANIFEST)) {
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((ab) => c.decodeAudioData(ab))
          .then((buf) => buffers.set(name, buf))
          .catch((e) => console.warn('sound file failed, keeping synth for', name, e));
      }
    }
  }

  function ready() {
    return ctx !== null && ctx.state === 'running' && !muted;
  }

  function blip(freq, dur, type, vol, delay = 0, endFreq = null) {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, vol, delay = 0) {
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(gain).connect(ctx.destination);
    src.start(t0);
  }

  const SYNTH = {
    coffee_pickup() { blip(660, 0.06, 'square', 0.18); blip(990, 0.09, 'square', 0.18, 0.05); },
    heart_pickup() { blip(523, 0.07, 'square', 0.16); blip(659, 0.07, 'square', 0.16, 0.06); blip(1047, 0.12, 'square', 0.16, 0.12); },
    boost_start() { blip(220, 0.25, 'square', 0.16, 0, 880); },
    boost_end() { blip(660, 0.18, 'square', 0.1, 0, 220); },
    crash() { noiseBurst(0.35, 0.35); blip(110, 0.3, 'square', 0.2, 0, 40); },
    stumble() { blip(440, 0.1, 'square', 0.16, 0, 220); blip(330, 0.1, 'square', 0.16, 0.09, 165); noiseBurst(0.15, 0.15); },
    lane_change() { blip(880, 0.03, 'triangle', 0.06); },
    rubble_hit() { noiseBurst(0.12, 0.22); blip(90, 0.1, 'triangle', 0.14, 0, 60); },
    slick_slide() { blip(700, 0.35, 'triangle', 0.14, 0, 180); },
    fuel_low() { blip(523, 0.09, 'square', 0.16); blip(523, 0.09, 'square', 0.16, 0.14); },
    tier_up() { blip(523, 0.09, 'square', 0.16); blip(659, 0.09, 'square', 0.16, 0.08); blip(784, 0.16, 'square', 0.16, 0.16); },
    overtake() { noiseBurst(0.25, 0.08); blip(160, 0.25, 'triangle', 0.1, 0, 420); },
    siren() {
      blip(660, 0.16, 'square', 0.1);
      blip(880, 0.16, 'square', 0.1, 0.16);
      blip(660, 0.16, 'square', 0.09, 0.32);
      blip(880, 0.16, 'square', 0.09, 0.48);
    },
    boost_hint() { blip(1175, 0.05, 'square', 0.14); blip(1175, 0.05, 'square', 0.14, 0.09); },
    game_over() { blip(392, 0.14, 'square', 0.14); blip(330, 0.14, 'square', 0.14, 0.14); blip(262, 0.3, 'square', 0.14, 0.28); }
  };

  function play(name) {
    if (!ready()) return;
    const buf = buffers.get(name);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      return;
    }
    const fn = SYNTH[name];
    if (fn) fn();
  }

  /* A quiet two bar bass line, scheduled with a small lookahead. */
  const MUSIC_NOTES = [110, 110, 130.81, 110, 98, 98, 146.83, 130.81];
  const MUSIC_STEP_SEC = 0.28;

  function scheduleMusic() {
    if (!ready()) return;
    const buf = buffers.get('music_loop');
    if (buf) return; /* a real music file loops via playMusicFile below */
    while (nextNoteTime < ctx.currentTime + 0.4) {
      const t = Math.max(nextNoteTime, ctx.currentTime);
      blip(MUSIC_NOTES[musicStep % MUSIC_NOTES.length], 0.22, 'triangle', 0.045, t - ctx.currentTime);
      musicStep += 1;
      nextNoteTime = t + MUSIC_STEP_SEC;
    }
  }

  let musicFileSource = null;
  function playMusicFile() {
    const buf = buffers.get('music_loop');
    if (!buf || musicFileSource) return;
    musicFileSource = ctx.createBufferSource();
    musicFileSource.buffer = buf;
    musicFileSource.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    musicFileSource.connect(gain).connect(ctx.destination);
    musicFileSource.start();
  }

  function startMusic() {
    if (musicTimer !== null) return;
    musicStep = 0;
    nextNoteTime = 0;
    if (ctx && buffers.get('music_loop')) {
      playMusicFile();
      return;
    }
    musicTimer = setInterval(scheduleMusic, 200);
  }

  function stopMusic() {
    if (musicTimer !== null) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    if (musicFileSource) {
      try { musicFileSource.stop(); } catch (e) { /* already stopped */ }
      musicFileSource = null;
    }
  }

  return {
    unlock,
    play,
    startMusic,
    stopMusic,
    get muted() { return muted; },
    setMuted(m) { muted = m; }
  };
}
