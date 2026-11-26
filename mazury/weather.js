import {Model, Waves} from '../src/index.js';

const profiles = {
  clear: {rain: 0, wind: 0, gust: 0, veer: 0},
  light: {rain: .3, wind: 1, gust: 2, veer: .08},
  heavy: {rain: .75, wind: 5, gust: 5, veer: .28},
  storm: {rain: 1, wind: 10, gust: 9, veer: .55},
};
const cap = n => Math.max(0, Math.min(1, n));
const smooth = t => cap(t) ** 2 * (3 - 2 * cap(t));

export function createDailyWeather(seed) {
  const random = Model.random(seed);
  const prevailing = -2.12 + (random() - .5) * 1.6;
  const storm = random() < .32;
  const fronts = [
    {start: 12 * 60 + random() * 240, rise: storm ? 8 : 21, peak: 17, fall: 46 + random() * 28,
      rain: storm ? 1 : .64 + random() * .24, gust: storm ? 10 : 5, turn: (random() < .5 ? -1 : 1) * (storm ? .85 : .41), storm},
  ];
  if (random() < .58) fronts.push({start: 6 * 60 + random() * 160, rise: 26, peak: 10, fall: 28,
    rain: .36, gust: 2.5, turn: -.22, storm: false});
  if (random() < .42) fronts.push({start: 18 * 60 + random() * 140, rise: 17, peak: 12, fall: 43,
    rain: .48, gust: 4, turn: .35, storm: false});
  return minute => {
    const diurnal = Math.max(0, Math.cos((minute - 15 * 60) * Math.PI / (10 * 60)));
    const dayAngle = minute * Math.PI / 720;
    let knots = 3.2 + 7 * diurnal + .9 * Math.sin(dayAngle * 3);
    let from = prevailing + .44 * Math.sin(dayAngle - 1.7) + .16 * Math.sin(dayAngle * 3);
    let gustKnots = 1 + 3.5 * diurnal;
    let rain = 0, lightning = false;
    for (const front of fronts) {
      const age = minute - front.start;
      const strength = smooth(age / front.rise)
        * (1 - smooth((age - front.rise - front.peak) / front.fall));
      rain = Math.max(rain, strength * front.rain);
      knots += strength * front.gust;
      gustKnots += strength * front.gust;
      from += strength * front.turn;
      lightning ||= front.storm && strength > .72;
    }
    return {from, knots, gustKnots, rain, mode: lightning ? 'storm' : rain >= .6 ? 'heavy' : rain >= .08 ? 'light' : 'clear'};
  };
}

export const thunderDelay = distance => distance / 343;

export function createWeather(seed = 8249) {
  const random = Model.random(seed);
  let time = 0;
  let mode = 'clear';
  let rain = 0;
  let rainX = 0, rainY = 0, driftX = 0, driftY = 0;
  let strike, nextStrike = Infinity, strikeId = 0;
  let closestPass, stormTrack;
  let simulated;
  function set(value) {
    if (!Object.hasOwn(profiles, value) || value === mode) return;
    mode = value;
    nextStrike = mode === 'storm' ? time + 3.8 + random() * 2.4 : Infinity;
    closestPass = time + 64;
    stormTrack = undefined;
    strike = undefined;
  }
  return {
    set,
    update(dt, wind = {from: 0, speed: 0}, listener = {x: 0, y: 0, heading: 0}, daily) {
      time += dt;
      simulated = daily;
      if (daily) set(daily.mode);
      rain += ((daily?.rain ?? profiles[mode].rain) - rain) * (1 - Math.exp(-dt * 0.7));
      const windSpeed = Math.min(70, wind.speed * 4.2);
      const response = 1 - Math.exp(-dt * 3.4);
      rainX += (-Math.cos(wind.from) * windSpeed - rainX) * response;
      rainY += (-Math.sin(wind.from) * windSpeed * .64 - rainY) * response;
      driftX += rainX * dt;
      driftY += rainY * dt;
      if (mode === 'storm' && !stormTrack) {
        stormTrack = {x: listener.x, y: listener.y, dx: -Math.cos(wind.from), dy: -Math.sin(wind.from)};
      }
      if (time >= nextStrike && rain > .65) {
        if (time > closestPass + 66) closestPass += 130;
        const along = (time - closestPass) * 63;
        const {x, y, dx, dy} = stormTrack;
        const east = x + dx * along - dy * 520 - listener.x;
        const south = y + dy * along + dx * 520 - listener.y;
        const distance = Math.hypot(east, south);
        const right = -east * Math.sin(listener.heading) + south * Math.cos(listener.heading);
        strike = {id: ++strikeId, time, distance, pan: .76 * right / Math.max(1, distance)};
        nextStrike = time + 12 + random() * 5;
      }
    },
    read() {
      const profile = profiles[mode];
      const build = Math.min(1, rain / Math.max(.05, profile.rain));
      const age = strike ? time - strike.time : Infinity;
      const flash = mode === 'storm' && age < .38
        ? (.19 + .22 * cap(1 - (strike.distance - 520) / 3500)) * Math.max(Math.max(0, 1 - age / .18), Math.max(0, .46 - Math.abs(age - .24) * 7)) : 0;
      return {mode, time, rain, flash, strike, rainX, rainY, driftX, driftY,
        daily: simulated,
        wind: simulated ? 0 : profile.wind * build, gust: simulated ? 0 : profile.gust * build, veer: simulated ? 0 : profile.veer * build};
    },
  };
}

