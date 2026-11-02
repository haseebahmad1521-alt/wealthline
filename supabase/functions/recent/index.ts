// Recent X posts per person from Grok (batch K3; owner, Nov 3, 2026). Grok's x_search finds what they posted since
// the last fetch; nothing Grok writes is stored. Trust boundary: a post is kept only if Grok cited it and X's own
// embed endpoint returns it by that handle; the stored text is X's, word for word.
// News stays with the free refresh pipeline (GDELT/Google News/RSS): a Nov 3 test showed web_search adding cost but
// only topic pages. Only people with an X account are asked.
// Spend: xAI bills tokens plus each X post fetched (≈$0.005), so one call per person per visit, at most MAX_POSTS
// posts, low reasoning effort, a few people per run, and a hard monthly ceiling (XAI_MONTHLY_USD, default $20)
// reserved before each call. Invoked by the cron (CRON_SECRET); `?person=<slug>` runs one person on demand
// (`&debug=1` adds why items were dropped and xAI's usage). Without XAI_API_KEY it does nothing.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { fromDate, nextDue, statusId, xaiCostMicros, xPostId, type XaiUsage } from '../_shared/recent.ts';
import { cors, json } from '../_shared/util.ts';
import { ceilingMicros, DATA_SHARE, xEmbed } from '../_shared/xai.ts';

const MODEL = Deno.env.get('XAI_MODEL') ?? 'grok-4.3';
const PER_RUN = 3;
const ESTIMATE = 50_000; // $0.05 reserved per call, corrected to xAI's reported cost after it
const MAX_POSTS = 5;

type Person = { id: string; slug: string; name: string; forbes_rank: number | null; social: { platform?: string; handle?: string } | null };

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['posts'],
  properties: {
    posts: {
      type: 'array',
      description: 'Their own X posts in the window, most notable first.',
      items: { type: 'object', additionalProperties: false, required: ['url'], properties: { url: { type: 'string' } } },
    },
  },
};

