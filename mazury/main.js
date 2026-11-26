import {Clock, Input, Voxel, applyGrade, createScreen, startLoop} from '../src/index.js';
import {createAmbience} from './ambience.js';
import {bindBallastControls} from './ballast-controls.js';
import {drawBird, drawBirdWater, loadBirdArt, visibleBirds} from './bird-view.js';
import {drawBoatLightReflections, drawBoatLights, drawWindGuide} from './boat-overlay.js';
import {createBuildingShadows} from './building-shadows.js';
import {cameraView} from './camera-view.js';
import {createChart} from './chart.js';
import {keyGuide, keys} from './controls.js';
import {createCrows} from './crows.js';
import {birdsRoosting} from './daylight.js';
import {createFleet, maxTraffic} from './fleet.js';
import {createTrafficView, drawTrafficMarker, trafficDescription} from './fleet-view.js';
import {harborWaterAt, inHarbor, inMarina, moveWalker} from './harbor.js';
import {drawBerth, drawBerthSpaces, paintHarbor} from './harbor-view.js';
import {district, landCover, loadLakeMap} from './lake.js';
import {createWorldMap, toGame, toSurvey, worldBounds} from './lake-world.js';
import {survey} from './map/survey.js';
import {drawPorts, drawWarningTowers, portContact, portNear, ports, walkAtPort} from './ports.js';
import {createWaterReflections} from './reflections.js';
import {createSailedTrack, drawDestination} from './route.js';
import {berthStatus, boatSpeed, canGoosewing, hull, jibTrim, knotsPerMeterPerSecond, makeBoat, makeFast, noGoAngle, rightBoat, sailTrim, stepBoat, toggleAnchor, toggleGoosewing, toggleMast, trimSteps} from './sailing.js';
import {loadCottages, sceneryModel} from './settlements.js';
import {createSkyClock} from './sky-clock.js';
import {createStorks} from './storks.js';
import {paintLake} from './terrain.js';
import {loadTreeArt} from './tree-view.js';
import {createFishRises, createPropWash, createWake, drawAnchor, drawGustBands, drawRipples} from './water.js';
import {createWildlife, waterbirdObstacleAt} from './wildlife.js';
import {createWind, windBearing} from './wind.js';
import {createDailyWeather, createWeather, drawRain, drawRainImpacts, drawWindWaves, warningRate} from './weather.js';
import {bindWindControls} from './wind-controls.js';
import {loadYacht, yachtBowEye, yachtLamps} from './yacht-view.js';

const element = id => document.getElementById(id);
const controls = Object.fromEntries([
  'welcome', 'arrival', 'capsize', 'district', 'mooring', 'mooring-note', 'wind', 'sail', 'moor', 'sound', 'music',
  'left', 'right', 'engine', 'boost', 'astern', 'neutral', 'ahead', 'speed', 'zoom', 'range',
  'zoom-in', 'zoom-out', 'center-boat', 'sheet-in', 'ease-sheet', 'trim-readout', 'anchor', 'walk-panel', 'helm-controls', 'board', 'board-note', 'sail-progress', 'game-speed',
  'jib', 'jib-sheet-in', 'ease-jib-sheet', 'goosewing', 'mast',
].map(id => [id, element(id)]));
const terrainMeters = survey.metersPerPixel;
const gearButtons = [[-1, controls.astern], [0, controls.neutral], [1, controls.ahead]];
const ease = t => t * t * (3 - 2 * t);

function drawTerrain(context, view, terrain, sky, mask, ground, density, progressive) {
  const viewX = view.x;
  const viewY = view.y;
  const viewW = view.w / view.scale;
  const viewH = view.h / view.scale;
  const margin = 18 + Math.ceil(16 * Math.max(...sky.shadows.map(Math.abs)));
  const mapView = {
    viewX, viewY, viewW, viewH, margin,
    resolution: view.scale >= 8 ? 6 : view.scale >= 4 ? 4 : 2,
    near: (x, y) => x >= viewX - margin && y >= viewY - margin && x < viewX + viewW + margin && y < viewY + viewH + margin,
  };
  // Join the tiles on the backing pixel grid before scrolling them by the
  // remaining fraction. Filtering each tile separately exposes its edges.
  const pixelsPerMeter = view.scale * density;
  const rasterX = Math.floor(viewX * pixelsPerMeter) / pixelsPerMeter;
  const rasterY = Math.floor(viewY * pixelsPerMeter) / pixelsPerMeter;
  const shiftX = (rasterX - viewX) * view.scale;
  const shiftY = (rasterY - viewY) * view.scale;
  ground.setTransform(1, 0, 0, 1, 0, 0);
  ground.fillStyle = '#152b31';
  ground.fillRect(0, 0, ground.canvas.width, ground.canvas.height);
  ground.imageSmoothingEnabled = false;
  ground.setTransform(pixelsPerMeter, 0, 0, pixelsPerMeter, 0, 0);
  mask.save();
  mask.translate(shiftX, shiftY);
  mask.scale(view.scale, view.scale);
  mapView.refining = terrain.draw(ground, {
    viewX: rasterX, viewY: rasterY,
    viewW: ground.canvas.width / pixelsPerMeter, viewH: ground.canvas.height / pixelsPerMeter,
    resolution: mapView.resolution,
    progressive,
  }, sky, mask);
  mask.restore();
  context.save();
  context.imageSmoothingEnabled = true;
  context.drawImage(ground.canvas, shiftX, shiftY, ground.canvas.width / density, ground.canvas.height / density);
  context.restore();
  return mapView;
}

function drawScenery(context, view, scenery) {
  scenery.sort((a, b) => a.y - b.y);
  for (const item of scenery) {
    if (item.draw || item.model || inMarina(item.x, item.anchorY)) continue;
    const {x, y} = view.toScreen(item);
    const scale = view.scale * item.scale;
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    context.globalAlpha = 0.77;
    // Deflect the distant end of the shadow along with the loaded crown.
    const sx = Voxel.SHADOW_X, sy = Voxel.SHADOW_Y;
    const bend = .18 * item.flex / (.2 + sx * sx + sy * sy);
    const bx = bend * item.load.x, by = bend * item.load.y;
    context.transform(1 + bx * sx, by * sx, bx * sy, 1 + by * sy, 0, 0);
    Voxel.draw(context, item.art.shadow, 0, 0);
    context.restore();
  }
  for (const item of scenery) {
    if (item.draw) {
      item.draw();
      continue;
    }
    if (inMarina(item.x, item.anchorY)) continue;
    const position = view.toScreen(item);
    const art = item.model && sceneryModel(item, view.scale < 3);
    const scale = view.scale * (art ? art.scale : item.art.scale);
    context.save();
    context.translate(position.x, position.y);
    context.scale(scale, scale * (item.model ? 1 / Voxel.SQUASH : 1));
    if (item.model) {
      Voxel.draw(context, art.model.sprite(item.heading, item.heightScale), 0, 0);
    } else {
      context.imageSmoothingEnabled = false;
      item.art.draw(context);
    }
    context.restore();
  }
}

