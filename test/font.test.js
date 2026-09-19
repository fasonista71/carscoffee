/*
  Every character the game draws has to exist in the font.

  drawText skips a glyph it does not have, silently, and textWidth used
  to count it anyway, so a missing character both disappears and drags
  the centring off. That is not a hypothetical: the font had no plus
  sign for an entire release, and the game's two positive callouts
  shipped reading " LIFE" and " COFFEE", two pixels off centre.

  Reading the code will not catch the next one. This reads the string
  literals out of the render and app sources and checks them against
  the glyph table.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLYPH_CHARS, textWidth } from '../src/render/font.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/* Single or double quoted literals, which is every string in this
   codebase; template literals are used for numbers and paths. */
const LITERAL = /'([^'\\\n]*)'|"([^"\\\n]*)"/g;

/*
  Only literals that are actually drawn. A file's other strings are
  keys, urls and event names, and they are not the font's problem, so
  this looks at the argument of a drawText call rather than at every
  string in the file.
*/
const DRAW_TEXT = /drawText\(\s*[A-Za-z0-9_.]+\s*,\s*('([^'\\\n]*)'|"([^"\\\n]*)")/g;

function drawnStrings() {
  const out = [];
  for (const dir of ['render', 'app']) {
    const here = join(root, dir);
    for (const file of readdirSync(here).filter((f) => f.endsWith('.js'))) {
      const text = readFileSync(join(here, file), 'utf8');
      let m;
      while ((m = DRAW_TEXT.exec(text)) !== null) {
        out.push({ file, value: m[2] !== undefined ? m[2] : m[3] });
      }
      /* The legend's lines are a table rather than call arguments, so
         they are picked up by name. */
      const table = text.match(/HOW_TO_LINES\s*=\s*\[[\s\S]*?\];/);
      if (table) {
        let lit;
        while ((lit = LITERAL.exec(table[0])) !== null) {
          out.push({ file, value: lit[1] !== undefined ? lit[1] : lit[2] });
        }
      }
    }
  }
  return out;
}

test('every string the game draws is drawable', () => {
  const strings = drawnStrings();
  assert.ok(strings.length > 20, 'expected to find the drawn strings, found ' + strings.length);
  const have = new Set(GLYPH_CHARS);
  const missing = [];
  for (const { file, value } of strings) {
    for (const ch of value.toUpperCase()) {
      if (!have.has(ch)) missing.push(`${file}: ${JSON.stringify(value)} needs ${JSON.stringify(ch)}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('an empty string measures nothing', () => {
  assert.equal(textWidth(''), 0);
  assert.equal(textWidth('', 2), 0);
  assert.equal(textWidth('A'), 3);
});
