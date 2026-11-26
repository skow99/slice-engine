import {berth as defaultBerth, harborClearance, harborDeparture, inHarbor, inMarina} from './harbor.js';
import {portNear} from './ports.js';
import {defaultWind} from './wind.js';
import {waveAt} from './weather.js';

export {knotsPerMeterPerSecond} from './wind.js';
export const windFrom = defaultWind.from;
export const hull = {length: 7.35, beam: 2.70};
const cruiseSpeed = 2.55;
const travelMultiplier = 2;
const maxAhead = 1.4 * travelMultiplier;
const boostAhead = 16.8;
const maxAstern = 0.8 * travelMultiplier;
const steeringFlow = 0.48;
const pulsePeriod = 0.38;
const pulseDuration = 0.24;
const hullRadius = hull.beam / 2;
const hullEnd = hull.length / 2 - hullRadius;
const hullOffsets = [-hullEnd, 0, hullEnd];
const mooringSpeed = 0.32;
export const sailSteps = 7;
const sailTravelTime = 1.65;
const jibTravelTime = 1.4;
export const trimSteps = 8;
export const noGoAngle = 0.65;
const capsizeHeel = 85 * Math.PI / 180;
const capsizedHeel = 100 * Math.PI / 180;
const rollStiffness = 8;
const rollDamping = 4.4;
const heelWind = 10.5 * 1852 / 3600;
export const maxBallastKg = 240;
const defaultBallastKg = 80;
const crewLever = .94;
const referenceHeelMoment = 5200;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function makeBoat() {
  return {
    ...harborDeparture,
    vx: 0, vy: 0, turn: 0, heel: 0, heelRate: 0, sail: false, deployment: 0, trim: 0.375, sailSide: 1,
    boomAngle: 0,
    jib: false, jibDeployment: 0, jibSheet: 0.5, jibAngle: 0, sailLuff: 0,
    mastDown: false, mastFold: 0, trimActual: 0.375, jibSheetActual: 0.5, heave: 0, waveRoll: 0, wavePitch: 0,
    goosewing: false,
    ballastSide: 0, ballastKg: defaultBallastKg, ballastShift: 0,
    anchor: null, engine: false, engineBoost: false, gear: 0, moored: false, steeringJet: 0, steeringPulse: 0,
    capsized: false,
  };
}

export function sailPower(heading, from = defaultWind.from) {
  const intoWind = Math.cos(heading - from);
  const acrossWind = Math.sqrt(Math.max(0, 1 - intoWind ** 2));
  return Math.min(1, 0.24 + 0.76 * acrossWind - 0.15 * intoWind);
}

function apparentWind(boat, wind) {
  // Scale travel without moving the established trim points and heel range.
  const windX = Math.cos(wind.from) * wind.speed + boat.vx / travelMultiplier;
  const windY = Math.sin(wind.from) * wind.speed + boat.vy / travelMultiplier;
  const relative = Math.atan2(windY, windX) - boat.heading;
  const angle = Math.atan2(Math.sin(relative), Math.cos(relative));
  const trueAngle = Math.acos(clamp(Math.cos(wind.from - boat.heading), -1, 1));
  return {angle, trueAngle, speed: Math.hypot(windX, windY)};
}

function canSpreadSails(boat, air, wind, holding = false) {
  const trueLimit = (holding ? 32 : 25) * Math.PI / 180;
  const apparentLimit = (holding ? 40 : 30) * Math.PI / 180;
  return boat.sail && boat.jib && boat.deployment >= 0.75 && boat.jibDeployment >= 0.75
    && !boat.moored && !boat.capsized && wind.speed > 0.15 && air.speed > 0.12
    && air.trueAngle >= Math.PI - trueLimit && Math.abs(air.angle) >= Math.PI - apparentLimit;
}

export function canGoosewing(boat, wind = defaultWind) {
  return canSpreadSails(boat, apparentWind(boat, wind), wind);
}

export function toggleGoosewing(boat, wind = defaultWind) {
  if (boat.goosewing) {
    boat.goosewing = false;
    return true;
  }
  if (!canGoosewing(boat, wind)) return false;
  boat.goosewing = true;
  boat.trim = 1;
  boat.jibSheet = 1;
  return true;
}

