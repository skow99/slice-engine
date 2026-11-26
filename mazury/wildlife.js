import {Model} from '../src/index.js';
import {harborStructureClearance, inHarbor} from './harbor.js';
import {portContact} from './ports.js';
import {hull} from './sailing.js';

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const headingTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const point = (origin, angle, length) => ({
  x: origin.x + Math.cos(angle) * length,
  y: origin.y + Math.sin(angle) * length,
});
const offsets = [0, 0.7, -0.7, 1.45, -1.45, 2.4, -2.4, Math.PI];

export function birdHullClearance(point, boat) {
  const dx = point.x - boat.x, dy = point.y - boat.y;
  const cos = Math.cos(boat.heading), sin = Math.sin(boat.heading);
  const beyond = Math.max(0, Math.abs(dx * cos + dy * sin) - (hull.length - hull.beam) / 2);
  return Math.hypot(beyond, -dx * sin + dy * cos) - hull.beam / 2;
}

export function waterbirdObstacleAt(x, y) {
  const at = {x, y};
  return (portContact(at)?.distance ?? Infinity) < .65
    || (inHarbor(x, y) && harborStructureClearance(at).distance < .65);
}

export function createWildlife(isWater, initialBoat, {bounds, reliefAt = () => 0, structureAt = () => false, seed = 7391} = {}) {
  const random = Model.random(seed);
  const groups = [];
  let duck;
  let cormorants = [];
  let nextDuck = 1.2;
  let nextCormorant = 6;
  let time = 0;
  let wasRoosting = false;

  function findWater(center, near, far, margin = 1) {
    for (let i = 0; i < 30; i++) {
      const at = point(center, random() * TAU, near + (far - near) * random());
      if (isWater(at.x, at.y) && isWater(at.x - margin, at.y) && isWater(at.x + margin, at.y)
          && isWater(at.x, at.y - margin) && isWater(at.x, at.y + margin)) return at;
    }
    return null;
  }

  function makeBird(species, at, heading) {
    return {
      ...at, species, heading, mode: 'swimming', altitude: 0, speed: 0,
      phase: random() * TAU, touchedDown: -Infinity,
    };
  }

  function makeGroup(home, heading) {
    if (!home) return;
    const count = random() < 0.75 ? 3 : 4;
    const birds = [makeBird('swan', home, heading)];
    for (let i = 1; i < count; i++) {
      const seat = point(point(home, heading + Math.PI, 2.25 * i), heading + Math.PI / 2, (i % 2 ? 1 : -1) * 0.85);
      const at = isWater(seat.x, seat.y) ? seat : findWater(home, 1.5 * i, 2.4 * i);
      if (at) birds.push(makeBird('swan', at, heading));
    }
    if (birds.length > 1) groups.push({home, birds, target: home, retarget: time, curiousAt: time + 8 + 12 * random(), visitUntil: 0});
  }

  function seedFlocks() {
    for (const [near, far] of [[17, 25], [42, 60]]) {
      const home = findWater(initialBoat, near, far, 4);
      if (home) makeGroup(home, headingTo(home, initialBoat) + 0.45);
    }
    if (!bounds) return;

    // A flock belongs to a patch of water for the whole session. Zoom and
    // travel only change which birds the camera can see.
    const spacing = 132;
    for (let y = bounds.north + spacing / 2; y < bounds.south; y += spacing) {
      for (let x = bounds.west + spacing / 2; x < bounds.east; x += spacing) {
        const home = findWater({x, y}, 0, spacing * 0.35, 4);
        if (!home || groups.some(group => distance(group.home, home) < 97)) continue;
        makeGroup(home, random() * TAU);
      }
    }
  }

  function swim(bird, target, boat, nearby, pace, dt, escaping = false) {
    const gap = distance(bird, boat);
    const boatSpeed = Math.hypot(boat.vx, boat.vy);
    const shiesAway = !escaping && (gap < 5.6 || (boatSpeed > 2.4 && gap < 13));
    let heading = shiesAway ? headingTo(boat, bird) : headingTo(bird, target);
    if (!shiesAway) {
      let x = Math.cos(heading);
      let y = Math.sin(heading);
      for (const other of nearby) {
        const separation = bird.species === 'swan' && other.species === 'swan' ? 2.65 : 1.8;
        const gap = distance(bird, other);
        if (gap === 0 || gap >= separation) continue;
        const weight = 2 * (1 - gap / separation) / gap;
        x += (bird.x - other.x) * weight;
        y += (bird.y - other.y) * weight;
      }
      heading = Math.atan2(y, x);
    }
    const turn = Math.atan2(Math.sin(heading - bird.heading), Math.cos(heading - bird.heading));
    const turnRate = escaping ? 4.2 : 1.5;
    const desired = bird.heading + clamp(turn, -turnRate * dt, turnRate * dt);
    const cruise = shiesAway ? Math.max(1.6, pace) : pace * clamp(distance(bird, target) * 0.7, 0.2, 1);
    const currentClearance = birdHullClearance(bird, boat);
    for (const offset of offsets) {
      const angle = desired + offset;
      const ahead = point(bird, angle, Math.max(0.9, cruise * 0.9));
      const aheadClearance = birdHullClearance(ahead, boat);
      if (!isWater(ahead.x, ahead.y) || (aheadClearance < 1 && aheadClearance <= currentClearance)) continue;
      bird.heading = angle;
      const step = point(bird, angle, cruise * dt);
      const clearance = birdHullClearance(step, boat);
      if (!isWater(step.x, step.y) || (clearance < 0.75 && clearance <= currentClearance)) continue;
      bird.x = step.x;
      bird.y = step.y;
      bird.speed = cruise;
      return;
    }
    bird.speed = 0;
  }

  function visitPoint(bird, boat, radius) {
    const angle = headingTo(boat, bird);
    for (const offset of [0.35, -0.35, 0.85, -0.85, 1.5, -1.5]) {
      const at = point(boat, angle + offset, radius);
      if (isWater(at.x, at.y)) return at;
    }
    return null;
  }

  function findRoost(bird, wet, occupied, boat) {
    let best;
    const startsWet = isWater(bird.x, bird.y);
    const setback = wet ? 2.4 : 2;
    // Trace to the waterline. A swimmer only considers the first bank in
    // each direction, so it can reach the shallows without crossing land.
    for (let i = 0; i < 32; i++) {
      const angle = bird.phase + i * TAU / 32;
      for (let meters = 0.75; meters <= (best ? best.distance + setback : 370); meters += 0.75) {
        const edge = point(bird, angle, meters);
        if (boat?.anchor && distance(edge, boat) < 5 && birdHullClearance(edge, boat) < .75) break;
        if (startsWet && structureAt(edge.x, edge.y)) break;
        if (isWater(edge.x, edge.y) === startsWet) continue;
        const depth = startsWet === wet ? Math.max(0, meters - setback) : meters + setback;
        const site = point(bird, angle, depth);
        if (!structureAt(site.x, site.y) && isWater(site.x, site.y) === wet && (!best || depth < best.distance)
            && occupied.every(other => distance(site, other) >= 1.8)) {
          best = {...site, distance: depth};
        }
        break;
      }
    }
    return best;
  }

  function startRoost(bird, occupied = [], boat) {
    const flying = bird.mode !== 'swimming';
    const wet = bird.species !== 'cormorant';
    const blocker = flying ? undefined : boat;
    const unclaimed = findRoost(bird, wet, occupied, blocker);
    const target = unclaimed ?? (occupied.length ? findRoost(bird, wet, [], blocker) : undefined) ?? bird;
    const altitude = wet ? 0 : reliefAt(target.x, target.y) / 0.72;
    const length = distance(bird, target);
    const pace = flying ? 9 : 1.6;
    bird.roost = {
      target: {x: target.x, y: target.y, altitude},
      origin: {x: bird.x, y: bird.y, altitude: bird.altitude},
      duration: Math.max(flying ? 1.4 : 0, length / pace),
      began: time, flying,
    };
    if (length > 0) bird.heading = headingTo(bird, target);
    bird.speed = length > 0 ? pace : 0;
    if (flying) bird.mode = 'landing';
  }

  function reachRoost(bird, boat) {
    if (bird.mode === 'resting') return;
    const {origin, target, duration, began, flying} = bird.roost;
    const progress = duration > 0 ? clamp((time - began) / duration, 0, 1) : 1;
    const x = origin.x + (target.x - origin.x) * progress;
    const y = origin.y + (target.y - origin.y) * progress;
    if (!flying && (!isWater(x, y) || (boat.anchor && birdHullClearance({x, y}, boat) < .75))) {
      startRoost(bird, [], boat);
      return;
    }
    bird.x = x;
    bird.y = y;
    bird.altitude = origin.altitude + (target.altitude - origin.altitude) * progress;
    if (flying) {
      const rise = Math.min(1, progress * 4, (1 - progress) * 8);
      bird.altitude += rise * 6;
    }
    if (progress === 1) {
      bird.mode = 'resting';
      bird.speed = 0;
    }
  }

  function waterBirds() {
    const birds = groups.flatMap(group => group.birds);
    if (duck) birds.push(duck);
    return birds.concat(cormorants);
  }

  function settleBirds(boat) {
    const birds = waterBirds();
    if (!wasRoosting) {
      const occupied = [];
      for (const bird of birds) {
        startRoost(bird, occupied, boat);
        occupied.push(bird.roost.target);
      }
    }
    for (const bird of birds) reachRoost(bird, boat);
  }

  function leaveRoosts() {
    for (const group of groups) {
      group.visitUntil = 0;
      group.curiousAt = time + 8 + 12 * random();
      group.retarget = time;
      group.scatterUntil = 0;
      for (const bird of group.birds) {
        bird.mode = 'swimming';
        delete bird.roost;
      }
    }
    if (duck) {
      duck.mode = 'taking off';
      duck.began = time;
      duck.departureAltitude = duck.altitude;
      delete duck.roost;
    }
    for (const cormorant of cormorants) {
      cormorant.mode = 'flying';
      cormorant.began = time;
      cormorant.departureAltitude = cormorant.altitude;
      cormorant.heading += Math.PI;
      delete cormorant.roost;
    }
  }

  function swimGroup(group, boat, nearby, dt, calm) {
    const [leader, ...followers] = group.birds;
    const speed = Math.hypot(boat.vx, boat.vy);
    const flightTime = speed > 2.4 ? ((leader.x - boat.x) * boat.vx + (leader.y - boat.y) * boat.vy) / speed ** 2 : -1;
    if (!(group.scatterUntil > time) && flightTime > 0 && flightTime < 3.2
        && distance(leader, point(boat, Math.atan2(boat.vy, boat.vx), flightTime * speed)) < 8) {
      const angle = Math.atan2(boat.vy, boat.vx) + Math.PI / 2;
      group.scatterUntil = time + 3.8;
      group.visitUntil = 0;
      group.curiousAt = time + 24;
      const ordered = group.birds.slice().sort((a, b) => (a.x - b.x) * Math.cos(angle) + (a.y - b.y) * Math.sin(angle));
      for (const [i, bird] of ordered.entries()) {
        bird.escape = point(bird, angle + (i < ordered.length / 2 ? Math.PI : 0), 11);
      }
    }
    if (group.scatterUntil > time) {
      for (const bird of group.birds) swim(bird, bird.escape, boat, nearby, 2.8, dt, true);
      return;
    }
    if (time >= group.curiousAt && calm && distance(leader, boat) < 51) {
      group.curiousAt = time + 45 + 22 * random();
      if (random() < 0.8) group.visitUntil = time + 24 + 16 * random();
    }
    const visiting = calm && time < group.visitUntil ? visitPoint(leader, boat, 9) : null;
    if (!visiting && (time >= group.retarget || distance(leader, group.target) < 1)) {
      group.target = findWater(group.home, 5, 21, 3) ?? group.home;
      group.retarget = time + 18 + random() * 17;
    }
    swim(leader, visiting ?? group.target, boat, nearby, visiting ? 1.1 : 0.72, dt);
    for (const [i, bird] of followers.entries()) {
      const flank = (i % 2 === 0 ? 1 : -1) * (1 + i * 0.18);
      const slot = point(point(leader, leader.heading + Math.PI, 2.75 + i * 1.95), leader.heading + Math.PI / 2, flank);
      swim(bird, isWater(slot.x, slot.y) ? slot : leader, boat, nearby, Math.min(1.55, leader.speed + 0.47), dt);
    }
  }

  function incomingDuck(boat) {
    const landing = findWater(boat, 13, 29, 2);
    if (!landing) return null;
    const angle = random() * TAU;
    const origin = point(landing, angle + Math.PI, 48 + 20 * random());
    for (let f = .67; f <= 1; f += .03) {
      if (structureAt(origin.x + (landing.x - origin.x) * f, origin.y + (landing.y - origin.y) * f)) return null;
    }
    return {
      ...makeBird('mallard', origin, angle),
      mode: 'flying', altitude: 10,
      origin, landing, began: time, duration: distance(origin, landing) / 7,
    };
  }

  function updateDuck(boat, nearby, dt, calm) {
    if (duck && distance(duck, boat) > 165) {
      duck = null;
      nextDuck = time + 4;
    }
    if (!duck && time >= nextDuck) {
      duck = incomingDuck(boat);
      nextDuck = time + 6;
    }
    if (!duck) return;
    if (duck.mode === 'taking off') {
      const age = time - duck.began;
      Object.assign(duck, point(duck, duck.heading, (3.8 + Math.min(5, age)) * dt));
      const lift = clamp(age * 2.8 / 13, 0, 1);
      duck.altitude = (duck.departureAltitude ?? 0) * (1 - lift) + 13 * lift;
      if (age > 10) {
        duck = null;
        nextDuck = time + 17 + 18 * random();
      }
      return;
    }
    if (duck.mode !== 'swimming') {
      const progress = clamp((time - duck.began) / duck.duration, 0, 1);
      const descent = clamp((progress - 0.54) / 0.46, 0, 1);
      const ease = progress + 0.48 * progress ** 6 * (1 - progress) * 2;
      duck.x = duck.origin.x + (duck.landing.x - duck.origin.x) * ease;
      duck.y = duck.origin.y + (duck.landing.y - duck.origin.y) * ease;
      duck.altitude = 10 * (1 - descent) ** 1.27;
      if (descent > 0) duck.mode = 'landing';
      if (progress < 1) return;
      if (!isWater(duck.x, duck.y) || distance(duck, boat) < 5.6) {
        duck.mode = 'taking off';
        duck.began = time;
        return;
      }
      duck.mode = 'swimming';
      duck.altitude = 0;
      duck.touchedDown = time;
      duck.leaveAt = time + 52 + 38 * random();
      duck.visitAt = time + 7 + 10 * random();
      duck.visitUntil = 0;
      duck.target = findWater(duck, 9, 18) ?? duck.landing;
      duck.retarget = time + 17;
    }
    const startled = Math.hypot(boat.vx, boat.vy) > 2.4 && distance(duck, boat) < 13;
    if (time >= duck.leaveAt || startled) {
      if (startled) duck.heading = headingTo(boat, duck);
      for (const offset of offsets) {
        const heading = duck.heading + offset;
        const near = point(duck, heading, 2);
        const far = point(duck, heading, 5);
        if (!structureAt(near.x, near.y) && !structureAt(far.x, far.y)) {
          duck.heading = heading;
          break;
        }
      }
      duck.mode = 'taking off';
      duck.began = time;
      return;
    }
    if (calm && time >= duck.visitAt && distance(duck, boat) < 39) {
      duck.visitAt = time + 28 + 16 * random();
      if (random() < 0.82) duck.visitUntil = time + 20 + 13 * random();
    }
    const visiting = calm && time < duck.visitUntil ? visitPoint(duck, boat, 6.7) : null;
    if (!visiting && (time >= duck.retarget || distance(duck, duck.target) < 1)) {
      duck.target = findWater(duck.landing, 4, 23) ?? duck.landing;
      duck.retarget = time + 18;
    }
    swim(duck, visiting ?? duck.target, boat, nearby, visiting ? 1.25 : 0.94, dt);
  }

  function updateCormorant(boat, dt) {
    if (!cormorants.length && time >= nextCormorant) {
      const angle = random() < 0.5 ? 0.21 + random() * 0.48 : Math.PI + 0.21 + random() * 0.48;
      const center = point(boat, angle - Math.PI / 2, 7 + 13 * random());
      const count = 3 + Math.floor(random() * 3);
      cormorants = Array.from({length: count}, (_, i) => {
        const flank = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (3.5 + random());
        const at = point(point(center, angle + Math.PI, 85 + i * 3.4), angle + Math.PI / 2, flank);
        const heightOffset = (random() - 0.5) * 1.6;
        return {...makeBird('cormorant', at, angle), altitude: 12 + heightOffset,
          heightOffset, mode: 'flying', began: time, duration: 17.5};
      });
    }
    if (!cormorants.length) return;
    for (const cormorant of cormorants) {
      Object.assign(cormorant, point(cormorant, cormorant.heading, 10.6 * dt));
      const age = time - cormorant.began;
      const cruise = 11 + 1.6 * Math.sin(age * 0.54) + cormorant.heightOffset;
      const lift = cormorant.departureAltitude === undefined ? 1 : Math.min(1, age / 3);
      cormorant.altitude = (cormorant.departureAltitude ?? 0) * (1 - lift) + cruise * lift;
    }
    const [leader] = cormorants;
    if (time > leader.began + leader.duration) {
      cormorants = [];
      nextCormorant = time + 13 + 19 * random();
    }
  }

  seedFlocks();
  return {
    update(dt, boat, roosting = false) {
      time += dt;
      if (roosting) {
        settleBirds(boat);
        wasRoosting = true;
        return;
      }
      if (wasRoosting) leaveRoosts();
      wasRoosting = false;
      const calm = Math.hypot(boat.vx, boat.vy) < 0.85;
      for (const group of groups) {
        const leader = group.birds[0];
        const nearby = groups.filter(other => distance(leader, other.birds[0]) < 24)
          .flatMap(other => other.birds);
        if (duck?.mode === 'swimming' && distance(leader, duck) < 24) nearby.push(duck);
        swimGroup(group, boat, nearby, dt, calm);
        for (const bird of group.birds) {
          const period = 15 + 1.1 * bird.phase;
          const age = (time + bird.phase * 4) % period;
          const pace = age < 2.6 && bird.speed < 1.45 ? Math.sin(Math.PI * age / 2.6) : 0;
          bird.feed = (bird.feed ?? 0) + (pace - (bird.feed ?? 0)) * Math.min(1, dt * 5);
        }
      }
      const nearby = duck ? groups.filter(group => distance(duck, group.birds[0]) < 24)
        .flatMap(group => group.birds) : [];
      updateDuck(boat, nearby, dt, calm);
      updateCormorant(boat, dt);
    },
    birds: waterBirds,
    status() {
      const flock = cormorants.map(({x, y, altitude, mode}) => ({x, y, altitude, mode}));
      return {
        flocks: groups.map(group => group.birds.map(({x, y, mode}) => ({x, y, mode}))),
        duck: duck && {x: duck.x, y: duck.y, altitude: duck.altitude, mode: duck.mode},
        cormorant: flock[0],
        cormorants: flock,
      };
    },
  };
}
