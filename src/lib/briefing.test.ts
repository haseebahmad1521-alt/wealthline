import assert from 'node:assert/strict';
import test from 'node:test';

import { marketList, oddsFor, parseMarkets } from '../../supabase/functions/_shared/polymarket.ts';
import { briefing } from './briefing.ts';
import type { SimEmpire } from './simulate.ts';

test('only open yes/no markets are offered, and only an offered one is kept', () => {
  const markets = parseMarkets([
    { id: 1, question: 'Will the US strike Iran by June?', outcomes: '["Yes","No"]', outcomePrices: '["0.23","0.77"]', slug: 'us-iran', volume: '1000' },
    { id: 2, question: 'Who wins the final?', outcomes: '["Team A","Team B"]', outcomePrices: '["0.5","0.5"]', slug: 'final' },
    { id: 3, question: 'Closed one?', outcomes: '["Yes","No"]', outcomePrices: '["1","0"]', slug: 'x', closed: true },
    { id: 4, question: 'Broken', outcomes: 'not json' },
  ]);
  assert.deepEqual(markets.map((m) => m.id), ['1']);
  assert.equal(markets[0].yes, 0.23);
  assert.equal(marketList(markets), '1 | Will the US strike Iran by June? | Yes 23%');
  const offered = new Map(markets.map((m) => [m.id, m]));
  const odds = oddsFor('1', offered, new Date('2026-11-16T00:00:00Z'))!;
  assert.deepEqual([odds.yes, odds.url], [0.23, 'https://polymarket.com/market/us-iran']);
  assert.equal(oddsFor('999', offered, new Date()), null); // Grok can't invent a market
  assert.equal(oddsFor('', offered, new Date()), null);
});

test('the briefing lists who gains and loses most at the end of each storyline', () => {
  const fit = (oil: number) => ({ beta: { market: 1, oil, china: 0, usd: 0, sector: 0 }, se: { market: 0, oil: 0, china: 0, usd: 0, sector: 0 }, raw: { market: 1, oil, china: 0, usd: 0, sector: 0 } });
  const person = (id: string) => ({ id, slug: id, name: id, net_worth_usd: 100 });
  const co = (id: string, oil: number) => ({ id, name: id, sector: null, listed: true, regions: [], fit: fit(oil) });
  const empires: SimEmpire[] = [
    { person: person('driller'), companies: [co('d', 0.8)], stakes: [] },
    { person: person('refiner'), companies: [co('r', 0.3)], stakes: [] },
    { person: person('airline'), companies: [co('a', -0.6)], stakes: [] },
    { person: person('shipper'), companies: [co('s', -0.2)], stakes: [] },
  ];
  const s = { id: 'x', origin: 'daily' as const, title: 'Oil spike.', summary: '', plausibility: 'possible' as const, reason: '', months: 6, shocks: [{ kind: 'factor' as const, target: 'oil' as const, pct: 0.5, from: 0, to: 2 }], assumptions: [], sources: [] };
  const [item] = briefing([s], empires, [], null);
  assert.deepEqual(item.winners.map((p) => p.person.slug), ['driller', 'refiner']);
  assert.deepEqual(item.losers.map((p) => p.person.slug), ['airline', 'shipper']);
  assert.equal(item.moved, 4);
});
