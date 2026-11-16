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
  shocks: (v: number) => Shock[];
};

const ramp = { from: 0, to: 6 };
const sector = (target: Extract<Shock, { kind: 'sector' }>['target'], pct: number): Shock => ({ kind: 'sector', target, pct, ...ramp });

export const DIALS: Dial[] = [
  {
    key: 'oil',
    label: 'Oil price',
    min: -50,
    max: 100,
    rule: 'Energy shares move by about a third of the oil move; transport moves a fifth the other way.',
    shocks: (v) => [sector('energy', v * 0.35), sector('transport', -v * 0.2)],
  },
  {
    key: 'ai',
    label: 'AI boom',
    min: -50,
    max: 100,
    rule: 'Tech shares move by half the dial.',
    shocks: (v) => [sector('technology', v * 0.5)],
  },
  {
    key: 'china',
    label: 'Trade with China',
    min: -100,
    max: 50,
    rule: 'Business in China moves by half the dial; tech shares by a tenth.',
    shocks: (v) => [{ kind: 'place', target: 'CN', pct: v * 0.5, ...ramp }, sector('technology', v * 0.1)],
  },
  {
    key: 'us',
    label: 'US economy',
    min: -30,
    max: 20,
    rule: 'Business in the US moves by the dial; all listed shares by half of it.',
    shocks: (v) => [{ kind: 'place', target: 'US', pct: v, ...ramp }, { kind: 'market', target: '', pct: v * 0.5, ...ramp }],
  },
  {
    key: 'luxury',
    label: 'Luxury spending',
    min: -50,
    max: 50,
    rule: 'Consumer shares move by four tenths of the dial.',
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
