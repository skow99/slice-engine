/* Building a level: the painted ground, trees, rocks, crates and crystals,
 * all placed from one seed, so the level is the same every time. */
import {Model, Ground, Trees, createGrid} from '../../src/index.js';
import * as Models from './models.js';

export const WORLD_W = 1400, WORLD_H = 1000, START = {x: 700, y: 520};

/* Things made once and shared: a Thing per model (and colour). */
export const things = {
  rover: Model.thing(Models.rover()),
  crate: Model.thing(Models.crate(), {frames: 16}),
  rocks: [1, 2, 3, 4].map(seed => Model.thing(Models.rock(seed, 0.8 + seed * 0.15), {frames: 4})),
};
const crystal = Model.thing(Models.crystal(), {frames: 32});
things.crystals = [
  crystal,
  crystal.recolored({1: [255, 120, 220], 2: [255, 210, 245]}, 'pink'),
  crystal.recolored({1: [255, 206, 80], 2: [255, 244, 190]}, 'gold'),
];
// A recoloured Thing keeps the model's material kinds: these stay 'glow'.

const TREE_KINDS = ['oak2', 'pine2', 'birch2', 'cherry2', 'maple2', 'spruce2', 'oak1', 'pine1'];

/* Paint the ground: grass with noise, a few dirt tracks, flowers. */
export function paintGround() {
  const ground = Ground.create(WORLD_W, WORLD_H);
  Ground.paint(ground, (x, y) => {
    const n = Model.hash(x >> 1, y >> 1), patch = Model.hash(x >> 5, y >> 5);
    // Dirt tracks: where two wavy lines run.
    const track = Math.min(Math.abs(y - 520 - Math.sin(x / 140) * 90), Math.abs(x - 700 - Math.sin(y / 120) * 110));
    if (track < 14 + n * 4) return n < 0.5 ? [176, 146, 104] : n < 0.9 ? [166, 136, 96] : [190, 162, 118];
    if (n > 0.996) return Model.hash(x, y, 3) < 0.5 ? [246, 238, 170] : [236, 150, 190];  // flowers
    const base = patch < 0.3 ? [98, 148, 80] : patch < 0.7 ? [106, 158, 86] : [116, 166, 90];
    const d = n < 0.4 ? -8 : n > 0.85 ? 8 : 0;
    return [base[0] + d, base[1] + d, base[2] + d];
  });
  return ground;
}

/* Everything that stands on the ground. */
export function populate(seed = 7) {
  const rand = Model.random(seed), level = {trees: [], rocks: [], crates: [], crystals: []};
  const taken = [];
  const free = (x, y, r) => Math.hypot(x - START.x, y - START.y) > 90 && taken.every(t => Math.hypot(x - t.x, y - t.y) > r + t.r);
  const place = (r, tries = 50) => {
    for (let i = 0; i < tries; i++) {
      const x = 40 + rand() * (WORLD_W - 80), y = 60 + rand() * (WORLD_H - 100);
      if (free(x, y, r)) { taken.push({x, y, r}); return {x, y}; }
    }
    return null;
  };
  for (let i = 0; i < 70; i++) {
    const kind = TREE_KINDS[Math.floor(rand() * TREE_KINDS.length)], spot = place(26);
    if (spot) level.trees.push({...spot, kind, r: Trees.info(kind).halfWidth + 3, fixed: true, sway: rand() * 6});
  }
  for (let i = 0; i < 26; i++) {
    const thing = things.rocks[i % things.rocks.length], spot = place(18);
    if (spot) level.rocks.push({...spot, thing, heading: Math.floor(rand() * 4) * Math.PI / 2, r: thing.model.w * 0.38, fixed: true});
  }
  for (let i = 0; i < 14; i++) {
    const spot = place(14);
    if (spot) level.crates.push({...spot, heading: rand() * Math.PI, vx: 0, vy: 0, r: 8, mass: 2});
  }
  for (let i = 0; i < 15; i++) {
    const spot = place(20);
    if (spot) level.crystals.push({...spot, thing: things.crystals[i % 3], phase: rand() * 6, taken: false});
  }
  // Fixed obstacles go in a grid once; crates move, so they are tested directly.
  level.grid = createGrid(64);
  for (const item of [...level.trees, ...level.rocks]) level.grid.insert(item);
  return level;
}

/* Bake while loading, so nothing bakes mid-play. */
export function warm() {
  things.rover.warm();
  things.crate.warm();
  for (const t of things.rocks) t.warm();
  for (const t of things.crystals) t.warm();
  for (const kind of TREE_KINDS) Trees.prepare(kind);
}
