/* A stand-in canvas for running the engine under Node: enough of the 2D
 * context for baking (image data) and for recording what gets drawn.
 *
 *   import {useFakeCanvas} from './fake-canvas.js';
 *   useFakeCanvas(Voxel);
 */
export function fakeCanvas(width, height) {
  const canvas = {width, height, pixels: new Uint8ClampedArray(width * height * 4)};
  const context = {
    canvas, calls: [], globalAlpha: 1, fillStyle: '#000', globalCompositeOperation: 'source-over', imageSmoothingEnabled: false,
    createImageData: (w, h) => ({width: w, height: h, data: new Uint8ClampedArray(w * h * 4)}),
    putImageData(image, x, y) {
      for (let row = 0; row < image.height; row++) for (let col = 0; col < image.width; col++) {
        const tx = x + col, ty = y + row;
        if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
        const from = (row * image.width + col) * 4, to = (ty * width + tx) * 4;
        canvas.pixels.set(image.data.subarray(from, from + 4), to);
      }
    },
    getImageData(x, y, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
        const from = ((y + row) * width + x + col) * 4;
        data.set(canvas.pixels.subarray(from, from + 4), (row * w + col) * 4);
      }
      return {width: w, height: h, data};
    },
    drawImage(...args) { context.calls.push(['drawImage', ...args]); },
    fillRect(...args) { context.calls.push(['fillRect', context.fillStyle, ...args]); },
    save() {}, restore() {}, translate() {}, beginPath() {}, arc() {}, fill() {},
  };
  canvas.getContext = () => context;
  return canvas;
}
export function useFakeCanvas(Voxel) { Voxel.setCanvasFactory(fakeCanvas); }
