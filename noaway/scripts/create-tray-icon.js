/**
 * Creates a minimal 16x16 tray icon (trayTemplate.png) for macOS/Windows.
 * Run: node scripts/create-tray-icon.js
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const size = 16;
const crc32 = (data) => {
  let c = 0xffffffff;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let k = n;
    for (let i = 0; i < 8; i++) k = (k & 1) ? (0xedb88320 ^ (k >>> 1)) : (k >>> 1);
    table[n] = k;
  }
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr.writeUInt8(8, 8);  // bit depth
ihdr.writeUInt8(6, 9);  // RGBA
ihdr.writeUInt8(0, 10);
ihdr.writeUInt8(0, 11);
ihdr.writeUInt8(0, 12);

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const chunk = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(chunk), 0);
  return Buffer.concat([len, chunk, crc]);
};

// Template icon per macOS: nero su trasparente (la menu bar lo tinge automaticamente)
const raw = [];
const center = size / 2;
const radius = 5;
for (let y = 0; y < size; y++) {
  raw.push(0); // filter
  for (let x = 0; x < size; x++) {
    const dx = x - center + 0.5, dy = y - center + 0.5;
    const inCircle = dx * dx + dy * dy <= radius * radius;
    const r = 0, g = 0, b = 0, a = inCircle ? 255 : 0;
    raw.push(r, g, b, a);
  }
}
const idatData = zlib.deflateSync(Buffer.from(raw), { level: 9 });
const ihdrChunk = chunk('IHDR', ihdr);
const idatChunk = chunk('IDAT', idatData);
const iendChunk = chunk('IEND', Buffer.alloc(0));

const out = path.join(__dirname, '..', 'assets', 'trayTemplate.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]));
console.log('Created', out);
