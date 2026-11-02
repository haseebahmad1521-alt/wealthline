// shortcut: native builds don't receive web activation links yet; wire the deep link here when they ship.
export function takeActivation(): { access_token: string; refresh_token: string } | null {
  return null;
}

// Native sign-in with Google / Apple returns through the in-app browser session instead (`signInWithProvider`).
export function takeOAuthReturn(): { access_token: string; refresh_token: string } | 'failed' | null {
  return null;
}