function mainTrim(boat, {angle, trueAngle}, sheetControl = boat.trim) {
  const ideal = clamp((Math.abs(angle) - 0.36) * 0.65, 0.08, 1.45);
  const sheet = 0.12 + sheetControl * 1.33;
  const error = sheet - ideal;
  const efficiency = clamp(1 - Math.abs(error) * (error > 0 ? 1.65 : 1.05), 0, 1);
  return {
    angle, trueAngle, sheet, ideal, error,
    efficiency: efficiency * clamp((trueAngle - noGoAngle) / 0.22, 0, 1),
  };
}

export function sailTrim(boat, wind = defaultWind) {
  return mainTrim(boat, apparentWind(boat, wind));
}

function headsailTrim(boat, {angle, trueAngle, speed}, hasWind, sheetControl = boat.jibSheet ?? 0.5) {
  const offWind = Math.abs(angle);
  const sheet = 0.08 + sheetControl * 1.05;
  const ideal = clamp((offWind - 0.38) * 0.62, 0.08, 1.13);
  const error = sheet - ideal;
  const open = clamp((offWind - 0.43) / 0.32, 0, 1) * clamp((trueAngle - noGoAngle) / 0.2, 0, 1);
  const attached = clamp(1 - Math.abs(error) * (error > 0 ? 2.4 : 1.55), 0, 1);
  const running = clamp((offWind - 1.95) / 1.05, 0, 1);
  // On a run the main can shelter the jib. A jib on its own still catches wind.
  const onWing = boat.goosewing ? clamp((offWind - 2.4) / 0.53, 0, 1) : 0;
  const shelter = 0.83 * (boat.deployment ?? 0) * running * (1 - onWing);
  const exposed = boat.goosewing ? 0.6 + 0.4 * onWing : 1;
  const efficiency = open * Math.max(attached, 0.23 * running * sheet / 1.13) * (1 - shelter) * exposed;
  const pressure = hasWind ? Math.min(2, (speed / defaultWind.speed) ** 0.9) : 0;
  const drive = 1.25 * pressure * efficiency * (0.53 + 0.47 * Math.sin(offWind));
  return {angle, sheet, ideal, error, shelter, efficiency, drive};
}

export function jibTrim(boat, wind = defaultWind) {
  return headsailTrim(boat, apparentWind(boat, wind), wind.speed > 0.05);
}

function sailMoment(boat, air, hasWind, main, jib) {
  // A loaded sail can heel the hull even at anchor. A partial hoist has less
  // cloth and a lower centre of effort.
  const across = Math.sin(air.angle) * (0.9 + 0.46 * Math.cos(air.angle));
  const pressure = hasWind ? (air.speed / heelWind) ** 2 : 0;
  const mainLoad = boat.deployment * (0.45 + 0.55 * boat.deployment) * (0.08 + 0.92 * main.efficiency);
  const jibLoad = jib ? 0.46 * boat.jibDeployment * (0.45 + 0.55 * boat.jibDeployment)
    * (0.08 * (1 - jib.shelter) + 0.92 * jib.efficiency) : 0;
  const filled = clamp((Math.abs(air.angle) - 0.38) / 0.34, 0, 1);
  return across * pressure * (mainLoad + jibLoad) * filled;
}

export function setBallast(boat, side, kg = boat.ballastKg ?? defaultBallastKg) {
  boat.ballastSide = Math.sign(side) || 0;
  boat.ballastKg = clamp(Math.round(Number(kg) || 0), 0, maxBallastKg);
}

function heelForMoment(moment) {
  const load = Math.abs(moment);
  // The hull rights strongly at modest angles. Once the rig overpowers that
  // stability, a knockdown develops quickly unless the sails unload.
  const overload = clamp((load - 2) / 2.7, 0, 1);
  return Math.sign(moment) * (0.68 * Math.tanh(load * 0.88) + 1.14 * overload ** 2 * (3 - 2 * overload));
}

