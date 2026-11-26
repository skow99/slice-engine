import {Model, Voxel} from '../src/index.js';
import {hull, sailSteps} from './sailing.js';

const length = 93;
const stackWidth = 99;
const mast = {x: 21, y: 59};
const center = Math.floor(stackWidth / 2);
const mainFoot = 24;
const mainHead = 69;
const jibFoot = 15;
const stayY = z => 92 - Math.round(z * 32 / 48);
const rollSteps = 180;
const cacheSize = 20;
const clothContrast = 0.28;
const sailAngleSteps = 24;
const mastHinge = 9;

function yachtProjection(boat, pose) {
  const {detail, cx, cy, pivotZ, direction, pitchStep, rollStep, mastStep, boardDepth} = pose;
  const rotate = Voxel.poseTransform(direction, pitchStep, rollStep, rollSteps);
  const turn = direction * Math.PI * 2 / Voxel.TURN_FRAMES;
  const ca = Math.cos(turn), sa = Math.sin(turn);
  const meters = hull.length * detail / length;
  const padding = mastStep ? 21 : 0;

  function point(x, y, z) {
    const across = Math.floor(x / detail) + .5 - cx;
    const along = Math.floor((y + padding) / detail) + .5 - cy;
    const up = Math.floor((z + boardDepth) / detail) + .75 - pivotZ;
    // Follow the same quantized roll, pitch and heading as the yacht sprite.
    const offset = rotate(across, along, up);
    const worldX = boat.x + offset.x * meters;
    const worldY = boat.y + offset.y * meters;
    return {x: worldX, y: worldY, screenY: worldY - (offset.z + 3 / detail) * meters / Voxel.SQUASH - boat.heave,
      height: Math.max(.12, offset.z * meters + boat.heave)};
  }
  return {point, sideX: ca, sideY: sa};
}

export function yachtBowEye(boat, pose) {
  // The tip of the stem, three slices below the bow rail.
  const {x, screenY: y} = yachtProjection(boat, pose).point(center, 95, 10);
  return {x, y};
}

export function yachtLamps(boat, pose, mode) {
  const {point, sideX, sideY} = yachtProjection(boat, pose);
  const fold = pose.mastStep * Math.PI / 16;
  const lamp = (x, y, z, rgb, side = 0) => ({...point(x, y, z), rgb, sideX: sideX * side, sideY: sideY * side});

  // Socket locations in the painted slice grid, before downsampling.
  const tipAlong = 60 - mast.y, tipUp = 74 - mastHinge;
  const masthead = lamp(center,
    Math.round(mast.y + tipAlong * Math.cos(fold) - tipUp * Math.sin(fold)),
    Math.round(mastHinge + tipUp * Math.cos(fold) + tipAlong * Math.sin(fold)), '255,243,200');
  if (mode === 'anchor') return [masthead];
  if (mode === 'moored') return [lamp(center, 37, 19, '255,196,117')];
  const lights = [
    lamp(center + 6, 84, 11, '255,95,80', 1),
    lamp(center - 6, 84, 11, '96,244,150', -1),
    lamp(center, 6, 12, '255,244,212'),
  ];
  if (mode !== 'sail') lights.unshift(masthead);
  return lights;
}

async function loadStack(name, count, columns) {
  const image = await Model.loadImage(new URL('./art/' + name + '.png', import.meta.url).href);
  return Model.fromSliceImage(image, {sliceWidth: 43, sliceHeight: 99, count, columns});
}

function readSlices(source) {
  const {w, h, count} = source.model;
  return Array.from({length: count}, (_, z) => {
    const slice = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const material = source.get(x, y, z);
      if (material) slice.push({x, y, material});
    }
    return slice;
  });
}

function turnSlice(slice, z, origin, pivotY, pose, put) {
  let previous;
  for (const {x, y, material} of slice) {
    const freeEdge = Math.min(1, Math.abs(y - origin) / 24) ** 1.35;
    const dx = (x - mast.x) * pose.camber + freeEdge * pose.luff * (.62 + .38 * Math.sin(z * .16));
    const dy = (y - origin) * pose.chord;
    const across = Math.round(center + dx * pose.cos - dy * pose.sin);
    const along = Math.round(pivotY + dx * pose.sin + dy * pose.cos);
    const color = material + pose.paletteOffset;
    if (previous && previous.x !== across && previous.y !== along) {
      put(previous.x, along, z, color);
    }
    put(across, along, z, color);
    previous = {x: across, y: along};
  }
}

