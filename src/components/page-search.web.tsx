import type { StyleProp, ViewStyle } from 'react-native';

import type { SearchContext } from '@/lib/search';

/** Web: the app chrome hosts the one search field (app-tabs.web), so pages render nothing here. */
export function PageSearch(_: { context: SearchContext; style?: StyleProp<ViewStyle> }): null {
  return null;
}
