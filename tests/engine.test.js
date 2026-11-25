/* The engine under Node: node --test tests/ (or npm test). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fakeCanvas, useFakeCanvas} from './fake-canvas.js';
import {Voxel, Model, Camera, Clock, Sky, Waves, Particles, Collide, Storage, Gfx, Ground, Trees, Input, createScene, createCamera, createMenu} from '../src/index.js';

useFakeCanvas(Voxel);

/* A 6 × 10 × 4 block with a bright front row (+y), to check which way it faces. */
function arrow() {
  const b = Model.builder(6, 10, 4, [[90, 90, 100], {rgb: [255, 220, 40], kind: 'glow'}]);
  b.fill(0, 0, 0, 5, 9, 3, 1);
  b.fill(0, 9, 0, 5, 9, 3, 2);
  return b;
}
/* Mean screen position of a colour in a baked sprite. */
function where(handle, test) {
  const data = handle.canvas.pixels; let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < handle.h; y++) for (let x = 0; x < handle.w; x++) {
    const at = (y * handle.w + x) * 4;
    if (data[at + 3] && test(data[at], data[at + 1], data[at + 2])) { sx += x + handle.dx; sy += y + handle.dy; n++; }
  }
  return n ? {x: sx / n, y: sy / n, n} : null;
}
const yellow = (r, g, b) => r > 200 && g > 150 && b < 120;

test('a mirrored pose keeps the bow direction and flips height at the waterline', () => {
  const boat = Model.builder(5, 17, 11, [
    {rgb: [255, 220, 40], kind: 'glow'}, {rgb: [230, 30, 30], kind: 'glow'},
  ]);
  boat.box(1, 14, 1, 3, 16, 2, 1);
  boat.box(1, 7, 8, 3, 9, 10, 2);
  const thing = Model.thing(boat);
  const red = (r, g) => r > 180 && g < 70;
  for (const heading of [Math.PI / 2, -Math.PI / 2]) {
    const direction = thing.direction(heading);
    const upright = Voxel.tumble(thing.model, thing.variant, thing.palette, direction, 0, 0, 16, {pivotZ: 1});
    const reflection = Voxel.tumble(thing.model, thing.variant, thing.palette, direction, 0, 0, 16, {pivotZ: 1, mirrored: true});
    assert.equal(Math.sign(where(reflection, yellow).y), Math.sign(Math.sin(heading)));
    assert.ok(where(upright, red).y < -5 && where(reflection, red).y > 5);
  }
});

test('a model bakes a sprite and a shadow, cached', () => {
  const b = arrow(), t = Model.thing(b);
  const sprite = t.sprite(Math.PI / 2);
  assert.ok(sprite && sprite.w > 0 && sprite.h > 0);
  assert.equal(t.sprite(Math.PI / 2), sprite, 'second ask is the cached picture');
  assert.ok(t.shadow(0).w > 0);
  assert.ok(t.hasSprite(Math.PI / 2));
});

test('world headings: the front faces the way the heading points', () => {
  const t = Model.thing(arrow());
  const centre = h => where(t.sprite(h), () => true);
  const east = where(t.sprite(0), yellow), west = where(t.sprite(Math.PI), yellow);
  const south = where(t.sprite(Math.PI / 2), yellow), north = where(t.sprite(-Math.PI / 2), yellow);
  assert.ok(east.x > centre(0).x + 2, 'east: front on the right');
  assert.ok(west.x < centre(Math.PI).x - 2, 'west: front on the left');
  assert.ok(south.y > centre(Math.PI / 2).y + 1, 'south: front lower on screen');
  assert.ok(north.y < centre(-Math.PI / 2).y - 1, 'north: front higher on screen');
});

