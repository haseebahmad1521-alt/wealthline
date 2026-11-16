// The dials sandbox: big forces as sliders. Each dial maps to scenario changes by a stated rule (shown with it), so the
// player sets the size and `simulate` does the arithmetic on recorded values. Nothing here is a forecast.
import type { Scenario, Shock } from '../../supabase/functions/_shared/scenario.ts';
import type { Frame } from './simulate.ts';

export type Dial = {
  key: string;
  label: string;
  /** Slider range, in percent. */
  min: number;
  max: number;
  /** How the dial reaches companies, in words (shown under the sliders). */
  rule: string;
  /** Where the dial is set, as a plain sentence ("Oil costs a third more"). */
  describe: (percent: number) => string;
  shocks: (v: number) => Shock[];
};

const ramp = { from: 0, to: 6 };

/** A share in words, the nearest of a few plain fractions: 35 → "a third", 50 → "half". */
export function share(percent: number): string {
  const p = Math.abs(percent);
  const words: [number, string][] = [[5, 'a twentieth'], [10, 'a tenth'], [16, 'about a sixth'], [20, 'a fifth'], [25, 'a quarter'], [33, 'a third'], [50, 'half'], [67, 'two thirds'], [75, 'three quarters'], [100, 'all of it']];
  return words.reduce((best, w) => (Math.abs(w[0] - p) < Math.abs(best[0] - p) ? w : best))[1];
}
const by = (v: number, up: string, down: string) => (v > 0 ? `${up} by ${share(v)}` : `${down} by ${share(v)}`);
const sector = (target: Extract<Shock, { kind: 'sector' }>['target'], pct: number): Shock => ({ kind: 'sector', target, pct, ...ramp });

export const DIALS: Dial[] = [
  {
    key: 'oil',
    label: 'Oil price',
    min: -50,
    max: 100,
    rule: 'Brent oil moves by the dial; each company moves by how its shares have followed oil, directly and through its sector, over the last three years.',
    describe: (v) => (v >= 95 ? 'The oil price doubles' : by(v, 'The oil price goes up', 'The oil price falls')),
    shocks: (v) => [{ kind: 'factor', target: 'oil', pct: v, ...ramp }],
  },
  {
    key: 'ai',
    label: 'AI boom',
    min: -50,
    max: 100,
    rule: 'US tech shares beat the market by half the dial; each tech company moves by its measured sensitivity to them.',
    describe: (v) => (v >= 95 ? 'Spending on AI doubles' : v > 0 ? by(v, 'Spending on AI grows', '') : `The AI bubble deflates: spending falls by ${share(v)}`),
    shocks: (v) => [sector('technology', v * 0.5)],
  },
  {
    key: 'china',
    label: 'Trade with China',
    min: -100,
    max: 50,
    rule: 'Business done in China moves by half the dial and Chinese stocks by four tenths of it; each company by its measured sensitivity to Chinese stocks.',
    describe: (v) => (v <= -95 ? 'Trade with China is cut off' : by(v, 'Trade with China grows', 'Trade with China is cut')),
    shocks: (v) => [{ kind: 'place', target: 'CN', pct: v * 0.5, ...ramp }, { kind: 'factor', target: 'china', pct: v * 0.4, ...ramp }],
  },
  {
    key: 'us',
    label: 'US economy',
    min: -15,
    max: 10,
    rule: 'Business done in the US moves by the dial and global stocks by twice it (stocks swing harder than the economy); each company by its measured sensitivity to global stocks.',
    describe: (v) => (v < 0 ? `The US economy shrinks by ${share(v)}: ${v <= -15 ? 'a depression' : v <= -5 ? 'a recession' : 'a slowdown'}` : `The US economy grows by ${share(v)}: ${v >= 5 ? 'a boom' : 'faster growth'}`),
    shocks: (v) => [{ kind: 'place', target: 'US', pct: v, ...ramp }, { kind: 'market', target: '', pct: v * 2, ...ramp }],
  },
  {
    key: 'luxury',
    label: 'Luxury spending',
    min: -50,
    max: 50,
    rule: 'US consumer shares beat the market by four tenths of the dial; each consumer company moves by its measured sensitivity to them.',
    describe: (v) => by(v, 'Spending on luxury goes up', 'Spending on luxury falls'),
    shocks: (v) => [sector('consumer', v * 0.4)],
  },
];

export type DialValues = Record<string, number>; // percent

/** The sandbox's scenario for the current dial positions (dials at zero add nothing). */
export function dialScenario(values: DialValues): Scenario {
  const set = DIALS.filter((d) => values[d.key]);
  const shocks = set.flatMap((d) => d.shocks(values[d.key] / 100)).filter((s) => Math.abs(s.pct) > 1e-6);
  const named = set.map((d) => `${d.label.toLowerCase()} ${values[d.key] > 0 ? 'up' : 'down'}`);
  return {
    id: 'dials',
    origin: 'dials',
    title: named.length ? `Your world: ${named.join(', ')}.` : 'Your world.',
    summary: 'Set by the dials.',
    plausibility: 'possible',
    reason: 'You set the dials.',
    months: 12,
    shocks,
    beats: [],
    assumptions: set.map((d) => d.rule),
    sources: [],
  };
}

const SECTOR_WORD: Record<string, string> = {
  energy: 'Energy companies', defense: 'Aerospace and defence companies', transport: 'Transport companies', technology: 'Tech companies', consumer: 'Consumer brands',
  materials: 'Materials companies', industrials: 'Industrial companies', autos: 'Carmakers', finance: 'Banks and investors',
  health: 'Healthcare companies', media: 'Media companies', real_estate: 'Property companies',
};
const region = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const pctWord = (p: number) => `${p > 0 ? 'rise' : 'fall'} about ${Math.round(Math.abs(p) * 100)}%`;

