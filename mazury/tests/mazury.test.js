import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Model, Voxel} from '../../src/index.js';
import {createBuildingSites, foundationRise, gradeAroundBuilding, sampleBuildingSite} from '../building-sites.js';
import {projectBuildingShadow} from '../building-shadows.js';
import {visibleBirds} from '../bird-view.js';
import {cameraView} from '../camera-view.js';
import {createCrows} from '../crows.js';
import {createStorks} from '../storks.js';
import {boughPose, treeLoad} from '../tree-view.js';
import {grow as treeTemplate} from '../art/templates/lakeside-trees.js';
import {birdsRoosting, daylightAt, sunAt, wrapDay} from '../daylight.js';
import {createFleet, maxTraffic} from '../fleet.js';
import {createFleetNavigation, distance} from '../fleet-navigation.js';
import {avoidTraffic, encounter, resolveBoatContact} from '../fleet-traffic.js';
import {decodePNG} from '../../tools/png.js';
import {createLakeMap, landCover} from '../lake.js';
import {survey} from '../map/survey.js';
import {createRelief, writeSlices} from '../relief.js';
import {placeBuildings} from '../settlements.js';
import {createWorldMap, toGame, toSurvey, worldBounds} from '../lake-world.js';
import {approach, berth, boardingPoint, harborBounds, harborClearance, harborStructures, harborWalkableAt, harborWaterAt, inHarbor, moveWalker} from '../harbor.js';
import {berthStatus, boatSpeed, canGoosewing, hull, jibTrim, makeBoat, makeFast, maxBallastKg, rightBoat, sailPower, sailTrim, setBallast, stepBoat, toggleAnchor, toggleGoosewing, toggleMast, windFrom} from '../sailing.js';
import {birdHullClearance, createWildlife, waterbirdObstacleAt} from '../wildlife.js';
import {portContact, ports, walkAtPort} from '../ports.js';
import {createDailyWeather, createWeather, thunderDelay, warningFlash, warningRate, waveAt} from '../weather.js';
import {createFishRises, createPropWash, drawAnchor} from '../water.js';
import {createWind, defaultWind, knotsPerMeterPerSecond, windBearing} from '../wind.js';
import {yachtBowEye, yachtLamps} from '../yacht-view.js';

const dt = 1 / 60;
const terrain = decodePNG(readFileSync(new URL('../map/terrain.png', import.meta.url)));
const lake = createLakeMap(terrain.data);
const world = createWorldMap(lake);
const fleetWater = {...world, portContact};

test('traffic can grow to thirty named boats and shrink without replacing the remaining crews', () => {
  const fleet = createFleet(fleetWater, worldBounds, ports);
  const player = makeBoat();
  const sun = sunAt(30);
  fleet.setCount(100, player, 30, sun);
  assert.equal(maxTraffic, 30);
  assert.equal(fleet.boats.length, 30);
  assert.equal(new Set(fleet.boats.map(boat => boat.name)).size, 30);
  assert.ok(fleet.boats.every(boat => boat.anchor || boat.moored));
  const first = fleet.boats[0];
  fleet.setCount(1, player, 30, sun);
  assert.deepEqual(fleet.boats, [first]);
  fleet.setCount(0, player, 30, sun);
  assert.equal(fleet.boats.length, 0);
});

test('traffic routes stay on connected Niegocin water and can reach Ekomarina and the southern ports', () => {
  const navigation = createFleetNavigation(fleetWater, worldBounds, ports);
  for (const id of ['ekomarina', 'azs', 'rydzewo']) assert.ok(navigation.ports.some(port => port.id === id));
  for (const id of ['tajty', 'piekna-gora', 'ruda', 'kleszczewo']) assert.ok(!navigation.ports.some(port => port.id === id));
  const start = ports[0].approach[0];
  const end = ports.find(port => port.id === 'rydzewo').approach[0];
  const points = navigation.route(start, end);
  assert.deepEqual(points.at(-1), end);
  assert.ok(points.every((point, i) => navigation.leg(points[i - 1] ?? start, point, 4)));
  for (const site of navigation.anchorages) assert.ok(navigation.clear(site, 13));
  for (const [port, slots] of navigation.moorings) {
    for (const slot of slots.filter(slot => slot.sternTo)) {
      if (port.id !== 'ekomarina') assert.ok(Math.abs(Math.cos(slot.berth.heading - port.berth.heading)) < 1e-9);
      assert.ok([...slot.approach.slice(1), slot.berth].every((point, i) => navigation.leg(slot.approach[i], point, 4.4)));
    }
  }
  assert.ok(navigation.moorings.get(ports.find(port => port.id === 'bystry')).some(slot => slot.sternTo));
  assert.equal([...navigation.moorings.values()].flat().length, 35);
  const north = navigation.moorings.get(ports[0]).filter(slot => slot.sternTo);
  assert.equal(north.length, 20);
  for (const slot of north) {
    assert.ok(harborWalkableAt(slot.boardingPoint.x, slot.boardingPoint.y));
    const boat = {...makeBoat(), ...slot.berth};
    assert.ok(makeFast(boat, slot.berth));
    boat.moored = false;
    boat.engine = true;
    boat.gear = 1;
    for (let i = 0; i < 6 / dt; i++) stepBoat(boat, 0, dt, fleetWater, {...defaultWind, speed: 0});
    assert.ok(distance(boat, slot.berth) > 13);
  }
});

test('small craft use starboard crossing and meeting rules, sail priority, tacks and overtaking', () => {
  const east = {...makeBoat(), x: 0, y: 0, heading: 0, vx: 3, engine: true, gear: 1};
  const north = {...east, x: 24, y: 24, heading: -Math.PI / 2, vx: 0, vy: -3};
  assert.equal(encounter(east, north, 0), 'starboard crossing');
  assert.equal(encounter(north, east, 0), 'hold');
  const west = {...north, x: 36, y: 0, heading: Math.PI, vx: -3, vy: 0};
  assert.equal(encounter(east, west, 0), 'head-on');
  const pass = avoidTraffic(east, [east, west], 0, 3, 0, () => true);
  assert.ok(pass.heading > 0 && !pass.brake);
  const slower = {...east, x: 30, vx: 1};
  assert.equal(encounter(east, slower, 0), 'overtaking');
  assert.equal(encounter(slower, east, 0), 'hold');
  const port = {...east, heading: 1, engine: false, deployment: 1};
  const starboard = {...west, heading: -1, engine: false, deployment: 1};
  assert.equal(encounter(port, starboard, 0), 'port tack');
  assert.equal(encounter(starboard, port, 0), 'hold');
  assert.equal(encounter(east, starboard, 0), 'sail');
  assert.equal(encounter({...port, x: 12}, {...port, x: -12}, 0), 'windward');
  const moored = {...east, x: 5, moored: true, vx: 0};
  const contact = {...east};
  assert.ok(resolveBoatContact(contact, moored, false, true));
  assert.equal(moored.x, 5);
  assert.equal(contact.vx, 0);
  assert.equal(resolveBoatContact(contact, moored, false, true), false);
});

test('fifteen crews sail, fit lunch around the crossing, divert from busy ports, and settle after a night skip', () => {
  const player = makeBoat();
  const fleet = createFleet(fleetWater, worldBounds, ports);
  fleet.setCount(0, player, 720, sunAt(720));
  assert.equal(fleet.boats.length, 0);
  fleet.setCount(15, player, 720, sunAt(720));
  assert.equal(fleet.boats.length, 15);
  assert.equal(new Set(fleet.boats.map(boat => boat.name)).size, 15);
  assert.ok(fleet.boats.every(boat => distance(player, boat) > 26));

  function run(seconds, minute, mode, air = defaultWind) {
    const frame = {player, playerFixed: true, minute, sun: sunAt(minute), weather: {mode}, wind: {at: () => air}};
    for (let i = 0; i < seconds * 60; i++) fleet.update(dt, frame);
    const status = fleet.status();
    assert.ok(status.every(boat => Number.isFinite(boat.x) && Number.isFinite(boat.y)));
    const berthed = status.filter(boat => boat.moored);
    assert.equal(berthed.length, new Set(berthed.map(boat => boat.x + ',' + boat.y)).size);
    for (const boat of berthed) {
      const {berth} = boat;
      assert.deepEqual([boat.x, boat.y, boat.speed, boat.engine, boat.gear], [berth.x, berth.y, 0, false, 0]);
    }
    return status;
  }

  const cruising = run(110, 650, 'clear');
  assert.ok(cruising.filter(boat => boat.sail && boat.sailed > 100).length >= 10);
  const lunch = Array.from({length: 6}, () => run(25, 780, 'clear')).flat();
  assert.ok(lunch.some(boat => boat.intent === 'lunch' && boat.anchor));
  assert.ok(lunch.some(boat => boat.intent === 'lunch' && boat.moored));
  const storm = run(4, 795, 'storm', {...defaultWind, speed: 12});
  assert.ok(storm.every(boat => !boat.deployment && !boat.jibDeployment));
  assert.ok(storm.some(boat => boat.state === 'to-port' && boat.engine && boat.severe));
  const sheltered = run(290, 795, 'storm', {...defaultWind, speed: 12});
  assert.ok(sheltered.some(boat => boat.lastFull && boat.divertedAt > 29));
  assert.ok(sheltered.filter(boat => boat.moored).length >= 5);
  const night = run(280, 30, 'clear');
  assert.ok(night.some(boat => boat.anchor));
  assert.ok(night.every(boat => boat.moored || boat.anchor));
  const morning = run(170, 490, 'clear');
  assert.ok(morning.filter(boat => boat.sail).length >= 10);
  const [firstBoat] = fleet.boats;
  fleet.setCount(1, player, 490, sunAt(490));
  assert.deepEqual(fleet.boats, [firstBoat]);
  fleet.setCount(0, player, 490, sunAt(490));
  assert.ok(ports.every(port => !fleet.berthTaken(port, player)));
});

