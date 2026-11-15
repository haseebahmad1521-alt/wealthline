import assert from 'node:assert/strict';
import test from 'node:test';

import { companyBoard, today } from './today.ts';

const p = (name: string, now: number | null, prev: number | null) => ({ id: name, name, net_worth_usd: now, prev_net_worth_usd: prev });

test('counts up and down and picks the biggest dollar moves', () => {
  const t = today([p('A', 110, 100), p('B', 95, 100), p('C', 300, 200), p('D', 50, 80), p('E', 10, null), p('F', 7, 7)], 1);
  assert.equal(t.up, 2);
  assert.equal(t.down, 2);
  assert.equal(t.gains[0].person.name, 'C');
  assert.equal(t.gains[0].delta, 100);
  assert.equal(t.drops[0].person.name, 'D');
  assert.equal(t.drops[0].delta, -30);
});

test('a zero previous value is left out', () => {
  assert.deepEqual(today([p('A', 5, 0)]), { up: 0, down: 0, gains: [], drops: [] });
});

test('each company is counted once, with every owner', () => {
  const alphabet = { id: 'g', name: 'Alphabet', regions: [{ revenue_usd: 300 }, { revenue_usd: 103 }], sites: [1] };
  const tesla = { id: 't', name: 'Tesla', regions: [{ revenue_usd: 97 }], sites: [1, 2, 3] };
  const board = companyBoard([
    { owner: 'Page', companies: [alphabet] },
    { owner: 'Brin', companies: [alphabet] },
    { owner: 'Musk', companies: [tesla] },
  ]);
  assert.equal(board.length, 2);
  assert.equal(board[0].company.name, 'Alphabet');
  assert.equal(board[0].revenue, 403);
  assert.deepEqual(board[0].owners, ['Page', 'Brin']);
  assert.equal(board[1].places, 3);
});
