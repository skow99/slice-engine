/* Procedural trees (from Slice Drive), grown from seeded recipes: eight
 * species whose branches join overlapping clusters of leaves on one voxel
 * grid, with dark undersides, lit tips and ragged edges. Each grows in four
 * seasons: winter strips the broadleaves to bare branches with snow on them
 * and snows on the evergreens, spring brings fresh leaves and pink cherry
 * blossom, autumn turns the broadleaves to fire. Oranges carry fruit.
 *
 * Scale: about 15 voxels to the metre, so an oak is some 130 voxels tall and a
 * spruce taller. Kinds are '<species><variant>', e.g. 'oak0' (largest), 'oak2'.
 *
 * The colours carry their own light, so a tree is projected straight into a
 * picture (no relighting) and outlined like every other sprite. Wind bends a
 * crown by height while the trunk stays put: a bend level shifts each row of
 * that picture by lean × (height up the tree)², made on first use. */
import * as Voxel from './voxel.js';
const SQUASH = Voxel.SQUASH;
const TAU = Math.PI * 2;

/* Voxels per Canopy voxel. 2.4 puts an oak at about 130 voxels. */
const SCALE = 2.4;
/* Three trees of each species, each grown from its own seed and smaller than the last. */
const VARIANT_SIZES = [1, 0.85, 0.72];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_NAMES = {spring: 'SPRING', summer: 'SUMMER', autumn: 'AUTUMN', winter: 'WINTER'};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rgb = hex => { const n = Number.parseInt(hex.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
const list = text => text.split(' ').map(rgb);
function hash(x, y, z = 0) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) | 0;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}
function rng(seed) {
  return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}

/* n: grid width, h: height, in Canopy voxels. flex: how far wind bends it. */
const SPECIES = [
  {id: 'oak', name: 'OAK', n: 58, h: 54, flex: 0.88, colors: list('#263e39 #344e3a #416442 #537b46 #698b4b #84a252 #a4b85e #c7cd79')},
  {id: 'pine', name: 'SCOTS PINE', n: 44, h: 64, flex: 0.61, colors: list('#1d3836 #25443b #305645 #39674d #4a7a56 #60905e #7da572 #a1bb83')},
  {id: 'cherry', name: 'WILD CHERRY', n: 50, h: 46, flex: 0.95, colors: list('#263f36 #36593b #467042 #58864a #6d9a53 #88af63 #a4be72 #caca88')},
  {id: 'orange', name: 'ORANGE TREE', n: 40, h: 38, flex: 0.7, colors: list('#233f36 #2a5139 #386742 #447b49 #598a4c #739d53 #8eaf62 #b1c67a')},
  {id: 'maple', name: 'RED MAPLE', n: 56, h: 53, flex: 0.9, colors: list('#293c39 #38583c #477542 #5c914e #77a259 #89b361 #a2c174 #cfce85')},
  {id: 'birch', name: 'SILVER BIRCH', n: 42, h: 64, flex: 1.12, colors: list('#2b4439 #406342 #527b46 #699651 #87ac5a #a0bf6a #bad17a #dcea9a')},
  {id: 'willow', name: 'WEEPING WILLOW', n: 64, h: 49, flex: 1.52, colors: list('#263e3a #415840 #506d43 #66824b #829553 #9ea962 #b7ba68 #d3ce82')},
  {id: 'spruce', name: 'BLUE SPRUCE', n: 51, h: 65, flex: 0.58, colors: list('#243d46 #35505a #40636b #547b7b #60908c #78a49e #94b7a9 #b4d0c0')},
];
const TYPE = Object.fromEntries(SPECIES.map((s, i) => [s.id, i]));
const WOOD = list('#413731 #584235 #70533b #876342 #a27e55');
const BIRCH_WOOD = list('#635f5a #918a7e #c7c2ae #e6dfcc #f4ebdb');
const BLOSSOM = list('#684850 #845962 #a46972 #bd8384 #d99b9b #ebb3ab #f6cdbd #ffe1ca');
const SPRING_LEAF = list('#2f4c39 #42643e #588444 #729c4c #8bb357 #a9c96b #c5d97d #e0e49a');
const FALL_LEAF = list('#553b32 #734a33 #94572f #ac6732 #c68339 #dca04b #e8b963 #f6d083');
const FALL_MAPLE = list('#502d37 #74383a #943d39 #ae4c35 #ca5637 #df6c42 #eb8951 #f4ae70');
const FALL_BIRCH = list('#534a31 #77633a #948047 #b0964d #c6ac59 #ddc56c #ebd981 #f5e6a2');
const SNOW = list('#859fae #a8bec7 #ccdce0 #e3edef #f4f5eb');
const FRUIT = list('#b66532 #dc8439 #f0a34a #ffd47d');
const conifer = type => type === TYPE.pine || type === TYPE.spruce;
const evergreen = type => conifer(type) || type === TYPE.orange;
const woodPalette = type => type === TYPE.birch ? BIRCH_WOOD : WOOD;
function foliagePalette(type, season) {
  if (season === 'winter') return evergreen(type) ? SPECIES[type].colors.slice(2, 5).concat(SNOW) : woodPalette(type).concat(SNOW.slice(2));
  if (season === 'spring' && type === TYPE.cherry) return BLOSSOM;
  if (season === 'spring' && !evergreen(type)) return SPRING_LEAF;
  if (season === 'autumn' && !evergreen(type)) return type === TYPE.maple || type === TYPE.cherry ? FALL_MAPLE : type >= TYPE.birch ? FALL_BIRCH : FALL_LEAF;
  return SPECIES[type].colors;
}

