// Builds src/data/regions.json: revenue by place for companies that don't file with the SEC, from their own annual
// reports (scripts/data/annual-report-regions.json, each line as reported, with its source). Amounts are converted to
// US dollars at the World Bank's annual average exchange rate (PA.NUS.FCRF) for the year most of the fiscal year falls
// in; only the shares matter to the simulations. The app uses these lines wherever the database has none for a company.
// Run: node scripts/build-regions.mjs (reads the public Supabase config from .env.local).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const UA = { 'User-Agent': 'WealthlineBot/1.0 (+https://haseebahmad1521-alt.github.io/wealthline/)' };
const input = JSON.parse(readFileSync('scripts/data/annual-report-regions.json', 'utf8'));
const companies = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/companies?select=id,name`, {
  headers: { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY}` },
}).then((r) => r.json());

const UNIT = { yuan: 1, thousand: 1e3, million: 1e6, crore: 1e7 };
// World Bank economy whose official rate is each currency's (EMU = euro area).
const FX_ECONOMY = { EUR: 'EMU', RMB: 'CHN', HKD: 'HKG', JPY: 'JPN', INR: 'IND', THB: 'THA' };
const fxCache = new Map();
async function usdRate(currency, year) {
  if (currency === 'USD') return { rate: 1, year };
  const economy = FX_ECONOMY[currency];
  if (!fxCache.has(economy)) {
    // Cached between runs (git-ignored): the World Bank API is slow and sometimes times out.
    const cacheFile = `.venv-chronos/fx-${economy}.json`;
    let r = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : null;
    for (let attempt = 0; attempt < 6 && !r; attempt++) {
      r = await fetch(`https://api.worldbank.org/v2/country/${economy}/indicator/PA.NUS.FCRF?format=json&per_page=20`, { headers: UA, signal: AbortSignal.timeout(30_000) })
        .then((x) => x.json())
        .catch(() => null);
    }
    if (!r) throw new Error(`World Bank exchange rate for ${currency} unavailable`);
    writeFileSync(cacheFile, JSON.stringify(r));
    fxCache.set(economy, (r[1] ?? []).filter((x) => x.value != null).map((x) => ({ year: Number(x.date), rate: x.value })));
  }
  const rows = fxCache.get(economy);
  // The fiscal year's own calendar year, else the latest the World Bank has (stated in the output).
  return rows.find((x) => x.year === year) ?? rows.sort((a, b) => b.year - a.year)[0];
}

const out = {};
for (const c of input.companies) {
  const hits = companies.filter((x) => x.name.toLowerCase().includes(c.match.toLowerCase()));
  if (hits.length !== 1) throw new Error(`"${c.match}" matches ${hits.length} companies`);
  const sum = c.lines.reduce((n, l) => n + l.amount, 0);
  if (Math.abs(sum - c.total) > 0.01 * c.total) throw new Error(`${c.match}: lines add up to ${sum}, total is ${c.total}`);
  const end = new Date(`${c.period_end}T12:00:00Z`);
  const year = end.getUTCMonth() + 1 <= 6 ? end.getUTCFullYear() - 1 : end.getUTCFullYear();
  const fx = await usdRate(c.currency, year);
  const usd = (amount) => Math.round((amount * UNIT[c.unit]) / fx.rate);
  out[hits[0].id] = {
    company: hits[0].name,
    fiscal_year: c.fiscal_year,
    period_end: c.period_end,
    source_label: c.source_label,
    source_url: c.source_url,
    note: c.note ?? null,
    fx: { currency: c.currency, per_usd: fx.rate, year: fx.year, source: 'World Bank PA.NUS.FCRF (annual average)' },
    lines: c.lines.map((l) => ({
      region: l.label,
      country: l.country ?? null,
      revenue_usd: usd(l.amount),
      share: Math.round((l.amount / sum) * 10000) / 10000,
      ...(l.covers ? { covers: l.covers } : {}),
      ...(l.add ? { add: l.add } : {}),
      ...(l.except ? { except: l.except } : {}),
      ...(l.derived ? { derived: l.derived } : {}),
      ...(l.statement ? { statement: l.statement } : {}),
    })),
  };
  console.log(`${hits[0].name.padEnd(42)} ${c.lines.length} lines, ${c.currency} at ${fx.rate.toFixed(3)}/USD (${fx.year}), $${(usd(sum) / 1e9).toFixed(1)}B`);
}
writeFileSync('src/data/regions.json', `${JSON.stringify({ built: new Date().toISOString().slice(0, 10), source: 'Companies’ annual reports (scripts/data/annual-report-regions.json)', companies: out }, null, 1)}\n`);
console.log(`${Object.keys(out).length} companies`);
