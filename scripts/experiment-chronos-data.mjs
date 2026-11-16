// Exports the backtest's weekly data for scripts/experiment-chronos.py: every listed company's weekly log returns, the
// factors (global stocks, oil, Chinese stocks, the dollar) and each company's sector fund, plus the five past shocks
// and the base factor model's prediction for each company on each (fitted only on weeks before it, as in
// scripts/experiment-factors.mjs). Writes .venv-chronos/backtest-data.json (local only).
// Run: node scripts/experiment-chronos-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';

import { FACTOR_SYMBOL, FIT_SYMBOL, SECTOR_FUND, ols, residualize, weekKey, weeklyReturns } from '../supabase/functions/_shared/factors.ts';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; Wealthline/1.0; +https://haseebahmad1521-alt.github.io/wealthline/)' };
const reference = JSON.parse(readFileSync('src/data/sim-reference.json', 'utf8'));
async function get(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1wk`, { headers: UA });
  await new Promise((r) => setTimeout(r, 250));
  if (!res.ok) return new Map();
  const r = (await res.json())?.chart?.result?.[0];
  const t = r?.timestamp ?? [];
  const c = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  return weeklyReturns(t.map((ts, i) => ({ t: ts, c: c[i] })).filter((b) => b.c != null));
}
const companies = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/companies?select=id,name,ticker,quote_symbol,is_private`, {
  headers: { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY}` },
}).then((r) => r.json());
const raw = {};
for (const [f, sym] of Object.entries(FACTOR_SYMBOL)) raw[f] = await get(sym);
const fund = {};
for (const [s, sym] of Object.entries(SECTOR_FUND)) fund[s] = await get(sym);
const co = [];
for (const c of companies.filter((x) => !x.is_private && x.ticker)) {
  const q = c.quote_symbol ?? c.ticker.replace('.', '-');
  co.push({ id: c.id, name: c.name, sector: reference.sectors[c.id]?.sector ?? null, returns: await get(FIT_SYMBOL[q] ?? q) });
}
const market = raw.market;
const EVENTS = [
  { key: 'covid', label: 'COVID crash', from: '2020-02-17', to: '2020-03-22' },
  { key: 'invasion', label: 'Invasion of Ukraine: oil spike', from: '2022-02-21', to: '2022-03-06' },
  { key: 'bear2022', label: '2022 bear market', from: '2022-01-03', to: '2022-10-09' },
  { key: 'china2024', label: 'China stimulus rally', from: '2024-09-16', to: '2024-10-06' },
  { key: 'tariffs2025', label: 'April 2025 tariff shock', from: '2025-03-31', to: '2025-04-06' },
];
const weeksBetween = (from, to) => {
  const out = new Set();
  for (let t = Date.parse(`${from}T12:00:00Z`) / 1000; t <= Date.parse(`${to}T12:00:00Z`) / 1000 + 1; t += 7 * 86400) out.add(weekKey(t));
  return [...out].sort();
};
const sum = (m, weeks) => (m && weeks.every((w) => m.has(w)) ? weeks.reduce((n, w) => n + m.get(w), 0) : null);
const events = [];
for (const ev of EVENTS) {
  const weeks = weeksBetween(ev.from, ev.to);
  const train = (w) => w < weeks[0];
  const base = {};
  for (const c of co) {
    const f = { market, oil: residualize(raw.oil, market, train), china: residualize(raw.china, market, train), usd: residualize(raw.usd, market, train), ...(c.sector && fund[c.sector] ? { sector: residualize(fund[c.sector], market, train) } : {}) };
    const names = Object.keys(f);
    const fit = [...c.returns.keys()].filter((w) => train(w) && names.every((n) => f[n].has(w))).sort();
    if (fit.length < 104) continue;
    const r = ols(fit.map((w) => names.map((n) => f[n].get(w))), fit.map((w) => c.returns.get(w)), fit.map((_, i) => Math.pow(0.5, (fit.length - 1 - i) / 156)));
    const moves = names.map((n) => sum(f[n], weeks));
    const actual = sum(c.returns, weeks);
    if (!r || actual == null || moves.some((m) => m == null)) continue;
    base[c.id] = { pred: names.reduce((n, _, i) => n + r.beta[i] * moves[i], 0), actual, naive: sum(market, weeks) };
  }
  events.push({ ...ev, weeks, base });
}
const obj = (m) => Object.fromEntries([...m].sort());
writeFileSync(
  '.venv-chronos/backtest-data.json',
  JSON.stringify({ factors: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, obj(v)])), funds: Object.fromEntries(Object.entries(fund).map(([k, v]) => [k, obj(v)])), companies: co.map((c) => ({ id: c.id, name: c.name, sector: c.sector, returns: obj(c.returns) })), events }),
);
console.log(`companies ${co.length}; events ${events.map((e) => `${e.key}:${Object.keys(e.base).length}`).join(' ')}`);
