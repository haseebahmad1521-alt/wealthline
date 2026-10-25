/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bubblePath, R } from './bubble-path.ts';

test('corners and tail keep their size when the bubble grows (9-patch)', () => {
  const corners = (d: string) => d.match(/A[^A-Z]+/g);
  const small = bubblePath(200, 80, 44);
  const big = bubblePath(560, 400, 44);
  assert.deepEqual(corners(small)!.map((a) => a.split(' ')[0]), corners(big)!.map((a) => a.split(' ')[0]));
  assert.equal(corners(small)!.length, 4);
  // Same tail curves, whatever the size.
  const tail = (d: string) => d.match(/C[^CHA]+/g)!.join();
  assert.equal(tail(small), tail(big));
});

test('tail stays clear of the rounded corners', () => {
  const tipX = (d: string) => Number(d.match(/ ([\d.]+),0C/)![1]);
  assert.ok(tipX(bubblePath(120, 80, 0)) >= R);
  assert.ok(tipX(bubblePath(120, 80, 999)) <= 120 - R);
});
