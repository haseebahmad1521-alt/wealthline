// Links tracked people to their companies for the World globe and writes companies.sql for review.
// Run after people have wikidata_id (top100.mjs): node --env-file=.env supabase/import/companies.mjs
//
// 1. Wikidata relations: company "founded by" (P112) or "owned by" (P127) the person, or the person "owner of" (P1830).
//    Kept only when the company's name matches the person's Forbes source of wealth or it is listed on an exchange;
//    at most three per person, source matches first.
// 2. If none is kept, a company whose exact English name is a part of the Forbes source ("Walmart", "Zara") is linked
//    as relation 'source': Forbes names it, Wikidata just identifies it.
// 3. Every stock symbol is checked against the price feed; symbols it doesn't answer for are dropped.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const UA = 'WealthlineImport/1.0 (haseebahmad1521-alt.github.io/wealthline)';
const BROWSER = 'Mozilla/5.0 (compatible; Wealthline/1.0; +https://haseebahmad1521-alt.github.io/wealthline/)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (v) => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

async function sparql(query) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': UA } });
    if (r.ok) return (await r.json()).results.bindings;
    // 429: wait as long as Wikidata asks; 5xx (query timeouts): back off further each time.
    const wait = Number(r.headers.get('retry-after')) * 1000 || 10_000 * (i + 1);
    console.error(`Wikidata ${r.status}, retrying in ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
  throw new Error('Wikidata kept failing');
}
const qid = (uri) => uri.split('/').pop();

// Exchange → price-feed suffix. US listings carry no suffix; Hong Kong codes are four digits.
const EXCHANGES = [
  // US Nasdaq only: "Nasdaq Stockholm", "Nasdaq Copenhagen" and the like are matched further down.
  [/new york stock exchange|^nasdaq( stock market)?$/i, ''],
  [/nasdaq copenhagen/i, '.CO'], [/nasdaq helsinki/i, '.HE'],
  [/euronext paris/i, '.PA'], [/euronext amsterdam/i, '.AS'], [/euronext brussels/i, '.BR'], [/euronext milan|borsa italiana/i, '.MI'],
  [/national stock exchange of india/i, '.NS'], [/bombay stock exchange|bse/i, '.BO'],
  [/hong kong/i, '.HK'], [/tokyo stock exchange/i, '.T'], [/shenzhen/i, '.SZ'], [/shanghai stock exchange/i, '.SS'],
  [/korea exchange/i, '.KS'], [/frankfurt|xetra/i, '.DE'], [/madrid|bolsa de madrid|spanish stock/i, '.MC'],
  [/mexican stock exchange|bolsa mexicana/i, '.MX'], [/six swiss|swiss exchange/i, '.SW'], [/toronto stock exchange/i, '.TO'],
  [/australian securities exchange/i, '.AX'], [/london stock exchange/i, '.L'], [/saudi|tadawul/i, '.SR'],
  [/stockholm|nasdaq stockholm/i, '.ST'], [/taiwan stock exchange/i, '.TW'], [/indonesia stock exchange/i, '.JK'],
  [/stock exchange of thailand/i, '.BK'], [/b3|brasil bolsa/i, '.SA'], [/johannesburg/i, '.JO'], [/singapore exchange/i, '.SI'],
];
function symbolFor(ticker, exchange) {
  for (const [re, suffix] of EXCHANGES) {
    if (!re.test(exchange)) continue;
    if (suffix === '.HK') return `${ticker.replace(/^0+/, '').padStart(4, '0')}.HK`;
    return suffix ? `${ticker}${suffix}` : ticker.replace('.', '-');
  }
  return null;
}

// Products and services ("cloud computing platform") and industries ("type of business") aren't companies.
const BUSINESS = /company|business|enterprise|conglomerate|corporation|holding|bank|retail|manufacturer|exchange|group|firm|subsidiary|chain|airline|operator|producer|studio|startup|maker|fund/i;
const NOT = /foundation|charity|nonprofit|non-profit|team|club|newspaper|magazine|university|school|award|family|band|film|television series|video game|album|song|website$|type of|industry|economic (sector|activity)|field of|profession|occupation|commodit|food|confection|rock$|mineral|sector$/i;
// A company counts when at least one of its types is a company type (Amazon is also a "web service"; that's fine).
const isCompany = (types) => [...types].some((t) => BUSINESS.test(t) && !NOT.test(t));

const env = process.env;
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const res = await fetch(`${url}/rest/v1/people?select=slug,name,main_source,wikidata_id&order=forbes_rank`, { headers: { apikey: key } });
const people = await res.json();
const known = new Set((await (await fetch(`${url}/rest/v1/companies?select=wikidata_id&wikidata_id=not.is.null`, { headers: { apikey: key } })).json()).map((c) => c.wikidata_id));
console.error(`${people.length} people, ${people.filter((p) => p.wikidata_id).length} with a Wikidata item`);

// "Koch, Inc." is one name: legal suffixes stay attached instead of becoming parts of their own.
const SUFFIX = /^(inc|ltd|llc|corp|co|plc|sa|ag|nv|se|lp)\.?$/i;
const sourceParts = (s) =>
  (s ?? '').split(/,|&|\band\b|\//).map((x) => x.trim()).filter((x) => x.length > 1 && !SUFFIX.test(x));
const matchesSource = (label, source) => {
  const l = norm(label);
  return sourceParts(source).some((part) => {
    const p = norm(part);
    return p.length > 2 && (l === p || l.startsWith(`${p} `) || p.startsWith(`${l} `) || l.split(' ').includes(p));
  });
};

// Labels come from the entity API (50 ids a call); asking SPARQL for labels made the queries time out.
const labelCache = new Map();
async function labels(ids) {
  const want = [...new Set(ids)].filter((id) => !labelCache.has(id));
  for (let i = 0; i < want.length; i += 50) {
    const batch = want.slice(i, i + 50);
    let body = null;
    for (let t = 0; t < 5 && !body; t++) {
      const r = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels&languages=en&format=json`, { headers: { 'User-Agent': UA } });
      if (r.ok) body = await r.json();
      else await sleep(Number(r.headers.get('retry-after')) * 1000 || 5000 * (t + 1));
    }
    if (!body) throw new Error('Wikidata labels kept failing'); // never silently drop companies
    for (const id of batch) labelCache.set(id, body.entities?.[id]?.labels?.en?.value ?? null);
    await sleep(300);
  }
  return (id) => labelCache.get(id) ?? null;
}

