/* A painted ground (from Slice Drive), kept as square tiles instead of one
 * canvas the size of the world. Worlds can be thousands of px a side, more than many
 * older GPUs take as one texture; a canvas that big sends the browser down a
 * slow path (or off the GPU) every time a piece of it is drawn. Tiles always
 * fit, and only the ones in view are drawn.
 *
 * It also stands in for a 2D context where the whole ground is read or
 * written at once (painting it, baking a shadow into it): createImageData,
 * getImageData and putImageData work across tile edges. */
import * as Voxel from './voxel.js';
const TILE = 512;

export function create(width, height) {
  const columns = Math.ceil(width / TILE), rows = Math.ceil(height / TILE), tiles = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const w = Math.min(TILE, width - c * TILE), h = Math.min(TILE, height - r * TILE), canvas = Voxel.canvas(w, h);
    tiles.push({canvas, context: canvas.getContext('2d'), x: c * TILE, y: r * TILE, w, h});
  }
  /* Every tile that overlaps the rectangle, with the overlap. */
  function each(x, y, w, h, visit) {
    const c0 = Math.max(0, Math.floor(x / TILE)), c1 = Math.min(columns - 1, Math.floor((x + w - 1) / TILE));
    const r0 = Math.max(0, Math.floor(y / TILE)), r1 = Math.min(rows - 1, Math.floor((y + h - 1) / TILE));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const tile = tiles[r * columns + c];
      const ox0 = Math.max(x, tile.x), oy0 = Math.max(y, tile.y);
      const ox1 = Math.min(x + w, tile.x + tile.w), oy1 = Math.min(y + h, tile.y + tile.h);
      if (ox1 > ox0 && oy1 > oy0) visit(tile, ox0, oy0, ox1 - ox0, oy1 - oy0);
    }
  }
  return {
    width, height, tiles, TILE,
    createImageData: (w, h) => tiles[0].context.createImageData(w, h),
    /* Writes an image with its top left at (x, y), split over the tiles under it. */
    putImageData(image, x, y) {
      each(x, y, image.width, image.height, (tile, ox, oy, ow, oh) => {
        tile.context.putImageData(image, x - tile.x, y - tile.y, ox - x, oy - y, ow, oh);
      });
    },
    getImageData(x, y, w, h) {
      const image = this.createImageData(w, h), data = image.data;
      each(x, y, w, h, (tile, ox, oy, ow, oh) => {
        const part = tile.context.getImageData(ox - tile.x, oy - tile.y, ow, oh).data;
        for (let row = 0; row < oh; row++) data.set(part.subarray(row * ow * 4, (row + 1) * ow * 4), ((oy - y + row) * w + ox - x) * 4);
      });
      return image;
    },
    /* Draws the part of the ground in a view; (x, y) is the view's top left on the ground. */
    draw(context, x, y, w, h) {
      each(x, y, w, h, tile => context.drawImage(tile.canvas, tile.x - x, tile.y - y));
    },
    /* Copies a rectangle of the ground into a context at (dx, dy). */
    copy(context, x, y, w, h, dx = 0, dy = 0) {
      each(x, y, w, h, (tile, ox, oy, ow, oh) => context.drawImage(tile.canvas, ox - tile.x, oy - tile.y, ow, oh, dx + ox - x, dy + oy - y, ow, oh));
    },
  };
}

/* Paint every pixel from shade(x, y) → [r, g, b] (alpha 255), tile by tile.
 * For grass, sand, noise and patterns; slow-ish (one call per pixel), so do
 * it while a level loads, not every frame. */
export function paint(ground, shade) {
  for (const tile of ground.tiles) {
    const image = tile.context.createImageData(tile.w, tile.h), data = image.data;
    for (let y = 0; y < tile.h; y++) for (let x = 0; x < tile.w; x++) {
      const rgb = shade(tile.x + x, tile.y + y), at = (y * tile.w + x) * 4;
      data[at] = rgb[0]; data[at + 1] = rgb[1]; data[at + 2] = rgb[2]; data[at + 3] = 255;
    }
    tile.context.putImageData(image, 0, 0);
  }
}
/* Run draw(context) on every tile with the context moved so that world
 * coordinates work: fillRect, arcs, paths and drawImage over tile edges. */
export function drawOn(ground, draw) {
  for (const tile of ground.tiles) {
    const c = tile.context;
    c.save(); c.translate(-tile.x, -tile.y); draw(c); c.restore();
  }
}
export {TILE};

// Quantize elevation above the base plane for drawing. The collision map
// can keep the original horizontal coordinates.
export function createRelief({waterLevel, highestPoint, sliceHeight = 0.75, rise = 0.72, shoreBlend = 5}) {
  return {
    sliceHeight,
    layerSpacing: sliceHeight * rise,
    maxLift: Math.max(0, Math.ceil((highestPoint - waterLevel) * rise)),
    lift(elevation, waterDistance) {
      if (waterDistance >= 0) return 0;
      const inland = Math.min(1, shoreBlend > 0 ? -waterDistance / shoreBlend : 1);
      const height = Math.max(0, elevation - waterLevel) * inland;
      return Math.floor(height / sliceHeight) * sliceHeight * rise;
    },
  };
}

export function writeReliefColumn(image, column, top, foot, tone, strata, mask) {
  const {width, height, data} = image;
  const spacing = Math.max(1, strata);
  for (let row = Math.max(top, 0); row <= Math.min(foot, height - 1); row++) {
    const at = (row * width + column) * 4;
    const depth = row - top;
    const seam = depth % spacing === spacing - 1;
    const shade = depth === 0 ? 0 : 11 + Math.min(12, depth * 1.3) + (seam ? 3 : 0);
    data[at] = tone[0] - shade + (depth ? 4 : 0);
    data[at + 1] = tone[1] - shade - (depth ? 3 : 0);
    data[at + 2] = tone[2] - shade;
    data[at + 3] = 255;
    if (mask) mask[at >> 2] = 0;
  }
}