test('ASCII layers: drawn with the front up, a north-facing model looks as drawn', () => {
  const b = Model.fromLayers([
    `y..
     ...
     ...
     ..r`, 2], {y: [255, 220, 40], r: [220, 40, 40]});
  assert.equal(b.model.w, 3); assert.equal(b.model.h, 4); assert.equal(b.model.count, 3);
  const t = Model.thing(b), sprite = t.sprite(-Math.PI / 2);
  const y = where(sprite, yellow), r = where(sprite, (r, g, b) => r > 150 && g < 90);
  assert.ok(y.x < r.x && y.y < r.y, 'yellow stays top left, red bottom right');
  assert.throws(() => Model.fromLayers(['q'], {a: [0, 0, 0]}), /not in the key/);
});

test('slice sheets: colours become materials, layout as ASCII', () => {
  // Two 2 × 2 slices side by side: slice 0 all grey, slice 1 has one gold pixel top left.
  const w = 4, h = 2, rgba = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, c) => rgba.set([...c, 255], (y * w + x) * 4);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) put(x, y, [100, 100, 100]);
  put(2, 0, [255, 200, 0]);
  const b = Model.fromSlicePixels(rgba, w, h, {sliceWidth: 2, kinds: {'#ffc800': 'glow'}});
  assert.equal(b.model.count, 2);
  assert.equal(b.model.materials.length, 3);
  assert.equal(b.model.materials[2].kind, 'glow');
  // Top-left of the drawing is the far corner: model x = w-1, y = h-1.
  assert.equal(b.get(1, 1, 1), 2);
});

test('pack and unpack keep a model', () => {
  const b = arrow(), copy = Model.unpack(JSON.parse(JSON.stringify(Model.pack(b.model))));
  assert.deepEqual([...copy.model.vox], [...b.model.vox]);
  assert.deepEqual(copy.palette, b.palette);
});

test('lighting presets: switching drops the baked pictures; custom presets work', () => {
  const t = Model.thing(arrow());
  t.sprite(0);
  assert.ok(t.hasSprite(0));
  assert.equal(Voxel.setLighting('dusk'), true);
  assert.equal(Voxel.lightingId, 'dusk');
  assert.ok(!t.hasSprite(0));
  Voxel.addPreset('alien', {light: [0.3, -0.5, 0.8], grade: {multiply: [200, 255, 200], add: [0, 10, 0], saturate: 0}});
  Voxel.setLighting('alien');
  assert.equal(Voxel.lighting.name, 'ALIEN');
  assert.ok(t.sprite(0));
  Voxel.setLighting('day');
});

test('material light contrast softens baked shading for both sprite renderers', () => {
  const shades = (material, rolled) => {
    const block = Model.builder(8, 8, 8, [material]);
    block.box(0, 0, 0, 7, 7, 7, 1);
    const thing = Model.thing(block);
    const sprite = rolled ? Voxel.tumble(thing.model, thing.variant, thing.palette, 0, 0, 1) : thing.sprite();
    const colors = new Set();
    const pixels = sprite.canvas.pixels;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] && pixels[i] > 105) colors.add(pixels[i]);
    }
    return colors;
  };
  for (const rolled of [false, true]) {
    const material = {rgb: [215, 200, 180]};
    assert.ok(shades(material, rolled).size > 1);
    assert.deepEqual(shades({...material, lightContrast: 0}, rolled), new Set([215]));
  }
});

test('model and tree shadows extend in both signed directions when a light moves', () => {
  const column = Model.builder(3, 3, 12, [[180, 170, 150]]);
  column.box(0, 0, 0, 2, 2, 11, 1);
  const model = Model.thing(column);
  try {
    Voxel.addPreset('moving-light', {shadow: [1.5, 1.4]});
    Voxel.setLighting('moving-light');
    const east = [model.shadow(), Trees.shadow('birch2')];
    Voxel.addPreset('moving-light', {shadow: [-1.5, -1.4]});
    const west = [model.shadow(), Trees.shadow('birch2')];
    for (let i = 0; i < east.length; i++) {
      assert.ok(west[i].dx < east[i].dx - 12);
      assert.ok(west[i].dy < east[i].dy - 12);
      assert.ok(Math.abs(west[i].w - east[i].w) < 4);
      assert.ok(Math.abs(west[i].h - east[i].h) < 8);
    }
  } finally {
    Voxel.setLighting('day');
  }
});

