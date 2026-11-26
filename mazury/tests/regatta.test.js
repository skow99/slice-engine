import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodePNG} from '../../tools/png.js';
import {sunAt} from '../daylight.js';
import {createFleet} from '../fleet.js';
import {distance, offset} from '../fleet-navigation.js';
import {createLakeMap} from '../lake.js';
import {createWorldMap, worldBounds} from '../lake-world.js';
import {portContact, ports} from '../ports.js';
import {findRegattaCourse, regattas, registrationSeconds} from '../regatta-course.js';
import {createRegatta} from '../regatta.js';
import {hull, makeBoat} from '../sailing.js';
import {defaultWind} from '../wind.js';

const world = {...createWorldMap(createLakeMap(decodePNG(readFileSync(new URL('../map/terrain.png', import.meta.url))).data)), portContact};
const clear = {mode: 'clear'};
const {buoy: entryBuoy, countdown: countdownLength} = regattas[0];
const onLine = (line, along, across = 0) => ({...offset(offset(line.center, line.heading, along), line.heading + Math.PI / 2, across), heading: line.heading});

function registered(strict = false) {
  const race = createRegatta(world);
  const boat = {...makeBoat(), ...entryBuoy};
  const tick = (dt = 1 / 60, weather = clear) => race.update(dt, defaultWind, weather);
  race.approach(boat, defaultWind, clear, []);
  assert.ok(race.enter(boat, defaultWind, clear, strict));
  for (const boat of race.boats) Object.assign(boat, onLine(race.course.start, -28, (race.boats.indexOf(boat) - 1) * 16));
  tick();
  assert.equal(race.phase, 'staging');
  const {start} = race.course;
  function move(point, dt) {
    Object.assign(boat, point);
    tick(dt);
  }
  move(onLine(start, -25));
  assert.equal(race.phase, 'staging');
  boat.sail = true;
  move(onLine(start, -25));
  assert.equal(race.phase, 'countdown');
  assert.equal(race.takeSignal(), 'warning');
  return {race, boat, tick, move, ...race.course};
}

test('registration needs proximity and race weather and the lake fits a course at every sampled bearing', () => {
  const race = createRegatta(world);
  const boat = makeBoat();
  assert.equal(race.enter(boat, defaultWind, clear, false, []), false);
  Object.assign(boat, entryBuoy);
  assert.equal(race.enter(boat, {...defaultWind, speed: 0}, clear, false, []), false);
  assert.equal(race.enter(boat, defaultWind, {mode: 'storm'}, false, []), false);
  for (const event of regattas) for (let degrees = 0; degrees < 360; degrees += 5) {
    assert.ok(findRegattaCourse(degrees * Math.PI / 180, world, event), `${event.id} ${degrees}`);
  }
});

test('an early boat must return fully behind the line and cross between the ends after the horn', () => {
  const {race, move, start, tick} = registered();
  move(onLine(start, 7));
  assert.equal(race.player.recall, true);
  tick(countdownLength - 1 / 60);
  assert.equal(race.takeSignal(), 'start');
  move(onLine(start, -2));
  assert.equal(race.player.recall, true);
  move(onLine(start, -12));
  assert.equal(race.player.recall, false);
  move(onLine(start, -12, 50));
  move(onLine(start, 7, 50));
  assert.equal(race.player.status, 'starting');
  move(onLine(start, -12));
  move(onLine(start, 7));
  assert.equal(race.player.status, 'sailing');
});

test('strict mode retires an early starter while ordinary races distinguish OCS from DNS', () => {
  const strict = registered(true);
  strict.move(onLine(strict.start, 8));
  assert.equal(strict.race.player.status, 'DNF');
  const early = registered();
  early.move(onLine(early.start, 8));
  early.tick(countdownLength + 37);
  assert.equal(early.race.player.status, 'OCS');
  const waiting = registered();
  waiting.tick(countdownLength + 37);
  assert.equal(waiting.race.player.status, 'DNS');
});

test('a valid start exactly at the signal permits ordered port roundings and a directional finish', () => {
  const {race, move, start, marks, finish, tick} = registered();
  tick(countdownLength - .5);
  move(onLine(start, -hull.length / 2), .5);
  assert.equal(race.player.status, 'sailing');
  move(onLine(finish, -10));
  move(onLine(finish, 12));
  assert.equal(race.player.status, 'sailing');
  move(onLine(marks[1].gate, -7));
  move(onLine(marks[1].gate, 7));
  assert.equal(race.player.mark, 0);
  move(onLine(marks[0].gate, -9, -15));
  move(onLine(marks[0].gate, 9, -15));
  assert.equal(race.player.mark, 0);
  assert.ok(race.player.missedUntil > race.time);
  for (const {gate} of marks) {
    move(onLine(gate, -9));
    move(onLine(gate, 9));
  }
  assert.equal(race.player.mark, 3);
  move(onLine(finish, 12, 50));
  move(onLine(finish, 12));
  move(onLine(finish, -10));
  assert.equal(race.player.status, 'sailing');
  move(onLine(finish, 12));
  assert.equal(race.player.status, 'finished');
  assert.equal(race.player.splits.length, 3);
});

