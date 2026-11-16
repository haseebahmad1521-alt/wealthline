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

/**
 * Measured sensitivities (factors.ts) and their standard errors, by factor, and `sd`: the weekly moves the factors
 * don't explain (the company's own news). Backtests showed ranges need that noise to cover real outcomes.
 */
export type SimFit = { beta: Record<string, number>; se: Record<string, number>; sd?: number };
export type SimCompany = {
  id: string;
  name: string;
  sector?: string | null;
  listed: boolean;
  regions: { region: string; country: string | null; revenue_usd: number }[];
  /** Its own measured sensitivities; without them it borrows its listed sector peers' average (and their spread). */
  fit?: SimFit | null;
};
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

export type CompanyMove = {
  company: SimCompany;
  revenueBase: number;
  revenueDelta: number;
  price: number /* fractional change */;
  /** An 80% range for the price change, from the sensitivities' standard errors (and ±half for revenue effects). */
  lo: number;
  hi: number;
  /** Whose sensitivities were used: its own, its sector peers', or none measured. */
  basis: 'measured' | 'peers' | 'rule';
};
export type PersonMove = {
  person: SimPerson;
  /** Dollar change from recorded stakes; null when the person has none in the companies that move. */
  delta: number | null;
  /** Their most-moved company's share-price change, for people without a recorded stake. */
  pct: number | null;
  /** An 80% range for `delta` (or for `pct` when there's no recorded stake). */
  range?: [number, number] | null;
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

  // Sensitivities: a company's own, else its listed sector peers' average with their spread as the uncertainty, else
  // the plain rule (moves one-for-one with the market and its sector, not at all with oil, China or the dollar).
  const fitted = [...new Map(empires.flatMap((e) => e.companies).filter((c) => c.fit).map((c) => [c.id, c])).values()];
  const peerCache = new Map<string, SimFit | null>();
  const peers = (sector: string | null | undefined): SimFit | null => {
    const key = sector ?? '';
    if (peerCache.has(key)) return peerCache.get(key)!;
    const group = fitted.filter((c) => (sector ? c.sector === sector : true));
    let out: SimFit | null = null;
    if (group.length >= 2) {
      const factors = Object.keys(group[0].fit!.beta);
      const mean = (f: string) => group.reduce((n, c) => n + (c.fit!.beta[f] ?? 0), 0) / group.length;
      const spread = (f: string) => Math.sqrt(group.reduce((n, c) => n + ((c.fit!.beta[f] ?? 0) - mean(f)) ** 2, 0) / (group.length - 1) / group.length + mean(f) ** 2 * 0.04);
      const sd = group.reduce((n, c) => n + (c.fit!.sd ?? 0), 0) / group.length;
      out = { beta: Object.fromEntries(factors.map((f) => [f, mean(f)])), se: Object.fromEntries(factors.map((f) => [f, spread(f)])), sd };
    }
    peerCache.set(key, out);
    return out;
  };
  const RULE: SimFit = { beta: { market: 1, sector: 1, oil: 0, china: 0, usd: 0 }, se: { market: 0, sector: 0, oil: 0, china: 0, usd: 0 } };
  const Z80 = 1.2816;
  // How long the scenario takes to play out (its longest ramp, at least a month), in weeks: the company's own news over
  // that time widens every range, as the backtest on past shocks required (80% ranges then held 63-85% of outcomes).
  const horizonWeeks = Math.max(1, ...scenario.shocks.map((s) => s.to - s.from)) * 4.345;

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
    const peer = c.fit ? null : fitted.length ? (peers(c.sector) ?? peers(null)) : null;
    const fit = c.fit ?? peer ?? RULE;
    const basis: CompanyMove['basis'] = c.fit ? 'measured' : peer ? 'peers' : 'rule';
    const revShare = base ? delta / base : 0;
    let price = 1 + revShare;
    // Variance of the change: revenue effects are uncertain by about half (how far a price follows revenue), and each
    // factor effect by its sensitivity's standard error times the factor's move.
    let variance = (0.39 * revShare) ** 2; // ±half at 80%
    for (const s of scenario.shocks) {
      const m = at(s);
      if (!m) continue;
      if (s.kind === 'company' && s.target === c.id) price *= 1 + m;
      else if (s.kind === 'sector' && c.sector === s.target) {
        price *= 1 + (fit.beta.sector ?? 1) * m;
        variance += ((fit.se.sector ?? 0) * m) ** 2;
      } else if (s.kind === 'market') {
        price *= 1 + (fit.beta.market ?? 1) * m;
        variance += ((fit.se.market ?? 0) * m) ** 2;
      } else if (s.kind === 'factor') {
        price *= 1 + (fit.beta[s.target] ?? 0) * m;
        variance += ((fit.se[s.target] ?? 0) * m) ** 2;
      }
    }
    if (Math.abs(price - 1) > 1e-6) variance += (fit.sd ?? 0) ** 2 * horizonWeeks;
    const sd = Math.sqrt(variance);
    moves.set(c.id, { company: c, revenueBase: base, revenueDelta: delta, price: price - 1, lo: price - 1 - Z80 * sd, hi: price - 1 + Z80 * sd, basis });
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
  // Ranges add up as the low and high ends of each stake (a conservative 80% band for a person's total).
  const spans = new Map<string, [number, number]>();
  const addSpan = (slug: string, lo: number, hi: number) => {
    const s = spans.get(slug) ?? [0, 0];
    spans.set(slug, [s[0] + lo, s[1] + hi]);
  };
  for (const e of empires) {
    for (const st of e.stakes) {
      if (!st.value) continue;
      const sold = sales.find((s) => s.person === e.person.slug && s.target === st.company.id);
      const now = st.value * move(st.company.id); // change in the stake's value by this month
      if (!sold || month < sold.to) {
        add(e.person.slug, now);
        const m = moves.get(st.company.id);
        addSpan(e.person.slug, st.value * (m?.lo ?? 0), st.value * (m?.hi ?? 0));
        continue;
      }
      // After the sale: the seller keeps the rest of the stake and the cash; the buyer owns the shares from then on.
      const paid = st.value * sold.fraction * salePrice.get(sold)! * (1 + sold.pct);
      const seller = st.value * (1 - sold.fraction) * move(st.company.id) + paid - st.value * sold.fraction;
      const buyer = st.value * sold.fraction * (1 + move(st.company.id)) - paid;
      add(e.person.slug, seller);
      add(sold.buyer, buyer);
      addSpan(e.person.slug, seller, seller);
      addSpan(sold.buyer, buyer, buyer);
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
    const span = spans.get(e.person.slug);
    if (d != null && Math.abs(d) > 0.5) people.push({ person: e.person, delta: d, pct: null, via: party ? party.company.name : (touched[0]?.c.name ?? ''), range: span ? [Math.min(span[0], d), Math.max(span[1], d)] : null });
    else if (touched.length) {
      const m = moves.get(touched[0].c.id)!;
      people.push({ person: e.person, delta: null, pct: touched[0].p, via: touched[0].c.name, range: [m.lo, m.hi] });
    }
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

/** An 80% range in words: "−$9.1B to −$20B" for dollars (with `money`), "−4.0% to −12%" for a share-price move. */
/** True when a range says something (an estimate without measured uncertainty has none). */
export function hasRange(range: [number, number] | null | undefined): range is [number, number] {
  return !!range && Math.abs(range[1] - range[0]) > 1e-3 * Math.max(Math.abs(range[0]), Math.abs(range[1]), 1e-9);
}

export function rangeText(range: [number, number], money: ((usd: number) => string) | null): string {
  const one = (v: number) => `${v < 0 ? '−' : '+'}${money ? money(Math.abs(v)) : simPct(v)}`;
  return `${one(range[0])} to ${one(range[1])}`;
}

/** A simulated percentage for labels: one decimal under 10%, whole numbers above (rounded first, so 9.99… reads 10%). */
export function simPct(v: number): string {
  const x = Math.round(Math.abs(v) * 1000) / 10;
  return `${x < 10 ? x.toFixed(1) : Math.round(x)}%`;
}

/** What a notification is about, so the camera can go there: a country, a company, a person, a sector (its most-moved
 * company), the start (the scenario's first place or sale), or the whole world (markets, the ending). */
export type SimSubject =
  | { kind: 'place'; iso2: string }
  | { kind: 'company'; id: string }
  | { kind: 'person'; slug: string }
  | { kind: 'sector'; sector: string }
  | { kind: 'start' }
  | { kind: 'world' };
export type SimEvent = { month: number; text: string; tone: 'gain' | 'loss' | 'info'; about: SimSubject };

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
  const out: SimEvent[] = [{ month: 0, text: scenario.title.replace(/\.$/, ''), tone: 'info', about: { kind: 'start' } }];
  // The story's own lines lead; a change that starts the same month as a line still gets its own notification.
  for (const b of scenario.beats ?? []) {
    out.push({ month: b.month, text: b.text, tone: b.tone, about: b.person ? { kind: 'person', slug: b.person } : b.country ? { kind: 'place', iso2: b.country } : { kind: 'world' } });
  }
  for (const s of scenario.shocks) {
    const tone = s.pct < 0 ? 'loss' : 'gain';
    const at = s.kind === 'transfer' ? s.to : s.from;
    if (s.kind === 'place') out.push({ month: at, text: `Business in ${countryName(s.target)} ${size(s.pct)}`, tone, about: { kind: 'place', iso2: s.target } });
    if (s.kind === 'sector') out.push({ month: at, text: `${SECTOR_NAME[s.target] ?? s.target} shares ${moveWord(s.pct)}`, tone, about: { kind: 'sector', sector: s.target } });
    if (s.kind === 'market') out.push({ month: at, text: `Markets ${s.pct < 0 ? 'sell off' : 'rally'}`, tone, about: { kind: 'world' } });
    if (s.kind === 'company') out.push({ month: at, text: `${companyName(s.target)} shares ${moveWord(s.pct)}`, tone, about: { kind: 'company', id: s.target } });
    if (s.kind === 'transfer') out.push({ month: at, text: `${first(personName(s.buyer))} buys ${first(personName(s.person))}’s ${companyName(s.target)} stake`, tone: 'info', about: { kind: 'person', slug: s.buyer } });
  }
  // Overtakes: each month's biggest jump within the top five; only the three biggest of the film make it, so the
  // scenario's own events stay the story.
  const jumps: { m: number; size: number; e: SimEvent }[] = [];
  for (let m = 1; m < frames.length; m++) {
    const before = new Map(frames[m - 1].ranks.map((r) => [r.person.id, r.after]));
    const jump = frames[m].ranks
      .filter((r) => r.after <= 5 && (before.get(r.person.id) ?? 99) > r.after)
      .sort((a, b) => (before.get(b.person.id)! - b.after) - (before.get(a.person.id)! - a.after))[0];
    if (!jump) continue;
    const passed = frames[m].ranks.find((r) => r.after === jump.after + 1);
    jumps.push({
      m,
      size: (before.get(jump.person.id)! - jump.after) * 10 + (6 - jump.after),
      e: { month: m, text: passed ? `${first(jump.person.name)} passes ${first(passed.person.name)} for #${jump.after}` : `${first(jump.person.name)} climbs to #${jump.after}`, tone: 'gain', about: { kind: 'person', slug: jump.person.slug } },
    });
  }
  for (const j of jumps.sort((a, b) => b.size - a.size).slice(0, 3)) out.push(j.e);
  const last = frames[frames.length - 1];
  if (last && frames.length > 1) {
    const top = last.people.find((p) => p.delta != null && p.delta > 0) ?? last.people.find((p) => (p.pct ?? 0) > 0);
    const low = last.people.find((p) => (p.delta ?? p.pct ?? 0) < 0); // people come sorted biggest move first
    const parts = [top && `${first(top.person.name)} up most`, low && `${first(low.person.name)} hit hardest`].filter(Boolean);
    out.push({ month: frames.length - 1, text: `${scenario.months} months on${parts.length ? `: ${parts.join(', ')}` : ''}`, tone: 'info', about: { kind: 'world' } });
  }
  return out.sort((a, b) => a.month - b.month);
}
