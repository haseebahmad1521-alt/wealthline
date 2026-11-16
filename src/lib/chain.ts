// "…and then?": a scenario continued for another year from where it ended. Everything that happened stays; the
// follow-up's changes start when the first part ends. The follow-ups' sizes are stated assumptions, like the dials'.
import type { Scenario, Shock } from '../../supabase/functions/_shared/scenario.ts';

export type FollowUp = { key: string; label: string; rule: string; shocks: Shock[] };

const year = { from: 0, to: 6 };
export const FOLLOW_UPS: FollowUp[] = [
  { key: 'recover', label: 'Markets recover', rule: 'Listed shares rise by a tenth over six months.', shocks: [{ kind: 'market', target: '', pct: 0.1, ...year }] },
  {
    key: 'oil',
    label: 'The oil price doubles',
    rule: 'Brent oil doubles; companies move by how their shares have followed oil since 2023.',
    shocks: [{ kind: 'factor', target: 'oil', pct: 1, ...year }],
  },
  {
    key: 'china',
    label: 'China hits back',
    rule: 'Business in China falls by a third and Chinese stocks by a fifth.',
    shocks: [
      { kind: 'place', target: 'CN', pct: -0.3, ...year },
      { kind: 'factor', target: 'china', pct: -0.2, ...year },
    ],
  },
  {
    key: 'recession',
    label: 'A US recession follows',
    rule: 'Business in the US falls by a twentieth; global stocks by a tenth.',
    shocks: [
      { kind: 'place', target: 'US', pct: -0.05, ...year },
      { kind: 'market', target: '', pct: -0.1, ...year },
    ],
  },
];

/** The scenario carried on by one more year with the follow-up starting where it ended. */
export function chain(prev: Scenario, next: FollowUp): Scenario {
  const at = prev.months;
  const shift = (s: Shock): Shock => ({ ...s, from: s.from + at, to: s.to + at });
  return {
    ...prev,
    id: `${prev.id}>${next.key}`,
    title: `${prev.title.replace(/\.$/, '')}, then ${next.label.charAt(0).toLowerCase()}${next.label.slice(1)}.`,
    months: Math.min(at + 12, 36),
    shocks: [...prev.shocks, ...next.shocks.map(shift)],
    beats: [...(prev.beats ?? []), { month: at, text: next.label, tone: next.shocks.some((s) => s.pct < 0) ? 'loss' : 'gain' }],
    assumptions: [...prev.assumptions, `Then: ${next.rule}`],
  };
}
