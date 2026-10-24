import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { takeActivation } from './activation';
import { getItem, setItem } from './device-store';
import { db } from './supabase';

// shortcut: Google and Apple sign-in are not wired yet; add signInWithIdToken flows here for store publication.

export { passwordRules, type PasswordRule } from './password-rules';

export async function deviceId(): Promise<string> {
  const existing = await getItem('wl.device_id');
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await setItem('wl.device_id', id);
  return id;
}

// Trust tokens are per account: one device can be trusted for several emails.
async function tokenFor(email: string): Promise<string | undefined> {
  try {
    return JSON.parse((await getItem('wl.device_tokens')) ?? '{}')[email.toLowerCase()];
  } catch {
    return undefined;
  }
}

async function saveToken(email: string, token: string) {
  let all: Record<string, string> = {};
  try {
    all = JSON.parse((await getItem('wl.device_tokens')) ?? '{}');
  } catch {
    // corrupt value: start over
  }
  all[email.toLowerCase()] = token;
  await setItem('wl.device_tokens', JSON.stringify(all));
}

type Tokens = { access_token: string; refresh_token: string };

async function call<T>(name: string, body: object): Promise<T> {
  const { data, error } = await db().functions.invoke(name, { body });
  if (error) {
    let message = 'Could not reach the server. Try again.';
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (typeof j?.error === 'string') message = j.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return data as T;
}

async function adopt(session: Tokens) {
  const r = await db().auth.setSession(session);
  if (r.error) throw new Error('Sign-in failed. Try again.');
}

/** Returns 'mfa' when an emailed code is needed on this device. */
export async function signIn(email: string, password: string): Promise<'signed-in' | 'mfa'> {
  const r = await call<{ session?: Tokens; mfa_required?: boolean }>('sign-in', {
    email,
    password,
    device_id: await deviceId(),
    device_token: await tokenFor(email),
    redirect_to: appUrl('/account'),
  });
  if (r.session) {
    await adopt(r.session);
    return 'signed-in';
  }
  return 'mfa';
}

export async function verifyDevice(email: string, code: string): Promise<void> {
  const r = await call<{ session: Tokens; device_token: string }>('verify-device', {
    email,
    code,
    device_id: await deviceId(),
  });
  await saveToken(email, r.device_token);
  await adopt(r.session);
}

// Links in emails must include the app's base path (e.g. /wealthline/app on GitHub Pages);
// expo-linking's web createURL drops it, which made Supabase fall back to the front page.
function appUrl(path: string) {
  if (Platform.OS !== 'web') return Linking.createURL(path);
  return `${window.location.origin}${process.env.EXPO_PUBLIC_BASE_URL ?? ''}${path}`;
}

/** Signs in with the session from an email link (activation or new device), if this page was opened from one. */
export async function activate(): Promise<'activated' | 'signed-in' | null> {
  const session = takeActivation();
  if (!session) return null;
  const r = await call<{ device_token: string; email: string; activated: boolean }>('activate', {
    access_token: session.access_token,
    device_id: await deviceId(),
  });
  await saveToken(r.email, r.device_token);
  await adopt(session);
  return r.activated ? 'activated' : 'signed-in';
}

export async function signUp(email: string, password: string): Promise<void> {
  const r = await db().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: appUrl('/account?activated=1') },
  });
  if (r.error) throw new Error(r.error.message);
}

export async function resetPassword(email: string): Promise<void> {
  // Same response whether or not the email exists.
  await db().auth.resetPasswordForEmail(email, { redirectTo: appUrl('/account') });
}

export async function signOut(): Promise<void> {
  await db().auth.signOut();
}
