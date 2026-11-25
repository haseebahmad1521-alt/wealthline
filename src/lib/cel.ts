/**
 * The pixel-art look for AI avatars (owner, Nov 25): computed once per portrait on plain RGBA pixels, then cached as an
 * image, so nothing filters live in the app (owner: "cached, not a live filter"). A slight ink on strong edges first
 * (difference of Gaussians on luminance, at full resolution so thin lines survive), then blocks of `GRID`×`GRID` cells
 * whose shadows are lifted toward a dusk blue instead of near-black, snapped to a fixed palette with a light dither.
 */
export const GRID = 32;
/** Dusk blues for the shadows, purples and warm tones that sit under the orange→purple wash, then light tones. */
export const PALETTE: readonly (readonly [number, number, number])[] = [
  [0x22, 0x2c, 0x5c], [0x33, 0x40, 0x80], [0x4b, 0x5f, 0xa8], [0x6f, 0x8c, 0xd0],
  [0x4a, 0x32, 0x7a], [0x6e, 0x4a, 0xb8], [0x8f, 0x6b, 0xff], [0x8a, 0x3d, 0x7e],
  [0xc2, 0x56, 0x9e], [0xb0, 0x5e, 0x5e], [0xe0, 0x82, 0x6a], [0xff, 0x9a, 0x4d],
  [0xf2, 0xb8, 0x96], [0xff, 0xdc, 0xbe], [0xb9, 0xc4, 0xe8], [0xf4, 0xf2, 0xfa],
];
/** Where shadows and ink head: a blue a little lighter than the darkest palette entry, never black. */
const SHADOW = [0x2a, 0x36, 0x6e];
/** 4×4 ordered dither, centred on zero, about ±9 levels: enough to break up banding without visible noise. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 15 - 0.5) * 18);

function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(r * 2 + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r];
      tmp[y * w + x] = v;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r];
      out[y * w + x] = v;
    }
  return out;
}

/** Turns `data` (RGBA, `w`×`h`) into palettized pixel art in place, alpha kept. Edge widths scale with the image. */
export function pixelArt(data: Uint8ClampedArray, w: number, h: number, grid = GRID) {
  const n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  const near = blur(lum, w, h, Math.max(0.5, w * 0.004));
  const wide = blur(lum, w, h, Math.max(1, w * 0.011));
  const rgb = [0, 0, 0];
  for (let gy = 0; gy < grid; gy++)
    for (let gx = 0; gx < grid; gx++) {
      const x0 = Math.round((gx * w) / grid), x1 = Math.round(((gx + 1) * w) / grid);
      const y0 = Math.round((gy * h) / grid), y1 = Math.round(((gy + 1) * h) / grid);
      const count = (x1 - x0) * (y1 - y0);
      if (!count) continue;
      rgb.fill(0);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = y * w + x;
          // Slight ink: at most 45% of the way to the shadow blue, so edges read without heavy outlines.
          const ink = 0.45 * Math.min(1, Math.max(0, 12 * (wide[i] - near[i]) - 0.4));
          for (let c = 0; c < 3; c++) rgb[c] += data[i * 4 + c] + (SHADOW[c] - data[i * 4 + c]) * ink;
        }
      for (let c = 0; c < 3; c++) rgb[c] /= count;
      // Tone-map the shadows: the darker the cell (below 35% luminance), the more it takes on the lighter blue.
      const l = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      const lift = Math.max(0, 1 - l / 0.35) * 0.8;
      const d = BAYER[(gy % 4) * 4 + (gx % 4)];
      for (let c = 0; c < 3; c++) rgb[c] += (SHADOW[c] - rgb[c]) * lift + d;
      let best = PALETTE[0];
      let bestD = Infinity;
      for (const p of PALETTE) {
        // Weighted RGB distance: close enough to perceptual for 16 colours, and cheap.
        const dist = 2 * (p[0] - rgb[0]) ** 2 + 4 * (p[1] - rgb[1]) ** 2 + 3 * (p[2] - rgb[2]) ** 2;
        if (dist < bestD) [bestD, best] = [dist, p];
      }
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) data[(y * w + x) * 4 + c] = best[c];
    }
}
