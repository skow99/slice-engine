# API reference

Everything imports from `src/index.js`:

```js
import {Voxel, Model, Scene, Camera, Screen, Loop, Clock, Input, Sfx, Particles, Gfx, Ground, Trees,
  Collide, Storage, Menu, createScreen, createScene, createCamera, startLoop, createStore, createMenu,
  createGrid, applyGrade} from './src/index.js';
```

A *handle* below is a baked picture: `{canvas, dx, dy, w, h}`, drawn with its
anchor (the model's centre on the ground) at a point: `Voxel.draw(context, handle, x, y)`.

---

## Model (`model.js`)

### `Model.builder(w, h, count, colors)` → builder

A new model of `w × h × count` voxels. `colors[i]` is material `i + 1`:
`[r, g, b]` (matte) or `{rgb: [r, g, b], kind}` (`'matte' | 'gloss' | 'glass' | 'glow' | 'ink'`).
Every shape takes an `id`: a material number, `0` to carve out, or a function
`(x, y, z) => id` for patterns. Voxels outside the grid are ignored.

| Builder member | Does |
| --- | --- |
| `model`, `palette` | The model (for `Voxel`) and its palette. |
| `set(x, y, z, id)`, `get(x, y, z)` | One voxel. |
| `box(x0, y0, z0, x1, y1, z1, id)` (also `fill`) | A box between corners, inclusive. |
| `blob(cx, cy, cz, rx, ry, rz, id)` | An ellipsoid. |
| `cylinder(cx, cy, z0, z1, radius, id, topRadius)` | Upright cylinder; a cone with `topRadius`. |
| `wheel(cx, cy, cz, r, thickness, id, axis)` | A disc lying across `axis` `'x'` (default) or `'y'`. |
| `mirrorX()` | Copy the left half (`x < w/2`) onto the right. |

### `Model.fromLayers(layers, key)` → builder

ASCII art. `layers`: bottom slice first, each a string (rows on lines) or an
array of rows; a number `n` repeats the previous slice `n` more times. Each is a
top view with the front pointing up. `key`: `{char: [r,g,b] | '#rrggbb' | {rgb, kind}}`.
`.` is empty. Rows are trimmed, so template strings can be indented.

### `Model.fromSlicePixels(rgba, width, height, options)` / `Model.fromSliceImage(image, options)` → builder

A PNG slice sheet: slices of `sliceWidth × sliceHeight` left to right (then in
rows when `columns` is given), bottom first, front up. Each distinct opaque
colour is a material (255 at most); alpha < 128 is empty.
Options: `sliceWidth` (needed), `sliceHeight` (default: width), `count`,
`columns`, `kinds: {'#ffcc00': 'glow'}`. `Model.loadImage(url)` → `Promise<Image>`.

### `Model.toSlicePixels(model, {columns, gap})` → `{rgba, width, height, ...}`

The reverse: a model as sheet pixels. `tools/model-to-sheet.js` writes them as PNG.

### `Model.pack(model)` → JSON-safe object; `Model.unpack(data)` → builder

### `Model.thing(source, {palette, variant, frames})` → Thing

`source`: a builder or a model. `frames`: headings it can show (64 default; 4, 8,
16 or 32 for things that do not turn smoothly). `variant`: cache name for this
palette.

| Thing member | Does |
| --- | --- |
| `sprite(heading)` | The handle for a world heading (radians, 0 = east). Bakes on first ask. |
| `shadow(heading)` | Its ground shadow handle. |
| `hasSprite(heading)` | Baked already? |
| `recolored(changes, name)` | Same model, colours changed (`{materialId: [r,g,b] or '#hex'}`); kinds stay. |
| `warm()` | Bake every heading now. |
| `direction(heading)` | The frame number a heading uses. |

### Helpers

`Model.random(seed)` → a repeatable `() => [0, 1)`. `Model.hash(x, y, z)` →
`[0, 1)` from whole numbers (noise without state). `Model.hexToRgb('#rrggbb')`,
`Model.paletteOf(model)`, `Model.recolor(palette, changes)`.

---

## Voxel (`voxel.js`): the renderer

Most games only need `Model.thing` and `Scene`. Use these for more control.

| Function | Does |
| --- | --- |
| `createModel(w, h, count, materials)` | A raw model; `materials[0]` must be `null`. Fill `model.vox[(z * h + y) * w + x]`. |
| `sprite(model, variant, palette, direction, options)` | Bake or fetch one sprite. `direction` from `directionOf(turn, frames)`, `turn = heading - PI/2`. Options: `frames`, `shear` (lean the stack sideways: body roll), `pose: {pitch, heave, scale}` (with `model.suspension = [fromZ, toZ]`: only the body moves), `override` + `only` (swap materials of chosen voxels; with `only`, just those: overlays such as lit lamps). |
| `shadow(model, direction, frames)` | Bake or fetch the ground shadow. |
| `tumble(model, variant, palette, direction, pitchStep, rollStep, steps)` | A model rolled and pitched in the air (flips), `steps` per turn. |
| `draw(context, handle, x, y)` | Draw a handle at a point (rounded to whole pixels). |
| `directionOf(turn, frames)` | A turn (radians) to a frame number. |
| `setLighting(id)`, `addPreset(id, preset)` | Time of day; `PRESETS`, `PRESET_IDS`; live `lighting`, `lightingId`, `SHADOW_X`, `SHADOW_Y`. |
| `setBudget({surfaces, sprites})`, `stats()` | The memory budget in bytes; what is held and evicted. |
| `dropModel(model)` | Forget a model and its pictures for good. |
| `onRastersLost(hook)`, `rastersLost()` | Lost canvases: register a cache to clear; drop everything. |
| `canvas(w, h)` | A counted offscreen canvas. `setCanvasFactory(fn)` replaces how they are made (tests). |
| `attachTexture(model, rgba, width, height)` | Advanced: colour a model from five drawn views. |
| Constants | `TURN_FRAMES` (64), `SQUASH` (0.75), `LEVELS` (6 light steps). |

---

## Scene (`scene.js`)

`createScene()` → `{add(item), clear(), draw(context, view), items, stats}`

An item is `{x, y}` plus one of: `{thing, heading}`, `{tree: 'oak0', bend}`,
`{sprite, shadow}` (handles), or `{draw(context, sx, sy)}`. Optional: `z`
(height above ground), `sortY`, `layer: 'ground' | 'overlay'`, `noShadow`,
`alpha`. `view` is `{viewX, viewY, viewW, viewH}` (a camera). `draw` returns
`{items, drawn, shadows, culled}`.

---

## Camera (`camera.js`)

`createCamera({viewW, viewH, worldW, worldH, lookTime, lookRoom, ease, offsetY})` → camera

| Member | Does |
| --- | --- |
| `follow(target, dt)` | Ease towards `target` (`x, y`, optional `vx, vy` for look-ahead, `z`). |
| `snap(target)` | Jump there. |
| `place(x, y)` | Centre on a point. |
| `shake(pixels)` | A knock that dies away. |
| `toScreen(x, y, z)`, `toWorld(sx, sy)` | Convert points. |
| `near(x, y, margin)` | Is a point within `margin` of the view? (what to add to the scene) |
| `viewX`, `viewY`, `viewW`, `viewH` | The view, in world pixels. |

---

## Screen (`screen.js`)

`createScreen({width, height, parent, background, wholePixels, onRestore, onLost})` → screen

`screen.canvas`, `screen.context`, `screen.width`, `screen.height`, `screen.scale`
(device pixels per game pixel), `fit()`, `toGame(clientX, clientY)`, `clear(color)`.

`applyGrade(context, w, h, grade?)`: the time of day's tint over what is drawn.

---

## Loop and Clock (`loop.js`, `clock.js`)

`startLoop({update(dt), draw(info), tick = 1/120, maxElapsed = 0.25, autoStart = true})` → loop

`info`: `{fps, steps (this frame), time (game seconds), frame}`.
Loop: `start()`, `stop()`, `pause(on)`, `paused`, `running`, `step(seconds)`, `clock`.

`Clock.create(tick, maxElapsed)`, `Clock.advance(clock, nowMs, update)` → steps run,
`Clock.reset(clock)`.

---

## Input (`input.js`)

| Function | Does |
| --- | --- |
| `attach(target = window, {keys, onFirstInput})` | Listen to the keyboard. `keys`: `{action: [code, ...]}` replaces `DEFAULT_KEYS`. |
| `attachTouch(container)` | Buttons with `data-action="..."` inside it. Fingers can slide between buttons. |
| `update()` | Once per frame: polls gamepads, works out presses. |
| `held(action)`, `pressed(action)` | Down now; went down since the last `update()`. |
| `axis(negative, positive)` | -1..1 (`'left', 'right'` and `'up', 'down'` include the stick). |
| `stick()` | `{x, y}`, length at most 1. |
| `analog(action)` | 0..1 (gamepad triggers `'lt'`, `'rt'`). |
| `takeActions()` | Every press since last asked, in order (menus). `push(action)` adds one. |
| `setKeys(keys)`, `clear()`, `gamepadConnected()` | |

Gamepad (standard mapping): A = `a`/`confirm`, B = `b`/`back`, X = `x`, Y = `y`,
Start = `pause`, d-pad and left stick = directions, triggers = `lt`, `rt`.

---

## Sfx (`audio.js`)

| Function | Does |
| --- | --- |
| `unlock()` | Start audio. Call from a key or tap (`Input.attach`'s `onFirstInput`). |
| `play(name, strength = 1)` | An effect: `move select back beep go coin powerup win lose wrong jump land hit knock splash pop laser explosion`. |
| `define(name, effect)` | Add one: a list of `[Hz, startOffset, duration, wave, gain]`, or `(now, strength) => {...}` using `tone` and `noise`. |
| `tone(wave, hz, start, duration, gain, slideTo)` | One note at audio time `start` (use `audioContext().currentTime`). |
| `noise(start, duration, gain, filter, hz)` | Filtered noise burst. |
| `music(song)` / `music(null)` | Loop a song; `DEMO_SONG` is one. `playing()` is the current song. |
| `setVolumes(sfx, music)`, `getVolumes()`, `suspend(paused)`, `wake()`, `ready()` | |

A song: `{bpm, steps: 16, bars, root: 220, tracks: [{wave, gain, length, notes}], drums: {kick, snare, hat}}`.
`notes`: a semitone above `root` per step (or `null`), repeating; drums: strings
like `'x...x...'`.

---

## Particles (`particles.js`)

`emit(kind, x, y, count, vx, vy)`, `update(dt)`, `draw(context, viewX, viewY, w, h, glow = false)` → drawn,
`clear()`, `alive()`, `setWind(x, y)`, `setDensity(share)`,
`define(kind, {colors, life, size, grow, drag, lift, alpha, spread, windy, glow, pick})`.
Kinds: `smoke dust sand spark debris spray exhaust soot flame clipping bubble drip confetti`.
Glowing kinds (`flame`) draw only with `glow = true`: draw them after `applyGrade`.

---

## Gfx (`gfx.js`)

`text(context, value, x, y, {font: 'small' | 'large', scale, align, color, shadow})` → width,
`measure(text, options)`, `panel(context, x, y, w, h, fill, edge, alpha)`,
`rect(context, x, y, w, h, color)`, `formatTime(seconds)` → `'1:02.345'`,
`addGlyph(font, char, rows)`, `integerScale`, `present`, `fonts`.

---

## Ground (`ground.js`)

`Ground.create(width, height)` → ground (512 px tiles): `draw(context, viewX, viewY, w, h)`,
`copy(...)`, `getImageData`, `putImageData`, `createImageData`, `tiles`.
`Ground.paint(ground, (x, y) => [r, g, b])`, `Ground.drawOn(ground, context => {...})`
(draw with world coordinates across tiles).

---

## Trees (`trees.js`)

Kinds: `<species><size>`, species `oak pine cherry orange maple birch willow spruce`,
size `0` (largest) to `2`, e.g. `'birch1'`. `KINDS`, `info(kind)` →
`{height, crown, halfWidth, halfHeight, ...}` (half sizes: the trunk, for collisions).
`sprite(kind, bend)`, `shadow(kind)`, `prepare(kind)` (bake while loading),
`frame()` (once per step: a few new bends per frame), `setSeason('spring' | 'summer' | 'autumn' | 'winter')`,
`getSeason()`, `clear()`.

---

## Collide (`collide.js`)

Circles `{x, y, r}`, boxes `{x, y, hw, hh}`. Tests return `{nx, ny, depth}` (push
the first out of the second) or `null`: `circleCircle`, `circleBox`, `boxBox`,
`pointInBox(x, y, box)`. `separate(a, b, hit, bounce)` moves them apart (by
`mass`; `b.fixed` for walls) and takes away speed into each other; returns the
closing speed. `createGrid(cell)` → `{insert(item, reach), query(x, y, r, out), clear()}`.

---

## Storage (`storage.js`)

`createStore(namespace, {version, defaults, keep, migrate, perFolder})` → store:
`data`, `write()`, `set(fields)`, `read()`, `reset()`, `available()`.

---

## Menu (`menu.js`)

`createMenu({title, items, onBack, width, rowHeight, sounds})` → menu:
`handle(action)` → used?, `draw(context, {x, y, panel})`, `hit(x, y)` → row,
`index`, `selected()`, `move(step)`. Items: `{label, action, value, change(direction), disabled}`.
