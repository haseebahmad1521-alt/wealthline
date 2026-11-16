// Versus mode: two of the tracked people in a rivalry, played on the globe. The player picks only the two rivals; the
// battle and who comes out ahead are decided for them:
//   - with Grok (the `scenarios` function, once deployed): current context from its own search, with sources;
//   - without it, here, on recorded numbers by a stated rule per battle (callMatch), shown with the match. It says
//     "too close to call" or names the missing number rather than guessing.
// Either way the money comes from `simulate`: only the rivals' main companies move, and fortunes move in dollars only
// through recorded stakes.
import type { Beat, Scenario, Shock } from '../../supabase/functions/_shared/scenario.ts';
import type { Frame, SimCompany, SimEmpire, SimPerson } from './simulate.ts';

export type Battle = 'price' | 'market' | 'talent';
export const BATTLES: { key: Battle; label: string }[] = [
  { key: 'price', label: 'Price war' },
  { key: 'market', label: 'Market grab' },
  { key: 'talent', label: 'Talent war' },
];

// Matches that make sense as rivalries (same customers, same markets or a public feud); shown when both are tracked.
const SUGGESTED: [string, string][] = [
  ['Elon Musk', 'Mukesh Ambani'],
  ['Jeff Bezos', 'Elon Musk'],
  ['Mark Zuckerberg', 'Elon Musk'],
  ['Bernard Arnault', 'Amancio Ortega'],
  ['Larry Ellison', 'Jensen Huang'],
  ['Jeff Bezos', 'Mukesh Ambani'],
  ['Larry Page', 'Mark Zuckerberg'],
  ['Ma Huateng', 'Jack Ma'],
];

export const firstName = (name: string) => name.replace(/ & family$/, '').split(' ')[0];
export const lastName = (name: string) => name.replace(/ & family$/, '').split(' ').slice(-1)[0];

/** Suggested matches among the people tracked, as slug pairs. */
export function suggestedMatches(people: SimPerson[]): [SimPerson, SimPerson][] {
  const byName = new Map(people.map((p) => [p.name.replace(/ & family$/, ''), p]));
  return SUGGESTED.flatMap(([a, b]) => (byName.has(a) && byName.has(b) ? [[byName.get(a)!, byName.get(b)!] as [SimPerson, SimPerson]] : []));
}

/** The company a person is best known for here: their biggest recorded stake, else the most reported revenue. */
export function mainCompany(e: SimEmpire): SimCompany | null {
  const staked = [...e.stakes].filter((s) => s.value).sort((a, b) => b.value! - a.value!)[0];
  const byStake = staked && e.companies.find((c) => c.id === staked.company.id);
  if (byStake) return byStake;
  const revenue = (c: SimCompany) => c.regions.reduce((n, r) => n + r.revenue_usd, 0);
  return [...e.companies].sort((a, b) => revenue(b) - revenue(a) || Number(b.listed) - Number(a.listed))[0] ?? null;
}

/**
 * Where a market grab is fought: a country both main companies report revenue in (the bigger one), else the second
 * rival's home (the one being challenged: Musk vs Ambani is fought in India), else the first's.
 */
export function battleground(first: SimCompany, second: SimCompany, home: (companyId: string) => string | null): string | null {
  const theirs = new Map(second.regions.filter((r) => r.country).map((r) => [r.country!, r.revenue_usd]));
  const shared = first.regions.filter((r) => r.country && theirs.has(r.country)).sort((a, b) => b.revenue_usd + theirs.get(b.country!)! - (a.revenue_usd + theirs.get(a.country!)!));
  return shared[0]?.country ?? home(second.id) ?? home(first.id);
}

/** How a built-in match was decided: the battle, the likelier winner, and the rule in words. */
export type Call = { battle: Battle; winner: 'a' | 'b'; why: string };

/** Within this share of each other, recorded numbers can't separate two rivals. */
const CLOSE = 0.1;
const revenueOf = (c: SimCompany) => c.regions.reduce((n, r) => n + r.revenue_usd, 0);
const revenueIn = (c: SimCompany, iso: string) => c.regions.filter((r) => r.country === iso).reduce((n, r) => n + r.revenue_usd, 0);

