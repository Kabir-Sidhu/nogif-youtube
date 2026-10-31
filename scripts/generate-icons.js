'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function isInsideRoundedRect(x, y, size, margin, radius) {
  const min = margin;
  const max = size - 1 - margin;
  if (x < min || x > max || y < min || y > max) return false;

  const innerMin = min + radius;
  const innerMax = max - radius;
  if (x >= innerMin && x <= innerMax) return true;
  if (y >= innerMin && y <= innerMax) return true;

  const cx = x < innerMin ? innerMin : innerMax;
  const cy = y < innerMin ? innerMin : innerMax;
  const dx = x - cx;
  const dy = y - cy;
  return (dx * dx) + (dy * dy) <= (radius * radius);
}

function createPngBuffer(size) {
  const rawStride = (size * 4) + 1;
  const rawData = Buffer.alloc(rawStride * size);
  const margin = size >= 48 ? Math.floor(size / 16) : 0;
  const radius = Math.max(2, Math.floor(size / 4));
  const center = (size - 1) / 2;
  const ringOuter = size * 0.32;
  const ringInner = size * 0.21;
  const slashHalfThickness = Math.max(0.9, size * 0.055);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * rawStride;
    rawData[rowOffset] = 0x00;

    for (let x = 0; x < size; x += 1) {
      const pxOffset = rowOffset + 1 + (x * 4);
      if (!isInsideRoundedRect(x, y, size, margin, radius)) {
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
        continue;
      }

      const dx = x - center;
      const dy = y - center;
      const dist = Math.hypot(dx, dy);
      const onRing = dist <= ringOuter && dist >= ringInner;
      const onSlash = dist <= ringOuter && Math.abs(dx + dy) / Math.SQRT2 <= slashHalfThickness;

      if (onRing || onSlash) {
        rawData[pxOffset] = 0xff;
        rawData[pxOffset + 1] = 0xff;
        rawData[pxOffset + 2] = 0xff;
        rawData[pxOffset + 3] = 0xff;
      } else {
        rawData[pxOffset] = 0xcc;
        rawData[pxOffset + 1] = 0x00;
        rawData[pxOffset + 2] = 0x00;
        rawData[pxOffset + 3] = 0xff;
      }
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function generateIcons(outDir = path.resolve(__dirname, '..', 'icons')) {
  fs.mkdirSync(outDir, { recursive: true });
  return [16, 48, 128].map((size) => {
    const filePath = path.join(outDir, `icon-${size}.png`);
    fs.writeFileSync(filePath, createPngBuffer(size));
    return filePath;
  });
}

if (require.main === module) {
  generateIcons();
}

module.exports = { createPngBuffer, generateIcons };
