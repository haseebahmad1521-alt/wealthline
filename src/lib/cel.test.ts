/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { celShade } from './cel.ts';

const TONES = new Set([0.06, 0.3, 0.55, 0.8, 0.96].map((t) => Math.round(t * 255)));

test('a flat image becomes one of the five tones, with no ink and the alpha kept', () => {
  const w = 16;
  const d = new Uint8ClampedArray(w * w * 4).fill(140);
  for (let i = 3; i < d.length; i += 4) d[i] = 200;
  celShade(d, w, w);
  assert.ok(TONES.has(d[0]));
  assert.ok(d.every((v, i) => (i % 4 === 3 ? v === 200 : v === d[0])));
});

test('whites stay white-ish (the lift never clips past the top tone)', () => {
  const d = new Uint8ClampedArray(8 * 8 * 4).fill(255);
  celShade(d, 8, 8);
  assert.equal(d[0], Math.round(0.96 * 255));
});

test('a dark mark on a light field gets inked darker than its tone', () => {
  const w = 64;
  const d = new Uint8ClampedArray(w * w * 4).fill(230);
  for (let y = 28; y < 36; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) d[(y * w + x) * 4 + c] = 40;
  celShade(d, w, w);
  const mid = (32 * w + 32) * 4;
  assert.ok(d[mid] < Math.round(0.3 * 255), `centre ${d[mid]}`);
  assert.equal(d[(2 * w + 32) * 4], Math.round(0.96 * 255));
});