/* Grow one tree into a voxel grid of colour indices (0 = empty). `S` is
 * game voxels per Canopy voxel: every length in the recipe is scaled by it,
 * while the leaf and bark noise stays at the size of a pixel, so a big tree
 * gets finer foliage rather than bigger blocks. */
function grow(type, variant, season, S) {
  const s = SPECIES[type], n = Math.round(s.n * S), h = Math.round(s.h * S), center = n / 2;
  const rnd = rng(8371 + type * 389 + variant * 997);
  const foliage = foliagePalette(type, season), wood = woodPalette(type);
  // Palette: foliage first, then wood, snow, fruit. Stored as index + 1.
  const palette = [...foliage, ...wood, ...SNOW, ...FRUIT];
  const WOOD_AT = foliage.length, SNOW_AT = WOOD_AT + wood.length, FRUIT_AT = SNOW_AT + SNOW.length;
  const area = n * n, vox = new Uint8Array(area * h);
  const bare = season === 'winter' && !evergreen(type);
  function branch(x1, y1, z1, x2, y2, z2, r1, r2) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1, z2 - z1) * 1.8));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, z = Math.round(z1 + (z2 - z1) * t), r = Math.max(0.71, r1 + (r2 - r1) * t);
      if (z < 0 || z >= h) continue;
      for (let iy = Math.floor(center + y - r); iy <= center + y + r; iy++) for (let ix = Math.floor(center + x - r); ix <= center + x + r; ix++) {
        const dx = ix + 0.5 - center - x, dy = iy + 0.5 - center - y;
        if (dx * dx + dy * dy <= r * r && ix >= 0 && ix < n && iy >= 0 && iy < n) {
          const bark = hash(ix, iy, Math.floor(z / 4));
          const shade = clamp(Math.floor(2.4 - dx / r - dy / r * 0.5 + bark), 0, 4);
          vox[z * area + iy * n + ix] = 1 + WOOD_AT + (type === TYPE.birch && bark < 0.19 ? 0 : shade);
        }
      }
    }
  }
  const trunkH = h * (conifer(type) ? 0.91 : type === TYPE.birch ? 0.89 : 0.69);
  branch(0, 0, 0, -S, S, trunkH, (type === TYPE.oak || type === TYPE.willow ? 3.5 : type === TYPE.birch ? 2.1 : 2.7) * S, S);
  for (let a = 0; a < 5; a++) { const angle = a * TAU / 5 + rnd(); branch(Math.cos(angle) * 4 * S, Math.sin(angle) * 4 * S, 0, 0, 0, 5 * S, 1.4 * S, 2 * S); }
  const clusters = [];
  function cluster(x, y, z, rx, ry, rz, cone = false) {
    rnd();
    const bias = rnd() * 0.75;
    if (!bare) clusters.push({x, y, z, rx, ry, rz, cone, bias});
  }
  if (conifer(type)) {
    // Layered radial whorls leave little gaps between drooping branches.
    const spruce = type === TYPE.spruce, tiers = spruce ? 9 : 7;
    for (let j = 0; j < tiers; j++) {
      const z = (spruce ? 9 + j * 5.6 : 13 + j * 6.6) * S, radius = (spruce ? 19 - j * 1.86 : 17 - j * 1.95) * S, phase = rnd() * TAU;
      cluster(0, 0, z + 4 * S, radius * 0.86, radius * 0.86, Math.min(12 * S, h - z - 5 * S), true);
      for (let k = 0; k < 7; k++) {
        const a = phase + k * TAU / 7, r = radius * (0.47 + rnd() * 0.14);
        cluster(Math.cos(a) * r, Math.sin(a) * r, z + S, radius * 0.5, radius * 0.49, (6.1 - j * 0.4) * S, true);
      }
    }
    cluster(0, 0, h - 6 * S, 3.9 * S, 3.9 * S, 6 * S, true);
  } else {
    const spread = n * (type === TYPE.birch ? 0.23 : 0.27), trunkLevels = type === TYPE.birch ? 12 : 9, willow = type === TYPE.willow;
    for (let k = 0; k < trunkLevels; k++) {
      const angle = k * 2.399 + rnd() * 0.28, r = spread * (0.51 + rnd() * 0.30);
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
      const z = h * (type === TYPE.birch ? 0.39 + k * 0.041 : willow ? 0.62 + rnd() * 0.13 : 0.55 + rnd() * 0.22);
      const jointZ = z - h * (willow ? 0.07 : 0.19);
      branch(0, 0, z - h * 0.34, x * 0.51, y * 0.51, jointZ, (type === TYPE.birch ? 1.3 : 2.1) * S, 1.1 * S);
      branch(x * 0.51, y * 0.51, jointZ, x, y, z, 1.25 * S, 0.8 * S);
      const crown = spread * (0.56 + rnd() * 0.20);
      cluster(x, y, z, crown, crown * 0.93, h * (type === TYPE.birch ? 0.14 : 0.19));
      for (let j = 0; j < 4; j++) {
        const a = angle + (j - 1.5) * 0.66 + rnd() * 0.3, reach = spread * (0.29 + rnd() * 0.43);
        const tx = x + Math.cos(a) * reach, ty = y + Math.sin(a) * reach;
        const tz = willow ? z - h * (0.23 + rnd() * 0.34) : Math.min(h - 2, z + h * (0.05 + rnd() * 0.23));
        // In leaf the limbs stop inside the crown; bare, they reach out to twigs.
        const end = bare ? 1 : 0.72;
        branch(x, y, z, x + (tx - x) * end, y + (ty - y) * end, z + (tz - z) * end, 0.85 * S, 0.62 * S);
        for (let twig = 0; twig < 2; twig++) {
          const ex = tx + Math.cos(a + twig * 1.35) * 3 * S, ey = ty + Math.sin(a + twig * 1.35) * 3 * S;
          if (bare) branch(tx, ty, tz, ex, ey, clamp(tz + (willow ? -4 : 5) * S - twig * S, 1, h - 1), 0.68 * S, 0.58 * S);
        }
        if (willow) {
          cluster(tx, ty, z - h * 0.15, crown * 0.54, crown * 0.54, h * 0.22);
          cluster(tx, ty, tz + h * 0.08, crown * 0.31, crown * 0.34, h * 0.16);
        } else {
          cluster(x + (tx - x) * 0.64, y + (ty - y) * 0.64, z + (tz - z) * 0.47, crown * 0.71, crown * 0.67, h * 0.125);
        }
      }
    }
    cluster(-1, 0, h * 0.76, spread * 0.80, spread * 0.76, h * 0.225);
    if (!willow) for (let j = 0; j < 5; j++) {
      const a = j * TAU / 5 + rnd() * 0.3;
      cluster(Math.cos(a) * spread * 0.49, Math.sin(a) * spread * 0.49, h * 0.81, spread * 0.55, spread * 0.5, h * 0.15);
    }
  }
  // Overlapping clusters: each voxel takes the cluster it is deepest inside,
  // which keeps one continuous canopy. Only the rows that can reach the
  // surface are visited (relief above -0.14, the most the noise can lift).
  const best = new Float32Array(area * h), clump = Math.max(2, Math.round(2 * S));
  for (const l of clusters) {
    const z0 = Math.max(0, Math.floor(l.z - l.rz)), z1 = Math.min(h, Math.ceil(l.z + l.rz + 1));
    for (let z = z0; z < z1; z++) {
      const dz = (z - l.z) / l.rz;
      // Largest horizontal radius (in units of rx, ry) at which relief can still beat -0.14.
      const reach = l.cone ? 1.14 - (dz + 0.62) * 0.63 - Math.max(0, -0.51 - dz) * 3.7 : Math.sqrt(Math.max(0, 1.14 - dz * dz));
      if (reach <= 0) continue;
      const y0 = Math.max(0, Math.floor(center + l.y - l.ry * reach - 1)), y1 = Math.min(n, Math.ceil(center + l.y + l.ry * reach + 1));
      for (let y = y0; y < y1; y++) {
        const dy = (y + 0.5 - center - l.y) / l.ry;
        if (dy * dy >= reach * reach) continue;
        const span = Math.sqrt(reach * reach - dy * dy) * l.rx;
        const x0 = Math.max(0, Math.floor(center + l.x - span - 1)), x1 = Math.min(n, Math.ceil(center + l.x + span + 1));
        for (let x = x0; x < x1; x++) {
          const dx = (x + 0.5 - center - l.x) / l.rx;
          const relief = l.cone ? 1 - Math.hypot(dx, dy) - (dz + 0.62) * 0.63 - Math.max(0, -0.51 - dz) * 3.7 : 1 - dx * dx - dy * dy - dz * dz;
          if (relief <= -0.14) continue;
          const mott = hash(Math.floor(x / clump), Math.floor(y / clump), Math.floor(z / clump) + variant * 73);
          const mid = hash(x >> 1, y >> 1, (z >> 1) + 11), fine = hash(x, y, z);
          const edge = relief + (mott - 0.5) * 0.16 + (mid - 0.5) * 0.06 + (fine - 0.5) * 0.08;
          const vi = z * area + y * n + x;
          if (edge <= best[vi]) continue;
          best[vi] = edge;
          const light = 3.3 - 1.6 * dx - 1.2 * dy + 1.7 * dz + (z / h - 0.6) * 2.5 + (mott - 0.5) * 1.6 + (mid - 0.5) * 0.7 + (fine - 0.5) * 1.25 + l.bias;
          vox[vi] = 1 + clamp(Math.floor(light), 0, foliage.length - 1);
        }
      }
    }
  }
  if (type === TYPE.orange && (season === 'summer' || season === 'autumn')) {
    // Oranges hang just inside the outer leaves.
    const count = Math.round(48 * S), r = Math.max(1, Math.round(0.75 * S));
    for (let k = 0; k < count; k++) {
      const a = rnd() * TAU, z = Math.floor(h * (0.48 + rnd() * 0.38));
      for (let d = n / 2; d > 2; d -= 0.45) {
        const x = Math.floor(center + Math.cos(a) * d), y = Math.floor(center + Math.sin(a) * d);
        if (x < r || y < r || x >= n - r || y >= n - r || !vox[z * area + y * n + x]) continue;
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) for (let dz = -r; dz <= r; dz++) {
          if (i * i + j * j + dz * dz <= r * r + 1 && z + dz >= 0 && z + dz < h) vox[(z + dz) * area + (y + j) * n + x + i] = 1 + FRUIT_AT + clamp(1 + Math.sign(dz) - (i > 0 ? 1 : 0), 0, 3);
        }
        break;
      }
    }
  }
  if (season === 'winter') {
    // Snow sticks to upward-facing surfaces and collects on tier edges.
    const patchSize = Math.max(3, Math.round(3 * S));
    for (let i = 0; i < area; i++) {
      const x = i % n, y = (i - x) / n;
      for (let z = h - 1; z > 1; z--) {
        const at = z * area + i;
        if (!vox[at] || (z + 1 < h && vox[at + area])) continue;
        const patch = hash(Math.floor(x / patchSize), Math.floor(y / patchSize), Math.floor(z / patchSize)), detail = hash(x, y, z);
        if (!bare && z > h * 0.25 && patch > 0.21) {
          vox[at] = 1 + SNOW_AT + clamp(Math.floor(2 + 2 * detail + (z / h - 0.5) * 2), 0, 4);
          if (patch > 0.58 && vox[at - area]) vox[at - area] = 1 + SNOW_AT + Math.floor(detail * 3);
        } else if (bare && z > 7 * S && patch > 0.8) vox[at] = 1 + SNOW_AT + Math.floor(detail * 3);
      }
    }
  }
  return {n, h, vox, palette, trunk: (type === TYPE.oak || type === TYPE.willow ? 3.5 : type === TYPE.birch ? 2.1 : 2.7) * S};
}