test('a crew backs into a perpendicular berth and comes out bow first', () => {
  const player = makeBoat();
  const fleet = createFleet(fleetWater, worldBounds, ports);
  fleet.setCount(2, player, 670, sunAt(670));
  const boat = fleet.boats[1];
  const port = ports.find(port => port.id === 'resort');
  const gate = port.approach[0];
  Object.assign(boat, {x: gate.x + 32, y: gate.y + 20, heading: -2.7});

  function run(seconds, mode) {
    const frame = {player, playerFixed: true, minute: 670, sun: sunAt(670), weather: {mode}, wind: {at: () => defaultWind}};
    for (let i = 0; i < seconds * 60; i++) fleet.update(dt, frame);
  }
  run(110, 'light');
  assert.equal(boat.port, port);
  assert.equal(boat.slot, port.sternBerth);
  assert.equal(boat.moored, true);
  assert.deepEqual([boat.x, boat.y, boat.heading], [boat.slot.berth.x, boat.slot.berth.y, boat.slot.berth.heading]);
  run(2, 'clear');
  assert.equal(boat.state, 'departing');
  assert.equal(boat.gear, 1);
  assert.ok(distance(boat, boat.slot.berth) > .5);
});

test('nine autonomous crews can berth together on the north quay', () => {
  const fleet = createFleet(fleetWater, worldBounds, ports);
  const player = makeBoat();
  const minute = 650;
  const sun = sunAt(minute);
  fleet.setCount(9, player, minute, sun);
  const quay = fleet.moorings.get(ports[0]).filter(slot => slot.sternTo);
  for (const boat of fleet.boats) {
    const gate = quay[boat.id * 2 + 1].approach[0];
    Object.assign(boat, {x: gate.x, y: gate.y + 20, heading: -Math.PI / 2, moored: false, slot: undefined, state: 'cruise'});
  }
  const frame = {player, playerFixed: true, minute, sun, weather: {mode: 'light'},
    wind: {at: () => ({...defaultWind, speed: 1})}};
  for (let i = 0; i < 180 / dt; i++) fleet.update(dt, frame);
  assert.ok(fleet.status().every(boat => boat.moored && boat.port === 'ekomarina' && boat.sternTo && !boat.contact));
  assert.equal(new Set(fleet.boats.map(boat => boat.slot)).size, 9);
});

test('night lamps track the rendered heave, pitch, roll and mast fold', () => {
  const origin = {x: 45, y: 65, heave: 0};
  const flat = {detail: 1, cx: 49.5, cy: 49.5, pivotZ: 3, direction: 0,
    pitchStep: 0, rollStep: 0, mastStep: 0, boardDepth: 0};
  const [mast, red, green, stern] = yachtLamps(origin, flat);
  const rocked = yachtLamps(origin, {...flat, rollStep: 17, pitchStep: 9});
  assert.equal(mast.x, origin.x);
  assert.ok(red.x > mast.x && green.x < mast.x && stern.y < mast.y);
  assert.ok(rocked[0].x - mast.x > 2.9);
  for (const [index, lamp] of [mast, red, green, stern].entries()) {
    assert.ok(Math.abs(rocked[index].screenY - lamp.screenY) > .1);
    assert.ok(Math.abs(yachtLamps({...origin, heave: .6}, flat)[index].screenY - lamp.screenY + .6) < 1e-9);
  }
  const [folded] = yachtLamps(origin, {...flat, mastStep: 8, cy: flat.cy + 21}, 'anchor');
  assert.ok(folded.y < mast.y - 5 && folded.height < mast.height - 4);
});

test('the anchor line follows the moving bow eye and keeps its water end fixed', () => {
  let strokes = 0;
  let splashes = 0;
  const starts = [], ends = [];
  const context = {
    save() {}, restore() {}, translate() {}, beginPath() {},
    moveTo(x, y) { starts.push({x, y}); },
    quadraticCurveTo(_x, _y, x, y) { ends.push({x, y}); },
    createLinearGradient: () => ({addColorStop() {}}),
    stroke() { strokes++; },
    ellipse() { splashes++; },
    fillRect() { splashes++; },
  };
  const view = {scale: 4, toScreen: point => point};
  const boat = {x: 0, y: 0, heave: 0};
  const pose = {detail: 1, cx: 49.5, cy: 49.5, pivotZ: 3, direction: 48,
    pitchStep: 0, rollStep: 0, mastStep: 0, boardDepth: 0};
  const flatEye = yachtBowEye(boat, pose);
  const raisedEye = yachtBowEye({...boat, heave: .4}, pose);
  const rockedEye = yachtBowEye({...boat, heave: .4}, {...pose, pitchStep: 7, rollStep: 15});
  assert.ok(flatEye.x > 3.6 && flatEye.x < 3.7);
  assert.ok(Math.abs(raisedEye.y - flatEye.y + .4) < 1e-9);
  assert.ok(Math.abs(rockedEye.y - raisedEye.y) > .25);

  const drop = {x: 5, y: 1, born: 0};
  drawAnchor(context, view, flatEye, drop, 0.2);
  assert.ok(splashes > 2);
  strokes = splashes = 0;
  drawAnchor(context, view, rockedEye, drop, 2);
  assert.equal(strokes, 1);
  assert.equal(splashes, 0);
  assert.deepEqual(starts, [flatEye, rockedEye]);
  assert.deepEqual(ends, [{x: drop.x, y: drop.y}, {x: drop.x, y: drop.y}]);
});

test('crew ballast heels a stationary or moored yacht and takes time to cross the cockpit', () => {
  const water = {shoreContact: () => null};
  const calm = {...defaultWind, speed: 0};
  const boat = {...makeBoat(), x: 0, y: 0};
  const run = (vessel, seconds) => {
    for (let i = 0; i < seconds * 60; i++) stepBoat(vessel, 0, dt, water, calm);
  };
  toggleAnchor(boat);
  setBallast(boat, 1, 80);
  run(boat, .1);
  assert.ok(boat.heel > 0 && boat.heel < .02);
  run(boat, 4);
  const lightHeel = boat.heel;
  assert.ok(lightHeel > .06 && lightHeel < .11);
  setBallast(boat, 1, 900);
  run(boat, 4);
  assert.equal(boat.ballastKg, maxBallastKg);
  assert.ok(boat.heel > lightHeel * 2.5);
  setBallast(boat, -1);
  run(boat, .1);
  assert.ok(boat.heel > 0);
  run(boat, 4);
  assert.ok(boat.heel < -.2);
  assert.deepEqual([boat.x, boat.y, boatSpeed(boat)], [0, 0, 0]);
  setBallast(boat, 0);
  run(boat, 5);
  assert.ok(Math.abs(boat.heel) < .001);
  assert.equal(boat.ballastKg, maxBallastKg);

  const berthed = {...makeBoat(), x: 0, y: 0, moored: true};
  setBallast(berthed, -1, 120);
  run(berthed, 5);
  assert.ok(berthed.heel < -.12);
  assert.deepEqual([berthed.x, berthed.y, boatSpeed(berthed)], [0, 0, 0]);
});

test('windward ballast counters sail heel and holds more drive than leeward ballast', () => {
  const water = {shoreContact: () => null};
  const wind = {speed: 4.6, from: Math.PI / 2};
  function reach(side, from = wind.from) {
    const boat = {...makeBoat(), x: 0, y: 0, heading: 0, sail: true, jib: true};
    setBallast(boat, side, 200);
    for (let i = 0; i < 10 / dt; i++) stepBoat(boat, 0, dt, water, {...wind, from});
    return boat;
  }
  const levelCrew = reach(0), windward = reach(-1), leeward = reach(1);
  assert.ok(windward.heel < levelCrew.heel - .1 && leeward.heel > levelCrew.heel + .08);
  assert.ok(boatSpeed(windward) > boatSpeed(levelCrew) && boatSpeed(levelCrew) > boatSpeed(leeward));
  assert.ok(Math.abs(reach(1, -wind.from).heel + windward.heel) < .001);
  windward.capsized = true;
  assert.ok(rightBoat(windward));
  assert.deepEqual([windward.ballastSide, windward.ballastShift, windward.ballastKg], [0, 0, 200]);
});

test('daily weather builds and clears a front while preserving the manual wind settings', () => {
  const daily = createDailyWeather(1);
  const samples = Array.from({length: 1441}, (_, minute) => daily(minute));
  assert.ok(samples.some(sample => sample.mode === 'light'));
  assert.ok(samples.some(sample => sample.mode === 'storm'));
  assert.ok(!Array.from({length: 1440}, (_, minute) => createDailyWeather(2)(minute)).some(sample => sample.mode === 'storm'));
  assert.ok(samples.every((sample, i) => i === 0 || Math.abs(sample.rain - samples[i - 1].rain) < .2));
  assert.equal(samples[0].rain, 0);
  assert.equal(samples.at(-1).rain, 0);
  const weather = createWeather();
  const wind = createWind();
  const boat = makeBoat();
  wind.setKnots(4);
  wind.setAutomatic(false);
  const front = samples.find(sample => sample.mode === 'storm');
  for (let i = 0; i < 8 / dt; i++) {
    weather.update(dt, wind.at(boat), boat, front);
    wind.update(dt, boat, weather.read());
  }
  assert.ok(weather.read().rain > .72 && wind.speed * knotsPerMeterPerSecond > 12);
  weather.set('clear');
  for (let i = 0; i < 22 / dt; i++) {
    weather.update(dt, wind.at(boat), boat);
    wind.update(dt, boat, weather.read());
  }
  assert.equal(wind.knots, 4);
  assert.ok(Math.abs(wind.speed * knotsPerMeterPerSecond - 4) < .01);
  assert.ok(weather.read().rain < .001);
});

