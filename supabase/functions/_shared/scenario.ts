// World simulations: the shape of a scenario and the checks every Grok-written one passes before it is stored. Shared
// by the `scenarios` function, the `world` facts job (sectors) and the app (src/lib/simulate.ts). No imports, so Deno
// and the app can both use it.
//
// Grok writes the story and a list of changes; it never writes dollar figures. Each change names something tracked (a
// country by ISO code, a company or person from the list it was given, or a sector), a size, and the months it runs.
// The app turns changes into dollars from recorded revenue, prices and share counts.

export const SECTORS = ['energy', 'materials', 'industrials', 'autos', 'consumer', 'health', 'finance', 'technology', 'media', 'real_estate', 'transport'] as const;
export type Sector = (typeof SECTORS)[number];

// Wikidata industry labels (P452) → sector. A company often lists several industries (Tesla: automotive, energy
// storage), so the list is in priority order and the first sector any label matches wins: what a company is known
// for before what it also does.
const SECTOR_WORDS: [RegExp, Sector][] = [
  [/\b(automotive|automobile|motor vehicle|car manufactur|electric vehicle)/i, 'autos'],
  [/\b(airline|aviation services|shipping|logistics|freight|railway|transport|courier|delivery)/i, 'transport'],
  [/\b(bank|financ|investment|insurance|asset management|private equity|hedge fund|stock exchange|brokerage|payment|fintech|venture capital)/i, 'finance'],
  [/\b(pharmaceutic|biotech|health ?care|medical|hospitals?\b|drug)/i, 'health'],
  [/\b(oil|petroleum|natural gas|electric(ity)? (utility|generation)|power generation|refin|coal|energy industry)/i, 'energy'],
  [/\b(software|internet|semiconductor|computer|information technology|electronics|cloud|artificial intelligence|e-commerce|online|video game|technology|robotics|closed-circuit television)/i, 'technology'],
  [/\b(media|entertainment|publishing|broadcast|film|music|news|journalism|telecommunication|mass media|advertising|professional sport)/i, 'media'],
  [/\b(real estate|property|construction of buildings)/i, 'real_estate'],
  [/\b(steel|mining|metal|chemical|cement|paper|materials)/i, 'materials'],
  [/\b(retail|apparel|fashion|clothing|luxury|food|beverage|brewing|cosmetic|consumer|supermarket|grocery|restaurant|hospitality|hotel|tourism|travel|tobacco)/i, 'consumer'],
  [/\b(aerospace|defen[cs]e|conglomerate|industr|manufactur|machinery|engineering|construction|infrastructure|equipment rental)/i, 'industrials'],
];

/** The sector for a company's Wikidata industry labels (highest-priority match), with the label it came from. */
export function sectorFor(labels: string[]): { sector: Sector; label: string } | null {
  for (const [re, sector] of SECTOR_WORDS) {
    const label = labels.find((l) => re.test(l));
    if (label) return { sector, label };
  }
  return null;
}

/**
 * One change a scenario makes, ramping in linearly from month `from` to month `to` and holding after.
 *  place     business in a country (ISO 3166-1 alpha-2) changes by `pct` of revenue earned there
 *  company   a company's share price changes by `pct`
 *  sector    every tracked company in a sector: share price changes by `pct`
 *  market    every listed company: share price changes by `pct`
 *  transfer  `fraction` of `person`'s recorded shares in `company` sold to `buyer` at the market price plus `pct`
 *            (a premium), at month `to`
 */
export type Shock =
  | { kind: 'place'; target: string; pct: number; from: number; to: number }
  | { kind: 'company'; target: string; pct: number; from: number; to: number }
  | { kind: 'sector'; target: Sector; pct: number; from: number; to: number }
  | { kind: 'market'; target: ''; pct: number; from: number; to: number }
  | { kind: 'transfer'; target: string; person: string; buyer: string; fraction: number; pct: number; from: number; to: number };

export type Plausibility = 'likely' | 'possible' | 'unlikely';
export type Source = { label: string; url: string };

/** A line of the story at a month, written without figures; it names who or where, so the camera can go there. */
export type Beat = { month: number; text: string; tone: 'gain' | 'loss' | 'info'; person?: string | null; country?: string | null };

