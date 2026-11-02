import { Link, useGlobalSearchParams, usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps, type TabsDescriptor, type TabsSlotRenderOptions } from 'expo-router/ui';
import { Image } from 'expo-image';
import { useEffect, useState, type ComponentRef, type Ref } from 'react';
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

import { Glass } from '@/components/glass';
import { SearchField, SearchSuggestions } from '@/components/search-field';
import { Icon, icons, minTouch, type IconName } from '@/components/ui';
import { useKeyboardInset } from '@/lib/keyboard';
import { useChromeHidden } from '@/lib/scene';
import type { SearchContext } from '@/lib/search';
import { useAuth } from '@/lib/data';
import { rememberTab } from '@/lib/last-tab';
import { color, contentWidth, desktopBreakpoint, font, glass, radius, scrim, space, type } from '@/theme';

const tabs: { name: string; href: '/' | '/world' | '/projects' | '/watchlist'; label: string; icon: IconName; search: SearchContext }[] = [
  { name: 'index', href: '/', label: 'Rankings', icon: icons.rankings, search: 'people' },
  { name: 'world', href: '/world', label: 'World', icon: icons.world, search: 'world' },
  { name: 'projects', href: '/projects', label: 'Projects', icon: icons.projects, search: 'projects' },
  { name: 'watchlist', href: '/watchlist', label: 'Watchlist', icon: icons.starFill, search: 'watchlist' },
];
const tabAt = (pathname: string) => tabs.findIndex((t) => (t.href === '/' ? pathname === '/' : pathname.startsWith(t.href)));

/** Desktop top bar. Link-based so it also works as the header of Stack screens above the tabs. */
export function TopNav() {
  const pathname = usePathname();
  const { session } = useAuth();
  // One search field whose meaning follows the tab; screens above the tabs (profiles, account) have none.
  const search = tabs[tabAt(pathname)]?.search;
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
        {search && (
          <View style={styles.topSearch}>
            <SearchField context={search} style={styles.topField} />
            <SearchSuggestions context={search} style={styles.topSuggestions} />
          </View>
        )}
        <Link href="/account" style={styles.account}>
          {session ? 'Account' : 'Sign in'}
        </Link>
      </View>
    </View>
  );
}

