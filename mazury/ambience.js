import {Model} from '../src/index.js';
import {thunderDelay} from './weather.js';

function createThrusterSound(audio, noise, output) {
  const pulse = audio.createGain();
  pulse.gain.value = 0;
  const position = audio.createStereoPanner();
  pulse.connect(position).connect(output);

  const motor = audio.createOscillator();
  motor.type = 'triangle';
  motor.frequency.value = 96;
  const body = audio.createGain();
  body.gain.value = 0.34;
  motor.connect(body).connect(pulse);

  const whine = audio.createOscillator();
  whine.frequency.value = 650;
  const overtone = audio.createGain();
  overtone.gain.value = 0.19;
  whine.connect(overtone).connect(pulse);

  const spray = audio.createBiquadFilter();
  spray.type = 'bandpass';
  spray.frequency.value = 1280;
  spray.Q.value = 0.66;
  const wash = audio.createGain();
  wash.gain.value = 5;
  noise.connect(spray).connect(wash).connect(pulse);
  motor.start();
  whine.start();

  let active = 0;
  return function setPulse(jet) {
    if (jet === active) return;
    active = jet;
    const now = audio.currentTime;
    const strength = Math.min(1, Math.abs(jet));
    if (jet) position.pan.setTargetAtTime(Math.sign(jet) * 0.43, now, 0.012);
    pulse.gain.setTargetAtTime(jet ? 0.49 * Math.sqrt(strength) : 0, now, jet ? 0.012 : 0.024);
    motor.frequency.setTargetAtTime(96 + 57 * strength, now, 0.028);
    whine.frequency.setTargetAtTime(650 + 475 * strength, now, 0.031);
  };
}

function createEngineSound(audio, output) {
  const motor = audio.createOscillator();
  motor.type = 'triangle';
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 260;
  const volume = audio.createGain();
  volume.gain.value = 0;
  motor.connect(filter).connect(volume).connect(output);
  motor.start();
  let previous = -1;
  return function setEngine(load) {
    if (load === previous) return;
    previous = load;
    const now = audio.currentTime;
    motor.frequency.setTargetAtTime(58 + Math.max(load, 0) * 24, now, 0.27);
    volume.gain.setTargetAtTime(load < 0 ? 0 : 0.034 + load * 0.018, now, 0.18);
  };
}

function createWinchSound(audio, output, pan, pitch) {
  const tick = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.045), audio.sampleRate);
  const samples = tick.getChannelData(0);
  const random = Model.random(753);
  for (let i = 0; i < samples.length; i++) {
    const time = i / audio.sampleRate;
    const attack = Math.min(1, time * 1600);
    const tooth = Math.sin(2 * Math.PI * 1540 * time) + 0.4 * Math.sin(2 * Math.PI * 2340 * time);
    const tap = 0.55 * Math.sin(2 * Math.PI * 770 * time) + 0.4 * (random() * 2 - 1);
    samples[i] = attack * (tooth * Math.exp(-185 * time) + tap * Math.exp(-290 * time));
  }
  const position = audio.createStereoPanner();
  position.pan.value = pan;
  position.connect(output);
  let direction = 0;
  let nextTick = 0;
  let teeth = 0;
  return function setWinch(motion, gameSpeed) {
    const now = audio.currentTime;
    if (motion !== direction) {
      direction = motion;
      nextTick = now;
    }
    if (!motion || now < nextTick) return;
    const lowering = motion < 0;
    const source = audio.createBufferSource();
    source.buffer = tick;
    source.playbackRate.value = pitch * (lowering ? 1.11 : 1) * (teeth++ % 2 ? 0.94 : 1);
    const level = audio.createGain();
    level.gain.value = lowering ? 0.076 : 0.094;
    source.connect(level).connect(position);
    source.start();
    source.onended = () => level.disconnect();
    const interval = (lowering ? 0.064 : 0.185) / Math.min(1.6, gameSpeed);
    nextTick = Math.max(nextTick + interval, now + interval * 0.6);
  };
}

function createRainSound(audio, output) {
  const random = Model.random(817);
  const buffer = audio.createBuffer(2, audio.sampleRate * 5, audio.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) samples[i] = (random() * 2 - 1) * .13;
    for (let drop = 0; drop < 240; drop++) {
      const start = Math.floor(random() * samples.length);
      const pitch = 440 + 2100 * random();
      const gain = .025 + .093 * random();
      for (let i = 0; i < audio.sampleRate * .032; i++) {
        const t = i / audio.sampleRate;
        samples[(start + i) % samples.length] += (Math.sin(t * Math.PI * 2 * pitch) + random() - .5)
          * gain * Math.exp(-t * 156);
      }
    }
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const spray = audio.createBiquadFilter();
  spray.type = 'bandpass';
  spray.Q.value = .44;
  const drumming = audio.createBiquadFilter();
  drumming.type = 'lowpass';
  drumming.frequency.value = 780;
  const fine = audio.createGain(), heavy = audio.createGain();
  fine.gain.value = heavy.gain.value = 0;
  source.connect(spray).connect(fine).connect(output);
  source.connect(drumming).connect(heavy).connect(output);
  source.start();
  let previous = -1, previousStorm;
  return (rain, storm) => {
    rain = Math.round(rain * 100) / 100;
    if (rain === previous && storm === previousStorm) return;
    previous = rain;
    previousStorm = storm;
    const now = audio.currentTime;
    spray.frequency.setTargetAtTime(3300 - rain * 1200, now, .22);
    fine.gain.setTargetAtTime(rain * 1.02, now, .19);
    heavy.gain.setTargetAtTime(rain * rain * (storm ? 1.65 : 1.25), now, .28);
  };
}

