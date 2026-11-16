// What moves a fortune: its recorded listed stakes (shares × latest price) weighted by each company's measured
// sensitivities to global stocks, oil, Chinese stocks and the dollar, and where those companies earn their revenue.
// Other assets (private companies, cash, property) are held still: the figures cover only the stakes.
import { mixVariance, MONTH_WEEKS, type Covariance } from './races.ts';
import type { SimFit } from './simulate.ts';

export type Driver = { factor: 'market' | 'oil' | 'china' | 'usd'; dollars: number };
export type StakeValue = { companyId: string; value: number };

/** Dollars the stakes move for a 10% rise in each force, largest first. Companies without a measured fit are skipped. */
export function drivers(stakes: StakeValue[], fits: Map<string, SimFit>): { drivers: Driver[]; measured: number } {
  const factors = ['market', 'oil', 'china', 'usd'] as const;
  const used = stakes.filter((s) => s.value > 0 && fits.has(s.companyId));
  const out = factors.map((f) => ({ factor: f, dollars: used.reduce((n, s) => n + s.value * (fits.get(s.companyId)!.beta[f] ?? 0) * 0.1, 0) }));
  return { drivers: out.sort((a, b) => Math.abs(b.dollars) - Math.abs(a.dollars)), measured: used.reduce((n, s) => n + s.value, 0) };
}

/** The ± dollars the stakes stay within in four months out of five (calibrated width), or null without swings. */
export function typicalMonth(stakes: StakeValue[], c: Covariance): number | null {
  const v = mixVariance(new Map(stakes.map((s) => [s.companyId, s.value])), c);
  return v ? Math.sqrt(v * MONTH_WEEKS) * c.calibration.z80 : null;
}

type Line = { region: string; country: string | null; share: number; fiscal_year: number };

/**
 * Where the stakes' companies earn: each company's latest year of revenue by place, weighted by the stake's value.
 * Places as each company reports them (a country, or a region like "Europe"); the rest is "Elsewhere".
 */
export function revenuePlaces(stakes: StakeValue[], lines: (companyId: string) => Line[], countryName: (iso2: string) => string, top = 4): { place: string; share: number }[] {
  const by = new Map<string, number>();
  let total = 0;
  for (const s of stakes) {
    const all = lines(s.companyId);
    if (!all.length || s.value <= 0) continue;
    const year = Math.max(...all.map((l) => l.fiscal_year));
    const latest = all.filter((l) => l.fiscal_year === year);
    const sum = latest.reduce((n, l) => n + l.share, 0);
    if (!sum) continue;
    total += s.value;
    for (const l of latest) {
      const place = l.country ? countryName(l.country) : l.region;
      by.set(place, (by.get(place) ?? 0) + (s.value * l.share) / sum);
    }
  }
  if (!total) return [];
  const ranked = [...by].map(([place, v]) => ({ place, share: v / total })).sort((a, b) => b.share - a.share);
  const head = ranked.slice(0, top);
  const rest = 1 - head.reduce((n, p) => n + p.share, 0);
  return rest > 0.005 ? [...head, { place: 'Elsewhere', share: rest }] : head;
}
