/* Slice renderer: the heart of the engine (from Slice Drive's voxel.js).
 *
 * A model is a stack of horizontal slices stored as a voxel grid of material
 * ids. For each of 64 headings the stack is ray-sampled once into a "surface":
 * which voxel is visible at every screen pixel and how brightly it is lit.
 * Surfaces are colour-independent, so every colour scheme (palette) of a
 * model shares them and a sprite is just a palette lookup. Heading is baked
 * into the sprite, which is a small canvas drawn with drawImage.
 *
 * Model space: x across, y along (front faces +y), z up. One voxel = one pixel.
 * Pass headings in "turns": turn 0 shows the front facing down the screen.
 * scene.js and the Thing helper in model.js convert world headings for you.
 */
const TURN_FRAMES = 64;
const SQUASH = 0.75;
/* Time of day. Everything lit goes through one light direction and one
 * colour ramp per material, so a preset is just: where the sun is (light),
 * how far shadows reach per voxel of height (shadow), what shadows drift
 * towards and highlights warm towards (cool, warm), how hard the steps
 * between light levels are (contrast), and how dark ground shadows are.
 * grade and lamps are read by the game: a tint laid over the whole world
 * after it is drawn (screen.js applyGrade), and whether lamps should be lit.
 * addPreset() adds your own. */
const PRESETS = {
  day: {name: 'DAY', light: [-0.48, -0.35, 0.80], shadow: [0.31, 0.22], shadowAlpha: [104, 62], shadowRgb: [10, 18, 26],
    cool: [34, 40, 84], coolAmount: 0.075, warm: [255, 246, 214], warmAmount: 0.10, contrast: 1, groundShade: 0.66,
    grade: null, lamps: false},
  golden: {name: 'GOLDEN HOUR', light: [-0.80, -0.30, 0.44], shadow: [0.78, 0.30], shadowAlpha: [100, 66], shadowRgb: [34, 14, 40],
    cool: [72, 38, 96], coolAmount: 0.11, warm: [255, 190, 104], warmAmount: 0.20, contrast: 1.12, groundShade: 0.62,
    grade: {multiply: [255, 226, 186], add: [26, 10, 0], saturate: 0}, lamps: false},
  overcast: {name: 'OVERCAST', light: [-0.16, -0.12, 0.98], shadow: [0.09, 0.07], shadowAlpha: [70, 34], shadowRgb: [24, 30, 36],
    cool: [70, 82, 98], coolAmount: 0.05, warm: [226, 232, 238], warmAmount: 0.04, contrast: 0.62, groundShade: 0.82,
    grade: {multiply: [214, 222, 230], add: [10, 12, 14], saturate: 0.35}, lamps: false},
  dusk: {name: 'DUSK', light: [-0.86, -0.18, 0.30], shadow: [1.25, 0.34], shadowAlpha: [84, 52], shadowRgb: [8, 6, 30],
    cool: [36, 28, 96], coolAmount: 0.13, warm: [255, 150, 112], warmAmount: 0.16, contrast: 1.05, groundShade: 0.74,
    grade: {multiply: [118, 112, 168], add: [4, 2, 16], saturate: 0.2}, lamps: true},
};
const PRESET_IDS = Object.keys(PRESETS);
/* Add (or replace) a time of day. Missing fields are taken from 'day'. */
function addPreset(id, preset) {
  PRESETS[id] = {...PRESETS.day, name: id.toUpperCase(), ...preset};
  if (!PRESET_IDS.includes(id)) PRESET_IDS.push(id);
  if (id === lightingId) { lightingId = null; setLighting(id); }
  return PRESETS[id];
}
let lighting = PRESETS.day, lightingId = 'day';
let LIGHT, HALF, SHADOW_X, SHADOW_Y;
function aim() {
  LIGHT = normalize(lighting.light);
  // Halfway between the light and the camera, for the glint on glossy paint.
  HALF = normalize([LIGHT[0], LIGHT[1] + 0.66, LIGHT[2] + 0.75]);
  [SHADOW_X, SHADOW_Y] = lighting.shadow;
}
aim();
const INK = [24, 32, 46];
const LEVELS = 6, BASE_LEVEL = 3;

let makeCanvas = (width, height) => {
  if (typeof document === 'undefined') throw new Error('Voxel: no document here; call Voxel.setCanvasFactory() first (see tests/fake-canvas.js)');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
};
function setCanvasFactory(factory) { makeCanvas = factory; }
/* Every offscreen canvas the game paints is made here, and the live ones are
 * counted (weakly, so this keeps none alive): how many, and how many pixels. */
const live = [];
let made = 0;
function newCanvas(width, height) {
  const canvas = makeCanvas(width, height);
  if (typeof WeakRef === 'function') {
    live.push(new WeakRef(canvas));
    if (++made % 1024 === 0) { let kept = 0; for (const ref of live) if (ref.deref()) live[kept++] = ref; live.length = kept; }
  }
  return canvas;
}
function liveCanvases() {
  const out = [];
  for (const ref of live) { const canvas = ref.deref(); if (canvas) out.push(canvas); }
  return out;
}

/* A lost context. When the browser drops a page's canvases (short of
 * memory, a GPU driver reset, a phone putting the tab away), every picture
 * painted into one may be gone, and nothing says which. Each module that
 * keeps painted canvases registers how to forget them; rastersLost() drops
 * every baked sprite and shadow here and then runs those, and the next
 * frames paint everything again. Voxel data and surfaces are plain arrays
 * and survive. */
const lostHooks = [];
function onRastersLost(hook) { lostHooks.push(hook); }
function rastersLost() {
  for (const model of models) { model.sprites.clear(); model.shadows.clear(); if (model.heldSprites) model.heldSprites.clear(); }
  held.sprites.clear(); heldBytes.sprites = 0;
  for (const hook of lostHooks) hook();
}

function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/* materials[0] is unused (0 = empty). Each: {rgb:[r,g,b], kind}.
 * kind: 'matte' (default) | 'gloss' | 'glass' | 'glow' | 'ink'. */
