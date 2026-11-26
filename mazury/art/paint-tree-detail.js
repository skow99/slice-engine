// Export representative slices for ImageGen, then fit the paint to every slice.
// Usage: node paint-tree-detail.js <template-directory> <contact.png> [paint.png]
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {decodePNG, encodePNG} from '../../tools/png.js';
import {Model} from '../../src/index.js';

const [directory, contactPath, paintPath] = process.argv.slice(2);
const species = ['oak', 'birch', 'willow', 'pine', 'spruce', 'cherry'];
const referenceSlices = [39, 90, 129, 159];
const size = 192;
const columns = 16;
const width = size * 6;
const height = size * 4;
const read = path => decodePNG(readFileSync(path));
const write = (path, data, w, h) => writeFileSync(path, encodePNG(data, w, h));
const luminance = ([r, g, b]) => r * .2126 + g * .7152 + b * .0722;
const offset = (z, x, y, sheetWidth) => ((Math.floor(z / columns) * size + y) * sheetWidth + z % columns * size + x) * 4;

if (!paintPath) {
  const contact = new Uint8Array(width * height * 4);
  for (const [index, name] of species.entries()) {
    const template = read(join(directory, name + '-template.png'));
    for (const [sample, z] of referenceSlices.entries()) {
      const left = (index % 3 * 2 + sample % 2) * size;
      const top = (Math.floor(index / 3) * 2 + Math.floor(sample / 2)) * size;
      for (let y = 0; y < size; y++) {
        const start = offset(z, 0, y, template.width);
        contact.set(template.data.subarray(start, start + size * 4), ((top + y) * width + left) * 4);
      }
    }
  }
  write(contactPath, contact, width, height);
} else {
  const paint = read(paintPath);
  for (const [index, name] of species.entries()) {
    const template = read(join(directory, name + '-template.png'));
    const swatches = referenceSlices.map((z, sample) => {
      const left = (index % 3 * 2 + sample % 2) * size;
      const top = (Math.floor(index / 3) * 2 + Math.floor(sample / 2)) * size;
      const values = new Float32Array(size * size);
      const base = new Float32Array(size * size).fill(-1);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const at = offset(z, x, y, template.width);
        if (!template.data[at + 3]) continue;
        const sx = Math.floor((left + x + .5) * paint.width / width);
        const sy = Math.floor((top + y + .5) * paint.height / height);
        const texel = (sy * paint.width + sx) * 4;
        if (paint.data[texel + 3] < 180) continue;
        const cell = y * size + x;
        base[cell] = luminance(template.data.subarray(at, at + 3));
        values[cell] = Math.max(-32, Math.min(32, luminance(paint.data.subarray(texel, texel + 3)) - base[cell]));
      }
      return {z, base, values};
    });
    // Transfer paint only between similar template materials, keeping the
    // geometry and transparency from the unsampled full-resolution slices.
    for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const at = offset(z, x, y, template.width);
      if (!template.data[at + 3]) continue;
      const light = luminance(template.data.subarray(at, at + 3));
      const cell = y * size + x;
      let weighted = 0, total = 0;
      for (const {z: sampleZ, base, values} of swatches) {
        if (base[cell] < 0 || Math.abs(light - base[cell]) > 26) continue;
        const weight = 1 / (1 + Math.abs(z - sampleZ) / 20) ** 2;
        weighted += values[cell] * weight;
        total += weight;
      }
      const grain = (Model.hash(x >> 1, y >> 1, z >> 1) - .5) * 24;
      const tone = (total ? weighted / total : 0) * .72 + grain;
      const shade = Math.abs(tone) >= 9 ? 16 * Math.sign(tone) : 0;
      for (let c = 0; c < 3; c++) template.data[at + c] += shade;
    }
    write(join(directory, name + '-fitted.png'), template.data, template.width, template.height);
  }
}
