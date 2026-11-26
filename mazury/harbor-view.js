import {Model, Voxel} from '../src/index.js';
import {createBuildingShadows} from './building-shadows.js';
import {approach, berth, boardingPoint, harborBounds, harborStructures, marina, marinaApron, waterAreas} from './harbor.js';
import {sceneryModel} from './settlements.js';

const quay = {colors: ['#2b4e4c', '#5f665c', '#74766a', '#9c977e', '#b0a58a'], rise: 0.27};
const pontoon = {colors: ['#2d4e49', '#544d3e', '#81705b', '#bca581'], rise: 0.18};

function path(context, outline) {
  context.beginPath();
  context.moveTo(outline[0].x, outline[0].y);
  for (const point of outline.slice(1)) context.lineTo(point.x, point.y);
  context.closePath();
}

// Paint each horizontal section above its world footprint, bottom to top.
function drawStack(context, outline, colors, rise) {
  for (let layer = 0; layer < colors.length; layer++) {
    path(context, outline.map(({x, y}) => ({x, y: y - layer * rise})));
    context.fillStyle = colors[layer];
    context.fill();
  }
  return (colors.length - 1) * rise;
}

export function paintHarbor(cottages) {
  const density = 8;
  const structures = harborStructures.flatMap(({outline}) => outline);
  const west = Math.floor(Math.min(marina.x - marina.radius, ...structures.map(p => p.x - 2)));
  const north = Math.floor(Math.min(marina.y - marina.radius, ...structures.map(p => p.y - 2)));
  const east = Math.ceil(Math.max(marina.x + marina.radius, ...structures.map(p => p.x + 2)));
  const south = Math.ceil(Math.max(marina.y + marina.radius, ...structures.map(p => p.y + 2)));
  const canvas = Voxel.canvas((east - west) * density, (south - north) * density);
  const context = canvas.getContext('2d');
  context.scale(density, density);
  context.translate(-west, -north);
  const sourcePoint = ([x, y]) => ({x: harborBounds.west + x * 0.5, y: harborBounds.north + y * 0.5});
  const buildings = [
    {...sourcePoint([1241, 682]), title: 'Restauracja', model: cottages[2], width: 15},
    {...sourcePoint([1290, 701]), title: 'Bosmanat', model: cottages[1], width: 8},
  ].map(building => ({
    ...building,
    anchorY: building.y,
    heading: building.model.direction(-1.34) * (2 * Math.PI / building.model.frames) + Math.PI / 2,
    scale: building.width / Math.max(building.model.model.w, building.model.model.h),
  }));
  const drawBuildingShadows = createBuildingShadows(() => 0);
  const random = Model.random(1213);
  // The terrain supplies both the lake and natural shoreline under the marina.
  context.save();
  path(context, marinaApron);
  context.fillStyle = '#a7a083';
  context.fill();
  context.clip();
  for (let i = 0; i < 8600; i++) {
    const x = marina.x - 35 + random() * 70;
    const y = marina.y - 43 + random() * 43;
    context.fillStyle = random() > 0.58 ? '#e5d8aa65' : '#5e684e45';
    context.fillRect(x, y, 0.22 + random() * 0.64, 0.24 + random() * 0.42);
  }
  context.restore();

  const terrace = [[1221, 690], [1252, 698], [1249, 709], [1218, 701]].map(sourcePoint);
  drawStack(context, terrace, ['#8a7657', '#bd9e6c'], 0.27);
  const terraceStart = sourcePoint([1225, 695]);
  for (let i = 0; i < 3; i++) {
    const x = terraceStart.x + i * 4.3;
    const y = terraceStart.y + i * 1.0;
    context.fillStyle = '#62574170';
    context.fillRect(x - 0.65, y - 0.16, 1.65, 0.86);
    context.fillStyle = '#f0d5a4';
    context.fillRect(x - 0.5, y - 0.69, 1.3, 0.7);
    context.fillStyle = '#764e42';
    context.fillRect(x + 0.04, y - 0.69, 0.27, 0.7);
  }

  // Parts of the apron and terrace touch the trace. Clip their edges at
  // the bank before adding the quay and pontoons, which sit over the water.
  context.save();
  context.globalCompositeOperation = 'destination-out';
  for (const outline of waterAreas) {
    path(context, outline);
    context.fill();
  }
  context.restore();

  for (const {style, outline, centerline} of harborStructures) {
    const stack = style === 'quay' ? quay : pontoon;
    const rise = drawStack(context, outline, stack.colors, stack.rise);
    context.lineWidth = style === 'quay' ? 0.48 : 0.3;
    context.strokeStyle = '#d9cc9d66';
    context.stroke();
    if (style === 'quay') {
      context.save();
      context.clip();
      context.strokeStyle = '#686b5c55';
      context.lineWidth = 2.8;
      context.stroke();
      const minX = Math.min(...outline.map(({x}) => x));
      const maxX = Math.max(...outline.map(({x}) => x));
      const minY = Math.min(...outline.map(({y}) => y));
      const maxY = Math.max(...outline.map(({y}) => y));
      context.fillStyle = '#d0bf9728';
      for (let x = minX; x < maxX; x += 2) for (let y = minY; y < maxY; y += 2) {
        if (random() > 0.45) context.fillRect(x, y, 1, 0.5);
      }
      context.restore();
    }
    if (centerline) {
      const [a, b] = centerline;
      const heading = Math.atan2(b.y - a.y, b.x - a.x);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      context.save();
      context.translate(a.x, a.y - rise);
      context.rotate(heading);
      for (let x = 1; x < length - 0.2; x += 0.64) {
        context.fillStyle = random() > 0.52 ? '#d5bc95' : '#a79170';
        context.fillRect(x, -1.04, 0.46, 2.08);
      }
      for (let x = 2; x < length; x += 4) {
        context.fillStyle = '#534b3b';
        context.fillRect(x, -1.12, 0.42, 0.4);
        context.fillRect(x, 0.71, 0.42, 0.4);
      }
      context.restore();
    }
  }

  function drawCrop(target, source, {scale, x, y}) {
    target.drawImage(source, (west - x) * scale, (north - y) * scale,
      (east - west) * scale, (south - north) * scale);
  }

  function draw(target, view, sky) {
    const {scale, x, y} = view;
    if (x > east || y > south || x + view.w / scale < west || y + view.h / scale < north) return;
    drawCrop(target, canvas, view);
    target.save();
    target.scale(scale, scale);
    target.translate(-x, -y);
    if (sky?.strength) {
      target.save();
      for (const outline of waterAreas) {
        target.beginPath();
        target.rect(west, north, east - west, south - north);
        target.moveTo(outline[0].x, outline[0].y);
        for (const point of outline.slice(1)) target.lineTo(point.x, point.y);
        target.closePath();
        target.clip('evenodd');
      }
      drawBuildingShadows(target, buildings, sky.strength);
      target.restore();
    }
    for (const building of buildings) {
      if (building.x < x - 20 || building.x > x + view.w / scale + 20
          || building.y < y - 20 || building.y > y + view.h / scale + 20) continue;
      const art = sceneryModel(building, scale < 2.5);
      target.save();
      target.translate(building.x, building.y);
      target.save();
      target.scale(art.scale, art.scale / Voxel.SQUASH);
      Voxel.draw(target, art.model.sprite(building.heading), 0, 0);
      target.restore();
      if (scale >= 3) {
        target.font = '600 1.65px system-ui';
        target.textAlign = 'center';
        const signWidth = target.measureText(building.title).width + 1.6;
        target.fillStyle = '#34453c';
        target.fillRect(-signWidth / 2, 1.85, signWidth, 2.3);
        target.fillStyle = '#f1dfbb';
        target.fillText(building.title, 0, 3.55);
      }
      target.restore();
    }
    target.restore();
  }

  return {
    draw,
    drawWaterMask(target, view) {
      target.save();
      target.globalCompositeOperation = 'destination-out';
      drawCrop(target, canvas, view);
      target.restore();
    },
  };
}

