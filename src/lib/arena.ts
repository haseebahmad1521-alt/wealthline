// Game layer for Rankings: rank moves, overtakes, close races and the day's movers. Everything is derived from two
// recorded values per person (latest and the one before it, at least 20 hours older); nothing is projected.
export type Contender = { id: string; name: string; net_worth_usd: number | null; prev_net_worth_usd: number | null };

const ranked = <T extends Contender>(people: T[], key: 'net_worth_usd' | 'prev_net_worth_usd') =>
  people.filter((p) => p[key] != null).sort((a, b) => (b[key] as number) - (a[key] as number) || a.name.localeCompare(b.name));

/** Places gained (+) or lost (−) since the previous values, for people with both values. */
export function rankMoves<T extends Contender>(people: T[]): Map<string, number> {
  const now = ranked(people, 'net_worth_usd');
  const before = new Map(ranked(people.filter((p) => p.net_worth_usd != null), 'prev_net_worth_usd').map((p, i) => [p.id, i + 1]));
  const out = new Map<string, number>();
  now.forEach((p, i) => {
    const was = before.get(p.id);
    if (was != null && p.prev_net_worth_usd != null) out.set(p.id, was - (i + 1));
  });
  return out;
}

export type Overtake<T> = { winner: T; passed: T; gap: number };

/** Pairs whose order flipped: winner now ranks above the person they were behind. Top `limit` ranks only. */
export function overtakes<T extends Contender>(people: T[], limit = 50): Overtake<T>[] {
  const now = ranked(people, 'net_worth_usd').filter((p) => p.prev_net_worth_usd != null).slice(0, limit);
  const out: Overtake<T>[] = [];
  for (let i = 0; i < now.length; i++) {
    for (let j = i + 1; j < now.length; j++) {
      const a = now[i];
      const b = now[j];
      if ((a.prev_net_worth_usd as number) < (b.prev_net_worth_usd as number)) out.push({ winner: a, passed: b, gap: (a.net_worth_usd as number) - (b.net_worth_usd as number) });
    }
  }
  return out;
}

export type Race<T> = { leader: T; chaser: T; rank: number; gap: number; share: number };

/** Neighbours with the smallest gap relative to their size, among the top `limit` ranks. */
export function closestRaces<T extends Contender>(people: T[], count = 3, limit = 30): Race<T>[] {
  const now = ranked(people, 'net_worth_usd').slice(0, limit);
  const races: Race<T>[] = [];
  for (let i = 0; i + 1 < now.length; i++) {
    const leader = now[i];
    const chaser = now[i + 1];
    const a = leader.net_worth_usd as number;
    const b = chaser.net_worth_usd as number;
    races.push({ leader, chaser, rank: i + 1, gap: a - b, share: a / (a + b) });
  }
  return races.sort((x, y) => x.gap / (x.leader.net_worth_usd as number) - y.gap / (y.leader.net_worth_usd as number)).slice(0, count);
}

export type Mover<T> = { person: T; delta: number; base: number };

/** The biggest gain and the biggest loss in dollars since the previous values (null when nobody moved that way). */
export function topMovers<T extends Contender>(people: T[]): { up: Mover<T> | null; down: Mover<T> | null } {
  const moves = people
    .filter((p) => p.net_worth_usd != null && p.prev_net_worth_usd != null && p.prev_net_worth_usd > 0)
    .map((p) => ({ person: p, delta: (p.net_worth_usd as number) - (p.prev_net_worth_usd as number), base: p.prev_net_worth_usd as number }));
  const up = moves.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta)[0] ?? null;
  const down = moves.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta)[0] ?? null;
  return { up, down };
}