test('the picture budget evicts least recently used sprites', () => {
  Voxel.setBudget({sprites: 4000, surfaces: 32e6});
  const t = Model.thing(arrow());
  for (let d = 0; d < 64; d++) t.sprite(d * Math.PI / 32);
  const stats = Voxel.stats();
  assert.ok(stats.sprites.bytes <= 4000 + 2000, 'held within the budget');
  assert.ok(stats.sprites.evicted > 0);
  Voxel.setBudget({sprites: 160e6});
});

test('the clock runs fixed steps and carries the rest', () => {
  const clock = Clock.create(1 / 100);
  let steps = 0;
  Clock.advance(clock, 0, () => steps++);
  Clock.advance(clock, 25, () => steps++);
  assert.equal(steps, 2);
  Clock.advance(clock, 30, () => steps++);
  assert.equal(steps, 3);
  Clock.advance(clock, 10_000, () => steps++);
  assert.equal(steps, 3 + 25, 'a stall counts as maxElapsed (0.25 s)');
});

test('particles: emit, live, die; unknown kinds fail loudly', () => {
  Particles.clear();
  Particles.emit('spark', 10, 10, 5);
  assert.equal(Particles.alive(), 5);
  Particles.define('ember', {colors: ['#ff8800'], life: 0.2});
  Particles.emit('ember', 0, 0, 3);
  const context = fakeCanvas(100, 100).getContext('2d');
  assert.equal(Particles.draw(context, -500, -500, 1000, 1000), 8);
  for (let i = 0; i < 100; i++) Particles.update(0.01);
  assert.equal(Particles.alive(), 0);
  assert.throws(() => Particles.emit('nope', 0, 0), /unknown kind/);
});

test('collisions push apart', () => {
  const a = {x: 0, y: 0, r: 5, vx: 10, vy: 0}, b = {x: 8, y: 0, r: 5, fixed: true};
  const hit = Collide.circleCircle(a, b);
  assert.equal(hit.depth, 2); assert.equal(hit.nx, -1);
  Collide.separate(a, b, hit);
  assert.equal(a.x, -2); assert.equal(a.vx, 0, 'speed into the wall taken away');
  assert.equal(Collide.circleCircle({x: 0, y: 0, r: 1}, {x: 5, y: 0, r: 1}), null);
  const box = {x: 0, y: 0, hw: 10, hh: 4};
  assert.equal(Collide.circleBox({x: 0, y: 7, r: 4}, box).ny, 1);
  assert.equal(Collide.boxBox({x: 15, y: 0, hw: 6, hh: 1}, box).nx, 1);
  const grid = Collide.createGrid(32);
  const items = Array.from({length: 50}, (_, i) => ({x: i * 20, y: 0, r: 4}));
  for (const item of items) grid.insert(item);
  const near = grid.query(100, 0, 10);
  assert.ok(near.includes(items[5]) && !near.includes(items[40]));
});

test('storage: defaults, writes, versions', () => {
  const memory = new Map();
  globalThis.localStorage = {getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k)};
  const save = Storage.createStore('test-game', {version: 1, defaults: {best: null, volume: 0.7}});
  assert.equal(save.data.volume, 0.7);
  save.set({best: 12.5});
  assert.equal(Storage.createStore('test-game', {version: 1, defaults: {best: null, volume: 0.7, added: 3}}).data.added, 3);
  assert.equal(Storage.createStore('test-game', {version: 1, defaults: {}}).data.best, 12.5);
  assert.equal(Storage.createStore('test-game', {version: 2, defaults: {best: null}}).data.best, null, 'new version starts afresh');
  assert.equal(Storage.createStore('test-game', {version: 2, keep: ['best'], defaults: {best: null}}).data.best, 12.5, 'unless kept');
  delete globalThis.localStorage;
  assert.equal(Storage.createStore('x', {defaults: {a: 1}}).available(), false);
});