export function drawBerth(context, view, boat, port = {}) {
  const {berth: targetBerth = berth, approach: fairway = approach, boardingPoint: pierHead = boardingPoint} = port;
  const {scale, toScreen} = view;
  const points = [...fairway, targetBerth].map(toScreen);
  const target = points.at(-1);
  context.save();
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.lineWidth = 1.1;
  context.setLineDash([4, 5]);
  context.strokeStyle = '#edd39891';
  if (!boat.moored) context.stroke();

  context.setLineDash([]);
  if (boat.moored) {
    const pier = toScreen(pierHead);
    context.beginPath();
    context.moveTo(pier.x, pier.y);
    context.lineTo(target.x, target.y);
    context.strokeStyle = '#8b7556';
    context.lineWidth = Math.max(1, 0.62 * scale);
    context.stroke();
  }
  context.translate(target.x, target.y);
  context.rotate(targetBerth.heading);
  context.strokeStyle = '#f2da9f';
  context.fillStyle = '#eed49424';
  const w = targetBerth.length * scale;
  const h = targetBerth.width * scale;
  context.fillRect(-w / 2, -h / 2, w, h);
  context.strokeRect(-w / 2, -h / 2, w, h);
  if (!boat.moored) {
    context.beginPath();
    context.moveTo(w * 0.34 - 3, -2.5);
    context.lineTo(w * 0.34, 0);
    context.lineTo(w * 0.34 - 3, 2.5);
    context.stroke();
  }
  context.restore();
}

export function drawBerthSpaces(context, view, moorings) {
  context.save();
  for (const slots of moorings.values()) for (const {berth} of slots) {
    const at = view.toScreen(berth);
    if (at.x < -60 || at.x > view.w + 60 || at.y < -60 || at.y > view.h + 60) continue;
    context.save();
    context.translate(at.x, at.y);
    context.rotate(berth.heading);
    context.strokeStyle = '#e9d4a96b';
    context.lineWidth = .8;
    context.strokeRect(-berth.length * view.scale / 2, -berth.width * view.scale / 2,
      berth.length * view.scale, berth.width * view.scale);
    context.restore();
  }
  context.restore();
}
