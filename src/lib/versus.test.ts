import assert from 'node:assert/strict';
import test from 'node:test';

import { simEvents, simulate, type SimCountry, type SimEmpire } from './simulate.ts';
import { battleground, mainCompany, suggestedMatches, versusScenario, versusScore } from './versus.ts';

const countries: SimCountry[] = [{ iso2: 'US', gdp_usd: 30, region: 'NAC' }, { iso2: 'IN', gdp_usd: 4, region: 'SAS' }];
const co = (id: string, regions: { region: string; country: string | null; revenue_usd: number }[]) => ({ id, name: id, sector: null, listed: true, regions });
const musk: SimEmpire = {
  person: { id: 'm', slug: 'elon-musk', name: 'Elon Musk', net_worth_usd: 800 },
  companies: [co('Tesla', [{ region: 'US', country: 'US', revenue_usd: 50 }]), co('SpaceX', [])],
  stakes: [{ company: { id: 'Tesla' }, value: 400 }],
};
const ambani: SimEmpire = {
  person: { id: 'a', slug: 'mukesh-ambani', name: 'Mukesh Ambani', net_worth_usd: 100 },
  companies: [co('Reliance', [{ region: 'IN', country: 'IN', revenue_usd: 90 }])],
  stakes: [],
};
const opts = { home: (id: string) => (id === 'Reliance' ? 'IN' : 'US'), countryName: (iso: string) => (iso === 'IN' ? 'India' : iso) };

test('main company is the biggest recorded stake, else the most revenue; a market grab is fought where both sell', () => {
  assert.equal(mainCompany(musk)?.id, 'Tesla');
  assert.equal(mainCompany(ambani)?.id, 'Reliance');
  // No country both sell in: fought on the second rival's home.
  assert.equal(battleground(mainCompany(musk)!, mainCompany(ambani)!, opts.home), 'IN');
  assert.equal(battleground(mainCompany(ambani)!, mainCompany(musk)!, opts.home), 'US');
  assert.deepEqual(suggestedMatches([musk.person, ambani.person]).map(([x, y]) => [x.slug, y.slug]), [['elon-musk', 'mukesh-ambani']]);
});

test('the picked winner comes out ahead, and the story beats play as notifications', () => {
  const s = versusScenario(musk, ambani, 'market', 'b', opts)!;
  assert.deepEqual(s.versus, ['elon-musk', 'mukesh-ambani']);
  const frames = [0, 6, 12].map((m) => simulate(s, [musk, ambani], countries, m));
  const end = versusScore(frames[2], musk, ambani);
  assert.equal(end.lead, 'b');
  assert.equal(end.basis, 'shares'); // Ambani has no recorded stake, so the fair comparison is share prices
  assert.ok(end.a.delta! < 0); // Musk's recorded Tesla stake loses dollars
  const text = simEvents(s, frames, (id) => id, (slug) => slug).map((e) => e.text);
  assert.ok(text.includes('Elon and Mukesh fight for India'));
  assert.ok(text.includes('Mukesh takes India'));
  for (const b of s.beats!) assert.ok(!/\d/.test(b.text), b.text);
});
