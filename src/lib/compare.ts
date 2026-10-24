// Comparison maths. Only recorded values are used: nothing is interpolated into a number shown as data.
import type { Point } from './live.ts';

/** Validated categorical palette (dataviz validator, light surface, all pairs incl. CVD): max 3 series. */
export const SERIES_COLORS = ['#1F5FBF', '#EB6834', '#0F9D8A'] as const;
export const MAX_COMPARE = SERIES_COLORS.length;

/** How much larger (+) or smaller (−) a is than b, in percent of b. */
export const pctDiff = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);

/** Growth in percent from the first to the last recorded value. */
export function growth(points: Point[]) {
  if (points.length < 2 || points[0].v === 0) return null;
  return ((points[points.length - 1].v - points[0].v) / points[0].v) * 100;
}

/** Index a series to 0% at its first recorded value (for comparing growth across sizes). */
export const indexed = (points: Point[]): Point[] =>
  points.length && points[0].v !== 0 ? points.map((p) => ({ t: p.t, v: ((p.v - points[0].v) / points[0].v) * 100 })) : [];

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
