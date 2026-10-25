// Visit-triggered refresh. Anyone may call it (no secret in the app): each kind runs only when its data is stale
// for this person's rank tier and no run is in progress, and at most MAX_RUNNING runs happen at once overall,
// so visits cannot hammer the sources or the server. Responds immediately; the work continues in the background
// and the page watches the rows arrive over Realtime.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { kindsFor, PERSON_COLUMNS, run } from '../_shared/refresh.ts';
import { cors, json } from '../_shared/util.ts';

const MAX_RUNNING = 8;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (typeof body.person_id !== 'string' || !uuid.test(body.person_id)) return json({ error: 'Invalid request.' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: person } = await db.from('people').select(PERSON_COLUMNS).eq('id', body.person_id).maybeSingle();
  if (!person) return json({ error: 'Not found.' }, 404);

  const { count } = await db
    .from('refresh_state')
    .select('person_id', { count: 'exact', head: true })
    .eq('status', 'running')
    .gt('started_at', new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) >= MAX_RUNNING) return json({ started: [], busy: true });

  const started = [];
  for (const kind of kindsFor(person)) {
    const { data: ok } = await db.rpc('claim_refresh', { p_person: person.id, p_kind: kind, p_auto: false });
    if (ok) started.push(kind);
  }
  if (started.length) EdgeRuntime.waitUntil(Promise.all(started.map((k) => run(db, person, k))));
  return json({ started });
});
