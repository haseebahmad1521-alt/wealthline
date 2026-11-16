import assert from 'node:assert/strict';
import test from 'node:test';

import { checkShock, cleanProse, promptKey, ramp, sectorFor, type Catalog, type Scenario } from '../../supabase/functions/_shared/scenario.ts';
import { Z80, lineCountries, operatingLeverage, schedule, simEvents, simulate, type SimCountry, type SimEmpire } from './simulate.ts';

const countries: SimCountry[] = [
  { iso2: 'US', gdp_usd: 30, region: 'NAC' },
  { iso2: 'DE', gdp_usd: 4, region: 'ECS' },
  { iso2: 'SA', gdp_usd: 1, region: 'MEA' },
  { iso2: 'IR', gdp_usd: 1, region: 'MEA' },
  { iso2: 'NG', gdp_usd: 0.5, region: 'SSF' },
];
const co = (id: string, regions: SimEmpire['companies'][number]['regions'], sector: string | null = null) => ({ id, name: id, sector, listed: true, regions });
const person = (slug: string, worth: number) => ({ id: slug, slug, name: slug, net_worth_usd: worth });
const acme = co('acme', [{ region: 'US', country: 'US', revenue_usd: 60 }, { region: 'EMEA', country: null, revenue_usd: 40 }]);
const oil = co('oil', [{ region: 'US', country: 'US', revenue_usd: 10 }], 'energy');
const empires: SimEmpire[] = [
  { person: person('ann', 500), companies: [acme], stakes: [{ company: { id: 'acme' }, value: 200 }] },
  { person: person('bob', 450), companies: [acme, oil], stakes: [] },
  { person: person('cy', 100), companies: [oil], stakes: [{ company: { id: 'oil' }, value: 50 }] },
];
const scenario = (shocks: Scenario['shocks'], months = 12): Scenario => ({ id: 't', origin: 'example', title: 't', summary: '', plausibility: 'possible', reason: '', months, shocks, assumptions: [], sources: [] });

test('a regional line is split between its countries by GDP, leaving out countries reported on their own', () => {
  assert.deepEqual(lineCountries({ region: 'EMEA', country: null }, new Set(['DE']), countries).sort(), ['IR', 'NG', 'SA']);
  assert.deepEqual(lineCountries({ region: 'Americas Excluding United States', country: null }, new Set(), countries), []);
  assert.deepEqual(lineCountries({ region: 'Rest of world', country: null }, new Set(['US']), countries).sort(), ['DE', 'IR', 'NG', 'SA']);
});

test('a country shock moves only that country’s GDP share of a regional line, ramping in', () => {
  const s = scenario([{ kind: 'place', target: 'SA', pct: -0.5, from: 0, to: 4 }]);
  // EMEA 40 split over DE 4, SA 1, IR 1, NG 0.5 → SA share 1/6.5; −50% at full strength.
  const full = simulate(s, empires, countries, 4).companies.find((c) => c.company.id === 'acme')!;
  assert.ok(Math.abs(full.revenueDelta - 40 * (1 / 6.5) * -0.5) < 1e-9);
  assert.ok(Math.abs(full.price - full.revenueDelta / 100) < 1e-9);
  const half = simulate(s, empires, countries, 2).companies.find((c) => c.company.id === 'acme')!;
  assert.ok(Math.abs(half.revenueDelta - full.revenueDelta / 2) < 1e-9);
  assert.equal(simulate(s, empires, countries, 0).fills.length, 0);
  assert.deepEqual(simulate(s, empires, countries, 4).fills, [{ iso2: 'SA', pct: -0.5 }]);
});

test('fortunes move only through recorded stakes; others get their company’s percentage', () => {
  const f = simulate(scenario([{ kind: 'sector', target: 'energy', pct: 0.2, from: 0, to: 0 }]), empires, countries, 1);
  const cy = f.people.find((p) => p.person.slug === 'cy')!;
  assert.ok(Math.abs(cy.delta! - 10) < 1e-9);
  const bob = f.people.find((p) => p.person.slug === 'bob')!;
  assert.equal(bob.delta, null);
  assert.ok(Math.abs(bob.pct! - 0.2) < 1e-9);
  assert.equal(f.people.find((p) => p.person.slug === 'ann'), undefined);
});