/**
 * Decides a built-in match on recorded numbers, by a stated rule:
 *   - both main companies report revenue in the same country → a fight for that market, won by whoever already sells
 *     more there;
 *   - else the same sector → a price war, won by the fatter operating margin (it can cut prices longer);
 *   - else a race for talent, won by the bigger operating profit (revenue × margin: more to pay with).
 * Returns a reason instead when a needed number isn't recorded or the two are within a tenth of each other.
 */
export function callMatch(a: SimEmpire, b: SimEmpire, opts: { countryName: (iso2: string) => string }): Call | { error: string } {
  const ca = mainCompany(a);
  const cb = mainCompany(b);
  const A = lastName(a.person.name);
  const B = lastName(b.person.name);
  if (!ca || !cb) return { error: `No company is recorded for ${!ca ? A : B}.` };
  if (ca.id === cb.id) return { error: 'Those two share the same main company; pick someone else.' };
  const close = (x: number, y: number) => Math.abs(x - y) < CLOSE * Math.max(Math.abs(x), Math.abs(y));
  const pick = (x: number, y: number) => (x > y ? 'a' : 'b') as 'a' | 'b';
  const name = (w: 'a' | 'b') => (w === 'a' ? ca.name : cb.name);
  const where = battleground(ca, cb, () => null);
  if (where && revenueIn(ca, where) > 0 && revenueIn(cb, where) > 0) {
    const place = opts.countryName(where);
    const x = revenueIn(ca, where);
    const y = revenueIn(cb, where);
    if (close(x, y)) return { error: `Too close to call: ${ca.name} and ${cb.name} sell about as much in ${place}.` };
    const w = pick(x, y);
    return { battle: 'market', winner: w, why: `Both sell in ${place}, and ${name(w)} already sells more there (recorded revenue).` };
  }
  const missing = [ca, cb].filter((c) => c.margin == null).map((c) => c.name);
  if (missing.length) return { error: `Not enough recorded numbers to call it: no operating margin for ${missing.join(' or ')}.` };
  if (ca.sector && ca.sector === cb.sector) {
    if (close(ca.margin!, cb.margin!)) return { error: `Too close to call: ${ca.name} and ${cb.name} have about the same operating margin.` };
    const w = pick(ca.margin!, cb.margin!);
    return { battle: 'price', winner: w, why: `Same industry, so a price war: ${name(w)} keeps more of each sale (recorded operating margin), so it can cut prices longer.` };
  }
  const x = revenueOf(ca) * ca.margin!;
  const y = revenueOf(cb) * cb.margin!;
  if (!revenueOf(ca) || !revenueOf(cb)) return { error: `Not enough recorded numbers to call it: no revenue for ${!revenueOf(ca) ? ca.name : cb.name}.` };
  if (close(x, y)) return { error: `Too close to call: ${ca.name} and ${cb.name} make about the same operating profit.` };
  const w = pick(x, y);
  return { battle: 'talent', winner: w, why: `Different industries, so a race for the best people: ${name(w)} makes more operating profit (recorded revenue × margin), so it can pay more.` };
}

