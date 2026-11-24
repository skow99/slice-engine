/* The docs stay true: the tutorial's code is the example's code, and the
 * snippets in making-models.md build. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Model, Voxel} from '../src/index.js';
import {useFakeCanvas} from './fake-canvas.js';

useFakeCanvas(Voxel);
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const flat = text => text.split('\n').map(line => line.trim()).join('\n');
const blocks = text => [...text.matchAll(/```js\n([\s\S]*?)```/g)].map(m => m[1]);

test('every tutorial step (2 to 8) quotes examples/04-tutorial/main.js', () => {
  const tutorial = read('docs/tutorial.md'), game = flat(read('examples/04-tutorial/main.js'));
  const steps = tutorial.split(/^## /m).filter(section => /^Step [2-8]/.test(section));
  assert.equal(steps.length, 7);
  let checked = 0;
  for (const step of steps) for (const block of blocks(step)) {
    // Fragments shown out of place ("in draw:", "after scene.draw:") are not verbatim.
    if (/\/\/ (in draw|after |\.\.\.)/.test(block)) continue;
    for (const chunk of block.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)) {
      assert.ok(game.includes(flat(chunk)), 'not in main.js:\n' + chunk);
      checked++;
    }
  }
  assert.ok(checked >= 14, 'checked ' + checked + ' chunks');
});

test('making-models.md snippets build', () => {
  const ascii = blocks(read('docs/making-models.md')).find(b => b.includes('fromLayers'));
  const b = new Function('Model', 'return ' + ascii.trim().replace(/;$/, ''))(Model);
  assert.equal(b.model.count, 4);
  assert.ok(Model.thing(b).sprite(0));
});
