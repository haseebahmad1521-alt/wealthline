// The tab the visitor was last on, kept for the browser session, so a profile opened without history (a refresh, a
// shared link, a relaunched home-screen app) goes back to that tab instead of always to Rankings.
const KEY = 'wl-last-tab';
const store = () => (globalThis as { sessionStorage?: Storage }).sessionStorage;

export function rememberTab(href: string) {
  try {
    store()?.setItem(KEY, href);
  } catch {
    // Storage blocked (private mode): Back falls back to Rankings.
  }
}

export function lastTab(): string {
  try {
    return store()?.getItem(KEY) ?? '/';
  } catch {
    return '/';
  }
}