/* Project a grown tree the way voxel.js projects every slice stack (one
 * pixel across per voxel, SQUASH down per voxel of depth, one up per voxel of
 * height): each voxel shows on the 1.75 rows from its top face down its
 * front, the nearer and higher ones on top. Then the same selective outline. */
const INK = [24, 32, 46];
function project(tree) {
  const {n, h, vox, palette} = tree, area = n * n, cx = Math.floor(n / 2), cy = Math.floor(n / 2);
  const width = n + 4, originX = cx + 2;
  const originY = Math.ceil(cy * SQUASH) + h + 3, height = originY + Math.ceil((n - cy) * SQUASH) + 4;
  const color = new Uint8Array(width * height);
  for (let z = 0; z < h; z++) for (let y = 0; y < n; y++) {
    const top = SQUASH * (y - cy) - z + originY;
    const row0 = Math.ceil(top - 0.5), row1 = Math.ceil(top + 1.25) - 1;
    const base = z * area + y * n;
    for (let x = 0; x < n; x++) {
      const id = vox[base + x];
      if (!id) continue;
      const column = x - cx + originX;
      for (let row = row0; row <= row1; row++) color[row * width + column] = id;
    }
  }
  // Ramp level 0 of each colour: the darkest tone, which the outline mixes in.
  const L = Voxel.lighting, gain = 1 + (0.56 - 1) * L.contrast, cool = 3 * L.coolAmount;
  const dark = palette.map(c => c.map((v, k) => { const g = v * gain; return g + (L.cool[k] - g) * cool; }));
  const rgba = new Uint8ClampedArray(width * height * 4);
  let left = width, right = -1, topRow = height, bottom = -1;
  for (let py = 1; py < height - 1; py++) for (let px = 1; px < width - 1; px++) {
    const at = py * width + px, out = at * 4, id = color[at];
    if (id) {
      const c = palette[id - 1];
      rgba[out] = c[0]; rgba[out + 1] = c[1]; rgba[out + 2] = c[2];
    } else {
      const near = color[at + width] || color[at + 1] || color[at - 1] || color[at - width];
      if (!near) continue;
      const d = dark[near - 1];
      rgba[out] = INK[0] * 0.62 + d[0] * 0.38; rgba[out + 1] = INK[1] * 0.62 + d[1] * 0.38; rgba[out + 2] = INK[2] * 0.62 + d[2] * 0.38;
    }
    rgba[out + 3] = 255;
    if (px < left) left = px; if (px > right) right = px;
    if (py < topRow) topRow = py; if (py > bottom) bottom = py;
  }
  const w = right - left + 1, hh = bottom - topRow + 1, pixels = new Uint8ClampedArray(w * hh * 4);
  for (let row = 0; row < hh; row++) pixels.set(rgba.subarray(((topRow + row) * width + left) * 4, ((topRow + row) * width + right + 1) * 4), row * w * 4);
  return {pixels, w, h: hh, dx: left - originX, dy: topRow - originY};
}

