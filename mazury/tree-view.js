import {Model, Voxel} from '../src/index.js';

// Metres per voxel, height of the main fork, crown compliance and sway frequency.
const species = {
  oak:    {scale: .248, fork: 11, flex: .72, frequency: 1.30},
  birch:  {scale: .235, fork: 3,  flex: 1.22, frequency: 1.85},
  willow: {scale: .248, fork: 8,  flex: 1.48, frequency: 1.46},
  pine:   {scale: .259, fork: 24, flex: .87, frequency: 1.39},
  spruce: {scale: .244, fork: 9,  flex: .58, frequency: 1.68},
  cherry: {scale: .215, fork: 11, flex: .96, frequency: 1.98},
};
const tau = Math.PI * 2;
const fineDetail = 3;

// Store each stem, leader and hanging spray in its tight voxel bounds and
// keep its offset from the planted root for reassembly at each heading.
function splitBoughs({model, palette}) {
  const groups = new Map();
  const area = model.w * model.h;
  for (let i = 0; i < model.vox.length; i++) {
    const material = model.vox[i];
    if (!material) continue;
    const [r, , b] = palette[material];
    const group = ((r & 1) << 3) | (b & 7);
    if (!groups.has(group)) groups.set(group, {
      group, indices: [], sumX: 0, sumY: 0, sumZ: 0,
      x0: model.w, y0: model.h, z0: model.count, x1: 0, y1: 0, z1: 0,
    });
    const limb = groups.get(group);
    const x = i % model.w, y = Math.floor(i / model.w) % model.h, z = Math.floor(i / area);
    limb.indices.push(i);
    limb.sumX += x; limb.sumY += y; limb.sumZ += z;
    limb.x0 = Math.min(limb.x0, x); limb.x1 = Math.max(limb.x1, x);
    limb.y0 = Math.min(limb.y0, y); limb.y1 = Math.max(limb.y1, y);
    limb.z0 = Math.min(limb.z0, z); limb.z1 = Math.max(limb.z1, z);
  }
  return [...groups.values()].map(({group, indices, sumX, sumY, sumZ, x0, y0, z0, x1, y1, z1}) => {
    const part = Voxel.createModel(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1, model.materials);
    for (const i of indices) {
      const x = i % model.w, y = Math.floor(i / model.w) % model.h, z = Math.floor(i / area);
      part.vox[((z - z0) * part.h + y - y0) * part.w + x - x0] = model.vox[i];
    }
    return {group, part, ox: x0 + part.cx - model.cx, oy: y0 + part.cy - model.cy, z0,
      x: sumX / indices.length + .5 - model.cx, y: sumY / indices.length + .5 - model.cy,
      z: sumZ / indices.length + .5};
  });
}

// Wind is measured at the unprojected root, including a gust crossing that
// particular tree. A damped response retains the previous load on a turn or lull.
export function treeLoad(tree, wind, time) {
  if (tree.load?.time === time) return tree.load;
  const dx = -Math.cos(wind.from), dy = -Math.sin(wind.from);
  const flow = tree.x * dx + tree.anchorY * dy;
  const speed = wind.speed + wind.gustAt(tree.x, tree.anchorY);
  const pressure = speed / (speed + 10);
  const wave = Math.sin(time * 1.13 - flow * .091) + .46 * Math.sin(time * 1.76 - flow * .16);
  const strength = pressure * (.87 + .22 * wave);
  const targetX = dx * strength, targetY = dy * strength;
  const load = tree.load ??= {time, x: targetX, y: targetY, vx: 0, vy: 0};
  const dt = time - load.time, stiffness = 3.8 / Math.sqrt(tree.flex);
  const decay = Math.exp(-stiffness * dt);
  for (const [axis, velocity, target] of [['x', 'vx', targetX], ['y', 'vy', targetY]]) {
    const delta = load[axis] - target, v = load[velocity] + stiffness * delta;
    load[axis] = target + (delta + v * dt) * decay;
    load[velocity] = (load[velocity] - stiffness * v * dt) * decay;
  }
  load.time = time;
  return load;
}