test('a sale moves the shares at that month’s price plus the premium, and can change the ranking', () => {
  const s = scenario([
    { kind: 'market', target: '', pct: 0.1, from: 0, to: 0 },
    { kind: 'transfer', target: 'acme', person: 'ann', buyer: 'cy', fraction: 1, pct: 0.25, from: 6, to: 6 },
  ]);
  const before = simulate(s, empires, countries, 5);
  assert.ok(Math.abs(before.people.find((p) => p.person.slug === 'ann')!.delta! - 20) < 1e-9);
  const after = simulate(s, empires, countries, 6);
  const paid = 200 * 1.1 * 1.25; // 275
  assert.ok(Math.abs(after.transfers[0].paid - paid) < 1e-9);
  assert.equal(after.transfers[0].buyerShort, true); // cy's recorded 100 can't cover 275
  assert.ok(Math.abs(after.people.find((p) => p.person.slug === 'ann')!.delta! - (paid - 200)) < 1e-9);
  // cy: paid 275 for shares now worth 220, plus their own oil stake up 10%.
  assert.ok(Math.abs(after.people.find((p) => p.person.slug === 'cy')!.delta! - (220 - paid + 5)) < 1e-9);
});

test('Grok’s changes are checked against what is tracked', () => {
  const cat: Catalog = { companies: new Set(['acme']), people: new Set(['ann', 'cy']), countries: new Set(['SA']), holdings: new Set(['ann:acme']) };
  assert.deepEqual(checkShock({ kind: 'place', target: 'sa', pct: -0.3, from: 1, to: 3 }, 12, cat), { kind: 'place', target: 'SA', pct: -0.3, from: 1, to: 3 });
  assert.equal(typeof checkShock({ kind: 'place', target: 'XX', pct: -0.3, from: 1, to: 3 }, 12, cat), 'string');
  assert.equal(typeof checkShock({ kind: 'company', target: 'nope', pct: 0.1, from: 0, to: 1 }, 12, cat), 'string');
  assert.equal((checkShock({ kind: 'market', target: '', pct: -5, from: 0, to: 40 }, 12, cat) as { pct: number }).pct, -0.9);
  assert.equal(typeof checkShock({ kind: 'transfer', target: 'acme', person: 'cy', buyer: 'ann', fraction: 1, pct: 0, from: 0, to: 2 }, 12, cat), 'string');
  assert.equal((checkShock({ kind: 'transfer', target: 'acme', person: 'ann', buyer: 'cy', fraction: 1, pct: 0.2, from: 0, to: 2 }, 12, cat) as { from: number }).from, 2);
});

test('prose with figures is rejected; questions normalise for the cache; sectors map by priority', () => {
  assert.equal(cleanProse('Oil climbs as shipping halts.', 100), 'Oil climbs as shipping halts.');
  assert.equal(cleanProse('Oil climbs 30% as shipping halts.', 100), null);
  assert.equal(cleanProse('Tesla loses $40B.', 100), null);
  assert.equal(promptKey('  What if Iran and Saudi go to war?! '), 'what if iran and saudi go to war');
  assert.equal(sectorFor(['energy storage', 'automotive industry'])?.sector, 'autos');
  assert.equal(sectorFor(['petroleum industry'])?.sector, 'energy');
  assert.equal(sectorFor(['knitting']), null);
  assert.equal(ramp({ from: 2, to: 6 }, 4), 0.5);
});

test('notifications: each change as it starts, the sale, overtakes, and a closing line', () => {
  const s = scenario([
    { kind: 'place', target: 'SA', pct: -0.6, from: 1, to: 2 },
    { kind: 'transfer', target: 'acme', person: 'ann', buyer: 'cy', fraction: 1, pct: 0.25, from: 3, to: 3 },
  ], 4);
  const frames = [0, 1, 2, 3, 4].map((m) => simulate(s, empires, countries, m));
  const ev = simEvents(s, frames, (id) => id.toUpperCase(), (slug) => slug);
  const text = ev.map((e) => `${e.month}:${e.text}`);
  assert.equal(text[0], '0:t');
  assert.ok(text.includes('1:Business in Saudi Arabia collapses'));
  assert.ok(text.includes('3:cy buys ann’s ACME stake'));
  assert.ok(text.some((t) => t.startsWith('4:4 months on')));
  assert.deepEqual(ev.map((e) => e.month), [...ev.map((e) => e.month)].sort((a, b) => a - b));
});

test('notifications queue so each gets its own moment, and the film lasts until the last has shown', () => {
  const ev = [0, 0, 0, 5].map((month, i) => ({ month, text: String(i), tone: 'info' as const, about: { kind: 'world' as const } }));
  const { notes, length } = schedule(ev, 6);
  assert.deepEqual(notes.map((n) => n.tick), [0, 2, 4, 15]);
  assert.equal(length, 20); // 15 + 6 − 1 beats 6 months × 3
});

