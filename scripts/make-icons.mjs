// Draws the app icons (a crescent over a twilight horizon) into public/icons without any image library.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size, 1 / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (d, px) => Math.min(1, Math.max(0, 0.5 - d / px));

function art(scale) {
  return (u, v, px) => {
    // twilight sky
    let col = mix([8, 16, 42], [44, 66, 138], Math.pow(v, 1.3));
    const glow = Math.exp(-Math.pow((v - 0.92) / 0.16, 2));
    col = mix(col, [255, 150, 70], glow * 0.75);
    // crescent: big disc minus offset disc
    const cx = 0.5, cy = 0.45;
    const s = (n) => (n - 0.5) / scale + 0.5; // scale about the centre
    const x = s(u), y = s(v);
    const dA = Math.hypot(x - cx, y - cy) - 0.27;
    const dB = Math.hypot(x - (cx + 0.115), y - (cy - 0.07)) - 0.235;
    const crescent = Math.min(smooth(dA, px / scale), smooth(-dB, px / scale));
    col = mix(col, [250, 240, 205], crescent);
    // star
    const dS = Math.hypot(x - 0.7, y - 0.3) - 0.028;
    col = mix(col, [255, 245, 215], smooth(dS, px / scale));
    return [Math.round(col[0]), Math.round(col[1]), Math.round(col[2]), 255];
  };
}

const files = {
  'icon-192.png': png(192, art(1)),
  'icon-512.png': png(512, art(1)),
  'icon-maskable-512.png': png(512, art(0.78)),
  'apple-touch-icon.png': png(180, art(1)),
};
for (const [name, buf] of Object.entries(files)) writeFileSync(new URL(name, OUT), buf);

writeFileSync(
  new URL('icon.svg', OUT),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#08102a"/><stop offset="1" stop-color="#2c428a"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="1" r="0.55"><stop offset="0" stop-color="#ff9646" stop-opacity="0.85"/><stop offset="1" stop-color="#ff9646" stop-opacity="0"/></radialGradient>
    <mask id="cut"><rect width="512" height="512" fill="#fff"/><circle cx="289" cy="194" r="120" fill="#000"/></mask>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#sky)"/>
  <rect width="512" height="512" rx="96" fill="url(#glow)"/>
  <circle cx="256" cy="230" r="138" fill="#faf0cd" mask="url(#cut)"/>
  <circle cx="358" cy="154" r="14" fill="#fff5d7"/>
</svg>
`,
);
console.log('icons written:', Object.keys(files).join(', '), 'icon.svg');
