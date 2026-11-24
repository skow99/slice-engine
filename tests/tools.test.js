/* The tools: PNG writing and reading, and a model's slice sheet round trip. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodePNG, decodePNG} from '../tools/png.js';
import {Model} from '../src/index.js';

test('PNG encode and decode round trip', () => {
  const w = 5, h = 3, rgba = new Uint8ClampedArray(w * h * 4).map((_, i) => (i * 37) % 256);
  const back = decodePNG(encodePNG(rgba, w, h));
  assert.equal(back.width, w); assert.equal(back.height, h);
  assert.deepEqual([...back.data], [...rgba]);
});

test('the example barrel sheet loads as the barrel built in code', async () => {
  const {barrel} = await import('../examples/02-model-viewer/models.js');
  const png = decodePNG(readFileSync(new URL('../examples/02-model-viewer/barrel-slices.png', import.meta.url)));
  const fromSheet = Model.fromSlicePixels(png.data, png.width, png.height, {sliceWidth: 16}).model, fromCode = barrel().model;
  assert.equal(fromSheet.count, fromCode.count);
  for (let i = 0; i < fromCode.vox.length; i++) {
    const a = fromSheet.vox[i], b = fromCode.vox[i];
    assert.equal(!a, !b, 'same shape');
    if (a) assert.deepEqual(fromSheet.materials[a].rgb, fromCode.materials[b].rgb, 'same colours');
  }
});
