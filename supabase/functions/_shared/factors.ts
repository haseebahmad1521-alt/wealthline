// Factor model for the World simulations: how each listed company's share price has moved with global stocks, oil,
// Chinese stocks, the dollar and its own sector, measured from weekly prices. Shared by scripts/build-factors.mjs, the
// `world` function's weekly job and the app (src/lib/simulate.ts). No imports, so Deno, Node and the app can use it.
//
// Weekly log returns (weeks aligned by ISO week, so exchanges in different time zones line up). Each non-market factor
// is first stripped of what global stocks explain, so "oil" means oil's own move: a scenario that moves oil by a third
// moves a company by its oil sensitivity times a third, on top of whatever it does to the market. Each sensitivity
// comes with a standard error; the app turns those into ranges.

export const FACTORS = ['market', 'oil', 'china', 'usd', 'sector'] as const;
export type Factor = (typeof FACTORS)[number];

/** Price series behind each factor (Yahoo Finance symbols). */
export const FACTOR_SYMBOL: Record<Exclude<Factor, 'sector'>, string> = { market: 'ACWI', oil: 'BZ=F', china: 'MCHI', usd: 'DX-Y.NYB' };
export const FACTOR_LABEL: Record<Factor, string> = {
  market: 'global stocks (MSCI ACWI)',
  oil: 'Brent oil',
  china: 'Chinese stocks (MSCI China)',
  usd: 'the US dollar index',
  sector: 'its sector’s US index fund',
};
/** A US sector fund for each simulation sector (the sector factor is the fund's own move beyond global stocks). */
/** Listings with a longer or more liquid price history than the quoted one, used for fitting only. */
export const FIT_SYMBOL: Record<string, string> = { 'RIGD.L': 'RELIANCE.NS', '3750.HK': '300750.SZ' };

export const SECTOR_FUND: Record<string, string> = {
  energy: 'XLE', materials: 'XLB', industrials: 'XLI', autos: 'CARZ', consumer: 'XLY', health: 'XLV', finance: 'XLF',
  technology: 'XLK', media: 'XLC', real_estate: 'XLRE', transport: 'IYT',
};

export type Bar = { t: number /* unix seconds */; c: number };
export type Fit = { beta: Record<Factor, number>; se: Record<Factor, number>; r2: number; n: number; sd: number };

/** ISO year-week of a timestamp, e.g. "2026-W46". */
export function weekKey(t: number): string {
  const d = new Date(t * 1000);
  const day = (d.getUTCDay() + 6) % 7; // Monday 0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = 1 + Math.floor((thursday.getTime() - yearStart) / 6048e5);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Weekly log returns by week, from consecutive weekly closes (a gap of more than a week is skipped). */
export function weeklyReturns(bars: Bar[]): Map<string, number> {
  const byWeek = new Map<string, Bar>();
  // Yahoo stamps a weekly bar at the start of its week in the exchange's own time, which for Europe and Asia is still
  // Sunday in UTC; keying by the bar's midweek day puts every exchange's week in the same ISO week.
  const mid = (t: number) => weekKey(t + 2.5 * 86400);
  for (const b of bars) if (b.c > 0 && Number.isFinite(b.c)) byWeek.set(mid(b.t), b);
  const sorted = [...byWeek.values()].sort((a, b) => a.t - b.t);
  const out = new Map<string, number>();
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i].t - sorted[i - 1].t) / 86400;
    if (gap > 10) continue;
    out.set(mid(sorted[i].t), Math.log(sorted[i].c / sorted[i - 1].c));
  }
  return out;
}

/** Solves A·x = b (small, dense) by Gauss–Jordan with partial pivoting; null when singular. Also returns A⁻¹. */
function solve(A: number[][], b: number[]): { x: number[]; inv: number[][] } | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)), b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const v = M[c][c];
    for (let k = 0; k < M[c].length; k++) M[c][k] /= v;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f) for (let k = 0; k < M[r].length; k++) M[r][k] -= f * M[c][k];
    }
  }
  return { x: M.map((row) => row[2 * n]), inv: M.map((row) => row.slice(n, 2 * n)) };
}

