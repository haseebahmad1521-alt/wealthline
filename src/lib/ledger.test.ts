import assert from 'node:assert/strict';
import test from 'node:test';

import { weekKey } from '../../supabase/functions/_shared/factors.ts';
import { expectedMove, lastCompleteWeek, ledgerRows } from '../../supabase/functions/_shared/ledger.ts';

// 300 synthetic weeks: a company that moves 1.5× global stocks plus a little noise of its own.
const weeks = Array.from({ length: 300 }, (_, i) => weekKey(Date.UTC(2020, 0, 6 + 7 * i) / 1000));
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) - 0.5;
const market = new Map(weeks.map((w) => [w, rand() * 0.04]));
const series = { market, oil: new Map(weeks.map((w) => [w, rand() * 0.06])), china: new Map(weeks.map((w) => [w, rand() * 0.04])), usd: new Map(weeks.map((w) => [w, rand() * 0.01])) };
const peers = [{ id: 'b', sector: null, returns: new Map(weeks.map((w) => [w, 0.8 * market.get(w)! + rand() * 0.01])) }, { id: 'c', sector: null, returns: new Map(weeks.map((w) => [w, market.get(w)! + rand() * 0.01])) }];
const company = (returns: Map<string, number>) => [{ id: 'a', sector: null, returns }, ...peers];
const base = new Map(weeks.map((w) => [w, 1.5 * market.get(w)! + rand() * 0.01]));

test('the expected move is each sensitivity times its factor move', () => {
  assert.equal(expectedMove({ market: 1.5, oil: 0.2, china: 0, usd: -1, sector: 0 }, { market: 0.02, oil: 0.1, china: 0.5, usd: 0.01, sector: 0 }), 0.03 + 0.02 - 0.01);
});

test('a week is predicted only from the weeks before it', () => {
  const target = weeks[250];
  const shocked = new Map(base);
  shocked.set(target, -0.5); // a crash in the target week itself
  const later = new Map(base);
  for (const w of weeks.slice(251)) later.set(w, 0.3); // and nonsense afterwards
  const a = ledgerRows(company(base), series, {}, [target], target).find((r) => r.company_id === 'a')!;
  const b = ledgerRows(company(shocked), series, {}, [target], target).find((r) => r.company_id === 'a')!;
  const c = ledgerRows(company(later), series, {}, [target], target).find((r) => r.company_id === 'a')!;
  assert.equal(b.predicted, a.predicted);
  assert.equal(c.predicted, a.predicted);
  assert.equal(b.actual, -0.5);
  assert.equal(b.residual, -0.5 - b.predicted);
  assert.equal(a.kind, 'live');
  assert.ok(a.fit_through < target);
  assert.ok(Math.abs(a.beta.market - 1.5) < 0.15, `market sensitivity ${a.beta.market}`);
});

test('blocks fit through their first week; earlier weeks are backfill', () => {
  const targets = weeks.slice(260, 290);
  const rows = ledgerRows(company(base), series, {}, targets, targets[targets.length - 1], 13).filter((r) => r.company_id === 'a');
  assert.equal(rows.length, 30);
  for (const r of rows) assert.ok(r.fit_through < r.week);
  assert.deepEqual(new Set(rows.map((r) => r.fit_through)).size, 3);
  assert.equal(rows.filter((r) => r.kind === 'live').length, 1);
  // Residuals are small for a company the factors explain.
  assert.ok(rows.every((r) => Math.abs(r.residual) < 0.05));
});

test('the last complete week waits for the weekend', () => {
  const ws = [weekKey(Date.UTC(2026, 10, 9) / 1000), weekKey(Date.UTC(2026, 10, 16) / 1000)]; // 2026-W46, W47
  assert.equal(lastCompleteWeek(ws, new Date(Date.UTC(2026, 10, 18, 12)), weekKey), ws[0]); // Wednesday of W47
  assert.equal(lastCompleteWeek(ws, new Date(Date.UTC(2026, 10, 22, 5)), weekKey), ws[1]); // Sunday of W47
});
