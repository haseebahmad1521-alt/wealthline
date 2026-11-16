// Builds src/data/factors.json: each listed company's measured sensitivities to global stocks, oil, Chinese stocks,
// the dollar and its sector (supabase/functions/_shared/factors.ts), from three years of weekly prices (Yahoo Finance,
// the same source as the live quotes). The app uses it until the backend's weekly `factors` job has its own copy.
// Run: node scripts/build-factors.mjs (reads the public Supabase config from .env.local).
import { readFileSync, writeFileSync } from 'node:fs';

import { FACTOR_SYMBOL, FIT_SYMBOL, SECTOR_FUND, factorLinks, fitCompany, residualize, weeklyReturns } from '../supabase/functions/_shared/factors.ts';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; Wealthline/1.0; +https://haseebahmad1521-alt.github.io/wealthline/)' };
const reference = JSON.parse(readFileSync('src/data/sim-reference.json', 'utf8'));

async function weekly(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3y&interval=1wk`, { headers: UA });
  if (!res.ok) return null;
  const r = (await res.json())?.chart?.result?.[0];
  const t = r?.timestamp ?? [];
  const c = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  return t.map((ts, i) => ({ t: ts, c: c[i] })).filter((b) => b.c != null);
}
const pause = () => new Promise((r) => setTimeout(r, 250));

const companies = await fetch(`${url}/rest/v1/companies?select=id,name,ticker,quote_symbol,is_private`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then((r) => r.json());
const listed = companies.filter((c) => !c.is_private && c.ticker);

const series = {};
for (const [f, sym] of Object.entries(FACTOR_SYMBOL)) {
  series[f] = weeklyReturns((await weekly(sym)) ?? []);
  await pause();
}
const market = series.market;
const own = { oil: residualize(series.oil, market), china: residualize(series.china, market), usd: residualize(series.usd, market) };
const sectorOwn = {};
for (const [sector, sym] of Object.entries(SECTOR_FUND)) {
  sectorOwn[sector] = residualize(weeklyReturns((await weekly(sym)) ?? []), market);
  await pause();
}

const links = factorLinks(own, sectorOwn);
console.log('links', JSON.stringify(links));
const out = {};
const missing = [];
for (const c of listed) {
  const quoted = c.quote_symbol ?? c.ticker.replace('.', '-');
  const symbol = FIT_SYMBOL[quoted] ?? quoted;
  const bars = await weekly(symbol);
  await pause();
  const sector = reference.sectors[c.id]?.sector ?? null;
  const fit = bars?.length ? fitCompany(weeklyReturns(bars), { market, ...own, sector: sector ? sectorOwn[sector] : null }) : null;
  if (!fit) {
    missing.push(`${c.name} (${symbol})`);
    continue;
  }
  const r = (v) => Math.round(v * 1000) / 1000;
  out[c.id] = {
    symbol,
    sector,
    beta: Object.fromEntries(Object.entries(fit.beta).map(([k, v]) => [k, r(v)])),
    se: Object.fromEntries(Object.entries(fit.se).map(([k, v]) => [k, r(v)])),
    r2: r(fit.r2),
    n: fit.n,
  };
  console.log(`${c.name.padEnd(36)} mkt ${fit.beta.market.toFixed(2)}  oil ${fit.beta.oil.toFixed(2)}  china ${fit.beta.china.toFixed(2)}  usd ${fit.beta.usd.toFixed(2)}  sector ${fit.beta.sector.toFixed(2)}  r2 ${fit.r2.toFixed(2)}  n ${fit.n}`);
}

const weeks = [...market.keys()].sort();
writeFileSync(
  'src/data/factors.json',
  `${JSON.stringify(
    {
      built: new Date().toISOString().slice(0, 10),
      window: { from: weeks[0], to: weeks[weeks.length - 1], weeks: weeks.length },
      source: 'Yahoo Finance weekly closes; factors: ACWI, Brent (BZ=F), MCHI, DXY, US sector funds',
      links,
      companies: out,
    },
    null,
    1,
  )}\n`,
);
console.log(`fitted ${Object.keys(out).length} of ${listed.length}; no fit: ${missing.join('; ') || 'none'}`);