/** Least squares with an intercept: coefficients (without the intercept), their standard errors, R² and residual sd. */
export function ols(X: number[][], y: number[]): { beta: number[]; se: number[]; r2: number; sd: number } | null {
  const n = y.length;
  const k = (X[0]?.length ?? 0) + 1;
  if (n <= k + 5) return null;
  const rows = X.map((r) => [1, ...r]);
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const Xty = Array.from({ length: k }, (_, i) => rows.reduce((s, r, t) => s + r[i] * y[t], 0));
  const sol = solve(XtX, Xty);
  if (!sol) return null;
  const fitted = rows.map((r) => r.reduce((s, v, i) => s + v * sol.x[i], 0));
  const resid = y.map((v, t) => v - fitted[t]);
  const sse = resid.reduce((s, e) => s + e * e, 0);
  const mean = y.reduce((s, v) => s + v, 0) / n;
  const sst = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const s2 = sse / (n - k);
  return {
    beta: sol.x.slice(1),
    se: sol.inv.slice(1).map((row, i) => Math.sqrt(Math.max(row[i + 1] * s2, 0))),
    r2: sst ? 1 - sse / sst : 0,
    sd: Math.sqrt(s2),
  };
}

/** A factor's own weekly moves: what's left after global stocks explain what they can. */
export function residualize(f: Map<string, number>, market: Map<string, number>): Map<string, number> {
  const weeks = [...f.keys()].filter((w) => market.has(w));
  const fit = ols(
    weeks.map((w) => [market.get(w)!]),
    weeks.map((w) => f.get(w)!),
  );
  if (!fit) return new Map();
  const a = weeks.reduce((s, w) => s + f.get(w)! - fit.beta[0] * market.get(w)!, 0) / weeks.length;
  return new Map(weeks.map((w) => [w, f.get(w)! - a - fit.beta[0] * market.get(w)!]));
}

const MIN_WEEKS = 80;
const CLAMP = 4;

/**
 * One company's sensitivities to the factors (market raw; the others with the market stripped out). Weeks where any
 * series is missing are left out; fewer than MIN_WEEKS common weeks gives no fit.
 */
export function fitCompany(company: Map<string, number>, factors: Record<Factor, Map<string, number> | null>): Fit | null {
  const used = FACTORS.filter((f) => factors[f] && factors[f]!.size);
  const weeks = [...company.keys()].filter((w) => used.every((f) => factors[f]!.has(w)));
  if (weeks.length < MIN_WEEKS || !used.includes('market')) return null;
  const fit = ols(
    weeks.map((w) => used.map((f) => factors[f]!.get(w)!)),
    weeks.map((w) => company.get(w)!),
  );
  if (!fit) return null;
  const beta = Object.fromEntries(FACTORS.map((f) => [f, 0])) as Record<Factor, number>;
  const se = Object.fromEntries(FACTORS.map((f) => [f, 0])) as Record<Factor, number>;
  used.forEach((f, i) => {
    beta[f] = Math.min(Math.max(fit.beta[i], -CLAMP), CLAMP);
    se[f] = fit.se[i];
  });
  return { beta, se, r2: fit.r2, n: weeks.length, sd: fit.sd };
}

export type Links = Record<'oil' | 'china' | 'usd', { oil: number; china: number; usd: number; sector: Record<string, number> }>;

/**
 * How the factors move together: for a 1% move in each driver (oil, China, the dollar, each beyond the market), the
 * typical move of the other factors and of each sector fund (regression slopes). A scenario that moves oil also moves
 * the energy fund by this much, so energy companies respond through both their oil and their sector sensitivities.
 */
export function factorLinks(own: Record<'oil' | 'china' | 'usd', Map<string, number>>, sectors: Record<string, Map<string, number>>): Links {
  const slope = (y: Map<string, number>, x: Map<string, number>) => {
    const weeks = [...x.keys()].filter((w) => y.has(w));
    const fit = ols(weeks.map((w) => [x.get(w)!]), weeks.map((w) => y.get(w)!));
    return fit ? Math.round(fit.beta[0] * 1000) / 1000 : 0;
  };
  const drivers = ['oil', 'china', 'usd'] as const;
  return Object.fromEntries(
    drivers.map((d) => [
      d,
      {
        oil: d === 'oil' ? 1 : slope(own.oil, own[d]),
        china: d === 'china' ? 1 : slope(own.china, own[d]),
        usd: d === 'usd' ? 1 : slope(own.usd, own[d]),
        sector: Object.fromEntries(Object.entries(sectors).map(([k, v]) => [k, slope(v, own[d])])),
      },
    ]),
  ) as Links;
}
