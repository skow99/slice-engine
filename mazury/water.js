import {Model} from '../src/index.js';
import {boatSpeed, hull} from './sailing.js';
import {waveAt} from './weather.js';

export function drawGustBands(context, view, wind, isWater) {
  context.save();
  context.lineCap = 'round';
  for (const {x, y, dx, dy, length, width, strength} of wind.gustBands()) {
    if (strength <= 0) continue;
    for (let row = 0; row < 8; row++) for (let col = -9; col <= 9; col++) {
      const seed = Model.hash(col, row, 16);
      const across = (col + seed - 0.5) * width / 10;
      const bow = 1 - (across / width) ** 2;
      const along = length * (0.73 * bow - (row + seed * 0.65) * 0.21);
      const x1 = x + dx * along - dy * across;
      const y1 = y + dy * along + dx * across;
      const crest = 0.8 + 2.1 * seed;
      const x2 = x1 - dy * crest;
      const y2 = y1 + dx * crest;
      if (!isWater(x1, y1) || !isWater(x2, y2) || !isWater((x1 + x2) / 2, (y1 + y2) / 2)) continue;
      const a = view.toScreen({x: x1, y: y1});
      const b = view.toScreen({x: x2, y: y2});
      if (a.x < -15 || a.y < -15 || a.x > view.w + 15 || a.y > view.h + 15) continue;
      context.globalAlpha = Math.min(0.68, strength * 0.20) * bow * (1 - row / 10) * (0.45 + seed * 0.55);
      context.strokeStyle = row < 2 ? '#c4ded2' : '#91c2b9';
      context.lineWidth = row < 2 ? 1.1 : 0.72;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.quadraticCurveTo((a.x + b.x) / 2 + dx * 1.4, (a.y + b.y) / 2 + dy * 1.4, b.x, b.y);
      context.stroke();
    }
  }
  context.restore();
}

export function drawAnchor(context, view, bowEye, drop, time) {
  const a = view.toScreen(drop);
  const b = view.toScreen(bowEye);
  context.save();
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(b.x, b.y);
  context.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + view.scale * 0.32, a.x, a.y);
  const rope = context.createLinearGradient(b.x, b.y, a.x, a.y);
  rope.addColorStop(0, '#ead8b8');
  rope.addColorStop(0.7, '#dcc6a4');
  rope.addColorStop(1, '#d3c2a44a');
  context.lineWidth = Math.max(0.85, Math.min(1.3, view.scale * 0.26));
  context.strokeStyle = rope;
  context.stroke();
  context.translate(a.x, a.y);
  const age = time - drop.born;
  for (const delay of [0, 0.18]) {
    const progress = (age - delay) / 1.25;
    if (progress < 0 || progress >= 1) continue;
    context.beginPath();
    const ripple = Math.max(2, view.scale * (0.42 + progress * 2.8));
    context.ellipse(0, 0, ripple, ripple * 0.66, 0, 0, Math.PI * 2);
    context.globalAlpha = (1 - progress) ** 2;
    context.strokeStyle = '#e6f1dc';
    context.stroke();
  }
  if (age < 0.53) {
    context.globalAlpha = 1 - age / 0.53;
    context.fillStyle = '#e6f1dc';
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const travel = (0.3 + age * (2.6 + Model.hash(i, 6))) * view.scale;
      const rise = age * (0.53 - age) * 16 * view.scale;
      context.fillRect(Math.cos(angle) * travel, Math.sin(angle) * travel * 0.65 - rise, 1.3, 1.3);
    }
  }
  context.restore();
}

