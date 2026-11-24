/* Crystal Rover's models, all built in code. Front is +y in each builder. */
import {Model} from '../../src/index.js';

/* The rover: 20 across, 28 long, 15 high. Six wheels, a cabin with glass, a
 * mast with a glowing tip and glowing headlamps at the front. */
export function rover() {
  const b = Model.builder(20, 28, 15, [
    [236, 196, 72],                         // 1 body (yellow)
    [40, 42, 50],                           // 2 tyres
    [140, 146, 156],                        // 3 hubs and frame
    {rgb: [70, 110, 140], kind: 'glass'},   // 4 cabin glass
    {rgb: [255, 246, 200], kind: 'glow'},   // 5 headlamps
    {rgb: [255, 90, 80], kind: 'glow'},     // 6 mast light
    {rgb: [210, 168, 50], kind: 'gloss'},   // 7 body top (glints)
  ]);
  for (const y of [5, 13, 21]) {            // three axles, wheels both sides
    b.wheel(0, y, 3, 3, 3, 2, 'x'); b.wheel(17, y, 3, 3, 3, 2, 'x');
    b.box(1, y, 3, 1, y, 3, 3); b.box(18, y, 3, 18, y, 3, 3);
  }
  b.box(3, 1, 3, 16, 26, 4, 3);             // frame
  b.box(3, 2, 5, 16, 25, 7, 1);             // body
  b.box(4, 3, 8, 15, 24, 8, 7);             // top deck
  b.box(5, 14, 9, 14, 22, 12, 4);           // cabin
  b.box(6, 15, 13, 13, 21, 13, 1);          // cabin roof
  b.box(5, 26, 5, 7, 26, 6, 5); b.box(12, 26, 5, 14, 26, 6, 5); // headlamps
  b.box(7, 5, 9, 7, 5, 13, 3); b.box(7, 5, 14, 7, 5, 14, 6);     // mast and its light
  return b;
}

/* A crystal: a pointed column, glowing. recolored() gives the other colours. */
export function crystal() {
  const b = Model.builder(9, 9, 18, [{rgb: [110, 236, 255], kind: 'glow'}, {rgb: [200, 250, 255], kind: 'glow'}, [120, 110, 120]]);
  b.cylinder(4, 4, 0, 1, 3.2, 3);           // a stone foot
  for (let z = 2; z < 18; z++) {
    const r = z < 7 ? 1.4 + (z - 2) * 0.55 : Math.max(0.4, 4.2 - (z - 7) * 0.38);
    b.cylinder(4, 4, z, z, r, (x, y) => (x + y + z) % 5 === 0 ? 2 : 1);
  }
  return b;
}

/* A boulder: overlapping blobs, speckled with a seeded hash. */
export function rock(seed, size = 1) {
  const rand = Model.random(seed), n = Math.round(22 * size), h = Math.round(14 * size);
  const b = Model.builder(n, n, h, [[128, 126, 120], [104, 102, 98], [152, 150, 142], [96, 128, 84]]);
  const shade = (x, y, z) => z === 0 ? 2 : Model.hash(x, y, z + seed) < 0.18 ? 3 : Model.hash(x + 9, y, z) < 0.1 ? 2 : 1;
  b.blob(n / 2, n / 2, 0, n * 0.42, n * 0.36, h * 0.9, shade);
  for (let i = 0; i < 3; i++) b.blob(n * (0.3 + rand() * 0.4), n * (0.3 + rand() * 0.4), h * 0.3, n * (0.18 + rand() * 0.1), n * (0.18 + rand() * 0.1), h * 0.55, shade);
  // Moss on top.
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = h - 1; z >= 0; z--) {
    if (b.get(x, y, z)) { if (Model.hash(x, y, seed) < 0.35) b.set(x, y, z, 4); break; }
  }
  return b;
}

/* A crate that can be pushed about. */
export function crate() {
  const b = Model.builder(14, 14, 13, [[186, 140, 84], [128, 90, 52]]);
  b.box(0, 0, 0, 13, 13, 12, (x, y, z) => (x % 13 === 0) + (y % 13 === 0) + (z % 12 === 0) >= 2 || z % 4 === 0 || x === y ? 2 : 1);
  return b;
}
