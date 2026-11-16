// The daily briefing: each of the day's storylines with who would gain and lose most among the tracked fortunes, from
// the same model as the films (analogs expanded, measured sensitivities, ranges). Pure, so it can be tested.
import type { Scenario } from '../../supabase/functions/_shared/scenario.ts';
import { expandAnalogs, type EventData } from './analogs.ts';
import { relative } from './guess.ts';
import { simulate, type PersonMove, type SimCountry, type SimEmpire } from './simulate.ts';

export type BriefingItem = { scenario: Scenario; winners: PersonMove[]; losers: PersonMove[]; moved: number };

/** For each storyline: the two biggest winners and losers at the end (by share of fortune, else share price). */
export function briefing(scenarios: Scenario[], empires: SimEmpire[], countries: SimCountry[], events: EventData | null, count = 2): BriefingItem[] {
  return scenarios.map((s) => {
    const expanded = expandAnalogs(s, events);
    const end = simulate(expanded, empires, countries, expanded.months);
    const ranked = end.people.map((p) => ({ p, r: relative(p) })).filter((x) => Math.abs(x.r) > 1e-4);
    const winners = ranked.filter((x) => x.r > 0).sort((a, b) => b.r - a.r).slice(0, count).map((x) => x.p);
    const losers = ranked.filter((x) => x.r < 0).sort((a, b) => a.r - b.r).slice(0, count).map((x) => x.p);
    return { scenario: s, winners, losers, moved: ranked.length };
  });
}
