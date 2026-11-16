// Experiment, not used by the app: can what we know about a company (x) explain part of what the factor model leaves
// unexplained (y)? x = the share of a company's recorded revenue earned in the place a shock hits; y = the part of its
// move the factor model missed (actual − predicted, log terms, model fitted only on the weeks before the event).
//
// Tests, strictest first:
//   1. China share on the four US–China trade escalations, leave one event out: fit "miss = slope × share" on three,
//      correct the fourth, repeat for each. Each held-out event is out of sample.
//   2. Placebo: the same with the shares shuffled among companies, 1,000 times. If shuffled shares help about as
//      often as the real ones, the gain is luck.
//   3. Negative controls: China share on the Middle East events, Europe share on the trade events. A real effect
//      should not show up where it has no reason to.
//   4. Single events (COVID with China share, the invasion of Ukraine with Europe share): leave one company out
//      within the event. This shows whether the share explains the event in hindsight, not whether it forecasts.
// Middle East revenue isn't recorded separately anywhere (only inside wider lines), so the Gulf events can't be tested
// with their own region. Shares come from the latest annual report, so the 2018–2020 events use later shares.
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

// Countries counted as Europe (EU, EEA, UK, Switzerland, and the rest of geographic Europe west of Russia).
const EUROPE = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE GB CH NO IS UA RS BA AL MK ME MD BY'.split(' '));
const isChina = (country, region) => country === 'CN' || /china|prc/i.test(region ?? '');
// EMEA lines count as Europe (Europe is most of EMEA for these companies); a line that only covers the World Bank's
// Europe & Central Asia region does too.
const isEurope = (country, region, covers) => EUROPE.has(country) || /europe|emea/i.test(region ?? '') || (covers?.length === 1 && covers[0] === 'ECS');

const companies = await sb('companies?select=id,name,ticker,quote_symbol,is_private');
const exposure = await sb('company_exposure?select=company_id,region,country,revenue_usd,fiscal_year');
/** Share of revenue in each place, from the latest fiscal year's lines (SEC filings first, else annual reports). */
const shares = new Map();
for (const c of companies) {
  const rows = exposure.filter((e) => e.company_id === c.id);
  if (!rows.length) continue;
  const year = Math.max(...rows.map((r) => r.fiscal_year ?? 0));
  const latest = rows.filter((r) => (r.fiscal_year ?? 0) === year);
  const total = latest.reduce((n, r) => n + Number(r.revenue_usd ?? 0), 0);
  const part = (test) => latest.filter((r) => test(r.country, r.region, null)).reduce((n, r) => n + Number(r.revenue_usd ?? 0), 0) / total;
  if (total > 0) shares.set(c.id, { china: part(isChina), europe: part(isEurope) });
}
const annualReports = JSON.parse(readFileSync('src/data/regions.json', 'utf8')).companies;
for (const [id, r] of Object.entries(annualReports)) {
  if (shares.has(id)) continue;
  const total = r.lines.reduce((n, l) => n + l.revenue_usd, 0);
  // A Greater China / PRC line is China; a line merely adding CN to a wider region is not.
  const china = r.lines.filter((l) => l.country === 'CN' || (l.add?.includes('CN') && /china|prc/i.test(l.region))).reduce((n, l) => n + l.revenue_usd, 0);
  const europe = r.lines.filter((l) => isEurope(l.country, l.region, l.covers)).reduce((n, l) => n + l.revenue_usd, 0);
  if (total > 0) shares.set(id, { china: china / total, europe: europe / total });
}
const count = (k) => [...shares.values()].filter((s) => s[k] > 0).length;
console.log(`companies with revenue by place: ${shares.size}; with China revenue: ${count('china')}; with Europe revenue: ${count('europe')}`);

const raw = {};
for (const [f, sym] of Object.entries(FACTOR_SYMBOL)) raw[f] = await get(sym);
const fund = {};
for (const [s, sym] of Object.entries(SECTOR_FUND)) fund[s] = await get(sym);
const co = [];
for (const c of companies.filter((x) => !x.is_private && x.ticker && shares.has(x.id))) {
  const q = c.quote_symbol ?? c.ticker.replace('.', '-');
  co.push({ ...c, sector: reference.sectors[c.id]?.sector ?? null, returns: await get(FIT_SYMBOL[q] ?? q) });
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
    out.push({ id: c.id, name: c.name, miss: actual - names.reduce((n, _, i) => n + r.beta[i] * moves[i], 0) });
  }
  return out;
}
const byEvent = new Map(PAST_EVENTS.map((e) => [e.key, misses(e)]));

