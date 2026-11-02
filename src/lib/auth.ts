import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { takeActivation, takeOAuthReturn } from './activation';
import { getItem, setItem } from './device-store';
import { db } from './supabase';

// shortcut: Google and Apple use the browser OAuth flow on every platform; native Sign in with Apple
// (expo-apple-authentication + signInWithIdToken) is needed before App Store review.

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

/**
 * Signs in, or creates the account when the email is new. 'mfa': an emailed code is needed on this device.
 * 'check-email': either a new account's activation link was sent or the password didn't match; the server
 * answers both the same way so the form never reveals whether an account exists.
 */
export async function confirm(email: string, password: string): Promise<'signed-in' | 'mfa' | 'check-email'> {
  const r = await call<{ session?: Tokens; mfa_required?: boolean; check_email?: boolean }>('sign-in', {
    email,
    password,
    device_id: await deviceId(),
    device_token: await tokenFor(email),
    redirect_to: appUrl('/account'),
    activate_to: appUrl('/account?activated=1'),
  });
  if (r.session) {
    await adopt(r.session);
    return 'signed-in';
  }
  return r.mfa_required ? 'mfa' : 'check-email';
}

export type Provider = 'google' | 'apple';

/** Providers switched on in Supabase Auth (public settings), so buttons appear once the owner enables them. */
export async function enabledProviders(): Promise<Provider[]> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const external = (await r.json())?.external ?? {};
    return (['apple', 'google'] as const).filter((p) => external[p] === true);
  } catch {
    return [];
  }
}

type OAuthResult = { status: 'signed-in' } | { status: 'mfa'; email: string } | { status: 'cancelled' };

/**
 * Google / Apple sign-in. The provider proves who it is, but like a password it doesn't trust the device:
 * `sign-in` keeps the session only for a trusted device and otherwise emails the account's code (owner, Nov 2, 2026).
 * Web leaves the page and comes back through `resumeOAuth`; native finishes here.
 */
export async function signInWithProvider(provider: Provider): Promise<OAuthResult> {
  const redirectTo = appUrl('/account?oauth=1');
  const native = Platform.OS !== 'web';
  const { data, error } = await db().auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: native } });
  if (error || !data.url) throw new Error('Could not start sign-in. Try again.');
  if (!native) return { status: 'cancelled' }; // the browser is already leaving for the provider
  const r = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (r.type !== 'success') return { status: 'cancelled' };
  const h = new URLSearchParams(r.url.split('#')[1] ?? '');
  const access_token = h.get('access_token');
  const refresh_token = h.get('refresh_token');
  if (!access_token || !refresh_token) throw new Error('Sign-in was not completed. Try again.');
  return finishOAuth({ access_token, refresh_token });
}

/** Web: finishes a Google / Apple sign-in if this page is the provider's return; null otherwise. */
export async function resumeOAuth(): Promise<OAuthResult | null> {
  const r = takeOAuthReturn();
  if (!r) return null;
  if (r === 'failed') throw new Error('Sign-in was cancelled or failed. Try again.');
  return finishOAuth(r);
}

async function finishOAuth(tokens: Tokens): Promise<OAuthResult> {
  const r = await call<{ session?: Tokens; mfa_required?: boolean; email?: string }>('sign-in', {
    ...tokens,
    device_id: await deviceId(),
    device_token: await tokenFor(emailOf(tokens.access_token)),
    redirect_to: appUrl('/account'),
  });
  if (r.session) {
    await adopt(r.session);
    return { status: 'signed-in' };
  }
  if (r.mfa_required && r.email) return { status: 'mfa', email: r.email };
  throw new Error('Sign-in failed. Try again.');
}

// The account email from the provider session's token (only to pick this device's trust token; the server checks it).
function emailOf(accessToken: string): string {
  try {
    const b64 = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const email = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')))?.email;
    return typeof email === 'string' ? email : '';
  } catch {
    return '';
  }
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

export async function resetPassword(email: string): Promise<void> {
  // Same response whether or not the email exists.
  await db().auth.resetPasswordForEmail(email, { redirectTo: appUrl('/account') });
}

/** The name chat greetings use (stored in the user's own metadata; empty clears it). */
export async function setFirstName(name: string): Promise<void> {
  const { error } = await db().auth.updateUser({ data: { first_name: name.trim().slice(0, 40) || null } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await db().auth.signOut();
}