export function warningRate(sample, weather, daylight) {
  if (!daylight) return 0;
  if (weather.mode === 'storm' || sample.speed >= 13) return 90;
  return weather.mode === 'heavy' || sample.speed >= 8 ? 40 : 0;
}

export function warningFlash(time, rate) {
  return rate > 0 && time % (60 / rate) < .16;
}

const swell = Waves.create();
const {crestSpacing} = swell;
const worldOrigin = {x: 0, y: 0, along: 0, across: 0};
const swellStrength = speed => cap((speed - 4) / 9.5);

export function waveAt(x, y, time, {from, speed, waveOrigin}) {
  const strength = swellStrength(speed);
  if (!strength) return {height: 0, slope: 0, crossSlope: 0, strength};
  const {along, across} = Waves.coordinates(x, y, from, waveOrigin);
  return {...swell.sample(along, across, time, .36 * strength + .31 * strength ** 2), strength};
}

export function drawWindWaves(context, view, time, wind, light) {
  const rough = swellStrength(wind.speed);
  if (rough < .14) return;
  const {w, h, scale} = view;
  const dx = -Math.cos(wind.from), dy = -Math.sin(wind.from);
  const crossX = -dy, crossY = dx;
  const cx = view.x + w / (2 * scale), cy = view.y + h / (2 * scale);
  const origin = wind.waveOrigin ?? worldOrigin;
  const along = (cx - origin.x) * dx + (cy - origin.y) * dy + origin.along;
  const across = (cx - origin.x) * crossX + (cy - origin.y) * crossY + origin.across;
  const reach = Math.hypot(w, h) / (2 * scale) + 4;
  const drift = swell.crestOffset(time);
  const spacing = Math.max(4.6, 6 / scale);
  const by = Math.floor((across - reach) / spacing), ey = Math.ceil((across + reach) / spacing);
  const bx = Math.floor((along - reach - drift) / crestSpacing), ex = Math.ceil((along + reach - drift) / crestSpacing);
  context.save();
  context.lineCap = 'round';
  const bands = [
    {offset: .85, color: '#102b3b', width: Math.max(1.35, scale * .73), opacity: .34},
    {offset: .05, color: light ? '#92d8d6' : '#62939d', width: Math.max(.7, scale * .29), opacity: .43},
    {offset: -.23, color: light ? '#dfebe0' : '#9eafb6', width: Math.max(.64, scale * .13), opacity: .54, foam: true},
  ];
  for (const band of bands) {
    if (band.foam && rough < .66) continue;
    context.globalAlpha = band.opacity * (band.foam ? cap((rough - .66) / .34) : rough ** 1.5);
    context.strokeStyle = band.color;
    context.lineWidth = band.width;
    context.beginPath();
    for (let row = bx; row <= ex; row++) for (let col = by; col <= ey; col++) {
      const seed = Model.hash(row, col);
      if (band.foam && (.53 + .31 * Math.sin(time * 1.3 + seed * 66)) < .48) continue;
      if (!band.foam && seed < .17) continue;
      const start = (col + .42 * seed) * spacing;
      const length = spacing * (band.foam ? .20 + .41 * seed : .47 + .40 * seed);
      const front = row * crestSpacing + drift + band.offset;
      for (let step = 0; step <= 3; step++) {
        const offset = start + length * step / 3;
        const crest = front + swell.bend(offset, time);
        const u = crest - origin.along, v = offset - origin.across;
        const x = (origin.x + u * dx + v * crossX - view.x) * scale;
        const y = (origin.y + u * dy + v * crossY - view.y) * scale;
        if (step) context.lineTo(x, y);
        else context.moveTo(x, y);
      }
    }
    context.stroke();
  }
  context.restore();
}

