/*
  Sound engine. Synthesized Web Audio placeholders (square and
  triangle blips, noise bursts) behind the event name registry, plus a
  arranged chip theme for music_loop, written as data in theme.js.

  The swap seam Jason asked for: MANIFEST maps event names to file
  urls. Any entry present is fetched and decoded at unlock time and
  played instead of its synth placeholder. Dropping in real sound is
  editing that map, nothing more.

  iOS: an AudioContext starts suspended until created or resumed
  inside a user gesture (verified against current MDN autoplay
  guidance). unlock() is called from the Start button press, which is
  exactly such a gesture. Separately, the Ring/Silent switch mutes
  Web Audio in mobile Safari unless the page claims a playback audio
  session; claimPlaybackSession below does that.
*/

import { voicesAtStep, STEP_SEC, SONG_STEPS } from './theme.js';

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

  /*
    Nothing in here may ever throw into a caller. unlock() is the
    first statement of the intent handler, so an exception escaping
    this function would propagate out of the touch listener and kill
    every gesture for the rest of the session while the title screen
    sat there looking fine. Safari can refuse a context (the per page
    concurrent context limit, or a managed WebView with audio off),
    so the constructor is guarded and the failure is remembered:
    ready() is false forever after, every voice no ops, and the game
    runs silently. That is the stated invariant, audio never blocks
    play.
  */
  let ctxFailed = false;

  function ensureCtx() {
    if (ctx) return ctx;
    if (ctxFailed) return null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { ctxFailed = true; return null; }
      ctx = new AC();
    } catch (e) {
      ctxFailed = true;
      ctx = null;
      return null;
    }
    return ctx;
  }

  /*
    The iPhone Ring/Silent switch. A game that draws to a canvas gets
    muted by the hardware switch while a video on the same page does
    not, because the page never claimed a media style audio session.
    navigator.audioSession is the standardised way to claim one (W3C
    Audio Session API); where that is missing, a looping near silent
    element nudges Safari into the media category, which is the long
    standing workaround. Both are best effort: neither throws where
    it is unsupported, and neither is needed on desktop.
  */
  const SILENT_WAV = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
  let sessionClaimed = false;
  let keepAlive = null;

  function claimPlaybackSession() {
    if (sessionClaimed) return;
    sessionClaimed = true;
    try {
      if (navigator.audioSession) {
        navigator.audioSession.type = 'playback';
        return;
      }
    } catch (e) { /* property refused, fall through to the element */ }
    try {
      keepAlive = new Audio(SILENT_WAV);
      keepAlive.loop = true;
      keepAlive.volume = 0.001;
      keepAlive.setAttribute('playsinline', '');
      const started = keepAlive.play();
      if (started && started.catch) started.catch(() => { /* blocked */ });
    } catch (e) { /* no element audio available */ }
  }

  /*
    Anything that is not running gets a resume, not just 'suspended'.

    Safari has a third state, 'interrupted', which it uses when
    something takes the audio session away: a call, a route change, or
    a presentation change such as an embedded frame going fullscreen.
    A context sitting in it looks alive, reports no error, and makes
    no sound. This used to check for 'suspended' alone, so an
    interrupted context was never resumed and the game went quiet for
    the rest of the session while still playing perfectly. Testing for
    "not running" costs nothing and does not depend on knowing the
    name of every state a browser might invent.
  */
  function wake() {
    if (!ctx) return;
    try {
      if (ctx.state !== 'running') {
        const r = ctx.resume();
        if (r && r.catch) r.catch(() => { /* refused, stay silent */ });
      }
    } catch (e) { /* nothing to do, the game stays silent */ }
  }

  function unlock() {
    const c = ensureCtx();
    if (!c) return;
    try {
      claimPlaybackSession();
      /* The browser tells us when it takes the session away, so take
         the chance to ask for it back rather than waiting for the
         next gesture. */
      if (!c.onstatechange) c.onstatechange = wake;
      wake();
    } catch (e) {
      /* The context exists but will not start. Silent, not broken. */
      return;
    }
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

  /*
    Noise with a pitch in it. Raw white noise is static, and a tyre
    screech is the resonance of rubber letting go, so this runs the
    same noise through a narrow bandpass that slides from f0 to f1. A
    bandpass throws most of the energy away, which is why the level
    here is several times the one a plain burst needs.
  */
  function noiseSqueal(dur, vol, f0, f1, delay = 0) {
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 9;
    band.frequency.setValueAtTime(f0, t0);
    band.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t0);
    /* A chirp, not a fade in: rubber breaks loose in a few
       milliseconds and then howls down. */
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start(t0);
  }

  const SYNTH = {
    coffee_pickup() { blip(660, 0.06, 'square', 0.18); blip(990, 0.09, 'square', 0.18, 0.05); },
    heart_pickup() { blip(523, 0.07, 'square', 0.16); blip(659, 0.07, 'square', 0.16, 0.06); blip(1047, 0.12, 'square', 0.16, 0.12); },
    nitro_pickup() { blip(392, 0.06, 'sawtooth', 0.16); blip(587, 0.06, 'sawtooth', 0.16, 0.05); blip(784, 0.16, 'sawtooth', 0.18, 0.1); },
    /* Tyres rather than thrusters. The squeal is the launch, sliding
       down as the rubber finds grip; the square underneath is the car
       actually going, and it is the quieter half now. */
    boost_start() {
      noiseSqueal(0.26, 0.85, 2400, 900);
      blip(220, 0.25, 'square', 0.1, 0.02, 880);
    },
    boost_end() { blip(660, 0.18, 'square', 0.1, 0, 220); },
    crash() { noiseBurst(0.35, 0.35); blip(110, 0.3, 'square', 0.2, 0, 40); },
    stumble() { blip(440, 0.1, 'square', 0.16, 0, 220); blip(330, 0.1, 'square', 0.16, 0.09, 165); noiseBurst(0.15, 0.15); },
    lane_change() { blip(880, 0.03, 'triangle', 0.06); },
    /* Two lanes in one move is the tyres letting go for a moment. The
       same squeal the launch uses, shorter and softer, because this
       happens far more often than a boost does and a full launch
       screech every time you cross the road would wear through. */
    lane_sweep() { noiseSqueal(0.16, 0.5, 1700, 820); blip(880, 0.03, 'triangle', 0.05); },
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
    /*
      Menu voice. Quiet and short, because these fire on every stray
      press and must never compete with a coffee blip or a siren.
      ui_press is the finger landing, a dull low tick with no pitch
      interest. ui_confirm is the button actually firing, a rising
      pair. The toggles are the same two notes in opposite order, so
      on and off are told apart by direction rather than by timbre,
      which is the one cue that survives a phone speaker.
    */
    ui_press() { blip(196, 0.025, 'square', 0.07); },
    ui_confirm() { blip(587, 0.05, 'square', 0.13); blip(880, 0.08, 'square', 0.13, 0.045); },
    ui_toggle_on() { blip(523, 0.04, 'square', 0.11); blip(784, 0.06, 'square', 0.11, 0.04); },
    ui_toggle_off() { blip(784, 0.04, 'square', 0.11); blip(523, 0.06, 'square', 0.11, 0.04); },
    game_over() { blip(392, 0.14, 'square', 0.14); blip(330, 0.14, 'square', 0.14, 0.14); blip(262, 0.3, 'square', 0.14, 0.28); }
  };

  function play(name) {
    if (!ready()) return;
    try { playUnsafe(name); } catch (e) { /* a voice is never worth a frame */ }
  }

  function playUnsafe(name) {
    /* The siren is a sustained voice driven by updateSiren while the
       pursuit is on screen, not a one shot. The event still fires,
       because haptics want it. */
    if (name === 'siren') return;
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
  /*
    Voice mix. The music has to sit under the game: a coffee blip or a
    siren must always win against it, so every level here is well
    below the effect levels above. Lead is a square for the chip
    character, everything else triangle so the top end stays clear for
    effects.
  */
  const MUSIC_MIX = {
    bass: { type: 'triangle', vol: 0.050, dur: 0.15 },
    lead: { type: 'square',   vol: 0.032, dur: 0.13 },
    arp:  { type: 'triangle', vol: 0.020, dur: 0.10 },
    hat:  { vol: 0.011, dur: 0.028 }
  };

  function scheduleMusic() {
    try { scheduleMusicUnsafe(); } catch (e) { stopMusic(); }
  }

  function scheduleMusicUnsafe() {
    if (!ready()) return;
    const buf = buffers.get('music_loop');
    if (buf) return; /* a real music file loops via playMusicFile below */
    while (nextNoteTime < ctx.currentTime + 0.4) {
      const t = Math.max(nextNoteTime, ctx.currentTime);
      const delay = t - ctx.currentTime;
      const v = voicesAtStep(musicStep);
      if (v.bass) blip(v.bass, MUSIC_MIX.bass.dur, MUSIC_MIX.bass.type, MUSIC_MIX.bass.vol, delay);
      if (v.lead) blip(v.lead, MUSIC_MIX.lead.dur, MUSIC_MIX.lead.type, MUSIC_MIX.lead.vol, delay);
      if (v.arp) blip(v.arp, MUSIC_MIX.arp.dur, MUSIC_MIX.arp.type, MUSIC_MIX.arp.vol, delay);
      if (v.hat) noiseBurst(MUSIC_MIX.hat.dur, MUSIC_MIX.hat.vol * v.hat, delay);
      musicStep = (musicStep + 1) % SONG_STEPS;
      nextNoteTime = t + STEP_SEC;
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
    try { startMusicUnsafe(); } catch (e) { /* silent run */ }
  }

  function startMusicUnsafe() {
    if (musicTimer !== null) return;
    musicStep = 0;
    nextNoteTime = 0;
    if (ctx && buffers.get('music_loop')) {
      playMusicFile();
      return;
    }
    musicTimer = setInterval(scheduleMusic, 200);
  }

  /*
    The siren runs as a live voice for as long as the chase car is on
    screen: a two tone that cycles, quiets with distance, and pitches
    down as the car goes by, which is the doppler drop a real pass
    gives you. relPx is the chase car's offset from the player,
    negative while it is still behind.
  */
  const SIREN = {
    loHz: 640,
    hiHz: 880,
    cycleSec: 0.55,
    /* Peak pitch bend either side of the pass. */
    doppler: 0.16,
    /* Distance over which the pitch swings through, and the distance
       at which the wail has faded to nothing. */
    passPx: 120,
    falloffPx: 420,
    peakGain: 0.13
  };
  let sirenOsc = null;
  let sirenGain = null;

  function updateSiren(active, relPx) {
    try { updateSirenUnsafe(active, relPx); } catch (e) { stopSiren(); }
  }

  function updateSirenUnsafe(active, relPx) {
    if (!active || !ready()) { stopSiren(); return; }
    if (sirenOsc === null) {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'square';
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(ctx.destination);
      sirenOsc.start();
    }
    const t = ctx.currentTime;
    const two = Math.floor(t / SIREN.cycleSec) % 2 === 0 ? SIREN.loHz : SIREN.hiHz;
    const bend = 1 - SIREN.doppler * Math.tanh(relPx / SIREN.passPx);
    sirenOsc.frequency.setTargetAtTime(two * bend, t, 0.02);
    const near = Math.max(0, 1 - Math.abs(relPx) / SIREN.falloffPx);
    sirenGain.gain.setTargetAtTime(SIREN.peakGain * near * near, t, 0.05);
  }

  function stopSiren() {
    if (sirenOsc === null) return;
    try {
      sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      sirenOsc.stop(ctx.currentTime + 0.3);
    } catch (e) { /* context gone, nothing to wind down */ }
    sirenOsc = null;
    sirenGain = null;
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
    /* For the app layer to call when the page comes back: a tab
       unhidden, a window refocused, a frame entering or leaving
       fullscreen. Cheap, and safe to call when nothing is wrong. */
    wake,
    updateSiren,
    stopSiren,
    get muted() { return muted; },
    setMuted(m) { muted = m; }
  };
}
