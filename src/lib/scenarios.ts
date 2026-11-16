// World simulations: where scenarios come from. Grok's daily set and answers to typed questions live in
// `world_scenarios` (supabase/functions/scenarios); a few built-in examples work before that is deployed. Sectors and
// country regions, which the calculation uses, load in their own query that falls back to nothing: World keeps working
// if the migration isn't applied yet.
import { useQuery } from '@tanstack/react-query';

import type { Scenario, Shock } from '../../supabase/functions/_shared/scenario.ts';
import reference from '@/data/sim-reference.json';
import { db } from '@/lib/supabase';
import type { Empire } from '@/lib/world';

export type { Scenario, Shock };

/**
 * Sectors (by company id) and World Bank regions (by country). Starts from src/data/sim-reference.json (built by
 * scripts/build-sim-reference.mjs from the World Bank and Wikidata); the backend's own values win once it has them.
 */
export function useSimData() {
  return useQuery({
    queryKey: ['world-sim-data'],
    staleTime: 6 * 3600_000,
    placeholderData: fromReference,
    queryFn: async () => {
      const [cos, regions] = await Promise.all([
        db().from('companies').select('id, sector'),
        db().from('countries').select('iso2, region'),
      ]);
      const out = fromReference();
      for (const c of cos.error ? [] : (cos.data ?? [])) if (c.sector) out.sectors.set(c.id as string, c.sector as string);
      for (const c of regions.error ? [] : (regions.data ?? [])) if (c.region) out.regions.set(c.iso2 as string, c.region as string);
      return out;
    },
  });
}

function fromReference() {
  return {
    sectors: new Map(Object.entries(reference.sectors).map(([id, s]) => [id, s.sector])),
    regions: new Map(Object.entries(reference.regions)),
  };
}

type Row = Omit<Scenario, 'origin'> & { origin: 'daily' | 'prompt'; created_at?: string };
const fromRow = (r: Row): Scenario => ({ ...r, assumptions: r.assumptions ?? [], sources: r.sources ?? [] });

/** The latest daily set from Grok, most plausible first; empty when there is none (or the table isn't there yet). */
export function useDailyScenarios() {
  return useQuery({
    queryKey: ['world-scenarios'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().from('world_scenarios').select('*').eq('origin', 'daily').order('run_date', { ascending: false }).order('position').limit(10);
      if (error || !data?.length) return [] as Scenario[];
      const latest = data[0].run_date;
      return (data as Row[]).filter((r) => r.run_date === latest).map(fromRow);
    },
  });
}

/** Asks Grok (through the backend) for a scenario answering `prompt`. */
export async function askScenario(prompt: string): Promise<{ scenario: Scenario } | { error: string }> {
  try {
    const { data, error } = await db().functions.invoke('scenarios', { body: { prompt } });
    if (data?.scenario) return { scenario: fromRow(data.scenario as Row) };
    if (data?.declined) return { error: String(data.declined) };
    // A non-2xx reply carries its message in the response body.
    const body = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    return { error: body?.error ?? 'Simulations from your own question aren’t switched on yet. Try an example.' };
  } catch {
    return { error: 'Couldn’t reach the simulator. Try an example.' };
  }
}

// Built-in examples, written by hand. Their sizes are stated assumptions, shown with the scenario; they name people and
// companies by name and resolve to whatever is tracked, so a missing one simply drops out.
type ExampleShock =
  | (Omit<Extract<Shock, { kind: 'company' }>, 'target'> & { company: string })
  | (Omit<Extract<Shock, { kind: 'transfer' }>, 'target' | 'person' | 'buyer'> & { company: string; person: string; buyer: string })
  | Exclude<Shock, { kind: 'company' } | { kind: 'transfer' }>;
type Example = Omit<Scenario, 'shocks' | 'origin'> & { shocks: ExampleShock[] };

