// Which planet texture tier a device gets (owner, Nov 2, 2026): start where the screen needs it, step up while the
// scene runs smoothly, step back once (and stop) if it slows down. Pure, so the rules are testable.

export const TIERS = ['2k', '4k', '8k'] as const;
export type Tier = (typeof TIERS)[number];

/** Frame time (ms, smoothed) below which a step up is safe, and above which the last step up is undone. */
export const SMOOTH_MS = 18.5;
export const SLOW_MS = 26;

/** First tier: 4K when the screen has the pixels for it, else 2K. */
export const startTier = (screenPx: number) => (screenPx > 1800 ? 1 : 0);

/**
 * Highest tier this device may reach. Save-Data or a slow connection: never above the start. 8K needs a GPU that
 * takes 8192-px textures, a non-phone screen, and (where the browser says) at least 8 GB of memory.
 */
export function maxTier(o: { start: number; maxTexture: number; phone: boolean; deviceMemory?: number; saveData?: boolean; effectiveType?: string }) {
  if (o.saveData || /2g|3g/.test(o.effectiveType ?? '')) return o.start;
  if (o.maxTexture >= 8192 && !o.phone && (o.deviceMemory ?? 8) >= 8) return 2;
  return Math.max(o.start, o.maxTexture >= 4096 ? 1 : 0);
}

/** 'up' to load the next tier, 'down' to undo the last step up, or null to stay. */
export function nextStep(o: { frameMs: number; tier: number; start: number; max: number; settled: boolean }): 'up' | 'down' | null {
  if (o.frameMs > SLOW_MS && o.tier > o.start) return 'down';
  if (o.frameMs < SMOOTH_MS && o.tier < o.max && !o.settled) return 'up';
  return null;
}
