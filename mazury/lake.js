import {Model, Voxel} from '../src/index.js';
import {survey} from './map/survey.js';

export const {width, height} = survey;
export const landCover = Object.freeze({
  grass: 0, deciduous: 1, conifer: 2, mixed: 3, settlement: 5, sand: 6,
  wetland: 7, scrub: 8, road: 9, building: 10, garden: 11,
  field: 12, ochreField: 13, greenField: 14, water: 20,
});

export function district(x, y) {
  let name = 'Jezioro Niegocin';
  let distance = 350;
  for (const [town, [east, south]] of Object.entries(survey.towns)) {
    const here = Math.hypot(x - east, y - south);
    if (here < distance) {
      distance = here;
      name = town;
    }
  }
  return name;
}

export function createLakeMap(pixels) {
  if (pixels.length !== width * height * 4) throw new Error('Niegocin raster dimensions do not match its survey');
  const limitX = x => Math.max(0, Math.min(width - 1, x));
  const limitY = y => Math.max(0, Math.min(height - 1, y));
  const offset = (x, y) => (limitY(y) * width + limitX(x)) * 4;
  const coverAt = (x, y) => pixels[offset(Math.floor(x), Math.floor(y))];
  const heightSample = (x, y) => pixels[offset(x, y) + 1];
  function elevationAt(x, y) {
    const x0 = Math.floor(x - 0.5);
    const y0 = Math.floor(y - 0.5);
    const fx = x - 0.5 - x0;
    const fy = y - 0.5 - y0;
    const a = heightSample(x0, y0) * (1 - fx) + heightSample(x0 + 1, y0) * fx;
    const b = heightSample(x0, y0 + 1) * (1 - fx) + heightSample(x0 + 1, y0 + 1) * fx;
    return survey.elevationOrigin + survey.elevationStep * (a * (1 - fy) + b * fy);
  }

  function signedPixel(x, y) {
    const at = offset(x, y);
    const distance = pixels[at + 2] - 0.5;
    return pixels[at] === landCover.water ? distance : -distance;
  }

  function depthAt(x, y) {
    return Math.min(signedPixel(Math.floor(x), Math.floor(y)), x, y, width - x, height - y);
  }

  function waterDepth(x, y) {
    // Pixel centers are at n + 0.5. Interpolate to keep grounding smoother than raster steps.
    const x0 = Math.floor(x - 0.5);
    const y0 = Math.floor(y - 0.5);
    const fx = x - 0.5 - x0;
    const fy = y - 0.5 - y0;
    const a = signedPixel(x0, y0) * (1 - fx) + signedPixel(x0 + 1, y0) * fx;
    const b = signedPixel(x0, y0 + 1) * (1 - fx) + signedPixel(x0 + 1, y0 + 1) * fx;
    return Math.min(a * (1 - fy) + b * fy, x, y, width - x, height - y);
  }

  function shoreContact(boat) {
    const {x, y, r} = boat;
    const depth = waterDepth(x, y);
    if (depth >= r) return null;
    const nx = waterDepth(x + 3, y) - waterDepth(x - 3, y);
    const ny = waterDepth(x, y + 3) - waterDepth(x, y - 3);
    const length = Math.hypot(nx, ny);
    if (length < 0.001) return null;
    return {nx: nx / length, ny: ny / length, depth: r - depth};
  }

  return {coverAt, elevationAt, depthAt, waterDepth, shoreContact};
}

export async function loadLakeMap() {
  const url = new URL('./map/terrain.png', import.meta.url);
  const image = await Model.loadImage(url.href);
  if (image.width !== width || image.height !== height) throw new Error('Unexpected Niegocin raster size');
  const canvas = Voxel.canvas(width, height);
  const context = canvas.getContext('2d', {willReadFrequently: true, colorSpace: 'srgb'});
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, width, height).data;
  canvas.width = canvas.height = 1;
  return createLakeMap(data);
}
