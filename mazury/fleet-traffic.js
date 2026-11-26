import {angleDelta, bearing, distance, offset} from './fleet-navigation.js';
import {boatSpeed, hull} from './sailing.js';

const underSail = boat => !(boat.engine && boat.gear)
  && Math.max(boat.deployment, boat.jibDeployment) > .15;
const stopped = boat => boat.moored || boat.anchor || boat.capsized;
const ahead = (boat, other) => angleDelta(bearing(boat, other), boat.heading);
const overtaking = (boat, other) => !stopped(other) && Math.abs(ahead(other, boat)) > Math.PI * .625
  && Math.abs(angleDelta(boat.heading, other.heading)) < .9 && boatSpeed(boat) > boatSpeed(other) + .1;

// Polish inland navigation rules §§ 6.03, 6.03 bis, 6.04 and 6.09–10.
// The fleet consists of small craft and the chart has no marked traffic lanes.
export function encounter(boat, other, windFrom) {
  if (stopped(other) || boatSpeed(other) < .35) return 'obstruction';
  if (['docking', 'departing'].includes(other.state)) return 'fairway traffic';
  if (overtaking(boat, other)) return 'overtaking';
  if (overtaking(other, boat)) return 'hold';
  const sail = underSail(boat), otherSail = underSail(other);
  if (sail !== otherSail) return sail ? 'hold' : 'sail';
  if (sail) {
    const portTack = Math.sin(windFrom - boat.heading) < 0;
    const otherPortTack = Math.sin(windFrom - other.heading) < 0;
    if (portTack !== otherPortTack) return portTack ? 'port tack' : 'hold';
    const windward = (boat.x - other.x) * Math.cos(windFrom) + (boat.y - other.y) * Math.sin(windFrom);
    return windward > 0 ? 'windward' : 'hold';
  }
  if (Math.abs(angleDelta(boat.heading, other.heading)) > 2.65
      && Math.abs(ahead(boat, other)) < .55 && Math.abs(ahead(other, boat)) < .55) return 'head-on';
  return ahead(boat, other) > 0 ? 'starboard crossing' : 'hold';
}

export function closestApproach(boat, other, vx = boat.vx, vy = boat.vy, horizon = 19) {
  const x = other.x - boat.x, y = other.y - boat.y;
  const dx = other.vx - vx, dy = other.vy - vy;
  const time = Math.max(0, Math.min(horizon, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)));
  return {time, gap: Math.hypot(x + dx * time, y + dy * time)};
}

export function avoidTraffic(boat, traffic, course, speed, wind, clearLeg, minimum = 10) {
  let threat;
  for (const other of traffic) {
    const range = distance(boat, other);
    if (boat === other || range > 165) continue;
    const closest = closestApproach(boat, other);
    const intended = closestApproach(boat, other, Math.cos(course) * speed, Math.sin(course) * speed);
    const urgent = range < minimum * .74 || (closest.time < 3.5 && closest.time > 0 && closest.gap < minimum * .65);
    const rule = encounter(boat, other, wind);
    const presentRisk = closest.gap < minimum && closest.time > 0;
    if (!urgent && !presentRisk && (intended.gap >= minimum || intended.time <= 0)) continue;
    const risk = urgent ? 0 : Math.min(closest.time || 19, intended.time || 19);
    if (!threat || risk < threat.risk) threat = {other, rule, risk, urgent, presentRisk};
  }
  if (!threat) return null;
  const {other, rule, urgent, presentRisk} = threat;
  if (rule === 'hold' && !urgent) return presentRisk ? {heading: boat.heading, rule} : null;
  const turn = angleDelta(course, boat.heading);
  let best;
  for (const change of [.46, .78, 1.14, 1.48, -.46, -.78, -1.14, -1.48]) {
    if (rule === 'head-on' && change < 0 && !urgent) continue;
    const heading = boat.heading + change;
    if (!clearLeg(boat, offset(boat, heading, Math.max(9, speed * 4)), 4)) continue;
    const vx = Math.cos(heading) * speed, vy = Math.sin(heading) * speed;
    const gap = Math.min(...traffic.map(vessel => boat === vessel || distance(boat, vessel) > 165
      ? Infinity : closestApproach(boat, vessel, vx, vy).gap));
    const afterTurn = offset(boat, heading, speed * 5);
    const forward = (afterTurn.x - other.x) * Math.cos(other.heading) + (afterTurn.y - other.y) * Math.sin(other.heading);
    const towardWind = (afterTurn.x - other.x) * Math.cos(wind) + (afterTurn.y - other.y) * Math.sin(wind);
    const score = Math.min(gap, 30) - Math.abs(angleDelta(change, turn)) * 2
      - (change < 0 ? 3.5 : 0)
      - (rule === 'overtaking' && underSail(boat) && underSail(other) && towardWind < 0 ? 7 : 0)
      - (['sail', 'starboard crossing', 'port tack', 'windward'].includes(rule) && forward > 0 ? 9 : 0);
    if (!best || score > best.score) best = {heading, gap, score};
  }
  return {...best, heading: best?.heading ?? boat.heading, brake: !best || (!urgent && best.gap < minimum * .68), rule, urgent};
}

// The same three points used by the shoreline hull, with a short capsule between them.
const halfSpine = (hull.length - hull.beam) / 2;
function nearestOnSpine(point, boat) {
  const cos = Math.cos(boat.heading), sin = Math.sin(boat.heading);
  const along = Math.max(-halfSpine, Math.min(halfSpine, (point.x - boat.x) * cos + (point.y - boat.y) * sin));
  return {x: boat.x + along * cos, y: boat.y + along * sin};
}

export function resolveBoatContact(a, b, aFixed = false, bFixed = false) {
  if (distance(a, b) >= hull.length || (aFixed && bFixed)) return false;
  let closest;
  for (const end of [-halfSpine, 0, halfSpine]) {
    const ap = offset(a, a.heading, end);
    const bp = offset(b, b.heading, end);
    for (const [p, q] of [[ap, nearestOnSpine(ap, b)], [nearestOnSpine(bp, a), bp]]) {
      const gap = distance(p, q);
      if (!closest || gap < closest.gap) closest = {p, q, gap};
    }
  }
  if (closest.gap >= hull.beam) return false;
  const heading = closest.gap > .01 ? bearing(closest.p, closest.q) : bearing(a, b);
  const x = Math.cos(heading), y = Math.sin(heading);
  const overlap = hull.beam - closest.gap + .02;
  const closing = Math.max(0, (a.vx - b.vx) * x + (a.vy - b.vy) * y);
  const aShare = aFixed ? 0 : bFixed ? 1 : .5;
  const bShare = 1 - aShare;
  a.x -= x * overlap * aShare;
  a.y -= y * overlap * aShare;
  b.x += x * overlap * bShare;
  b.y += y * overlap * bShare;
  a.vx -= x * closing * aShare;
  a.vy -= y * closing * aShare;
  b.vx += x * closing * bShare;
  b.vy += y * closing * bShare;
  return true;
}
