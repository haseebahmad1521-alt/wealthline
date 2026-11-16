// Builds src/data/covariance.json: how much each listed company's share price swings in a week and how the companies
// swing together (covariance of weekly log returns over the last 156 complete weeks), for the overtake chances on
// Rankings (src/lib/races.ts). Also calibrates the range width on past four-week moves: for every company and every
// four-week stretch of the last two years, its move divided by the swing measured on the 156 weeks before it; the 80th
// percentile of those sizes is the width to use, so fatter-than-normal tails are counted.
// Run: node scripts/build-covariance.mjs (reads the public Supabase config from .env.local).
import { readFileSync, writeFileSync } from 'node:fs';

import { FIT_SYMBOL, weekKey } from '../supabase/functions/_shared/factors.ts';
import { lastCompleteWeek } from '../supabase/functions/_shared/ledger.ts';
import { weekly } from './yahoo.mjs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const sb = (path) => fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then((r) => r.json());

const WINDOW = 156;
const listed = await sb('companies?select=id,ticker,quote_symbol&is_private=eq.false&ticker=not.is.null');
const returns = new Map();
for (const c of listed) {
  const q = c.quote_symbol ?? c.ticker.replace('.', '-');
  returns.set(c.id, await weekly(FIT_SYMBOL[q] ?? q));
}
// The last complete week (not the one under way) that most companies have.
const allWeeks = [...new Set([...returns.values()].flatMap((m) => [...m.keys()]))].sort();
const counts = new Map(allWeeks.map((w) => [w, [...returns.values()].filter((m) => m.has(w)).length]));
const last = lastCompleteWeek(allWeeks.filter((w) => counts.get(w) >= listed.length * 0.8), new Date(), weekKey);
const weeks = allWeeks.filter((w) => w <= last).slice(-WINDOW);
const ids = listed.map((c) => c.id).filter((id) => weeks.filter((w) => returns.get(id).has(w)).length >= 104);

/** Covariance of two series over the weeks both have (demeaned over those weeks). */
function cov(a, b, over) {
  const both = over.filter((w) => a.has(w) && b.has(w));
  if (both.length < 52) return 0;
  const ma = both.reduce((n, w) => n + a.get(w), 0) / both.length;
  const mb = both.reduce((n, w) => n + b.get(w), 0) / both.length;
  return both.reduce((n, w) => n + (a.get(w) - ma) * (b.get(w) - mb), 0) / (both.length - 1);
}
const upper = [];
for (let i = 0; i < ids.length; i++) for (let j = i; j < ids.length; j++) upper.push(Number(cov(returns.get(ids[i]), returns.get(ids[j]), weeks).toExponential(4)));

// Calibration: four-week moves against the swing measured on the 156 weeks before each.
const sizes = [];
for (const id of ids) {
  const r = returns.get(id);
  for (let t = allWeeks.indexOf(last) - 104; t + 4 <= allWeeks.indexOf(last) + 1; t += 4) {
    const span = allWeeks.slice(t, t + 4);
    if (!span.every((w) => r.has(w))) continue;
    const prior = allWeeks.slice(Math.max(0, t - WINDOW), t);
    const v = cov(r, r, prior);
    if (!v) continue;
    sizes.push(Math.abs(span.reduce((n, w) => n + r.get(w), 0)) / Math.sqrt(4 * v));
  }
}
sizes.sort((a, b) => a - b);
const z80 = sizes[Math.floor(sizes.length * 0.8)];
writeFileSync(
  'src/data/covariance.json',
  `${JSON.stringify({ built: new Date().toISOString().slice(0, 10), window: { from: weeks[0], to: last, weeks: weeks.length }, source: 'Yahoo Finance weekly closes', calibration: { z80: Math.round(z80 * 1000) / 1000, normal: 1.2816, samples: sizes.length }, ids, cov: upper })}\n`,
);
console.log(`${ids.length} companies, weeks ${weeks[0]}..${last}; four-week 80% width ${z80.toFixed(3)} (normal 1.282) from ${sizes.length} moves`);