test('prop wash originates at the stern under thrust and fades in neutral', () => {
  const foam = [];
  const context = {save() {}, restore() {}, beginPath() {}, fill() {}, fillRect() {}, ellipse(x, y) { foam.push({x, y}); }};
  const view = {scale: 1, toScreen: point => point};
  const boat = {...makeBoat(), x: 0, y: 0, heading: 0, engine: true, gear: 0};
  function fillWash(gear, engineBoost = false, isWater = () => true) {
    const wash = createPropWash(isWater);
    const powered = {...boat, gear, engineBoost};
    for (let i = 1; i <= 30; i++) wash.update(powered, i * dt, dt);
    foam.length = 0;
    wash.draw(context, view, 0.5);
    return wash;
  }
  fillWash(0);
  assert.equal(foam.length, 0);
  const wash = fillWash(1);
  const ahead = [...foam];
  assert.ok(ahead.length > 10 && ahead.every(p => p.x < -hull.length / 2));
  fillWash(-1);
  assert.ok(foam.some(p => p.x > -hull.length / 2));
  fillWash(1, true);
  assert.ok(foam.length > ahead.length * 1.8);
  fillWash(1, false, () => false);
  assert.equal(foam.length, 0);
  wash.update(boat, 1.5, dt);
  wash.draw(context, view, 1.5);
  assert.equal(foam.length, 0);

  for (const side of [-1, 1]) {
    const thruster = createPropWash(() => true);
    for (let i = 1; i <= 12; i++) thruster.update({...boat, engine: false, steeringJet: side}, i * dt, dt);
    foam.length = 0;
    thruster.draw(context, view, 0.2);
    assert.ok(foam.length > 4 && foam.every(p => p.x > 0 && Math.sign(p.y) === side));
  }
});

test('follow zoom moves scenery by fractional pixels between ticks and keeps the hull centred', () => {
  const before = {x: 4200, y: 1850};
  const after = {x: before.x - 0.015, y: before.y + 0.025};
  const screen = {width: 512, height: 288};
  const landmark = {x: 4210, y: 1830};
  for (const scale of [1, 4, 8]) {
    const positions = [0, 0.5, 1].map(blend => {
      const view = cameraView(after, screen, scale, before, blend);
      assert.deepEqual(view.toScreen(view.position), {x: 256, y: 144});
      return view.toScreen(landmark);
    });
    for (const axis of ['x', 'y']) {
      const delta = positions[1][axis] - positions[0][axis];
      assert.ok(Math.abs(delta) > 0 && Math.abs(delta) < 1);
      assert.ok(Math.abs(positions[2][axis] - positions[1][axis] - delta) < 1e-9);
    }
  }
});

test('a manual gust crosses the boat from upwind and expires at the chosen strength', () => {
  const wind = createWind();
  const boat = {x: 0, y: 0};
  wind.setBearing(90);
  wind.setKnots(6);
  wind.setGustKnots(8);
  wind.setAutomatic(false);
  assert.equal(windBearing(wind.at(boat).from), 90);
  wind.bump(boat);
  wind.update(1.2, boat);
  const [incoming] = wind.gustBands();
  assert.ok(incoming.x > boat.x && incoming.dx < 0 && incoming.strength > 0);
  assert.ok(wind.gustAt(8, 0) > wind.gustAt(-8, 0));
  wind.update(3, boat);
  assert.ok(wind.gustBands()[0].x < boat.x);
  assert.ok(wind.gustAt(-8, 0) > wind.gustAt(8, 0));
  assert.equal(wind.gustAt(0, 60), 0);
  assert.ok(wind.at(boat).speed * knotsPerMeterPerSecond <= 14);
  wind.update(20, boat);
  assert.deepEqual(wind.gustBands(), []);
  assert.equal(wind.at(boat).speed * knotsPerMeterPerSecond, 6);
  wind.setAutomatic(true);
  wind.update(6.1, boat);
  wind.update(5.5, boat);
  assert.ok(wind.at(boat).gust > 2);
  wind.setAutomatic(false);
  assert.equal(wind.at(boat).gust, 0);
});

test('editable wind changes the filled side and drives the sail only while wind is present', () => {
  const openWater = {shoreContact: () => null};
  const start = {...makeBoat(), x: 0, y: 0, heading: 0, sail: true, deployment: 1};
  const north = {from: -Math.PI / 2, speed: 5 / knotsPerMeterPerSecond};
  const south = {...north, from: Math.PI / 2};
  const boats = [north, south, {...north, speed: 0}, {...north, speed: 12 / knotsPerMeterPerSecond}].map(wind => {
    const boat = {...start};
    for (let i = 0; i < 480; i++) stepBoat(boat, 0, dt, openWater, wind);
    return boat;
  });
  assert.equal(boats[0].sailSide, 1);
  assert.equal(boats[1].sailSide, -1);
  assert.equal(boatSpeed(boats[2]), 0);
  assert.ok(boatSpeed(boats[3]) > boatSpeed(boats[0]) * 1.3);
});

test('fish rises need open water and fade before the next rise', () => {
  const isWater = (x, y) => x >= 0 && x < 80 && y >= 0 && y < 80;
  const fish = createFishRises(isWater);
  fish.update({x: 40, y: 40}, 3);
  const [rise] = fish.status();
  assert.ok(isWater(rise.x, rise.y) && isWater(rise.x + 2, rise.y - 2));
  assert.ok(Math.hypot(rise.x - 40, rise.y - 40) >= 9);
  fish.update({x: 40, y: 40}, 5.3);
  assert.deepEqual(fish.status(), []);
  fish.update({x: -200, y: -200}, 20);
  assert.deepEqual(fish.status(), []);
});

test('crows begin on separate perches and fly to other trees', () => {
  const trees = [[17, 5], [32, -5], [40, 15], [48, -10]].map(([x, y]) => ({x, y, anchorY: y}));
  const crows = createCrows(() => [...trees], tree => ({x: tree.x, y: tree.y - 8}));
  let flew = false;
  const visits = new Set();
  for (let i = 0; i < 52 / dt; i++) {
    crows.update(dt, {x: 0, y: 0});
    const perched = crows.status().filter(bird => bird.mode === 'perched');
    assert.equal(new Set(perched.map(bird => bird.tree.join(','))).size, perched.length);
    for (const bird of perched) {
      visits.add(bird.tree.join(','));
      assert.equal(bird.y, bird.tree[1] - 8);
    }
    if (crows.status().some(bird => bird.mode === 'flying' && bird.altitude > 1)) flew = true;
  }
  assert.ok(flew && visits.size > 2);
});

test('the summer sun lights Niegocin from the east at dawn and west at dusk', () => {
  const morning = daylightAt(5 * 60 + 25, true);
  const noon = daylightAt(12 * 60 + 39, true);
  const evening = daylightAt(19 * 60 + 53, true);
  assert.ok(morning.sun.x > 0 && evening.sun.x < 0);
  assert.ok(noon.sun.y > 0 && noon.sun.elevation > 55);
  assert.ok(evening.warmth > 0.8 && noon.warmth < 0.1);
  assert.ok(morning.shadows[0] < 0 && evening.shadows[0] > 0);
  assert.ok(Math.hypot(...evening.shadows) > Math.hypot(...noon.shadows));
  assert.ok(sunAt(0).elevation < 0);
  assert.equal(wrapDay(24 * 60 + 10), 10);
  assert.equal(wrapDay(-10), 24 * 60 - 10);
});

test('moonlight adds a cooler night reflection and directional shadows when enabled', () => {
  const moon = daylightAt(0, true);
  const dark = daylightAt(0, false);
  assert.equal(moon.source, 'moon');
  assert.ok(moon.moonAmount > 0.9);
  assert.ok(moon.grade.multiply[2] > dark.grade.multiply[2]);
  assert.ok(moon.color[0] < moon.color[2]);
  assert.equal(dark.source, null);
  assert.deepEqual(dark.shadows, [0, 0]);
});

test('crows finish their dusk flights and sleep on their perches until sunrise', () => {
  const trees = [[17, 5], [32, -5], [40, 15], [48, -10]].map(([x, y]) => ({x, y, anchorY: y}));
  const crows = createCrows(() => [...trees], tree => ({x: tree.x, y: tree.y - 8}));
  const boat = {x: 0, y: 0};
  for (let i = 0; i < 30 / dt && !crows.birds.some(bird => bird.mode === 'flying'); i++) crows.update(dt, boat);
  assert.ok(crows.birds.some(bird => bird.mode === 'flying'));
  const moonlessNight = birdsRoosting(daylightAt(0, false).sun);
  for (let i = 0; i < 8 / dt; i++) crows.update(dt, boat, moonlessNight);
  const roosts = crows.status();
  assert.equal(roosts.length, 2);
  assert.ok(roosts.every(bird => bird.mode === 'resting' && bird.altitude === 0 && bird.y === bird.tree[1] - 8));
  crows.update(60, {x: 250, y: 250}, moonlessNight);
  assert.deepEqual(crows.status(), roosts);
  crows.update(dt, boat, birdsRoosting(sunAt(6 * 60)));
  assert.ok(crows.birds.every(bird => bird.mode === 'perched'));
});