// Every live model, so a change of light can drop their baked sprites.
// Ids come from a counter, not the list's length: a dropped model's id is
// never handed out again, so the budget's keys (id|key) stay unique.
const models = [];
let nextModelId = 0;
/* The model turns about its true middle, w / 2 by h / 2. Rounded down to a
 * whole voxel, a model with an odd width or length turned about a point half
 * a voxel off it, so its body circled about a pixel round the model's position
 * as it turned. An odd size samples exactly on voxel edges when square on, so
 * its sample points are nudged by EDGE on screen (the same at every heading,
 * so it adds no drift): rounding noise then cannot pick a different side of
 * the edge row by row (a ragged edge when facing backwards). Even sizes are
 * not nudged, so their pictures stay exactly as they were. */
const EDGE = 1e-6;
function createModel(w, h, count, materials) {
  const model = {
    id: nextModelId++, w, h, count, materials,
    vox: new Uint8Array(w * h * count),
    cx: w / 2, cy: h / 2, edge: w % 2 || h % 2 ? EDGE : 0,
    surfaces: new Map(), sprites: new Map(), shadows: new Map(),
    normals: null, crowd: null,
  };
  models.push(model);
  return model;
}

/* Switch the time of day. Baked sprites, shadows and ramps are dropped and
 * bake again on demand; normals and occlusion do not depend on the light. */
function setLighting(id) {
  if (!PRESETS[id]) id = 'day';
  if (id === lightingId) return false;
  lighting = PRESETS[id]; lightingId = id;
  aim();
  rampCache = new WeakMap();
  for (const model of models) { model.surfaces.clear(); model.sprites.clear(); model.shadows.clear(); }
  forgetAll();
  return true;
}

function directionOf(turn, frames = TURN_FRAMES) {
  return ((Math.round(turn * frames / (Math.PI * 2)) % frames) + frames) % frames;
}

function solid(model, x, y, z) {
  return x >= 0 && x < model.w && y >= 0 && y < model.h && z >= 0 && z < model.count &&
    model.vox[(z * model.h + y) * model.w + x] !== 0;
}

/* Smoothed normal and ambient occlusion per voxel, shared by all headings.
 * Averaging occupancy over a 3×3×3 block shades sloped panels in broad bands
 * instead of lighting every one-pixel staircase. */
/* The gradient's parts are whole numbers from -9 to 9 (nine neighbours a
 * side), so every normal is one of 19³ directions. The table holds those
 * once; a voxel keeps only which one it is (0: not worked out yet) and how
 * crowded its space is (of 27): 3 bytes, not the 17 a float per part took.
 * The values read back are exactly the ones that were stored before. */
const NORMALS = (() => {
  const table = new Float32Array(19 * 19 * 19 * 3);
  for (let gx = -9; gx <= 9; gx++) for (let gy = -9; gy <= 9; gy++) for (let gz = -9; gz <= 9; gz++) {
    const length = Math.hypot(gx, gy, gz), at = (((gx + 9) * 19 + gy + 9) * 19 + gz + 9) * 3;
    if (length) { table[at] = gx / length; table[at + 1] = gy / length; table[at + 2] = gz / length; }
  }
  return table;
})();
// One voxel's shading at a time: normal x, y, z and crowding, read straight after the call.
const SHADE = new Float32Array(4);
function shadingOf(model, x, y, z, fx, fy, fz) {
  const {w, h, count} = model;
  if (!model.normals) {
    model.normals = new Uint16Array(w * h * count);
    model.crowd = new Uint8Array(w * h * count);
  }
  const index = (z * h + y) * w + x;
  let code = model.normals[index];
  if (!code) {
    let gx = 0, gy = 0, gz = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      gx += +solid(model, x - 1, y + a, z + b) - +solid(model, x + 1, y + a, z + b);
      gy += +solid(model, x + a, y - 1, z + b) - +solid(model, x + a, y + 1, z + b);
      gz += +solid(model, x + a, y + b, z - 1) - +solid(model, x + a, y + b, z + 1);
    }
    // No gradient: the face the ray came through (a unit axis, so the table has it too).
    if (!gx && !gy && !gz) { gx = fx; gy = fy; gz = fz; }
    code = 1 + ((gx + 9) * 19 + gy + 9) * 19 + gz + 9;
    const at = (code - 1) * 3;
    // Occlusion: how crowded is the space the surface faces?
    const px = Math.round(x + NORMALS[at] * 1.6), py = Math.round(y + NORMALS[at + 1] * 1.6);
    const pz = Math.round(z + NORMALS[at + 2] * 1.6);
    let filled = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      filled += +solid(model, px + a, py + b, pz + c);
    }
    model.normals[index] = code; model.crowd[index] = filled;
  }
  const at = (code - 1) * 3;
  SHADE[0] = NORMALS[at]; SHADE[1] = NORMALS[at + 1]; SHADE[2] = NORMALS[at + 2]; SHADE[3] = model.crowd[index] / 27;
  return SHADE;
}

/* View textures (advanced, optional). A model can keep five drawings of
 * itself (left, right, front, rear and top views),
 * resampled onto its faces. Each pixel of a surface then takes its colour
 * from those drawings rather than from its voxel: the views that face both
 * the camera and the surface are blended, each only near the face it was
 * drawn on, so the model keeps its drawn detail as it turns. Colours from the
 * drawings already carry their own shading, so they take the time of day's
 * light at TEXTURE_LIGHT of its strength. */
