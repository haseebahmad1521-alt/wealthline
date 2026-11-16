// World's Today view: who moved since their previous recorded value, and the company leaderboard. Everything comes
// from recorded values (latest net worth and the one before it, reported company revenue); nothing is projected.
import type { Contender } from './arena.ts';

export type Move<T> = { person: T; delta: number; base: number };

/** Each person's change since their previous value (people without both values, or a zero base, are left out). */
export function moves<T extends Contender>(people: T[]): Move<T>[] {
  return people
    .filter((p) => p.net_worth_usd != null && p.prev_net_worth_usd != null && p.prev_net_worth_usd > 0)
    .map((p) => ({ person: p, delta: (p.net_worth_usd as number) - (p.prev_net_worth_usd as number), base: p.prev_net_worth_usd as number }));
}

/** Counts up and down, plus the `count` biggest gains and drops in dollars. */
export function today<T extends Contender>(people: T[], count = 3) {
  const all = moves(people);
  const gains = all.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta);
  const drops = all.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta);
  return { up: gains.length, down: drops.length, gains: gains.slice(0, count), drops: drops.slice(0, count) };
}

type BoardCompany = { id: string; name: string; regions: { revenue_usd: number }[]; sites: unknown[] };

/**
 * Companies ranked by the yearly revenue they report, each company once with everyone tracked who holds it. Ranking
 * people by their companies' revenue counted one company's whole revenue for every co-owner (Alphabet's for Page, Brin
 * and Schmidt alike), so the board ranks companies instead.
 */
export function companyBoard<C extends BoardCompany, O>(empires: { companies: C[]; owner: O }[]) {
  const by = new Map<string, { company: C; owners: O[]; revenue: number; places: number }>();
  for (const e of empires) {
    for (const c of e.companies) {
      const row = by.get(c.id);
      if (row) row.owners.push(e.owner);
      else by.set(c.id, { company: c, owners: [e.owner], revenue: c.regions.reduce((n, r) => n + r.revenue_usd, 0), places: c.sites.length });
    }
  }
  return [...by.values()].sort((a, b) => b.revenue - a.revenue || b.places - a.places || a.company.name.localeCompare(b.company.name));
}
