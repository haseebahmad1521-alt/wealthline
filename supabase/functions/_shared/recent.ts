// Batch K3 helpers (owner, Nov 3, 2026): scheduling, cost and trust checks for the Grok-fed `recent` function.
// Plain TypeScript with no runtime imports so the app's tests can cover it.

const HOUR = 36e5;
const DAY = 24 * HOUR;
/** Top-ranked people are checked daily, everyone else weekly; busy people sooner, quiet people back off. */
export const TOP_RANK = 10;
export const MAX_GAP = 7 * DAY;
/** Never look further back than this, even on a first fetch. */
export const BACKFILL_DAYS = 30;

/** When to look again: base by rank, halved after a busy run (≥3 new items, not under 12 h), ×2 per quiet run. */
export function nextDue(now: number, rank: number | null, found: number, quietRuns: number): number {
  const base = rank != null && rank <= TOP_RANK ? DAY : MAX_GAP;
  if (found >= 3) return now + Math.max(base / 2, 12 * HOUR);
  if (found > 0) return now + base;
  return now + Math.min(base * 2 ** Math.min(quietRuns + 1, 8), MAX_GAP);
}

/** Search from the day of the last fetch (overlap of a day is fine: rows are unique), at most BACKFILL_DAYS back. */
export function fromDate(now: number, lastFetched: number | null): string {
  const floor = now - BACKFILL_DAYS * DAY;
  return new Date(Math.max(lastFetched ?? floor, floor)).toISOString().slice(0, 10);
}

/** The status id when `url` is a post by `handle` on X, else null. */
export function xPostId(url: string, handle: string): string | null {
  const m = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/.exec(url);
  return m && m[1].toLowerCase() === handle.toLowerCase() ? m[2] : null;
}

/** Token X's own embed widget sends to cdn.syndication.twimg.com/tweet-result (the formula react-tweet uses). */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

/** Same URL for comparison: no fragment, no trailing slash, x.com for twitter.com. */
export function sameUrl(u: string): string {
  return u.trim().replace(/#.*$/, '').replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?twitter\.com\//, 'https://x.com/').replace(/^http:/, 'https:').toLowerCase();
}

// $ per million tokens (docs.x.ai/docs/models, Nov 2026); search tool calls $5 per 1,000.
const PRICE: Record<string, { input: number; cached: number; output: number }> = {
  'grok-4.3': { input: 1.25, cached: 0.2, output: 2.5 },
  'grok-4.7': { input: 2, cached: 0.5, output: 6 },
};
export const TOOL_CALL_MICROS = 5_000;

export type XaiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  cost_in_usd_ticks?: number;
};

/** Micro-dollars for one response: our own count, or xAI's reported cost when that's higher (1 tick = 1e-10 USD). */
export function xaiCostMicros(model: string, u: XaiUsage | undefined, toolCalls: number): number {
  const p = PRICE[model] ?? PRICE['grok-4.7'];
  const cached = u?.input_tokens_details?.cached_tokens ?? 0;
  const ours = ((u?.input_tokens ?? 0) - cached) * p.input + cached * p.cached + (u?.output_tokens ?? 0) * p.output + toolCalls * TOOL_CALL_MICROS;
  const theirs = (u?.cost_in_usd_ticks ?? 0) / 1e4;
  return Math.round(Math.max(ours, theirs));
}

/** The status id of any X post link, with or without the handle (Grok cites `x.com/i/status/<id>`). */
export function statusId(url: string): string | null {
  return /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:[A-Za-z0-9_]{1,15}|i(?:\/web)?)\/status\/(\d{5,25})(?:[/?#].*)?$/.exec(url.trim())?.[1] ?? null;
}
