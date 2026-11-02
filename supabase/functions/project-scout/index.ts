// Project scout (daily, pg_cron with CRON_SECRET): Grok reads the last 36 hours of headlines already stored in
// person_news and picks announced projects: new factories, data centres, launches, products, partnerships,
// acquisitions, investments. Trust boundary: Grok returns only an index into the stored list plus labels (kind,
// status, place, stated date, named counterparty, a short note); title, outlet, link and date are copied from the
// stored headline. Without XAI_API_KEY it does nothing. Cost (shared xAI ceiling, background share): ≤1000
// headlines ≈ 40k tokens on grok-4.3 ≈ $0.05 a day.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { getJson, track } from '../_shared/refresh.ts';
import { cors, json } from '../_shared/util.ts';
import { reserve, xaiKey, xaiText } from '../_shared/xai.ts';

const MODEL = Deno.env.get('XAI_MODEL') || 'grok-4.3';
const WINDOW_HOURS = 36;
const MAX_HEADLINES = 1000;
const KINDS = ['factory', 'data_center', 'launch', 'product', 'partnership', 'acquisition', 'investment', 'other'] as const;

type Row = { person_id: string; title: string; source_name: string; source_url: string; published_at: string | null; people: { slug: string; name: string } };

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'kind', 'status', 'note', 'company', 'counterparty', 'city', 'country', 'expected'],
        properties: {
          index: { type: 'integer', description: 'Index of the headline in the list.' },
          kind: { type: 'string', enum: [...KINDS] },
          status: { type: 'string', enum: ['upcoming', 'new'], description: 'upcoming: planned, under construction or announced for later. new: opened, launched, completed or closed now.' },
          note: { type: 'string', description: 'At most 25 words, from the headline alone: what is being built or agreed.' },
          company: { type: 'string', description: "The tracked person's company the project belongs to, as named in the headline; empty if none is named." },
          counterparty: { type: 'string', description: 'Another company the headline names (partner, target, investor); empty if none.' },
          city: { type: 'string', description: 'City the headline names for the project; empty if none.' },
          country: { type: 'string', description: 'ISO 3166-1 alpha-2 code of the country the headline names or the named city is in; empty if none.' },
          expected: { type: 'string', description: 'Year (YYYY) or year-month (YYYY-MM) the headline states for completion or launch; empty if none is stated.' },
        },
      },
    },
  },
};

const SYSTEM =
  'You find business projects in news headlines for Wealthline, which tracks the largest personal fortunes. Each ' +
  'numbered headline is tagged with the tracked person it was found for. Pick only headlines that announce or ' +
  'confirm a concrete project by that person or a company they own or founded: a new factory, plant, data centre, ' +
  'office or launch site; a product or rocket launch; a partnership or joint venture; an acquisition; a major ' +
  'investment. Skip rumours and talks ("reportedly", "considering", "in talks"), opinion, share-price moves, ' +
  'earnings, lawsuits, personal life, and anything you can only infer. You see headlines, not articles: take every ' +
  'field from the headline text alone and leave a field empty when the headline does not say it. Never add numbers, ' +
  'places or dates that are not in the headline. Pick each project once, using its clearest headline, and skip ' +
  'projects already in the "Already recorded" list. Returning no items is correct on a day without announcements.';

