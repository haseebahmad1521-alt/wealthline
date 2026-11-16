// People's own words about a storyline: short public statements by tracked people that Grok found while searching,
// kept only when they check out. A statement survives when (1) it names a tracked person, (2) its page came back from
// Grok's own search in that request, and (3) the quote appears word for word on that page near the person's surname
// (fetched and checked by the scenarios function; X posts through X's embed text). Quotes are short and attributed.
// Pure except `verifyStatements`, which takes the page fetcher, so it can be tested.

export type Statement = { person: string; quote: string; said: string | null; url: string; label: string };

/** JSON schema for Grok's statements field (one storyline). */
export const STATEMENTS_SCHEMA = {
  type: 'array',
  description:
    'Up to 3 things listed people (by slug) have said publicly about this storyline’s subject, copied word for word from a page your search returned in this request, with that page’s URL. At most 40 words each; never paraphrase or combine. Empty when there are none.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['person', 'quote', 'said', 'url'],
    properties: {
      person: { type: 'string', description: 'The speaker’s slug from the list.' },
      quote: { type: 'string', description: 'Their words, exactly as on the page, without surrounding quotation marks.' },
      said: { type: 'string', description: 'When they said it, YYYY-MM-DD, or "" if the page doesn’t say.' },
      url: { type: 'string' },
    },
  },
} as const;

const MAX_WORDS = 40;

/** Lowercase, plain quotes and dashes, no punctuation, single spaces: for comparing a quote with a page. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Visible text of an HTML page, roughly: scripts, styles and tags out, common entities decoded. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;|&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#\d+;/g, ' ');
}

/**
 * True when the quote appears word for word in the text, with the speaker's surname within 400 characters of it (so a
 * page quoting someone else, or a quote merely near a mention, doesn't count as theirs).
 */
export function quoteIn(quote: string, text: string, surname: string): boolean {
  const q = normalise(quote);
  const t = normalise(text);
  if (q.split(' ').length < 4) return false; // too short to identify
  const at = t.indexOf(q);
  if (at < 0) return false;
  const near = t.slice(Math.max(0, at - 400), at + q.length + 400);
  return near.includes(normalise(surname));
}

/** Grok's statement → a candidate to verify, or why it was dropped. */
export function checkStatement(
  raw: unknown,
  people: Map<string, string>, // slug → name
  cited: Set<string>,
  sameUrl: (url: string) => string,
): Statement | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const person = typeof r.person === 'string' ? r.person : '';
  if (!people.has(person)) return 'not a tracked person';
  const quote = typeof r.quote === 'string' ? r.quote.replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, '').replace(/\s+/g, ' ') : '';
  const words = quote.split(' ').filter(Boolean).length;
  if (words < 4 || words > MAX_WORDS) return 'quote missing or too long';
  const url = typeof r.url === 'string' ? r.url : '';
  if (!/^https:\/\//.test(url) || !cited.has(sameUrl(url))) return 'source not from this search';
  const said = typeof r.said === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.said) ? r.said : null;
  let label: string;
  try {
    label = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'bad url';
  }
  return { person, quote, said, url, label };
}

/**
 * The statements whose quote is on their page next to the speaker's surname; at most one per person, three in all.
 * `fetchText(url)` returns the page's text (or an X post's), or null when it can't be read.
 */
export async function verifyStatements(
  raws: unknown,
  people: Map<string, string>,
  cited: Set<string>,
  sameUrl: (url: string) => string,
  fetchText: (url: string) => Promise<string | null>,
): Promise<{ kept: Statement[]; dropped: string[] }> {
  const kept: Statement[] = [];
  const dropped: string[] = [];
  for (const raw of (Array.isArray(raws) ? raws : []).slice(0, 5)) {
    const c = checkStatement(raw, people, cited, sameUrl);
    if (typeof c === 'string') {
      dropped.push(c);
      continue;
    }
    if (kept.length >= 3 || kept.some((k) => k.person === c.person)) continue;
    const surname = people.get(c.person)!.replace(/ & family$/, '').split(' ').pop()!;
    const text = await fetchText(c.url).catch(() => null);
    if (text && quoteIn(c.quote, text, surname)) kept.push(c);
    else dropped.push(text ? `quote not on the page (${c.label})` : `page unreadable (${c.label})`);
  }
  return { kept, dropped };
}