const TEXTURE_LIGHT = 0.55;
/* image: RGBA of the views texture (width 2(h+w)k, height (count+h)k: the side, end and top views laid out as attachTexture reads them below). */
function attachTexture(model, image, width, height) {
  const {w, h, count, vox} = model, K = width / (2 * (h + w));
  if (!Number.isInteger(K) || K < 1 || height !== K * (count + h)) {
    throw new Error(`views texture should be ${2 * (h + w)}k × ${count + h}k px for a ${w}×${h}×${count} model`);
  }
  const words = new Uint32Array(image.buffer, image.byteOffset, width * height);
  const face = (ox, oy, fw, fh) => {
    const data = new Uint32Array(fw * fh);
    for (let y = 0; y < fh; y++) data.set(words.subarray((oy + y) * width + ox, (oy + y) * width + ox + fw), y * fw);
    return {data, width: fw, height: fh};
  };
  const faces = {
    px: face(0, 0, K * h, K * count), nx: face(K * h, 0, K * h, K * count),
    py: face(2 * K * h, 0, K * w, K * count), ny: face(2 * K * h + K * w, 0, K * w, K * count),
    pz: face(0, K * count, K * w, K * h),
  };
  // How deep each voxel lies below the face each view was drawn on.
  const minAlong = new Int16Array(count * w).fill(h), maxAlong = new Int16Array(count * w).fill(-1);
  const minAcross = new Int16Array(count * h).fill(w), maxAcross = new Int16Array(count * h).fill(-1);
  const topZ = new Int16Array(h * w).fill(-1);
  for (let z = 0; z < count; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!vox[(z * h + y) * w + x]) continue;
    const a = z * w + x, b = z * h + y;
    if (y < minAlong[a]) minAlong[a] = y; maxAlong[a] = y;
    if (x < minAcross[b]) minAcross[b] = x; maxAcross[b] = x;
    topZ[y * w + x] = z;
  }
  const flatTop = new Float32Array(h * w), reach = 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = Math.max(0, x - reach), b = Math.min(w - 1, x + reach), c = Math.max(0, y - reach), d = Math.min(h - 1, y + reach);
    const slopeX = Math.abs(topZ[y * w + b] - topZ[y * w + a]) / Math.max(1, b - a);
    const slopeY = Math.abs(topZ[d * w + x] - topZ[c * w + x]) / Math.max(1, d - c);
    flatTop[y * w + x] = Math.max(0, 1 - Math.max(slopeX, slopeY) / 0.65);
  }
  // One smooth normal per surface voxel from a summed volume (radius 2).
  const sx = w + 1, sy = (h + 1) * sx, sum = new Int32Array((count + 1) * sy);
  for (let z = 0; z < count; z++) for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      run += vox[(z * h + y) * w + x] ? 1 : 0;
      const n = (z + 1) * sy + (y + 1) * sx + x + 1;
      sum[n] = run + sum[n - sx] + sum[n - sy] - sum[n - sx - sy];
    }
  }
  const box = (x0, y0, z0, x1, y1, z1) => {
    const a = Math.max(0, x0), b = Math.min(w, x1), c = Math.max(0, y0) * sx, d = Math.min(h, y1) * sx;
    const e = Math.max(0, z0) * sy, f = Math.min(count, z1) * sy;
    return sum[b + d + f] - sum[a + d + f] - sum[b + c + f] + sum[a + c + f] - sum[b + d + e] + sum[a + d + e] + sum[b + c + e] - sum[a + c + e];
  };
  const radius = 2, area = (2 * radius + 1) ** 2, normals = new Int8Array(vox.length * 3);
  for (let z = 0; z < count; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const index = (z * h + y) * w + x;
    if (!vox[index]) continue;
    const a = z * w + x, b = z * h + y;
    const depth = Math.min(y - minAlong[a], maxAlong[a] - y, x - minAcross[b], maxAcross[b] - x, topZ[y * w + x] - z);
    if (depth > 1) continue;
    const x0 = x - radius, y0 = y - radius, z0 = z - radius, x1 = x + radius + 1, y1 = y + radius + 1, z1 = z + radius + 1;
    normals[index * 3] = Math.round((box(x0, y0, z0, x0 + 1, y1, z1) - box(x1 - 1, y0, z0, x1, y1, z1)) / area * 127);
    normals[index * 3 + 1] = Math.round((box(x0, y0, z0, x1, y0 + 1, z1) - box(x0, y1 - 1, z0, x1, y1, z1)) / area * 127);
    normals[index * 3 + 2] = Math.round((box(x0, y0, z0, x1, y1, z0 + 1) - box(x0, y0, z1 - 1, x1, y1, z1)) / area * 127);
  }
  model.texture = {w, h, count, ox: 0, faces, minAlong, maxAlong, minAcross, maxAcross, topZ, flatTop, normals};
  return model.texture;
}
/* How much each view counts at this heading: the camera looks down at the
 * slice stack's angle (rise 1 over SQUASH-scaled ground), from +y when the
 * cosine is positive and from +x when the sine is. */
function viewWeights(cosine, sine) {
  const k = 1 / Math.hypot(1 / SQUASH, 1), along = Math.abs(cosine) * k / SQUASH, across = Math.abs(sine) * k / SQUASH;
  return {front: cosine > 0, plusX: sine > 0, end: along ** 2.4, side: across ** 2.4, top: k ** 2.4,
    planBias: 2.4 * k * k * (1 - Math.max(along, across) ** 12)};
}
function faceColor(face, u, v) {
  const x = Math.min(face.width - 1, Math.max(0, Math.floor(u * face.width)));
  const y = Math.min(face.height - 1, Math.max(0, Math.floor(v * face.height)));
  const color = face.data[y * face.width + x];
  return color >>> 24 ? color : 0;
}
const projection = (weight, normal, depth) => weight * (0.035 + Math.max(0, normal)) / (1 + 2.25 * (depth / 1.7) ** 2);
const channel = (cx, cy, cz, ax, ay, az, total, shift) =>
  Math.round((((cx >>> shift) & 255) * ax + ((cy >>> shift) & 255) * ay + ((cz >>> shift) & 255) * az) / total);
/* The drawn colour at a point (hx, hy, hz) on voxel (x, y, z), or 0 where no
 * view reaches (a hollow, the inside of an arch): the voxel's own colour then. */
