# How Slice Engine works

## Sprite stacking in one paragraph

A model is a stack of slices: a voxel grid `w × h × count`, each voxel a
material id (0 = empty). For a heading, the renderer casts a ray through every
screen pixel into the stack, finds the voxel it meets and how brightly the sun
lights it (with self-shadowing and a soft occlusion), and keeps that as a
*surface*. A surface is colourless: baking it with a *palette* gives a *sprite*,
a small canvas with a one-pixel tinted outline. The ground shadow is every slice
dropped along the light. Drawing is then one `drawImage` per sprite, so a screen
full of objects costs almost nothing; the work is in baking, which happens once
per heading and colour.

## Coordinates

```
        north (-y), heading -PI/2
               ^
 west (-x) <---+---> east (+x), heading 0
               v
        south (+y), heading PI/2      z: up, out of the ground
```

- **World**: `x` to the east, `y` to the south (down the screen), `z` up.
  One unit is one screen pixel on the ground. The view is a top-down
  three-quarter view: the slices are squashed to 0.75 (`Voxel.SQUASH`) along
  the ground and stacked one pixel up per slice.
- A thing at `(x, y, z)` is drawn at screen `(x - viewX, y - viewY - z)`.
  Its shadow stays on the ground at `y`, pushed along the light by its height.
- **Headings** are world angles in radians: `0` east, `PI/2` south, `-PI/2` north,
  the same as `Math.atan2(vy, vx)`. So `heading = Math.atan2(vy, vx)` points a
  thing where it is going.
- **Model space**: `x` across, `y` along (the **front is +y**), `z` up. One voxel is
  one pixel. `Model.thing()` turns world headings into the renderer's turns; you
  only need `Voxel.directionOf` and turns if you call `Voxel.sprite` yourself.
- **Drawn sources** (ASCII layers, PNG slice sheets) are top views with the **front
  pointing up**, bottom slice first. A model facing north looks exactly as drawn.

## Depth

Things standing on the ground are drawn from the back of the screen to the front,
by `y` (or `sortY` if you set it). `Scene.draw` does this, after drawing every
flat thing (layer `'ground'`) and every shadow, so shadows never fall on top of
the thing in front. For a bridge or a tall thing you walk behind, set `sortY` by
hand.

## Materials and palettes

`materials[id] = {rgb: [r, g, b], kind}` with kinds:

| kind | Looks |
| --- | --- |
| `matte` | Six steps of light, shadows drifting cool, highlights warm. The default. |
| `gloss` | Like matte, plus a bright glint where the sun reflects to the camera. |
| `glass` | Never lit brighter than the base colour. |
| `glow` | Ignores light: lamps, crystals, screens. |
| `ink` | Dark trim that keeps its darkness. |

The *palette* is just `rgb` by material id. Recolouring keeps the model and its
surfaces and only bakes new sprites: `thing.recolored({1: [96, 140, 186]}, 'blue')`.
Give every palette of one model its own variant name (the second argument),
because sprites are cached by model, variant and heading.

## Lighting

`Voxel.PRESETS` has `day`, `golden`, `overcast` and `dusk`. Each says where the
sun is (`light`), how long shadows are (`shadow`, per voxel of height), how dark
they are, the colours shadows and highlights drift to, the contrast, and a
`grade`: a tint for everything else, applied with `applyGrade()` after the world
is drawn (sprites already carry the light in their colours; the grade brings the
painted ground and particles along). `Voxel.setLighting(id)` drops every baked
picture; they bake again as they are next drawn. `Voxel.addPreset(id, {...})`
adds your own (missing fields come from `day`).

## Memory: why things are baked, and when

Every picture is a canvas. Browsers limit canvases per page (Chrome gives up at
around 17,000 and drops them all) and memory per tab, more tightly on phones.
So:

- Surfaces and sprites are kept under a byte budget (`Voxel.setBudget`, default
  32 MB of surfaces and 160 MB of sprites), least recently used out first.
  `Voxel.stats()` shows counts, bytes and evictions. Evictions every frame mean
  the budget is too small for what is on screen, or there are too many poses.
- A Thing with 64 headings is up to 64 sprites per palette. Things that only sit
  square should use `frames: 4` (or 8, 16, 32).
- Baking takes time (the 20 × 28 × 15 rover: about 0.75 ms per heading on a
  laptop, sprite and shadow; bigger models and phones cost more). Call
  `thing.warm()` and `Trees.prepare(kind)` while the level loads.
- When the browser takes the canvases away (out of memory, a GPU reset, a phone
  sleeping the tab), `createScreen` hears it and calls `Voxel.rastersLost()`:
  every baked picture is dropped and bakes again. Anything else you painted
  (a `Ground`, cached canvases of your own) must be repainted in `onRestore`.
  Register your own caches with `Voxel.onRastersLost(() => myCache.clear())`.

## The loop: steps and frames

`startLoop({update, draw})` calls `update(dt)` with a fixed `dt` (1/120 s by
default) as many times as real time needs, and `draw()` once per screen frame.

- **update** is the game: movement, rules, collisions, scores, timers. It must
  not draw or read anything `draw` sets. Because `dt` never varies, the game
  plays the same at 30, 60 or 144 Hz, and a run can be replayed exactly from its
  inputs.
- **draw** shows the state as the last step left it: scene, particles, interface.
  Read menu actions here (`Input.update()` then `Input.takeActions()`), because
  menus react once per press, not once per step.
- `loop.step(seconds)` runs steps without a browser frame: tests and console
  experiments drive the game deterministically with it (the examples expose
  `window.crystalRover` and `window.gardenCart` for this).
- The loop pauses while the page is hidden. `loop.pause(true)` freezes `update`
  but keeps drawing (for pause menus).

## Input: actions, not keys

`Input.attach()` maps keys to actions (`up`, `down`, `left`, `right`, `a`, `b`,
`x`, `y`, `confirm`, `back`, `pause`, `mute`, `fullscreen`; see
`Input.DEFAULT_KEYS`). Touch buttons are any element with `data-action`
(several actions: `data-action="up confirm"`), and gamepads use the standard
mapping. The game asks `Input.held('left')`, `Input.pressed('a')`,
`Input.axis('left', 'right')` or `Input.stick()`, and never knows which device
it was.

Browsers only start sound after a key or tap: pass
`onFirstInput: () => Sfx.unlock()` to `Input.attach`.

## The screen

`createScreen({width, height})` makes one canvas at the game's resolution (pick
something like 320 × 180, 400 × 225 or 640 × 360) and shows it as big as fits,
in whole device pixels where that wastes little room, so pixels stay square and
sharp. Draw everything into `screen.context` at 1:1. `screen.toGame(clientX,
clientY)` converts pointer positions.
