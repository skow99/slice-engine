/* Three ways to make a model. Each function returns a builder ({model, palette, ...}). */
import {Model} from '../../src/index.js';

/* 1. In code: shapes and pattern functions. */
export function barrel() {
  const b = Model.builder(16, 16, 20, [[150, 98, 58], [112, 70, 42], [92, 96, 104], [196, 200, 206]]);
  for (let z = 0; z < 20; z++) {
    const bulge = 6.2 + Math.sin(z / 19 * Math.PI) * 1.4;           // wider in the middle
    const band = z === 2 || z === 3 || z === 16 || z === 17;        // iron hoops
    b.cylinder(7.5, 7.5, z, z, bulge, (x, y) => band ? (Model.hash(x, y, z) < 0.15 ? 4 : 3) : (Math.atan2(y - 7.5, x - 7.5) * 4 / Math.PI + 8) % 2 < 1 ? 1 : 2);
  }
  b.cylinder(7.5, 7.5, 19, 19, 5.2, 2);                             // darker lid
  return b;
}

/* 2. ASCII layers: a top view per slice, front pointing UP, bottom slice
 *    first. A number repeats the slice before it. */
export function rocket() {
  const hull = `
    ...www...
    ..wwwww..
    .wwwwwww.
    .wwwwwww.
    .wwwwwww.
    ..wwwww..
    ...www...`;
  return Model.fromLayers([
    `
    r.......r
    .........
    .........
    .........
    .........
    .........
    r.......r`,  // fin tips
    `
    rr.....rr
    rrwwwwwrr
    .wwwwwww.
    .wwwwwww.
    .wwwwwww.
    rrwwwwwrr
    rr.....rr`, 1,
    hull, 3,
    `
    ...www...
    ..wwwww..
    .wwbbbww.
    .wwbgbww.
    .wwbbbww.
    ..wwwww..
    ...www...`, 2,       // window band
    hull, 2,
    `
    .........
    ...rrr...
    ..rrrrr..
    ..rrrrr..
    ..rrrrr..
    ...rrr...
    .........`, 1,
    `
    .........
    .........
    ...rrr...
    ...rrr...
    ...rrr...
    .........
    .........`,
    `
    .........
    .........
    .........
    ....r....
    .........
    .........
    .........`,
  ], {
    w: [232, 234, 228],
    r: [214, 64, 56],
    b: {rgb: [60, 80, 110], kind: 'glass'},
    g: {rgb: [140, 220, 255], kind: 'glow'},
  });
}

/* 3. A slice sheet drawn by an artist (or exported from code with
 *    tools/model-to-sheet.js): see main.js, which loads barrel-slices.png. */
