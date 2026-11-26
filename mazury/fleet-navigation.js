import {harborClearance, inHarbor} from './harbor.js';

export const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const bearing = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const offset = (point, heading, meters) => ({
  x: point.x + Math.cos(heading) * meters, y: point.y + Math.sin(heading) * meters,
});

export function createFleetNavigation(lake, bounds, ports) {
  const spacing = 16;
  const columns = Math.ceil((bounds.east - bounds.west) / spacing);
  const rows = Math.ceil((bounds.south - bounds.north) / spacing);
  const grid = new Array(columns * rows);

  function clear(point, clearance = 5) {
    const {x, y} = point;
    if ((lake.portContact?.(point)?.distance ?? Infinity) < clearance) return false;
    if (inHarbor(x, y)) return harborClearance(point).distance >= clearance;
    return lake.waterDepth(x, y) > 0 && !lake.shoreContact({x, y, r: clearance});
  }

  function leg(a, b, clearance = 5) {
    const steps = Math.ceil(distance(a, b) / 2.5);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!clear({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t}, clearance)) return false;
    }
    return true;
  }

  function nearest(point, connected) {
    const col = Math.round((point.x - bounds.west) / spacing);
    const row = Math.round((point.y - bounds.north) / spacing);
    let best, range = 54;
    for (let y = Math.max(0, row - 3); y < Math.min(rows, row + 4); y++) {
      for (let x = Math.max(0, col - 3); x < Math.min(columns, col + 4); x++) {
        const node = grid[y * columns + x];
        if (!node || (connected && !node.connected)) continue;
        const gap = distance(point, node);
        if (gap >= range || !leg(point, node, 4)) continue;
        best = node;
        range = gap;
      }
    }
    return best;
  }

  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const point = {x: bounds.west + col * spacing, y: bounds.north + row * spacing};
    if (clear(point)) grid[row * columns + col] = {...point, col, row, edges: [], connected: false};
  }
  const entry = nearest(ports[0].approach[0], false);
  const nodes = entry ? [entry] : [];
  if (entry) entry.connected = true;
  for (const node of nodes) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const col = node.col + dx;
      if ((!dx && !dy) || col < 0 || col >= columns) continue;
      const neighbor = grid[(node.row + dy) * columns + col];
      if (!neighbor || !leg(node, neighbor)) continue;
      node.edges.push(neighbor);
      if (neighbor.connected) continue;
      neighbor.connected = true;
      nodes.push(neighbor);
    }
  }
  const connectedPorts = ports.filter(port => nearest(port.approach[0], true)
    && [...port.approach.slice(1), port.berth].every((point, i) => leg(port.approach[i], point, 1.65)));
  const moorings = new Map(connectedPorts.map(port => {
    const slots = [{berth: port.berth, approach: port.approach, boardingPoint: port.boardingPoint, sternTo: false}];
    for (const stern of port.extraMoorings ?? []) {
      if (nearest(stern.approach[0], true) && slots.every(slot => distance(slot.berth, stern.berth) >= 8)
          && [...stern.approach.slice(1), stern.berth].every((point, i) => leg(stern.approach[i], point, 4.4))) slots.push(stern);
    }
    return [port, slots];
  }));
  const approaches = [...moorings.values()].flatMap(slots => slots.flatMap(slot => slot.approach));
  const openWater = nodes.filter(point => clear(point, 13)
    && approaches.every(approach => distance(point, approach) > 36));
  const anchorages = openWater.filter(point => !clear(point, 38));

  function route(start, end) {
    if (leg(start, end, 5)) return [{x: end.x, y: end.y}];
    const first = nearest(start, true);
    const last = nearest(end, true);
    if (!first || !last) return [];
    const previous = new Map([[first, null]]);
    const queue = [first];
    for (const node of queue) {
      if (node === last) break;
      for (const neighbor of node.edges) {
        if (previous.has(neighbor)) continue;
        previous.set(neighbor, node);
        queue.push(neighbor);
      }
    }
    if (!previous.has(last)) return [];
    const path = [end];
    for (let node = last; node; node = previous.get(node)) path.push(node);
    path.reverse();
    const simplified = [];
    let from = start;
    for (let i = 0; i < path.length; i++) {
      if (i + 1 < path.length && leg(from, path[i + 1])) continue;
      from = path[i];
      simplified.push({x: from.x, y: from.y});
    }
    return simplified;
  }

  return {ports: connectedPorts, moorings, openWater, anchorages, clear, leg, route};
}
