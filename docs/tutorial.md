# Tutorial: Garden Cart, from an empty page

We will build a small game: drive a cart round a garden and pick up as many gems
as you can in 60 seconds. Eight steps, each one runnable. The finished game is
`examples/04-tutorial/` (`main.js` marks where each step adds its part); open it
alongside if you get lost.

You need Node (18 or later, only to serve files) and a browser.

## Step 0: a folder and a page

Make a folder for your game next to the engine, or inside it, for example
`examples/my-game/`. Every import below is `../../src/index.js`; change it if
your folder is elsewhere.

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Garden Cart</title>
<link rel="stylesheet" href="../shared/page.css">
</head>
<body>
<div id="game"></div>
<div class="touch">
  <div class="group"><button data-action="left">&#9664;</button><button data-action="right">&#9654;</button></div>
  <div class="group"><button data-action="down">&#9660;</button><button data-action="up confirm">&#9650;</button></div>
</div>
<script type="module" src="main.js"></script>
</body>
</html>
```

`../shared/page.css` makes `#game` fill the window and shows the `.touch`
buttons only on touch screens. Serve the folder and open it:

```bash
node tools/serve.js 8090
```

http://localhost:8090/examples/my-game/

## Step 1: a screen and a loop

`main.js`:

```js
import {Voxel, Model, Input, Sfx, Particles, Gfx, Ground, Trees, Collide,
  createScreen, createScene, createCamera, startLoop, createStore, createMenu, applyGrade} from '../../src/index.js';

const VIEW_W = 320, VIEW_H = 180;
const screen = createScreen({width: VIEW_W, height: VIEW_H, parent: document.querySelector('#game')});
const c = screen.context;

startLoop({
  update(dt) {},
  draw(info) {
    screen.clear('#5e7d5a');
    Gfx.text(c, 'HELLO ' + info.fps + ' FPS', 6, 6, {font: 'large', shadow: '#000'});
  },
});
```

The screen is a 320 × 180 canvas scaled up in whole pixels. The loop calls
`update(dt)` 120 times a second with `dt = 1/120` and `draw()` once per screen
frame. **The game's rules go in `update`, pictures in `draw`**: that split is
what makes the game run the same on every machine.

## Step 2: a model

Models are stacks of slices: a voxel grid. The quickest way to make one is in
code. The front of a model is `+y`.

```js
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
```

`Model.thing` wraps the model so it can be drawn at any heading. Draw it with a
scene, which also draws its shadow:

```js
const scene = createScene();
// in draw(info):
scene.clear();
scene.add({thing: cartThing, heading: info.time, x: 160, y: 100});
scene.draw(c, {viewX: 0, viewY: 0, viewW: VIEW_W, viewH: VIEW_H});
```

The cart turns. Headings are world angles: `0` faces east, `Math.PI / 2` south
(down the screen), `-Math.PI / 2` north. More ways to make models (ASCII art,
PNG slice sheets from an artist): [making-models.md](making-models.md).

## Step 3: driving it

Input turns keys, touch buttons and gamepads into *actions* (`up`, `left`, `a`,
`confirm`, ...), so the game never asks about keys.

```js
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
```

Call `drive(dt)` in `update`, call `Input.update()` at the start of `draw`, and
draw the cart at `player.heading`, `player.x`, `player.y`. (The `onFirstInput`
line starts the sound: browsers only allow it after a key or tap.)

Notice `Math.exp(-1.2 * dt)`: friction written so it does not depend on the size
of the step. Use that shape for anything that eases or slows down.

## Step 4: a world and a camera

The garden is bigger than the screen. A `Ground` is a painted canvas of any size
(kept as tiles), and the camera keeps the cart in view, looking ahead the way it
moves.

```js
const WORLD_W = 800, WORLD_H = 600;
const ground = Ground.create(WORLD_W, WORLD_H);
Ground.paint(ground, (x, y) => {
  const n = Model.hash(x >> 2, y >> 2);
  return n < 0.6 ? [104, 156, 86] : n < 0.9 ? [96, 148, 80] : [120, 168, 94];
});
const camera = createCamera({viewW: VIEW_W, viewH: VIEW_H, worldW: WORLD_W, worldH: WORLD_H});
camera.snap(player);
```

