import {createReflections} from '../src/index.js';

export function createWaterReflections(width, height) {
  const layer = createReflections(width, height);
  return {
    mask: layer.mask,
    clear: layer.clear,
    draw: layer.draw,
    drawWaterEffect: layer.drawEffect,
    mirror(view, time, wind, item, sprite, scaleX, scaleY, opacity, {projected = false} = {}) {
      if (!sprite) return;
      const roughness = (wind.speed + wind.gustAt(item.x, item.anchorY ?? item.y)) / 8;
      layer.mirror(view, item, sprite, {time, roughness, scaleX, scaleY, opacity, projected});
    },
  };
}
