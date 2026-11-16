// Overtake chances for the closest races on Rankings: how likely the chaser is to pass the leader at some point in the
// next month from ordinary share-price swings alone. Only recorded listed stakes swing (shares × latest price); every
// other asset is held where it is, so a fortune with few recorded stakes swings less than it really does. Each
// company's weekly swing and how the companies swing together are measured over the last three years
// (src/data/covariance.json, scripts/build-covariance.mjs); the width is calibrated on past four-week moves. No drift is
// assumed: the model says how much the gap can move, not which way. A model estimate, not a forecast or advice.
export type Covariance = { ids: string[]; cov: number[]; calibration: { z80: number; normal: number } };

/** Weekly variance of a dollar-weighted mix of companies (weights in dollars, by company id). */
export function mixVariance(weights: Map<string, number>, c: Covariance): number | null {
  const index = new Map(c.ids.map((id, i) => [id, i]));
  const n = c.ids.length;
  const at = (i: number, j: number) => {
    const [a, b] = i <= j ? [i, j] : [j, i];
    return c.cov[a * n - (a * (a - 1)) / 2 + (b - a)];
  };
  const used = [...weights].filter(([id, w]) => w && index.has(id)).map(([id, w]) => [index.get(id)!, w] as const);
  if (!used.length) return null;
  let v = 0;
  for (const [i, wi] of used) for (const [j, wj] of used) v += wi * wj * at(i, j);
  return Math.max(v, 0);
}

/** Standard normal cumulative distribution (Abramowitz–Stegun 7.1.26, error under 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export const MONTH_WEEKS = 52 / 12;

/**
 * Chance the gap closes at some point within `weeks`: a driftless random walk starting `gap` dollars ahead crosses zero
 * with probability 2·Φ(−gap/σ), σ the swing over the period (reflection principle). The leader's stakes count positive,
 * the chaser's negative, so a company both hold cancels out. Null when neither has a recorded listed stake that swings.
 */
export function overtakeChance(gap: number, leader: Map<string, number>, chaser: Map<string, number>, c: Covariance, weeks = MONTH_WEEKS): number | null {
  const net = new Map(leader);
  for (const [id, w] of chaser) net.set(id, (net.get(id) ?? 0) - w);
  const v = mixVariance(net, c);
  if (v == null || v === 0) return null;
  const sigma = Math.sqrt(v * weeks) * (c.calibration.z80 / c.calibration.normal);
  return Math.min(1, 2 * normalCdf(-Math.abs(gap) / sigma));
}

/** "about 1 in 4", "under 1 in 100", "more likely than not": readable odds without false precision. */
export function oddsText(p: number): string {
  if (p < 0.01) return 'under 1 in 100';
  if (p >= 0.5) return p >= 0.9 ? 'very likely' : 'more likely than not';
  const n = Math.round(1 / p);
  return `about 1 in ${n}`;
}

/** The odds as a phrase about passing within a month. */
export function passText(p: number): string {
  return p >= 0.5 ? `a pass within a month is ${oddsText(p)}` : `${oddsText(p)} chance of a pass within a month`;
}
