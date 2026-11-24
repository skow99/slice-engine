# Slice Engine: rules for working here

A reusable engine for sprite-stacked pixel-art browser games, taken out of Slice
Drive. [README.md](README.md) is the overview, [docs/](docs/) the guides.

## Code
- **No build step, no dependencies, no bundler, no framework.** `src/` is native
  ES modules that run as-is in browsers and under Node. Imports are relative
  and end in `.js`.
- **Nothing game-specific in `src/`.** No racing, cars, circuits or any one
  game's rules. If a feature is only useful to one game, it belongs in that game
  or in an example.
- **No work at import time** beyond constants and small tables. No DOM access at
  the top level of a module (tests import every module under Node).
- **No globals.** Modules export; `index.js` re-exports. Examples may set one
  `window.<name>` debug handle.
- **Deterministic where it matters.** Model building and placement use
  `Model.random(seed)` / `Model.hash`, never `Math.random`.
- **Memory.** Every picture is a canvas made with `Voxel.canvas()` so it is
  counted. Caches of pictures register `Voxel.onRastersLost` and stay bounded.
- **Headings.** World headings are radians, 0 = east, PI/2 = south. Only
  `voxel.js` deals in turns; keep `Model.thing` the bridge.
- **No audio or font files.** Sound is synthesised, the font is in code.
- **IP safety.** No real brands, track names or recognisable real designs in
  models, examples or names.

## Checking work
- `npm test` before every commit. New features get a test in `tests/*.test.js`
  (use `tests/fake-canvas.js`).
- `tests/docs.test.js` checks that `docs/tutorial.md` quotes
  `examples/04-tutorial/main.js`. Change both together.
- Try examples in a browser: `node tools/serve.js <free port>`, open
  `/examples/`, check the console for errors. Say what was checked in the
  browser and what was not (hand play, phones, Safari).

## Docs
- Keep [docs/api.md](docs/api.md) in step with every exported function.
- Keep the README's module table and examples table current.

## Git
- Commit messages are short plain-English summaries of what changed for someone
  using the engine.
