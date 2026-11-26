import {Voxel} from '../src/index.js';
import {bakeBoughs, readTreeStack} from './tree-view.js';

Voxel.setCanvasFactory((width, height) => new OffscreenCanvas(width, height));
const sources = new Map();
let previousLight;

self.onmessage = async ({data: {species, direction, light, detail}}) => {
  try {
    if (!sources.has(species)) {
      const response = await fetch(new URL('./art/' + species + '-detail-slices.png', import.meta.url));
      if (!response.ok) throw new Error('Could not load detailed tree art for ' + species);
      const image = await createImageBitmap(await response.blob());
      try {
        const {model, boughs, palette} = readTreeStack(image, detail);
        sources.set(species, {boughs, palette, detail});
        Voxel.dropModel(model);
      } finally {
        image.close();
      }
    }
    const lightKey = JSON.stringify(light);
    if (lightKey !== previousLight) {
      Voxel.addPreset('tree-sky', light);
      Voxel.setLighting('tree-sky');
      previousLight = lightKey;
    }
    const layers = bakeBoughs(sources.get(species), direction);
    for (const {sprite} of layers) sprite.canvas = sprite.canvas.transferToImageBitmap();
    self.postMessage({layers}, layers.map(({sprite}) => sprite.canvas));
  } catch (error) {
    self.postMessage({error: error.message});
  }
};
