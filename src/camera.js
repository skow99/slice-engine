/* A follow camera, after Slice Drive's: rigid to its target, with an eased
 * look-ahead in the direction of travel (so you see where you are going),
 * kept inside the world's edges, with a shake that dies away.
 *
 *   const camera = createCamera({viewW: 320, viewH: 180, worldW, worldH});
 *   camera.follow(player, dt);         // each step (or each frame)
 *   scene.draw(context, camera);       // camera.viewX / viewY / viewW / viewH
 *
 * The target needs x and y; vx and vy (px/s) give the look-ahead, z lifts the
 * view with a jumping target. lookTime: seconds of travel to look ahead;
 * lookRoom: how far off centre that may take the target (share of the view).
 */
export function createCamera({viewW = 320, viewH = 180, worldW = Infinity, worldH = Infinity,
  lookTime = 0.4, lookRoom = [0.25, 0.22], ease = 2.6, offsetY = -10} = {}) {
  const camera = {
    x: 0, y: 0, lookX: 0, lookY: 0, shakeAmount: 0,
    viewX: 0, viewY: 0, viewW, viewH, worldW, worldH, lookTime, lookRoom, ease, offsetY,
    /* Jump straight to the target (the start of a level, a respawn). */
    snap(target) { this.follow(target, 0, true); },
    follow(target, dt, snap = false) {
      let wantX = (target.vx || 0) * this.lookTime, wantY = (target.vy || 0) * this.lookTime;
      const roomX = this.viewW * this.lookRoom[0], roomY = this.viewH * this.lookRoom[1];
      wantX = Math.max(-roomX, Math.min(roomX, wantX)); wantY = Math.max(-roomY, Math.min(roomY, wantY));
      const k = snap ? 1 : 1 - Math.exp(-this.ease * dt);
      this.lookX += (wantX - this.lookX) * k; this.lookY += (wantY - this.lookY) * k;
      this.x = target.x + this.lookX;
      this.y = target.y - (target.z || 0) + this.offsetY + this.lookY;
      this.shakeAmount *= Math.exp(-9 * dt);
      const shake = this.shakeAmount > 0.4 ? this.shakeAmount : 0;
      const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
      this.place(this.x + sx, this.y + sy);
    },
    /* Centre the view on a point (kept inside the world). */
    place(x, y) {
      const maxX = this.worldW - this.viewW, maxY = this.worldH - this.viewH;
      this.viewX = Math.round(Math.max(0, Math.min(maxX, x - this.viewW / 2)));
      this.viewY = Math.round(Math.max(0, Math.min(maxY, y - this.viewH / 2)));
      if (maxX < 0) this.viewX = Math.round(maxX / 2);
      if (maxY < 0) this.viewY = Math.round(maxY / 2);
    },
    /* A knock: pixels of shake, eased out over about half a second. */
    shake(amount) { this.shakeAmount = Math.max(this.shakeAmount, amount); },
    toScreen(x, y, z = 0) { return {x: x - this.viewX, y: y - this.viewY - z}; },
    /* A point on the screen (game pixels) to the ground under it. */
    toWorld(sx, sy) { return {x: sx + this.viewX, y: sy + this.viewY}; },
    /* Is a world point within margin px of the view? (for what to add to a scene) */
    near(x, y, margin = 64) {
      return x > this.viewX - margin && x < this.viewX + this.viewW + margin && y > this.viewY - margin && y < this.viewY + this.viewH + margin * 2;
    },
  };
  return camera;
}
