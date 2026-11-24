/* Example 1: one model built in code, drawn at any heading, with its shadow,
 * under the four times of day. The smallest useful program on the engine. */
import {Voxel, Model, Input, Gfx, Ground, createScreen, createScene, startLoop, applyGrade} from '../../src/index.js';

const screen = createScreen({width: 320, height: 180, parent: document.querySelector('#game')});
Input.attach(window);
Input.attachTouch(document.querySelector('.touch'));

/* A cottage, 40 × 32 voxels on the ground and 31 high. Colours are
 * materials 1, 2, 3...; 'glow' ignores the light (windows at dusk). */
function cottage() {
  const b = Model.builder(40, 32, 31, [
    [226, 214, 190],                   // 1 walls
    [176, 76, 62],                     // 2 roof
    [104, 70, 52],                     // 3 door and beams
    {rgb: [255, 214, 120], kind: 'glow'}, // 4 windows
    [120, 122, 128],                   // 5 chimney
  ]);
  b.box(3, 3, 0, 36, 28, 16, 1);                                    // walls
  for (let z = 17; z <= 30; z++) b.box(z - 17, 1, z, 39 - (z - 17), 30, z, 2); // gable roof, ridge along y
  b.box(17, 28, 0, 22, 28, 10, 3);                                  // door on the front (+y)
  b.box(7, 28, 6, 12, 28, 11, 4); b.box(27, 28, 6, 32, 28, 11, 4);  // front windows
  b.box(3, 10, 6, 3, 15, 11, 4); b.box(36, 10, 6, 36, 15, 11, 4);   // side windows
  b.box(28, 8, 20, 32, 12, 30, 5);                                  // chimney
  return b;
}
/* A crate: a box with a darker frame, using a pattern function for the planks. */
function crate() {
  const b = Model.builder(12, 12, 12, [[186, 140, 84], [128, 90, 52]]);
  b.box(0, 0, 0, 11, 11, 11, (x, y, z) => (x % 11 === 0) + (y % 11 === 0) + (z % 11 === 0) >= 2 || z % 4 === 0 ? 2 : 1);
  return b;
}

const house = Model.thing(cottage());
// The same crate model in a second colour: shares the model's baked surfaces.
const box = Model.thing(crate(), {frames: 8}), blueBox = box.recolored({1: [96, 140, 186], 2: [54, 84, 120]}, 'blue');

/* The ground: painted once into tiles, then copied in each frame. */
const ground = Ground.create(320, 180);
Ground.paint(ground, (x, y) => {
  const n = Model.hash(x >> 2, y >> 2);
  return n < 0.5 ? [112, 160, 88] : n < 0.85 ? [104, 150, 82] : [126, 172, 96];
});

const scene = createScene(), view = {viewX: 0, viewY: 0, viewW: 320, viewH: 180};
let heading = Math.PI / 2, spin = 0.4;

startLoop({
  update(dt) {
    Input.update();
    const turn = Input.axis('left', 'right');
    if (turn) spin = 0;
    heading += (turn * 2 + spin) * dt;
    if (Input.pressed('a') || Input.pressed('x')) {
      const ids = Voxel.PRESET_IDS, next = ids[(ids.indexOf(Voxel.lightingId) + 1) % ids.length];
      Voxel.setLighting(next);   // every sprite bakes again in the new light, as it is next drawn
    }
  },
  draw(info) {
    const c = screen.context;
    ground.draw(c, 0, 0, 320, 180);
    scene.clear();
    scene.add({thing: house, heading, x: 160, y: 112});
    scene.add({thing: box, heading: 0.3, x: 92, y: 140});
    scene.add({thing: blueBox, heading: -0.2, x: 236, y: 92});
    scene.add({thing: box, heading: 1.1, x: 228, y: 150, z: 6 + Math.sin(info.time * 3) * 6}); // a hovering crate: its shadow stays down
    scene.draw(c, view);
    applyGrade(c, 320, 180);
    Gfx.text(c, 'SLICE ENGINE', 6, 6, {font: 'large', color: '#f6c95e', shadow: '#000'});
    Gfx.text(c, Voxel.lighting.name + '   ' + info.fps + ' FPS', 6, 18, {shadow: '#000'});
  },
});

// For poking at from the browser console.
window.example = {Voxel, house, scene};
