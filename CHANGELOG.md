# Slice Engine 1.1.0

Prepared on 25 November 2026. The engine uses native ES modules and has no runtime dependencies.

## Engine and tools

- **Rendering and lighting.** Bake pitch and roll around a configurable pivot, mirror the part above that plane, and use the same rotation for attachments. Materials can soften baked contrast. Voxel and procedural tree shadows extend in either direction and refresh when an active lighting preset changes.
- **Camera and timing.** Interpolated camera views support fractional positions, zoom, depth sorting, and world-to-screen conversion. The fixed-step clock exposes render interpolation and accepts elapsed simulation time for slow motion and fast-forward.
- **Display.** Opt into a range of backing densities for high-DPI displays and responsive layouts. Drawing and pointer input use logical pixels at every density.
- **Environments.** Height-map relief, celestial position, masked reflections, and a shared wave field are available to other games. Moving crests and model motion can use the same wave sample.
- **Art pipeline.** Export padded multi-row slice sheets, fit painted luminance to the geometry, and import material settings by colour. PNG tools support Node 18 and later.
- **Development server.** MP3 requests support byte ranges for the Mazury soundtrack.

The existing `createCamera()` and `createScreen()` defaults retain the 1.0 pixel workflow. Use the [API reference](docs/api.md) for the new options and modules.