export function drawRipples(context, view, time, isWater, sky, wind) {
  const {x, y, w, h, scale} = view;
  const spacing = Math.max(2.5, Math.min(6, 8 / scale));
  const body = sky.body;
  const span = Math.min(w, h) / scale;
  const reach = body ? Math.hypot(body.x, body.y) : 1;
  const dx = body ? body.x / reach : 0;
  const dy = body ? body.y / reach : 0;
  const fromX = x + w / (2 * scale) + dx * span * 0.13;
  const fromY = y + h / (2 * scale) + dy * span * 0.13;
  const glintColor = 'rgb(' + sky.color.join(',') + ')';
  const shimmer = sky.source === 'moon' ? sky.moonAmount * 0.84 : sky.strength * (0.24 + sky.warmth * 0.7);
  const flowX = -Math.cos(wind.from);
  const flowY = -Math.sin(wind.from);
  const crestX = flowY;
  const crestY = -flowX;
  const breeze = Math.min(1, wind.speed / 8);
  const flurry = breeze * 0.07 + 0.12;
  const left = Math.floor(x / spacing) - 1;
  const top = Math.floor(y / spacing) - 1;
  context.save();
  context.lineCap = 'round';
  for (let row = top; row <= (y + h / scale) / spacing; row++) {
    for (let col = left; col <= (x + w / scale) / spacing; col++) {
      const seed = Model.hash(col, row);
      const originX = (col + seed) * spacing;
      const originY = (row + Model.hash(row, col, 21)) * spacing;
      const gust = Math.min(1, wind.gustAt(originX, originY) / 3.4);
      if (seed < 0.36 - 0.26 * gust) continue;
      const age = (time * (flurry + seed * 0.09) + seed * 7) % 1;
      const advance = age * (0.26 + 2.2 * breeze + 1.3 * gust);
      const sx = originX + flowX * advance;
      const sy = originY + flowY * advance;
      const along = ((sx - fromX) * dx + (sy - fromY) * dy) / span;
      const across = Math.abs((sx - fromX) * dy - (sy - fromY) * dx) / span;
      const breadth = 0.048 + (body?.z ?? 0) * 0.17 - Math.max(-0.25, along) * 0.042;
      const reflection = Math.max(0, 1 - across / Math.max(0.023, breadth))
        * Math.max(0, 1 - Math.abs(along) / 0.66) * shimmer;
      const wave = waveAt(sx, sy, time, {from: wind.from, speed: wind.speed + gust * 3.4, waveOrigin: wind.waveOrigin});
      const crest = wave.strength * Math.max(0, Math.min(.85, wave.slope / .30));
      const length = 0.35 + Model.hash(col, row, 9) * (0.9 + 1.6 * breeze + 2.2 * reflection + 2.2 * gust + 3 * crest);
      const ex = sx + crestX * length;
      const ey = sy + crestY * length * 0.72;
      if (!isWater(sx, sy) || !isWater(ex, ey)) continue;
      const sxScreen = (sx - x) * scale, syScreen = (sy - y - wave.height) * scale;
      if (crest > .2) {
        context.globalAlpha = crest * .46;
        context.strokeStyle = '#122e40';
        context.lineWidth = 1.6 + crest;
        context.beginPath();
        context.moveTo(sxScreen, syScreen + 1.2);
        context.lineTo((ex - x) * scale, (ey - y - wave.height) * scale + 1.2);
        context.stroke();
      }
      context.globalAlpha = Math.sin(age * Math.PI) ** 2 * Math.min(0.92, 0.055 + 0.25 * breeze + reflection + 0.47 * gust + .55 * crest);
      context.strokeStyle = reflection > 0.07 ? glintColor : gust > 0.2 || crest > .28 || seed > 0.8 ? '#dbe6c8' : '#a2c9bf';
      context.lineWidth = 0.65 + 0.48 * gust + .5 * crest;
      context.beginPath();
      context.moveTo(sxScreen, syScreen);
      const curve = length * (0.11 + gust * 0.09);
      context.quadraticCurveTo(((sx + ex) / 2 + flowX * curve - x) * scale,
        ((sy + ey) / 2 + flowY * curve - y - wave.height) * scale, (ex - x) * scale, (ey - y - wave.height) * scale);
      context.stroke();
    }
  }
  context.restore();
}

