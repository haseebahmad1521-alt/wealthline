// The residual ledger: every week, what the factor model expected each company's share price to do given how the
// factors actually moved, what it did, and the gap. The gap is the part the model can't yet explain; candidate
// explanations are tested against the accumulated gaps (scripts/test-residuals.mjs) before any reaches the app.
//
// Honesty rules:
//   - A week's prediction uses only weeks before it: the factors' market stripping and each company's sensitivities
//     are fitted on earlier weeks, then shrunk toward sector peers, exactly as the weekly fit does.
//   - The ledger is append-only: a recorded week is never rewritten (the job inserts and skips existing rows).
//   - Weeks filled in after the fact ("backfill", for the year before the ledger began, or a week the job missed) are
//     marked as such; they are still out of sample, only not recorded at the time.
import { FACTORS, fitCompany, residualize, shrink, type Factor, type Fit } from './factors.ts';

export type LedgerCompany = { id: string; sector: string | null; returns: Map<string, number> };
export type LedgerRow = {
  company_id: string;
  week: string;
  actual: number;
  predicted: number;
  residual: number;
  sd: number;
  moves: Record<Factor, number>;
  beta: Record<Factor, number>;
  fit_through: string;
  kind: 'live' | 'backfill';
};

/** The model's expected move: each sensitivity times its factor's move that week (no intercept, as in the simulations). */
export function expectedMove(beta: Record<Factor, number>, moves: Record<Factor, number>): number {
  return FACTORS.reduce((n, f) => n + (beta[f] ?? 0) * (moves[f] ?? 0), 0);
}

/**
 * Ledger rows for `targets` (ISO weeks, ascending). Targets are taken in blocks of up to `block` consecutive weeks;
 * each block is predicted with sensitivities fitted on the weeks before its first week, so nothing after a week can
 * reach its prediction. `live` is the week recorded as it happened.
 */
export function ledgerRows(
  companies: LedgerCompany[],
  series: { market: Map<string, number>; oil: Map<string, number>; china: Map<string, number>; usd: Map<string, number> },
  sectorFunds: Record<string, Map<string, number>>,
  targets: string[],
  live: string | null,
  block = 13,
): LedgerRow[] {
  const out: LedgerRow[] = [];
  for (let i = 0; i < targets.length; i += block) {
    const weeks = targets.slice(i, i + block);
    const first = weeks[0];
    const before = (w: string) => w < first;
    const own = { oil: residualize(series.oil, series.market, before), china: residualize(series.china, series.market, before), usd: residualize(series.usd, series.market, before) };
    const sectorOwn = Object.fromEntries(Object.entries(sectorFunds).map(([k, v]) => [k, residualize(v, series.market, before)]));
    const fitted: { id: string; sector: string | null; fit: Fit }[] = [];
    for (const c of companies) {
      const factors = { market: series.market, ...own, sector: c.sector ? (sectorOwn[c.sector] ?? null) : null };
      const fit = fitCompany(c.returns, factors, { halfLife: 156, only: before });
      if (fit) fitted.push({ id: c.id, sector: c.sector, fit });
    }
    const shrunk = shrink(fitted);
    const fitThrough = [...series.market.keys()].filter(before).sort().pop() ?? first;
    for (const c of companies) {
      const fit = shrunk.get(c.id);
      if (!fit) continue;
      for (const w of weeks) {
        const actual = c.returns.get(w);
        const sectorMove = c.sector ? sectorOwn[c.sector]?.get(w) : undefined;
        const moves = { market: series.market.get(w), oil: own.oil.get(w), china: own.china.get(w), usd: own.usd.get(w), sector: sectorMove ?? 0 } as Record<Factor, number | undefined>;
        // A sector move is needed only when the company has a sector sensitivity.
        if (actual == null || FACTORS.some((f) => moves[f] == null) || (fit.se.sector && sectorMove == null)) continue;
        const m = moves as Record<Factor, number>;
        const predicted = expectedMove(fit.beta, m);
        out.push({ company_id: c.id, week: w, actual, predicted, residual: actual - predicted, sd: fit.sd, moves: m, beta: fit.beta, fit_through: fitThrough, kind: w === live ? 'live' : 'backfill' });
      }
    }
  }
  return out;
}

/** The last complete ISO week at `now`: the current week only once it's Saturday or Sunday (UTC). */
export function lastCompleteWeek(weeks: string[], now: Date, weekKey: (t: number) => string): string | null {
  const day = now.getUTCDay();
  const current = weekKey(now.getTime() / 1000);
  const done = weeks.filter((w) => w < current || (w === current && (day === 6 || day === 0))).sort();
  return done.pop() ?? null;
}
