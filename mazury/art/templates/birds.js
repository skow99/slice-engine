import {Model} from '../../../src/index.js';

function oval(model, cx, cy, cz, rx, ry, rz, material) {
  for (let z = Math.max(0, Math.ceil(cz - rz)); z <= cz + rz; z++) {
    for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.ceil(cx - rx); x <= cx + rx; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 > 1) continue;
        model.set(x, y, z, typeof material === 'function' ? material(x, y, z) : material);
      }
    }
  }
}

export function swan() {
  const bird = Model.builder(17, 31, 18, [
    [221, 222, 210], [165, 183, 186], [251, 243, 218], [43, 48, 50], [229, 118, 37],
  ]);
  oval(bird, 8, 12, 2.4, 7, 10.2, 4, (x, y, z) => z < 1 ? 2 : y > 10 ? 1 : 3);
  oval(bird, 8, 3, 3, 2.2, 2.8, 1.9, 1);
  for (const x of [4, 12]) {
    oval(bird, x, 12, 4, 2.5, 7.1, 2.8, (px, y, z) => (y + px) % 5 === 0 && z < 5 ? 2 : 3);
  }
  const neck = [19, 21, 22, 23, 24, 24, 24, 23, 23, 24, 25, 26];
  for (const [i, y] of neck.entries()) {
    oval(bird, 8, y, 4 + i, i < 3 ? 2.6 : 1.7, 2.1, 1.2, (x) => x < 8 ? 3 : 1);
  }
  oval(bird, 8, 26, 15, 2.5, 3.1, 2.3, (x, y) => y > 26 || x < 8 ? 3 : 1);
  bird.set(6, 27, 15, 4);
  bird.set(10, 27, 15, 4);
  bird.box(7, 28, 14, 9, 29, 15, 4);
  bird.box(7, 29, 13, 9, 30, 14, 5);
  return bird;
}

// The flying wing panels are recorded to either side of the body. The game
// folds them around the shoulders to make raised and lowered wing poses.
function wings(bird, cx, length, root, color) {
  for (let distance = root; distance <= length; distance++) {
    const t = (distance - root) / (length - root);
    const front = Math.round(10 - 6 * t ** 1.6);
    const back = Math.round(4 - 3 * t);
    const z = Math.round(4 - t * 2);
    for (const side of [-1, 1]) for (let y = back; y <= front; y++) {
      bird.set(cx + side * distance, y, z, color(t, y, front));
      if (t < 0.52 && y > back && y < front) bird.set(cx + side * distance, y, z + 1, color(t, y, front));
    }
  }
}

export function mallard() {
  const bird = Model.builder(35, 21, 11, [
    [130, 139, 127], [98, 69, 53], [34, 84, 68], [230, 224, 191],
    [193, 158, 55], [41, 51, 58], [63, 79, 139], [91, 101, 99],
  ]);
  oval(bird, 17, 10, 2, 5, 7.2, 3.5, (x, y, z) => y > 11 ? 2 : z < 1 ? 8 : 1);
  oval(bird, 17, 3, 3, 2, 2.8, 1.4, 6);
  for (const x of [14, 20]) {
    oval(bird, x, 8, 3, 1.8, 4.8, 1.6, (px, y, z) => y === 7 ? 7 : z < 3 ? 8 : 1);
  }
  oval(bird, 17, 14.5, 4.8, 1.9, 2.2, 1.5, 4);
  oval(bird, 17, 15.2, 6.7, 2.5, 2.7, 2.7, 3);
  bird.set(15, 16, 7, 6);
  bird.set(19, 16, 7, 6);
  bird.box(16, 17, 5, 18, 19, 6, 5);
  wings(bird, 17, 17, 6, (t, y, front) => t > 0.73 ? 6 : front - y < 2 ? 8 : t < 0.5 && y <= 5 ? 7 : 1);
  return bird;
}

