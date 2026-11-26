import {Model, Voxel} from '../src/index.js';

const sheets = {
  swan: {sliceWidth: 17, sliceHeight: 31, count: 18, columns: 6, scale: 0.055},
  mallard: {sliceWidth: 35, sliceHeight: 21, count: 11, columns: 4, scale: 0.041, wingRoot: 6},
  cormorant: {sliceWidth: 43, sliceHeight: 29, count: 12, columns: 4, scale: 0.048, wingRoot: 5},
  stork: {sliceWidth: 47, sliceHeight: 39, count: 25, columns: 5, scale: 0.045, wingRoot: 5},
  crow: {sliceWidth: 37, sliceHeight: 23, count: 14, columns: 4, scale: 0.09, wingRoot: 5},
};
const wingBeats = {mallard: 2.7, cormorant: 1.9, stork: 1.5, crow: 3.25};
const wingAngles = [-0.82, -0.4, 0, 0.47, 0.93];
const flightBase = 21;
const twoPi = 2 * Math.PI;

function poseBird(source, wingRoot, angle, species, bend = 0, gearDown = false) {
  const {w, h, count, materials} = source.model;
  const flying = angle !== undefined;
  const base = flying ? flightBase : 0;
  const pad = species === 'swan' || species === 'stork' ? 4 : 0;
  const bird = Model.builder(w, h + 2 * pad, count + 2 * base, materials.slice(1));
  const center = Math.floor(w / 2);
  const cosine = Math.cos(angle ?? 0);
  const sine = Math.sin(angle ?? 0);
  for (let z = 0; z < count; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const material = source.get(x, y, z);
    if (!material) continue;
    const fromCenter = x - center;
    if (Math.abs(fromCenter) < wingRoot) {
      if (species === 'swan' && z >= 6 && y > 17) {
        const dip = (z - 5) / 12 * bend;
        bird.set(x, Math.round(y + pad + 5 * dip), Math.max(0, Math.round(z - 16 * dip)), material);
      } else if (species === 'stork' && (bend || flying)) {
        if (flying && !gearDown && z < 12) {
          bird.set(x, y + pad - Math.round((12 - z) * 1.18), base + 12 - Math.round((12 - z) * .29), material);
        } else if (y >= 20 && z >= 15) {
          const turn = bend ? bend * -1.59 : gearDown ? -.32 : -.95;
          // In flight the neck extends forward while the head keeps the bill level.
          const keepHeadLevel = flying && y >= 26 && z >= 19;
          const reach = (keepHeadLevel ? 27 : y) - 21;
          const rise = (keepHeadLevel ? 21 : z) - 14;
          const along = reach * (Math.cos(turn) - 1) - rise * Math.sin(turn);
          const height = reach * Math.sin(turn) + rise * (Math.cos(turn) - 1);
          bird.set(x, Math.round(y + pad + along), Math.max(0, Math.round(base + z + height)), material);
        } else {
          bird.set(x, y + pad, z + base, material);
        }
      } else {
        bird.set(x, y + pad, z + base, material);
      }
    } else if (flying) {
      const side = Math.sign(fromCenter);
      const u = Math.abs(fromCenter) - wingRoot + 1;
      const rootHeight = species === 'stork' ? 14 : 4;
      const v = z - rootHeight;
      const spread = wingRoot - 1 + u * cosine - v * sine;
      bird.set(Math.round(center + side * spread), y + pad, Math.round(base + rootHeight + u * sine + v * cosine), material);
    }
  }
  return Model.thing(bird, {frames: 16});
}

export async function loadBirdArt() {
  const entries = await Promise.all(Object.entries(sheets).map(async ([species, sheet]) => {
    const image = await Model.loadImage(new URL('./art/' + species + '-slices.png', import.meta.url).href);
    const source = Model.fromSliceImage(image, sheet);
    const resting = poseBird(source, sheet.wingRoot ?? 9, undefined, species);
    const flight = sheet.wingRoot ? wingAngles.map(angle => poseBird(source, sheet.wingRoot, angle, species)) : [];
    const feeding = species === 'swan' || species === 'stork'
      ? [resting, ...[.25, .5, .75, 1].map(bend => poseBird(source, sheet.wingRoot ?? 9, undefined, species, bend))]
      : [];
    const landing = species === 'stork' ? poseBird(source, sheet.wingRoot, .29, species, 0, true) : null;
    return [species, {resting, flight, landing, feeding, scale: sheet.scale}];
  }));
  return Object.fromEntries(entries);
}

function projectedBird(view, bird) {
  return view.toScreen({x: bird.x, y: bird.y - bird.altitude * 0.72});
}

export function visibleBirds(birds, view) {
  return birds.filter(bird => {
    const margin = bird.mode === 'swimming' || bird.mode === 'resting' ? Math.max(12, 4.5 * view.scale) : 12;
    const {x, y} = projectedBird(view, bird);
    return x >= -margin && x <= view.w + margin && y >= -margin && y <= view.h + margin;
  });
}

