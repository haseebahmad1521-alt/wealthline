// Pure helpers for saved views: validate stored params and sort people. No React Native imports (unit-tested).
export type ViewTarget = 'people' | 'projects';
export const peopleSorts = ['rank', 'name', 'change'] as const;
export type PeopleSort = (typeof peopleSorts)[number];
export const projectStatuses = ['all', 'new', 'upcoming'] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export type PeopleParams = { q: string; sort: PeopleSort };
export type ProjectParams = { status: ProjectStatus };

const obj = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

/** Unknown keys are ignored and invalid values fall back to defaults. */
export function parsePeopleParams(raw: unknown): PeopleParams {
  const r = obj(raw);
  return {
    q: typeof r.q === 'string' ? r.q.slice(0, 100) : '',
    sort: peopleSorts.find((s) => s === r.sort) ?? 'rank',
  };
}

export function parseProjectParams(raw: unknown): ProjectParams {
  return { status: projectStatuses.find((s) => s === obj(raw).status) ?? 'all' };
}

export const parseParams = (target: ViewTarget, raw: unknown) =>
  target === 'people' ? parsePeopleParams(raw) : parseProjectParams(raw);

export const sortLabels: Record<PeopleSort, string> = { name: 'Name', rank: 'Rank', change: 'Change' };

export function suggestName(target: ViewTarget, params: PeopleParams | ProjectParams): string {
  if (target === 'projects') {
    const s = (params as ProjectParams).status;
    return s === 'all' ? 'All projects' : s === 'new' ? 'New projects' : 'Upcoming projects';
  }
  const p = params as PeopleParams;
  const q = p.q.trim();
  return (q ? `${q}, ` : 'People, ') + `by ${sortLabels[p.sort].toLowerCase()}`;
}

type Sortable = {
  name: string;
  rank: number | null;
  net_worth_usd: number | null;
  prev_net_worth_usd: number | null;
};

const changeOf = (p: Sortable) =>
  p.net_worth_usd != null && p.prev_net_worth_usd ? (p.net_worth_usd - p.prev_net_worth_usd) / p.prev_net_worth_usd : null;

/** Name A-Z, rank 1 first, or change since the previous estimate (largest gain first). People without data go last. */
export function sortPeople<T extends Sortable>(people: readonly T[], sort: PeopleSort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const nullsLast = (x: number | null, y: number | null, dir: 1 | -1) =>
    x == null ? (y == null ? 0 : 1) : y == null ? -1 : dir * (x - y);
  return [...people].sort((a, b) => {
    if (sort === 'rank') return nullsLast(a.rank, b.rank, 1) || byName(a, b);
    if (sort === 'change') return nullsLast(changeOf(a), changeOf(b), -1) || byName(a, b);
    return byName(a, b);
  });
}
