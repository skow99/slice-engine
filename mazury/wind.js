import {Model, Waves} from '../src/index.js';

export const knotsPerMeterPerSecond = 3600 / 1852;
export const defaultWind = {from: -2.12, speed: 5 / knotsPerMeterPerSecond};
const radians = Math.PI / 180;
const wrap = degrees => (degrees % 360 + 360) % 360;
const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const windBearing = angle => wrap(angle / radians + 90);
export const windDirection = bearing => directions[Math.round(bearing / 45) % 8];

export function createWind(seed = 1729) {
  const random = Model.random(seed);
  const puffs = [];
  let from = defaultWind.from;
  let knots = 5;
  let gustKnots = 4;
  let automatic = true;
  let variable = false;
  let drift = 0;
  let weatherSpeed = 0;
  let weatherGust = 0;
  let weatherVeer = 0;
  let unsettled = false;
  let dailyMix = 0, dailyFrom = from, dailySpeed = knots, dailyGust = gustKnots;
  let time = 0;
  let next = 21;
  let waveOrigin;
  const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const direction = () => {
    const manual = from + drift + weatherVeer;
    return manual + angleDelta(dailyFrom, manual) * dailyMix;
  };
  const speed = () => Math.max(0, (knots + weatherSpeed + (variable ? Math.sin(time / 19) * 2.7 : 0)) * (1 - dailyMix) + dailySpeed * dailyMix);
  const gustSize = () => Math.max(0, (gustKnots + weatherGust + (variable ? Math.sin(time / 24) * 1.6 : 0)) * (1 - dailyMix) + dailyGust * dailyMix);

  const strength = puff => Math.max(0, Math.min(1, (time - puff.born) / 1.15,
    (puff.duration - (time - puff.born)) / 2.2)) * gustSize() / knotsPerMeterPerSecond;

  function release(origin, manual) {
    if (!gustSize()) return;
    const dx = -Math.cos(direction());
    const dy = -Math.sin(direction());
    const distance = manual ? 10 : 25 + random() * 8;
    const offset = manual ? 0 : (random() - 0.5) * 17;
    const travel = Math.max(5.3, speed() / knotsPerMeterPerSecond * 1.25);
    const duration = Math.min(18, Math.max(7, (distance + 25) / travel));
    if (puffs.length >= 3) puffs.shift();
    puffs.push({
      x: origin.x - dx * distance - dy * offset,
      y: origin.y - dy * distance + dx * offset,
      dx, dy, travel, duration, born: time, manual,
      length: manual ? 20 : 16 + random() * 6,
      width: manual ? 34 : 26 + random() * 8,
    });
  }

  // Each gust is a finite band of rougher water moving downwind. The same
  // field is sampled by the sail and the water, including away from the boat.
  function gustAt(x, y) {
    let maximum = 0;
    for (const puff of puffs) {
      const age = time - puff.born;
      const dx = x - puff.x - puff.dx * puff.travel * age;
      const dy = y - puff.y - puff.dy * puff.travel * age;
      if (Math.abs(dx) > puff.width || Math.abs(dy) > puff.width) continue;
      const along = (dx * puff.dx + dy * puff.dy) / puff.length;
      const across = (dy * puff.dx - dx * puff.dy) / puff.width;
      const patch = Math.max(0, 1 - along ** 2 - across ** 2);
      maximum = Math.max(maximum, patch ** 2 * strength(puff));
    }
    return maximum;
  }

  return {
    get from() { return direction(); },
    get speed() { return speed() / knotsPerMeterPerSecond; },
    get bearing() { return windBearing(from); },
    get waveOrigin() { return waveOrigin; },
    get knots() { return knots; },
    get gustKnots() { return gustKnots; },
    get automatic() { return automatic; },
    setVariable(value) { variable = value; },
    setBearing(value) {
      from = (wrap(value) - 90) * radians;
      puffs.length = 0;
    },
    setKnots(value) { knots = Math.max(0, Math.min(28, value)); },
    setGustKnots(value) { gustKnots = Math.max(0, Math.min(14, value)); },
    setAutomatic(value) {
      automatic = value;
      if (!value) {
        for (let i = puffs.length - 1; i >= 0; i--) if (!puffs[i].manual) puffs.splice(i, 1);
      } else next = time + 6;
    },
    bump(origin) { release(origin, true); },
    gustAt,
    gustBands() {
      return puffs.map(puff => {
        const advance = puff.travel * (time - puff.born);
        return {...puff, x: puff.x + puff.dx * advance, y: puff.y + puff.dy * advance, strength: strength(puff)};
      });
    },
    at({x, y}) {
      const gust = gustAt(x, y);
      return {from: direction(), speed: speed() / knotsPerMeterPerSecond + gust, gust, time, waveOrigin};
    },
    update(dt, boat, weather = {}) {
      // Keep the wave phase continuous under the yacht as the wind veers.
      waveOrigin ??= {x: boat.x, y: boat.y, along: 0, across: 0};
      waveOrigin = {x: boat.x, y: boat.y, ...Waves.coordinates(boat.x, boat.y, direction(), waveOrigin)};
      time += dt;
      const blend = 1 - Math.exp(-dt * .55);
      const daily = weather.daily;
      dailyMix += ((daily ? 1 : 0) - dailyMix) * blend;
      if (daily) {
        dailyFrom += angleDelta(daily.from, dailyFrom) * blend;
        dailySpeed += (daily.knots - dailySpeed) * blend;
        dailyGust += (daily.gustKnots - dailyGust) * blend;
      } else if (dailyMix < .0001) dailyMix = 0;
      drift += ((variable ? .23 * Math.sin(time / 27) + .17 * Math.sin(time / 47) : 0) - drift) * blend;
      weatherSpeed += ((weather.wind ?? 0) - weatherSpeed) * blend;
      weatherGust += ((weather.gust ?? 0) - weatherGust) * blend;
      weatherVeer += ((weather.veer ?? 0) * Math.sin(time / 7) - weatherVeer) * blend;
      const stormy = weather.rain > .6;
      if (stormy && !unsettled) next = Math.min(next, time + 3);
      unsettled = stormy;
      for (let i = puffs.length - 1; i >= 0; i--) if (time - puffs[i].born >= puffs[i].duration) puffs.splice(i, 1);
      if ((automatic || daily) && time >= next) {
        release(boat, false);
        next = time + (weather.rain > .6 ? 5 + random() * 9 : 19 + random() * 23);
      }
    },
  };
}