export function drawBird(context, view, bird, art, time) {
  const source = art[bird.species];
  const swimming = bird.mode === 'swimming';
  const onField = ['standing', 'walking', 'feeding'].includes(bird.mode);
  const resting = bird.mode === 'perched' || bird.mode === 'resting' || onField;
  const guide = projectedBird(view, bird);
  const scale = source.scale * view.scale;
  let model = source.resting;
  let lift = 0;
  if (swimming) {
    lift = -Math.sin(time * 2.7 + bird.phase) * (bird.species === 'swan' ? 0.045 : 0.036);
    if (bird.species === 'swan') model = source.feeding[Math.round(4 * (bird.feed ?? 0))];
  } else if (!resting) {
    const gliding = (bird.species === 'cormorant' || bird.species === 'stork') && Math.sin(time * 1.35 + bird.phase) < -0.22;
    const flight = gliding ? 2 : Math.round(2 + 2 * Math.sin(time * twoPi * wingBeats[bird.species] + bird.phase));
    model = bird.mode === 'landing' && source.landing ? source.landing : source.flight[flight];
    lift = flightBase * source.scale / Voxel.SQUASH;
  }
  if (onField) model = source.feeding[Math.round(4 * (bird.feed ?? 0))];
  if (bird.mode === 'walking') lift = -Math.abs(Math.sin(time * 12 + bird.phase)) * .065;
  context.save();
  context.imageSmoothingEnabled = false;
  if (onField) {
    context.beginPath();
    context.ellipse(guide.x, guide.y, view.scale * .41, view.scale * .21, bird.heading, 0, twoPi);
    context.fillStyle = '#222d233e';
    context.fill();
    if (bird.mode === 'feeding' && view.scale >= 4 && bird.feedProgress < .45) {
      const x = guide.x + Math.cos(bird.heading) * .39 * view.scale;
      const y = guide.y + Math.sin(bird.heading) * .39 * view.scale;
      const size = .10 * view.scale;
      context.fillStyle = '#504435';
      context.fillRect(x - size / 2, y, size, size * .66);
    }
  }
  context.translate(guide.x, guide.y + lift * view.scale);
  context.scale(scale, scale / Voxel.SQUASH);
  Voxel.draw(context, model.sprite(bird.heading), 0, 0);
  context.restore();
}

export function drawBirdWater(context, view, birds, time, isWater) {
  context.save();
  for (const bird of birds) {
    if (bird.species === 'crow' || bird.species === 'stork' || bird.mode === 'resting' || !isWater(bird.x, bird.y)) continue;
    const center = view.toScreen(bird);
    if (bird.mode !== 'swimming') {
      context.beginPath();
      context.fillStyle = '#0d2b3f24';
      context.ellipse(center.x, center.y, 1.05 * view.scale, 0.37 * view.scale, bird.heading, 0, twoPi);
      context.fill();
      continue;
    }
    const swan = bird.species === 'swan';
    const aheadX = Math.cos(bird.heading);
    const aheadY = Math.sin(bird.heading);
    const trail = (swan ? 1.6 : 0.89) + bird.speed * 0.5;
    const wakeStart = swan ? 0.55 : .29;
    context.beginPath();
    for (const side of [-1, 1]) {
      const start = view.toScreen({
        x: bird.x - wakeStart * (aheadX * 0.33 + side * aheadY * 0.25),
        y: bird.y - wakeStart * (aheadY * 0.33 - side * aheadX * 0.25),
      });
      const end = view.toScreen({
        x: bird.x - aheadX * trail - side * aheadY * trail * 0.36,
        y: bird.y - aheadY * trail + side * aheadX * trail * 0.36,
      });
      if (!isWater(view.x + end.x / view.scale, view.y + end.y / view.scale)) continue;
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
    }
    context.strokeStyle = '#b9dad2';
    context.globalAlpha = (0.14 + bird.speed * 0.13) * (0.87 + 0.13 * Math.sin(time * 3 + bird.phase));
    context.lineWidth = 0.7;
    context.stroke();
    const splash = time - bird.touchedDown;
    if (splash < 2.1) {
      context.beginPath();
      const radius = (0.7 + splash * 1.3) * view.scale;
      context.ellipse(center.x, center.y, radius, radius * 0.66, bird.heading, 0, twoPi);
      context.globalAlpha = 0.51 * Math.max(0, 1 - splash / 2.1);
      context.stroke();
    }
    if (swan && bird.feed > .65) {
      const tip = {x: bird.x + aheadX * .98, y: bird.y + aheadY * .98};
      if (isWater(tip.x, tip.y)) {
        const at = view.toScreen(tip);
        const radius = Math.max(.35, (.29 + Math.sin(time * 7 + bird.phase) * .10) * view.scale);
        context.beginPath();
        context.ellipse(at.x, at.y, radius, radius * .64, 0, 0, twoPi);
        context.globalAlpha = .28 * bird.feed;
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  }
  context.restore();
}
