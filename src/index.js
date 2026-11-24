/* Slice Engine: everything in one import.
 *
 *   import {Voxel, Model, Scene, Camera, Screen, Loop, Input, Sfx, Particles,
 *           Gfx, Ground, Trees, Collide, Storage, Menu, Clock} from './slice-engine/src/index.js';
 *
 * Each name is the module's namespace (Voxel.sprite, Model.builder, ...). The
 * factories are also exported directly: createScreen, createScene,
 * createCamera, startLoop, createStore, createMenu, createGrid.
 */
export * as Voxel from './voxel.js';
export * as Model from './model.js';
export * as Scene from './scene.js';
export * as Camera from './camera.js';
export * as Screen from './screen.js';
export * as Loop from './loop.js';
export * as Clock from './clock.js';
export * as Input from './input.js';
export * as Sfx from './audio.js';
export * as Particles from './particles.js';
export * as Gfx from './gfx.js';
export * as Ground from './ground.js';
export * as Trees from './trees.js';
export * as Collide from './collide.js';
export * as Storage from './storage.js';
export * as Menu from './menu.js';

export {createScene} from './scene.js';
export {createCamera} from './camera.js';
export {createScreen, applyGrade} from './screen.js';
export {startLoop} from './loop.js';
export {createStore} from './storage.js';
export {createMenu} from './menu.js';
export {createGrid} from './collide.js';
export {builder, fromLayers, fromSliceImage, fromSlicePixels, loadImage, thing} from './model.js';

export const VERSION = '1.0.0';
