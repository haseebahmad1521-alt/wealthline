import assert from 'node:assert/strict';
import test from 'node:test';

import { fitCompany, ols, residualize, weekKey, weeklyReturns, type Bar } from '../../supabase/functions/_shared/factors.ts';

// Deterministic pseudo-random numbers, so the test data is the same every run.
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
}

test('weeks line up across exchanges and returns skip gaps', () => {
  assert.equal(weekKey(Date.UTC(2026, 10, 16) / 1000), '2026-W47'); // a Monday
  assert.equal(weekKey(Date.UTC(2026, 10, 20) / 1000), '2026-W47'); // the Friday of the same week
  const day = 86400;
  const bars: Bar[] = [0, 7, 14, 35, 42].map((d, i) => ({ t: 1_700_000_000 + d * day, c: 100 * (1 + i / 10) }));
  const r = weeklyReturns(bars);
  assert.equal(r.size, 3); // the 21-day gap is skipped
});

test('least squares recovers known sensitivities, with small errors', () => {
  const r = rng(7);
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < 400; i++) {
    const a = r() * 0.04;
    const b = r() * 0.04;
    X.push([a, b]);
    y.push(0.001 + 1.2 * a - 0.5 * b + r() * 0.01);
  }
  const fit = ols(X, y)!;
  assert.ok(Math.abs(fit.beta[0] - 1.2) < 0.05);
  assert.ok(Math.abs(fit.beta[1] + 0.5) < 0.05);
  assert.ok(fit.se[0] > 0 && fit.se[0] < 0.05);
  assert.ok(fit.r2 > 0.8);
});

test('a company fit: market raw, other factors with the market taken out', () => {
  const r = rng(11);
  const weeks = Array.from({ length: 150 }, (_, i) => `W${i}`);
  const market = new Map(weeks.map((w) => [w, r() * 0.05]));
  // Oil moves partly with the market; its own part is what the company responds to.
  const oilOwn = new Map(weeks.map((w) => [w, r() * 0.08]));
  const oil = new Map(weeks.map((w) => [w, 0.6 * market.get(w)! + oilOwn.get(w)!]));
  const oilResid = residualize(oil, market);
  const company = new Map(weeks.map((w) => [w, 0.9 * market.get(w)! + 0.4 * oilOwn.get(w)! + r() * 0.01]));
  const fit = fitCompany(company, { market, oil: oilResid, china: null, usd: null, sector: null })!;
  assert.ok(Math.abs(fit.beta.market - 0.9) < 0.1, String(fit.beta.market));
  assert.ok(Math.abs(fit.beta.oil - 0.4) < 0.08, String(fit.beta.oil));
  assert.equal(fit.beta.china, 0);
  assert.equal(fit.n, 150);
  assert.equal(fitCompany(new Map(weeks.slice(0, 20).map((w) => [w, 0])), { market, oil: null, china: null, usd: null, sector: null }), null);
});
