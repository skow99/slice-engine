/* Crystal Rover: drive round the park and collect every crystal, against the
 * clock. A small complete game on the engine: a fixed-step loop, input from
 * keys / touch / gamepad, a rover with simple tank steering, collisions with
 * trees, rocks and crates you can push, particles, synthesised sound and
 * music, menus, the time of day, and a best time kept in the browser. */
import {Voxel, Model, Input, Sfx, Particles, Gfx, Trees, Collide,
  createScreen, createScene, createCamera, startLoop, createStore, createMenu, applyGrade} from '../../src/index.js';
import {WORLD_W, WORLD_H, START, things, paintGround, populate, warm} from './world.js';

const VIEW_W = 400, VIEW_H = 225;
const screen = createScreen({width: VIEW_W, height: VIEW_H, parent: document.querySelector('#game'),
  onRestore: () => { ground = paintGround(); }});   // the canvases came back: repaint what we keep
const c = screen.context;

/* ---------- Saved settings and best time ---------- */
const save = createStore('crystal-rover', {version: 1, defaults: {best: null, music: true, sound: true, light: 'day'}});
Voxel.setLighting(save.data.light);
const applySound = () => { Sfx.setVolumes(save.data.sound ? 0.7 : 0, 0.45); Sfx.music(save.data.music ? Sfx.DEMO_SONG : null); };

Input.attach(window, {onFirstInput: () => { Sfx.unlock(); applySound(); }});
Input.attachTouch(document.querySelector('.touch'));

/* ---------- The level ---------- */
let ground = paintGround();
warm();
let level, rover, time, collected;
const camera = createCamera({viewW: VIEW_W, viewH: VIEW_H, worldW: WORLD_W, worldH: WORLD_H});
const scene = createScene();
function newGame() {
  level = populate(7);
  rover = {x: START.x, y: START.y, z: 0, heading: -Math.PI / 2, vx: 0, vy: 0, r: 11, mass: 3, speed: 0, bump: 0};
  time = 0; collected = 0;
  Particles.clear();
  camera.snap(rover);
}
newGame();

/* ---------- Game states and menus ---------- */
let state = 'title';   // 'title' | 'play' | 'paused' | 'done'
let finish = null;     // {time, best: was it a new best}
const lightName = () => Voxel.lighting.name;
const nextLight = step => {
  const ids = Voxel.PRESET_IDS, id = ids[(ids.indexOf(Voxel.lightingId) + step + ids.length) % ids.length];
  Voxel.setLighting(id); save.set({light: id});
};
const settings = [
  {label: 'TIME OF DAY', value: lightName, change: nextLight},
  {label: 'MUSIC', value: () => save.data.music ? 'ON' : 'OFF', change: () => { save.set({music: !save.data.music}); applySound(); }},
  {label: 'SOUND', value: () => save.data.sound ? 'ON' : 'OFF', change: () => { save.set({sound: !save.data.sound}); applySound(); }},
];
const menus = {
  title: createMenu({title: 'CRYSTAL ROVER', width: 200, items: [
    {label: 'PLAY', action: () => { newGame(); state = 'play'; Sfx.play('go'); }},
    ...settings,
  ]}),
  paused: createMenu({title: 'PAUSED', width: 200, onBack: () => resume(), items: [
    {label: 'RESUME', action: () => resume()},
    {label: 'RESTART', action: () => { newGame(); resume(); }},
    ...settings,
    {label: 'QUIT TO TITLE', action: () => { state = 'title'; Sfx.suspend(false); }},
  ]}),
  done: createMenu({title: 'ALL CRYSTALS!', width: 200, items: [
    {label: 'PLAY AGAIN', action: () => { newGame(); state = 'play'; Sfx.play('go'); }},
    {label: 'TITLE', action: () => { state = 'title'; }},
  ]}),
};
function pause() { state = 'paused'; menus.paused.index = 0; }
function resume() { state = 'play'; }

/* Clicks and taps on menus: select the row, then confirm it. */
screen.canvas.addEventListener('pointerdown', event => {
  const menu = menus[state];
  if (!menu) return;
  Sfx.unlock();
  const p = screen.toGame(event.clientX, event.clientY);
  if (menu.hit(p.x, p.y) >= 0) menu.handle('confirm');
});

