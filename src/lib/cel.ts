/**
 * The cel-shaded look for AI avatars (owner, Nov 2): computed once per portrait on plain RGBA pixels, then cached as an
 * image, so nothing filters live in the app (owner: "cached, not a live filter"). A light sharpen and a gentle lift of
 * the mid-tones (gamma, so the whites never clip), 60% saturation, five tones, and dark ink where the picture has strong
 * edges (difference of Gaussians on luminance). Edges come from the photo itself; a busy background can ink too.
 */
const TONES = [0.06, 0.3, 0.55, 0.8, 0.96];
const INK = [0x16, 0x0f, 0x24];

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

/** Cel-shades `data` (RGBA, `w`×`h`) in place. Line widths scale with the image, so it looks the same at any size. */
export function celShade(data: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const sharp = new Float32Array(n * 3);
  const lum = new Float32Array(n);
  const at = (x: number, y: number, c: number) => data[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4 + c] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      for (let c = 0; c < 3; c++) {
        const v = 2.4 * at(x, y, c) - 0.35 * (at(x - 1, y, c) + at(x + 1, y, c) + at(x, y - 1, c) + at(x, y + 1, c));
        sharp[i * 3 + c] = Math.min(1, Math.max(0, v));
      }
      lum[i] = 0.2126 * sharp[i * 3] + 0.7152 * sharp[i * 3 + 1] + 0.0722 * sharp[i * 3 + 2];
    }
  const near = blur(lum, w, h, Math.max(0.5, w * 0.004));
  const wide = blur(lum, w, h, Math.max(1, w * 0.011));
  for (let i = 0; i < n; i++) {
    const g = [0, 1, 2].map((c) => Math.pow(sharp[i * 3 + c], 0.87));
    const l = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
    const ink = Math.min(1, Math.max(0, 16 * (wide[i] - near[i]) - 0.6));
    for (let c = 0; c < 3; c++) {
      const s = l + (g[c] - l) * 0.6;
      const tone = TONES[Math.min(4, Math.floor(s * 5))] * 255;
      data[i * 4 + c] = tone + (INK[c] - tone) * ink;
    }
  }
}
