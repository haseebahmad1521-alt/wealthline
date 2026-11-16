// World simulations: a scenario's changes (supabase/functions/_shared/scenario.ts) applied month by month to recorded
// values. Every dollar here is a recorded value times a stated assumption; nothing is sampled or invented.
//
// How a change reaches money:
//  - place: revenue a company reports for that country moves by the change. A regional line ("EMEA", "Asia
//    Pacific") is split between the countries in it by recorded GDP (World Bank), leaving out countries the company
//    reports on their own line; only the country's share moves.
//  - company / sector / market: the share price moves by the change.
//  - a company's share price also follows its revenue: losing a tenth of revenue takes a tenth off the price (the
//    same assumption the place mode of What if states).
//  - a person's fortune moves only through recorded stakes (shares × price). Everyone else touched is shown with
//    their company's percentage move, never a dollar figure.
//  - transfer: the shares change hands at month `to` at that month's price plus the premium, paid in cash.
import { ramp, type Scenario, type Shock } from '../../supabase/functions/_shared/scenario.ts';

export type SimCompany = { id: string; name: string; sector?: string | null; listed: boolean; regions: { region: string; country: string | null; revenue_usd: number }[] };
export type SimPerson = { id: string; slug: string; name: string; net_worth_usd: number | null; portrait_url?: string | null };
export type SimEmpire = { person: SimPerson; companies: SimCompany[]; stakes: { company: { id: string }; value: number | null }[] };
export type SimCountry = { iso2: string; gdp_usd: number | null; region?: string | null };

// World Bank regions (countries.region) that a reported region name covers.
const ALL = ['EAS', 'ECS', 'LCN', 'MEA', 'NAC', 'SAS', 'SSF'];
const BUCKETS: [RegExp, string[]][] = [
  [/emea|europe,? middle east/i, ['ECS', 'MEA', 'SSF']],
  [/europe/i, ['ECS']],
  [/asia|pacific|australasia/i, ['EAS', 'SAS']],
  [/north america|us & canada|united states and canada/i, ['NAC']],
  [/south america|latin america/i, ['LCN']],
  [/americas/i, ['NAC', 'LCN']],
  [/rest ?of world|other countries|outside the united states|non us|international/i, ALL],
];
// Countries a region name leaves out by name ("Excluding United States", "Non US And Non UK").
const NAMED: [RegExp, string][] = [
  [/united states|\bus\b/i, 'US'],
  [/united kingdom|\buk\b/i, 'GB'],
  [/france/i, 'FR'],
  [/canada/i, 'CA'],
  [/china/i, 'CN'],
  [/japan/i, 'JP'],
];

/** Countries a reported revenue line covers: its own country, or the countries of a named region. */
export function lineCountries(line: { region: string; country: string | null }, own: Set<string>, countries: SimCountry[]): string[] {
  if (line.country) return [line.country];
  const regions = BUCKETS.find(([re]) => re.test(line.region))?.[1];
  if (!regions) return [];
  const out = new Set(own); // countries the company reports separately
  const excl = line.region.match(/(excluding|outside|non)\b.*/i)?.[0] ?? '';
  for (const [re, iso] of NAMED) if (re.test(excl)) out.add(iso);
  return countries.filter((c) => c.region && regions.includes(c.region) && !out.has(c.iso2)).map((c) => c.iso2);
}

export type CompanyMove = { company: SimCompany; revenueBase: number; revenueDelta: number; price: number /* fractional change */ };
export type PersonMove = {
  person: SimPerson;
  /** Dollar change from recorded stakes; null when the person has none in the companies that move. */
  delta: number | null;
  /** Their most-moved company's share-price change, for people without a recorded stake. */
  pct: number | null;
  via: string;
};
export type Frame = {
  month: number;
  fills: { iso2: string; pct: number }[];
  companies: CompanyMove[];
  people: PersonMove[];
  /** Ranks among people with a recorded net worth: before, and with the recorded-stake changes added. */
  ranks: { person: SimPerson; before: number; after: number; worth: number }[];
  transfers: { seller: SimPerson; buyer: SimPerson; company: SimCompany; paid: number; buyerShort: boolean; done: boolean }[];
};

