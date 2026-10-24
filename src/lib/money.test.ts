/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { usd } from './format.ts';
import { convertCompact } from './money.ts';

test('USD at rate 1 matches usd()', () => {
  for (const v of [412_300_000_000, 2_500_000_000_000, 7_400_000, 950, -3_200_000_000])
    assert.equal(convertCompact(v, 'USD', 1), usd(v));
});

test('converts and compacts with the currency symbol', () => {
  assert.equal(convertCompact(1_000_000_000_000, 'EUR', 0.8363), '€836.3B');
  assert.equal(convertCompact(1_000_000_000_000, 'GBP', 2), '£2.0T');
});

test('letter symbols are spaced, digits are respected', () => {
  assert.equal(convertCompact(1_000_000_000_000, 'NOK', 8.7), 'kr 8.7T');
  assert.equal(convertCompact(1_000_000_000, 'EUR', 1, 3), '€1.000B');
});

test('negatives keep a real minus sign', () => {
  assert.equal(convertCompact(-2_000_000, 'EUR', 0.5), '−€1.0M');
});
