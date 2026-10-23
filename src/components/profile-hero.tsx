import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Icon, Portrait, icons, minTouch } from '@/components/ui';
import type { Person } from '@/lib/data';
import { color, desktopBreakpoint, font, radius, shadow, space, type } from '@/theme';

/**
 * Frosted hero: the portrait itself, heavily blurred, gives each profile its own colour field;
 * the crisp portrait sits on the left with the identity to its right.
 * All hero text uses the primary colour, which stays ≥ 4.5:1 over the frost on any photograph.
 */
export function ProfileHero({
  person,
  watched,
  onToggleWatch,
  watchPending,
}: {
  person: Person;
  watched: boolean;
  onToggleWatch: () => void;
  watchPending: boolean;
}) {
  const desktop = useWindowDimensions().width >= desktopBreakpoint;
  const size = desktop ? 152 : 88;
  const identity = [person.rank ? `No. ${person.rank}` : null, person.main_source].filter(Boolean).join(' · ');

  return (
    <View style={[styles.hero, desktop && styles.heroDesktop]}>
      {person.portrait_url && (
        <Image
          source={person.portrait_url}
          style={styles.bg}
          contentFit="cover"
          blurRadius={desktop ? 80 : 50}
          accessible={false}
        />
      )}
      <View style={[StyleSheet.absoluteFill, styles.frost]} />

      <View style={styles.row}>
        <View style={[styles.portrait, { width: size, height: size }]}>
          <Portrait uri={person.portrait_url} name={person.name} size={size} rounded={desktop ? 32 : 22} />
        </View>
        <View style={[styles.identity, styles.clearStar]}>
          <Text accessibilityRole="header" style={[styles.name, desktop && styles.nameDesktop]}>
            {person.name}
          </Text>
          {!!identity && <Text style={styles.meta} numberOfLines={2}>{identity}</Text>}
          {!!person.citizenship && <Text style={styles.meta} numberOfLines={1}>{person.citizenship}</Text>}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={watched ? `Remove ${person.name} from watchlist` : `Add ${person.name} to watchlist`}
          accessibilityState={{ selected: watched, busy: watchPending }}
          disabled={watchPending}
          onPress={onToggleWatch}
          style={({ pressed }) => [styles.watch, pressed && { opacity: 0.6 }]}>
          <Icon name={watched ? icons.starFill : icons.star} size={22} tint={watched ? color.action : color.text} />
        </Pressable>
      </View>

      {person.portrait_url && person.portrait_page_url && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Photo by ${person.portrait_author ?? 'unknown'}, ${person.portrait_license ?? 'license'}. Opens the source and license.`}
          onPress={() => void WebBrowser.openBrowserAsync(person.portrait_page_url!)}
          hitSlop={8}
          style={styles.credit}>
          <Text style={styles.creditText} numberOfLines={1}>
            Photo: {person.portrait_author} · {person.portrait_license}
          </Text>
          <Icon name={icons.link} size={11} tint={styles.creditText.color} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: color.fill,
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    gap: space.md,
    ...shadow,
  },
  heroDesktop: { paddingHorizontal: space.xl, paddingTop: space.xl },
  // Oversized so the blur's soft edges fall outside the rounded card.
  bg: { position: 'absolute', top: '-25%', left: '-25%', width: '150%', height: '150%' },
  // 50% frost keeps the photo's colour; worst case (near-black photo) still gives #1D1D1F ≥ 4.5:1.
  frost: { backgroundColor: 'rgba(251,251,253,0.5)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  portrait: { borderRadius: 32, ...shadow, shadowOpacity: 0.16 },
  identity: { flex: 1, minWidth: 0, gap: 4 },
  name: { ...type.title, fontSize: 24, lineHeight: 28, letterSpacing: -0.6, color: color.text },
  nameDesktop: { ...type.display },
  meta: { ...type.caption, fontSize: 15, lineHeight: 20, color: color.text },
  watch: { position: 'absolute', top: -space.sm, right: -space.sm, width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  clearStar: { paddingRight: minTouch - space.sm },
  credit: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', minHeight: 28 },
  creditText: { fontFamily: font.medium, fontSize: 12, color: color.text },
});