In `update`, after moving: `camera.follow(player, dt);`. In `draw`, paint the
ground under the view and pass the camera to the scene:

```js
ground.draw(c, camera.viewX, camera.viewY, VIEW_W, VIEW_H);
// ... scene.add(...) as before ...
scene.draw(c, camera);
```

`Model.hash(x, y)` is noise without state: the same numbers give the same value,
so the grass never changes between runs.

## Step 5: scenery

Trees come ready-made (eight species, three sizes, four seasons). Rocks we build:

```js
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
```

`Model.random(42)` gives the same numbers every run, so the garden is the same
each time; `away` keeps the start clear. Add them to the scene each frame:

```js
for (const t of trees) scene.add({tree: t.kind, x: t.x, y: t.y});
for (const r of rocks) scene.add({thing: rockThing, x: r.x, y: r.y});
```

The scene draws all shadows first, then everything standing from the back of
the screen to the front, so the cart passes behind trees and in front of them
correctly. Things off screen are skipped. (With hundreds of things, only add
those `camera.near(x, y)` says are close; Crystal Rover does.)

## Step 6: collisions

Give everything solid a radius and push the cart out of what it hits:

```js
const obstacles = [...trees.map(t => ({...t, r: 7, fixed: true})), ...rocks.map(r => ({...r, r: 8, fixed: true}))];

function collide() {
  for (const thing of obstacles) {
    const hit = Collide.circleCircle(player, thing);
    if (hit && Collide.separate(player, thing, hit) > 80) { camera.shake(4); Sfx.play('knock'); player.speed *= 0.3; }
  }
  player.x = Math.max(10, Math.min(WORLD_W - 10, player.x));
  player.y = Math.max(10, Math.min(WORLD_H - 10, player.y));
}
```

`separate` moves the cart out and takes away its speed into the obstacle,
returning how fast it was closing: a hard knock shakes the camera. Call
`collide()` in `update` after `drive(dt)`. For many obstacles, put them in
`Collide.createGrid()` once and `query` only the nearby ones.

## Step 7: gems, sparkles and sound

```js
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
```

In `update`: `pickUp()` and `Particles.update(dt)`. In `draw`, spin and bob the
gems (`z` lifts a thing off the ground; its shadow stays down), and draw the
particles over the scene:

```js
for (const g of gems) scene.add({thing: gemThing, heading: info.time * 2, x: g.x, y: g.y, z: 3 + Math.sin(info.time * 4) * 2});
// after scene.draw:
Particles.draw(c, camera.viewX, camera.viewY, VIEW_W, VIEW_H);
```

`kind: 'glow'` keeps the gem bright whatever the light. Sounds are synthesised:
`Sfx.play` knows `coin`, `knock`, `win`, `go` and more, and `Sfx.define` adds yours.

## Step 8: a menu, a clock and a best score

```js
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
```

The whole loop now:

```js
startLoop({
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
```

- Menus read `Input.takeActions()`, the presses in order since the last frame,
  so a quick tap is never lost and a held key does not run through the menu.
- `createStore` keeps `best` in the browser. It never throws (a private window
  just keeps nothing), and fields you add to `defaults` later appear by themselves.
- `applyGrade` tints the world for the time of day; draw the interface after it.

That is the whole game. Play it, then try:

## Where next

- **Look at Crystal Rover** (`examples/03-crystal-rover/`): pause and results
  menus, pushable crates, a spatial grid, dust behind the wheels, a minimap,
  settings that are saved, clicks on menus, everything baked while loading.
- **Your own art**: draw slice sheets ([making-models.md](making-models.md)) and
  load them with `Model.fromSliceImage`.
- **Bake while loading**: `cartThing.warm()`, `Trees.prepare('oak2')`, so the
  first turn never stutters.
- **Test without a browser**: game rules in `update` can run under Node with
  `tests/fake-canvas.js`, stepping with `loop.step(seconds)`.
- **Read [concepts.md](concepts.md)** for memory, lighting and the loop in depth.
