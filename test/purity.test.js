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

const gameDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'game');

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
  /\bAudio\b/
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
