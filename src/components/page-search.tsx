// Native: the shared search sits inline at the top of each tab (the web chrome hosts it instead; see page-search.web).
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { SearchField, SearchSuggestions } from '@/components/search-field';
import type { SearchContext } from '@/lib/search';
import { space } from '@/theme';

export function PageSearch({ context, style }: { context: SearchContext; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: space.sm }, style]}>
      <SearchField context={context} />
      <SearchSuggestions context={context} />
    </View>
  );
}