/* Ground shadow: every voxel dropped along the light, as voxel.js does. */
function castShadow(tree) {
  const {n, h, vox} = tree, area = n * n, cx = Math.floor(n / 2), cy = Math.floor(n / 2);
  const SX = Voxel.SHADOW_X, SY = Voxel.SHADOW_Y, L = Voxel.lighting;
  const radius = cx + 2, reachX = Math.ceil(h * Math.abs(SX)) + 2, reachY = Math.ceil(h * Math.abs(SY)) + 2;
  const originX = radius + (SX < 0 ? reachX : 0);
  const originY = Math.ceil(radius * SQUASH) + 1 + (SY < 0 ? reachY : 0);
  const width = radius * 2 + reachX, height = Math.ceil(radius * 2 * SQUASH) + reachY + 2;
  const alpha = new Uint8Array(width * height);
  for (let z = 0; z < h; z++) {
    const strength = z < 3 ? L.shadowAlpha[0] : L.shadowAlpha[1], ox = Math.round(z * SX), oy = Math.round(z * SY);
    for (let y = 0; y < n; y++) {
      const py = Math.round((y - cy) * SQUASH) + oy + originY, base = z * area + y * n;
      if (py < 0 || py >= height) continue;
      for (let x = 0; x < n; x++) {
        if (!vox[base + x]) continue;
        const at = py * width + x - cx + ox + originX;
        if (alpha[at] < strength) alpha[at] = strength;
      }
    }
  }
  let left = width, right = -1, top = height, bottom = -1;
  for (let at = 0; at < alpha.length; at++) if (alpha[at]) {
    const px = at % width, py = (at - px) / width;
    if (px < left) left = px; if (px > right) right = px;
    if (py < top) top = py; if (py > bottom) bottom = py;
  }
  if (right < 0) return null;
  const sw = right - left + 1, sh = bottom - top + 1, canvas = Voxel.canvas(sw, sh), context = canvas.getContext('2d');
  const image = context.createImageData(sw, sh), [r, g, b] = L.shadowRgb;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const value = alpha[(top + y) * width + left + x], out = (y * sw + x) * 4;
    image.data[out] = r; image.data[out + 1] = g; image.data[out + 2] = b; image.data[out + 3] = value;
  }
  context.putImageData(image, 0, 0);
  return {canvas, dx: left - originX, dy: top - originY, w: sw, h: sh};
}

