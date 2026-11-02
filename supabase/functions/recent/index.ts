// Recent posts and news per person from Grok (batch K3; owner, Nov 3, 2026). Grok's x_search and web_search find
// what's new since the last fetch; nothing Grok writes is stored as fact. Trust boundary:
// - an X post is kept only if Grok cited its URL and X's own embed endpoint returns it by that handle; the stored
//   text is X's, word for word;
// - a news item is kept only if Grok cited its URL and the page loads; the stored headline is the page's own title.
// Spend: one Grok call per person per visit, a few people per run, a hard monthly ceiling (XAI_MONTHLY_USD, default
// $20) reserved before each call. Invoked by the cron (CRON_SECRET); `?person=<slug>` runs one person on demand.
// Optional feature: without XAI_API_KEY it does nothing.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { fromDate, nextDue, sameUrl, syndicationToken, xaiCostMicros, xPostId, type XaiUsage } from '../_shared/recent.ts';
import { cors, json } from '../_shared/util.ts';

const MODEL = Deno.env.get('XAI_MODEL') ?? 'grok-4.3';
const PER_RUN = 3;
const ESTIMATE = 30_000; // $0.03 reserved per call, corrected to the real cost after it
const MAX_POSTS = 10;
const MAX_NEWS = 5;
const UA = { 'User-Agent': 'WealthlineBot/1.0 (+https://haseebahmad1521-alt.github.io/wealthline/)' };

type Person = { id: string; slug: string; name: string; forbes_rank: number | null; social: { platform?: string; handle?: string } | null };
type Found = { posts: { url: string }[]; news: { url: string; source_name: string; published_at: string | null }[] };

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['posts', 'news'],
  properties: {
    posts: {
      type: 'array',
      description: 'Their own X posts in the window, newest first.',
      items: { type: 'object', additionalProperties: false, required: ['url'], properties: { url: { type: 'string' } } },
    },
    news: {
      type: 'array',
      description: 'News articles mainly about them in the window, from established outlets, newest first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['url', 'source_name', 'published_at'],
        properties: { url: { type: 'string' }, source_name: { type: 'string' }, published_at: { type: ['string', 'null'] } },
      },
    },
  },
};

async function askGrok(key: string, p: Person, handle: string | null, from: string) {
  const tools: unknown[] = [{ type: 'web_search' }];
  if (handle) tools.unshift({ type: 'x_search', allowed_x_handles: [handle], from_date: from });
  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: MODEL,
      store: false,
      max_output_tokens: 1500,
      tools,
      text: { format: { type: 'json_schema', name: 'recent', schema, strict: true } },
      input: [
        {
          role: 'system',
          content:
            'You list sources; you never summarise or invent. Return only URLs you actually found with your search tools in this ' +
            'request. Skip anything older than the start date, opinion pieces not about the person, and duplicates of one story.',
        },
        {
          role: 'user',
          content:
            `Since ${from}: ${handle ? `posts by @${handle} on X (up to ${MAX_POSTS}), and ` : ''}news articles mainly about ` +
            `${p.name} (up to ${MAX_NEWS}). If there is nothing new, return empty lists.`,
        },
      ],
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`xAI ${res.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  const output = (body.output ?? []) as { type: string; content?: { type: string; text?: string; annotations?: { url?: string }[] }[] }[];
  const parts = output.flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text');
  const cited = new Set<string>([
    ...((body.citations ?? []) as unknown[]).flatMap((c) => (typeof c === 'string' ? [c] : typeof (c as { url?: string })?.url === 'string' ? [(c as { url: string }).url] : [])),
    ...parts.flatMap((c) => (c.annotations ?? []).map((a) => a.url ?? '')),
  ].filter(Boolean).map(sameUrl));
  const toolCalls = output.filter((o) => o.type.endsWith('_call')).length;
  let found: Found = { posts: [], news: [] };
  try {
    found = JSON.parse(parts.map((c) => c.text ?? '').join(''));
  } catch { /* nothing usable */ }
  return { found, cited, cost: xaiCostMicros(MODEL, body.usage as XaiUsage, toolCalls), toolCalls, usage: body.usage, keys: Object.keys(body) };
}

/** The post as X serves it to its own embed widget, or null if it isn't there / isn't by `handle`. */
async function xPost(id: string, handle: string) {
  try {
    const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${syndicationToken(id)}&lang=en`, {
      headers: UA,
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const t = await r.json();
    if (typeof t?.text !== 'string' || String(t?.user?.screen_name ?? '').toLowerCase() !== handle.toLowerCase()) return null;
    return { text: t.text as string, posted_at: t.created_at ? new Date(t.created_at).toISOString() : null };
  } catch {
    return null;
  }
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, ' ').trim();

