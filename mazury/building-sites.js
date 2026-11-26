import {Model} from '../src/index.js';
import {landCover} from './lake.js';

const cellSize = 8;
export const foundationRise = 0.48;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const cell = value => Math.floor(value / cellSize);

function findRoad(stoop, heading, map) {
  if (!map) return null;
  const offsets = [0, 0.32, -0.32, 0.64, -0.64, 0.95, -0.95, 1.32, -1.32];
  for (let distance = 1.5; distance <= 10.5; distance += 0.75) {
    for (const offset of offsets) {
      const dx = Math.cos(heading + offset) * distance;
      const dy = Math.sin(heading + offset) * distance;
      if (map.coverAt(stoop.x + dx, stoop.y + dy) !== landCover.road) continue;
      const dry = [0.2, 0.4, 0.6, 0.8, 1].every(t => map.waterDepth(stoop.x + dx * t, stoop.y + dy * t) < 0);
      if (dry) return {dx, dy, lengthSquared: distance * distance};
    }
  }
  return null;
}

// Fit a small terrace around a rendered footprint. The original relief is
// retained beyond the yard and still drives navigation around the shore.
export function createBuildingSites(buildings, map) {
  const rows = new Map();
  for (const building of buildings) {
    const {w, h} = building.model.model;
    const site = {
      x: building.x,
      y: building.anchorY,
      lift: building.anchorY - building.y - foundationRise,
      forwardX: Math.cos(building.heading),
      forwardY: Math.sin(building.heading),
      halfWidth: w * building.scale * 0.445,
      halfLength: h * building.scale * 0.45,
      flowers: Model.hash(Math.floor(building.x), Math.floor(building.anchorY), 89),
    };
    const step = site.halfLength + 1.1;
    site.stoop = {x: site.x - site.forwardX * step, y: site.y - site.forwardY * step};
    site.road = findRoad(site.stoop, building.heading + Math.PI, map);
    const extent = Math.max(
      Math.hypot(site.halfWidth + 3.7, site.halfLength + 4.8),
      step + Math.sqrt(site.road?.lengthSquared ?? 0) + 1.1,
    );
    for (let row = cell(site.y - extent); row <= cell(site.y + extent); row++) {
      if (!rows.has(row)) rows.set(row, new Map());
      const columns = rows.get(row);
      for (let col = cell(site.x - extent); col <= cell(site.x + extent); col++) {
        if (!columns.has(col)) columns.set(col, []);
        columns.get(col).push(site);
      }
    }
  }
  return {row: y => rows.get(cell(y))};
}

export function sampleBuildingSite(row, x, y, grain) {
  const candidates = row?.get(cell(x));
  if (!candidates) return;
  let chosen;
  for (const site of candidates) {
    const dx = x - site.x;
    const dy = y - site.y;
    const along = dx * site.forwardX + dy * site.forwardY;
    const cross = -dx * site.forwardY + dy * site.forwardX;
    const across = Math.abs(cross);
    const side = Math.max(0, across - site.halfWidth);
    const end = Math.max(0, Math.abs(along) - site.halfLength);
    const outside = Math.hypot(side, end);
    const grade = 1 - smooth((outside - 0.58) / 3.1);
    const garden = 1 - smooth((outside - grain * 0.55) / 3.65);
    // The stack templates place the door on the negative end of the ridge.
    // A narrow worn path extends from that end and dissolves into the yard.
    const fromDoor = -along - site.halfLength;
    const landing = 1 - smooth(Math.hypot(
      Math.max(0, across - 0.9), Math.max(0, Math.abs(fromDoor - 0.6) - 0.65),
    ) / 0.65);
    const doorPath = fromDoor > 0
      ? (1 - smooth((across - 0.55 - grain * 0.16) / 0.65)) * (1 - smooth((fromDoor - 2.5) / 2.2))
      : 0;
    let path = Math.max(landing, doorPath);
    if (site.road) {
      const ax = x - site.stoop.x;
      const ay = y - site.stoop.y;
      const {dx, dy, lengthSquared} = site.road;
      const fraction = clamp((ax * dx + ay * dy) / lengthSquared);
      const distance = Math.hypot(ax - dx * fraction, ay - dy * fraction);
      path = Math.max(path, 1 - smooth((distance - 0.3 - grain * 0.2) / 0.52));
    }
    const foundation = 1 - smooth((outside - 0.1) / 0.58);
    const contact = 1 - smooth((outside - 0.2) / 1.85);
    const plantedSide = site.flowers < 0.34 ? -1 : 1;
    const bed = site.flowers > 0.72 || fromDoor < 0.12
      ? 0 : 1 - smooth(Math.hypot((cross * plantedSide - 1.43) / 0.8, (fromDoor - 0.72) / 0.87));
    const influence = Math.max(garden, path * 0.82, bed);
    if (influence <= (chosen?.influence ?? 0)) continue;
    chosen = {grade, garden, path, foundation, contact, bed, influence, lift: site.lift};
  }
  return chosen;
}

export function gradeAroundBuilding(lift, site) {
  return site ? lift + (site.lift - lift) * site.grade : lift;
}