test('measured sensitivities move each company; a private one borrows its peers; ranges come from the errors', () => {
  const fit = (oil: number, se: number) => ({ beta: { market: 1, oil, china: 0, usd: 0, sector: 1 }, se: { market: 0.1, oil: se, china: 0, usd: 0, sector: 0 } });
  const company = (id: string, f: ReturnType<typeof fit> | null) => ({ id, name: id, sector: 'energy', listed: !!f, regions: [], fit: f });
  const people: SimEmpire[] = [
    { person: person('a', 100), companies: [company('drill', fit(0.6, 0.1))], stakes: [{ company: { id: 'drill' }, value: 50 }] },
    { person: person('b', 100), companies: [company('pipe', fit(0.2, 0.1))], stakes: [] },
    { person: person('c', 100), companies: [company('private-oil', null)], stakes: [] },
  ];
  const f = simulate(scenario([{ kind: 'factor', target: 'oil', pct: 0.5, from: 0, to: 0 }]), people, countries, 1);
  const move = (id: string) => f.companies.find((c) => c.company.id === id)!;
  // In log terms, as measured: a sensitivity b to a 50% oil rise moves the price by 1.5^b - 1.
  assert.ok(Math.abs(move('drill').price - (1.5 ** 0.6 - 1)) < 1e-9);
  assert.ok(Math.abs(move('pipe').price - (1.5 ** 0.2 - 1)) < 1e-9);
  assert.equal(move('drill').basis, 'measured');
  assert.equal(move('private-oil').basis, 'peers');
  assert.ok(Math.abs(move('private-oil').price - (1.5 ** 0.4 - 1)) < 1e-9); // the peers' average sensitivity, 0.4
  // 80% range, in log terms: ± 1.28 × se × log(1.5); never below -100%.
  const d = move('drill');
  assert.ok(Math.abs(Math.log(1 + d.hi) - Math.log(1 + d.lo) - 2 * Z80 * 0.1 * Math.log(1.5)) < 1e-9);
  const a = f.people.find((p) => p.person.slug === 'a')!;
  assert.ok(Math.abs(a.delta! - 50 * (1.5 ** 0.6 - 1)) < 1e-9);
  assert.ok(a.range![0] < 15 && a.range![1] > 15);
});

test('an analog becomes its measured market moves, scaled, with the spread between events as uncertainty', async () => {
  const { expandAnalogs } = await import('./analogs.ts');
  const data = {
    events: [],
    analogs: {
      mideast: { events: ['A', 'B'], mean: { market: -0.02, oil: 0.05, china: 0, usd: 0.0005, oilPrice: 0.06, sector: { energy: 0.03, defense: 0.02 } }, sd: { market: 0.01, oil: 0.04, china: 0, usd: 0, oilPrice: 0.05, sector: { energy: 0.02, defense: 0.01 } } },
    },
  };
  const s = expandAnalogs(scenario([{ kind: 'analog', target: 'mideast', pct: 2, from: 0, to: 0 }]), data);
  const kinds = s.shocks.map((x) => `${x.kind}:${x.target}:${Math.round(x.pct * 1000) / 1000}`);
  // Measured moves are log returns: a part's price change is e^(2 x mean) - 1.
  assert.deepEqual(kinds, ['analog:mideast:2', 'market::-0.039', 'factor:oil:0.105', 'sector:energy:0.062', 'sector:defense:0.041']);
  assert.match(s.assumptions.at(-1)!, /^Market moves as around 2 past middle east escalations, 2× as strongly: A; B\.$/);
  // Expanding again (a continued scenario) doesn't double anything.
  assert.deepEqual(expandAnalogs(s, data).shocks.length, s.shocks.length);
  // An energy company moves with its sector part; the spread between events widens its range.
  const fit = { beta: { market: 1, oil: 0, china: 0, usd: 0, sector: 1 }, se: { market: 0, oil: 0, china: 0, usd: 0, sector: 0 } };
  const e: SimEmpire[] = [{ person: person('o', 100), companies: [{ id: 'oilco', name: 'oilco', sector: 'energy', listed: true, regions: [], fit }], stakes: [] }];
  const f = simulate(s, e, countries, 1).companies[0];
  assert.ok(Math.abs(f.price - (Math.exp(-0.04 + 0.06) - 1)) < 1e-9);
  assert.ok(f.hi - f.lo > 0.05);
});

test('no price falls below zero, however hard the shock', () => {
  const fit = { beta: { market: 2.5, oil: 0, china: 0, usd: 0, sector: 0 }, se: { market: 0.5, oil: 0, china: 0, usd: 0, sector: 0 }, sd: 0.08 };
  const e: SimEmpire[] = [{ person: person('x', 100), companies: [{ id: 'risky', name: 'risky', sector: null, listed: true, regions: [], fit }], stakes: [{ company: { id: 'risky' }, value: 100 }] }];
  const f = simulate(scenario([{ kind: 'market', target: '', pct: -0.6, from: 0, to: 0 }]), e, countries, 1);
  const c = f.companies[0];
  assert.ok(c.price > -1 && c.lo > -1 && c.hi > c.lo, JSON.stringify([c.price, c.lo, c.hi]));
  assert.ok(f.people[0].range![0] > -100);
});

