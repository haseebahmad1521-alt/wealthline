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
