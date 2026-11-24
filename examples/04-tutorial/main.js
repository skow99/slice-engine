/* The game docs/tutorial.md builds, step by step: Garden Cart.
 * Drive a little cart round a garden and pick up as many gems as you can in
 * 60 seconds. The comments mark where each tutorial step adds its part. */
import {Voxel, Model, Input, Sfx, Particles, Gfx, Ground, Trees, Collide,
  createScreen, createScene, createCamera, startLoop, createStore, createMenu, applyGrade} from '../../src/index.js';

// Step 1: a screen and a loop.
const VIEW_W = 320, VIEW_H = 180;
const screen = createScreen({width: VIEW_W, height: VIEW_H, parent: document.querySelector('#game')});
const c = screen.context;

// Step 2: a model, built in code. Front is +y.
function cart() {
  const b = Model.builder(14, 20, 11, [
    [80, 150, 220],                        // 1 body
    [40, 42, 50],                          // 2 wheels
    {rgb: [255, 240, 190], kind: 'glow'},  // 3 lamps
    [230, 232, 236],                       // 4 seat
  ]);
  b.box(2, 1, 2, 11, 18, 5, 1);                       // body
  b.box(4, 4, 6, 9, 9, 8, 4);                         // seat
  for (const y of [4, 15]) { b.wheel(0, y, 2, 2, 2, 2); b.wheel(12, y, 2, 2, 2, 2); }
  b.box(3, 19, 4, 4, 19, 4, 3); b.box(9, 19, 4, 10, 19, 4, 3);  // lamps on the front
  return b;
}
const cartThing = Model.thing(cart());

// Step 3: input. Keys, touch buttons and gamepads all become actions.
Input.attach(window, {onFirstInput: () => { Sfx.unlock(); Sfx.music(Sfx.DEMO_SONG); }});
Input.attachTouch(document.querySelector('.touch'));
const player = {x: 400, y: 300, heading: -Math.PI / 2, speed: 0, vx: 0, vy: 0, r: 8};
function drive(dt) {
  player.heading += Input.axis('left', 'right') * 2.8 * dt;
  const gas = Input.held('up') ? 1 : Input.held('down') ? -0.5 : 0;
  player.speed = player.speed * Math.exp(-1.2 * dt) + gas * 300 * dt;  // friction, then the gas
  player.vx = Math.cos(player.heading) * player.speed;
  player.vy = Math.sin(player.heading) * player.speed;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
}

// Step 4: a world bigger than the screen, and a camera.
const WORLD_W = 800, WORLD_H = 600;
const ground = Ground.create(WORLD_W, WORLD_H);
Ground.paint(ground, (x, y) => {
  const n = Model.hash(x >> 2, y >> 2);
  return n < 0.6 ? [104, 156, 86] : n < 0.9 ? [96, 148, 80] : [120, 168, 94];
});
const camera = createCamera({viewW: VIEW_W, viewH: VIEW_H, worldW: WORLD_W, worldH: WORLD_H});
camera.snap(player);

// Step 5: scenery, placed from a seed so the garden is the same every time.
function rock(seed) {
  const b = Model.builder(18, 18, 11, [[128, 126, 120], [150, 148, 140]]);
  b.blob(9, 9, 0, 8, 7, 10, (x, y, z) => Model.hash(x, y, z + seed) < 0.2 ? 2 : 1);
  return b;
}
const rockThing = Model.thing(rock(1), {frames: 4});   // rocks only sit square: 4 pictures, not 64

const rand = Model.random(42), trees = [], rocks = [];
const away = p => Math.hypot(p.x - 400, p.y - 300) > 60;          // keep the start clear
while (trees.length < 18) {
  const t = {x: 30 + rand() * 740, y: 40 + rand() * 540, kind: ['oak2', 'birch2', 'pine2'][trees.length % 3]};
  if (away(t)) trees.push(t);
}
while (rocks.length < 12) {
  const r = {x: 30 + rand() * 740, y: 40 + rand() * 540};
  if (away(r)) rocks.push(r);
}
const obstacles = [...trees.map(t => ({...t, r: 7, fixed: true})), ...rocks.map(r => ({...r, r: 8, fixed: true}))];
const scene = createScene();

