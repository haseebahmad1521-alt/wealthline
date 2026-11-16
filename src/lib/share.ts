// Share a simulation: a link that reopens the same scenario, match or dial settings on World → What if, and the
// phone's share sheet (or the clipboard) to send it with a one-line result.
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

import type { SimLink } from './share-params.ts';

export { readSimParams, simParams, type SimLink } from './share-params.ts';

/** The full link. On the web it keeps the app's base path (GitHub Pages serves the app under /wealthline/app). */
export function simUrl(p: SimLink): string {
  const query = Object.entries({ view: 'whatif', ...p }).filter(([, v]) => v !== undefined) as [string, string][];
  if (Platform.OS !== 'web') return Linking.createURL('/world', { queryParams: Object.fromEntries(query) });
  return `${window.location.origin}${process.env.EXPO_PUBLIC_BASE_URL ?? ''}/world?${new URLSearchParams(query).toString()}`;
}

/** Opens the share sheet; on the web without one, copies the link. */
export async function shareSim(text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    try {
      if (nav?.share) {
        await nav.share({ text, url });
        return 'shared';
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'shared'; // the person closed the sheet
    }
    try {
      await nav?.clipboard?.writeText(`${text} ${url}`);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  try {
    await Share.share({ message: `${text} ${url}`, url });
    return 'shared';
  } catch {
    return 'failed';
  }
}