/* ---------- The rover ---------- */
const TURN = 2.7, ACCEL = 240, BRAKE = 420, REVERSE = 140, TOP = 170, TOP_BACK = 70, GRIP = 9, DRAG = 0.9;
function driveRover(dt) {
  const steer = Input.axis('left', 'right');
  const gas = Math.max(Input.held('up') ? 1 : 0, Input.analog('rt'), Input.held('a') ? 1 : 0);
  const back = Math.max(Input.held('down') ? 1 : 0, Input.analog('lt'), Input.held('b') ? 1 : 0);
  const fx = Math.cos(rover.heading), fy = Math.sin(rover.heading);
  let along = rover.vx * fx + rover.vy * fy, side = -rover.vx * fy + rover.vy * fx;
  // Tank steering: turns on the spot, a little slower at speed; reversing turns the other way round.
  rover.heading += steer * TURN * dt * (along < -5 ? -1 : 1) * (1 - Math.min(0.35, Math.abs(along) / TOP * 0.35));
  if (gas) along += ACCEL * gas * dt;
  if (back) along -= (along > 5 ? BRAKE : REVERSE) * back * dt;
  along *= Math.exp(-DRAG * dt);
  along = Math.max(-TOP_BACK, Math.min(TOP, along));
  side *= Math.exp(-GRIP * dt);   // the tyres kill most sideways slide
  const nx = Math.cos(rover.heading), ny = Math.sin(rover.heading);
  rover.vx = nx * along - ny * side; rover.vy = ny * along + nx * side;
  rover.x += rover.vx * dt; rover.y += rover.vy * dt;
  rover.speed = Math.abs(along);
  // Dust from the back wheels when moving on.
  if (rover.speed > 40 && Math.random() < rover.speed / 600) Particles.emit('dust', rover.x - nx * 12, rover.y - ny * 12, 1, -nx * 20, -ny * 20);
}
/* Push the rover out of anything it hits; knock crates about. */
const near = [];
function collide(dt) {
  let hardest = 0;
  for (const item of level.grid.query(rover.x, rover.y, rover.r + 40, near)) {
    const hit = Collide.circleCircle(rover, item);
    if (hit) hardest = Math.max(hardest, Collide.separate(rover, item, hit, 0.2) || 0);
  }
  for (const crate of level.crates) {
    const hit = Collide.circleCircle(rover, crate);
    if (hit) { Collide.separate(rover, crate, hit, 0.1); crate.heading += (Math.random() - 0.5) * 0.3; }
    // Crates slide to a stop, and stop at trees, rocks and each other.
    crate.x += crate.vx * dt; crate.y += crate.vy * dt;
    const slow = Math.exp(-3 * dt); crate.vx *= slow; crate.vy *= slow;
    for (const item of level.grid.query(crate.x, crate.y, crate.r + 40, near)) Collide.separate(crate, item, Collide.circleCircle(crate, item), 0.3);
    for (const other of level.crates) if (other !== crate) Collide.separate(crate, other, Collide.circleCircle(crate, other), 0.2);
    crate.x = Math.max(10, Math.min(WORLD_W - 10, crate.x)); crate.y = Math.max(10, Math.min(WORLD_H - 10, crate.y));
  }
  // The edge of the park.
  const before = {x: rover.x, y: rover.y};
  rover.x = Math.max(14, Math.min(WORLD_W - 14, rover.x)); rover.y = Math.max(20, Math.min(WORLD_H - 14, rover.y));
  if (rover.x !== before.x) rover.vx = 0;
  if (rover.y !== before.y) rover.vy = 0;
  if (hardest > 60) {
    camera.shake(Math.min(8, hardest / 25));
    Sfx.play('knock', Math.min(1, hardest / 200));
    Particles.emit('spark', rover.x + Math.cos(rover.heading) * 12, rover.y + Math.sin(rover.heading) * 12, 6);
  }
}
function collect() {
  for (const crystal of level.crystals) {
    if (crystal.taken || Math.hypot(crystal.x - rover.x, crystal.y - rover.y) > 16) continue;
    crystal.taken = true; collected++;
    Particles.emit('confetti', crystal.x, crystal.y - 10, 18, 0, -30);
    Particles.emit('spark', crystal.x, crystal.y - 10, 10);
    Sfx.play(collected === level.crystals.length ? 'win' : 'coin');
    if (collected === level.crystals.length) {
      const best = save.data.best === null || time < save.data.best;
      if (best) save.set({best: time});
      finish = {time, best};
      state = 'done'; menus.done.index = 0;
    }
  }
}

/* ---------- The step: 120 a second, whatever the screen does ---------- */
function update(dt) {
  Trees.frame();
  if (state === 'play') {
    time += dt;
    driveRover(dt);
    collide(dt);
    collect();
  } else if (state === 'title') {
    // The title screen drifts round the park.
    rover.heading += dt * 0.15;
    camera.follow({x: START.x + Math.cos(time * 0.1) * 300, y: START.y + Math.sin(time * 0.1) * 200}, dt);
    time += dt;
    return;
  }
  if (state !== 'paused') {
    Particles.update(dt);
    camera.follow(rover, dt);
  }
}