test('water birds visit a stationary boat and a single duck lands, swims and takes off', () => {
  const boat = makeBoat();
  const isWater = (x, y) => inHarbor(x, y) ? harborWaterAt(x, y) : world.depthAt(x, y) > 0;
  const wildlife = createWildlife(isWater, boat);
  const duckModes = new Set();
  let swanNearby = false;
  let swanForaged = false;
  let duckNearby = false;
  let cormorantOverhead = false;
  for (let i = 0; i < 100 / dt; i++) {
    wildlife.update(dt, boat);
    if (i % 15 !== 0) continue;
    const birds = wildlife.birds();
    assert.ok(birds.filter(bird => bird.species === 'mallard').length <= 1);
    for (const bird of birds) {
      const distance = Math.hypot(bird.x - boat.x, bird.y - boat.y);
      if (bird.mode === 'swimming') assert.ok(isWater(bird.x, bird.y));
      if (bird.species === 'swan' && distance < 12) swanNearby = true;
      if (bird.species === 'swan' && bird.feed > .8) swanForaged = true;
      if (bird.species === 'mallard') {
        duckModes.add(bird.mode);
        if (bird.mode === 'swimming' && distance < 8) duckNearby = true;
      }
      if (bird.species === 'cormorant' && bird.altitude > 10 && distance < 40) cormorantOverhead = true;
    }
  }
  assert.ok(wildlife.status().flocks.every(flock => flock.length >= 2));
  assert.deepEqual([...duckModes], ['flying', 'landing', 'swimming', 'taking off']);
  assert.ok(swanNearby && swanForaged && duckNearby && cormorantOverhead);
});

test('swans keep their identities and swim continuously through a boosted lake crossing', () => {
  const boat = {...makeBoat(), heading: Math.PI / 2 + 0.31, engine: true, gear: 1, engineBoost: true};
  const isWater = (x, y) => inHarbor(x, y) ? harborWaterAt(x, y) : world.depthAt(x, y) > 0;
  const wildlife = createWildlife(isWater, boat, {bounds: worldBounds});
  const swans = () => wildlife.birds().filter(bird => bird.species === 'swan');
  const initial = swans();
  assert.ok(wildlife.status().flocks.length > 2);
  const initialY = boat.y;
  let previous = initial.map(({x, y}) => ({x, y}));
  const inView = bird => Math.abs(bird.x - boat.x) < 64 && Math.abs(bird.y - boat.y) < 36;
  const initiallyVisible = new Set(initial.filter(inView));
  let anotherFlockEntered = false;

  for (let i = 0; i < 2220; i++) {
    stepBoat(boat, 0, dt, world);
    wildlife.update(dt, boat);
    if (i % 12 !== 11) continue;
    const current = swans();
    assert.equal(current.length, initial.length);
    for (const [index, bird] of current.entries()) {
      assert.equal(bird, initial[index]);
      assert.ok(Math.hypot(bird.x - previous[index].x, bird.y - previous[index].y) <= 2.8 * 12 * dt + 0.001);
      if (inView(bird) && !initiallyVisible.has(bird)) anotherFlockEntered = true;
    }
    previous = current.map(({x, y}) => ({x, y}));
  }
  assert.ok(boat.y > initialY + 500);
  assert.ok(anotherFlockEntered);
});

test('a fast approaching boat breaks up a swan flock on both sides of its path', () => {
  const boat = {x: 0, y: 0, vx: 0, vy: 0};
  const wildlife = createWildlife(() => true, boat);
  const first = wildlife.status().flocks[0];
  const start = wildlife.birds().slice(0, first.length).map(bird => bird.y);
  Object.assign(boat, {x: first[0].x - 21, y: first[0].y, vx: 9});
  for (let i = 0; i < 120; i++) {
    boat.x += boat.vx * dt;
    wildlife.update(dt, boat);
  }
  const shifts = wildlife.status().flocks[0].map((bird, i) => bird.y - start[i]);
  assert.ok(Math.max(...shifts) > 2.5 && Math.min(...shifts) < -2.5);
});

test('lake birds reach shoreline roosts at dusk and remain there until dawn', () => {
  const boat = makeBoat();
  const isWater = (x, y) => inHarbor(x, y) ? harborWaterAt(x, y) : world.depthAt(x, y) > 0;
  const wildlife = createWildlife(isWater, boat, {bounds: worldBounds, reliefAt: world.reliefAt});
  for (let i = 0; i < 7 / dt; i++) wildlife.update(dt, boat);
  const birds = wildlife.birds();
  assert.ok(birds.some(bird => bird.species === 'mallard' && bird.altitude > 0));
  assert.ok(birds.filter(bird => bird.species === 'cormorant' && bird.altitude > 0).length >= 3);
  const eveningMinute = 19 * 60 + 15;
  const dusk = sunAt(eveningMinute);
  assert.ok(dusk.elevation > 0 && birdsRoosting(dusk));
  wildlife.update(dt, boat, birdsRoosting(dusk));
  assert.ok(birds.filter(bird => bird.species !== 'swan').every(bird => bird.mode === 'landing'));
  for (let i = 0; i < 190 / dt; i++) {
    wildlife.update(dt, boat, birdsRoosting(sunAt(eveningMinute + i * dt)));
    assert.ok(birds.every(bird => bird.species !== 'swan' || isWater(bird.x, bird.y)));
  }
  for (const bird of birds) {
    assert.equal(bird.mode, 'resting', `${bird.species} at ${bird.x}, ${bird.y}`);
    const wet = bird.species !== 'cormorant';
    assert.equal(isWater(bird.x, bird.y), wet);
    assert.ok(Array.from({length: 12}, (_, i) => i * Math.PI / 6)
      .some(angle => isWater(bird.x + 4 * Math.cos(angle), bird.y + 4 * Math.sin(angle)) !== wet));
  }
  const asleep = wildlife.status();
  wildlife.update(60, {...boat, x: boat.x - 300}, birdsRoosting(daylightAt(0, true).sun));
  wildlife.update(60, boat, birdsRoosting(daylightAt(0, false).sun));
  assert.deepEqual(wildlife.status(), asleep);
  wildlife.update(dt, boat, birdsRoosting(sunAt(6 * 60)));
  assert.ok(birds.filter(bird => bird.species === 'swan').every(bird => bird.mode === 'swimming'));
  assert.equal(wildlife.status().duck.mode, 'taking off');
  assert.ok(wildlife.status().cormorants.every(bird => bird.mode === 'flying'));
});

test('the close camera still draws a swimming bird whose body can reach the frame', () => {
  const swan = {x: 4, y: 38.2, altitude: 0, mode: 'swimming'};
  const beyond = {...swan, y: 43};
  const view = {w: 512, h: 288, scale: 8, toScreen: ({x, y}) => ({x: x * 8, y: y * 8})};
  assert.deepEqual(visibleBirds([swan, beyond], view), [swan]);
});

test('Niegocin preserves surveyed islands and surrounding land cover on the terrain grid', () => {
  const surveyedLake = survey.lakes.find(({name}) => name === 'Niegocin');
  assert.equal(surveyedLake.rings.length, 3);
  assert.deepEqual([terrain.width, terrain.height], [survey.width, survey.height]);
  assert.equal(lake.coverAt(1000, 1625), landCover.water);
  assert.ok(lake.waterDepth(875, 1370) < 0);
  assert.ok(lake.waterDepth(2000, 1500) < 0);
  assert.equal(lake.coverAt(650, 1850), landCover.conifer);
  assert.equal(lake.coverAt(2550, 1800), landCover.field);
  assert.ok(lake.elevationAt(2550, 1800) > lake.elevationAt(1000, 1625) + 10);
});

test('terrain relief is terraced from measured elevations and joins the water plane', () => {
  const relief = createRelief({waterLevel: 116, highestPoint: 2400});
  assert.equal(relief.lift(150, 1), 0);
  assert.equal(relief.lift(150, 0), 0);
  assert.ok(relief.lift(150, -0.5) < relief.lift(150, -9));
  assert.ok(relief.lift(150, -9) > relief.lift(123, -9));
  assert.ok(relief.lift(2300, -9) > 1500);
  assert.ok(relief.maxLift >= relief.lift(2400, -9));
  const hill = toGame(2550 * survey.metersPerPixel, 1800 * survey.metersPerPixel);
  const water = toGame(1000 * survey.metersPerPixel, 1625 * survey.metersPerPixel);
  assert.ok(world.reliefAt(hill.x, hill.y) > 8);
  assert.equal(world.reliefAt(water.x, water.y), 0);
});

test('a terrain column draws a lit cap above darker visible strata and clips to the tile', () => {
  const image = {width: 1, height: 7, data: new Uint8ClampedArray(28)};
  writeSlices(image, 0, 1, 8, [125, 145, 88], 2);
  assert.equal(image.data[3], 0);
  assert.deepEqual([...image.data.slice(4, 8)], [125, 145, 88, 255]);
  assert.ok(image.data[9] < 145);
  assert.equal(image.data[27], 255);
});

test('raised terrain cuts its projected silhouette out of the reflection mask', () => {
  const image = {width: 2, height: 5, data: new Uint8ClampedArray(40)};
  const water = new Uint8Array(10).fill(1);
  writeSlices(image, 0, 1, 3, [125, 145, 88], 2, water);
  assert.deepEqual([...water], [1, 1, 0, 1, 0, 1, 0, 1, 1, 1]);
});

test('a cottage terrace joins its foundation to the surrounding slope and entrance path', () => {
  const cottage = {x: 30, y: 24 - foundationRise, anchorY: 30, heading: Math.PI / 2, scale: 0.3, model: {model: {w: 21, h: 29}}};
  const sites = createBuildingSites([cottage]);
  const sample = (x, y) => sampleBuildingSite(sites.row(y), x, y, 0.5);
  const slab = sample(30, 30);
  assert.equal(slab.foundation, 1);
  assert.equal(sample(30, 25.2).path, 1);
  assert.ok(slab.contact > sample(34, 30).contact);
  assert.equal(gradeAroundBuilding(7, slab) + foundationRise, cottage.anchorY - cottage.y);
  const approach = sample(30, 23.5);
  assert.ok(approach.path > 0.8 && approach.foundation === 0);
  const shoulder = gradeAroundBuilding(7, sample(35, 30));
  assert.ok(shoulder > 6 && shoulder < 7);
  assert.equal(gradeAroundBuilding(10, sample(41, 30)), 10);
  const roadAt = (x, y) => y < 21.5 ? landCover.road : landCover.grass;
  const connected = createBuildingSites([cottage], {coverAt: roadAt, waterDepth: () => -10});
  assert.ok(sampleBuildingSite(connected.row(22), 30, 22, 0.5).path > 0.8);
});