export async function loadYacht() {
  const [source, headsail] = await Promise.all([
    loadStack('sailboat-detail-slices', 75, 15),
    loadStack('jib-detail-slices', 49, 13),
  ]);
  const fixed = readSlices(source);
  const main = fixed.map((slice, z) => z >= mainFoot - 2 && z < mainHead ? slice.filter(voxel => voxel.y < mast.y) : []);
  for (let z = mainFoot - 2; z < mainHead; z++) fixed[z] = fixed[z].filter(voxel => voxel.y >= mast.y);
  const jib = readSlices(headsail);
  const stay = source.get(20, 60, 40);
  const colors = source.model.materials.slice(1);
  const clothIds = new Map();
  for (let z = mainFoot; z < mainHead; z++) {
    for (const voxel of main[z]) {
      if (!clothIds.has(voxel.material)) {
        colors.push({...source.model.materials[voxel.material], lightContrast: clothContrast});
        clothIds.set(voxel.material, colors.length);
      }
      voxel.material = clothIds.get(voxel.material);
    }
  }
  const paletteOffset = colors.length;
  colors.push(...headsail.model.materials.slice(1).map(material => ({...material, lightContrast: clothContrast})));
  const frames = new Map();

  function assemble(detail, step, boomDetent, jibStep, jibDetent, boardDepth, mastStep, clothStep) {
    const padding = mastStep ? 21 : 0;
    const fold = mastStep * Math.PI / 16;
    const foldedCos = Math.cos(fold), foldedSin = Math.sin(fold);
    const fitted = Model.builder(stackWidth / detail, (source.model.h + 2 * padding) / detail, (source.model.count + boardDepth) / detail, colors);
    function put(x, y, z, color) {
      fitted.set(Math.floor(x / detail), Math.floor((y + padding) / detail), Math.floor((z + boardDepth) / detail), color);
    }
    // The centerboard swings down and aft from the middle of the hull.
    if (boardDepth) {
      const hub = source.get(21, 48, 3) || stay;
      for (let z = -boardDepth; z < 3; z++) {
        const depth = -z / boardDepth;
        const start = Math.round(42 - depth * 11);
        const end = Math.round(63 - depth * 20);
        for (let y = start; y <= end; y++) {
          for (let x = center - 1; x <= center + 1; x++) {
            put(x, y, z, y === start || y === end ? stay : hub);
          }
        }
      }
    }
    const angle = boomDetent / sailAngleSteps;
    const mainPose = {cos: Math.cos(angle), sin: Math.sin(angle),
      camber: Math.max(-1, Math.min(1, angle * 6)), chord: 1, paletteOffset: 0, luff: 1.15 * clothStep};
    const raisedMain = mainFoot + Math.round((mainHead - mainFoot) * step / sailSteps);
    for (let z = 0; z < fixed.length; z++) {
      for (const {x, y, material} of fixed[z]) {
        const isMast = mastStep && z >= mastHinge && Math.abs(x - mast.x) <= 1
          && (y >= mast.y && y <= mast.y + 2 || z >= mainHead);
        if (isMast) {
          const above = z - mastHinge, offset = y - mast.y;
          put(x + center - mast.x, Math.round(mast.y + offset * foldedCos - above * foldedSin),
            Math.round(mastHinge + above * foldedCos + offset * foldedSin), material);
        } else {
          put(x + center - mast.x, y, z, material);
        }
      }
      if (z < raisedMain && main[z].length) turnSlice(main[z], z, mast.y, mast.y, mainPose, put);
    }
    if (!mastStep) for (let z = 0; z < jib.length; z++) put(center, stayY(z), z + jibFoot, stay);
    if (jibStep) {
      const swing = jibDetent / sailAngleSteps;
      const fraction = jibStep / sailSteps;
      const jibPose = {
        cos: Math.cos(swing), sin: Math.sin(swing), paletteOffset,
        luff: -1.6 * clothStep, camber: Math.sign(swing) * Math.min(1, Math.abs(swing) * 5), chord: 0.4 + fraction * 0.6,
      };
      for (let z = 0; z < jib.length; z++) {
        const raised = Math.round(z * fraction);
        turnSlice(jib[z], raised + jibFoot, stayY(z), stayY(raised), jibPose, put);
      }
    }
    return Model.thing(fitted);
  }

  return function yachtFrame(boat, time, pixelsPerMeter) {
    const detail = pixelsPerMeter * hull.length >= 54 ? 1 : 3;
    const step = Math.round(boat.deployment * sailSteps);
    const boom = step ? Math.round((boat.boomAngle ?? 0) * sailAngleSteps) : 0;
    const jibStep = Math.round(boat.jibDeployment * sailSteps);
    // Keep the whole sail from jumping between detents as its leech luffs.
    const jibDetent = jibStep ? Math.round(boat.jibAngle * sailAngleSteps) : 0;
    const mastStep = Math.round((boat.mastFold ?? 0) * 8);
    const boardDepth = Math.abs(boat.heel) >= Math.PI / 3 ? 15 : 0;
    const luff = (step || jibStep) ? (boat.sailLuff ?? 0) : 0;
    const clothStep = Math.round(luff * (3.8 * Math.sin(time * 7.4) + 1.3 * Math.sin(time * 13.1)));
    const key = [detail, step, boom, jibStep, jibDetent, boardDepth, mastStep, clothStep].join(':');
    let rig = frames.get(key);
    if (rig) {
      frames.delete(key);
    } else {
      if (frames.size >= cacheSize) {
        const oldest = frames.keys().next().value;
        Voxel.dropModel(frames.get(oldest).model);
        frames.delete(oldest);
      }
      rig = assemble(detail, step, boom, jibStep, jibDetent, boardDepth, mastStep, clothStep);
    }
    frames.set(key, rig);

    const direction = rig.direction(boat.heading);
    const rollStep = Math.round((boat.heel + (boat.waveRoll ?? 0)) * rollSteps / (2 * Math.PI));
    const pitchStep = Math.round((boat.wavePitch ?? 0) * rollSteps / (2 * Math.PI));
    const pivotZ = (3 + boardDepth) / detail;
    const sprite = Voxel.tumble(rig.model, rig.variant, rig.palette, direction, pitchStep, rollStep, rollSteps, {pivotZ});
    const reflection = Voxel.tumble(rig.model, rig.variant, rig.palette, direction, pitchStep, rollStep, rollSteps, {pivotZ, mirrored: true});
    const metersPerVoxel = hull.length * detail / length;
    const baseline = boardDepth / detail;
    return {
      sprite: {...sprite, dy: sprite.dy + baseline},
      reflection: {...reflection, dy: reflection.dy + baseline},
      metersPerVoxel,
      pose: {detail, cx: rig.model.cx, cy: rig.model.cy, pivotZ, direction, pitchStep, rollStep, mastStep, boardDepth},
    };
  };
}
