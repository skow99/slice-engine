import * as Voxel from './voxel.js';

/* A masked offscreen layer for reflections and effects on a flat surface. */
export function createReflections(width, height, {tint = '#2259684d'} = {}) {
  const canvas = Voxel.canvas(width, height);
  const surface = canvas.getContext('2d');
  const wet = Voxel.canvas(width, height);
  const mask = wet.getContext('2d');
  let effects;
  surface.imageSmoothingEnabled = false;
  mask.imageSmoothingEnabled = false;

  return {
    mask,
    clear() {
      surface.clearRect(0, 0, width, height);
      mask.clearRect(0, 0, width, height);
    },
    mirror(view, item, sprite, {time = 0, roughness = 0, scaleX = 1, scaleY = scaleX,
      opacity = 1, projected = false} = {}) {
      if (!sprite || scaleX <= 0 || scaleY <= 0 || opacity <= 0) return;
      const {x, y, anchorY = y} = item;
      const sx = scaleX * view.scale;
      const sy = scaleY * view.scale;
      const left = (x - view.x) * view.scale + sprite.dx * sx;
      const span = sprite.w * sx;
      const top = (y - view.y) * view.scale + sprite.dy * sy;
      const waterline = (anchorY - view.y) * view.scale;
      roughness = Math.max(0, Math.min(1, roughness));
      const stretch = projected ? 1 : -(0.96 - 0.19 * roughness);
      const first = waterline + (top - waterline) * stretch;
      const last = first + sprite.h * sy * stretch;
      const jitter = (0.055 + roughness * (projected ? 0.25 : 0.55)) * view.scale;
      const end = Math.max(first, last), start = Math.min(first, last);
      if (left + span + jitter < 0 || left - jitter > width || end < 0 || start > height) return;

      const image = sprite.canvas;
      surface.save();
      surface.translate(0, waterline);
      surface.scale(1, stretch);
      const step = Math.max(1, Math.floor(1.6 / sy));
      for (let row = 0; row < sprite.h; row += step) {
        const size = Math.min(step, sprite.h - row);
        const sourceY = top + row * sy;
        const depth = projected ? sourceY - waterline : waterline - sourceY;
        const wave = (anchorY + depth * Math.abs(stretch) / view.scale) * 3.7 - time * (2.2 + 3 * roughness);
        const ripple = Math.sin(wave) * 0.74 + Math.sin(wave * 0.59 + x * 0.2) * 0.26;
        const fade = 1 - Math.max(0, Math.min(1, depth / (sprite.h * sy))) * 0.58;
        surface.globalAlpha = opacity * fade * (1 - roughness * (0.31 + 0.29 * Math.abs(ripple)));
        surface.drawImage(image, 0, row, sprite.w, size,
          left + jitter * ripple, sourceY - waterline, span, size * sy);
      }
      surface.restore();
    },
    draw(context) {
      surface.save();
      if (tint) {
        surface.globalCompositeOperation = 'source-atop';
        surface.fillStyle = tint;
        surface.fillRect(0, 0, width, height);
      }
      surface.globalCompositeOperation = 'destination-in';
      surface.drawImage(wet, 0, 0);
      surface.restore();
      context.drawImage(canvas, 0, 0);
    },
    drawEffect(context, paint, occlude) {
      if (!effects) {
        effects = Voxel.canvas(width, height).getContext('2d');
        effects.imageSmoothingEnabled = false;
      }
      effects.clearRect(0, 0, width, height);
      effects.save();
      try { paint(effects); } finally { effects.restore(); }
      effects.save();
      effects.globalCompositeOperation = 'destination-in';
      effects.drawImage(wet, 0, 0);
      try {
        if (occlude) {
          effects.globalCompositeOperation = 'destination-out';
          occlude(effects);
        }
      } finally {
        effects.restore();
      }
      context.drawImage(effects.canvas, 0, 0);
    },
  };
}