test('a building shadow shortens uphill and reverses with the light', () => {
  const cottage = {x: 0, y: 0, anchorY: 0, heading: Math.PI / 2, scale: 0.3, model: {model: {w: 21, h: 29, count: 19}}};
  const flat = projectBuildingShadow(cottage, [1, 0], () => 0);
  const slope = projectBuildingShadow(cottage, [1, 0], x => Math.max(0, x * 0.4));
  const opposite = projectBuildingShadow(cottage, [-1, 0], () => 0);
  const right = points => Math.max(...points.map(p => p.x));
  assert.ok(right(flat) > right(slope) + 1);
  assert.ok(right(slope) > right(opposite));
  assert.ok(Math.abs(right(flat) + Math.min(...opposite.map(p => p.x))) < 1e-8);
  assert.ok(slope.some(p => p.y < Math.min(...flat.map(point => point.y))));
});

test('shore buildings keep their full rotated footprints and projected roofs clear of the water', () => {
  const cottage = {model: {w: 63, h: 87, count: 55}, coarse: {model: {w: 21, count: 19}}};
  const boathouse = {model: {w: 108, h: 93, count: 75}, coarse: {model: {w: 36, count: 24}}};
  const {buildings} = placeBuildings(world, [cottage, cottage, boathouse]);
  assert.ok(buildings.length > 0);
  for (const {x, y, anchorY, heading, scale, heightScale, model: {model: {w, h, count}, coarse}} of buildings) {
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const layers = Math.max(count, coarse.model.count * w / coarse.model.w);
    const top = y - layers * scale * heightScale / Voxel.SQUASH;
    const rows = Math.ceil(h * scale * 4);
    const columns = Math.ceil(w * scale * 4);
    for (let row = 0; row <= rows; row++) {
      const along = h * scale * (row / rows - 0.5);
      for (let col = 0; col <= columns; col++) {
        const across = w * scale * (col / columns - 0.5);
        const sampleX = x + along * cos - across * sin;
        const offsetY = along * sin + across * cos;
        const groundY = anchorY + offsetY;
        const roofY = top + offsetY;
        for (const sampleY of [groundY, (groundY + roofY) / 2, roofY]) {
          assert.ok(world.waterDepth(sampleX, sampleY) < 0, `Building at ${x}, ${anchorY} overlaps the water`);
        }
      }
    }
  }
});

test('Rydzewo buildings fit on the projected bank with space between them', () => {
  const model = {model: {w: 21, h: 29, count: 19}};
  const {buildings, nearBuilding} = placeBuildings(world, [model, model, model]);
  const [x, y] = survey.towns.Rydzewo.map(value => value * survey.metersPerPixel);
  const village = toGame(x, y);
  const nearby = buildings.filter(b => Math.hypot(b.x - village.x, b.anchorY - village.y) < 44);
  assert.ok(nearby.length >= 5);
  for (const [index, building] of nearby.entries()) {
    assert.ok(world.waterDepth(building.x, building.anchorY) < 0);
    assert.ok(nearBuilding(building.x, building.anchorY));
    assert.equal(building.y, building.anchorY - world.reliefAt(building.x, building.anchorY) - foundationRise);
    for (const other of nearby.slice(0, index)) {
      assert.ok(Math.hypot(building.x - other.x, building.anchorY - other.anchorY) >= building.spacing + other.spacing);
    }
  }
});

test('open water is shortened while the Ekomarina berth and approach keep their original scale', () => {
  for (const {x, y} of [berth, ...approach, makeBoat()]) assert.deepEqual(toGame(x, y), {x, y});
  const south = {x: 4280, y: 8800};
  const goal = toGame(south.x, south.y);
  const start = makeBoat();
  assert.ok(Math.hypot(goal.x - start.x, goal.y - start.y) < 720);
  const source = toSurvey(goal.x, goal.y);
  assert.ok(Math.hypot(source.x - south.x, source.y - south.y) < 0.001);
  const island = toGame(2000 * survey.metersPerPixel, 1500 * survey.metersPerPixel);
  assert.ok(world.depthAt(island.x, island.y) < 0);
});

test('the yacht can sail past the orthophoto crop into the compressed lake', () => {
  const boat = makeBoat();
  boat.heading = Math.PI / 2 + 0.31;
  boat.sail = true;
  for (let i = 0; i < 60 / dt; i++) stepBoat(boat, 0, dt, world);
  assert.ok(boat.y > harborBounds.south + 35);
  assert.ok(boatSpeed(boat) > 2);
  assert.ok(world.depthAt(boat.x, boat.y) > 0);
});

test('the compact marina removes the old raster pier from navigable water', () => {
  const formerPier = {x: 4326, y: 1860};
  assert.ok(lake.waterDepth(formerPier.x / survey.metersPerPixel, formerPier.y / survey.metersPerPixel) < 0);
  assert.ok(harborWaterAt(formerPier.x, formerPier.y));
  assert.ok(world.groundAt(formerPier.x, formerPier.y).depth > 0);
});

test('the traced Ekomarina waterline resolves within a metre on both sides of the bank', () => {
  const x = 4321;
  for (const [y, wet] of [[1762.02, false], [1762.22, true]]) {
    assert.equal(harborWaterAt(x, y), wet);
    assert.equal(world.groundAt(x, y).depth > 0, wet);
  }
});

test('the dock has a walkable connection from the boarding point to the shore', () => {
  const pontoons = harborStructures.filter(({style}) => style === 'pontoon');
  assert.equal(pontoons.length, 3);
  const pier = pontoons.find(({centerline: [a, b]}) =>
    Math.abs(Math.hypot(boardingPoint.x - a.x, boardingPoint.y - a.y)
      + Math.hypot(boardingPoint.x - b.x, boardingPoint.y - b.y) - Math.hypot(a.x - b.x, a.y - b.y)) < 0.01);
  const [shore, end] = pier.centerline;
  assert.equal(harborWalkableAt(boardingPoint.x, boardingPoint.y), true);
  assert.equal(harborWalkableAt(berth.x, berth.y), false);
  for (let t = 0; t < 1; t += 0.05) {
    assert.equal(harborWalkableAt(shore.x + (end.x - shore.x) * t, shore.y + (end.y - shore.y) * t), true);
  }
  const walker = {...boardingPoint};
  for (let i = 0; i < 2100; i++) {
    moveWalker(walker, 0, -0.03);
    assert.equal(harborWalkableAt(walker.x, walker.y), true);
  }
  assert.ok(walker.y < shore.y + 1);
});

test('the sail gains and loses working area gradually and can reverse while moving', () => {
  const boat = makeBoat();
  boat.sail = true;
  for (let i = 0; i < 30; i++) stepBoat(boat, 0, dt, world);
  const raising = boat.deployment;
  assert.ok(raising > 0.15 && raising < 0.4);
  boat.sail = false;
  stepBoat(boat, 0, dt, world);
  assert.ok(boat.deployment > 0 && boat.deployment < raising);
  for (let i = 0; i < 60; i++) stepBoat(boat, 0, dt, world);
  assert.equal(boat.deployment, 0);
  boat.sail = true;
  for (let i = 0; i < 110; i++) stepBoat(boat, 0, dt, world);
  assert.equal(boat.deployment, 1);
});

test('trim favors tighter sheets upwind and eased sheets downwind', () => {
  const boat = makeBoat();
  const score = (angle, trim) => sailTrim({...boat, heading: windFrom + angle, trim}).efficiency;
  assert.ok(score(0.9, 0.125) > score(0.9, 1));
  assert.ok(score(Math.PI, 1) > score(Math.PI, 0.125));
  assert.equal(score(0, 0.125), 0);
});

test('the jib hoists, reverses and crosses over independently of the mainsail', () => {
  const water = {shoreContact: () => null};
  const boat = {...makeBoat(), x: 0, y: 0, heading: 0, sail: true, deployment: 1, jib: true};
  const wind = {from: Math.PI / 2, speed: 4};
  for (let i = 0; i < 30; i++) stepBoat(boat, 0, dt, water, wind);
  const partlyRaised = boat.jibDeployment;
  assert.ok(partlyRaised > 0 && partlyRaised < 1);
  assert.ok(boat.jibAngle > 0);
  boat.jib = false;
  stepBoat(boat, 0, dt, water, wind);
  assert.ok(boat.jibDeployment > 0 && boat.jibDeployment < partlyRaised);
  boat.jib = true;
  const opposite = {...wind, from: -wind.from};
  stepBoat(boat, 0, dt, water, opposite);
  assert.ok(boat.jibAngle > 0);
  for (let i = 0; i < 100; i++) stepBoat(boat, 0, dt, water, opposite);
  assert.equal(boat.jibDeployment, 1);
  assert.ok(boat.jibAngle < 0);
  boat.jib = false;
  for (let i = 0; i < 100; i++) stepBoat(boat, 0, dt, water, opposite);
  assert.equal(boat.jibDeployment, 0);
  assert.equal(boat.deployment, 1);
});

