/* Pooled square particles (from Slice Drive): smoke, dust, sparks, flames,
 * spray, confetti and any kind you define(). A fixed pool of MAX particles is
 * reused round-robin, so emitting never allocates; the oldest go first.
 * Coordinates are world pixels; draw() takes the view's top left. */
const MAX = 700;
const pool = Array.from({length: MAX}, () => ({life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, size: 1, grow: 0, drag: 0, lift: 0, colors: null, alpha: 1, windy: 0, glow: false}));
// Smoke and dust drift with the wind (setWind).
const wind = {x: 0, y: 0};
function setWind(x, y) { wind.x = x; wind.y = y; }
let cursor = 0;
const kinds = {
  smoke: {colors: ['#d8dcd6', '#b9c0be', '#98a2a4'], life: 0.55, size: 2, grow: 5, drag: 3, lift: -14, alpha: 0.5, spread: 14, windy: 1},
  dust: {colors: ['#a9b07a', '#8f9a68', '#76865c'], life: 0.5, size: 2, grow: 4, drag: 3, lift: -10, alpha: 0.55, spread: 26, windy: 1},
  sand: {colors: ['#e2d2a2', '#cdb98a', '#b7a274'], life: 0.5, size: 2, grow: 4, drag: 3, lift: -10, alpha: 0.6, spread: 30, windy: 1},
  spark: {colors: ['#fff6c8', '#ffd66e', '#f08a4a'], life: 0.3, size: 1, grow: 0, drag: 2, lift: 0, alpha: 1, spread: 190},
  debris: {colors: ['#e8e6da', '#b4b8b4', '#6e767c'], life: 0.5, size: 2, grow: -2, drag: 3, lift: 60, alpha: 1, spread: 120},
  spray: {colors: ['#f6fbfd', '#dcecf4', '#bcd6e4'], life: 0.7, size: 3, grow: 9, drag: 4, lift: -22, alpha: 0.75, spread: 46, windy: 1},
  // Tailpipe wisps: a pixel that swells a little, rises and is gone. Diesel
  // trucks puff a darker, heavier soot.
  exhaust: {colors: ['#eef1f4', '#d2d8de', '#b4bcc6'], life: 1.0, size: 1, grow: 3, drag: 2.2, lift: -16, alpha: 0.4, spread: 6, windy: 1},
  soot: {colors: ['#8e949a', '#6e757c', '#5a6066'], life: 1.1, size: 2, grow: 3, drag: 2, lift: -18, alpha: 0.42, spread: 7, windy: 1},
  // Backfire: a hot spit of flame from the tailpipe, gone in a blink. Glows
  // (drawn over the time-of-day tint).
  flame: {colors: ['#fff6c8', '#ffd25a', '#f6862e', '#b8402a'], life: 0.16, size: 2, grow: 1, drag: 7, lift: -12, alpha: 1, spread: 26, glow: true},
  // Grass clippings thrown off the tyres: arc up, fall back.
  clipping: {colors: ['#9ccc74', '#78b05c', '#5a9450', '#c4cc7a'], life: 0.5, size: 1, grow: 0, drag: 1.2, lift: 150, alpha: 1, spread: 26, pick: true},
  // Water dripping off something that went through a puddle.
  bubble: {colors: ['#f2fafc', '#cfe6f0', '#a6cce0'], life: 0.6, size: 1, grow: 1, drag: 3, lift: -26, alpha: 0.85, spread: 16},
  drip: {colors: ['#e2f2fa', '#b4d8ea', '#8ebcd6'], life: 0.2, size: 1, grow: 0, drag: 0, lift: 170, alpha: 0.85, spread: 3},
  confetti: {colors: ['#f6c95e', '#ee7c7c', '#8fd4f2', '#9be0a8', '#d0b0f0'], life: 1.6, size: 2, grow: 0, drag: 1.5, lift: 46, alpha: 1, spread: 150, pick: true},
};
/* Add or replace a kind. spec: {colors (one per stage of its life, or picked
 * at random with pick: true), life (s), size, grow (px over its life), drag,
 * lift (px/s² downwards; negative rises), alpha, spread (px/s), windy (0-1),
 * glow (drawn with draw(..., true) instead)}. */
function define(kind, spec) { kinds[kind] = {size: 1, grow: 0, drag: 0, lift: 0, alpha: 1, spread: 20, life: 0.5, ...spec}; return kinds[kind]; }
function alive() { let n = 0; for (const p of pool) if (p.life > 0) n++; return n; }
function emit(kind, x, y, count = 1, vx = 0, vy = 0) {
  const spec = kinds[kind];
  if (!spec) throw new Error('Particles: unknown kind ' + kind);
  if (density < 1) {
    const kept = count * density;
    count = Math.floor(kept) + (Math.random() < kept % 1 ? 1 : 0);
  }
  for (let i = 0; i < count; i++) {
    const p = pool[cursor]; cursor = (cursor + 1) % MAX;
    const angle = Math.random() * Math.PI * 2, speed = Math.random() * spec.spread;
    p.x = x + (Math.random() - 0.5) * 4; p.y = y + (Math.random() - 0.5) * 4;
    p.vx = vx + Math.cos(angle) * speed; p.vy = vy + Math.sin(angle) * speed * 0.75;
    p.max = p.life = spec.life * (0.7 + Math.random() * 0.6);
    p.size = spec.size; p.grow = spec.grow; p.drag = spec.drag; p.lift = spec.lift; p.alpha = spec.alpha; p.windy = spec.windy || 0; p.glow = !!spec.glow;
    p.colors = spec.pick ? [spec.colors[Math.floor(Math.random() * spec.colors.length)]] : spec.colors;
  }
}
function update(dt) {
  for (const p of pool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    const drag = Math.exp(-p.drag * dt);
    p.vx *= drag; p.vy = p.vy * drag + p.lift * dt;
    p.x += (p.vx + wind.x * p.windy) * dt; p.y += (p.vy + wind.y * p.windy) * dt;
  }
}
/* glow: false draws the ordinary particles, true only the glowing ones
 * (drawn last, over the time-of-day tint, so flames stay bright at dusk). */
/* Returns how many were drawn. */
function draw(context, viewX, viewY, width, height, glow = false) {
  let drawn = 0, alpha = -1, fill = null;
  for (const p of pool) {
    if (p.life <= 0 || p.glow !== glow) continue;
    const age = 1 - p.life / p.max, size = Math.max(1, Math.round(p.size + p.grow * age));
    const x = Math.round(p.x - viewX - size / 2), y = Math.round(p.y - viewY - size / 2);
    if (x < -size || y < -size || x > width || y > height) continue;
    // Fade in three hard steps rather than a smooth ramp. Canvas state is
    // only set when it changes: most neighbours in the pool share it.
    const a = p.alpha * (age < 0.4 ? 1 : age < 0.75 ? 0.66 : 0.33);
    if (a !== alpha) { context.globalAlpha = alpha = a; }
    const color = p.colors[Math.min(p.colors.length - 1, Math.floor(age * p.colors.length))];
    if (color !== fill) { context.fillStyle = fill = color; }
    context.fillRect(x, y, size, size);
    drawn++;
  }
  context.globalAlpha = 1;
  return drawn;
}
/* Fewer particles on slower machines: emit() keeps this share of each burst
 * (single ones by chance), so the look is the same, only sparser. */
let density = 1;
function setDensity(share) { density = Math.max(0.1, Math.min(1, share)); }
function clear() { for (const p of pool) p.life = 0; }

export {MAX, kinds, define, emit, update, draw, clear, alive, setWind, setDensity};
