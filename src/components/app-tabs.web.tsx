import { Link, usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps, type TabsDescriptor, type TabsSlotRenderOptions } from 'expo-router/ui';
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
import { color, contentWidth, desktopBreakpoint, font, glass, space, type } from '@/theme';

const tabs: { name: string; href: '/' | '/world' | '/projects' | '/watchlist'; label: string; icon: IconName }[] = [
  { name: 'index', href: '/', label: 'Rankings', icon: icons.rankings },
  { name: 'world', href: '/world', label: 'World', icon: icons.world },
  { name: 'projects', href: '/projects', label: 'Projects', icon: icons.projects },
  { name: 'watchlist', href: '/watchlist', label: 'Watchlist', icon: icons.starFill },
];

/** Desktop top bar. Link-based so it also works as the header of Stack screens above the tabs. */
export function TopNav() {
  const pathname = usePathname();
  const { session } = useAuth();
  return (
    <View style={styles.top}>
      <View accessibilityRole="tablist" style={styles.topInner}>
        <View style={styles.brand}>
          <Image source={require('../../public/icons/wealthline.svg')} style={styles.logo} accessibilityIgnoresInvertColors />
          <Text style={styles.brandText}>Wealthline</Text>
        </View>
        {tabs.map((t) => {
          const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
          return (
            <Link key={t.name} href={t.href} asChild>
              <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} style={styles.topTabOuter}>
                {({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => (
                  <View style={[styles.topTab, active && styles.topTabActive, (hovered || pressed) && !active && styles.hover]}>
                    <Text style={[styles.topLabel, { color: active ? color.text : color.textSecondary }]}>{t.label}</Text>
                  </View>
                )}
              </Pressable>
            </Link>
          );
        })}
        <Link href="/account" style={styles.account}>
          {session ? 'Account' : 'Sign in'}
        </Link>
      </View>
    </View>
  );
}

// Web: top navigation on desktop, bottom tab bar on phones.
export default function AppTabs() {
  const desktop = useWindowDimensions().width >= desktopBreakpoint;
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const current = Math.max(0, tabs.findIndex((t) => (t.href === '/' ? pathname === '/' : pathname.startsWith(t.href))));

  // On desktop the triggers stay mounted (Tabs needs them for routing) but hidden; TopNav is the visible bar.
  const list = (
    <TabList asChild>
      <View
        accessibilityRole="tablist"
        style={desktop ? styles.hidden : StyleSheet.flatten([styles.bottom, { paddingBottom: Math.max(insets.bottom, 6) }])}>
        {tabs.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton icon={t.icon} label={t.label} desktop={false} />
          </TabTrigger>
        ))}
      </View>
    </TabList>
  );

  return (
    <Tabs style={styles.root}>
      {desktop && <TopNav />}
      {desktop && list}
      <TabSlot style={styles.slot} renderFn={(d, o) => <EasedScreen key={d.route.key} descriptor={d} options={o} current={current} />} />
      {!desktop && list}
    </Tabs>
  );
}

// One scene, not pages (owner, Nov 1, 2026): every visited tab stays mounted in the same frame. Changing tabs fades the
// new view in while it slides a little from the side you're heading to, and the old one drifts away and fades out; the
// planet behind keeps going. Hidden views can't be tapped, focused or read. Reduced motion: an instant swap.
const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.2,.8,.2,1)';

function EasedScreen({ descriptor, options, current }: { descriptor: TabsDescriptor; options: TabsSlotRenderOptions; current: number }) {
  const { isFocused, loaded, index } = options;
  if (!loaded && !isFocused) return null;
  const shift = isFocused ? 0 : index < current ? -28 : 28;
  return (
    <View
      aria-hidden={!isFocused}
      pointerEvents={isFocused ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: isFocused ? 1 : 0,
          transform: `translate3d(${shift}px,0,0) scale(${isFocused ? 1 : 0.985})`,
          // Hide fully once faded so nothing behind is focusable; show immediately when coming in.
          visibility: isFocused ? 'visible' : 'hidden',
          transition: reduceMotion
            ? 'none'
            : isFocused
              ? `opacity 360ms ${EASE}, transform 480ms ${EASE}, visibility 0s`
              : `opacity 260ms ease, transform 420ms ${EASE}, visibility 0s linear 420ms`,
        } as unknown as ViewStyle,
      ]}>
      {descriptor.render()}
    </View>
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
        style={desktop ? styles.topTabOuter : styles.bottomTabOuter}>
        {/* Inner view carries state styling: TabTrigger asChild (Slot) drops function styles. */}
        {({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => (
          <View
            style={[
              desktop ? styles.topTab : styles.bottomTab,
              desktop && isFocused && styles.topTabActive,
              (hovered || pressed) && !isFocused && styles.hover,
            ]}>
            {!desktop && <Icon name={icon} size={24} tint={tint} />}
            <Text style={[desktop ? styles.topLabel : styles.bottomLabel, { color: tint }]}>{label}</Text>
          </View>
        )}
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  slot: { flex: 1, position: 'relative' },
  hidden: { display: 'none' },
  top: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
    backgroundColor: glass.tint,
    // Web-only: sticky Liquid Glass bar over the planet scene.
    ...({ backdropFilter: glass.backdrop, WebkitBackdropFilter: glass.backdrop, position: 'sticky', top: 0 } as unknown as ViewStyle),
    zIndex: 10,
  },
  topInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    width: '100%',
    // Padding sits outside the 1120 content width so brand and links align with page content.
    maxWidth: contentWidth + 2 * space.md,
    alignSelf: 'center',
    paddingHorizontal: space.md,
    height: 56,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginRight: 'auto' },
  logo: { width: 28, height: 28 },
  brandText: { fontFamily: font.bold, fontSize: 17, letterSpacing: -0.4, color: color.text },
  topTabOuter: {},
  bottomTabOuter: { flex: 1 },
  topTab: { paddingHorizontal: 14, height: 36, justifyContent: 'center', borderRadius: 18 },
  topTabActive: { backgroundColor: color.fill },
  topLabel: { fontFamily: font.medium, fontSize: 14 },
  hover: { backgroundColor: color.fill },
  account: { ...type.caption, fontSize: 14, color: color.action, marginLeft: space.md, paddingHorizontal: space.sm },
  bottom: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    backgroundColor: glass.tint,
    ...({ backdropFilter: glass.backdrop, WebkitBackdropFilter: glass.backdrop } as unknown as ViewStyle),
    paddingTop: 6,
  },
  bottomTab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' },
  bottomLabel: { fontFamily: font.medium, fontSize: 11 },
});
