/* Fixed simulation steps: the game moves in equal steps (1/120 s by default)
 * however fast the screen draws, so it plays the same at 30, 60 or 144 Hz and
 * can be replayed exactly. advance() runs update(tick) as many times as the
 * time since the last call covers, carrying the remainder to the next call.
 * A long stall (a background tab) counts as at most maxElapsed. */
export function create(tick = 1 / 120, maxElapsed = 0.25) {
  if (!Number.isFinite(tick) || tick <= 0) throw new RangeError('tick must be positive and finite');
  return {tick, maxElapsed, previous: null, accumulator: 0};
}
export function reset(clock) { clock.previous = null; clock.accumulator = 0; }
/* now: milliseconds (performance.now() or the rAF timestamp). Returns the steps run. */
export function advance(clock, now, update) {
  if (clock.previous === null) { clock.previous = now; return 0; }
  const elapsed = Math.max(0, Math.min(clock.maxElapsed, (now - clock.previous) / 1000)); clock.previous = now;
  return advanceBy(clock, elapsed, update);
}
/* Feed simulation seconds directly when a host loop owns wall-clock time. */
export function advanceBy(clock, elapsed, update) {
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('elapsed must be finite and nonnegative');
  clock.accumulator += elapsed;
  let steps = 0;
  const tolerance = clock.tick * 1e-8;
  while (clock.accumulator + tolerance >= clock.tick) {
    clock.accumulator = Math.max(0, clock.accumulator - clock.tick);
    update(clock.tick);
    steps++;
  }
  return steps;
}

export function alpha(clock) { return clock.accumulator / clock.tick; }
