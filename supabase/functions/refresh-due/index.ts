// Scheduled refresh (pg_cron every 10 minutes, holding CRON_SECRET): takes the few person/kind pairs whose
// next_auto_at has passed (set per run with a random ±30 min offset) and refreshes them one at a time.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { kindsFor, PERSON_COLUMNS, run, type Kind } from '../_shared/refresh.ts';
import { cors, json } from '../_shared/util.ts';

const BATCH = 6;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden.' }, 403);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // People never refreshed get a state row per kind, first due at a random point in the next 2 hours.
  const [{ data: people }, { data: states }] = await Promise.all([
    db.from('people').select(PERSON_COLUMNS),
    db.from('refresh_state').select('person_id, kind'),
  ]);
  const have = new Set((states ?? []).map((s) => `${s.person_id}:${s.kind}`));
  const fresh = (people ?? []).flatMap((p) =>
    kindsFor(p)
      .filter((k) => !have.has(`${p.id}:${k}`))
      .map((kind) => ({ person_id: p.id, kind, next_auto_at: new Date(Date.now() + Math.random() * 2 * 3_600_000).toISOString() })),
  );
  if (fresh.length) await db.from('refresh_state').upsert(fresh, { onConflict: 'person_id,kind', ignoreDuplicates: true });

  const { data: due } = await db
    .from('refresh_state')
    .select('person_id, kind')
    .neq('status', 'running')
    .lte('next_auto_at', new Date().toISOString())
    .order('next_auto_at')
    .limit(BATCH);
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const work = [];
  for (const d of due ?? []) {
    const p = byId.get(d.person_id);
    if (!p || !kindsFor(p).includes(d.kind as Kind)) continue;
    const { data: ok } = await db.rpc('claim_refresh', { p_person: d.person_id, p_kind: d.kind, p_auto: true });
    if (ok) work.push({ p, kind: d.kind as Kind });
  }
  EdgeRuntime.waitUntil((async () => { for (const w of work) await run(db, w.p, w.kind); })());
  return json({ seeded: fresh.length, started: work.length });
});
