/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { passwordRules } from './password-rules.ts';

const met = (pw: string) => passwordRules(pw).filter((r) => !r.met).map((r) => r.label);

test('accepts a strong password', () => {
  assert.deepEqual(met('Correct-Horse-9'), []);
});

test('reports each missing class', () => {
  assert.deepEqual(met(''), passwordRules('').map((r) => r.label));
  assert.deepEqual(met('alllowercase1!'), ['An uppercase letter']);
  assert.deepEqual(met('Short1!a'), ['At least 12 characters']);
  assert.deepEqual(met('NoDigitsHere!!'), ['A number']);
  assert.deepEqual(met('NoSymbols12345'), ['A symbol']);
});
