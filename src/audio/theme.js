/*
  The Cars & Coffee theme, as data.

  What was here before was eight bass notes on a 2.24 second loop. It
  worked as a placeholder and wore out in about thirty seconds. Same
  framework: still synthesized in Web Audio, still one short blip per
  note, still muted and unmuted by the same switch. What changed is
  that the music now has an arrangement instead of a loop.

  Structure: a 16 step bar, four bars to a section, and an eight
  section arrangement that runs about 72 seconds before it comes
  round. Four voices, so there is something to listen past: a bass on
  the chord roots, a lead melody, a quiet arpeggio filling the
  offbeats, and a hat. The intro drops the lead so the tune arrives
  rather than just starting.

  Key of A minor. Sections are written as note names rather than
  frequencies so the melody can be read and edited by someone who is
  not counting hertz; noteHz below does the conversion.

  This module is pure data and arithmetic, no browser globals, so the
  offline preview renderer can import it and produce exactly what the
  game plays rather than an approximation of it.
*/

const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/* Scientific pitch: A4 = 440, middle C is C4. */
export function noteHz(name) {
  if (!name) return null;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return null;
  let semi = SEMITONE[m[1]];
  if (m[2] === '#') semi += 1;
  else if (m[2] === 'b') semi -= 1;
  const octave = Number(m[3]);
  const midi = (octave + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const STEP_SEC = 0.14;      /* 16th notes at about 107 BPM */
export const STEPS_PER_BAR = 16;
export const BARS_PER_SECTION = 4;
export const STEPS_PER_SECTION = STEPS_PER_BAR * BARS_PER_SECTION;

/* bass note, then the triad the arpeggio walks */
const CHORDS = {
  Am: { bass: 'A2', fifth: 'E3', tones: ['A3', 'C4', 'E4'] },
  F:  { bass: 'F2', fifth: 'C3', tones: ['F3', 'A3', 'C4'] },
  C:  { bass: 'C3', fifth: 'G3', tones: ['C4', 'E4', 'G4'] },
  G:  { bass: 'G2', fifth: 'D3', tones: ['G3', 'B3', 'D4'] },
  Dm: { bass: 'D3', fifth: 'A3', tones: ['D4', 'F4', 'A4'] },
  E:  { bass: 'E2', fifth: 'B2', tones: ['E3', 'G#3', 'B3'] },
  Em: { bass: 'E3', fifth: 'B3', tones: ['E4', 'G4', 'B4'] }
};

const _ = null;

/* Four bars of melody per section. 16 slots each, _ is a rest. */
const MELODY = {
  A: [
    ['E4', _, _, 'A4', _, 'G4', _, 'E4', _, _, 'C4', _, 'E4', _, _, _],
    ['F4', _, _, 'C4', _, 'A3', _, 'C4', _, _, 'F4', _, 'A4', _, _, _],
    ['G4', _, _, 'E4', _, 'C4', _, 'E4', _, _, 'G4', _, 'C5', _, _, _],
    ['D4', _, _, 'B3', _, 'G3', _, 'B3', _, _, 'D4', _, 'G4', _, _, 'A4']
  ],
  /* A2 answers A: same shape, resolved differently so the repeat is
     heard as a second line rather than the same line again. */
  A2: [
    ['E4', _, 'A4', _, _, 'B4', _, 'A4', _, _, 'G4', _, 'E4', _, _, _],
    ['F4', _, 'C5', _, _, 'A4', _, 'G4', _, _, 'F4', _, 'C4', _, _, _],
    ['G4', _, 'E4', _, _, 'G4', _, 'A4', _, _, 'B4', _, 'C5', _, _, _],
    ['B4', _, 'A4', _, _, 'G4', _, 'D4', _, _, 'B3', _, 'G3', _, _, _]
  ],
  B: [
    ['D4', 'F4', _, 'A4', _, _, 'F4', _, 'D4', _, _, _, 'A3', _, _, _],
    ['C4', 'E4', _, 'A4', _, _, 'E4', _, 'C4', _, _, _, 'E4', _, _, _],
    ['B3', 'E4', _, 'G#4', _, _, 'E4', _, 'B3', _, _, _, 'G#3', _, _, _],
    ['A3', _, 'C4', _, 'E4', _, _, _, 'A4', _, _, _, _, _, 'E4', _]
  ],
  /* The bridge holds notes instead of running them, so the ear gets a
     rest before the last chorus. */
  C: [
    ['A4', _, _, _, _, _, 'G4', _, 'F4', _, _, _, _, _, _, _],
    ['B4', _, _, _, _, _, 'A4', _, 'G4', _, _, _, _, _, _, _],
    ['B4', _, _, _, _, _, 'G4', _, 'E4', _, _, _, _, _, _, _],
    ['A4', _, _, _, _, 'E4', _, _, 'C4', _, _, _, 'A3', _, _, _]
  ]
};

const PROGRESSION = {
  A:  ['Am', 'F', 'C', 'G'],
  A2: ['Am', 'F', 'C', 'G'],
  B:  ['Dm', 'Am', 'E', 'Am'],
  C:  ['F', 'G', 'Em', 'Am']
};

/*
  name is the melody and chord set; lead false is the intro, which
  runs the rhythm section alone. About 72 seconds end to end.
*/
export const ARRANGEMENT = [
  { name: 'A',  lead: false },
  { name: 'A',  lead: true  },
  { name: 'A2', lead: true  },
  { name: 'B',  lead: true  },
  { name: 'A',  lead: true  },
  { name: 'C',  lead: true  },
  { name: 'B',  lead: true  },
  { name: 'A2', lead: true  }
];

export const SONG_STEPS = ARRANGEMENT.length * STEPS_PER_SECTION;

/* Root, root, fifth, root, seventh-ish walk. Indices into the bar. */
const BASS_STEPS = [0, 4, 8, 12, 14];

/*
  Everything sounding on one step of the song, as plain numbers.

  Returned rather than played, so audio.js schedules it and the
  offline renderer draws it from the identical call.
*/
export function voicesAtStep(step) {
  const s = ((step % SONG_STEPS) + SONG_STEPS) % SONG_STEPS;
  const sectionIdx = Math.floor(s / STEPS_PER_SECTION);
  const section = ARRANGEMENT[sectionIdx];
  const inSection = s % STEPS_PER_SECTION;
  const bar = Math.floor(inSection / STEPS_PER_BAR);
  const beat = inSection % STEPS_PER_BAR;

  const chord = CHORDS[PROGRESSION[section.name][bar]];
  const out = { bass: null, lead: null, arp: null, hat: 0 };

  if (BASS_STEPS.includes(beat)) {
    const useFifth = beat === 8 || beat === 14;
    out.bass = noteHz(useFifth ? chord.fifth : chord.bass);
  }

  if (section.lead) {
    out.lead = noteHz(MELODY[section.name][bar][beat]);
  }

  /* Offbeat arpeggio, quiet, and silent through the bridge so the
     held melody has room. */
  if (section.name !== 'C' && beat % 4 === 2) {
    out.arp = noteHz(chord.tones[(Math.floor(beat / 4) + bar) % chord.tones.length]);
  }

  /* Hat on every other step, accented on the backbeat. */
  if (beat % 2 === 0) out.hat = (beat === 4 || beat === 12) ? 1 : 0.45;

  return out;
}
