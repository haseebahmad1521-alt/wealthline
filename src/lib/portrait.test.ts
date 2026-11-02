/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { portraitAt, portraitPx } from './portrait.ts';

const original =
  'https://upload.wikimedia.org/wikipedia/commons/2/2a/Larry_Page_%28cropped_2%29.jpg?utm_source=commons.wikimedia.org&utm_content=thumbnail_unscaled';

test('Commons originals become a thumbnail at the next standard width', () => {
  assert.equal(
    portraitAt(original, 132),
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Larry_Page_%28cropped_2%29.jpg/250px-Larry_Page_%28cropped_2%29.jpg',
  );
  assert.match(portraitAt(original, 90), /\/250px-/);
  assert.match(portraitAt(original, 4000), /\/960px-/);
});

test('existing Commons thumbnails are resized, not nested', () => {
  const thumb = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Jen-Hsun_Huang_2025.jpg/960px-Jen-Hsun_Huang_2025.jpg?utm_source=x';
  assert.equal(
    portraitAt(thumb, 200),
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Jen-Hsun_Huang_2025.jpg/250px-Jen-Hsun_Huang_2025.jpg',
  );
});

test('the thumb host keeps its host', () => {
  assert.equal(
    portraitAt('https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Elon_Musk.jpg/960px-Elon_Musk.jpg', 150),
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Elon_Musk.jpg/250px-Elon_Musk.jpg',
  );
});

test('other hosts and non-photo files pass through', () => {
  assert.equal(portraitAt('https://example.com/a.jpg', 100), 'https://example.com/a.jpg');
  const svg = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Logo.svg';
  assert.equal(portraitAt(svg, 100), svg);
});

test('device pixels cap at 3x', () => {
  assert.equal(portraitPx(44, 2), 88);
  assert.equal(portraitPx(44, 4), 132);
});