export function simulate(scenario: Scenario, empires: SimEmpire[], countries: SimCountry[], month: number): Frame {
  const gdp = new Map(countries.map((c) => [c.iso2, c.gdp_usd ?? 0]));
  const companies = new Map<string, SimCompany>();
  for (const e of empires) for (const c of e.companies) companies.set(c.id, c);
  const bySlug = new Map(empires.map((e) => [e.person.slug, e]));
  const at = (s: Shock) => s.pct * ramp(s, month);

  // Revenue: each place shock moves the country's share of every line that covers it.
  const places = scenario.shocks.filter((s): s is Extract<Shock, { kind: 'place' }> => s.kind === 'place');
  const moves = new Map<string, CompanyMove>();
  for (const c of companies.values()) {
    const own = new Set(c.regions.map((r) => r.country).filter((x): x is string => !!x));
    let base = 0;
    let delta = 0;
    for (const line of c.regions) {
      base += line.revenue_usd;
      if (!places.length) continue;
      const covers = lineCountries(line, own, countries);
      const total = covers.reduce((n, iso) => n + (gdp.get(iso) ?? 0), 0);
      if (!total) continue;
      for (const s of places) if (covers.includes(s.target)) delta += line.revenue_usd * ((gdp.get(s.target) ?? 0) / total) * at(s);
    }
    let price = 1 + (base ? delta / base : 0);
    for (const s of scenario.shocks) {
      if ((s.kind === 'company' && s.target === c.id) || (s.kind === 'sector' && c.sector === s.target) || (s.kind === 'market' && c.listed)) price *= 1 + at(s);
    }
    moves.set(c.id, { company: c, revenueBase: base, revenueDelta: delta, price: price - 1 });
  }
  const move = (id: string) => moves.get(id)?.price ?? 0;

  // Fortunes: recorded stakes only, with any transfers. A sale is priced at its own month (without itself).
  const sales = scenario.shocks.filter((s): s is Extract<Shock, { kind: 'transfer' }> => s.kind === 'transfer');
  const salePrice = new Map<Shock, number>();
  if (sales.length) {
    const rest = { ...scenario, shocks: scenario.shocks.filter((s) => s.kind !== 'transfer') };
    for (const s of sales) salePrice.set(s, 1 + (simulate(rest, empires, countries, s.to).companies.find((x) => x.company.id === s.target)?.price ?? 0));
  }
  const transfers: Frame['transfers'] = [];
  const deltas = new Map<string, number>();
  const add = (slug: string, v: number) => deltas.set(slug, (deltas.get(slug) ?? 0) + v);
  for (const e of empires) {
    for (const st of e.stakes) {
      if (!st.value) continue;
      const sold = sales.find((s) => s.person === e.person.slug && s.target === st.company.id);
      const now = st.value * move(st.company.id); // change in the stake's value by this month
      if (!sold || month < sold.to) {
        add(e.person.slug, now);
        continue;
      }
      // After the sale: the seller keeps the rest of the stake and the cash; the buyer owns the shares from then on.
      const paid = st.value * sold.fraction * salePrice.get(sold)! * (1 + sold.pct);
      add(e.person.slug, st.value * (1 - sold.fraction) * move(st.company.id) + paid - st.value * sold.fraction);
      add(sold.buyer, st.value * sold.fraction * (1 + move(st.company.id)) - paid);
    }
  }
  for (const s of sales) {
    const seller = bySlug.get(s.person);
    const buyer = bySlug.get(s.buyer);
    const company = companies.get(s.target);
    const stake = seller?.stakes.find((x) => x.company.id === s.target)?.value;
    if (!seller || !buyer || !company || !stake) continue;
    const paid = stake * s.fraction * salePrice.get(s)! * (1 + s.pct);
    transfers.push({ seller: seller.person, buyer: buyer.person, company, paid, buyerShort: paid > (buyer.person.net_worth_usd ?? 0), done: month >= s.to });
  }

  const people: PersonMove[] = [];
  for (const e of empires) {
    const d = deltas.get(e.person.slug);
    const touched = e.companies.map((c) => ({ c, p: move(c.id) })).filter((x) => Math.abs(x.p) > 1e-6).sort((a, b) => Math.abs(b.p) - Math.abs(a.p));
    const party = transfers.find((t) => t.seller.id === e.person.id || t.buyer.id === e.person.id);
    if (d != null && Math.abs(d) > 0.5) people.push({ person: e.person, delta: d, pct: null, via: party ? party.company.name : (touched[0]?.c.name ?? '') });
    else if (touched.length) people.push({ person: e.person, delta: null, pct: touched[0].p, via: touched[0].c.name });
  }
  people.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) || Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0));

  const worthy = empires.filter((e) => e.person.net_worth_usd);
  const before = [...worthy].sort((a, b) => b.person.net_worth_usd! - a.person.net_worth_usd!);
  const after = [...worthy].sort((a, b) => b.person.net_worth_usd! + (deltas.get(b.person.slug) ?? 0) - (a.person.net_worth_usd! + (deltas.get(a.person.slug) ?? 0)));
  const ranks = after.map((e, i) => ({ person: e.person, before: before.indexOf(e) + 1, after: i + 1, worth: e.person.net_worth_usd! + (deltas.get(e.person.slug) ?? 0) }));

  return {
    month,
    fills: places.map((s) => ({ iso2: s.target, pct: at(s) })).filter((f) => Math.abs(f.pct) > 1e-6),
    companies: [...moves.values()].filter((m) => Math.abs(m.price) > 1e-6 || Math.abs(m.revenueDelta) > 0.5).sort((a, b) => Math.abs(b.price) - Math.abs(a.price)),
    people,
    ranks,
    transfers,
  };
}

