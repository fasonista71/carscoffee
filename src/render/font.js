/*
  Tiny 3x5 bitmap font, drawn as filled pixels so text stays crisp and
  aliased like everything else. fillText would antialias and break the
  8 bit register. Each glyph is 5 rows of 3 bits, most significant bit
  on the left.
*/

const GLYPHS = {
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b011, 0b100, 0b101, 0b101, 0b011],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  J: [0b001, 0b001, 0b001, 0b101, 0b010],
  K: [0b101, 0b101, 0b110, 0b101, 0b101],
  L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101],
  N: [0b110, 0b101, 0b101, 0b101, 0b101],
  O: [0b010, 0b101, 0b101, 0b101, 0b010],
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  Q: [0b010, 0b101, 0b101, 0b010, 0b001],
  R: [0b110, 0b101, 0b110, 0b110, 0b101],
  S: [0b011, 0b100, 0b010, 0b001, 0b110],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b011],
  V: [0b101, 0b101, 0b101, 0b101, 0b010],
  W: [0b101, 0b101, 0b111, 0b111, 0b101],
  X: [0b101, 0b101, 0b010, 0b101, 0b101],
  Y: [0b101, 0b101, 0b010, 0b010, 0b010],
  Z: [0b111, 0b001, 0b010, 0b100, 0b111],
  0: [0b111, 0b101, 0b101, 0b101, 0b111],
  1: [0b010, 0b110, 0b010, 0b010, 0b111],
  2: [0b111, 0b001, 0b111, 0b100, 0b111],
  3: [0b111, 0b001, 0b011, 0b001, 0b111],
  4: [0b101, 0b101, 0b111, 0b001, 0b001],
  5: [0b111, 0b100, 0b111, 0b001, 0b111],
  6: [0b111, 0b100, 0b111, 0b101, 0b111],
  7: [0b111, 0b001, 0b010, 0b010, 0b010],
  8: [0b111, 0b101, 0b111, 0b101, 0b111],
  9: [0b111, 0b101, 0b111, 0b001, 0b111],
  '&': [0b010, 0b101, 0b010, 0b101, 0b011],
  /* The pickup callouts are '+COFFEE' and '+LIFE'. Without this glyph
     drawText skipped the character silently and both read with a
     leading blank, while textWidth still counted it, so centred text
     sat 2px left of the pickup it was pointing at. */
  '+': [0b000, 0b010, 0b111, 0b010, 0b000],
  /* Only reachable from the haptics row's N/A fallback, but a missing
     glyph there would render 'N A'. */
  '/': [0b001, 0b001, 0b010, 0b100, 0b100],
  '.': [0b000, 0b000, 0b000, 0b000, 0b010],
  '!': [0b010, 0b010, 0b010, 0b000, 0b010],
  ' ': [0b000, 0b000, 0b000, 0b000, 0b000]
};

export const GLYPH_W = 3;
export const GLYPH_H = 5;
export const GLYPH_ADVANCE = 4;

export function textWidth(text, scale = 1) {
  return (text.length * GLYPH_ADVANCE - 1) * scale;
}

/*
  align: 'left', 'center', or 'right', relative to x. Unknown
  characters render as blank space. Text is uppercased; the font has
  no lowercase.
*/
export function drawText(ctx, text, x, y, color, { scale = 1, align = 'left' } = {}) {
  const s = String(text).toUpperCase();
  let px = Math.round(x);
  if (align === 'center') px = Math.round(x - textWidth(s, scale) / 2);
  else if (align === 'right') px = Math.round(x - textWidth(s, scale));
  ctx.fillStyle = color;
  for (let i = 0; i < s.length; i += 1) {
    const glyph = GLYPHS[s[i]];
    if (glyph) {
      for (let row = 0; row < GLYPH_H; row += 1) {
        const bits = glyph[row];
        for (let col = 0; col < GLYPH_W; col += 1) {
          if (bits & (1 << (GLYPH_W - 1 - col))) {
            ctx.fillRect(px + col * scale, y + row * scale, scale, scale);
          }
        }
      }
    }
    px += GLYPH_ADVANCE * scale;
  }
}
