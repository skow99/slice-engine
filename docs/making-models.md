# Making models

Three ways in, all ending as a builder (`{model, palette, ...}`) you pass to
`Model.thing()`. Pick by who makes the model and how detailed it is.

| Way | Best for | Example |
| --- | --- | --- |
| Code (`Model.builder`) | Simple solid shapes, things with many variants, procedural scenery | `examples/03-crystal-rover/models.js` |
| ASCII (`Model.fromLayers`) | Small hand-placed models, prototypes, models in a text diff | `rocket()` in `examples/02-model-viewer/models.js` |
| PNG slice sheet (`Model.fromSliceImage`) | Art drawn by an artist in any pixel editor | `examples/02-model-viewer/barrel-slices.png` |

## Size and scale

One voxel is one screen pixel. At a 320 × 180 screen, the rover (20 × 28 × 15)
is a comfortable player size; a crate is 12 to 14; a building 40 or more. Big
models cost memory: a sprite is about `(√(w² + h²) + count)²` pixels, times 64
headings, times the palettes you use. Keep heroes under about 64 × 64 × 48 and
use `frames: 4` for buildings and props that never turn.

Pick a scale and keep to it. Slice Drive uses about 15 voxels to the metre for
trees, which makes a car about 30 voxels long.

## In code

```js
const b = Model.builder(20, 28, 15, [
  [236, 196, 72],                       // 1 body
  [40, 42, 50],                         // 2 tyres
  {rgb: [255, 246, 200], kind: 'glow'}, // 3 headlamps
]);
b.box(3, 2, 5, 16, 25, 7, 1);                      // body
for (const y of [5, 21]) { b.wheel(0, y, 3, 3, 3, 2); b.wheel(17, y, 3, 3, 3, 2); }
b.box(5, 27, 5, 7, 27, 6, 3); b.box(12, 27, 5, 14, 27, 6, 3);   // lamps on the front (+y)
```

- The front is `+y` (the highest `y` row). `z = 0` is the ground.
- Pattern functions give texture for free: `b.box(..., (x, y, z) => Model.hash(x, y, z) < 0.2 ? 2 : 1)`.
- Use `Model.random(seed)` (never `Math.random`) so a model is the same each run.
- Build one side and `mirrorX()` for symmetric things.

## ASCII layers

```js
Model.fromLayers([
  `.rr.
   rwwr
   rwwr
   .rr.`,        // slice 0 (the ground), a top view, front pointing up
  2,             // repeat it twice more
  `....
   .ww.
   .ww.
   ....`,        // slice 3
], {r: [214, 64, 56], w: '#e8eae4'});
```

Each character is a voxel; `.` is empty; the key maps characters to colours
(`[r, g, b]`, `'#rrggbb'` or `{rgb, kind}`).

## PNG slice sheets

The format: one image, slices of equal size side by side, **bottom slice on the
left**, each a top view with the **front of the object pointing up**. Every
opaque colour becomes a material; transparent is empty.

```
+--------+--------+--------+--------+
| slice 0| slice 1| slice 2|  ...   |   sliceWidth × sliceHeight each,
| ground |        |        |   top  |   no gaps
+--------+--------+--------+--------+
```

```js
const image = await Model.loadImage('barrel-slices.png');
const barrel = Model.thing(Model.fromSliceImage(image, {sliceWidth: 16, kinds: {'#ffcc00': 'glow'}}));
```

For long stacks, wrap into rows and pass `columns`. Up to 255 colours: keep a
small palette (8 to 24 colours) so lighting, not dithering, does the shading.

### Going from code to a sheet and back

Rough out the shape in code, export it, and have it painted. If the paint has drifted beyond the voxel edges, fit its shading back to the original geometry:

```bash
node tools/model-to-sheet.js examples/02-model-viewer/models.js barrel barrel-template.png
node tools/fit-sheet.js barrel-template.png barrel-painted.png barrel-slices.png
```

The fitter keeps the template’s occupied pixels and palette families, sampling
luminance from the painted image and applying a bounded shade change.
Use the same atlas layout in both inputs. Load the resulting sheet with the
options printed by the exporter. Review the assembled model over a full turn
in the [model viewer](../examples/02-model-viewer/).

### A brief for an artist

> Draw a sprite-stack slice sheet for a **[object]**, about **W × L** pixels on
> the ground and **N** slices tall (one slice per pixel of height).
> One PNG, transparent background, slices of W × L side by side with no gaps,
> the bottom slice on the left and the top slice on the right.
> Each slice is the object cut horizontally at that height, seen from above, with
> its **front pointing up**.
> Flat colours only: no shading, no gradients, no anti-aliasing. 8 to 24 colours
> in total; the engine lights and outlines it. Use one exact colour for parts that
> should glow (lamps, screens) and say which.
> Hollow insides can stay empty; only what can be seen from outside matters.

Give the artist the exported sheet of a rough code model as a template: the
right size, the right number of slices, the shape blocked in.

## Checking a model

- Look at it at every heading in the viewer, and at `dusk` (long shadows show
  gaps in the stack).
- One stray voxel shows as a pixel with an outline: look for specks.
- Thin parts one voxel wide flicker as the model turns; make them two wide or
  accept it for antennas and the like.
