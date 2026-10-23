import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Tables } from '@biltme/backend';
import * as Haptics from 'expo-haptics';
import { bilt } from '@/lib/bilt';

export async function loadPeople() {
  const [people, summary] = await Promise.all([
    bilt.from('billionaires').select('*').order('rank'),
    bilt.rpc('wealthline_summary'),
  ]);
  if (people.error) throw people.error;
  if (summary.error) throw summary.error;
  return (people.data ?? []).map((p) => {
    const s = summary.data?.find((x) => x.billionaire_id === p.id);
    return {
      ...p,
      worth: s?.net_worth_usd ?? null,
      asOf: s?.latest_at ?? null,
      change:
        s?.net_worth_usd != null && s.month_worth_usd != null
          ? s.net_worth_usd - s.month_worth_usd
          : null,
      monthWorth: s?.month_worth_usd ?? null,
    };
  });
}
export type Person = Awaited<ReturnType<typeof loadPeople>>[number];
export async function loadProjects() {
  const rows: Tables<'projects'>[] = [];
  for (let page = 0; ; page++) {
    const result = await bilt
      .from('projects')
      .select('*')
      .order('announced_date', { ascending: false })
      .order('id')
      .range(page * 1000, page * 1000 + 999);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return rows;
  }
}
export type Project = Awaited<ReturnType<typeof loadProjects>>[number];
type AuthUser = { id: string; email?: string };
type AuthValue = { user: AuthUser | null; loading: boolean; isAdmin: boolean };
const AuthContext = createContext<AuthValue>({ user: null, loading: true, isAdmin: false });
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 60000, retry: 1, refetchOnWindowFocus: true } },
});
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void bilt.auth.getSession().then(({ data }) => {
      if (active) {
        setUser(data.session?.user ?? null);
        setLoading(false);
      }
    });
    const { data } = bilt.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      client.removeQueries({ queryKey: ['watchlist'] });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const admin = useQuery({
    queryKey: ['admin', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const r = await bilt.rpc('is_wealthline_admin');
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const authValue = useMemo(
    () => ({ user, loading, isAdmin: admin.data === true }),
    [user, loading, admin.data],
  );
  return <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>;
}
export function WealthlineProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
export const useAuth = () => useContext(AuthContext);
export const usePeople = () =>
  useQuery({ queryKey: ['people'], queryFn: loadPeople, refetchInterval: 900000 });
export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: loadProjects });
export function useWatchlist() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['watchlist', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const r = await bilt.from('watchlist').select('billionaire_id').eq('user_id', user!.id);
      if (r.error) throw r.error;
      return r.data?.map((x) => x.billionaire_id) ?? [];
    },
  });
  async function toggle(id: string) {
    if (!user || pending) return;
    setPending(id);
    setError('');
    try {
      const saved = query.data?.includes(id);
      const r = saved
        ? await bilt.from('watchlist').delete().eq('user_id', user.id).eq('billionaire_id', id)
        : await bilt.from('watchlist').insert({ user_id: user.id, billionaire_id: id });
      if (r.error) throw r.error;
      const data = cache.getQueryData<string[]>(['watchlist', user.id]) ?? [];
      cache.setQueryData(
        ['watchlist', user.id],
        saved ? data.filter((x) => x !== id) : [...data, id],
      );
      await cache.invalidateQueries({ queryKey: ['watchlist', user.id] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError('Could not update your watchlist. Try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPending(null);
    }
  }
  return { ...query, toggle, pending, actionError: error };
}
export type ChartRange = '1D' | '1M' | 'YTD' | 'All';
export function useHistory(person: Person, range: ChartRange, enabled = true) {
  return useQuery({
    queryKey: ['history', person.id, range, person.asOf],
    enabled,
    queryFn: async () => {
      const end = new Date(person.asOf ?? person.updated_at);
      const start = new Date(end);
      if (range === '1D') start.setUTCDate(start.getUTCDate() - 1);
      else if (range === '1M') start.setUTCMonth(start.getUTCMonth() - 1);
      else if (range === 'YTD') start.setUTCMonth(0, 1);
      const result = [];
      let page = 0;
      while (true) {
        let request = bilt
          .from('net_worth_snapshots')
          .select('*')
          .eq('billionaire_id', person.id)
          .order('timestamp');
        if (range !== 'All') request = request.gte('timestamp', start.toISOString());
        const r = await request.range(page * 1000, page * 1000 + 999);
        if (r.error) throw r.error;
        result.push(...(r.data ?? []));
        if ((r.data?.length ?? 0) < 1000) break;
        page++;
      }
      return result;
    },
  });
}