/** The page's own headline (og:title, else <title>), or null if it doesn't load as HTML. */
async function headline(url: string) {
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('html')) return null;
    const html = (await r.text()).slice(0, 200_000);
    const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
      ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(html)?.[1];
    const title = og ?? /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
    return title ? decode(title).slice(0, 300) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden.' }, 403);
  const key = Deno.env.get('XAI_API_KEY')?.trim();
  if (!key) return json({ skipped: 'Grok is not configured.' });
  // A pasted key with a stray character fails every call; say which kind, never the key itself.
  const bad = [...key].map((c, i) => ({ i, code: c.codePointAt(0)! })).filter((x) => x.code < 33 || x.code > 126);
  if (bad.length) return json({ error: 'XAI_API_KEY has characters a key can’t contain; set it again.', length: key.length, starts_xai: key.startsWith('xai-'), bad: bad.slice(0, 5) }, 500);
  const ceiling = Math.round((Number(Deno.env.get('XAI_MONTHLY_USD') ?? '') || 20) * 1e6);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const slug = new URL(req.url).searchParams.get('person');
  const [people, sched] = await Promise.all([
    db.from('people').select('id, slug, name, forbes_rank, social'),
    db.from('person_recent').select('person_id, last_fetched, next_due, quiet_runs'),
  ]);
  if (people.error || sched.error) return json({ error: (people.error ?? sched.error)!.message }, 500);
  const now = Date.now();
  const state = new Map(sched.data.map((s) => [s.person_id as string, s]));
  const due = slug
    ? (people.data as Person[]).filter((p) => p.slug === slug)
    : (people.data as Person[])
      .filter((p) => Date.parse(state.get(p.id)?.next_due ?? '1970-01-01') <= now)
      .sort((a, b) =>
        Date.parse(state.get(a.id)?.next_due ?? '1970-01-01') - Date.parse(state.get(b.id)?.next_due ?? '1970-01-01')
        || (a.forbes_rank ?? 1e9) - (b.forbes_rank ?? 1e9))
      .slice(0, PER_RUN);
  if (slug && !due.length) return json({ error: 'No such person.' }, 404);

  const results = [];
  for (const p of due) {
    const took = await db.rpc('take_xai_budget', { p_limit: ceiling, p_estimate: ESTIMATE });
    if (took.error) return json({ error: took.error.message }, 500);
    if (took.data !== true) {
      results.push({ person: p.slug, skipped: 'Monthly Grok ceiling reached.' });
      break;
    }
    const s = state.get(p.id);
    const handle = p.social?.platform === 'x' && p.social.handle ? p.social.handle : null;
    const from = fromDate(now, s?.last_fetched ? Date.parse(s.last_fetched) : null);
    let ask;
    try {
      ask = await askGrok(key, p, handle, from);
    } catch (e) {
      console.error(e);
      // A failed call may still have been billed: keep a third of the reservation, retry this person in 6 hours.
      await db.rpc('settle_xai_spend', { p_delta: -Math.round((ESTIMATE * 2) / 3) });
      await db.from('person_recent').upsert({ person_id: p.id, next_due: new Date(now + 6 * 36e5).toISOString(), quiet_runs: s?.quiet_runs ?? 0 });
      results.push({ person: p.slug, error: String(e).slice(0, 200) });
      continue;
    }
    await db.rpc('settle_xai_spend', { p_delta: ask.cost - ESTIMATE });

    const debug = new URL(req.url).searchParams.has('debug');
    const why = { posts_found: ask.found.posts?.length ?? 0, news_found: ask.found.news?.length ?? 0, uncited: 0, not_theirs: 0, embed_failed: 0, page_failed: 0 };
    const posts = [];
    if (handle) {
      for (const item of (ask.found.posts ?? []).slice(0, MAX_POSTS)) {
        const id = typeof item?.url === 'string' ? xPostId(item.url.trim(), handle) : null;
        if (!id) { why.not_theirs++; continue; }
        if (!ask.cited.has(sameUrl(item.url))) { why.uncited++; continue; }
        const post = await xPost(id, handle);
        if (!post) why.embed_failed++;
        if (post) posts.push({ person_id: p.id, platform: 'x', handle, post_url: `https://x.com/${handle}/status/${id}`, ...post });
      }
    }
    const news = [];
    for (const item of (ask.found.news ?? []).slice(0, MAX_NEWS)) {
      const url = typeof item?.url === 'string' ? item.url.trim() : '';
      if (!/^https:\/\//.test(url) || !ask.cited.has(sameUrl(url))) { why.uncited++; continue; }
      const title = await headline(url);
      if (!title) { why.page_failed++; continue; }
      const published = item.published_at && !Number.isNaN(Date.parse(item.published_at)) ? new Date(item.published_at).toISOString() : null;
      news.push({
        person_id: p.id,
        title,
        source_name: (typeof item.source_name === 'string' && item.source_name.trim()) || new URL(url).hostname.replace(/^www\./, ''),
        source_url: url,
        published_at: published,
      });
    }
    const [pi, ni] = await Promise.all([
      posts.length ? db.from('person_posts').upsert(posts, { onConflict: 'post_url', ignoreDuplicates: true }) : null,
      news.length ? db.from('person_news').upsert(news, { onConflict: 'person_id,source_url', ignoreDuplicates: true }) : null,
    ]);
    if (pi?.error || ni?.error) console.error(pi?.error ?? ni?.error);

    const found = posts.length + news.length;
    const quiet = found ? 0 : (s?.quiet_runs ?? 0) + 1;
    await db.from('person_recent').upsert({
      person_id: p.id,
      last_fetched: new Date(now).toISOString(),
      next_due: new Date(nextDue(now, p.forbes_rank, found, s?.quiet_runs ?? 0)).toISOString(),
      quiet_runs: quiet,
    });
    results.push({ person: p.slug, from, posts: posts.length, news: news.length, cited: ask.cited.size, tool_calls: ask.toolCalls, cost_usd: ask.cost / 1e6, ...(debug ? { why, usage: ask.usage, keys: ask.keys, found: ask.found, cited_sample: [...ask.cited].slice(0, 8) } : {}) });
  }
  return json({ model: MODEL, ran: results });
});