function textureColor(tex, weights, x, y, z, hx, hy, hz) {
  x -= tex.ox; hx -= tex.ox;
  const {w, h, count} = tex;
  if (x < 0 || x >= w || y < 0 || y >= h || z < 0 || z >= count) return 0;
  const a = z * w + x, b = z * h + y, plan = y * w + x, index = ((z * h + y) * w + x) * 3;
  const ex = weights.front ? tex.maxAlong[a] - y : y - tex.minAlong[a];
  const ey = weights.plusX ? tex.maxAcross[b] - x : x - tex.minAcross[b];
  const ez = tex.topZ[plan] - z;
  if (Math.min(ex, ey, ez) > 1) return 0;
  const nx = tex.normals[index] / 127, ny = tex.normals[index + 1] / 127, nz = tex.normals[index + 2] / 127;
  let ax = projection(weights.end, weights.front ? ny : -ny, ex);
  let ay = projection(weights.side, weights.plusX ? nx : -nx, ey);
  let az = projection(weights.top, nz, ez);
  if (ez <= 1) az += tex.flatTop[plan] * weights.planBias / (1 + ez);
  const u = Math.max(0, Math.min(1 - 1e-9, hx / w)), v = Math.max(0, Math.min(1 - 1e-9, hy / h));
  const t = 1 - Math.max(0, Math.min(1 - 1e-9, hz / count));
  let cx = 0, cy = 0, cz = 0;
  // The strongest view alone, unless another is within the blend band.
  if (ax > 0) {
    cx = faceColor(weights.front ? tex.faces.py : tex.faces.ny, u, t);
    if (!cx) ax = 0;
    else if (ax >= 1e-7 && ay / ax <= 0.58 && az / ax <= 0.58) return cx;
  }
  if (ay > 0) {
    cy = faceColor(weights.plusX ? tex.faces.px : tex.faces.nx, v, t);
    if (!cy) ay = 0;
    else if (ay >= 1e-7 && ax / ay <= 0.58 && az / ay <= 0.58) return cy;
  }
  if (az > 0) {
    cz = faceColor(tex.faces.pz, u, v);
    if (!cz) az = 0;
  }
  const best = Math.max(ax, ay, az);
  if (best < 1e-7) return 0;
  ax = Math.max(0, ax / best - 0.58); ay = Math.max(0, ay / best - 0.58); az = Math.max(0, az / best - 0.58);
  if (!ay && !az) return cx; if (!ax && !az) return cy; if (!ax && !ay) return cz;
  const total = ax + ay + az;
  return (0xff000000 | channel(cx, cy, cz, ax, ay, az, total, 16) << 16 |
    channel(cx, cy, cz, ax, ay, az, total, 8) << 8 | channel(cx, cy, cz, ax, ay, az, total, 0)) >>> 0;
}

/* Which voxel shows through each screen pixel, and its light level.
 * A ray crosses the thickness of every slice so vertical panels stay solid
 * between layer tops. `shear` leans the stack sideways (body roll).
 * `pose` moves the body on its suspension: pitch tips the nose up (+) or down
 * (-) by that many voxels of height per voxel of length, heave lifts the body
 * by whole voxels, and scale spreads it across the ground (squash and
 * stretch). Only the body above model.suspension = [from, to] moves; the
 * wheels below stay on the ground. */
/* Baked surfaces and sprites, every model's together, under one budget in
 * bytes: least recently used out first. A surface (a 32-bit voxel index per
 * pixel) is only needed again to bake another colour of the same pose, yet
 * kept per model without a limit they reached hundreds of megabytes over a
 * session, enough to make a phone drop the tab or the canvas. A sprite
 * pushed out bakes again when next asked for; the game already copes with a
 * picture that is not baked yet (hasSprite). setBudget() sizes it for the
 * device; stats() reports what is held. */
const budget = {surfaces: 32e6, sprites: 160e6};
/* held: every model's entries in one least-recently-used order (a Set keeps
 * the order things went in). Each model also keeps its own entries by key
 * (heldSurfaces, heldSprites), so a hit finds its entry without building a
 * new string: lookups happen for every object every frame. */
const held = {surfaces: new Set(), sprites: new Set()}, heldBytes = {surfaces: 0, sprites: 0};
const evicted = {surfaces: 0, sprites: 0};
const sizeOf = (kind, value) => !value ? 64 : kind === 'sprites' ? value.w * value.h * 4 + 256 :
  value.vis.byteLength + value.shade.byteLength + (value.tex ? value.tex.byteLength : 0) + (value.depth ? value.depth.byteLength : 0);
function entriesOf(kind, model) {
  return kind === 'surfaces' ? model.heldSurfaces || (model.heldSurfaces = new Map()) : model.heldSprites || (model.heldSprites = new Map());
}
function remember(kind, model, key, value) {
  const map = kind === 'surfaces' ? model.surfaces : model.sprites, list = held[kind], own = entriesOf(kind, model);
  const before = own.get(key);
  if (before) { heldBytes[kind] -= before.bytes; list.delete(before); }
  const bytes = sizeOf(kind, value), entry = {map, own, key, bytes};
  own.set(key, entry); list.add(entry);
  map.set(key, value);
  heldBytes[kind] += bytes;
  // Never the one just made, so a single huge item still comes back.
  for (const old of list) {
    if (heldBytes[kind] <= budget[kind] || old === entry) break;
    old.map.delete(old.key); old.own.delete(old.key); list.delete(old); heldBytes[kind] -= old.bytes; evicted[kind]++;
  }
}
/* A cache hit: that item is the most recently used now. */
function touch(kind, model, key) {
  const own = kind === 'surfaces' ? model.heldSurfaces : model.heldSprites, entry = own && own.get(key);
  if (entry) { const list = held[kind]; list.delete(entry); list.add(entry); }
}
/* Let a model go for good (a game drops copies of a model it no longer
 * needs): off the list of live models, and its baked surfaces and sprites out
 * of the budget, so nothing keeps it or its pictures in memory. */
function dropModel(model) {
  const at = models.indexOf(model);
  if (at >= 0) models.splice(at, 1);
  for (const kind of KINDS) {
    const own = kind === 'surfaces' ? model.heldSurfaces : model.heldSprites;
    if (own) for (const entry of own.values()) { held[kind].delete(entry); heldBytes[kind] -= entry.bytes; }
    if (own) own.clear();
    (kind === 'surfaces' ? model.surfaces : model.sprites).clear();
  }
  model.shadows.clear();
}
const KINDS = ['surfaces', 'sprites'];
function forgetAll() {
  for (const kind of KINDS) { held[kind].clear(); heldBytes[kind] = 0; }
  for (const model of models) { if (model.heldSurfaces) model.heldSurfaces.clear(); if (model.heldSprites) model.heldSprites.clear(); }
}
function setBudget(next) {
  for (const kind of KINDS) if (next && next[kind] > 0) budget[kind] = next[kind];
}
function stats() {
  let canvases = 0, pixels = 0;
  for (const canvas of liveCanvases()) { canvases++; pixels += canvas.width * canvas.height; }
  return {surfaces: {count: held.surfaces.size, bytes: heldBytes.surfaces, budget: budget.surfaces, evicted: evicted.surfaces},
    sprites: {count: held.sprites.size, bytes: heldBytes.sprites, budget: budget.sprites, evicted: evicted.sprites}, models: models.length, canvases, canvasBytes: pixels * 4};
}
/* keep: false works a surface out without caching it (the menu turntable
 * keeps only the finished sprites, in a small cache of its own). */