export function cormorant() {
  const bird = Model.builder(43, 29, 12, [
    [54, 68, 72], [32, 44, 50], [83, 89, 81], [136, 118, 71], [207, 194, 157],
  ]);
  oval(bird, 21, 12, 3.8, 4, 7.6, 3.2, (x, y, z) => z > 5 ? 3 : z < 3 ? 2 : 1);
  oval(bird, 21, 4, 3.1, 2.2, 3.9, 1.4, 2);
  for (let y = 17; y <= 24; y++) oval(bird, 21, y, 5 + (y - 17) * 0.28, 1.6, 1.8, 1.6, 1);
  oval(bird, 21, 24, 7.7, 2.1, 2.5, 2, (x, y, z) => y > 24 && z < 8 ? 4 : 2);
  bird.box(20, 26, 7, 22, 27, 8, 5);
  bird.set(21, 28, 7, 4);
  wings(bird, 21, 21, 5, (t, y, front) => front - y < 2 && t < 0.75 ? 3 : t > 0.61 || y < 4 ? 2 : 1);
  return bird;
}

export function crow() {
  const bird = Model.builder(37, 23, 14, [
    [116, 119, 120], [59, 65, 70], [37, 45, 53], [81, 89, 97], [147, 152, 150],
  ]);
  bird.box(16, 13, 0, 16, 15, 3, 3);
  bird.box(20, 13, 0, 20, 15, 3, 3);
  oval(bird, 18, 11, 5, 4.4, 5.8, 3.8, (x, y, z) => z >= 7 ? 5 : 1);
  oval(bird, 18, 4, 3.8, 2.6, 3.8, 1.4, 2);
  for (const x of [15, 21]) oval(bird, x, 10, 5, 1.8, 5.1, 2.6, (px, y) => y < 9 ? 3 : 2);
  oval(bird, 18, 15.5, 8, 2.8, 3.2, 3.4, 2);
  oval(bird, 18, 17.1, 10.6, 2.7, 3.1, 2.4, (x, y, z) => z > 11 ? 4 : 3);
  bird.box(17, 19, 9, 19, 21, 10, 3);
  bird.set(18, 22, 9, 3);
  bird.set(16, 18, 11, 5);
  bird.set(20, 18, 11, 5);
  wings(bird, 18, 18, 5, (t, y, front) => front - y < 2 && t < 0.72 ? 4 : t > 0.56 || y < 4 ? 3 : 2);
  return bird;
}

export function stork() {
  const bird = Model.builder(47, 39, 25, [
    [225, 223, 206], [177, 188, 188], [245, 241, 224],
    [43, 48, 51], [66, 70, 74], [181, 68, 43], [222, 106, 68],
  ]);
  for (const x of [21, 25]) {
    bird.box(x, 16, 1, x, 17, 12, 6);
    bird.box(x, 15, 0, x, 19, 0, 7);
  }
  oval(bird, 23, 17, 13, 4.2, 7, 3.6, (x, y, z) => z < 12 ? 2 : 1);
  oval(bird, 23, 10, 12, 2.8, 5.5, 1.5, 4);
  for (const x of [20, 26]) oval(bird, x, 15, 14, 1.7, 6, 2.2, (x, y) => y < 16 ? 4 : 5);
  for (let z = 14; z <= 21; z++) {
    oval(bird, 23, 21 + (z - 14) * .7, z, 1.7, 2, 1.5, x => x < 23 ? 3 : 1);
  }
  oval(bird, 23, 27, 21.5, 2.3, 3.2, 2.2, (x, y) => y >= 28 ? 3 : 1);
  for (const x of [21, 25]) bird.set(x, 28, 22, 4);
  for (let y = 29; y <= 37; y++) {
    bird.box(y < 33 ? 22 : 23, y, y < 35 ? 21 : 20, y < 33 ? 24 : 23, y, 21, y < 34 ? 6 : 7);
  }
  for (const side of [-1, 1]) for (let d = 5; d <= 23; d++) {
    const spread = (d - 5) / 18;
    const tip = Math.round(21 - spread * 5);
    const back = Math.round(10 - spread * 2 + Math.max(0, spread - .6) * 13);
    for (let y = back; y <= tip; y++) {
      const z = Math.round(14 - spread);
      const primary = spread > .56 || y < 14 - spread * 3;
      bird.set(23 + d * side, y, z, primary ? (y % 3 === 0 ? 5 : 4) : 3);
      if (spread < .5 && y > back && y < tip) bird.set(23 + d * side, y, z + 1, primary ? 5 : 1);
    }
  }
  return bird;
}
