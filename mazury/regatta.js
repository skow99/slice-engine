import {angleDelta, bearing, distance, offset} from './fleet-navigation.js';
import {entryBuoy, entryRange, findRegattaCourse, lineCrossing, linePosition, stagingDepth} from './regatta-course.js';
import {boatSpeed, hull, makeBoat} from './sailing.js';

export const countdownLength = 24;
const lateStart = 36;
const raceLimit = 360;
const closingWindow = 125;
const terminal = new Set(['finished', 'OCS', 'DNS', 'DNF']);
const volunteers = ['Szkwał', 'Mistral', 'Wicher'];
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
  let time = 0, firstFinish = Infinity, notice = '', signal;
  const active = () => phase === 'countdown' || phase === 'racing';
  const badWeather = (wind, weather) => weather.mode === 'storm' || wind.speed > 9;

  function enter(boat, wind, weather, strictStart, traffic) {
    if (phase !== 'idle' || distance(boat, entryBuoy) > entryRange || boat.anchor || boat.capsized || boat.moored) return false;
    if (badWeather(wind, weather) || wind.speed < 1.3) {
      notice = 'Registration needs a breeze of 3–17 kn and no thunderstorm.';
      return false;
    }
    const layout = findRegattaCourse(wind.from, world);
    if (!layout) {
      notice = 'Race committee is waiting for a clear course.';
      return false;
    }
    strict = strictStart;
    course = layout;
    player = racer(boat, 'You');
    entries = [player];
    const occupied = [...traffic, boat];
    const positions = [-18, 0, 18].flatMap((lane, i) => [18 + i * 5, 36, 45].map(depth => ({lane, depth})));
    for (const name of volunteers) {
      const spot = positions.find(({lane, depth}) => {
        const at = offset(offset(course.start.center, course.start.heading, -depth), course.start.heading + Math.PI / 2, lane);
        return occupied.every(vessel => distance(vessel, at) >= 8);
      });
      if (!spot) {
        entries = [];
        course = player = undefined;
        notice = 'The starting area is crowded. Try registration again in a moment.';
        return false;
      }
      const {lane, depth} = spot;
      const position = offset(offset(course.start.center, course.start.heading, -depth), course.start.heading + Math.PI / 2, lane);
      const vessel = {...makeBoat(), ...position, name, heading: course.start.heading, regatta: true};
      occupied.push(vessel);
      entries.push(racer(vessel, name, lane));
    }
    phase = 'staging';
    notice = '';
    return true;
  }

  function clear() {
    phase = 'idle';
    course = player = undefined;
    entries = [];
    time = 0;
    firstFinish = Infinity;
    notice = '';
    signal = undefined;
  }

  function retire() {
    if (phase === 'staging') clear();
    else if (active() && !terminal.has(player.status)) player.status = 'DNF';
    else if (phase === 'results' || terminal.has(player?.status)) clear();
  }

  function startArea(boat) {
    const {along, across} = linePosition(boat, course.start);
    return along >= -stagingDepth && along <= -4 && Math.abs(across) <= course.start.width / 2;
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

  function update(dt, wind, weather) {
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
      notice = '';
      phase = 'countdown';
      time = -countdownLength;
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
    const limit = Math.min(raceLimit, firstFinish + closingWindow);
    if (time >= limit) {
      for (const entry of entries) if (!terminal.has(entry.status)) entry.status = 'DNF';
      notice = firstFinish === Infinity ? 'Race time limit reached.' : 'The finishing window closed.';
    }
    if (entries.every(entry => terminal.has(entry.status))) phase = 'results';
  }

  function pilot(vessel, wind) {
    const entry = entries.find(entry => entry.boat === vessel);
    const index = entries.indexOf(entry);
    if (terminal.has(entry.status) || !active() || time < -[0, 5, 4, 3][index]) return null;
    const {start, marks, finish} = course;
    let aim, rounding = false;
    if (entry.status === 'starting') {
      const lane = offset(start.center, start.heading + Math.PI / 2, entry.lane * .8);
      aim = offset(lane, start.heading, entry.recall ? -21 : 13);
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
    const limit = [0, 4.65, 4.28, 4.48][index];
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
    if (phase === 'idle') return entryBuoy;
    if (phase === 'staging' || player.recall && player.status === 'starting') return course.ready;
    if (!terminal.has(player.status)) return player.status === 'starting' ? course.start.center
      : course.marks[player.mark]?.gate.center ?? course.finish.center;
    return null;
  }

  return {enter, update, pilot, retire, standings, target,
    get locked() { return active() && !terminal.has(player.status); },
    get phase() { return phase; }, get course() { return course; }, get player() { return player; },
    get boats() { return entries.slice(1).map(entry => entry.boat); },
    get finishCloses() { return Math.min(raceLimit, firstFinish + closingWindow); },
    get time() { return time; }, get notice() { return notice; }, get strict() { return strict; },
    takeSignal() { const cue = signal; signal = undefined; return cue; },
  };
}