function createReliefOverview(w, h, terrain, harbor, world) {
  const {west, east, north, south} = worldBounds;
  // Composite adjacent texels once before downsampling to keep tile edges invisible.
  const atlas = Voxel.canvas(east - west, south - north);
  const ground = atlas.getContext('2d');
  ground.fillStyle = '#152b31';
  ground.fillRect(0, 0, atlas.width, atlas.height);
  terrain.draw(ground, {viewX: west, viewY: north, viewW: atlas.width, viewH: atlas.height, resolution: 1});
  harbor.draw(ground, {x: west, y: north, scale: 1, w: atlas.width, h: atlas.height});

  const labels = ['Giżycko', 'Wilkasy', 'Rydzewo', 'Strzelce', 'Bystry'].map(name => {
    const [sx, sy] = survey.towns[name];
    const {x, y} = toGame(sx * terrainMeters, sy * terrainMeters);
    return {name, x, y: y - world.reliefAt(x, y)};
  });

  function draw(target, view, opacity) {
    target.save();
    target.globalAlpha = opacity;
    const origin = view.toScreen({x: west, y: north});
    const mapWidth = atlas.width * view.scale;
    const mapHeight = atlas.height * view.scale;
    target.fillStyle = '#152b31';
    target.beginPath();
    target.rect(0, 0, w, h);
    target.rect(origin.x, origin.y, mapWidth, mapHeight);
    target.fill('evenodd');
    target.imageSmoothingEnabled = true;
    target.drawImage(atlas, origin.x, origin.y, mapWidth, mapHeight);
    target.restore();
  }

  function drawLabels(target, view, boat, heading, opacity, labelOpacity) {
    target.save();
    if (labelOpacity > 0) {
      target.globalAlpha = labelOpacity;
      target.font = '600 9px system-ui';
      target.textAlign = 'left';
      target.textBaseline = 'alphabetic';
      target.lineJoin = 'round';
      target.strokeStyle = '#172c2b';
      target.lineWidth = 2;
      target.fillStyle = '#f6e8cc';
      for (const label of labels) {
        const at = view.toScreen(label);
        target.strokeText(label.name, at.x + 3, at.y);
        target.fillText(label.name, at.x + 3, at.y);
      }
    }
    target.globalAlpha = opacity;
    const at = view.toScreen(boat);
    target.translate(at.x, at.y);
    target.beginPath();
    target.arc(0, 0, 7, 0, Math.PI * 2);
    target.fillStyle = '#14282c';
    target.fill();
    target.strokeStyle = '#f2d38d';
    target.lineWidth = 1.3;
    target.stroke();
    target.rotate(heading);
    target.beginPath();
    target.moveTo(4, 0);
    target.lineTo(-2.5, -2.8);
    target.lineTo(-2.5, 2.8);
    target.closePath();
    target.fillStyle = '#fff0c5';
    target.fill();
    target.restore();
  }

  return {draw, drawLabels};
}

function drawWalker(context, view, walker) {
  const {x, y} = view.toScreen(walker);
  context.beginPath();
  context.arc(x, y, 3, 0, Math.PI * 2);
  context.fillStyle = '#f2cf80';
  context.fill();
  context.lineWidth = 1.2;
  context.strokeStyle = '#24342e';
  context.stroke();
}

function drawYacht(context, view, boat, {sprite, metersPerVoxel}) {
  const position = view.toScreen(boat);
  const scale = metersPerVoxel * view.scale;
  context.save();
  context.imageSmoothingEnabled = false;
  context.translate(position.x, position.y);
  context.scale(scale, scale / Voxel.SQUASH);
  Voxel.draw(context, sprite, 0, 0);
  context.restore();
}

