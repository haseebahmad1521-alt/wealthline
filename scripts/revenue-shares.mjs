// Shared by the experiment scripts: each company's share of recorded revenue earned in China and in Europe, from the
// latest fiscal year's lines (SEC filings in company_exposure first, else the annual-report lines in
// src/data/regions.json). A Greater China / PRC line counts as China; an EMEA line counts as Europe (Europe is most of
// EMEA for these companies), as does a line that covers only the World Bank's Europe & Central Asia region.
import { readFileSync } from 'node:fs';

const EUROPE = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE GB CH NO IS UA RS BA AL MK ME MD BY'.split(' '));
const isChina = (country, region) => country === 'CN' || /china|prc/i.test(region ?? '');
const isEurope = (country, region, covers) => EUROPE.has(country) || /europe|emea/i.test(region ?? '') || (covers?.length === 1 && covers[0] === 'ECS');

/** Map of company id → { china, europe } (fractions of revenue), for companies with revenue by place. */
export async function revenueShares(sb, companies) {
  const exposure = await sb('company_exposure?select=company_id,region,country,revenue_usd,fiscal_year');
  const shares = new Map();
  for (const c of companies) {
    const rows = exposure.filter((e) => e.company_id === c.id);
    if (!rows.length) continue;
    const year = Math.max(...rows.map((r) => r.fiscal_year ?? 0));
    const latest = rows.filter((r) => (r.fiscal_year ?? 0) === year);
    const total = latest.reduce((n, r) => n + Number(r.revenue_usd ?? 0), 0);
    const part = (test) => latest.filter((r) => test(r.country, r.region, null)).reduce((n, r) => n + Number(r.revenue_usd ?? 0), 0) / total;
    if (total > 0) shares.set(c.id, { china: part(isChina), europe: part(isEurope) });
  }
  const annualReports = JSON.parse(readFileSync('src/data/regions.json', 'utf8')).companies;
  for (const [id, r] of Object.entries(annualReports)) {
    if (shares.has(id)) continue;
    const total = r.lines.reduce((n, l) => n + l.revenue_usd, 0);
    // A line merely adding CN to a wider region is not China.
    const china = r.lines.filter((l) => l.country === 'CN' || (l.add?.includes('CN') && /china|prc/i.test(l.region))).reduce((n, l) => n + l.revenue_usd, 0);
    const europe = r.lines.filter((l) => isEurope(l.country, l.region, l.covers)).reduce((n, l) => n + l.revenue_usd, 0);
    if (total > 0) shares.set(id, { china: china / total, europe: europe / total });
  }
  return shares;
}
