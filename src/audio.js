/* Sound, all synthesised with Web Audio (after Slice Drive's audio.js): no
 * sound files. Short effects are a few notes or a burst of filtered noise;
 * music is a small step sequencer.
 *
 *   Sfx.unlock()             from the first key or tap (browsers need a gesture)
 *   Sfx.play('coin')         a named effect (see EFFECTS; define() adds yours)
 *   Sfx.play('hit', 0.5)     strength 0..1 for effects that take it
 *   Sfx.music(DEMO_SONG)     loop a song; Sfx.music(null) stops it
 *   Sfx.setVolumes(0.7, 0.5) effects, music
 *   Sfx.suspend(true)        pause all sound (the game's pause menu)
 *
 * Every effect goes through one limiter, so many at once get loud, not harsh.
 */
let context = null, master = null, sfxBus = null, musicBus = null, noiseBuffer = null;
const volume = {sfx: 0.7, music: 0.5};
let held = false;

function limiter(ctx) {
  const node = ctx.createDynamicsCompressor();
  node.threshold.value = -8; node.knee.value = 3; node.ratio.value = 20; node.attack.value = 0.001; node.release.value = 0.15;
  return node;
}
const settle = result => { if (result && typeof result.catch === 'function') result.catch(() => {}); };
/* Make (or wake) the audio context. Call it from an input event. */
export function unlock() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) return false;
  if (!context) {
    context = new Ctor();
    context.onstatechange = () => { if (!held && context.state !== 'running' && context.state !== 'closed') setTimeout(wake, 300); };
    master = context.createGain(); master.gain.value = 0.9; master.connect(context.destination);
    sfxBus = context.createGain(); sfxBus.connect(limiter(context)).connect(master);
    musicBus = context.createGain(); musicBus.connect(master);
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    setVolumes(volume.sfx, volume.music);
    if (song) startMusic();
  }
  held = false;
  // Safari only truly unlocks when a sound starts inside the gesture itself.
  if (context.state !== 'running') {
    try { const blip = context.createBufferSource(); blip.buffer = context.createBuffer(1, 1, context.sampleRate); blip.connect(context.destination); blip.start(0); } catch { /* next input tries again */ }
  }
  wake();
  return true;
}
/* Bring sound back if the browser stopped it (iOS: a call, another app). */
export function wake() {
  if (!context || held) return;
  try { if (context.state !== 'running' && context.state !== 'closed') settle(context.resume()); } catch { /* next input */ }
}
export function setVolumes(sfx = volume.sfx, music = volume.music) {
  volume.sfx = sfx; volume.music = music;
  if (sfxBus) { sfxBus.gain.value = sfx; musicBus.gain.value = music; }
}
export function getVolumes() { return {...volume}; }
export function suspend(paused) {
  held = !!paused;
  if (!context) return;
  try { settle(paused ? context.suspend() : context.resume()); } catch { /* the next input wakes it */ }
}
export function ready() { return !!context && context.state === 'running'; }
export function audioContext() { return context; }

/* ---------- Building blocks (use them in your own effects) ---------- */
/* A note: oscillator type ('square', 'triangle', 'sine', 'sawtooth'), Hz,
 * start (s, audio time), duration (s), peak gain, optional slide to Hz. */
export function tone(type, frequency, start, duration, gain, slideTo = 0, bus = sfxBus) {
  if (!context) return;
  const oscillator = context.createOscillator(), envelope = context.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(gain, start + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope).connect(bus);
  oscillator.start(start); oscillator.stop(start + duration + 0.02);
}
/* Filtered noise: filter 'lowpass' (thuds), 'bandpass' (knocks, splashes), 'highpass' (hiss, hats). */
export function noise(start, duration, gain, filter = 'lowpass', frequency = 1000, bus = sfxBus) {
  if (!context) return;
  const source = context.createBufferSource(), shape = context.createBiquadFilter(), envelope = context.createGain();
  source.buffer = noiseBuffer; source.loop = true;
  shape.type = filter; shape.frequency.value = frequency;
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(shape).connect(envelope).connect(bus);
  source.start(start, Math.random() * 0.5); source.stop(start + duration + 0.02);
}

