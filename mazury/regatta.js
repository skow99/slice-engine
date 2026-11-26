import {angleDelta, bearing, distance, offset} from './fleet-navigation.js';
import {entryRange, findRegattaCourse, lineCrossing, linePosition, regattas, registrationSeconds, stagingDepth} from './regatta-course.js';
import {boatSpeed, hull, makeBoat} from './sailing.js';

const lateStart = 36;
const terminal = new Set(['finished', 'OCS', 'DNS', 'DNF']);
const volunteers = ['Szkwał', 'Mistral', 'Wicher', 'Szot', 'Bora', 'Pasat', 'Sirocco'];
const pose = ({x, y, heading}) => ({x, y, heading});

function racer(boat, name, lane = 0) {
  return {boat, name, lane, status: 'starting', mark: 0, previous: pose(boat), splits: [], recall: false, approachMark: -1};
}

function hullPoints(boat) {
  const beam = hull.beam / 2;
  return [offset(boat, boat.heading, hull.length / 2), offset(boat, boat.heading, -hull.length / 2),
    ...[-1, 1].map(side => offset(boat, boat.heading + Math.PI / 2, beam * side))];
}

function fullyBehind(points, gate) {
  return points.every(point => linePosition(point, gate).along < 0);
}

function crossHull(before, after, gate, earliest = 0) {
  const crossings = before.map((point, i) => lineCrossing(point, after[i], gate))
    .filter(t => t !== null && t >= earliest);
  return crossings.length ? Math.min(...crossings) : null;
}