export function createFishRises(isWater, seed = 2417) {
  const random = Model.random(seed);
  const rises = [];
  const life = 2.2;
  const edge = [[2, 0], [1.4, 1.4], [0, 2], [-1.4, 1.4], [-2, 0], [-1.4, -1.4], [0, -2], [1.4, -1.4]];
  let next = 2.8;

  return {
    update(origin, time) {
      while (rises.length && time - rises[0].born >= life) rises.shift();
      if (time < next) return;
      next = time + 4.8 + random() * 5;
      for (let attempt = 0; attempt < 14; attempt++) {
        const direction = random() * Math.PI * 2;
        const distance = 9 + random() * 23;
        const x = origin.x + Math.cos(direction) * distance;
        const y = origin.y + Math.sin(direction) * distance;
        if (!isWater(x, y) || !edge.every(([dx, dy]) => isWater(x + dx, y + dy))) continue;
        rises.push({x, y, born: time, size: 0.78 + 0.38 * random()});
        return;
      }
    },
    draw(context, view, time) {
      if (view.scale < 1.5) return;
      context.save();
      context.strokeStyle = '#d6e9d3';
      context.fillStyle = '#e6efda';
      context.lineWidth = 0.75;
      for (const rise of rises) {
        const age = time - rise.born;
        const {x, y} = view.toScreen(rise);
        if (age < 0.3) {
          context.globalAlpha = 0.68 * (1 - age / 0.3);
          context.fillRect(x, y, 1.5, 1.5);
        }
        for (const lag of [0, 0.32]) {
          const progress = (age - lag) / (life - lag);
          if (progress < 0 || progress >= 1) continue;
          const radius = (0.18 + progress * 1.5) * rise.size * view.scale;
          context.globalAlpha = (lag ? 0.29 : 0.46) * (1 - progress) ** 1.3;
          context.beginPath();
          context.ellipse(x, y, radius, radius * 0.83, 0, 0, Math.PI * 2);
          context.stroke();
        }
      }
      context.restore();
    },
    status: () => rises.map(rise => ({...rise})),
  };
}

export function createWake() {
  const points = [];
  let last = -1;
  const life = 9;

  return {
    update(boat, time) {
      while (points.length && time - points[0].time > life) points.shift();
      const speed = boatSpeed(boat);
      if (speed < 0.28 || time - last < 0.21) return;
      const angle = Math.atan2(boat.vy, boat.vx);
      points.push({
        x: boat.x - Math.cos(angle) * 3.3, y: boat.y - Math.sin(angle) * 3.3,
        nx: -Math.sin(angle), ny: Math.cos(angle), time, speed,
      });
      last = time;
    },
    draw(context, view, time, isWater) {
      let previous;
      for (const point of points) {
        const age = time - point.time;
        const alpha = Math.min(1, point.speed / 1.65) * Math.max(0, 1 - age / life) ** 1.5;
        const spread = 0.5 + age * (0.09 + point.speed * 0.13);
        const edges = [1, -1].map(side => {
          const x = point.x + point.nx * spread * side;
          const y = point.y + point.ny * spread * side;
          return isWater(x, y) ? view.toScreen({x, y}) : null;
        });
        if (previous && point.time - previous.time < 0.45) {
          context.strokeStyle = '#dbeddf';
          context.lineWidth = 0.9;
          context.globalAlpha = alpha * 0.39;
          context.beginPath();
          for (let i = 0; i < edges.length; i++) {
            if (!edges[i] || !previous.edges[i]) continue;
            context.moveTo(previous.edges[i].x, previous.edges[i].y);
            context.lineTo(edges[i].x, edges[i].y);
          }
          context.stroke();
        }
        const screen = view.toScreen(point);
        if (isWater(point.x, point.y)) {
          context.globalAlpha = alpha * 0.45;
          context.fillStyle = '#d5e9d7';
          context.fillRect(Math.round(screen.x), Math.round(screen.y), 1, 1);
        }
        previous = {edges, time: point.time};
      }
      context.globalAlpha = 1;
    },
  };
}

