// Email-link sign-in. The session from an email link becomes a device-verified session in two cases:
// - activation: the signup confirmation link, first verified session ever, email confirmed in the last 15 minutes;
// - new device: the sign-in link that `sign-in` emailed after checking the password, opened on the device
//   that holds the live challenge (the built-in Supabase sender can't show the 6-digit code, only this link).
// Clicking the link proves inbox control, the same factor the emailed code proves.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, fromEmailLink, isStr, json, randomToken, sessionIdOf, sha256Hex } from '../_shared/util.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WINDOW_MS = 15 * 60_000;
const denied = () =>
  json({ error: 'That link was already used, has expired, or was opened on another device. Sign in to continue.' }, 403);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const { access_token, device_id } = body;
  if (!isStr(access_token, 4096) || !isStr(device_id, 100)) return json({ error: 'Invalid request.' }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // getUser validates the token with Auth (signature + expiry), unlike decoding it ourselves.
  const { data, error } = await admin.auth.getUser(access_token);
  const user = data?.user;
  const sessionId = sessionIdOf(access_token);
  if (error || !user || !sessionId) return json({ error: 'Invalid or expired session.' }, 401);

  // Only link sessions: a password session from the public API must not pass either path.
  if (!fromEmailLink(access_token, WINDOW_MS)) return denied();

  const confirmed = user.email_confirmed_at ? Date.parse(user.email_confirmed_at) : 0;
  const prior = await admin.from('verified_sessions').select('session_id', { count: 'exact', head: true }).eq('user_id', user.id);
  if (prior.error) return json({ error: 'Sign-in failed. Try again.' }, 500);
  const activation = confirmed > 0 && Date.now() - confirmed <= WINDOW_MS && (prior.count ?? 0) === 0;

  if (!activation) {
    const { data: ch } = await admin
      .from('device_challenges')
      .select('attempts, expires_at')
      .eq('user_id', user.id)
      .eq('device_id', device_id)
      .maybeSingle();
    if (!ch || new Date(ch.expires_at) <= new Date() || ch.attempts >= 5) return denied();
    // One link, one sign-in: removing the challenge (only if still present) stops a replay on this device.
    const del = await admin.from('device_challenges').delete().eq('user_id', user.id).eq('device_id', device_id).select('user_id');
    if (del.error || !del.data?.length) return denied();
  }

  const deviceToken = randomToken();
  const [vs, td] = await Promise.all([
    admin.from('verified_sessions').insert({ session_id: sessionId, user_id: user.id }),
    admin.from('trusted_devices').upsert(
      {
        user_id: user.id,
        device_id,
        token_hash: await sha256Hex(deviceToken),
        expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      },
      { onConflict: 'user_id,device_id' },
    ),
  ]);
  if (vs.error || td.error) return json({ error: 'Sign-in failed. Try again.' }, 500);
  return json({ device_token: deviceToken, email: user.email, activated: activation });
});
