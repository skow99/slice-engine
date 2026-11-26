import {Model} from '../../../src/index.js';

export function sailboat() {
  const model = Model.builder(17, 33, 25, [
    {rgb: [72, 39, 34], kind: 'ink'}, [135, 67, 46], [204, 140, 82],
    [249, 228, 175], [224, 205, 150], [107, 74, 54],
    [160, 187, 168], [252, 242, 207],
  ]);
  for (let y = 1; y < 32; y++) {
    const halfWidth = Math.floor(7.2 * Math.sin(Math.PI * (y + 4) / 37) ** 0.78);
    for (let z = 0; z <= 3; z++) {
      const half = Math.max(0, halfWidth - (z === 0 ? 1 : 0));
      for (let x = 8 - half; x <= 8 + half; x++) {
        const rim = z === 3 && (Math.abs(x - 8) >= half - 1 || y === 1 || y === 31);
        model.set(x, y, z, rim ? 7 : z === 3 ? 3 : z === 2 ? 2 : 1);
      }
    }
  }
  model.box(3, 7, 4, 13, 9, 4, 6);
  model.box(3, 14, 4, 13, 16, 4, 6);
  model.box(7, 19, 4, 8, 20, 24, 6);
  model.box(8, 7, 7, 9, 19, 7, 6);
  for (let z = 8; z <= 22; z++) {
    const foot = Math.round(7 + (z - 8) * 0.72);
    for (let y = foot; y <= 19; y++) {
      const x = 8 + Math.round(Math.sin((19 - y) / 12 * Math.PI) * 3);
      model.set(x, y, z, y === foot || z === 8 ? 5 : z > 17 ? 8 : 4);
      model.set(x + 1, y, z, z < 12 ? 5 : 4);
    }
  }
  model.box(8, 20, 23, 8, 24, 24, 7);
  return model;
}

// The sheet starts at deck level, five slices above the yacht model's base.
export function jib() {
  const model = Model.builder(17, 33, 17, [[216, 207, 172], [236, 232, 207], [251, 242, 215]]);
  for (let z = 0; z < 17; z++) {
    const luff = 30 - Math.round(z * 10 / 16);
    const leech = 18 + Math.round(z * 2 / 16);
    for (let y = leech; y <= luff; y++) {
      const chord = (luff - y) / Math.max(1, luff - leech);
      const camber = Math.round(2 * Math.sin(chord * Math.PI) * (1 - z / 17));
      model.set(8 + camber, y, z, y === luff || y === leech || z === 0 ? 1 : z % 5 === 0 ? 3 : 2);
    }
  }
  return model;
}

export function detailedSailboat() {
  const model = Model.builder(43, 99, 75, [
    [69, 37, 37], [124, 55, 46], [197, 171, 118], [226, 219, 181],
    [245, 238, 209], [157, 103, 64], [123, 78, 54], [96, 125, 116],
    [52, 78, 83], [105, 137, 138], [190, 174, 143], [220, 207, 174],
    [249, 241, 213], [136, 157, 133], [91, 81, 68],
  ]);
  for (let y = 3; y <= 95; y++) {
    const halfBeam = Math.round(17 * Math.sin(Math.PI * (y + 17) / 114) ** 0.63);
    const sheer = y > 76 ? Math.round((y - 76) / 10) : y < 12 ? 1 : 0;
    const deck = 11 + sheer;
    for (let z = 0; z <= deck; z++) {
      const width = Math.max(0, halfBeam - Math.round(4 * (1 - z / deck) ** 2));
      for (let x = 21 - width; x <= 21 + width; x++) {
        const across = Math.abs(x - 21);
        const cockpit = y >= 12 && y <= 44 && across <= 11;
        if (cockpit && z > 8) continue;
        const rail = across >= halfBeam - 1 || y <= 4 || y >= 94;
        const plank = (x + (Math.floor(y / 13) % 2)) % 4 === 0 ? 7 : 6;
        const material = z === deck ? rail ? 8 : y > 45 ? 5 : plank
          : cockpit && z === 8 ? plank : z >= 8 ? 4 : z === 7 ? 8 : z >= 3 ? 2 : 1;
        model.set(x, y, z, material);
      }
    }
  }
  // Cockpit benches, companionway, cabin roof, windows and foredeck fittings.
  for (const x of [9, 30]) model.box(x, 14, 9, x + 3, 40, 13, (_x, y, z) => z === 13 && y % 8 !== 0 ? 6 : 7);
  for (let y = 44; y <= 73; y++) {
    const wide = Math.min(12, 7 + Math.min(y - 44, 73 - y));
    const roof = 19 - Math.round(Math.abs(y - 57) / 10);
    for (let x = 21 - wide; x <= 21 + wide; x++) {
      const across = Math.abs(x - 21);
      const top = roof - Math.round(2 * (across / wide) ** 2);
      for (let z = 12; z <= top; z++) {
        const window = across === wide && z >= 14 && z < top && y >= 48 && y <= 69 && y % 10 !== 0;
        const door = y === 44 && across <= 4 && z < top;
        model.set(x, y, z, window ? (z === top - 1 ? 10 : 9) : door ? 7 : z === top ? (across === wide ? 11 : 5) : 4);
      }
    }
  }
  model.box(17, 61, 19, 25, 68, 20, (x, y) => x === 17 || x === 25 || y === 61 || y === 68 ? 11 : 9);
  model.box(20, 7, 10, 22, 8, 14, 15);
  model.box(21, 8, 14, 22, 22, 14, 6);
  for (const x of [13, 29]) {
    for (const y of [10, 84]) {
      model.set(x, y, 13, 15);
      model.box(x - 1, y, 14, x + 1, y, 14, 11);
    }
  }
  model.box(20, 88, 14, 22, 90, 14, 15);
  model.box(20, 59, 18, 22, 61, 74, (x, y) => x === 22 || y === 61 ? 11 : 15);
  model.box(21, 23, 22, 22, 58, 23, (_x, _y, z) => z === 22 ? 15 : 11);
  for (let z = 24; z < 69; z++) {
    const leech = Math.round(24 + (z - 24) * 0.75);
    for (let y = leech; y <= 58; y++) {
      const camber = Math.round(7 * Math.sin(Math.PI * (58 - y) / 35) * (1 - (z - 24) / 57));
      const seam = z === 24 || (z - 24) % 10 === 0 || y === leech || y === 58;
      model.set(21 + camber, y, z, seam ? 11 : y > 52 ? 13 : 12);
    }
  }
  for (let z = 71; z <= 74; z++) model.box(21, 62, z, 21, 70 - (z - 71), z, 14);
  return model;
}

