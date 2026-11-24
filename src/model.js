/* Making models: the ways to fill a voxel grid, and Thing, which draws one
 * at a world heading.
 *
 *   builder(w, h, count, colors)  fill boxes, blobs, cylinders in code
 *   fromLayers(layers, key)       ASCII art, one block of text per slice
 *   fromSlicePixels / fromSliceImage   a PNG strip of slices drawn by an artist
 *   pack / unpack                 a model as JSON (save tools' output, load fast)
 *   thing(model, options)         sprite(heading) and shadow(heading) for a model
 *
 * Model space (voxel.js): x across, y along (+y is the front), z up.
 * Drawn sources (ASCII and images) are top views with the FRONT POINTING UP,
 * bottom slice first; they are turned round on the way in so that a model
 * facing north (heading -PI/2) looks exactly as it was drawn.
 *
 * Colours: a material is {rgb: [r, g, b], kind}. kind: 'matte' (default),
 * 'gloss' (a glint), 'glass' (no bright tops), 'glow' (unlit, for lamps and
 * crystals) or 'ink' (dark trim). Material 0 is always empty.
 */
import * as Voxel from './voxel.js';

/* ---------- Random numbers you can repeat ---------- */
/* A seeded generator: random(seed)() gives 0 <= n < 1, the same every run. */
export function random(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/* A hash of whole numbers to 0 <= n < 1: noise for textures without state. */
export function hash(x, y, z = 0) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) | 0;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}

const toMaterial = entry => Array.isArray(entry) ? {rgb: entry, kind: 'matte'} : {kind: 'matte', ...entry};
export function hexToRgb(hex) {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
/* The palette voxel.js bakes with: each material's colour by id. */
export function paletteOf(model) { return model.materials.map(material => material && material.rgb); }
/* A copy of a palette with some materials recoloured: {2: [255, 0, 0]}. */
export function recolor(palette, changes) {
  const out = palette.slice();
  // Colours only: a material's kind (glow, gloss...) belongs to the model and stays.
  for (const [id, rgb] of Object.entries(changes)) out[id] = typeof rgb === 'string' ? hexToRgb(rgb) : Array.isArray(rgb) ? rgb : rgb.rgb;
  return out;
}

/* ---------- In code ---------- */
/* colors: one entry per material id from 1: [r, g, b] (matte) or
 * {rgb, kind}. Every shape takes an id, or a function (x, y, z) → id for
 * patterns; id 0 carves out. Out-of-range voxels are ignored. */
export function builder(w, h, count, colors) {
  const materials = [null, ...colors.map(toMaterial)];
  const model = Voxel.createModel(w, h, count, materials);
  const pick = (id, x, y, z) => typeof id === 'function' ? id(x, y, z) : id;
  const set = (x, y, z, id) => {
    if (x >= 0 && x < w && y >= 0 && y < h && z >= 0 && z < count) model.vox[(z * h + y) * w + x] = id;
  };
  const get = (x, y, z) => x >= 0 && x < w && y >= 0 && y < h && z >= 0 && z < count ? model.vox[(z * h + y) * w + x] : 0;
  /* A box between two corners, inclusive. */
  const fill = (x0, y0, z0, x1, y1, z1, id) => {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, z, pick(id, x, y, z));
  };
  /* An ellipsoid round (cx, cy, cz) with radii rx, ry, rz. */
  const blob = (cx, cy, cz, rx, ry, rz, id) => {
    for (let z = Math.floor(cz - rz); z <= cz + rz; z++) for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
        if (d <= 1) set(x, y, z, pick(id, x, y, z));
      }
    }
  };
  /* An upright cylinder (or a cone, with a different top radius) from z0 to z1. */
  const cylinder = (cx, cy, z0, z1, radius, id, topRadius = radius) => {
    for (let z = z0; z <= z1; z++) {
      const r = radius + (topRadius - radius) * (z1 === z0 ? 0 : (z - z0) / (z1 - z0));
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, z, pick(id, x, y, z));
      }
    }
  };
  /* A wheel or tube lying along x (axis 'x') or y (axis 'y'): a ring of radius r. */
  const wheel = (cx, cy, cz, r, thickness, id, axis = 'x') => {
    for (let t = 0; t < thickness; t++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      if (a * a + b * b > r * r) continue;
      if (axis === 'x') set(Math.round(cx + t), Math.round(cy + a), Math.round(cz + b), pick(id, cx + t, cy + a, cz + b));
      else set(Math.round(cx + a), Math.round(cy + t), Math.round(cz + b), pick(id, cx + a, cy + t, cz + b));
    }
  };
  /* Mirror x < w/2 onto the other half (build one side, then mirror). */
  const mirrorX = () => {
    for (let z = 0; z < count; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) set(w - 1 - x, y, z, get(x, y, z));
  };
  return {model, set, get, fill, box: fill, blob, cylinder, wheel, mirrorX, palette: paletteOf(model)};
}

