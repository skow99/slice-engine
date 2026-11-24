/* Pixel fonts, panels and integer-scaled presentation (from Slice Drive).
 * No antialiasing anywhere, no font files: the glyphs are bit rows in code.
 * Text is upper case only (A-Z, 0-9 and some punctuation); addGlyph() adds more. */
import * as Voxel from './voxel.js';


// Small font: five rows of three bits.
const small = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 7, 3], R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6],
  6: [3, 4, 6, 5, 2], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [2, 5, 3, 1, 6],
  ':': [0, 2, 0, 2, 0], '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], '/': [1, 1, 2, 4, 4], '-': [0, 0, 7, 0, 0], '+': [0, 2, 7, 2, 0],
  '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2], '%': [5, 1, 2, 4, 5], "'": [2, 2, 0, 0, 0], '<': [1, 2, 4, 2, 1], '>': [4, 2, 1, 2, 4],
  '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '=': [0, 7, 0, 7, 0], '*': [5, 2, 7, 2, 5], '_': [0, 0, 0, 0, 7],
};
// Large font: seven rows of five bits.
const large = {};
const largeSource = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011101110001', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
  3: '11110000010000101110000010000111110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
  9: '01110100011000101111000010001001100',
  ':': '00000001000010000000001000010000000', '.': '00000000000000000000000000011000110', ',': '00000000000000000000001100010001000',
  '/': '00001000010001000100010001000010000', '-': '00000000000000011111000000000000000', '+': '00000001000010011111001000010000000',
  '!': '00100001000010000100001000000000100', '?': '01110100010000100010001000000000100', '%': '11001110100001000100010000101110011',
  "'": '00100001000100000000000000000000000', '<': '00010001000100010000010000010000010', '>': '01000001000001000001000100010001000',
  '(': '00010001000100001000010000010000010', ')': '01000001000001000010000100010001000', '=': '00000000001111100000111110000000000',
  '*': '00000101010111011111011101010100000', '_': '00000000000000000000000000000011111',
};
for (const [char, bits] of Object.entries(largeSource)) {
  large[char] = Array.from({length: 7}, (_, row) => parseInt(bits.slice(row * 5, row * 5 + 5), 2));
}
const fonts = {
  small: {glyphs: small, width: 3, height: 5, advance: 4},
  large: {glyphs: large, width: 5, height: 7, advance: 6},
};

const atlases = new Map();
Voxel.onRastersLost(() => atlases.clear());
function atlas(fontName, color) {
  const key = fontName + color;
  if (atlases.has(key)) return atlases.get(key);
  const font = fonts[fontName], chars = Object.keys(font.glyphs);
  const canvas = Voxel.canvas(chars.length * font.width, font.height), context = canvas.getContext('2d');
  context.fillStyle = color;
  const positions = new Map();
  chars.forEach((char, index) => {
    positions.set(char, index * font.width);
    font.glyphs[char].forEach((bits, row) => {
      for (let col = 0; col < font.width; col++) {
        if (bits & (1 << (font.width - 1 - col))) context.fillRect(index * font.width + col, row, 1, 1);
      }
    });
  });
  const result = {canvas, positions};
  atlases.set(key, result);
  return result;
}

/* Add a glyph: rows of bits, most significant bit leftmost (small: 3 bits x 5 rows, large: 5 x 7). */
function addGlyph(fontName, char, rows) { fonts[fontName].glyphs[char] = rows; atlases.clear(); }
function measure(text, options = {}) {
  const font = fonts[options.font || 'small'], scale = options.scale || 1;
  return (String(text).length * font.advance - (font.advance - font.width)) * scale;
}
/* options: font ('small'|'large'), scale, align, color, shadow (colour or null). */
function text(context, value, x, y, options = {}) {
  const {font: fontName = 'small', scale = 1, align = 'left', color = '#e8efed', shadow = null} = options;
  const font = fonts[fontName], string = String(value).toUpperCase();
  const width = measure(string, options);
  const left = Math.round(x - (align === 'center' ? width / 2 : align === 'right' ? width : 0)), top = Math.round(y);
  const passes = shadow ? [[shadow, scale], [color, 0]] : [[color, 0]];
  for (const [tint, offset] of passes) {
    const {canvas, positions} = atlas(fontName, tint);
    for (let index = 0; index < string.length; index++) {
      const source = positions.get(string[index]);
      if (source === undefined) continue;
      context.drawImage(canvas, source, 0, font.width, font.height,
        left + index * font.advance * scale + offset, top + offset, font.width * scale, font.height * scale);
    }
  }
  return width;
}

function rect(context, x, y, w, h, color) { context.fillStyle = color; context.fillRect(x, y, w, h); }
/* Flat panel with a one-pixel bevel and clipped corners. */
function panel(context, x, y, w, h, fill = '#141c24', edge = '#4a5a68', alpha = 0.9) {
  context.globalAlpha = alpha;
  rect(context, x + 1, y, w - 2, h, fill); rect(context, x, y + 1, w, h - 2, fill);
  context.globalAlpha = 1;
  rect(context, x + 2, y, w - 4, 1, edge); rect(context, x + 2, y + h - 1, w - 4, 1, edge);
  rect(context, x, y + 2, 1, h - 4, edge); rect(context, x + w - 1, y + 2, 1, h - 4, edge);
  rect(context, x + 1, y + 1, 1, 1, edge); rect(context, x + w - 2, y + 1, 1, 1, edge);
  rect(context, x + 1, y + h - 2, 1, 1, edge); rect(context, x + w - 2, y + h - 2, 1, 1, edge);
}

function integerScale(width, height, baseWidth, baseHeight) {
  const scale = Math.max(1, Math.floor(Math.min(width / baseWidth, height / baseHeight)));
  return {scale, barX: Math.floor((width - baseWidth * scale) / 2), barY: Math.floor((height - baseHeight * scale) / 2)};
}
function present(context, frame, width, height, background = '#0c1013') {
  const {scale, barX, barY} = integerScale(width, height, frame.width, frame.height);
  context.imageSmoothingEnabled = false;
  if (barX || barY) { context.fillStyle = background; context.fillRect(0, 0, width, height); }
  context.drawImage(frame, barX, barY, frame.width * scale, frame.height * scale);
  return {scale, barX, barY};
}
function formatTime(seconds) {
  if (seconds === null || seconds === undefined || !isFinite(seconds)) return '-:--.---';
  const ms = Math.floor(seconds * 1000);
  return Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
}

export {fonts, addGlyph, text, measure, rect, panel, integerScale, present, formatTime};
