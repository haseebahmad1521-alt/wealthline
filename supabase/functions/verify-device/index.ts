import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, isEmail, isStr, json, randomToken, sessionIdOf, sha256Hex } from '../_shared/util.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const bad = () => json({ error: 'That code is incorrect or expired.' }, 401);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const { email, code, device_id } = body;
  if (!isEmail(email) || typeof code !== 'string' || !/^\d{6}$/.test(code) || !isStr(device_id, 100)) {
    return json({ error: 'Invalid request.' }, 400);
  }

  const admin = createClient(url, serviceKey, noSession);
  const anon = createClient(url, anonKey, noSession);

  // User lookup: the service-only SQL function public.auth_user_id_by_email (one indexed query),
  // instead of paging auth.admin.listUsers.
  const { data: userId } = await admin.rpc('auth_user_id_by_email', { p_email: email });
  if (!userId) return bad();

  const { data: ch } = await admin
    .from('device_challenges')
    .select('attempts, expires_at')
    .eq('user_id', userId)
    .eq('device_id', device_id)
    .maybeSingle();
  if (!ch || new Date(ch.expires_at) <= new Date() || ch.attempts >= 5) return bad();

  // Count the attempt before checking the code so a failure cannot be retried for free.
  // Conditional on the value read, so concurrent guesses cannot all use the same slot.
  const bump = await admin
    .from('device_challenges')
    .update({ attempts: ch.attempts + 1 })
    .eq('user_id', userId)
    .eq('device_id', device_id)
    .eq('attempts', ch.attempts)
    .select('user_id');
  if (bump.error || !bump.data?.length) return bad();

  const { data, error } = await anon.auth.verifyOtp({ email, token: code, type: 'email' });
  const sessionId = data.session ? sessionIdOf(data.session.access_token) : null;
  if (error || !data.session || data.user?.id !== userId || !sessionId) return bad();

  const deviceToken = randomToken();
  const [vs, td] = await Promise.all([
    admin.from('verified_sessions').insert({ session_id: sessionId, user_id: userId }),
    admin.from('trusted_devices').upsert(
      {
        user_id: userId,
        device_id,
        token_hash: await sha256Hex(deviceToken),
        expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      },
      { onConflict: 'user_id,device_id' },
    ),
  ]);
  if (vs.error || td.error) return json({ error: 'Sign-in failed. Try again.' }, 500);
  await admin.from('device_challenges').delete().eq('user_id', userId).eq('device_id', device_id);

  return json({
    session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    device_token: deviceToken,
  });
});