/* ---------- ASCII art ---------- */
/* layers: bottom slice first; each a string of rows (or an array of rows),
 * a top view with the front pointing up. key: character → colour ([r,g,b],
 * '#rrggbb' or {rgb, kind}). '.' is empty. Each row is trimmed (so you can
 * indent template strings), so start and end rows with '.' where empty. A slice may be given as
 * a number n, meaning "repeat the previous slice n more times". */
export function fromLayers(layers, key) {
  const slices = [];
  for (const layer of layers) {
    if (typeof layer === 'number') { for (let i = 0; i < layer; i++) slices.push(slices[slices.length - 1]); continue; }
    const rows = (Array.isArray(layer) ? layer : layer.split('\n')).map(row => row.trim()).filter(row => row.length);
    slices.push(rows);
  }
  const h = Math.max(...slices.map(rows => rows.length)), w = Math.max(...slices.flat().map(row => row.length));
  const chars = Object.keys(key), materials = chars.map(c => {
    const v = key[c];
    return typeof v === 'string' ? {rgb: hexToRgb(v), kind: 'matte'} : toMaterial(v);
  });
  const b = builder(w, h, slices.length, materials);
  slices.forEach((rows, z) => rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const id = chars.indexOf(row[c]) + 1;
      if (id > 0) b.set(w - 1 - c, h - 1 - r, z, id);
      else if (row[c] !== '.' && row[c] !== ' ') throw new Error(`fromLayers: '${row[c]}' (slice ${z}, row ${r}) is not in the key`);
    }
  }));
  return b;
}

/* ---------- Slice sheets (PNG) ---------- */
/* rgba: the sheet's pixels (Uint8ClampedArray, width × height × 4), slices
 * of sliceWidth × sliceHeight laid left to right (then down, if `columns` is
 * given), bottom slice first, each a top view with the front pointing up.
 * Every distinct opaque colour becomes a material (at most 255); pixels with
 * alpha < 128 are empty. kinds: {'#ffcc00': 'glow', ...} sets materials' kinds. */
export function fromSlicePixels(rgba, width, height, {sliceWidth, sliceHeight = sliceWidth, count, columns, kinds = {}} = {}) {
  if (!sliceWidth) throw new Error('fromSlicePixels: sliceWidth is needed');
  columns = columns || Math.floor(width / sliceWidth);
  count = count || columns * Math.floor(height / sliceHeight);
  const colours = new Map(), ids = [], w = sliceWidth, h = sliceHeight;
  const kindOf = new Map(Object.entries(kinds).map(([hex, kind]) => [hexToRgb(hex).join(','), kind]));
  const grid = new Uint8Array(w * h * count);
  for (let z = 0; z < count; z++) {
    const ox = (z % columns) * w, oy = Math.floor(z / columns) * h;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const at = ((oy + r) * width + ox + c) * 4;
      if (rgba[at + 3] < 128) continue;
      const rgb = [rgba[at], rgba[at + 1], rgba[at + 2]], name = rgb.join(',');
      let id = colours.get(name);
      if (id === undefined) {
        if (colours.size >= 255) throw new Error('fromSlicePixels: more than 255 colours; reduce the palette');
        id = colours.size + 1; colours.set(name, id); ids.push({rgb, kind: kindOf.get(name) || 'matte'});
      }
      grid[(z * h + (h - 1 - r)) * w + (w - 1 - c)] = id;
    }
  }
  const b = builder(w, h, count, ids);
  b.model.vox.set(grid);
  return b;
}
/* The other way: a model as a slice sheet's pixels (RGBA), slices left to
 * right in `columns` columns, laid out exactly as fromSlicePixels reads them.
 * Build a rough shape in code, export it, and let an artist paint over it. */
