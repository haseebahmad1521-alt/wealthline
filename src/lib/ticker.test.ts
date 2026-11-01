/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_ITEMS, age, chooseTicker, type MoveRow } from './ticker.ts';

const row = (key: string, pct: number, over: Partial<MoveRow> = {}): MoveRow => ({
  kind: 'company',
  key,
  label: key,
  currency: 'USD',
  start_value: 100,
  end_value: 100 + pct,
  change: pct,
  change_pct: pct,
  start_as_of: '2026-11-02T14:00:00Z',
  as_of: '2026-11-02T15:00:00Z',
  value_kind: 'quote',
  ...over,
});
const many = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => row(`${prefix}${i}`, (i + 1) * (i % 2 ? -0.5 : 0.5)));

test('picks the smallest window with enough movers', () => {
  const t = chooseTicker({ 1: many(3, 'a'), 3: many(8, 'b'), 6: many(12, 'c'), 24: many(20, 'd') }, null);
  assert.equal(t.mode, 'live');
  assert.equal(t.hours, 3);
  assert.equal(t.items.length, 8);
  assert.ok(t.items.every((i) => i.basis === 'live'));
});

test('zero and noise moves do not count as movers', () => {
  const rows = [...many(7, 'a'), row('flat', 0), row('noise', 0.001), row('null', 0, { change_pct: null })];
  const t = chooseTicker({ 1: rows, 3: many(8, 'b') }, null);
  assert.equal(t.hours, 3);
});

test('sorted by absolute move and capped', () => {
  const t = chooseTicker({ 1: many(40, 'a') }, null);
  assert.equal(t.items.length, MAX_ITEMS);
  const moves = t.items.map((i) => Math.abs(i.changePct));
  assert.deepEqual(moves, [...moves].sort((a, b) => b - a));
  assert.equal(moves[0], 20);
});

test('estimates are never live moves', () => {
  const estimates = Array.from({ length: 10 }, (_, i) => row(`p${i}`, 5, { kind: 'person', value_kind: 'estimate' }));
  const t = chooseTicker({ 1: estimates, 24: estimates }, null);
  assert.equal(t.mode, 'empty');
  assert.ok(!t.items.some((i) => i.basis === 'live'));
});

test('markets closed: falls back to the last session, keeps what still moves, labels estimates', () => {
  const live = [row('alwaleed', 2, { kind: 'person', value_kind: 'computed' }), row('tiny', 0.1, { kind: 'person', value_kind: 'computed' })];
  const close = [...many(10, 'q'), row('alwaleed', 9, { kind: 'person', value_kind: 'computed' }), row('bech', -7, { kind: 'person', value_kind: 'estimate' })];
  const t = chooseTicker({ 1: [], 3: [], 6: live, 12: live, 24: live }, close);
  assert.equal(t.mode, 'close');
  assert.equal(t.hours, null);
  const alwaleed = t.items.filter((i) => i.key === 'alwaleed');
  assert.equal(alwaleed.length, 1, 'no duplicate');
  assert.equal(alwaleed[0].basis, 'live', 'the current move wins over the close');
  assert.equal(t.items.find((i) => i.key === 'bech')?.basis, 'estimate');
  assert.ok(t.items.filter((i) => i.kind === 'company').every((i) => i.basis === 'close'));
});

test('a few live movers and no session data stay live', () => {
  const t = chooseTicker({ 24: [row('a', 1, { value_kind: 'computed', kind: 'person' })] }, []);
  assert.equal(t.mode, 'live');
  assert.equal(t.hours, 24);
  assert.equal(t.items.length, 1);
});

test('nothing at all is empty', () => {
  assert.deepEqual(chooseTicker({}, null), { mode: 'empty', hours: null, items: [] });
});

test('age is compact', () => {
  const now = Date.parse('2026-11-02T15:00:00Z');
  assert.equal(age(now - 20_000, now), 'now');
  assert.equal(age(now - 12 * 60_000, now), '12m');
  assert.equal(age(now - 2 * 3600_000, now), '2h');
  assert.equal(age(now - 50 * 3600_000, now), '2d');
});
