import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, isEmail, isStr, json, sessionIdOf, sha256Hex } from '../_shared/util.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const { email, password, device_id, device_token } = body;
  if (!isEmail(email) || !isStr(password, 256) || !isStr(device_id, 100) || (device_token != null && !isStr(device_token, 200))) {
    return json({ error: 'Invalid request.' }, 400);
  }

  const anon = createClient(url, anonKey, noSession);
  const admin = createClient(url, serviceKey, noSession);

  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    if (error?.code === 'email_not_confirmed') {
      return json({ error: 'Confirm your email first. Check your inbox for the activation link.' }, 403);
    }
    return json({ error: 'Email or password is incorrect.' }, 401);
  }
  const { session, user } = data;
  const sessionId = sessionIdOf(session.access_token);
  if (!sessionId) return json({ error: 'Sign-in failed. Try again.' }, 500);

  // Trusted device: same device id, matching token hash, not expired.
  if (device_token) {
    const { data: row } = await admin
      .from('trusted_devices')
      .select('token_hash, expires_at')
      .eq('user_id', user.id)
      .eq('device_id', device_id)
      .maybeSingle();
    if (row && row.token_hash === (await sha256Hex(device_token as string)) && new Date(row.expires_at) > new Date()) {
      const ins = await admin.from('verified_sessions').insert({ session_id: sessionId, user_id: user.id });
      if (ins.error) return json({ error: 'Sign-in failed. Try again.' }, 500);
      return json({ session: { access_token: session.access_token, refresh_token: session.refresh_token } });
    }
  }

  // New device: drop the password-only session, then require the emailed code.
  await admin.auth.admin.signOut(session.access_token, 'local');

  // Keep the attempt count while a challenge is live so re-signing-in cannot reset the 5-try limit.
  const { data: existing } = await admin
    .from('device_challenges')
    .select('attempts, expires_at')
    .eq('user_id', user.id)
    .eq('device_id', device_id)
    .maybeSingle();
  const live = existing && new Date(existing.expires_at) > new Date();
  const attempts = live ? existing.attempts : 0;
  await admin.from('device_challenges').upsert({
    user_id: user.id,
    device_id,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    attempts,
  });
  if (attempts < 5) {
    // Sends the Magic Link template, which carries the 6-digit {{ .Token }}.
    await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  }
  return json({ mfa_required: true });
});
