// The chat's opening line (owner, Nov 4, 2026): the profile shows one message from "AI <first name>" that also opens
// the chat. It is the AI-written "lately" line when there is one; otherwise everyone gets a greeting built here in
// code (no model call, so Free and signed-out visitors too, owner decision), varied by day. Both come with starter replies that fit what was said.

export type Opener = { text: string; kind: 'status' | 'greeting'; starters: string[]; /** When the AI line was written. */ at?: string };
type Who = { id: string; name: string; main_source: string | null; rank: number | null };
type User = { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined;

export const firstName = (name: string) => name.replace(/ & family$/, '').split(/\s+/)[0];

/** A name to greet the member by: the name they gave in Account (kept as typed), else their profile name, else a
 * name-like start of their email, else null. */
export function memberName(user: User): string | null {
  const meta = user?.user_metadata ?? {};
  const own = typeof meta.first_name === 'string' ? meta.first_name.trim().split(/\s+/)[0] : '';
  if (own.length >= 1 && own.length <= 20) return own[0].toUpperCase() + own.slice(1);
  const named = [meta.full_name, meta.name].find((v): v is string => typeof v === 'string' && !!v.trim());
  const raw = named ? named.trim().split(/\s+/)[0] : (user?.email?.split('@')[0].match(/^[a-z]+/i)?.[0] ?? '');
  if (raw.length < 2 || raw.length > 14) return null;
  return raw[0].toUpperCase() + raw.slice(1).toLowerCase();
}

function seed(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** The code-built greeting: the same all day for one person and member, a different one tomorrow. */
export function greeting(p: Who, member: string | null, day = new Date().toISOString().slice(0, 10)): Opener {
  const hi = member ? `Hi, ${member}!` : 'Hi there!';
  const src = p.main_source;
  const options: Omit<Opener, 'kind'>[] = [
    ...(src ? [{ text: `${hi} Does ${src} interest you?`, starters: [`Yes, tell me about ${src}.`, 'How did it start?', 'What’s next for it?'] }] : []),
    { text: `${hi} Curious about anything?`, starters: ['What’s keeping you busy?', 'How did you get started?', 'What’s your best habit?'] },
    { text: `${hi} Want to join the club?`, starters: ['How do I get started?', 'What was your first big break?', 'What would you do differently?'] },
    { text: `${hi} Need some tips?`, starters: ['Any advice for starting out?', 'How do you pick what to work on?', 'How do you handle setbacks?'] },
    ...(p.rank === 1 ? [{ text: `${hi} Ever wondered what it’s like at No. 1?`, starters: ['What is it like?', 'Does the ranking matter to you?', 'What keeps you going?'] }] : []),
  ];
  return { ...options[seed(`${p.id}|${member ?? ''}|${day}`) % options.length], kind: 'greeting' };
}

/** Replies that follow on from the AI "lately" line. */
export function statusOpener(p: Who, text: string, at?: string): Opener {
  return {
    text,
    at,
    kind: 'status',
    starters: ['Tell me more about that.', 'Why does that matter to you?', p.main_source ? `What’s next for ${p.main_source}?` : 'What’s next for you?'],
  };
}