// Step 6: collisions.
function collide() {
  for (const thing of obstacles) {
    const hit = Collide.circleCircle(player, thing);
    if (hit && Collide.separate(player, thing, hit) > 80) { camera.shake(4); Sfx.play('knock'); player.speed *= 0.3; }
  }
  player.x = Math.max(10, Math.min(WORLD_W - 10, player.x));
  player.y = Math.max(10, Math.min(WORLD_H - 10, player.y));
}

// Step 7: gems, particles and sound.
function gem() {
  const b = Model.builder(7, 7, 12, [{rgb: [120, 255, 170], kind: 'glow'}]);
  for (let z = 0; z < 12; z++) b.cylinder(3, 3, z, z, z < 4 ? 0.8 + z * 0.7 : 3.4 - (z - 4) * 0.4, 1);
  return b;
}
const gemThing = Model.thing(gem(), {frames: 16});

let gems = [], score = 0, timeLeft = 60;
function placeGem() {
  for (;;) {
    const g = {x: 30 + Math.random() * 740, y: 40 + Math.random() * 520};
    if (obstacles.every(o => Math.hypot(o.x - g.x, o.y - g.y) > 20)) return g;
  }
}
function pickUp() {
  for (const g of gems) {
    if (Math.hypot(g.x - player.x, g.y - player.y) > 12) continue;
    score++;
    Particles.emit('spark', g.x, g.y - 8, 12);
    Sfx.play('coin');
    Object.assign(g, placeGem());       // a new gem somewhere else
  }
}

// Step 8: a title menu, a time limit and a saved best score.
const save = createStore('garden-cart', {defaults: {best: 0}});
let state = 'title';
const menu = createMenu({title: 'GARDEN CART', items: [
  {label: 'PLAY', action: start},
  {label: 'TIME OF DAY', value: () => Voxel.lighting.name,
    change: step => { const ids = Voxel.PRESET_IDS; Voxel.setLighting(ids[(ids.indexOf(Voxel.lightingId) + step + ids.length) % ids.length]); }},
]});
function start() {
  Object.assign(player, {x: 400, y: 300, speed: 0, vx: 0, vy: 0, heading: -Math.PI / 2});
  gems = Array.from({length: 6}, placeGem);
  score = 0; timeLeft = 60; state = 'play';
  Sfx.play('go');
}
function end() {
  state = 'title';
  if (score > save.data.best) save.set({best: score});
  Sfx.play('win');
}

const loop = startLoop({
  update(dt) {
    if (state === 'play') {
      drive(dt);
      collide();
      pickUp();
      timeLeft -= dt;
      if (timeLeft <= 0) end();
    }
    Particles.update(dt);
    camera.follow(player, dt);
  },
  draw(info) {
    Input.update();
    for (const action of Input.takeActions()) if (state === 'title') menu.handle(action);

    ground.draw(c, camera.viewX, camera.viewY, VIEW_W, VIEW_H);
    scene.clear();
    for (const t of trees) scene.add({tree: t.kind, x: t.x, y: t.y});
    for (const r of rocks) scene.add({thing: rockThing, x: r.x, y: r.y});
    for (const g of gems) scene.add({thing: gemThing, heading: info.time * 2, x: g.x, y: g.y, z: 3 + Math.sin(info.time * 4) * 2});
    scene.add({thing: cartThing, heading: player.heading, x: player.x, y: player.y});
    scene.draw(c, camera);
    Particles.draw(c, camera.viewX, camera.viewY, VIEW_W, VIEW_H);
    applyGrade(c, VIEW_W, VIEW_H);

    Gfx.text(c, 'GEMS ' + score, 6, 6, {font: 'large', color: '#78ffaa', shadow: '#000'});
    Gfx.text(c, 'BEST ' + save.data.best, 6, 18, {shadow: '#000'});
    if (state === 'play') Gfx.text(c, String(Math.ceil(timeLeft)), VIEW_W - 6, 6, {font: 'large', align: 'right', shadow: '#000'});
    else menu.draw(c, {x: VIEW_W / 2, y: 60});
  },
});

window.gardenCart = {loop, player, start, get gems() { return gems; }, get score() { return score; }, get state() { return state; }};
