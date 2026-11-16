// Experiment, not used by the app: how far could a factor model get on the backtest's past shocks, and do more factors
// help? Compares, on the same companies and events as scripts/build-factors.mjs (unshrunk fits, so like for like):
//   base     the app's factors (global stocks, oil, China, dollar, sector fund), fitted before each event
//   styles   base + the style factors big risk models use: interest rates (long Treasuries), credit (high yield beyond
//            Treasuries), size (small caps beyond large), value (value beyond growth), momentum
//   regime   base, but weeks weighted toward ones whose market volatility looked like the event's (crash-like events
//            weigh volatile weeks more)
//   oracle   base fitted WITH the event's own weeks (look-ahead): the best any fixed-sensitivity model could do
//   floor    the typical move of each company's own news over the event (sd × √weeks × √(2/π)): what no factor model
//            can explain, since it isn't in any factor
// Run: node scripts/experiment-factors.mjs
import { readFileSync } from 'node:fs';

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
const pause = () => new Promise((r) => setTimeout(r, 250));
async function weekly(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1wk`, { headers: UA });
  if (!res.ok) return [];
  const r = (await res.json())?.chart?.result?.[0];
  const t = r?.timestamp ?? [];
  const c = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  return t.map((ts, i) => ({ t: ts, c: c[i] })).filter((b) => b.c != null);
}
const get = async (s) => {
  const r = weeklyReturns(await weekly(s));
  await pause();
  return r;
};
const minus = (a, b) => new Map([...a].filter(([w]) => b.has(w)).map(([w, v]) => [w, v - b.get(w)]));

const companies = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/companies?select=id,name,ticker,quote_symbol,is_private`, {
  headers: { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY}` },
}).then((r) => r.json());
const raw = {};
for (const [f, sym] of Object.entries(FACTOR_SYMBOL)) raw[f] = await get(sym);
const fund = {};
for (const [s, sym] of Object.entries(SECTOR_FUND)) fund[s] = await get(sym);
const style = {};
for (const s of ['TLT', 'IEF', 'HYG', 'SPY', 'IWM', 'IWD', 'IWF', 'MTUM']) style[s] = await get(s);
const styleRaw = {
  rates: style.TLT, // long Treasuries: up when yields fall
  credit: minus(style.HYG, style.IEF), // high yield beyond Treasuries of similar length
  size: minus(style.IWM, style.SPY),
  value: minus(style.IWD, style.IWF),
  momentum: minus(style.MTUM, style.SPY),
};
const co = [];
for (const c of companies.filter((x) => !x.is_private && x.ticker)) {
  const q = c.quote_symbol ?? c.ticker.replace('.', '-');
  co.push({ ...c, sector: reference.sectors[c.id]?.sector ?? null, returns: await get(FIT_SYMBOL[q] ?? q) });
}
const market = raw.market;
console.log(`companies ${co.filter((c) => c.returns.size).length}`);

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
// Rolling 8-week market volatility for each week, for the regime weights.
const mweeks = [...market.keys()].sort();
const vol = new Map(mweeks.map((w, i) => [w, Math.sqrt(mweeks.slice(Math.max(0, i - 7), i + 1).reduce((n, x) => n + market.get(x) ** 2, 0) / Math.min(8, i + 1))]));

function fit(c, factors, train, weightOf) {
  const names = Object.keys(factors).filter((f) => factors[f]?.size);
  const weeks = [...c.returns.keys()].filter((w) => train(w) && names.every((f) => factors[f].has(w))).sort();
  if (weeks.length < 104) return null;
  const w = weeks.map((x, i) => Math.pow(0.5, (weeks.length - 1 - i) / 156) * (weightOf ? weightOf(x) : 1));
  const r = ols(weeks.map((x) => names.map((f) => factors[f].get(x))), weeks.map((x) => c.returns.get(x)), w);
  return r ? { names, beta: r.beta, sd: r.sd } : null;
}
const predict = (f, moves) => f.names.reduce((n, name, i) => n + f.beta[i] * moves[name], 0);

const totals = {};
for (const ev of EVENTS) {
  const weeks = weeksBetween(ev.from, ev.to);
  const first = weeks[0];
  const before = (w) => w < first;
  const any = () => true;
  const resid = (m, train) => residualize(m, market, train);
  const baseF = (c, train) => ({ market, oil: resid(raw.oil, train), china: resid(raw.china, train), usd: resid(raw.usd, train), ...(c.sector && fund[c.sector] ? { sector: resid(fund[c.sector], train) } : {}) });
  const styleF = (train) => Object.fromEntries(Object.entries(styleRaw).map(([k, v]) => [k, resid(v, train)]));
  const evVol = Math.sqrt(weeks.reduce((n, w) => n + (market.get(w) ?? 0) ** 2, 0) / weeks.length);
  // Weeks whose volatility is near the event's weigh more: ratio within 2x counts fully, further ones less.
  const regimeW = (w) => Math.exp(-(Math.log((vol.get(w) || 1e-4) / evVol) ** 2) / (2 * 0.7 ** 2)) + 0.1;
  const mkt = sum(market, weeks);
  const err = { naive: [], base: [], styles: [], regime: [], oracle: [], floor: [] };
  const stylesBefore = styleF(before);
  for (const c of co) {
    const actual = sum(c.returns, weeks);
    if (actual == null) continue;
    const fb = baseF(c, before);
    const base = fit(c, fb, before);
    const styles = fit(c, { ...fb, ...stylesBefore }, before);
    const regime = fit(c, fb, before, regimeW);
    const fa = baseF(c, any);
    const oracle = fit(c, fa, any);
    if (!base || !styles || !regime || !oracle) continue;
    const moves = (fs) => Object.fromEntries(Object.entries(fs).map(([k, v]) => [k, sum(v, weeks)]));
    const mb = moves({ ...fb, ...stylesBefore });
    const ma = moves(fa);
    if (Object.values(mb).some((v) => v == null)) continue;
    err.naive.push(Math.abs(mkt - actual));
    err.base.push(Math.abs(predict(base, mb) - actual));
    err.styles.push(Math.abs(predict(styles, mb) - actual));
    err.regime.push(Math.abs(predict(regime, mb) - actual));
    err.oracle.push(Math.abs(predict(oracle, ma) - actual));
    err.floor.push(oracle.sd * Math.sqrt(weeks.length) * Math.sqrt(2 / Math.PI));
  }
  const line = Object.entries(err).map(([k, v]) => `${k} ${((v.reduce((n, x) => n + x, 0) / v.length) * 100).toFixed(1)}`).join('  ');
  console.log(`${ev.label.padEnd(32)} n=${err.base.length}  ${line}`);
  for (const [k, v] of Object.entries(err)) (totals[k] ??= []).push(...v);
}
console.log(`\nOVERALL (mean absolute miss, points)  ${Object.entries(totals).map(([k, v]) => `${k} ${((v.reduce((n, x) => n + x, 0) / v.length) * 100).toFixed(1)}`).join('  ')}`);
