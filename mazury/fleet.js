import {Model} from '../src/index.js';
import {createFleetNavigation, angleDelta, bearing, distance, offset} from './fleet-navigation.js';
import {avoidTraffic, closestApproach, resolveBoatContact} from './fleet-traffic.js';
import {sunAt} from './daylight.js';
import {boatSpeed, jibTrim, makeBoat, makeFast, rightBoat, sailTrim, stepBoat, toggleAnchor} from './sailing.js';

const names = ['Bryza', 'Mewa', 'Nurt', 'Jaskółka', 'Wydra', 'Fala', 'Zefir', 'Rusałka',
  'Trzcina', 'Iskra', 'Perkoz', 'Watra', 'Kormoran', 'Szum', 'Płotka',
  'Jutrzenka', 'Wierzba', 'Kania', 'Mgła', 'Bursztyn', 'Ważka', 'Sitowie', 'Czapla',
  'Sowa', 'Krzyżówka', 'Świt', 'Wiklina', 'Kos', 'Wiatr', 'Rokitnik'];
export const maxTraffic = names.length;
const berthRange = 7;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const stopped = boat => boat.moored || boat.capsized;
let sunset = 18 * 60;
while (sunAt(sunset).elevation > 0) sunset++;

export function createFleet(lake, bounds, ports) {
  let navigation;
  let boats = [];
  let time = 0;
  const fairways = new Map();
  const lane = boat => boat.slot?.lane ?? boat.port;
  const navigable = () => navigation ??= createFleetNavigation(lake, bounds, ports);

  function clearFairway(boat) {
    if (fairways.get(lane(boat)) === boat) fairways.delete(lane(boat));
  }

  function setCount(value, player, minute, sun) {
    const count = clamp(Math.round(Number(value) || 0), 0, maxTraffic);
    for (const boat of boats.slice(count)) clearFairway(boat);
    boats = boats.slice(0, count);
    if (boats.length >= count) return;
    navigable();
    if (!navigation.openWater.length || !navigation.ports.length) return;
    const available = point => distance(point, player) > 26 && boats.every(boat => distance(boat, point) > 22);
    while (boats.length < count) {
      const id = boats.length;
      const random = Model.random(14783 + id * 3929);
      const boat = Object.assign(makeBoat(), {
        id, name: names[id], random, departure: 7 * 60 + id * 3 + Math.floor(random() * 14),
        lunchAt: 12 * 60 + Math.floor(random() * 65), lunchLength: 22 + Math.floor(random() * 17),
        lunchAshore: id % 3 === 1, returnAt: 17 * 60 + Math.floor(random() * 82),
        port: navigation.ports[(id * 5 + 3) % navigation.ports.length],
        home: navigation.ports[(id * 5 + 3) % navigation.ports.length],
        intent: null, state: 'cruise', path: [], refused: new Set(), avoidRule: '', nextDecision: time + id / 44,
        heading: random() * Math.PI * 2, previous: null, sailed: 0,
      });
      const overnight = sun.elevation < 0 || minute < boat.departure;
      const start = overnight || id % 5 === 3
        ? [...navigation.ports].sort((a, b) => distance(boat.home.berth, a.berth) - distance(boat.home.berth, b.berth))
          .flatMap(port => (overnight ? navigation.moorings.get(port) : navigation.moorings.get(port).slice(0, 1))
            .filter(slot => port.id !== 'ekomarina' || slot.lane).map(slot => ({port, slot})))
          .find(({slot}) => overnight ? distance(slot.berth, player) > 14
            && boats.every(other => distance(slot.berth, other) >= (other.moored ? berthRange : 12))
            : available(slot.berth))
        : null;
      if (start) {
        const {port, slot} = start;
        Object.assign(boat, slot.berth, {moored: true, port, slot, state: 'moored',
          dockedUntil: overnight ? time : time + 28 + random() * 48});
      } else {
        let start;
        if (overnight) start = navigation.anchorages.find(available);
        else if (id === 0) {
          start = navigation.openWater.find(site => available(site) && distance(site, player) < 86);
        }
        const offsetIndex = Math.floor(random() * navigation.openWater.length);
        for (let i = 0; !start && i < navigation.openWater.length; i++) {
          const site = navigation.openWater[(offsetIndex + i) % navigation.openWater.length];
          if (available(site)) start = site;
        }
        if (!start) break;
        Object.assign(boat, {x: start.x, y: start.y});
        if (overnight) {
          toggleAnchor(boat);
          boat.state = 'anchored';
          boat.anchorDrop = offset(boat, boat.heading, 5.4);
        }
      }
      boats.push(boat);
    }
  }

  function intentAt(boat, minute, sun, weather, wind) {
    const severe = weather.mode === 'storm' || wind.speed >= 11 || Math.abs(boat.heel) > .85;
    if (severe) boat.roughUntil = time + 14;
    boat.severe = severe || time < (boat.roughUntil ?? 0);
    if (sun.elevation < 0) return 'night';
    if (boat.severe || weather.mode === 'heavy' || weather.mode === 'light') return 'shelter';
    if (minute < boat.departure) return 'night';
    if (minute >= boat.returnAt || (sun.x < 0 && sun.elevation < 10)) return 'return';
    if (minute < boat.lunchAt) {
      boat.lunchDone = false;
      boat.lunchUntil = undefined;
    } else if (!boat.lunchDone && minute < boat.lunchAt + 120) {
      if (boat.lunchUntil === undefined && boat.intent === 'lunch' && (boat.moored || boat.anchor)) {
        boat.lunchUntil = time + boat.lunchLength;
      }
      if (time < (boat.lunchUntil ?? Infinity)) return 'lunch';
      boat.lunchDone = true;
    }
    return 'cruise';
  }

  function selectPort(boat, intent, wind) {
    const choices = navigation.ports.filter(port => !boat.refused.has(port));
    const entry = port => navigation.moorings.get(port).reduce((nearest, slot) =>
      distance(boat, slot.approach[0]) < distance(boat, nearest) ? slot.approach[0] : nearest, port.approach[0]);
    const homeDistance = distance(boat, entry(boat.home));
    if (intent === 'return' && choices.includes(boat.home)
        && homeDistance / 2.5 + 54 < sunset - boat.minute) return boat.home;
    return choices.sort((a, b) => {
      const cost = port => {
        const entrance = entry(port);
        const upwindShore = navigation.clear(offset(entrance, wind.from, 33), 4) ? 0 : 36;
        return distance(boat, entrance) - (intent === 'shelter' ? upwindShore : 0);
      };
      return cost(a) - cost(b);
    })[0];
  }

  function anchorSite(boat, wind, traffic, intent) {
    let best, cost = Infinity;
    for (const site of navigation.anchorages.length ? navigation.anchorages : navigation.openWater) {
      if (traffic.some(other => other !== boat && (distance(site, other.anchor ?? other) < 20
          || (other.state === 'seeking-anchor' && other.path.length && distance(site, other.path.at(-1)) < 20)))) continue;
      const gap = distance(boat, site);
      if (gap >= cost) continue;
      const lee = !navigation.clear(offset(site, wind.from, 34), 4);
      const score = gap + (lee ? 0 : intent === 'shelter' ? 96 : 28) + (navigation.leg(boat, site) ? 0 : 120);
      if (score >= cost) continue;
      best = site;
      cost = score;
    }
    return best;
  }

  function cruiseSite(boat, wind) {
    let best, score = -Infinity;
    const sites = navigation.openWater;
    for (let i = 0; i < 22; i++) {
      const site = sites[Math.floor(boat.random() * sites.length)];
      const length = distance(boat, site);
      const angle = Math.abs(angleDelta(bearing(boat, site), wind.from));
      const quality = 120 - Math.abs(length - 240) * .5 - Math.abs(angle - 1.55) * 22 + boat.random() * 45;
      if (quality <= score) continue;
      best = site;
      score = quality;
    }
    return best;
  }

  function setLeg(boat, state, point) {
    boat.state = state;
    boat.path = point ? navigation.route(boat, point) : [];
    boat.progressAt = time;
    boat.bestDistance = Infinity;
    boat.tack = 0;
    boat.checkAgain = time + 5;
  }

  function plan(boat, intent, wind, traffic) {
    boat.slot = undefined;
    const portLunch = intent === 'lunch' && boat.lunchAshore;
    const port = intent === 'return' || intent === 'shelter' || portLunch ? selectPort(boat, intent, wind) : null;
    if (port) {
      boat.port = port;
      const gates = navigation.moorings.get(port).map(slot => slot.approach[0]);
      const gate = gates.sort((a, b) => distance(boat, a) - distance(boat, b))
        .find(point => navigation.leg(boat, point, 5)) ?? port.approach[0];
      setLeg(boat, 'to-port', gate);
      if (boat.path.length) return;
      boat.refused.add(port);
      boat.checkAgain = time;
    } else if (intent === 'cruise') {
      setLeg(boat, 'cruise', cruiseSite(boat, wind));
      return;
    } else {
      setLeg(boat, 'seeking-anchor', anchorSite(boat, wind, traffic, intent));
      boat.retryAt = time + 65 + boat.id;
    }
  }

  function occupied(slot, boat, traffic) {
    return traffic.some(other => other !== boat && (distance(other, slot.berth) < berthRange
      || (other.slot === slot && other.state === 'docking')));
  }

  function noticePort(boat, weather) {
    const gate = boat.path.at(-1);
    const visibility = {storm: 74, heavy: 100, light: 125}[weather.mode] ?? 155;
    return distance(boat, gate) < visibility && navigation.leg(boat, gate, .65);
  }

  function depart(boat, traffic) {
    if (fairways.has(lane(boat)) || occupied(boat.slot, boat, traffic)) return;
    fairways.set(lane(boat), boat);
    boat.moored = false;
    boat.state = 'departing';
    boat.departAstern = !boat.slot.sternTo;
    boat.path = boat.slot.approach.slice().reverse();
    boat.progressAt = time;
    boat.bestDistance = Infinity;
  }

  function trimRig(boat, wind) {
    const main = sailTrim(boat, wind);
    const jib = jibTrim(boat, wind);
    boat.trim = clamp((main.ideal - .12) / 1.33, 0, 1);
    boat.jibSheet = clamp((jib.ideal - .08) / 1.05, 0, 1);
  }

  function courseUnderSail(boat, desired, wind, range) {
    if (Math.abs(angleDelta(desired, wind.from)) >= .93) {
      boat.tack = 0;
      return desired;
    }
    const angle = 1.06;
    const sides = [1, -1].map(side => {
      const course = wind.from + side * angle;
      return {side, course, clear: navigation.leg(boat, offset(boat, course, clamp(range * .46, 18, 38)), 6)};
    }).filter(candidate => candidate.clear);
    if (!sides.length) return null;
    const current = sides.find(candidate => candidate.side === boat.tack);
    if (current && time < boat.tackUntil) return current.course;
    const best = sides.sort((a, b) => {
      const score = candidate => Math.abs(angleDelta(candidate.course, desired))
        + Math.abs(angleDelta(candidate.course, boat.heading)) * (current ? .03 : .18);
      return score(a) - score(b);
    })[0];
    boat.tack = best.side;
    boat.tackUntil = time + clamp(range / 17, 5, 13);
    return best.course;
  }

  function drive(boat, heading, speed, sailing, wind, reef = 1) {
    const error = angleDelta(heading, boat.heading);
    boat.sail = sailing;
    boat.jib = sailing && reef === 1 && wind.speed < 5.3;
    if (sailing) trimRig(boat, wind);
    else boat.trim = boat.jibSheet = 1;
    boat.engine = !sailing && !boat.moored && !boat.anchor;
    const forward = boat.vx * Math.cos(boat.heading) + boat.vy * Math.sin(boat.heading);
    const target = Math.abs(error) < .43 ? speed : speed * clamp(1 - Math.abs(error) / 1.35, 0, 1);
    const thrust = target + clamp((target - forward) * 1.8, -1.6, 1.6);
    boat.gear = !boat.engine || Math.abs(thrust) < .11 ? 0 : Math.sign(thrust);
    const reverse = forward < -.25 || (boat.gear < 0 && forward < .15 && speed < 0);
    const rudder = clamp(2.9 * error - boat.turn * 1.5, -1, 1) * (reverse ? -1 : 1);
    return {rudder, throttle: clamp(Math.abs(thrust) / (boat.gear < 0 ? 1.6 : 2.8), 0, 1),
      reef, speedLimit: sailing ? 4.3 : 0};
  }

  function sailLeg(boat, wind, traffic) {
    const point = boat.path[0];
    const range = distance(boat, point);
    const course = bearing(boat, point);
    const inApproach = boat.state === 'to-port' && range < 47 && boat.path.length === 1;
    const leaving = boat.departureGate && distance(boat, boat.departureGate) < 34;
    if (!leaving) boat.departureGate = undefined;
    const canSail = !boat.severe && boat.state !== 'seeking-anchor' && !inApproach && !leaving && wind.speed > 1.2;
    const sailCourse = canSail ? courseUnderSail(boat, course, wind, range) : null;
    let sailing = sailCourse !== null && navigation.leg(boat, offset(boat, sailCourse, 13), 4);
    let heading = sailing ? sailCourse : course;
    let speed = sailing ? Math.max(2.1, boatSpeed(boat)) : boat.state === 'seeking-anchor'
      ? clamp(range * .35, .65, 2.5) : inApproach || leaving ? 1.65 : 2.65;
    // Keep leeway from putting the hull onto a bank before the next decision.
    if (!navigation.leg(boat, offset(boat, heading, Math.min(range, 14)), 3.8)) {
      const alternate = [...boat.path].reverse().find(point => navigation.leg(boat, point, 4));
      if (alternate) heading = bearing(boat, alternate);
      sailing = false;
      speed = Math.min(speed, alternate ? 1.5 : .65);
    }
    let avoidance = avoidTraffic(boat, traffic, heading, speed, wind.from, navigation.leg);
    if (boat.maneuver && time < boat.maneuverUntil && !avoidance?.urgent
        && navigation.leg(boat, offset(boat, boat.maneuver.heading, 13), 4)) {
      avoidance = boat.maneuver;
    } else if (avoidance && avoidance.rule !== 'hold' && !avoidance.brake) {
      boat.maneuver = avoidance;
      boat.maneuverUntil = time + 2.2;
    }
    boat.avoidRule = avoidance?.rule ?? '';
    if (avoidance) {
      const astern = boat.heading + Math.PI;
      if (avoidance.brake && !sailing && (boatSpeed(boat) < .4 || boat.gear < 0)
          && Math.abs(angleDelta(astern, heading)) < .65 && navigation.leg(boat, offset(boat, astern, 8), 4)
          && traffic.every(other => other === boat
            || closestApproach(boat, other, Math.cos(astern), Math.sin(astern), 7).gap >= 7)) {
        return drive(boat, boat.heading, -.85, false, wind);
      }
      heading = avoidance.heading;
      if (avoidance.brake || (sailing && Math.abs(angleDelta(heading, wind.from)) < .84)) {
        sailing = false;
        speed = avoidance.brake ? 0 : 1.7;
      }
    }
    return drive(boat, heading, speed, sailing, wind, wind.speed >= 7.2 ? .43 : wind.speed >= 5.3 ? .72 : 1);
  }

  function fairwayLeg(boat, wind, traffic) {
    const departing = boat.state === 'departing';
    const point = boat.path[0];
    const range = distance(boat, point);
    const last = boat.path.length === 1;
    const {sternTo, berth} = boat.slot;
    const angle = berth.heading;
    const astern = departing ? boat.departAstern : last && sternTo;
    let heading = bearing(boat, point) + (astern ? Math.PI : 0);
    let speed = astern ? -Math.min(1.35, range * .52) : Math.min(1.45, range * .48);
    if (!departing && last) {
      const cross = -(boat.x - point.x) * Math.sin(angle) + (boat.y - point.y) * Math.cos(angle);
      const along = (point.x - boat.x) * Math.cos(angle) + (point.y - boat.y) * Math.sin(angle);
      heading = angle + (sternTo ? 1 : -1) * clamp(cross * .29, -.54, .54);
      speed = clamp(along * .55, sternTo ? -1.1 : -.65, sternTo ? .65 : 1.1);
      if (Math.abs(along) < 1 && Math.abs(cross) < .65 && Math.abs(angleDelta(angle, boat.heading)) < .18) speed = 0;
    }
    const direction = heading + (astern ? Math.PI : 0);
    const blocked = traffic.some(other => {
      if (other === boat || distance(boat, other) > 21) return false;
      const ahead = Math.cos(direction), across = Math.sin(direction);
      for (const time of [0, 2, 4]) {
        const dx = other.x + other.vx * time - boat.x;
        const dy = other.y + other.vy * time - boat.y;
        const forward = dx * ahead + dy * across;
        if (forward > -1 && forward < Math.min(16, range + 5) && Math.abs(dy * ahead - dx * across) < 4.3) return true;
      }
      return false;
    });
    boat.avoidRule = blocked ? 'fairway traffic' : '';
    return drive(boat, heading, blocked ? 0 : speed, false, wind);
  }

  function decide(boat, player, minute, sun, weather, wind, traffic) {
    boat.minute = minute;
    const intent = intentAt(boat, minute, sun, weather, wind);
    if (boat.intent !== intent) {
      boat.intent = intent;
      boat.refused.clear();
      boat.checkAgain = time;
      if (!['moored', 'anchored', 'docking', 'departing'].includes(boat.state)) boat.path = [];
    }
    if (boat.capsized) {
      // Recover using the same righting action as the player, then seek shelter.
      rightBoat(boat);
      boat.roughUntil = time + 90;
    }
    if (boat.moored) {
      if (intent === 'cruise' && time >= (boat.dockedUntil ?? 0)) depart(boat, traffic);
      if (boat.moored) return drive(boat, boat.heading, 0, false, wind);
    }
    if (boat.anchor) {
      const retry = ['return', 'shelter'].includes(intent) && time >= (boat.retryAt ?? 0) && sun.elevation >= 0;
      if (intent !== 'cruise' && !retry) return drive(boat, wind.from, 0, false, wind);
      toggleAnchor(boat);
      boat.refused.clear();
      boat.path = [];
      boat.checkAgain = time;
    }

    if (boat.state === 'docking' || boat.state === 'departing') {
      if (boat.state === 'docking' && boat.path.length === 1
          && !occupied(boat.slot, boat, traffic)
          && makeFast(boat, boat.slot.berth)) {
        clearFairway(boat);
        boat.state = 'moored';
        boat.dockedUntil = time + 18;
        return drive(boat, boat.heading, 0, false, wind);
      }
      if (boat.path.length > 1 && distance(boat, boat.path[0]) < 2.7) {
        boat.path.shift();
        boat.bestDistance = Infinity;
      }
      if (boat.state === 'docking') {
        const gap = distance(boat, boat.path[0]);
        if (gap < boat.bestDistance - .5) {
          boat.bestDistance = gap;
          boat.progressAt = time;
        } else if (time - boat.progressAt > 55) {
          // Back down the fairway if we cannot finish lining up or the berth becomes blocked.
          const approach = boat.slot.approach;
          const passed = approach.length + 1 - boat.path.length;
          boat.departAstern = !boat.slot.sternTo || boat.path.length > 1;
          boat.path = approach.slice(0, Math.max(1, passed)).reverse();
          boat.state = 'departing';
          boat.refused.add(boat.port);
          boat.lastFull = boat.port.name;
        }
      }
      if (boat.state === 'docking' || distance(boat, boat.path[0]) > 3) return fairwayLeg(boat, wind, traffic);
      clearFairway(boat);
      boat.departureGate = boat.slot.approach[0];
      boat.path = [];
      boat.state = 'cruise';
      boat.slot = undefined;
    }

    if (!boat.path.length && time >= (boat.checkAgain ?? 0)) plan(boat, intent, wind, traffic);
    if (boat.state === 'to-port' && boat.path.length && noticePort(boat, weather)) {
      const slots = navigation.moorings.get(boat.port).filter(slot => !occupied(slot, boat, traffic));
      if (!slots.length) {
        boat.refused.add(boat.port);
        boat.lastFull = boat.port.name;
        boat.divertedAt = distance(boat, boat.path.at(-1));
        plan(boat, intent, wind, traffic);
      } else {
        if (!slots.includes(boat.slot)) {
          const chosen = boat.port.id === 'ekomarina'
            ? [...slots].sort((a, b) => distance(boat, a.approach[0]) - distance(boat, b.approach[0]))
              .find(slot => distance(player, slot.approach[0]) >= 21) ?? slots[0]
            : slots[boat.id % slots.length];
          if (distance(chosen.approach[0], boat.path.at(-1)) > .1) {
            setLeg(boat, 'to-port', chosen.approach[0]);
          }
          boat.slot = chosen;
        }
        const gate = boat.slot.approach[0];
        const gateDistance = distance(boat, gate);
        const blocked = fairways.has(lane(boat)) || distance(player, gate) < 9;
        if (!blocked && gateDistance < 8 && boat.path.length === 1) {
          fairways.set(lane(boat), boat);
          boat.state = 'docking';
          boat.path = [...boat.slot.approach, boat.slot.berth];
          boat.bestDistance = Infinity;
          boat.progressAt = time;
          return fairwayLeg(boat, wind, traffic);
        }
        if (blocked && gateDistance < 20 && boat.path.length === 1) {
          return drive(boat, bearing(boat, gate), 0, false, wind);
        }
      }
    }
    if (boat.path.length > 1 && distance(boat, boat.path[0]) < 5) {
      boat.path.shift();
      boat.bestDistance = Infinity;
    }
    if (boat.path.length) {
      const range = distance(boat, boat.path[0]);
      if (range < boat.bestDistance - 2) {
        boat.bestDistance = range;
        boat.progressAt = time;
      }
      if (boat.state === 'seeking-anchor' && boat.path.length === 1 && range < 4.8 && boatSpeed(boat) < 1.25
          && navigation.clear(boat, 11) && traffic.every(other => boat === other || distance(boat, other) >= 16)) {
        toggleAnchor(boat);
        boat.anchorDrop = offset(boat, boat.heading, 5.4);
        boat.state = 'anchored';
        return drive(boat, wind.from, 0, false, wind);
      } else if (boat.state === 'cruise' && boat.path.length === 1 && range < 13) {
        plan(boat, intent, wind, traffic);
      } else if (time - boat.progressAt > 42) {
        if (boat.state === 'to-port') boat.refused.add(boat.port);
        plan(boat, intent, wind, traffic);
      }
    }
    if (boat.path.length) return sailLeg(boat, wind, traffic);
    return drive(boat, wind.from, 0, false, wind);
  }

  function update(dt, {player, playerFixed, minute, sun, weather, wind}) {
    if (!boats.length) return;
    time += dt;
    const traffic = [player, ...boats];
    for (const boat of boats) {
      const air = wind.at(boat);
      if (!boat.command || time >= boat.nextDecision) {
        boat.command = decide(boat, player, minute, sun, weather, air, traffic);
        boat.nextDecision = time + .17;
      }
      boat.previous = {x: boat.x, y: boat.y};
      stepBoat(boat, boat.command.rudder, dt, lake, air, boat.command);
      boat.sailed += distance(boat, boat.previous);
    }
    for (let i = 1; i < traffic.length; i++) {
      const first = traffic[i];
      if (resolveBoatContact(player, first, playerFixed || stopped(player), stopped(first))) first.contact = (first.contact ?? 0) + 1;
      for (let j = i + 1; j < traffic.length; j++) {
        const second = traffic[j];
        if (!resolveBoatContact(first, second, stopped(first), stopped(second))) continue;
        first.contact = (first.contact ?? 0) + 1;
        second.contact = (second.contact ?? 0) + 1;
      }
    }
  }

  return {
    get boats() { return boats; },
    get moorings() { return navigable().moorings; },
    setCount, update,
    berthTaken: (port, player) => boats.some(boat => distance(boat, port.berth) < berthRange && boat !== player),
    status: () => boats.map(({id, name, x, y, heading, state, intent, port, sail, deployment, jibDeployment, engine, gear,
      moored, slot, anchor, avoidRule, lastFull, divertedAt, sailed, contact, path, vx, vy, heel, severe}) => ({
      id, name, x, y, heading, state, intent, port: port?.id, sail, deployment, jibDeployment, engine, gear,
      moored, sternTo: slot?.sternTo ?? false, berth: slot?.berth, anchor, avoidRule, lastFull, divertedAt,
      sailed, contact: contact ?? 0, next: path[0], speed: Math.hypot(vx, vy), heel, severe,
    })),
  };
}