/** A simulated percentage for labels: one decimal under 10%, whole numbers above (rounded first, so 9.99… reads 10%). */
export function simPct(v: number): string {
  const x = Math.round(Math.abs(v) * 1000) / 10;
  return `${x < 10 ? x.toFixed(1) : Math.round(x)}%`;
}

export type SimEvent = { month: number; text: string; tone: 'gain' | 'loss' | 'info' };

/** The film runs in ticks, a few per month; notifications queue so each gets its own moment on screen. */
export const TICKS_PER_MONTH = 3;
export const NOTE_GAP = 2; // ticks between two notifications
export const NOTE_LIFE = 6; // ticks a notification stays up

/** Each event's tick (in month order, never closer than NOTE_GAP to the one before) and the film's length in ticks. */
export function schedule(events: SimEvent[], months: number): { notes: (SimEvent & { tick: number })[]; length: number } {
  let last = -NOTE_GAP;
  const notes = events.map((e) => {
    last = Math.max(e.month * TICKS_PER_MONTH, last + NOTE_GAP);
    return { ...e, tick: last };
  });
  return { notes, length: Math.max(months * TICKS_PER_MONTH, last + NOTE_LIFE - 1) };
}

const SECTOR_NAME: Record<string, string> = {
  energy: 'Energy', materials: 'Materials', industrials: 'Industrial', autos: 'Carmaker', consumer: 'Consumer', health: 'Healthcare',
  finance: 'Bank and finance', technology: 'Tech', media: 'Media', real_estate: 'Property', transport: 'Transport',
};
const region = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const countryName = (iso: string) => region?.of(iso) ?? iso;
const first = (name: string) => name.replace(/ & family$/, '');
// Size words for a change, so a notification reads as an event; the numbers stay in the labels on the globe.
const size = (p: number) => (Math.abs(p) >= 0.5 ? (p < 0 ? 'collapses' : 'booms') : Math.abs(p) >= 0.2 ? (p < 0 ? 'falls sharply' : 'jumps') : p < 0 ? 'slips' : 'rises');
const moveWord = (p: number) => (Math.abs(p) >= 0.2 ? (p < 0 ? 'tumble' : 'soar') : p < 0 ? 'fall' : 'rise');

/**
 * The notifications a scenario plays as it runs: each change as it starts, a sale when it happens, the biggest
 * overtake each month in the top ten, and a closing line. `frames[m]` is `simulate(…, m)`.
 */
export function simEvents(scenario: Scenario, frames: Frame[], companyName: (id: string) => string, personName: (slug: string) => string): SimEvent[] {
  const out: SimEvent[] = [{ month: 0, text: scenario.title.replace(/\.$/, ''), tone: 'info' }];
  for (const s of scenario.shocks) {
    const tone = s.pct < 0 ? 'loss' : 'gain';
    const at = s.kind === 'transfer' ? s.to : s.from;
    if (s.kind === 'place') out.push({ month: at, text: `Business in ${countryName(s.target)} ${size(s.pct)}`, tone });
    if (s.kind === 'sector') out.push({ month: at, text: `${SECTOR_NAME[s.target] ?? s.target} shares ${moveWord(s.pct)}`, tone });
    if (s.kind === 'market') out.push({ month: at, text: `Markets ${s.pct < 0 ? 'sell off' : 'rally'}`, tone });
    if (s.kind === 'company') out.push({ month: at, text: `${companyName(s.target)} shares ${moveWord(s.pct)}`, tone });
    if (s.kind === 'transfer') out.push({ month: at, text: `${first(personName(s.buyer))} buys ${first(personName(s.person))}’s ${companyName(s.target)} stake`, tone: 'info' });
  }
  // Overtakes: the biggest jump into or within the top ten, once per month.
  for (let m = 1; m < frames.length; m++) {
    const before = new Map(frames[m - 1].ranks.map((r) => [r.person.id, r.after]));
    const jump = frames[m].ranks
      .filter((r) => r.after <= 10 && (before.get(r.person.id) ?? 99) > r.after)
      .sort((a, b) => (before.get(b.person.id)! - b.after) - (before.get(a.person.id)! - a.after))[0];
    if (!jump) continue;
    const passed = frames[m].ranks.find((r) => r.after === jump.after + 1);
    out.push({ month: m, text: passed ? `${first(jump.person.name)} passes ${first(passed.person.name)} for #${jump.after}` : `${first(jump.person.name)} climbs to #${jump.after}`, tone: 'gain' });
  }
  const last = frames[frames.length - 1];
  if (last && frames.length > 1) {
    const top = last.people.find((p) => p.delta != null && p.delta > 0) ?? last.people.find((p) => (p.pct ?? 0) > 0);
    const low = last.people.find((p) => (p.delta ?? p.pct ?? 0) < 0); // people come sorted biggest move first
    const parts = [top && `${first(top.person.name)} up most`, low && `${first(low.person.name)} hit hardest`].filter(Boolean);
    out.push({ month: frames.length - 1, text: `${scenario.months} months on${parts.length ? `: ${parts.join(', ')}` : ''}`, tone: 'info' });
  }
  return out.sort((a, b) => a.month - b.month);
}
