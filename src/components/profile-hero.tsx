import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useHeaderHeight } from 'expo-router/react-navigation';
import * as WebBrowser from 'expo-web-browser';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Icon, icons, minTouch } from '@/components/ui';
import type { Person } from '@/lib/data';
import { color, desktopBreakpoint, font, radius, space, type } from '@/theme';

/**
 * Photographic hero with the slim identity band along its top edge, directly under the
 * (transparent) navigation bar. Frosted on iOS/web; a near-solid tint where blur is unavailable,
 * so the name stays readable over any photograph.
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
  const { width } = useWindowDimensions();
  const desktop = width >= desktopBreakpoint;
  const headerHeight = useHeaderHeight();
  const height = desktop ? 460 : Math.min(Math.round(width * 1.15), 560);
  const identity = [person.rank ? `No. ${person.rank}` : null, person.main_source, person.citizenship]
    .filter(Boolean)
    .join(' · ');
  // Android's BlurView is costly and inconsistent; use the solid fallback there.
  const blur = Platform.OS !== 'android';

  return (
    <View style={[styles.hero, { height: height + headerHeight }, desktop && styles.heroDesktop]}>
      {person.portrait_url ? (
        <Image
          source={person.portrait_url}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          transition={200}
          accessibilityLabel={`Portrait of ${person.name}`}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noPhoto]} />
      )}

      <View style={[styles.band, { top: headerHeight }]}>
        {blur && <BlurView intensity={40} tint="systemChromeMaterialLight" style={StyleSheet.absoluteFill} />}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: blur ? 'rgba(251,251,253,0.62)' : 'rgba(251,251,253,0.94)' }]} />
        <View style={styles.bandText}>
          <Text accessibilityRole="header" style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {person.name}
          </Text>
          {!!identity && (
            <Text style={styles.identity} numberOfLines={1}>
              {identity}
            </Text>
          )}
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
          <Icon name={icons.link} size={11} tint="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { overflow: 'hidden', backgroundColor: color.fill, marginHorizontal: -space.md, marginTop: -space.md },
  heroDesktop: { marginHorizontal: 0, marginTop: 0, borderRadius: radius.lg },
  noPhoto: { backgroundColor: color.fill },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.md,
    paddingRight: space.xs,
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  bandText: { flex: 1, minWidth: 0, paddingVertical: space.sm },
  name: { fontFamily: font.bold, fontSize: 20, lineHeight: 24, letterSpacing: -0.5, color: color.text },
  identity: { ...type.caption, color: color.textSecondary },
  watch: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  credit: {
    position: 'absolute',
    right: space.sm,
    bottom: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '80%',
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(29,29,31,0.55)',
  },
  creditText: { fontFamily: font.medium, fontSize: 11, color: '#FFFFFF' },
});