test('a trimmed jib adds speed on a reach and luffs head-to-wind', () => {
  const water = {shoreContact: () => null};
  const wind = {from: 0, speed: 3.5};
  function sail(heading, main, jib, jibSheet, conditions = wind) {
    const boat = {...makeBoat(), x: 0, y: 0, heading, trim: 0.4, sail: main, jib, jibSheet};
    for (let i = 0; i < 900; i++) stepBoat(boat, 0, dt, water, conditions);
    return boatSpeed(boat);
  }
  const main = sail(Math.PI / 2, true, false, 0.5);
  const both = sail(Math.PI / 2, true, true, 0.5);
  assert.ok(both > main + 0.25);
  assert.ok(Math.abs(both - sail(-Math.PI / 2, true, true, 0.5)) < 0.001);
  assert.ok(sail(Math.PI / 2, false, true, 0.5) > 0.65);
  assert.ok(sail(Math.PI / 2, false, true, 0.5) > sail(Math.PI / 2, false, true, 0.02));
  assert.equal(sail(0, true, true, 0.2), 0);
  assert.equal(sail(Math.PI / 2, true, true, 0.5, {...wind, speed: 0}), 0);
  const runner = {...makeBoat(), heading: Math.PI, jibSheet: 1};
  assert.ok(jibTrim(runner, wind).drive > 3 * jibTrim({...runner, deployment: 1}, wind).drive);
  const upwind = {...makeBoat(), heading: 0.85};
  assert.ok(jibTrim({...upwind, jibSheet: 0.2}, wind).drive > jibTrim({...upwind, jibSheet: 1}, wind).drive);
});

test('na motyla exposes the jib and adds drive when the wind is astern', () => {
  const water = {shoreContact: () => null};
  const wind = {from: Math.PI, speed: 3.6};
  const boat = {...makeBoat(), x: 0, y: 0, heading: 0, sail: true, deployment: 1, jib: true, jibDeployment: 1, trim: 1, jibSheet: 1};
  const settle = (boat, conditions) => {
    for (let i = 0; i < 420; i++) stepBoat(boat, 0, dt, water, conditions);
  };
  assert.equal(canGoosewing({...boat, jib: false}, wind), false);
  assert.equal(toggleGoosewing(boat, {...wind, from: Math.PI / 2}), false);
  settle(boat, wind);
  const sameSide = boatSpeed(boat);
  assert.ok(sameSide > 0 && jibTrim(boat, wind).shelter > 0.75);
  assert.equal(toggleGoosewing(boat, wind), true);
  settle(boat, wind);
  assert.equal(boat.goosewing, true);
  assert.equal(Math.sign(boat.jibAngle), boat.sailSide);
  assert.ok(jibTrim(boat, wind).shelter < 0.1 && boatSpeed(boat) > sameSide * 1.2);

  const initialSide = boat.sailSide;
  for (const angle of [-0.045, 0.045]) {
    settle(boat, {...wind, from: Math.PI + angle});
    assert.equal(boat.sailSide, initialSide);
    assert.equal(Math.sign(boat.jibAngle), initialSide);
  }
  settle(boat, {...wind, from: Math.PI / 2});
  assert.equal(boat.goosewing, false);
  assert.equal(Math.sign(boat.jibAngle), -boat.sailSide);
});

test('low-speed steering pulses turn the bow with the main engine off', () => {
  const water = {shoreContact: () => null};
  const calm = {from: 0, speed: 0};
  for (const rudder of [-1, 1]) {
    const boat = {...makeBoat(), x: 0, y: 0, heading: 0, sail: true};
    const jet = new Set();
    for (let i = 0; i < 60; i++) {
      stepBoat(boat, rudder, dt, water, calm);
      jet.add(Math.sign(boat.steeringJet));
    }
    assert.deepEqual([...jet], [-rudder, 0]);
    assert.ok(rudder * Math.atan2(Math.sin(boat.heading), Math.cos(boat.heading)) > 0.35);
    assert.equal(boat.engine, false);
    assert.ok(boatSpeed(boat) < 0.12);
    assert.ok(boat.vy * rudder > 0);
    stepBoat(boat, 0, dt, water, calm);
    assert.equal(boat.steeringJet, 0);

    Object.assign(boat, {heading: 0, vx: 1.5, vy: 0});
    stepBoat(boat, rudder, dt, water, calm);
    assert.equal(boat.steeringJet, 0);
    Object.assign(boat, {vx: 0, anchor: {x: boat.x, y: boat.y}});
    stepBoat(boat, rudder, dt, water, calm);
    assert.equal(boat.steeringJet, 0);
  }
});

test('heel follows apparent wind, sail area and trim on either tack', () => {
  const water = {shoreContact: () => null};
  const beamWind = {from: Math.PI / 2, speed: 4};
  function steadyHeel(rig, wind = beamWind) {
    const boat = {...makeBoat(), x: 0, y: 0, heading: 0, ...rig};
    for (let i = 0; i < 420; i++) stepBoat(boat, 0, dt, water, wind);
    return boat.heel;
  }

  const main = steadyHeel({sail: true});
  const jib = steadyHeel({jib: true});
  const both = steadyHeel({sail: true, jib: true});
  assert.ok(jib > 0 && main > jib && both > main);
  assert.ok(Math.abs(both + steadyHeel({sail: true, jib: true}, {...beamWind, from: -beamWind.from})) < 0.001);
  assert.ok(both > steadyHeel({sail: true, jib: true, trim: 1, jibSheet: 1}));
  assert.ok(both > steadyHeel({sail: true, jib: true}, {...beamWind, speed: 2.5}));
  assert.equal(steadyHeel({}), 0);
  assert.equal(steadyHeel({sail: true, jib: true}, {...beamWind, speed: 0}), 0);
  assert.equal(steadyHeel({sail: true, jib: true}, {...beamWind, from: 0}), 0);
  assert.ok(Math.abs(steadyHeel({sail: true, jib: true}, {...beamWind, from: Math.PI})) < 0.001);
});

test('a gust builds heel at anchor and lowering the sails lets the hull right itself', () => {
  const water = {shoreContact: () => null};
  const boat = {...makeBoat(), x: 0, y: 0, heading: 0, sail: true, jib: true, anchor: {x: 0, y: 0}};
  const wind = createWind();
  wind.setBearing(180);
  wind.setKnots(5);
  wind.setGustKnots(7);
  wind.setAutomatic(false);
  function advance(seconds) {
    let peak = Math.abs(boat.heel);
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      wind.update(dt, boat);
      stepBoat(boat, 0, dt, water, wind.at(boat));
      peak = Math.max(peak, Math.abs(boat.heel));
    }
    return peak;
  }
  advance(5);
  const steady = boat.heel;
  wind.bump(boat);
  advance(dt);
  assert.ok(Math.abs(boat.heel - steady) < 0.01);
  assert.ok(advance(6) > steady + 0.08);
  assert.ok(Math.hypot(boat.x, boat.y) <= 3.001);
  boat.sail = false;
  boat.jib = false;
  advance(dt);
  assert.ok(boat.heel > 0.03);
  advance(6);
  assert.ok(Math.abs(boat.heel) < 0.001 && Math.abs(boat.heelRate) < 0.001);
});

test('gusts accelerate and shove the yacht leeward, with capsize depending on the rig', () => {
  const water = {shoreContact: () => null};
  function run(gust, setup = {}, bearing = 180) {
    const boat = {...makeBoat(), x: 0, y: 0, heading: 0, sail: true, jib: true, trim: 0.52, jibSheet: 0.57, ...setup};
    const wind = createWind();
    wind.setBearing(bearing);
    wind.setKnots(14);
    wind.setGustKnots(gust);
    wind.setAutomatic(false);
    function step() {
      wind.update(dt, boat);
      stepBoat(boat, 0, dt, water, wind.at(boat));
    }
    for (let i = 0; i < 360; i++) step();
    const steady = {speed: boatSpeed(boat), heel: boat.heel};
    wind.bump(boat);
    let peakHeel = 0;
    let peakSpeed = 0;
    let leeway = 0;
    for (let i = 0; i < 480; i++) {
      step();
      peakHeel = Math.max(peakHeel, Math.abs(boat.heel));
      peakSpeed = Math.max(peakSpeed, boatSpeed(boat));
      leeway = Math.min(leeway, boat.vy);
    }
    return {boat, peakHeel, peakSpeed, leeway, steady};
  }
  const knockdown = run(8);
  assert.ok(knockdown.peakHeel > Math.PI / 3 && !knockdown.boat.capsized);
  assert.ok(Math.abs(knockdown.boat.heel - knockdown.steady.heel) < 0.06);
  assert.ok(knockdown.peakSpeed > knockdown.steady.speed + 1 && knockdown.leeway < -0.7);
  const heavy = run(12);
  assert.ok(heavy.boat.capsized && heavy.peakHeel >= Math.PI / 2);
  assert.equal(boatSpeed(heavy.boat), 0);
  assert.equal(heavy.boat.engine, false);
  const position = [heavy.boat.x, heavy.boat.y];
  assert.equal(rightBoat(heavy.boat), true);
  assert.deepEqual([heavy.boat.x, heavy.boat.y], position);
  assert.equal(heavy.boat.heel, 0);
  assert.equal(heavy.boat.deployment + heavy.boat.jibDeployment, 0);
  assert.equal(heavy.boat.capsized, false);
  assert.ok(!run(12, {jib: false}).boat.capsized);
  assert.ok(!run(12, {trim: 1, jibSheet: 1}).boat.capsized);
  assert.ok(!run(12, {}, 90).boat.capsized);
});

test('the anchor takes the engine out of gear, restrains the boat and can be weighed', () => {
  const boat = {...makeBoat(), heading: Math.PI / 2 + 0.31, sail: true, engine: true, gear: 1};
  for (let i = 0; i < 240; i++) stepBoat(boat, 0, dt, world);
  assert.equal(toggleAnchor(boat), true);
  assert.equal(boat.gear, 0);
  const anchor = {...boat.anchor};
  for (let i = 0; i < 900; i++) stepBoat(boat, 0, dt, world);
  assert.ok(Math.hypot(boat.x - anchor.x, boat.y - anchor.y) <= 3.001);
  assert.ok(boatSpeed(boat) < 0.05);
  assert.equal(toggleAnchor(boat), true);
  for (let i = 0; i < 360; i++) stepBoat(boat, 0, dt, world);
  assert.ok(Math.hypot(boat.x - anchor.x, boat.y - anchor.y) > 5);
});