test('profit moves more than revenue, damped for thin margins', () => {
  // 20% margin, 30% of costs fixed: profit moves (0.2 + 0.3 x 0.8) / 0.2 = 2.2 times revenue.
  assert.ok(Math.abs(operatingLeverage(0.2) - 2.2) < 1e-9);
  assert.ok(Math.abs(operatingLeverage(0.6) - (0.6 + 0.3 * 0.4) / 0.6) < 1e-9);
  assert.equal(operatingLeverage(0.06), 3); // capped
  assert.equal(operatingLeverage(0.04), 1); // too thin to say: price follows revenue
  assert.equal(operatingLeverage(-0.1), 1); // a loss
  assert.equal(operatingLeverage(null), 1);
});

test('a revenue loss reaches the price through profit', () => {
  const company = (margin: number | null) => ({ id: `c${margin}`, name: 'c', sector: null, listed: true, regions: [{ region: 'Germany', country: 'DE', revenue_usd: 100 }], margin });
  const e: SimEmpire[] = [
    { person: person('a', 100), companies: [company(0.2)], stakes: [{ company: { id: 'c0.2' }, value: 100 }] },
    { person: person('b', 100), companies: [company(null)], stakes: [{ company: { id: 'cnull' }, value: 100 }] },
  ];
  const f = simulate(scenario([{ kind: 'place', target: 'DE', pct: -0.1, from: 0, to: 0 }]), e, [{ iso2: 'DE', gdp_usd: 1, region: 'ECS' }], 1);
  const by = (id: string) => f.companies.find((c) => c.company.id === id)!;
  assert.ok(Math.abs(by('c0.2').price - (1 - 0.22 - 1)) < 1e-9, String(by('c0.2').price));
  assert.ok(Math.abs(by('cnull').price - -0.1) < 1e-9);
  assert.ok(Math.abs(by('c0.2').leverage - 2.2) < 1e-9);
});

test('last time this happened: past events behind a scenario, and a replay of one', async () => {
  const { pastEvents, replayScenario } = await import('./analogs.ts');
  const moves = (m: number, oilPrice: number) => ({ market: m, oil: 0.1, china: 0, usd: 0, oilPrice, sector: { energy: 0.05, defense: 0.01 } });
  const data = {
    analogs: {},
    events: [
      { key: 'old', analog: 'mideast', label: 'Old one', from: '2019-01-01', weeks: 2, moves: moves(-0.02, 0.05) },
      { key: 'new', analog: 'mideast', label: 'New one', from: '2024-01-01', weeks: 1, moves: moves(-0.03, 0.1) },
      { key: 'other', analog: 'banking', label: 'Other', from: '2023-01-01', weeks: 2, moves: moves(-0.04, 0) },
    ],
  };
  const s = scenario([{ kind: 'analog', target: 'mideast', pct: 1, from: 0, to: 1 }]);
  assert.deepEqual(pastEvents(s, data).map((e) => e.key), ['new', 'old']);
  assert.deepEqual(pastEvents(scenario([]), data), []);
  const r = replayScenario('new', data)!;
  assert.equal(r.id, 'replay:new');
  // Measured log moves become price moves; small sector moves stay quiet; oil gets a story line.
  assert.ok(Math.abs(r.shocks.find((x) => x.kind === 'market')!.pct - (Math.exp(-0.03) - 1)) < 1e-12);
  assert.equal(r.shocks.some((x) => x.kind === 'sector' && x.target === 'energy' && !('quiet' in x && x.quiet)), true);
  assert.equal(r.shocks.some((x) => x.kind === 'sector' && x.target === 'defense' && 'quiet' in x && x.quiet), true);
  assert.equal(r.beats?.[0]?.text, 'Oil prices jump');
  assert.equal(replayScenario('missing', data), null);
});

test('today’s exposure: each person once per side, biggest share of fortune first', async () => {
  const { exposure } = await import('./exposure.ts');
  const mv = (slug: string, worth: number, delta: number | null, pct: number | null = null) => ({ person: person(slug, worth), delta, pct, via: 'x' });
  const s1 = scenario([]);
  const s2 = { ...scenario([]), id: 't2' };
  const items = [
    { scenario: s1, winners: [mv('a', 100, 10), mv('b', 100, 2)], losers: [mv('c', 100, -30)], moved: 3 },
    { scenario: s2, winners: [mv('a', 100, 20), mv('d', 100, null, 0.05)], losers: [mv('a', 100, -5)], moved: 3 },
  ];
  const { gain, risk } = exposure(items, 3);
  assert.deepEqual(gain.map((g) => [g.move.person.slug, g.scenario.id]), [['a', 't2'], ['d', 't2'], ['b', 't']]);
  assert.deepEqual(risk.map((g) => g.move.person.slug), ['c', 'a']); // a gains in one storyline and loses in another
});