// 1. Relations, 10 people per query, ids only.
const found = new Map(); // slug -> companies
const withQ = people.filter((p) => p.wikidata_id);
for (let i = 0; i < withQ.length; i += 10) {
  const batch = withQ.slice(i, i + 10);
  const rows = await sparql(`SELECT ?person ?co ?rel ?type ?ticker ?ex ?parent WHERE {
    VALUES ?person { ${batch.map((p) => `wd:${p.wikidata_id}`).join(' ')} }
    { ?co wdt:P112 ?person . BIND("founder" AS ?rel) } UNION { ?co wdt:P127 ?person . BIND("owner" AS ?rel) } UNION { ?person wdt:P1830 ?co . BIND("owner" AS ?rel) }
    OPTIONAL { ?co wdt:P31 ?type }
    OPTIONAL { ?co wdt:P749 ?parent }
    OPTIONAL { ?co p:P414 ?st . ?st ps:P414 ?ex ; pq:P249 ?ticker . FILTER NOT EXISTS { ?st pq:P582 ?ended } }
  }`);
  const label = await labels(rows.flatMap((r) => [qid(r.co.value), r.type && qid(r.type.value), r.ex && qid(r.ex.value)].filter(Boolean)));
  for (const p of batch) {
    const byCo = new Map();
    for (const r of rows.filter((x) => qid(x.person.value) === p.wikidata_id)) {
      const id = qid(r.co.value);
      const name = label(id);
      if (!name) continue;
      const c = byCo.get(id) ?? { qid: id, name, rel: r.rel.value, types: new Set(), listings: [], parents: new Set() };
      if (r.type) c.types.add(label(qid(r.type.value)) ?? '');
      if (r.parent) c.parents.add(qid(r.parent.value));
      if (r.ticker && r.ex) {
        const sym = symbolFor(r.ticker.value, label(qid(r.ex.value)) ?? '');
        if (sym && !c.listings.some((l) => l.symbol === sym)) c.listings.push({ ticker: r.ticker.value, exchange: label(qid(r.ex.value)), symbol: sym });
      }
      if (r.rel.value === 'founder') c.rel = 'founder';
      byCo.set(id, c);
    }
    const companies = [...byCo.values()].filter((c) => isCompany(c.types));
    // A subsidiary whose parent is also theirs (Google under Alphabet) counts once, as the parent. Among names sharing
    // a first word ("Oracle Corporation" / "Oracle Cloud", "Dell Technologies" / "Dell") one is kept: a company already
    // in the database first, then one with a listing, then the shorter name.
    const ids = new Set(companies.map((c) => c.qid));
    const first = (n) => norm(n).split(' ')[0];
    const score = (x) => [Number(known.has(x.qid)), x.listings.length, -x.name.length];
    const prefer = (x, y) => {
      const [a, b] = [score(x), score(y)];
      const i = a.findIndex((v, k) => v !== b[k]);
      return i < 0 ? 0 : a[i] - b[i];
    };
    const best = new Map();
    for (const c of companies.filter((c) => ![...c.parents].some((pq) => ids.has(pq)))) {
      const b = best.get(first(c.name));
      if (!b || prefer(c, b) > 0) best.set(first(c.name), c);
    }
    const kept = [...best.values()]
      .map((c) => ({ ...c, source: matchesSource(c.name, p.main_source) }))
      .filter((c) => c.source || c.listings.length)
      .sort((a, b) => Number(b.source) - Number(a.source) || b.listings.length - a.listings.length)
      .slice(0, 3);
    if (kept.length) found.set(p.slug, kept);
  }
  console.error(`relations: ${Math.min(i + 10, withQ.length)}/${withQ.length}`);
  await sleep(1000);
}

