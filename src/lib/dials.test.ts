import assert from 'node:assert/strict';
import test from 'node:test';

import { DIALS, dialScenario } from './dials.ts';

test('dials at zero add nothing; a dial maps to its stated changes', () => {
  assert.equal(dialScenario({}).shocks.length, 0);
  const s = dialScenario({ oil: 100, ai: 0 });
  assert.deepEqual(s.shocks.map((x) => [x.kind, x.target, Math.round(x.pct * 100)]), [['factor', 'oil', 100]]);
  assert.equal(s.assumptions.length, 1);
  assert.match(s.title, /oil price up/);
  for (const d of DIALS) assert.ok(d.min < 0 && d.max > 0);
});

test('dials read as plain sentences and name the companies they reach', async () => {
  const { DIALS, dialEffects, share } = await import('./dials.ts');
  assert.equal(share(35), 'a third');
  assert.equal(share(10), 'a tenth');
  const oil = DIALS.find((d) => d.key === 'oil')!;
  assert.equal(oil.describe(35), 'The oil price goes up by a third');
  assert.equal(oil.describe(100), 'The oil price doubles');
  assert.equal(DIALS.find((d) => d.key === 'china')!.describe(-100), 'Trade with China is cut off');
  assert.deepEqual(dialEffects(oil, 35, { energy: ['Reliance', 'Koch'] }), [
    'Brent oil rises about 35%; energy companies like Reliance, Koch follow it most. Each company moves by how its shares have followed oil.',
  ]);
  const ai = DIALS.find((d) => d.key === 'ai')!;
  assert.deepEqual(dialEffects(ai, -20, { technology: ['Nvidia'] }), ['Tech companies like Nvidia trail the market by about 10%, each by its measured sensitivity.']);
  assert.deepEqual(dialEffects(oil, 0, {}), []);
});

test('the summary combines every dial into one picture', async () => {
  const { dialScenario, dialSummary } = await import('./dials.ts');
  const { simulate } = await import('./simulate.ts');
  const e = (id: string, sector: string, worth: number) => ({
    person: { id, slug: id, name: id, net_worth_usd: worth },
    companies: [{ id: `${id}-co`, name: id, sector, listed: true, regions: [] }],
    stakes: [],
  });
  const empires = [e('oilman', 'energy', 100), e('techie', 'technology', 100), e('shipper', 'transport', 100)];
  // No measured sensitivities here, so the plain rule applies: a sector moves its companies one-for-one.
  const values = { ai: -20, luxury: 50 };
  const frame = simulate(dialScenario(values), [...empires, e('shop', 'consumer', 100)], [], 12);
  const s = dialSummary(values, frame, (n) => `$${n}`)!;
  assert.equal(s.setup, 'The AI bubble deflates: spending falls by a fifth and spending on luxury goes up by half.');
  assert.equal(s.overall, 'Together: consumer brands rise about 20% and tech companies fall about 10%. 2 of the tracked fortunes move.');
  assert.equal(s.who, 'shop comes out best (≈+20%); techie is hit hardest (≈−10%).');
  assert.equal(dialSummary({}, frame, String), null);
});
