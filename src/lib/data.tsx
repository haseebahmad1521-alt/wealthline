import { QueryClient, QueryClientProvider, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { db, supabase } from './supabase';
import type { Brief, Holding, LifeEvent, NetWorthValue, PersonNews, PersonRow, Project, RefreshState, SocialPost, Summary } from './types';

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

type Auth = { session: Session | null; loading: boolean; isAdmin: boolean };
const AuthContext = createContext<Auth>({ session: null, loading: true, isAdmin: false });

function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
      // Never show one user's private watchlist to the next.
      client.removeQueries({ queryKey: ['watchlist'] });
      client.removeQueries({ queryKey: ['admin'] });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const admin = useQuery({
    queryKey: ['admin', userId],
    enabled: !!userId,
    queryFn: async () => {
      const r = await db().rpc('is_admin');
      if (r.error) throw r.error;
      return r.data === true;
    },
  });

  return (
    <AuthContext.Provider value={{ session, loading, isAdmin: admin.data === true }}>
      {children}
    </AuthContext.Provider>
  );
}

export function DataProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

export const useAuth = () => useContext(AuthContext);

export type Person = PersonRow & Omit<Summary, 'person_id'> & { rank: number | null };

async function loadPeople(): Promise<Person[]> {
  const [people, summary] = await Promise.all([
    db().from('people').select('*'),
    db().from('person_summary').select('*'),
  ]);
  if (people.error) throw people.error;
  if (summary.error) throw summary.error;
  const byId = new Map((summary.data as Summary[]).map((s) => [s.person_id, s]));
  const merged = (people.data as PersonRow[]).map((p) => {
    const s = byId.get(p.id);
    return {
      ...p,
      net_worth_usd: s?.net_worth_usd ?? null,
      as_of: s?.as_of ?? null,
      kind: s?.kind ?? null,
      prev_net_worth_usd: s?.prev_net_worth_usd ?? null,
      prev_as_of: s?.prev_as_of ?? null,
    };
  });
  // Rank by latest value; people without one are listed after, unranked (never invented).
  merged.sort(
    (a, b) =>
      (b.net_worth_usd ?? -1) - (a.net_worth_usd ?? -1) || a.name.localeCompare(b.name),
  );
  let rank = 0;
  return merged.map((p) => ({ ...p, rank: p.net_worth_usd == null ? null : ++rank }));
}

export const usePeople = () =>
  useQuery({ queryKey: ['people'], queryFn: loadPeople, refetchInterval: 5 * 60_000 });

export function usePerson(slug: string) {
  const people = usePeople();
  return { ...people, data: people.data?.find((p) => p.slug === slug) };
}

async function list<T>(table: string, column: string, value: string, order: string) {
  const r = await db().from(table).select('*').eq(column, value).order(order);
  if (r.error) throw r.error;
  return r.data as T[];
}

export const useHoldings = (personId?: string) =>
  useQuery({
    queryKey: ['holdings', personId],
    enabled: !!personId,
    queryFn: () => list<Holding>('holdings', 'person_id', personId!, 'company'),
  });

export const useEvents = (personId?: string) =>
  useQuery({
    queryKey: ['events', personId],
    enabled: !!personId,
    queryFn: () => list<LifeEvent>('events', 'person_id', personId!, 'date'),
  });

async function fetchValues(personId: string, sinceIso: string | null) {
  const rows: NetWorthValue[] = [];
  for (let page = 0; ; page++) {
    let q = db().from('net_worth_values').select('*').eq('person_id', personId);
    if (sinceIso) q = q.gte('as_of', sinceIso);
    const r = await q.order('as_of').range(page * 1000, page * 1000 + 999);
    if (r.error) throw r.error;
    rows.push(...(r.data as NetWorthValue[]));
    if (r.data.length < 1000) return rows;
  }
}

// All values since `since` (or ever), oldest first. Paged because PostgREST caps rows per request.
export function useValues(personId: string | undefined, since: Date | null) {
  const sinceIso = since?.toISOString() ?? null;
  return useQuery({
    queryKey: ['values', personId, sinceIso],
    enabled: !!personId,
    refetchInterval: 60_000,
    queryFn: () => fetchValues(personId!, sinceIso),
  });
}

