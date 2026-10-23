// Web: localStorage (may be unavailable in private windows; callers tolerate null).
export async function getItem(key: string): Promise<string | null> {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Without storage this device just isn't remembered; sign-in still works with a code.
  }
}
