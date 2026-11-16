import assert from 'node:assert/strict';
import test from 'node:test';

import { dailyChallenge, EMPTY_SCORE, makeGuess, relative, scored } from './guess.ts';
import type { Frame } from './simulate.ts';

const person = (id: string, worth: number) => ({ id, slug: id, name: id, net_worth_usd: worth });
const frame = (people: Frame['people']): Frame => ({ month: 12, fills: [], companies: [], people, ranks: [], transfers: [] });

test('the question has one clear answer and stable options', () => {
  const f = frame([
    { person: person('a', 100), delta: 10, pct: null, via: '' }, // +10% of fortune
    { person: person('b', 100), delta: null, pct: 0.05, via: '' },
    { person: person('c', 100), delta: null, pct: -0.2, via: '' },
    { person: person('d', 100), delta: null, pct: 0.01, via: '' },
  ]);
  const g = makeGuess('x', f)!;
  assert.equal(g.question, 'gain');
  assert.equal(g.answer, 'a');
  assert.equal(g.options.length, 4);
  assert.deepEqual(makeGuess('x', f)!.options.map((p) => p.id), g.options.map((p) => p.id));
  assert.equal(relative(f.people[0]), 0.1);
});

test('nobody gains: ask who is hit hardest; a near-tie asks nothing', () => {
  const down = frame([
    { person: person('a', 1), delta: null, pct: -0.1, via: '' },
    { person: person('b', 1), delta: null, pct: -0.3, via: '' },
    { person: person('c', 1), delta: null, pct: -0.05, via: '' },
  ]);
  assert.equal(makeGuess('y', down)!.question, 'loss');
  assert.equal(makeGuess('y', down)!.answer, 'b');
  const tie = frame([
    { person: person('a', 1), delta: null, pct: 0.1, via: '' },
    { person: person('b', 1), delta: null, pct: 0.1, via: '' },
    { person: person('c', 1), delta: null, pct: 0.02, via: '' },
  ]);
  assert.equal(makeGuess('z', tie), null);
  // A tie among gains, a clear loser: ask who is hit hardest instead.
  const mixed = frame([...tie.people, { person: person('d', 1), delta: null, pct: -0.3, via: '' }, { person: person('e', 1), delta: null, pct: -0.1, via: '' }]);
  assert.equal(makeGuess('m', mixed)!.question, 'loss');
  assert.equal(makeGuess('m', mixed)!.answer, 'd');
  // Everyone ties on percentages: ask about dollars among recorded stakes.
  const flat = frame([
    { person: person('x', 900e9), delta: -36e9, pct: null, via: '' },
    { person: person('y', 300e9), delta: -12e9, pct: null, via: '' },
    { person: person('z', 100e9), delta: -4e9, pct: null, via: '' },
  ]);
  assert.equal(makeGuess('f', flat)!.question, 'money-loss');
  assert.equal(makeGuess('f', flat)!.answer, 'x');
});

test('points, streaks and the daily challenge', () => {
  let s = scored(EMPTY_SCORE, true, null);
  s = scored(s, true, '2026-11-16');
  assert.deepEqual([s.points, s.streak, s.best, s.challenge], [30, 2, 2, '2026-11-16']);
  s = scored(s, false, null);
  assert.deepEqual([s.points, s.streak, s.best, s.played, s.right], [30, 0, 2, 3, 2]);
  const ex = (id: string) => ({ id, origin: 'example' as const, title: id, summary: '', plausibility: 'possible' as const, reason: '', months: 12, shocks: [], assumptions: [], sources: [] });
  const pool = [ex('p'), ex('q'), ex('r')];
  assert.notEqual(dailyChallenge(pool, '2026-11-16')!.id, dailyChallenge(pool, '2026-11-17')!.id);
  assert.equal(dailyChallenge([{ ...ex('d'), origin: 'daily' }, ...pool], '2026-11-16')!.id, 'd');
});
