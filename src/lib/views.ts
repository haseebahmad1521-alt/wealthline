import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useAuth } from './data';
import { db } from './supabase';
import { parseParams, type PeopleParams, type ProjectParams, type ViewTarget } from './view-params';

export type SavedView =
  | { id: string; name: string; target: 'people'; params: PeopleParams }
  | { id: string; name: string; target: 'projects'; params: ProjectParams };

type Row = { id: string; name: string; target: ViewTarget; params: unknown };

/** The signed-in user's saved views (optionally one target), oldest first. Keyed by user id so views never cross accounts. */
export function useSavedViews(target?: ViewTarget) {
  const userId = useAuth().session?.user.id;
  return useQuery({
    queryKey: ['views', userId, target ?? 'all'],
    enabled: !!userId,
    queryFn: async (): Promise<SavedView[]> => {
      let q = db().from('saved_views').select('id, name, target, params').eq('user_id', userId!);
      if (target) q = q.eq('target', target);
      const r = await q.order('created_at');
      if (r.error) throw r.error;
      return (r.data as Row[]).map((v) => ({ ...v, params: parseParams(v.target, v.params) }) as SavedView);
    },
  });
}

/** Save/delete with inline-displayable errors (RLS rejects unverified sessions). */
export function useViewActions() {
  const userId = useAuth().session?.user.id;
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(op: () => PromiseLike<{ error: { message: string } | null }>, failure: string) {
    if (!userId || busy) return false;
    setBusy(true);
    setError(null);
    const r = await op();
    if (r.error) setError(`${failure} ${r.error.message}`);
    await cache.invalidateQueries({ queryKey: ['views', userId] });
    setBusy(false);
    return !r.error;
  }

  return {
    busy,
    error,
    clearError: () => setError(null),
    saveView: (name: string, target: ViewTarget, params: PeopleParams | ProjectParams) =>
      run(() => db().from('saved_views').insert({ name: name.trim(), target, params }), 'Could not save this view.'),
    deleteView: (id: string) =>
      run(() => db().from('saved_views').delete().eq('id', id).eq('user_id', userId!), 'Could not remove this view.'),
  };
}