/** A built-in match: the two main companies' share prices move by the battle's stated sizes, with story beats. */
export function versusScenario(
  a: SimEmpire,
  b: SimEmpire,
  { battle, winner, why }: Call,
  opts: { home: (companyId: string) => string | null; countryName: (iso2: string) => string },
): Scenario | null {
  const ca = mainCompany(a);
  const cb = mainCompany(b);
  if (!ca || !cb || ca.id === cb.id) return null;
  const [w, l] = winner === 'a' ? [a, b] : [b, a];
  const [cw, cl] = winner === 'a' ? [ca, cb] : [cb, ca];
  const A = firstName(a.person.name);
  const B = firstName(b.person.name);
  const W = firstName(w.person.name);
  const L = firstName(l.person.name);
  const co = (target: string, pct: number, from: number, to: number): Shock => ({ kind: 'company', target, pct, from, to });
  let shocks: Shock[] = [];
  let beats: Beat[] = [];
  let summary = '';
  let assumptions: string[] = [];
  const where = battleground(ca, cb, opts.home);
  if (battle === 'price') {
    shocks = [co(cw.id, -0.08, 1, 5), co(cl.id, -0.22, 1, 8)];
    beats = [
      { month: 0, text: `${A} and ${B} start a price war`, tone: 'info', person: a.person.slug },
      { month: 2, text: `${cl.name} cuts prices again`, tone: 'loss', person: l.person.slug },
      { month: 5, text: `${cw.name} keeps its customers`, tone: 'gain', person: w.person.slug },
      { month: 9, text: `${L} pulls back`, tone: 'loss', person: l.person.slug },
    ];
    summary = `${cw.name} and ${cl.name} undercut each other for the same customers. Both give up profit; ${cw.name} holds on longer and ${cl.name} bleeds more.`;
    assumptions = [`${cw.name} shares fall by about a twelfth, ${cl.name} by about a fifth.`];
  } else if (battle === 'market' && where) {
    const place = opts.countryName(where);
    shocks = [co(cw.id, 0.15, 2, 8), co(cl.id, -0.15, 2, 8)];
    beats = [
      { month: 0, text: `${A} and ${B} fight for ${place}`, tone: 'info', country: where },
      { month: 3, text: `${cw.name} wins over ${place}’s customers`, tone: 'gain', person: w.person.slug },
      { month: 6, text: `${cl.name} loses ground in ${place}`, tone: 'loss', person: l.person.slug },
      { month: 10, text: `${W} takes ${place}`, tone: 'gain', country: where },
    ];
    summary = `${cw.name} and ${cl.name} go after the same customers in ${place}. ${cw.name} wins the market and investors reward it; ${cl.name} is marked down.`;
    assumptions = [`${cw.name} shares rise by about a seventh and ${cl.name} shares fall by as much.`];
  } else {
    shocks = [co(cw.id, -0.05, 0, 3), co(cl.id, -0.05, 0, 3), co(cw.id, 0.18, 6, 10), co(cl.id, -0.06, 6, 10)];
    beats = [
      { month: 0, text: `${A} and ${B} fight over the best engineers`, tone: 'info', person: a.person.slug },
      { month: 3, text: `Pay packages soar at both`, tone: 'loss' },
      { month: 6, text: `${cw.name} ships a breakthrough`, tone: 'gain', person: w.person.slug },
      { month: 9, text: `${cl.name} falls behind`, tone: 'loss', person: l.person.slug },
    ];
    summary = `${cw.name} and ${cl.name} bid against each other for the same people. Costs rise for both, until ${cw.name}'s hires pay off and ${cl.name} is left behind.`;
    assumptions = [`Both companies' shares dip by a twentieth on higher pay; then ${cw.name} rises by about a sixth and ${cl.name} slips.`];
  }
  return {
    id: `versus:${a.person.slug}:${b.person.slug}:${battle}`,
    origin: 'versus',
    versus: [a.person.slug, b.person.slug],
    title: `${A} vs ${B}: ${BATTLES.find((x) => x.key === battle)!.label.toLowerCase()}.`,
    summary,
    plausibility: 'possible',
    reason: `Called on recorded numbers only (Grok’s current context isn’t available): ${why}`,
    months: 12,
    shocks,
    beats,
    assumptions: [...assumptions, `Only the two main companies move: ${ca.name} and ${cb.name}.`],
    sources: [],
  };
}

export type Corner = { person: SimPerson; delta: number | null; pct: number | null; via: string; score: number };

/**
 * The scoreboard: each rival's change so far. The score compares like with like: share of fortune when both have a
 * recorded stake moving, otherwise each side's main company's share-price move.
 */
export function versusScore(frame: Frame, a: SimEmpire, b: SimEmpire): { a: Corner; b: Corner; basis: 'fortune' | 'shares'; lead: 'a' | 'b' | null } {
  const corner = (e: SimEmpire): Corner => {
    const p = frame.people.find((x) => x.person.id === e.person.id);
    const main = mainCompany(e);
    const pct = frame.companies.find((c) => c.company.id === main?.id)?.price ?? p?.pct ?? 0;
    return { person: e.person, delta: p?.delta ?? null, pct, via: main?.name ?? '', score: pct };
  };
  const ca = corner(a);
  const cb = corner(b);
  const fortune = ca.delta != null && cb.delta != null && !!a.person.net_worth_usd && !!b.person.net_worth_usd;
  if (fortune) {
    ca.score = ca.delta! / a.person.net_worth_usd!;
    cb.score = cb.delta! / b.person.net_worth_usd!;
  }
  const gap = ca.score - cb.score;
  return { a: ca, b: cb, basis: fortune ? 'fortune' : 'shares', lead: Math.abs(gap) < 1e-4 ? null : gap > 0 ? 'a' : 'b' };
}
