import assert from 'node:assert/strict';
import test from 'node:test';

import { simEvents, simulate, type SimCountry, type SimEmpire } from './simulate.ts';
import { battleground, callMatch, mainCompany, suggestedMatches, versusScenario, versusScore } from './versus.ts';

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

test('the called winner comes out ahead, and the story beats play as notifications', () => {
  const s = versusScenario(musk, ambani, { battle: 'market', winner: 'b', why: 'test' }, opts)!;
  assert.deepEqual(s.versus, ['elon-musk', 'mukesh-ambani']);
  assert.ok(s.reason.includes('recorded numbers only'));
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

const empire = (slug: string, company: { id: string; sector?: string | null; margin?: number | null; regions: { region: string; country: string | null; revenue_usd: number }[] }): SimEmpire => ({
  person: { id: slug, slug, name: slug.replace('-', ' '), net_worth_usd: 100 },
  companies: [{ name: company.id, listed: true, sector: null, ...company }],
  stakes: [{ company: { id: company.id }, value: 50 }],
});
const names = { countryName: (iso: string) => iso };

test('a match is called on recorded numbers by a stated rule, or not at all', () => {
  // Both sell in the US: a fight for that market, won by whoever sells more there.
  const x = empire('a-x', { id: 'X', regions: [{ region: 'US', country: 'US', revenue_usd: 80 }] });
  const y = empire('b-y', { id: 'Y', regions: [{ region: 'US', country: 'US', revenue_usd: 30 }, { region: 'IN', country: 'IN', revenue_usd: 90 }] });
  assert.deepEqual(callMatch(x, y, names), { battle: 'market', winner: 'a', why: 'Both sell in US, and X already sells more there (recorded revenue).' });
  // Too close: no call.
  const z = empire('c-z', { id: 'Z', regions: [{ region: 'US', country: 'US', revenue_usd: 76 }] });
  assert.ok('error' in callMatch(x, z, names) && /Too close/.test((callMatch(x, z, names) as { error: string }).error));
  // No shared market, same sector: a price war won by the fatter margin.
  const p = empire('d-p', { id: 'P', sector: 'autos', margin: 0.08, regions: [{ region: 'US', country: 'US', revenue_usd: 100 }] });
  const q = empire('e-q', { id: 'Q', sector: 'autos', margin: 0.15, regions: [{ region: 'CN', country: 'CN', revenue_usd: 50 }] });
  assert.equal((callMatch(p, q, names) as { battle: string }).battle, 'price');
  assert.equal((callMatch(p, q, names) as { winner: string }).winner, 'b');
  // Different sectors: talent, won by the bigger operating profit (100 × 0.08 = 8 against 50 × 0.3 = 15).
  const r = empire('f-r', { id: 'R', sector: 'technology', margin: 0.3, regions: [{ region: 'CN', country: 'CN', revenue_usd: 50 }] });
  assert.deepEqual([(callMatch(p, r, names) as { battle: string }).battle, (callMatch(p, r, names) as { winner: string }).winner], ['talent', 'b']);
  // A missing margin is named, never guessed.
  const n = empire('g-n', { id: 'N', sector: 'technology', regions: [{ region: 'CN', country: 'CN', revenue_usd: 50 }] });
  assert.deepEqual(callMatch(p, n, names), { error: 'Not enough recorded numbers to call it: no operating margin for N.' });
});

test('in a called match the scoreboard ends with the called winner ahead', () => {
  const p = empire('d-p', { id: 'P', sector: 'autos', margin: 0.08, regions: [{ region: 'US', country: 'US', revenue_usd: 100 }] });
  const q = empire('e-q', { id: 'Q', sector: 'autos', margin: 0.15, regions: [{ region: 'CN', country: 'CN', revenue_usd: 50 }] });
  for (const call of [callMatch(p, q, names), callMatch(q, p, names)]) {
    if ('error' in call) throw new Error(call.error);
    const [first, second] = call.winner === 'b' ? [p, q] : [q, p];
    const s = versusScenario(first, second, call, opts)!;
    const end = versusScore(simulate(s, [first, second], countries, 12), first, second);
    assert.equal(end.lead, call.winner);
  }
});
