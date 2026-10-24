// Email links (signup confirmation, new-device sign-in) return with the session in the URL fragment
// (#access_token=…&type=signup|magiclink).
// Capture it at start-up, before routing, and wipe it from the address bar so tokens never linger in history.
type Pending = { access_token: string; refresh_token: string };

let pending: Pending | null = null;

if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const access_token = h.get('access_token');
  const refresh_token = h.get('refresh_token');
  if ((h.get('type') === 'signup' || h.get('type') === 'magiclink') && access_token && refresh_token) pending = { access_token, refresh_token };
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

/** The email-link session, once; null if the page wasn't opened from an email link. */
export function takeActivation(): Pending | null {
  const p = pending;
  pending = null;
  // Clear again here: the router restores the initial URL (fragment included) after start-up.
  if (typeof window !== 'undefined' && window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
  return p;
}
