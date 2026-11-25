/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GRID, PALETTE, pixelArt } from './cel.ts';

const inPalette = (d: Uint8ClampedArray, i: number) => PALETTE.some((p) => p[0] === d[i] && p[1] === d[i + 1] && p[2] === d[i + 2]);

test('every pixel lands on the palette, cells are flat, and alpha is kept', () => {
  const w = 64;
  const d = new Uint8ClampedArray(w * w * 4);
  for (let i = 0; i < w * w; i++) [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]] = [(i * 7) % 256, (i * 3) % 256, (i * 11) % 256, 200];
  pixelArt(d, w, w);
  const cell = w / GRID;
  for (let i = 0; i < w * w; i++) {
    assert.ok(inPalette(d, i * 4));
    assert.equal(d[i * 4 + 3], 200);
    const x = i % w, y = Math.floor(i / w);
    const first = ((y - (y % cell)) * w + (x - (x % cell))) * 4;
    assert.equal(d[i * 4], d[first]);
  }
});

test('black becomes a dusk blue, never black', () => {
  const d = new Uint8ClampedArray(32 * 32 * 4);
  pixelArt(d, 32, 32);
  for (let i = 0; i < d.length; i += 4) {
    assert.ok(d[i + 2] > d[i] && d[i + 2] >= 0x5c, `pixel ${d[i]},${d[i + 1]},${d[i + 2]}`);
  }
});

test('white stays the lightest tone', () => {
  const d = new Uint8ClampedArray(32 * 32 * 4).fill(255);
  pixelArt(d, 32, 32);
  assert.deepEqual([d[0], d[1], d[2]], [0xf4, 0xf2, 0xfa]);
});