export function drawRainImpacts(context, view, {time, rain}) {
  const {x, y, w, h, scale} = view;
  const downpour = cap((rain - .38) / .37);
  const spacing = Math.max(1.5, 4.8 / scale) * (1.6 - downpour * .47);
  const life = .72 + downpour * .14;
  const cadence = 1.6 - downpour * .39;
  const left = Math.floor(x / spacing), top = Math.floor(y / spacing);
  const right = Math.ceil((x + w / scale) / spacing), bottom = Math.ceil((y + h / scale) / spacing);
  context.save();
  context.lineWidth = .56 + downpour * .3;
  context.strokeStyle = '#d5e9e4';
  for (const [minAge, maxAge, alpha] of [[0, .27, .48], [.27, .54, .36], [.54, life, .20]]) {
    context.globalAlpha = alpha * (.37 + downpour * .62);
    context.beginPath();
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      const cycle = time + Model.hash(col, row, 19) * cadence;
      const pulse = Math.floor(cycle / cadence);
      const age = cycle - pulse * cadence;
      if (age < minAge || age >= maxAge || Model.hash(col, row, pulse + 72) > Math.min(1, rain * 1.28)) continue;
      const cx = ((col + Model.hash(col, row, pulse + 4)) * spacing - x) * scale;
      const cy = ((row + Model.hash(col, row, pulse + 8)) * spacing - y) * scale;
      const radius = (.12 + age * (.77 + downpour * .28)) * scale;
      const r = Math.max(.69 + downpour * age * .67, radius * (.73 + Model.hash(col, row, pulse + 26) * .50));
      const start = Math.PI * Model.hash(col, row, pulse + 16) * 2;
      const arc = Math.PI * (age < .3 ? 2 : 2.13 - age * .78);
      context.moveTo(cx + r * Math.cos(start), cy + r * .67 * Math.sin(start));
      context.ellipse(cx, cy, r, r * .67, 0, start, start + arc);
      if (age < .11 && rain > .45) {
        context.moveTo(cx, cy);
        context.lineTo(cx - .55, cy - Math.min(3, scale * .31) * (1 - age / .11));
      }
    }
    context.stroke();
  }
  context.restore();
}

export function drawRain(context, view, weather) {
  const {rain, time, flash, rainX, rainY, driftX, driftY} = weather;
  if (rain < .01) return;
  const {w, h} = view;
  context.save();
  context.fillStyle = `rgba(31,47,66,${rain * .23})`;
  context.fillRect(0, 0, w, h);
  const wrap = (position, size) => ((position + 12) % (size + 24) + size + 24) % (size + 24) - 12;
  for (const layer of [.58, 1]) {
    context.strokeStyle = layer < 1 ? '#adcad9' : '#dceaf4';
    context.globalAlpha = (.15 + rain * .24) * layer;
    context.lineWidth = .65 * layer;
    context.beginPath();
    for (let i = 0; i < (layer < 1 ? 165 : 105) * rain; i++) {
      const seed = Model.hash(i, layer * 100);
      const fall = (80 + seed * 83) * layer;
      const x = wrap(Model.hash(i, 12, layer * 100) * w + driftX * layer, w);
      const y = wrap(Model.hash(i, 31, layer * 100) * h + time * fall + driftY * layer, h);
      const exposure = (.024 + seed * .025 + rain * .023) * layer;
      context.moveTo(x, y);
      context.lineTo(x + rainX * layer * exposure, y + (fall + rainY * layer) * exposure);
    }
    context.stroke();
  }
  if (flash) {
    context.globalAlpha = flash;
    context.fillStyle = '#d9e7ff';
    context.fillRect(0, 0, w, h);
  }
  context.restore();
}
