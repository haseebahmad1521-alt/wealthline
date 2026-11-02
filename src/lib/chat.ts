import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useAuth } from './data';
import { db } from './supabase';

// Chat with a person's AI simulation (batch K). Messages are written only by the `chat` Edge Function; the client
// reads its own thread (RLS: owner, from a verified session) and sends through the function.

export type ChatSource = { title: string; url: string };
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
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
  const key = ['chat', userId, personId];
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ text: string; limit?: boolean } | null>(null);

  const query = useQuery({
    queryKey: key,
    enabled: enabled && !!userId,
    queryFn: async () => {
      const thread = await db().from('chat_threads').select('id').eq('person_id', personId).maybeSingle();
      if (thread.error) throw thread.error;
      if (!thread.data) return [] as ChatMessage[];
      const r = await db()
        .from('chat_messages')
        .select('id, role, text, sources, created_at, seen_at')
        .eq('thread_id', thread.data.id)
        .order('created_at', { ascending: true })
        .limit(200);
      if (r.error) throw r.error;
      return r.data as ChatMessage[];
    },
  });

  async function send(text: string) {
    const body = text.trim();
    if (!body || sending) return false;
    setSending(true);
    setError(null);
    const temp: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      text: body,
      sources: null,
      created_at: new Date().toISOString(),
      seen_at: null,
      pending: true,
    };
    cache.setQueryData<ChatMessage[]>(key, (old) => [...(old ?? []), temp]);
    const { error: failed } = await db().functions.invoke('chat', { body: { person: slug, text: body } });
    if (failed) {
      let message = 'Could not send. Try again.';
      let limit = false;
      try {
        const res = (failed as { context?: Response }).context;
        const j = await res?.json();
        if (typeof j?.error === 'string') message = j.error;
        limit = res?.status === 429;
      } catch {
        // keep the generic message
      }
      setError({ text: message, limit });
      // A capped or rejected message was never stored: take it back out so the thread shows only what was sent.
      cache.setQueryData<ChatMessage[]>(key, (old) => (old ?? []).filter((m) => m.id !== temp.id));
    }
    await cache.invalidateQueries({ queryKey: key });
    setSending(false);
    return !failed;
  }

  return { messages: query.data ?? [], loading: query.isPending && query.fetchStatus !== 'idle', loadError: query.error, send, sending, error };
}
