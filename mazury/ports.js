import {approach, berth, boardingPoint, northMoorings, polygonContact} from './harbor.js';
import {warningFlash} from './weather.js';

const standardSites = [
  ['shipping', 'Żegluga Mazurska · Giżycko', 3976, 1703, 1, 1],
  ['lok', 'Lowen Marina · Giżycko', 3724, 1702, 1, 1],
  ['bystry', 'Bystry', 4502, 1917, 13, 1],
  ['pttk', 'PTTK Wilkasy', 3738, 2122, 0, 1],
  ['azs', 'AZS Wilkasy', 3757, 2142, 0, -1],
  ['resort', 'Resort Niegocin', 3819, 2191, 0, 1],
  ['strzelce', 'Strzelce', 4033, 2350, 0, 1],
  ['rydzewo', 'Marina Lester · Rydzewo', 4056, 2475, 20, 1],
  ['bogaczewo', 'Bogaczewo', 3966, 2486, 0, -1],
  ['tajty', 'Port Tajty', 3659, 1993, 8, 1],
  ['piekna-gora', 'Piękna Góra', 3577, 1787, 15, 1],
  ['ruda', 'Ruda landing', 4545, 2322, 8, 1],
  ['kleszczewo', 'Port Wieczorek · Kleszczewo', 4505, 2454, 1, -1],
];

export const ports = [
  {id: 'ekomarina', name: 'Ekomarina · Giżycko', berth, approach, boardingPoint, extraMoorings: northMoorings},
  ...standardSites.map(([id, name, x, y, bearing, side]) => {
    const outward = bearing * Math.PI / 12;
    const cos = Math.cos(outward), sin = Math.sin(outward);
    const at = (along, across = 0) => ({x: x + along * cos - across * sin, y: y + along * sin + across * cos});
    const target = {...at(17, side * 4.3), heading: outward + Math.PI, length: 13, width: 5};
    const dock = [at(-2, -1.45), at(23, -1.45), at(23, 1.45), at(-2, 1.45)];
    const approach = [at(39, side * 4.3), at(29, side * 4.3)];
    const sternBerth = {
      berth: {...at(17, -side * 6.35), heading: outward - side * Math.PI / 2, length: 12, width: 5},
      approach: [approach[0], at(34, -side * 17), at(17, -side * 17)],
      boardingPoint: at(17, -side * .5),
      sternTo: true,
    };
    const extraMoorings = [sternBerth, ...[8, 23].map(along => ({
      berth: {...sternBerth.berth, ...at(along, -side * 6.35)},
      approach: [approach[0], at(34, -side * 17), at(along, -side * 17)],
      boardingPoint: at(Math.min(along, 22.5), -side * .5),
      sternTo: true,
    }))];
    return {id, name, berth: target, approach, sternBerth, extraMoorings,
      boardingPoint: at(17), shore: at(0), dock};
  }),
];

export function portNear(point, range = 45) {
  let nearest;
  for (const port of ports) {
    let distance = Math.hypot(point.x - port.berth.x, point.y - port.berth.y);
    if (port.id === 'ekomarina' && point.x > 4040 && point.x < 4270 && point.y < 1810) {
      for (const {berth} of northMoorings) distance = Math.min(distance, Math.hypot(point.x - berth.x, point.y - berth.y));
    }
    if (distance >= range) continue;
    range = distance;
    nearest = port;
  }
  return nearest;
}

export function portContact(point) {
  let closest;
  for (const port of ports) {
    if (!port.dock || Math.hypot(point.x - port.shore.x, point.y - port.shore.y) > 28) continue;
    const edge = polygonContact(point, port.dock, false);
    if (edge.distance < (closest?.distance ?? Infinity)) closest = edge;
  }
  return closest;
}

export function walkAtPort(port, walker, dx, dy, depth) {
  const canWalk = point => polygonContact(point, port.dock, false).distance <= 0
    || (Math.hypot(point.x - port.shore.x, point.y - port.shore.y) <= 5 && depth(point.x, point.y) < 0);
  for (const point of [{x: walker.x + dx, y: walker.y + dy}, {x: walker.x + dx, y: walker.y}, {x: walker.x, y: walker.y + dy}]) {
    if (!canWalk(point)) continue;
    Object.assign(walker, point);
    return;
  }
}

export function drawPorts(context, view, waterMask) {
  for (const port of ports) {
    if (!port.dock) continue;
    const at = view.toScreen(port.shore);
    if (at.x < -30 * view.scale || at.y < -30 * view.scale || at.x > view.w + 30 * view.scale || at.y > view.h + 30 * view.scale) continue;
    const corners = port.dock.map(view.toScreen);
    for (const target of [context, waterMask]) {
      target.save();
      if (target === waterMask) target.globalCompositeOperation = 'destination-out';
      target.beginPath();
      for (const p of corners) target.lineTo(p.x, p.y);
      target.closePath();
      target.fillStyle = '#817561';
      target.strokeStyle = '#514a40';
      target.lineWidth = .35 * view.scale;
      target.fill();
      if (target === context) target.stroke();
      target.restore();
    }
    context.save();
    const d = view.toScreen(port.boardingPoint);
    context.translate(d.x, d.y);
    context.rotate(port.berth.heading);
    context.strokeStyle = '#b8a489';
    context.lineWidth = .12 * view.scale;
    context.beginPath();
    for (let plank = -5; plank < 18; plank += .8) {
      context.moveTo(plank * view.scale, -1.3 * view.scale);
      context.lineTo(plank * view.scale, 1.3 * view.scale);
    }
    context.stroke();
    context.restore();
  }
}

const towers = [
  // Giżycko and Wilkasy are gameplay placements. The island is a surveyed warning site.
  {x: 4291, y: 1728},
  {x: 3734, y: 2122},
  {x: 4356, y: 2166},
];

export function drawWarningTowers(context, view, liftAt, clock, rate) {
  const glow = warningFlash(clock, rate);
  for (const tower of towers) {
    const at = view.toScreen({x: tower.x, y: tower.y - liftAt(tower.x, tower.y)});
    const s = view.scale;
    if (at.x < -14 || at.x > view.w + 14 || at.y < -14 || at.y > view.h + 20 * s) continue;
    context.save();
    context.translate(at.x, at.y);
    context.scale(s, s);
    context.lineWidth = Math.max(.16, .65 / s);
    context.strokeStyle = '#465356';
    context.beginPath();
    context.moveTo(-1.55, 0);
    context.lineTo(-.35, -14.8);
    context.lineTo(.35, -14.8);
    context.lineTo(1.55, 0);
    for (let y = 0; y < 14; y += 2) {
      const w = 1.55 - y * .078;
      context.moveTo(-w, -y);
      context.lineTo(w - .15, -y - 2);
      context.moveTo(w, -y);
      context.lineTo(-w + .15, -y - 2);
    }
    context.stroke();
    context.fillStyle = '#4c6670';
    context.fillRect(-1.3, -12.15, 2, .7);
    context.fillStyle = glow ? '#ffe494' : '#8e7852';
    context.fillRect(-.55, -15.45, 1.1, .75);
    if (glow) {
      const light = context.createRadialGradient(0, -15.05, 0, 0, -15.05, 2.5);
      light.addColorStop(0, '#ffe397e8');
      light.addColorStop(1, '#ffc44700');
      context.fillStyle = light;
      context.fillRect(-2.5, -17.55, 5, 5);
    }
    context.restore();
  }
}