const EXAMPLES: Example[] = [
  {
    id: 'example-tesla-page',
    title: 'Elon Musk sells his Tesla stake to Larry Page.',
    summary: 'Musk sells all his recorded Tesla shares to Page at a premium in month three. Investors mark Tesla down as its founder leaves; Page carries the stake from then on.',
    plausibility: 'unlikely',
    reason: 'Musk has never signalled selling control of Tesla, and the stake is larger than Page’s fortune.',
    months: 12,
    shocks: [
      { kind: 'transfer', company: 'Tesla', person: 'Elon Musk', buyer: 'Larry Page', fraction: 1, pct: 0.2, from: 3, to: 3 },
      { kind: 'company', company: 'Tesla', pct: -0.15, from: 3, to: 6 },
    ],
    assumptions: ['Sale at a fifth above the market price, paid in cash.', 'Tesla’s price falls by about a seventh over three months as the founder leaves.'],
    sources: [],
  },
  {
    id: 'example-iran-saudi',
    title: 'Iran and Saudi Arabia go to war.',
    summary: 'Fighting in the Gulf disrupts oil exports and shipping. Business in both countries collapses, energy companies gain on higher oil prices, transport companies lose, and markets fall on the risk.',
    plausibility: 'unlikely',
    reason: 'Both sides have pursued détente since the China-brokered deal, though proxy conflicts continue.',
    months: 12,
    shocks: [
      { kind: 'place', target: 'IR', pct: -0.7, from: 0, to: 2 },
      { kind: 'place', target: 'SA', pct: -0.5, from: 0, to: 2 },
      { kind: 'place', target: 'AE', pct: -0.25, from: 0, to: 3 },
      { kind: 'sector', target: 'energy', pct: 0.25, from: 0, to: 2 },
      { kind: 'sector', target: 'transport', pct: -0.2, from: 0, to: 3 },
      { kind: 'market', target: '', pct: -0.1, from: 0, to: 3 },
    ],
    assumptions: ['Business in Iran falls by about two thirds and in Saudi Arabia by half within two months.', 'Energy shares rise by a quarter; transport falls by a fifth.', 'Listed shares fall by a tenth on the risk.'],
    sources: [],
  },
  {
    id: 'example-us-china',
    title: 'The US and China cut trade ties.',
    summary: 'New tariffs and export bans close most trade between the two largest economies over six months. Companies that sell into China lose that business, and technology supply chains are hit hardest.',
    plausibility: 'possible',
    reason: 'Tariffs and chip export controls have escalated in rounds for years.',
    months: 12,
    shocks: [
      { kind: 'place', target: 'CN', pct: -0.4, from: 0, to: 6 },
      { kind: 'place', target: 'TW', pct: -0.15, from: 2, to: 6 },
      { kind: 'sector', target: 'technology', pct: -0.12, from: 0, to: 6 },
      { kind: 'market', target: '', pct: -0.05, from: 0, to: 6 },
    ],
    assumptions: ['Companies lose about two fifths of their business in China.', 'Technology shares fall by about an eighth; all listed shares by a twentieth.'],
    sources: [],
  },
];

/** The examples with names resolved to tracked ids; changes naming something untracked are left out. */
export function examples(empires: Empire[]): Scenario[] {
  const companyId = new Map<string, string>();
  const slug = new Map<string, string>();
  for (const e of empires) {
    slug.set(e.person.name.replace(/ & family$/, ''), e.person.slug);
    for (const c of e.companies) companyId.set(c.name, c.id);
  }
  return EXAMPLES.map((x) => ({
    ...x,
    origin: 'example' as const,
    shocks: x.shocks.flatMap((s): Shock[] => {
      if (s.kind === 'company') {
        const id = companyId.get(s.company);
        return id ? [{ kind: 'company', target: id, pct: s.pct, from: s.from, to: s.to }] : [];
      }
      if (s.kind === 'transfer') {
        const [id, p, b] = [companyId.get(s.company), slug.get(s.person), slug.get(s.buyer)];
        return id && p && b ? [{ kind: 'transfer', target: id, person: p, buyer: b, fraction: s.fraction, pct: s.pct, from: s.from, to: s.to }] : [];
      }
      return [s];
    }),
  })).filter((x) => x.shocks.length);
}
