import assert from 'node:assert/strict';
import test from 'node:test';

import { chain, FOLLOW_UPS } from './chain.ts';
import { simulate, type SimEmpire } from './simulate.ts';

test('a follow-up keeps what happened and starts where the first part ended', () => {
  const base = { id: 'x', origin: 'example' as const, title: 'War.', summary: '', plausibility: 'possible' as const, reason: '', months: 12, shocks: [{ kind: 'market' as const, target: '' as const, pct: -0.1, from: 0, to: 2 }], assumptions: ['a'], sources: [] };
  const next = chain(base, FOLLOW_UPS[0]);
  assert.equal(next.months, 24);
  assert.equal(next.title, 'War, then markets recover.');
  assert.deepEqual(next.shocks.map((s) => [s.from, s.to]), [[0, 2], [12, 18]]);
  const e: SimEmpire = { person: { id: 'p', slug: 'p', name: 'P', net_worth_usd: 100 }, companies: [{ id: 'c', name: 'C', sector: null, listed: true, regions: [] }], stakes: [] };
  const at12 = simulate(next, [e], [], 12).companies[0].price;
  const at24 = simulate(next, [e], [], 24).companies[0].price;
  assert.ok(Math.abs(at12 + 0.1) < 1e-9);
  assert.ok(Math.abs(at24 - (0.9 * 1.1 - 1)) < 1e-9);
  assert.equal(chain(next, FOLLOW_UPS[0]).months, 36);
});
