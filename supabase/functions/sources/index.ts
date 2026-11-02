// Own-words sources for the chat persona (batch K): find interviews with one person, fetch each article, let Grok
// pick out the passages they said themselves, and keep only passages that appear verbatim in the article. Nothing
// is paraphrased or generated; every row links back to its article. One person per run (the hour picks who, by
// rank), so the public sources are asked rarely. Invoked by a scheduler holding CRON_SECRET; `?person=<slug>` runs
// one person on demand. Optional feature: without XAI_API_KEY it does nothing.
// Cost (xAI, shared monthly ceiling, background share): the hourly cron only acts every EVERY_HOURS hours, on at most
// ARTICLES articles of ≤MAX_ARTICLE_CHARS (≈5k tokens each): ≈$0.015 a run, ≈$2 a month.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { getJson, track } from '../_shared/refresh.ts';
import { cors, json } from '../_shared/util.ts';
import { reserve, xaiKey, xaiText } from '../_shared/xai.ts';

const MODEL = Deno.env.get('XAI_MODEL') || 'grok-4.3';
const ARTICLES = 2;
const MAX_ARTICLE_CHARS = 20_000;
const EVERY_HOURS = 6;
const ESTIMATE = 10_000; // one article: ≈5.5k tokens in, ≈1.5k out with reasoning
const UA = { 'User-Agent': 'WealthlineBot/1.0 (+https://haseebahmad1521-alt.github.io/wealthline/)' };

type Article = { title: string; url: string; published: string | null };

// GDELT returns the publishers' own URLs (Google News only gives redirect links, and answers 503 from Supabase).
async function interviews(name: string): Promise<Article[]> {
  const q = `"${name.replace(/ & family$/, '')}" interview sourcelang:english`;
  const r = await getJson(
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=json&maxrecords=25&sort=hybridrel&timespan=3months`,
    UA,
  );
  return ((r?.articles ?? []) as { url: string; title: string; seendate: string }[])
    .filter((a) => /^https?:\/\//.test(a.url) && a.title)
    .map((a) => ({
      title: a.title,
      url: a.url,
      published: /^\d{8}T\d{6}Z$/.test(a.seendate)
        ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}T${a.seendate.slice(9, 11)}:${a.seendate.slice(11, 13)}:00Z`
        : null,
    }));
}

/** Readable article text: drops scripts, styles and tags, decodes common entities, collapses whitespace. */
export function articleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h\d|li|blockquote|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Comparable form for the verbatim check: straight quotes and apostrophes, single spaces, lower case. */
export const normal = (s: string) => s.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'passages'],
  properties: {
    kind: { type: 'string', enum: ['interview', 'speech', 'letter', 'article', 'none'], description: 'What the article mostly is, for this person.' },
    passages: {
      type: 'array',
      items: { type: 'string', description: 'A passage the person said or wrote, copied character for character from the article.' },
    },
  },
};

async function passagesFrom(db: SupabaseClient, key: string, name: string, a: Article, text: string) {
  const settleSpend = await reserve(db, ESTIMATE);
  if (!settleSpend) return 'over' as const;
  try {
    const r = await xaiText({
      key,
      model: MODEL,
      maxTokens: 4000,
      schema,
      system:
        `You extract what ${name} said or wrote in their own words from a news article, for an archive of their quotes. ` +
        'Return only passages the article presents as their direct speech or writing (inside quotation marks, or a Q&A ' +
        'answer attributed to them). Copy each passage exactly as it appears, without changing, joining or trimming words ' +
        'inside it; leave out the quotation marks around it. Skip paraphrase, other people, and passages under 12 words. ' +
        'At most 12 passages, the most revealing of how they think and talk. If there are none, return an empty list and kind "none".',
      input: `Title: ${a.title}\nURL: ${a.url}\n\n${text}`,
    });
    await settleSpend(r.cost);
    if (r.status && r.status !== 'completed') return null;
    return JSON.parse(r.text) as { kind: string; passages: unknown[] };
  } catch (e) {
    console.error(e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden.' }, 403);
  const apiKey = xaiKey();
  if (!apiKey) return json({ skipped: 'Grok is not configured.' });
  const slug = new URL(req.url).searchParams.get('person');
  const hour = Math.floor(Date.now() / 3_600_000);
  if (!slug && hour % EVERY_HOURS) return json({ skipped: `Runs every ${EVERY_HOURS} hours.` });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const people = await db.from('people').select('id, slug, name').order('forbes_rank', { ascending: true, nullsFirst: false });
  if (people.error) return json({ error: people.error.message }, 500);
  const person = slug
    ? people.data.find((p) => p.slug === slug)
    : people.data[Math.floor(hour / EVERY_HOURS) % Math.max(people.data.length, 1)];
  if (!person) return json({ error: 'No such person.' }, 404);

  const known = await db.from('person_sources').select('url').eq('person_id', person.id);
  const seen = new Set((known.data ?? []).map((r) => r.url));
  const articles = (await track(db, 'GDELT', () => interviews(person.name))).filter((a) => !seen.has(a.url)).slice(0, ARTICLES);

  let stored = 0;
  let rejected = 0;
  for (const a of articles) {
    let text: string;
    try {
      const res = await fetch(a.url, { headers: UA, signal: AbortSignal.timeout(15_000) });
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) continue;
      text = articleText(await res.text()).slice(0, MAX_ARTICLE_CHARS);
    } catch {
      continue;
    }
    if (text.length < 500) continue;
    const out = await passagesFrom(db, apiKey, person.name, a, text);
    if (out === 'over') break;
    if (!out || out.kind === 'none') continue;
    const haystack = normal(text);
    const rows = [];
    for (const p of Array.isArray(out.passages) ? out.passages : []) {
      if (typeof p !== 'string') continue;
      const passage = p.trim().replace(/^["“]|["”]$/g, '');
      // Trust boundary: a passage is stored only if it is in the article word for word.
      if (passage.split(/\s+/).length < 12 || passage.length > 2000 || !haystack.includes(normal(passage))) {
        rejected++;
        continue;
      }
      rows.push({
        person_id: person.id,
        kind: out.kind,
        title: a.title.slice(0, 300),
        url: a.url,
        published_at: a.published,
        excerpt: passage,
      });
    }
    if (rows.length) {
      const ins = await db.from('person_sources').upsert(rows, { onConflict: 'person_id,url,excerpt', ignoreDuplicates: true });
      if (ins.error) return json({ error: ins.error.message }, 500);
      stored += rows.length;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return json({ person: person.slug, articles: articles.length, stored, rejected });
});