function updateHeel(boat, target, dt) {
  const heel = boat.heel ?? 0;
  const rate = boat.heelRate ?? 0;
  const inertia = 1 + Math.abs(boat.ballastShift ?? 0) / 1600;
  boat.heelRate = rate + (rollStiffness * (target - heel) - rollDamping * rate) * dt / inertia;
  boat.heel = heel + boat.heelRate * dt;
}

export function rightBoat(boat) {
  if (!boat.capsized) return false;
  Object.assign(boat, {
    capsized: false, heel: 0, heelRate: 0, sail: false, deployment: 0, jib: false, jibDeployment: 0,
    jibAngle: 0, sailLuff: 0, goosewing: false, ballastSide: 0, ballastShift: 0,
  });
  return true;
}

export function toggleAnchor(boat) {
  if (boat.moored) return false;
  boat.anchor = boat.anchor ? null : {x: boat.x, y: boat.y};
  if (boat.anchor) {
    boat.gear = 0;
    boat.engineBoost = false;
    boat.steeringJet = boat.steeringPulse = 0;
  }
  return true;
}

export function toggleMast(boat) {
  if (boat.capsized || boat.sail || boat.jib || boat.deployment > 0 || boat.jibDeployment > 0) return false;
  boat.mastDown = !boat.mastDown;
  return true;
}

function steeringAssist(boat, rudder, forward, dt) {
  if (!rudder || boat.anchor || Math.abs(forward) >= steeringFlow) {
    boat.steeringJet = boat.steeringPulse = 0;
    return 0;
  }
  const phase = boat.steeringPulse ?? 0;
  boat.steeringPulse = (phase + dt) % pulsePeriod;
  boat.steeringJet = phase < pulseDuration ? -rudder * (1 - Math.abs(forward) / steeringFlow) : 0;
  return -boat.steeringJet * 0.96;
}

function holdAnchor(boat, dt) {
  if (!boat.anchor) return;
  boat.vx *= Math.exp(-2.1 * dt);
  boat.vy *= Math.exp(-2.1 * dt);
  const dx = boat.x - boat.anchor.x;
  const dy = boat.y - boat.anchor.y;
  const distance = Math.hypot(dx, dy);
  const scope = 3;
  if (distance <= scope) return;
  const nx = dx / distance;
  const ny = dy / distance;
  boat.x = boat.anchor.x + nx * scope;
  boat.y = boat.anchor.y + ny * scope;
  const outward = Math.max(0, boat.vx * nx + boat.vy * ny);
  boat.vx -= outward * nx;
  boat.vy -= outward * ny;
}

function contactAt(x, y, lake) {
  const dock = lake.portContact?.({x, y});
  if (dock && dock.distance < hullRadius) return {...dock, depth: hullRadius - dock.distance};
  if (inHarbor(x, y)) {
    const edge = harborClearance({x, y});
    return edge.distance < hullRadius
      ? {nx: edge.nx, ny: edge.ny, depth: hullRadius - edge.distance}
      : null;
  }
  return lake.shoreContact({x, y, r: hullRadius});
}

function resolveHull(boat, lake) {
  const headingX = Math.cos(boat.heading);
  const headingY = Math.sin(boat.heading);
  for (const offset of hullOffsets) {
    const hit = contactAt(boat.x + headingX * offset, boat.y + headingY * offset, lake);
    if (!hit) continue;
    boat.x += hit.nx * (hit.depth + 0.001);
    boat.y += hit.ny * (hit.depth + 0.001);
    const normalSpeed = boat.vx * hit.nx + boat.vy * hit.ny;
    if (normalSpeed < 0) {
      boat.vx -= normalSpeed * hit.nx;
      boat.vy -= normalSpeed * hit.ny;
    }
    boat.turn *= 0.6;
  }
}

