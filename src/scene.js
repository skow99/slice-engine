/* A scene: everything that stands on the ground, drawn in depth order.
 *
 * Each frame: scene.clear(), add() what is near the view, scene.draw(context,
 * view). Draw order is: flat things (layer 'ground'), then every shadow, then
 * standing things from the back of the screen to the front (by sortY, which
 * is y unless you set it), then 'overlay' things. Things wholly outside the
 * view are skipped, sprite and shadow separately.
 *
 * World: x east, y south (down the screen), z up. A thing at (x, y, z) is
 * drawn at screen (x - viewX, y - viewY - z); its shadow stays on the ground,
 * pushed along the light by its height (Voxel.SHADOW_X / SHADOW_Y per voxel).
 *
 * What an item can be (pick one way to give its picture):
 *   {thing, heading}         a Thing from model.js (sprite and shadow baked for you)
 *   {tree: 'oak0', bend}     a tree from trees.js
 *   {sprite, shadow}         handles you baked yourself ({canvas, dx, dy, w, h})
 *   {draw(context, sx, sy)}  anything drawn by hand at its screen position
 * plus x, y, and optionally z, sortY, layer ('ground' | 'overlay'),
 * noShadow, alpha. Extra fields are kept: put your own object in `of`.
 */
import * as Voxel from './voxel.js';
import * as Trees from './trees.js';

/* Is a handle drawn at (x, y) on the view inside w × h? */
function seen(handle, x, y, w, h) {
  if (!handle) return false;
  const left = Math.round(x) + handle.dx, top = Math.round(y) + handle.dy;
  return left < w && top < h && left + handle.w > 0 && top + handle.h > 0;
}

export function createScene() {
  const items = [];
  const stats = {items: 0, drawn: 0, shadows: 0, culled: 0};
  function add(item) { items.push(item); return item; }
  function clear() { items.length = 0; }
  function spriteOf(item) {
    if (item.thing) return item.thing.sprite(item.heading);
    if (item.tree) return Trees.sprite(item.tree, item.bend || 0);
    return item.sprite || null;
  }
  function shadowOf(item) {
    if (item.noShadow) return null;
    if (item.thing) return item.thing.shadow(item.heading);
    if (item.tree) return Trees.shadow(item.tree);
    return item.shadow || null;
  }
  function drawItem(context, item, viewX, viewY, w, h) {
    const sx = item.x - viewX, sy = item.y - viewY - (item.z || 0);
    if (item.alpha !== undefined) context.globalAlpha = item.alpha;
    if (item.draw) { item.draw(context, sx, sy); stats.drawn++; }
    else {
      const handle = spriteOf(item);
      if (seen(handle, sx, sy, w, h)) { Voxel.draw(context, handle, sx, sy); stats.drawn++; } else stats.culled++;
    }
    if (item.alpha !== undefined) context.globalAlpha = 1;
  }
  /* view: {viewX, viewY, viewW, viewH} (a camera from camera.js will do). */
  function draw(context, view) {
    const {viewX, viewY} = view, w = view.viewW, h = view.viewH;
    stats.items = items.length; stats.drawn = stats.shadows = stats.culled = 0;
    const ground = [], standing = [], overlay = [];
    for (const item of items) (item.layer === 'ground' ? ground : item.layer === 'overlay' ? overlay : standing).push(item);
    for (const item of ground) drawItem(context, item, viewX, viewY, w, h);
    for (const item of standing) {
      const handle = shadowOf(item);
      if (!handle) continue;
      const z = item.z || 0, sx = item.x - viewX + z * Voxel.SHADOW_X, sy = item.y - viewY + z * Voxel.SHADOW_Y;
      if (seen(handle, sx, sy, w, h)) { Voxel.draw(context, handle, sx, sy); stats.shadows++; }
    }
    // A stable sort by sortY (y by default): equal ones keep the order they were added in.
    const keys = standing.map(item => item.sortY ?? item.y);
    const order = standing.map((_, i) => i).sort((a, b) => keys[a] - keys[b] || a - b);
    for (const i of order) drawItem(context, standing[i], viewX, viewY, w, h);
    for (const item of overlay) drawItem(context, item, viewX, viewY, w, h);
    return stats;
  }
  return {items, add, clear, draw, stats};
}