export type Scenario = {
  id: string;
  origin: 'example' | 'daily' | 'prompt' | 'versus' | 'dials';
  /** Versus mode: the two rivals' slugs. */
  versus?: [string, string] | null;
  /** Story lines shown as notifications, in addition to the ones made from the changes. */
  beats?: Beat[];
  title: string;
  summary: string;
  plausibility: Plausibility;
  reason: string;
  months: number;
  shocks: Shock[];
  assumptions: string[];
  sources: Source[];
  prompt?: string | null;
  declined?: string | null;
  run_date?: string;
  position?: number;
};

/** What a scenario may name: tracked company ids, person slugs, and ISO country codes with a GDP. */
export type Catalog = { companies: Set<string>; people: Set<string>; countries: Set<string>; holdings: Set<string> /* `${slug}:${companyId}` */ };

const LIMIT = { pct: [-0.9, 1.5], months: [1, 36], shocks: 12 } as const;
// Amounts, percentages and multiples in prose would read as forecasts; the numbers come from the calculation.
const FIGURES = /(\$|€|£|¥|\d+(\.\d+)?\s?(%|percent|per cent|bn|billion|million|trillion|[kmbt]\b)|\b\d+x\b)/i;

/** Prose for the scenario card: trimmed, length-capped, and free of figures; null when it has figures. */
export function cleanProse(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t || t.length > max || FIGURES.test(t)) return null;
  return t;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Checks one shock against the catalog: known targets only, sizes capped, months inside the scenario. Returns the
 * cleaned shock, or a reason it was dropped.
 */
export function checkShock(raw: Record<string, unknown>, months: number, cat: Catalog): Shock | string {
  const kind = raw.kind;
  const target = typeof raw.target === 'string' ? raw.target.trim() : '';
  const pct = num(raw.pct);
  const to = Math.round(clamp(num(raw.to), 0, months));
  const from = Math.round(clamp(num(raw.from), 0, to));
  if (!Number.isFinite(pct) || Number.isNaN(to) || Number.isNaN(from)) return 'bad numbers';
  const p = clamp(pct, LIMIT.pct[0], LIMIT.pct[1]);
  switch (kind) {
    case 'place':
      return cat.countries.has(target.toUpperCase()) ? { kind, target: target.toUpperCase(), pct: p, from, to } : `unknown country ${target}`;
    case 'company':
      return cat.companies.has(target) ? { kind, target, pct: p, from, to } : `unknown company ${target}`;
    case 'sector':
      return (SECTORS as readonly string[]).includes(target) ? { kind, target: target as Sector, pct: p, from, to } : `unknown sector ${target}`;
    case 'market':
      return { kind, target: '', pct: p, from, to };
    case 'transfer': {
      const person = typeof raw.person === 'string' ? raw.person : '';
      const buyer = typeof raw.buyer === 'string' ? raw.buyer : '';
      const fraction = clamp(num(raw.fraction), 0, 1);
      if (!cat.holdings.has(`${person}:${target}`)) return `no recorded stake for ${person} in ${target}`;
      if (!cat.people.has(buyer) || buyer === person) return `unknown buyer ${buyer}`;
      if (!(fraction > 0)) return 'no fraction';
      return { kind, target, person, buyer, fraction, pct: clamp(p, 0, 1), from: to, to };
    }
    default:
      return `unknown kind ${String(kind)}`;
  }
}

/** Checks story beats: prose without figures, months inside the scenario, names that are tracked. */
export function checkBeats(raw: unknown, months: number, cat: Catalog): Beat[] {
  if (!Array.isArray(raw)) return [];
  const out: Beat[] = [];
  for (const b of raw.slice(0, 8) as Record<string, unknown>[]) {
    const text = cleanProse(b?.text, 90);
    const month = Math.round(clamp(num(b?.month), 0, months));
    if (!text || Number.isNaN(month)) continue;
    const tone = b.tone === 'gain' || b.tone === 'loss' ? b.tone : 'info';
    const person = typeof b.person === 'string' && cat.people.has(b.person) ? b.person : null;
    const country = typeof b.country === 'string' && cat.countries.has(b.country.toUpperCase()) ? b.country.toUpperCase() : null;
    out.push({ month, text, tone, person, country });
  }
  return out.sort((a, b) => a.month - b.month);
}

/** A normalised question, for the cache: case, spacing and trailing punctuation don't make a new Grok call. */
export function promptKey(prompt: string): string {
  return prompt.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Linear ramp of a shock at month `m`: 0 before `from`, 1 from `to` on. */
export function ramp(s: { from: number; to: number }, m: number): number {
  if (m >= s.to) return 1;
  if (m <= s.from) return 0;
  return (m - s.from) / (s.to - s.from);
}

export { LIMIT as SCENARIO_LIMIT };
