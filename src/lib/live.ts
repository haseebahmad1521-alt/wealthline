// Honest live-value logic. No randomness anywhere: every number is an observation,
// a straight line between two observations (interpolation), or a short, labeled
// extrapolation of the most recent observed trend (projection).

export type Point = { t: number; v: number };
export type LiveStatus = 'projected' | 'observed' | 'stale' | 'none';

/** A computed value newer than this is "fresh". */
export const FRESH_MS = 20 * 60_000;
/** Projections never extend further than this past the last observation. */
export const HORIZON_MS = 15 * 60_000;
/** The two observations used for a trend must be at most this far apart. */
const TREND_GAP_MS = 60 * 60_000;

export type Live = {
  status: LiveStatus;
  value: number | null;
  /** Time of the last real observation behind `value`. */
  observedAt: number | null;
  /** Where the projected segment ends (only when status === 'projected'). */
  projection: { from: Point; to: Point } | null;
};

/**
 * @param computed market-computed observations, oldest first
 * @param latest   latest value of any kind (estimates included), for the stale fallback
 */
export function live(computed: Point[], latest: Point | null, now: number): Live {
  const last = computed.at(-1);
  if (!last || now - last.t > FRESH_MS) {
    return latest
      ? { status: 'stale', value: latest.v, observedAt: latest.t, projection: null }
      : { status: 'none', value: null, observedAt: null, projection: null };
  }
  const prev = computed.at(-2);
  if (!prev || last.t - prev.t > TREND_GAP_MS || last.t <= prev.t) {
    return { status: 'observed', value: last.v, observedAt: last.t, projection: null };
  }
  const slope = (last.v - prev.v) / (last.t - prev.t);
  const end = Math.min(now, last.t + HORIZON_MS);
  const to = { t: end, v: last.v + slope * (end - last.t) };
  return { status: 'projected', value: to.v, observedAt: last.t, projection: { from: last, to } };
}

/** Value at time t by linear interpolation between surrounding observations (null outside range). */
export function interpolate(points: Point[], t: number): number | null {
  if (!points.length || t < points[0].t || t > points[points.length - 1].t) return null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (t <= b.t) return b.t === a.t ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
  }
  return points[points.length - 1].v;
}
