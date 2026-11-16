import assert from 'node:assert/strict';
import test from 'node:test';

import { isSecurityStory, tiesFor, type ContractTie } from './ties.ts';

const story = (title: string, shocks: unknown[] = []) => ({ id: 'x', origin: 'daily' as const, title, summary: '', plausibility: 'possible' as const, reason: '', months: 12, shocks: shocks as never, assumptions: [], sources: [] });
const c = (company: string, defense: number, recipients = [company.toUpperCase()]): ContractTie => ({ company, contracts: defense * 2, defense, recipients, url: `https://www.usaspending.gov/recipient/${company}/latest` });

test('war and security storylines are recognised; others are not', () => {
  assert.equal(isSecurityStory(story('Iran and Saudi Arabia go to war.')), true);
  assert.equal(isSecurityStory(story('Quiet title.', [{ kind: 'analog', target: 'mideast', pct: 1, from: 0, to: 2 }])), true);
  assert.equal(isSecurityStory(story('Quiet title.', [{ kind: 'sector', target: 'defense', pct: 0.1, from: 0, to: 2 }])), true);
  // A defence move that's only part of another analog's expansion doesn't count on its own.
  assert.equal(isSecurityStory(story('Quiet title.', [{ kind: 'sector', target: 'defense', pct: 0.1, from: 0, to: 2, quiet: true }])), false);
  assert.equal(isSecurityStory(story('The AI boom doubles.')), false);
});

test('defence ties: largest first, owned by someone tracked, each company once, small ones left out', () => {
  const contracts = {
    pal: c('Palantir', 3.5e9),
    spx: c('SpaceX', 5.7e9),
    goog: c('Google', 2e8, ['GOOGLE LLC']),
    alph: c('Alphabet', 2e8, ['GOOGLE LLC']),
    tiny: c('Tiny', 5e7),
    orphan: c('Orphan', 9e9),
  };
  const owners = (id: string) => (id === 'orphan' ? [] : [{ id: `p-${id}`, name: `Owner of ${id}` }]);
  const ties = tiesFor(story('A war.'), contracts, owners);
  assert.deepEqual(ties.map((t) => t.company), ['SpaceX', 'Palantir', 'Google']);
  assert.deepEqual(tiesFor(story('Chip boom.'), contracts, owners), []);
});