test('all three volunteers compete under sail and finish with ambient traffic set to zero', () => {
  const {race, boat, tick} = registered();
  const fleet = createFleet(world, worldBounds, ports, race);
  const dt = 1 / 60;
  fleet.setCount(0, boat, 720, sunAt(720));
  assert.equal(fleet.trafficCount, 0);
  assert.equal(fleet.boats.length, 3);
  for (let frame = 0; frame < 60 * 220 && race.phase !== 'results'; frame++) {
    fleet.update(dt, {player: boat, playerFixed: true, minute: 720, sun: sunAt(720), weather: clear, wind: {at: () => defaultWind}});
    tick(dt);
  }
  assert.equal(race.phase, 'results');
  assert.equal(race.player.status, 'DNS');
  assert.ok(race.standings().filter(entry => entry !== race.player).every(entry => entry.status === 'finished' && entry.mark === 3 && !entry.boat.engine));
  race.retire();
  assert.equal(fleet.boats.length, 0);
});

test('a thunderstorm closes the event and releases the engine lock', () => {
  const {race, tick} = registered();
  assert.equal(race.locked, true);
  tick(1 / 60, {mode: 'storm'});
  assert.equal(race.phase, 'results');
  assert.equal(race.locked, false);
  assert.ok(race.standings().every(entry => entry.status === 'DNF'));
});


test('registration expires after two minutes and requires leaving and returning to the buoy', () => {
  const race = createRegatta(world);
  const boat = {...makeBoat(), ...regattas[1].buoy};
  const approach = () => race.approach(boat, defaultWind, clear, []);
  approach();
  assert.equal(race.phase, 'registration');
  assert.equal(race.boats.length, 5);
  race.update(4 * (registrationSeconds - 1), defaultWind, clear, registrationSeconds - 1);
  assert.equal(race.registrationLeft, 1);
  Object.assign(boat, offset(regattas[1].buoy, 0, 30));
  approach();
  assert.equal(race.enter(boat, defaultWind, clear, false), false);
  race.update(4, defaultWind, clear, 1);
  assert.equal(race.phase, 'idle');
  assert.equal(race.boats.length, 0);
  Object.assign(boat, regattas[1].buoy);
  approach();
  assert.equal(race.blocked, true);
  assert.equal(race.enter(boat, defaultWind, clear, false), false);
  Object.assign(boat, offset(regattas[1].buoy, 0, 40));
  approach();
  Object.assign(boat, regattas[1].buoy);
  approach();
  assert.equal(race.registrationLeft, registrationSeconds);
  assert.ok(race.enter(boat, defaultWind, clear, false));
});

test('each fleet sails while registration is open and assembles before the warning signal', () => {
  for (const event of regattas) {
    const race = createRegatta(world);
    const fleet = createFleet(world, worldBounds, ports, race);
    const boat = {...makeBoat(), ...event.buoy};
    const dt = 1 / 60;
    function tick() {
      fleet.update(dt, {player: boat, playerFixed: true, minute: 720, sun: sunAt(720), weather: clear, wind: {at: () => defaultWind}});
      race.update(dt, defaultWind, clear);
    }
    race.approach(boat, defaultWind, clear, []);
    assert.equal(race.boats.length, event.crews);
    assert.equal(race.course.marks.length, event.marks.length);
    const positions = race.boats.map(({x, y}) => ({x, y}));
    for (let i = 0; i < 1200; i++) tick();
    assert.ok(race.boats.every((boat, index) => boat.sail && !boat.engine
      && Math.hypot(boat.x - positions[index].x, boat.y - positions[index].y) > 8), event.name);
    assert.ok(race.enter(boat, defaultWind, clear, false));
    Object.assign(boat, race.course.ready, {sail: true});
    tick();
    assert.equal(race.phase, 'staging');
    for (let i = 0; i < 60 * 160 && race.phase === 'staging'; i++) tick();
    assert.equal(race.phase, 'countdown', event.name);
    assert.equal(race.time, -event.countdown);
    for (let i = 0; i < 60 * (event.limit + event.countdown) && race.phase !== 'results'; i++) tick();
    assert.equal(race.phase, 'results', event.name);
    assert.ok(race.standings().filter(entry => entry.status === 'finished').length >= (event.id === 'strzelce' ? 5 : event.crews), event.name);
  }
});


test('courses get longer while the fleet grows and the rounding gates narrow', () => {
  let previous = 0;
  for (const event of regattas) {
    const course = findRegattaCourse(defaultWind.from, world, event);
    const route = [course.start.center, ...course.marks.map(({gate}) => gate.center), course.finish.center];
    const length = route.slice(1).reduce((total, point, i) => total + distance(route[i], point), 0);
    assert.ok(length > previous + 100, event.name);
    previous = length;
  }
  assert.deepEqual(regattas.map(event => event.crews + 1), [4, 6, 8]);
  assert.deepEqual(regattas.map(event => event.gateWidth), [22, 19, 17]);
});
