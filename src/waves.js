/* A travelling swell with bent crests and a shorter, crossing chop. */
const flatOrigin = {x: 0, y: 0, along: 0, across: 0};
const defaultBend = (across, time) => .65 * Math.sin(across * .15 + time * .46) + .27 * Math.sin(across * .49 - time * .63);

export function coordinates(x, y, from, origin = flatOrigin) {
  const cos = Math.cos(from), sin = Math.sin(from);
  const east = x - origin.x, south = y - origin.y;
  return {
    along: origin.along - east * cos - south * sin,
    across: origin.across + east * sin - south * cos,
  };
}

export function create({frequency = .76, phaseSpeed = 3, bend = defaultBend} = {}) {
  if (!Number.isFinite(frequency) || frequency <= 0) throw new RangeError('frequency must be positive and finite');
  const crestSpacing = 2 * Math.PI / frequency;
  return {
    crestSpacing,
    crestOffset(time) { return (time * phaseSpeed + Math.PI / 2) / frequency; },
    bend,
    sample(along, across, time, amplitude) {
      if (!amplitude) return {height: 0, slope: 0, crossSlope: 0};
      const phase = (along - bend(across, time)) * frequency - time * phaseSpeed;
      const chop = along * 1.27 + across * .59 - time * 4.1;
      return {
        height: amplitude * (Math.sin(phase) + .24 * Math.sin(chop)),
        slope: amplitude * (frequency * Math.cos(phase) + .30 * Math.cos(chop)),
        crossSlope: amplitude * .23 * Math.cos(chop + .52),
      };
    },
  };
}
