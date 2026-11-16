// Weekly log returns by ISO week from Yahoo Finance's public chart data (ten years of weekly closes, dividends and
// splits adjusted where Yahoo gives adjusted closes). Shared by the build scripts; a quarter-second pause between calls.
import { weeklyReturns } from '../supabase/functions/_shared/factors.ts';

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; Wealthline/1.0; +https://haseebahmad1521-alt.github.io/wealthline/)' };

export async function weekly(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1wk`, { headers: UA });
  await new Promise((r) => setTimeout(r, 250));
  if (!res.ok) return new Map();
  const r = (await res.json())?.chart?.result?.[0];
  const t = r?.timestamp ?? [];
  const c = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  return weeklyReturns(t.map((ts, i) => ({ t: ts, c: c[i] })).filter((b) => b.c != null));
}
