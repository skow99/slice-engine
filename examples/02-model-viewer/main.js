/* Example 2: models from code, from ASCII layers and from a PNG slice sheet,
 * side by side; drop your own sheet on the page to view it. */
import {Voxel, Model, Input, Gfx, createScreen, createScene, startLoop, applyGrade} from '../../src/index.js';
import {barrel, rocket} from './models.js';

const W = 256, H = 144;
const screen = createScreen({width: W, height: H, parent: document.querySelector('#game'), background: '#1b2630'});
Input.attach(window);
Input.attachTouch(document.querySelector('.touch'));

const shown = [
  {label: 'CODE', thing: Model.thing(barrel())},
  {label: 'ASCII', thing: Model.thing(rocket())},
];
// The PNG sheet tools/model-to-sheet.js made from barrel(): the same barrel, from an image.
Model.loadImage('barrel-slices.png').then(image => {
  shown.push({label: 'PNG SHEET', thing: Model.thing(Model.fromSliceImage(image, {sliceWidth: 16}))});
});

/* Your own sheet: from the form or dropped on the page. */
const form = document.querySelector('#sheet');
async function view(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const image = await Model.loadImage(url), sliceWidth = +form.w.value || 16;
    const b = Model.fromSliceImage(image, {sliceWidth, sliceHeight: +form.h.value || sliceWidth, columns: +form.columns.value || undefined});
    shown.length = 0;
    shown.push({label: file.name.toUpperCase().replace(/[^A-Z0-9.\-_ ]/g, '') + '  ' + b.model.w + 'X' + b.model.h + 'X' + b.model.count, thing: Model.thing(b)});
  } catch (error) { alert(error.message); } finally { URL.revokeObjectURL(url); }
}
form.file.addEventListener('change', () => view(form.file.files[0]));
addEventListener('dragover', event => event.preventDefault());
addEventListener('drop', event => { event.preventDefault(); view(event.dataTransfer.files[0]); });

const scene = createScene(), camera = {viewX: 0, viewY: 0, viewW: W, viewH: H};
let heading = Math.PI / 2, spin = 0.6;
startLoop({
  update(dt) {
    Input.update();
    const turn = Input.axis('left', 'right');
    if (turn) spin = 0;
    heading += (turn * 2 + spin) * dt;
    if (Input.pressed('a') || Input.pressed('x')) Voxel.setLighting(Voxel.PRESET_IDS[(Voxel.PRESET_IDS.indexOf(Voxel.lightingId) + 1) % Voxel.PRESET_IDS.length]);
  },
  draw() {
    const c = screen.context;
    screen.clear('#5e7d5a');
    scene.clear();
    shown.forEach((item, i) => scene.add({thing: item.thing, heading, x: W * (i + 0.5) / shown.length, y: 92}));
    scene.draw(c, camera);
    applyGrade(c, W, H);
    shown.forEach((item, i) => Gfx.text(c, item.label, W * (i + 0.5) / shown.length, 112, {align: 'center', shadow: '#000'}));
    Gfx.text(c, Voxel.lighting.name, 6, 6, {shadow: '#000'});
  },
});
