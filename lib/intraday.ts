import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { bilt } from '@/lib/bilt';

export const MIN_WINDOW = 10_000;
export const MAX_WINDOW = 24 * 60 * 60 * 1000;
export const DEFAULT_WINDOW = 3 * 60 * 60 * 1000;
export const PROJECTION_LIMIT = 15 * 60 * 1000;
export type ChartPoint = { timestamp: string; net_worth_usd: number };
export type ChartProps = {
  points: ChartPoint[];
  height?: number;
  domain?: [number, number];
  projectedAfter?: number;
  onZoom?: (factor: number) => void;
  onPan?: (fraction: number) => void;
};
export function useIntraday(id: string) {
  const query = useQuery({
    queryKey: ['intraday', id],
    refetchInterval: 30_000,
    queryFn: async () => {
      const start = new Date(Date.now() - MAX_WINDOW).toISOString();
      const end = new Date().toISOString();
      const rows: ChartPoint[] = [];
      for (let page = 0; ; page++) {
        const result = await bilt
          .from('net_worth_snapshots')
          .select('timestamp,net_worth_usd')
          .eq('billionaire_id', id)
          .gte('timestamp', start)
          .lte('timestamp', end)
          .order('timestamp')
          .range(page * 1000, page * 1000 + 999);
        if (result.error) throw result.error;
        rows.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 1000) break;
      }
      return rows;
    },
  });
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  return query;
}
export function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    function start() {
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 1000);
    }
    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (timer) clearInterval(timer);
      if (state === 'active') start();
    });
    return () => {
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, []);
  return now;
}
export function useSmoothNumber(target: number, duration = 220) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (reduced) {
      current.current = target;
      return undefined;
    }
    const from = current.current;
    const started = Date.now();
    let frame = 0;
    function tick() {
      const progress = Math.min(1, (Date.now() - started) / duration);
      const next = from + (target - from) * (1 - (1 - progress) ** 3);
      current.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);
  return reduced ? target : value;
}
export function projectEstimate(points: ChartPoint[], now: number) {
  const last = points.at(-1);
  const previous = points.at(-2);
  if (!last) return { worth: null, points, projectedAfter: undefined, projecting: false };
  const at = Date.parse(last.timestamp);
  const age = now - at;
  const interval = previous ? at - Date.parse(previous.timestamp) : 0;
  // Only extend a recent intraday trend. Old owner estimates never become live data.
  const projecting =
    !!previous && interval > 0 && interval <= 30 * 60 * 1000 && age > 0 && age <= PROJECTION_LIMIT;
  if (!projecting)
    return { worth: last.net_worth_usd, points, projectedAfter: undefined, projecting: false };
  const worth = Math.max(
    0,
    last.net_worth_usd + ((last.net_worth_usd - previous.net_worth_usd) / interval) * age,
  );
  return {
    worth,
    points: [...points, { timestamp: new Date(now).toISOString(), net_worth_usd: worth }],
    projectedAfter: at,
    projecting: true,
  };
}
export function preciseMoney(value: number | null) {
  return value == null
    ? '—'
    : `$${(value / 1e9).toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}B`;
}
export function windowLabel(ms: number) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}h`;
}
export function chartTime(time: number, windowMs: number) {
  return new Date(time).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(windowMs <= 60_000 ? { second: '2-digit' as const } : {}),
    hour12: false,
  });
}
function boundary(time: number, a: ChartPoint, b: ChartPoint): ChartPoint {
  const fraction =
    (time - Date.parse(a.timestamp)) / (Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return {
    timestamp: new Date(time).toISOString(),
    net_worth_usd: a.net_worth_usd + fraction * (b.net_worth_usd - a.net_worth_usd),
  };
}
// Clip line segments at the viewport, retaining actual time spacing and linear interpolation.
export function visiblePoints(points: ChartPoint[], domain?: [number, number]) {
  if (!domain || !points.length) return points;
  const [start, end] = domain;
  const rows: ChartPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const t = Date.parse(p.timestamp);
    const next = points[i + 1];
    if (t >= start && t <= end) rows.push(p);
    if (next && t < start && Date.parse(next.timestamp) > start)
      rows.push(boundary(start, p, next));
    if (next && t < end && Date.parse(next.timestamp) > end) rows.push(boundary(end, p, next));
  }
  return rows;
}
export function chartBounds(points: ChartPoint[]) {
  if (!points.length) return { min: 0, max: 1 };
  const values = points.map((p) => p.net_worth_usd);
  const low = Math.min(...values),
    high = Math.max(...values);
  const pad = Math.max((high - low) * 0.15, high * 0.000001, 1);
  return { min: low - pad, max: high + pad };
}
