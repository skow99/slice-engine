// Ekomarina geometry traced from the Geoportal 0.5 m orthophoto crop.
// Source pixels use an EPSG:2180 extent of 681050,688550 – 681800,689100.
const west = 3650;
const north = 1400;
const metersPerSourcePixel = 0.5;
const point = ([x, y]) => ({x: west + x * metersPerSourcePixel, y: north + y * metersPerSourcePixel});
const ring = points => points.map(point);

export const harborScale = {x: 4075, y: 1750, radius: 320};

export const harborBounds = {west, north, east: west + 750, south: north + 550};

export const waterAreas = [
  ring([[0, 566], [98, 569], [173, 575], [243, 597], [304, 625], [334, 662],
    [351, 771], [593, 768], [659, 588], [755, 607], [846, 622], [946, 645],
    [1062, 666], [1199, 699], [1304, 725], [1350, 724], [1368, 712], [1500, 752],
    [1500, 1100], [0, 1100]]),
  ring([[385, 433], [476, 430], [580, 453], [632, 548], [638, 577],
    [585, 839], [481, 813], [384, 781]]),
];

// Compact marina on the surveyed shore. Pontoons, fairways and berth
// dimensions are in the same metres as the yacht and the walker.
export const marina = {...point([1260, 731]), radius: 56};
export const marinaApron = ring([[1209, 665], [1321, 692], [1312, 727], [1201, 701]]);

export const harborStructures = [
  {style: 'quay', outline: ring([[1207, 692], [1314, 717], [1311, 727], [1205, 703]])},
];

const fingers = [
  [[1230, 703], [1219, 747], 4.5],
  [[1260, 710], [1249, 760], 4.5],
  [[1290, 716], [1279, 763], 4.5],
];

for (const [start, end, breadth] of fingers) {
  const a = point(start);
  const b = point(end);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = (a.y - b.y) * breadth * 0.25 / length;
  const ny = (b.x - a.x) * breadth * 0.25 / length;
  harborStructures.push({
    style: 'pontoon', centerline: [a, b], outline: [
      {x: a.x + nx, y: a.y + ny}, {x: b.x + nx, y: b.y + ny},
      {x: b.x - nx, y: b.y - ny}, {x: a.x - nx, y: a.y - ny},
    ],
  });
}

const [inner, outer] = harborStructures[2].centerline;
const heading = Math.atan2(inner.y - outer.y, inner.x - outer.x);
const along = (position, meters, angle = heading) => ({
  x: position.x + Math.cos(angle) * meters,
  y: position.y + Math.sin(angle) * meters,
});
export const boardingPoint = along(outer, 8);
export const berth = {...along(boardingPoint, 3.8, heading + Math.PI / 2), heading, length: 12, width: 4.5};
export const approach = [point([1306, 910]), point([1287, 844]), ...[-32, -15].map(distance => along(berth, distance))];
export const harborDeparture = {
  ...point([1309, 945]), heading: Math.atan2(-35, -3),
};

function quayBetween(a, b, breadth) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const side = angle + Math.PI / 2;
  harborStructures.push({style: 'quay', outline: [
    along(a, breadth / 2, side), along(b, breadth / 2, side),
    along(b, -breadth / 2, side), along(a, -breadth / 2, side),
  ]});
  return angle;
}

// A floating quay and shore gangway west of the original Ekomarina fairway.
const westQuay = {x: 4065, y: 1745};
const eastQuay = {x: 4247, y: 1766};
const quayHeading = quayBetween(westQuay, eastQuay, 3.6);
quayBetween({x: 4068, y: 1705}, along(westQuay, 3, quayHeading), 2.5);
const quayNormal = quayHeading + Math.PI / 2;
export const northMoorings = Array.from({length: 20}, (_, i) => {
  const head = along(westQuay, 8.5 + i * 8.65, quayHeading);
  const at = distance => along(head, distance, quayNormal);
  return {
    berth: {...at(7.45), heading: quayNormal, length: 11, width: 5},
    approach: [at(45), at(23)],
    lane: 'west-quay-' + Math.floor(i / 3),
    boardingPoint: at(.75), sternTo: true,
  };
});

