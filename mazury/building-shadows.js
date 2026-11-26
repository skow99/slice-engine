import {Voxel} from '../src/index.js';

function hull(points) {
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  function chain(ordered) {
    const edge = [];
    for (const p of ordered) {
      while (edge.length >= 2 && turn(edge.at(-2), edge.at(-1), p) <= 0) edge.pop();
      edge.push(p);
    }
    edge.pop();
    return edge;
  }
  return [...chain(points), ...chain(points.reverse())];
}

export function projectBuildingShadow(building, light, liftAt) {
  const {x, y, anchorY, model, scale, heading, heightScale = 1} = building;
  const base = anchorY - y;
  const halfWidth = model.model.w * scale / 2;
  const halfLength = model.model.h * scale / 2;
  const height = model.model.count * scale * heightScale / Voxel.SQUASH;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const [dx, dy] = light;
  const points = [];
  function cast(along, across, z) {
    const startX = x + along * cos - across * sin;
    const startY = anchorY + along * sin + across * cos;
    let above = z;
    // Refit the shadow to the slope at its landing point.
    for (let step = 0; step < 3; step++) {
      const lift = liftAt(startX + dx * above, startY + dy * above);
      above = (above + Math.max(0, base + z - lift)) / 2;
    }
    const endX = startX + dx * above;
    const endY = startY + dy * above;
    points.push({x: endX, y: endY - liftAt(endX, endY)});
  }
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      cast(end * halfLength * .87, side * halfWidth * .86, 0);
      cast(end * halfLength * .96, side * halfWidth * .96, height * .56);
    }
    cast(end * halfLength * .95, 0, height * .86);
  }
  return hull(points);
}

export function createBuildingShadows(liftAt) {
  let light;
  let outlines = new WeakMap();
  return (context, buildings, strength) => {
    if (!strength) return;
    if (light !== Voxel.lighting) {
      light = Voxel.lighting;
      outlines = new WeakMap();
    }
    context.save();
    context.fillStyle = '#192a37';
    context.strokeStyle = context.fillStyle;
    context.lineJoin = 'round';
    context.lineWidth = .9;
    for (const building of buildings) {
      let outline = outlines.get(building);
      if (!outline) {
        outline = projectBuildingShadow(building, [Voxel.SHADOW_X, Voxel.SHADOW_Y / Voxel.SQUASH], liftAt);
        outlines.set(building, outline);
      }
      context.beginPath();
      for (const {x, y} of outline) context.lineTo(x, y);
      context.closePath();
      context.globalAlpha = .10 * strength;
      context.stroke();
      context.globalAlpha = .29 * strength;
      context.fill();
    }
    context.restore();
  };
}