/* ---------- The frame ---------- */
function drawWorld(now) {
  const {viewX, viewY} = camera;
  ground.draw(c, viewX, viewY, VIEW_W, VIEW_H);
  scene.clear();
  // Only what is near the view goes in the scene (trees are tall: look further below).
  for (const tree of level.trees) if (camera.near(tree.x, tree.y, 120)) {
    scene.add({tree: tree.kind, x: tree.x, y: tree.y, bend: Math.round(Math.sin(now * 0.8 + tree.sway) * 1.5)});
  }
  for (const rock of level.rocks) if (camera.near(rock.x, rock.y)) scene.add({thing: rock.thing, heading: rock.heading, x: rock.x, y: rock.y});
  for (const crate of level.crates) if (camera.near(crate.x, crate.y)) scene.add({thing: things.crate, heading: crate.heading, x: crate.x, y: crate.y});
  for (const crystal of level.crystals) if (!crystal.taken && camera.near(crystal.x, crystal.y)) {
    scene.add({thing: crystal.thing, heading: now * 1.6 + crystal.phase, x: crystal.x, y: crystal.y, z: 4 + Math.sin(now * 3 + crystal.phase) * 3});
  }
  if (state !== 'title') scene.add({thing: things.rover, heading: rover.heading, x: rover.x, y: rover.y});
  scene.draw(c, camera);
  Particles.draw(c, viewX, viewY, VIEW_W, VIEW_H);
  applyGrade(c, VIEW_W, VIEW_H);
}
function drawMinimap() {
  const w = 70, h = Math.round(w * WORLD_H / WORLD_W), x0 = VIEW_W - w - 6, y0 = 6, k = w / WORLD_W;
  Gfx.panel(c, x0 - 2, y0 - 2, w + 4, h + 4, '#0c1418', '#4a5a68', 0.8);
  for (const crystal of level.crystals) if (!crystal.taken) Gfx.rect(c, x0 + Math.round(crystal.x * k), y0 + Math.round(crystal.y * k), 1, 1, '#8fe8ff');
  if (Math.floor(performance.now() / 250) % 2) Gfx.rect(c, x0 + Math.round(rover.x * k) - 1, y0 + Math.round(rover.y * k) - 1, 2, 2, '#ffffff');
}
function drawHud() {
  Gfx.panel(c, 4, 4, 112, 30);
  Gfx.text(c, collected + '/' + level.crystals.length, 10, 9, {font: 'large', color: '#8fe8ff', shadow: '#000'});
  Gfx.text(c, Gfx.formatTime(time), 50, 10, {font: 'large', shadow: '#000'});
  Gfx.text(c, 'BEST ' + Gfx.formatTime(save.data.best), 10, 24, {color: '#b8c4cc'});
  drawMinimap();
}
function draw(info) {
  Input.update();   // menus read actions once per frame
  const actions = Input.takeActions();
  if (state === 'play') { if (actions.includes('pause') || actions.includes('back')) pause(); }
  else for (const action of actions) if (menus[state].handle(action)) break;
  if (actions.includes('mute')) { save.set({sound: !save.data.sound}); applySound(); }

  const now = info.time;
  drawWorld(now);
  if (state === 'play' || state === 'paused' || state === 'done') drawHud();
  if (state === 'title') {
    menus.title.draw(c, {x: VIEW_W / 2, y: 70});
    Gfx.text(c, 'COLLECT EVERY CRYSTAL. ARROWS OR WASD TO DRIVE.', VIEW_W / 2, 182, {align: 'center', shadow: '#000'});
    if (save.data.best !== null) Gfx.text(c, 'BEST TIME ' + Gfx.formatTime(save.data.best), VIEW_W / 2, 194, {align: 'center', color: '#f6c95e', shadow: '#000'});
  }
  if (state === 'paused') menus.paused.draw(c, {x: VIEW_W / 2, y: 56});
  if (state === 'done') {
    menus.done.draw(c, {x: VIEW_W / 2, y: 80});
    Gfx.text(c, 'TIME ' + Gfx.formatTime(finish.time) + (finish.best ? '  NEW BEST!' : ''), VIEW_W / 2, 140, {align: 'center', font: 'large', color: finish.best ? '#f6c95e' : '#e8efed', shadow: '#000'});
  }
}

const loop = startLoop({update, draw});
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });

// The game from the console, for testing: crystalRover.loop.step(2) runs two seconds.
window.crystalRover = {loop, get state() { return state; }, get rover() { return rover; }, get level() { return level; }, Voxel, Input, newGame,
  start() { newGame(); state = 'play'; }};
