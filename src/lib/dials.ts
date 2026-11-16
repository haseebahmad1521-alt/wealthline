// The dials sandbox: big forces as sliders. Each dial maps to scenario changes by a stated rule (shown with it), so the
// player sets the size and `simulate` does the arithmetic on recorded values. Nothing here is a forecast.
import type { Scenario, Shock } from '../../supabase/functions/_shared/scenario.ts';

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
  const words: [number, string][] = [[5, 'a twentieth'], [10, 'a tenth'], [20, 'a fifth'], [25, 'a quarter'], [33, 'a third'], [50, 'half'], [67, 'two thirds'], [75, 'three quarters'], [100, 'all of it']];
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
    rule: 'Energy shares move by about a third of the oil move; transport moves a fifth the other way.',
    describe: (v) => (v >= 95 ? 'The oil price doubles' : by(v, 'The oil price goes up', 'The oil price falls')),
    shocks: (v) => [sector('energy', v * 0.35), sector('transport', -v * 0.2)],
  },
  {
    key: 'ai',
    label: 'AI boom',
    min: -50,
    max: 100,
    rule: 'Tech shares move by half the dial.',
    describe: (v) => (v >= 95 ? 'Spending on AI doubles' : v > 0 ? by(v, 'Spending on AI grows', '') : `The AI bubble deflates: spending falls by ${share(v)}`),
    shocks: (v) => [sector('technology', v * 0.5)],
  },
  {
    key: 'china',
    label: 'Trade with China',
    min: -100,
    max: 50,
    rule: 'Business in China moves by half the dial; tech shares by a tenth.',
    describe: (v) => (v <= -95 ? 'Trade with China is cut off' : by(v, 'Trade with China grows', 'Trade with China is cut')),
    shocks: (v) => [{ kind: 'place', target: 'CN', pct: v * 0.5, ...ramp }, sector('technology', v * 0.1)],
  },
  {
    key: 'us',
    label: 'US economy',
    min: -30,
    max: 20,
    rule: 'Business in the US moves by the dial; all listed shares by half of it.',
    describe: (v) => (v < 0 ? `The US economy shrinks by ${share(v)}: ${v <= -15 ? 'a depression' : v <= -5 ? 'a recession' : 'a slowdown'}` : `The US economy grows by ${share(v)}: ${v >= 5 ? 'a boom' : 'faster growth'}`),
    shocks: (v) => [{ kind: 'place', target: 'US', pct: v, ...ramp }, { kind: 'market', target: '', pct: v * 0.5, ...ramp }],
  },
  {
    key: 'luxury',
    label: 'Luxury spending',
    min: -50,
    max: 50,
    rule: 'Consumer shares move by four tenths of the dial.',
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
  energy: 'Energy companies', transport: 'Transport companies', technology: 'Tech companies', consumer: 'Consumer brands',
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
      return `${SECTOR_WORD[s.target] ?? s.target}${some} ${pctWord(s.pct)}.`;
    }
    if (s.kind === 'place') return `Business done in ${region?.of(s.target) ?? s.target} ${s.pct > 0 ? 'grows' : 'shrinks'} about ${Math.round(Math.abs(s.pct) * 100)}%.`;
    if (s.kind === 'market') return `All listed shares ${pctWord(s.pct)}.`;
    return '';
  }).filter(Boolean);
}
