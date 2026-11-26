import {Model} from '../../../src/index.js';

export function regattaBuoy() {
  const model = Model.builder(15, 15, 16, [[134, 52, 32], [237, 103, 39], [255, 157, 62], [244, 220, 172]]);
  for (let z = 0; z < 15; z++) {
    const radius = 6.6 - z * .36;
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      const distance = Math.hypot(x - 7, y - 7);
      if (distance <= radius) model.set(x, y, z, z < 2 ? 1 : z === 6 || z === 7 ? 4 : distance < radius - 1 ? 3 : 2);
    }
  }
  model.set(7, 7, 15, 4);
  return model;
}
