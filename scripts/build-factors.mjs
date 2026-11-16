// Builds src/data/factors.json (plus src/data/backtest.json and src/data/events.json): each listed company's measured sensitivities to global
// stocks, oil, Chinese stocks, the dollar and its sector (supabase/functions/_shared/factors.ts), from ten years of
// weekly prices (Yahoo Finance, the same source as the live quotes), and a backtest of the model on past shocks.
//
//   Normal fit   weighted least squares, recent weeks weigh more (half-life three years), shrunk toward sector peers.
//   Crisis fit   only the worst fifth of weeks for global stocks, shrunk the same way; used for crash and war scenarios.
//   Backtest     for each past shock, every model is fitted only on weeks before it, then predicts each company's move
//                from what the factors actually did; scored against what the company actually did.
//
// The app uses this file until the backend's weekly `factors` job has its own copy.
// Run: node scripts/build-factors.mjs (reads the public Supabase config from .env.local).
import { readFileSync, writeFileSync } from 'node:fs';

import { ANALOGS, EVENTS as PAST_EVENTS, eventWeeks, sumWeeks, summarise } from '../supabase/functions/_shared/events.ts';
import { FACTORS, FACTOR_SYMBOL, FIT_SYMBOL, SECTOR_FUND, factorLinks, fitCompany, residualize, shrink, stressWeeks, weekKey, weeklyReturns } from '../supabase/functions/_shared/factors.ts';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; Wealthline/1.0; +https://haseebahmad1521-alt.github.io/wealthline/)' };
const reference = JSON.parse(readFileSync('src/data/sim-reference.json', 'utf8'));
const HALF_LIFE = 156; // weeks
const Z80 = 1.2816;

