// Comparison maths. Only recorded values are used: nothing is interpolated into a number shown as data.
import type { Point } from './live.ts';

/** Validated categorical palette (dataviz validator, light surface, all pairs incl. CVD): max 3 series. */
// Each person's line colour, also used for their name (owner, Nov 3). Blue brightened from #1F5FBF so it reads as
// text on the dark glass (≈5.5:1, like the other two).
export const SERIES_COLORS = ['#4C8DF0', '#EB6834', '#0F9D8A'] as const;
export const MAX_COMPARE = SERIES_COLORS.length;

/** How much larger (+) or smaller (−) a is than b, in percent of b. */
export const pctDiff = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);

/** Growth in percent from the first to the last recorded value. */
export function growth(points: Point[]) {
  if (points.length < 2 || points[0].v === 0) return null;
  return ((points[points.length - 1].v - points[0].v) / points[0].v) * 100;
}

/** Index a series to 0% at its first recorded value (for comparing growth across sizes). */
export const indexed = <T extends Point>(points: T[], base = points[0]?.v): T[] =>
  points.length && base ? points.map((p) => ({ ...p, v: ((p.v - base) / base) * 100 })) : [];

/** The recorded value at or before t (no interpolation), or null if the series has not started. */
export function valueAt(points: Point[], t: number) {
  let found: number | null = null;
  for (const p of points) {
    if (p.t > t) break;
    found = p.v;
  }
  return found;
}

/** Every distinct recorded timestamp across series, oldest first (the table and scrub positions). */
export const recordedTimes = (series: Point[][]) => [...new Set(series.flat().map((p) => p.t))].sort((a, b) => a - b);
