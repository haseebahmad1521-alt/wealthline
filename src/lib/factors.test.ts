import assert from 'node:assert/strict';
import test from 'node:test';

import { fitCompany, ols, residualize, shrink, stressWeeks, weekKey, weeklyReturns, type Bar, type Fit } from '../../supabase/functions/_shared/factors.ts';

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

test('weights favour recent weeks; equal weights match plain least squares', () => {
  const r = rng(3);
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < 300; i++) {
    const a = r() * 0.04;
    X.push([a]);
    y.push((i < 150 ? 0.5 : 1.5) * a + r() * 0.002); // the relationship changed halfway
  }
  const plain = ols(X, y)!;
  const same = ols(X, y, X.map(() => 1))!;
  assert.ok(Math.abs(plain.beta[0] - same.beta[0]) < 1e-12);
  assert.ok(Math.abs(plain.se[0] - same.se[0]) < 1e-12);
  const recent = ols(X, y, X.map((_, i) => Math.pow(0.5, (299 - i) / 20)))!;
  assert.ok(recent.beta[0] > 1.4, String(recent.beta[0])); // close to the recent 1.5
  // On a steady relationship, down-weighting old weeks leaves fewer effective weeks: a wider error.
  const Xs = X.map((x) => x);
  const ys = X.map((x, i) => 1.0 * x[0] + ((i * 7919) % 13) / 13000 - 0.0005);
  assert.ok(ols(Xs, ys, X.map((_, i) => Math.pow(0.5, (299 - i) / 20)))!.se[0] > ols(Xs, ys)!.se[0]);
});

test('shrinkage pulls noisy estimates to their peers and leaves precise ones', () => {
  const fit = (b: number, se: number): Fit => ({ beta: { market: b, oil: 0, china: 0, usd: 0, sector: 0 }, se: { market: se, oil: 0, china: 0, usd: 0, sector: 0 }, r2: 0.3, n: 150, sd: 0.03 });
  const out = shrink([
    { id: 'a', sector: 'x', fit: fit(1.0, 0.05) },
    { id: 'b', sector: 'x', fit: fit(1.1, 0.05) },
    { id: 'c', sector: 'x', fit: fit(0.9, 0.05) },
    { id: 'noisy', sector: 'x', fit: fit(-0.5, 1.0) },
  ]);
  assert.ok(Math.abs(out.get('a')!.beta.market - 1.0) < 0.05);
  assert.ok(out.get('noisy')!.beta.market > 0.5, String(out.get('noisy')!.beta.market));
  assert.ok(out.get('noisy')!.se.market < 1.0);
});

test('crisis weeks are the worst fifth for the market', () => {
  const m = new Map(Array.from({ length: 10 }, (_, i) => [`W${i}`, i - 5]));
  assert.deepEqual([...stressWeeks(m)].sort(), ['W0', 'W1']);
});
