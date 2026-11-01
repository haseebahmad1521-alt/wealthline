// World tab data: each tracked person's companies (person_companies: Wikidata links, Forbes source, holdings), their
// real sites (Wikidata), revenue by reported place (SEC 10-K),
// subsidiary counts (Exhibit 21) and the latest observed share price. Nothing here is computed beyond grouping.
import { useQuery } from '@tanstack/react-query';

import { usePeople, type Person } from '@/lib/data';
import { db } from '@/lib/supabase';

export type SiteKind = 'hq' | 'office' | 'factory' | 'data_center' | 'launch_site' | 'store' | 'research' | 'other';
export type Site = { company_id: string; kind: SiteKind; name: string; city: string | null; country: string | null; lat: number; lng: number; source_url: string | null };
export type RegionShare = { company_id: string; fiscal_year: number; region: string; country: string | null; revenue_usd: number; share: number; source_label: string; source_url: string | null };
export type Quote = { ticker: string; as_of: string; price: number; prev_close: number | null; change_pct: number | null; source_label: string; source_url: string | null };
export type Company = {
  id: string;
  name: string;
  ticker: string | null;
  is_private: boolean;
  country: string | null;
  hq_city: string | null;
  hq_lat: number | null;
  hq_lng: number | null;
  source_url: string | null;
};
export type CompanyView = Company & { sites: Site[]; regions: RegionShare[]; quote: Quote | null; subsidiaries: number; subsidiariesUrl: string | null };
export type Empire = { person: Person; companies: CompanyView[]; hq: { lat: number; lng: number } | null };
export type Country = { iso2: string; name: string; gdp_usd: number | null; gdp_year: number | null; source_url: string | null };

/** A price newer than this counts as "moving now" (markets open); older ones are shown as the last price. */
export const LIVE_QUOTE_MS = 30 * 60_000;

async function loadWorld() {
  const [companies, sites, regions, quotes, holdings, subs, countries] = await Promise.all([
    db().from('companies').select('id, name, ticker, is_private, country, hq_city, hq_lat, hq_lng, source_url'),
    db().from('company_sites').select('company_id, kind, name, city, country, lat, lng, source_url').not('lat', 'is', null),
    db().from('company_exposure').select('company_id, fiscal_year, region, country, revenue_usd, share, source_label, source_url'),
    db().from('quote_latest').select('ticker, as_of, price, prev_close, change_pct, source_label, source_url'),
    db().from('person_companies').select('person_id, company_id'),
    db().from('subsidiaries').select('company_id, source_url'),
    db().from('countries').select('iso2, name, gdp_usd, gdp_year, source_url'),
  ]);
  for (const r of [companies, sites, regions, quotes, holdings, subs, countries]) if (r.error) throw r.error;
  return {
    companies: companies.data as Company[],
    sites: sites.data as Site[],
    regions: (regions.data as RegionShare[]).sort((a, b) => b.share - a.share),
    quotes: quotes.data as Quote[],
    holdings: holdings.data as { person_id: string; company_id: string }[],
    subs: subs.data as { company_id: string; source_url: string | null }[],
    countries: countries.data as Country[],
  };
}

export function useWorld() {
  const people = usePeople();
  const world = useQuery({ queryKey: ['world'], queryFn: loadWorld, refetchInterval: 5 * 60_000 });
  let empires: Empire[] | undefined;
  if (people.data && world.data) {
    const w = world.data;
    const quoteBy = new Map(w.quotes.map((q) => [q.ticker, q]));
    const companies = new Map(
      w.companies.map((c) => {
        const subs = w.subs.filter((s) => s.company_id === c.id);
        const view: CompanyView = {
          ...c,
          sites: w.sites.filter((s) => s.company_id === c.id),
          regions: w.regions.filter((r) => r.company_id === c.id),
          quote: c.ticker ? (quoteBy.get(c.ticker) ?? null) : null,
          subsidiaries: subs.length,
          subsidiariesUrl: subs[0]?.source_url ?? null,
        };
        return [c.id, view];
      }),
    );
    empires = people.data
      .map((person) => {
        const owned = [...new Set(w.holdings.filter((h) => h.person_id === person.id).map((h) => h.company_id))]
          .map((id) => companies.get(id))
          .filter((c): c is CompanyView => !!c)
          // Listed companies first (they carry the live price), then by number of places.
          .sort((a, b) => Number(a.is_private) - Number(b.is_private) || b.sites.length - a.sites.length);
        const main = owned.find((c) => c.hq_lat != null);
        return { person, companies: owned, hq: main ? { lat: main.hq_lat!, lng: main.hq_lng! } : null };
      })
      .filter((e) => e.companies.length > 0);
  }
  return {
    data: empires,
    countries: world.data?.countries,
    isPending: people.isPending || world.isPending,
    error: people.error ?? world.error,
    refetch: () => Promise.all([people.refetch(), world.refetch()]),
  };
}
