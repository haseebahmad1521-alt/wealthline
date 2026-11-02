// Chat with a billionaire (batches K, K2): a signed-in user on a verified device with a Pro or Premium plan sends a
// message; Grok replies as an AI simulation of the person, grounded in what we have archived (their posts, recent
// news, passages in their own words, plus the passages that best match the message). Net worth comes only from our
// records. Rules, reply shape, moderation and plans live in `_shared/persona.ts`, shared with the local bridge.
// Daily allowances are spend, not counts; a global ceiling caps the whole day, and every call also counts against the
// monthly xAI ceiling shared with the background jobs (chat may use all of it, they stop at 70%). The key stays here.
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  GLOBAL_DAILY_MICROS,
  PLANS,
  REPLY_MAX_TOKENS,
  REPLY_SCHEMA,
  RULES,
  addStrike,
  personaContext,
  screen,
  settle,
  strikeNotice,
  type Plan,
  type PersonaReply,
  type StrikeState,
  addMemory,
  openerNote,
  openerText,
} from '../_shared/persona.ts';
import { cors, json } from '../_shared/util.ts';
import { reserve, xaiKey, xaiText, type Turn } from '../_shared/xai.ts';

const MAX_TEXT = 1000;
const REASONING_ROOM = 1200; // grok-4.3 used ≈630 reasoning tokens on "low" for a one-line reply (Nov 2026)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const apiKey = xaiKey();
  if (!apiKey) return json({ error: 'Chat is not configured yet.' }, 503);

  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who } = await asUser.auth.getUser(auth.replace(/^Bearer /, ''));
  if (!who.user) return json({ error: 'Sign in to chat.' }, 401);
  const verified = await asUser.rpc('session_verified');
  if (verified.data !== true) return json({ error: 'Verify this device to chat.' }, 403);
  const userId = who.user.id;

  let body: { person?: unknown; text?: unknown; opener?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request.' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const opener = openerText(body.opener);
  if (!text || text.length > MAX_TEXT || typeof body.person !== 'string') return json({ error: `Write 1–${MAX_TEXT} characters.` }, 400);

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const [planRow, modRow, person] = await Promise.all([
    db.rpc('chat_plan', { p_user: userId }),
    db.from('chat_moderation').select('strikes, paused_before, paused_until, on_hold').eq('user_id', userId).maybeSingle(),
    db.from('people').select('id, name').eq('slug', body.person).maybeSingle(),
  ]);
  if (planRow.error || modRow.error) return json({ error: (planRow.error ?? modRow.error)!.message }, 500);
  const plan = planRow.data as Plan | null;
  if (!plan || !(plan in PLANS)) return json({ error: 'Chat comes with Pro and Premium.', upsell: true }, 402);
  const m = modRow.data;
  if (m?.on_hold) return json({ error: 'Your account is on hold until a person reviews it.', on_hold: true }, 403);
  if (m?.paused_until && Date.parse(m.paused_until) > Date.now())
    return json({ error: 'Chat is paused for now.', paused_until: m.paused_until }, 429);
  if (!person.data) return json({ error: 'No such person.' }, 404);
  const first = String(person.data.name).split(/\s+/)[0];

  // A rule break: no reply and no tapback; the message isn't kept, the strike is.
  const strike = async () => {
    const now = Date.now();
    const before: StrikeState = {
      strikes: (m?.strikes ?? []).map((t: string) => Date.parse(t)),
      pausedBefore: m?.paused_before ?? false,
      pausedUntil: m?.paused_until ? Date.parse(m.paused_until) : 0,
      onHold: false,
    };
    const r = addStrike(before, now);
    const iso = (t: number) => new Date(t).toISOString();
    const saved = await db.from('chat_moderation').upsert({
      user_id: userId,
      strikes: r.state.strikes.map(iso),
      paused_before: r.state.pausedBefore,
      paused_until: r.state.pausedUntil ? iso(r.state.pausedUntil) : null,
      on_hold: r.state.onHold,
      held_at: r.outcome === 'hold' ? iso(now) : null,
    });
    if (saved.error) console.error(saved.error);
    return json({
      notice: strikeNotice(r.outcome, r.strikes, first),
      strikes: r.strikes,
      paused_until: r.state.pausedUntil > now ? iso(r.state.pausedUntil) : null,
      on_hold: r.state.onHold,
    });
  };
  if (screen(text)) return strike();

  const { model, dailyMicros, estimate, history: keep, memory: maxFacts } = PLANS[plan];
  const globalMicros = Number(Deno.env.get('CHAT_GLOBAL_DAILY_USD') ?? '') * 1e6 || GLOBAL_DAILY_MICROS;
  const took = await db.rpc('take_chat_budget', { p_user: userId, p_limit: dailyMicros, p_global: globalMicros, p_estimate: estimate });
  if (took.error) return json({ error: took.error.message }, 500);
  if (took.data !== true) return json({ error: 'That’s today’s chat allowance. More tomorrow.', limit: true }, 429);
  const refundUser = (actual: number) => db.rpc('settle_chat_spend', { p_user: userId, p_delta: actual - estimate });
  let settleXai: Awaited<ReturnType<typeof reserve>>;
  try {
    settleXai = await reserve(db, estimate, 1);
  } catch (e) {
    await refundUser(0);
    return json({ error: (e as Error).message }, 500);
  }
  if (!settleXai) return (await refundUser(0), json({ error: 'Chat is resting for now. Try again later.', limit: true }, 429));
  const refund = (actual: number) => Promise.all([refundUser(actual), settleXai(actual)]);

  const thread = await db.from('chat_threads')
    .upsert({ owner: userId, person_id: person.data.id, updated_at: new Date().toISOString() }, { onConflict: 'owner,person_id' })
    .select('id, memory').single();
  if (thread.error) return (await refund(0), json({ error: thread.error.message }, 500));
  const mine = await db.from('chat_messages').insert({ thread_id: thread.data.id, role: 'user', text }).select('id').single();
  if (mine.error) return (await refund(0), json({ error: mine.error.message }, 500));

  const [history, ctx] = await Promise.all([
    db.from('chat_messages').select('role, text').eq('thread_id', thread.data.id).order('created_at', { ascending: false }).limit(keep),
    personaContext(db, person.data.id, text),
  ]);
  const messages: Turn[] = (history.data ?? []).reverse().map((x) => ({ role: x.role as Turn['role'], content: x.text }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const facts: string[] = thread.data.memory ?? [];
  // seen_at drives the simulated ✓✓: "read" once the reply starts being written.
  await db.from('chat_messages').update({ seen_at: new Date().toISOString() }).eq('id', mine.data.id);

  let out: PersonaReply;
  let settled = false;
  try {
    // xAI caches by prefix (automatically): the shared rules and persona material first, then this user's facts and
    // opener, then the thread, which is what pays for longer memory. The thread id keeps a thread on one cache.
    const r = await xaiText({
      key: apiKey,
      model,
      system: [
        RULES,
        `Material about ${ctx.name} (as of ${new Date().toISOString().slice(0, 10)}):\n\n${ctx.text}`,
        ...(facts.length ? [`What you know about this user from earlier chats:\n${facts.map((f) => `- ${f}`).join('\n')}`] : []),
        ...(opener ? [openerNote(opener)] : []),
      ],
      input: messages,
      // Grok's reasoning tokens count as output: room for them on top of the reply's cap (RULES keep replies short).
      maxTokens: REPLY_MAX_TOKENS + REASONING_ROOM,
      schema: REPLY_SCHEMA,
      convId: thread.data.id,
    });
    await refund(r.cost);
    settled = true;
    if (r.status && r.status !== 'completed') throw new Error(`xAI response ${r.status}`);
    out = settle(JSON.parse(r.text) as PersonaReply);
  } catch (e) {
    console.error(e);
    if (!settled) await refund(0);
    await db.from('chat_messages').delete().eq('id', mine.data.id);
    return json({ error: 'They couldn’t reply just now. Try again in a moment.' }, 502);
  }

  if (out.flag) {
    await db.from('chat_messages').delete().eq('id', mine.data.id);
    return strike();
  }
  if (out.reaction) await db.from('chat_messages').update({ reaction: out.reaction }).eq('id', mine.data.id);
  const remembered = addMemory(facts, out.remember, maxFacts);
  if (out.remember && remembered.at(-1) === out.remember) await db.from('chat_threads').update({ memory: remembered }).eq('id', thread.data.id);
  const reply = out.reply || 'Let me get back to you on that.';
  const sources = ctx.matches.slice(0, 3);
  const saved = await db.from('chat_messages')
    .insert({ thread_id: thread.data.id, role: 'assistant', text: reply.slice(0, 4000), sources: sources.length ? sources : null })
    .select('id, role, text, sources, created_at').single();
  if (saved.error) return json({ error: saved.error.message }, 500);
  return json({ thread_id: thread.data.id, message: saved.data, reaction: out.reaction });
});
