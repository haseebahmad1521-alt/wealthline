import assert from 'node:assert/strict';
import test from 'node:test';

import { drivers, revenuePlaces, typicalMonth } from './drivers.ts';
import { MONTH_WEEKS } from './races.ts';

const fit = (market: number, oil: number) => ({ beta: { market, oil, china: 0, usd: -0.5, sector: 0 }, se: {} });

test('stakes move by value × sensitivity for a 10% rise, largest first', () => {
  const fits = new Map([['a', fit(1.5, 0.2)], ['b', fit(0.8, -0.4)]]);
  const r = drivers([{ companyId: 'a', value: 100 }, { companyId: 'b', value: 50 }, { companyId: 'c', value: 30 }], fits);
  assert.equal(r.measured, 150); // c has no measured fit
  assert.equal(r.drivers[0].factor, 'market');
  assert.ok(Math.abs(r.drivers[0].dollars - (15 + 4)) < 1e-9);
  assert.ok(Math.abs(r.drivers.find((d) => d.factor === 'oil')!.dollars - (2 - 2)) < 1e-9);
  assert.ok(Math.abs(r.drivers.find((d) => d.factor === 'usd')!.dollars - -7.5) < 1e-9);
});

test('a typical month is the calibrated width of the monthly swing', () => {
  const c = { ids: ['a'], cov: [0.0004], calibration: { z80: 1.2, normal: 1.2816 } };
  assert.ok(Math.abs(typicalMonth([{ companyId: 'a', value: 100 }], c)! - 2 * Math.sqrt(MONTH_WEEKS) * 1.2) < 1e-9);
  assert.equal(typicalMonth([{ companyId: 'z', value: 100 }], c), null);
});

test('revenue places are weighted by stake value, latest year only, the rest elsewhere', () => {
  const lines = (id: string) =>
    id === 'a'
      ? [{ region: 'US', country: 'US', share: 0.6, fiscal_year: 2025 }, { region: 'China', country: 'CN', share: 0.4, fiscal_year: 2025 }, { region: 'US', country: 'US', share: 1, fiscal_year: 2024 }]
      : id === 'b'
        ? [{ region: 'Europe', country: null, share: 1, fiscal_year: 2025 }]
        : [];
  const r = revenuePlaces([{ companyId: 'a', value: 75 }, { companyId: 'b', value: 25 }, { companyId: 'c', value: 100 }], lines, (iso) => (iso === 'US' ? 'United States' : 'China'), 2);
  assert.deepEqual(r.map((p) => p.place), ['United States', 'China', 'Elsewhere']);
  assert.ok(Math.abs(r[0].share - 0.45) < 1e-9);
  assert.ok(Math.abs(r[2].share - 0.25) < 1e-9);
});
