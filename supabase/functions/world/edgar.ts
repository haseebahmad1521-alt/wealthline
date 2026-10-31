// SEC EDGAR collector: revenue by country/region (inline XBRL of the latest 10-K) and subsidiaries (Exhibit 21).
// SEC's fair-access rule requires a contact in the User-Agent: SEC_CONTACT (server secret) and at most 10 requests
// a second. Only lines the company reports are stored, with a link to the filing.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { track } from '../_shared/refresh.ts';

const BATCH = 2; // 10-K documents are 2–10 MB; two per run keeps well inside the function time limit
const REVENUE = new Set(['us-gaap:Revenues', 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax']);

function headers() {
  const contact = Deno.env.get('SEC_CONTACT');
  if (!contact) throw new Error('SEC_CONTACT is not set.');
  return { 'User-Agent': `Wealthline ${contact}` };
}

let last = 0;
async function sec(url: string): Promise<Response> {
  const wait = last + 150 - Date.now(); // stay far below SEC's 10 requests per second
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res;
}

type Ctx = { members: [string, string][]; start: string | null; end: string | null };

function contexts(doc: string): Map<string, Ctx> {
  const out = new Map<string, Ctx>();
  for (const [, id, body] of doc.matchAll(/<xbrli:context id="([^"]+)">([\s\S]*?)<\/xbrli:context>/g)) {
    out.set(id, {
      members: [...body.matchAll(/<xbrldi:explicitMember dimension="([^"]+)">([^<]+)<\/xbrldi:explicitMember>/g)].map((m) => [m[1], m[2].trim()]),
      start: body.match(/<xbrli:startDate>([^<]+)/)?.[1] ?? null,
      end: body.match(/<xbrli:endDate>([^<]+)/)?.[1] ?? null,
    });
  }
  return out;
}

function revenueFacts(doc: string) {
  return [...doc.matchAll(/<ix:nonFraction([^>]*)>([^<]*)<\/ix:nonFraction>/g)].flatMap(([, attrs, text]) => {
    const name = attrs.match(/name="([^"]+)"/)?.[1];
    const ctx = attrs.match(/contextRef="([^"]+)"/)?.[1];
    if (!name || !ctx || !REVENUE.has(name)) return [];
    const digits = text.replace(/[,\s$]/g, '');
    const value = /^[\d.]+$/.test(digits) ? Number(digits) * 10 ** Number(attrs.match(/scale="(-?\d+)"/)?.[1] ?? 0) : 0;
    return [{ name, ctx, value }];
  });
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const NAMED: [RegExp, string, string | null][] = [
  [/^NonUs$/, 'Outside the United States', null],
  [/^(OtherCountries|Other|AllOtherCountries)$/, 'Other countries', null],
  [/^RestOfWorld$/, 'Rest of world', null],
  [/^USCanada$/, 'US & Canada', null],
  [/^(GreaterChina|ChinaIncludingHongKong|ChinaMainlandAndHongKong|China)$/, 'Greater China', 'CN'],
  [/^Taiwan$/, 'Taiwan', 'TW'],
  [/^Japan$/, 'Japan', 'JP'],
  [/^Germany$/, 'Germany', 'DE'],
  [/^UnitedKingdom$/, 'United Kingdom', 'GB'],
  [/^India$/, 'India', 'IN'],
  [/^Ireland$/, 'Ireland', 'IE'],
  [/^Singapore$/, 'Singapore', 'SG'],
  [/^Canada$/, 'Canada', 'CA'],
  [/^(Korea|SouthKorea|KoreaRepublicOf)$/, 'South Korea', 'KR'],
];