/**
 * What a dial does, in sentences: each change with a few of the tracked companies it reaches, by name. `names` maps a
 * sector to its tracked companies' names.
 */
export function dialEffects(dial: Dial, percent: number, names: Record<string, string[]>): string[] {
  if (!percent) return [];
  return dial.shocks(percent / 100).map((s) => {
    if (s.kind === 'sector') {
      const list = names[s.target] ?? [];
      const some = list.length ? ` like ${list.slice(0, 3).join(', ')}${list.length > 3 ? ` (${list.length} tracked)` : ''}` : '';
      return `${SECTOR_WORD[s.target] ?? s.target}${some} ${s.pct > 0 ? 'beat' : 'trail'} the market by about ${Math.round(Math.abs(s.pct) * 100)}%, each by its measured sensitivity.`;
    }
    if (s.kind === 'place') return `Business done in ${region?.of(s.target) ?? s.target} ${s.pct > 0 ? 'grows' : 'shrinks'} about ${Math.round(Math.abs(s.pct) * 100)}%.`;
    if (s.kind === 'market') return `Global stocks ${pctWord(s.pct)}; each company moves by how its shares follow them.`;
    if (s.kind === 'factor') {
      const what = s.target === 'oil' ? 'Brent oil' : s.target === 'china' ? 'Chinese stocks' : 'The US dollar';
      const list = s.target === 'oil' ? (names.energy ?? []) : [];
      const verb = s.target === 'china' ? (s.pct > 0 ? 'rise' : 'fall') : s.pct > 0 ? 'rises' : 'falls';
      return `${what} ${verb} about ${Math.round(Math.abs(s.pct) * 100)}%${list.length ? `; energy companies like ${list.slice(0, 3).join(', ')} follow it most` : ''}. Each company moves by how its shares have followed ${s.target === 'usd' ? 'the dollar' : s.target === 'oil' ? 'oil' : 'Chinese stocks'}.`;
    }
    return '';
  }).filter(Boolean);
}

const hasWidth = (r: [number, number]) => Math.abs(r[1] - r[0]) > 1e-3 * Math.max(Math.abs(r[0]), Math.abs(r[1]), 1e-9);
const spanText = (r: [number, number], money: ((usd: number) => string) | null) => {
  const one = (v: number) => `${v < 0 ? '−' : '+'}${money ? money(Math.abs(v)) : `${Math.round(Math.abs(v) * 100)}%`}`;
  return `${one(r[0])} to ${one(r[1])}`;
};
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const joinAnd = (parts: string[]) => (parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
const pctText = (p: number) => `${Math.round(Math.abs(p) * 100)}%`;
type Mover = Frame['people'][number];

/**
 * All the dials together, in three sentences: what's set, what it adds up to (changes compound, so two dials pulling
 * on the same sector add up or cancel), and who comes out best and worst. Built from the simulated year's last frame.
 */
export function dialSummary(values: DialValues, frame: Frame | null, money: (usd: number) => string): { setup: string; overall: string; who: string } | null {
  const set = DIALS.filter((d) => values[d.key]);
  if (!set.length || !frame) return null;
  const setup = `${joinAnd(set.map((d, i) => (i ? lowerFirst(d.describe(values[d.key])) : d.describe(values[d.key]))))}.`;

  // Each sector's average share-price move across its tracked companies, and each shaded country.
  const bySector = new Map<string, number[]>();
  for (const c of frame.companies) if (c.company.sector) bySector.set(c.company.sector, [...(bySector.get(c.company.sector) ?? []), c.price]);
  const sectors = [...bySector]
    .map(([k, v]) => ({ k, p: v.reduce((n, x) => n + x, 0) / v.length }))
    .filter((x) => Math.abs(x.p) >= 0.01)
    .sort((a, b) => Math.abs(b.p) - Math.abs(a.p))
    .slice(0, 3)
    .map((x) => `${lowerFirst(SECTOR_WORD[x.k] ?? x.k)} ${x.p > 0 ? 'rise' : 'fall'} about ${pctText(x.p)}`);
  const places = frame.fills.slice(0, 2).map((f) => `business in ${region?.of(f.iso2) ?? f.iso2} ${f.pct > 0 ? 'grows' : 'shrinks'} about ${pctText(f.pct)}`);
  const parts = [...places, ...sectors];
  const overall = parts.length ? `Together: ${joinAnd(parts)}. ${frame.people.length} of the tracked fortunes move.` : 'Together, the dials cancel out: nothing tracked moves much.';

  const rel = (p: Mover) => (p.delta != null && p.person.net_worth_usd ? p.delta / p.person.net_worth_usd : (p.pct ?? 0));
  const amount = (p: Mover) => (p.delta != null ? money(Math.abs(p.delta)) : pctText(p.pct ?? 0));
  const sorted = [...frame.people].sort((a, b) => rel(b) - rel(a));
  const best = sorted[0] && rel(sorted[0]) > 0 ? sorted[0] : null;
  const worst = sorted.length && rel(sorted[sorted.length - 1]) < 0 ? sorted[sorted.length - 1] : null;
  const name = (p: Mover) => p.person.name.replace(/ & family$/, '');
  const likely = (p: Mover) => (p.range && hasWidth(p.range) ? `, likely ${spanText(p.range, p.delta != null ? money : null)}` : '');
  const who = [best && `${name(best)} comes out best (≈+${amount(best)}${likely(best)})`, worst && `${name(worst)} is hit hardest (≈−${amount(worst)}${likely(worst)})`].filter(Boolean).join('; ');
  return { setup, overall, who: who ? `${who}.` : '' };
}