export function toSlicePixels(model, {columns = model.count, gap = 0} = {}) {
  const {w, h, count, vox, materials} = model, rows = Math.ceil(count / columns);
  const width = columns * (w + gap) - gap, height = rows * (h + gap) - gap, rgba = new Uint8ClampedArray(width * height * 4);
  for (let z = 0; z < count; z++) {
    const ox = (z % columns) * (w + gap), oy = Math.floor(z / columns) * (h + gap);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const id = vox[(z * h + y) * w + x];
      if (!id) continue;
      const at = ((oy + h - 1 - y) * width + ox + w - 1 - x) * 4, rgb = materials[id].rgb;
      rgba[at] = rgb[0]; rgba[at + 1] = rgb[1]; rgba[at + 2] = rgb[2]; rgba[at + 3] = 255;
    }
  }
  return {rgba, width, height, sliceWidth: w, sliceHeight: h, count, columns};
}
/* The same from an <img> or ImageBitmap (browser). Load it first:
 *   const image = await loadImage('barrel.png'); */
export function fromSliceImage(image, options) {
  const canvas = Voxel.canvas(image.width, image.height), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, image.width, image.height).data;
  return fromSlicePixels(data, image.width, image.height, options);
}
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('could not load ' + url));
    image.src = url;
  });
}

/* ---------- As JSON ---------- */
function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
export function pack(model) {
  return {w: model.w, h: model.h, count: model.count, materials: model.materials.slice(1), vox: toBase64(model.vox)};
}
export function unpack(data) {
  const b = builder(data.w, data.h, data.count, data.materials);
  const text = atob(data.vox);
  for (let i = 0; i < text.length; i++) b.model.vox[i] = text.charCodeAt(i);
  return b;
}

/* ---------- Thing: a model drawn at a world heading ---------- */
/* World headings are radians on the ground: 0 = east (+x), PI/2 = south
 * (+y, down the screen), -PI/2 = north. A Thing turns them into the
 * renderer's turn (front down the screen at 0) and caches sprite keys.
 *
 * options: palette (default: the model's own), variant (a name for that
 * palette in the sprite cache: give each palette of one model its own),
 * frames: headings it can show (64 for things that turn smoothly, 4 or 8 for
 * scenery that only sits square: far fewer pictures in memory). */
export function thing(source, {palette, variant = 'base', frames = Voxel.TURN_FRAMES} = {}) {
  const model = source.model || source;
  palette = palette || source.palette || paletteOf(model);
  const options = {frames}, keys = [];
  const directionAt = heading => Voxel.directionOf(heading - Math.PI / 2, frames);
  return {
    model, palette, variant, frames,
    direction: directionAt,
    sprite(heading = Math.PI / 2) {
      const direction = directionAt(heading);
      return Voxel.spriteByKey(model, keys[direction] || (keys[direction] = Voxel.spriteKey(variant, direction, options)), palette, direction, options);
    },
    shadow(heading = Math.PI / 2) { return Voxel.shadow(model, directionAt(heading), frames); },
    hasSprite(heading = Math.PI / 2) { return Voxel.hasSprite(model, variant, directionAt(heading), options); },
    /* The same model in other colours (shares the model's surfaces). */
    recolored(changes, name) { return thing(model, {palette: recolor(palette, changes), variant: name, frames}); },
    /* Bake every heading now (while loading), so nothing bakes mid-play. */
    warm() { for (let d = 0; d < frames; d++) { const h = d * Math.PI * 2 / frames + Math.PI / 2; this.sprite(h); this.shadow(h); } },
  };
}
