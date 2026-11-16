// Builds src/data/moves.json: last complete week's "why it moved" rows for every listed company, computed exactly as
// the backend's residual ledger does (supabase/functions/_shared/ledger.ts: sensitivities fitted only on earlier weeks).
// The app shows it, dated, until the ledger table (factor_residuals) is deployed and has a newer week. Rebuild weekly
// while that's pending. Prices: Yahoo Finance weekly closes.
// Run: node scripts/build-moves.mjs (reads the public Supabase config from .env.local).
import { readFileSync, writeFileSync } from 'node:fs';

import { FACTOR_SYMBOL, FIT_SYMBOL, SECTOR_FUND, weekKey, weeklyReturns } from '../supabase/functions/_shared/factors.ts';
import { lastCompleteWeek, ledgerRows } from '../supabase/functions/_shared/ledger.ts';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const sb = (path) => fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then((r) => r.json());
const reference = JSON.parse(readFileSync('src/data/sim-reference.json', 'utf8'));
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; Wealthline/1.0; +https://haseebahmad1521-alt.github.io/wealthline/)' };
async function get(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1wk`, { headers: UA });
  await new Promise((r) => setTimeout(r, 250));
  if (!res.ok) return new Map();
  const r = (await res.json())?.chart?.result?.[0];
  const t = r?.timestamp ?? [];
  const c = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  return weeklyReturns(t.map((ts, i) => ({ t: ts, c: c[i] })).filter((b) => b.c != null));
}

const listed = await sb('companies?select=id,ticker,quote_symbol&is_private=eq.false&ticker=not.is.null');
const series = {};
for (const [f, s] of Object.entries(FACTOR_SYMBOL)) series[f] = await get(s);
const funds = {};
for (const [k, s] of Object.entries(SECTOR_FUND)) funds[k] = await get(s);
const companies = [];
for (const c of listed) {
  const q = c.quote_symbol ?? c.ticker.replace('.', '-');
  companies.push({ id: c.id, sector: reference.sectors[c.id]?.sector ?? null, returns: await get(FIT_SYMBOL[q] ?? q) });
}
const week = lastCompleteWeek([...series.market.keys()], new Date(), weekKey);
const round = (v) => Math.round(v * 1e6) / 1e6;
const roundAll = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));
const rows = ledgerRows(companies, series, funds, [week], week).map((r) => ({
  company_id: r.company_id,
  week: r.week,
  actual: round(r.actual),
  predicted: round(r.predicted),
  residual: round(r.residual),
  sd: round(r.sd),
  moves: roundAll(r.moves),
  beta: roundAll(r.beta),
}));
writeFileSync('src/data/moves.json', `${JSON.stringify({ built: new Date().toISOString().slice(0, 10), week, source: 'Yahoo Finance weekly closes; factor model as in supabase/functions/_shared/ledger.ts', rows }, null, 1)}\n`);
console.log(`${rows.length} of ${companies.length} companies for ${week}`);
