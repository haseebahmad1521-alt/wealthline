import assert from 'node:assert/strict';
import test from 'node:test';

import { DIALS, dialScenario } from './dials.ts';

test('dials at zero add nothing; a dial maps to its stated changes', () => {
  assert.equal(dialScenario({}).shocks.length, 0);
  const s = dialScenario({ oil: 100, ai: 0 });
  assert.deepEqual(s.shocks.map((x) => [x.kind, x.target, Math.round(x.pct * 100)]), [['sector', 'energy', 35], ['sector', 'transport', -20]]);
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
  assert.deepEqual(dialEffects(oil, 35, { energy: ['Reliance', 'Koch'] }), ['Energy companies like Reliance, Koch rise about 12%.', 'Transport companies fall about 7%.']);
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
  const values = { oil: 35, ai: -20 };
  const frame = simulate(dialScenario(values), empires, [], 12);
  const s = dialSummary(values, frame, (n) => `$${n}`)!;
  assert.equal(s.setup, 'The oil price goes up by a third and the AI bubble deflates: spending falls by a fifth.');
  assert.equal(s.overall, 'Together: energy companies rise about 12%, tech companies fall about 10% and transport companies fall about 7%. 3 of the tracked fortunes move.');
  assert.equal(s.who, 'oilman comes out best (≈+12%); techie is hit hardest (≈−10%).');
  assert.equal(dialSummary({}, frame, String), null);
});
