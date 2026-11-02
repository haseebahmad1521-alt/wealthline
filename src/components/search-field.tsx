// The app's one search field (owner, Nov 2, 2026). The web chrome hosts it (top nav on desktop, beside the floating
// tab bar on phones); native screens show it inline at the top of each tab via <PageSearch />.
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/glass';
import { Icon, icons, minTouch } from '@/components/ui';
import { searchCopy, setSearch, useSearch, useSuggestions, type SearchContext } from '@/lib/search';
import { color, font, radius, space, type } from '@/theme';

/**
 * `onDismiss`: the field can be closed (phones); its button then always shows and closing also clears the query.
 * Without it the button only clears, and only once there's something to clear.
 */
export function SearchField({
  context,
  autoFocus,
  onDismiss,
  style,
}: {
  context: SearchContext;
  autoFocus?: boolean;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const query = useSearch(context);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // The whole pill shows focus (a ring on the input alone would draw a box inside it).
  const [focused, setFocused] = useState(false);
  const { placeholder, label } = searchCopy[context];
  const close = () => {
    setSearch(context, '');
    if (onDismiss) onDismiss();
    else input.current?.focus();
  };
  return (
    <Glass radius={radius.pill} style={[styles.field, focused && styles.focused, style]}>
      <Icon name={icons.search} size={18} tint={color.textSecondary} />
      <TextInput
        ref={input}
        value={query}
        onChangeText={(t) => setSearch(context, t)}
        placeholder={placeholder}
        placeholderTextColor={color.textSecondary}
        accessibilityLabel={label}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        // Web: the pill draws the ring (public/index.html skips the global one for this input).
        {...({ dataSet: { ring: 'container' } } as object)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="search"
        enterKeyHint="search"
        onKeyPress={(e) => {
          if (e.nativeEvent.key === 'Escape') close();
        }}
        style={styles.input}
      />
      {(onDismiss || query.length > 0) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={onDismiss ? 'Close search' : 'Clear search'}
          onPress={close}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.clear, (pressed || hovered) && styles.clearOn]}>
          <Icon name={icons.close} size={16} tint={color.textSecondary} />
        </Pressable>
      )}
    </Glass>
  );
}

/** Matches a screen published for its query (World), as a glass list beside the field. Null while there are none to show. */
export function SearchSuggestions({ context, onPicked, style }: { context: SearchContext; onPicked?: () => void; style?: StyleProp<ViewStyle> }) {
  const query = useSearch(context).trim();
  const list = useSuggestions(context);
  if (!query || !list) return null;
  return (
    <Glass radius={radius.lg} style={[styles.panel, style]}>
      <View accessibilityLiveRegion="polite">
        <Text style={[type.caption, styles.count]}>{list.length ? `${list.length} ${list.length === 1 ? 'match' : 'matches'}` : `Nothing matches “${query}”.`}</Text>
      </View>
      {list.map((s) => (
        <Pressable
          key={s.key}
          accessibilityRole="button"
          accessibilityLabel={`${s.label}, ${s.detail}`}
          accessibilityHint="Turns the globe to it"
          onPress={() => {
            s.onPick();
            setSearch(context, '');
            onPicked?.();
          }}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.row, (pressed || hovered) && styles.rowOn]}>
          <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>{s.label}</Text>
          <Text style={[type.caption, { color: color.textSecondary }]} numberOfLines={1}>{s.detail}</Text>
        </Pressable>
      ))}
    </Glass>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', minHeight: minTouch + 8, paddingLeft: space.md, gap: space.sm },
  focused: { outlineWidth: 2, outlineStyle: 'solid', outlineColor: color.action, outlineOffset: 2 } as object,
  input: { flex: 1, minWidth: 0, minHeight: minTouch, fontFamily: font.regular, fontSize: 16, color: color.text, outlineStyle: 'none' } as object,
  clear: { width: minTouch, height: minTouch, marginRight: 4, borderRadius: minTouch / 2, alignItems: 'center', justifyContent: 'center' },
  clearOn: { backgroundColor: color.fill },
  panel: { padding: 6, gap: 2 },
  count: { color: color.textSecondary, paddingHorizontal: space.sm + 4, paddingVertical: space.xs },
  row: { minHeight: minTouch, paddingHorizontal: space.sm + 4, paddingVertical: space.xs + 2, borderRadius: radius.md, justifyContent: 'center', gap: 1 },
  rowOn: { backgroundColor: color.fill },
});