/* ---------- Effects ---------- */
/* A list of notes [Hz, start offset s, duration s, wave, gain], or a function
 * (now, strength) that calls tone() and noise(). */
export const EFFECTS = {
  move: [[660, 0, 0.05, 'square', 0.05]],
  select: [[660, 0, 0.06, 'square', 0.06], [990, 0.06, 0.1, 'square', 0.06]],
  back: [[520, 0, 0.06, 'square', 0.05], [390, 0.06, 0.1, 'square', 0.05]],
  beep: [[440, 0, 0.16, 'square', 0.1]],
  go: [[880, 0, 0.5, 'square', 0.12], [1320, 0, 0.5, 'triangle', 0.08]],
  coin: [[1568, 0, 0.04, 'square', 0.035], [2093, 0.04, 0.08, 'square', 0.035]],
  powerup: [[523, 0, 0.07, 'square', 0.07], [784, 0.07, 0.07, 'square', 0.07], [1047, 0.14, 0.18, 'square', 0.07]],
  win: [[523, 0, 0.14, 'square', 0.09], [659, 0.14, 0.14, 'square', 0.09], [784, 0.28, 0.14, 'square', 0.09], [1047, 0.42, 0.5, 'square', 0.1], [523, 0.42, 0.5, 'triangle', 0.1]],
  lose: [[330, 0, 0.1, 'square', 0.05], [247, 0.1, 0.16, 'square', 0.05]],
  wrong: [[220, 0, 0.18, 'sawtooth', 0.07], [196, 0.2, 0.22, 'sawtooth', 0.07]],
  jump: (now) => tone('triangle', 220, now, 0.28, 0.1, 660),
  land: (now) => { tone('sine', 110, now, 0.2, 0.3, 40); noise(now, 0.12, 0.14, 'lowpass', 700); },
  hit: (now, s) => { noise(now, 0.16 + s * 0.12, 0.25 * s + 0.08, 'lowpass', 900 + s * 1400); tone('sine', 120, now, 0.16, 0.25 * s + 0.05, 46); },
  knock: (now, s) => { noise(now, 0.07, 0.12 * s + 0.04, 'bandpass', 1900); tone('triangle', 300, now, 0.07, 0.08, 150); },
  splash: (now, s) => { noise(now, 0.22 + s * 0.25, 0.1 + s * 0.16, 'bandpass', 900 + s * 700); noise(now + 0.02, 0.18 + s * 0.2, 0.05 + s * 0.08, 'highpass', 3200); },
  pop: (now, s) => { noise(now, 0.06, 0.16 * s + 0.04, 'lowpass', 1300); tone('square', 85, now, 0.05, 0.07 * s + 0.02, 55); },
  laser: (now) => tone('square', 1400, now, 0.14, 0.05, 180),
  explosion: (now, s) => { noise(now, 0.6 + s * 0.4, 0.3 + s * 0.2, 'lowpass', 600 + s * 600); tone('sine', 90, now, 0.4, 0.3, 30); },
};
export function define(name, effect) { EFFECTS[name] = effect; }
export function play(name, strength = 1) {
  if (!context || volume.sfx <= 0) return;
  const effect = EFFECTS[name];
  if (!effect) throw new Error('Sfx: no effect named ' + name);
  const now = context.currentTime, s = Math.max(0, Math.min(1, strength));
  if (typeof effect === 'function') effect(now, s);
  else for (const [frequency, at, duration, type, gain] of effect) tone(type, frequency, now + at, duration, gain * (0.4 + 0.6 * s));
}

