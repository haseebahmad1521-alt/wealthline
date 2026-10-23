export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Reads the `session_id` claim from a JWT we just received from Supabase Auth (no signature check needed). */
export function sessionIdOf(accessToken: string): string | null {
  try {
    const b64 = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claim = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))).session_id;
    return typeof claim === 'string' ? claim : null;
  } catch {
    return null;
  }
}

export function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const isStr = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;

export const isEmail = (v: unknown): v is string => isStr(v, 254) && /^[^\s@]+@[^\s@]+$/.test(v);