test('scene: ground first, then shadows, then standing things back to front', () => {
  const t = Model.thing(arrow()), scene = createScene(), context = fakeCanvas(320, 180).getContext('2d');
  const order = [];
  scene.add({x: 100, y: 120, draw: () => order.push('front')});
  scene.add({x: 100, y: 60, draw: () => order.push('back')});
  scene.add({x: 50, y: 200, layer: 'ground', draw: () => order.push('ground')});
  scene.add({x: 60, y: 90, thing: t, heading: 0});
  scene.add({x: 9999, y: 90, thing: t, heading: 0});
  const stats = scene.draw(context, {viewX: 0, viewY: 0, viewW: 320, viewH: 180});
  assert.deepEqual(order, ['ground', 'back', 'front']);
  assert.equal(stats.shadows, 1, 'only the shadow in view');
  assert.equal(stats.culled, 1);
});

test('camera follows, looks ahead and stays inside the world', () => {
  const camera = createCamera({viewW: 320, viewH: 180, worldW: 1000, worldH: 800});
  camera.snap({x: 500, y: 400});
  assert.equal(camera.viewX, 340);
  camera.snap({x: 10, y: 10});
  assert.equal(camera.viewX, 0); assert.equal(camera.viewY, 0);
  camera.snap({x: 500, y: 400, vx: 200, vy: 0});
  assert.ok(camera.viewX > 340, 'looks ahead to the east');
});

test('pixel text and menus draw and react', () => {
  const context = fakeCanvas(320, 180).getContext('2d');
  assert.equal(Gfx.measure('ABC'), 11);
  Gfx.text(context, 'HI 1', 0, 0);
  assert.equal(context.calls.filter(c => c[0] === 'drawImage').length, 3, 'a glyph per character, none for the space');
  let picked = null, music = true;
  const menu = createMenu({title: 'TEST', sounds: false, items: [
    {label: 'PLAY', action: () => picked = 'play'},
    {label: 'LOCKED', disabled: true},
    {label: 'MUSIC', value: () => music ? 'ON' : 'OFF', change: () => music = !music},
  ]});
  menu.handle('down');
  assert.equal(menu.index, 2, 'skips the disabled row');
  menu.handle('right'); assert.equal(music, false);
  menu.handle('down'); menu.handle('confirm'); assert.equal(picked, 'play');
  menu.draw(context, {x: 160, y: 40});
  assert.equal(menu.rows.length, 3);
});

test('input: keys become actions, pressed once, held while down', () => {
  const target = new EventTarget();
  Input.attach(target);
  const key = (type, code, repeat = false) => target.dispatchEvent(Object.assign(new Event(type), {code, repeat}));
  key('keydown', 'KeyW');
  Input.update();
  assert.ok(Input.held('up') && Input.pressed('up'));
  assert.equal(Input.axis('up', 'down'), -1);
  Input.update();
  assert.ok(Input.held('up') && !Input.pressed('up'));
  key('keyup', 'KeyW'); key('keydown', 'Space');
  Input.update();
  assert.ok(!Input.held('up'));
  assert.deepEqual(Input.takeActions(), ['up', 'a', 'confirm']);
  Input.clear();
});

test('ground tiles paint and draw across tile edges', () => {
  const ground = Ground.create(700, 300);
  assert.equal(ground.tiles.length, 2);
  Ground.paint(ground, (x, y) => [x % 256, y % 256, 0]);
  const image = ground.getImageData(510, 5, 4, 1);
  assert.deepEqual([...image.data.subarray(0, 4)], [254, 5, 0, 255]);
  assert.deepEqual([...image.data.subarray(12, 16)], [1, 5, 0, 255], 'from the second tile');
});

test('trees grow and bake', () => {
  assert.ok(Trees.KINDS.includes('oak0'));
  const sprite = Trees.sprite('pine2');
  assert.ok(sprite.h > 60, 'a pine is tall');
  assert.ok(Trees.shadow('pine2').w > 0);
  Trees.setSeason('winter');
  assert.equal(Trees.getSeason(), 'winter');
  Trees.setSeason('summer');
});


