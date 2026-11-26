import {Model} from '../src/index.js';

const TAU = Math.PI * 2;
const between = (a, b, t) => a + (b - a) * t;
const point = (at, heading, distance) => ({x: at.x + Math.cos(heading) * distance, y: at.y + Math.sin(heading) * distance});

export function createStorks(isField, reliefAt, bounds, start, seed = 179) {
  const random = Model.random(seed);
  const birds = [];
  const ground = ({x, y}) => reliefAt(x, y) / .72;
  const fieldAt = ({x, y}) => isField(x, y) && isField(x + 1, y) && isField(x - 1, y)
    && isField(x, y - 1) && isField(x, y + 1);
  function add(at, wait) {
    if (!fieldAt(at) || birds.some(bird => Math.hypot(at.x - bird.x, at.y - bird.y) < 15)) return;
    birds.push({...at, species: 'stork', mode: 'standing', altitude: ground(at),
      heading: random() * TAU, phase: random() * TAU, feed: 0, until: wait});
  }

  for (let i = 0; i < 300 && birds.length < 3; i++) add(point(start, random() * TAU, 35 + 160 * random()), 1 + random() * 4);
  for (let i = 0; i < 1500 && birds.length < 30; i++) {
    add({x: between(bounds.west, bounds.east, random()), y: between(bounds.north, bounds.south, random())}, random() * 35);
  }

  let time = 0;
  function takeOff(bird) {
    for (let attempt = 0; attempt < 25; attempt++) {
      const heading = random() * TAU;
      const distance = 28 + random() * 90;
      const at = point(bird, heading, distance);
      if (!fieldAt(at)) continue;
      bird.flight = {from: {x: bird.x, y: bird.y}, to: at, began: time, duration: distance / 6};
      bird.mode = 'flying';
      bird.heading = heading;
      return true;
    }
    return false;
  }

  return {
    birds,
    update(dt) {
      time += dt;
      for (const bird of birds) {
        if (bird.step) {
          const t = Math.min(1, time - bird.step.began);
          const next = {x: between(bird.step.from.x, bird.step.to.x, t), y: between(bird.step.from.y, bird.step.to.y, t)};
          if (fieldAt(next)) Object.assign(bird, next, {altitude: ground(next)});
          if (t === 1) {
            bird.step = undefined;
            bird.mode = 'feeding';
            bird.bentAt = time;
            bird.feedProgress = 0;
          }
          continue;
        }
        if (bird.flight) {
          const {from, to, began, duration} = bird.flight;
          const t = Math.min(1, (time - began) / duration);
          const lift = Math.min(1, t * 5, (1 - t) * 4);
          bird.x = between(from.x, to.x, t);
          bird.y = between(from.y, to.y, t);
          bird.altitude = t === 1 ? ground(to) : ground(bird) + 12 * lift;
          bird.mode = t > .77 ? 'landing' : 'flying';
          if (t === 1) {
            bird.flight = undefined;
            bird.mode = 'standing';
            bird.until = time + 1.4;
          }
          continue;
        }
        if (bird.mode === 'feeding') {
          const progress = Math.min(1, (time - bird.bentAt) / 1.35);
          bird.feedProgress = progress;
          bird.feed = Math.sin(progress * Math.PI) ** .75;
          if (progress < 1) continue;
          bird.mode = 'standing';
          bird.feed = 0;
          bird.until = time + 1.3 + random() * 4;
          continue;
        }
        if (time < bird.until) continue;
        if (random() < .17 && takeOff(bird)) continue;
        const heading = bird.heading + (random() - .5) * 1.8;
        const next = point(bird, heading, .75 + random() * 1.25);
        if (fieldAt(next)) {
          bird.step = {from: {x: bird.x, y: bird.y}, to: next, began: time};
          bird.heading = heading;
          bird.mode = 'walking';
        } else {
          bird.mode = 'feeding';
          bird.bentAt = time;
          bird.feedProgress = 0;
        }
      }
    },
  };
}