// Web: top navigation on desktop, bottom tab bar on phones.
export default function AppTabs() {
  const { width } = useWindowDimensions();
  const desktop = width >= desktopBreakpoint;
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const index = tabAt(pathname);
  const current = Math.max(0, index);
  const search = tabs[index]?.search;
  // Phones: a round glass search button beside the floating bar (iOS 26 pattern, owner Nov 2, 2026). Opening it swaps
  // the bar for a field that rides above the keyboard; closing clears the search.
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = !desktop && searchOpen && !!search;
  const keyboard = useKeyboardInset(searching);
  const hidden = useChromeHidden() && !searching;
  const barWidth = Math.min(width - space.md * 2, 504);
  const barLeft = (width - barWidth) / 2;
  const barBottom = Math.max(insets.bottom, space.sm) + 4;
  const fieldBottom = keyboard > 0 ? keyboard + space.sm : barBottom;
  // Remember the tab (with its view, e.g. World's chosen person) for a Back that has no history to pop.
  const query = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString();
  useEffect(() => {
    if (index >= 0) rememberTab(query ? `${pathname}?${query}` : pathname);
  }, [index, pathname, query]);

  // On desktop the triggers stay mounted (Tabs needs them for routing) but hidden; TopNav is the visible bar.
  // Phones: a floating rounded glass bar (owner, Nov 2, 2026) that slides away while you scroll down a page. The glass
  // is styled on the TabList row itself: Tabs only finds triggers in a TabList that is its direct child.
  const list = (
    <TabList asChild>
      <View
        accessibilityRole="tablist"
        pointerEvents={hidden || searching ? 'none' : 'auto'}
        aria-hidden={!desktop && (hidden || searching)}
        style={
          desktop
            ? styles.hidden
            : StyleSheet.flatten([
                styles.bottom,
                {
                  bottom: barBottom,
                  left: barLeft,
                  width: search ? barWidth - BUTTON - space.sm : barWidth,
                  opacity: hidden || searching ? 0 : 1,
                  transform: hidden && !reduceMotion ? 'translate3d(0,140%,0)' : searching && !reduceMotion ? 'scale(0.96)' : 'translate3d(0,0,0)',
                  transition: reduceMotion ? 'opacity 120ms linear' : 'opacity 240ms ease, transform 320ms cubic-bezier(.2,.8,.2,1)',
                } as unknown as ViewStyle,
              ])
        }>
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
      {/* Phones: dark blurred fade under the floating bar, fading out with it. Before the bar, so the bar sits on top. */}
      {!desktop && (
        <View
          pointerEvents="none"
          aria-hidden
          style={[styles.bottomScrim, scrim('top') as object, { opacity: hidden ? 0 : 1, transition: 'opacity 240ms ease' } as object]}
        />
      )}
      <TabSlot style={styles.slot} renderFn={(d, o) => <EasedScreen key={d.route.key} descriptor={d} options={o} current={current} />} />
      {!desktop && list}
      {!desktop && search && !searching && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search"
          aria-hidden={hidden}
          pointerEvents={hidden ? 'none' : 'auto'}
          onPress={() => setSearchOpen(true)}
          style={[
            styles.searchButton,
            {
              left: barLeft + barWidth - BUTTON,
              bottom: barBottom,
              opacity: hidden ? 0 : 1,
              transform: hidden && !reduceMotion ? 'translate3d(0,140%,0)' : 'translate3d(0,0,0)',
              transition: reduceMotion ? 'opacity 120ms linear' : 'opacity 240ms ease, transform 320ms cubic-bezier(.2,.8,.2,1)',
            } as unknown as ViewStyle,
          ]}>
          {({ pressed }) => (
            <Glass radius={BUTTON / 2} style={[styles.searchButtonGlass, pressed && styles.pressed]}>
              <Icon name={icons.search} size={24} tint={color.text} />
            </Glass>
          )}
        </Pressable>
      )}
      {searching && (
        <>
          <SearchSuggestions
            context={search}
            onPicked={() => setSearchOpen(false)}
            style={[styles.phoneSuggestions, { left: barLeft, width: barWidth, bottom: fieldBottom + BUTTON + space.sm }]}
          />
          <SearchField
            context={search}
            autoFocus
            onDismiss={() => setSearchOpen(false)}
            style={[styles.phoneField, { left: barLeft, width: barWidth, bottom: fieldBottom }]}
          />
        </>
      )}
    </Tabs>
  );
}

// One scene, not pages (owner, Nov 1, 2026): every visited tab stays mounted in the same frame. Changing tabs fades the
// new view in while it slides a little from the side you're heading to, and the old one drifts away and fades out; the
// planet behind keeps going. Hidden views can't be tapped, focused or read. Reduced motion: an instant swap.
/** The phone search button: as tall as the floating bar (52 + 2 × 6 padding). */
const BUTTON = 64;
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
              !desktop && isFocused && styles.bottomTabActive,
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
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 140, zIndex: 19 },
  topSearch: { width: 280, marginLeft: space.sm, position: 'relative' },
  topField: { minHeight: minTouch - 4 },
  topSuggestions: { position: 'absolute', top: minTouch + 4, right: 0, width: 360, zIndex: 30 },
  searchButton: { position: 'absolute', width: BUTTON, height: BUTTON, zIndex: 20 },
  searchButtonGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.94 }] },
  phoneField: { position: 'absolute', minHeight: BUTTON, zIndex: 21 },
  phoneSuggestions: { position: 'absolute', zIndex: 21, maxHeight: 420, overflow: 'hidden' },
  bottom: {
    position: 'absolute',
    zIndex: 20,
    flexDirection: 'row',
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: glass.tint,
    ...({ backdropFilter: glass.backdrop, WebkitBackdropFilter: glass.backdrop, boxShadow: `${glass.highlight}, ${glass.shadow}` } as unknown as ViewStyle),
  },
  bottomTab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 52, justifyContent: 'center', borderRadius: radius.pill },
  // Active tab: a rounded light pill inside the bar.
  bottomTabActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  bottomLabel: { fontFamily: font.medium, fontSize: 11 },
});
