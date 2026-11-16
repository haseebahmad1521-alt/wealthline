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
  energy: 'XLE', materials: 'XLB', industrials: 'XLI', defense: 'ITA', autos: 'CARZ', consumer: 'XLY', health: 'XLV', finance: 'XLF',
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

/**
 * Least squares with an intercept, optionally weighted (weights are rescaled to average 1): coefficients (without the
 * intercept), their standard errors, R² and the residual standard deviation. Degrees of freedom use the effective
 * number of observations, so heavy down-weighting widens the errors as it should.
 */
export function ols(X: number[][], y: number[], weights?: number[]): { beta: number[]; se: number[]; r2: number; sd: number } | null {
  const n = y.length;
  const k = (X[0]?.length ?? 0) + 1;
  if (n <= k + 5) return null;
  const raw = weights ?? y.map(() => 1);
  const meanW = raw.reduce((s, v) => s + v, 0) / n;
  const w = raw.map((v) => v / meanW);
  const nEff = n ** 2 / w.reduce((s, v) => s + v * v, 0);
  if (nEff <= k + 5) return null;
  const rows = X.map((r) => [1, ...r]);
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => rows.reduce((s, r, t) => s + w[t] * r[i] * r[j], 0)));
  const Xty = Array.from({ length: k }, (_, i) => rows.reduce((s, r, t) => s + w[t] * r[i] * y[t], 0));
  const sol = solve(XtX, Xty);
  if (!sol) return null;
  const fitted = rows.map((r) => r.reduce((s, v, i) => s + v * sol.x[i], 0));
  const resid = y.map((v, t) => v - fitted[t]);
  const sse = resid.reduce((s, e, t) => s + w[t] * e * e, 0);
  const mean = y.reduce((s, v, t) => s + w[t] * v, 0) / n;
  const sst = y.reduce((s, v, t) => s + w[t] * (v - mean) ** 2, 0);
  const s2 = (sse / n) * (nEff / (nEff - k));
  // Scale the inverse to the effective sample: with weights averaging 1, (XᵀWX)⁻¹ already reflects n observations.
  const scale = n / nEff;
  return {
    beta: sol.x.slice(1),
    se: sol.inv.slice(1).map((row, i) => Math.sqrt(Math.max(row[i + 1] * s2 * scale, 0))),
    r2: sst ? 1 - sse / sst : 0,
    sd: Math.sqrt(s2),
  };
}

/**
 * A factor's own weekly moves: what's left after global stocks explain what they can. The slope is learned on `train`
 * weeks (all by default) and applied to every week, so a backtest can strip the market out of an event it hasn't seen.
 */
export function residualize(f: Map<string, number>, market: Map<string, number>, train?: (week: string) => boolean): Map<string, number> {
  const weeks = [...f.keys()].filter((w) => market.has(w));
  const fitWeeks = train ? weeks.filter(train) : weeks;
  const fit = ols(
    fitWeeks.map((w) => [market.get(w)!]),
    fitWeeks.map((w) => f.get(w)!),
  );
  if (!fit) return new Map();
  const a = fitWeeks.reduce((s, w) => s + f.get(w)! - fit.beta[0] * market.get(w)!, 0) / fitWeeks.length;
  return new Map(weeks.map((w) => [w, f.get(w)! - a - fit.beta[0] * market.get(w)!]));
}

const MIN_WEEKS = 80;
const CLAMP = 4;

export type FitOptions = {
  /** Only these weeks count (a training window, or the crisis weeks). */
  only?: (week: string) => boolean;
  /** Recent weeks weigh more: a week this many weeks older counts half as much. */
  halfLife?: number;
  minWeeks?: number;
};

/**
 * One company's sensitivities to the factors (market raw; the others with the market stripped out). Weeks where any
 * series is missing are left out; fewer than `minWeeks` (default 80) common weeks gives no fit.
 */
export function fitCompany(company: Map<string, number>, factors: Record<Factor, Map<string, number> | null>, opts: FitOptions = {}): Fit | null {
  const used = FACTORS.filter((f) => factors[f] && factors[f]!.size);
  const weeks = [...company.keys()].filter((w) => used.every((f) => factors[f]!.has(w)) && (!opts.only || opts.only(w))).sort();
  if (weeks.length < (opts.minWeeks ?? MIN_WEEKS) || !used.includes('market')) return null;
  const weights = opts.halfLife ? weeks.map((_, i) => Math.pow(0.5, (weeks.length - 1 - i) / opts.halfLife!)) : undefined;
  const fit = ols(
    weeks.map((w) => used.map((f) => factors[f]!.get(w)!)),
    weeks.map((w) => company.get(w)!),
    weights,
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

/**
 * Shrinkage toward sector peers (the standard Bayesian adjustment risk models make): each company's sensitivity is
 * pulled toward its sector peers' precision-weighted average (itself left out) in proportion to how unreliable it is. A
 * precise estimate barely moves; a noisy one ends near its peers. Sectors with fewer than three fitted companies use
 * everyone as the peer group. The prior's spread is the peers' spread minus their sampling noise (floored).
 */
export function shrink(fits: { id: string; sector: string | null; fit: Fit }[]): Map<string, Fit> {
  const out = new Map<string, Fit>();
  const groupOf = (sector: string | null) => {
    const g = fits.filter((x) => sector && x.sector === sector);
    return g.length >= 3 ? g : fits;
  };
  for (const x of fits) {
    const group = groupOf(x.sector);
    const beta = { ...x.fit.beta };
    const se = { ...x.fit.se };
    for (const f of FACTORS) {
      if (!x.fit.se[f]) continue; // not estimated (no sector fund)
      // The company's peers without itself, each weighted by its precision, so one noisy estimate can't drag the prior.
      const peers = group.filter((g) => g.id !== x.id && g.fit.se[f]);
      if (peers.length < 2) continue;
      const w = peers.map((g) => 1 / g.fit.se[f] ** 2);
      const W = w.reduce((n, v) => n + v, 0);
      const mean = peers.reduce((n, g, i) => n + w[i] * g.fit.beta[f], 0) / W;
      const spread = peers.reduce((n, g, i) => n + w[i] * (g.fit.beta[f] - mean) ** 2, 0) / W;
      const noise = peers.length / W; // the peers' typical sampling variance (harmonic mean)
      const tau2 = Math.max(spread - noise, 0.05 ** 2);
      const v = x.fit.se[f] ** 2;
      beta[f] = (x.fit.beta[f] / v + mean / tau2) / (1 / v + 1 / tau2);
      se[f] = Math.sqrt(1 / (1 / v + 1 / tau2));
    }
    out.set(x.id, { ...x.fit, beta, se });
  }
  return out;
}

/** The crisis weeks: the worst `share` of weeks for global stocks. */
export function stressWeeks(market: Map<string, number>, share = 0.2): Set<string> {
  const sorted = [...market.entries()].sort((a, b) => a[1] - b[1]);
  return new Set(sorted.slice(0, Math.max(1, Math.floor(sorted.length * share))).map(([w]) => w));
}
