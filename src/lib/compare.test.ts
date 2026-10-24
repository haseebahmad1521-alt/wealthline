/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { growth, indexed, pctDiff, recordedTimes, valueAt } from './compare.ts';

test('pctDiff is relative to the second value', () => {
  assert.equal(pctDiff(150, 100), 50);
  assert.equal(pctDiff(50, 100), -50);
  assert.equal(pctDiff(1, 0), null);
});

test('growth needs two recorded values', () => {
  assert.equal(growth([{ t: 0, v: 100 }]), null);
  assert.equal(growth([{ t: 0, v: 100 }, { t: 1, v: 110 }]), 10);
});

test('indexed starts at 0%', () => {
  assert.deepEqual(indexed([{ t: 0, v: 200 }, { t: 1, v: 300 }]), [{ t: 0, v: 0 }, { t: 1, v: 50 }]);
});

test('valueAt never interpolates', () => {
  const s = [{ t: 10, v: 1 }, { t: 20, v: 3 }];
  assert.equal(valueAt(s, 5), null);
  assert.equal(valueAt(s, 15), 1);
  assert.equal(valueAt(s, 20), 3);
});

test('recordedTimes merges and sorts', () => {
  assert.deepEqual(recordedTimes([[{ t: 3, v: 0 }, { t: 1, v: 0 }], [{ t: 1, v: 0 }, { t: 2, v: 0 }]]), [1, 2, 3]);
});
