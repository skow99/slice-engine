/* Simple 2D collisions on the ground plane: circles and boxes, pushing apart,
 * and a spatial grid to find what is near without testing everything.
 *
 * Shapes: a circle {x, y, r}; a box {x, y, hw, hh} (centre and half sizes,
 * axis-aligned). Results: {nx, ny, depth}, the direction to push the FIRST
 * shape out of the second and how far, or null when they do not touch.
 */
export function circleCircle(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, reach = a.r + b.r, d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return null;
  const d = Math.sqrt(d2) || 1e-6;
  return {nx: d2 ? dx / d : 1, ny: d2 ? dy / d : 0, depth: reach - d};
}
export function circleBox(c, box) {
  const px = Math.max(box.x - box.hw, Math.min(box.x + box.hw, c.x)), py = Math.max(box.y - box.hh, Math.min(box.y + box.hh, c.y));
  const dx = c.x - px, dy = c.y - py, d2 = dx * dx + dy * dy;
  if (d2 > 0) {
    if (d2 >= c.r * c.r) return null;
    const d = Math.sqrt(d2);
    return {nx: dx / d, ny: dy / d, depth: c.r - d};
  }
  // The centre is inside the box: out through the nearest side.
  const left = c.x - (box.x - box.hw), right = box.x + box.hw - c.x, top = c.y - (box.y - box.hh), bottom = box.y + box.hh - c.y;
  const least = Math.min(left, right, top, bottom);
  if (least === left) return {nx: -1, ny: 0, depth: left + c.r};
  if (least === right) return {nx: 1, ny: 0, depth: right + c.r};
  if (least === top) return {nx: 0, ny: -1, depth: top + c.r};
  return {nx: 0, ny: 1, depth: bottom + c.r};
}
export function boxBox(a, b) {
  const ox = a.hw + b.hw - Math.abs(a.x - b.x), oy = a.hh + b.hh - Math.abs(a.y - b.y);
  if (ox <= 0 || oy <= 0) return null;
  return ox < oy ? {nx: Math.sign(a.x - b.x) || 1, ny: 0, depth: ox} : {nx: 0, ny: Math.sign(a.y - b.y) || 1, depth: oy};
}
export function pointInBox(x, y, box) { return Math.abs(x - box.x) <= box.hw && Math.abs(y - box.y) <= box.hh; }

/* Push a (and b, unless it is fixed) apart along a hit; with velocities
 * (vx, vy) the part of a's speed into the other is taken away, times
 * (1 + bounce). Mass: a.mass and b.mass (default 1); b.fixed for walls. */
export function separate(a, b, hit, bounce = 0) {
  if (!hit) return false;
  const ma = a.mass || 1, mb = b.fixed ? Infinity : b.mass || 1;
  const shareA = mb === Infinity ? 1 : mb / (ma + mb), shareB = 1 - shareA;
  a.x += hit.nx * hit.depth * shareA; a.y += hit.ny * hit.depth * shareA;
  if (shareB) { b.x -= hit.nx * hit.depth * shareB; b.y -= hit.ny * hit.depth * shareB; }
  const rvx = (a.vx || 0) - (b.vx || 0), rvy = (a.vy || 0) - (b.vy || 0), into = rvx * hit.nx + rvy * hit.ny;
  if (into < 0 && a.vx !== undefined) {
    const impulse = -(1 + bounce) * into;
    a.vx += hit.nx * impulse * shareA; a.vy += hit.ny * impulse * shareA;
    if (shareB && b.vx !== undefined) { b.vx -= hit.nx * impulse * shareB; b.vy -= hit.ny * impulse * shareB; }
  }
  return -into;
}

/* A spatial grid: insert things with x, y (and a size), then query a
 * rectangle or circle for candidates. Rebuild it (clear + insert) for things
 * that move; keep one built once for things that never do. */
export function createGrid(cell = 64) {
  const cells = new Map();
  const keyOf = (cx, cy) => cx * 73856093 ^ cy * 19349663;
  const grid = {
    cell,
    clear() { cells.clear(); },
    /* reach: how far the thing extends from x, y (radius or half size). */
    insert(item, reach = item.r || Math.max(item.hw || 0, item.hh || 0)) {
      const x0 = Math.floor((item.x - reach) / cell), x1 = Math.floor((item.x + reach) / cell);
      const y0 = Math.floor((item.y - reach) / cell), y1 = Math.floor((item.y + reach) / cell);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const key = keyOf(cx, cy);
        let list = cells.get(key);
        if (!list) cells.set(key, list = []);
        list.push(item);
      }
    },
    /* Everything in cells that overlap the circle (x, y, r): candidates, test them. */
    query(x, y, r = 0, out = []) {
      const seen = new Set();
      out.length = 0;
      const x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell), y0 = Math.floor((y - r) / cell), y1 = Math.floor((y + r) / cell);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const list = cells.get(keyOf(cx, cy));
        if (list) for (const item of list) if (!seen.has(item)) { seen.add(item); out.push(item); }
      }
      return out;
    },
  };
  return grid;
}