function surface(model, direction, spacing = 1, shear = 0, frames = TURN_FRAMES, pose = null, keep = true) {
  const pitch = pose ? pose.pitch || 0 : 0, heave = pose ? pose.heave || 0 : 0, scale = pose ? pose.scale || 1 : 1;
  const key = direction + '|' + spacing + '|' + shear + '|' + frames + (pose ? '|' + pitch + '|' + heave + '|' + scale : '');
  const cached = model.surfaces.get(key);
  if (cached) { touch('surfaces', model, key); return cached; }
  const {w, h, count, vox, cx, cy, edge} = model;
  const pivot = Math.min(4, count / 4);
  const [bodyFrom, bodyTo] = model.suspension || [-1, 0];
  const bodyOf = z => Math.max(0, Math.min(1, (z - bodyFrom) / Math.max(1, bodyTo - bodyFrom)));
  const reach = Math.abs(pitch) * h / 2 + Math.abs(heave);
  const radius = Math.ceil(Math.hypot(w, h) / 2 * Math.max(1, scale) + Math.abs(shear) * count + reach) + 3;
  const lift = Math.ceil((count - 1) * spacing + 1);
  const width = radius * 2, height = radius * 2 + lift;
  const originX = radius, originY = radius + lift;
  const vis = new Int32Array(width * height).fill(-1);
  const shade = new Uint8Array(width * height);
  const angle = direction * Math.PI * 2 / frames;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const texture = model.texture, tex = texture ? new Uint32Array(width * height) : null;
  const weights = texture ? viewWeights(cosine, sine) : null;
  const rayX = -sine / SQUASH, rayY = -cosine / SQUASH;
  const thickness = Math.min(1, spacing);
  // Per slice: how much of the body's movement it takes, and its tilt.
  const tilts = new Float64Array(count), rises = new Float64Array(count), solve = new Float64Array(count);
  for (let z = 0; z < count; z++) {
    const share = pose ? bodyOf(z) : 0;
    tilts[z] = pitch * share; rises[z] = heave * share;
    solve[z] = 1 / (1 - tilts[z] * cosine / SQUASH);
  }
  // The light in model space, stepped one voxel at a time for self-shadowing.
  const lx = LIGHT[0] * cosine + LIGHT[1] * sine, ly = -LIGHT[0] * sine + LIGHT[1] * cosine, lz = LIGHT[2];
  const hx = HALF[0] * cosine + HALF[1] * sine, hy = -HALF[0] * sine + HALF[1] * cosine, hz = HALF[2];
  const shadowReach = Math.min(12, count + 4);

  function lightLevel(x, y, z, fx, fy, fz) {
    const n = shadingOf(model, x, y, z, fx, fy, fz);
    const nx = n[0], ny = n[1], nz = n[2], crowd = n[3];
    let diffuse = Math.max(0, lx * nx + ly * ny + lz * nz);
    if (diffuse > 0.05) {
      // Walk towards the light; anything in the way puts this voxel in shade.
      for (let step = 2; step <= shadowReach; step++) {
        const sx = Math.round(x + nx + lx * step), sy = Math.round(y + ny + ly * step);
        const sz = Math.round(z + nz + lz * step);
        if (sz >= count) break;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h || sz < 0) continue;
        if (vox[(sz * h + sy) * w + sx]) { diffuse *= 0.62; break; }
      }
    }
    let level = Math.round(diffuse * 4);
    if (crowd > 0.56 && level > 0) level--;
    const kind = model.materials[vox[(z * h + y) * w + x]].kind;
    if (kind === 'gloss' && hx * nx + hy * ny + hz * nz > 0.965 && level >= 3) level = 5;
    if (kind === 'glass' && level > 3) level = 3;
    return Math.min(LEVELS - 1, level);
  }

  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const screenX = px + 0.5 + edge - originX, screenY = py + 0.5 + edge - originY;
    const output = py * width + px;
    for (let z = count - 1; z >= 0; z--) {
      // A pitched slice sits higher towards its nose: solve for the point
      // along the model whose raised slice lands on this pixel.
      const base = (screenY + z * spacing + rises[z]) / SQUASH;
      const along = (-screenX * sine + base * cosine) * solve[z];
      const localY = base + tilts[z] * along / SQUASH;
      const lean = shear * (z - pivot);
      const startX = (screenX * cosine + localY * sine) / scale + cx - lean;
      const startY = along / scale + cy;
      if (startX < -2 || startY < -2 || startX > w + 2 || startY > h + 2) continue;
      let distance = 0.00001, fx = 0, fy = 0, fz = 1, hit = false;
      while (distance <= thickness + 0.00001) {
        const x = Math.floor(startX + rayX * distance), y = Math.floor(startY + rayY * distance);
        if (x >= 0 && x < w && y >= 0 && y < h && vox[(z * h + y) * w + x]) {
          const voxel = (z * h + y) * w + x;
          vis[output] = voxel;
          shade[output] = lightLevel(x, y, z, fx, fy, fz);
          if (tex && model.materials[vox[voxel]].textured) {
            // Where the ray met the voxel: its top, or down its side.
            const depth = Math.min(1, distance / thickness);
            tex[output] = textureColor(texture, weights, x, y, z, startX + rayX * distance, startY + rayY * distance, z + 1 - depth);
          }
          hit = true; break;
        }
        const boundaryX = rayX > 0 ? x + 1 : x, boundaryY = rayY > 0 ? y + 1 : y;
        const nextX = Math.abs(rayX) > 1e-8 ? (boundaryX - startX) / rayX : Infinity;
        const nextY = Math.abs(rayY) > 1e-8 ? (boundaryY - startY) / rayY : Infinity;
        if (nextX < nextY) { distance = nextX + 0.00001; fx = -Math.sign(rayX); fy = 0; }
        else { distance = nextY + 0.00001; fx = 0; fy = -Math.sign(rayY); }
        fz = 0;
      }
      if (hit) break;
    }
  }
  const result = {width, height, originX, originY, vis, shade, tex};
  if (keep) remember('surfaces', model, key, result);
  return result;
}

