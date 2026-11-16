// Where "why it moved" rows come from: the backend's residual ledger (factor_residuals, written each weekend by the
// world factors job) once it's deployed and has a week at least as recent as the shipped snapshot; otherwise the
// snapshot (src/data/moves.json, built by scripts/build-moves.mjs the same way). Either way the week is shown with it.
import { useQuery } from '@tanstack/react-query';

import snapshot from '@/data/moves.json';
import { db } from '@/lib/supabase';
import type { MoveRow } from '@/lib/why';

export type Moves = { week: string; rows: MoveRow[]; from: 'ledger' | 'snapshot' };

const SNAPSHOT: Moves = { week: snapshot.week, rows: snapshot.rows as MoveRow[], from: 'snapshot' };

async function load(): Promise<Moves> {
  const latest = await db().from('factor_residuals').select('week').order('week', { ascending: false }).limit(1);
  const week = latest.error ? null : (latest.data?.[0]?.week as string | undefined);
  if (!week || week < SNAPSHOT.week) return SNAPSHOT;
  const rows = await db().from('factor_residuals').select('company_id, week, actual, predicted, residual, sd, moves, beta').eq('week', week);
  if (rows.error || !rows.data?.length) return SNAPSHOT;
  return { week, rows: rows.data as MoveRow[], from: 'ledger' };
}

export function useMoves() {
  return useQuery({ queryKey: ['why-it-moved'], queryFn: load, staleTime: 3600_000, placeholderData: SNAPSHOT });
}