/** Full history for several people at once (comparison), sharing the per-person cache. */
export const useValuesFor = (personIds: string[]) =>
  useQueries({
    queries: personIds.map((id) => ({ queryKey: ['values', id, null], queryFn: () => fetchValues(id, null) })),
  });

export const useProjects = () =>
  useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const r = await db().from('projects').select('*').order('announced_date', { ascending: false });
      if (r.error) throw r.error;
      return r.data as Project[];
    },
  });

export function useWatchlist() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const cache = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['watchlist', userId],
    enabled: !!userId,
    queryFn: async () => {
      const r = await db().from('watchlist').select('person_id').eq('user_id', userId!);
      if (r.error) throw r.error;
      return r.data.map((x: { person_id: string }) => x.person_id);
    },
  });

  async function toggle(personId: string) {
    if (!userId || pending) return;
    setPending(personId);
    setError(null);
    const saved = query.data?.includes(personId);
    const r = saved
      ? await db().from('watchlist').delete().eq('user_id', userId).eq('person_id', personId)
      : await db().from('watchlist').insert({ user_id: userId, person_id: personId });
    if (r.error) setError('Could not update your watchlist. Try again.');
    await cache.invalidateQueries({ queryKey: ['watchlist', userId] });
    setPending(null);
  }

  return { ...query, ids: query.data ?? [], toggle, pending, actionError: error, signedIn: !!userId };
}

// Latest daily brief (optional Claude feature): null when none has been generated.
export const useLatestBrief = () =>
  useQuery({
    queryKey: ['brief', 'latest'],
    queryFn: async () => {
      const r = await db()
        .from('briefs')
        .select('*, brief_items(*)')
        .order('brief_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (r.error) throw r.error;
      const brief = r.data as Brief | null;
      brief?.brief_items.sort((a, b) => a.position - b.position);
      return brief;
    },
  });

// A person's cached headlines (refreshed by the refresh function from keyless public feeds), newest first.
export const usePersonNews = (personId?: string) =>
  useQuery({
    queryKey: ['news', personId],
    enabled: !!personId,
    queryFn: async () => {
      const r = await db()
        .from('person_news')
        .select('*')
        .eq('person_id', personId!)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(12);
      if (r.error) throw r.error;
      return r.data as PersonNews[];
    },
  });

export const useSocialPost = (personId?: string) =>
  useQuery({
    queryKey: ['social', personId],
    enabled: !!personId,
    queryFn: async () => {
      const r = await db().from('social_posts').select('*').eq('person_id', personId!).maybeSingle();
      if (r.error) throw r.error;
      return r.data as SocialPost | null;
    },
  });

export function useRefreshState(personId?: string) {
  const q = useQuery({
    queryKey: ['refresh', personId],
    enabled: !!personId,
    queryFn: async () => {
      const r = await db().from('refresh_state').select('*').eq('person_id', personId!);
      if (r.error) throw r.error;
      return r.data as RefreshState[];
    },
  });
  // A run that never reports back (stuck >10 min) stops spinning; the server frees it too.
  const running = (kind: RefreshState['kind']) =>
    !!q.data?.some((x) => x.kind === kind && x.status === 'running' && Date.now() - Date.parse(x.started_at ?? '') < 10 * 60_000);
  return { running };
}

/**
 * Opening a profile asks the server to refresh stale data (it decides; fresh data is left alone) and watches the
 * person's rows over Realtime, so values, headlines and posts appear as they are written.
 */
export function useLiveRefresh(personId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!personId || !supabase) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    // Batched: a backfill writes dozens of rows in a few seconds.
    const soon = (key: unknown[]) => {
      const id = JSON.stringify(key);
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(() => void qc.invalidateQueries({ queryKey: key }), 400));
    };
    const filter = `person_id=eq.${personId}`;
    const channel = supabase
      .channel(`person:${personId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refresh_state', filter }, () => soon(['refresh', personId]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'net_worth_values', filter }, () => {
        soon(['values', personId]);
        soon(['people']);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'person_news', filter }, () => soon(['news', personId]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_posts', filter }, () => soon(['social', personId]))
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        // Subscribed first, so nothing written by the refresh is missed.
        void supabase!.functions.invoke('refresh', { body: { person_id: personId } }).then(() => soon(['refresh', personId]));
      });
    return () => {
      timers.forEach(clearTimeout);
      void supabase!.removeChannel(channel);
    };
  }, [personId, qc]);
}