test('the boat uses metre-scale propulsion and coasts in neutral', () => {
  const boat = makeBoat();
  assert.equal(hull.length, 7.35);
  assert.equal(hull.beam, 2.7);
  boat.gear = 1;
  const start = boat.y;
  for (let i = 0; i < 300; i++) stepBoat(boat, 0, dt, world);
  assert.equal(boat.y, start);
  boat.engine = true;
  for (let i = 0; i < 480; i++) stepBoat(boat, 0, dt, world);
  assert.ok(boat.y < start - 7);
  assert.ok(boatSpeed(boat) > 2.7 && boatSpeed(boat) <= 2.8);
  boat.gear = 0;
  const before = boat.y;
  stepBoat(boat, 0, dt, world);
  assert.ok(boat.y < before);
  for (let i = 0; i < 600; i++) stepBoat(boat, 0, dt, world);
  assert.ok(boatSpeed(boat) > .85 && boatSpeed(boat) < 1.3);
  assert.ok(sailPower(windFrom + Math.PI / 2) > sailPower(windFrom));
});

test('coasting keeps rudder authority and the mast folds only with both sails down', () => {
  const calm = {from: 0, speed: 0};
  const water = {shoreContact: () => null};
  const boat = {...makeBoat(), x: 0, y: 0, heading: 0, vx: 2.8, sail: true, deployment: 1};
  assert.equal(toggleMast(boat), false);
  boat.sail = false;
  for (let i = 0; i < 120; i++) stepBoat(boat, i > 80 ? 1 : 0, dt, water, calm);
  assert.ok(boatSpeed(boat) > 1.05);
  assert.ok(boat.heading > 0.1);
  assert.equal(boat.steeringJet, 0);
  assert.equal(toggleMast(boat), true);
  for (let i = 0; i < 165; i++) stepBoat(boat, 0, dt, water, calm);
  assert.equal(boat.mastFold, 1);
});

test('a moving yacht can make a half turn under its own way after lowering sail or stopping the engine', () => {
  const water = {shoreContact: () => null};
  for (const sailing of [true, false]) {
    const wind = sailing ? {from: Math.PI / 2, speed: 3.6} : {from: 0, speed: 0};
    const boat = {...makeBoat(), x: 4100, y: 2200, heading: 0, sail: sailing, engine: !sailing, gear: Number(!sailing)};
    for (let i = 0; i < 720; i++) stepBoat(boat, 0, dt, water, wind);
    boat.sail = boat.engine = false;
    let ticks = 0;
    while (boat.heading < Math.PI && ticks < 720) {
      stepBoat(boat, 1, dt, water, wind);
      assert.equal(boat.steeringJet, 0);
      ticks++;
    }
    assert.ok(boat.heading >= Math.PI);
    assert.ok(boatSpeed(boat) >= .95);
  }
});

test('rain follows a wind reversal and each lightning strike has its own sound delay', () => {
  const weather = createWeather();
  weather.set('storm');
  for (let i = 0; i < 100; i++) weather.update(dt, {from: Math.PI, speed: 12});
  const before = weather.read();
  assert.ok(before.rainX > 40 && before.driftX > 0);
  for (let i = 0; i < 60; i++) weather.update(dt, {from: 0, speed: 12});
  assert.ok(weather.read().rainX < -40);
  while (!weather.read().strike && weather.read().time < 8) weather.update(dt);
  const lightning = weather.read();
  assert.ok(lightning.flash > .2);
  assert.equal(lightning.strike.id, 1);
  assert.ok(thunderDelay(lightning.strike.distance) > 9);
  for (let i = 0; i < 30; i++) weather.update(dt);
  assert.equal(weather.read().flash, 0);
  assert.equal(weather.read().strike, lightning.strike);
});

test('lightning gets progressively closer as a storm approaches', () => {
  const weather = createWeather();
  weather.set('storm');
  const strikes = new Map();
  for (let i = 0; i < 63 / dt; i++) {
    weather.update(dt);
    const {strike} = weather.read();
    if (strike) strikes.set(strike.id, strike);
  }
  const distances = Array.from(strikes.values(), strike => strike.distance);
  assert.ok(distances.length >= 4);
  assert.ok(distances.every((distance, i) => i === 0 || distance < distances[i - 1]));
  assert.ok(thunderDelay(distances[0]) > 9);
  assert.ok(thunderDelay(distances.at(-1)) < 4);
});

test('a broadside wind drives leeway with sails down and still rolls an anchored yacht', () => {
  const water = {shoreContact: () => null};
  const wind = {from: Math.PI / 2, speed: 14};
  const boat = {...makeBoat(), x: 0, y: 0, heading: 0};
  for (let i = 0; i < 6 / dt; i++) stepBoat(boat, 0, dt, water, wind);
  assert.ok(boat.y < -13 && Math.abs(boat.x) < .01);
  const headwind = {...makeBoat(), x: 0, y: 0, heading: 0};
  for (let i = 0; i < 6 / dt; i++) stepBoat(headwind, 0, dt, water, {...wind, from: 0});
  assert.ok(headwind.x < -4 && Math.abs(headwind.y) < .01);
  toggleAnchor(boat);
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < 12 / dt; i++) {
    stepBoat(boat, 0, dt, water, wind);
    low = Math.min(low, boat.waveRoll);
    high = Math.max(high, boat.waveRoll);
  }
  assert.ok(low < -.12 && high > .23);
  assert.ok(Math.hypot(boat.x - boat.anchor.x, boat.y - boat.anchor.y) <= 3.001);
});

test('sail luff builds with wind in the no-go zone and settles on a reach', () => {
  const water = {shoreContact: () => null};
  const boat = {...makeBoat(), x: 0, y: 0, heading: 0, sail: true, jib: true};
  function luff(from, speed) {
    for (let i = 0; i < 1 / dt; i++) stepBoat(boat, 0, dt, water, {from, speed});
    return boat.sailLuff;
  }
  assert.equal(luff(0, 0), 0);
  const breeze = luff(0, 3);
  assert.ok(breeze > .25 && breeze < .6);
  assert.ok(luff(0, 12) > .9);
  assert.ok(luff(Math.PI / 2, 7) < .03);
});

