import {Model} from '../../../src/index.js';

export function shoreBuilding(width, depth, storeys, timber) {
  const inset = 4;
  const eaves = storeys * 3;
  const roofRise = Math.round((width - 1) * 0.24);
  const b = Model.builder(width, depth, eaves + roofRise + 10, [
    timber ? [146, 109, 73] : [232, 215, 179], timber ? [111, 78, 55] : [210, 188, 153],
    [119, 105, 87], [75, 51, 40], [74, 117, 122], [175, 192, 171],
    timber ? [152, 91, 61] : [183, 92, 63], [156, 72, 52], [127, 59, 45], [209, 117, 78],
    [247, 227, 183], [100, 81, 67],
  ]);
  const wallRight = width - inset - 1;
  const wallBack = depth - inset - 1;
  const center = Math.floor(width / 2);
  const plinth = (x, y, z) => (Math.floor((x + y + 3 * (z > 2)) / 7) + z) % 7 === 0 ? 12 : 3;
  b.box(inset, inset, 0, wallRight, wallBack, 4, plinth);
  for (let x = 1; x < width - 1; x++) {
    const roof = eaves + Math.round(Math.min(x, width - 1 - x) * roofRise / center);
    if (x >= inset && x <= wallRight) {
      b.box(x, inset, 5, x, wallBack, roof - 1, (_x, y, z) => timber && (z % 4 === 0 || (y + z * 5) % 29 === 0) ? 2 : 1);
    }
    b.box(x, 1, roof, x, depth - 2, roof + 1, (_x, y, z) => {
      if (z === roof || y <= 2 || y >= depth - 3) return 9;
      const course = Math.min(x, width - 1 - x);
      const tile = Math.floor((y + (course % 2) * 3) / 6);
      return y % 6 === (course % 2) * 3 ? 8 : (tile + course * 7) % 11 < 3 ? 10 : 7;
    });
  }
  const door = timber ? 22 : 10;
  const windowOffset = timber ? 25 : 15;
  b.box(center - door / 2 - 1, inset - 1, 5, center + door / 2 + 1, inset - 1, 22, 11);
  b.box(center - door / 2, inset - 2, 5, center + door / 2, inset - 2, 21, x => x % 3 === 0 ? 2 : 4);
  for (const x of [center - windowOffset, center + windowOffset]) {
    b.box(x - 4, inset - 1, 13, x + 4, inset - 1, 24, 11);
    b.box(x - 3, inset - 2, 15, x + 3, inset - 2, 22, (column, _y, z) => column === x || z === 19 ? 6 : 5);
    b.box(x - 5, inset - 3, 12, x + 5, inset - 2, 13, 3);
  }
  for (const x of [inset - 1, wallRight + 1]) for (const y of [19, Math.floor(depth / 2), depth - 21]) {
    b.box(x, y - 5, 13, x, y + 5, 24, (_x, dy, z) => z === 13 || z === 24 || dy === y ? 11 : 5);
    b.box(x, y - 6, 12, x, y + 6, 13, 3);
  }
  const chimney = center + Math.floor(width / 9);
  b.box(chimney - 3, 23, eaves, chimney + 3, 29, eaves + roofRise + 5, (x, y, z) => (x + y + z) % 5 === 0 ? 8 : 12);
  b.box(chimney - 4, 22, eaves + roofRise + 5, chimney + 4, 30, eaves + roofRise + 6, 3);
  return b;
}

export const cottage = () => shoreBuilding(63, 87, 10, false);
export const boathouse = () => shoreBuilding(108, 93, 13, true);