export function createPropWash(isWater, seed = 8171) {
  const random = Model.random(seed);
  const drops = [];
  const life = 0.9;
  let carry = 0;
  let steeringCarry = 0;

  function emit(time, origin, direction, strength, fan, {flight, height, size}) {
    if (!isWater(origin.x, origin.y)) return;
    const spread = (random() - 0.5) * fan;
    drops.push({
      ...origin, born: time,
      vx: direction.x * strength - direction.y * spread,
      vy: direction.y * strength + direction.x * spread,
      flight: flight + random() * 0.20,
      height: height + random() * 0.4,
      size: size + random() * 0.17,
    });
  }

  return {
    update(boat, time, dt) {
      while (drops.length && time - drops[0].born >= life) drops.shift();
      const powered = boat.engine && boat.gear && !boat.moored && !boat.anchor;
      const boosting = boat.engineBoost && boat.gear > 0;
      carry = powered ? carry + dt * (boosting ? 85 : 38) : 0;
      const steeringJet = boat.steeringJet || 0;
      steeringCarry = steeringJet ? steeringCarry + dt * (18 + 24 * Math.abs(steeringJet)) : 0;
      const forwardX = Math.cos(boat.heading);
      const forwardY = Math.sin(boat.heading);
      const stern = hull.length / 2 + 0.18;
      while (carry >= 1) {
        carry--;
        const across = (random() - 0.5) * 0.85;
        const x = boat.x - stern * forwardX - across * forwardY;
        const y = boat.y - stern * forwardY + across * forwardX;
        const jet = boosting ? 4.5 + random() * 3 : 1.3 + random() * 1.8;
        emit(time, {x, y}, {x: -boat.gear * forwardX, y: -boat.gear * forwardY}, jet, boat.gear < 0 ? 3.4 : 2.2, {
          flight: boosting ? 0.38 : 0.26, height: boosting ? 0.5 : 0.23, size: 0.12,
        });
      }
      while (steeringCarry >= 1) {
        steeringCarry--;
        const side = Math.sign(steeringJet);
        const along = hull.length * 0.39 + (random() - 0.5) * 0.35;
        const across = side * hull.beam * 0.36;
        const x = boat.x + along * forwardX - across * forwardY;
        const y = boat.y + along * forwardY + across * forwardX;
        emit(time, {x, y}, {x: -side * forwardY, y: side * forwardX}, 1 + random() + Math.abs(steeringJet), 1.15, {
          flight: 0.15, height: 0.12, size: 0.085,
        });
      }
    },
    draw(context, view, time) {
      context.save();
      for (const drop of drops) {
        const age = time - drop.born;
        const travel = age / (1 + age * 1.7);
        const x = drop.x + drop.vx * travel;
        const y = drop.y + drop.vy * travel;
        if (!isWater(x, y)) continue;
        const at = view.toScreen({x, y});
        const flight = Math.min(1, age / drop.flight);
        const z = 4 * drop.height * flight * (1 - flight);
        const radius = Math.max(0.55, (drop.size + age * 0.16) * view.scale);
        context.fillStyle = '#b8ddd4';
        context.globalAlpha = 0.54 * (1 - age / life);
        context.beginPath();
        context.ellipse(at.x, at.y, radius * 1.55, radius * 0.66, 0, 0, Math.PI * 2);
        context.fill();
        if (flight >= 1) continue;
        context.fillStyle = '#eaf9ed';
        context.globalAlpha = 0.82 * (1 - flight * 0.55);
        const size = Math.max(0.8, radius * 0.72);
        context.fillRect(at.x - size / 2, at.y - z * view.scale, size, size * 1.15);
      }
      context.restore();
    },
  };
}