test('storks land and forage in fields and fly over the intervening water', () => {
  const field = (x, y) => (x < -8 || x > 8) && Math.abs(x) < 140 && Math.abs(y) < 140;
  const storks = createStorks(field, () => 0, {west: -140, east: 140, north: -140, south: 140}, {x: 0, y: 0});
  const seen = new Set();
  let crossedWater = false;
  let pecks = 0;
  for (let i = 0; i < 45 / dt; i++) {
    storks.update(dt);
    for (const bird of storks.birds) {
      seen.add(bird.mode);
      if (bird.feed > .8) pecks++;
      if (bird.mode === 'flying' || bird.mode === 'landing') {
        if (!field(bird.x, bird.y) && bird.altitude > 4) crossedWater = true;
      } else {
        assert.ok(field(bird.x, bird.y));
        assert.equal(bird.altitude, 0);
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['feeding', 'flying', 'landing', 'standing', 'walking']);
  assert.ok(crossedWater && pecks > 0);
});

test('weather builds rain and wind, drives waves and uses the two warning cadences', () => {
  const weather = createWeather();
  const wind = createWind();
  const boat = {...makeBoat(), x: 0, y: 0, heading: 0};
  const start = wind.speed;
  wind.setVariable(true);
  weather.set('heavy');
  for (let i = 0; i < 600; i++) {
    weather.update(dt);
    wind.update(dt, boat, weather.read());
  }
  assert.ok(wind.speed > start + 2 && weather.read().rain > .7);
  assert.notEqual(wind.from, windFrom);
  assert.equal(warningRate(wind.at(boat), weather.read(), true), 40);
  weather.set('storm');
  assert.equal(warningRate(wind.at(boat), weather.read(), true), 90);
  assert.equal(warningRate(wind.at(boat), weather.read(), false), 0);
  for (const rate of [40, 90]) {
    let edges = 0;
    let previous = false;
    for (let i = 0; i < 7200; i++) {
      const lit = warningFlash(i / 120, rate);
      if (lit && !previous) edges++;
      previous = lit;
    }
    assert.equal(edges, rate);
  }
  assert.ok(waveAt(0, 0, 2, {from: 0, speed: 13}).strength > .8);
  assert.equal(waveAt(0, 0, 2, {from: 0, speed: 2}).height, 0);
  for (let i = 0; i < 120; i++) stepBoat(boat, 0, dt, {shoreContact: () => null}, {from: .8, speed: 13});
  assert.ok(Math.abs(boat.heave) + Math.abs(boat.waveRoll) + Math.abs(boat.wavePitch) > .06);
});

test('wave phase near the yacht survives a shift in wind direction', () => {
  const boat = {x: 4028, y: 1840};
  const wind = createWind();
  wind.setKnots(28);
  wind.update(dt, boat);
  const before = waveAt(boat.x, boat.y, 10, wind.at(boat));
  wind.setBearing(143);
  wind.update(dt, boat);
  assert.equal(waveAt(boat.x, boat.y, 10, wind.at(boat)).height, before.height);
});

test('water birds give the traced quay and added pontoons clearance', () => {
  for (const {outline} of harborStructures) {
    const center = outline.reduce((at, p) => ({x: at.x + p.x / outline.length, y: at.y + p.y / outline.length}), {x: 0, y: 0});
    assert.ok(waterbirdObstacleAt(center.x, center.y));
  }
  for (const port of ports.filter(port => port.dock)) {
    assert.ok(waterbirdObstacleAt(port.boardingPoint.x, port.boardingPoint.y));
    assert.ok(!waterbirdObstacleAt(port.berth.x, port.berth.y));
  }
});

test('the swan clearance follows the anchored hull from bow to stern', () => {
  const boat = {...makeBoat(), x: 0, y: 0, heading: Math.PI / 2, anchor: {x: 0, y: 0}};
  for (const y of [-3.5, 0, 3.5]) assert.ok(birdHullClearance({x: 0, y}, boat) < 0);
  assert.ok(birdHullClearance({x: 2.2, y: 0}, boat) > .75);
  assert.ok(birdHullClearance({x: 0, y: 4.5}, boat) > .75);
});

test('each added port can be entered, moored, walked on and departed', () => {
  const calm = {from: 0, speed: 0};
  for (const port of ports.filter(port => port.dock)) {
    const target = port.berth;
    const start = port.approach[0];
    const boat = {...makeBoat(), ...start, heading: target.heading, engine: true, gear: 1};
    const distance = () => (boat.x - target.x) * Math.cos(target.heading) + (boat.y - target.y) * Math.sin(target.heading);
    const lake = {...world, portContact};
    for (let i = 0; i < 40 / dt && !boat.moored; i++) {
      if (distance() > (inHarbor(boat.x, boat.y) ? -5 : -6.3)) boat.gear = 0;
      stepBoat(boat, 0, dt, lake, calm);
      makeFast(boat, target);
    }
    assert.ok(boat.moored, port.name + ' · ' + berthStatus(boat, target));
    const walker = {...port.boardingPoint};
    walkAtPort(port, walker, Math.cos(target.heading), Math.sin(target.heading), world.waterDepth);
    assert.ok(Math.hypot(walker.x - port.boardingPoint.x, walker.y - port.boardingPoint.y) > 0.9, port.name);
    Object.assign(boat, {moored: false, engine: true, gear: -1});
    for (let i = 0; i < 4 / dt; i++) stepBoat(boat, 0, dt, lake, calm);
    assert.ok(distance() < -4.5, port.name);
  }
});

test('test boost speeds up ahead travel, releases promptly and cancels when anchored', () => {
  const boat = {...makeBoat(), heading: Math.PI / 2 + 0.31, engine: true, gear: 1, engineBoost: true};
  const start = boat.y;
  for (let i = 0; i < 24 / dt; i++) stepBoat(boat, 0, dt, world);
  assert.ok(boat.y > start + 345);
  assert.ok(boatSpeed(boat) > 16);
  boat.engineBoost = false;
  for (let i = 0; i < 3 / dt; i++) stepBoat(boat, 0, dt, world);
  assert.ok(boatSpeed(boat) > 2.8 && boatSpeed(boat) < 3);
  boat.engineBoost = true;
  assert.equal(toggleAnchor(boat), true);
  assert.equal(boat.engineBoost, false);
  assert.equal(boat.gear, 0);
});

test('Ekomarina pontoons block the moving hull while the marked berth is water', () => {
  const pier = harborStructures.find(({style}) => style === 'pontoon');
  const [a, b] = pier.centerline;
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  assert.equal(harborWaterAt(x, y), false);
  assert.equal(harborWaterAt(berth.x, berth.y), true);
  for (const engineBoost of [false, true]) {
    const boat = {...makeBoat(), x: x + 7, y, heading: Math.PI, engine: true, gear: 1, engineBoost};
    const hullEnd = (hull.length - hull.beam) / 2;
    for (let i = 0; i < 600; i++) {
      stepBoat(boat, 0, dt, world);
      assert.ok(harborWaterAt(boat.x - hullEnd, boat.y));
      assert.ok(harborWaterAt(boat.x + hullEnd, boat.y));
    }
    if (!engineBoost) assert.ok(boat.x > x + 2 && boat.x < x + 6);
    assert.ok(harborClearance(boat).distance >= hull.beam / 2);
  }
});

test('mooring requires the hull to fit along the berth in neutral at low speed', () => {
  const boat = {...makeBoat(), x: berth.x, y: berth.y, heading: berth.heading};
  assert.equal(makeFast({...boat, vx: 1}), false);
  assert.equal(makeFast({...boat, gear: 1}), false);
  assert.equal(makeFast({...boat, sail: true}), false);
  assert.equal(makeFast({...boat, jib: true}), false);
  assert.equal(makeFast({...boat, jibDeployment: 0.25}), false);
  assert.equal(makeFast({...boat, heading: berth.heading + Math.PI / 2}), false);
  assert.equal(makeFast({...boat, x: berth.x + 3}), false);
  assert.equal(berthStatus(boat), 'ready');
  assert.equal(makeFast(boat), true);
  assert.equal(boat.moored, true);
});

test('the yacht can motor through the entrance, make fast, then back out', () => {
  const boat = makeBoat();
  boat.engine = true;
  boat.gear = 1;
  const points = [...approach, berth];
  let next = 0;
  for (let i = 0; i < 200 / dt && !boat.moored; i++) {
    let target = points[next];
    if (next < points.length - 1 && Math.hypot(target.x - boat.x, target.y - boat.y) < 2) {
      target = points[++next];
    }
    let heading = Math.atan2(target.y - boat.y, target.x - boat.x);
    if (next === points.length - 1) {
      const dx = boat.x - berth.x;
      const dy = boat.y - berth.y;
      const along = Math.cos(berth.heading) * dx + Math.sin(berth.heading) * dy;
      const across = -Math.sin(berth.heading) * dx + Math.cos(berth.heading) * dy;
      heading = berth.heading - Math.atan(across / 6);
      if (along > -3.5) boat.gear = 0;
    }
    const error = Math.atan2(Math.sin(heading - boat.heading), Math.cos(heading - boat.heading));
    stepBoat(boat, Math.max(-1, Math.min(1, error * 3)), dt, world);
    assert.ok(harborWaterAt(boat.x, boat.y));
    makeFast(boat);
  }
  assert.equal(boat.moored, true);
  assert.equal(boat.engine, false);
  boat.moored = false;
  boat.engine = true;
  boat.gear = -1;
  for (let i = 0; i < 600; i++) stepBoat(boat, 0, dt, world);
  assert.ok(boat.y > berth.y + 5 && harborWaterAt(boat.x, boat.y));
});

test('the ImageGen slice sheets load at their intended dimensions', () => {
  for (const [name, sliceWidth, sliceHeight, count, columns] of [
    ['sailboat', 17, 33, 25, 5], ['jib', 17, 33, 17, 6], ['boathouse', 36, 31, 24, 6], ['jetty', 13, 49, 6, 6],
    ['sailboat-detail', 43, 99, 75, 15], ['jib-detail', 43, 99, 49, 13],
    ['cottage-detail', 63, 87, 55, 18], ['boathouse-detail', 108, 93, 75, 12],
    ['cottage', 21, 29, 19, 6],
    ['swan', 17, 31, 18, 6], ['mallard', 35, 21, 11, 4], ['cormorant', 43, 29, 12, 4],
    ['crow', 37, 23, 14, 4], ['stork', 47, 39, 25, 5],
  ]) {
    const png = decodePNG(readFileSync(new URL('../art/' + name + '-slices.png', import.meta.url)));
    const {model} = Model.fromSlicePixels(png.data, png.width, png.height, {sliceWidth, sliceHeight, count, columns});
    assert.deepEqual([model.w, model.h, model.count], [sliceWidth, sliceHeight, count]);
    assert.ok(model.vox.some(value => value > 0));
  }
});


test('the six painted tree stacks preserve every voxel and its wind attachment', () => {
  for (const name of ['oak', 'birch', 'willow', 'pine', 'spruce', 'cherry']) {
    for (const {detail, suffix, size, columns} of [
      {detail: 1, suffix: '', size: 64, columns: 8},
      {detail: 3, suffix: '-detail', size: 192, columns: 16},
    ]) {
      const png = decodePNG(readFileSync(new URL('../art/' + name + suffix + '-slices.png', import.meta.url)));
      assert.deepEqual([png.width, png.height], [size * columns, size * size / columns]);
      const {model, palette} = Model.fromSlicePixels(png.data, png.width, png.height, {sliceWidth: size, columns});
      const tags = palette.map(color => color ? 1 + (((color[0] & 1) << 3) | (color[2] & 7)) : 0);
      assert.deepEqual(model.vox.map(id => tags[id]), treeTemplate(name, true, detail).model.vox, name + suffix);
    }
  }
});

test('lake wind loads the crown downwind, keeps forks attached and lets the tree settle', () => {
  const tree = {x: 12, anchorY: 42, y: 30, phase: 2, frequency: 1.5, flex: 1.25, fork: 8};
  let gust = 0;
  const wind = {from: Math.PI, speed: 0, gustAt(x, y) {
    assert.deepEqual([x, y], [12, 42]);
    return gust;
  }};
  const tipX = time => {
    const load = treeLoad(tree, wind, time);
    const root = boughPose(tree, 0, load, time);
    const leader = boughPose(tree, 1, load, time);
    assert.equal(root.x, 0);
    assert.equal(root.y, 0);
    assert.ok(Math.abs(leader.shear * tree.fork + leader.x - root.shear * tree.fork) < 1e-8);
    const joint = -32;
    const fringe = boughPose(tree, 5, load, time, joint);
    assert.ok(Math.abs(fringe.x - fringe.shear * joint - (leader.x - leader.shear * joint)) < 1e-8);
    const fine = boughPose(tree, 5, load, time, joint * 3, 3);
    assert.ok(Math.abs(fine.x / 3 - fringe.x) < 1e-8);
    assert.ok(Math.abs(fine.y / 3 - fringe.y) < 1e-8);
    return leader.shear * 52 + leader.x;
  };
  assert.equal(tipX(0), 0);
  gust = 8;
  for (let i = 1; i < 60; i++) tipX(i / 60);
  assert.ok(tipX(1) > 1);
  wind.from = 0;
  assert.ok(tipX(1 + dt) > 0);
  assert.ok(tipX(4) < -1);
  gust = 0;
  assert.ok(Math.abs(tipX(14)) < .001);
});
