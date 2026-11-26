import {angleDelta, bearing, distance, offset} from './fleet-navigation.js';

export const entryRange = 24;
export const registrationSeconds = 120;
export const regattas = [
  {id: 'ekomarina', name: 'Ekomarina Sprint', difficulty: 'Easy', color: '#ffd184',
    buoy: {x: 4264, y: 1951}, centers: [{x: 4202, y: 2020}, {x: 4155, y: 2075}],
    marks: [[70, 12], [12, -74], [-65, -37]], start: [-44, 17], finish: [-21, 9],
    width: 66, gateWidth: 22, crews: 3, countdown: 24, limit: 360, closing: 125, pace: 4.35},
  {id: 'wilkasy', name: 'Wilkasy Cup', difficulty: 'Intermediate', color: '#94f0dc',
    buoy: {x: 3900, y: 2070}, centers: [{x: 3985, y: 2005}, {x: 4020, y: 2015}, {x: 4060, y: 2020}, {x: 3910, y: 1980}],
    marks: [[92, 19], [55, -84], [-32, -106], [-95, -30]], start: [-65, 20], finish: [-36, 21],
    width: 84, gateWidth: 19, crews: 5, countdown: 22, limit: 540, closing: 160, pace: 4.7},
  {id: 'strzelce', name: 'Strzelce Challenge', difficulty: 'Hard', color: '#ffc0ed',
    buoy: {x: 4180, y: 2302}, centers: [{x: 4165, y: 2200}, {x: 4180, y: 2175}],
    marks: [[112, 27], [76, -94], [-23, -127], [-109, -79], [-113, 4]], start: [-75, 30], finish: [-53, 47],
    width: 104, gateWidth: 17, crews: 7, countdown: 19, limit: 690, closing: 180, pace: 5.15},
];

export const stagingDepth = 52;

function line(center, heading, width) {
  const across = heading + Math.PI / 2;
  return {center, heading, width, a: offset(center, across, -width / 2), b: offset(center, across, width / 2)};
}

export function linePosition(point, {center, heading}) {
  const x = point.x - center.x, y = point.y - center.y;
  return {along: x * Math.cos(heading) + y * Math.sin(heading), across: -x * Math.sin(heading) + y * Math.cos(heading)};
}

// Interpolate the intersection so a boat crossing between two fixed ticks still counts.
export function lineCrossing(previous, current, gate) {
  const a = linePosition(previous, gate), b = linePosition(current, gate);
  if (Math.abs(a.along) < 1e-8) a.along = 0;
  if (Math.abs(b.along) < 1e-8) b.along = 0;
  if (a.along > 0 || b.along < 0 || b.along <= a.along) return null;
  const fraction = -a.along / (b.along - a.along);
  const across = a.across + (b.across - a.across) * fraction;
  return Math.abs(across) <= gate.width / 2 ? fraction : null;
}

function makeRegattaCourse(windFrom, event, center) {
  const at = (forward, across) => offset(offset(center, windFrom, forward), windFrom + Math.PI / 2, across);
  const start = line(at(...event.start), windFrom + .84, event.width);
  const centers = event.marks.map(point => at(...point));
  const finishAt = at(...event.finish);
  const finish = line(finishAt, bearing(centers.at(-1), finishAt), 44);
  const marks = centers.map((mark, index) => {
    const incoming = bearing(centers[index - 1] ?? start.center, mark);
    const outgoing = bearing(mark, centers[index + 1] ?? finish.center);
    const heading = incoming + angleDelta(outgoing, incoming) / 2;
    // The gate extends outwards from the mark. Cross its near end with the buoy to port.
    const gate = line(offset(mark, heading + Math.PI / 2, 2 + event.gateWidth / 2), heading, event.gateWidth);
    return {mark, gate, approach: offset(gate.center, heading, -12), exit: offset(gate.center, heading, 13)};
  });
  const staging = [start.a, start.b, offset(start.b, start.heading, -stagingDepth), offset(start.a, start.heading, -stagingDepth)];
  return {start, finish, marks, staging, ready: offset(start.center, start.heading, -28)};
}

export function findRegattaCourse(windFrom, world, event = regattas[0]) {
  const clear = point => world.waterDepth(point.x, point.y) > 0
    && !world.shoreContact({...point, r: 9}) && (world.portContact?.(point)?.distance ?? Infinity) > 9;
  // Allow a small bias rather than move the course into shallow water.
  for (const adjustment of [0, .17, -.17, .34, -.34]) for (const center of event.centers) {
    const course = makeRegattaCourse(windFrom + adjustment, event, center);
    const {start, marks, finish, staging} = course;
    const route = [start.center, ...marks.map(mark => mark.gate.center), finish.center];
    const transects = [[start.a, start.b], [finish.a, finish.b], ...staging.map((point, i) => [point, staging[(i + 1) % 4]]),
      ...marks.flatMap(mark => [[mark.mark, mark.gate.b], [mark.approach, mark.exit]]), ...route.slice(1).map((point, i) => [route[i], point])];
    const fits = transects.every(([a, b]) => {
      const steps = Math.ceil(distance(a, b) / 5);
      return Array.from({length: steps + 1}, (_, i) => i / steps)
        .every(t => clear({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t}));
    });
    if (fits) return course;
  }
  return null;
}
