// Daily brief: fetch public headlines (Google News RSS, keyless) about each tracked person, let Claude
// pick and annotate the ones that may affect their wealth, store the result. Optional feature: without
// ANTHROPIC_API_KEY it does nothing. Invoked once a day by a scheduler holding CRON_SECRET.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_shared/util.ts';

const MODEL = 'claude-opus-5-5';
const PER_PERSON = 8;
const MAX_ITEMS = 8;

type Headline = { title: string; link: string; source: string; published: string | null; slug: string };

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

async function headlinesFor(name: string, slug: string): Promise<Headline[]> {
  const url = new URL('https://news.google.com/rss/search');
  url.search = new URLSearchParams({ q: `"${name}" when:1d`, hl: 'en-US', gl: 'US', ceid: 'US:en' }).toString();
  const res = await fetch(url);
  if (!res.ok) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, PER_PERSON).flatMap(([, item]) => {
    const pick = (tag: string) => item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1];
    const title = pick('title');
    const link = pick('link');
    if (!title || !link || !/^https?:\/\//.test(decode(link))) return [];
    const date = pick('pubDate');
    return [{
      title: decode(title),
      link: decode(link),
      source: decode(pick('source') ?? 'Unknown outlet'),
      published: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null,
      slug,
    }];
  });
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'items'],
  properties: {
    headline: { type: 'string', description: 'One line, at most 120 characters, summarising the day.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'note'],
        properties: {
          index: { type: 'integer', description: 'Index of the chosen headline in the list.' },
          note: { type: 'string', description: 'At most 30 words: why this may matter for their wealth.' },
        },
      },
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden.' }, 403);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ skipped: 'Claude is not configured.' }, 200);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const today = new Date().toISOString().slice(0, 10);
  const existing = await db.from('briefs').select('id').eq('brief_date', today).maybeSingle();
  if (existing.data) return json({ skipped: 'Brief already exists for today.' });

  const people = await db.from('people').select('id, slug, name');
  if (people.error) return json({ error: people.error.message }, 500);

  // Sequential and gentle on the public feed; dedupe stories that mention several people.
  const seen = new Set<string>();
  const headlines: Headline[] = [];
  for (const p of people.data) {
    for (const h of await headlinesFor(p.name, p.slug)) {
      if (!seen.has(h.link)) {
        seen.add(h.link);
        headlines.push(h);
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!headlines.length) return json({ skipped: 'No headlines today.' });

  const list = headlines.map((h, i) => `${i}. [${h.slug}] ${h.title} — ${h.source}`).join('\n');
  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system:
      'You are the news editor of Wealthline, which tracks the largest personal fortunes. From the numbered ' +
      `headlines, choose at most ${MAX_ITEMS} that most plausibly affect a listed person's wealth (share price ` +
      'moves, earnings, deals, stake sales, filings, lawsuits, regulation). You only see headlines, not articles: ' +
      'base each note on the headline alone and say "may" rather than asserting outcomes. Never state or estimate ' +
      'a net worth or any figure that is not in the headline. Skip gossip and duplicates. If nothing is notable, ' +
      'return no items and a headline saying it was a quiet day.',
    messages: [{ role: 'user', content: `Headlines from the last 24 hours:\n${list}` }],
  } as Parameters<typeof client.beta.messages.create>[0]);

  if (response.stop_reason === 'refusal') return json({ skipped: 'Model declined.' });
  const text = response.content.find((b) => b.type === 'text');
  let out: { headline?: unknown; items?: unknown };
  try {
    out = JSON.parse(text && 'text' in text ? text.text : '');
  } catch {
    return json({ error: 'Unparseable model output.' }, 502);
  }

  // Trust boundary: keep only valid indexes; every displayed fact comes from the fetched feed.
  const bySlug = new Map(people.data.map((p) => [p.slug, p.id]));
  const items = [];
  const used = new Set<number>();
  for (const x of Array.isArray(out.items) ? out.items : []) {
    const ok = Number.isInteger(x?.index) && x.index >= 0 && x.index < headlines.length && typeof x.note === 'string';
    if (!ok || used.has(x.index) || items.length >= MAX_ITEMS) continue;
    used.add(x.index);
    const h = headlines[x.index];
    items.push({
      position: items.length,
      person_id: bySlug.get(h.slug) ?? null,
      title: h.title.slice(0, 300),
      note: x.note.trim().slice(0, 300),
      source_name: h.source.slice(0, 120),
      source_url: h.link,
      published_at: h.published,
    });
  }
  const headline = typeof out.headline === 'string' && out.headline.trim() ? out.headline.trim().slice(0, 140) : 'Today’s brief';

  const brief = await db.from('briefs').insert({ brief_date: today, headline, model: response.model }).select('id').single();
  if (brief.error) return json({ error: brief.error.message }, 500);
  if (items.length) {
    const ins = await db.from('brief_items').insert(items.map((i) => ({ ...i, brief_id: brief.data.id })));
    if (ins.error) {
      await db.from('briefs').delete().eq('id', brief.data.id);
      return json({ error: ins.error.message }, 500);
    }
  }
  return json({ brief_date: today, items: items.length, considered: headlines.length });
});
