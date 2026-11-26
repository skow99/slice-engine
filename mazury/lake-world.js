import {createRelief} from './relief.js';
import {harborBounds, harborScale, harborShoreClearance, inHarbor} from './harbor.js';
import {landCover} from './lake.js';
import {survey} from './map/survey.js';

// Keep the harbour in metres and compress the broad lake around it. Each
// radial band is continuous, invertible, and preserves the shoreline topology.
const {x: centerX, y: centerY, radius} = harborScale;
const bands = [
  {start: radius, gameStart: radius, factor: 0.5},
  {start: radius + 24, gameStart: radius + 12, factor: 0.2},
  {start: radius + 64, gameStart: radius + 20, factor: 1 / 18},
];

function project(x, y, inverse) {
  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius) return {x, y};
  const [first, middle, outer] = bands;
  const band = distance >= (inverse ? outer.gameStart : outer.start) ? outer
    : distance >= (inverse ? middle.gameStart : middle.start) ? middle : first;
  const nextDistance = inverse
    ? band.start + (distance - band.gameStart) / band.factor
    : band.gameStart + (distance - band.start) * band.factor;
  const scale = nextDistance / distance;
  return {x: centerX + dx * scale, y: centerY + dy * scale};
}

export const toGame = (x, y) => project(x, y, false);
export const toSurvey = (x, y) => project(x, y, true);

const originalWidth = survey.width * survey.metersPerPixel;
const originalHeight = survey.height * survey.metersPerPixel;
export const worldBounds = {
  west: Math.floor(toGame(0, centerY).x),
  north: Math.floor(toGame(centerX, 0).y),
  east: Math.ceil(toGame(originalWidth, centerY).x),
  south: Math.ceil(toGame(centerX, originalHeight).y),
};

export function createWorldMap(lake) {
  const unit = survey.metersPerPixel;
  function groundSample(x, y, sample) {
    const source = toSurvey(x, y);
    return sample(source.x / unit, source.y / unit);
  }
  const mapDepth = (x, y) => groundSample(x, y, lake.waterDepth) * unit;
  const harborDepths = new Map();
  const harborWidth = harborBounds.east - harborBounds.west;
  function shoreSample(col, row) {
    const key = (row - harborBounds.north) * (harborWidth + 1) + col - harborBounds.west;
    if (!harborDepths.has(key)) {
      harborDepths.set(key, harborShoreClearance({x: col, y: row}).distance);
    }
    return harborDepths.get(key);
  }
  function shoreDepth(x, y) {
    const col = Math.floor(x);
    const row = Math.floor(y);
    const u = x - col;
    const v = y - row;
    const upper = shoreSample(col, row) * (1 - u) + shoreSample(col + 1, row) * u;
    const lower = shoreSample(col, row + 1) * (1 - u) + shoreSample(col + 1, row + 1) * u;
    const depth = upper * (1 - v) + lower * v;
    // Use the original contour at the waterline, including tight bends.
    return Math.abs(depth) < 1.5 ? harborShoreClearance({x, y}).distance : depth;
  }
  function terrainDepth(x, y, mapped) {
    if (!inHarbor(x, y)) return mapped;
    const distance = Math.min(harborScale.radius - Math.hypot(x - harborScale.x, y - harborScale.y),
      x - harborBounds.west, harborBounds.east - x, y - harborBounds.north, harborBounds.south - y);
    const blend = Math.min(1, distance / 12);
    return mapped * (1 - blend) + shoreDepth(x, y) * blend;
  }
  const depthAt = (x, y) => inHarbor(x, y) ? terrainDepth(x, y, mapDepth(x, y)) / unit
    : groundSample(x, y, lake.depthAt);
  const waterDepth = (x, y) => terrainDepth(x, y, mapDepth(x, y));

  function shoreContact({x, y, r}) {
    const depth = waterDepth(x, y);
    if (depth >= r * 18 + 5) return null;
    const step = 0.35;
    const dx = (waterDepth(x + step, y) - waterDepth(x - step, y)) / (2 * step);
    const dy = (waterDepth(x, y + step) - waterDepth(x, y - step)) / (2 * step);
    const slope = Math.hypot(dx, dy);
    if (slope < 0.001 || depth / slope >= r) return null;
    return {nx: dx / slope, ny: dy / slope, depth: r - depth / slope};
  }

  const relief = createRelief({
    waterLevel: survey.waterLevel ?? lake.elevationAt(1500, 1550),
    highestPoint: survey.landElevationRange[1],
  });
  const elevationAt = (x, y) => groundSample(x, y, lake.elevationAt);
  return {
    relief,
    reliefAt: (x, y) => relief.lift(elevationAt(x, y), waterDepth(x, y)),
    coverAt: (x, y) => groundSample(x, y, lake.coverAt),
    elevationAt,
    depthAt,
    waterDepth,
    groundAt(x, y) {
      const source = toSurvey(x, y);
      const sx = source.x / unit;
      const sy = source.y / unit;
      const depth = terrainDepth(x, y, lake.waterDepth(sx, sy) * unit);
      if (depth >= 0) return {depth};
      const cover = lake.coverAt(sx, sy);
      return {depth, cover: cover === landCover.water ? landCover.grass : cover, z: lake.elevationAt(sx, sy)};
    },
    shoreContact,
  };
}