/* ---------- Kinds, caches and the season ---------- */
let season = 'summer';
const kinds = {};
for (const s of SPECIES) VARIANT_SIZES.forEach((size, variant) => {
  const S = SCALE * size, trunk = (s.id === 'oak' || s.id === 'willow' ? 3.5 : s.id === 'birch' ? 2.1 : 2.7) * S;
  const id = s.id + variant;
  // Collision footprint: the trunk, as half extents on the ground.
  kinds[id] = {id, species: s.id, type: TYPE[s.id], variant, size, S, flex: s.flex, conifer: conifer(TYPE[s.id]), evergreen: evergreen(TYPE[s.id]),
    height: Math.round(s.h * S), crown: Math.round(s.n * S * 0.62), halfWidth: Math.max(4, Math.round(trunk * 0.85)), halfHeight: Math.max(3, Math.round(trunk * 0.65))};
});
const KINDS = Object.keys(kinds);
function isTree(kind) { return Object.prototype.hasOwnProperty.call(kinds, kind); }
function info(kind) { return kinds[kind]; }
// Per season, then kind: looked up for every tree on screen every frame, with no new string.
const built = new Map();
// A lost canvas context (voxel.js): every tree paints again when next drawn.
Voxel.onRastersLost(() => built.clear());
function entry(kind) {
  let bySeason = built.get(season);
  if (!bySeason) built.set(season, bySeason = new Map());
  let e = bySeason.get(kind);
  if (!e) {
    const k = kinds[kind], tree = grow(k.type, k.variant, season, k.S);
    const base = project(tree);
    e = {base, levels: new Map(), shadow: castShadow(tree), light: Voxel.lighting, tree: null};
    // The voxels are only kept until the light changes once; most sessions never need them again.
    e.tree = tree;
    bySeason.set(kind, e);
  }
  if (e.light !== Voxel.lighting) {
    // A new time of day: outlines and shadows bake again from the kept voxels.
    const k = kinds[kind], tree = e.tree || grow(k.type, k.variant, season, k.S);
    e.base = project(tree); e.shadow = castShadow(tree); e.levels.clear(); e.light = Voxel.lighting; e.tree = tree;
  }
  return e;
}
/* Bake now, with the bends an everyday breeze needs (call it per kind while
 * a level loads, so trees cost next to nothing during play). */
