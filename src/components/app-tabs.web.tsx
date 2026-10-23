import { Link } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Image } from 'expo-image';
import type { ComponentRef, Ref } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type PressableStateCallbackType,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, icons, type IconName } from '@/components/ui';
import { useAuth } from '@/lib/data';
import { color, contentWidth, desktopBreakpoint, font, space, type } from '@/theme';

const tabs: { name: string; href: '/' | '/people' | '/projects' | '/watchlist'; label: string; icon: IconName }[] = [
  { name: 'index', href: '/', label: 'Rankings', icon: icons.rankings },
  { name: 'people', href: '/people', label: 'People', icon: icons.people },
  { name: 'projects', href: '/projects', label: 'Projects', icon: icons.projects },
  { name: 'watchlist', href: '/watchlist', label: 'Watchlist', icon: icons.starFill },
];

// Web: top navigation on desktop, bottom tab bar on phones.
export default function AppTabs() {
  const desktop = useWindowDimensions().width >= desktopBreakpoint;
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const list = (
    <TabList asChild>
      <View
        accessibilityRole="tablist"
        style={desktop ? styles.topInner : StyleSheet.flatten([styles.bottom, { paddingBottom: Math.max(insets.bottom, 6) }])}>
        {desktop && (
          <View style={styles.brand}>
            <Image source={require('../../public/icons/wealthline.svg')} style={styles.logo} accessibilityIgnoresInvertColors />
            <Text style={styles.brandText}>Wealthline</Text>
          </View>
        )}
        {tabs.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton icon={t.icon} label={t.label} desktop={desktop} />
          </TabTrigger>
        ))}
        {desktop && (
          <Link href="/account" style={styles.account}>
            {session ? 'Account' : 'Sign in'}
          </Link>
        )}
      </View>
    </TabList>
  );

  return (
    <Tabs style={styles.root}>
      {desktop && <View style={styles.top}>{list}</View>}
      <TabSlot style={styles.slot} />
      {!desktop && list}
    </Tabs>
  );
}

function TabButton({
  icon,
  label,
  desktop,
  isFocused,
  ref,
  ...props
}: TabTriggerSlotProps & { icon: IconName; label: string; desktop: boolean; ref?: Ref<ComponentRef<typeof View>> }) {
  {
    const tint = isFocused ? (desktop ? color.text : color.action) : color.textSecondary;
    return (
      <Pressable
        ref={ref}
        {...props}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        style={({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
          desktop ? styles.topTab : styles.bottomTab,
          desktop && isFocused && styles.topTabActive,
          (hovered || pressed) && !isFocused && styles.hover,
        ]}>
        {!desktop && <Icon name={icon} size={24} tint={tint} />}
        <Text style={[desktop ? styles.topLabel : styles.bottomLabel, { color: tint }]}>{label}</Text>
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  slot: { flex: 1 },
  top: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
    backgroundColor: 'rgba(251,251,253,0.85)',
    // Web-only: sticky translucent bar, like the platform's own.
    ...({ backdropFilter: 'saturate(180%) blur(20px)', position: 'sticky', top: 0 } as unknown as ViewStyle),
    zIndex: 10,
  },
  topInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    width: '100%',
    maxWidth: contentWidth,
    alignSelf: 'center',
    paddingHorizontal: space.md,
    height: 56,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginRight: 'auto' },
  logo: { width: 28, height: 28 },
  brandText: { fontFamily: font.bold, fontSize: 17, letterSpacing: -0.4, color: color.text },
  topTab: { paddingHorizontal: 14, height: 36, justifyContent: 'center', borderRadius: 18 },
  topTabActive: { backgroundColor: color.fill },
  topLabel: { fontFamily: font.medium, fontSize: 14 },
  hover: { backgroundColor: color.fill },
  account: { ...type.caption, fontSize: 14, color: color.action, marginLeft: space.md, paddingHorizontal: space.sm },
  bottom: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    backgroundColor: 'rgba(251,251,253,0.94)',
    paddingTop: 6,
  },
  bottomTab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' },
  bottomLabel: { fontFamily: font.medium, fontSize: 11 },
});
