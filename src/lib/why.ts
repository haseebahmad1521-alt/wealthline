// Why it moved: a company's week split into what market forces explain and what was its own. Each row comes from the
// residual ledger (factor_residuals, or the dated snapshot in src/data/moves.json before the ledger is deployed): the
// factor model's expected move from how global stocks, oil, Chinese stocks, the dollar and the company's sector moved
// that week, using sensitivities fitted only on earlier weeks, and the actual move. The rest is the company's own:
// its news, results, or anything the factors don't capture. A split of a past week, never a forecast.
import { FACTORS, type Factor } from '../../supabase/functions/_shared/factors.ts';

export type MoveRow = {
  company_id: string;
  week: string;
  actual: number;
  predicted: number;
  residual: number;
  sd: number;
  moves: Record<Factor, number>;
  beta: Record<Factor, number>;
};

export type Why = {
  companyId: string;
  week: string;
  /** The week's move, in percent of the price (e.g. -9.1). */
  total: number;
  /** Points of it market forces explain, and points that were the company's own (they add up to total). */
  market: number;
  own: number;
  /** The force that explains the most, when it explains at least a point. */
  main: { factor: Factor; points: number } | null;
  /** The company's own part was bigger than 80% of its weeks' (calibrated range width × its typical gap). */
  unusual: boolean;
};

const pct = (log: number) => (Math.exp(log) - 1) * 100;

/** Splits one ledger row. Percent changes don't add exactly; the own part is what's left, so the two sum to the total. */
export function explain(r: MoveRow, z80: number): Why {
  const total = pct(r.actual);
  const market = pct(r.predicted);
  const parts = FACTORS.map((f) => ({ factor: f, points: (r.beta[f] ?? 0) * (r.moves[f] ?? 0) * 100 })).sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  return {
    companyId: r.company_id,
    week: r.week,
    total,
    market,
    own: total - market,
    main: Math.abs(parts[0].points) >= 1 ? parts[0] : null,
    unusual: Math.abs(r.residual) > z80 * r.sd,
  };
}

/** The week's biggest moves (at least `min` percent), largest first. */
export function biggest(rows: MoveRow[], z80: number, count = 4, min = 3): Why[] {
  return rows
    .map((r) => explain(r, z80))
    .filter((w) => Math.abs(w.total) >= min)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .slice(0, count);
}

/** The Friday that ends an ISO week ("2026-W46" → "2026-11-13"). */
export function weekEnd(week: string): string {
  const [y, w] = week.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = Date.UTC(y, 0, 4 - ((jan4.getUTCDay() + 6) % 7) + 7 * (w - 1));
  return new Date(monday + 4 * 86400_000).toISOString().slice(0, 10);
}

/** Short names for the forces, for one-line explanations. */
export const FORCE: Record<Factor, string> = {
  market: 'global stocks',
  oil: 'oil',
  china: 'Chinese stocks',
  usd: 'the dollar',
  sector: 'its industry',
};