function prepare(kind) {
  const e = entry(kind);
  for (let level = -2; level <= 5; level++) sprite(kind, level, true);
  e.tree = null;
  return e;
}
/* Bends beyond those are made as gusts ask for them, a few a frame; past
 * that a tree takes the nearest bend it already has. */
const BENDS_PER_FRAME = 6;
let bendBudget = BENDS_PER_FRAME;
function frame() { bendBudget = BENDS_PER_FRAME; }
/* A bend level: the top of the crown leans `level` pixels, rows below it
 * by the square of their height up the tree, the foot not at all. */
function sprite(kind, level = 0, force = false) {
  const e = entry(kind);
  let handle = e.levels.get(level);
  if (handle) return handle;
  if (!force && e.levels.size && bendBudget <= 0) {
    let best = null, gap = Infinity;
    for (const [have, made] of e.levels) if (Math.abs(have - level) < gap) { gap = Math.abs(have - level); best = made; }
    return best;
  }
  bendBudget--;
  const {pixels, w, h, dx, dy} = e.base, rise = -dy, k = kinds[kind];
  const pad = Math.abs(level), width = w + pad, out = new Uint8ClampedArray(width * h * 4);
  const start = level < 0 ? pad : 0;
  for (let row = 0; row < h; row++) {
    const up = clamp((-dy - row) / Math.max(1, Math.min(rise, k.height)), 0, 1);
    const shift = Math.round(level * up * up);
    out.set(pixels.subarray(row * w * 4, (row + 1) * w * 4), (row * width + start + shift) * 4);
  }
  const canvas = Voxel.canvas(width, h), context = canvas.getContext('2d');
  const image = context.createImageData(width, h);
  image.data.set(out);
  context.putImageData(image, 0, 0);
  handle = {canvas, dx: dx - start, dy, w: width, h};
  e.levels.set(level, handle);
  return handle;
}
function shadow(kind) { return entry(kind).shadow; }
/* Where a kind's picture can be over every bend it can take, one alpha mask
 * per bend level, each placed as that bend's sprite would be (see sprite).
 * For the hidden-scenery test (occlusion.js); nothing is baked. */
