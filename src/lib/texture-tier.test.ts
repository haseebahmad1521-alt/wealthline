/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { maxTier, nextStep, startTier } from './texture-tier.ts';

test('start tier follows the screen: 4K for big or dense screens, else 2K', () => {
  assert.equal(startTier(2560), 1);
  assert.equal(startTier(1600), 0);
});

test('8K only for a capable, non-phone device with enough memory', () => {
  assert.equal(maxTier({ start: 1, maxTexture: 16384, phone: false, deviceMemory: 16 }), 2);
  assert.equal(maxTier({ start: 1, maxTexture: 16384, phone: false }), 2, 'memory unknown (Safari, Firefox): allowed');
  assert.equal(maxTier({ start: 1, maxTexture: 16384, phone: true, deviceMemory: 8 }), 1, 'phones stop at 4K');
  assert.equal(maxTier({ start: 1, maxTexture: 16384, phone: false, deviceMemory: 4 }), 1, 'tight memory stops at 4K');
  assert.equal(maxTier({ start: 0, maxTexture: 4096, phone: false }), 1, 'a 4096 GPU can still reach 4K');
  assert.equal(maxTier({ start: 0, maxTexture: 2048, phone: true }), 0);
});

test('Save-Data and slow connections never upgrade', () => {
  assert.equal(maxTier({ start: 0, maxTexture: 16384, phone: false, saveData: true }), 0);
  assert.equal(maxTier({ start: 1, maxTexture: 16384, phone: false, effectiveType: '3g' }), 1);
  assert.equal(maxTier({ start: 0, maxTexture: 16384, phone: false, effectiveType: 'slow-2g' }), 0);
  assert.equal(maxTier({ start: 1, maxTexture: 16384, phone: false, effectiveType: '4g' }), 2);
});

test('steps: up while smooth, down once if the step up made it slow, then stay', () => {
  assert.equal(nextStep({ frameMs: 16.7, tier: 1, start: 1, max: 2, settled: false }), 'up');
  assert.equal(nextStep({ frameMs: 16.7, tier: 2, start: 1, max: 2, settled: false }), null, 'already at the top');
  assert.equal(nextStep({ frameMs: 30, tier: 2, start: 1, max: 2, settled: false }), 'down');
  assert.equal(nextStep({ frameMs: 30, tier: 1, start: 1, max: 2, settled: false }), null, 'never below the start tier');
  assert.equal(nextStep({ frameMs: 16.7, tier: 1, start: 1, max: 2, settled: true }), null, 'no retry after a drop');
  assert.equal(nextStep({ frameMs: 21, tier: 1, start: 1, max: 2, settled: false }), null, 'in between: stay');
});