/* ---------- Music: a step sequencer ---------- */
/* A song: {bpm, steps (per bar, 16 = sixteenth notes), bars, root (Hz of
 * semitone 0), tracks: [{wave, gain, length (in steps), notes}], drums}
 * notes: one entry per step for the whole song (bars × steps), a semitone
 * number or null (rest); a shorter list repeats. drums: {kick, snare, hat}
 * as strings of 'x' (hit) and '.' (rest), repeated to fill each bar. */
let song = null, timer = null, stepAt = 0, stepTime = 0;
const note = (root, semitone) => root * Math.pow(2, semitone / 12);
function schedule(step, at) {
  const total = song.bars * song.steps, s = step % total, beat = s % song.steps, stepLength = 60 / song.bpm / 4;
  for (const track of song.tracks) {
    const value = track.notes[s % track.notes.length];
    if (value !== null && value !== undefined) tone(track.wave || 'square', note(song.root, value), at, stepLength * (track.length || 1), track.gain ?? 0.05, 0, musicBus);
  }
  const drums = song.drums || {}, hit = pattern => pattern && pattern[beat % pattern.length] === 'x';
  if (hit(drums.kick)) tone('sine', 150, at, 0.14, 0.4, 44, musicBus);
  if (hit(drums.snare)) noise(at, 0.1, 0.12, 'highpass', 1600, musicBus);
  if (hit(drums.hat)) noise(at, 0.03, 0.04, 'highpass', 7000, musicBus);
}
function startMusic() {
  if (!context || timer || !song) return;
  stepTime = context.currentTime + 0.08;
  timer = setInterval(() => {
    const stepLength = 60 / song.bpm / 4;
    if (volume.music <= 0) { stepTime = context.currentTime + 0.05; return; }
    while (stepTime < context.currentTime + 0.14) { schedule(stepAt++, stepTime); stepTime += stepLength; }
  }, 30);
}
export function music(next) {
  if (timer) { clearInterval(timer); timer = null; }
  song = next || null; stepAt = 0;
  if (song) startMusic();
}
export function playing() { return song; }

/* A demo tune (from Slice Drive's menu music): 8 bars in A minor at 128 bpm. */
const CHORDS = [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-4, 0, 3], [3, 7, 10], [3, 7, 10], [-2, 2, 5], [-5, -1, 2]];
const LEAD = [
  [12, null, null, 15, null, null, 19, null, 17, null, 15, null, 12, null, null, null],
  [null, null, 12, null, 15, null, 12, null, 10, null, null, null, 7, null, null, null],
  [8, null, null, 12, null, null, 15, null, 17, null, 15, null, 12, null, null, null],
  [null, null, 15, null, 12, null, 8, null, 10, null, 12, null, 15, null, null, null],
  [15, null, null, 19, null, null, 22, null, 19, null, 15, null, 19, null, null, null],
  [null, null, 22, null, 19, null, 15, null, 14, null, null, null, 10, null, 14, null],
  [14, null, null, 17, null, null, 14, null, 10, null, 14, null, 17, null, 19, null],
  [16, null, null, 14, null, null, 11, null, 14, null, 11, null, 7, null, null, null],
];
export const DEMO_SONG = {
  bpm: 128, steps: 16, bars: 8, root: 220,
  tracks: [
    {wave: 'triangle', gain: 0.22, length: 1.7, notes: CHORDS.flatMap(chord => Array.from({length: 16}, (_, beat) => beat % 2 ? null : chord[0] - 24 + (beat % 8 === 6 ? 12 : 0)))},
    {wave: 'square', gain: 0.028, length: 0.8, notes: CHORDS.flatMap(chord => Array.from({length: 16}, (_, beat) => chord[[0, 1, 2, 1][beat % 4]] + (beat % 8 >= 4 ? 12 : 0)))},
    {wave: 'square', gain: 0.06, length: 2.6, notes: LEAD.flat()},
  ],
  drums: {kick: 'x.......', snare: '....x...', hat: 'x.x.x.x.'},
};