export function detailedJib() {
  const model = Model.builder(43, 99, 49, [[201, 193, 161], [228, 228, 206], [248, 240, 209]]);
  for (let z = 0; z < 49; z++) {
    const luff = 92 - Math.round(z * 32 / 48);
    const leech = 55 + Math.round(z * 5 / 48);
    for (let y = leech; y <= luff; y++) {
      const chord = (luff - y) / Math.max(1, luff - leech);
      const camber = Math.round(6 * Math.sin(chord * Math.PI) * (1 - z / 49));
      model.set(21 + camber, y, z, y === luff || y === leech || z === 0 ? 1 : z % 11 === 0 ? 3 : 2);
    }
  }
  return model;
}

export function boathouse() {
  const model = Model.builder(36, 31, 24, [
    [86, 65, 49], [164, 123, 83], [109, 85, 62], [213, 181, 123],
    [128, 57, 44], [170, 77, 54], [208, 105, 64], [58, 65, 51],
    [222, 182, 93],
  ]);
  model.box(3, 3, 0, 32, 27, 2, 3);
  model.box(4, 4, 3, 31, 26, 13, (x, y) => (x + y) % 4 === 0 ? 3 : 2);
  model.box(12, 4, 3, 23, 4, 11, 1);
  model.box(6, 4, 7, 10, 4, 11, 9);
  model.box(25, 4, 7, 29, 4, 11, 9);
  model.box(4, 12, 7, 4, 17, 11, 9);
  model.box(31, 12, 7, 31, 17, 11, 9);
  for (let x = 1; x <= 34; x++) {
    const rise = Math.floor(Math.min(x - 1, 34 - x) * 0.56);
    model.box(x, 4, 13, x, 26, 14 + rise, 2);
    model.box(x, 1, 14 + rise, x, 29, 15 + rise,
      (xx, y) => y % 5 === 0 ? 5 : (xx + y) % 3 === 0 ? 7 : 6);
  }
  model.box(26, 20, 17, 29, 23, 23, 8);
  return model;
}

export function cottage() {
  const model = Model.builder(21, 29, 19, [
    [123, 116, 91], [230, 215, 173], [202, 185, 146],
    [99, 73, 54], [71, 99, 102], [247, 227, 178],
    [117, 63, 46], [168, 87, 58], [191, 107, 73],
    [134, 102, 78],
  ]);
  model.box(2, 2, 0, 18, 26, 1, 1);
  model.box(2, 2, 2, 18, 26, 9, (x, y) => x === 2 || y === 26 ? 3 : 2);
  model.box(8, 2, 2, 12, 2, 7, 4);
  for (const x of [4, 14]) {
    model.box(x, 2, 5, x + 2, 2, 8, 6);
    model.box(x, 2, 6, x + 2, 2, 7, 5);
    model.box(x, 26, 5, x + 2, 26, 8, 6);
    model.box(x, 26, 6, x + 2, 26, 7, 5);
  }
  for (const x of [2, 18]) {
    for (const y of [7, 13, 19]) {
      model.box(x, y, 5, x, y + 3, 8, 6);
      model.box(x, y + 1, 6, x, y + 2, 7, 5);
    }
  }
  for (let x = 0; x < 21; x++) {
    const eave = 9 + Math.floor((10 - Math.abs(x - 10)) * 0.63);
    if (x >= 2 && x <= 18) model.box(x, 2, 9, x, 26, eave, 2);
    model.box(x, 0, eave + 1, x, 28, eave + 2,
      (xx, y, z) => z === eave + 1 ? 7 : (xx + 2 * y) % 7 < 2 ? 9 : 8);
  }
  model.box(12, 18, 14, 14, 20, 17, 10);
  model.box(12, 18, 18, 14, 20, 18, 4);
  return model;
}

export function jetty() {
  const model = Model.builder(13, 49, 6, [
    [78, 62, 42], [118, 89, 57], [153, 120, 77],
    [191, 152, 97], [213, 178, 119],
  ]);
  model.box(2, 0, 2, 10, 48, 3, 2);
  model.box(1, 0, 4, 11, 48, 4, (x, y) => y % 4 === 0 ? 2 : (x + y) % 5 === 0 ? 5 : 4);
  for (const y of [3, 17, 31, 45]) {
    model.box(0, y, 0, 2, y + 1, 5, 3);
    model.box(10, y, 0, 12, y + 1, 5, 3);
  }
  return model;
}
