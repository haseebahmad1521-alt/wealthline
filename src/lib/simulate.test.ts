import assert from 'node:assert/strict';
import test from 'node:test';

import { checkShock, cleanProse, promptKey, ramp, sectorFor, type Catalog, type Scenario } from '../../supabase/functions/_shared/scenario.ts';
import { lineCountries, schedule, simEvents, simulate, type SimCountry, type SimEmpire } from './simulate.ts';

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
