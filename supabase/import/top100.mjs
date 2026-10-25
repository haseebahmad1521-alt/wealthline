// Generates top100.sql from Forbes + Wikimedia Commons. Run: node supabase/import/top100.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const forbes = JSON.parse(readFileSync(join(dir, 'forbes-top100.json'), 'utf8'));
const socials = Object.fromEntries(JSON.parse(readFileSync(join(dir, 'social-accounts.json'), 'utf8')).map((s) => [s.uri, s]));
const WIKI_UA = 'WealthlineImport/1.0 (haseebahmad1521-alt.github.io/wealthline)';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, ua) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json' } });
      if (ua === WIKI_UA) await sleep(250);
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      console.error(`HTTP ${r.status} ${url}`);
      await sleep(Number(r.headers.get('retry-after') || 0) * 1000);
    } catch (e) { console.error(`fetch error ${url}: ${e.message}`); }
    await sleep(2000 * (i + 1));
  }
  throw new Error('giving up on ' + url);
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const BUSINESS = /business|investor|entrepreneur|executive|heir|billionaire|founder|magnate|industrialist|chairman|chairwoman|CEO|financier|philanthropist|tycoon|programmer|engineer|computer scientist|manager|banker|trader|developer|mogul/i;
const FREE = /^(CC[ -]?(BY|0)|Public domain|PD[ -]|PD$|No restrictions|Attribution)/i;

function titleMatch(title, name) {
  const t = norm(title), n = norm(name);
  if (t === n) return 'exact';
  const tt = t.split(' '), nt = n.split(' ');
  // shortcut: same first and last token (middle names/initials differ) counts as unsure-match
  if (tt[0] === nt[0] && tt.at(-1) === nt.at(-1)) return 'fuzzy';
  return null;
}

// Forbes name -> Wikipedia title for well-known name variants; still verified against the page description.
const ALIAS = {
  'Carlos Slim Helu & family': 'Carlos Slim', 'Ma Huateng': 'Pony Ma', 'Stanley Kroenke': 'Stan Kroenke',
  'Reinhold Wuerth & family': 'Reinhold Würth', 'Suleiman Kerimov & family': 'Suleyman Kerimov',
  'Alexey Mordashov & family': 'Alexei Mordashov', 'Andreas von Bechtolsheim & family': 'Andy Bechtolsheim',
  'Jay Y. Lee': 'Lee Jae-yong',
};
async function findPortrait(name, notes) {
  const clean = name.replace(/\s*&\s*family/i, '').trim();
  const s = ALIAS[name]
    ? { query: { search: [{ title: ALIAS[name] }] } }
    : await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(clean)}&format=json&srlimit=3`, WIKI_UA);
  for (const hit of s?.query?.search ?? []) {
    const sum = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`, WIKI_UA);
    if (!sum) continue;
    const m = ALIAS[name] ? 'alias' : titleMatch(sum.title ?? hit.title, clean);
    const desc = `${sum.description ?? ''} ${(sum.extract ?? '').slice(0, 200)}`;
    if (!m || !BUSINESS.test(sum.description ?? '') && !BUSINESS.test(desc)) {
      notes.push(`rejected "${hit.title}" (${sum.description ?? 'no description'}) for ${name}`);
      continue;
    }
    if (m === 'fuzzy') notes.push(`UNSURE (fuzzy title) "${sum.title}" accepted for ${name}`);
    const pi = await getJson(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=name&titles=${encodeURIComponent(sum.title)}&format=json`, WIKI_UA);
    const file = Object.values(pi?.query?.pages ?? {})[0]?.pageimage;
    if (!file) { notes.push(`no page image for ${name} ("${sum.title}")`); return null; }
    const ci = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent('File:' + file)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=600&format=json`, WIKI_UA);
    const info = Object.values(ci?.query?.pages ?? {})[0]?.imageinfo?.[0];
    if (!info) { notes.push(`image not on Commons for ${name}: ${file}`); return null; }
    const md = info.extmetadata ?? {};
    const lic = md.LicenseShortName?.value;
    if (!lic || !FREE.test(lic) || /-(NC|ND)\b|\bNC\b/i.test(lic)) { notes.push(`non-free/unknown licence "${lic}" for ${name}: ${file}`); return null; }
    const author = (md.Artist?.value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
    return { url: info.thumburl, page: info.descriptionurl, author, license: lic, licenseUrl: md.LicenseUrl?.value ?? null };
  }
  return null;
}

const q = (v) => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const used = new Set();
const out = [];
const noPortrait = [];
const notes = [];
let portraits = 0;

for (const p of forbes) {
  let slug = p.uri.replace(/-\d+$/, '');
  if (used.has(slug)) slug = p.uri;
  used.add(slug);
  if (!SLUG.test(slug)) throw new Error('bad slug ' + slug);

  const fp = (await getJson(`https://www.forbes.com/forbesapi/person/${p.uri}.json`, BROWSER_UA))?.person ?? {};
  await sleep(300);
  const place = fp.city && (fp.stateProvince || fp.countryOfResidence);
  const residence = place ? `${fp.city}, ${fp.stateProvince || fp.countryOfResidence}` : null;
  let age = null;
  if (fp.birthDate) {
    const b = new Date(fp.birthDate), n = new Date();
    age = n.getFullYear() - b.getUTCFullYear() - (n < new Date(n.getFullYear(), b.getUTCMonth(), b.getUTCDate()) ? 1 : 0);
  }
  const sa = socials[p.uri];
  const social = sa?.platform && sa?.url ? `${q(JSON.stringify({ platform: sa.platform, handle: sa.handle, url: sa.url }))}::jsonb` : 'null';

  const pt = await findPortrait(p.personName, notes);
  await sleep(100);
  if (pt) portraits++; else noPortrait.push(p.personName);

  out.push(
    `insert into public.people (slug, name, age, residence, citizenship, main_source, forbes_uri, forbes_rank, social, portrait_url, portrait_page_url, portrait_author, portrait_license, portrait_license_url) values (${[
      q(slug), q(p.personName), age ?? 'null', q(residence), q(p.countryOfCitizenship), q(p.source), q(p.uri), p.rank, social,
      q(pt?.url), q(pt?.page), q(pt?.author), q(pt?.license), q(pt?.licenseUrl),
    ].join(', ')}) on conflict (slug) do update set forbes_uri = excluded.forbes_uri, forbes_rank = excluded.forbes_rank, social = coalesce(excluded.social, people.social), portrait_url = coalesce(people.portrait_url, excluded.portrait_url), portrait_page_url = coalesce(people.portrait_page_url, excluded.portrait_page_url), portrait_author = coalesce(people.portrait_author, excluded.portrait_author), portrait_license = coalesce(people.portrait_license, excluded.portrait_license), portrait_license_url = coalesce(people.portrait_license_url, excluded.portrait_license_url), age = coalesce(people.age, excluded.age), residence = coalesce(people.residence, excluded.residence), citizenship = coalesce(people.citizenship, excluded.citizenship), main_source = coalesce(people.main_source, excluded.main_source);`,
  );
  console.error(`${p.rank} ${p.personName}: ${pt ? 'portrait' : 'none'}`);
}

writeFileSync(join(dir, 'top100.sql'), `-- generated by top100.mjs on ${new Date().toISOString().slice(0, 10)}\nbegin;\n${out.join('\n')}\ncommit;\n`);
console.log(`\n${forbes.length} people, ${portraits} with portraits`);
console.log('No portrait:', noPortrait.join('; '));
console.log('Notes:\n' + notes.join('\n'));