/* A tumbling body (flips and barrel rolls in the air), in the same surface
 * format as surface() so it bakes through the same palettes and outlines.
 * The slice ray-march assumes an upright stack, so here every outer voxel
 * is rotated about the model's centre instead (roll about its length, then
 * pitch about its width: + pitch puts the nose down), turned to the heading
 * and splatted at 27 points with a depth test. Lit from its rotated normal;
 * no self-shadowing. pitch and roll are in steps of a turn / steps. */
function outerVoxels(model) {
  if (model.outer) return model.outer;
  const {w, h, count, vox} = model, list = [];
  for (let z = 0; z < count; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!vox[(z * h + y) * w + x]) continue;
    if (solid(model, x - 1, y, z) && solid(model, x + 1, y, z) && solid(model, x, y - 1, z) && solid(model, x, y + 1, z) &&
        solid(model, x, y, z - 1) && solid(model, x, y, z + 1)) continue;
    list.push(x, y, z);
  }
  model.outer = Int16Array.from(list);
  return model.outer;
}
function tumbleAxes(direction, pitchStep, rollStep, steps, frames) {
  const pitch = pitchStep * Math.PI * 2 / steps, roll = rollStep * Math.PI * 2 / steps;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const angle = direction * Math.PI * 2 / frames, ca = Math.cos(angle), sa = Math.sin(angle);
  // Model axes after roll and pitch, then turned to the heading (screen x, ground y, up z).
  const turnTo = (x, y, z) => {
    const x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
    const y2 = y * cp + z1 * sp, z2 = -y * sp + z1 * cp;
    return [x1 * ca - y2 * sa, x1 * sa + y2 * ca, z2];
  };
  return [turnTo(1, 0, 0), turnTo(0, 1, 0), turnTo(0, 0, 1)];
}

/* Rotate an offset from the same pivot used to bake a tumbled model. */
function poseTransform(direction, pitchStep, rollStep, steps = 16, frames = TURN_FRAMES) {
  const [[axx, axy, axz], [ayx, ayy, ayz], [azx, azy, azz]] = tumbleAxes(direction, pitchStep, rollStep, steps, frames);
  return (x, y, z) => ({
    x: x * axx + y * ayx + z * azx,
    y: x * axy + y * ayy + z * azy,
    z: x * axz + y * ayz + z * azz,
  });
}
function tumbleSurface(model, direction, pitchStep, rollStep, steps = 16, {pivotZ = model.count / 2, mirrored = false, frames = TURN_FRAMES} = {}) {
  const key = 'tumble|' + direction + '|' + pitchStep + '|' + rollStep + '|' + steps + '|' + pivotZ + '|' + mirrored + '|' + frames;
  const cached = model.surfaces.get(key);
  if (cached) { touch('surfaces', model, key); return cached; }
  const {w, h, count, cx, cy} = model, outer = outerVoxels(model);
  const zc = pivotZ, R = Math.ceil(Math.hypot(w / 2, h / 2, Math.max(zc, count - zc))) + 1;
  const width = R * 2 + 4, originX = R + 2;
  const originY = Math.ceil(R * SQUASH + zc + R) + 2, height = originY + Math.ceil(R * SQUASH + R - zc) + 3;
  const vis = new Int32Array(width * height).fill(-1), shade = new Uint8Array(width * height);
  const depth = new Float32Array(width * height).fill(-Infinity);
  const [[axx, axy, axz], [ayx, ayy, ayz], [azx, azy, azz]] = tumbleAxes(direction, pitchStep, rollStep, steps, frames);
  const offsets = [0.17, 0.5, 0.83];
  for (let k = 0; k < outer.length; k += 3) {
    const x = outer[k], y = outer[k + 1], z = outer[k + 2], index = (z * h + y) * w + x;
    const n = shadingOf(model, x, y, z, 0, 0, 1);
    const nx = n[0] * axx + n[1] * ayx + n[2] * azx;
    const ny = n[0] * axy + n[1] * ayy + n[2] * azy;
    const nz = n[0] * axz + n[1] * ayz + n[2] * azz;
    let level = Math.round(Math.max(0, LIGHT[0] * nx + LIGHT[1] * ny + LIGHT[2] * nz) * 4);
    if (n[3] > 0.56 && level > 0) level--;
    const kind = model.materials[model.vox[index]].kind;
    if (kind === 'gloss' && HALF[0] * nx + HALF[1] * ny + HALF[2] * nz > 0.965 && level >= 3) level = 5;
    if (kind === 'glass' && level > 3) level = 3;
    level = Math.min(LEVELS - 1, level);
    for (const ox of offsets) for (const oy of offsets) for (const oz of offsets) {
      const mx = x + ox - cx, my = y + oy - cy, mz = z + oz - zc;
      const X = mx * axx + my * ayx + mz * azx, Y = mx * axy + my * ayy + mz * azy;
      let Z = mx * axz + my * ayz + mz * azz + zc;
      if (mirrored) {
        if (Z < zc) continue;
        Z = 2 * zc - Z;
      }
      const px = Math.floor(X + originX), py = Math.floor(Y * SQUASH - Z + originY);
      if (px < 1 || py < 1 || px >= width - 1 || py >= height - 1) continue;
      const out = py * width + px, near = Y + SQUASH * Z;
      if (near <= depth[out]) continue;
      depth[out] = near; vis[out] = index; shade[out] = level;
    }
  }
  const result = {width, height, originX, originY, vis, shade};
  remember('surfaces', model, key, result);
  return result;
}
function tumble(model, variant, palette, direction, pitchStep, rollStep, steps = 16, options = {}) {
  const {pivotZ = model.count / 2, mirrored = false, frames = TURN_FRAMES} = options;
  const key = variant + '|tumble|' + direction + '|' + pitchStep + '|' + rollStep + '|' + steps + '|' + pivotZ + '|' + mirrored + '|' + frames;
  if (model.sprites.has(key)) { touch('sprites', model, key); return model.sprites.get(key); }
  const result = bake(model, tumbleSurface(model, direction, pitchStep, rollStep, steps, options), palette);
  remember('sprites', model, key, result);
  return result;
}

/* Six-step colour ramp per material. Shadows drift towards cool blue and
 * highlights towards warm cream, rather than only getting darker or lighter. */