export function createRegatta(world) {
  let course, player, entries = [], phase = 'idle', strict = false;
  let event = regattas[0];
  let time = 0, firstFinish = Infinity, notice = '', signal, registrationLeft = 0;
  const blocked = new Set();
  const active = () => phase === 'countdown' || phase === 'racing';
  const badWeather = (wind, weather) => weather.mode === 'storm' || wind.speed > 9;
  const finishCloses = () => Math.min(event.limit, firstFinish + event.closing);

  function select(id) {
    if (phase !== 'idle') return;
    const choice = regattas.find(item => item.id === id);
    if (choice) {
      event = choice;
      if (!blocked.has(event)) notice = '';
    }
  }

  function approach(boat, wind, weather, traffic) {
    for (const item of blocked) {
      if (distance(boat, item.buoy) > entryRange + 8) blocked.delete(item);
    }
    if (phase !== 'idle' || boat.capsized || boat.moored) return;
    const here = regattas.find(item => distance(boat, item.buoy) <= entryRange);
    if (!here) return;
    event = here;
    if (blocked.has(here)) return;
    if (badWeather(wind, weather) || wind.speed < 1.3) {
      notice = 'Registration needs a breeze of 3–17 kn and no thunderstorm.';
      return;
    }
    const layout = findRegattaCourse(wind.from, world, event);
    if (!layout) {
      notice = 'Race committee is waiting for a clear course.';
      return;
    }
    const orbit = Array.from({length: 16}, (_, i) => offset(event.buoy, i * Math.PI / 8, 36));
    const free = orbit.filter(point => [boat, ...traffic].every(vessel => distance(vessel, point) >= 9));
    if (free.length < event.crews) {
      notice = 'The registration area is crowded.';
      return;
    }
    entries = volunteers.slice(0, event.crews).map((name, index) => {
      const point = free[Math.floor(index * free.length / event.crews)];
      const leg = orbit.indexOf(point);
      const heading = bearing(point, orbit[(leg + 2) % orbit.length]);
      const vessel = {...makeBoat(), ...point, name, heading, deployment: .72,
        sail: true, vx: 1.8 * Math.cos(heading), vy: 1.8 * Math.sin(heading), regatta: true};
      const lane = (index / (event.crews - 1) - .5) * (layout.start.width - 16);
      return {...racer(vessel, name, lane), orbit, leg: (leg + 2) % orbit.length, index};
    });
    course = layout;
    phase = 'registration';
    registrationLeft = registrationSeconds;
    notice = '';
  }

  function enter(boat, wind, weather, strictStart) {
    if (phase !== 'registration' || registrationLeft <= 0 || distance(boat, event.buoy) > entryRange
        || boat.anchor || boat.capsized || boat.moored) return false;
    if (badWeather(wind, weather) || wind.speed < 1.3) {
      notice = 'Waiting for race weather.';
      return false;
    }
    strict = strictStart;
    notice = '';
    player = racer(boat, 'You');
    entries.unshift(player);
    phase = 'staging';
    return true;
  }

  function clear() {
    phase = 'idle';
    course = player = undefined;
    entries = [];
    time = registrationLeft = 0;
    firstFinish = Infinity;
    notice = '';
    signal = undefined;
  }

  function abandon(message) {
    blocked.add(event);
    clear();
    notice = message;
  }

  function retire() {
    if (phase === 'registration') abandon('Registration closed. Leave the buoy area and return to try again.');
    else if (phase === 'staging') abandon('Entry cancelled. Leave the buoy area and return to try again.');
    else if (active() && !terminal.has(player.status)) player.status = 'DNF';
    else if (phase === 'results' || terminal.has(player?.status)) clear();
  }

  function startArea(boat) {
    const {along, across} = linePosition(boat, course.start);
    return along >= -stagingDepth && along <= -5 && Math.abs(across) <= course.start.width / 2;
  }

  function updateRacer(entry, before, after) {
    const {boat, previous} = entry;
    if (terminal.has(entry.status)) return;
    if (boat.capsized || boat.moored || boat.engine && boat.gear !== 0) {
      entry.status = 'DNF';
      return;
    }
    if (entry.status === 'starting') {
      const start = course.start;
      const priorHull = hullPoints(previous), currentHull = hullPoints(boat);
      const behind = fullyBehind(currentHull, start);
      const crossing = crossHull(priorHull, currentHull, start);
      const atSignal = before < 0 && after >= 0 ? -before / (after - before) : null;
      if (crossing !== null && before + (after - before) * crossing < 0) {
        if (strict) {
          entry.status = 'DNF';
          entry.earlyDisqualification = true;
        }
        entry.recall = true;
      }
      if (atSignal !== null) {
        // A boat can sail around an end without touching the finite line. At the horn it must still be fully behind it.
        const hornHull = priorHull.map((point, i) => ({x: point.x + (currentHull[i].x - point.x) * atSignal,
          y: point.y + (currentHull[i].y - point.y) * atSignal}));
        if (!hornHull.every(point => linePosition(point, start).along <= 1e-8)) entry.recall = true;
      }
      if (behind) entry.recall = false;
      const wasBehind = entry.behind;
      entry.behind = behind;
      if (after < 0 || entry.status === 'DNF') return;
      const valid = !entry.recall && (wasBehind || atSignal !== null)
        ? crossHull(priorHull, currentHull, start, atSignal ?? 0) : null;
      if (valid !== null) {
        entry.status = 'sailing';
        entry.started = before + (after - before) * valid;
      } else if (!behind && linePosition(boat, start).along > 4) entry.recall = true;
      if (entry.status === 'starting' && after >= lateStart) entry.status = entry.recall ? 'OCS' : 'DNS';
      return;
    }
    if (entry.mark < course.marks.length) {
      const {gate} = course.marks[entry.mark];
      const fraction = lineCrossing(previous, boat, gate);
      if (fraction !== null) {
        entry.mark++;
        entry.splits.push(before + (after - before) * fraction);
        entry.missedUntil = 0;
      } else if (entry === player && lineCrossing(previous, boat, {...gate, width: gate.width + 34}) !== null) {
        entry.missedUntil = after + 6;
      }
      return;
    }
    const fraction = crossHull(hullPoints(previous), hullPoints(boat), course.finish);
    if (fraction === null) return;
    entry.finished = before + (after - before) * fraction;
    entry.status = 'finished';
    firstFinish = Math.min(firstFinish, entry.finished);
  }

  function update(dt, wind, weather, registrationDt = dt) {
    if (phase === 'registration') {
      registrationLeft = Math.max(0, registrationLeft - registrationDt);
      if (registrationLeft <= 1e-8) abandon('Race abandoned. Sail out of the buoy area, then return to register.');
      return;
    }
    if (phase === 'staging') {
      if (!startArea(player.boat)) return;
      if (badWeather(wind, weather) || wind.speed < 1.3) {
        notice = 'Waiting for race weather.';
        return;
      }
      if (player.boat.anchor || player.boat.mastDown || player.boat.mastFold || !player.boat.sail
          || boatSpeed(player.boat) > 6.5 || player.boat.engineBoost) {
        notice = 'Raise the main, weigh anchor and slow below 13 kn to arm the clock.';
        return;
      }
      if (!entries.every(entry => startArea(entry.boat))) {
        notice = 'The volunteer crews are sailing to the starting area.';
        return;
      }
      notice = '';
      phase = 'countdown';
      time = -event.countdown;
      Object.assign(player.boat, {engine: false, engineBoost: false, gear: 0});
      for (const entry of entries) {
        entry.previous = pose(entry.boat);
        entry.behind = fullyBehind(hullPoints(entry.boat), course.start);
      }
      signal = 'warning';
      return;
    }
    if (!active()) return;
    if (badWeather(wind, weather)) {
      for (const entry of entries) if (!terminal.has(entry.status)) entry.status = 'DNF';
      notice = 'Race called off for weather.';
      phase = 'results';
      return;
    }
    const before = time;
    time += dt;
    if (time >= -1e-8 && time < 0) time = 0;
    if (before < 0 && time >= 0) {
      phase = 'racing';
      signal = 'start';
    } else if (before < -5 && time >= -5) signal = 'ready';
    for (const entry of entries) {
      updateRacer(entry, before, time);
      entry.previous = pose(entry.boat);
    }
    const limit = finishCloses();
    if (time >= limit) {
      for (const entry of entries) if (!terminal.has(entry.status)) entry.status = 'DNF';
      notice = firstFinish === Infinity ? 'Race time limit reached.' : 'The finishing window closed.';
    }
    if (entries.every(entry => terminal.has(entry.status))) phase = 'results';
  }

  function pilot(vessel, wind) {
    const entry = entries.find(entry => entry.boat === vessel);
    if (!entry || terminal.has(entry.status) || phase === 'results') return null;
    const {start, marks, finish} = course;
    const waiting = phase === 'registration';
    const launch = -3 - (entry.index % 3);
    const assembling = phase === 'staging' || phase === 'countdown' && time < launch;
    let aim, rounding = false;
    if (waiting) {
      if (distance(vessel, entry.orbit[entry.leg]) < 13) entry.leg = (entry.leg + 1) % entry.orbit.length;
      aim = entry.orbit[entry.leg];
    } else if (assembling) {
      const lane = offset(start.center, start.heading + Math.PI / 2, entry.lane);
      aim = offset(lane, start.heading, -19 - (entry.index % 3) * 6);
      if (distance(vessel, aim) < 8 && startArea(vessel)) return null;
    } else if (entry.status === 'starting') {
      const lane = offset(start.center, start.heading + Math.PI / 2, entry.lane * .85);
      aim = offset(lane, start.heading, entry.recall ? -23 : 15);
    } else if (entry.mark === marks.length) {
      const at = linePosition(vessel, finish);
      aim = offset(finish.center, finish.heading, at.along > 5 ? -18 : 14);
    } else {
      const {gate, approach, exit} = marks[entry.mark];
      const at = linePosition(vessel, gate);
      rounding = distance(vessel, gate.center) < 29;
      if (entry.approachMark !== entry.mark && (distance(vessel, approach) < 8 || (at.along < -3 && Math.abs(at.across) < 7))) {
        entry.approachMark = entry.mark;
      }
      if (at.along > 7) entry.approachMark = -1;
      aim = entry.approachMark === entry.mark ? exit : approach;
      aim = offset(aim, gate.heading + Math.PI / 2, entry.lane * .14);
    }
    const desired = bearing(vessel, aim);
    const relative = angleDelta(desired, wind.from);
    let heading = desired;
    if (Math.abs(relative) < .86) {
      const {along, across} = linePosition(aim, {center: vessel, heading: wind.from});
      const tack = entry.tack || (relative === 0 ? Math.sign(entry.lane) || 1 : Math.sign(relative));
      entry.tack = across * tack < -Math.max(4, along * .8) ? -tack : tack;
      heading = wind.from + entry.tack * .94;
    } else entry.tack = Math.sign(relative);
    const turn = angleDelta(heading, vessel.heading);
    const limit = waiting ? 2.35 : assembling ? 3.35 : event.pace + [0.30, -.12, .12, -.07][entry.index % 4];
    return {heading, reef: wind.speed >= 7.1 ? .52 : wind.speed >= 5.2 ? .78 : 1,
      speedLimit: Math.min(limit, rounding ? 2.85 : Infinity, Math.abs(turn) > .7 ? 3.15 : Infinity)};
  }

  function standings() {
    const rank = {finished: 0, sailing: 1, starting: 2, OCS: 3, DNS: 4, DNF: 5};
    return [...entries].sort((a, b) => rank[a.status] - rank[b.status]
      || (a.finished ?? 0) - (b.finished ?? 0) || b.mark - a.mark
      || (a.status === 'sailing' ? distance(a.boat, course.marks[a.mark]?.gate.center ?? course.finish.center)
        - distance(b.boat, course.marks[b.mark]?.gate.center ?? course.finish.center) : 0));
  }

  function target() {
    if (phase === 'idle' || phase === 'registration') return event.buoy;
    if (phase === 'staging' || player.recall && player.status === 'starting') return course.ready;
    if (!terminal.has(player.status)) return player.status === 'starting' ? course.start.center
      : course.marks[player.mark]?.gate.center ?? course.finish.center;
    return null;
  }

  return {approach, enter, update, pilot, retire, standings, target, select,
    get locked() { return active() && !terminal.has(player.status); },
    get phase() { return phase; }, get course() { return course; }, get player() { return player; },
    get boats() { return entries.slice(player ? 1 : 0).map(entry => entry.boat); },
    get finishCloses() { return finishCloses(); },
    get event() { return event; }, get registrationLeft() { return registrationLeft; },
    get blocked() { return blocked.has(event); },
    get time() { return time; }, get notice() { return notice; }, get strict() { return strict; },
    takeSignal() { const cue = signal; signal = undefined; return cue; },
  };
}
