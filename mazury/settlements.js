import {Model, Voxel} from '../src/index.js';
import {foundationRise} from './building-sites.js';
import {inMarina} from './harbor.js';
import {toGame} from './lake-world.js';
import {buildings} from './map/buildings.js';

const buildingFrames = 16;

async function loadStack(file, sliceWidth, sliceHeight, count, columns) {
  const image = await Model.loadImage(new URL('./art/' + file, import.meta.url).href);
  return Model.thing(Model.fromSliceImage(image, {sliceWidth, sliceHeight, count, columns}), {frames: buildingFrames});
}

function slateRoof(cottage) {
  const palette = cottage.palette.map(color => {
    if (!color) return color;
    const [r, g, b] = color;
    if (r - g < 42 || g - b > 46) return color;
    return [r * 0.47 + 30, r * 0.45 + 38, r * 0.42 + 43].map(Math.round);
  });
  return Model.thing(cottage.model, {palette, variant: 'slate', frames: buildingFrames});
}

function buildingArt(building, coarse) {
  const {model, variant, palette, frames} = building;
  const options = {frames, override: model.vox, only: true};
  return {
    ...building, coarse,
    sprite(heading, spacing = 1) {
      // Let material and scene light define the edges, as they do for the trees.
      return Voxel.sprite(model, variant, palette, building.direction(heading), {...options, spacing});
    },
  };
}

export async function loadCottages() {
  const [cottage, boathouse, smallCottage, smallBoathouse] = await Promise.all([
    loadStack('cottage-detail-slices.png', 63, 87, 55, 18),
    loadStack('boathouse-detail-slices.png', 108, 93, 75, 12),
    loadStack('cottage-slices.png', 21, 29, 19, 6),
    loadStack('boathouse-slices.png', 36, 31, 24, 6),
  ]);
  return [
    buildingArt(cottage, buildingArt(smallCottage)),
    buildingArt(slateRoof(cottage), buildingArt(slateRoof(smallCottage))),
    buildingArt(boathouse, buildingArt(smallBoathouse)),
  ];
}

export function sceneryModel(item, coarse) {
  const model = coarse ? item.model.coarse ?? item.model : item.model;
  return {model, scale: item.scale * item.model.model.w / model.model.w};
}

function buildingClearsShore(map, building) {
  const {x, anchorY, heading, scale, heightScale} = building;
  const {model: {w, h, count}, coarse} = building.model;
  // Leave room for the foundation edge and sample inside the footprint as
  // well as along its perimeter. The bank can curve under the building.
  const buffer = 0.75;
  const maxSampleSpacing = 0.5;
  const halfLength = h * scale / 2 + buffer;
  const halfWidth = w * scale / 2 + buffer;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([along, across]) => ({
    x: along * halfLength * cos - across * halfWidth * sin,
    y: along * halfLength * sin + across * halfWidth * cos,
  }));
  const halfX = Math.max(...corners.map(point => point.x));
  const columns = Math.ceil(2 * halfX / maxSampleSpacing);
  const layers = Math.max(count, coarse ? coarse.model.count * w / coarse.model.w : count);
  // Both terrain relief and the visible stack project north on the screen.
  // Check that swept silhouette too, so roofs stay clear of the water.
  const northReach = anchorY - building.y + layers * scale * heightScale / Voxel.SQUASH;
  for (let col = 0; col <= columns; col++) {
    const offsetX = halfX * (2 * col / columns - 1);
    let north = Infinity;
    let south = -Infinity;
    for (let edge = 0; edge < corners.length; edge++) {
      const a = corners[edge];
      const b = corners[(edge + 1) % corners.length];
      if (offsetX < Math.min(a.x, b.x) || offsetX > Math.max(a.x, b.x)) continue;
      const fraction = b.x === a.x ? 0 : (offsetX - a.x) / (b.x - a.x);
      const edgeY = a.y + (b.y - a.y) * fraction;
      north = Math.min(north, edgeY);
      south = Math.max(south, edgeY);
    }
    north -= northReach;
    const rows = Math.max(1, Math.ceil((south - north) / maxSampleSpacing));
    for (let row = 0; row <= rows; row++) {
      if (map.waterDepth(x + offsetX, anchorY + north + (south - north) * row / rows) >= 0) return false;
    }
  }
  return true;
}

// Fit representative buildings to the playable shoreline. The export is ordered
// by footprint area, so homes and larger buildings win over nearby outbuildings.
export function placeBuildings(map, models) {
  const gridSize = 14;
  const grid = new Map();
  const rowAt = (x, y) => grid.get(Math.floor(x / gridSize) + ':' + Math.floor(y / gridSize));
  const result = [];
  for (const [east, south, length, width, bearing, floors] of buildings) {
    const {x, y} = toGame(east, south);
    if (inMarina(x, y) || map.waterDepth(x, y) > -2) continue;
    const variation = Model.hash(Math.floor(east), Math.floor(south));
    const model = models[variation < 0.12 ? 2 : variation < 0.43 ? 1 : 0];
    const size = Math.max(4.6, Math.min(9.8, Math.sqrt(length * width) * 0.54 + 1.3));
    const scale = size / Math.max(model.model.w, model.model.h);
    const spacing = size * 0.52 + 1.1;
    let crowded = false;
    for (let dx = -gridSize; dx <= gridSize && !crowded; dx += gridSize) {
      for (let dy = -gridSize; dy <= gridSize && !crowded; dy += gridSize) {
        crowded = rowAt(x + dx, y + dy)?.some(other =>
          Math.hypot(other.x - x, other.anchorY - y) < other.spacing + spacing);
      }
    }
    if (crowded) continue;
    const surveyedHeading = bearing * Math.PI / 180 + (variation > 0.5 ? Math.PI : 0);
    // Match the sprite's discrete rotation so the terrace and roof agree.
    const frame = Voxel.directionOf(surveyedHeading - Math.PI / 2, buildingFrames);
    const heading = frame * (2 * Math.PI / buildingFrames) + Math.PI / 2;
    const building = {
      x, y: y - map.reliefAt(x, y) - foundationRise, anchorY: y, model, heading, scale, spacing,
      heightScale: 0.91 + Math.min(2, floors - 1) * 0.12,
    };
    if (!buildingClearsShore(map, building)) continue;
    const key = Math.floor(x / gridSize) + ':' + Math.floor(y / gridSize);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(building);
    result.push(building);
  }
  return {
    buildings: result,
    nearBuilding(x, y) {
      for (let dx = -gridSize; dx <= gridSize; dx += gridSize) {
        for (let dy = -gridSize; dy <= gridSize; dy += gridSize) {
          if (rowAt(x + dx, y + dy)?.some(b => Math.hypot(b.x - x, b.anchorY - y) < b.spacing + 1.5)) return true;
        }
      }
      return false;
    },
  };
}
