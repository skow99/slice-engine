import {Model} from '../src/index.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const onSameTree = (a, b) => a.x === b.x && a.anchorY === b.anchorY;
const turnToward = (heading, target, dt) => {
  const difference = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
  return heading + Math.max(-dt, Math.min(dt, difference));
};

export function createCrows(treesNear, perchAt, seed = 951) {
  const random = Model.random(seed);
  const birds = [];
  let time = 0;
  let scanAt = 0;

  function available(tree, bird) {
    return birds.every(other => other === bird || (
      !onSameTree(tree, other.tree) && (!other.destination || !onSameTree(tree, other.destination))
    ));
  }

  function perch(bird, tree) {
    Object.assign(bird, perchAt(tree), {
      tree, mode: 'perched', altitude: 0, destination: null,
      leaveAt: time + 8 + random() * 13, lookAt: time + 2 + random() * 4,
      lookTo: bird.heading,
    });
  }

  function nearby(boat) {
    const choices = treesNear(boat, 95).sort((a, b) => distance(a, boat) - distance(b, boat));
    for (const tree of choices) {
      if (birds.length >= 2) return;
      if (distance(tree, boat) < 13 || !available(tree) || birds.some(bird => distance(tree, bird.tree) < 8)) continue;
      const heading = Math.atan2(boat.y - tree.y, boat.x - tree.x) + 0.4;
      const bird = {species: 'crow', heading, phase: random() * Math.PI * 2};
      perch(bird, tree);
      birds.push(bird);
    }
  }

  function depart(bird) {
    const choices = treesNear({x: bird.tree.x, y: bird.tree.anchorY}, 42)
      .filter(tree => distance(tree, bird.tree) > 8 && available(tree, bird));
    const tree = choices[Math.floor(random() * choices.length)];
    if (!tree) {
      bird.leaveAt = time + 5;
      return;
    }
    const target = perchAt(tree);
    Object.assign(bird, {
      destination: tree, target, origin: {x: bird.x, y: bird.y},
      mode: 'flying', began: time, duration: Math.max(1.3, distance(bird, target) / 6.5),
      heading: Math.atan2(target.y - bird.y, target.x - bird.x),
    });
  }

  return {
    birds,
    update(dt, boat, roosting = false) {
      time += dt;
      if (!roosting && time >= scanAt) {
        scanAt = time + 3.5;
        for (let i = birds.length - 1; i >= 0; i--) if (distance(birds[i], boat) > 125) birds.splice(i, 1);
        if (birds.length < 2) nearby(boat);
      }
      for (const bird of birds) {
        if (bird.mode !== 'flying') Object.assign(bird, perchAt(bird.tree));
        if (bird.mode === 'resting' && !roosting) perch(bird, bird.tree);
        if (bird.mode === 'perched') {
          if (roosting) {
            bird.mode = 'resting';
          } else if (time >= bird.leaveAt) {
            depart(bird);
          } else {
            if (time >= bird.lookAt) {
              bird.lookAt = time + 2 + random() * 4;
              bird.lookTo = bird.heading + (random() - 0.5) * 2.6;
            }
            bird.heading = turnToward(bird.heading, bird.lookTo, dt);
          }
          continue;
        }
        if (bird.mode === 'resting') continue;
        bird.target = perchAt(bird.destination);
        const t = Math.min(1, (time - bird.began) / bird.duration);
        const travel = t * t * (3 - 2 * t);
        bird.x = bird.origin.x + (bird.target.x - bird.origin.x) * travel;
        bird.y = bird.origin.y + (bird.target.y - bird.origin.y) * travel;
        bird.altitude = (2.2 + Math.min(2.8, bird.duration * 0.48)) * Math.sin(t * Math.PI);
        if (t === 1) {
          perch(bird, bird.destination);
          if (roosting) bird.mode = 'resting';
        }
      }
    },
    status: () => birds.map(({x, y, mode, altitude, tree}) => ({x, y, mode, altitude, tree: [tree.x, tree.anchorY]})),
  };
}
