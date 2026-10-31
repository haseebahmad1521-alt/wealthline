// World sandbox collectors, called by pg_cron with CRON_SECRET (see migrations/20261101000200_world.sql).
//   ?job=quotes  every 10 minutes: observed share prices for every listed company (Yahoo Finance chart data).
//   ?job=facts   daily: company headquarters and facilities (Wikidata), country GDP and population (World Bank).
// Everything stored is copied from its source with a link back; each source reports to source_health.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getJson, track } from '../_shared/refresh.ts';
import { cors, json } from '../_shared/util.ts';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (compatible; Wealthline/1.0; +https://haseebahmad1521-alt.github.io/wealthline/)' };

/** Yahoo writes class shares with a dash (BRK.B → BRK-B). */
const yahooSymbol = (ticker: string) => ticker.replace('.', '-');

type Spark = {
  symbol: string;
  response?: { meta: { currency?: string; chartPreviousClose?: number; previousClose?: number }; timestamp?: number[]; indicators: { quote: { close: (number | null)[] }[] } }[];
};

async function quotes(db: SupabaseClient) {
  const { data: companies, error } = await db.from('companies').select('ticker').not('ticker', 'is', null).eq('is_private', false);
  if (error) throw new Error(error.message);
  const bySymbol = new Map((companies ?? []).map((c) => [yahooSymbol(c.ticker as string), c.ticker as string]));
  if (!bySymbol.size) return 0;
  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${[...bySymbol.keys()].join(',')}&range=1d&interval=5m`;
  const body = await track(db, 'Yahoo Finance', () => getJson(url, BROWSER));
  const rows = ((body?.spark?.result ?? []) as Spark[]).flatMap((r) => {
    const ticker = bySymbol.get(r.symbol);
    const series = r.response?.[0];
    if (!ticker || !series?.timestamp) return [];
    const closes = series.indicators.quote[0]?.close ?? [];
    return series.timestamp.flatMap((t, i) =>
      closes[i] != null && closes[i]! > 0
        ? [{
            ticker,
            as_of: new Date(t * 1000).toISOString(),
            price: closes[i],
            prev_close: series.meta.chartPreviousClose ?? series.meta.previousClose ?? null,
            currency: series.meta.currency ?? 'USD',
            source_label: 'Yahoo Finance',
            source_url: `https://finance.yahoo.com/quote/${r.symbol}`,
          }]
        : [],
    );
  });
  if (!rows.length) throw new Error('Yahoo Finance returned no prices.');
  // Points already stored are skipped, so a closed market adds nothing.
  const { error: upsertError } = await db.from('quotes').upsert(rows, { onConflict: 'ticker,as_of', ignoreDuplicates: true });
  if (upsertError) throw new Error(upsertError.message);
  await db.from('quotes').delete().lt('as_of', new Date(Date.now() - 30 * 86_400_000).toISOString());
  return rows.length;
}

const WIKIDATA = 'https://query.wikidata.org/sparql';
async function sparql(query: string) {
  const url = `${WIKIDATA}?format=json&query=${encodeURIComponent(query)}`;
  return ((await getJson(url, BROWSER))?.results?.bindings ?? []) as Record<string, { value: string }>[];
}
const qid = (uri: string) => uri.split('/').pop()!;
const point = (wkt?: string) => {
  const m = wkt?.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
  return m ? { lng: Number(m[1]), lat: Number(m[2]) } : { lng: null, lat: null };
};

// Facility types worth a pin; anything else (charging stations, single batteries, restaurants) is left out.
function siteKind(type: string): string | null {
  const t = type.toLowerCase();
  if (/headquarters/.test(t)) return 'office';
  if (/factory|plant|gigafactory|assembly|fab\b|foundry|manufactur/.test(t)) return 'factory';
  if (/data cent/.test(t)) return 'data_center';
  if (/spaceport|launch|rocket/.test(t)) return 'launch_site';
  if (/research|laborator|campus/.test(t)) return 'research';
  if (/office|building/.test(t)) return 'office';
  return null;
}

