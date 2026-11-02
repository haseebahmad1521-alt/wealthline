// Builds public/planet/stars.bin from the Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren 1991,
// public domain; CDS V/50, mirrored at http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz).
// Usage: node scripts/build-stars.mjs path/to/bsc5.dat[.gz]
// Output: little-endian Int16 quadruples per star, brightest first:
//   RA (J2000) as 0…32767 over 0…360° · Dec × 32767/90 · V magnitude × 1000 · B−V × 1000 (missing → 600, sun-like).
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const src = process.argv[2];
if (!src) throw new Error('Usage: node scripts/build-stars.mjs bsc5.dat[.gz]');
let raw = readFileSync(src);
if (raw[0] === 0x1f && raw[1] === 0x8b) raw = gunzipSync(raw);
const col = (line, a, b) => line.slice(a - 1, b).trim(); // 1-based inclusive columns, as in the catalogue's ReadMe

const stars = [];
for (const line of raw.toString('latin1').split('\n')) {
  const raH = col(line, 76, 77);
  const vmag = col(line, 103, 107);
  if (!raH || !vmag) continue; // a few entries (novae, removed objects) have no position or magnitude
  const ra = (Number(raH) + Number(col(line, 78, 79)) / 60 + Number(col(line, 80, 83)) / 3600) * 15;
  const dec = (col(line, 84, 84) === '-' ? -1 : 1) * (Number(col(line, 85, 86)) + Number(col(line, 87, 88)) / 60 + Number(col(line, 89, 90)) / 3600);
  const bv = col(line, 110, 114);
  stars.push({ ra, dec, v: Number(vmag), bv: bv ? Number(bv) : 0.6 });
}
stars.sort((a, b) => a.v - b.v);
const out = new Int16Array(stars.length * 4);
stars.forEach((s, i) => {
  out[i * 4] = Math.round((s.ra / 360) * 32767);
  out[i * 4 + 1] = Math.round((s.dec / 90) * 32767);
  out[i * 4 + 2] = Math.round(s.v * 1000);
  out[i * 4 + 3] = Math.round(s.bv * 1000);
});
writeFileSync(new URL('../public/planet/stars.bin', import.meta.url), Buffer.from(out.buffer));
console.log(`${stars.length} stars, V ${stars[0].v} … ${stars.at(-1).v}`);
