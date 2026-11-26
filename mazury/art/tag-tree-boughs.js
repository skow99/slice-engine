// Run after fit-sheet.js. Keep the bough material group in three blue bits and one red bit
// so the ordinary, opaque PNG also opens directly in the viewer.
import {readFileSync, writeFileSync} from 'node:fs';
import {grow} from './templates/lakeside-trees.js';
import {decodePNG, encodePNG} from '../../tools/png.js';

const [species, fitted, out, detail = '1'] = process.argv.slice(2);
const sheet = decodePNG(readFileSync(fitted));
const {model} = grow(species, true, Number(detail));
const size = model.w;
const columns = sheet.width / size;
for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const group = model.vox[(z * size + y) * size + x];
  const px = z % columns * size + size - 1 - x;
  const py = Math.floor(z / columns) * size + size - 1 - y;
  const i = (py * sheet.width + px) * 4;
  if (Boolean(group) !== Boolean(sheet.data[i + 3])) throw new Error('The paint and branch geometry differ');
  if (group) {
    const id = group - 1;
    sheet.data[i] = (sheet.data[i] & 254) + (id >> 3);
    sheet.data[i + 2] = (sheet.data[i + 2] & 248) + (id & 7);
  }
}
writeFileSync(out, encodePNG(sheet.data, sheet.width, sheet.height));