async function companyPlaces(db: SupabaseClient) {
  const { data: companies, error } = await db.from('companies').select('id, name, ticker, wikidata_id');
  if (error) throw new Error(error.message);
  // 1. Find each listed company's Wikidata item by its ticker on NYSE or NASDAQ (admins can set wikidata_id by hand).
  const missing = (companies ?? []).filter((c) => !c.wikidata_id && c.ticker);
  if (missing.length) {
    const tickers = missing.map((c) => JSON.stringify(c.ticker)).join(' ');
    const found = await sparql(
      `SELECT ?co ?t WHERE { VALUES ?t { ${tickers} } VALUES ?ex { wd:Q13677 wd:Q82059 } ?co p:P414 ?s . ?s ps:P414 ?ex ; pq:P249 ?t . }`,
    );
    for (const c of missing) {
      const hits = [...new Set(found.filter((b) => b.t.value === c.ticker).map((b) => qid(b.co.value)))];
      if (hits.length === 1) await db.from('companies').update({ wikidata_id: hits[0] }).eq('id', c.id); // ambiguous → leave for an admin
    }
  }
  const { data: linked } = await db.from('companies').select('id, wikidata_id').not('wikidata_id', 'is', null);
  if (!linked?.length) return 0;
  const byQ = new Map(linked.map((c) => [c.wikidata_id as string, c.id as string]));
  const values = [...byQ.keys()].map((q) => `wd:${q}`).join(' ');

  // 2. Headquarters (city, country, coordinates).
  const hq = await sparql(
    `SELECT ?co ?hqLabel ?coord ?cc WHERE { VALUES ?co { ${values} } ?co wdt:P159 ?hq . ?hq wdt:P625 ?coord .
       OPTIONAL { ?hq wdt:P17 ?c . ?c wdt:P297 ?cc } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`,
  );
  const sites: Record<string, unknown>[] = [];
  for (const b of hq) {
    const id = byQ.get(qid(b.co.value))!;
    const { lat, lng } = point(b.coord?.value);
    const source_url = `https://www.wikidata.org/wiki/${qid(b.co.value)}`;
    await db.from('companies').update({
      hq_city: b.hqLabel?.value ?? null, country: b.cc?.value ?? null, hq_lat: lat, hq_lng: lng,
      source_label: 'Wikidata', source_url, updated_at: new Date().toISOString(),
    }).eq('id', id);
    sites.push({ company_id: id, kind: 'hq', name: `${b.hqLabel?.value ?? 'Headquarters'} headquarters`, city: b.hqLabel?.value ?? null, country: b.cc?.value ?? null, lat, lng, source_label: 'Wikidata', source_url });
  }

  // 3. Facilities the company owns or operates.
  const fac = await sparql(
    `SELECT ?co ?site ?siteLabel ?typeLabel ?coord ?cc ?cityLabel WHERE { VALUES ?co { ${values} } ?site wdt:P127|wdt:P137 ?co ; wdt:P625 ?coord .
       OPTIONAL { ?site wdt:P31 ?type } OPTIONAL { ?site wdt:P17 ?c . ?c wdt:P297 ?cc } OPTIONAL { ?site wdt:P131 ?city }
       SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 3000`,
  );
  const seen = new Set<string>();
  for (const b of fac) {
    const name = b.siteLabel?.value;
    const kind = siteKind(b.typeLabel?.value ?? '');
    const key = `${b.co.value}|${b.site.value}`;
    if (!name || /^Q\d+$/.test(name) || !kind || seen.has(key)) continue;
    seen.add(key);
    const { lat, lng } = point(b.coord?.value);
    sites.push({
      company_id: byQ.get(qid(b.co.value)), kind, name, city: b.cityLabel?.value ?? null, country: b.cc?.value ?? null, lat, lng,
      source_label: 'Wikidata', source_url: `https://www.wikidata.org/wiki/${qid(b.site.value)}`,
    });
  }
  // One row per (company, kind, name): an upsert batch may not touch the same row twice.
  const unique = [...new Map(sites.map((x) => [`${x.company_id}|${x.kind}|${x.name}`, x])).values()];
  if (unique.length) {
    const { error: e } = await db.from('company_sites').upsert(unique, { onConflict: 'company_id,kind,name' });
    if (e) throw new Error(e.message);
  }
  return unique.length;
}

async function countries(db: SupabaseClient) {
  const wb = (path: string) => getJson(`https://api.worldbank.org/v2/${path}${path.includes('?') ? '&' : '?'}format=json&per_page=400`, BROWSER);
  const [list, gdp, pop] = await Promise.all([
    wb('country'),
    wb('country/all/indicator/NY.GDP.MKTP.CD?mrnev=1'),
    wb('country/all/indicator/SP.POP.TOTL?mrnev=1'),
  ]);
  type Ind = { countryiso3code: string; date: string; value: number | null };
  const latest = (r: unknown) => new Map(((r as [unknown, Ind[]])?.[1] ?? []).filter((x) => x.value != null).map((x) => [x.countryiso3code, x]));
  const g = latest(gdp);
  const p = latest(pop);
  const rows = ((list?.[1] ?? []) as { id: string; iso2Code: string; name: string; region: { id: string } }[])
    .filter((c) => c.region?.id !== 'NA' && /^[A-Z]{2}$/.test(c.iso2Code)) // drop aggregates ("Euro area", "World", …)
    .map((c) => ({
      iso2: c.iso2Code, iso3: c.id, name: c.name,
      gdp_usd: g.get(c.id)?.value ?? null, gdp_year: g.has(c.id) ? Number(g.get(c.id)!.date) : null,
      population: p.get(c.id)?.value ?? null, population_year: p.has(c.id) ? Number(p.get(c.id)!.date) : null,
      source_url: `https://data.worldbank.org/country/${c.iso2Code}`, updated_at: new Date().toISOString(),
    }));
  if (rows.length < 150) throw new Error(`World Bank returned only ${rows.length} countries.`);
  const { error } = await db.from('countries').upsert(rows, { onConflict: 'iso2' });
  if (error) throw new Error(error.message);
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden.' }, 403);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const job = new URL(req.url).searchParams.get('job');
  const settle = async (f: () => Promise<number>) => f().then((n) => n, (e) => (e instanceof Error ? e.message : String(e)));
  if (job === 'quotes') return json({ quotes: await settle(() => quotes(db)) });
  if (job === 'facts') {
    return json({
      places: await settle(() => track(db, 'Wikidata', () => companyPlaces(db))),
      countries: await settle(() => track(db, 'World Bank', () => countries(db))),
    });
  }
  return json({ error: 'Unknown job.' }, 400);
});
