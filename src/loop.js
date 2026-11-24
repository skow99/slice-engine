/* The game loop: fixed simulation steps (clock.js) and one draw per frame.
 *
 *   const loop = startLoop({
 *     update(dt) { ... },   // move the game by dt seconds (always the same dt)
 *     draw(info) { ... },   // draw what the last step left; info: {fps, steps, time}
 *   });
 *   loop.pause(true); loop.stop();
 *
 * update() never draws and draw() never moves anything: keep them apart and
 * the game plays the same at any frame rate and can be stepped in tests
 * (loop.step(seconds) runs steps without a browser frame). The loop pauses
 * itself while the page is hidden and starts again cleanly when it is back.
 */
import * as Clock from './clock.js';

export function startLoop({update, draw, tick = 1 / 120, maxElapsed = 0.25, autoStart = true} = {}) {
  const clock = Clock.create(tick, maxElapsed);
  const info = {fps: 0, steps: 0, time: 0, frame: 0};
  let running = false, paused = false, frames = 0, since = 0, handle = null;
  function frame(now) {
    if (!running) return;
    handle = requestAnimationFrame(frame);
    info.steps = paused ? 0 : Clock.advance(clock, now, dt => { info.time += dt; update(dt); });
    if (paused) clock.previous = now;
    frames++;
    if (now - since >= 1000) { info.fps = Math.round(frames * 1000 / (now - since)); frames = 0; since = now; }
    info.frame++;
    if (draw) draw(info);
  }
  const loop = {
    clock, info,
    get paused() { return paused; },
    get running() { return running; },
    start() { if (running) return; running = true; Clock.reset(clock); since = performance.now(); handle = requestAnimationFrame(frame); },
    stop() { running = false; if (handle !== null) cancelAnimationFrame(handle); handle = null; },
    pause(on = true) { paused = !!on; Clock.reset(clock); },
    /* Run `seconds` worth of steps now (tests, fast-forward). */
    step(seconds = tick) { const n = Math.round(seconds / tick); for (let i = 0; i < n; i++) { info.time += tick; update(tick); } return n; },
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) Clock.reset(clock); });
  }
  if (autoStart) loop.start();
  return loop;
}
