import assert from 'node:assert/strict';
import test from 'node:test';

// share.ts imports react-native for the share sheet; the link format is checked through its pure halves here.
import { dialScenario } from './dials.ts';

test('link parameters round-trip', async () => {
  const mod = await import('./share-params.ts');
  const ex = { id: 'example-iran-saudi', origin: 'example' as const, title: '', summary: '', plausibility: 'possible' as const, reason: '', months: 12, shocks: [], assumptions: [], sources: [] };
  assert.deepEqual(mod.simParams(ex, {}), { sim: 'example-iran-saudi' });
  assert.deepEqual(mod.readSimParams(mod.simParams({ ...ex, id: 'versus:elon-musk:mukesh-ambani:market:b', origin: 'versus' }, {})), {
    vs: { a: 'elon-musk', b: 'mukesh-ambani', battle: 'market', winner: 'b' },
  });
  const d = { oil: 35, china: -30 };
  assert.deepEqual(mod.readSimParams(mod.simParams(dialScenario(d), d)), { dials: d });
  assert.deepEqual(mod.readSimParams({ sim: 'bad id!' }), {});
  assert.deepEqual(mod.readSimParams({ dials: 'oil:500' }), { dials: {} });
});
