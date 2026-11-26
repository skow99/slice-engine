// Each recipe grows at two resolutions. Boughs carry separate sprays of leaves,
// leaving sky holes between the forks even when viewed from above.
import {Model} from '../../../src/index.js';

const palettes = {
  oak:    '514137 74573e 9a7952 42583b 58703e 758846 92a454 b0b965',
  birch:  '605951 c7bea1 e8e3c9 566e47 6f8b50 91a95b adbd6d c4cf83',
  willow: '514a3b 76664b 94845b 50694f 6a8156 87985d a5ad6e bfc487',
  pine:   '59483e a16e48 c18b5e 324f48 406859 557c63 789375 95aa83',
  spruce: '58463c 75614d 927d60 304e50 3f6567 527d79 71968b 98afa0',
  cherry: '56413b 805c4f a27961 566a47 758454 95a663 c8a89d e3c3b4',
};
const tau = Math.PI * 2;
const at = (p, angle, distance, rise) => [p[0] + Math.cos(angle) * distance, p[1] + Math.sin(angle) * distance, p[2] + rise];

export function grow(species, branchMask = false, detail = 1) {
  const seed = Object.keys(palettes).indexOf(species) + 1;
  const rand = Model.random(seed * 473);
  const between = (a, b) => a + (b - a) * rand();
  const tree = Model.builder(64 * detail, 64 * detail, 64 * detail, palettes[species].split(' ').map(Model.hexToRgb));
  const birch = species === 'birch', willow = species === 'willow', pine = species === 'pine';
  const spruce = species === 'spruce', cherry = species === 'cherry';
  const foot = [31, 32, 0];
  let bough = 0;
  const paint = material => branchMask ? bough + 1 : material;
  function limb(a, b, base, tip) {
    const n = Math.ceil(Math.hypot(...a.map((v, i) => b[i] - v)) * 1.65 * detail);
    for (let s = 0; s <= n; s++) {
      const t = s / n, r = base + (tip - base) * t;
      const [cx, cy, cz] = a.map((v, i) => v + (b[i] - v) * t);
      tree.blob(cx * detail, cy * detail, cz * detail,
        Math.max(.8, r) * detail, Math.max(.8, r) * detail, Math.max(1, r) * detail, (vx, vy, vz) => {
        const x = Math.floor(vx / detail), y = Math.floor(vy / detail), z = Math.floor(vz / detail);
        if (detail > 1 && vz > 5 * detail && (vx + 2 * vy + Math.floor(vz / 8)) % 11 < 2) return paint(1);
        if (birch) return paint(z < 5 || Model.hash(x >> 1, y >> 1, z) > .88 ? 1 : 2 + Number((x + y) % 4 > 0));
        return paint(1 + Number((x + y + (z >> 3)) % 5 > 0) + Number(pine && z > 16 || (x + 3 * y) % 7 === 0));
      });
    }
  }
  // A spray has a scalloped rim and broad patches of colour shared by adjacent
  // slices. Small swatches follow each spray instead of speckling every voxel.
  function leaves([cx, cy, cz], rx, ry, rz, tint = 0) {
    const phase = rand() * tau;
    for (let vz = Math.ceil((cz - rz) * detail); vz <= (cz + rz) * detail; vz++)
      for (let vy = Math.ceil((cy - ry) * detail); vy <= (cy + ry) * detail; vy++)
        for (let vx = Math.ceil((cx - rx) * detail); vx <= (cx + rx) * detail; vx++) {
          const x = vx / detail, y = vy / detail, z = vz / detail;
          const u = (x - cx) / rx, v = (y - cy) / ry, h = (z - cz) / rz;
          const clump = Math.sin(x * .69 + phase) * Math.cos(y * .53 - z * .37) * .14;
          const d = u * u + v * v + h * h;
          const edge = .91 + clump + Model.hash(x >> 1, y >> 1, z >> 1) * .14;
          // Fine lobes and needle tips break up the outer surface of each spray.
          const lobe = detail === 1 ? 0 : Math.sin(vx * 1.03 + phase) * Math.cos(vy * .91 - vz * .76) * .11;
          if (d > edge + lobe) continue;
          if (detail > 1 && d > edge - .2 && Model.hash(vx, vy, vz) < .13) continue;
          const light = .95 + h * 1.2 - u * .32 + tint + .82 * Math.sin(x * .36 + y * .24 + phase)
            + .67 * Model.hash(x >> 1, y >> 1, z >> 1);
          const grain = detail === 1 ? 0 : (Model.hash(vx >> 1, vy >> 1, vz >> 1) - .5) * .58;
          tree.set(vx, vy, vz, paint(4 + Math.max(0, Math.min(4, Math.floor(light + grain + .6)))));
        }
  }
  function spray(p, angle, size, thickness, tint) {
    leaves(p, size, size * .85, thickness, tint);
    for (let k = 0; k < 4; k++) {
      const a = angle + k * 1.63 + between(-.4, .4);
      const q = at(p, a, size * between(.54, .92), between(-1.4, 1.3));
      leaves(q, size * .55, size * .57, thickness * .65, tint + between(-.5, .5));
    }
  }
  for (let i = 0; i < 5; i++) limb(at(foot, i * 1.26, birch ? 2.7 : 4.5, 0), [31, 32, 5], 1, birch ? 1.5 : 2.2);

  if (spruce) {
    const tip = [32, 31, 61];
    limb(foot, tip, 2.3, .65);
    for (let tier = 0; tier < 10; tier++) {
      const height = 11 + tier * 5.25, span = 20 * (1 - tier / 11);
      const phase = rand() * tau;
      for (let k = 0; k < 8; k++) {
        const a = phase + k * tau / 8, reach = span * between(.79, 1.12);
        bough = 1 + Math.floor((a % tau) / tau * 4);
        const joint = [32, 31, height];
        const end = at(joint, a, reach, -reach * .31);
        limb(joint, end, 1.25, .65);
        for (let j = 1; j <= 4; j++) {
          const s = j / 4, p = at(joint, a, s * reach, -reach * .33 * s + 1.4);
          const r = (1 - s * .52) * (span * .28 + 1.3);
          leaves(p, r, r, r * .91, s * .75);
        }
      }
    }
    bough = 0;
    leaves(tip, 1.5, 1.6, 2, 1);
  } else {
    const leaders = birch ? 3 : pine ? 2 : 4;
    const fork = birch ? 3 : pine ? 24 : willow ? 8 : 11;
    const joint = at(foot, 2.5, pine ? 2.6 : 1.5, fork);
    limb(foot, joint, birch ? 1.7 : cherry ? 2.1 : 3.1, birch ? 1.2 : 2.1);
    for (let k = 0; k < leaders; k++) {
      bough = k + 1;
      const a = k * tau / leaders + between(-.3, .3);
      const high = birch ? 60 - k * 4 : pine ? 59 - k * 7 : willow ? 47 - k * 1.8 : cherry ? 43 - k * 1.6 : 52 - k * 2;
      const elbow = at(joint, a, birch ? 3.3 : 5.7, (high - fork) * .42);
      const top = at(elbow, a + .63, birch ? 3 : 4.4, high - elbow[2]);
      limb(joint, elbow, birch ? 1.45 : 2.3, birch ? 1.15 : 1.65);
      limb(elbow, top, birch ? 1.2 : 1.8, .68);
      const tiers = birch ? 6 : pine ? 5 : 4;
      for (let j = 0; j < tiers; j++) {
        const f = j / tiers;
        const start = elbow.map((v, i) => v + (top[i] - v) * f);
        const angle = a + (j % 2 ? -1 : 1) * between(.2, 1.5);
        const span = (birch ? 12 : pine ? 19 : 16) * (1 - f * .64) * between(.8, 1.14);
        const knee = at(start, angle, span * .55, pine ? -1.5 : span * .41);
        const end = at(knee, angle + between(-.6, .6), span * .47, pine ? 3.2 : span * .22);
        limb(start, knee, 1.45 - f * .4, 1);
        limb(knee, end, 1.05, .65);
        const size = (birch ? 3.9 : willow ? 5.3 : pine ? 5.2 : 6) * between(.9, 1.16);
        spray(end, angle, size, size * (pine ? .48 : willow ? .7 : .92), cherry && (j + k) % 3 === 0 ? 1.9 : .35);
        const side = at(knee, angle + 1.15, size, size * .55);
        limb(knee, side, .85, .65);
        spray(side, angle, size * .78, size * .64, .3);
        if (willow || birch) {
          bough = k + 5;
          // Pendulous willow wands and much shorter silver-birch catkin sprays.
          for (let l = 0; l < (willow ? 10 : 3); l++) {
            const a = angle + between(-1.9, 1.9), reach = between(2, size * 1.15);
            const p = at(end, a, reach, 0), drop = willow ? between(9, 19) : between(3, 7);
            for (let s = 0; s < drop; s += 1.6) {
              const r = (willow ? 2.15 : 1.35) * (1 - .64 * s / drop);
              leaves(at(p, a, Math.sin(s / drop * 2) * 1.9, -s), r, r, 2.4, 1);
            }
          }
          bough = k + 1;
        }
      }
      spray(top, a, birch ? 3.1 : 4.5, pine ? 2.1 : 3.6, 1);
    }
  }
  return tree;
}

export const oak = () => grow('oak');
export const birch = () => grow('birch');
export const willow = () => grow('willow');
export const pine = () => grow('pine');
export const spruce = () => grow('spruce');
export const cherry = () => grow('cherry');

export const oakDetail = () => grow('oak', false, 3);
export const birchDetail = () => grow('birch', false, 3);
export const willowDetail = () => grow('willow', false, 3);
export const pineDetail = () => grow('pine', false, 3);
export const spruceDetail = () => grow('spruce', false, 3);
export const cherryDetail = () => grow('cherry', false, 3);