let rampCache = new WeakMap();
function rampsFor(palette, materials) {
  let ramps = rampCache.get(palette);
  if (ramps) return ramps;
  ramps = palette.map((rgb, id) => {
    if (!rgb) return null;
    const kind = materials[id] ? materials[id].kind : 'matte';
    const lightContrast = materials[id]?.lightContrast ?? 1;
    const out = new Uint8Array(LEVELS * 3);
    for (let level = 0; level < LEVELS; level++) {
      const L = lighting;
      let gain = 1 + ([0.56, 0.70, 0.85, 1, 1.10, 1.24][level] - 1) * L.contrast;
      let cool = Math.max(0, BASE_LEVEL - level) * L.coolAmount, warm = Math.max(0, level - BASE_LEVEL) * L.warmAmount;
      if (kind === 'glow') { gain = level >= 4 ? 1.08 : 1; cool = warm = 0; }
      else if (kind === 'ink') { gain = Math.min(1, 0.76 + level * 0.08); warm = 0; }
      else if (kind === 'glass') { gain = 1 + ([0.74, 0.84, 0.93, 1, 1, 1][level] - 1) * L.contrast; warm = 0; }
      gain = 1 + (gain - 1) * lightContrast;
      cool *= lightContrast;
      warm *= lightContrast;
      for (let c = 0; c < 3; c++) {
        let value = rgb[c] * gain;
        value += (L.cool[c] - value) * cool;
        value += (L.warm[c] - value) * warm;
        out[level * 3 + c] = Math.max(0, Math.min(255, Math.round(value)));
      }
    }
    return out;
  });
  rampCache.set(palette, ramps);
  return ramps;
}

/* Colour a surface. `override` (Int16Array per voxel, -1 = keep) swaps the
 * material of chosen voxels; with `only`, just those pixels are emitted,
 * which is how spinning rims and brake lamps become small overlay sprites. */
/* Light for drawn colours: the material ramps' gain and colour drift per
 * level, at TEXTURE_LIGHT of their strength. Cached per time of day. */
let textureLight = null, textureLightFor = null;
function textureRamp() {
  if (textureLightFor === lighting) return textureLight;
  const L = lighting, k = TEXTURE_LIGHT;
  textureLight = [0.56, 0.70, 0.85, 1, 1.10, 1.24].map((step, level) => ({
    gain: 1 + (step - 1) * L.contrast * k,
    cool: Math.max(0, BASE_LEVEL - level) * L.coolAmount * k, warm: Math.max(0, level - BASE_LEVEL) * L.warmAmount * k,
  }));
  textureLightFor = lighting;
  return textureLight;
}
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
/* A drawn colour in this palette's livery. The colour the model was drawn in
 * (palette.drawn) stays exactly as drawn; another paints over the drawing's
 * paint, keeping its shading: each paint shade moves to the livery's shade
 * and keeps how much lighter or darker than its shade's mean it was drawn. */
function livered(model, palette, voxel, color) {
  const r = color & 255, g = (color >>> 8) & 255, b = (color >>> 16) & 255;
  const paint = model.paintTest;
  if (palette.drawn || !paint || !model.paintable || !model.paintable[voxel] || !paint(r, g, b)) return color;
  const shade = model.paintShade(r + g + b), slot = model.slots.paint[shade], mean = model.paintShades[shade];
  const target = slot && palette[slot];
  if (!target || !mean) return color;
  const lift = luma(r, g, b) - luma(mean[0], mean[1], mean[2]);
  const clamp = v => Math.max(0, Math.min(255, Math.round(v + lift)));
  return (0xff000000 | clamp(target[2]) << 16 | clamp(target[1]) << 8 | clamp(target[0])) >>> 0;
}
function bake(model, surf, palette, override = null, only = false) {
  const {width, height, vis, shade, tex} = surf;
  const ramps = rampsFor(palette, model.materials), vox = model.vox, materials = model.materials;
  const light = tex ? textureRamp() : null;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let left = width, right = -1, top = height, bottom = -1;
  const materialAt = at => {
    const voxel = vis[at];
    if (voxel < 0) return 0;
    const swapped = override ? override[voxel] : -1;
    if (only && swapped < 0) return 0;
    return swapped >= 0 ? swapped : vox[voxel];
  };
  // A textured pixel: its drawn colour (or, where no view reaches, its
  // material's), in this livery, lit softly. Swapped-in materials (rims,
  // lamps) keep their own ramps.
  const drawn = at => {
    const voxel = vis[at];
    if (!tex || voxel < 0 || (override && override[voxel] >= 0) || !materials[vox[voxel]].textured) return 0;
    if (tex[at]) return livered(model, palette, voxel, tex[at]);
    const rgb = palette[vox[voxel]];
    return rgb ? (0xff000000 | rgb[2] << 16 | rgb[1] << 8 | rgb[0]) >>> 0 : 0;
  };
  for (let py = 1; py < height - 1; py++) for (let px = 1; px < width - 1; px++) {
    const at = py * width + px, out = at * 4;
    const material = materialAt(at), color = material ? drawn(at) : 0;
    if (color) {
      const step = materials[material].kind === 'glow' ? null : light[shade[at]];
      const lit = c => {
        let value = ((color >>> (c * 8)) & 255);
        if (!step) return value;
        value *= step.gain;
        value += (lighting.cool[c] - value) * step.cool;
        return value + (lighting.warm[c] - value) * step.warm;
      };
      pixels[out] = lit(0); pixels[out + 1] = lit(1); pixels[out + 2] = lit(2);
    } else if (material) {
      const ramp = ramps[material], level = shade[at] * 3;
      pixels[out] = ramp[level]; pixels[out + 1] = ramp[level + 1]; pixels[out + 2] = ramp[level + 2];
    } else if (!only && vis[at] < 0) {
      // Selective outline: ink tinted by the darkest tone of the edge it hugs.
      const neighbour = vis[at + width] >= 0 ? at + width : vis[at + 1] >= 0 ? at + 1 :
        vis[at - 1] >= 0 ? at - 1 : vis[at - width] >= 0 ? at - width : -1;
      if (neighbour < 0) continue;
      const edge = drawn(neighbour);
      if (edge) {
        // Ink tinted by the drawn colour, darkened as the darkest ramp step would be.
        for (let c = 0; c < 3; c++) pixels[out + c] = Math.round(INK[c] * 0.62 + ((edge >>> (c * 8)) & 255) * 0.56 * 0.38);
      } else {
        const ramp = ramps[materialAt(neighbour)];
        for (let c = 0; c < 3; c++) pixels[out + c] = Math.round(INK[c] * 0.62 + ramp[c] * 0.38);
      }
    } else continue;
    pixels[out + 3] = 255;
    if (px < left) left = px; if (px > right) right = px;
    if (py < top) top = py; if (py > bottom) bottom = py;
  }
  if (right < 0) return null;
  const w = right - left + 1, h = bottom - top + 1;
  const canvas = newCanvas(w, h), context = canvas.getContext('2d');
  const image = context.createImageData(w, h);
  for (let row = 0; row < h; row++) {
    const from = ((top + row) * width + left) * 4;
    image.data.set(pixels.subarray(from, from + w * 4), row * w * 4);
  }
  context.putImageData(image, 0, 0);
  return {canvas, dx: left - surf.originX, dy: top - surf.originY, w, h};
}