async function weekly(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1wk`, { headers: UA });
  if (!res.ok) return [];
  const r = (await res.json())?.chart?.result?.[0];
  const t = r?.timestamp ?? [];
  const c = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  return t.map((ts, i) => ({ t: ts, c: c[i] })).filter((b) => b.c != null);
}
const pause = () => new Promise((r) => setTimeout(r, 250));

const companies = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/companies?select=id,name,ticker,quote_symbol,is_private`, {
  headers: { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY}` },
}).then((r) => r.json());
const listed = companies.filter((c) => !c.is_private && c.ticker);

// Raw weekly returns for everything.
const raw = {};
for (const [f, sym] of Object.entries(FACTOR_SYMBOL)) {
  raw[f] = weeklyReturns(await weekly(sym));
  await pause();
}
const fundRaw = {};
for (const [sector, sym] of Object.entries(SECTOR_FUND)) {
  fundRaw[sector] = weeklyReturns(await weekly(sym));
  await pause();
}
const co = [];
for (const c of listed) {
  const quoted = c.quote_symbol ?? c.ticker.replace('.', '-');
  const symbol = FIT_SYMBOL[quoted] ?? quoted;
  co.push({ ...c, symbol, sector: reference.sectors[c.id]?.sector ?? null, returns: weeklyReturns(await weekly(symbol)) });
  await pause();
}
const market = raw.market;
console.log(`market weeks ${market.size}; companies with prices ${co.filter((c) => c.returns.size).length} of ${listed.length}`);

/** The factor set (market raw, others beyond the market) with the market slopes learned on `train` weeks. */
function factorSet(train) {
  return {
    market,
    oil: residualize(raw.oil, market, train),
    china: residualize(raw.china, market, train),
    usd: residualize(raw.usd, market, train),
    sector: Object.fromEntries(Object.entries(fundRaw).map(([k, v]) => [k, residualize(v, market, train)])),
  };
}
const forCompany = (set, c) => ({ market: set.market, oil: set.oil, china: set.china, usd: set.usd, sector: c.sector ? (set.sector[c.sector] ?? null) : null });

/** Normal and crisis fits for every company on the weeks `train` allows, shrunk toward sector peers. */
function fitAll(set, train) {
  const crisis = stressWeeks(new Map([...market].filter(([w]) => !train || train(w))));
  const normal = [];
  const stressed = [];
  for (const c of co) {
    const n = fitCompany(c.returns, forCompany(set, c), { only: train, halfLife: HALF_LIFE });
    if (n) normal.push({ id: c.id, sector: c.sector, fit: n });
    const s = fitCompany(c.returns, forCompany(set, c), { only: (w) => crisis.has(w) && (!train || train(w)), minWeeks: 45 });
    if (s) stressed.push({ id: c.id, sector: c.sector, fit: s });
  }
  return { normal: shrink(normal), stressed: shrink(stressed), unshrunk: new Map(normal.map((x) => [x.id, x.fit])) };
}

// ——— Backtest ———
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
  return out;
};
const sum = (m, weeks) => {
  let s = 0;
  for (const w of weeks) {
    if (!m.has(w)) return null;
    s += m.get(w);
  }
  return s;
};
const predict = (fit, moves) => FACTORS.reduce((n, f) => n + (fit.beta[f] ?? 0) * (moves[f] ?? 0), 0);
const measurementSd = (fit, moves) => Math.sqrt(FACTORS.reduce((n, f) => n + ((fit.se[f] ?? 0) * (moves[f] ?? 0)) ** 2, 0));

const results = [];
for (const ev of EVENTS) {
  const weeks = [...weeksBetween(ev.from, ev.to)].sort();
  const first = weeks[0];
  const before = [...market.keys()].filter((x) => x < first).sort();
  const train = (w) => w < first;
  const start3y = before.slice(-156)[0];
  const last3y = (w) => w < first && w >= start3y;
  const set = factorSet(train);
  const all = fitAll(set, train);
  const plainFits = new Map();
  for (const c of co) {
    const f = fitCompany(c.returns, forCompany(set, c), { only: last3y });
    if (f) plainFits.set(c.id, f);
  }
  const mkt = sum(market, weeks);
  const crash = mkt != null && mkt < -0.05;
  const rows = [];
  for (const c of co) {
    const actual = sum(c.returns, weeks);
    if (actual == null || !plainFits.has(c.id) || !all.normal.has(c.id)) continue;
    const moves = { market: mkt, oil: sum(set.oil, weeks), china: sum(set.china, weeks), usd: sum(set.usd, weeks), sector: c.sector ? sum(set.sector[c.sector] ?? new Map(), weeks) : 0 };
    if (Object.values(moves).some((v) => v == null)) continue;
    const normal = all.normal.get(c.id);
    const best = crash && all.stressed.has(c.id) ? all.stressed.get(c.id) : normal;
    const plain = plainFits.get(c.id);
    const noise = (fit) => (fit.sd ?? 0) * Math.sqrt(weeks.length);
    rows.push({
      company: c.name,
      actual,
      naive: { pred: mkt },
      plain: { pred: predict(plain, moves), sd: measurementSd(plain, moves), noise: noise(plain) },
      improved: { pred: predict(normal, moves), sd: measurementSd(normal, moves), noise: noise(normal) },
      crisis: { pred: predict(best, moves), sd: measurementSd(best, moves), noise: noise(normal) },
    });
  }
  const score = (key) => {
    const errs = rows.map((r) => r[key].pred - r.actual);
    const mae = errs.reduce((n, e) => n + Math.abs(e), 0) / errs.length;
    const p = rows.map((r) => r[key].pred);
    const a = rows.map((r) => r.actual);
    const mean = (v) => v.reduce((n, x) => n + x, 0) / v.length;
    const mp = mean(p);
    const ma = mean(a);
    const cov = p.reduce((n, x, i) => n + (x - mp) * (a[i] - ma), 0);
    const sp = Math.sqrt(p.reduce((n, x) => n + (x - mp) ** 2, 0));
    const sa = Math.sqrt(a.reduce((n, x) => n + (x - ma) ** 2, 0));
    const inside = (withNoise) =>
      rows[0][key].sd == null ? null : rows.filter((r) => Math.abs(r[key].pred - r.actual) <= Z80 * Math.sqrt(r[key].sd ** 2 + (withNoise ? r[key].noise ** 2 : 0))).length / rows.length;
    return { mae, corr: sp && sa ? cov / (sp * sa) : 0, coverage: inside(false), coverageWithNoise: inside(true) };
  };
  const summary = { event: ev.label, key: ev.key, weeks: weeks.length, market: mkt, crash, companies: rows.length, naive: score('naive'), plain: score('plain'), improved: score('improved'), crisis: score('crisis') };
  results.push({ ...summary, rows });
  const f = (s) => `MAE ${(s.mae * 100).toFixed(1)}pt corr ${s.corr.toFixed(2)}${s.coverage != null ? ` in80 ${(s.coverage * 100).toFixed(0)}%/${(s.coverageWithNoise * 100).toFixed(0)}%` : ''}`;
  console.log(`\n${ev.label} (${weeks.length} wk, market ${(mkt * 100).toFixed(1)}%, n=${rows.length})`);
  for (const k of ['naive', 'plain', 'improved', 'crisis']) console.log(`  ${k.padEnd(9)} ${f(summary[k])}`);
}

// ——— The model the app uses: all ten years ———
const set = factorSet();
const final = fitAll(set);
const links = factorLinks({ oil: set.oil, china: set.china, usd: set.usd }, set.sector);
const r3 = (v) => Math.round(v * 1000) / 1000;
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r3(v)]));
const out = {};
for (const c of co) {
  const n = final.normal.get(c.id);
  if (!n) continue;
  const s = final.stressed.get(c.id);
  out[c.id] = { symbol: c.symbol, sector: c.sector, beta: round(n.beta), se: round(n.se), r2: r3(n.r2), n: n.n, sd: r3(n.sd), ...(s ? { stress: { beta: round(s.beta), se: round(s.se) } } : {}) };
}
const weeks = [...market.keys()].sort();
const overall = (key) => {
  const rows = results.flatMap((r) => r.rows);
  return r3(rows.reduce((n, r) => n + Math.abs(r[key].pred - r.actual), 0) / rows.length);
};
const backtest = {
  events: results.map(({ rows, ...s }) => s),
  overall: { naive: overall('naive'), plain: overall('plain'), improved: overall('improved'), crisis: overall('crisis') },
};
writeFileSync(
  'src/data/factors.json',
  `${JSON.stringify(
    {
      built: new Date().toISOString().slice(0, 10),
      window: { from: weeks[0], to: weeks[weeks.length - 1], weeks: weeks.length },
      method: 'Weekly log returns over ten years; weighted least squares (half-life three years), shrunk toward sector peers; crisis fit on the worst fifth of weeks for global stocks.',
      source: 'Yahoo Finance weekly closes; factors: ACWI, Brent (BZ=F), MCHI, DXY, US sector funds',
      links,
      backtest: {
        overall: backtest.overall,
        events: backtest.events.map((e) => ({ event: e.event, weeks: e.weeks, companies: e.companies, naive: r3(e.naive.mae), plain: r3(e.plain.mae), improved: r3(e.improved.mae), crisis: r3(e.crisis.mae), coverage: e.crisis.coverageWithNoise })),
      },
      companies: out,
    },
    null,
    1,
  )}\n`,
);
writeFileSync('src/data/backtest.json', `${JSON.stringify(backtest, null, 1)}\n`);

// ——— Event studies: what markets did around past events of each kind ———
const measured = [];
for (const ev of PAST_EVENTS) {
  const weeks = eventWeeks(ev.from, ev.to, weekKey);
  const moves = {
    market: sumWeeks(market, weeks),
    oil: sumWeeks(set.oil, weeks),
    china: sumWeeks(set.china, weeks),
    usd: sumWeeks(set.usd, weeks),
    oilPrice: sumWeeks(raw.oil, weeks),
    sector: Object.fromEntries(Object.entries(set.sector).map(([k, v]) => [k, sumWeeks(v, weeks)]).filter(([, v]) => v != null)),
  };
  if ([moves.market, moves.oil, moves.china, moves.usd, moves.oilPrice].some((v) => v == null)) {
    console.log(`event ${ev.key}: missing weeks, left out`);
    continue;
  }
  measured.push({ ...ev, weeks: weeks.length, moves });
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  console.log(`${ev.label.padEnd(52)} stocks ${pct(moves.market).padStart(6)}  oil ${pct(moves.oilPrice).padStart(6)}  defence ${pct(moves.sector.defense ?? 0).padStart(6)}  energy ${pct(moves.sector.energy ?? 0).padStart(6)}`);
}
const analogs = Object.fromEntries(
  Object.keys(ANALOGS)
    .map((a) => [a, summarise(a, measured.filter((m) => m.analog === a))])
    .filter(([, v]) => v),
);
const r4 = (v) => Math.round(v * 10000) / 10000;
const roundMoves = (m) => ({ market: r4(m.market), oil: r4(m.oil), china: r4(m.china), usd: r4(m.usd), oilPrice: r4(m.oilPrice), sector: Object.fromEntries(Object.entries(m.sector).map(([k, v]) => [k, r4(v)])) });
writeFileSync(
  'src/data/events.json',
  `${JSON.stringify(
    {
      built: new Date().toISOString().slice(0, 10),
      method: 'Weekly log returns summed over each event; oil, China, the dollar and sector funds beyond global stocks (same factors as factors.json). An analog is the average across its events; the spread between them is its uncertainty.',
      events: measured.map((m) => ({ key: m.key, analog: m.analog, label: m.label, from: m.from, to: m.to, weeks: m.weeks, moves: roundMoves(m.moves) })),
      analogs: Object.fromEntries(Object.entries(analogs).map(([k, v]) => [k, { events: v.events, mean: roundMoves(v.mean), sd: roundMoves(v.sd) }])),
    },
    null,
    1,
  )}\n`,
);
console.log(`\noverall MAE (log-return points): ${JSON.stringify(backtest.overall)}`);
console.log(`fitted ${Object.keys(out).length} of ${listed.length}; crisis fits ${Object.values(out).filter((x) => x.stress).length}`);