function createThunderSound(audio, output) {
  let buffer;
  return (strike, age) => {
    if (!buffer) {
      buffer = audio.createBuffer(1, audio.sampleRate * 6, audio.sampleRate);
      const samples = buffer.getChannelData(0);
      const random = Model.random(335);
      let low = 0, deep = 0;
      for (let i = 0; i < samples.length; i++) {
        const t = i / audio.sampleRate;
        const noise = random() * 2 - 1;
        low += (noise - low) * .021;
        deep += (low - deep) * .012;
        const attack = Math.min(1, t * 32);
        const roll = (.7 + .28 * Math.sin(t * 11 + Math.sin(t * 5) * 1.4)) * Math.exp(-t * .54);
        samples[i] = attack * (noise * Math.exp(-t * 22) * .5 + (low * 2.8 + deep * 7) * roll)
          * Math.min(1, (6 - t) * 2);
      }
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = .91 + Math.abs(strike.pan) * .23;
    const distance = strike.distance / 1000;
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1120 / (1 + .55 * distance);
    const level = audio.createGain();
    level.gain.value = .72 / (1 + .6 * distance);
    const pan = audio.createStereoPanner();
    pan.pan.value = strike.pan;
    source.connect(filter).connect(level).connect(pan).connect(output);
    const delay = Math.max(0, thunderDelay(strike.distance) - age);
    source.start(audio.currentTime + delay);
    source.onended = () => pan.disconnect();
  };
}

export function createAmbience() {
  let audio;
  let output;
  let music;
  let wind;
  let water;
  let updateThruster;
  let updateEngine;
  let mainWinch;
  let jibWinch;
  let setRain;
  let playThunder;
  let muted = false;

  return {
    async enable(playMusic) {
      if (!audio) {
        audio = new AudioContext();
        output = audio.createGain();
        output.gain.value = muted ? 0 : 0.55;
        output.connect(audio.destination);
        const sound = audio.createBuffer(1, audio.sampleRate * 6, audio.sampleRate);
        const samples = sound.getChannelData(0);
        const random = Model.random(117);
        let last = 0;
        for (let i = 0; i < samples.length; i++) {
          last = (last + (random() * 2 - 1) * 0.04) / 1.04;
          samples[i] = last;
        }
        const breeze = audio.createBufferSource();
        breeze.buffer = sound;
        breeze.loop = true;
        const windFilter = audio.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.value = 510;
        wind = audio.createGain();
        wind.gain.value = 0.29;
        breeze.connect(windFilter).connect(wind).connect(output);
        const waterFilter = audio.createBiquadFilter();
        waterFilter.type = 'highpass';
        waterFilter.frequency.value = 380;
        water = audio.createGain();
        water.gain.value = 0.18;
        breeze.connect(waterFilter).connect(water).connect(output);
        updateThruster = createThrusterSound(audio, breeze, output);
        updateEngine = createEngineSound(audio, output);
        mainWinch = createWinchSound(audio, output, -0.16, 1);
        jibWinch = createWinchSound(audio, output, 0.16, 1.17);
        setRain = createRainSound(audio, output);
        playThunder = createThunderSound(audio, output);
        const swell = audio.createOscillator();
        swell.frequency.value = 0.29;
        const sway = audio.createGain();
        sway.gain.value = 32;
        swell.connect(sway).connect(windFilter.frequency);
        breeze.start();
        swell.start();
      }
      if (playMusic && !music) {
        music = new Audio();
        music.loop = true;
        const level = audio.createGain();
        level.gain.value = 0.18;
        audio.createMediaElementSource(music).connect(level).connect(output);
        music.src = new URL('./audio/ebunny-shanty-spanish-ladies-acoustic-loop-629099.mp3', import.meta.url).href;
      }
      if (playMusic) {
        if (music.paused) void music.play().catch(() => {});
      } else {
        music?.pause();
      }
      await audio.resume();
    },
    mute(value) {
      muted = value;
      if (output) output.gain.setTargetAtTime(value ? 0 : 0.55, audio.currentTime, 0.08);
    },
    update(speed, windSpeed) {
      if (audio?.state !== 'running') return;
      water.gain.value = 0.17 + speed * 0.018;
      wind.gain.setTargetAtTime(0.06 + 0.53 * (1 - Math.exp(-windSpeed / 4)), audio.currentTime, 0.2);
    },
    steering(jet) {
      if (audio?.state === 'running') updateThruster(jet);
    },
    weather(rain, storm) {
      if (audio?.state === 'running') setRain(rain, storm);
    },
    thunder(strike, age) {
      if (audio?.state === 'running') playThunder(strike, age);
    },
    engine(on, gear, boost) {
      if (audio?.state === 'running') updateEngine(on ? (gear ? (boost ? 2 : 1) : 0) : -1);
    },
    winches(mainMotion, jibMotion, gameSpeed) {
      if (audio?.state !== 'running') return;
      mainWinch(muted ? 0 : mainMotion, gameSpeed);
      jibWinch(muted ? 0 : jibMotion, gameSpeed);
    },
    suspend() {
      music?.pause();
      if (audio?.state === 'running') {
        updateThruster(0);
        updateEngine(-1);
        mainWinch(0);
        jibWinch(0);
        void audio.suspend().catch(() => {});
      }
    },
  };
}
