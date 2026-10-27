import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACT_PROGRESS,
  applyOutcome,
  makeDelivery,
  mulberry32,
  newMatch,
  overJustEnded,
  resolveLeave,
  resolveShot,
  timingQuality,
  type Delivery,
} from './engine.ts';

const straight: Delivery = {
  kind: 'good', duration: 1, line: 0, bounceAt: 0.6, bounceRise: 0.28,
  isWide: false, onStumps: true, windowScale: 1,
};

test('timing bands grade swings by milliseconds from contact', () => {
  assert.equal(timingQuality(CONTACT_PROGRESS, straight), 'perfect');
  assert.equal(timingQuality(CONTACT_PROGRESS + 0.07, straight), 'good');
  assert.equal(timingQuality(CONTACT_PROGRESS - 0.12, straight), 'ok');
  assert.equal(timingQuality(CONTACT_PROGRESS - 0.2, straight), 'poor');
  assert.equal(timingQuality(0.3, straight), 'miss');
});

test('perfect lofted is always a six, perfect ground shot always four', () => {
  for (let seed = 1; seed < 200; seed++) {
    assert.equal(resolveShot(mulberry32(seed), straight, 'lofted', 'perfect').runs, 6);
    assert.equal(resolveShot(mulberry32(seed), straight, 'ground', 'perfect').runs, 4);
  }
});

test('leaving a straight ball is bowled, a wide is an extra and not legal', () => {
  const rng = mulberry32(3);
  assert.equal(resolveLeave(rng, straight).wicket, 'bowled');
  const wide = resolveLeave(rng, { ...straight, isWide: true, onStumps: false, line: 0.7 });
  assert.deepEqual([wide.extras, wide.legal, wide.wicket], [1, false, null]);
});

test('deliveries stay in sane ranges', () => {
  const rng = mulberry32(42);
  for (let i = 0; i < 500; i++) {
    const d = makeDelivery(rng, { level: 3 });
    assert.ok(d.duration >= 0.72 && d.duration < 1.3);
    assert.ok(Math.abs(d.line) <= 0.8);
    if (d.isWide) assert.equal(d.onStumps, false);
  }
});

test('match ends when target is reached or resources run out', () => {
  let m = newMatch(10, 1, 2);
  const six = resolveShot(mulberry32(1), straight, 'lofted', 'perfect');
  m = applyOutcome(m, six);
  assert.equal(m.status, 'playing');
  m = applyOutcome(m, six);
  assert.equal(m.status, 'won');
  assert.equal(m.sixes, 2);

  let l = newMatch(50, 1, 2);
  const out = resolveLeave(mulberry32(1), straight);
  l = applyOutcome(applyOutcome(l, out), out);
  assert.equal(l.status, 'lost');

  let o = newMatch(50, 2, 10);
  const dot = resolveLeave(mulberry32(1), { ...straight, onStumps: false, line: 0.3 });
  for (let i = 0; i < 6; i++) o = applyOutcome(o, dot);
  assert.equal(overJustEnded(o), true);
});
