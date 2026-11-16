// Today's exposure (Rankings): across the day's storylines, the tracked people who would gain or lose the most of their
// fortune if one of them happened. Built from the daily briefing (same model, same ranges). It describes exposure to
// hypothetical events, not a forecast or a recommendation. Pure, so it can be tested.
import type { Scenario } from '../../supabase/functions/_shared/scenario.ts';
import type { BriefingItem } from './briefing.ts';
import { relative } from './guess.ts';
import type { PersonMove } from './simulate.ts';

export type Exposed = { move: PersonMove; scenario: Scenario; /** Share of fortune (or the company's move, without a stake). */ share: number };

/**
 * The `count` people most exposed each way. A person appears once per side, with the storyline that moves them most;
 * they can appear on both sides when one storyline helps them and another hurts.
 */
export function exposure(items: BriefingItem[], count = 3): { gain: Exposed[]; risk: Exposed[] } {
  const side = (up: boolean) => {
    const best = new Map<string, Exposed>();
    for (const item of items)
      for (const move of up ? item.winners : item.losers) {
        const share = relative(move);
        if (up ? share <= 0 : share >= 0) continue;
        const had = best.get(move.person.id);
        if (!had || Math.abs(share) > Math.abs(had.share)) best.set(move.person.id, { move, scenario: item.scenario, share });
      }
    return [...best.values()].sort((a, b) => Math.abs(b.share) - Math.abs(a.share)).slice(0, count);
  };
  return { gain: side(true), risk: side(false) };
}
