import assert from 'node:assert/strict';
import test from 'node:test';

import { sameKindOnly, toCheck } from './baseline.ts';

const person = (id: string, kind: string, asOf: string, prevAsOf: string | null) => ({ id, kind, as_of: asOf, prev_as_of: prevAsOf, prev_net_worth_usd: prevAsOf ? 1 : null });

test('only baselines older than two days are checked', () => {
  const people = [person('a', 'computed', '2026-11-16T20:00:00Z', '2026-11-15T20:00:00Z'), person('b', 'computed', '2026-11-16T20:00:00Z', '2026-03-10T05:01:00Z'), person('c', 'estimate', '2026-03-10T05:01:00Z', null)];
  assert.deepEqual(toCheck(people).map((p) => p.id), ['b']);
});

test('a baseline from another method is dropped; one of the same kind stays', () => {
  const people = [person('andreessen', 'computed', '2026-11-01T02:00:00Z', '2026-03-10T05:01:00Z'), person('anthropic', 'computed', '2026-11-11T14:00:00Z', '2026-11-01T02:00:00Z'), person('recent', 'computed', '2026-11-16T20:00:00Z', '2026-11-15T20:00:00Z')];
  const kinds: Record<string, string> = { 'andreessen|2026-03-10T05:01:00Z': 'estimate', 'anthropic|2026-11-01T02:00:00Z': 'computed' };
  const out = sameKindOnly(people, (id, at) => kinds[`${id}|${at}`]);
  assert.equal(out[0].prev_net_worth_usd, null);
  assert.equal(out[0].prev_as_of, null);
  assert.equal(out[1].prev_net_worth_usd, 1);
  assert.equal(out[2].prev_net_worth_usd, 1);
});

test('an unknown baseline kind is kept rather than guessed', () => {
  const out = sameKindOnly([person('x', 'computed', '2026-11-16T20:00:00Z', '2026-03-10T05:01:00Z')], () => undefined);
  assert.equal(out[0].prev_net_worth_usd, 1);
});
