import {Sky} from '../src/index.js';

const latitude = 54;
const solarNoon = 12 * 60 + 39;

const midday = [252, 253, 255];
const golden = [255, 197, 167];
const twilight = [116, 120, 166];
const dark = [45, 63, 110];
const moonlit = [88, 112, 163];
const mix = (a, b, t) => a.map((value, i) => Math.round(value + (b[i] - value) * t));
function fade(low, high, value) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

export const wrapDay = Sky.wrapDay;
export const sunAt = minute => Sky.position(minute, {latitude, declination: 21, transit: solarNoon});

// Start the trip to shore in the evening so swimming birds have time to settle.
export const birdsRoosting = ({elevation, x}) => elevation < (x < 0 ? 12 : 0);

export function daylightAt(minute, moonEnabled) {
  const sun = sunAt(minute);
  const moon = Sky.position(minute, {latitude, declination: -14, transit: solarNoon - 12 * 60});
  const dayAmount = fade(-2, 4, sun.elevation);
  const warmth = fade(-4, 3, sun.elevation) * (1 - fade(7, 25, sun.elevation));
  const twilightAmount = fade(-12, -1, sun.elevation) * (1 - fade(0, 4, sun.elevation));
  const moonAmount = moonEnabled
    ? fade(0, 11, moon.elevation) * (1 - fade(-13, -5, sun.elevation)) : 0;
  const source = sun.elevation > 0 ? 'sun' : moonAmount > 0 ? 'moon' : null;
  const body = source === 'sun' ? sun : source === 'moon' ? moon : null;
  const strength = source === 'sun' ? fade(0, 5, sun.elevation) : moonAmount * 0.52;
  const reach = body ? Math.min(2.2, 0.52 / Math.max(0.06, body.z)) : 0;
  const shadows = body ? [-body.x * reach, -body.y * reach * 0.75] : [0, 0];
  const night = mix(dark, moonlit, moonAmount);
  const multiply = mix(mix(night, twilight, twilightAmount), mix(midday, golden, warmth), dayAmount);
  const lift = mix(mix([2, 4, 10], [3, 6, 13], moonAmount), [10, 5, 3], twilightAmount);
  const add = mix(lift, mix([0, 0, 0], [22, 11, 3], warmth), dayAmount);
  return {
    sun, moon, source, body, strength, shadows, warmth, moonAmount, twilightAmount,
    grade: {multiply, add, saturate: (1 - dayAmount) * 0.16},
    color: source === 'moon' ? [184, 218, 255] : mix([255, 248, 215], [255, 195, 114], warmth),
  };
}
