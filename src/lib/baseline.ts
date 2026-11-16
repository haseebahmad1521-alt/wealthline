// The headline change compares a person's latest value with their latest one at least 20 hours older
// (person_summary). That earlier value can come from a different method: a yearly list estimate before the person
// joined the real-time feed. A change of method isn't a market move (Marc Andreessen read "+876% since Mar 10": the
// March list estimate against the real-time feed's figure), so a baseline of another kind is dropped and no change is
// shown until there's an earlier value of the same kind.

/** Baselines older than this are checked; within it the feed is continuous, so the kind can't have switched. */
export const CHECK_AFTER_MS = 2 * 86400_000;

type Comparable = { id: string; kind: string | null; as_of: string | null; prev_as_of: string | null; prev_net_worth_usd: number | null };

/** People whose baseline needs its kind checked. */
export function toCheck<T extends Comparable>(people: T[]): T[] {
  return people.filter((p) => p.prev_as_of && p.as_of && new Date(p.as_of).getTime() - new Date(p.prev_as_of).getTime() > CHECK_AFTER_MS);
}

/** Drops a baseline whose kind differs from the latest value's. `kindOf` gives a baseline's kind (person id, time). */
export function sameKindOnly<T extends Comparable>(people: T[], kindOf: (id: string, asOf: string) => string | undefined): T[] {
  const checked = new Set(toCheck(people).map((p) => p.id));
  return people.map((p) => {
    if (!checked.has(p.id)) return p;
    const was = kindOf(p.id, p.prev_as_of!);
    return was && was !== p.kind ? { ...p, prev_net_worth_usd: null, prev_as_of: null } : p;
  });
}
