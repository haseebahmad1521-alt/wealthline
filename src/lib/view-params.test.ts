/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parsePeopleParams, parseProjectParams, sortPeople, suggestName } from './view-params.ts';

test('people params: unknown keys ignored, invalid values dropped', () => {
  assert.deepEqual(parsePeopleParams({ q: 'tech', sort: 'change', extra: 1 }), { q: 'tech', sort: 'change' });
  assert.deepEqual(parsePeopleParams({ q: 5, sort: 'bogus' }), { q: '', sort: 'name' });
  assert.deepEqual(parsePeopleParams(null), { q: '', sort: 'name' });
  assert.deepEqual(parsePeopleParams([1]), { q: '', sort: 'name' });
  assert.equal(parsePeopleParams({ q: 'x'.repeat(500) }).q.length, 100);
});

test('project params', () => {
  assert.deepEqual(parseProjectParams({ status: 'upcoming' }), { status: 'upcoming' });
  assert.deepEqual(parseProjectParams({ status: 'done' }), { status: 'all' });
  assert.deepEqual(parseProjectParams('x'), { status: 'all' });
});

const p = (name: string, rank: number | null, nw: number | null, prev: number | null) => ({
  name, rank, net_worth_usd: nw, prev_net_worth_usd: prev,
});

test('sorting: change is descending, no-data last; rank and name', () => {
  const list = [p('Cy', null, null, null), p('Al', 2, 200, 100), p('Bo', 1, 110, 100), p('Di', 3, 90, null)];
  assert.deepEqual(sortPeople(list, 'change').map((x) => x.name), ['Al', 'Bo', 'Cy', 'Di']);
  assert.deepEqual(sortPeople(list, 'rank').map((x) => x.name), ['Bo', 'Al', 'Di', 'Cy']);
  assert.deepEqual(sortPeople(list, 'name').map((x) => x.name), ['Al', 'Bo', 'Cy', 'Di']);
  assert.equal(list[0].name, 'Cy');
});

test('suggested names', () => {
  assert.equal(suggestName('projects', { status: 'upcoming' }), 'Upcoming projects');
  assert.equal(suggestName('people', { q: 'tech', sort: 'change' }), 'tech, by change');
});