export function inMarina(x, y) {
  return Math.hypot(x - marina.x, y - marina.y) < marina.radius - 12;
}

export function inHarbor(x, y) {
  return x >= harborBounds.west && y >= harborBounds.north && x < harborBounds.east && y < harborBounds.south
    && Math.hypot(x - harborScale.x, y - harborScale.y) <= harborScale.radius;
}

function inside({x, y}, outline) {
  let yes = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) yes = !yes;
  }
  return yes;
}

export function polygonContact(position, outline, waterInside) {
  const {x, y} = position;
  const wet = inside(position, outline) === waterInside;
  let best = Infinity;
  let dx = 0;
  let dy = 0;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j];
    const b = outline[i];
    // The edges of the orthophoto crop are open where the lake continues.
    if (waterInside && ((a.x === b.x && (a.x === harborBounds.west || a.x === harborBounds.east))
      || (a.y === b.y && (a.y === harborBounds.north || a.y === harborBounds.south)))) continue;
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (y - a.y) * sy) / (sx * sx + sy * sy)));
    const ex = x - (a.x + sx * t);
    const ey = y - (a.y + sy * t);
    const square = ex * ex + ey * ey;
    if (square >= best) continue;
    best = square;
    dx = ex;
    dy = ey;
  }
  const distance = Math.sqrt(best);
  const side = wet ? 1 : -1;
  if (!distance) {
    // Sample either side at the next movement step, where the normal is defined.
    return {distance: 0, nx: 0, ny: 0};
  }
  return {distance: side * distance, nx: side * dx / distance, ny: side * dy / distance};
}

export function harborShoreClearance(position) {
  let closest = {distance: -Infinity};
  for (const outline of waterAreas) {
    const edge = polygonContact(position, outline, true);
    if (edge.distance > closest.distance) closest = edge;
  }
  return closest;
}

export function harborStructureClearance(position) {
  let closest = {distance: Infinity};
  for (const {outline} of harborStructures) {
    const edge = polygonContact(position, outline, false);
    if (edge.distance < closest.distance) closest = edge;
  }
  return closest;
}

export function harborClearance(position) {
  const shore = harborShoreClearance(position);
  const structure = harborStructureClearance(position);
  return shore.distance <= structure.distance ? shore : structure;
}

export function harborWaterAt(x, y) {
  const position = {x, y};
  return waterAreas.some(ring => inside(position, ring))
    && harborStructures.every(({outline}) => !inside(position, outline));
}

export function harborWalkableAt(x, y) {
  if (!inHarbor(x, y)) return false;
  const position = {x, y};
  return harborStructures.some(({outline}) => inside(position, outline))
    || (inside(position, marinaApron) && !harborWaterAt(x, y));
}

export function moveWalker(walker, dx, dy) {
  if (harborWalkableAt(walker.x + dx, walker.y + dy)) {
    walker.x += dx;
    walker.y += dy;
    return;
  }
  const pontoon = harborStructures.find(({centerline, outline}) => centerline && inside(walker, outline));
  if (pontoon) {
    const [a, b] = pontoon.centerline;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const tx = (b.x - a.x) / length;
    const ty = (b.y - a.y) / length;
    const along = dx * tx + dy * ty;
    const x = walker.x + tx * along;
    const y = walker.y + ty * along;
    if (Math.abs(along) > 0.45 * Math.hypot(dx, dy) && harborWalkableAt(x, y)) {
      walker.x = x;
      walker.y = y;
      return;
    }
  }
  if (harborWalkableAt(walker.x + dx, walker.y)) walker.x += dx;
  if (harborWalkableAt(walker.x, walker.y + dy)) walker.y += dy;
}
