/* A minimal PNG writer and reader for tools (Node only, no dependencies):
 * 8-bit RGBA, no interlacing. Enough for slice sheets. */
import {deflateSync, inflateSync, crc32} from 'node:zlib';

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 8 + data.length);
  return out;
}
export function encodePNG(rgba, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; // 8 bits, RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/* Reads 8-bit RGBA or RGB PNGs (what most editors save). */
export function decodePNG(buffer) {
  let at = 8, width = 0, height = 0, type = 0, depth = 0;
  const parts = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at), name = buffer.toString('ascii', at + 4, at + 8), data = buffer.subarray(at + 8, at + 8 + length);
    if (name === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; if (data[12]) throw new Error('interlaced PNGs are not supported'); }
    if (name === 'IDAT') parts.push(data);
    at += 12 + length;
  }
  if (depth !== 8 || (type !== 6 && type !== 2)) throw new Error('only 8-bit RGBA or RGB PNGs are supported');
  const channels = type === 6 ? 4 : 3, stride = width * channels, raw = inflateSync(Buffer.concat(parts));
  const pixels = new Uint8ClampedArray(width * height * 4), line = new Uint8Array(stride), previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0, b = previous[i], c = i >= channels ? previous[i - channels] : 0;
      let value = row[i];
      if (filter === 1) value += a; else if (filter === 2) value += b; else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = value & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      pixels[o] = line[x * channels]; pixels[o + 1] = line[x * channels + 1]; pixels[o + 2] = line[x * channels + 2]; pixels[o + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    previous.set(line);
  }
  return {width, height, data: pixels};
}