function bendMasks(kind) {
  const e = entry(kind), {pixels, w, h, dx, dy} = e.base, rise = -dy, k = kinds[kind];
  const [lo, hi] = leanRange(kind), masks = [];
  for (let level = Math.min(lo, -2); level <= Math.max(hi, 5); level++) {
    const pad = Math.abs(level), width = w + pad, start = level < 0 ? pad : 0, alpha = new Uint8Array(width * h);
    for (let row = 0; row < h; row++) {
      const up = clamp((-dy - row) / Math.max(1, Math.min(rise, k.height)), 0, 1), offset = row * width + start + Math.round(level * up * up);
      for (let x = 0; x < w; x++) if (pixels[(row * w + x) * 4 + 3]) alpha[offset + x] = 1;
    }
    masks.push({dx: dx - start, dy, w: width, h, alpha});
  }
  return masks;
}
/* Lean range in pixels at the top of the crown. */
function leanRange(kind) {
  const k = kinds[kind], reach = k.height * k.flex;
  return [-Math.round(reach * 0.05) - 1, Math.round(reach * 0.13) + 1];
}
function setSeason(next) {
  if (!SEASONS.includes(next)) next = 'summer';
  if (next === season) return false;
  season = next;
  return true;
}
/* Drop every baked tree (a new season keeps the old ones only until memory is wanted). */
function clear() { built.clear(); }

export {SCALE, SPECIES, SEASONS, SEASON_NAMES, KINDS, kinds, isTree, info, grow, project, prepare, frame, sprite, shadow, leanRange, setSeason, clear, bendMasks};
/* The season trees grow in now ('spring', 'summer', 'autumn' or 'winter'). */
export function getSeason() { return season; }
