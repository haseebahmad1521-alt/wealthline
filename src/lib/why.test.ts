import assert from 'node:assert/strict';
import test from 'node:test';

import { biggest, explain, weekEnd, type MoveRow } from './why.ts';

const row = (id: string, actual: number, beta: number, market: number, sd = 0.03): MoveRow => {
  const moves = { market, oil: 0, china: 0, usd: 0, sector: 0 };
  const b = { market: beta, oil: 0, china: 0, usd: 0, sector: 0 };
  return { company_id: id, week: '2026-W46', actual, predicted: beta * market, residual: actual - beta * market, sd, moves, beta: b };
};

test('a move splits into what market forces explain and the company’s own part', () => {
  const w = explain(row('t', Math.log(1 - 0.091), 1.5, -0.015), 1.485);
  assert.ok(Math.abs(w.total - -9.1) < 1e-9);
  assert.ok(Math.abs(w.market - (Math.exp(-0.0225) - 1) * 100) < 1e-9);
  assert.ok(Math.abs(w.market + w.own - w.total) < 1e-9);
  assert.deepEqual(w.main?.factor, 'market');
  assert.ok(w.unusual); // about 6.8 points of its own, beyond 1.485 × 3
});

test('small forces are not named, and an ordinary week is not unusual', () => {
  const w = explain(row('q', 0.02, 1, 0.005), 1.485);
  assert.equal(w.main, null);
  assert.equal(w.unusual, false);
});

test('the biggest moves of the week, at least 3%, largest first', () => {
  const rows = [row('a', 0.01, 1, 0.01), row('b', -0.12, 1, -0.02), row('c', 0.06, 1, 0.01), row('d', 0.031, 1, 0)];
  assert.deepEqual(biggest(rows, 1.485).map((w) => w.companyId), ['b', 'c', 'd']);
});

test('an ISO week ends on its Friday', () => {
  assert.equal(weekEnd('2026-W46'), '2026-11-13');
  assert.equal(weekEnd('2026-W01'), '2026-01-02');
  assert.equal(weekEnd('2020-W53'), '2021-01-01');
});
