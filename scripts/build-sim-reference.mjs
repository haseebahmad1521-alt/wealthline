// Builds src/data/sim-reference.json: each country's World Bank region and each tracked company's sector (its
// Wikidata industries, mapped by `sectorFor`, the same rule the `world` facts job uses). The World simulations use it
// until the backend has its own copy (migration 20261116000000_world_scenarios.sql), and for companies the backend
// hasn't classified. Run: node scripts/build-sim-reference.mjs (reads the public Supabase config from .env.local).
import { readFileSync, writeFileSync } from 'node:fs';

import { sectorFor } from '../supabase/functions/_shared/scenario.ts';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const UA = { 'User-Agent': 'WealthlineBot/1.0 (+https://haseebahmad1521-alt.github.io/wealthline/)' };

const wb = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=400', { headers: UA }).then((r) => r.json());
const regions = {};
for (const c of wb[1]) if (c.region?.id !== 'NA' && /^[A-Z]{2}$/.test(c.iso2Code)) regions[c.iso2Code] = c.region.id;

const companies = await fetch(`${url}/rest/v1/companies?select=id,name,wikidata_id`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then((r) => r.json());
const byQ = new Map(companies.filter((c) => c.wikidata_id).map((c) => [c.wikidata_id, c]));
const query = `SELECT ?co ?indLabel WHERE { VALUES ?co { ${[...byQ.keys()].map((q) => `wd:${q}`).join(' ')} } ?co wdt:P452 ?ind .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { ...UA, Accept: 'application/sparql-results+json' } }).then((r) => r.json());
const labels = new Map();
for (const b of res.results.bindings) {
  const c = byQ.get(b.co.value.split('/').pop());
  const l = b.indLabel?.value;
  if (c && l && !/^Q\d+$/.test(l)) labels.set(c.id, [...(labels.get(c.id) ?? []), l]);
}
const sectors = {};
const unmapped = [];
for (const c of companies) {
  const hit = sectorFor(labels.get(c.id) ?? []);
  if (hit) sectors[c.id] = { sector: hit.sector, source: `Wikidata industry: ${hit.label}` };
  else unmapped.push(`${c.name} (${(labels.get(c.id) ?? []).join(', ') || 'no industry'})`);
}

writeFileSync(
  'src/data/sim-reference.json',
  `${JSON.stringify({ built: new Date().toISOString().slice(0, 10), sources: ['World Bank country API (region)', 'Wikidata P452 (industry)'], regions, sectors }, null, 1)}\n`,
);
console.log(`regions ${Object.keys(regions).length}, sectors ${Object.keys(sectors).length} of ${companies.length}`);
console.log(`unmapped: ${unmapped.join('; ')}`);
