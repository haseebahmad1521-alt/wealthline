// Share counts for tracked people in their listed US companies, from SEC filings; writes ownership.sql for review.
// Run: node --env-file=.env supabase/import/ownership.mjs   (needs SEC_CONTACT in .env, e.g. an email, per SEC rules)
//
// Form 4: insiders report what they hold after each trade, but only for the classes and holding types in that trade,
// so the person's filings for the company are merged, newest first, keeping the latest figure for each
// (class, direct/indirect, nature) key. Schedule 13G/13D: holders above 5% report total beneficial ownership.
// The newer of the two wins. Values are never estimated; a person with neither filing keeps 0 ("not recorded").
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const contact = process.env.SEC_CONTACT;
if (!contact) throw new Error('Set SEC_CONTACT in .env (SEC requires a contact in the User-Agent).');
const UA = { 'User-Agent': `Wealthline ${contact}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (v) => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

let last = 0;
async function sec(url, as = 'text') {
  const wait = last + 130 - Date.now(); // well under SEC's 10 requests a second
  if (wait > 0) await sleep(wait);
  last = Date.now();
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return as === 'json' ? r.json() : r.text();
    if (r.status === 404) return null;
    await sleep(2000 * (i + 1));
  }
  throw new Error(`SEC kept failing: ${url}`);
}
const pick = (s, tag) => s.match(new RegExp(`<${tag}>\\s*(?:<value>)?\\s*([^<]+)`))?.[1]?.trim() ?? null;
const all = (s, tag) => [...s.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);

// "Larry Page" → last "page", first initial "L" (Form 4 names read "Page Lawrence E"; 13G names "Sergey Brin").
function nameKey(name) {
  const parts = name.replace(/\s*&\s*family/i, '').replace(/[,.]/g, ' ').trim().split(/\s+/);
  return { last: parts.at(-1).toLowerCase(), first: parts[0][0].toUpperCase() };
}
const form4Name = (n, k) => {
  const p = n.replace(/[,.]/g, ' ').trim().split(/\s+/);
  return p[0].toLowerCase() === k.last && p[1]?.[0]?.toUpperCase() === k.first;
};
const scheduleName = (n, k) => {
  const p = n.replace(/[,.]/g, ' ').trim().split(/\s+/);
  return p.at(-1).toLowerCase() === k.last && p[0][0].toUpperCase() === k.first;
};

/** Common-stock holdings in one Form 4, keyed by class + direct/indirect + nature. */
function form4Holdings(xml) {
  const out = new Map();
  for (const tag of ['nonDerivativeTransaction', 'nonDerivativeHolding']) {
    for (const b of all(xml, tag)) {
      const title = pick(b, 'securityTitle');
      const shares = Number(pick(b, 'sharesOwnedFollowingTransaction'));
      if (!title || !Number.isFinite(shares) || !/common|ordinary|class [abc]\b/i.test(title)) continue;
      out.set(`${title}|${pick(b, 'directOrIndirectOwnership')}|${pick(b, 'natureOfOwnership') ?? ''}`, { title, shares }); // last row wins within a filing
    }
  }
  return out;
}

// Berkshire Class A is worth 1,500 Class B; other dual classes convert 1:1 or trade close together.
function toListedShares(company, title, shares) {
  return /berkshire/i.test(company) && /class a/i.test(title) ? shares * 1500 : shares;
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const rest = (path) => fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key } }).then((r) => r.json());
const links = await rest('person_companies?select=person_id,people(name,slug),companies(id,name,ticker,cik,quote_symbol)');
const work = links.filter((l) => l.companies?.cik && l.companies.ticker && !l.companies.quote_symbol); // listed in the US, SEC files
console.error(`${work.length} person–company pairs with SEC filings`);

const out = [];
const report = [];
const issuerCache = new Map();
for (const l of work) {
  const c = l.companies;
  const k = nameKey(l.people.name);
  if (!issuerCache.has(c.cik)) issuerCache.set(c.cik, await sec(`https://data.sec.gov/submissions/CIK${String(c.cik).padStart(10, '0')}.json`, 'json'));
  const r = issuerCache.get(c.cik).filings.recent;
  const filings = r.form.map((form, i) => ({ form, date: r.filingDate[i], acc: r.accessionNumber[i], doc: r.primaryDocument[i] }));
  const archive = (acc, doc) => `https://www.sec.gov/Archives/edgar/data/${c.cik}/${acc.replace(/-/g, '')}/${doc.split('/').pop()}`;

  // Form 4: find the person's first filing for this company, then walk their own filing history.
  let f4 = null;
  let ownerCik = null;
  for (const f of filings.filter((x) => x.form === '4').slice(0, 200)) {
    const xml = await sec(archive(f.acc, f.doc));
    if (xml && form4Name(pick(xml, 'rptOwnerName') ?? '', k)) {
      ownerCik = pick(xml, 'rptOwnerCik');
      break;
    }
  }
  if (ownerCik) {
    const own = (await sec(`https://data.sec.gov/submissions/CIK${ownerCik.padStart(10, '0')}.json`, 'json')).filings.recent;
    const merged = new Map();
    let newest = null;
    for (let i = 0; i < own.form.length && i < 300; i++) {
      if (own.form[i] !== '4') continue;
      const u = `https://www.sec.gov/Archives/edgar/data/${Number(ownerCik)}/${own.accessionNumber[i].replace(/-/g, '')}/${own.primaryDocument[i].split('/').pop()}`;
      const xml = await sec(u);
      if (!xml || Number(pick(xml, 'issuerCik')) !== Number(c.cik)) continue;
      newest ??= { date: own.filingDate[i], url: u };
      for (const [hk, h] of form4Holdings(xml)) if (!merged.has(hk)) merged.set(hk, h); // newest figure per key
    }
    if (merged.size && newest) {
      const classes = [...new Set([...merged.values()].map((h) => h.title))];
      const shares = [...merged.values()].reduce((n, h) => n + toListedShares(c.name, h.title, h.shares), 0);
      f4 = { shares, date: newest.date, url: newest.url, label: `SEC Form 4, latest filed ${newest.date}`, note: classes.join('; ') };
    }
  }

  // Schedule 13G/13D: the newest one naming the person.
  let sch = null;
  for (const f of filings.filter((x) => /^SCHEDULE 13[GD]/.test(x.form))) {
    const xml = await sec(archive(f.acc, f.doc));
    if (!xml) continue;
    const names = [...xml.matchAll(/<reportingPersonName>([^<]+)/g)].map((m) => m[1].trim());
    if (!names.length || !scheduleName(names[0], k)) continue;
    const shares = Number(pick(xml, 'reportingPersonBeneficiallyOwnedAggregateNumberOfShares') ?? pick(xml, 'aggregateAmountOwned'));
    if (!Number.isFinite(shares) || shares <= 0) continue;
    const asOf = pick(xml, 'eventDateRequiresFilingThisStatement') ?? pick(xml, 'dateOfEvent');
    const iso = asOf?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) ? asOf.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$1-$2') : f.date;
    sch = { shares: toListedShares(c.name, pick(xml, 'securitiesClassTitle') ?? '', shares), date: iso, url: archive(f.acc, f.doc), label: `SEC ${f.form}, as of ${iso}`, note: 'Beneficial ownership as reported (may include trusts and foundations they control)' };
    break;
  }

  const best = [f4, sch].filter(Boolean).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!best) {
    report.push(`${l.people.name} · ${c.name}: no Form 4 or Schedule 13G/13D found (left as not recorded)`);
    continue;
  }
  report.push(`${l.people.name} · ${c.name}: ${Math.round(best.shares).toLocaleString('en-US')} shares (${best.label}${best.note ? `; ${best.note}` : ''})`);
  const set = `shares_owned = ${Math.round(best.shares)}, shares_source_label = ${q(best.label)}, shares_source_url = ${q(best.url)}, shares_as_of = ${q(best.date)}, shares_note = ${q(best.note)}`;
  out.push(
    `update public.holdings set ${set} where person_id = ${q(l.person_id)} and company_id = ${q(c.id)};`,
    `insert into public.holdings (person_id, company, ticker, company_id, shares_owned, shares_source_label, shares_source_url, shares_as_of, shares_note) select ${q(l.person_id)}, ${q(c.name)}, ${q(c.ticker)}, ${q(c.id)}, ${Math.round(best.shares)}, ${q(best.label)}, ${q(best.url)}, ${q(best.date)}, ${q(best.note)} where not exists (select 1 from public.holdings where person_id = ${q(l.person_id)} and company_id = ${q(c.id)});`,
  );
}

writeFileSync(join(dir, 'ownership.sql'), `-- generated by ownership.mjs on ${new Date().toISOString().slice(0, 10)}\nbegin;\n${out.join('\n')}\ncommit;\n`);
console.log(report.join('\n'));
