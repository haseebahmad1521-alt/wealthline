// One xAI (Grok) call for the server functions (owner, Nov 3, 2026: Grok/xAI replaces Anthropic). Every call shares
// the monthly ceiling in `xai_spend` (XAI_MONTHLY_USD, default $20): background jobs stop at DATA_SHARE of it so chat
// always has room. The key stays in the function's environment.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { syndicationToken, xaiCostMicros, type XaiUsage } from './recent.ts';

export const DATA_SHARE = 0.7;

export function xaiKey(): string | null {
  const k = Deno.env.get('XAI_API_KEY')?.trim();
  return k && /^[\x21-\x7e]+$/.test(k) ? k : null;
}

export function ceilingMicros(share = 1): number {
  return Math.round((Number(Deno.env.get('XAI_MONTHLY_USD') ?? '') || 20) * 1e6 * share);
}

/** Reserves `estimate` under the (shared) ceiling; returns a settle function, or null when over. */
export async function reserve(db: SupabaseClient, estimate: number, share = DATA_SHARE) {
  const took = await db.rpc('take_xai_budget', { p_limit: ceilingMicros(share), p_estimate: estimate });
  if (took.error) throw new Error(took.error.message);
  if (took.data !== true) return null;
  return (actual: number) => db.rpc('settle_xai_spend', { p_delta: actual - estimate });
}

export type Turn = { role: 'user' | 'assistant'; content: string };
type Opts = {
  key: string;
  model: string;
  /** Several parts go in order: shared ones first, so xAI's prefix cache is reused across calls. */
  system: string | string[];
  /** One user message, or a conversation. */
  input: string | Turn[];
  maxTokens: number;
  schema?: Record<string, unknown>;
  /** Routes related calls (one chat thread) to the same cache (xAI's `x-grok-conv-id`). */
  convId?: string;
};

/** A plain (tool-free) Responses call: the text out and its cost in micro-dollars. */
export async function xaiText({ key, model, system, input, maxTokens, schema, convId }: Opts) {
  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...(convId ? { 'x-grok-conv-id': convId } : {}) },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: maxTokens,
      reasoning: { effort: 'low' },
      ...(schema ? { text: { format: { type: 'json_schema', name: 'out', schema, strict: true } } } : {}),
      input: [
        ...[system].flat().map((content) => ({ role: 'system', content })),
        ...(typeof input === 'string' ? [{ role: 'user', content: input }] : input),
      ],
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`xAI ${res.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  const output = (body.output ?? []) as { content?: { type: string; text?: string }[] }[];
  const text = output.flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text ?? '').join('');
  return { text, cost: xaiCostMicros(model, body.usage as XaiUsage, 0), status: body.status as string | undefined };
}

const UA = { 'User-Agent': 'WealthlineBot/1.0 (+https://haseebahmad1521-alt.github.io/wealthline/)' };

/** A post as X serves it to its own embed widget (text word for word, author, time), or null if X doesn't return it. */
export async function xEmbed(id: string): Promise<{ text: string; handle: string; posted_at: string | null } | null> {
  try {
    const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${syndicationToken(id)}&lang=en`, {
      headers: UA,
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const t = await r.json();
    const handle = String(t?.user?.screen_name ?? '');
    if (typeof t?.text !== 'string' || !handle) return null;
    return { text: t.text as string, handle, posted_at: t.created_at ? new Date(t.created_at).toISOString() : null };
  } catch {
    return null;
  }
}
