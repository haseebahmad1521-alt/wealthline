// shortcut: native builds don't receive web activation links yet; wire the deep link here when they ship.
export function takeActivation(): { access_token: string; refresh_token: string } | null {
  return null;
}
