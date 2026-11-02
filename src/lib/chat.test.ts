import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addMemory, addStrike, keywords, screen, settle, strikeNotice, costMicros } from '../../supabase/functions/_shared/persona.ts';

test('screen catches insults and threats aimed at someone, not casual swearing', () => {
  assert.equal(screen('you are such an idiot'), 'abuse');
  assert.equal(screen("I'll kill you"), 'threat');
  assert.equal(screen('this market is fucking wild'), null);
  assert.equal(screen('What do you think about Mars?'), null);
});

test('a flagged reply never keeps a reaction or text', () => {
  assert.deepEqual(settle({ reply: 'hi', reaction: '❤️', flag: 'abuse' }), { reply: '', reaction: null, flag: 'abuse' });
  assert.equal(settle({ reply: ' ok ', reaction: '🎉' as never, flag: null }).reaction, null);
});

test('strike notices count up to the pause', () => {
  assert.match(strikeNotice('warn', 1, 'Elon'), /Strike 1 of 3/);
  assert.match(strikeNotice('pause', 3, 'Elon'), /paused for 24 hours.*on hold/);
  assert.match(strikeNotice('hold', 4, 'Elon'), /on hold until a person reviews/);
});

test('keywords drop stop words and OR the rest', () => {
  assert.equal(keywords('What do you think about Mars colonies?'), 'mars or colonies');
});

test('cost is list price per token', () => {
  assert.equal(costMicros('haiku', { input: 1000, output: 100 }), 1500);
});

test('strikes: three in the window → 24 h cooldown; any strike after a cooldown → on hold for review', () => {
  const day = 864e5;
  let s = { strikes: [] as number[], pausedBefore: false, pausedUntil: 0, onHold: false };
  let r = addStrike(s, 0);
  assert.equal(r.outcome, 'warn');
  r = addStrike(r.state, day);
  // A strike older than 30 days drops out of the window.
  assert.equal(addStrike(r.state, 30.5 * day).strikes, 2);
  r = addStrike(r.state, 2 * day);
  assert.equal(r.outcome, 'pause');
  assert.equal(r.state.pausedUntil, 2 * day + 24 * 36e5);
  s = r.state;
  r = addStrike(s, 200 * day);
  assert.equal(r.outcome, 'hold');
  assert.equal(r.state.onHold, true);
});

test('memory: keeps the newest facts, skips repeats and nothing-to-remember', () => {
  assert.deepEqual(addMemory(['Lives in Oslo'], null, 3), ['Lives in Oslo']);
  assert.deepEqual(addMemory(['Lives in Oslo'], 'lives in oslo', 3), ['Lives in Oslo']);
  assert.deepEqual(addMemory(['a', 'b', 'c'], 'd', 3), ['b', 'c', 'd']);
  assert.equal(settle({ reply: 'hi', reaction: null, flag: null, remember: '  Named Sam ' }).remember, 'Named Sam');
  assert.equal(settle({ reply: 'hi', reaction: null, flag: null }).remember, null);
});
