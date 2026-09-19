/*
  Guard test for the architecture's hard rule: nothing in src/game may
  reference browser globals or nondeterministic sources. A textual scan
  is blunt but effective; it also catches references smuggled in via
  comments, which keeps intent honest.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gameDir = join(here, '..', 'src', 'game');

/*
  The second group is the hole this list had. None of them appear in
  src/game today, so the boundary was holding by habit rather than by
  the gate that is supposed to hold it: globalThis.crypto.getRandomValues
  would have sailed straight through a list that only knew about
  Math.random, and a setTimeout would have put a piece of the
  simulation on the wall clock without a word.
*/
const FORBIDDEN = [
  /\bwindow\b/,
  /\bdocument\b/,
  /\bnavigator\b/,
  /\bperformance\b/,
  /\bDate\b/,
  /Math\.random/,
  /\brequestAnimationFrame\b/,
  /\blocalStorage\b/,
  /\bcanvas\b/i,
  /\bAudio\b/,
  /\bglobalThis\b/,
  /\bprocess\b/,
  /\bcrypto\b/i,
  /\bfetch\b/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bqueueMicrotask\b/,
  /\bIntl\b/,
  /\beval\b/,
  /\bstructuredClone\b/,
  /\bimport\s*\(/
];

test('src/game references no browser or nondeterministic globals', () => {
  const files = readdirSync(gameDir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 5, 'expected the five game modules to exist');
  for (const file of files) {
    const text = readFileSync(join(gameDir, file), 'utf8');
    for (const pattern of FORBIDDEN) {
      assert.ok(!pattern.test(text), file + ' matches forbidden pattern ' + pattern);
    }
  }
});

/*
  The guard's own teeth. A pattern list is the kind of thing that gets
  edited by someone in a hurry, and a scan that has stopped matching
  anything looks exactly like a codebase that is clean.
*/
test('the forbidden list actually rejects the things it names', () => {
  const samples = [
    'const r = globalThis.crypto.getRandomValues(new Uint8Array(1));',
    'const t = process.hrtime.bigint();',
    'const data = await fetch(url);',
    'setTimeout(() => step(world), 16);',
    'setInterval(tick, 100);',
    'queueMicrotask(() => step(world));',
    'const fmt = new Intl.NumberFormat();',
    'const f = eval("1 + 1");',
    'const copy = structuredClone(world);',
    "const mod = await import('./generator.js');",
    'const now = Date.now();',
    'const x = Math.random();',
    'window.addEventListener("resize", onResize);'
  ];
  for (const line of samples) {
    assert.ok(FORBIDDEN.some((pattern) => pattern.test(line)),
      'nothing in the forbidden list catches: ' + line);
  }
  /* And it must not reject the language the game is written in. */
  const innocent = [
    'import { TUNING } from "./tuning.js";',
    'const evaluated = scoreLane(world, lane);',
    'world.processedRows += 1;',
    'const cryptic = false;'
  ];
  for (const line of innocent) {
    const hit = FORBIDDEN.find((pattern) => pattern.test(line));
    assert.ok(!hit, 'false positive ' + hit + ' on: ' + line);
  }
});

/*
  The other shared thing worth guarding, in the other direction. Five
  test files used to configure themselves by writing into the shared
  TUNING at module scope: traffic out of reach, the tier list truncated
  in place, the fuel drain muted. That holds only while the runner
  gives each file its own process, and the day it does not, the files
  deciding whether the road is survivable are the ones reshaping what
  another file measures. They set their conditions per world now, and
  this keeps it that way.
*/
test('no test file reshapes the shared TUNING for everybody else', () => {
  const files = readdirSync(here).filter((f) => f.endsWith('.test.js'));
  assert.ok(files.length >= 8, 'expected to find the test files');
  for (const file of files) {
    const text = readFileSync(join(here, file), 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const writes = /\bTUNING(\.[A-Za-z0-9_]+)+\s*(=[^=]|\+=|-=)/.test(line)
        || /\bTUNING(\.[A-Za-z0-9_]+)*\.(splice|push|pop|shift|unshift|sort|reverse|fill)\s*\(/.test(line);
      assert.ok(!writes, `${file}:${i + 1} writes to the shared TUNING: ${line.trim()}`);
    }
  }
});
