// Local chat bridge (batch K2, dev only): answers the app's chat through the owner's own Claude subscription via the
// Claude Code CLI (`claude -p`), so persona replies, reactions, strikes and budgets can be tried before an API key or
// Azure/Foundry deployment exists. Never deploy or expose this: a consumer subscription is for the owner's own use.
//
//   npm run chat:local                 # http://127.0.0.1:8787, Pro plan (Haiku)
//   npm run chat:local -- --lan        # also reachable from a phone on the same Wi-Fi
//   npm run chat:local -- --plan premium   # Premium plan (Sonnet)
//
// Then start the app with EXPO_PUBLIC_CHAT_BRIDGE=8787 (see .env.example). State (strikes, budget) lives in memory.
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import {
  PLANS,
  REPLY_SCHEMA,
  RULES,
  personaContext,
  screen,
  settle,
  strikeNotice,
  addStrike,
  type StrikeState,
  costMicros,
  type Flag,
  type PersonaReply,
  type Plan,
} from '../supabase/functions/_shared/persona.ts';

process.loadEnvFile?.('.env');
const args = process.argv.slice(2);
const lan = args.includes('--lan');
const plan: Plan = args[args.indexOf('--plan') + 1] === 'premium' ? 'premium' : 'pro';
const PORT = 8787;
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.');
const db = createClient(url, key, { auth: { persistSession: false } });
// An empty folder, so the CLI picks up no project instructions, hooks or memory.
const cwd = mkdtempSync(join(tmpdir(), 'wealthline-chat-'));

const state = { mod: { strikes: [], pausedBefore: false, pausedUntil: 0, onHold: false } as StrikeState, day: '', used: 0 };

type Turn = { role: 'user' | 'assistant'; text: string };

function ask(system: string, prompt: string, model: string) {
  return new Promise<{ reply: PersonaReply; weight: number }>((resolve, reject) => {
    const child = spawn(
      'claude',
      ['-p', '--model', model, '--output-format', 'json', '--tools', '', '--setting-sources', '', '--strict-mcp-config',
        '--no-session-persistence', '--disable-slash-commands', '--system-prompt', system, '--json-schema', JSON.stringify(REPLY_SCHEMA)],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const j = JSON.parse(out);
        if (code !== 0 || j.is_error || !j.structured_output) throw new Error(j.result || err || `claude exited ${code}`);
        const u = j.usage ?? {};
        resolve({
          reply: j.structured_output as PersonaReply,
          weight: costMicros(PLANS[plan].model, { input: u.input_tokens, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens, output: u.output_tokens }),
        });
      } catch (e) {
        reject(new Error(`${(e as Error).message}\n${err}`.trim()));
      }
    });
    child.stdin.end(prompt);
  });
}

function strike(name: string) {
  const now = Date.now();
  const r = addStrike(state.mod, now);
  state.mod = r.state;
  return {
    notice: strikeNotice(r.outcome, r.strikes, name),
    strikes: r.strikes,
    paused_until: r.state.pausedUntil > now ? new Date(r.state.pausedUntil).toISOString() : null,
    on_hold: r.state.onHold,
  };
}

async function chat(body: { person?: unknown; text?: unknown; history?: unknown }) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 1000 || typeof body.person !== 'string') return [400, { error: 'Write 1–1000 characters.' }] as const;
  if (state.mod.onHold) return [403, { error: 'Your account is on hold until a person reviews it.', on_hold: true }] as const;
  if (state.mod.pausedUntil > Date.now())
    return [429, { error: `Chat is paused until ${new Date(state.mod.pausedUntil).toLocaleString()}.`, paused_until: new Date(state.mod.pausedUntil).toISOString() }] as const;
  const today = new Date().toISOString().slice(0, 10);
  if (state.day !== today) Object.assign(state, { day: today, used: 0 });
  const limit = PLANS[plan].dailyMicros;
  if (state.used >= limit) return [429, { error: 'That’s today’s chat allowance. More tomorrow.', limit: true }] as const;

  const person = await db.from('people').select('id, name').eq('slug', body.person).maybeSingle();
  if (!person.data) return [404, { error: 'No such person.' }] as const;
  const first = String(person.data.name).split(/\s+/)[0];

  const early: Flag | null = screen(text);
  if (early) return [200, { reply: '', reaction: null, flag: early, sources: [], ...strike(first) }] as const;

  const history = (Array.isArray(body.history) ? (body.history as Turn[]) : []).slice(-30)
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string');
  const ctx = await personaContext(db, person.data.id, text);
  const system = `${RULES}\n\nMaterial about ${ctx.name} (as of ${today}):\n\n${ctx.text}`;
  const prompt = [
    history.length ? `Conversation so far:\n${history.map((t) => `${t.role === 'user' ? 'User' : 'You'}: ${t.text}`).join('\n')}\n` : '',
    `Latest message from the user:\n${text}`,
  ].join('\n');

  const started = Date.now();
  const { reply, weight } = await ask(system, prompt, PLANS[plan].localModel);
  state.used += weight;
  const settled = settle(reply);
  console.log(`${first}: ${Date.now() - started} ms, ${weight} µ$ (${state.used}/${limit} today)${settled.flag ? `, flag ${settled.flag}` : ''}`);
  if (settled.flag) return [200, { ...settled, sources: [], ...strike(first) }] as const;
  return [200, { ...settled, sources: ctx.matches.slice(0, 3), used: state.used, limit }] as const;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' });
  res.end(JSON.stringify(body));
}

createServer(async (req: IncomingMessage, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, null);
  if (req.method !== 'POST' || req.url !== '/chat') return send(res, 404, { error: 'Not found.' });
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    const [status, body] = await chat(JSON.parse(raw));
    send(res, status, body);
  } catch (e) {
    console.error(e);
    send(res, 502, { error: 'They couldn’t reply just now. Try again in a moment.' });
  }
}).listen(PORT, lan ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Local chat bridge on ${lan ? 'all interfaces' : '127.0.0.1'}:${PORT}, ${plan} plan (${PLANS[plan].localModel}). Dev only.`);
});
