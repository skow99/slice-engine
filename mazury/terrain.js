import {Model, Voxel} from '../src/index.js';
import {createBuildingSites, foundationRise, gradeAroundBuilding, sampleBuildingSite} from './building-sites.js';
import {inMarina} from './harbor.js';
import {landCover} from './lake.js';
import {worldBounds} from './lake-world.js';
import {writeSlices} from './relief.js';
import {placeBuildings} from './settlements.js';

const tileSize = 96;
const tileBudget = 36;
const yardTone = [126, 140, 94];
const pathTone = [174, 159, 126];
const stoneTone = [140, 137, 117];
const bedTone = [102, 121, 72];
const flowers = [216, 192, 128];
const treeSpacing = 10;
const {west, north, east, south} = worldBounds;
const width = east - west;
const height = south - north;
const tileColumns = Math.ceil(width / tileSize);
const tileRows = Math.ceil(height / tileSize);
const landColors = {
  [landCover.grass]: [127, 150, 88],
  [landCover.deciduous]: [87, 117, 65],
  [landCover.conifer]: [64, 102, 71],
  [landCover.mixed]: [78, 112, 69],
  [landCover.settlement]: [132, 149, 93],
  [landCover.sand]: [191, 174, 121],
  [landCover.wetland]: [87, 125, 91],
  [landCover.scrub]: [100, 127, 73],
  [landCover.road]: [143, 139, 113],
  [landCover.building]: [133, 147, 96],
  [landCover.garden]: [130, 142, 81],
  [landCover.field]: [173, 165, 96],
  [landCover.ochreField]: [179, 151, 82],
  [landCover.greenField]: [142, 153, 85],
};
const forestSpecies = {
  [landCover.deciduous]: ['birch', 'oak', 'willow', 'birch'],
  [landCover.conifer]: ['pine', 'spruce', 'pine', 'pine'],
  [landCover.mixed]: ['oak', 'pine', 'birch', 'spruce', 'willow'],
  [landCover.scrub]: ['willow', 'birch'],
  [landCover.garden]: ['birch', 'oak', 'cherry'],
};

function noise(x, y, scale) {
  const ax = Math.floor(x / scale);
  const ay = Math.floor(y / scale);
  const u = x / scale - ax;
  const v = y / scale - ay;
  const fx = u * u * (3 - 2 * u);
  const fy = v * v * (3 - 2 * v);
  const tl = Model.hash(ax, ay, scale);
  const tr = Model.hash(ax + 1, ay, scale);
  const bl = Model.hash(ax, ay + 1, scale);
  const br = Model.hash(ax + 1, ay + 1, scale);
  return (tl + (tr - tl) * fx) * (1 - fy) + (bl + (br - bl) * fx) * fy;
}

function band(a, b, t) {
  return a + (b - a) * Math.round(Math.max(0, Math.min(1, t)) * 20) / 20;
}

function groundTone(x, y, cover, z, left, top, depth) {
  const slope = -Math.min(9, (Math.abs(z - left) + Math.abs(z - top)) * 0.8);
  const texture = (noise(x, y, 12) - 0.5) * 22 + (noise(x, y, 1.5) - 0.5) * 9
    + (Model.hash(Math.floor(x * 5), Math.floor(y * 5)) - 0.5) * 8;
  let pattern = 0;
  if (cover >= landCover.field && cover <= landCover.greenField) {
    const angle = cover === landCover.field ? x + y * 0.32 : cover === landCover.ochreField ? y + x * 0.45 : x - y * 0.66;
    pattern = Math.sin(angle * 3.6) * 5;
  }
  const light = slope + texture + pattern + Math.min(12, (z - 118) * 0.20);
  const tone = landColors[cover] || landColors[landCover.grass];
  const marsh = cover === landCover.wetland || cover === landCover.scrub;
  const bankTexture = noise(x, y, 4.5);
  const bank = Math.max(0, 1 + depth / (1.4 + 5 * bankTexture)) * (marsh ? 0.24 : 0.35 + bankTexture * 0.65);
  const damp = Math.max(0, 1 + depth / (0.55 + 0.9 * bankTexture)) * 13;
  const grit = cover === landCover.sand || cover === landCover.road ? (noise(x, y, 0.63) - 0.5) * 12 : 0;
  const detail = light + grit - damp;
  return [tone[0] + detail + bank * 34, tone[1] + detail + bank * 22, tone[2] + detail + bank * 13];
}

