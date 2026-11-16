// Prediction-market odds for the World briefing, from Polymarket's public market data (no key). The backend offers
// Grok the most-traded open markets and keeps a match only if the market is in that list; the app refreshes the odds
// live. The probability is the market's own "Yes" price, never Grok's estimate. No imports: Deno and the app share it.

export const GAMMA = 'https://gamma-api.polymarket.com';

export type Market = { id: string; question: string; yes: number; slug: string; volume: number; ends: string | null };
/** Odds attached to a scenario: what the market asks, its probability then, and where to see it. */
export type Odds = { market: string; question: string; yes: number; url: string; as_of: string };

/** Open Yes/No markets from Gamma's /markets response; others (multi-outcome, closed, unpriced) are left out. */
export function parseMarkets(body: unknown): Market[] {
  if (!Array.isArray(body)) return [];
  const out: Market[] = [];
  for (const m of body as Record<string, unknown>[]) {
    try {
      const outcomes = JSON.parse(String(m.outcomes ?? '[]'));
      const prices = JSON.parse(String(m.outcomePrices ?? '[]')).map(Number);
      if (m.closed || outcomes[0] !== 'Yes' || outcomes.length !== 2 || !(prices[0] >= 0 && prices[0] <= 1)) continue;
      out.push({
        id: String(m.id),
        question: String(m.question ?? '').slice(0, 200),
        yes: prices[0],
        slug: String(m.slug ?? ''),
        volume: Number(m.volume ?? m.volumeNum ?? 0) || 0,
        ends: typeof m.endDate === 'string' ? m.endDate : null,
      });
    } catch {
      /* a malformed market is skipped */
    }
  }
  return out;
}

export const marketUrl = (slug: string) => `https://polymarket.com/market/${encodeURIComponent(slug)}`;

/** The odds for a market Grok picked, only when it's one we offered. */
export function oddsFor(id: unknown, offered: Map<string, Market>, now: Date): Odds | null {
  const m = typeof id === 'string' ? offered.get(id) : undefined;
  return m ? { market: m.id, question: m.question, yes: m.yes, url: marketUrl(m.slug), as_of: now.toISOString() } : null;
}

/** A compact list for the prompt: "id | question | Yes 23%". */
export function marketList(markets: Market[]): string {
  return markets.map((m) => `${m.id} | ${m.question} | Yes ${Math.round(m.yes * 100)}%`).join('\n');
}
