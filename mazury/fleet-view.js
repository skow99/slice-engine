import {createWake} from './water.js';
import {yachtLamps} from './yacht-view.js';

export function trafficDescription(boat) {
  if (boat.regatta) return 'Regatta volunteer';
  const port = boat.port.name;
  if (boat.moored) return (boat.slot.sternTo ? 'Moored stern-first at ' : 'Moored at ') + port;
  if (boat.anchor) return boat.intent === 'lunch' ? 'At anchor for lunch' : 'At anchor in sheltered water';
  if (boat.state === 'departing') return 'Casting off from ' + port;
  if (boat.state === 'docking') return (boat.slot.sternTo ? 'Berthing stern-first at ' : 'Berthing at ') + port;
  if (boat.state === 'seeking-anchor') return boat.intent === 'lunch' ? 'Finding a lunch stop' : 'Looking for sheltered water';
  if (boat.state === 'cruise') {
    if (boat.avoidRule && boat.avoidRule !== 'hold') return 'Giving way';
    return (boat.sail ? 'Out sailing' : 'Under way') + ' · planned stop at ' + boat.home.name;
  }
  const activity = boat.intent === 'shelter' ? 'Seeking shelter at ' : 'Bound for ';
  return boat.lastFull ? boat.lastFull + ' unavailable · ' + activity.toLowerCase() + port : activity + port;
}

export function drawTrafficMarker(context, at, boat, size = 1) {
  context.save();
  context.translate(at.x, at.y);
  context.scale(size, size);
  context.rotate(boat.heading);
  context.beginPath();
  if (boat.anchor || boat.moored) context.arc(0, 0, 2.25, 0, 2 * Math.PI);
  else {
    context.moveTo(4.3, 0);
    context.lineTo(-2.8, 2.3);
    context.lineTo(-2.8, -2.3);
    context.closePath();
  }
  context.lineWidth = 1.05;
  context.strokeStyle = '#172f35';
  context.stroke();
  context.fillStyle = boat.regatta ? '#f79c62' : boat.intent === 'shelter' && !boat.moored && !boat.anchor ? '#ffd496' : '#aee4df';
  context.fill();
  context.restore();
}

export function createTrafficView() {
  const wakes = new WeakMap();
  return {
    tick(boats, time) {
      for (const boat of boats) {
        if (!wakes.has(boat)) wakes.set(boat, createWake());
        wakes.get(boat).update(boat, time);
      }
    },
    drawWakes(context, view, visible, time, isWater) {
      for (const {boat} of visible) wakes.get(boat)?.draw(context, view, time, isWater);
    },
    visible(boats, view, blend, yachtFrame, time, pixelsPerMeter, night) {
      const items = [];
      for (const boat of boats) {
        const at = view.toScreen(boat);
        const margin = 22 * view.scale;
        if (at.x < -margin || at.y < -margin || at.x > view.w + margin || at.y > view.h + margin) continue;
        const previous = boat.previous ?? boat;
        const position = {...boat, x: previous.x + (boat.x - previous.x) * blend,
          y: previous.y + (boat.y - previous.y) * blend, heel: boat.heel + boat.waveRoll};
        const rig = {...boat, boomAngle: Math.round(boat.boomAngle * 5) / 5,
          jibAngle: Math.round(boat.jibAngle * 5) / 5, sailLuff: 0};
        const yacht = yachtFrame(rig, time, pixelsPerMeter);
        const mode = boat.moored ? 'moored' : boat.anchor ? 'anchor' : boat.engine ? 'engine' : 'sail';
        const lights = night ? yachtLamps(position, yacht.pose, mode) : [];
        items.push({boat, position, yacht, lights});
      }
      return items;
    },
  };
}
