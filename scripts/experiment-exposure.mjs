// Experiment, not used by the app: can what we know about a company (x) explain part of what the factor model leaves
// unexplained (y)? Test: around US–China trade escalations, does a company's recorded revenue from China predict the
// part of its move the factor model missed?
//   1. For each trade event, fit the base factor model on the weeks before it, then take each company's miss
//      (actual − predicted, log terms).
//   2. Fit "miss = slope × China revenue share" on the 2018–2019 escalations only.
//   3. Use that slope to correct the April 2025 tariff shock (out of sample) and compare the typical miss.
// China revenue share: recorded revenue lines (company_exposure) for China / Greater China, as a share of the total.
// Run: node scripts/experiment-exposure.mjs
import { readFileSync } from 'node:fs';

import { EVENTS as PAST_EVENTS, eventWeeks } from '../supabase/functions/_shared/events.ts';
import { FACTOR_SYMBOL, FIT_SYMBOL, SECTOR_FUND, ols, residualize, weekKey, weeklyReturns } from '../supabase/functions/_shared/factors.ts';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const sb = (path) =>
  fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY}` },
  }).then((r) => r.json());
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; Wealthline/1.0; +https://haseebahmad1521-alt.github.io/wealthline/)' };
const reference = JSON.parse(readFileSync('src/data/sim-reference.json', 'utf8'));
const pause = () => new Promise((r) => setTimeout(r, 250));
async function get(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1wk`, { headers: UA });
  await pause();
  if (!res.ok) return new Map();
  const r = (await res.json())?.chart?.result?.[0];
  const t = r?.timestamp ?? [];
  const c = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  return weeklyReturns(t.map((ts, i) => ({ t: ts, c: c[i] })).filter((b) => b.c != null));
}

const companies = await sb('companies?select=id,name,ticker,quote_symbol,is_private');
const exposure = await sb('company_exposure?select=company_id,region,country,revenue_usd,fiscal_year');
// China share from the latest fiscal year each company reports.
const china = new Map();
for (const c of companies) {
  const rows = exposure.filter((e) => e.company_id === c.id);
  if (!rows.length) continue;
  const year = Math.max(...rows.map((r) => r.fiscal_year ?? 0));
  const latest = rows.filter((r) => (r.fiscal_year ?? 0) === year);
  const total = latest.reduce((n, r) => n + Number(r.revenue_usd ?? 0), 0);
  const cn = latest.filter((r) => r.country === 'CN' || /china/i.test(r.region ?? '')).reduce((n, r) => n + Number(r.revenue_usd ?? 0), 0);
  if (total > 0) china.set(c.id, cn / total);
}
console.log(`companies with recorded revenue by place: ${china.size}; with any China revenue: ${[...china.values()].filter((v) => v > 0).length}`);

const raw = {};
for (const [f, sym] of Object.entries(FACTOR_SYMBOL)) raw[f] = await get(sym);
const fund = {};
for (const [s, sym] of Object.entries(SECTOR_FUND)) fund[s] = await get(sym);
const co = [];
for (const c of companies.filter((x) => !x.is_private && x.ticker && china.has(x.id))) {
  const q = c.quote_symbol ?? c.ticker.replace('.', '-');
  co.push({ ...c, sector: reference.sectors[c.id]?.sector ?? null, returns: await get(FIT_SYMBOL[q] ?? q), china: china.get(c.id) });
}
const market = raw.market;
const sum = (m, weeks) => (m && weeks.every((w) => m.has(w)) ? weeks.reduce((n, w) => n + m.get(w), 0) : null);

/** Each company's miss on one event: actual minus the base factor model's prediction (fitted on prior weeks). */
function misses(ev) {
  const weeks = eventWeeks(ev.from, ev.to, weekKey);
  const first = weeks[0];
  const train = (w) => w < first;
  const out = [];
  for (const c of co) {
    const f = { market, oil: residualize(raw.oil, market, train), china: residualize(raw.china, market, train), usd: residualize(raw.usd, market, train), ...(c.sector && fund[c.sector] ? { sector: residualize(fund[c.sector], market, train) } : {}) };
    const names = Object.keys(f);
    const fit = [...c.returns.keys()].filter((w) => train(w) && names.every((n) => f[n].has(w))).sort();
    if (fit.length < 104) continue;
    const r = ols(fit.map((w) => names.map((n) => f[n].get(w))), fit.map((w) => c.returns.get(w)), fit.map((_, i) => Math.pow(0.5, (fit.length - 1 - i) / 156)));
    const actual = sum(c.returns, weeks);
    const moves = names.map((n) => sum(f[n], weeks));
    if (!r || actual == null || moves.some((m) => m == null)) continue;
    const pred = names.reduce((n, _, i) => n + r.beta[i] * moves[i], 0);
    out.push({ id: c.id, name: c.name, china: c.china, miss: actual - pred });
  }
  return out;
}

const trade = PAST_EVENTS.filter((e) => e.analog === 'us-china');
const train = trade.filter((e) => e.from < '2025-01-01');
const test = trade.filter((e) => e.from >= '2025-01-01');
const trainRows = train.flatMap((e) => misses(e));
// Slope through the origin: miss = slope × China share.
const slope = trainRows.reduce((n, r) => n + r.china * r.miss, 0) / trainRows.reduce((n, r) => n + r.china ** 2, 0);
const corr = (rows) => {
  const mx = rows.reduce((n, r) => n + r.china, 0) / rows.length;
  const my = rows.reduce((n, r) => n + r.miss, 0) / rows.length;
  const sxy = rows.reduce((n, r) => n + (r.china - mx) * (r.miss - my), 0);
  const sx = Math.sqrt(rows.reduce((n, r) => n + (r.china - mx) ** 2, 0));
  const sy = Math.sqrt(rows.reduce((n, r) => n + (r.miss - my) ** 2, 0));
  return sxy / (sx * sy);
};
console.log(`\nfitted on ${train.map((e) => e.key).join(', ')} (${trainRows.length} company-events): each 10% of revenue from China → ${(slope * 10).toFixed(2)} points extra move; correlation ${corr(trainRows).toFixed(2)}`);
for (const e of test) {
  const rows = misses(e);
  const before = rows.reduce((n, r) => n + Math.abs(r.miss), 0) / rows.length;
  const after = rows.reduce((n, r) => n + Math.abs(r.miss - slope * r.china), 0) / rows.length;
  console.log(`${e.label}: ${rows.length} companies; correlation ${corr(rows).toFixed(2)}; typical miss ${(before * 100).toFixed(2)} → ${(after * 100).toFixed(2)} points with the China correction`);
  const exposed = rows.filter((r) => r.china >= 0.1);
  if (exposed.length) {
    const b = exposed.reduce((n, r) => n + Math.abs(r.miss), 0) / exposed.length;
    const a = exposed.reduce((n, r) => n + Math.abs(r.miss - slope * r.china), 0) / exposed.length;
    console.log(`  companies with ≥10% China revenue (${exposed.length}): ${(b * 100).toFixed(2)} → ${(a * 100).toFixed(2)} points (${exposed.map((r) => r.name).join(', ')})`);
  }
}