export function stepBoat(boat, rudder, dt, lake, wind = defaultWind, {throttle = 1, reef = 1, speedLimit = Infinity} = {}) {
  boat.mastFold = clamp((boat.mastFold ?? 0) + (boat.mastDown ? 1 : -1) * dt / 2.6, 0, 1);
  if (boat.capsized) {
    updateHeel(boat, Math.sign(boat.heel) * capsizedHeel, dt);
    return;
  }
  const crewPosition = (boat.ballastSide ?? 0) * (boat.ballastKg ?? 0);
  const crewShift = boat.ballastShift ?? 0;
  // Give crew time to cross the cockpit before their full weight comes to bear.
  boat.ballastShift = Math.abs(crewPosition - crewShift) < .01 ? crewPosition
    : crewShift + (crewPosition - crewShift) * (1 - Math.exp(-dt * 2.8));
  const crewMoment = boat.ballastShift * 9.81 * crewLever / referenceHeelMoment;
  if (boat.moored) {
    if (crewMoment || boat.heel || boat.heelRate) updateHeel(boat, heelForMoment(crewMoment), dt);
    return;
  }
  const headingX = Math.cos(boat.heading);
  const headingY = Math.sin(boat.heading);
  const forward = boat.vx * headingX + boat.vy * headingY;
  boat.waveTime = (boat.waveTime ?? 0) + dt;
  const wave = waveAt(boat.x, boat.y, wind.time ?? boat.waveTime, wind);
  const waveResponse = 1 - Math.exp(-5 * dt);
  const relativeWind = wind.from - boat.heading;
  const broadside = Math.sin(relativeWind);
  const headwind = Math.cos(relativeWind);
  const shelter = inMarina(boat.x, boat.y) || portNear(boat, 18) ? .27 : 1;
  const crosswind = wind.speed * broadside;
  const hullWind = clamp((crosswind * crosswind - 25) / 185, 0, 1.4) * Math.sign(crosswind) * shelter;
  boat.heave = (boat.heave ?? 0) + (wave.height * shelter - (boat.heave ?? 0)) * waveResponse;
  const roll = (wave.slope * -broadside + wave.crossSlope * headwind) * shelter * .78 + hullWind * .09;
  boat.waveRoll = (boat.waveRoll ?? 0) + (roll - (boat.waveRoll ?? 0)) * waveResponse;
  boat.wavePitch = (boat.wavePitch ?? 0) + ((wave.slope * headwind + wave.crossSlope * broadside) * shelter * .40 - (boat.wavePitch ?? 0)) * waveResponse;
  const engineGear = boat.engine && !boat.anchor ? boat.gear : 0;
  const boosting = boat.engineBoost && engineGear === 1;
  const engineDrive = throttle * (engineGear < 0 ? -maxAstern : engineGear * (boosting ? boostAhead : maxAhead));
  const sheetTravel = 1 - Math.exp(-7 * dt);
  boat.trimActual = (boat.trimActual ?? boat.trim) + (boat.trim - (boat.trimActual ?? boat.trim)) * sheetTravel;
  boat.jibSheetActual = (boat.jibSheetActual ?? boat.jibSheet) + (boat.jibSheet - (boat.jibSheetActual ?? boat.jibSheet)) * sheetTravel;
  const sailTarget = boat.sail ? reef : 0;
  boat.deployment += clamp(sailTarget - boat.deployment, -dt / sailTravelTime, dt / sailTravelTime);
  boat.jibDeployment = clamp((boat.jibDeployment ?? 0) + (boat.jib ? 1 : -1) * dt / jibTravelTime, 0, 1);
  const air = apparentWind(boat, wind);
  const hasWind = wind.speed > 0.05;
  const trim = mainTrim(boat, air, boat.trimActual);
  if (boat.goosewing && !canSpreadSails(boat, air, wind, true)) boat.goosewing = false;
  if (!boat.goosewing && hasWind && Math.abs(Math.sin(trim.angle)) > 0.055) boat.sailSide = -Math.sign(trim.angle);
  const boomTarget = -boat.sailSide * Math.min(trim.sheet, Math.abs(air.angle));
  boat.boomAngle = (boat.boomAngle ?? 0) + (boomTarget - (boat.boomAngle ?? 0)) * sheetTravel;
  const luffWind = Math.sqrt(clamp(wind.speed / 11, 0, 1));
  const luff = hasWind ? clamp((noGoAngle - trim.trueAngle) / .19, 0, 1) * luffWind : 0;
  boat.sailLuff = (boat.sailLuff ?? 0) + (luff - (boat.sailLuff ?? 0)) * (1 - Math.exp(-4 * dt));
  const windDrive = Math.min(2.1, (wind.speed / defaultWind.speed) ** 0.72);
  const mainDrive = boat.deployment * sailPower(boat.heading, wind.from) * trim.efficiency * cruiseSpeed * windDrive;
  let sailDrive = mainDrive;
  const jib = boat.jibDeployment > 0 ? headsailTrim(boat, air, hasWind, boat.jibSheetActual) : null;
  if (jib) {
    const previous = boat.jibAngle ?? 0;
    const windSide = Math.abs(Math.sin(jib.angle)) > 0.055 ? Math.sign(jib.angle) : -boat.sailSide;
    const side = boat.goosewing ? boat.sailSide : windSide;
    const angle = hasWind ? side * Math.min(jib.sheet, Math.abs(jib.angle)) : 0;
    boat.jibAngle = previous + (angle - previous) * (1 - Math.exp(-7 * dt));
    // Blend the extra drive out as the hull approaches its fast sailing range.
    sailDrive += boat.jibDeployment * jib.drive * clamp((3.65 - mainDrive) / 1.15, 0, 1);
  } else {
    boat.jibAngle = 0;
  }
  const moment = sailMoment(boat, air, hasWind, trim, jib);
  const targetHeel = heelForMoment(moment + crewMoment);
  if (crewMoment) {
    // Crew trim changes how much of the sail's drive is lost to heel.
    const windHeel = heelForMoment(moment);
    sailDrive *= 1 + .24 * (Math.sin(windHeel) ** 2 - Math.sin(targetHeel) ** 2);
  }
  updateHeel(boat, targetHeel, dt);
  if (Math.abs(boat.heel) >= capsizeHeel) {
    Object.assign(boat, {
      capsized: true, vx: 0, vy: 0, turn: 0, engine: false, engineBoost: false, gear: 0, goosewing: false,
      steeringJet: 0, steeringPulse: 0,
    });
    return;
  }
  const steerableThrust = engineGear * (boosting ? 0.12 : 0.24);
  const flow = Math.min(1, Math.abs(forward) / (boosting ? maxAhead / travelMultiplier : maxAhead));
  const rudderFlow = Math.sign(forward) * Math.sqrt(flow) * (boosting ? 0.58 : 0.5);
  const helmAuthority = clamp((1.4 - Math.abs(boat.heel)) / 0.77, 0, 1);
  const rotation = (rudder * (rudderFlow + steerableThrust) + steeringAssist(boat, rudder, forward, dt)) * helmAuthority;
  boat.steeringJet *= helmAuthority;
  boat.turn += (rotation - boat.turn) * (1 - Math.exp(-3.5 * dt));
  const headingChange = boat.turn * dt;
  boat.heading = (boat.heading + headingChange + Math.PI * 2) % (Math.PI * 2);

  const gust = (wind.gust ?? 0) / defaultWind.speed;
  const drive = engineGear < 0 ? engineDrive : Math.max(engineDrive, Math.min(speedLimit, sailDrive * travelMultiplier * (1 + 0.13 * gust)));
  const windDrift = boat.anchor || engineGear ? 0 : clamp((wind.speed ** 2 - 49) / 74, 0, 2.6)
    * (shelter === 1 ? 1 : .08) * (1 - .65 * Math.max(boat.deployment, boat.jibDeployment));
  const driftingDrive = drive - headwind * windDrift * .60;
  const sideways = .95 * hullWind + broadside * windDrift
    + Math.min(2.6, gust) * clamp(moment * 0.65, -1, 1) + boat.steeringJet * 0.13;
  const accelerating = Math.abs(drive) > 0;
  // Shed the extra speed promptly when the tester switches back to normal handling.
  const slowingFromBoost = engineGear === 1 && !boosting && boatSpeed(boat) > Math.max(cruiseSpeed * travelMultiplier, drive);
  const carryingWay = forward * driftingDrive < 0 || Math.abs(forward) > Math.abs(driftingDrive);
  const coasting = !boat.anchor && engineGear === 0 && forward * drive >= 0 && carryingWay
    && !portNear(boat, 18);
  const cos = Math.cos(boat.heading), sin = Math.sin(boat.heading);
  if (coasting) {
    // Blend linear and speed-dependent resistance. Water flow over the rudder
    // bends the track and adds drag, while some lateral slip remains.
    const resistance = 0.064 + Math.abs(forward) * 0.018 + Math.abs(rudder) * 0.029;
    const way = driftingDrive + (forward - driftingDrive) * Math.exp(-resistance * dt);
    const slip = boat.vx * headingY - boat.vy * headingX + forward * headingChange * 0.4;
    const cross = sideways + (slip - sideways) * Math.exp(-1.25 * dt);
    boat.vx = cos * way + sin * cross;
    boat.vy = sin * way - cos * cross;
  } else {
    const response = boosting ? 0.65 : accelerating ? 1.3 : inHarbor(boat.x, boat.y) ? 0.53 : 0.43;
    const drag = 1 - Math.exp(-(slowingFromBoost ? 2.4 : response) * dt);
    const aft = boat.vx * sin - boat.vy * cos;
    const lateralDrag = 1 - Math.exp(-(accelerating ? 1.7 : 1.25) * dt);
    boat.vx += cos * (driftingDrive - forward) * drag + sin * (sideways - aft) * lateralDrag;
    boat.vy += sin * (driftingDrive - forward) * drag - cos * (sideways - aft) * lateralDrag;
  }
  boat.x += boat.vx * dt;
  boat.y += boat.vy * dt;
  holdAnchor(boat, dt);
  resolveHull(boat, lake);
}

