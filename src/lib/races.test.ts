import assert from 'node:assert/strict';
import test from 'node:test';

import { MONTH_WEEKS, mixVariance, normalCdf, oddsText, overtakeChance, passText, type Covariance } from './races.ts';

// Two companies: weekly variance 0.0016 (4% swings) and 0.0009 (3%), covariance 0.0006.
const c: Covariance = { ids: ['x', 'y'], cov: [0.0016, 0.0006, 0.0009], calibration: { z80: 1.2816, normal: 1.2816 } };

test('the variance of a dollar mix uses each pair once, both ways', () => {
  assert.equal(mixVariance(new Map([['x', 100]]), c), 16);
  assert.ok(Math.abs(mixVariance(new Map([['x', 100], ['y', -100]]), c)! - (16 + 9 - 12)) < 1e-9);
  assert.equal(mixVariance(new Map([['z', 100]]), c), null);
});

test('the normal distribution is right where it matters', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalCdf(-1.2816) - 0.1) < 1e-4);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
});

test('overtake chance: 2·Φ(−gap/σ); shared stakes cancel; no stakes, no chance', () => {
  const sigma = Math.sqrt(16 * MONTH_WEEKS);
  const p = overtakeChance(sigma, new Map([['x', 100]]), new Map(), c)!;
  assert.ok(Math.abs(p - 2 * normalCdf(-1)) < 1e-9);
  // The same stake on both sides doesn't move the gap.
  assert.equal(overtakeChance(5, new Map([['x', 100]]), new Map([['x', 100]]), c), null);
  assert.equal(overtakeChance(5, new Map(), new Map(), c), null);
  // A tiny gap is near certain to be crossed; a huge one almost never.
  assert.ok(overtakeChance(0.01, new Map([['x', 100]]), new Map(), c)! > 0.99);
  assert.ok(overtakeChance(1000, new Map([['x', 100]]), new Map(), c)! < 0.01);
  // A calibrated narrower width lowers the chance.
  const narrow = { ...c, calibration: { z80: 1.2, normal: 1.2816 } };
  assert.ok(overtakeChance(sigma, new Map([['x', 100]]), new Map(), narrow)! < p);
});

test('odds read as words, without false precision', () => {
  assert.equal(oddsText(0.005), 'under 1 in 100');
  assert.equal(oddsText(0.24), 'about 1 in 4');
  assert.equal(oddsText(0.6), 'more likely than not');
  assert.equal(oddsText(0.95), 'very likely');
  assert.equal(passText(0.95), 'a pass within a month is very likely');
  assert.equal(passText(0.24), 'about 1 in 4 chance of a pass within a month');
});