// 2. Exact-name fallback from the Forbes source: a business item whose English name is that part of the source.
// Only proper names: ordinary words ("Candy", "Coal", "Real Estate") are also names of unrelated companies.
const dictionary = new Set(existsSync('/usr/share/dict/words') ? readFileSync('/usr/share/dict/words', 'utf8').split('\n').map((w) => w.toLowerCase()) : []);
const SECTOR = /^(biotech|fintech|investments?|retail|mining|real estate|hedge funds?|private equity|software|semiconductors?|pharmaceuticals?|diversified|shipping|steel|oil|gas|energy|media|telecom|cryptocurrency|banking)$/i;
const word = (w) => dictionary.has(w) || (w.endsWith('s') && dictionary.has(w.slice(0, -1))); // "Sensors" too
const properName = (n) => !SECTOR.test(n) && !n.toLowerCase().split(/\s+/).every(word);
const missing = people.filter((p) => !found.has(p.slug));
const names = [...new Set(missing.flatMap((p) => sourceParts(p.main_source)))].filter((n) => /^[A-Z0-9]/.test(n) && n.split(' ').length <= 4 && properName(n));
for (let i = 0; i < names.length; i += 20) {
  const batch = names.slice(i, i + 20);
  const rows = await sparql(`SELECT ?name ?co ?type ?ticker ?ex WHERE {
    VALUES ?name { ${batch.map((n) => `${JSON.stringify(n)}@en`).join(' ')} }
    ?co rdfs:label ?name ; wdt:P31 ?type .
    OPTIONAL { ?co p:P414 ?st . ?st ps:P414 ?ex ; pq:P249 ?ticker . FILTER NOT EXISTS { ?st pq:P582 ?ended } }
  }`);
  const label = await labels(rows.flatMap((r) => [qid(r.type.value), r.ex && qid(r.ex.value)].filter(Boolean)));
  // Keep only items whose type reads as a business.
  const business = rows.filter((r) => isCompany([label(qid(r.type.value)) ?? '']));
  for (const p of missing) {
    for (const part of sourceParts(p.main_source)) {
      const hits = [...new Set(business.filter((r) => r.name.value === part).map((r) => qid(r.co.value)))];
      if (hits.length !== 1) continue; // ambiguous or unknown names are left for an admin
      const rs = rows.filter((r) => qid(r.co.value) === hits[0]);
      const listings = [];
      for (const r of rs) {
        if (!r.ticker || !r.ex) continue;
        const sym = symbolFor(r.ticker.value, label(qid(r.ex.value)) ?? '');
        if (sym && !listings.some((l) => l.symbol === sym)) listings.push({ ticker: r.ticker.value, exchange: label(qid(r.ex.value)), symbol: sym });
      }
      const list = found.get(p.slug) ?? [];
      if (!list.some((c) => c.qid === hits[0])) list.push({ qid: hits[0], name: part, rel: 'source', listings, source: true });
      found.set(p.slug, list.slice(0, 3));
    }
  }
  console.error(`source names: ${Math.min(i + 20, names.length)}/${names.length}`);
  await sleep(1000);
}

