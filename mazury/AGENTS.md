# Mazury

Mazury is a relaxed, browser-based sailing game set on the real Lake Niegocin. Keep sailing rules and art in this project. Read [the Slice Engine rules](../CLAUDE.md) before changing the shared engine under `../src/`.

## Resume a session

1. Read [the handoff](docs/mazury-handoff.md) and check `git status --short` for local work.
2. Read [the approved scope](docs/mazury-plan.md) before changing the route, controls, or milestone.
3. After a gameplay or art change, update the handoff with the current state, checks run and their results, and any work still open.

## Run and verify

- Run `npm run serve` from this project directory and open `http://localhost:8090/mazury/`.
- Run `npm test`. For gameplay changes, check the affected milestone in the browser. For the harbour, exercise approach, neutral coasting, mooring, and departure.
- Keep the native ES module setup and fixed-step simulation. The lake renderer and shoreline collision share `map/terrain.png`. Ekomarina uses a finer shared vector trace in `harbor.js`. The simulation works in metres. Read [the Niegocin map workflow](map/README.md) when editing geography, land cover, or heights.

## Change an asset

Read [the Mazury art workflow](art/README.md) before adding or modifying a modeled object. Export a geometry template, repaint it with ImageGen, fit the result to the engine slice grid, and review the assembled model in the model viewer.
