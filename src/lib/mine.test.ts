import assert from 'node:assert/strict';
import test from 'node:test';

import { myChange, readMine } from './mine.ts';
import type { Frame } from './simulate.ts';

test('holdings are cleaned and moved with their companies', () => {
  assert.deepEqual(readMine('[{"company":"t","usd":5000},{"company":"t","usd":9},{"company":"n","usd":-1},{"x":1}]'), [{ company: 't', usd: 5000 }]);
  assert.deepEqual(readMine('not json'), []);
  const frame = { companies: [{ company: { id: 't' }, price: -0.2 }, { company: { id: 'n' }, price: 0.1 }] } as unknown as Frame;
  const r = myChange(frame, [{ company: 't', usd: 5000 }, { company: 'n', usd: 2000 }, { company: 'z', usd: 1000 }])!;
  assert.equal(r.delta, -800);
  assert.equal(r.total, 8000);
  assert.equal(r.pct, -0.1);
  assert.equal(myChange(frame, []), null);
});
