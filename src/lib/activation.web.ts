// Email links (signup confirmation, new-device sign-in) return with the session in the URL fragment
// (#access_token=…&type=signup|magiclink).
// Capture it at start-up, before routing, and wipe it from the address bar so tokens never linger in history.
type Pending = { access_token: string; refresh_token: string };

let pending: Pending | null = null;
// Google / Apple return to /account?oauth=1 with the provider's session (or an error) in the fragment.
let oauth: Pending | 'failed' | null = null;

if (typeof window !== 'undefined' && /access_token=|error=/.test(window.location.hash)) {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const access_token = h.get('access_token');
  const refresh_token = h.get('refresh_token');
  if (new URLSearchParams(window.location.search).has('oauth')) {
    oauth = access_token && refresh_token ? { access_token, refresh_token } : 'failed';
  } else if ((h.get('type') === 'signup' || h.get('type') === 'magiclink') && access_token && refresh_token) {
    pending = { access_token, refresh_token };
  }
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

/** The Google / Apple session this page was opened with, once ('failed' if the provider returned an error). */
export function takeOAuthReturn(): Pending | 'failed' | null {
  const o = oauth;
  oauth = null;
  if (o && typeof window !== 'undefined') history.replaceState(history.state, '', window.location.pathname);
  return o;
}

/** The email-link session, once; null if the page wasn't opened from an email link. */
export function takeActivation(): Pending | null {
  const p = pending;
  pending = null;
  // Clear again here: the router restores the initial URL (fragment included) after start-up.
  if (typeof window !== 'undefined' && window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
  return p;
}