// The stem yields a little. Each leader inherits its fork's displacement,
// then sways around that joint with its own period and lighter tip vibration.
export function boughPose(tree, group, load, time, hingeY = 0, detail = 1) {
  const baseX = load.x * tree.flex * .057, baseY = load.y * tree.flex * .057;
  if (!group) return {shear: baseX, down: baseY, x: 0, y: 0};
  // Hanging sprays share the parent motion and trail from their attachment.
  const leader = group > 4 ? group - 4 : group;
  const phase = tree.phase + leader * 2.40;
  const t = time * tree.frequency * (1 + leader * .042);
  const sway = .20 + .12 * Math.sin(t + phase) + .048 * Math.sin(t * 2.71 + phase * 1.7);
  const twist = .055 * Math.sin(t * 1.37 + phase);
  const shear = tree.flex * (load.x * sway - load.y * twist);
  const down = tree.flex * (load.y * sway + load.x * twist) + .023 * (load.x ** 2 + load.y ** 2);
  const fork = tree.fork * detail;
  const pose = {shear, down, x: (baseX - shear) * fork, y: (baseY - down) * fork};
  if (group > 4) {
    const trail = tree.flex * (.23 + .13 * Math.sin(t * 2.17 + phase - .8));
    const tipX = trail * load.x, tipY = trail * load.y;
    pose.shear -= tipX;
    pose.down -= tipY;
    pose.x -= tipX * hingeY;
    pose.y -= tipY * hingeY;
  }
  return pose;
}

export function readTreeStack(image, detail = 1) {
  const size = 64 * detail;
  const stack = Model.fromSliceImage(image, {sliceWidth: size, columns: detail === 1 ? 8 : 16, count: size});
  const boughs = splitBoughs(stack);
  // Strip the material group bits before the engine lights the leaves.
  for (const color of stack.palette) if (color) {
    color[0] &= 254;
    color[2] = (color[2] & 248) + 3;
  }
  return {...stack, boughs, detail};
}

export function bakeBoughs(source, direction) {
  const {palette, boughs, detail} = source;
  const angle = direction * tau / Voxel.TURN_FRAMES;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return boughs.map(({group, part, x, y, z, ox, oy, z0}) => {
    const depth = x * sin + y * cos;
    // The yacht's voxel projection provides the light and visible faces. Ink
    // along every separate leaf spray would draw dark seams inside the tree.
    const surface = Voxel.tumbleSurface(part, direction, 0, 0);
    const sprite = Voxel.bake(part, surface, palette, part.vox, true);
    return {group, depth, hingeY: depth * Voxel.SQUASH - z - 6 * detail,
      sprite: {...sprite, dx: sprite.dx + Math.round(ox * cos - oy * sin),
        dy: sprite.dy + Math.round((ox * sin + oy * cos) * Voxel.SQUASH - z0)}};
  }).sort((a, b) => a.depth - b.depth);
}

function bakeTree(source, direction) {
  const layers = bakeBoughs(source, direction);
  // Sample an actual outer branch for the crow's feet and keep its group.
  let perch;
  for (const {group, sprite} of layers) {
    if (!group || group > 4) continue;
    const {canvas, w, h, dx, dy} = sprite;
    const col = Math.round(w * .61);
    const pixels = canvas.getContext('2d').getImageData(col, 0, 1, h).data;
    let row = 0;
    while (row < h && !pixels[row * 4 + 3]) row++;
    if (row < h && (!perch || row + dy < perch.y)) perch = {group, x: dx + col, y: dy + row + 1};
  }
  return {layers, perch, shadow: Voxel.shadow(source.model, direction)};
}