// 3. Keep one price symbol per company that the feed actually answers for (US listing first).
const companies = new Map();
for (const list of found.values()) for (const c of list) companies.set(c.qid, c);
const candidates = [...companies.values()].flatMap((c) => c.listings.map((l) => l.symbol));
const live = new Set();
for (let i = 0; i < candidates.length; i += 20) {
  const syms = [...new Set(candidates.slice(i, i + 20))];
  let body = null;
  for (let t = 0; t < 4 && !body; t++) {
    const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${syms.map(encodeURIComponent).join(',')}&range=1d&interval=1d`, { headers: { 'User-Agent': BROWSER } });
    if (r.ok) body = await r.json();
    else await sleep(4000 * (t + 1));
  }
  if (!body) throw new Error('Price feed kept failing');
  for (const s of body?.spark?.result ?? []) if (s.response?.[0]?.meta?.regularMarketPrice) live.add(s.symbol);
  await sleep(400);
}
for (const c of companies.values()) {
  const pick = [...c.listings].sort((a, b) => Number(!!b.symbol && !b.symbol.includes('.')) - Number(!!a.symbol && !a.symbol.includes('.'))).find((l) => live.has(l.symbol));
  c.symbol = pick?.symbol ?? null;
}

// SQL: match existing companies by Wikidata item first, then by name; never overwrite admin-set values.
const out = [];
for (const c of companies.values()) {
  out.push(
    `insert into public.companies (name, wikidata_id, ticker, quote_symbol, is_private) select ${q(c.name)}, ${q(c.qid)}, ${q(c.symbol)}, ${q(c.symbol)}, ${c.listings.length ? 'false' : 'true'} where not exists (select 1 from public.companies where wikidata_id = ${q(c.qid)}) on conflict do nothing;`,
    `update public.companies set wikidata_id = ${q(c.qid)} where name = ${q(c.name)} and wikidata_id is null;`,
  );
  if (c.symbol) out.push(`update public.companies set quote_symbol = ${q(c.symbol)} where wikidata_id = ${q(c.qid)} and quote_symbol is null and (ticker is null or ticker = ${q(c.symbol)}) and not exists (select 1 from public.companies where quote_symbol = ${q(c.symbol)});`);
}
for (const [slug, list] of found) {
  for (const c of list) {
    const label = c.rel === 'source' ? 'Forbes source of wealth, identified on Wikidata' : `Wikidata: ${c.rel === 'founder' ? 'founded by' : 'owned by'}`;
    out.push(
      `insert into public.person_companies (person_id, company_id, relation, source_label, source_url) select p.id, c.id, ${q(c.rel)}, ${q(label)}, ${q(`https://www.wikidata.org/wiki/${c.qid}`)} from public.people p, public.companies c where p.slug = ${q(slug)} and c.wikidata_id = ${q(c.qid)} on conflict do nothing;`,
    );
  }
}
writeFileSync(join(dir, 'companies.sql'), `-- generated by companies.mjs on ${new Date().toISOString().slice(0, 10)}\nbegin;\n${out.join('\n')}\ncommit;\n`);

const linked = [...found.keys()];
console.log(`\n${linked.length}/${people.length} people linked to ${companies.size} companies (${[...companies.values()].filter((c) => c.symbol).length} with a verified price symbol)`);
console.log('Not linked:', people.filter((p) => !found.has(p.slug)).map((p) => `${p.name} [${p.main_source}]`).join('; '));
for (const [slug, list] of found) console.log(`${slug}: ${list.map((c) => `${c.name} (${c.rel}${c.symbol ? `, ${c.symbol}` : ''})`).join(', ')}`);