async function boot() {
  const [yachtFrame, map, cottages, birdArt, treeArt] = await Promise.all([loadYacht(), loadLakeMap(), loadCottages(), loadBirdArt(), loadTreeArt()]);
  const world = {...createWorldMap(map), portContact};
  const skyClock = createSkyClock(element('daylight'));
  let terrain = paintLake(world, cottages, treeArt);
  let harbor = paintHarbor(cottages);
  const terrainDensity = 2;
  const width = 512;
  const height = 288;
  const createGround = () => Voxel.canvas(width * terrainDensity + 1, height * terrainDensity + 1).getContext('2d');
  const createShade = () => Voxel.canvas(width * terrainDensity, height * terrainDensity).getContext('2d');
  let ground = createGround();
  let reflections = createWaterReflections(width, height);
  let buildingShade = createShade();
  let drawBuildingShadows = createBuildingShadows(terrain.surfaceLiftAt);
  const surface = createScreen({
    width, height, pixelDensity: [2, 4],
    parent: element('lake'), background: '#244d52', wholePixels: 1,
    onRestore() {
      terrain = paintLake(world, cottages, treeArt);
      harbor = paintHarbor(cottages);
      ground = createGround();
      reflections = createWaterReflections(width, height);
      buildingShade = createShade();
      drawBuildingShadows = createBuildingShadows(terrain.surfaceLiftAt);
      liveOverview = undefined;
    },
  });
  new ResizeObserver(() => {
    const fit = fitOverview();
    if (fit.scale !== overviewFit.scale) {
      overviewFit = fit;
      if (wholeLake) updateZoom();
    }
  }).observe(surface.box);
  const screen = surface;
  const wake = createWake();
  const boat = makeBoat();
  const ballast = bindBallastControls(element('ballast'), boat);
  const wind = createWind();
  const weather = createWeather();
  const fleet = createFleet(world, worldBounds, ports);
  const trafficView = createTrafficView();
  const weatherMode = element('weather-mode');
  const autoWeather = element('weather-auto');
  const weatherStatus = element('weather-auto-status');
  let weatherSeed = Math.floor(Math.random() * 2 ** 31);
  let dailyWeather = createDailyWeather(weatherSeed);
  const warning = element('weather-warning');
  const windGuide = element('wind-guide');
  weatherMode.addEventListener('change', () => {
    weather.set(weatherMode.value);
    enableAudio();
  });
  try { windGuide.checked = localStorage.getItem('mazury.windGuide') !== 'off'; } catch {}
  function setWindGuide(enabled) {
    windGuide.checked = enabled;
    try { localStorage.setItem('mazury.windGuide', enabled ? 'on' : 'off'); } catch {}
  }
  windGuide.addEventListener('change', () => setWindGuide(windGuide.checked));
  let heardStrike = 0;
  const windControls = bindWindControls(controls.wind, wind, boat);
  autoWeather.addEventListener('change', () => {
    const enabled = autoWeather.checked;
    weatherMode.hidden = weatherMode.disabled = enabled;
    weatherMode.labels[0].hidden = enabled;
    weatherStatus.hidden = !enabled;
    windControls.setSimulation(enabled);
    if (!enabled) weather.set(weatherMode.value);
    else weatherStatus.textContent = 'Following the lake clock';
  });
  const audio = createAmbience();
  const mapDialog = element('map-dialog');
  const trafficCount = element('traffic-count');
  trafficCount.max = maxTraffic;
  const trafficTotal = element('traffic-total');
  const trafficRoster = element('traffic-roster');
  const trafficBoats = element('traffic-boats');
  const helpDialog = element('controls-dialog');
  const shortcuts = element('shortcuts');
  for (const [label, shortcut] of keyGuide) {
    const term = document.createElement('dt');
    const keys = document.createElement('dd');
    term.textContent = label;
    keys.textContent = shortcut;
    shortcuts.append(term, keys);
  }
  const drawChart = createChart(element('map'), map);
  const destinationPicker = element('destination');
  const berthPicker = element('berth-picker');
  const berthControls = element('berth-controls');
  const portCapacity = element('port-capacity');
  const startPort = element('start-port');
  let destination;
  let selectionView;
  let drawnView;
  let boatHit;
  const waypointHint = element('waypoint-hint');
  const overviewLegend = element('overview-legend');
  element('overview-elevation').textContent = survey.landElevationRange.join('–') + ' m elevation';
  const trackButton = element('show-track');
  const track = createSailedTrack();
  let showTrack = false;
  trackButton.addEventListener('click', () => {
    showTrack = !showTrack;
    trackButton.setAttribute('aria-pressed', String(showTrack));
  });
  let mooredPort = ports[0];
  const berthsAt = port => fleet.moorings.get(port) ?? [port];
  function berthNear(point, range = 45) {
    let closest;
    for (const port of ports) for (const slot of berthsAt(port)) {
      const gap = Math.hypot(point.x - slot.berth.x, point.y - slot.berth.y);
      if (gap >= range) continue;
      range = gap;
      closest = {...port, ...slot};
    }
    return closest;
  }
  function refreshChartBerths(port, selected = 0) {
    const slots = port && port.id !== 'waypoint' ? berthsAt(port) : [];
    berthControls.hidden = slots.length < 2;
    berthPicker.replaceChildren(...slots.map((slot, i) => new Option(
      i && port.id === 'ekomarina' ? 'West quay ' + i : 'Berth ' + (i + 1), i)));
    berthPicker.value = selected;
    startPort.hidden = phase !== 'welcome' || !slots.length;
    const total = [...fleet.moorings.values()].reduce((sum, entries) => sum + entries.length, 0);
    portCapacity.textContent = total + ' berths on the connected lake'
      + (slots.length ? fleet.moorings.has(port)
        ? ' · ' + slots.length + (slots.length === 1 ? ' berth here' : ' berths here')
        : ' · Local approach only' : '');
  }
  for (const port of ports) destinationPicker.add(new Option(port.name, port.id));
  function setDestination(target) {
    destination = target;
    destinationPicker.value = target?.id ?? '';
    destinationPicker.querySelector('[value="waypoint"]').hidden = target?.id !== 'waypoint';
    waypointHint.textContent = target ? target.name + ' selected. Choose another point to change it.'
      : 'Choose a point on the water to set a destination.';
    refreshChartBerths(target);
    drawOverview?.(chartBoat(), destination, fleet.boats);
    drawChart(chartBoat(), destination, fleet.boats);
    refreshControls();
  }
  destinationPicker.addEventListener('change', () => setDestination(ports.find(port => port.id === destinationPicker.value)));
  berthPicker.addEventListener('change', () => {
    const port = ports.find(port => port.id === destinationPicker.value);
    destination = {...port, ...berthsAt(port)[Number(berthPicker.value)]};
    drawOverview?.(chartBoat(), destination, fleet.boats);
    refreshControls();
  });
  function chooseWaypoint({x, y}) {
    const at = {x: selectionView.x + x / selectionView.scale, y: selectionView.y + y / selectionView.scale};
    if (!birdWaterAt(at.x, at.y)) {
      const port = portNear(at, 3 / selectionView.scale);
      if (port) setDestination(port);
      else waypointHint.textContent = 'Choose a destination on the water.';
      return;
    }
    setDestination({id: 'waypoint', name: 'Lake waypoint', berth: at});
  }
  const chartBoat = () => {
    const a = toSurvey(boat.x, boat.y);
    const b = toSurvey(boat.x + Math.cos(boat.heading), boat.y + Math.sin(boat.heading));
    return {x: a.x / terrainMeters, y: a.y / terrainMeters, heading: Math.atan2(b.y - a.y, b.x - a.x)};
  };
  const isWater = (x, y) => inHarbor(x, y)
    ? harborWaterAt(x, y)
    : world.depthAt(x, y) > 0;
  const birdWaterAt = (x, y) => isWater(x, y) && !waterbirdObstacleAt(x, y);
  const wildlife = createWildlife(birdWaterAt, boat, {
    bounds: worldBounds, reliefAt: world.reliefAt, structureAt: waterbirdObstacleAt,
  });
  const storks = createStorks((x, y) => {
    const cover = world.coverAt(x, y);
    return cover >= landCover.field && cover <= landCover.greenField && !isWater(x, y);
  }, world.reliefAt, worldBounds, boat);
  const fishRises = createFishRises(isWater);
  const propWash = createPropWash(isWater);
  let drawOverview;
  let phase = 'welcome';
  let walker = null;
  let muted = false;
  let musicEnabled = true;
  try { musicEnabled = localStorage.getItem('mazury.music') !== 'off'; } catch {}
  let time = 0;
  const crows = createCrows((...args) => terrain.treesNear(...args), tree => treeArt.perchAt(tree, wind, time));
  let anchorDrop;
  let secondsOnWater = 0;
  const gameSpeeds = [...controls['game-speed'].options].map(option => Number(option.value));
  let gameSpeed = Number(controls['game-speed'].value);
  const worldClock = Clock.create(1 / 60);
  let previousPosition;
  const zoomLevels = [1, 1.5, 2, 3, 4, 6, 8];
  const overviewBlendEnd = 0.9;
  let zoomIndex = 4;
  let wholeLake = false;
  let panCenter;
  let followYachtAshore = false;
  let drag;
  const {west, east, north, south} = worldBounds;
  const overviewCenter = {x: (west + east) / 2, y: (north + south) / 2};
  function fitOverview() {
    const visibleWidth = width * Math.min(1, surface.box.clientWidth / Math.max(1, surface.canvas.clientWidth));
    const compact = visibleWidth < 400;
    const verticalMargin = compact ? 98 : 26;
    const scale = Math.min(Math.max(48, visibleWidth - 24) / (east - west), (height - verticalMargin) / (south - north));
    const center = compact ? {...overviewCenter, y: overviewCenter.y - 9 / scale} : overviewCenter;
    return {scale, center};
  }
  let overviewFit = fitOverview();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let cameraScale = zoomLevels[zoomIndex];
  let zoomFrom = cameraScale;
  let zoomTarget = cameraScale;
  let zoomStarted;
  let zoomDuration;
  let refiningTerrain = false;
  let liveOverview = createReliefOverview(width, height, terrain, harbor, world);

  function pointerPosition(event) {
    const rect = surface.canvas.getBoundingClientRect();
    return {x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height};
  }
  surface.canvas.addEventListener('pointerdown', event => {
    if (!drawnView || drag || event.button !== 0 || mapDialog.open || helpDialog.open) return;
    drag = {id: event.pointerId, start: pointerPosition(event), center: drawnView.position, scale: drawnView.scale, moved: false};
    surface.canvas.setPointerCapture(event.pointerId);
  });
  surface.canvas.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const at = pointerPosition(event);
    const dx = at.x - drag.start.x, dy = at.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    refiningTerrain = true;
    panCenter = {
      x: Math.max(west, Math.min(east, drag.center.x - dx / drag.scale)),
      y: Math.max(north, Math.min(south, drag.center.y - dy / drag.scale)),
    };
    surface.canvas.classList.add('panning');
  });
  function endDrag(event) {
    if (drag?.id !== event.pointerId) return;
    const moved = drag.moved;
    drag = undefined;
    surface.canvas.classList.remove('panning');
    if (moved || event.type !== 'pointerup') return;
    const at = pointerPosition(event);
    if (boatHit && at.x >= boatHit.left && at.x <= boatHit.right && at.y >= boatHit.top && at.y <= boatHit.bottom) {
      centerBoat();
    } else if (selectionView) {
      chooseWaypoint(at);
    }
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    surface.canvas.addEventListener(type, endDrag);
  }

  function refreshTraffic() {
    const count = fleet.boats.length;
    trafficTotal.textContent = count === 1 ? '1 boat' : count + ' boats';
    trafficCount.setAttribute('aria-valuetext', trafficTotal.textContent);
    trafficRoster.hidden = count === 0;
    if (!trafficRoster.open) return;
    trafficBoats.replaceChildren(...fleet.boats.map(vessel => {
      const row = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = vessel.name;
      const description = document.createElement('span');
      description.textContent = trafficDescription(vessel);
      row.append(name, description);
      return row;
    }));
  }

  function setTraffic() {
    fleet.setCount(trafficCount.valueAsNumber, boat, skyClock.minute(), skyClock.read().sun);
    refreshTraffic();
    if (mapDialog.open) drawOverview(chartBoat(), destination, fleet.boats);
    drawChart(chartBoat(), destination, fleet.boats);
  }
  try {
    const saved = localStorage.getItem('mazury.traffic');
    if (saved !== null) trafficCount.value = saved;
  } catch {}
  setTraffic();
  trafficCount.addEventListener('input', () => {
    setTraffic();
    try { localStorage.setItem('mazury.traffic', trafficCount.value); } catch {}
  });
  trafficRoster.addEventListener('toggle', refreshTraffic);

  function enableAudio() {
    if (document.hidden) return;
    void audio.enable(phase !== 'welcome' && musicEnabled && !muted).catch(() => {});
  }

  function castOff() {
    if (rightBoat(boat)) {
      phase = 'sailing';
      refreshControls();
      return;
    }
    if (phase === 'sailing' || walker) return;
    boat.moored = false;
    boat.engine = true;
    phase = 'sailing';
    track.record(boat);
    enableAudio();
    refreshControls();
  }

  function sailOut() {
    if (phase !== 'welcome') return;
    boat.heading = Math.PI / 2 + 0.31;
    boat.sail = true;
    phase = 'sailing';
    track.record(boat);
    enableAudio();
    refreshControls();
  }

  function toggleBoarding() {
    if (!boat.moored) return;
    const boardAt = mooredPort.boardingPoint;
    if (!walker) {
      walker = {...boardAt, vx: 0, vy: 0, heading: boat.heading};
      phase = 'ashore';
    } else {
      if (Math.hypot(walker.x - boardAt.x, walker.y - boardAt.y) > 2.2) return;
      walker = null;
      phase = 'arrived';
    }
    followYachtAshore = false;
    previousPosition = undefined;
    refreshControls();
  }

  function walk(dt) {
    const horizontal = Number(Input.held('right')) - Number(Input.held('left'));
    const vertical = Number(Input.held('down')) - Number(Input.held('up'));
    const distance = 1.6 * dt / Math.max(1, Math.hypot(horizontal, vertical));
    if (!horizontal && !vertical) return;
    if (mooredPort.dock) walkAtPort(mooredPort, walker, horizontal * distance, vertical * distance, world.waterDepth);
    else moveWalker(walker, horizontal * distance, vertical * distance);
  }

  function toggleSail(sail) {
    if (phase === 'sailing' && !boat.mastDown && boat.mastFold === 0) {
      boat[sail] = !boat[sail];
      if (!boat[sail]) boat.goosewing = false;
      refreshControls();
    }
  }

  function changeMast() {
    if ((phase === 'sailing' || phase === 'arrived') && toggleMast(boat)) refreshControls();
  }

  function changeGoosewing() {
    if (phase === 'sailing' && toggleGoosewing(boat, wind.at(boat))) refreshControls();
  }

  function toggleEngine() {
    if (phase !== 'sailing') return;
    boat.engine = !boat.engine;
    boat.engineBoost = false;
    boat.gear = 0;
    refreshControls();
  }

  function toggleBoost() {
    if (phase !== 'sailing' || boat.anchor) return;
    boat.engineBoost = !boat.engineBoost;
    if (boat.engineBoost) {
      boat.engine = true;
      boat.gear = 1;
    }
    refreshControls();
  }

  function setGear(value) {
    if (phase !== 'sailing' || !boat.engine || boat.anchor) return;
    boat.gear = Math.min(1, Math.max(-1, value));
    if (boat.gear !== 1) boat.engineBoost = false;
    refreshControls();
  }

  function updateZoom() {
    const target = wholeLake ? overviewFit.scale : zoomLevels[zoomIndex];
    if (target !== zoomTarget) {
      zoomFrom = cameraScale;
      zoomTarget = target;
      zoomStarted = undefined;
      zoomDuration = Math.min(480, 160 + 150 * Math.abs(Math.log(target / zoomFrom)));
      refiningTerrain = true;
    }
    setText(controls.zoom, wholeLake ? 'Follow boat' : 'Whole lake');
    controls.zoom.setAttribute('aria-pressed', String(wholeLake));
    controls['zoom-out'].disabled = wholeLake;
    controls['zoom-in'].disabled = !wholeLake && zoomIndex === zoomLevels.length - 1;
  }

  function changeZoom(direction) {
    if (wholeLake) {
      if (direction > 0) wholeLake = false;
    } else if (direction < 0 && zoomIndex === 0) {
      wholeLake = true;
      panCenter = undefined;
    } else {
      zoomIndex = Math.max(0, Math.min(zoomLevels.length - 1, zoomIndex + direction));
    }
    updateZoom();
  }

  function toggleZoom() {
    wholeLake = !wholeLake;
    panCenter = undefined;
    updateZoom();
  }

  function centerBoat() {
    wholeLake = false;
    panCenter = undefined;
    followYachtAshore = !!walker;
    updateZoom();
  }

  function changeTrim(direction, sail) {
    const jib = sail === 'jib';
    const sheet = jib ? 'jibSheet' : 'trim';
    const deployment = jib ? boat.jibDeployment : boat.deployment;
    if (phase !== 'sailing' || (!boat[sail] && deployment === 0)) return;
    boat[sheet] = Math.max(0, Math.min(1, boat[sheet] + direction / trimSteps));
    refreshControls();
  }

  function anchorAction() {
    if (phase !== 'sailing' || !toggleAnchor(boat)) return;
    anchorDrop = undefined;
    if (boat.anchor) {
      const sites = [0.32, -0.48, 1.15, -1.15, 2.4, -2.4].map(offset => ({
        x: boat.x + Math.cos(boat.heading + offset) * 5.4,
        y: boat.y + Math.sin(boat.heading + offset) * 5.4,
      }));
      anchorDrop = {...(sites.find(({x, y}) => isWater(x, y)) ?? boat.anchor), born: time};
    }
    refreshControls();
  }

  function moor() {
    const port = berthNear(boat, 16);
    if (phase === 'sailing' && port && !fleet.berthTaken(port, boat) && makeFast(boat, port.berth)) {
      mooredPort = port;
      phase = 'arrived';
      previousPosition = undefined;
      refreshControls();
    }
  }

  function toggleSound() {
    muted = !muted;
    audio.mute(muted);
    if (phase !== 'welcome') enableAudio();
    controls.sound.textContent = muted ? 'Sound off' : 'Sound on';
    controls.sound.setAttribute('aria-pressed', String(!muted));
  }

  function refreshMusic() {
    controls.music.textContent = musicEnabled ? 'Music on' : 'Music off';
    controls.music.setAttribute('aria-pressed', String(musicEnabled));
  }

  function toggleMusic() {
    musicEnabled = !musicEnabled;
    try { localStorage.setItem('mazury.music', musicEnabled ? 'on' : 'off'); } catch {}
    refreshMusic();
    if (phase !== 'welcome') enableAudio();
  }

  function cycleGameSpeed() {
    const next = gameSpeeds.indexOf(gameSpeed) + 1;
    changeGameSpeed(gameSpeeds[next % gameSpeeds.length]);
    controls['game-speed'].value = gameSpeed;
  }

  function changeGameSpeed(speed) {
    gameSpeed = speed;
    Clock.reset(worldClock);
    previousPosition = undefined;
  }

  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function hoistProgress(name, raised, deployment) {
    return deployment === Number(raised) ? '' : (raised ? 'Raising ' : 'Lowering ') + name + ' ' + Math.round(deployment * 100) + '%';
  }

  function trimAdvice(name, trim) {
    if (trim.error > 0.14) return 'Sheet in ' + name;
    if (trim.error < -0.15) return 'Ease ' + name;
    return trim.shelter > 0.52 ? 'Jib in main’s wind shadow' : name + ' trim set';
  }

  function refreshControls() {
    const sailing = phase === 'sailing';
    ballast.refresh(sailing || phase === 'arrived');
    const location = chartBoat();
    const localPort = boat.moored ? mooredPort : berthNear(boat);
    const position = localPort?.name ?? district(location.x, location.y);
    setText(controls.district, position);
    controls.welcome.hidden = phase !== 'welcome';
    controls.arrival.hidden = phase !== 'arrived';
    controls.capsize.hidden = phase !== 'capsized';
    controls['walk-panel'].hidden = !walker;
    controls['helm-controls'].hidden = !!walker;
    const progress = [hoistProgress('main', boat.sail, boat.deployment), hoistProgress('jib', boat.jib, boat.jibDeployment)]
      .filter(Boolean).join(' · ');
    controls['sail-progress'].hidden = !sailing || !progress;
    setText(controls['sail-progress'], progress);
    setText(element('arrival-heading'), 'Moored at ' + (mooredPort.dock ? mooredPort.name : 'Ekomarina'));
    if (walker) {
      const boardAt = mooredPort.boardingPoint;
      const near = Math.hypot(walker.x - boardAt.x, walker.y - boardAt.y) <= 2.2;
      controls.board.disabled = !near;
      setText(controls['board-note'], near ? 'Ashore' : 'Return to your berth to board');
    }
    const trimActive = sailing && (boat.sail || boat.deployment > 0);
    const jibActive = sailing && (boat.jib || boat.jibDeployment > 0);
    const localWind = wind.at(boat);
    const conditions = weather.read();
    windControls.refresh(localWind, conditions.daily);
    if (!weatherStatus.hidden && conditions.daily) {
      setText(weatherStatus, {clear: 'Clear skies', light: 'Passing showers', heavy: 'Heavy rain', storm: 'Thunderstorm'}[conditions.mode]);
    }
    audio.update(boatSpeed(boat) * 5, localWind.speed);
    const trim = sailTrim(boat, localWind);
    const point = trim.trueAngle < noGoAngle ? 'In irons · Bear away' : trim.trueAngle < 1.35 ? 'Upwind'
      : trim.trueAngle < 1.9 ? 'Across the wind' : trim.trueAngle < 2.85 ? 'Broad reach' : 'Downwind';
    const available = sailing && canGoosewing(boat, localWind);
    const advice = [boat.goosewing ? 'Na motyla' : point];
    if (available && !boat.goosewing) advice.push('Na motyla (Y)');
    if (trim.trueAngle >= noGoAngle) {
      if (trimActive) advice.push(trimAdvice('main', trim));
      if (jibActive) advice.push(trimAdvice('jib', jibTrim(boat, localWind)));
    }
    controls['trim-readout'].hidden = !trimActive && !jibActive;
    const heel = Math.abs(boat.heel);
    const heelWarning = heel > Math.PI / 3 ? 'Knockdown · Lower sails' : heel > 0.67 ? 'Heavy heel · Ease sheets or lower sails' : '';
    setText(controls['trim-readout'], heelWarning || (localWind.speed < 0.1 ? 'Calm · Start engine' : advice.join(' · ')));
    const rate = warningRate(wind, weather.read(), skyClock.read().sun.elevation > 0);
    warning.hidden = !rate;
    setText(warning, rate === 90 ? 'ALARM · 90 flashes/min · Seek shelter' : rate ? 'UWAGA · 40 flashes/min · Watch the weather' : '');
    controls['sheet-in'].disabled = !trimActive || boat.trim === 0;
    controls['ease-sheet'].disabled = !trimActive || boat.trim === 1;
    controls['jib-sheet-in'].disabled = !jibActive || boat.jibSheet === 0;
    controls['ease-jib-sheet'].disabled = !jibActive || boat.jibSheet === 1;
    controls.goosewing.disabled = !sailing || (!available && !boat.goosewing);
    controls.goosewing.setAttribute('aria-pressed', String(boat.goosewing));
    controls.anchor.disabled = !sailing;
    setText(controls.anchor, boat.anchor ? 'Weigh anchor' : 'Drop anchor');
    controls.anchor.setAttribute('aria-pressed', String(!!boat.anchor));
    controls.sail.disabled = controls.jib.disabled = controls.left.disabled = controls.right.disabled = controls.engine.disabled = !sailing;
    controls.sail.disabled ||= boat.mastDown || boat.mastFold > 0;
    controls.jib.disabled ||= boat.mastDown || boat.mastFold > 0;
    controls.mast.disabled = (!sailing && phase !== 'arrived') || boat.sail || boat.jib || boat.deployment > 0 || boat.jibDeployment > 0;
    setText(controls.mast, boat.mastDown ? 'Raise mast' : 'Lower mast');
    setText(controls.sail, boat.sail ? 'Lower main' : 'Raise main');
    setText(controls.jib, boat.jib ? 'Lower jib' : 'Raise jib');
    setText(controls.engine, boat.engine ? 'Engine on' : 'Engine off');
    controls.engine.setAttribute('aria-pressed', String(boat.engine));
    controls.boost.disabled = !sailing || !!boat.anchor;
    controls.boost.setAttribute('aria-pressed', String(boat.engineBoost));
    for (const [gear, button] of gearButtons) {
      button.disabled = !sailing || !boat.engine || !!boat.anchor;
      button.setAttribute('aria-pressed', String(gear === boat.gear));
    }
    const status = sailing && localPort
      ? fleet.berthTaken(localPort, boat) ? 'Berth occupied' : berthStatus(boat, localPort.berth) : '';
    controls.mooring.hidden = !status;
    controls.moor.hidden = status !== 'ready';
    setText(controls['mooring-note'], status === 'ready' ? '' : status);
    const speed = boatSpeed(boat) * knotsPerMeterPerSecond;
    setText(controls.speed, speed.toFixed(1) + ' kn');
    const target = destination ?? localPort ?? ports[0];
    const dx = target.berth.x - boat.x, dy = target.berth.y - boat.y;
    const distance = Math.round(Math.hypot(dx, dy));
    const bearing = (Math.round(windBearing(Math.atan2(dy, dx))) % 360).toString().padStart(3, '0');
    const direction = bearing + '° · ' + distance + ' m';
    let range = boat.anchor ? 'At anchor · ' + direction : target.name + ' · ' + direction;
    if (boat.moored) range = 'Moored';
    else if (boat.anchor && !destination) range = 'At anchor';
    else if (!boat.anchor && localPort && !destination) range = 'Berth · ' + distance + ' m';
    setText(controls.range, range);
  }

  Input.attach(window, {keys, onFirstInput: enableAudio});
  Input.attachTouch(document.querySelector('.rudder'));
  Input.attachTouch(element('walk-pad'));
  document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLButtonElement && ['Space', 'Enter', 'NumpadEnter'].includes(event.code)) {
      event.stopPropagation();
    }
  });
  function click(id, action) {
    element(id).addEventListener('click', event => {
      if (event.detail > 0) event.currentTarget.blur();
      action();
    });
  }
  click('start', castOff);
  click('explore', sailOut);
  click('continue', castOff);
  click('right-boat', castOff);
  click('step-ashore', toggleBoarding);
  click('board', toggleBoarding);
  click('sail', () => toggleSail('sail'));
  click('jib', () => toggleSail('jib'));
  click('mast', changeMast);
  click('engine', toggleEngine);
  click('boost', toggleBoost);
  click('zoom', toggleZoom);
  click('center-boat', centerBoat);
  click('zoom-in', () => changeZoom(1));
  click('zoom-out', () => changeZoom(-1));
  click('sheet-in', () => changeTrim(-1, 'sail'));
  click('ease-sheet', () => changeTrim(1, 'sail'));
  click('jib-sheet-in', () => changeTrim(-1, 'jib'));
  click('ease-jib-sheet', () => changeTrim(1, 'jib'));
  click('goosewing', changeGoosewing);
  click('anchor', anchorAction);
  let lastScroll = -Infinity;
  element('lake').addEventListener('wheel', event => {
    event.preventDefault();
    if (event.timeStamp - lastScroll < 100 || !event.deltaY) return;
    lastScroll = event.timeStamp;
    changeZoom(event.deltaY < 0 ? 1 : -1);
  }, {passive: false});
  click('moor', moor);
  click('sound', toggleSound);
  click('music', toggleMusic);
  controls['game-speed'].addEventListener('change', event => {
    changeGameSpeed(Number(event.currentTarget.value));
  });
  controls['game-speed'].addEventListener('keydown', event => {
    if (event.code !== 'KeyX' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    cycleGameSpeed();
  });
  for (const [gear, button] of gearButtons) click(button.id, () => setGear(gear));
  document.addEventListener('visibilitychange', () => {
    previousPosition = undefined;
    if (document.hidden) audio.suspend();
    else if (phase !== 'welcome') enableAudio();
  });

  refreshMusic();
  refreshControls();
  const loop = startLoop({
    tick: worldClock.tick,
    update(dt) {
      Input.update();
      Input.takeActions();
      if (Input.pressed('mute')) toggleSound();
      if (Input.pressed('sky')) skyClock.togglePanel();
      if (Input.pressed('earlier')) skyClock.shift(-1);
      if (Input.pressed('later')) skyClock.shift(1);
      if (Input.pressed('moon')) skyClock.toggleMoon();
      if (Input.pressed('clock')) skyClock.toggleRunning();
      if (Input.pressed('gameSpeed')) cycleGameSpeed();
      if (Input.pressed('wind')) windControls.toggle();
      if (Input.pressed('windGuide')) setWindGuide(!windGuide.checked);
      if (Input.pressed('gust')) windControls.bump();
      if (Input.pressed('zoom')) toggleZoom();
      if (Input.pressed('zoomIn')) changeZoom(1);
      if (Input.pressed('zoomOut')) changeZoom(-1);
      if (Input.pressed('trimIn')) changeTrim(-1, 'sail');
      if (Input.pressed('ease')) changeTrim(1, 'sail');
      if (Input.pressed('jibIn')) changeTrim(-1, 'jib');
      if (Input.pressed('jibEase')) changeTrim(1, 'jib');
      if (Input.pressed('goosewing')) changeGoosewing();
      if (Input.pressed('anchor')) anchorAction();
      if (Input.pressed('engine')) toggleEngine();
      if (Input.pressed('boost')) toggleBoost();
      if (Input.pressed('board')) toggleBoarding();
      if (Input.pressed('chart')) openChart();
      if (Input.pressed('help')) openDialog(helpDialog);
      if (Input.pressed('astern')) setGear(-1);
      if (Input.pressed('neutral')) setGear(0);
      if (Input.pressed('ahead')) setGear(1);
      if (Input.pressed('ballastLeft')) ballast.choose(1);
      if (Input.pressed('ballastOff')) ballast.choose(0);
      if (Input.pressed('ballastRight')) ballast.choose(-1);
      if (Input.pressed('up')) setGear(boat.gear + 1);
      if (Input.pressed('down')) setGear(boat.gear - 1);
      if (Input.pressed('sail')) toggleSail('sail');
      if (Input.pressed('jib')) toggleSail('jib');
      if (Input.pressed('mast')) changeMast();
      if (Input.pressed('dock')) moor();
      if (Input.pressed('explore')) sailOut();
      if (Input.pressed('confirm')) castOff();
      // Storm timing stays in real seconds even when sailing is fast-forwarded.
      weather.update(dt, wind.at(boat), boat, autoWeather.checked ? dailyWeather(skyClock.minute()) : undefined);
      const weatherFrame = weather.read();
      // More fixed simulation steps per frame preserve steering and collision checks.
      let first = true;
      Clock.advanceBy(worldClock, dt * gameSpeed, () => {
        if (first) {
          const {x, y} = walker || boat;
          previousPosition = {x, y};
          first = false;
        }
        time += dt;
        wind.update(dt, boat, weatherFrame);
        if (phase === 'sailing' || phase === 'capsized') {
          if (phase === 'sailing') secondsOnWater += dt;
          stepBoat(boat, Input.axis('left', 'right'), dt, world, wind.at(boat));
          if (phase === 'sailing') track.record(boat);
          if (boat.capsized && phase !== 'capsized') {
            phase = 'capsized';
            Input.clear();
            refreshControls();
          }
        }
        if (boat.moored) stepBoat(boat, 0, dt, world);
        wake.update(boat, time);
        propWash.update(boat, time, dt);
        if (phase !== 'welcome') {
          const minute = skyClock.minute();
          skyClock.tick(dt);
          if (skyClock.minute() < minute) dailyWeather = createDailyWeather(++weatherSeed);
          fleet.update(dt, {player: boat, playerFixed: !!walker, minute: skyClock.minute(), sun: skyClock.read().sun,
            weather: weatherFrame, wind});
          trafficView.tick(fleet.boats, time);
        }
        const roosting = birdsRoosting(skyClock.read().sun);
        wildlife.update(dt, boat, roosting);
        crows.update(dt, walker || boat, roosting);
        if (!roosting) storks.update(dt);
        fishRises.update(boat, time);
        if (walker) walk(dt);
      });
    },
    draw({frame, alpha}) {
      const {context} = screen;
      const sky = skyClock.read();
      const conditions = weather.read();
      audio.weather(conditions.rain, conditions.mode === 'storm');
      if (conditions.strike && conditions.strike.id !== heardStrike && conditions.flash > 0) {
        heardStrike = conditions.strike.id;
        audio.thunder(conditions.strike, conditions.time - conditions.strike.time);
      }
      audio.steering(loop.paused ? 0 : boat.steeringJet);
      audio.engine(!loop.paused && boat.engine, boat.gear, boat.engineBoost);
      const sailing = phase === 'sailing' && !loop.paused;
      audio.winches(sailing ? Math.sign(Number(boat.sail) - boat.deployment) : 0,
        sailing ? Math.sign(Number(boat.jib) - boat.jibDeployment) : 0, gameSpeed);
      const renderDensity = surface.density;
      if (cameraScale !== zoomTarget) {
        const now = loop.clock.previous;
        zoomStarted ??= now;
        const progress = reducedMotion.matches ? 1 : Math.min(1, (now - zoomStarted) / zoomDuration);
        // Interpolate magnification by ratio so equal distances feel equally fast.
        cameraScale = progress === 1 ? zoomTarget : zoomFrom * (zoomTarget / zoomFrom) ** ease(progress);
      }
      // Interpolate the camera and its subject together between simulation ticks.
      const blend = gameSpeed < 1 ? Clock.alpha(worldClock) + alpha * gameSpeed : alpha;
      const followView = cameraView(walker || boat, screen, cameraScale, previousPosition, blend);
      const view = panCenter || (walker && followYachtAshore)
        ? cameraView(panCenter ?? boat, screen, cameraScale) : followView;
      const boatPosition = walker ? boat : followView.position;
      const visualBoat = {...boatPosition, y: boatPosition.y - boat.heave};
      const drawFleetOverview = (lakeView, opacity = 1) => {
        context.save();
        context.globalAlpha = opacity;
        for (const vessel of fleet.boats) drawTrafficMarker(context, lakeView.toScreen(vessel), vessel);
        context.restore();
      };
      const widestFollow = zoomLevels[0];
      const overviewOpacity = ease(Math.max(0, Math.min(1,
        (widestFollow - cameraScale) / (widestFollow - overviewBlendEnd))));
      if (overviewOpacity > 0) {
        liveOverview ??= createReliefOverview(width, height, terrain, harbor, world);
      }
      const pickable = wholeLake && cameraScale === overviewFit.scale;
      waypointHint.hidden = !pickable;
      overviewLegend.hidden = !pickable;
      surface.canvas.classList.toggle('pick-destination', pickable);
      surface.canvas.classList.toggle('overview-canvas', overviewOpacity === 1);
      drawnView = view;
      selectionView = undefined;
      if (overviewOpacity === 1) {
        // Once the overview covers the frame, pull back from the subject to the lake centre.
        const pan = ease(Math.max(0, Math.min(1,
          Math.log(overviewBlendEnd / cameraScale) / Math.log(overviewBlendEnd / overviewFit.scale))));
        const lakeView = panCenter ? view : cameraView(overviewFit.center, screen, cameraScale, view.position, pan);
        drawnView = lakeView;
        const marker = lakeView.toScreen(boatPosition);
        boatHit = {left: marker.x - 9, right: marker.x + 9, top: marker.y - 9, bottom: marker.y + 9};
        if (pickable) selectionView = lakeView;
        liveOverview.draw(context, lakeView, 1);
        if (showTrack) track.draw(context, lakeView, boatPosition);
        applyGrade(context, width, height, sky.grade);
        drawRain(context, lakeView, conditions);
        drawFleetOverview(lakeView);
        if (destination) drawDestination(context, lakeView, destination.berth);
        liveOverview.drawLabels(context, lakeView, boatPosition, boat.heading, 1, pan ** 4);
        if (frame % 4 === 1) refreshControls();
        return;
      }
      reflections.clear();
      const mapView = drawTerrain(context, view, terrain, sky, reflections.mask, ground, terrainDensity, refiningTerrain);
      refiningTerrain = cameraScale !== zoomTarget || mapView.refining;
      harbor.draw(context, view, sky);
      harbor.drawWaterMask(reflections.mask, view);
      drawPorts(context, view, reflections.mask);
      const scenery = [];
      terrain.addScenery(scenery, mapView, wind, time, view.scale * renderDensity);
      if (sky.strength) {
        buildingShade.setTransform(1, 0, 0, 1, 0, 0);
        buildingShade.clearRect(0, 0, buildingShade.canvas.width, buildingShade.canvas.height);
        buildingShade.save();
        const shadeScale = view.scale * terrainDensity;
        buildingShade.setTransform(shadeScale, 0, 0, shadeScale, -view.x * shadeScale, -view.y * shadeScale);
        drawBuildingShadows(buildingShade, scenery.filter(item => item.model), sky.strength);
        buildingShade.restore();
        buildingShade.globalCompositeOperation = 'destination-out';
        buildingShade.imageSmoothingEnabled = false;
        buildingShade.drawImage(reflections.mask.canvas, 0, 0, buildingShade.canvas.width, buildingShade.canvas.height);
        buildingShade.globalCompositeOperation = 'source-over';
        context.drawImage(buildingShade.canvas, 0, 0, width, height);
      }
      for (const item of scenery) {
        if (inMarina(item.x, item.anchorY)) continue;
        const art = item.model && sceneryModel(item, view.scale < 3);
        const scale = art ? art.scale : item.art.scale;
        const sprite = art ? art.model.sprite(item.heading, item.heightScale) : item.art.sprite;
        const vertical = item.model ? scale / Voxel.SQUASH : scale;
        reflections.mirror(view, time, wind, item, sprite, scale, vertical, 0.42);
      }
      const yacht = yachtFrame(boat, time, view.scale * renderDensity);
      const boatAt = view.toScreen(visualBoat);
      const spriteScale = yacht.metersPerVoxel * view.scale;
      const {dx, dy, w: spriteW, h: spriteH} = yacht.sprite;
      boatHit = {
        left: boatAt.x + dx * spriteScale - 3, right: boatAt.x + (dx + spriteW) * spriteScale + 3,
        top: boatAt.y + dy * spriteScale / Voxel.SQUASH - 3,
        bottom: boatAt.y + (dy + spriteH) * spriteScale / Voxel.SQUASH + 3,
      };
      const visibleTraffic = trafficView.visible(fleet.boats, view, blend, yachtFrame, time, view.scale * renderDensity,
        sky.sun.elevation < -4 && overviewOpacity < .25);
      for (const {boat: vessel, position, yacht: art} of visibleTraffic) {
        reflections.mirror(view, time, wind, {...position, y: position.y + vessel.heave, anchorY: position.y}, art.reflection,
          art.metersPerVoxel, art.metersPerVoxel / Voxel.SQUASH, .6, {projected: true});
      }
      reflections.mirror(view, time, wind, {...boatPosition, y: boatPosition.y + boat.heave, anchorY: boatPosition.y}, yacht.reflection,
        yacht.metersPerVoxel, yacht.metersPerVoxel / Voxel.SQUASH, 0.65, {projected: true});
      reflections.draw(context);
      drawGustBands(context, view, wind, isWater);
      drawRipples(context, view, time, isWater, sky, wind);
      if (wind.speed > 5.3 || conditions.rain >= .03) {
        reflections.drawWaterEffect(context, layer => {
          drawWindWaves(layer, view, time, wind, sky.sun.elevation > 0);
          if (conditions.rain >= .03) drawRainImpacts(layer, view, conditions);
        });
      }
      if (showTrack && overviewOpacity === 0) track.draw(context, view, boatPosition);
      fishRises.draw(context, view, time);
      wake.draw(context, view, time, isWater);
      trafficView.drawWakes(context, view, visibleTraffic, time, isWater);
      propWash.draw(context, view, time);
      const birds = visibleBirds([...wildlife.birds(), ...crows.birds, ...storks.birds], view);
      drawBirdWater(context, view, birds, time, birdWaterAt);
      drawBerthSpaces(context, view, fleet.moorings);
      const guidePort = boat.moored ? mooredPort : berthNear(boat, 105);
      if (guidePort) drawBerth(context, view, boat, guidePort);
      if (boat.anchor && anchorDrop) {
        const bowEye = yachtBowEye({...boatPosition, heave: boat.heave}, yacht.pose);
        drawAnchor(context, view, bowEye, anchorDrop, time);
      }

      for (const {boat: vessel, position, yacht: art} of visibleTraffic) {
        if (vessel.anchor) {
          drawAnchor(context, view, yachtBowEye(position, art.pose), {...vessel.anchorDrop, born: -Infinity}, time);
        }
        scenery.push({y: position.y, draw: () => drawYacht(context, view, {...position, y: position.y - vessel.heave}, art)});
      }
      scenery.push({y: boatPosition.y, draw: () => drawYacht(context, view, visualBoat, yacht)});
      if (walker) scenery.push({y: followView.position.y, draw: () => drawWalker(context, view, followView.position)});
      const aboveScenery = [];
      for (const bird of birds) {
        if (bird.mode === 'swimming' || (bird.mode === 'resting' && bird.species !== 'crow')
            || ['standing', 'walking', 'feeding'].includes(bird.mode)) {
          scenery.push({y: bird.y, draw: () => drawBird(context, view, bird, birdArt, time)});
        } else {
          aboveScenery.push(bird);
        }
      }
      drawScenery(context, view, scenery);
      for (const bird of aboveScenery) drawBird(context, view, bird, birdArt, time);
      drawWarningTowers(context, view, terrain.surfaceLiftAt, loop.info.time,
        warningRate(wind, conditions, sky.sun.elevation > 0));
      if (overviewOpacity > 0) {
        liveOverview.draw(context, view, overviewOpacity);
        if (showTrack) track.draw(context, view, boatPosition);
      }
      applyGrade(context, view.w, view.h, sky.grade);
      const boatOverlay = {...boatPosition, heading: boat.heading, heel: boat.heel + boat.waveRoll, heave: boat.heave, mastFold: boat.mastFold};
      const lamps = !boat.capsized && sky.sun.elevation < -4 && overviewOpacity < .25
        ? yachtLamps({...boatPosition, heave: boat.heave}, yacht.pose) : null;
      if (lamps) {
        reflections.drawWaterEffect(context, layer => drawBoatLightReflections(layer, view, lamps, time, wind, conditions.rain),
          layer => drawYacht(layer, view, visualBoat, yacht));
      }
      drawRain(context, view, conditions);
      if (lamps) drawBoatLights(context, view, lamps);
      for (const item of visibleTraffic) {
        if (item.lights.length) drawBoatLights(context, view, item.lights);
      }
      if (overviewOpacity > 0) drawFleetOverview(view, overviewOpacity);
      if (destination) drawDestination(context, view, destination.berth);
      if (phase === 'sailing' && !boat.moored && windGuide.checked && overviewOpacity < .25) {
        drawWindGuide(context, view, boatOverlay, wind.at(boat), destination?.berth);
      }
      if (overviewOpacity > 0) liveOverview.drawLabels(context, view, boatPosition, boat.heading, overviewOpacity, 0);
      context.save();
      context.globalAlpha = 1 - overviewOpacity;
      context.fillStyle = '#f5e8ce';
      context.fillRect(view.w - 14 - view.scale * 20, view.h - 13, view.scale * 20, 1);
      context.font = '9px system-ui';
      context.textAlign = 'right';
      context.fillText('20 m', view.w - 14, view.h - 17);
      context.restore();
      if (frame % 4 === 1) {
        refreshControls();
        drawChart(chartBoat(), destination, fleet.boats);
      }
    },
  });

  function openDialog(dialog) {
    if (mapDialog.open || helpDialog.open) return;
    dialog.showModal();
    previousPosition = undefined;
    loop.pause();
  }

  function openChart() {
    drawOverview ??= createChart(element('map-overview'), map, true);
    drawOverview(chartBoat(), destination, fleet.boats);
    refreshTraffic();
    refreshChartBerths(ports.find(port => port.id === destination?.id), Number(berthPicker.value));
    openDialog(mapDialog);
  }

  click('open-map', openChart);
  click('start-port', () => {
    if (phase !== 'welcome' || !destination || destination.id === 'waypoint') return;
    Object.assign(boat, destination.sternTo ? destination.approach.at(-1) : destination.approach[0],
      {heading: destination.berth.heading});
    previousPosition = undefined;
    mapDialog.close();
    castOff();
  });
  click('open-controls', () => openDialog(helpDialog));
  for (const dialog of [mapDialog, helpDialog]) {
    dialog.addEventListener('close', () => {
      Input.clear();
      loop.pause(false);
    });
  }
  element('loading').hidden = true;

  if (new URLSearchParams(location.search).has('debug')) {
    window.mazury = () => ({
      ...boat, phase, walker: walker && {...walker}, time, secondsOnWater, fps: loop.info.fps,
      wholeLake, cameraCenter: drawnView?.position, cameraFollowing: !panCenter && !wholeLake,
      metersPerPixel: 1 / zoomLevels[zoomIndex], cameraScale, hullLength: hull.length,
      berthStatus: berthStatus(boat, berthNear(boat)?.berth), port: (boat.moored ? mooredPort : portNear(boat))?.id,
      sky: skyClock.status(), gameSpeed, wildlife: wildlife.status(), weather: weather.read(),
      wind: {bearing: wind.bearing, knots: wind.knots, gustKnots: wind.gustKnots, automatic: wind.automatic, ...wind.at(boat)},
      crows: crows.status(), fishRises: fishRises.status(),
      storks: storks.birds.map(({x, y, mode, altitude, feed}) => ({x, y, mode, altitude, feed})),
      showTrack, trackPoints: track.length, destination, fleet: fleet.status(),
    });
  }
}

boot().catch(error => {
  element('loading').textContent = 'The lake could not load. Reload to try again.';
  console.error(error);
});
