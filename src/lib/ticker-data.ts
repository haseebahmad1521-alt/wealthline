// Ticker data: one ticker_moves call per window plus the last session, refreshed every few minutes
// (quotes and computed values land every 10 minutes).
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { db } from '@/lib/supabase';
import { WINDOWS, chooseTicker, type MoveRow, type Ticker, type WindowHours } from '@/lib/ticker';

const REFRESH_MS = 3 * 60_000;

async function moves(hours: number, atClose: boolean): Promise<MoveRow[]> {
  const r = await db().rpc('ticker_moves', { p_hours: hours, p_at_close: atClose });
  if (r.error) throw r.error;
  // PostgREST may send numeric as strings.
  return (r.data as MoveRow[]).map((m) => ({
    ...m,
    start_value: Number(m.start_value),
    end_value: Number(m.end_value),
    change: Number(m.change),
    change_pct: m.change_pct == null ? null : Number(m.change_pct),
  }));
}

export function useTicker(): { ticker: Ticker | null; loading: boolean; error: unknown } {
  const results = useQueries({
    queries: [
      ...WINDOWS.map((h) => ({ queryKey: ['ticker', h], queryFn: () => moves(h, false), refetchInterval: REFRESH_MS })),
      { queryKey: ['ticker', 'close'], queryFn: () => moves(24, true), refetchInterval: REFRESH_MS },
    ],
  });
  const ready = results.every((r) => r.data);
  const stamp = results.map((r) => r.dataUpdatedAt).join();
  const ticker = useMemo(() => {
    if (!ready) return null;
    const live: Partial<Record<WindowHours, MoveRow[]>> = {};
    WINDOWS.forEach((h, i) => (live[h] = results[i].data));
    return chooseTicker(live, results[WINDOWS.length].data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stamp]);
  return { ticker, loading: results.some((r) => r.isPending), error: results.find((r) => r.error)?.error ?? null };
}
