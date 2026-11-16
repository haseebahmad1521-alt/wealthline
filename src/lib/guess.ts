// Guess before you play: a question about the scenario's outcome, asked before the film, answered by the end card.
// Answers come from the same calculation as the film. Points and the streak stay on this device.
import type { Scenario } from '../../supabase/functions/_shared/scenario.ts';
import type { Frame, PersonMove, SimPerson } from './simulate.ts';

export type Guess = { question: 'gain' | 'loss' | 'money-gain' | 'money-loss'; options: SimPerson[]; answer: string /* person id */ };
export type Score = { points: number; streak: number; best: number; played: number; right: number; challenge: string | null /* last challenge day played */ };
export const EMPTY_SCORE: Score = { points: 0, streak: 0, best: 0, played: 0, right: 0, challenge: null };

/** A change people can compare across fortunes: share of fortune with a recorded stake, else the company's move. */
export function relative(p: PersonMove): number {
  return p.delta != null && p.person.net_worth_usd ? p.delta / p.person.net_worth_usd : (p.pct ?? 0);
}

// A small seeded shuffle, so the same scenario always offers the options in the same order.
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 1e6) / 1e6;
}

/**
 * Who gains the most, or who is hit hardest when that has the clearer answer, with three others to choose from. A
 * near-tie at the top (a sector move gives many people the same change) is skipped: the answer would be a coin toss.
 */
export function makeGuess(scenarioId: string, final: Frame | null): Guess | null {
  if (!final) return null;
  const moved = final.people.map((p) => ({ p, r: relative(p) })).filter((x) => Math.abs(x.r) > 1e-6);
  const ups = moved.filter((x) => x.r > 0).sort((a, b) => b.r - a.r);
  const downs = moved.filter((x) => x.r < 0).sort((a, b) => a.r - b.r);
  // Clear: the leader's likely range (80%) still beats the runner-up's estimate, so a right answer isn't luck.
  const span = (p: PersonMove): [number, number] => {
    if (!p.range) return [relative(p), relative(p)];
    return p.delta != null && p.person.net_worth_usd ? [p.range[0] / p.person.net_worth_usd, p.range[1] / p.person.net_worth_usd] : p.range;
  };
  const clear = (list: typeof moved) => {
    if (!list.length) return false;
    if (!list[1]) return true;
    const lead = span(list[0].p);
    const up = list[0].r > 0;
    const margin = up ? lead[0] - list[1].r : list[1].r - lead[1];
    return Math.abs(list[1].r - list[0].r) >= 0.0015 && margin > 0;
  };
  // Then dollars, among people with a recorded stake: their amounts rarely tie.
  const money = moved.filter((x) => x.p.delta != null).map((x) => ({ p: x.p, r: x.p.delta! }));
  const lost = money.filter((x) => x.r < 0).sort((a, b) => a.r - b.r);
  const won = money.filter((x) => x.r > 0).sort((a, b) => b.r - a.r);
  const dollars = (list: typeof money) => list.length > 0 && (!list[1] || Math.abs(list[1].r - list[0].r) >= 1e8);
  const question: Guess['question'] | null = clear(ups) ? 'gain' : clear(downs) ? 'loss' : dollars(lost) && lost.length + won.length >= 3 ? 'money-loss' : dollars(won) && won.length + lost.length >= 3 ? 'money-gain' : null;
  if (!question) return null;
  const ranked = question === 'gain' ? ups : question === 'loss' ? downs : question === 'money-loss' ? lost : won;
  const rest = question === 'gain' ? downs : question === 'loss' ? ups : question === 'money-loss' ? won : lost;
  const answer = ranked[0];
  const others = [...ranked.slice(1), ...rest].slice(0, 3).map((x) => x.p.person);
  if (others.length < 2) return null;
  const rand = seeded(scenarioId);
  const options = [answer.p.person, ...others].map((p) => ({ p, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.p);
  return { question, options, answer: answer.p.person.id };
}

/** The score after one answer; the day's challenge counts double. */
export function scored(prev: Score, right: boolean, challengeDay: string | null): Score {
  const streak = right ? prev.streak + 1 : 0;
  return {
    points: prev.points + (right ? (challengeDay ? 20 : 10) : 0),
    streak,
    best: Math.max(prev.best, streak),
    played: prev.played + 1,
    right: prev.right + (right ? 1 : 0),
    challenge: challengeDay ?? prev.challenge,
  };
}

/** Today's challenge: Grok's most plausible scenario of the day, else a built-in one that changes each day. */
export function dailyChallenge(scenarios: Scenario[], day: string): Scenario | null {
  const daily = scenarios.find((s) => s.origin === 'daily');
  if (daily) return daily;
  const pool = scenarios.filter((s) => s.origin === 'example');
  if (!pool.length) return null;
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 864e5);
  return pool[n % pool.length];
}