test('a padded slice sheet round-trips its geometry and accepts lighting settings by colour', () => {
  const original = arrow();
  const {rgba, width, height, sliceWidth, sliceHeight, columns, count} =
    Model.toSlicePixels(original.model, {columns: 3, gap: 2});
  const options = {sliceWidth, sliceHeight, columns, count, gap: 2, kinds: {'#ffdc28': {kind: 'glow', lightContrast: 0}}};
  const result = Model.fromSlicePixels(rgba, width, height, options);
  assert.deepEqual(Model.toSlicePixels(result.model, {columns, gap: 2}).rgba, rgba);
  assert.equal(result.model.materials.find(material => material?.kind === 'glow').lightContrast, 0);
  assert.throws(() => Model.fromSlicePixels(rgba, width, height, {...options, count: 7}), /fit/);
});

test('a zoomed scene keeps fractional positions, culls in world units and preserves layer order', () => {
  const camera = Camera.view({x: 40.5, y: 30.5}, {width: 120, height: 80}, 2, {x: 40, y: 30}, .5);
  assert.deepEqual(camera.toScreen(camera.position), {x: 60, y: 40});
  assert.deepEqual(camera.toWorld({x: 60, y: 40}), camera.position);
  const context = fakeCanvas(120, 80).getContext('2d');
  context.scale = (x, y) => context.calls.push(['scale', x, y]);
  const sprite = {canvas: fakeCanvas(1, 1), dx: 0, dy: 0, w: 1, h: 1};
  const scene = createScene();
  scene.add({sprite, x: 40, y: 30});
  scene.add({sprite, x: 71, y: 31});
  scene.add({x: 40, y: 29, draw(ctx) { ctx.calls.push(['back']); }});
  const stats = scene.draw(context, camera);
  assert.deepEqual(context.calls, [['scale', 2, 2], ['back'], ['drawImage', sprite.canvas, 29.75, 19.75]]);
  assert.equal(stats.culled, 1);
});

test('simulation elapsed time is consumed in equal steps and exposes interpolation', () => {
  const clock = Clock.create(1 / 60);
  const ticks = [];
  const update = dt => ticks.push(dt);
  assert.equal(Clock.advanceBy(clock, clock.tick / 2, update), 0);
  assert.equal(Clock.alpha(clock), .5);
  assert.equal(Clock.advanceBy(clock, clock.tick * 4, update), 4);
  assert.deepEqual(ticks, Array(4).fill(clock.tick));
  assert.ok(Math.abs(Clock.alpha(clock) - .5) < 1e-8);
  Clock.reset(clock);
  assert.equal(Clock.alpha(clock), 0);
});

test('pose attachments use the same rotation as a baked model with a reduced heading count', () => {
  const thing = Model.thing(arrow(), {frames: 4});
  const direction = thing.direction(0);
  const rotate = Voxel.poseTransform(direction, 0, 0, 16, thing.frames);
  const front = rotate(0, 4, 0);
  assert.equal(front.x, 4);
  assert.ok(Math.abs(front.y) < 1e-8);
  const posed = Voxel.tumble(thing.model, thing.variant, thing.palette, direction, 0, 0, 16, {frames: thing.frames});
  assert.ok(where(posed, yellow).x > 2);
  assert.notEqual(Voxel.tumble(thing.model, thing.variant, thing.palette, direction, 0, 0, 16), posed);
});

test('sky and wave coordinates are stable across day wrap and phase reanchoring', () => {
  assert.equal(Sky.wrapDay(-1), 1439);
  assert.equal(Sky.position(720, {latitude: 0, declination: 0}).elevation, 90);
  assert.ok(Math.abs(Sky.position(360, {latitude: 0, declination: 0}).azimuth - 90) < 1e-8);
  const origin = {x: 7, y: 4, ...Waves.coordinates(7, 4, 0)};
  assert.deepEqual(Waves.coordinates(9, 13, 0, origin), Waves.coordinates(9, 13, 0));
  const field = Waves.create({bend: () => 0});
  const crest = field.crestOffset(3);
  assert.ok(field.sample(crest, 0, 3, 1).height > 0.75);
  assert.ok(field.sample(crest + field.crestSpacing / 2, 0, 3, 1).height < -0.75);
});
