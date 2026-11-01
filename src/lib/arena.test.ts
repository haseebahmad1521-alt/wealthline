import assert from 'node:assert/strict';
import test from 'node:test';

import { closestRaces, overtakes, rankMoves, topMovers, type Contender } from './arena.ts';

const p = (id: string, now: number | null, prev: number | null): Contender => ({ id, name: id, net_worth_usd: now, prev_net_worth_usd: prev });
// Yesterday: A 100, B 90, C 80, D 50. Today: A 100, C 95, B 85, D 50 → C passes B.
const field = [p('A', 100, 100), p('B', 85, 90), p('C', 95, 80), p('D', 50, 50), p('E', 40, null)];

test('rank moves count places gained and lost', () => {
  const m = rankMoves(field);
  assert.equal(m.get('C'), 1);
  assert.equal(m.get('B'), -1);
  assert.equal(m.get('A'), 0);
  assert.equal(m.has('E'), false, 'no previous value, no move');
});

test('overtakes are pairs whose order flipped', () => {
  const o = overtakes(field);
  assert.equal(o.length, 1);
  assert.equal(o[0].winner.id, 'C');
  assert.equal(o[0].passed.id, 'B');
  assert.equal(o[0].gap, 10);
});

test('closest races rank neighbours by relative gap', () => {
  const r = closestRaces(field, 1);
  assert.equal(r[0].leader.id, 'A');
  assert.equal(r[0].chaser.id, 'C');
  assert.equal(r[0].gap, 5);
});

test('top movers are the biggest dollar gain and loss', () => {
  const { up, down } = topMovers(field);
  assert.equal(up?.person.id, 'C');
  assert.equal(up?.delta, 15);
  assert.equal(down?.person.id, 'B');
  assert.equal(down?.delta, -5);
  assert.deepEqual(topMovers([p('X', 10, 10)]), { up: null, down: null });
});
