import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from './data';
import { db } from './supabase';

// Chat with a person's AI simulation (batch K). Messages are written only by the `chat` Edge Function; the client
// reads its own thread (RLS: owner, from a verified session) and sends through the function.

// Dev only (batch K2): EXPO_PUBLIC_CHAT_BRIDGE=<port> sends chat to `npm run chat:local` on the same host, which
// answers through the owner's Claude subscription. The thread then lives in memory, and no sign-in is needed.
const bridgePort = __DEV__ && Platform.OS === 'web' ? process.env.EXPO_PUBLIC_CHAT_BRIDGE : undefined;
const bridgeUrl = () => `${window.location.protocol}//${window.location.hostname}:${bridgePort}/chat`;
export const localChat = !!bridgePort;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How long a person would take to type `reply` once they've read the message: ~22 characters a second, 1.2–7 s. */
export function typingMs(reply: string) {
  return Math.min(7000, Math.max(1200, reply.length * 45));
}

export type ChatSource = { title: string; url: string };
export type ChatMessage = {
  id: string;
  /** `notice`: a chat-rules warning shown in the thread (client only). */
  role: 'user' | 'assistant' | 'notice';
  /** Their tapback on one of your messages. */
  reaction?: string | null;
  text: string;
  sources: ChatSource[] | null;
  created_at: string;
  seen_at: string | null;
  /** Client only: sent from this screen and not yet confirmed by the server. */
  pending?: boolean;
};

/** Who may chat: signed out, signed in on an unverified device, or ready. */
export function useChatAccess() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;
  // `localChat` is fixed for the whole build, so the hook order below never changes.
  if (localChat) return 'ready' as const;
  const verified = useQuery({
    queryKey: ['session-verified', userId],
    enabled: !!userId,
    queryFn: async () => {
      const r = await db().rpc('session_verified');
      if (r.error) throw r.error;
      return r.data === true;
    },
  });
  if (loading || (userId && verified.isPending)) return 'loading' as const;
  if (!userId) return 'signed-out' as const;
  return verified.data ? ('ready' as const) : ('unverified' as const);
}

export function useChat(personId: string, slug: string, enabled: boolean) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const cache = useQueryClient();
  const key = localChat ? ['chat', 'local', personId] : ['chat', userId, personId];
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [onHold, setOnHold] = useState(false);
  const [error, setError] = useState<{ text: string; limit?: boolean } | null>(null);

  const query = useQuery({
    queryKey: key,
    enabled: enabled && (localChat || !!userId),
    staleTime: localChat ? Infinity : undefined,
    queryFn: async () => {
      if (localChat) return [] as ChatMessage[];
      const thread = await db().from('chat_threads').select('id').eq('person_id', personId).maybeSingle();
      if (thread.error) throw thread.error;
      if (!thread.data) return [] as ChatMessage[];
      const r = await db()
        .from('chat_messages')
        .select('id, role, text, sources, created_at, seen_at, reaction')
        .eq('thread_id', thread.data.id)
        .order('created_at', { ascending: true })
        .limit(200);
      if (r.error) throw r.error;
      return r.data as ChatMessage[];
    },
  });

  const put = (fn: (old: ChatMessage[]) => ChatMessage[]) => cache.setQueryData<ChatMessage[]>(key, (old) => fn(old ?? []));

  async function send(text: string) {
    const body = text.trim();
    if (!body || sending) return false;
    setSending(true);
    setError(null);
    const now = () => new Date().toISOString();
    const temp: ChatMessage = { id: `local-${Date.now()}`, role: 'user', text: body, sources: null, created_at: now(), seen_at: null, pending: true };
    const history = (query.data ?? []).filter((m) => m.role !== 'notice').map((m) => ({ role: m.role, text: m.text }));
    put((old) => [...old, temp]);
    const started = Date.now();
    // They "read" it a beat later and start typing while the reply is written.
    const reading = setTimeout(() => setTyping(true), 600);

    let status = 0;
    let j: Record<string, unknown> = {};
    try {
      if (localChat) {
        const res = await fetch(bridgeUrl(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ person: slug, text: body, history }) });
        status = res.status;
        j = await res.json();
      } else {
        const { data, error: failed } = await db().functions.invoke('chat', { body: { person: slug, text: body } });
        if (failed) {
          const res = (failed as { context?: Response }).context;
          status = res?.status ?? 0;
          j = (await res?.json().catch(() => ({}))) ?? {};
        } else {
          status = 200;
          j = data ?? {};
        }
      }
    } catch {
      status = 0;
    }

    if (status !== 200) {
      clearTimeout(reading);
      setTyping(false);
      if (typeof j.paused_until === 'string') setPausedUntil(j.paused_until);
      if (j.on_hold === true) setOnHold(true);
      setError({ text: typeof j.error === 'string' ? j.error : 'Could not send. Try again.', limit: status === 429 });
      // A capped or rejected message was never stored: take it back out so the thread shows only what was sent.
      put((old) => old.filter((m) => m.id !== temp.id));
      setSending(false);
      return false;
    }

    // Broke the chat rules: no reply, no tapback, a warning in the thread instead.
    if (typeof j.notice === 'string') {
      clearTimeout(reading);
      setTyping(false);
      if (typeof j.paused_until === 'string') setPausedUntil(j.paused_until);
      if (j.on_hold === true) setOnHold(true);
      put((old) => [
        ...old.map((m) => (m.id === temp.id ? { ...m, pending: false } : m)),
        { id: `notice-${Date.now()}`, role: 'notice', text: j.notice as string, sources: null, created_at: now(), seen_at: null },
      ]);
      setSending(false);
      return true;
    }

    const message = (localChat
      ? { id: `reply-${Date.now()}`, role: 'assistant', text: String(j.reply ?? ''), sources: (j.sources as ChatSource[])?.length ? j.sources : null, created_at: '', seen_at: null }
      : j.message) as ChatMessage | undefined;
    clearTimeout(reading);
    // Seen, with their reaction, then the rest of a human typing time before the whole reply appears.
    setTyping(true);
    put((old) => old.map((m) => (m.id === temp.id ? { ...m, pending: false, seen_at: m.seen_at ?? now(), reaction: (j.reaction as string) ?? null } : m)));
    const reply = message?.text ?? '';
    await wait(Math.max(400, 600 + typingMs(reply) - (Date.now() - started)));
    if (message && reply) put((old) => [...old, { ...message, created_at: localChat ? now() : message.created_at }]);
    setTyping(false);
    if (!localChat) await cache.invalidateQueries({ queryKey: key });
    setSending(false);
    return true;
  }

  return { messages: query.data ?? [], loading: query.isPending && query.fetchStatus !== 'idle', loadError: query.error, send, sending, typing, pausedUntil, onHold, error };
}
