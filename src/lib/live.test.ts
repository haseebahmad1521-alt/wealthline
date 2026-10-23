/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FRESH_MS, HORIZON_MS, interpolate, live } from './live.ts';

const MIN = 60_000;
const now = 1_000 * MIN;

test('no data at all is "none", never a made-up number', () => {
  assert.deepEqual(live([], null, now), { status: 'none', value: null, observedAt: null, projection: null });
});

test('old observations fall back to the latest dated value as stale', () => {
  const r = live([{ t: now - FRESH_MS - 1, v: 100 }], { t: now - 5 * MIN * 1000, v: 90 }, now);
  assert.equal(r.status, 'stale');
  assert.equal(r.value, 90);
});

test('a single fresh observation is shown as observed, not projected', () => {
  const r = live([{ t: now - 2 * MIN, v: 100 }], null, now);
  assert.equal(r.status, 'observed');
  assert.equal(r.value, 100);
});

test('two fresh observations project along their trend', () => {
  const r = live([{ t: now - 20 * MIN, v: 100 }, { t: now - 10 * MIN, v: 110 }], null, now);
  assert.equal(r.status, 'projected');
  assert.equal(r.value, 120); // +1/min for 10 min
});

test('projection stops at the horizon', () => {
  const last = now - 19 * MIN;
  const r = live([{ t: last - 10 * MIN, v: 100 }, { t: last, v: 110 }], null, now);
  assert.equal(r.projection?.to.t, last + HORIZON_MS);
  assert.equal(r.value, 125);
});

test('observations too far apart give no trend', () => {
  const r = live([{ t: now - 200 * MIN, v: 50 }, { t: now - 1 * MIN, v: 110 }], null, now);
  assert.equal(r.status, 'observed');
});

test('interpolate is linear and refuses to extrapolate', () => {
  const pts = [{ t: 0, v: 0 }, { t: 10, v: 100 }];
  assert.equal(interpolate(pts, 5), 50);
  assert.equal(interpolate(pts, 11), null);
});
