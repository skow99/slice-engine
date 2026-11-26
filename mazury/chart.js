import {Voxel} from '../src/index.js';
import {drawTrafficMarker} from './fleet-view.js';
import {height, landCover, width} from './lake.js';
import {toSurvey} from './lake-world.js';
import {ports} from './ports.js';
import {survey} from './map/survey.js';

export function createChart(canvas, lake, detailed = false) {
  const context = canvas.getContext('2d');
  const {width: w, height: h} = canvas;
  const padding = detailed ? 14 : 5;
  const scale = Math.min((w - padding * 2) / width, (h - padding * 2) / height);
  const left = (w - width * scale) / 2;
  const top = (h - height * scale) / 2;
  const px = x => left + x * scale;
  const py = y => top + y * scale;
  const background = Voxel.canvas(w, h);
  const ink = background.getContext('2d');
  if (detailed) {
    const backgroundPixels = ink.createImageData(w, h);
    const colors = {
      [landCover.deciduous]: [45, 76, 58], [landCover.conifer]: [39, 67, 57], [landCover.mixed]: [44, 72, 56],
      [landCover.field]: [94, 95, 65], [landCover.ochreField]: [102, 92, 65], [landCover.greenField]: [85, 97, 62],
      [landCover.water]: [41, 79, 88], [landCover.road]: [115, 105, 86],
      [landCover.building]: [124, 95, 76], [landCover.settlement]: [95, 91, 73],
    };
    for (let y = padding; y < h - padding; y++) for (let x = Math.ceil(left); x < w - left; x++) {
      const worldX = (x - left) / scale;
      const worldY = (y - top) / scale;
      const cover = lake.coverAt(worldX, worldY);
      const relief = cover === landCover.water ? 0 : (lake.elevationAt(worldX, worldY) - 117) * 0.26;
      const base = colors[cover] || [74, 93, 65];
      backgroundPixels.data.set([...base.map(value => value + relief), 255], (y * w + x) * 4);
    }
    ink.putImageData(backgroundPixels, 0, 0);
  }

  for (const water of survey.lakes) {
    if (water.name !== 'Niegocin' && !detailed) continue;
    ink.beginPath();
    for (const ring of water.rings) {
      ink.moveTo(px(ring[0][0]), py(ring[0][1]));
      for (const [x, y] of ring.slice(1)) ink.lineTo(px(x), py(y));
      ink.closePath();
    }
    ink.fillStyle = water.name === 'Niegocin' ? '#345c64' : '#294f58';
    ink.fill('evenodd');
    ink.lineWidth = detailed ? 0.7 : 0.65;
    ink.strokeStyle = detailed ? '#a1b49d' : '#719790';
    ink.stroke();
  }

  const markers = ports.map(port => {
    const at = toSurvey(port.berth.x, port.berth.y);
    return {x: px(at.x / survey.metersPerPixel), y: py(at.y / survey.metersPerPixel)};
  });
  for (const at of markers) {
    ink.fillStyle = '#e9cb89';
    ink.beginPath();
    ink.arc(at.x, at.y, detailed ? 2.8 : 1.05, 0, Math.PI * 2);
    ink.fill();
  }

  if (detailed) {
    ink.font = '12px system-ui';
    ink.textBaseline = 'middle';
    for (const [name, [x, y]] of Object.entries(survey.towns)) {
      const westLabel = name === 'Bogaczewo';
      const labelX = px(x) + (westLabel ? -3 : 5);
      ink.textAlign = westLabel ? 'right' : 'left';
      ink.strokeStyle = '#182826';
      ink.lineWidth = 2.5;
      ink.strokeText(name, labelX, py(y));
      ink.fillStyle = '#eee4c9';
      ink.fillText(name, labelX, py(y));
    }
    ink.textAlign = 'left';
    const barY = h - padding - 12;
    const barX = left + 12;
    const kilometer = 1000 / survey.metersPerPixel * scale;
    ink.fillStyle = '#f1e6ce';
    ink.fillRect(barX, barY, kilometer, 1.5);
    ink.fillText('1 km', barX, barY - 8);
    ink.fillText('N ↑', w - left - 30, top + 15);
  }

  return (boat, destination, traffic = []) => {
    context.clearRect(0, 0, w, h);
    context.drawImage(background, 0, 0);
    const point = destination && toSurvey(destination.berth.x, destination.berth.y);
    const target = point && {x: px(point.x / survey.metersPerPixel), y: py(point.y / survey.metersPerPixel)};
    if (target) {
      context.strokeStyle = '#f9d187';
      context.beginPath();
      context.arc(target.x, target.y, detailed ? 7 : 3, 0, Math.PI * 2);
      context.stroke();
    }
    for (const vessel of traffic) {
      const at = toSurvey(vessel.x, vessel.y);
      const forward = toSurvey(vessel.x + Math.cos(vessel.heading), vessel.y + Math.sin(vessel.heading));
      const heading = Math.atan2(forward.y - at.y, forward.x - at.x);
      drawTrafficMarker(context, {x: px(at.x / survey.metersPerPixel), y: py(at.y / survey.metersPerPixel)},
        {...vessel, heading}, detailed ? .88 : .38);
    }
    context.save();
    context.translate(px(boat.x), py(boat.y));
    context.rotate(boat.heading);
    const arrow = detailed ? 1.3 : 0.75;
    context.scale(arrow, arrow);
    context.beginPath();
    context.moveTo(4, 0);
    context.lineTo(-2, 2.5);
    context.lineTo(-2, -2.5);
    context.closePath();
    context.fillStyle = '#fff4d7';
    context.fill();
    context.restore();
  };
}
