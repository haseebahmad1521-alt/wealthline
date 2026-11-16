// Reads the residual ledger (factor_residuals: each company's weekly gap between what the factor model expected and
// what happened) and tests candidate explanations for the gaps. Nothing here changes the app: a candidate that passes
// is a proposal for the model, made by hand after review.
//
// Each candidate turns a company-week into a number x (a company trait times that week's factor move, or last
// week's gap). The test, per candidate:
//   - in time order: fit "gap = slope × x" on the first two thirds of the weeks, correct the last third;
//   - placebo: the same with x shuffled among the companies of each week, 1,000 times;
//   - passes only with a smaller typical gap in the later weeks, a placebo rate under 5%, and at least 26 later weeks.
// Also reports how often weekly moves fell inside the app's 80% range (calibrated width × each company's sd).
// Run: node scripts/test-residuals.mjs (reads the public Supabase config from .env.local); --from rows.json to test
// rows from a file.
import { readFileSync } from 'node:fs';

import { revenueShares } from './revenue-shares.mjs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const sb = (path) => fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then((r) => r.json());

/** Every ledger row, a page at a time. */
async function ledger() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await sb(`factor_residuals?select=company_id,week,residual,sd,moves,kind&order=week,company_id&limit=1000&offset=${from}`);
    if (!Array.isArray(page)) throw new Error(`The ledger isn't readable yet (${page?.message ?? 'no table'}): apply migration 20261118000000_factor_residuals.sql and redeploy the world function.`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// --from file.json: rows from a file instead (a dry run before the ledger table exists).
const fromFile = process.argv.indexOf('--from');
const rows = fromFile > 0 ? JSON.parse(readFileSync(process.argv[fromFile + 1], 'utf8')) : await ledger();
const weeks = [...new Set(rows.map((r) => r.week))].sort();
console.log(`ledger: ${rows.length} rows, ${weeks.length} weeks (${weeks[0] ?? '–'} to ${weeks[weeks.length - 1] ?? '–'}), ${rows.filter((r) => r.kind === 'live').length} recorded live`);
if (weeks.length < 39) {
  console.log('Too few weeks to test anything yet: tests start at 39 weeks; a candidate can pass from 78 (26 held out).');
  process.exit(0);
}

// Calibration: weekly moves inside the 80% range the app draws.
const z80 = JSON.parse(readFileSync('src/data/factors.json', 'utf8')).backtest.ranges.z80;
const inside = rows.filter((r) => Math.abs(r.residual) <= z80 * r.sd).length / rows.length;
const live = rows.filter((r) => r.kind === 'live');
const liveInside = live.length ? live.filter((r) => Math.abs(r.residual) <= z80 * r.sd).length / live.length : null;
console.log(`80% range held ${(inside * 100).toFixed(1)}% of weekly moves${liveInside == null ? '' : ` (${(liveInside * 100).toFixed(1)}% of live weeks)`}`);

// Candidates. Traits come from recorded data only.
const companies = await sb('companies?select=id');
const shares = await revenueShares(sb, companies);
// 10-K margins (once migration 20261117000000 is applied), else the reference file's.
const recorded = await sb('companies?select=id,operating_margin&operating_margin=not.is.null');
const margin = new Map(Array.isArray(recorded) ? recorded.map((c) => [c.id, Number(c.operating_margin)]) : []);
const reference = JSON.parse(readFileSync('src/data/sim-reference.json', 'utf8'));
for (const [id, m] of Object.entries(reference.margins ?? {})) if (!margin.has(id)) margin.set(id, m.margin);
// The app's profit step: thin margins amplify revenue moves (src/lib/simulate.ts, operatingLeverage).
const leverage = (m) => (m == null || m < 0.05 ? 1 : Math.min(3, (m + 0.3 * (1 - m)) / m));
const previous = new Map(rows.map((r) => [`${r.company_id}|${r.week}`, r.residual]));
const prevWeek = new Map(weeks.map((w, i) => [w, weeks[i - 1]]));

const CANDIDATES = [
  { name: 'China revenue × China stocks’ own move', x: (r) => shares.get(r.company_id).china * r.moves.china, needs: (r) => shares.has(r.company_id) },
  { name: 'Europe revenue × the dollar’s move', x: (r) => shares.get(r.company_id).europe * r.moves.usd, needs: (r) => shares.has(r.company_id) },
  { name: 'Thin margins × global stocks’ move (the profit step)', x: (r) => (leverage(margin.get(r.company_id)) - 1) * r.moves.market, needs: (r) => margin.has(r.company_id) },
  { name: 'Last week’s gap (momentum or reversal)', x: (r) => previous.get(`${r.company_id}|${prevWeek.get(r.week)}`) ?? null, needs: (r) => previous.has(`${r.company_id}|${prevWeek.get(r.week)}`) },
];

let seed = 20261118;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const mean = (a) => a.reduce((n, v) => n + v, 0) / a.length;
const split = weeks[Math.floor(weeks.length * (2 / 3))];

/** Gain in typical gap on the later weeks from a slope fitted on the earlier ones. */
function gain(data) {
  const train = data.filter((d) => d.week < split);
  const test = data.filter((d) => d.week >= split);
  const den = train.reduce((n, d) => n + d.x * d.x, 0);
  const slope = den ? train.reduce((n, d) => n + d.x * d.y, 0) / den : 0;
  const before = mean(test.map((d) => Math.abs(d.y)));
  const after = mean(test.map((d) => Math.abs(d.y - slope * d.x)));
  return { slope, before, after, gain: before - after };
}

const pts = (v) => (v * 100).toFixed(3);
console.log(`\nfitted on weeks before ${split}, tested on ${weeks.filter((w) => w >= split).length} weeks from ${split}\n`);
for (const c of CANDIDATES) {
  const data = rows.filter(c.needs).map((r) => ({ week: r.week, y: r.residual, x: c.x(r) })).filter((d) => d.x != null && Number.isFinite(d.x));
  if (data.length < 100) {
    console.log(`${c.name}: too few company-weeks (${data.length})`);
    continue;
  }
  const real = gain(data);
  // Shuffle x among the companies of each week.
  const byWeek = new Map();
  for (const d of data) byWeek.set(d.week, [...(byWeek.get(d.week) ?? []), d]);
  let asGood = 0;
  for (let i = 0; i < 1000; i++) {
    const shuffled = [];
    for (const group of byWeek.values()) {
      const xs = group.map((d) => d.x);
      for (let j = xs.length - 1; j > 0; j--) {
        const s = Math.floor(rand() * (j + 1));
        [xs[j], xs[s]] = [xs[s], xs[j]];
      }
      group.forEach((d, j) => shuffled.push({ ...d, x: xs[j] }));
    }
    if (gain(shuffled).gain >= real.gain) asGood++;
  }
  const p = asGood / 1000;
  const later = new Set(data.filter((d) => d.week >= split).map((d) => d.week)).size;
  const passes = real.gain > 0 && p < 0.05 && later >= 26;
  console.log(`${passes ? 'PASSES' : 'not yet'}  ${c.name}: typical weekly gap ${pts(real.before)} → ${pts(real.after)} points (slope ${real.slope.toFixed(3)}, ${data.length} company-weeks); shuffled did as well ${(p * 100).toFixed(1)}% of the time`);
}
