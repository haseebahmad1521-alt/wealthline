// Projects page layer: podium, headlines that name a project, and recorded wealth moves of the people building them.
// Derived from recorded rows only. A wealth move is never attributed to a project; it is the owner's recorded change.
type Owner = { id: string; rank: number | null; net_worth_usd: number | null; prev_net_worth_usd: number | null };
type Proj = { id: string; person_id: string; title: string; announced_date: string };
type Headline = { id: string; person_id: string | null; title: string };

/**
 * Top three projects: each owner's latest project, ordered by the owner's rank (default until the owner chooses
 * another order). One project per person so the podium shows three different builders.
 */
export function podiumProjects<P extends Proj, O extends Owner>(projects: P[], owners: Map<string, O>, count = 3): { project: P; owner: O }[] {
  const latest = new Map<string, P>();
  for (const p of projects) {
    const had = latest.get(p.person_id);
    if (!had || p.announced_date > had.announced_date) latest.set(p.person_id, p);
  }
  return [...latest.values()]
    .map((project) => ({ project, owner: owners.get(project.person_id) }))
    .filter((x): x is { project: P; owner: O } => x.owner?.rank != null)
    .sort((a, b) => a.owner.rank! - b.owner.rank!)
    .slice(0, count);
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Headlines about a project's owner whose title names that project (case-insensitive, whole title). */
export function projectHeadlines<H extends Headline, P extends Proj>(news: H[], projects: P[]): { item: H; project: P }[] {
  const out: { item: H; project: P }[] = [];
  for (const item of news) {
    const title = norm(item.title);
    const project = projects.find((p) => p.person_id === item.person_id && norm(p.title).length >= 3 && title.includes(norm(p.title)));
    if (project) out.push({ item, project });
  }
  return out;
}

/** Owners of at least one project with a recorded change since their previous value, largest move first. */
export function builderMoves<O extends Owner>(projects: Proj[], owners: Map<string, O>, count = 5): { owner: O; delta: number; base: number }[] {
  const ids = new Set(projects.map((p) => p.person_id));
  return [...ids]
    .map((id) => owners.get(id))
    .filter((o): o is O => o != null && o.net_worth_usd != null && o.prev_net_worth_usd != null && o.prev_net_worth_usd > 0)
    .map((owner) => ({ owner, delta: owner.net_worth_usd! - owner.prev_net_worth_usd!, base: owner.prev_net_worth_usd! }))
    .filter((m) => m.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, count);
}
