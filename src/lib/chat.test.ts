import assert from 'node:assert/strict';
import { test } from 'node:test';

import { keywords, screen, settle, strikeNotice, costMicros } from '../../supabase/functions/_shared/persona.ts';

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
  assert.match(strikeNotice(1, 'Elon'), /Strike 1 of 3/);
  assert.match(strikeNotice(3, 'Elon'), /paused for 24 hours.*banned/);
});

test('keywords drop stop words and OR the rest', () => {
  assert.equal(keywords('What do you think about Mars colonies?'), 'mars or colonies');
});

test('cost is list price per token', () => {
  assert.equal(costMicros('claude-haiku-4-5', { input: 1000, output: 100 }), 1500);
});
