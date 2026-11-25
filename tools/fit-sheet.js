/* Transfer painted luminance to the exact geometry and materials of a slice template. */
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodePNG, encodePNG} from './png.js';

const luminance = (r, g, b) => r * 0.2126 + g * 0.7152 + b * 0.0722;
const samples = [0.25, 0.5, 0.75];

export function fitSheet(template, paint, {baseColor = (r, g, b) => [r, g, b]} = {}) {
  const {width, height, data} = template;
  const output = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4;
    if (data[at + 3] < 128) continue;
    const base = baseColor(data[at], data[at + 1], data[at + 2]);
    const baseLight = luminance(...base);
    let sum = 0, count = 0;
    for (const dy of samples) for (const dx of samples) {
      const sx = Math.floor((x + dx) * paint.width / width);
      const sy = Math.floor((y + dy) * paint.height / height);
      const p = (sy * paint.width + sx) * 4;
      if (paint.data[p + 3] < 210) continue;
      sum += luminance(paint.data[p], paint.data[p + 1], paint.data[p + 2]);
      count++;
    }
    const sourceLight = count ? sum / count : baseLight;
    const shade = Math.round(Math.max(-24, Math.min(24, (sourceLight - baseLight) * .67)) / 8) * 8;
    output.set([...base.map(channel => channel + shade), 255], at);
  }
  return {data: output, width, height};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [templatePath, paintPath, outPath] = process.argv.slice(2);
  if (!templatePath || !paintPath || !outPath) {
    console.error('Usage: node tools/fit-sheet.js <template.png> <paint.png> <output.png>');
    process.exitCode = 1;
  } else {
    const result = fitSheet(decodePNG(readFileSync(templatePath)), decodePNG(readFileSync(paintPath)));
    writeFileSync(outPath, encodePNG(result.data, result.width, result.height));
  }
}