/** "country:US" → United States/US; "srt:EuropeMember" → Europe; "goog:AmericasExcludingUnitedStatesMember" → words. */
function describe(member: string): { region: string; country: string | null } {
  const [prefix, local] = member.split(':');
  if (prefix === 'country' && /^[A-Z]{2}$/.test(local)) return { region: regionNames.of(local) ?? local, country: local };
  const core = local.replace(/Member$/, '');
  for (const [re, region, country] of NAMED) if (re.test(core)) return { region, country };
  return { region: core.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'), country: null };
}

type Line = { member: string; value: number };

/**
 * The reported lines that add up to total revenue, preferring the most individual countries, then fewest lines.
 * A real breakdown adds up almost exactly; the tight tolerance rejects overlapping lines (US inside "US & Canada")
 * that only add up by coincidence.
 */
function partition(lines: Line[], total: number, tolerance: number): Line[] | null {
  const n = Math.min(lines.length, 16);
  let best: { pick: Line[]; score: number } | null = null;
  for (let mask = 1; mask < 1 << n; mask++) {
    const pick = lines.filter((_, i) => mask & (1 << i));
    const sum = pick.reduce((s, l) => s + l.value, 0);
    if (Math.abs(sum - total) > total * tolerance) continue;
    const countries = pick.filter((l) => describe(l.member).country).length;
    const score = countries * 100 - pick.length;
    if (!best || score > best.score) best = { pick, score };
  }
  return best?.pick ?? null;
}

/** Geographic revenue lines for the fiscal year ending reportDate, or [] when the 10-K doesn't tag any. */
export function geography(doc: string, reportDate: string) {
  const ctx = contexts(doc);
  const facts = revenueFacts(doc);
  const yearLong = (c: Ctx) => c.start && c.end === reportDate && Date.parse(c.end) - Date.parse(c.start) > 300 * 86_400_000;
  let chosen: { lines: Line[]; start: string } | null = null;
  const yearFacts = facts.filter((f) => ctx.get(f.ctx) && yearLong(ctx.get(f.ctx)!));
  const totalOf = (fs: typeof facts) => Math.max(0, ...fs.filter((f) => ctx.get(f.ctx)!.members.length === 0).map((f) => f.value));
  for (const concept of REVENUE) {
    const mine = yearFacts.filter((f) => f.name === concept);
    if (!mine.length) continue;
    // Same-concept total when tagged (exact match); otherwise the other revenue concept's total, which may differ
    // slightly (e.g. hedging gains), so it gets 1%.
    const same = totalOf(mine);
    const [total, tolerance] = same ? [same, 0.001] : [totalOf(yearFacts), 0.01];
    if (!total) continue;
    const byMember = new Map<string, number>();
    for (const f of mine) {
      const m = ctx.get(f.ctx)!.members;
      if (m.length === 1 && /Geograph/i.test(m[0][0])) byMember.set(m[0][1], f.value);
    }
    const lines = partition([...byMember].map(([member, value]) => ({ member, value })), total, tolerance);
    if (!lines) continue;
    const countries = lines.filter((l) => describe(l.member).country).length;
    const prev = chosen ? chosen.lines.filter((l) => describe(l.member).country).length : -1;
    if (countries > prev) chosen = { lines, start: ctx.get(mine[0].ctx)!.start! };
  }
  if (!chosen) return [];
  const lines = chosen.lines.map((l) => ({ ...describe(l.member), revenue_usd: Math.round(l.value), period_start: chosen!.start }));
  // Next to other named countries, "outside the United States" is what remains after them.
  const otherCountries = lines.some((l) => l.country && l.country !== 'US');
  return lines.map((l) => (otherCountries && l.region === 'Outside the United States' ? { ...l, region: 'Rest of world' } : l));
}

const clean = (s: string) =>
  s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Exhibit 21 subsidiaries. Tables: first text cell = subsidiary, last text cell = jurisdiction (percent-owned
 * columns skipped). Lists without a table use "Name (Jurisdiction)" lines.
 */
export function subsidiaryRows(doc: string) {
  const rows: { name: string; jurisdiction: string }[] = [];
  const keep = (name: string, jurisdiction: string) => {
    if (/^((company|legal|subsidiary) )?name\b|^subsidiar/i.test(name)) return; // header row
    if (/jurisdiction|domicile|incorporat|percent|where|organiz/i.test(jurisdiction)) return;
    if (name.length > 200 || jurisdiction.length > 80) return;
    rows.push({ name, jurisdiction });
  };
  for (const [, tr] of doc.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1])).filter((c) => c && !/^[\d.,%\s]+$/.test(c));
    if (cells.length >= 2) keep(cells[0], cells[cells.length - 1]);
  }
  if (!rows.length) {
    for (const block of doc.split(/<\/(?:div|p)>|<br\s*\/?>/i)) {
      const m = clean(block).match(/^(.{2,200}?)\s*\(([^()]{2,80})\)$/);
      if (m) keep(m[1], m[2]);
    }
  }
  return rows;
}

