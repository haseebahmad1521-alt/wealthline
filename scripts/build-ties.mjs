// Builds src/data/ties.json: documented ties between tracked companies and the US government, from USAspending.gov
// (public, no key): each company's federal contract obligations over the last three fiscal years and how much came
// from the Department of Defense. Recipients are matched by the start of their official name, and the matched names
// are kept, so every figure can be checked against its source.
// Run: node scripts/build-ties.mjs (reads the public Supabase config from .env.local).
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const API = 'https://api.usaspending.gov/api/v2';
const WINDOW = { start_date: '2023-10-01', end_date: '2026-09-30' }; // fiscal years 2024-2026
const CONTRACTS = ['A', 'B', 'C', 'D'];

// Official names where they differ from the familiar one.
const ALIAS = {
  SpaceX: 'Space Exploration Technologies',
  Alphabet: 'Google',
  Meta: 'Meta Platforms',
  'The Home Depot': 'Home Depot',
  'Dell Technologies': 'Dell',
  'Palantir Technologies': 'Palantir',
  'XPO, Inc.': 'XPO',
  'Workday, Inc.': 'Workday',
  'Charles Schwab Corporation': 'Charles Schwab',
  'Blackstone Inc.': 'Blackstone',
  'Ralph Lauren Corporation': 'Ralph Lauren',
  'The New York Times Company': 'New York Times',
};
// Which recipient names count, where the plain rule (the company's own name, plus a legal suffix) isn't enough: known
// government-facing subsidiaries. Anything else that merely starts with the same word (Koch Construction, Tesla
// Laboratories, Amazon Sheds) is someone else and is left out.
const MATCH = {
  SpaceX: /^SPACE EXPLORATION TECHNOLOGIES CORP/,
  Alphabet: /^GOOGLE (LLC|PUBLIC SECTOR LLC)/,
  Google: /^GOOGLE (LLC|PUBLIC SECTOR LLC)/,
  Amazon: /^AMAZON (WEB SERVICES|\.COM SERVICES)/,
  'Dell Technologies': /^DELL (FEDERAL SYSTEMS|MARKETING|TECHNOLOGIES)/,
  'Palantir Technologies': /^PALANTIR (USG|TECHNOLOGIES)/,
  Oracle: /^ORACLE (AMERICA|HEALTH GOVERNMENT SERVICES|CORPORATION)/,
  SAP: /^SAP (NATIONAL SECURITY SERVICES|AMERICA)/,
  'Thomson Reuters': /^THOMSON REUTERS/,
  'United Rentals': /^UNITED RENTALS/,
  BMW: /^BMW OF NORTH AMERICA/,
  'Mediterranean Shipping Company': /^MEDITERRANEAN SHIPPING COMPANY/,
};
const SUFFIX = String.raw`,? (INC|CORP|CORPORATION|LLC|LTD|LIMITED|L\.?P|CO|COMPANY|PLC|AG|SE|SA)\.?`;
const clean = (name) => ALIAS[name] ?? name.replace(/^The /, '').replace(/,? (Inc\.?|Corporation|Company|Group|Holdings|Ltd\.?|Limited|LLC)$/i, '').trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// USAspending sometimes drops a connection: three tries, a little longer apart each time, then no data.
async function post(path, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
      if (res.ok) return await res.json();
    } catch {
      /* retried below */
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return null;
}
const pause = () => new Promise((r) => setTimeout(r, 300));

const companies = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/companies?select=id,name`, {
  headers: { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY}` },
}).then((r) => r.json());

const out = {};
for (const c of companies) {
  const query = clean(c.name);
  if (query.length < 3) continue;
  const starts = MATCH[c.name] ?? new RegExp(`^${escape(query.toUpperCase())}(${SUFFIX})?$`);
  const r = await post('/search/spending_by_category/recipient/', { filters: { recipient_search_text: [query], award_type_codes: CONTRACTS, time_period: [WINDOW] }, limit: 20 });
  await pause();
  const matched = (r?.results ?? []).filter((x) => starts.test(String(x.name).toUpperCase()) && x.amount > 0);
  const total = matched.reduce((n, x) => n + x.amount, 0);
  if (total < 1e6) continue; // under a million dollars over three years isn't a tie worth showing
  // Defence share: the agency breakdown for each matched recipient name.
  let dod = 0;
  for (const m of matched.slice(0, 4)) {
    const a = await post('/search/spending_by_category/awarding_agency/', { filters: { recipient_search_text: [m.name], award_type_codes: CONTRACTS, time_period: [WINDOW] }, limit: 10 });
    await pause();
    const agencyTotal = (a?.results ?? []).reduce((n, x) => n + x.amount, 0);
    const d = (a?.results ?? []).find((x) => x.code === 'DOD')?.amount ?? 0;
    // The agency search is fuzzy; scale to this recipient's own total so nothing unrelated is counted.
    dod += agencyTotal > 0 ? (d / agencyTotal) * m.amount : 0;
  }
  const top = matched.sort((a, b) => b.amount - a.amount)[0];
  out[c.id] = {
    company: c.name,
    contracts: Math.round(total),
    defense: Math.round(Math.min(dod, total)),
    recipients: matched.map((x) => x.name),
    url: top.recipient_id ? `https://www.usaspending.gov/recipient/${top.recipient_id}/latest` : 'https://www.usaspending.gov/search',
  };
  console.log(`${c.name.padEnd(34)} contracts $${(total / 1e9).toFixed(2)}B  defence $${(dod / 1e9).toFixed(2)}B  (${matched.map((x) => x.name).join('; ').slice(0, 90)})`);
}

writeFileSync(
  'src/data/ties.json',
  `${JSON.stringify(
    {
      built: new Date().toISOString().slice(0, 10),
      source: 'USAspending.gov, federal contract obligations (award types A-D)',
      window: 'Oct 2023 to Sep 2026 (US fiscal years 2024-2026)',
      companies: out,
    },
    null,
    1,
  )}\n`,
);
console.log(`ties: ${Object.keys(out).length} companies with federal contracts`);