export function boatSpeed(boat) {
  return Math.hypot(boat.vx, boat.vy);
}

export function nearMooring(boat, target = defaultBerth) {
  return Math.hypot(boat.x - target.x, boat.y - target.y) < 16;
}

export function berthStatus(boat, berth = defaultBerth) {
  if (!nearMooring(boat, berth)) return '';
  if (boat.anchor) return 'Weigh the anchor before mooring';
  if (boat.sail || boat.deployment > 0 || boat.jib || boat.jibDeployment > 0) return 'Lower both sails before mooring';
  const dx = boat.x - berth.x;
  const dy = boat.y - berth.y;
  const along = Math.cos(berth.heading) * dx + Math.sin(berth.heading) * dy;
  const across = -Math.sin(berth.heading) * dx + Math.cos(berth.heading) * dy;
  const error = Math.acos(Math.min(1, Math.abs(Math.cos(boat.heading - berth.heading))));
  const occupiedLength = hull.beam + 2 * hullEnd * Math.cos(error);
  const occupiedWidth = hull.beam + 2 * hullEnd * Math.sin(error);
  if (Math.abs(along) + occupiedLength / 2 > berth.length / 2) return 'Bring the yacht inside the marked berth';
  if (Math.abs(across) + occupiedWidth / 2 > berth.width / 2 || error > Math.PI / 12) {
    return 'Line up parallel to the pontoon';
  }
  if (boat.gear !== 0 || boatSpeed(boat) > mooringSpeed) return 'Select neutral and let the yacht slow';
  return 'ready';
}

export function makeFast(boat, berth = defaultBerth) {
  if (boat.capsized || boat.moored || berthStatus(boat, berth) !== 'ready') return false;
  const opposite = Math.cos(boat.heading - berth.heading) < 0;
  Object.assign(boat, {
    x: berth.x, y: berth.y, vx: 0, vy: 0, turn: 0, heel: boat.ballastShift ? boat.heel : 0, heelRate: 0,
    moored: true, engine: false, engineBoost: false,
    heave: 0, waveRoll: 0, wavePitch: 0,
    steeringJet: 0, steeringPulse: 0,
    heading: berth.heading + (opposite ? Math.PI : 0),
  });
  return true;
}
