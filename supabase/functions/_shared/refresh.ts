// Refresh workers: fetch one person's public data and cache it. Every stored number, headline and post is copied
// from its source with a link back; nothing is generated. Writes newest first so a watching page fills in from
// today backwards.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type Kind = 'finance' | 'news' | 'social';
export const KINDS: Kind[] = ['finance', 'news', 'social'];
type Person = { id: string; name: string; forbes_uri: string | null; social: { platform: string; handle: string; url: string } | null };

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; Wealthline/1.0; +https://haseebahmad1521-alt.github.io/wealthline/)' };

export async function getJson(url: string, headers: Record<string, string> = UA) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

/** Records each outside source's success or failure for the health check (source_health). */
export async function track<T>(db: SupabaseClient, source: string, work: () => Promise<T>): Promise<T> {
  try {
    const value = await work();
    await db.rpc('record_source', { p_source: source, p_error: null });
    return value;
  } catch (e) {
    await db.rpc('record_source', { p_source: source, p_error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Which kinds can run for this person at all (no source → no state, no spinner). */
export function kindsFor(p: Person): Kind[] {
  return KINDS.filter((k) => (k === 'finance' ? !!p.forbes_uri : k === 'social' ? !!socialFetcher(p) : true));
}

/**
 * Intraday market values for everyone at once (refresh-due, every 10 minutes): one request to the Forbes real-time
 * list, then record_market_values stores each changed value as 'computed' and keeps forbes_rank current.
 * Returns how many new values were stored (0 while markets are closed and Forbes only re-stamps).
 */
export async function marketTick(db: SupabaseClient): Promise<number> {
  const rtb = await track(db, 'Forbes real-time list', () =>
    getJson('https://www.forbes.com/forbesapi/person/rtb/0/position/true.json?fields=uri,rank,finalWorth,timestamp&limit=300'),
  );
  const rows = ((rtb?.personList?.personsLists ?? []) as { uri: string; rank?: number; finalWorth?: number; timestamp?: number }[])
    .filter((x) => x.uri && Number(x.finalWorth) > 0 && x.timestamp)
    .map((x) => ({ uri: x.uri, rank: x.rank ?? null, usd: Number(x.finalWorth) * 1e6, as_of: new Date(x.timestamp!).toISOString() }));
  if (!rows.length) throw new Error('Forbes real-time list came back empty.');
  const { data, error } = await db.rpc('record_market_values', { p_rows: rows, p_source_url: 'https://www.forbes.com/profile/{uri}/' });
  if (error) throw new Error(error.message);
  return data as number;
}

// Forbes: dated list estimates going back (today's real-time value comes from marketTick).
async function finance(db: SupabaseClient, p: Person) {
  const profile = `https://www.forbes.com/profile/${p.forbes_uri}/`;
  const rows: { as_of: string; usd: number; label: string }[] = [];
  const person = (await track(db, 'Forbes profiles', () => getJson(`https://www.forbes.com/forbesapi/person/${p.forbes_uri}.json`)))?.person;
  for (const l of person?.personLists ?? []) {
    // Real-time entries (year 0, a placeholder date that parses as 1993) are today's value, which marketTick stores.
    if (!(l.finalWorth > 0) || !l.date || !(Number(l.year) > 1900)) continue;
    rows.push({ as_of: new Date(l.date).toISOString(), usd: l.finalWorth * 1e6, label: `${/^Forbes/.test(l.name ?? '') ? l.name : `Forbes ${l.name ?? l.listUri}`} ${l.year ?? ''}`.trim() });
  }
  if (!rows.length) throw new Error('Forbes has no value for this person.');
  rows.sort((a, b) => b.as_of.localeCompare(a.as_of));
  for (const r of rows) {
    const { error } = await db.from('net_worth_values').upsert(
      { person_id: p.id, as_of: r.as_of, net_worth_usd: Math.round(r.usd), kind: 'estimate', source_label: r.label, source_url: profile },
      { onConflict: 'person_id,as_of,kind', ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

type Headline = { title: string; link: string; source: string; published: string | null; summary: string };

function rssItems(xml: string, outlet: string | null): Headline[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
    const pick = (tag: string) => item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1];
    const title = pick('title');
    const link = pick('link');
    if (!title || !link || !/^https?:\/\//.test(decode(link))) return [];
    const date = pick('pubDate');
    return [{
      title: decode(title),
      link: decode(link),
      source: outlet ?? decode(pick('source') ?? 'Unknown outlet'),
      published: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null,
      summary: decode(pick('description') ?? '').replace(/<[^>]+>/g, ' '),
    }];
  });
}

async function getText(url: string) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.text();
}

// Keyless sources, all checked to answer from Supabase's network (Oct 25, 2026) except Google News, which
// currently returns 503 there and is kept in case that clears. Searched by name: Google News, GDELT, Hacker News.
// Outlet business feeds are not per person, so only items naming the person are kept.
const OUTLET_FEEDS: [string, string][] = [
  ['CNBC', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147'],
  ['MarketWatch', 'https://feeds.content.dowjones.io/public/rss/mw_topstories'],
  ['The New York Times', 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml'],
  ['The Guardian', 'https://www.theguardian.com/business/rss'],
  ['BBC News', 'https://feeds.bbci.co.uk/news/business/rss.xml'],
  ['Financial Times', 'https://www.ft.com/companies?format=rss'],
  ['TechCrunch', 'https://techcrunch.com/feed/'],
];

async function headlines(db: SupabaseClient, name: string): Promise<Headline[]> {
  const q = name.replace(/ & family$/, '');
  const mentions = (h: Headline) => `${h.title} ${h.summary}`.toLowerCase().includes(q.toLowerCase());
  const google = async () => {
    const url = new URL('https://news.google.com/rss/search');
    url.search = new URLSearchParams({ q: `"${q}" when:7d`, hl: 'en-US', gl: 'US', ceid: 'US:en' }).toString();
    return rssItems(await getText(url.toString()), null).slice(0, 15);
  };
  const gdelt = async () => {
    const r = await getJson(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(`"${q}" sourcelang:english`)}&mode=artlist&format=json&maxrecords=15&sort=datedesc&timespan=7d`,
    ).catch(() => null); // answers in plain text when rate-limited
    return ((r?.articles ?? []) as { url: string; title: string; domain: string; seendate: string }[]).map((a) => ({
      title: a.title,
      link: a.url,
      source: a.domain,
      published: /^\d{8}T\d{6}Z$/.test(a.seendate)
        ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}T${a.seendate.slice(9, 11)}:${a.seendate.slice(11, 13)}:00Z`
        : null,
      summary: '',
    }));
  };
  const hn = async () => {
    const r = await getJson(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(`"${q}"`)}&tags=story&hitsPerPage=10`);
    return ((r?.hits ?? []) as { title: string; url: string | null; objectID: string; created_at: string }[])
      .filter((h) => h.title)
      .map((h) => ({
        title: h.title,
        link: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
        source: h.url ? new URL(h.url).hostname.replace(/^www\./, '') : 'Hacker News',
        published: h.created_at,
        summary: '',
      }));
  };
  const outlets = OUTLET_FEEDS.map(([outlet, url]): [string, () => Promise<Headline[]>] => [
    outlet,
    async () => rssItems(await getText(url), outlet).filter(mentions),
  ]);
  const sources: [string, () => Promise<Headline[]>][] = [['Google News', google], ['GDELT', gdelt], ['Hacker News', hn], ...outlets];

  const results = await Promise.allSettled(sources.map(([source, f]) => track(db, source, f)));
  const ok = results.filter((r): r is PromiseFulfilledResult<Headline[]> => r.status === 'fulfilled');
  if (!ok.length) throw new Error('No news source answered.');
  const seen = new Set<string>();
  return ok
    .flatMap((r) => r.value)
    .filter((h) => !seen.has(h.link) && seen.add(h.link) && h.title.length <= 400)
    .sort((a, b) => (b.published ?? '').localeCompare(a.published ?? ''))
    .slice(0, 20);
}

async function news(db: SupabaseClient, p: Person) {
  for (const h of await headlines(db, p.name)) {
    await db.from('person_news').upsert(
      { person_id: p.id, title: h.title, source_name: h.source, source_url: h.link, published_at: h.published },
      { onConflict: 'person_id,source_url', ignoreDuplicates: true },
    );
  }
  await db.from('person_news').delete().eq('person_id', p.id).lt('fetched_at', new Date(Date.now() - 30 * 86_400_000).toISOString());
}

type Post = { text: string; post_url: string; posted_at: string | null };

// Named and honest, as the owner asked for X's public web endpoints: who we are and where to reach us.
const BOT = { 'User-Agent': 'WealthlineBot/1.0 (+https://haseebahmad1521-alt.github.io/wealthline/)' };
// X's free endpoints rate-limit hard; at most one read per person in this window, whatever the refresh schedule says.
const X_FREE_EVERY_MS = 12 * 3600_000;

// X's public embed timeline (the one news sites embed): no login, no key. The page carries the posts as JSON in
// __NEXT_DATA__; if X changes that shape this throws, and the error shows in source_health.
async function xEmbedTimeline(handle: string): Promise<Post[]> {
  const res = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`, {
    headers: BOT,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`syndication.twitter.com answered ${res.status}`);
  const json = (await res.text()).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const entries = json ? JSON.parse(json)?.props?.pageProps?.timeline?.entries : null;
  if (!Array.isArray(entries)) throw new Error('syndication.twitter.com: timeline not found in page');
  return entries
    .map((e: { content?: { tweet?: Record<string, any> } }) => e.content?.tweet)
    .filter((t: Record<string, any> | undefined): t is Record<string, any> => !!t?.id_str && !t.retweeted_status && !t.in_reply_to_status_id_str)
    .map((t: Record<string, any>) => ({
      text: String(t.full_text ?? t.text ?? ''),
      post_url: `https://x.com/${handle}/status/${t.id_str}`,
      posted_at: t.created_at ? new Date(t.created_at).toISOString() : null,
    }));
}

// Self-hosted FxTwitter (MIT), if the owner deploys one and sets FXTWITTER_URL: same free guest access, other route.
async function xFxTwitter(base: string, handle: string): Promise<Post[]> {
  const r = await getJson(`${base.replace(/\/$/, '')}/2/profile/${encodeURIComponent(handle)}/statuses`, BOT);
  const list = r?.results ?? r?.statuses ?? [];
  return list
    .filter((t: Record<string, any>) => t?.id && !t.replying_to)
    .map((t: Record<string, any>) => ({
      text: String(t.raw_text?.text ?? t.text ?? ''),
      post_url: `https://x.com/${handle}/status/${t.id}`,
      posted_at: t.created_timestamp ? new Date(t.created_timestamp * 1000).toISOString() : (t.created_at ?? null),
    }));
}

// Platforms with a usable public read: Bluesky; X via the owner's paid token (X_BEARER_TOKEN) or, without it, X's free
// web endpoints (owner decision, Nov 2). Instagram, Facebook, LinkedIn and Threads offer no API for other people's
// posts, so those show a profile link only. Returns newest first.
function socialFetcher(p: Person): (() => Promise<Post[]>) | null {
  const s = p.social;
  if (!s?.handle) return null;
  if (s.platform === 'bluesky') {
    return async () => {
      const r = await getJson(
        `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(s.handle)}&limit=20&filter=posts_no_replies`,
      );
      return (r?.feed ?? [])
        .filter((f: { reason?: unknown }) => !f.reason)
        .map(({ post }: { post: Record<string, any> }) => ({
          text: post.record?.text ?? '',
          post_url: `https://bsky.app/profile/${s.handle}/post/${String(post.uri).split('/').pop()}`,
          posted_at: post.record?.createdAt ?? null,
        }));
    };
  }
  if (s.platform !== 'x') return null;
  const token = Deno.env.get('X_BEARER_TOKEN');
  if (token) {
    return async () => {
      const auth = { Authorization: `Bearer ${token}` };
      const user = await getJson(`https://api.x.com/2/users/by/username/${encodeURIComponent(s.handle)}`, auth);
      const id = user?.data?.id;
      if (!id) return [];
      const r = await getJson(
        `https://api.x.com/2/users/${id}/tweets?max_results=20&exclude=retweets,replies&tweet.fields=created_at,note_tweet`,
        auth,
      );
      return (r?.data ?? []).map((t: Record<string, any>) => ({
        text: t.note_tweet?.text ?? t.text,
        post_url: `https://x.com/${s.handle}/status/${t.id}`,
        posted_at: t.created_at ?? null,
      }));
    };
  }
  const fx = Deno.env.get('FXTWITTER_URL');
  return async () => {
    try {
      return await xEmbedTimeline(s.handle);
    } catch (e) {
      if (!fx) throw e;
      return xFxTwitter(fx, s.handle);
    }
  };
}

async function social(db: SupabaseClient, p: Person) {
  const s = p.social!;
  if (s.platform === 'x' && !Deno.env.get('X_BEARER_TOKEN')) {
    const { data } = await db.from('social_posts').select('fetched_at').eq('person_id', p.id).eq('platform', 'x').maybeSingle();
    if (data && Date.now() - Date.parse(data.fetched_at) < X_FREE_EVERY_MS) return;
  }
  const posts = (await socialFetcher(p)?.() ?? []).filter((x) => x.text)
    .sort((a, b) => Date.parse(b.posted_at ?? '0') - Date.parse(a.posted_at ?? '0'));
  if (!posts.length) return;
  const fetched_at = new Date().toISOString();
  const rows = posts.map((x) => ({ person_id: p.id, platform: s.platform, handle: s.handle, ...x, fetched_at }));
  // The archive keeps every post (first copy wins); social_posts keeps the latest for the profile.
  const archive = await db.from('person_posts').upsert(rows, { onConflict: 'post_url', ignoreDuplicates: true });
  if (archive.error) throw new Error(archive.error.message);
  const { error } = await db.from('social_posts').upsert(rows[0]);
  if (error) throw new Error(error.message);
}

const workers: Record<Kind, (db: SupabaseClient, p: Person) => Promise<void>> = { finance, news, social };

/** Runs one claimed refresh and always releases the claim (recording the error, if any). */
export async function run(db: SupabaseClient, p: Person, kind: Kind) {
  let err: string | null = null;
  try {
    await workers[kind](db, p);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  await db.rpc('finish_refresh', { p_person: p.id, p_kind: kind, p_error: err });
}

export const PERSON_COLUMNS = 'id, name, forbes_uri, social';
