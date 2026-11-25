/* The screen: one canvas at the game's own resolution (320 × 180 by default),
 * shown as large as fits, in whole device pixels when that costs little room,
 * so each game pixel is a crisp square. An optional backing density increases
 * resolution while drawing continues in logical game pixels.
 *
 *   const screen = createScreen({width: 320, height: 180, parent: document.body});
 *   screen.context.drawImage(...)
 *
 * It also listens for the browser taking the canvases away (low memory, a GPU
 * reset, a phone putting the tab away) and giving them back: then
 * Voxel.rastersLost() drops every baked picture so they paint again, and
 * onRestore (yours) can repaint whatever else you keep (a Ground, say).
 */
import * as Voxel from './voxel.js';

export function createScreen({width = 320, height = 180, parent = document.body, background = '#0c1013',
  wholePixels = 0.84, pixelDensity = [1, 1], onRestore = null, onLost = null} = {}) {
  const [minDensity, maxDensity] = pixelDensity;
  if (!Number.isInteger(minDensity) || !Number.isInteger(maxDensity) || minDensity < 1 || maxDensity < minDensity) {
    throw new RangeError('pixelDensity must contain positive integers in ascending order');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width * minDensity; canvas.height = height * minDensity;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  const box = document.createElement('div');
  box.className = 'slice-screen';
  box.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:' + background;
  box.appendChild(canvas);
  parent.appendChild(box);
  const context = canvas.getContext('2d');
  function configureContext() {
    context.imageSmoothingEnabled = false;
    if (screen.density !== 1) context.setTransform(screen.density, 0, 0, screen.density, 0, 0);
  }
  const screen = {canvas, context, width, height, scale: 1, density: minDensity, box,
    /* Size the canvas on the page: called on resize, call it yourself if the parent changes. */
    fit() {
      const ratio = window.devicePixelRatio || 1;
      const cssW = box.clientWidth || window.innerWidth, cssH = box.clientHeight || window.innerHeight;
      const baseWidth = width * minDensity;
      const exact = Math.min(cssW * ratio / baseWidth, cssH * ratio / (height * minDensity));
      const whole = Math.max(1, Math.floor(exact));
      // Whole device pixels per game pixel unless that would waste over (1 - wholePixels) of the room.
      const deviceW = exact < 1 || whole / exact < wholePixels ? Math.max(1, Math.floor(baseWidth * exact)) : baseWidth * whole;
      const deviceH = Math.max(1, Math.round(deviceW * height / width));
      canvas.style.width = deviceW / ratio + 'px'; canvas.style.height = deviceH / ratio + 'px';
      screen.scale = deviceW / width;
      const density = Math.max(minDensity, Math.min(maxDensity, Math.ceil(screen.scale)));
      if (density !== screen.density) {
        screen.density = density;
        canvas.width = width * density;
        canvas.height = height * density;
        configureContext();
      }
    },
    /* A pointer position (clientX, clientY) in game pixels. */
    toGame(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {x: (clientX - rect.left) * width / rect.width, y: (clientY - rect.top) * height / rect.height};
    },
    clear(color = background) { context.fillStyle = color; context.fillRect(0, 0, width, height); },
    destroy() {
      observer?.disconnect();
      window.removeEventListener('resize', fit);
      canvas.removeEventListener('contextlost', lost);
      canvas.removeEventListener('contextrestored', restored);
      box.remove();
    },
  };
  const fit = () => screen.fit();
  const lost = () => { if (onLost) onLost(); };
  const restored = () => {
    configureContext();
    Voxel.rastersLost();
    if (onRestore) onRestore();
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  configureContext();
  fit();
  observer?.observe(box);
  window.addEventListener('resize', fit);
  canvas.addEventListener('contextlost', lost);
  canvas.addEventListener('contextrestored', restored);
  return screen;
}

/* The time of day's tint (Voxel.lighting.grade) over what is drawn so far in
 * a w × h area: take out some colour, multiply towards the light, lift the
 * blacks. Sprites carry the light in their colours already; this brings the
 * painted ground, particles and anything drawn by hand along. Draw it after
 * the world and before the interface. Does nothing at 'day'. */
const rgbText = rgb => 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
export function applyGrade(context, w, h, grade = Voxel.lighting.grade) {
  if (!grade) return;
  context.save();
  if (grade.saturate) {
    context.globalCompositeOperation = 'saturation'; context.globalAlpha = grade.saturate;
    context.fillStyle = '#808080'; context.fillRect(0, 0, w, h); context.globalAlpha = 1;
  }
  context.globalCompositeOperation = 'multiply'; context.fillStyle = rgbText(grade.multiply); context.fillRect(0, 0, w, h);
  context.globalCompositeOperation = 'lighter'; context.fillStyle = rgbText(grade.add); context.fillRect(0, 0, w, h);
  context.restore();
}