function wetColor(x, y, depth, pixels, at) {
  const blend = noise(x, y, 77);
  const shore = depth * (0.78 + 0.42 * blend);
  const shimmer = Math.sin(y * 0.85 + x * 0.12 + blend * 9);
  const texture = (blend - 0.5) * 16 + shimmer * 1.4 + (Model.hash(x, y) - 0.5) * 2;
  const shallow = Math.max(0, 1 - shore / 105) ** 2;
  const edge = Math.max(0, 1 - Math.abs(depth - 1.8) / 3.5) * (2 + 10 * noise(x, y, 1.8));
  const sand = Math.max(0, 1 - shore / 16) * 20;
  const deep = Math.max(0, (shore - 25) / 230);
  pixels[at] = band(34, 27, deep) + shallow * 43 + sand + edge + texture;
  pixels[at + 1] = band(100, 68, deep) + shallow * 40 + sand * 0.65 + edge + texture;
  pixels[at + 2] = band(114, 88, deep) + shallow * 24 + edge + texture;
}

function fillTile(context, x0, y0, w, h, map, resolution, sites) {
  const image = context.createImageData(w * resolution, h * resolution);
  const {width: columns, height: rows, data} = image;
  const normals = resolution > 1 ? new Int16Array(w * h * 2) : null;
  const water = new Uint8Array(columns * rows);
  const center = Math.floor(resolution / 2);
  const halo = Math.ceil(map.relief.maxLift * resolution);
  const strata = Math.round(map.relief.layerSpacing * resolution);
  // Include ground south of the tile whose elevated surface projects into it.
  // Every tile traverses columns in the same order, including at the seams.
  for (let ty = 0; ty < rows + halo; ty++) {
    const y = y0 + (ty + 0.5) / resolution;
    if (y >= south) break;
    const yardRow = sites.row(y);
    for (let tx = 0; tx < columns; tx++) {
      const x = x0 + (tx + 0.5) / resolution;
      const {depth, cover, z} = map.groundAt(x, y);
      if (depth >= 0) {
        if (ty < rows) {
          const at = (ty * columns + tx) * 4;
          wetColor(x, y, depth, data, at);
          data[at + 3] = 255;
          water[at >> 2] = 1;
        }
        continue;
      }
      const grain = yardRow ? Model.hash(Math.floor(x * 4), Math.floor(y * 4), 91) : 0;
      const site = sampleBuildingSite(yardRow, x, y, grain);
      const lift = gradeAroundBuilding(map.relief.lift(z, depth), site) + (site?.foundation ?? 0) * foundationRise;
      const top = ty - Math.round(lift * resolution);
      if (top >= rows) continue;
      const leftZ = map.elevationAt(x - 1.8, y);
      const northZ = map.elevationAt(x, y - 1.8);
      const tone = groundTone(x, y, cover, z, leftZ, northZ, depth);
      if (site) {
        // Let the surveyed ground show through the irregular verge. Gravel,
        // stone, and wall contact are baked into the same lifted land cap.
        const verge = 0.58 + noise(x, y, 1.7) * 0.34;
        const gravel = (grain - 0.5) * 30;
        for (let c = 0; c < tone.length; c++) {
          tone[c] += (yardTone[c] + grain * 10 - tone[c]) * site.garden * verge;
          tone[c] += (pathTone[c] + gravel - tone[c]) * site.path * 0.91;
          tone[c] += (bedTone[c] + grain * 19 - tone[c]) * site.bed * 0.82;
          if (grain > 0.89) tone[c] += (flowers[c] - tone[c]) * site.bed * 0.76;
          tone[c] += (stoneTone[c] + gravel - tone[c]) * site.foundation * (1 - site.path * 0.55);
          tone[c] *= 1 - site.contact * 0.21;
        }
      }
      writeSlices(image, tx, top, ty, tone, strata, water);
      if (normals && tx % resolution === center && ty % resolution === center) {
        const col = Math.floor(tx / resolution);
        const bottom = Math.min(h - 1, Math.floor(ty / resolution));
        for (let row = Math.max(0, Math.floor(top / resolution)); row <= bottom; row++) {
          const at = (row * w + col) * 2;
          const slope = 27 * (1 - (site?.grade ?? 0));
          normals[at] = 128 + Math.max(-120, Math.min(120, Math.round((leftZ - z) * slope)));
          normals[at + 1] = 128 + Math.max(-120, Math.min(120, Math.round((northZ - z) * slope)));
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
  return {
    shades: normals?.some(value => value !== 0) ? bakeShadeMasks(w, h, normals) : null,
    waterMask: water.some(Boolean) ? bakeWaterMask(columns, rows, water) : null,
  };
}

function bakeWaterMask(columns, rows, water) {
  // Interior lake tiles need only a rectangle. Keep full-resolution edges
  // where raised land and water share the same tile.
  if (water.every(Boolean)) return true;
  const canvas = Voxel.canvas(columns, rows);
  const context = canvas.getContext('2d');
  const image = context.createImageData(columns, rows);
  for (let i = 0; i < water.length; i++) image.data[i * 4 + 3] = water[i] * 255;
  context.putImageData(image, 0, 0);
  return canvas;
}

// Low-resolution terrain normals follow the lifted surface. Blend the two
// axes with the current light without rebuilding the surface or its details.
function bakeShadeMasks(w, h, normals) {
  return [0, 1].map(axis => [1, -1].map(sign => {
    const canvas = Voxel.canvas(w, h);
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const value = normals[i * 2 + axis];
      if (!value || value === 128) continue;
      const at = i * 4;
      image.data[at] = image.data[at + 1] = image.data[at + 2] = 128 + sign * (value - 128);
      image.data[at + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }));
}

function paintGroundDetail(context, x0, y0, w, h, map, resolution, sites) {
  const spacing = 2;
  context.save();
  context.scale(resolution, resolution);
  context.translate(-x0, -y0);
  const left = Math.floor((x0 - 2) / spacing);
  const right = Math.ceil((x0 + w + 2) / spacing);
  const top = Math.floor((y0 - 1) / spacing);
  const bottom = Math.ceil((y0 + h + map.relief.maxLift + 2) / spacing);
  for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
    const seed = Model.hash(col, row);
    const x = (col + seed) * spacing;
    const groundY = (row + Model.hash(col, row, 67)) * spacing;
    const {cover, depth, z} = map.groundAt(x, groundY);
    if (depth >= 0) {
      if (groundY < y0 + h + 1 && depth < 18 && seed < 0.42) {
        const length = 0.45 + seed * 1.4;
        if (map.waterDepth(x + length, groundY) > 0) {
          context.fillStyle = '#b9dbbd55';
          context.fillRect(x, groundY, length, 0.17);
        }
      }
      continue;
    }
    const site = sampleBuildingSite(sites.row(groundY), x, groundY, seed);
    if (site?.foundation > 0.2) continue;
    const y = groundY - gradeAroundBuilding(map.relief.lift(z, depth), site);
    if (y < y0 - 1 || y > y0 + h + 2) continue;
    if (cover === landCover.scrub && seed < 0.41) {
      context.fillStyle = '#3f5e436e';
      context.fillRect(x - 1.05, y - 0.2, 2.2, 0.38);
      for (let lobe = -2; lobe <= 2; lobe++) {
        const leaf = Model.hash(col, row, lobe + 20);
        const height = 0.4 + 0.95 * leaf;
        context.fillStyle = ['#496946', '#5b7a48', '#708d50'][Math.floor(leaf * 3)];
        context.fillRect(x + lobe * 0.33 - 0.31, y - height, 0.69, height - 0.12);
        context.fillStyle = '#90a762';
        context.fillRect(x + lobe * 0.33 - 0.12, y - height - 0.14, 0.31, 0.25);
      }
    } else if (depth > -19 && seed < 0.57 && cover !== landCover.road && cover !== landCover.sand
        && !(cover >= landCover.field && cover <= landCover.greenField) && noise(x, groundY, 11) > 0.31) {
      context.fillStyle = '#344f35';
      context.fillRect(x - 0.5, y - 0.17, 1.2, 0.22);
      for (let blade = 0; blade < 4; blade++) {
        const bx = x + (blade - 1.5) * 0.27;
        const tip = 0.35 + Model.hash(col, row, blade) * 0.95;
        context.fillStyle = ['#4d633a', '#6b8044', '#a2a95c', '#788c4c'][blade];
        context.fillRect(bx, y - tip, 0.17, tip);
        if (blade === 1 && seed < 0.21) {
          context.fillStyle = '#7f6142';
          context.fillRect(bx - 0.045, y - tip - 0.14, 0.24, 0.28);
        }
      }
    } else if (cover === landCover.road || cover === landCover.sand || depth > -5 || site?.path > 0.38) {
      context.fillStyle = seed < 0.65 ? '#d1c699b0' : '#777c60aa';
      context.fillRect(x, y, 0.27 + seed * 0.35, 0.22);
    } else if (cover >= landCover.field && cover <= landCover.greenField && seed < 0.88) {
      context.fillStyle = cover === landCover.greenField ? '#9cae6b' : '#d1b474';
      context.fillRect(x, y - 0.23, 0.2, 0.24);
      context.fillRect(x + 0.32, y - 0.16, 0.15, 0.17);
    } else if ([landCover.grass, landCover.garden, landCover.settlement, landCover.building].includes(cover) && seed < 0.78) {
      context.fillStyle = '#4d68396e';
      context.fillRect(x - 0.31, y - 0.1, 0.73, 0.19);
      context.fillStyle = seed > 0.36 ? '#6d894e' : '#a3ad67';
      context.fillRect(x, y - 0.47, 0.19, 0.47);
      context.fillRect(x - 0.29, y - 0.28, 0.17, 0.23);
      context.fillRect(x + 0.26, y - 0.32, 0.15, 0.26);
      if (seed < 0.25 && noise(x, groundY, 4) > 0.51) {
        context.fillStyle = seed < 0.08 ? '#e4c67d' : '#e2dbaf';
        context.fillRect(x - 0.04, y - 0.56, 0.25, 0.21);
        context.fillRect(x - 0.33, y - 0.36, 0.22, 0.18);
      }
    }
  }
  context.restore();
}

export function paintLake(map, cottages, treeArt) {
  const tiles = new Map();
  const overviewTiles = new Map();
  const treesByTile = new Map();
  const {buildings, nearBuilding} = placeBuildings(map, cottages);
  const sites = createBuildingSites(buildings, map);
  const buildingsByTile = new Map();
  for (const building of buildings) {
    const key = Math.floor((building.anchorY - north) / tileSize) * tileColumns + Math.floor((building.x - west) / tileSize);
    if (!buildingsByTile.has(key)) buildingsByTile.set(key, []);
    buildingsByTile.get(key).push(building);
  }

  function getTile(col, row, resolution) {
    const index = row * tileColumns + col;
    const key = index * 8 + resolution;
    const cache = resolution === 1 ? overviewTiles : tiles;
    let tile = cache.get(key);
    if (tile) {
      cache.delete(key);
      cache.set(key, tile);
      return tile;
    }
    const x = west + col * tileSize;
    const y = north + row * tileSize;
    const w = Math.min(tileSize, east - x);
    const h = Math.min(tileSize, south - y);
    const canvas = Voxel.canvas(w * resolution, h * resolution);
    const context = canvas.getContext('2d');
    const layers = fillTile(context, x, y, w, h, map, resolution, sites);
    if (resolution >= 4) paintGroundDetail(context, x, y, w, h, map, resolution, sites);
    tile = {x, y, w, h, canvas, ...layers};
    cache.set(key, tile);
    if (tiles.size > tileBudget) tiles.delete(tiles.keys().next().value);
    return tile;
  }

  function getTrees(index, col, row) {
    if (treesByTile.has(index)) return treesByTile.get(index);
    const x = west + col * tileSize;
    const y = north + row * tileSize;
    const w = Math.min(tileSize, east - x);
    const h = Math.min(tileSize, south - y);
    const random = Model.random(751 + index);
    const trees = [];
    for (let tx = 0; tx < w; tx += treeSpacing) for (let ty = 0; ty < h; ty += treeSpacing) {
      const sx = x + Math.min(w - 1, tx + Math.floor(random() * treeSpacing));
      const sy = y + Math.min(h - 1, ty + Math.floor(random() * treeSpacing));
      const cover = map.coverAt(sx, sy);
      const species = forestSpecies[cover] || (cover === landCover.settlement ? forestSpecies[landCover.garden] : null);
      if (!species) continue;
      const density = cover === landCover.settlement ? 0.25 : cover === landCover.scrub || cover === landCover.garden ? 0.32 : 0.74;
      if (random() > density || nearBuilding(sx, sy) || map.waterDepth(sx, sy) > -4) continue;
      const name = species[Math.floor(random() * species.length)];
      const lift = map.reliefAt(sx, sy);
      trees.push(treeArt.plant(name, Math.floor(random() * 3), sx, sy, sy - lift));
    }

    treesByTile.set(index, trees);
    return trees;
  }

  function forVisible(camera, margin, callback) {
    const left = Math.max(0, Math.floor((camera.viewX - west - margin) / tileSize));
    const right = Math.min(tileColumns - 1, Math.floor((camera.viewX - west + camera.viewW + margin) / tileSize));
    const top = Math.max(0, Math.floor((camera.viewY - north - margin) / tileSize));
    const bottom = Math.min(tileRows - 1, Math.floor((camera.viewY - north + camera.viewH + margin) / tileSize));
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) callback(col, row);
  }

  return {
    surfaceLiftAt(x, y) {
      const depth = map.waterDepth(x, y);
      if (depth >= 0) return 0;
      const site = sampleBuildingSite(sites.row(y), x, y, 0.5);
      return gradeAroundBuilding(map.relief.lift(map.elevationAt(x, y), depth), site)
        + (site?.foundation ?? 0) * foundationRise;
    },
    treesNear({x, y}, radius) {
      const nearby = [];
      forVisible({viewX: x - radius, viewY: y - radius, viewW: radius * 2, viewH: radius * 2}, 0, (col, row) => {
        const index = row * tileColumns + col;
        for (const tree of getTrees(index, col, row)) {
          if (Math.hypot(tree.x - x, tree.anchorY - y) <= radius && !inMarina(tree.x, tree.anchorY)) nearby.push(tree);
        }
      });
      return nearby;
    },
    draw(context, camera, sky, mask) {
      const resolution = camera.resolution ?? 2;
      let refining = false;
      let baked = false;
      forVisible(camera, 0, (col, row) => {
        const key = (row * tileColumns + col) * 8;
        const missing = camera.progressive && !tiles.has(key + resolution);
        // Keep a zoom frame moving while the new view fills in at full detail.
        const defer = missing && baked;
        const tile = defer
          ? tiles.get(key + 6) ?? tiles.get(key + 4) ?? tiles.get(key + 2) ?? getTile(col, row, 1)
          : getTile(col, row, resolution);
        refining ||= defer;
        baked ||= missing;
        const x = tile.x - camera.viewX;
        const y = tile.y - camera.viewY;
        context.drawImage(tile.canvas, x, y, tile.w, tile.h);
        if (mask && tile.waterMask) {
          if (tile.waterMask === true) mask.fillRect(x, y, tile.w, tile.h);
          else mask.drawImage(tile.waterMask, x, y, tile.w, tile.h);
        }
        if (!tile.shades || !sky?.body || !sky.strength) return;
        context.save();
        context.globalCompositeOperation = 'soft-light';
        context.imageSmoothingEnabled = true;
        for (const [axis, direction] of [sky.body.x, sky.body.y].entries()) {
          context.globalAlpha = Math.abs(direction) * sky.strength * 0.85;
          context.drawImage(tile.shades[axis][direction < 0 ? 1 : 0], x, y, tile.w, tile.h);
        }
        context.restore();
      });
      return refining;
    },
    addScenery(scene, camera, wind, time, pixelsPerMeter) {
      forVisible(camera, camera.margin + map.relief.maxLift, (col, row) => {
        const index = row * tileColumns + col;
        for (const item of getTrees(index, col, row)) {
          if (!camera.near(item.x, item.y) || inMarina(item.x, item.anchorY)) continue;
          const art = treeArt.frame(item, wind, time, pixelsPerMeter);
          scene.push({...item, art});
        }
        for (const item of buildingsByTile.get(index) || []) if (camera.near(item.x, item.y)) scene.push(item);
      });
    },
  };
}