/** Slope through the origin: miss = slope × share. */
const slopeOf = (rows, x) => {
  const d = rows.reduce((n, r) => n + x(r.id) ** 2, 0);
  return d > 0 ? rows.reduce((n, r) => n + x(r.id) * r.miss, 0) / d : 0;
};
const mean = (a) => a.reduce((n, v) => n + v, 0) / a.length;

/** Leave one event out: typical miss before and after the correction, over every held-out company-event. */
function leaveOneEventOut(keys, x) {
  const before = [];
  const after = [];
  const exposedBefore = [];
  const exposedAfter = [];
  for (const k of keys) {
    const slope = slopeOf(keys.filter((o) => o !== k).flatMap((o) => byEvent.get(o)), x);
    for (const r of byEvent.get(k)) {
      before.push(Math.abs(r.miss));
      after.push(Math.abs(r.miss - slope * x(r.id)));
      if (x(r.id) >= 0.1) {
        exposedBefore.push(Math.abs(r.miss));
        exposedAfter.push(Math.abs(r.miss - slope * x(r.id)));
      }
    }
  }
  return { n: before.length, gain: mean(before) - mean(after), before: mean(before), after: mean(after), exposed: exposedBefore.length, exposedBefore: mean(exposedBefore), exposedAfter: mean(exposedAfter) };
}

/** Leave one company out within a single event (hindsight, not forecast). */
function leaveOneCompanyOut(key, x) {
  const rows = byEvent.get(key);
  const before = mean(rows.map((r) => Math.abs(r.miss)));
  const after = mean(rows.map((r) => Math.abs(r.miss - slopeOf(rows.filter((o) => o.id !== r.id), x) * x(r.id))));
  return { n: rows.length, gain: before - after, before, after };
}

// Placebo: the same test with shares shuffled among companies. A seeded generator so runs repeat.
let seed = 20261116;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
function placebo(run, k, real) {
  const ids = [...shares.keys()];
  let asGood = 0;
  const N = 1000;
  for (let i = 0; i < N; i++) {
    const values = ids.map((id) => shares.get(id)[k]);
    for (let j = values.length - 1; j > 0; j--) {
      const s = Math.floor(rand() * (j + 1));
      [values[j], values[s]] = [values[s], values[j]];
    }
    const shuffled = new Map(ids.map((id, j) => [id, values[j]]));
    if (run((id) => shuffled.get(id) ?? 0).gain >= real.gain) asGood++;
  }
  return asGood / N;
}

const pts = (v) => (v * 100).toFixed(2);
const keysOf = (analog) => PAST_EVENTS.filter((e) => e.analog === analog).map((e) => e.key);
const share = (k) => (id) => shares.get(id)?.[k] ?? 0;
function report(label, run, k) {
  const r = run(share(k));
  const p = placebo(run, k, r);
  const exposed = r.exposed ? `; companies with ≥10% there (${r.exposed}): ${pts(r.exposedBefore)} → ${pts(r.exposedAfter)}` : '';
  console.log(`${label}: ${r.n} company-events, typical miss ${pts(r.before)} → ${pts(r.after)} points${exposed}; shuffled shares did as well ${(p * 100).toFixed(1)}% of the time`);
}

console.log('\n1–2. Out of sample (leave one event out), with placebo');
report('China share, US–China trade events', (x) => leaveOneEventOut(keysOf('us-china'), x), 'china');
for (const k of keysOf('us-china')) {
  const slope = slopeOf(keysOf('us-china').filter((o) => o !== k).flatMap((o) => byEvent.get(o)), share('china'));
  const rows = byEvent.get(k);
  // March 2018 has under two years of prices before it in the 10-year window, so no company can be fitted.
  if (!rows.length) {
    console.log(`  held out ${k}: no company has two years of prices before it`);
    continue;
  }
  console.log(`  held out ${k}: slope from the others ${pts(slope / 10)} points per 10% of revenue; ${pts(mean(rows.map((r) => Math.abs(r.miss))))} → ${pts(mean(rows.map((r) => Math.abs(r.miss - slope * share('china')(r.id)))))}`);
}
console.log('\n3. Negative controls (should not help)');
report('China share, Middle East events', (x) => leaveOneEventOut(keysOf('mideast'), x), 'china');
report('Europe share, US–China trade events', (x) => leaveOneEventOut(keysOf('us-china'), x), 'europe');
console.log('\n4. Single events, leave one company out (hindsight)');
report('China share, COVID crash 2020', (x) => leaveOneCompanyOut('covid-2020', x), 'china');
report('Europe share, invasion of Ukraine 2022', (x) => leaveOneCompanyOut('invasion-2022', x), 'europe');
report('Europe share, COVID crash 2020 (control)', (x) => leaveOneCompanyOut('covid-2020', x), 'europe');
