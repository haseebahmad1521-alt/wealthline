// Measured sensitivities for the simulations, ready to use: each company's own (src/data/factors.json, built by
// scripts/build-factors.mjs, or the backend's weekly copy once deployed), with the factor links folded in. A shock to
// oil, Chinese stocks or the dollar also moves the other factors and the sector funds by their typical co-movement, so
// a company's total sensitivity to an oil shock = its oil beta + its sector beta × how its sector fund follows oil +
// its China and dollar betas × how those follow oil.
import reference from '@/data/factors.json';
import type { SimFit } from '@/lib/simulate';

type Raw = { beta: Record<string, number>; se: Record<string, number>; sector?: string | null; sd?: number };
export type Links = Record<'oil' | 'china' | 'usd', { oil: number; china: number; usd: number; sector: Record<string, number> }>;

export function effectiveFit(raw: Raw, sector: string | null | undefined, links: Links | null): SimFit {
  if (!links) return { beta: { ...raw.beta }, se: { ...raw.se }, sd: raw.sd, raw: { ...raw.beta } };
  const beta = { ...raw.beta };
  const se = { ...raw.se };
  for (const d of ['oil', 'china', 'usd'] as const) {
    const l = links[d];
    const others = (['oil', 'china', 'usd'] as const).filter((g) => g !== d);
    const viaSector = (raw.beta.sector ?? 0) * (sector ? (l.sector[sector] ?? 0) : 0);
    beta[d] = (raw.beta[d] ?? 0) + viaSector + others.reduce((n, g) => n + (raw.beta[g] ?? 0) * l[g], 0);
    const seSector = (raw.se.sector ?? 0) * (sector ? Math.abs(l.sector[sector] ?? 0) : 0);
    se[d] = Math.sqrt((raw.se[d] ?? 0) ** 2 + seSector ** 2 + others.reduce((n, g) => n + ((raw.se[g] ?? 0) * l[g]) ** 2, 0));
  }
  return { beta, se, sd: raw.sd, raw: { ...raw.beta } };
}

export type Backtest = { overall: Record<'naive' | 'plain' | 'improved' | 'crisis', number>; events: { event: string; improved: number; naive: number; coverage: number | null }[] };

/** The shipped reference: fits by company id, the factor links, the window they were measured over, and the backtest. */
export const REFERENCE = {
  backtest: (reference as { backtest?: Backtest }).backtest ?? null,
  links: (reference as { links?: Links }).links ?? null,
  window: (reference as { window?: { from: string; to: string } }).window ?? null,
  raw: new Map(Object.entries((reference as { companies: Record<string, Raw> }).companies)),
};
