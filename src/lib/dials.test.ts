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
