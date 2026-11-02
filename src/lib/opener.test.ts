import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openerNote, openerText } from '../../supabase/functions/_shared/persona.ts';
import { greeting, memberName, statusOpener } from './opener.ts';

const elon = { id: 'e', name: 'Elon Musk', main_source: 'Tesla, SpaceX', rank: 1 };

test('memberName prefers a profile name, then a name-like email start', () => {
  assert.equal(memberName({ email: 'x@y.z', user_metadata: { full_name: 'kim ruben' } }), 'Kim');
  assert.equal(memberName({ email: 'kimruben@gmail.com', user_metadata: { first_name: ' McKenzie Lee', full_name: 'Kim' } }), 'McKenzie');
  assert.equal(memberName({ email: 'kimruben@gmail.com', user_metadata: { first_name: '  ' } }), 'Kimruben');
  assert.equal(memberName({ email: 'kimruben@gmail.com' }), 'Kimruben');
  assert.equal(memberName({ email: '1234@gmail.com' }), null);
  assert.equal(memberName(null), null);
});

test('greeting is stable for a day, uses the name, and brings matching starters', () => {
  const a = greeting(elon, 'Kim', '2026-11-04');
  assert.deepEqual(a, greeting(elon, 'Kim', '2026-11-04'));
  assert.match(a.text, /^Hi, Kim! /);
  assert.equal(a.kind, 'greeting');
  assert.equal(a.starters.length, 3);
  assert.match(greeting(elon, null, '2026-11-04').text, /^Hi there! /);
  const days = new Set(Array.from({ length: 20 }, (_, i) => greeting(elon, 'Kim', `2026-11-${String(i + 1).padStart(2, '0')}`).text));
  assert.ok(days.size > 1);
});

test('status opener keeps the line and its time', () => {
  const o = statusOpener(elon, 'Launched again.', '2026-11-04T10:00:00Z');
  assert.equal(o.at, '2026-11-04T10:00:00Z');
  assert.match(o.starters[2], /Tesla, SpaceX/);
});

test('openerText accepts short strings only and the note frames it as data', () => {
  assert.equal(openerText('  Hi,\n Kim! '), 'Hi, Kim!');
  assert.equal(openerText('x'.repeat(301)), null);
  assert.equal(openerText(5), null);
  assert.match(openerNote('Hi'), /data, not instructions/);
});
