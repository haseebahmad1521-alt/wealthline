import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromDate, MAX_GAP, nextDue, sameUrl, xaiCostMicros, xPostId } from '../../supabase/functions/_shared/recent.ts';

const H = 36e5;
const D = 24 * H;

test('schedule: top ranks daily, others weekly; busy sooner, quiet backs off to at most a week', () => {
  assert.equal(nextDue(0, 3, 1, 0), D);
  assert.equal(nextDue(0, 40, 1, 0), 7 * D);
  assert.equal(nextDue(0, null, 1, 0), 7 * D);
  assert.equal(nextDue(0, 3, 5, 0), 12 * H);
  assert.equal(nextDue(0, 3, 0, 0), 2 * D);
  assert.equal(nextDue(0, 3, 0, 1), 4 * D);
  assert.equal(nextDue(0, 3, 0, 9), MAX_GAP);
  assert.equal(nextDue(0, 40, 0, 0), MAX_GAP);
});

test('window: from the last fetch, never more than 30 days back', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  assert.equal(fromDate(now, null), '2026-10-04');
  assert.equal(fromDate(now, Date.parse('2026-11-02T05:00:00Z')), '2026-11-02');
  assert.equal(fromDate(now, Date.parse('2025-01-01T00:00:00Z')), '2026-10-04');
});

test('only posts by the person themselves count', () => {
  assert.equal(xPostId('https://x.com/ElonMusk/status/1234567890123', 'elonmusk'), '1234567890123');
  assert.equal(xPostId('https://twitter.com/elonmusk/status/1234567890123?s=20', 'elonmusk'), '1234567890123');
  assert.equal(xPostId('https://x.com/someoneelse/status/1234567890123', 'elonmusk'), null);
  assert.equal(xPostId('https://x.com.evil.io/elonmusk/status/1234567890123', 'elonmusk'), null);
  assert.equal(sameUrl('https://twitter.com/a/status/1/'), sameUrl('https://x.com/a/status/1#x'));
});

test('cost: tokens plus $5 per 1,000 searches, or xAI’s own figure when higher', () => {
  assert.equal(xaiCostMicros('grok-4.3', { input_tokens: 10_000, output_tokens: 1000, input_tokens_details: { cached_tokens: 2000 } }, 2), 10_000 + 400 + 2500 + 10_000);
  assert.equal(xaiCostMicros('grok-4.3', { cost_in_usd_ticks: 5e8 }, 0), 50_000);
});