export async function edgar(db: SupabaseClient) {
  const { data: companies, error } = await db.from('companies').select('id, name, ticker, cik, edgar_10k').not('ticker', 'is', null);
  if (error) throw new Error(error.message);

  // CIKs from SEC's ticker list (class shares use a dash there: BRK.B → BRK-B).
  if (companies!.some((c) => !c.cik)) {
    const list = Object.values(await (await sec('https://www.sec.gov/files/company_tickers.json')).json()) as { ticker: string; cik_str: number }[];
    const byTicker = new Map(list.map((x) => [x.ticker, String(x.cik_str)]));
    for (const c of companies!) {
      const cik = !c.cik && byTicker.get(String(c.ticker).replace('.', '-'));
      if (cik) {
        await db.from('companies').update({ cik }).eq('id', c.id);
        c.cik = cik;
      }
    }
  }

  const done: string[] = [];
  for (const c of companies!.filter((x) => x.cik)) {
    if (done.length >= BATCH) break;
    const sub = await (await sec(`https://data.sec.gov/submissions/CIK${String(c.cik).padStart(10, '0')}.json`)).json();
    const r = sub.filings.recent;
    const i = (r.form as string[]).findIndex((f) => f === '10-K');
    if (i < 0 || r.accessionNumber[i] === c.edgar_10k) continue;
    const acc = String(r.accessionNumber[i]);
    const base = `https://www.sec.gov/Archives/edgar/data/${c.cik}/${acc.replace(/-/g, '')}`;
    const docUrl = `${base}/${r.primaryDocument[i]}`;
    const fiscalYear = Number(String(r.reportDate[i]).slice(0, 4));
    const label = `SEC Form 10-K, fiscal ${fiscalYear}`;

    const lines = geography(await (await sec(docUrl)).text(), r.reportDate[i]);
    if (lines.length) {
      await db.from('company_regions').delete().eq('company_id', c.id).eq('fiscal_year', fiscalYear);
      const { error: e } = await db.from('company_regions').insert(
        lines.map((l) => ({ company_id: c.id, fiscal_year: fiscalYear, period_end: r.reportDate[i], source_label: label, source_url: docUrl, ...l })),
      );
      if (e) throw new Error(e.message);
    }

    const index = await (await sec(`${base}/index.json`)).json();
    const ex21 = (index.directory.item as { name: string }[]).find((x) => /(?:ex|exhibit)[-_]?21/i.test(x.name) && /\.html?$/i.test(x.name));
    if (ex21) {
      const subs = subsidiaryRows(await (await sec(`${base}/${ex21.name}`)).text());
      const unique = [...new Map(subs.map((s) => [`${s.name}|${s.jurisdiction}`, s])).values()];
      if (unique.length) {
        await db.from('subsidiaries').delete().eq('company_id', c.id);
        const { error: e } = await db.from('subsidiaries').insert(
          unique.map((s) => ({ company_id: c.id, ...s, fiscal_year: fiscalYear, source_label: `${label}, Exhibit 21`, source_url: `${base}/${ex21.name}` })),
        );
        if (e) throw new Error(e.message);
      }
    }
    await db.from('companies').update({ edgar_10k: acc, updated_at: new Date().toISOString() }).eq('id', c.id);
    done.push(`${c.name}: ${lines.length} revenue lines${ex21 ? '' : ', no Exhibit 21'}`);
  }
  return done;
}

export const runEdgar = (db: SupabaseClient) => track(db, 'SEC EDGAR', () => edgar(db));
