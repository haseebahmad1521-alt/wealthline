// World simulations: where scenarios come from. Grok's daily set and answers to typed questions live in
// `world_scenarios` (supabase/functions/scenarios); a few built-in examples work before that is deployed. Sectors and
// country regions, which the calculation uses, load in their own query that falls back to nothing: World keeps working
// if the migration isn't applied yet.
import { useQuery } from '@tanstack/react-query';

import type { Scenario, Shock } from '../../supabase/functions/_shared/scenario.ts';
import reference from '@/data/sim-reference.json';
import { effectiveFit, REFERENCE, type Links } from '@/lib/factor-data';
import type { SimFit } from '@/lib/simulate';
import { db } from '@/lib/supabase';
import type { Empire } from '@/lib/world';

export type { Scenario, Shock };

/**
 * Sectors (by company id), World Bank regions (by country) and measured sensitivities (by company id). Starts from the
 * shipped reference files (src/data/sim-reference.json, src/data/factors.json); the backend's own values win once it
 * has them (the facts job and the weekly factors job).
 */
export function useSimData() {
  return useQuery({
    queryKey: ['world-sim-data'],
    staleTime: 6 * 3600_000,
    placeholderData: () => withFits(fromReference(), REFERENCE.raw, REFERENCE.links),
    queryFn: async () => {
      const [cos, regions, factors, model] = await Promise.all([
        db().from('companies').select('id, sector'),
        db().from('countries').select('iso2, region'),
        db().from('company_factors').select('company_id, beta, se'),
        db().from('factor_model').select('links, window_from, window_to').order('fitted_at', { ascending: false }).limit(1),
      ]);
      const out = fromReference();
      for (const c of cos.error ? [] : (cos.data ?? [])) if (c.sector) out.sectors.set(c.id as string, c.sector as string);
      for (const c of regions.error ? [] : (regions.data ?? [])) if (c.region) out.regions.set(c.iso2 as string, c.region as string);
      const raw = new Map(REFERENCE.raw);
      for (const f of factors.error ? [] : (factors.data ?? [])) raw.set(f.company_id as string, { beta: f.beta, se: f.se });
      const links = (!model.error && model.data?.[0]?.links) || REFERENCE.links;
      return withFits(out, raw, links);
    },
  });
}

function fromReference() {
  return {
    sectors: new Map(Object.entries(reference.sectors).map(([id, s]) => [id, s.sector])),
    regions: new Map(Object.entries(reference.regions)),
  };
}

function withFits(base: ReturnType<typeof fromReference>, raw: typeof REFERENCE.raw, links: Links | null) {
  const fits = new Map<string, SimFit>();
  for (const [id, r] of raw) fits.set(id, effectiveFit(r, base.sectors.get(id) ?? r.sector ?? null, links));
  return { ...base, fits };
}

type Row = Omit<Scenario, 'origin'> & { origin: 'daily' | 'prompt' | 'versus'; created_at?: string };
const fromRow = (r: Row): Scenario => ({ ...r, assumptions: r.assumptions ?? [], sources: r.sources ?? [], beats: r.beats ?? [] });

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

/** The questions and matches asked most in the last week (answers stored by the backend); empty until there are some. */
export function useMostAsked() {
  return useQuery({
    queryKey: ['world-most-asked'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const { data, error } = await db().from('world_scenarios').select('*').in('origin', ['prompt', 'versus']).gte('created_at', since).order('asks', { ascending: false }).order('created_at', { ascending: false }).limit(8);
      return error || !data ? ([] as (Scenario & { asks?: number })[]) : (data as (Row & { asks?: number })[]).map((r) => ({ ...fromRow(r), asks: r.asks }));
    },
  });
}

/** A stored scenario by id (a shared link to a Grok scenario); null when it isn't there. */
export async function fetchScenario(id: string): Promise<Scenario | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db().from('world_scenarios').select('*').eq('id', id).maybeSingle();
  return error || !data ? null : fromRow(data as Row);
}

/** Asks Grok (through the backend) for a rivalry between two tracked people. */
export async function askVersus(a: string, b: string): Promise<{ scenario: Scenario } | { error: string }> {
  try {
    const { data, error } = await db().functions.invoke('scenarios', { body: { versus: [a, b] } });
    if (data?.scenario) return { scenario: fromRow(data.scenario as Row) };
    if (data?.declined) return { error: String(data.declined) };
    const body = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    return { error: body?.error ?? 'Grok-written matches aren’t switched on yet. Fight uses the built-in match.' };
  } catch {
    return { error: 'Couldn’t reach the simulator. Fight uses the built-in match.' };
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
      { kind: 'factor', target: 'oil', pct: 0.5, from: 0, to: 2 },
      { kind: 'sector', target: 'transport', pct: -0.1, from: 0, to: 3 },
      { kind: 'market', target: '', pct: -0.1, from: 0, to: 3 },
    ],
    assumptions: [
      'Business in Iran falls by about two thirds and in Saudi Arabia by half within two months.',
      'Brent oil rises by half; companies move by how their shares have followed oil since 2023.',
      'Global stocks fall by a tenth on the risk, and transport trails the market by a tenth.',
    ],
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
      { kind: 'factor', target: 'china', pct: -0.25, from: 0, to: 6 },
      { kind: 'sector', target: 'technology', pct: -0.08, from: 0, to: 6 },
      { kind: 'market', target: '', pct: -0.05, from: 0, to: 6 },
    ],
    assumptions: [
      'Companies lose about two fifths of their business in China.',
      'Chinese stocks fall by a quarter; companies move by how their shares have followed them since 2023.',
      'US tech trails the market by about a twelfth; global stocks fall by a twentieth.',
    ],
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
