// Builds src/data/donations.json: federal political contributions by tracked people since 2019, from the FEC's
// individual-contribution records (api.open.fec.gov). Uses FEC_API_KEY from .env.local (a free personal key from
// https://api.data.gov/signup/, 1,000 requests an hour; never EXPO_PUBLIC_, never committed), else the shared DEMO_KEY
// (40 an hour: too few for more than a handful of people).
//
// Matching is strict, since many people share a name:
//   - the contributor's surname and first name must equal the person's, AND the employer or occupation must name one of
//     the person's tracked companies (or a known former name, ALIAS); or
//   - a trust named after the person ("ELON MUSK REVOCABLE TRUST").
// Memo entries (memo_code X: parts of a total reported elsewhere, or earmarked pass-throughs) are left out so nothing
// counts twice. Rows that matched the name but not an employer are reported for review, never included.
// A donation record is a public record, not a claim of influence; the app says so.
//
// NOT YET VERIFIED (Nov 16): a first run gave Elon Musk $566M since 2019, about double what's been reported, so amended
// filings are probably counted twice. Check the duplicate rows before shipping src/data/donations.json or showing it.
// Run: node scripts/build-donations.mjs (reads the public Supabase config from .env.local).
import { readFileSync, writeFileSync } from 'node:fs';

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

const SINCE = '2019-01-01';
// Employer names in filings that differ from the company's name in the database.
const ALIAS = { spacex: ['SPACE EXPLORATION', 'SPACEX'], alphabet: ['GOOGLE'], google: ['GOOGLE'], meta: ['FACEBOOK', 'META PLATFORMS'], 'x corp': ['TWITTER'], oracle: ['ORACLE'] };
// Words too common in company names to identify one.
const GENERIC = new Set(['GROUP', 'HOLDINGS', 'HOLDING', 'TECHNOLOGIES', 'TECHNOLOGY', 'COMPANY', 'CORPORATION', 'INTERNATIONAL', 'INDUSTRIES', 'LIMITED', 'GLOBAL', 'PARTNERS', 'CAPITAL', 'MANAGEMENT', 'FINANCIAL', 'SERVICES', 'SYSTEMS', 'ENTERPRISES', 'AMERICA', 'AMERICAN', 'NATIONAL', 'UNITED', 'ENERGY', 'SOFTWARE', 'PLATFORMS', 'INVESTMENTS', 'ASSOCIATES', 'THE']);

const people = await sb('people?select=id,slug,name,citizenship,residence');
const links = await sb('person_companies?select=person_id,company_id');
const companies = new Map((await sb('companies?select=id,name')).map((c) => [c.id, c.name]));

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Words and aliases that identify a person's companies in an employer field. */
function employerKeys(personId) {
  const keys = new Set();
  for (const l of links.filter((x) => x.person_id === personId)) {
    const name = companies.get(l.company_id);
    if (!name) continue;
    for (const a of ALIAS[name.toLowerCase()] ?? []) keys.add(a);
    for (const w of strip(name).split(' ')) if (w.length >= 4 && !GENERIC.has(w)) keys.add(w);
  }
  return [...keys];
}

async function fec(params) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.open.fec.gov/v1/schedules/schedule_a/?${new URLSearchParams({ api_key: env.FEC_API_KEY || 'DEMO_KEY', per_page: '100', sort: '-contribution_receipt_date', min_date: SINCE, ...params })}`);
    if (res.status === 429) {
      console.log('  rate limited; waiting a minute');
      await wait(60_000);
      continue;
    }
    if (!res.ok) throw new Error(`FEC answered ${res.status}`);
    return res.json();
  }
  throw new Error('FEC kept rate-limiting');
}

const out = {};
const review = [];
// US citizens and residents with tracked companies only: others can't legally give to US federal campaigns, the
// simulations move no one else, and it saves the quota.
const us = people.filter((p) => links.some((l) => l.person_id === p.id) && /united states|american|\bus\b|\busa\b/i.test(`${p.citizenship ?? ''} ${p.residence ?? ''}`));
console.log(`${us.length} of ${people.length} people are US citizens or residents`);
for (const p of us) {
  const parts = strip(p.name).split(' ');
  const first = parts[0];
  const last = parts[parts.length - 1];
  const keys = employerKeys(p.id);
  const rows = [];
  let last_index = null;
  let last_date = null;
  for (let page = 0; page < 5; page++) {
    const d = await fec({ contributor_name: `${last}, ${first}`, ...(last_index ? { last_index, last_contribution_receipt_date: last_date } : {}) });
    rows.push(...d.results);
    last_index = d.pagination?.last_indexes?.last_index;
    last_date = d.pagination?.last_indexes?.last_contribution_receipt_date;
    if (!last_index || d.results.length < 100) break;
    await wait(1500);
  }
  await wait(1500);
  const kept = [];
  for (const r of rows) {
    if (r.memo_code === 'X') continue;
    const name = strip(r.contributor_name ?? '');
    const [rLast, rest = ''] = name.includes(' ') && (r.contributor_name ?? '').includes(',') ? [strip(r.contributor_name.split(',')[0]), strip(r.contributor_name.split(',')[1])] : ['', ''];
    const trust = /TRUST/.test(name) && name.includes(first) && name.includes(last);
    const sameName = rLast === last && rest.split(' ')[0] === first;
    if (!trust && !sameName) continue;
    const employer = strip(`${r.contributor_employer ?? ''} ${r.contributor_occupation ?? ''}`);
    if (trust || keys.some((k) => employer.includes(k))) kept.push(r);
    else review.push(`${p.name}: ${r.contributor_name} | ${r.contributor_employer} | ${r.contributor_occupation} | $${r.contribution_receipt_amount}`);
  }
  if (!kept.length) {
    console.log(`${p.name.padEnd(28)} none matched (${rows.length} by name; keys ${keys.join('/') || 'none'})`);
    continue;
  }
  const total = kept.reduce((n, r) => n + (r.contribution_receipt_amount ?? 0), 0);
  const by = new Map();
  for (const r of kept) by.set(r.committee?.name ?? r.committee_id, (by.get(r.committee?.name ?? r.committee_id) ?? 0) + (r.contribution_receipt_amount ?? 0));
  const dates = kept.map((r) => r.contribution_receipt_date).filter(Boolean).sort();
  out[p.id] = {
    name: p.name,
    total: Math.round(total),
    count: kept.length,
    from: dates[0]?.slice(0, 10) ?? null,
    to: dates[dates.length - 1]?.slice(0, 10) ?? null,
    top: [...by].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([committee, amount]) => ({ committee, amount: Math.round(amount) })),
    capped: rows.length >= 500,
    url: `https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(`${last}, ${first}`)}&min_date=${SINCE.slice(5, 7)}%2F${SINCE.slice(8)}%2F${SINCE.slice(0, 4)}`,
  };
  console.log(`${p.name.padEnd(28)} $${Math.round(total).toLocaleString('en-US').padStart(14)} in ${kept.length} (top: ${out[p.id].top.map((t) => t.committee).join('; ')})`);
}
writeFileSync(
  'src/data/donations.json',
  `${JSON.stringify({ built: new Date().toISOString().slice(0, 10), since: SINCE, source: 'FEC individual contributions (api.open.fec.gov), memo entries excluded', people: out }, null, 1)}\n`,
);
console.log(`\n${Object.keys(out).length} people with records. Name matches left out for review (no employer match): ${review.length}`);
for (const r of review.slice(0, 30)) console.log(`  ${r}`);
