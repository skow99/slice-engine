/* Export a model built in code as a PNG slice sheet, for an artist to paint
 * over (then load it back with Model.fromSliceImage).
 *
 *   node tools/model-to-sheet.js <module.js> <exportName> <out.png> [columns]
 *
 * The module must export a function that returns a builder or model, e.g.
 *   export function barrel() { const b = Model.builder(...); ...; return b; }
 * Example:
 *   node tools/model-to-sheet.js examples/02-model-viewer/models.js barrel examples/02-model-viewer/barrel-slices.png
 */
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as Voxel from '../src/voxel.js';
import * as Model from '../src/model.js';
import {encodePNG} from './png.js';

// Building needs no canvas, but a model module might bake: give it a harmless one.
Voxel.setCanvasFactory((w, h) => ({width: w, height: h, getContext: () => ({createImageData: (a, b) => ({data: new Uint8ClampedArray(a * b * 4)}), putImageData() {}})}));

const [file, name, out, columns] = process.argv.slice(2);
if (!file || !name || !out) { console.log('usage: node tools/model-to-sheet.js <module.js> <exportName> <out.png> [columns]'); process.exit(1); }
const module = await import(pathToFileURL(resolve(file)).href);
if (typeof module[name] !== 'function') { console.error(`${file} has no exported function ${name}`); process.exit(1); }
const made = module[name](), model = made.model || made;
const sheet = Model.toSlicePixels(model, {columns: Number(columns) || model.count});
writeFileSync(out, encodePNG(sheet.rgba, sheet.width, sheet.height));
console.log(`${out}: ${sheet.count} slices of ${sheet.sliceWidth} × ${sheet.sliceHeight} px in ${sheet.columns} columns (${sheet.width} × ${sheet.height} px)`);
console.log(`load it with Model.fromSliceImage(image, {sliceWidth: ${sheet.sliceWidth}, sliceHeight: ${sheet.sliceHeight}, count: ${sheet.count}${sheet.columns !== sheet.count ? ', columns: ' + sheet.columns : ''}})`);
