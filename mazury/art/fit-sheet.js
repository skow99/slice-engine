/* Fit a painted ImageGen sheet to its exported geometry and reduce the palette.
 * Usage: node fit-sheet.js <template.png> <paint.png> <out.png> [jetty]
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {decodePNG, encodePNG} from '../../tools/png.js';
import {fitSheet} from '../../tools/fit-sheet.js';

const [templatePath, paintPath, outPath, kind] = process.argv.slice(2);
const template = decodePNG(readFileSync(templatePath));
const paint = decodePNG(readFileSync(paintPath));
const fitted = fitSheet(template, paint, {
  baseColor: (r, g, b) => kind === 'jetty' && r >= 191 ? [158, 147, 125] : [r, g, b],
});
writeFileSync(outPath, encodePNG(fitted.data, fitted.width, fitted.height));