async function askGrok(key: string, handle: string, from: string) {
  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: MODEL,
      store: false,
      max_output_tokens: 800,
      reasoning: { effort: 'low' },
      max_tool_calls: 1,
      tools: [{ type: 'x_search', allowed_x_handles: [handle], from_date: from }],
      text: { format: { type: 'json_schema', name: 'recent', schema, strict: true } },
      input: [
        {
          role: 'system',
          content: 'You list post links; you never summarise or invent. Return only posts your search found in this request. Skip replies and reposts of others.',
        },
        { role: 'user', content: `Up to ${MAX_POSTS} of the most notable original posts by @${handle} on X since ${from}. If there are none, return an empty list.` },
      ],
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`xAI ${res.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  const output = (body.output ?? []) as { type: string; content?: { type: string; text?: string; annotations?: { url?: string }[] }[] }[];
  const parts = output.flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text');
  // Cited posts by status id: Grok cites `x.com/i/status/<id>`, without the handle.
  const cited = new Set(
    [
      ...((body.citations ?? []) as unknown[]).map((c) => (typeof c === 'string' ? c : (c as { url?: string })?.url ?? '')),
      ...parts.flatMap((c) => (c.annotations ?? []).map((a) => a.url ?? '')),
    ].map(statusId).filter((x): x is string => !!x),
  );
  const toolCalls = output.filter((o) => o.type.endsWith('_call')).length;
  let found: { posts?: { url?: unknown }[] } = {};
  try {
    found = JSON.parse(parts.map((c) => c.text ?? '').join(''));
  } catch { /* nothing usable */ }
  return { found, cited, cost: xaiCostMicros(MODEL, body.usage as XaiUsage, toolCalls), usage: body.usage };
}

/** The post as X serves it to its own embed widget, or null if it isn't there / isn't by `handle`. */
async function xPost(id: string, handle: string) {
  const t = await xEmbed(id);
  return t && t.handle.toLowerCase() === handle.toLowerCase() ? { text: t.text, posted_at: t.posted_at } : null;
}

const xHandle = (p: Person) => (p.social?.platform === 'x' && p.social.handle ? p.social.handle : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden.' }, 403);
  const key = Deno.env.get('XAI_API_KEY')?.trim();
  if (!key) return json({ skipped: 'Grok is not configured.' });
  // A pasted key with a stray character fails every call; say which kind, never the key itself.
  const bad = [...key].map((c, i) => ({ i, code: c.codePointAt(0)! })).filter((x) => x.code < 33 || x.code > 126);
  if (bad.length) return json({ error: 'XAI_API_KEY has characters a key can’t contain; set it again.', length: key.length, starts_xai: key.startsWith('xai-'), bad: bad.slice(0, 5) }, 500);
  const ceiling = ceilingMicros(DATA_SHARE); // background job: leaves the rest of the month's ceiling to chat

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const params = new URL(req.url).searchParams;
  const slug = params.get('person');
  const debug = params.has('debug');
  const [people, sched] = await Promise.all([
    db.from('people').select('id, slug, name, forbes_rank, social'),
    db.from('person_recent').select('person_id, last_fetched, next_due, quiet_runs'),
  ]);
  if (people.error || sched.error) return json({ error: (people.error ?? sched.error)!.message }, 500);
  const now = Date.now();
  const state = new Map(sched.data.map((s) => [s.person_id as string, s]));
  const dueAt = (p: Person) => Date.parse(state.get(p.id)?.next_due ?? '1970-01-01');
  const withX = (people.data as Person[]).filter(xHandle);
  const due = slug
    ? withX.filter((p) => p.slug === slug)
    : withX.filter((p) => dueAt(p) <= now).sort((a, b) => dueAt(a) - dueAt(b) || (a.forbes_rank ?? 1e9) - (b.forbes_rank ?? 1e9)).slice(0, PER_RUN);
  if (slug && !due.length) return json({ error: 'No such person with an X account.' }, 404);

  const results = [];
  for (const p of due) {
    const took = await db.rpc('take_xai_budget', { p_limit: ceiling, p_estimate: ESTIMATE });
    if (took.error) return json({ error: took.error.message }, 500);
    if (took.data !== true) {
      results.push({ person: p.slug, skipped: 'Monthly Grok ceiling reached.' });
      break;
    }
    const s = state.get(p.id);
    const handle = xHandle(p)!;
    const from = fromDate(now, s?.last_fetched ? Date.parse(s.last_fetched) : null);
    let ask;
    try {
      ask = await askGrok(key, handle, from);
    } catch (e) {
      console.error(e);
      // A failed call may still have been billed: keep a third of the reservation, retry this person in 6 hours.
      await db.rpc('settle_xai_spend', { p_delta: -Math.round((ESTIMATE * 2) / 3) });
      await db.from('person_recent').upsert({ person_id: p.id, next_due: new Date(now + 6 * 36e5).toISOString(), quiet_runs: s?.quiet_runs ?? 0 });
      results.push({ person: p.slug, error: String(e).slice(0, 200) });
      continue;
    }
    await db.rpc('settle_xai_spend', { p_delta: ask.cost - ESTIMATE });

    const why = { found: ask.found.posts?.length ?? 0, not_theirs: 0, uncited: 0, embed_failed: 0 };
    const posts = [];
    for (const item of (ask.found.posts ?? []).slice(0, MAX_POSTS)) {
      const id = typeof item?.url === 'string' ? xPostId(item.url.trim(), handle) : null;
      if (!id) { why.not_theirs++; continue; }
      if (!ask.cited.has(id)) { why.uncited++; continue; }
      const post = await xPost(id, handle);
      if (!post) { why.embed_failed++; continue; }
      posts.push({ person_id: p.id, platform: 'x', handle, post_url: `https://x.com/${handle}/status/${id}`, ...post });
    }
    if (posts.length) {
      const ins = await db.from('person_posts').upsert(posts, { onConflict: 'post_url', ignoreDuplicates: true });
      if (ins.error) console.error(ins.error);
    }

    await db.from('person_recent').upsert({
      person_id: p.id,
      last_fetched: new Date(now).toISOString(),
      next_due: new Date(nextDue(now, p.forbes_rank, posts.length, s?.quiet_runs ?? 0)).toISOString(),
      quiet_runs: posts.length ? 0 : (s?.quiet_runs ?? 0) + 1,
    });
    results.push({ person: p.slug, from, posts: posts.length, cost_usd: ask.cost / 1e6, ...(debug ? { why, usage: ask.usage } : {}) });
  }
  return json({ model: MODEL, ran: results });
});
