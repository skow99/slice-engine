const radians = Math.PI / 180;
const day = 24 * 60;

export const wrapDay = minute => ((minute % day) + day) % day;

/* Direction to a celestial body in east, south, up coordinates. Angles are
 * in degrees; minute and transit are minutes in the same local 24-hour day. */
export function position(minute, {latitude, declination, transit = 720}) {
  const lat = latitude * radians;
  const hourAngle = (minute - transit) * Math.PI * 2 / day;
  const dec = declination * radians;
  const meridian = Math.cos(dec) * Math.cos(hourAngle);
  const x = -Math.cos(dec) * Math.sin(hourAngle);
  const y = Math.sin(lat) * meridian - Math.cos(lat) * Math.sin(dec);
  const z = Math.cos(lat) * meridian + Math.sin(lat) * Math.sin(dec);
  return {x, y, z, elevation: Math.asin(Math.max(-1, Math.min(1, z))) / radians, azimuth: (Math.atan2(x, -y) / radians + 360) % 360};
}
