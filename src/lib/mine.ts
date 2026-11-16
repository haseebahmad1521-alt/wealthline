// "You": what the person playing owns in tracked companies, kept on this device only (never sent anywhere), and what a
// simulation would do to it. The move is the same share-price move the simulation gives the company.
import type { Frame } from './simulate.ts';

export type Holding = { company: string /* company id */; usd: number };
export const MINE_KEY = 'wl.sim.mine';

/** Cleans what was stored: known shape, positive amounts, one entry per company. */
export function readMine(raw: string | null): Holding[] {
  try {
    const list = JSON.parse(raw ?? '[]');
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    return list
      .filter((h) => typeof h?.company === 'string' && typeof h?.usd === 'number' && Number.isFinite(h.usd) && h.usd > 0 && h.usd < 1e10)
      .filter((h) => !seen.has(h.company) && seen.add(h.company))
      .slice(0, 20)
      .map((h) => ({ company: h.company, usd: Math.round(h.usd) }));
  } catch {
    return [];
  }
}

/** What the holdings would be worth more or less at this frame, in dollars and as a share of the total. */
export function myChange(frame: Frame | null, mine: Holding[]): { delta: number; pct: number; total: number } | null {
  if (!frame || !mine.length) return null;
  const move = new Map(frame.companies.map((c) => [c.company.id, c.price]));
  const total = mine.reduce((n, h) => n + h.usd, 0);
  const delta = mine.reduce((n, h) => n + h.usd * (move.get(h.company) ?? 0), 0);
  return { delta, pct: total ? delta / total : 0, total };
}