async function geocode(db: SupabaseClient, city: string, country: string) {
  if (!city || !country) return null;
  try {
    const r = await track(db, 'Open-Meteo geocoding', () =>
      getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`),
    );
    const hit = ((r?.results ?? []) as { latitude: number; longitude: number; country_code: string }[]).find((x) => x.country_code === country);
    return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  } catch {
    return null; // the project still lists; it just isn't placed on the globe
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden.' }, 403);
  const apiKey = xaiKey();
  if (!apiKey) return json({ skipped: 'Grok is not configured.' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
  const [news, recent, links] = await Promise.all([
    db.from('person_news').select('person_id, title, source_name, source_url, published_at, people(slug, name)').gte('fetched_at', since).order('published_at', { ascending: false }).limit(MAX_HEADLINES),
    db.from('projects').select('title, source_url').gte('announced_date', new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10)),
    db.from('person_companies').select('person_id, companies(id, name)'),
  ]);
  for (const r of [news, recent, links]) if (r.error) return json({ error: r.error.message }, 500);

  // One entry per article (a story naming two people keeps the first), minus articles already turned into projects.
  const known = new Set((recent.data ?? []).map((p) => p.source_url));
  const seen = new Set<string>();
  const headlines = ((news.data ?? []) as unknown as Row[]).filter((h) => !known.has(h.source_url) && !seen.has(h.source_url) && seen.add(h.source_url));
  if (!headlines.length) return json({ skipped: 'No new headlines.' });

  const list = headlines.map((h, i) => `${i}. [${h.people.name}] ${h.title} (${h.source_name}${h.published_at ? `, ${h.published_at.slice(0, 10)}` : ''})`).join('\n');
  const already = (recent.data ?? []).map((p) => `- ${p.title}`).join('\n') || '(none)';

  // ≈40 tokens a headline in, up to ≈6k out with reasoning.
  const settleSpend = await reserve(db, Math.round(headlines.length * 40 * 1.25 + 15_000));
  if (!settleSpend) return json({ skipped: 'Monthly xAI share for background jobs is used up.' });
  let out: { items?: unknown };
  try {
    const r = await track(db, 'Grok (project scout)', () =>
      xaiText({
        key: apiKey,
        model: MODEL,
        maxTokens: 12000,
        schema,
        system: SYSTEM,
        input: `Already recorded:\n${already}\n\nHeadlines from the last ${WINDOW_HOURS} hours:\n${list}`,
      }),
    );
    await settleSpend(r.cost);
    if (r.status && r.status !== 'completed') return json({ error: `xAI response ${r.status}.` }, 502);
    out = JSON.parse(r.text);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }

  const companiesOf = new Map<string, { id: string; name: string }[]>();
  for (const l of (links.data ?? []) as unknown as { person_id: string; companies: { id: string; name: string } | null }[]) {
    if (l.companies) companiesOf.set(l.person_id, [...(companiesOf.get(l.person_id) ?? []), l.companies]);
  }
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

  const rows = [];
  const used = new Set<number>();
  for (const x of Array.isArray(out.items) ? out.items : []) {
    if (!Number.isInteger(x?.index) || x.index < 0 || x.index >= headlines.length || used.has(x.index)) continue;
    if (!KINDS.includes(x.kind) || !['upcoming', 'new'].includes(x.status)) continue;
    used.add(x.index);
    const h = headlines[x.index];
    const country = /^[A-Z]{2}$/.test(x.country ?? '') ? x.country : null;
    const city = clip(x.city, 80) || null;
    const company = clip(x.company, 120).toLowerCase();
    const match = company ? (companiesOf.get(h.person_id) ?? []).find((c) => c.name.toLowerCase() === company || c.name.toLowerCase().startsWith(company) || company.startsWith(c.name.toLowerCase())) : undefined;
    const where = city && country ? await geocode(db, city, country) : null;
    rows.push({
      person_id: h.person_id,
      title: h.title.slice(0, 300),
      description: clip(x.note, 200) || null,
      status: x.status,
      announced_date: (h.published_at ?? new Date().toISOString()).slice(0, 10),
      source_name: h.source_name.slice(0, 120),
      source_url: h.source_url,
      origin: 'news',
      kind: x.kind,
      company_id: match?.id ?? null,
      counterparty: clip(x.counterparty, 120) || null,
      expected: /^\d{4}(-\d{2})?$/.test(x.expected ?? '') ? x.expected : null,
      city,
      country,
      lat: where?.lat ?? null,
      lng: where?.lng ?? null,
      model: MODEL,
    });
  }
  if (rows.length) {
    const ins = await db.from('projects').upsert(rows, { onConflict: 'person_id,source_url', ignoreDuplicates: true });
    if (ins.error) return json({ error: ins.error.message }, 500);
  }
  return json({ considered: headlines.length, projects: rows.length, placed: rows.filter((r) => r.lat != null).length });
});