/* Cached sprite for one heading. `variant` names the palette/override pair. */
function spriteKey(variant, direction, {spacing = 1, shear = 0, frames = TURN_FRAMES, pose = null}) {
  return variant + '|' + direction + '|' + spacing + '|' + shear + '|' + frames +
    (pose ? '|' + pose.pitch + '|' + pose.heave + '|' + pose.scale : '');
}
/* Is that sprite baked already? (Nothing is baked to find out.) */
function hasSprite(model, variant, direction, options = NO_OPTIONS) { return model.sprites.has(spriteKey(variant, direction, options)); }
const NO_OPTIONS = {};
function sprite(model, variant, palette, direction, options = NO_OPTIONS) {
  return spriteByKey(model, spriteKey(variant, direction, options), palette, direction, options);
}
/* The same, with the key worked out once by the caller (a game can keep each
 * pose's keys), so a cached sprite costs no new string. */
function spriteByKey(model, key, palette, direction, options = NO_OPTIONS) {
  const cached = model.sprites.get(key);
  if (cached !== undefined) { touch('sprites', model, key); return cached; }
  const {spacing = 1, shear = 0, frames = TURN_FRAMES, override = null, only = false, pose = null} = options;
  const result = bake(model, surface(model, direction, spacing, shear, frames, pose), palette, override, only);
  remember('sprites', model, key, result);
  return result;
}

/* Ground shadow: every slice dropped onto the ground along the light.
 * Pixels right under the lowest slices are darker, anchoring the object. */
// Shadows by number (frames × 4096 + heading): asked for by every object every frame.
function hasShadow(model, direction, frames = TURN_FRAMES) { return model.shadows.has(frames * 4096 + direction); }
function shadow(model, direction, frames = TURN_FRAMES) {
  const key = frames * 4096 + direction, cached = model.shadows.get(key);
  if (cached !== undefined) return cached;
  const {w, h, count, vox, cx, cy, edge} = model;
  const radius = Math.ceil(Math.hypot(w, h) / 2) + 2;
  const reachX = Math.ceil(count * Math.abs(SHADOW_X)), reachY = Math.ceil(count * Math.abs(SHADOW_Y));
  const originX = radius + (SHADOW_X < 0 ? reachX : 0);
  const originY = radius + (SHADOW_Y < 0 ? reachY : 0);
  const width = radius * 2 + reachX, height = radius * 2 + reachY;
  const angle = direction * Math.PI * 2 / frames, cosine = Math.cos(angle), sine = Math.sin(angle);
  const alpha = new Uint8Array(width * height);
  // Slices that share a silhouette cast the same patch; only test each once.
  for (let z = 0; z < count; z++) {
    const offsetX = Math.round(z * SHADOW_X), offsetY = Math.round(z * SHADOW_Y);
    const strength = z < 3 ? lighting.shadowAlpha[0] : lighting.shadowAlpha[1];
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
      const at = py * width + px;
      if (alpha[at] >= strength) continue;
      const screenX = px + 0.5 + edge - originX - offsetX, localY = (py + 0.5 + edge - originY - offsetY) / SQUASH;
      const x = Math.floor(screenX * cosine + localY * sine + cx);
      const y = Math.floor(-screenX * sine + localY * cosine + cy);
      if (x >= 0 && x < w && y >= 0 && y < h && vox[(z * h + y) * w + x]) alpha[at] = strength;
    }
  }
  let left = width, right = -1, top = height, bottom = -1;
  for (let at = 0; at < alpha.length; at++) if (alpha[at]) {
    const px = at % width, py = (at - px) / width;
    if (px < left) left = px; if (px > right) right = px;
    if (py < top) top = py; if (py > bottom) bottom = py;
  }
  let result = null;
  if (right >= 0) {
    const sw = right - left + 1, sh = bottom - top + 1;
    const canvas = newCanvas(sw, sh), context = canvas.getContext('2d');
    const image = context.createImageData(sw, sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const value = alpha[(top + y) * width + left + x], out = (y * sw + x) * 4;
      const rgb = lighting.shadowRgb;
      image.data[out] = rgb[0]; image.data[out + 1] = rgb[1]; image.data[out + 2] = rgb[2]; image.data[out + 3] = value;
    }
    context.putImageData(image, 0, 0);
    result = {canvas, dx: left - originX, dy: top - originY, w: sw, h: sh};
  }
  model.shadows.set(key, result);
  return result;
}

function draw(context, handle, x, y) {
  if (handle) context.drawImage(handle.canvas, Math.round(x) + handle.dx, Math.round(y) + handle.dy);
}


export {
  TURN_FRAMES, SQUASH, LEVELS, PRESETS, PRESET_IDS, TEXTURE_LIGHT,
  setCanvasFactory, setBudget, stats, createModel, dropModel, directionOf, solid, surface, bake, sprite, spriteByKey, spriteKey,
  hasSprite, shadow, hasShadow, draw, setLighting, addPreset, tumble, tumbleSurface, poseTransform,
  attachTexture, textureColor, viewWeights,
  onRastersLost, rastersLost, liveCanvases,
  newCanvas as canvas,
  // Live bindings: they change with the time of day.
  lighting, lightingId, SHADOW_X, SHADOW_Y,
};