export async function loadTreeArt() {
  const sources = new Map(await Promise.all(Object.keys(species).map(async name => {
    const image = await Model.loadImage(new URL('./art/' + name + '-slices.png', import.meta.url).href);
    return [name, readTreeStack(image)];
  })));
  const cache = new Map();
  const fine = new Map();
  const queue = new Map();
  let worker = typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
    ? new Worker(new URL('./tree-detail-worker.js', import.meta.url), {type: 'module'}) : null;
  let baking;
  // Coarse art stays available while the worker prepares one visible variant
  // at a time. Keep the previous fine bake while the sky lighting changes.
  function nextBake() {
    if (!worker || baking || !queue.size) return;
    const [kind, tree] = queue.entries().next().value;
    queue.delete(kind);
    baking = {kind, light: Voxel.lighting};
    worker.postMessage({species: tree.species, direction: tree.direction, light: baking.light, detail: fineDetail});
  }
  if (worker) {
    worker.onmessage = ({data}) => {
      const {kind, light} = baking;
      if (data.layers) {
        for (const layer of fine.get(kind)?.layers ?? []) layer.sprite.canvas.close();
        fine.set(kind, {layers: data.layers, light});
      } else {
        fine.set(kind, {failed: true});
        console.error(data.error);
      }
      baking = undefined;
      nextBake();
    };
    worker.onerror = () => {
      worker.terminate();
      worker = null;
      queue.clear();
      for (const entry of fine.values()) for (const layer of entry.layers ?? []) layer.sprite.canvas.close();
      fine.clear();
    };
  }
  let light, reflection;
  Voxel.onRastersLost(() => { cache.clear(); reflection = null; });
  function art(tree) {
    if (light !== Voxel.lighting) { cache.clear(); light = Voxel.lighting; }
    let baked = cache.get(tree.kind);
    if (!baked) {
      baked = bakeTree(sources.get(tree.species), tree.direction);
      cache.set(tree.kind, baked);
    }
    return baked;
  }
  return {
    plant(name, variant, x, anchorY, y) {
      const style = species[name], seed = Model.hash(x, anchorY);
      return {x, y, anchorY, species: name, kind: name + variant,
        direction: Math.round([0, .354, .719][variant] * Voxel.TURN_FRAMES),
        ...style, scale: style.scale * [1, .86, .74][variant] * (.95 + seed * .10),
        frequency: style.frequency * (.92 + seed * .16), phase: seed * tau};
    },
    frame(tree, wind, time, pixelsPerMeter = 0) {
      const baked = art(tree), load = treeLoad(tree, wind, time);
      const close = pixelsPerMeter >= 8;
      const detailed = close ? fine.get(tree.kind) : null;
      if (worker && close && !detailed?.failed && detailed?.light !== Voxel.lighting && baking?.kind !== tree.kind) {
        queue.set(tree.kind, tree);
        nextBake();
      }
      const detail = detailed?.layers ? fineDetail : 1;
      const layers = (detailed?.layers ?? baked.layers).map(({group, sprite, hingeY}) => ({
        sprite, ...boughPose(tree, group, load, time, hingeY, detail),
      }));
      const draw = context => {
        for (const layer of layers) {
          context.save();
          context.transform(1, 0, -layer.shear, 1 - layer.down, layer.x, layer.y);
          Voxel.draw(context, layer.sprite, 0, 0);
          context.restore();
        }
      };
      // The reflection pass reads one pose at a time after it culls the
      // bounds. Reuse one raster for the entire shore, even at wide zoom.
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      for (const {sprite, shear, down, x, y} of layers) {
        const first = sprite.dy, last = first + sprite.h;
        const dx = sprite.dx + x;
        left = Math.min(left, dx - shear * first, dx - shear * last);
        right = Math.max(right, dx + sprite.w - shear * first, dx + sprite.w - shear * last);
        top = Math.min(top, first * (1 - down) + y);
        bottom = Math.max(bottom, last * (1 - down) + y);
      }
      const dx = Math.floor(left), dy = Math.floor(top);
      const sprite = {w: Math.ceil(right) - dx, h: Math.ceil(bottom) - dy, dx, dy, get canvas() {
        reflection ??= Voxel.canvas(96, 96).getContext('2d');
        if (reflection.canvas.width < this.w) reflection.canvas.width = this.w;
        if (reflection.canvas.height < this.h) reflection.canvas.height = this.h;
        reflection.setTransform(1, 0, 0, 1, -this.dx, -this.dy);
        reflection.clearRect(this.dx, this.dy, this.w, this.h);
        reflection.imageSmoothingEnabled = false;
        draw(reflection);
        return reflection.canvas;
      }};
      return {draw, sprite, scale: tree.scale / detail, shadow: baked.shadow};
    },
    perchAt(tree, wind, time) {
      const p = art(tree).perch;
      const pose = boughPose(tree, p.group, treeLoad(tree, wind, time), time);
      return {x: tree.x + (p.x - p.y * pose.shear + pose.x) * tree.scale,
        y: tree.y + (p.y * (1 - pose.down) + pose.y) * tree.scale};
    },
  };
}
