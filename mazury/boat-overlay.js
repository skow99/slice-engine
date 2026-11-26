import {hull, noGoAngle} from './sailing.js';

export function drawWindGuide(context, view, boat, wind, destination) {
  const at = view.toScreen(boat);
  const radius = Math.max(9, Math.min(13, view.scale * 3.2));
  const mastClearance = Math.max(0, -Math.sin(boat.heading)) * (1 - (boat.mastFold ?? 0)) * 6.4;
  const reach = radius + (hull.length / 2 + 2.5 + mastClearance) * view.scale;
  context.save();
  context.translate(at.x + Math.cos(boat.heading) * reach, at.y + Math.sin(boat.heading) * reach);
  context.beginPath();
  context.arc(0, 0, radius + 1, 0, Math.PI * 2);
  context.fillStyle = '#132c332b';
  context.fill();
  context.strokeStyle = '#e0ebd44a';
  context.lineWidth = 0.65;
  context.stroke();
  if (wind.speed < .15) {
    context.fillStyle = '#e3e2ce';
    context.font = '7px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('Calm', 0, 0);
  } else {
    function sector(low, high, color) {
      context.beginPath();
      context.arc(0, 0, radius - .7, wind.from + low, wind.from + high);
      context.strokeStyle = color;
      context.lineWidth = 1.9;
      context.lineCap = 'round';
      context.stroke();
    }
    sector(-noGoAngle, noGoAngle, '#e69479bd');
    sector(1.05, 2.03, '#b1df9ab8');
    sector(-2.03, -1.05, '#b1df9ab8');
    context.save();
    context.rotate(wind.from);
    context.strokeStyle = '#f7edd2c9';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(radius * .56, 0);
    context.lineTo(-radius * .58, 0);
    context.moveTo(-radius * .31, -2.4);
    context.lineTo(-radius * .58, 0);
    context.lineTo(-radius * .31, 2.4);
    context.stroke();
    context.restore();
    context.save();
    context.rotate(boat.heading);
    context.fillStyle = '#f5d291bf';
    context.beginPath();
    context.moveTo(radius + 2.2, 0);
    context.lineTo(radius - .9, -1.7);
    context.lineTo(radius - .9, 1.7);
    context.fill();
    context.restore();
  }
  if (destination && Math.hypot(destination.x - boat.x, destination.y - boat.y) > 1) {
    context.rotate(Math.atan2(destination.y - boat.y, destination.x - boat.x));
    context.strokeStyle = '#ffe093';
    context.lineWidth = 1.1;
    context.beginPath();
    context.moveTo(radius + 3, -2.7);
    context.lineTo(radius + 6, 0);
    context.lineTo(radius + 3, 2.7);
    context.stroke();
  }
  context.restore();
}

export function drawBoatLights(context, view, lamps) {
  context.save();
  for (const {x, screenY, rgb} of lamps) {
    const at = view.toScreen({x, y: screenY});
    const radius = Math.max(2.5, Math.min(8, view.scale * .84));
    const glow = context.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
    glow.addColorStop(0, `rgba(${rgb},0.82)`);
    glow.addColorStop(1, `rgba(${rgb},0)`);
    context.fillStyle = glow;
    context.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
    context.fillStyle = `rgb(${rgb})`;
    context.fillRect(at.x - .55, at.y - .55, 1.1, 1.1);
  }
  context.restore();
}

export function drawBoatLightReflections(context, view, lamps, time, wind, rain) {
  const {scale} = view;
  const rough = Math.min(1, wind.speed / 10 + rain * .42);
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.lineCap = 'round';
  for (const lamp of lamps) {
    const {x, y, height, rgb} = lamp;
    // Sidelights illuminate the water just outside the topsides.
    const at = view.toScreen({x: x + (lamp.sideX ?? 0) * .98, y: y + (lamp.sideY ?? 0) * .98});
    const reach = (height * (1.16 - rough * .22) + 1.65) * scale;
    const spread = Math.max(1, scale * (.19 + rough * .23));
    const step = Math.max(.85, .16 * scale);
    if (at.x < -16 || at.x > view.w + 16 || at.y < -reach || at.y > view.h) continue;
    const bloomY = reach * (.46 + .14 * rough);
    context.save();
    context.translate(at.x, at.y + bloomY);
    context.scale(spread * 2.1, reach * .55);
    const bloom = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    bloom.addColorStop(0, `rgba(${rgb},.12)`);
    bloom.addColorStop(1, `rgba(${rgb},0)`);
    context.fillStyle = bloom;
    context.fillRect(-1, -1, 2, 2);
    context.restore();

    context.strokeStyle = `rgb(${rgb})`;
    for (let dy = step; dy < reach; dy += step) {
      const fraction = dy / reach;
      const wave = (y + dy / scale) * 7.1 - time * (3.2 + rough * 3.7);
      const crest = .5 + .5 * Math.sin(wave + Math.cos(wave * .43 + x) * 1.5);
      const fade = Math.sin(fraction * Math.PI) ** 1.4;
      if (crest < .19 + rough * .19) continue;
      const drift = Math.sin(wave * .46 + x) * spread * (.28 + rough * fraction);
      const width = spread * (.3 + crest * .8) * (.62 + fraction * .65);
      context.globalAlpha = fade * crest * (.49 - rough * .2);
      context.lineWidth = Math.min(1.35, step * .73);
      context.beginPath();
      context.moveTo(at.x + drift - width, at.y + dy);
      context.lineTo(at.x + drift + width, at.y + dy);
      context.stroke();
    }
    context.globalAlpha = 1;
  }
  context.restore();
}
